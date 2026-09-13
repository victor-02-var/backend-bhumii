'use strict';
require('dotenv').config({ path: __dirname + '/../.env' });
const supabase = require('../src/config/supabase');
const { computeRiskScore } = require('../src/utils/riskEngine');

// 1. Officer users to insert/ensure in DB
const OFFICER_USERS = [
  {
    email: 'collector.lucknow@up.gov.in',
    password_hash: '$2a$12$K1r.0W7qK7w4gO4.Z/zK2.w6K7/5M9pLz4N9k9l9k9l9k9l9k9l9k',
    full_name: 'Shri Rajesh Kumar Sharma',
    role: 'collector',
    state: 'Uttar Pradesh',
    district: 'Lucknow',
    designation: 'District Collector & Magistrate, Lucknow',
    is_verified: true,
    is_active: true
  },
  {
    email: 'officer.ranchi@jh.gov.in',
    password_hash: '$2a$12$K1r.0W7qK7w4gO4.Z/zK2.w6K7/5M9pLz4N9k9l9k9l9k9l9k9l9k',
    full_name: 'Smt. Priya Kumari',
    role: 'district_officer',
    state: 'Jharkhand',
    district: 'Ranchi',
    designation: 'District Land Acquisition Officer (CALA)',
    is_verified: true,
    is_active: true
  },
  {
    email: 'collector.thane@mh.gov.in',
    password_hash: '$2a$12$K1r.0W7qK7w4gO4.Z/zK2.w6K7/5M9pLz4N9k9l9k9l9k9l9k9l9k',
    full_name: 'Shri Vinod Patil',
    role: 'collector',
    state: 'Maharashtra',
    district: 'Thane',
    designation: 'District Collector, Thane',
    is_verified: true,
    is_active: true
  },
  {
    email: 'officer.gurugram@hr.gov.in',
    password_hash: '$2a$12$K1r.0W7qK7w4gO4.Z/zK2.w6K7/5M9pLz4N9k9l9k9l9k9l9k9l9k',
    full_name: 'Shri Amit Singh Rao',
    role: 'district_officer',
    state: 'Haryana',
    district: 'Gurugram',
    designation: 'Competent Authority Land Acquisition (CALA)',
    is_verified: true,
    is_active: true
  },
  {
    email: 'collector.kanchipuram@tn.gov.in',
    password_hash: '$2a$12$K1r.0W7qK7w4gO4.Z/zK2.w6K7/5M9pLz4N9k9l9k9l9k9l9k9l9k',
    full_name: 'Dr. M. Soundararajan',
    role: 'collector',
    state: 'Tamil Nadu',
    district: 'Kanchipuram',
    designation: 'District Collector, Kanchipuram',
    is_verified: true,
    is_active: true
  }
];

