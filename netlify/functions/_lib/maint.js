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
const DEFAULT_PLANS = [   /* refCredit: the plan-member referral credit (patch MAINTPLUS), per plan — placeholders */
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
  { id: 'hvac', performer: 'sub', sub: 'Rapid Air', name: 'HVAC Maintenance', freq: 'twice', visits: 2, price: 189, on: true, kinds: ['any'],
    includes: 'A tune-up twice a year — spring for cooling, fall for heating: new filters, coils cleaned, condensate drain cleared, refrigerant and electrical checks, thermostat test, and a short report with photos.' },
  { id: 'wash', performer: 'sub', sub: 'Brenan Hart', name: 'Pressure Washing', freq: 'yearly', visits: 1, price: 350, on: true, kinds: ['any'],
    includes: 'Once a year: a soft wash of the house siding and trim, the driveway and walks pressure washed, and the porch or patio cleaned.' },
  { id: 'snow', name: '❄️ Winter Snow & Ice Clean-up', freq: 'winter', visits: 1, price: 300, on: true, kinds: ['any'],
    includes: 'Sign up for the winter (December–February) and you are on our priority list: when snow or ice hits we come out on call — driveway and walks cleared, steps and entrance salted / de-iced. One price for the season.' },
  { id: 'vent', name: 'Dryer Vent & Sump Pump Check', freq: 'yearly', visits: 1, price: 149, on: true, kinds: ['any'],
    includes: 'Once a year: the dryer vent cleaned from the dryer to the outside hood (a common fire risk), and the sump pump tested — float, check valve and discharge line.' },
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
  { id: 'c_hvac', performer: 'sub', sub: 'Rapid Air', market: 'commercial', name: 'HVAC Maintenance (rooftop units)', freq: 'quarterly', visits: 4, price: 1600, on: true, kinds: ['any'],
    includes: 'Rooftop units (RTUs) serviced every quarter: filters changed on schedule, coils cleaned, belts and drains checked, refrigerant and electrical checks, and a report per unit.' },
  { id: 'c_snow', market: 'commercial', name: '❄️ Winter Snow & Ice Clean-up', freq: 'winter', visits: 1, price: 2500, on: true, kinds: ['any'],
    includes: 'A seasonal sign-up (December–February) that puts your property on our priority list: on call when snow or ice hits — parking lots, walks and entrances cleared, salting and de-icing. One price for the season (or per visit, as agreed).' },
  { id: 'c_ready', market: 'commercial', name: 'Emergency Ready Plan', freq: 'yearly', visits: 1, price: 450, on: true, kinds: ['any'],
    includes: 'Before anything happens: a visit to photo-document the building, record every shutoff (water, gas, power) with photos and locations, and keep your emergency contacts and building information on file — so after a loss we move fast and the claim has its "before" pictures.' },
  { id: 'c_pcr', market: 'commercial', name: 'Yearly Property Condition Report', freq: 'yearly', visits: 1, price: 650, on: true, kinds: ['any'],
    includes: 'A yearly report per property: each system (roof, coating, HVAC, envelope, paving) with its condition, age and remaining life, and a 5-year budget forecast you can plan and budget with.' },
  { id: 'c_lot', market: 'commercial', name: 'Parking Lot Sealcoat & Striping', freq: 'yearly', visits: 1, price: 2200, on: true, kinds: ['any'],
    includes: 'Cracks filled, the lot sealcoated (every 2–3 years, as it needs it) and the striping, handicap spaces and arrows repainted — a yearly check and touch-up in between.' },
  { id: 'c_mready', market: 'commercial', name: 'Tenant Turnover / Make-Ready', freq: 'once', visits: 1, price: 0, on: true, kinds: ['any'],
    includes: 'For property managers: units turned over between tenants (paint, patch, flooring, fixtures, clean) and tenant build-outs, at a per-unit price list — order a make-ready and it becomes a job with its scope.' },
  { id: 'c_ada', market: 'commercial', name: 'Concrete & ADA Trip-Hazard Repair', freq: 'yearly', visits: 1, price: 800, on: true, kinds: ['any'],
    includes: 'A yearly walk of sidewalks, ramps and entrances: trip hazards ground down or repaired, cracked or heaved concrete replaced, and ADA ramps, slopes and markings checked — with a photo list for your files.' },
  { id: 'c_wash', performer: 'sub', sub: 'Brenan Hart', market: 'commercial', name: 'Pressure Washing', freq: 'quarterly', visits: 4, price: 1400, on: true, kinds: ['any'],
    includes: 'On a set schedule (2–4 times a year): building exterior, sidewalks and storefront, and dumpster pads pressure washed.' }
];
/* patch MAINTPLUS: membership tiers (every plan customer starts at Bronze), kits for sale, the make-ready price list,
   the outreach e-mail templates — all editable placeholders, kept in the same gc_kv "gc_maint_plans" settings */
