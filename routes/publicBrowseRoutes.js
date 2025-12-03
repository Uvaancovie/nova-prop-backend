const express = require('express');
const Property = require('../models/Property');
const mongoose = require('mongoose');

const router = express.Router();

// Public property browse - /public/properties?query=umhlanga&page=1
router.get('/properties', async (req, res) => {
  try {
    // Best-effort: if Authorization header present, attach req.user for client-side enrichment
    if (!req.user && req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(req.headers.authorization.split(' ')[1], process.env.JWT_SECRET);
        const User = require('../models/User');
        req.user = await User.findById(decoded.id).select('role _id').lean();
      } catch (e) {
        // ignore token errors - this is optional enrichment only
      }
    }
    const { query = '', page = 1 } = req.query;
    const PAGE_SIZE = 24;
    const find = { is_public: true };
    
    if (String(query).trim()) {
      Object.assign(find, { $text: { $search: String(query) } });
    }

    const items = await Property.find(find)
      .select('public_slug name description city amenities price_per_night images createdAt realtor_name realtor_email realtor_id rental_agreement property_type')
      .limit(PAGE_SIZE)
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with realtor profile image where possible (best-effort)
    const userIds = Array.from(new Set(items.map(i => String(i.realtor_id)).filter(Boolean)));
    const User = require('../models/User');
    const users = await User.find({ _id: { $in: userIds } }).select('profileImage').lean();
    const userMap = users.reduce((acc, u) => { acc[String(u._id)] = u; return acc; }, {});
    const NewsletterSubscription = require('../models/NewsletterSubscription');
    // Attach realtor_profileImage and isSubscribedToOwner when possible
    for (const it of items) {
      const u = userMap[String(it.realtor_id)];
      it.realtor_profileImage = u ? u.profileImage || null : null;
      it.realtorId = it.realtor_id || null;
      if (req.user && req.user.role === 'client') {
        const sub = await NewsletterSubscription.findOne({ realtorId: it.realtor_id, clientId: req.user._id, status: 'subscribed' }).lean();
        it.isSubscribedToOwner = !!sub;
      } else {
        it.isSubscribedToOwner = false;
      }
    }

    res.json({ 
      success: true,
      results: items 
    });
  } catch (error) {
    console.error('Error fetching public properties:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Public property details - /public/properties/:slug
router.get('/properties/:slug', async (req, res) => {
  try {
    const lookup = req.params.slug;

    // Try by public_slug first
    let prop = await Property.findOne({
      public_slug: lookup,
      is_public: true
    })
      .select('name description city province address amenities price_per_night images realtor_id realtor_name realtor_email realtor_phone createdAt bedrooms bathrooms max_guests public_slug rental_agreement property_type')
      .lean();

    // If not found by slug and the param looks like an ObjectId, try by _id as a fallback
    if (!prop && mongoose.Types.ObjectId.isValid(lookup)) {
      prop = await Property.findOne({
        _id: lookup,
        is_public: true
      })
        .select('name description city province address amenities price_per_night images realtor_id realtor_name realtor_email realtor_phone createdAt bedrooms bathrooms max_guests public_slug rental_agreement property_type')
        .lean();
    }

    if (!prop) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Enrich with realtor profile image when possible (best-effort)
    // Best-effort: attach req.user from token if present to allow isSubscribedToOwner
    if (!req.user && req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(req.headers.authorization.split(' ')[1], process.env.JWT_SECRET);
        const User = require('../models/User');
        req.user = await User.findById(decoded.id).select('role _id').lean();
      } catch (e) {
        // ignore token issues
      }
    }

    if (prop.realtor_id) {
      try {
        const User = require('../models/User');
        const u = await User.findOne({ _id: prop.realtor_id }).select('profileImage').lean();
        prop.realtor_profileImage = u ? u.profileImage || null : null;
      } catch (e) {
        prop.realtor_profileImage = null;
      }
      prop.realtorId = prop.realtor_id;
      if (req.user && req.user.role === 'client') {
        const NewsletterSubscription = require('../models/NewsletterSubscription');
        const sub = await NewsletterSubscription.findOne({ realtorId: prop.realtor_id, clientId: req.user._id, status: 'subscribed' }).lean();
        prop.isSubscribedToOwner = !!sub;
      } else {
        prop.isSubscribedToOwner = false;
      }
    } else {
      prop.realtor_profileImage = null;
      prop.realtorId = null;
      prop.isSubscribedToOwner = false;
    }

    res.json({
      success: true,
      property: prop
    });
  } catch (error) {
    console.error('Error fetching property details:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
