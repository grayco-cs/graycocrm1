/* __GC_PATCH_STMTPDF__ — PDF STATEMENTS (CARDS AND BANKS), ONE REVIEW TABLE, DUPLICATES CAUGHT (owner 10/30)
   "I will put credit cards bank statements and quickbooks csv in CRM today for office to mess around with. Make sure all
    those buttons work for PDFs and pull the right data so I can match to jobs".
   1. A PDF STATEMENT IS READ BY ITSELF. 💳 Import card statement and 🏦 Import bank statement take the PDF the bank's website
      gives you (or its CSV, or pasted lines). pdf.js (the reader the CRM already uses for sub invoices) gives every word with
      its position; the words are put back into lines and columns (x positions), so the reader is not tied to one bank:
      a line that starts with a date and has an amount is a transaction; the section it is in (Payments / Purchases /
      Deposits / Checks / Withdrawals…) or the column its amount sits in (Credits | Charges, Withdrawals | Deposits,
      Debits | Credits) says which way the money went; a running Balance column is left out; a line under a merchant with no
      date and no amount is the rest of its description (two-line merchants); several checks on one line are split; a
      statement that runs over 3 pages is one list; MM/DD dates get the statement's year (Dec→Jan statements: December is
      last year). Summary, total, daily-balance and APR lines are not transactions. Pages are read one at a time with a
      pause in between, so a big statement never freezes the screen.
      A scanned PDF (a picture, no text) says so instead of importing garbage.
   2. ALWAYS A REVIEW TABLE before anything is saved: date, description, amount, category, suggested job (patch MONEY's rules:
      PO in the memo → your vendor rule → the open job at the address → the vendor's usual job), with the totals and the
      statement's OWN printed totals (previous → new balance, or beginning → ending balance) and a warning when they do not
      agree. Payments to the card, transfers to a card and bank deposits are listed (they are not costs) but not imported.
   3. DUPLICATES. A line already in the CRM (the same card / account, date and amount — from the CSV of the same statement, the
      same PDF twice, or typed in by hand) is marked "already in" and is not imported again.
   4. BANK STATEMENTS. Checks, withdrawals and debit-card buys become paid Expenses on their jobs (the check # kept);
      deposits are shown and can be checked against the CRM with the Monthly Bank Check — that part needs the cash records,
      which the office reaches only after docs/office-full-access.sql has run: until then the screen says "Ask Wesley to
      finish the database setup" instead of failing.
   5. ONE OBVIOUS DOOR. The older doors (Credit Card Entry paste box, 💳 Credit cards, Expenses → 📊 CC Statement → 📁 Upload
      Statement, the Expense Center's PDF drop, 🏦 Bank Accounts, Monthly Bank Check) say what they do and send a PDF / a
      whole statement to 💳 Import card statement or 🏦 Import bank statement.
   API: window._gcStmt = { readPdf(arrayBuffer) → result, parseLines(pages, mode), parseText(text, mode), openImport(o), canBank() } */
