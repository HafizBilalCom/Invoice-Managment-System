const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { getWorkflowSteps, updateWorkflowSteps } = require('../controllers/workflowController');

const router = express.Router();

router.use(requireAuth);
router.use(requireSuperAdmin);
router.get('/steps', getWorkflowSteps);
router.put('/steps', updateWorkflowSteps);

module.exports = router;
