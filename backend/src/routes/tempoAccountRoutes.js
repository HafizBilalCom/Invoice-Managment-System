const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { triggerSync, getAccounts } = require('../controllers/tempoAccountController');

const router = express.Router();

router.use(requireAuth);
router.get('/accounts', getAccounts);
router.post('/accounts/sync', triggerSync);

module.exports = router;
