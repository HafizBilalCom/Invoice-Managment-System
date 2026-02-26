const dotenv = require('dotenv');
dotenv.config();
const app = require('./app');
const db = require('./config/db');
const { runMigrations } = require('./utils/migrate');
const { startTempoAccountSyncCron } = require('./jobs/tempoAccountSyncJob');

const port = Number(process.env.PORT || 4000);

async function startServer() {
  try {
    await db.query('SELECT 1');
    await runMigrations();

    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`IMS backend running on port ${port}`);
    });

    startTempoAccountSyncCron();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start backend:', error);
    process.exit(1);
  }
}

startServer();
