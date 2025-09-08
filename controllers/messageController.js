const Message = require('../models/Message');

// @desc    Get all messages for a user
// @route   GET /api/messages
// @access  Private
exports.getMessages = async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender_id: req.user.id },
        { receiver_id: req.user.id }
      ]
    }).sort('-createdAt');

    res.json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Create new message
// @route   POST /api/messages
// @access  Private
exports.createMessage = async (req, res) => {
  try {
    // Set sender to current user
    req.body.sender_id = req.user.id;

    const message = await Message.create(req.body);

    res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Mark message as read
// @route   PUT /api/messages/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
  try {
    let message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    // Check if user is the receiver
    if (message.receiver_id.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to mark this message as read'
      });
    }

    message = await Message.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );

    res.json({
      success: true,
      message
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};
