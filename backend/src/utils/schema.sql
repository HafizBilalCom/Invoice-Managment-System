CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('CONTRACTOR', 'PM', 'FINANCE', 'ADMIN') NOT NULL,
  is_project_manager TINYINT(1) NOT NULL DEFAULT 0,
  provider ENUM('GOOGLE', 'JIRA'),
  provider_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  contractor_id BIGINT NOT NULL,
  pm_approver_user_id BIGINT,
  project_name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_hours DECIMAL(10,2) NOT NULL,
  rate DECIMAL(10,2) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('DRAFT', 'PENDING_PM', 'REJECTED_PM', 'APPROVED_PM', 'PAID') NOT NULL,
  pdf_path VARCHAR(255),
  payee_name_snapshot VARCHAR(255),
  payee_email_snapshot VARCHAR(255),
  payee_address_line1_snapshot VARCHAR(255),
  payee_address_line2_snapshot VARCHAR(255),
  payee_city_snapshot VARCHAR(100),
  payee_state_snapshot VARCHAR(100),
  payee_postal_code_snapshot VARCHAR(50),
  payee_country_snapshot VARCHAR(100),
  payment_method_snapshot VARCHAR(50),
  payment_currency_snapshot VARCHAR(10),
  remittance_email_snapshot VARCHAR(255),
  bank_account_title_snapshot VARCHAR(255),
  bank_routing_number_snapshot VARCHAR(100),
  bank_account_number_snapshot VARCHAR(100),
  bank_account_last4_snapshot VARCHAR(4),
  bank_account_type_snapshot VARCHAR(100),
  bank_name_snapshot VARCHAR(255),
  bank_address_line1_snapshot VARCHAR(255),
  bank_address_line2_snapshot VARCHAR(255),
  bank_city_snapshot VARCHAR(100),
  bank_state_snapshot VARCHAR(100),
  bank_postal_code_snapshot VARCHAR(50),
  bank_country_snapshot VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contractor_id) REFERENCES users(id),
  FOREIGN KEY (pm_approver_user_id) REFERENCES users(id)
);

CREATE TABLE invoice_comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  invoice_id BIGINT NOT NULL,
  actor_id BIGINT,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE TABLE invoice_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  invoice_id BIGINT NOT NULL,
  timesheet_entry_id BIGINT,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit_rate DECIMAL(10,2) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (timesheet_entry_id) REFERENCES timesheet_entries(id)
);

CREATE TABLE jira_users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  account_id VARCHAR(255) NOT NULL UNIQUE,
  account_type VARCHAR(100),
  display_name VARCHAR(255),
  email_address VARCHAR(255),
  active TINYINT(1) NOT NULL DEFAULT 0,
  locale VARCHAR(100),
  time_zone VARCHAR(100),
  self_url VARCHAR(500),
  avatar_url VARCHAR(1000),
  raw_payload JSON NOT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
