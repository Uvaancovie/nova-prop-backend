const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requests: { type: Number, default: 0 },
  tokens: { type: Number, default: 0 }
}, {
  timestamps: true
});

module.exports = mongoose.model('AiUsage', aiUsageSchema);
