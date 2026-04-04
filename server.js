const express = require('express');
const cors = require('cors');

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
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
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
"àà" = DD (direct debit)
"åâ&" = GBP (UK payment)
"íëà" = USD (US payment)
"êÈÀ" = RTD (return/refund)
"äè" = CT (credit transfer)

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

For amounts: look for numeric values after the merchant name. Withdrawn column = negative amount, Paid In column = positive.
For dates: combine month prefix + day number visible on the line. Use year from statement header.

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
const PDF_VISION_PROMPT = `You are a bank statement parser specialising in Irish bank statements, especially PTSB/Permanent TSB.
Your job is to find every transaction visible in the images and return them as a JSON array.

IMPORTANT: This is a PTSB statement. The printed text on the page is clear and readable. Use exactly what you see.
Common merchants to recognise from the images:
- "TESCO STORES" or "TKN TESCO" = Tesco Stores
- "CIRCLE K" or "TKN CIRCLE K" = Circle K
- "REVOLUT" or "VPP REVO" = Revolut
- "DELIVEROO" = Deliveroo
- "JUST EAT" = Just Eat Ireland
- "McDONALDS" or "MCD" = McDonald's
- "PADDY POWER" = Paddy Power
- "LIDL" = Lidl
- "ALDI" = Aldi
- "FRESHWAY" = Freshway
- "SCRAMBLERS" = Scramblers
- "O'BRIENS" = O'Briens
- "UBER" = Uber
- "AMAZON" = Amazon
- "NETFLIX" = Netflix
- "APPLE" = Apple
- "STARBUCKS" = Starbucks
- "ICT" prefix = incoming bank transfer
- "DD" prefix = direct debit
- "POS" prefix = contactless card payment
- "VPP" prefix = Visa card payment
- "TKN" prefix = token/card payment

Each transaction object must have exactly these fields:
- date: string in YYYY-MM-DD format
- description: string — merchant name as clearly as possible
- amount: number — negative for debits/withdrawals, positive for credits/income

Return ONLY a valid JSON array, no other text, no markdown, no explanation.
If you cannot find any transactions, return an empty array [].

Example output:
[
  {"date":"2025-03-07","description":"Tesco Stores","amount":-68.40},
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
