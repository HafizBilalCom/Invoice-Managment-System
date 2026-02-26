const db = require('../config/db');
const { syncTimesheetsDirect } = require('../services/tempoService');
const logger = require('../utils/logger');

function getExternalEntryId(entry, index) {
  return String(entry?.tempoWorklogId || entry?.worklogId || entry?.id || entry?.issue?.id || `tempo-${Date.now()}-${index}`);
}

function mapWorkDate(entry, fallbackFrom) {
  return entry.startDate || entry.dateStarted || entry.updatedAt?.slice(0, 10) || fallbackFrom;
}

function extractAttributeValues(entry) {
  const values = entry?.attributes?.values || [];
  const map = new Map();

  for (const item of values) {
    if (!item?.key) {
      continue;
    }
    map.set(String(item.key), item.value == null ? null : String(item.value));
  }

  return map;
}

function mapProject(entry) {
  const issue = entry?.issue || {};
  const issueProject = issue?.project || {};
  const directProject = entry?.project || {};
  const attrMap = extractAttributeValues(entry);

  const projectNumber =
    attrMap.get('_ProjectNumber_') ||
    attrMap.get('ProjectNumber') ||
    attrMap.get('projectNumber') ||
    entry?.projectNumber ||
    null;

  const projectAccountNumber =
    attrMap.get('_ProjectAccountNumber_') ||
    attrMap.get('_AccountNumber_') ||
    attrMap.get('ProjectAccountNumber') ||
    attrMap.get('AccountNumber') ||
    entry?.projectAccountNumber ||
    null;

  const rawProjectKey =
    issueProject?.key ||
    issue?.projectKey ||
    directProject?.key ||
    directProject?.projectKey ||
    entry?.projectKey ||
    null;

  const projectKey = rawProjectKey || (projectNumber ? `PN-${projectNumber}` : null);

  return {
    issueKey: issue?.key || entry?.issueKey || null,
    projectKey,
    projectName:
      issueProject?.name ||
      issue?.projectName ||
      directProject?.name ||
      directProject?.projectName ||
      entry?.projectName ||
      (projectNumber ? `Project ${projectNumber}` : null),
    projectNumber,
    projectAccountNumber
  };
}

function toDateOnly(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function normalizePayload(value) {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value || {});
}

function buildProjectCatalog(entries) {
  const catalogByIdentity = new Map();

  for (const entry of entries) {
    const mapped = mapProject(entry);
    const identity = mapped.projectNumber || mapped.projectKey;

    if (!identity) {
      continue;
    }

    if (!catalogByIdentity.has(identity)) {
      catalogByIdentity.set(identity, mapped);
      continue;
    }

    const existing = catalogByIdentity.get(identity);
    catalogByIdentity.set(identity, {
      ...existing,
      projectName: existing.projectName || mapped.projectName,
      projectKey: existing.projectKey || mapped.projectKey,
      projectNumber: existing.projectNumber || mapped.projectNumber,
      projectAccountNumber: existing.projectAccountNumber || mapped.projectAccountNumber
    });
  }

  return [...catalogByIdentity.values()];
}

async function loadExistingProjects(connection, catalog) {
  const projectKeys = [...new Set(catalog.map((p) => p.projectKey).filter(Boolean))];
  const projectNumbers = [...new Set(catalog.map((p) => p.projectNumber).filter(Boolean))];

  const keyRows = projectKeys.length
    ? (await connection.query(
        'SELECT id, project_key, project_name, project_number, project_account_number FROM projects WHERE project_key IN (?)',
        [projectKeys]
      ))[0]
    : [];

  const numberRows = projectNumbers.length
    ? (await connection.query(
        'SELECT id, project_key, project_name, project_number, project_account_number FROM projects WHERE project_number IN (?)',
        [projectNumbers]
      ))[0]
    : [];

  const byKey = new Map(keyRows.map((row) => [row.project_key, row]));
  const byNumber = new Map(numberRows.map((row) => [row.project_number, row]));

  return { byKey, byNumber };
}

function findProjectRow(project, maps) {
  if (project.projectNumber && maps.byNumber.has(project.projectNumber)) {
    return maps.byNumber.get(project.projectNumber);
  }

  if (project.projectKey && maps.byKey.has(project.projectKey)) {
    return maps.byKey.get(project.projectKey);
  }

  return null;
}

