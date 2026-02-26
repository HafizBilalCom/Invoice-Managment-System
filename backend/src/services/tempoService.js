const axios = require('axios');
const logger = require('../utils/logger');

function normalizeId(value) {
  if (!value && value !== 0) {
    return null;
  }

  return String(value).trim().toLowerCase();
}

function extractCandidateAccountIds(entry) {
  const ids = [
    entry?.worker?.accountId,
    entry?.worker?.accountID,
    entry?.worker?.accountKey,
    entry?.worker?.key,
    entry?.workerId,
    entry?.workerID,
    entry?.author?.accountId,
    entry?.author?.accountID,
    entry?.authorId,
    entry?.authorID,
    entry?.authorAccountId,
    entry?.tempoWorker?.accountId,
    entry?.tempoWorker?.accountID,
    entry?.attributes?.worker?.accountId,
    entry?.attributes?.worker?.accountID
  ]
    .map(normalizeId)
    .filter(Boolean);

  return [...new Set(ids)];
}

function filterEntriesForUser(entries, accountId) {
  const target = normalizeId(accountId);
  if (!target) {
    return { filtered: [], skipped: entries.length };
  }

  const filtered = [];
  let skipped = 0;

  for (const entry of entries) {
    const candidateIds = extractCandidateAccountIds(entry);
    if (candidateIds.includes(target)) {
      filtered.push(entry);
    } else {
      skipped += 1;
    }
  }

  return { filtered, skipped };
}

function ensureWorkerInNextUrl(nextUrl, accountId) {
  try {
    const parsed = new URL(nextUrl);
    if (!parsed.searchParams.get('worker') && accountId) {
      parsed.searchParams.set('worker', accountId);
    }
    return parsed.toString();
  } catch (error) {
    return nextUrl;
  }
}

async function fetchTempoPages({ baseUrl, token, from, to, accountId, requestId }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  };

  const allResults = [];
  let pageCount = 0;
  let nextUrl = null;

  while (true) {
    let response;

    try {
      if (nextUrl) {
        response = await axios.get(nextUrl, { headers });
      } else {
        response = await axios.get(`${baseUrl}/worklogs`, {
          params: {
            from,
            to,
            worker: accountId,
            offset: 0,
            limit: 50
          },
          headers
        });
      }
    } catch (error) {
      logger.error('Tempo sync: page request failed', {
        requestId,
        page: pageCount + 1,
        url: nextUrl || `${baseUrl}/worklogs`,
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

    allResults.push(...pageResults);

    logger.info('Tempo sync: fetched page', {
      requestId,
      page: pageCount,
      pageCountEntries: pageResults.length,
      totalAccumulated: allResults.length,
      hasNext: Boolean(rawNext),
      offset: metadata.offset,
      limit: metadata.limit,
      count: metadata.count
    });

    if (!rawNext) {
      break;
    }

    nextUrl = ensureWorkerInNextUrl(rawNext, accountId);

    if (pageCount >= 1000) {
      logger.warn('Tempo sync: pagination guard reached', {
        requestId,
        pageCount,
        totalAccumulated: allResults.length
      });
      break;
    }
  }

  return { results: allResults, pageCount };
}

const syncTimesheetsDirect = async ({ accountId, from, to, requestId }) => {
  const baseUrl = process.env.TEMPO_API_BASE_URL || 'https://api.tempo.io/4';
  const token = process.env.TEMPO_API_TOKEN;

  logger.info('Tempo sync: request started', {
    requestId,
    accountId,
    from,
    to,
    baseUrl
  });

  if (!token) {
    throw new Error('Missing TEMPO_API_TOKEN in backend env');
  }

  const { results, pageCount } = await fetchTempoPages({
    baseUrl,
    token,
    from,
    to,
    accountId,
    requestId
  });

  const { filtered, skipped } = filterEntriesForUser(results, accountId);
  const totalHours = filtered.reduce((sum, item) => sum + Number(item.timeSpentSeconds || 0) / 3600, 0);

  logger.info('Tempo sync: request completed', {
    requestId,
    accountId,
    pageCount,
    totalEntriesRaw: results.length,
    totalEntriesFiltered: filtered.length,
    skippedEntries: skipped,
    totalHours: Number(totalHours.toFixed(2))
  });

  return {
    entries: filtered,
    totalHours
  };
};

module.exports = { syncTimesheetsDirect };
