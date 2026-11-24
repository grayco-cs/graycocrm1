/* netlify/functions/_lib/billmatch.js — patch BILLMATCH (owner 11/24: "bills or invoices need po or address or customer name to
   match expense" · "abc bills have address or pos to match invoices and expenses per job").

   THE RULE every automatic job finder for a supplier bill / sub invoice / expense follows: it is placed on a job by itself ONLY when the
   bill matches THAT job by
     · its PO   — the job's PO on the bill (the PO field a person / the sub typed, "PO #: X901", or the job's PO token in the text),
     · its street address — house # + street of the job's address (a city only, "Demoville TN", is not a street address), or
     · its customer name — the job's customer named on the bill (all of the name's words), and the bill names no OTHER street.
   Anything else (the job's name words, a memo a matcher "remembers", the sub's only open job, a vendor's history, an amount) is a
   suggestion only: the bill goes to 🧾 Match this invoice / "needs a job" and a person picks. A job a person picked is never moved.

   One file, two homes: the functions require() it; tools/patch_BILLMATCH.py inlines the same text in index.html as
   <script id="gc-patch-billmatch"> (window._gcBillMatch), which the page's finders call. Pure: no I/O, no dependencies. */
(function(root){
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function nk(t){ return s(t).toLowerCase().replace(/&amp;/g, '&').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function poN(v){ return s(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function lev1(a, b){
  if (a === b) return true; if (Math.abs(a.length - b.length) > 1) return false;
  var i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return d + (a.length - i) + (b.length - j) <= 1;
}
function near(a, b){ return a === b || (a.length >= 4 && b.length >= 4 && lev1(a, b)); }   /* "Loche" / "Lonch" Meade = "Loch" Meade (one letter) */

/* ── the bill's own words about its job (never the payee's name: a vendor's letterhead is not the job) ── */
var TEXT_FIELDS = ['desc', 'description', 'memo', 'qbMemo', 'notes', 'title', 'address', 'jobAddress', 'shipTo', 'shipAddress', 'siteAddress', 'deliverTo',
  'customer', 'client', 'clientName', 'qbCust', 'qbProject', 'qbJob', 'job', 'jobRaw', 'project', 'projectName', 'jobName', 'readText', 'poRef', 'klass', 'qbClass'];   /* the PO field: ownPO() (a job finder may have copied the job's PO there) */
function textOf(rec){
  if (rec == null) return '';
  if (typeof rec === 'string') return rec;
  var parts = [];
  TEXT_FIELDS.forEach(function(k){ var v = rec[k]; if (v != null && typeof v !== 'object' && s(v)) parts.push(s(v)); });
  var rd = rec.read && typeof rec.read === 'object' ? rec.read : null;
  if (rd) ['jobAddress', 'po', 'customer'].forEach(function(k){ if (s(rd[k])) parts.push(s(rd[k])); });
  [rec.lines, rec.qbLines].forEach(function(L){ if (Array.isArray(L)) L.slice(0, 60).forEach(function(l){ if (l && typeof l === 'object') ['desc', 'description', 'memo', 'customer', 'cust'].forEach(function(k){ if (s(l[k])) parts.push(s(l[k])); }); }); });
  if (s(rec.text)) parts.push(s(rec.text).slice(0, 20000));
  return parts.join(' \n ');
}

/* ── PO ── */
function jobPOs(p){
  var a = [p && p.autoPO, p && p.po, p && p.poNumber]; if (p && Array.isArray(p.pos)) a = a.concat(p.pos);
  var out = []; a.forEach(function(x){ var k = poN(x); if (k.length >= 3 && /\d/.test(k) && /[A-Z]|\d{4,}/.test(k) && out.indexOf(k) < 0) out.push(k); });
  return out;
}
var PO_LABEL = /\bP\.?\s?O\.?\s*(?:#|NO\.?|NUM(?:BER)?)?\s*[:#-]?\s*([A-Z]{0,3}-?\d{3,8}[A-Z]?)\b/gi;
/* the PO field counts when the bill carries it itself — not when a job finder copied the job's PO onto it */
function fromQB(rec){ return /quickbooks/i.test(s(rec.source)) || /^QB:/.test(s(rec.qbKey)) || !!s(rec.qbcsvKey) || rec.importedHistory === true; }
function ownPO(rec){ return rec && typeof rec === 'object' && s(rec.po) && !rec.autoLinked && !rec.autoPO && !rec.poFromJob && !fromQB(rec) && !/^view$/i.test(s(rec.po)) ? poN(rec.po) : ''; }   /* a QuickBooks bill has no PO field: its "po" is the job's, copied */
function poHit(text, rec, p){
  var pos = jobPOs(p); if (!pos.length) return '';
  var own = ownPO(rec);
  if (own && pos.indexOf(own) >= 0) return 'label';
  var rp = rec && typeof rec === 'object' ? poN(rec.poRef) : ''; if (rp && pos.indexOf(rp) >= 0) return 'label';
  var t = s(text), m; PO_LABEL.lastIndex = 0;
  while ((m = PO_LABEL.exec(t))) if (pos.indexOf(poN(m[1])) >= 0) return 'label';
  var tok = t.toUpperCase().split(/[^A-Z0-9-]+/).map(poN);
  for (var i = 0; i < pos.length; i++) if (tok.indexOf(pos[i]) >= 0) return 'token';
  return '';
}

/* ── street address ── */
var SKIP = /^(n|s|e|w|ne|nw|se|sw|north|south|east|west|old|new|the|of|at|on|us|state|hwy|highway|mt|mount|saint|st)$/;
var SUF = /^(st|street|rd|road|dr|drive|ln|lane|cv|cove|ave|av|avenue|blvd|boulevard|ct|court|cir|circle|pl|place|pkwy|parkway|way|trl|trail|loop|pike|ter|terrace|hwy|highway|pass|run|sq|square|pt|point|xing|crossing|cres|crescent|row|walk|path|plz|plaza|bnd|bend|hl|hill|hls|hills|holw|hollow)$/;
function isNo(w){ return /^\d{1,6}[a-z]?$/.test(w) && !/^(19|20)\d\d$/.test(w); }
/* a bill / invoice / PO / check number is not a house number ("Invoice #: 702 Rough-in", "QuickBooks bill #881 — …") */
function noNums(text){ return s(text).replace(/#\s*:?\s*[A-Za-z0-9-]+/g, ' ').replace(/\b(?:invoice|inv|bill|order|ref|check|ck|statement|stmt|acct|account|p\.?\s?o|no|num(?:ber)?)\b\.?\s*[:#]?\s*[A-Za-z]{0,3}-?\d[\w-]*/gi, ' '); }
/* every "house # + street word" in a text: "@ 449 E Lawnwood Dr." → { n:'449', st:'lawnwood' } */
function keysIn(text){
  var w = nk(noNums(text)).split(' '), out = [];
  for (var i = 0; i < w.length - 1; i++) {
    if (!isNo(w[i])) continue;
    for (var j = i + 1; j < w.length && j < i + 4; j++) { var x = w[j]; if (/^\d/.test(x)) break; if (SKIP.test(x) && j + 1 < w.length && !/^\d/.test(w[j + 1])) continue; if (x.length >= 3 || SUF.test(w[j + 1] || '')) { out.push({ n: w[i].replace(/[a-z]$/, ''), st: x }); } break; }
  }
  return out;
}
/* a FULL street in a text: house # + street word(s) + Rd / St / Dr … ("418 Maplecrest rd"; never "2 coats", never a ZIP) */
function streetsIn(text){
  var w = nk(noNums(text)).split(' '), out = [];
  for (var i = 0; i < w.length - 2; i++) {
    if (!isNo(w[i])) continue;
    var st = '';
    for (var j = i + 1; j < w.length && j <= i + 4; j++) { var x = w[j]; if (/^\d/.test(x)) break; if (SUF.test(x) && j > i + 1 && (st || SKIP.test(w[j - 1]))) { out.push({ n: w[i].replace(/[a-z]$/, ''), st: st || w[j - 1] }); break; } if (!st && !SKIP.test(x) && x.length >= 3) st = x; }
  }
  return out;
}
/* the job's street on file: its address (first part), else a job named by its address ("1331 Finley RD", "… (601 Pine Ln Drummonds)") */
function jobStreet(p){
  if (!p) return null;
  var a = s(p.address || p.jobAddress || p.addr || p.siteAddress || (p.location && p.location.address)).split(',')[0];
  var k = keysIn(a)[0]; if (k) return k;
  var nm = s(p.name), m = /\(([^)]*\d[^)]*)\)/.exec(nm);
  if (m) { k = keysIn(m[1])[0]; if (k) return k; }
  if (/^\s*\d{1,6}[a-z]?\s+[a-z]/i.test(nm)) { k = keysIn(nm)[0]; if (k) return k; }
  return null;
}
function keyHit(a, b){ return a.n === b.n && (a.st === b.st || near(a.st, b.st)); }
function addrHit(text, p){
  var jk = jobStreet(p); if (!jk) return '';
  var tk = keysIn(text);
  for (var i = 0; i < tk.length; i++) if (keyHit(tk[i], jk)) return jk.n + ' ' + jk.st;
  return '';
}
/* the bill's full street vs the job's: 'same' · 'other' (the job has another street) · 'none' (the job has no street: a city only) · '' (the bill names none) */
function streetVs(text, p){
  var bs = streetsIn(text); if (!bs.length) return '';
  var jk = jobStreet(p); if (!jk) return 'none';
  return bs.some(function(b){ return keyHit(b, jk); }) || addrHit(text, p) ? 'same' : 'other';
}

var MEASURE = /^(yard|yards|yd|yds|ton|tons|sq|sqs|square|squares|ft|feet|foot|lf|sf|lbs|lb|pounds|gal|gallons|hour|hours|hrs|hr|day|days|men|man|pcs|pc|pieces|each|ea|bags|boxes|rolls|sheets|units|unit|bundles|pallets|count|ct|percent|pct|inch|inches|mil|gauge|ga|amp|amps|volt|volts|watt|watts|minutes|mins|weeks|months|year|years|total|due|net|invoice|bill|tax|pm|am)$/;
function looseOther(text, p){
  var tk = keysIn(text).filter(function(k){ return k.n.length >= 3 && !MEASURE.test(k.st); }); if (!tk.length) return false;
  var jk = jobStreet(p); if (!jk) return false;
  return !tk.some(function(k){ return keyHit(k, jk); });
}
/* ── customer name ── */
var C_STOP = /^(llc|inc|co|corp|corporation|company|the|and|of|ltd|lp|llp|pllc|pc|mr|mrs|ms|dr|dba)$/;
var NOT_CUST = /^(office|grayco|gray co|grayco construction|grayco construction services|overhead|n a|na|none|tbd|unknown|customer|client)$/;
function custName(p){ return s(p && (p.client || p.customer || p.clientName || p.qbClient)).replace(/&amp;/g, '&'); }
function custToks(name){ return nk(name).split(' ').filter(function(w){ return w && !C_STOP.test(w); }); }
function custHit(text, rec, p){
  var names = [custName(p)]; if (p && s(p.qbClient) && s(p.qbClient) !== names[0]) names.push(s(p.qbClient));
  var tw = (' ' + nk(text) + ' '), words = tw.trim().split(' ');
  var recC = rec && typeof rec === 'object' ? [rec.customer, rec.client, rec.clientName, s(rec.qbCust).split(':')[0]].map(nk).filter(Boolean) : [];
  for (var i = 0; i < names.length; i++) {
    var n = nk(names[i]); if (!n || NOT_CUST.test(n)) continue;
    if (recC.indexOf(n) >= 0) return s(names[i]);
    var t = custToks(names[i]); if (!t.length) continue;
    if (t.length === 1 && t[0].length < 5) continue;   /* "EAN", "JBS" alone: too short to be sure */
    if (t.every(function(x){ return tw.indexOf(' ' + x + ' ') >= 0 || (x.length >= 5 && words.some(function(w){ return near(w, x); })); })) return s(names[i]);
  }
  return '';
}

/* ════ THE GATE: which of PO / street address / customer name ties this bill to this job ════
   → { ok, by: ['po' | 'address' | 'customer'], why, vs } — ok false: a person picks (🧾 Match this invoice) */
function basis(rec, p, opt){
  var text = typeof rec === 'string' ? rec : textOf(rec); if (opt && s(opt.text)) text += ' \n ' + s(opt.text);
  var r = typeof rec === 'object' && rec ? rec : null;
  var by = [], why = [];
  var vs = streetVs(text, p);
  var ph = poHit(text, r, p);
  if (ph === 'label' || (ph === 'token' && vs !== 'other')) { by.push('po'); why.push('PO ' + jobPOs(p).filter(function(x){ return text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').indexOf(x) >= 0 || x === ownPO(r) || (r && x === poN(r.poRef)); })[0] || jobPOs(p)[0]); }
  var ah = addrHit(text, p); if (ah) { by.push('address'); why.push('the address ' + ah); }
  /* a customer has many properties: the bill naming ANOTHER house # + street ("2681 Mount Moriah" vs the job's 1700 West Cv) is not this job */
  var ch = custHit(text, r, p); if (ch && vs !== 'other' && !(vs === '' && !ah && looseOther(text, p))) { by.push('customer'); why.push('the customer ' + ch); }
  return { ok: by.length > 0, by: by, why: by.length ? why.join(' · ') : (vs === 'other' ? 'the bill names another street than this job\'s' : 'no PO, street address or customer name of this job on the bill'), vs: vs };
}
function ok(rec, p, opt){ try { return !!(p && basis(rec, p, opt).ok); } catch (e) { return false; } }
/* a job a person put the bill on (never moved by a finder) */
function placedByPerson(r){
  if (!r || !s(r.pid || r.projectId)) return false;
  return r.pidManual === true || r._matchConfirmed === true || r.humanPid === true || r._linkReviewed === true ||
    /re-?check|person|manual|review|picked/i.test(s(r.linkedBy)) || (!!s(r.matchedBy) && !!s(r.matchedAt) && !r.autoLinked) ||
    (/^(manual|accounting)$/i.test(s(r.source)) && !r.autoLinked && !r.autoMatched);
}
var API = { v: 1, basis: basis, ok: ok, textOf: textOf, jobPOs: jobPOs, poHit: poHit, keysIn: keysIn, streetsIn: streetsIn, jobStreet: jobStreet, addrHit: addrHit, streetVs: streetVs,
  custHit: custHit, custName: custName, placedByPerson: placedByPerson, nk: nk, poN: poN };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else if (root) root._gcBillMatch = API;
})(typeof window !== 'undefined' ? window : this);
