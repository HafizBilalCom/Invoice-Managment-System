ALTER TABLE timesheet_entries
  ADD COLUMN author_account_id VARCHAR(255) NULL AFTER contractor_user_id;

CREATE INDEX idx_timesheet_author_account_date ON timesheet_entries (author_account_id, work_date);

UPDATE timesheet_entries
SET author_account_id = COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.author.accountId')),
  JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.author.accountID')),
  JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.worker.accountId')),
  JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.worker.accountID'))
)
WHERE author_account_id IS NULL;
