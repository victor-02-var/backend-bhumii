'use strict';
const supabase = require('../../config/supabase');
const { getPagination } = require('../../utils/pagination');
const { getScopeFilter } = require('../../middleware/rbac');
const { writeAuditLog } = require('../../middleware/audit');

/**
 * Build a scoped Supabase query filtered by the user's role jurisdiction
 */
function buildScopedQuery(user) {
  const scope = getScopeFilter(user);
  let query = supabase.from('projects').select('*', { count: 'exact' });
  if (scope.district) query = query.eq('district', scope.district);
  if (scope.state) query = query.eq('state', scope.state);
  return query;
}

async function createProject(data, userId) {
  const { data: project, error } = await supabase
    .from('projects')
    .insert({ ...data, created_by: userId })
    .select()
    .single();
  if (error) throw error;

  // Create initial stage history entry
  await supabase.from('stage_history').insert({
    project_id: project.id,
    stage: project.current_stage || 'Stage_0',
    entered_at: new Date().toISOString(),
    created_by: userId,
  });

  await writeAuditLog({
    userId,
    action: 'CREATE',
    resourceType: 'project',
    resourceId: project.id,
    summary: `Created project ${project.project_code}`,
    newValue: project,
  });

  return project;
}

async function listProjects(user, query) {
  const { from, to, page, limit } = getPagination(query);

  let q = buildScopedQuery(user)
    .order('created_at', { ascending: false })
    .range(from, to);

  // Filters
  if (query.state) q = q.eq('state', query.state);
  if (query.district) q = q.eq('district', query.district);
  if (query.project_type) q = q.eq('project_type', query.project_type);
  if (query.is_delayed !== undefined) q = q.eq('is_delayed', query.is_delayed === 'true');
  if (query.current_stage) q = q.eq('current_stage', query.current_stage);
  if (query.risk_min) q = q.gte('risk_score', parseFloat(query.risk_min)); // joined via view (future)
  if (query.search) q = q.ilike('project_name', `%${query.search}%`);

  const { data, error, count } = await q;
  if (error) throw error;

  return { data, count, page, limit };
}

async function getProjectById(id, user) {
  const scope = getScopeFilter(user);
  let q = supabase.from('projects').select('*').eq('id', id);
  if (scope.district) q = q.eq('district', scope.district);
  if (scope.state) q = q.eq('state', scope.state);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Project not found or you do not have access to it.');
    err.statusCode = 404;
    throw err;
  }
  return data;
}

async function updateProject(id, updates, userId, user) {
  // Scope check
  const existing = await getProjectById(id, user);

  const { data, error } = await supabase
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  await writeAuditLog({
    userId,
    action: 'UPDATE',
    resourceType: 'project',
    resourceId: id,
    summary: `Updated project ${existing.project_code}`,
    oldValue: existing,
    newValue: data,
  });

  return data;
}

async function archiveProject(id, userId, user) {
  const existing = await getProjectById(id, user);
  const { data, error } = await supabase
    .from('projects')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  await writeAuditLog({
    userId,
    action: 'DELETE',
    resourceType: 'project',
    resourceId: id,
    summary: `Archived project ${existing.project_code}`,
  });

  return data;
}

async function updateProjectStage(id, newStage, notes, userId, user) {
  const project = await getProjectById(id, user);
  const now = new Date().toISOString();

  // Close current stage history
  const { data: currentStageRecord } = await supabase
    .from('stage_history')
    .select('*')
    .eq('project_id', id)
    .eq('stage', project.current_stage)
    .is('exited_at', null)
    .order('entered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (currentStageRecord) {
    const entered = new Date(currentStageRecord.entered_at);
    const exited = new Date(now);
    const daysInStage = Math.round((exited - entered) / (1000 * 60 * 60 * 24));
    await supabase.from('stage_history')
      .update({ exited_at: now, days_in_stage: daysInStage })
      .eq('id', currentStageRecord.id);
  }

  // Open new stage
  await supabase.from('stage_history').insert({
    project_id: id,
    stage: newStage,
    entered_at: now,
    notes: notes || null,
    created_by: userId,
  });

  const { data, error } = await supabase
    .from('projects')
    .update({ current_stage: newStage, updated_at: now })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getStageHistory(projectId, user) {
  await getProjectById(projectId, user); // scope check
  const { data, error } = await supabase
    .from('stage_history')
    .select('*')
    .eq('project_id', projectId)
    .order('entered_at', { ascending: true });

  if (error) throw error;
  return data;
}

async function getHighRiskProjects(user, threshold = 70) {
  const scope = getScopeFilter(user);

  // Join with latest predictions
  let q = supabase
    .from('predictions')
    .select(`
      risk_score, delay_probability, risk_category, top_delay_factors, created_at,
      projects!inner (id, project_id, project_name, project_type, state, district, current_stage, assigned_officer_id)
    `)
    .eq('is_active', true)
    .gte('risk_score', threshold)
    .order('risk_score', { ascending: false })
    .limit(50);

  if (scope.district) q = q.eq('projects.district', scope.district);
  if (scope.state) q = q.eq('projects.state', scope.state);

  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function getSection11LapseWatch(user) {
  const scope = getScopeFilter(user);
  const now = new Date();
  const thresholdDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  // Projects where Section 11 will lapse within 90 days and Section 19 not yet issued
  let q = supabase
    .from('projects')
    .select('id, project_id, project_name, state, district, section_11_date, section_11_lapse_date, current_stage, assigned_officer_id')
    .is('section_19_date', null)
    .not('section_11_date', 'is', null)
    .lte('section_11_lapse_date', thresholdDate)
    .gte('section_11_lapse_date', today)
    .order('section_11_lapse_date', { ascending: true });

  if (scope.district) q = q.eq('district', scope.district);
  if (scope.state) q = q.eq('state', scope.state);

  const { data, error } = await q;
  if (error) throw error;

  return data.map(p => ({
    ...p,
    days_remaining_to_lapse: Math.ceil(
      (new Date(p.section_11_lapse_date) - now) / (1000 * 60 * 60 * 24)
    ),
  }));
}

async function bulkImportProjects(records, userId) {
  if (!records || records.length === 0) {
    const err = new Error('No records to import.');
    err.statusCode = 400;
    throw err;
  }

  const enriched = records.map(r => ({ ...r, created_by: userId }));
  const { data, error } = await supabase
    .from('projects')
    .upsert(enriched, { onConflict: 'project_id' })
    .select('id, project_id');

  if (error) throw error;

  await writeAuditLog({
    userId,
    action: 'CREATE',
    resourceType: 'project',
    summary: `Bulk imported ${data.length} projects`,
    newValue: { count: data.length },
  });

  return { imported: data.length, projects: data };
}

module.exports = {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  archiveProject,
  updateProjectStage,
  getStageHistory,
  getHighRiskProjects,
  getSection11LapseWatch,
  bulkImportProjects,
};
