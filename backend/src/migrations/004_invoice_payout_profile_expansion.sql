ALTER TABLE user_profiles
  ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'USD' AFTER hourly_rate_usd,
  ADD COLUMN payment_method VARCHAR(50) NULL AFTER currency,
  ADD COLUMN beneficiary_address_line1 VARCHAR(255) NULL AFTER payment_method,
  ADD COLUMN beneficiary_address_line2 VARCHAR(255) NULL AFTER beneficiary_address_line1,
  ADD COLUMN beneficiary_city VARCHAR(100) NULL AFTER beneficiary_address_line2,
  ADD COLUMN beneficiary_state VARCHAR(100) NULL AFTER beneficiary_city,
  ADD COLUMN beneficiary_postal_code VARCHAR(50) NULL AFTER beneficiary_state,
  ADD COLUMN beneficiary_country VARCHAR(100) NULL AFTER beneficiary_postal_code,
  ADD COLUMN email_for_remittance VARCHAR(255) NULL AFTER beneficiary_country,
  ADD COLUMN bank_account_last4 VARCHAR(4) NULL AFTER bank_account_number,
  ADD COLUMN bank_address_line1 VARCHAR(255) NULL AFTER bank_address,
  ADD COLUMN bank_address_line2 VARCHAR(255) NULL AFTER bank_address_line1,
  ADD COLUMN bank_city VARCHAR(100) NULL AFTER bank_address_line2,
  ADD COLUMN bank_state VARCHAR(100) NULL AFTER bank_city,
  ADD COLUMN bank_postal_code VARCHAR(50) NULL AFTER bank_state,
  ADD COLUMN bank_country VARCHAR(100) NULL AFTER bank_postal_code,
  ADD COLUMN is_default_payout_account TINYINT(1) NOT NULL DEFAULT 1 AFTER bank_country,
  ADD COLUMN verified_at TIMESTAMP NULL DEFAULT NULL AFTER is_default_payout_account,
  ADD COLUMN notes TEXT NULL AFTER verified_at,
  ADD COLUMN effective_from DATE NULL AFTER notes;

UPDATE user_profiles
SET bank_account_last4 = RIGHT(bank_account_number, 4)
WHERE bank_account_number IS NOT NULL
  AND bank_account_number <> ''
  AND (bank_account_last4 IS NULL OR bank_account_last4 = '');

UPDATE user_profiles
SET bank_address_line1 = bank_address
WHERE bank_address IS NOT NULL
  AND bank_address <> ''
  AND (bank_address_line1 IS NULL OR bank_address_line1 = '');

ALTER TABLE invoices
  ADD COLUMN payee_name_snapshot VARCHAR(255) NULL AFTER pdf_path,
  ADD COLUMN payee_email_snapshot VARCHAR(255) NULL AFTER payee_name_snapshot,
  ADD COLUMN payee_address_line1_snapshot VARCHAR(255) NULL AFTER payee_email_snapshot,
  ADD COLUMN payee_address_line2_snapshot VARCHAR(255) NULL AFTER payee_address_line1_snapshot,
  ADD COLUMN payee_city_snapshot VARCHAR(100) NULL AFTER payee_address_line2_snapshot,
  ADD COLUMN payee_state_snapshot VARCHAR(100) NULL AFTER payee_city_snapshot,
  ADD COLUMN payee_postal_code_snapshot VARCHAR(50) NULL AFTER payee_state_snapshot,
  ADD COLUMN payee_country_snapshot VARCHAR(100) NULL AFTER payee_postal_code_snapshot,
  ADD COLUMN payment_method_snapshot VARCHAR(50) NULL AFTER payee_country_snapshot,
  ADD COLUMN payment_currency_snapshot VARCHAR(10) NULL AFTER payment_method_snapshot,
  ADD COLUMN remittance_email_snapshot VARCHAR(255) NULL AFTER payment_currency_snapshot,
  ADD COLUMN bank_account_title_snapshot VARCHAR(255) NULL AFTER remittance_email_snapshot,
  ADD COLUMN bank_routing_number_snapshot VARCHAR(100) NULL AFTER bank_account_title_snapshot,
  ADD COLUMN bank_account_number_snapshot VARCHAR(100) NULL AFTER bank_routing_number_snapshot,
  ADD COLUMN bank_account_last4_snapshot VARCHAR(4) NULL AFTER bank_account_number_snapshot,
  ADD COLUMN bank_account_type_snapshot VARCHAR(100) NULL AFTER bank_account_last4_snapshot,
  ADD COLUMN bank_name_snapshot VARCHAR(255) NULL AFTER bank_account_type_snapshot,
  ADD COLUMN bank_address_line1_snapshot VARCHAR(255) NULL AFTER bank_name_snapshot,
  ADD COLUMN bank_address_line2_snapshot VARCHAR(255) NULL AFTER bank_address_line1_snapshot,
  ADD COLUMN bank_city_snapshot VARCHAR(100) NULL AFTER bank_address_line2_snapshot,
  ADD COLUMN bank_state_snapshot VARCHAR(100) NULL AFTER bank_city_snapshot,
  ADD COLUMN bank_postal_code_snapshot VARCHAR(50) NULL AFTER bank_state_snapshot,
  ADD COLUMN bank_country_snapshot VARCHAR(100) NULL AFTER bank_postal_code_snapshot;
