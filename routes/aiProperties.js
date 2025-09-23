const express = require('express');
const rateLimit = require('express-rate-limit');
const { chatJSON } = require('../lib/groq');
const { buildPropertyContext } = require('../lib/propertyContext');
const { protect, authorize } = require('../middleware/auth');

const r = express.Router();
const limiter = rateLimit({ windowMs: 60_000, max: 20 });

r.post('/assist',
  protect,
  authorize('realtor'),
  limiter,
  async (req, res) => {
    try {
      const { bullets = '', city = '', bedrooms = 0, bathrooms = 0, highlights = '' } = req.body;

      const realtorCtx = await buildPropertyContext(String(req.user._id), `${bullets} ${city}`);

      const system = `You are PropNova's South African listing coach.\nReturn STRICT JSON with:\n- \"title\" (<=60 chars)\n- \"description\" (120–220 words, scannable, SA tone, no emojis)\n- \"amenities\" (array of 6–10 concise items)\n- \"seoKeywords\" (array of 3–5 short phrases)`;

      const user = `Context (realtor's own properties):\n${realtorCtx}\n\nCreate an improved listing draft from:\nBullets: ${bullets}\nCity: ${city} | Bedrooms: ${bedrooms} | Bathrooms: ${bathrooms}\nHighlights: ${Array.isArray(highlights) ? highlights.join(', ') : highlights}`;

      const json = await chatJSON([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);

      return res.json({
        title: json.title || '',
        description: json.description || '',
        amenities: json.amenities || [],
        seoKeywords: json.seoKeywords || [],
        raw: json.raw, // helps debug if parsing failed
      });
    } catch (err) {
      console.error('Error in /api/ai/properties/assist:', err);
      return res.status(400).json({ success: false, error: err.message || String(err) });
    }
  }
);

module.exports = r;
