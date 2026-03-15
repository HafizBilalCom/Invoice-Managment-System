const logger = require('../utils/logger');
const { listJiraUsers } = require('../services/jiraUserService');
const { runJiraUsersSyncJob } = require('../jobs/jiraUserSyncJob');

const getJiraUsers = async (req, res) => {
  const requestId = `jira-users-list-${Date.now()}`;

  try {
    const users = await listJiraUsers();
    return res.json({ users });
  } catch (error) {
    logger.error('Jira users list: failed', {
      requestId,
      userId: req.user?.id,
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      message: 'Failed to fetch Jira users',
      error: error.message,
      requestId
    });
  }
};

const triggerJiraUsersSync = async (req, res) => {
  const requestId = `jira-users-sync-${Date.now()}`;

  try {
    const result = await runJiraUsersSyncJob({
      trigger: 'manual',
      requestId,
      userId: req.user.id,
      jiraConnection: req.jiraConnection
    });

    return res.json({
      message: 'Jira users sync completed',
      requestId,
      ...result
    });
  } catch (error) {
    logger.error('Jira users sync: failed', {
      requestId,
      userId: req.user?.id,
      message: error.message,
      stack: error.stack,
      status: error.response?.status,
      responseData: error.response?.data
    });
    return res.status(500).json({
      message: 'Failed to sync Jira users',
      error: error.message,
      requestId
    });
  }
};

module.exports = {
  getJiraUsers,
  triggerJiraUsersSync
};
