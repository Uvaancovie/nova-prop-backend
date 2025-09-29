const express = require('express');
const crypto = require('crypto');
const { PAYFAST_HOST, MERCHANT_ID, MERCHANT_KEY, PASSPHRASE } = require('../src/lib/payfast');
const { getPlan } = require('../src/domain/plans');
const authMiddleware = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const Organization = require('../models/Organization');

const router = express.Router();

const authRequired = authMiddleware.protect || authMiddleware.authRequired || ((req,res,next) => { if (!req.user) return res.status(401).json({ message: 'Unauthorized' }); next(); });

function encodePlusUpper(str) {
  const s = String(str);
  return encodeURIComponent(s).replace(/%20/g, '+').replace(/%[0-9a-f]{2}/g, m => m.toUpperCase());
}

function buildSignature(formOrderKeys, fields, passphrase) {
  const pairs = [];
  for (const key of formOrderKeys) {
    const v = fields[key];
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (sv === '') continue; // skip empties entirely
    pairs.push(`${key}=${encodePlusUpper(sv)}`);
  }
  let base = pairs.join('&');
  if (passphrase) base += `&passphrase=${encodePlusUpper(passphrase)}`;
  const signature = require('crypto').createHash('md5').update(base).digest('hex');
  return { base, signature };
}

// Alphabetical signature builder: sort keys A->Z, drop empties, encode with + and UPPERCASE %
// NOTE: Alphabetical signing helper removed. Payment page signing must use FORM_ORDER via buildSignature().

// Canonical form order used by some PayFast subscription flows when explicit ordering is required
const FORM_ORDER = [
  'merchant_id','merchant_key','return_url','cancel_url','notify_url',
  'name_first','name_last','email_address','cell_number',
  'm_payment_id','amount','item_name','item_description',
  'custom_int1','custom_int2','custom_int3','custom_int4','custom_int5',
  'custom_str1','custom_str2','custom_str3','custom_str4','custom_str5',
  'email_confirmation','confirmation_address',
  'subscription_type','billing_date','recurring_amount','frequency','cycles',
  'subscription_notify_email','subscription_notify_webhook','subscription_notify_buyer'
];

// POST /api/billing/start-trial
router.post('/start-trial', authRequired, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    let org = null;
    if (user.organizationId) org = await Organization.findById(user.organizationId);
    if (!org) {
      org = await Organization.create({ name: `${user.name || user.email}'s org`, owner: user._id });
      const User = require('../models/User');
      await User.findByIdAndUpdate(user._id, { organizationId: org._id });
    }

    const trialDays = Number(process.env.TRIAL_DAYS || 14);
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    let sub = await Subscription.findOne({ orgId: org._id }).sort({ createdAt: -1 });
    if (sub && sub.status === 'trialing') {
      sub.trialEndsAt = trialEndsAt;
      await sub.save();
    } else {
      sub = await Subscription.create({ orgId: org._id, planId: req.body.planId || 'starter', provider: 'internal', status: 'trialing', trialEndsAt });
    }

    res.json({ ok: true, subscription: sub });
  } catch (err) {
    console.error('start-trial error', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// ... old signParams removed; using buildSignature() above which follows PayFast custom integration rules

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
  const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || require('../src/lib/payfast').PASSPHRASE || '';
  // Build signature using FORM_ORDER (document order) for subscription/payment-page flows
  // Clean params (skip empties) and compute signature in FORM_ORDER so debug output matches the payment page
  const cleanedDebug = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (!sv) continue;
    cleanedDebug[k] = sv;
  }
  const { base: baseForm, signature: signature } = buildSignature(FORM_ORDER, cleanedDebug, PASSPHRASE);
  const base = baseForm;
  const keys = FORM_ORDER.filter(k => Object.prototype.hasOwnProperty.call(cleanedDebug, k));
  const PAYFAST_HOST = require('../src/lib/payfast').PAYFAST_HOST;
  const action = `${PAYFAST_HOST}/eng/process`;
  if (String(process.env.PAYFAST_DEBUG || '').toLowerCase() === 'true' || String(process.env.PAYFAST_DEBUG_SIGNATURE || '').toLowerCase() === 'true') {
  console.log('[PAYFAST DEBUG] checkout base (FORM ORDER + passphrase):', base);
  console.log('[PAYFAST DEBUG] checkout signature:', signature);
  }
  res.json({ params: cleanedDebug, base: baseWithPass, signature, action });
});

