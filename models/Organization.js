const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  name: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ownerEmail: { type: String },
  planId: { type: String, default: 'free' },
  subscriptionStatus: { type: String, default: 'inactive' },
}, { timestamps: true });

module.exports = mongoose.model('Organization', OrganizationSchema);
