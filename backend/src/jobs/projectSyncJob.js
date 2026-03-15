const cron = require('node-cron');
const db = require('../config/db');
const logger = require('../utils/logger');
const { syncAllJiraProjects } = require('../services/jiraProjectService');
const { runAllProjectIssuesSyncJob } = require('../controllers/projectController');
const { startSyncJobLog, completeSyncJobLog, skipSyncJobLog, failSyncJobLog } = require('../services/syncJobLogService');

let isProjectSyncRunning = false;

function isEnabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

async function getSuperAdminJiraContext() {
  const superAdminEmail = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!superAdminEmail) {
    return null;
  }

  const [rows] = await db.query(
    `SELECT u.id AS user_id, oc.access_token, oc.refresh_token, oc.jira_cloud_id
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
    accessToken: row.access_token,
    refreshToken: row.refresh_token || null,
    cloudId: row.jira_cloud_id
  };
}

async function runProjectCatalogSyncJob({ trigger, requestId }) {
  let jobLogId = null;

  if (isProjectSyncRunning) {
    await startSyncJobLog({
      jobType: 'PROJECT_CATALOG_SYNC',
      triggerSource: trigger,
      requestId,
      status: 'SKIPPED',
      details: { reason: 'already_running' }
    });
    logger.warn('Project sync job: skipped because job already running', { requestId, trigger });
    return { skipped: true, reason: 'already_running', requestId };
  }

  isProjectSyncRunning = true;

  try {
    const jiraContext = await getSuperAdminJiraContext();
    jobLogId = await startSyncJobLog({
      jobType: 'PROJECT_CATALOG_SYNC',
      triggerSource: trigger,
      requestId,
      userId: jiraContext?.userId || null
    });

    if (!jiraContext) {
      await skipSyncJobLog({
        id: jobLogId,
        summary: {
          foundProjects: 0,
          insertedProjects: 0,
          updatedProjects: 0,
          unchangedProjects: 0,
          removedProjects: 0
        },
        details: { reason: 'missing_super_admin_jira_connection' }
      });
      logger.warn('Project sync job: skipped because super admin Jira connection is unavailable', {
        requestId,
        trigger
      });
      return { skipped: true, reason: 'missing_super_admin_jira_connection', requestId };
    }

    logger.info('Project sync job: started', {
      requestId,
      trigger,
      userId: jiraContext.userId
    });

    const result = await syncAllJiraProjects({
      userId: jiraContext.userId,
      accessToken: jiraContext.accessToken,
      refreshToken: jiraContext.refreshToken,
      cloudId: jiraContext.cloudId,
      requestId
    });

    await db.query('INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)', [
      jiraContext.userId,
      'JIRA_PROJECTS_SYNCED',
      JSON.stringify({ trigger, requestId, ...result })
    ]);

    await completeSyncJobLog({
      id: jobLogId,
      summary: {
        foundProjects: result.foundProjects,
        insertedProjects: result.insertedProjects,
        updatedProjects: result.updatedProjects,
        unchangedProjects: result.unchangedProjects,
        removedProjects: result.removedProjects
      },
      details: {
        trigger,
        requestId,
        pages: result.pages,
        absentFromLatestCatalog: result.absentFromLatestCatalog
      }
    });

    logger.info('Project sync job: finished', {
      requestId,
      trigger,
      userId: jiraContext.userId,
      syncedProjects: result.syncedProjects,
      pages: result.pages
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
        summary: {
          foundProjects: 0,
          insertedProjects: 0,
          updatedProjects: 0,
          unchangedProjects: 0,
          removedProjects: 0
        },
        details: { trigger, requestId },
        errorMessage: error.message
      });
    }
    throw error;
  } finally {
    isProjectSyncRunning = false;
  }
}

async function runProjectAndIssuesStartupSync() {
  const startupEnabled = isEnabled(process.env.PROJECTS_SYNC_RUN_ON_STARTUP);
  if (!startupEnabled) {
    logger.info('Project startup sync: disabled by env flag');
    return;
  }

  setImmediate(async () => {
    const projectRequestId = `project-sync-startup-${Date.now()}`;

    try {
      const projectResult = await runProjectCatalogSyncJob({
        trigger: 'startup',
        requestId: projectRequestId
      });

      if (projectResult?.skipped && projectResult.reason !== 'already_running') {
        return;
      }

      const jiraContext = await getSuperAdminJiraContext();
      if (!jiraContext) {
        logger.warn('Project issues startup sync: skipped because super admin Jira connection is unavailable', {
          requestId: `${projectRequestId}-issues`
        });
        return;
      }

      await runAllProjectIssuesSyncJob({
        userId: jiraContext.userId,
        requestId: `project-issues-sync-all-startup-${Date.now()}`,
        trigger: 'startup'
      });
    } catch (error) {
      logger.error('Project startup sync sequence failed', {
        requestId: projectRequestId,
        message: error.message,
        stack: error.stack,
        status: error.response?.status,
        responseData: error.response?.data
      });
    }
  });
}

function startProjectSyncCrons() {
  const projectsSchedule = String(process.env.PROJECTS_SYNC_CRON || '').trim();
  const projectIssuesSchedule = String(process.env.PROJECT_ISSUES_SYNC_CRON || '').trim();

  if (!projectsSchedule) {
    logger.info('Project sync cron: no schedule configured, job not scheduled');
  } else if (cron.validate(projectsSchedule)) {
    cron.schedule(projectsSchedule, async () => {
      const requestId = `project-sync-cron-${Date.now()}`;

      try {
        if (!isEnabled(process.env.PROJECTS_SYNC_CRON_ENABLED)) {
          logger.info('Project sync cron: skipped because disabled by env flag', {
            requestId,
            schedule: projectsSchedule
          });
          return;
        }

        await runProjectCatalogSyncJob({
          trigger: 'cron',
          requestId
        });
      } catch (error) {
        logger.error('Project sync cron failed', {
          requestId,
          message: error.message,
          stack: error.stack,
          status: error.response?.status,
          responseData: error.response?.data
        });
      }
    });

    logger.info('Project sync cron scheduled', { schedule: projectsSchedule });
  } else {
    logger.warn('Project sync cron: invalid cron expression, job not scheduled', {
      schedule: projectsSchedule
    });
  }

  if (!projectIssuesSchedule) {
    logger.info('Project issues cron: no schedule configured, job not scheduled');
  } else if (cron.validate(projectIssuesSchedule)) {
    cron.schedule(projectIssuesSchedule, async () => {
      const requestId = `project-issues-sync-all-cron-${Date.now()}`;

      try {
        if (!isEnabled(process.env.PROJECT_ISSUES_SYNC_CRON_ENABLED)) {
          logger.info('Project issues cron: skipped because disabled by env flag', {
            requestId,
            schedule: projectIssuesSchedule
          });
          return;
        }

        const jiraContext = await getSuperAdminJiraContext();
        if (!jiraContext) {
          logger.warn('Project issues cron: skipped because super admin Jira connection is unavailable', {
            requestId
          });
          return;
        }

        await runAllProjectIssuesSyncJob({
          userId: jiraContext.userId,
          requestId,
          trigger: 'cron'
        });
      } catch (error) {
        logger.error('Project issues cron failed', {
          requestId,
          message: error.message,
          stack: error.stack,
          status: error.response?.status,
          responseData: error.response?.data
        });
      }
    });

    logger.info('Project issues cron scheduled', { schedule: projectIssuesSchedule });
  } else {
    logger.warn('Project issues cron: invalid cron expression, job not scheduled', {
      schedule: projectIssuesSchedule
    });
  }
}

module.exports = {
  startProjectSyncCrons,
  runProjectAndIssuesStartupSync,
  runProjectCatalogSyncJob
};
