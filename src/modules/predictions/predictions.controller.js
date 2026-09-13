'use strict';
const svc = require('./predictions.service');
const { paginatedResponse } = require('../../utils/pagination');

async function runPrediction(req, res, next) {
  try {
    const result = await svc.runPrediction(req.params.projectId, req.user);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function runBulkPredictions(req, res, next) {
  try {
    const result = await svc.runBulkPredictions(req.user);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function getLatestPrediction(req, res, next) {
  try {
    const prediction = await svc.getLatestPrediction(req.params.projectId, req.user);
    res.json({ success: true, data: prediction });
  } catch (err) { next(err); }
}

async function getPredictionHistory(req, res, next) {
  try {
    const history = await svc.getPredictionHistory(req.params.projectId, req.user);
    res.json({ success: true, data: history });
  } catch (err) { next(err); }
}

async function listAllPredictions(req, res, next) {
  try {
    const { data, count, page, limit } = await svc.listAllPredictions(req.user, req.query);
    res.json({ success: true, ...paginatedResponse(data, count, page, limit) });
  } catch (err) { next(err); }
}

async function getNationalSummary(req, res, next) {
  try {
    const summary = await svc.getNationalRiskSummary();
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
}

async function getStateSummary(req, res, next) {
  try {
    const summary = await svc.getStateSummary(req.params.state);
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
}

async function getDistrictSummary(req, res, next) {
  try {
    const summary = await svc.getDistrictSummary(req.params.district);
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
}

async function simulateIntervention(req, res, next) {
  try {
    const { projectId, interventions } = req.body || {};
    const result = await svc.simulateProjectIntervention(projectId, interventions, req.user);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

module.exports = {
  runPrediction, runBulkPredictions, getLatestPrediction,
  getPredictionHistory, listAllPredictions,
  getNationalSummary, getStateSummary, getDistrictSummary,
  simulateIntervention,
};

