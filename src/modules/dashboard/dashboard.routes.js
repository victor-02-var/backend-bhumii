'use strict';
const { Router } = require('express');
const ctrl = require('./dashboard.controller');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');

const router = Router();

// All dashboard endpoints require authentication
router.use(authenticate);

router.get('/stats', ctrl.getStats);
router.get('/risk-distribution', ctrl.getRiskDistribution);
router.get('/delay-trend', ctrl.getDelayTrend);
router.get('/stage-funnel', ctrl.getStageFunnel);
router.get('/top-delay-factors', ctrl.getTopDelayFactors);
router.get('/compensation-status', ctrl.getCompensationStatus);
router.get('/rr-compliance', ctrl.getRRCompliance);
router.get('/section11-lapse-countdown', ctrl.getSection11Countdown);
router.get('/officer-performance', requireRole('collector'), ctrl.getOfficerPerformance);
router.get('/comparative-analytics', requireRole('state_admin'), ctrl.getComparativeAnalytics);

module.exports = router;
