'use strict';
const supabase = require('../../config/supabase');
const { format: csvFormat } = require('fast-csv');
const { generateRecommendations } = require('../../utils/recommendEngine');

/**
 * POST /api/v1/external/ml-webhook
 * Receive prediction output payload from external Python ML microservice (FastAPI/Flask)
 */
async function receiveMLWebhook(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.ML_API_KEY || 'sih-ml-secret-key';

    if (apiKey !== expectedKey) {
      return res.status(401).json({ success: false, error: 'Unauthorized ML Webhook call' });
    }

    const {
      project_id,
      risk_score,
      delay_probability,
      risk_category,
      model_version,
      shap_values,
      top_delay_factors
    } = req.body;

    if (!project_id || risk_score === undefined) {
      return res.status(400).json({ success: false, error: 'Missing project_id or risk_score' });
    }

    // 1. Deactivate old predictions for project
    await supabase
      .from('predictions')
      .update({ is_active: false })
      .eq('project_id', project_id);

    // 2. Insert new ML prediction record
    const { data: newPred, error: predErr } = await supabase
      .from('predictions')
      .insert({
        project_id,
        risk_score,
        delay_probability: delay_probability || (risk_score / 100),
        risk_category: risk_category || (risk_score >= 85 ? 'Critical' : risk_score >= 70 ? 'High' : risk_score >= 40 ? 'Medium' : 'Low'),
        predicted_by: 'ml_model',
        model_version: model_version || 'v1.0.0-python',
        shap_values: shap_values || {},
        top_delay_factors: top_delay_factors || [],
        is_active: true
      })
      .select()
      .single();

    if (predErr) throw predErr;

    // 3. Auto-generate recommendations based on ML top factors
    const recommendations = generateRecommendations(project_id, top_delay_factors || []);
    if (recommendations.length > 0) {
      const dbRecs = recommendations.map(r => ({
        ...r,
        prediction_id: newPred.id
      }));
      await supabase.from('recommendations').insert(dbRecs);
    }

    return res.status(200).json({
      success: true,
      message: 'ML prediction received and processed successfully',
      prediction_id: newPred.id
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/external/export/projects
 * Export all project data as CSV stream
 */
async function exportProjectsCSV(req, res, next) {
  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        project_id,
        project_name,
        project_type,
        state,
        district,
        total_land_area_ha,
        num_affected_families,
        current_stage,
        compensation_disbursement_pct,
        possession_status_pct,
        rehabilitation_progress_pct,
        num_legal_disputes,
        num_pending_documents,
        is_delayed,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="projects_export.csv"');

    const csvStream = csvFormat({ headers: true });
    csvStream.pipe(res);

    (projects || []).forEach(p => {
      csvStream.write(p);
    });

    csvStream.end();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/external/export/predictions
 * Export prediction audit log history as CSV stream
 */
async function exportPredictionsCSV(req, res, next) {
  try {
    const { data: predictions, error } = await supabase
      .from('predictions')
      .select(`
        id,
        risk_score,
        delay_probability,
        risk_category,
        predicted_by,
        model_version,
        created_at,
        projects(project_id, project_name, state, district)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="predictions_export.csv"');

    const csvStream = csvFormat({ headers: true });
    csvStream.pipe(res);

    (predictions || []).forEach(p => {
      csvStream.write({
        prediction_id: p.id,
        project_id: p.projects?.project_id || '',
        project_name: p.projects?.project_name || '',
        state: p.projects?.state || '',
        district: p.projects?.district || '',
        risk_score: p.risk_score,
        delay_probability: p.delay_probability,
        risk_category: p.risk_category,
        predicted_by: p.predicted_by,
        model_version: p.model_version,
        created_at: p.created_at
      });
    });

    csvStream.end();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/external/health
 * Public healthcheck endpoint for uptime monitors & container orchestrators
 */
function getHealth(req, res) {
  return res.status(200).json({
    status: 'UP',
    system: 'Predictive Analytics System for Early Detection of Land Acquisition Delays',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime()
  });
}

module.exports = {
  receiveMLWebhook,
  exportProjectsCSV,
  exportPredictionsCSV,
  getHealth
};
