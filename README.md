# 🛡️ LandGuard AI — Predictive Analytics System Backend

> **SIH PS-25017**: Early Detection & Mitigation System for Land Acquisition Delays  
> Built with **Node.js (Express)**, **Supabase (PostgreSQL)**, **Nodemailer (Gmail SMTP)**, and **Rule-Based/ML Risk Engines**.

---

## 🌟 Key Features

1. **🔒 Secure Authentication, RBAC & PostgreSQL Row-Level Security (RLS)**
   - OTP-based email verification flow for user registration.
   - JWT access (15 min) and refresh tokens (7 days).
   - Strict 5-tier Role-Based Access Control: `district_officer` < `collector` < `state_admin` < `central_admin` < `ministry`.
   - **Row Level Security (RLS)** enabled directly on PostgreSQL tables in [001_init_schema.sql](file:///c:/Users/ADITYA/OneDrive/Desktop/sih/sih-backend/migrations/001_init_schema.sql) for defense-in-depth security.

2. **📊 Land Acquisition Project Management & Stage Tracking**
   - Full statutory LARR lifecycle tracking across 10 defined stages (Stage 0 to Stage 9).
   - Automated calculation of Section 11 lapse dates (12 months from Section 11 notification).
   - Automatic logging of stage transitions in `stage_history`.

3. **🤖 Dual Risk Prediction Engine (ML Microservice + Rule-Based Fallback)**
   - Calculates delay risk score (0-100), probability (0-1), and risk categories (`Low`, `Medium`, `High`, `Critical`).
   - Weighted risk score formulation incorporating compensation disbursement %, pending legal disputes, Section 11 lapse proximity, R&R progress, and pending documents.
   - Webhook interface (`POST /api/v1/external/ml-webhook`) to integrate seamlessly with external Python ML (FastAPI/Flask/joblib) models.

4. **💡 Interventions & Actionable Recommendations Engine**
   - Dynamically translates top risk factors into targeted corrective recommendations with deadlines, priorities, and assigned authorities (e.g., District Collector, State Legal Dept).

5. **🔔 Automated Alert & Nodemailer Notification Engine**
   - 6-hourly background cron scanner auditing project thresholds:
     - **Section 11 Lapse Watch**: Proximity warning (< 45 days).
     - **High Risk Threshold Cross**: Automatic alert when risk score >= 70%.
     - **Compensation Stall**: Warning when compensation disbursement < 30% after 90 days of award.
     - **R&R Possession Conflict**: Warning when possession > 70% while rehab < 50%.
   - Instant HTML notification email dispatch via Nodemailer (Gmail SMTP).

6. **🗺️ GIS Mapping & Choropleth Data API**
   - GeoJSON feature collection endpoint (`GET /api/v1/gis/projects/geojson`) for Leaflet / Mapbox.
   - Aggregated district and state risk heatmaps.

7. **📈 Analytical Dashboard API**
   - KPI metrics, monthly delay trends, risk distributions, LARR stage funnel analytics, officer efficiency rankings, and comparative state-level metrics.

---

## 📁 Directory Structure

```
sih-backend/
├── migrations/
│   └── 001_init_schema.sql         # Complete PostgreSQL schema DDL & indexes
├── src/
│   ├── config/
│   │   ├── supabase.js             # Supabase DB client initialization
│   │   ├── nodemailer.js           # Nodemailer transport initialization
│   │   └── env.js                  # Environment variable validation
│   ├── middleware/
│   │   ├── auth.js                 # JWT Bearer token verification
│   │   ├── rbac.js                 # Role hierarchy & scope filters
│   │   ├── audit.js                # Auto-audit trail logger
│   │   ├── rateLimiter.js          # Express rate limiting
│   │   └── errorHandler.js         # Global error handler middleware
│   ├── modules/
│   │   ├── auth/                   # Signup, Login, OTP, Refresh Token
│   │   ├── users/                  # User Management & Profile
│   │   ├── projects/               # Projects CRUD, Stage Track, CSV Import
│   │   ├── predictions/            # ML/Rule Risk Engine endpoints
│   │   ├── dashboard/              # Analytics, KPIs, Funnel, Trends
│   │   ├── gis/                    # GeoJSON & Risk Heatmaps
│   │   ├── alerts/                 # Alerts & Background Cron Scanner
│   │   ├── recommendations/        # Actionable Directives
│   │   ├── officers/               # Officer Directory & Performance
│   │   ├── audit/                  # Audit Trail Search
│   │   └── external/               # ML Webhook, CSV Exports, Health Check
│   ├── utils/
│   │   ├── jwt.js                  # Token signing/verification helpers
│   │   ├── otp.js                  # OTP generation & hashing
│   │   ├── mailer.js               # Styled HTML email templates
│   │   ├── riskEngine.js           # Rule-based risk scoring algorithm
│   │   ├── recommendEngine.js      # Corrective action mapper
│   │   ├── dateUtils.js            # Lightweight date helpers
│   │   └── pagination.js           # Standardized paginated response builder
│   └── app.js                      # Express App assembly
├── .env.example                    # Environment variable template
├── package.json                    # Dependencies & NPM scripts
├── server.js                       # HTTP server entry & cron initializer
└── README.md
```

---

## ⚙️ Environment Configuration (`.env`)

Create a `.env` file in the root directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Supabase Database
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# JWT Configuration
JWT_ACCESS_SECRET=your_super_secret_access_key_min_32_chars!
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_chars!
JWT_TEMP_SECRET=your_super_secret_temp_key_min_32_chars!
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Nodemailer (Gmail SMTP Setup)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_digit_app_password
EMAIL_FROM="LandGuard AI <your_email@gmail.com>"

# Frontend Integration
FRONTEND_URL=http://localhost:5173

# ML Integration Webhook Key
ML_SERVICE_URL=http://localhost:8000
ML_API_KEY=sih-ml-secret-key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=10
```

---

## 🚀 Quick Start & Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Database Migration
Execute `migrations/001_init_schema.sql` inside your **Supabase SQL Editor** or via PostgreSQL CLI to create all 8 tables, indexes, triggers, and seed admin user.

### 3. Launch Development Server
```bash
npm run dev
```
The server will start at `http://localhost:3000`.

---

## 🔌 Core API Reference Summary

| Module | Route | Method | Access Level | Description |
|---|---|---|---|---|
| **Health** | `/health` | GET | Public | Server status check |
| **Auth** | `/api/v1/auth/send-otp` | POST | Public | Send signup email OTP |
| **Auth** | `/api/v1/auth/verify-otp` | POST | Public | Verify OTP code |
| **Auth** | `/api/v1/auth/signup` | POST | Public | Complete user registration |
| **Auth** | `/api/v1/auth/login` | POST | Public | User login -> return JWTs |
| **Projects** | `/api/v1/projects` | GET | Authenticated | List RBAC-scoped projects |
| **Projects** | `/api/v1/projects` | POST | District Officer+ | Create land acquisition project |
| **Projects** | `/api/v1/projects/:id/stage` | PATCH | District Officer+ | Update project stage |
| **Predictions**| `/api/v1/predictions/run/:projectId`| POST | District Officer+ | Run prediction on project |
| **Dashboard** | `/api/v1/dashboard/stats` | GET | Authenticated | Overview KPIs & statistics |
| **GIS** | `/api/v1/gis/projects/geojson` | GET | Authenticated | GeoJSON map features |
| **Alerts** | `/api/v1/alerts/my` | GET | Authenticated | User alert notifications |
| **External** | `/api/v1/external/ml-webhook` | POST | ML Key | Webhook for Python ML model |

---

## 🛡️ License & Acknowledgments

Developed for **Smart India Hackathon (SIH) — PS-25017**.
