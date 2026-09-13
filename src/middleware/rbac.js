'use strict';
/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Role hierarchy (ascending privilege):
 *   district_officer < collector < state_admin < central_admin < ministry
 *
 * Usage:
 *   router.get('/sensitive', authenticate, requireRole('collector'), handler)
 *   router.get('/admin', authenticate, requireRole(['central_admin', 'ministry']), handler)
 */

const ROLE_LEVELS = {
  district_officer: 1,
  collector: 2,
  state_admin: 3,
  central_admin: 4,
  ministry: 5,
};

/**
 * Require the authenticated user to have at least the specified role level
 * Accepts a single role string or an array of allowed roles
 * @param {string|string[]} minRole - minimum role required, or array of allowed roles
 */
function requireRole(minRole) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) {
      return res.status(403).json({ success: false, message: 'Access denied. No role assigned.' });
    }

    if (Array.isArray(minRole)) {
      // Exact match against allowed roles list
      if (!minRole.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${minRole.join(' or ')}.`,
        });
      }
    } else {
      // Minimum level check
      const requiredLevel = ROLE_LEVELS[minRole] ?? 99;
      const userLevel = ROLE_LEVELS[userRole] ?? 0;
      if (userLevel < requiredLevel) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${minRole} or above.`,
        });
      }
    }

    next();
  };
}

/**
 * Scope a project query based on the user's role and jurisdiction.
 * Returns a filter object to be applied to the DB query.
 */
function getScopeFilter(user) {
  if (!user) return {};
  switch (user.role) {
    case 'district_officer':
    case 'collector':
      return { district: user.district, state: user.state };
    case 'state_admin':
      return { state: user.state };
    case 'central_admin':
    case 'ministry':
    default:
      return {}; // No filter — see all
  }
}

module.exports = { requireRole, getScopeFilter, ROLE_LEVELS };
