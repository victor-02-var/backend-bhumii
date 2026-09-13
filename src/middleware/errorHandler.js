'use strict';
/**
 * Global error handler middleware
 * Must be registered LAST in Express (after all routes)
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[Error]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    user: req.user?.userId,
  });

  // Supabase specific errors
  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'A record with this identifier already exists.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'Referenced record does not exist.' });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode < 500
    ? err.message
    : process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred.'
      : err.message;

  res.status(statusCode).json({ success: false, message });
}

module.exports = errorHandler;
