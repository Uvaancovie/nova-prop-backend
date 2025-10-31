const mongoose = require('mongoose');

const GeneratedListingSchema = new mongoose.Schema(
  {
    realtorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Store basic input for reference
    input: {
      beds: Number,
      baths: Number,
      suburb: String,
      price: Number,
    },
    // Store the generated output
    output: {
      title: String,
      description: String,
      amenities: [String],
      keywords: [String],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GeneratedListing', GeneratedListingSchema);
