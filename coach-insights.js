// Coach Insights — generates the 3 cards on the dashboard ("Skint's take").
// Pro-only as of this revision. Drops into spendcoach-api alongside penny.js.
// Register in your server file:
//   const coachRoute = require("./coach-insights");
//   app.post("/coach-insights", coachRoute);

const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const MODEL = process.env.COACH_MODEL || "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are Skint, an Irish personal finance observer. You write short, punchy observations about a user's spending data — like a clever friend pointing out things they wouldn't have spotted themselves.

CRITICAL RULES:
- You generate observations, NOT advice. Never say "you should", "try to", "consider cutting", "we recommend". State what is there. The user decides what to do.
- Use real numbers and merchant names from the data. Specificity is what makes this valuable.
- Use Irish context: euro symbols, Dublin pubs cost €6–9 a pint, Tesco/Lidl/Aldi are normal grocers.
- Keep each card body under 25 words. Cards are scannable, not paragraphs.
- Tone is friendly, dry, occasionally cheeky — never preachy or American. Irish friend, not life coach.
- Never reproduce the spender profile blurb or restate what the rule-based cards already say (peak weekday, coffee vs groceries, savings rate, projection, subscription totals, small transactions count, unique merchant count). You are ADDING to those, not repeating them.
- Never use the words "AI", "insights", "patterns", or "analysing" in titles or bodies.

Find 3 observations the user genuinely wouldn't notice themselves. Look for:
- Combos across category + merchant ("3 of your top 5 spots are corner shops, not big shops")
- Date clustering ("Three subscriptions hit on the 1st")
- Behavioural signals ("Your Tesco visits are top-ups, not big shops — 14 visits at €38 average")
- Surprising ratios within the data
- Specific merchant patterns

Output ONLY valid JSON in this exact shape, nothing else:
{"insights":[{"id":"unique-slug","title":"Short headline (4–7 words)","body":"The observation under 25 words","tone":"positive"|"warning"|"neutral","metric":"optional short tag like €240/yr"}]}

Return exactly 3 cards.`;

async function verifyPro(supabase, authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing auth." };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user) {
    return { ok: false, status: 401, error: "Invalid token." };
  }
  const { data: row } = await supabase
    .from("user_data")
    .select("is_pro")
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if (!row?.is_pro) {
    return { ok: false, status: 402, error: "Pro required." };
  }
  return { ok: true, userId: userRes.user.id };
}

module.exports = async function coachInsightsHandler(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Server not configured." });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const auth = await verifyPro(supabase, req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { summary } = req.body || {};
  if (!summary || typeof summary !== "object") {
    return res.status(400).json({ error: "Missing summary field." });
  }

  const compact = {
    period_days: summary.daysInPeriod,
    total_spent_eur: Math.round(summary.totalSpent || 0),
    total_income_eur: Math.round(summary.totalIncome || 0),
    net_eur: Math.round(summary.net || 0),
    daily_avg_eur: Math.round(summary.dailyAvg || 0),
    weekend_share_pct: Math.round((summary.weekendShare || 0) * 100),
    personality: summary.personality,
    top_categories: (summary.topCategories || []).slice(0, 6).map((c) => ({
      cat: c.category,
      eur: Math.round(c.total),
      share_pct: Math.round((c.share || 0) * 100),
      txns: c.count,
    })),
    top_merchants: (summary.topMerchants || []).slice(0, 8).map((m) => ({
      name: m.merchant,
      cat: m.category,
      eur: Math.round(m.total),
      visits: m.visits,
    })),
    subscriptions: (summary.subscriptions || []).slice(0, 8).map((s) => ({
      name: s.merchant,
      monthly_eur: Math.round(s.monthly),
      hits: s.occurrences,
    })),
    big_nights_count: summary.bigNightsCount,
    pub_spend_eur: Math.round(summary.pubSpend || 0),
    delivery_spend_eur: Math.round(summary.deliverySpend || 0),
    grocery_spend_eur: Math.round(summary.grocerySpend || 0),
    coffee_spend_eur: Math.round(summary.coffeeSpend || 0),
    weekday_peak: summary.weekdayPeak,
  };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Spending data:\n${JSON.stringify(compact, null, 2)}`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Coach parse error:", e, "Raw:", text);
      return res.status(502).json({ error: "Coach response invalid." });
    }

    if (!Array.isArray(parsed.insights)) {
      return res.status(502).json({ error: "Coach response malformed." });
    }

    const valid = parsed.insights
      .filter((i) => i && i.id && i.title && i.body)
      .map((i) => ({
        id: String(i.id).slice(0, 60),
        title: String(i.title).slice(0, 80),
        body: String(i.body).slice(0, 200),
        tone: ["positive", "warning", "neutral"].includes(i.tone)
          ? i.tone
          : "neutral",
        metric: i.metric ? String(i.metric).slice(0, 30) : undefined,
      }))
      .slice(0, 3);

    res.json({ insights: valid });
  } catch (err) {
    console.error("Coach error:", err);
    res.status(502).json({ error: "Coach temporarily unavailable." });
  }
};
