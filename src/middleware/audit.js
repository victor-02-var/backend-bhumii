'use strict';
/**
 * Audit Trail Middleware
 * Auto-logs reads and writes to the audit_logs table.
 * Used as route-level middleware on sensitive endpoints.
 */
const supabase = require('../config/supabase');

/**
 * Create audit middleware factory
 * @param {string} action - 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'TRIGGER_PREDICTION'
 * @param {string} resourceType - 'project' | 'prediction' | 'user' | 'alert' | 'recommendation' | 'auth' | 'system'
 * @param {Function} [getResourceId] - optional fn(req) => string to extract resource ID
 */
function auditLog(action, resourceType, getResourceId) {
  return async (req, res, next) => {
    // Attach audit writer to req for controllers to call after the fact
    req._auditMeta = { action, resourceType };

    // Intercept response to capture resource IDs from the response body
    const originalJson = res.json.bind(res);
    res.json = async function (body) {
      // Only log on success (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const resourceId = getResourceId
            ? String(getResourceId(req))
            : req.params.id || req.params.projectId || (body?.data?.id) || null;

          await supabase.from('audit_logs').insert({
            user_id: req.user?.userId || null,
            user_email: req.user?.email || null,
            action,
            resource_type: resourceType,
            resource_id: resourceId ? String(resourceId) : null,
            summary: `${action} ${resourceType}${resourceId ? ` [${resourceId}]` : ''}`,
            ip_address: req.ip || req.connection?.remoteAddress,
            user_agent: req.headers['user-agent']?.substring(0, 200),
          });
        } catch (auditErr) {
          // Audit failures must NOT break the main request
          console.error('[Audit] Failed to write audit log:', auditErr.message);
        }
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Standalone function for manual audit log writes inside controllers
 */
async function writeAuditLog({ userId, userEmail, action, resourceType, resourceId, summary, oldValue, newValue, req }) {
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId || null,
      user_email: userEmail || null,
      action,
      resource_type: resourceType,
      resource_id: resourceId ? String(resourceId) : null,
      summary,
      old_value: oldValue || null,
      new_value: newValue || null,
      ip_address: req?.ip || null,
      user_agent: req?.headers?.['user-agent']?.substring(0, 200) || null,
    });
  } catch (err) {
    console.error('[Audit] writeAuditLog error:', err.message);
  }
}

module.exports = { auditLog, writeAuditLog };
