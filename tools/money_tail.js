/* __GC_PATCH_MONEY__ — MONEY IN BY ITSELF: E-MAILED INVOICES / RECEIPTS, CARD STATEMENTS, JOB MATCHING, MARKETING SPEND (owner 10/30)
   "make sure invoices to clients and from subs go directly into invoices from email/crm when they send them to my emails" ·
   "can we make sure marketing P&L, credit card entry, expenses and matching has all features and is easy".
   1. THE OFFICE SEES THE E-MAILED MONEY. gc_kv "gc_mail_money" / "gc_mail_money_done" are admin-only in Supabase (docs/email-all.sql),
      so the office computer read nothing and its "🧾 Match this invoice" list was always empty. Now the CRM reads them through
      /.netlify/functions/bid-inbox?moneymail=1 (admins + the office) and marks one done there (POST op done).
   2. WHAT THE SERVER PLACED IS BOOKED (netlify/functions/_lib/subinv.js: PO first, then the address, then the sub's only open job):
        · a SUB's invoice → ▥ Invoices (patch SUBINV, unchanged: received → ✅ Approvals → check on the pay date);
        · a SUPPLIER's bill or an e-mailed RECEIPT → one PENDING Expense on the job (the file attached) → the usual expense approval;
        · QuickBooks' copy of GrayCo's OWN invoice → ▥ Invoices as a sent client invoice (an invoice # already there is skipped).
      Not certain → 📥 Needs a job (below), never lost.
   3. 📥 NEEDS A JOB (To-Do, office + admins): every e-mailed invoice / receipt and every card charge that has no job yet, with the
      CRM's best guess and why. Pick the job (or Overhead) → booked. ✨ Use the suggestions books every one the CRM is sure of.
   4. 💳 CARD STATEMENT IMPORT (💎 → 💳 Import card statement, the Expenses tab "📊 CC Statement" area, Accounting): a bank / card CSV
      (Chase, Amex, Capital One, Citi, Bank of America, Wells Fargo, Discover, US Bank, QuickBooks: date · description · amount or
      debit / credit) or the lines pasted from a PDF statement. Each charge gets a category and a job: the PO in the memo, your
      rule for that vendor, the vendor's usual job lately, or the open job at the address in the memo. Import → window._gcAddCardCharge
      (expense list + the card's charges + the register; the same charge twice is merged). What you pick is remembered:
      gc_kv "gc_money_rules" { vendor: { category, pid } } — the next statement fills itself.
   5. MARKETING SPEND FROM THE BOOKS: an expense / card charge in an advertising category, or to an ad platform (Google Ads, Facebook /
      Meta, Angi, Thumbtack, Nextdoor, Yelp, Roof Ignite…), counts as that source's spend in 📣 Marketing → 📊 Dashboard (cost per
      lead, cost per won job) — unless spend for that source and month was typed in / imported there (that wins, never doubled).
   API: window._gcMoney = { parseStatement, suggest, vendorKey, catFor, rules, learn, needs, openNeeds, openImport, process, mkSpend } */
(function(){
'use strict';
if (window.__GC_PATCH_MONEY__) return; window.__GC_PATCH_MONEY__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; var t = s(v).replace(/[$,\s]/g, ''); var neg = /^\(.*\)$/.test(t); var n = parseFloat(t.replace(/[()]/g, '')); return isFinite(n) ? (neg ? -n : n) : 0; }
function r2(v){ return Math.round(num(v) * 100) / 100; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(v){ return '$' + r2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function nowIso(){ return new Date().toISOString(); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function crm(){ return W._crm || {}; }
function projects(){ return arr(crm().projects).filter(function(p){ return !p.deleted; }); }
function proj(pid){ return projects().filter(function(p){ return s(p.id) === s(pid); })[0] || null; }
function openJob(p){ return p && !p.deleted && !/^(completed?|closed|lost|dead|cancel+ed|archived|declined|bidding|estimating)$/i.test(s(p.status)); }
function me(){ try { if (typeof W._gcMeUser === 'function') { var u = W._gcMeUser(); if (u) return u; } } catch (e) {} return {}; }
function myName(){ var u = me(); return s(u.name) || s(u.email).split('@')[0] || 'office'; }
function viewingAs(){ try { return !!(W._gcVAS && W._gcVAS.active && W._gcVAS.active()); } catch (e) { return false; } }
function moneyPerson(){ var u = me(); if (viewingAs()) return false; return /^(admin|office)/i.test(s(u.role)) || /office/i.test(s(u.profile)) || low(u.payType) === 'owner'; }
function lsGet(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { W.localStorage.setItem(k, v); } catch (e) {} }

/* ── the cloud: gc_kv like patch OWNERTODO (the store tests swap in) ── */
function sbBase(){ return s(lsGet('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function kvGet(key){
  if (W._gcOT_kv) return Promise.resolve(W._gcOT_kv.get(key));
  var k = s(lsGet('grayco_sb_key')); if (!k) return Promise.resolve(undefined);
  return W.fetch(sbBase() + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value', { headers: { apikey: k }, cache: 'no-store' })
    .then(function(r){ return r && r.ok ? r.json() : undefined; }).then(function(rows){ if (!Array.isArray(rows)) return undefined; var v = rows[0] ? rows[0].value : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; }, function(){ return undefined; });
}
function kvPut(key, value){
  if (W._gcOT_kv) { W._gcOT_kv.put(key, value); return Promise.resolve(true); }
  var k = s(lsGet('grayco_sb_key')); if (!k) return Promise.resolve(false);
  return W.fetch(sbBase() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: key, value: value, updated_at: nowIso() }) }).then(function(r){ return !!(r && r.ok); }, function(){ return false; });
}

/* ════════ 1. the e-mailed money, readable by the office ════════ */
var FN = '/.netlify/functions/bid-inbox?moneymail=1';
function fnJson(opts){
  return W.fetch(FN, Object.assign({ cache: 'no-store' }, opts || {})).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return r.ok && j && j.ok ? j : null; }); }, function(){ return null; });
}
/* patch OWNERTODO's pull() asks here first: [list, done] */
W._gcMoneyMailFetch = function(kvGetFallback){
  return fnJson().then(function(j){
    if (j && Array.isArray(j.list)) return [j.list, obj(j.done)];
    return Promise.all([kvGetFallback('gc_mail_money'), kvGetFallback('gc_mail_money_done')]);
  });
};
/* patch OWNERTODO / SUBINV mark one done here: the server first (the office cannot write gc_mail_money_done), then gc_kv (admins) */
W._gcMoneyDone = function(id, val){
  try { var mm = W._gcMoneyMail && W._gcMoneyMail.state && W._gcMoneyMail.state(); if (mm && mm.done) mm.done[id] = val; } catch (e) {}
  try { var si = W._gcSubInv && W._gcSubInv.state && W._gcSubInv.state(); if (si && si.done) si.done[id] = val; } catch (e) {}
  return fnJson({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'done', id: id, val: val }) }).then(function(j){
    if (j && j.done) return obj(j.done);
    return kvGet('gc_mail_money_done').then(function(cur){ var m = obj(cur), x = m[id]; if (!x || s(val.at) >= s(x.at)) m[id] = val; return kvPut('gc_mail_money_done', m).then(function(ok){ return ok ? m : null; }); });
  });
};