const TIERS = { bronze: { name: 'Bronze', discount: 0, visits: 'The plan visits', priority: 3 }, silver: { name: 'Silver', discount: 10, visits: 'The plan visits + 1 extra service call a year', priority: 2 },
  gold: { name: 'Gold', discount: 20, visits: 'The plan visits + 2 extra service calls a year', priority: 1, note: '🎁 Gold members: yearly free-plan drawing' } };   /* owner round 3: the drawing itself is to be decided — only the note and the entry list */
/* add-ons the plan builder offers on some plans (owner round 3): graffiti removal on pressure washing, an infrared scan on roof inspections */
const ADDONS = [
  { id: 'graffiti', name: 'Graffiti removal', price: 250, on: ['wash', 'c_wash'], note: 'Graffiti removed on each visit (paint-safe methods; heavy tags quoted first).' },
  /* owner: "Maintenance plans can offer 1 handyman day for multiple things and list those items included" — $349.99 a day
     (set by the owner: a real price), 8 AM – 5 PM, materials billed separately; any plan; days per year; tier discount applies */
  { id: 'handyman', name: '🔧 Handyman Day', price: 349.99, priceSet: true, unit: 'day', on: ['*'], note: 'One tech, 8 AM – 5 PM. Materials are billed separately, on top of the day price. Having materials on site before the visit lets us get more done in your day.' },
  { id: 'infrared', name: 'Infrared roof scan', price: 400, on: ['roof', 'c_roof', 'c_free', 'c_coat'], note: 'Scanner on order — book it and we will schedule the scan as soon as it arrives.' }
];
const HANDYMAN_NOTE = 'Having materials on site before the visit lets us get more done in your day.';
const HANDYMAN_TASKS = ['Caulk & sealant touch-ups', 'Door / lock / hinge adjustments', 'Drywall patch & paint touch-up', 'Light fixture & bulb replacement', 'Ceiling tile replacement',
  'Minor plumbing (faucet, toilet flapper, supply lines)', 'Gutter & downspout clearing (single story)', 'Filter changes', 'Smoke / CO detector battery check', 'Weatherstripping',
  'Signage / handrail tightening', 'Pressure-wash a small area', 'Minor fence / gate repair'];
function addonFits(a, planId){ const on = a && Array.isArray(a.on) ? a.on : []; return !!a && (on.indexOf('*') >= 0 || on.indexOf(s(planId)) >= 0); }
/* owner: MONTHLY subscriptions — the membership placeholders per tier (residential per home, commercial per building) */
const MONTHLY = { residential: { bronze: 39, silver: 59, gold: 89 }, commercial: { bronze: 199, silver: 349, gold: 599 } };
function monthlyOf(c){ return Math.ceil(num(c && c.price) / 12 * 100) / 100; }
/* owner: ROUTING — visits in the same area on the area's maintenance day */
const ROUTE = [['Bartlett', /^3813[345]$/, /bartlett/i], ['Germantown', /^3813[89]$/, /germantown/i], ['Collierville', /^38017$/, /collierville/i], ['Cordova', /^380(16|18)$/, /cordova/i],
  ['Arlington / Lakeland', /^38002$/, /arlington|lakeland/i], ['Millington', /^38053$/, /millington/i], ['Southaven / Horn Lake', /^386(37|71|72)$/, /southaven|horn lake/i], ['Olive Branch', /^38654$/, /olive branch/i],
  ['Hernando / DeSoto', /^386(32|41|51|80)$/, /hernando|nesbit|walls/i], ['Fayette', /^380(28|36|46|57|60|66|68|76)$/, /somerville|oakland|rossville|moscow|piperton|gallaway|la ?grange/i],
  ['Tipton', /^380(04|11|15|19|23|49|58)$/, /atoka|munford|covington|brighton|mason/i], ['West Memphis / Marion', /^723\d\d$/, /west memphis|marion|earle/i], ['Memphis', /^381\d\d$/, /memphis/i]];
