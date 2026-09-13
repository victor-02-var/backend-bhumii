'use strict';
require('dotenv').config();
const app = require('./src/app');
const { initAlertCron } = require('./src/modules/alerts/alerts.cron');

const PORT = process.env.PORT || 3000;

// Start Server
const server = app.listen(PORT, () => {
  console.log(`
===========================================================
🚀 LandGuard AI — Land Acquisition Delay Prediction API
📡 Server running on port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Health check: http://localhost:${PORT}/health
===========================================================
  `);

  // Initialize automated cron schedulers
  initAlertCron();
});

// Graceful Shutdown Handling
const shutdown = (signal) => {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] Closed remaining active connections.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server] Could not close connections in time, forcing exit.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
