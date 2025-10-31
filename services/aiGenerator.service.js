const { Groq } = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Use the requested Groq model (qwen3). Falls back to env or this model.
const MODEL = process.env.AI_MODEL || 'qwen/qwen3-32b';
const TEMP = Number(process.env.AI_TEMP ?? 0.6);

/**
 * Try to parse JSON returned by an LLM response, with simple fallbacks.
 */
function tryParseJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) {}
  // try to extract last JSON block
  const m = text.match(/(\{[\s\S]*\})\s*$/);
  if (m) {
    try { return JSON.parse(m[1]); } catch (e) {}
  }
  return null;
}

const cohere = require('cohere-ai');
if (process.env.COHERE_API_KEY) {
  try { cohere.init(process.env.COHERE_API_KEY); } catch (e) { console.warn('Cohere init failed', e.message); }
}

async function callGroq(prompt) {
  try {
    console.log('Calling Groq with model:', MODEL);
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: MODEL,
      temperature: TEMP,
      // qwen/qwen3-32b supports larger completions; allocate ample tokens
      max_completion_tokens: 4096,
      // not streaming here to simplify consumption; set stream:false
      stream: false,
    });

    // Groq SDK may return different shapes; try common ones
    let content = null;
    if (chatCompletion?.choices?.[0]?.message?.content) {
      content = chatCompletion.choices[0].message.content;
    } else if (chatCompletion?.choices?.[0]?.delta?.content) {
      // sometimes delta/content appears in streaming responses
      content = chatCompletion.choices[0].delta.content;
    } else if (chatCompletion?.outputs?.[0]?.content) {
      // generic outputs field
      const out = chatCompletion.outputs[0].content.find(c => c.type === 'output_text');
      content = out?.text ?? null;
    }

    console.log('Groq response length:', content ? content.length : 0);
    return content;
  } catch (error) {
    console.error('Groq API error:', error?.message || error);
    // bubble up but keep the message
    throw error;
  }
}

async function callCohere(prompt) {
  if (!process.env.COHERE_API_KEY) {
    throw new Error('Cohere API key not configured');
  }
  try {
    console.log('Calling Cohere as fallback');
    const response = await cohere.generate({
      model: 'command-xlarge-nightly',
      prompt,
      max_tokens: 400,
      temperature: TEMP,
    });
    const text = response.body?.generations?.[0]?.text ?? null;
    console.log('Cohere response length:', text ? text.length : 0);
    return text;
  } catch (err) {
    console.error('Cohere API error:', err?.message || err);
    throw err;
  }
}

/**
 * Public function to generate listing content.
 * Accepts the form object { beds, baths, propertyType, suburb, province, price, amenities }.
 * Returns { title, description, amenities:[], keywords:[] }.
 */
async function generateListing(input) {
  if (!input) throw new Error('Missing input');
  const { beds, baths, propertyType, suburb, province, price, amenities } = input;
  const prompt = `
You are a concise real-estate copywriter. Given these inputs:
beds: ${beds}
baths: ${baths}
property type: ${propertyType}
suburb: ${suburb}
province: ${province}
price: ${price}
amenities: ${amenities}

Produce JSON ONLY with these keys:
"title" (string, max 60 chars),
"description" (string, 150-220 words, plain text, preserve newlines),
"amenities" (array of 6-10 short strings),
"keywords" (array of 3 short SEO keywords).

Do NOT output any explanation or extra fields.
`;

  const raw = await callGroq(prompt);
  if (!raw) throw new Error('Groq returned empty response.');

  const parsed = tryParseJSON(raw);
  if (!parsed) {
    // fallback: construct basic output
    const text = raw.replace(/\n{2,}/g, '\n').trim();
    return {
      title: (text.split('\n')[0] || `${beds} bed in ${suburb}`).slice(0, 60),
      description: text.slice(0, 220 * 6), // rough truncation
      amenities: (amenities || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 10).concat(['Modern Kitchen','Secure Parking']).slice(0,8),
      keywords: [`${suburb} property`, `${beds} bedroom ${suburb}`, 'buy property']
    };
  }

  // sanitize results
  const out = {
    title: String(parsed.title || '').slice(0, 60),
    description: String(parsed.description || parsed.desc || '').trim(),
    amenities: Array.isArray(parsed.amenities) ? parsed.amenities.slice(0,10) : (String(parsed.amenities || '').split(',').map(s=>s.trim()).filter(Boolean).slice(0,10)),
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0,3) : (String(parsed.keywords || '').split(',').map(s=>s.trim()).filter(Boolean).slice(0,3))
  };

  return out;
}

module.exports = { generateListing };
