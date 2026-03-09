CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  step_order INT NOT NULL,
  step_title VARCHAR(255) NOT NULL,
  approver_user_id BIGINT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  is_final TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_approval_workflow_step_order (step_order),
  CONSTRAINT fk_approval_workflow_step_approver FOREIGN KEY (approver_user_id) REFERENCES users(id)
);

INSERT IGNORE INTO approval_workflow_steps (step_order, step_title, approver_user_id, is_active, is_final) VALUES
  (1, 'Level 1 Approval', NULL, 1, 0),
  (2, 'Level 2 Approval', NULL, 0, 0),
  (3, 'Level 3 Approval', NULL, 0, 0),
  (4, 'Level 4 Approval', NULL, 0, 0),
  (5, 'Level 5 Approval', NULL, 0, 0),
  (6, 'Level 6 Approval', NULL, 0, 1);

SET @approval_steps_title_col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'approval_steps'
    AND column_name = 'step_title'
);

SET @approval_steps_title_sql = IF(
  @approval_steps_title_col_exists = 0,
  'ALTER TABLE approval_steps ADD COLUMN step_title VARCHAR(255) NULL AFTER step_order',
  'SELECT 1'
);

PREPARE approval_steps_title_stmt FROM @approval_steps_title_sql;
EXECUTE approval_steps_title_stmt;
DEALLOCATE PREPARE approval_steps_title_stmt;
