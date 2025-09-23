const Waitlist = require('../models/Waitlist');
const crypto = require('crypto');

// @desc    Join waitlist
// @route   POST /api/waitlist/join
// @access  Public
exports.joinWaitlist = async (req, res) => {
  try {
    const { email, name, phone, role, referredBy, source } = req.body;

    // Validate email (required)
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Check if email already exists
    const existingEntry = await Waitlist.findOne({ email });

    if (existingEntry) {
      return res.status(400).json({
        success: false,
        error: 'Email already on waitlist'
      });
    }

    // Generate unique referral code (first 6 chars of email hash)
    const referralCode = crypto
      .createHash('md5')
      .update(email + Date.now())
      .digest('hex')
      .substring(0, 6)
      .toUpperCase();

    // Collect signup data for analytics
    const signupData = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer || req.headers.referrer
    };

    // Create waitlist entry
    const waitlistEntry = await Waitlist.create({
      email,
      name: name || undefined,
      phone: phone || undefined,
      role: role || 'client', // Default to client
      referralCode,
      referredBy,
      source: source || 'landing_page',
      signupData
    });

    // If someone referred this user, update their stats
    if (referredBy) {
      await updateReferralStats(referredBy);
    }

    res.status(201).json({
      success: true,
      data: {
        email: waitlistEntry.email,
        referralCode: waitlistEntry.referralCode,
        joinedAt: waitlistEntry.joinedAt
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get waitlist stats
// @route   GET /api/waitlist/stats
// @access  Public
exports.getWaitlistStats = async (req, res) => {
  try {
    const totalCount = await Waitlist.countDocuments();
    const realtorCount = await Waitlist.countDocuments({ role: 'realtor' });
    const clientCount = await Waitlist.countDocuments({ role: 'client' });
    
    // Get position by referral code
    const { referralCode } = req.query;
    let position = null;
    let referrals = 0;
    
    if (referralCode) {
      const entry = await Waitlist.findOne({ referralCode });
      if (entry) {
        // Count how many people joined before this person
        position = await Waitlist.countDocuments({
          createdAt: { $lt: entry.createdAt }
        }) + 1;
        
        // Count referrals
        referrals = await Waitlist.countDocuments({ referredBy: referralCode });
      }
    }
    
    res.json({
      success: true,
      data: {
        totalCount,
        realtorCount,
        clientCount,
        position,
        referrals
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Helper function to update referral stats
const updateReferralStats = async (referralCode) => {
  try {
    // Find how many referrals this user has made
    const referralsCount = await Waitlist.countDocuments({ referredBy: referralCode });
    
    // Potential future implementation: 
    // - Update the user's priority in the waitlist
    // - Give rewards based on referrals
    
    return referralsCount;
  } catch (error) {
    console.error('Error updating referral stats:', error);
    return 0;
  }
};
