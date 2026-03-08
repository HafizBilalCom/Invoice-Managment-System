const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requireJiraConnection = require('../middleware/requireJiraConnection');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const {
  listProjects,
  syncProjectIssues,
  syncProjectsCatalog,
  listProjectIssues,
  triggerSyncAllProjectIssues,
  getSyncAllProjectIssuesStatus
} = require('../controllers/projectController');

const router = express.Router();

router.use(requireAuth);
router.use(requireJiraConnection);
router.get('/', listProjects);
router.post('/sync', requireSuperAdmin, syncProjectsCatalog);
router.post('/sync-issues-all', requireSuperAdmin, triggerSyncAllProjectIssues);
router.get('/sync-issues-all/status', getSyncAllProjectIssuesStatus);
router.get('/:id/issues', listProjectIssues);
router.post('/:id/sync-issues', requireSuperAdmin, syncProjectIssues);

module.exports = router;
