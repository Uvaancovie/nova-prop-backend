const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { PAYFAST_HOST, MERCHANT_ID, PASSPHRASE } = require('../src/lib/payfast');
const Organization = require('../models/Organization');
const Subscription = require('../models/Subscription');
const { getPlan } = require('../src/domain/plans');

const router = express.Router();

function md5Signature(form) {
  const keys = Object.keys(form).filter(k => k !== 'signature').sort();
  const base = keys.map(k => `${k}=${encodeURIComponent(form[k]).replace(/%20/g, '+')}`).join('&');
  const withPass = PASSPHRASE ? `${base}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, '+')}` : base;
  return crypto.createHash('md5').update(withPass).digest('hex');
}

async function remoteValidate(raw) {
  const resp = await fetch(`${PAYFAST_HOST}/eng/query/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: raw
  });
  return (await resp.text()).trim() === 'VALID';
}

router.post('/payfast/itn', async (req, res) => {
  try {
    const raw = req.rawBody || '';
    const form = Object.fromEntries(Object.entries(req.body || {}).map(([k,v]) => [k, String(v)]));

    // Verify
    const expected = md5Signature(form);
    const receivedSig = (form.signature || '').toLowerCase();
    const expectedSig = (expected || '').toLowerCase();
    if (receivedSig !== expectedSig) {
      console.warn('PayFast ITN signature mismatch', {
        receivedSig: receivedSig,
        expectedSig: expectedSig,
        rawBodyPreview: raw && raw.slice(0, 200),
        parsedForm: Object.keys(form).reduce((acc, k) => { acc[k] = form[k]; return acc; }, {}),
      });
      // Return 200 OK per PayFast spec but log details to help debugging
      return res.status(200).send('OK');
    }

    if (form.merchant_id !== MERCHANT_ID) {
      console.warn('PayFast ITN merchant_id mismatch', { received: form.merchant_id, expected: MERCHANT_ID });
      return res.status(200).send('OK');
    }

    const valid = await remoteValidate(raw);
    if (!valid) {
      console.warn('PayFast remote validation failed', { rawBodyPreview: raw && raw.slice(0, 200) });
      return res.status(200).send('OK');
    }

    const parts = (form.m_payment_id || '').split('_');
    const planId = parts[1];
    const orgId = parts[2];
    const plan = getPlan(planId);
    const amount = parseFloat(form.amount_gross || form.amount || '0');
    if (plan.priceZar > 0 && Math.abs(amount - plan.priceZar) > 0.01) return res.status(200).send('OK');

    const status = (form.payment_status || '').toUpperCase();
    const subStatus =
      status === 'COMPLETE' ? 'active' :
      status === 'CANCELLED' ? 'canceled' :
      status === 'FAILED' ? 'past_due' : 'inactive';

    await Subscription.findOneAndUpdate(
      { orgId },
      {
        orgId, planId, provider: 'payfast',
        status: subStatus,
        providerToken: form.token || undefined,
        lastItnAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await Organization.findByIdAndUpdate(orgId, { planId, subscriptionStatus: subStatus });
    return res.status(200).send('OK');
  } catch (e) {
    console.error('PayFast ITN error', e);
    return res.status(200).send('OK');
  }
});

module.exports = router;
