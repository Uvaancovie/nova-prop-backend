const express = require('express');
const { joinWaitlist, getWaitlistStats } = require('../controllers/waitlistController');

const router = express.Router();

router.post('/join', joinWaitlist);
router.post('/', joinWaitlist); // Also support the simple /waitlist endpoint
router.get('/stats', getWaitlistStats);

module.exports = router;
