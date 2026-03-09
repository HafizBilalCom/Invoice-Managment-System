const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { getProfile, updateProfile, listManagerCandidates, updateManagerCandidate } = require('../controllers/profileController');

const router = express.Router();

router.use(requireAuth);
router.get('/', getProfile);
router.put('/', updateProfile);
router.get('/manager-candidates', requireSuperAdmin, listManagerCandidates);
router.put('/manager-candidates/:userId', requireSuperAdmin, updateManagerCandidate);

module.exports = router;
