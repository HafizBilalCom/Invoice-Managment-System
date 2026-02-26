const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requireJiraConnection = require('../middleware/requireJiraConnection');
const {
  syncAndCreateInvoice,
  listInvoices,
  updateInvoiceStatus
} = require('../controllers/invoiceController');

const router = express.Router();

router.use(requireAuth);
router.use(requireJiraConnection);
router.get('/', listInvoices);
router.post('/sync-create', syncAndCreateInvoice);
router.patch('/:id/status', updateInvoiceStatus);

module.exports = router;
