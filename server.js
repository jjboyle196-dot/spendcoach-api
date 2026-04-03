<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Skint — Here's exactly why.</title>
<meta name="description" content="You're not broke. You're just not watching. Upload your bank statement and get an AI coach that finally explains where your money is going.">
<meta name="theme-color" content="#2B5F3E">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Skint">
<meta name="mobile-web-app-capable" content="yes">
<link rel="manifest" id="pwa-manifest">
<link rel="apple-touch-icon" id="apple-touch-icon">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #F5F2ED;
    --surface: #FFFFFF;
    --surface2: #EFECE7;
    --ink: #1A1814;
    --ink2: #6B6760;
    --ink3: #A09D99;
    --accent: #2B5F3E;
    --accent-light: #EAF2EC;
    --accent-mid: #4A9B68;
    --warn: #C94A2A;
    --warn-light: #FCF0ED;
    --border: rgba(26,24,20,0.1);
    --border2: rgba(26,24,20,0.06);
    --radius: 14px;
    --radius-sm: 8px;
  }

  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--bg);
    color: var(--ink);
    min-height: 100vh;
    font-size: 15px;
    line-height: 1.6;
  }

  /* ── NAV ── */
  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 2rem;
    padding-top: max(1.25rem, env(safe-area-inset-top));
    padding-left: max(2rem, env(safe-area-inset-left));
    padding-right: max(2rem, env(safe-area-inset-right));
    background: var(--surface);
    border-bottom: 1px solid var(--border2);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .logo {
    font-family: 'Syne', sans-serif;
    font-size: 24px;
    font-weight: 800;
    color: var(--ink);
    letter-spacing: -0.5px;
  }
  .logo span { color: var(--accent); }
  .nav-links { display: flex; gap: 6px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .nav-links::-webkit-scrollbar { display: none; }
  .nav-btn {
    padding: 7px 16px;
    border-radius: 20px;
    font-size: 13px;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--ink2);
    transition: all 0.15s;
  }
  .nav-btn:hover { background: var(--surface2); }
  .nav-btn.active {
    background: var(--ink);
    color: #fff;
    border-color: var(--ink);
  }
  .nav-btn-feedback {
    background: var(--accent-light);
    color: var(--accent);
    border-color: transparent;
  }
  .nav-btn-feedback:hover { background: #d4e9d9; }

  /* ── PAGES ── */
  .page { display: none; padding: 2rem; max-width: 780px; margin: 0 auto; }
  .page.active { display: block; }

  /* ── LANDING ── */
  .hero {
    text-align: center;
    padding: 4rem 2rem 3rem;
    max-width: 600px;
    margin: 0 auto;
  }
  .hero-tag {
    display: inline-block;
    background: var(--accent-light);
    color: var(--accent);
    font-size: 12px;
    font-weight: 500;
    padding: 4px 14px;
    border-radius: 20px;
    margin-bottom: 1.25rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .hero h1 {
    font-family: 'Instrument Serif', serif;
    font-size: clamp(36px, 6vw, 56px);
    line-height: 1.1;
    color: var(--ink);
    margin-bottom: 1rem;
    letter-spacing: -1px;
  }
  .hero h1 em { color: var(--accent); font-style: italic; }
  .hero p {
    font-size: 17px;
    color: var(--ink2);
    max-width: 440px;
    margin: 0 auto 2rem;
    line-height: 1.7;
  }
  .hero-cta {
    display: inline-block;
    background: var(--ink);
    color: #fff;
    padding: 14px 32px;
    border-radius: 40px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    font-family: 'DM Sans', sans-serif;
    transition: background 0.15s, transform 0.1s;
  }
  .hero-cta:hover { background: #2d2a26; }
  .hero-cta:active { transform: scale(0.98); }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-top: 3rem;
  }
  .feature-card {
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: var(--radius);
    padding: 1.25rem;
  }
  .feature-icon {
    width: 36px; height: 36px;
    border-radius: var(--radius-sm);
    background: var(--accent-light);
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 10px;
    font-size: 17px;
  }
  .feature-card h3 { font-size: 14px; font-weight: 500; margin-bottom: 4px; }
  .feature-card p { font-size: 13px; color: var(--ink2); line-height: 1.5; }

  /* ── UPLOAD SLOTS ── */
  .upload-slots {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 12px; margin-bottom: 14px;
  }
  .upload-slot {
    background: var(--surface); border: 2px dashed var(--border);
    border-radius: var(--radius); padding: 1.5rem 1rem;
    text-align: center; cursor: pointer; transition: all 0.2s;
    position: relative;
  }
  .upload-slot:hover { border-color: var(--accent); background: var(--accent-light); }
  .upload-slot.has-file { border-color: var(--accent); border-style: solid; background: var(--accent-light); }
  .slot-secondary { opacity: 0.7; }
  .slot-secondary.has-file { opacity: 1; }
  .slot-icon { font-size: 28px; margin-bottom: 8px; }
  .slot-title { font-size: 14px; font-weight: 500; color: var(--ink); margin-bottom: 4px; }
  .slot-sub { font-size: 12px; color: var(--ink3); }
  .slot-check {
    position: absolute; top: 10px; right: 10px;
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--accent); color: #fff;
    font-size: 12px; display: flex; align-items: center; justify-content: center;
  }
  .upload-go-btn {
    width: 100%; padding: 13px;
    background: var(--ink); color: #fff;
    border: none; border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif; font-size: 15px;
    font-weight: 500; cursor: pointer; transition: background 0.15s;
  }
  .upload-go-btn:hover { background: #2d2a26; }

  /* ── BANK TABS ── */
  .bank-tabs {
    display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px;
  }
  .bank-tab {
    padding: 6px 14px; border-radius: 20px;
    font-size: 12px; font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    border: 1px solid var(--border); background: var(--surface);
    color: var(--ink2); cursor: pointer; transition: all 0.15s;
  }
  .bank-tab:hover { background: var(--surface2); }
  .bank-tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }

  /* ── BANK GUIDE ── */
  .bank-guide { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius); padding: 1.25rem; margin-bottom: 14px; }
  .guide-steps { display: flex; flex-direction: column; gap: 10px; }
  .guide-step {
    display: flex; align-items: flex-start; gap: 12px;
    font-size: 13px; color: var(--ink2); line-height: 1.5;
  }
  .guide-step strong { color: var(--ink); }
  .guide-num {
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--ink); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 500; flex-shrink: 0; margin-top: 1px;
  }
  .guide-tip {
    margin-top: 12px; padding: 10px 12px;
    background: var(--accent-light); border-radius: var(--radius-sm);
    font-size: 12px; color: var(--accent); line-height: 1.5;
  }

  @media (max-width: 560px) {
    .upload-slots { grid-template-columns: 1fr; }
  }

  .or-divider {
    text-align: center;
    font-size: 13px;
    color: var(--ink3);
    margin: 1rem 0;
    position: relative;
  }
  .or-divider::before, .or-divider::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 42%;
    height: 1px;
    background: var(--border);
  }
  .or-divider::before { left: 0; }
  .or-divider::after { right: 0; }

  .demo-btn {
    width: 100%;
    padding: 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    color: var(--ink);
    cursor: pointer;
    transition: background 0.15s;
    margin-bottom: 1.5rem;
  }
  .demo-btn:hover { background: var(--surface2); }

  /* ── CARD ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: var(--radius);
    padding: 1.25rem 1.5rem;
    margin-bottom: 14px;
  }
  .card-title {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink3);
    font-weight: 500;
    margin-bottom: 1rem;
  }

  /* ── ENHANCED METRICS ── */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .metric {
    border-radius: var(--radius);
    padding: 1.1rem 1rem;
    border: 1px solid var(--border2);
    background: var(--surface);
    position: relative;
    overflow: hidden;
  }
  .metric::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 3px 3px 0 0;
  }
  .metric-green::before { background: var(--accent); }
  .metric-amber::before { background: #BA7517; }
  .metric-blue::before { background: #378ADD; }
  .metric-coral::before { background: #C94A2A; }
  .metric-label { font-size: 11px; color: var(--ink3); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
  .metric-value { font-family: 'Instrument Serif', serif; font-size: 26px; line-height: 1; color: var(--ink); }
  .metric-sub { font-size: 11px; color: var(--ink3); margin-top: 5px; }

  /* ── INSIGHT STRIP ── */
  .insight-strip {
    display: flex; align-items: stretch;
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: var(--radius); margin-bottom: 14px;
    overflow: hidden;
  }
  .insight-item {
    display: flex; align-items: center; gap: 10px;
    padding: 1rem 1.25rem; flex: 1;
  }
  .insight-icon { font-size: 20px; flex-shrink: 0; }
  .insight-label { font-size: 11px; color: var(--ink3); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
  .insight-val { font-size: 14px; font-weight: 500; color: var(--ink); }
  .insight-divider { width: 1px; background: var(--border2); flex-shrink: 0; }

  /* ── CATEGORY BARS ── */
  .cat-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border2);
  }
  .cat-row:last-child { border-bottom: none; }
  .cat-name { font-size: 13px; min-width: 120px; color: var(--ink); }
  .cat-bar-bg { flex: 1; height: 5px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
  .cat-bar { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
  .cat-amt { font-size: 13px; color: var(--ink2); min-width: 54px; text-align: right; }
  .cat-badge {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 12px;
    font-weight: 500;
  }
  .badge-warn { background: var(--warn-light); color: var(--warn); }
  .badge-ok { background: var(--accent-light); color: var(--accent); }

  /* ── CHART TABS ── */
  .chart-tab {
    padding: 7px 16px;
    border-radius: 20px;
    font-size: 13px;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink2);
    transition: all 0.15s;
  }
  .chart-tab:hover { background: var(--surface2); }
  .chart-tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }

  /* ── DONUT LEGEND ── */
  .legend-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 13px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

  /* ── NIGHT OUT ROAST ── */
  .night-card {
    border-radius: var(--radius);
    padding: 1.25rem 1.5rem;
    margin-bottom: 10px;
    border: 1px solid var(--border2);
    background: var(--surface);
  }
  .night-card.big-night {
    background: #1A1814;
    border-color: #1A1814;
    color: #fff;
  }
  .night-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .night-roast { font-family:'Instrument Serif',serif; font-size:18px; line-height:1.4; margin-bottom:6px; }
  .night-meta { font-size:12px; opacity:0.6; }
  .merchant-row {
    display: flex; align-items: center; gap: 10px; padding: 10px 0;
    border-bottom: 1px solid var(--border2);
  }
  .merchant-row:last-child { border-bottom: none; }
  .merchant-avatar {
    width: 36px; height: 36px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 500; flex-shrink: 0;
  }
  .merchant-name { font-size: 14px; font-weight: 500; color: var(--ink); }
  .merchant-meta { font-size: 12px; color: var(--ink3); }
  .merchant-amt { font-size: 14px; font-weight: 500; color: var(--ink); margin-left: auto; }

  /* ── AI COACH ── */
  .coach-bubble {
    background: var(--accent-light);
    border-radius: var(--radius);
    padding: 1.25rem 1.5rem;
    margin-bottom: 14px;
    border-left: 3px solid var(--accent-mid);
  }
  .coach-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--accent);
    font-weight: 500;
    margin-bottom: 8px;
  }
  .coach-text { font-size: 15px; color: var(--ink); line-height: 1.65; }

  .thinking {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink3);
    font-size: 14px;
    padding: 1rem 0;
  }
  .dot-pulse { display: flex; gap: 4px; }
  .dot-pulse span {
    width: 6px; height: 6px;
    background: var(--accent-mid);
    border-radius: 50%;
    animation: pulse 1.2s infinite;
  }
  .dot-pulse span:nth-child(2) { animation-delay: 0.2s; }
  .dot-pulse span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes pulse { 0%,80%,100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }

  /* ── SUB LIST ── */
  .sub-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid var(--border2);
    gap: 10px;
  }
  .sub-row:last-child { border-bottom: none; }
  .sub-name { font-size: 14px; color: var(--ink); }
  .sub-amt { font-size: 13px; color: var(--ink2); }

  /* ── CHALLENGE ── */
  .challenge-card {
    background: var(--ink);
    color: #fff;
    border-radius: var(--radius);
    padding: 1.5rem;
    margin-bottom: 14px;
  }
  .challenge-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: rgba(255,255,255,0.5); margin-bottom: 8px; }
  .challenge-text { font-family: 'Instrument Serif', serif; font-size: 20px; line-height: 1.3; margin-bottom: 1.25rem; }
  .challenge-actions { display: flex; gap: 8px; }
  .ch-btn {
    flex: 1;
    padding: 10px;
    border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s;
    border: none;
  }
  .ch-btn-primary { background: #fff; color: var(--ink); }
  .ch-btn-primary:hover { background: #f0f0f0; }
  .ch-btn-secondary { background: rgba(255,255,255,0.12); color: #fff; }
  .ch-btn-secondary:hover { background: rgba(255,255,255,0.2); }

  /* ── GOAL ── */
  .goal-bar-bg { height: 8px; background: var(--surface2); border-radius: 4px; overflow: hidden; margin: 10px 0 6px; }
  .goal-bar { height: 100%; border-radius: 4px; background: var(--accent); transition: width 0.8s ease; }

  /* ── PAYWALL ── */
  .paywall {
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: var(--radius);
    padding: 2rem;
    text-align: center;
    margin-bottom: 14px;
  }
  .paywall h2 { font-family: 'Instrument Serif', serif; font-size: 26px; margin-bottom: 8px; }
  .paywall p { font-size: 14px; color: var(--ink2); max-width: 340px; margin: 0 auto 1.5rem; }
  .plan-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 1.5rem; }
  .plan-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 1rem;
    text-align: left;
    position: relative;
  }
  .plan-card.featured { border-color: var(--accent); border-width: 2px; }
  .plan-name { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink3); margin-bottom: 6px; }
  .plan-price { font-family: 'Instrument Serif', serif; font-size: 24px; color: var(--ink); margin-bottom: 4px; }
  .plan-price span { font-family: 'DM Sans', sans-serif; font-size: 13px; color: var(--ink3); }
  .plan-features { font-size: 12px; color: var(--ink2); line-height: 1.7; }
  .plan-badge {
    position: absolute;
    top: -10px; left: 50%; transform: translateX(-50%);
    background: var(--accent);
    color: #fff;
    font-size: 10px;
    padding: 3px 10px;
    border-radius: 12px;
    font-weight: 500;
    white-space: nowrap;
  }
  .stripe-btn {
    display: inline-block;
    background: var(--accent);
    color: #fff;
    padding: 12px 28px;
    border-radius: 40px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    font-family: 'DM Sans', sans-serif;
    transition: background 0.15s;
  }
  .stripe-btn:hover { background: #234f34; }

  /* ── SETTINGS ── */
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--border2);
    gap: 16px;
  }
  .setting-row:last-child { border-bottom: none; }
  .setting-label { font-size: 14px; }
  .setting-sub { font-size: 12px; color: var(--ink3); margin-top: 2px; }
  .toggle {
    width: 40px; height: 22px;
    background: var(--surface2);
    border-radius: 11px;
    cursor: pointer;
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;
    border: none;
  }
  .toggle::after {
    content: '';
    position: absolute;
    width: 16px; height: 16px;
    background: #fff;
    border-radius: 50%;
    top: 3px; left: 3px;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  .toggle.on { background: var(--accent); }
  .toggle.on::after { transform: translateX(18px); }

  /* ── UTIL ── */
  .page-title {
    font-family: 'Instrument Serif', serif;
    font-size: 28px;
    margin-bottom: 4px;
    letter-spacing: -0.3px;
  }
  .page-sub { font-size: 14px; color: var(--ink3); margin-bottom: 1.5rem; }
  .btn {
    padding: 9px 18px;
    border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    transition: background 0.15s;
    font-weight: 500;
  }
  .btn:hover { background: var(--surface2); }
  .btn-accent { background: var(--accent); color: #fff; border-color: var(--accent); }
  .btn-accent:hover { background: #234f34; }
  .fade-in { animation: fadeIn 0.35s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  /* ── STATS BAR ── */
  .stats-bar {
    display: flex; align-items: center; justify-content: center;
    gap: 0; background: var(--surface); border: 1px solid var(--border2);
    border-radius: var(--radius); padding: 1.25rem; margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .stat-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0 1.5rem; }
  .stat-num { font-family: 'Instrument Serif', serif; font-size: 22px; color: var(--ink); }
  .stat-label { font-size: 11px; color: var(--ink3); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
  .stat-divider { width: 1px; height: 36px; background: var(--border2); }

  /* ── BANKS STRIP ── */
  .banks-strip {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    margin-bottom: 2rem; padding: 0 0.25rem;
  }
  .banks-label { font-size: 12px; color: var(--ink3); white-space: nowrap; }
  .banks-list { display: flex; gap: 8px; flex-wrap: wrap; }
  .bank-badge {
    font-size: 12px; font-weight: 500; color: var(--ink2);
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: 20px; padding: 4px 12px;
  }

  /* ── SECTION LABEL ── */
  .section-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--ink3); font-weight: 500; margin-bottom: 1rem; margin-top: 2rem;
  }

  /* ── STEPS ── */
  .steps-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 12px; margin-bottom: 14px;
  }
  .step-card {
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: var(--radius); padding: 1.25rem;
  }
  .step-num {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--ink); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 500; margin-bottom: 12px;
  }
  .step-card h3 { font-size: 14px; font-weight: 500; margin-bottom: 6px; }
  .step-card p { font-size: 13px; color: var(--ink2); line-height: 1.5; }

  /* ── TESTIMONIALS ── */
  .testimonials { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
  .testimonial-card {
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: var(--radius); padding: 1.25rem;
  }
  .testimonial-text { font-family: 'Instrument Serif', serif; font-size: 15px; line-height: 1.6; color: var(--ink); margin-bottom: 10px; }
  .testimonial-author { font-size: 12px; color: var(--ink3); }

  /* ── PRIVACY BLOCK ── */
  .privacy-block {
    display: flex; gap: 1rem; align-items: flex-start;
    background: var(--accent-light); border: 1px solid #c8e0ce;
    border-radius: var(--radius); padding: 1.25rem 1.5rem;
    margin-bottom: 14px; margin-top: 2rem;
  }
  .privacy-icon { font-size: 24px; flex-shrink: 0; margin-top: 2px; }
  .privacy-block h3 { font-size: 15px; font-weight: 500; margin-bottom: 6px; color: var(--ink); }
  .privacy-block p { font-size: 13px; color: var(--ink2); line-height: 1.6; margin-bottom: 8px; }

  /* ── BOTTOM CTA ── */
  .bottom-cta {
    text-align: center; padding: 3rem 2rem;
    background: var(--ink); border-radius: var(--radius);
    margin-top: 2rem; margin-bottom: 2rem;
  }
  .bottom-cta h2 { font-family: 'Instrument Serif', serif; font-size: 26px; color: #fff; margin-bottom: 8px; }
  .bottom-cta p { font-size: 14px; color: rgba(255,255,255,0.6); margin-bottom: 1.5rem; }
  .bottom-cta .hero-cta { background: #fff; color: var(--ink); }
  .bottom-cta .hero-cta:hover { background: #f0f0f0; }

  @media (max-width: 560px) {
    nav { padding: 1rem; }
    .page { padding: 1.25rem; padding-bottom: 5rem; }
    .metrics-grid { grid-template-columns: repeat(2, 1fr); }
    .plan-grid { grid-template-columns: 1fr; }
    .nav-btn span { display: none; }
    nav .nav-links { display: none; }
    .mobile-nav { display: flex; }
    .steps-grid { grid-template-columns: 1fr; }
    .testimonials { grid-template-columns: 1fr; }
    .stat-item { padding: 0 1rem; }
    .stat-divider { display: none; }
    .insight-strip { flex-direction: column; }
    .insight-divider { width: auto; height: 1px; }
  }

  /* ── MOBILE BOTTOM NAV ── */
  .mobile-nav {
    display: none;
    position: fixed;
    bottom: 0; left: 0; right: 0;
    background: var(--surface);
    border-top: 1px solid var(--border2);
    padding: 8px 0;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    z-index: 200;
    justify-content: space-around;
  }
  .mob-btn {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: none; border: none; cursor: pointer;
    font-family: 'DM Sans', sans-serif; font-size: 10px;
    color: var(--ink3); padding: 4px 12px; border-radius: 8px;
    transition: color 0.15s;
  }
  .mob-btn.active { color: var(--accent); }
  .mob-btn svg { width: 22px; height: 22px; }

  /* ── EMAIL CAPTURE MODAL ── */
  .email-modal-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(26,24,20,0.55); z-index: 998;
    align-items: center; justify-content: center;
  }
  .email-modal {
    background: var(--surface); border-radius: var(--radius);
    padding: 2rem; width: 90%; max-width: 400px;
    text-align: center;
  }
  .email-modal h2 { font-family: 'Instrument Serif', serif; font-size: 24px; margin-bottom: 8px; }
  .email-modal p { font-size: 14px; color: var(--ink2); margin-bottom: 1.25rem; line-height: 1.6; }
  .email-modal input {
    width: 100%; padding: 10px 14px;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif; font-size: 14px;
    color: var(--ink); background: var(--bg); outline: none;
    margin-bottom: 10px;
  }
  .email-modal .skip-link {
    display: block; margin-top: 10px; font-size: 12px;
    color: var(--ink3); cursor: pointer; text-decoration: underline;
  }

  /* ── SHARE CARD ── */
  .share-strip {
    background: var(--ink); color: #fff;
    border-radius: var(--radius); padding: 1.25rem 1.5rem;
    margin-bottom: 14px; display: flex;
    align-items: center; justify-content: space-between; gap: 12px;
  }
  .share-strip p { font-size: 14px; line-height: 1.5; }
  .share-strip strong { font-family: 'Instrument Serif', serif; font-size: 16px; }
  .share-btn {
    background: #fff; color: var(--ink);
    border: none; border-radius: var(--radius-sm);
    padding: 8px 16px; font-size: 13px; font-weight: 500;
    cursor: pointer; font-family: 'DM Sans', sans-serif;
    white-space: nowrap; flex-shrink: 0;
  }

  /* ── MONTH COMPARISON ── */
  .compare-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 0; border-bottom: 1px solid var(--border2);
    font-size: 13px;
  }
  .compare-row:last-child { border-bottom: none; }
  .compare-cat { flex: 1; color: var(--ink2); }
  .compare-bar-wrap { flex: 2; display: flex; flex-direction: column; gap: 3px; }
  .compare-bar-row { display: flex; align-items: center; gap: 6px; }
  .compare-bar-bg { flex: 1; height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
  .compare-bar { height: 100%; border-radius: 3px; }
  .compare-amt { font-size: 12px; color: var(--ink3); min-width: 40px; text-align: right; }
  .compare-delta {
    font-size: 11px; font-weight: 500; padding: 2px 6px;
    border-radius: 10px; white-space: nowrap;
  }
  .delta-up { background: var(--warn-light); color: var(--warn); }
  .delta-down { background: var(--accent-light); color: var(--accent); }
  .delta-same { background: var(--surface2); color: var(--ink3); }

  /* ── GOAL EDITOR ── */
  .goal-edit-row {
    display: flex; gap: 8px; margin-top: 10px;
  }
  .goal-edit-row input {
    flex: 1; padding: 7px 10px;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif; font-size: 13px;
    color: var(--ink); background: var(--bg); outline: none;
  }
  .goal-edit-row button {
    padding: 7px 14px; background: var(--accent); color: #fff;
    border: none; border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif; font-size: 13px;
    cursor: pointer; font-weight: 500;
  }

  /* ── EMPTY STATE ── */
  .empty-state {
    text-align: center; padding: 1.5rem 1rem;
    color: var(--ink3); font-size: 13px;
  }
  .empty-state span { font-size: 24px; display: block; margin-bottom: 6px; }
</style>
</head>
<body>

<nav>
  <div class="logo" onclick="showPage('home')" style="cursor:pointer;">Skint<span>.</span></div>
  <div class="nav-links">
    <button class="nav-btn" onclick="showPage('home')">Home</button>
    <button class="nav-btn" onclick="showPage('upload')">Upload</button>
    <button class="nav-btn" id="dashboard-btn" onclick="showPage('dashboard')" style="display:none">Dashboard</button>
    <button class="nav-btn" onclick="showPage('pricing')">Pricing</button>
    <button class="nav-btn" onclick="showPage('settings')">Settings</button>
    <button class="nav-btn nav-btn-feedback" onclick="showFeedback()">Feedback</button>
  </div>
</nav>

<!-- PWA INSTALL BANNER -->
<div id="install-banner" style="background:var(--ink);color:#fff;padding:12px 1.5rem;display:none;align-items:center;justify-content:space-between;gap:12px;font-size:13px;">
  <span>Add Skint to your home screen for the full app experience.</span>
  <div style="display:flex;gap:8px;flex-shrink:0;">
    <button id="install-btn" style="padding:6px 14px;background:#fff;color:var(--ink);border:none;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;">Install</button>
    <button onclick="document.getElementById('install-banner').style.display='none'" style="padding:6px 10px;background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:20px;font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;">✕</button>
  </div>
</div>

<!-- IOS INSTALL HINT (shown only on iOS Safari where beforeinstallprompt doesn't fire) -->
<div id="ios-banner" style="display:none;background:var(--ink);color:#fff;padding:12px 1.5rem;align-items:center;justify-content:space-between;gap:12px;font-size:13px;">
  <span>To install: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.</span>
  <button onclick="document.getElementById('ios-banner').style.display='none'" style="padding:6px 10px;background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:20px;font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;flex-shrink:0;">✕</button>
</div>

<!-- MOBILE BOTTOM NAV -->
<nav class="mobile-nav" id="mobile-nav">
  <button class="mob-btn active" id="mob-home" onclick="showPage('home')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    Home
  </button>
  <button class="mob-btn" id="mob-upload" onclick="showPage('upload')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    Upload
  </button>
  <button class="mob-btn" id="mob-dashboard" onclick="showPage('dashboard')" style="display:none">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
    Dashboard
  </button>
  <button class="mob-btn" id="mob-pricing" onclick="showPage('pricing')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
    Pricing
  </button>
  <button class="mob-btn" id="mob-settings" onclick="showPage('settings')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    Settings
  </button>
</nav>

<!-- EMAIL CAPTURE MODAL -->
<div class="email-modal-overlay" id="email-modal-overlay">
  <div class="email-modal">
    <p style="font-size:28px;margin-bottom:8px;">📬</p>
    <h2>Get your full analysis</h2>
    <p>Enter your email and we'll send you a monthly spending summary — plus tips to help you save more.</p>
    <input type="email" id="email-capture-input" placeholder="your@email.com">
    <button onclick="submitEmailCapture()" style="width:100%;padding:11px;background:var(--ink);color:#fff;border:none;border-radius:var(--radius-sm);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;">Get my analysis →</button>
    <span class="skip-link" onclick="skipEmailCapture()">Skip for now</span>
  </div>
</div>

<!-- FEEDBACK MODAL OVERLAY -->
<div id="feedback-overlay" style="display:none;position:fixed;inset:0;background:rgba(26,24,20,0.45);z-index:999;align-items:center;justify-content:center;">
  <div style="background:var(--surface);border-radius:var(--radius);padding:2rem;width:90%;max-width:460px;position:relative;max-height:90vh;overflow-y:auto;">
    <p style="font-family:'Instrument Serif',serif;font-size:22px;margin-bottom:6px;">Share your thoughts</p>
    <p style="font-size:13px;color:var(--ink3);margin-bottom:1.25rem;">What's working? What's confusing? What would make this worth paying for?</p>
    <textarea id="feedback-text" placeholder="Type your feedback here..." style="width:100%;height:120px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:'DM Sans',sans-serif;font-size:14px;color:var(--ink);background:var(--bg);resize:vertical;outline:none;line-height:1.6;"></textarea>
    <input id="feedback-email" type="email" placeholder="Your email (optional — only if you want a reply)" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:'DM Sans',sans-serif;font-size:14px;color:var(--ink);background:var(--bg);outline:none;margin-top:8px;">
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button onclick="submitFeedback()" style="flex:1;padding:10px;background:var(--ink);color:#fff;border:none;border-radius:var(--radius-sm);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;">Send feedback</button>
      <button onclick="hideFeedback()" style="padding:10px 16px;background:transparent;color:var(--ink2);border:1px solid var(--border);border-radius:var(--radius-sm);font-family:'DM Sans',sans-serif;font-size:14px;cursor:pointer;">Cancel</button>
    </div>
    <div id="feedback-thanks" style="display:none;margin-top:12px;padding:10px 14px;background:var(--accent-light);border-radius:var(--radius-sm);font-size:13px;color:var(--accent);">Thanks — that genuinely helps. We'll be in touch if you left an email.</div>
  </div>
</div>

<!-- HOME -->
<div class="page active" id="page-home">

  <!-- HERO -->
  <div class="hero fade-in">
    <div class="hero-tag">AI-powered finance coaching 🇮🇪</div>
    <h1><span style="font-family:'Syne',sans-serif;font-weight:800;font-style:normal;color:var(--accent);">Skint?</span><br>Here's exactly why.</h1>
    <p>You're not broke. You're just not watching.<br>Your bank statement, finally explained.</p>
    <button class="hero-cta" onclick="showPage('upload')">Find out why — it's free →</button>
    <p style="font-size:12px;color:var(--ink3);margin-top:12px;">No account needed · Your data never leaves your device</p>
  </div>

  <!-- STATS BAR -->
  <div class="stats-bar fade-in">
    <div class="stat-item"><span class="stat-num">100%</span><span class="stat-label">Free to start</span></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><span class="stat-num">🔒</span><span class="stat-label">Private by design</span></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><span class="stat-num">30s</span><span class="stat-label">To your breakdown</span></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><span class="stat-num">🇮🇪</span><span class="stat-label">Made in Dublin</span></div>
  </div>

  <!-- BANKS STRIP -->
  <div class="banks-strip fade-in">
    <span class="banks-label">Works with</span>
    <div class="banks-list">
      <span class="bank-badge">Revolut</span>
      <span class="bank-badge">AIB</span>
      <span class="bank-badge">Bank of Ireland</span>
      <span class="bank-badge">N26</span>
      <span class="bank-badge">PTSB</span>
      <span class="bank-badge">Ulster Bank</span>
    </div>
  </div>

  <!-- HOW IT WORKS -->
  <div class="section-label fade-in">How it works</div>
  <div class="steps-grid fade-in">
    <div class="step-card">
      <div class="step-num">1</div>
      <h3>Upload your statement</h3>
      <p>Export a CSV or PDF from your bank app. Revolut takes 30 seconds. AIB and BOI work too.</p>
    </div>
    <div class="step-card">
      <div class="step-num">2</div>
      <h3>Get your breakdown</h3>
      <p>Skint instantly categorises every transaction — groceries, takeaways, pubs, subscriptions, the lot.</p>
    </div>
    <div class="step-card">
      <div class="step-num">3</div>
      <h3>AI tells you the truth</h3>
      <p>Your personal coach calls out what's hurting you, names the actual places, and sets you a challenge.</p>
    </div>
  </div>

  <!-- WHAT YOU'LL FIND OUT -->
  <div class="section-label fade-in">What you'll find out</div>
  <div class="feature-grid fade-in">
    <div class="feature-card">
      <div class="feature-icon">📊</div>
      <h3>Spending breakdown</h3>
      <p>Every euro categorised. See exactly how much went on food, transport, nights out and everything else.</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">🍺</div>
      <h3>Pub tracker</h3>
      <p>Your local identified, your tab totalled, your nights out roasted. With names and amounts.</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">📦</div>
      <h3>Subscription audit</h3>
      <p>Every recurring charge found. The ones you forgot about get flagged first.</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">🧠</div>
      <h3>AI coaching</h3>
      <p>Not generic tips. Real insights based on your actual spending, with a weekly challenge to save more.</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">📅</div>
      <h3>Month comparison</h3>
      <p>Upload two months and see exactly where you spent more — category by category.</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">🎯</div>
      <h3>Savings goal</h3>
      <p>Set a target — holiday, car, deposit. See how long it'll realistically take based on your habits.</p>
    </div>
  </div>

  <!-- SOCIAL PROOF -->
  <div class="section-label fade-in">What people are saying</div>
  <div class="testimonials fade-in">
    <div class="testimonial-card">
      <p class="testimonial-text">"Found out I was spending €340 a month on Deliveroo. Three hundred and forty euro. I nearly fell off the chair."</p>
      <p class="testimonial-author">— Ciarán, Dublin 8</p>
    </div>
    <div class="testimonial-card">
      <p class="testimonial-text">"I knew I was bad with money but seeing it all laid out in one screen actually made me do something about it."</p>
      <p class="testimonial-author">— Aoife, Cork</p>
    </div>
    <div class="testimonial-card">
      <p class="testimonial-text">"The pub tracker is either the best or worst thing that's ever been built. Genuinely unsure which."</p>
      <p class="testimonial-author">— Rónán, Galway</p>
    </div>
  </div>

  <!-- PRIVACY BLOCK -->
  <div class="privacy-block fade-in">
    <div class="privacy-icon">🔒</div>
    <div>
      <h3>Your data stays on your device</h3>
      <p>CSV files are processed entirely in your browser — they never leave your phone or laptop. For PDFs, only the transaction text is sent to AI for parsing. We never store your financial data. Ever.</p>
      <a href="#" onclick="showPage('privacy');return false;" style="font-size:13px;color:var(--accent);font-weight:500;">Read our full privacy policy →</a>
    </div>
  </div>

  <!-- BOTTOM CTA -->
  <div class="bottom-cta fade-in">
    <h2>Ready to find out where it's all going?</h2>
    <p>Free to use. No account. No nonsense.</p>
    <button class="hero-cta" onclick="showPage('upload')">Upload my statement →</button>
  </div>

</div>

<!-- UPLOAD -->
<div class="page" id="page-upload">
  <p class="page-title">Upload your statement</p>
  <p class="page-sub">Most people use Revolut + a main bank. Upload both for a complete picture.</p>

  <!-- TWO SLOT UPLOAD -->
  <div class="upload-slots">
    <div class="upload-slot" id="slot-primary" onclick="document.getElementById('csv-file').click()">
      <div class="slot-icon">📱</div>
      <div class="slot-title">Revolut / main statement</div>
      <div class="slot-sub" id="slot-primary-sub">Tap to upload CSV or PDF</div>
      <div class="slot-check" id="slot-primary-check" style="display:none;">✓</div>
      <input type="file" id="csv-file" accept=".csv,.pdf" style="display:none" onchange="handleFile(event)">
    </div>
    <div class="upload-slot slot-secondary" id="slot-secondary" onclick="document.getElementById('csv-file-2').click()">
      <div class="slot-icon">🏦</div>
      <div class="slot-title">Second statement</div>
      <div class="slot-sub" id="slot-secondary-sub">Optional — combine two accounts</div>
      <div class="slot-check" id="slot-secondary-check" style="display:none;">✓</div>
      <input type="file" id="csv-file-2" accept=".csv,.pdf" style="display:none" onchange="handleFile2(event)">
    </div>
  </div>

  <div style="display:flex;gap:8px;margin-bottom:1.5rem;">
    <button class="upload-go-btn" id="upload-go-btn" onclick="processUploads()" style="display:none;">Analyse my spending →</button>
  </div>

  <!-- PDF PASSWORD -->
  <div id="pdf-password-section" style="display:none;" class="card">
    <div class="card-title">This PDF is password protected</div>
    <p style="font-size:13px;color:var(--ink2);margin-bottom:10px;">Enter the password your bank uses — usually your date of birth (DDMMYYYY) or the last 4 digits of your account number.</p>
    <div style="display:flex;gap:8px;">
      <input id="pdf-password" type="password" placeholder="Enter PDF password" onkeydown="if(event.key==='Enter')retryPDF()" style="flex:1;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:'DM Sans',sans-serif;font-size:14px;color:var(--ink);background:var(--bg);outline:none;">
      <button onclick="retryPDF()" style="padding:9px 16px;background:var(--ink);color:#fff;border:none;border-radius:var(--radius-sm);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;">Unlock</button>
    </div>
    <p id="pdf-password-error" style="display:none;font-size:12px;color:var(--warn);margin-top:6px;">Incorrect password — please try again.</p>
    <p style="font-size:11px;color:var(--ink3);margin-top:8px;">🔒 Your password is used only to decrypt the file locally in your browser. It is never sent anywhere.</p>
  </div>

  <!-- PDF PROCESSING STATUS -->
  <div id="pdf-status" style="display:none;" class="card">
    <div style="display:flex;align-items:center;gap:10px;">
      <div class="dot-pulse"><span></span><span></span><span></span></div>
      <span id="pdf-status-text" style="font-size:14px;color:var(--ink2);">Reading your PDF...</span>
    </div>
  </div>

  <!-- HOW TO GET YOUR STATEMENT -->
  <div class="card-title" style="margin-bottom:12px;">How to get your statement</div>
  <div class="bank-tabs">
    <button class="bank-tab active" onclick="showBankGuide('revolut',this)">Revolut</button>
    <button class="bank-tab" onclick="showBankGuide('aib',this)">AIB</button>
    <button class="bank-tab" onclick="showBankGuide('boi',this)">Bank of Ireland</button>
    <button class="bank-tab" onclick="showBankGuide('n26',this)">N26</button>
    <button class="bank-tab" onclick="showBankGuide('ptsb',this)">PTSB</button>
    <button class="bank-tab" onclick="showBankGuide('ulster',this)">Ulster</button>
  </div>

  <div class="bank-guide" id="guide-revolut" style="display:none;">
    <div class="guide-steps">
      <div class="guide-step"><div class="guide-num">1</div><div>Open the <strong>Revolut app</strong> on your phone</div></div>
      <div class="guide-step"><div class="guide-num">2</div><div>Tap your <strong>profile photo</strong> (top left) → <strong>Statements</strong></div></div>
      <div class="guide-step"><div class="guide-num">3</div><div>Choose your <strong>date range</strong> (e.g. last month)</div></div>
      <div class="guide-step"><div class="guide-num">4</div><div>Format: <strong>Excel (CSV)</strong> → Download → upload here</div></div>
    </div>
    <a id="revolut-deeplink" href="https://revolut.com/app/more/statements" onclick="handleRevolutLink(event)" style="display:block;text-align:center;padding:10px;background:var(--ink);color:#fff;border-radius:var(--radius-sm);font-size:13px;font-weight:500;text-decoration:none;margin-top:12px;">Open Revolut → Statements</a>
    <p style="font-size:11px;color:var(--ink3);text-align:center;margin-top:6px;">Opens the Revolut app directly on iOS</p>
  </div>

  <div class="bank-guide" id="guide-aib" style="display:none;">
    <div class="guide-steps">
      <div class="guide-step"><div class="guide-num">1</div><div>Log in to <strong>AIB Internet Banking</strong> at aib.ie or the AIB app</div></div>
      <div class="guide-step"><div class="guide-num">2</div><div>Go to <strong>Accounts</strong> → select your current account</div></div>
      <div class="guide-step"><div class="guide-num">3</div><div>Click <strong>Statement</strong> → choose your date range</div></div>
      <div class="guide-step"><div class="guide-num">4</div><div>Click <strong>Export</strong> → choose <strong>CSV</strong> → download and upload here</div></div>
    </div>
    <div class="guide-tip">💡 AIB PDFs are password protected — your password is usually your date of birth in DDMMYYYY format (e.g. 15061990)</div>
  </div>

  <div class="bank-guide" id="guide-boi" style="display:none;">
    <div class="guide-steps">
      <div class="guide-step"><div class="guide-num">1</div><div>Log in to <strong>365 Online</strong> at bankofireland.com or the BOI app</div></div>
      <div class="guide-step"><div class="guide-num">2</div><div>Go to <strong>My Accounts</strong> → click your current account</div></div>
      <div class="guide-step"><div class="guide-num">3</div><div>Select <strong>Statement</strong> → choose date range</div></div>
      <div class="guide-step"><div class="guide-num">4</div><div>Click <strong>Download</strong> → choose <strong>CSV</strong> format → upload here</div></div>
    </div>
    <div class="guide-tip">💡 BOI PDFs are usually password protected — try your date of birth in DDMMYYYY format</div>
  </div>

  <div class="bank-guide" id="guide-n26" style="display:none;">
    <div class="guide-steps">
      <div class="guide-step"><div class="guide-num">1</div><div>Log in to the <strong>N26 app</strong> or n26.com</div></div>
      <div class="guide-step"><div class="guide-num">2</div><div>Go to <strong>My Account</strong> → <strong>Documents</strong></div></div>
      <div class="guide-step"><div class="guide-num">3</div><div>Select <strong>Bank Statements</strong> → choose the month</div></div>
      <div class="guide-step"><div class="guide-num">4</div><div>Download the <strong>CSV export</strong> and upload here</div></div>
    </div>
    <div class="guide-tip">💡 N26 also lets you export from the web app at app.n26.com — sometimes easier than mobile</div>
  </div>

  <div class="bank-guide" id="guide-ptsb" style="display:none;">
    <div class="guide-steps">
      <div class="guide-step"><div class="guide-num">1</div><div>Log in to <strong>PTSB Online Banking</strong> at permanenttsb.ie</div></div>
      <div class="guide-step"><div class="guide-num">2</div><div>Go to <strong>Accounts</strong> → select your account</div></div>
      <div class="guide-step"><div class="guide-num">3</div><div>Click <strong>Download Transactions</strong></div></div>
      <div class="guide-step"><div class="guide-num">4</div><div>Choose <strong>CSV</strong> format → download and upload here</div></div>
    </div>
    <div class="guide-tip">💡 PTSB's CSV export works best from desktop/laptop, not mobile</div>
  </div>

  <div class="bank-guide" id="guide-ulster" style="display:none;">
    <div class="guide-steps">
      <div class="guide-step"><div class="guide-num">1</div><div>Log in to <strong>Ulster Bank Online Banking</strong></div></div>
      <div class="guide-step"><div class="guide-num">2</div><div>Go to <strong>Accounts</strong> → select your current account</div></div>
      <div class="guide-step"><div class="guide-num">3</div><div>Click <strong>Download Statement</strong></div></div>
      <div class="guide-step"><div class="guide-num">4</div><div>Choose <strong>CSV</strong> → download and upload here</div></div>
    </div>
    <div class="guide-tip">💡 Ulster Bank closed in Ireland in 2023 — if you moved to Revolut or AIB, use those guides above</div>
  </div>

  <div class="or-divider" style="margin-top:1.5rem;">or just try it first</div>
  <button class="demo-btn" onclick="loadDemo()">▶ Load sample data — see how it works</button>

  <div class="card" style="border-color:var(--accent-light);background:var(--accent-light);margin-top:12px;">
    <p style="font-size:13px;color:var(--accent);">🔒 CSV files never leave your browser. For PDFs, text is extracted locally then sent to AI to find your transactions — your password stays on your device. <a href="#" onclick="showPage('privacy');return false;" style="color:var(--accent);font-weight:500;">Privacy Policy</a></p>
  </div>
</div>

<!-- DASHBOARD -->
<div class="page" id="page-dashboard">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
    <div>
      <p class="page-title" id="dash-title">March 2025</p>
      <p class="page-sub" style="margin-bottom:0;" id="dash-sub">Loading your analysis...</p>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn" onclick="showPage('upload')">New file</button>
    </div>
  </div>

  <!-- SHARE STRIP -->
  <div class="share-strip" id="share-strip" style="display:none;">
    <p><strong id="share-headline">Your spending this month</strong><br><span style="font-size:12px;opacity:0.7;">Share your breakdown with a friend</span></p>
    <button class="share-btn" onclick="shareResults()">Share 📤</button>
  </div>

  <!-- MONTH COMPARISON -->
  <div class="card" id="compare-card" style="display:none;margin-bottom:14px;">
    <div class="card-title" id="compare-title">vs last month</div>
    <div id="compare-list"></div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border2);">
      <input type="file" id="compare-file" accept=".csv,.pdf" style="display:none" onchange="handleCompareFile(event)">
      <button class="btn" style="width:100%;text-align:center;" onclick="document.getElementById('compare-file').click()">+ Upload another month to compare</button>
    </div>
  </div>
  <div class="card" id="compare-upload-card" style="margin-bottom:14px;">
    <div class="card-title">Compare months</div>
    <p style="font-size:13px;color:var(--ink2);margin-bottom:10px;">Upload a second statement to see how your spending changed month to month.</p>
    <input type="file" id="compare-file2" accept=".csv,.pdf" style="display:none" onchange="handleCompareFile(event)">
    <button class="btn" style="width:100%;text-align:center;" onclick="document.getElementById('compare-file2').click()">+ Add previous month</button>
  </div>

  <div class="metrics-grid" id="metrics-grid">
    <div class="metric metric-green">
      <div class="metric-label">Total spent</div>
      <div class="metric-value" id="m-spent">—</div>
      <div class="metric-sub" id="m-spent-sub">this month</div>
    </div>
    <div class="metric metric-amber">
      <div class="metric-label">Daily average</div>
      <div class="metric-value" id="m-daily">—</div>
      <div class="metric-sub" id="m-daily-sub">per day</div>
    </div>
    <div class="metric metric-blue">
      <div class="metric-label">Transactions</div>
      <div class="metric-value" id="m-txn">—</div>
      <div class="metric-sub" id="m-txn-sub">spending items</div>
    </div>
    <div class="metric metric-coral">
      <div class="metric-label">Biggest category</div>
      <div class="metric-value" id="m-top" style="font-size:16px;">—</div>
      <div class="metric-sub" id="m-top-sub">of total spend</div>
    </div>
  </div>

  <!-- INSIGHT STRIP -->
  <div class="insight-strip" id="insight-strip" style="display:none;">
    <div class="insight-item" id="insight-bigtxn">
      <div class="insight-icon">💸</div>
      <div>
        <div class="insight-label">Biggest single transaction</div>
        <div class="insight-val" id="insight-bigtxn-val">—</div>
      </div>
    </div>
    <div class="insight-divider"></div>
    <div class="insight-item" id="insight-delivery">
      <div class="insight-icon">🛵</div>
      <div>
        <div class="insight-label">Food delivery vs groceries</div>
        <div class="insight-val" id="insight-delivery-val">—</div>
      </div>
    </div>
    <div class="insight-divider"></div>
    <div class="insight-item" id="insight-save">
      <div class="insight-icon">💰</div>
      <div>
        <div class="insight-label">You could save</div>
        <div class="insight-val" id="insight-save-val">—</div>
      </div>
    </div>
  </div>

  <div class="coach-bubble" id="coach-section">
    <div class="coach-label">AI Coach</div>
    <div id="coach-content">
      <div class="thinking"><div class="dot-pulse"><span></span><span></span><span></span></div>Analysing your spending patterns...</div>
    </div>
  </div>

  <div class="challenge-card" id="challenge-card" style="display:none;">
    <div class="challenge-label">This week's challenge</div>
    <div class="challenge-text" id="challenge-text"></div>
    <div class="challenge-actions">
      <button class="ch-btn ch-btn-primary" onclick="acceptChallenge(this)">Accept it</button>
      <button class="ch-btn ch-btn-secondary" onclick="newChallenge()">Next challenge</button>
    </div>
  </div>

  <!-- CHART TOGGLE -->
  <div style="display:flex;gap:8px;margin-bottom:14px;">
    <button class="chart-tab active" onclick="switchChart('donut')">Donut</button>
    <button class="chart-tab" onclick="switchChart('bar')">Bar</button>
    <button class="chart-tab" onclick="switchChart('merchants')">Top spots</button>
  </div>

  <!-- DONUT CHART -->
  <div class="card chart-view" id="chart-donut">
    <div class="card-title">Where your money goes</div>
    <div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;">
      <canvas id="donut-canvas" width="160" height="160" style="flex-shrink:0;"></canvas>
      <div id="donut-legend" style="flex:1;min-width:140px;"></div>
    </div>
  </div>

  <!-- BAR CHART -->
  <div class="card chart-view" id="chart-bar" style="display:none;">
    <div class="card-title">Spending by category</div>
    <div id="bar-list"></div>
  </div>

  <!-- MERCHANTS / TOP SPOTS -->
  <div class="card chart-view" id="chart-merchants" style="display:none;">
    <div class="card-title">Your top spots this month</div>
    <div id="merchant-list"></div>
  </div>

  <!-- PUBS CARD -->
  <div class="card" id="pubs-card" style="display:none;">
    <div class="card-title" id="pubs-card-title">Pubs & bars</div>
    <div id="pubs-summary" style="margin-bottom:12px;"></div>
    <div id="pubs-list"></div>
  </div>

  <!-- NIGHT OUT ROAST CARD -->
  <div id="nights-out-card" style="display:none;margin-bottom:14px;">
    <div id="nights-out-list"></div>
  </div>

  <div class="card" id="subs-card" style="display:none;">
    <div class="card-title">Subscriptions detected</div>
    <div id="subs-list"></div>
  </div>

  <div class="card">
    <div class="card-title">Savings goal</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <span style="font-size:14px;font-weight:500;" id="goal-name">Emergency fund</span>
      <span style="font-size:14px;font-weight:500;" id="goal-pct">0%</span>
    </div>
    <div class="goal-bar-bg"><div class="goal-bar" id="goal-bar" style="width:0%"></div></div>
    <p style="font-size:13px;color:var(--ink3);margin-bottom:10px;" id="goal-sub"></p>
    <details style="font-size:13px;">
      <summary style="cursor:pointer;color:var(--ink3);list-style:none;">✏️ Edit goal</summary>
      <div class="goal-edit-row" style="margin-top:8px;">
        <input type="text" id="goal-name-input" placeholder="Goal name (e.g. Holiday)" maxlength="30">
        <input type="number" id="goal-amt-input" placeholder="Amount €" min="100" max="100000" style="max-width:110px;">
        <button onclick="saveGoal()">Save</button>
      </div>
    </details>
  </div>
</div>

<!-- PRICING -->
<div class="page" id="page-pricing">
  <p class="page-title">Simple pricing</p>
  <p class="page-sub">Start free. Upgrade when it's paying for itself.</p>
  <div class="paywall">
    <div class="plan-grid">
      <div class="plan-card">
        <div class="plan-name">Free</div>
        <div class="plan-price">€0<span>/mo</span></div>
        <div class="plan-features">CSV &amp; PDF upload<br>Category breakdown<br>1 AI analysis/month<br>—</div>
      </div>
      <div class="plan-card featured">
        <div class="plan-badge">Most popular</div>
        <div class="plan-name">Pro</div>
        <div class="plan-price">€8<span>/mo</span></div>
        <div class="plan-features">Unlimited AI coaching<br>Weekly email debrief<br>Goal tracking<br>Subscription auditing</div>
      </div>
      <div class="plan-card">
        <div class="plan-name">Family</div>
        <div class="plan-price">€14<span>/mo</span></div>
        <div class="plan-features">Up to 4 members<br>Shared goal dashboard<br>All Pro features<br>Priority support</div>
      </div>
    </div>
    <button class="stripe-btn" onclick="alert('Stripe integration: connect your Stripe account and replace this with a Stripe Checkout link.')">Get started with Pro →</button>
    <p style="font-size:12px;color:var(--ink3);margin-top:12px;">Cancel any time. No questions asked.</p>
  </div>
</div>

<!-- SETTINGS -->
<div class="page" id="page-settings">
  <p class="page-title">Settings</p>
  <p class="page-sub">Manage your preferences and data.</p>

  <div class="card">
    <div class="card-title">Account</div>
    <div class="setting-row">
      <div>
        <div class="setting-label">Plan</div>
        <div class="setting-sub" id="plan-label">Free</div>
      </div>
      <button class="btn btn-accent" onclick="showPage('pricing')">Upgrade</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Notifications</div>
    <div class="setting-row">
      <div>
        <div class="setting-label">Weekly spending debrief</div>
        <div class="setting-sub">Email summary every Monday morning</div>
      </div>
      <button class="toggle" id="toggle-debrief" onclick="toggleSetting(this,'debrief')"></button>
    </div>
    <div class="setting-row">
      <div>
        <div class="setting-label">Overspend alerts</div>
        <div class="setting-sub">Notify when a category exceeds your budget</div>
      </div>
      <button class="toggle" id="toggle-alerts" onclick="toggleSetting(this,'alerts')"></button>
    </div>
    <div class="setting-row">
      <div>
        <div class="setting-label">Challenge reminders</div>
        <div class="setting-sub">Mid-week check-in on active challenges</div>
      </div>
      <button class="toggle" id="toggle-challenges" onclick="toggleSetting(this,'challenges')"></button>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Privacy & data</div>
    <div class="setting-row">
      <div>
        <div class="setting-label">Clear all local data</div>
        <div class="setting-sub">Removes cached statements and analysis</div>
      </div>
      <button class="btn" onclick="clearData()">Clear</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Legal</div>
    <div class="setting-row">
      <div class="setting-label"><a href="#" onclick="showPage('privacy');return false;" style="color:var(--accent);">Privacy Policy</a></div>
    </div>
    <div class="setting-row">
      <div class="setting-label"><a href="#" onclick="showPage('terms');return false;" style="color:var(--accent);">Terms of Service</a></div>
    </div>
    <div class="setting-row">
      <div class="setting-label" style="color:var(--ink3);font-size:13px;">Skint v1.0 · Made in Dublin 🇮🇪</div>
    </div>
  </div>
</div>

<!-- PRIVACY POLICY -->
<div class="page" id="page-privacy">
  <p class="page-title">Privacy Policy</p>
  <p class="page-sub">Last updated: April 2026</p>

  <div class="card">
    <div class="card-title">The short version</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">CSV files are processed entirely in your browser — never uploaded to our servers. PDF statements are decrypted and text-extracted locally, then the raw transaction text is sent to our backend for AI parsing — this is the only time raw financial data leaves your device, and it is never stored by us or Anthropic. For AI coaching, only anonymised category totals (not merchant names or amounts) are sent. We do not sell your data to anyone, ever.</p>
  </div>

  <div class="card">
    <div class="card-title">Who we are (data controller)</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">Skint is operated as a sole trader registered in Ireland. For GDPR purposes, we are the data controller for any personal data we process. Contact: <a href="#" onclick="window.location.href='mail'+'to:hello@ski'+'nt.ie';return false;" style="color:var(--accent);"><span class="__cf_email__" data-cfemail="b5ddd0d9d9daf5c6dedcdbc19bdcd0">[email&#160;protected]</span></a>. We are not required to appoint a Data Protection Officer at this stage but will review this as the service grows.</p>
  </div>

  <div class="card">
    <div class="card-title">What we collect and why</div>
    <div style="font-size:14px;color:var(--ink2);line-height:1.9;">
      <p style="margin-bottom:12px;"><strong style="color:var(--ink);">Bank statement data (CSV uploads).</strong> Processed locally in your browser only using the FileReader API. Never transmitted to Skint servers. Lawful basis: not applicable — we never receive this data.</p>
      <p style="margin-bottom:12px;"><strong style="color:var(--ink);">Bank statement data (PDF uploads).</strong> PDFs are decrypted and text-extracted entirely in your browser using PDF.js. Your PDF password is used only locally and is never transmitted to our servers or anyone else. The extracted raw text — which includes transaction dates, merchant names, and amounts as they appear on your statement — is then sent to our backend server and forwarded to Anthropic's AI, which identifies and structures the transactions. This is the only circumstance where raw financial data leaves your device. Neither Skint nor Anthropic stores this text after processing. Lawful basis: legitimate interests (providing the PDF parsing service you requested, which cannot function without this step).</p>
      <p style="margin-bottom:12px;"><strong style="color:var(--ink);">Anonymised spending category totals.</strong> When you use AI coaching, category-level totals (e.g. "Groceries: €320") are sent from your browser to our backend server, which forwards them to Anthropic's API. No account numbers or dates are included. Our backend does not log or store these totals. Lawful basis: legitimate interests (providing the core service you requested).</p>
      <p style="margin-bottom:12px;"><strong style="color:var(--ink);">Standard server logs.</strong> Our backend server (hosted on Render) logs IP addresses and request timestamps as part of standard web infrastructure. These logs are retained for up to 30 days and used only for debugging and abuse prevention. Lawful basis: legitimate interests.</p>
      <p style="margin-bottom:12px;"><strong style="color:var(--ink);">Feedback submissions.</strong> Message text and optional email address. Used solely to respond to your feedback and improve the product. Lawful basis: legitimate interests. Retained for up to 12 months then deleted.</p>
      <p><strong style="color:var(--ink);">Billing data (paid plans).</strong> Payment is handled entirely by Stripe. We receive only a customer ID and subscription status — no card numbers or full payment details. Lawful basis: contract performance.</p>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Cookies and local storage</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">Skint does not use tracking cookies or advertising cookies. Google Fonts may set a cookie to cache font files; this is a standard performance cookie with no tracking purpose. No consent banner is required for these uses under Irish/EU ePrivacy rules, but we disclose them here for full transparency.</p>
  </div>

  <div class="card">
    <div class="card-title">Your rights under GDPR</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;margin-bottom:10px;">You have the right to: access personal data we hold about you · request correction of inaccurate data · request erasure ("right to be forgotten") · object to processing · request restriction of processing · data portability · withdraw consent at any time where consent is the lawful basis.</p>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;margin-bottom:10px;">Because we process minimal data, most rights are satisfied automatically. To exercise any right, email <a href="#" onclick="window.location.href='mail'+'to:hello@ski'+'nt.ie';return false;" style="color:var(--accent);"><span class="__cf_email__" data-cfemail="d5bdb0b9b9ba95a6bebcbba1fbbcb0">[email&#160;protected]</span></a>. We will respond within 30 days.</p>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">You have the right to lodge a complaint with the Data Protection Commission (DPC) at <a href="https://www.dataprotection.ie" style="color:var(--accent);">dataprotection.ie</a> or by calling +353 57 868 4800.</p>
  </div>

  <div class="card">
    <div class="card-title">Third-party processors</div>
    <div style="font-size:14px;color:var(--ink2);line-height:1.9;">
      <p style="margin-bottom:12px;"><strong style="color:var(--ink);">Anthropic (USA).</strong> Receives anonymised spending category totals when AI coaching is used. Anthropic is certified under the EU-US Data Privacy Framework and does not use API inputs to train models. Their privacy policy: <a href="https://www.anthropic.com/privacy" style="color:var(--accent);">anthropic.com/privacy</a>.</p>
      <p style="margin-bottom:12px;"><strong style="color:var(--ink);">Netlify (USA).</strong> Hosts this web application. May log IP addresses and request metadata as part of standard web server logs. Netlify is GDPR-compliant and signed to standard contractual clauses. Their privacy policy: <a href="https://www.netlify.com/privacy" style="color:var(--accent);">netlify.com/privacy</a>.</p>
      <p style="margin-bottom:12px;"><strong style="color:var(--ink);">Stripe (USA/Ireland).</strong> Processes payments for paid plans. Stripe is certified under the EU-US Data Privacy Framework and holds PCI-DSS Level 1 certification. Their privacy policy: <a href="https://stripe.com/ie/privacy" style="color:var(--accent);">stripe.com/ie/privacy</a>.</p>
      <p><strong style="color:var(--ink);">Google Fonts (USA).</strong> Serves web fonts. May log your IP address. No personalised tracking. Their privacy policy: <a href="https://policies.google.com/privacy" style="color:var(--accent);">policies.google.com/privacy</a>.</p>
    </div>
  </div>

  <div class="card">
    <div class="card-title">International data transfers</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">Some of our third-party processors are based in the USA. Where personal data is transferred outside the EEA, we rely on either the EU-US Data Privacy Framework (Anthropic, Stripe, Google) or Standard Contractual Clauses (Netlify) as the legal transfer mechanism under GDPR Article 46.</p>
  </div>

  <div class="card">
    <div class="card-title">Data retention</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">We retain feedback submissions for up to 12 months. Billing records are retained for 7 years as required by Irish tax law. All other data is either never received by us (CSV data, API keys) or cleared at session end.</p>
  </div>

  <div class="card">
    <div class="card-title">Changes to this policy</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">We will notify users of material changes by posting a notice in the app and, for paid users, by email. The date at the top of this page indicates when it was last updated.</p>
  </div>

  <button class="btn" onclick="showPage('settings')" style="margin-bottom:2rem;">← Back to settings</button>
</div>

<!-- TERMS OF SERVICE -->
<div class="page" id="page-terms">
  <p class="page-title">Terms of Service</p>
  <p class="page-sub">Last updated: April 2026</p>

  <div class="card">
    <div class="card-title">Agreement and eligibility</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">By accessing or using Skint, you confirm that you are at least 18 years of age and have the legal capacity to enter into a binding agreement. If you do not agree to these terms, do not use the service. Skint is operated as a sole trader registered in Ireland. References to "we", "us", or "our" mean Skint.</p>
  </div>

  <div class="card">
    <div class="card-title">Not financial advice</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">Skint is a personal finance <strong style="color:var(--ink);">information tool only</strong>. Nothing on this platform — including AI-generated coaching, spending analysis, challenge suggestions, or goal projections — constitutes financial advice, investment advice, or a regulated financial service. Skint is not authorised or regulated by the Central Bank of Ireland or any other financial regulatory authority. Always consult a qualified financial adviser before making significant financial decisions.</p>
  </div>

  <div class="card">
    <div class="card-title">Acceptable use</div>
    <div style="font-size:14px;color:var(--ink2);line-height:1.9;">
      <p style="margin-bottom:8px;">You must only upload bank statements and financial data that belong to you or that you have explicit authorisation to process.</p>
      <p style="margin-bottom:8px;">You must not use Skint to process data belonging to another person without their consent, including a partner, family member, or employee.</p>
      <p style="margin-bottom:8px;">You must not attempt to reverse engineer, scrape, or circumvent any part of the service.</p>
      <p>You must not use the service for any unlawful purpose under Irish or EU law.</p>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Your data and our responsibilities</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">You retain full ownership of any financial data you upload. We do not claim any rights over it. Because CSV data is processed entirely in your browser and never transmitted to our servers, we cannot access, recover, or be held responsible for it. You are responsible for maintaining your own copies of your financial records.</p>
  </div>

  <div class="card">
    <div class="card-title">Intellectual property</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">The Skint name, design, code, and content are owned by us and protected by Irish and EU intellectual property law. You may not copy, reproduce, or redistribute any part of Skint without written permission. Nothing in these terms transfers any IP rights to you.</p>
  </div>

  <div class="card">
    <div class="card-title">Subscriptions, payments and cancellation</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;margin-bottom:10px;">Paid plans are billed monthly in advance via Stripe. All prices are shown inclusive of VAT where applicable. You may cancel at any time — cancellation takes effect at the end of the current billing period and you retain access until then.</p>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">Under EU Consumer Rights Directive, you have a 14-day right of withdrawal from the date of first purchase. By using the AI coaching feature before the 14 days have elapsed, you acknowledge that you have requested immediate performance and your right of withdrawal is extinguished upon use of that feature. Refund requests outside this window are at our discretion.</p>
  </div>

  <div class="card">
    <div class="card-title">Service availability</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">We aim to keep Skint available but do not guarantee uninterrupted access. We may suspend or discontinue the service with reasonable notice. If we discontinue a paid plan, we will provide at least 30 days notice and a pro-rata refund for any unused paid period.</p>
  </div>

  <div class="card">
    <div class="card-title">Limitation of liability</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;margin-bottom:10px;">Skint is provided "as is" without warranty of any kind, express or implied. To the fullest extent permitted by Irish law, we exclude all implied warranties including fitness for a particular purpose and accuracy of AI-generated analysis.</p>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">We are not liable for: financial decisions made based on this tool · inaccuracies in AI-generated insights · loss of data · indirect or consequential losses. Our total liability to you shall not exceed the total amount you paid us in the 12 months preceding the claim. Nothing in these terms limits liability for death, personal injury caused by negligence, fraud, or any liability that cannot be excluded by law.</p>
  </div>

  <div class="card">
    <div class="card-title">Changes to these terms</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">We may update these terms. For material changes, we will give paid users at least 30 days notice by email. Continued use after the notice period constitutes acceptance. If you do not accept the new terms, you may cancel your subscription before they take effect for a pro-rata refund.</p>
  </div>

  <div class="card">
    <div class="card-title">Severability and entire agreement</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">If any provision of these terms is found to be unenforceable, the remaining provisions continue in full force. These terms, together with our Privacy Policy, constitute the entire agreement between you and Skint regarding your use of the service.</p>
  </div>

  <div class="card">
    <div class="card-title">Governing law and disputes</div>
    <p style="font-size:14px;color:var(--ink2);line-height:1.8;">These terms are governed by the laws of Ireland. Any disputes shall be subject to the non-exclusive jurisdiction of the Irish courts. If you are a consumer in the EU, you may also use the European Commission's Online Dispute Resolution platform at <a href="https://ec.europa.eu/consumers/odr" style="color:var(--accent);">ec.europa.eu/consumers/odr</a>.</p>
  </div>

  <button class="btn" onclick="showPage('settings')" style="margin-bottom:2rem;">← Back to settings</button>
</div>

<!-- FOOTER -->
<footer style="margin-top:3rem;padding:2rem;border-top:1px solid var(--border2);text-align:center;">
  <p style="font-size:13px;color:var(--ink3);margin-bottom:8px;">
    <a href="#" onclick="showPage('privacy');return false;" style="color:var(--ink3);text-decoration:none;margin:0 10px;">Privacy Policy</a>
    <a href="#" onclick="showPage('terms');return false;" style="color:var(--ink3);text-decoration:none;margin:0 10px;">Terms of Service</a>
    <a href="#" onclick="window.location.href='mail'+'to:hello@ski'+'nt.ie';return false;" style="color:var(--ink3);text-decoration:none;margin:0 10px;">Contact</a>
  </p>
  <p style="font-size:12px;color:var(--ink3);">© 2026 Skint · Made in Dublin 🇮🇪 · Not financial advice</p>
</footer>

<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
// Set PDF.js worker immediately — must happen before any getDocument() call
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
const DEMO_CSV = `Date,Description,Amount,Currency
2025-03-01,Tesco Groceries,-68.40,EUR
2025-03-02,Deliveroo,-22.90,EUR
2025-03-03,Luas,-3.30,EUR
2025-03-03,Insomnia Coffee,-4.80,EUR
2025-03-04,Netflix,-15.99,EUR
2025-03-04,Free Now,-14.50,EUR
2025-03-05,Spotify,-9.99,EUR
2025-03-05,Insomnia Coffee,-5.20,EUR
2025-03-06,Tesco Groceries,-55.20,EUR
2025-03-07,Just Eat,-34.50,EUR
2025-03-07 21:15:00,Nearys Pub,-38.50,EUR
2025-03-07 22:41:00,Nearys Pub,-27.00,EUR
2025-03-07 23:55:00,Nearys Pub,-19.00,EUR
2025-03-08,Centra,-12.40,EUR
2025-03-08,Applegreen,-65.00,EUR
2025-03-09,Dublin Bus,-3.30,EUR
2025-03-09,Cloud Picker Coffee,-4.50,EUR
2025-03-10,Steam,-14.99,EUR
2025-03-10,Boots Pharmacy,-18.40,EUR
2025-03-11,Tesco Groceries,-71.30,EUR
2025-03-12,Deliveroo,-28.40,EUR
2025-03-12,Free Now,-12.80,EUR
2025-03-13,Adobe Creative Cloud,-54.99,EUR
2025-03-13,Rent Payment,-950.00,EUR
2025-03-14,Lidl,-44.60,EUR
2025-03-14 20:30:00,The Long Hall Bar,-18.50,EUR
2025-03-14 22:10:00,The Long Hall Bar,-23.50,EUR
2025-03-15,Bolt,-11.20,EUR
2025-03-15,Supermacs,-12.80,EUR
2025-03-15 23:00:00,Nearys Pub,-27.50,EUR
2025-03-16,Just Eat,-31.20,EUR
2025-03-16,Insomnia Coffee,-4.80,EUR
2025-03-17,Xbox Game Pass,-14.99,EUR
2025-03-17,Electric Ireland,-85.00,EUR
2025-03-18,Tesco Groceries,-63.10,EUR
2025-03-18,Flyfit Gym,-39.99,EUR
2025-03-19,Deliveroo,-19.80,EUR
2025-03-19,Insomnia Coffee,-5.60,EUR
2025-03-20,Penneys,-47.50,EUR
2025-03-20,Amazon,-34.99,EUR
2025-03-21,Dublin Bus,-3.30,EUR
2025-03-21,Dominos,-21.50,EUR
2025-03-21 21:00:00,Nearys Pub,-32.00,EUR
2025-03-21 22:30:00,Grogans Castle Lounge,-31.00,EUR
2025-03-21 23:45:00,Grogans Castle Lounge,-18.00,EUR
2025-03-22,Lidl,-38.90,EUR
2025-03-22,ATM Withdrawal,-60.00,EUR
2025-03-23,Just Eat,-26.40,EUR
2025-03-23,Cloud Picker Coffee,-4.50,EUR
2025-03-24,Revolut Premium,-9.99,EUR
2025-03-24,Free Now,-16.40,EUR
2025-03-25,Tesco Groceries,-58.70,EUR
2025-03-26,Deliveroo,-23.50,EUR
2025-03-26,Insomnia Coffee,-4.80,EUR
2025-03-27,Centra,-9.80,EUR
2025-03-27,Ryanair,-89.99,EUR
2025-03-28,Amazon Prime,-8.99,EUR
2025-03-28 20:00:00,The Long Hall Bar,-29.50,EUR
2025-03-28,McCabes Pharmacy,-22.50,EUR
2025-03-29,Lidl,-41.20,EUR
2025-03-30,Just Eat,-29.10,EUR
2025-03-30,Circle K,-58.00,EUR
2025-03-30 21:30:00,Nearys Pub,-44.00,EUR
2025-03-31,Salary,2800.00,EUR`;

let parsedData = null;
let compareData = null;
let challenges = [];
let challengeIdx = 0;
let goalName = 'Emergency fund';
let goalAmt = 2000;
const _isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const _isAndroid = /android/i.test(navigator.userAgent);

// Restore saved goal
try {
  const sg = localStorage.getItem('sc_goal');
  if (sg) { const g = JSON.parse(sg); goalName = g.name || goalName; goalAmt = g.amt || goalAmt; }
} catch(e) {}

// ── PDF SUPPORT ──
let _pendingPDFBytes = null;
let _pendingPDFName = '';
function ensurePDFJS() {
  if (typeof pdfjsLib === 'undefined') return false;
  // Ensure worker is set (in case the top-level set was skipped)
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  return true;
}

async function extractPDFText(arrayBuffer, password) {
  ensurePDFJS();
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    password: password && password.length > 0 ? password : undefined,
  });
  const pdf = await loadingTask.promise;
  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    pageTexts.push(pageText);
  }
  return { text: pageTexts.join('\n'), pdf };
}

async function renderPDFPagesToImages(pdf) {
  const images = [];
  const maxPages = Math.min(pdf.numPages, 6); // cap at 6 pages to avoid huge payloads
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    // Convert to JPEG at 80% quality to keep payload reasonable
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    images.push(dataUrl.split(',')[1]); // strip the data:image/jpeg;base64, prefix
  }
  return images;
}

async function parsePDFViaAI(rawText, filename) {
  setPDFStatus('Sending to AI for interpretation...');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 40000);
  try {
    const res = await fetch('https://spendcoach-api.onrender.com/parse-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawText.slice(0, 12000) }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('Server error ' + res.status);
    const data = await res.json();
    return data.rows || [];
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

async function parsePDFViaVision(images) {
  setPDFStatus('Reading statement as image — this takes a moment...');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch('https://spendcoach-api.onrender.com/parse-pdf-vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('Server error ' + res.status);
    const data = await res.json();
    return data.rows || [];
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

function setPDFStatus(msg) {
  document.getElementById('pdf-status').style.display = '';
  document.getElementById('pdf-status-text').textContent = msg;
}

function hidePDFStatus() {
  document.getElementById('pdf-status').style.display = 'none';
}

async function retryPDF() {
  if (!_pendingPDFBytes) return;
  const password = document.getElementById('pdf-password').value;
  if (!password) {
    document.getElementById('pdf-password').focus();
    return;
  }
  await processPDFSlot1(_pendingPDFBytes, _pendingPDFName, password);
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.classList.remove('fade-in'); });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('active');
    if (b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + id + "'")) b.classList.add('active');
  });
  // Sync mobile nav
  document.querySelectorAll('.mob-btn').forEach(b => {
    b.classList.remove('active');
    if (b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + id + "'")) b.classList.add('active');
  });
  const pg = document.getElementById('page-' + id);
  if (!pg) return;
  pg.classList.add('active');
  setTimeout(() => pg.classList.add('fade-in'), 10);
  window.scrollTo(0, 0);
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g,'').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = splitCSVLine(lines[i]).map(v => v.replace(/^"|"$/g,'').trim());
    if (vals.length < 2) continue;
    const obj = {};
    headers.forEach((h, idx) => obj[h] = vals[idx] || '');
    rows.push(obj);
  }
  return { headers, rows };
}

