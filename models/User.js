const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['client', 'realtor', 'admin'],
    default: 'client'
  },
  phone: String,
  profileImage: String,
  address: String,
  city: String,
  province: String,
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot be more than 500 characters']
  },
  company: String,
  socialLinks: {
    website: String,
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Encrypt password using bcrypt
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Virtual for properties
userSchema.virtual('properties', {
  ref: 'Property',
  localField: '_id',
  foreignField: 'realtor_id',
  justOne: false
});

// Virtual for bookings as client
userSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'client_id',
  justOne: false
});

module.exports = mongoose.model('User', userSchema);
