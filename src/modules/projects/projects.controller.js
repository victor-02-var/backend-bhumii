'use strict';
const svc = require('./projects.service');
const { paginatedResponse } = require('../../utils/pagination');
const { parse: csvParse } = require('fast-csv');
const { Readable } = require('stream');

async function createProject(req, res, next) {
  try {
    const project = await svc.createProject(req.body, req.user.userId);
    res.status(201).json({ success: true, data: project });
  } catch (err) { next(err); }
}

async function listProjects(req, res, next) {
  try {
    const { data, count, page, limit } = await svc.listProjects(req.user, req.query);
    res.json({ success: true, ...paginatedResponse(data, count, page, limit) });
  } catch (err) { next(err); }
}

async function getProject(req, res, next) {
  try {
    const project = await svc.getProjectById(req.params.id, req.user);
    res.json({ success: true, data: project });
  } catch (err) { next(err); }
}

async function updateProject(req, res, next) {
  try {
    const project = await svc.updateProject(req.params.id, req.body, req.user.userId, req.user);
    res.json({ success: true, data: project });
  } catch (err) { next(err); }
}

async function archiveProject(req, res, next) {
  try {
    const project = await svc.archiveProject(req.params.id, req.user.userId, req.user);
    res.json({ success: true, data: project });
  } catch (err) { next(err); }
}

async function updateStage(req, res, next) {
  try {
    const { stage, notes } = req.body;
    const project = await svc.updateProjectStage(req.params.id, stage, notes, req.user.userId, req.user);
    res.json({ success: true, data: project });
  } catch (err) { next(err); }
}

async function getStageHistory(req, res, next) {
  try {
    const history = await svc.getStageHistory(req.params.id, req.user);
    res.json({ success: true, data: history });
  } catch (err) { next(err); }
}

async function getHighRisk(req, res, next) {
  try {
    const threshold = parseFloat(req.query.threshold || '70');
    const projects = await svc.getHighRiskProjects(req.user, threshold);
    res.json({ success: true, data: projects, count: projects.length });
  } catch (err) { next(err); }
}

async function getSection11LapseWatch(req, res, next) {
  try {
    const projects = await svc.getSection11LapseWatch(req.user);
    res.json({ success: true, data: projects, count: projects.length });
  } catch (err) { next(err); }
}

async function bulkImport(req, res, next) {
  try {
    if (!req.file && !req.body.records) {
      return res.status(400).json({ success: false, message: 'Provide records array or upload a CSV file.' });
    }

    let records = req.body.records;

    // Parse CSV if file uploaded
    if (req.file) {
      records = await new Promise((resolve, reject) => {
        const rows = [];
        const stream = Readable.from(req.file.buffer.toString());
        stream.pipe(csvParse({ headers: true, trim: true }))
          .on('data', (row) => rows.push(row))
          .on('end', () => resolve(rows))
          .on('error', reject);
      });
    }

    const result = await svc.bulkImportProjects(records, req.user.userId);
    res.status(201).json({ success: true, ...result });
  } catch (err) { next(err); }
}

module.exports = {
  createProject, listProjects, getProject, updateProject,
  archiveProject, updateStage, getStageHistory, getHighRisk,
  getSection11LapseWatch, bulkImport,
};
