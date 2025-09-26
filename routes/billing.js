const express = require('express');
const crypto = require('crypto');
const { PAYFAST_HOST, MERCHANT_ID, MERCHANT_KEY, PASSPHRASE } = require('../src/lib/payfast');
const { getPlan } = require('../src/domain/plans');
const authMiddleware = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const Organization = require('../models/Organization');

const router = express.Router();

function signParams(params) {
  const pairs = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(String(params[k]).trim()).replace(/%20/g, '+')}`);
  const base = pairs.join('&');
  const withPass = PASSPHRASE ? `${base}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, '+')}` : base;
  const signature = crypto.createHash('md5').update(withPass).digest('hex');
  return `${base}&signature=${signature}`;
}

const authRequired = authMiddleware.protect || authMiddleware.authRequired || ((req,res,next) => { if (!req.user) return res.status(401).json({ message: 'Unauthorized' }); next(); });

// Dev-only: return the exact PayFast params/signature/action URL for a plan
router.get('/debug/:planId', authRequired, (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).send('Not found');
  const planId = String(req.params.planId);
  if (!['starter','growth'].includes(planId)) return res.status(400).json({ message: 'Invalid plan' });
  const plan = getPlan(planId);
  const orgId = (req.user && (req.user.orgId || req.user.organizationId)) || 'unknown';
  const m_payment_id = `sub_${planId}_${orgId}_${Date.now()}`;
  const params = {
    merchant_id: process.env.PAYFAST_MERCHANT_ID || require('../src/lib/payfast').MERCHANT_ID,
    merchant_key: process.env.PAYFAST_MERCHANT_KEY || require('../src/lib/payfast').MERCHANT_KEY,
    return_url: `${process.env.APP_BASE_URL}/billing/return`,
    cancel_url: `${process.env.APP_BASE_URL}/billing/cancel`,
    notify_url: `${process.env.API_BASE_URL}/payfast/itn`,
    name_first: req.user.firstName || req.user.name || 'PropNova',
    name_last: req.user.lastName || '',
    email_address: req.user.email || '',
    m_payment_id,
    item_name: `PropNova ${plan.label} Subscription`,
    amount: Number(plan.priceZar).toFixed(2),
    subscription_type: 1,
    recurring_amount: Number(plan.priceZar).toFixed(2),
    frequency: 3,
    cycles: 0,
  };
  // compute signature same as signParams
  const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || require('../src/lib/payfast').PASSPHRASE || '';
  const pairs = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(String(params[k]).trim()).replace(/%20/g, '+')}`);
  const base = pairs.join('&');
  const withPass = PASSPHRASE ? `${base}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, '+')}` : base;
  const crypto = require('crypto');
  const signature = crypto.createHash('md5').update(withPass).digest('hex');
  const PAYFAST_HOST = require('../src/lib/payfast').PAYFAST_HOST;
  const action = `${PAYFAST_HOST}/eng/process?${base}&signature=${signature}`;
  res.json({ params, base, signature, action });
});

