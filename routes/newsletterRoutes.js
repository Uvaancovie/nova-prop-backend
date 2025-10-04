const express = require('express');
const rateLimit = require('express-rate-limit');
const NewsletterSubscription = require('../models/NewsletterSubscription');
const Newsletter = require('../models/Newsletter');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Rate limiter for sending newsletters
const sendLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 sends per window per IP/user
  keyGenerator: (req) => req.user._id.toString(), // Per user, not per IP
  message: { message: 'Too many newsletter sends. Try again in 15 minutes.' }
});

// Role guards
const requireRealtor = [protect, authorize('realtor')];
const requireClient = [protect, authorize('client')];

// Monthly quota helper
function getMonthWindow(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 1)
  };
}

async function assertNewsletterQuota(realtorId) {
  const { start, end } = getMonthWindow();
  const count = await Newsletter.countDocuments({
    realtorId,
    createdAt: { $gte: start, $lt: end }
  });
  
  if (count >= 10) {
    const error = new Error("Monthly newsletter limit reached (10/10)");
    error.status = 429;
    error.code = "NEWSLETTER_MONTHLY_QUOTA_REACHED";
    throw error;
  }
  
  console.log(`Newsletter quota check: ${count}/10 for realtor ${realtorId}`);
  return count;
}

// Ensure conversation exists between realtor and client
async function ensureConversation(realtorId, clientId) {
  let conversation = await Conversation.findOne({ realtorId, clientId });
  
  if (!conversation) {
    conversation = await Conversation.create({
      type: 'realtor_client',
      realtorId,
      clientId,
      lastMessageAt: new Date()
    });
  }
  
  return conversation;
}

