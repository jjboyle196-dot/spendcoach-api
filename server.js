const express = require('express');
const cors = require('cors');
let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch(e) { console.warn('pdf-parse not available:', e.message); }
let stripe = null;
try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); } catch(e) { console.warn('Stripe not available:', e.message); }
const app = express();
const PORT = process.env.PORT || 3000;
// ── SUPABASE ──
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sqlnvwggsvsbslehaner.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
async function supabaseRequest(path, method = 'GET', body = null) {
  if (!SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : '',
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
// Load merchant map from Supabase into memory on startup, refresh every 10 mins
let merchantCache = {};
let cacheLastLoaded = 0;
async function getMerchantCache() {
  const now = Date.now();
  if (now - cacheLastLoaded < 10 * 60 * 1000 && Object.keys(merchantCache).length > 0) {
    return merchantCache;
  }
  try {
    const rows = await supabaseRequest('/merchant_map?select=garbled,decoded&limit=5000');
    if (rows && Array.isArray(rows)) {
      merchantCache = {};
      rows.forEach(r => { merchantCache[r.garbled.trim()] = r.decoded; });
      cacheLastLoaded = now;
      console.log(`Merchant cache loaded: ${rows.length} entries`);
    }
  } catch (e) {
    console.error('Failed to load merchant cache:', e.message);
  }
  return merchantCache;
}
async function saveMerchantMappings(mappings) {
  if (!SUPABASE_KEY || !mappings || mappings.length === 0) return;
  try {
    const rows = mappings.map(m => ({
      garbled: m.garbled.trim(),
      decoded: m.decoded.trim(),
      count: 1,
      updated_at: new Date().toISOString(),
    }));
    await supabaseRequest('/merchant_map', 'POST', rows);
    cacheLastLoaded = 0;
    console.log(`Saved ${rows.length} merchant mappings`);
  } catch (e) {
    console.error('Failed to save merchant mappings:', e.message);
  }
}
getMerchantCache().catch(() => {});

// ═══════════════════════════════════════════════════════════════
// MERCHANT LIBRARY (Phase 2 — wired into categoriser)
// ═══════════════════════════════════════════════════════════════
// The library has 3 tables in Supabase:
//   merchants          — canonical (e.g. "Tesco" → "Groceries")
//   merchant_aliases   — raw bank strings → merchant_id mapping
//   merchant_corrections — anonymous user category corrections
//
// Pipeline at categorise time:
//   1. Normalize the raw merchant string
//   2. Look up alias in merchant_aliases
//   3. If found, return the canonical merchant + category instantly
//   4. If not, hand off to AI categorisation
//   5. After AI returns, save the result back to the library for next time

let merchantLibCache = {}; // { normalized_alias: { canonical_name, category } }
let merchantLibLoaded = 0;

// Normalize a raw bank merchant string. MUST match the SQL function semantics:
// lowercase, strip 4+ digit numbers, strip location words, strip punctuation, collapse whitespace.
function normalizeMerchantString(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    // Replace separators (dots, slashes, hyphens, asterisks, plus) with spaces
    .replace(/[.\/\\\-_*+|]/g, ' ')
    // Strip 4+ digit numbers (card numbers, store IDs)
    .replace(/\d{4,}/g, '')
    // Strip location/filler words
    .replace(/\b(st|street|rd|road|ave|avenue|dublin|cork|galway|limerick|ireland|ie|co|com|bill|app|the|ltd)\b/gi, '')
    // Remove remaining non-alphanumeric (keep spaces)
    .replace(/[^a-z0-9 ]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadMerchantLibrary() {
  const now = Date.now();
  // Cache for 10 minutes
  if (now - merchantLibLoaded < 10 * 60 * 1000 && Object.keys(merchantLibCache).length > 0) {
    return merchantLibCache;
  }
  if (!SUPABASE_KEY) return merchantLibCache;
  try {
    // Pull all aliases joined with their merchant for fast lookup
    // Note: PostgREST embedded resource syntax
    const aliases = await supabaseRequest('/merchant_aliases?select=raw_string,merchants(canonical_name,category)&limit=5000');
    if (aliases && Array.isArray(aliases)) {
      const newCache = {};
      for (const a of aliases) {
        if (a.raw_string && a.merchants) {
          newCache[a.raw_string] = {
            canonical_name: a.merchants.canonical_name,
            category: a.merchants.category,
          };
        }
      }
      merchantLibCache = newCache;
      merchantLibLoaded = now;
      console.log(`[merchant-lib] loaded ${aliases.length} aliases`);
    }
  } catch (e) {
    console.error('[merchant-lib] failed to load:', e.message);
  }
  return merchantLibCache;
}

// Try to look up a merchant string in the library. Returns null if not found.
function lookupMerchant(rawString) {
  const normalized = normalizeMerchantString(rawString);
  if (!normalized) return null;
  // Exact match first
  if (merchantLibCache[normalized]) return merchantLibCache[normalized];
  // Try a few prefix-based fallbacks for noisy strings:
  // "tesco stores" matches "tesco" if we have it canonically
  for (const key of Object.keys(merchantLibCache)) {
    if (normalized.startsWith(key + ' ') || key.startsWith(normalized + ' ')) {
      return merchantLibCache[key];
    }
  }
  return null;
}

// Save new merchant + alias to the library after AI categorisation.
// Pipeline: ensure canonical merchant exists, then add alias mapping.
async function saveMerchantToLibrary(rawString, category) {
  if (!SUPABASE_KEY || !rawString || !category) return;
  const normalized = normalizeMerchantString(rawString);
  if (!normalized || normalized.length < 2) return;

  try {
    // Use the normalized string as canonical_name. Could be smarter
    // (e.g. "Tesco Stores 3094" → "Tesco") but this is a safe v1.
    // We use upsert via "Prefer: resolution=merge-duplicates" header.
    // First, ensure canonical merchant exists. If category conflicts, the latest write wins.
    const merchant = await supabaseRequest('/merchants', 'POST', [{
      canonical_name: normalized,
      category: category,
      source: 'ai_single',
      confidence: 0.6,
      seen_count: 1,
    }]);
    // Now look up the merchant_id for this canonical_name
    const lookup = await supabaseRequest(`/merchants?canonical_name=eq.${encodeURIComponent(normalized)}&select=id&limit=1`);
    if (!lookup || !Array.isArray(lookup) || lookup.length === 0) return;
    const merchantId = lookup[0].id;

    // Save the alias mapping
    await supabaseRequest('/merchant_aliases', 'POST', [{
      merchant_id: merchantId,
      raw_string: normalized,
      source: 'ai_single',
      confidence: 0.6,
      seen_count: 1,
    }]);

    // Update local cache so next request hits it
    merchantLibCache[normalized] = { canonical_name: normalized, category };
  } catch (e) {
    console.error('[merchant-lib] save failed for', rawString, ':', e.message);
  }
}

// Save a user correction (when user re-categorises a transaction in the UI).
// This goes to merchant_corrections so we can detect community trends.
async function saveCorrection(rawString, suggestedCategory, correctedCategory) {
  if (!SUPABASE_KEY || !rawString || !correctedCategory) return;
  const normalized = normalizeMerchantString(rawString);
  if (!normalized) return;
  try {
    await supabaseRequest('/merchant_corrections', 'POST', [{
      alias_raw: normalized,
      suggested_category: suggestedCategory || null,
      corrected_category: correctedCategory,
    }]);
  } catch (e) {
    console.error('[merchant-lib] correction save failed:', e.message);
  }
}

// Load library on startup, refresh every 10 mins
loadMerchantLibrary().catch(() => {});
// ── CORS ──
const ALLOWED_ORIGINS = [
  'https://skint.ie',
  'https://www.skint.ie',
  'http://localhost:3000',
  'http://localhost:8080',
  /\.netlify\.app$/,
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = ALLOWED_ORIGINS.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (allowed) return callback(null, true);
    console.warn('Blocked CORS request from:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
}));
app.use((req, res, next) => {
  // Stripe webhook needs raw body for signature verification — skip JSON parser
  if (req.originalUrl === '/stripe-webhook') return next();
  return express.json({ limit: '20mb' })(req, res, next);
});
// ── SYSTEM PROMPT ──
const SYSTEM_PROMPT = `You are Skint, an Irish personal finance information tool.
Summarise what the user's spending data shows in plain, conversational language. Describe patterns factually — do not tell the user what to do, what they should cut, or give financial advice of any kind.
Mention actual numbers and specific merchants so the summary is grounded in their real data.
Use Irish context where relevant: pints cost €6-9 in Dublin pubs, Tesco/Lidl/Aldi are normal grocers, Circle K is a petrol station.
If the user has a spending personality type mentioned, reference it naturally once.
If the user's name is given, use it once near the start.
If month-on-month data is given, note whether spending went up or down and by how much.
End with one observational reflection — a single sentence starting with "One thing worth knowing:".
Keep the total response under 130 words. No bullet points. Conversational Irish tone — not preachy, not American. This is information only, not financial advice.`;
// ── RATE LIMITING ──
const requestCounts = new Map();
function getRateLimitKey(req) {
  // Authenticated users — rate-limit by user ID (more accurate than IP, especially for users behind shared NAT)
  if (req.user && req.user.id) return 'u:' + req.user.id;
  // Anonymous — rate-limit by IP
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
}
function checkRateLimit(key, endpoint, limit, windowMs) {
  const now = Date.now();
  const mapKey = `${key}:${endpoint}`;
  const entry = requestCounts.get(mapKey);
  if (!entry || now - entry.windowStart > windowMs) {
    requestCounts.set(mapKey, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) {
    const resetIn = Math.ceil((entry.windowStart + windowMs - now) / 1000 / 60);
    return { allowed: false, resetIn };
  }
  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts.entries()) {
    if (now - entry.windowStart > 24 * 60 * 60 * 1000) {
      requestCounts.delete(key);
    }
  }
}, 30 * 60 * 1000);
function rateLimitCoach(req, res, next) {
  const key = getRateLimitKey(req);
  const result = checkRateLimit(key, 'coach', 5, 60 * 60 * 1000);
  if (!result.allowed) {
    return res.status(429).json({
      error: `Too many AI summary requests. Try again in ${result.resetIn} minutes.`
    });
  }
  next();
}
function rateLimitVision(req, res, next) {
  const key = getRateLimitKey(req);
  // Authed users: 15/hr, anon: 5/hr
  const hourlyLimit = (req.user && req.user.id) ? 15 : 5;
  const result = checkRateLimit(key, 'vision', hourlyLimit, 60 * 60 * 1000);
  if (!result.allowed) {
    return res.status(429).json({
      error: `Too many PDF vision requests. Try again in ${result.resetIn} minutes.`
    });
  }
  // Daily: 10 authed, 3 anon
  const dailyLimit = (req.user && req.user.id) ? 10 : 3;
  const dailyResult = checkRateLimit(key, 'vision_daily', dailyLimit, 24 * 60 * 60 * 1000);
  if (!dailyResult.allowed) {
    return res.status(429).json({
      error: 'Daily PDF parsing limit reached. Try again tomorrow, or sign in for higher limits.'
    });
  }
  next();
}
function rateLimitParse(req, res, next) {
  const key = getRateLimitKey(req);
  const result = checkRateLimit(key, 'parse', 20, 60 * 60 * 1000);
  if (!result.allowed) {
    return res.status(429).json({
      error: `Too many requests. Try again in ${result.resetIn} minutes.`
    });
  }
  next();
}
function rateLimitCheckout(req, res, next) {
  const key = getRateLimitKey(req);
  const result = checkRateLimit(key, 'checkout', 5, 60 * 60 * 1000);
  if (!result.allowed) {
    return res.status(429).json({
      error: `Too many checkout attempts. Try again in ${result.resetIn} minutes.`
    });
  }
  next();
}
function rateLimit(req, res, next) {
  return rateLimitParse(req, res, next);
}

// ── AUTH: Verify Supabase JWT ──
// Verifies the Authorization: Bearer <token> header against Supabase.
// On success: req.user = { id, email }
// On failure: 401 Unauthorized
async function requireAuth(req, res, next) {
  // In dev, allow ?dev=1 query OR an absent token (so curl tests still work locally if SUPABASE_JWT_SECRET unset)
  const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
  if (!SUPABASE_JWT_SECRET) {
    // Misconfigured: refuse rather than silently allow in production
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'Server auth not configured.' });
    }
    // Dev: allow through but tag user as anonymous
    req.user = { id: 'dev-anonymous', email: null };
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Authorization required. Please sign in.' });
  }

  // Verify against Supabase by hitting their /auth/v1/user endpoint with the token.
  // Simpler than pulling in a JWT lib — Supabase does the validation.
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_KEY || ''
      }
    });
    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
    }
    const userData = await verifyRes.json();
    if (!userData || !userData.id) {
      return res.status(401).json({ error: 'Invalid session.' });
    }
    req.user = { id: userData.id, email: userData.email };
    next();
  } catch (e) {
    console.error('Auth verification failed:', e.message);
    return res.status(503).json({ error: 'Auth service temporarily unavailable.' });
  }
}

// ── AUTH (soft): like requireAuth but doesn't reject anonymous users.
// Sets req.user to null if no token. Useful for endpoints we want to
// rate-limit per-user when authed but still allow anon usage.
async function softAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) { req.user = null; return next(); }
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_KEY || '' }
    });
    if (!verifyRes.ok) { req.user = null; return next(); }
    const data = await verifyRes.json();
    req.user = data && data.id ? { id: data.id, email: data.email } : null;
  } catch (e) {
    req.user = null;
  }
  next();
}

// ── REQUIRE PRO ─────────────────────────────────────────────
// Must run AFTER requireAuth — checks the authenticated user has is_pro=true.
async function requirePro(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authorization required.' });
  }
  if (!SUPABASE_KEY) {
    return res.status(500).json({ error: 'Server Pro check not configured.' });
  }
  try {
    const rows = await supabaseRequest(
      `/user_data?user_id=eq.${req.user.id}&select=is_pro&limit=1`,
      'GET'
    );
    const isPro = Array.isArray(rows) && rows[0] && rows[0].is_pro === true;
    if (!isPro) {
      return res.status(402).json({ error: 'Pro required.' });
    }
    req.isPro = true;
    next();
  } catch (e) {
    console.error('Pro check failed:', e.message);
    return res.status(503).json({ error: 'Pro check temporarily unavailable.' });
  }
}

// ── PENNY (chat companion) ─────────────────────────────────────
const PENNY_SYSTEM_PROMPT = `You are Penny, a warm reflective companion built into Skint, an Irish personal finance app. You talk with the user about their money — not as an advisor, but as a clever, calm friend who happens to know their numbers.

WHO YOU TALK TO:
Irish renters, mostly 22–35, saving for a deposit on a first home. They are busy, often anxious about money, and have heard enough lectures. They have uploaded their bank statements to Skint, which is how you know what you know.

STRICT RULES (do not break these):
- You reflect, you do not advise. Never say "you should", "try to", "consider cutting", "I recommend". State what is there. Ask a question. Let them decide.
- Never recommend specific products, banks, accounts, investments, or services.
- You are not a financial advisor. If the user asks for advice you cannot give (debt, investments, mortgage decisions), warmly redirect: "That one is worth a chat with a proper advisor — but I can show you what your numbers look like around it."
- Never use the words "AI", "insights", "patterns", or "analysing" in your replies. You are a companion, not a feature.
- Use euros (€). Use Irish context naturally — Dublin pubs charge €6–9 a pint, Tesco/Lidl/Aldi are the grocers, rent is the big one.
- Keep replies short. Two or three sentences is usually plenty. No lectures. No bullet lists unless the user explicitly asks for one.
- Tone: warm, dry, occasionally cheeky. Irish friend at a kitchen table, not American life coach. Never preachy.
- Use the user's real numbers and merchants from the context block. Specificity is what makes you useful.
- If the user is venting or anxious, acknowledge it before any numbers. Money is emotional.

You will be given a FINANCIAL CONTEXT block summarising the user's recent spending. Treat it as reliable. If the user asks about something not in the context, say so honestly: "I cannot see that from here."`;

const PENNY_MODEL = process.env.PENNY_MODEL || 'claude-haiku-4-5';
const PENNY_MAX_TOKENS = Number(process.env.PENNY_MAX_TOKENS || 300);
const PENNY_FREE_LIMIT = Number(process.env.PENNY_FREE_LIFETIME_LIMIT || 3);
const PENNY_PRO_LIMIT = Number(process.env.PENNY_PRO_MONTHLY_LIMIT || 50);

