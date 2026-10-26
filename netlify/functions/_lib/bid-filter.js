/* ============================================================================
   bid-filter.js — the always-on CONSTRUCTION GATE for public bids (patch BIDFILTER).

   Owner: "we shouldn't get these leads, only construction leads."
   A bid becomes a lead only when its title (or, if the title says nothing, its description) shows construction,
   renovation, repair or maintenance of buildings or sites. Purchases, equipment, vehicles, supplies and
   services are skipped. The gate runs even when the "All public bids" switch (settings.allBids) is on — that
   switch now means "all construction bids, any trade" and only lifts the keyword requirement.

   Precedence, first match wins (text is lower-cased, punctuation → spaces, "bldg"/"reno"… spelled out):
     1. CLEAR construction-work phrase (renovation, construction of, reroof, roof replacement, replacement of
        roof/windows/HVAC…, demolition, abatement, restoration, paving, design-build, CMAR, JOC, CSI division,
        NAICS 236/237/238 …)                                              → LEAD   (beats every purchase / vehicle / service word)
     2. "installation of …" / "<thing> installation" / "furnish and install"
        — unless a HARD non-construction word is present (a vehicle, software, copier …) → LEAD
     3. a HARD non-construction word (loader, truck, vehicle, janitorial, software, mowing, consulting …)  → SKIP
     4. a purchase / supply / rental word (purchase, supplies, materials, equipment, lease …):
          · with a trade word AND the word "work", "works", "labor" or "contractor"      → LEAD
          · with a trade word AND a work word (replacement, repair, install …) when it is
            only an equipment / rental word (HVAC equipment replacement)                 → LEAD
          · otherwise                                                                    → SKIP
     5. a trade word (roof, HVAC, concrete, paving, building, facility …)                → LEAD
     6. nothing at all                                                                   → SKIP (unclear: not construction)
   The owner's own words (settings.keywords / settings.exclude) join the trade list / the HARD list.
   Exported lists are plain words ("renovat*" = any ending) so the CRM can show them.
   ========================================================================== */
'use strict';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }

/* ── the lists ─────────────────────────────────────────────────────────────── */
/* trade / building words: a bid about one of these is construction-ish when nothing above says otherwise */
const INCLUDE = ['roof', 'roofing', 'reroof', 're-roof', 'shingle', 'tpo', 'epdm', 'hvac', 'mechanical', 'plumbing', 'electrical', 'paving', 'pavement', 'asphalt', 'concrete', 'masonry', 'brick',
  'drywall', 'painting', 'paint', 'flooring', 'floor', 'carpet', 'tile', 'ceiling', 'insulation', 'windows', 'window', 'doors', 'door', 'siding', 'gutters', 'gutter', 'fencing', 'fence',
  'site work', 'sitework', 'grading', 'drainage', 'storm drain', 'parking lot', 'parking garage', 'sidewalk', 'curb', 'canopy', 'awning', 'structural', 'steel', 'carpentry', 'millwork', 'casework',
  'waterproofing', 'sealant', 'caulking', 'cmu', 'restroom', 'bathroom', 'kitchen', 'gym floor', 'bleachers', 'bleacher', 'playground', 'storm shelter', 'generator', 'building', 'buildings', 'facility', 'facilities',
  'construction', 'renovation', 'remodel', 'addition', 'alteration', 'repair', 'repairs', 'maintenance', 'restoration', 'demolition', 'abatement', 'water damage', 'mold', 'fire damage', 'storm damage',
  'improvements', 'facility improvements', 'ada', 'elevator', 'boiler', 'chiller', 'sprinkler', 'fire alarm', 'lighting', 'wiring', 'stucco', 'retaining wall', 'culvert', 'sewer', 'sanitary sewer',
  'water line', 'manhole', 'pump station', 'lift station', 'road', 'street', 'overlay', 'striping', 'guardrail', 'storefront', 'envelope', 'framing', 'general contractor', 'design-build', 'cmar',
  'job order contracting', 'idiq', 'tenant improvement', 'build-out', 'finish-out', 'excavation', 'foundation', 'bridge'];
