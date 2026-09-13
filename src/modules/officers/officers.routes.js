'use strict';
const { Router } = require('express');
const ctrl = require('./officers.controller');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');

const router = Router();

router.use(authenticate);

router.get('/', requireRole('collector'), ctrl.listOfficers);
router.get('/:id/performance', requireRole('collector'), ctrl.getOfficerPerformance);

module.exports = router;