function routeArea(addr){ const a = s(addr), z = (/\b(\d{5})(?:-\d{4})?\s*$/.exec(a) || /\b(3[78]\d{3}|72\d{3})\b/.exec(a) || [])[1] || ''; const hit = ROUTE.find(function(r){ return z ? r[1].test(z) : r[2].test(a); }); return hit ? hit[0] : 'Other'; }
function onAreaDay(date, area, days){ const wd = days && days[area]; if (wd == null || s(wd) === '') return date; const d = new Date(s(date) + 'T12:00:00Z'); if (isNaN(d)) return date;
  let best = null; for (let k = -3; k <= 3; k++) { const x = new Date(d.getTime() + k * 864e5); if (x.getUTCDay() === parseInt(wd, 10) && (best === null || Math.abs(k) < Math.abs(best))) best = k; }
  return best === null ? date : new Date(d.getTime() + best * 864e5).toISOString().slice(0, 10); }
/* the commission LEDGER (owner): credited as each payment is collected (an invoice marked paid), clawed back when the customer
   cancels within 3 months of signing. Per payment: self-performed 50% × (payment − that period's share of the costs);
   subbed 50% × (payment − 15% × payment − that period's share of the sub's estimate). */
function commissionLines(c){
  const bills = billsPerYear(c), sub = s(c && c.performer) === 'sub', out = [];
  arr(c && c.invoices).filter(function(v){ return v.status === 'paid'; }).forEach(function(v){
    const pay = num(v.amount), share = (sub ? num(c.subCost) : num(c.cost)) / bills, base = sub ? pay - 0.15 * pay - share : pay - share;
    out.push({ contractId: s(c.id), period: s(v.year), at: s(v.paidAt || v.sentAt || v.at).slice(0, 10), seller: s(c.soldBy), payment: pay, costShare: Math.round(share * 100) / 100, amount: Math.max(0, Math.round(base * 50) / 100), rule: sub ? '15/50/50' : '50/50' });
  });
  const credited = out.reduce(function(t, x){ return t + x.amount; }, 0);
  if (s(c && c.status) === 'cancelled' && c.signedAt && c.cancelledAt && Date.parse(c.cancelledAt) - Date.parse(c.signedAt) < 92 * 864e5 && credited > 0)
    out.push({ contractId: s(c.id), period: 'clawback', at: s(c.cancelledAt).slice(0, 10), seller: s(c.soldBy), payment: 0, costShare: 0, amount: -Math.round(credited * 100) / 100, rule: 'cancelled within 3 months' });
  return out;
}
/* the visits a plan year holds (owner round 3: "once signed, visits are auto-scheduled for the year per each service's frequency") */
function planVisits(freq, from){
  const f = FREQS[freq] ? freq : 'yearly', first = firstVisit(f, from); if (!first) return [];
  if (f === 'winter' || f === 'once' || f === 'yearly') return [first];
  const n = FREQ_N[f], out = [first]; for (let i = 1; i < n; i++) out.push(nextYear(first + 'T12:00:00Z', Math.round(12 / n) * i));
  return out;
}
const PRODUCTS = [
  { id: 'kit_winter', name: 'Winter Prep Kit', price: 89, contents: 'Pipe insulation sleeves, hose-bib covers, ice melt (50 lb), a door draft stopper, a flashlight and a checklist.' },
  { id: 'kit_storm', name: 'Storm Prep Kit', price: 129, contents: 'A heavy tarp with tie-downs, sandbags (6), duct tape, a flashlight and batteries, a first-aid kit, and a "what to do after a storm" card.' }
];
const UNIT_PRICES = [
  { id: 'u_paint', name: 'Make-ready: paint + patch (1 bed / 1 bath)', price: 1100 }, { id: 'u_paint2', name: 'Make-ready: paint + patch (2 bed / 2 bath)', price: 1600 },
  { id: 'u_floor', name: 'Flooring (LVP) per room', price: 900 }, { id: 'u_clean', name: 'Make-ready clean', price: 250 }, { id: 'u_fix', name: 'Fixtures / hardware refresh', price: 300 }
];
const TEMPLATES = {
  free: { name: '✉ Offer free roof inspection', subject: 'A free roof inspection for {{property}}',
    body: 'Hi {{first}},\n\nI am with GrayCo Construction Services — we take care of roofs and buildings for property and facility managers around Memphis.\n\nWe would like to give you a free, no-obligation roof inspection at {{property}}: a photo report of what we find, what to watch and what (if anything) needs attention — before the next storm or leak.\n\nReply with a day that works, or call me at {{phone}}.\n\nThank you,\n{{me}}\nGrayCo Construction Services' },
  plan: { name: '✉ Offer a maintenance plan', subject: 'Keeping {{property}} ahead of repairs',
    body: 'Hi {{first}},\n\nGrayCo offers maintenance plans for commercial buildings, all done by our own crews:\n• Commercial roof maintenance (twice a year, with a photo report)\n• Roof coating maintenance (keeps the coating warranty in good standing)\n• HVAC maintenance for rooftop units (filters on a schedule, coils, drains)\n• Pressure washing — building, sidewalks, storefront, dumpster pads\n• Water damage and storm response plans (priority 24/7)\n\nEvery plan customer is on our priority list for snow and ice clean-up and emergency mitigation.\n\nCould we start with a free roof inspection at {{property}}? Reply or call me at {{phone}}.\n\nThank you,\n{{me}}\nGrayCo Construction Services' },
  snow: { name: '❄️ Sign up for winter snow service', subject: 'Winter snow & ice service for {{property}}',
    body: 'Hi {{first}},\n\nWinter is coming. Sign up now for GrayCo\'s snow and ice service (December–February) and {{property}} goes on our priority list: when snow or ice hits we come out on call — lots, walks and entrances cleared, salted and de-iced.\n\nReply to sign up or call me at {{phone}}.\n\nThank you,\n{{me}}\nGrayCo Construction Services' },
  vent: { name: '✉ Dryer vent & sump pump check', subject: 'A quick safety check for your home',
    body: 'Hi {{first}},\n\nThank you for choosing GrayCo. A clogged dryer vent is a common cause of house fires, and a sump pump that fails is a wet basement waiting to happen. We now offer a yearly Dryer Vent & Sump Pump Check — the vent cleaned to the outside, the pump tested.\n\nReply or call me at {{phone}} to set it up.\n\nThank you,\n{{me}}\nGrayCo Construction Services' }
};
/* patch MAINTPLUS (owner decisions): who does the work and the PM's commission on a plan.
   self-performed (the PM's crew): the PM gets 50% of the plan's profit = 50% × (revenue − costs);
   subbed ("15/50/50"): 15% of the revenue comes off first for overhead, then 50% of what is left after the sub's estimate
   = 50% × (revenue − 15% × revenue − the sub's estimate). Revenue = the plan's yearly price. Never below zero. */
