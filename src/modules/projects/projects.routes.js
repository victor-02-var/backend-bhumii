'use strict';
const { Router } = require('express');
const { body } = require('express-validator');
const ctrl = require('./projects.controller');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');
const { auditLog } = require('../../middleware/audit');

const router = Router();
router.use(authenticate);

const VALID_STAGES = ['Stage_0','Stage_1','Stage_2','Stage_3','Stage_4','Stage_5','Stage_6','Stage_7','Stage_8','Stage_9'];

// ── Specific routes before :id ─────────────────────────────────────
router.get('/high-risk', requireRole('collector'), ctrl.getHighRisk);
router.get('/section11-lapse-watch', requireRole('collector'), ctrl.getSection11LapseWatch);

// ── CRUD ──────────────────────────────────────────────────────────
router.post('/', requireRole('district_officer'), [
  body('project_code').notEmpty().withMessage('Project code required.'),
  body('project_name').notEmpty().withMessage('Project name required.'),
  body('project_type').isIn(['Highway','Railway','Dam','Industrial','Urban','Transmission','Other']).withMessage('Invalid project type.'),
  body('state').notEmpty().withMessage('State required.'),
  body('district').notEmpty().withMessage('District required.'),
], ctrl.createProject);

router.get('/', auditLog('VIEW', 'project'), ctrl.listProjects);
router.get('/:id', auditLog('VIEW', 'project'), ctrl.getProject);

router.put('/:id', requireRole('district_officer'), [
  body('project_type').optional().isIn(['Highway','Railway','Dam','Industrial','Urban','Transmission','Other']),
  body('compensation_disbursement_pct').optional().isFloat({ min: 0, max: 100 }),
  body('possession_status_pct').optional().isFloat({ min: 0, max: 100 }),
  body('rehabilitation_progress_pct').optional().isFloat({ min: 0, max: 100 }),
], ctrl.updateProject);

router.delete('/:id', requireRole('collector'), ctrl.archiveProject);

// ── Stage management ───────────────────────────────────────────────
router.patch('/:id/stage', requireRole('district_officer'), [
  body('stage').isIn(VALID_STAGES).withMessage(`Stage must be one of: ${VALID_STAGES.join(', ')}`),
], ctrl.updateStage);

router.get('/:id/stage-history', ctrl.getStageHistory);

// ── Bulk import ────────────────────────────────────────────────────
router.post('/bulk-import', requireRole('central_admin'), ctrl.bulkImport);

module.exports = router;
