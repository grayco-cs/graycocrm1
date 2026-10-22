/* GrayCo Marketing — the shared content and rules (patch MKT). ONE copy: the CRM's 📣 Marketing tab (pasted into
   tail_MKT.js by build_MKT.sh) and the server (_lib/mkt.js, mkt-scheduled.js) use exactly the same templates,
   audiences, safety checks and posting times. Pure functions: no network, no DOM.

   Rules kept here (owner):
   * Branding everywhere: logo, the company address (brand.js companyAddress(), patch ADDR2), (901) 585-0944, the TN / AR / MS licenses.
   * Never a customer's address in anything public: guard() refuses house numbers + street, the job's own address
     and ZIP+street combos; scrub() takes them out of a caption (the street NAME alone is allowed on a door hanger
     and a "we just finished a job near you" note — the owner approved "We just replaced a roof on Elm St").
   * Never an insurance carrier's name (guard() refuses, scrub() takes it out).
   * Fair-housing: no targeting by a protected trait (mkcalc.PROTECTED is checked too when present). */
(function(root, factory){
  var C = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = C;
  if (root && typeof root === 'object' && typeof root.document !== 'undefined') root.__gcMktContent = C;
})(typeof self !== 'undefined' ? self : this, function(){
'use strict';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ── the brand ───────────────────────────────────────────────────────────────────────────────── */
var BRAND = {
  name: 'GrayCo Construction Services',
  short: 'GrayCo',
  get address(){ return require('./brand.js').companyAddress(); },   /* patch ADDR2 */
  phone: '(901) 585-0944',
  tel: '+19015850944',
  web: 'https://grayco-cs.com',
  email: 'office@grayco-cs.com',
  news: 'news@grayco-cs.com',
  logo: 'https://crm.grayco-cs.com/portal-logo.png',   /* the same logo as _lib/brand.js (patch AUT2) */
  licenses: 'TN #85034 BCB · AR #0486990627 · MS #27769',
  licenseLine: 'Licensed General Contractor — Tennessee #85034 BCB · Arkansas #0486990627 · Mississippi #27769',
  navy: '#1E2060', navy2: '#0F1D2F', gold: '#D4A017', ink: '#14202E', soft: '#F5F7FB',
  reviewLink: 'https://share.google/quDuhdlL0ckxPLLY3',   /* _lib/brand.js reviewUrl */
  areas: 'Bartlett, Memphis, Germantown, Collierville, Cordova, Arlington, Lakeland and DeSoto County',
  hashtags: '#GrayCo #MemphisRoofing #BartlettTN #MidSouth'
};

/* ── safety: addresses and insurance carriers never go public ─────────────────────────────────── */
var CARRIERS = ['state farm', 'allstate', 'usaa', 'farmers', 'liberty mutual', 'nationwide', 'progressive', 'travelers', 'erie', 'american family',
  'shelter insurance', 'auto-owners', 'auto owners', 'tennessee farmers', 'farm bureau', 'chubb', 'geico', 'the hartford', 'hartford', 'safeco', 'metlife',
  'homesite', 'citizens property', 'amica', 'kemper', 'country financial', 'grange', 'cincinnati insurance', 'westfield', 'encompass', 'foremost',
  'assurant', 'american modern', 'universal property', 'heritage insurance', 'openly', 'hippo', 'lemonade', 'stillwater', 'mercury insurance', 'esurance',
  'alfa insurance', 'southern farm bureau', 'mississippi farm bureau', 'aig', 'zurich', 'cna insurance', 'berkshire hathaway', 'the general', 'bristol west'];
var CARRIER_RE = new RegExp('\\b(' + CARRIERS.map(function(c){ return c.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'); }).join('|') + ')\\b', 'i');
var STREET_WORDS = 'st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|cv|cove|pl|place|pkwy|parkway|cir|circle|way|ter|terrace|trl|trail|hwy|highway|loop|run|pass|xing|crossing|sq|square';
var HOUSE_RE = new RegExp('\\b\\d{2,6}[A-Za-z]?\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Za-z0-9\'.-]+\\s+){0,4}(?:' + STREET_WORDS + ')\\b\\.?', 'i');
var EMAIL_IN_TEXT = /[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}/i;
/* problems with text going public. extra = the job addresses / names this text must not show */
function guard(text, extra){
  var t = s(text), out = [];
  if (!t) return out;
  var m = HOUSE_RE.exec(t);
  if (m && !/^(4007|4014) broadway/.test(low(m[0])) && low(m[0]).indexOf('12060 donelson') < 0) out.push({ k: 'address', l: 'Shows a street address (“' + m[0] + '”). Customer addresses never go public — say the street name or the neighborhood only.' });
  var c = CARRIER_RE.exec(t);
  if (c) out.push({ k: 'carrier', l: 'Names an insurance company (“' + c[0] + '”). We never name carriers — say “your insurance company”.' });
  arr(extra).forEach(function(x){
    var a = s(x); if (a.length < 6) return;
    var first = a.split(',')[0].trim();
    if (/^\d/.test(first) && low(t).indexOf(low(first)) >= 0) out.push({ k: 'job-address', l: 'Shows the job’s address (“' + first + '”).' });
    else { var st0 = streetOnly(a); if (st0.length >= 6 && low(t).indexOf(low(st0)) >= 0) out.push({ k: 'job-street', l: 'Names the customer’s street (“' + st0 + '”) — in a public post say the city or neighborhood.' }); }
  });
  var em = EMAIL_IN_TEXT.exec(t);
  if (em && !/@grayco-cs\.com$/i.test(em[0])) out.push({ k: 'email', l: 'Shows an e-mail address (“' + em[0] + '”).' });
  var ph = t.match(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || [];
  ph.forEach(function(p){ if (p.replace(/\D/g, '').slice(-10) !== '9015850944') out.push({ k: 'phone', l: 'Shows a phone number that is not GrayCo’s (' + p + ').' }); });
  return out;
}
/* take addresses and carriers out of a caption (the street name stays; house numbers go) */
function scrub(text, extra){
  var t = String(text == null ? '' : text);
  arr(extra).forEach(function(x){ var a = s(x); if (a.length < 6) return; var first = a.split(',')[0].trim(); if (!first) return;
    var street = first.replace(/^\s*\d+[A-Za-z]?\s+/, ''), city = s(a.split(',')[1]).replace(/\b(TN|MS|AR)\b.*$/i, '').trim() || 'the neighborhood';
    t = t.split(a).join(city).split(first).join(city);
    if (street.length >= 6) t = t.replace(new RegExp(street.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), city); });
  var re = new RegExp(HOUSE_RE.source, 'gi');
  t = t.replace(re, function(m){ if (/^(4007 broadway|4014 broadway|12060 donelson)/i.test(m)) return m; return m.replace(/^\s*\d+[A-Za-z]?\s+/, ''); });
  t = t.replace(new RegExp(CARRIER_RE.source, 'gi'), 'the insurance company');
  return t;
}
function streetOnly(addr){ var a = s(addr).split(',')[0]; return a.replace(/^\s*\d+[A-Za-z]?\s+/, '').trim(); }

/* ── posting times (Central time) ─────────────────────────────────────────────────────────────── */
var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var DEFAULT_TIMES = [{ d: 2, h: 11, m: 0 }, { d: 4, h: 11, m: 0 }, { d: 6, h: 11, m: 0 }];   /* Tue / Thu / Sat 11:00 AM CT */
function ctParts(ms){
  try {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
    var o = {}; f.formatToParts(new Date(ms)).forEach(function(p){ o[p.type] = p.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, wd: DAYS.indexOf(o.weekday) };
  } catch (e) { var d = new Date(ms - 5 * 3600e3); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() }; }
}
/* the UTC ms of a Central wall-clock time */
function ctToMs(y, mo, d, h, mi){
  var guess = Date.UTC(y, mo - 1, d, h + 5, mi || 0);
  for (var i = 0; i < 3; i++) { var p = ctParts(guess); var diff = (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Date.UTC(y, mo - 1, d, h, mi || 0)); if (!diff) break; guess -= diff; }
  return guess;
}
/* the next n posting slots after `fromMs` (times = [{d,h,m}] in CT) */
function nextSlots(fromMs, n, times){
  times = arr(times).length ? times : DEFAULT_TIMES;
  var out = [], p = ctParts(fromMs);
  for (var day = 0; day < 21 && out.length < n; day++) {
    var base = Date.UTC(p.y, p.mo - 1, p.d + day, 12), q = new Date(base);
    var wd = q.getUTCDay();
    times.filter(function(t){ return +t.d === wd; }).sort(function(a, b){ return a.h - b.h || (a.m || 0) - (b.m || 0); }).forEach(function(t){
      var ms = ctToMs(q.getUTCFullYear(), q.getUTCMonth() + 1, q.getUTCDate(), +t.h, +t.m || 0);
      if (ms > fromMs + 60e3 && out.length < n) out.push(new Date(ms).toISOString());
    });
  }
  return out;
}
function ctLabel(iso){
  if (!iso) return '';
  var p = ctParts(Date.parse(iso)); var h = p.h % 12 || 12;
  return DAYS[p.wd] + ' ' + p.mo + '/' + p.d + ' ' + h + ':' + ('0' + p.mi).slice(-2) + (p.h < 12 ? ' AM' : ' PM') + ' CT';
}
function weekKey(ms){ var p = ctParts(ms); var d = new Date(Date.UTC(p.y, p.mo - 1, p.d)); var wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd); return d.toISOString().slice(0, 10); }
function monthKey(ms){ var p = ctParts(ms); return p.y + '-' + ('0' + p.mo).slice(-2); }

/* ── branded e-mail ────────────────────────────────────────────────────────────────────────────── */
function emailShell(o){
  o = o || {};
  var cta = o.cta && o.cta.url ? '<p style="text-align:center;margin:26px 0 8px"><a href="' + esc(o.cta.url) + '" style="background:' + BRAND.gold + ';color:' + BRAND.navy2 + ';text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:8px;display:inline-block;font-size:16px">' + esc(o.cta.label || 'Learn more') + '</a></p>' : '';
  /* data-gc-shell: _lib/brand.js (patch AUT2) sees it is already branded and does not wrap it a second time */
  return '<div data-gc-shell="mkt" style="background:' + BRAND.soft + ';padding:18px 8px;font-family:Arial,Helvetica,sans-serif">' +
    (o.preheader ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(o.preheader) + '</div>' : '') +
    '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #dce3ee">' +
    '<div style="background:' + BRAND.navy2 + ';padding:18px 22px;text-align:center"><img src="' + BRAND.logo + '" alt="GrayCo Construction Services" width="170" style="max-width:170px;height:auto;border-radius:6px;background:#fff;padding:4px"></div>' +
    '<div style="height:4px;background:' + BRAND.gold + '"></div>' +
    '<div style="padding:24px 26px;color:' + BRAND.ink + ';font-size:15px;line-height:1.6">' +
    (o.title ? '<h1 style="font-size:22px;color:' + BRAND.navy + ';margin:0 0 14px">' + esc(o.title) + '</h1>' : '') +
    (o.photo ? '<img src="' + esc(o.photo) + '" alt="" style="width:100%;border-radius:8px;margin:0 0 14px">' : '') +
    s(o.bodyHtml) + cta +
    '<p style="margin:22px 0 0">— The GrayCo team<br><a href="tel:' + BRAND.tel + '" style="color:' + BRAND.navy + ';font-weight:bold;text-decoration:none">' + BRAND.phone + '</a> · <a href="' + BRAND.web + '" style="color:' + BRAND.navy + '">grayco-cs.com</a></p>' +
    '</div>' +
    '<div style="background:' + BRAND.navy2 + ';color:#c9d3e3;font-size:11.5px;line-height:1.6;padding:14px 20px;text-align:center">' + esc(BRAND.name) + ' · ' + esc(BRAND.address) + ' · ' + esc(BRAND.phone) + '<br>' + esc(BRAND.licenseLine) + '</div>' +
    '</div></div>';
}

/* ── the seasonal e-mail library (news@, every one goes through approvals) ───────────────────── */
/* tokens: {{first_name}} {{city}} {{zip}} {{street}} {{review_link}} {{year}} {{years}} {{job_type}} {{tips}} {{event}} */
function P(t){ return '<p style="margin:0 0 12px">' + t + '</p>'; }
function UL(items){ return '<ul style="margin:0 0 14px;padding-left:20px">' + items.map(function(i){ return '<li style="margin:0 0 6px">' + i + '</li>'; }).join('') + '</ul>'; }
var TEMPLATES = [
  { id: 'spring_storm', ic: '🌩', name: 'Spring storm check', months: [3, 4, 5], audience: { type: 'all' },
    subject: 'Spring storms are here — a free roof check from GrayCo', preheader: 'Hail and wind season in the Mid-South: 5 minutes now saves a leak later.',
    title: 'Is your roof ready for storm season?',
    body: P('Hi {{first_name}},') + P('Spring is the Mid-South’s hail and wind season. Small damage — a lifted shingle, a dented vent, a cracked boot — rarely leaks right away, but it shortens your roof’s life and can turn into a ceiling stain by summer.') +
      P('<b>What we check, free:</b>') + UL(['Shingles and flashing after hail or high wind', 'Pipe boots, vents and skylights', 'Gutters and downspouts (water going where it should)', 'Attic signs of a leak']) +
      P('If we find storm damage, we document it with photos and help you through your insurance claim from start to finish.'),
    cta: { label: 'Book my free roof check', url: 'https://grayco-cs.com/?utm_source=news&utm_medium=email&utm_campaign=spring_storm' } },
  { id: 'summer_attic', ic: '☀️', name: 'Summer heat / attic ventilation', months: [6, 7, 8], audience: { type: 'all' },
    subject: 'Beat the Memphis heat: is your attic cooking your roof?', preheader: 'Good attic ventilation lowers cooling bills and protects your shingles.',
    title: 'Summer tip: let your attic breathe',
    body: P('Hi {{first_name}},') + P('On a 95° Memphis afternoon an attic can pass 150°. Without good ventilation that heat bakes your shingles from below, pushes your A/C harder and can void some shingle warranties.') +
      UL(['Ridge vents and soffit vents should work as a pair', 'Insulation should not block the soffits', 'Bathroom fans should vent outside — not into the attic']) +
      P('We’ll take a look while we’re in your area — no charge, no pressure.'),
    cta: { label: 'Ask about an attic check', url: 'https://grayco-cs.com/?utm_source=news&utm_medium=email&utm_campaign=summer_attic' } },
  { id: 'fall_gutters', ic: '🍂', name: 'Fall gutters', months: [9, 10, 11], audience: { type: 'all' },
    subject: 'Leaves are falling — are your gutters ready?', preheader: 'Clogged gutters are the #1 cause of fascia rot and winter ice backups.',
    title: 'Fall checklist: gutters, roof, done',
    body: P('Hi {{first_name}},') + P('Before the leaves come down for good, a quick fall check keeps water off your fascia, foundation and roof deck all winter.') +
      UL(['Clean gutters and downspouts (or add gutter guards)', 'Re-seal flashing around chimneys and vents', 'Replace missing or cracked shingles before freeze season', 'Trim branches that touch the roof']) +
      P('Want us to handle it? Reply to this e-mail or call — we’ll get you on the schedule before the holidays.'),
    cta: { label: 'Schedule a fall roof check', url: 'https://grayco-cs.com/?utm_source=news&utm_medium=email&utm_campaign=fall_gutters' } },
  { id: 'winter_ice', ic: '❄️', name: 'Winter ice dams & frozen pipes', months: [12, 1, 2], audience: { type: 'all' },
    subject: 'Freeze warning: protect your home from ice and water damage', preheader: 'Ice backups and burst pipes — what to watch for this winter.',
    title: 'Winter is hard on homes. We’re here if it bites.',
    body: P('Hi {{first_name}},') + UL(['Keep gutters clear so melting ice can drain', 'Let faucets drip on nights below 20°', 'Know where your main water shut-off is', 'Look for ceiling stains after an ice storm']) +
      P('If water gets in, call us right away — GrayCo does emergency water mitigation and the full repair, and we work with your insurance company for you.'),
    cta: { label: 'Save our number', url: 'tel:+19015850944' } },
  { id: 'holiday_thanks', ic: '🎁', name: 'Holiday thank-you', months: [11, 12], audience: { type: 'all' },
    subject: 'Thank you from all of us at GrayCo', preheader: 'From our family to yours — happy holidays.',
    title: 'Thank you for a great {{year}}',
    body: P('Hi {{first_name}},') + P('From the whole GrayCo crew: thank you for trusting us with your home this year. Every referral, review and kind word means the world to a local company like ours.') +
      P('If we helped you, a quick Google review helps your neighbors find a contractor they can trust:'),
    cta: { label: 'Leave a quick review', url: '{{review_link}}' } },
  { id: 'hail_alert', ic: '🧊', name: 'Hail-storm alert (affected ZIPs)', months: [], audience: { type: 'zips', zips: [] }, storm: true,
    subject: 'Hail was reported near {{city}} — free roof inspection', preheader: 'Hail damage is easy to miss from the ground. We’ll check it free.',
    title: 'Hail hit your area. Let us take a look — free.',
    body: P('Hi {{first_name}},') + P('The National Weather Service reported hail near {{city}} ({{zip}}). Hail damage usually can’t be seen from the ground, and most insurance policies have a time limit to file a claim.') +
      UL(['Free, no-pressure roof inspection with photos', 'If there is damage, we help you file and meet the adjuster', 'Local, licensed and insured — right here in Bartlett']) +
      P('Reply to this e-mail or call us and we’ll get you on the list.'),
    cta: { label: 'Book my free hail inspection', url: 'https://grayco-cs.com/?utm_source=news&utm_medium=email&utm_campaign=hail_alert' } },
  { id: 'maint_plan', ic: '🛠', name: 'Maintenance plan offer', months: [1, 2, 3, 9, 10], audience: { type: 'jobType', jobType: 'Roofing' },
    subject: 'Keep your roof warranty strong with a GrayCo maintenance plan', preheader: 'A yearly check-up, priority storm service and member pricing.',
    title: 'Introducing GrayCo Maintenance Plans',
    body: P('Hi {{first_name}},') + P('Your roof is one of the biggest investments in your home. A GrayCo Maintenance Plan keeps it — and your warranty — in great shape:') +
      UL(['A yearly roof and gutter check-up with a photo report', 'Priority scheduling after storms', 'Member pricing on repairs', 'Reminders so nothing slips']) +
      P('Plans start at [PRICE] per year. Reply “PLAN” and we’ll send the details.'),
    cta: { label: 'Tell me about plans', url: 'https://grayco-cs.com/?utm_source=news&utm_medium=email&utm_campaign=maint_plan' } },
  { id: 'referral', ic: '🤝', name: 'Referral program', months: [4, 5, 9, 10], audience: { type: 'all' },
    subject: 'Know someone who needs a roof? We’ll thank you for it.', preheader: 'Refer a friend or neighbor — get a thank-you when they hire GrayCo.',
    title: 'Our best customers come from you',
    body: P('Hi {{first_name}},') + P('Most of our work comes from customers like you telling a friend. When someone you refer hires GrayCo, we’ll send you a <b>thank-you gift card</b> — our way of saying thanks.') +
      UL(['Tell them to mention your name when they call', 'Or reply to this e-mail with their name and number (with their OK)', 'No limit — refer as many neighbors as you like']),
    cta: { label: 'Refer someone', url: 'mailto:office@grayco-cs.com?subject=Referral' } },
  { id: 'job_near_you', ic: '🏡', name: '“We just finished a job near you”', months: [], audience: { type: 'zips', zips: [] }, nearJob: true,
    subject: 'We just finished a roof on {{street}} — your neighbors chose GrayCo', preheader: 'While our crew is in the neighborhood, a free check for you.',
    title: 'We just finished a project on {{street}}',
    body: P('Hi {{first_name}},') + P('Our crew just wrapped up a project on {{street}} in {{city}}. While we’re in the neighborhood, we’re offering free roof checks to nearby homes.') +
      P('Same crew, same care, licensed and insured. Reply or call and we’ll swing by.'),
    cta: { label: 'Book a free check', url: 'https://grayco-cs.com/?utm_source=news&utm_medium=email&utm_campaign=job_near_you' } },
  { id: 'home_report', ic: '📋', name: 'Anniversary “Your home report”', months: [], audience: { type: 'anniversary' }, anniversary: true,
    subject: 'Your yearly GrayCo home report', preheader: 'It’s been {{years}} since your {{job_type}} project — here’s what to check this year.',
    title: 'Your home report — {{years}} with GrayCo',
    body: P('Hi {{first_name}},') + P('It’s been {{years}} since we finished your {{job_type}} project. Here are the few things worth a look this year:') + '{{tips}}' +
      P('Want us to do it for you? Your yearly check-up is free for GrayCo customers — just reply or call.'),
    cta: { label: 'Book my free check-up', url: 'https://grayco-cs.com/?utm_source=news&utm_medium=email&utm_campaign=home_report' } },
  { id: 'referral_thanks', ic: '🙏', name: 'Referral thank-you (one person)', months: [], audience: { type: 'emails', emails: [] }, referral: true,
    subject: 'Thank you for sending {{referred}} our way!', preheader: 'A small thank-you from GrayCo.',
    title: 'Thank you, {{first_name}}!',
    body: P('Hi {{first_name}},') + P('Thank you for recommending GrayCo to {{referred}}. Referrals from customers like you are the best compliment a local contractor can get.') +
      P('{{credit_line}}') + P('If you know anyone else who needs a hand with a roof, a storm claim or a remodel, we’d be honored to help them too.'),
    cta: { label: 'Leave us a quick review', url: '{{review_link}}' } },
  { id: 'event_invite', ic: '🎃', name: 'Community event invite', months: [], audience: { type: 'zips', zips: ['38002', '38135', '38133', '38134'] }, event: true,
    subject: 'You’re invited: {{event}}', preheader: 'Come say hi to the GrayCo crew.',
    title: 'Come see us: {{event}}',
    body: P('Hi {{first_name}},') + P('GrayCo is proud to be part of our community. Come find us at <b>{{event}}</b> — bring the family!') + '{{event_details}}',
    cta: { label: 'See you there', url: 'https://grayco-cs.com/?utm_source=news&utm_medium=email&utm_campaign=event' } }
];
var MAINT_TIPS = {
  Roofing: ['Look for missing, curling or cracked shingles after storms', 'Keep gutters clear twice a year', 'Check pipe boots and flashing for cracks', 'Trim branches 6 feet back from the roof', 'Look in the attic for daylight or water stains'],
  Insurance: ['Keep the photos and paperwork from your claim in one place', 'Check the repaired area after big storms', 'Watch ceilings and walls near the repair for stains', 'Test smoke detectors and check the water heater pan'],
  Residential: ['Re-caulk tubs, showers and sinks yearly', 'Touch up exterior paint and seal wood trim', 'Check under sinks for slow leaks', 'Change HVAC filters every 1–3 months'],
  Commercial: ['Twice-yearly roof inspection (spring and fall)', 'Clear drains and scuppers of debris', 'Check rooftop units’ flashing and curbs', 'Keep a roof access log — foot traffic causes leaks']
};
function tipsHtml(kind){ return UL((MAINT_TIPS[kind] || MAINT_TIPS.Roofing).map(esc)); }
function tplById(id){ for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i]; return null; }
function seasonalFor(month){ return TEMPLATES.filter(function(t){ return t.months.indexOf(month) >= 0; }); }
/* fill the tokens for one recipient (v = { first_name, city, zip, street, years, job_type, kind, event, event_details }) */
function fill(text, v){
  v = v || {};
  return String(text == null ? '' : text).replace(/\{\{(\w+)\}\}/g, function(_, k){
    if (k === 'tips') return tipsHtml(v.kind || 'Roofing');
    if (k === 'review_link') return v.review_link || BRAND.reviewLink;
    if (k === 'year') return String(v.year || new Date().getFullYear());
    if (k === 'first_name') return esc(s(v.first_name) || 'there');
    if (k === 'event_details') return s(v.event_details);
    if (k === 'years') { var n = +v.years || 1; return n === 1 ? 'a year' : n + ' years'; }
    if (k === 'credit_line') return esc(s(v.credit_line) || 'A thank-you gift card is on its way to you.');
    return esc(s(v[k]) || ({ city: 'your area', zip: 'your ZIP', street: 'your street', job_type: 'GrayCo', event: 'our next community event', referred: 'your friend' })[k] || '');
  });
}
function campaignHtml(c, v){ return emailShell({ title: fill(c.ctitle || c.title, v), preheader: fill(c.preheader, v), bodyHtml: fill(c.body, v), cta: c.cta ? { label: fill(c.cta.label, v), url: fill(c.cta.url, v) } : null, photo: c.photo || '' }); }
function firstName(n){ var t = s(n).replace(/^(mr|mrs|ms|dr)\.?\s+/i, ''); if (!t || /\b(llc|inc|corp|company|church|school|properties|management|group)\b/i.test(t)) return ''; return t.split(/[\s,&]+/)[0].replace(/[^A-Za-z'-]/g, ''); }

/* ── audiences from the customer database ─────────────────────────────────────────────────────── */
function zipOf(a){ var m = s(a).match(/\b(3[78]\d{3}|72\d{3})(?:-\d{4})?\b/g); return m ? m[m.length - 1].slice(0, 5) : ''; }
function kindOf(p){
  p = p || {}; var t = low(p.type || p.jobType || p.projectType || p.leadType || p.category);
  if (/roof/.test(t)) return 'Roofing';
  if (p.isInsurance === true || p.insurance === true || /insur|claim|fire|water|storm|mitigat|restor|program/.test(t)) return 'Insurance';
  if (/commercial|\bti\b|tenant/.test(t)) return 'Commercial';
  return 'Residential';
}
function doneDate(p){ var v = s(p.completedAt || p.completionDate || p.endDate || p.closedAt || p.finishedAt); return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : ''; }
function isDone(p){ return /^(completed?|closed|paid|finished)/i.test(s(p.status)) || !!doneDate(p) && /complete/i.test(s(p.status)); }
function dead(x){ return !x || x.deleted === true || x._deleted === true || x.__deleted === true; }
/* every contact with an e-mail and what we know about them: { email, name, first, zip, city, kinds[], jobs[], commercial, insurance } */
function contacts(data){
  var by = {};
  function add(email, name, extra){
    var e = low(email); if (!/^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(e)) return null;
    var c = by[e] || (by[e] = { email: e, name: '', first: '', zip: '', city: '', street: '', kinds: [], jobs: [], commercial: false, insurance: false });
    if (!c.name && s(name)) { c.name = s(name); c.first = firstName(name); }
    Object.keys(extra || {}).forEach(function(k){ if (extra[k] && !c[k]) c[k] = extra[k]; });
    return c;
  }
  arr(data && data.customers).forEach(function(cu){
    if (dead(cu)) return;
    var addr = s(cu.address || cu.billingAddress);
    var c = add(cu.email || cu.contactEmail, cu.contactName || cu.name || cu.company, { zip: zipOf(addr) });
    if (!c) return;
    var ty = low(cu.type || cu.customerType || cu.category);
    if (/commercial|gc|general contractor|property|manager|business|hoa/.test(ty) || s(cu.company)) c.commercial = c.commercial || /commercial|gc|general contractor|property|manager|business|hoa/.test(ty) || !!s(cu.company);
    if (/insur/.test(ty)) c.insurance = true;
  });
  arr(data && data.newsSignups).forEach(function(sg){ if (sg && sg.email) add(sg.email, sg.name, { zip: s(sg.zip), signup: true }); });   /* patch MKT2: lead-magnet downloads joined GrayCo News */
  arr(data && data.projects).forEach(function(p){
    if (dead(p)) return;
    var addr = s(p.address || p.jobAddress);
    var c = add(p.clientEmail || p.customerEmail || p.email, p.client || p.customer, { zip: zipOf(addr), street: streetOnly(addr) });
    if (!c) return;
    var k = kindOf(p);
    if (c.kinds.indexOf(k) < 0) c.kinds.push(k);
    if (k === 'Commercial') c.commercial = true;
    if (k === 'Insurance') c.insurance = true;
    c.jobs.push({ id: s(p.id), kind: k, done: isDone(p), doneDate: doneDate(p), zip: zipOf(addr) });
    if (badRating(p)) c.bad = true;   /* patch MKT2 blitz */
  });
  return Object.keys(by).map(function(k){ return by[k]; });
}
/* patch MKT2 blitz: a customer who told us they were unhappy is never asked for a review */
function badRating(p){ var n = function(v){ var x = parseFloat(v); return isFinite(x) ? x : null; }; var r = [n(p.rating), n(p.csat), n(p.csatScore), n(p.satisfaction), n(p.reviewStars), n(p.npsScore != null ? p.npsScore / 2 : null)].filter(function(x){ return x != null; });
  return r.some(function(x){ return x <= 3; }) || /sad|unhappy|bad|😟|angry|complain/i.test([p.mood, p.checkinMood, p.midJobMood, p.sentiment].map(s).join(' ')) || p.badReview === true || p.noReviewAsk === true || p.doNotContact === true; }
var AUD_TYPES = [
  { v: 'all', l: 'Everyone on GrayCo News' },
  { v: 'jobType', l: 'By job type' },
  { v: 'zips', l: 'By ZIP / neighborhood' },
  { v: 'oldRoof', l: 'Past roof jobs older than X years' },
  { v: 'insurance', l: 'Insurance customers' },
  { v: 'commercial', l: 'Commercial contacts' },
  { v: 'anniversary', l: 'Job anniversary this month (home report)' }
];
function audLabel(a){
  a = a || {}; var t = a.type || 'all';
  if (t === 'jobType') return (a.jobType || 'Roofing') + ' customers';
  if (t === 'zips') return 'ZIP ' + (arr(a.zips).join(', ') || '(none picked)');
  if (t === 'oldRoof') return 'Roof jobs ' + (+a.years || 10) + '+ years old';
  if (t === 'insurance') return 'Insurance customers';
  if (t === 'commercial') return 'Commercial contacts';
  if (t === 'anniversary') return 'Job anniversary this month';
  if (t === 'reviewBlitz') return 'Review blitz' + (a.batch != null ? ' — batch ' + ((+a.batch || 0) + 1) : '') + ' (finished in the last 2 years, no bad rating)';
  if (t === 'emails') return arr(a.emails).length === 1 ? 'one person (' + arr(a.emails)[0] + ')' : arr(a.emails).length + ' people';
  return 'Everyone on GrayCo News';
}
/* who a campaign goes to (before the unsubscribed are taken out — the server does that, it alone can read the list) */
function audience(data, a, nowIso){
  a = a || {}; var t = a.type || 'all', now = s(nowIso) || new Date().toISOString(), all = contacts(data), out;
  var nowY = +now.slice(0, 4), nowM = now.slice(5, 7);
  if (t === 'jobType') { var k = a.jobType || 'Roofing'; out = all.filter(function(c){ return c.kinds.indexOf(k) >= 0; }); }
  else if (t === 'zips') { var zs = arr(a.zips).map(function(z){ return s(z).slice(0, 5); }); out = all.filter(function(c){ return zs.indexOf(c.zip) >= 0 || c.jobs.some(function(j){ return zs.indexOf(j.zip) >= 0; }); }); }
  else if (t === 'oldRoof') {
    var yrs = +a.years || 10, cut = (nowY - yrs) + now.slice(4, 10);
    out = all.filter(function(c){ return c.jobs.some(function(j){ return j.kind === 'Roofing' && j.done && j.doneDate && j.doneDate <= cut; }); });
  }
  else if (t === 'emails') {
    var want = arr(a.emails).map(low), have = {}; all.forEach(function(c){ have[c.email] = c; });
    out = want.filter(function(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(e); }).map(function(e, i){ return have[e] || { email: e, name: s(arr(a.names)[i]), first: firstName(arr(a.names)[i]), zip: '', kinds: [], jobs: [] }; });
  }
  else if (t === 'reviewBlitz') {   /* patch MKT2 blitz: finished in the last 2 years, no bad rating, in batches of a.size */
    var cut2 = (nowY - 2) + now.slice(4, 10), size = Math.max(10, Math.min(500, +a.size || 50));
    out = all.filter(function(c){ return !c.bad && c.jobs.some(function(j){ return j.done && j.doneDate && j.doneDate >= cut2; }); }).sort(function(x, y){ return x.email < y.email ? -1 : 1; });
    if (a.batch != null) out = out.slice((+a.batch || 0) * size, ((+a.batch || 0) + 1) * size);
  }
  else if (t === 'insurance') out = all.filter(function(c){ return c.insurance; });
  else if (t === 'commercial') out = all.filter(function(c){ return c.commercial; });
  else if (t === 'anniversary') {
    out = all.filter(function(c){ return c.jobs.some(function(j){ return j.done && j.doneDate && j.doneDate.slice(5, 7) === nowM && +j.doneDate.slice(0, 4) < nowY; }); })
      .map(function(c){ var j = c.jobs.filter(function(x){ return x.done && x.doneDate && x.doneDate.slice(5, 7) === nowM && +x.doneDate.slice(0, 4) < nowY; }).sort(function(x, y){ return x.doneDate < y.doneDate ? 1 : -1; })[0];
        return Object.assign({}, c, { years: nowY - +j.doneDate.slice(0, 4), job_type: j.kind === 'Insurance' ? 'restoration' : low(j.kind), kind: j.kind }); });
  }
  else out = all;
  var ex = arr(a.exclude).map(low);
  return out.filter(function(c){ return ex.indexOf(c.email) < 0; });
}
function varsFor(c, extra){
  var v = Object.assign({ first_name: c.first, city: '', zip: c.zip, street: '', years: c.years, job_type: c.job_type, kind: c.kind || c.kinds && c.kinds[0] }, extra || {});
  return v;
}

/* ── social: captions, tips, guard ─────────────────────────────────────────────────────────────── */
var NETWORKS = [{ v: 'facebook', l: 'Facebook', ic: '📘' }, { v: 'instagram', l: 'Instagram', ic: '📸' }, { v: 'gbp', l: 'Google Business', ic: '📍' }];
var TIPS = [
  { id: 'tip_hail', m: [3, 4, 5, 6], t: '🧊 Hail tip: damage often can’t be seen from the ground. If hail hit your street, get a free inspection with photos before you call your insurance company. GrayCo is local, licensed and insured.' },
  { id: 'tip_wind', m: [3, 4, 5, 11], t: '🌬 After a windstorm, walk your yard: shingle pieces, granules in the gutters or a flapping ridge cap mean it’s time for a roof check. We’ll look free.' },
  { id: 'tip_attic', m: [6, 7, 8], t: '☀️ Memphis attics can hit 150° in July. Good ridge + soffit ventilation lowers your cooling bill and makes your shingles last longer.' },
  { id: 'tip_gutter', m: [9, 10, 11], t: '🍂 Clogged gutters = rotten fascia and water in the basement. Clean them after the leaves drop — or let us add gutter guards.' },
  { id: 'tip_ice', m: [12, 1, 2], t: '❄️ Freeze night? Drip your faucets, open sink cabinets on outside walls, and know where your main water shut-off is. Water in the house? Call GrayCo 24/7.' },
  { id: 'tip_claim', m: [], t: '📋 Insurance claim tip: take photos before anything is moved, keep every receipt, and let your contractor meet the adjuster. We handle claims every week — ask us anything.' },
  { id: 'tip_boots', m: [], t: '🔧 The #1 roof leak we fix? Cracked pipe boots. A $40 part can ruin a ceiling. If your roof is 8+ years old, have them checked.' },
  { id: 'tip_age', m: [], t: '🏠 How old is your roof? Most architectural shingles in the Mid-South last 20–25 years. Curling, bald spots or granules in the gutter mean it’s time for a look.' },
  { id: 'tip_commercial', m: [1, 2, 3, 9, 10], t: '🏢 Business owners: a flat roof should be inspected twice a year. Clear drains and check seams before storm season — it’s far cheaper than a leak over inventory.' },
  { id: 'tip_reno', m: [1, 2, 8], t: '🛁 Planning a bathroom or kitchen remodel? Winter is the best time to plan — designs and selections now mean a spring finish.' },
  { id: 'tip_water', m: [], t: '💧 Water stain on the ceiling? Don’t wait. Wet drywall and insulation can grow mold in 48 hours. GrayCo does mitigation and the full repair.' },
  { id: 'tip_choose', m: [], t: '✅ Hiring a contractor? Ask for a state license number, proof of insurance and local references. Ours: TN #85034 BCB · AR #0486990627 · MS #27769.' }
];
function tipFor(month, used){ used = arr(used); var list = TIPS.filter(function(t){ return (t.m.length === 0 || t.m.indexOf(month) >= 0) && used.indexOf(t.id) < 0; }); if (!list.length) list = TIPS.filter(function(t){ return t.m.length === 0 || t.m.indexOf(month) >= 0; }); return list[0] || TIPS[0]; }
function areaOf(job){ var a = s(job && (job.address || job.jobAddress)); var parts = a.split(','); var city = s(parts[1]).replace(/\b(TN|MS|AR)\b.*$/i, '').trim(); return city || 'the Memphis area'; }
function jobCaption(job, style){
  var k = kindOf(job), area = areaOf(job), st = streetOnly(job && (job.address || job.jobAddress));
  var what = k === 'Roofing' ? 'a brand-new roof' : k === 'Insurance' ? 'a full storm-damage restoration' : k === 'Commercial' ? 'a commercial project' : 'a home renovation';
  var t = style === 'gbp'
    ? 'Just finished ' + what + ' in ' + area + '. Local, licensed and insured — call ' + BRAND.phone + ' for a free estimate.'
    : '✨ Before & after! Our crew just finished ' + what + ' in ' + area + '. Thank you to our customer for trusting GrayCo with their home. 🏡\n\nThinking about your own project? Free estimates: ' + BRAND.phone + '\n\n' + BRAND.hashtags;
  return scrub(t, [job && job.address, job && job.jobAddress, st && /^\d/.test(st) ? st : '']);
}
function reviewCaption(r){
  var who = s(r && r.author).split(/\s+/)[0] || 'a customer', stars = '⭐️⭐️⭐️⭐️⭐️'.slice(0, Math.max(1, Math.min(5, +(r && r.rating) || 5)) * 3);
  var q = s(r && r.text); if (q.length > 240) q = q.slice(0, 237).replace(/\s+\S*$/, '') + '…';
  return scrub(stars + '\n“' + q + '” — ' + who + '\n\nThank you for the kind words! Reviews like this keep our crew going. 🙏\n' + BRAND.hashtags);
}
function eventCaption(ev, after){
  ev = ev || {};
  if (after) return '🎉 What a night at ' + s(ev.name) + '! Thank you to everyone who stopped by the GrayCo ' + (s(ev.booth) || 'booth') + '. We love being part of this community. 🧡\n\n' + BRAND.hashtags;
  return '📣 Come see us! GrayCo will be at ' + s(ev.name) + (ev.place ? ' — ' + s(ev.place) : '') + (ev.date ? ' on ' + s(ev.dateLabel || ev.date) : '') + (ev.time ? ' at ' + s(ev.time) : '') + '. ' + (s(ev.booth) ? 'Find our ' + s(ev.booth) + '! ' : '') + 'Bring the family. 🧡\n\n' + BRAND.hashtags;
}
function gbpFromCaption(t){ return s(t).replace(/#\w+/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1450); }

/* ── the ideas board: concrete plays for a Memphis roofing / remodel / insurance / commercial contractor ── */
var IDEAS = [
  { id: 'i_gbp_weekly', cat: 'Google', t: 'Post on Google Business every week', why: 'Fresh posts and photos help you show up in the Maps “3-pack” when people search “roofer near me”.', start: { kind: 'post', network: 'gbp' } },
  { id: 'i_review_24h', cat: 'Reviews', t: 'Ask for a Google review within 24 hours of every finished job', why: 'Review count and recency are the #1 local ranking factor you control.', start: { kind: 'todo', t: 'Send review requests to every job finished this month' } },
  { id: 'i_neighbors', cat: 'Neighborhood', t: 'Door hangers on 20–40 neighbor homes after every roof', why: 'Neighbors saw the dumpster and the crew — the best-timed ad there is.', start: { kind: 'neighbor' } },
  { id: 'i_yard_sign', cat: 'Print', t: 'Yard sign with a QR code on every active job', why: 'A sign for 2 weeks on a busy street costs $20 and gets calls for years.', start: { kind: 'todo', t: 'Order 25 yard signs with the website QR (Print & brand kit)' } },
  { id: 'i_hail_48', cat: 'Storm', t: 'Hail alert e-mail to the hit ZIPs within 48 hours', why: 'Homeowners look for a roofer in the first week after a storm.', start: { kind: 'campaign', tpl: 'hail_alert' } },
  { id: 'i_storm_page', cat: 'Storm', t: 'A storm landing page with a “free inspection” form', why: 'One page for every storm ad, door hanger and text — and you can measure it.', start: { kind: 'todo', t: 'Make a /storm page on grayco-cs.com (Squarespace) with the inspection form' } },
  { id: 'i_lsa', cat: 'Google', t: 'Turn on Google Local Services Ads (Google Guaranteed)', why: 'Pay per lead, not per click; the green badge sits above every other ad.', start: { kind: 'todo', t: 'Sign up for Google Local Services Ads (roofing + water damage)' } },
  { id: 'i_referral', cat: 'Referrals', t: 'A $100–$250 referral thank-you, announced to past customers', why: 'Referral jobs close at 2–3× the rate of paid leads.', start: { kind: 'campaign', tpl: 'referral' } },
  { id: 'i_maint', cat: 'Repeat', t: 'Sell maintenance plans to past roof customers', why: 'Recurring revenue in slow months and first call when they need a roof.', start: { kind: 'campaign', tpl: 'maint_plan' } },
  { id: 'i_home_report', cat: 'Repeat', t: 'Yearly “Your home report” on each job anniversary', why: 'Keeps GrayCo top of mind and brings back repair work.', start: { kind: 'campaign', tpl: 'home_report' } },
  { id: 'i_before_after', cat: 'Social', t: 'A before/after post for every finished job', why: 'Before/after photos are the most-shared contractor posts on Facebook.', start: { kind: 'post', from: 'job' } },
  { id: 'i_truck', cat: 'Print', t: 'Truck wraps / magnets with the phone and a QR', why: 'Every truck is a moving billboard in Bartlett and Cordova traffic.', start: { kind: 'todo', t: 'Get truck magnet quotes (spec in Print & brand kit)' } },
  { id: 'i_nextdoor', cat: 'Neighborhood', t: 'Claim the Nextdoor business page and ask customers to “recommend”', why: 'Nextdoor recommendations travel neighborhood to neighborhood.', start: { kind: 'todo', t: 'Claim GrayCo on Nextdoor and ask 10 customers to recommend us' } },
  { id: 'i_realtors', cat: 'Partners', t: 'Pre-listing roof inspections for realtors', why: 'Realtors need fast, clear roof reports before closing — and they refer every month.', start: { kind: 'todo', t: 'Make a one-page realtor offer and visit 5 Bartlett/Germantown offices' } },
  { id: 'i_pm_hoa', cat: 'Commercial', t: 'Lunch-and-learn for property managers and HOAs', why: 'One property manager can bring dozens of roofs.', start: { kind: 'todo', t: 'Plan a property-manager lunch (roof maintenance + storm plan)' } },
  { id: 'i_warehouses', cat: 'Commercial', t: 'Commercial roof survey offer to large flat roofs (RoofScout)', why: 'RoofScout finds the big roofs; a free survey opens the door.', start: { kind: 'todo', t: 'Pick 20 RoofScout commercial roofs and mail the survey offer' } },
  { id: 'i_agents', cat: 'Partners', t: 'Independent insurance agents referral network', why: 'Agents get calls the day after a storm — be the contractor they trust (never name carriers in ads).', start: { kind: 'todo', t: 'Meet 5 local independent insurance agents' } },
  { id: 'i_gutters', cat: 'Seasonal', t: 'Fall gutter + roof check campaign', why: 'An easy yes in Sept–Nov that leads to bigger jobs.', start: { kind: 'campaign', tpl: 'fall_gutters' } },
  { id: 'i_attic', cat: 'Seasonal', t: 'Summer attic ventilation campaign', why: 'Hot attics shorten roof life — a reason to call in a slow season.', start: { kind: 'campaign', tpl: 'summer_attic' } },
  { id: 'i_holiday', cat: 'Seasonal', t: 'Holiday thank-you e-mail with the review link', why: 'Gratitude + a soft review ask in December gets replies.', start: { kind: 'campaign', tpl: 'holiday_thanks' } },
  { id: 'i_sports', cat: 'Community', t: 'Sponsor a youth sports team banner', why: 'Parents are homeowners; banners hang all season.', start: { kind: 'todo', t: 'Ask Bartlett / Arlington youth leagues about spring banner sponsorships' } },
  { id: 'i_events', cat: 'Community', t: 'A booth at community events (Trunk or Treat, festivals)', why: 'Face-to-face trust + great photos for social.', start: { kind: 'event' } },
  { id: 'i_crew', cat: 'Social', t: '“Meet the crew” short videos', why: 'People hire people — 20-second phone videos build trust.', start: { kind: 'post', text: '👷 Meet the crew! This is the team that shows up on your roof. Local, licensed, insured — and proud of every job. ' } },
  { id: 'i_testimonial', cat: 'Social', t: 'A 30-second customer video testimonial each month', why: 'Video reviews convert better than any ad copy.', start: { kind: 'todo', t: 'Ask one happy customer this month for a 30-second video' } },
  { id: 'i_reply_reviews', cat: 'Reviews', t: 'Reply to every Google review within 48 hours', why: 'Google and customers both notice owners who answer.', start: { kind: 'section', sec: 'reviews' } },
  { id: 'i_utm', cat: 'Google', t: 'Tag every link with UTM codes', why: 'Then the dashboard shows which ad, post or flyer brought each lead.', start: { kind: 'section', sec: 'google' } },
  { id: 'i_eddm', cat: 'Neighborhood', t: 'USPS Every Door Direct Mail postcards to storm routes', why: 'No mailing list needed; ~20¢ a home; you pick the carrier routes.', start: { kind: 'section', sec: 'neighbors' } },
  { id: 'i_church', cat: 'Community', t: 'Church bulletin and school newsletter ads', why: 'Cheap, local and trusted — perfect for a family contractor.', start: { kind: 'todo', t: 'Price church bulletin / school newsletter ads in Bartlett and Arlington' } },
  { id: 'i_lead_magnet', cat: 'Website', t: 'Free “Storm-ready home checklist” download', why: 'Collects e-mails for GrayCo News from people not ready to buy yet.', start: { kind: 'todo', t: 'Turn the storm checklist into a 1-page PDF on the website' } },
  { id: 'i_missed_call', cat: 'Leads', t: 'Text back every missed call within 1 minute', why: 'The first contractor to answer usually gets the job.', start: { kind: 'todo', t: 'Set up Twilio for missed-call text-back (roadmap A1)' } },
  { id: 'i_angi', cat: 'Leads', t: 'Refresh the Angi / HomeAdvisor profile (or pause it)', why: 'Check cost per job against Google and referrals in the dashboard first.', start: { kind: 'section', sec: 'dashboard' } },
  { id: 'i_tv', cat: 'PR', t: 'Pitch “storm tips” to local TV after a big storm', why: 'Free airtime as the local expert; link the clip on every channel.', start: { kind: 'todo', t: 'Write a 3-tip storm pitch for WREG / Action News 5 / FOX13' } },
  { id: 'i_claim_explainer', cat: 'Social', t: 'An “how an insurance claim works” post series', why: 'Most homeowners have never filed a roof claim — teaching builds trust (never name carriers).', start: { kind: 'post', text: TIPS[5].t } },
  { id: 'i_commercial_plan', cat: 'Commercial', t: 'Quarterly roof inspection plans for businesses', why: 'Facility managers budget for prevention; it locks in the replacement later.', start: { kind: 'campaign', tpl: 'maint_plan', aud: { type: 'commercial' } } },
  { id: 'i_shorts', cat: 'Social', t: 'YouTube Shorts / Reels from job photos', why: 'Free reach; the same 15-second clip works on three networks.', start: { kind: 'todo', t: 'Make 3 Reels from this month’s best job photos' } },
  { id: 'i_job_near', cat: 'Neighborhood', t: '“We just finished a job near you” e-mail to that ZIP', why: 'Past customers nearby re-engage when they see the crew next door.', start: { kind: 'campaign', tpl: 'job_near_you' } },
  { id: 'i_lawn_signs_storm', cat: 'Storm', t: 'Canvass storm streets with a door-hanger + QR to book', why: 'Door knocking with proof (photos of the neighbor’s hail) works.', start: { kind: 'section', sec: 'storm' } },
  { id: 'i_gbp_qa', cat: 'Google', t: 'Seed Google Business Q&A with the top 5 questions', why: 'Answers show right on your Maps listing.', start: { kind: 'todo', t: 'Add 5 Q&As to the Google Business Profile (financing, insurance, warranty, areas, timeline)' } }
];
var GBP_CHECKLIST = [
  'Business name exactly “GrayCo Construction Services” (no keywords stuffed in)',
  'Primary category: Roofing contractor; secondary: General contractor, Water damage restoration service, Commercial roofing contractor, Remodeler',
  'Address ' + require('./brand.js').companyAddress() + ' (or service-area business with the address hidden)',
  'Service areas: Bartlett, Memphis, Germantown, Collierville, Cordova, Arlington, Lakeland, Olive Branch, Southaven',
  'Phone (901) 585-0944 and website with a UTM link (?utm_source=google&utm_medium=gbp)',
  'Hours, and “Online estimates” attribute on',
  'Services list with short descriptions (roof replacement, repair, storm/insurance restoration, remodeling, commercial)',
  'Logo, cover photo, and 20+ job photos (no house numbers visible)',
  'Business description with licenses (TN #85034 BCB · AR #0486990627 · MS #27769)',
  'Q&A: 5 common questions answered by GrayCo',
  'One post every week (Autopilot drafts it)',
  'Reply to every review within 48 hours'
];
var GBP_POST_IDEAS = ['Before/after of this week’s finished roof (no house number)', 'Storm-season free inspection offer', 'A 5-star review with a thank-you', 'Meet the crew photo', 'Seasonal tip (gutters, attic, freeze)', 'Community event photo', 'Maintenance plan offer', 'Financing / insurance-claim help explainer (never name carriers)'];
var GETTING_STARTED = [
  { id: 'gs_gbp', t: 'Claim / verify the Google Business Profile', how: 'Go to business.google.com, search GrayCo Construction Services, claim it and finish the verification (postcard, phone or video).', url: 'https://business.google.com/' },
  { id: 'gs_fb', t: 'Make sure the Facebook Page exists and is a business Page', how: 'facebook.com/pages → your Page → Settings. It must be a Page (not a personal profile) and you must be its admin.', url: 'https://www.facebook.com/pages/?category=your_pages' },
  { id: 'gs_ig', t: 'Switch Instagram to a Business account and link it to the Page', how: 'Instagram app → Settings → Account type → Switch to professional → Business. Then Facebook Page → Settings → Linked accounts → Instagram.', url: 'https://www.instagram.com/' },
  { id: 'gs_connect', t: 'Connect them to the CRM (docs/SOCIAL-SETUP.md)', how: 'Follow docs/SOCIAL-SETUP.md step by step — or ask whoever set up Netlify to paste the keys. The status lights in Social turn green when it works.', sec: 'social' },
  { id: 'gs_review', t: 'Add the Google review link', how: 'Google Business Profile → “Ask for reviews” → copy the link → paste it in Google → Review link.', sec: 'google' },
  { id: 'gs_autopilot', t: 'Turn on Autopilot', how: 'Marketing → Autopilot → On. The CRM drafts the posts and e-mails; you just approve them on your phone.', sec: 'autopilot' }
];

return {
  BRAND: BRAND, CARRIERS: CARRIERS, CARRIER_RE: CARRIER_RE, HOUSE_RE: HOUSE_RE, TEMPLATES: TEMPLATES, MAINT_TIPS: MAINT_TIPS, TIPS: TIPS, IDEAS: IDEAS,
  NETWORKS: NETWORKS, AUD_TYPES: AUD_TYPES, GBP_CHECKLIST: GBP_CHECKLIST, GBP_POST_IDEAS: GBP_POST_IDEAS, GETTING_STARTED: GETTING_STARTED, DEFAULT_TIMES: DEFAULT_TIMES, DAYS: DAYS,
  guard: guard, scrub: scrub, streetOnly: streetOnly, zipOf: zipOf, kindOf: kindOf, isDone: isDone, doneDate: doneDate, firstName: firstName,
  emailShell: emailShell, tplById: tplById, seasonalFor: seasonalFor, fill: fill, campaignHtml: campaignHtml, tipsHtml: tipsHtml,
  contacts: contacts, audience: audience, audLabel: audLabel, varsFor: varsFor,
  tipFor: tipFor, jobCaption: jobCaption, reviewCaption: reviewCaption, eventCaption: eventCaption, gbpFromCaption: gbpFromCaption, areaOf: areaOf,
  ctParts: ctParts, ctToMs: ctToMs, nextSlots: nextSlots, ctLabel: ctLabel, weekKey: weekKey, monthKey: monthKey, esc: esc
};
});
