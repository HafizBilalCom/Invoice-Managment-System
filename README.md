# Invoice Management System (IMS)

Stack:
- Frontend: React (Vite + Tailwind CSS)
- Backend: Node.js + Express
- Database: MySQL

## What is implemented

- Direct/synchronous processing (no queue system).
- Google-only login/signup.
- Jira is connected after Google login and persisted in `oauth_connections`.
- Google login is restricted by `ALLOWED_EMAIL_DOMAIN` from backend env.
- Step 1 timelog sync flow: sync Tempo worklogs by date range and persist them in `timesheet_entries`.
- Timelog sync is idempotent: no duplicates; existing rows are updated only when data changes.
- During timelog sync, projects and timelogs are synced in parallel.
- Project reconciliation uses Tempo worklog attributes (including `_ProjectNumber_`) and links `timesheet_entries.project_id` to `projects`.
- Missing projects from synced timelogs are inserted; changed project metadata is updated.
- OAuth users are upserted and persisted in MySQL (`users`) with login audit entries (`audit_logs`).
- Local PDF generation and storage in `backend/storage/pdfs`.
- TailAdmin-style dashboard UI.
- Automatic SQL migrations on backend startup.
- Invoice lifecycle persistence in MySQL (invoices, comments, approvals, approval_steps, invoice_items, payments, timesheet_entries, audit_logs).
- Full Docker setup for frontend, backend, and MySQL.

## Local run (without Docker)

1. Go to project root:
   - `cd /Users/hafizbilal/Desktop/Studio/IMS/ims_code/Invoice-Managment-System`
2. Create backend env:
   - `cp backend/.env.example backend/.env`
3. Update DB and OAuth values in `backend/.env`.
   - Set `ALLOWED_EMAIL_DOMAIN=studiolabs.com` (or your company domain).
   - Set `TEMPO_API_TOKEN=...` and keep `TEMPO_API_BASE_URL=https://api.tempo.io/4`.
   - Set `TEMPO_PAGE_LIMIT=50` (or your preferred page size for Tempo pagination).
   - Set `TEMPO_ACCOUNTS_SYNC_CRON=0 2 * * *` for daily Tempo account sync schedule.
4. Start MySQL and make sure the `ims` database exists.
5. Start backend:
   - `cd backend`
   - `npm install`
   - `npm run dev`
6. Start frontend in a new terminal:
   - `cd frontend`
   - `npm install`
   - `npm run dev`

Backend runs at `http://localhost:4000` and frontend at `http://localhost:5173`.

Important: You do not need to run schema SQL manually anymore. Migrations run automatically when backend starts.

## Docker run (frontend + backend + mysql)

1. From project root run:
   - `docker compose up --build`
2. Open frontend:
   - `http://localhost:5173`
3. Backend API:
   - `http://localhost:4000`

Notes:
- MySQL is exposed on `localhost:3306`.
- Default DB credentials in compose are:
  - DB: `ims`
  - User: `ims_user`
  - Password: `ims_password`
  - Root password: `root`
- Backend migration runner executes automatically at container startup.
- Generated PDFs are persisted on host in `backend/storage/pdfs`.

## Migration system

- Migration files are in `backend/src/migrations`.
- Applied migrations are tracked in MySQL table `schema_migrations`.
- Add new migration files with ordered names, e.g.:
  - `002_add_payments_table.sql`
  - `003_add_invoice_indexes.sql`

## API endpoints

- `GET /health`
- `GET /api/auth/google`
- `GET /api/auth/jira/connect`
- `GET /api/auth/jira/callback`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/invoices`
- `POST /api/invoices/sync-create`
- `PATCH /api/invoices/:id/status`
- `GET /api/timelogs?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/timelogs/sync`
- `GET /api/tempo/accounts`
- `POST /api/tempo/accounts/sync`
- `POST /api/projects/:id/sync-issues`

## Persistence notes

- Nothing is kept in memory for auth or invoice workflow actions anymore.
- If tables are empty (`users_count = 0`, etc.), execute real actions (login, create invoice, update status), then re-check counts.
