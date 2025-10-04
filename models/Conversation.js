const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  type: {
    type: String,
    default: 'realtor_client',
    enum: ['realtor_client']
  },
  realtorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Unique index to ensure one conversation per realtor-client pair
conversationSchema.index({ realtorId: 1, clientId: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', conversationSchema);
