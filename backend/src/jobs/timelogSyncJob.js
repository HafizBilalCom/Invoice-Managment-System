const cron = require('node-cron');
const db = require('../config/db');
const logger = require('../utils/logger');
const { runTimelogSyncJob } = require('../controllers/timelogController');
const { startSyncJobLog, completeSyncJobLog, skipSyncJobLog, failSyncJobLog } = require('../services/syncJobLogService');

let isRunning = false;

function isEnabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

async function getSuperAdminJiraContext() {
  const superAdminEmail = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!superAdminEmail) {
    return null;
  }

  const [rows] = await db.query(
    `SELECT u.id AS user_id,
            oc.external_account_id,
            oc.external_email
     FROM users u
     LEFT JOIN oauth_connections oc
       ON oc.user_id = u.id
      AND oc.provider = 'JIRA'
     WHERE LOWER(u.email) = ?
     LIMIT 1`,
    [superAdminEmail]
  );

  const row = rows[0];
  if (!row?.user_id || !row?.external_account_id) {
    return null;
  }

  return {
    userId: Number(row.user_id),
    jiraAccountId: row.external_account_id,
    jiraEmail: row.external_email || null
  };
}

async function runTimelogSyncManagedJob({ trigger, requestId, userId = null, jiraAccountId = null }) {
  let jobLogId = null;

  if (isRunning) {
    await startSyncJobLog({
      jobType: 'TIMELOG_SYNC',
      triggerSource: trigger,
      requestId,
      userId,
      status: 'SKIPPED',
      details: { reason: 'already_running' }
    });
    logger.warn('Timelog sync job: skipped because job already running', { requestId, trigger, userId });
    return { skipped: true, reason: 'already_running', requestId };
  }

  isRunning = true;

  try {
    let effectiveUserId = userId;
    let effectiveJiraAccountId = jiraAccountId;

    if (!effectiveUserId || !effectiveJiraAccountId) {
      const jiraContext = await getSuperAdminJiraContext();
      if (!jiraContext) {
        jobLogId = await startSyncJobLog({
          jobType: 'TIMELOG_SYNC',
          triggerSource: trigger,
          requestId,
          userId: userId || null
        });

        await skipSyncJobLog({
          id: jobLogId,
          summary: {
            syncedCount: 0,
            inserted: 0,
            updated: 0,
            unchanged: 0,
            deletedMarked: 0,
            deletedMissing: 0,
            skippedNoProjectReference: 0,
            skippedNoAuthorUser: 0
          },
          details: { reason: 'missing_super_admin_jira_connection' }
        });

        logger.warn('Timelog sync job: skipped because super admin Jira connection is unavailable', {
          requestId,
          trigger
        });
        return { skipped: true, reason: 'missing_super_admin_jira_connection', requestId };
      }

      effectiveUserId = jiraContext.userId;
      effectiveJiraAccountId = jiraContext.jiraAccountId;
    }

    jobLogId = await startSyncJobLog({
      jobType: 'TIMELOG_SYNC',
      triggerSource: trigger,
      requestId,
      userId: effectiveUserId
    });

    logger.info('Timelog sync job: started', {
      requestId,
      trigger,
      userId: effectiveUserId
    });

    const result = await runTimelogSyncJob({
      userId: effectiveUserId,
      jiraAccountId: effectiveJiraAccountId,
      requestId
    });

    await completeSyncJobLog({
      id: jobLogId,
      summary: {
        mode: result.mode,
        syncedCount: result.syncedCount,
        inserted: result.inserted,
        updated: result.updated,
        unchanged: result.unchanged,
        deletedMarked: result.deletedMarked,
        deletedMissing: result.deletedMissing,
        skippedNoProjectReference: result.skippedNoProjectReference,
        skippedNoAuthorUser: result.skippedNoAuthorUser
      },
      details: {
        requestId,
        trigger,
        from: result.from,
        to: result.to,
        updatedFrom: result.updatedFrom,
        nextCursor: result.nextCursor,
        totalHours: result.totalHours,
        linkedProjects: result.linkedProjects,
        unlinkedProjects: result.unlinkedProjects
      }
    });

    logger.info('Timelog sync job: finished', {
      requestId,
      trigger,
      userId: effectiveUserId,
      mode: result.mode,
      syncedCount: result.syncedCount,
      inserted: result.inserted,
      updated: result.updated,
      unchanged: result.unchanged,
      deletedMarked: result.deletedMarked
    });

    return {
      skipped: false,
      requestId,
      trigger,
      ...result
    };
  } catch (error) {
    if (jobLogId) {
      await failSyncJobLog({
        id: jobLogId,
        details: { requestId, trigger },
        errorMessage: error.message
      });
    }
    throw error;
  } finally {
    isRunning = false;
  }
}

function startTimelogSyncCrons() {
  const schedule = String(process.env.TIMELOG_SYNC_CRON || '').trim();

  if (!schedule) {
    logger.info('Timelog sync cron: no schedule configured, job not scheduled');
    return;
  }

  if (!cron.validate(schedule)) {
    logger.warn('Timelog sync cron: invalid cron expression, job not scheduled', { schedule });
    return;
  }

  cron.schedule(schedule, async () => {
    const requestId = `timelog-sync-cron-${Date.now()}`;

    try {
      if (!isEnabled(process.env.TIMELOG_SYNC_CRON_ENABLED)) {
        logger.info('Timelog sync cron: skipped because disabled by env flag', {
          requestId,
          schedule
        });
        return;
      }

      await runTimelogSyncManagedJob({
        trigger: 'cron',
        requestId
      });
    } catch (error) {
      logger.error('Timelog sync cron failed', {
        requestId,
        message: error.message,
        stack: error.stack,
        status: error.response?.status,
        responseData: error.response?.data
      });
    }
  });

  logger.info('Timelog sync cron scheduled', { schedule });
}

function runTimelogStartupSync() {
  if (!isEnabled(process.env.TIMELOG_SYNC_RUN_ON_STARTUP)) {
    logger.info('Timelog startup sync: disabled by env flag');
    return;
  }

  setImmediate(async () => {
    const requestId = `timelog-sync-startup-${Date.now()}`;

    try {
      await runTimelogSyncManagedJob({
        trigger: 'startup',
        requestId
      });
    } catch (error) {
      logger.error('Timelog startup sync failed', {
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
  runTimelogSyncManagedJob,
  startTimelogSyncCrons,
  runTimelogStartupSync
};
