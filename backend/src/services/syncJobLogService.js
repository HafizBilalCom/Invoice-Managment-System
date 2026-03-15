const db = require('../config/db');

function toJsonOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

async function startSyncJobLog({ jobType, triggerSource, requestId, userId = null, status = 'RUNNING', details = null }) {
  const [result] = await db.query(
    `INSERT INTO sync_job_logs (job_type, trigger_source, request_id, user_id, status, details, started_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [jobType, triggerSource, requestId, userId, status, toJsonOrNull(details)]
  );

  return result.insertId;
}

async function completeSyncJobLog({ id, summary = null, details = null }) {
  await db.query(
    `UPDATE sync_job_logs
     SET status = 'COMPLETED',
         summary = ?,
         details = ?,
         finished_at = NOW()
     WHERE id = ?`,
    [toJsonOrNull(summary), toJsonOrNull(details), id]
  );
}

async function skipSyncJobLog({ id, summary = null, details = null, errorMessage = null }) {
  await db.query(
    `UPDATE sync_job_logs
     SET status = 'SKIPPED',
         summary = ?,
         details = ?,
         error_message = ?,
         finished_at = NOW()
     WHERE id = ?`,
    [toJsonOrNull(summary), toJsonOrNull(details), errorMessage, id]
  );
}

async function failSyncJobLog({ id, summary = null, details = null, errorMessage = null }) {
  await db.query(
    `UPDATE sync_job_logs
     SET status = 'FAILED',
         summary = ?,
         details = ?,
         error_message = ?,
         finished_at = NOW()
     WHERE id = ?`,
    [toJsonOrNull(summary), toJsonOrNull(details), errorMessage, id]
  );
}

module.exports = {
  startSyncJobLog,
  completeSyncJobLog,
  skipSyncJobLog,
  failSyncJobLog
};
