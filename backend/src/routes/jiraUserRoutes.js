const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requireJiraConnection = require('../middleware/requireJiraConnection');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { getJiraUsers, triggerJiraUsersSync } = require('../controllers/jiraUserController');

const router = express.Router();

router.use(requireAuth);
router.get('/', getJiraUsers);
router.post('/sync', requireJiraConnection, requireSuperAdmin, triggerJiraUsersSync);

module.exports = router;
