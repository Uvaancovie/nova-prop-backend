const crypto = require('crypto');
require('dotenv').config({ path: __dirname + '/../.env' });
const raw = 'amount=199.00&cancel_url=https%3A%2F%2Fwww.nova-prop.com%2Fbilling%2Fcancel&cycles=0&email_address=way2flyagency%40gmail.com&frequency=3&item_name=PropNova+Growth+Subscription&m_payment_id=sub_growth_68d692053509245eb62bd595_1759144078866&merchant_id=31497961&merchant_key=j7zjpqxlrqqeo&name_first=Uvaan+Covenden&name_last=&notify_url=https%3A%2F%2Fnova-prop-backend.onrender.com%2Fpayfast%2Fitn&recurring_amount=199.00&return_url=https%3A%2F%2Fwww.nova-prop.com%2Fbilling%2Freturn&subscription_type=1&signature=cdbfa0107bdf66169bd4b6de54970a2d';
const qs = raw.split('&').map(kv => { const [k,v] = kv.split('='); return [k, decodeURIComponent(v||'')]; });
const paramsObj = Object.fromEntries(qs);
// remove signature
delete paramsObj.signature;
// exclude empty values
const filtered = Object.fromEntries(Object.entries(paramsObj).filter(([k,v]) => v !== ''));
const pass = process.env.PAYFAST_PASSPHRASE || '';
function encodeVal(v){return encodeURIComponent(String(v).trim()).replace(/%20/g,'+');}
const base = Object.keys(filtered).sort().map(k => `${k}=${encodeVal(filtered[k])}`).join('&');
const withPass = pass ? `${base}&passphrase=${encodeVal(pass)}` : base;
const sig = crypto.createHash('md5').update(withPass).digest('hex');
console.log('BASE:', base);
console.log('WITH_PASS:', withPass);
console.log('SIG:', sig);
console.log('EXPECTED: cdbfa0107bdf66169bd4b6de54970a2d');
if(sig === 'cdbfa0107bdf66169bd4b6de54970a2d') console.log('MATCH'); else console.log('NO MATCH');
