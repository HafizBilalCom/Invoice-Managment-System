const db = require('../config/db');
const logger = require('../utils/logger');
const { syncIssuesForProject } = require('../services/jiraIssueService');
const { syncAllJiraProjects } = require('../services/jiraProjectService');
const { startSyncJobLog, completeSyncJobLog, failSyncJobLog } = require('../services/syncJobLogService');

const allIssuesSyncState = {
  running: false,
  requestId: null,
  startedAt: null,
  finishedAt: null,
  triggeredByUserId: null,
  totalProjects: 0,
  processedProjects: 0,
  successProjects: 0,
  failedProjects: 0,
  status: 'IDLE',
  lastError: null,
  lastResult: null
};

async function getLatestJiraConnection(userId) {
  const [rows] = await db.query(
    `SELECT access_token, refresh_token, jira_cloud_id
     FROM oauth_connections
     WHERE user_id = ? AND provider = 'JIRA'
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

function getProjectIssuesSyncConcurrency() {
  const parsed = Number(process.env.JIRA_PROJECT_ISSUES_SYNC_CONCURRENCY || 3);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 3;
  }

  return Math.min(Math.floor(parsed), 10);
}

async function runAllProjectIssuesSyncJob({ userId, requestId, trigger = 'manual' }) {
  let jobLogId = null;

  if (allIssuesSyncState.running) {
    await startSyncJobLog({
      jobType: 'PROJECT_ISSUES_SYNC_ALL',
      triggerSource: trigger,
      requestId,
      userId,
      status: 'SKIPPED',
      details: { reason: 'already_running' }
    });
    logger.warn('Project issues all-sync: skipped because job already running', {
      requestId,
      userId
    });
    return {
      skipped: true,
      reason: 'already_running',
      requestId
    };
  }

  allIssuesSyncState.running = true;
  allIssuesSyncState.requestId = requestId;
  allIssuesSyncState.startedAt = new Date().toISOString();
  allIssuesSyncState.finishedAt = null;
  allIssuesSyncState.triggeredByUserId = userId;
  allIssuesSyncState.totalProjects = 0;
  allIssuesSyncState.processedProjects = 0;
  allIssuesSyncState.successProjects = 0;
  allIssuesSyncState.failedProjects = 0;
  allIssuesSyncState.status = 'RUNNING';
  allIssuesSyncState.lastError = null;
  allIssuesSyncState.lastResult = null;

  try {
    jobLogId = await startSyncJobLog({
      jobType: 'PROJECT_ISSUES_SYNC_ALL',
      triggerSource: trigger,
      requestId,
      userId
    });

    const [projectRows] = await db.query(
      'SELECT id, project_key FROM projects ORDER BY id ASC'
    );
    const concurrency = getProjectIssuesSyncConcurrency();

    allIssuesSyncState.totalProjects = projectRows.length;

    logger.info('Project issues all-sync: started', {
      requestId,
      userId,
      totalProjects: projectRows.length,
      concurrency
    });

    let totalIssuesFound = 0;
    let totalIssuesInserted = 0;
    let totalIssuesUpdated = 0;
    let totalIssuesUnchanged = 0;
    let totalIssuesRemoved = 0;
    const projectResults = [];
    const projectFailures = [];

    let nextIndex = 0;
    const runNextProject = async (workerId) => {
      while (nextIndex < projectRows.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const project = projectRows[currentIndex];

        try {
          const jiraConnection = await getLatestJiraConnection(userId);
          if (!jiraConnection?.jira_cloud_id) {
            throw new Error('Missing Jira connection/cloud id for all-project issues sync');
          }

          logger.info('Project issues all-sync: worker started project', {
            requestId,
            workerId,
            projectId: project.id,
            projectKey: project.project_key,
            ordinal: currentIndex + 1,
            totalProjects: projectRows.length
          });

          const projectResult = await syncIssuesForProject({
            userId,
            projectId: project.id,
            projectKey: project.project_key,
            jiraConnection,
            requestId: `${requestId}-p${project.id}`
          });

          allIssuesSyncState.successProjects += 1;
          totalIssuesFound += Number(projectResult.totalIssues || 0);
          totalIssuesInserted += Number(projectResult.issueInserted || 0);
          totalIssuesUpdated += Number(projectResult.issueUpdated || 0);
          totalIssuesUnchanged += Number(projectResult.issueUnchanged || 0);
          totalIssuesRemoved += Number(projectResult.removedIssues || 0);
          projectResults.push({
            projectId: project.id,
            projectKey: project.project_key,
            totalIssues: projectResult.totalIssues,
            issueInserted: projectResult.issueInserted,
            issueUpdated: projectResult.issueUpdated,
            issueUnchanged: projectResult.issueUnchanged,
            removedIssues: projectResult.removedIssues,
            absentFromLatestCatalog: projectResult.absentFromLatestCatalog
          });
        } catch (error) {
          allIssuesSyncState.failedProjects += 1;
          projectFailures.push({
            projectId: project.id,
            projectKey: project.project_key,
            message: error.message
          });
          logger.error('Project issues all-sync: project failed', {
            requestId,
            userId,
            workerId,
            projectId: project.id,
            projectKey: project.project_key,
            message: error.message,
            status: error.response?.status,
            responseData: error.response?.data
          });
        } finally {
          allIssuesSyncState.processedProjects += 1;
          logger.info('Project issues all-sync: progress', {
            requestId,
            processedProjects: allIssuesSyncState.processedProjects,
            totalProjects: allIssuesSyncState.totalProjects,
            successProjects: allIssuesSyncState.successProjects,
            failedProjects: allIssuesSyncState.failedProjects
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, projectRows.length || 1) }, (_, index) =>
        runNextProject(index + 1)
      )
    );

    allIssuesSyncState.status = 'COMPLETED';
    allIssuesSyncState.lastResult = {
      totalProjects: allIssuesSyncState.totalProjects,
      processedProjects: allIssuesSyncState.processedProjects,
      successProjects: allIssuesSyncState.successProjects,
      failedProjects: allIssuesSyncState.failedProjects,
      totalIssuesFound,
      totalIssuesInserted,
      totalIssuesUpdated,
      totalIssuesUnchanged,
      totalIssuesRemoved
    };

    await db.query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
      [
        userId,
        'JIRA_ALL_PROJECT_ISSUES_SYNCED',
        JSON.stringify({
          requestId,
          ...allIssuesSyncState.lastResult
        })
      ]
    );

    logger.info('Project issues all-sync: completed', {
      requestId,
      userId,
      ...allIssuesSyncState.lastResult
    });

    await completeSyncJobLog({
      id: jobLogId,
      summary: {
        foundProjects: allIssuesSyncState.totalProjects,
        processedProjects: allIssuesSyncState.processedProjects,
        successProjects: allIssuesSyncState.successProjects,
        failedProjects: allIssuesSyncState.failedProjects,
        foundIssues: totalIssuesFound,
        insertedIssues: totalIssuesInserted,
        updatedIssues: totalIssuesUpdated,
        unchangedIssues: totalIssuesUnchanged,
        removedIssues: totalIssuesRemoved
      },
      details: {
        requestId,
        concurrency,
        projectResults,
        projectFailures
      }
    });
  } catch (error) {
    allIssuesSyncState.status = 'FAILED';
    allIssuesSyncState.lastError = error.message;

    if (jobLogId) {
      await failSyncJobLog({
        id: jobLogId,
        summary: {
          foundProjects: allIssuesSyncState.totalProjects,
          processedProjects: allIssuesSyncState.processedProjects,
          successProjects: allIssuesSyncState.successProjects,
          failedProjects: allIssuesSyncState.failedProjects
        },
        details: {
          requestId
        },
        errorMessage: error.message
      });
    }

    logger.error('Project issues all-sync: failed', {
      requestId,
      userId,
      message: error.message,
      stack: error.stack
    });
  } finally {
    allIssuesSyncState.running = false;
    allIssuesSyncState.finishedAt = new Date().toISOString();
  }
}

const listProjects = async (req, res) => {
  const requestId = `project-list-${Date.now()}`;

  try {
    const userId = req.user?.id;
    logger.info('Project list: request received', { requestId, userId });

    const [rows] = await db.query(
      `SELECT p.id,
              p.project_key,
              p.project_name,
              p.project_number,
              p.project_account_number,
              p.created_at,
              COUNT(DISTINCT ji.id) AS jira_issue_count,
              COUNT(te.id) AS user_timelog_count,
              COALESCE(SUM(te.hours), 0) AS user_total_hours
       FROM projects p
       LEFT JOIN jira_issues ji
         ON ji.project_id = p.id
       LEFT JOIN timesheet_entries te
         ON te.project_id = p.id
        AND te.contractor_user_id = ?
       GROUP BY p.id, p.project_key, p.project_name, p.project_number, p.project_account_number, p.created_at
       ORDER BY user_total_hours DESC, p.project_name ASC`,
      [userId]
    );

    const projects = rows.map((row) => ({
      id: row.id,
      projectKey: row.project_key,
      projectName: row.project_name,
      projectNumber: row.project_number,
      projectAccountNumber: row.project_account_number,
      createdAt: row.created_at,
      jiraIssueCount: Number(row.jira_issue_count || 0),
      userTimelogCount: Number(row.user_timelog_count || 0),
      userTotalHours: Number(Number(row.user_total_hours || 0).toFixed(2))
    }));

    logger.info('Project list: response ready', {
      requestId,
      userId,
      rows: projects.length
    });

    return res.json({ projects });
  } catch (error) {
    logger.error('Project list: failed', {
      requestId,
      userId: req.user?.id,
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      message: 'Failed to fetch projects',
      error: error.message,
      requestId
    });
  }
};

const syncProjectIssues = async (req, res) => {
  const requestId = `project-issues-sync-${Date.now()}`;
  let jobLogId = null;

  try {
    const userId = req.user?.id;
    const projectId = Number(req.params.id);

    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: 'Invalid project id' });
    }

    if (!req.jiraConnection?.jira_cloud_id) {
      return res.status(400).json({ message: 'Missing Jira cloud id. Reconnect Jira account.' });
    }

    const [rows] = await db.query(
      'SELECT id, project_key FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const project = rows[0];
    jobLogId = await startSyncJobLog({
      jobType: 'PROJECT_ISSUES_SYNC_SINGLE',
      triggerSource: 'manual',
      requestId,
      userId
    });

    logger.info('Project issue sync: started', {
      requestId,
      userId,
      projectId,
      projectKey: project.project_key
    });

    const result = await syncIssuesForProject({
      userId,
      projectId: project.id,
      projectKey: project.project_key,
      jiraConnection: req.jiraConnection,
      requestId
    });

    logger.info('Project issue sync: finished', {
      requestId,
      userId,
      projectId,
      projectKey: project.project_key,
      totalIssues: result.totalIssues
    });

    await completeSyncJobLog({
      id: jobLogId,
      summary: {
        foundIssues: result.totalIssues,
        insertedIssues: result.issueInserted,
        updatedIssues: result.issueUpdated,
        unchangedIssues: result.issueUnchanged,
        removedIssues: result.removedIssues
      },
      details: {
        requestId,
        projectId,
        projectKey: project.project_key,
        pageCount: result.pageCount,
        pageLimit: result.pageLimit,
        absentFromLatestCatalog: result.absentFromLatestCatalog
      }
    });

    return res.json({
      requestId,
      ...result
    });
  } catch (error) {
    if (jobLogId) {
      await failSyncJobLog({
        id: jobLogId,
        details: {
          requestId,
          projectId: req.params.id
        },
        errorMessage: error.message
      });
    }

    logger.error('Project issue sync: failed', {
      requestId,
      userId: req.user?.id,
      projectId: req.params.id,
      message: error.message,
      stack: error.stack,
      status: error.response?.status,
      responseData: error.response?.data
    });

    return res.status(500).json({
      message: 'Failed to sync project issues',
      error: error.message,
      requestId
    });
  }
};

const syncProjectsCatalog = async (req, res) => {
  const requestId = `project-sync-${Date.now()}`;
  let jobLogId = null;

  try {
    const userId = req.user?.id;
    jobLogId = await startSyncJobLog({
      jobType: 'PROJECT_CATALOG_SYNC',
      triggerSource: 'manual',
      requestId,
      userId
    });

    logger.info('Project sync: started', {
      requestId,
      userId
    });

    const result = await syncAllJiraProjects({
      userId,
      accessToken: req.jiraConnection.access_token,
      refreshToken: req.jiraConnection.refresh_token,
      cloudId: req.jiraConnection.jira_cloud_id,
      requestId
    });

    logger.info('Project sync: finished', {
      requestId,
      userId,
      syncedProjects: result.syncedProjects,
      pages: result.pages
    });

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
        requestId,
        pages: result.pages,
        absentFromLatestCatalog: result.absentFromLatestCatalog
      }
    });

    return res.json({
      requestId,
      ...result
    });
  } catch (error) {
    if (jobLogId) {
      await failSyncJobLog({
        id: jobLogId,
        details: { requestId },
        errorMessage: error.message
      });
    }

    logger.error('Project sync: failed', {
      requestId,
      userId: req.user?.id,
      message: error.message,
      stack: error.stack,
      status: error.response?.status,
      responseData: error.response?.data
    });

    return res.status(500).json({
      message: 'Failed to sync projects',
      error: error.message,
      requestId
    });
  }
};

const listProjectIssues = async (req, res) => {
  const requestId = `project-issues-list-${Date.now()}`;

  try {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: 'Invalid project id' });
    }

    const [projectRows] = await db.query(
      'SELECT id, project_key, project_name FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    );

    if (!projectRows[0]) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const project = projectRows[0];

    const [issueRows] = await db.query(
      `SELECT id, jira_issue_id, issue_key, summary, status_name, status_category, issue_type, account, account_id, created_at, last_synced_at
       FROM jira_issues
       WHERE project_id = ?
       ORDER BY issue_key ASC`,
      [projectId]
    );

    return res.json({
      project: {
        id: project.id,
        projectKey: project.project_key,
        projectName: project.project_name
      },
      issues: issueRows.map((row) => ({
        id: row.id,
        jiraIssueId: row.jira_issue_id,
        issueKey: row.issue_key,
        summary: row.summary,
        statusName: row.status_name,
        statusCategory: row.status_category,
        issueType: row.issue_type,
        account: row.account,
        accountId: row.account_id,
        createdAt: row.created_at,
        lastSyncedAt: row.last_synced_at
      })),
      requestId
    });
  } catch (error) {
    logger.error('Project issues list: failed', {
      requestId,
      userId: req.user?.id,
      projectId: req.params.id,
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      message: 'Failed to fetch project issues',
      error: error.message,
      requestId
    });
  }
};

const triggerSyncAllProjectIssues = async (req, res) => {
  const requestId = `project-issues-sync-all-${Date.now()}`;

  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (allIssuesSyncState.running) {
      return res.status(202).json({
        message: 'All-project issues sync is already running',
        ...allIssuesSyncState
      });
    }

    // Fire and forget background job.
    setImmediate(() => {
      runAllProjectIssuesSyncJob({ userId, requestId, trigger: 'manual' });
    });

    return res.status(202).json({
      message: 'All-project issues sync started',
      requestId,
      running: true
    });
  } catch (error) {
    logger.error('Project issues all-sync trigger: failed', {
      requestId,
      userId: req.user?.id,
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      message: 'Failed to start all-project issues sync',
      error: error.message,
      requestId
    });
  }
};

const getSyncAllProjectIssuesStatus = async (req, res) => {
  return res.json({
    ...allIssuesSyncState
  });
};

module.exports = {
  listProjects,
  syncProjectIssues,
  syncProjectsCatalog,
  listProjectIssues,
  triggerSyncAllProjectIssues,
  getSyncAllProjectIssuesStatus,
  runAllProjectIssuesSyncJob
};
