const express = require('express');
const rateLimit = require('express-rate-limit');
const { chat: groqChat } = require('../lib/groq');
const { protect, authorize } = require('../middleware/auth');
const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');
const { buildPropertyContext } = require('../lib/propertyContext');
const { buildFullContext } = require('../lib/aiContextBuilder');
const Message = require('../models/Message');
const { nameFromPrompt } = require('../lib/nameFromPrompt');
const AiUsage = require('../models/AiUsage');

const router = express.Router();

// Rate limiting: 30 requests per minute per IP
const limiter = rateLimit({ 
  windowMs: 60_000, 
  max: 30,
  message: 'Too many AI requests, please try again later'
});

// Apply auth and rate limiting to all routes
router.use(protect, authorize('realtor'), limiter);

// Create a new chat session (optionally with first user prompt)
router.post('/sessions', async (req, res) => {
  try {
    const { firstMessage = '' } = req.body;
    const session = await ChatSession.create({
      ownerUserId: req.user.id,
      title: nameFromPrompt(firstMessage)
    });
    
    if (firstMessage) {
      await ChatMessage.create({ 
        sessionId: session._id, 
        role: 'user', 
        content: firstMessage 
      });
    }
    
    res.json({ 
      success: true,
      session: {
        _id: session._id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    });
  } catch (error) {
    console.error('Error creating chat session:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// List sessions
router.get('/sessions', async (req, res) => {
  try {
    const items = await ChatSession.find({ ownerUserId: req.user.id })
      .sort({ updatedAt: -1 })
      .select('_id title updatedAt createdAt')
      .lean();
    
    res.json({ 
      success: true,
      items 
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Rename session
router.patch('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    
    const sess = await ChatSession.findOneAndUpdate(
      { _id: id, ownerUserId: req.user.id },
      { title, updatedAt: new Date() },
      { new: true }
    ).lean();
    
    if (!sess) {
      return res.status(404).json({ 
        success: false,
        message: 'Session not found' 
      });
    }
    
    res.json({ 
      success: true,
      session: sess 
    });
  } catch (error) {
    console.error('Error renaming session:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Delete session (and messages)
router.delete('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sess = await ChatSession.findOne({ 
      _id: id, 
      ownerUserId: req.user.id 
    });
    
    if (!sess) {
      return res.status(404).json({ 
        success: false,
        message: 'Session not found' 
      });
    }
    
    await ChatMessage.deleteMany({ sessionId: id });
    await sess.deleteOne();
    
    res.json({ 
      success: true 
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get messages for a session
router.get('/sessions/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const sess = await ChatSession.findOne({ 
      _id: id, 
      ownerUserId: req.user.id 
    }).lean();
    
    if (!sess) {
      return res.status(404).json({ 
        success: false,
        message: 'Session not found' 
      });
    }
    
    const msgs = await ChatMessage.find({ sessionId: id })
      .sort({ createdAt: 1 })
      .lean();
    
    res.json({ 
      success: true,
      messages: msgs 
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Post message -> Cohere reply (history-aware + property context)
router.post('/sessions/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Received request body:', req.body);
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        success: false,
        error: 'Content is required' 
      });
    }
    
    const sess = await ChatSession.findOne({ 
      _id: id, 
      ownerUserId: req.user.id 
    });
    
    if (!sess) {
      return res.status(404).json({ 
        success: false,
        message: 'Session not found' 
      });
    }

    // Save user message
    const userMsg = await ChatMessage.create({ 
      sessionId: id, 
      role: 'user', 
      content 
    });
    
    await ChatSession.updateOne(
      { _id: id }, 
      { updatedAt: new Date() }
    );

  // Build richer context (properties + upcoming bookings)
  const context = await buildFullContext(req.user.id, content, 8);

    // Pull limited recent history (to stay within token budget)
    const recent = await ChatMessage.find({ sessionId: id })
      .sort({ createdAt: -1 })
      .limit(12) // last 12 turns (~24 messages worst case)
      .lean();
    
    const history = recent.reverse().map(m => ({ 
      role: m.role, 
      content: m.content 
    }));

    const system = `You are PropNova's listing coach for South African rentals.
You ONLY use the realtor's own properties as context when relevant.
Return concise, high-utility answers. When crafting a property listing, output:
- Title (<= 60 chars)
- Description (120–220 words, scannable)
- Amenities (bulleted 6–10)
- 3 SEO keywords
Be specific to Durban/KZN when location is provided.`;

    const preface = `Context (realtor's properties):\n${context}\n\nQuestion:`;

    // Call Groq API
    console.log('About to call Groq API...');

    const messages = [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: `${preface}\n${content}` }
    ];

    console.log('Groq request payload:', JSON.stringify({ model: process.env.AI_MODEL || 'llama-3.1-70b-versatile', messages }, null, 2));

    let assistantText = null;
    try {
      const reply = await groqChat(messages);
      console.log('Groq reply:', reply);
      assistantText = reply || null;
    } catch (groqErr) {
      console.error('Groq client error:', groqErr?.message || groqErr);
      // Detect model decommission guidance thrown from groq.js
      if (groqErr && String(groqErr.message || '').includes('Groq model decommissioned')) {
        return res.status(502).json({ success: false, error: groqErr.message });
      }
      assistantText = "(AI temporarily unavailable) I'm unable to generate a response right now. Please try again later.";
    }
    if (!assistantText) assistantText = "(AI returned no content)";
    const aiMsg = await ChatMessage.create({ 
      sessionId: id, 
      role: 'assistant', 
      content: assistantText 
    });

    // Record AI usage (best-effort). We estimate tokens simply by words * 1.5 as a lightweight heuristic.
    (async () => {
      try {
        const words = assistantText ? assistantText.split(/\s+/).length : 0;
        const estimatedTokens = Math.round(words * 1.5);
        await AiUsage.findOneAndUpdate(
          { userId: req.user.id },
          { $inc: { requests: 1, tokens: estimatedTokens } },
          { upsert: true, new: true }
        );
      } catch (usageErr) {
        console.error('Failed to record AI usage:', usageErr);
      }
    })();

    // Optionally send AI reply as a message to a client (controlled by frontend)
    // pass sendToClient: true and bookingId/clientId in body to enable
    const { sendToClient = false, bookingId, clientId } = req.body;
    if (sendToClient && (bookingId || clientId)) {
      try {
        const receiver = clientId || null;
        const msgPayload = {
          sender_id: req.user.id,
          receiver_id: receiver || undefined,
          booking_id: bookingId || undefined,
          content: assistantText
        };
        // Only create if receiver exists (otherwise skip)
        if (receiver) {
          await Message.create(msgPayload);
        }
      } catch (err) {
        console.error('Failed to create client message for AI reply:', err);
      }
    }

    // Auto-title the session if first message
    if (sess.title === 'New conversation') {
      const newTitle = nameFromPrompt(content);
      await ChatSession.updateOne({ _id: id }, { title: newTitle });
    }

    res.json({ 
      success: true,
      message: { 
        _id: aiMsg._id, 
        role: 'assistant', 
        content: assistantText 
      } 
    });
  } catch (error) {
    console.error('Error processing chat message:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
