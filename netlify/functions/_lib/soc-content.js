/* GrayCo Social — the shared content and rules (patch SOC). ONE copy: the CRM's 📣 Marketing tab (pasted into the
   gc-patch-soc script by wSOC/patch_SOC.py) and the server (_lib/soc.js, _lib/mkt.js) use the same platforms, the
   same per-platform templates, the same weekly mix, the same listings list and NAP check. Pure functions: no network,
   no DOM. Needs the marketing content (mkt-content.js: guard / scrub / brand / tips) — required here on the server,
   window.__gcMktContent in the page.

   Owner (22 Oct 2026, the agency quote): 3 posts a week on Facebook, Instagram, TikTok, LinkedIn and Google Business,
   each one ADAPTED to the platform (never the same text twice), a content library, 40+ listings kept right.
   Owner (22 Oct 2026, later): restoration first — water damage, storm damage, mitigation, insurance-claim help ahead
   of roofing, remodels and commercial. FOCUS below is the default; Marketing → 🎯 Marketing focus changes the
   weights (cfg.main.socFocus). Restoration posts carry the 24/7 emergency line and link to the city's
   storm-damage / water-damage page on grayco-cs.com.
   Rules: never a customer's address or name without their OK, never an insurance carrier, photos only from jobs whose
   customer said yes to marketing. */
