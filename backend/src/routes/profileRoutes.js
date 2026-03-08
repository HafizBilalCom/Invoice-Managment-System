const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getProfile, updateProfile } = require('../controllers/profileController');

const router = express.Router();

router.use(requireAuth);
router.get('/', getProfile);
router.put('/', updateProfile);

module.exports = router;