function isPub(desc) {
  const d = desc.toLowerCase();
  if (/\bpub\b|\btavern\b|\binn\b|\barms\b|\bbrew|\bale house|\bstout\b/.test(d)) return true;
  if (/(^|\s)bar(\s|$)/.test(d)) return true;
  if (/o'neills|o'brien|mulligan|doheny|toner|kehoe|grogans|davy byrne|the palace|the long hall|the stag|the duke|the oval|porterhouse|the temple bar|dicey|copper face|coppers|fibber|whelans|the cobblestone|the snug|the swan|the ferryman|the jar|sin e|the bankers|doyles|ryans|nearys|mcneills|the barge|the waterloo|the camden|the ginger man|lotts|the bath|john mulligan|the black sheep|the living room|peadar kearney|mulligan|the headline|the bernard shaw|the virgin mary/.test(d)) return true;
  if (/sports bar|cocktail bar|nightclub|night club|mcsorleys|flannery|flannagan|laughter lounge|the button factory/.test(d)) return true;
  return false;
}

function isEatingOut(desc) {
  const d = desc.toLowerCase();
  if (/restaurant|bistro|brasserie|\bcafe\b|\bcafé\b|wagamama|itsa|siam|hawksmoor|fade street|chapter one|bastible|etto|rosa madre|the winding stair|shouk|pickle|uno mas|dax|one pico|fire restaurant|pichet|777|spitalfields|glas|bon appetit|nandos/.test(d)) return true;
  return false;
}

