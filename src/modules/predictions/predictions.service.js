'use strict';
const supabase = require('../../config/supabase');
const { computeRiskScore } = require('../../utils/riskEngine');
const { generateRecommendations } = require('../../utils/recommendEngine');
const { getProjectById } = require('../projects/projects.service');
const { getPagination } = require('../../utils/pagination');
const { getScopeFilter } = require('../../middleware/rbac');
const { writeAuditLog } = require('../../middleware/audit');

/**
 * Call external ML model API if configured, otherwise use rule engine
 */
async function callMLModel(project) {
  const mlUrl = process.env.ML_SERVICE_URL;
  if (!mlUrl) return null;

  try {
    const response = await fetch(`${mlUrl}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.ML_API_KEY || '',
      },
      body: JSON.stringify(project),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    console.warn('[Predictions] ML model unavailable, falling back to rule engine.');
    return null;
  }
}

/**
 * Run prediction for a single project
 */
async function runPrediction(projectId, user, triggeredBy = 'manual') {
  const project = await getProjectById(projectId, user);

  // Try ML model first, fallback to rule engine
  let result = await callMLModel(project);
  let predictedBy = 'ml_model';

  if (!result) {
    result = computeRiskScore(project);
    predictedBy = 'rule_engine';
  }

  const { riskScore, delayProbability, riskCategory, topDelayFactors, featureScores, daysRemainingToLapse } = result;

  // Insert new prediction (DB trigger will deactivate old ones)
  const { data: prediction, error } = await supabase
    .from('predictions')
    .insert({
      project_id: projectId,
      risk_score: riskScore,
      delay_probability: delayProbability,
      risk_category: riskCategory,
      predicted_by: predictedBy,
      model_version: 'v1.0',
      top_delay_factors: topDelayFactors,
      feature_scores: featureScores,
      stage_at_prediction: project.current_stage,
      days_remaining_to_lapse: daysRemainingToLapse,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;

  // Generate and store recommendations
  const recommendations = generateRecommendations(topDelayFactors, project, prediction);
  if (recommendations.length > 0) {
    // Clear old pending recommendations for this project
    await supabase
      .from('recommendations')
      .update({ status: 'dismissed' })
      .eq('project_id', projectId)
      .eq('status', 'pending');

    await supabase.from('recommendations').insert(
      recommendations.map(r => ({
        project_id: projectId,
        prediction_id: prediction.id,
        ...r,
      }))
    );
  }

  await writeAuditLog({
    userId: user?.userId,
    action: 'TRIGGER_PREDICTION',
    resourceType: 'prediction',
    resourceId: prediction.id,
    summary: `Prediction run for project ${project.project_code} — ${riskCategory} (${riskScore}%)`,
  });

  return { prediction, recommendations };
}

/**
 * Run predictions for all active projects (batch)
 */
async function runBulkPredictions(user) {
  // Note: projects table has no 'status' column; we use is_delayed to filter
  // Run predictions for all projects (not just delayed ones)
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id');

  if (error) throw error;

  const results = { success: 0, failed: 0, total: projects.length };

  for (const project of projects) {
    try {
      await runPrediction(project.id, user, 'bulk');
      results.success++;
    } catch (err) {
      console.error(`[Predictions] Failed for project ${project.id}:`, err.message);
      results.failed++;
    }
  }

  return results;
}

async function getLatestPrediction(projectId, user) {
  await getProjectById(projectId, user); // scope check

  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const err = new Error('No prediction found for this project. Run a prediction first.');
    err.statusCode = 404;
    throw err;
  }
  return data;
}

async function getPredictionHistory(projectId, user) {
  await getProjectById(projectId, user); // scope check

  const { data, error } = await supabase
    .from('predictions')
    .select('id, risk_score, delay_probability, risk_category, predicted_by, stage_at_prediction, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

async function listAllPredictions(user, query) {
  const { from, to, page, limit } = getPagination(query);
  const scope = getScopeFilter(user);

  let q = supabase
    .from('predictions')
    .select(`
      *, 
      projects!inner(id, project_code, project_name, state, district, project_type, current_stage)
    `, { count: 'exact' })
    .eq('is_active', true)
    .order('risk_score', { ascending: false })
    .range(from, to);

  if (scope.district) q = q.eq('projects.district', scope.district);
  if (scope.state) q = q.eq('projects.state', scope.state);
  if (query.risk_category) q = q.eq('risk_category', query.risk_category);

  const { data, error, count } = await q;
  if (error) throw error;
  return { data, count, page, limit };
}

async function getNationalRiskSummary() {
  const { data, error } = await supabase
    .from('predictions')
    .select('risk_category, projects!inner(state)')
    .eq('is_active', true);

  if (error) throw error;

  const summary = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  const byState = {};

  for (const row of data) {
    summary[row.risk_category] = (summary[row.risk_category] || 0) + 1;
    const state = row.projects?.state || 'Unknown';
    if (!byState[state]) byState[state] = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    byState[state][row.risk_category]++;
  }

  return { total: data.length, byCategory: summary, byState };
}

async function getStateSummary(state) {
  const { data, error } = await supabase
    .from('predictions')
    .select('risk_score, risk_category, delay_probability, projects!inner(district, state)')
    .eq('is_active', true)
    .eq('projects.state', state);

  if (error) throw error;

  const byDistrict = {};
  for (const row of data) {
    const district = row.projects?.district || 'Unknown';
    if (!byDistrict[district]) byDistrict[district] = { count: 0, total_risk: 0, categories: {} };
    byDistrict[district].count++;
    byDistrict[district].total_risk += row.risk_score;
    const cat = row.risk_category;
    byDistrict[district].categories[cat] = (byDistrict[district].categories[cat] || 0) + 1;
  }

  // Compute avg risk per district
  return Object.entries(byDistrict).map(([district, d]) => ({
    district,
    avg_risk_score: parseFloat((d.total_risk / d.count).toFixed(2)),
    project_count: d.count,
    categories: d.categories,
  }));
}

async function getDistrictSummary(district) {
  const { data, error } = await supabase
    .from('predictions')
    .select('risk_score, risk_category, delay_probability, top_delay_factors, projects!inner(district, project_code, project_name)')
    .eq('is_active', true)
    .eq('projects.district', district);

  if (error) throw error;
  return data;
}

async function simulateProjectIntervention(projectId, interventions, user) {
  let project;
  if (projectId) {
    project = await getProjectById(projectId, user).catch(() => null);
  }
  if (!project) {
    // Return standard fallback model project for generic simulations
    project = {
      project_code: 'SIM-PROJ-01',
      project_name: 'Sample High-Risk Highway Corridor',
      compensation_disbursement_pct: 35,
      num_legal_disputes: 4,
      court_case_pending: true,
      possession_status_pct: 20,
      rehabilitation_progress_pct: 15,
      days_in_current_stage: 110,
      current_stage: 'Stage 5: Section 11 Notification',
      compensation_budget_crore: 65.0,
      inter_dept_coord_score: 4,
      officer_efficiency_score: 4,
    };
  }

  const { simulateIntervention } = require('../../utils/riskEngine');
  return simulateIntervention(project, interventions);
}

module.exports = {
  runPrediction,
  runBulkPredictions,
  getLatestPrediction,
  getPredictionHistory,
  listAllPredictions,
  getNationalRiskSummary,
  getStateSummary,
  getDistrictSummary,
  simulateProjectIntervention,
};

