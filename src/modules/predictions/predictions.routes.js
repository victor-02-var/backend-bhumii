'use strict';
const { Router } = require('express');
const ctrl = require('./predictions.controller');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');

const router = Router();
router.use(authenticate);

// Trigger predictions
router.post('/run/:projectId', requireRole('district_officer'), ctrl.runPrediction);
router.post('/run-bulk', requireRole('central_admin'), ctrl.runBulkPredictions);

// Get predictions
router.get('/project/:projectId', ctrl.getLatestPrediction);
router.get('/project/:projectId/history', ctrl.getPredictionHistory);
router.get('/', requireRole('collector'), ctrl.listAllPredictions);

// Summaries & Simulations
router.post('/simulate', ctrl.simulateIntervention);
router.get('/summary/national', requireRole('central_admin'), ctrl.getNationalSummary);
router.get('/summary/state/:state', requireRole('state_admin'), ctrl.getStateSummary);
router.get('/summary/district/:district', requireRole('collector'), ctrl.getDistrictSummary);

module.exports = router;