function pennyBuildContextBlock(summary) {
  if (!summary || typeof summary !== 'object') {
    return 'FINANCIAL CONTEXT:\n(No statement data available yet — the user has not uploaded a statement.)';
  }
  const lines = ['FINANCIAL CONTEXT (most recent statement period):'];
  if (summary.daysInPeriod) lines.push(`Period: ${summary.daysInPeriod} days`);
  if (summary.totalIncome != null) lines.push(`Income: €${Math.round(summary.totalIncome)}`);
  if (summary.totalSpent != null) lines.push(`Spend: €${Math.round(summary.totalSpent)}`);
  if (summary.net != null) lines.push(`Net: €${Math.round(summary.net)}`);
  if (summary.dailyAvg != null) lines.push(`Daily average spend: €${Math.round(summary.dailyAvg)}`);
  if (summary.personality) lines.push(`Spender profile: ${summary.personality}`);
  if (Array.isArray(summary.topCategories) && summary.topCategories.length) {
    const cats = summary.topCategories.slice(0, 5)
      .map(c => `${c.category} €${Math.round(c.total)} (${c.count} txns)`).join(', ');
    lines.push(`Top categories: ${cats}`);
  }
  if (Array.isArray(summary.topMerchants) && summary.topMerchants.length) {
    const merch = summary.topMerchants.slice(0, 6)
      .map(m => `${m.merchant} €${Math.round(m.total)} (${m.visits}x)`).join(', ');
    lines.push(`Top merchants: ${merch}`);
  }
  if (Array.isArray(summary.subscriptions) && summary.subscriptions.length) {
    const subs = summary.subscriptions.slice(0, 6)
      .map(s => `${s.merchant} €${Math.round(s.monthly)}/mo`).join(', ');
    lines.push(`Subscriptions: ${subs}`);
  }
  if (summary.pubSpend) lines.push(`Pub spend: €${Math.round(summary.pubSpend)}`);
  if (summary.deliverySpend) lines.push(`Delivery spend: €${Math.round(summary.deliverySpend)}`);
  if (summary.grocerySpend) lines.push(`Grocery spend: €${Math.round(summary.grocerySpend)}`);
  if (summary.coffeeSpend) lines.push(`Coffee spend: €${Math.round(summary.coffeeSpend)}`);
  return lines.join('\n');
}

function rateLimitPenny(req, res, next) {
  const key = getRateLimitKey(req);
  const result = checkRateLimit(key, 'penny', 5, 60 * 1000);
  if (!result.allowed) {
    return res.status(429).json({ error: 'Slow down a sec — Penny is catching up.' });
  }
  next();
}

