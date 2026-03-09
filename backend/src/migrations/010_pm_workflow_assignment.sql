SET @users_pm_col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'is_project_manager'
);

SET @users_pm_sql = IF(
  @users_pm_col_exists = 0,
  'ALTER TABLE users ADD COLUMN is_project_manager TINYINT(1) NOT NULL DEFAULT 0 AFTER role',
  'SELECT 1'
);

PREPARE users_pm_stmt FROM @users_pm_sql;
EXECUTE users_pm_stmt;
DEALLOCATE PREPARE users_pm_stmt;

SET @invoices_pm_col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'invoices'
    AND column_name = 'pm_approver_user_id'
);

SET @invoices_pm_sql = IF(
  @invoices_pm_col_exists = 0,
  'ALTER TABLE invoices ADD COLUMN pm_approver_user_id BIGINT NULL AFTER contractor_id',
  'SELECT 1'
);

PREPARE invoices_pm_stmt FROM @invoices_pm_sql;
EXECUTE invoices_pm_stmt;
DEALLOCATE PREPARE invoices_pm_stmt;
