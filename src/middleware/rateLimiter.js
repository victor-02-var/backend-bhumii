'use strict';
const rateLimit = require('express-rate-limit');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 min
const globalMax = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
const authMax = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10);

const globalLimiter = rateLimit({
  windowMs,
  max: globalMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// Stricter limit for auth endpoints to prevent brute-force
const authLimiter = rateLimit({
  windowMs,
  max: authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true, // Don't count successful logins
});

module.exports = { globalLimiter, authLimiter };
