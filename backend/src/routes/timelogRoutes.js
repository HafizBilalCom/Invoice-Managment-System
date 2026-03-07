const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requireJiraConnection = require('../middleware/requireJiraConnection');
const { syncTimelogs, getSyncTimelogsStatus, listTimelogs } = require('../controllers/timelogController');

const router = express.Router();

router.use(requireAuth);
router.use(requireJiraConnection);
router.get('/', listTimelogs);
router.get('/sync/status', getSyncTimelogsStatus);
router.post('/sync', syncTimelogs);

module.exports = router;
