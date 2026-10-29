/* ============================================================================
   GrayCo — FIELD & INSURANCE AUTOMATIONS, shared rules (patch AUTO7).   netlify/functions/_lib/fa-core.js
   The SAME file runs on the server (require) and in the CRM (index.html carries a copy in its "gc-patch-auto7" script,
   written there by patch_AUTO7.py), so the CRM and the e-mails always agree. Pure functions: no fetch, no storage.

   1. FINAL INSURANCE CLOSEOUT (owner, 10/21): "Depreciation and supplements need to be sent in at end of job for
      insurance jobs. Make sure we account for supplements and always do them if possible."
        supplement check FIRST (found → a supplement request; none → the PM ticks "No supplement — checked")
        → depreciation release packet → follow-ups every 7 days on both until received / approved / denied.
   2. MORTGAGE CHECKS: Received → Sent for endorsement → Endorsed → Inspection requested → Released / deposited,
      a PM reminder every 5 days while one sits still.
   3. PHOTOS PER STAGE — soft ("keep it not very serious, sometimes it's hard to get pics"): never blocking.
   4. 7 AM DISPATCH for superintendents.   5. SUPPLIER ORDERS (orders@).   6. WARRANTY TICKETS (portal).
   7. SUB SCORECARD (0–100 + a letter).    8. THE ONE-YEAR NOTE.
   ========================================================================== */
