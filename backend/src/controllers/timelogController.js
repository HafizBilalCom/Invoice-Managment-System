const db = require('../config/db');
const { syncTimesheetsDirect } = require('../services/tempoService');
const { getSyncCursor, upsertSyncCursor } = require('../services/syncCursorService');
const logger = require('../utils/logger');

const TEMPO_WORKLOG_SYNC_CURSOR_KEY = 'TEMPO_WORKLOGS_GLOBAL';
const TEMPO_WORKLOG_INITIAL_FROM = String(process.env.TEMPO_WORKLOGS_INITIAL_FROM || '2026-01-01').slice(0, 10);

function getExternalEntryId(entry, index) {
  return String(entry?.tempoWorklogId || entry?.worklogId || entry?.id || entry?.issue?.id || `tempo-${Date.now()}-${index}`);
}

function mapWorkDate(entry, fallbackFrom) {
  return entry.startDate || entry.dateStarted || entry.updatedAt?.slice(0, 10) || fallbackFrom;
}

function mapAuthorAccountId(entry) {
  return (
    entry?.author?.accountId ||
    entry?.author?.accountID ||
    entry?.worker?.accountId ||
    entry?.worker?.accountID ||
    null
  );
}

function mapTempoIssueId(entry) {
  const value = entry?.issue?.id;
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
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

async function mapProjectsFromCatalog(connection, catalog, requestId) {
  const projectNumbers = [...new Set(catalog.map((p) => p.projectNumber).filter(Boolean))];
  const projectIdMap = new Map();
  const projectById = new Map();
  const chainBreakReasons = new Map();
  let ambiguousProjectNumbers = 0;

  if (projectNumbers.length > 0) {
    const projectNumberPlaceholders = projectNumbers.map(() => '?').join(', ');
    const [tempoRows] = await connection.query(
      `SELECT account_key, tempo_account_id
       FROM tempo_accounts
       WHERE account_key IN (${projectNumberPlaceholders})`,
      projectNumbers
    );
    const tempoByProjectNumber = new Map(tempoRows.map((row) => [String(row.account_key), Number(row.tempo_account_id)]));

    const tempoAccountIds = [...new Set(tempoRows.map((row) => Number(row.tempo_account_id)).filter((id) => Number.isFinite(id) && id > 0))];
    const jiraByTempoAccountId = new Map();

    if (tempoAccountIds.length > 0) {
      const tempoAccountPlaceholders = tempoAccountIds.map(() => '?').join(', ');
      const [jiraRows] = await connection.query(
        `SELECT account_id, project_id
         FROM jira_issues
         WHERE CAST(account_id AS UNSIGNED) IN (${tempoAccountPlaceholders})`,
        tempoAccountIds
      );

      for (const row of jiraRows) {
        const tempoAccountId = Number(row.account_id);
        if (!Number.isFinite(tempoAccountId) || tempoAccountId <= 0) {
          continue;
        }

        if (!jiraByTempoAccountId.has(tempoAccountId)) {
          jiraByTempoAccountId.set(tempoAccountId, {
            hasAnyIssue: false,
            projectIds: new Set()
          });
        }

        const aggregate = jiraByTempoAccountId.get(tempoAccountId);
        aggregate.hasAnyIssue = true;
        if (row.project_id !== null && row.project_id !== undefined) {
          const projectId = Number(row.project_id);
          if (Number.isFinite(projectId) && projectId > 0) {
            aggregate.projectIds.add(projectId);
          }
        }
      }
    }

    for (const projectNumber of projectNumbers) {
      const tempoAccountId = tempoByProjectNumber.get(projectNumber);
      if (!tempoAccountId) {
        chainBreakReasons.set(projectNumber, 'No matching tempo_accounts.account_key row found');
        continue;
      }

      const jiraAggregate = jiraByTempoAccountId.get(tempoAccountId);
      if (!jiraAggregate || !jiraAggregate.hasAnyIssue) {
        chainBreakReasons.set(
          projectNumber,
          `No jira_issues rows found for account_id mapped from tempo_account_id=${tempoAccountId}`
        );
        continue;
      }

      const projectIds = [...jiraAggregate.projectIds];
      if (projectIds.length === 0) {
        chainBreakReasons.set(
          projectNumber,
          `jira_issues found for tempo_account_id=${tempoAccountId} but project_id is null or invalid`
        );
        continue;
      }

      const selectedProjectId = Math.min(...projectIds);
      projectIdMap.set(projectNumber, selectedProjectId);

      if (projectIds.length > 1) {
        ambiguousProjectNumbers += 1;
        logger.warn('Timelog sync: multiple projects matched same Tempo account key, using smallest project id', {
          requestId,
          projectNumber,
          projectCount: projectIds.length,
          selectedProjectId
        });
      }
    }

    const projectIds = [...new Set([...projectIdMap.values()])];
    if (projectIds.length > 0) {
      const projectIdPlaceholders = projectIds.map(() => '?').join(', ');
      const [projectRows] = await connection.query(
        `SELECT id, project_key, project_name, project_number, project_account_number
         FROM projects
         WHERE id IN (${projectIdPlaceholders})`,
        projectIds
      );
      for (const row of projectRows) {
        projectById.set(Number(row.id), row);
      }
    }

    for (const [projectNumber, projectId] of projectIdMap.entries()) {
      if (!projectById.has(Number(projectId))) {
        chainBreakReasons.set(
          projectNumber,
          `Resolved jira_issues.project_id=${projectId} not found in projects table`
        );
        projectIdMap.delete(projectNumber);
      }
    }
  }

  const seenProjects = catalog.length;
  const linkedProjects = projectIdMap.size;
  const unlinkedProjects = Math.max(seenProjects - linkedProjects, 0);

  logger.info('Timelog sync: project link mapping complete', {
    requestId,
    seenProjects,
    linkedProjects,
    unlinkedProjects,
    ambiguousProjectNumbers
  });

  return {
    projectIdMap,
    projectById,
    chainBreakReasons,
    insertedProjects: 0,
    updatedProjects: 0,
    seenProjects,
    linkedProjects,
    unlinkedProjects,
    ambiguousProjectNumbers
  };
}

async function mapJiraIssueReferences(connection, entries, requestId) {
  const jiraIssueApiIds = [...new Set(entries.map((entry) => mapTempoIssueId(entry)).filter(Boolean))];
  const jiraIssueRefMap = new Map();

  if (jiraIssueApiIds.length === 0) {
    logger.info('Timelog sync: no Jira issue ids found in payload for reference mapping', {
      requestId
    });
    return jiraIssueRefMap;
  }

  const placeholders = jiraIssueApiIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id, jira_issue_id
     FROM jira_issues
     WHERE CAST(jira_issue_id AS UNSIGNED) IN (${placeholders})`,
    jiraIssueApiIds
  );

  for (const row of rows) {
    const jiraIssueApiId = Number(row.jira_issue_id);
    const jiraIssueRefId = Number(row.id);

    if (!Number.isFinite(jiraIssueApiId) || !Number.isFinite(jiraIssueRefId)) {
      continue;
    }

    if (!jiraIssueRefMap.has(jiraIssueApiId)) {
      jiraIssueRefMap.set(jiraIssueApiId, jiraIssueRefId);
    }
  }

  logger.info('Timelog sync: Jira issue reference mapping complete', {
    requestId,
    issueIdsSeen: jiraIssueApiIds.length,
    issueRefsLinked: jiraIssueRefMap.size
  });

  return jiraIssueRefMap;
}

async function mapAuthorUsers(connection, entries, requestId) {
  const authorAccountIds = [...new Set(entries.map((entry) => mapAuthorAccountId(entry)).filter(Boolean))];
  const authorUserMap = new Map();

  if (authorAccountIds.length === 0) {
    logger.info('Timelog sync: no author account ids found for user mapping', { requestId });
    return authorUserMap;
  }

  const placeholders = authorAccountIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT ju.account_id, u.id AS user_id
     FROM jira_users ju
     JOIN users u
       ON LOWER(u.email) = LOWER(ju.email_address)
     WHERE ju.account_id IN (${placeholders})`,
    authorAccountIds
  );

  for (const row of rows) {
    if (!row.account_id || !row.user_id) {
      continue;
    }
    authorUserMap.set(String(row.account_id), Number(row.user_id));
  }

  logger.info('Timelog sync: author user mapping complete', {
    requestId,
    authorsSeen: authorAccountIds.length,
    authorsLinked: authorUserMap.size
  });

  return authorUserMap;
}

