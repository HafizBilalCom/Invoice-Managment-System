const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { triggerSync, getAccounts } = require('../controllers/tempoAccountController');

const router = express.Router();

router.use(requireAuth);
router.get('/accounts', getAccounts);
router.post('/accounts/sync', requireSuperAdmin, triggerSync);

module.exports = router;
