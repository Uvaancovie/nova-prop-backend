const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a property name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please add a description']
  },
  address: {
    type: String,
    required: [true, 'Please add an address']
  },
  city: {
    type: String,
    required: [true, 'Please add a city']
  },
  province: {
    type: String,
    required: [true, 'Please add a province']
  },
  price_per_night: {
    type: Number,
    required: [true, 'Please add a price per night']
  },
  bedrooms: {
    type: Number,
    required: [true, 'Please add number of bedrooms'],
    default: 1
  },
  bathrooms: {
    type: Number,
    required: [true, 'Please add number of bathrooms'],
    default: 1
  },
  max_guests: {
    type: Number,
    required: [true, 'Please add maximum number of guests'],
    default: 2
  },
  amenities: {
    type: [String],
    default: []
  },
  images: {
    type: [String],
    default: []
  },
  is_available: {
    type: Boolean,
    default: true
  },
  realtor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  realtor_name: String,
  realtor_email: String,
  realtor_phone: String
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for bookings
propertySchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'property_id',
  justOne: false
});

module.exports = mongoose.model('Property', propertySchema);
