const mongoose = require('mongoose');
const { ACTIVITY_STATUSES, INVOICE_STATES, STAFF_MEMBERS } = require('../config/activityStatuses');

const staffIds = STAFF_MEMBERS.map((staff) => staff.id);

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
  activity_status: {
    type: String,
    enum: Object.keys(ACTIVITY_STATUSES),
    default: 'provisional_booking'
  },
  invoice_state: {
    type: String,
    enum: Object.keys(INVOICE_STATES),
    default: 'not_required'
  },
  assigned_staff_id: {
    type: String,
    enum: ['', ...staffIds],
    default: ''
  },
  assigned_staff_name: {
    type: String,
    default: ''
  },
  operations_notes: {
    type: String,
    default: ''
  },
  status_history: [
    {
      field: {
        type: String,
        enum: ['status', 'activity_status', 'invoice_state', 'assigned_staff_id', 'operations_notes'],
        required: true
      },
      old_value: {
        type: String,
        default: ''
      },
      new_value: {
        type: String,
        default: ''
      },
      note: {
        type: String,
        default: ''
      },
      changed_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changed_by_name: {
        type: String,
        default: ''
      },
      changed_at: {
        type: Date,
        default: Date.now
      }
    }
  ],
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
