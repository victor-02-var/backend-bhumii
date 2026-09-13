'use strict';
const { Router } = require('express');
const { body } = require('express-validator');
const ctrl = require('./users.controller');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');

const router = Router();

router.use(authenticate);

// Profile endpoints (Any authenticated user)
router.get('/me', ctrl.getMe);
router.put('/me', ctrl.updateMe);
router.put(
  '/me/password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
  ],
  ctrl.changeMyPassword
);

// Admin-only management endpoints
router.get('/', requireRole('central_admin'), ctrl.listUsers);
router.get('/:id', requireRole('central_admin'), ctrl.getUserById);
router.put(
  '/:id/role',
  requireRole('central_admin'),
  [body('role').notEmpty().withMessage('role is required')],
  ctrl.updateUserRole
);
router.put(
  '/:id/activate',
  requireRole('central_admin'),
  [body('is_active').isBoolean().withMessage('is_active must be boolean')],
  ctrl.toggleUserActive
);

module.exports = router;