app.post('/penny', requireAuth, rateLimitPenny, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server not configured.' });
  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Server not configured.' });

  let row;
  try {
    const rows = await supabaseRequest(
      `/user_data?user_id=eq.${req.user.id}&select=is_pro,penny_free_messages_used,penny_messages_this_month,penny_messages_month&limit=1`,
      'GET'
    );
    row = (Array.isArray(rows) && rows[0]) ? rows[0] : {};
  } catch (e) {
    return res.status(503).json({ error: 'User check temporarily unavailable.' });
  }

  const isPro = row.is_pro === true;
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  let used;
  if (isPro) {
    const sameMonth = row.penny_messages_month === currentMonth;
    used = sameMonth ? Number(row.penny_messages_this_month || 0) : 0;
    if (used >= PENNY_PRO_LIMIT) {
      return res.status(429).json({
        error: 'You have used a lot of Penny this month — she is resting until the 1st. The dashboard still has everything you need.'
      });
    }
  } else {
    used = Number(row.penny_free_messages_used || 0);
    if (used >= PENNY_FREE_LIMIT) {
      return res.status(402).json({ error: 'free_limit_reached' });
    }
  }

  const { messages, summary } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing messages.' });
  }
  if (messages.length > 30) {
    return res.status(400).json({ error: 'Conversation too long.' });
  }
  const sanitized = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant')
      && typeof m.content === 'string' && m.content.trim().length > 0)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  if (sanitized.length === 0 || sanitized[sanitized.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Last message must be from user.' });
  }

  const contextBlock = pennyBuildContextBlock(summary);
  const withContext = sanitized.map((m, i) => {
    if (i === 0 && m.role === 'user') {
      return { role: 'user', content: `${contextBlock}\n\n---\n\n${m.content}` };
    }
    return m;
  });

  let reply;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: PENNY_MODEL,
        max_tokens: PENNY_MAX_TOKENS,
        system: PENNY_SYSTEM_PROMPT,
        messages: withContext,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic error ${response.status}`);
    }
    const data = await response.json();
    reply = data.content?.[0]?.text || '';
  } catch (err) {
    console.error('Penny model error:', err.message);
    return res.status(502).json({ error: 'Penny is having a moment. Try again in a sec.' });
  }

  if (!reply) return res.status(502).json({ error: 'Empty reply.' });

  const updateBody = isPro
    ? { penny_messages_this_month: used + 1, penny_messages_month: currentMonth, updated_at: new Date().toISOString() }
    : { penny_free_messages_used: used + 1, updated_at: new Date().toISOString() };
  supabaseRequest(`/user_data?user_id=eq.${req.user.id}`, 'PATCH', updateBody)
    .catch(e => console.error('Penny counter update failed:', e.message));

  trackCost('coach');
  const remaining = isPro
    ? Math.max(0, PENNY_PRO_LIMIT - (used + 1))
    : Math.max(0, PENNY_FREE_LIMIT - (used + 1));
  res.json({ reply, remaining, isPro });
});
// ── COST GUARD ──
let dailyCostTracker = { date: '', visionCalls: 0, coachCalls: 0, parseCalls: 0 };
function trackCost(type) {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCostTracker.date !== today) {
    dailyCostTracker = { date: today, visionCalls: 0, coachCalls: 0, parseCalls: 0 };
  }
  if (type === 'vision') dailyCostTracker.visionCalls++;
  if (type === 'coach') dailyCostTracker.coachCalls++;
  if (type === 'parse') dailyCostTracker.parseCalls++;
  const estimatedCost = (dailyCostTracker.visionCalls * 0.20) +
                        (dailyCostTracker.coachCalls * 0.01) +
                        (dailyCostTracker.parseCalls * 0.01);
  if (estimatedCost > 5) {
    console.warn(`⚠️ COST ALERT: Estimated daily API spend is $${estimatedCost.toFixed(2)}`);
  }
  console.log(`API cost tracker — today: $${estimatedCost.toFixed(2)} | vision:${dailyCostTracker.visionCalls} coach:${dailyCostTracker.coachCalls} parse:${dailyCostTracker.parseCalls}`);
}
// ── HEALTH CHECK ──
app.get('/health', (req, res) => {
  const estimatedCost = (dailyCostTracker.visionCalls * 0.20) +
                        (dailyCostTracker.coachCalls * 0.01) +
                        (dailyCostTracker.parseCalls * 0.01);
  res.json({
    status: 'ok',
    today: dailyCostTracker.date,
    estimatedDailyCost: `$${estimatedCost.toFixed(2)}`,
    calls: {
      vision: dailyCostTracker.visionCalls,
      coach: dailyCostTracker.coachCalls,
      parse: dailyCostTracker.parseCalls
    }
  });
});
// ── MERCHANT MAP ENDPOINTS ──
app.get('/merchant-map', async (req, res) => {
  const cache = await getMerchantCache();
  res.json({ map: cache, count: Object.keys(cache).length });
});
app.post('/merchant-map', async (req, res) => {
  const { mappings } = req.body;
  if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
    return res.status(400).json({ error: 'Missing mappings array.' });
  }
  const clean = mappings.filter(m =>
    m.garbled && m.decoded &&
    typeof m.garbled === 'string' &&
    typeof m.decoded === 'string' &&
    m.garbled.length < 100 &&
    m.decoded.length < 100
  );
  await saveMerchantMappings(clean);
  res.json({ saved: clean.length });
});
// ═══════════════════════════════════════════════════════════════
// BANK FORMAT DETECTION + STRUCTURAL PARSERS
// ═══════════════════════════════════════════════════════════════
// Bank-specific hint passed to the AI prompt as additional context.
// Used as fallback when the structural parser fails.
function getBankHint(bank) {
  switch (bank) {
    case 'aib':
      return `AIB statements use DD/MM/YYYY format. Columns: Date | Description | Debit | Credit | Balance.
Negative amounts go in "Debit", positive in "Credit". Direct debits often start with "DD". `;
    case 'boi':
      return `Bank of Ireland statements use DD/MM/YYYY format. Columns: Date | Description | Debit | Credit | Balance.
Watch for "POS" (point of sale), "ATM", "DD" (direct debit) prefixes in description. `;
    case 'n26':
      return `N26 statements use DD/MM/YYYY format. Outgoings shown as negative euro amounts.
Common patterns: "MasterCard Payment", "Direct Debit", "Income". `;
    case 'ptsb':
      return `PTSB / Permanent TSB statements use DD/MM/YYYY format. The text encoding is custom — use the decoding tables above. `;
    default:
      return '';
  }
}

// Detect which bank this PDF text is from. Returns one of:
//   'revolut' | 'aib' | 'boi' | 'ptsb' | 'n26' | 'unknown'
// Detection runs on the first ~3000 chars to keep it fast.
function detectBank(text) {
  if (!text || typeof text !== 'string') return 'unknown';
  const sample = text.slice(0, 3000).toLowerCase();
  // Order matters — most distinctive markers first
  if (sample.includes('revolut bank uab') || sample.includes('revoie23') || sample.includes('revolut.com')) return 'revolut';
  if (sample.includes('permanent tsb') || sample.includes('ptsb.ie') || /\b(\[\s*\+|ãáâ|\(\s*ê)\b/.test(text.slice(0, 5000))) return 'ptsb';
  if (sample.includes('allied irish bank') || sample.includes('aib.ie') || /\baib\b/.test(sample)) return 'aib';
  if (sample.includes('bank of ireland') || sample.includes('bankofireland.com') || sample.includes('bofi')) return 'boi';
  if (sample.includes('n26 bank') || sample.includes('n26.com') || /\bn26\b/.test(sample)) return 'n26';
  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════
// REVOLUT PARSER — clean, structural, no AI needed
// ═══════════════════════════════════════════════════════════════
// Revolut PDFs are well-structured:
//   - Each transaction starts with a date in "D MMM YYYY" format
//   - Description on the same line
//   - "Money out" or "Money in" column with €amount
//   - Optional "To:" / "From:" / "Reference:" / "Card:" continuation lines
//   - "To pocket" / "Pocket Withdrawal" = internal transfers (skip from totals)
//   - "Personal and Group Pockets transactions" section = duplicates of internal moves (skip ENTIRELY)
//
// Returns array of: { date, description, amount, direction, isInternal, balance }
// Where amount is always positive; direction is 'out' or 'in'.
function parseRevolut(text) {
  if (!text) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results = [];

  // Determine where the main "Account transactions" section starts.
  // Anything BEFORE this header is either header noise OR the "Pending" section
  // (which we want to skip — those transactions will appear in main once settled).
  let mainStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^Account transactions from/i.test(lines[i])) {
      mainStart = i + 1;
      break;
    }
  }

  // Skip the entire "Personal and Group Pockets transactions" section.
  // It's a duplicate breakdown of internal pocket movements — would cause double counting.
  let mainEnd = lines.length;
  for (let i = mainStart; i < lines.length; i++) {
    if (/^Personal and Group Pockets transactions/i.test(lines[i])) {
      mainEnd = i;
      break;
    }
  }
  const workingLines = lines.slice(mainStart, mainEnd);

  // Match date-prefixed transaction lines: "1 Feb 2026", "29 Apr 2026", etc.
  const dateRegex = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(.+)/;
  const monthMap = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

  // Pattern to extract amounts from a line. Revolut format: €X.XX or €X,XXX.XX
  const amountRegex = /€([\d,]+\.\d{2})/g;

  for (let i = 0; i < workingLines.length; i++) {
    const line = workingLines[i];
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;

    const [, day, monStr, year, rest] = dateMatch;
    const monIdx = monthMap[monStr.toLowerCase()];
    if (monIdx === undefined) continue;
    const dateISO = `${year}-${String(monIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Extract amounts on this line. Last one is balance, prior ones are money out/in.
    const amtMatches = [...rest.matchAll(amountRegex)].map(m => parseFloat(m[1].replace(/,/g, '')));

    // Description = everything before the first €
    const firstEurIdx = rest.search(/€/);
    let description = (firstEurIdx >= 0 ? rest.slice(0, firstEurIdx) : rest).trim();

    if (amtMatches.length === 0) continue;

    // Look ahead for continuation lines (To: / From: / Reference: / Card:)
    let extraDetail = '';
    let counterpartyIs = ''; // 'To:' or 'From:'
    let j = i + 1;
    while (j < workingLines.length) {
      const next = workingLines[j];
      if (dateRegex.test(next)) break; // next transaction
      if (/^(To|From|Reference|Card|Fee|Revolut Rate):/i.test(next)) {
        const dirMatch = next.match(/^(To|From):\s*(.+)/i);
        if (dirMatch) {
          if (!counterpartyIs) counterpartyIs = dirMatch[1];
          extraDetail += ' ' + dirMatch[2].split(',')[0]; // first part of "To: Tesco Stores 3584, Dublin 9" = "Tesco Stores 3584"
        }
        j++;
        continue;
      }
      // Some Revolut continuation lines don't have a label (e.g. just "From: NAME, IBAN")
      // Stop when we hit something that looks like a new transaction or section header
      break;
    }

    // Determine direction.
    // Revolut layout: Money out | Money in | Balance — but column extraction may shuffle order.
    // Heuristic:
    //   - If 2 amounts: amounts are [money_out_or_in, balance] OR [money, balance]
    //   - If 3 amounts: rare, typically a fee line — take the first as primary amount
    // We use the description and counterparty hint to determine direction.

    let amount, balance, direction;
    if (amtMatches.length >= 2) {
      amount = amtMatches[0];
      balance = amtMatches[amtMatches.length - 1];
    } else {
      amount = amtMatches[0];
      balance = null;
    }

    // Direction detection rules (in priority order):
    // 1. "From:" (money in) vs "To:" (money out) — strongest signal
    // 2. Description keywords: "Payment from" / "Transfer from" / "top-up" → in; "Transfer to" / "withdrawal" → out
    // 3. Default: out (most transactions on a typical statement are outgoings)
    const descLower = description.toLowerCase();
    if (counterpartyIs === 'From') {
      direction = 'in';
    } else if (counterpartyIs === 'To') {
      direction = 'out';
    } else if (/^(payment from|transfer from|apple pay top-up|pocket withdrawal)/i.test(description) ||
               /^from\s/i.test(description)) {
      direction = 'in';
    } else if (/^(transfer to|to pocket|to john boyle|to social welfare|to adhd consult|cash withdrawal)/i.test(description)) {
      direction = 'out';
    } else {
      direction = 'out';
    }

    // Detect internal (pocket / own-account / vault transfers)
    const isInternal = /^(to pocket|pocket withdrawal|to john boyle|transfer to john boyle|from john boyle)/i.test(description);

    // Build clean description
    let cleanDesc = description;
    if (extraDetail.trim() && cleanDesc.length < 30) {
      cleanDesc = (cleanDesc + ' — ' + extraDetail.trim()).slice(0, 80);
    }

    results.push({
      date: dateISO,
      description: cleanDesc,
      amount: amount,
      direction: direction,
      isInternal: isInternal,
      balance: balance,
    });

    i = j - 1; // skip continuation lines we consumed
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// AIB PARSER — based on the official format published on aib.ie
// ═══════════════════════════════════════════════════════════════
// AIB statement format (official sample):
//   - Date format: "06 June 2012" (DD MonthName YYYY)
//   - Columns: Date | Details | Debit € | Credit € | Balance €
//   - Date may appear ONCE for a group of transactions underneath it
//     (so we track "current date" as we walk down lines)
//   - Common prefixes: POS, ATM, OP/, *INET, DD, EFT, S/O, CREDIT TRANSFER
//   - Overdrawn balances marked "dr" suffix (e.g. "189.50dr")
//   - "BALANCE FORWARD" headers and "INTEREST CHARGED" sections to handle
//
// Returns array of: { date, description, amount, direction, isInternal, balance }
function parseAIB(text) {
  if (!text) return [];
  let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results = [];

  // Detect end-of-statement footer sections we want to skip:
  // "Uncleared Lodgements", "Outstanding Lodgements", "Pending Items", etc.
  // These are not yet-settled transactions that will reappear in the next statement.
  let mainEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^(Uncleared|Outstanding|Pending)\s+(Lodgement|Item|Transaction|Payment)s?\b/i.test(lines[i])) {
      mainEnd = i;
      break;
    }
  }
  lines = lines.slice(0, mainEnd);

  // Date pattern: "06 June 2012" / "21 June 2012" / "5 December 2024"
  const dateRegex = /^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i;
  const monthMap = {
    january:0, february:1, march:2, april:3, may:4, june:5,
    july:6, august:7, september:8, october:9, november:10, december:11
  };

  // Amount pattern: matches "40.00", "1,150.00", "189.50dr" (overdrawn)
  // We capture the amount and whether it has the 'dr' suffix
  const amountRegex = /([\d,]+\.\d{2})(dr)?/g;

  // Lines we want to skip — header/footer noise that contains amounts but isn't a transaction
  const skipPatterns = [
    /^BALANCE\s+FORWARD/i,
    /^INTEREST\s+(RATE|CHARGED)/i,
    /^Lending\s+@/i,
    /^\(?INCL\.\s+SURCHARGE/i,
    /^Surcharges/i,
    /^Authorised\s+Limit/i,
    /^IBAN[:\s]/i,
    /^BIC[:\s]/i,
    /^Statement\s+of/i,
    /^Account\s+(Name|Number|Fees)/i,
    /^Branch$/i,
    /^Date\s+Details/i,
    /^Page\s+Number/i,
    /^Telephone/i,
    /^National\s+Sort/i,
    /^Mr\.?\s+|^Ms\.?\s+|^Mrs\.?\s+|^Miss\s+/,
    /^Allied\s+Irish\s+Banks/i,
    /^For\s+Important\s+Information/i,
    /^Thank\s+you/i,
    /^www\.aib\.ie/i,
    /^Add\s+more\s+green/i,
    /^Switch\s+to\s+eStatements/i,
    /^Terms\s+and\s+Conditions/i,
    /^through\s+our\s+Internet/i,
    /^banking\.$/i,
    /^service\s+on/i,
  ];

  let currentDate = null; // sticky — AIB groups txns under one date

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Detect header skips
    if (skipPatterns.some(p => p.test(line))) continue;

    // Detect a date prefix
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      const [, day, monStr, year] = dateMatch;
      const monIdx = monthMap[monStr.toLowerCase()];
      if (monIdx !== undefined) {
        currentDate = `${year}-${String(monIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      // Strip the date prefix off the line for processing the rest
      line = line.replace(dateRegex, '').trim();
      // Skip if nothing left (date was on its own line)
      if (!line) continue;
      // Skip if remaining is just header text (BALANCE FORWARD)
      if (skipPatterns.some(p => p.test(line))) continue;
    }

    // Without a current date we can't make a transaction
    if (!currentDate) continue;

    // Extract amounts. AIB has up to 3 amounts per line: debit, credit, balance.
    // The columns are POSITIONAL in the original PDF but pdf.js flattens to text.
    // Heuristic for column inference:
    //   - 1 amount: it's either debit OR credit (need direction from description)
    //   - 2 amounts: usually [transaction_amount, balance]
    //   - 3 amounts: [debit, credit, balance] OR multi-merge
    const amtMatches = [...line.matchAll(amountRegex)].map(m => ({
      value: parseFloat(m[1].replace(/,/g, '')),
      isOverdrawn: !!m[2],
      raw: m[0],
      index: m.index,
    }));

    if (amtMatches.length === 0) continue;

    // Description = part of line BEFORE the first amount
    const firstAmtIdx = amtMatches[0].index;
    let description = line.slice(0, firstAmtIdx).trim();

    // Filter out very short / empty descriptions
    if (description.length < 2) continue;

    // Direction detection from description prefixes
    const descUpper = description.toUpperCase();
    let direction = null;

    // Outgoings (debits) — definitive signals
    const debitMarkers = ['POS ', 'ATM ', 'OP/', '*INET', 'DD ', 'S/O ', 'D/D ', 'OP ', 'STANDING ORDER', 'DIRECT DEBIT', 'WITHDRAWAL', 'PAYMENT TO', 'TRANSFER TO', 'INTEREST CHARGED', 'FEE', 'CHARGE'];
    // Incomings (credits) — definitive signals
    const creditMarkers = ['EFT ', 'CREDIT TRANSFER', 'LODGEMENT', 'LODGMENT', 'SALARY', 'DSFA', 'TRANSFER FROM', 'PAYMENT FROM', 'REFUND', 'CB EFT', 'WAGES', 'BENEFIT'];

    if (debitMarkers.some(m => descUpper.startsWith(m) || descUpper.includes(' ' + m.trim() + ' '))) {
      direction = 'out';
    } else if (creditMarkers.some(m => descUpper.startsWith(m) || descUpper.includes(' ' + m.trim() + ' ') || descUpper.endsWith(' ' + m.trim()))) {
      direction = 'in';
    }
    const hadMarker = direction !== null;

    let amount, balance, balanceIsOverdrawn = false;
    if (amtMatches.length === 1) {
      // Single amount on the line — could be debit OR credit, depend on direction guess
      amount = amtMatches[0].value;
      balance = null;
    } else if (amtMatches.length === 2) {
      // Most common: [txn_amount, balance]
      amount = amtMatches[0].value;
      balance = amtMatches[1].value;
      balanceIsOverdrawn = amtMatches[1].isOverdrawn;
    } else {
      // 3+ amounts: [debit, credit, balance] columnar layout
      // The non-zero one of [0] / [1] is the actual amount
      const a0 = amtMatches[0].value;
      const a1 = amtMatches[1].value;
      const lastAmt = amtMatches[amtMatches.length - 1];
      balance = lastAmt.value;
      balanceIsOverdrawn = lastAmt.isOverdrawn;
      // If both first two are non-zero we can't tell — fall back to first
      if (a0 > 0 && a1 === 0) {
        amount = a0;
        // Position-based: first amount column = debit
        if (!direction) direction = 'out';
      } else if (a0 === 0 && a1 > 0) {
        amount = a1;
        if (!direction) direction = 'in';
      } else {
        amount = a0;
      }
    }

    // If direction still unknown, use heuristic fallback:
    // most personal current account transactions are outgoings
    if (!direction) direction = 'out';

    // Normalize description — strip the prefix codes for cleaner display
    let cleanDesc = description
      .replace(/^POS\s+/i, '')
      .replace(/^ATM\s+/i, 'ATM — ')
      .replace(/^OP\/\s*/i, '')
      .replace(/^OP\s+/i, '')
      .replace(/^\*INET\s+/i, 'Internet — ')
      .replace(/^DD\s+/i, '')
      .replace(/^D\/D\s+/i, '')
      .replace(/^S\/O\s+/i, '')
      .replace(/^EFT\s+/i, '')
      .replace(/^CREDIT TRANSFER\s*/i, 'Credit Transfer')
      .trim();

    if (cleanDesc.length === 0) cleanDesc = description;

    // Detect internal-account transfers (similar to Revolut pockets)
    const isInternal = /TO\s+SAVINGS|FROM\s+SAVINGS|INTERNAL\s+TRANSFER|TO\s+OWN\s+ACCOUNT/i.test(description);

    results.push({
      date: currentDate,
      description: cleanDesc,
      amount: amount,
      direction: direction,
      isInternal: isInternal,
      balance: balance !== null && balanceIsOverdrawn ? -balance : balance,
      _hadStrongMarker: hadMarker,
    });
  }

  // ─── BALANCE RECONCILIATION PASS ─────────────────────────────
  // pdf.js flattens columnar PDFs into linear text, so "Salary 2500" and
  // "POS Tesco 40" look identical structurally. We use the running balance
  // to retroactively fix direction.
  //
  // AIB groups multiple transactions under one balance line, so we collect
  // all transactions between balance points and check the GROUP delta.
  // If the group total signs don't reconcile, we look for ambiguous-direction
  // entries (those without explicit credit/debit markers) and try flipping them.

  let prevBalance = null;
  let groupStart = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.balance === null) continue;

    // Compute expected delta = current_balance - prev_balance
    if (prevBalance !== null) {
      const groupRows = results.slice(groupStart, i + 1);
      const expectedDelta = r.balance - prevBalance;

      // Compute current group delta from our direction guesses
      let computedDelta = 0;
      for (const gr of groupRows) {
        computedDelta += (gr.direction === 'in' ? gr.amount : -gr.amount);
      }

      // If group reconciles, we're good. Otherwise try flipping ambiguous rows.
      if (Math.abs(computedDelta - expectedDelta) > 0.05) {
        // Order rows for flipping: ambiguous (no strong marker) first,
        // and within those LARGEST first (a single big mis-classification is more
        // likely than many small ones — e.g. salary buried in a list of POS txns)
        const tryOrder = groupRows
          .map((gr, idx) => ({ idx: groupStart + idx, gr }))
          .sort((a, b) => {
            // Strong markers go last
            const aStrong = a.gr._hadStrongMarker ? 1 : 0;
            const bStrong = b.gr._hadStrongMarker ? 1 : 0;
            if (aStrong !== bStrong) return aStrong - bStrong;
            // Within same priority, larger amounts first
            return b.gr.amount - a.gr.amount;
          });

        for (const { idx, gr } of tryOrder) {
          const flipped = gr.direction === 'in' ? 'out' : 'in';
          const newComputedDelta = computedDelta - (gr.direction === 'in' ? gr.amount : -gr.amount) + (flipped === 'in' ? gr.amount : -gr.amount);
          if (Math.abs(newComputedDelta - expectedDelta) < Math.abs(computedDelta - expectedDelta)) {
            results[idx].direction = flipped;
            computedDelta = newComputedDelta;
            if (Math.abs(computedDelta - expectedDelta) < 0.05) break;
          }
        }
      }

      groupStart = i + 1;
    } else {
      groupStart = i + 1;
    }
    prevBalance = r.balance;
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// STATEMENT METADATA EXTRACTION
// ═══════════════════════════════════════════════════════════════
// Extract metadata from PDF text: opening balance, closing balance,
// period start, period end, account-level totals if present.
// Returns null fields where we can't find a value.
function extractStatementMeta(text, bank) {
  const meta = {
    bank,
    periodStart: null,
    periodEnd: null,
    openingBalance: null,
    closingBalance: null,
    declaredMoneyOut: null,
    declaredMoneyIn: null,
  };
  if (!text) return meta;

  // ─── REVOLUT METADATA ─────────────────────────────────────────
  if (bank === 'revolut') {
    // "from 1 February 2026 to 29 April 2026"
    const periodMatch = text.match(/from\s+(\d{1,2}\s+\w+\s+\d{4})\s+to\s+(\d{1,2}\s+\w+\s+\d{4})/i);
    if (periodMatch) {
      meta.periodStart = parseDateString(periodMatch[1]);
      meta.periodEnd = parseDateString(periodMatch[2]);
    }
    // Balance summary table — find the "Account (Current Account)" row OR the "Total" row
    // Format: "Account (Current Account) €246.43 €7,280.71 €7,227.68 €193.40"
    const accountRow = text.match(/Account\s*\(Current Account\)\s+€([\d,]+\.\d{2})\s+€([\d,]+\.\d{2})\s+€([\d,]+\.\d{2})\s+€([\d,]+\.\d{2})/i);
    if (accountRow) {
      meta.openingBalance = parseFloat(accountRow[1].replace(/,/g, ''));
      meta.declaredMoneyOut = parseFloat(accountRow[2].replace(/,/g, ''));
      meta.declaredMoneyIn = parseFloat(accountRow[3].replace(/,/g, ''));
      meta.closingBalance = parseFloat(accountRow[4].replace(/,/g, ''));
    }
  }

  // ─── AIB METADATA ─────────────────────────────────────────────
  if (bank === 'aib') {
    // "Date of Statement 21 June 2012" — single date statements; period is implicit
    // BALANCE FORWARD line gives opening; last balance in last transaction is closing
    const balanceForward = text.match(/(\d{1,2}\s+\w+\s+\d{4})\s+BALANCE\s+FORWARD\s+([\d,]+\.\d{2})(dr)?/i);
    if (balanceForward) {
      meta.periodStart = parseDateString(balanceForward[1]);
      meta.openingBalance = (balanceForward[3] ? -1 : 1) * parseFloat(balanceForward[2].replace(/,/g, ''));
    }
    // Date of Statement
    const dateOfStatement = text.match(/Date\s+of\s+Statement\s+(\d{1,2}\s+\w+\s+\d{4})/i);
    if (dateOfStatement) {
      meta.periodEnd = parseDateString(dateOfStatement[1]);
    }
    // AIB doesn't typically print declared money out/in totals in the same way Revolut does
  }

  // ─── BOI METADATA (best-effort, not yet structurally parsed) ─
  if (bank === 'boi') {
    const periodMatch = text.match(/(\d{1,2}\s+\w+\s+\d{4})\s+to\s+(\d{1,2}\s+\w+\s+\d{4})/i);
    if (periodMatch) {
      meta.periodStart = parseDateString(periodMatch[1]);
      meta.periodEnd = parseDateString(periodMatch[2]);
    }
  }

  return meta;
}

// Helper: parse "1 February 2026" or "21 June 2012" into ISO YYYY-MM-DD
function parseDateString(s) {
  if (!s) return null;
  const months = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,
                   jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const m = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  const monIdx = months[m[2].toLowerCase()];
  if (monIdx === undefined) return null;
  return `${m[3]}-${String(monIdx + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════
// PARSE VALIDATION
// ═══════════════════════════════════════════════════════════════
// Three independent checks. Returns confidence + list of issues.
//   - 'high':   all checks pass cleanly
//   - 'medium': at least one check failed but result is still usable
//   - 'low':    serious mismatch — recommend retrying with a different parser
function validateParse(structuredRows, meta) {
  const issues = [];
  let confidence = 'high';

  if (!Array.isArray(structuredRows) || structuredRows.length === 0) {
    return { confidence: 'low', issues: ['Parser returned no transactions.'], stats: {} };
  }

  // Compute parsed totals (excluding internal transfers — those are noise)
  const visible = structuredRows.filter(r => !r.isInternal);
  let parsedOut = 0, parsedIn = 0;
  for (const r of visible) {
    if (r.direction === 'out') parsedOut += r.amount;
    else parsedIn += r.amount;
  }
  parsedOut = Math.round(parsedOut * 100) / 100;
  parsedIn = Math.round(parsedIn * 100) / 100;

  // ─── CHECK 1: BALANCE RECONCILIATION ─────────────────────────
  let reconciled = null;
  if (meta.openingBalance !== null && meta.closingBalance !== null) {
    const expectedDelta = meta.closingBalance - meta.openingBalance;
    const computedDelta = parsedIn - parsedOut;
    const drift = Math.abs(expectedDelta - computedDelta);
    reconciled = drift < 1.0; // allow €1 rounding tolerance
    if (!reconciled) {
      // If we have declared totals from the statement, compare against those instead — more precise
      if (meta.declaredMoneyOut !== null && meta.declaredMoneyIn !== null) {
        const outDrift = Math.abs(meta.declaredMoneyOut - parsedOut);
        const inDrift = Math.abs(meta.declaredMoneyIn - parsedIn);
        if (outDrift > 5.0 || inDrift > 5.0) {
          confidence = 'low';
          issues.push(`Money out drift €${outDrift.toFixed(2)} (declared €${meta.declaredMoneyOut}, parsed €${parsedOut}). Money in drift €${inDrift.toFixed(2)} (declared €${meta.declaredMoneyIn}, parsed €${parsedIn}).`);
        } else if (outDrift > 1.0 || inDrift > 1.0) {
          if (confidence === 'high') confidence = 'medium';
          issues.push(`Minor drift on totals: money out €${outDrift.toFixed(2)}, money in €${inDrift.toFixed(2)}.`);
        }
      } else {
        // Only have opening + closing balances
        if (drift > 50) {
          confidence = 'low';
          issues.push(`Balance drift €${drift.toFixed(2)} (expected delta €${expectedDelta.toFixed(2)}, parsed delta €${computedDelta.toFixed(2)}).`);
        } else if (drift > 5) {
          if (confidence === 'high') confidence = 'medium';
          issues.push(`Small balance drift €${drift.toFixed(2)}.`);
        }
      }
    }
  }

  // ─── CHECK 2: TRANSACTION COUNT SANITY ───────────────────────
  // If we have a period, scale expected count.
  // Typical Irish current account: ~30-150 txns/month.
  let expectedRange = null;
  if (meta.periodStart && meta.periodEnd) {
    const start = new Date(meta.periodStart);
    const end = new Date(meta.periodEnd);
    const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
    // ~1-5 visible txns per day is normal
    expectedRange = { min: Math.max(1, Math.floor(days * 0.3)), max: Math.ceil(days * 8) };
  } else {
    expectedRange = { min: 1, max: 1000 };
  }
  if (visible.length < expectedRange.min) {
    confidence = 'low';
    issues.push(`Only ${visible.length} transactions parsed (expected at least ${expectedRange.min}).`);
  } else if (visible.length > expectedRange.max) {
    if (confidence === 'high') confidence = 'medium';
    issues.push(`${visible.length} transactions parsed — higher than typical (expected up to ${expectedRange.max}). Possible duplicates.`);
  }

  // ─── CHECK 3: DATE RANGE SANITY ──────────────────────────────
  if (meta.periodStart && meta.periodEnd) {
    const dates = visible.map(r => r.date).filter(d => d).sort();
    if (dates.length > 0) {
      const earliest = dates[0];
      const latest = dates[dates.length - 1];
      // Allow 2 days slack on each side (statements sometimes include settlement-day spillover)
      const startOk = earliest >= dateAddDays(meta.periodStart, -2);
      const endOk = latest <= dateAddDays(meta.periodEnd, 2);
      if (!startOk || !endOk) {
        if (confidence === 'high') confidence = 'medium';
        issues.push(`Some transactions fall outside statement period (${meta.periodStart} to ${meta.periodEnd}). Earliest: ${earliest}, latest: ${latest}.`);
      }
    }
  }

  // ─── CHECK 4: SALARY/INCOME PRESENCE (advisory only) ─────────
  // Most statements have at least one credit. If zero credits found, that's suspicious.
  const incomingCount = visible.filter(r => r.direction === 'in').length;
  if (incomingCount === 0 && visible.length > 10) {
    if (confidence === 'high') confidence = 'medium';
    issues.push('No incoming transactions detected — verify direction parsing.');
  }

  return {
    confidence,
    issues,
    stats: {
      visibleCount: visible.length,
      internalCount: structuredRows.length - visible.length,
      parsedOut,
      parsedIn,
      reconciled,
      expectedRange,
    },
  };
}

// Helper: add days to an ISO date string
function dateAddDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════
// CONVERT structured rows -> the legacy {date, description, amount} format
// the frontend expects. Negative amount = outgoing.
// ═══════════════════════════════════════════════════════════════
function structuredToLegacyRows(structured, opts = {}) {
  const includeInternal = opts.includeInternal === true;
  return structured
    .filter(r => includeInternal || !r.isInternal)
    .map(r => ({
      date: r.date,
      description: r.description,
      amount: String(r.direction === 'out' ? -Math.abs(r.amount) : Math.abs(r.amount)),
    }));
}

// ── PDF PARSE ENDPOINT ──
const PDF_PARSE_PROMPT = `You are a bank statement parser. The user will give you raw text extracted from a bank statement PDF.
Your job is to find every transaction and return them as a JSON array.
IMPORTANT: PTSB/Permanent TSB bank PDFs use custom font encoding so text appears garbled. Use this decoding table:
MONTH PREFIXES (first token on each transaction line):
"[ +" = Jan, "ãáâ" = Feb, "( ê" = Mar, " &ê" = Apr, "( ß" = May, "[í+" = Jun, "[í<" = Jul, " íå" = Aug, "ëá&" = Sep, "!ÄÈ" = Oct, "+?Î" = Nov, "àÁÄ" = Dec
TRANSACTION TYPE CODES (second token):
"è.+" or "è/+" = T/F (bank transfer)
"î&&" or "î &" = VPP (Visa card payment)
"&!ë" = POS (contactless/card)
"ñäè" = ICT (incoming credit transfer)
"àà" or "ä+ä" = DD (direct debit)
"åâ&" = GBP (UK payment)
"íëà" = USD (US payment)
"êÈÀ" = RTD (return/refund)
"äè" = CT (credit transfer)
" è(" = ATM (cash withdrawal)
"äè ëáè +è" = CT Settlement/Transmissions
MERCHANT DECODING TABLE (match these patterns in the Details column):
"èáëä! ëè!êáë" = Tesco Stores
"êÁÎ?%ÍÈ" = Revolut
"àá<ñîáê!!" = Deliveroo
"& ààß &!ïáê" = Paddy Power
"äñêä<á . êñä" = Circle K Richmond
"äñêä<á . <!ï" = Circle K Law
"äñêä<á . ïáë" = Circle K Wes
"äñêä<á . [í+" = Circle K Jun
"äñêä<á . (  " = Circle K M
"äñêä<á ." = Circle K
"(ää âáë &ç ê" = McDonald's
"[ÍËÈ á/È ñÊÁ" = Just Eat Ireland
"ëäêñââ<áë" = Scramblers
"!âêñá+ë ç +à" = O'Briens
"ãêáá+!ï" = Freshway
" &&<áä!(âñ" = Apple.com
" &&<áåêáá+ (" = AppleGreen
" &&<á ëè!êá" = Apple Store
"ëè/êâíä.ë" = Starbucks
"(Äå?Ï/>Ë" = McGowan's
"(å&îÑ>ÈÁÀ" = MGP Vinted
" <àñ ëè!êáë" = Aldi Stores
"<ñà< ñêá< +à" = Lidl Ireland
"+áèã<ñì ñ+èá" = Netflix
"(ÑÄÊ?Ë?ÃÈ" = Microsoft/Xbox
"áì&êáëëî&+ä" = ExpressVPN
"íâáê  á è" = Uber Eats
"íâáê è.+" = Uber Trip
"âñ+ +äáä!(" = Bun n Cheese
"ë& ê à (á ëè" = Spar Drumcondra
"èçá ñ+èáê+ è" = The Internet Cafe
"à ß âêá ." = Daybreak
"(í<<ñå +ë &í" = Mulligans Pub
"ñ>Ë?_>Ñ/ àÊÍ" = Insomnia Drumcondra
"!ÎÁÊÀÊ ãÈ ãÁÁ" = Overdraft Fee
"ñêñëç ê ñ< ç" = Irish Rail
"(ÑÄÊ?Ë?ÃÈ" = Microsoft
"àÁÄ/ÈÇ%?> !Ä" = Decathlon
"èçêáá ñêá< +à" = Three Ireland
"àà â!êà å ñë áñêá ++" = DD Bord Gais Eireann
"àà îñêåñ+ (áàñ  ñêá< +à" = DD Virgin Media Ireland
"ñäè [!ç+ â!ß<á" = ICT John Boyle (income)
"çá<á+ â!ß<á [[" = Helen Boyle (transfer)
"[ÍËÈ á/È ñÊÁ" = Just Eat Ireland
" è( àÍÂ%Ñ>" = ATM Dublin
"äè ëáè +è  èê +ë(ñëëñ!+ë" = CT Set NT Transmissions
"çá<á+ â!ß<á [[" = Helen Boyle
"&á++áßë ( êß" = Penneys Primark
"âíêåáê .ñ+å" = Burger King
"èçá ëè åë çá" = The Stags Head
"èçá [ ê" = The Jar
"ëè êâíä.ë" = Starbucks
"(äà!+ <àë" = McDonalds
"ëí&áêàêíå ëè" = Superdrug
"&á++áßë ! ä!" = Penneys OC
"<ñëâ!" = Lisbon
"â!!ç!!ä!( í" = Booking.com
"ï ïç!ëèá<ï!ê<à" = WWW Hostelworld
"éí/ÊÈÁÊ%ß ñ+ÈÁÊÁËÈ" = Quarterly Interest
"áààñá ê!ä.áè" = Eddie Rockets
"èçá â< ä. âí" = The Black Bull
" è( åê ãè!+ ëèêáá" = ATM Grafton Street
"è??å??Àè?å" = Too Good To Go
"<<!ßàë&ç ê(" = Lloyds Pharmacy
" (]+&ÊÑ_Á àá" = Amazon Prime De
" ( ]!+ &êñ(á" = Amazon Prime
"&áèëè!&" = Petstop
"ä ãá á+ ëáñ+" = Cafe en Seine
"äñ+áï!ê<à" = Cineworld
"ëí(í& ëèá&" = Sumup Steak
"ëí(í& è ìñ" = Sumup Taxi
"ëí(í& &çñ<" = Sumup Phil
"ëí(í& å <" = Sumup GL
"ëí(í& èçá" = Sumup The
"ëé  âë!<íèá" = Sq Absolute Gym
"ëé èê äáë" = Sq Trades
"ëé î &áîá+à" = Sq V Weekend
"ëé &!à ãáëè" = Sq Pod Festival
"ëé ñèë !íê" = Sq Its Our
"ëé & ï+ ëç!" = Sq Win Sho
"& ê.ë &ç ê(" = Arks Pharmacy
"äá+èê  à (á" = Centre Dame St
"äá+èê  àêí(ä" = Centre Drumcondra
"äá+èê  à!êëá" = Centre Dorset St
"äá+èê  ïáëè(!" = Centre Westmoreland
"ëÄÑÊÁÈÈÁ" = Ecigarette
"&ßå( <ñ!+ &í" = Pygmalion Pub
".ñ+å +íèêñèñ" = King Nutrition
"èçá çá <èç ë" = The Health Store
"è??å??Àè?å" = Too Good To Go
"ã< + å +ë êá" = Flannagans Restaurant
"ëè åë çá à" = Stags Head Dublin
"èÇÁ â +.áêë" = The Bankers
"(ñà+ñåçè áìø" = Midnight Express
"ëÄÊÑÂÂ%ÁÊ" = Scramblers
"ëé ë( (ä.]ß" = Sq SM McKby
"ãñââáê ( åáá" = Fibber Magees
"ï/?ÀÑÁË" = Woodies
"â!!ç!!ä!( í" = Booking.com
"åÑ+ & < äá" = Gun and Castle
"& ààß &!ïáê" = Paddy Power
"ã?Ê_ÁÊ%ß" = Formerly
"êáëñàá+è  àî" = Resident Adv
"ñ+ëñà+ñ  àêí" = Insomnia Dru
"èçá â ä. & å" = The Back Page
"& àà<á+áè" = P Addlenet (PayPal)
"äí++áë çá+êß" = Dunnes Henry St
"<!èëë ä ãá â" = Lotts Cafe Bar
"ã< ñåçè ä<íâ" = Flight Club
"èçá <ñîñ+å ê" = The Living Room
"åê! ê.áë äá+" = Groanrkes Denny
"î .áç!áë" = V Kehoes
"èçá ï!ê.( +ë" = The Workmans
"äê!.á & ê. ë" = Croke Park
"èçá å èá +áï" = The Gate New
"ïñåï (" = Wigwam Bar
"êñîáê â ê" = River Bar
" ++áë â ê" = Annes Bar
"ëî .ñ<( ñ+ç" = SV Kilm Inch
"èçá âíèè!+ ã" = The Button Factory
"&!à ãáëèñî <" = Pod Festival
"äê!.á & ê. ë" = Croke Park
"(äåê èè +ë ê" = McGrotty ns
"â< ä. âí<< ñ" = Blackbird
"ëé èçá âñå" = Sq The Bug
"ëé & ï+ ëç!" = Sq Win Sho
"çáàñå +ë èçá" = Hedigan The
"ïïï ( ]!+" = WWW MJON
"& ê.ë &ç ê(" = Arks Pharmacy
"(äà!+ <àë" = McDonalds
"ä/ËÇ á/Ê>ÁÀ" = Cash Earned
"àÁÂÑÈ ä/ÊÀ äÇ/ÊÅÁ" = Debit Card Charge
"êÈÀ àÑÊÁÄÈ àÁÂÑÈ" = Direct Debit Refund
"áíê!ë& ê ã ñ" = EuroSpar
"áíê!ë& ê ç +" = EuroSpar North
"ëé âë!<íèá" = Sq Absolute Gym
" äè ñêñëç <ñãá çá <èç" = CT Irish Life Health
"äè ä?>ÎÁÊ/ í. <ÈÀ" = CT Convera UK Ltd
"ï??ÀÑÁË  ÑÊë" = Woodies IRS
"(/Ç/ÊÅ á>ÈÁÊ" = Maharaj
"<!íåç !ïá< !" = Lough Owel
"èÊÑÂÁ ã??À ä" = Tribe Food Co
"ëé ê!!ëèáêë" = Sq Roosters Barber
"! êáñ<<ßë ë" = O Reillys
"!<à ëäç!!<ç!" = Old Schoolhouse
"àÁÄ/ÈÇ%?> â/" = Decathlon
"(Á_/Ë" = Memas Cafe
"ãÊ/>ÄÑë ?¦?" = Francois Restaurant
"áë&ñêá < âë" = Espire Labs
"ã<ÑÅÇÈ ä<ÍÂ" = Flight Club
"èÇÁ äÊ?ËË" = The Cross
"â??ÈÇ?Ä?_ í" = Boohoo
"ãñââáê ( åáá" = Fibber Magees
"ëÄÊÑÂÂ%ÁÊ" = Scramblers
"ëÄÑÊÁÈÈÁ" = Ecigarette
"çáàñå +ë èçá" = Hedigan The
"&ñáêäá ! è!!<á âñ<<ë" = Pierce OToole Bills
"ïáèáêëè!+áë" = Waterstones
" âê .áâ âê" = ABR Web BR
"èçá ä è  +à" = The Cat And Dog
" ëç  ä<!èçñ+" = Asos Clothing
"èçá âíèè!+ ã" = The Button Factory
"éí/ÊÈÁÊ%ß ñ+ÈÁÊÁËÈ" = Quarterly Interest
"(/Ê éÍ/ÊÈÁÊ%ß ñ+ÈÁÊÁËÈ" = Mar Quarterly Interest
"[í+ éÍ/ÊÈÁÊ%ß ñ+ÈÁÊÁËÈ" = Jun Quarterly Interest
"ëé &!à ãáëè" = Sq Pod Fest
"ëé èçá äá<è" = Sq The Delta
"åñ+ & < äá" = Gun and Castle
"( äá ê çá+ß" = McDermott Kenny
"( äá àêí(ä!+" = McDermott Drumcondra
"( äá âáèèßëè" = McDermott Bettystown
"( äá ë +àß(!" = McDermott Sandy
"ë& ê è <â!è" = Spar Talbot St
"ë& ê +!êèç ë" = Spar North Side
"ë& ê ä!<<áåá" = Spar College
"ë& ê ! ä!++á" = Spar OConnell
"ë& ê ç!<<ßïá" = Spar Hollywell
"ë& ê (áêêñ!+" = Spar Merrion
"âíë ëè!&  å" = Bus Stop
"à!(ñ+ñäë è" = Dominics T
"à!(ñ+ñäë &ñ]]" = Dominos Pizza
"à!(ñ+!ë &ñ]" = Dominos Pizza
"<ñà< ñê" = Lidl
"ëÑÅ> Íø" = Sign Up
"ñ+áè  ãÊ" = INET FR
"ëá& è!" = Sep TO
"ëá& [[ â!ß<á  ñâ" = Sep JJ Boyle IB
"ëá& çá<á+ â!ß<á [[" = Sep Helen Boyle
"( ß çá<á+ â!ß<á [[" = May Helen Boyle
" &ê <íä ! êñ à  êá+è" = Apr Luc O Ri Rent
"( ß <íä ! êñ à  êá+è" = May Luc O Ri Rent
"[í+ <íä ! êñ à  êá+è" = Jun Luc O Ri Rent
"<íä ! êñ à  àá&!ëñ" = Luc O Ri D Deposit
"<íä ! êñ à  êá+è" = Luc O Ri Rent
"!äè  è( àÍÂ%Ñ>" = Oct ATM Dublin
" è( ä< êáç <<" = ATM Clare Hall
" è( àíâ !ä!++á<<" = ATM OConnell
" è( ä! (á èç" = ATM Comerath
" è( <!íèç" = ATM Louth
" è( àê!åçáà" = ATM Drogheda
" è( àÍÂ<ÑÂ" = ATM Dublin B
" è( ä< êáç <<" = ATM Clare Hall
" è( åê ãè!+ëëâ(ñèç ëè" = ATM Grafton Smith St
" è( (ñëáêñä!êàñ" = ATM Misericordia
" è( <ñëâ!" = ATM Lisbon
" è( <ÑËÂ?/" = ATM Lisbon
"äè ñêñëç <ñãá çá <èç" = CT Irish Life Health
"ñäè [?Ç> â?X%Á" = ICT John Boyle
"ñäè [!ç+ â!ß<á" = ICT John Boyle
"çá<á+ â!ß<á [[" = Helen Boyle
"äè á< ñ+á â!ß<á äí++ñ+åç" = CT Eline Boyle Cunningh
"&ñáêäá ! è!!<á âñ<<ë" = Pierce OToole Bills
"ëá& <íä !êñ à  êá+è" = Sep Luc O Ri Rent
"!äè <íä ! êñ à  êá+è" = Oct Luc O Ri Rent
" íå  è( àíâ<ñ+" = Aug ATM Dublin
"ëáè/ +è  ä!(" = Setanta (income)
"ëáè +è  ä!( ñêá< +à" = Setanta Com Ireland
"èÇÁ &ÇÁ/Ë/>È" = The Pleasant
"ãñìñèí" = Fixitu
"å ä!(" = GACOM
"ïÑÌÄ?_" = Wix.com
"(ä.  ê( åç" = McK Arm GH
"íêâ +!íèãñèè" = URB Noutfitt
"ãâ& ß èÇÁ(" = GBP Y Them
"åÁÊ/ÊÀë ä/_ø" = Gerards Camp
"ë& ê  í&&áê" = Spar Upper
"àá<ñîáê!!ñá" = Deliveroo IE
"ë(ßèçëè!ßëä" = Smythstoys
"!ãã âá è à!+" = Off Beat Don
"äá+èê  ïáëè(" = Centre Westm
"êáî![!ç+â!ß" = Revolut John Boyle
"!êñá+è < & +" = Orient La P
"ë& ê ä!<<áåá" = Spar College
"ã ]ñ +ß" = F Qi NY
"àá& êè(á+è !ã ë!äñ" = Department of Social
"ë& ê (!í+è[!" = Spar Mountjoy
"ë& ê    " = Spar
"â!!èë êáè ñ<" = Boots Retail
"(ÑÄÊ?Ë?ÃÈëÈ" = Microsoft ST
" à!âá  äê!&ê" = Adobe Cropro
"&ç!á+ñì & ê." = Phoenix Park
"àí++ñ+åç ( â" = Cunningham MB
"àíê+ñ+åç ( â" = Cunningham MB
"<í ë èê +ëàá" = Luas Transdev
"åá!åíáëëê    " = Geoguessrr
"åá!åíáëëê" = Geoguessrr
"åá!åíáëëê &ê" = Geoguessrr PR
"ä< ëëñä êáèê" = Classic Retro
"â!àí(ä!(" = Bodumcom
"ëèê +à (áàñä" = Strand Medical
"à +ñá<    " = Daniel
"åêñ!<< àç á   " = Grill DHA E
"(!í+è[!ß ëè" = Mountjoy St
"ïïï ë!ëä!(" = WWW Soscom
"ãêáá+!ïë    " = Freshway S
"ãêáá+!ïíë   " = Freshway US
"ç êîáß +!ê(  " = Harvey Norm
"å!!å<á ß?Íè  " = Google Yout
"ï!. !+ ñ++  " = Wok On Inn
"äíê+ñ+åç ( â" = Cunningham MB
"äíêêßë    " = Currys
"äíêêßë" = Currys
"äá+èê < .áß" = Centre Lakey
"å <  à!êëáè" = GA Dorset
"( ê.ë  ë&á+" = M RKS Spencer
"êáî![!ç+â!ß" = Revolut JB
"ãêáá+!ïíë" = Freshway US
"ë& ê äçêñëèä" = Spar Christch
"&Ç?>Á  ß?Í" = Phone You
"(ñäê!ë!ãèìâ" = Microsoftb
"ëèêâíä.ë +!" = Starbucks No
"ÊÑ?Ë/ ä?ÃÃÁ" = Rosa Coffee
"+ß âàë îÁ>À" = NB Bds Vend
"èÇÁ ä?ÈÈ/ÅÁ" = The Cottage
"&ñå  +à çáñã" = Pig and Heifer
"äç ê<ñá äç &" = Charlie Chawke
"ëí&áêî <í ê" = Supervalu
"ëí&áêî <í ä<" = Supervalu DL
"âÊ/_Â%ÁË" = Brambles
"&á++áßë àí+" = Penneys Dundrum
"äñêä<á . äá+" = Circle K
"ñêñëç ê ñ< è" = Irish Rail
"ñêñëç ê ñ< <" = Irish Rail
"ñêñëç ê ñ<" = Irish Rail
"ñêñëç ê ñ< ä" = Irish Rail
"âÁÁÇÑÎÁ äÊ/Ã" = Beehive Craft Beer
"ï èáêëè!+áë" = Waterstones
"(ÑÄÊ?Ë?ÃÈá" = Microsoft
"ëèê +à (áàñä" = Strand Medical
"ëè ä.ë &ç ê" = Stacks Pharmacy
" êå!ë àê!åçá" = Argos Drogheda
".ãä àê!åçáà" = KFC Drogheda
"âñë!+ â ê" = Buston Bar
"ë<á(!+ë ëí&á" = Slemons Supervalue
"á[ .ñ+åë" = EJ Kings
"& èë ëí&áê(" = Pets Supermarket
"(Ê ê?ÄÄ?Ë è" = Mr Rodds
"& èë äá+èê" = Pets Centre
"ãêáá+!ïâ(." = Freshway BMH
"ãêáá+!ïâì<" = Freshway BXL
"ãêáá+!ïä é" = Freshway DQ
"ãêáá+!ïä î" = Freshway DV
"ãêáá+!ïä(è" = Freshway DMT
"ãêáá+!ïç<â" = Freshway HLB
" &&<áåêáá+ ä" = AppleGreen D
"äá+èê  éíñä." = Centre Quick
" ñ<<ïáá ä îá" = Illweed
"âêá à" = Bread
"ñ.á  ñêá< +à" = Ike Ireland
"& èêñä. ëïáá" = Patrickswell
"äí++ñ+åç ( (êë ç" = Cunningham Mamers
"ëé åáê êàë" = Sq Ser Rds
"àí++áë çá+êß" = Dunnes Henry St
"(äàñ><àë" = McDonalds
"íâáê á èë" = Uber Eats
"íâáê èêñ&" = Uber Trip
"íâáê êñàáë" = Uber Rides
"+ñä!ë è .á" = Nicos Takeaway
"ñ+ë!(+ñ  àêí" = Insomnia Dru
"ä!ããáá &!ñ+è" = Coffee Point
"èçá åá!êåá" = The George
"è!+áêë &íâ" = Toners Pub
"â< ä.âñêà ê" = Blackbird Restaurant
"êñ!è" = Riot Bar
".á++áàßë &íâ" = Kennedys Pub
"ä ëëñàßë" = Cassidys
"äê ââß [!ë" = Crabby Jos
"èçá äê!ëë" = The Cross
"ä< ê.áë â ê" = Clarkes Bar
"ä%/Ê,ÁË â/Ê" = Clarkes Bar
"&( äë â/Ê" = PM Cas Bar
"(íëñä ãáëèñî" = Music Festival
"ë& ê +!êèç ëñàá" = Spar Northside
"à ßâêá . ! ä" = Daybreak OC
"à ßâêá .  ëè" = Daybreak Store
"(äå!ï +ë" = McGowan's
"á ëß ãíá<" = Easy Fuel
" è( àíâ ä!<<áåá å" = ATM Dublin College Green
" è( àÍÂ<Ñ+" = ATM Dublin
"ä  ê!ñ í%" = CA Roi UL (ATM)
" ä ê!ñ í%" = CA Roi UL (ATM)
" ää  ê!ñ í%" = ACC Roi UL
"ä!ñ+ ä!ñ+â ëá" = Coinbase
"å?ÈÑ>ÀÁÊÄ?_" = Tinder
"ËÇÁÑ>Ä?_" = Shein
"è??å??Àè?å â" = Too Good To Go B
"á>ÈÁÊÈ" = Entertainment venue
"â á>ÈÁÊÈ" = B Entertainment
"ààáã á>ÈÁÊÈ" = DDF Entertainment
"àà è+à! ãñè+áëë ñêá<" = DD TNDO Fitness Ireland
"êÈÀ àà äÇ/ÊÅÁ" = DD Charge Refund
"áÌø%?ÊÁ (?>ÈÇ%" = Explore Monthly Fee
"àà åä êá &<í(" = DD GC RE PLUM
"ç <á &çñâëâ!" = Hale Phibsboro
"ë& çáàãñè+áë" = SP Headfitness
"[í+ &!ë ë& çáàãñè+áë" = Jun SP Headfitness
"[í< [!ç+ â!ß<á !â ì+" = Jun John Boyle (income)
"é í/ÊÈÁÊ%ß ñ>ÈÁÊÁËÈ" = Quarterly Interest
"(/Ê éÍ/ÊÈÁÊ%ß ñ>ÈÁÊÁËÈ" = Mar Quarterly Interest
"[í+ éÍ/ÊÈÁÊ%ß ñ>ÈÁÊÁËÈ" = Jun Quarterly Interest
"î&& && !+<ñ+á" = VPP BB Online
"çá<á> â!ß<á [[" = Helen Boyle (transfer)
"( ß çá<á> â!ß<á [[" = May Helen Boyle
"çñä.áßë &ç ê" = Hickeys Pharmacy
"â!!èë êáè ñ<" = Boots Retail
"ëí(í& ë +à" = Sumup Sand
"ëí(í& +êå" = Sumup NRG
"ëí(í& äçêñ" = Sumup Chri
"ëí(í& &êñß" = Sumup Priy
"ëí(í& áÎÁ>È" = Sumup Event
"ëí(í& èê&" = Sumup TRC
"ëé à îáë äá" = Sq D Ves De
"ëé ß ( (!êñ" = Sq By Mori
"ß ( (!êñ ñ]" = Y By Mori
"ß ( (!êñ ëíë" = Y By Mori Sus
"äÍë/Ä,ë <?Í>" = Cusacks Lounge
" î!ä  ç +àïá" = Avoca
"< åíá<áíè!+" = L Gueuleton
"âíè<áêë äç!ä" = Butlers Chocolate
".ãä ïáëè(!êá" = KFC Westmoreland
" êâ!êáèí(" = Arboretum
"(äë!ê<áßë" = McCharleys
"(á( ë" = Memos
"< åíá<áíè!+" = L Gueuleton
"èçá â <à á å" = The Bald Eagle
"è ëèß å êàá+" = Tasty Garden
"é í/ÊÈÁÊ%ß" = Quarterly Interest
"(!Ç/ÊÅ á>ÈÁÊ" = Maharaj
"< åíá<áíè!+" = L Gueuleton
"ãÊ/>ÄÑë" = Francois Restaurant
"<!èèë ä ãá â" = Lotts Cafe Bar
"àñ (!+à &ñ]]" = Du Mond Pi
"â!+!â!" = Bonomi Cafe
"ãêáá+!ïäáä" = Freshway ED
"ãêáá+!ïä!" = Freshway A
"ãêáá+!ïä â" = Freshway AB
"ãêáá+!ïäâ]" = Freshway AB2
"ãêáá+!ïäã&" = Freshway FP
"ãêáá+!ïäîã" = Freshway VF
"ãêáá+!ïä[ä" = Freshway JC
"ãêáá+!ïäñïì" = Freshway IWX
"ãêáá+!ïä(ß" = Freshway MY
"ãêáá+!ïä!á" = Freshway OE
"ãêáá+!ïä!ç" = Freshway OH
"ãêáá+!ïä!ñ" = Freshway OI
"ãêáá+!ïä!ìä" = Freshway OXC
"ãêáá+!ïä< å" = Freshway LG
"ãêáá+!ïä<â" = Freshway LB
"ãêáá+!ïä< <" = Freshway LL
"ãêáá+!ïä+ìâ" = Freshway NXB
"ãêáá+!ïäâí<" = Freshway BUL
"ãêáá+!ïäâ+" = Freshway BN
"ãêáá+!ïäî+" = Freshway VN
"ãêáá+!ïäâß" = Freshway BY
"ãêáá+!ïäç" = Freshway H
"ãêáá+!ïäã" = Freshway F
"ãêáá+!ïä è" = Freshway T
"ãêáá+!ï ää<" = Freshway CCL
"ãêáá+!ïèêë" = Freshway TRS
"ãêáá+!ïìãà" = Freshway XFD
"ãêáá+!ïêá" = Freshway RE
"ãêáá+!ï!íß" = Freshway OUY
"ãêáá+!ïçî" = Freshway HV
"ãêáá+!ïâä<" = Freshway BCL
"ãêáá+!ï[ã" = Freshway JF
"ãêáá+!ïäç â" = Freshway HB
"ãêáá+!ï ä" = Freshway D
"ãêáá+!ïã" = Freshway F
"ËÇÁÑ>Ä?_" = Shein
"ç!(á ëè!êá" = Home Store
"äç &èáêë â!!" = Chapters Bookstore
"ã!å êèßë ëç!" = Fogarty Shoes
"àáë(!+àë" = Desmonds
"ëçßë ä!ëèäí" = Shays Costcu
"ã%ÑÅÇÈ ä%ÍÂ" = Flight Club
"ã%ÑÅÇÈ ä%Í" = Flight Club
"èÊÍÁÈ/%Á>È:" = TrueTalent
"èê& áîá+èë" = TRP Events
"[!ç+ . î + å" = John V Ning
"+Í_ÂÁÊ  +ÁÏ" = Number One New
"ëá  åêááàßä!" = Sea Greedy Co
"+ß î/øÁÂ/Ê" = NY Vapebar
"áÄÑÊÁÈÈÁ" = Ecigarette
"èÇÁ î/øÁ <ÑÃ" = The Vape Life
"ë& çáàãñè+áë" = SP Headfitness
"àà è+à! ãñè+áëë ñêá<" = DD TNDO Fitness Ireland
"äá+èê  & ê+á" = Centre Parne
"äá+èê      " = Centre
"äï çÁ>ÊX ëÈ" = CW Henry St
"äÊÁøÁë />À Ï" = Crepes and Waffles
"<ñ+.áì&êáëë" = Linkexpress
"<ÑËÂ?/" = Lisbon
"(ñëáêñä!êàñ" = Misericordia
" è( <ÑËÂ?" = ATM Lisbon
" è( (ÑËÁÊÑä?ÊÀÑ" = ATM Misericordia
"å%?Î? ( ê" = Glovo Mar
"â ê à! êñ!" = Bar Daorio
"ä!ããáá &!ñ+è" = Coffee Point
"& êéíáë àá ë" = Parques de Si
"&!ëè! àá îá+" = Posto de Ven
"ä& <ñëâ!  ê!" = CP Lisboa RO
"&êñ( ê. <ñëâ!" = Primark Lisbon
"(ñ+ñ(áêä à!" = Minimerced O
"ë +è [!êàñ ç" = Sant Jordi H
"è êèñ+á" = Tartine
"(áí ëí&áê  ê" = MEU Super AR
"â!<èáíà" = Boulteud (restaurant)
" áê!&!êè!" = Aeroporto
"ãí+à ä ! äí<" = Fund Co Cul
"á ëß ãíá<" = Easy Fuel
"!à?>?ÅÇÍÁË" = O Donoghues
" à ïë!+ ëè" = Dawson Street
"å/ÃÃ>Á" = Gaffneys
"< åíá<áíè!+" = L Gueuleton
".[è îÁ>ÀÑ>Å" = JKT Vending
"ë ( (ä.]ß" = S M McKby
"ãÁÂ [/> ä/ËÇ" = Feb Jan Cash
"/Ë/Ñ%X" = Asailly
"!êä  " = ORC
"& ß& < ñèí+" = PBOL ITION (online)
"& ß& < íâáê" = PBOL Uber
"â á>ÈÁÊÈ" = B Entertainment
"âã á>ÈÁÊÈ" = BF Entertainment
"áââ  á>ÈÁÊÈ" = EBB Entertainment
"+ß äÑÊÄ%Á ." = NY Circle
"íâê &á+àñ+å" = Ubr Pending
"ï <ëçë" = Walshes
"ç!(á ëè!êá" = Home Store
"ëá  åêááàßä!" = Sea Greedy Co
"è êåáè" = Target
"çíàë?> ëè" = Hudson St
"ñç!&" = iHop
"é í/ÊÈÁÊ%ß ñ>ÈÁÊÁËÈ" = Quarterly Interest
"âÍ%," = Bulk Wholesale
"( ì!< ëëè+ ê" = M XOL SSTN R
"( ìë è .á ï" = M Xst Ke W
"ëí&áê  ëñ  &" = Super Si P
"+áïëê ñ< ä!+" = Newslink Con
"çí((åê!í&" = Humm Group
"! êáñ<<ßë ëí" = O Reillys Su
"èçá ïÑ%Á. ã?" = The Wiley Fox
"+ß îÁ>À_?ÊÁ" = NY Vendmore
"+ß ä?ÊÁÎÁ>À" = NY Corevent
"+ß î/øÁÂ/Ê" = NY Vapebar
"ëé à îáë äá" = Sq D Ves De
"< & ä êà  &" = La Pacha (club)
"àÍÂ<ÑÂ" = Dublin
"&& !+<ñ+á" = PP Online
"è!( ë ñ+èáê+á" = Toms Internet
" àíâ" = Adub
"êß + ñê" = RYN IR
"! åñ<ñ+ë" = O Gilins
"è íà!  (!âñ<" = Teudo Mobile
"& í<  á êñä" = Pauls Eric
"àñ (!+à &ñ]]" = Dd Mond Pizza
"à?(Ñ>Ñä%Ë" = Dominicls
"<ëë ( êß ëèê" = LSS Mary Street
"ãêáá+!ïã" = Freshway F
For amounts: look for numeric values after the merchant name. Withdrawn column = negative amount, Paid In column = positive.
For dates: combine month prefix + day number visible on the line. Use year from statement header.
AIB BANK STATEMENT FORMAT:
AIB statements use readable text with this layout:
- Date format: "01 Apr 2025" or "01/04/2025"
- Columns: Date | Details | Debit | Credit | Balance
- Debit = money out (negative), Credit = money in (positive)
- Amounts may have commas e.g. "1,234.56" — strip commas before parsing
- Common AIB transaction prefixes: VDC (Visa debit contactless), VDP (Visa debit purchase), DD (direct debit), CR (credit), TFR (transfer), ATM
BANK OF IRELAND FORMAT:
- Date format: DD/MM/YYYY
- Columns: Date | Details | Debit | Credit | Balance
Return ONLY a valid JSON array. Best-guess merchant names for anything not in the table.
Return empty array [] only if truly no transactions found.
Example output:
[
  {"date":"2025-03-07","description":"Tesco Stores","amount":-68.40},
  {"date":"2025-03-31","description":"Salary","amount":2800.00}
]`;
app.post('/parse-pdf', softAuth, rateLimit, async (req, res) => {
  const { text, rawLines } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text field.' });
  }
  if (text.length > 80000) {
    return res.status(400).json({ error: 'Text too long.' });
  }

  // ─── BANK DETECTION + STRUCTURAL PARSE ─────────────────────────
  const bank = detectBank(text);
  console.log(`[parse-pdf] Detected bank: ${bank}`);

  if (bank === 'revolut') {
    try {
      const structured = parseRevolut(text);
      if (structured.length > 0) {
        const meta = extractStatementMeta(text, 'revolut');
        const validation = validateParse(structured, meta);
        const rows = structuredToLegacyRows(structured, { includeInternal: false });
        const internalCount = structured.filter(r => r.isInternal).length;
        console.log(`[parse-pdf] Revolut: ${rows.length} txns (+${internalCount} internal) | confidence=${validation.confidence}${validation.issues.length ? ' | issues: ' + validation.issues.join('; ') : ''}`);

        // If confidence is low, fall through to AI fallback to retry
        if (validation.confidence === 'low') {
          console.log('[parse-pdf] Revolut validation FAILED — falling back to AI');
        } else {
          return res.json({
            rows,
            source: 'revolut-structural',
            validation,
            stats: {
              total: structured.length,
              visible: rows.length,
              internalHidden: internalCount,
              ...validation.stats,
            }
          });
        }
      } else {
        console.log('[parse-pdf] Revolut detected but parser returned 0 rows — falling back to AI');
      }
    } catch (e) {
      console.warn('[parse-pdf] Revolut parser threw:', e.message, '— falling back to AI');
    }
  }

  if (bank === 'aib') {
    try {
      const structured = parseAIB(text);
      if (structured.length > 0) {
        const meta = extractStatementMeta(text, 'aib');
        const validation = validateParse(structured, meta);
        const rows = structuredToLegacyRows(structured, { includeInternal: false });
        const internalCount = structured.filter(r => r.isInternal).length;
        console.log(`[parse-pdf] AIB: ${rows.length} txns (+${internalCount} internal) | confidence=${validation.confidence}${validation.issues.length ? ' | issues: ' + validation.issues.join('; ') : ''}`);

        if (validation.confidence === 'low') {
          console.log('[parse-pdf] AIB validation FAILED — falling back to AI');
        } else {
          return res.json({
            rows,
            source: 'aib-structural',
            validation,
            stats: {
              total: structured.length,
              visible: rows.length,
              internalHidden: internalCount,
              ...validation.stats,
            }
          });
        }
      } else {
        console.log('[parse-pdf] AIB detected but parser returned 0 rows — falling back to AI');
      }
    } catch (e) {
      console.warn('[parse-pdf] AIB parser threw:', e.message, '— falling back to AI');
    }
  }

  // ─── AI FALLBACK (for unknown banks / when structural parser fails) ───
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error.' });
  }
  const cache = await getMerchantCache();
  let communityMappings = '';
  if (Object.keys(cache).length > 0) {
    const entries = Object.entries(cache).slice(0, 200);
    communityMappings = '\n\nCOMMUNITY DECODED MERCHANTS (highest priority — use these first):\n' +
      entries.map(([g, d]) => `"${g}" = ${d}`).join('\n');
  }
  // Bank-specific hint to help the AI parser
  let bankHint = '';
  if (bank !== 'unknown') {
    bankHint = `\n\nDETECTED BANK: ${bank.toUpperCase()}\n` + getBankHint(bank);
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
        max_tokens: 6000,
        system: PDF_PARSE_PROMPT + communityMappings + bankHint,
        messages: [{ role: 'user', content: `Bank statement text:\n\n${text}` }],
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic error ${response.status}`);
    }
    const data = await response.json();
    const raw = data.content?.[0]?.text || '[]';
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
      console.error('PDF parse JSON error:', parseErr.message);
      rows = [];
    }
    if (rawLines && Array.isArray(rawLines) && rows.length > 0) {
      const newMappings = [];
      rows.forEach(row => {
        rawLines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed.length > 4 && !cache[trimmed] && row.description &&
              row.description.length > 2 && !row.description.includes('???')) {
            const hasGarbled = /[ÄÅÁÌÍÎÏÐÑÒÓÔÕÖáâãäåæçèéêëìíîïðñòóôõö]{3,}/.test(row.description);
            if (!hasGarbled) {
              newMappings.push({ garbled: trimmed, decoded: row.description });
            }
          }
        });
      });
      if (newMappings.length > 0) {
        saveMerchantMappings(newMappings).catch(() => {});
      }
    }
    res.json({ rows });
  } catch (err) {
    console.error('PDF parse error:', err.message);
    res.status(502).json({ error: 'PDF parsing temporarily unavailable.' });
  }
});
// ── COACH ENDPOINT ──
app.post('/coach', requireAuth, rateLimitCoach, async (req, res) => {
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
    trackCost('coach');
    res.json({ text });
  } catch (err) {
    console.error('Coach error:', err.message);
    res.status(502).json({ error: 'AI summary temporarily unavailable.' });
  }
});
// ── PDF VISION ENDPOINT ──
const PDF_VISION_PROMPT = `You are a bank statement parser specialising in Irish bank statements, especially PTSB/Permanent TSB.
Your job is to find every transaction visible in the images and return them as a JSON array.
The statement columns are: Date | Details | Withdrawn | Paid In | Balance
CRITICAL DATE FORMAT: PTSB uses DDMMMYY format e.g. "06APR22" = 2022-04-06, "15JAN25" = 2025-01-15.
Always convert to YYYY-MM-DD format.
The Details column has a type prefix then merchant name. Strip the prefix entirely, use only the clean merchant name.
Prefixes to strip: TKN, VPP, POS, ICT, DD, CT, RTD, GBP, USD, CNC, ATM, T/F
AMOUNT RULES:
- If amount is in the Withdrawn column → negative number
- If amount is in the Paid In column → positive number  
- The Balance column shows running balance — do NOT use this as the transaction amount
- Balance shown as "193.23 -" means overdraft/debit balance — ignore the sign on balance
Examples of how to read each line:
- "06APR22 | CNC INSOMNIA DRU | 6.90 | | 193.23-" → date:"2022-04-06", description:"Insomnia", amount:-6.90, category:"Coffee"
- "06APR22 | TKN THE BACK PAGE | 7.50 | | 200.73-" → date:"2022-04-06", description:"The Back Page", amount:-7.50, category:"Pubs & bars"
- "TKN TESCO STORES" → description:"Tesco Stores", category:"Groceries"
- "TKN CIRCLE K" → description:"Circle K", category:"Petrol & parking"
- "VPP REVOLUT" → description:"Revolut", category:"Transfers"
- "DD BORD GAIS EIREANN" → description:"Bord Gais", category:"Rent & bills"
- "ICT JOHN BOYLE" → description:"Salary", category:"Income"
- "DD LIDL IRELAND" → description:"Lidl", category:"Groceries"
- "TKN STARBUCKS" → description:"Starbucks", category:"Coffee"
- "CNC MCDONALDS" → description:"McDonald's", category:"Takeaways"
- "DD VIRGIN MEDIA" → description:"Virgin Media", category:"Rent & bills"
- "POS UBER" → description:"Uber", category:"Taxis"
- "TKN NETFLIX" → description:"Netflix", category:"Subscriptions"
- "POS JUST EAT" → description:"Just Eat", category:"Food delivery"
- "POS DELIVEROO" → description:"Deliveroo", category:"Food delivery"
- "ATM WITHDRAWAL" → description:"ATM Withdrawal", category:"Cash withdrawal"
Categories to use: Groceries, Food delivery, Takeaways, Pubs & bars, Coffee, Eating out, Taxis, Public transport, Petrol & parking, Travel, Subscriptions, Gaming, Clothing, Health, Fitness, Shopping, Rent & bills, Cash withdrawal, Transfers, Income, Other
Each transaction object must have exactly these fields:
- date: string in YYYY-MM-DD format
- description: string — clean merchant name, no prefix, no location codes, no card numbers
- amount: number — negative for Withdrawn, positive for Paid In
- category: string — one from the categories list above
IMPORTANT: PTSB PDFs use garbled font encoding. When you see garbled text in the Details column, use this table to decode the merchant name. Match the garbled pattern to get the real merchant name, then use that for the description field.
MERCHANT DECODING TABLE — match garbled text patterns to real merchant names:

Groceries/Supermarkets:
" <àñ ëè!êáë" = Aldi Stores
"à ß âêá ." = Daybreak
"à ßâêá . ! ä" = Daybreak OC
"à ßâêá .  ëè" = Daybreak Store
"äí++áë çá+êß" = Dunnes Henry St
"áíê!ë& ê ã ñ" = EuroSpar
"áíê!ë& ê ç +" = EuroSpar North
"ãêáá+!ï" = Freshway
"ãêáá+!ïä!" = Freshway A
"ãêáá+!ïä â" = Freshway AB
"ãêáá+!ïäâ]" = Freshway AB2
"ãêáá+!ïâä<" = Freshway BCL
"ãêáá+!ïâ(." = Freshway BMH
"ãêáá+!ïäâ+" = Freshway BN
"ãêáá+!ïäâí<" = Freshway BUL
"ãêáá+!ïâì<" = Freshway BXL
"ãêáá+!ïäâß" = Freshway BY
"ãêáá+!ï ää<" = Freshway CCL
"ãêáá+!ï ä" = Freshway D
"ãêáá+!ïä(è" = Freshway DMT
"ãêáá+!ïä é" = Freshway DQ
"ãêáá+!ïä î" = Freshway DV
"ãêáá+!ïäáä" = Freshway ED
"ãêáá+!ïäã" = Freshway F
"ãêáá+!ïäã&" = Freshway FP
"ãêáá+!ïäç" = Freshway H
"ãêáá+!ïäç â" = Freshway HB
"ãêáá+!ïç<â" = Freshway HLB
"ãêáá+!ïçî" = Freshway HV
"ãêáá+!ïäñïì" = Freshway IWX
"ãêáá+!ïä[ä" = Freshway JC
"ãêáá+!ï[ã" = Freshway JF
"ãêáá+!ïä<â" = Freshway LB
"ãêáá+!ïä< å" = Freshway LG
"ãêáá+!ïä< <" = Freshway LL
"ãêáá+!ïä(ß" = Freshway MY
"ãêáá+!ïä+ìâ" = Freshway NXB
"ãêáá+!ïä!á" = Freshway OE
"ãêáá+!ïä!ç" = Freshway OH
"ãêáá+!ïä!ñ" = Freshway OI
"ãêáá+!ï!íß" = Freshway OUY
"ãêáá+!ïä!ìä" = Freshway OXC
"ãêáá+!ïêá" = Freshway RE
"ãêáá+!ïë    " = Freshway S
"ãêáá+!ïä è" = Freshway T
"ãêáá+!ïèêë" = Freshway TRS
"ãêáá+!ïíë   " = Freshway US
"ãêáá+!ïäîã" = Freshway VF
"ãêáá+!ïäî+" = Freshway VN
"ãêáá+!ïìãà" = Freshway XFD
"<ñà< ñê" = Lidl
"<ñà< ñêá< +à" = Lidl Ireland
"ë<á(!+ë ëí&á" = Slemons Supervalue
"ë& ê    " = Spar
"ë& ê äçêñëèä" = Spar Christch
"ë& ê ä!<<áåá" = Spar College
"ë& ê à (á ëè" = Spar Drumcondra
"ë& ê ç!<<ßïá" = Spar Hollywell
"ë& ê (áêêñ!+" = Spar Merrion
"ë& ê (!í+è[!" = Spar Mountjoy
"ë& ê +!êèç ë" = Spar North Side
"ë& ê +!êèç ëñàá" = Spar Northside
"ë& ê ! ä!++á" = Spar OConnell
"ë& ê è <â!è" = Spar Talbot St
"ë& ê  í&&áê" = Spar Upper
"ëí&áêî <í ê" = Supervalu
"ëí&áêî <í ä<" = Supervalu DL
"èáëä! ëè!êáë" = Tesco Stores

Takeaways/Food Delivery:
"âñ+ +äáä!(" = Bun n Cheese
"âíêåáê .ñ+å" = Burger King
"àá<ñîáê!!" = Deliveroo
"àá<ñîáê!!ñá" = Deliveroo IE
"à!(ñ+ñäë &ñ]]" = Dominos Pizza
"[ÍËÈ á/È ñÊÁ" = Just Eat Ireland
".ãä àê!åçáà" = KFC Drogheda
".ãä ïáëè(!êá" = KFC Westmoreland
"(ää âáë &ç ê" = McDonald's
"(äà!+ <àë" = McDonalds
"+ñä!ë è .á" = Nicos Takeaway
"íâáê  á è" = Uber Eats

Coffee:
"âÊ/_Â%ÁË" = Brambles
"âíè<áêë äç!ä" = Butlers Chocolate
"ä!ããáá &!ñ+è" = Coffee Point
"ñ+ëñà+ñ  àêí" = Insomnia Dru
"ñ>Ë?_>Ñ/ àÊÍ" = Insomnia Drumcondra
"ÊÑ?Ë/ ä?ÃÃÁ" = Rosa Coffee
"ëè/êâíä.ë" = Starbucks
"ëèêâíä.ë +!" = Starbucks No

Pubs/Bars:
" ++áë â ê" = Annes Bar
"â ê à! êñ!" = Bar Daorio
"â< ä. âí<< ñ" = Blackbird
"â< ä.âñêà ê" = Blackbird Restaurant
"âñë!+ â ê" = Buston Bar
"ä ëëñàßë" = Cassidys
"äç ê<ñá äç &" = Charlie Chawke
"ä< ê.áë â ê" = Clarkes Bar
"ãñââáê ( åáá" = Fibber Magees
"çáàñå +ë èçá" = Hedigan The
".á++áàßë &íâ" = Kennedys Pub
"<!èëë ä ãá â" = Lotts Cafe Bar
"(í<<ñå +ë &í" = Mulligans Pub
"+ß î/øÁÂ/Ê" = NY Vapebar
"&( äë â/Ê" = PM Cas Bar
"&ßå( <ñ!+ &í" = Pygmalion Pub
"êñ!è" = Riot Bar
"êñîáê â ê" = River Bar
"ëäêñââ<áë" = Scramblers
"ëé ê!!ëèáêë" = Sq Roosters Barber
"ëè åë çá à" = Stags Head Dublin
"èçá åá!êåá" = The George
"èçá [ ê" = The Jar
"èçá <ñîñ+å ê" = The Living Room
"èçá ëè åë çá" = The Stags Head
"èçá ï!ê.( +ë" = The Workmans
"è!+áêë &íâ" = Toners Pub
"ïñåï (" = Wigwam Bar

Transport/Petrol:
"äñêä<á . äá+" = Circle K
"äñêä<á . [í+" = Circle K Jun
"äñêä<á . <!ï" = Circle K Law
"äñêä<á . (  " = Circle K M
"äñêä<á . êñä" = Circle K Richmond
"äñêä<á . ïáë" = Circle K Wes
"á ëß ãíá<" = Easy Fuel
"ñêñëç ê ñ< ç" = Irish Rail
"<í ë èê +ëàá" = Luas Transdev

Subscriptions/Online:
" ( ]!+ &êñ(á" = Amazon Prime
" (]+&ÊÑ_Á àá" = Amazon Prime De
" &&<á ëè!êá" = Apple Store
" &&<áä!(âñ" = Apple.com
" &&<áåêáá+ (" = AppleGreen
" &&<áåêáá+ ä" = AppleGreen D
"áì&êáëëî&+ä" = ExpressVPN
"(ÑÄÊ?Ë?ÃÈá" = Microsoft
"(ÑÄÊ?Ë?ÃÈëÈ" = Microsoft ST
"(ÑÄÊ?Ë?ÃÈ" = Microsoft/Xbox
"(ñäê!ë!ãèìâ" = Microsoftb
"+áèã<ñì ñ+èá" = Netflix
"èçêáá ñêá< +à" = Three Ireland
"å?ÈÑ>ÀÁÊÄ?_" = Tinder

Bills/Direct Debits:
"àÁÂÑÈ ä/ÊÀ äÇ/ÊÅÁ" = Debit Card Charge
"êÈÀ àÑÊÁÄÈ àÁÂÑÈ" = Direct Debit Refund
"!ÎÁÊÀÊ ãÈ ãÁÁ" = Overdraft Fee
"èçá çá <èç ë" = The Health Store

Transfers/Income:
" &ê <íä ! êñ à  êá+è" = Apr Luc O Ri Rent
"àá& êè(á+è !ã ë!äñ" = Department of Social
"çá<á+ â!ß<á [[" = Helen Boyle
"çá<á+ â!ß<á [[" = Helen Boyle (transfer)
"[í< [!ç+ â!ß<á !â ì+" = Jun John Boyle (income)
"[í+ <íä ! êñ à  êá+è" = Jun Luc O Ri Rent
"<íä ! êñ à  àá&!ëñ" = Luc O Ri D Deposit
"<íä ! êñ à  êá+è" = Luc O Ri Rent
"!äè <íä ! êñ à  êá+è" = Oct Luc O Ri Rent
"&ñáêäá ! è!!<á âñ<<ë" = Pierce OToole Bills
"êÁÎ?%ÍÈ" = Revolut
"êáî![!ç+â!ß" = Revolut JB
"êáî![!ç+â!ß" = Revolut John Boyle
"ëá& çá<á+ â!ß<á [[" = Sep Helen Boyle
"ëá& [[ â!ß<á  ñâ" = Sep JJ Boyle IB
"ëá& <íä !êñ à  êá+è" = Sep Luc O Ri Rent
"ëáè/ +è  ä!(" = Setanta (income)
"ëáè +è  ä!( ñêá< +à" = Setanta Com Ireland

Shopping/Retail:
" êå!ë àê!åçá" = Argos Drogheda
" ëç  ä<!èçñ+" = Asos Clothing
"â!!èë êáè ñ<" = Boots Retail
"äç &èáêë â!!" = Chapters Bookstore
"äíêêßë    " = Currys
"àÁÄ/ÈÇ%?> !Ä" = Decathlon
"ç êîáß +!ê(  " = Harvey Norm
"&á++áßë àí+" = Penneys Dundrum
"&á++áßë ! ä!" = Penneys OC
"&á++áßë ( êß" = Penneys Primark
"&áèëè!&" = Petstop
"ËÇÁÑ>Ä?_" = Shein
"ëí&áêàêíå ëè" = Superdrug
"ï/?ÀÑÁË" = Woodies
"ï??ÀÑÁË  ÑÊë" = Woodies IRS

Sumup/Square terminals:
"ëé  âë!<íèá" = Sq Absolute Gym
"ëé ß ( (!êñ" = Sq By Mori
"ëé à îáë äá" = Sq D Ves De
"ëé ñèë !íê" = Sq Its Our
"ëé &!à ãáëè" = Sq Pod Fest
"ëé &!à ãáëè" = Sq Pod Festival
"ëé ê!!ëèáêë" = Sq Roosters Barber
"ëé ë( (ä.]ß" = Sq SM McKby
"ëé åáê êàë" = Sq Ser Rds
"ëé èçá âñå" = Sq The Bug
"ëé èçá äá<è" = Sq The Delta
"ëé èê äáë" = Sq Trades
"ëé î &áîá+à" = Sq V Weekend
"ëé & ï+ ëç!" = Sq Win Sho
"ëí(í& äçêñ" = Sumup Chri
"ëí(í& áÎÁ>È" = Sumup Event
"ëí(í& å <" = Sumup GL
"ëí(í& +êå" = Sumup NRG
"ëí(í& &çñ<" = Sumup Phil
"ëí(í& &êñß" = Sumup Priy
"ëí(í& ë +à" = Sumup Sand
"ëí(í& ëèá&" = Sumup Steak
"ëí(í& èê&" = Sumup TRC
"ëí(í& è ìñ" = Sumup Taxi
"ëí(í& èçá" = Sumup The

Other merchants:
" âê .áâ âê" = ABR Web BR
" ää  ê!ñ í%" = ACC Roi UL
" à!âá  äê!&ê" = Adobe Cropro
" àíâ" = Adub
" áê!&!êè!" = Aeroporto
" êâ!êáèí(" = Arboretum
"& ê.ë &ç ê(" = Arks Pharmacy
"/Ë/Ñ%X" = Asailly
" î!ä  ç +àïá" = Avoca
"â á>ÈÁÊÈ" = B Entertainment
"âã á>ÈÁÊÈ" = BF Entertainment
"âÁÁÇÑÎÁ äÊ/Ã" = Beehive Craft Beer
"â!àí(ä!(" = Bodumcom
"â!+!â!" = Bonomi Cafe
"â??ÈÇ?Ä?_ í" = Boohoo
"â!!ç!!ä!( í" = Booking.com
"â!<èáíà" = Boulteud (restaurant)
"âêá à" = Bread
"âÍ%," = Bulk Wholesale
"âíë ëè!&  å" = Bus Stop
"ä& <ñëâ!  ê!" = CP Lisboa RO
"äï çÁ>ÊX ëÈ" = CW Henry St
"ä ãá á+ ëáñ+" = Cafe en Seine
"ä/ËÇ á/Ê>ÁÀ" = Cash Earned
"äá+èê      " = Centre
"äá+èê  à (á" = Centre Dame St
"äá+èê  à!êëá" = Centre Dorset St
"äá+èê  àêí(ä" = Centre Drumcondra
"äá+èê < .áß" = Centre Lakey
"äá+èê  & ê+á" = Centre Parne
"äá+èê  éíñä." = Centre Quick
"äá+èê  ïáëè(" = Centre Westm
"äá+èê  ïáëè(!" = Centre Westmoreland
"äñ+áï!ê<à" = Cineworld
"ä< ëëñä êáèê" = Classic Retro
"ä!ñ+ ä!ñ+â ëá" = Coinbase
"äê ââß [!ë" = Crabby Jos
"äÊÁøÁë />À Ï" = Crepes and Waffles
"äê!.á & ê. ë" = Croke Park
"àí++ñ+åç ( â" = Cunningham MB
"äí++ñ+åç ( (êë ç" = Cunningham Mamers
"äÍë/Ä,ë <?Í>" = Cusacks Lounge
"à +ñá<    " = Daniel
" à ïë!+ ëè" = Dawson Street
"àñ (!+à &ñ]]" = Dd Mond Pizza
"àáë(!+àë" = Desmonds
"à?(Ñ>Ñä%Ë" = Dominicls
"à!(ñ+ñäë è" = Dominics T
"àñ (!+à &ñ]]" = Du Mond Pi
"àÍÂ<ÑÂ" = Dublin
"áââ  á>ÈÁÊÈ" = EBB Entertainment
"á[ .ñ+åë" = EJ Kings
"ëÄÑÊÁÈÈÁ" = Ecigarette
"áààñá ê!ä.áè" = Eddie Rockets
"á>ÈÁÊÈ" = Entertainment venue
"áë&ñêá < âë" = Espire Labs
"áÌø%?ÊÁ (?>ÈÇ%" = Explore Monthly Fee
"ã ]ñ +ß" = F Qi NY
"ãÁÂ [/> ä/ËÇ" = Feb Jan Cash
"ã< + å +ë êá" = Flannagans Restaurant
"ã< ñåçè ä<íâ" = Flight Club
"ã!å êèßë ëç!" = Fogarty Shoes
"ã?Ê_ÁÊ%ß" = Formerly
"ãÊ/>ÄÑë ?¦?" = Francois Restaurant
"ãí+à ä ! äí<" = Fund Co Cul
"å <  à!êëáè" = GA Dorset
"å/ÃÃ>Á" = Gaffneys
"åá!åíáëëê    " = Geoguessrr
"åá!åíáëëê &ê" = Geoguessrr PR
"åÁÊ/ÊÀë ä/_ø" = Gerards Camp
"å%?Î? ( ê" = Glovo Mar
"å!!å<á ß?Íè  " = Google Yout
"åêñ!<< àç á   " = Grill DHA E
"åê! ê.áë äá+" = Groanrkes Denny
"åÑ+ & < äá" = Gun and Castle
"ç <á &çñâëâ!" = Hale Phibsboro
"çñä.áßë &ç ê" = Hickeys Pharmacy
"ç!(á ëè!êá" = Home Store
"çíàë?> ëè" = Hudson St
"çí((åê!í&" = Humm Group
"ñ+áè  ãÊ" = INET FR
"ñ.á  ñêá< +à" = Ike Ireland
" ñ<<ïáá ä îá" = Illweed
".[è îÁ>ÀÑ>Å" = JKT Vending
"[!ç+ . î + å" = John V Ning
"[í+ éÍ/ÊÈÁÊ%ß ñ+ÈÁÊÁËÈ" = Jun Quarterly Interest
"[í+ &!ë ë& çáàãñè+áë" = Jun SP Headfitness
".ñ+å +íèêñèñ" = King Nutrition
"< åíá<áíè!+" = L Gueuleton
"<ëë ( êß ëèê" = LSS Mary Street
"< & ä êà  &" = La Pacha (club)
"<ñ+.áì&êáëë" = Linkexpress
"<ÑËÂ?/" = Lisbon
"<<!ßàë&ç ê(" = Lloyds Pharmacy
"<!íåç !ïá< !" = Lough Owel
"( ê.ë  ë&á+" = M RKS Spencer
"( ì!< ëëè+ ê" = M XOL SSTN R
"( ìë è .á ï" = M Xst Ke W
"(áí ëí&áê  ê" = MEU Super AR
"(å&îÑ>ÈÁÀ" = MGP Vinted
"(/Ç/ÊÅ á>ÈÁÊ" = Maharaj
"(/Ê éÍ/ÊÈÁÊ%ß ñ+ÈÁÊÁËÈ" = Mar Quarterly Interest
"(äë!ê<áßë" = McCharleys
"( äá âáèèßëè" = McDermott Bettystown
"( äá àêí(ä!+" = McDermott Drumcondra
"( äá ê çá+ß" = McDermott Kenny
"( äá ë +àß(!" = McDermott Sandy
"(Äå?Ï/>Ë" = McGowan's
"(äåê èè +ë ê" = McGrotty ns
"(ä.  ê( åç" = McK Arm GH
"(Á_/Ë" = Memas Cafe
"(á( ë" = Memos
"(ñà+ñåçè áìø" = Midnight Express
"(ñ+ñ(áêä à!" = Minimerced O
"(ñëáêñä!êàñ" = Misericordia
"(!í+è[!ß ëè" = Mountjoy St
"(Ê ê?ÄÄ?Ë è" = Mr Rodds
"(íëñä ãáëèñî" = Music Festival
"+ß âàë îÁ>À" = NB Bds Vend
"+ß äÑÊÄ%Á ." = NY Circle
"+ß ä?ÊÁÎÁ>À" = NY Corevent
"+ß îÁ>À_?ÊÁ" = NY Vendmore
"+áïëê ñ< ä!+" = Newslink Con
"+Í_ÂÁÊ  +ÁÏ" = Number One New
"!à?>?ÅÇÍÁË" = O Donoghues
"! åñ<ñ+ë" = O Gilins
"! êáñ<<ßë ë" = O Reillys
"! êáñ<<ßë ëí" = O Reillys Su
"!âêñá+ë ç +à" = O'Briens
"!êä  " = ORC
"!ãã âá è à!+" = Off Beat Don
"!<à ëäç!!<ç!" = Old Schoolhouse
"!êñá+è < & +" = Orient La P
"& àà<á+áè" = P Addlenet (PayPal)
"& ß& < ñèí+" = PBOL ITION (online)
"& ß& < íâáê" = PBOL Uber
"&& !+<ñ+á" = PP Online
"& ààß &!ïáê" = Paddy Power
"& êéíáë àá ë" = Parques de Si
"& èêñä. ëïáá" = Patrickswell
"& í<  á êñä" = Pauls Eric
"& èë äá+èê" = Pets Centre
"& èë ëí&áê(" = Pets Supermarket
"&ç!á+ñì & ê." = Phoenix Park
"&Ç?>Á  ß?Í" = Phone You
"&ñå  +à çáñã" = Pig and Heifer
"&!à ãáëèñî <" = Pod Festival
"&!ëè! àá îá+" = Posto de Ven
"&êñ( ê. <ñëâ!" = Primark Lisbon
"é í/ÊÈÁÊ%ß ñ>ÈÁÊÁËÈ" = Quarterly Interest
"êß + ñê" = RYN IR
"êáëñàá+è  àî" = Resident Adv
"ë ( (ä.]ß" = S M McKby
"ë& çáàãñè+áë" = SP Headfitness
"ëî .ñ<( ñ+ç" = SV Kilm Inch
"ë +è [!êàñ ç" = Sant Jordi H
"ëá  åêááàßä!" = Sea Greedy Co
"ëá& è!" = Sep TO
"ëçßë ä!ëèäí" = Shays Costcu
"ëÑÅ> Íø" = Sign Up
"ë(ßèçëè!ßëä" = Smythstoys
"ëè ä.ë &ç ê" = Stacks Pharmacy
"ëèê +à (áàñä" = Strand Medical
"ëí&áê  ëñ  &" = Super Si P
"èê& áîá+èë" = TRP Events
"è êåáè" = Target
"è êèñ+á" = Tartine
"è ëèß å êàá+" = Tasty Garden
"è íà!  (!âñ<" = Teudo Mobile
"èçá â ä. & å" = The Back Page
"èçá â <à á å" = The Bald Eagle
"èÇÁ â +.áêë" = The Bankers
"èçá â< ä. âí" = The Black Bull
"èçá âíèè!+ ã" = The Button Factory
"èçá ä è  +à" = The Cat And Dog
"èÇÁ ä?ÈÈ/ÅÁ" = The Cottage
"èÇÁ äÊ?ËË" = The Cross
"èçá å èá +áï" = The Gate New
"èçá ñ+èáê+ è" = The Internet Cafe
"èÇÁ î/øÁ <ÑÃ" = The Vape Life
"èçá ïÑ%Á. ã?" = The Wiley Fox
"è!( ë ñ+èáê+á" = Toms Internet
"è??å??Àè?å" = Too Good To Go
"è??å??Àè?å â" = Too Good To Go B
"èÊÑÂÁ ã??À ä" = Tribe Food Co
"èÊÍÁÈ/%Á>È:" = TrueTalent
"íêâ +!íèãñèè" = URB Noutfitt
"íâáê êñàáë" = Uber Rides
"íâáê èêñ&" = Uber Trip
"íâê &á+àñ+å" = Ubr Pending
"î .áç!áë" = V Kehoes
"ï ïç!ëèá<ï!ê<à" = WWW Hostelworld
"ïïï ( ]!+" = WWW MJON
"ïïï ë!ëä!(" = WWW Soscom
"ï <ëçë" = Walshes
"ïáèáêëè!+áë" = Waterstones
"ïÑÌÄ?_" = Wix.com
"ï!. !+ ñ++  " = Wok On Inn
"ß ( (!êñ ñ]" = Y By Mori
"ß ( (!êñ ëíë" = Y By Mori Sus
"ñç!&" = iHop

Return ONLY a valid JSON array, no other text, no markdown, no explanation.
Skip non-transaction rows like "Balance B/fwd", "Balance Bfwd", "Closing Balance", "Overdraft Information".
If you cannot find any transactions, return an empty array [].`;
app.post('/parse-pdf-vision', softAuth, rateLimitVision, async (req, res) => {
  req.setTimeout(120000);
  res.setTimeout(120000);
  const { images } = req.body;
  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Missing images array.' });
  }
  // Raised from 6 to 12 to support larger statements
  if (images.length > 12) {
    return res.status(400).json({ error: 'Too many pages — maximum 12.' });
  }
  for (const img of images) {
    if (typeof img !== 'string' || img.length > 3000000) {
      return res.status(400).json({ error: 'Invalid or oversized image data.' });
    }
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error.' });
  }
  try {
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
        max_tokens: 16000,
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
    trackCost('vision');
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
            ...(t.category ? { category: String(t.category) } : {}),
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
// ── PTSB PDF PARSER ──
app.post('/parse-ptsb', softAuth, rateLimitParse, async (req, res) => {
  req.setTimeout(30000);
  const { pdf: pdfBase64, password } = req.body;
  if (!pdfBase64) {
    return res.status(400).json({ error: 'Missing pdf field.' });
  }
  if (!pdfParse) {
    return res.status(500).json({ error: 'pdf-parse not available.', fallback: true });
  }
  try {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const options = password ? { password } : {};
    const data = await pdfParse(pdfBuffer, options);
    const text = data.text || '';
    const hasDates = /\d{2}[\/-]\d{2}[\/-]\d{2,4}/.test(text) ||
                     /\d{4}-\d{2}-\d{2}/.test(text) ||
                     /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i.test(text) ||
                     /\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}/i.test(text);
    const hasAmounts = /[\d,]+\.\d{2}/.test(text);
    const isGarbled = text.length > 100 &&
      (text.match(/[ÄÅÁÌÍÎÏÑÒÓÔÕÖáâãäåæçèéêëìíîïðñòóôõö]/g) || []).length > 15;
    if (isGarbled || !hasDates || !hasAmounts) {
      console.log('PTSB PDF: garbled/unreadable text, falling back to vision.');
      return res.json({ rows: [], fallback: true, reason: isGarbled ? 'garbled' : 'no_transactions' });
    }
    console.log('PTSB PDF: clean text extracted, parsing directly. Text length:', text.length);
    const rows = parseBankStatementText(text);
    console.log('PTSB PDF: parsed', rows.length, 'rows from text');
    if (rows.length === 0) {
      return res.json({ rows: [], fallback: true, reason: 'no_rows_parsed' });
    }
    res.json({ rows, fallback: false });
  } catch (err) {
    console.error('PTSB parse error:', err.message);
    if (err.message?.toLowerCase().includes('password') || err.name === 'PasswordException') {
      return res.status(400).json({ error: 'password_required', fallback: false });
    }
    res.json({ rows: [], fallback: true, reason: 'parse_error' });
  }
});
function parseBankStatementText(text) {
  const rows = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const MONTH_MAP = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m5 = line.match(/^(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})\s+(.+?)\s+([\d,]+\.\d{2})\s*([\d,]+\.\d{2})?\s*([\d,]+\.\d{2}[\s-]*)?\s*$/i);
    if (m5) {
      const [, day, mon, yr, desc, col1, col2, col3] = m5;
      const year = parseInt(yr) < 50 ? '20' + yr : '19' + yr;
      const monthNum = MONTH_MAP[mon.toLowerCase()];
      const dateStr = `${year}-${monthNum}-${day.padStart(2,'0')}`;
      const withdrawn = parseFloat(col1?.replace(/,/g,'')) || 0;
      const paidIn = col2 ? parseFloat(col2.replace(/,/g,'')) : 0;
      const amount = col3
        ? ((paidIn > 0 && withdrawn === 0) ? paidIn : -withdrawn)
        : -withdrawn;
      const cleanDesc = desc.replace(/^(TKN|VPP|POS|ICT|DD|CT|RTD|GBP|USD|CNC|ATM|T\/F)\s+/i, '').replace(/\s+/g, ' ').trim();
      if (cleanDesc.length > 1 && Math.abs(amount) > 0) {
        rows.push({ date: dateStr, description: cleanDesc, amount: String(amount) });
      }
      continue;
    }
    const m1 = line.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})?\s*([\d,]+\.\d{2})?\s*$/);
    if (m1) {
      const [, day, month, year, desc, col1, col2, col3] = m1;
      const dateStr = `${year}-${month}-${day}`;
      const withdrawn = parseFloat(col1?.replace(/,/g,'')) || 0;
      const paidIn = col2 ? parseFloat(col2.replace(/,/g,'')) : 0;
      let amount;
      if (col3) {
        amount = (paidIn > 0 && withdrawn === 0) ? paidIn : -withdrawn;
      } else if (col2) {
        amount = withdrawn;
      } else {
        amount = -withdrawn;
      }
      const cleanDesc = desc.replace(/\s+/g, ' ').trim();
      if (cleanDesc.length > 1 && Math.abs(amount) > 0) {
        rows.push({ date: dateStr, description: cleanDesc, amount: String(amount) });
      }
      continue;
    }
    const m2 = line.match(/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([-]?[\d,]+\.\d{2})\s*$/);
    if (m2) {
      const [, date, desc, amtStr] = m2;
      const amount = parseFloat(amtStr.replace(/,/g,''));
      if (desc.length > 1 && !isNaN(amount)) {
        rows.push({ date, description: desc.trim(), amount: String(amount) });
      }
      continue;
    }
    const m3 = line.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*([\d,]+\.\d{2})?\s*([\d,]+\.\d{2})?\s*$/i);
    if (m3) {
      const [, day, mon, year, desc, col1, col2, col3] = m3;
      const monthNum = MONTH_MAP[mon.toLowerCase()];
      const dateStr = `${year}-${monthNum}-${day.padStart(2,'0')}`;
      const withdrawn = parseFloat(col1.replace(/,/g,'')) || 0;
      const paidIn = col2 ? parseFloat(col2.replace(/,/g,'')) : 0;
      let amount;
      if (col3) {
        amount = (paidIn > 0 && withdrawn === 0) ? paidIn : -withdrawn;
      } else {
        amount = -withdrawn;
      }
      const cleanDesc = desc.replace(/\s+/g, ' ').trim();
      if (cleanDesc.length > 1 && Math.abs(amount) > 0) {
        rows.push({ date: dateStr, description: cleanDesc, amount: String(amount) });
      }
      continue;
    }
    const m4 = line.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})\s+((?:TKN|VPP|POS|ICT|DD|CT|RTD|GBP|USD|T\/F)\s+.+?)\s+([\d,]+\.\d{2})\s*([\d,]+\.\d{2})?\s*([\d,]+\.\d{2})?\s*$/i);
    if (m4) {
      const [, day, mon, yearStr, desc, col1, col2, col3] = m4;
      const year = yearStr.length === 2 ? '20' + yearStr : yearStr;
      const monthNum = MONTH_MAP[mon.toLowerCase()];
      const dateStr = `${year}-${monthNum}-${day.padStart(2,'0')}`;
      const withdrawn = parseFloat(col1.replace(/,/g,'')) || 0;
      const paidIn = col2 ? parseFloat(col2.replace(/,/g,'')) : 0;
      const amount = col3
        ? ((paidIn > 0 && withdrawn === 0) ? paidIn : -withdrawn)
        : -withdrawn;
      const cleanDesc = desc.replace(/^(TKN|VPP|POS|ICT|DD|CT|RTD|GBP|USD|T\/F)\s+/i, '').replace(/\s+/g, ' ').trim();
      if (cleanDesc.length > 1 && Math.abs(amount) > 0) {
        rows.push({ date: dateStr, description: cleanDesc, amount: String(amount) });
      }
    }
  }
  const seen = new Set();
  return rows.filter(r => {
    const key = `${r.date}|${r.description}|${r.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
// ── TAX SCAN ENDPOINT ──
app.post('/tax-scan', softAuth, rateLimitParse, async (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: 'transactions array required' });
  }
  if (transactions.length > 5000) {
    return res.status(400).json({ error: 'Too many transactions.' });
  }
  try {
    const result = await runTaxScan(transactions, { supabaseRequest });
    res.json(result);
  } catch (err) {
    console.error('Tax scan error:', err.message);
    res.status(500).json({ error: 'Tax scan failed' });
  }
});
// ── STRIPE CHECKOUT ──
app.post('/create-checkout-session', requireAuth, rateLimitCheckout, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured.' });
  // Authenticated user — never trust client-supplied userId
  const userId = req.user.id;
  const email = req.user.email || req.body.email;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      customer_email: email || undefined,
      client_reference_id: userId,
      success_url: 'https://skint.ie/?checkout=success',
      cancel_url: 'https://skint.ie/?checkout=cancelled',
      allow_promotion_codes: true,
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
// ── STRIPE WEBHOOK ──
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set — refusing webhook');
    return res.status(500).json({ error: 'Webhook not configured.' });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: 'Webhook error.' });
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    if (userId && SUPABASE_KEY) {
      try {
       await supabaseRequest(`/user_data?user_id=eq.${userId}`, 'PATCH', {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          is_pro: true,
          updated_at: new Date().toISOString(),
        });
        console.log('User upgraded to Pro:', userId);
      } catch(e) {
        console.error('Failed to update Pro status:', e.message);
      }
    }
  }
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const customerId = sub.customer;
    if (SUPABASE_KEY) {
      try {
    await supabaseRequest(`/user_data?stripe_customer_id=eq.${customerId}`, 'PATCH', {
          is_pro: false,
          updated_at: new Date().toISOString(),
        });
        console.log('User downgraded from Pro:', customerId);
      } catch(e) {
        console.error('Failed to update Pro status:', e.message);
      }
    }
  }
  res.json({ received: true });
});
app.listen(PORT, () => console.log(`Skint API running on port ${PORT}`));
// ── CATEGORISE ENDPOINT ──
// Keep-alive ping — warms server on page load
app.get('/ping', (req, res) => res.json({ ok: true }));