(function(root, factory){
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.GCFA = m;
})(typeof window !== 'undefined' ? window : this, function(){
'use strict';
var DAY = 864e5;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function r2(n){ return Math.round(num(n) * 100) / 100; }
function ymd(v){ var t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); var d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
function pidOf(r){ return s(r && (r.pid || r.projectId || r.jobId || r.project_id)); }
function days(a, b){ var x = Date.parse(ymd(a) + 'T12:00:00Z'), y = Date.parse(ymd(b) + 'T12:00:00Z'); return isFinite(x) && isFinite(y) ? Math.round((y - x) / DAY) : null; }
function addDays(d, n){ var t = new Date(ymd(d) + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function money0(n){ return '$' + Math.round(num(n)).toLocaleString('en-US'); }

/* ── what kind of job ───────────────────────────────────────────────────────── */
function jobText(p){ return low([p.type, p.jobType, p.name, p.scope, p.scopeOfWork, p.category, p.trade].filter(function(x){ return typeof x === 'string'; }).join(' ')); }
function isInsurance(p, claim){ var t = jobText(p || {}); return !!claim || (p && p.isInsurance === true) || /insurance|claim|restoration|storm|fire damage|water damage|mitigation/.test(t); }
function jobKind(p, claim){
  var t = jobText(p || {}), jt = low(claim && claim.jobType);
  if (/mitigation|dry.?out|water extraction/.test(t) || jt === 'water' && /mitig/.test(t)) return 'water';
  if (jt === 'water' || /water damage|flood|leak/.test(t)) return 'water';
  if (jt === 'fire' || /fire|smoke/.test(t)) return 'fire';
  if (/roof|shingle|re-?roof|gutter/.test(t) || jt === 'storm') return 'roofing';
  if (/commercial|tenant|\bti\b|church|school|warehouse|office build/.test(t)) return 'commercial';
  if (/kitchen|bath|remodel|renovat|addition|basement|interior/.test(t)) return 'remodel';
  return 'general';
}

/* ── 3. PHOTOS PER STAGE (soft) ─────────────────────────────────────────────── */
/* each item: tag (GrayCo Photos tag: Before / During / Damage / After / Punch) and/or words in the photo's note.
   stage: the job stage (patch AUT3 keys) from which it is expected. A manual tick always counts. */
var PHOTO_LISTS = {
  roofing: [
    { k: 'before', l: 'Before — every slope and the damage', tag: /^(before|damage)$/i, kw: /before|existing|damage|hail|wind/i, stage: 'in_progress' },
    { k: 'tearoff', l: 'Tear-off', kw: /tear|strip|remov/i, stage: 'substantial' },
    { k: 'decking', l: 'Decking (and any boards replaced)', kw: /deck|plywood|osb|sheathing|board/i, stage: 'substantial' },
    { k: 'underlayment', l: 'Underlayment / ice & water', kw: /underlay|ice|water.?shield|felt|synthetic/i, stage: 'substantial' },
    { k: 'final', l: 'Final — every slope, vents, flashing, cleanup', tag: /^after$/i, kw: /final|complete|finished|after|clean/i, stage: 'complete' }
  ],
  water: [
    { k: 'before', l: 'Damage / before', tag: /^(before|damage)$/i, kw: /before|damage|water|wet/i, stage: 'in_progress' },
    { k: 'moisture', l: 'Moisture readings (meter in the photo)', kw: /moisture|reading|meter|%/i, stage: 'in_progress' },
    { k: 'equipment', l: 'Equipment placed', kw: /equipment|dehu|air mover|fan|scrubber/i, stage: 'in_progress' },
    { k: 'demo', l: 'Removal / demo', kw: /demo|remov|cut|tear/i, stage: 'substantial' },
    { k: 'final', l: 'Dry / final', tag: /^after$/i, kw: /dry|final|after|complete/i, stage: 'complete' }
  ],
  fire: [
    { k: 'before', l: 'Damage / before', tag: /^(before|damage)$/i, kw: /before|damage|fire|smoke|soot/i, stage: 'in_progress' },
    { k: 'contents', l: 'Contents', kw: /content|pack/i, stage: 'in_progress' },
    { k: 'demo', l: 'Demo / cleaning', kw: /demo|remov|clean|soot/i, stage: 'substantial' },
    { k: 'during', l: 'Rebuild in progress', tag: /^during$/i, kw: /during|framing|drywall|progress/i, stage: 'substantial' },
    { k: 'final', l: 'Final', tag: /^after$/i, kw: /final|after|complete/i, stage: 'complete' }
  ],
  remodel: [
    { k: 'before', l: 'Before', tag: /^(before|damage)$/i, kw: /before|existing/i, stage: 'in_progress' },
    { k: 'roughin', l: 'Rough-in (walls open)', tag: /^during$/i, kw: /rough|framing|plumb|electric|open wall/i, stage: 'substantial' },
    { k: 'final', l: 'Final', tag: /^after$/i, kw: /final|after|complete/i, stage: 'complete' }
  ],
  commercial: [
    { k: 'before', l: 'Before / existing', tag: /^(before|damage)$/i, kw: /before|existing/i, stage: 'in_progress' },
    { k: 'during', l: 'Progress', tag: /^during$/i, kw: /progress|during/i, stage: 'substantial' },
    { k: 'final', l: 'Final', tag: /^after$/i, kw: /final|after|complete/i, stage: 'complete' }
  ],
  general: [
    { k: 'before', l: 'Before', tag: /^(before|damage)$/i, kw: /before|existing|damage/i, stage: 'in_progress' },
    { k: 'during', l: 'During', tag: /^during$/i, kw: /during|progress/i, stage: 'substantial' },
    { k: 'final', l: 'Final', tag: /^after$/i, kw: /final|after|complete/i, stage: 'complete' }
  ]
};
var STAGE_ORDER = ['lead', 'signed', 'materials', 'in_progress', 'inspection', 'substantial', 'complete'];
function stageRank(k){ var i = STAGE_ORDER.indexOf(s(k)); return i < 0 ? 0 : i; }
/* photos: GrayCo Photos records { jobId, tag, note / caption / label, deleted } (+ CompanyCam ones with tags[]) */
function photoChecklist(p, photos, ticks, claim){
  var kind = jobKind(p, claim), list = PHOTO_LISTS[kind] || PHOTO_LISTS.general, pid = s(p && p.id);
  var mine = arr(photos).filter(function(r){ return !r.deleted && (pidOf(r) === pid || s(r.jobId) === pid); });
  ticks = ticks || {};
  var items = list.map(function(it){
    var hits = mine.filter(function(r){
      var tag = s(r.tag) || (Array.isArray(r.tags) ? r.tags : []).map(function(t){ return s(t && typeof t === 'object' ? t.name : t); }).join(' ');
      var words = [r.note, r.caption, r.label, r.description, r.title, tag].map(s).join(' ');
      return (it.tag && it.tag.test(s(r.tag))) || (it.kw && it.kw.test(words));
    }).length;
    var t = ticks[it.k];
    return { k: it.k, l: it.l, stage: it.stage, count: hits, ticked: !!(t && t.on !== false), tickBy: t && t.by || '', done: hits > 0 || !!(t && t.on !== false) };
  });
  return { kind: kind, items: items, done: items.filter(function(x){ return x.done; }).length, total: items.length };
}
/* what is still missing for a stage (the stage reached and the ones before it) */
function photosMissing(p, photos, ticks, stage, claim){
  var c = photoChecklist(p, photos, ticks, claim), r = stageRank(stage || 'complete');
  return c.items.filter(function(x){ return !x.done && stageRank(x.stage) <= r; });
}

/* ── warranty (the portal's rule: 5 years on ALL roofing and on insurance work, 1 year on everything else) ── */
function warranty(p, claim, now){
  p = p || {}; var t = jobText(p), roof = /roof|shingle|re-?roof/.test(t), ins = isInsurance(p, claim);
  var years = roof || ins ? 5 : 1, start = ymd(p.completionDate || p.completedAt || p.endDate), end = '';
  if (start) { var d = new Date(start + 'T12:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + years); end = d.toISOString().slice(0, 10); }
  var today = ymd(new Date(now || Date.now()).toISOString());
  return { years: years, kind: roof ? 'Roof' : ins ? 'Insurance / restoration' : 'Workmanship', start: start, end: end,
    inWarranty: !start ? true : today <= end, label: (roof ? 'Roof' : ins ? 'Insurance / restoration' : 'Workmanship') + ' warranty — ' + years + ' year' + (years > 1 ? 's' : '') };
}

/* ── 6. WARRANTY TICKETS: the 48-hour clock ─────────────────────────────────── */
var TICKET_SLA_H = 48;
function ticketState(t, now){
  now = now || Date.now();
  var open = !/closed|resolved|done|cancel/i.test(s(t.status));
  var answered = !!s(t.firstResponseAt) || /scheduled|in.?progress|answered/i.test(s(t.status));
  var age = (now - Date.parse(t.createdAt || 0)) / 36e5;
  return { open: open, answered: answered, ageH: Math.max(0, Math.round(age)), late: open && !answered && age >= TICKET_SLA_H, leftH: Math.max(0, Math.round(TICKET_SLA_H - age)) };
}
var TICKET_STATUS = { new: 'Received — your PM will reach out within 2 business days', answered: 'Your PM is on it', scheduled: 'Visit scheduled', in_progress: 'Being fixed', resolved: 'Fixed', closed: 'Closed' };

/* ── 7. SUB SCORECARD ───────────────────────────────────────────────────────── */
function sameSub(name, sub){
  var n = low(name); if (!n || !sub) return false;
  return [sub.name, sub.company, sub.contact].map(low).filter(Boolean).some(function(x){ return x === n || (x.length > 4 && (n.indexOf(x) >= 0 || x.indexOf(n) >= 0)); });
}
/* data: { schedule, punch, tickets (warranty), ratings (gc_sub_ratings) } · sub: the CRM sub record
   on-time 30 · punch 20 · callbacks 15 · paperwork 20 · PM rating 15 — a part with nothing to measure is left out
   and the others are scaled up (a new sub is not punished for having no history). */
function subScore(sub, data, now){
  now = now || Date.now(); data = data || {};
  var today = ymd(new Date(now).toISOString()), sid = s(sub && sub.id);
  var mine = function(x){ return (sid && s(x.subId) === sid) || sameSub(x.vendor || x.sub || x.subName || x.assignee, sub); };
  /* on time: schedule rows of theirs whose end has passed */
  var rows = arr(data.schedule).filter(function(x){ return !x.deleted && mine(x); });
  var due = rows.filter(function(x){ var end = ymd(x.endDateSch || x.endDate || x.date); return end && end < today; });
  var onTime = due.filter(function(x){
    var end = ymd(x.endDateSch || x.endDate || x.date), done = ymd(x.doneAt || x.completedAt || x.finishedAt);
    if (/complete|done|finished/i.test(s(x.status))) return !done || done <= addDays(end, 1);
    return false;
  }).length;
  /* punch: closed within 7 days; open ones past 7 days count against */
  var punch = arr(data.punch).filter(function(x){ return !x.deleted && ((sid && s(x.subId) === sid) || sameSub(x.assignee || x.sub, sub)); });
  var pDone = punch.filter(function(x){ return /complete|done|closed/i.test(s(x.status)); });
  var pFast = pDone.filter(function(x){ var a = ymd(x.createdAt || x.date || x.at), b = ymd(x.doneAt || x.completedAt || x.closedAt || x.updatedAt); var d = a && b ? days(a, b) : null; return d == null || d <= 7; }).length;
  var pLate = punch.filter(function(x){ return !/complete|done|closed/i.test(s(x.status)) && days(x.createdAt || x.date || x.at, today) > 7; }).length;
  /* callbacks: warranty tickets put on them */
  var cb = arr(data.tickets).filter(function(t){ return (sid && s(t.subId) === sid) || sameSub(t.sub || t.subName, sub); }).length;
  var jobs = {}; rows.forEach(function(x){ var k = pidOf(x); if (k) jobs[k] = 1; });
  var nJobs = Math.max(1, Object.keys(jobs).length);
  /* paperwork */
  var exp = ymd(sub && (sub.insExp || sub.insuranceExp || sub.coiExpiration || sub.coiExp || sub.glExp));
  var coiOk = exp ? exp >= today : !!(sub && sub.coi === true);
  var w9Ok = !!(sub && (sub.w9 === true || /on file|yes|received/i.test(s(sub.w9))));
  /* PM ratings 1–5 */
  var rt = arr(data.ratings).filter(function(r){ return (sid && s(r.subId) === sid) || sameSub(r.subName || r.sub, sub); }).map(function(r){ return num(r.rating); }).filter(function(n){ return n >= 1 && n <= 5; });
  var parts = [];
  if (due.length) parts.push({ k: 'ontime', l: 'On time', w: 30, v: onTime / due.length, d: onTime + ' of ' + due.length + ' scheduled tasks finished on time' });
  if (punch.length) parts.push({ k: 'punch', l: 'Punch list', w: 20, v: Math.max(0, (pFast - pLate) / punch.length), d: pFast + ' of ' + punch.length + ' punch items closed within a week' + (pLate ? ' · ' + pLate + ' open over a week' : '') });
  if (rows.length || cb) parts.push({ k: 'callbacks', l: 'Callbacks', w: 15, v: Math.max(0, 1 - cb / nJobs), d: cb ? cb + ' warranty callback' + (cb > 1 ? 's' : '') + ' on ' + nJobs + ' job' + (nJobs > 1 ? 's' : '') : 'No callbacks' });
  parts.push({ k: 'papers', l: 'Paperwork', w: 20, v: (coiOk ? 0.5 : 0) + (w9Ok ? 0.5 : 0), d: (coiOk ? 'COI current' : 'COI missing or expired') + ' · ' + (w9Ok ? 'W-9 on file' : 'W-9 missing') });
  if (rt.length) { var avg = rt.reduce(function(a, b){ return a + b; }, 0) / rt.length; parts.push({ k: 'rating', l: 'PM rating', w: 15, v: (avg - 1) / 4, d: 'Average ' + (Math.round(avg * 10) / 10) + ' of 5 from ' + rt.length + ' job' + (rt.length > 1 ? 's' : '') }); }
  var wsum = parts.reduce(function(a, x){ return a + x.w; }, 0);
  var score = Math.round(parts.reduce(function(a, x){ return a + x.w * Math.max(0, Math.min(1, x.v)); }, 0) / (wsum || 1) * 100);
  var letter = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  var tips = [];
  if (!coiOk) tips.push('Upload a current insurance certificate (COI).');
  if (!w9Ok) tips.push('Send GrayCo your W-9.');
  parts.forEach(function(x){ if (x.k === 'ontime' && x.v < 0.85) tips.push('Finish scheduled tasks by their end date — tell your PM early when something slips.'); if (x.k === 'punch' && x.v < 0.85) tips.push('Close punch items within a week, with a photo.'); if (x.k === 'callbacks' && x.v < 0.9) tips.push('Fewer callbacks: check your work against the scope before you leave the job.'); });
  if (!tips.length) tips.push('Great work — keep it up.');
  return { score: score, letter: letter, parts: parts.map(function(x){ return { k: x.k, l: x.l, pct: Math.round(Math.max(0, Math.min(1, x.v)) * 100), weight: x.w, detail: x.d }; }), tips: tips, jobs: Object.keys(jobs).length };
}

/* ── 5. SUPPLIER ORDERS ─────────────────────────────────────────────────────── */
var SUPPLIERS = [
  [/abc ?supply|abcsupply/i, 'ABC Supply'], [/srs ?distribution|srsdistribution|suncoast|heritage/i, 'SRS Distribution'], [/beacon|becn/i, 'Beacon'],
  [/home ?depot|homedepot/i, 'The Home Depot'], [/lowe'?s/i, "Lowe's"], [/84 ?lumber/i, '84 Lumber'], [/ferguson/i, 'Ferguson'], [/sherwin/i, 'Sherwin-Williams'], [/gulfeagle|gulf eagle/i, 'Gulfeagle']
];
var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function parseDateWords(t, now){
  var y0 = new Date(now || Date.now()).getUTCFullYear(), m;
  if ((m = /(\d{4})-(\d{2})-(\d{2})/.exec(t))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t))) { var yy = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : y0; return yy + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2); }
  if ((m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i.exec(t))) return (m[3] || y0) + '-' + ('0' + MONTHS[m[1].toLowerCase()]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  return '';
}
/* subject + plain text (+ the sender) → { supplier, orderNo, poRef, deliveryDate, items[], summary } */
function parseOrder(subject, text, from, now){
  var all = s(subject) + '\n' + s(text), sup = '';
  SUPPLIERS.forEach(function(x){ if (!sup && (x[0].test(s(from)) || x[0].test(all))) sup = x[1]; });
  if (!sup) { var dm = /@([a-z0-9-]+)\./i.exec(s(from)); sup = dm ? dm[1].replace(/-/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); }) : 'Supplier'; }
  var m, orderNo = '', poRef = '', del = '';
  if ((m = /\b(?:order|confirmation|sales order|so|invoice)\s*(?:#|no\.?|number|num)?\s*[:#]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,})/i.exec(all))) orderNo = m[1];
  if ((m = /\b(?:p\.?o\.?|purchase order|job (?:name|#|number)|customer po|your po|reference|ref)\s*(?:#|no\.?|number)?\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9 .#\/-]{1,40})/i.exec(all))) poRef = s(m[1]).replace(/\s{2,}.*$/, '').split(/\n/)[0].trim();
  var dl = /(deliver(?:y|ed|ing)?(?: date)?|ship(?:ping|s)?(?: date)?|arriv(?:al|ing|es)|scheduled for|will be delivered|eta|pick.?up date)[^\n]{0,60}/ig, hit;
  while (!del && (hit = dl.exec(all))) del = parseDateWords(hit[0], now);
  var items = [];
  s(text).split(/\n/).forEach(function(line){
    var l = s(line); if (!l || items.length >= 25) return;
    var q = /^(?:\d+\s*[x×]\s+|qty[: ]*\d+\s+|\d+(?:\.\d+)?\s*(?:sq|squares?|bdl|bundles?|ea|each|rolls?|pcs?|pieces?|boxes?|bx|lf|sheets?|tubes?|bags?)\b)/i.test(l)
      || /\b(?:shingle|underlayment|ice ?& ?water|drip ?edge|starter|ridge|vent|nails?|coil|osb|plywood|decking|flashing|pipe boot)\b/i.test(l) && /\d/.test(l);
    if (q && !/total|subtotal|tax|price|\$\s*\d/i.test(l)) items.push(l.replace(/\s{2,}/g, ' ').slice(0, 120));
  });
  return { supplier: sup, orderNo: orderNo, poRef: poRef, deliveryDate: del, items: items, summary: items.slice(0, 4).join('; ').slice(0, 240) };
}
function normAddr(a){ return low(a).replace(/[.,#]/g, ' ').replace(/\b(street|st|road|rd|drive|dr|avenue|ave|lane|ln|cove|cv|court|ct|boulevard|blvd|parkway|pkwy|circle|cir|place|pl|way|trail|trl)\b/g, '').replace(/\s+/g, ' ').trim(); }
/* match an order to a job: the job's PO (autoPO / po), then the street address, then the job / customer name */
function matchOrder(o, projects, text){
  var all = low([o.poRef, o.orderNo, text].join(' ')), list = arr(projects).filter(function(p){ return p.id && p.deleted !== true; });
  var hit = list.filter(function(p){ var po = low(p.autoPO || p.po); return po && po.length >= 3 && new RegExp('(^|[^a-z0-9])' + po.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(all); });
  if (hit.length === 1) return { pid: s(hit[0].id), by: 'PO' };
  var nt = normAddr(all);
  hit = list.filter(function(p){ var a = normAddr(s(p.address || p.jobAddress).split(',')[0]); return a && a.length >= 6 && /^\d+ \S+/.test(a) && nt.indexOf(a) >= 0; });
  if (hit.length === 1) return { pid: s(hit[0].id), by: 'address' };
  hit = list.filter(function(p){ return !/complete|closed|lost|cancel/i.test(s(p.status)) && [p.name, p.client].some(function(n){ n = low(n); return n.length >= 5 && all.indexOf(n) >= 0; }); });
  if (hit.length === 1) return { pid: s(hit[0].id), by: 'name' };
  return { pid: '', by: '' };
}

/* ── 2. MORTGAGE CHECKS ─────────────────────────────────────────────────────── */
var MTG_STAGES = [['received', 'Received'], ['sent', 'Sent for endorsement'], ['endorsed', 'Endorsed'], ['inspection', 'Inspection requested'], ['released', 'Released / deposited']];
var MTG_REMIND_DAYS = 5;
/* the claim's checks that need the mortgage company: made out to it too (from / status says so), or every carrier
   check on a claim that names a mortgage company, unless it was marked deposited without one */
function mtgChecks(c, now){
  now = now || Date.now(); var out = [];
  arr(c && c.payments).forEach(function(p){
    if (p.deleted || /void/i.test(s(p.status))) return;
    var carrier = /carrier|mortgage|insur/i.test(s(p.from));
    var needs = /mortgage/i.test(s(p.from)) || /endorse|held|pending|mortgage/i.test(s(p.status)) || (p.mtg && p.mtg.stage) || (carrier && s(c.mortgageCo) && p.mtgNone !== true);
    if (!needs) return;
    var m = p.mtg || {}, stage = s(m.stage) || (p.endorsedAt ? 'endorsed' : 'received'), hist = arr(m.history);
    var last = hist.length ? hist[hist.length - 1].at : (p.endorsedAt || p.at || p.date);
    var still = stage !== 'released' ? Math.floor((now - Date.parse(last || 0)) / DAY) : 0;
    out.push({ id: s(p.id), amount: r2(p.amount), checkNo: s(p.checkNo), kind: s(p.kind), date: ymd(p.date), stage: stage,
      stageName: (MTG_STAGES.filter(function(x){ return x[0] === stage; })[0] || MTG_STAGES[0])[1], since: ymd(last), daysStill: isFinite(still) ? still : 0,
      stuck: stage !== 'released' && isFinite(still) && still >= MTG_REMIND_DAYS, lastReminder: s(m.remindedAt) });
  });
  return out;
}

/* ── 1. FINAL INSURANCE CLOSEOUT ────────────────────────────────────────────── */
var FOLLOW_DAYS = 7;
/* the insurance job has reached its end: the claim's phase (Final invoice / Depreciation released / Closed), or the
   job's stage / status complete */
function closeoutDue(c, p){
  if (!c) return false;
  if (/final invoice|depreciation|closed/i.test(s(c.phase))) return true;
  p = p || {}; return /^(complete|completed|closed|done)$/i.test(s(p.status)) || s(p.jobStage) === 'complete' || num(p.pct) >= 100;
}
/* what could be supplemented. compare: the newest ⚖ compare's R (patch BB runCompare) — its lines where the carrier
   is lower; changeOrders: the job's signed change orders; orders: gc_orders for the job; extras: claim.suppMarks
   (items the PM marked "supplement" during the job); carrier: the carrier estimate (its lines + totals). */
function suppCandidates(o){
  o = o || {}; var out = [], seen = {};
  function add(x){ var k = x.src + '|' + low(x.desc).slice(0, 60); if (seen[k] || !(num(x.amount) > 0.5 || x.src === 'materials')) return; seen[k] = 1; out.push(x); }
  var R = o.compare;
  if (R && Array.isArray(R.items)) R.items.forEach(function(x){
    if (!x || x.section === 'same' || x.section === 'carrierOnly' || !(num(x.delta) > 0.5)) return;
    var what = { missing: 'Not on the carrier estimate', qty: 'Quantity short', price: 'Unit price low', adj: 'O&P / tax' }[x.section] || 'Difference';
    add({ key: s(x.key), src: 'compare', desc: s(x.desc) || what, room: s(x.room), what: what, amount: r2(x.delta), qty: num(x.dqty) || 1, unit: s(x.unitC || x.unit) || 'EA' });
  });
  var carrierText = low(arr(o.carrierLines).map(function(l){ return s(l.desc); }).join(' | '));
  arr(o.changeOrders).forEach(function(co){
    if (co.deleted || !/approv|sign|accept/i.test(s(co.status))) return;
    if (co.ownerPay === true || /customer pays|owner pays|upgrade|not covered/i.test(s(co.desc || co.description || co.title) + ' ' + s(co.notes))) return;   /* the customer's upgrade is not the carrier's */
    var d = s(co.desc || co.description || co.title || co.name) || 'Change order';
    if (carrierText && carrierText.indexOf(low(d).slice(0, 24)) >= 0) return;
    add({ key: 'co:' + s(co.id), src: 'change order', desc: d, room: '', what: 'Change order (signed) — not on the carrier estimate', amount: r2(co.amt != null ? co.amt : (co.amount != null ? co.amount : co.total)), qty: 1, unit: 'EA' });
  });
  /* roofing: squares ordered vs the carrier's squares (more than 10 % over the carrier's quantity, waste included) */
  var sqOrdered = 0;
  arr(o.orders).forEach(function(od){ (Array.isArray(od.items) ? od.items : []).map(s).forEach(function(l){ var m = /(\d+(?:\.\d+)?)\s*(sq|squares?)\b/i.exec(l); if (m && /shingle|roof|sq/i.test(l)) sqOrdered += num(m[1]); else { var b = /(\d+)\s*(bdl|bundles?)\b/i.exec(l); if (b && /shingle|architect|3.?tab|dimension/i.test(l)) sqOrdered += num(b[1]) / 3; } }); });
  var sqCarrier = arr(o.carrierLines).filter(function(l){ return /^sq$/i.test(s(l.unit)) && /shingle|roof|comp|laminated|3 tab/i.test(s(l.desc)) && !/remov|tear|felt|underlay/i.test(s(l.desc)); }).reduce(function(a, l){ return a + num(l.qty); }, 0);
  if (sqOrdered > 0 && sqCarrier > 0 && sqOrdered > sqCarrier * 1.1) {
    var per = arr(o.carrierLines).filter(function(l){ return /^sq$/i.test(s(l.unit)) && /shingle|laminated|comp/i.test(s(l.desc)) && !/remov|tear/i.test(s(l.desc)); })[0];
    var extra = r2(sqOrdered - sqCarrier);
    add({ key: 'sq', src: 'materials', desc: 'Roofing — ' + extra + ' more squares installed than the carrier estimate (' + r2(sqCarrier) + ' SQ on the estimate, ' + r2(sqOrdered) + ' SQ ordered)', room: 'Roof', what: 'Quantity short (materials ordered)', amount: per ? r2(extra * num(per.unitPrice)) : 0, qty: extra, unit: 'SQ' });
  }
  arr(o.extras).forEach(function(x){ if (x && !x.deleted) add({ key: 'mark:' + s(x.id), src: 'marked on the job', desc: s(x.desc), room: s(x.room), what: s(x.what) || 'Found during the job', amount: r2(x.amount), qty: num(x.qty) || 1, unit: s(x.unit) || 'EA', photos: arr(x.photos) }); });
  return out;
}
/* the closeout of one claim. co: claim.closeout { supp: { state: 'found' | 'none' | 'requested' | 'approved' | 'denied',
   by, at, suppId, requested, approved }, dep: { requestedAt, refId, received: { amount, at, by } | null, denied, deniedAt },
   done, doneAt }; sent: what the claim's outbox shows (sentAt per refId); follow: gc_ins_closeout[claimId] (server). */
function closeoutState(c, p, opts){
  opts = opts || {}; var now = opts.now || Date.now(), co = (c && c.closeout) || {}, supp = co.supp || {}, dep = co.dep || {}, f = opts.follow || {};
  var due = closeoutDue(c, p), m = opts.money || {};
  var steps = [];
  var suppDone = /^(none|requested|approved|denied)$/.test(s(supp.state));
  steps.push({ k: 'supp', l: 'Supplement check', done: suppDone,
    text: supp.state === 'none' ? 'No supplement — checked by ' + s(supp.by) + ' ' + ymd(supp.at)
      : supp.state === 'requested' ? 'Supplement requested ' + money0(supp.requested) + (supp.sentAt ? ' · sent ' + ymd(supp.sentAt) : ' · waiting for approval')
      : supp.state === 'approved' ? 'Supplement approved ' + money0(supp.approved != null ? supp.approved : supp.requested)
      : supp.state === 'denied' ? 'Supplement denied' : 'Not checked yet — always first' });
  var depOpen = !(dep.received && num(dep.received.amount) >= 0 && dep.received.at) && !dep.denied;
  steps.push({ k: 'dep', l: 'Depreciation release', done: !depOpen,
    text: dep.received ? 'Received ' + money0(dep.received.amount) + ' ' + ymd(dep.received.at) : dep.denied ? 'Denied ' + ymd(dep.deniedAt)
      : dep.requestedAt ? 'Requested ' + ymd(dep.requestedAt) + (dep.sentAt ? ' · sent ' + ymd(dep.sentAt) : ' · waiting for approval') : 'Not requested yet' });
  var suppOpen = supp.state === 'requested';
  var nextFollow = function(sentAt, list){ var last = [s(sentAt)].concat(arr(list).map(function(x){ return s(x.at); })).filter(Boolean).sort().pop(); return last ? addDays(last, FOLLOW_DAYS) : ''; };
  var open = due && (!suppDone || depOpen || suppOpen);
  return {
    due: due, open: open, steps: steps, suppDone: suppDone, suppOpen: suppOpen, depOpen: depOpen,
    canRequestDep: suppDone, depRequested: !!dep.requestedAt,
    followDep: dep.sentAt && depOpen ? { next: nextFollow(dep.sentAt, f.dep), count: arr(f.dep).length } : null,
    followSupp: supp.sentAt && suppOpen ? { next: nextFollow(supp.sentAt, f.supp), count: arr(f.supp).length } : null,
    depOwed: depOpen ? r2(m.depOutstanding) : 0, suppPending: suppOpen ? r2(supp.requested) : 0
  };
}

/* ── 4. THE 7 AM DISPATCH ───────────────────────────────────────────────────── */
function isActiveJob(p){ return p && p.deleted !== true && !/complete|closed|lost|cancel|dead|archived/i.test(s(p.status)); }
/* the superintendent's jobs today: the job names them (superintendent / super), or a schedule row today names them */
function dispatchFor(name, data, today, extra){
  extra = extra || {}; var n = low(name); if (!n) return [];
  var first = n.split(/\s+/)[0], sched = arr(data.schedule).filter(function(x){ return !x.deleted && ymd(x.date) <= today && ymd(x.endDateSch || x.endDate || x.date) >= today && !/cancel/i.test(s(x.status)); });
  var named = function(v){ v = low(v); return !!v && (v.indexOf(n) >= 0 || (first.length >= 3 && new RegExp('(^|[^a-z])' + first + '([^a-z]|$)').test(v))); };
  var out = [];
  arr(data.projects).filter(isActiveJob).forEach(function(p){
    var pid = s(p.id), rows = sched.filter(function(x){ return pidOf(x) === pid; });
    var mine = low(p.superintendent || p.super) === n || rows.some(function(x){ return named(x.assignee) || named(x.super); });
    if (!mine || !rows.length && low(p.superintendent || p.super) !== n) return;
    if (!rows.length) return;   /* named on the job but nothing on the schedule today: not today's job */
    var cust = arr(data.customers).filter(function(c){ return low(c.name || c.company) === low(p.client); })[0] || {};
    var mats = arr(extra.orders).filter(function(o){ return s(o.pid) === pid && ymd(o.deliveryDate) === today && !o.deleted; }).map(function(o){ return o.supplier + (o.orderNo ? ' #' + o.orderNo : '') + (o.summary ? ' — ' + o.summary : ''); });
    var sb = (extra.sitebook || {})[pid] || {};
    arr(sb.deliveries).filter(function(d){ return !d.deleted && d.date === today && !/^ORD-/.test(s(d.id)); }).forEach(function(d){ mats.push([d.item, d.supplier].filter(Boolean).join(' — ')); });
    var punch = arr(data.punch).filter(function(x){ return pidOf(x) === pid && !x.deleted && !/complete|done|closed/i.test(s(x.status)); }).slice(0, 5).map(function(x){ return s(x.item || x.title || x.desc); }).filter(Boolean);
    out.push({ pid: pid, job: s(p.name), po: s(p.autoPO || p.po), address: s(p.address || p.jobAddress),
      maps: s(p.address || p.jobAddress) ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(s(p.address || p.jobAddress)) : '',
      tasks: rows.map(function(x){ return [s(x.title || x.type || 'Work'), s(x.time) ? '@ ' + s(x.time) : '', s(x.assignee) ? '(' + s(x.assignee) + ')' : ''].filter(Boolean).join(' '); }),
      notes: rows.map(function(x){ return s(x.notes || x.note); }).filter(Boolean).slice(0, 3),
      customer: { name: s(p.client || cust.name), phone: s(p.clientPhone || p.customerPhone || cust.phone) },
      pm: s(p.pm), materials: mats, punch: punch });
  });
  return out;
}

/* ── 8. THE ONE-YEAR NOTE ───────────────────────────────────────────────────── */
var ANNIV_TIPS = {
  roofing: 'Once a year (and after big storms) take a look from the ground for missing or lifted shingles, keep gutters and valleys clear so water drains, and trim branches that touch the roof. Call us if you see anything — your roof is under our 5-year workmanship warranty.',
  water: 'Keep an eye on the areas we dried and repaired — any new staining, musty smell or soft spots is worth a call. Check washing-machine hoses, the water heater and under-sink lines once a year.',
  fire: 'Change your HVAC filters regularly over the first year to keep any leftover odor down, and test your smoke detectors twice a year.',
  remodel: 'Re-caulk around tubs, showers and sinks when you see gaps, wipe cabinets with a soft damp cloth (no harsh cleaners), and run bathroom fans 20 minutes after showers.',
  commercial: 'A yearly walk of the roof, sealants and entry doors catches small issues before they become big ones — we are glad to do it with you.',
  general: 'A quick yearly look at caulk, paint and anything that moves or gets wet catches small issues early. We are always glad to take a look.'
};
/* jobs whose completion date was exactly one year ago (or within the last 6 days, so a missed day still sends).
   patch AUTOC 4 (owner 10/29 "17 yes for approval only"): also the 6-month check-up — { months: 6 | 12 } */
function annivDue(projects, today){
  var out = [];
  arr(projects).forEach(function(p){
    if (!p || p.deleted === true || /lost|cancel|dead/i.test(s(p.status))) return;
    var done = ymd(p.completionDate || p.completedAt); if (!done) return;
    [12, 6].forEach(function(months){
      var d1 = new Date(done + 'T12:00:00Z'), day = d1.getUTCDate(); d1.setUTCDate(1); d1.setUTCMonth(d1.getUTCMonth() + months);
      var last = new Date(Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth() + 1, 0)).getUTCDate(); d1.setUTCDate(Math.min(day, last));
      var due = d1.toISOString().slice(0, 10);
      var late = days(due, today);
      if (late != null && late >= 0 && late <= 6) out.push({ pid: s(p.id), due: due, done: done, months: months });
    });
  });
  return out;
}
/* patch AUTOC 4: what the check-up asks about ("How's your new roof holding up?") */
var CHECKUP_WHAT = { roofing: 'roof', water: 'repairs', fire: 'home', remodel: 'remodel', commercial: 'building', general: 'project' };
function checkupWhat(p, claim){ var t = low([p && p.name, p && p.type, p && p.scope].map(s).join(' ')); if (/kitchen/.test(t)) return 'kitchen'; if (/bath/.test(t)) return 'bathroom'; if (/floor/.test(t)) return 'floors'; if (/deck|patio/.test(t)) return 'deck'; if (/siding/.test(t)) return 'siding'; if (/gutter/.test(t) && !/roof/.test(t)) return 'gutters'; return CHECKUP_WHAT[jobKind(p, claim)] || 'project'; }
function annivTip(p, tips, claim){ tips = tips || {}; var k = jobKind(p, claim); var j = (tips.jobs || {})[s(p.id)]; return s(j) || s((tips.types || {})[k]) || ANNIV_TIPS[k] || ANNIV_TIPS.general; }

return { s: s, low: low, arr: arr, num: num, ymd: ymd, addDays: addDays, days: days, money0: money0, pidOf: pidOf,
  jobKind: jobKind, isInsurance: isInsurance, PHOTO_LISTS: PHOTO_LISTS, STAGE_ORDER: STAGE_ORDER, photoChecklist: photoChecklist, photosMissing: photosMissing,
  warranty: warranty, TICKET_SLA_H: TICKET_SLA_H, ticketState: ticketState, TICKET_STATUS: TICKET_STATUS,
  subScore: subScore, sameSub: sameSub, SUPPLIERS: SUPPLIERS, parseOrder: parseOrder, parseDateWords: parseDateWords, matchOrder: matchOrder,
  MTG_STAGES: MTG_STAGES, MTG_REMIND_DAYS: MTG_REMIND_DAYS, mtgChecks: mtgChecks,
  FOLLOW_DAYS: FOLLOW_DAYS, closeoutDue: closeoutDue, suppCandidates: suppCandidates, closeoutState: closeoutState,
  dispatchFor: dispatchFor, isActiveJob: isActiveJob, ANNIV_TIPS: ANNIV_TIPS, annivDue: annivDue, annivTip: annivTip, checkupWhat: checkupWhat };
});
