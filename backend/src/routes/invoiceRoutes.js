const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const {
  syncAndCreateInvoice,
  listInvoices,
  getInvoiceDetail,
  updateInvoiceStatus,
  regenerateInvoicePdf,
  submitInvoiceForApproval
} = require('../controllers/invoiceController');

const router = express.Router();

router.use(requireAuth);
router.get('/', listInvoices);
router.get('/:id', getInvoiceDetail);
router.post('/sync-create', syncAndCreateInvoice);
router.post('/:id/submit', submitInvoiceForApproval);
router.post('/:id/regenerate-pdf', regenerateInvoicePdf);
router.patch('/:id/status', updateInvoiceStatus);

module.exports = router;
