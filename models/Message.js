const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  booking_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  content: {
    type: String,
    required: [true, 'Message content is required']
  },
  read: {
    type: Boolean,
    default: false
  },
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
