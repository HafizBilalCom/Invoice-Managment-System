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
