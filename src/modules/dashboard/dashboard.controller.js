'use strict';
const supabase = require('../../config/supabase');
const { getScopeFilter } = require('../../middleware/rbac');

async function getStats(req, res, next) {
  try {
    const scope = getScopeFilter(req.user);

    // Build scoped project query
    let q = supabase.from('projects').select('id, is_delayed, current_stage', { count: 'exact' });
    if (scope.district) q = q.eq('district', scope.district);
    if (scope.state) q = q.eq('state', scope.state);

    const { data: projects, count, error } = await q;
    if (error) throw error;

    // Prediction stats
    let pq = supabase.from('predictions').select('risk_category', { count: 'exact' }).eq('is_active', true);
    if (scope.district || scope.state) {
      // Filter via join
      pq = supabase.from('predictions')
        .select('risk_category, projects!inner(state, district)', { count: 'exact' })
        .eq('is_active', true);
      if (scope.district) pq = pq.eq('projects.district', scope.district);
      if (scope.state) pq = pq.eq('projects.state', scope.state);
    }
    const { data: preds, count: predCount, error: pErr } = await pq;
    if (pErr) throw pErr;

    const riskDist = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    for (const p of (preds || [])) riskDist[p.risk_category]++;

    const completed = (projects || []).filter(p => p.current_stage === 'Stage 9: Possession & Compensation').length;
    const active = (projects || []).length - completed;
    const delayed = (projects || []).filter(p => p.is_delayed === true).length;
    const highRisk = (riskDist.High || 0) + (riskDist.Critical || 0);

    res.json({
      success: true,
      data: {
        total_projects: count,
        active_projects: active,
        completed_projects: completed,
        delayed_projects: delayed,
        delay_rate_pct: count > 0 ? parseFloat(((delayed / count) * 100).toFixed(1)) : 0,
        high_risk_projects: highRisk,
        predictions_run: predCount || 0,
        risk_distribution: riskDist,
      },
    });
  } catch (err) { next(err); }
}

async function getRiskDistribution(req, res, next) {
  try {
    const scope = getScopeFilter(req.user);
    let q = supabase.from('predictions').select('risk_category').eq('is_active', true);
    if (scope.state) {
      q = supabase.from('predictions')
        .select('risk_category, projects!inner(state, district)')
        .eq('is_active', true);
      if (scope.district) q = q.eq('projects.district', scope.district);
      else q = q.eq('projects.state', scope.state);
    }
    const { data, error } = await q;
    if (error) throw error;
    const dist = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    for (const d of (data || [])) dist[d.risk_category]++;
    res.json({ success: true, data: dist });
  } catch (err) { next(err); }
}

