/* ============================================================================
   GrayCo — MAINTENANCE PLANS (patch X9), the shared pieces.   netlify/functions/_lib/maint.js

   Owner 10/21: "Yes, always do maintenance contracts and try to sell those. Offer in portal for roofs and other
   residential items." Prices are set later, per home (owner, earlier): a plan's price stays "[PRICE]" until the PM
   quotes it for that house.

   The plans (gc_kv "gc_maint_plans", admin-editable in ⚙ Admin → 🛠 Maintenance plans; DEFAULT_PLANS until saved):
     { plans: [{ id, name, includes, visits, on, kinds }], offerOn: ['residential', 'insurance'], updatedAt, by }
   The contracts (gc_kv "gc_maint", JSON text like the office to-dos — portal.js kvListUpdate keeps every save):
     { id, pid, planId, planName, status, requestedAt, requestedBy, note,
       price, quotedAt, quotedBy,                        ← the PM's price for this home (per year)
       signedAt, signName, signIp, drawn, docRef,         ← the customer's signature in the portal
       nextVisit, visits: [{ at, by, note }], invoices: [{ year, amount, approvalId, at, status }],
       history: [{ at, by, what }], updatedAt }
     status: requested → quoted → signed (→ cancelled | declined)
   Other patches can ask: offerLine(p) — one line for a closeout / anniversary e-mail ("" when the job is not one we
   offer plans on, or it already has a plan); eligible(p, settings).
   ========================================================================== */
'use strict';

const PLANS_KEY = 'gc_maint_plans', LIST_KEY = 'gc_maint', HEARD_KEY = 'gc_portal_heard';
/* patch MAINTPLANS (owner 10/30: "I should have more maintenance plans I can choose and when I choose it shows up on customer
   portal"): a catalog — each plan has a default yearly price (pre-filled on the job, changed per home) and a frequency
   ('yearly' = 1 visit + 1 invoice a year, 'twice' = 2 + 2, 'quarterly' = 4 + 4, each invoice a share of the yearly price;
   'once' = a one-time offer, never billed — the commercial Free Roof Inspection) and a market ('residential' | 'commercial').
   Owner 10/30: HVAC and pressure washing are GrayCo's own services; roof coating maintenance for commercial roofs.
   The usual prices below are a starting list (placeholders) — the owner sets his own in ⚙ / 🛠 Maintenance plans.
   Saved settings from before the catalog (no catalog: 2) get the new plans added once; after an admin / the office
   saves, the list is exactly what they saved. */
