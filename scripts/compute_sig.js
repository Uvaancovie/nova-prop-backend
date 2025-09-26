require('dotenv').config();
const crypto = require('crypto');
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || '';
const argM = process.argv[2] || 'sub_starter_unknown_1758891918289';
const params = {
  amount: '149.00',
  cancel_url: 'http://localhost:5173/billing/cancel',
  cycles: '0',
  email_address: 'way2flyagency@gmail.com',
  frequency: '3',
  item_name: 'PropNova Starter Subscription',
  m_payment_id: argM,
  merchant_id: '31497961',
  merchant_key: 'j7zjpqxlrqqeo',
  name_first: 'Uvaan Covenden',
  name_last: '',
  notify_url: 'http://localhost:4000/payfast/itn',
  recurring_amount: '149.00',
  return_url: 'http://localhost:5173/billing/return',
  subscription_type: '1'
};
const pairs = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(String(params[k]).trim()).replace(/%20/g, '+')}`);
const base = pairs.join('&');
const withPass = PASSPHRASE ? `${base}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, '+')}` : base;
const sig = crypto.createHash('md5').update(withPass).digest('hex');
console.log('BASE:', base);
console.log('WITHPASS:', withPass);
console.log('SIG:', sig);

// Also compute signature without passphrase for comparison
const sigNoPass = crypto.createHash('md5').update(base).digest('hex');
console.log('SIG_NO_PASSPHRASE:', sigNoPass);