/* ════════ rules: vendor → category → job (gc_kv "gc_money_rules") ════════ */
var R = { rules: {}, at: 0, loading: false };
try { R.rules = obj(lsGet('gc_money_rules_cache')); } catch (e) {}
function loadRules(force){
  if (R.loading || (!force && Date.now() - R.at < 300000)) return Promise.resolve(R.rules);
  R.loading = true;
  return kvGet('gc_money_rules').then(function(v){ R.loading = false; R.at = Date.now(); if (v && typeof v === 'object') { R.rules = obj(v); lsSet('gc_money_rules_cache', JSON.stringify(R.rules)); } return R.rules; }, function(){ R.loading = false; return R.rules; });
}
/* "THE HOME DEPOT #1234 MEMPHIS TN" → "home depot"; "SQ *JOE'S TACOS" → "joes tacos"; "FACEBK *8XK2" → "facebk" */
function vendorKey(v){
  var t = low(v).replace(/^(sq|tst|pp|paypal|sp|py|in|ck|dd|pos|ach|debit|purchase|recurring)\s*\*\s*/i, '').replace(/^(pos|ach|debit card|card)\s+(purchase|debit|payment)\s+/i, '')
    .replace(/[#*].*$/, '').replace(/\b(www\.|\.com|\.net|inc|llc|co|corp)\b\.?/g, ' ').replace(/^the\s+/, '').replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.split(' ').filter(function(w){ return w.length > 1 && !/^(tn|ms|ar|al|ky|memphis|cordova|germantown|collierville|bartlett|olive|branch|southaven|hernando|jackson|nashville)$/.test(w); }).slice(0, 2).join(' ');
}
var CAT_RULES = [
  [/home ?depot|lowe'?s|menards|84 lumber|lumber|abc supply|beacon|srs|ferguson|sherwin|floor ?& ?decor|fastenal|white ?cap|l ?& ?w supply|johnstone|winsupply|grainger|ace hardware|hd supply|builders first|mccoy|daltile|ppg|benjamin moore|supply/, 'Materials'],
  [/sunbelt|united rentals|herc|rental|equipment share/, 'Equipment Rental'],
  [/shell|exxon|chevron|bp\b|qt\b|quiktrip|circle k|mapco|marathon|valero|speedway|murphy|kroger fuel|sam'?s fuel|costco gas|fuel|gas station|pilot|love'?s/, 'Fuel/Gas'],
  [/facebk|facebook|meta ?ads|instagram|google ?ads|adwords|google \*ads|angi|homeadvisor|thumbtack|nextdoor|yelp|roof ?ignite|porch|modernize|networx|bark\.com|tiktok|linkedin ads|bing ads|microsoft ads|valpak|mailchimp|constant contact/, 'Advertising/Marketing'],
  [/permit|shelby county|city of|county clerk|inspection|fire marshal|code enforcement/, 'Permits/Fees'],
  [/dumpster|waste|republic services|waste management|wm\b|junk/, 'Dumpster/Disposal'],
  [/verizon|at&t|att\b|t-mobile|tmobile|comcast|xfinity|spectrum|google \*gsuite|google workspace|microsoft|adobe|quickbooks|intuit|dropbox|zoom|companycam|twilio|netlify|supabase|resend|openai|anthropic|claude/, 'Software/Phone'],
  [/mcdonald|chick-fil|chickfil|wendy|taco|burger|pizza|starbucks|restaurant|grill|cafe|diner|subway|sonic|waffle|bbq|kitchen/, 'Meals'],
  [/office depot|staples|ups store|fedex|usps|post office|amazon/, 'Office Supplies'],
  [/insurance|hartford|state farm|progressive|geico|nationwide|travelers/, 'Insurance'],
  [/hotel|inn\b|marriott|hilton|holiday inn|hampton|airbnb|delta air|southwest|american air|uber|lyft/, 'Travel']
];
var AD_RE = CAT_RULES[3][0];
function catFor(vendor, memo){
  var k = vendorKey(vendor), r = R.rules[k];
  if (r && r.category) return { category: r.category, why: 'your rule for ' + k };
  var t = low(vendor) + ' ' + low(memo);
  for (var i = 0; i < CAT_RULES.length; i++) if (CAT_RULES[i][0].test(t)) return { category: CAT_RULES[i][1], why: 'the kind of vendor' };
  try { if (W._gcAutoCategory) { var c = W._gcAutoCategory(vendor); if (c && c !== 'Vendor Payment') return { category: c, why: 'the CRM\'s category rules' }; } } catch (e) {}
  return { category: 'Misc', why: '' };
}

/* ════════ auto-match: which job a charge / bill belongs to ════════ */
var SUF = { cove: 'cv', cv: 'cv', drive: 'dr', dr: 'dr', street: 'st', st: 'st', road: 'rd', rd: 'rd', lane: 'ln', ln: 'ln', avenue: 'ave', ave: 'ave', boulevard: 'blvd', blvd: 'blvd', court: 'ct', ct: 'ct', circle: 'cir', cir: 'cir', place: 'pl', pl: 'pl', parkway: 'pkwy', pkwy: 'pkwy', highway: 'hwy', hwy: 'hwy', trail: 'trl', trl: 'trl', way: 'way', loop: 'loop', pike: 'pike' };
function addrKey(a){
  var m = /\b(\d{2,6})\s+((?:[nsew]\.?\s+)?[a-z0-9'.-]+(?:\s+[a-z0-9'.-]+){0,2}?)\s+(cove|cv|drive|dr|street|st|road|rd|lane|ln|avenue|ave|boulevard|blvd|court|ct|circle|cir|place|pl|parkway|pkwy|highway|hwy|trail|trl|way|loop|pike)\b/i.exec(low(a));
  return m ? m[1] + ' ' + m[2].replace(/^[nsew]\.?\s+/, '').replace(/[^a-z0-9 ]/g, '') : '';
}
function poOf(p){ return s(p.autoPO || p.po).toUpperCase(); }
/* { pid, why, conf, how } — how: po | rule | usual | address | '' */
function suggest(o){
  o = o || {};
  var text = (s(o.memo) + ' ' + s(o.vendor) + ' ' + s(o.desc)).toUpperCase(), ps = projects();
  /* 1. the CRM PO in the memo */
  var toks = text.match(/\b[A-Z]-?\d{3,6}\b/g) || [], hits = [];
  ps.forEach(function(p){ var po = poOf(p).replace('-', ''); if (po.length >= 3 && toks.some(function(t){ return t.replace('-', '') === po; })) hits.push(p); });
  hits = hits.filter(function(p, i){ return hits.indexOf(p) === i; });
  if (hits.length === 1) return { pid: s(hits[0].id), conf: 97, how: 'po', why: 'PO ' + poOf(hits[0]) + ' in the memo' };
  /* 2. your rule for this vendor */
  var vk = vendorKey(o.vendor || o.desc), rule = R.rules[vk];
  if (rule && rule.pid && openJob(proj(rule.pid))) return { pid: s(rule.pid), conf: 90, how: 'rule', why: 'your rule: ' + vk + ' → ' + s((proj(rule.pid) || {}).name) };
  if (rule && rule.overhead) return { pid: '', overhead: true, conf: 90, how: 'rule', why: 'your rule: ' + vk + ' → overhead' };
  /* 3. the open job at the address in the memo */
  var ak = addrKey(o.memo + ' ' + o.desc + ' ' + o.vendor);
  if (ak) { var at = ps.filter(function(p){ return openJob(p) && addrKey(p.address) === ak; }); if (at.length === 1) return { pid: s(at[0].id), conf: 92, how: 'address', why: 'the open job at ' + s(at[0].address) }; }
  /* 4. the vendor's usual job lately (60 days, 2+ charges, 60 %+ on one OPEN job) */
  if (vk) {
    var since = Date.now() - 60 * 864e5, by = {}, total = 0;
    arr(crm().expenses).forEach(function(e){ if (!e.pid || e.deleted || vendorKey(e.vendor || e.payee || e.desc) !== vk) return; var t = Date.parse(s(e.date).slice(0, 10)); if (isFinite(t) && t < since) return; by[e.pid] = (by[e.pid] || 0) + 1; total++; });
    var best = Object.keys(by).sort(function(a, b){ return by[b] - by[a]; })[0];
    if (best && by[best] >= 2 && by[best] / total >= 0.6 && openJob(proj(best))) return { pid: best, conf: 75, how: 'usual', why: vk + '\'s usual job lately (' + by[best] + ' of ' + total + ' charges)' };
  }
  return { pid: '', conf: 0, how: '', why: '' };
}
function learn(list){
  /* list: [{ vendor, category, pid, overhead, how }] → gc_kv "gc_money_rules" (merged with what is there) */
  var add = {};
  arr(list).forEach(function(x){ var k = vendorKey(x.vendor); if (!k) return; var r = add[k] || {}; if (x.category && x.category !== 'Misc') r.category = x.category;
    if (x.pid && x.how !== 'po' && x.how !== 'address') { r.pid = s(x.pid); r.overhead = false; } else if (x.overhead && !x.pid) { r.overhead = true; r.pid = ''; }
    r.at = nowIso(); r.by = myName(); add[k] = r; });
  if (!Object.keys(add).length) return Promise.resolve(R.rules);
  return kvGet('gc_money_rules').then(function(cur){
    var m = obj(cur); Object.keys(add).forEach(function(k){ m[k] = Object.assign({}, m[k] || {}, add[k], { n: num((m[k] || {}).n) + 1 }); });
    R.rules = m; lsSet('gc_money_rules_cache', JSON.stringify(m)); return kvPut('gc_money_rules', m).then(function(){ return m; });
  });
}

/* ════════ 4. card / bank statement parsing ════════ */
function csvRows(text){
  var rows = [], row = [], cur = '', q = false, t = s(text).replace(/^﻿/, '');
  var sep = (t.split('\n')[0].split('\t').length > t.split('\n')[0].split(',').length) ? '\t' : ',';
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
function ymdOf(v, yearHint){
  var t = s(v), m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/.exec(t))) { var y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2); }
  if ((m = /^(\d{1,2})[\/.-](\d{1,2})$/.exec(t))) { var yy = yearHint || new Date().getFullYear(); var d0 = yy + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2); if (!yearHint && d0 > today()) d0 = (yy - 1) + d0.slice(4); return d0; }
  var mo = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  if ((m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})?/.exec(t)) && mo[low(m[1])]) { var y2 = m[3] || String(yearHint || new Date().getFullYear()); return y2 + '-' + ('0' + mo[low(m[1])]).slice(-2) + '-' + ('0' + m[2]).slice(-2); }
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(t))) return m[1] + '-' + m[2] + '-' + m[3];
  return '';
}
var PAY_RE = /\b(payment\s*(-|–)?\s*thank\s*you|autopay|auto\s*pay|online\s+payment|payment\s+received|mobile\s+payment|thank\s+you\s+for\s+your\s+payment|pymt|ach\s+pmt|electronic\s+payment)\b/i;
function col(head, res){ for (var r = 0; r < res.length; r++) for (var i = 0; i < head.length; i++) if (res[r].test(head[i])) return i; return -1; }
/* → { rows: [{ date, desc, amount (a charge > 0), credit:boolean, raw }], format, skipped } */
function parseStatement(text){
  var t = s(text), out = { rows: [], format: '', skipped: 0 };
  if (!t) return out;
  var rows = csvRows(t), hi = -1;
  for (var i = 0; i < Math.min(rows.length, 12); i++) { var h = rows[i].map(low); if (h.some(function(x){ return /date/.test(x); }) && h.some(function(x){ return /amount|debit|credit|charge/.test(x); })) { hi = i; break; } }
  var parsed = [];
  if (hi >= 0 && rows.length > hi + 1) {
    var head = rows[hi].map(low);
    var di = col(head, [/^(transaction|trans\.?) date$/, /^date$/, /^posted date$|^post(ing)? date$/, /date/]);
    var de = col(head, [/^description$/, /^(payee|merchant|merchant name|name|transaction description|details)$/, /description|payee|merchant|transaction/]);
    var mi = col(head, [/^memo$/, /^(extended details|appears on your statement as|category)$/]);
    var ai = col(head, [/^amount$/, /^(transaction amount|amount \(usd\)|amt)$/, /amount/]);
    var dbi = col(head, [/^debit$|^debits$|^withdrawals?$|^charges?$|debit amount/]), cri = col(head, [/^credit$|^credits$|^deposits?$|^payments?$|credit amount/]);
    var ti = col(head, [/^type$|^transaction type$|^details$/]);
    out.format = (dbi >= 0 && cri >= 0 ? 'debit / credit columns' : 'one amount column') + (ti >= 0 ? ' + type' : '');
    rows.slice(hi + 1).forEach(function(r){
      var d = ymdOf(r[di]); if (!d) { out.skipped++; return; }
      var desc = s(r[de >= 0 ? de : 1]), memo = mi >= 0 ? s(r[mi]) : '', amt;
      if (dbi >= 0 || cri >= 0) { var db = dbi >= 0 ? num(r[dbi]) : 0, cr = cri >= 0 ? num(r[cri]) : 0; amt = Math.abs(db) > 0 ? Math.abs(db) : -Math.abs(cr); parsed.push({ date: d, desc: desc, memo: memo, amount: amt, signed: false, type: ti >= 0 ? low(r[ti]) : '' }); }
      else if (ai >= 0) parsed.push({ date: d, desc: desc, memo: memo, amount: num(r[ai]), signed: true, type: ti >= 0 ? low(r[ti]) : '' });
      else out.skipped++;
    });
  } else if (rows.length && rows[0].length >= 3 && ymdOf(rows[0][0]) && /^[-($]*[\d,]+\.\d{2}\)?$/.test(s(rows[0][1]).replace(/\s/g, ''))) {
    /* no header: Wells Fargo style "date","amount","*","","description" */
    out.format = 'no header (date, amount, …, description)';
    rows.forEach(function(r){ var d = ymdOf(r[0]); if (!d) { out.skipped++; return; } var desc = s(r.slice(2).filter(function(x){ return s(x) && s(x) !== '*'; }).pop()); parsed.push({ date: d, desc: desc, memo: '', amount: num(r[1]), signed: true, type: '' }); });
  } else {
    /* text pasted from a PDF statement: "10/03  10/04  THE HOME DEPOT #1234 MEMPHIS TN  123.45" (CR / - = a credit) */
    out.format = 'statement text';
    var yh = (/\b(20\d{2})\b/.exec(t) || [])[1];
    t.split(/\r?\n/).forEach(function(l){
      var m = /^\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|[A-Z][a-z]{2}\s+\d{1,2})\s+(?:(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|[A-Z][a-z]{2}\s+\d{1,2})\s+)?(.+?)\s+(-?\(?\$?\s?[\d,]+\.\d{2}\)?)\s*(CR|-)?\s*$/.exec(l);
      if (!m) return;
      var d = ymdOf(m[1], yh ? +yh : 0); if (!d) return;
      var a = num(m[3].replace(/\s/g, '')); if (m[4]) a = -Math.abs(a);
      parsed.push({ date: d, desc: s(m[2]), memo: '', amount: a, signed: false, type: '' });
    });
  }
  /* which sign is a charge? a type column says; else a payment line says; else most rows are charges */
  var signed = parsed.filter(function(p){ return p.signed; });
  var chargeNeg = false;
  if (signed.length) {
    var pay = signed.filter(function(p){ return PAY_RE.test(p.desc) || /payment|credit|return|refund/.test(p.type); });
    if (pay.length) chargeNeg = pay.filter(function(p){ return p.amount > 0; }).length >= pay.length / 2;
    else chargeNeg = signed.filter(function(p){ return p.amount < 0; }).length > signed.length / 2;
  }
  parsed.forEach(function(p){
    var a = p.signed ? (chargeNeg ? -p.amount : p.amount) : p.amount;
    if (/^(sale|debit|purchase|fee|interest)/.test(p.type)) a = Math.abs(a);
    if (/^(payment|credit|return|refund|adjustment)/.test(p.type)) a = -Math.abs(a);
    var credit = a < 0 || PAY_RE.test(p.desc);
    if (!(Math.abs(a) > 0)) { out.skipped++; return; }
    out.rows.push({ date: p.date, desc: p.desc, memo: p.memo, amount: r2(Math.abs(a)), credit: credit, payment: PAY_RE.test(p.desc) });
  });
  return out;
}

