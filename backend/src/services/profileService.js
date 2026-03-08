const db = require('../config/db');

function nullIfBlank(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function deriveLast4(value) {
  const normalized = nullIfBlank(value);
  if (!normalized) {
    return null;
  }

  return normalized.slice(-4);
}

async function getUserProfileRow(userId, executor = db) {
  const [rows] = await executor.query(
    `SELECT hourly_rate_usd, currency, payment_method,
            beneficiary_address_line1, beneficiary_address_line2, beneficiary_city,
            beneficiary_state, beneficiary_postal_code, beneficiary_country,
            email_for_remittance, bank_account_title, bank_routing_number,
            bank_account_number, bank_account_last4, bank_account_type, bank_name,
            bank_address, bank_address_line1, bank_address_line2, bank_city,
            bank_state, bank_postal_code, bank_country, is_default_payout_account,
            verified_at, notes, effective_from, created_at, updated_at
     FROM user_profiles
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

function mapProfileResponse(user, profileRow) {
  const bankAddressLine1 = profileRow?.bank_address_line1 || profileRow?.bank_address || '';
  const bankAccountLast4 = profileRow?.bank_account_last4 || deriveLast4(profileRow?.bank_account_number) || '';

  return {
    user,
    profile: {
      hourlyRateUsd: profileRow?.hourly_rate_usd != null ? Number(profileRow.hourly_rate_usd) : null,
      currency: profileRow?.currency || 'USD',
      paymentMethod: profileRow?.payment_method || '',
      beneficiaryAddressLine1: profileRow?.beneficiary_address_line1 || '',
      beneficiaryAddressLine2: profileRow?.beneficiary_address_line2 || '',
      beneficiaryCity: profileRow?.beneficiary_city || '',
      beneficiaryState: profileRow?.beneficiary_state || '',
      beneficiaryPostalCode: profileRow?.beneficiary_postal_code || '',
      beneficiaryCountry: profileRow?.beneficiary_country || 'United States',
      emailForRemittance: profileRow?.email_for_remittance || '',
      bankAccountTitle: profileRow?.bank_account_title || '',
      bankRoutingNumber: profileRow?.bank_routing_number || '',
      bankAccountNumber: profileRow?.bank_account_number || '',
      bankAccountLast4,
      bankAccountType: profileRow?.bank_account_type || '',
      bankName: profileRow?.bank_name || '',
      bankAddress: bankAddressLine1,
      bankAddressLine1,
      bankAddressLine2: profileRow?.bank_address_line2 || '',
      bankCity: profileRow?.bank_city || '',
      bankState: profileRow?.bank_state || '',
      bankPostalCode: profileRow?.bank_postal_code || '',
      bankCountry: profileRow?.bank_country || 'United States',
      isDefaultPayoutAccount: profileRow?.is_default_payout_account !== 0,
      verifiedAt: profileRow?.verified_at || null,
      notes: profileRow?.notes || '',
      effectiveFrom: profileRow?.effective_from || null,
      createdAt: profileRow?.created_at || null,
      updatedAt: profileRow?.updated_at || null
    }
  };
}

function buildInvoiceSnapshot({ user, profileRow }) {
  return {
    payeeName: user?.full_name || null,
    payeeEmail: user?.email || null,
    payeeAddressLine1: profileRow?.beneficiary_address_line1 || null,
    payeeAddressLine2: profileRow?.beneficiary_address_line2 || null,
    payeeCity: profileRow?.beneficiary_city || null,
    payeeState: profileRow?.beneficiary_state || null,
    payeePostalCode: profileRow?.beneficiary_postal_code || null,
    payeeCountry: profileRow?.beneficiary_country || null,
    paymentMethod: profileRow?.payment_method || null,
    paymentCurrency: profileRow?.currency || 'USD',
    remittanceEmail: profileRow?.email_for_remittance || user?.email || null,
    bankAccountTitle: profileRow?.bank_account_title || null,
    bankRoutingNumber: profileRow?.bank_routing_number || null,
    bankAccountNumber: profileRow?.bank_account_number || null,
    bankAccountLast4:
      profileRow?.bank_account_last4 || deriveLast4(profileRow?.bank_account_number) || null,
    bankAccountType: profileRow?.bank_account_type || null,
    bankName: profileRow?.bank_name || null,
    bankAddressLine1: profileRow?.bank_address_line1 || profileRow?.bank_address || null,
    bankAddressLine2: profileRow?.bank_address_line2 || null,
    bankCity: profileRow?.bank_city || null,
    bankState: profileRow?.bank_state || null,
    bankPostalCode: profileRow?.bank_postal_code || null,
    bankCountry: profileRow?.bank_country || null
  };
}

module.exports = {
  buildInvoiceSnapshot,
  deriveLast4,
  getUserProfileRow,
  mapProfileResponse,
  nullIfBlank
};
