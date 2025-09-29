// compute_payfast_sig.js
// Compute MD5 signature for a PayFast query string using the project's .env passphrase.

const crypto = require('crypto');
require('dotenv').config({ path: __dirname + '/../.env' });

const rawQuery = 'amount=199.00&cancel_url=https%3A%2F%2Fwww.nova-prop.com%2Fbilling%2Fcancel&cycles=0&email_address=way2flyagency%40gmail.com&frequency=3&item_name=PropNova+Growth+Subscription&m_payment_id=sub_growth_68d692053509245eb62bd595_1759144078866&merchant_id=31497961&merchant_key=j7zjpqxlrqqeo&name_first=Uvaan+Covenden&name_last=&notify_url=https%3A%2F%2Fnova-prop-backend.onrender.com%2Fpayfast%2Fitn&recurring_amount=199.00&return_url=https%3A%2F%2Fwww.nova-prop.com%2Fbilling%2Freturn&subscription_type=1&signature=cdbfa0107bdf66169bd4b6de54970a2d';

// Parse query into key-values (treat '+' as space per application/x-www-form-urlencoded)
const qs = rawQuery.split('&').map(kv => {
  const [k, v] = kv.split('=');
  const rawVal = (v || '').replace(/\+/g, ' ');
  return [k, decodeURIComponent(rawVal)];
});
const params = Object.fromEntries(qs);
// Remove signature if present
delete params.signature;

function computeSignature(params, passphrase) {
  const pairs = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(String(params[k]).trim()).replace(/%20/g, '+')}`);
  const base = pairs.join('&');
  const withPass = passphrase ? `${base}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}` : base;
  const signature = crypto.createHash('md5').update(withPass).digest('hex');
  return { base, withPass, signature };
}

const pass = process.env.PAYFAST_PASSPHRASE || '';
const out = computeSignature(params, pass);
console.log('PASSPHRASE:', JSON.stringify(pass));
console.log('BASE:', out.base);
console.log('WITH_PASS:', out.withPass);
console.log('SIGNATURE:', out.signature);
console.log('EXPECTED_SIGNATURE:', 'cdbfa0107bdf66169bd4b6de54970a2d');

if (out.signature === 'cdbfa0107bdf66169bd4b6de54970a2d') {
  console.log('MATCH — computed signature equals expected');
} else {
  console.log('MISMATCH — signatures differ');
}
