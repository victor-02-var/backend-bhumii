'use strict';
const supabase = require('../../config/supabase');
const { getPagination, paginatedResponse } = require('../../utils/pagination');

/**
 * GET /api/v1/officers
 * List all district officers & land acquisition collectors
 */
async function listOfficers(req, res, next) {
  try {
    const { page, limit, from, to } = getPagination(req.query);

    let q = supabase
      .from('users')
      .select('id, full_name, email, role, state, district, designation, phone, last_login', { count: 'exact' })
      .in('role', ['district_officer', 'collector'])
      .eq('is_active', true)
      .order('full_name', { ascending: true })
      .range(from, to);

    if (req.query.state) q = q.eq('state', req.query.state);
    if (req.query.district) q = q.eq('district', req.query.district);

    const { data, count, error } = await q;
    if (error) throw error;

    return res.status(200).json(paginatedResponse(data, count, page, limit));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/officers/:id/performance
 * Officer performance metrics (assigned projects count, resolution times, delay rate)
 */
async function getOfficerPerformance(req, res, next) {
  try {
    const { id } = req.params;

    // Get officer profile
    const { data: officer, error: officerErr } = await supabase
      .from('users')
      .select('id, full_name, email, role, state, district, designation')
      .eq('id', id)
      .single();

    if (officerErr || !officer) {
      return res.status(404).json({ success: false, error: 'Officer not found' });
    }

    // Fetch projects assigned to officer
    const { data: projects, error: projErr } = await supabase
      .from('projects')
      .select('id, project_id, project_name, current_stage, is_delayed, compensation_disbursement_pct, predictions(risk_score, is_active)')
      .eq('assigned_officer_id', id);

    if (projErr) throw projErr;

    const totalProjects = projects ? projects.length : 0;
    let delayedCount = 0;
    let totalRisk = 0;

    (projects || []).forEach(p => {
      if (p.is_delayed) delayedCount += 1;
      const activePred = p.predictions?.find(pr => pr.is_active) || p.predictions?.[0];
      if (activePred) totalRisk += parseFloat(activePred.risk_score);
    });

    const delayRatePct = totalProjects > 0 ? parseFloat(((delayedCount / totalProjects) * 100).toFixed(2)) : 0;
    const avgRiskScore = totalProjects > 0 ? parseFloat((totalRisk / totalProjects).toFixed(2)) : 0;
    
    // Performance rating out of 10 (inverse of risk score)
    const efficiencyRating = Math.max(1, parseFloat(((100 - avgRiskScore) / 10).toFixed(1)));

    return res.status(200).json({
      success: true,
      officer,
      metrics: {
        total_projects_assigned: totalProjects,
        delayed_projects_count: delayedCount,
        delay_rate_pct: delayRatePct,
        avg_project_risk_score: avgRiskScore,
        efficiency_rating: efficiencyRating
      },
      assigned_projects: projects || []
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listOfficers,
  getOfficerPerformance
};
