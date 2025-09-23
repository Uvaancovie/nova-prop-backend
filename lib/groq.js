const Groq = require('groq-sdk');

// Defensive: ensure API key is present
if (!process.env.GROQ_API_KEY) {
  console.warn('GROQ_API_KEY not set — Groq client will not be initialized');
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function _callGroq(model, messages, extra = {}) {
  return groq.chat.completions.create({
    model,
    temperature: Number(process.env.AI_TEMP || 0.4),
    messages,
    ...extra,
  });
}

async function chatJSON(messages) {
  const primaryModel = process.env.AI_MODEL || 'llama-3.1-70b-versatile';
  const fallbackModel = process.env.AI_MODEL_FALLBACK || 'mixtral-8x7b-32768';

  async function attempt(model) {
    const completion = await _callGroq(model, [
      ...messages,
      { role: 'user', content: 'Return STRICT JSON only. No prose.' },
    ]);
    const text = completion?.choices?.[0]?.message?.content || '{}';
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }

  try {
    return await attempt(primaryModel);
  } catch (err) {
    const msg = err?.error?.message || err?.message || String(err);
    console.error('Groq chatJSON error (primary):', msg);
    // detect decommission or invalid model and retry with fallback once
    const isDecommission = /decommission|no longer supported|invalid_request_error/i.test(msg);
    if (isDecommission) {
      const docs = 'https://console.groq.com/docs/overview';
      const tried = `${primaryModel}${fallbackModel && fallbackModel !== primaryModel ? `, ${fallbackModel}` : ''}`;
      const errMsg = `Groq model decommissioned or unsupported. Models tried: ${tried}. Please set a supported model in AI_MODEL or AI_MODEL_FALLBACK. See ${docs}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }
    return { error: msg };
  }
}

async function chat(messages) {
  const primaryModel = process.env.AI_MODEL || 'llama-3.1-70b-versatile';
  const fallbackModel = process.env.AI_MODEL_FALLBACK || 'mixtral-8x7b-32768';

  try {
    const completion = await _callGroq(primaryModel, messages);
    return completion?.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    const msg = err?.error?.message || err?.message || String(err);
    console.error('Groq chat error (primary):', msg);
    const isDecommission = /decommission|no longer supported|invalid_request_error/i.test(msg);
    if (isDecommission) {
      const docs = 'https://console.groq.com/docs/overview';
      const tried = `${primaryModel}${fallbackModel && fallbackModel !== primaryModel ? `, ${fallbackModel}` : ''}`;
      const errMsg = `Groq model decommissioned or unsupported. Models tried: ${tried}. Please set a supported model in AI_MODEL or AI_MODEL_FALLBACK. See ${docs}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }
    return '';
  }
}

module.exports = { groq, chat, chatJSON };
