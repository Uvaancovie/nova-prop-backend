const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
  sessionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ChatSession', 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['system', 'user', 'assistant'], 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

ChatMessageSchema.index({ sessionId: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