/* HARD non-construction words: vehicles, equipment, supplies, services, buying things … */
const EXCLUDE = ['loader', 'track loader', 'skid steer', 'excavators', 'backhoe', 'bulldozer', 'tractor', 'mower', 'mowing', 'lawn care', 'lawn', 'landscaping maintenance', 'landscape maintenance',
  'grounds maintenance', 'tree trimming', 'tree removal', 'truck', 'trucks', 'vehicle', 'vehicles', 'automobile', 'van', 'vans', 'bus', 'school bus', 'police car', 'patrol car', 'suv', 'pickup', 'sedan',
  'trailer', 'fleet', 'ambulance', 'fire truck', 'golf cart', 'forklift', 'heavy equipment', 'sweeper', 'scrubber', 'uniform', 'uniforms', 'janitorial', 'custodial', 'cleaning services',
  'window cleaning', 'food', 'food service', 'catering', 'meals', 'software', 'license', 'licenses', 'subscription', 'it services', 'information technology', 'computer', 'computers', 'laptop', 'laptops',
  'tablets', 'chromebook', 'copier', 'copiers', 'printer', 'printers', 'printing', 'telecommunication', 'insurance', 'insurance broker', 'audit', 'legal', 'legal services', 'attorney', 'consultant',
  'consulting', 'consulting services', 'strategic plan', 'master plan', 'planning services', 'real estate', 'appraisal', 'banking', 'bank', 'fuel', 'diesel', 'gasoline', 'chemicals', 'salt', 'road salt',
  'sand and salt', 'pest control', 'security services', 'security guard', 'guard services', 'towing', 'medical', 'pharmacy', 'pharmaceutical', 'textbook', 'textbooks', 'books', 'library books',
  'furniture', 'athletic equipment', 'sports equipment', 'athletic supplies', 'ammunition', 'firearms', 'radios', 'staffing', 'lobbying', 'tires', 'batteries', 'lubricants', 'office supplies', 'mattress',
  'lab equipment', 'materials testing', 'geotechnical', 'testing services', 'inspection services', 'engineering services', 'architectural services', 'professional services', 'design services',
  'facility management', 'property management', 'management services', 'mosquito', 'laundry', 'translation', 'training', 'advertising', 'marketing'];
/* purchase / supply words (the SUPPLY group) and equipment / rental words (the EQUIP group) — kept apart, see rule 4 */
const SUPPLY = ['purchase', 'purchases', 'purchasing', 'supply', 'supplies', 'materials', 'material', 'bulk', 'delivery of', 'sale of', 'buy'];
const EQUIP = ['equipment', 'rental', 'rent', 'rentals', 'lease', 'leasing'];
/* old words left in the CRM's saved lists that no longer mean "skip" (supply words are rule 4; elevators and door hardware are building work) */
const LEGACY_DROP = ['elevator', 'hardware', 'supplies', 'facility'];

/* CLEAR construction-work phrases (rule 1) — regular expressions on the normalised text */
const CLEAR = [
  /\brenovat\w*/, /\bremodel\w*/, /\brehabilitat\w*/, /\bconstruction (of|project|projects|services|work|manager|management|at risk)\b/, /\bnew construction\b/, /\bgeneral construction\b/,
  /\bre ?roof\w*/, /\broof(ing)? (replacement|repair|repairs|restoration|coating|system|project|replace)\b/, /\breplacement of (the |a |an )?(roof|roofing|windows?|doors?|hvac|rtu|rooftop|chillers?|boilers?|flooring|floors?|ceilings?|siding|gutters?|water heaters?|fenc\w+|sidewalks?|pavement|asphalt|concrete|plumbing|electrical|lighting|fixtures|storefront)\b/,
  /\b(hvac|chiller|boiler|window|door|flooring|ceiling|plumbing|electrical|fence|fencing) (replacement|replace|upgrade|retrofit)\b/,
  /\bdemolition\b/, /\babatement\b/, /\brestoration\b/, /\bresurfacing\b/, /\brepaving\b/, /\bpaving\b/, /\bwater damage\b/, /\bfire damage\b/, /\bstorm damage\b/, /\bmold (remediation|abatement)?\b/,
  /\bdesign build\b/, /\bcmar\b/, /\bcm at risk\b/, /\bconstruction manager\b/, /\bgeneral contractor\b/, /\bjob order contract\w*/, /\bjoc\b/, /\b(idiq construction|construction idiq)\b/,
  /\bsite ?work\b/, /\b(building|facility|interior|exterior|capital|ada|site|campus) (improvement|improvements|upgrades?|repairs?)\b/, /\bimprovements (to|at|for)\b/, /\btenant improvement/, /\bbuild ?out\b/, /\bfinish ?out\b/,
  /\bada (compliance|upgrades?|restrooms?|accessib\w*)\b/, /\badditions?\b/, /\balterations?\b/, /\bstorm shelter/, /\bgym floor/, /\bparking lot\b/, /\bwaterproofing\b/,
  /\bdivision (0?[2-9]|1\d|2[0-8]|3[1-3]|4[0-8])\b/, /\bcsi\b/, /\bnaics\b[^a-z0-9]*23[678]\d*/
];
/* "installation of …", "generator installation", "furnish and install" (rule 2) */
const INSTALL = [/\binstall(ation|ing)? of\b/, /\b[a-z]+ installations?\b/, /\bfurnish\w* (and|&) install/, /\binstallation (and|&) (replacement|repair|removal)\b/];
/* text that must not count as an "installation" or as "construction" in the pre-pass */
const NEUTRAL = /\b(military|army|navy|air force) installations?\b|\b(mosquito|pest|weed) abatement\b|\binstallation support\b|\bconstruction (equipment|supplies|vehicles?|materials|testing|inspection|software|machinery)\b/g;
const WORK = /\b(work|works|labor|contractor)\b/, WORK_ANY = /\b(work|works|labor|contractor|replacement|replace|repair|repairs|install\w*|resurfacing|upgrade|upgrades|retrofit|rehab\w*)\b/;

