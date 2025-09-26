const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  planId: { type: String, required: true },
  provider: { type: String, default: 'internal' },
  status: { type: String, default: 'trialing' }, // trialing, active, trial_expired, cancelled, past_due
  trialEndsAt: { type: Date, default: null },
  providerToken: String,
  lastItnAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Subscription', SubscriptionSchema);
