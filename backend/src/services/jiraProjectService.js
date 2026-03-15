const axios = require('axios');
const db = require('../config/db');
const logger = require('../utils/logger');

async function persistJiraTokens({ userId, accessToken, refreshToken, expiresIn, scopes }) {
  const expiresAt = expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000) : null;

  await db.query(
    `UPDATE oauth_connections
     SET access_token = ?,
         refresh_token = COALESCE(?, refresh_token),
         token_expires_at = ?,
         scopes = COALESCE(?, scopes),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND provider = 'JIRA'`,
    [accessToken, refreshToken || null, expiresAt, scopes || null, userId]
  );
}

async function refreshJiraAccessToken({ userId, refreshToken, requestId }) {
  if (!refreshToken) {
    throw new Error('Jira refresh token is missing. Reconnect Jira account.');
  }

  const response = await axios.post(
    process.env.JIRA_TOKEN_URL,
    {
      grant_type: 'refresh_token',
      client_id: process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      refresh_token: refreshToken
    },
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    }
  );

  const nextAccessToken = response.data?.access_token;
  const nextRefreshToken = response.data?.refresh_token || refreshToken;
  const expiresIn = response.data?.expires_in;
  const scope = response.data?.scope;

  if (!nextAccessToken) {
    throw new Error('Failed to refresh Jira access token');
  }

  await persistJiraTokens({
    userId,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    expiresIn,
    scopes: scope
  });

  logger.info('Jira project sync: refreshed Jira access token', {
    requestId,
    userId,
    expiresIn
  });

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken
  };
}

function createJiraGet({ userId, accessToken, refreshToken, requestId }) {
  const tokenState = {
    accessToken,
    refreshToken,
    hasRetried: false
  };

  return async function jiraGet(url, config = {}) {
    try {
      return await axios.get(url, {
        ...config,
        headers: {
          ...(config.headers || {}),
          Authorization: `Bearer ${tokenState.accessToken}`,
          Accept: 'application/json'
        }
      });
    } catch (error) {
      const isUnauthorized = error.response?.status === 401;
      if (!isUnauthorized || tokenState.hasRetried) {
        throw error;
      }

      tokenState.hasRetried = true;
      logger.warn('Jira project sync: received 401, attempting token refresh', {
        requestId,
        userId
      });

      const refreshed = await refreshJiraAccessToken({
        userId,
        refreshToken: tokenState.refreshToken,
        requestId
      });

      tokenState.accessToken = refreshed.accessToken;
      tokenState.refreshToken = refreshed.refreshToken;

      return axios.get(url, {
        ...config,
        headers: {
          ...(config.headers || {}),
          Authorization: `Bearer ${tokenState.accessToken}`,
          Accept: 'application/json'
        }
      });
    }
  };
}

async function resolveCloudId(jiraGet, requestId) {
  const response = await jiraGet('https://api.atlassian.com/oauth/token/accessible-resources');
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

async function syncAllJiraProjects({ userId, accessToken, refreshToken, cloudId, requestId }) {
  const jiraGet = createJiraGet({
    userId,
    accessToken,
    refreshToken,
    requestId
  });
  let resolvedCloudId = cloudId;

  if (!resolvedCloudId) {
    const resolved = await resolveCloudId(jiraGet, requestId);
    resolvedCloudId = resolved.cloudId;
  }

  logger.info('Starting Jira project sync', { requestId, userId, cloudId: resolvedCloudId });

  let startAt = 0;
  const maxResults = 50;
  let pages = 0;
  const fetchedProjects = [];

  while (true) {
    const response = await jiraGet(
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

    logger.info('Jira project sync: batch processed', {
      requestId,
      userId,
      batchSize: values.length,
      fetchedProjects: fetchedProjects.length + values.length,
      pages,
      isLast
    });

    fetchedProjects.push(...values);

    if (isLast || values.length === 0) {
      break;
    }

    startAt += values.length;
  }

  const [existingRows] = await db.query(
    'SELECT id, project_key, project_name FROM projects'
  );

  const existingByKey = new Map(existingRows.map((row) => [row.project_key, row]));
  const fetchedKeys = new Set();
  let insertedProjects = 0;
  let updatedProjects = 0;
  let unchangedProjects = 0;

  for (const project of fetchedProjects) {
    const projectKey = project.key;
    const projectName = project.name || projectKey;

    if (!projectKey) {
      continue;
    }

    fetchedKeys.add(projectKey);

    const existing = existingByKey.get(projectKey);
    if (!existing) {
      await db.query(
        `INSERT INTO projects (project_key, project_name, project_number, project_account_number, pm_user_id)
         VALUES (?, ?, NULL, NULL, NULL)`,
        [projectKey, projectName]
      );
      insertedProjects += 1;
      continue;
    }

    if (String(existing.project_name || '') !== String(projectName || '')) {
      await db.query(
        'UPDATE projects SET project_name = ? WHERE id = ?',
        [projectName, existing.id]
      );
      updatedProjects += 1;
      continue;
    }

    unchangedProjects += 1;
  }

  const absentFromLatestCatalog = existingRows.filter((row) => !fetchedKeys.has(row.project_key)).length;
  const foundProjects = fetchedProjects.filter((project) => Boolean(project?.key)).length;
  const syncedProjects = foundProjects;
  const removedProjects = 0;

  await db.query(
    'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
    [
      userId,
      'JIRA_PROJECTS_SYNCED',
      JSON.stringify({
        requestId,
        foundProjects,
        insertedProjects,
        updatedProjects,
        unchangedProjects,
        removedProjects,
        absentFromLatestCatalog,
        pages
      })
    ]
  );

  return {
    syncedProjects,
    pages,
    foundProjects,
    insertedProjects,
    updatedProjects,
    unchangedProjects,
    removedProjects,
    absentFromLatestCatalog
  };
}

module.exports = { syncAllJiraProjects };
