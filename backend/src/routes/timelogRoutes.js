const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requireJiraConnection = require('../middleware/requireJiraConnection');
const { syncTimelogs, listTimelogs } = require('../controllers/timelogController');

const router = express.Router();

router.use(requireAuth);
router.use(requireJiraConnection);
router.get('/', listTimelogs);
router.post('/sync', syncTimelogs);

module.exports = router;
