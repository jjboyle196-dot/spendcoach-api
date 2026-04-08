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
    // Upsert — if garbled already exists, increment count
    const rows = mappings.map(m => ({
      garbled: m.garbled.trim(),
      decoded: m.decoded.trim(),
      count: 1,
      updated_at: new Date().toISOString(),
    }));
    await supabaseRequest('/merchant_map', 'POST', rows);
    // Invalidate cache so next request reloads
    cacheLastLoaded = 0;
    console.log(`Saved ${rows.length} merchant mappings`);
  } catch (e) {
    console.error('Failed to save merchant mappings:', e.message);
  }
}

// Load cache on startup
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
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
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
const SYSTEM_PROMPT = `You are Skint, a sharp and direct Irish personal finance coach.
Analyse the user's spending and give 2-3 specific, actionable insights in plain conversational language.
Be direct and a bit blunt — mention actual numbers and specific merchants. 
Use Irish context where relevant: pints cost €6-9 in Dublin pubs, Tesco/Lidl/Aldi are normal grocers, Circle K is a petrol station.
If the user has a spending personality type mentioned, reference it naturally once.
If the user's name is given, use it once near the start.
If month-on-month data is given, reference whether they improved or got worse.
End with one concrete weekly challenge as a single sentence starting with "Challenge:".
Keep the total response under 130 words. No bullet points. Conversational Irish tone — not preachy, not American.`;

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

// Clean up old entries every 30 mins to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts.entries()) {
    if (now - entry.windowStart > 24 * 60 * 60 * 1000) {
      requestCounts.delete(key);
    }
  }
}, 30 * 60 * 1000);

// Different limits per endpoint type
function rateLimitCoach(req, res, next) {
  const key = getRateLimitKey(req);
  // 5 coaching requests per hour per IP
  const result = checkRateLimit(key, 'coach', 5, 60 * 60 * 1000);
  if (!result.allowed) {
    return res.status(429).json({
      error: `Too many AI coaching requests. Try again in ${result.resetIn} minutes.`
    });
  }
  next();
}

function rateLimitVision(req, res, next) {
  const key = getRateLimitKey(req);
  // 3 vision parses per hour per IP — these are expensive
  const result = checkRateLimit(key, 'vision', 3, 60 * 60 * 1000);
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
  // 20 text parses per hour — cheap, just text processing
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
  // 5 checkout attempts per hour — prevent abuse
  const result = checkRateLimit(key, 'checkout', 5, 60 * 60 * 1000);
  if (!result.allowed) {
    return res.status(429).json({
      error: `Too many checkout attempts. Try again in ${result.resetIn} minutes.`
    });
  }
  next();
}

// Keep old rateLimit function for backward compat
function rateLimit(req, res, next) {
  return rateLimitParse(req, res, next);
}

// ── COST GUARD — track estimated daily API spend ──
let dailyCostTracker = { date: '', visionCalls: 0, coachCalls: 0, parseCalls: 0 };

