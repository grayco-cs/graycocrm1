/*__GC_PATCH_SUPSTMT__ (owner 11/23: "theres no way to track paying the main invoices from suppliers when they send us a large one day
  payment statement, we need to pay the statement at once but it also has the jobs we are paying, i'm going to enter the statement
  that abc sends us it needs to read the memo address po etc and match to correct jobs, it needs to mark off when we pay a statement
  what jobs are paid if they are on the right project if they havnt been paid etc").
  🧾 SUPPLIER STATEMENT — Accounting's tool row (next to 💳 / 🏦 statement imports) and the Invoices pages' 💵 row. Admins, the office and
  accounting roles (by role, never by name; never while viewing as someone else).
  1. ENTER: the supplier (CRM vendors / subs, or typed), statement date / #, then the statement PDF (read by patch STMTPDF's PDF reader:
     words with positions → lines and columns), a photo or a scanned PDF (read by the bulk-drop reader, patch BULKDROP's AI), a CSV,
     and / or typed / pasted lines. The file is kept in the CRM's file store (window._gcStoreFile) and on the statement record.
  2. READ every line: invoice #, date, type, PO / job #, ship-to / job address, memo / job name, amount (the open / balance-due column
     when it is not a running balance); credits / returns negative; finance / service charges flagged; payments and balance-forward
     lines shown, never paid. The statement's own printed total is checked against the lines.
  3. MATCH each line — (a) the CRM bill: invoice # first (2345678-00 = 2345678), then the same amount + date (±7 days) + supplier;
     (b) the job: PO / autoPO, then the ship-to address, then a job a person picked for the same text on an earlier statement, then the
     memo / customer name (patch QBCSV's matcher, window._gcQbMatch), then the bill's own job. Each line shows the job, why, and:
       ✅ matched + unpaid · ⚠ already paid (when, how, check #, which statement) — left out so nothing is paid twice ·
       ⚠ "wrong project?" (the statement's PO / address points to another job than the bill in the CRM) — the person picks ·
       ❓ no job found — pick one · ➕ not in the CRM yet — added as a bill on that job when paid · 💸 credit · 🧮 finance charge ·
       the job closed / archived noted.
  4. A PERSON'S PICK OR EDIT IS PERMANENT: each line keeps the person's own choices (job, bill, include, amount, edits) apart from what
     the matcher found; a re-match only redoes the matcher's part, and computers merge the person's choices newest-first per choice.
  5. PAY THE STATEMENT AT ONCE: one payment (date, method, check # / reference, paid from, amount, note). Included lines total vs the
     payment, untick disputed lines, partial pay (a line's amount, or ⚡ oldest first). 💵 Pay statement: bills for ➕ lines on their
     jobs (+ the job's cost row), a bill moved to the job the person picked, then ONE lump-sum payment (patch LUMPSUM: each bill paid /
     partly paid the way "Mark paid" does it, its cost row paid, the register's "Sub Paid" row, the payment record), credits as a
     negative cost on their job, a finance charge as overhead. Each paid bill and its cost row carry "Paid on <Supplier> statement
     <#/date>, check <#>" — shown on the job's Invoices / Expenses lines. The statement record is kept (never deleted; fully paid →
     archived): which lines were paid, which are still open, by whom and when.
  6. THE SAME STATEMENT AGAIN (same supplier + number, or date + total, or the same file) opens the one already in the CRM. Bills paid on
     an earlier statement are recognized (⚠ already paid … on statement #…).
  7. 🗂 STATEMENTS: per supplier — open / partly paid / paid, totals; open each to see its lines and their jobs.
  8. Desk and phone (cards under 700 px); matching runs in small slices (never a long freeze) — a job index built once per job list.
  Records: gc_kv "gc_sup_statements" (one row, merged by statement id; the person's choices merged per choice).
  API: window._gcSupStmt = { open(opt), close(), list(), get(id), read(input), match(id), pick(id, lineId, k, v), pay(id, p),
       oldestFirst(id, amount), view(id), canUse(), core }  — core = the pure rules (parse / match / status), also window._gcSupStmtCore */