/* ════════ 2. book what the server placed ════════ */
var DONE = {};
function markDone(id, val){ DONE[id] = val; return W._gcMoneyDone(id, val); }
function expIdOf(rec){ return 'EXPM-' + s(rec.id).replace(/^MM-/, ''); }
function invIdOf(rec){ return 'INVC-' + s(rec.id).replace(/^MM-/, ''); }
function hasExp(id){ return arr(crm().expenses).some(function(e){ return s(e.id) === id || (e.mailId && 'EXPM-' + s(e.mailId).replace(/^MM-/, '') === id); }); }
function hasInv(id){ return arr(crm().invoices).some(function(i){ return s(i.id) === id; }); }
function bookExpense(rec, o){
  var si = rec.si || {}, r = si.read || {}, f = arr(rec.files)[0] || {}, p = proj(o.pid), id = expIdOf(rec);
  if (hasExp(id) || typeof W._setExpenses !== 'function') return null;
  var vendor = s(o.vendor) || s(si.sub && si.sub.conf >= 80 && si.sub.name) || s(r.vendor) || rec.fromName || rec.from;
  var c = o.category || catFor(vendor, r.lines && r.lines.map(function(l){ return l.desc; }).join(' ')).category;
  if (c === 'Misc' && rec.kind !== 'receipt') c = 'Materials';
  var e = { id: id, mailId: rec.id, pid: s(o.pid), type: 'expense', vendor: vendor, payee: vendor,
    desc: (rec.kind === 'receipt' ? 'Receipt e-mailed in' : 'Supplier invoice' + (r.invoiceNumber ? ' #' + r.invoiceNumber : '')) + ' — ' + (s(rec.subject) || s(f.name)) + ' (read by the CRM)',
    amt: r2(o.amt != null ? o.amt : r.total), category: c, status: 'pending', date: s(r.invoiceDate) || s(si.recvDate) || s(rec.at).slice(0, 10) || today(),
    po: p ? poOf(p) : s(r.po), invNum: s(r.invoiceNumber), dueDate: s(r.dueDate), overhead: !o.pid && !!o.overhead,
    payMethod: rec.kind === 'receipt' ? '' : 'Bill (to pay)', receipt: f.ref || null, receiptName: f.name || '', files: arr(rec.files).map(function(z){ return { name: z.name, ref: z.ref, type: z.type }; }),
    source: 'email:' + (s(rec.via) || (rec.kind === 'receipt' ? 'receipts@' : 'invoices@')), by: (s(rec.via) || 'e-mail') + ' (automatic)', matchWhy: s(o.why || (si.job && si.job.why)), enteredAt: nowIso() };
  if (!(e.amt > 0)) return null;
  W._setExpenses(function(prev){ var l = Array.isArray(prev) ? prev : []; return l.some(function(x){ return s(x.id) === id; }) ? l : [e].concat(l); });
  try { if (W._gcPushAll) later(function(){ W._gcPushAll(); }, 900); } catch (er) {}
  markDone(rec.id, { done: true, expId: id, at: nowIso(), by: o.by || 'automatic' });
  return e;
}
function bookClientInvoice(rec, o){
  var si = rec.si || {}, r = si.read || {}, f = arr(rec.files)[0] || {}, p = proj(o.pid), id = invIdOf(rec);
  if (hasInv(id) || typeof W._setInvoices !== 'function') return null;
  var amt = r2(o.amt != null ? o.amt : r.total); if (!(amt > 0)) return null;
  var inv = { id: id, mailId: rec.id, type: 'client', pid: s(o.pid), client: s(p && (p.client || p.customer)) || s(r.customer), po: p ? poOf(p) : s(r.po), amt: amt, invNum: s(r.invoiceNumber),
    date: s(r.invoiceDate) || s(rec.at).slice(0, 10), dueDate: s(r.dueDate), terms: s(r.terms), lines: arr(r.lines), status: 'sent', sentDate: s(rec.at).slice(0, 10),
    desc: 'QuickBooks invoice' + (r.invoiceNumber ? ' #' + r.invoiceNumber : '') + ' — ' + s(p && p.name), source: 'quickbooks-email', fileName: f.name || '', fileData: f.ref || '',
    files: arr(rec.files).map(function(z){ return { name: z.name, ref: z.ref, type: z.type }; }), by: 'QuickBooks e-mail (automatic)', savedAt: nowIso(), updatedAt: nowIso() };
  W._setInvoices(function(list){ var l = Array.isArray(list) ? list : []; return l.some(function(i){ return s(i.id) === id || (inv.invNum && s(i.invNum) === inv.invNum && !/^(sub|supplier)$/i.test(s(i.type))); }) ? l : l.concat([inv]); });
  try { if (W._gcPushAll) later(function(){ W._gcPushAll(); }, 900); } catch (er) {}
  markDone(rec.id, { done: true, invId: id, at: nowIso(), by: o.by || 'automatic' });
  return inv;
}
function isDone(rec, done){ var d = (done || {})[rec.id] || DONE[rec.id]; return !!(d && d.done); }
var P = { list: [], done: {}, at: 0, booked: 0 };
/* every record the server read: book the certain ones (supplier / receipt → expense, client → invoice); sub invoices stay with SUBINV */
function process(list, done){
  P.list = arr(list); P.done = obj(done); P.at = Date.now();
  if (!moneyPerson() || typeof W._setExpenses !== 'function') return 0;
  var n = 0;
  P.list.forEach(function(rec){
    var si = rec.si; if (!si || isDone(rec, P.done)) return;
    if (si.route !== 'book' || !si.job || !proj(si.job.pid)) return;
    if (rec.kind === 'receipt' || si.payee === 'supplier') { if (bookExpense(rec, { pid: si.job.pid, why: si.job.why })) n++; }
    else if (rec.kind === 'client_invoice' || si.payee === 'client') { if (bookClientInvoice(rec, { pid: si.job.pid })) n++; }
  });
  P.booked += n;
  return n;
}
/* patch SUBINV keeps the SUB invoices; suppliers / receipts / client invoices are booked here instead (an Expense / a client invoice) */
function hookSubInv(){
  var S = W._gcSubInv; if (!S || S.__gcMoney) return;
  var take = S.take, load = S.load;
  S.take = function(rec, ctx){ if (rec && rec.si && (rec.si.payee === 'supplier' || rec.si.payee === 'client')) return { skip: 'money' }; return take.apply(this, arguments); };
  S.load = function(list, done){ var r = load.call(this, arr(list).filter(function(x){ return !(x.si && (x.si.payee === 'supplier' || x.si.payee === 'client')); }), done); try { process(list, done); } catch (e) {} return r; };
  S.__gcMoney = true;
}

