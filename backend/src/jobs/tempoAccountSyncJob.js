const cron = require('node-cron');
const db = require('../config/db');
const logger = require('../utils/logger');
const { fetchAllTempoAccounts, upsertTempoAccounts, parseLimit } = require('../services/tempoAccountService');

let isRunning = false;

async function runTempoAccountSync({ trigger, triggeredByUserId = null, requestId }) {
  if (isRunning) {
    logger.warn('Tempo account sync: skipped because job already running', { requestId, trigger, triggeredByUserId });
    return { skipped: true, reason: 'already_running', requestId };
  }

  isRunning = true;

  try {
    logger.info('Tempo account sync: started', {
      requestId,
      trigger,
      triggeredByUserId,
      pageLimit: parseLimit()
    });

    const { accounts, pageCount, limit } = await fetchAllTempoAccounts({ requestId });
    const upsert = await upsertTempoAccounts({ accounts, requestId });

    await db.query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
      [
        triggeredByUserId,
        'TEMPO_ACCOUNTS_SYNCED',
        JSON.stringify({ trigger, pageCount, limit, total: accounts.length, ...upsert })
      ]
    );

    logger.info('Tempo account sync: finished', {
      requestId,
      trigger,
      triggeredByUserId,
      pageCount,
      limit,
      total: accounts.length,
      ...upsert
    });

    return {
      skipped: false,
      requestId,
      trigger,
      pageCount,
      limit,
      total: accounts.length,
      ...upsert
    };
  } finally {
    isRunning = false;
  }
}

function startTempoAccountSyncCron() {
  const schedule = process.env.TEMPO_ACCOUNTS_SYNC_CRON || '0 2 * * *';

  if (!cron.validate(schedule)) {
    logger.warn('Tempo account sync: invalid cron expression, job not scheduled', { schedule });
    return;
  }

  cron.schedule(schedule, async () => {
    const requestId = `tempo-accounts-cron-${Date.now()}`;

    try {
      await runTempoAccountSync({
        trigger: 'cron',
        requestId
      });
    } catch (error) {
      logger.error('Tempo account sync: cron run failed', {
        requestId,
        message: error.message,
        stack: error.stack,
        status: error.response?.status,
        responseData: error.response?.data
      });
    }
  });

  logger.info('Tempo account sync: cron scheduled', { schedule });
}

module.exports = {
  startTempoAccountSyncCron,
  runTempoAccountSync
};
