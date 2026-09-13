'use strict';
/**
 * JWT Authentication Middleware
 * Verifies Bearer token and attaches decoded user to req.user
 */
const { verifyAccessToken } = require('../utils/jwt');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No authorization token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // { userId, role, state, district, email, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please refresh your session.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
}

function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
  } catch {
    req.user = null;
  }
  next();
}

module.exports = { authenticate, optionalAuthenticate };