function isCoffee(desc) {
  const d = desc.toLowerCase();
  if (/coffee|starbucks|costa|insomnia|cloud picker|third space|vice coffee|industry \& co|proper order|network|bewleys|butlers|java republic|cream|lovinspoon|the cake cafe|meet me in the morning/.test(d)) return true;
  return false;
}

function isTakeaway(desc) {
  const d = desc.toLowerCase();
  if (/\bchipper\b|supermacs|supermac's|abrakebabra|burger king|kfc|mcdonalds|mcdonald|dominos|domino's|papa john|subway|five guys|apache pizza|thunder road|leo burdock|burdock|777|umi falafel|camile|boojum/.test(d)) return true;
  return false;
}

function isRideshare(desc) {
  const d = desc.toLowerCase();
  if (/free now|freenow|uber(?! eats)|mytaxi|taxi|lynk|vib taxi|\bcab\b/.test(d)) return true;
  if (/\bbolt\b/.test(d) && !/bolt energy|bolt broadband/.test(d)) return true;
  return false;
}

function isPetrol(desc) {
  const d = desc.toLowerCase();
  if (/circle k|applegreen|maxol|topaz|texaco|esso|bp \b|shell \b|forecourt|petrol|diesel|fuel/.test(d)) return true;
  if (/\bparking\b|\bq-park\b|\bncp\b|\biparktech\b|\bpayzone park/.test(d)) return true;
  return false;
}

