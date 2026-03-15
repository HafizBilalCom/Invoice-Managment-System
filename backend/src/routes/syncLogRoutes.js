const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { listSyncJobLogs } = require('../controllers/syncLogController');

const router = express.Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get('/', listSyncJobLogs);

module.exports = router;
