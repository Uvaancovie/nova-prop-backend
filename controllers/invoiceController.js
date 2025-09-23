const path = require('path');
const { generateInvoice } = require('../utils/invoiceGenerator');
const Booking = require('../models/Booking');
const Property = require('../models/Property');
const User = require('../models/User');

// @desc    Generate invoice for a booking
// @route   POST /api/invoices/generate/:bookingId
// @access  Private
exports.generateBookingInvoice = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Check authorization
    if (
      booking.client_id.toString() !== req.user.id &&
      booking.realtor_id.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to generate invoice for this booking'
      });
    }
    
    // Get related data
    const property = await Property.findById(booking.property_id);
    const client = await User.findById(booking.client_id);
    const realtor = await User.findById(booking.realtor_id);
    
    if (!property || !client || !realtor) {
      return res.status(404).json({
        success: false,
        error: 'Required information for invoice not found'
      });
    }
    
    // Generate the invoice
    const invoice = await generateInvoice(booking, property, client, realtor);
    
    res.json({
      success: true,
      invoice: {
        filename: invoice.filename,
        path: `/api/invoices/download/${invoice.filename}`
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Download an invoice
// @route   GET /api/invoices/download/:filename
// @access  Private
exports.downloadInvoice = async (req, res) => {
  try {
    const invoicePath = path.join(__dirname, '..', 'uploads', 'invoices', req.params.filename);
    res.download(invoicePath);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
