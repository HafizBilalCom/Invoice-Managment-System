const axios = require('axios');
const db = require('../config/db');
const logger = require('../utils/logger');

async function refreshJiraAccessToken({ userId, refreshToken, requestId }) {
  const response = await axios.post(
    process.env.JIRA_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      refresh_token: refreshToken
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  const data = response.data || {};
  const accessToken = data.access_token;
  const nextRefreshToken = data.refresh_token || refreshToken;
  const expiresIn = Number(data.expires_in || 0);
  const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;
  const scopes = Array.isArray(data.scope) ? data.scope.join(' ') : data.scope || null;

  await db.query(
    `UPDATE oauth_connections
     SET access_token = ?,
         refresh_token = ?,
         token_expires_at = ?,
         scopes = COALESCE(?, scopes),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND provider = 'JIRA'`,
    [accessToken, nextRefreshToken, expiresAt, scopes, userId]
  );

  logger.info('Jira users sync: refreshed Jira access token', {
    requestId,
    userId
  });

  return accessToken;
}

async function withJiraGet({ userId, jiraConnection, requestId, url, params }) {
  let accessToken = jiraConnection.access_token;
  const refreshToken = jiraConnection.refresh_token;

  try {
    const response = await axios.get(url, {
      params,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    if (error.response?.status !== 401 || !refreshToken) {
      throw error;
    }

    accessToken = await refreshJiraAccessToken({ userId, refreshToken, requestId });
    const retryResponse = await axios.get(url, {
      params,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
    return retryResponse.data;
  }
}

function normalizeJiraUser(user) {
  return {
    accountId: String(user.accountId || ''),
    accountType: user.accountType || null,
    displayName: user.displayName || null,
    emailAddress: user.emailAddress || null,
    active: Boolean(user.active),
    locale: user.locale || null,
    timeZone: user.timeZone || null,
    selfUrl: user.self || null,
    avatarUrl: user.avatarUrls?.['48x48'] || user.avatarUrls?.['24x24'] || null,
    rawPayload: user
  };
}

async function syncJiraUsers({ userId, jiraConnection, requestId }) {
  if (!jiraConnection?.jira_cloud_id) {
    throw new Error('Missing Jira cloud id for Jira users sync');
  }

  const cloudId = jiraConnection.jira_cloud_id;
  const pageSize = Number(process.env.JIRA_USERS_SYNC_PAGE_SIZE || 100);
  const maxResults = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 1000) : 100;
  let startAt = 0;
  let pageCount = 0;
  let totalFetched = 0;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  logger.info('Jira users sync: started', {
    requestId,
    userId,
    cloudId,
    maxResults
  });

  while (true) {
    const data = await withJiraGet({
      userId,
      jiraConnection,
      requestId,
      url: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/users/search`,
      params: {
        startAt,
        maxResults
      }
    });

    const users = Array.isArray(data) ? data : [];
    pageCount += 1;
    totalFetched += users.length;

    logger.info('Jira users sync: fetched page', {
      requestId,
      userId,
      startAt,
      pageSize: users.length
    });

    if (users.length === 0) {
      break;
    }

    const normalizedUsers = users
      .map(normalizeJiraUser)
      .filter((item) => Boolean(item.accountId));

    if (normalizedUsers.length > 0) {
      const accountIds = normalizedUsers.map((item) => item.accountId);
      const [existingRows] = await db.query(
        `SELECT account_id, account_type, display_name, email_address, active, locale, time_zone, self_url, avatar_url
         FROM jira_users
         WHERE account_id IN (?)`,
        [accountIds]
      );
      const existingMap = new Map(existingRows.map((row) => [row.account_id, row]));

      for (const user of normalizedUsers) {
        const existing = existingMap.get(user.accountId);
        if (!existing) {
          await db.query(
            `INSERT INTO jira_users
              (account_id, account_type, display_name, email_address, active, locale, time_zone, self_url, avatar_url, raw_payload)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              user.accountId,
              user.accountType,
              user.displayName,
              user.emailAddress,
              user.active ? 1 : 0,
              user.locale,
              user.timeZone,
              user.selfUrl,
              user.avatarUrl,
              JSON.stringify(user.rawPayload)
            ]
          );
          inserted += 1;
          continue;
        }

        const hasChanged =
          String(existing.account_type || '') !== String(user.accountType || '') ||
          String(existing.display_name || '') !== String(user.displayName || '') ||
          String(existing.email_address || '') !== String(user.emailAddress || '') ||
          Number(existing.active || 0) !== (user.active ? 1 : 0) ||
          String(existing.locale || '') !== String(user.locale || '') ||
          String(existing.time_zone || '') !== String(user.timeZone || '') ||
          String(existing.self_url || '') !== String(user.selfUrl || '') ||
          String(existing.avatar_url || '') !== String(user.avatarUrl || '');

        if (!hasChanged) {
          unchanged += 1;
          continue;
        }

        await db.query(
          `UPDATE jira_users
           SET account_type = ?,
               display_name = ?,
               email_address = ?,
               active = ?,
               locale = ?,
               time_zone = ?,
               self_url = ?,
               avatar_url = ?,
               raw_payload = ?,
               last_synced_at = CURRENT_TIMESTAMP
           WHERE account_id = ?`,
          [
            user.accountType,
            user.displayName,
            user.emailAddress,
            user.active ? 1 : 0,
            user.locale,
            user.timeZone,
            user.selfUrl,
            user.avatarUrl,
            JSON.stringify(user.rawPayload),
            user.accountId
          ]
        );
        updated += 1;
      }
    }

    if (users.length < maxResults) {
      break;
    }

    startAt += users.length;

    if (pageCount >= 200) {
      logger.warn('Jira users sync: pagination guard reached', {
        requestId,
        userId,
        pageCount
      });
      break;
    }
  }

  await db.query(
    'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
    [
      userId,
      'JIRA_USERS_SYNCED',
      JSON.stringify({ requestId, pageCount, totalFetched, inserted, updated, unchanged })
    ]
  );

  logger.info('Jira users sync: completed', {
    requestId,
    userId,
    pageCount,
    totalFetched,
    inserted,
    updated,
    unchanged
  });

  return { pageCount, totalFetched, inserted, updated, unchanged };
}

async function listJiraUsers() {
  const [rows] = await db.query(
    `SELECT id, account_id, account_type, display_name, email_address, active, locale, time_zone,
            self_url, avatar_url, created_at, updated_at, last_synced_at
     FROM jira_users
     ORDER BY display_name ASC, account_id ASC`
  );

  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    accountType: row.account_type,
    displayName: row.display_name,
    emailAddress: row.email_address,
    active: Boolean(row.active),
    locale: row.locale,
    timeZone: row.time_zone,
    selfUrl: row.self_url,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at
  }));
}

module.exports = {
  syncJiraUsers,
  listJiraUsers
};
