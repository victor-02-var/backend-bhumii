'use strict';
/**
 * Risk Engine — Rule-based delay risk scoring for land acquisition projects
 *
 * Design: SHAP-inspired weighted contribution model.
 * Each feature has a weight. The engine computes a weighted sum, then normalizes
 * to a 0–100 risk score. It also returns individual factor contributions
 * (the "SHAP-like" breakdown) for explainability.
 *
 * When your ML model is ready, replace the `computeRiskScore` call in
 * predictions.service.js with the ML API call. The output format stays the same.
 *
 * Feature weights are calibrated based on LARR Act 2013 domain knowledge:
 * - Section 11 lapse proximity is the single most critical feature
 * - Compensation disbursement and legal disputes are the top delay causes
 */

const RISK_THRESHOLDS = {
  Low: 35,
  Medium: 55,
  High: 75,
  Critical: 100,
};

/**
 * FEATURE WEIGHT TABLE
 * Each key corresponds to a project field.
 * Higher weight = more impact on the risk score.
 * direction: 'inverse' means a LOWER value = HIGHER risk (e.g., low compensation = high risk)
 * direction: 'direct' means a HIGHER value = HIGHER risk (e.g., more disputes = higher risk)
 */
const FEATURE_CONFIG = [
  // ─── CRITICAL FEATURES ─────────────────────────────────────────────────────
  {
    key: 'section11_lapse_proximity',
    label: 'Section 11 Lapse Risk',
    weight: 0.18,
    direction: 'direct',
    description: 'Proximity to Section 11 lapse deadline (12-month limit). Lapse causes full process restart.',
    category: 'notification',
  },
  {
    key: 'compensation_disbursement_pct',
    label: 'Compensation Disbursement',
    weight: 0.15,
    direction: 'inverse',
    description: 'Percentage of total compensation paid to affected landowners. Low disbursement blocks possession.',
    category: 'compensation',
  },
  {
    key: 'num_legal_disputes',
    label: 'Active Legal Disputes',
    weight: 0.13,
    direction: 'direct',
    description: 'Number of active court cases. Legal stays can freeze project progress indefinitely.',
    category: 'legal',
  },

  // ─── HIGH IMPACT ────────────────────────────────────────────────────────────
  {
    key: 'possession_status_pct',
    label: 'Land Possession Status',
    weight: 0.10,
    direction: 'inverse',
    description: 'Percentage of land physically in government possession. Low possession delays construction start.',
    category: 'possession',
  },
  {
    key: 'rehabilitation_progress_pct',
    label: 'R&R Progress',
    weight: 0.09,
    direction: 'inverse',
    description: 'Rehabilitation & Resettlement plan progress. Incomplete R&R can lead to court-imposed possession stays.',
    category: 'rehabilitation',
  },
  {
    key: 'rr_possession_conflict',
    label: 'R&R vs Possession Conflict',
    weight: 0.08,
    direction: 'direct',
    description: 'Possession advancing faster than R&R — legal risk of stay order.',
    category: 'rehabilitation',
  },
  {
    key: 'days_in_current_stage',
    label: 'Stage Duration',
    weight: 0.08,
    direction: 'direct',
    description: 'Days spent in current LARR stage vs. expected duration. Stage overrun signals process delay.',
    category: 'admin',
  },

  // ─── MODERATE IMPACT ────────────────────────────────────────────────────────
  {
    key: 'num_pending_documents',
    label: 'Pending Documentation',
    weight: 0.06,
    direction: 'direct',
    description: 'Number of incomplete or missing legal/administrative documents.',
    category: 'documentation',
  },
  {
    key: 'num_approvals_pending',
    label: 'Pending Approvals',
    weight: 0.05,
    direction: 'direct',
    description: 'Inter-departmental approvals awaiting sign-off. Bureaucratic bottleneck indicator.',
    category: 'approval',
  },
  {
    key: 'court_case_pending',
    label: 'Active Court Case',
    weight: 0.05,
    direction: 'direct',
    description: 'Binary flag for any pending court case (HC/SC writ, LARR Authority reference).',
    category: 'legal',
  },

  // ─── CONTEXTUAL FEATURES ────────────────────────────────────────────────────
  {
    key: 'compensation_market_ratio',
    label: 'Compensation Fairness',
    weight: 0.04,
    direction: 'inverse',
    description: 'Ratio of offered compensation to market value. Low ratio (<0.8) drives contestation and delays.',
    category: 'compensation',
  },
  {
    key: 'inter_dept_coord_score',
    label: 'Inter-dept Coordination',
    weight: 0.04,
    direction: 'inverse',
    description: 'Score (1-10) for coordination between departments. Low score = bureaucratic delay risk.',
    category: 'admin',
  },
  {
    key: 'officer_efficiency_score',
    label: 'Officer Efficiency',
    weight: 0.04,
    direction: 'inverse',
    description: 'Historical efficiency score (1-10) of assigned officer. Poor performers delay processing.',
    category: 'admin',
  },
  {
    key: 'historical_delay_score_district',
    label: 'District Delay History',
    weight: 0.03,
    direction: 'direct',
    description: 'Average delay rate for this district from historical projects. Structural risk indicator.',
    category: 'admin',
  },
  {
    key: 'tribal_area_flag',
    label: 'Tribal Land Risk',
    weight: 0.03,
    direction: 'direct',
    description: 'Project involves tribal/Schedule V land. Highest legal protection — prone to litigation.',
    category: 'legal',
  },
  {
    key: 'num_objections_filed',
    label: 'Objections Filed',
    weight: 0.02,
    direction: 'direct',
    description: 'Number of formal objections filed during Section 15 hearing period.',
    category: 'notification',
  },
  {
    key: 'election_year',
    label: 'Election Year',
    weight: 0.02,
    direction: 'direct',
    description: 'Projects started in election years face politically motivated delays.',
    category: 'admin',
  },
  {
    key: 'villages_hearing_pending',
    label: 'Pending SIA Hearings',
    weight: 0.01,
    direction: 'direct',
    description: 'Number of villages where public hearings are still pending (SIA stage).',
    category: 'admin',
  },
];