// Validate HTTPS URL
function validateHttpsUrl(url) {
  if (!url) return true; // Optional field
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// POST /newsletter/subscribe { realtorId } (client only)
router.post('/subscribe', requireClient, async (req, res) => {
  try {
    const { realtorId } = req.body;
    if (!realtorId) {
      return res.status(400).json({ message: 'realtorId is required' });
    }

    // Verify realtor exists
    const realtor = await User.findById(realtorId);
    if (!realtor || realtor.role !== 'realtor') {
      return res.status(404).json({ message: 'Realtor not found' });
    }

    // Create/update subscription
    const subscription = await NewsletterSubscription.findOneAndUpdate(
      { realtorId, clientId: req.user._id },
      { 
        $set: { status: 'subscribed' },
        $unset: { unsubscribedAt: 1 }
      },
      { new: true, upsert: true }
    );

    // Ensure conversation exists
    const conversation = await ensureConversation(realtorId, req.user._id);

    // Send system messages to both parties
    const systemMessages = [
      {
        conversationId: conversation._id,
        fromUserId: null, // System message
        toUserId: realtorId,
        type: 'system',
        subject: 'New Newsletter Subscriber',
        content: `${req.user.name || req.user.email} subscribed to your newsletter`,
        body: `${req.user.name || req.user.email} subscribed to your newsletter`,
        read: false,
        meta: { kind: 'subscription_notice' }
      },
      {
        conversationId: conversation._id,
        fromUserId: null, // System message
        toUserId: req.user._id,
        type: 'system',
        subject: 'Newsletter Subscription Confirmed',
        content: `You're now subscribed to ${realtor.name || realtor.email}'s newsletter and can message them directly`,
        body: `You're now subscribed to ${realtor.name || realtor.email}'s newsletter and can message them directly`,
        read: false,
        meta: { kind: 'subscription_confirmation' }
      }
    ];

    await Message.insertMany(systemMessages);

    // Update conversation timestamp
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessageAt: new Date()
    });

    res.json({ 
      ok: true, 
      subscription,
      conversationId: conversation._id 
    });

  } catch (error) {
    console.error('Newsletter subscribe error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /newsletter/unsubscribe { realtorId } (client only)
router.post('/unsubscribe', requireClient, async (req, res) => {
  try {
    const { realtorId } = req.body;
    if (!realtorId) {
      return res.status(400).json({ message: 'realtorId is required' });
    }

    // Update subscription status
    const subscription = await NewsletterSubscription.findOneAndUpdate(
      { realtorId, clientId: req.user._id },
      { 
        $set: { 
          status: 'unsubscribed',
          unsubscribedAt: new Date()
        }
      },
      { new: true }
    );

    if (subscription) {
      // Send system message to client
      const conversation = await Conversation.findOne({ realtorId, clientId: req.user._id });
      if (conversation) {
        await Message.create({
          conversationId: conversation._id,
          fromUserId: null,
          toUserId: req.user._id,
          type: 'system',
          subject: 'Unsubscribed',
          content: 'You have unsubscribed from this newsletter',
          body: 'You have unsubscribed from this newsletter',
          read: false,
          meta: { kind: 'unsubscribe_confirmation' }
        });
      }
    }

    res.json({ ok: true, subscription });

  } catch (error) {
    console.error('Newsletter unsubscribe error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /newsletter/subscribers?page=1&pageSize=20 (realtor only)
router.get('/subscribers', requireRealtor, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, parseInt(req.query.pageSize || '20', 10));

    const [rows, total] = await Promise.all([
      NewsletterSubscription.find({ 
        realtorId: req.user._id, 
        status: 'subscribed' 
      })
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .populate('clientId', 'name email'),
      NewsletterSubscription.countDocuments({ 
        realtorId: req.user._id, 
        status: 'subscribed' 
      })
    ]);

    res.json({ page, pageSize, total, rows });

  } catch (error) {
    console.error('Newsletter subscribers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /newsletter/sent?page=1&pageSize=20 (realtor only)
router.get('/sent', requireRealtor, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, parseInt(req.query.pageSize || '20', 10));

    const [newsletters, total] = await Promise.all([
      Newsletter.find({ realtorId: req.user._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      Newsletter.countDocuments({ realtorId: req.user._id })
    ]);

    res.json({ page, pageSize, total, newsletters });

  } catch (error) {
    console.error('Newsletter sent history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /newsletter/quota (realtor only) - check current month usage
router.get('/quota', requireRealtor, async (req, res) => {
  try {
    const { start, end } = getMonthWindow();
    const count = await Newsletter.countDocuments({
      realtorId: req.user._id,
      createdAt: { $gte: start, $lt: end }
    });

    res.json({ 
      used: count, 
      limit: 10, 
      remaining: 10 - count,
      monthWindow: { start, end }
    });

  } catch (error) {
    console.error('Newsletter quota check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /newsletter/send { title, body, imageUrl?, cta? } (realtor only)
router.post('/send', requireRealtor, sendLimiter, async (req, res) => {
  try {
    const { title, body, imageUrl, cta } = req.body;

    // Validate required fields
    if (!title || !body) {
      return res.status(400).json({ 
        message: 'Title and body are required' 
      });
    }

    // Validate field lengths
    if (title.length > 120) {
      return res.status(400).json({ 
        message: 'Title must be 120 characters or less' 
      });
    }

    if (body.length > 8000) {
      return res.status(400).json({ 
        message: 'Body must be 8000 characters or less' 
      });
    }

    // Validate image URL if provided
    if (imageUrl && !validateHttpsUrl(imageUrl)) {
      return res.status(400).json({ 
        message: 'Image URL must be a valid HTTPS URL' 
      });
    }

    // Validate CTA if provided
    if (cta) {
      if (!cta.label || !cta.url) {
        return res.status(400).json({ 
          message: 'CTA must include both label and URL' 
        });
      }
      if (!validateHttpsUrl(cta.url)) {
        return res.status(400).json({ 
          message: 'CTA URL must be a valid HTTPS URL' 
        });
      }
    }

    // Check monthly quota
    await assertNewsletterQuota(req.user._id);

    // Get active subscribers
    const subscriptions = await NewsletterSubscription.find({
      realtorId: req.user._id,
      status: 'subscribed'
    }).select('clientId');

    const recipientIds = subscriptions.map(sub => sub.clientId);

    // Create newsletter record
    const newsletter = await Newsletter.create({
      realtorId: req.user._id,
      title: title.trim(),
      body: body.trim(),
      imageUrl: imageUrl?.trim() || undefined,
      cta: cta ? {
        label: cta.label.trim(),
        url: cta.url.trim()
      } : undefined,
      sentAt: new Date(),
      stats: {
        recipients: recipientIds.length,
        delivered: 0,
        opened: 0
      }
    });

    // Deliver newsletters if there are recipients
    if (recipientIds.length > 0) {
      const messages = recipientIds.map(clientId => ({
        fromUserId: req.user._id,
        toUserId: clientId,
        type: 'newsletter',
        subject: title.trim(),
        content: `${title.trim()}\n\n${body.trim()}`,
        body: body.trim(),
        read: false,
        meta: {
          newsletterId: newsletter._id,
          imageUrl: imageUrl?.trim(),
          cta: cta ? {
            label: cta.label.trim(),
            url: cta.url.trim()
          } : undefined
        }
      }));

      await Message.insertMany(messages);

      // Update delivery count
      await Newsletter.findByIdAndUpdate(newsletter._id, {
        'stats.delivered': recipientIds.length
      });
    }

    console.log(`Newsletter sent: ${newsletter._id}, recipients: ${recipientIds.length}`);

    res.json({
      ok: true,
      newsletterId: newsletter._id,
      recipients: recipientIds.length,
      newsletter: {
        id: newsletter._id,
        title: newsletter.title,
        sentAt: newsletter.sentAt,
        stats: newsletter.stats
      }
    });

  } catch (error) {
    console.error('Newsletter send error:', error);

    if (error.code === 'NEWSLETTER_MONTHLY_QUOTA_REACHED') {
      return res.status(429).json({
        message: error.message,
        code: error.code
      });
    }

    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
