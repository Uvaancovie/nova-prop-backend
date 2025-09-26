const Subscription = require('../models/Subscription');
const Organization = require('../models/Organization');
const Property = require('../models/Property');
const plans = require('../src/domain/plans');

module.exports = async function enforcePlanQuota(req, res, next) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const orgId = user.organizationId || user.orgId || null;
    if (!orgId) return res.status(403).json({ message: 'Organization required' });

    let sub = await Subscription.findOne({ orgId }).sort({ createdAt: -1 });
    if (!sub) return res.status(402).json({ code: 'NO_SUBSCRIPTION', message: 'Please start a trial or subscribe.' });

    // expire on-the-fly
    if (sub.status === 'trialing' && sub.trialEndsAt && sub.trialEndsAt < new Date()) {
      sub.status = 'trial_expired';
      await sub.save();
    }

    if (sub.status === 'trial_expired' || sub.status === 'past_due') {
      return res.status(402).json({ code: 'TRIAL_EXPIRED', message: 'Your free trial has ended. Please upgrade to continue.' });
    }

    const plan = plans.getPlan(sub.planId || 'starter');
    if (!plan) return res.status(500).json({ message: 'Unknown plan' });

    const propertyCount = await Property.countDocuments({ orgId });
    if (propertyCount >= (plan.maxProperties || 5)) {
      return res.status(403).json({ code: 'PLAN_LIMIT_REACHED', message: 'Property limit reached for your plan.' });
    }

    next();
  } catch (err) {
    next(err);
  }
};
