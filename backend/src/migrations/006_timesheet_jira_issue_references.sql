SET @has_jira_issue_api_id = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'timesheet_entries'
    AND COLUMN_NAME = 'jira_issue_api_id'
);
SET @add_jira_issue_api_id_sql = IF(
  @has_jira_issue_api_id = 0,
  'ALTER TABLE timesheet_entries ADD COLUMN jira_issue_api_id BIGINT NULL AFTER issue_key',
  'SELECT 1'
);
PREPARE add_jira_issue_api_id_stmt FROM @add_jira_issue_api_id_sql;
EXECUTE add_jira_issue_api_id_stmt;
DEALLOCATE PREPARE add_jira_issue_api_id_stmt;

SET @has_jira_issue_ref_id = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'timesheet_entries'
    AND COLUMN_NAME = 'jira_issue_ref_id'
);
SET @add_jira_issue_ref_id_sql = IF(
  @has_jira_issue_ref_id = 0,
  'ALTER TABLE timesheet_entries ADD COLUMN jira_issue_ref_id BIGINT NULL AFTER jira_issue_api_id',
  'SELECT 1'
);
PREPARE add_jira_issue_ref_id_stmt FROM @add_jira_issue_ref_id_sql;
EXECUTE add_jira_issue_ref_id_stmt;
DEALLOCATE PREPARE add_jira_issue_ref_id_stmt;

SET @has_idx_jira_issue_api_id = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'timesheet_entries'
    AND INDEX_NAME = 'idx_timesheet_jira_issue_api_id'
);
SET @add_idx_jira_issue_api_id_sql = IF(
  @has_idx_jira_issue_api_id = 0,
  'ALTER TABLE timesheet_entries ADD KEY idx_timesheet_jira_issue_api_id (jira_issue_api_id)',
  'SELECT 1'
);
PREPARE add_idx_jira_issue_api_id_stmt FROM @add_idx_jira_issue_api_id_sql;
EXECUTE add_idx_jira_issue_api_id_stmt;
DEALLOCATE PREPARE add_idx_jira_issue_api_id_stmt;

SET @has_idx_jira_issue_ref_id = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'timesheet_entries'
    AND INDEX_NAME = 'idx_timesheet_jira_issue_ref_id'
);
SET @add_idx_jira_issue_ref_id_sql = IF(
  @has_idx_jira_issue_ref_id = 0,
  'ALTER TABLE timesheet_entries ADD KEY idx_timesheet_jira_issue_ref_id (jira_issue_ref_id)',
  'SELECT 1'
);
PREPARE add_idx_jira_issue_ref_id_stmt FROM @add_idx_jira_issue_ref_id_sql;
EXECUTE add_idx_jira_issue_ref_id_stmt;
DEALLOCATE PREPARE add_idx_jira_issue_ref_id_stmt;

UPDATE timesheet_entries te
LEFT JOIN jira_issues ji
  ON CAST(ji.jira_issue_id AS UNSIGNED) = CAST(JSON_UNQUOTE(JSON_EXTRACT(te.raw_payload, '$.issue.id')) AS UNSIGNED)
SET te.jira_issue_api_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(te.raw_payload, '$.issue.id')) AS UNSIGNED),
    te.jira_issue_ref_id = ji.id
WHERE JSON_EXTRACT(te.raw_payload, '$.issue.id') IS NOT NULL;
