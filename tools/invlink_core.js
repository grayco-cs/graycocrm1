/* INVLINK pure core (inserted into tools/invlink_block.html by tools/patch_INVLINK.py; node tests load it directly).
   Everything here is pure: lists in, answers out. No page, no storage, no network. */
var CORE = (function(){
var OLDER_BEFORE = '2026-11-19';   /* the same "older job" day as patch PAPERS: a job made / started before it is an older (past) job */
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ var x = typeof v === 'number' ? v : parseFloat(s(v).replace(/[^0-9.\-]/g, '')); return isFinite(x) ? x : 0; }
function r2(v){ return Math.round(num(v) * 100) / 100; }
function day(v){ var t = s(v); return /^\d{4}-\d\d-\d\d/.test(t) ? t.slice(0, 10) : ''; }
function words(t){ return ' ' + low(t).replace(/&amp;/g, '&').replace(/[^a-z0-9]+/g, ' ').trim() + ' '; }
var CORP = /\b(llc|inc|co|corp|corporation|company|the|ltd|pllc|lp|incorporated)\b/g;
function nk(v){ return low(v).replace(/&amp;/g, '&').replace(/&/g, ' and ').replace(CORP, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function poN(v){ return s(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function lev1(a, b){   /* edit distance ≤ 1 */
  if (a === b) return true; var la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  var i = 0, j = 0, d = 0;
  while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
  return d + (la - i) + (lb - j) <= 1;
}

/* ── customers: one name per company (aliases: EAH Holdings = EAN Holdings, owner 11/19) ── */
var ALIAS = { 'eah holdings': 'ean holdings' };
function aliasMap(customers){
  var m = Object.assign({}, ALIAS), byId = {};
  arr(customers).forEach(function(c){ byId[s(c.id)] = c; });
  arr(customers).forEach(function(c){
    var n = nk(c.name || c.company); if (!n) return;
    (Array.isArray(c.aliases) ? c.aliases : []).forEach(function(a){ var k = nk(a); if (k && k !== n) m[k] = n; });
    if (c._mergedInto && byId[s(c._mergedInto)]) { var into = nk(byId[s(c._mergedInto)].name); if (into && into !== n) m[n] = into; }
  });
  return m;
}
function custKey(name, amap){ var k = nk(name); var seen = 0; while (amap && amap[k] && seen++ < 5) k = amap[k]; return k; }
/* the same customer written two ways: "Mid south Restoration" = "Mid-South Restoration Services, LLC", "Rachel" = "Racheal" Glover */
function custSame(a, b){
  if (!a || !b) return false; if (a === b) return true;
  var x = a.split(' '), y = b.split(' '), sh = x.length <= y.length ? x : y, lg = sh === x ? y : x;
  if (sh.length >= 2 && sh.every(function(w, i){ return lg[i] === w; })) return true;
  if (a.length >= 8 && b.length >= 8 && lev1(a, b)) return true;
  if (x.length === y.length && x.length >= 2 && x.every(function(w, i){ return w === y[i] || (w.length >= 5 && lev1(w, y[i])); })) return true;
  return false;
}

/* ── what a record is ── */
function isClient(r){ var t = low(r && r.type); return t === 'client' || t === 'customer'; }
function isArchived(r){ return !!r && (low(r.type) === 'archived' || !!r._archived || !!r._dupOf); }
function qbNums(r){   /* the QuickBooks invoice number(s) this record IS */
  var out = [];
  var add = function(n){ n = s(n).replace(/^#/, ''); if (n && out.indexOf(n) < 0) out.push(n); };
  var k = s(r.qbKey), m = /^QB:invoice:([^:]+)/i.exec(k); if (m) add(m[1]);
  (Array.isArray(r.qbKeys) ? r.qbKeys : []).forEach(function(x){ var mm = /^QB:invoice:([^:]+)/i.exec(s(x)); if (mm) add(mm[1]); });
  if (s(r.qbNum)) add(r.qbNum);
  if (/quickbooks/i.test(s(r.source)) || r.importedHistory === true) { if (s(r.invNum)) add(r.invNum); var d = /QuickBooks invoice #\s*([A-Za-z0-9-]+)/i.exec(s(r.desc)); if (d) add(d[1]); }
  return out;
}
function isQB(r){ return qbNums(r).length > 0; }
function textOf(r){
  var parts = [r.desc, r.memo, r.qbMemo, r.notes, r.title, r.address, r.jobAddress, r.shipTo, r.billTo, r.shipAddress, r.siteAddress, r.fileName, r.readText, r.qbClass, r.qbCust, r.qbProject, r.qbJob];
  arr(r.lines).concat(arr(r.qbLines)).forEach(function(l){ parts.push(l.desc, l.description, l.memo, l.customer, l.cust); });
  return parts.filter(function(x){ return x != null && x !== ''; }).map(String).join(' \n ');
}

/* ── jobs ── */
var GONE = /^(lost|cancell?ed|dead|declined|rejected|deleted|void)$/i;
var DONE = /^(completed?|closed|done|paid|finished|archived|lost|cancell?ed|dead|declined)$/i;
function liveJob(p){ return !!p && !p.deleted && !p._deleted && !GONE.test(s(p.status)); }
function isOverhead(p){ return !!p && (p.overhead === true || /^office$/i.test(s(p.client)) || /^(new office|office shirts)$/i.test(s(p.name))); }
function madeOn(p){ return day(p.created) || day(p.createdAt) || day(p.addedDate); }
function isPastJob(p, cut){
  if (!p) return false; cut = cut || OLDER_BEFORE;
  if (p.importedHistory || p.dataEntry || s(p.createdVia) === 'invoice-entry') return true;
  if (DONE.test(s(p.status)) || p.paidInFull === true || p.archived === true) return true;
  var m = madeOn(p), st = day(p.startDate);
  return !!((m && m < cut) || (st && st < cut));
}
function jobPOs(p){ var a = [p.autoPO, p.po, p.poNumber]; if (Array.isArray(p.pos)) a = a.concat(p.pos); return a.map(poN).filter(Boolean); }
var STREET_SKIP = /^(n|s|e|w|ne|nw|se|sw|north|south|east|west|mt|mount|old|new|us|hwy|highway|st|saint|the|of|at|on)$/;
var SUFX = /^(st|street|rd|road|dr|drive|ln|lane|cv|cove|ave|av|avenue|blvd|boulevard|ct|court|cir|circle|pl|place|pkwy|parkway|way|trl|trail|loop|pike|ter|terrace)$/;
function addrKeysIn(text){   /* every "house # + street word" in a text: "@ 449 E Lawnwood Dr." → 449 lawnwood */
  var w = words(text).trim().split(' '), out = [];
  for (var i = 0; i < w.length - 1; i++) {
    if (!/^\d{1,6}[a-z]?$/.test(w[i]) || /^(19|20)\d\d$/.test(w[i])) continue;
    for (var j = i + 1; j < w.length && j < i + 4; j++) { var x = w[j]; if (/^\d/.test(x)) break; if (STREET_SKIP.test(x) || SUFX.test(x)) continue; if (x.length >= 3) out.push({ n: w[i].replace(/[a-z]$/, ''), st: x }); break; }
  }
  return out;
}
function jobAddrKeys(p){
  var t = [s(p.address || p.jobAddress || p.addr).split(',')[0]], m = /\(([^)]*\d[^)]*)\)/.exec(s(p.name)); if (m) t.push(m[1]);
  var out = []; t.forEach(function(x){ addrKeysIn(x).slice(0, 1).forEach(function(k){ out.push(k); }); }); return out;
}
function addrHit(textKeys, jobKeys){
  for (var i = 0; i < jobKeys.length; i++) for (var j = 0; j < textKeys.length; j++) {
    var a = jobKeys[i], b = textKeys[j];
    if (a.n === b.n && (a.st === b.st || (a.st.length >= 4 && b.st.length >= 4 && lev1(a.st, b.st)))) return a.n + ' ' + a.st;
  }
  return '';
}
var GENERIC = /^(water|damage|claim|claims|repair|repairs|job|project|new|remodel|renovation|replacement|replace|service|services|store|office|build|holdings|construction|roof|reroof|work|interior|exterior|demo|emergency|mitigation|fire|insurance|commercial|residential|phase|draw|invoice|tenant|unit|building|street|avenue|drive|road|lane|memphis|tennessee|bartlett|cordova|collierville|germantown|nashville|jackson|the|and|for|with|from|labor|materials|material|takeoff|install|installation|added|all|complete|completed|total|original|estimate|per|sent|portion|final|upgraded|apartment|apartments|bank|car|wash|holding|group|solutions|mortgage|restoration|south|north|east|west)$/;
function nameWords(p, amap){
  var cw = {}; custKey(p.client || p.customer, amap).split(' ').forEach(function(x){ cw[x] = 1; });
  var n = s(p.name).replace(/\([^)]*\)/g, ' ');
  return words(n).trim().split(' ').filter(function(x){ return x.length >= 5 && !/^\d/.test(x) && !GENERIC.test(x) && !cw[x]; });
}

/* ── how well one job fits one invoice: score + the evidence, in words ── */
function scoreJob(inv, p, ctx){
  var amap = ctx.amap, text = ctx.text, tw = ctx.tw, tkeys = ctx.tkeys, client = isClient(inv);
  var sc = 0, why = [], strong = '';
  var nums = ctx.nums;
  if (nums.length && Array.isArray(p.qbInvoiceNums) && p.qbInvoiceNums.some(function(n){ return nums.indexOf(s(n)) >= 0; })) { sc += 100; strong = strong || 'qbjob'; why.push('QuickBooks lists invoice #' + nums[0] + ' on this job'); }
  var qbj = nk(inv.qbProject || inv.qbJob || (s(inv.qbCust).indexOf(':') > 0 ? s(inv.qbCust).split(':').slice(1).join(':') : ''));
  if (qbj && (nk(p.name) === qbj || nk(p.qbJob) === qbj)) { sc += 100; strong = strong || 'qbjob'; why.push('QuickBooks project / sub-customer "' + qbj + '"'); }
  var pos = jobPOs(p), explicit = ctx.explicitPOs;
  if (pos.length && explicit.some(function(x){ return pos.indexOf(x) >= 0; })) { sc += 95; strong = strong || 'po'; why.push('PO ' + pos[0] + ' on the invoice'); }
  var ah = addrHit(tkeys, jobAddrKeys(p));
  if (ah) { sc += 90; strong = strong || 'address'; why.push('the address ' + ah); }
  var nw = nameWords(p, amap), hits = nw.filter(function(x){ return tw.indexOf(' ' + x + ' ') >= 0; });
  if (hits.length) { var add = Math.min(50, hits.length * 30); sc += add; why.push('the job name ("' + hits.join('", "') + '")'); }
  var ck = custKey(inv.client || inv.customer || inv.sub, amap), pk = custKey(p.client || p.customer, amap), pn = custKey(p.name, amap);
  if (client && ck && (pk || pn)) {
    if (custSame(ck, pk) || custSame(ck, pn)) { sc += 20; why.push('the same customer'); }
    else if (pk) { sc -= 40; why.push('another customer (' + s(p.client) + ')'); }
  }
  var amt = Math.abs(num(inv.amt != null ? inv.amt : inv.amount)), con = num(p.contract || p.contractAmt);
  if (client && amt > 0 && con > 0) {
    var billed = ctx.qbBilled ? num(ctx.qbBilled[s(p.id)]) : 0;
    if (billed > 0 && billed + amt > con * 1.2) { sc -= 30; why.push('the job is already billed ' + r2(billed) + ' in QuickBooks'); }
    else if (Math.abs(amt - con) <= 0.5) { sc += 40; why.push('the amount = the job\'s contract ' + r2(con)); }
    else if (amt <= con * 1.12) sc += 5;
    else if (amt > con * 1.35) { sc -= 15; why.push('more than the contract'); }
  }
  if (/^(bidding|lead|estimating|estimate)$/i.test(s(p.status)) && !con) sc -= 10;
  return { p: p, pid: s(p.id), score: sc, strong: strong, why: why };
}
function ctxFor(inv, projects, opts){
  var text = textOf(inv), amap = (opts && opts.amap) || ALIAS;
  /* a PO counts only when the invoice itself carries it: in its text, or typed on a record a person made (not one a job finder copied from the job) */
  var ex = [], up = text.toUpperCase().match(/\b[A-Z]-?\d{3}\b/g) || [];
  up.forEach(function(x){ ex.push(poN(x)); });
  if (s(inv.po) && !isQB(inv) && !inv.autoLinked && !inv.linkedBy && !inv.autoPO) ex.push(poN(inv.po));
  var qbBilled = null;
  if (opts && opts.invs) { qbBilled = {}; arr(opts.invs).forEach(function(v){ if (v === inv || s(v.id) === s(inv.id) || !isClient(v) || isArchived(v) || !isQB(v) || !s(v.pid) || !placedOK(v)) return; qbBilled[s(v.pid)] = num(qbBilled[s(v.pid)]) + num(v.amt); }); }
  return { text: text, tw: words(text), tkeys: addrKeysIn(text), amap: amap, nums: qbNums(inv), explicitPOs: ex, qbBilled: qbBilled };
}
/* every job that fits, best first, and how sure the best one is:
   sure   — a strong signal (QuickBooks project / job's QB invoice #, the PO on the invoice, the address) and no other job close → may link by itself
   likely — enough evidence to suggest (job-name words, the contract amount, the customer) with a clear lead → a person accepts it
   weak   — only the customer (or nothing distinctive) → never linked; "needs a job"                                                   */
function match(inv, projects, opts){
  opts = opts || {};
  var ctx = ctxFor(inv, projects, opts), client = isClient(inv), out = [];
  arr(projects).forEach(function(p){
    if (!liveJob(p) || (opts.isDeleted && opts.isDeleted(p.id))) return;
    if (client && isOverhead(p)) return;   /* a customer's invoice is never GrayCo overhead */
    var r = scoreJob(inv, p, ctx); if (r.score > 0 && r.why.some(function(w){ return !/^(another customer|more than|the job is already billed)/.test(w); })) out.push(r);
  });
  out.sort(function(a, b){ return b.score - a.score || (b.strong ? 1 : 0) - (a.strong ? 1 : 0); });
  var top = out[0], next = out[1], gap = top ? top.score - (next ? next.score : 0) : 0, level = 'none';
  if (top) {
    if (top.strong && top.score >= 90 && gap >= 25) level = 'sure';
    else if (top.score >= 50 && gap >= 20 && (top.strong || top.why.length >= 2)) level = 'likely';
    else level = 'weak';
  }
  return { level: level, top: top || null, pid: top && level === 'sure' ? top.pid : '', conf: top ? Math.max(0, Math.min(100, top.score)) : 0, list: out.slice(0, 6) };
}
function sureJob(inv, projects, opts){ var m = match(inv, projects, opts); return m.level === 'sure' ? m.top.p : null; }

/* ── who placed the current link ── */
function placedOK(v){ return !v.autoLinked && !/customer's only job/i.test(s(v.linkedBy)); }   /* a QuickBooks invoice whose job did not come from a guess */
function placedByPerson(inv){ return !!(inv && (inv.pidManual === true || /re-check|person|manual|INVLINK review/i.test(s(inv.linkedBy)) || inv._linkReviewed)); }

/* ── the audit: every QuickBooks customer invoice, its job, and what the evidence says ── */
function audit(invs, projects, opts){
  opts = opts || {};
  var P = {}; arr(projects).forEach(function(p){ P[s(p.id)] = p; });
  var rows = []; opts = Object.assign({ invs: invs }, opts);
  arr(invs).forEach(function(v){
    if (!isClient(v) || isArchived(v) || !isQB(v) || v.deleted) return;
    var cur = P[s(v.pid)] || null, m = match(v, projects, opts), ctx = ctxFor(v, projects, opts);
    var curFit = cur ? scoreJob(v, cur, ctx) : null, verdict;
    if (cur && placedByPerson(v)) verdict = 'manual';
    else if (cur && isOverhead(cur)) verdict = 'wrong';   /* a customer's invoice on GrayCo overhead (New Office) */
    else if (s(v.pid) && !cur) verdict = 'job gone';
    else if (!cur) verdict = (m.level === 'sure' || m.level === 'likely') ? 'unlinked' : 'needs a job';
    else if (m.top && m.top.pid === s(cur.id)) verdict = (m.level === 'sure' || m.level === 'likely' || curFit.strong) ? 'ok' : 'suspect';
    else if (m.top && m.top.score === curFit.score && !curFit.strong) verdict = 'suspect';
    else if (m.top && (m.level === 'sure' || m.level === 'likely') && m.top.score >= curFit.score + 20) verdict = 'wrong';
    else verdict = curFit.strong ? 'ok' : 'suspect';
    rows.push({ id: s(v.id), num: qbNums(v)[0] || '', amt: r2(v.amt), date: day(v.date), client: s(v.client || v.customer), desc: s(v.desc).slice(0, 140),
      cur: cur ? { pid: s(cur.id), po: s(cur.autoPO), name: s(cur.name), fit: curFit.score, why: curFit.why } : null,
      sug: m.top ? { pid: m.top.pid, po: s(m.top.p.autoPO), name: s(m.top.p.name), score: m.top.score, why: m.top.why, level: m.level } : null,
      alts: m.list.slice(1, 4).map(function(x){ return { pid: x.pid, po: s(x.p.autoPO), name: s(x.p.name), score: x.score }; }),
      verdict: verdict, how: s(v.linkedBy) || (v.autoLinked ? 'old job finder (no reason kept)' : '') });
  });
  return rows;
}

/* ── QuickBooks-only cleanup for past jobs (owner 11/19: "make all invoices for past projects match the QuickBooks invoices only") ── */
function openBal(r){
  if (/^(paid)$/i.test(s(r.status)) || r.paid === true) return 0;
  if (r.openBalance != null && r.openBalance !== '') return r2(r.openBalance);
  return r2(num(r.amt) - num(r.amountPaid));
}
function isOverdue(r, today){ var d = day(r.dueDate || r.due); return openBal(r) > 0.005 && !!d && d < today && !/^draft$/i.test(s(r.status)); }
function plan(lists, opts){
  opts = opts || {};
  var invs = arr(lists.invs), projects = arr(lists.projects), customers = arr(lists.customers);
  var today = opts.today || new Date().toISOString().slice(0, 10), cut = opts.olderBefore || OLDER_BEFORE;
  var amap = aliasMap(customers), P = {}; projects.forEach(function(p){ P[s(p.id)] = p; });
  var live = invs.filter(function(v){ return isClient(v) && !isArchived(v) && !v.deleted && !/^(void|deleted)$/i.test(s(v.status)); });
  var qb = live.filter(isQB), crmMade = live.filter(function(v){ return !isQB(v); });
  var out = { archive: [], merge: [], keep: [], perJob: {}, customerMerge: [], totals: {} };
  /* 1. the same QuickBooks invoice twice → one record */
  var byNum = {};
  qb.forEach(function(v){ var n = qbNums(v)[0]; (byNum[n] = byNum[n] || []).push(v); });
  Object.keys(byNum).forEach(function(n){
    var g = byNum[n]; if (g.length < 2) return;
    g.sort(function(a, b){ return (placedByPerson(b) ? 2 : 0) + (b.pid ? 1 : 0) - (placedByPerson(a) ? 2 : 0) - (a.pid ? 1 : 0); });
    g.slice(1).forEach(function(v){ out.merge.push({ id: s(v.id), into: s(g[0].id), num: n, amt: r2(v.amt), open: openBal(v), overdue: isOverdue(v, today), pid: s(v.pid), why: 'QuickBooks invoice #' + n + ' is in the CRM twice' }); });
  });
  /* 2. CRM-made invoices on past jobs: the same as a QuickBooks invoice → merged into it; else not in QuickBooks → archived */
  var claimed = {};
  crmMade.forEach(function(v){
    var p = P[s(v.pid)] || null, made = day(v.created) || day(v.createdAt) || day(v.date) || day(v.recvDate);
    if (p && !isPastJob(p, cut)) return;                  /* current / new jobs keep working as they do */
    if (made && made >= cut) return;                      /* made from the go-live day on: a person's new invoice stays */
    var ck = custKey(v.client || v.customer || (p && p.client), amap), amt = r2(v.amt);
    var twins = qb.filter(function(q){ return Math.abs(r2(q.amt) - amt) <= 1 && custKey(q.client || q.customer, amap) === ck && ck; });
    twins.sort(function(a, b){ return (s(b.pid) === s(v.pid) ? 1 : 0) - (s(a.pid) === s(v.pid) ? 1 : 0) || Math.abs(Date.parse(a.date) - Date.parse(v.date)) - Math.abs(Date.parse(b.date) - Date.parse(v.date)); });
    var row = { id: s(v.id), amt: amt, open: openBal(v), overdue: isOverdue(v, today), pid: s(v.pid), job: p ? s(p.name) : '(no job)', po: p ? s(p.autoPO) : s(v.po), date: day(v.date), client: s(v.client || v.customer), desc: s(v.desc).slice(0, 100),
      madeBy: s(v.by || v.createdBy) || (v._autoDrafted ? 'auto progress billing' : 'a person') };
    if (twins.length) { row.into = s(twins[0].id); row.num = qbNums(twins[0])[0]; row.why = 'the same as QuickBooks #' + row.num + ' (' + s(twins[0].client) + ', ' + r2(twins[0].amt) + ')';
      if (s(twins[0].pid) !== s(v.pid)) { var tj = P[s(twins[0].pid)]; row.crossJob = true; row.why += ' — QuickBooks #' + row.num + ' is on ' + (tj ? (s(tj.autoPO) + ' ' + s(tj.name)).trim() : 'no job') + ': check its job in Links'; }
      out.merge.push(row); claimed[row.into] = 1; }
    else { row.why = 'not in QuickBooks — made in the CRM (' + row.madeBy + ') on a past job'; out.archive.push(row); }
  });
  /* per job: the QuickBooks invoices vs the CRM's */
  live.forEach(function(v){ var k = s(v.pid) || '(none)'; var j = out.perJob[k] = out.perJob[k] || { pid: s(v.pid), job: P[s(v.pid)] ? s(P[s(v.pid)].name) : '', po: P[s(v.pid)] ? s(P[s(v.pid)].autoPO) : '', qb: [], crm: [], qbAmt: 0, crmAmt: 0 };
    if (isQB(v)) { j.qb.push(qbNums(v)[0]); j.qbAmt = r2(j.qbAmt + num(v.amt)); } else { j.crm.push(s(v.id)); j.crmAmt = r2(j.crmAmt + num(v.amt)); } });
  /* 3. customers that are one company (EAH Holdings = EAN Holdings) */
  out.customerMerge = customerMerges(lists, amap);
  var sum = function(a, f){ return r2(a.reduce(function(t, x){ return t + (f(x) || 0); }, 0)); };
  var gone = out.archive.concat(out.merge);
  out.totals = { archive: out.archive.length, merge: out.merge.length, records: gone.length,
    amount: sum(gone, function(x){ return x.amt; }), arOut: sum(gone, function(x){ return x.open; }), overdueOut: sum(gone, function(x){ return x.overdue ? x.open : 0; }), overdueCount: gone.filter(function(x){ return x.overdue; }).length };
  return out;
}
function customerMerges(lists, amap){
  var cust = arr(lists.customers), out = [];
  Object.keys(ALIAS).concat(Object.keys(amap)).forEach(function(from){
    var into = custKey(from, amap); if (!into || into === from) return;
    var A = cust.filter(function(c){ return nk(c.name || c.company) === from && !c._mergedInto; }), B = cust.filter(function(c){ return nk(c.name || c.company) === into && !c._mergedInto; });
    var count = function(k){ return arr(lists.projects).filter(function(p){ return nk(p.client || p.customer) === k; }).length + arr(lists.invs).filter(function(v){ return nk(v.client || v.customer) === k; }).length; };
    var jobs = arr(lists.projects).filter(function(p){ return nk(p.client || p.customer) === from; }), invs = arr(lists.invs).filter(function(v){ return nk(v.client || v.customer) === from; });
    if (!A.length && !jobs.length && !invs.length) return;
    if (out.some(function(x){ return x.from === from; })) return;
    var nA = count(from), nB = count(into);
    var keep = nB >= nA ? (B[0] || null) : (A[0] || null), drop = nB >= nA ? A : B;
    out.push({ from: from, into: into, keepId: keep ? s(keep.id) : '', keepName: keep ? s(keep.name) : '', dropIds: drop.map(function(c){ return s(c.id); }), counts: { from: nA, into: nB },
      jobs: jobs.map(function(p){ return s(p.id); }), invs: invs.map(function(v){ return s(v.id); }),
      qbTwoCustomers: A.some(function(c){ return /quickbooks/i.test(s(c.source)) || /^QB_/.test(s(c.id)); }) && B.some(function(c){ return /quickbooks/i.test(s(c.source)) || /^QB_/.test(s(c.id)); }) });
  });
  return out;
}

/* ── apply / undo (pure: new lists + a log with every field it changed) ── */
function setF(rec, patch, log, list){
  var before = {}; Object.keys(patch).forEach(function(k){ before[k] = rec[k] === undefined ? null : rec[k]; });
  var n = Object.assign({}, rec); Object.keys(patch).forEach(function(k){ if (patch[k] === undefined || patch[k] === null) delete n[k]; else n[k] = patch[k]; });
  log.push({ list: list, id: s(rec.id), before: before, after: patch }); return n;
}
function apply(lists, pl, meta){
  meta = meta || {}; var at = meta.at || new Date().toISOString(), by = meta.by || 'office', log = [];
  var A = {}; (pl.archive || []).forEach(function(x){ A[x.id] = x; }); var M = {}; (pl.merge || []).forEach(function(x){ M[x.id] = x; });
  var invs = arr(lists.invs).map(function(v){
    var a = A[s(v.id)], m = M[s(v.id)]; if (!a && !m) return v;
    if (isArchived(v)) return v;
    return setF(v, { type: 'archived', _typeWas: s(v.type) || 'client', _dupOf: m ? m.into : undefined,
      _archived: { why: (m || a).why, at: at, by: by, rule: m ? 'same as QuickBooks' : 'not in QuickBooks', planId: meta.id || '' } }, log, 'invs');
  });
  var projects = arr(lists.projects), customers = arr(lists.customers);
  (pl.customerMerge || []).filter(function(c){ return !meta.skipCustomers && c.keepId; }).forEach(function(c){
    var keep = customers.filter(function(x){ return s(x.id) === c.keepId; })[0]; if (!keep) return;
    var name = s(keep.name), drop = {}; c.dropIds.forEach(function(id){ drop[id] = 1; });
    customers = customers.map(function(x){
      if (drop[s(x.id)]) return setF(x, { _mergedInto: c.keepId, archived: true, archivedWhy: 'same company as ' + name, archivedAt: at, archivedBy: by }, log, 'customers');
      if (s(x.id) === c.keepId) { var al = (Array.isArray(x.aliases) ? x.aliases : []).slice(); customers.filter(function(y){ return drop[s(y.id)]; }).forEach(function(y){ if (al.indexOf(s(y.name)) < 0) al.push(s(y.name)); }); if (!al.length) al.push(c.from.replace(/\b\w/g, function(ch){ return ch.toUpperCase(); })); return setF(x, { aliases: al }, log, 'customers'); }
      return x;
    });
    projects = projects.map(function(p){ if (nk(p.client) !== c.from && nk(p.customer) !== c.from) return p; var pt = { _clientWas: s(p.client || p.customer) }; if (p.client != null) pt.client = name; if (p.customer != null && nk(p.customer) === c.from) pt.customer = name; if (c.keepId) pt.customerId = c.keepId; return setF(p, pt, log, 'projects'); });
    invs = invs.map(function(v){ if (nk(v.client) !== c.from && nk(v.customer) !== c.from) return v; var pt = { _clientWas: s(v.client || v.customer) }; if (v.client != null) pt.client = name; if (v.customer != null) pt.customer = name; return setF(v, pt, log, 'invs'); });
  });
  return { invs: invs, projects: projects, customers: customers, log: { id: meta.id || ('IL' + Date.parse(at).toString(36)), at: at, by: by, kind: 'cleanup', changes: log } };
}
function undo(lists, entry){
  var by = {}; (entry && entry.changes || []).forEach(function(c){ (by[c.list] = by[c.list] || {})[c.id] = (by[c.list][c.id] || []).concat([c]); });
  var res = {};
  ['invs', 'projects', 'customers'].forEach(function(k){
    res[k] = arr(lists[k]).map(function(r){ var cs = (by[k] || {})[s(r.id)]; if (!cs) return r; var n = Object.assign({}, r);
      cs.slice().reverse().forEach(function(c){ Object.keys(c.before).forEach(function(f){ if (c.before[f] === null) delete n[f]; else n[f] = c.before[f]; }); }); return n; });
  });
  return res;
}
/* a person links / unlinks one invoice: their choice is kept for good (pidManual; the finders never move it again) */
function relink(inv, p, meta){
  meta = meta || {}; var at = meta.at || new Date().toISOString(), by = meta.by || 'office';
  var logRow = { at: at, by: by, from: s(inv.pid), to: p ? s(p.id) : '', why: s(meta.why) || (p ? 'picked in 🔗 Check invoice ↔ job links' : 'left with no job') };
  var n = Object.assign({}, inv, { pidManual: true, _linkReviewed: at, linkedBy: by + ' (INVLINK review)', linkLog: (Array.isArray(inv.linkLog) ? inv.linkLog : []).concat([logRow]), updatedAt: at });
  delete n.autoLinked; delete n.autoLinkWhy; delete n.qbNeedsHome;
  if (p) { n.pid = s(p.id); n.po = s(p.autoPO || p.po); n.project = s(p.name); delete n.noAutoLink; }
  else { n.pid = ''; n.noAutoLink = true; if (inv.autoLinked || inv.linkedBy) n.po = ''; delete n.project; }
  return n;
}
/* the PO column: the job's PO, never the word "view" */
function poCell(inv, projects){
  var p = null; arr(projects).some(function(x){ if (s(x.id) === s(inv && inv.pid)) { p = x; return true; } return false; });
  if (p && s(p.autoPO || p.po)) return s(p.autoPO || p.po);
  var po = s(inv && inv.po); if (po && !/^view$/i.test(po)) return po;
  return '—';
}

/* ── payables: sub or supplier, and the job ── */
var SUP = /\b(suppl(y|ies|ier)|lumber|building products|materials?|hardware|home ?depot|lowe'?s|menards|ferguson|beacon|srs distribution|abc supply|84 lumber|sherwin|farrell[- ]?calhoun|farrel calhoun|paints?|ppg|benjamin moore|rentals?|sunbelt|united rentals|herc|electric(al)? supply|plumbing supply|hd supply|grainger|fastenal|white cap|tile shop|floor ?& ?decor|lansing|alside|aagm|media|marketing|graphics|google|planhub|waste|dumpsters?|dumps|floors|glass|windows and doors|carlson|insulation supply|gates lumber|l ?& ?w)\b/i;
var PERSONISH = /^[a-z]+(\s+[a-z]+){1,3}$/i;
function payeeKind(name, lists){
  var n = low(name).replace(/&amp;/g, '&'); if (!n) return { kind: 'unclear', why: 'no payee' };
  var all = arr(lists && lists.subs).concat(arr(lists && lists.vendors)), recs = all.filter(function(x){ return low(x.name).replace(/&amp;/g, '&') === n; });
  var ov = lists && lists.overrides && lists.overrides[n]; if (ov) return { kind: ov, why: 'set by a person' };
  var pk = recs.map(function(x){ return s(x.payeeKind); }).filter(Boolean)[0]; if (pk) return { kind: pk, why: 'set by a person' };
  if (recs.some(function(x){ return x.isSub === false; })) return { kind: 'supplier', why: 'on the vendor list (not a sub)' };
  var subEv = recs.filter(function(x){ return /^sub$/i.test(s(x.cat)) || s(x.trade) || x.w9 || x.coi || x.subAgreement || x.bidPortalUserId || x.onBidSite || (Array.isArray(x.trades) && x.trades.length); })[0];
  if (subEv) return { kind: 'sub', why: subEv.trade ? 'a sub (' + s(subEv.trade) + ')' : 'a sub (trade / W-9 / COI on file)' };
  if (SUP.test(n)) return { kind: 'supplier', why: 'a materials / supplier name' };
  if (/\b(construction|remodeling|roofing|plumbing|electric|hvac|air|masonry|painting|concrete|framing|drywall|flooring|insulation|awnings?|coatings|renovations|sealing|striping|cleaning|projects|gutter)\b/i.test(n)) return { kind: 'sub', why: 'a trade name' };
  if (PERSONISH.test(n) && !/\b(llc|inc|co|corp|company|services|solutions|group|holdings)\b/i.test(n)) return { kind: 'sub', why: 'a person (likely a sub)' };
  return { kind: 'unclear', why: 'not sure — is this a sub?' };
}
function payableKind(inv, lists){
  if (inv && inv.payeeType === 'supplier') return { kind: 'supplier', why: 'set on the bill' };
  if (inv && inv.payeeType === 'sub') return { kind: 'sub', why: 'set on the bill' };
  if (inv && (inv.subinv || inv.fromPortal || /portal/i.test(s(inv.source) + ' ' + s(inv.by)))) return { kind: 'sub', why: 'sent from the sub portal' };
  return payeeKind(inv && (inv.sub || inv.vendor || inv.payee), lists);
}
/* a sub's / supplier's bill → its job: the sub-portal job, the PO, the address, the job name, then the sub's own jobs around the bill date */
function matchPayable(inv, projects, opts){
  opts = opts || {};
  var portalPid = s(inv.portalPid || inv.subPortalPid || inv.jobPid);
  if (portalPid && arr(projects).some(function(p){ return s(p.id) === portalPid && liveJob(p); })) {
    var pp = arr(projects).filter(function(p){ return s(p.id) === portalPid; })[0];
    return { level: 'sure', pid: portalPid, conf: 100, top: { pid: portalPid, p: pp, score: 100, strong: 'portal', why: ['the job the sub picked in the sub portal'] }, list: [] };
  }
  var m = match(inv, projects, opts), payee = low(inv.sub || inv.vendor || inv.payee).replace(/&amp;/g, '&'), d = day(inv.recvDate || inv.date);
  if (payee) {
    var t = d ? Date.parse(d) : 0;
    arr(projects).forEach(function(p){
      if (!liveJob(p)) return;
      var on = arr(p.subs).filter(function(x){ var n = low(x.name || x.company).replace(/&amp;/g, '&'); return n && (n === payee || (n.length > 5 && payee.indexOf(n) >= 0) || (payee.length > 5 && n.indexOf(payee) >= 0)); })[0];
      if (!on) return;
      var near = 10, sd = day(on.startDate) || day(p.startDate), ed = day(on.endDate) || day(p.endDate) || day(p.completionDate);
      if (t && sd) { var a = Date.parse(sd) - 30 * 864e5, b = Date.parse(ed || sd) + 60 * 864e5; near = (t >= a && t <= b) ? 35 : 5; }
      var hit = m.list.filter(function(x){ return x.pid === s(p.id); })[0];
      if (hit) { hit.score += near; hit.why.push(s(on.name) + ' is on this job' + (near >= 35 ? ' around the bill date' : '')); }
      else m.list.push({ p: p, pid: s(p.id), score: near, strong: '', why: [s(on.name) + ' is on this job' + (near >= 35 ? ' around the bill date' : '')] });
    });
    m.list.sort(function(a, b){ return b.score - a.score; });
    var top = m.list[0], next = m.list[1], gap = top ? top.score - (next ? next.score : 0) : 0;
    m.top = top || null; m.conf = top ? Math.min(100, top.score) : 0;
    m.level = !top ? 'none' : (top.strong && top.score >= 90 && gap >= 25) ? 'sure' : (top.score >= 35 && gap >= 15) ? 'likely' : 'weak';
    m.pid = m.level === 'sure' ? top.pid : '';
  }
  return m;
}

return { OLDER_BEFORE: OLDER_BEFORE, ALIAS: ALIAS, nk: nk, custKey: custKey, custSame: custSame, aliasMap: aliasMap, isClient: isClient, isArchived: isArchived, isQB: isQB, qbNums: qbNums,
  isPastJob: isPastJob, isOverhead: isOverhead, liveJob: liveJob, addrKeysIn: addrKeysIn, jobAddrKeys: jobAddrKeys, match: match, sureJob: sureJob, scoreJob: scoreJob,
  placedByPerson: placedByPerson, audit: audit, plan: plan, apply: apply, undo: undo, relink: relink, poCell: poCell, openBal: openBal, isOverdue: isOverdue,
  payeeKind: payeeKind, payableKind: payableKind, matchPayable: matchPayable, customerMerges: customerMerges };
})();
