const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  property_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  property_name: String,
  property_location: String,
  client_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  guest_name: String,
  guest_email: String,
  guest_phone: String,
  check_in: {
    type: Date,
    required: [true, 'Please add a check-in date']
  },
  check_out: {
    type: Date,
    required: [true, 'Please add a check-out date']
  },
  guests: {
    type: Number,
    required: [true, 'Please add number of guests'],
    default: 1
  },
  special_requests: String,
  total_amount: {
    type: Number,
    required: [true, 'Please add total amount']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  realtor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  realtor_name: String,
  realtor_email: String
}, {
  timestamps: true
});

// Ensure check-out is after check-in
bookingSchema.pre('save', function(next) {
  if (this.check_out <= this.check_in) {
    throw new Error('Check-out date must be after check-in date');
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