(function(){
'use strict';
if (window.__GC_PATCH_STMTPDF__) return; window.__GC_PATCH_STMTPDF__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function pause(){ return new Promise(function(r){ ST.call(W, r, 0); }); }   /* a yield between pages, not a timer */
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function r2(v){ return Math.round((+v || 0) * 100) / 100; }
function cents(v){ return Math.round(Math.abs(+v || 0) * 100); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(v){ var n = r2(v); return (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function nowIso(){ return new Date().toISOString(); }
function pad(n){ return ('0' + n).slice(-2); }
function todayYmd(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function crm(){ return W._crm || {}; }
function lsGet(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { W.localStorage.setItem(k, v); } catch (e) {} }
function hash(t){ var h = 5381; t = s(t); for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

/* ═════════════════════ 1. pdf.js → lines with positions ═════════════════════ */
var PDFJS = [
  ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'],
  ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'],
  ['https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js', 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js']
];
var pdfP = null;
/* the CRM keeps a small local text reader under the same name (window.pdfjsLib.__gcLocal: text only, no positions); the real
   library replaces it, and the local one is the fallback when the library cannot load */
function realLib(){ return W.pdfjsLib && !W.pdfjsLib.__gcLocal ? W.pdfjsLib : null; }
function ensurePdfJs(){
  if (realLib()) return Promise.resolve(realLib());
  if (pdfP) return pdfP;
  var local = W.pdfjsLib && W.pdfjsLib.__gcLocal ? W.pdfjsLib : null;
  pdfP = new Promise(function(res, rej){
    var at = 0;
    (function next(){
      if (realLib()) { res(realLib()); return; }
      if (at >= PDFJS.length) { pdfP = null; if (local) { if (!W.pdfjsLib) W.pdfjsLib = local; res(local); return; } rej(new Error('The PDF reader could not load (the network blocked it). Try again, or use the CSV from the bank.')); return; }
      var pair = PDFJS[at++], sc = D.createElement('script');
      sc.src = pair[0];
      sc.onload = function(){ var L = realLib(); if (!L) { next(); return; } try { L.GlobalWorkerOptions.workerSrc = pair[1]; } catch (e) {} res(L); };
      sc.onerror = next;
      D.head.appendChild(sc);
    })();
  });
  return pdfP;
}
/* pdf.js text items → lines (top to bottom) of cells (left to right) */
function linesOf(items, pageNo){
  var its = [];
  (items || []).forEach(function(it){
    var t = it && it.str; if (!t || !String(t).trim()) return;
    var tr = it.transform || [1, 0, 0, 1, 0, 0], fs = Math.abs(tr[3]) || Math.hypot(tr[2], tr[3]) || it.height || 10;
    var w = it.width || String(t).length * fs * 0.5;
    its.push({ x: tr[4], x2: tr[4] + w, y: tr[5], fs: fs, s: String(t) });
  });
  its.sort(function(a, b){ return (b.y - a.y) || (a.x - b.x); });
  var rows = [];
  its.forEach(function(it){
    var L = rows[rows.length - 1];
    if (L && Math.abs(L.y - it.y) <= Math.max(1.5, Math.min(L.fs, it.fs) * 0.45)) L.items.push(it); else rows.push({ y: it.y, fs: it.fs, items: [it] });
  });
  return rows.map(function(L){
    L.items.sort(function(a, b){ return a.x - b.x; });
    var cells = [];
    L.items.forEach(function(it){
      var c = cells[cells.length - 1], gap = c ? it.x - c.x2 : 1e9;
      if (c && gap < Math.max(it.fs, c.fs) * 0.8) { c.s += (gap > it.fs * 0.1 && !/\s$/.test(c.s) && !/^\s/.test(it.s) ? ' ' : '') + it.s; c.x2 = Math.max(c.x2, it.x2); }
      else cells.push({ x: it.x, x2: it.x2, fs: it.fs, s: it.s });
    });
    cells.forEach(function(c){ c.s = c.s.replace(/\s+/g, ' ').trim(); });
    return { page: pageNo, y: L.y, fs: L.fs, cells: cells.filter(function(c){ return c.s; }), text: cells.map(function(c){ return c.s; }).join('  ') };
  });
}
/* the whole PDF → { pages: [[line]], chars, n } — one page at a time, a pause in between */
function pdfLines(buf, progress){
  return ensurePdfJs().then(function(lib){
    var data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (lib.__gcLocal) {   /* offline: the CRM's local text reader — lines without positions */
      return lib.getDocument({ data: data.slice() }).promise.then(function(pdf){ return pdf.getPage(1); }).then(function(pg){ return pg.getTextContent(); }).then(function(tc){
        var t = (tc.items || []).map(function(x){ return s(x.str); }).join('\n'), d = textPages(t); d.chars = t.replace(/\s/g, '').length; d.local = true; return d;
      });
    }
    return lib.getDocument({ data: data, isEvalSupported: false }).promise.then(function(pdf){
      var out = { pages: [], chars: 0, n: pdf.numPages }, i = 0;
      function next(){
        if (++i > pdf.numPages) { try { pdf.destroy(); } catch (e) {} return out; }
        return pdf.getPage(i).then(function(pg){ return pg.getTextContent().then(function(tc){ try { pg.cleanup(); } catch (e) {} return tc; }); }).then(function(tc){
          var L = linesOf(tc.items, i); out.pages.push(L);
          L.forEach(function(l){ out.chars += l.text.replace(/\s/g, '').length; });
          try { if (progress) progress(i, pdf.numPages); } catch (e) {}
          return pause().then(next);
        });
      }
      return next();
    }, function(e){
      var m = s(e && (e.name + ' ' + e.message));
      if (/password/i.test(m)) throw new Error('This PDF has a password. Open it, print / save it as a PDF without the password, or download the CSV from the bank instead.');
      throw new Error('This file could not be opened as a PDF (' + s(e && e.message).slice(0, 80) + ').');
    });
  });
}
/* plain text (pasted lines) → the same line model: cells split by tabs / 2+ spaces, positions by order */
function textPages(text){
  var L = s(text).split(/\r?\n/).map(function(l, i){
    var parts = l.split(/\t|\s{2,}/).map(function(x){ return x.trim(); }).filter(Boolean);
    var x = 0, cells = parts.map(function(p, j){ var c = { x: x, x2: x + p.length * 5, fs: 10, s: p }; x += p.length * 5 + 40; return c; });
    return { page: 1, y: 10000 - i * 12, fs: 10, cells: cells, text: parts.join('  '), plain: true };
  }).filter(function(l){ return l.cells.length; });
  return { pages: [L], chars: s(text).length, n: 1 };
}

/* ═════════════════════ 2. lines → transactions (layout-tolerant) ═════════════════════ */
var MONS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
var MONRE = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
var DATE_SRC = '(?:\\d{1,2}[\\/\\-]\\d{1,2}(?:[\\/\\-](?:\\d{4}|\\d{2}))?|\\d{1,2}\\.\\d{1,2}\\.(?:\\d{4}|\\d{2})|' + MONRE + '\\s+\\d{1,2}(?:,?\\s+\\d{4})?|\\d{1,2}\\s+' + MONRE + '(?:\\s+\\d{4})?)';
var DATE_LEAD = new RegExp('^(' + DATE_SRC + ')\\*?(?=\\s|$)\\s*', 'i');
var DATE_ONLY = new RegExp('^' + DATE_SRC + '\\*?$', 'i');
var AMT_SRC = '[+=]?\\s?[-−–]?\\s?\\(?\\s?[-−–]?\\s?\\$?\\s?(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}\\s?\\)?(?:\\s?(?:CR|DR|-))?';
var AMT_ONLY = new RegExp('^' + AMT_SRC + '$', 'i');
var AMT_TRAIL = new RegExp('(?:^|\\s)(' + AMT_SRC + ')$', 'i');
var FULLDATE_RE = new RegExp('(\\d{1,2})[\\/\\-.](\\d{1,2})[\\/\\-.](\\d{4}|\\d{2})(?!\\d)|(' + MONRE + ')\\s+(\\d{1,2}),?\\s+(\\d{4})|(\\d{4})-(\\d{2})-(\\d{2})', 'gi');
function amtVal(t){
  var x = s(t), neg = /^[+=]?\s?[-−–]|\(|[-−–]\s?\$|CR$|-$/i.test(x);
  var n = parseFloat(x.replace(/CR$|DR$/i, '').replace(/[^0-9.]/g, ''));
  return { v: isFinite(n) ? n : 0, neg: neg && !/DR$/i.test(x) };
}
/* "12/16" "12/16/25" "Sep 18" "18 Sep" → { m, d, y|null } */
function dateParts(t){
  var x = s(t).replace(/\*$/, ''), m;
  if ((m = /^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/.exec(x))) return okd(+m[1], +m[2], m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null);
  if ((m = new RegExp('^(' + MONRE + ')\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?$', 'i').exec(x))) return okd(MONS[low(m[1]).replace(/\.$/, '').slice(0, 4) === 'sept' ? 'sept' : low(m[1]).slice(0, 3)], +m[2], m[3] ? +m[3] : null);
  if ((m = new RegExp('^(\\d{1,2})\\s+(' + MONRE + ')(?:\\s+(\\d{4}))?$', 'i').exec(x))) return okd(MONS[low(m[2]).slice(0, 3)], +m[1], m[3] ? +m[3] : null);
  return null;
}
function okd(mo, d, y){ return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? { m: mo, d: d, y: y } : null; }
function ymd(p){ return p.y + '-' + pad(p.m) + '-' + pad(p.d); }

var PAY_RE = /\b(payment\s*[-–,]?\s*thank\s*you|thank\s*you\s*(for\s*your\s*)?payment|autopay|auto\s*pay|online\s+payment|internet\s+payment|payment\s+received|mobile\s+payment|electronic\s+payment|pymt|ach\s+pmt|epayment)\b|^payment\b/i;
var TRANSFER_RE = /\b(transfer|xfer)\s+to\s+(?:[a-z0-9 ]*\b)?(card|credit|chk|checking|savings|sav|share)\b|\bcredit\s*card\b|\bcard\s+payment\b|\bcrd\s+(autopay|epay|pmt)\b|\bpayment\s+to\s+(chase|amex|american express|capital one|citi|discover|card)\b|\bepay(ment)?\b.*\b(chase|amex|capital one|citi|discover)\b|\bamex\s+epayment\b/i;
var CHECK_RE = /\b(?:check|chk|ck|share\s+draft)\s*(?:#|no\.?|number)?\s*(\d{3,7})\b/i;
var DEPOSIT_WORDS = /\b(deposit|credit|transfer\s+from|xfer\s+from|dividend|interest\s+(paid|payment)|refund|zelle\s+from|from\s+zelle|ach\s+credit|wire\s+(in|transfer\s+in)|reversal)\b/i;
var BAL_DESC = /^(beginning|ending|opening|closing|previous|new|daily|starting)\s+(daily\s+)?balance|^balance\s+(forward|brought|last|this)|^(total|subtotal)\b/i;
var NOISE = /^page\s+\d|\bpage\s+\d+\s+of\s+\d+|continued\b|^\*|^\^|indicates|^(total|subtotal)\b|balance\b|^member fdic|^www\.|^customer service|^questions\?/i;

function sectionOf(t, mode){
  var x = low(t).replace(/\(continued\)|continued/g, '').replace(/[:.]+$/, '').trim();
  if (!x || x.length > 70) return null;
  if (/^(daily (ending |ledger |account )?balances?|daily balance summary|balance summary|interest charges?\b|interest charge calculation|annual percentage|balance type|year[- ]to[- ]date|totals? year|your annual percentage)/.test(x)) return { dir: 'skip' };
  if (/^interest charged\b/.test(x)) return { dir: 'out', kind: 'interest' };
  if (/^(fees?( charged)?|service (fees?|charges?)|other fees)$/.test(x)) return { dir: 'out', kind: 'fee' };
  if (mode === 'bank') {
    if (/^(deposits?|deposits?\s*(&|and|,|\/)\s*(other\s+)?(credits?|additions)|deposits?,?\s+credits?\s+and\s+interest|credits?|additions|other credits|electronic (deposits|credits)|deposits and additions)\b/.test(x)) return { dir: 'in' };
    if (/^(checks?\s*(\/|&|and)\s*(other\s+)?debits?|withdrawals?|electronic withdrawals|atm\b|other (withdrawals|debits|subtractions)|debits?|card purchases|withdrawals?\s*(&|and|\/|,)\s*(other\s+)?debits?|other withdrawals|electronic payments|subtractions)\b/.test(x)) return { dir: 'out' };
    if (/^(checks?( paid| cleared)?|share drafts?|checks? and substitute checks)\b/.test(x)) return { dir: 'out', kind: 'check' };
    return null;
  }
  if (/^payments?$/.test(x)) return { dir: 'in', kind: 'payment' };
  if (/^(payments?\s*(,|and|&|\/)?\s*(other\s+)?credits?(\s*(,|and|&)\s*adjustments)?|credits?|other credits|returns?( and credits)?)\b/.test(x)) return { dir: 'in' };
  if (/^(purchases?|new charges|standard purchases|transactions|charges|purchases?\s*(,|and|&).*|other charges|cash advances?|balance transfers?)\b/.test(x)) return { dir: 'out' };
  return null;
}
function colKind(t){
  var x = low(t).replace(/\s+/g, ' ').replace(/[:.]$/, '');
  if ((/deposit|credit/.test(x) ? 1 : 0) + (/withdraw|debit/.test(x) ? 1 : 0) + (/balance/.test(x) ? 1 : 0) > 1) return '';   /* two headings run together */
  if (/balance/.test(x)) return 'bal';
  if (/^(deposits?|credits?|additions|deposits?\s*\/\s*credits?|deposits?\s*&\s*credits?|money in|payments?\s*(and|&|\/)\s*credits?)$/.test(x)) return 'in';
  if (/^(withdrawals?|debits?|charges|subtractions|withdrawals?\s*\/\s*debits?|checks?\s*\/\s*debits?|money out|purchases\s*\/\s*debits)$/.test(x)) return 'out';
  if (/amount/.test(x)) return 'amt';
  if (/^(check|checks|check\s*(no\.?|#|number)|chk\s*#?|ck\s*#?|serial( no\.?)?|draft( no\.?)?)$/.test(x)) return 'chk';
  if (/ref(erence)?\.?\s*(#|no\.?|number)|^ref$|account number/.test(x)) return 'ref';
  if (/category/.test(x)) return 'cat';
  if (/date|^trans\.?$|^post(ing)?$|^sale$|^posted$|^eff\.?$/.test(x)) return 'date';
  if (/description|merchant|details|payee|^transaction$|^purchases$|^activity$/.test(x)) return 'desc';
  return '';
}
/* split each cell into date / amount / text tokens (a cell may hold "12/16 THE HOME DEPOT" or "STAPLES 58.99") */
function tokens(line){
  var out = [];
  line.cells.forEach(function(c, ci){
    var t = c.s, lead = [], trail = [], m, guard = 0;
    while (out.length + lead.length < 3 && (m = DATE_LEAD.exec(t)) && dateParts(m[1]) && guard++ < 3) { lead.push({ k: 'date', s: m[1], x: c.x, x2: c.x2, ci: ci }); t = t.slice(m[0].length); }
    guard = 0;
    while (t && (m = AMT_TRAIL.exec(t)) && guard++ < 4) { trail.unshift({ k: 'amt', s: m[1].trim(), x: c.x, x2: c.x2, ci: ci }); t = t.slice(0, t.length - m[0].length).trim(); }
    if (lead.length && !t && !trail.length && lead.length === 1 && !DATE_ONLY.test(c.s)) { /* noop */ }
    out = out.concat(lead);
    if (t) out.push({ k: 'text', s: t, x: c.x, x2: c.x2, ci: ci });
    out = out.concat(trail);
  });
  /* a leading "09/15 HOME DEPOT" whose amount came in the same cell: the trailing amounts' x is the cell's right edge (good for columns) */
  return out;
}
function nearestCol(cols, tok){
  var best = null, bd = 1e9, cx = (tok.x + tok.x2) / 2;
  cols.forEach(function(c){ if (!/^(in|out|bal|amt)$/.test(c.kind)) return; var d = Math.min(Math.abs(tok.x2 - c.x2), Math.abs(cx - (c.x + c.x2) / 2)); if (d < bd) { bd = d; best = c; } });
  return bd < 140 ? best : null;
}
function colAt(cols, tok, kinds){
  var best = null, bd = 1e9;
  cols.forEach(function(c){ if (kinds.indexOf(c.kind) < 0) return; var d = Math.min(Math.abs(tok.x - c.x), Math.abs(tok.x2 - c.x2)); if (d < bd) { bd = d; best = c; } });
  return bd < 40 ? best : null;
}
/* the statement's period (for MM/DD years), last 4, bank name, printed totals */
function headerInfo(all){
  var info = { end: null, start: null, last4: '', bank: '', labels: {} };
  var cand = [];
  all.forEach(function(l, i){
    var t = l.text;
    if (/\bdue\b|minimum|payment due|late payment|grace/i.test(t)) return;
    if (!(/period|closing|statement|billing|through|thru|\bto\b|as of|cycle|open|dates?\b|-|–/i.test(t)) && i > 25) return;
    if (DATE_LEAD.test(l.cells[0] ? l.cells[0].s : '') && i > 12) return;   /* a transaction line */
    var m; FULLDATE_RE.lastIndex = 0;
    while ((m = FULLDATE_RE.exec(t))) {
      var p = null;
      if (m[1]) p = okd(+m[1], +m[2], m[3].length === 2 ? 2000 + +m[3] : +m[3]);
      else if (m[4]) p = okd(MONS[low(m[4]).slice(0, 3)], +m[5], +m[6]);
      else if (m[7]) p = okd(+m[8], +m[9], +m[7]);
      if (p && p.y >= 2000 && p.y <= 2100) cand.push({ p: p, kw: /period|closing|statement|billing|through|thru|cycle|open|as of/i.test(t), i: i });
    }
  });
  var kw = cand.filter(function(c){ return c.kw; }), use = kw.length ? kw : cand.filter(function(c){ return c.i < 30; });
  if (use.length) {
    use.sort(function(a, b){ return ymd(a.p).localeCompare(ymd(b.p)); });
    info.start = use[0].p; info.end = use[use.length - 1].p;
    if (ymd(info.start) === ymd(info.end)) info.start = null;
  }
  for (var i = 0; i < Math.min(all.length, 40); i++) {
    var t = all[i].text;
    if (!/(account|acct|card|ending|checking|savings|share|number)/i.test(t)) continue;
    if (/routing|phone|call|\bfax\b|customer service|1-8\d\d/i.test(t)) continue;
    var g = (t.match(/[0-9xX*•.\-]*\d{4}\b/g) || []).filter(function(z){ return !/^\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?$/.test(z) && !/\.\d{2}$/.test(z); });
    if (!g.length) continue;
    var dig = g[g.length - 1].replace(/\D/g, ''); if (dig.length >= 4) { info.last4 = dig.slice(-4); break; }
  }
  var head = all.slice(0, 12).map(function(l){ return l.text; }).join(' ');
  var BANKS = [[/bank of america/i, 'Bank of America'], [/\bchase\b/i, 'Chase'], [/american express|amex/i, 'Amex'], [/capital one/i, 'Capital One'], [/citi\b|citibank|citi business/i, 'Citi'], [/bank of america/i, 'Bank of America'], [/wells fargo/i, 'Wells Fargo'],
    [/discover/i, 'Discover'], [/u\.?s\.? bank/i, 'US Bank'], [/first horizon/i, 'First Horizon'], [/regions/i, 'Regions'], [/renasant/i, 'Renasant'], [/simmons/i, 'Simmons'], [/trustmark/i, 'Trustmark'],
    [/truist|suntrust|bb&t/i, 'Truist'], [/independent bank/i, 'Independent Bank'], [/orion/i, 'Orion FCU'], [/guaranty|bancorpsouth|cadence/i, 'Cadence'], [/navy federal/i, 'Navy Federal']];
  for (var k = 0; k < BANKS.length; k++) if (BANKS[k][0].test(head)) { info.bank = BANKS[k][1]; break; }
  return info;
}
function yearFor(p, info){
  if (p.y) return p;
  var end = info.end, y;
  if (end) {
    y = end.y;
    var cand = y + '-' + pad(p.m) + '-' + pad(p.d), endS = ymd(end);
    var slack = new Date(Date.parse(endS + 'T12:00:00Z') + 10 * 864e5).toISOString().slice(0, 10);
    if (cand > slack) y--;
  } else {
    var td = todayYmd(); y = +td.slice(0, 4);
    if (y + '-' + pad(p.m) + '-' + pad(p.d) > td) y--;
  }
  return { m: p.m, d: p.d, y: y };
}
function labelKind(lab, mode){
  var x = low(lab).replace(/[^a-z&\/, ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!x) return '';
  if (/^(your )?(previous|beginning|opening|starting|prior) (statement )?balance|^balance (last|previous) statement|^previous balance/.test(x)) return 'begin';
  if (/daily/.test(x)) return '';
  if (/^(your )?(new|ending|closing|current|statement) balance|^balance this statement|^new balance total/.test(x)) return 'end';
  return '';
}
/* pages → { rows, info, checks } */
function parseLines(doc, mode){
  mode = mode === 'bank' ? 'bank' : 'card';
  var all = []; (doc.pages || []).forEach(function(pg){ pg.forEach(function(l){ all.push(l); }); });
  var info = headerInfo(all);
  var rows = [], sec = null, cols = [], last = null, pend = null, prevLabels = null, printed = { begin: null, end: null, totals: [] };
  function finish(r){
    if (!r) return;
    r.desc = s(r.desc).replace(/\s+/g, ' ').replace(/[\s*^]+$/, '').trim();
    if (!(r.amount > 0) || !r.desc || BAL_DESC.test(r.desc)) return;
    rows.push(r);
  }
  function mk(l, p, desc, amts, extra){
    var o = Object.assign({ date: ymd(yearFor(p, info)), desc: desc, memo: '', page: l.page, y: l.y, fs: l.fs, descX: null, sec: sec }, extra || {});
    return o;
  }
  function decide(r, amtTok, colk){
    var a = amtVal(amtTok.s); r.amount = r2(a.v); r.neg = a.neg; r.colk = colk || '';
    var dir = '', src = '';
    if (colk === 'in' || colk === 'out') { dir = colk; src = 'column'; }
    else if (sec && (sec.dir === 'in' || sec.dir === 'out')) { dir = sec.dir; src = 'section'; if (a.neg && mode === 'card' && dir === 'out') dir = 'in'; }
    else if (a.neg) { dir = mode === 'card' ? 'in' : 'out'; src = 'sign'; }
    else if (mode === 'card') { dir = PAY_RE.test(r.desc) ? 'in' : 'out'; src = 'guess'; }
    else { dir = DEPOSIT_WORDS.test(r.desc) ? 'in' : 'out'; src = 'guess'; }
    r.dir = dir; r.dirSrc = src;
  }
  for (var i = 0; i < all.length; i++) {
    var l = all[i], tk = tokens(l), first = tk[0];
    if (!first) continue;
    var amts = tk.filter(function(t){ return t.k === 'amt'; }), texts = tk.filter(function(t){ return t.k === 'text'; });
    var lineTxt = texts.map(function(t){ return t.s; }).join(' ');
    /* a transaction: starts with a date (maybe two), has an amount */
    if (first.k === 'date') {
      var p = dateParts(first.s);
      var dates = tk.filter(function(t, j){ return t.k === 'date' && j < 3; });
      if (p && !(sec && sec.dir === 'skip')) {
        if (pend) { pend = null; }
        var descToks = [], checkNo = '', memo = [];
        texts.forEach(function(t, j){
          var c = cols.length ? colAt(cols, t, ['chk', 'ref', 'cat']) : null;
          if (/^\d{3,9}[*^]?$/.test(t.s) && ((c && c.kind === 'chk') || (sec && sec.kind === 'check' && j === 0 && !checkNo))) { checkNo = t.s.replace(/\D/g, ''); return; }
          if (c && c.kind === 'ref' && /^[0-9A-Z]{4,24}$/.test(t.s)) return;
          if (c && c.kind === 'cat' && descToks.length) { memo.push(t.s); return; }
          descToks.push(t.s);
        });
        var desc = descToks.join(' ').replace(/^[*^]\s*/, '');
        /* amounts: drop the running balance */
        var useA = amts.slice(), colk = '', balTok = null;
        if (cols.length) {
          var withCol = useA.map(function(a){ return { a: a, c: nearestCol(cols, a) }; });
          var nonBal = withCol.filter(function(w){ return !(w.c && w.c.kind === 'bal'); });
          var balW = withCol.filter(function(w){ return w.c && w.c.kind === 'bal'; });
          if (balW.length) balTok = balW[balW.length - 1].a;
          if (nonBal.length) { useA = nonBal.map(function(w){ return w.a; }); colk = nonBal[0].c ? nonBal[0].c.kind : ''; }
          else useA = [];
          if (!balTok && mode === 'bank' && useA.length >= 2 && !colk) { balTok = useA[useA.length - 1]; useA = useA.slice(0, -1); }
        } else if (useA.length >= 2) { if (mode === 'bank') balTok = useA[useA.length - 1]; useA = mode === 'bank' ? [useA[0]] : [useA[useA.length - 1]]; }
        if (!desc && checkNo) desc = 'Check ' + checkNo;
        if (/^(-|–|to|thru|through)\s/i.test(desc) && (new RegExp(DATE_SRC, 'i')).test(desc)) { last = null; pend = null; continue; }   /* "September 15 - October 14, 2026" is the period */
        if (!desc && !useA.length) continue;
        if (BAL_DESC.test(desc)) { last = null; continue; }
        if (!useA.length) { pend = mk(l, p, desc); pend.checkNo = checkNo; pend.memo = memo.join(' '); pend.descX = texts[0] ? texts[0].x : null; last = null; continue; }
        var r = mk(l, p, desc); r.checkNo = checkNo; r.memo = memo.join(' '); r.descX = texts[0] ? texts[0].x : null; r.dates = dates.length;
        if (balTok) { var bv = amtVal(balTok.s); r.bal = bv.neg ? -bv.v : bv.v; }
        decide(r, useA[useA.length > 1 && colk !== 'in' && colk !== 'out' ? (mode === 'bank' ? 0 : useA.length - 1) : 0], colk);
        finish(r); last = rows[rows.length - 1] === r ? r : null; continue;
      }
      if (sec && sec.dir === 'skip') continue;
    }
    /* several checks on one line: "1201 09/18 1,850.00   1202 09/25 600.00" */
    if (first.k === 'text' && /^\d{3,7}(\s*[*^])?(\s|$)/.test(first.s)) {
      var re = /(?:^|\s)(\d{3,7})\s*[*^]?\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(\$?[\d,]+\.\d{2})/g, m, got = 0, rest = l.text.replace(/\s+/g, ' ');
      while ((m = re.exec(rest))) {
        var pp = dateParts(m[2]); if (!pp) continue;
        var rc = mk(l, pp, 'Check ' + m[1]); rc.checkNo = m[1]; rc.amount = amtVal(m[3]).v; rc.dir = 'out'; rc.dirSrc = 'check'; rc.kindHint = 'check';
        finish(rc); got++;
      }
      if (got) { last = null; continue; }
    }
    /* the amount of a "date + description" line that came on the next line */
    if (pend && amts.length && first.k !== 'date' && (pend.page !== l.page || Math.abs(pend.y - l.y) > Math.max(pend.fs, l.fs) * 2.4 || labelKind(lineTxt, mode) || /balance|total|payment due|minimum|credit limit/i.test(lineTxt))) pend = null;
    if (pend && amts.length && first.k !== 'date') {
      var pr = pend; pend = null;
      if (lineTxt && !NOISE.test(lineTxt)) pr.desc += ' ' + lineTxt;
      var ua = amts, ck = '';
      if (cols.length) { var nb = amts.map(function(a){ return { a: a, c: nearestCol(cols, a) }; }).filter(function(w){ return !(w.c && w.c.kind === 'bal'); }); if (nb.length) { ua = nb.map(function(w){ return w.a; }); ck = nb[0].c ? nb[0].c.kind : ''; } }
      decide(pr, ua[0], ck); finish(pr); last = rows[rows.length - 1] === pr ? pr : null; continue;
    }
    /* a column header: Date | Description | Debits | Credits | Balance … */
    var kinds = l.cells.map(function(c){ return colKind(c.s); });
    if (!amts.length && kinds.filter(Boolean).length >= 2 && kinds.indexOf('date') >= 0 && (kinds.indexOf('amt') >= 0 || kinds.indexOf('in') >= 0 || kinds.indexOf('out') >= 0 || kinds.indexOf('desc') >= 0)) {
      cols = l.cells.map(function(c, j){ return { x: c.x, x2: c.x2, kind: kinds[j], s: c.s }; }).filter(function(c){ return c.kind; });
      if (sec && sec.dir === 'skip') sec = null;
      last = null; pend = null;
      var sc0 = sectionOf(l.cells[0].s, mode); if (sc0 && sc0.dir !== 'skip' && kinds[0] !== 'date') sec = sc0;
      continue;
    }
    /* a section heading */
    if (!amts.length) {
      var sc = sectionOf(l.cells[0].s, mode) || (l.cells.length <= 2 ? sectionOf(lineTxt, mode) : null);
      if (sc) {
        sec = sc; last = null; pend = null;
        if (l.cells.length >= 2 && kinds.filter(function(k){ return k === 'amt'; }).length) cols = l.cells.map(function(c, j){ return { x: c.x, x2: c.x2, kind: kinds[j] || '', s: c.s }; }).filter(function(c){ return c.kind; });
        continue;
      }
      /* the rest of the merchant on the next line */
      if (last && last.page === l.page && Math.abs(last.y - l.y) <= Math.max(last.fs, l.fs) * 2.4 && lineTxt && !NOISE.test(lineTxt) && lineTxt.length <= 60 &&
          (last.descX == null || Math.abs(l.cells[0].x - last.descX) <= 30 || (l.plain && true)) && !(last.extra >= 2)) {
        last.desc += ' ' + lineTxt; last.extra = (last.extra || 0) + 1; continue;
      }
      if (texts.length >= 2 && !amts.length) prevLabels = l; else prevLabels = null;
      last = null; continue;
    }
    /* a summary / total line: "Previous Balance $2,000.00", "TOTAL  741.10  2,207.00" */
    last = null;
    var lab = lineTxt;
    if (lab) {
      var lk = labelKind(lab, mode), v = amtVal(amts[amts.length - 1].s);
      if (lk === 'begin' && printed.begin == null) printed.begin = v.neg ? -v.v : v.v;
      else if (lk === 'end' && printed.end == null) printed.end = v.neg ? -v.v : v.v;
      else printed.totals.push({ label: lab, amounts: amts.map(function(a){ return amtVal(a.s).v; }), sec: sec });
    } else if (prevLabels && amts.length >= 2) {
      /* a summary box: labels on one line, the amounts under them */
      amts.forEach(function(a){
        var cx = (a.x + a.x2) / 2, best = null, bd = 1e9;
        prevLabels.cells.forEach(function(c){ var d = Math.abs(cx - (c.x + c.x2) / 2); var d2 = Math.abs(a.x - c.x); if (Math.min(d, d2) < bd) { bd = Math.min(d, d2); best = c; } });
        if (!best) return;
        var lk2 = labelKind(best.s, mode), v2 = amtVal(a.s);
        if (lk2 === 'begin' && printed.begin == null) printed.begin = v2.neg ? -v2.v : v2.v;
        else if (lk2 === 'end' && printed.end == null) printed.end = v2.neg ? -v2.v : v2.v;
        else printed.totals.push({ label: best.s, amounts: [v2.v], sec: null });
      });
      prevLabels = null;
    }
  }
  /* a running balance decides the side: previous balance ± the lines since = this balance (bank statements) */
  if (mode === 'bank') balanceMath(rows, printed.begin);
  /* a signed Amount column with no sections: plus = money in, minus = money out (bank); minus = credit (card) */
  var guessed = rows.filter(function(r){ return r.dirSrc === 'guess'; });
  if (mode === 'bank' && guessed.length && rows.some(function(r){ return r.neg && r.dirSrc === 'sign'; })) guessed.forEach(function(r){ r.dir = r.neg ? 'out' : 'in'; r.dirSrc = 'sign'; });
  /* kinds */
  rows.forEach(function(r){
    if (!r.checkNo) { var cm = CHECK_RE.exec(r.desc); if (cm && (mode === 'bank')) r.checkNo = cm[1]; }
    if (mode === 'card') {
      if (r.dir === 'in') r.kind = (PAY_RE.test(r.desc) || (r.sec && r.sec.kind === 'payment' && !/return|refund|credit|adj/i.test(r.desc))) ? 'payment' : 'refund';
      else r.kind = (r.sec && r.sec.kind === 'interest') || /\binterest charge/i.test(r.desc) ? 'interest' : ((r.sec && r.sec.kind === 'fee') || /\bfee\b/i.test(r.desc) ? 'fee' : 'charge');
    } else {
      if (r.dir === 'in') r.kind = 'deposit';
      else if (r.checkNo || r.kindHint === 'check' || /^(check|chk|ck|share draft)\b/i.test(r.desc)) r.kind = 'check';
      else if (TRANSFER_RE.test(r.desc)) r.kind = 'transfer';
      else r.kind = 'withdrawal';
    }
    r.signed = mode === 'card' ? (r.dir === 'out' ? r.amount : -r.amount) : (r.dir === 'in' ? r.amount : -r.amount);
    delete r.sec; delete r.y; delete r.fs; delete r.descX; delete r.extra; delete r.kindHint; delete r.bal;
  });
  return { rows: rows, info: info, printed: printed, check: checkTotals(rows, printed, mode), mode: mode };
}
function balanceMath(rows, begin){
  var prev = begin != null ? begin : null, grp = [];
  rows.forEach(function(r){
    grp.push(r);
    if (r.bal == null) return;
    if (prev != null && grp.length <= 12) {
      var want = Math.round((r.bal - prev) * 100), n = grp.length, cur = 0, hits = [];
      grp.forEach(function(g){ cur += (g.dir === 'in' ? 1 : -1) * Math.round(g.amount * 100); });
      if (cur !== want) {
        for (var m = 0; m < (1 << n) && hits.length < 2; m++) { var t = 0; for (var k = 0; k < n; k++) t += ((m >> k) & 1 ? 1 : -1) * Math.round(grp[k].amount * 100); if (t === want) hits.push(m); }
        if (hits.length === 1) grp.forEach(function(g, k){ var d = (hits[0] >> k) & 1 ? 'in' : 'out'; if (g.dir !== d && g.dirSrc !== 'check') { g.dir = d; g.dirSrc = 'balance'; } });
      }
    }
    prev = r.bal; grp = [];
  });
}
/* the statement's own numbers vs the lines read */
function checkTotals(rows, P, mode){
  var out = 0, inn = 0;
  rows.forEach(function(r){ if (r.dir === 'out') out += r.amount; else inn += r.amount; });
  out = r2(out); inn = r2(inn);
  var c = { out: out, in: inn, begin: P.begin, end: P.end, ok: null, diff: null, how: '' };
  if (P.begin != null && P.end != null) {
    var expect = r2(P.end - P.begin), got = mode === 'card' ? r2(out - inn) : r2(inn - out);
    c.expect = expect; c.got = got; c.diff = r2(got - expect); c.ok = Math.abs(c.diff) < 0.01;
    c.how = mode === 'card' ? 'previous balance ' + money(P.begin) + ' → new balance ' + money(P.end) : 'beginning balance ' + money(P.begin) + ' → ending balance ' + money(P.end);
  }
  return c;
}

/* ═════════════════════ 3. CSV / pasted text ═════════════════════ */
function csvRows(text){
  var rows = [], row = [], cur = '', q = false, t = s(text).replace(/^﻿/, '');
  var first = t.split('\n')[0], sep = first.split('\t').length > first.split(',').length ? '\t' : ',';
  for (var i = 0; i < t.length; i++) {
    var c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true; else if (c === sep) { row.push(cur.trim()); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur.trim()); cur = ''; if (row.some(function(x){ return x; })) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur.trim()); if (row.some(function(x){ return x; })) rows.push(row);
  return rows;
}
function looksCsv(text){
  var rows = csvRows(text);
  for (var i = 0; i < Math.min(rows.length, 12); i++) { var h = rows[i].map(low); if (h.length >= 3 && h.some(function(x){ return /date/.test(x); }) && h.some(function(x){ return /amount|debit|credit|charge|withdrawal|deposit/.test(x); })) return true; }
  return rows.length > 1 && rows[0].length >= 3 && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s(rows[0][0])) && /^-?\$?[\d,]+\.\d{2}$/.test(s(rows[0][1]));
}
/* a bank CSV: Date · Description · Amount (signed) or Debit / Credit (Withdrawal / Deposit) · Check # */
function parseBankCsv(text){
  var rows = csvRows(text), hi = -1, out = [];
  for (var i = 0; i < Math.min(rows.length, 12); i++) { var h = rows[i].map(low); if (h.some(function(x){ return /date/.test(x); }) && h.some(function(x){ return /amount|debit|credit|withdrawal|deposit/.test(x); })) { hi = i; break; } }
  if (hi < 0) return out;
  var head = rows[hi].map(low);
  function col(res){ for (var r = 0; r < res.length; r++) for (var j = 0; j < head.length; j++) if (res[r].test(head[j])) return j; return -1; }
  var di = col([/^(posting|post|transaction|trans\.?) date$/, /^date$/, /date/]), de = col([/^description$/, /^(payee|name|memo|details|transaction description)$/, /description|payee/]);
  var ai = col([/^amount$/, /amount/]), dbi = col([/^(debit|debits|withdrawal|withdrawals|withdrawal amount|debit amount)$/]), cri = col([/^(credit|credits|deposit|deposits|deposit amount|credit amount)$/]);
  var ci = col([/check|slip|serial/]), ti = col([/^(type|transaction type|details)$/]);
  rows.slice(hi + 1).forEach(function(r){
    var p = dateParts(s(r[di]).replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$2/$3/$1'));
    if (!p) return;
    var desc = s(r[de >= 0 ? de : 1]), amt = 0, dir = '';
    if (dbi >= 0 || cri >= 0) { var db = dbi >= 0 ? amtVal(r[dbi]).v : 0, cr = cri >= 0 ? amtVal(r[cri]).v : 0; if (db > 0) { amt = db; dir = 'out'; } else if (cr > 0) { amt = cr; dir = 'in'; } }
    else if (ai >= 0) { var a = amtVal(r[ai]); amt = a.v; dir = a.neg ? 'out' : 'in'; if (ti >= 0 && /debit|withdraw|check|fee/i.test(r[ti])) dir = 'out'; if (ti >= 0 && /credit|deposit/i.test(r[ti])) dir = 'in'; }
    if (!(amt > 0)) return;
    var ck = ci >= 0 ? s(r[ci]).replace(/\D/g, '') : '';
    var o = { date: ymd(yearFor(p, { end: null })), desc: desc, memo: '', amount: r2(amt), dir: dir, checkNo: ck };
    if (dir === 'in') o.kind = 'deposit'; else if (ck || /^(check|chk)\b/i.test(desc)) o.kind = 'check'; else if (TRANSFER_RE.test(desc)) o.kind = 'transfer'; else o.kind = 'withdrawal';
    if (!o.checkNo) { var cm = CHECK_RE.exec(desc); if (cm) o.checkNo = cm[1]; }
    o.signed = dir === 'in' ? o.amount : -o.amount;
    out.push(o);
  });
  return out;
}
/* text (CSV or pasted lines) → the same result shape as a PDF */
function parseText(text, mode){
  mode = mode === 'bank' ? 'bank' : 'card';
  var t = s(text);
  if (!t) return { rows: [], info: {}, printed: {}, check: {}, mode: mode, format: '' };
  if (looksCsv(t)) {
    if (mode === 'bank') return { rows: parseBankCsv(t), info: {}, printed: {}, check: {}, mode: mode, format: 'CSV' };
    var P = W._gcMoney && W._gcMoney.parseStatement ? W._gcMoney.parseStatement(t) : { rows: [], format: '' };
    var rows = arr(P.rows).map(function(x){
      var dir = x.credit ? 'in' : 'out', kind = dir === 'in' ? (x.payment ? 'payment' : 'refund') : (/\binterest charge/i.test(x.desc) ? 'interest' : (/\bfee\b/i.test(x.desc) ? 'fee' : 'charge'));
      return { date: x.date, desc: x.desc, memo: x.memo || '', amount: r2(x.amount), dir: dir, kind: kind, signed: dir === 'out' ? r2(x.amount) : -r2(x.amount) };
    });
    return { rows: rows, info: {}, printed: {}, check: {}, mode: mode, format: P.format || 'CSV', skipped: P.skipped };
  }
  var res = parseLines(textPages(t), mode); res.format = 'statement lines';
  return res;
}
/* a PDF → result; a picture-only PDF → { error: 'image' } */
function readPdf(buf, progress){
  return pdfLines(buf, progress).then(function(doc){
    if (doc.chars < 25 * Math.max(1, Math.min(doc.n, 2)) && doc.chars < 60) return { error: 'image', pages: doc.n, rows: [] };
    return { doc: doc, pages: doc.n };
  });
}
function parsePdfDoc(doc, mode){ var r = parseLines(doc, mode); r.format = 'PDF statement (' + doc.n + ' page' + (doc.n === 1 ? '' : 's') + ')'; r.pages = doc.n; return r; }
var IMG_MSG = 'This PDF is a picture, not text — download the CSV from the bank website, or paste the lines.';

/* ═════════════════════ 4. who may do the bank-records part ═════════════════════ */
function me(){ try { if (typeof W._gcMeUser === 'function') { var u = W._gcMeUser(); if (u) return u; } } catch (e) {} return {}; }
function isAdminNow(){ try { if (typeof W.__gcAuthIsAdmin === 'function') return !!W.__gcAuthIsAdmin(); } catch (e) {} return s(me().role) === 'Admin'; }
function officeVault(){
  try { var a = JSON.parse(lsGet('gc_sec2_access') || 'null'); var em = low((W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()) || me().email); return !!(a && a.office === true && (!em || low(a.email) === em)); } catch (e) { return false; }
}
function canBank(){ return isAdminNow() || officeVault(); }
var SQL_MSG = 'The bank balances and the Monthly Bank Check need the database setup that lets the office see the cash records. Ask Wesley to finish the database setup (docs/office-full-access.sql in Supabase). Until then you can still import a bank statement\'s checks and withdrawals as expenses here.';

/* ═════════════════════ 5. duplicates ═════════════════════ */
function vk(v){ try { return W._gcMoney && W._gcMoney.vendorKey ? W._gcMoney.vendorKey(v) : low(v).split(' ').slice(0, 2).join(' '); } catch (e) { return ''; } }
function expList(){ return arr(crm().expenses).filter(function(e){ return !e.deleted && !/^(void|deleted|rejected|denied)$/i.test(s(e.status)); }); }
function dayDiff(a, b){ var x = Date.parse(s(a).slice(0, 10) + 'T12:00:00Z'), y = Date.parse(s(b).slice(0, 10) + 'T12:00:00Z'); return isFinite(x) && isFinite(y) ? Math.abs(x - y) / 864e5 : 99; }
function stmtKey(acct, r){ return low(acct) + '|' + r.date + '|' + cents(r.amount) + '|' + r.dir + '|' + (r.checkNo || vk(r.desc)); }
function findDup(r, mode, acct){
  var L = expList(), c = cents(r.amount), key = stmtKey(acct.key, r);
  return L.filter(function(e){
    if (e.stmtKey && e.stmtKey === key) return true;
    var ea = e.amt != null && e.amt !== '' ? e.amt : e.amount;
    if (cents(ea) !== c) return false;
    if (mode === 'card') {
      if ((+ea < 0) !== (r.kind === 'refund')) return false;
      if (s(e.date).slice(0, 10) !== r.date) return false;
      if (acct.cardId && e.cardId && s(e.cardId) !== s(acct.cardId)) return false;
      var cardish = !!e.cardId || /card/i.test(s(e.payMethod) + ' ' + s(e.method) + ' ' + s(e.source) + ' ' + s(e.by));
      return cardish || vk(e.vendor || e.payee || e.desc) === vk(r.desc);
    }
    if (dayDiff(e.date, r.date) > 3) return false;
    if (r.checkNo && (s(e.checkNo) === r.checkNo || s(e.ref) === r.checkNo || s(e.checkNum) === r.checkNo)) return true;
    if (e.bankAcct && acct.key && low(e.bankAcct) !== low(acct.key)) return false;
    return dayDiff(e.date, r.date) < 1 && (vk(e.vendor || e.payee || e.desc) === vk(r.desc) || !!e.bankAcct);
  })[0] || null;
}

/* ═════════════════════ 6. the import window (card + bank) ═════════════════════ */
var CATS = ['Materials', 'Equipment Rental', 'Fuel/Gas', 'Subcontractor', 'Permits/Fees', 'Dumpster/Disposal', 'Advertising/Marketing', 'Software/Phone', 'Office Supplies', 'Meals', 'Travel', 'Insurance', 'Tools', 'Vehicle', 'Bank/Card Fees', 'Interest', 'Payroll', 'Rent/Lease', 'Utilities', 'Misc'];
function M(){ return W._gcMoney || {}; }
function projects(){ return arr(crm().projects).filter(function(p){ return !p.deleted; }); }
function proj(pid){ return projects().filter(function(p){ return s(p.id) === s(pid); })[0] || null; }
function openJob(p){ return p && !p.deleted && !/^(completed?|closed|lost|dead|cancel+ed|archived|declined|bidding|estimating)$/i.test(s(p.status)); }
function poOf(p){ return s(p.autoPO || p.po).toUpperCase(); }
var JOC = { at: 0, html: '' };
function jobOpts(sel){
  /* the open jobs' options are built once per table (a statement can have hundreds of lines) */
  if (Date.now() - JOC.at > 2000) { JOC.html = projects().filter(openJob).map(function(p){ return '<option value="' + esc(p.id) + '">' + esc((poOf(p) ? 'PO ' + poOf(p) + ' · ' : '') + s(p.name) + (p.address ? ' · ' + s(p.address) : '')) + '</option>'; }).join(''); JOC.at = Date.now(); }
  var list = sel && sel !== '__oh' ? JOC.html.replace('<option value="' + esc(sel) + '">', '<option value="' + esc(sel) + '" selected>') : JOC.html;
  return '<option value="">— pick the job —</option><option value="__oh"' + (sel === '__oh' ? ' selected' : '') + '>Overhead — no job</option><optgroup label="Open jobs">' + list + '</optgroup>';
}
function importable(r, mode){ return mode === 'card' ? /^(charge|refund|fee|interest)$/.test(r.kind) : (r.dir === 'out' && r.kind !== 'transfer'); }
function myName(){ var u = me(); return s(u.name) || s(u.email).split('@')[0] || 'office'; }
function bankNames(){ try { return JSON.parse(lsGet('gc_stmt_bank_accts') || '[]') || []; } catch (e) { return []; } }
function rememberBank(n){ n = s(n); if (!n) return; var l = bankNames().filter(function(x){ return x !== n; }); l.unshift(n); lsSet('gc_stmt_bank_accts', JSON.stringify(l.slice(0, 12))); }

/* add expenses the way the card code does (the list the job costs read, the screen, this computer's store) — never a stale copy */
function addExpenses(add){
  var cur = Array.isArray(crm().expenses) && crm().expenses.length ? crm().expenses.slice() : null;
  return (cur ? Promise.resolve(cur) : Promise.resolve(W.idbGet ? W.idbGet('expenses') : []).then(function(v){ return Array.isArray(v) ? v.slice() : []; }, function(){ return []; })).then(function(l){
    var have = {}; l.forEach(function(x){ if (x) have[s(x.id)] = 1; });
    var n = add.filter(function(x){ return !have[x.id]; }); l = l.concat(n);
    try { if (W._crm) W._crm.expenses = l; } catch (e) {}
    try { W.__GC_MANUAL_SAVE__ = true; if (typeof W._setExpenses === 'function') W._setExpenses(l); } catch (e) {}
    return Promise.resolve(W.idbSet ? W.idbSet('expenses', l) : null).then(null, function(){}).then(function(){
      ST.call(W, function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1200);
      try { if (W._gcPushAll) ST.call(W, function(){ W._gcPushAll(); }, 900); } catch (e) {}
      return n.length;
    });
  });
}
var LAST = { res: null };
function openImport(o){
  o = o || {};
  var mode = o.mode === 'bank' ? 'bank' : 'card';
  var old = D.querySelector('.gc-money-imp'); if (old) old.remove();
  try { if (M().loadRules) M().loadRules(); } catch (e) {}
  var ov = D.createElement('div'); ov.className = 'gc-money-imp'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gc-linked', '1'); ov.setAttribute('data-mode', mode);
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.6);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:inherit';
  var card = mode === 'card';
  ov.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:12px;width:min(1080px,100%);padding:18px;margin-top:12px">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="font-size:17px">' + (card ? '💳 Import card statement' : '🏦 Import bank statement') + '</b>' +
    '<span style="display:flex;gap:8px;align-items:center"><button type="button" data-c="mode" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:12.5px">' + (card ? '🏦 It is a bank statement' : '💳 It is a card statement') + '</button>' +
    '<button type="button" data-c="x" aria-label="Close" style="border:none;background:none;font-size:20px;cursor:pointer">✕</button></span></div>' +
    '<div style="font-size:12.5px;color:#475569;margin:4px 0 10px">' + (card ?
      'Choose the statement the bank\'s website gives you — the <b>PDF</b> or the <b>CSV</b> download (Chase, Amex, Capital One, Citi, Bank of America, Wells Fargo, Discover, US Bank and most others) — or paste its lines. You see every line first: the charges get a category and a job (change any), payments to the card are listed but left out, and a line already in the CRM is marked and not added twice.'
      : 'Choose the bank statement — the <b>PDF</b> or the <b>CSV</b> download (First Horizon, Regions, Renasant, Simmons, Trustmark, Truist, Independent Bank, Orion, Chase, Wells Fargo, Bank of America and most others) — or paste its lines. Checks, withdrawals and debit-card buys become paid expenses on their jobs (check # kept); deposits are listed for checking; payments to a credit card are left out (that card\'s statement brings its charges). A line already in the CRM is not added twice.') + '</div>' +
    (o.note ? '<div data-c="note" style="font-size:12.5px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:8px 10px;margin:0 0 10px">' + esc(o.note) + '</div>' : '') +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
      (card ? '<label style="font-size:13px">Card<select data-c="card" style="display:block;padding:7px;min-width:220px"><option value="">Loading…</option></select></label>' +
              '<label style="font-size:13px">New card name<input data-c="newcard" placeholder="e.g. Chase Ink 1234" style="display:block;padding:7px"></label>'
            : '<label style="font-size:13px">Bank account<input data-c="acct" list="gc-stmt-accts" placeholder="e.g. First Horizon checking 8832" style="display:block;padding:7px;min-width:260px"><datalist id="gc-stmt-accts">' + bankNames().map(function(n){ return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></label>') +
      '<label style="font-size:13px">Statement file (PDF or CSV)<input data-c="file" type="file" accept=".pdf,application/pdf,.csv,.txt,.tsv,text/csv,text/plain" style="display:block;padding:4px"></label></div>' +
    '<textarea data-c="paste" placeholder="…or paste the CSV / the statement lines here" style="width:100%;min-height:70px;margin-top:8px;padding:8px;font-family:monospace;font-size:12px;box-sizing:border-box"></textarea>' +
    '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap"><button type="button" data-c="read" style="padding:8px 14px;border:none;border-radius:8px;background:#1d4ed8;color:#fff;font-weight:700;cursor:pointer">Read the statement →</button><span data-c="msg" style="font-size:12.5px;align-self:center"></span></div>' +
    '<div data-c="prev" style="margin-top:10px;overflow-x:auto"></div></div>';
  D.body.appendChild(ov);
  function q(n){ return ov.querySelector('[data-c="' + n + '"]'); }
  var cards = [], rows = [], res = null, pdfDoc = null, fileName = '', busy = false;
  var cardsP = Promise.resolve(card && W._gcCards ? W._gcCards() : []).then(function(c){
    cards = arr(c).filter(function(x){ return x.active !== false; });
    if (card && q('card')) q('card').innerHTML = (cards.length ? '' : '<option value="">— no cards yet: type a new card name →</option>') + cards.map(function(c){ return '<option value="' + esc(c.id) + '">' + esc(c.name || c.issuer || 'Card') + '</option>'; }).join('');
    return cards;
  }, function(){ return []; });
  function acct(){
    if (card) { var cid = s(q('card') && q('card').value), c = cards.filter(function(x){ return s(x.id) === cid; })[0]; var nc = s(q('newcard') && q('newcard').value); return { key: nc ? 'new:' + low(nc) : (c ? 'card:' + c.id : ''), cardId: nc ? '' : (c ? c.id : ''), name: nc || (c && c.name) || '' }; }
    var a = s(q('acct') && q('acct').value); return { key: a ? 'bank:' + low(a) : 'bank:', name: a };
  }
  function msg(t, bad){ var m = q('msg'); if (m) { m.textContent = t; m.style.color = bad ? '#b91c1c' : '#334155'; } }
  function fill(r){
    var dirOut = r.dir === 'out';
    var sg = { pid: '', how: '', why: '' }, c = { category: 'Misc', why: '' };
    try { if (M().suggest) sg = M().suggest({ vendor: r.desc, memo: s(r.memo) + ' ' + s(r.desc), desc: r.desc }) || sg; } catch (e) {}
    try { if (M().catFor) c = M().catFor(r.desc, r.memo) || c; } catch (e) {}
    if (r.kind === 'interest') c = { category: 'Interest', why: 'interest charge' };
    if (r.kind === 'fee' && (c.category === 'Misc' || !c.category)) c = { category: 'Bank/Card Fees', why: 'a fee' };
    if (r.kind === 'check' && c.category === 'Misc') c = { category: 'Subcontractor', why: 'a check (change it if it was not a sub)' };
    var ov2 = (r.kind === 'interest' || (r.kind === 'fee' && mode === 'card')) && !sg.pid;
    return Object.assign(r, { on: importable(r, mode) && !r.dup, vendor: r.desc, category: c.category, pid: sg.pid || '', overhead: !!sg.overhead || ov2, how: sg.how || (ov2 ? 'kind' : ''),
      why: [sg.why, c.why ? 'category: ' + c.why : ''].filter(Boolean).join(' · '), dirOut: dirOut });
  }
  function useResult(r0){
    res = r0; LAST.res = r0;
    var a = acct();
    /* the statement's card / account */
    if (card && r0.info && r0.info.last4 && !s(q('newcard').value)) {
      var hit = cards.filter(function(c){ return s(c.last4) === r0.info.last4 || new RegExp(r0.info.last4 + '\\D*$').test(s(c.name)); })[0];
      if (hit) q('card').value = hit.id; else q('newcard').value = (r0.info.bank || 'Card') + ' ' + r0.info.last4;
      a = acct();
    }
    if (!card && r0.info && !s(q('acct').value) && (r0.info.bank || r0.info.last4)) { q('acct').value = (r0.info.bank || 'Bank') + (r0.info.last4 ? ' ••' + r0.info.last4 : ''); a = acct(); }
    rows = arr(r0.rows).map(function(r){ var d = findDup(r, mode, a); r.dup = d ? (s(d.id) || 'yes') : ''; return fill(r); });
    var hint = '';
    if (r0.info && r0.info.bank) hint = ' ' + r0.info.bank + (r0.info.last4 ? ' ••' + r0.info.last4 : '') + '.';
    var looksOther = mode === 'card' ? rows.some(function(r){ return r.kind === 'refund'; }) && rows.filter(function(r){ return r.dir === 'in'; }).length > rows.length * 0.6 : false;
    msg(rows.length ? 'Read ' + rows.length + ' lines (' + (r0.format || '') + ').' + hint + (r0.skipped ? ' ' + r0.skipped + ' lines skipped (no date / amount).' : '') + (looksOther ? ' Most lines are money IN — is this a bank statement? Use "🏦 It is a bank statement".' : '')
      : 'No transactions found — is it the statement (PDF or CSV download), or its lines?', !rows.length);
    draw();
  }
  function totalsBlock(){
    var imp = rows.filter(function(r){ return importable(r, mode); }), other = rows.filter(function(r){ return !importable(r, mode); });
    var sum = function(L, f){ return r2(L.filter(f || function(){ return true; }).reduce(function(x, r){ return x + r.amount; }, 0)); };
    var h = '<div data-c="totals" style="margin-top:10px;padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;line-height:1.7">';
    if (card) {
      h += '<b>Lines read:</b> ' + imp.filter(function(r){ return r.kind === 'charge'; }).length + ' charges ' + money(sum(imp, function(r){ return r.kind === 'charge'; })) +
        (sum(imp, function(r){ return r.kind === 'fee' || r.kind === 'interest'; }) ? ' · fees &amp; interest ' + money(sum(imp, function(r){ return r.kind === 'fee' || r.kind === 'interest'; })) : '') +
        ' · refunds / credits ' + money(-sum(imp, function(r){ return r.kind === 'refund'; })) + ' · payments ' + money(-sum(other, function(r){ return r.kind === 'payment'; })) + ' (left out)';
    } else {
      h += '<b>Lines read:</b> deposits ' + money(sum(rows, function(r){ return r.dir === 'in'; })) + ' · checks ' + money(-sum(rows, function(r){ return r.kind === 'check'; })) +
        ' · withdrawals ' + money(-sum(rows, function(r){ return r.kind === 'withdrawal'; })) + (sum(rows, function(r){ return r.kind === 'transfer'; }) ? ' · card payments / transfers ' + money(-sum(rows, function(r){ return r.kind === 'transfer'; })) + ' (left out)' : '');
    }
    var c = res && res.check || {};
    if (c.ok === true) h += '<div data-c="stmtok" style="color:#15803d;font-weight:700">✓ Matches the statement: ' + esc(c.how) + ' (change ' + money(c.expect) + ').</div>';
    else if (c.ok === false) h += '<div data-c="stmtwarn" style="color:#b91c1c;font-weight:700">⚠ Does NOT match the statement: ' + esc(c.how) + ' is a change of ' + money(c.expect) + ', the lines read add up to ' + money(c.got) + ' (off by ' + money(Math.abs(c.diff)) + '). A line may be missing or read wrong — compare with the statement before you import, or use the bank\'s CSV.</div>';
    else if (res && res.format && /PDF|lines/.test(res.format)) h += '<div style="color:#92400e">No printed balance found on the statement — compare these totals with the statement\'s own totals.</div>';
    var nd = rows.filter(function(r){ return r.dup; }).length;
    if (nd) h += '<div data-c="dupnote" style="color:#92400e">' + (nd === rows.filter(function(r){ return importable(r, mode); }).length && nd ? '⚠ Every line is already in the CRM — this statement was imported before. ' : '') + nd + ' line(s) already in the CRM (same ' + (card ? 'card' : 'account') + ', date and amount) are not ticked and will not be added again.</div>';
    return h + '</div>';
  }
  function draw(){
    var catOpts = function(cur){ return CATS.concat(CATS.indexOf(cur) < 0 && cur ? [cur] : []).map(function(c){ return '<option' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join(''); };
    var imp = [], oth = [];
    rows.forEach(function(r, i){ (importable(r, mode) ? imp : oth).push(i); });
    var KL = { charge: 'Charge', refund: 'Refund', fee: 'Fee', interest: 'Interest', payment: 'Payment', deposit: 'Deposit', check: 'Check', withdrawal: 'Withdrawal', transfer: 'Card payment / transfer' };
    var amtTxt = function(r){ return money(r.signed != null ? r.signed : r.amount); };
    q('prev').innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><tr style="text-align:left;background:#f1f5f9"><th style="padding:5px"><input type="checkbox" data-c="all" checked></th><th>Date</th><th>Description</th><th style="text-align:right">Amount</th><th>Category</th><th>Job</th><th>Why</th><th>Type</th></tr>' +
      imp.map(function(i){ var r = rows[i];
        return '<tr data-r="' + i + '" style="border-top:1px solid #e2e8f0' + (r.dup ? ';background:#fff7ed' : '') + '"><td style="padding:4px"><input type="checkbox" data-c="on"' + (r.on ? ' checked' : '') + '></td><td style="white-space:nowrap">' + esc(r.date) + '</td><td>' + esc(r.desc) +
          (r.checkNo ? ' <span style="color:#475569">(check #' + esc(r.checkNo) + ')</span>' : '') + (r.memo ? '<div style="color:#64748b">' + esc(r.memo) + '</div>' : '') + (r.dup ? '<div data-c="dup" style="color:#b45309;font-weight:700">already in the CRM — not added again</div>' : '') + '</td>' +
          '<td style="text-align:right;white-space:nowrap' + ((r.signed || 0) < 0 ? ';color:#b91c1c' : '') + '">' + amtTxt(r) + '</td>' +
          '<td><select data-c="cat" style="padding:4px;max-width:150px">' + catOpts(r.category) + '</select></td>' +
          '<td><select data-c="job" style="padding:4px;max-width:240px">' + jobOpts(r.overhead && !r.pid ? '__oh' : r.pid) + '</select></td><td style="color:#475569;font-size:11.5px">' + esc(r.why) + '</td><td style="font-size:11.5px">' + esc(KL[r.kind] || r.kind) + '</td></tr>'; }).join('') + '</table>' +
      (oth.length ? '<div style="margin-top:10px;font-weight:700;font-size:13px">' + (card ? 'Payments to the card (not costs — left out)' : 'Money in and card payments / transfers (not costs — left out)') + '</div><table data-c="other" style="width:100%;border-collapse:collapse;font-size:12.5px">' +
        oth.map(function(i){ var r = rows[i]; return '<tr data-x="' + i + '" style="border-top:1px solid #e2e8f0;color:#475569"><td style="padding:4px;white-space:nowrap">' + esc(r.date) + '</td><td>' + esc(r.desc) + (r.dup ? ' <span style="color:#b45309">(already in)</span>' : '') + '</td><td style="text-align:right;white-space:nowrap">' + amtTxt(r) + '</td><td style="font-size:11.5px">' + esc(KL[r.kind] || r.kind) + '</td></tr>'; }).join('') + '</table>' : '') +
      totalsBlock() +
      '<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><b data-c="sum">' + imp.filter(function(i){ return rows[i].on; }).length + ' ticked · ' + money(imp.filter(function(i){ return rows[i].on; }).reduce(function(x, i){ return x + (rows[i].dir === 'out' ? rows[i].amount : -rows[i].amount); }, 0)) + '</b>' +
      (!card ? '<button type="button" data-c="recon" style="padding:8px 12px;border:1px solid #1d4ed8;border-radius:8px;background:#fff;color:#1d4ed8;font-weight:700;cursor:pointer">🧾 Check these lines against the CRM (Monthly Bank Check)</button>' : '') +
      '<button type="button" data-c="go" style="margin-left:auto;padding:9px 16px;border:none;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">Import ' + imp.filter(function(i){ return rows[i].on; }).length + (card ? ' charges' : ' costs') + '</button></div><div data-c="reconmsg" style="font-size:12.5px;margin-top:6px"></div>';
  }
  function readPdfFile(f){
    busy = true; msg('Reading the PDF…');
    return (f.arrayBuffer ? f.arrayBuffer() : new Promise(function(res2){ var fr = new FileReader(); fr.onload = function(){ res2(fr.result); }; fr.readAsArrayBuffer(f); })).then(function(buf){
      return readPdf(buf, function(i, n){ msg('Reading the PDF… page ' + i + ' of ' + n); });
    }).then(function(x){
      busy = false;
      if (x.error === 'image') { pdfDoc = null; rows = []; res = null; q('prev').innerHTML = '<div data-c="image" style="padding:12px;border-radius:10px;background:#fef2f2;color:#991b1b;font-weight:700">' + esc(IMG_MSG) + '</div>'; msg(''); return; }
      pdfDoc = x.doc; return cardsP.then(function(){ return Promise.resolve(M().loadRules ? M().loadRules() : null); }).then(function(){ useResult(parsePdfDoc(pdfDoc, mode)); });
    }).catch(function(e){ busy = false; msg(s(e && e.message) || 'Could not read that PDF.', true); });
  }
  function takeFile(f){
    if (!f) return;
    fileName = s(f.name);
    if (/pdf/i.test(s(f.type)) || /\.pdf$/i.test(fileName)) { q('paste').value = ''; return readPdfFile(f); }
    pdfDoc = null;
    var fr = new FileReader(); fr.onload = function(){ var t = String(fr.result || ''); if (/^%PDF/.test(t)) { readPdfFile(f); return; } q('paste').value = t; cardsP.then(function(){ return Promise.resolve(M().loadRules ? M().loadRules() : null); }).then(function(){ useResult(parseText(t, mode)); }); }; fr.readAsText(f);
  }
  ov.addEventListener('change', function(ev){
    var t = ev.target;
    if (t === q('file') && t.files && t.files[0]) { takeFile(t.files[0]); return; }
    if ((t === q('card') || t === q('acct')) && rows.length) {   /* another card / account: re-check the duplicates (redraw only if one changed) */
      var A2 = acct(), changed = false;
      rows.forEach(function(r){ var d = findDup(r, mode, A2), v = d ? (s(d.id) || 'yes') : ''; if (!!v !== !!r.dup) { changed = true; r.dup = v; r.on = importable(r, mode) && !v; } });
      if (changed) draw();
      return;
    }
    var tr = t.closest && t.closest('[data-r]');
    if (t.getAttribute('data-c') === 'all') { rows.forEach(function(r){ if (importable(r, mode) && !r.dup) r.on = t.checked; }); draw(); return; }
    if (!tr) return; var r = rows[+tr.getAttribute('data-r')];
    if (t.getAttribute('data-c') === 'on') { r.on = t.checked; var sm = q('sum'); if (sm) { var on = rows.filter(function(x){ return importable(x, mode) && x.on; }); sm.textContent = on.length + ' ticked · ' + money(on.reduce(function(x, y){ return x + (y.dir === 'out' ? y.amount : -y.amount); }, 0)); } var g = q('go'); if (g) g.textContent = 'Import ' + rows.filter(function(x){ return importable(x, mode) && x.on; }).length + (card ? ' charges' : ' costs'); }
    if (t.getAttribute('data-c') === 'cat') { r.category = t.value; r.catPicked = true; }
    if (t.getAttribute('data-c') === 'job') { r.pid = t.value === '__oh' ? '' : t.value; r.overhead = t.value === '__oh'; r.how = 'manual'; r.why = 'you picked it'; }
  });
  ov.addEventListener('click', function(ev){
    var t = ev.target, b = t && t.closest ? t.closest('[data-c]') : null, a = b ? b.getAttribute('data-c') : '';
    if (t === ov || a === 'x') { ov.remove(); try { if (W._gcMoneyRepaint) W._gcMoneyRepaint(); } catch (e) {} return; }
    if (a === 'mode') { ov.remove(); openImport({ mode: card ? 'bank' : 'card' }); return; }
    if (a === 'read') {
      if (busy) return;
      var txt = s(q('paste').value);
      if (!txt && pdfDoc) { useResult(parsePdfDoc(pdfDoc, mode)); return; }
      cardsP.then(function(){ return Promise.resolve(M().loadRules ? M().loadRules() : null); }).then(function(){ useResult(parseText(txt, mode)); });
      return;
    }
    if (a === 'recon') { runRecon(rows, q('reconmsg')); return; }
    if (a === 'go') {
      var pick = rows.filter(function(r){ return r.on && importable(r, mode) && !r.dup; });
      var dups = rows.filter(function(r){ return r.dup && importable(r, mode); }).length;
      if (!pick.length && !dups) return;
      b.disabled = true; b.textContent = 'Importing…';
      (card ? importCard(pick, dups) : importBank(pick, dups)).then(function(out){
        q('prev').innerHTML = out;
      }, function(e){ b.disabled = false; msg('Could not save: ' + s(e && e.message), true); });
    }
  });
  function importCard(pick, dups){
    if (typeof W._gcAddCardCharge !== 'function') { msg('The CRM is still loading — try again in a moment.', true); return Promise.reject(new Error('loading')); }
    var cid = s(q('card').value), nc = s(q('newcard').value), cardP = Promise.resolve(null);
    if (nc && W._gcAddCard) cardP = W._gcAddCard({ name: nc, last4: (nc.match(/(\d{4})\D*$/) || [])[1] || '' });
    return cardP.then(function(newCard){
      var cd = newCard || cards.filter(function(c){ return s(c.id) === cid; })[0] || null;
      var A = { key: cd ? 'card:' + cd.id : '', cardId: cd ? cd.id : '' };
      var out = { added: 0, merged: dups, failed: 0, refunds: 0 }, i = 0, refunds = [];
      function next(){
        if (i >= pick.length) return Promise.resolve();
        var r = pick[i++];
        if (r.kind === 'refund') { refunds.push(r); return next(); }
        return Promise.resolve(W._gcAddCardCharge({ cardId: cd ? cd.id : '', card: cd ? cd.name : '', date: r.date, vendor: r.vendor, desc: r.desc + (r.memo ? ' — ' + r.memo : ''), amount: r.amount, category: r.category, pid: r.pid, overhead: !r.pid && !!r.overhead, note: 'Card statement import' + (fileName ? ' (' + fileName + ')' : '') }))
          .then(function(x){ if (x && x.ok) { if (x.merged) out.merged++; else out.added++; } else out.failed++; }, function(){ out.failed++; }).then(next);
      }
      return next().then(function(){
        if (!refunds.length) return 0;
          var add = refunds.map(function(r){ var p = proj(r.pid); return { id: 'CARD:R' + hash(stmtKey(A.key, r) + r.desc), stmtKey: stmtKey(A.key, r), pid: r.pid || '', overhead: !r.pid && !!r.overhead, date: r.date, category: r.category, vendor: r.vendor, payee: r.vendor,
            desc: 'Refund / credit — ' + r.desc, amt: -r.amount, amount: -r.amount, type: 'refund', status: 'paid', method: 'Credit Card', payMethod: 'Credit Card', source: 'creditcard', by: 'Card statement import', cardId: A.cardId, po: p ? poOf(p) : '', direction: 'in', isIncome: false, enteredAt: nowIso() }; });
          return addExpenses(add);
      }).then(function(nr){
        out.refunds = nr || 0;
        try { if (M().learn) M().learn(pick.map(function(r){ return { vendor: r.vendor, category: r.category, pid: r.pid, overhead: r.overhead, how: r.how }; })); } catch (e) {}
        try { if (W._gcPushAll) ST.call(W, function(){ W._gcPushAll(); }, 900); } catch (e) {}
        var noJob = pick.filter(function(r){ return !r.pid && !r.overhead; }).length;
        W._gcMoney && (W._gcMoney.lastImport = out);
        return '<div data-c="done" style="padding:14px;border-radius:10px;background:#f0fdf4;color:#166534;font-weight:700">✓ ' + out.added + ' charges added' + (out.refunds ? ' · ' + out.refunds + ' refunds / credits taken off their jobs' : '') + (out.merged ? ' · ' + out.merged + ' were already in (merged, not doubled)' : '') + (out.failed ? ' · ' + out.failed + ' could not be saved' : '') +
          '<div style="font-weight:400;color:#334155;margin-top:4px">They are on each job\'s costs and the P&L now.' + (noJob ? ' ' + noJob + ' have no job yet — they wait in 📥 Needs a job (To-Do) until you pick one or mark them overhead.' : '') + ' The vendors\' categories and jobs are remembered for next month.</div></div>';
      });
    });
  }
  function importBank(pick, dups){
    if (typeof W._setExpenses !== 'function') { msg('The CRM is still loading — try again in a moment.', true); return Promise.reject(new Error('loading')); }
    var A = acct(); rememberBank(A.name);
    var add = pick.map(function(r){ var p = proj(r.pid), key = stmtKey(A.key, r);
      return { id: 'BANK-' + hash(key + '|' + r.desc), stmtKey: key, pid: r.pid || '', overhead: !r.pid && !!r.overhead, type: 'expense', date: r.date, vendor: r.vendor, payee: r.vendor, desc: r.desc + (r.memo ? ' — ' + r.memo : ''),
        amt: r.amount, amount: r.amount, category: r.category, status: 'paid', approved: true, payMethod: r.kind === 'check' ? 'Check' : 'Bank (ACH / debit)', method: r.kind === 'check' ? 'Check' : 'Bank', ref: r.checkNo || '', checkNo: r.checkNo || '',
        bankAcct: A.name, source: 'bank-statement', by: 'Bank statement import', po: p ? poOf(p) : '', direction: 'out', isIncome: false, matchWhy: r.why, enteredBy: myName(), enteredAt: nowIso() }; });
    return addExpenses(add).then(function(nAdded){
    try { if (M().learn) M().learn(pick.map(function(r){ return { vendor: r.vendor, category: r.category, pid: r.pid, overhead: r.overhead, how: r.how }; })); } catch (e) {}
    var noJob = pick.filter(function(r){ return !r.pid && !r.overhead; }).length;
    var out = { added: nAdded, merged: dups + (add.length - nAdded) };
    W._gcMoney && (W._gcMoney.lastBankImport = out);
    return ('<div data-c="done" style="padding:14px;border-radius:10px;background:#f0fdf4;color:#166534;font-weight:700">✓ ' + out.added + ' costs added from the bank statement' + (out.merged ? ' · ' + out.merged + ' were already in (not doubled)' : '') +
      '<div style="font-weight:400;color:#334155;margin-top:4px">Paid expenses on their jobs (check # kept).' + (noJob ? ' ' + noJob + ' have no job yet — they wait in 📥 Needs a job.' : '') + (canBank() ? ' Run 🧾 Monthly Bank Check to compare the deposits too.' : '') + '</div></div>');
    });
  }
  if (o.file) takeFile(o.file);
  return ov;
}
function runRecon(rows, box){
  if (!box) return;
  if (!canBank()) { box.innerHTML = '<div data-c="needsql" style="padding:10px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#92400e">' + esc(SQL_MSG) + '</div>'; return; }
  if (typeof W._gcReconcileBank !== 'function') { box.textContent = 'The Monthly Bank Check is still loading — try again in a moment.'; return; }
  var mk = (rows.map(function(r){ return r.date; }).sort().pop() || todayYmd()).slice(0, 7);
  try {
    var b = W._gcReconcileBank(rows.map(function(r){ return { date: r.date, desc: r.desc, amount: r.signed != null ? r.signed : (r.dir === 'in' ? r.amount : -r.amount) }; }), mk);
    box.innerHTML = '<div data-c="recondone" style="color:#166534;font-weight:700">🧾 Checked ' + rows.length + ' bank lines for ' + esc(mk) + ': ' + b.count + ' issue' + (b.count === 1 ? '' : 's') + ' flagged (💎 → Monthly Bank Check).</div>';
  } catch (e) { box.textContent = 'The bank check failed: ' + s(e && e.message); }
}

/* ═════════════════════ 7. the other doors point here ═════════════════════ */
function isPdfFile(f){ return !!f && (/pdf/i.test(s(f.type)) || /\.pdf$/i.test(s(f.name))); }
function isStmtFile(f){ return !!f && (isPdfFile(f) || /csv|text\/plain|tab-separated/i.test(s(f.type)) || /\.(csv|txt|tsv)$/i.test(s(f.name))); }
/* a door hands its file over: true = taken (the import window opens with it) */
W._gcStmtTakeFile = function(f, mode){ if (!isStmtFile(f)) return false; openImport({ mode: mode || 'card', file: f }); return true; };
W._gcStmtIsPdf = isPdfFile;
W._gcOpenBankImport = function(o){ return openImport(Object.assign({ mode: 'bank' }, o || {})); };
function banner(kind, extra){
  var d = D.createElement('div'); d.className = 'gc-stmt-door'; d.setAttribute('data-gc-keep', '1');
  d.style.cssText = 'font-size:12.5px;line-height:1.5;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:9px;padding:9px 11px;margin:0 0 12px';
  d.innerHTML = (extra ? esc(extra) + ' ' : '') + (kind === 'bank' ? 'For a whole bank statement (<b>PDF</b> or CSV) use ' : 'For a whole card statement (<b>PDF</b> or CSV) use ') +
    '<button type="button" data-door="' + kind + '" style="border:none;border-radius:7px;padding:5px 10px;margin-left:4px;background:#1d4ed8;color:#fff;font-weight:700;cursor:pointer">' + (kind === 'bank' ? '🏦 Import bank statement' : '💳 Import card statement') + '</button>' +
    ' — it reads the PDF, shows every line, suggests the jobs and never adds a line twice. ' +
    '<label style="display:inline-block;margin-top:4px;font-weight:700;cursor:pointer">📄 or choose the PDF / CSV here: <input type="file" data-door-file="' + kind + '" accept=".pdf,application/pdf,.csv,.txt,text/csv" style="font-size:12px;max-width:220px"></label>';
  d.addEventListener('click', function(ev){ var b = ev.target.closest && ev.target.closest('[data-door]'); if (!b) return; openImport({ mode: b.getAttribute('data-door') }); });
  d.addEventListener('change', function(ev){ var t = ev.target; if (!t || !t.getAttribute || !t.getAttribute('data-door-file') || !t.files || !t.files[0]) return; var f = t.files[0]; try { t.value = ''; } catch (e) {} openImport({ mode: t.getAttribute('data-door-file'), file: f }); });
  return d;
}
function wrapDoor(name, after){
  var f = W[name]; if (typeof f !== 'function' || f.__gcStmt) return;
  var w = function(){ var r = f.apply(this, arguments); try { Promise.resolve(r).then(function(){ try { after(); } catch (e) {} }); } catch (e) {} return r; };
  w.__gcStmt = true; if (f.__gckCash) w.__gckCash = true; W[name] = w;
}
function hookDoors(){
  /* Credit Card Entry (paste box) */
  wrapDoor('_gcOpenCCManager', function(){
    var ta = D.getElementById('_ccPaste'); if (!ta || ta.parentElement.querySelector('.gc-stmt-door')) return;
    var lab = ta.previousElementSibling; var b = banner('card', 'This box is for pasting a few card lines by hand.'); b.style.background = '#0a1628'; b.style.color = '#cbd5e1'; b.style.borderColor = '#2563eb';
    ta.parentElement.insertBefore(b, lab && lab.tagName === 'LABEL' ? lab : ta);
  });
  /* 💳 Credit cards */
  wrapDoor('_gcOpenCards', function(){
    var x = D.getElementById('_cardX'); if (!x) return; var box = x.parentElement && x.parentElement.parentElement; if (!box || box.querySelector('.gc-stmt-door')) return;
    box.insertBefore(banner('card', 'Here: your cards and charges one by one.'), x.parentElement.nextSibling);
  });
  /* Monthly Bank Check (owners): a PDF goes through the bank import */
  wrapDoor('_gcOpenBankReconcile', function(){
    var b0 = D.getElementById('_rcImport'); if (!b0) return; var box = b0.parentElement; if (!box || box.querySelector('.gc-stmt-door')) return;
    box.insertBefore(banner('bank', 'This check compares a bank CSV with the CRM.'), b0);
  });
  wrapDoor('_gcOpenAccounts', function(){
    var x = D.getElementById('_acX'); if (!x) return; var box = x.parentElement && x.parentElement.parentElement; if (!box || box.querySelector('.gc-stmt-door')) return;
    box.insertBefore(banner('bank', 'Here: the payroll and cash balances.'), x.parentElement.nextSibling);
  });
  /* the Expense Center's "PDF statement" drop: a PDF goes to the card import (a photo still goes to the AI reader) */
  var EC = W.gcExpCenter;
  if (EC && typeof EC.handlePdfUpload === 'function' && !EC.handlePdfUpload.__gcStmt) {
    var h0 = EC.handlePdfUpload;
    EC.handlePdfUpload = function(inp){ var fs = Array.prototype.slice.call((inp && inp.files) || []), pdf = fs.filter(isPdfFile)[0]; if (pdf) { try { inp.value = ''; } catch (e) {} openImport({ mode: 'card', file: pdf, note: fs.length > 1 ? 'Several files were chosen: this is the first PDF. Import it, then choose the next one here.' : '' }); return Promise.resolve(); } return h0.apply(this, arguments); };
    EC.handlePdfUpload.__gcStmt = true;
  }
}
/* 💎 Bank Accounts / Monthly Bank Check: the office without the cash records gets the bank import and a plain message */
W._gcStmtBankDoor = function(which){
  if (isAdminNow()) return false;
  var off = false; try { off = !!(W._gcIsOfficeFull && W._gcIsOfficeFull()); } catch (e) {}
  if (!off && !/office/i.test(s(me().role))) return false;
  openImport({ mode: 'bank', note: canBank() ? (which === 'recon' ? 'Import the statement here, then press 🧾 Check these lines against the CRM.' : '') : SQL_MSG });
  return true;
};
W._gcStmt = { readPdf: function(buf){ return readPdf(buf).then(function(x){ return x.error ? x : x.doc; }); }, parseLines: parseLines, parseText: parseText, parsePdf: function(buf, mode){ return readPdf(buf).then(function(x){ return x.error ? { error: x.error, message: IMG_MSG, rows: [] } : parsePdfDoc(x.doc, mode); }); },
  openImport: openImport, canBank: canBank, last: function(){ return LAST.res; }, IMG_MSG: IMG_MSG, SQL_MSG: SQL_MSG, hookDoors: hookDoors, linesOf: linesOf };
/* patch MONEY's "💳 Import card statement" opens this window */
W._gcMoneyImportUI = openImport;
W._gcOpenCardImport = function(o){ return openImport(Object.assign({ mode: 'card' }, o || {})); };
try { hookDoors(); } catch (e) {}
try { D.addEventListener('click', function(ev){ var t = ev.target; if (t && t.closest && t.closest('.gc-hub-item, aside, nav')) { try { hookDoors(); } catch (e) {} } }, true); } catch (e) {}
try { console.log('[GC] 📄 PDF card / bank statements read by themselves · review table with the statement\'s own totals · duplicates caught (patch STMTPDF)'); } catch (e) {}
})();
