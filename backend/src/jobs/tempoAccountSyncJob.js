const cron = require('node-cron');
const db = require('../config/db');
const logger = require('../utils/logger');
const { fetchAllTempoAccounts, upsertTempoAccounts, parseLimit } = require('../services/tempoAccountService');
const { startSyncJobLog, completeSyncJobLog, skipSyncJobLog, failSyncJobLog } = require('../services/syncJobLogService');

let isRunning = false;

function isEnabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

async function runTempoAccountSync({ trigger, triggeredByUserId = null, requestId }) {
  let jobLogId = null;

  if (isRunning) {
    await startSyncJobLog({
      jobType: 'TEMPO_ACCOUNTS_SYNC',
      triggerSource: trigger,
      requestId,
      userId: triggeredByUserId,
      status: 'SKIPPED',
      details: { reason: 'already_running' }
    });
    logger.warn('Tempo account sync: skipped because job already running', { requestId, trigger, triggeredByUserId });
    return { skipped: true, reason: 'already_running', requestId };
  }

  isRunning = true;

  try {
    jobLogId = await startSyncJobLog({
      jobType: 'TEMPO_ACCOUNTS_SYNC',
      triggerSource: trigger,
      requestId,
      userId: triggeredByUserId
    });

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

    await completeSyncJobLog({
      id: jobLogId,
      summary: {
        totalAccounts: accounts.length,
        insertedAccounts: upsert.inserted,
        updatedAccounts: upsert.updated,
        unchangedAccounts: upsert.unchanged
      },
      details: {
        requestId,
        pageCount,
        limit,
        trigger
      }
    });

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
  } catch (error) {
    if (jobLogId) {
      await failSyncJobLog({
        id: jobLogId,
        details: {
          requestId,
          trigger
        },
        errorMessage: error.message
      });
    }
    throw error;
  } finally {
    isRunning = false;
  }
}

function startTempoAccountSyncCrons() {
  const schedule = String(process.env.TEMPO_ACCOUNTS_SYNC_CRON || '').trim();

  if (!schedule) {
    logger.info('Tempo account sync cron: no schedule configured, job not scheduled');
    return;
  }

  if (!cron.validate(schedule)) {
    logger.warn('Tempo account sync cron: invalid cron expression, job not scheduled', { schedule });
    return;
  }

  cron.schedule(schedule, async () => {
    const requestId = `tempo-accounts-cron-${Date.now()}`;

    try {
      if (!isEnabled(process.env.TEMPO_ACCOUNTS_SYNC_CRON_ENABLED)) {
        logger.info('Tempo account sync cron: skipped because disabled by env flag', {
          requestId,
          schedule
        });
        return;
      }

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

  logger.info('Tempo account sync cron scheduled', { schedule });
}

function runTempoAccountStartupSync() {
  if (!isEnabled(process.env.TEMPO_ACCOUNTS_SYNC_RUN_ON_STARTUP)) {
    logger.info('Tempo account startup sync: disabled by env flag');
    return;
  }

  setImmediate(async () => {
    const requestId = `tempo-accounts-startup-${Date.now()}`;

    try {
      await runTempoAccountSync({
        trigger: 'startup',
        requestId
      });
    } catch (error) {
      logger.error('Tempo account startup sync failed', {
        requestId,
        message: error.message,
        stack: error.stack,
        status: error.response?.status,
        responseData: error.response?.data
      });
    }
  });
}

module.exports = {
  startTempoAccountSyncCrons,
  runTempoAccountStartupSync,
  runTempoAccountSync
};