function isPharmacy(desc) {
  const d = desc.toLowerCase();
  if (/lloyds pharmacy|mcquillan|mccabes|\bpharmacy\b|\bchemist\b|unicare|allcare|well pharmacy|life pharmacy|hickeys pharmacy|o'brien's pharmacy|boots pharmacy/.test(d)) return true;
  if (/\bdoctor\b|\bgp \b|\bdentist\b|\boptician\b|\bspecialist\b|\bclinic\b|\bphysio\b|\bhospital\b/.test(d)) return true;
  return false;
}

function isGroceries(desc) {
  const d = desc.toLowerCase();
  if (/tesco|lidl|aldi|supervalu|dunnes|centra|spar|grocery|supermarket|fresh|eurospar/.test(d)) return true;
  return false;
}

function isRentBills(desc) {
  const d = desc.toLowerCase();
  if (/\brent\b|\blandlord\b|\blease\b|\bdigs\b/.test(d)) return true;
  if (/electric ireland|bord gais|gas networks|irish water|upc|virgin media|sky \b|eir \b|three \b|vodafone|meteor|tesco mobile|48 \b|utilities/.test(d)) return true;
  return false;
}

function isShopping(desc) {
  const d = desc.toLowerCase();
  if (/amazon(?! prime)|argos|ikea|harvey norman|curry's|currys|pc world|smyths|woodies|b&q|mr price|dealz|home store|tk maxx|tkmaxx|next \b|marks & spencer|m&s/.test(d)) return true;
  return false;
}

function isFitness(desc) {
  const d = desc.toLowerCase();
  if (/\bgym\b|fitness|yoga|pilates|decathlon|sports direct|life style sports|elvery|flyfit|energy fitness|energy gym|total fitness|the gym|snap fitness|virgin active|pure gym/.test(d)) return true;
  return false;
}

function isTravel(desc) {
  const d = desc.toLowerCase();
  if (/ryanair|aer lingus|airbnb|booking\.com|hotels\.com|hostelworld|tripadvisor|skyscanner|expedia|emirates|british airways|easyjet|\bflight\b|\bhotel\b/.test(d)) return true;
  return false;
}

function isATM(desc) {
  const d = desc.toLowerCase();
  if (/\batm\b|cash machine|cash withdrawal|withdraw|bank machine/.test(d)) return true;
  return false;
}

function categorise(desc) {
  const d = desc.toLowerCase();
  if (/\bsalary\b|\bwage\b|\bpayroll\b|\bpay slip\b|\bincome\b/.test(d)) return 'Income';
  if (isATM(desc)) return 'Cash withdrawal';
  if (isRentBills(desc)) return 'Rent & bills';
  if (isGroceries(desc)) return 'Groceries';
  if (/deliveroo|just eat|uber eats|food delivery/.test(d)) return 'Food delivery';
  if (isTakeaway(desc)) return 'Takeaways';
  if (isPub(desc)) return 'Pubs & bars';
  if (isCoffee(desc)) return 'Coffee';
  if (isEatingOut(desc)) return 'Eating out';
  if (isRideshare(desc)) return 'Taxis';
  if (/luas|dublin bus|dart|iarnrod|irish rail|bus eireann|go-ahead|leap card|leap top|translink/.test(d) || /(^|\s)bus(\s|$)/.test(d)) return 'Public transport';
  if (isPetrol(desc)) return 'Petrol & parking';
  if (isTravel(desc)) return 'Travel';
  if (/netflix|spotify|disney|amazon prime|hbo|apple tv|apple one|apple music|hbo|paramount|deezer|tidal|adobe|xbox|playstation|game pass|revolut premium|youtube premium|setanta|now tv/.test(d)) return 'Subscriptions';
  if (/steam|gaming|ps4|ps5|nintendo|\bgame stop\b|\bgamestop\b/.test(d)) return 'Gaming';
  if (/penneys|zara|h&m|asos|primark|shein|boohoo|clothing|fashion|river island|topshop|urban outfitters|cos \b|arket/.test(d)) return 'Clothing';
  if (isPharmacy(desc)) return 'Health';
  if (isFitness(desc)) return 'Fitness';
  if (isShopping(desc)) return 'Shopping';
  return 'Other';
}

function cleanMerchantName(raw) {
  if (!raw || !raw.trim()) return '';
  return raw
    .replace(/\*+/g, '')
    .replace(/\b\d{4,}\b/g, '')
    .replace(/\b(ltd|limited|plc|irl|ireland|dublin|dub|ie|dac)\b/gi, '')
    .replace(/[_]{2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function buildSummary(rows) {
  const cats = {};
  const subs = [];
  const merchants = {};
  const pubs = {};
  const pubTransactions = []; // raw pub txns with date/time for night out detection
  let totalSpent = 0;
  let income = 0;

  const subKeywords = /netflix|spotify|disney|amazon prime|hbo|apple tv|apple one|apple music|paramount|deezer|tidal|adobe|xbox|playstation|game pass|revolut premium|youtube premium|setanta|now tv/i;

  rows.forEach(r => {
    const keys = Object.keys(r);
    const amtKey = keys.find(k => k === 'amount') ||
                   keys.find(k => k.includes('amount')) ||
                   keys.find(k => k === 'debit');
    const descKey = keys.find(k => k.includes('desc') || k.includes('narr') || k.includes('detail') || k.includes('merchant') || k === 'reference' || k === 'type');
    const dateKey = keys.find(k => k === 'date' || k.includes('date') || k === 'time' || k.includes('time') || k === 'completed');
    if (!amtKey || !descKey) return;
    const amt = parseFloat(r[amtKey]);
    if (isNaN(amt)) return;
    const rawDesc = r[descKey] || '';
    const cat = categorise(rawDesc);
    const rawDate = dateKey ? r[dateKey] : '';

    if (amt < 0) {
      const spend = Math.abs(amt);
      cats[cat] = (cats[cat] || 0) + spend;
      totalSpent += spend;

      const mName = cleanMerchantName(rawDesc);
      if (mName && cat !== 'Income') {
        if (!merchants[mName]) merchants[mName] = { total: 0, visits: 0, category: cat };
        merchants[mName].total += spend;
        merchants[mName].visits++;
      }

      if (cat === 'Pubs & bars') {
        const pName = cleanMerchantName(rawDesc);
        if (!pubs[pName]) pubs[pName] = { total: 0, visits: 0 };
        pubs[pName].total += spend;
        pubs[pName].visits++;
        pubTransactions.push({ name: pName, amount: spend, rawDate, rawDesc });
      }

      if (subKeywords.test(rawDesc)) {
        const existing = subs.find(s => s.name.toLowerCase() === rawDesc.toLowerCase());
        if (!existing) subs.push({ name: cleanMerchantName(rawDesc), amount: spend });
      }
    } else {
      income += amt;
    }
  });

  delete cats['Income'];

  // ── NIGHT OUT DETECTION ──
  // Group pub transactions by date, look for nights where spend > €20 in one session
  const nightsOut = detectNightsOut(pubTransactions);

  const topMerchants = Object.entries(merchants)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8)
    .map(([name, v]) => ({ name, ...v }));

  const topPubs = Object.entries(pubs)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, v]) => ({ name, ...v }));

  return {
    cats, subs, topMerchants, topPubs, nightsOut, totalSpent, income,
    txnCount: rows.filter(r => {
      const keys = Object.keys(r);
      const amtKey = keys.find(k => k === 'amount') || keys.find(k => k.includes('amount')) || keys.find(k => k === 'debit');
      return amtKey && parseFloat(r[amtKey]) < 0;
    }).length
  };
}