// POST /api/billing/subscribe (legacy frontend hook)
router.post('/subscribe', authRequired, async (req, res) => {
  try {
    const { planId } = req.body || {};
    if (!planId) return res.status(400).json({ message: 'Missing planId' });
      // Validate PayFast and app configuration to avoid undefined params
      const { MERCHANT_ID, MERCHANT_KEY } = require('../src/lib/payfast');
      const missing = [];
      if (!MERCHANT_ID) missing.push('PAYFAST_MERCHANT_ID');
      if (!MERCHANT_KEY) missing.push('PAYFAST_MERCHANT_KEY');
      if (!process.env.APP_BASE_URL) missing.push('APP_BASE_URL');
      if (!process.env.API_BASE_URL) missing.push('API_BASE_URL');
    if (missing.length) {
      console.error('PayFast config missing:', missing);
      return res.status(500).json({ message: 'PayFast not configured', missing });
    }
    // create m_payment_id and return a redirect HTML similar to checkout
    const plan = getPlan(planId);
    // Ensure user has an organization record
    let orgId = (req.user && (req.user.orgId || req.user.organizationId));
    if (!orgId) {
      const newOrg = await Organization.create({ name: `${req.user.name || req.user.email}'s org`, planId: 'free' });
      orgId = newOrg._id;
      // attach to user
      const User = require('../models/User');
      await User.findByIdAndUpdate(req.user._id, { organizationId: orgId });
    }
    const m_payment_id = `sub_${planId}_${orgId}_${Date.now()}`;
    const params = {
      merchant_id: MERCHANT_ID,
      merchant_key: MERCHANT_KEY,
      return_url: `${process.env.APP_BASE_URL}/billing/return`,
      cancel_url: `${process.env.APP_BASE_URL}/billing/cancel`,
      notify_url: `${process.env.API_BASE_URL}/payfast/itn`,
      name_first: req.user.firstName || req.user.name || 'PropNova',
      name_last: req.user.lastName || '',
      email_address: req.user.email || '',
      m_payment_id,
      item_name: `PropNova ${plan.label} Subscription`,
      amount: Number(plan.priceZar).toFixed(2),
      subscription_type: 1,
      recurring_amount: Number(plan.priceZar).toFixed(2),
      frequency: 3,
      cycles: 0,
    };
    const query = signParams(params);
    const action = `${PAYFAST_HOST}/eng/process?${query}`;
    res.json({ redirect: action });
  } catch (e) {
    console.error('subscribe error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/billing/checkout/:planId
router.post('/checkout/:planId', authRequired, async (req, res) => {
  try {
    const planId = String(req.params.planId);
    if (!['starter','growth'].includes(planId)) return res.status(400).json({ message: 'Invalid plan' });
    const plan = getPlan(planId);
    // Ensure user has an organization record
    let orgId = (req.user && (req.user.orgId || req.user.organizationId));
    if (!orgId) {
      const newOrg = await Organization.create({ name: `${req.user.name || req.user.email}'s org`, planId: 'free' });
      orgId = newOrg._id;
      const User = require('../models/User');
      await User.findByIdAndUpdate(req.user._id, { organizationId: orgId });
    }
    const m_payment_id = `sub_${planId}_${orgId}_${Date.now()}`;
    const params = {
      merchant_id: MERCHANT_ID,
      merchant_key: MERCHANT_KEY,
      return_url: `${process.env.APP_BASE_URL}/billing/return`,
      cancel_url: `${process.env.APP_BASE_URL}/billing/cancel`,
      notify_url: `${process.env.API_BASE_URL}/payfast/itn`,
      name_first: req.user.firstName || req.user.name || 'PropNova',
      name_last: req.user.lastName || '',
      email_address: req.user.email || '',
      m_payment_id,
      item_name: `PropNova ${plan.label} Subscription`,
      amount: Number(plan.priceZar).toFixed(2),
      subscription_type: 1,
      recurring_amount: Number(plan.priceZar).toFixed(2),
      frequency: 3,
      cycles: 0,
    };
    const query = signParams(params);
    const action = `${PAYFAST_HOST}/eng/process?${query}`;
    res.setHeader('Content-Type', 'text/html');
    return res.send(`<!doctype html><html><body>
      <form id="pf" action="${action}" method="post"></form>
      <script>document.getElementById('pf').submit();</script>
    </body></html>`);
  } catch (err) {
    console.error('checkout error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/billing/subscription -> returns subscription info for user's org
router.get('/subscription', authRequired, async (req, res) => {
  try {
    const orgId = (req.user && (req.user.orgId || req.user.organizationId));
    if (!orgId) {
      console.warn('billing/subscription: authenticated user has no orgId, returning null subscription');
      return res.json({ subscription: null, organization: null });
    }
    const sub = await Subscription.findOne({ orgId });
    const org = await Organization.findById(orgId);
    return res.json({ subscription: sub || null, organization: org || null });
  } catch (e) {
    console.error('subscription fetch error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Dev-only: compute signature for arbitrary params posted as JSON { params: { ... } }
router.post('/compute-signature', authRequired, (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).send('Not found');
  const params = req.body && req.body.params ? req.body.params : null;
  if (!params || typeof params !== 'object') return res.status(400).json({ message: 'Missing params' });
  try {
    const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || require('../src/lib/payfast').PASSPHRASE || '';
    const PAYFAST_HOST = require('../src/lib/payfast').PAYFAST_HOST;
    const pairs = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(String(params[k]).trim()).replace(/%20/g, '+')}`);
    const base = pairs.join('&');
    const withPass = PASSPHRASE ? `${base}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, '+')}` : base;
    const signature = crypto.createHash('md5').update(withPass).digest('hex');
    const action = `${PAYFAST_HOST}/eng/process?${base}&signature=${signature}`;
    return res.json({ base, signature, action });
  } catch (err) {
    console.error('compute-signature error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

