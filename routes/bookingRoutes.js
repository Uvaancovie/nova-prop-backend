const express = require('express');
const {
  getBookings,
  getBooking,
  createBooking,
  updateBooking,
  deleteBooking,
  getCalendarBookings
} = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Calendar route for realtors
router.get(
  '/calendar', 
  protect, 
  authorize('realtor'), 
  getCalendarBookings
);

router
  .route('/')
  .get(protect, getBookings)
  .post(protect, authorize('client'), createBooking);

router
  .route('/:id')
  .get(protect, getBooking)
  .put(protect, updateBooking)
  .delete(protect, authorize('admin'), deleteBooking);

module.exports = router;
