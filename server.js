const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──
// In production, replace '*' with your actual Netlify/Capacitor origin
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['POST', 'OPTIONS'],
}));
app.use(express.json({ limit: '20mb' }));

// ── SYSTEM PROMPT ──
const SYSTEM_PROMPT = `You are Skint, a warm and direct personal finance coach.
Analyse the user's spending summary and give 2-3 specific, actionable insights in plain conversational language.
Be direct — mention actual numbers. Flag any obvious issues (e.g. high food delivery, unused subscriptions).
End with one concrete weekly challenge as a single sentence starting with "Challenge:".
Keep the total response under 120 words. No bullet points. Conversational tone.`;

// ── RATE LIMITING (simple in-memory, resets on restart) ──
const requestCounts = new Map();
const RATE_LIMIT = 10; // requests per IP per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    requestCounts.set(ip, { count: 1, windowStart: now });
    return next();
  }

  if (entry.count >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  entry.count++;
  next();
}

// ── HEALTH CHECK ──
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── PDF PARSE ENDPOINT ──
const PDF_PARSE_PROMPT = `You are a bank statement parser. The user will give you raw text extracted from a bank statement PDF.
Your job is to find every transaction and return them as a JSON array.

IMPORTANT: PTSB/Permanent TSB bank PDFs use custom font encoding so text appears garbled. The pattern is consistent:
- Lines starting with "[ +" are January transactions, "ãáâ" = February, "( ê" = March, "( ê" = March etc. These are date prefixes.
- "è.+" means "T/F" (transfer/payment)
- "î&&" means "VPP" (Visa/card payment)  
- "&!ë" means "POS" (point of sale)
- "ñäè" means "ICT" (credit transfer)
- "àà" means "DD" (direct debit)
- Common merchants decode as: "èáëä! ëè!êáë" = Tesco Stores, "êÁÎ?%ÍÈ" = Revolut, "àá<ñîáê!!" = Deliveroo, "& ààß &!ïáê" = Paddy Power, "äñêä<á" = Circle K, "(ää âáë &ç ê" = McDonald's, "[ÍËÈ á/È ñÊÁ" = Just Eat Ireland, "ëäêñââ<áë" = Scramblers, "!âêñá+ë" = O'Briens, "ãêáá+!ï" = Freshway, "ëÈ/ÊÂÍÄÇs" = Starbucks
- Amounts are in the Withdrawn/Paid In columns and are usually readable numbers
- The statement date prefix tells you the month — look for year in the statement header

Even with garbled text, extract all transactions. Use the decoded merchant names where possible, or use the garbled text as-is if you cannot decode it.

Each transaction object must have exactly these fields:
- date: string in YYYY-MM-DD format
- description: string — decoded merchant name if possible, otherwise raw text
- amount: number — negative for debits/withdrawals, positive for credits/paid in

Return ONLY a valid JSON array, no other text, no markdown, no explanation.
If you cannot find any transactions, return an empty array [].

Example output:
[
  {"date":"2025-03-07","description":"Tesco Groceries","amount":-68.40},
  {"date":"2025-03-31","description":"Salary","amount":2800.00}
]`;

app.post('/parse-pdf', rateLimit, async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text field.' });
  }

  if (text.length > 15000) {
    return res.status(400).json({ error: 'Text too long.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: PDF_PARSE_PROMPT,
        messages: [{ role: 'user', content: `Bank statement text:\n\n${text}` }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic error ${response.status}`);
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '[]';

    // Parse the JSON array returned by the AI
    let rows = [];
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        // Normalise to the format buildSummary expects
        rows = parsed
          .filter(t => t.date && t.description && typeof t.amount === 'number')
          .map(t => ({
            date: String(t.date),
            description: String(t.description),
            amount: String(t.amount),
          }));
      }
    } catch (parseErr) {
      console.error('PDF parse JSON error:', parseErr.message);
      rows = [];
    }

    res.json({ rows });
  } catch (err) {
    console.error('PDF parse error:', err.message);
    res.status(502).json({ error: 'PDF parsing temporarily unavailable.' });
  }
});

// ── COACH ENDPOINT ──
app.post('/coach', rateLimit, async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing message field.' });
  }

  if (message.length > 1500) {
    return res.status(400).json({ error: 'Message too long.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable not set');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic error ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    res.json({ text });
  } catch (err) {
    console.error('Coach error:', err.message);
    res.status(502).json({ error: 'AI coaching temporarily unavailable.' });
  }
});

// ── PDF VISION ENDPOINT (for image-based PDFs like PTSB) ──
const PDF_VISION_PROMPT = `You are a bank statement parser. The user will send you images of bank statement pages.
Your job is to find every transaction visible in the images and return them as a JSON array.

Each transaction object must have exactly these fields:
- date: string in YYYY-MM-DD format
- description: string — merchant or payee name as it appears
- amount: number — negative for debits/spending, positive for credits/income

Return ONLY a valid JSON array, no other text, no markdown, no explanation.
If you cannot find any transactions, return an empty array [].

Example output:
[
  {"date":"2025-03-07","description":"Tesco Groceries","amount":-68.40},
  {"date":"2025-03-31","description":"Salary","amount":2800.00}
]`;

app.post('/parse-pdf-vision', rateLimit, async (req, res) => {
  req.setTimeout(120000); // 2 min timeout for vision requests
  res.setTimeout(120000);
  const { images } = req.body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Missing images array.' });
  }

  if (images.length > 6) {
    return res.status(400).json({ error: 'Too many pages — maximum 6.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    // Build content array with all page images
    const content = [
      ...images.map((b64, i) => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
      })),
      { type: 'text', text: 'These are pages from a bank statement. Find all transactions and return them as a JSON array.' }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: PDF_VISION_PROMPT,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic error ${response.status}`);
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '[]';
    console.log('Vision images sent:', images.length, 'pages');
    console.log('Vision raw response length:', raw.length, 'first 200:', raw.slice(0, 200));

    let rows = [];
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        rows = parsed
          .filter(t => t.date && t.description && typeof t.amount === 'number')
          .map(t => ({
            date: String(t.date),
            description: String(t.description),
            amount: String(t.amount),
          }));
      }
    } catch (parseErr) {
      console.error('Vision parse JSON error:', parseErr.message);
      rows = [];
    }

    res.json({ rows });
  } catch (err) {
    console.error('Vision parse error:', err.message);
    res.status(502).json({ error: 'Vision PDF parsing temporarily unavailable.' });
  }
});

app.listen(PORT, () => console.log(`Skint API running on port ${PORT}`));
