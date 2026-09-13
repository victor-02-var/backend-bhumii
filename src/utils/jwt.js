'use strict';
/**
 * JWT utility helpers — sign and verify access/refresh tokens
 */
const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in .env');
}

/**
 * Sign an access token (short-lived, 15 min)
 * @param {Object} payload - { userId, role, state, district }
 */
function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

/**
 * Sign a refresh token (long-lived, 7 days)
 */
function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}

/**
 * Sign a short-lived temp token (for OTP-verified signup continuation)
 */
function signTempToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '20m' });
}

/**
 * Verify access token — returns decoded payload or throws
 */
function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

/**
 * Verify refresh token — returns decoded payload or throws
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  signTempToken,
  verifyAccessToken,
  verifyRefreshToken,
};
