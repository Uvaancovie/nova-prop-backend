const express = require('express');
const { generateBookingInvoice, downloadInvoice } = require('../controllers/invoiceController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/generate/:bookingId', protect, generateBookingInvoice);
router.get('/download/:filename', protect, downloadInvoice);

module.exports = router;
