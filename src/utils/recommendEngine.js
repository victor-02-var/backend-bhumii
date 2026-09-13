'use strict';
/**
 * Recommendation Engine
 * Maps risk factor contributions to specific, actionable recommendations
 * Mirrors the PS requirement for "predictive recommendations suggesting corrective actions"
 */

const { addDays, formatDate } = require('./dateUtils');

/**
 * Generate prioritized recommendations based on top delay factors and project data
 * @param {Array} topDelayFactors - from riskEngine output
 * @param {Object} project - full project record
 * @param {Object} prediction - latest prediction record
 * @returns {Array} recommendations sorted by priority
 */
function generateRecommendations(topDelayFactors, project, prediction) {
  const recommendations = [];
  const now = new Date();

  for (const factor of topDelayFactors) {
    switch (factor.key) {
      case 'section11_lapse_proximity': {
        const daysLeft = prediction.days_remaining_to_lapse;
        if (daysLeft !== null && daysLeft < 90) {
          recommendations.push({
            priority: daysLeft < 30 ? 'URGENT' : 'HIGH',
            action: `Issue Section 19 Declaration immediately — Section 11 lapses in ${daysLeft} day(s). Lapse forces full process restart (1–3 year delay).`,
            deadline: formatDate(addDays(now, Math.max(1, daysLeft - 7))),
            owner: 'District Collector / State Revenue Department',
            category: 'notification',
          });
        }
        break;
      }

      case 'compensation_disbursement_pct': {
        const pendingPct = 100 - Number(project.compensation_disbursement_pct || 0);
        const pendingCrore = pendingPct > 0 && project.compensation_budget_crore
          ? ((pendingPct / 100) * project.compensation_budget_crore).toFixed(2)
          : null;
        recommendations.push({
          priority: pendingPct > 70 ? 'URGENT' : pendingPct > 40 ? 'HIGH' : 'MEDIUM',
          action: `Expedite compensation disbursement for landowners — only ${(100 - pendingPct).toFixed(0)}% paid${pendingCrore ? ` (₹${pendingCrore} Cr pending)` : ''}. Unpaid landowners refuse to vacate land.`,
          deadline: formatDate(addDays(now, 15)),
          owner: 'Land Acquisition Collector / District Collector',
          category: 'compensation',
        });
        break;
      }

      case 'num_legal_disputes': {
        const disputes = project.num_legal_disputes || 0;
        recommendations.push({
          priority: disputes > 5 ? 'URGENT' : 'HIGH',
          action: `Assign dedicated legal team to expedite ${disputes} active court case(s). Engage LARR Authority for fast-track hearing. Unresolved cases hold possession.`,
          deadline: formatDate(addDays(now, 7)),
          owner: 'State Legal Department / Project Authority',
          category: 'legal',
        });
        break;
      }

      case 'rr_possession_conflict': {
        const rrPct = Number(project.rehabilitation_progress_pct || 0);
        const possPct = Number(project.possession_status_pct || 0);
        recommendations.push({
          priority: 'URGENT',
          action: `Halt possession activities until R&R compliance improves. R&R is ${rrPct.toFixed(0)}% complete while possession is ${possPct.toFixed(0)}% — courts will grant stay orders if R&R is inadequate.`,
          deadline: formatDate(addDays(now, 5)),
          owner: 'R&R Authority / District Collector',
          category: 'rehabilitation',
        });
        break;
      }

      case 'rehabilitation_progress_pct': {
        const rrPct = Number(project.rehabilitation_progress_pct || 0);
        recommendations.push({
          priority: rrPct < 25 ? 'HIGH' : 'MEDIUM',
          action: `Accelerate R&R plan implementation — only ${rrPct.toFixed(0)}% complete. Allocate additional budget and personnel for resettlement of ${project.num_affected_families || 'affected'} families.`,
          deadline: formatDate(addDays(now, 21)),
          owner: 'State R&R Authority',
          category: 'rehabilitation',
        });
        break;
      }

      case 'num_pending_documents': {
        const docs = project.num_pending_documents || 0;
        recommendations.push({
          priority: docs > 10 ? 'HIGH' : 'MEDIUM',
          action: `Submit ${docs} pending document(s) to District Collector. Missing documentation blocks approval progression. Appoint dedicated documentation officer.`,
          deadline: formatDate(addDays(now, 10)),
          owner: 'Project Authority / District Officer',
          category: 'documentation',
        });
        break;
      }

      case 'num_approvals_pending': {
        const approvals = project.num_approvals_pending || 0;
        recommendations.push({
          priority: 'MEDIUM',
          action: `Follow up on ${approvals} pending inter-departmental approval(s). Escalate to Secretary-level if pending for > 30 days. Consider invoking fast-track approval provisions.`,
          deadline: formatDate(addDays(now, 14)),
          owner: 'Project Authority / Ministry',
          category: 'approval',
        });
        break;
      }

      case 'court_case_pending': {
        if (project.court_case_pending) {
          recommendations.push({
            priority: 'HIGH',
            action: 'Engage senior government counsel to oppose stay application / writ petition. Ensure affidavit-in-reply is filed within court-stipulated time to prevent automatic stay.',
            deadline: formatDate(addDays(now, 7)),
            owner: 'State Advocate General / Government Pleader',
            category: 'legal',
          });
        }
        break;
      }

      case 'compensation_market_ratio': {
        const ratio = Number(project.compensation_market_ratio || 1);
        if (ratio < 0.85) {
          recommendations.push({
            priority: 'HIGH',
            action: `Revise compensation valuation — current offer is ${(ratio * 100).toFixed(0)}% of market value (below 85% threshold). Low valuation is leading to award contestation by landowners.`,
            deadline: formatDate(addDays(now, 20)),
            owner: 'Land Acquisition Collector / Revenue Department',
            category: 'compensation',
          });
        }
        break;
      }

      case 'inter_dept_coord_score': {
        const score = Number(project.inter_dept_coord_score || 5);
        if (score < 5) {
          recommendations.push({
            priority: 'MEDIUM',
            action: 'Schedule inter-departmental coordination meeting within 7 days. Appoint a nodal officer for cross-department communication. Poor coordination is creating approval bottlenecks.',
            deadline: formatDate(addDays(now, 7)),
            owner: 'Project Monitoring Unit / District Collector',
            category: 'admin',
          });
        }
        break;
      }

      case 'officer_efficiency_score': {
        const score = Number(project.officer_efficiency_score || 5);
        if (score < 4) {
          recommendations.push({
            priority: 'MEDIUM',
            action: 'Consider reassigning case to a higher-performing officer or appoint a deputy. Current officer efficiency score is below acceptable threshold, creating processing delays.',
            deadline: formatDate(addDays(now, 14)),
            owner: 'District Collector / State Revenue Dept',
            category: 'admin',
          });
        }
        break;
      }

      case 'tribal_area_flag': {
        if (project.tribal_area_flag) {
          recommendations.push({
            priority: 'HIGH',
            action: 'Obtain Gram Sabha consent under PESA Act / FRA 2006 before proceeding. Engage Tribal Affairs Department and ensure Forest Rights Act compliance to prevent litigation.',
            deadline: formatDate(addDays(now, 30)),
            owner: 'Tribal Affairs Department / District Collector',
            category: 'legal',
          });
        }
        break;
      }

      case 'days_in_current_stage': {
        const stage = project.current_stage || 'Unknown';
        recommendations.push({
          priority: 'MEDIUM',
          action: `Current stage (${stage}) has exceeded expected duration. Conduct internal audit to identify specific bottleneck. Set a 2-week deadline for stage completion and escalate if not met.`,
          deadline: formatDate(addDays(now, 14)),
          owner: 'District Officer / Project Manager',
          category: 'admin',
        });
        break;
      }
    }
  }

  // Sort by priority
  const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return recommendations.sort(
    (a, b) => (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4)
  );
}

module.exports = { generateRecommendations };
