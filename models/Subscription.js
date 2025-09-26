const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  planId: { type: String, required: true },
  provider: { type: String, required: true },
  status: { type: String, default: 'inactive' },
  providerToken: String,
  lastItnAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Subscription', SubscriptionSchema);
