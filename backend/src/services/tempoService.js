const axios = require('axios');
const logger = require('../utils/logger');

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

  const totalHours = results.reduce((sum, item) => sum + Number(item.timeSpentSeconds || 0) / 3600, 0);

  logger.info('Tempo sync: request completed', {
    requestId,
    accountId,
    pageCount,
    totalEntriesProcessed: results.length,
    totalHours: Number(totalHours.toFixed(2))
  });

  return {
    entries: results,
    totalHours
  };
};

module.exports = { syncTimesheetsDirect };