function commission(c){
  const rev = num(c && c.price), sub = s(c && c.performer) === 'sub';
  const base = sub ? rev - 0.15 * rev - num(c && c.subCost) : rev - num(c && c.cost);
  return { rule: sub ? '15/50/50 (subbed)' : '50/50 (self-performed)', revenue: rev, overhead: sub ? Math.round(rev * 15) / 100 : 0, costs: sub ? num(c && c.subCost) : num(c && c.cost),
    profit: Math.round(base * 100) / 100, pm: Math.max(0, Math.round(base * 50) / 100), costsKnown: sub ? num(c && c.subCost) > 0 : num(c && c.cost) > 0 };
}
/* the SERVICE AREA (owner decision 6): Shelby County, TN and every county touching it — Tipton and Fayette (TN), DeSoto and
   Marshall (MS), Crittenden and Mississippi (AR — across the river). Snow & ice: only Bartlett and Shelby County.
   Read from the address's ZIP (or a town name when there is no ZIP). */
const AREA = {
  'Shelby, TN': { zips: /^(380(02|16|17|18|27|28|53|54)|381\d\d)$/, towns: /memphis|bartlett|germantown|collierville|cordova|millington|arlington|lakeland/i },
  'Tipton, TN': { zips: /^380(04|11|15|19|23|49|58)$/, towns: /atoka|brighton|burlison|covington|mason|munford|drummonds/i },
  'Fayette, TN': { zips: /^380(36|46|57|60|66|68|76)$/, towns: /gallaway|la ?grange|moscow|oakland|rossville|somerville|williston|piperton/i },
  'DeSoto, MS': { zips: /^386(32|37|41|51|54|71|72|80)$/, towns: /hernando|horn lake|olive branch|southaven|walls|lake cormorant|nesbit/i },
  'Marshall, MS': { zips: /^386(11|35|59|61)$/, towns: /holly springs|byhalia|red banks|potts camp/i },
  'Crittenden, AR': { zips: /^723(01|03|25|27|31|32|39|46|48|64|76|84)$/, towns: /west memphis|marion|earle|turrell|crawfordsville|sunset/i },
  'Mississippi, AR': { zips: /^723(15|16|19|21|29|30|38|50|51|58|70|81|95)$/, towns: /blytheville|osceola|manila|leachville|wilson|keiser/i }
};
function areaOf(addr){
  const a = s(addr), z = (/\b(\d{5})(?:-\d{4})?\s*$/.exec(a) || /\b(3[78]\d{3}|7[2]\d{3})\b/.exec(a) || [])[1] || '';
  let county = '';
  Object.keys(AREA).some(function(k){ if (z ? AREA[k].zips.test(z) : AREA[k].towns.test(a)) { county = k; return true; } return false; });
  return { county: county, inArea: !!county, snowOk: county === 'Shelby, TN' || /bartlett/i.test(a), known: !!(z || county) };
}
function tiersOf(v){ const o = v && typeof v === 'object' ? v : {}; const out = {}; Object.keys(TIERS).forEach(function(k){ const x = o[k] && typeof o[k] === 'object' ? o[k] : {}, d = TIERS[k];
  const dc = x.discount != null && s(x.discount) !== '' ? num(x.discount) : d.discount; out[k] = { name: d.name, discount: Math.max(0, Math.min(50, dc)), visits: s(x.visits || d.visits).slice(0, 200), priority: d.priority, note: d.note || '' }; }); return out; }