function detectNightsOut(pubTxns) {
  if (!pubTxns.length) return [];

  // Parse dates — handle ISO datetime (2025-03-07T22:41:00) and date-only (2025-03-07)
  const withDates = pubTxns.map(t => {
    let d = null;
    if (t.rawDate) {
      d = new Date(t.rawDate);
      if (isNaN(d.getTime())) d = null;
    }
    return { ...t, date: d };
  });

  // Group by calendar date string
  const byDate = {};
  withDates.forEach(t => {
    let key;
    if (t.date && !isNaN(t.date.getTime())) {
      // Use local date to avoid UTC shift misclassifying late-night transactions
      const y = t.date.getFullYear();
      const m = String(t.date.getMonth() + 1).padStart(2, '0');
      const d = String(t.date.getDate()).padStart(2, '0');
      key = `${y}-${m}-${d}`;
    } else {
      key = (t.rawDate || '').slice(0, 10) || 'unknown';
    }
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(t);
  });

  const nights = [];
  Object.entries(byDate).forEach(([dateStr, txns]) => {
    const totalOnDate = txns.reduce((s, t) => s + t.amount, 0);
    if (totalOnDate < 20) return; // not a notable night

    // Find the main pub (most spent)
    const byPub = {};
    txns.forEach(t => {
      byPub[t.name] = (byPub[t.name] || 0) + t.amount;
    });
    const mainPub = Object.entries(byPub).sort((a,b) => b[1]-a[1])[0];

    // Determine if it was a big single-pub session (>€20 at one venue)
    const bigSinglePub = mainPub && mainPub[1] >= 20;

    // Format the date nicely — parse as local to get correct weekday
    const [y, mo, dy] = dateStr.split('-').map(Number);
    const d = (y && mo && dy) ? new Date(y, mo - 1, dy) : new Date(dateStr);
    const dayName = isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'short' });
    const isWeekend = !isNaN(d.getTime()) && (d.getDay() === 5 || d.getDay() === 6 || d.getDay() === 0);

    nights.push({
      date: dateStr,
      dayName,
      isWeekend,
      total: totalOnDate,
      venues: Object.keys(byPub).length,
      mainPub: mainPub ? mainPub[0] : null,
      mainPubSpend: mainPub ? mainPub[1] : 0,
      bigSinglePub,
      txnCount: txns.length,
    });
  });

  return nights.sort((a,b) => b.total - a.total); // biggest night first
}