// Expected stage durations in days (for `days_in_current_stage` normalization)
const STAGE_EXPECTED_DAYS = {
  Stage_0: 60,
  Stage_1: 90,
  Stage_2: 180, // 6-month legal limit
  Stage_3: 30,
  Stage_4: 60,
  Stage_5: 60,
  Stage_6: 120,
  Stage_7: 90,
  Stage_8: 180,
  Stage_9: 365,
};

/**
 * Normalize a feature value to 0–1 risk contribution
 * @param {number} value - raw value
 * @param {string} direction - 'direct' | 'inverse'
 * @param {number} [min=0] - expected minimum
 * @param {number} [max=100] - expected maximum
 */
function normalize(value, direction, min = 0, max = 100) {
  if (value === null || value === undefined) return 0.5; // default: medium uncertainty
  const clamped = Math.max(min, Math.min(max, Number(value)));
  const ratio = (clamped - min) / (max - min || 1);
  return direction === 'inverse' ? 1 - ratio : ratio;
}

/**
 * Derive computed features from raw project data
 */
function deriveFeatures(project) {
  const now = new Date();

  // Section 11 lapse proximity (0 = far away, 1 = at/past deadline)
  let section11LapseProximity = 0;
  if (project.section_11_date && !project.section_19_issued) {
    const lapseDate = new Date(project.section_11_lapse_date || project.section_11_date);
    lapseDate.setFullYear(lapseDate.getFullYear() + 1);
    const totalWindow = 365; // 12 months in days
    const daysRemaining = Math.max(0, (lapseDate - now) / (1000 * 60 * 60 * 24));
    const daysElapsed = totalWindow - daysRemaining;
    section11LapseProximity = Math.min(1, daysElapsed / totalWindow);
    // Critical escalation: < 45 days → spike
    if (daysRemaining > 0 && daysRemaining < 45) {
      section11LapseProximity = Math.min(1, section11LapseProximity + 0.3);
    } else if (daysRemaining <= 0) {
      section11LapseProximity = 1; // Lapsed!
    }
  }

  // R&R vs possession conflict score (0 = no conflict, 1 = severe conflict)
  const possessionPct = Number(project.possession_status_pct || 0);
  const rrPct = Number(project.rehabilitation_progress_pct || 0);
  const rrPossessionConflict =
    possessionPct > 40 ? Math.max(0, (possessionPct - rrPct) / 100) : 0;

  // Stage overrun ratio
  const expectedDays = STAGE_EXPECTED_DAYS[project.current_stage] || 90;
  const actualDays = Number(project.days_in_current_stage || 0);
  const stageOverrunRatio = Math.min(1, actualDays / expectedDays);

  return {
    section11_lapse_proximity: section11LapseProximity,
    rr_possession_conflict: rrPossessionConflict,
    days_in_current_stage: stageOverrunRatio,
    // Pass through normalized fields
    compensation_disbursement_pct: project.compensation_disbursement_pct || 0,
    num_legal_disputes: project.num_legal_disputes || 0,
    possession_status_pct: project.possession_status_pct || 0,
    rehabilitation_progress_pct: project.rehabilitation_progress_pct || 0,
    num_pending_documents: project.num_pending_documents || 0,
    num_approvals_pending: project.num_approvals_pending || 0,
    court_case_pending: project.court_case_pending ? 1 : 0,
    compensation_market_ratio: project.compensation_market_ratio || 1.0,
    inter_dept_coord_score: project.inter_dept_coord_score || 5,
    officer_efficiency_score: project.officer_efficiency_score || 5,
    historical_delay_score_district: project.historical_delay_score_district || 0.5,
    tribal_area_flag: project.tribal_area_flag ? 1 : 0,
    num_objections_filed: project.num_objections_filed || 0,
    election_year: project.election_year ? 1 : 0,
    villages_hearing_pending: project.villages_hearing_pending || 0,
  };
}