function tierOf(c){ const t = low(c && c.tier); return TIERS[t] ? t : 'bronze'; }
function bestTier(list){ let b = 'bronze'; arr(list).forEach(function(c){ const t = tierOf(c); if (TIERS[t].priority < TIERS[b].priority) b = t; }); return b; }
function discounted(price, tier, tiers){ const d = (tiers || tiersOf(null))[tierOf({ tier: tier })].discount; return { discount: d, net: Math.round(num(price) * (100 - d)) / 100 }; }
function itemsOf(v, def, max){ const l = arr(v); return (l.length ? l : def).slice(0, max || 30).map(function(x, i){ return { id: s(x.id) || 'x' + i, name: s(x.name).slice(0, 100) || 'Item', price: Math.max(0, Math.round(num(x.price) * 100) / 100), contents: s(x.contents).slice(0, 600) }; }); }
function templatesOf(v){ const o = v && typeof v === 'object' ? v : {}, out = {}; Object.keys(TEMPLATES).forEach(function(k){ const x = o[k] && typeof o[k] === 'object' ? o[k] : {}; out[k] = { name: TEMPLATES[k].name, subject: s(x.subject || TEMPLATES[k].subject).slice(0, 200), body: s(x.body || TEMPLATES[k].body).slice(0, 4000) }; }); return out; }
/* the next visit after one is done, by the plan's frequency (a winter plan: on call again next December) */
function nextFrom(freq, at){ return freq === 'winter' ? (function(){ const d = new Date(at || Date.now()); const m = d.getUTCMonth(); return m === 11 || m <= 1 ? '' : d.getUTCFullYear() + '-12-01'; })() : nextYear(at, Math.round(12 / (FREQ_N[freq] || 1))); }
/* the ⭐ PRIORITY LIST (owner 10/30): every commercial maintenance-plan customer (snow + emergency mitigation priority) and
   every signed winter snow sign-up, in sign-up order (commercial first when the admin turns that on) */
