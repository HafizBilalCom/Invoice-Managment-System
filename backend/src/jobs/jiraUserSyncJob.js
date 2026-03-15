const cron = require('node-cron');
const db = require('../config/db');
const logger = require('../utils/logger');
const { syncJiraUsers } = require('../services/jiraUserService');
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
            oc.access_token,
            oc.refresh_token,
            oc.jira_cloud_id
     FROM users u
     LEFT JOIN oauth_connections oc
       ON oc.user_id = u.id
      AND oc.provider = 'JIRA'
     WHERE LOWER(u.email) = ?
     LIMIT 1`,
    [superAdminEmail]
  );

  const row = rows[0];
  if (!row?.user_id || !row?.access_token || !row?.jira_cloud_id) {
    return null;
  }

  return {
    userId: Number(row.user_id),
    jiraConnection: {
      access_token: row.access_token,
      refresh_token: row.refresh_token || null,
      jira_cloud_id: row.jira_cloud_id
    }
  };
}

async function runJiraUsersSyncJob({ trigger, requestId, userId = null, jiraConnection = null }) {
  let jobLogId = null;

  if (isRunning) {
    await startSyncJobLog({
      jobType: 'JIRA_USERS_SYNC',
      triggerSource: trigger,
      requestId,
      userId,
      status: 'SKIPPED',
      details: { reason: 'already_running' }
    });
    logger.warn('Jira users sync job: skipped because job already running', { requestId, trigger, userId });
    return { skipped: true, reason: 'already_running', requestId };
  }

  isRunning = true;

  try {
    let effectiveUserId = userId;
    let effectiveJiraConnection = jiraConnection;

    if (!effectiveUserId || !effectiveJiraConnection?.jira_cloud_id) {
      const jiraContext = await getSuperAdminJiraContext();
      if (!jiraContext) {
        jobLogId = await startSyncJobLog({
          jobType: 'JIRA_USERS_SYNC',
          triggerSource: trigger,
          requestId,
          userId: userId || null
        });

        await skipSyncJobLog({
          id: jobLogId,
          summary: {
            totalFetched: 0,
            inserted: 0,
            updated: 0,
            unchanged: 0,
            skippedInvalidEmail: 0,
            createdSystemUsers: 0
          },
          details: { reason: 'missing_super_admin_jira_connection' }
        });

        logger.warn('Jira users sync job: skipped because super admin Jira connection is unavailable', {
          requestId,
          trigger
        });
        return { skipped: true, reason: 'missing_super_admin_jira_connection', requestId };
      }

      effectiveUserId = jiraContext.userId;
      effectiveJiraConnection = jiraContext.jiraConnection;
    }

    jobLogId = await startSyncJobLog({
      jobType: 'JIRA_USERS_SYNC',
      triggerSource: trigger,
      requestId,
      userId: effectiveUserId
    });

    logger.info('Jira users sync job: started', {
      requestId,
      trigger,
      userId: effectiveUserId
    });

    const result = await syncJiraUsers({
      userId: effectiveUserId,
      jiraConnection: effectiveJiraConnection,
      requestId
    });

    await completeSyncJobLog({
      id: jobLogId,
      summary: {
        totalFetched: result.totalFetched,
        inserted: result.inserted,
        updated: result.updated,
        unchanged: result.unchanged,
        skippedInvalidEmail: result.skippedInvalidEmail,
        createdSystemUsers: result.createdSystemUsers
      },
      details: {
        requestId,
        trigger,
        pageCount: result.pageCount
      }
    });

    logger.info('Jira users sync job: finished', {
      requestId,
      trigger,
      userId: effectiveUserId,
      ...result
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

function startJiraUsersSyncCrons() {
  const schedule = String(process.env.JIRA_USERS_SYNC_CRON || '').trim();

  if (!schedule) {
    logger.info('Jira users sync cron: no schedule configured, job not scheduled');
    return;
  }

  if (!cron.validate(schedule)) {
    logger.warn('Jira users sync cron: invalid cron expression, job not scheduled', { schedule });
    return;
  }

  cron.schedule(schedule, async () => {
    const requestId = `jira-users-sync-cron-${Date.now()}`;

    try {
      if (!isEnabled(process.env.JIRA_USERS_SYNC_CRON_ENABLED)) {
        logger.info('Jira users sync cron: skipped because disabled by env flag', {
          requestId,
          schedule
        });
        return;
      }

      await runJiraUsersSyncJob({
        trigger: 'cron',
        requestId
      });
    } catch (error) {
      logger.error('Jira users sync cron failed', {
        requestId,
        message: error.message,
        stack: error.stack,
        status: error.response?.status,
        responseData: error.response?.data
      });
    }
  });

  logger.info('Jira users sync cron scheduled', { schedule });
}

function runJiraUsersStartupSync() {
  if (!isEnabled(process.env.JIRA_USERS_SYNC_RUN_ON_STARTUP)) {
    logger.info('Jira users startup sync: disabled by env flag');
    return;
  }

  setImmediate(async () => {
    const requestId = `jira-users-sync-startup-${Date.now()}`;

    try {
      await runJiraUsersSyncJob({
        trigger: 'startup',
        requestId
      });
    } catch (error) {
      logger.error('Jira users startup sync failed', {
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
  runJiraUsersSyncJob,
  startJiraUsersSyncCrons,
  runJiraUsersStartupSync
};
