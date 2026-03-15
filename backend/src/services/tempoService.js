const axios = require('axios');
const logger = require('../utils/logger');

function parseTempoPageLimit() {
  const parsed = Number(process.env.TEMPO_PAGE_LIMIT || 50);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(Math.floor(parsed), 1000);
}

async function fetchTempoPages({ baseUrl, token, from, to, updatedFrom, requestId }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  };

  const allResults = [];
  let pageCount = 0;
  let nextUrl = null;
  const pageLimit = parseTempoPageLimit();

  while (true) {
    let response;

    try {
      if (nextUrl) {
        response = await axios.get(nextUrl, { headers });
      } else {
        response = await axios.get(`${baseUrl}/worklogs`, {
          params: updatedFrom
            ? {
                updatedFrom,
                offset: 0,
                limit: pageLimit
              }
            : {
                from,
                to,
                offset: 0,
                limit: pageLimit
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

    nextUrl = rawNext;

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

async function fetchDeletedTempoWorklogs({ auditBaseUrl, token, updatedFrom, requestId }) {
  if (!updatedFrom) {
    return { results: [], pageCount: 0 };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  };

  const allResults = [];
  let pageCount = 0;
  let nextUrl = null;
  const pageLimit = parseTempoPageLimit();

  while (true) {
    let response;

    try {
      if (nextUrl) {
        response = await axios.get(nextUrl, { headers });
      } else {
        response = await axios.get(`${auditBaseUrl}/events/deleted/types/worklog`, {
          params: {
            updatedFrom,
            limit: pageLimit
          },
          headers
        });
      }
    } catch (error) {
      logger.error('Tempo deleted worklog sync: page request failed', {
        requestId,
        page: pageCount + 1,
        url: nextUrl || `${auditBaseUrl}/events/deleted/types/worklog`,
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

    logger.info('Tempo deleted worklog sync: fetched page', {
      requestId,
      page: pageCount,
      pageCountEntries: pageResults.length,
      totalAccumulated: allResults.length,
      hasNext: Boolean(rawNext),
      count: metadata.count,
      limit: metadata.limit,
      lastEvaluatedKey: metadata.lastEvaluatedKey || null
    });

    if (!rawNext) {
      break;
    }

    nextUrl = rawNext;

    if (pageCount >= 1000) {
      logger.warn('Tempo deleted worklog sync: pagination guard reached', {
        requestId,
        pageCount,
        totalAccumulated: allResults.length
      });
      break;
    }
  }

  return { results: allResults, pageCount };
}

const syncTimesheetsDirect = async ({ from, to, updatedFrom, requestId }) => {
  const baseUrl = process.env.TEMPO_API_BASE_URL || 'https://api.tempo.io/4';
  const auditBaseUrl = process.env.TEMPO_AUDIT_API_BASE_URL || 'https://api.tempo.io/audit/1';
  const token = process.env.TEMPO_API_TOKEN;

  logger.info('Tempo sync: request started', {
    requestId,
    from,
    to,
    updatedFrom,
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
    updatedFrom,
    requestId
  });
  const { results: deletedResults, pageCount: deletedPageCount } = await fetchDeletedTempoWorklogs({
    auditBaseUrl,
    token,
    updatedFrom,
    requestId
  });

  const totalHours = results.reduce((sum, item) => sum + Number(item.timeSpentSeconds || 0) / 3600, 0);

  logger.info('Tempo sync: request completed', {
    requestId,
    pageCount,
    deletedPageCount,
    totalEntriesProcessed: results.length,
    totalDeletedEntries: deletedResults.length,
    totalHours: Number(totalHours.toFixed(2))
  });

  return {
    entries: results,
    deletedEntries: deletedResults,
    totalHours,
    pageCount,
    deletedPageCount
  };
};

module.exports = { syncTimesheetsDirect };
