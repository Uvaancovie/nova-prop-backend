const Message = require('../models/Message');

// @desc    Get all messages for a user
// @route   GET /api/messages
// @access  Private
exports.getMessages = async (req, res) => {
  try {
    const { type, page = 1, pageSize = 20 } = req.query;
    
    // Build query
    let query = {
      $or: [
        { sender_id: req.user.id },
        { receiver_id: req.user.id },
        { toUserId: req.user.id },
        { fromUserId: req.user.id }
      ]
    };

    // Filter by type if provided (newsletter, dm, system)
    if (type) {
      query.type = type;
      // For newsletters, only get ones sent TO the user
      if (type === 'newsletter') {
        query = {
          type: 'newsletter',
          $or: [
            { receiver_id: req.user.id },
            { toUserId: req.user.id }
          ]
        };
      }
    }

    // Calculate pagination
    const limit = parseInt(pageSize);
    const skip = (parseInt(page) - 1) * limit;

    // Get total count
    const total = await Message.countDocuments(query);

    // Get messages with pagination
    const messages = await Message.find(query)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .populate('sender_id', 'name email profileImage role')
      .populate('receiver_id', 'name email profileImage role')
      .populate('fromUserId', 'name email profileImage role')
      .populate('toUserId', 'name email profileImage role');

    res.json({
      success: true,
      count: messages.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
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

    // Check if user is the receiver (support both old and new field names)
    const receiverId = message.toUserId || message.receiver_id;
    if (!receiverId || receiverId.toString() !== req.user.id) {
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
