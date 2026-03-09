const db = require('../config/db');
const { isSuperAdminEmail } = require('../utils/superAdmin');

const DEFAULT_ROLE = 'CONTRACTOR';

async function insertAuditLog(userId, action, metadata = null) {
  try {
    await db.query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
      [userId, action, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (error) {
    // Audit logging should never block auth.
  }
}

async function findByProviderId(provider, providerId) {
  const [rows] = await db.query(
    'SELECT id, email, full_name, role, is_project_manager, provider, provider_id, avatar_url, created_at, last_login_at FROM users WHERE provider = ? AND provider_id = ? LIMIT 1',
    [provider, providerId]
  );
  return rows[0] || null;
}

async function findByEmail(email) {
  if (!email) {
    return null;
  }

  const [rows] = await db.query(
    'SELECT id, email, full_name, role, is_project_manager, provider, provider_id, avatar_url, created_at, last_login_at FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function touchLastLogin(id) {
  await db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
}

async function getJiraConnectionByUserId(userId) {
  const [rows] = await db.query(
    `SELECT id, user_id, provider, external_account_id, external_email,
            jira_cloud_id, jira_site_name, access_token,
            refresh_token, token_expires_at, scopes, connected_at, updated_at
     FROM oauth_connections
     WHERE user_id = ? AND provider = 'JIRA'
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

function normalizeUser(row, jiraConnection = null) {
  return {
    id: row.id,
    email: row.email,
    name: row.full_name,
    role: row.role,
    isProjectManager: Boolean(row.is_project_manager),
    isSuperAdmin: isSuperAdminEmail(row.email),
    provider: row.provider,
    providerId: row.provider_id,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    jiraConnected: Boolean(jiraConnection),
    jiraAccountId: jiraConnection?.external_account_id || null,
    jiraEmail: jiraConnection?.external_email || null,
    jiraCloudId: jiraConnection?.jira_cloud_id || null,
    jiraSiteName: jiraConnection?.jira_site_name || null,
    jiraConnectedAt: jiraConnection?.connected_at || null
  };
}

async function upsertOAuthUser({ provider, providerId, email, fullName, avatarUrl }) {
  const safeName = fullName || 'User';
  let user = await findByProviderId(provider, providerId);

  if (!user && email) {
    user = await findByEmail(email);
  }

  if (user) {
    await db.query(
      `UPDATE users
       SET email = COALESCE(?, email),
           full_name = ?,
           provider = ?,
           provider_id = ?,
           avatar_url = ?,
           last_login_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [email || null, safeName, provider, providerId, avatarUrl || null, user.id]
    );

    await insertAuditLog(user.id, 'USER_LOGIN', { provider });

    const [rows] = await db.query(
      'SELECT id, email, full_name, role, is_project_manager, provider, provider_id, avatar_url, created_at, last_login_at FROM users WHERE id = ? LIMIT 1',
      [user.id]
    );
    const jiraConnection = await getJiraConnectionByUserId(user.id);
    return normalizeUser(rows[0], jiraConnection);
  }

  const [result] = await db.query(
    `INSERT INTO users (email, full_name, role, provider, provider_id, avatar_url, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [email || null, safeName, DEFAULT_ROLE, provider, providerId, avatarUrl || null]
  );

  const createdId = result.insertId;
  await insertAuditLog(createdId, 'USER_SIGNUP', { provider });

  const [rows] = await db.query(
    'SELECT id, email, full_name, role, is_project_manager, provider, provider_id, avatar_url, created_at, last_login_at FROM users WHERE id = ? LIMIT 1',
    [createdId]
  );
  return normalizeUser(rows[0], null);
}

async function upsertJiraConnection({
  userId,
  externalAccountId,
  externalEmail,
  jiraCloudId,
  jiraSiteName,
  accessToken,
  refreshToken,
  expiresIn,
  scopes
}) {
  const existing = await getJiraConnectionByUserId(userId);
  const isFirstConnection = !existing;
  const expiresAt = expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000) : null;

  await db.query(
    `INSERT INTO oauth_connections
      (user_id, provider, external_account_id, external_email, jira_cloud_id, jira_site_name, access_token, refresh_token, token_expires_at, scopes)
     VALUES (?, 'JIRA', ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      external_account_id = VALUES(external_account_id),
      external_email = VALUES(external_email),
      jira_cloud_id = VALUES(jira_cloud_id),
      jira_site_name = VALUES(jira_site_name),
      access_token = VALUES(access_token),
      refresh_token = VALUES(refresh_token),
      token_expires_at = VALUES(token_expires_at),
      scopes = VALUES(scopes)`,
    [
      userId,
      externalAccountId,
      externalEmail || null,
      jiraCloudId || null,
      jiraSiteName || null,
      accessToken,
      refreshToken || null,
      expiresAt,
      scopes || null
    ]
  );

  await insertAuditLog(userId, 'JIRA_CONNECTED', {
    externalAccountId,
    externalEmail: externalEmail || null,
    jiraCloudId: jiraCloudId || null,
    jiraSiteName: jiraSiteName || null
  });

  const connection = await getJiraConnectionByUserId(userId);
  return { connection, isFirstConnection };
}

async function getUserById(id) {
  const [rows] = await db.query(
    'SELECT id, email, full_name, role, is_project_manager, provider, provider_id, avatar_url, created_at, last_login_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );

  if (!rows[0]) {
    return null;
  }

  const jiraConnection = await getJiraConnectionByUserId(id);
  return normalizeUser(rows[0], jiraConnection);
}

async function disconnectJiraConnection(userId) {
  const existing = await getJiraConnectionByUserId(userId);
  if (!existing) {
    return false;
  }

  await db.query("DELETE FROM oauth_connections WHERE user_id = ? AND provider = 'JIRA'", [userId]);
  await insertAuditLog(userId, 'JIRA_DISCONNECTED', {
    externalAccountId: existing.external_account_id,
    externalEmail: existing.external_email
  });

  return true;
}

async function listUsersForManagerFlag() {
  const [rows] = await db.query(
    `SELECT id, email, full_name, role, is_project_manager
     FROM users
     ORDER BY full_name ASC, email ASC`
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.full_name,
    role: row.role,
    isProjectManager: Boolean(row.is_project_manager)
  }));
}

async function setProjectManagerFlag({ userId, isProjectManager }) {
  await db.query('UPDATE users SET is_project_manager = ? WHERE id = ?', [isProjectManager ? 1 : 0, userId]);
}

async function listProjectManagers() {
  const [rows] = await db.query(
    `SELECT id, email, full_name, role
     FROM users
     WHERE is_project_manager = 1
     ORDER BY full_name ASC, email ASC`
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.full_name,
    role: row.role
  }));
}

module.exports = {
  upsertOAuthUser,
  upsertJiraConnection,
  disconnectJiraConnection,
  getJiraConnectionByUserId,
  getUserById,
  touchLastLogin,
  listUsersForManagerFlag,
  setProjectManagerFlag,
  listProjectManagers
};
