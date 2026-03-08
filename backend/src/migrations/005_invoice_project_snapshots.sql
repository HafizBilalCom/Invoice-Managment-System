ALTER TABLE invoices
  ADD COLUMN project_key_snapshot VARCHAR(100) NULL AFTER project_name,
  ADD COLUMN project_number_snapshot VARCHAR(100) NULL AFTER project_key_snapshot,
  ADD COLUMN project_account_number_snapshot VARCHAR(100) NULL AFTER project_number_snapshot;
