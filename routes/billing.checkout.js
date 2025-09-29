const express = require('express');
const crypto = require('crypto');
const { PAYFAST_HOST, MERCHANT_ID, MERCHANT_KEY, PASSPHRASE } = require('../src/lib/payfast');
const { getPlan } = require('../src/domain/plans');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

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
    if (sv === '') continue;
    pairs.push(`${key}=${encodePlusUpper(sv)}`);
  }
  let base = pairs.join('&');
  if (passphrase) base += `&passphrase=${encodePlusUpper(passphrase)}`;
  const signature = crypto.createHash('md5').update(base).digest('hex');
  return { base, signature };
}

const authRequired = authMiddleware.protect || authMiddleware.authRequired || ((req,res,next) => { if (!req.user) return res.status(401).json({ message: 'Unauthorized' }); next(); });

router.post('/billing/checkout/:planId', authRequired, async (req, res) => {
  try {
    const planId = String(req.params.planId);
    // Validate required env before building PayFast URL
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
    if (!['starter','growth'].includes(planId)) return res.status(400).json({ message: 'Invalid plan' });
    const plan = getPlan(planId);

    const orgId = (req.user && (req.user.orgId || req.user.organizationId)) || 'unknown';
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

    const passphrase = process.env.PAYFAST_PASSPHRASE || PASSPHRASE || '';
    // Build cleaned params (skip empty values)
    const cleanedFields = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      const sv = String(v).trim();
      if (!sv) continue;
      cleanedFields[k] = sv;
    }

    // FORM order (documented PayFast order) — must be used for the hosted payment page signing
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

    // Build signature in FORM_ORDER and post fields in the same order
    const { base, signature } = buildSignature(FORM_ORDER, cleanedFields, passphrase);
    if (String(process.env.PAYFAST_DEBUG || '').toLowerCase() === 'true' || String(process.env.PAYFAST_DEBUG_SIGNATURE || '').toLowerCase() === 'true') {
      console.log('[PAYFAST DEBUG] checkout base (FORM ORDER + passphrase):', base);
      console.log('[PAYFAST DEBUG] checkout signature:', signature);
    }

    const action = `${PAYFAST_HOST}/eng/process`;
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    // Build inputs in FORM_ORDER (only keys present in cleanedFields)
    const inputs = FORM_ORDER.filter(k => Object.prototype.hasOwnProperty.call(cleanedFields, k))
      .map(k => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(cleanedFields[k] ?? '')}" />`).join('')
      + `<input type="hidden" name="signature" value="${escapeHtml(signature)}" />`;
    res.setHeader('Content-Type', 'text/html');
    return res.send(`<!doctype html><html><body><form id="pf" action="${action}" method="post">${inputs}</form><script>document.getElementById('pf').submit();</script></body></html>`);
  } catch (err) {
    console.error('checkout error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