/* ════════ 3. 📥 Needs a job ════════ */
function cardCharge(e){ return /credit card|card/i.test(s(e.payMethod)) || /cc import|card|statement/i.test(s(e.by) + ' ' + s(e.source)) || !!e.ccRef || !!e.cardId; }
function needs(){
  var out = [], SI = W._gcSubInv && W._gcSubInv.state ? W._gcSubInv.state() : null;
  /* e-mailed sub invoices that wait (patch SUBINV's held list) */
  if (SI) arr(SI.list).forEach(function(x){ if (!x.si || x.kind !== 'sub_invoice' || (x.si.payee && x.si.payee !== 'sub') || isDone(x, SI.done) || isDone(x, P.done)) return; if (x.si.route === 'book' && !SI.held[x.id]) return;
    if (arr(crm().invoices).some(function(i){ return i.mailId && s(i.mailId) === s(x.id); })) return;
    out.push({ k: 'subinv', id: x.id, at: x.at, who: s(x.si.sub && x.si.sub.name) || x.fromName || x.from, amt: num(x.si.read && x.si.read.total), what: 'Sub invoice', why: s(x.si.why) || 'the job is not certain', top: arr(x.si.top) }); });
  /* supplier bills, receipts, client invoices */
  P.list.forEach(function(x){ var si = x.si; if (isDone(x, P.done)) return;
    var kind = x.kind === 'receipt' ? 'receipt' : si && si.payee === 'supplier' ? 'supplier' : (x.kind === 'client_invoice' || (si && si.payee === 'client')) ? 'client' : '';
    if (!kind) return;
    if (si && si.route === 'book' && si.job && proj(si.job.pid)) return;   /* booked by process() */
    if (si && si.route === 'dup' && kind === 'client' && si.dup && si.dup.same) return;   /* QuickBooks copy of an invoice the CRM has */
    out.push({ k: kind, id: x.id, at: x.at, who: s(si && si.read && si.read.vendor) || x.fromName || x.from, amt: num(si && si.read && si.read.total), what: kind === 'receipt' ? 'Receipt' : kind === 'supplier' ? 'Supplier bill' : 'Client invoice (QuickBooks)',
      why: si ? s(si.why) || 'no job matched' : 'not read yet — open it', top: arr(si && si.top), rec: x }); });
  /* card charges with no job and not overhead */
  arr(crm().expenses).forEach(function(e){ if (e.deleted || e.pid || e.overhead === true || /reject|void/i.test(s(e.status)) || !cardCharge(e)) return;
    var sg = suggest({ vendor: e.vendor || e.payee, memo: s(e.desc) + ' ' + s(e.memo), desc: e.desc });
    out.push({ k: 'card', id: s(e.id), at: s(e.date), who: s(e.vendor || e.payee || e.desc), amt: num(e.amt != null ? e.amt : e.amount), what: 'Card charge', why: sg.pid ? 'suggested: ' + sg.why : 'no job yet', sg: sg }); });
  out.sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); });
  return out;
}
function jobOptions(sel, top){
  var tops = arr(top).filter(function(j){ return proj(j.pid); });
  var o = '<option value="">— pick the job —</option><option value="__oh"' + (sel === '__oh' ? ' selected' : '') + '>Overhead — no job</option>';
  if (tops.length) o += '<optgroup label="Best matches">' + tops.map(function(j){ return '<option value="' + esc(j.pid) + '"' + (sel === j.pid ? ' selected' : '') + '>' + esc((poOf(proj(j.pid)) ? 'PO ' + poOf(proj(j.pid)) + ' · ' : '') + s(j.name) + ' (' + s(j.conf) + '%)') + '</option>'; }).join('') + '</optgroup>';
  return o + '<optgroup label="Open jobs">' + projects().filter(openJob).map(function(p){ return '<option value="' + esc(p.id) + '"' + (sel === s(p.id) ? ' selected' : '') + '>' + esc((poOf(p) ? 'PO ' + poOf(p) + ' · ' : '') + s(p.name) + (p.address ? ' · ' + s(p.address) : '')) + '</option>'; }).join('') + '</optgroup>';
}
function setChargeJob(id, pid, overhead){
  if (typeof W._setExpenses !== 'function') return false;
  var e0 = arr(crm().expenses).filter(function(x){ return s(x.id) === s(id); })[0]; var p = proj(pid);
  W._setExpenses(function(prev){ return (Array.isArray(prev) ? prev : []).map(function(x){ return s(x.id) === s(id) ? Object.assign({}, x, { pid: pid || '', po: p ? poOf(p) : x.po, overhead: !pid && !!overhead, matchedBy: myName(), matchedAt: nowIso(), updatedAt: nowIso() }) : x; }); });
  try { W._gcCardChargeList && W._gcCardChargeList().then(function(tx){ var hit = false; tx = tx.map(function(c){ if (e0 && (s(c.id) === s(e0.ccRef) || s(c.expId) === s(id))) { hit = true; return Object.assign({}, c, { pid: pid || '', overhead: !pid && !!overhead }); } return c; }); if (hit && W.idbSet) W.idbSet('gc_card_charges', tx); }); } catch (e) {}
  try { if (W._gcPushAll) later(function(){ W._gcPushAll(); }, 900); } catch (e) {}
  if (e0) learn([{ vendor: e0.vendor || e0.payee || e0.desc, category: e0.category, pid: pid, overhead: overhead, how: 'manual' }]);
  return true;
}
function place(it, pid, overhead){
  if (it.k === 'subinv') { if (W._gcSubInv) W._gcSubInv.open(it.id); return 'open'; }
  if (it.k === 'card') return setChargeJob(it.id, pid, overhead) ? 'ok' : '';
  var rec = it.rec || P.list.filter(function(x){ return s(x.id) === s(it.id); })[0]; if (!rec) return '';
  if (!rec.si) { if (W._gcMoneyMail && W._gcMoneyMail.open) W._gcMoneyMail.open(); return 'open'; }
  if (it.k === 'client') return pid && bookClientInvoice(rec, { pid: pid, by: myName() }) ? 'ok' : '';
  return (pid || overhead) && bookExpense(rec, { pid: pid, overhead: overhead, by: myName() }) ? 'ok' : '';
}
function openNeeds(){
  var old = D.querySelector('.gc-money-ov'); if (old) old.remove();
  var L = needs();
  var ov = D.createElement('div'); ov.className = 'gc-money-ov'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gc-linked', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.6);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:inherit';
  var sure = L.filter(function(it){ return it.k === 'card' && it.sg && it.sg.pid && it.sg.conf >= 85; }).length;
  ov.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:12px;width:min(760px,100%);padding:18px;margin-top:12px">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="font-size:17px">📥 Needs a job (' + L.length + ')</b><button type="button" data-m="x" aria-label="Close" style="border:none;background:none;font-size:20px;cursor:pointer">✕</button></div>' +
    '<div style="font-size:12.5px;color:#475569;margin:4px 0 10px">E-mailed invoices, receipts and card charges the CRM could not place by itself. Pick the job (or Overhead) and tap Save — it is booked and the CRM remembers the vendor.' + (sure ? '' : '') + '</div>' +
    (sure ? '<button type="button" data-m="auto" style="margin-bottom:10px;padding:8px 12px;border:none;border-radius:8px;background:#0f766e;color:#fff;font-weight:700;cursor:pointer">✨ Use the suggestions (' + sure + ' sure ones)</button>' : '') +
    (L.length ? L.map(function(it, i){
      var sel = it.sg && it.sg.pid ? it.sg.pid : (it.top && it.top[0] && it.top[0].conf >= 60 ? it.top[0].pid : '');
      return '<div data-i="' + i + '" style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin:6px 0">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + esc(it.what) + ': ' + esc(it.who) + (it.amt ? ' · ' + money(it.amt) : '') + '</b><span style="font-size:12px;color:#64748b">' + esc(s(it.at).slice(0, 10)) + '</span></div>' +
        '<div style="font-size:12.5px;color:#92400e;margin:3px 0">' + esc(it.why) + '</div>' +
        (it.k === 'subinv' ? '<button type="button" data-m="open" style="padding:7px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer">🧾 Match this sub invoice</button>' :
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><select data-m="job" style="flex:1;min-width:220px;padding:7px">' + jobOptions(sel, it.top) + '</select>' +
          '<button type="button" data-m="save" style="padding:7px 14px;border:none;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">Save</button>' +
          (it.k !== 'card' ? '<button type="button" data-m="skip" style="padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer">Not ours</button>' : '') + '</div>') +
        '<div data-m="msg" style="font-size:12.5px;margin-top:4px"></div></div>';
    }).join('') : '<div style="padding:18px;text-align:center;color:#16a34a">Everything has a job. ✅</div>') + '</div>';
  D.body.appendChild(ov);
  ov.addEventListener('click', function(ev){
    var t = ev.target, b = t && t.closest ? t.closest('[data-m]') : null, a = b ? b.getAttribute('data-m') : '';
    if (t === ov || a === 'x') { ov.remove(); paint(true); return; }
    if (a === 'auto') { var n = 0; L.forEach(function(it){ if (it.k === 'card' && it.sg && it.sg.pid && it.sg.conf >= 85 && setChargeJob(it.id, it.sg.pid, false)) n++; }); b.textContent = '✓ ' + n + ' placed'; later(openNeeds, 600); return; }
    var row = t.closest && t.closest('[data-i]'); if (!row) return; var it = L[+row.getAttribute('data-i')], msg = row.querySelector('[data-m="msg"]');
    if (a === 'open') { place(it); return; }
    if (a === 'skip') { markDone(it.id, { done: true, skip: true, why: 'not ours', at: nowIso(), by: myName() }); row.remove(); return; }
    if (a === 'save') {
      var v = s(row.querySelector('[data-m="job"]').value);
      if (!v) { msg.textContent = 'Pick the job (or Overhead) first.'; return; }
      var r = place(it, v === '__oh' ? '' : v, v === '__oh');
      if (r === 'ok') { row.innerHTML = '<div style="color:#15803d;font-weight:700">✓ Saved' + (v === '__oh' ? ' as overhead' : ' on ' + esc((proj(v) || {}).name)) + '</div>'; paint(true); }
      else if (r !== 'open') msg.textContent = 'The CRM is still loading — try again in a moment.';
    }
  });
}
/* the To-Do button (office + admins), next to 📧 Receipts e-mailed in */
var lastSig = '';
function paint(force){
  var mount = D.getElementById('_todoMount'), host = D.getElementById('gc-money-needs');
  if (!mount || !moneyPerson()) { if (host) host.remove(); return; }
  var n = needs().length;
  if (!host) { host = D.createElement('div'); host.id = 'gc-money-needs'; host.setAttribute('data-gc-keep', '1'); host.setAttribute('data-gc-linked', '1'); host.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0';
    host.addEventListener('click', function(ev){ var b = ev.target.closest && ev.target.closest('[data-mn]'); if (!b) return; if (b.getAttribute('data-mn') === 'needs') openNeeds(); else openImport(); }); }
  if (host.parentElement !== mount.parentElement) mount.parentElement.insertBefore(host, mount);
  var html = (n ? '<button type="button" data-mn="needs" style="border:1px solid #b45309;background:#b45309;color:#fff;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer">📥 Needs a job (' + n + ')</button>' : '') +
    '<button type="button" data-mn="import" style="border:1px solid #1d4ed8;background:#fff;color:#1d4ed8;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer">💳 Import card statement</button>';
  if (force || html !== lastSig) { host.innerHTML = html; lastSig = html; }
}

