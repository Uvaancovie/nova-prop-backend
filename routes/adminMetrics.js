const express = require('express');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Property = require('../models/Property');
const Booking = require('../models/Booking');
const Newsletter = require('../models/Newsletter');
const NewsletterSubscription = require('../models/NewsletterSubscription');
const AiUsage = require('../models/AiUsage');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const authRequired = authMiddleware.protect || authMiddleware.authRequired || ((req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  next();
});

// Middleware to check if user is owner/admin
const requireOwner = async (req, res, next) => {
  try {
    console.log('🔐 Admin access check:', {
      userId: req.user?._id,
      email: req.user?.email,
      role: req.user?.role
    });
    
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const allowedRealtorAdminEmail = 'way2fdlyagency@gmail.com';
    const isRoleAllowed = ['owner', 'admin', 'realtor'].includes(req.user.role);
    const isAllowedRealtor =
      req.user.role === 'realtor' &&
      (req.user.email || '').toLowerCase() === allowedRealtorAdminEmail;

    if (!isRoleAllowed || (req.user.role === 'realtor' && !isAllowedRealtor)) {
      return res.status(403).json({ 
        message: 'Access denied. Owner/admin required, or authorized realtor account only.',
        currentRole: req.user.role 
      });
    }
    next();
  } catch (error) {
    console.error('requireOwner middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Middleware to restrict to owners only
const requireOwnerOnly = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const authorizedEmail = 'way2flyagency@gmail.com';
    const userEmail = (req.user.email || '').toLowerCase();

    if (userEmail !== authorizedEmail) {
      return res.status(403).json({
        message: 'Access denied. Owner insights are restricted to the account owner.',
        currentUser: req.user.email
      });
    }

    next();
  } catch (error) {
    console.error('requireOwnerOnly middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/admin/metrics
router.get('/admin/metrics', authRequired, requireOwner, async (req, res) => {
  try {
    const now = new Date();
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // User metrics
    const totalUsers = await User.countDocuments();
    const usersByRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    const usersLast7d = await User.countDocuments({ createdAt: { $gte: last7d } });

    const roleMap = {};
    usersByRole.forEach(r => {
      roleMap[r._id] = r.count;
    });

    // Organization metrics
    const totalOrgs = await Organization.countDocuments();
    const orgsByPlan = await Organization.aggregate([
      { $group: { _id: '$planId', count: { $sum: 1 } } }
    ]);
    const orgsLast7d = await Organization.countDocuments({ createdAt: { $gte: last7d } });

    const planMap = {};
    orgsByPlan.forEach(p => {
      planMap[p._id || 'free'] = p.count;
    });

    // Property metrics
    const totalProperties = await Property.countDocuments();
    const propertiesLast7d = await Property.countDocuments({ createdAt: { $gte: last7d } });

    // Booking metrics
    const totalBookings = await Booking.countDocuments();
    const bookingsLast7d = await Booking.countDocuments({ createdAt: { $gte: last7d } });

    // Newsletter metrics
    const newslettersSentThisMonth = await Newsletter.countDocuments({ 
      sentAt: { $gte: monthStart, $ne: null }
    });
    const totalSubscribers = await NewsletterSubscription.countDocuments({ status: 'active' });

    // AI metrics
    const aiUsageThisMonth = await AiUsage.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$requests' } } }
    ]);

    // Top-ups this month (if you have a topup collection, otherwise 0)
    const topupsThisMonth = 0; // TODO: Implement if tracking separately

    // Recent signups
    const recentSignups = await User.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name email role createdAt')
      .lean();

    return res.json({
      users: {
        total: totalUsers,
        byRole: roleMap,
        last7d: usersLast7d
      },
      orgs: {
        total: totalOrgs,
        byPlan: planMap,
        last7d: orgsLast7d
      },
      properties: {
        total: totalProperties,
        last7d: propertiesLast7d
      },
      bookings: {
        total: totalBookings,
        last7d: bookingsLast7d
      },
      newsletters: {
        sentThisMonth: newslettersSentThisMonth,
        subscribersTotal: totalSubscribers
      },
      ai: {
        usedThisMonth: aiUsageThisMonth.length > 0 ? aiUsageThisMonth[0].total : 0,
        topupsThisMonth
      },
      recentSignups
    });
  } catch (e) {
    console.error('admin/metrics error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/owner/realtor-insights
router.get('/admin/owner/realtor-insights', authRequired, requireOwnerOnly, async (req, res) => {
  try {
    const [totalRealtors, totalClients, realtorUsers, propertyCounts, aiUsageByRealtor] = await Promise.all([
      User.countDocuments({ role: 'realtor' }),
      User.countDocuments({ role: 'client' }),
      User.find({ role: 'realtor' })
        .sort({ createdAt: -1 })
        .select('name email createdAt organizationId profileImage')
        .lean(),
      Property.aggregate([
        { $group: { _id: '$realtor_id', count: { $sum: 1 } } }
      ]),
      AiUsage.aggregate([
        {
          $group: {
            _id: '$userId',
            totalRequests: { $sum: '$requests' },
            totalTokens: { $sum: '$tokens' },
            lastUsedAt: { $max: '$updatedAt' }
          }
        }
      ])
    ]);

    const propertyCountMap = propertyCounts.reduce((acc, entry) => {
      if (entry?._id) {
        acc[entry._id.toString()] = entry.count;
      }
      return acc;
    }, {});

    const aiUsageMap = aiUsageByRealtor.reduce((acc, entry) => {
      if (entry?._id) {
        acc[entry._id.toString()] = {
          totalRequests: entry.totalRequests || 0,
          totalTokens: entry.totalTokens || 0,
          lastUsedAt: entry.lastUsedAt || null
        };
      }
      return acc;
    }, {});

    const realtorInsights = realtorUsers.map((realtor) => {
      const realtorId = realtor._id.toString();
      const aiUsage = aiUsageMap[realtorId] || {
        totalRequests: 0,
        totalTokens: 0,
        lastUsedAt: null
      };

      return {
        id: realtor._id,
        name: realtor.name,
        email: realtor.email,
        organizationId: realtor.organizationId || null,
        profileImage: realtor.profileImage || null,
        createdAt: realtor.createdAt,
        propertiesCount: propertyCountMap[realtorId] || 0,
        aiUsage
      };
    });

    res.json({
      totals: {
        realtors: totalRealtors,
        clients: totalClients
      },
      realtors: realtorInsights
    });
  } catch (error) {
    console.error('admin/owner/realtor-insights error', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
