const mongoose = require('mongoose');

const ChatSessionSchema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'New conversation' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ChatSessionSchema.index({ ownerUserId: 1, updatedAt: -1 });

module.exports = mongoose.model('ChatSession', ChatSessionSchema);