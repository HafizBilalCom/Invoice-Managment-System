const express = require('express');
const authRoutes = require('./authRoutes');
const invoiceRoutes = require('./invoiceRoutes');
const timelogRoutes = require('./timelogRoutes');
const projectRoutes = require('./projectRoutes');
const tempoAccountRoutes = require('./tempoAccountRoutes');
const profileRoutes = require('./profileRoutes');
const jiraUserRoutes = require('./jiraUserRoutes');
const workflowRoutes = require('./workflowRoutes');
const syncLogRoutes = require('./syncLogRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/timelogs', timelogRoutes);
router.use('/projects', projectRoutes);
router.use('/tempo', tempoAccountRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/profile', profileRoutes);
router.use('/jira-users', jiraUserRoutes);
router.use('/workflow', workflowRoutes);
router.use('/sync-logs', syncLogRoutes);

module.exports = router;
