// taxScan.js
// Detects potential Revenue tax relief from parsed transactions.
// Returns { totalEstimate, claims[], lowConfidence[] }

// ---------- CONFIG ----------
const TAX_YEAR_RATES = {
  rentCredit: { max: 1000, perPerson: true },        // 2025: €1000 single / €2000 jointly assessed
  medicalRelief: 0.20,                                // 20% standard rate relief
  tuitionRelief: { rate: 0.20, disregard: 3000, max: 7000 }, // first €3k disregarded, capped at €7k
};

// ---------- MERCHANT RULES ----------
// High-confidence: exact substring matches.
// Medical/dental GP rules are intentionally loose — flagged for user review.

const HEALTH_INSURERS = [
  "vhi", "laya", "irish life health", "ilh", "aviva health"
];

const PHARMACY_CHAINS = [
  "boots", "mccabes", "hickeys", "lloyds", "sam mcc", "life pharmacy",
  "allcare", "haven pharmacy", "totalhealth"
];

const TUITION_KEYWORDS = [
  "ucd", "tcd", "trinity college", "dcu", "ul ", "university of limerick",
  "nuig", "university of galway", "mtu", "tu dublin", "atu", "setu", "mu ",
  "maynooth", "rcsi", "griffith college", "dbs ", "ncad", "ncirl"
];

const DENTAL_KEYWORDS = [
  "dental", "dentist", "orthodontic", "smile clinic", "dental care"
];

// Looser — review required
const MEDICAL_KEYWORDS = [
  "clinic", "surgery", "medical centre", "medical center", "gp ", "doctors",
  "physio", "consultant", "hospital", "mater private", "beacon", "blackrock clinic"
];

// User-maintained crowdsourced GP list (loaded from Supabase: merchant_library where category = 'gp')
// Falls back to keyword match flagged as low-confidence.

// ---------- HELPERS ----------
const norm = (s) => (s || "").toLowerCase().trim();
const anyMatch = (desc, list) => list.some(k => desc.includes(k));

const isDebit = (t) => Number(t.amount) < 0 || t.type === "debit";
const absAmt = (t) => Math.abs(Number(t.amount));

// ---------- DETECTORS ----------

function detectHealthInsurance(transactions) {
  const hits = transactions.filter(t =>
    isDebit(t) && anyMatch(norm(t.description), HEALTH_INSURERS)
  );
  if (!hits.length) return null;

  const annualSpend = hits.reduce((s, t) => s + absAmt(t), 0);
  // Tax Relief at Source usually applies — but only at standard rate.
  // If user pays gross (some employer schemes), they can claim 20%.
  return {
    category: "Health Insurance",
    confidence: "medium", // TRS already applied for most — needs user confirmation
    transactions: hits,
    annualSpend: round(annualSpend),
    estimate: round(annualSpend * 0.20),
    note: "If your premium isn't already TRS-adjusted (e.g. paid by employer as BIK), you may be owed 20% back.",
    question: "Is your health insurance paid by your employer as a benefit?",
  };
}

function detectPharmacy(transactions) {
  const hits = transactions.filter(t =>
    isDebit(t) && anyMatch(norm(t.description), PHARMACY_CHAINS)
  );
  if (!hits.length) return null;

  const annualSpend = hits.reduce((s, t) => s + absAmt(t), 0);
  return {
    category: "Pharmacy & Prescriptions",
    confidence: "high",
    transactions: hits,
    annualSpend: round(annualSpend),
    estimate: round(annualSpend * TAX_YEAR_RATES.medicalRelief),
    note: "Prescription costs qualify for 20% medical expense relief. Over-the-counter items don't — receipts needed.",
    question: "Were these mostly prescriptions, or general items (toothpaste, makeup)?",
  };
}

