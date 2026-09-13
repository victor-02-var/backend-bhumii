'use strict';
const supabase = require('../../config/supabase');
const { sendAlertEmail } = require('../../utils/mailer');
const { getPagination, paginatedResponse } = require('../../utils/pagination');

/**
 * Trigger background check for project warnings & critical thresholds:
 * 1. Section 11 Lapse Watch (< 45 days)
 * 2. Risk threshold cross (risk >= 70%)
 * 3. Compensation stall (comp < 30% after 90 days of award)
 * 4. R&R Possession conflict (rehab < 50% & possession > 70%)
 */
async function runAlertCheckCron() {
  console.log('[Alert Cron] Running automated risk & milestone threshold scan...');

  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        *,
        assigned_officer:users!assigned_officer_id (id, email, full_name),
        predictions (
          risk_score,
          risk_category,
          top_delay_factors,
          is_active
        )
      `);

    if (error) {
      console.error('[Alert Cron] Error fetching projects:', error);
      return;
    }

    const createdAlerts = [];

    for (const project of (projects || [])) {
      const activePred = project.predictions?.find(p => p.is_active) || project.predictions?.[0];
      const riskScore = activePred ? parseFloat(activePred.risk_score) : 0;
      const officer = project.assigned_officer;

      // 1. Section 11 Lapse Check
      if (project.section_11_lapse_date && !project.section_19_date) {
        const lapseDate = new Date(project.section_11_lapse_date);
        const today = new Date();
        const diffDays = Math.ceil((lapseDate - today) / (1000 * 60 * 60 * 24));

        if (diffDays <= 45 && diffDays > 0) {
          const message = `Section 11 Notification for project "${project.project_name}" will lapse in ${diffDays} days on ${project.section_11_lapse_date}! Section 19 declaration must be published immediately to avoid statutory lapse.`;
          
          await createAndSendAlert({
            project_id: project.id,
            alert_type: 'section11_lapse',
            severity: diffDays <= 15 ? 'CRITICAL' : 'WARNING',
            message,
            recipient_user_id: officer?.id,
            officer_email: officer?.email,
            officer_name: officer?.full_name,
            project_name: project.project_name,
            risk_score: riskScore,
            delay_factors: activePred?.top_delay_factors || []
          });
        }
      }

      // 2. High Risk Threshold Cross (Risk >= 70)
      if (riskScore >= 70) {
        const severity = riskScore >= 85 ? 'CRITICAL' : 'WARNING';
        const message = `Project "${project.project_name}" has crossed high delay risk threshold (${riskScore}% risk - ${activePred?.risk_category || 'High'}). Immediate corrective intervention required.`;

        await createAndSendAlert({
          project_id: project.id,
          alert_type: 'risk_threshold',
          severity,
          message,
          recipient_user_id: officer?.id,
          officer_email: officer?.email,
          officer_name: officer?.full_name,
          project_name: project.project_name,
          risk_score: riskScore,
          delay_factors: activePred?.top_delay_factors || []
        });
      }

      // 3. Compensation Stall Check
      const compPct = parseFloat(project.compensation_disbursement_pct || 0);
      if (project.award_date && compPct < 30) {
        const awardDate = new Date(project.award_date);
        const daysSinceAward = Math.ceil((new Date() - awardDate) / (1000 * 60 * 60 * 24));

        if (daysSinceAward > 90) {
          const message = `Compensation disbursement for "${project.project_name}" is stalled at ${compPct}% despite ${daysSinceAward} days passed since Award publication.`;

          await createAndSendAlert({
            project_id: project.id,
            alert_type: 'comp_stall',
            severity: 'WARNING',
            message,
            recipient_user_id: officer?.id,
            officer_email: officer?.email,
            officer_name: officer?.full_name,
            project_name: project.project_name,
            risk_score: riskScore,
            delay_factors: activePred?.top_delay_factors || []
          });
        }
      }

      // 4. R&R Possession Conflict
      const rehabPct = parseFloat(project.rehabilitation_progress_pct || 0);
      const possPct = parseFloat(project.possession_status_pct || 0);
      if (possPct > 70 && rehabPct < 50) {
        const message = `Possession status is ${possPct}% while Rehabilitation is lagging at ${rehabPct}% for project "${project.project_name}". High risk of civil resistance & stay orders.`;

        await createAndSendAlert({
          project_id: project.id,
          alert_type: 'rr_warning',
          severity: 'CRITICAL',
          message,
          recipient_user_id: officer?.id,
          officer_email: officer?.email,
          officer_name: officer?.full_name,
          project_name: project.project_name,
          risk_score: riskScore,
          delay_factors: activePred?.top_delay_factors || []
        });
      }
    }

    console.log('[Alert Cron] Scan completed successfully.');
  } catch (err) {
    console.error('[Alert Cron] Error running alert cron:', err);
  }
}

/** Helper to insert alert into DB and optionally trigger email */
async function createAndSendAlert(alertPayload) {
  // Check if identical active alert already sent today to avoid spamming
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: existing } = await supabase
    .from('alerts')
    .select('id')
    .eq('project_id', alertPayload.project_id)
    .eq('alert_type', alertPayload.alert_type)
    .gte('created_at', todayStart.toISOString())
    .maybeSingle();

  if (existing) return; // Alert already issued today

  // Insert alert DB record
  const { data: alertRecord, error } = await supabase
    .from('alerts')
    .insert({
      project_id: alertPayload.project_id,
      alert_type: alertPayload.alert_type,
      severity: alertPayload.severity,
      message: alertPayload.message,
      recipient_user_id: alertPayload.recipient_user_id || null,
      is_sent: !!alertPayload.officer_email
    })
    .select()
    .single();

  if (error) {
    console.error('[Alert Engine] Error inserting alert:', error);
    return;
  }

  // Send real email if recipient officer email exists
  if (alertPayload.officer_email) {
    try {
      await sendAlertEmail({
        to: alertPayload.officer_email,
        officerName: alertPayload.officer_name || 'Officer',
        projectName: alertPayload.project_name,
        alertType: alertPayload.alert_type,
        severity: alertPayload.severity,
        message: alertPayload.message,
        riskScore: alertPayload.risk_score,
        delayFactors: alertPayload.delay_factors
      });
    } catch (mailErr) {
      console.error('[Alert Engine] Failed to dispatch email notification:', mailErr.message);
    }
  }
}

/** Get user alerts */
async function getUserAlerts(userId, query) {
  const { page, limit, from, to } = getPagination(query);

  let q = supabase
    .from('alerts')
    .select('*, projects(project_name, project_id, state, district)', { count: 'exact' })
    .or(`recipient_user_id.eq.${userId},recipient_user_id.is.null`)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query.severity) q = q.eq('severity', query.severity);
  if (query.unread_only === 'true') q = q.is('read_at', null);

  const { data, count, error } = await q;
  if (error) throw error;

  return paginatedResponse(data, count, page, limit);
}

/** Get all alerts for administrative oversight */
async function getAllAlerts(query) {
  const { page, limit, from, to } = getPagination(query);

  let q = supabase
    .from('alerts')
    .select('*, projects(project_name, project_id, state, district), recipient:users!recipient_user_id(full_name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query.severity) q = q.eq('severity', query.severity);
  if (query.alert_type) q = q.eq('alert_type', query.alert_type);

  const { data, count, error } = await q;
  if (error) throw error;

  return paginatedResponse(data, count, page, limit);
}

/** Mark alert as read */
async function markAsRead(alertId, userId) {
  const { data, error } = await supabase
    .from('alerts')
    .update({ read_at: new Date().toISOString() })
    .eq('id', alertId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Dismiss an alert */
async function dismissAlert(alertId, userId) {
  const { data, error } = await supabase
    .from('alerts')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', alertId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Send a manual alert */
async function sendManualAlert(payload) {
  const { project_id, recipient_user_id, severity, message } = payload;

  const { data: recipient } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('id', recipient_user_id)
    .single();

  const { data: project } = await supabase
    .from('projects')
    .select('id, project_name')
    .eq('id', project_id)
    .single();

  await createAndSendAlert({
    project_id,
    alert_type: 'manual_dispatch',
    severity: severity || 'WARNING',
    message,
    recipient_user_id,
    officer_email: recipient?.email,
    officer_name: recipient?.full_name,
    project_name: project?.project_name || 'Project',
    risk_score: 0,
    delay_factors: []
  });

  return { success: true, message: 'Manual alert dispatched successfully' };
}

module.exports = {
  runAlertCheckCron,
  getUserAlerts,
  getAllAlerts,
  markAsRead,
  dismissAlert,
  sendManualAlert
};