function digits(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; }
function addrKey(v){ const m = /^\s*(\d+)\s+([a-z0-9]+)/i.exec(s(v)); return m ? m[1] + ' ' + low(m[2]) : ''; }
function priorityList(list, projects, settings){
  const st = settings && settings.plans ? settings : settingsOf(settings), byId = {}; st.plans.forEach(function(x){ byId[x.id] = x; });
  const P = {}; arr(projects).forEach(function(p){ if (p && p.id != null) P[s(p.id)] = p; });
  const out = {};
  arr(list).forEach(function(c){
    if (s(c.status) !== 'signed') return;
    const pl = byId[s(c.planId)] || {}, mk = marketOf(c.market ? c : pl), f = s(c.freq) || pl.freq;
    const snow = f === 'winter' || /snow/i.test(s(c.planName)), com = mk === 'commercial' && f !== 'once';
    if (!snow && !com) return;
    const p = P[s(c.pid)] || {}, k = s(c.pid);
    const e = out[k] || (out[k] = { pid: k, name: s(p.client || p.clientName || p.customer || p.name), job: s(p.name), address: s(p.address || p.jobAddress), phone: s(p.clientPhone || p.phone || p.customerPhone),
      email: s(p.clientEmail || p.customerEmail || p.email), pm: s(p.pm), commercial: false, snow: false, emergency: false, since: s(c.signedAt), plans: [], tier: 'bronze' });
    if (com) { e.commercial = true; e.emergency = true; e.snow = true; } if (snow) e.snow = true;
    if (s(c.signedAt) && s(c.signedAt) < e.since) e.since = s(c.signedAt);
    e.plans.push(s(c.planName)); if (TIERS[tierOf(c)].priority < TIERS[e.tier].priority) e.tier = tierOf(c);
  });
  return Object.keys(out).map(function(k){ return out[k]; }).sort(function(a, b){
    if (st.commercialFirst && a.commercial !== b.commercial) return a.commercial ? -1 : 1;
    return a.since < b.since ? -1 : a.since > b.since ? 1 : 0; });
}
/* an emergency lead from a priority customer: the same phone (last 10 digits), e-mail or street number + street word */
function matchPriority(entries, lead){
  const c = lead && lead.contact && typeof lead.contact === 'object' ? lead.contact : {};
  const ph = digits(c.phone || lead.phone || lead.from), em = low(c.email || lead.email), ad = addrKey(lead.address || c.address || lead.propertyAddress);
  return arr(entries).find(function(e){ return e.emergency && ((ph && digits(e.phone) === ph) || (em && low(e.email) === em) || (ad && addrKey(e.address) === ad)); }) || null;
}
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
function billsPerYear(c){ if (s(c && c.billing) === 'monthly') return 12; const f = s(c && c.freq); if (f === 'twice' || f === 'quarterly') return FREQ_N[f]; const n = parseInt(c && c.billsPerYear, 10); return n === 2 || n === 4 ? n : 1; }
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
  const known = Array.isArray(o.known) ? o.known.map(s) : null;   /* patch MAINTPLUS: the default plans this saved list has already seen */
  const plans = arr(o.plans).length ? arr(o.plans).map(function(x, i){
    const id = s(x.id) || 'plan' + i, def = DEFAULT_PLANS.find(function(d){ return d.id === id; }), f = freqOf(x);
    const pr = x.price != null && s(x.price) !== '' ? num(x.price) : (def && o.catalog !== CATALOG_V ? def.price : 0), rc = num(x.refCredit);
    return { id: id, name: s(x.name).slice(0, 80) || 'Maintenance plan', includes: s(x.includes).slice(0, 1200), freq: f, visits: FREQ_N[f] || 1, market: marketOf(x.market ? x : def),
      price: pr > 0 && pr <= 100000 ? Math.round(pr * 100) / 100 : 0, refCredit: rc > 0 && rc <= 5000 ? Math.round(rc * 100) / 100 : (def && def.refCredit) || 0,
      costEst: Math.max(0, num(x.costEst)),   /* the visit cost estimate per year (the monthly floor check) */
      performer: s(x.performer || (def && def.performer)) === 'sub' ? 'sub' : 'self', sub: s(x.sub != null ? x.sub : (def && def.sub) || '').slice(0, 80), priceSet: x.priceSet === true,
      on: x.on !== false, kinds: (function(k){ return k.length ? k : ['any']; })(Array.isArray(x.kinds) ? x.kinds.map(low).filter(Boolean).slice(0, 8) : []) };
  }) : DEFAULT_PLANS.map(function(x){ return Object.assign({ market: 'residential' }, x); });
  if (arr(o.plans).length) DEFAULT_PLANS.forEach(function(d){   /* the new catalog, once, on top of a list saved before it */
    if (known && known.indexOf(d.id) >= 0) return;   /* seen (and maybe removed on purpose) */
    if (!plans.some(function(x){ return x.id === d.id || (low(x.name) === low(d.name) && marketOf(x) === marketOf(d)); })) plans.push(Object.assign({ market: 'residential' }, d));
  });
  const offerOn = Array.isArray(o.offerOn) && o.offerOn.length ? o.offerOn.map(low).filter(Boolean) : ['residential', 'insurance'];
  const addOns = ADDONS.map(function(d){ const x = arr(o.addOns).find(function(y){ return s(y.id) === d.id; }) || {}; const pr = x.price != null && s(x.price) !== '' ? num(x.price) : d.price; return Object.assign({}, d, { price: Math.max(0, pr), name: s(x.name || d.name).slice(0, 80), priceSet: d.priceSet === true || x.priceSet === true || (x.price != null && num(x.price) !== d.price) }); });
  return { plans: plans, offerOn: offerOn, catalog: CATALOG_V, known: DEFAULT_PLANS.map(function(d){ return d.id; }), tiers: tiersOf(o.tiers), addOns: addOns, letters: o.letters && typeof o.letters === 'object' ? o.letters : {}, products: itemsOf(o.products, PRODUCTS, 20), unitPrices: itemsOf(o.unitPrices, UNIT_PRICES, 40),
    templates: templatesOf(o.templates), commercialFirst: o.commercialFirst === true,
    handymanTasks: (Array.isArray(o.handymanTasks) && o.handymanTasks.length ? o.handymanTasks : HANDYMAN_TASKS).map(s).filter(Boolean).slice(0, 40).map(function(x){ return x.slice(0, 100); }),
    monthly: (function(v){ const out = {}; ['residential', 'commercial'].forEach(function(m){ out[m] = {}; ['bronze', 'silver', 'gold'].forEach(function(k){ const x = v && v[m] && v[m][k]; out[m][k] = x != null && s(x) !== '' ? Math.max(0, num(x)) : MONTHLY[m][k]; }); }); return out; })(o.monthly),
    yearly: (function(v){ const out = {}; ['residential', 'commercial'].forEach(function(m){ out[m] = {}; ['bronze', 'silver', 'gold'].forEach(function(k){ const x = v && v[m] && v[m][k]; if (x != null && s(x) !== '' && num(x) > 0) out[m][k] = num(x); }); }); return out; })(o.yearly),   /* patch CAREYEARLY: an optional yearly tier price (else 12 × monthly less the yearly discount) */
    yearlyDiscount: o.yearlyDiscount != null && s(o.yearlyDiscount) !== '' ? Math.max(0, Math.min(50, num(o.yearlyDiscount))) : 10,   /* owner 11/03: paid once a year — save 10% */
    areaDays: (function(v){ const out = {}; if (v && typeof v === 'object') Object.keys(v).slice(0, 30).forEach(function(k){ const n = parseInt(v[k], 10); if (n >= 0 && n <= 6) out[s(k).slice(0, 40)] = n; }); return out; })(o.areaDays),
    pamphletPhotos: (function(v){ const out = {}; if (v && typeof v === 'object') Object.keys(v).slice(0, 8).forEach(function(k){ out[k] = (Array.isArray(v[k]) ? v[k] : []).map(s).filter(function(r){ return /^sb:crm-files\/[A-Za-z0-9._\/-]+$/.test(r); }).slice(0, 3); }); return out; })(o.pamphletPhotos), updatedAt: s(o.updatedAt), by: s(o.by), saved: !!(o && o.plans) };
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

module.exports = { HANDYMAN_NOTE, HANDYMAN_TASKS, addonFits, MONTHLY, monthlyOf, ROUTE, routeArea, onAreaDay, commissionLines, commission, areaOf, AREA, ADDONS, planVisits, TIERS, tiersOf, tierOf, bestTier, discounted, templatesOf, nextFrom, priorityList, matchPriority, digits, CATALOG_V, FREQS, FREQ_N, marketOf, firstVisit, freqOf, freqLabel, billsPerYear, plainIncludes, PLANS_KEY, LIST_KEY, HEARD_KEY, DEFAULT_PLANS, HEARD_OPTS, settingsOf, plansFor, eligible, workOf, groupOf, contractsFor, offerLine, heardNorm, heardChannel, nextYear, num };
