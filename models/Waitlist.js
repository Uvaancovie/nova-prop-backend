const mongoose = require('mongoose');

const waitlistSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  name: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['client', 'realtor'],
    default: 'client'
  },
  source: {
    type: String,
    default: 'landing_page'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  referralCode: {
    type: String
  },
  referredBy: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'registered'],
    default: 'pending'
  },
  signupData: {
    ip: String,
    userAgent: String,
    referrer: String
  }
}, {
  timestamps: true
});

// Create index for faster queries
// Note: email is already indexed due to unique: true
waitlistSchema.index({ status: 1 });
waitlistSchema.index({ referralCode: 1 });
waitlistSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Waitlist', waitlistSchema);
