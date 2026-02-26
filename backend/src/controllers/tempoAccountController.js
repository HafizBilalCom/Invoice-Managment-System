const logger = require('../utils/logger');
const { runTempoAccountSync } = require('../jobs/tempoAccountSyncJob');
const { listTempoAccounts } = require('../services/tempoAccountService');

const triggerSync = async (req, res) => {
  const requestId = `tempo-accounts-manual-${Date.now()}`;

  try {
    const result = await runTempoAccountSync({
      trigger: 'manual',
      triggeredByUserId: req.user?.id || null,
      requestId
    });

    return res.status(result.skipped ? 202 : 200).json(result);
  } catch (error) {
    logger.error('Tempo account sync: manual trigger failed', {
      requestId,
      userId: req.user?.id,
      message: error.message,
      stack: error.stack,
      status: error.response?.status,
      responseData: error.response?.data
    });

    return res.status(500).json({
      message: 'Failed to sync Tempo accounts',
      error: error.message,
      requestId
    });
  }
};

const getAccounts = async (req, res) => {
  const requestId = `tempo-accounts-list-${Date.now()}`;

  try {
    const accounts = await listTempoAccounts();
    return res.json({ accounts });
  } catch (error) {
    logger.error('Tempo account sync: list failed', {
      requestId,
      userId: req.user?.id,
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      message: 'Failed to fetch Tempo accounts',
      error: error.message,
      requestId
    });
  }
};

module.exports = {
  triggerSync,
  getAccounts
};