const CAT_COLORS = {
  'Groceries':        '#2B5F3E',
  'Food delivery':    '#C94A2A',
  'Takeaways':        '#E07B39',
  'Pubs & bars':      '#BA7517',
  'Coffee':           '#7B4F2E',
  'Eating out':       '#985DA0',
  'Taxis':            '#378ADD',
  'Public transport': '#5B9BD5',
  'Petrol & parking': '#4A7C59',
  'Travel':           '#2196A8',
  'Subscriptions':    '#7F77DD',
  'Gaming':           '#4A9B68',
  'Clothing':         '#D4537E',
  'Health':           '#E84393',
  'Fitness':          '#3DAA6E',
  'Shopping':         '#8B6914',
  'Rent & bills':     '#555555',
  'Cash withdrawal':  '#888780',
  'Other':            '#A09D99',
};

function switchChart(type) {
  document.querySelectorAll('.chart-view').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.chart-tab').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('chart-' + type);
  if (target) target.style.display = '';
  document.querySelectorAll('.chart-tab').forEach(el => {
    if (el.getAttribute('onclick') && el.getAttribute('onclick').includes("'" + type + "'")) el.classList.add('active');
  });
}

function drawDonut(sortedCats, totalSpent) {
  const canvas = document.getElementById('donut-canvas');
  const dpr = window.devicePixelRatio || 1;
  const size = 160;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);
  const cx = 80, cy = 80, r = 70, inner = 42;
  let angle = -Math.PI / 2;
  sortedCats.forEach(([name, amt]) => {
    const slice = (amt / totalSpent) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = CAT_COLORS[name] || '#888780';
    ctx.fill();
    angle += slice;
  });
  // Inner circle cutout
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface') || '#fff';
  ctx.fill();
  // Center label
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary') || '#1A1814';
  ctx.font = '500 13px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Total', cx, cy - 9);
  ctx.font = '500 15px DM Sans, sans-serif';
  ctx.fillText('€' + Math.round(totalSpent).toLocaleString(), cx, cy + 9);

  // Legend
  const legend = document.getElementById('donut-legend');
  legend.innerHTML = sortedCats.map(([name, amt]) => {
    const pct = Math.round((amt / totalSpent) * 100);
    return `<div class="legend-row">
      <div class="legend-dot" style="background:${CAT_COLORS[name]||'#888780'}"></div>
      <span style="flex:1;color:var(--color-text-primary,#1A1814)">${name}</span>
      <span style="color:var(--color-text-secondary,#6B6760)">${pct}%</span>
    </div>`;
  }).join('');
}

function roastLine(night) {
  const emoji = '👀';
  const pub = night.mainPub || 'the pub';
  const total = '€' + Math.round(night.total);

  if (night.venues > 2) {
    return `${emoji} ${night.dayName} — €${Math.round(night.total)} across ${night.venues} venues. The tour was real.`;
  }
  if (night.bigSinglePub && night.mainPubSpend >= 60) {
    return `${emoji} ${night.dayName} — €${Math.round(night.mainPubSpend)} in ${pub} alone. Hope it was worth it.`;
  }
  if (night.bigSinglePub && night.mainPubSpend >= 35) {
    return `${emoji} ${night.dayName} — €${Math.round(night.mainPubSpend)} in ${pub}. That's a few rounds.`;
  }
  if (night.isWeekend) {
    return `${emoji} ${night.dayName} — ${total} on a night out. Classic.`;
  }
  return `${emoji} ${night.dayName} — ${total} at ${pub}. Midweek session?`;
}