app.post('/categorise', softAuth, rateLimit, async (req, res) => {
  const { merchants } = req.body;
  if (!merchants || !Array.isArray(merchants) || merchants.length === 0) {
    return res.status(400).json({ error: 'Missing merchants array.' });
  }

  // ─── PHASE 1: LIBRARY LOOKUP ──────────────────────────────────
  // For each merchant, check the library first. Only fall through to AI for unknowns.
  await loadMerchantLibrary();
  const categories = {};
  const unknowns = [];
  let libHits = 0;
  for (const m of merchants) {
    const hit = lookupMerchant(m);
    if (hit && hit.category) {
      categories[m] = hit.category;
      libHits++;
    } else {
      unknowns.push(m);
    }
  }
  console.log(`[categorise] library hits: ${libHits}/${merchants.length}, AI calls needed: ${unknowns.length}`);

  // If everything was in the library, we can skip AI entirely (€0 categorisation!)
  if (unknowns.length === 0) {
    return res.json({ categories, source: 'library-only', stats: { libHits, aiCalls: 0 } });
  }

  // ─── PHASE 2: AI FALLBACK FOR UNKNOWNS ────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Return what we have from the library if AI is down
    return res.json({ categories, source: 'library-partial', stats: { libHits, aiCalls: 0 } });
  }
  const CATS = ['Groceries','Food delivery','Takeaways','Pubs & bars','Coffee','Eating out','Taxis','Public transport','Petrol & parking','Travel','Subscriptions','Gaming','Clothing','Health','Fitness','Shopping','Rent & bills','Cash withdrawal','Transfers','Income','Other'];
  const prompt = `You are a transaction categoriser for Irish bank statements. You know Irish merchants well.
Given a list of merchant/transaction names, return a JSON object mapping each merchant to its category.
Use ONLY these categories: ${CATS.join(', ')}

Irish context rules:
- Tesco, Lidl, Aldi, SuperValu, Dunnes, Centra, Spar, Mace, Londis, Daybreak, EuroSpar, Costcutter = Groceries
- Deliveroo, Just Eat, Uber Eats = Food delivery
- McDonald's, Supermacs, KFC, Burger King, Dominos, Apache, Abrakebabra, Subway, Five Guys = Takeaways
- Any pub, bar, nightclub, club, lounge, late bar = Pubs & bars
- Insomnia, Starbucks, Costa, Cloud Picker, Butlers, Java Republic, Bewleys, Vice Coffee = Coffee
- Circle K, Applegreen, Maxol, Emo, Texaco = Petrol & parking
- Dublin Bus, Luas, Irish Rail, Iarnrod Eireann, TFI, Go-Ahead = Public transport
- Free Now, Freenow, Uber (not Uber Eats), Bolt, Lynk = Taxis
- Netflix, Spotify, Disney+, Apple, Microsoft, Xbox, Amazon Prime, Setanta, NOW TV, YouTube Premium = Subscriptions
- Ryanair, Aer Lingus, Airbnb, Booking.com, Hostelworld = Travel
- Penneys, Primark, Zara, H&M, ASOS, Shein, Next, M&S, TK Maxx = Clothing
- Gym, fitness, yoga, pilates, Decathlon, Sports Direct, Elvery = Fitness
- Revolut P2P transfers, "To [Name]", "From [Name]" = Transfers
- ATM, cash withdrawal = Cash withdrawal
- Sumup/Square/iZettle: categorise by what follows (Sumup Taxi = Taxis, Sumup Pub = Pubs & bars, Sumup Coffee = Coffee)
- AIB transaction prefixes to strip: VDC, VDP, DD, CR, TFR, ATM before categorising
- N26 merchant names are usually clean partner names — categorise directly
- Salary, wages, payroll, employer name = Income
- AGGRESSIVE CATEGORISATION: Pick the most likely category even if uncertain. ONLY use "Other" as a true last resort for genuinely incomprehensible strings.

Return ONLY valid JSON, no markdown, no explanation.
Example: {"Insomnia Drumcondra": "Coffee", "Circle K Swords": "Petrol & parking", "Sumup Taxi": "Taxis"}

Merchants to categorise:
${unknowns.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;
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
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw new Error('Anthropic error ' + response.status);
    const data = await response.json();
    const raw = data.content?.[0]?.text || '{}';
    let aiCategories = {};
    try {
      aiCategories = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch(e) {
      console.error('Categorise parse error:', e.message);
    }

    // Merge AI results with library hits
    Object.assign(categories, aiCategories);

    // ─── PHASE 3: SAVE AI RESULTS BACK TO LIBRARY ───────────────
    // Fire-and-forget — don't block the response
    for (const [merchant, cat] of Object.entries(aiCategories)) {
      if (cat && CATS.includes(cat) && cat !== 'Other') {
        // Only save high-confidence categorisations (skip "Other" — too noisy)
        saveMerchantToLibrary(merchant, cat).catch(() => {});
      }
    }

    res.json({
      categories,
      source: 'library+ai',
      stats: { libHits, aiCalls: unknowns.length },
    });
  } catch(err) {
    console.error('Categorise error:', err.message);
    // Even if AI fails, return what the library gave us
    res.json({
      categories,
      source: 'library-only-ai-failed',
      stats: { libHits, aiCalls: 0, error: err.message },
    });
  }
});

// ── MERCHANT CORRECTION ENDPOINT ──
// Called when a user manually re-categorises a transaction in the UI.
// Saves an anonymous correction record so we can detect community trends.
app.post('/merchant-correction', softAuth, rateLimit, async (req, res) => {
  const { merchant, suggestedCategory, correctedCategory } = req.body;
  if (!merchant || !correctedCategory) {
    return res.status(400).json({ error: 'Missing merchant or correctedCategory.' });
  }
  // Don't await — fire and forget
  saveCorrection(merchant, suggestedCategory, correctedCategory).catch(() => {});
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// COACH INSIGHTS — AI-generated observation cards for the dashboard
// ═══════════════════════════════════════════════════════════════
// The frontend sends a compact spending summary (not raw transactions).
// We return 3 structured insight cards. Frontend caches by data fingerprint
// in sessionStorage, so we typically get 1 call per upload per user session.

const COACH_SYSTEM_PROMPT = `You are Skint, an Irish personal finance observer. You write short, punchy observations about a user's spending data — like a clever friend pointing out patterns they wouldn't have spotted themselves.

CRITICAL RULES:
- You generate observations, NOT advice. Never say "you should", "try to", "consider cutting", "we recommend". State what's there.
- Use real numbers and merchant names from the data. Specificity is what makes this valuable.
- Use Irish context: euro symbols, Dublin pubs cost €6-9 a pint, Tesco/Lidl/Aldi are normal grocers.
- Keep each card body under 25 words. Cards are scannable, not paragraphs.
- Tone is friendly, dry, occasionally cheeky — never preachy or American. Think Irish friend, not life coach.
- Do NOT repeat what the rule-based insights already say (peak weekday, coffee vs groceries, savings rate %, yearly projection, subscription monthly total, small transactions count, unique merchant count, pub annualisation). You ADD to those, not repeat them.

Find 3 observations the user genuinely wouldn't notice themselves. Look for:
- Patterns across category + merchant combos ("3 of your top 5 spots are corner shops, not big shops")
- Behavioural signals ("Your Tesco visits are top-ups not big shops — 14 visits at €38 average")
- Specific merchant patterns or comparisons within the data
- Surprising ratios within the data (NOT generic ones like coffee vs groceries — that's already covered)
- Concentration patterns ("Half your delivery spend is from one place")

Output ONLY valid JSON in this exact shape, nothing else:
{"insights":[{"id":"unique-slug","title":"Short headline (4-7 words)","body":"The observation under 25 words","tone":"positive"|"warning"|"neutral","metric":"optional short tag like €240/yr"}]}

Return exactly 3 insights.`;

app.post('/coach-insights', requireAuth, requirePro, rateLimitCoach, async (req, res) => {
  const { summary } = req.body;
  if (!summary || typeof summary !== 'object') {
    return res.status(400).json({ error: 'Missing summary field.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  // Compact summary — keeps the prompt small and removes any PII
  const compact = {
    period_days: summary.daysInPeriod,
    total_spent_eur: Math.round(summary.totalSpent || 0),
    total_income_eur: Math.round(summary.totalIncome || 0),
    net_eur: Math.round(summary.net || 0),
    daily_avg_eur: Math.round(summary.dailyAvg || 0),
    weekend_share_pct: Math.round((summary.weekendShare || 0) * 100),
    personality: summary.personality,
    top_categories: (summary.topCategories || []).slice(0, 6).map(c => ({
      cat: c.category,
      eur: Math.round(c.total),
      share_pct: Math.round((c.share || 0) * 100),
      txns: c.count,
    })),
    top_merchants: (summary.topMerchants || []).slice(0, 8).map(m => ({
      name: m.merchant,
      cat: m.category,
      eur: Math.round(m.total),
      visits: m.visits,
    })),
    subscriptions: (summary.subscriptions || []).slice(0, 8).map(s => ({
      name: s.merchant,
      monthly_eur: Math.round(s.monthly),
      hits: s.occurrences,
    })),
    big_nights_count: summary.bigNightsCount || 0,
    pub_spend_eur: Math.round(summary.pubSpend || 0),
    delivery_spend_eur: Math.round(summary.deliverySpend || 0),
    grocery_spend_eur: Math.round(summary.grocerySpend || 0),
    coffee_spend_eur: Math.round(summary.coffeeSpend || 0),
    weekday_peak: summary.weekdayPeak,
  };

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
        max_tokens: 800,
        system: COACH_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Spending data:\n${JSON.stringify(compact, null, 2)}` }
        ],
      }),
    });

    if (!response.ok) throw new Error('Anthropic error ' + response.status);
    const data = await response.json();
    const raw = data.content?.[0]?.text || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('Coach parse error:', e.message, 'Raw:', raw.slice(0, 500));
      return res.status(502).json({ error: 'Coach response invalid.' });
    }

    if (!Array.isArray(parsed.insights)) {
      return res.status(502).json({ error: 'Coach response malformed.' });
    }

    const VALID_TONES = ['positive', 'warning', 'neutral'];
    const insights = parsed.insights
      .filter(i => i && i.id && i.title && i.body)
      .map(i => ({
        id: String(i.id).slice(0, 60),
        title: String(i.title).slice(0, 80),
        body: String(i.body).slice(0, 200),
        tone: VALID_TONES.includes(i.tone) ? i.tone : 'neutral',
        ...(i.metric ? { metric: String(i.metric).slice(0, 30) } : {}),
      }))
      .slice(0, 3);

    res.json({ insights });
  } catch (err) {
    console.error('Coach error:', err.message);
    res.status(502).json({ error: 'Coach temporarily unavailable.' });
  }
});
