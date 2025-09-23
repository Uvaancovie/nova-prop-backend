const User = require('../models/User');
const Property = require('../models/Property');
const Booking = require('../models/Booking');
const Waitlist = require('../models/Waitlist');
const ErrorResponse = require('../utils/ErrorResponse');

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin only)
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-password');
    
    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
// @access  Private (Admin only)
exports.getStats = async (req, res, next) => {
  try {
    // Get counts for main entities
    const userCount = await User.countDocuments();
    const realtorCount = await User.countDocuments({ role: 'realtor' });
    const clientCount = await User.countDocuments({ role: 'client' });
    const propertyCount = await Property.countDocuments();
    const bookingCount = await Booking.countDocuments();
    const waitlistCount = await Waitlist.countDocuments();
    
    // Get recent activity
    const recentBookings = await Booking.find()
      .sort('-createdAt')
      .limit(5)
      .populate('property_id', 'name')
      .populate('client_id', 'name');
    
    // Get booking stats by status
    const pendingBookings = await Booking.countDocuments({ status: 'pending' });
    const confirmedBookings = await Booking.countDocuments({ status: 'confirmed' });
    const cancelledBookings = await Booking.countDocuments({ status: 'cancelled' });
    const completedBookings = await Booking.countDocuments({ status: 'completed' });
    
    // Get total revenue (sum of all confirmed bookings)
    const revenueData = await Booking.aggregate([
      { $match: { status: { $in: ['confirmed', 'completed'] } } },
      { $group: { _id: null, total: { $sum: '$total_amount' } } }
    ]);
    const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;
    
    res.json({
      success: true,
      data: {
        counts: {
          users: userCount,
          realtors: realtorCount,
          clients: clientCount,
          properties: propertyCount,
          bookings: bookingCount,
          waitlist: waitlistCount
        },
        bookingStats: {
          pending: pendingBookings,
          confirmed: confirmedBookings,
          cancelled: cancelledBookings,
          completed: completedBookings
        },
        recentActivity: recentBookings,
        revenue: totalRevenue
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user role
// @route   PUT /api/admin/users/:id/role
// @access  Private (Admin only)
exports.updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    
    if (!role || !['client', 'realtor', 'admin'].includes(role)) {
      return next(new ErrorResponse('Please provide a valid role', 400));
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
    }
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin only)
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
    }
    
    await user.deleteOne();
    
    res.json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve waitlist entry
// @route   PUT /api/admin/waitlist/:id/approve
// @access  Private (Admin only)
exports.approveWaitlist = async (req, res, next) => {
  try {
    const waitlist = await Waitlist.findByIdAndUpdate(
      req.params.id,
      { status: 'approved' },
      { new: true }
    );
    
    if (!waitlist) {
      return next(new ErrorResponse(`Waitlist entry not found with id of ${req.params.id}`, 404));
    }
    
    res.json({
      success: true,
      data: waitlist
    });
  } catch (error) {
    next(error);
  }
};
