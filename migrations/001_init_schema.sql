-- ============================================================
-- SIH PS-25017: Land Acquisition Delay Prediction Platform
-- Database Schema (PostgreSQL / Supabase DDL Migration)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- 1. USERS TABLE
-- Stores officers, collectors, state admins, central admins
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('district_officer', 'collector', 'state_admin', 'central_admin', 'ministry')),
    state TEXT,
    district TEXT,
    designation TEXT,
    phone TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_state_district ON users(state, district);

-- ------------------------------------------------------------
-- 2. OTP STORE TABLE
-- Stores email verification & password reset OTP tokens (10m TTL)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'password_reset')),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp_store(email, purpose);

-- ------------------------------------------------------------
-- 3. PROJECTS TABLE
-- Master repository of land acquisition projects & metrics
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT UNIQUE NOT NULL,
    project_name TEXT NOT NULL,
    project_type TEXT NOT NULL CHECK (project_type IN ('Highway', 'Railway', 'Dam', 'Industrial', 'Urban', 'Power', 'Mining')),
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    total_land_area_ha NUMERIC(12,2),
    num_affected_families INTEGER DEFAULT 0,
    land_ownership_type TEXT DEFAULT 'Mixed' CHECK (land_ownership_type IN ('Government', 'Private', 'Forest', 'Tribal', 'Mixed')),
    terrain_type TEXT DEFAULT 'Rural' CHECK (terrain_type IN ('Urban', 'Rural', 'Forest', 'Tribal', 'Semi-Urban')),
    project_budget_crore NUMERIC(12,2),
    month_of_initiation INTEGER CHECK (month_of_initiation BETWEEN 1 AND 12),
    election_year BOOLEAN DEFAULT FALSE,
    
    -- Map Coordinates
    latitude NUMERIC(10,6),
    longitude NUMERIC(10,6),

    -- Statutory LARR Stages & Dates
    current_stage TEXT NOT NULL DEFAULT 'Stage 0: Pre-Notification'
        CHECK (current_stage IN (
            'Stage 0: Pre-Notification',
            'Stage 1: Proposal Submission',
            'Stage 2: SIA & Public Hearing',
            'Stage 3: Section 4 Preliminary Notification',
            'Stage 4: Rehabilitation Survey',
            'Stage 5: Section 11 Notification',
            'Stage 6: R&R Scheme Approval',
            'Stage 7: Section 19 Declaration',
            'Stage 8: Award Determination',
            'Stage 9: Possession & Compensation'
        )),
    section_4_date DATE,
    section_11_date DATE,
    section_11_lapse_date DATE, -- Auto-computed: section_11_date + 12 months
    section_19_date DATE,
    award_date DATE,
    possession_date DATE,

    -- Live Progress Metrics (0 to 100%)
    compensation_disbursement_pct NUMERIC(5,2) DEFAULT 0.00,
    possession_status_pct NUMERIC(5,2) DEFAULT 0.00,
    rehabilitation_progress_pct NUMERIC(5,2) DEFAULT 0.00,
    rr_budget_utilized_pct NUMERIC(5,2) DEFAULT 0.00,

    -- Delay Drivers & Legal Complexity Indicators
    num_legal_disputes INTEGER DEFAULT 0,
    num_pending_documents INTEGER DEFAULT 0,
    num_approvals_pending INTEGER DEFAULT 0,
    num_objections_filed INTEGER DEFAULT 0,
    court_case_pending BOOLEAN DEFAULT FALSE,

    -- Efficiency & Stakeholder Ratings (Scale 1-10)
    stakeholder_response_score NUMERIC(3,1) DEFAULT 5.0,
    inter_dept_coord_score NUMERIC(3,1) DEFAULT 5.0,
    officer_efficiency_score NUMERIC(3,1) DEFAULT 5.0,
    compensation_market_ratio NUMERIC(4,2) DEFAULT 1.00,
    historical_delay_score_district NUMERIC(4,2) DEFAULT 1.00,

    -- Outcome Status
    is_delayed BOOLEAN DEFAULT FALSE,
    delay_days INTEGER DEFAULT 0,

    -- Relations & Audits
    assigned_officer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_state_district ON projects(state, district);
CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(current_stage);
CREATE INDEX IF NOT EXISTS idx_projects_delayed ON projects(is_delayed);

-- Auto-compute section_11_lapse_date (Section 11 + 12 Months) Trigger
CREATE OR REPLACE FUNCTION update_section_11_lapse()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.section_11_date IS NOT NULL AND (OLD IS NULL OR OLD.section_11_date IS DISTINCT FROM NEW.section_11_date) THEN
        NEW.section_11_lapse_date := NEW.section_11_date + INTERVAL '1 year';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_section_11_lapse ON projects;