// Production-safe env check (protected) - returns missing required billing env vars
// Use header 'x-admin-token: <ADMIN_DEBUG_TOKEN>' to authenticate this check.
router.get('/env-check', (req, res) => {
  const token = req.headers['x-admin-token'] || req.headers['x-admin-token'.toLowerCase()];
  const expected = process.env.ADMIN_DEBUG_TOKEN;
  if (!expected) return res.status(403).json({ message: 'Admin debug token not configured on server' });
  if (!token || token !== expected) return res.status(403).json({ message: 'Forbidden' });

  const required = ['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'APP_BASE_URL', 'API_BASE_URL'];
  const missing = required.filter(k => !process.env[k]);
  return res.json({ ok: true, missing });
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
    const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || require('../src/lib/payfast').PASSPHRASE || '';
    // Build cleaned params and signature using alphabetical A->Z (drop empties, php-style encoding)
    // For subscribe (legacy hook) we must sign in FORM_ORDER and post the same fields
    const cleaned = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      const sv = String(v).trim();
      if (!sv) continue;
      cleaned[k] = sv;
    }
    const { base: baseSub, signature: signatureSub } = buildSignature(FORM_ORDER, cleaned, PASSPHRASE);
    if (String(process.env.PAYFAST_DEBUG || '').toLowerCase() === 'true' || String(process.env.PAYFAST_DEBUG_SIGNATURE || '').toLowerCase() === 'true') {
      console.log('[PAYFAST DEBUG] checkout base (FORM ORDER + passphrase):', baseSub);
      console.log('[PAYFAST DEBUG] checkout signature:', signatureSub);
    }
    const action = `${PAYFAST_HOST}/eng/process`;
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const inputs = FORM_ORDER.filter(k => Object.prototype.hasOwnProperty.call(cleaned, k)).map(k => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(cleaned[k] ?? '')}" />`).join('') + `<input type="hidden" name="signature" value="${escapeHtml(signatureSub)}" />`;
    const html = `<!doctype html><html><body><form id="pf" action="${action}" method="post">${inputs}</form><script>document.getElementById('pf').submit();</script></body></html>`;
    res.json({ redirectHtml: html });
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
    const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || require('../src/lib/payfast').PASSPHRASE || '';
    const FORM_ORDER = [
      'merchant_id','merchant_key','return_url','cancel_url','notify_url',
      'name_first','name_last','email_address','cell_number',
      'm_payment_id','amount','item_name','item_description',
      'custom_int1','custom_int2','custom_int3','custom_int4','custom_int5',
      'custom_str1','custom_str2','custom_str3','custom_str4','custom_str5',
      'email_confirmation','confirmation_address',
      'subscription_type','billing_date','recurring_amount','frequency','cycles',
      'subscription_notify_email','subscription_notify_webhook','subscription_notify_buyer'
    ];
  // Build cleaned params and sign in FORM_ORDER (payment page expects documented form order)
  const cleaned = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (!sv) continue;
    cleaned[k] = sv;
  }
  const { base: baseCheckout, signature: signatureCheckout } = buildSignature(FORM_ORDER, cleaned, PASSPHRASE);
    const action = `${PAYFAST_HOST}/eng/process`;
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const inputs = FORM_ORDER.filter(k => Object.prototype.hasOwnProperty.call(cleaned, k)).map(k => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(cleaned[k] ?? '')}" />`).join('') + `<input type="hidden" name="signature" value="${escapeHtml(signatureCheckout)}" />`;
    res.setHeader('Content-Type', 'text/html');
    return res.send(`<!doctype html><html><body>${/* include form with inputs for POST */''}<form id="pf" action="${action}" method="post">${inputs}</form><script>document.getElementById('pf').submit();</script></body></html>`);
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
    const cleaned = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      const sv = String(v).trim();
      if (!sv) continue;
      cleaned[k] = sv;
    }
  const { base: baseForm, signature: signatureForm } = buildSignature(FORM_ORDER, cleaned, PASSPHRASE);
  const action = `${PAYFAST_HOST}/eng/process`;
  return res.json({ base: baseForm, signature: signatureForm, action });
  } catch (err) {
    console.error('compute-signature error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Dev-only: return both FORM_ORDER and alphabetical signatures for given params or planId
router.post('/dev-signature-check', authRequired, (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).send('Not found');
  try {
    // Accept either { planId } or { params: { ... } }
    const planId = req.body && req.body.planId ? String(req.body.planId) : null;
    let params = req.body && req.body.params && typeof req.body.params === 'object' ? req.body.params : null;
    if (planId) {
      const plan = getPlan(planId);
      const orgId = (req.user && (req.user.orgId || req.user.organizationId)) || 'unknown';
      const m_payment_id = `sub_${planId}_${orgId}_${Date.now()}`;
      params = {
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
    }

    if (!params || typeof params !== 'object') return res.status(400).json({ message: 'Missing params or planId' });

    const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || require('../src/lib/payfast').PASSPHRASE || '';

    // Clean params
    const cleaned = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      const sv = String(v).trim();
      if (!sv) continue;
      cleaned[k] = sv;
    }

    // FORM_ORDER base/signature
    const formPairs = [];
    for (const key of FORM_ORDER) {
      if (!Object.prototype.hasOwnProperty.call(cleaned, key)) continue;
      formPairs.push(`${key}=${encodePlusUpper(cleaned[key])}`);
    }
    const formBase = formPairs.join('&');
    const formBaseWithPass = PASSPHRASE ? `${formBase}&passphrase=${encodePlusUpper(PASSPHRASE)}` : formBase;
    const formSig = crypto.createHash('md5').update(formBaseWithPass).digest('hex');

    // Alphabetical base/signature
    const alphaKeys = Object.keys(cleaned).sort();
    const alphaBase = alphaKeys.map(k => `${k}=${encodePlusUpper(cleaned[k])}`).join('&');
    const alphaBaseWithPass = PASSPHRASE ? `${alphaBase}&passphrase=${encodePlusUpper(PASSPHRASE)}` : alphaBase;
    const alphaSig = crypto.createHash('md5').update(alphaBaseWithPass).digest('hex');

    return res.json({ ok: true, form: { base: formBaseWithPass, signature: formSig }, alphabetical: { base: alphaBaseWithPass, signature: alphaSig }, cleaned, formOrder: FORM_ORDER });
  } catch (e) {
    console.error('dev-signature-check error', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

