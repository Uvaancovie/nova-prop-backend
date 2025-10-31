const Property = require('../models/Property');

const SAVED_LISTINGS_LIMIT = 10;

const checkSavedListingsLimit = async (req, res, next) => {
  try {
    const realtorId = req.user._id;

    const count = await Property.countDocuments({
      realtor_id: realtorId,
      status: { $in: ['draft', 'saved'] }
    });

    if (count >= SAVED_LISTINGS_LIMIT) {
      return res.status(429).json({
        message: `You have reached your limit of ${SAVED_LISTINGS_LIMIT} saved listings.`,
        code: 'SAVED_LISTINGS_LIMIT_REACHED',
        usage: {
          count,
          limit: SAVED_LISTINGS_LIMIT,
        },
      });
    }

    next();
  } catch (error) {
    console.error('Error in checkSavedListingsLimit middleware:', error);
    res.status(500).json({ message: 'Server error while checking saved listings limits.' });
  }
};

module.exports = checkSavedListingsLimit;