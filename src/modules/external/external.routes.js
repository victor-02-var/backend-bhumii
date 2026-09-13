'use strict';
const { Router } = require('express');
const ctrl = require('./external.controller');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');

const router = Router();

// Public Health Check
router.get('/health', ctrl.getHealth);

// ML Service Webhook Endpoint (uses x-api-key authentication in controller)
router.post('/ml-webhook', ctrl.receiveMLWebhook);

// Protected Export Endpoints
router.get('/export/projects', authenticate, requireRole('central_admin'), ctrl.exportProjectsCSV);
router.get('/export/predictions', authenticate, requireRole('central_admin'), ctrl.exportPredictionsCSV);

module.exports = router;
