const db = require('../config/db');

async function getSyncCursor(cursorKey, connection = db) {
  const [rows] = await connection.query(
    `SELECT id, cursor_key, cursor_value, metadata, created_at, updated_at
     FROM sync_cursors
     WHERE cursor_key = ?
     LIMIT 1`,
    [cursorKey]
  );

  return rows[0] || null;
}

async function upsertSyncCursor({ cursorKey, cursorValue, metadata = null }, connection = db) {
  await connection.query(
    `INSERT INTO sync_cursors (cursor_key, cursor_value, metadata)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cursor_value = VALUES(cursor_value),
       metadata = VALUES(metadata),
       updated_at = CURRENT_TIMESTAMP`,
    [cursorKey, cursorValue, metadata ? JSON.stringify(metadata) : null]
  );
}

module.exports = {
  getSyncCursor,
  upsertSyncCursor
};
