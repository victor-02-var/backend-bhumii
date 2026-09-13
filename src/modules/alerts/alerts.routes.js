'use strict';
const { Router } = require('express');
const { body } = require('express-validator');
const ctrl = require('./alerts.controller');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');

const router = Router();

router.use(authenticate);

router.get('/my', ctrl.getMyAlerts);
router.get('/unread-count', ctrl.getUnreadCount);
router.get('/', requireRole('collector'), ctrl.getAllAlerts);
router.put('/:id/read', ctrl.markAsRead);
router.put('/:id/dismiss', ctrl.dismissAlert);
router.post(
  '/send-manual',
  requireRole('collector'),
  [
    body('project_id').notEmpty().withMessage('project_id is required'),
    body('recipient_user_id').notEmpty().withMessage('recipient_user_id is required'),
    body('message').notEmpty().withMessage('message is required')
  ],
  ctrl.sendManualAlert
);

module.exports = router;
