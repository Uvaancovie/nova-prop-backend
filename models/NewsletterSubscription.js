const mongoose = require('mongoose');

const NewsletterSubscriptionSchema = new mongoose.Schema(
  {
    realtorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status:    { type: String, enum: ['subscribed', 'unsubscribed'], default: 'subscribed' },
    unsubscribedAt: { type: Date }
  },
  { timestamps: true }
);

// prevent duplicates
NewsletterSubscriptionSchema.index({ realtorId: 1, clientId: 1 }, { unique: true });

module.exports = mongoose.model('NewsletterSubscription', NewsletterSubscriptionSchema);
