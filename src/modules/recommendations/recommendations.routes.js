'use strict';
const { Router } = require('express');
const { body } = require('express-validator');
const ctrl = require('./recommendations.controller');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');

const router = Router();

router.use(authenticate);

router.get('/project/:projectId', ctrl.getProjectRecommendations);
router.get('/priority/urgent', ctrl.getUrgentRecommendations);
router.put(
  '/:id/status',
  requireRole('district_officer'),
  [body('status').notEmpty().withMessage('status is required')],
  ctrl.updateRecommendationStatus
);

module.exports = router;
