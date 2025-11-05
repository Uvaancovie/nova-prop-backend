const express = require('express');
const AiUsage = require('../models/AiUsage');
const Organization = require('../models/Organization');
const { getPlan } = require('../src/domain/plans');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const authRequired = authMiddleware.protect || authMiddleware.authRequired || ((req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  next();
});

// GET /api/me/ai-usage
router.get('/me/ai-usage', authRequired, async (req, res) => {
  try {
    const orgId = req.user && (req.user.orgId || req.user.organizationId);
    
    if (!orgId) {
      return res.json({
        used: 0,
        limit: 8,
        bonus: 0,
        totalRemaining: 8,
        planId: 'free',
        renewsAt: null
      });
    }

    const org = await Organization.findById(orgId).lean();
    const plan = getPlan(org?.planId || 'free');
    
    // Get AI usage for current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const aiUsage = await AiUsage.findOne({ 
      userId: req.user._id,
      createdAt: { $gte: monthStart }
    }).lean();

    const used = aiUsage?.requests || 0;
    const limit = plan.quotas.maxAiRequests || 8;
    const bonus = org?.aiBonusCreditsMonth || 0;
    const totalRemaining = Math.max(0, limit + bonus - used);

    // Calculate renewal date (first day of next month)
    const renewsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return res.json({
      used,
      limit,
      bonus,
      totalRemaining,
      planId: org?.planId || 'free',
      renewsAt
    });
  } catch (e) {
    console.error('me/ai-usage error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
