const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    index: true
  },
  // Legacy fields (keep for compatibility)
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  receiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // New unified fields
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  toUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  type: {
    type: String,
    enum: ['newsletter', 'dm', 'system'],
    default: 'dm'
  },
  subject: String,
  booking_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  content: {
    type: String,
    required: [true, 'Message content is required']
  },
  body: String, // Alias for content (for newsletter compatibility)
  read: {
    type: Boolean,
    default: false
  },
  meta: mongoose.Schema.Types.Mixed, // For newsletterId, imageUrl, cta, etc.
  // Fields for invoice support
  has_invoice: {
    type: Boolean,
    default: false
  },
  invoice_path: String,
  invoice_filename: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);