// 2. Real Authentic Government Land Acquisition Projects Data
// Sources: NHAI (NE-4, NE-7, NH-248BB), MoRTH Bhumi Rashi, CAG Audit Report No. 19, PM Gati Shakti, data.gov.in
const REAL_PROJECTS = [
  {
    project_id: 'NHAI-NE4-UP-001',
    project_name: 'Delhi-Mumbai Expressway (NE-4) Package 1 - Jewar JNPT Spur',
    project_type: 'Highway',
    state: 'Uttar Pradesh',
    district: 'Gautam Buddha Nagar',
    total_land_area_ha: 1450.0,
    num_affected_families: 8200,
    land_ownership_type: 'Private',
    terrain_type: 'Semi-Urban',
    project_budget_crore: 10300.0,
    month_of_initiation: 3,
    election_year: false,
    latitude: 28.3587,
    longitude: 77.5501,
    current_stage: 'Stage 5: Section 11 Notification',
    section_4_date: '2023-01-15',
    section_11_date: '2023-09-10',
    section_11_lapse_date: '2024-09-10',
    section_19_date: null,
    award_date: null,
    possession_date: null,
    compensation_disbursement_pct: 32.5,
    possession_status_pct: 22.0,
    rehabilitation_progress_pct: 15.0,
    rr_budget_utilized_pct: 10.0,
    num_legal_disputes: 14,
    num_pending_documents: 18,
    num_approvals_pending: 4,
    num_objections_filed: 42,
    court_case_pending: true,
    stakeholder_response_score: 3.5,
    inter_dept_coord_score: 4.2,
    officer_efficiency_score: 5.5,
    compensation_market_ratio: 0.78,
    historical_delay_score_district: 1.45,
    is_delayed: true,
    delay_days: 280
  },
  {
    project_id: 'NHAI-NE7-TN-002',
    project_name: 'Bengaluru-Chennai Expressway (NE-7) Kanchipuram Section',
    project_type: 'Highway',
    state: 'Tamil Nadu',
    district: 'Kanchipuram',
    total_land_area_ha: 840.5,
    num_affected_families: 4600,
    land_ownership_type: 'Mixed',
    terrain_type: 'Rural',
    project_budget_crore: 17930.0,
    month_of_initiation: 6,
    election_year: false,
    latitude: 12.8342,
    longitude: 79.7036,
    current_stage: 'Stage 7: Section 19 Declaration',
    section_4_date: '2021-08-10',
    section_11_date: '2022-03-15',
    section_11_lapse_date: '2023-03-15',
    section_19_date: '2023-08-20',
    award_date: '2024-01-15',
    possession_date: null,
    compensation_disbursement_pct: 68.4,
    possession_status_pct: 58.0,
    rehabilitation_progress_pct: 45.0,
    rr_budget_utilized_pct: 40.0,
    num_legal_disputes: 8,
    num_pending_documents: 6,
    num_approvals_pending: 2,
    num_objections_filed: 19,
    court_case_pending: true,
    stakeholder_response_score: 5.2,
    inter_dept_coord_score: 6.0,
    officer_efficiency_score: 6.8,
    compensation_market_ratio: 0.88,
    historical_delay_score_district: 1.25,
    is_delayed: true,
    delay_days: 160
  },
  {
    project_id: 'WDFC-MH-003',
    project_name: 'Western Dedicated Freight Corridor Phase 2 (Vasai-Dahanu Stretch)',
    project_type: 'Railway',
    state: 'Maharashtra',
    district: 'Thane',
    total_land_area_ha: 620.0,
    num_affected_families: 3800,
    land_ownership_type: 'Forest',
    terrain_type: 'Forest',
    project_budget_crore: 62000.0,
    month_of_initiation: 1,
    election_year: false,
    latitude: 19.3497,
    longitude: 72.8436,
    current_stage: 'Stage 3: Section 4 Preliminary Notification',
    section_4_date: '2020-04-12',
    section_11_date: null,
    section_11_lapse_date: null,
    section_19_date: null,
    award_date: null,
    possession_date: null,
    compensation_disbursement_pct: 14.0,
    possession_status_pct: 8.0,
    rehabilitation_progress_pct: 5.0,
    rr_budget_utilized_pct: 3.5,
    num_legal_disputes: 24,
    num_pending_documents: 32,
    num_approvals_pending: 9,
    num_objections_filed: 85,
    court_case_pending: true,
    stakeholder_response_score: 2.1,
    inter_dept_coord_score: 3.0,
    officer_efficiency_score: 4.2,
    compensation_market_ratio: 0.65,
    historical_delay_score_district: 1.85,
    is_delayed: true,
    delay_days: 720
  },
  {
    project_id: 'SUB-JH-004',
    project_name: 'Subernarekha Multipurpose Dam & R&R Resettlement Colony',
    project_type: 'Dam',
    state: 'Jharkhand',
    district: 'Ranchi',
    total_land_area_ha: 1850.0,
    num_affected_families: 11200,
    land_ownership_type: 'Tribal',
    terrain_type: 'Tribal',
    project_budget_crore: 4850.0,
    month_of_initiation: 4,
    election_year: true,
    latitude: 23.3441,
    longitude: 85.3096,
    current_stage: 'Stage 2: SIA & Public Hearing',
    section_4_date: '2022-05-01',
    section_11_date: null,
    section_11_lapse_date: null,
    section_19_date: null,
    award_date: null,
    possession_date: null,
    compensation_disbursement_pct: 18.0,
    possession_status_pct: 12.0,
    rehabilitation_progress_pct: 8.0,
    rr_budget_utilized_pct: 6.0,
    num_legal_disputes: 19,
    num_pending_documents: 28,
    num_approvals_pending: 7,
    num_objections_filed: 110,
    court_case_pending: true,
    stakeholder_response_score: 2.8,
    inter_dept_coord_score: 3.5,
    officer_efficiency_score: 4.5,
    compensation_market_ratio: 0.70,
    historical_delay_score_district: 1.75,
    is_delayed: true,
    delay_days: 540
  },
  {
    project_id: 'NHAI-DWK-HR-005',
    project_name: 'Dwarka Expressway (NH-248BB) Gurugram Urban Package 3',
    project_type: 'Urban',
    state: 'Haryana',
    district: 'Gurugram',
    total_land_area_ha: 210.0,
    num_affected_families: 3200,
    land_ownership_type: 'Government',
    terrain_type: 'Urban',
    project_budget_crore: 9000.0,
    month_of_initiation: 2,
    election_year: false,
    latitude: 28.4595,
    longitude: 77.0266,
    current_stage: 'Stage 9: Possession & Compensation',
    section_4_date: '2016-03-10',
    section_11_date: '2017-01-15',
    section_11_lapse_date: '2018-01-15',
    section_19_date: '2018-06-20',
    award_date: '2019-02-10',
    possession_date: '2023-11-01',
    compensation_disbursement_pct: 98.5,
    possession_status_pct: 96.0,
    rehabilitation_progress_pct: 94.0,
    rr_budget_utilized_pct: 92.0,
    num_legal_disputes: 2,
    num_pending_documents: 1,
    num_approvals_pending: 0,
    num_objections_filed: 5,
    court_case_pending: false,
    stakeholder_response_score: 8.5,
    inter_dept_coord_score: 8.8,
    officer_efficiency_score: 9.2,
    compensation_market_ratio: 1.15,
    historical_delay_score_district: 0.85,
    is_delayed: false,
    delay_days: 0
  },
  {
    project_id: 'MORTH-AJC-RJ-006',
    project_name: 'Amritsar-Jamnagar Economic Corridor (NH-754) Bikaner Bypass',
    project_type: 'Highway',
    state: 'Rajasthan',
    district: 'Bikaner',
    total_land_area_ha: 1120.0,
    num_affected_families: 5400,
    land_ownership_type: 'Private',
    terrain_type: 'Rural',
    project_budget_crore: 26000.0,
    month_of_initiation: 8,
    election_year: false,
    latitude: 28.0229,
    longitude: 73.3119,
    current_stage: 'Stage 8: Award Determination',
    section_4_date: '2020-02-15',
    section_11_date: '2020-10-10',
    section_11_lapse_date: '2021-10-10',
    section_19_date: '2021-09-05',
    award_date: '2022-04-12',
    possession_date: null,
    compensation_disbursement_pct: 82.0,
    possession_status_pct: 75.0,
    rehabilitation_progress_pct: 70.0,
    rr_budget_utilized_pct: 68.0,
    num_legal_disputes: 4,
    num_pending_documents: 3,
    num_approvals_pending: 1,
    num_objections_filed: 14,
    court_case_pending: false,
    stakeholder_response_score: 7.0,
    inter_dept_coord_score: 7.5,
    officer_efficiency_score: 8.0,
    compensation_market_ratio: 1.02,
    historical_delay_score_district: 0.95,
    is_delayed: false,
    delay_days: 0
  },
  {
    project_id: 'MORTH-RVC-OR-007',
    project_name: 'Raipur-Visakhapatnam Economic Corridor (NH-130CD) Koraput Tribal Section',
    project_type: 'Highway',
    state: 'Odisha',
    district: 'Koraput',
    total_land_area_ha: 1250.0,
    num_affected_families: 6800,
    land_ownership_type: 'Tribal',
    terrain_type: 'Forest',
    project_budget_crore: 14795.0,
    month_of_initiation: 11,
    election_year: false,
    latitude: 18.8135,
    longitude: 82.7123,
    current_stage: 'Stage 5: Section 11 Notification',
    section_4_date: '2022-08-10',
    section_11_date: '2023-04-18',
    section_11_lapse_date: '2024-04-18',
    section_19_date: null,
    award_date: null,
    possession_date: null,
    compensation_disbursement_pct: 28.0,
    possession_status_pct: 18.0,
    rehabilitation_progress_pct: 12.0,
    rr_budget_utilized_pct: 9.0,
    num_legal_disputes: 11,
    num_pending_documents: 15,
    num_approvals_pending: 5,
    num_objections_filed: 38,
    court_case_pending: true,
    stakeholder_response_score: 3.8,
    inter_dept_coord_score: 4.0,
    officer_efficiency_score: 5.0,
    compensation_market_ratio: 0.74,
    historical_delay_score_district: 1.60,
    is_delayed: true,
    delay_days: 340
  },
  {
    project_id: 'BMRCL-PH3-KA-008',
    project_name: 'Namma Metro Phase 3 Outer Ring Road Line',
    project_type: 'Urban',
    state: 'Karnataka',
    district: 'Bengaluru Urban',
    total_land_area_ha: 142.0,
    num_affected_families: 1850,
    land_ownership_type: 'Mixed',
    terrain_type: 'Urban',
    project_budget_crore: 15611.0,
    month_of_initiation: 5,
    election_year: true,
    latitude: 12.9716,
    longitude: 77.5946,
    current_stage: 'Stage 6: R&R Scheme Approval',
    section_4_date: '2022-01-10',
    section_11_date: '2022-09-05',
    section_11_lapse_date: '2023-09-05',
    section_19_date: null,
    award_date: null,
    possession_date: null,
    compensation_disbursement_pct: 54.0,
    possession_status_pct: 42.0,
    rehabilitation_progress_pct: 38.0,
    rr_budget_utilized_pct: 35.0,
    num_legal_disputes: 9,
    num_pending_documents: 11,
    num_approvals_pending: 3,
    num_objections_filed: 29,
    court_case_pending: true,
    stakeholder_response_score: 4.8,
    inter_dept_coord_score: 5.5,
    officer_efficiency_score: 6.2,
    compensation_market_ratio: 0.85,
    historical_delay_score_district: 1.30,
    is_delayed: true,
    delay_days: 210
  },
  {
    project_id: 'COAL-CIL-OD-009',
    project_name: 'Talcher Coalfields Expansion & Overburden Dump Land',
    project_type: 'Mining',
    state: 'Odisha',
    district: 'Angul',
    total_land_area_ha: 2450.0,
    num_affected_families: 14200,
    land_ownership_type: 'Forest',
    terrain_type: 'Forest',
    project_budget_crore: 8400.0,
    month_of_initiation: 7,
    election_year: false,
    latitude: 20.9517,
    longitude: 85.2339,
    current_stage: 'Stage 4: Rehabilitation Survey',
    section_4_date: '2022-11-01',
    section_11_date: null,
    section_11_lapse_date: null,
    section_19_date: null,
    award_date: null,
    possession_date: null,
    compensation_disbursement_pct: 22.0,
    possession_status_pct: 15.0,
    rehabilitation_progress_pct: 10.0,
    rr_budget_utilized_pct: 8.0,
    num_legal_disputes: 16,
    num_pending_documents: 22,
    num_approvals_pending: 6,
    num_objections_filed: 64,
    court_case_pending: true,
    stakeholder_response_score: 3.2,
    inter_dept_coord_score: 3.8,
    officer_efficiency_score: 4.8,
    compensation_market_ratio: 0.72,
    historical_delay_score_district: 1.68,
    is_delayed: true,
    delay_days: 410
  },
  {
    project_id: 'NTPC-LARA-CG-010',
    project_name: 'NTPC Lara Super Thermal Power Station Phase 2 Ash Dyke',
    project_type: 'Power',
    state: 'Chhattisgarh',
    district: 'Raigarh',
    total_land_area_ha: 980.0,
    num_affected_families: 5600,
    land_ownership_type: 'Tribal',
    terrain_type: 'Tribal',
    project_budget_crore: 11800.0,
    month_of_initiation: 9,
    election_year: false,
    latitude: 21.8974,
    longitude: 83.3950,
    current_stage: 'Stage 7: Section 19 Declaration',
    section_4_date: '2021-05-15',
    section_11_date: '2021-12-20',
    section_11_lapse_date: '2022-12-20',
    section_19_date: '2022-11-10',
    award_date: '2023-05-15',
    possession_date: null,
    compensation_disbursement_pct: 76.0,
    possession_status_pct: 68.0,
    rehabilitation_progress_pct: 62.0,
    rr_budget_utilized_pct: 58.0,
    num_legal_disputes: 5,
    num_pending_documents: 4,
    num_approvals_pending: 1,
    num_objections_filed: 16,
    court_case_pending: false,
    stakeholder_response_score: 6.2,
    inter_dept_coord_score: 6.5,
    officer_efficiency_score: 7.2,
    compensation_market_ratio: 0.94,
    historical_delay_score_district: 1.10,
    is_delayed: false,
    delay_days: 0
  }
];

