const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requireJiraConnection = require('../middleware/requireJiraConnection');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { syncTimelogs, getSyncTimelogsStatus, listTimelogs } = require('../controllers/timelogController');

const router = express.Router();

router.use(requireAuth);
router.get('/', requireJiraConnection, listTimelogs);
router.get('/sync/status', getSyncTimelogsStatus);
router.post('/sync', requireSuperAdmin, requireJiraConnection, syncTimelogs);

module.exports = router;
