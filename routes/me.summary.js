const express = require('express');
const Organization = require('../models/Organization');
const Property = require('../models/Property');
const Subscription = require('../models/Subscription');
const AiUsage = require('../models/AiUsage');
const GeneratedListing = require('../models/GeneratedListing');
const { getPlan } = require('../src/domain/plans');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const authRequired = authMiddleware.protect || authMiddleware.authRequired || ((req,res,next)=>{ if(!req.user) return res.status(401).json({ message: 'Unauthorized'}); next(); });

// GET /api/me/summary
router.get('/me/summary', authRequired, async (req, res) => {
  try {
    const orgId = req.user && (req.user.orgId || req.user.organizationId);
    if (!orgId) return res.status(200).json({ 
      plan: { id: 'free', label: 'Free', status: 'inactive' }, 
      usage: { 
        properties: { used: 0, max: 2 },
        aiGenerations: { used: 0, max: 8 },
        savedListings: { used: 0, max: 10 }
      }, 
      subscription: null 
    });

    const org = await Organization.findById(orgId).lean();
    const plan = getPlan(org?.planId || 'free');
    
    // Get usage counts - properties are linked by realtor_id (user ID)
    const propertiesUsed = await Property.countDocuments({ realtor_id: req.user._id });
    
    // Count AI generations for current month (matches checkListingLimit middleware)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const aiGenerationsUsed = await GeneratedListing.countDocuments({
      realtorId: req.user._id,
      createdAt: { $gte: startOfMonth }
    });
    
    const savedListingsUsed = await GeneratedListing.countDocuments({ realtorId: req.user._id });
    
    const sub = await Subscription.findOne({ orgId }).lean();
    const nextRenewalAt = sub && sub.lastItnAt ? new Date(new Date(sub.lastItnAt).setMonth(new Date(sub.lastItnAt).getMonth() + 1)) : null;

    return res.json({
      plan: { id: org?.planId || 'free', label: plan.label, status: org?.subscriptionStatus || (sub?.status || 'inactive') },
      usage: { 
        properties: { used: propertiesUsed, max: plan.quotas.maxProperties + (org?.extraPropertySlots || 0) },
        aiGenerations: { used: aiGenerationsUsed, max: plan.quotas.maxAiRequests || 8 },
        savedListings: { used: savedListingsUsed, max: plan.quotas.maxSavedListings || 10 }
      },
      subscription: sub ? { provider: sub.provider, nextRenewalAt, lastItnAt: sub.lastItnAt } : null
    });
  } catch (e) {
    console.error('me.summary error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