async function getTimelogsForUser(accountId, from, to) {
  const filters = ['te.author_account_id = ?', 'te.source_deleted_at IS NULL'];
  const values = [accountId];

  if (from) {
    filters.push('te.work_date >= ?');
    values.push(from);
  }

  if (to) {
    filters.push('te.work_date <= ?');
    values.push(to);
  }

  const [rows] = await db.query(
    `SELECT te.id, te.external_entry_id, te.author_account_id, te.work_date, te.hours, te.description,
            te.project_key, te.project_name, te.project_number, te.project_account_number,
            te.issue_key, te.jira_issue_api_id, te.jira_issue_ref_id, te.created_at, te.updated_at, te.source_deleted_at,
            ji.issue_key AS linked_issue_key,
            p.id AS project_id, p.project_key AS linked_project_key, p.project_name AS linked_project_name,
            p.project_number AS linked_project_number, p.project_account_number AS linked_project_account_number
     FROM timesheet_entries te
     LEFT JOIN jira_issues ji ON ji.id = te.jira_issue_ref_id
     LEFT JOIN projects p ON p.id = te.project_id
     WHERE ${filters.join(' AND ')}
     ORDER BY te.work_date DESC, te.id DESC`,
    values
  );

  return rows.map((row) => ({
    id: row.id,
    externalEntryId: row.external_entry_id,
    authorAccountId: row.author_account_id,
    workDate: row.work_date,
    hours: Number(row.hours),
    description: row.description,
    projectId: row.project_id,
    projectKey: row.linked_project_key || row.project_key,
    projectName: row.linked_project_name || row.project_name,
    projectNumber: row.linked_project_number || row.project_number,
    projectAccountNumber: row.linked_project_account_number || row.project_account_number,
    issueKey: row.linked_issue_key || row.issue_key,
    jiraIssueApiId: row.jira_issue_api_id,
    jiraIssueRefId: row.jira_issue_ref_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

const timelogSyncStateByUser = new Map();

function getTimelogSyncState(userId) {
  if (!timelogSyncStateByUser.has(userId)) {
    timelogSyncStateByUser.set(userId, {
      running: false,
      status: 'IDLE',
      requestId: null,
      startedAt: null,
      finishedAt: null,
      mode: null,
      from: null,
      to: null,
      updatedFrom: null,
      nextCursor: null,
      syncedCount: 0,
      deletedMarked: 0,
      deletedMissing: 0,
      skippedNoAuthorUser: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skippedNoProjectReference: 0,
      seenProjects: 0,
      linkedProjects: 0,
      unlinkedProjects: 0,
      ambiguousProjectNumbers: 0,
      totalHours: 0,
      lastError: null
    });
  }

  return timelogSyncStateByUser.get(userId);
}

function mapDeletedEntryId(entry) {
  if (!entry) {
    return null;
  }

  return String(
    entry.tempoWorklogId ||
      entry.worklogId ||
      entry.entityId ||
      entry.id ||
      entry.deletedObjectId ||
      ''
  ).trim() || null;
}

function mapDeletedEntryTimestamp(entry) {
  return (
    entry.deletedAt ||
    entry.timestamp ||
    entry.updatedAt ||
    entry.createdAt ||
    new Date().toISOString()
  );
}

async function runTimelogSyncJob({ userId, jiraAccountId, requestId }) {
  const connection = await db.getConnection();
  let transactionStarted = false;
  const state = getTimelogSyncState(userId);
  const syncStartedAt = new Date();
  const syncStartedAtIso = syncStartedAt.toISOString();

  state.running = true;
  state.status = 'RUNNING';
  state.requestId = requestId;
  state.startedAt = syncStartedAtIso;
  state.finishedAt = null;
  state.mode = null;
  state.from = null;
  state.to = null;
  state.updatedFrom = null;
  state.nextCursor = null;
  state.lastError = null;
  state.syncedCount = 0;
  state.deletedMarked = 0;
  state.deletedMissing = 0;
  state.skippedNoAuthorUser = 0;
  state.inserted = 0;
  state.updated = 0;
  state.unchanged = 0;
  state.skippedNoProjectReference = 0;
  state.seenProjects = 0;
  state.linkedProjects = 0;
  state.unlinkedProjects = 0;
  state.ambiguousProjectNumbers = 0;
  state.totalHours = 0;

  try {
    const cursor = await getSyncCursor(TEMPO_WORKLOG_SYNC_CURSOR_KEY, connection);
    const updatedFrom = cursor?.cursor_value
      ? new Date(cursor.cursor_value).toISOString()
      : null;
    const mode = updatedFrom ? 'INCREMENTAL' : 'INITIAL';
    const from = updatedFrom ? null : TEMPO_WORKLOG_INITIAL_FROM;
    const to = updatedFrom ? null : syncStartedAtIso.slice(0, 10);

    state.mode = mode;
    state.from = from;
    state.to = to;
    state.updatedFrom = updatedFrom;
    state.nextCursor = syncStartedAtIso;

    const syncResult = await syncTimesheetsDirect({
      from,
      to,
      updatedFrom,
      requestId
    });
    const entries = syncResult.entries || [];
    const deletedEntries = syncResult.deletedEntries || [];

    logger.info('Timelog sync: Tempo response received', {
      requestId,
      mode,
      updatedFrom,
      entriesCount: entries.length,
      deletedEntriesCount: deletedEntries.length,
      totalHours: Number(syncResult.totalHours.toFixed(2))
    });

    await connection.beginTransaction();
    transactionStarted = true;
    logger.info('Timelog sync: transaction started', { requestId });

    const projectCatalog = buildProjectCatalog(entries);
    const projectReconcile = await mapProjectsFromCatalog(connection, projectCatalog, requestId);
    const jiraIssueRefMap = await mapJiraIssueReferences(connection, entries, requestId);
    const authorUserMap = await mapAuthorUsers(connection, entries, requestId);

    const projectIdByNumber = projectReconcile.projectIdMap;

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let skippedNoProjectReference = 0;
    let skippedNoAuthorUser = 0;
    let deletedMarked = 0;
    let deletedMissing = 0;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const seconds = Number(entry.timeSpentSeconds || 0);
      const hours = Number((seconds / 3600).toFixed(2));
      const description = entry.description || 'Tempo worklog';
      const externalEntryId = getExternalEntryId(entry, index);
      const workDate = mapWorkDate(entry, from);
      const mappedProject = mapProject(entry);
      const projectId = mappedProject.projectNumber ? projectIdByNumber.get(mappedProject.projectNumber) || null : null;
      const linkedProject = projectId ? projectReconcile.projectById.get(Number(projectId)) : null;
      const effectiveProject = linkedProject
        ? {
            issueKey: mappedProject.issueKey,
            projectKey: linkedProject.project_key || mappedProject.projectKey,
            projectName: linkedProject.project_name || mappedProject.projectName,
            projectNumber: linkedProject.project_number || mappedProject.projectNumber,
            projectAccountNumber: linkedProject.project_account_number || mappedProject.projectAccountNumber
          }
        : mappedProject;
      const rawPayload = JSON.stringify(entry);
      const authorAccountId = mapAuthorAccountId(entry);
      const contractorUserId = authorAccountId ? authorUserMap.get(authorAccountId) || null : null;
      const jiraIssueApiId = mapTempoIssueId(entry);
      const jiraIssueRefId = jiraIssueApiId ? jiraIssueRefMap.get(jiraIssueApiId) || null : null;
      const chainBreakReason = mappedProject.projectNumber
        ? projectReconcile.chainBreakReasons.get(mappedProject.projectNumber) || null
        : 'Missing _ProjectNumber_ on timesheet entry';

      if (!projectId) {
        logger.warn('Timelog sync: entry skipped, project chain not resolved', {
          requestId,
          externalEntryId,
          issueKey: mappedProject.issueKey || null,
          projectNumber: mappedProject.projectNumber || null,
          reason: chainBreakReason || 'No linked projects.id found through chain'
        });
        skippedNoProjectReference += 1;
        continue;
      }

      if (!contractorUserId) {
        logger.warn('Timelog sync: entry skipped, author user not resolved', {
          requestId,
          externalEntryId,
          authorAccountId: authorAccountId || null,
          issueKey: effectiveProject.issueKey || null
        });
        skippedNoAuthorUser += 1;
        continue;
      }

      const [existingRows] = await connection.query(
        `SELECT id, contractor_user_id, author_account_id, project_id, project_key, project_name, project_number, project_account_number,
                issue_key, jira_issue_api_id, jira_issue_ref_id, work_date, hours, description, raw_payload, source_deleted_at
         FROM timesheet_entries
         WHERE external_entry_id = ?
         LIMIT 1`,
        [externalEntryId]
      );

      if (!existingRows[0]) {
        logger.info('Timelog sync: inserting new entry', { externalEntryId,
            userId,
            contractorUserId,
            authorAccountId,
            projectId,
            projectKey: effectiveProject.projectKey,
            projectName: effectiveProject.projectName,
            projectNumber: effectiveProject.projectNumber,
            projectAccountNumber: effectiveProject.projectAccountNumber,
            issueKey: effectiveProject.issueKey,
            jiraIssueApiId,
            jiraIssueRefId,
            workDate,
            hours,
            description,
            rawPayload });
        await connection.query(
          `INSERT INTO timesheet_entries
          (provider, external_entry_id, contractor_user_id, author_account_id, project_id, project_key, project_name, project_number, project_account_number, issue_key, jira_issue_api_id, jira_issue_ref_id, work_date, hours, description, raw_payload, source_deleted_at)
          VALUES ('TEMPO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            externalEntryId,
            contractorUserId,
            authorAccountId,
            projectId,
            effectiveProject.projectKey,
            effectiveProject.projectName,
            effectiveProject.projectNumber,
            effectiveProject.projectAccountNumber,
            effectiveProject.issueKey,
            jiraIssueApiId,
            jiraIssueRefId,
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
          Number(existing.contractor_user_id || 0) !== Number(contractorUserId || 0) ||
          (existing.author_account_id || null) !== (authorAccountId || null) ||
          Number(existing.project_id || 0) !== Number(projectId || 0) ||
          (existing.project_key || null) !== (effectiveProject.projectKey || null) ||
          (existing.project_name || null) !== (effectiveProject.projectName || null) ||
          (existing.project_number || null) !== (effectiveProject.projectNumber || null) ||
          (existing.project_account_number || null) !== (effectiveProject.projectAccountNumber || null) ||
          (existing.issue_key || null) !== (effectiveProject.issueKey || null) ||
          Number(existing.jira_issue_api_id || 0) !== Number(jiraIssueApiId || 0) ||
          Number(existing.jira_issue_ref_id || 0) !== Number(jiraIssueRefId || 0) ||
          toDateOnly(existing.work_date) !== toDateOnly(workDate) ||
          Number(existing.hours) !== Number(hours) ||
          (existing.description || '') !== description ||
          existing.source_deleted_at !== null ||
          normalizePayload(existing.raw_payload) !== normalizePayload(rawPayload);

        if (hasChanges) {
          await connection.query(
            `UPDATE timesheet_entries
             SET project_id = ?,
                 contractor_user_id = ?,
                 author_account_id = ?,
                 project_key = ?,
                 project_name = ?,
                 project_number = ?,
                 project_account_number = ?,
                 issue_key = ?,
                 jira_issue_api_id = ?,
                 jira_issue_ref_id = ?,
                 work_date = ?,
                 hours = ?,
                 description = ?,
                 raw_payload = ?,
                 source_deleted_at = NULL
             WHERE id = ?`,
            [
              projectId,
              contractorUserId,
              authorAccountId,
              effectiveProject.projectKey,
              effectiveProject.projectName,
              effectiveProject.projectNumber,
              effectiveProject.projectAccountNumber,
              effectiveProject.issueKey,
              jiraIssueApiId,
              jiraIssueRefId,
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
          unchanged,
          skippedNoAuthorUser,
          skippedNoProjectReference
        });
      }
    }

    for (const deletedEntry of deletedEntries) {
      const deletedExternalEntryId = mapDeletedEntryId(deletedEntry);
      if (!deletedExternalEntryId) {
        continue;
      }

      const deletedAt = mapDeletedEntryTimestamp(deletedEntry);
      const [result] = await connection.query(
        `UPDATE timesheet_entries
         SET source_deleted_at = ?
         WHERE external_entry_id = ?
           AND source_deleted_at IS NULL`,
        [deletedAt, deletedExternalEntryId]
      );

      if (Number(result.affectedRows || 0) > 0) {
        deletedMarked += Number(result.affectedRows || 0);
      } else {
        deletedMissing += 1;
      }
    }

    logger.info('Timelog sync: writing audit log', { requestId });
    await connection.query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES (?, ?, ?)',
      [
        userId,
        'TIMELOGS_SYNCED',
        JSON.stringify({
          from,
          to,
          syncedCount: entries.length,
          mode,
          updatedFrom,
          nextCursor: syncStartedAtIso,
          inserted,
          updated,
          unchanged,
          skippedNoAuthorUser,
          deletedMarked,
          deletedMissing,
          skippedNoProjectReference,
          seenProjects: projectReconcile.seenProjects,
          linkedProjects: projectReconcile.linkedProjects,
          unlinkedProjects: projectReconcile.unlinkedProjects,
          ambiguousProjectNumbers: projectReconcile.ambiguousProjectNumbers,
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
      skippedNoAuthorUser,
      deletedMarked,
      deletedMissing,
      skippedNoProjectReference,
      seenProjects: projectReconcile.seenProjects,
      linkedProjects: projectReconcile.linkedProjects,
      unlinkedProjects: projectReconcile.unlinkedProjects,
      ambiguousProjectNumbers: projectReconcile.ambiguousProjectNumbers,
      insertedProjects: projectReconcile.insertedProjects,
      updatedProjects: projectReconcile.updatedProjects
    });

    await upsertSyncCursor(
      {
        cursorKey: TEMPO_WORKLOG_SYNC_CURSOR_KEY,
        cursorValue: syncStartedAt,
        metadata: {
          mode,
          updatedFrom,
          initialFrom: TEMPO_WORKLOG_INITIAL_FROM,
          syncedCount: entries.length,
          deletedMarked,
          deletedMissing,
          requestId
        }
      },
      connection
    );

    const timelogs = await getTimelogsForUser(jiraAccountId, from, to);
    logger.info('Timelog sync: response ready', {
      requestId,
      timelogRowsReturned: timelogs.length
    });

    const result = {
      from,
      to,
      updatedFrom,
      nextCursor: syncStartedAtIso,
      mode,
      syncedCount: entries.length,
      inserted,
      updated,
      unchanged,
      skippedNoAuthorUser,
      deletedMarked,
      deletedMissing,
      skippedNoProjectReference,
      seenProjects: projectReconcile.seenProjects,
      linkedProjects: projectReconcile.linkedProjects,
      unlinkedProjects: projectReconcile.unlinkedProjects,
      ambiguousProjectNumbers: projectReconcile.ambiguousProjectNumbers,
      insertedProjects: projectReconcile.insertedProjects,
      updatedProjects: projectReconcile.updatedProjects,
      totalHours: Number(syncResult.totalHours.toFixed(2)),
      timelogs,
      requestId
    };

    state.status = 'COMPLETED';
    state.syncedCount = result.syncedCount;
    state.deletedMarked = result.deletedMarked;
    state.deletedMissing = result.deletedMissing;
    state.skippedNoAuthorUser = result.skippedNoAuthorUser;
    state.inserted = result.inserted;
    state.updated = result.updated;
    state.unchanged = result.unchanged;
    state.skippedNoProjectReference = result.skippedNoProjectReference;
    state.seenProjects = result.seenProjects;
    state.linkedProjects = result.linkedProjects;
    state.unlinkedProjects = result.unlinkedProjects;
    state.ambiguousProjectNumbers = result.ambiguousProjectNumbers;
    state.totalHours = result.totalHours;
    state.lastError = null;

    return result;
  } catch (error) {
    logger.error('Timelog sync: failed', {
      requestId,
      userId,
      jiraAccountId,
      message: error.message,
      stack: error.stack,
      status: error.response?.status,
      responseData: error.response?.data
    });

    if (transactionStarted) {
      await connection.rollback();
      logger.warn('Timelog sync: transaction rolled back', { requestId });
    }
    state.status = 'FAILED';
    state.lastError = error.message;
    throw error;
  } finally {
    connection.release();
    state.running = false;
    state.finishedAt = new Date().toISOString();
    logger.info('Timelog sync: DB connection released', { requestId });
  }
}

const syncTimelogs = async (req, res) => {
  const requestId = `timelog-sync-${Date.now()}`;
  const userId = req.user?.id;
  const jiraAccountId = req.jiraConnection?.external_account_id;

  logger.info('Timelog sync trigger: request received', {
    requestId,
    userId,
    jiraAccountId
  });

  const state = getTimelogSyncState(userId);
  if (state.running) {
    return res.status(202).json({
      message: 'Timelog sync is already running',
      ...state
    });
  }

  setImmediate(async () => {
    try {
      const { runTimelogSyncManagedJob } = require('../jobs/timelogSyncJob');
      await runTimelogSyncManagedJob({ trigger: 'manual', requestId, userId, jiraAccountId });
    } catch (error) {
      logger.error('Timelog sync background job failed', {
        requestId,
        userId,
        message: error.message
      });
    }
  });

  return res.status(202).json({
    message: 'Timelog sync started',
    requestId,
    running: true
  });
};

const getSyncTimelogsStatus = async (req, res) => {
  const state = getTimelogSyncState(req.user?.id);
  return res.json(state);
};

const listTimelogs = async (req, res) => {
  const requestId = `timelog-list-${Date.now()}`;
  try {
    const { from, to } = req.query;
    logger.info('Timelog list: request received', { requestId, userId: req.user?.id, from, to });
    const timelogs = await getTimelogsForUser(req.jiraConnection.external_account_id, from, to);
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
  runTimelogSyncJob,
  syncTimelogs,
  getSyncTimelogsStatus,
  listTimelogs
};
