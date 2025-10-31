const GeneratedListing = require('../models/GeneratedListing');
const User = require('../models/User'); // Assuming you have a User model

const PLAN_LIMITS = {
  free: 8,
  growth: 15,
};

const checkListingLimit = async (req, res, next) => {
  try {
    const realtorId = req.user._id;
    const realtor = await User.findById(realtorId);

    if (!realtor) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const plan = realtor.plan || 'free'; // Default to 'free' if no plan is set
    const limit = PLAN_LIMITS[plan];

    if (!limit) {
      // If plan is not in our limits object, deny access.
      return res.status(403).json({ message: 'Invalid subscription plan.' });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const count = await GeneratedListing.countDocuments({
      realtorId,
      createdAt: { $gte: startOfMonth },
    });

    if (count >= limit) {
      return res.status(429).json({
        message: `You have reached your monthly limit of ${limit} AI-generated listings for the '${plan}' plan.`,
        code: 'LISTING_LIMIT_REACHED',
        usage: {
          count,
          limit,
        },
      });
    }

    // Attach usage info to the request for the controller to use
    req.usage = {
      count,
      limit,
      remaining: limit - count - 1, // -1 for the current request
    };

    next();
  } catch (error) {
    console.error('Error in checkListingLimit middleware:', error);
    res.status(500).json({ message: 'Server error while checking usage limits.' });
  }
};

module.exports = checkListingLimit;