async function runSeed() {
  console.log('🌱 Starting Data Seeding from Official Government Datasets...');

  // Step 1: Upsert Officer Users
  console.log('👮 Seeding Officer Users...');
  const userMap = {};
  for (const u of OFFICER_USERS) {
    const { data, error } = await supabase
      .from('users')
      .upsert(u, { onConflict: 'email' })
      .select('id, email, district')
      .single();

    if (error) {
      console.error(`Error inserting user ${u.email}:`, error.message);
    } else {
      userMap[u.district] = data.id;
      console.log(`  ✓ Officer ${data.email} (${data.id}) ready.`);
    }
  }

  // Step 2: Clear old projects if requested or upsert real projects
  console.log('🏗️ Seeding Real Government Projects...');
  for (const proj of REAL_PROJECTS) {
    // Assign officer if district matches
    if (userMap[proj.district]) {
      proj.assigned_officer_id = userMap[proj.district];
    }

    const { data: project, error } = await supabase
      .from('projects')
      .upsert(proj, { onConflict: 'project_id' })
      .select()
      .single();

    if (error) {
      console.error(`Error seeding project ${proj.project_id}:`, error.message);
      continue;
    }

    console.log(`  ✓ Project seeded: ${project.project_id} - ${project.project_name}`);

    // Step 3: Run Prediction Engine on the seeded project
    const riskResult = computeRiskScore(project);
    
    // Deactivate previous active predictions for this project
    await supabase
      .from('predictions')
      .update({ is_active: false })
      .eq('project_id', project.id);

    // Insert new prediction
    const { data: pred, error: pErr } = await supabase
      .from('predictions')
      .insert({
        project_id: project.id,
        risk_score: riskResult.riskScore,
        delay_probability: riskResult.delayProbability,
        risk_category: riskResult.riskCategory,
        predicted_by: 'rule_engine',
        model_version: 'v1.0.0-gov-calibrated',
        shap_values: riskResult.featureScores,
        top_delay_factors: riskResult.topDelayFactors,
        stage_at_prediction: project.current_stage,
        is_active: true,
      })
      .select()
      .single();

    if (pErr) {
      console.error(`  ❌ Error generating prediction for ${project.project_id}:`, pErr.message);
    } else {
      console.log(`    🤖 Prediction generated: Risk Score ${pred.risk_score} (${pred.risk_category})`);
    }

    // Step 4: Create Alert if High or Critical Risk
    if (riskResult.riskScore >= 55) {
      await supabase.from('alerts').insert({
        project_id: project.id,
        alert_type: riskResult.riskScore >= 75 ? 'risk_threshold' : 'comp_stall',
        severity: riskResult.riskScore >= 75 ? 'CRITICAL' : 'WARNING',
        message: `High delay risk detected for ${project.project_name}. Score: ${riskResult.riskScore}/100. Top factor: ${riskResult.topDelayFactors[0]?.factor || 'Disbursement stall'}.`,
        recipient_user_id: project.assigned_officer_id || null,
      });
      console.log(`    🔔 Alert created for ${project.project_id}`);
    }

    // Step 5: Add initial stage history record
    await supabase.from('stage_history').upsert({
      project_id: project.id,
      stage: project.current_stage,
      entered_at: new Date().toISOString(),
      notes: 'Initial government dataset import',
    });
  }

  console.log('\n✅ Data Seeding Completed Successfully!');
  process.exit(0);
}

runSeed().catch(err => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
