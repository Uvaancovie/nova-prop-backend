const PAYFAST_HOST =
  process.env.PAYFAST_MODE === 'live'
    ? 'https://www.payfast.co.za'
    : 'https://sandbox.payfast.co.za';

const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || '';

module.exports = { PAYFAST_HOST, MERCHANT_ID, MERCHANT_KEY, PASSPHRASE };
