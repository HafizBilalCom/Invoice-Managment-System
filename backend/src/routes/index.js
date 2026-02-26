const express = require('express');
const authRoutes = require('./authRoutes');
const invoiceRoutes = require('./invoiceRoutes');
const timelogRoutes = require('./timelogRoutes');
const projectRoutes = require('./projectRoutes');
const tempoAccountRoutes = require('./tempoAccountRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/timelogs', timelogRoutes);
router.use('/projects', projectRoutes);
router.use('/tempo', tempoAccountRoutes);
router.use('/invoices', invoiceRoutes);

module.exports = router;
