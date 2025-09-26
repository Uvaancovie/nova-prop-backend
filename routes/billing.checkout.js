const express = require('express');
const crypto = require('crypto');
const { PAYFAST_HOST, MERCHANT_ID, MERCHANT_KEY, PASSPHRASE } = require('../src/lib/payfast');
const { getPlan } = require('../src/domain/plans');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function signParams(params) {
  const pairs = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(String(params[k]).trim()).replace(/%20/g, '+')}`);
  const base = pairs.join('&');
  const withPass = PASSPHRASE ? `${base}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, '+')}` : base;
  const signature = crypto.createHash('md5').update(withPass).digest('hex');
  return `${base}&signature=${signature}`;
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

module.exports = router;
