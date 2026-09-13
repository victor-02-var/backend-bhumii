'use strict';
const { Router } = require('express');
const ctrl = require('./audit.controller');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');

const router = Router();

router.use(authenticate);

router.get('/logs', requireRole('central_admin'), ctrl.getAuditLogs);
router.get('/logs/project/:projectId', requireRole('collector'), ctrl.getProjectAuditLogs);

module.exports = router;