/**
 * Main scoring function
 * @param {Object} project - project record from DB
 * @returns {{ riskScore, delayProbability, riskCategory, topDelayFactors, featureScores, daysRemainingToLapse }}
 */
function computeRiskScore(project) {
  const derived = deriveFeatures(project);

  const factorResults = [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const fc of FEATURE_CONFIG) {
    const rawValue = derived[fc.key];
    let normalizedValue;

    // Feature-specific normalization bounds
    switch (fc.key) {
      case 'num_legal_disputes':
        normalizedValue = normalize(rawValue, fc.direction, 0, 10);
        break;
      case 'num_pending_documents':
        normalizedValue = normalize(rawValue, fc.direction, 0, 20);
        break;
      case 'num_approvals_pending':
        normalizedValue = normalize(rawValue, fc.direction, 0, 10);
        break;
      case 'compensation_market_ratio':
        normalizedValue = normalize(rawValue, fc.direction, 0.5, 1.5);
        break;
      case 'inter_dept_coord_score':
      case 'officer_efficiency_score':
        normalizedValue = normalize(rawValue, fc.direction, 1, 10);
        break;
      case 'historical_delay_score_district':
        normalizedValue = normalize(rawValue, fc.direction, 0, 1);
        break;
      case 'num_objections_filed':
        normalizedValue = normalize(rawValue, fc.direction, 0, 100);
        break;
      case 'villages_hearing_pending':
        normalizedValue = normalize(rawValue, fc.direction, 0, 20);
        break;
      default:
        // Pre-normalized 0-1 features
        normalizedValue = Math.max(0, Math.min(1, Number(rawValue) || 0));
    }

    const contribution = fc.weight * normalizedValue;
    weightedSum += contribution;
    totalWeight += fc.weight;

    factorResults.push({
      factor: fc.label,
      key: fc.key,
      weight: fc.weight,
      normalizedValue,
      contribution,
      description: fc.description,
      category: fc.category,
    });
  }

  // Normalize to 0-100 risk score
  const riskScore = Math.min(100, (weightedSum / totalWeight) * 100);

  // Classify
  let riskCategory = 'Low';
  if (riskScore >= 75) riskCategory = 'Critical';
  else if (riskScore >= 55) riskCategory = 'High';
  else if (riskScore >= 35) riskCategory = 'Medium';

  // Sort factors by contribution for top-N display
  const topDelayFactors = factorResults
    .filter((f) => f.contribution > 0.001)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5)
    .map(({ factor, key, contribution, description, category }) => ({
      factor,
      key,
      contribution: parseFloat(contribution.toFixed(4)),
      description,
      category,
    }));

  // Days remaining to Section 11 lapse (useful for UI countdown)
  let daysRemainingToLapse = null;
  if (project.section_11_date && !project.section_19_issued) {
    const lapseDate = new Date(project.section_11_date);
    lapseDate.setFullYear(lapseDate.getFullYear() + 1);
    daysRemainingToLapse = Math.ceil((lapseDate - new Date()) / (1000 * 60 * 60 * 24));
  }

  return {
    riskScore: parseFloat(riskScore.toFixed(2)),
    delayProbability: parseFloat((riskScore / 100).toFixed(4)),
    riskCategory,
    topDelayFactors,
    featureScores: factorResults.reduce((acc, f) => {
      acc[f.key] = parseFloat(f.normalizedValue.toFixed(4));
      return acc;
    }, {}),
    daysRemainingToLapse,
  };
}

