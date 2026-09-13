'use strict';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import Middlewares
const { globalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

// Import Module Routers
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const projectsRoutes = require('./modules/projects/projects.routes');
const predictionsRoutes = require('./modules/predictions/predictions.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const gisRoutes = require('./modules/gis/gis.routes');
const alertsRoutes = require('./modules/alerts/alerts.routes');
const recommendationsRoutes = require('./modules/recommendations/recommendations.routes');
const officersRoutes = require('./modules/officers/officers.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const externalRoutes = require('./modules/external/external.routes');

const app = express();

// Security & Header Middlewares
app.use(helmet());

// CORS Configuration
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true
}));

// Body Parsers & Request Logging
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Apply Global Rate Limiter
app.use('/api', globalLimiter);

// Register API Routes (Version 1)
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, usersRoutes);
app.use(`${API_PREFIX}/projects`, projectsRoutes);
app.use(`${API_PREFIX}/predictions`, predictionsRoutes);
app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
app.use(`${API_PREFIX}/gis`, gisRoutes);
app.use(`${API_PREFIX}/alerts`, alertsRoutes);
app.use(`${API_PREFIX}/recommendations`, recommendationsRoutes);
app.use(`${API_PREFIX}/officers`, officersRoutes);
app.use(`${API_PREFIX}/audit`, auditRoutes);
app.use(`${API_PREFIX}/external`, externalRoutes);

// Health check shorthand at root
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'LandGuard AI API' });
});

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl} — Route not found`
  });
});

// Global Error Handler (Must be registered last)
app.use(errorHandler);

module.exports = app;
