const express = require('express');
const rateLimit = require('express-rate-limit');
const { chat } = require('../lib/groq');
const { buildFullContext } = require('../lib/aiContextBuilder');
const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');
const { protect, authorize } = require('../middleware/auth');

const r = express.Router();
const limiter = rateLimit({ windowMs: 60_000, max: 30 });

r.use(protect, authorize('realtor'), limiter);

// create session
r.post('/sessions', async (req, res) => {
  try {
    const first = (req.body && req.body.firstMessage ? String(req.body.firstMessage) : '').trim();
    const title = first ? first.slice(0, 48) : 'New conversation';
    const sess = await ChatSession.create({ ownerUserId: req.user._id, title });
    if (first) await ChatMessage.create({ sessionId: sess._id, role: 'user', content: first });
    return res.json({ sessionId: sess._id, title });
  } catch (err) {
    console.error('Error creating chat session:', err);
    return res.status(400).json({ success: false, error: err.message || String(err) });
  }
});

// list sessions
r.get('/sessions', async (req, res) => {
  try {
    const items = await ChatSession.find({ ownerUserId: req.user._id })
      .sort({ updatedAt: -1 }).select('_id title updatedAt').lean();
    return res.json({ items });
  } catch (err) {
    console.error('Error listing chat sessions:', err);
    return res.status(400).json({ success: false, error: err.message || String(err) });
  }
});

// get messages
r.get('/sessions/:id/messages', async (req, res) => {
  try {
    const msgs = await ChatMessage.find({ sessionId: req.params.id }).sort({ createdAt: 1 }).lean();
    return res.json({ messages: msgs });
  } catch (err) {
    console.error('Error fetching messages:', err);
    return res.status(400).json({ success: false, error: err.message || String(err) });
  }
});

// send message
r.post('/sessions/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const content = String((req.body && req.body.content) || '');
    if (!content) return res.status(400).json({ message: 'Empty message' });

    await ChatMessage.create({ sessionId: id, role: 'user', content });

  // build richer context (properties + upcoming bookings)
  const ctx = await buildFullContext(String(req.user._id), content, 8);

    // load recent chat history (token-aware window)
    const recent = await ChatMessage.find({ sessionId: id }).sort({ createdAt: -1 }).limit(12).lean();
    const history = recent.reverse().map(m => ({ role: m.role, content: m.content }));

    const system = `You are PropNova's listing coach. Use the realtor's own property context when relevant.\nIf asked to draft a listing, output a block with:\nTitle, Description (~150–200 words), 6–10 Amenities, and 3 SEO keywords. No emojis.`;

    const prompt = `Context (realtor properties):\n${ctx}\n\nQuestion:\n${content}`;

    const reply = await chat([
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: prompt },
    ]);

    const ai = await ChatMessage.create({ sessionId: id, role: 'assistant', content: reply });
    await ChatSession.updateOne({ _id: id }, { updatedAt: new Date() });

    return res.json({ message: { _id: ai._id, role: 'assistant', content: reply } });
  } catch (err) {
    console.error('Error processing chat message:', err);
    return res.status(400).json({ success: false, error: err.message || String(err) });
  }
});

module.exports = r;
