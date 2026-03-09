const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const {
  syncAndCreateInvoice,
  listInvoices,
  listApprovers,
  getInvoiceDetail,
  updateInvoiceStatus,
  regenerateInvoicePdf,
  addInvoiceComment,
  submitInvoiceForApproval
} = require('../controllers/invoiceController');

const router = express.Router();

router.use(requireAuth);
router.get('/', listInvoices);
router.get('/approvers', listApprovers);
router.get('/:id', getInvoiceDetail);
router.post('/sync-create', syncAndCreateInvoice);
router.post('/:id/submit', submitInvoiceForApproval);
router.post('/:id/regenerate-pdf', regenerateInvoicePdf);
router.post('/:id/comment', addInvoiceComment);
router.patch('/:id/status', updateInvoiceStatus);

module.exports = router;
