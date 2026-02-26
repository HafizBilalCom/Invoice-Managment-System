function now() {
  return new Date().toISOString();
}

function info(message, meta = {}) {
  // eslint-disable-next-line no-console
  console.log(`[${now()}] INFO ${message}`, meta);
}

function warn(message, meta = {}) {
  // eslint-disable-next-line no-console
  console.warn(`[${now()}] WARN ${message}`, meta);
}

function error(message, meta = {}) {
  // eslint-disable-next-line no-console
  console.error(`[${now()}] ERROR ${message}`, meta);
}

module.exports = { info, warn, error };