/* ── helpers ───────────────────────────────────────────────────────────────── */
const ABBR = { bldg: 'building', bldgs: 'buildings', blds: 'buildings', reno: 'renovation', renos: 'renovation', renov: 'renovation', mech: 'mechanical', elec: 'electrical', fac: 'facility',
  'design-build': 'design build', 're-roof': 'reroof', 'reroofing': 'reroof' };
function normalize(t){
  let x = ' ' + low(t).replace(/&amp;/g, '&').replace(/[‐-―−]/g, '-') + ' ';
  x = x.replace(/\bre-roof/g, 'reroof').replace(/\bdesign-build/g, 'design build').replace(/\bbuild-out/g, 'build out').replace(/\bfinish-out/g, 'finish out').replace(/\bsite-work/g, 'sitework');
  x = x.replace(/[^a-z0-9&]+/g, ' ');
  x = x.replace(/\b[a-z]+\b/g, w => ABBR[w] || w);
  return (' ' + x + ' ').replace(/\s+/g, ' ');
}
const RX = {};
function wordRx(w){
  w = low(w).replace(/^\s+|\s+$/g, ''); if (!w) return null;
  if (RX[w]) return RX[w];
  const star = /\*$/.test(w), core = w.replace(/\*$/, '').replace(/[^a-z0-9& ]+/g, ' ').replace(/\s+/g, ' ').trim(); if (!core) return null;
  const body = core.split(' ').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(' ');
  return (RX[w] = new RegExp('(^| )' + body + (star ? '[a-z0-9]*' : '(s|es)?') + '( |$)'));
}
function anyWord(text, list){ for (const w of list) { const r = wordRx(w); if (r && r.test(text)) return w; } return ''; }
function anyRx(text, list){ for (const r of list) { const m = r.exec(text); if (m) return m[0].trim(); } return ''; }
/* a display list: no stars, de-duplicated, lower case */
function merge(){
  const out = [], seen = {};
  Array.prototype.slice.call(arguments).forEach(l => arr(l).forEach(w => { const k = low(w).replace(/\*$/, '').trim(); if (k && !seen[k]) { seen[k] = 1; out.push(k); } }));
  return out;
}
function clean(list, drop){ const d = {}; arr(drop).forEach(x => { d[low(x)] = 1; }); return arr(list).map(low).map(x => x.trim()).filter(x => x && !d[x]); }

/* ── the gate ──────────────────────────────────────────────────────────────── */
function evalText(text, extra){
  const t = normalize(text).replace(NEUTRAL, ' ').replace(/\s+/g, ' ');
  const clear = anyRx(t, CLEAR), inst = anyRx(t, INSTALL);
  const hard = anyWord(t, extra.exclude) || anyWord(t, EXCLUDE);
  const sup = anyWord(t, SUPPLY), eq = anyWord(t, EQUIP);
  const trade = anyWord(t, extra.include) || anyWord(t, INCLUDE);
  if (clear) return { ok: true, rule: 1, hit: clear };
  if (inst && !hard) return { ok: true, rule: 2, hit: inst };
  if (hard) return { ok: false, rule: 3, hit: hard, why: 'not construction (' + hard + ')' };
  if (sup || eq) {
    if (trade && ((sup && WORK.test(t)) || (!sup && WORK_ANY.test(t)))) return { ok: true, rule: 4, hit: trade };
    return { ok: false, rule: 4, hit: sup || eq, why: 'a purchase / supply / rental (' + (sup || eq) + ')' };
  }
  if (trade) return { ok: true, rule: 5, hit: trade };
  return { ok: false, rule: 6, hit: '', why: 'no sign of construction work', none: true };
}
/* check(title, description, { include, exclude }) → { ok, why, hit, rule }
   The title decides; the description is read only when the title shows nothing either way. */
function check(title, desc, opts){
  opts = opts || {};
  const extra = { include: clean(opts.include, LEGACY_DROP), exclude: clean(opts.exclude, LEGACY_DROP) };
  const t = s(title), d = s(desc).slice(0, 700);
  const a = evalText(t, extra);
  if (a.none && d) { const b = evalText(t + ' ' + d, extra); return b; }
  return a;
}
/* the same, for a lead-inbox item / watcher record */
function checkItem(it, opts){
  it = it || {};
  return check(it.title || it.name, [it.scope, it.context, arr(it.trades).join(' ')].filter(Boolean).join(' '), opts);
}
/* the owner's saved words + the built-in ones, for the CRM screen (nothing the owner added is lost) */
function mergedLists(saved){
  saved = saved || {};
  return { keywords: merge(clean(saved.keywords, LEGACY_DROP), INCLUDE), exclude: merge(clean(saved.exclude, LEGACY_DROP), EXCLUDE) };
}
/* settings → the gate's options */
function optsFrom(settings){ settings = settings || {}; return { include: arr(settings.keywords), exclude: arr(settings.exclude) }; }

module.exports = { INCLUDE, EXCLUDE, SUPPLY, EQUIP, CLEAR, INSTALL, LEGACY_DROP, check, checkItem, mergedLists, optsFrom, merge, normalize };
