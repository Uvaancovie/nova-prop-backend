const Booking = require('../models/Booking');
const Property = require('../models/Property');
const Message = require('../models/Message');
const User = require('../models/User');
const { generateInvoice } = require('../utils/invoiceGenerator');

// @desc    Get all bookings
// @route   GET /api/bookings
// @access  Private
exports.getBookings = async (req, res) => {
  try {
    let query;

    // If client, get only their bookings
    if (req.user.role === 'client') {
      query = Booking.find({ client_id: req.user.id });
    } 
    // If realtor, get bookings for their properties
    else if (req.user.role === 'realtor') {
      query = Booking.find({ realtor_id: req.user.id });
    }

    // Add sorting and filtering similar to property controller
    const bookings = await query;

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
exports.getBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Make sure user owns booking or is the property owner
    if (
      booking.client_id.toString() !== req.user.id &&
      booking.realtor_id.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this booking'
      });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Create booking
// @route   POST /api/bookings
// @access  Private (Client only)
exports.createBooking = async (req, res) => {
  try {
    // Check if property exists
    const property = await Property.findById(req.body.property_id);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    // Check if property is available
    if (!property.is_available) {
      return res.status(400).json({
        success: false,
        error: 'Property is not available for booking'
      });
    }

    // Add client details
    req.body.client_id = req.user.id;
    req.body.guest_name = req.user.name;
    req.body.guest_email = req.user.email;
    req.body.guest_phone = req.user.phone || '';
    
    // Add property details
    req.body.property_name = property.name;
    req.body.property_location = `${property.address}, ${property.city}`;
    
    // Add realtor details
    req.body.realtor_id = property.realtor_id;
    req.body.realtor_name = property.realtor_name;
    req.body.realtor_email = property.realtor_email;

    // Check for conflicting bookings
    const conflictingBooking = await Booking.findOne({
      property_id: req.body.property_id,
      status: { $in: ['pending', 'confirmed'] },
      $or: [
        {
          check_in: { $lte: new Date(req.body.check_out) },
          check_out: { $gte: new Date(req.body.check_in) }
        }
      ]
    });

    if (conflictingBooking) {
      return res.status(400).json({
        success: false,
        error: 'Property already booked for these dates'
      });
    }

    // Create booking
    const booking = await Booking.create(req.body);

    // Get client and realtor details
    const client = await User.findById(req.user.id);
    const realtor = await User.findById(property.realtor_id);
    
    // Generate invoice
    const invoice = await generateInvoice(booking, property, client, realtor);

    // Create notification message for realtor with invoice
    await Message.create({
      sender_id: req.user.id,
      receiver_id: property.realtor_id,
      booking_id: booking._id,
      content: `New booking request from ${req.user.name} for ${property.name} from ${new Date(req.body.check_in).toLocaleDateString()} to ${new Date(req.body.check_out).toLocaleDateString()}. An invoice has been generated for this booking.`,
      has_invoice: true,
      invoice_path: invoice.path,
      invoice_filename: invoice.filename
    });

    res.status(201).json({
      success: true,
      booking,
      invoice: {
        filename: invoice.filename,
        path: `/api/invoices/download/${invoice.filename}`
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Update booking status
// @route   PUT /api/bookings/:id
// @access  Private (Realtor for their properties, or client for their booking)
exports.updateBooking = async (req, res) => {
  try {
    let booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Check user permissions
    if (req.user.role === 'realtor' && booking.realtor_id.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to update this booking'
      });
    } else if (req.user.role === 'client' && booking.client_id.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to update this booking'
      });
    }

    // Clients can only cancel their bookings
    if (req.user.role === 'client' && req.body.status && req.body.status !== 'cancelled') {
      return res.status(401).json({
        success: false,
        error: 'Clients can only cancel bookings'
      });
    }

    booking = await Booking.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    // Create notification message
    if (req.body.status) {
      let receiverId, senderId, content;
      
      if (req.user.role === 'realtor') {
        receiverId = booking.client_id;
        senderId = req.user.id;
        content = `Your booking for ${booking.property_name} has been ${req.body.status}`;
      } else {
        receiverId = booking.realtor_id;
        senderId = req.user.id;
        content = `Booking for ${booking.property_name} has been cancelled by the guest`;
      }
      
      await Message.create({
        sender_id: senderId,
        receiver_id: receiverId,
        booking_id: booking._id,
        content
      });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Delete booking
// @route   DELETE /api/bookings/:id
// @access  Private (Admin only)
exports.deleteBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Only admin can permanently delete
    if (req.user.role !== 'admin') {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to delete bookings'
      });
    }

    await booking.deleteOne();

    res.json({
      success: true,
      data: {}
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get bookings for calendar view
// @route   GET /api/bookings/calendar
// @access  Private (Realtor only)
exports.getCalendarBookings = async (req, res) => {
  try {
    // Parse date range from query params
    const { start, end, property_id } = req.query;
    
    // Build query object
    const query = {
      realtor_id: req.user.id,
      status: { $in: ['pending', 'confirmed'] }
    };
    
    // Add date range filter if provided
    if (start && end) {
      query.$or = [
        {
          check_in: { 
            $gte: new Date(start),
            $lte: new Date(end)
          }
        },
        {
          check_out: { 
            $gte: new Date(start),
            $lte: new Date(end)
          }
        },
        {
          $and: [
            { check_in: { $lte: new Date(start) } },
            { check_out: { $gte: new Date(end) } }
          ]
        }
      ];
    }
    
    // Filter by property if specified
    if (property_id) {
      query.property_id = property_id;
    }
    
    // Get bookings for the realtor
    const bookings = await Booking.find(query)
      .populate('property_id', 'name address city images')
      .populate('client_id', 'name email phone');
    
    // Format bookings for calendar display
    const calendarEvents = bookings.map(booking => ({
      id: booking._id,
      title: `${booking.guest_name} - ${booking.property_name}`,
      start: booking.check_in,
      end: booking.check_out,
      extendedProps: {
        booking_id: booking._id,
        property_id: booking.property_id._id,
        property_name: booking.property_name,
        guest_name: booking.guest_name,
        guest_email: booking.guest_email,
        guest_phone: booking.guest_phone,
        status: booking.status,
        total_amount: booking.total_amount,
        special_requests: booking.special_requests,
        guests: booking.guests
      },
      // Color coding based on status
      backgroundColor: booking.status === 'pending' ? '#9333ea' : '#3b82f6',
      borderColor: booking.status === 'pending' ? '#7e22ce' : '#2563eb'
    }));
    
    res.json({
      success: true,
      count: calendarEvents.length,
      events: calendarEvents
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};