async function mapProjectsFromCatalog(connection, catalog, requestId) {
  const freshMaps = await loadExistingProjects(connection, catalog);
  const projectIdMap = new Map();

  for (const project of catalog) {
    const row = findProjectRow(project, freshMaps);
    if (!row) {
      continue;
    }

    const identity = project.projectNumber || project.projectKey;
    projectIdMap.set(identity, row.id);
  }

  logger.info('Timelog sync: project reconciliation complete', {
    requestId,
    seenProjects: catalog.length
  });

  return { projectIdMap, insertedProjects: 0, updatedProjects: 0, seenProjects: catalog.length };
}

async function getTimelogsForUser(userId, from, to) {
  const filters = ['te.contractor_user_id = ?'];
  const values = [userId];

  if (from) {
    filters.push('te.work_date >= ?');
    values.push(from);
  }

  if (to) {
    filters.push('te.work_date <= ?');
    values.push(to);
  }

  const [rows] = await db.query(
    `SELECT te.id, te.external_entry_id, te.work_date, te.hours, te.description,
            te.project_key, te.project_name, te.project_number, te.project_account_number,
            te.issue_key, te.created_at, te.updated_at,
            p.id AS project_id, p.project_key AS linked_project_key, p.project_name AS linked_project_name,
            p.project_number AS linked_project_number, p.project_account_number AS linked_project_account_number
     FROM timesheet_entries te
     LEFT JOIN projects p ON p.id = te.project_id
     WHERE ${filters.join(' AND ')}
     ORDER BY te.work_date DESC, te.id DESC`,
    values
  );

  return rows.map((row) => ({
    id: row.id,
    externalEntryId: row.external_entry_id,
    workDate: row.work_date,
    hours: Number(row.hours),
    description: row.description,
    projectId: row.project_id,
    projectKey: row.linked_project_key || row.project_key,
    projectName: row.linked_project_name || row.project_name,
    projectNumber: row.linked_project_number || row.project_number,
    projectAccountNumber: row.linked_project_account_number || row.project_account_number,
    issueKey: row.issue_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

const syncTimelogs = async (req, res) => {
  const requestId = `timelog-sync-${Date.now()}`;
  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    const { from, to } = req.body;
    logger.info('Timelog sync: request received', {
      requestId,
      userId: req.user?.id,
      jiraAccountId: req.jiraConnection?.external_account_id,
      from,
      to
    });

    if (!from || !to) {
      logger.warn('Timelog sync: validation failed', {
        requestId,
        reason: 'from and to dates are required'
      });
      return res.status(400).json({ message: 'from and to dates are required' });
    }

    const syncResult = await syncTimesheetsDirect({
      accountId: req.jiraConnection.external_account_id,
      from,
      to,
      requestId
    });
    const entries = syncResult.entries || [];

    logger.info('Timelog sync: Tempo response received', {
      requestId,
      entriesCount: entries.length,
      totalHours: Number(syncResult.totalHours.toFixed(2))
    });

    await connection.beginTransaction();
    transactionStarted = true;
    logger.info('Timelog sync: transaction started', { requestId });

    const projectCatalog = buildProjectCatalog(entries);
    const projectReconcile = await mapProjectsFromCatalog(connection, projectCatalog, requestId);

    const projectIdByIdentity = projectReconcile.projectIdMap;

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const seconds = Number(entry.timeSpentSeconds || 0);
      const hours = Number((seconds / 3600).toFixed(2));
      const description = entry.description || 'Tempo worklog';
      const externalEntryId = getExternalEntryId(entry, index);
      const workDate = mapWorkDate(entry, from);
      const mappedProject = mapProject(entry);
      const identity = mappedProject.projectNumber || mappedProject.projectKey;
      const projectId = identity ? projectIdByIdentity.get(identity) || null : null;
      const rawPayload = JSON.stringify(entry);

      const [existingRows] = await connection.query(
        `SELECT id, project_id, project_key, project_name, project_number, project_account_number,
                issue_key, work_date, hours, description, raw_payload
         FROM timesheet_entries
         WHERE external_entry_id = ? AND contractor_user_id = ?
         LIMIT 1`,
        [externalEntryId, req.user.id]
      );

      if (!existingRows[0]) {
        await connection.query(
          `INSERT INTO timesheet_entries
          (provider, external_entry_id, contractor_user_id, project_id, project_key, project_name, project_number, project_account_number, issue_key, work_date, hours, description, raw_payload)
          VALUES ('TEMPO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            externalEntryId,
            req.user.id,
            projectId,
            mappedProject.projectKey,
            mappedProject.projectName,
            mappedProject.projectNumber,
            mappedProject.projectAccountNumber,
            mappedProject.issueKey,
            workDate,
            hours,
            description,
            rawPayload
          ]
        );
        inserted += 1;
      } else {
        const existing = existingRows[0];
        const hasChanges =
          Number(existing.project_id || 0) !== Number(projectId || 0) ||
          (existing.project_key || null) !== (mappedProject.projectKey || null) ||
          (existing.project_name || null) !== (mappedProject.projectName || null) ||
          (existing.project_number || null) !== (mappedProject.projectNumber || null) ||
          (existing.project_account_number || null) !== (mappedProject.projectAccountNumber || null) ||
          (existing.issue_key || null) !== (mappedProject.issueKey || null) ||
          toDateOnly(existing.work_date) !== toDateOnly(workDate) ||
          Number(existing.hours) !== Number(hours) ||
          (existing.description || '') !== description ||
          normalizePayload(existing.raw_payload) !== normalizePayload(rawPayload);

        if (hasChanges) {
          await connection.query(
            `UPDATE timesheet_entries
             SET project_id = ?,
                 project_key = ?,
                 project_name = ?,
                 project_number = ?,
                 project_account_number = ?,
                 issue_key = ?,
                 work_date = ?,
                 hours = ?,
                 description = ?,
                 raw_payload = ?
             WHERE id = ?`,
            [
              projectId,
              mappedProject.projectKey,
              mappedProject.projectName,
              mappedProject.projectNumber,
              mappedProject.projectAccountNumber,
              mappedProject.issueKey,
              workDate,
              hours,
              description,
              rawPayload,
              existing.id
            ]
          );
          updated += 1;
        } else {
          unchanged += 1;
        }
      }

      if ((index + 1) % 25 === 0 || index === entries.length - 1) {
        logger.info('Timelog sync: upsert progress', {
          requestId,
          processed: index + 1,
          total: entries.length,
          inserted,
          updated,
          unchanged
        });
      }
    }

    logger.info('Timelog sync: writing audit log', { requestId });
    await connection.query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
      [
        req.user.id,
        'TIMELOGS_SYNCED',
        JSON.stringify({
          from,
          to,
          syncedCount: entries.length,
          inserted,
          updated,
          unchanged,
          seenProjects: projectReconcile.seenProjects,
          insertedProjects: projectReconcile.insertedProjects,
          updatedProjects: projectReconcile.updatedProjects
        })
      ]
    );

    await connection.commit();
    transactionStarted = false;
    logger.info('Timelog sync: transaction committed', {
      requestId,
      inserted,
      updated,
      unchanged,
      seenProjects: projectReconcile.seenProjects,
      insertedProjects: projectReconcile.insertedProjects,
      updatedProjects: projectReconcile.updatedProjects
    });

    const timelogs = await getTimelogsForUser(req.user.id, from, to);
    logger.info('Timelog sync: response ready', {
      requestId,
      timelogRowsReturned: timelogs.length
    });

    return res.json({
      from,
      to,
      syncedCount: entries.length,
      inserted,
      updated,
      unchanged,
      seenProjects: projectReconcile.seenProjects,
      insertedProjects: projectReconcile.insertedProjects,
      updatedProjects: projectReconcile.updatedProjects,
      totalHours: Number(syncResult.totalHours.toFixed(2)),
      timelogs,
      requestId
    });
  } catch (error) {
    logger.error('Timelog sync: failed', {
      requestId,
      userId: req.user?.id,
      jiraAccountId: req.jiraConnection?.external_account_id,
      message: error.message,
      stack: error.stack,
      status: error.response?.status,
      responseData: error.response?.data
    });

    if (transactionStarted) {
      await connection.rollback();
      logger.warn('Timelog sync: transaction rolled back', { requestId });
    }

    return res.status(500).json({
      message: 'Failed to sync timelogs',
      error: error.message,
      requestId
    });
  } finally {
    connection.release();
    logger.info('Timelog sync: DB connection released', { requestId });
  }
};

const listTimelogs = async (req, res) => {
  const requestId = `timelog-list-${Date.now()}`;
  try {
    const { from, to } = req.query;
    logger.info('Timelog list: request received', { requestId, userId: req.user?.id, from, to });
    const timelogs = await getTimelogsForUser(req.user.id, from, to);
    logger.info('Timelog list: response ready', { requestId, rows: timelogs.length });
    return res.json({ timelogs });
  } catch (error) {
    logger.error('Timelog list: failed', {
      requestId,
      userId: req.user?.id,
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({ message: 'Failed to fetch timelogs', error: error.message, requestId });
  }
};

module.exports = {
  syncTimelogs,
  listTimelogs
};
