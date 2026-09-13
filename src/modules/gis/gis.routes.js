'use strict';
const { Router } = require('express');
const ctrl = require('./gis.controller');
const { optionalAuthenticate } = require('../../middleware/auth');

const router = Router();

router.use(optionalAuthenticate);

router.get('/districts/risk-heatmap', ctrl.getDistrictRiskHeatmap);
router.get('/states/risk-heatmap', ctrl.getStateRiskHeatmap);
router.get('/projects/geojson', ctrl.getProjectsGeoJSON);
router.get('/districts/:district/projects', ctrl.getDistrictProjectsForMap);

module.exports = router;