function detectTuition(transactions) {
  const hits = transactions.filter(t =>
    isDebit(t) && anyMatch(norm(t.description), TUITION_KEYWORDS) && absAmt(t) >= 200
  );
  if (!hits.length) return null;

  const annualSpend = hits.reduce((s, t) => s + absAmt(t), 0);
  const { rate, disregard, max } = TAX_YEAR_RATES.tuitionRelief;
  const qualifying = Math.min(Math.max(annualSpend - disregard, 0), max);
  return {
    category: "Third-Level Tuition",
    confidence: "high",
    transactions: hits,
    annualSpend: round(annualSpend),
    estimate: round(qualifying * rate),
    note: `First €${disregard} is disregarded, relief at 20% on qualifying fees up to €${max}.`,
    question: "Was this for an approved course (full or part-time)?",
  };
}

function detectDental(transactions) {
  const hits = transactions.filter(t =>
    isDebit(t) && anyMatch(norm(t.description), DENTAL_KEYWORDS)
  );
  if (!hits.length) return null;

  const annualSpend = hits.reduce((s, t) => s + absAmt(t), 0);
  return {
    category: "Dental (Non-Routine)",
    confidence: "low", // routine cleanings/fillings don't qualify — only non-routine (crowns, root canals etc.)
    transactions: hits,
    annualSpend: round(annualSpend),
    estimate: round(annualSpend * TAX_YEAR_RATES.medicalRelief),
    note: "Only non-routine dental (crowns, root canals, orthodontics) qualifies. Routine cleanings/fillings don't.",
    question: "Did any of these include crowns, root canals, or orthodontic work?",
    requiresReview: true,
  };
}

async function detectMedical(transactions, supabase) {
  // 1. Check crowdsourced merchant_library first
  const descriptions = [...new Set(transactions.map(t => norm(t.description)))];
  const { data: knownGPs } = await supabase
    .from("merchant_library")
    .select("raw_pattern")
    .eq("category", "medical");

  const knownPatterns = (knownGPs || []).map(r => r.raw_pattern.toLowerCase());

  const confirmedHits = transactions.filter(t =>
    isDebit(t) && knownPatterns.some(p => norm(t.description).includes(p))
  );

  // 2. Keyword fallback — flagged for review
  const fallbackHits = transactions.filter(t =>
    isDebit(t) &&
    !confirmedHits.includes(t) &&
    anyMatch(norm(t.description), MEDICAL_KEYWORDS)
  );

  if (!confirmedHits.length && !fallbackHits.length) return null;

  const confirmedSpend = confirmedHits.reduce((s, t) => s + absAmt(t), 0);
  const fallbackSpend = fallbackHits.reduce((s, t) => s + absAmt(t), 0);

  return {
    category: "Medical Expenses",
    confidence: confirmedHits.length && !fallbackHits.length ? "high" : "low",
    transactions: [...confirmedHits, ...fallbackHits],
    annualSpend: round(confirmedSpend + fallbackSpend),
    estimate: round((confirmedSpend + fallbackSpend) * TAX_YEAR_RATES.medicalRelief),
    note: "GP visits, consultants, and prescribed treatments qualify at 20%. Some entries below need your confirmation.",
    needsReview: fallbackHits.map(t => ({
      description: t.description,
      amount: absAmt(t),
      date: t.date,
      prompt: "Was this a medical expense?",
    })),
  };
}

// ---------- MAIN ----------
export async function runTaxScan(transactions, { supabase, rentCreditResult = null } = {}) {
  const claims = [];
  const lowConfidence = [];

  if (rentCreditResult) claims.push(rentCreditResult); // already detected in Stage 1

  const detectors = [
    detectHealthInsurance(transactions),
    detectPharmacy(transactions),
    detectTuition(transactions),
    detectDental(transactions),
    await detectMedical(transactions, supabase),
  ].filter(Boolean);

  for (const c of detectors) {
    if (c.confidence === "low" || c.requiresReview) {
      lowConfidence.push(c);
    } else {
      claims.push(c);
    }
  }

  const totalEstimate = [...claims, ...lowConfidence]
    .reduce((s, c) => s + (c.estimate || 0), 0);

  return {
    totalEstimate: round(totalEstimate),
    claims,
    lowConfidence,
    scannedAt: new Date().toISOString(),
  };
}

function round(n) { return Math.round(n * 100) / 100; }