function renderNightsOut(nightsOut) {
  const card = document.getElementById('nights-out-card');
  const list = document.getElementById('nights-out-list');
  if (!nightsOut || nightsOut.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = '';
  // Show up to 3 biggest nights
  list.innerHTML = nightsOut.slice(0, 3).map((night, i) => {
    const isBig = night.total >= 50 || night.bigSinglePub;
    const roast = roastLine(night);
    return `<div class="night-card ${isBig ? 'big-night' : ''}">
      <div class="night-roast">${roast}</div>
      <div class="night-meta">${night.txnCount} transaction${night.txnCount !== 1 ? 's' : ''} · ${night.venues} venue${night.venues !== 1 ? 's' : ''} · €${Math.round(night.total)} total</div>
    </div>`;
  }).join('');
}

function renderDashboard(summary, filename) {
  challenges = [];
  challengeIdx = 0;
  compareData = null;
  document.getElementById('challenge-card').style.display = 'none';
  document.getElementById('subs-card').style.display = 'none';
  document.getElementById('nights-out-card').style.display = 'none';
  document.getElementById('compare-card').style.display = 'none';
  document.getElementById('compare-upload-card').style.display = '';
  hidePDFStatus();
  document.getElementById('pdf-password-section').style.display = 'none';
  document.getElementById('coach-content').innerHTML = '<div class="thinking"><div class="dot-pulse"><span></span><span></span><span></span></div>Analysing your spending patterns...</div>';
  document.getElementById('dashboard-btn').style.display = '';
  document.getElementById('mob-dashboard').style.display = '';
  document.getElementById('dash-title').textContent = filename || 'Your spending';
  document.getElementById('dash-sub').textContent = summary.txnCount + ' spending transactions analysed';
  document.getElementById('m-spent').textContent = '€' + Math.round(summary.totalSpent).toLocaleString();
  document.getElementById('m-txn').textContent = summary.txnCount;
  document.getElementById('m-txn-sub').textContent = summary.txnCount === 1 ? 'spending item' : 'spending items';

  // Daily average — assume 30 day month
  const dailyAvg = summary.totalSpent / 30;
  document.getElementById('m-daily').textContent = '€' + Math.round(dailyAvg);
  document.getElementById('m-daily-sub').textContent = 'per day on average';

  // Spent sub
  document.getElementById('m-spent-sub').textContent = summary.txnCount + ' transactions';

  // Share strip
  const shareStrip = document.getElementById('share-strip');
  const topCatName = Object.entries(summary.cats).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'spending';
  document.getElementById('share-headline').textContent = `€${Math.round(summary.totalSpent)} spent · biggest: ${topCatName}`;
  shareStrip.style.display = 'flex';

  const sortedCats = Object.entries(summary.cats).sort((a,b) => b[1]-a[1]);
  const topCat = sortedCats[0];
  document.getElementById('m-top').textContent = topCat ? topCat[0] : '—';
  const topPct = topCat && summary.totalSpent > 0 ? Math.round((topCat[1] / summary.totalSpent) * 100) : 0;
  document.getElementById('m-top-sub').textContent = topCat ? `${topPct}% of total spend` : '';

  // ── INSIGHT STRIP ──
  const insightStrip = document.getElementById('insight-strip');
  insightStrip.style.display = 'flex';

  // Biggest single transaction — find actual highest single spend from raw data
  const bigTxnMerchant = summary.topMerchants.reduce((best, m) => {
    const avgPerVisit = m.total / m.visits;
    return (!best || avgPerVisit > best.total / best.visits) ? m : best;
  }, null);
  document.getElementById('insight-bigtxn-val').textContent = bigTxnMerchant
    ? `€${Math.round(bigTxnMerchant.total / bigTxnMerchant.visits)} at ${bigTxnMerchant.name}`
    : '—';

  // Food delivery vs groceries ratio
  const delivery = summary.cats['Food delivery'] || 0;
  const takeaways = summary.cats['Takeaways'] || 0;
  const groceries = summary.cats['Groceries'] || 0;
  const totalFood = delivery + takeaways;
  if (totalFood > 0 && groceries > 0) {
    const ratio = Math.round((totalFood / groceries) * 100);
    document.getElementById('insight-delivery-val').textContent = `€${Math.round(totalFood)} eating out vs €${Math.round(groceries)} groceries (${ratio}%)`;
  } else if (totalFood > 0) {
    document.getElementById('insight-delivery-val').textContent = `€${Math.round(totalFood)} on takeaways & delivery this month`;
  } else {
    document.getElementById('insight-delivery-val').textContent = 'No delivery or takeaway spending 🎉';
  }

  // You could save — cut top category by 20%
  const couldSave = topCat ? Math.round(topCat[1] * 0.2) : 0;
  document.getElementById('insight-save-val').textContent = couldSave > 0
    ? `€${couldSave}/mo by cutting ${topCat[0]} by 20%`
    : '—';

  // Reset chart to donut view
  switchChart('donut');

  // ── DONUT CHART ──
  if (summary.totalSpent > 0) {
    drawDonut(sortedCats, summary.totalSpent);
  } else {
    const canvas = document.getElementById('donut-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('donut-legend').innerHTML = '<p style="font-size:13px;color:var(--ink3)">No spending found in this statement.</p>';
  }

  // ── BAR CHART ──
  const maxAmt = topCat ? topCat[1] : 1;
  document.getElementById('bar-list').innerHTML = summary.totalSpent > 0 ? sortedCats.map(([name, amt]) => {
    const pct = Math.round((amt / summary.totalSpent) * 100);
    const barW = Math.round((amt / maxAmt) * 100);
    const isHigh = pct > 20;
    return `<div class="cat-row">
      <span class="cat-name">${name}</span>
      <div class="cat-bar-bg"><div class="cat-bar" style="width:${barW}%;background:${CAT_COLORS[name]||'#888780'}"></div></div>
      <span class="cat-amt">€${Math.round(amt)}</span>
      ${isHigh ? `<span class="cat-badge badge-warn">High</span>` : ''}
    </div>`;
  }).join('') : '<p style="font-size:13px;color:var(--ink3)">No spending found in this statement.</p>';

  // ── MERCHANT TOP SPOTS ──
  const avatarColors = ['#E1F5EE','#FAECE7','#E6F1FB','#FAEEDA','#FBEAF0','#EAF3DE','#EEEDFE','#FCF0ED'];
  const avatarText   = ['#085041','#712B13','#0C447C','#633806','#72243E','#27500A','#3C3489','#993C1D'];
  document.getElementById('merchant-list').innerHTML = summary.topMerchants.map((m, i) => {
    const initials = m.name.split(' ').filter(w => w.length > 0).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
    const ai = i % avatarColors.length;
    const visitsLabel = m.visits === 1 ? '1 visit' : m.visits + ' visits';
    const perVisit = m.visits > 1 ? ` · €${(m.total / m.visits).toFixed(0)}/visit` : '';
    return `<div class="merchant-row">
      <div class="merchant-avatar" style="background:${avatarColors[ai]};color:${avatarText[ai]}">${initials}</div>
      <div style="flex:1;min-width:0;">
        <div class="merchant-name">${m.name}</div>
        <div class="merchant-meta">${m.category} · ${visitsLabel}${perVisit}</div>
      </div>
      <div class="merchant-amt">€${Math.round(m.total)}</div>
    </div>`;
  }).join('') || '<p style="font-size:13px;color:var(--ink3)">Upload a CSV to see your top spots.</p>';

  // ── PUBS CARD ── always show with empty state if no pub spending
  document.getElementById('pubs-card').style.display = '';
  if (summary.topPubs.length > 0) {
    const totalPubSpend = summary.topPubs.reduce((s, p) => s + p.total, 0);
    const totalPubVisits = summary.topPubs.reduce((s, p) => s + p.visits, 0);
    const topPub = summary.topPubs[0];
    const avgPerVisit = totalPubVisits > 0 ? (totalPubSpend / totalPubVisits).toFixed(0) : 0;
    document.getElementById('pubs-card-title').textContent = `Pubs & bars · €${Math.round(totalPubSpend)} this month`;
    document.getElementById('pubs-summary').innerHTML =
      `<p style="font-size:14px;color:var(--ink2);line-height:1.7;">
        Your local is <strong style="color:var(--ink)">${topPub.name}</strong> — you've been ${topPub.visits === 1 ? 'once' : topPub.visits + ' times'} this month
        ${topPub.visits > 1 ? `spending an average of <strong style="color:var(--ink)">€${(topPub.total/topPub.visits).toFixed(0)}</strong> per visit` : `spending <strong style="color:var(--ink)">€${Math.round(topPub.total)}</strong>`}.
        Across all ${summary.topPubs.length > 1 ? summary.topPubs.length + ' venues' : 'visits'} you're averaging
        <strong style="color:var(--ink)">€${avgPerVisit}</strong> per night out.
      </p>`;
    document.getElementById('pubs-list').innerHTML = summary.topPubs.map((p, i) => {
      const isTop = i === 0;
      return `<div class="merchant-row">
        <div class="merchant-avatar" style="background:#FAEEDA;color:#633806">${p.name.charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div class="merchant-name">${p.name} ${isTop ? '<span style="font-size:11px;background:#FAEEDA;color:#633806;padding:2px 7px;border-radius:10px;font-weight:500;margin-left:4px;">local</span>' : ''}</div>
          <div class="merchant-meta">${p.visits} visit${p.visits !== 1 ? 's' : ''} · €${(p.total/p.visits).toFixed(0)}/visit avg</div>
        </div>
        <div class="merchant-amt">€${Math.round(p.total)}</div>
      </div>`;
    }).join('');
  } else {
    document.getElementById('pubs-card-title').textContent = 'Pubs & bars';
    document.getElementById('pubs-summary').innerHTML = '<div class="empty-state"><span>🎉</span>No pub spending detected this month. Staying in paid off.</div>';
    document.getElementById('pubs-list').innerHTML = '';
  }

  // ── NIGHTS OUT ROAST ──
  renderNightsOut(summary.nightsOut);

  // ── SUBSCRIPTIONS ── always show with empty state
  document.getElementById('subs-card').style.display = '';
  if (summary.subs.length > 0) {
    document.getElementById('subs-list').innerHTML = summary.subs.map(s =>
      `<div class="sub-row"><span class="sub-name">${s.name}</span><span class="sub-amt">€${s.amount.toFixed(2)}/mo</span></div>`
    ).join('');
  } else {
    document.getElementById('subs-list').innerHTML = '<div class="empty-state"><span>✅</span>No recurring subscriptions detected.</div>';
  }

  // ── GOAL ──
  const monthlySurplus = Math.max(0, summary.income - summary.totalSpent);
  const estimatedSaved = summary.income > 0 ? Math.min(monthlySurplus * 4, goalAmt) : Math.min(summary.totalSpent * 0.15, goalAmt);
  const goalSaved = Math.round(estimatedSaved);
  const goalPct = Math.round((goalSaved / goalAmt) * 100);
  document.getElementById('goal-name').textContent = goalName;
  document.getElementById('goal-pct').textContent = goalPct + '%';
  document.getElementById('goal-sub').textContent = `€${goalSaved.toLocaleString()} saved toward €${goalAmt.toLocaleString()} · €${(goalAmt - goalSaved).toLocaleString()} to go`;
  document.getElementById('goal-name-input').value = goalName;
  document.getElementById('goal-amt-input').value = goalAmt;
  setTimeout(() => { document.getElementById('goal-bar').style.width = goalPct + '%'; }, 100);

  fetchCoaching(summary);
}

async function fetchCoaching(summary) {
  const coachEl = document.getElementById('coach-content');

  const summaryText = Object.entries(summary.cats)
    .sort((a,b) => b[1]-a[1])
    .map(([k,v]) => `${k}: €${Math.round(v)}`)
    .join(', ');

  const pubText = summary.topPubs.length > 0
    ? ` My top pubs: ${summary.topPubs.slice(0,3).map(p => `${p.name} (${p.visits} visit${p.visits!==1?'s':''}, €${Math.round(p.total)})`).join(', ')}.`
    : '';

  const merchantText = summary.topMerchants.length > 0
    ? ` My top merchants: ${summary.topMerchants.slice(0,4).map(m => `${m.name} (€${Math.round(m.total)})`).join(', ')}.`
    : '';

  const userMsg = `My spending this month: ${summaryText}. Total spent: €${Math.round(summary.totalSpent)}. Transactions: ${summary.txnCount}.${pubText}${merchantText} Please reference specific pub or merchant names where relevant.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const res = await fetch('https://spendcoach-api.onrender.com/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMsg }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('Server error ' + res.status);
    const data = await res.json();
    const text = data.text || '';
    const parts = text.split('Challenge:');
    const coachDiv = document.createElement('div');
    coachDiv.className = 'coach-text';
    coachDiv.textContent = parts[0].trim();
    coachEl.innerHTML = '';
    coachEl.appendChild(coachDiv);
    if (parts[1]) {
      challenges = ['Challenge: ' + parts[1].trim()];
      buildChallenges(summary);
    } else {
      buildChallenges(summary);
    }
    maybeShowEmailCapture();
  } catch(e) {
    coachEl.innerHTML = '';
    const errDiv = document.createElement('div');
    errDiv.className = 'coach-text';
    errDiv.textContent = e.name === 'AbortError'
      ? 'AI coaching is warming up — this can take up to 30 seconds on first load. Refresh the page to try again.'
      : 'AI coaching is temporarily unavailable. Your spending breakdown is still accurate above.';
    coachEl.appendChild(errDiv);
    buildChallenges(summary);
  }
}

function buildChallenges(summary) {
  const sorted = Object.entries(summary.cats).sort((a,b) => b[1]-a[1]);
  const top = sorted[0]?.[0] || 'spending';
  const topAmt = Math.round(sorted[0]?.[1] || 0);
  const fallback = [
    `Cut your ${top} spend by 20% this week — that's €${Math.round(topAmt * 0.2)} back in your pocket.`,
    `Cook at home every evening for 5 days and save an estimated €30–45.`,
    `Review your subscriptions and cancel one you haven't used in 30 days.`,
    `Set a €15/day spending cap for the next 7 days.`
  ];
  challenges = challenges.length > 0 ? [...challenges, ...fallback] : fallback;
  challengeIdx = 0;
  document.getElementById('challenge-text').textContent = challenges[0];
  document.getElementById('challenge-card').style.display = '';
}

function acceptChallenge(btn) {
  btn.textContent = '✓ Accepted!';
  btn.disabled = true;
  btn.style.background = '#e0f0e8';
  btn.style.color = 'var(--accent)';
}

function newChallenge() {
  if (!challenges.length) return;
  challengeIdx = (challengeIdx + 1) % challenges.length;
  document.getElementById('challenge-text').textContent = challenges[challengeIdx];
  const btn = document.querySelector('#challenge-card .ch-btn-primary');
  if (btn) { btn.textContent = 'Accept it'; btn.disabled = false; btn.style.cssText = ''; }
}

function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  _pendingName1 = file.name.replace(/\.(csv|pdf)$/i, '');

  document.getElementById('pdf-password-section').style.display = 'none';
  document.getElementById('pdf-password-error').style.display = 'none';
  hidePDFStatus();
  _pendingPDFBytes = null;
  _pendingPDFName = file.name;

  if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
    if (!ensurePDFJS()) {
      setPDFStatus('PDF support is loading — please try again in a moment.');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => processPDFSlot1(ev.target.result, file.name, '');
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = ev => {
      const { rows } = parseCSV(ev.target.result);
      _pendingRows1 = rows;
      markSlot(1, _pendingName1);
      document.getElementById('upload-go-btn').style.display = '';
    };
    reader.readAsText(file, 'UTF-8');
  }
}

async function processPDFSlot1(arrayBuffer, filename, password) {
  document.getElementById('pdf-password-section').style.display = 'none';
  document.getElementById('pdf-password-error').style.display = 'none';
  setPDFStatus(password ? 'Unlocking PDF...' : 'Reading PDF...');
  try {
    const { text: rawText, pdf } = await extractPDFText(arrayBuffer, password);

    let rows = [];

    if (rawText.trim().length > 200) {
      // Text-based PDF — use text extraction
      setPDFStatus('Extracted text — asking AI to find transactions...');
      rows = await parsePDFViaAI(rawText, filename);
    } else {
      // Image-based PDF (e.g. PTSB) — fall back to vision
      setPDFStatus('No text found — switching to image reading...');
      const images = await renderPDFPagesToImages(pdf);
      rows = await parsePDFViaVision(images);
    }

    hidePDFStatus();
    if (!rows || rows.length === 0) {
      setPDFStatus('Could not find transactions in this PDF. Try a CSV export instead.');
      return;
    }
    _pendingRows1 = rows;
    markSlot(1, _pendingName1);
    document.getElementById('upload-go-btn').style.display = '';
    _pendingPDFBytes = null;
  } catch (e) {
    hidePDFStatus();
    if (e.name === 'PasswordException' || (e.message && e.message.toLowerCase().includes('password'))) {
      _pendingPDFBytes = arrayBuffer;
      document.getElementById('pdf-password-section').style.display = '';
      if (password) document.getElementById('pdf-password-error').style.display = '';
    } else if (e.name === 'AbortError') {
      setPDFStatus('AI timed out — the server may be warming up. Please try again in 30 seconds.');
    } else {
      setPDFStatus('Could not read this PDF. Try downloading a CSV from your bank instead.');
    }
  }
}

function loadDemo() {
  const { rows } = parseCSV(DEMO_CSV);
  const summary = buildSummary(rows);
  parsedData = summary;
  _pendingRows1 = null;
  _pendingRows2 = null;
  renderDashboard(summary, 'March 2025 (demo)');
  showPage('dashboard');
}

function clearData() {
  parsedData = null;
  compareData = null;
  challenges = [];
  _pendingPDFBytes = null;
  _pendingPDFName = '';
  _pendingRows1 = null;
  _pendingRows2 = null;
  _pendingName1 = '';
  _pendingName2 = '';
  resetSlotUI();
  sessionStorage.removeItem('sc_key');
  document.getElementById('dashboard-btn').style.display = 'none';
  document.getElementById('mob-dashboard').style.display = 'none';
  document.getElementById('share-strip').style.display = 'none';
  document.getElementById('compare-card').style.display = 'none';
  document.getElementById('insight-strip').style.display = 'none';
  hidePDFStatus();
  document.getElementById('pdf-password-section').style.display = 'none';
  document.getElementById('pdf-password-error').style.display = 'none';
  const btn = document.querySelector('[onclick="clearData()"]');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Cleared';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  }
  showPage('home');
}