/* ════════ 4b. 💳 Import card statement ════════ */
function openImport(){
  var old = D.querySelector('.gc-money-imp'); if (old) old.remove();
  loadRules();
  var ov = D.createElement('div'); ov.className = 'gc-money-imp'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gc-linked', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.6);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:inherit';
  ov.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:12px;width:min(980px,100%);padding:18px;margin-top:12px">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="font-size:17px">💳 Import card statement</b><button type="button" data-c="x" aria-label="Close" style="border:none;background:none;font-size:20px;cursor:pointer">✕</button></div>' +
    '<div style="font-size:12.5px;color:#475569;margin:4px 0 10px">Download the statement from the bank\'s website as <b>CSV</b> (Chase, Amex, Capital One, Citi, Bank of America, Wells Fargo, Discover, US Bank and most others work), or open the PDF statement, copy the transaction lines and paste them below. Each charge gets a category and a job; change any, then Import. Payments to the card are left out. The same charge already entered is merged, never doubled.</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><label style="font-size:13px">Card<select data-c="card" style="display:block;padding:7px;min-width:220px"><option value="">Loading…</option></select></label>' +
    '<label style="font-size:13px">New card name<input data-c="newcard" placeholder="e.g. Chase Ink 1234" style="display:block;padding:7px"></label>' +
    '<label style="font-size:13px">CSV file<input data-c="file" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" style="display:block;padding:4px"></label></div>' +
    '<textarea data-c="paste" placeholder="…or paste the CSV / the statement lines here" style="width:100%;min-height:80px;margin-top:8px;padding:8px;font-family:monospace;font-size:12px;box-sizing:border-box"></textarea>' +
    '<div style="display:flex;gap:8px;margin-top:6px"><button type="button" data-c="read" style="padding:8px 14px;border:none;border-radius:8px;background:#1d4ed8;color:#fff;font-weight:700;cursor:pointer">Read the statement →</button><span data-c="msg" style="font-size:12.5px;align-self:center"></span></div>' +
    '<div data-c="prev" style="margin-top:10px;overflow-x:auto"></div></div>';
  D.body.appendChild(ov);
  function q(n){ return ov.querySelector('[data-c="' + n + '"]'); }
  var cards = [];
  Promise.resolve(W._gcCards ? W._gcCards() : []).then(function(c){ cards = arr(c).filter(function(x){ return x.active !== false; }); q('card').innerHTML = (cards.length ? '' : '<option value="">— no cards yet: type a new card name →</option>') + cards.map(function(c){ return '<option value="' + esc(c.id) + '">' + esc(c.name || c.issuer || 'Card') + '</option>'; }).join(''); });
  var rows = [];
  function draw(){
    var cats = ['Materials', 'Equipment Rental', 'Fuel/Gas', 'Subcontractor', 'Permits/Fees', 'Dumpster/Disposal', 'Advertising/Marketing', 'Software/Phone', 'Office Supplies', 'Meals', 'Travel', 'Insurance', 'Tools', 'Vehicle', 'Misc'];
    var charges = rows.filter(function(r){ return !r.credit; });
    q('prev').innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><tr style="text-align:left;background:#f1f5f9"><th style="padding:5px"><input type="checkbox" data-c="all" checked></th><th>Date</th><th>Description</th><th style="text-align:right">Amount</th><th>Category</th><th>Job</th><th>Why</th></tr>' +
      rows.map(function(r, i){ if (r.credit) return ''; return '<tr data-r="' + i + '" style="border-top:1px solid #e2e8f0"><td style="padding:4px"><input type="checkbox" data-c="on"' + (r.on ? ' checked' : '') + '></td><td>' + esc(r.date) + '</td><td>' + esc(r.desc) + (r.memo ? '<div style="color:#64748b">' + esc(r.memo) + '</div>' : '') + '</td><td style="text-align:right">' + money(r.amount) + '</td>' +
        '<td><select data-c="cat" style="padding:4px;max-width:150px">' + cats.concat(cats.indexOf(r.category) < 0 ? [r.category] : []).map(function(c){ return '<option' + (c === r.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></td>' +
        '<td><select data-c="job" style="padding:4px;max-width:240px">' + jobOptions(r.overhead ? '__oh' : r.pid, []) + '</select></td><td style="color:#475569;font-size:11.5px">' + esc(r.why) + '</td></tr>'; }).join('') + '</table>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><b>' + charges.length + ' charges · ' + money(charges.reduce(function(a, r){ return a + r.amount; }, 0)) + '</b><span style="color:#64748b;font-size:12px">' + (rows.length - charges.length) + ' payments / credits left out</span>' +
      '<button type="button" data-c="go" style="margin-left:auto;padding:9px 16px;border:none;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">Import ' + charges.filter(function(r){ return r.on; }).length + ' charges</button></div>';
  }
  function readText(t){
    var res = parseStatement(t);
    rows = res.rows.map(function(r){ var vendor = r.desc, sg = suggest({ vendor: vendor, memo: r.memo, desc: r.desc }), c = catFor(vendor, r.memo);
      return Object.assign({}, r, { on: !r.credit, vendor: vendor, category: c.category, pid: sg.pid, overhead: !!sg.overhead, how: sg.how, why: [sg.why, c.why ? 'category: ' + c.why : ''].filter(Boolean).join(' · ') }); });
    q('msg').textContent = rows.length ? 'Read ' + rows.length + ' lines (' + res.format + ').' + (res.skipped ? ' ' + res.skipped + ' lines skipped (no date / amount).' : '') : 'No transactions found — is it the CSV download (or the lines from the statement)?';
    draw();
  }
  ov.addEventListener('change', function(ev){
    var t = ev.target;
    if (t === q('file') && t.files && t.files[0]) { var fr = new FileReader(); fr.onload = function(){ q('paste').value = String(fr.result || ''); loadRules().then(function(){ readText(q('paste').value); }); }; fr.readAsText(t.files[0]); return; }
    var tr = t.closest && t.closest('[data-r]');
    if (t.getAttribute('data-c') === 'all') { rows.forEach(function(r){ if (!r.credit) r.on = t.checked; }); draw(); return; }
    if (!tr) return; var r = rows[+tr.getAttribute('data-r')];
    if (t.getAttribute('data-c') === 'on') r.on = t.checked;
    if (t.getAttribute('data-c') === 'cat') { r.category = t.value; r.catPicked = true; }
    if (t.getAttribute('data-c') === 'job') { r.pid = t.value === '__oh' ? '' : t.value; r.overhead = t.value === '__oh'; r.how = 'manual'; r.why = 'you picked it'; }
  });
  ov.addEventListener('click', function(ev){
    var t = ev.target, b = t && t.closest ? t.closest('[data-c]') : null, a = b ? b.getAttribute('data-c') : '';
    if (t === ov || a === 'x') { ov.remove(); paint(true); return; }
    if (a === 'read') { loadRules().then(function(){ readText(q('paste').value); }); return; }
    if (a === 'go') {
      var pick = rows.filter(function(r){ return r.on && !r.credit; }); if (!pick.length) return;
      if (typeof W._gcAddCardCharge !== 'function') { q('msg').textContent = 'The CRM is still loading — try again in a moment.'; return; }
      b.disabled = true; b.textContent = 'Importing…';
      var cardP = Promise.resolve(null), cid = s(q('card').value), nc = s(q('newcard').value);
      if (nc && W._gcAddCard) cardP = W._gcAddCard({ name: nc, last4: (nc.match(/(\d{4})\D*$/) || [])[1] || '' });
      cardP.then(function(newCard){
        var card = newCard || cards.filter(function(c){ return s(c.id) === cid; })[0] || null;
        var res = { added: 0, merged: 0, failed: 0 }, i = 0;
        function next(){
          if (i >= pick.length) return done();
          var r = pick[i++];
          Promise.resolve(W._gcAddCardCharge({ cardId: card ? card.id : '', card: card ? card.name : '', date: r.date, vendor: r.vendor, desc: r.desc + (r.memo ? ' — ' + r.memo : ''), amount: r.amount, category: r.category, pid: r.pid, overhead: !r.pid && !!r.overhead, note: 'Card statement import' }))
            .then(function(x){ if (x && x.ok) { if (x.merged) res.merged++; else res.added++; } else res.failed++; }, function(){ res.failed++; }).then(next);
        }
        function done(){
          learn(pick.map(function(r){ return { vendor: r.vendor, category: r.category, pid: r.pid, overhead: r.overhead, how: r.how }; }));
          var noJob = pick.filter(function(r){ return !r.pid && !r.overhead; }).length;
          try { if (W._gcPushAll) later(function(){ W._gcPushAll(); }, 900); } catch (e) {}
          q('prev').innerHTML = '<div style="padding:14px;border-radius:10px;background:#f0fdf4;color:#166534;font-weight:700">✓ ' + res.added + ' charges added' + (res.merged ? ' · ' + res.merged + ' were already in (merged, not doubled)' : '') + (res.failed ? ' · ' + res.failed + ' could not be saved' : '') +
            '<div style="font-weight:400;color:#334155;margin-top:4px">They are on each job\'s costs and the P&L now.' + (noJob ? ' ' + noJob + ' have no job yet — they wait in 📥 Needs a job (To-Do) until you pick one or mark them overhead.' : '') + ' The vendors\' categories and jobs are remembered for next month.</div></div>';
          W._gcMoney.lastImport = res;
        }
        next();
      });
    }
  });
}

/* ════════ 5. marketing spend from the books ════════ */
var AD_CH = [[/facebk|facebook|\bmeta\b|instagram|\bfb\b/i, 'Facebook/Instagram Ads'], [/google ?\*? ?ads|adwords|google ads|local services|\blsa\b/i, 'Google Ads'], [/angi|homeadvisor/i, 'Angi/HomeAdvisor'],
  [/thumbtack/i, 'Thumbtack'], [/nextdoor/i, 'Nextdoor'], [/roof ?ignite/i, 'Roof Ignite'], [/tiktok/i, 'TikTok'], [/porch/i, 'Porch'], [/modernize/i, 'Modernize'], [/networx/i, 'Networx'], [/bark\.com/i, 'Bark']];
function adChannel(t){ for (var i = 0; i < AD_CH.length; i++) if (AD_CH[i][0].test(s(t))) return AD_CH[i][1]; return ''; }
function mkSpend(spend){
  var base = arr(spend), have = {};
  var M = W.__gcMkCalc;
  base.forEach(function(x){ if (x.del) return; var ch = (M && M.normSource ? M.normSource(x.channel) : '') || s(x.channel); var mo = s(x.month || x.date).slice(0, 7); have[ch + '|' + mo] = 1; });
  var add = {};
  arr(crm().expenses).forEach(function(e){
    if (e.deleted || /reject|void/i.test(s(e.status))) return;
    var vendor = s(e.vendor || e.payee || e.desc), isAd = /advertis|marketing|lead\s*gen|leads?\b/i.test(s(e.category)) || AD_RE.test(low(vendor));
    if (!isAd) return;
    var amt = num(e.amt != null ? e.amt : e.amount); if (!(amt > 0)) return;
    var ch = adChannel(vendor + ' ' + s(e.desc)) || (M && M.normSource ? M.normSource(vendor) : '') || 'Other';
    var mo = s(e.date).slice(0, 7); if (!/^\d{4}-\d{2}$/.test(mo) || have[ch + '|' + mo]) return;
    var k = ch + '|' + mo; add[k] = add[k] || { channel: ch, month: mo, amount: 0, campaign: '', origin: 'expenses', note: 'from Expenses / card charges' }; add[k].amount = r2(add[k].amount + amt);
  });
  return base.concat(Object.keys(add).map(function(k){ return add[k]; }));
}
W._gcMoneyMkSpend = mkSpend;

/* ════════ owner setup: "What to set up in Accounting once" (🔧 Owner setup on the admins' To-Do) ════════ */
var SETUP = [
  { id: 'acct_cards', t: 'Add each credit card and bank account', how: '💎 → 💳 Credit cards → Add a card (name + last 4) for every company card. 💎 → 🏦 Bank Accounts → add each checking / savings account with today\'s balance.' },
  { id: 'acct_stmt', t: 'Import last month\'s card statements', how: 'Bank website → the card → Statements / Activity → Download → CSV. To-Do → 💳 Import card statement → pick the card → choose the file → Read → check the jobs → Import. Do it every month (about 10 minutes a card).' },
  { id: 'acct_rules', t: 'Teach the vendor rules once', how: 'In the first import, set the category and job (or Overhead) for each regular vendor (Home Depot, fuel, phones, software, ads). The CRM remembers them; next month they fill themselves. Change a rule by picking a different job / category in the next import.' },
  { id: 'acct_cats', t: 'Check the expense categories', how: 'Accounting → 🧾 Expense Center → categories. Keep: Materials, Subcontractor, Equipment Rental, Fuel/Gas, Permits/Fees, Dumpster/Disposal, Advertising/Marketing, Software/Phone, Office Supplies, Meals, Travel, Insurance, Payroll, Rent/Lease, Utilities. Match them to the QuickBooks chart of accounts names.' },
  { id: 'acct_mkt', t: 'Set the marketing sources and monthly budgets', how: '📣 Marketing → 📊 Dashboard → ad spend: one line per source per month (Google Ads, Facebook/Instagram, Angi, Roof Ignite…) — or let card charges to those vendors count by themselves (category Advertising/Marketing). Make sure every lead has its Source filled in, so cost per lead and per won job are right.' },
  { id: 'acct_open', t: 'Enter opening balances (Jan 1, 2026)', how: '💎 → 🏦 Bank Accounts → each account → opening balance on 1/1/2026 from the December 2025 bank statement. 💎 → 💳 Credit cards → each card → the balance owed on 1/1/2026.' },
  { id: 'acct_qb25', t: 'Import 2025 from QuickBooks (history)', how: 'First 💎 → ⏸ Data-entry mode → on. QuickBooks → Reports → Transaction Detail by Account (Jan 1 – Dec 31 2025) → Export → CSV; also Invoice List and Bill List. CRM → 💎 → 📥 Import from QuickBooks (CSV) → tick "Import as history" → choose each file. Then ▶ Resume sending.' },
  { id: 'acct_qbmail', t: 'QuickBooks: send GrayCo a copy of every invoice', how: 'QuickBooks → ⚙ → Account and settings → Sales → Messages → Edit → "Email me a copy" / Bcc new invoices to: invoices@grayco-cs.com → Save. Every invoice e-mailed from QuickBooks then shows up in ▥ Invoices on its job (the same invoice # is never added twice).' },
  { id: 'acct_mail', t: 'Invoices sent to anyone\'s e-mail reach the CRM', how: 'Turn on 🌐 All GrayCo e-mail (docs/EMAIL-ALL.md) — the CRM then reads office@, billing@, your and Nick\'s and the PMs\' inboxes for invoices. Or the Google routing rule in docs/MONEY-SETUP.md (Admin console → Gmail → Routing → "Also deliver to" invoices@in.grayco-cs.com).' }
];
function hookSetup(){
  var O = W._gcOwnerSetup; if (!O || !Array.isArray(O.items) || O.__gcMoney) return;
  if (Array.isArray(O.groups) && !O.groups.some(function(g){ return g[0] === 'acct'; })) O.groups.push(['acct', 'Accounting — set up once']);
  SETUP.forEach(function(x){ if (!O.items.some(function(y){ return y.id === x.id; })) O.items.push({ id: x.id, g: 'acct', t: x.t, how: x.how }); });
  O.__gcMoney = true; try { O.paint && O.paint(); } catch (e) {}
}
/* 💎 hub: one more door */
function hookHub(){
  if (W._gcOpenCardImport) return;
  W._gcOpenCardImport = openImport; W._gcOpenNeedsJob = openNeeds;
}

function tick(){
  try { hookSubInv(); hookSetup(); hookHub(); } catch (e) {}
  try { if (!D.hidden && D.getElementById('_todoMount')) paint(); } catch (e) {}
  try { var mm = W._gcMoneyMail && W._gcMoneyMail.state && W._gcMoneyMail.state(); if (mm && mm.at && mm.at !== P.seenAt) { P.seenAt = mm.at; process(mm.list, mm.done); } } catch (e) {}
}
tick(); RI.call(W, tick, 2500); later(function(){ loadRules(); }, 4000);
W._gcMoney = { parseStatement: parseStatement, suggest: suggest, vendorKey: vendorKey, catFor: catFor, rules: function(){ return R.rules; }, loadRules: loadRules, learn: learn, needs: needs, openNeeds: openNeeds, openImport: openImport, process: process, mkSpend: mkSpend, state: function(){ return P; }, SETUP: SETUP };
try { console.log('[GC] 📥 Needs a job · 💳 card statement import with vendor rules · e-mailed supplier bills / receipts / QuickBooks invoices booked · marketing spend from the books (patch MONEY)'); } catch (e) {}
})();