(function(root, factory){
  var MC = null;
  try { if (typeof module === 'object' && module && module.exports) MC = require('./mkt-content.js'); } catch (e) {}
  if (!MC && root && root.__gcMktContent) MC = root.__gcMktContent;
  var S = factory(MC);
  if (typeof module === 'object' && module && module.exports) module.exports = S;
  if (root && typeof root === 'object' && typeof root.document !== 'undefined') root.__gcSocContent = S;
})(typeof self !== 'undefined' ? self : this, function(MC){
'use strict';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
var B = MC.BRAND;
var PHONE = B.phone, WEB = 'https://grayco-cs.com';

/* ── the platforms ── */
var PLATS = [
  { v: 'facebook', l: 'Facebook', ic: '📘', open: 'https://www.facebook.com/', max: 5000 },
  { v: 'instagram', l: 'Instagram', ic: '📸', open: 'https://www.instagram.com/', max: 2200 },
  { v: 'tiktok', l: 'TikTok', ic: '🎵', open: 'https://www.tiktok.com/upload', max: 2200 },
  { v: 'linkedin', l: 'LinkedIn', ic: '💼', open: 'https://www.linkedin.com/feed/', max: 3000 },
  { v: 'gbp', l: 'Google Business', ic: '📍', open: 'https://business.google.com/', max: 1500 }
];
var PLAT_IDS = PLATS.map(function(p){ return p.v; });
function plat(v){ return PLATS.filter(function(p){ return p.v === v; })[0] || null; }

/* ── the services and the focus (restoration first) ── */
var SERVICES = [
  { v: 'restoration', l: 'Restoration (water / storm / mitigation / claims)' },
  { v: 'roofing', l: 'Roofing' },
  { v: 'remodel', l: 'Remodel' },
  { v: 'commercial', l: 'Commercial' }
];
var FOCUS = { restoration: 60, roofing: 20, remodel: 12, commercial: 8 };
/* the weights in use: the admin's setting (numbers ≥ 0), else the default; always adds up to 100 */
function focusOf(setting){
  var w = {}, tot = 0;
  SERVICES.forEach(function(x){ var n = setting && setting[x.v] != null ? +setting[x.v] : FOCUS[x.v]; w[x.v] = isFinite(n) && n > 0 ? n : 0; tot += w[x.v]; });
  if (!tot) { w = Object.assign({}, FOCUS); tot = 100; }
  var out = {}; SERVICES.forEach(function(x){ out[x.v] = Math.round(w[x.v] / tot * 1000) / 10; });
  return out;
}
/* a job / lead → its service (insurance, storm, water and fire work is restoration, even on a roof) */
function serviceOf(x){
  x = x || {};
  var t = low([x.type, x.jobType, x.projectType, x.leadType, x.category, x.service, x.title, x.name, x.scope].join(' '));
  if (x.isInsurance === true || x.insurance === true || /water|mitigat|storm|hail|wind damage|fire|smoke|flood|mold|restor|insur|claim|dry.?out|emergency/.test(t)) return 'restoration';
  if (/roof|shingle/.test(t)) return 'roofing';
  if (/commercial|tenant|\bti\b|retail|warehouse|office build|church|school/.test(t)) return 'commercial';
  if (/remodel|kitchen|bath|renovat|floor|addition|deck|paint|cabinet|handyman|residential/.test(t)) return 'remodel';
  return '';
}
/* how many of the next n posts go to each service: the one furthest behind its share goes next (deterministic) */
function allocate(n, weights, history){
  var w = focusOf(weights), h = {}, tot = 0, out = [];
  SERVICES.forEach(function(x){ h[x.v] = +(history && history[x.v]) || 0; tot += h[x.v]; });
  for (var i = 0; i < n; i++) {
    var best = null, bestGap = -Infinity;
    SERVICES.forEach(function(x){ if (!w[x.v]) return; var gap = (tot + 1) * w[x.v] / 100 - h[x.v]; if (gap > bestGap + 1e-9) { bestGap = gap; best = x.v; } });
    out.push(best); h[best]++; tot++;
  }
  return out;
}

/* ── the weekly mix ── */
var TYPES = [
  { v: 'progress', l: 'Job in progress', ic: '🚧' },
  { v: 'beforeafter', l: 'Before / after', ic: '✨' },
  { v: 'testimonial', l: 'Customer testimonial', ic: '💬' },
  { v: 'team', l: 'Meet the team', ic: '👷' },
  { v: 'tip', l: 'Homeowner tip', ic: '💡' },
  { v: 'seasonal', l: 'Seasonal', ic: '🍂' }
];
function typeLabel(v){ var t = TYPES.filter(function(x){ return x.v === v; })[0]; return t ? t.ic + ' ' + t.l : v; }
var JOB_TYPES = { progress: 1, beforeafter: 1, testimonial: 1 };
/* o = { week: number (weeks since 2026-01-05), weights, history: {service: posts so far}, avail: { service: { progress, beforeafter, testimonial } },
         team: bool (a team photo in the library), last: [types used last week] } → [{ service, type }] × 3, three different types */
function planMix(o){
  o = o || {};
  var n = o.count || 3, svcs = allocate(n, o.weights, o.history), wk = Math.abs(+o.week || 0), last = arr(o.last);
  var order = TYPES.map(function(t){ return t.v; }), rot = (wk * 2) % order.length;
  order = order.slice(rot).concat(order.slice(0, rot));
  /* types not used last week first, so the six come round every two weeks */
  order = order.filter(function(t){ return last.indexOf(t) < 0; }).concat(order.filter(function(t){ return last.indexOf(t) >= 0; }));
  var used = [], out = [];
  svcs.forEach(function(svc){
    var av = (o.avail && o.avail[svc]) || {};
    var t = order.filter(function(x){ if (used.indexOf(x) >= 0) return false; if (JOB_TYPES[x]) return !!av[x]; if (x === 'team') return !!o.team; return true; })[0]
      || order.filter(function(x){ return used.indexOf(x) < 0 && !JOB_TYPES[x]; })[0] || 'tip';   /* team as a text post when no team photo */
    used.push(t); out.push({ service: svc, type: t });
  });
  return out;
}
function weekNo(ms){ return Math.floor((ms - Date.UTC(2026, 0, 5)) / (7 * 864e5)); }

/* ── words per service ── */
/* the 7 cities with service pages on grayco-cs.com; any other area links to the Bartlett page. The ONLY page patterns on the site
   (SITE_PAGES); commercial has no page — it links to the homepage. */
var REST_CITIES = ['bartlett', 'memphis', 'germantown', 'collierville', 'cordova', 'arlington', 'lakeland'];
function slugCity(c){ return low(c).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
/* the restoration page for the city: water → /water-damage-mitigation-<city>-tn/, fire → /fire-damage-restoration-<city>-tn/, storm → /storm-damage-restoration-<city>-tn/ */
var SITE_PAGES = ['roofing', 'roof-repair', 'remodeling', 'water-damage-mitigation', 'fire-damage-restoration', 'storm-damage-restoration'];
function cityPage(kind, city){ var c = slugCity(city || 'Bartlett'); if (REST_CITIES.indexOf(c) < 0) c = 'bartlett'; return WEB + '/' + (SITE_PAGES.indexOf(kind) >= 0 ? kind : 'roofing') + '-' + c + '-tn/'; }
function restPage(sub, city){ return cityPage(sub === 'water' ? 'water-damage-mitigation' : sub === 'fire' ? 'fire-damage-restoration' : 'storm-damage-restoration', city); }
/* is this one of the site's real pages? (the homepage, or <pattern>-<one of the 7 cities>-tn/) */
function sitePageOk(url){ var m = /^https:\/\/grayco-cs\.com(\/[^?#]*)?/.exec(s(url)); if (!m) return false; var path = m[1] || '/'; if (path === '/') return true;
  var x = /^\/([a-z-]+)-([a-z-]+)-tn\/$/.exec(path); if (!x) return false; return SITE_PAGES.some(function(k){ var c = path.slice(1).replace(/-tn\/$/, ''); return c.indexOf(k + '-') === 0 && REST_CITIES.indexOf(c.slice(k.length + 1)) >= 0; }); }
function pageFor(idea){
  if (idea.service === 'restoration') return restPage(idea.sub, idea.city);
  if (idea.service === 'roofing') return cityPage(/repair|leak|patch/i.test(s(idea.jobText) + ' ' + s(idea.tip)) ? 'roof-repair' : 'roofing', idea.city);
  if (idea.service === 'remodel') return cityPage('remodeling', idea.city);
  return WEB + '/';   /* commercial: no page — the homepage */
}
function withUtm(url, platV, idea){
  var camp = 'soc-' + (idea.service || 'brand') + (idea.sub ? '-' + idea.sub : '');
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'utm_source=' + platV + '&utm_medium=social&utm_campaign=' + camp + (idea.week ? '&utm_content=' + idea.week : '');
}
/* restoration = WATER, FIRE and STORM (owner): the job says which; otherwise they take turns evenly (n = restoration posts so far) */
var RSUBS = ['water', 'fire', 'storm'];
function subFor(idea, n){
  var t = low(idea && idea.jobText);
  if (/fire|smoke|soot/.test(t)) return 'fire';
  if (/water|pipe|leak|flood|mitigat|dry|mold/.test(t)) return 'water';
  if (/storm|hail|wind|tree/.test(t)) return 'storm';
  return RSUBS[Math.abs(+n || 0) % 3];
}
/* the next sub for a template post: the one used least so far (ties: water, fire, storm) */
function nextSub(counts){ counts = counts || {}; return RSUBS.slice().sort(function(a, b){ return (+counts[a] || 0) - (+counts[b] || 0) || RSUBS.indexOf(a) - RSUBS.indexOf(b); })[0]; }
var CTA247 = '🚨 Water, fire or storm emergency? We answer 24/7: ' + PHONE;
/* the owner's positioning line (no license number is invented here) */
var POSITION = 'Restoration + Licensed General Contractor (Unlimited) — one company from mitigation to full rebuild';
var SVC = {
  restoration: {
    water: { what: 'a water damage dry-out and rebuild', short: 'water damage', tag: '#WaterDamage #WaterMitigation #MemphisRestoration', li: 'water mitigation and restoration' },
    fire: { what: 'a fire and smoke damage restoration', short: 'fire & smoke damage', tag: '#FireDamage #SmokeDamage #MemphisRestoration', li: 'fire and smoke damage restoration' },
    storm: { what: 'a storm damage restoration', short: 'storm damage', tag: '#StormDamage #StormRestoration #MemphisRestoration', li: 'storm damage restoration' }
  },
  roofing: { what: 'a brand-new roof', short: 'roofing', tag: '#MemphisRoofing #NewRoof #BartlettTN', li: 'residential roofing' },
  remodel: { what: 'a home remodel', short: 'remodeling', tag: '#HomeRemodel #KitchenRemodel #BartlettTN', li: 'residential remodeling' },
  commercial: { what: 'a commercial project', short: 'commercial construction', tag: '#CommercialConstruction #MemphisBusiness', li: 'commercial construction' }
};
function words(idea){ var w = SVC[idea.service] || SVC.remodel; return idea.service === 'restoration' ? w[idea.sub === 'water' || idea.sub === 'fire' ? idea.sub : 'storm'] : w; }
/* restoration tips: water, fire, storm, mitigation, insurance-claim help (never a carrier's name) */
var REST_TIPS = [
  { id: 'rt_48h', sub: 'water', t: 'Water damage gets worse by the hour — wet drywall and insulation can start growing mold within 48 hours. Shut off the water, get photos, and call a mitigation crew right away.' },
  { id: 'rt_shutoff', sub: 'water', t: 'Do you know where your main water shut-off is? Find it today and tag it. In a burst-pipe emergency those first minutes save floors, walls and cabinets.' },
  { id: 'rt_freeze', sub: 'water', t: 'Freeze coming? Drip the faucets on outside walls, open the sink cabinets and keep the heat at 55°F or more — even when you travel.' },
  { id: 'rt_photos', sub: 'storm', t: 'After a storm, take photos of the roof, siding, gutters and windows before anything is moved or cleaned up. Good photos make the insurance claim go smoother.' },
  { id: 'rt_tarp', sub: 'storm', t: 'Storm opened up your roof? An emergency tarp the same day stops the second round of damage — and your insurance policy expects you to protect the home.' },
  { id: 'rt_claim', sub: 'storm', t: 'Filing an insurance claim? Keep every receipt, write down every call, and have your contractor meet the adjuster so nothing gets missed. We help with claims every week.' },
  { id: 'rt_hidden', sub: 'water', t: 'A small ceiling stain is often a big leak above it. Moisture meters and thermal cameras find the water you can\'t see — before it becomes mold.' },
  { id: 'rt_fire_soot', sub: 'fire', t: 'After a fire, soot and smoke keep damaging the home for days — they etch glass, stain walls and get into the HVAC. Fast professional cleanup saves more than you think.' },
  { id: 'rt_fire_safe', sub: 'fire', t: 'Smoke alarm check: test them monthly, change the batteries twice a year, and replace any alarm older than 10 years.' },
  { id: 'rt_fire_after', sub: 'fire', t: 'After a fire: don\'t run the HVAC, don\'t wipe soot off walls, and take photos of every room before cleanup starts. Then call a restoration team that also rebuilds.' },
  { id: 'rt_hail', sub: 'storm', t: 'Hail damage usually can\'t be seen from the ground. If hail hit your street, get a free inspection with photos before deciding anything.' }
];
var SEASON = {
  1: 'January freeze season: burst pipes are the #1 call we get. Know your shut-off and drip your faucets on cold nights.',
  2: 'Late-winter storms are around the corner. Now is the time to check the roof, gutters and sump pump.',
  3: 'Spring storm season is here in the Mid-South. Walk your property after every big storm and take photos.',
  4: 'April hail and wind — if a storm rolls through your neighborhood, get a free inspection before small damage turns into a leak.',
  5: 'May storms and heavy rain: clear the gutters and downspouts so the water goes away from the house.',
  6: 'Summer thunderstorms: trees and big limbs over the roof are worth a look before the next one.',
  7: 'July heat and pop-up storms — keep an eye on attic ventilation and any new ceiling stains after heavy rain.',
  8: 'Late-summer storms and tropical rain can push water where it doesn\'t belong. Check windows, flashing and basements.',
  9: 'Fall checklist: gutters, flashing and caulk — before the leaves and the cold arrive.',
  10: 'October: clean the gutters after the leaves drop, check the roof before winter storms, and know where your water shut-off is.',
  11: 'November: insulate outside pipes and disconnect the garden hoses before the first hard freeze.',
  12: 'December freeze: a burst pipe can put hundreds of gallons on the floor. Keep the heat on and the cabinets open on cold nights.'
};

/* ── per-platform versions from templates (no AI key, or the AI's version did not pass the rules) ── */
/* idea = { type, service, sub, city, week, quote, quoteBy (first name, only with the customer's OK), tip, season, team (staff first names),
            photos (count), video (bool), title } */
function templates(idea){
  var w = words(idea), city = s(idea.city) || 'the Memphis area', rest = idea.service === 'restoration';
  var cta = rest ? CTA247 : 'Free estimates: ' + PHONE;
  var link = function(p){ return withUtm(pageFor(idea), p, idea); };
  var q = s(idea.quote), by = s(idea.quoteBy) || 'a GrayCo customer';
  var tip = s(idea.tip), season = s(idea.season), team = s(idea.team) || 'our crew';
  var head = {
    progress: { fb: 'Today in ' + city + ': our crew is in the middle of ' + w.what + '.', hook: 'POV: you called GrayCo about ' + w.short + ' ⬇️', li: 'Project update — ' + w.li + ' underway in ' + city + '.', g: 'Work in progress in ' + city + ': ' + w.what + '.' },
    beforeafter: { fb: 'Before ➡️ after in ' + city + '! We just finished ' + w.what + '.', hook: 'Wait for the after… 👀', li: 'Completed: ' + w.li + ' in ' + city + '.', g: 'Just finished ' + w.what + ' in ' + city + '.' },
    testimonial: { fb: 'This one made our week 🙏', hook: 'What our customers say after ' + w.short, li: 'Customer feedback on a recent ' + w.li + ' project.', g: 'What a customer said about our ' + w.short + ' work.' },
    team: { fb: 'Meet the people behind GrayCo 👋', hook: 'Meet the crew that shows up when you call 📞', li: 'Behind every GrayCo project is a team we are proud of.', g: 'Meet the GrayCo team serving ' + city + '.' },
    tip: { fb: '💡 Homeowner tip from GrayCo:', hook: 'Homeowners — save this one 💾', li: 'A practical tip for homeowners and property managers:', g: 'Homeowner tip:' },
    seasonal: { fb: '🍂 This time of year in the Mid-South:', hook: 'Do this before the weather turns 🌧', li: 'Seasonal reminder for property owners in the Mid-South:', g: 'Seasonal tip from GrayCo:' }
  }[idea.type] || { fb: 'From GrayCo:', hook: 'From GrayCo', li: 'From GrayCo:', g: 'From GrayCo:' };
  var body = idea.type === 'testimonial' ? '“' + q + '” — ' + by
    : idea.type === 'tip' ? tip : idea.type === 'seasonal' ? season
    : idea.type === 'team' ? 'Say hi to ' + team + '. Licensed, insured and local — the same people you will meet on your job.'
    : idea.type === 'progress' ? (rest ? (idea.sub === 'fire' ? 'Board-up, soot and smoke cleanup, documenting it all, then the rebuild — step by step, with the homeowner updated the whole way.' : idea.sub === 'water' ? 'Drying, documenting, and putting it back together — step by step, with the homeowner updated the whole way.' : 'Tarping, documenting the storm damage, then the full repair — step by step, with the homeowner updated the whole way.') : 'Clean site, clear updates, and the homeowner sees every step in their own portal.')
    : (rest ? 'From the first call to the final repair — ' + (idea.sub === 'fire' ? 'board-up, smoke and soot cleanup' : idea.sub === 'water' ? 'dry-out' : 'emergency tarp') + ', insurance paperwork help, and the rebuild, one team.' : 'Thank you to our customer for trusting GrayCo with their home.');
  var fb = head.fb + '\n\n' + body + '\n\n' + (rest ? 'GrayCo: ' + POSITION + '.\n' + CTA247 + '\n' + link('facebook') : 'Neighbors, if you need a hand, we are right here in Bartlett. ' + cta + '\n' + link('facebook'));
  var many = (+idea.photos || 0) >= 3 && !idea.video;
  var ig = {
    format: many ? 'carousel' : 'reel',
    slides: many ? ['Cover: the "after" with the GrayCo logo', 'The "before"', 'The work in progress', 'The finished detail shot', 'Last slide: ' + (rest ? '24/7 emergency line ' + PHONE : 'free estimate ' + PHONE)] : [],
    script: many ? [] : ['0–2s: ' + head.hook, '2–8s: the ' + (idea.type === 'beforeafter' ? 'before' : 'problem') + ' — wide shot, then close-up', '8–14s: the crew at work (no faces of customers, no house numbers)', '14–20s: the result / the tip on screen', '20–25s: GrayCo logo + ' + (rest ? '"24/7 emergencies"' : '"Free estimates"') + ' + ' + PHONE],
    caption: (idea.type === 'testimonial' ? '💬 ' : '') + head.hook.replace(/[⬇️👀💾📞🌧]/g, '').trim() + '\n\n' + body + '\n\n' + (rest ? 'One company from mitigation to full rebuild. 🚨 24/7 emergency line in our bio.' : 'Free estimates — link in bio.'),
    hashtags: w.tag + ' #GrayCo #Bartlett #MemphisHomes #MidSouth'
  };
  var tt = {
    hook: head.hook,
    onScreen: [head.hook, idea.type === 'tip' || idea.type === 'seasonal' ? tip || season : w.short + ' in ' + city, rest ? '24/7 water · fire · storm' : 'Free estimates', PHONE],
    script: ['Hook (0–2s): say "' + head.hook.replace(/[⬇️👀💾📞🌧]/g, '').trim() + '" to camera or show the worst "before" shot', 'Show (2–15s): ' + (idea.type === 'tip' || idea.type === 'seasonal' ? 'walk through the tip in 3 quick shots' : 'quick cuts of the work — no house numbers, no customer faces'), 'Payoff (15–22s): the result / the answer', 'Close (22–25s): "GrayCo — ' + (rest ? 'we answer 24/7' : 'free estimates') + '."'],
    caption: (idea.type === 'testimonial' ? 'Real words from a real customer. ' : '') + (rest ? w.short.charAt(0).toUpperCase() + w.short.slice(1) + '? We answer 24/7 📞' : 'Local, licensed, insured — Bartlett / Memphis 🛠'),
    hashtags: '#fyp #homeowner ' + w.tag.split(' ').slice(0, 2).join(' ') + ' #memphis'
  };
  var li = head.li + '\n\n' + (idea.type === 'testimonial' ? 'Our customer shared: "' + q + '"' : body) + '\n\n' +
    (rest ? 'GrayCo Construction Services — ' + POSITION + '. Water mitigation, fire and smoke restoration, storm restoration and insurance-claim documentation for homeowners, property managers and businesses across the Mid-South — 24/7 at ' + PHONE + '.'
      : 'GrayCo Construction Services is a licensed general contractor (TN #85034 BCB) serving the Mid-South.') + '\n' + link('linkedin') + '\n\n#GrayCo ' + (rest ? '#PropertyManagement #Restoration' : '#Construction #MidSouth');
  var g = { text: head.g + ' ' + (idea.type === 'testimonial' ? '"' + q.slice(0, 220) + '"' : body).slice(0, 600) + ' ' + (rest ? 'Restoration + licensed general contractor (unlimited): mitigation to full rebuild. Water, fire or storm emergency? We answer 24/7.' : 'Local, licensed and insured.'),
    cta: rest ? 'CALL' : 'LEARN_MORE', url: link('gbp') };
  return { facebook: { caption: fb }, instagram: ig, tiktok: tt, linkedin: { text: li }, gbp: g };
}
/* the text that is posted, per platform */
function captionFor(v, version){
  var x = version || {};
  if (v === 'facebook') return s(x.caption);
  if (v === 'instagram') return s(x.caption) + (s(x.hashtags) ? '\n\n' + s(x.hashtags) : '');
  if (v === 'tiktok') return (s(x.caption) + (s(x.hashtags) ? ' ' + s(x.hashtags) : '')).slice(0, 2200);
  if (v === 'linkedin') return s(x.text);
  if (v === 'gbp') return s(x.text).slice(0, 1500);
  return s(x.caption || x.text);
}
function allText(v, version){ var x = version || {}; return [captionFor(v, x), arr(x.script).join('\n'), arr(x.onScreen).join('\n'), arr(x.slides).join('\n'), s(x.hook)].join('\n'); }

/* ── the rules for public text: addresses, carriers, customers' names (only with their OK) ── */
/* o = { addresses: [job addresses], names: [customer names], nameOk: true only when the customer gave permission (then the first name may show) } */
function problems(text, o){
  o = o || {};
  var out = MC.guard(text, arr(o.addresses)), t = low(text);
  arr(o.names).forEach(function(n){
    n = s(n); if (n.length < 3) return;
    var parts = n.split(/\s+/), last = parts.length > 1 ? parts[parts.length - 1] : '';
    if (t.indexOf(low(n)) >= 0 && parts.length > 1) out.push({ k: 'name', l: 'Names the customer (“' + n + '”) — only a first name, and only with their OK.' });
    else if (last.length >= 3 && new RegExp('\\b' + last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)) out.push({ k: 'name', l: 'Names the customer (“' + last + '”).' });
    else if (!o.nameOk && parts[0].length >= 3 && new RegExp('\\b' + parts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)) out.push({ k: 'name', l: 'Names the customer (“' + parts[0] + '”) without their OK.' });
  });
  return out;
}
function protect(text, o){
  o = o || {};
  var t = MC.scrub(text, arr(o.addresses));
  arr(o.names).forEach(function(n){
    n = s(n); if (n.length < 3) return; var parts = n.split(/\s+/);
    var rx = function(x){ return new RegExp('\\b' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'); };
    if (parts.length > 1) t = t.replace(rx(n), o.nameOk ? parts[0] : 'our customer');
    if (parts.length > 1 && parts[parts.length - 1].length >= 3) t = t.replace(rx(parts[parts.length - 1]), '');
    if (!o.nameOk && parts[0].length >= 3) t = t.replace(rx(parts[0]), 'our customer');
  });
  return t.replace(/[ \t]{2,}/g, ' ');
}
function protectVersion(v, version, o){
  var x = JSON.parse(JSON.stringify(version || {}));
  ['caption', 'text', 'hook', 'hashtags'].forEach(function(k){ if (x[k] != null) x[k] = protect(x[k], o); });
  ['script', 'onScreen', 'slides'].forEach(function(k){ if (Array.isArray(x[k])) x[k] = x[k].map(function(y){ return protect(y, o); }); });
  return x;
}
/* every version of a post: its problems (empty = OK to go public) */
function postProblems(post){
  var o = { addresses: arr(post && post.jobAddresses), names: arr(post && post.names), nameOk: !!(post && post.nameOk) }, out = [];
  var vs = (post && post.versions) || {};
  Object.keys(vs).forEach(function(v){ problems(allText(v, vs[v]), o).forEach(function(p){ out.push({ k: p.k, l: (plat(v) ? plat(v).l + ': ' : '') + p.l, plat: v }); }); });
  if (post && post.caption) problems(post.caption, o).forEach(function(p){ out.push(p); });
  return out;
}
/* no two platforms get the same text: a duplicate (or an empty one) falls back to that platform's template */
function distinct(versions, tpl){
  var seen = {}, out = {};
  PLAT_IDS.forEach(function(v){
    var x = versions && versions[v]; if (!x) return;
    var key = low(captionFor(v, x)).replace(/\s+/g, ' ');
    if (!key || seen[key]) { x = tpl && tpl[v]; key = low(captionFor(v, x)).replace(/\s+/g, ' '); }
    seen[key] = 1; out[v] = x;
  });
  return out;
}
/* the AI's answer, cleaned: the fields each platform needs, the rules applied, a template where it fell short */
function normalize(raw, idea, o){
  var tpl = templates(idea), out = {};
  raw = raw || {};
  var clip = function(x, n){ return s(x).slice(0, n); }, list = function(x, n){ return arr(x).map(function(y){ return clip(y, 200); }).filter(Boolean).slice(0, n || 8); };
  var cand = {
    facebook: raw.facebook && { caption: clip(raw.facebook.caption || raw.facebook.text, 2000) },
    instagram: raw.instagram && { format: raw.instagram.format === 'carousel' ? 'carousel' : 'reel', slides: list(raw.instagram.slides, 10), script: list(raw.instagram.script, 8), caption: clip(raw.instagram.caption, 1800), hashtags: clip(raw.instagram.hashtags, 300) },
    tiktok: raw.tiktok && { hook: clip(raw.tiktok.hook, 150), onScreen: list(raw.tiktok.onScreen || raw.tiktok.on_screen, 6), script: list(raw.tiktok.script, 8), caption: clip(raw.tiktok.caption, 1500), hashtags: clip(raw.tiktok.hashtags, 200) },
    linkedin: raw.linkedin && { text: clip(raw.linkedin.text || raw.linkedin.caption, 2500) },
    gbp: raw.gbp && { text: clip(raw.gbp.text || raw.gbp.caption, 1400), cta: /^(CALL|LEARN_MORE|BOOK|SIGN_UP)$/.test(s(raw.gbp.cta)) ? s(raw.gbp.cta) : tpl.gbp.cta, url: tpl.gbp.url }
  };
  PLAT_IDS.forEach(function(v){
    var x = cand[v];
    if (!x || !s(captionFor(v, x))) { out[v] = tpl[v]; return; }
    if (v === 'instagram' && !x.slides.length && !x.script.length) x[x.format === 'carousel' ? 'slides' : 'script'] = tpl.instagram[x.format === 'carousel' ? 'slides' : 'script'].length ? tpl.instagram[x.format === 'carousel' ? 'slides' : 'script'] : tpl.instagram.script;
    if (v === 'tiktok' && !x.hook) x.hook = tpl.tiktok.hook;
    if (idea.service === 'restoration' && (v === 'facebook' || v === 'linkedin') && !/24\/7|24-7|24 hours/i.test(captionFor(v, x))) { if (v === 'facebook') x.caption += '\n\n' + CTA247; else x.text += '\n\nWe answer 24/7: ' + PHONE; }
    if ((v === 'facebook' || v === 'linkedin') && !/https?:\/\//.test(captionFor(v, x))) { if (v === 'facebook') x.caption += '\n' + tpl.facebook.caption.split('\n').pop(); else x.text += '\n' + withUtm(pageFor(idea), 'linkedin', idea); }
    x = protectVersion(v, x, o);
    out[v] = problems(allText(v, x), o).length ? tpl[v] : x;
  });
  return distinct(out, tpl);
}
/* the AI's instructions (the tool's input schema lives in _lib/soc.js) */
function aiPrompt(idea){
  return 'You write social posts for GrayCo Construction Services (Bartlett, TN; licensed general contractor; ' + PHONE + '). ' +
    'Write ONE idea five ways — each must read differently, never the same text:\n' +
    '• facebook: a friendly community-style post (neighbors, local), 60–120 words.\n' +
    '• instagram: either a Reel (script = 4–6 shot lines) or a carousel (slides = 4–6 slide lines) + a short caption + 5–8 hashtags.\n' +
    '• tiktok: a 1-line hook for the first 2 seconds, 3–4 on-screen text lines, a 4-line script, a very short caption, 4–5 hashtags.\n' +
    '• linkedin: a professional update for property managers / business owners, 50–100 words, no emojis.\n' +
    '• gbp: a Google Business "what\'s new" post, under 300 characters, and a call-to-action (CALL or LEARN_MORE).\n' +
    'RULES: never a street address or house number, never a customer\'s name' + (idea.quoteBy ? ' (except the first name "' + idea.quoteBy + '", who gave permission)' : '') + ', never an insurance company\'s name (say "your insurance company"), no prices, no promises we cannot keep.' +
    ' Positioning: "' + POSITION + '" — never invent a license number.' + (idea.service === 'restoration' ? ' This is RESTORATION work (' + (idea.sub === 'water' ? 'water damage / mitigation' : idea.sub === 'fire' ? 'fire and smoke damage' : 'storm damage') + ', insurance-claim help): every version says we answer 24/7 for water, fire and storm emergencies.' : '') + '\n' +
    'The idea: type=' + idea.type + ', service=' + idea.service + (idea.sub ? '/' + idea.sub : '') + ', area=' + (idea.city || 'Memphis area') +
    (idea.quote ? ', customer words: "' + idea.quote + '"' : '') + (idea.tip ? ', tip: ' + idea.tip : '') + (idea.season ? ', season: ' + idea.season : '') + (idea.team ? ', team: ' + idea.team : '') +
    ', photos: ' + (+idea.photos || 0) + (idea.video ? ', a video clip' : '') + '.';
}

/* ── listings: 40+ places GrayCo should be listed (the owner keeps them right; BrightLocal can check them) ── */
var LISTINGS = [
  ['gbp', 'Google Business Profile', 'Core', 'https://business.google.com/', 'google.com', 1],
  ['bing', 'Bing Places', 'Core', 'https://www.bingplaces.com/', 'bing.com', 1],
  ['apple', 'Apple Business Connect (Maps)', 'Core', 'https://businessconnect.apple.com/', 'apple.com', 1],
  ['facebook', 'Facebook Page', 'Core', 'https://www.facebook.com/', 'facebook.com', 1],
  ['yelp', 'Yelp', 'Core', 'https://biz.yelp.com/', 'yelp.com', 1],
  ['bbb', 'Better Business Bureau', 'Core', 'https://www.bbb.org/', 'bbb.org', 1],
  ['nextdoor', 'Nextdoor Business', 'Core', 'https://business.nextdoor.com/', 'nextdoor.com', 1],
  ['instagram', 'Instagram', 'Social', 'https://www.instagram.com/', 'instagram.com', 2],
  ['tiktok', 'TikTok', 'Social', 'https://www.tiktok.com/', 'tiktok.com', 2],
  ['linkedin', 'LinkedIn Company Page', 'Social', 'https://www.linkedin.com/company/', 'linkedin.com', 2],
  ['youtube', 'YouTube', 'Social', 'https://www.youtube.com/', 'youtube.com', 3],
  ['angi', 'Angi (Angie\'s List)', 'Home services', 'https://office.angi.com/', 'angi.com', 1],
  ['homeadvisor', 'HomeAdvisor', 'Home services', 'https://pro.homeadvisor.com/', 'homeadvisor.com', 2],
  ['thumbtack', 'Thumbtack', 'Home services', 'https://www.thumbtack.com/pro', 'thumbtack.com', 2],
  ['houzz', 'Houzz', 'Home services', 'https://www.houzz.com/pro', 'houzz.com', 2],
  ['porch', 'Porch', 'Home services', 'https://pro.porch.com/', 'porch.com', 2],
  ['buildzoom', 'BuildZoom', 'Home services', 'https://www.buildzoom.com/', 'buildzoom.com', 2],
  ['networx', 'Networx', 'Home services', 'https://www.networx.com/', 'networx.com', 3],
  ['bark', 'Bark', 'Home services', 'https://www.bark.com/', 'bark.com', 3],
  ['homeyou', 'HomeYou', 'Home services', 'https://www.homeyou.com/', 'homeyou.com', 3],
  ['craftjack', 'CraftJack', 'Home services', 'https://www.craftjack.com/', 'craftjack.com', 3],
  ['iicrc', 'IICRC Certified Firm locator', 'Restoration', 'https://www.iicrc.org/', 'iicrc.org', 1],
  ['restorationind', 'Restoration Industry Association', 'Restoration', 'https://www.restorationindustry.org/', 'restorationindustry.org', 2],
  ['gaf', 'GAF contractor directory', 'Roofing', 'https://www.gaf.com/', 'gaf.com', 2],
  ['owenscorning', 'Owens Corning contractor network', 'Roofing', 'https://www.owenscorning.com/', 'owenscorning.com', 2],
  ['certainteed', 'CertainTeed contractor locator', 'Roofing', 'https://www.certainteed.com/', 'certainteed.com', 3],
  ['yellowpages', 'YellowPages (YP)', 'Directory', 'https://adsolutions.yp.com/', 'yellowpages.com', 2],
  ['superpages', 'Superpages', 'Directory', 'https://www.superpages.com/', 'superpages.com', 3],
  ['manta', 'Manta', 'Directory', 'https://www.manta.com/', 'manta.com', 3],
  ['foursquare', 'Foursquare', 'Data aggregator', 'https://foursquare.com/', 'foursquare.com', 2],
  ['dataaxle', 'Data Axle (Infogroup)', 'Data aggregator', 'https://www.data-axle.com/', 'data-axle.com', 1],
  ['neustar', 'Neustar Localeze', 'Data aggregator', 'https://www.neustarlocaleze.biz/', 'neustarlocaleze.biz', 1],
  ['mapquest', 'MapQuest', 'Maps', 'https://www.mapquest.com/', 'mapquest.com', 3],
  ['hotfrog', 'Hotfrog', 'Directory', 'https://www.hotfrog.com/', 'hotfrog.com', 3],
  ['chamberofcommerce', 'ChamberofCommerce.com', 'Directory', 'https://www.chamberofcommerce.com/', 'chamberofcommerce.com', 3],
  ['bartlettchamber', 'Bartlett Area Chamber of Commerce', 'Local', 'https://www.bartlettchamber.org/', 'bartlettchamber.org', 1],
  ['memphischamber', 'Greater Memphis Chamber', 'Local', 'https://memphischamber.com/', 'memphischamber.com', 2],
  ['commercialappeal', 'Commercial Appeal local directory', 'Local', 'https://www.commercialappeal.com/', 'commercialappeal.com', 3],
  ['merchantcircle', 'MerchantCircle', 'Directory', 'https://www.merchantcircle.com/', 'merchantcircle.com', 3],
  ['cylex', 'Cylex', 'Directory', 'https://www.cylex.us.com/', 'cylex.us.com', 3],
  ['ezlocal', 'EZlocal', 'Directory', 'https://ezlocal.com/', 'ezlocal.com', 3],
  ['brownbook', 'Brownbook', 'Directory', 'https://www.brownbook.net/', 'brownbook.net', 3],
  ['showmelocal', 'ShowMeLocal', 'Directory', 'https://www.showmelocal.com/', 'showmelocal.com', 3],
  ['alignable', 'Alignable', 'Local', 'https://www.alignable.com/', 'alignable.com', 3],
  ['tnboard', 'TN Board for Licensing Contractors (license lookup)', 'Licensing', 'https://verify.tn.gov/', 'tn.gov', 1]
].map(function(x){ return { id: x[0], n: x[1], cat: x[2], url: x[3], dom: x[4], pri: x[5] }; });
function digits(v){ return s(v).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); }
function streetNo(a){ var m = /^\s*(\d{2,6})\b/.exec(s(a)); return m ? m[1] : ''; }
/* the NAP check of one listing. row = { url, name, address, phone, checkedAt, listed:false? }, addr = { current, next, switchOn },
   today = 'YYYY-MM-DD' (Central). → { state: ok | fix | soon | unchecked | missing, issues: [{ k, l, fix }], expect } */
function napCheck(row, addr, today){
  row = row || {}; addr = addr || {};
  var moved = !!(addr.next && addr.switchOn && s(today) >= addr.switchOn);
  var expect = moved ? s(addr.next) : s(addr.current), other = moved ? s(addr.current) : s(addr.next);
  var issues = [];
  if (row.listed === false || !s(row.url)) return { state: 'missing', issues: [{ k: 'missing', l: 'Not listed yet (or no link saved) — claim / create the listing.', fix: true }], expect: expect };
  if (!s(row.checkedAt) && !s(row.address) && !s(row.phone)) return { state: 'unchecked', issues: [{ k: 'unchecked', l: 'Not checked yet — open it and copy what it shows.', fix: false }], expect: expect };
  if (s(row.name) && !/gray\s*co/i.test(row.name)) issues.push({ k: 'name', l: 'The name shows “' + s(row.name) + '” — use “GrayCo Construction Services”.', fix: true });
  if (s(row.phone) && digits(row.phone) !== digits(PHONE)) issues.push({ k: 'phone', l: 'The phone shows ' + s(row.phone) + ' — use ' + PHONE + '.', fix: true });
  var a = s(row.address), no = streetNo(a), soon = false;
  if (a) {
    if (no && no === streetNo(expect) && /broadway/i.test(a)) { /* right */ }
    else if (no && other && no === streetNo(other) && /broadway/i.test(a)) {
      if (moved) issues.push({ k: 'address', l: 'Still shows ' + no + ' Broadway — change it to ' + expect.split(',')[0] + ' (we moved ' + addr.switchOn + ').', fix: true, move: true });
      else { issues.push({ k: 'address-soon', l: 'Shows ' + no + ' Broadway — that is the NEW address, live on ' + addr.switchOn + '. Until then: ' + expect.split(',')[0] + '.', fix: true, move: true }); }
    } else issues.push({ k: 'address', l: 'The address shows “' + a + '” — use ' + expect + '.', fix: true, move: /broadway/i.test(a) });
    if (!moved && addr.next && addr.switchOn && no === streetNo(expect)) { soon = true; issues.push({ k: 'move', l: 'Change to ' + s(addr.next).split(',')[0] + ' on ' + addr.switchOn + ' (the move).', fix: false, move: true }); }
  }
  var age = s(row.checkedAt) ? (Date.parse(s(today) + 'T12:00:00Z') - Date.parse(row.checkedAt)) / 864e5 : 999;
  if (age > 120) issues.push({ k: 'stale', l: 'Last checked ' + (s(row.checkedAt) ? Math.round(age) + ' days ago' : 'never') + ' — look again.', fix: false });
  var fix = issues.some(function(x){ return x.fix; });
  return { state: fix ? 'fix' : soon ? 'soon' : 'ok', issues: issues, expect: expect };
}

/* ── who approves marketing: the APPROVAL STAGE (owner, 22 Oct 2026) — data, never names ──
   cfg.main.apprStage = { stage: 1 | 2 | 3, since, flags: { price, insurance, customer }, known: ['kind:type', …] }
   1 "Admin checks everything" (default): every marketing draft waits for an admin.
   2 "Office approves": the office approves; admins get the Friday digest + the FLAGGED drafts only.
   3 "Autopilot": a template type an admin already approved posts by itself at its time, after a 24-hour veto window
     (the office gets a "posting tomorrow" list to pause or edit). Flagged drafts go to the office; negative review
     replies go to the office AND the admins. The CRM only SUGGESTS the next stage; a person moves it (logged). */
var ASTAGES = [
  { v: 1, l: 'Stage 1 — Admin checks everything', d: 'Every marketing draft (posts, Google Business posts, review replies, newsletter, door hangers, before/after) waits for an admin.' },
  { v: 2, l: 'Stage 2 — Office approves', d: 'The office approves. Admins get a Friday digest of what went out, plus anything flagged: a 1–3★ review reply, a post that mentions price, insurance or a customer, the monthly newsletter, any new template.' },
  { v: 3, l: 'Stage 3 — Autopilot', d: 'Template types an admin already approved post by themselves at their time, after a 24-hour veto window (the office gets a "posting tomorrow" list to pause or edit). Flagged drafts go to the office; negative review replies go to the office and the admins.' }
];
var CONTENT_KINDS = { social_post: 1, soc_week: 1, mkt_campaign: 1, mkt_neighbor: 1, review_reply: 1, mkt_addraft: 1 };
function stageCfg(c){
  var a = (c && c.apprStage) || {}, st = +a.stage;
  return { stage: st === 2 || st === 3 ? st : 1, since: s(a.since), flags: Object.assign({ price: true, insurance: true, customer: true }, a.flags || {}), known: arr(a.known) };
}
var PRICE_RE = /\$\s?\d|\bprices?\b|\bpricing\b|\bcosts?\b|\d+\s?% off|\bdiscount|\bcoupon|\bfinanc/i, INS_RE = /\binsurance\b|\bclaims?\b|\badjuster|\bdeductible/i;
function recText(rec){
  rec = rec || {}; var vs = rec.versions || {};
  return [rec.caption, rec.subject, rec.title, rec.body, rec.preheader, rec.approvedHtml, rec.reply, rec.text].concat(Object.keys(vs).map(function(n){ return allText(n, vs[n]); })).map(s).join('\n');
}
/* the template key of a draft: an admin's approval of one teaches stage 3 that this type is known */
function tplKeys(kind, rec, posts){
  rec = rec || {};
  if (kind === 'soc_week') return arr(posts).map(function(p){ return 'post:' + (p.socType || 'custom') + ':' + (p.socService || ''); });
  if (kind === 'social_post') return ['post:' + (rec.socType || rec.kind || (rec.autopilot ? 'auto' : 'custom')) + ':' + (rec.socService || '')];
  if (kind === 'mkt_campaign') return ['email:' + (rec.tpl || 'custom')];
  if (kind === 'mkt_neighbor') return ['neighbor:' + (rec.kind || 'door')];
  return [kind + ':' + (rec.tpl || rec.kind || 'custom')];
}
/* the flags of a draft. o = { rating (review replies), posts (a week's posts) } */
function flagsOf(kind, rec, sc, o){
  o = o || {}; sc = sc && sc.stage ? sc : stageCfg(sc); rec = rec || {};
  var out = [], txt = [recText(rec)].concat(arr(o.posts).map(recText)).join('\n'), all = [rec].concat(arr(o.posts));
  if (kind === 'review_reply' && (+o.rating || +rec.rating || 5) <= 3) out.push('negative-review');
  if (kind === 'mkt_addraft') out.push('ad-spend');   /* paid ads: never by itself, at any stage */
  if (sc.flags.price && PRICE_RE.test(txt)) out.push('price');
  if (sc.flags.insurance && INS_RE.test(txt)) out.push('insurance');
  if (sc.flags.customer && all.some(function(p){ return p && (p.nameOk || p.testimonialId || p.reviewId || p.kind === 'review' || p.socType === 'testimonial'); })) out.push('customer');
  if (kind === 'mkt_campaign' && (rec.newsletter || /newsletter|seasonal|monthly/i.test(s(rec.tpl) + ' ' + s(rec.title)) || rec.autopilot)) out.push('newsletter');
  if (kind !== 'review_reply' && tplKeys(kind, rec, o.posts).some(function(k){ return sc.known.indexOf(k) < 0; })) out.push('new-template');
  return out;
}
var FLAG_L = { 'negative-review': '1–3★ review reply', price: 'mentions a price', insurance: 'mentions insurance', customer: 'mentions a customer', newsletter: 'the monthly newsletter', 'new-template': 'a new template', 'ad-spend': 'paid ads (never automatic)' };
/* where a draft goes → { stage, flags, admin: admins may approve, office: the office may approve, notifyAdmins, auto: posts by itself after the veto, veto: hours } */
function route(sc, kind, rec, o){
  sc = sc && sc.stage ? sc : stageCfg(sc);
  if (!CONTENT_KINDS[kind]) return { stage: sc.stage, flags: [], admin: true, office: false, auto: false, notifyAdmins: false, veto: 0 };
  var f = flagsOf(kind, rec, sc, o), flagged = f.length > 0, neg = f.indexOf('negative-review') >= 0;
  if (sc.stage === 1) return { stage: 1, flags: f, admin: true, office: false, auto: false, notifyAdmins: false, veto: 0 };
  if (sc.stage === 2) return { stage: 2, flags: f, admin: true, office: !flagged, auto: false, notifyAdmins: flagged, veto: 0 };
  return { stage: 3, flags: f, admin: true, office: true, auto: !flagged && kind !== 'review_reply', notifyAdmins: neg, veto: !flagged && kind !== 'review_reply' ? 24 : 0 };
}
/* the graduation hint: 14 days at this stage and no admin edited a marketing draft in them → suggest the next stage.
   decided = [{ at, adminEdit }] (marketing approvals decided since the stage began) */
function stageHint(sc, decided, nowMs){
  sc = sc && sc.stage ? sc : stageCfg(sc); nowMs = nowMs || Date.now();
  if (sc.stage >= 3) return null;
  var since = Date.parse(sc.since || 0) || 0;
  if (!since || nowMs - since < 14 * 864e5) return null;
  var from = nowMs - 14 * 864e5, mine = arr(decided).filter(function(x){ return x && Date.parse(x.at || 0) >= from; });
  if (mine.length < 3 || mine.some(function(x){ return x.adminEdit; })) return null;
  return { next: sc.stage + 1, label: ASTAGES[sc.stage].l, why: mine.length + ' marketing drafts in the last 14 days and no admin changed any of them.' };
}

/* ── PAID ADS: restoration only (owner, 22 Oct 2026) — separate from the organic mix ──
   cfg.main.adsFocus (default Restoration 100). Everything the CRM drafts or suggests for paid ads — Google Ads campaign /
   ad-group drafts, keywords, boosted-post suggestions, the Local Services Ads job types, the ad copy writer — uses only
   the services with a weight. The CRM never spends money: a draft goes to ✅ Approvals (kind mkt_addraft, never
   automatic at any stage); approved, it is a "build it" pack (Google Ads Editor CSV) + a To-Do. */
var ADS_FOCUS = { restoration: 100, roofing: 0, remodel: 0, commercial: 0 };
function adsFocusOf(setting){
  var w = {}, tot = 0;
  SERVICES.forEach(function(x){ var n = setting && setting[x.v] != null ? +setting[x.v] : ADS_FOCUS[x.v]; w[x.v] = isFinite(n) && n > 0 ? n : 0; tot += w[x.v]; });
  if (!tot) { w = Object.assign({}, ADS_FOCUS); tot = 100; }
  var out = {}; SERVICES.forEach(function(x){ out[x.v] = Math.round(w[x.v] / tot * 1000) / 10; });
  return out;
}
/* may a paid ad be about this? (a service name, a job, a lead) */
function adsAllowed(setting, what){ var svc = typeof what === 'string' ? serviceOf({ service: what }) : serviceOf(what); return !!svc && adsFocusOf(setting)[svc] > 0; }
/* water / fire / storm of a restoration job, lead, campaign or post ('' when it is not restoration) */
function restSubOf(x){
  if (!x) return '';
  if (x.socSub) return x.socSub;
  var t = low([x.name, x.title, x.type, x.jobType, x.service, x.scope, x.campaign, x.utmCampaign, x.attrib && x.attrib.utm_campaign].join(' '));
  if (/fire|smoke|soot/.test(t)) return 'fire';
  if (/water|flood|pipe|leak|mitigat|dry|mold/.test(t)) return 'water';
  if (/storm|hail|wind|tarp|tree/.test(t)) return 'storm';
  return serviceOf(x) === 'restoration' ? 'storm' : '';
}
var AD_TERMS = {
  water: ['water damage restoration', 'emergency water removal', 'flood cleanup', 'burst pipe'],
  fire: ['fire damage restoration', 'smoke damage cleanup', 'soot removal'],
  storm: ['storm damage repair', 'emergency roof tarp', 'hail damage']
};
var AD_CITIES = ['memphis', 'bartlett', 'germantown', 'collierville', 'cordova', 'arlington', 'lakeland'];
var NEGATIVES = ['remodel', 'remodeling', 'kitchen', 'bathroom', 'addition', 'commercial bid', 'jobs', 'careers', 'diy', 'how to', 'insurance agent', 'free'];
function cap(c){ return s(c).split(' ').map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
/* every term paired with each city and "near me" */
function adKeywords(sub, cities){
  var subs = sub ? [sub] : RSUBS, cs = arr(cities).length ? cities : AD_CITIES, out = [];
  subs.forEach(function(x){ AD_TERMS[x].forEach(function(t){ cs.forEach(function(c){ out.push({ sub: x, kw: t + ' ' + low(c) }); }); out.push({ sub: x, kw: t + ' near me' }); }); });
  return out;
}
var AD_LIMITS = { headline: 30, description: 90 };
function adCopy(sub, city){
  var c = cap(city || 'Memphis'), w = ({ water: 'Water Damage', fire: 'Fire Damage', storm: 'Storm Damage' })[sub] || 'Restoration';
  var H = ['24/7 ' + w + ' Help', w + ' ' + c, ({ water: 'Emergency Water Removal', fire: 'Smoke & Soot Cleanup', storm: 'Emergency Roof Tarping' })[sub], 'We Restore and Rebuild', 'Unlimited Licensed GC', 'Insurance Claim Help', 'Call (901) 585-0944', 'Local ' + c + ' Restoration'];
  var Dd = ['Unlimited licensed general contractor — we restore and rebuild. 24/7 emergency response.',
    ({ water: 'Water extraction, drying and the rebuild — one company. Call us 24/7.', fire: 'Board-up, smoke and soot cleanup, then the rebuild — one company. 24/7.', storm: 'Emergency tarp, storm damage repair and the rebuild — one company. 24/7.' })[sub] || 'Mitigation to full rebuild — one company. Call us 24/7.',
    'We help with your insurance claim from the first call to the final repair.',
    'Serving ' + c + ' and the Mid-South. Call (901) 585-0944 any time, day or night.'];
  var fit = function(l, n){ return l.filter(Boolean).filter(function(x, i, a){ return x.length <= n && a.indexOf(x) === i; }); };
  return { sub: sub, city: c, headlines: fit(H, AD_LIMITS.headline), descriptions: fit(Dd, AD_LIMITS.description),
    finalUrl: restPage(sub, city) + '?utm_source=google&utm_medium=cpc&utm_campaign=ads-restoration-' + sub + '&utm_content=' + slugCity(city || 'memphis') };
}
/* Google Ads drafts: one campaign per restoration type (water / fire / storm), one ad group per city — only when restoration has a weight */
function campaignDrafts(setting){
  if (!(adsFocusOf(setting).restoration > 0)) return [];
  return RSUBS.map(function(sub){
    return { id: 'gads_' + sub, kind: 'campaign', platform: 'google', sub: sub, service: 'restoration', name: 'GrayCo — ' + cap(sub) + ' damage restoration (search)', negatives: NEGATIVES.slice(),
      adGroups: AD_CITIES.map(function(c){ var a = adCopy(sub, c); return { name: cap(sub) + ' — ' + cap(c), city: c, keywords: AD_TERMS[sub].map(function(t){ return t + ' ' + c; }).concat(AD_TERMS[sub].map(function(t){ return t + ' near me'; })), finalUrl: a.finalUrl, headlines: a.headlines, descriptions: a.descriptions }; }) };
  });
}
/* the Google Ads Editor CSV of a campaign draft (keywords, negatives, ads) — built by a person after approval */
function draftCsv(d){
  var q = function(v){ return '"' + s(v).replace(/"/g, '""') + '"'; }, rows = [['Campaign', 'Ad group', 'Keyword', 'Criterion type', 'Final URL', 'Headline 1', 'Headline 2', 'Headline 3', 'Description 1', 'Description 2'].map(q).join(',')];
  arr(d && d.adGroups).forEach(function(g){
    g.keywords.forEach(function(k){ rows.push([d.name, g.name, k, 'Phrase', '', '', '', '', '', ''].map(q).join(',')); });
    rows.push([d.name, g.name, '', '', g.finalUrl, g.headlines[0], g.headlines[1], g.headlines[2], g.descriptions[0], g.descriptions[1]].map(q).join(','));
  });
  arr(d && d.negatives).forEach(function(n){ rows.push([d.name, '', n, 'Negative phrase', '', '', '', '', '', ''].map(q).join(',')); });
  return rows.join('\n');
}
/* Local Services Ads job types: on only for the services with an ads weight */
var LSA_TYPES = [
  { t: 'Water damage restoration', svc: 'restoration' }, { t: 'Fire damage restoration', svc: 'restoration' }, { t: 'Storm damage restoration', svc: 'restoration' },
  { t: 'Emergency roof tarping', svc: 'restoration' }, { t: 'Mold remediation', svc: 'restoration' }, { t: 'Roof repair', svc: 'roofing' }, { t: 'Roof replacement', svc: 'roofing' },
  { t: 'Kitchen remodeling', svc: 'remodel' }, { t: 'Bathroom remodeling', svc: 'remodel' }, { t: 'Home additions', svc: 'remodel' }, { t: 'Commercial construction', svc: 'commercial' }
];
function lsaChecklist(setting){ var f = adsFocusOf(setting); return LSA_TYPES.map(function(x){ return { t: x.t, svc: x.svc, on: f[x.svc] > 0 }; }); }
/* "boost this": only for a restoration post that went out, and only while restoration has an ads weight */
function boostable(post, setting){
  if (!post || post.del || !/^(posted|approved)$/.test(s(post.status))) return false;
  var svc = post.socService || serviceOf({ title: post.title, scope: post.caption });
  return svc === 'restoration' && adsFocusOf(setting).restoration > 0;
}
function boostDraft(post, setting){
  if (!boostable(post, setting)) return null;
  var sub = post.socSub || restSubOf(post) || 'water';
  return { id: 'boost_' + s(post.id), kind: 'boost', platform: 'meta', service: 'restoration', sub: sub, postId: s(post.id), title: 'Boost: ' + s(post.title),
    audience: 'People within 15 miles of Bartlett, TN (Housing special ad category: no age / gender / ZIP targeting)', finalUrl: restPage(sub, 'Memphis') + '?utm_source=facebook&utm_medium=paid_social&utm_campaign=boost-restoration-' + sub,
    note: 'Suggested: 7 days. The amount is set by the person who approves it in Ads Manager — the CRM never spends.' };
}
function paidLead(l){ var a = (l && l.attrib) || {}, m = low(a.utm_medium), src = low(a.utm_source); return !!(a.gclid || a.fbclid || /cpc|ppc|paid|ads?$/.test(m) || /ads/i.test(s(l && l.mkSource)) || /lsa|local services/.test(low([l && l.source, l && l.mkSource, src].join(' ')))); }
/* spend and leads by restoration type; cost per restoration lead */
function adsReport(camps, leads, nowMs, days){
  nowMs = nowMs || Date.now(); days = days || 30;
  var out = { subs: {}, other: { spend: 0, leads: 0 }, total: { spend: 0, leads: 0, cpl: null } };
  RSUBS.forEach(function(x){ out.subs[x] = { spend: 0, clicks: 0, leads: 0, paidLeads: 0, cpl: null }; });
  arr(camps).forEach(function(c){ if (!c || c.del) return; var sub = restSubOf({ name: c.name, campaign: c.campaignId, socSub: c.sub }), sp = +c.spend30 || 0;
    if (sub) { out.subs[sub].spend += sp; out.subs[sub].clicks += +c.clicks30 || 0; } else out.other.spend += sp; });
  var since = nowMs - days * 864e5;
  arr(leads).forEach(function(l){ if (!l || l.deleted || (Date.parse(l.createdAt || l.created || 0) || 0) < since) return; var sub = serviceOf(l) === 'restoration' ? restSubOf(l) : '';
    if (sub) { out.subs[sub].leads++; if (paidLead(l)) out.subs[sub].paidLeads++; } else if (paidLead(l)) out.other.leads++; });
  RSUBS.forEach(function(x){ var o = out.subs[x]; o.cpl = o.paidLeads ? Math.round(o.spend / o.paidLeads) : null; out.total.spend += o.spend; out.total.leads += o.paidLeads; });
  out.total.cpl = out.total.leads ? Math.round(out.total.spend / out.total.leads) : null;
  return out;
}
/* the approval preview of an ads draft */
function addraftHtml(d){
  d = d || {};
  if (d.kind === 'boost') return '<p><b>Boost a restoration post</b> on Facebook / Instagram — ' + MC.esc(d.title) + '</p><p>Audience: ' + MC.esc(d.audience) + '<br>Landing page: ' + MC.esc(d.finalUrl) + '</p><p>' + MC.esc(d.note) + '</p>';
  return '<p><b>' + MC.esc(d.name) + '</b> — a Google Ads search campaign DRAFT (restoration only). Nothing is created or spent by the CRM: approved, it becomes a Google Ads Editor file and a To-Do.</p>' +
    arr(d.adGroups).map(function(g){ return '<div style="margin:6px 0"><b>' + MC.esc(g.name) + '</b> → ' + MC.esc(g.finalUrl) + '<br><i>Keywords:</i> ' + MC.esc(g.keywords.join(', ')) + '<br><i>Headlines:</i> ' + MC.esc(g.headlines.join(' | ')) + '<br><i>Descriptions:</i> ' + MC.esc(g.descriptions.join(' | ')) + '</div>'; }).join('') +
    '<p><i>Negative keywords:</i> ' + MC.esc(arr(d.negatives).join(', ')) + '</p>';
}

/* ── reporting: posts / week / platform, engagement, leads and jobs by platform (UTM) and by service vs the focus ── */
function leadPlat(l){
  var a = (l && l.attrib) || {}, src = low(a.utm_source || l.utmSource || ''), t = low([src, l && l.mkSource, l && l.source, l && l.howHeard].join(' '));
  if (/tiktok/.test(t)) return 'tiktok';
  if (/linkedin/.test(t)) return 'linkedin';
  if (/instagram|^ig$/.test(src) || /instagram/.test(t)) return 'instagram';
  if (/gbp|gmb|business.?profile|google business/.test(t)) return 'gbp';
  if (/facebook|^fb$/.test(src) || /facebook/.test(t)) return 'facebook';
  return '';
}
function report(posts, leads, projects, nowMs, weeks, focus){
  weeks = weeks || 8; nowMs = nowMs || Date.now();
  var wkKeys = []; for (var i = weeks - 1; i >= 0; i--) wkKeys.push(MC.weekKey(nowMs - i * 7 * 864e5));
  var out = { weeks: wkKeys.map(function(k){ var o = { wk: k, total: 0 }; PLAT_IDS.forEach(function(v){ o[v] = 0; }); return o; }), plats: {}, services: {}, focus: focusOf(focus) };
  PLAT_IDS.forEach(function(v){ out.plats[v] = { posts: 0, likes: 0, comments: 0, shares: 0, reach: 0, clicks: 0, views: 0, leads: 0, jobs: 0, revenue: 0, links: [] }; });
  arr(posts).forEach(function(p){
    if (!p || p.del) return;
    var r = p.results || {}, ins = p.insights || {}, at = p.postedAt || p.scheduleAt;
    PLAT_IDS.forEach(function(v){
      var x = r[v]; if (!x || !(x.ok || x.manualDone)) return;
      var w = MC.weekKey(Date.parse(x.at || at) || nowMs), row = out.weeks.filter(function(q){ return q.wk === w; })[0];
      if (row) { row[v]++; row.total++; }
      var P = out.plats[v]; P.posts++; if (x.url) P.links.push({ url: x.url, title: s(p.title), at: s(x.at || at) });
      var e = ins[v] || {}; ['likes', 'comments', 'shares', 'reach', 'clicks', 'views'].forEach(function(k){ P[k] += +e[k] || 0; });
    });
  });
  var byLead = {};
  arr(projects).forEach(function(pr){ if (pr && (pr.leadId || pr.fromLeadId)) byLead[s(pr.leadId || pr.fromLeadId)] = pr; });
  var since = nowMs - weeks * 7 * 864e5, months = {};
  SERVICES.forEach(function(x){ out.services[x.v] = { leads: 0, jobs: 0, share: 0, target: out.focus[x.v], social: 0 }; });
  var svcTotal = 0;
  arr(leads).forEach(function(l){
    if (!l || l.deleted) return;
    var at = Date.parse(l.createdAt || l.created || l.date || 0) || 0;
    var svc = serviceOf(l);
    if (svc && at >= nowMs - 180 * 864e5) { var mk = new Date(at).toISOString().slice(0, 7); months[mk] = months[mk] || { m: mk, total: 0 }; months[mk].total++; months[mk][svc] = (months[mk][svc] || 0) + 1; }
    if (at < since) return;
    var pl = leadPlat(l), pr = byLead[s(l.id)] || null, won = !!(pr && !/^(lost|cancel|dead)/i.test(s(pr.status)));
    if (pl) { out.plats[pl].leads++; if (won) { out.plats[pl].jobs++; out.plats[pl].revenue += +(pr.contract || pr.contractAmount || pr.value || 0) || 0; } }
    if (svc) { svcTotal++; out.services[svc].leads++; if (won) out.services[svc].jobs++; if (pl) out.services[svc].social++; }
  });
  SERVICES.forEach(function(x){ out.services[x.v].share = svcTotal ? Math.round(out.services[x.v].leads / svcTotal * 1000) / 10 : 0; });
  out.months = Object.keys(months).sort().map(function(k){ return months[k]; });
  out.svcTotal = svcTotal;
  return out;
}

return {
  PLATS: PLATS, PLAT_IDS: PLAT_IDS, plat: plat, SERVICES: SERVICES, FOCUS: FOCUS, focusOf: focusOf, serviceOf: serviceOf, allocate: allocate,
  TYPES: TYPES, typeLabel: typeLabel, planMix: planMix, weekNo: weekNo, REST_TIPS: REST_TIPS, SEASON: SEASON, CTA247: CTA247, SVC: SVC,
  POSITION: POSITION, SITE_PAGES: SITE_PAGES, cityPage: cityPage, sitePageOk: sitePageOk, restPage: restPage, pageFor: pageFor, withUtm: withUtm, subFor: subFor, nextSub: nextSub, RSUBS: RSUBS, REST_CITIES: REST_CITIES, slugCity: slugCity,
  templates: templates, captionFor: captionFor, allText: allText, problems: problems, protect: protect, protectVersion: protectVersion, postProblems: postProblems,
  distinct: distinct, normalize: normalize, aiPrompt: aiPrompt,
  ASTAGES: ASTAGES, CONTENT_KINDS: CONTENT_KINDS, stageCfg: stageCfg, flagsOf: flagsOf, FLAG_L: FLAG_L, tplKeys: tplKeys, route: route, stageHint: stageHint,
  ADS_FOCUS: ADS_FOCUS, adsFocusOf: adsFocusOf, adsAllowed: adsAllowed, restSubOf: restSubOf, AD_TERMS: AD_TERMS, AD_CITIES: AD_CITIES, NEGATIVES: NEGATIVES, adKeywords: adKeywords, AD_LIMITS: AD_LIMITS, adCopy: adCopy,
  campaignDrafts: campaignDrafts, draftCsv: draftCsv, LSA_TYPES: LSA_TYPES, lsaChecklist: lsaChecklist, boostable: boostable, boostDraft: boostDraft, paidLead: paidLead, adsReport: adsReport, addraftHtml: addraftHtml,
  LISTINGS: LISTINGS, napCheck: napCheck, digits: digits, leadPlat: leadPlat, report: report
};
});
