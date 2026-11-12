/* ============================================================================
   GrayCo — ONE LEAD PER PROJECT (patch BIDMERGE).   netlify/functions/_lib/bid-merge.js

   Owner (11/02): "When bids come in the CRM but we got 9 invitations for the same job but different trades, only
   alert us the one time, and when other companies send the bid to us still alert the one time, just have it list
   for 2 GCs etc. I don't want too many leads for separate trades clogging up our CRM and emails."

   The rules (one copy, used by the server — bid-inbox.js upsert / applyAct — and, copied VERBATIM between the
   CORE-BEGIN / CORE-END lines by tools/patch_BIDMERGE.py, by the CRM page's "🔗 Merge duplicate bid leads"):

   Two bid invitations are the SAME PROJECT when
     · they carry the same BuildingConnected / PlanHub project id (a link to /projects/<id> or /opportunities/<id>), or
     · the same public bid number (not a GC's package number: "BP-09", "Bid Package 3", "OPP-123", "Div 09"), or
     · the same street address (number + street), the bid due within DUE_DAYS of each other, and the names share a real
       word ("Hollister #30684 – Flooring" / "Hollister – The Avenue (AW-KK): Stucco" at 2615 Medical Center Pkwy), or
     · the same project name once the trade / package part is taken off ("UrgentVet - Memphis - Drywall & Framing",
       "Re: UrgentVet - Memphis (Painting)", "Fwd: Reminder to bid - UrgentVet - Memphis") in the same city, or with
       bid due dates within DUE_DAYS when a city is missing; or one name holds the other with a real word ("UrgentVet" /
       "UrgentVet - Memphis") in the same city with the bid due within 3 days.
   They are NEVER the same project when both have a street address and the addresses differ, both have a city and
   the cities differ, both have a public bid number and the numbers differ, or (unless it is an addendum or the same
   board project id) their bid due dates are more than DUE_DAYS apart. Sharing a GC, an owner or a sender is never a
   reason: "Maintenance Shop at GE Patterson Pointe" and "... at Kefauver Terrace" (both Memphis Housing Authority)
   stay two leads.

   The lead keeps every GC in gcs: [{ key, name, contact, email, phone, due, trades, packages, link, source, at }];
   the lead's bid due is the EARLIEST of them (unless a person typed one).
   ========================================================================== */
