'use strict';
const supabase = require('../../config/supabase');
const { getScopeFilter } = require('../../middleware/rbac');

/**
 * GET /api/v1/gis/districts/risk-heatmap
 * Returns aggregated district-level risk statistics for map visualization
 */
async function getDistrictRiskHeatmap(req, res, next) {
  try {
    const scope = getScopeFilter(req.user);

    let query = supabase
      .from('projects')
      .select(`
        district,
        state,
        predictions (
          risk_score,
          risk_category,
          is_active
        )
      `);

    if (scope.state) query = query.eq('state', scope.state);
    if (scope.district) query = query.eq('district', scope.district);

    const { data: projects, error } = await query;
    if (error) throw error;

    // Aggregate by district
    const districtStats = {};

    (projects || []).forEach(p => {
      const activePred = p.predictions?.find(pr => pr.is_active) || p.predictions?.[0];
      const riskScore = activePred ? parseFloat(activePred.risk_score) : 0;
      const key = `${p.district}__${p.state}`;

      if (!districtStats[key]) {
        districtStats[key] = {
          district: p.district,
          state: p.state,
          total_projects: 0,
          total_risk_score: 0,
          high_risk_count: 0,
          critical_risk_count: 0
        };
      }

      districtStats[key].total_projects += 1;
      districtStats[key].total_risk_score += riskScore;
      if (riskScore >= 70 && riskScore < 85) districtStats[key].high_risk_count += 1;
      if (riskScore >= 85) districtStats[key].critical_risk_count += 1;
    });

    const heatmapData = Object.values(districtStats).map(d => ({
      district: d.district,
      state: d.state,
      total_projects: d.total_projects,
      avg_risk_score: d.total_projects > 0 ? parseFloat((d.total_risk_score / d.total_projects).toFixed(2)) : 0,
      high_risk_count: d.high_risk_count,
      critical_risk_count: d.critical_risk_count
    }));

    return res.status(200).json({ success: true, data: heatmapData });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/gis/states/risk-heatmap
 * State-wise aggregated risk statistics for high-level choropleth map
 */
async function getStateRiskHeatmap(req, res, next) {
  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        state,
        predictions (
          risk_score,
          is_active
        )
      `);

    if (error) throw error;

    const stateStats = {};

    (projects || []).forEach(p => {
      const activePred = p.predictions?.find(pr => pr.is_active) || p.predictions?.[0];
      const riskScore = activePred ? parseFloat(activePred.risk_score) : 0;
      const state = p.state;

      if (!stateStats[state]) {
        stateStats[state] = {
          state,
          total_projects: 0,
          total_risk_score: 0,
          critical_count: 0
        };
      }

      stateStats[state].total_projects += 1;
      stateStats[state].total_risk_score += riskScore;
      if (riskScore >= 85) stateStats[state].critical_count += 1;
    });

    const heatmap = Object.values(stateStats).map(s => ({
      state: s.state,
      total_projects: s.total_projects,
      avg_risk_score: s.total_projects > 0 ? parseFloat((s.total_risk_score / s.total_projects).toFixed(2)) : 0,
      critical_projects_count: s.critical_count
    }));

    return res.status(200).json({ success: true, data: heatmap });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/gis/projects/geojson
 * Returns projects as GeoJSON FeatureCollection format for Leaflet/Mapbox integration
 */
async function getProjectsGeoJSON(req, res, next) {
  try {
    const scope = getScopeFilter(req.user);

    let query = supabase
      .from('projects')
      .select(`
        id,
        project_id,
        project_name,
        project_type,
        state,
        district,
        total_land_area_ha,
        num_affected_families,
        current_stage,
        is_delayed,
        latitude,
        longitude,
        predictions (
          risk_score,
          risk_category,
          is_active
        )
      `);

    if (scope.state) query = query.eq('state', scope.state);
    if (scope.district) query = query.eq('district', scope.district);

    const { data: projects, error } = await query;
    if (error) throw error;

    const features = (projects || []).map(p => {
      const activePred = p.predictions?.find(pr => pr.is_active) || p.predictions?.[0];
      const riskScore = activePred ? parseFloat(activePred.risk_score) : 0;
      const riskCategory = activePred ? activePred.risk_category : 'Low';

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [
            p.longitude ? parseFloat(p.longitude) : 78.9629,
            p.latitude ? parseFloat(p.latitude) : 20.5937
          ]
        },
        properties: {
          id: p.id,
          project_id: p.project_id,
          project_name: p.project_name,
          project_type: p.project_type,
          state: p.state,
          district: p.district,
          land_area_ha: p.total_land_area_ha,
          affected_families: p.num_affected_families || 0,
          current_stage: p.current_stage,
          is_delayed: p.is_delayed,
          risk_score: riskScore,
          risk_category: riskCategory
        }
      };
    });

    return res.status(200).json({
      type: 'FeatureCollection',
      features
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/gis/districts/:district/projects
 * Popup detail listing for map district clicks
 */
async function getDistrictProjectsForMap(req, res, next) {
  try {
    const { district } = req.params;

    const { data, error } = await supabase
      .from('projects')
      .select(`
        id,
        project_id,
        project_name,
        project_type,
        current_stage,
        compensation_disbursement_pct,
        predictions (
          risk_score,
          risk_category,
          is_active
        )
      `)
      .eq('district', district);

    if (error) throw error;

    const mapped = (data || []).map(p => {
      const activePred = p.predictions?.find(pr => pr.is_active) || p.predictions?.[0];
      return {
        id: p.id,
        project_id: p.project_id,
        project_name: p.project_name,
        project_type: p.project_type,
        current_stage: p.current_stage,
        compensation_pct: p.compensation_disbursement_pct,
        risk_score: activePred ? parseFloat(activePred.risk_score) : 0,
        risk_category: activePred ? activePred.risk_category : 'Low'
      };
    });

    return res.status(200).json({ success: true, data: mapped });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDistrictRiskHeatmap,
  getStateRiskHeatmap,
  getProjectsGeoJSON,
  getDistrictProjectsForMap
};
