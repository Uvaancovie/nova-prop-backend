const express = require('express');
const {
  getMessages,
  createMessage,
  markAsRead
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router
  .route('/')
  .get(protect, getMessages)
  .post(protect, createMessage);

router.route('/:id/read').put(protect, markAsRead);

module.exports = router;
