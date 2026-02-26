const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

const migrationsDir = path.resolve(__dirname, '../migrations');

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrationSet() {
  const [rows] = await db.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((row) => row.filename));
}

async function runMigrations() {
  await ensureMigrationsTable();

  const files = await fs.readdir(migrationsDir);
  const migrationFiles = files.filter((file) => file.endsWith('.sql')).sort();

  const appliedSet = await getAppliedMigrationSet();

  for (const file of migrationFiles) {
    if (appliedSet.has(file)) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      await connection.commit();
      // eslint-disable-next-line no-console
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = { runMigrations };