/* CORE-BEGIN — patch BIDMERGE: ES5, no require(); runs on the server and in the CRM page */
(function(root){
'use strict';
var DUE_DAYS = 5, NEAR_DAYS = 3, ID_DAYS = 60;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function words(list){ var o = {}; list.split(/\s+/).forEach(function(w){ if (w) o[w] = 1; }); return o; }
function uniq(list, key){ var seen = {}, out = []; list.forEach(function(x){ if (x == null) return; var k = key ? key(x) : low(x); if (!k || seen[k]) return; seen[k] = 1; out.push(x); }); return out; }

/* a part of a title made only of these words is a trade / bid package, not the project */
var TRADE = words('acoustical acoustic acoustics ceiling ceilings act drywall gypsum gyp framing frame studs stud cfmf lgmf paint painting painter coatings coating wallcovering wallcoverings vinyl '
  + 'flooring floor floors carpet carpeting tile tiling resilient lvt vct terrazzo epoxy polished sealed concrete masonry brick block cmu stone cast precast steel structural misc miscellaneous metal metals '
  + 'fabrication fabricated ornamental rough finish carpentry millwork casework cabinets cabinetry countertops counters doors door frames frame hardware dfh hm hollow glazing glass storefront storefronts '
  + 'curtainwall curtain windows window insulation spray foam firestopping firestop fireproofing caulking caulk sealants sealant joint joints waterproofing dampproofing air vapor barrier barriers '
  + 'roofing roof roofs reroofing membrane tpo epdm pvc sbs bur modified bitumen shingles shingle sheet flashing flashings gutters gutter downspouts siding eifs stucco plaster lath veneer '
  + 'demolition demo selective abatement asbestos earthwork earthworks excavation grading sitework site utilities utility paving pavement asphalt striping landscaping landscape irrigation '
  + 'fencing fence gates signage signs sign toilet accessories partitions compartments specialties specialty lockers fire extinguishers extinguisher protection sprinkler sprinklers suppression '
  + 'plumbing mechanical hvac electrical low voltage data security alarm alarms controls elevator elevators conveying equipment appliances blinds shades furnishings furniture fixtures '
  + 'general trades trade interiors exteriors interior exterior division div scope scopes package packages pkg bp bid bids labor material materials install installation installed supply '
  + 'only and or of the with for to all other various remaining work works sub subcontract subcontractor subcontractors finishes thermal moisture openings services');
var STATE = words('tn ms ar al ky mo ga tx la tennessee mississippi arkansas alabama kentucky missouri georgia texas louisiana usa us');
var STOP = words('the a an of for and at to in on project projects bid bids bidding invite invitation invitations itb ifb rfp rfq rfb request proposal proposals new rebid re fw fwd reminder '
  + 'update updated due notice opportunity opportunities');
var GENERIC = words('building buildings school schools church center centre office offices renovation renovations addition additions construction phase improvements improvement repair repairs roof reroof '
  + 'replacement tenant finish buildout remodel facility facilities maintenance shop apartment apartments fire park store retail restaurant clinic hospital medical high middle elementary county city '
  + 'state university college campus hall station warehouse plant north south east west upgrades upgrade expansion ti shell core space suite unit units interior exterior general new existing complex '
  + 'services service hvac plumbing electrical mechanical courts court open');
var ABBR = { bldg: 'building', bldgs: 'buildings', ctr: 'center', cntr: 'center', centre: 'center', hs: 'high', es: 'elementary', elem: 'elementary', sch: 'school', hosp: 'hospital', med: 'medical',
  ofc: 'office', univ: 'university', dept: 'department', fac: 'facility', reno: 'renovation', renovations: 'renovation', repairs: 'repair', roofs: 'roof', reroofing: 'reroof', st: 'saint', mt: 'mount',
  ft: 'fort', ph: 'phase', ti: 'tenant', improvements: 'improvement' };
var PREFIX = /^\s*((re|fw|fwd|aw|tr)\s*:\s*|(reminder\s*(to\s*bid)?|bid\s*reminder|invitation\s*to\s*bid|bid\s*invitation|invite\s*to\s*bid|bid\s*invite|you('|’)?re\s*invited\s*to\s*bid(\s*on)?|new\s*(bid\s*)?(opportunity|project)|project\s*(invitation|update|reminder)|updated?|(itb|ifb|rfp|rfq|rfb)|request\s*for\s*(bids?|proposals?|quotes?|qualifications?)|addendum\s*(no\.?|#|number)?\s*\d*|bid\s*due(\s*(today|tomorrow|soon))?|due\s*(today|tomorrow))\s*(:|-|–|—|\|)\s*)+/i;
var PKG = /\b(bid\s*package|package|pkg|bp|div(ision)?|csi|opp(ortunity)?|trade\s*package|scope\s*package)\s*(no\.?|#|number)?\s*[:#-]?\s*[a-z]?\d+[a-z0-9.\-]*\b/gi;

/* ── one invitation, read the same way from an inbox item (server) or a lead (CRM) ── */
function streetOf(a){
  var t = low(a).split(',')[0];
  t = t.replace(/#\s*[\w-]+/g, ' ').replace(/\b(apt|suite|ste|unit|bldg|building|fl|floor|rm|room|space|spc)\b\.?\s*[\w-]*.*$/, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/^\d+[a-z]?\s+\S+/.test(t)) return '';
  var A = { street: 'st', road: 'rd', avenue: 'ave', av: 'ave', drive: 'dr', lane: 'ln', boulevard: 'blvd', court: 'ct', place: 'pl', parkway: 'pkwy', highway: 'hwy', circle: 'cir', cove: 'cv', terrace: 'ter', trail: 'trl',
    north: 'n', south: 's', east: 'e', west: 'w', u: '', s: 's' };
  return t.split(' ').map(function(w){ return A[w] != null ? A[w] : w; }).filter(Boolean).join(' ');
}
function cityOf(x){
  var c = low(x.city);
  if (!c) { var m = /,\s*([^,\d][^,]*?),\s*([a-z]{2})\b[^,]*$/i.exec(s(x.address)); if (m) c = low(m[1]); }
  c = c.replace(/,.*$/, '').replace(/\b(city of|town of)\b/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return STATE[c] ? '' : c;
}
function sameCity(a, b){ if (!a || !b) return null; if (a === b) return true; return (' ' + a).slice(-b.length - 1) === ' ' + b || (' ' + b).slice(-a.length - 1) === ' ' + a; }   /* "north little rock" ~ "little rock" */
function titleOf(x){ return s(x.title || x.name); }
function linksOf(x){ return arr(x.plansLinks).concat(arr(x.gcs).map(function(g){ return { url: g && g.link }; })); }
function portalIds(x){
  var out = [];
  linksOf(x).forEach(function(l){
    var u = low(l && l.url), m;
    if ((m = /buildingconnected\.com\/(?:[^?#]*?\/)?(projects|opportunities)\/([a-z0-9]{8,})/.exec(u))) out.push('bc:' + m[2]);
    if ((m = /planhub\.com\/(?:[^?#]*?\/)?projects?\/(?:details\/)?([a-z0-9-]{4,})/.exec(u)) || (m = /planhub\.com\/[^#]*?[?&]project(?:_?id)?=([a-z0-9-]{4,})/.exec(u))) out.push('ph:' + m[1]);
    if ((m = /constructconnect\.com\/(?:[^?#]*?\/)?projects?\/(\d{4,})/.exec(u))) out.push('cx:' + m[1]);
  });
  if (s(x.bcId)) out.push('bc:' + low(x.bcId));
  return uniq(out);
}
/* a public bid number ("ITB 2026-014", "CI 27 B 00784"); a GC's package number is not one */
function bidNo(n){
  var t = low(n); if (!t || /^(bp|pkg|package|bid\s*package|div|division|csi|opp|trade)\b/.test(t)) return '';
  t = t.replace(/[^a-z0-9]+/g, ''); return t.length >= 5 && /\d/.test(t) ? t : '';
}
/* the project's name without the trade / package part: { tokens, packages } */
function titleInfo(title, city){
  var t = s(title).replace(/\s+/g, ' '), packages = [];
  for (var i = 0; i < 4; i++) { var t2 = t.replace(PREFIX, ''); if (t2 === t) break; t = t2; }
  t = t.replace(PKG, function(m){ packages.push(s(m)); return ' | '; });
  var cityW = words(low(city).replace(/[^a-z ]+/g, ' '));
  var segs = t.split(/\s+[-–—|\/]\s+|\s*[:|()\[\]–—]\s*|,\s*|\s+-|-\s+/), keep = [];
  segs.forEach(function(seg){
    var raw = s(seg), w = low(raw).replace(/&/g, ' and ').split(/[^a-z0-9#]+/).filter(Boolean);
    if (!w.length) return;
    if (w.every(function(x){ return TRADE[x] || /^\d{1,2}$/.test(x); }) && w.some(function(x){ return TRADE[x] && !STOP[x] && x !== 'and' && x !== 'or'; })) { packages.push(raw); return; }
    if (w.every(function(x){ return STATE[x] || cityW[x]; })) return;   /* "Memphis", "Murfreesboro, Tennessee" */
    keep.push(w);
  });
  var tokens = [];
  keep.forEach(function(w){ w.forEach(function(x){ x = x.replace(/^#/, ''); x = ABBR[x] || x; if (!x || STOP[x] || STATE[x] || cityW[x] || tokens.indexOf(x) >= 0) return; tokens.push(x); }); });
  return { tokens: tokens, packages: uniq(packages) };
}
/* the name to show: the e-mail's words without the "Invitation to Bid:" / trade / package parts ("UrgentVet - Memphis") */
function cleanTitle(title, city){
  var raw = s(title).replace(/\s+/g, ' '), t = raw;
  for (var i = 0; i < 4; i++) { var t2 = t.replace(PREFIX, ''); if (t2 === t) break; t = t2; }
  t = t.replace(PKG, ' | ');
  var segs = t.split(/\s+[-\u2013\u2014|\/]\s+|\s*[:|()\[\]\u2013\u2014]\s*|\s+-|-\s+/), keep = [], seen = {};
  segs.forEach(function(seg){
    var x = s(seg).replace(/^[,;\s]+|[,;\s]+$/g, ''), w = low(x).replace(/&/g, ' and ').split(/[^a-z0-9#]+/).filter(Boolean);
    if (!w.length || seen[low(x)]) return;
    if (w.every(function(y){ return TRADE[y] || /^\d{1,2}$/.test(y); }) && w.some(function(y){ return TRADE[y] && !STOP[y] && y !== 'and' && y !== 'or'; })) return;
    seen[low(x)] = 1; keep.push(x);
  });
  var out = keep.join(' - ');
  return titleInfo(out, city).tokens.length ? out : raw;
}
function distinct(x){ return (x.length >= 3 && !GENERIC[x] && !TRADE[x] && !/^\d+$/.test(x)) || /^\d{3,}$/.test(x); }
function titleSim(A, B){
  if (!A.length || !B.length) return { eq: false, sub: false, j: 0, shared: 0 };
  var inB = {}, inA = {}; B.forEach(function(x){ inB[x] = 1; }); A.forEach(function(x){ inA[x] = 1; });
  var both = A.filter(function(x){ return inB[x]; }), all = { length: A.length + B.length - both.length };   /* the tokens of one name are unique */
  var small = A.length <= B.length ? A : B, big = small === A ? inB : inA;
  var sub = small.every(function(x){ return big[x]; }) && small.some(distinct);
  return { eq: both.length === A.length && both.length === B.length, sub: sub, j: both.length / all.length, shared: both.filter(distinct).length };
}
function dueOf(x){ return s(x.bidDue || x.due); }
var DAYS = {}, NDAYS = 0;
function dayN(d){ d = d == null ? '' : String(d).slice(0, 10); var v = DAYS[d]; if (v !== undefined) return v; if (++NDAYS > 5000) { DAYS = {}; NDAYS = 0; } var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return (DAYS[d] = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN); }
function gapDays(a, b){ var x = dayN(a), y = dayN(b); return isFinite(x) && isFinite(y) ? Math.abs(x - y) : null; }
/* a is a SOONER due than b: an earlier day, or the same day with both times and an earlier time */
function sooner(a, b){
  a = s(a); b = s(b); if (!a || !b) return false;
  var x = dayN(a), y = dayN(b); if (!isFinite(x) || !isFinite(y)) return false;
  if (x !== y) return x < y;
  return a.length > 10 && b.length > 10 && a.slice(11, 16) < b.slice(11, 16);
}
function earliest(list){ var e = ''; arr(list).forEach(function(d){ d = s(d); if (d && isFinite(dayN(d)) && (!e || sooner(d, e))) e = d; }); return e; }
var INFO = typeof WeakMap === 'function' ? new WeakMap() : null;   /* read once per record (the inbox holds thousands; a record that changes is read again) */
function info(x){
  var sig = (x.title || x.name || '') + '\u0001' + (x.city || '') + '\u0001' + (x.address || '') + '\u0001' + (x.bidNumber || '') + '\u0001' + (x.bidDue || x.due || '') + '\u0001' + (x.addendum ? 1 : 0) + (x.plansLinks ? x.plansLinks.length : 0) + '.' + (x.gcs ? x.gcs.length : 0) + (x.bcId || '');
  var c = INFO && x && typeof x === 'object' ? INFO.get(x) : null; if (c && c.sig === sig) return c.v;
  var city = cityOf(x), t = titleInfo(titleOf(x), city);
  var v = { city: city, street: streetOf(x.address), tokens: t.tokens, packages: t.packages, ids: portalIds(x), no: bidNo(x.bidNumber), due: dueOf(x), add: !!x.addendum };
  if (INFO && x && typeof x === 'object') INFO.set(x, { sig: sig, v: v });
  return v;
}

/* patch LEADBOTH-SAMEJOB (owner 11/12: "63800 - Desoto County Schools Press Box Improvements Phase 2" ⟷ "63789 - … Phase 1": "I cleared
   these once before"): the numbers in a project's NAME tell jobs apart. numsOf(title) → { ids: the project / bid numbers (a leading
   "63800 -", "Bid #…", "Project No. …"), nums: other 4+ digit numbers (not years), parts: { phase, package, area, building } }.
   diffJob(a, b, ask) → why they are different jobs ('' = nothing says so): different ids, or a different Phase / Area / Building value;
   for the "Same job?" question (ask) also: both with other 4+ digit numbers and none in common, or a different Package number. */
var ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
function partVal(v){ v = low(v); return ROMAN[v] ? String(ROMAN[v]) : String(/^\d+$/.test(v) ? parseInt(v, 10) : v); }
function numsOf(title){
  var t = s(title), ids = [], nums = [], parts = {}, m;
  if ((m = /^\s*#?\s*(\d{4,}[a-z]?)\b/i.exec(t))) ids.push(low(m[1]));
  var IDRX = /\b(?:bid|project|proj|job|solicitation|contract|rfp|rfq|itb|ifb)\s*(?:#|no\.?|num(?:ber)?)\s*:?\s*([a-z0-9][a-z0-9-]*\d[a-z0-9-]*)/gi;
  while ((m = IDRX.exec(t))) ids.push(low(m[1]).replace(/-/g, ''));
  var NRX = /\b(\d{4,})\b/g; while ((m = NRX.exec(t))) { var n = m[1]; if (/^(19|20)\d\d$/.test(n)) continue; if (ids.indexOf(n) < 0) nums.push(n); }
  var PRX = /\b(phase|ph|bid\s*package|package|pkg|bp|area|building|bldg)\.?\s*(?:#|no\.?)?\s*([0-9]{1,3}|[ivx]{1,4}|[a-h])\b/gi;
  while ((m = PRX.exec(t))) { var k = low(m[1]).replace(/\s+/g, ' '); k = /^ph/.test(k) ? 'phase' : /package|pkg|^bp$/.test(k) ? 'package' : /^b(ui)?ld/.test(k) ? 'building' : 'area'; (parts[k] = parts[k] || []).push(partVal(m[2])); }
  return { ids: uniq(ids), nums: uniq(nums), parts: parts };
}
function diffJob(a, b, ask){
  var x = numsOf(titleOf(a)), y = numsOf(titleOf(b)), i;
  var bx = bidNo(a && a.bidNumber), by = bidNo(b && b.bidNumber); if (bx) x.ids.push(bx); if (by) y.ids.push(by);
  if (x.ids.length && y.ids.length && !x.ids.some(function(v){ return y.ids.indexOf(v) >= 0; })) return 'different project / bid numbers (' + x.ids[0] + ' · ' + y.ids[0] + ')';
  if (ask && x.nums.length && y.nums.length && !x.nums.some(function(v){ return y.nums.indexOf(v) >= 0; })) return 'different numbers in the names (' + x.nums[0] + ' · ' + y.nums[0] + ')';
  var K = ['phase', 'area', 'building'].concat(ask ? ['package'] : []);
  for (i = 0; i < K.length; i++) { var p = x.parts[K[i]], q = y.parts[K[i]]; if (p && q && !p.some(function(v){ return q.indexOf(v) >= 0; })) return 'different ' + K[i] + ' (' + p[0] + ' · ' + q[0] + ')'; }
  return '';
}
/* ── are a and b the same project? { ok, why } or { no, why } (a hard "never") ── */
function same(a, b, A, B){
  A = A || info(a); B = B || info(b); var i;
  if (!titleOf(a) || !titleOf(b)) return { ok: false, why: 'no name' };
  var dj = diffJob(a, b, false); if (dj) return { no: true, why: dj };   /* patch LEADBOTH-SAMEJOB */
  var gap = gapDays(A.due, B.due), addOk = A.add || B.add;
  for (i = 0; i < A.ids.length; i++) if (B.ids.indexOf(A.ids[i]) >= 0) {
    if (gap != null && gap > ID_DAYS) return { no: true, why: 'same board id, bid due ' + gap + ' days apart' };
    return { ok: true, why: 'same ' + (/^bc:/.test(A.ids[i]) ? 'BuildingConnected' : /^ph:/.test(A.ids[i]) ? 'PlanHub' : 'board') + ' project' };
  }
  if (A.no && B.no && A.no !== B.no) return { no: true, why: 'different bid numbers' };
  if (A.street && B.street && A.street !== B.street) return { no: true, why: 'different addresses' };
  var t = titleSim(A.tokens, B.tokens), sameSt = !!A.street && A.street === B.street;
  if (A.no && A.no === B.no) {   /* the same public bid # — and the names agree, or the address does (a bid # copied onto the wrong lead never joins two projects) */
    if (gap != null && gap > 30 && !addOk) return { no: true, why: 'same bid #, due ' + gap + ' days apart' };
    if (t.eq || t.sub || t.shared >= 1 || sameSt) return { ok: true, why: 'same bid number' };
  }
  var cs = sameCity(A.city, B.city);
  if (cs === false) return { no: true, why: 'different cities' };
  if (gap != null && gap > DUE_DAYS && !addOk) return { no: true, why: 'bid due ' + gap + ' days apart' };
  if (sameSt && (t.eq || t.sub || t.j >= 0.5 || t.shared >= 1)) return { ok: true, why: 'same address' + (gap != null ? ', due ' + (gap ? gap + ' day' + (gap === 1 ? '' : 's') + ' apart' : 'the same day') : '') };
  if (t.eq && (cs === true || (gap != null && gap <= DUE_DAYS))) return { ok: true, why: 'same project name' + (cs ? ', same city' : ', due within ' + DUE_DAYS + ' days') };
  if ((t.sub || t.j >= 0.67) && t.shared >= 1 && cs === true && (gap == null || gap <= NEAR_DAYS)) return { ok: true, why: 'same name (one holds the other), same city' };
  return { ok: false, why: 'different names' };
}

/* ── the GCs on one project ── */
var CO_DROP = words('inc llc co corp corporation company ltd lp llp pllc pc the construction constructors contractors contracting contractor builders building group general services gc');
var PLAT = /(planhub|buildingconnected|constructconnect|isqft|dodge|bidnet|procore|smartbid|pipelinesuite|autodesk|noreply|no-reply|donotreply|notification)/;
function coKey(name){
  var t = low(name).replace(/&/g, ' and ').replace(/[.,']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  var w = t.split(' ').filter(function(x){ return x && !CO_DROP[x]; });
  return w.length ? w.join(' ') : t;
}
function domainOf(e){ e = low(e); var i = e.lastIndexOf('@'); var d = i >= 0 ? e.slice(i + 1) : ''; return d && !PLAT.test(d) && !/^(gmail|yahoo|outlook|hotmail|aol|icloud|grayco-cs)\./.test(d) ? d : ''; }
function boardLink(x){
  var ls = arr(x.plansLinks).filter(function(l){ return l && /^https?:\/\//.test(s(l.url)); });
  var b = ls.filter(function(l){ return /buildingconnected|planhub|constructconnect|planroom|isqft|procore/i.test(s(l.url) + ' ' + s(l.board)); });
  return s((b[0] || ls[0] || {}).url);
}
function contactOf(x){
  var c = x.contact && typeof x.contact === 'object' ? x.contact : {};
  return { name: s(x.dueToContact) || s(c.name) || s(x.contactName) || (typeof x.contact === 'string' ? s(x.contact) : ''), email: low(x.dueToEmail) || low(c.email) || low(x.email), phone: s(x.dueToPhone) || s(c.phone) || s(x.phone) };
}
/* one invitation → its GC row */
function gcOf(x, at){
  var who = contactOf(x), name = s(x.dueToCompany) || s(x.gc) || s(x.owner) || s(x.company);
  if (who.email && PLAT.test(low(who.email))) who.email = '';
  var key = coKey(name) || domainOf(who.email) || ('src:' + low(x.source || 'unknown'));
  return { key: key, name: name || (domainOf(who.email) || s(x.source) || 'Unknown GC'), contact: who.name, email: who.email, phone: who.phone, due: dueOf(x),
    trades: uniq(arr(x.trades).map(s).filter(Boolean)).slice(0, 30), packages: info(x).packages.slice(0, 8), link: boardLink(x), source: s(x.source), at: s(at || x.receivedAt || x.createdAt || x.inboxAt) };
}
function seedGcs(x){
  if (arr(x.gcs).length) return arr(x.gcs).filter(function(g){ return g && g.key; }).map(function(g){ return Object.assign({}, g, { trades: arr(g.trades).slice(), packages: arr(g.packages).slice() }); });
  return [gcOf(x)];
}
/* add one GC row to a list: { gcs, added (a new GC), newTrades, changed } */
function addGc(list, g){
  list = arr(list).slice();
  var i = -1; list.forEach(function(x, j){ if (i < 0 && x && x.key === g.key) i = j; });
  /* a row with no GC name from the same board (the AI missed it) is this named GC: it takes the name instead of counting twice */
  if (i < 0 && !/^src:/.test(g.key)) list.forEach(function(x, j){ if (i < 0 && x && x.key === 'src:' + low(g.source || 'unknown')) { i = j; list[j] = Object.assign({}, x, { key: g.key, name: g.name }); } });
  if (i < 0 && /^src:/.test(g.key)) { var named = []; list.forEach(function(x, j){ if (x && !/^src:/.test(x.key) && low(x.source) === low(g.source)) named.push(j); }); if (named.length === 1) i = named[0]; }   /* only when it can be only that one */
  if (i < 0) { list.push(g); return { gcs: list, added: true, newTrades: g.trades.slice(), changed: true, gc: g }; }
  var cur = Object.assign({}, list[i]), before = JSON.stringify(cur);
  var had = {}; arr(cur.trades).forEach(function(t){ had[low(t)] = 1; });
  var newTrades = arr(g.trades).filter(function(t){ return !had[low(t)]; });
  cur.trades = uniq(arr(cur.trades).concat(arr(g.trades))).slice(0, 30);
  cur.packages = uniq(arr(cur.packages).concat(arr(g.packages))).slice(0, 8);
  ['contact', 'email', 'phone', 'link', 'source', 'name'].forEach(function(f){ if (!s(cur[f]) && s(g[f])) cur[f] = g[f]; });
  if (/^src:/.test(g.key) && !/^src:/.test(cur.key)) { cur.name = list[i].name; }
  if (s(g.due) && !(s(cur.due).length > 10 && s(g.due).length === 10 && s(cur.due).slice(0, 10) === s(g.due))) cur.due = g.due;   /* the GC's latest date (a date alone never wipes the time it gave) */
  list[i] = cur;
  return { gcs: list, added: false, newTrades: newTrades, changed: JSON.stringify(cur) !== before, gc: cur };
}
function tradesOf(x){ var t = arr(x.trades).slice(); arr(x.gcs).forEach(function(g){ t = t.concat(arr(g && g.trades)); }); return uniq(t.map(s).filter(Boolean)); }
function summary(x){
  var n = arr(x.gcs).length, t = tradesOf(x).length, bits = [];
  if (n > 1) bits.push(n + ' GCs'); if (t > 1) bits.push(t + ' trades');
  return { gcs: n, trades: t, text: bits.join(' · ') };
}
function gcLine(g, newTrades){
  var t = arr(newTrades && newTrades.length ? newTrades : g.trades).concat(arr(g.packages).filter(function(p){ return !arr(g.trades).some(function(t){ return low(p).indexOf(low(t)) >= 0; }); }));
  return s(g.name) + (t.length ? ' (' + t.slice(0, 6).join(', ') + (t.length > 6 ? ' +' + (t.length - 6) : '') + ')' : '');
}

/* ── existing leads: the groups of the same project (the dry run) ── */
function isBidLead(l){
  if (!l || !l.id) return false;
  if (l.websiteLead || l.textMessage || l.rsLeadId || /^(website|brain|portal|partner|referral)$/i.test(s(l.origin))) return false;
  if (s(l.inboxId) || s(l.bidRole) || s(l.dueToCompany) || s(l.bidNumber)) return true;
  if (/buildingconnected|planhub|constructconnect|isqft|bid\s*board|plan\s*room|schools|county|city of|state of|airport|government/i.test(s(l.source))) return true;
  return /commercial|government/i.test(s(l.leadKind)) && !!s(l.bidDue);
}
function liveLead(l){
  return l && l.id && !l.deleted && !l._deleted && !l.deletedAt && !l.archived && !l.mergedInto && !l.converted && !s(l.pid) && !/^(won|lost|dead)$/i.test(s(l.stage)) && !/converted|archived|merged/i.test(s(l.status));
}
function tms(v){ var t = Date.parse(s(v)); return isFinite(t) ? t : 0; }
function received(l){ return tms(l.inboxAt) || tms(l.receivedAt) || tms(l.createdAt) || tms(l.created) || tms(l.date) || 0; }
function richness(l){
  var n = 0; ['name', 'address', 'city', 'bidDue', 'gc', 'dueToCompany', 'phone', 'email', 'estimator', 'pm', 'scope', 'bidNumber'].forEach(function(f){ if (s(l[f])) n++; });
  return n + arr(l.activity).length * 2 + arr(l.docs).length + arr(l.plansLinks).length + (s(l.estimator) || s(l.pm) ? 6 : 0) + (/^LEADIN-/.test(s(l.id)) && s(l.inboxId) ? 4 : 0);
}
function groups(list){
  var live = arr(list).filter(function(l){ return liveLead(l) && isBidLead(l); }).sort(function(a, b){ return (received(a) || 9e15) - (received(b) || 9e15) || (s(a.id) < s(b.id) ? -1 : 1); });
  /* every pair once; a pair that may never be one project keeps their groups apart (no chain A~B~C joins two projects) */
  var I = live.map(info), n = live.length, P = [], no = {}, why = {}, i, j;
  for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) { var r = same(live[i], live[j], I[i], I[j]); if (r.no) no[i + ',' + j] = 1; else if (r.ok) { P.push([i, j]); why[i + ',' + j] = r.why; } }
  var up = live.map(function(l, k){ return k; }), mem = live.map(function(l, k){ return [k]; });
  function root(x){ while (up[x] !== x) x = up[x] = up[up[x]]; return x; }
  var reasons = {};
  P.forEach(function(p){
    var a = root(p[0]), b = root(p[1]); if (a === b) { (reasons[a] = reasons[a] || {})[why[p[0] + ',' + p[1]]] = 1; return; }
    var clash = mem[a].some(function(x){ return mem[b].some(function(y){ return no[Math.min(x, y) + ',' + Math.max(x, y)]; }); });
    if (clash) return;
    up[b] = a; mem[a] = mem[a].concat(mem[b]); mem[b] = [];
    reasons[a] = Object.assign(reasons[a] || {}, reasons[b] || {}); reasons[a][why[p[0] + ',' + p[1]]] = 1;
  });
  var cl = [];
  for (i = 0; i < n; i++) if (root(i) === i && mem[i].length > 1) cl.push({ leads: mem[i].map(function(k){ return live[k]; }), why: Object.keys(reasons[i] || {}) });
  return cl.filter(function(c){ return c.leads.length > 1; }).map(function(c){
    var ranked = c.leads.slice().sort(function(a, b){ return richness(b) - richness(a) || (received(a) || 9e15) - (received(b) || 9e15); });
    var gcs = []; c.leads.forEach(function(l){ seedGcs(l).forEach(function(g){ gcs = addGc(gcs, g).gcs; }); });
    return { keeper: ranked[0].id, ids: ranked.map(function(l){ return l.id; }), why: c.why, leads: ranked, gcs: gcs, trades: tradesOf({ gcs: gcs }), due: earliest(gcs.map(function(g){ return g.due; }).concat(c.leads.map(dueOf))) };
  }).sort(function(a, b){ return b.ids.length - a.ids.length; });
}
/* fold others into keeper (pure; a copy): every GC, contact, file, link, e-mail, note and history line is kept */
function mergeLeads(keeper, others, o){
  o = o || {}; var at = o.at || new Date().toISOString(), by = s(o.by) || 'GrayCo';
  var k = JSON.parse(JSON.stringify(keeper)), all = [keeper].concat(others);
  var gcs = seedGcs(keeper); others.forEach(function(l){ seedGcs(l).forEach(function(g){ gcs = addGc(gcs, g).gcs; }); });
  k.gcs = gcs; k.trades = tradesOf(k).slice(0, 40);
  var nm = cleanTitle(s(keeper.name || keeper.title), cityOf(keeper)); if (nm && nm !== s(keeper.name || keeper.title)) { k.nameWas = s(keeper.name || keeper.title); if ('name' in keeper || !('title' in keeper)) k.name = nm; else k.title = nm; }
  var key = function(x){ return typeof x === 'object' ? s(x.hash || x.ref || x.url || x.id || x.subject + '|' + x.date || x.email || x.name) || JSON.stringify(x) : low(x); };
  ['docs', 'files', 'plansLinks', 'emails', 'contacts', 'coAssignees', 'stageHistory', 'matchNotes'].forEach(function(f){
    var m = uniq([].concat.apply([], all.map(function(l){ return arr(l[f]); })), key); if (m.length) k[f] = m;
  });
  k.sources = uniq([].concat.apply([], all.map(function(l){ return arr(l.sources).concat([l.source]); })).filter(Boolean));
  k.alsoOn = k.sources.filter(function(n){ return low(n) !== low(k.source); });
  ['address', 'city', 'state', 'zip', 'gc', 'owner', 'bidNumber', 'dueToCompany', 'dueToContact', 'dueToEmail', 'dueToPhone', 'submitMethod', 'submitWhere', 'contactName', 'phone', 'email', 'scope', 'preBid',
    'estimator', 'estimatorEmail', 'pm', 'pmEmail', 'rawEmailRef', 'estVal', 'estValue'].forEach(function(f){ if (!s(k[f])) { var d = others.filter(function(l){ return s(l[f]); })[0]; if (d) k[f] = d[f]; } });
  /* patch LEADKEEP: what a person set on a copy is not lost in the merge — the newest priority / stage / "also on" by its own time; Different-jobs and tags added up */
  [['priority', 'prioritySetAt', ['prioritySetBy']], ['stage', 'stageChangedAt', []], ['alsoCos', 'alsoCosAt', []]].forEach(function(g){
    var best = null; all.forEach(function(l){ if (l[g[0]] != null && s(l[g[1]]) && (!best || tms(l[g[1]]) > tms(best[g[1]]))) best = l; });
    if (best && best !== keeper && tms(best[g[1]]) > tms(keeper[g[1]])) { k[g[0]] = JSON.parse(JSON.stringify(best[g[0]])); k[g[1]] = best[g[1]]; g[2].forEach(function(f){ if (best[f] != null) k[f] = best[f]; }); }
  });
  ['notSameAs', 'tags'].forEach(function(f){ var u = uniq([].concat.apply([], all.map(function(l){ return arr(l[f]); }))); if (u.length) k[f] = u; });
  var notes = [s(keeper.notes || keeper.note)].filter(Boolean);
  others.forEach(function(l){ var n = s(l.notes || l.note); if (n && notes.join('\n').indexOf(n) < 0) notes.push('— from "' + s(l.name || l.title) + '" (' + (s(l.dueToCompany || l.gc) || s(l.source) || 'lead') + '):\n' + n); });
  if (notes.length) { if ('note' in keeper && !('notes' in keeper)) k.note = notes.join('\n'); else k.notes = notes.join('\n'); }
  var due = earliest(gcs.map(function(g){ return g.due; }).concat(all.map(dueOf)));
  if (due && !keeper.bidDueManual && due !== s(k.bidDue)) { if (s(k.bidDue)) k.bidDueWas = s(k.bidDue); k.bidDue = due; }
  var first = Math.min.apply(null, all.map(function(l){ return received(l) || 9e15; }));
  if (first < 9e15 && first < (received(keeper) || 9e15)) k.receivedAt = new Date(first).toISOString();
  k.activity = uniq([].concat.apply([], all.map(function(l){ return arr(l.activity); })), function(a){ return s(a.at) + '|' + s(a.type) + '|' + s(a.text); }).sort(function(a, b){ return tms(a.at) - tms(b.at); });
  k.activity.push({ type: 'bidmerge', at: at, by: by, text: '🔗 Merged ' + others.length + ' duplicate bid lead' + (others.length === 1 ? '' : 's') + ' for this project: ' + others.map(function(l){ return gcLine(seedGcs(l)[0]); }).join('; ') + ' — the copies are in 🗑 Recently deleted' });
  k.activity = k.activity.slice(-200);
  k.mergedFrom = uniq(arr(keeper.mergedFrom).concat(others.map(function(l){ return l.id; })));
  k.bidMerge = { at: at, by: by, ids: others.map(function(l){ return l.id; }) };
  k.updatedAt = k.savedAt = at;
  return k;
}

var API = { DUE_DAYS: DUE_DAYS, same: same, info: info, titleInfo: titleInfo, cleanTitle: cleanTitle, titleSim: titleSim, streetOf: streetOf, cityOf: cityOf, portalIds: portalIds, bidNo: bidNo, coKey: coKey,
  gcOf: gcOf, seedGcs: seedGcs, addGc: addGc, gcLine: gcLine, tradesOf: tradesOf, summary: summary, earliest: earliest, sooner: sooner, gapDays: gapDays,
  isBidLead: isBidLead, liveLead: liveLead, groups: groups, mergeLeads: mergeLeads, received: received, numsOf: numsOf, diffJob: diffJob };
if (typeof module === 'object' && module && module.exports) module.exports = API;
if (typeof window !== 'undefined' && root === window) root._gcBidMergeCore = API;
})(typeof window !== 'undefined' ? window : this);
/* CORE-END */
