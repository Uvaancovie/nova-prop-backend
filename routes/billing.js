const express = require('express');
const crypto = require('crypto');
const { PAYFAST_HOST, MERCHANT_ID, MERCHANT_KEY, PASSPHRASE } = require('../src/lib/payfast');
const { signWithMode, FORM_ORDER: SIGN_FORM_ORDER, MODES } = require('../src/lib/payfast-sign');
const { getPlan } = require('../src/domain/plans');
const authMiddleware = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const Organization = require('../models/Organization');
const User = require('../models/User');

const router = express.Router();

const authRequired = authMiddleware.protect || authMiddleware.authRequired || ((req,res,next) => { if (!req.user) return res.status(401).json({ message: 'Unauthorized' }); next(); });

// use centralized signing helper from backend/src/lib/payfast-sign.js

// Alphabetical signature builder: sort keys A->Z, drop empties, encode with + and UPPERCASE %
// NOTE: Alphabetical signing helper removed. Payment page signing must use FORM_ORDER via buildSignature().

// Canonical form order used by some PayFast subscription flows when explicit ordering is required
const FORM_ORDER = SIGN_FORM_ORDER;
const DEFAULT_SIGNATURE_MODE = process.env.PAYFAST_SIGNATURE_MODE || MODES.MODE_FORM_ENC;

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
  if (!['starter','growth','agency'].includes(planId)) return res.status(400).json({ message: 'Invalid plan' });
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
  const { base: baseForm, signature, orderedKeys } = signWithMode(DEFAULT_SIGNATURE_MODE, cleanedDebug, PASSPHRASE, FORM_ORDER);
  const base = baseForm;
  const keys = orderedKeys;
  const PAYFAST_HOST = require('../src/lib/payfast').PAYFAST_HOST;
  const action = `${PAYFAST_HOST}/eng/process`;
  if (String(process.env.PAYFAST_DEBUG || '').toLowerCase() === 'true' || String(process.env.PAYFAST_DEBUG_SIGNATURE || '').toLowerCase() === 'true') {
    console.log('[PAYFAST DEBUG] checkout base (with passphrase):', base);
    console.log('[PAYFAST DEBUG] checkout signature:', signature);
  }
  res.json({ params: cleanedDebug, base, signature, action });
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
    const { base: baseSub, signature: signatureSub, orderedKeys: orderedSub } = signWithMode(DEFAULT_SIGNATURE_MODE, cleaned, PASSPHRASE, FORM_ORDER);
    if (String(process.env.PAYFAST_DEBUG || '').toLowerCase() === 'true' || String(process.env.PAYFAST_DEBUG_SIGNATURE || '').toLowerCase() === 'true') {
      console.log('[PAYFAST DEBUG] checkout base (with passphrase):', baseSub);
      console.log('[PAYFAST DEBUG] checkout signature:', signatureSub);
    }
    const action = `${PAYFAST_HOST}/eng/process`;
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const inputs = orderedSub.map(k => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(cleaned[k] ?? '')}" />`).join('') + `<input type="hidden" name="signature" value="${escapeHtml(signatureSub)}" />`;
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
    if (!['starter','growth','agency'].includes(planId)) return res.status(400).json({ message: 'Invalid plan' });
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
    // Build cleaned params and sign (mode selects FORM_ORDER ordering when MODE_FORM_ENC)
  const cleaned = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (!sv) continue;
    cleaned[k] = sv;
  }
  const { base: baseCheckout, signature: signatureCheckout, orderedKeys: orderedCheckout } = signWithMode(DEFAULT_SIGNATURE_MODE, cleaned, PASSPHRASE, FORM_ORDER);
    const action = `${PAYFAST_HOST}/eng/process`;
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const inputs = orderedCheckout.map(k => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(cleaned[k] ?? '')}" />`).join('') + `<input type="hidden" name="signature" value="${escapeHtml(signatureCheckout)}" />`;
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
    let orgId = (req.user && (req.user.orgId || req.user.organizationId));
    if (!orgId) {
      const org = await Organization.create({
        name: `${req.user.name || req.user.email}'s org`,
        planId: 'free',
        owner: req.user._id
      });
      orgId = org._id;
      await User.findByIdAndUpdate(req.user._id, { organizationId: orgId });
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
  const { base: baseForm, signature: signatureForm } = signWithMode(DEFAULT_SIGNATURE_MODE, cleaned, PASSPHRASE, FORM_ORDER);
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

    // Use signWithMode to produce both FORM_ORDER (mode) and alphabetical for comparison
    const formResult = signWithMode(MODES.MODE_FORM_ENC, cleaned, PASSPHRASE, FORM_ORDER);
    const alphaEncResult = signWithMode(MODES.MODE_AZ_ENC, cleaned, PASSPHRASE);
    return res.json({ ok: true, form: { base: formResult.base, signature: formResult.signature }, alphabetical: { base: alphaEncResult.base, signature: alphaEncResult.signature }, cleaned, formOrder: FORM_ORDER });
  } catch (e) {
    console.error('dev-signature-check error', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/billing/ai-topup - One-off AI credits purchase
router.post('/ai-topup', authRequired, async (req, res) => {
  try {
    const { credits } = req.body; // e.g., 100 or 250
    
    // Validate credits amount
    const validOptions = {
      100: 49,
      250: 99
    };
    
    if (!validOptions[credits]) {
      return res.status(400).json({ message: 'Invalid credits amount' });
    }
    
    const amount = validOptions[credits];
    const user = req.user;
    const orgId = user.orgId || user.organizationId;
    
    if (!orgId) {
      return res.status(400).json({ message: 'Organization required' });
    }

    // Build PayFast once-off payment
    const m_payment_id = `topup_ai_${credits}_${orgId}_${Date.now()}`;
    const returnUrl = `${process.env.FRONTEND_URL}/billing/topup-return`;
    const cancelUrl = `${process.env.FRONTEND_URL}/billing/cancel`;
    const notifyUrl = `${process.env.BACKEND_URL}/payfast/itn-topup`;

    const payload = {
      merchant_id: MERCHANT_ID,
      merchant_key: MERCHANT_KEY,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      name_first: user.firstName || user.name || 'Nova Prop',
      name_last: user.lastName || '',
      email_address: user.email,
      m_payment_id,
      amount: amount.toFixed(2),
      item_name: `Nova Prop AI Credits Top-Up (${credits} credits)`,
      item_description: `Purchase ${credits} bonus AI generation credits`,
      custom_str1: orgId.toString(),
      custom_int1: credits
    };

    // Sign the payload
    const result = signWithMode(DEFAULT_SIGNATURE_MODE, payload, PASSPHRASE, FORM_ORDER);
    payload.signature = result.signature;

    // Return redirect URL with form data
    return res.json({
      redirect: PAYFAST_HOST,
      payload
    });
  } catch (err) {
    console.error('ai-topup error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

