const cron = require('node-cron');
const Subscription = require('../models/Subscription');
const Organization = require('../models/Organization');
const User = require('../models/User');
const mailer = require('../lib/mailer');

const CRON_SCHEDULE = process.env.TRIAL_CHECK_CRON || '0 0 * * *'; // daily at midnight

const job = cron.schedule(CRON_SCHEDULE, async () => {
  try {
    const now = new Date();
    const expired = await Subscription.find({ status: 'trialing', trialEndsAt: { $lte: now } });
    for (const sub of expired) {
      sub.status = 'trial_expired';
      await sub.save();
      await Organization.findByIdAndUpdate(sub.orgId, { subscriptionStatus: 'trial_expired' });
      const org = await Organization.findById(sub.orgId);
      if (org && org.owner) {
        const owner = await User.findById(org.owner);
        if (owner && owner.email) {
          await mailer.send({
            to: owner.email,
            subject: 'Your free trial has ended',
            text: `Your free trial has ended. Please upgrade: ${process.env.APP_BASE_URL}/billing`
          });
        }
      }
    }

    // reminders 3 days before
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const reminders = await Subscription.find({ status: 'trialing', trialEndsAt: { $lte: soon, $gt: now } });
    for (const r of reminders) {
      const org = await Organization.findById(r.orgId);
      if (org && org.owner) {
        const owner = await User.findById(org.owner);
        if (owner && owner.email) {
          await mailer.send({
            to: owner.email,
            subject: 'Your trial ends soon',
            text: `Your free trial ends on ${r.trialEndsAt.toISOString()}. Upgrade: ${process.env.APP_BASE_URL}/billing`
          });
        }
      }
    }
  } catch (err) {
    console.error('trialExpiryJob error', err);
  }
}, { scheduled: false });

module.exports = job;