(function(W){
'use strict';
if (W.__gcSupStmtLoaded) return; W.__gcSupStmtLoaded = true;

/* ═════════════════════════════ THE RULES (pure) ═════════════════════════════ */
var CORE = (function(){
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function num(v){
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var t = s(v).replace(/[−–]/g, '-'), neg = /^\(.*\)$/.test(t) || /^-/.test(t) || /-$/.test(t) || /\s?CR$/i.test(t);
  var n = parseFloat(t.replace(/CR$|DR$/i, '').replace(/[^0-9.]/g, ''));
  return isFinite(n) ? (neg ? -n : n) : 0;
}
function r2(v){ return Math.round(num(v) * 100) / 100; }
function cents(v){ return Math.round(num(v) * 100); }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function nk(t){ return low(t).replace(/&amp;/g, '&').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function normParty(n){
  return low(n).replace(/&amp;/g, '&').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(llc|l l c|inc|incorporated|co|company|corp|corporation|ltd|the|of|pllc|lp)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
function sameParty(a, b){ var x = normParty(a), y = normParty(b); return !!x && x === y; }
function looseParty(a, b){ var x = normParty(a), y = normParty(b); if (!x || !y) return false; if (x === y) return true; return (x.length >= 3 && (y + ' ').indexOf(x + ' ') === 0) || (y.length >= 3 && (x + ' ').indexOf(y + ' ') === 0); }
function normNo(x){ return low(x).replace(/[^a-z0-9]/g, '').replace(/^0+/, ''); }
/* an invoice # and the forms the CRM may hold it in: "2345678-00" → 234567800, 2345678 · "INV-5512" → inv5512, 5512 */
function noKeys(x){
  var t = s(x).toUpperCase().replace(/\s+/g, ''); if (!t) return [];
  var out = [normNo(t)], m = /^(.*\d)[-\/.](\d{1,3})$/.exec(t); if (m) out.push(normNo(m[1]));
  var a = t.replace(/^(INV|IN|CM|CR|FC|SO|ORD|NO|#)[-#:.]*/i, ''); if (a !== t) { out.push(normNo(a)); var m2 = /^(.*\d)[-\/.](\d{1,3})$/.exec(a); if (m2) out.push(normNo(m2[1])); }
  return out.filter(function(k, i){ return k.length >= 3 && out.indexOf(k) === i; });
}
/* ── dates ── */
var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
var MONRX = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
var DATE_FIND = new RegExp('(\\d{4}-\\d{1,2}-\\d{1,2}|\\b\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}\\b|\\b' + MONRX + '\\s+\\d{1,2},?\\s+\\d{4}\\b|\\b\\d{1,2}-' + MONRX + '-\\d{2,4}\\b)', 'i');
function mk(y, m, d){ if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100)) return ''; return y + '-' + pad(m) + '-' + pad(d); }
function y4(y){ return y < 100 ? 2000 + y : y; }
function dateOf(t, hint){
  t = s(t).replace(/,/g, ' ').replace(/\s+/g, ' '); var m;
  if (!t) return '';
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) return mk(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(t))) return mk(y4(+m[3]), +m[1], +m[2]);
  if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(t))) { var hy = +(s(hint).slice(0, 4)) || new Date().getFullYear(), hm = +(s(hint).slice(5, 7)) || 12, mo = +m[1]; return mk(mo > hm ? hy - 1 : hy, mo, +m[2]); }
  if ((m = new RegExp('^(' + MONRX + ')\\s+(\\d{1,2})\\s+(\\d{4})$', 'i').exec(t))) return mk(+m[3], MON[low(m[1]).slice(0, 3)], +m[2]);
  if ((m = new RegExp('^(\\d{1,2})[\\s-](' + MONRX + ')[\\s-](\\d{2,4})$', 'i').exec(t))) return mk(y4(+m[3]), MON[low(m[2]).slice(0, 3)], +m[1]);
  return '';
}
function days(a, b){ var x = Date.parse(s(a).slice(0, 10) + 'T12:00:00Z'), y = Date.parse(s(b).slice(0, 10) + 'T12:00:00Z'); return isFinite(x) && isFinite(y) ? Math.abs(x - y) / 864e5 : 999; }
/* ── money ── */
var MONEY_ONE = /^\(?[-−–]?\s?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?(?:\s?CR|-)?$/i;
var MONEY_FIND = /(^|\s)(\(?[-−–]?\s?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?(?:\s?CR\b|-(?=\s|$))?)(?=\s|$)/gi;
function moneys(t){ var out = [], m; t = t == null ? '' : String(t); MONEY_FIND.lastIndex = 0; while ((m = MONEY_FIND.exec(t))) out.push({ s: m[2], v: num(m[2]), at: m.index + m[1].length }); return out; }
/* ── line types ── */
var T_CREDIT = /^(cm|cr|crm|cn|credit|credits|crmemo|credit ?memo|rtn|ret|return|returns|rma|refund|allowance)$/i;
var T_FIN = /^(fc|fin|finchg|fin ?chg|finance|finance ?charge|svc|svc ?chg|sc|service ?charge|late|late ?fee|lf|int|interest)$/i;
var T_PAY = /^(pmt|pymt|pay|paymt|payment|chk|ck|check|cash|ach|eft|rcpt|receipt|pa)$/i;
var T_INV = /^(inv|invc|invoice|in|iv|sale|sales|dm|debit|db|chg|charge|ord|so|bill|ti)$/i;
var T_ADJ = /^(adj|adjust|adjustment|ja|je)$/i;
function typeOf(t){ t = s(t).replace(/[.:#]+$/, ''); if (!t) return ''; if (T_CREDIT.test(t)) return 'credit'; if (T_FIN.test(t)) return 'finance'; if (T_PAY.test(t)) return 'payment'; if (T_INV.test(t)) return 'invoice'; if (T_ADJ.test(t)) return 'adjust'; return ''; }
var FIN_TXT = /finance\s*charge|service\s*charge|late\s*(fee|charge)|interest\s*charge/i;
var PAY_TXT = /\b(payment(\s*received)?|thank\s*you|pmt\s*rec(eived)?|paid\s*by\s*check|check\s*payment)\b/i;
var CREDIT_TXT = /\b(credit\s*memo|returned|return|rma|restock(ing)?\s*credit)\b/i;
var FWD_TXT = /\b(balance\s*forward|previous\s*balance|beginning\s*balance|bal\.?\s*fwd|opening\s*balance|prior\s*balance)\b/i;
var NOISE = /^(page\s*\d|\(?continued|sub-?total|total\b|statement\s*total|amount\s*due|total\s*due|balance\s*due|please\s*(pay|remit)|remit|aging|current\s+\d|current\s*$|thank\s*you\s*for|if\s*you\s*have|questions|make\s*checks)/i;
var ADDR_RX = /(?:^|\s)(\d{1,6}[A-Za-z]?\s+(?:[NSEW]\.?\s+)?[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z0-9.'-]+){0,3}?\s+(?:st|street|rd|road|dr|drive|ln|lane|cv|cove|ave|av|avenue|blvd|boulevard|ct|court|cir|circle|pl|place|pkwy|parkway|way|trl|trail|loop|pike|hwy|highway|ter|terrace|sq|square|xing|crossing|plz|plaza)\b\.?(?:\s*(?:#|apt|unit|ste|suite)\s*[A-Za-z0-9-]+)?(?:,?\s+[A-Za-z .'-]{2,30}?,?\s+(?:TN|MS|AR|AL|KY|GA|MO|TX|LA|FL)\b(?:\s+\d{5}(?:-\d{4})?)?)?)/i;
var PO_LABEL = /\b(?:p\.?\s?o\.?|po\s*#|po\s*no\.?|cust(?:omer)?\s*po|job\s*(?:#|no\.?|number)|purchase\s*order)\s*[:#.-]?\s*(?!box\b)([A-Za-z]{0,4}[-\s]?\d{2,8}[A-Za-z0-9-]{0,6})\b/i;
var AUTOPO_LIKE = /^[A-Z]{1,3}-?\d{3,6}$/;

/* ── header (column) words → what the column holds ── */
function role(h){
  var x = low(h).replace(/\s+/g, ' ').replace(/[:.]+$/, '').trim();
  if (!x || x.length > 40) return '';
  if (/^(due( date)?|terms|disc(ount)?( date| amt| amount)?|days( past due)?|age|aging)$/.test(x)) return 'skip';
  if (/^(current|\d+\s*-\s*\d+( days)?|over \d+( days)?|\d+\+( days)?|past due|\d+ days)$/.test(x)) return 'aging';
  if (/^(type|trans(action)? type|doc(ument)? type|tran|trx|code|tr type|tran type|txn type)$/.test(x)) return 'type';
  if (/(^|\s)(p\.? ?o\.?( ?#| no| number)?|po ?#|purchase order|cust(omer)? po|job ?#|job no|job number)($|\s)/.test(x) && !/name/.test(x)) return 'po';
  if (/ship ?-?to|job ?(site|address|addr)|deliver|site address|^address$|^location$|^ship$/.test(x)) return 'ship';
  if (/date/.test(x)) return 'date';
  if (/^(inv(oice)?|inv(oice)? ?(#|no|num(ber)?)|ref(erence)?( ?(#|no|num(ber)?))?|doc(ument)? ?(#|no|num(ber)?)?|trans(action)? ?(#|no|num(ber)?)|number|no|#|item ?#?|txn ?#?)$/.test(x)) return 'inv';
  if (/^(open|open amount|open bal(ance)?|balance due|bal(ance)? due|amount due|amt due|due amount|remaining|unpaid|open amt|balance|bal|outstanding)$/.test(x)) return 'open';
  if (/^(credits?|payments?( ?(\/|&|and) ?credits?)?|cr|credit amt|credit amount)$/.test(x)) return 'credit';
  if (/^(amount|amt|inv(oice)? ?(amount|amt|total)|original( amount| amt)?|orig( amt)?|charges?|debits?|total|sale amount|gross|invoice amt)$/.test(x)) return 'orig';
  if (/memo|desc|job ?name|^job$|project|remark|note|comment|customer|reference name|^name$/.test(x)) return 'memo';
  return '';
}
function headerOf(line){
  var cells = line.cells || [], roles = cells.map(function(c){ return role(c.s); }), n = roles.filter(function(r){ return r && r !== 'skip'; }).length;
  var has = function(k){ return roles.indexOf(k) >= 0; };
  if (n >= 3 && (has('orig') || has('open') || has('credit')) && (has('inv') || has('date'))) return cells.map(function(c, i){ return { x: c.x, x2: c.x2, role: roles[i], s: c.s }; });
  return null;
}
/* plain text (typed / pasted / CSV) → lines of cells: tabs, 2+ spaces, or CSV commas */
function csvSplit(l){ var out = [], cur = '', q = false; for (var i = 0; i < l.length; i++) { var ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(function(x){ return x.trim(); }); }
function textPages(text, csv){
  var L = s(text).split(/\r?\n/).map(function(l, i){
    var tab = !csv && l.indexOf('\t') >= 0, keep = csv || tab;   /* CSV / tab-separated: an empty column is a column */
    var parts = csv ? csvSplit(l) : tab ? l.split('\t').map(function(x){ return x.trim(); }) : l.split(/\s{2,}/).map(function(x){ return x.trim(); });
    var cells = [], x = 0; parts.forEach(function(p){ if (keep || p) cells.push({ x: x, x2: x + 1, s: p }); x += 2; });
    return { page: 1, y: 100000 - i, cells: cells, text: parts.filter(Boolean).join('  '), plain: true };
  }).filter(function(l){ return l.cells.some(function(c){ return c.s; }); });
  return { pages: [L], n: 1 };
}
/* the statement's own details (date, #, account, printed total) from its lines */
var MONEY_SRC = '\\(?-?\\$?\\s?(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}\\)?';
var DATE_SRC = '(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|' + MONRX + '\\s+\\d{1,2},?\\s+\\d{4})';
function headInfo(texts){
  var all = texts.join('\n'), m, out = { stmtDate: '', stmtNo: '', accountNo: '', total: null, top: texts.slice(0, 8) };
  if ((m = new RegExp('statement\\s*date\\s*[:#]?\\s*' + DATE_SRC, 'i').exec(all)) || (m = new RegExp('(?:as\\s*of|closing\\s*date|period\\s*end(?:ing)?|statement\\s*through|through)\\s*[:#]?\\s*' + DATE_SRC, 'i').exec(all))) out.stmtDate = dateOf(m[1]);
  if (!out.stmtDate) { var top = texts.slice(0, 15).join('\n'); if ((m = new RegExp('\\bdate\\s*[:#]\\s*' + DATE_SRC, 'i').exec(top))) out.stmtDate = dateOf(m[1]); }
  if ((m = /statement\s*(?:#|no\.?|number|num)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i.exec(all))) out.stmtNo = s(m[1]);
  if ((m = /(?:account|acct|customer)\s*(?:#|no\.?|number|num)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{2,})/i.exec(all))) out.accountNo = s(m[1]);
  var rx = new RegExp('(?:total\\s*(?:amount\\s*)?due|amount\\s*due|balance\\s*due|total\\s*balance|new\\s*balance|please\\s*pay(?:\\s*this\\s*amount)?|statement\\s*(?:total|balance)|total\\s*open|account\\s*balance|total\\s*amount)\\s*[:$]*\\s*(' + MONEY_SRC + ')', 'gi');
  var last = null; while ((m = rx.exec(all))) last = m[1];
  if (last != null) out.total = r2(num(last));
  return out;
}
/* one line → fields, by its words alone (no header, or a typed line) */
function heur(text, ctx){
  ctx = ctx || {};
  var t = ' ' + s(text).replace(/\s+/g, ' ') + ' ', f = { date: '', invNo: '', type: '', po: '', shipTo: '', memo: '', amts: [] };
  var lead = /^\s*(\d{1,2}\/\d{1,2})(?=\s)/.exec(t);
  var dm = DATE_FIND.exec(t);
  if (dm) { f.date = dateOf(dm[1], ctx.hint); if (f.date) t = t.slice(0, dm.index) + ' ' + t.slice(dm.index + dm[1].length); }
  else if (lead) { f.date = dateOf(lead[1], ctx.hint); if (f.date) t = t.slice(lead.index + lead[0].length); }
  /* amounts: the money words (right to left on the line) */
  var ms = moneys(t);
  f.amts = ms.map(function(x){ return x.v; });
  for (var i = ms.length - 1; i >= 0; i--) t = t.slice(0, ms[i].at) + ' ' + t.slice(ms[i].at + ms[i].s.length);
  var pl = PO_LABEL.exec(t); if (pl) { f.po = s(pl[1]).replace(/\s+/g, ''); t = t.replace(pl[0], ' '); }
  var am = ADDR_RX.exec(t); if (am && /[A-Za-z]{2,}/.test(am[1])) { f.shipTo = s(am[1]).replace(/\s+/g, ' ').replace(/,$/, ''); t = t.replace(am[1], ' '); }
  var words = t.split(' ').filter(Boolean), rest = [];
  words.forEach(function(w, i){
    var bare = w.replace(/[,;]+$/, '');
    if (!f.type && i < 3 && bare.length <= 12 && bare === bare.toUpperCase() && typeOf(bare)) { f.type = typeOf(bare); return; }
    if (!f.invNo && /\d{3,}/.test(bare) && !/[.$]/.test(bare) && !dateOf(bare) && bare.replace(/\D/g, '').length >= 3 && /^[A-Za-z]{0,4}[-#]?[\dA-Za-z][\dA-Za-z\-\/]*$/.test(bare) && !(ctx.knownPO && ctx.knownPO(bare))) { f.invNo = bare.replace(/^#/, ''); return; }
    if (!f.po && ((ctx.knownPO && ctx.knownPO(bare)) || (i < 5 && AUTOPO_LIKE.test(bare)))) { f.po = bare; return; }
    rest.push(w);
  });
  f.memo = rest.join(' ').replace(/\b(ship\s*to|deliver(ed)?\s*to|job\s*site)\b\s*:?/ig, ' ').replace(/\s{2,}/g, ' ').replace(/^[-–—:|/\s]+|[-–—:|/\s]+$/g, '').replace(/\s+\/\s*$/, '');
  return f;
}
/* where a cell sits under the header: the column it overlaps most (money is right-aligned: nearest right edge) */
function colOf(c, H, plain, i, n){
  if (plain) return n === H.length ? H[i] : null;
  var best = null, bo = 0;
  H.forEach(function(h){ var ov = Math.min(c.x2, h.x2) - Math.max(c.x, h.x); if (ov > bo) { bo = ov; best = h; } });
  if (best) return best;
  var money = MONEY_ONE.test(c.s), bd = 1e9;
  H.forEach(function(h){ var d = money ? Math.abs(c.x2 - h.x2) : Math.abs(c.x - h.x); if (d < bd) { bd = d; best = h; } });
  return best;
}
/* a PDF cell that ran its words into the amount ("…CHECK 4410-842.17", "PAT DEMO 1,250.00"): the amount split off, placed where it sits */
var TRAIL_MONEY = /(\(?[-−–]?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?(?:\s?CR)?)$/i;
function splitCells(cells){
  var out = [];
  (cells || []).forEach(function(c){
    var t = String(c.s || ''), m = TRAIL_MONEY.exec(t);
    if (!m || MONEY_ONE.test(t.trim()) || !/[A-Za-z0-9]/.test(t.slice(0, m.index))) { out.push(c); return; }
    var w = (c.x2 - c.x) / Math.max(1, t.length), head = t.slice(0, m.index).replace(/\s+$/, '');
    out.push({ x: c.x, x2: c.x + head.length * w, fs: c.fs, s: head });
    out.push({ x: c.x + m.index * w, x2: c.x2, fs: c.fs, s: m[1].trim() });
  });
  return out;
}
/* PARSE: pages of lines (patch STMTPDF's PDF lines, or textPages) → { head, lines:[{n, date, invNo, type, kind, po, shipTo, memo, amount, orig, open, raw}], warn } */
function parse(doc, opt){
  opt = opt || {};
  var pages = (doc && doc.pages) || [], texts = [];
  pages.forEach(function(L){ L.forEach(function(l){ texts.push(s(l.text)); }); });
  var head = headInfo(texts), hint = opt.stmtDate || head.stmtDate || '';
  var out = [], H = null, last = null, n = 0, pageNo = 0;
  pages.forEach(function(L, pi){
    last = null;   /* a description never runs on from the page before */
    L.forEach(function(l){
      var text = s(l.text); if (!text) return;
      if (!l.plain) l = Object.assign({}, l, { cells: splitCells(l.cells) });
      var h = headerOf(l); if (h) { H = h; last = null; return; }
      if (NOISE.test(text) || (/^(statement|remit\s*to|sold\s*to|bill\s*to|ship\s*to\s*:|account|acct|customer\s*(#|no)|branch|phone|fax|page)\b/i.test(text) && !moneys(text).length)) { if (NOISE.test(text)) last = null; return; }
      var f = { date: '', invNo: '', type: '', po: '', shipTo: '', memo: '', orig: null, open: null, credit: null, aging: null };
      var hu = heur(text, { hint: hint, knownPO: opt.knownPO }), byCol = false;
      if (H) {
        var memo = [], cnt = l.cells.length;
        l.cells.forEach(function(c, i){
          var col = colOf(c, H, !!l.plain, i, cnt); if (!col) return; byCol = true;
          var v = s(c.s), r = col.role;
          if (!v) return;
          if (r === 'date') { var d = dateOf(v, hint) || dateOf(v.split(/\s+/)[0], hint); if (d) f.date = d; else memo.push(v); }
          else if (r === 'inv') { if (!f.invNo) f.invNo = v.replace(/^#/, ''); }
          else if (r === 'type') { f.type = typeOf(v) || f.type; if (!typeOf(v)) memo.push(v); }
          else if (r === 'po') f.po = (f.po ? f.po + ' ' : '') + v;
          else if (r === 'ship') f.shipTo = (f.shipTo ? f.shipTo + ' ' : '') + v;
          else if (r === 'orig' || r === 'open' || r === 'credit' || r === 'aging') { if (MONEY_ONE.test(v)) { var a = num(v); if (r === 'aging') f.aging = (f.aging || 0) + a; else f[r] = a; } else memo.push(v); }
          else if (r === 'skip') {}
          else memo.push(v);
        });
        f.memo = memo.join(' ');
      }
      if (!byCol || (!f.date && !f.invNo)) {
        f.date = f.date || hu.date; f.invNo = f.invNo || hu.invNo; f.type = f.type || hu.type; f.po = f.po || hu.po; f.shipTo = f.shipTo || hu.shipTo;
        if (!byCol) { f.memo = hu.memo; if (hu.amts.length === 1) f.orig = hu.amts[0]; else if (hu.amts.length >= 2) { f.orig = hu.amts[0]; f.open = hu.amts[hu.amts.length - 1]; } }
      }
      if (!f.type && f.memo) { var w0 = s(f.memo).split(/\s+/)[0]; if (typeOf(w0)) { f.type = typeOf(w0); f.memo = s(f.memo).slice(w0.length).trim(); } }
      /* a PO / address written inside the memo column */
      if (f.memo && (!f.po || !f.shipTo)) { var hm = heur(f.memo, { hint: hint, knownPO: opt.knownPO }); if (!f.po && hm.po) { f.po = hm.po; f.memo = s(f.memo).replace(PO_LABEL, ' ').replace(/\s+/g, ' ').trim(); } if (!f.shipTo && hm.shipTo) { f.shipTo = hm.shipTo; f.memo = s(f.memo).replace(hm.shipTo, ' ').replace(/\s+/g, ' ').trim(); } }
      var hasAmt = f.orig != null || f.open != null || f.credit != null || f.aging != null;
      if (!hasAmt || (!f.date && !f.invNo)) {
        /* the rest of the line above (a second description / ship-to line) */
        var near = l.plain || !last || last._y == null || Math.abs(last._y - (l.y || 0)) <= 2.6 * (l.fs || 10);
        if (last && near && !hasAmt && !f.date && !headerOf(l) && text.length < 120) {
          last._y = l.y;
          var hx = heur(text, { hint: hint, knownPO: opt.knownPO });
          if (!last.po && hx.po) last.po = hx.po;
          if (!last.shipTo && hx.shipTo) last.shipTo = hx.shipTo;
          var extra = s(hx.memo); if (extra && !/^(page|continued)/i.test(extra)) last.memo = s(last.memo + ' ' + extra);
          last.raw += ' / ' + text;
        }
        return;
      }
      if (FWD_TXT.test(text)) { last = null; return; }
      f.raw = text; f.n = ++n; f.page = l.page || pi + 1; f._y = l.y;
      out.push(f); last = f;
    });
  });
  /* a "Balance" column that is a running balance is not the line's amount */
  var both = out.filter(function(f){ return f.orig != null && f.open != null; }), run = 0;
  for (var i = 1; i < both.length; i++) if (Math.abs(cents(both[i].open) - cents(both[i - 1].open) - cents(both[i].orig)) <= 1) run++;
  var running = both.length >= 3 && run >= (both.length - 1) * 0.6;
  var lines = out.map(function(f){
    var amt = f.open != null && !running ? f.open : f.orig != null ? f.orig : f.aging != null ? f.aging : f.credit != null ? -Math.abs(f.credit) : 0;
    if (f.orig == null && f.open == null && f.credit != null) amt = -Math.abs(f.credit);
    var txt = f.type + ' ' + f.memo + ' ' + f.raw;
    var kind = f.type === 'payment' || (!f.type && PAY_TXT.test(f.memo) && !/invoice/i.test(f.memo)) ? 'payment' : f.type === 'finance' || FIN_TXT.test(txt) ? 'finance' : (f.type === 'credit' || amt < 0 || (!f.type && CREDIT_TXT.test(f.memo))) ? 'credit' : 'invoice';
    if (kind === 'credit') amt = -Math.abs(amt);
    if (kind === 'payment') amt = -Math.abs(amt);
    return { n: f.n, page: f.page, date: f.date, invNo: s(f.invNo).slice(0, 40), type: f.type || '', kind: kind, po: s(f.po).slice(0, 40), shipTo: s(f.shipTo).slice(0, 160), memo: s(f.memo).slice(0, 200),
      amount: r2(amt), orig: f.orig != null ? r2(f.orig) : null, open: f.open != null && !running ? r2(f.open) : null, raw: s(f.raw).slice(0, 300) };
  });
  var sum = r2(lines.reduce(function(a, l){ return a + l.amount; }, 0));   /* the statement's balance: payments on it count too */
  var warn = '';
  if (head.total != null && Math.abs(cents(head.total) - cents(sum)) > 1) warn = 'The lines add up to ' + sum.toFixed(2) + '; the statement says ' + head.total.toFixed(2) + ' — check for a missed or extra line.';
  return { head: head, lines: lines, sum: sum, running: running, warn: warn };
}
/* the photo / scanned-PDF reader's answer → the same shape */
function fromAi(o){
  o = o && typeof o === 'object' ? o : {};
  var lines = (Array.isArray(o.lines) ? o.lines : []).filter(function(l){ return l && typeof l === 'object'; }).map(function(l, i){
    var t = typeOf(l.type) || low(l.type), amt = num(l.amount), memo = s(l.memo), kind = t === 'payment' ? 'payment' : t === 'finance' || FIN_TXT.test(memo) ? 'finance' : (t === 'credit' || amt < 0) ? 'credit' : 'invoice';
    if (kind === 'credit' || kind === 'payment') amt = -Math.abs(amt);
    return { n: i + 1, page: 1, date: dateOf(l.date) || '', invNo: s(l.invoiceNo || l.invNo).slice(0, 40), type: t, kind: kind, po: s(l.po).slice(0, 40), shipTo: s(l.shipTo).slice(0, 160), memo: memo.slice(0, 200), amount: r2(amt), orig: null, open: null, raw: [l.date, l.invoiceNo, l.po, l.shipTo, l.memo, l.amount].map(s).filter(Boolean).join(' · ').slice(0, 300) };
  });
  var head = { stmtDate: dateOf(o.statementDate) || '', stmtNo: s(o.statementNo), accountNo: s(o.accountNo), total: o.totalDue != null && o.totalDue !== '' ? r2(o.totalDue) : null, top: [s(o.supplier)] };
  var sum = r2(lines.reduce(function(a, l){ return a + l.amount; }, 0));
  return { head: head, lines: lines, sum: sum, supplier: s(o.supplier), warn: head.total != null && Math.abs(cents(head.total) - cents(sum)) > 1 ? 'The lines add up to ' + sum.toFixed(2) + '; the statement says ' + head.total.toFixed(2) + '.' : '' };
}

/* ── bills (the LUMPSUM rules, so both agree) ── */
function isBill(r){ return /^(sub|supplier)$/.test(low(r && r.type)); }
function amtOf(r){ return num(r && (r.amt != null && r.amt !== '' ? r.amt : r.amount)); }
function payAmt(p){ return num(p && (p.amount != null && p.amount !== '' ? p.amount : p.amt)); }
function paidOf(r){
  var p = (r && Array.isArray(r.payments) ? r.payments : []).filter(function(x){ return x && typeof x === 'object'; });
  if (p.length) return r2(p.reduce(function(a, x){ return a + payAmt(x); }, 0));
  if (low(r.status) === 'paid' || r.paid === true) return amtOf(r);
  if (num(r.amountPaid) > 0) return r2(r.amountPaid);
  if (r.openBalance != null && r.openBalance !== '' && isFinite(parseFloat(r.openBalance))) return r2(Math.max(0, amtOf(r) - num(r.openBalance)));
  return 0;
}
function isPaid(r){ return !!r && (low(r.status) === 'paid' || r.paid === true || (amtOf(r) > 0 && paidOf(r) >= amtOf(r) - 0.004)); }
function openOf(r){ if (!r || isPaid(r)) return 0; return r2(Math.max(0, amtOf(r) - paidOf(r))); }
var DEAD = /^(void|voided|cancel+ed|canceled|denied|rejected|deleted|declined|merged)$/;
function liveBill(r){ return !!r && isBill(r) && r.deleted !== true && r.isStatement !== true && !DEAD.test(low(r.status)); }
function billNo(r){ return s(r.invNum || r.num || r.number || r.qbNum || r.invNo); }
function billDay(r){ return s(r.recvDate || r.invDate || r.date || r.createdAt).slice(0, 10); }
function billParty(r){ return s(r.sub || r.vendor || r.payee).replace(/&amp;/g, '&'); }

/* ── MATCH 1: the CRM bill — invoice # first, then the amount + date + supplier ── */
function matchBills(lines, bills, o){
  o = o || {};
  var sup = s(o.supplier), supId = s(o.supplierId);
  var mine = bills.filter(function(b){ return liveBill(b) && ((supId && s(b.subId) === supId) || sameParty(billParty(b), sup) || looseParty(billParty(b), sup)); });
  var byKey = {};
  mine.forEach(function(b){ [billNo(b), b.qbNum].forEach(function(no, j){ noKeys(no).forEach(function(k, i){ (byKey[k] = byKey[k] || []).push({ b: b, exact: i === 0 && j === 0 }); }); }); });
  var used = {}, res = lines.map(function(){ return null; });
  /* a person's own pick comes first and is never taken by another line */
  lines.forEach(function(l, i){ if (l.humanInv != null) { res[i] = l.humanInv ? { invId: l.humanInv, how: 'person', why: 'picked by a person' } : { invId: '', how: 'person', why: 'a person said it is not in the CRM' }; if (l.humanInv && l.humanInv !== '__new') used[l.humanInv] = 1; } });
  lines.forEach(function(l, i){
    if (res[i] || l.kind === 'payment') return;
    var ks = noKeys(l.invNo); if (!ks.length) return;
    var hits = [];
    ks.forEach(function(k, ki){ (byKey[k] || []).forEach(function(h){ if (!used[h.b.id] && !hits.some(function(x){ return x.b === h.b; })) hits.push({ b: h.b, sc: (ki === 0 && h.exact ? 3 : 2) }); }); });
    if (!hits.length) return;
    hits.sort(function(a, b){ return (b.sc - a.sc) || (Math.abs(cents(amtOf(a.b)) - cents(Math.abs(l.amount))) - Math.abs(cents(amtOf(b.b)) - cents(Math.abs(l.amount)))); });
    var b = hits[0].b; used[b.id] = 1;
    res[i] = { invId: s(b.id), how: 'invoice', why: 'invoice # ' + billNo(b) + ' is in the CRM', amtDiff: cents(amtOf(b)) !== cents(Math.abs(l.amount)) && cents(openOf(b)) !== cents(Math.abs(l.amount)) };
  });
  lines.forEach(function(l, i){
    if (res[i] || l.kind === 'payment' || l.kind === 'finance') return;
    var c = cents(Math.abs(l.amount)); if (!c) return;
    var lk = noKeys(l.invNo);
    var hits = mine.filter(function(b){
      if (used[b.id]) return false;
      if (cents(amtOf(b)) !== c && cents(openOf(b)) !== c) return false;
      if ((l.amount < 0) !== (amtOf(b) < 0)) return false;
      if (l.date && billDay(b) && days(l.date, billDay(b)) > 7) return false;
      var bk = noKeys(billNo(b)); if (lk.length && bk.length && !bk.some(function(k){ return lk.indexOf(k) >= 0; })) return false;   /* both have a #, and they differ */
      return true;
    });
    if (!hits.length) return;
    hits.sort(function(a, b){ return days(l.date, billDay(a)) - days(l.date, billDay(b)); });
    var b = hits[0]; used[b.id] = 1;
    res[i] = { invId: s(b.id), how: 'amount', why: 'the same amount' + (l.date && billDay(b) ? ' and date (' + billDay(b) + ')' : '') + ' from ' + billParty(b), several: hits.length > 1 };
  });
  return res;
}

/* ── MATCH 2: the job — PO, then the ship-to address, then a person's earlier pick for the same text, then the memo / customer,
   then the bill's own job. X = jobCtx(projects, QB) ── */
var CLOSEDJOB = /^(completed?|closed|archived|lost|cancel+ed|dead|declined|rejected)$/i;
function jobCtx(projects, QB){
  var idx = QB && QB.jobIndex ? QB.jobIndex(projects) : [], byPO = {}, byNum = {}, byId = {};
  idx.forEach(function(J){ byId[J.id] = J; (J.pos || []).forEach(function(po){ (byPO[po] = byPO[po] || []).push(J); }); if (J.addr && J.addr.n) (byNum[J.addr.n] = byNum[J.addr.n] || []).push(J); });
  return { idx: idx, byPO: byPO, byNum: byNum, byId: byId, QB: QB, mem: {} };
}
function poN(X, v){ return X.QB && X.QB.poNorm ? X.QB.poNorm(v) : s(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function liveFirst(list){ var a = list.filter(function(J){ return !J.lost && !J.done; }); return a.length ? a : list.filter(function(J){ return !J.lost; }).length ? list.filter(function(J){ return !J.lost; }) : list; }
function memKeys(X, l){ var k = []; if (s(l.shipTo)) k.push('ship:' + nk(l.shipTo)); if (s(l.po)) k.push('po:' + poN(X, l.po)); if (nk(l.memo).length >= 4) k.push('memo:' + nk(l.memo)); return k; }
function jobFor(l, X, bill){
  var out = { pid: '', how: '', why: '', cands: [], stmtPid: '', invPid: bill && bill.pid && X.byId[s(bill.pid)] ? s(bill.pid) : '' };
  function cand(J, why, sc){ if (!J || out.cands.some(function(c){ return c.pid === J.id; })) return; out.cands.push({ pid: J.id, name: J.name, why: why, score: sc }); }
  function take(J, how, why){ out.pid = out.stmtPid = J.id; out.how = how; out.why = why; cand(J, why, 99); return out; }
  /* a. the PO / job # */
  var pos = [];
  s(l.po).toUpperCase().split(/[\s,;\/]+/).forEach(function(t){ var p = poN(X, t); if (p.length >= 3) { pos.push(p); var b = p.replace(/(\d)[A-Z]$/, '$1'); if (b !== p) pos.push(b); } });
  var pl = PO_LABEL.exec(s(l.memo) + ' ' + s(l.shipTo)); if (pl) pos.push(poN(X, pl[1]));
  (s(l.memo) + ' ' + s(l.shipTo)).toUpperCase().split(/[\s,;()]+/).forEach(function(t){ if (AUTOPO_LIKE.test(t)) pos.push(poN(X, t)); });
  for (var i = 0; i < pos.length; i++) { var hp = X.byPO[pos[i]]; if (hp && hp.length) { var lf = liveFirst(hp); if (lf.length === 1 || hp.length === 1) return take(lf[0], 'po', 'PO ' + (s(l.po) || pos[i])); lf.slice(0, 3).forEach(function(J){ cand(J, 'PO ' + pos[i], 90); }); } }
  /* b. the ship-to / job address */
  var addrTxt = s(l.shipTo) || s(l.memo);
  if (addrTxt && X.QB && X.QB.addrHit) {
    var nums = nk(addrTxt).split(' ').filter(function(w){ return /^\d{1,6}[a-z]?$/.test(w); }).map(function(w){ return w.replace(/[a-z]$/, ''); }), hits = [];
    nums.forEach(function(n){ (X.byNum[n] || []).forEach(function(J){ if (hits.indexOf(J) < 0 && X.QB.addrHit(addrTxt, J.addr)) hits.push(J); }); });
    if (hits.length) { var la = liveFirst(hits); if (la.length === 1) return take(la[0], 'address', 'the address ' + s(la[0].address).split(',')[0]); la.slice(0, 3).forEach(function(J){ cand(J, 'the address ' + s(J.address).split(',')[0], 88); }); }
  }
  /* c. a person put the same ship-to / PO / memo on a job on an earlier statement */
  var mk2 = memKeys(X, l);
  for (var k = 0; k < mk2.length; k++) { var m = X.mem[mk2[k]]; if (m && X.byId[m.pid] && !X.byId[m.pid].lost) return take(X.byId[m.pid], 'remembered', 'a person put ' + (mk2[k].split(':')[0] === 'ship' ? 'this ship-to' : mk2[k].split(':')[0] === 'po' ? 'this PO' : 'this memo') + ' on this job (statement ' + (m.stmt || '—') + ')'); }
  /* d. the memo / job name / customer */
  var txt = [l.memo, l.shipTo].filter(function(x){ return s(x); }).join(' · ');
  if (txt && X.QB && X.QB.scoreText && nk(txt).length >= 4) {
    var sc = [];
    for (var j = 0; j < X.idx.length; j++) { var J = X.idx[j], r = X.QB.scoreText(txt, J, 'memo'); if (r.score >= 60) sc.push({ J: J, score: r.score + (J.lost ? -12 : J.done ? -2 : 1), how: r.how, why: r.why }); }
    sc.sort(function(a, b){ return b.score - a.score; });
    if (sc[0] && sc[0].score >= 70 && (!sc[1] || sc[0].score - sc[1].score >= 8)) return take(sc[0].J, sc[0].how === 'customer' ? 'customer' : 'memo', sc[0].why.replace(/ in the memo$/, ' in the memo / job name'));
    sc.slice(0, 3).forEach(function(x){ cand(x.J, x.why, x.score); });
  }
  /* e. the bill's own job */
  if (out.invPid) { var JB = X.byId[out.invPid]; out.pid = out.invPid; out.how = 'invoice'; out.why = 'the bill in the CRM is on this job'; cand(JB, out.why, 80); }
  return out;
}

/* ── the line's state ── */
/* v = the line as it stands (the person's choices over the matcher's) · x = { bill, billPaid, paidHere:{amount, full}, credDone } */
function statusOf(v, x){
  x = x || {};
  if (v.kind === 'payment') return 'info';
  if (x.paidHere && x.paidHere.full) return 'paid';
  if (x.bill && isPaid(x.bill)) return 'already';
  if (x.credDone) return 'already';
  if (v.kind === 'finance') return 'finance';
  if (!v.pid) return 'nojob';
  if (v.wrong && !v.humanPid) return 'wrong';
  if (v.kind === 'credit') return 'credit';
  if (!x.bill) return 'new';
  return 'ok';
}
function includeDefault(st){ return /^(ok|new|credit|wrong|nojob)$/.test(st); }
var LABEL = { ok: '✅ Matched · unpaid', already: '⚠ Already paid', wrong: '⚠ Wrong project?', nojob: '❓ No job found', new: '➕ Not in the CRM yet', credit: '💸 Credit', finance: '🧮 Finance charge', paid: '✓ Paid on this statement', info: 'ⓘ Payment / info' };
/* the same statement: same supplier + its number, or + its date and total, or the same file */
function sigs(r){
  var p = normParty(r.supplier), out = [];
  if (p && normNo(r.stmtNo)) out.push('n:' + p + '|' + normNo(r.stmtNo));
  if (p && r.stmtDate && r.total != null && r.total !== '') out.push('d:' + p + '|' + r.stmtDate + '|' + cents(r.total));
  if (r.file && s(r.file.ref)) out.push('f:' + s(r.file.ref));
  return out;
}
function findDup(r, list){ var k = sigs(r); if (!k.length) return null; return (list || []).filter(function(x){ return x && x.id !== r.id && !x.voided && sigs(x).some(function(y){ return k.indexOf(y) >= 0; }); })[0] || null; }
/* oldest-first: the amount spread over the included lines (credits and charges count first, then bills oldest first) */
function oldestFirst(amount, items){
  var T = cents(amount), fixed = 0, out = {};
  items.forEach(function(it){ if (it.kind === 'credit' || it.kind === 'finance') { fixed += cents(it.max); out[it.id] = r2(it.max); } });
  var left = T - fixed;
  items.filter(function(it){ return it.kind !== 'credit' && it.kind !== 'finance'; }).sort(function(a, b){ return s(a.date) < s(b.date) ? -1 : s(a.date) > s(b.date) ? 1 : (a.n || 0) - (b.n || 0); }).forEach(function(it){
    var a = Math.max(0, Math.min(left, cents(it.max))); out[it.id] = a / 100; left -= a;
  });
  return { pay: out, left: left / 100 };
}
return { s: s, low: low, num: num, r2: r2, cents: cents, nk: nk, normParty: normParty, sameParty: sameParty, looseParty: looseParty, normNo: normNo, noKeys: noKeys, dateOf: dateOf, days: days,
  moneys: moneys, typeOf: typeOf, role: role, headerOf: headerOf, textPages: textPages, headInfo: headInfo, heur: heur, parse: parse, fromAi: fromAi,
  isBill: isBill, amtOf: amtOf, paidOf: paidOf, openOf: openOf, isPaid: isPaid, liveBill: liveBill, billNo: billNo, billDay: billDay, billParty: billParty,
  matchBills: matchBills, jobCtx: jobCtx, jobFor: jobFor, memKeys: memKeys, statusOf: statusOf, includeDefault: includeDefault, LABEL: LABEL, CLOSEDJOB: CLOSEDJOB, sigs: sigs, findDup: findDup, oldestFirst: oldestFirst };
})();
W._gcSupStmtCore = CORE;
var D = W.document;
if (!D || typeof D.createElement !== 'function') return;   /* node (tests): the rules only */

/* ═════════════════════════════ THE CRM SIDE ═════════════════════════════ */
var C = CORE, s = C.s, low = C.low, num = C.num, r2 = C.r2, cents = C.cents;
var STF = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout, SIF = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return STF.call(W, f, ms || 0); }
function pause(){ return new Promise(function(r){ STF.call(W, r, 0); }); }
var KEY = 'gc_sup_statements';
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(ch){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
function money(n){ var v = r2(n); return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function nowIso(){ return new Date().toISOString(); }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function today(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function uid(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function clone(v){ try { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }
function lsGet(k){ try { return Storage.prototype.getItem.call(W.localStorage, k); } catch (e) { return null; } }
function lsSet(k, v){ try { Storage.prototype.setItem.call(W.localStorage, k, v); } catch (e) {} }
function crm(){ return W._crm || {}; }
function invoices(){ var a = arr(crm().invoices); return a.length ? a : arr(crm().invs); }
function projects(){ return arr(crm().projects).filter(function(p){ return !p.deleted; }); }
function proj(pid){ if (!pid) return null; var X = jobX(); var J = X.byId[s(pid)]; if (J) return J.p; return projects().filter(function(p){ return s(p.id) === s(pid); })[0] || null; }
var IBY = { ref: null, by: {} };
function findInv(id){ if (!id) return null; var raw = crm().invoices && crm().invoices.length ? crm().invoices : crm().invs; if (IBY.ref !== raw) { IBY.ref = raw; IBY.by = {}; invoices().forEach(function(r){ IBY.by[s(r.id)] = r; }); } return IBY.by[s(id)] || null; }
function warn(e){ try { console.warn('[GC supplier statements]', e && e.message || e); } catch (x) {} }

/* ── who may (by role): admins, the office, accounting roles — never while viewing as someone else ── */
function viewingAs(){ try { return !!(W._gcVAS && W._gcVAS.active && W._gcVAS.active()); } catch (e) { return false; } }
function myEmail(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function meUser(){ var em = myEmail(); var u = em ? arr(crm().users).filter(function(x){ return low(x.email) === em; })[0] : null; if (!u) { try { u = typeof W._gcMeUser === 'function' ? W._gcMeUser() : null; } catch (e) { u = null; } } return u || {}; }
var ACCT_ROLE = /\b(accounting|accountant|bookkeep(er|ing)?|controller|cfo|finance|accounts\s*payable|a\/p)\b/i;
function acctRole(){ if (viewingAs()) return false; var u = meUser(); return !!u && u.active !== false && ACCT_ROLE.test(s(u.role)); }
W._gcAcctRole = acctRole;
function canUse(){
  if (viewingAs()) return false;
  try { if (typeof W._gcFullAccess === 'function' && W._gcFullAccess()) return true; } catch (e) {}
  try { if (typeof W._gcIsOfficeFull === 'function' && W._gcIsOfficeFull()) return true; } catch (e) {}
  try { if (typeof W.__gcAuthIsAdmin === 'function' && W.__gcAuthIsAdmin()) return true; } catch (e) {}
  return acctRole();
}
function myName(){ var u = meUser(); return s(u.name) || s(lsGet('grayco_user')) || myEmail() || 'office'; }

/* ── the records: gc_kv gc_sup_statements (one row, merged by statement; the person's choices merged per choice) ── */
function creds(){ return { u: (s(lsGet('grayco_sb_url')) || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), k: s(lsGet('grayco_sb_key')) }; }
function sbH(extra){ var k = creds().k, h = { 'Content-Type': 'application/json' }; if (k) { h.apikey = k; h.Authorization = 'Bearer ' + k; } return Object.assign(h, extra || {}); }
function kvGet(){
  return W.fetch(creds().u + '/rest/v1/gc_kv?key=eq.' + KEY + '&select=value', { headers: sbH(), cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('read ' + r.status)); })
    .then(function(rows){ return arr(rows && rows[0] ? rows[0].value : []); });
}
function newer(a, b){ return s(a && a.at) >= s(b && b.at) ? a : b; }
function mergeLine(a, b){
  if (!a) return b; if (!b) return a;
  var base = s(a.at) >= s(b.at) ? Object.assign({}, a) : Object.assign({}, b), h = {}, ha = a.h || {}, hb = b.h || {};
  Object.keys(ha).concat(Object.keys(hb)).forEach(function(k){ h[k] = ha[k] && hb[k] ? newer(ha[k], hb[k]) : (ha[k] || hb[k]); });
  base.h = h; return base;
}
function mergeRec(a, b){
  if (!a) return b; if (!b) return a;
  var base = s(a.updatedAt) >= s(b.updatedAt) ? Object.assign({}, a) : Object.assign({}, b);
  var L = {}, order = [];
  arr(a.lines).concat(arr(b.lines)).forEach(function(l){ if (!(l.id in L)) order.push(l.id); L[l.id] = L[l.id] ? mergeLine(L[l.id], l) : l; });
  base.lines = order.map(function(k){ return L[k]; });
  var P = {}; arr(a.payments).concat(arr(b.payments)).forEach(function(p){ P[p.id] = P[p.id] || p; }); base.payments = Object.keys(P).map(function(k){ return P[k]; }).sort(function(x, y){ return s(x.at).localeCompare(s(y.at)); });
  var G = {}; arr(a.log).concat(arr(b.log)).forEach(function(g){ G[g.id] = G[g.id] || g; }); base.log = Object.keys(G).map(function(k){ return G[k]; }).sort(function(x, y){ return s(x.at).localeCompare(s(y.at)); }).slice(-200);
  if (a.supplierH || b.supplierH) { var sh = newer(a.supplierH || { at: '' }, b.supplierH || { at: '' }); base.supplierH = sh; base.supplier = s(sh.v) || base.supplier; }
  if (a.arch || b.arch) { var ah = newer(a.arch || { at: '' }, b.arch || { at: '' }); base.arch = ah; }
  return base;
}
function mergeAll(){ var by = {}, order = []; [].slice.call(arguments).forEach(function(l){ arr(l).forEach(function(r){ if (!r.id) return; if (!(r.id in by)) order.push(r.id); by[r.id] = by[r.id] ? mergeRec(by[r.id], r) : r; }); }); return order.map(function(k){ return by[k]; }); }
var LIST = arr(lsGet(KEY)), PULLED = 0;
/* this computer's copy: the open statements and the 30 latest (the cloud row has them all) — small, the phone's storage is tight */
function keepLocal(){
  var L = LIST.slice().sort(function(a, b){ return s(b.updatedAt).localeCompare(s(a.updatedAt)); }), keep = [], n = 0;
  L.forEach(function(r){ var done = r.arch ? !!r.arch.v : arr(r.payments).length > 0; if (!done || n++ < 30) keep.push(r); });
  var j = JSON.stringify(keep); if (j.length > 600000) j = JSON.stringify(keep.slice(0, 15));
  lsSet(KEY, j);
}
function refresh(){ return kvGet().then(function(l){ LIST = mergeAll(l, LIST); PULLED = Date.now(); keepLocal(); forgetJobs(); return LIST; }, function(){ return LIST; }); }
var SAVING = Promise.resolve();
function persist(rec){
  rec.updatedAt = nowIso();
  LIST = mergeAll(LIST, [rec]); var mine = LIST.filter(function(x){ return x.id === rec.id; })[0]; if (mine) Object.assign(rec, mine);
  keepLocal();
  SAVING = SAVING.then(function(){
    return kvGet().then(function(remote){
      LIST = mergeAll(remote, LIST); keepLocal();
      return W.fetch(creds().u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: sbH({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: KEY, value: JSON.stringify(LIST), updated_at: nowIso() }) })
        .then(function(r){ return { ok: r.ok }; }, function(){ return { ok: false }; });
    }, function(){ return { ok: false, local: true }; });
  });
  return SAVING;
}
var SAVE_T = {};
function saveSoon(rec){ if (SAVE_T[rec.id]) return; SAVE_T[rec.id] = later(function(){ delete SAVE_T[rec.id]; persist(rec); }, 500); }
function getRec(id){ return LIST.filter(function(x){ return x.id === id; })[0] || null; }
function logIt(rec, what){ rec.log = arr(rec.log).concat([{ id: uid('G'), at: nowIso(), by: myName(), what: s(what).slice(0, 300) }]).slice(-200); }

/* ── the job index (built once per job list) ── */
var JX = null;
function jobX(){
  var P0 = crm().projects;
  if (JX && JX._P === P0 && JX._Q === (W._gcQbMatch || null)) return JX;
  JX = C.jobCtx(arr(P0).filter(function(p){ return !p.deleted; }), W._gcQbMatch || null); JX._P = P0; JX._Q = W._gcQbMatch || null;
  /* what people picked on earlier statements (any supplier): ship-to / PO / memo → the job */
  LIST.forEach(function(r){ arr(r.lines).forEach(function(l){ if (!(l.h && l.h.pid && s(l.h.pid.v))) return; C.memKeys(JX, effFields(l)).forEach(function(k){ var cur = JX.mem[k]; if (!cur || s(cur.at) < s(l.h.pid.at)) JX.mem[k] = { pid: s(l.h.pid.v), at: l.h.pid.at, stmt: s(r.stmtNo) || s(r.stmtDate) }; }); }); });
  return JX;
}
function forgetJobs(){ JX = null; }

/* ── a line as it stands: the person's choices over what was read / matched ── */
function effFields(l){ var f = Object.assign({}, l.f || {}); if (l.h && l.h.edit && l.h.edit.v) Object.keys(l.h.edit.v).forEach(function(k){ f[k] = l.h.edit.v[k]; }); return f; }
function paidHere(rec, l){
  var amt = 0, full = false, last = null;
  arr(rec.payments).forEach(function(p){ if (p.voided) return; arr(p.lines).forEach(function(x){ if (x.lineId === l.id) { amt = r2(amt + num(x.amount)); last = p; if (x.full) full = true; } }); });
  return amt || full ? { amount: amt, full: full, pay: last } : null;
}
function billPaidInfo(b){
  if (!b) return null;
  var d = null; try { if (W._gcPayDetail && W._gcPayDetail.get) d = W._gcPayDetail.get(b); } catch (e) { d = null; }
  var pays = arr(b.payments), lastP = pays[pays.length - 1] || {}, ss = b.supStmt || null;
  return { date: s(d && d.date) || s(b.paidDate) || s(lastP.date), method: s(d && d.method) || s(b.payMethod) || s(lastP.method), ref: s(d && d.ref) || s(b.checkNo) || s(lastP.checkNo || lastP.ref), stmt: ss };
}
function credDone(rec, l, v){
  if (v.kind !== 'credit') return null;
  var key = ssKey(rec, v);
  return arr(crm().expenses).filter(function(e){ return e && !e.deleted && s(e.ssKey) === key && !(e.supStmt && e.supStmt.id === rec.id && e.supStmt.lineId === l.id); })[0] || null;
}
function ssKey(rec, v){ return C.normParty(rec.supplier) + '|' + C.normNo(v.invNo || v.memo) + '|' + cents(v.amount); }
function view(rec, l){
  var f = effFields(l), h = l.h || {}, a = l.a || {};
  var v = Object.assign({}, f, { id: l.id });
  v.invId = h.inv ? s(h.inv.v) : s(a.invId);
  var notInCrm = v.invId === '__new'; if (notInCrm) v.invId = '';
  v.humanInv = !!h.inv; v.humanPid = !!h.pid;
  v.pid = h.pid ? s(h.pid.v) : s(a.pid);
  var bill = v.invId ? findInv(v.invId) : null; if (v.invId && !bill) v.invId = '';
  if (!bill) { bill = findInv('SSB-' + rec.id + '-' + l.id); if (bill) v.invId = s(bill.id); }   /* the bill this line became when it was paid */
  v.wrong = !!(a.stmtPid && a.invPid && a.stmtPid !== a.invPid);
  var ph = paidHere(rec, l), cd = credDone(rec, l, v), full = !!(bill && C.isPaid(bill));
  var x = { bill: bill, credDone: cd, paidHere: ph && (ph.full || full) ? { full: true } : null };
  v.bill = bill; v.paidHere = ph;
  v.st = C.statusOf(v, x);
  v.paidInfo = v.st === 'already' ? (cd ? { date: s(cd.paidDate || cd.date), method: s(cd.payMethod), ref: s(cd.checkNo), stmt: cd.supStmt || null, credit: true } : billPaidInfo(bill)) : null;
  var open;
  if (v.kind === 'credit') open = r2(-Math.abs(v.amount));
  else if (bill) open = C.openOf(bill);
  else open = r2(Math.abs(v.amount) - (ph ? Math.abs(ph.amount) : 0));
  v.max = bill && v.kind !== 'credit' ? r2(Math.abs(v.amount) && !(ph && ph.amount) ? Math.min(Math.abs(v.amount), open) : open) : open;
  v.include = h.inc ? !!h.inc.v : C.includeDefault(v.st);
  if (/^(already|paid|info)$/.test(v.st)) v.include = false;
  v.pay = h.pay && h.pay.v != null && h.pay.v !== '' && !(ph && ph.amount && s(h.pay.at) < s(ph.pay && ph.pay.at)) ? r2(h.pay.v) : v.max;
  if (v.kind === 'credit') v.pay = v.max;
  else if (v.pay > v.max) v.pay = v.max;
  v.how = h.pid ? 'person' : s(a.how); v.why = h.pid ? 'picked by ' + s(h.pid.by) : s(a.why);
  v.invHow = h.inv ? 'person' : s(a.invHow); v.invWhy = h.inv ? (notInCrm ? 'a person said it is not in the CRM' : 'picked by ' + s(h.inv.by)) : s(a.invWhy);
  var p = v.pid ? proj(v.pid) : null; v.job = p; v.jobClosed = !!(p && (C.CLOSEDJOB.test(s(p.status)) || p.archived === true));
  v.amtDiff = !!(bill && a.amtDiff);
  return v;
}

/* ── MATCH: the matcher's part of every line, in small slices (a person's choices are left as they are) ── */
function match(rec){
  if (!rec) return Promise.resolve(rec);
  var X, lines = arr(rec.lines), vs, bm, i = 0, t0 = Date.now();
  return pause().then(function(){ X = jobX(); return pause(); }).then(function(){
    var bills = invoices().filter(C.isBill);
    vs = lines.map(function(l){ var f = effFields(l); return Object.assign({}, f, { humanInv: l.h && l.h.inv ? s(l.h.inv.v) : null }); });
    bm = C.matchBills(vs, bills, { supplier: rec.supplier, supplierId: rec.supplierId });
    return pause();
  }).then(function(){ return new Promise(function(res){
    (function step(){
      var tS = Date.now();
      while (i < lines.length && Date.now() - tS < 30) {
        var l = lines[i], f = vs[i], b = bm[i], bill = b && b.invId && b.invId !== '__new' ? findInv(b.invId) : null;
        var j = f.kind === 'payment' ? { pid: '', how: '', why: '' } : C.jobFor(f, X, bill);
        l.a = { invId: b && b.how !== 'person' ? s(b.invId) : '', invHow: b ? b.how : '', invWhy: b ? b.why : '', amtDiff: !!(b && b.amtDiff), several: !!(b && b.several),
          pid: f.kind === 'finance' ? '' : s(j.pid), how: s(j.how), why: s(j.why), stmtPid: s(j.stmtPid), invPid: s(j.invPid), cands: (j.cands || []).slice(0, 4).map(function(c){ return { pid: c.pid, name: c.name, why: c.why }; }), at: nowIso() };
        i++;
      }
      if (i < lines.length) later(step, 0); else { rec.matchedAt = nowIso(); rec.matchMs = Date.now() - t0; res(rec); }
    })();
  }); });
}

/* ── READ: a file and / or typed lines → a new statement (or the one already in the CRM) ── */
function isPdf(f){ return !!f && (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name || '')); }
function isImg(f){ return !!f && (/^image\//i.test(f.type) || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name || '')); }
function isCsv(f){ return !!f && (/csv|excel|spreadsheet/i.test(f.type) || /\.(csv|txt|tsv)$/i.test(f.name || '')); }
function knownPO(){ var X = jobX(); return function(w){ var p = s(w).toUpperCase().replace(/[^A-Z0-9]/g, ''); return p.length >= 3 && !!X.byPO[p] && /[A-Z]/.test(p) && /\d/.test(p); }; }
var AI_PROMPT = 'This is a supplier\'s account statement (a list of invoices, credits, finance charges and payments for one customer account). Return ONLY valid JSON, no markdown: {"supplier":"the supplier name","statementDate":"YYYY-MM-DD","statementNo":"","accountNo":"","totalDue":number,"lines":[{"date":"YYYY-MM-DD","invoiceNo":"","type":"invoice|credit|finance|payment","po":"customer PO / job #","shipTo":"ship-to / job address","memo":"job name / description","amount":number}]}. One entry per line of the statement, in order; the amount is what is still due on that line; credits and returns are negative. Use "" for anything not printed; never guess.';
function b64(blob){ return new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(String(fr.result).split(',')[1] || ''); }; fr.onerror = rej; fr.readAsDataURL(blob); }); }
function aiRead(file){
  var B = W._gcBulkDrop;
  if (!B || typeof B.aiAsk !== 'function') return Promise.reject(new Error('Reading photos is not available on this screen — type or paste the lines instead.'));
  if (file.size > 4 * 1024 * 1024) return Promise.reject(new Error('The file is over 4 MB — too big for the reader. Take the photo again a little smaller, or type the lines.'));
  return b64(file).then(function(d){
    var part = isPdf(file) ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d } } : { type: 'image', source: { type: 'base64', media_type: /^image\/(jpeg|png|gif|webp)$/i.test(file.type) ? file.type : 'image/jpeg', data: d } };
    return B.aiAsk([part, { type: 'text', text: AI_PROMPT }], 4000);
  }).then(function(x){
    var t = arr(x && x.d && x.d.content).map(function(c){ return c.text || ''; }).join('').replace(/```json|```/g, '').trim(), o = null;
    try { o = JSON.parse(t); } catch (e) { var i = t.indexOf('{'), j = t.lastIndexOf('}'); if (i >= 0 && j > i) { try { o = JSON.parse(t.slice(i, j + 1)); } catch (e2) {} } }
    if (!o) throw new Error((x && x.d && x.d.error && x.d.error.message) || 'The reader could not read this statement — type or paste the lines.');
    return C.fromAi(o);
  });
}
function readFile(file, hint){
  if (isPdf(file)) {
    if (!W._gcStmt || !W._gcStmt.readPdf) return Promise.reject(new Error('The PDF reader is not ready yet — try again in a moment.'));
    return file.arrayBuffer().then(function(buf){ return W._gcStmt.readPdf(buf); }).then(function(doc){
      if (doc && doc.error === 'image') return aiRead(file).then(function(p){ p.via = 'scan'; return p; });
      var p = C.parse(doc, { stmtDate: hint, knownPO: knownPO() }); p.via = 'pdf';
      if (!p.lines.length) return aiRead(file).then(function(q){ q.via = 'scan'; return q; }, function(){ return p; });
      return p;
    });
  }
  if (isImg(file)) return aiRead(file).then(function(p){ p.via = 'photo'; return p; });
  if (isCsv(file)) return file.text().then(function(t){ var csv = /\.csv$/i.test(file.name || '') || /csv/i.test(file.type); var p = C.parse(C.textPages(t, csv), { stmtDate: hint, knownPO: knownPO() }); p.via = 'csv'; return p; });
  return Promise.reject(new Error('Choose a PDF, a photo, or a CSV.'));
}
/* the supplier the statement names (the CRM's vendors / subs / bill payees) */
var SUPC = { i: null, v: null, s: null, l: null };
function suppliers(){
  var ri = crm().invoices || crm().invs, rv = crm().vendors, rs = crm().subs;
  if (SUPC.l && SUPC.i === ri && SUPC.v === rv && SUPC.s === rs) return SUPC.l;
  SUPC.i = ri; SUPC.v = rv; SUPC.s = rs; SUPC.l = suppliers0(); return SUPC.l;
}
function suppliers0(){
  var by = {};
  function add(name, id, sup, from){ var k = C.normParty(name); if (!k) return; var x = by[k] || (by[k] = { key: k, name: s(name).replace(/&amp;/g, '&'), id: '', supplier: false, open: 0, n: 0 }); if (id && !x.id) x.id = s(id); if (sup) x.supplier = true; }
  arr(crm().vendors).concat(arr(crm().subs)).forEach(function(v){ add(v.name || v.company, v.id, v.isSub === false || /supplier|vendor|material|lumber|supply/i.test(s(v.cat || v.type || v.trade || v.name))); });
  invoices().forEach(function(r){ if (!C.isBill(r)) return; var n = C.billParty(r); add(n, r.subId, /supplier/i.test(s(r.payeeType)) || r.isSupplier === true); var x = by[C.normParty(n)]; if (x && C.liveBill(r)) { x.n++; x.open = r2(x.open + C.openOf(r)); } });
  return Object.keys(by).map(function(k){ return by[k]; }).sort(function(a, b){ return (b.supplier - a.supplier) || a.name.localeCompare(b.name); });
}
function guessSupplier(parsed){
  var tl = parsed && parsed.head && Array.isArray(parsed.head.top) ? parsed.head.top : [];
  var top = ' ' + C.nk(tl.join(' ') + ' ' + s(parsed && parsed.supplier)) + ' ', best = null;
  suppliers().forEach(function(x){ var k = x.key; if (k.length >= 3 && top.indexOf(' ' + k + ' ') >= 0 && (!best || k.length > best.key.length)) best = x; });
  return best;
}
function supplierRec(name){ var k = C.normParty(name); return suppliers().filter(function(x){ return x.key === k; })[0] || null; }
/* input: { supplier, stmtDate, stmtNo, accountNo, file, text } → Promise<{ rec, dup?, warn? } | { error }> */
function read(input){
  input = input || {};
  if (!canUse()) return Promise.resolve({ error: 'Supplier statements are for admins, the office and accounting.' });
  var file = input.file || null, text = s(input.text);
  if (!file && !text) return Promise.resolve({ error: 'Choose the statement file (PDF / photo / CSV) or type / paste its lines.' });
  var parts = [];
  if (file) parts.push(readFile(file, input.stmtDate));
  if (text) parts.push(pause().then(function(){ var kp = knownPO(); return pause().then(function(){ return Object.assign(C.parse(C.textPages(text, false), { stmtDate: input.stmtDate, knownPO: kp }), { via: 'typed' }); }); }));
  return Promise.all(parts).then(function(P){
    var head = {}, lines = [], warn = [], via = [], sup = '';
    P.forEach(function(p){ ['stmtDate', 'stmtNo', 'accountNo'].forEach(function(k){ if (!head[k] && p.head && p.head[k]) head[k] = p.head[k]; }); if (head.total == null && p.head && p.head.total != null) head.total = p.head.total; lines = lines.concat(p.lines); if (p.warn) warn.push(p.warn); via.push(p.via); if (!sup && p.supplier) sup = p.supplier; });
    if (!lines.length) return { error: 'No invoice lines were found on it. Check it is the statement (not a single invoice), or type / paste the lines (date, invoice #, PO, ship-to, amount).' };
    var g = s(input.supplier) ? supplierRec(input.supplier) : guessSupplier({ head: { top: [].concat.apply([], P.map(function(p){ return p.head && Array.isArray(p.head.top) ? p.head.top : []; })) }, supplier: sup });
    var supplier = s(input.supplier) || (g && g.name) || '';
    if (!supplier) return { error: 'Pick the supplier first (the statement does not name one the CRM knows).', parsed: P };
    var by = myName(), at = nowIso();
    var rec = { id: uid('SS'), supplier: supplier, supplierId: s((g || supplierRec(supplier) || {}).id), supplierH: s(input.supplier) ? { v: supplier, by: by, at: at } : null,
      stmtNo: s(input.stmtNo) || s(head.stmtNo), stmtDate: s(input.stmtDate) || s(head.stmtDate) || today(), accountNo: s(input.accountNo) || s(head.accountNo), total: head.total != null ? head.total : null,
      file: null, via: via.join('+'), warn: warn.join(' '), createdBy: by, createdAt: at, updatedAt: at, payments: [], log: [],
      lines: lines.map(function(l, i){ return { id: 'L' + (i + 1), at: at, f: { date: l.date, invNo: l.invNo, type: l.type, kind: l.kind, po: l.po, shipTo: l.shipTo, memo: l.memo, amount: l.amount }, raw: l.raw, a: {}, h: {} }; }) };
    var keepFile = file && typeof W._gcStoreFile === 'function' ? Promise.resolve(W._gcStoreFile(file, { kind: 'doc', name: file.name })).then(function(m){ return m && m.ref ? { ref: s(m.ref), name: s(m.name || file.name), type: s(m.type || file.type), size: m.size || file.size || 0 } : null; }, function(){ return null; }) : Promise.resolve(null);
    return keepFile.then(function(fm){
      rec.file = fm;
      var dup = C.findDup(rec, LIST);
      if (dup) {
        if (fm && !dup.file) { dup.file = fm; logIt(dup, 'attached the statement file'); persist(dup); }
        return { rec: dup, dup: true };
      }
      logIt(rec, 'entered the statement (' + rec.lines.length + ' lines, ' + rec.via + ')');
      return match(rec).then(function(){ LIST.push(rec); persist(rec); return { rec: rec, warn: rec.warn }; });
    });
  }, function(e){ return { error: s(e && e.message) || 'The statement could not be read.' }; });
}

/* ── A PERSON'S PICK: k = pid | inv | inc | pay | edit ; v = the value. Permanent (only a newer person's pick replaces it) ── */
function pick(id, lineId, k, v){
  if (!canUse()) return { ok: false, error: 'Supplier statements are for admins, the office and accounting.' };
  var rec = getRec(id); if (!rec) return { ok: false, error: 'That statement is not loaded.' };
  var l = arr(rec.lines).filter(function(x){ return x.id === lineId; })[0]; if (!l) return { ok: false, error: 'That line is not found.' };
  if (!/^(pid|inv|inc|pay|edit)$/.test(k)) return { ok: false, error: 'unknown pick' };
  var by = myName(), at = nowIso();
  l.h = l.h || {};
  if (k === 'edit') { var cur = (l.h.edit && l.h.edit.v) || {}, nv = Object.assign({}, cur); Object.keys(v || {}).forEach(function(f){ if (/^(date|invNo|po|shipTo|memo|amount|kind)$/.test(f)) nv[f] = f === 'amount' ? r2(v[f]) : s(v[f]); }); l.h.edit = { v: nv, by: by, at: at }; }
  else l.h[k] = { v: k === 'inc' ? !!v : k === 'pay' ? (v === '' || v == null ? null : r2(v)) : s(v), by: by, at: at };
  l.at = at;
  var what = k === 'pid' ? 'put line ' + lineId + ' on ' + (s(v) ? s((proj(v) || {}).name) || v : 'no job') : k === 'inv' ? 'line ' + lineId + ': ' + (v === '__new' ? 'not in the CRM (new bill)' : 'bill ' + s(v)) : k === 'inc' ? (v ? 'included' : 'left out') + ' line ' + lineId : k === 'pay' ? 'line ' + lineId + ' amount to pay ' + (v === '' || v == null ? 'reset' : money(v)) : 'edited line ' + lineId;
  logIt(rec, what);
  if (k === 'pid') forgetJobs();
  if (k === 'edit' || k === 'inv') return match(rec).then(function(){ saveSoon(rec); return { ok: true }; });
  saveSoon(rec);
  return { ok: true };
}
function addLine(id, f){
  if (!canUse()) return { ok: false, error: 'Supplier statements are for admins, the office and accounting.' };
  var rec = getRec(id); if (!rec) return { ok: false, error: 'That statement is not loaded.' };
  var amt = r2(f && f.amount); if (!amt) return { ok: false, error: 'Enter the line\'s amount.' };
  var kind = /^(credit|finance|invoice)$/.test(s(f.kind)) ? f.kind : (amt < 0 ? 'credit' : 'invoice');
  var at = nowIso(), n = arr(rec.lines).length + 1; while (arr(rec.lines).some(function(l){ return l.id === 'L' + n; })) n++;
  var l = { id: 'L' + n, at: at, f: { date: C.dateOf(f.date) || s(f.date).slice(0, 10), invNo: s(f.invNo), type: '', kind: kind, po: s(f.po), shipTo: s(f.shipTo), memo: s(f.memo), amount: kind === 'credit' ? -Math.abs(amt) : amt }, raw: 'typed in by ' + myName(), a: {}, h: {}, manual: { by: myName(), at: at } };
  rec.lines = arr(rec.lines).concat([l]); logIt(rec, 'added line ' + l.id + ' (' + money(l.f.amount) + ')');
  return match(rec).then(function(){ persist(rec); return { ok: true, lineId: l.id }; });
}
function setSupplier(id, name){
  var rec = getRec(id); if (!rec || !canUse()) return { ok: false };
  var g = supplierRec(name); rec.supplier = s(name); rec.supplierId = s(g && g.id); rec.supplierH = { v: s(name), by: myName(), at: nowIso() }; logIt(rec, 'supplier: ' + s(name));
  return match(rec).then(function(){ persist(rec); return { ok: true }; });
}
function archive(id, on){ var rec = getRec(id); if (!rec || !canUse()) return { ok: false }; rec.arch = { v: !!on, by: myName(), at: nowIso() }; logIt(rec, on ? 'archived' : 'back from the archive'); persist(rec); return { ok: true }; }

/* ── the statement's totals ── */
function summary(rec){
  var V = arr(rec.lines).map(function(l){ return view(rec, l); }), cnt = {}, inc = { bills: 0, credits: 0, finance: 0, n: 0 }, need = 0, total = 0, paid = 0, open = 0, payable = 0;
  V.forEach(function(v){
    cnt[v.st] = (cnt[v.st] || 0) + 1;
    total = r2(total + v.amount);
    if (v.paidHere) paid = r2(paid + v.paidHere.amount);
    if (!/^(info|already|paid)$/.test(v.st)) { payable++; open = r2(open + (v.kind === 'credit' ? v.amount : v.max)); }
    if (!v.include) return;
    inc.n++;
    if (v.kind === 'credit') inc.credits = r2(inc.credits + v.pay); else if (v.kind === 'finance') inc.finance = r2(inc.finance + v.pay); else inc.bills = r2(inc.bills + v.pay);
    if (v.st === 'wrong' || v.st === 'nojob') need++;
  });
  inc.total = r2(inc.bills + inc.credits + inc.finance);
  var nPaidLines = V.filter(function(v){ return v.paidHere; }).length;
  var state = payable === 0 ? 'paid' : !arr(rec.payments).length ? 'open' : 'partial';   /* nothing left to pay on it = paid */
  return { V: V, cnt: cnt, inc: inc, need: need, total: total, paid: paid, open: open, payable: payable, state: state, archived: rec.arch ? !!rec.arch.v : state === 'paid', nPaidLines: nPaidLines };
}
function oldestFirstPick(id, amount){
  var rec = getRec(id); if (!rec) return { ok: false };
  var S = summary(rec), items = S.V.filter(function(v){ return v.include; }).map(function(v){ return { id: v.id, kind: v.kind, max: v.kind === 'credit' ? v.amount : v.max, date: v.date, n: num(s(v.id).slice(1)) }; });
  var o = C.oldestFirst(amount, items), by = myName(), at = nowIso();
  arr(rec.lines).forEach(function(l){ if (l.id in o.pay) { l.h = l.h || {}; l.h.pay = { v: o.pay[l.id], by: by, at: at }; l.at = at; } });
  logIt(rec, '⚡ oldest first: ' + money(amount)); saveSoon(rec);
  return { ok: true, left: o.left };
}

/* ── 💵 PAY THE STATEMENT ── */
function setInv(f){ if (typeof W._setInvoices !== 'function') return false; W._setInvoices(function(l){ return f(Array.isArray(l) ? l : []); }); return true; }
function setExp(f){ if (typeof W._setExpenses === 'function') { W._setExpenses(function(l){ return f(Array.isArray(l) ? l : []); }); return true; } if (W._crm && Array.isArray(W._crm.expenses)) { W._crm.expenses = f(W._crm.expenses); return true; } return false; }
function reg(row){ try { if (typeof W._gcAddToRegister === 'function') return W._gcAddToRegister(row); } catch (e) {} }
/* the CRM's lists show what was written on the next render: wait until the new bills are there and the moved ones are on their job */
function waitBills(ids, moves, ms){
  var t0 = Date.now();
  return new Promise(function(res){ (function chk(){ var all = ids.every(function(id){ return !!findInv(id); }) && (moves || []).every(function(m){ var b = findInv(m.invId); return b && s(b.pid) === s(m.to); }); if (all || Date.now() - t0 > (ms || 6000)) return res(all); later(chk, 120); })(); });
}
var METHOD = { check: 'Check', ach: 'ACH / bank transfer', card: 'Card', cash: 'Cash', wire: 'Wire', other: 'Other' };
/* p = { date, method, checkNo, ref, paidFrom, amount, note } → Promise<{ ok, payment } | { ok:false, error }> */
var PAYING = {};
function pay(id, p){
  if (!canUse()) return Promise.resolve({ ok: false, error: 'Only admins, the office and accounting can pay a statement.' });
  var rec = getRec(id); if (!rec) return Promise.resolve({ ok: false, error: 'That statement is not loaded.' });
  if (PAYING[id]) return Promise.resolve({ ok: false, error: 'This statement is being paid — wait a moment.' });
  p = p || {};
  var S = summary(rec), inc = S.V.filter(function(v){ return v.include; });
  var date = s(p.date).slice(0, 10) || today(), method = low(p.method) || 'check', checkNo = s(p.checkNo), ref = s(p.ref), amount = r2(p.amount);
  if (!inc.length) return Promise.resolve({ ok: false, error: 'Tick at least one line to pay.' });
  if (S.need) return Promise.resolve({ ok: false, error: 'Pick the job for ' + S.need + ' line' + (S.need === 1 ? '' : 's') + ' (❓ / ⚠ wrong project) — or untick ' + (S.need === 1 ? 'it' : 'them') + '.' });
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) return Promise.resolve({ ok: false, error: 'Enter the payment date.' });
  if (method === 'check' && !checkNo) return Promise.resolve({ ok: false, error: 'Enter the check #.' });
  if (!(amount > 0)) return Promise.resolve({ ok: false, error: 'Enter the payment amount.' });
  var bad = inc.filter(function(v){ return v.kind !== 'credit' && !(v.pay > 0); });
  if (bad.length) return Promise.resolve({ ok: false, error: 'Line ' + bad.map(function(v){ return v.id; }).join(', ') + ' has nothing to pay — untick it.' });
  if (cents(amount) !== cents(S.inc.total)) return Promise.resolve({ ok: false, error: 'The payment ' + money(amount) + ' is not the ' + money(S.inc.total) + ' of the ticked lines (' + (amount > S.inc.total ? 'over' : 'short') + ' by ' + money(Math.abs(amount - S.inc.total)) + '). Change a line\'s amount (partial pay), untick a line, or ⚡ Apply oldest first.' });
  if (typeof W._setInvoices !== 'function') return Promise.resolve({ ok: false, error: 'Invoices are not ready on this screen yet — try again in a moment.' });
  var LS = W._gcLumpSum;
  if (inc.some(function(v){ return v.kind !== 'credit' && v.kind !== 'finance'; }) && !(LS && LS.save)) return Promise.resolve({ ok: false, error: 'The payment tools are still loading — try again in a moment.' });
  PAYING[id] = true;
  var by = myName(), at = nowIso(), payId = uid('SSP'), tag = { id: rec.id, no: s(rec.stmtNo), date: s(rec.stmtDate), supplier: s(rec.supplier), payId: payId, payDate: date, method: method, checkNo: checkNo, ref: ref };
  var stmtLabel = s(rec.supplier) + ' statement ' + (rec.stmtNo ? '#' + rec.stmtNo : '') + (rec.stmtDate ? ' (' + rec.stmtDate + ')' : '');
  var newBills = [], moves = [], costRows = [], extras = [], plan = [];
  inc.forEach(function(v){
    var pj = v.job || null, po = s(v.po) || s(pj && pj.autoPO);
    if (v.kind === 'credit' || v.kind === 'finance') {
      var eid = (v.kind === 'credit' ? 'SSC-' : 'SSF-') + rec.id + '-' + v.id;
      extras.push({ id: eid, pid: v.kind === 'credit' ? s(v.pid) : '', overhead: v.kind === 'finance' || !v.pid, type: v.kind === 'credit' ? 'refund' : 'expense', vendor: rec.supplier, payee: rec.supplier,
        desc: (v.kind === 'credit' ? 'Credit / return' : 'Finance charge') + (v.invNo ? ' #' + v.invNo : '') + ' on ' + stmtLabel + (v.memo ? ' — ' + v.memo : ''), po: v.kind === 'credit' ? po : '', ref: s(v.invNo), amt: v.pay, amount: v.pay,
        category: v.kind === 'credit' ? 'Materials' : 'Finance charges', status: 'paid', approved: true, paidDate: date, date: s(v.date) || s(rec.stmtDate) || date, payMethod: METHOD[method] || method, checkNo: method === 'check' ? checkNo : '',
        direction: 'out', isIncome: false, source: 'supplier-statement', ssKey: ssKey(rec, v), supStmt: Object.assign({ lineId: v.id }, tag), enteredAt: at, by: by, savedAt: at, updatedAt: at });
      plan.push({ lineId: v.id, kind: v.kind, pid: s(v.pid), amount: v.pay, made: v.kind, expId: eid, full: true });
      return;
    }
    var bill = v.bill;
    if (!bill) {
      var bid = 'SSB-' + rec.id + '-' + v.id, have = findInv(bid);
      if (!have) newBills.push({ id: bid, type: 'sub', payeeType: 'supplier', isSupplier: true, pid: s(v.pid), po: po, sub: rec.supplier, subId: s(rec.supplierId), invNum: s(v.invNo), amt: r2(Math.abs(v.amount)) || v.pay, amount: r2(Math.abs(v.amount)) || v.pay,
        desc: (s(v.memo) || 'Materials') + (v.shipTo ? ' — ' + v.shipTo : '') + ' (from ' + stmtLabel + ')', recvDate: s(v.date) || s(rec.stmtDate), date: s(v.date) || s(rec.stmtDate), status: 'received', source: 'supplier-statement', by: by,
        pidManual: !!v.humanPid || undefined, _matchConfirmed: true, ssKey: ssKey(rec, v), supStmtFrom: { id: rec.id, lineId: v.id, no: s(rec.stmtNo), date: s(rec.stmtDate) }, savedAt: at, updatedAt: at });
      costRows.push({ invId: bid, pid: s(v.pid), po: po, amt: r2(Math.abs(v.amount)) || v.pay, date: s(v.date) || s(rec.stmtDate), desc: s(v.memo) || 'Materials' });
      plan.push({ lineId: v.id, kind: 'invoice', invId: bid, pid: s(v.pid), amount: v.pay, made: 'bill' });
      return;
    }
    if (s(bill.pid) !== s(v.pid)) moves.push({ invId: s(bill.id), from: s(bill.pid), to: s(v.pid), human: v.humanPid });
    if (!arr(crm().expenses).some(function(e){ return e && s(e.subInvId) === s(bill.id) && !/^(rejected|denied|void)$/i.test(s(e.status)); })) costRows.push({ invId: s(bill.id), pid: s(v.pid), po: s(bill.po) || po, amt: C.amtOf(bill), date: C.billDay(bill) || s(v.date), desc: s(bill.desc) || s(v.memo) || 'Materials', status: low(bill.status) === 'approved' ? 'approved' : 'pending' });
    plan.push({ lineId: v.id, kind: 'invoice', invId: s(bill.id), pid: s(v.pid), amount: v.pay, made: '' });
  });
  /* 1. the new bills, the moved bills and their cost rows — written first */
  if (newBills.length || moves.length) setInv(function(L){
    var mv = {}; moves.forEach(function(m){ mv[m.invId] = m; });
    var out = L.map(function(r){ var m = r && mv[s(r.id)]; if (!m) return r; return Object.assign({}, r, { pid: m.to, pidWas: m.from || '', pidManual: true, pidBy: by, _matchConfirmed: true, linkedBy: by, autoLinkWhy: 'job picked on ' + stmtLabel, updatedAt: at }); });
    newBills.forEach(function(b){ if (!out.some(function(r){ return r && r.id === b.id; })) out.push(b); });
    return out;
  });
  setExp(function(E){
    var mv = {}; moves.forEach(function(m){ mv[m.invId] = m; });
    var out = E.map(function(e){ var m = e && mv[s(e.subInvId)]; return m ? Object.assign({}, e, { pid: m.to, pidWas: e.pid || '', updatedAt: at }) : e; });
    costRows.forEach(function(c){ if (out.some(function(e){ return e && s(e.subInvId) === c.invId; })) return; out.push({ id: 'EXPS-' + c.invId, pid: c.pid, subInvId: c.invId, _fromSub: true, type: 'expense', vendor: rec.supplier, payee: rec.supplier, desc: 'Sub Invoice: ' + c.desc, po: c.po, amt: c.amt, amount: c.amt,
      category: 'Materials', status: c.status || 'approved', date: c.date, direction: 'out', isIncome: false, source: 'supplier-statement', by: by, enteredAt: at, savedAt: at, updatedAt: at }); });
    extras.forEach(function(x){ if (!out.some(function(e){ return e && e.id === x.id; })) out.push(x); });
    return out;
  });
  costRows.forEach(function(c){ if (c.pid) reg({ srcInvId: c.invId, pid: c.pid, payee: rec.supplier, desc: 'Sub Invoice: ' + c.desc, po: c.po, amount: c.amt, amt: c.amt, category: 'Subcontractor', date: c.date, source: 'subinvoice', method: 'invoice', direction: 'out', isIncome: false, status: 'pending' }); });
  extras.forEach(function(x){ if (x.pid) reg({ srcInvId: x.id, pid: x.pid, payee: rec.supplier, desc: x.desc, amount: x.amt, amt: x.amt, category: x.category, date: date, source: 'supplier-statement', method: 'payment', direction: 'out', isIncome: false, status: 'paid' }); });
  var billLines = plan.filter(function(x){ return x.kind === 'invoice'; });
  var billTotal = r2(billLines.reduce(function(a, x){ return a + x.amount; }, 0));
  var waitIds = billLines.map(function(x){ return x.invId; });
  return waitBills(waitIds, moves).then(function(ready){
    if (!ready) return { ok: false, error: 'The new bills did not show up in the CRM yet — press 💵 Pay statement again in a moment (nothing was paid twice).' };
    var lump = null;
    if (billLines.length) {
      var res = LS.save({ side: 'pay', party: rec.supplier, amount: billTotal, date: date, method: method, checkNo: checkNo, ref: ref || ('Statement ' + (rec.stmtNo ? '#' + rec.stmtNo : rec.stmtDate)), stmtNo: s(rec.stmtNo), note: (s(p.note) ? s(p.note) + ' · ' : '') + 'Paid on ' + stmtLabel + (cents(amount) !== cents(billTotal) ? ' — the check ' + money(amount) + ' = bills ' + money(billTotal) + (S.inc.credits ? ' − credits ' + money(-S.inc.credits) : '') + (S.inc.finance ? ' + finance ' + money(S.inc.finance) : '') : ''),
        file: rec.file || null, lines: billLines.map(function(x){ return { invId: x.invId, amount: x.amount }; }), source: 'supplier-statement' });
      if (!res || !res.ok) return { ok: false, error: s(res && res.error) || 'The payment could not be saved.' };
      lump = res;
    }
    /* each bill + its cost row: "Paid on <Supplier> statement <#/date>, check <#>" */
    var lineOf = {}; billLines.forEach(function(x){ lineOf[x.invId] = x; });
    setInv(function(L){ return L.map(function(r){ var x = r && lineOf[s(r.id)]; if (!x) return r; var t = Object.assign({ lineId: x.lineId, amount: x.amount }, tag); return Object.assign({}, r, { supStmt: t, supStmts: arr(r.supStmts).concat([t]).slice(-10), updatedAt: nowIso() }); }); });
    setExp(function(E){ return E.map(function(e){ var x = e && lineOf[s(e.subInvId)]; if (!x) return e; return Object.assign({}, e, { supStmt: Object.assign({ lineId: x.lineId, amount: x.amount }, tag), updatedAt: nowIso() }); }); });
    billLines.forEach(function(x){ var b = findInv(x.invId); x.full = !!(b && (C.isPaid(b) || (lump && arr(lump.record && lump.record.applied).some(function(a){ return a.invId === x.invId && a.full; })))); });
    var payment = { id: payId, at: at, by: by, date: date, method: method, checkNo: checkNo, ref: ref, paidFrom: s(p.paidFrom), note: s(p.note).slice(0, 500), amount: amount, bills: billTotal, credits: S.inc.credits, finance: S.inc.finance,
      lumpId: lump ? lump.id : '', lines: plan.map(function(x){ return { lineId: x.lineId, invId: x.invId || '', expId: x.expId || '', pid: x.pid, amount: x.amount, kind: x.kind, made: x.made, full: !!x.full }; }) };
    rec.payments = arr(rec.payments).concat([payment]);
    logIt(rec, '💵 paid ' + money(amount) + ' (' + (METHOD[method] || method) + (checkNo ? ' #' + checkNo : '') + ') — ' + plan.length + ' line' + (plan.length === 1 ? '' : 's') + (newBills.length ? ', ' + newBills.length + ' new bill' + (newBills.length === 1 ? '' : 's') : '') + (moves.length ? ', ' + moves.length + ' moved to the picked job' : ''));
    var after = summary(rec);
    if (after.state === 'paid' && !rec.arch) rec.arch = { v: true, by: by, at: nowIso(), auto: true };
    return persist(rec).then(function(){ return { ok: true, payment: payment, state: after.state, newBills: newBills.length, moved: moves.length, lumpId: payment.lumpId }; });
  }).then(function(r){ delete PAYING[id]; return r; }, function(e){ delete PAYING[id]; warn(e); return { ok: false, error: s(e && e.message) || 'The payment could not be saved.' }; });
}

/* ═════════════════════════════ THE PANEL (inline, no cover) ═════════════════════════════ */
var CSS = '#gc-ss{background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 6px 24px rgba(15,23,42,.08);margin:10px 12px;padding:12px 14px;font:13px/1.4 Inter,Arial,sans-serif;max-width:100%;box-sizing:border-box;overflow:hidden}' +
  '#gc-ss.float{position:fixed;top:64px;right:12px;width:min(1100px,calc(100vw - 24px));max-height:calc(100vh - 80px);overflow:auto;z-index:100240;margin:0;box-shadow:0 12px 32px rgba(15,23,42,.16)}' +
  '#gc-ss *{box-sizing:border-box}#gc-ss h2{margin:0;font-size:16px;flex:1;min-width:0}#gc-ss .hd{display:flex;gap:8px;align-items:center;flex-wrap:wrap}#gc-ss .sub{color:#64748b;font-size:12px;margin:2px 0 8px}' +
  '#gc-ss button,#gc-ss .btn{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:8px;padding:6px 11px;font-weight:700;cursor:pointer;font-size:12.5px;min-height:36px;font-family:inherit}' +
  '#gc-ss button.ok{background:#16a34a;border-color:#16a34a;color:#fff}#gc-ss button.on{background:#f1f5f9;border-color:#94a3b8}#gc-ss button:disabled{opacity:.5;cursor:default}#gc-ss button.x{border:0;font-size:17px;min-height:0;padding:2px 8px}' +
  '#gc-ss button.s{min-height:28px;padding:2px 8px;font-size:11.5px}#gc-ss input,#gc-ss select,#gc-ss textarea{border:1px solid #cbd5e1;border-radius:8px;padding:6px 8px;font:13px Inter,Arial,sans-serif;background:#fff;color:#0f172a;min-height:34px;max-width:100%}' +
  '#gc-ss label.f{display:flex;flex-direction:column;gap:3px;font-size:11.5px;font-weight:700;color:#475569}#gc-ss .row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin:6px 0}' +
  '#gc-ss .chip{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700;background:#f1f5f9;color:#334155;white-space:nowrap}' +
  '#gc-ss .c-ok,#gc-ss .c-paid{background:#dcfce7;color:#166534}#gc-ss .c-already,#gc-ss .c-wrong{background:#fef3c7;color:#92400e}#gc-ss .c-nojob{background:#fee2e2;color:#991b1b}#gc-ss .c-new{background:#e0f2fe;color:#075985}#gc-ss .c-credit{background:#f3e8ff;color:#6b21a8}#gc-ss .c-finance{background:#ffedd5;color:#9a3412}' +
  '#gc-ss .c-open{background:#e0f2fe;color:#075985}#gc-ss .c-partial{background:#fef9c3;color:#854d0e}' +
  '#gc-ss table{width:100%;border-collapse:collapse;font-size:12.5px}#gc-ss th{text-align:left;font-size:10.5px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;padding:5px}#gc-ss td{border-bottom:1px solid #f1f5f9;padding:5px;vertical-align:top;overflow-wrap:anywhere}' +
  '#gc-ss td.n,#gc-ss th.n{text-align:right;white-space:nowrap}#gc-ss tr.off td{opacity:.55}#gc-ss .why{color:#64748b;font-size:11px}#gc-ss .warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:6px 9px;margin:6px 0;font-size:12.5px}' +
  '#gc-ss .bad{color:#b91c1c;font-weight:700}#gc-ss .good{color:#15803d;font-weight:700}#gc-ss .pay{position:sticky;bottom:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin-top:8px}' +
  '#gc-ss .tot{font-weight:800}#gc-ss .pk{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px;margin-top:4px}#gc-ss .pk .opts{display:flex;flex-direction:column;gap:3px;margin-top:4px}#gc-ss .pk .opts button{text-align:left;font-weight:600}' +
  '#gc-ss .amt{width:96px;text-align:right}#gc-ss .cnts{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}#gc-ss .grp{border:1px solid #e2e8f0;border-radius:10px;padding:8px;margin:8px 0}#gc-ss .hist{font-size:11.5px;color:#475569}' +
  '.gc-ss-chip{display:inline-block;margin-left:4px;border-radius:999px;padding:1px 7px;font:700 10px Inter,Arial,sans-serif;background:#dcfce7;color:#166534;white-space:nowrap}' +
  '@media (max-width:700px){#gc-ss{margin:8px 0;padding:10px;border-radius:10px}#gc-ss .hd h2{flex:1 1 100%}#gc-ss.float{top:auto;bottom:0;left:0;right:0;width:auto;max-height:90vh;border-radius:14px 14px 0 0}' +
  '#gc-ss table.lines,#gc-ss table.lines tbody,#gc-ss table.lines tr,#gc-ss table.lines td{display:block;width:100%}#gc-ss table.lines thead{display:none}' +
  '#gc-ss table.lines tr{border:1px solid #e2e8f0;border-radius:10px;padding:6px 8px;margin:0 0 8px}#gc-ss table.lines td{border:0;padding:2px 0}#gc-ss table.lines td.n{text-align:left}#gc-ss table.lines td[data-l]:before{content:attr(data-l) ": ";color:#64748b;font-size:11px;font-weight:700}' +
  '#gc-ss .row>label.f{flex:1 1 140px}#gc-ss button.s{min-height:36px;padding:4px 10px}#gc-ss .amt{width:120px}}';
function css(){ if (D.getElementById('gc-ss-css')) return; var st = D.createElement('style'); st.id = 'gc-ss-css'; st.textContent = CSS; (D.head || D.documentElement).appendChild(st); }
var UI = null;
function toast(m, bad){ try { if (typeof W._gcToast === 'function') { W._gcToast(m); return; } } catch (e) {} try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.setAttribute('role', 'status'); t.textContent = m; t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:' + (bad ? '#b91c1c' : '#16a34a') + ';color:#fff;padding:10px 16px;border-radius:10px;z-index:2147483200;font:700 13.5px Inter,Arial,sans-serif;max-width:90vw;box-shadow:0 8px 24px rgba(0,0,0,.2)'; D.body.appendChild(t); later(function(){ t.remove(); }, 4200); } catch (e) {} }
/* where the panel goes: under the Accounting screen's top bar, or under the Invoices pages' 💵 row; else a light side sheet */
function hostFor(){
  var root = D.getElementById('gck-root'); if (root) { var body = root.querySelector('.gck-body'); if (body) return { parent: body.parentElement, before: body }; }
  var lb = D.querySelector('.gc-lumpbar'); if (lb && lb.parentElement) return { parent: lb.parentElement, before: lb.nextSibling };
  return null;
}
function mount(first){
  if (!UI) return; var el = UI.el, h = hostFor();
  if (h) { UI.float = false; el.classList.remove('float'); if (el.parentElement !== h.parent || (h.before && el.nextSibling !== h.before && h.before !== el)) h.parent.insertBefore(el, h.before || null); }
  else if (first || UI.float) { UI.float = true; el.classList.add('float'); if (el.parentElement !== D.body) D.body.appendChild(el); }
  else if (el.parentElement) el.remove();   /* another screen: put away, back when Accounting / Invoices is open again */
}
function open(opt){
  opt = opt || {}; css();
  if (!UI) { var el = D.createElement('div'); el.id = 'gc-ss'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('data-gc-linked', '1'); el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Supplier statements');
    UI = { el: el, view: 'list', id: '', sup: '', pk: '', ed: '', msg: '', form: {}, payf: {}, filter: '' };
    el.addEventListener('click', onClick); el.addEventListener('change', onChange); el.addEventListener('input', onInput); }
  if (!canUse()) { UI.view = 'refused'; mount(true); draw(); return { refused: true }; }
  if (opt.id) { UI.view = 'show'; UI.id = opt.id; }
  else if (opt.view) UI.view = opt.view;
  else if (UI.view === 'refused') UI.view = 'list';
  if (opt.supplier) UI.sup = s(opt.supplier);
  mount(true); draw();
  if (Date.now() - PULLED > 60000) refresh().then(function(){ if (UI) draw(); });
  if (UI.view === 'show') { var r0 = getRec(UI.id); if (r0) match(r0).then(function(){ if (UI && UI.id === r0.id) draw(); }); }
  try { UI.el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  return { ok: true };
}
function close(){ if (UI) { try { UI.el.remove(); } catch (e) {} } UI = null; }
function chip(st, txt){ return '<span class="chip c-' + esc(st) + '">' + esc(txt || C.LABEL[st] || st) + '</span>'; }
function stChip(S){ return S.state === 'paid' ? chip('paid', '✓ Paid') : S.state === 'partial' ? chip('partial', '◐ Partly paid') : chip('open', '○ Open'); }
function jobName(p){ return p ? s(p.name) + (p.autoPO ? ' · ' + s(p.autoPO) : '') : ''; }
function hdr(title){ return '<div class="hd"><h2>' + title + '</h2>' + (UI.view !== 'list' && UI.view !== 'refused' ? '<button type="button" data-ss="list">🗂 Statements</button>' : '') + (UI.view !== 'new' && UI.view !== 'refused' ? '<button type="button" class="ok" data-ss="new">＋ Enter a statement</button>' : '') + '<button type="button" class="x" data-ss="close" aria-label="Close">✕</button></div>'; }
function draw(){
  if (!UI) return; var el = UI.el;
  if (UI.view === 'refused') { el.innerHTML = hdr('🧾 Supplier statements') + '<p class="bad" data-ss="refused">Supplier statements are for admins, the office and accounting.</p>'; return; }
  if (UI.view === 'new') return drawNew();
  if (UI.view === 'show') return drawShow();
  return drawList();
}
function drawList(){
  var by = {}, F = UI.filter;
  LIST.forEach(function(r){ var S = summary(r); if (F === 'open' && S.state === 'paid') return; if (F === 'paid' && S.state !== 'paid') return; var k = C.normParty(r.supplier) || '?'; (by[k] = by[k] || { name: r.supplier, list: [] }).list.push({ r: r, S: S }); });
  var keys = Object.keys(by).sort(function(a, b){ return by[a].name.localeCompare(by[b].name); });
  if (UI.sup) keys = keys.filter(function(k){ return C.sameParty(by[k].name, UI.sup) || C.looseParty(by[k].name, UI.sup); });
  var h = hdr('🧾 Supplier statements') + '<div class="sub">A supplier\'s statement (ABC Supply and the like): enter it once, see which job each line is for, and pay the whole statement with one check — each job\'s bill is marked paid.</div>' +
    '<div class="row"><span class="chip">' + LIST.length + ' statement' + (LIST.length === 1 ? '' : 's') + '</span>' + ['', 'open', 'paid'].map(function(f){ return '<button type="button" class="s' + (F === f ? ' on' : '') + '" data-ss="filter" data-v="' + f + '">' + (f === '' ? 'All' : f === 'open' ? 'Open / partly paid' : 'Paid') + '</button>'; }).join('') + (UI.sup ? '<button type="button" class="s" data-ss="allsup">All suppliers</button>' : '') + '</div>';
  if (!keys.length) h += '<p class="sub" data-ss="empty">No statements yet — press ＋ Enter a statement.</p>';
  keys.forEach(function(k){
    var g = by[k], open = r2(g.list.reduce(function(a, x){ return a + x.S.open; }, 0)), tot = r2(g.list.reduce(function(a, x){ return a + x.S.total; }, 0)), paid = r2(g.list.reduce(function(a, x){ return a + x.S.paid; }, 0));
    g.list.sort(function(a, b){ return s(b.r.stmtDate).localeCompare(s(a.r.stmtDate)); });
    h += '<div class="grp" data-ss-sup="' + esc(k) + '"><div class="hd"><b style="flex:1">' + esc(g.name) + '</b><span class="chip">' + g.list.length + ' statement' + (g.list.length === 1 ? '' : 's') + '</span><span class="chip">total ' + money(tot) + '</span><span class="chip c-paid">paid ' + money(paid) + '</span>' + (open ? '<span class="chip c-open">open ' + money(open) + '</span>' : '') + '</div>' +
      '<table><thead><tr><th>Date</th><th>Statement #</th><th class="n">Total</th><th class="n">Paid</th><th class="n">Open</th><th>Status</th><th></th></tr></thead><tbody>' +
      g.list.map(function(x){ var r = x.r, S = x.S; return '<tr data-ss-row="' + esc(r.id) + '"><td>' + esc(r.stmtDate) + '</td><td>' + esc(r.stmtNo || '—') + '</td><td class="n">' + money(S.total) + '</td><td class="n">' + money(S.paid) + '</td><td class="n">' + money(S.open) + '</td><td>' + stChip(S) + (S.archived ? ' <span class="chip">archived</span>' : '') + '</td><td><button type="button" class="s" data-ss="show" data-id="' + esc(r.id) + '">Open</button></td></tr>'; }).join('') + '</tbody></table></div>';
  });
  UI.el.innerHTML = h;
}
function supOptions(){ return suppliers().map(function(x){ return '<option value="' + esc(x.name) + '">' + esc(x.name) + (x.n ? ' — ' + x.n + ' bills, ' + money(x.open) + ' open' : '') + '</option>'; }).join(''); }
function drawNew(){
  var f = UI.form;
  UI.el.innerHTML = hdr('🧾 Enter a supplier statement') + '<div class="sub">Pick the supplier, then the statement\'s PDF, a photo of it, or its CSV — and / or type or paste its lines (one per line: date, invoice #, PO / job #, ship-to address, job name, amount).</div>' +
    '<div class="row"><label class="f" style="min-width:240px">Supplier<input data-ss-f="supplier" list="gc-ss-sups" value="' + esc(f.supplier || '') + '" placeholder="e.g. ABC Supply" autocomplete="off"></label><datalist id="gc-ss-sups">' + supOptions() + '</datalist>' +
    '<label class="f">Statement date<input type="date" data-ss-f="stmtDate" value="' + esc(f.stmtDate || '') + '"></label><label class="f">Statement #<input data-ss-f="stmtNo" value="' + esc(f.stmtNo || '') + '" autocomplete="off"></label><label class="f">Account #<input data-ss-f="accountNo" value="' + esc(f.accountNo || '') + '" autocomplete="off"></label></div>' +
    '<div class="row"><label class="f" style="flex:1 1 260px">Statement file (PDF, photo or CSV)<input type="file" data-ss-f="file" accept="application/pdf,.pdf,image/*,.heic,.heif,.csv,text/csv,.txt"></label></div>' +
    '<label class="f">…or type / paste the lines<textarea data-ss-f="text" rows="5" placeholder="10/02/2026  2345678-00  T601  1234 Oak Ridge Dr  Kitchen job  1,250.00">' + esc(f.text || '') + '</textarea></label>' +
    '<div class="row"><button type="button" class="ok" data-ss="read">📖 Read the statement</button><span data-ss="msg" class="' + (UI.msgBad ? 'bad' : 'good') + '" aria-live="polite">' + esc(UI.msg) + '</span></div>';
}
function jobCell(v){
  var p = v.job, lbl = v.pid ? (p ? esc(jobName(p)) : '<i>job ' + esc(v.pid) + ' not found</i>') : '<i class="bad">no job</i>';
  var why = v.pid ? (v.how === 'person' ? '👤 ' + esc(v.why) : v.why ? '↳ by ' + esc(v.why) : '') : '';
  return '<div><b>' + lbl + '</b>' + (v.jobClosed ? ' <span class="chip c-already">job ' + esc(s(v.job.status) || 'closed') + '</span>' : '') + '</div>' + (why ? '<div class="why">' + why + '</div>' : '');
}
function billCell(v){
  if (v.kind === 'payment') return '<span class="why">a payment on their books</span>';
  if (v.kind === 'finance') return '<span class="why">overhead (no job)</span>';
  var b = v.bill;
  if (!b) return v.kind === 'credit' ? '<span class="why">credit — a negative cost on the job</span>' : '<span class="why">➕ added as a bill when paid</span>';
  var pd = C.paidOf(b), A = C.amtOf(b);
  return '<div>' + esc(C.billNo(b) || b.id) + ' · ' + money(A) + (pd > 0 && pd < A ? ' (open ' + money(C.openOf(b)) + ')' : '') + '</div><div class="why">' + esc(v.invHow === 'person' ? v.invWhy : v.invHow === 'invoice' ? 'by invoice #' : v.invHow === 'amount' ? 'by amount + date' : v.invWhy) + (v.amtDiff ? ' · <span class="bad">amount differs</span>' : '') + '</div>';
}
function statusCell(v){
  var t = chip(v.st);
  if (v.st === 'already' && v.paidInfo) { var i = v.paidInfo; t += '<div class="why">' + esc(i.date || '') + (i.method ? ' · ' + esc(i.method) : '') + (i.ref ? ' #' + esc(i.ref) : '') + (i.stmt ? ' · on ' + esc(i.stmt.supplier || '') + ' statement ' + esc(i.stmt.no ? '#' + i.stmt.no : i.stmt.date || '') : '') + '</div>'; }
  if (v.st === 'paid' && v.paidHere && v.paidHere.pay) { var q = v.paidHere.pay; t += '<div class="why">' + esc(q.date) + ' · ' + esc(METHOD[q.method] || q.method) + (q.checkNo ? ' #' + esc(q.checkNo) : '') + ' · ' + esc(q.by) + '</div>'; }
  else if (v.paidHere && v.paidHere.amount && v.st !== 'paid') t += '<div class="why">' + money(v.paidHere.amount) + ' paid so far</div>';
  if (v.st === 'wrong') { var cp = proj(v.bill && v.bill.pid); t += '<div class="why">the CRM has the bill on ' + esc(jobName(cp) || '—') + '</div>'; }
  return t;
}
function picker(rec, v){
  var q = s(UI.pq), X = jobX(), a = (arr(rec.lines).filter(function(l){ return l.id === v.id; })[0] || {}).a || {}, seen = {}, opts = [];
  function add(pid, why){ if (!pid || seen[pid]) return; var p = proj(pid); if (!p) return; seen[pid] = 1; opts.push('<button type="button" data-ss="setjob" data-line="' + esc(v.id) + '" data-pid="' + esc(pid) + '">' + esc(jobName(p)) + (why ? ' <span class="why">— ' + esc(why) + '</span>' : '') + (C.CLOSEDJOB.test(s(p.status)) ? ' <span class="chip c-already">' + esc(p.status) + '</span>' : '') + '</button>'); }
  if (v.st === 'wrong') { add(a.stmtPid, 'the statement\'s ' + (a.how === 'address' ? 'address' : a.how === 'po' ? 'PO' : 'evidence')); if (v.bill) add(s(v.bill.pid), 'where the CRM has the bill'); }
  arr(a.cands).forEach(function(c){ add(c.pid, c.why); });
  if (q.length >= 2) { var n = C.nk(q); X.idx.filter(function(J){ return !J.lost && ((' ' + J.nameN + ' ' + C.nk(J.client) + ' ' + C.nk(J.address) + ' ' + (J.pos || []).join(' ').toLowerCase() + ' ').indexOf(n) >= 0); }).slice(0, 8).forEach(function(J){ add(J.id, s(J.address).split(',')[0]); }); }
  var can = false; try { can = typeof W._gcNewProjectFor === 'function'; } catch (e) {}
  return '<div class="pk" data-ss-pk="' + esc(v.id) + '"><input data-ss="pq" value="' + esc(q) + '" placeholder="Search jobs: name, address, customer, PO" style="width:100%" autocomplete="off"><div class="opts">' + (opts.join('') || '<span class="why">Type 2+ letters to search the jobs.</span>') + '</div>' +
    '<div class="row"><button type="button" class="s" data-ss="setjob" data-line="' + esc(v.id) + '" data-pid="">No job</button>' + (can ? '<button type="button" class="s" data-ss="newjob" data-line="' + esc(v.id) + '">➕ New project…</button>' : '') + '<button type="button" class="s" data-ss="pkx">Done</button></div></div>';
}
function billPicker(rec, v){
  var bills = invoices().filter(function(b){ return C.liveBill(b) && (C.sameParty(C.billParty(b), rec.supplier) || C.looseParty(C.billParty(b), rec.supplier)); });
  var A = cents(Math.abs(v.amount));
  bills.sort(function(a, b){ return (Math.abs(cents(C.amtOf(a)) - A) - Math.abs(cents(C.amtOf(b)) - A)) || (C.days(v.date, C.billDay(a)) - C.days(v.date, C.billDay(b))); });
  var o = bills.slice(0, 12).map(function(b){ var p = proj(b.pid); return '<button type="button" data-ss="setinv" data-line="' + esc(v.id) + '" data-inv="' + esc(b.id) + '">#' + esc(C.billNo(b) || b.id) + ' · ' + esc(C.billDay(b)) + ' · ' + money(C.amtOf(b)) + ' · ' + esc(jobName(p) || 'no job') + (C.isPaid(b) ? ' · paid' : '') + '</button>'; }).join('');
  return '<div class="pk" data-ss-bk="' + esc(v.id) + '"><b>Which bill in the CRM is this line?</b><div class="opts">' + (o || '<span class="why">No bills from ' + esc(rec.supplier) + ' in the CRM.</span>') + '</div><div class="row"><button type="button" class="s" data-ss="setinv" data-line="' + esc(v.id) + '" data-inv="__new">➕ Not in the CRM — add it as a new bill</button>' + (v.humanInv ? '<button type="button" class="s" data-ss="setinv" data-line="' + esc(v.id) + '" data-inv="">↺ Let the CRM match it</button>' : '') + '<button type="button" class="s" data-ss="pkx">Done</button></div></div>';
}
function editor(v){
  return '<div class="pk" data-ss-ed="' + esc(v.id) + '"><div class="row">' + [['date', 'Date', 'date'], ['invNo', 'Invoice #', 'text'], ['po', 'PO / job #', 'text'], ['shipTo', 'Ship-to', 'text'], ['memo', 'Memo / job name', 'text'], ['amount', 'Amount', 'number']].map(function(x){ return '<label class="f">' + x[1] + '<input type="' + x[2] + '" data-ss-e="' + x[0] + '"' + (x[2] === 'number' ? ' step="0.01"' : '') + ' value="' + esc(v[x[0]]) + '"></label>'; }).join('') + '</div>' +
    '<div class="row"><button type="button" class="ok s" data-ss="saveedit" data-line="' + esc(v.id) + '">💾 Save line</button><button type="button" class="s" data-ss="pkx">Cancel</button></div></div>';
}
function drawShow(){
  var rec = getRec(UI.id); if (!rec) { UI.view = 'list'; return drawList(); }
  var S = summary(rec), pf = UI.payf[rec.id] || (UI.payf[rec.id] = { date: today(), method: 'check', checkNo: '', ref: '', paidFrom: '', note: '', amount: '' });
  var amt = pf.amount === '' ? S.inc.total : r2(pf.amount), diff = r2(amt - S.inc.total);
  var fileBtn = rec.file && rec.file.ref ? '<button type="button" class="s" data-ss="file">📎 ' + esc(rec.file.name || 'statement') + '</button>' : '<span class="why">no file attached</span>';
  var h = hdr('🧾 ' + esc(rec.supplier) + ' statement ' + esc(rec.stmtNo ? '#' + rec.stmtNo : '') + ' · ' + esc(rec.stmtDate)) +
    '<div class="sub">' + (rec.accountNo ? 'Account ' + esc(rec.accountNo) + ' · ' : '') + arr(rec.lines).length + ' lines · lines total ' + money(S.total) + (rec.total != null ? ' · the statement says ' + money(rec.total) : '') + ' · entered by ' + esc(rec.createdBy) + ' ' + esc(s(rec.createdAt).slice(0, 10)) + ' ' + stChip(S) + (S.archived ? ' <span class="chip">archived</span>' : '') + '</div>' +
    (rec.total != null && Math.abs(cents(rec.total) - cents(S.total)) > 1 ? '<div class="warn">⚠ The lines add up to ' + money(S.total) + '; the statement says ' + money(rec.total) + ' — a line may be missing (＋ Add a line) or read twice (untick it).</div>' : '') +
    '<div class="row">' + fileBtn + '<button type="button" class="s" data-ss="rematch">↻ Match again</button><button type="button" class="s" data-ss="addline">＋ Add a line</button><button type="button" class="s" data-ss="arch">' + (S.archived ? '↩ Un-archive' : '🗄 Archive') + '</button><span class="why">supplier: <input class="s" data-ss="supname" list="gc-ss-sups" value="' + esc(rec.supplier) + '" style="min-height:28px;width:180px"></span><datalist id="gc-ss-sups">' + supOptions() + '</datalist></div>' +
    '<div class="cnts">' + ['ok', 'new', 'wrong', 'nojob', 'already', 'credit', 'finance', 'paid', 'info'].filter(function(k){ return S.cnt[k]; }).map(function(k){ return chip(k, C.LABEL[k] + ' ' + S.cnt[k]); }).join('') + '</div>';
  if (UI.ed === '__add') h += editor({ id: '__add', date: '', invNo: '', po: '', shipTo: '', memo: '', amount: '' }).replace('data-ss="saveedit"', 'data-ss="saveadd"');
  h += '<table class="lines"><thead><tr><th>Pay</th><th>Date</th><th>Invoice #</th><th>PO · ship-to · memo</th><th class="n">Amount</th><th>Bill in the CRM</th><th>Job</th><th>Status</th><th class="n">To pay</th><th></th></tr></thead><tbody>';
  var FIRST = 25, rest = '';
  S.V.forEach(function(v, vi){
    var hh = '';
    var dis = /^(already|paid|info)$/.test(v.st);
    hh += '<tr data-ss-line="' + esc(v.id) + '" data-st="' + esc(v.st) + '" class="' + (v.include ? '' : 'off') + '">' +
      '<td data-l="Pay"><input type="checkbox" data-ss="inc" data-line="' + esc(v.id) + '" aria-label="Pay line ' + esc(v.id) + '"' + (v.include ? ' checked' : '') + (dis ? ' disabled' : '') + '></td>' +
      '<td data-l="Date">' + esc(v.date || '—') + '</td><td data-l="Invoice #">' + esc(v.invNo || '—') + (v.kind !== 'invoice' ? ' <span class="chip">' + esc(v.kind) + '</span>' : '') + '</td>' +
      '<td data-l="Details">' + (v.po ? '<div>PO <b>' + esc(v.po) + '</b></div>' : '') + (v.shipTo ? '<div>' + esc(v.shipTo) + '</div>' : '') + (v.memo ? '<div class="why">' + esc(v.memo) + '</div>' : '') + '</td>' +
      '<td class="n" data-l="Amount">' + money(v.amount) + '</td><td data-l="Bill">' + billCell(v) + '</td><td data-l="Job">' + (v.kind === 'payment' || v.kind === 'finance' ? '<span class="why">—</span>' : jobCell(v)) + '</td><td data-l="Status">' + statusCell(v) + '</td>' +
      '<td class="n" data-l="To pay">' + (dis ? '—' : '<input type="number" step="0.01" class="amt" data-ss="lpay" data-line="' + esc(v.id) + '" value="' + esc(v.pay) + '"' + (v.kind === 'credit' ? ' disabled' : '') + ' aria-label="Amount to pay on line ' + esc(v.id) + '">') + '</td>' +
      '<td data-l="Change">' + (v.kind === 'payment' ? '' : (v.st !== 'paid' && v.kind !== 'finance' ? '<button type="button" class="s" data-ss="pk" data-line="' + esc(v.id) + '">📍 Job</button> ' : '') + (v.st !== 'paid' && v.kind !== 'finance' && v.kind !== 'credit' ? '<button type="button" class="s" data-ss="bk" data-line="' + esc(v.id) + '">🔗 Bill</button> ' : '') + (v.st !== 'paid' ? '<button type="button" class="s" data-ss="ed" data-line="' + esc(v.id) + '">✏️</button>' : '')) + '</td></tr>';
    if (UI.pk === v.id) hh += '<tr><td colspan="10">' + picker(rec, v) + '</td></tr>';
    if (UI.bk === v.id) hh += '<tr><td colspan="10">' + billPicker(rec, v) + '</td></tr>';
    if (UI.ed === v.id) hh += '<tr><td colspan="10">' + editor(v) + '</td></tr>';
    if (vi < FIRST || UI.pk || UI.bk || UI.ed) h += hh; else rest += '<!--r-->' + hh;
  });
  h += '</tbody></table>';
  var methods = Object.keys(METHOD).map(function(k){ return '<option value="' + k + '"' + (pf.method === k ? ' selected' : '') + '>' + METHOD[k] + '</option>'; }).join('');
  if (!S.payable) h += '<div class="pay" data-ss="paybox"><b class="good">✓ Nothing left to pay on this statement.</b><div data-ss="msg" class="' + (UI.msgBad ? 'bad' : 'good') + '" aria-live="polite">' + esc(UI.msg) + '</div></div>';
  else h += '<div class="pay" data-ss="paybox"><div class="row" style="margin:0 0 4px"><b>💵 Pay this statement</b><span class="chip">' + S.inc.n + ' line' + (S.inc.n === 1 ? '' : 's') + ' ticked</span><span>bills ' + money(S.inc.bills) + '</span>' + (S.inc.credits ? '<span>credits ' + money(S.inc.credits) + '</span>' : '') + (S.inc.finance ? '<span>finance ' + money(S.inc.finance) + '</span>' : '') + '<span class="tot" data-ss="inctot">= ' + money(S.inc.total) + '</span></div>' +
    '<div class="row"><label class="f">Paid date<input type="date" data-ss-p="date" value="' + esc(pf.date) + '"></label><label class="f">Method<select data-ss-p="method">' + methods + '</select></label>' +
    '<label class="f">' + (pf.method === 'check' ? 'Check #' : 'Reference') + '<input data-ss-p="checkNo" value="' + esc(pf.checkNo) + '" autocomplete="off"></label><label class="f">Paid from<input data-ss-p="paidFrom" value="' + esc(pf.paidFrom) + '" placeholder="Operating checking"></label>' +
    '<label class="f">Payment amount<input type="number" step="0.01" class="amt" data-ss-p="amount" value="' + esc(pf.amount === '' ? S.inc.total : pf.amount) + '"></label><label class="f" style="flex:1 1 160px">Note<input data-ss-p="note" value="' + esc(pf.note) + '"></label></div>' +
    '<div class="row"><span data-ss="paydiff" class="' + (cents(diff) === 0 && S.inc.n ? 'good' : 'bad') + '">' + (!S.inc.n ? 'Tick the lines to pay.' : cents(diff) === 0 ? '✓ The payment matches the ticked lines.' : 'The payment is ' + (diff > 0 ? 'over' : 'short') + ' by ' + money(Math.abs(diff)) + '.') + '</span>' +
    (diff < 0 ? '<button type="button" class="s" data-ss="oldest">⚡ Apply ' + money(amt) + ' oldest first</button>' : '') + (S.need ? '<span class="bad">Pick the job for ' + S.need + ' line' + (S.need === 1 ? '' : 's') + '.</span>' : '') +
    '<span style="flex:1"></span><button type="button" class="ok" data-ss="pay"' + (S.inc.n && !S.need && cents(diff) === 0 ? '' : ' disabled') + '>💵 Pay statement</button></div><div data-ss="msg" class="' + (UI.msgBad ? 'bad' : 'good') + '" aria-live="polite">' + esc(UI.msg) + '</div></div>';
  if (arr(rec.payments).length) h += '<div class="grp"><b>Payments on this statement</b>' + arr(rec.payments).map(function(p){ return '<div class="hist" data-ss-pay="' + esc(p.id) + '">' + esc(p.date) + ' · <b>' + money(p.amount) + '</b> · ' + esc(METHOD[p.method] || p.method) + (p.checkNo ? ' #' + esc(p.checkNo) : '') + (p.ref ? ' · ' + esc(p.ref) : '') + ' · ' + arr(p.lines).length + ' lines (' + arr(p.lines).filter(function(x){ return x.made === 'bill'; }).length + ' new bills) · by ' + esc(p.by) + ' ' + esc(s(p.at).slice(0, 16).replace('T', ' ')) + '</div>'; }).join('') + '</div>';
  if (arr(rec.log).length) h += '<details class="grp"><summary><b>History</b></summary>' + arr(rec.log).slice().reverse().slice(0, 40).map(function(g){ return '<div class="hist">' + esc(s(g.at).slice(0, 16).replace('T', ' ')) + ' · ' + esc(g.by) + ' · ' + esc(g.what) + '</div>'; }).join('') + '</details>';
  UI.el.innerHTML = h;
  /* a long statement: the first rows at once, the rest in small slices (no long freeze on a phone) */
  if (rest) { var parts = rest.split('<!--r-->').filter(Boolean), tb = UI.el.querySelector('table.lines tbody'), u = UI, gen = UI.gen = (UI.gen || 0) + 1;
    var more = (function(){ if (!UI || UI !== u || UI.gen !== gen || !tb.isConnected) return; tb.insertAdjacentHTML('beforeend', parts.splice(0, 15).join('')); if (parts.length) later(more, 0); }); later(more, 0); }
}
function setMsg(t, bad){ if (!UI) return; UI.msg = t; UI.msgBad = !!bad; var m = UI.el.querySelector('[data-ss="msg"]'); if (m) { m.textContent = t; m.className = bad ? 'bad' : 'good'; } }
function onInput(e){
  var t = e.target, u = UI; if (!u) return;
  var f = t.getAttribute('data-ss-f'); if (f && f !== 'file') { u.form[f] = t.value; return; }
  var pf = t.getAttribute('data-ss-p'); if (pf) { var P = u.payf[u.id] = u.payf[u.id] || {}; P[pf] = t.value; if (pf === 'amount') repaintPay(); return; }
  if (t.getAttribute('data-ss') === 'pq') { u.pq = t.value; var rec = getRec(u.id), v = rec && view(rec, arr(rec.lines).filter(function(l){ return l.id === u.pk; })[0] || {}); var box = u.el.querySelector('[data-ss-pk]'); if (box && v) { var pos = t.selectionStart; box.outerHTML = picker(rec, v); var ni = u.el.querySelector('[data-ss="pq"]'); if (ni) { ni.focus(); try { ni.setSelectionRange(pos, pos); } catch (x) {} } } }
}
function repaintPay(){ var rec = getRec(UI.id); if (!rec) return; var S = summary(rec), pf = UI.payf[rec.id] || {}, amt = pf.amount === '' || pf.amount == null ? S.inc.total : r2(pf.amount), d = r2(amt - S.inc.total), el = UI.el.querySelector('[data-ss="paydiff"]'), b = UI.el.querySelector('[data-ss="pay"]');
  if (el) { el.textContent = cents(d) === 0 ? '✓ The payment matches the ticked lines.' : 'The payment is ' + (d > 0 ? 'over' : 'short') + ' by ' + money(Math.abs(d)) + '.'; el.className = cents(d) === 0 ? 'good' : 'bad'; }
  if (b) b.disabled = !(S.inc.n && !S.need && cents(d) === 0);
  var ob = UI.el.querySelector('[data-ss="oldest"]'); if (ob) ob.textContent = '⚡ Apply ' + money(amt) + ' oldest first'; else if (d < 0) draw();
}
function onChange(e){
  var t = e.target, u = UI; if (!u) return; var a = t.getAttribute('data-ss'), line = t.getAttribute('data-line');
  if (a === 'inc') { pick(u.id, line, 'inc', t.checked); draw(); return; }
  if (a === 'lpay') { pick(u.id, line, 'pay', t.value); draw(); return; }
  if (a === 'supname') { var nm = s(t.value); if (nm) setSupplier(u.id, nm).then(function(){ draw(); }); return; }
  var pf = t.getAttribute('data-ss-p'); if (pf) { var P = u.payf[u.id] = u.payf[u.id] || {}; P[pf] = t.value; if (pf === 'method') draw(); else repaintPay(); return; }
  var f = t.getAttribute('data-ss-f'); if (f === 'file') { u.file = t.files && t.files[0] || null; return; }
  if (f) u.form[f] = t.value;
}
function onClick(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-ss]') : null; if (!b || !UI || b.tagName === 'INPUT') return;
  var a = b.getAttribute('data-ss'), u = UI, line = b.getAttribute('data-line');
  if (a === 'close') return close();
  if (a === 'list') { u.view = 'list'; u.msg = ''; return draw(); }
  if (a === 'new') { u.view = 'new'; u.msg = ''; u.form = { supplier: u.sup || '' }; u.file = null; return draw(); }
  if (a === 'filter') { u.filter = b.getAttribute('data-v') || ''; return draw(); }
  if (a === 'allsup') { u.sup = ''; return draw(); }
  if (a === 'show') { u.view = 'show'; u.id = b.getAttribute('data-id'); u.msg = ''; u.pk = u.bk = u.ed = ''; draw(); var r0 = getRec(u.id); if (r0) match(r0).then(function(){ if (UI && UI.id === r0.id) draw(); }); return; }
  if (a === 'read') {
    b.disabled = true; setMsg('📖 Reading…');
    return read({ supplier: u.form.supplier, stmtDate: u.form.stmtDate, stmtNo: u.form.stmtNo, accountNo: u.form.accountNo, text: u.form.text, file: u.file }).then(function(r){
      if (!UI) return; b.disabled = false;
      if (r.error) return setMsg(r.error, true);
      u.view = 'show'; u.id = r.rec.id; u.form = {}; u.file = null;
      u.msg = r.dup ? 'This statement is already in the CRM (entered by ' + s(r.rec.createdBy) + ' ' + s(r.rec.createdAt).slice(0, 10) + ') — opened it.' : '✓ Read ' + arr(r.rec.lines).length + ' lines.' + (r.warn ? ' ' + r.warn : ''); u.msgBad = !!r.dup;
      if (r.dup) toast('Already entered — opened the statement from ' + s(r.rec.createdAt).slice(0, 10) + '.');
      draw();
    });
  }
  if (a === 'pk') { u.pk = u.pk === line ? '' : line; u.bk = u.ed = ''; u.pq = ''; draw(); var i = u.el.querySelector('[data-ss="pq"]'); if (i) try { i.focus(); } catch (x) {} return; }
  if (a === 'bk') { u.bk = u.bk === line ? '' : line; u.pk = u.ed = ''; return draw(); }
  if (a === 'ed') { u.ed = u.ed === line ? '' : line; u.pk = u.bk = ''; return draw(); }
  if (a === 'addline') { u.ed = u.ed === '__add' ? '' : '__add'; u.pk = u.bk = ''; return draw(); }
  if (a === 'pkx') { u.pk = u.bk = u.ed = ''; return draw(); }
  if (a === 'setjob') { pick(u.id, line, 'pid', b.getAttribute('data-pid') || ''); u.pk = ''; return draw(); }
  if (a === 'newjob') { var rec = getRec(u.id), l = rec && arr(rec.lines).filter(function(x){ return x.id === line; })[0], f = l ? effFields(l) : {};
    try { W._gcNewProjectFor({ id: 'SS-' + u.id + '-' + line, kind: 'supplier', sub: rec.supplier, vendor: rec.supplier, po: f.po, address: f.shipTo, desc: f.memo, memo: f.memo, amt: Math.abs(f.amount), date: f.date }, function(p){ if (p && p.id) { forgetJobs(); pick(u.id, line, 'pid', p.id); u.pk = ''; draw(); } }); } catch (x) { warn(x); } return; }
  if (a === 'setinv') { var r = pick(u.id, line, 'inv', b.getAttribute('data-inv')); u.bk = ''; Promise.resolve(r).then(function(){ draw(); }); return; }
  if (a === 'saveedit' || a === 'saveadd') {
    var box = b.closest('[data-ss-ed]'), vals = {}; [].forEach.call(box.querySelectorAll('[data-ss-e]'), function(i){ vals[i.getAttribute('data-ss-e')] = i.value; });
    if (a === 'saveadd') { var r2x = addLine(u.id, vals); Promise.resolve(r2x).then(function(x){ if (x && x.ok === false) return setMsg(x.error, true); u.ed = ''; draw(); }); return; }
    Promise.resolve(pick(u.id, line, 'edit', vals)).then(function(){ u.ed = ''; draw(); }); return;
  }
  if (a === 'rematch') { var rr = getRec(u.id); if (rr) { forgetJobs(); match(rr).then(function(){ draw(); setMsg('↻ Matched again — your own picks were kept.'); }); } return; }
  if (a === 'arch') { var r3 = getRec(u.id); if (r3) { archive(u.id, !summary(r3).archived); draw(); } return; }
  if (a === 'file') { var r4 = getRec(u.id); try { if (r4 && r4.file && W._gcOpenRef) W._gcOpenRef(r4.file.ref, r4.file.name); } catch (x) { warn(x); } return; }
  if (a === 'oldest') { var r5 = getRec(u.id), pf = u.payf[u.id] || {}, S5 = summary(r5); oldestFirstPick(u.id, pf.amount === '' || pf.amount == null ? S5.inc.total : r2(pf.amount)); return draw(); }
  if (a === 'pay') {
    var pf2 = u.payf[u.id] || {}, rec2 = getRec(u.id), S2 = summary(rec2); b.disabled = true; setMsg('💵 Paying…');
    return pay(u.id, { date: pf2.date, method: pf2.method, checkNo: pf2.checkNo, ref: pf2.method === 'check' ? '' : pf2.checkNo, paidFrom: pf2.paidFrom, note: pf2.note, amount: pf2.amount === '' || pf2.amount == null ? S2.inc.total : pf2.amount }).then(function(r){
      if (!UI) return;
      if (!r.ok) { b.disabled = false; return setMsg(r.error, true); }
      u.payf[u.id] = null; u.msg = '✓ Paid ' + money(r.payment.amount) + ' — ' + r.payment.lines.length + ' line' + (r.payment.lines.length === 1 ? '' : 's') + ' marked paid' + (r.newBills ? ', ' + r.newBills + ' new bill' + (r.newBills === 1 ? '' : 's') + ' on their jobs' : '') + (r.state === 'paid' ? ' · the statement is paid (archived).' : ' · the rest stays open.'); u.msgBad = false;
      toast('✓ Statement paid: ' + money(r.payment.amount)); later(draw, 300);
    });
  }
}

/* ═════════════════════════════ THE BUTTONS + "Paid on … statement" on the job's lines ═════════════════════════════ */
function mkBtn(id, cls){ var b = D.createElement('button'); b.type = 'button'; b.id = id; b.className = cls || ''; b.setAttribute('data-ss-open', '1'); b.setAttribute('data-gc-keep', '1'); b.setAttribute('data-gc-linked', '1'); b.textContent = '🧾 Supplier statement'; b.title = 'Enter a supplier\'s statement, match each line to its job and pay it at once'; return b; }
var MAP = { ref: null, eref: null, inv: {}, exp: {} };
function stampText(t){ return 'Paid on ' + s(t.supplier) + ' statement ' + (t.no ? '#' + t.no : '') + (t.date ? ' (' + t.date + ')' : '') + (t.checkNo ? ', check ' + t.checkNo : t.method ? ', ' + (METHOD[t.method] || t.method) : ''); }
function paint(){
  try {
    var ok = canUse();
    var tools = D.querySelector('#gck-root .gck-tools'), ab = D.getElementById('gc-ss-acct');
    if (ok && tools) { if (!ab) ab = mkBtn('gc-ss-acct', 'gck-btn'); var anchor = D.getElementById('gc-money-acct'); if (anchor && anchor.parentElement === tools) { if (anchor.nextSibling !== ab) tools.insertBefore(ab, anchor.nextSibling); } else if (ab.parentElement !== tools) tools.appendChild(ab); }
    else if (ab) ab.remove();
    [].forEach.call(D.querySelectorAll('.gc-lumpbar'), function(bar){ var have = bar.querySelector('[data-ss-open]'); if (ok && !have) { var b = mkBtn('', ''); bar.insertBefore(b, bar.firstChild); } else if (!ok && have) have.remove(); });
    if (UI && UI.el && !UI.el.isConnected && UI.view !== 'refused') mount();
    /* the job's Invoices / Expenses lines */
    var els = D.querySelectorAll('[data-apxd-line^="inv|"],[data-apxd-line^="exp|"]'); if (!els.length) return;
    var I = crm().invoices && crm().invoices.length ? crm().invoices : crm().invs, E = crm().expenses;
    if (MAP.ref !== I) { MAP.ref = I; MAP.inv = {}; arr(I).forEach(function(r){ if (r.supStmt) MAP.inv[s(r.id)] = r.supStmt; }); }
    if (MAP.eref !== E) { MAP.eref = E; MAP.exp = {}; arr(E).forEach(function(x){ if (x.supStmt) MAP.exp[s(x.id)] = x.supStmt; }); }
    [].forEach.call(els, function(sp){
      var v = s(sp.getAttribute('data-apxd-line')), k = v.slice(0, 3), id = v.slice(4), t = k === 'inv' ? MAP.inv[id] : MAP.exp[id];
      var host = sp.parentElement; if (!host) return; var have = host.querySelector('.gc-ss-chip');
      if (!t) { if (have) have.remove(); return; }
      var txt = '🧾 ' + stampText(t); if (have && have.textContent === txt) return;
      if (!have) { have = D.createElement('span'); have.className = 'gc-ss-chip'; have.setAttribute('data-gc-keep', '1'); host.appendChild(have); }
      have.textContent = txt; have.title = txt;
    });
  } catch (e) { warn(e); }
}
D.addEventListener('click', function(e){ var b = e.target && e.target.closest ? e.target.closest('[data-ss-open]') : null; if (!b) return; e.preventDefault(); e.stopPropagation(); open({}); }, true);
SIF.call(W, function(){ if (!D.hidden) paint(); }, 1500); later(paint, 900);
later(function(){ if (canUse()) refresh(); }, 8000);

W._gcSupStmt = { open: open, close: close, list: function(){ return LIST.slice(); }, get: getRec, read: read, match: function(id){ return match(getRec(id)); }, pick: pick, addLine: addLine, setSupplier: setSupplier, archive: archive,
  pay: pay, oldestFirst: oldestFirstPick, view: function(id){ var r = getRec(id); return r ? summary(r) : null; }, refresh: refresh, canUse: canUse, suppliers: suppliers, paint: paint, core: CORE, stampText: stampText,
  _t: { mergeRec: mergeRec, mergeAll: mergeAll, setList: function(l){ LIST = arr(l); forgetJobs(); }, jobX: jobX, forgetJobs: forgetJobs, state: function(){ return UI; } } };
try { console.log('[GC] 🧾 Supplier statements: read · match bills + jobs · pay at once — _gcSupStmt.open()'); } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
