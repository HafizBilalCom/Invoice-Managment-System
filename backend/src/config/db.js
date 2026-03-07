const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const shouldLogQueries = process.env.DB_LOG_QUERIES !== 'false';
const maxSqlLength = Number(process.env.DB_LOG_SQL_MAX_LENGTH || 3000);
const maxParamsLength = Number(process.env.DB_LOG_PARAMS_MAX_LENGTH || 3000);

function truncate(value, max) {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max)}... [truncated ${value.length - max} chars]`;
}

function serializeParams(params) {
  if (params === undefined) {
    return undefined;
  }

  try {
    return truncate(JSON.stringify(params), maxParamsLength);
  } catch (error) {
    return '[unserializable-params]';
  }
}

function logQuery(scope, sql, params) {
  if (!shouldLogQueries) {
    return;
  }

  logger.info('DB query', {
    scope,
    sql: truncate(String(sql || ''), maxSqlLength),
    params: serializeParams(params)
  });
}

function patchQueryable(target, scope) {
  if (!target || target.__queryLoggingPatched) {
    return target;
  }

  if (typeof target.query === 'function') {
    const originalQuery = target.query.bind(target);
    target.query = async (sql, params) => {
      logQuery(scope, sql, params);
      return originalQuery(sql, params);
    };
  }

  if (typeof target.execute === 'function') {
    const originalExecute = target.execute.bind(target);
    target.execute = async (sql, params) => {
      logQuery(scope, sql, params);
      return originalExecute(sql, params);
    };
  }

  Object.defineProperty(target, '__queryLoggingPatched', {
    value: true,
    enumerable: false,
    configurable: false
  });

  return target;
}

patchQueryable(pool, 'pool');

const originalGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async () => {
  const connection = await originalGetConnection();
  const scope = `conn:${connection.threadId || 'unknown'}`;
  return patchQueryable(connection, scope);
};

module.exports = pool;