function trackCost(type) {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCostTracker.date !== today) {
    dailyCostTracker = { date: today, visionCalls: 0, coachCalls: 0, parseCalls: 0 };
  }
  if (type === 'vision') dailyCostTracker.visionCalls++;
  if (type === 'coach') dailyCostTracker.coachCalls++;
  if (type === 'parse') dailyCostTracker.parseCalls++;

  // Rough cost estimates: vision ~$0.20/call, coach ~$0.01, parse ~$0.01
  const estimatedCost = (dailyCostTracker.visionCalls * 0.20) +
                        (dailyCostTracker.coachCalls * 0.01) +
                        (dailyCostTracker.parseCalls * 0.01);

  if (estimatedCost > 5) {
    console.warn(`⚠️ COST ALERT: Estimated daily API spend is $${estimatedCost.toFixed(2)} — vision: ${dailyCostTracker.visionCalls}, coach: ${dailyCostTracker.coachCalls}, parse: ${dailyCostTracker.parseCalls}`);
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
"àà åä êá &<í(" = DD GC RE PLUM
"àà â!êà å ñë áñêá ++" = DD Bord Gais Eireann
"àà îñêåñ+ (áàñ  ñêá< +à" = DD Virgin Media Ireland
"ñäè [?Ç> â?X%Á" = ICT John Boyle (income)
"ñäè [!ç+ â!ß<á" = ICT John Boyle (income)
"[í< [!ç+ â!ß<á !â ì+" = Jun John Boyle (income)
"ä/ËÇ á/Ê>ÁÀ" = Cash Earned (interest)
"áÌø%?ÊÁ (?>ÈÇ%" = Explore Monthly Fee
"àÁÂÑÈ ä/ÊÀ äÇ/ÊÅÁ" = Debit Card Charge
"êÈÀ àÑÊÁÄÈ àÁÂÑÈ" = Direct Debit Refund
"êÈÀ àà äÇ/ÊÅÁ" = DD Charge Refund
"áíê!ë& ê ã ñ" = EuroSpar
"( äá ê çá+ß" = McDermott Kenny
"( äá àêí(ä!+" = McDermott Drumcondra
"( äá âáèèßëè" = McDermott Bettystown
"( äá ë +àß(!" = McDermott Sandy
" <àñ ëè!êáë" = Aldi Stores
"<ñà< ñêá< +à" = Lidl Ireland
"+áèã<ñì ñ+èá" = Netflix
"(ÑÄÊ?Ë?ÃÈ" = Microsoft/Xbox
"áì&êáëëî&+ä" = ExpressVPN
"ä!ñ+ ä!ñ+â ëá" = Coinbase
"íâáê  á è" = Uber Eats
"íâáê á èë" = Uber Eats
"íâáê èêñ&" = Uber Trip
"íâáê êñàáë" = Uber Rides
"âñ+ +äáä!(" = Bun n Cheese
"ë& ê ç!<<ßïá" = Spar Hollywell
"ë& ê à (á ëè" = Spar Drumcondra
"ë& ê (áêêñ!+" = Spar Merrion
"âíë ëè!&  å" = Bus Stop
"èçá ñ+èáê+ è" = The Internet Cafe
"äÍë/Ä,ë <?Í>" = Cusacks Lounge
"ëí(í& ëèá&" = Sumup Steak
"à ß âêá ." = Daybreak
"à ßâêá . ! ä" = Daybreak OC
"(í<<ñå +ë &í" = Mulligans Pub
"ñ>Ë?_>Ñ/ àÊÍ" = Insomnia Drumcondra
"äê ââß [!ë" = Crabby Jos
" î!ä  ç +àïá" = Avoca
"ãñââáê ( åáá" = Fibber Magees
"!ÎÁÊÀÊ ãÈ ãÁÁ" = Overdraft Fee
"< åíá<áíè!+" = L Gueuleton
"âíè<áêë äç!ä" = Butlers Chocolate
".ãä ïáëè(!êá" = KFC Westmoreland
" êâ!êáèí(" = Arboretum
"ñêñëç ê ñ< ç" = Irish Rail
"(äë!ê<áßë" = McCharleys
"(á( ë" = Memos
"ëé ß ( (!êñ" = Sq By Mori
"ã< ñåçè ä<íâ" = Flight Club
"á ëß ãíá<" = Easy Fuel
"!à?>?ÅÇÍÁË" = O Donoghues
" à ïë!+ ëè" = Dawson Street
"å/ÃÃ>Á" = Gaffneys
"à!(ñ+!ë &ñ]" = Dominos Pizza
"èê& áîá+èë" = TRP Events
"+ß î/øÁÂ/Ê" = NY Vapebar
"èçá åá!êåá" = The George
"â< ä.âñêà ê" = Blackbird Restaurant
"è!+áêë &íâ" = Toners Pub
"è ëèß å êàá+" = Tasty Garden
"äç &èáêë â!!" = Chapters Bookstore
"[!ç+ . î + å" = John V Ning
"èçá â <à á å" = The Bald Eagle
".[è îÁ>ÀÑ>Å" = JKT Vending
"ËÇÁÑ>Ä?_" = Shein
"ç!(á ëè!êá" = Home Store
"ëá  åêááàßä!" = Sea Greedy Co
"è êåáè" = Target
"çíàë?> ëè" = Hudson St
" &&<á ëè!êá" = Apple Store
"ñç!&" = iHop
"ëè êâíä.ë" = Starbucks
"ëé èçá äá<è" = Sq The Delta
"åñ+ & < äá" = Gun and Castle
"( äá âáèèßëè" = McDe Bettystown
"äñ+áï!ê<à" = Cineworld
"â!+!â!" = Bonomi
"ã!å êèßë ëç!" = Fogarty Shoes
"ëé èçá âñå" = Sq The Big (venue)
"êñ!è" = Riot Bar
"(äåê èè +ë ê" = McGrotty ns
"èÊÍÁÈ/%Á>È:" = TrueTalent
"+Í_ÂÁÊ  +ÁÏ" = Number One New
"çñä.áßë &ç ê" = Hickeys Pharmacy
".á++áàßë &íâ" = Kennedys Pub
"ëí&áêàêíå ëè" = Superdrug
"èíèçñ<<ë ñ<" = Tuthills
"&á++áßë ( êß" = Penneys Primark
"ä  ê!ñ í%" = CA Roi UL (ATM)
" ä ê!ñ í%" = CA Roi UL (ATM)
"â á>ÈÁÊÈ" = B Entertainment
"ëçßë ä!ëèäí" = Shays Costcu
"ààáã á>ÈÁÊÈ" = DDEF Entertainment
"ëí&áê  ëñ  &" = Super Si P
"äá+èê  & ê+á" = Centre Parne
"ëí(í& å <" = Sumup GL
"ëé  âë!<íèá" = Sq Absolute Gym
"ëé èê äáë" = Sq Trades
"ëé î &áîá+à" = Sq V Weekend
"ëí(í& èçá" = Sumup The
"( ê. ã <ä!+á" = Mr Falcone
"äè ñêñëç <ñãá çá <èç" = CT Irish Life Health
"äè ä?>ÎÁÊ/ í. <ÈÀ" = CT Convera UK Ltd
"ï??ÀÑÁË  ÑÊë" = Woodies IRS
"äÊÁøÁë />À Ï" = Crepes and Waffles
"(/Ç/ÊÅ á>ÈÁÊ" = Maharaj
"<!íåç !ïá< !" = Lough Owel
"èÊÑÂÁ ã??À ä" = Tribe Food Co
"ëé ê!!ëèáêë" = Sq Roosters Barber
"! êáñ<<ßë ë" = O Reillys
"àñ (!+à &ñ]]" = Du Mond Pi
"!<à ëäç!!<ç!" = Old Schoolhouse
"+ß îÁ>À_?ÊÁ" = NY Vendmore
"àÁÄ/ÈÇ%?> !Ä" = Decathlon
"ëé &!à ãáëè" = Sq Pod Fest
"ëé à îáë äá" = Sq D Ves De
"ëé &!à ãáëè" = Sq Pod Festival
"(Á_/Ë" = Memas Cafe
"ãÊ/>ÄÑë ?¦?" = Francois Restaurant
"ëí(í& è ìñ" = Sumup Taxi
"âíêåáê .ñ+å" = Burger King
"ëí(í& &çñ<" = Sumup Phil
"áë&ñêá < âë" = Espire Labs
"&á++áßë ! ä!" = Penneys OC
"äá+èê  àêí(ä" = Centre Drumcondra
"äá+èê  àêí(ä" = Centre Drumcondra
"äá+èê  à!êëá" = Centre Dorset
"( äá âáèèßëè" = McDermott Bettystown
"ãñââáê ( åáá" = Fibber Magees
"ïçá< +ë" = Wheels
"äç ê<ñáë ã" = Charlies
"ì< ïñä.<!ï ë" = XL Wicklow St
"ë ( (ä.]ß" = S M McKby
"èçá <ñèè<á å" = The Little G
"ãÁÂ [/> ä/ËÇ" = Feb Jan Cash
"/Ë/Ñ%X" = Asailly
"!êä  " = ORC
"ëé &!à ãáëè" = Sq Pod Fest
"ëé èçá âñå" = Sq The Bug
"çáàñå +ë èçá" = Hedigan The (pub)
"ëé ë( (ä.]ß" = Sq SM McKby
"ãñââáê ( åáá" = Fibber Magees
"ëé & ï+ ëç!" = Sq Win Sho
"ã<ñåçè ä<íâ" = Flight Club
"& ß& < ñèí+" = PBOL ITION (online)
"& ß& < íâáê" = PBOL Uber
"ïïï ( ]!+" = WWW MJON (online)
" (]+&ÊÑ_Á àá" = Amazon Prime De
" ( ]!+ &êñ(á" = Amazon Prime
"â á+ÈÁÊÈ" = B Entertainment
"ààáã á>ÈÁÊÈ" = DDF Entertainment
"âã á>ÈÁÊÈ" = BF Entertainment
"áââ  á>ÈÁÊÈ" = EBB Entertainment
" ää  ê!ñ í%" = ACC Roi UL
"ä  ê!ñ í%" = CA Roi UL
"+ß äÑÊÄ%Á ." = NY Circle
"ëé & ï+ ëç!" = Sq Win Sho (Square payment terminal)
"ëé ñèë !íê" = Sq Its Our
"ëé  âë!<íèá" = Sq Absolute
"ëé î &áîá+à" = Sq V Weekend
"ëé âë!<íèá" = Sq Absolute Gym
" äè ñêñëç <ñãá çá <èç" = CT Irish Life Health
"ëé & ï+ ëç!" = Sq Win Sho
"& àà<á+áè" = P Addlenet (PayPal/online)
"ëé ñèë !íê" = Sq Its Our
"ãêáá+!ïäáä" = Freshway ED
"ãêáá+!ïäáä." = Freshway EDE
"àí++áë çá+êß" = Dunnes Henry St
"( äá âáèèßëè" = McDermott Bettystown
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
"ãêáá+!ïäîã" = Freshway VF
"ãêáá+!ïä(ß" = Freshway MY
"ãêáá+!ïä ää<" = Freshway CCL
"ãêáá+!ïä!ìä" = Freshway OXC
"ãêáá+!ïäñ" = Freshway I
"ãêáá+!ïäñïì" = Freshway IWX
"ãêáá+!ï[ã" = Freshway JF
"ãêáá+!ïäç â" = Freshway HB
"ãêáá+!ïäâ]" = Freshway AB2
"ãêáá+!ïäã&" = Freshway FP
"è.+ ãêáá+!ïä.]" = Freshway
"ãêáá+!ïä< å" = Freshway
"ãêáá+!ïäç" = Freshway H
"ãêáá+!ïäã" = Freshway F
"ãêáá+!ïä è" = Freshway T
"ãêáá+!ïäîã" = Freshway
"ãêáá+!ï ää<" = Freshway CCL
"ãêáá+!ïä!á" = Freshway OE
"ãêáá+!ïä!ñ" = Freshway OI
"ëí(í& ëèá&" = Sumup Steak
"ëí(í& ë +à" = Sumup Sand
"ëí(í& +êå" = Sumup NRG
"ëí(í& äçêñ" = Sumup Chri
"ëí(í& å <" = Sumup GL
"ëí(í& &êñß" = Sumup Priy
"ëí(í& è ìñ" = Sumup Taxi
"ëí(í& &çñ<" = Sumup Phil
"ëí(í& áÎÁ>È" = Sumup Event
"ëí(í& èê&" = Sumup TRC
"ëí(í& èçá" = Sumup The
"ëí(í& è ìñ" = Sumup Taxi
"ëí(í& å <" = Sumup GL
"ëé & ï+ ëç!" = Sq Win Sho
"& ê.ë &ç ê(" = A RKS PH RM (pharmacy)
"äá+èê  à!êëá" = Centre Dorset St
"â!+!â!" = Bonomi Cafe
"ëá& è.+ ãêáá+!ïä!ìä" = Freshway
"(äàñ><àë" = McDonalds
"<ñà< ñêá< +à" = Lidl Ireland
"<ñà< ñê" = Lidl
"<!èèë ä ãá â" = Lotts Cafe Bar
"åñ+ & < äá" = Gun and Castle
"åñ+ & < äá" = Gun and Castle
"& ààß &!ïáê" = Paddy Power
"ãêáá+!ï ä" = Freshway D
"ëé &!à ãáëè" = Sq Pod Fest
"ëé &!à ãáëè" = Sq Pod Fest
"ëé &!à ãáëè" = Sq Pod Festival
"ëé &!à ãáëè" = Sq Pod Fest
"&áèëè!&" = Petstop
"íâê &á+àñ+å" = Ubr Pending
"äá+èê  " = Drumcondra Centre
"& ê.ë &ç ê(" = Arks Pharmacy
"(äà!+ <àë" = McDonald ALDS
"ä ãá á+ ëáñ+" = Cafe en Seine
"è.+  &&<áåêáá+ (ê" = AppleGreen MR
"ëé &!à ãáëè" = Sq Pod Fest
"è.+ (!Ç/Êå á>ÈÁÊ" = Maharaj Entertainment
"á>ÈÁÊÈ" = Entertainment venue
"ëé ë( (ä.]ß" = Sq SM McKby
"ãñââáê ( åáá" = Fibber Magees
"ï/?ÀÑÁË" = Woodies
"è/ëèß å êàá+" = Tasty Garden
"ëè êâíä.ë" = Starbucks
"é í/ÊÈÁÊ%ß ñ>ÈÁÊÁËÈ" = Quarterly Interest
"(/Ê éÍ/ÊÈÁÊ%ß ñ>ÈÁÊÁËÈ" = Mar Quarterly Interest
"[í+ éÍ/ÊÈÁÊ%ß ñ>ÈÁÊÁËÈ" = Jun Quarterly Interest
"&( äë â/Ê" = PM Cas Bar
"áíê!ë& ê ç +" = EuroSpar North
"èÇÁ î/øÁ <ÑÃ" = The Vape Life
"â!!èë êáè ñ<" = Boots Retail
"ë& ê +!êèç ë" = Spar North Side
" è( àÍÂ%Ñ>" = ATM Dublin
"ä ëëñàßë" = Cassidys
"+ñä!ë è .á" = Nicos Takeaway
"äè á< ñ+á â!ß<á äí++ñ+åç" = CT Eline Boyle Cunningh
"ç <á &çñâëâ!" = Hale Phibsboro
"åê! ê.áë äá+" = Groanrkes Denny
"çá<á> â!ß<á [[" = Helen Boyle (transfer)
"&ñáêäá ! è!!<á âñ<<ë" = Pierce OToole Bills
"ïñåï (" = Wigwam Bar
"êñîáê â ê" = River Bar
" ++áë â ê" = Annes Bar
"èçá ï!ê.( +ë" = The Workmans
"ãêáá+!ï!íß" = Freshway OUY
"äê!.á & ê. ë" = Croke Park
"èçá å èá +áï" = The Gate New
" âê .áâ âê" = ABR Web BR
"<<!ßàë&ç ê(" = Lloyds Pharmacy
"èçá ä è  +à" = The Cat And Dog
"äï çÁ>ÊX ëÈ" = CW Henry St
" ëç  ä<!èçñ+" = Asos Clothing
"&!à ãáëèñî <" = Pod Festival
"ëî .ñ<( ñ+ç" = SV Kilm Inch
"èçá âíèè!+ ã" = The Button Factory
"áÄÑÊÁÈÈÁ" = Ecigarette
"&ßå( <ñ!+ &í" = Pygmalion Pub
".ñ+å +íèêñèñ" = King Nutrition
"<ñ+.áì&êáëë" = Linkexpress
"èçá çá <èç ë" = The Health Store
"èçá ïÑ%Á. ã?" = The Wiley Fox
"(íëñä ãáëèñî" = Music Festival
"ë& çáàãñè+áë" = SP Headfitness
"è??å??Àè?å" = Too Good To Go
"è??å??Àè?å â" = Too Good To Go B
"ï <ëçë" = Walshes
"ãêáá+!ïèêë" = Freshway TRS
"ãêáá+!ïìãà" = Freshway XFD
"ãêáá+!ïêá" = Freshway RE
"ãêáá+!ï!íß" = Freshway OUY
"ãêáá+!ïçî" = Freshway HV
"ãêáá+!ïxãà" = Freshway XFD
"èçá <ñîñ+å ê" = The Living Room
"å?ÈÑ>ÀÁÊÄ?_" = Tinder
"àáë(!+àë" = Desmonds
"+áïëê ñ< ä!+" = Newslink Con
"àá<ñîáê!!" = Deliveroo
"çí((åê!í&" = Humm Group
"! êáñ<<ßë ëí" = O Reillys Su
"ë& ê è <â!è" = Spar Talbot St
"<íä ! êñ à  êá+è" = Luc O Ri D Rent
"î&& && !+<ñ+á" = VPP BB Online
"àà è+à! ãñè+áëë ñêá<" = DD TNDO Fitness Ireland
"äè ëáè +è  èê +ë(ñëëñ!+ë" = CT Set NT Transmissions
"âÍ%," = Bulk Wholesale
"( ì!< ëëè+ ê" = M XOL SSTN R
"ä ëëñàßë" = Cassidys Pub
"ëÄÑÊÁÈÈÁ" = Ecigarette
"çáàñå +ë èçá" = Hedigan The
"[í+ <íä ! êñ à  êá+è" = Jun Luc O Ri Rent
"&ñáêäá ! è!!<á âñ<<ë" = Pierce OToole Bills
" &ê <íä ! êñ à  êá+è" = Apr Luc O Ri Rent
"( ß <íä ! êñ à  êá+è" = May Luc O Ri Rent
"( ß çá<á> â!ß<á [[" = May Helen Boyle
"[í+ &!ë ë& çáàãñè+áë" = Jun SP Headfitness
"( ìë è .á ï" = M Xst Ke W
"ä ëëñàßë" = Cassidys
"ãêáá+!ïèêë" = Freshway TRS
"&ßå( <ñ!+ &í" = Pygmalion Pub
"åê! ê.áë äá+" = Groanrkes
"(äå!ï +ë" = McGowan's
"ëäêñââ<áë" = Scramblers

"<ëë ( êß ëèê" = LSS Mary Street
"â!!ç!!ä!( í" = Bookhoocom (Booking.com)
"ï ïç!ëèá<ï!ê<à" = WWW Hostelworld
"ãêáá+!ïã" = Freshway F
"ã< + å +ë êá" = Flannagans Restaurant
"èçá ëè åë çá" = The Stags Head
"èçá [ ê" = The Jar
"èçêáá ñêá< +à" = Three Ireland
"äá+èê      " = Centre
"áíê!ë& ê ç +" = EuroSpar North
"â!!ç!!ä!( í" = Booking.com
"< & ä êà  &" = La Pacha (club)
"ã< + å +ë êá" = Flannagans
"ëè åë çá à" = Stags Head Dublin
"&á++áßë ! ä!" = Penneys OC
"èÇÁ â +.áêë" = The Bankers
"à ßâêá .  ëè" = Daybreak Store
"äá+èê  à (á" = Centre Dame St
"äá+èê  ïáëè(!" = Centre Westmoreland
"(ñà+ñåçè áìø" = Midnight Express
"èáëä! ëè!êáë" = Tesco Stores
"ë& ê ä!<<áåá" = Spar College
"ë& ê ! ä!++á" = Spar OConnell
"èÇÁ î/øÁ <ÑÃ" = The Vape Life
"ïçá< +ë" = Wheels
"(äà!+ <àë" = McDonalds
"ß ( (!êñ ñ]" = Y By Mori
"ß ( (!êñ ëíë" = Y By Mori Sus
" è( àíâ ä!<<áåá å" = ATM Dublin College Green
" è( àÍÂ%Ñ>" = ATM Dublin
" è( àÍÂ<Ñ+" = ATM Dublin
"àÍÂ<ÑÂ" = Dublin
"&& !+<ñ+á" = PP Online
"è!( ë ñ+èáê+á" = Toms Internet
"<ñëâ!" = Lisbon
"(ñëáêñä!êàñ" = Misericordia
"<ÑËÂ?/" = Lisbon
"â!<èáíä" = Boulteud (restaurant)
" àíâ" = Adub
"êß + ñê" = RYN IR
"! åñ<ñ+ë" = O Gilins
"è íà!  (!âñ<" = Teudo Mobile
" áê!&!êè!" = Aeroporto
"& í<  á êñä" = Pauls Eric
"(ñëáêñä!êàñ  " = Misericordia
" è( (ñëáêñä!êàñ" = ATM Misericordia
" è( <ñëâ!" = ATM Lisbon
"(íëè êà  ç (" = Mustard Ham
"ë +è [!êàñ ç" = Sant Jordi H
"è êèñ+á" = Tartine
"(áí ëí&áê  ê" = MEU Super AR
"&êñ( ê. <ñëâ!" = Primark Lisbon
"(ñ+ñ(áêä à!" = Minimerced O
" è( (ñëáêñä!êàñ" = ATM Misericordia
" è( <ÑËÂ?" = ATM Lisbon
"å%?Î? ( ê" = Glovo Mar
"â ê à! êñ!" = Bar Daorio
"ä!ããáá &!ñ+è" = Coffee Point
"& êéíáë àá ë" = Parques de Si
"ãí+à ä ! äí<" = Fund Co Cul
"â ê à! êñ!" = Bar Daorio
"&!ëè! àá îá+" = Posto de Ven
"ä& <ñëâ!  ê!" = CP Lisboa RO
"áààñá ê!ä.áè" = Eddie Rockets
"èçá â< ä. âí" = The Black Bull
"ä< ê.áë â ê" = Clarkes Bar
"à!(ñ+ñäë è" = Dominics T
"ãêáá+!ïâä<" = Freshway BCL
"èçá äê!ëë" = The Cross
"à!(ñ+ñäë &ñ]]" = Dominos Pizza
"äï çÁ>ÊX ëÈ" = CW Henry St
"ë& ê +!êèç ëñàá" = Spar Northside
" è( åê ãè!+ëëâ(ñèç ëè" = ATM Grafton Smith St
"î .áç!áë" = V Kehoes (pub)
"ã?Ê_ÁÊ%ß" = Formerly
"êáëñàá+è  àî" = Resident Adv
"à (!+à &ñ]]" = Dd Mond Pizza
" è( åê ãè!+ ëèêáá" = ATM Grafton Street
"ñ+ë!(+ñ  àêí" = Insomnia Dru
"èçá â ä. & å" = The Back Page
"+ß ä?ÊÁÎÁ>À" = NY Corevent
" è( <ÑËÂ?/" = ATM Lisbon
"åê! ê.áë äá+>ß" = Groanrkes Denny
" è( (ÑËÁÊÑä?ÊÀÑ" = ATM Misericordia
" è( <ÑËÂ?" = ATM Lisbon
"ä%/Ê,ÁË â/Ê" = Clarkes Bar
"à?(Ñ>Ñä%Ë" = Dominicls
"ã%ÑÅÇÈ ä%ÍÂ" = Flight Club
"èÇÁ äÊ?ËË" = The Cross
"â??ÈÇ?Ä?_ í" = Boohoocom (Boohoo)
"ã%ÑÅÇÈ ä%Í" = Flight Club
"ãñââáê ( åáá" = Fibber Magees
"ëÄÊÑÂÂ%ÁÊ" = Scramblers

For amounts: look for numeric values after the merchant name. Withdrawn column = negative amount, Paid In column = positive.
For dates: combine month prefix + day number visible on the line. Use year from statement header.

AIB BANK STATEMENT FORMAT:
AIB statements use readable text with this layout:
- Date format: "01 Apr 2025" or "01/04/2025"
- Columns: Date | Details | Debit | Credit | Balance
- Debit = money out (negative), Credit = money in (positive)
- Amounts may have commas e.g. "1,234.56" — strip commas before parsing
- Common AIB transaction prefixes: VDC (Visa debit contactless), VDP (Visa debit purchase), DD (direct debit), CR (credit), TFR (transfer), ATM
- AIB dates in "DD MMM" format need the year from the statement header

BANK OF IRELAND FORMAT:
- Date format: DD/MM/YYYY
- Columns: Date | Details | Debit | Credit | Balance
- Similar to AIB — readable text, amounts may have commas

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

  // Build prompt — inject community merchant map if available
  const cache = await getMerchantCache();
  let communityMappings = '';
  if (Object.keys(cache).length > 0) {
    const entries = Object.entries(cache).slice(0, 200); // cap to avoid token overrun
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

    // If rawLines provided, extract and save new garbled→decoded mappings
    if (rawLines && Array.isArray(rawLines) && rows.length > 0) {
      const newMappings = [];
      rows.forEach(row => {
        // Find rawLine that best matches this decoded description
        rawLines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed.length > 4 && !cache[trimmed] && row.description &&
              row.description.length > 2 && !row.description.includes('???')) {
            // Only save if description looks properly decoded (not garbled)
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
    res.status(502).json({ error: 'AI coaching temporarily unavailable.' });
  }
});

// ── PDF VISION ENDPOINT (for image-based PDFs like PTSB) ──
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
If you cannot find any transactions, return an empty array [].

Example output:
[
  {"date":"2022-04-06","description":"Insomnia","amount":-6.90,"category":"Coffee"},
  {"date":"2022-04-06","description":"The Back Page","amount":-7.50,"category":"Pubs & bars"},
  {"date":"2025-03-31","description":"Salary","amount":2800.00,"category":"Income"}
]`;

app.post('/parse-pdf-vision', rateLimitVision, async (req, res) => {
  req.setTimeout(120000); // 2 min timeout for vision requests
  res.setTimeout(120000);
  const { images } = req.body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Missing images array.' });
  }

  if (images.length > 6) {
    return res.status(400).json({ error: 'Too many pages — maximum 6.' });
  }

  // Validate each image is a string and not too large
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

// ── PTSB PDF PARSER (no AI needed) ──
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

    // Check if this looks like a real PTSB or Irish bank statement
    // PTSB text PDFs have readable text with dates and amounts
    const hasDates = /\d{2}[\/-]\d{2}[\/-]\d{2,4}/.test(text) ||
                     /\d{4}-\d{2}-\d{2}/.test(text) ||
                     /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i.test(text) ||
                     /\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}/i.test(text);
    const hasAmounts = /[\d,]+\.\d{2}/.test(text);
    const isGarbled = text.length > 100 &&
      (text.match(/[ÄÅÁÌÍÎÏÑÒÓÔÕÖáâãäåæçèéêëìíîïðñòóôõö]/g) || []).length > 15;

    // If text is garbled (PTSB scanned PDF) → tell frontend to use vision
    if (isGarbled || !hasDates || !hasAmounts) {
      console.log('PTSB PDF: garbled/unreadable text, falling back to vision. Garbled:', isGarbled, 'hasDates:', hasDates, 'hasAmounts:', hasAmounts);
      return res.json({ rows: [], fallback: true, reason: isGarbled ? 'garbled' : 'no_transactions' });
    }

    console.log('PTSB PDF: clean text extracted, parsing directly. Text length:', text.length);

    // Parse the text into transaction rows
    const rows = parseBankStatementText(text);
    console.log('PTSB PDF: parsed', rows.length, 'rows from text');

    if (rows.length === 0) {
      return res.json({ rows: [], fallback: true, reason: 'no_rows_parsed' });
    }

    res.json({ rows, fallback: false });
  } catch (err) {
    console.error('PTSB parse error:', err.message);
    // Password error
    if (err.message?.toLowerCase().includes('password') || err.name === 'PasswordException') {
      return res.status(400).json({ error: 'password_required', fallback: false });
    }
    res.json({ rows: [], fallback: true, reason: 'parse_error' });
  }
});

function parseBankStatementText(text) {
  const rows = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Patterns for Irish bank statement dates
  // PTSB CSV format: DD/MM/YYYY or DD MMM YYYY or YYYY-MM-DD
  const datePatterns = [
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(?:([\d,]+\.\d{2})\s*)?([\d,]+\.\d{2})?\s*$/,
    /^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([-]?[\d,]+\.\d{2})\s*$/,
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(?:([\d,]+\.\d{2})\s*)?([\d,]+\.\d{2})?\s*$/i,
  ];

  const MONTH_MAP = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };

  // Try to detect column positions from the text
  // Look for lines that match transaction patterns
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pattern 5: DDMMMYY format (PTSB specific) e.g. "06APR22 CNC INSOMNIA 6.90 193.23"
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

    // Pattern 1: DD/MM/YYYY Description Withdrawn PaidIn Balance
    const m1 = line.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})?\s*([\d,]+\.\d{2})?\s*$/);
    if (m1) {
      const [, day, month, year, desc, col1, col2, col3] = m1;
      const dateStr = `${year}-${month}-${day}`;
      // col1 = withdrawn (debit), col2 = paid in (credit), col3 = balance
      // If col2 and col3 exist, col1 is debit, col2 is credit
      // If only col1 and col2 exist, could be either
      const withdrawn = parseFloat(col1?.replace(/,/g,'')) || 0;
      const paidIn = col2 ? parseFloat(col2.replace(/,/g,'')) : 0;

      let amount;
      if (col3) {
        // 3-column format: Withdrawn | Paid In | Balance
        // Only one of withdrawn/paidIn will be non-zero per transaction
        if (paidIn > 0 && withdrawn === 0) {
          amount = paidIn; // credit
        } else if (withdrawn > 0) {
          amount = -withdrawn; // debit
        } else {
          amount = 0;
        }
      } else if (col2) {
        // 2-column format: Amount | Balance — col1 is the transaction amount (could be +/-)
        amount = withdrawn; // keep sign as-is
      } else {
        // 1-column: debit only
        amount = -withdrawn;
      }

      const cleanDesc = desc.replace(/\s+/g, ' ').trim();
      if (cleanDesc.length > 1 && Math.abs(amount) > 0) {
        rows.push({ date: dateStr, description: cleanDesc, amount: String(amount) });
      }
      continue;
    }

    // Pattern 2: YYYY-MM-DD Description Amount (Revolut-style)
    const m2 = line.match(/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([-]?[\d,]+\.\d{2})\s*$/);
    if (m2) {
      const [, date, desc, amtStr] = m2;
      const amount = parseFloat(amtStr.replace(/,/g,''));
      if (desc.length > 1 && !isNaN(amount)) {
        rows.push({ date, description: desc.trim(), amount: String(amount) });
      }
      continue;
    }

    // Pattern 3: DD Mon YYYY Description Withdrawn PaidIn Balance
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

    // Pattern 4: Multi-word lines — try to extract PTSB transaction type prefixes
    // Lines like: "07 Jan 2025 TKN TESCO STORES 1406 2 68.40 1,234.56"
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

      // Strip PTSB prefix
      const cleanDesc = desc.replace(/^(TKN|VPP|POS|ICT|DD|CT|RTD|GBP|USD|T\/F)\s+/i, '').replace(/\s+/g, ' ').trim();
      if (cleanDesc.length > 1 && Math.abs(amount) > 0) {
        rows.push({ date: dateStr, description: cleanDesc, amount: String(amount) });
      }
    }
  }

  // Deduplicate (same date+desc+amount)
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

// ── STRIPE WEBHOOK (mark user as Pro after payment) ──
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

// ── SMART CATEGORISE ENDPOINT ──
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
