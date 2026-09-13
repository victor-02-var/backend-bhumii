'use strict';
const supabase = require('../../config/supabase');
const { getPagination, paginatedResponse } = require('../../utils/pagination');

/**
 * GET /api/v1/audit/logs
 * Paginated list of audit trail logs
 */
async function getAuditLogs(req, res, next) {
  try {
    const { page, limit, from, to } = getPagination(req.query);

    let q = supabase
      .from('audit_logs')
      .select('*, user:users(id, full_name, email, role)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (req.query.action) q = q.eq('action', req.query.action);
    if (req.query.resource_type) q = q.eq('resource_type', req.query.resource_type);
    if (req.query.user_id) q = q.eq('user_id', req.query.user_id);

    const { data, count, error } = await q;
    if (error) throw error;

    return res.status(200).json(paginatedResponse(data, count, page, limit));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/audit/logs/project/:projectId
 * Audit trail for a specific project
 */
async function getProjectAuditLogs(req, res, next) {
  try {
    const { projectId } = req.params;
    const { page, limit, from, to } = getPagination(req.query);

    const { data, count, error } = await supabase
      .from('audit_logs')
      .select('*, user:users(id, full_name, email, role)', { count: 'exact' })
      .eq('resource_type', 'project')
      .eq('resource_id', projectId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return res.status(200).json(paginatedResponse(data, count, page, limit));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAuditLogs,
  getProjectAuditLogs
};