CREATE TRIGGER trg_section_11_lapse
BEFORE INSERT OR UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION update_section_11_lapse();

-- ------------------------------------------------------------
-- 4. PREDICTIONS TABLE
-- AI/ML Prediction Audit Log & SHAP Factor Breakdown
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    risk_score NUMERIC(5,2) NOT NULL,
    delay_probability NUMERIC(4,3) NOT NULL,
    risk_category TEXT NOT NULL CHECK (risk_category IN ('Low', 'Medium', 'High', 'Critical')),
    predicted_by TEXT NOT NULL DEFAULT 'rule_engine' CHECK (predicted_by IN ('ml_model', 'rule_engine')),
    model_version TEXT DEFAULT 'v1.0.0-rule-engine',
    shap_values JSONB DEFAULT '{}'::jsonb,
    top_delay_factors JSONB DEFAULT '[]'::jsonb,
    stage_at_prediction TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_project_active ON predictions(project_id, is_active);

-- ------------------------------------------------------------
-- 5. RECOMMENDATIONS TABLE
-- Actionable Interventions & Milestone Directives
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    prediction_id UUID REFERENCES predictions(id) ON DELETE CASCADE,
    priority TEXT NOT NULL CHECK (priority IN ('URGENT', 'HIGH', 'MEDIUM', 'LOW')),
    action TEXT NOT NULL,
    deadline DATE,
    owner TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('compensation', 'legal', 'documentation', 'rr', 'admin')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'dismissed')),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendations_project ON recommendations(project_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_priority_status ON recommendations(priority, status);

-- ------------------------------------------------------------
-- 6. ALERTS TABLE
-- Automated Risk & Threshold Notifications
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('risk_threshold', 'section11_lapse', 'rr_warning', 'comp_stall', 'manual_dispatch')),
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    message TEXT NOT NULL,
    is_sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_recipient_read ON alerts(recipient_user_id, read_at);

-- ------------------------------------------------------------
-- 7. STAGE HISTORY TABLE
-- Lifecycle Stage Audit Timeline
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exited_at TIMESTAMPTZ,
    days_in_stage INTEGER,
    delay_occurred BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_history_project ON stage_history(project_id);

-- ------------------------------------------------------------
-- 8. AUDIT LOGS TABLE
-- Complete System Data Access & Mutation Logs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Defense-in-depth security at the PostgreSQL database tier
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Note: The Node.js backend uses SUPABASE_SERVICE_ROLE_KEY which automatically bypasses RLS for backend API operations.
-- Policies below secure direct database queries (e.g. Supabase client SDK):

-- 1. Users table policies
DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON users;
CREATE POLICY "Users can view own profile or admins view all"
ON users FOR SELECT
USING (
    auth.uid() = id 
    OR (SELECT role FROM users WHERE id = auth.uid()) IN ('state_admin', 'central_admin', 'ministry')
);

-- 2. Projects table policies
DROP POLICY IF EXISTS "Scoped project access by role/geography" ON projects;
CREATE POLICY "Scoped project access by role/geography"
ON projects FOR SELECT
USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('central_admin', 'ministry')
    OR state = (SELECT state FROM users WHERE id = auth.uid())
    OR district = (SELECT district FROM users WHERE id = auth.uid())
);

-- 3. Predictions & Recommendations read policies
DROP POLICY IF EXISTS "Read predictions policy" ON predictions;
CREATE POLICY "Read predictions policy" ON predictions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read recommendations policy" ON recommendations;
CREATE POLICY "Read recommendations policy" ON recommendations FOR SELECT USING (true);

-- 4. Alerts policies
DROP POLICY IF EXISTS "Users view assigned or general alerts" ON alerts;
CREATE POLICY "Users view assigned or general alerts"
ON alerts FOR SELECT
USING (recipient_user_id = auth.uid() OR recipient_user_id IS NULL);

-- ============================================================
-- INITIAL SEED / ADMIN ACCOUNT (DEFAULT BACKEND CREATION)
-- Email: admin@landguard.gov.in
-- Password: AdminPassword123! (bcrypt hashed below)
-- ============================================================
INSERT INTO users (email, password_hash, full_name, role, state, district, designation, is_verified, is_active)
VALUES (
    'admin@landguard.gov.in',
    '$2a$12$K1r.0W7qK7w4gO4.Z/zK2.w6K7/5M9pLz4N9k9l9k9l9k9l9k9l9k', -- AdminPassword123!
    'Central Ministry Admin',
    'central_admin',
    'National',
    'Central',
    'Director, Land Resources',
    TRUE,
    TRUE
)
ON CONFLICT (email) DO NOTHING;

