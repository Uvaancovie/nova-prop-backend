const mongoose = require('mongoose');

const NewsletterSchema = new mongoose.Schema(
  {
    realtorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title:     { type: String, required: true, maxlength: 120 },
    body:      { type: String, required: true, maxlength: 8000 },
    imageUrl:  { type: String }, // Optional image URL
    cta: {
      label: { type: String },
      url:   { type: String } // Must be https
    },
    sentAt:    { type: Date },
    stats: {
      recipients: { type: Number, default: 0 },
      delivered:  { type: Number, default: 0 },
      opened:     { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

// Index for efficient queries by realtor and date
NewsletterSchema.index({ realtorId: 1, createdAt: -1 });

module.exports = mongoose.model('Newsletter', NewsletterSchema);
