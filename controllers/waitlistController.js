const Waitlist = require('../models/Waitlist');
const crypto = require('crypto');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// @desc    Join waitlist
// @route   POST /api/waitlist/join
// @access  Public
exports.joinWaitlist = async (req, res) => {
  try {
    const { email, name, phone, role, referredBy, source, business } = req.body;

    // Validate email and name (required)
    if (!email || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email and name are required'
      });
    }

    // Check if email already exists
    const existingEntry = await Waitlist.findOne({ email });

    if (existingEntry) {
      return res.status(400).json({
        success: false,
        error: 'Email already on waitlist'
      });
    }

    // Generate unique referral code (first 6 chars of email hash)
    const referralCode = crypto
      .createHash('md5')
      .update(email + Date.now())
      .digest('hex')
      .substring(0, 6)
      .toUpperCase();

    // Collect signup data for analytics
    const signupData = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer || req.headers.referrer
    };

    // Create waitlist entry
    const waitlistEntry = await Waitlist.create({
      email,
      name: name || undefined,
      phone: phone || undefined,
      role: role || 'client', // Default to client
      referralCode,
      referredBy,
      source: source || 'landing_page',
      signupData,
      business: business || undefined
    });

    // If someone referred this user, update their stats
    if (referredBy) {
      await updateReferralStats(referredBy);
    }

    // Send confirmation email to user
    try {
      await resend.emails.send({
        from: 'PropStream <onboarding@nova-prop.com>',
        to: [email],
        subject: 'Welcome to PropStream Waitlist!',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
              .code { background: #667eea; color: white; padding: 10px 20px; border-radius: 5px; font-size: 18px; font-weight: bold; display: inline-block; margin: 15px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Welcome to PropStream!</h1>
              </div>
              <div class="content">
                <p>Hi ${name || 'there'},</p>
                <p>Thank you for joining our waitlist! We're thrilled to have you on board.</p>
                <p>You're now part of an exclusive group who will be the first to experience PropStream when we launch. We'll keep you updated on our progress and notify you as soon as we're ready.</p>
                ${business ? `<p><strong>Business:</strong> ${business}</p>` : ''}
                ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
                <p>Your referral code:</p>
                <div class="code">${referralCode}</div>
                <p><small>Share this code with friends to move up in the waitlist!</small></p>
                <p>Stay tuned for exciting updates!</p>
                <br>
                <p>Best regards,<br><strong>The PropStream Team</strong></p>
              </div>
              <div class="footer">
                <p>© 2025 PropStream. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }

    // Send notification to admin at info@novaprop.com
    try {
      await resend.emails.send({
        from: 'PropStream Waitlist <onboarding@nova-prop.com>',
        to: ['info@novaprop.com'],
        subject: '🎯 New Waitlist Signup',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 10px; }
              .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .info { background: white; padding: 20px; border-radius: 0 0 10px 10px; }
              .info-row { padding: 10px; border-bottom: 1px solid #eee; }
              .info-row:last-child { border-bottom: none; }
              .label { font-weight: bold; color: #555; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>🎯 New Waitlist Entry</h2>
              </div>
              <div class="info">
                <div class="info-row">
                  <span class="label">Name:</span> ${name || 'Not provided'}
                </div>
                <div class="info-row">
                  <span class="label">Email:</span> ${email}
                </div>
                <div class="info-row">
                  <span class="label">Phone:</span> ${phone || 'Not provided'}
                </div>
                <div class="info-row">
                  <span class="label">Business:</span> ${business || 'Not specified'}
                </div>
                <div class="info-row">
                  <span class="label">Role:</span> ${role || 'client'}
                </div>
                <div class="info-row">
                  <span class="label">Referral Code:</span> ${referralCode}
                </div>
                <div class="info-row">
                  <span class="label">Referred By:</span> ${referredBy || 'Direct signup'}
                </div>
                <div class="info-row">
                  <span class="label">Source:</span> ${source || 'landing_page'}
                </div>
                <div class="info-row">
                  <span class="label">Joined:</span> ${new Date().toLocaleString()}
                </div>
                <div class="info-row">
                  <span class="label">IP:</span> ${signupData.ip}
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send admin notification:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Successfully joined waitlist! Check your email for confirmation.',
      data: {
        email: waitlistEntry.email,
        referralCode: waitlistEntry.referralCode,
        joinedAt: waitlistEntry.joinedAt
      }
    });
  } catch (error) {
    console.error('Waitlist controller error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get waitlist stats
// @route   GET /api/waitlist/stats
// @access  Public
exports.getWaitlistStats = async (req, res) => {
  try {
    const totalCount = await Waitlist.countDocuments();
    const realtorCount = await Waitlist.countDocuments({ role: 'realtor' });
    const clientCount = await Waitlist.countDocuments({ role: 'client' });
    
    // Get position by referral code
    const { referralCode } = req.query;
    let position = null;
    let referrals = 0;
    
    if (referralCode) {
      const entry = await Waitlist.findOne({ referralCode });
      if (entry) {
        // Count how many people joined before this person
        position = await Waitlist.countDocuments({
          createdAt: { $lt: entry.createdAt }
        }) + 1;
        
        // Count referrals
        referrals = await Waitlist.countDocuments({ referredBy: referralCode });
      }
    }
    
    res.json({
      success: true,
      data: {
        totalCount,
        realtorCount,
        clientCount,
        position,
        referrals
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Helper function to update referral stats
const updateReferralStats = async (referralCode) => {
  try {
    // Find how many referrals this user has made
    const referralsCount = await Waitlist.countDocuments({ referredBy: referralCode });
    
    // Potential future implementation: 
    // - Update the user's priority in the waitlist
    // - Give rewards based on referrals
    
    return referralsCount;
  } catch (error) {
    console.error('Error updating referral stats:', error);
    return 0;
  }
};
