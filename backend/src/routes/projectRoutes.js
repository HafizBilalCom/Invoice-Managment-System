const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requireJiraConnection = require('../middleware/requireJiraConnection');
const {
  listProjects,
  syncProjectIssues,
  syncProjectsCatalog,
  listProjectIssues
} = require('../controllers/projectController');

const router = express.Router();

router.use(requireAuth);
router.use(requireJiraConnection);
router.get('/', listProjects);
router.post('/sync', syncProjectsCatalog);
router.get('/:id/issues', listProjectIssues);
router.post('/:id/sync-issues', syncProjectIssues);

module.exports = router;
