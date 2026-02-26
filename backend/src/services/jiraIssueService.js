const axios = require('axios');
const db = require('../config/db');
const logger = require('../utils/logger');

function parseIssuePageLimit() {
  const parsed = Number(process.env.JIRA_ISSUES_PAGE_LIMIT || 50);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(parsed, 1000);
}

async function persistJiraTokens({ userId, accessToken, refreshToken, expiresIn, scopes }) {
  const expiresAt = expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000) : null;

  await db.query(
    `UPDATE oauth_connections
     SET access_token = ?,
         refresh_token = COALESCE(?, refresh_token),
         token_expires_at = ?,
         scopes = COALESCE(?, scopes)
     WHERE user_id = ? AND provider = 'JIRA'`,
    [accessToken, refreshToken || null, expiresAt, scopes || null, userId]
  );
}

async function refreshJiraAccessToken({ userId, refreshToken, requestId }) {
  const tokenUrl = process.env.JIRA_TOKEN_URL;
  const clientId = process.env.JIRA_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET;

  if (!refreshToken) {
    throw new Error('Jira refresh token is missing. Reconnect Jira account.');
  }

  const response = await axios.post(
    tokenUrl,
    {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
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

  logger.info('Jira issue sync: refreshed Jira access token', {
    requestId,
    userId,
    expiresIn
  });

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken
  };
}

function createJiraGet({ userId, jiraConnection, requestId }) {
  const tokenState = {
    accessToken: jiraConnection.access_token,
    refreshToken: jiraConnection.refresh_token,
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
      logger.warn('Jira issue sync: received 401, attempting token refresh', {
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

async function fetchFieldDefinitionsForCloud({ jiraGet, cloudId, requestId }) {
  const response = await jiraGet(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/field`);

  const list = response.data || [];
  const fieldNameMap = new Map(list.map((field) => [field.id, field.name]));

  logger.info('Jira issue sync: fetched field definitions', {
    requestId,
    count: fieldNameMap.size
  });

  return fieldNameMap;
}

async function fetchIssuesForProject({ jiraGet, cloudId, projectKey, requestId }) {
  const issues = [];
  const maxResults = parseIssuePageLimit();
  let nextPageToken = null;
  let startAt = 0;
  let pageCount = 0;
  const maxPages = 2000;

  while (true) {
    const params = {
      jql: `project = \"${projectKey}\" ORDER BY updated DESC`,
      maxResults,
      fields: '*all'
    };

    if (nextPageToken) {
      params.nextPageToken = nextPageToken;
    } else {
      params.startAt = startAt;
    }

    const response = await jiraGet(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
      { params }
    );

    const batch = response.data?.issues || [];
    const total = Number(response.data?.total || 0);
    const isLast = Boolean(response.data?.isLast);

    issues.push(...batch);
    pageCount += 1;
    startAt += batch.length;
    nextPageToken = response.data?.nextPageToken || null;

    logger.info('Jira issue sync: fetched issue page', {
      requestId,
      projectKey,
      page: pageCount,
      batchSize: batch.length,
      totalAccumulated: issues.length,
      total,
      isLast,
      hasNext: Boolean(nextPageToken)
    });

    if (batch.length === 0 || isLast || (!nextPageToken && issues.length >= total)) {
      break;
    }

    if (pageCount >= maxPages) {
      logger.warn('Jira issue sync: pagination guard reached', {
        requestId,
        projectKey,
        pageCount
      });
      break;
    }
  }

  return { issues, pageCount, pageLimit: maxResults };
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return false;
    }
    return value.some((item) => hasMeaningfulValue(item));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return false;
    }
    return entries.some(([, nested]) => hasMeaningfulValue(nested));
  }

  return true;
}

function extractAccountValue(rawValue) {
  if (!hasMeaningfulValue(rawValue)) {
    return null;
  }

  if (typeof rawValue === 'string') {
    return rawValue.trim();
  }

  if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    return String(rawValue);
  }

  if (Array.isArray(rawValue)) {
    const list = rawValue.map(extractAccountValue).filter(Boolean);
    return list.length > 0 ? list.join(', ') : null;
  }

  if (typeof rawValue === 'object') {
    if (typeof rawValue.value === 'string' && rawValue.value.trim()) {
      return rawValue.value.trim();
    }
    if (typeof rawValue.name === 'string' && rawValue.name.trim()) {
      return rawValue.name.trim();
    }
    if (typeof rawValue.key === 'string' && rawValue.key.trim()) {
      return rawValue.key.trim();
    }
    if (rawValue.id !== null && rawValue.id !== undefined && String(rawValue.id).trim()) {
      return String(rawValue.id).trim();
    }
    return JSON.stringify(rawValue);
  }

  return null;
}

function extractAccountId(rawValue) {
  if (!hasMeaningfulValue(rawValue)) {
    return null;
  }

  if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    return String(rawValue).trim() || null;
  }

  if (Array.isArray(rawValue)) {
    const ids = rawValue.map(extractAccountId).filter(Boolean);
    return ids.length > 0 ? ids.join(', ') : null;
  }

  if (typeof rawValue === 'object') {
    if (rawValue.id !== null && rawValue.id !== undefined && String(rawValue.id).trim()) {
      return String(rawValue.id).trim();
    }
    if (typeof rawValue.key === 'string' && rawValue.key.trim()) {
      return rawValue.key.trim();
    }
    return null;
  }

  return null;
}

