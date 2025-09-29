const express = require('express');
const Organization = require('../models/Organization');
const Property = require('../models/Property');
const Subscription = require('../models/Subscription');
const { getPlan } = require('../src/domain/plans');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const authRequired = authMiddleware.protect || authMiddleware.authRequired || ((req,res,next)=>{ if(!req.user) return res.status(401).json({ message: 'Unauthorized'}); next(); });

// GET /api/me/summary
router.get('/me/summary', authRequired, async (req, res) => {
  try {
    const orgId = req.user && (req.user.orgId || req.user.organizationId);
    if (!orgId) return res.status(200).json({ plan: { id: 'free', label: 'Free', status: 'inactive' }, usage: { properties: { used: 0, max: 2 } }, subscription: null });

    const org = await Organization.findById(orgId).lean();
    const plan = getPlan(org?.planId || 'free');
    const used = await Property.countDocuments({ orgId });
    const sub = await Subscription.findOne({ orgId }).lean();
    const nextRenewalAt = sub && sub.lastItnAt ? new Date(new Date(sub.lastItnAt).setMonth(new Date(sub.lastItnAt).getMonth() + 1)) : null;

    return res.json({
      plan: { id: org?.planId || 'free', label: plan.label, status: org?.subscriptionStatus || (sub?.status || 'inactive') },
      usage: { properties: { used, max: plan.quotas.maxProperties + (org?.extraPropertySlots || 0) } },
      subscription: sub ? { provider: sub.provider, nextRenewalAt, lastItnAt: sub.lastItnAt } : null
    });
  } catch (e) {
    console.error('me.summary error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
