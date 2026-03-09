SET @provider_nullable = (
  SELECT IS_NULLABLE
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'provider'
  LIMIT 1
);

SET @provider_nullable_sql = IF(
  @provider_nullable = 'NO',
  "ALTER TABLE users MODIFY COLUMN provider ENUM('GOOGLE', 'JIRA') NULL",
  'SELECT 1'
);

PREPARE provider_nullable_stmt FROM @provider_nullable_sql;
EXECUTE provider_nullable_stmt;
DEALLOCATE PREPARE provider_nullable_stmt;
