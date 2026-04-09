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
app.use(express.json({ limit: '20mb' }));
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
  // 15 vision calls per hour per IP (raised from 3 — batches of 6 pages per call)
  const result = checkRateLimit(key, 'vision', 15, 60 * 60 * 1000);
  if (!result.allowed) {
    return res.status(429).json({
      error: `Too many PDF vision requests. Try again in ${result.resetIn} minutes.`
    });
  }
  // Also check daily limit: 10 per day
  const dailyResult = checkRateLimit(key, 'vision_daily', 10, 24 * 60 * 60 * 1000);
  if (!dailyResult.allowed) {
    return res.status(429).json({
      error: 'Daily PDF parsing limit reached. Try again tomorrow.'
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
app.post('/parse-pdf', rateLimit, async (req, res) => {
  const { text, rawLines } = req.body;
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
  const cache = await getMerchantCache();
  let communityMappings = '';
  if (Object.keys(cache).length > 0) {
    const entries = Object.entries(cache).slice(0, 200);
    communityMappings = '\n\nCOMMUNITY DECODED MERCHANTS (highest priority — use these first):\n' +
      entries.map(([g, d]) => `"${g}" = ${d}`).join('\n');
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
        system: PDF_PARSE_PROMPT + communityMappings,
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
app.post('/coach', rateLimitCoach, async (req, res) => {
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
Return ONLY a valid JSON array, no other text, no markdown, no explanation.
Skip non-transaction rows like "Balance B/fwd", "Balance Bfwd", "Closing Balance", "Overdraft Information".
If you cannot find any transactions, return an empty array [].`;
app.post('/parse-pdf-vision', rateLimitVision, async (req, res) => {
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
app.post('/parse-ptsb', rateLimitParse, async (req, res) => {
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
// ── STRIPE CHECKOUT ──
app.post('/create-checkout-session', rateLimitCheckout, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured.' });
  const { userId, email } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId.' });
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
  let event;
  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
      : JSON.parse(req.body);
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
app.post('/categorise', rateLimit, async (req, res) => {
  const { merchants } = req.body;
  if (!merchants || !Array.isArray(merchants) || merchants.length === 0) {
    return res.status(400).json({ error: 'Missing merchants array.' });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server configuration error.' });
  const CATS = ['Groceries','Food delivery','Takeaways','Pubs & bars','Coffee','Eating out','Taxis','Public transport','Petrol & parking','Travel','Subscriptions','Gaming','Clothing','Health','Fitness','Shopping','Rent & bills','Cash withdrawal','Transfers','Income','Other'];
  const prompt = `You are a transaction categoriser for Irish bank statements.
Given a list of merchant/transaction names, return a JSON object mapping each merchant to its category.
Use ONLY these categories: ${CATS.join(', ')}
Rules:
- Mace, Londis, Daybreak = Groceries
- Sumup/Square/iZettle followed by a word = categorise by what follows (Sumup Taxi = Taxis, Sumup Steak = Eating out)
- Any pub, bar, nightclub = Pubs & bars
- Vape shops = Other
- ATM = Cash withdrawal
- Revolut = Transfers
- If genuinely unknown = Other
Return ONLY valid JSON, no markdown. Example:
{"Mace Drumcondra": "Groceries", "Sumup Taxi": "Taxis"}
Merchants to categorise:
${merchants.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;
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
    let categories = {};
    try {
      categories = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch(e) {
      console.error('Categorise parse error:', e.message);
    }
    res.json({ categories });
  } catch(err) {
    console.error('Categorise error:', err.message);
    res.status(502).json({ error: 'Categorisation temporarily unavailable.' });
  }
});