// Drag and drop on both upload slots
['slot-primary', 'slot-secondary'].forEach(slotId => {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  let dragCounter = 0;
  slot.addEventListener('dragenter', e => { e.preventDefault(); dragCounter++; slot.classList.add('drag'); });
  slot.addEventListener('dragleave', () => { dragCounter--; if (dragCounter <= 0) { dragCounter = 0; slot.classList.remove('drag'); } });
  slot.addEventListener('dragover', e => e.preventDefault());
  slot.addEventListener('drop', e => {
    e.preventDefault(); dragCounter = 0; slot.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (slotId === 'slot-primary') {
      const input = document.getElementById('csv-file');
      const dt = new DataTransfer(); dt.items.add(file);
      input.files = dt.files;
      handleFile({ target: input });
    } else {
      const input = document.getElementById('csv-file-2');
      const dt = new DataTransfer(); dt.items.add(file);
      input.files = dt.files;
      handleFile2({ target: input });
    }
  });
});
function showFeedback() {
  const overlay = document.getElementById('feedback-overlay');
  overlay.style.display = 'flex';
  document.getElementById('feedback-thanks').style.display = 'none';
  document.getElementById('feedback-text').value = '';
  document.getElementById('feedback-email').value = '';
  document.getElementById('feedback-text').focus();
}

function hideFeedback() {
  document.getElementById('feedback-overlay').style.display = 'none';
}

function submitFeedback() {
  const msg = document.getElementById('feedback-text').value.trim();
  const email = document.getElementById('feedback-email').value.trim();
  if (!msg) { document.getElementById('feedback-text').focus(); return; }
  const subject = encodeURIComponent('Skint feedback');
  const body = encodeURIComponent((email ? 'From: ' + email + '\n\n' : '') + msg);
  const a = document.createElement('a');
  a.href = `mailto:hello@skint.ie?subject=${subject}&body=${body}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  document.getElementById('feedback-thanks').style.display = 'block';
  setTimeout(hideFeedback, 3000);
}

// Close modal on overlay click
document.getElementById('feedback-overlay').addEventListener('click', function(e) {
  if (e.target === this) hideFeedback();
});

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') hideFeedback();
});
function handleRevolutLink(e) {
  e.preventDefault();
  if (_isIOS) {
    window.location.href = 'revolutios://more/statements';
    const fallbackTimer = setTimeout(() => {
      window.location.href = 'https://apps.apple.com/ie/app/revolut/id932110723';
    }, 1500);
    window.addEventListener('blur', () => clearTimeout(fallbackTimer), { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(fallbackTimer);
    }, { once: true });
  } else if (_isAndroid) {
    window.location.href = 'intent://more/statements#Intent;scheme=revolutandroid;package=com.revolut.revolut;end';
  } else {
    window.open('https://app.revolut.com/more/hub', '_blank');
  }
}

// ── BANK GUIDE TABS ──
function showBankGuide(bank, btn) {
  document.querySelectorAll('.bank-guide').forEach(g => g.style.display = 'none');
  document.querySelectorAll('.bank-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('guide-' + bank).style.display = '';
  btn.classList.add('active');
}
// Show Revolut guide by default
showBankGuide('revolut', document.querySelector('.bank-tab'));

// ── SECOND FILE SLOT ──
let _pendingRows1 = null;
let _pendingRows2 = null;
let _pendingName1 = '';
let _pendingName2 = '';

function markSlot(slotNum, filename) {
  const key = slotNum === 1 ? 'primary' : 'secondary';
  const slot = document.getElementById('slot-' + key);
  const sub = document.getElementById('slot-' + key + '-sub');
  const check = document.getElementById('slot-' + key + '-check');
  slot.classList.add('has-file');
  slot.classList.remove('slot-secondary');
  sub.textContent = filename;
  check.style.display = 'flex';
  if (_pendingRows1) {
    document.getElementById('upload-go-btn').style.display = '';
  }
}

function handleFile2(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  _pendingName2 = file.name.replace(/\.(csv|pdf)$/i, '');

  if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
    setPDFStatus('Reading second PDF...');
    if (!ensurePDFJS()) { setPDFStatus('PDF support loading — try again in a moment.'); return; }
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const { text: rawText, pdf } = await extractPDFText(ev.target.result, '');
        let rows = [];
        if (rawText.trim().length > 200) {
          setPDFStatus('Parsing second statement...');
          rows = await parsePDFViaAI(rawText, file.name);
        } else {
          setPDFStatus('No text found — switching to image reading...');
          const images = await renderPDFPagesToImages(pdf);
          rows = await parsePDFViaVision(images);
        }
        hidePDFStatus();
        if (rows && rows.length > 0) {
          _pendingRows2 = rows;
          markSlot(2, _pendingName2);
        } else {
          setPDFStatus('Could not read second PDF. Try a CSV instead.');
        }
      } catch(err) { hidePDFStatus(); }
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = ev => {
      const { rows } = parseCSV(ev.target.result);
      _pendingRows2 = rows;
      markSlot(2, _pendingName2);
      hidePDFStatus();
    };
    reader.readAsText(file, 'UTF-8');
  }
}

function processUploads() {
  if (!_pendingRows1) return;
  const allRows = _pendingRows2 ? [..._pendingRows1, ..._pendingRows2] : _pendingRows1;
  const label = _pendingRows2 ? `${_pendingName1} + ${_pendingName2}` : _pendingName1;
  const summary = buildSummary(allRows);
  parsedData = summary;
  renderDashboard(summary, label);
  showPage('dashboard');
  // Reset slot state and UI
  _pendingRows1 = null;
  _pendingRows2 = null;
  _pendingName1 = '';
  _pendingName2 = '';
  resetSlotUI();
}

function resetSlotUI() {
  ['primary', 'secondary'].forEach(key => {
    const slot = document.getElementById('slot-' + key);
    const check = document.getElementById('slot-' + key + '-check');
    if (slot) { slot.classList.remove('has-file'); if (key === 'secondary') slot.classList.add('slot-secondary'); }
    if (check) check.style.display = 'none';
  });
  document.getElementById('slot-primary-sub').textContent = 'Tap to upload CSV or PDF';
  document.getElementById('slot-secondary-sub').textContent = 'Optional — combine two accounts';
  document.getElementById('upload-go-btn').style.display = 'none';
}
function saveGoal() {
  const nameInput = document.getElementById('goal-name-input').value.trim();
  const amtInput = parseInt(document.getElementById('goal-amt-input').value);
  if (nameInput) goalName = nameInput;
  if (amtInput && amtInput > 0) goalAmt = amtInput;
  try { localStorage.setItem('sc_goal', JSON.stringify({ name: goalName, amt: goalAmt })); } catch(e) {}
  if (parsedData) {
    const monthlySurplus = Math.max(0, parsedData.income - parsedData.totalSpent);
    const estimatedSaved = parsedData.income > 0 ? Math.min(monthlySurplus * 4, goalAmt) : Math.min(parsedData.totalSpent * 0.15, goalAmt);
    const goalSaved = Math.round(estimatedSaved);
    const goalPct = Math.round((goalSaved / goalAmt) * 100);
    document.getElementById('goal-name').textContent = goalName;
    document.getElementById('goal-pct').textContent = goalPct + '%';
    document.getElementById('goal-sub').textContent = `€${goalSaved.toLocaleString()} saved toward €${goalAmt.toLocaleString()} · €${(goalAmt - goalSaved).toLocaleString()} to go`;
    document.getElementById('goal-bar').style.width = goalPct + '%';
  }
}

// ── SHARE RESULTS ──
function shareResults() {
  if (!parsedData) return;
  const topCat = Object.entries(parsedData.cats).sort((a,b)=>b[1]-a[1])[0];
  const text = `I just checked my spending with Skint 👀\n\nTotal spent: €${Math.round(parsedData.totalSpent)}\nBiggest category: ${topCat ? topCat[0] + ' (€' + Math.round(topCat[1]) + ')' : '—'}\n\nCheck yours → skint.ie`;
  if (navigator.share) {
    navigator.share({ title: 'My Skint breakdown', text }).catch(() => {});
  } else {
    const wa = 'https://wa.me/?text=' + encodeURIComponent(text);
    window.open(wa, '_blank');
  }
}

// ── MONTH COMPARISON ──
function handleCompareFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  if (!parsedData) return;

  if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
    setPDFStatus('Reading comparison PDF...');
    if (!ensurePDFJS()) { setPDFStatus('PDF support loading, try again in a moment.'); return; }
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const { text: rawText, pdf } = await extractPDFText(ev.target.result, '');
        let rows = [];
        if (rawText.trim().length > 200) {
          setPDFStatus('Parsing comparison month...');
          rows = await parsePDFViaAI(rawText, file.name);
        } else {
          setPDFStatus('No text found — switching to image reading...');
          const images = await renderPDFPagesToImages(pdf);
          rows = await parsePDFViaVision(images);
        }
        hidePDFStatus();
        if (rows && rows.length > 0) {
          compareData = buildSummary(rows);
          renderComparison(parsedData, compareData, file.name.replace(/\.pdf$/i, ''));
        } else {
          setPDFStatus('Could not read comparison PDF. Try a CSV instead.');
        }
      } catch(err) { hidePDFStatus(); }
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = ev => {
      const { rows } = parseCSV(ev.target.result);
      compareData = buildSummary(rows);
      renderComparison(parsedData, compareData, file.name.replace(/\.csv$/i, ''));
    };
    reader.readAsText(file, 'UTF-8');
  }
}

function renderComparison(current, previous, prevLabel) {
  document.getElementById('compare-upload-card').style.display = 'none';
  document.getElementById('compare-card').style.display = '';
  document.getElementById('compare-title').textContent = `This month vs ${prevLabel}`;

  const allCats = new Set([...Object.keys(current.cats), ...Object.keys(previous.cats)]);
  const maxAmt = Math.max(...[...allCats].map(c => Math.max(current.cats[c]||0, previous.cats[c]||0)), 1);
  const rows = [...allCats].sort((a,b) => (current.cats[b]||0) - (current.cats[a]||0));

  document.getElementById('compare-list').innerHTML = rows.map(cat => {
    const cur = current.cats[cat] || 0;
    const prev = previous.cats[cat] || 0;
    const diff = cur - prev;
    const pctChange = prev > 0 ? Math.round((diff / prev) * 100) : null;
    const deltaClass = diff > 5 ? 'delta-up' : diff < -5 ? 'delta-down' : 'delta-same';
    const deltaLabel = diff > 5 ? `+€${Math.round(diff)}` : diff < -5 ? `-€${Math.round(Math.abs(diff))}` : '≈ same';
    const color = CAT_COLORS[cat] || '#888780';
    return `<div class="compare-row">
      <span class="compare-cat">${cat}</span>
      <div class="compare-bar-wrap">
        <div class="compare-bar-row">
          <div class="compare-bar-bg"><div class="compare-bar" style="width:${Math.round((cur/maxAmt)*100)}%;background:${color}"></div></div>
          <span class="compare-amt">€${Math.round(cur)}</span>
        </div>
        <div class="compare-bar-row">
          <div class="compare-bar-bg"><div class="compare-bar" style="width:${Math.round((prev/maxAmt)*100)}%;background:${color};opacity:0.35"></div></div>
          <span class="compare-amt" style="opacity:0.5">€${Math.round(prev)}</span>
        </div>
      </div>
      <span class="compare-delta ${deltaClass}">${deltaLabel}</span>
    </div>`;
  }).join('');
}

// ── EMAIL CAPTURE ──
let _emailCaptureShown = false;
function maybeShowEmailCapture() {
  try { if (localStorage.getItem('sc_email_done')) return; } catch(e) {}
  if (_emailCaptureShown) return;
  _emailCaptureShown = true;
  setTimeout(() => {
    document.getElementById('email-modal-overlay').style.display = 'flex';
  }, 4000); // show 4s after dashboard loads
}

function submitEmailCapture() {
  const email = document.getElementById('email-capture-input').value.trim();
  if (email && email.includes('@')) {
    try { localStorage.setItem('sc_email_done', '1'); } catch(e) {}
    // mailto as simple capture — replace with proper form submission when ready
    const body = encodeURIComponent('New Skint signup: ' + email);
    fetch('https://spendcoach-api.onrender.com/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    }).catch(() => {}); // fire and forget, don't block UX
  }
  document.getElementById('email-modal-overlay').style.display = 'none';
  try { localStorage.setItem('sc_email_done', '1'); } catch(e) {}
}

function skipEmailCapture() {
  document.getElementById('email-modal-overlay').style.display = 'none';
  try { localStorage.setItem('sc_email_done', '1'); } catch(e) {}
}

// ── SETTINGS TOGGLES ──
const TOGGLE_DEFAULTS = { debrief: false, alerts: true, challenges: true };

function toggleSetting(btn, key) {
  const isOn = btn.classList.toggle('on');
  try { localStorage.setItem('sc_toggle_' + key, isOn ? '1' : '0'); } catch(e) {}
}

function initToggles() {
  Object.entries(TOGGLE_DEFAULTS).forEach(([key, defaultOn]) => {
    const btn = document.getElementById('toggle-' + key);
    if (!btn) return;
    let stored;
    try { stored = localStorage.getItem('sc_toggle_' + key); } catch(e) {}
    const isOn = stored !== null ? stored === '1' : defaultOn;
    if (isOn) btn.classList.add('on');
  });
}
initToggles();

// ── PWA SETUP ──

function generateIcon(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2B5F3E';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.22);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.52}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', size / 2, size / 2 + size * 0.03);
  return canvas.toDataURL('image/png');
}

// 1. Inline manifest — declared after generateIcon so it can call it safely
const manifest = {
  name: 'Skint',
  short_name: 'Skint',
  description: 'AI-powered personal finance coaching',
  start_url: '.',
  display: 'standalone',
  background_color: '#F5F2ED',
  theme_color: '#2B5F3E',
  orientation: 'portrait-primary',
  icons: [
    { src: generateIcon(192), sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: generateIcon(512), sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
  ]
};

// Inject manifest
const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
const manifestURL = URL.createObjectURL(manifestBlob);
document.getElementById('pwa-manifest').href = manifestURL;

// Inject apple touch icon
document.getElementById('apple-touch-icon').href = generateIcon(180);

// 2. Service worker — caches the page for offline use
const swCode = `
const CACHE = 'skint-v1';
const PRECACHE = ['/'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(cached => {
    const fresh = fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
`;

if ('serviceWorker' in navigator) {
  const swBlob = new Blob([swCode], { type: 'application/javascript' });
  const swURL = URL.createObjectURL(swBlob);
  navigator.serviceWorker.register(swURL, { scope: '/' }).catch(() => {
    // Blob-scope SW may be restricted on some hosts — fails silently, app still works
  });
}

// 3. Install prompt (Android / Chrome desktop)
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.getElementById('install-banner');
  banner.style.display = 'flex';
});

document.getElementById('install-btn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('install-banner').style.display = 'none';
});

window.addEventListener('appinstalled', () => {
  document.getElementById('install-banner').style.display = 'none';
});

// 4. iOS Safari install hint
const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
const iosDismissed = sessionStorage.getItem('ios-hint-dismissed');
if (_isIOS && !isInStandaloneMode && !iosDismissed) {
  document.getElementById('ios-banner').style.display = 'flex';
  document.getElementById('ios-banner').querySelector('button').addEventListener('click', () => {
    sessionStorage.setItem('ios-hint-dismissed', '1');
  });
}
</script>
</body>
</html>