async function getDelayTrend(req, res, next) {
  try {
    const months = parseInt(req.query.months || '12', 10);
    const { data, error } = await supabase.rpc('get_monthly_delay_trend', { months_back: months }).catch(() => ({ data: null, error: true }));

    if (!data || error) {
      // Fallback: compute from projects table
      const { data: projects, err2 } = await supabase
        .from('projects')
        .select('created_at, is_delayed')
        .gte('created_at', new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at');

      if (err2) throw err2;

      const trend = {};
      for (const p of (projects || [])) {
        const month = p.created_at?.substring(0, 7);
        if (!month) continue;
        if (!trend[month]) trend[month] = { month, total: 0, delayed: 0 };
        trend[month].total++;
        if (p.is_delayed) trend[month].delayed++;
      }

      return res.json({ success: true, data: Object.values(trend).sort((a, b) => a.month.localeCompare(b.month)) });
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getStageFunnel(req, res, next) {
  try {
    const scope = getScopeFilter(req.user);
    let q = supabase.from('projects').select('current_stage');
    if (scope.district) q = q.eq('district', scope.district);
    if (scope.state) q = q.eq('state', scope.state);

    const { data, error } = await q;
    if (error) throw error;

    const funnel = {};
    for (const p of (data || [])) {
      funnel[p.current_stage] = (funnel[p.current_stage] || 0) + 1;
    }

    const ordered = [
      'Stage 0: Pre-Notification',
      'Stage 1: Proposal Submission',
      'Stage 2: SIA & Public Hearing',
      'Stage 3: Section 4 Preliminary Notification',
      'Stage 4: Rehabilitation Survey',
      'Stage 5: Section 11 Notification',
      'Stage 6: R&R Scheme Approval',
      'Stage 7: Section 19 Declaration',
      'Stage 8: Award Determination',
      'Stage 9: Possession & Compensation'
    ];
    res.json({
      success: true,
      data: ordered.map(stage => ({ stage, count: funnel[stage] || 0 })),
    });
  } catch (err) { next(err); }
}

async function getTopDelayFactors(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('predictions')
      .select('top_delay_factors')
      .eq('is_active', true)
      .limit(200);

    if (error) throw error;

    const factorMap = {};
    for (const row of (data || [])) {
      for (const factor of (row.top_delay_factors || [])) {
        if (!factorMap[factor.factor]) factorMap[factor.factor] = { factor: factor.factor, category: factor.category, total_contribution: 0, count: 0 };
        factorMap[factor.factor].total_contribution += factor.contribution;
        factorMap[factor.factor].count++;
      }
    }

    const results = Object.values(factorMap)
      .map(f => ({ ...f, avg_contribution: parseFloat((f.total_contribution / f.count).toFixed(4)) }))
      .sort((a, b) => b.avg_contribution - a.avg_contribution)
      .slice(0, 10);

    res.json({ success: true, data: results });
  } catch (err) { next(err); }
}

async function getCompensationStatus(req, res, next) {
  try {
    const scope = getScopeFilter(req.user);
    let q = supabase.from('projects').select('state, district, compensation_disbursement_pct, project_budget_crore');
    if (scope.district) q = q.eq('district', scope.district);
    if (scope.state) q = q.eq('state', scope.state);

    const { data, error } = await q;
    if (error) throw error;

    // Buckets: 0-25%, 26-50%, 51-75%, 76-100%
    const buckets = { '0-25': 0, '26-50': 0, '51-75': 0, '76-100': 0 };
    let totalBudget = 0, totalDisbursed = 0;

    for (const p of (data || [])) {
      const pct = Number(p.compensation_disbursement_pct || 0);
      const budget = Number(p.project_budget_crore || 0);
      totalBudget += budget;
      totalDisbursed += budget * (pct / 100);

      if (pct <= 25) buckets['0-25']++;
      else if (pct <= 50) buckets['26-50']++;
      else if (pct <= 75) buckets['51-75']++;
      else buckets['76-100']++;
    }

    res.json({
      success: true,
      data: {
        total_projects: (data || []).length,
        disbursement_buckets: buckets,
        total_budget_crore: parseFloat(totalBudget.toFixed(2)),
        total_disbursed_crore: parseFloat(totalDisbursed.toFixed(2)),
        pending_crore: parseFloat((totalBudget - totalDisbursed).toFixed(2)),
      },
    });
  } catch (err) { next(err); }
}

async function getRRCompliance(req, res, next) {
  try {
    const scope = getScopeFilter(req.user);
    let q = supabase.from('projects').select('state, district, rehabilitation_progress_pct, possession_status_pct, num_affected_families');
    if (scope.district) q = q.eq('district', scope.district);
    if (scope.state) q = q.eq('state', scope.state);

    const { data, error } = await q;
    if (error) throw error;

    const conflicts = (data || []).filter(p =>
      Number(p.possession_status_pct || 0) > 40 &&
      Number(p.rehabilitation_progress_pct || 0) < Number(p.possession_status_pct || 0) - 20
    );

    res.json({
      success: true,
      data: {
        total_active: (data || []).length,
        rr_possession_conflicts: conflicts.length,
        conflict_projects: conflicts.map(p => ({ state: p.state, district: p.district, possession_pct: p.possession_status_pct, rr_pct: p.rehabilitation_progress_pct })),
        avg_rr_progress: (data || []).length > 0 ? parseFloat(((data || []).reduce((s, p) => s + Number(p.rehabilitation_progress_pct || 0), 0) / data.length).toFixed(1)) : 0,
      },
    });
  } catch (err) { next(err); }
}

async function getSection11Countdown(req, res, next) {
  try {
    const now = new Date();
    const threshold = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const scope = getScopeFilter(req.user);

    let q = supabase.from('projects')
      .select('id, project_id, project_name, state, district, section_11_date, section_11_lapse_date, current_stage')
      .is('section_19_date', null)
      .not('section_11_date', 'is', null)
      .lte('section_11_lapse_date', threshold.toISOString().split('T')[0])
      .order('section_11_lapse_date');

    if (scope.district) q = q.eq('district', scope.district);
    if (scope.state) q = q.eq('state', scope.state);

    const { data, error } = await q;
    if (error) throw error;

    res.json({
      success: true,
      data: data.map(p => ({
        ...p,
        days_remaining: Math.ceil((new Date(p.section_11_lapse_date) - now) / (1000 * 60 * 60 * 24)),
      })),
    });
  } catch (err) { next(err); }
}

async function getOfficerPerformance(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('officer_performance')
      .select('*, users!inner(full_name, email, state, district, designation)')
      .order('score', { ascending: false });

    if (error) {
      // Fallback if view is missing: derive performance from users & projects
      const { data: officers, error: uErr } = await supabase
        .from('users')
        .select('id, full_name, email, state, district, designation, role')
        .in('role', ['district_officer', 'collector']);
      
      if (uErr) throw uErr;

      const { data: projects, error: pErr } = await supabase
        .from('projects')
        .select('assigned_officer_id, is_delayed, officer_efficiency_score');
      
      if (pErr) throw pErr;

      const officerStats = (officers || []).map(u => {
        const userProjects = (projects || []).filter(p => p.assigned_officer_id === u.id);
        const total = userProjects.length;
        const delayed = userProjects.filter(p => p.is_delayed).length;
        const onTime = total - delayed;
        const avgEff = total > 0 
          ? userProjects.reduce((s, p) => s + (p.officer_efficiency_score || 5), 0) / total 
          : 7.5;
        const score = total > 0 ? parseFloat(((onTime / total) * 100).toFixed(1)) : 85.0;

        return {
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          state: u.state,
          district: u.district,
          designation: u.designation,
          total_projects: total,
          on_time_projects: onTime,
          delayed_projects: delayed,
          avg_efficiency_score: parseFloat(avgEff.toFixed(2)),
          score: score
        };
      }).sort((a, b) => b.score - a.score);

      return res.json({ success: true, data: officerStats });
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getComparativeAnalytics(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('predictions')
      .select('delay_probability, risk_score, projects!inner(state)')
      .eq('is_active', true);

    if (error) throw error;

    const byState = {};
    for (const row of (data || [])) {
      const state = row.projects?.state || 'Unknown';
      if (!byState[state]) byState[state] = { total: 0, risk_sum: 0, delay_prob_sum: 0 };
      byState[state].total++;
      byState[state].risk_sum += row.risk_score;
      byState[state].delay_prob_sum += row.delay_probability;
    }

    const result = Object.entries(byState).map(([state, d]) => ({
      state,
      project_count: d.total,
      avg_risk_score: parseFloat((d.risk_sum / d.total).toFixed(2)),
      avg_delay_probability: parseFloat((d.delay_prob_sum / d.total).toFixed(4)),
    })).sort((a, b) => b.avg_risk_score - a.avg_risk_score);

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

module.exports = {
  getStats, getRiskDistribution, getDelayTrend, getStageFunnel,
  getTopDelayFactors, getCompensationStatus, getRRCompliance,
  getSection11Countdown, getOfficerPerformance, getComparativeAnalytics,
};