const CATALOG_V = 2;
const DEFAULT_PLANS = [
  { id: 'home', name: 'Home Exterior Check-up', freq: 'yearly', visits: 1, price: 250, on: true, kinds: ['any'],
    includes: 'A yearly walk-around of the work we did and the outside of the home: caulking, siding, trim, windows and doors, decks — small touch-ups on the spot, a list of anything bigger.' },
  { id: 'roof', name: 'Roof Check-up', freq: 'yearly', visits: 1, price: 295, on: true, kinds: ['roof'],
    includes: 'A yearly roof inspection: shingles, flashing, vents and pipe boots, sealant at every opening; small repairs on the spot (a few shingles, a dab of sealant, a loose boot); a photo report of what we found.' },
  { id: 'gutter', name: 'Gutter Clean & Check', freq: 'twice', visits: 2, price: 240, on: true, kinds: ['roof', 'gutter', 'siding'],
    includes: 'Gutters and downspouts cleaned and flushed twice a year (spring and fall), loose hangers re-set, leaks at the seams sealed, splash blocks checked.' },
  { id: 'storm', name: 'Storm Check', freq: 'yearly', visits: 1, price: 150, on: true, kinds: ['any'],
    includes: 'After a major storm (hail or high wind) we come out on request: a roof and exterior inspection with a dated photo report you can give your insurance company. A once-a-year check is included even with no storm.' },
  { id: 'deck', name: 'Deck & Fence Care', freq: 'yearly', visits: 1, price: 450, on: true, kinds: ['deck'],
    includes: 'A yearly wash of the deck and fence, loose boards and nails fixed, and a fresh coat of sealer every 1–2 years as the wood needs it.' },
  { id: 'water', name: 'Water & Moisture Check', freq: 'yearly', visits: 1, price: 195, on: true, kinds: ['any'],
    includes: 'Moisture readings in the crawlspace, attic and under the sinks, a look at the vapor barrier and vents, and a mold watch — we tell you early, before a small leak becomes a big repair.' },
  { id: 'hvac', name: 'HVAC Maintenance', freq: 'twice', visits: 2, price: 189, on: true, kinds: ['any'],
    includes: 'A tune-up twice a year — spring for cooling, fall for heating: new filters, coils cleaned, condensate drain cleared, refrigerant and electrical checks, thermostat test, and a short report with photos.' },
  { id: 'wash', name: 'Pressure Washing', freq: 'yearly', visits: 1, price: 350, on: true, kinds: ['any'],
    includes: 'Once a year: a soft wash of the house siding and trim, the driveway and walks pressure washed, and the porch or patio cleaned.' },
  { id: 'snow', name: '❄️ Winter Snow & Ice Clean-up', freq: 'winter', visits: 1, price: 300, on: true, kinds: ['any'],
    includes: 'Sign up for the winter (December–February) and you are on our priority list: when snow or ice hits we come out on call — driveway and walks cleared, steps and entrance salted / de-iced. One price for the season.' },
  { id: 'whole', name: 'Whole-Home Care', freq: 'twice', visits: 2, price: 895, on: true, kinds: ['any'],
    includes: 'Everything in one plan, twice a year: Roof Check-up, Gutter Clean & Check, Home Exterior Check-up, Water & Moisture Check and Storm Check — one price, one visit each spring and fall.' },
  /* commercial (the 🛠 Maintenance tab's outreach to facility / property managers, patch MAINTTAB) */
  { id: 'c_roof', market: 'commercial', name: 'Commercial Roof Maintenance', freq: 'twice', visits: 2, price: 1200, on: true, kinds: ['any'],
    includes: 'Twice a year: a full roof inspection, drains and scuppers cleared, flashing and sealant touch-ups at curbs and penetrations, and a photo report for your files.' },
  { id: 'c_free', market: 'commercial', name: 'Free Roof Inspection', freq: 'once', visits: 1, price: 0, on: true, kinds: ['any'],
    includes: 'A free, no-obligation roof inspection with a photo report — what we found, what to watch, and what (if anything) needs attention.' },
  { id: 'c_coat', market: 'commercial', name: 'Roof Coating Maintenance', freq: 'yearly', visits: 1, price: 950, on: true, kinds: ['any'],
    includes: 'A yearly inspection of the coated roof to keep the coating warranty in good standing: seams and penetrations touched up, a ponding check, a photo report, and a recoat reminder before the coating reaches the end of its life.' },
  { id: 'c_water', market: 'commercial', name: 'Water Damage Response Plan', freq: 'yearly', visits: 1, price: 750, on: true, kinds: ['any'],
    includes: 'Priority 24/7 response when water gets in, at a rate sheet agreed in advance, plus a yearly moisture check of the roof, walls and known trouble spots.' },
  { id: 'c_storm', market: 'commercial', name: 'Storm Response Plan', freq: 'yearly', visits: 1, price: 500, on: true, kinds: ['any'],
    includes: 'After hail or high wind: priority inspection, emergency tarping or temporary repairs, and a dated photo report for your insurance claim.' },
  { id: 'c_gutter', market: 'commercial', name: 'Gutter & Drainage', freq: 'twice', visits: 2, price: 600, on: true, kinds: ['any'],
    includes: 'Gutters, downspouts, drains and scuppers cleaned and flushed twice a year; leaks sealed; standing water reported.' },
  { id: 'c_env', market: 'commercial', name: 'Exterior Envelope', freq: 'yearly', visits: 1, price: 900, on: true, kinds: ['any'],
    includes: 'A yearly check of the building envelope: caulking and sealant at joints, windows and doors, wall flashing and coping — small repairs on the spot, a list of anything bigger.' },
  { id: 'c_hvac', market: 'commercial', name: 'HVAC Maintenance (rooftop units)', freq: 'quarterly', visits: 4, price: 1600, on: true, kinds: ['any'],
    includes: 'Rooftop units (RTUs) serviced every quarter: filters changed on schedule, coils cleaned, belts and drains checked, refrigerant and electrical checks, and a report per unit.' },
  { id: 'c_snow', market: 'commercial', name: '❄️ Winter Snow & Ice Clean-up', freq: 'winter', visits: 1, price: 2500, on: true, kinds: ['any'],
    includes: 'A seasonal sign-up (December–February) that puts your property on our priority list: on call when snow or ice hits — parking lots, walks and entrances cleared, salting and de-icing. One price for the season (or per visit, as agreed).' },
  { id: 'c_wash', market: 'commercial', name: 'Pressure Washing', freq: 'quarterly', visits: 4, price: 1400, on: true, kinds: ['any'],
    includes: 'On a set schedule (2–4 times a year): building exterior, sidewalks and storefront, and dumpster pads pressure washed.' }
];
const FREQS = { yearly: 'Once a year', twice: 'Twice a year', quarterly: 'Every 3 months', winter: 'Each winter (Dec–Feb), on call', once: 'One time' };
const FREQ_N = { yearly: 1, twice: 2, quarterly: 4, winter: 1, once: 1 };
/* the first visit after signing: a winter plan → the next December 1st (on call from then), else one period on */
function firstVisit(freq, at){
  if (freq !== 'winter') return nextYear(at, Math.round(12 / (FREQ_N[freq] || 1)));
  const d = new Date(at || Date.now()); if (isNaN(d)) return '';
  const m = d.getUTCMonth(); if (m === 11 || m <= 1) return d.toISOString().slice(0, 10);   /* signed in the winter: on call now */
  return d.getUTCFullYear() + '-12-01';
}
function freqOf(x){ const f = low(x && x.freq); if (FREQS[f]) return f; const v = parseInt(x && x.visits, 10) || 1; return v >= 4 ? 'quarterly' : v >= 2 ? 'twice' : 'yearly'; }
function freqLabel(f){ return FREQS[f] || FREQS.yearly; }
/* how many invoices a year: a contract quoted as a twice-a-year / quarterly plan bills 2 / 4 times (older contracts once) */
function billsPerYear(c){ const f = s(c && c.freq); if (f === 'twice' || f === 'quarterly') return FREQ_N[f]; const n = parseInt(c && c.billsPerYear, 10); return n === 2 || n === 4 ? n : 1; }
function marketOf(x){ return low(x && x.market) === 'commercial' ? 'commercial' : 'residential'; }
/* the plan's words for the customer (an old "Price: [PRICE] per year." line is taken out) */
function plainIncludes(t){ return s(t).replace(/\s*Price:\s*\[[^\]]*\][^.]*\.?/i, '').trim(); }
const HEARD_OPTS = ['Google', 'Facebook', 'A friend or neighbor (referral)', 'Yard sign', 'Our truck', 'Repeat customer', 'Insurance company', 'Other'];

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }

function groupOf(p){ try { return require('./job-auto.js').groupOf(p); } catch (e) { return /commercial|church|school/i.test(s(p && p.type)) ? 'commercial' : 'residential'; } }
function settingsOf(v){
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const plans = arr(o.plans).length ? arr(o.plans).map(function(x, i){
    const id = s(x.id) || 'plan' + i, def = DEFAULT_PLANS.find(function(d){ return d.id === id; }), f = freqOf(x);
    const pr = x.price != null && s(x.price) !== '' ? num(x.price) : (def && o.catalog !== CATALOG_V ? def.price : 0);
    return { id: id, name: s(x.name).slice(0, 80) || 'Maintenance plan', includes: s(x.includes).slice(0, 1200), freq: f, visits: FREQ_N[f] || 1, market: marketOf(x.market ? x : def),
      price: pr > 0 && pr <= 100000 ? Math.round(pr * 100) / 100 : 0,
      on: x.on !== false, kinds: (function(k){ return k.length ? k : ['any']; })(Array.isArray(x.kinds) ? x.kinds.map(low).filter(Boolean).slice(0, 8) : []) };
  }) : DEFAULT_PLANS.map(function(x){ return Object.assign({ market: 'residential' }, x); });
  if (arr(o.plans).length && o.catalog !== CATALOG_V) DEFAULT_PLANS.forEach(function(d){   /* the new catalog, once, on top of a list saved before it */
    if (!plans.some(function(x){ return x.id === d.id || (low(x.name) === low(d.name) && marketOf(x) === marketOf(d)); })) plans.push(Object.assign({ market: 'residential' }, d));
  });
  const offerOn = Array.isArray(o.offerOn) && o.offerOn.length ? o.offerOn.map(low).filter(Boolean) : ['residential', 'insurance'];
  return { plans: plans, offerOn: offerOn, catalog: CATALOG_V, updatedAt: s(o.updatedAt), by: s(o.by), saved: !!(o && o.plans) };
}
/* the work on the job, for which plans fit (a roof job → roof + gutter + home) */
function workOf(p){
  const t = low([p && p.type, p && p.jobType, p && p.name, p && p.scope, p && p.trade, p && p.workType].map(s).join(' '));
  const out = [];
  if (/roof|shingle|reroof|re-roof|tpo|metal roof/.test(t)) out.push('roof');
  if (/gutter/.test(t)) out.push('gutter');
  if (/siding|exterior|trim|paint/.test(t)) out.push('siding');
  if (/deck|fence|pergola|porch/.test(t)) out.push('deck');   /* patch MAINTPLANS */
  if (/water|moisture|mold|mitigation|crawl|plumb/.test(t)) out.push('water');
  return out;
}
function plansFor(p, settings){
  const st = settings && settings.plans ? settings : settingsOf(settings);
  const w = workOf(p);
  const mk = groupOf(p) === 'commercial' ? 'commercial' : 'residential';
  return st.plans.filter(function(x){ return x.on && x.freq !== 'once' && marketOf(x) === mk && (x.kinds.indexOf('any') >= 0 || x.kinds.some(function(k){ return w.indexOf(low(k)) >= 0; })); });
}
function eligible(p, settings){
  if (!p || p.deleted === true) return false;
  const st = settings && settings.plans ? settings : settingsOf(settings);
  if (st.offerOn.indexOf(groupOf(p)) < 0) return false;
  if (p.maintOffer === false) return false;   /* a PM turned the offer off on this job */
  return plansFor(p, st).length > 0;
}
function contractsFor(list, pid){ return arr(list).filter(function(c){ return s(c.pid) === s(pid) && !/^(cancelled|declined)$/.test(s(c.status)); }); }
/* one line for wAUTO5's closeout pack / wAUTO7's anniversary note (plain text) */
function offerLine(p, list, settings){
  if (!eligible(p, settings)) return '';
  if (list && contractsFor(list, p.id).some(function(c){ return c.status === 'signed'; })) return '';
  const w = workOf(p);
  return w.indexOf('roof') >= 0
    ? 'Keep your new roof in top shape: ask about our yearly Roof Care Plan — open your GrayCo portal and tap “Maintenance plans”, or ask your Project Manager.'
    : 'Keep everything we built looking new: ask about our yearly maintenance plans — open your GrayCo portal and tap “Maintenance plans”, or ask your Project Manager.';
}
function heardNorm(v){
  const t = low(v); if (!t) return '';
  const hit = HEARD_OPTS.find(function(o){ return low(o) === t; }); if (hit) return hit;
  if (/google|search/.test(t)) return 'Google'; if (/facebook|instagram|\bfb\b/.test(t)) return 'Facebook';
  if (/referr|friend|neighbo|family|word of mouth/.test(t)) return 'A friend or neighbor (referral)';
  if (/yard|sign/.test(t)) return 'Yard sign'; if (/truck|van|vehicle/.test(t)) return 'Our truck';
  if (/repeat|again|before|past customer/.test(t)) return 'Repeat customer'; if (/insur|adjuster|carrier/.test(t)) return 'Insurance company';
  return 'Other';
}
/* the Marketing channel an answer counts as (patch MKT's normSource reads p.howHeard) */
function heardChannel(v){
  const h = heardNorm(v);
  return ({ 'Google': 'Google organic', 'Facebook': 'Facebook/Instagram Ads', 'A friend or neighbor (referral)': 'Referral', 'Yard sign': 'Yard sign', 'Our truck': 'Yard sign', 'Repeat customer': 'Repeat customer' })[h] || 'Other';
}
function nextYear(iso, months){ const d = new Date(iso || Date.now()); if (isNaN(d)) return ''; d.setUTCMonth(d.getUTCMonth() + (months || 12)); return d.toISOString().slice(0, 10); }

module.exports = { CATALOG_V, FREQS, FREQ_N, marketOf, firstVisit, freqOf, freqLabel, billsPerYear, plainIncludes, PLANS_KEY, LIST_KEY, HEARD_KEY, DEFAULT_PLANS, HEARD_OPTS, settingsOf, plansFor, eligible, workOf, groupOf, contractsFor, offerLine, heardNorm, heardChannel, nextYear, num };
