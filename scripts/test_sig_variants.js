require('dotenv').config();
const crypto = require('crypto');
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || '';
const baseParams = {
  amount: '149.00',
  cancel_url: 'http://localhost:5173/billing/cancel',
  cycles: '0',
  email_address: 'way2flyagency@gmail.com',
  frequency: '3',
  item_name: 'PropNova Starter Subscription',
  m_payment_id: 'sub_starter_unknown_1758891918289',
  merchant_id: '31497961',
  merchant_key: 'j7zjpqxlrqqeo',
  name_first: 'Uvaan Covenden',
  name_last: '',
  notify_url: 'http://localhost:4000/payfast/itn',
  recurring_amount: '149.00',
  return_url: 'http://localhost:5173/billing/return',
  subscription_type: '1'
};

function sign(params, passphrase) {
  const pairs = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(String(params[k]).trim()).replace(/%20/g, '+')}`);
  const base = pairs.join('&');
  const withPass = passphrase ? `${base}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g,'+')}` : base;
  const sig = crypto.createHash('md5').update(withPass).digest('hex');
  return { base, withPass, sig };
}

console.log('Env PASSPHRASE:', PASSPHRASE ? 'SET' : 'EMPTY');

const variations = [
  { name: 'with merchant_key, with passphrase', params: baseParams, pass: PASSPHRASE },
  { name: 'with merchant_key, no passphrase', params: baseParams, pass: '' },
  { name: 'without merchant_key, with passphrase', params: (() => { const p = {...baseParams}; delete p.merchant_key; return p; })(), pass: PASSPHRASE },
  { name: 'without merchant_key, no passphrase', params: (() => { const p = {...baseParams}; delete p.merchant_key; return p; })(), pass: '' },
];

variations.forEach(v => {
  const out = sign(v.params, v.pass);
  console.log('\nVariant:', v.name);
  console.log('SIG:', out.sig);
  console.log('BASE:', out.base.substring(0,200) + (out.base.length>200? '...':'') );
});

console.log('\nCompare against failing signature: 720c388fd531d77ec2e08c7554ffcb80');
