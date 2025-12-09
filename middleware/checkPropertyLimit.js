const Property = require('../models/Property');
const Organization = require('../models/Organization');
const { getPlan } = require('../src/domain/plans');

module.exports = async function checkPropertyLimit(req, res, next) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    // Get user's organization and plan
    const orgId = user.organizationId || user.orgId;
    let planId = 'free'; // default
    
    if (orgId) {
      const org = await Organization.findById(orgId).lean();
      planId = org?.planId || 'free';
    }

    const plan = getPlan(planId);
    const maxProperties = plan.quotas.maxProperties;

    // Count user's existing properties
    const propertyCount = await Property.countDocuments({ realtor_id: user._id });

    // Check if unlimited (-1) or within limit
    if (maxProperties !== -1 && propertyCount >= maxProperties) {
      return res.status(403).json({ 
        code: 'PROPERTY_LIMIT_REACHED',
        message: `You've reached your plan limit of ${maxProperties} properties. Please upgrade to add more.`,
        currentCount: propertyCount,
        maxAllowed: maxProperties,
        planId: planId
      });
    }

    next();
  } catch (err) {
    console.error('checkPropertyLimit error:', err);
    next(err);
  }
};
