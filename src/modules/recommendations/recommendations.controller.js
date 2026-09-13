'use strict';
const supabase = require('../../config/supabase');
const { getPagination, paginatedResponse } = require('../../utils/pagination');

/**
 * GET /api/v1/recommendations/project/:projectId
 * Get recommendations for a project
 */
async function getProjectRecommendations(req, res, next) {
  try {
    const { projectId } = req.params;

    const { data, error } = await supabase
      .from('recommendations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({ success: true, data: data || [] });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/recommendations/:id/status
 * Update status of recommendation (pending, in_progress, resolved, dismissed)
 */
async function updateRecommendationStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'in_progress', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const updates = {
      status,
      ...(status === 'resolved' ? { resolved_at: new Date().toISOString(), resolved_by: req.user.id } : {})
    };

    const { data, error } = await supabase
      .from('recommendations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/recommendations/priority/urgent
 * Get all URGENT recommendations
 */
async function getUrgentRecommendations(req, res, next) {
  try {
    const { page, limit, from, to } = getPagination(req.query);

    const { data, count, error } = await supabase
      .from('recommendations')
      .select('*, projects(project_name, project_id, state, district)', { count: 'exact' })
      .eq('priority', 'URGENT')
      .neq('status', 'resolved')
      .neq('status', 'dismissed')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return res.status(200).json(paginatedResponse(data, count, page, limit));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProjectRecommendations,
  updateRecommendationStatus,
  getUrgentRecommendations
};
