// Penny — Skint's reflective finance companion.
// Drop this into the spendcoach-api repo and register in your main server file:
//   const pennyRoute = require("./penny");
//   app.post("/penny", pennyRoute);
//
// Env vars required on Render:
//   ANTHROPIC_API_KEY            (already set)
//   SUPABASE_URL                 (e.g. https://xxxx.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY    (server-only, never expose)
//
// Optional overrides (with sensible defaults):
//   PENNY_MODEL                  default "claude-haiku-4-5"
//   PENNY_MAX_TOKENS             default 300
//   PENNY_FREE_LIFETIME_LIMIT    default 3
//   PENNY_PRO_MONTHLY_LIMIT      default 50

const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const MODEL = process.env.PENNY_MODEL || "claude-haiku-4-5";
const MAX_TOKENS = Number(process.env.PENNY_MAX_TOKENS || 300);
const FREE_LIMIT = Number(process.env.PENNY_FREE_LIFETIME_LIMIT || 3);
const PRO_LIMIT = Number(process.env.PENNY_PRO_MONTHLY_LIMIT || 50);

// Per-user in-memory rate limit: 5 msgs / 60s.
// (Render restarts wipe this — acceptable for launch; Redis later.)
const RATE_BUCKET = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

function rateLimit(userId) {
  const now = Date.now();
  const stamps = (RATE_BUCKET.get(userId) || []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (stamps.length >= RATE_MAX) return false;
  stamps.push(now);
  RATE_BUCKET.set(userId, stamps);
  return true;
}

const SYSTEM_PROMPT = `You are Penny, a warm reflective companion built into Skint, an Irish personal finance app. You talk with the user about their money — not as an advisor, but as a clever, calm friend who happens to know their numbers.

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

function buildContextBlock(summary) {
  if (!summary || typeof summary !== "object") {
    return "FINANCIAL CONTEXT:\n(No statement data available yet — the user has not uploaded a statement.)";
  }
  const lines = [];
  lines.push("FINANCIAL CONTEXT (most recent statement period):");
  if (summary.daysInPeriod) lines.push(`Period: ${summary.daysInPeriod} days`);
  if (summary.totalIncome != null)
    lines.push(`Income: €${Math.round(summary.totalIncome)}`);
  if (summary.totalSpent != null)
    lines.push(`Spend: €${Math.round(summary.totalSpent)}`);
  if (summary.net != null) lines.push(`Net: €${Math.round(summary.net)}`);
  if (summary.dailyAvg != null)
    lines.push(`Daily average spend: €${Math.round(summary.dailyAvg)}`);
  if (summary.personality)
    lines.push(`Spender profile: ${summary.personality}`);
  if (Array.isArray(summary.topCategories) && summary.topCategories.length) {
    const cats = summary.topCategories
      .slice(0, 5)
      .map((c) => `${c.category} €${Math.round(c.total)} (${c.count} txns)`)
      .join(", ");
    lines.push(`Top categories: ${cats}`);
  }
  if (Array.isArray(summary.topMerchants) && summary.topMerchants.length) {
    const merch = summary.topMerchants
      .slice(0, 6)
      .map((m) => `${m.merchant} €${Math.round(m.total)} (${m.visits}x)`)
      .join(", ");
    lines.push(`Top merchants: ${merch}`);
  }
  if (Array.isArray(summary.subscriptions) && summary.subscriptions.length) {
    const subs = summary.subscriptions
      .slice(0, 6)
      .map((s) => `${s.merchant} €${Math.round(s.monthly)}/mo`)
      .join(", ");
    lines.push(`Subscriptions: ${subs}`);
  }
  if (summary.pubSpend) lines.push(`Pub spend: €${Math.round(summary.pubSpend)}`);
  if (summary.deliverySpend)
    lines.push(`Delivery spend: €${Math.round(summary.deliverySpend)}`);
  if (summary.grocerySpend)
    lines.push(`Grocery spend: €${Math.round(summary.grocerySpend)}`);
  if (summary.coffeeSpend)
    lines.push(`Coffee spend: €${Math.round(summary.coffeeSpend)}`);
  return lines.join("\n");
}

// Returns { userId, isPro, data } or throws.
async function verifyUser(supabase, authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const err = new Error("Missing auth.");
    err.status = 401;
    throw err;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user) {
    const err = new Error("Invalid token.");
    err.status = 401;
    throw err;
  }
  const userId = userRes.user.id;

  const { data: row } = await supabase
    .from("user_data")
    .select(
      "is_pro, penny_free_messages_used, penny_messages_this_month, penny_messages_month",
    )
    .eq("user_id", userId)
    .maybeSingle();

  return { userId, row: row || {} };
}

// Returns { ok: true } or { ok: false, status, message }.
function checkUsage(row, isPro) {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  if (isPro) {
    const sameMonth = row.penny_messages_month === currentMonth;
    const used = sameMonth ? Number(row.penny_messages_this_month || 0) : 0;
    if (used >= PRO_LIMIT) {
      return {
        ok: false,
        status: 429,
        message:
          "You have used a lot of Penny this month — she is resting until the 1st. The dashboard still has everything you need.",
      };
    }
    return { ok: true, currentMonth, used };
  }

  const used = Number(row.penny_free_messages_used || 0);
  if (used >= FREE_LIMIT) {
    return {
      ok: false,
      status: 402,
      message: "free_limit_reached",
    };
  }
  return { ok: true, used };
}

async function incrementUsage(supabase, userId, isPro, usage) {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (isPro) {
    await supabase
      .from("user_data")
      .update({
        penny_messages_this_month: (usage.used || 0) + 1,
        penny_messages_month: currentMonth,
      })
      .eq("user_id", userId);
  } else {
    await supabase
      .from("user_data")
      .update({
        penny_free_messages_used: (usage.used || 0) + 1,
      })
      .eq("user_id", userId);
  }
}

module.exports = async function pennyHandler(req, res) {
  // --- env checks
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !supabaseUrl || !serviceKey) {
    console.error("Penny: missing env vars");
    return res.status(500).json({ error: "Server not configured." });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- auth
  let userId, row;
  try {
    ({ userId, row } = await verifyUser(supabase, req.headers.authorization));
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  // --- rate limit
  if (!rateLimit(userId)) {
    return res
      .status(429)
      .json({ error: "Slow down a second — Penny is catching up." });
  }

  const isPro = Boolean(row.is_pro);

  // --- usage gate
  const usage = checkUsage(row, isPro);
  if (!usage.ok) {
    return res.status(usage.status).json({ error: usage.message });
  }

  // --- payload validation
  const { messages, summary } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Missing messages." });
  }
  if (messages.length > 30) {
    return res.status(400).json({ error: "Conversation too long." });
  }

  // Whitelist message shape — never trust client roles/content beyond what we expect.
  const sanitized = messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, 2000),
    }));

  if (sanitized.length === 0 || sanitized[sanitized.length - 1].role !== "user") {
    return res.status(400).json({ error: "Last message must be from user." });
  }

  // --- build context-injected user message
  const contextBlock = buildContextBlock(summary);
  // Inject context into the first user message so the model always has it.
  // We do this rather than appending to system prompt so prompt caching can
  // keep the system prompt static and cacheable later.
  const withContext = sanitized.map((m, i) => {
    if (i === 0 && m.role === "user") {
      return {
        role: "user",
        content: `${contextBlock}\n\n---\n\n${m.content}`,
      };
    }
    return m;
  });

  // --- call Anthropic
  const client = new Anthropic({ apiKey });
  let reply;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: withContext,
    });
    reply =
      response.content[0]?.type === "text" ? response.content[0].text : "";
  } catch (err) {
    console.error("Penny model error:", err);
    return res
      .status(502)
      .json({ error: "Penny is having a moment. Try again in a sec." });
  }

  if (!reply) {
    return res.status(502).json({ error: "Empty reply." });
  }

  // --- increment usage (fire-and-forget; don't block reply)
  incrementUsage(supabase, userId, isPro, usage).catch((e) =>
    console.error("Penny usage update failed:", e),
  );

  // --- compute remaining for the client (so UI can show "2 messages left")
  const remaining = isPro
    ? Math.max(0, PRO_LIMIT - ((usage.used || 0) + 1))
    : Math.max(0, FREE_LIMIT - ((usage.used || 0) + 1));

  res.json({ reply, remaining, isPro });
};
