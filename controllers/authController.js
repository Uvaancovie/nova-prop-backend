const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const generateToken = require('../utils/generateToken');
const ErrorResponse = require('../utils/ErrorResponse');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;

    // Log registration attempt in development for debugging (do not log passwords)
    if (process.env.NODE_ENV === 'development') {
      console.log('Register attempt:', { name, email, role, phone });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({
        success: false,
        error: 'User already exists'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role,
      phone
    });

    if (user) {
      res.status(201).json({
        success: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone
        },
        token: generateToken(user._id)
      });
    }
  } catch (error) {
    // If validation error, return details
    if (error && error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, error: messages.join('; ') });
    }

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const token = user.getSignedJwtToken();

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      },
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profileImage: user.profileImage,
        address: user.address,
        city: user.city,
        province: user.province,
        bio: user.bio,
        company: user.company,
        socialLinks: user.socialLinks,
        isVerified: user.isVerified,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get authenticated user's stats (counts for properties, bookings, messages, ai usage)
// @route   GET /api/auth/stats
// @access  Private
exports.getStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const Property = require('../models/Property');
    const Booking = require('../models/Booking');
    const Message = require('../models/Message');

    const [propertiesCount, bookingsCount, messagesCount] = await Promise.all([
      Property.countDocuments({ realtor_id: userId }),
      Booking.countDocuments({ $or: [{ realtor_id: userId }, { client_id: userId }] }),
      Message.countDocuments({ $or: [{ sender_id: userId }, { receiver_id: userId }] })
    ]);

    // Placeholder for AI usage metrics — if you have a usage table/log, replace with real queries
    const aiUsage = {
      requests: 0,
      tokens: 0
    };

    res.json({
      success: true,
      stats: {
        properties: propertiesCount,
        bookings: bookingsCount,
        messages: messagesCount,
        aiUsage
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    // Fields to update
    const fieldsToUpdate = {
      name: req.body.name,
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
      province: req.body.province,
      bio: req.body.bio,
      company: req.body.company,
      socialLinks: req.body.socialLinks,
      profileImage: req.body.profileImage
    };

    // Remove undefined fields
    Object.keys(fieldsToUpdate).forEach(
      key => fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
    );

    // If profileImage looks like a base64 data URL, save it to uploads/profile-images
    if (fieldsToUpdate.profileImage && typeof fieldsToUpdate.profileImage === 'string' && fieldsToUpdate.profileImage.startsWith('data:')) {
      try {
        const matches = fieldsToUpdate.profileImage.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          const mime = matches[1];
          const base64Data = matches[2];
          const ext = mime.split('/')[1] || 'png';
          const uploadsDir = path.join(__dirname, '..', 'uploads', 'profile-images');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          const filename = `${req.user.id}_${Date.now()}.${ext}`;
          const filePath = path.join(uploadsDir, filename);
          fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
          // Update to the public URL
          fieldsToUpdate.profileImage = `/uploads/profile-images/${filename}`;
        }
      } catch (imgErr) {
        console.error('Failed to save profile image:', imgErr);
        // Do not block the profile update for image save errors
        delete fieldsToUpdate.profileImage;
      }
    }

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profileImage: user.profileImage,
        address: user.address,
        city: user.city,
        province: user.province,
        bio: user.bio,
        company: user.company,
        socialLinks: user.socialLinks,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Update password
// @route   PUT /api/auth/password
// @access  Private
exports.updatePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    const isMatch = await user.matchPassword(req.body.currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Set new password
    user.password = req.body.newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};