function getIssueAccount({ fields, fieldNameMap }) {
  const entries = Object.entries(fields || {});
  for (const [fieldKey, fieldValue] of entries) {
    if (!fieldKey.startsWith('customfield_')) {
      continue;
    }
    const fieldName = fieldNameMap.get(fieldKey);
    if (typeof fieldName === 'string' && fieldName.trim().toLowerCase() === 'account') {
      return {
        account: extractAccountValue(fieldValue),
        accountId: extractAccountId(fieldValue)
      };
    }
  }
  return { account: null, accountId: null };
}

function buildIssueBasicPayload({
  issueId,
  issueKey,
  summary,
  statusName,
  statusCategory,
  issueType,
  account,
  accountId
}) {
  return JSON.stringify({
    issueId: issueId || null,
    issueKey: issueKey || null,
    summary: summary || null,
    statusName: statusName || null,
    statusCategory: statusCategory || null,
    issueType: issueType || null,
    account: account || null,
    accountId: accountId || null
  });
}

async function upsertIssue(connection, { projectId, issue, account, accountId }) {
  const issueKey = issue?.key;
  const issueId = issue?.id ? String(issue.id) : null;
  const summary = issue?.fields?.summary || null;
  const statusName = issue?.fields?.status?.name || null;
  const statusCategory = issue?.fields?.status?.statusCategory?.name || null;
  const issueType = issue?.fields?.issuetype?.name || null;
  const rawPayload = buildIssueBasicPayload({
    issueId,
    issueKey,
    summary,
    statusName,
    statusCategory,
    issueType,
    account,
    accountId
  });

  const [existingRows] = await connection.query(
    'SELECT id, raw_payload FROM jira_issues WHERE issue_key = ? LIMIT 1',
    [issueKey]
  );

  if (!existingRows[0]) {
    const [insertResult] = await connection.query(
      `INSERT INTO jira_issues
      (project_id, jira_issue_id, issue_key, summary, status_name, status_category, issue_type, account, account_id, raw_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        issueId,
        issueKey,
        summary,
        statusName,
        statusCategory,
        issueType,
        account,
        accountId,
        rawPayload
      ]
    );

    return { issueId: insertResult.insertId, inserted: 1, updated: 0 };
  }

  const existing = existingRows[0];
  const hasChanges = String(existing.raw_payload) !== rawPayload;

  if (hasChanges) {
    await connection.query(
      `UPDATE jira_issues
       SET project_id = ?, jira_issue_id = ?, summary = ?, status_name = ?, status_category = ?, issue_type = ?, account = ?, account_id = ?, raw_payload = ?
       WHERE id = ?`,
      [projectId, issueId, summary, statusName, statusCategory, issueType, account, accountId, rawPayload, existing.id]
    );
    return { issueId: existing.id, inserted: 0, updated: 1 };
  }

  return { issueId: existing.id, inserted: 0, updated: 0 };
}

async function syncIssuesForProject({ userId, projectId, projectKey, jiraConnection, requestId }) {
  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    const cloudId = jiraConnection?.jira_cloud_id;
    if (!cloudId) {
      throw new Error('Jira cloud id missing. Reconnect Jira account.');
    }

    const jiraGet = createJiraGet({
      userId,
      jiraConnection,
      requestId
    });

    const fieldNameMap = await fetchFieldDefinitionsForCloud({ jiraGet, cloudId, requestId });
    const { issues, pageCount, pageLimit } = await fetchIssuesForProject({
      jiraGet,
      cloudId,
      projectKey,
      requestId
    });

    logger.info('Jira issue sync: project issue fetch completed', {
      requestId,
      userId,
      projectId,
      projectKey,
      totalIssues: issues.length,
      pageCount,
      pageLimit
    });

    await connection.beginTransaction();
    transactionStarted = true;

    let issueInserted = 0;
    let issueUpdated = 0;
    let issueUnchanged = 0;
    for (let index = 0; index < issues.length; index += 1) {
      const issue = issues[index];
      const accountData = getIssueAccount({
        fields: issue?.fields || {},
        fieldNameMap
      });

      const upsertIssueResult = await upsertIssue(connection, {
        projectId,
        issue,
        account: accountData.account,
        accountId: accountData.accountId
      });

      issueInserted += upsertIssueResult.inserted;
      issueUpdated += upsertIssueResult.updated;
      if (!upsertIssueResult.inserted && !upsertIssueResult.updated) {
        issueUnchanged += 1;
      }

      if ((index + 1) % 50 === 0 || index === issues.length - 1) {
        logger.info('Jira issue sync: upsert progress', {
          requestId,
          projectKey,
          processed: index + 1,
          total: issues.length,
          issueInserted,
          issueUpdated,
          issueUnchanged
        });
      }
    }

    await connection.query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
      [
        userId,
        'JIRA_PROJECT_ISSUES_SYNCED',
        JSON.stringify({
          projectId,
          projectKey,
          totalIssues: issues.length,
          issueInserted,
          issueUpdated,
          issueUnchanged,
          pageCount,
          pageLimit
        })
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return {
      projectId,
      projectKey,
      totalIssues: issues.length,
      issueInserted,
      issueUpdated,
      issueUnchanged,
      pageCount,
      pageLimit
    };
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  syncIssuesForProject
};
