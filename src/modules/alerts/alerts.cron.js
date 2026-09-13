'use strict';
const cron = require('node-cron');
const { runAlertCheckCron } = require('./alerts.service');

function initAlertCron() {
  // Run every 6 hours (00:00, 06:00, 12:00, 18:00)
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron Job] Triggering 6-hourly project delay risk & milestone audit...');
    await runAlertCheckCron();
  });

  console.log('✅ Alert cron scheduler initialized (runs every 6 hours).');
}

module.exports = { initAlertCron };
