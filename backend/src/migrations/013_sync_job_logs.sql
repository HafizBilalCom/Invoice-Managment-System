CREATE TABLE IF NOT EXISTS sync_job_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_type VARCHAR(100) NOT NULL,
  trigger_source VARCHAR(50) NOT NULL,
  request_id VARCHAR(150) NOT NULL UNIQUE,
  user_id BIGINT NULL,
  status ENUM('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'RUNNING',
  summary JSON NULL,
  details JSON NULL,
  error_message TEXT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sync_job_logs_job_type (job_type),
  KEY idx_sync_job_logs_status (status),
  KEY idx_sync_job_logs_started_at (started_at),
  CONSTRAINT fk_sync_job_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
);
