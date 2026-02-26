const axios = require('axios');
const db = require('../config/db');
const logger = require('../utils/logger');

function parseLimit() {
  const parsed = Number(process.env.TEMPO_PAGE_LIMIT || 50);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(parsed, 1000);
}

function ensureLimitInNextUrl(nextUrl, limit) {
  try {
    const parsed = new URL(nextUrl);
    parsed.searchParams.set('limit', String(limit));
    return parsed.toString();
  } catch (error) {
    return nextUrl;
  }
}

function mapTempoAccount(account) {
  return {
    tempoAccountId: account.id,
    accountKey: account.key,
    selfUrl: account.self || null,
    name: account.name || account.key || 'Unknown',
    status: account.status || null,
    isGlobal: account.global ? 1 : 0,
    leadSelf: account.lead?.self || null,
    leadAccountId: account.lead?.accountId || null,
    categorySelf: account.category?.self || null,
    categoryKey: account.category?.key || null,
    categoryId: account.category?.id || null,
    categoryName: account.category?.name || null,
    categoryTypeName: account.category?.type?.name || null,
    customerSelf: account.customer?.self || null,
    customerKey: account.customer?.key || null,
    customerId: account.customer?.id || null,
    customerName: account.customer?.name || null,
    linksSelf: account.links?.self || null,
    rawPayload: JSON.stringify(account)
  };
}

async function fetchAllTempoAccounts({ requestId }) {
  const baseUrl = process.env.TEMPO_API_BASE_URL || 'https://api.tempo.io/4';
  const token = process.env.TEMPO_API_TOKEN;
  const limit = parseLimit();

  if (!token) {
    throw new Error('Missing TEMPO_API_TOKEN in backend env');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  };

  const accounts = [];
  let pageCount = 0;
  let nextUrl = null;

  while (true) {
    let response;
    try {
      if (nextUrl) {
        response = await axios.get(nextUrl, { headers });
      } else {
        response = await axios.get(`${baseUrl}/accounts`, {
          params: {
            offset: 0,
            limit
          },
          headers
        });
      }
    } catch (error) {
      logger.error('Tempo account sync: page request failed', {
        requestId,
        page: pageCount + 1,
        url: nextUrl || `${baseUrl}/accounts`,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        message: error.message
      });
      throw error;
    }

    pageCount += 1;
    const pageResults = response.data?.results || [];
    const metadata = response.data?.metadata || {};
    const rawNext = metadata.next || null;

    accounts.push(...pageResults);

    logger.info('Tempo account sync: fetched page', {
      requestId,
      page: pageCount,
      pageCountEntries: pageResults.length,
      totalAccumulated: accounts.length,
      hasNext: Boolean(rawNext),
      offset: metadata.offset,
      limit: metadata.limit,
      count: metadata.count
    });

    if (!rawNext) {
      break;
    }

    nextUrl = ensureLimitInNextUrl(rawNext, limit);

    if (pageCount >= 2000) {
      logger.warn('Tempo account sync: pagination guard reached', {
        requestId,
        pageCount,
        totalAccumulated: accounts.length
      });
      break;
    }
  }

  return { accounts, pageCount, limit };
}

async function upsertTempoAccounts({ accounts, requestId }) {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const account of accounts) {
    const mapped = mapTempoAccount(account);

    const [existingRows] = await db.query(
      'SELECT id, raw_payload FROM tempo_accounts WHERE tempo_account_id = ? LIMIT 1',
      [mapped.tempoAccountId]
    );

    if (!existingRows[0]) {
      await db.query(
        `INSERT INTO tempo_accounts
        (tempo_account_id, account_key, self_url, name, status, is_global, lead_self, lead_account_id,
         category_self, category_key, category_id, category_name, category_type_name,
         customer_self, customer_key, customer_id, customer_name, links_self, raw_payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mapped.tempoAccountId,
          mapped.accountKey,
          mapped.selfUrl,
          mapped.name,
          mapped.status,
          mapped.isGlobal,
          mapped.leadSelf,
          mapped.leadAccountId,
          mapped.categorySelf,
          mapped.categoryKey,
          mapped.categoryId,
          mapped.categoryName,
          mapped.categoryTypeName,
          mapped.customerSelf,
          mapped.customerKey,
          mapped.customerId,
          mapped.customerName,
          mapped.linksSelf,
          mapped.rawPayload
        ]
      );
      inserted += 1;
    } else if (String(existingRows[0].raw_payload) !== mapped.rawPayload) {
      await db.query(
        `UPDATE tempo_accounts
         SET account_key = ?, self_url = ?, name = ?, status = ?, is_global = ?,
             lead_self = ?, lead_account_id = ?,
             category_self = ?, category_key = ?, category_id = ?, category_name = ?, category_type_name = ?,
             customer_self = ?, customer_key = ?, customer_id = ?, customer_name = ?,
             links_self = ?, raw_payload = ?
         WHERE tempo_account_id = ?`,
        [
          mapped.accountKey,
          mapped.selfUrl,
          mapped.name,
          mapped.status,
          mapped.isGlobal,
          mapped.leadSelf,
          mapped.leadAccountId,
          mapped.categorySelf,
          mapped.categoryKey,
          mapped.categoryId,
          mapped.categoryName,
          mapped.categoryTypeName,
          mapped.customerSelf,
          mapped.customerKey,
          mapped.customerId,
          mapped.customerName,
          mapped.linksSelf,
          mapped.rawPayload,
          mapped.tempoAccountId
        ]
      );
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  logger.info('Tempo account sync: upsert complete', {
    requestId,
    total: accounts.length,
    inserted,
    updated,
    unchanged
  });

  return { inserted, updated, unchanged };
}

async function listTempoAccounts() {
  const [rows] = await db.query(
    `SELECT id, tempo_account_id, account_key, self_url, name, status, is_global,
            lead_self, lead_account_id,
            category_self, category_key, category_id, category_name, category_type_name,
            customer_self, customer_key, customer_id, customer_name,
            links_self, raw_payload, last_synced_at, created_at
     FROM tempo_accounts
     ORDER BY account_key ASC`
  );

  return rows.map((row) => ({
    id: row.id,
    tempoAccountId: row.tempo_account_id,
    key: row.account_key,
    self: row.self_url,
    name: row.name,
    status: row.status,
    global: Boolean(row.is_global),
    lead: {
      self: row.lead_self,
      accountId: row.lead_account_id
    },
    category: {
      self: row.category_self,
      key: row.category_key,
      id: row.category_id,
      name: row.category_name,
      type: {
        name: row.category_type_name
      }
    },
    customer: {
      self: row.customer_self,
      key: row.customer_key,
      id: row.customer_id,
      name: row.customer_name
    },
    links: {
      self: row.links_self
    },
    rawPayload: row.raw_payload,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at
  }));
}

module.exports = {
  fetchAllTempoAccounts,
  upsertTempoAccounts,
  listTempoAccounts,
  parseLimit
};
