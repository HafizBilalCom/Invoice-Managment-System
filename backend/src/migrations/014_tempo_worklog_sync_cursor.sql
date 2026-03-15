CREATE TABLE IF NOT EXISTS sync_cursors (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  cursor_key VARCHAR(150) NOT NULL UNIQUE,
  cursor_value DATETIME(6) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE timesheet_entries
  ADD COLUMN source_deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;

CREATE INDEX idx_timesheet_source_deleted_at ON timesheet_entries (source_deleted_at);
