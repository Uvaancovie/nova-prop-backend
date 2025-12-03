const mongoose = require('mongoose');

// Helper function to create URL-friendly slugs
function toSlug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 64);
}

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
  is_public: {
    type: Boolean,
    default: true
  },
  public_slug: {
    type: String,
    unique: true,
    index: true
  },
  realtor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  realtor_name: String,
  realtor_email: String,
  realtor_phone: String,
  rental_agreement: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['published', 'draft', 'saved'],
    default: 'published'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create text index for search functionality
propertySchema.index({ 
  name: 'text', 
  description: 'text', 
  city: 'text', 
  amenities: 'text' 
});

// Auto-generate public slug before saving
propertySchema.pre('save', function(next) {
  if (!this.public_slug || this.isModified('name')) {
    const base = toSlug(this.name || `prop-${this._id}`);
    this.public_slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  next();
});

// Virtual for bookings
propertySchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'property_id',
  justOne: false
});

module.exports = mongoose.model('Property', propertySchema);