/**
 * Simulate the effect of policy and resource interventions on a project's risk score
 * @param {Object} project - original project object
 * @param {Object} interventions - { compensationBoostPct, disputesResolved, slaoStaffAdded, stageAccelerationDays }
 */
function simulateIntervention(project, interventions = {}) {
  const original = computeRiskScore(project);

  const compBoost = Number(interventions.compensationBoostPct || 0);
  const disputesResolved = Number(interventions.disputesResolved || 0);
  const staffAdded = Number(interventions.slaoStaffAdded || 0);
  const daysAccelerated = Number(interventions.stageAccelerationDays || 0);

  // Construct modified project copy
  const modifiedProject = {
    ...project,
    compensation_disbursement_pct: Math.min(100, Math.max(0, Number(project.compensation_disbursement_pct || 0) + compBoost)),
    num_legal_disputes: Math.max(0, Number(project.num_legal_disputes || 0) - disputesResolved),
    court_case_pending: Math.max(0, Number(project.num_legal_disputes || 0) - disputesResolved) > 0,
    officer_efficiency_score: Math.min(10, Number(project.officer_efficiency_score || 5) + staffAdded * 0.8),
    days_in_current_stage: Math.max(0, Number(project.days_in_current_stage || 0) - daysAccelerated),
    inter_dept_coord_score: Math.min(10, Number(project.inter_dept_coord_score || 5) + (daysAccelerated > 0 ? 1.5 : 0)),
  };

  const simulated = computeRiskScore(modifiedProject);

  const riskDelta = parseFloat((original.riskScore - simulated.riskScore).toFixed(2));
  const delayProbDelta = parseFloat((original.delayProbability - simulated.delayProbability).toFixed(4));
  
  // Calculate projected days saved
  const projectedDaysSaved = Math.max(0, Math.round(riskDelta * 2.5 + staffAdded * 12 + daysAccelerated * 0.8 + compBoost * 1.2));
  
  // Calculate estimated financial cost savings (in ₹ Crore)
  const baseBudget = Number(project.compensation_budget_crore || project.project_cost_crore || 45.0);
  const projectedCostSavedCrore = parseFloat(Math.max(0, (riskDelta / 100) * baseBudget * 0.35 + (projectedDaysSaved * 0.04)).toFixed(2));

  return {
    original,
    simulated,
    interventions: {
      compensationBoostPct: compBoost,
      disputesResolved,
      slaoStaffAdded: staffAdded,
      stageAccelerationDays: daysAccelerated,
    },
    metrics: {
      riskScoreBefore: original.riskScore,
      riskScoreAfter: simulated.riskScore,
      riskDelta,
      delayProbabilityBefore: original.delayProbability,
      delayProbabilityAfter: simulated.delayProbability,
      delayProbDelta,
      riskCategoryBefore: original.riskCategory,
      riskCategoryAfter: simulated.riskCategory,
      projectedDaysSaved,
      projectedCostSavedCrore,
    },
  };
}

module.exports = { computeRiskScore, simulateIntervention, RISK_THRESHOLDS };

