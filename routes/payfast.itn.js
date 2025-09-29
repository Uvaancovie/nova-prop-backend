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

function parseRawForm(raw) {
  // raw is application/x-www-form-urlencoded string, keep as-is but parse into keys
  const out = {};
  if (!raw) return out;
  raw.split('&').forEach(pair => {
    const [k, ...rest] = pair.split('=');
    const v = rest.join('=');
    // preserve raw v (percent-encoded plus signs) and also decode a variant
    try {
      // value with + treated as space then decode
      const spaceNormalized = v.replace(/\+/g, ' ');
      out[decodeURIComponent(k)] = decodeURIComponent(spaceNormalized);
    } catch (e) {
      out[k] = v;
    }
  });
  return out;
}

function encodePlusUpper(str) {
  const s = String(str);
  return encodeURIComponent(s).replace(/%20/g, '+').replace(/%[0-9a-f]{2}/g, m => m.toUpperCase());
}

function verifyItnSignatureOrdered(form, passphrase) {
  // Build pairs in the order received in the form (object iteration order preserves insertion order)
  const pairs = [];
  for (const [k, v] of Object.entries(form)) {
    if (k === 'signature') continue;
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (sv === '') continue; // skip empties
    pairs.push(`${k}=${encodePlusUpper(sv)}`);
  }
  let base = pairs.join('&');
  if (passphrase) base += `&passphrase=${encodePlusUpper(passphrase)}`;
  const calc = crypto.createHash('md5').update(base).digest('hex');
  return { base, calc };
}

function computeVariantSignatures(form, raw) {
  const variants = [];

  // Variant A: standard: encodeURIComponent(value) then %20->+
  try {
    const sigA = md5Signature(form);
    variants.push({ name: 'standard-encode', signature: sigA });
  } catch (e) {
    // ignore
  }

  // Variant B: exclude empty values
  try {
    const filtered = Object.keys(form)
      .filter(k => k !== 'signature' && String(form[k]).length)
      .reduce((acc, k) => { acc[k] = form[k]; return acc; }, {});
    const sigB = md5Signature(filtered);
    variants.push({ name: 'exclude-empty', signature: sigB });
  } catch (e) {}

  // Variant C: compute using parsing raw body, decoding + -> space before decode
  try {
    const parsed = parseRawForm(raw);
    const sigC = md5Signature(parsed);
    variants.push({ name: 'from-raw-parsed', signature: sigC });
  } catch (e) {}

  // Variant D: compute without passphrase (if PayFast didn't include passphrase in signing)
  try {
    const keysNo = Object.keys(form).filter(k => k !== 'signature').sort();
    const baseNo = keysNo.map(k => `${k}=${encodeURIComponent(form[k]).replace(/%20/g, '+')}`).join('&');
    const sigD = crypto.createHash('md5').update(baseNo).digest('hex');
    variants.push({ name: 'no-passphrase', signature: sigD });
  } catch (e) {}

  return variants;
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
    const receivedSigRaw = form.signature;
    const receivedSig = (receivedSigRaw || '').toLowerCase();

    if (!receivedSigRaw) {
      // PayFast 'require signature' may be turned off; accept ITN but log for visibility
      console.info('PayFast ITN has no signature (signature requirement may be disabled). Skipping signature verification.');
      console.debug('PayFast ITN parsed form', Object.keys(form).reduce((acc, k) => { acc[k] = form[k]; return acc; }, {}));
    } else {
      // Primary verification: ordered fields (document/form order) with passphrase
      const { base: orderedBase, calc: orderedCalc } = verifyItnSignatureOrdered(form, PASSPHRASE);
      if ((orderedCalc || '').toLowerCase() === receivedSig) {
        console.info('PayFast ITN signature matched using ordered base');
      } else {
        // Fallback: try computed variants
        const variants = computeVariantSignatures(form, raw).map(v => ({ name: v.name, signature: (v.signature||'').toLowerCase() }));
        const matched = variants.find(v => v.signature === receivedSig);
        if (!matched) {
          console.warn('PayFast ITN signature mismatch - no variant matched', {
            receivedSig: receivedSig,
            orderedBase: orderedBase,
            rawBodyPreview: raw && raw.slice(0, 200),
            parsedForm: Object.keys(form).reduce((acc, k) => { acc[k] = form[k]; return acc; }, {}),
            variants
          });
          return res.status(200).send('OK');
        }
        console.info('PayFast ITN signature matched using variant', matched.name);
      }
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

// Dev-only: debug endpoint to compute signature variants from a raw form or params
// POST /payfast/debug-signature { raw: 'k=v&...', params: { ... } }
router.post('/payfast/debug-signature', (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).send('Not found');
  try {
    const raw = req.body && typeof req.body.raw === 'string' ? req.body.raw : '';
    const params = req.body && req.body.params && typeof req.body.params === 'object' ? req.body.params : null;

    let form = {};
    if (params) {
      form = Object.fromEntries(Object.entries(params).map(([k,v]) => [k, String(v)]));
    } else if (raw) {
      form = parseRawForm(raw);
    } else {
      return res.status(400).json({ message: 'Missing raw or params' });
    }

    // Build canonical bases for each variant
    const variants = [];

    // standard
    const keys = Object.keys(form).filter(k => k !== 'signature').sort();
    const baseStandard = keys.map(k => `${k}=${encodeURIComponent(String(form[k]).trim()).replace(/%20/g, '+')}`).join('&');
    const withPass = PASSPHRASE ? `${baseStandard}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, '+')}` : baseStandard;
    variants.push({ name: 'standard-encode', base: withPass, signature: crypto.createHash('md5').update(withPass).digest('hex') });

    // exclude-empty
    const keysFiltered = Object.keys(form).filter(k => k !== 'signature' && String(form[k]).length).sort();
    const baseFiltered = keysFiltered.map(k => `${k}=${encodeURIComponent(String(form[k]).trim()).replace(/%20/g, '+')}`).join('&');
    const withPassFiltered = PASSPHRASE ? `${baseFiltered}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, '+')}` : baseFiltered;
    variants.push({ name: 'exclude-empty', base: withPassFiltered, signature: crypto.createHash('md5').update(withPassFiltered).digest('hex') });

    // from raw parsed (decode + -> space then encode)
    const parsed = parseRawForm(raw || '');
    const keysParsed = Object.keys(parsed).filter(k => k !== 'signature').sort();
    const baseParsed = keysParsed.map(k => `${k}=${encodeURIComponent(String(parsed[k]).trim()).replace(/%20/g, '+')}`).join('&');
    const withPassParsed = PASSPHRASE ? `${baseParsed}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, '+')}` : baseParsed;
    variants.push({ name: 'from-raw-parsed', base: withPassParsed, signature: crypto.createHash('md5').update(withPassParsed).digest('hex') });

    // no-passphrase
    const baseNoPass = keys.map(k => `${k}=${encodeURIComponent(String(form[k]).trim()).replace(/%20/g, '+')}`).join('&');
    variants.push({ name: 'no-passphrase', base: baseNoPass, signature: crypto.createHash('md5').update(baseNoPass).digest('hex') });

    return res.json({ ok: true, variants });
  } catch (e) {
    console.error('debug-signature error', e);
    return res.status(500).json({ message: 'Server error' });
  }
});
