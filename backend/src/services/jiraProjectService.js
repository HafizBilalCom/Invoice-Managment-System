const axios = require('axios');
const db = require('../config/db');
const logger = require('../utils/logger');

async function resolveCloudId(accessToken, requestId) {
  const response = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });
  logger.info("https://api.atlassian.com/oauth/token/accessible-resources");
  logger.info(`Authorization: Bearer ${accessToken}`);
  const resources = response.data || [];
  const selected = resources.find((item) => Array.isArray(item.scopes) && item.scopes.includes('read:jira-work')) || resources[0] || null;

  if (!selected?.id) {
    throw new Error('No Jira accessible resource found for project sync');
  }

  logger.info('Jira project sync: resolved cloud id', {
    requestId,
    cloudId: selected.id,
    siteName: selected.name
  });

  return { cloudId: selected.id, siteName: selected.name || null };
}

async function syncAllJiraProjects({ userId, accessToken, cloudId, requestId }) {
  let resolvedCloudId = cloudId;

  if (!resolvedCloudId) {
    const resolved = await resolveCloudId(accessToken, requestId);
    resolvedCloudId = resolved.cloudId;
  }

  logger.info('Starting Jira project sync', { requestId, userId, cloudId: resolvedCloudId, accessToken: accessToken });

  let startAt = 0;
  const maxResults = 50;
  let pages = 0;
  let syncedProjects = 0;

  while (true) {
    const response = await axios.get(
      `https://api.atlassian.com/ex/jira/${resolvedCloudId}/rest/api/3/project/search`,
      {
        params: {
          startAt,
          maxResults
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      }
    );

    const values = response.data?.values || [];
    logger.info('Jira project sync: fetched batch of projects');
    logger.info(JSON.stringify(values));
    const isLast = Boolean(response.data?.isLast);
    pages += 1;

    for (const project of values) {
      const projectKey = project.key;
      const projectName = project.name || projectKey;

      if (!projectKey) {
        continue;
      }

      await db.query(
        `INSERT INTO projects (project_key, project_name, project_number, project_account_number, pm_user_id)
         VALUES (?, ?, NULL, NULL, NULL)
         ON DUPLICATE KEY UPDATE
           project_name = VALUES(project_name)`,
        [projectKey, projectName]
      );

      syncedProjects += 1;
    }

    logger.info('Jira project sync: batch processed', {
      requestId,
      userId,
      batchSize: values.length,
      syncedProjects,
      pages,
      isLast
    });

    if (isLast || values.length === 0) {
      break;
    }

    startAt += values.length;
  }

  await db.query(
    'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
    [userId, 'JIRA_PROJECTS_SYNCED', JSON.stringify({ syncedProjects, pages })]
  );

  return { syncedProjects, pages };
}

module.exports = { syncAllJiraProjects };
