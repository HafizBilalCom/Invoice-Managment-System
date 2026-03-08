CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('CONTRACTOR', 'PM', 'FINANCE', 'ADMIN') NOT NULL,
  provider ENUM('GOOGLE', 'JIRA') NOT NULL,
  provider_id VARCHAR(255) NULL,
  avatar_url VARCHAR(512) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uniq_users_email (email),
  UNIQUE KEY uniq_provider_provider_id (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contractors (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL UNIQUE,
  contractor_code VARCHAR(100) NULL,
  hourly_rate DECIMAL(10,2) NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_contractors_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  project_key VARCHAR(100) NOT NULL UNIQUE,
  project_name VARCHAR(255) NOT NULL,
  project_number VARCHAR(100) NULL,
  project_account_number VARCHAR(100) NULL,
  pm_user_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_projects_project_number (project_number),
  KEY idx_projects_project_account_number (project_account_number),
  CONSTRAINT fk_projects_pm_user FOREIGN KEY (pm_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS oauth_connections (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  provider ENUM('JIRA') NOT NULL,
  external_account_id VARCHAR(255) NOT NULL,
  external_email VARCHAR(255) NULL,
  jira_cloud_id VARCHAR(128) NULL,
  jira_site_name VARCHAR(255) NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NULL,
  token_expires_at TIMESTAMP NULL,
  scopes VARCHAR(1000) NULL,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_provider (user_id, provider),
  UNIQUE KEY uniq_provider_external_account (provider, external_account_id),
  CONSTRAINT fk_oauth_connections_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  hourly_rate_usd DECIMAL(10,2) NULL,
  bank_account_title VARCHAR(255) NULL,
  bank_routing_number VARCHAR(100) NULL,
  bank_account_number VARCHAR(100) NULL,
  bank_account_type VARCHAR(100) NULL,
  bank_name VARCHAR(255) NULL,
  bank_address VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_profiles_user_id (user_id),
  CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tempo_accounts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tempo_account_id BIGINT NOT NULL,
  account_key VARCHAR(100) NOT NULL,
  self_url VARCHAR(500) NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NULL,
  is_global TINYINT(1) NOT NULL DEFAULT 0,
  lead_self VARCHAR(500) NULL,
  lead_account_id VARCHAR(255) NULL,
  category_self VARCHAR(500) NULL,
  category_key VARCHAR(100) NULL,
  category_id BIGINT NULL,
  category_name VARCHAR(255) NULL,
  category_type_name VARCHAR(100) NULL,
  customer_self VARCHAR(500) NULL,
  customer_key VARCHAR(100) NULL,
  customer_id BIGINT NULL,
  customer_name VARCHAR(255) NULL,
  links_self VARCHAR(500) NULL,
  raw_payload JSON NOT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tempo_accounts_tempo_id (tempo_account_id),
  UNIQUE KEY uniq_tempo_accounts_key (account_key)
);

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider ENUM('TEMPO') NOT NULL DEFAULT 'TEMPO',
  external_entry_id VARCHAR(150) NOT NULL UNIQUE,
  contractor_user_id BIGINT NOT NULL,
  author_account_id VARCHAR(255) NULL,
  project_id BIGINT NULL,
  project_key VARCHAR(100) NULL,
  project_name VARCHAR(255) NULL,
  project_number VARCHAR(100) NULL,
  project_account_number VARCHAR(100) NULL,
  issue_key VARCHAR(100) NULL,
  work_date DATE NOT NULL,
  hours DECIMAL(8,2) NOT NULL,
  description TEXT NULL,
  raw_payload JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_timesheet_user_date (contractor_user_id, work_date),
  KEY idx_timesheet_author_account_date (author_account_id, work_date),
  KEY idx_timesheet_project_key (project_key),
  KEY idx_timesheet_project_number (project_number),
  KEY idx_timesheet_project_account_number (project_account_number),
  CONSTRAINT fk_timesheet_entries_user FOREIGN KEY (contractor_user_id) REFERENCES users(id),
  CONSTRAINT fk_timesheet_entries_project FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  contractor_id BIGINT NOT NULL,
  project_name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_hours DECIMAL(10,2) NOT NULL,
  rate DECIMAL(10,2) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('DRAFT', 'PENDING_PM', 'REJECTED_PM', 'APPROVED_PM', 'PAID') NOT NULL,
  pdf_path VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoices_contractor FOREIGN KEY (contractor_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invoice_comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  invoice_id BIGINT NOT NULL,
  actor_id BIGINT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoice_comments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  invoice_id BIGINT NOT NULL,
  timesheet_entry_id BIGINT NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit_rate DECIMAL(10,2) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT fk_invoice_items_timesheet FOREIGN KEY (timesheet_entry_id) REFERENCES timesheet_entries(id)
);

CREATE TABLE IF NOT EXISTS approvals (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  invoice_id BIGINT NOT NULL,
  current_level INT NOT NULL DEFAULT 1,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_approvals_invoice_id (invoice_id),
  CONSTRAINT fk_approvals_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE TABLE IF NOT EXISTS approval_steps (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  approval_id BIGINT NOT NULL,
  step_order INT NOT NULL,
  approver_user_id BIGINT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  comment TEXT NULL,
  acted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_approval_steps_order (approval_id, step_order),
  CONSTRAINT fk_approval_steps_approval FOREIGN KEY (approval_id) REFERENCES approvals(id),
  CONSTRAINT fk_approval_steps_approver FOREIGN KEY (approver_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  invoice_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  invoice_id BIGINT NOT NULL UNIQUE,
  paid_amount DECIMAL(10,2) NOT NULL,
  paid_on DATE NULL,
  payment_reference VARCHAR(150) NULL,
  status ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  action VARCHAR(100) NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  channel ENUM('EMAIL', 'SLACK', 'IN_APP') NOT NULL DEFAULT 'EMAIL',
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS jira_issues (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT NOT NULL,
  jira_issue_id VARCHAR(100) NULL,
  issue_key VARCHAR(100) NOT NULL,
  summary VARCHAR(1000) NULL,
  status_name VARCHAR(255) NULL,
  status_category VARCHAR(255) NULL,
  issue_type VARCHAR(255) NULL,
  account VARCHAR(255) NULL,
  account_id VARCHAR(255) NULL,
  raw_payload JSON NOT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_jira_issue_key (issue_key),
  KEY idx_jira_issues_project_id (project_id),
  KEY idx_jira_issues_account (account),
  KEY idx_jira_issues_account_id (account_id),
  CONSTRAINT fk_jira_issues_project FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS jira_users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  account_id VARCHAR(255) NOT NULL,
  account_type VARCHAR(100) NULL,
  display_name VARCHAR(255) NULL,
  email_address VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 0,
  locale VARCHAR(100) NULL,
  time_zone VARCHAR(100) NULL,
  self_url VARCHAR(500) NULL,
  avatar_url VARCHAR(1000) NULL,
  raw_payload JSON NOT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_jira_users_account_id (account_id),
  KEY idx_jira_users_display_name (display_name),
  KEY idx_jira_users_email_address (email_address),
  KEY idx_jira_users_active (active)
);

INSERT IGNORE INTO roles (id, code, label) VALUES
  (1, 'CONTRACTOR', 'Contractor'),
  (2, 'PM', 'Project Manager'),
  (3, 'FINANCE', 'Finance'),
  (4, 'ADMIN', 'Administrator');
