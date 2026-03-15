const db = require('../config/db');
const logger = require('../utils/logger');

const MAX_LIMIT = 500;

const listSyncJobLogs = async (req, res) => {
  const requestId = `sync-job-logs-list-${Date.now()}`;

  try {
    const {
      jobType = '',
      status = '',
      triggerSource = '',
      search = '',
      fromDate = '',
      toDate = '',
      limit = '100'
    } = req.query;

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), MAX_LIMIT);
    const where = [];
    const params = [];

    if (jobType) {
      where.push('sjl.job_type = ?');
      params.push(jobType);
    }

    if (status) {
      where.push('sjl.status = ?');
      params.push(status);
    }

    if (triggerSource) {
      where.push('sjl.trigger_source = ?');
      params.push(triggerSource);
    }

    if (fromDate) {
      where.push('DATE(sjl.started_at) >= ?');
      params.push(fromDate);
    }

    if (toDate) {
      where.push('DATE(sjl.started_at) <= ?');
      params.push(toDate);
    }

    if (search) {
      where.push(
        `(LOWER(sjl.request_id) LIKE ?
          OR LOWER(sjl.job_type) LIKE ?
          OR LOWER(sjl.error_message) LIKE ?
          OR LOWER(COALESCE(u.full_name, '')) LIKE ?
          OR LOWER(COALESCE(u.email, '')) LIKE ?)`
      );
      const term = `%${String(search).trim().toLowerCase()}%`;
      params.push(term, term, term, term, term);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT sjl.id,
              sjl.job_type,
              sjl.trigger_source,
              sjl.request_id,
              sjl.status,
              sjl.summary,
              sjl.details,
              sjl.error_message,
              sjl.started_at,
              sjl.finished_at,
              sjl.created_at,
              sjl.updated_at,
              u.id AS user_id,
              u.full_name AS user_name,
              u.email AS user_email
       FROM sync_job_logs sjl
       LEFT JOIN users u
         ON u.id = sjl.user_id
       ${whereClause}
       ORDER BY sjl.started_at DESC, sjl.id DESC
       LIMIT ?`,
      [...params, safeLimit]
    );

    const [jobTypeRows] = await db.query(
      'SELECT DISTINCT job_type FROM sync_job_logs ORDER BY job_type ASC'
    );
    const [statusRows] = await db.query(
      'SELECT DISTINCT status FROM sync_job_logs ORDER BY status ASC'
    );
    const [triggerRows] = await db.query(
      'SELECT DISTINCT trigger_source FROM sync_job_logs ORDER BY trigger_source ASC'
    );

    logger.info('Sync job logs list: response ready', {
      requestId,
      userId: req.user?.id,
      rows: rows.length
    });

    return res.json({
      requestId,
      filters: {
        jobTypes: jobTypeRows.map((row) => row.job_type),
        statuses: statusRows.map((row) => row.status),
        triggerSources: triggerRows.map((row) => row.trigger_source)
      },
      logs: rows.map((row) => ({
        id: row.id,
        jobType: row.job_type,
        triggerSource: row.trigger_source,
        requestId: row.request_id,
        status: row.status,
        summary: row.summary,
        details: row.details,
        errorMessage: row.error_message,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        user: row.user_id
          ? {
              id: row.user_id,
              name: row.user_name,
              email: row.user_email
            }
          : null
      }))
    });
  } catch (error) {
    logger.error('Sync job logs list: failed', {
      requestId,
      userId: req.user?.id,
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      message: 'Failed to fetch sync job logs',
      error: error.message,
      requestId
    });
  }
};

module.exports = {
  listSyncJobLogs
};
