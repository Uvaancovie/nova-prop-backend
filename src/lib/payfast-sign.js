const crypto = require('crypto');

// Standard FORM_ORDER used by PayFast for hosted payment page canonicalization
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

const MODES = {
  MODE_AZ_ENC: 'MODE_AZ_ENC', // alphabetical, encoded with spaces -> + and uppercase %
  MODE_AZ_RAW: 'MODE_AZ_RAW', // alphabetical, raw encodeURIComponent (no + replacement)
  MODE_FORM_ENC: 'MODE_FORM_ENC' // documented form order, encoded with spaces -> + and uppercase %
};

function encodePlusUpper(str) {
  const s = String(str);
  return encodeURIComponent(s).replace(/%20/g, '+').replace(/%[0-9a-f]{2}/g, m => m.toUpperCase());
}

function encodeRawUpper(str) {
  const s = String(str);
  return encodeURIComponent(s).replace(/%[0-9a-f]{2}/g, m => m.toUpperCase());
}

// signWithMode(mode, params, passphrase, formOrder)
// params: plain object of key->string values (already cleaned of null/empty)
// passphrase: string or empty
// formOrder: optional array; used when MODE_FORM_ENC
function signWithMode(mode, params, passphrase, formOrder = FORM_ORDER) {
  // Ensure params is a plain object
  const cleaned = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (!sv) continue;
    cleaned[k] = sv;
  }

  if (mode === MODES.MODE_FORM_ENC) {
    const pairs = [];
    const orderedKeys = [];
    for (const key of formOrder) {
      if (!Object.prototype.hasOwnProperty.call(cleaned, key)) continue;
      orderedKeys.push(key);
      pairs.push(`${key}=${encodePlusUpper(cleaned[key])}`);
    }
    let base = pairs.join('&');
    if (passphrase) base += `&passphrase=${encodePlusUpper(passphrase)}`;
    const signature = crypto.createHash('md5').update(base).digest('hex');
    return { base, signature, orderedKeys, fieldsToPost: orderedKeys.map(k => ({ k, v: cleaned[k] })) };
  }

  // Alphabetical modes
  const alphaKeys = Object.keys(cleaned).sort();
  const pairs = [];
  for (const k of alphaKeys) {
    const encoded = mode === MODES.MODE_AZ_ENC ? encodePlusUpper(cleaned[k]) : encodeRawUpper(cleaned[k]);
    pairs.push(`${k}=${encoded}`);
  }
  let base = pairs.join('&');
  if (passphrase) base += `&passphrase=${mode === MODES.MODE_AZ_ENC ? encodePlusUpper(passphrase) : encodeRawUpper(passphrase)}`;
  const signature = crypto.createHash('md5').update(base).digest('hex');
  return { base, signature, orderedKeys: alphaKeys, fieldsToPost: alphaKeys.map(k => ({ k, v: cleaned[k] })) };
}

module.exports = { signWithMode, FORM_ORDER, MODES };
