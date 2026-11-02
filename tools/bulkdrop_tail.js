/* __GC_PATCH_BULKDROP__ — 📥 DROP INVOICES & RECEIPTS: MANY FILES AT ONCE, EACH ONE WHERE IT BELONGS (owner 11/01: "yes add the
   drop many invoices button"). The owner enters expenses in QuickBooks and imports the CSV (💎 → Import from QuickBooks); a CSV
   carries no attachments, so the invoice / receipt PDFs and photos are dropped here, many at once.
   THE BUTTON lives on the Accounting screen (its tool row) and on the To-Do (next to 📥 Needs a job / 💳 Import card statement)
   — nowhere else — for admins and the office (the money people, as patch MONEY; never while viewing as someone else).
   A big drop zone (drag in, or pick many files; on a phone: many photos from the camera roll). Each file goes through a queue,
   3 at a time, with a progress line per file. The queue lives in this computer's IndexedDB ("gc_bulkdrop"): closing the window
   (or the CRM) loses nothing — it goes on in the background and resumes the next time the CRM opens.
   EACH FILE:
     1. KEPT FIRST: the CRM's own file store (window._gcStoreFile → crm-files, its SHA-256 name; it waits in IndexedDB until it
        is uploaded). A file is never lost — even one that cannot be read ends up in 📥 Needs a job with the file on it.
     2. READ by the 💳 receipt reader's AI (claude-proxy, the same model and answer length): kind (sub invoice / supplier
        invoice / receipt / other), vendor, invoice #, date, amount, the job address / PO / job name if printed.
     3. ALREADY IN THE CRM? the same file (its SHA-256, here, on an e-mailed one, or on an expense / invoice), or the same vendor +
        invoice # on a record that has its document → "already in the CRM", skipped, with a link to it.
     4. PLACED, in this order:
        (a) an existing line with no document yet — an expense (QuickBooks CSV import, card statement, typed in), a QuickBooks
            bill in ▥ Invoices, a QuickBooks entry waiting in the review queue — with the same vendor (fuzzy), the same amount
            (to the cent; a receipt within $0.50) and a date within 5 days (or the same invoice #): the file is ATTACHED to it.
            No second line is made.
        (b) a sub's invoice for a sub on the CRM's list: patch SUBINV's rules (the job by its PO / address / the sub's only open
            job, the sub pay rule, retainage) → ▥ Invoices (received) + the pending job cost → ✅ Approvals.
            Suppliers are not held to sub paperwork (patch SUPPLIERPAY: isSub false / type supplier | vendor | material).
        (c) a receipt or a supplier's bill with a clear job → a PENDING expense on that job (the usual approval, patch MONEY).
        (d) anything not certain → 📥 Needs a job, with the file, the CRM's best guess and why. Nothing is guessed silently.
        (b)–(d) are placed on the server exactly like an e-mailed invoice (bid-inbox ?moneymail=1 op "drop" → _lib/subinv.js
        analyze → gc_kv "gc_mail_money", via "bulk drop"), then booked here by patch SUBINV / MONEY's own code.
   THE SUMMARY: "42 files — 18 attached to QuickBooks lines, 9 sub invoices to Approvals, 7 expenses booked, 6 need a job,
   2 duplicates skipped"; each part filters the list, each row opens what it became (the job, ✅ Approvals, 📥 Needs a job…).
   Data-entry mode (⏸): the server places them the same way; nothing is sent to anyone (the summary says so).
   API: window._gcBulkDrop = { open, close, add(files), run, state, summary, items, reset } */
(function(){
'use strict';
if (window.__GC_PATCH_BULKDROP__) return; window.__GC_PATCH_BULKDROP__ = true;
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
function cents(v){ return Math.round(Math.abs(num(v)) * 100); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(v){ return '$' + r2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function nowIso(){ return new Date().toISOString(); }
function ymd(v){ var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(v)); return m ? m[0] : ''; }
function days(a, b){ var x = Date.parse(ymd(a) + 'T12:00:00Z'), y = Date.parse(ymd(b) + 'T12:00:00Z'); return isFinite(x) && isFinite(y) ? Math.abs(x - y) / 864e5 : 999; }
function crm(){ return W._crm || {}; }
function projects(){ return arr(crm().projects).filter(function(p){ return !p.deleted; }); }
function proj(pid){ return pid ? projects().filter(function(p){ return s(p.id) === s(pid); })[0] || null : null; }
function me(){ try { if (typeof W._gcMeUser === 'function') { var u = W._gcMeUser(); if (u) return u; } } catch (e) {} return {}; }
function myName(){ var u = me(); return s(u.name) || s(u.email).split('@')[0] || 'office'; }
function viewingAs(){ try { return !!(W._gcVAS && W._gcVAS.active && W._gcVAS.active()); } catch (e) { return false; } }
/* the money people (patch MONEY's rule): admins, the office, the owner — never while viewing as someone else */
function moneyPerson(){ var u = me(); if (viewingAs()) return false; return /^(admin|office)/i.test(s(u.role)) || /office/i.test(s(u.profile)) || low(u.payType) === 'owner'; }
function lsGet(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { W.localStorage.setItem(k, v); } catch (e) {} }

/* the 💳 receipt reader's AI (W._gcAUTAI.readReceipt): the same function, model and answer length */
var FN_AI = '/.netlify/functions/claude-proxy', AI_MODEL = 'claude-sonnet-4-6', AI_MAX = 1200;
var FN_MM = '/.netlify/functions/bid-inbox?moneymail=1';
var CONC = 3, MAX_AI_BYTES = 4 * 1024 * 1024, MAX_FILE = 45 * 1024 * 1024;
var OK_TYPE = /^(application\/pdf|image\/)/i, OK_EXT = /\.(pdf|jpe?g|png|gif|webp|heic|heif|tiff?|bmp)$/i;

/* ════════ 1. the queue, in this computer's IndexedDB (survives closing the window / the CRM) ════════ */
var Q = { items: [], loaded: false, running: 0, busy: {}, paused: false, at: 0 };
var dbP = null;
function idb(){
  if (dbP) return dbP;
  dbP = new Promise(function(res){
    try {
      var rq = W.indexedDB.open('gc_bulkdrop', 1);
      rq.onupgradeneeded = function(){ try { rq.result.createObjectStore('q', { keyPath: 'id' }); } catch (e) {} };
      rq.onsuccess = function(){ res(rq.result); };
      rq.onerror = function(){ res(null); };
      rq.onblocked = function(){ res(null); };
    } catch (e) { res(null); }
  });
  return dbP;
}
function tx(mode, fn){
  return idb().then(function(db){
    if (!db) return null;
    return new Promise(function(res){
      try { var t = db.transaction('q', mode), st = t.objectStore('q'), r = fn(st); t.oncomplete = function(){ res(r && 'result' in r ? r.result : true); }; t.onerror = t.onabort = function(){ res(null); }; }
      catch (e) { res(null); }
    });
  });
}
function load(){
  if (Q.loaded) return Promise.resolve(Q.items);
  return tx('readonly', function(st){ return st.getAll(); }).then(function(all){
    if (!Q.loaded) { var have = {}; Q.items.forEach(function(x){ have[x.id] = 1; }); arr(all).forEach(function(x){ if (!have[x.id]) Q.items.push(x); }); Q.items.sort(function(a, b){ return (a.n || 0) - (b.n || 0); }); }
    Q.loaded = true; return Q.items;
  });
}
/* the record without its bytes (the list in memory keeps no blobs once the file is kept) */
function save(it){ it.updatedAt = nowIso(); return tx('readwrite', function(st){ return st.put(it); }); }
function drop(it){ return tx('readwrite', function(st){ return st['delete'](it.id); }); }
function batchOf(id){ return Q.items.filter(function(x){ return x.batch === id; }); }
function lastBatch(){ var b = ''; Q.items.forEach(function(x){ if (s(x.batch) > b) b = s(x.batch); }); return b; }
function terminal(it){ return it.st === 'placed'; }

/* one runner per computer: a heartbeat in localStorage (two open tabs never place the same file twice) */
var TAB = 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), LOCK = 'gc_bulkdrop_run';
function lockMine(){
  var l = obj(lsGet(LOCK));
  if (l.tab && l.tab !== TAB && Date.now() - num(l.at) < 15000) return false;
  lsSet(LOCK, JSON.stringify({ tab: TAB, at: Date.now() })); return true;
}
function lockFree(){ var l = obj(lsGet(LOCK)); if (l.tab === TAB) lsSet(LOCK, '{}'); }

/* ════════ 2. small tools: SHA-256, base64, the names ════════ */
function hex(buf){ var a = new Uint8Array(buf), out = ''; for (var i = 0; i < a.length; i++) out += (a[i] < 16 ? '0' : '') + a[i].toString(16); return out; }
function sha256(blob){
  return blob.arrayBuffer().then(function(ab){
    if (W.crypto && W.crypto.subtle) return W.crypto.subtle.digest('SHA-256', ab).then(hex);
    return 'nosubtle-' + blob.size + '-' + s(blob.lastModified);
  });
}
function b64(blob){ return new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(String(fr.result).split(',')[1] || ''); }; fr.onerror = rej; fr.readAsDataURL(blob); }); }
function typeOf(name, type){
  var t = low(type).split(';')[0];
  if (t === 'image/jpg' || t === 'image/pjpeg') t = 'image/jpeg';
  if (t && t !== 'application/octet-stream') return t;
  var e = low(s(name).split('.').pop());
  return { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp' }[e] || t || 'application/octet-stream';
}
function refHash(ref){ var m = /^sb:[a-z0-9_-]+\/([0-9a-f]{64})\./.exec(s(ref)); return m ? m[1] : ''; }
function normName(v){ return low(v).replace(/&/g, ' and ').replace(/\b(llc|inc|co|corp|company|ltd|l\.l\.c|the)\b\.?/g, ' ').replace(/#\s*\d+/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function vkey(v){ try { if (W._gcMoney && W._gcMoney.vendorKey) { var k = W._gcMoney.vendorKey(v); if (k) return k; } } catch (e) {} return normName(v).split(' ').slice(0, 2).join(' '); }
function sameVendor(a, list){
  var x = normName(a); if (!x || x.length < 3) return false;
  var kx = vkey(a);
  return (list || []).some(function(v){
    var y = normName(v); if (!y) return false;
    if (x === y) return true;
    if (x.length >= 5 && y.length >= 5 && (x.indexOf(y) >= 0 || y.indexOf(x) >= 0)) return true;
    var ky = vkey(v); return !!(kx && ky && kx.length >= 4 && kx === ky);
  });
}
function invKey(v){ return low(v).replace(/^(inv(oice)?|#|no\.?)\s*/i, '').replace(/[^a-z0-9]/g, '').replace(/^0+/, ''); }
function docOf(x){
  var f = arr(x.files)[0] || arr(x.attachments)[0] || {};
  var ref = s(x.receipt || x.receiptRef || x.receiptUrl || x.fileData || x.fileRef || x.docRef || f.ref || f.url || f.data || x.photo || x.image || x.fileLink);
  return ref || (x.docSha ? 'sha:' + x.docSha : '');
}
function namesOf(x){ var d = s(x.desc).split(/\s[—–-]\s|:/)[0]; return [x.vendor, x.payee, x.sub, x.subName, x.merchant, x.name, d].filter(function(v){ return s(v); }); }

/* ════════ 3. what the CRM already has: file fingerprints, invoice #s, lines with no document ════════ */
function mmList(){ try { var st = W._gcMoneyMail && W._gcMoneyMail.state && W._gcMoneyMail.state(); return st ? arr(st.list) : []; } catch (e) { return []; } }
function mmDone(){ try { var st = W._gcMoneyMail && W._gcMoneyMail.state && W._gcMoneyMail.state(); return st ? obj(st.done) : {}; } catch (e) { return {}; } }
function qbQueue(){ return arr(lsGet('gc_pending_qbmap')).filter(function(x){ return x.status !== 'approved' && x.status !== 'denied'; }); }
function liveExp(e){ return e && !e.deleted && !/reject|void|denied|deleted/i.test(s(e.status)); }
function billish(i){ return i && !i.deleted && !/void|reject|cancel|deleted/i.test(s(i.status)) && (/^(sub|supplier|bill|vendor)$/i.test(s(i.type)) || (!i.type && (i.sub || i.vendor))); }
function linkFor(t, x){ return { t: t, id: s(x.id), pid: s(x.pid), name: s(x.vendor || x.payee || x.sub || x.fromName || x.desc).slice(0, 60) }; }
/* the same file (SHA-256 of what was dropped, or of the stored copy) */
function hashHit(hash, it){
  if (!hash) return null;
  var mine = Q.items.filter(function(x){ return x.id !== it.id && x.hash === hash && (terminal(x) ? x.out && x.out.k !== 'error' : (x.n || 0) < (it.n || 0)); })[0];
  if (mine) return { why: 'the same file was dropped ' + (mine.batch === it.batch ? 'in this batch' : s(mine.at).slice(0, 10)) + (mine.name !== it.name ? ' ("' + mine.name + '")' : ''), link: mine.out && mine.out.link ? mine.out.link : { t: 'drop', id: mine.id, name: mine.name } };
  var dn = mmDone();
  var mm = mmList().filter(function(r){ return !(dn[r.id] && dn[r.id].skip) && r.dropId !== it.id && arr(r.files).some(function(f){ return f.sha === hash || f.srcSha === hash || refHash(f.ref) === hash; }); })[0];
  if (mm) return { why: 'the same file came in ' + (mm.via === 'bulk drop' ? 'a drop' : 'by e-mail') + ' on ' + s(mm.at).slice(0, 10), link: linkFor('mm', mm) };
  var hit = null;
  arr(crm().expenses).some(function(e){ if (!liveExp(e)) return false; var d = docOf(e); if (e.docSha === hash || refHash(d) === hash || arr(e.files).some(function(f){ return refHash(f.ref) === hash; })) { hit = { why: 'the same file is on an expense (' + s(e.vendor || e.payee || e.desc).slice(0, 40) + ', ' + money(e.amt != null ? e.amt : e.amount) + ')', link: linkFor('exp', e) }; return true; } return false; });
  if (hit) return hit;
  arr(crm().invoices).some(function(i){ if (i.deleted) return false; if (i.docSha === hash || refHash(i.fileData) === hash || arr(i.files).some(function(f){ return refHash(f.ref) === hash; })) { hit = { why: 'the same file is on invoice ' + s(i.invNum || i.id) + ' (' + s(i.sub || i.vendor || i.client).slice(0, 40) + ')', link: linkFor('inv', i) }; return true; } return false; });
  return hit;
}
/* the same vendor + invoice # on something that already has its document → a duplicate (without a document → line (a)) */
function invNoHit(it){
  var r = it.read || {}, k = invKey(r.invoiceNumber); if (!k || k.length < 2 || !s(r.vendor)) return null;
  var hit = null;
  arr(crm().invoices).some(function(i){ if (!billish(i)) return false; if (invKey(i.invNum || i.invNo || i.number) !== k || !sameVendor(r.vendor, namesOf(i)) || !docOf(i)) return false; hit = { why: 'invoice # ' + s(r.invoiceNumber) + ' from ' + s(i.sub || i.vendor) + ' is already in ▥ Invoices (with its file)', link: linkFor('inv', i) }; return true; });
  if (hit) return hit;
  arr(crm().expenses).some(function(e){ if (!liveExp(e)) return false; if (invKey(e.invNum || e.invoiceNumber || e.ref) !== k || !sameVendor(r.vendor, namesOf(e)) || !docOf(e)) return false; hit = { why: 'invoice # ' + s(r.invoiceNumber) + ' from ' + s(e.vendor || e.payee) + ' is already an expense (with its file)', link: linkFor('exp', e) }; return true; });
  if (hit) return hit;
  var dn = mmDone();
  var mm = mmList().filter(function(x){ var rr = x.si && x.si.read; return rr && x.dropId !== it.id && s(x.id) !== s(it.mmId) && !(dn[x.id] && dn[x.id].skip) && invKey(rr.invoiceNumber) === k && sameVendor(r.vendor, [rr.vendor, x.fromName, x.si.sub && x.si.sub.name]); })[0];
  if (mm) return { why: 'invoice # ' + s(r.invoiceNumber) + ' from ' + s(mm.fromName) + ' came in ' + (mm.via === 'bulk drop' ? 'a drop' : 'by e-mail') + ' on ' + s(mm.at).slice(0, 10), link: linkFor('mm', mm) };
  var q = Q.items.filter(function(x){ return x.id !== it.id && x.read && x.out && /^(attached|subinv|expense|needs)$/.test(x.out.k) && invKey(x.read.invoiceNumber) === k && sameVendor(r.vendor, [x.read.vendor]); })[0];
  if (q) return { why: 'invoice # ' + s(r.invoiceNumber) + ' was dropped already ("' + q.name + '")', link: q.out.link || { t: 'drop', id: q.id, name: q.name } };
  return null;
}
/* (a) the line it pays for: no document yet, the same vendor, the same amount, within 5 days (or the same invoice #) */
function claimed(){ var c = {}; Q.items.forEach(function(x){ if (x.out && x.out.k === 'attached' && x.out.link) c[x.out.link.t + ':' + x.out.link.id] = 1; }); return c; }
function lines(){
  var out = [], cl = claimed();
  arr(crm().expenses).forEach(function(e){ if (!liveExp(e) || docOf(e) || cl['exp:' + s(e.id)]) return; out.push({ t: 'exp', x: e, amt: e.amt != null ? e.amt : e.amount, date: e.date || e.paidDate, inv: e.invNum || e.invoiceNumber || e.ref, src: /quickbooks|qb/i.test(s(e.source) + ' ' + s(e.by) + ' ' + s(e.subType)) ? 'qb' : /credit\s*card|creditcard|card|statement|bank/i.test(s(e.source) + ' ' + s(e.method) + ' ' + s(e.payMethod) + ' ' + s(e.by)) ? 'card' : 'crm' }); });
  arr(crm().invoices).forEach(function(i){ if (!billish(i) || docOf(i) || cl['inv:' + s(i.id)] || /^paid$/i.test(s(i.status)) && !/quickbooks/i.test(s(i.source))) return; out.push({ t: 'inv', x: i, amt: i.amt != null ? i.amt : i.amount, date: i.date || i.recvDate, inv: i.invNum || i.invNo, src: /quickbooks/i.test(s(i.source)) ? 'qb' : 'crm' }); });
  qbQueue().forEach(function(q){ if (docOf(q) || cl['qbq:' + s(q.id)]) return; out.push({ t: 'qbq', x: q, amt: q.amt, date: q.date, inv: q.invNum || q.num, src: 'qb' }); });
  return out;
}
function findLine(it){
  var r = it.read || {}, amt = cents(r.total), k = invKey(r.invoiceNumber), rcpt = it.kind === 'receipt';
  if (!(amt > 0) || !s(r.vendor)) return null;
  var best = [], top = -1;
  lines().forEach(function(c){
    var ca = cents(c.amt); if (!ca) return;
    var amtOk = ca === amt || (rcpt && Math.abs(ca - amt) <= 50); if (!amtOk) return;
    if (!sameVendor(r.vendor, namesOf(c.x))) return;
    var sc = -1, why = '';
    if (k && k.length >= 2 && invKey(c.inv) === k) { sc = 3; why = 'the same invoice # (' + s(r.invoiceNumber) + ')'; }
    else { var dd = days(r.date, c.date); if (!ymd(r.date) || !ymd(c.date) || dd > 5) return; sc = 2 - dd / 10; why = dd ? dd + ' day' + (dd === 1 ? '' : 's') + ' apart' : 'the same day'; }
    if (sc > top + 1e-9) { top = sc; best = [{ c: c, why: why }]; } else if (Math.abs(sc - top) < 1e-9) best.push({ c: c, why: why });
  });
  if (!best.length) return null;
  if (best.length > 1) return { ambiguous: best.length };
  return best[0];
}
function srcLabel(c){ return c.src === 'qb' ? 'QuickBooks' : c.src === 'card' ? 'card' : 'CRM'; }
/* attach the file to that line (no new line) */
function attach(hit, it){
  var c = hit.c, x = c.x, id = s(x.id), at = nowIso(), f = { name: it.name, ref: it.ref, type: it.storedType || it.type, sha: it.hash };
  var extra = { docSha: it.hash, docBy: myName() + ' (bulk drop)', docAt: at, docRead: { vendor: s(it.read.vendor), invoiceNumber: s(it.read.invoiceNumber), total: r2(it.read.total), date: ymd(it.read.date) }, updatedAt: at };
  if (c.t === 'exp') {
    if (typeof W._setExpenses !== 'function') return false;
    W._setExpenses(function(prev){ return (Array.isArray(prev) ? prev : []).map(function(e){ if (!e || s(e.id) !== id || docOf(e)) return e;
      return Object.assign({}, e, extra, { receipt: it.ref, receiptName: it.name, files: arr(e.files).concat([f]), invNum: e.invNum || s(it.read.invoiceNumber) || undefined }); }); });
  } else if (c.t === 'inv') {
    if (typeof W._setInvoices !== 'function') return false;
    W._setInvoices(function(prev){ return (Array.isArray(prev) ? prev : []).map(function(i){ if (!i || s(i.id) !== id || docOf(i)) return i;
      return Object.assign({}, i, extra, { fileName: it.name, fileData: it.ref, files: arr(i.files).concat([f]), invNum: i.invNum || s(it.read.invoiceNumber) || undefined }); }); });
  } else {
    var L = arr(lsGet('gc_pending_qbmap')).map(function(q){ return s(q.id) === id ? Object.assign({}, q, extra, { receipt: it.ref, receiptName: it.name, files: arr(q.files).concat([f]) }) : q; });
    lsSet('gc_pending_qbmap', JSON.stringify(L));
  }
  try { if (W._gcPushAll) later(function(){ W._gcPushAll(); }, 900); } catch (e) {}
  return true;
}

/* ════════ 4. the reader (the 💳 receipt reader's AI) ════════ */
var PROMPT = 'Read this document. It was sent to GrayCo Construction Services (a general contractor) as a bill, an invoice or a receipt. ' +
  'Return ONLY valid JSON, no markdown: {"kind":"sub_invoice|supplier_invoice|receipt|statement|other","vendor":"the company that billed / sold (the payee)",' +
  '"invoiceNumber":"","date":"YYYY-MM-DD","dueDate":"YYYY-MM-DD","total":number,"subtotal":number,"tax":number,"paid":true|false,' +
  '"jobAddress":"the job site / property address the work or material was for (not the vendor\'s or GrayCo\'s address)","po":"a GrayCo PO / job number if printed",' +
  '"jobName":"the customer / homeowner / job name if printed","lines":[{"desc":"","amount":number}]}. ' +
  'kind: sub_invoice = a subcontractor billing for work / labor; supplier_invoice = a supplier\'s or rental company\'s bill for materials / equipment; ' +
  'receipt = a store / card receipt already paid; statement = an account or card statement listing many charges; other = anything else. ' +
  'total = the amount due (an invoice) or paid (a receipt). At most 10 lines. Use null for anything not printed; never guess.';
function aiCall(content){
  var ctl = null; try { ctl = new AbortController(); } catch (e) {}
  var t = ctl ? later(function(){ try { ctl.abort(); } catch (e) {} }, 45000) : null;
  return W.fetch(FN_AI, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl ? ctl.signal : undefined,
    body: JSON.stringify({ model: AI_MODEL, max_tokens: AI_MAX, messages: [{ role: 'user', content: content }] }) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return { status: r.status, d: d }; }); })
    .then(function(x){ if (t) clearTimeout(t); return x; }, function(e){ if (t) clearTimeout(t); throw e; });
}
function parseRead(d){
  var t = arr(d && d.content).map(function(c){ return c.text || ''; }).join('').replace(/```json|```/g, '').trim();
  var o = null; try { o = JSON.parse(t); } catch (e) { var i = t.indexOf('{'), j = t.lastIndexOf('}'); if (i >= 0 && j > i) { try { o = JSON.parse(t.slice(i, j + 1)); } catch (e2) {} } }
  if (!o || typeof o !== 'object') return null;
  var k = low(o.kind).replace(/[\s-]+/g, '_');
  if (!/^(sub_invoice|supplier_invoice|receipt|statement|other)$/.test(k)) k = o.total ? 'supplier_invoice' : 'other';
  return { kind: k, read: { vendor: s(o.vendor).slice(0, 120), invoiceNumber: s(o.invoiceNumber).slice(0, 60), date: ymd(o.date), dueDate: ymd(o.dueDate), total: r2(o.total), subtotal: r2(o.subtotal), tax: r2(o.tax),
    paid: o.paid === true, jobAddress: s(o.jobAddress).slice(0, 200), po: s(o.po).slice(0, 40), jobName: s(o.jobName).slice(0, 120),
    lines: arr(o.lines).slice(0, 10).map(function(l){ return { desc: s(l.desc).slice(0, 120), amount: r2(l.amount) }; }) } };
}
/* a photo the AI can read: the stored (≤1600 px JPEG) copy; HEIC is turned into JPEG when this browser can open it */
function toJpeg(blob){
  if (typeof W.createImageBitmap !== 'function') return Promise.resolve(null);
  return W.createImageBitmap(blob).then(function(bm){
    var k = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = D.createElement('canvas'); c.width = Math.max(1, Math.round(bm.width * k)); c.height = Math.max(1, Math.round(bm.height * k));
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, 0, 0, c.width, c.height); try { bm.close(); } catch (e) {}
    return new Promise(function(res){ try { c.toBlob(function(b){ res(b); }, 'image/jpeg', 0.8); } catch (e) { res(null); } });
  }, function(){ return null; });
}
function aiInput(it){
  var pdf = /pdf/i.test(it.storedType || it.type);
  var get = it.ref && W._gcFileBlob ? W._gcFileBlob(it.ref).catch(function(){ return it.blob || null; }) : Promise.resolve(it.blob || null);
  return get.then(function(blob){
    if (!blob) return { err: 'the file could not be opened on this computer' };
    if (pdf) { if (blob.size > MAX_AI_BYTES) return { err: 'the PDF is over 4 MB — too big for the reader' }; return b64(blob).then(function(d){ return { part: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d } } }; }); }
    var t = low(blob.type || it.storedType || it.type);
    var ready = /^image\/(jpeg|png|gif|webp)$/.test(t) && blob.size <= MAX_AI_BYTES ? Promise.resolve(blob) : toJpeg(blob);
    return ready.then(function(b){
      if (!b) return { err: /hei[cf]/.test(t) ? 'a HEIC photo this browser cannot open — open the file and fill it in' : 'the picture could not be read' };
      return b64(b).then(function(d){ return { part: { type: 'image', source: { type: 'base64', media_type: b.type || 'image/jpeg', data: d } } }; });
    });
  });
}
function aiRead(it){
  return aiInput(it).then(function(inp){
    if (inp.err) return { err: inp.err };
    var content = [inp.part, { type: 'text', text: PROMPT + '\nFile name: ' + s(it.name) }];
    var go = function(n){
      return aiCall(content).then(function(x){
        if (x.status === 429 || x.status >= 500) { if (n < 2) return new Promise(function(res){ later(res, 1500 * (n + 1)); }).then(function(){ return go(n + 1); }); return { err: 'the reader did not answer (' + x.status + ')', retry: true }; }
        var p = parseRead(x.d); if (!p) return { err: (x.d && x.d.error && x.d.error.message) || 'the reader could not read it' };
        return p;
      }, function(){ if (n < 2) return new Promise(function(res){ later(res, 1500 * (n + 1)); }).then(function(){ return go(n + 1); }); return { err: 'the reader could not be reached', retry: true }; });
    };
    return go(0);
  });
}

/* ════════ 5. the server places it like an e-mailed invoice (bid-inbox ?moneymail=1, op drop) ════════ */
function place(items){
  return W.fetch(FN_MM, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'drop', items: items }) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return r.ok && j && j.ok ? j : { ok: false, status: r.status, error: s(j && j.error) || 'HTTP ' + r.status }; }); }, function(){ return { ok: false, status: 0, error: 'offline' }; });
}
/* the e-mailed-money list must be whole before ours go into it (the To-Do pulls it only when it is on screen) */
var pulled = null, pullTried = 0;
function ensurePulled(){
  var M = W._gcMoneyMail; if (!M || !M.pull || !M.state) return Promise.resolve();
  if (M.state().at || (!pulled && Date.now() - pullTried < 60000)) return Promise.resolve();
  if (!pulled) { pullTried = Date.now(); pulled = Promise.race([Promise.resolve(M.pull()).catch(function(){}), new Promise(function(res){ later(res, 9000); })]).then(function(){ pulled = null; }); }
  return pulled;
}
function inject(rec){
  try { var M = W._gcMoneyMail && W._gcMoneyMail.state && W._gcMoneyMail.state(); if (M && Array.isArray(M.list) && !M.list.some(function(x){ return x && x.id === rec.id; })) M.list.push(rec); } catch (e) {}
}
/* patch SUBINV / MONEY book what is certain (one pass for many files) */
var bookT = null;
function bookSoon(){ if (bookT) return; bookT = later(function(){ bookT = null; try { if (W._gcMoneyMail && W._gcMoneyMail.makeInvoices) W._gcMoneyMail.makeInvoices(); } catch (e) { try { console.warn('[GC] bulk drop: booking', e); } catch (x) {} } }, 400); }
function guessOf(si){ var j = si.job && proj(si.job.pid) ? si.job : arr(si.top).filter(function(x){ return proj(x.pid); })[0]; return j ? { pid: s(j.pid), name: s(j.name || (proj(j.pid) || {}).name), conf: num(j.conf), why: s(j.why) } : null; }
function dupTarget(d){
  if (!d) return null;
  if (d.invId) { var i = arr(crm().invoices).filter(function(x){ return s(x.id) === s(d.invId); })[0]; return i ? { link: linkFor('inv', i), doc: !!docOf(i) } : { link: { t: 'inv', id: s(d.invId) }, doc: true }; }
  if (d.expId) { var e = arr(crm().expenses).filter(function(x){ return s(x.id) === s(d.expId); })[0]; return e ? { link: linkFor('exp', e), doc: !!docOf(e) } : { link: { t: 'exp', id: s(d.expId) }, doc: true }; }
  if (d.mailId) { var m = mmList().filter(function(x){ return s(x.id) === s(d.mailId); })[0]; return { link: m ? linkFor('mm', m) : { t: 'mm', id: s(d.mailId) }, doc: true }; }
  return null;
}
function outcomeOf(rec, it){
  var si = rec.si || {};
  if (si.route === 'dup' && si.dup) {
    var tg = dupTarget(si.dup);
    if (tg && tg.doc && /invoice #|same file/i.test(s(si.dup.why))) return { k: 'dup', why: s(si.dup.why), link: tg.link, mm: rec.id };
    return { k: 'needs', why: 'possibly a duplicate: ' + s(si.dup.why), guess: guessOf(si), link: { t: 'needs', id: rec.id }, mm: rec.id };
  }
  var supplier = rec.kind === 'receipt' || si.payee === 'supplier';
  if (!supplier && rec.kind === 'sub_invoice') {
    var tk = null; try { tk = W._gcSubInv && W._gcSubInv.take ? W._gcSubInv.take(rec, { invoices: arr(crm().invoices), expenses: arr(crm().expenses) }) : null; } catch (e) { tk = { hold: true }; }
    if (tk && tk.inv) return { k: 'subinv', why: 'on ' + s((proj(tk.inv.pid) || {}).name) + ' — ' + s(si.job && si.job.why) + '; pays ' + s(tk.inv.payDate), link: { t: 'inv', id: tk.inv.id, pid: tk.inv.pid, name: tk.inv.sub }, amt: tk.inv.amt, mm: rec.id };
    if (tk && tk.skip === 'already') return { k: 'dup', why: 'this invoice is already in ▥ Invoices', link: { t: 'inv', id: 'INVM-' + s(rec.id).replace(/^MM-/, '') }, mm: rec.id };
    var held = ''; try { held = s((W._gcSubInv.state().held || {})[rec.id]); } catch (e) {}
    return { k: 'needs', why: held === 'dup' ? 'possibly a duplicate of an invoice already in ▥ Invoices' : s(si.why) || 'the job or the sub is not certain', guess: guessOf(si), link: { t: 'needs', id: rec.id }, mm: rec.id };
  }
  if (si.route === 'book' && si.job && proj(si.job.pid)) return { k: 'expense', why: 'pending on ' + s((proj(si.job.pid) || {}).name) + ' — ' + s(si.job.why), link: { t: 'exp', id: 'EXPM-' + s(rec.id).replace(/^MM-/, ''), pid: s(si.job.pid), name: s(si.read && si.read.vendor) }, mm: rec.id };
  var why = s(si.why) || 'no job matched';
  if (it.aiKind === 'statement') why = 'it looks like a card / bank statement — use 💳 Import card statement for its lines';
  return { k: 'needs', why: why, guess: guessOf(si), link: { t: 'needs', id: rec.id }, mm: rec.id };
}

/* ════════ 6. one file, step by step (each step saved: a closed window resumes where it stopped) ════════ */
function finish(it, out){ it.st = 'placed'; it.out = out; it.doneAt = nowIso(); delete it.blob; delete it.wait; return save(it); }
function stepStore(it){
  if (!it.blob) return finish(it, { k: 'error', why: 'the file was not kept on this computer — drop it again' });
  return ensurePulled().then(function(){ return sha256(it.blob); }).then(function(h){
    it.hash = h;
    var d = hashHit(h, it);
    if (d) return finish(it, { k: 'dup', why: d.why, link: d.link });
    if (typeof W._gcStoreFile !== 'function') throw new Error('the file store is not ready yet');
    var heic = /hei[cf]/i.test(it.type);
    return (heic ? toJpeg(it.blob) : Promise.resolve(null)).then(function(jpg){
      var name = jpg ? s(it.name).replace(/\.(heic|heif)$/i, '') + '.jpg' : it.name;
      var file; try { file = new File([jpg || it.blob], name, { type: jpg ? 'image/jpeg' : it.type }); } catch (e) { file = jpg || it.blob; }
      return W._gcStoreFile(file, { kind: 'doc', name: name });
    }).then(function(meta){
      if (!meta || !meta.ref) throw new Error('the file could not be kept');
      it.ref = meta.ref; it.storedType = meta.type || it.type; it.st = 'stored';
      try { if (W._gcFilesUploadNow) W._gcFilesUploadNow(); } catch (e) {}
      return save(it);
    });
  });
}
function stepRead(it){
  return aiRead(it).then(function(r){
    if (r.err && r.retry && (it.readTries || 0) < 2) { it.readTries = (it.readTries || 0) + 1; it.wait = Date.now() + 20000 * it.readTries; it.note = r.err + ' — trying again'; return save(it); }
    it.read = r.read || null; it.aiKind = r.kind || ''; it.kind = r.kind === 'statement' ? 'other' : (r.kind || 'other'); it.readErr = r.err || ''; it.st = 'read'; it.note = '';
    return save(it);
  });
}
function stepPlace(it){
  if (it.read) {
    var d = invNoHit(it);
    if (d) return finish(it, { k: 'dup', why: d.why, link: d.link });
    var hit = findLine(it);
    if (hit && hit.c && attach(hit, it)) {
      var c = hit.c, x = c.x;
      return finish(it, { k: 'attached', src: c.src, why: 'attached to the ' + srcLabel(c) + ' line: ' + s(x.vendor || x.payee || x.sub || x.desc).slice(0, 50) + ' · ' + money(c.amt) + ' · ' + ymd(c.date) + ' (' + hit.why + ')', link: linkFor(c.t, x) });
    }
    if (hit && hit.ambiguous) it.note = hit.ambiguous + ' lines fit — not attached';
  }
  return ensurePulled().then(function(){
    var read = it.read || {};
    return place([{ id: it.id, name: it.name, type: it.storedType || it.type, size: it.size, ref: it.ref, sha: refHash(it.ref), srcSha: it.hash, kind: it.read ? it.kind : 'other', read: read }]);
  }).then(function(j){
    if (!j.ok) {
      if (j.status === 401 || j.status === 403) { Q.authErr = j.error; }
      it.placeTries = (it.placeTries || 0) + 1; it.wait = Date.now() + Math.min(300000, 15000 * it.placeTries); it.note = 'waiting — ' + s(j.error).slice(0, 80);
      return save(it);
    }
    if (j.paused) Q.paused = true;
    var res = arr(j.results)[0] || {}, rec = res.rec;
    if (!rec) { it.placeTries = (it.placeTries || 0) + 1; it.wait = Date.now() + 30000; it.note = 'the server did not answer for it'; return save(it); }
    it.mmId = rec.id;
    if (res.already && rec.dropId && rec.dropId !== it.id) return finish(it, { k: 'dup', why: 'the same file was dropped on ' + s(rec.at).slice(0, 10), link: linkFor('mm', rec) });
    inject(rec);
    var out = outcomeOf(rec, it);
    if (!it.read && out.k === 'needs') out.why = (it.readErr ? it.readErr + ' — ' : 'not read — ') + 'open it and pick the job';
    if (out.k === 'dup') { try { if (W._gcMoneyDone) W._gcMoneyDone(rec.id, { done: true, skip: true, why: 'duplicate (bulk drop)', at: nowIso(), by: myName() }); } catch (e) {} }
    else bookSoon();
    return finish(it, out);
  });
}
function step(it){
  if (it.st === 'new') return stepStore(it);
  if (it.st === 'stored') return stepRead(it);
  if (it.st === 'read') return stepPlace(it);
  return Promise.resolve();
}
function nextItem(){
  var t = Date.now();
  return Q.items.filter(function(x){ return !terminal(x) && !Q.busy[x.id] && !(x.wait && x.wait > t); })[0] || null;
}
var runT = null;
function run(){
  if (!Q.loaded) { load().then(run); return; }
  if (!moneyPerson() || !lockMine()) { schedule(5000); return; }
  while (Q.running < CONC) {
    var it = nextItem(); if (!it) break;
    Q.running++; Q.busy[it.id] = 1;
    (function(it){
      var go = function(){ return step(it).then(function(){ if (!terminal(it) && !(it.wait && it.wait > Date.now())) return go(); }); };
      go().catch(function(e){
        it.errs = (it.errs || 0) + 1; it.note = s(e && e.message).slice(0, 100) || 'trouble';
        if (it.errs >= 6 && it.st === 'new') return finish(it, { k: 'error', why: 'it could not be kept: ' + it.note + ' — drop it again' });
        it.wait = Date.now() + Math.min(300000, 10000 * it.errs); return save(it);
      }).then(function(){ Q.running--; delete Q.busy[it.id]; Q.at = Date.now(); paintSoon(); run(); });
    })(it);
  }
  paintSoon();
  var left = Q.items.filter(function(x){ return !terminal(x); });
  if (!left.length && !Q.running) { lockFree(); return; }
  lsSet(LOCK, JSON.stringify({ tab: TAB, at: Date.now() }));
  if (left.length) { var w = left.map(function(x){ return x.wait || 0; }).filter(function(x){ return x > Date.now(); }); schedule(w.length && Q.running === 0 ? Math.max(500, Math.min.apply(null, w) - Date.now()) : 4000); }
}
function schedule(ms){ if (runT) clearTimeout(runT); runT = later(function(){ runT = null; run(); }, ms); }
var seq = 0;
function add(files){
  files = Array.prototype.slice.call(files || []);
  if (!files.length) return Promise.resolve([]);
  return load().then(function(){
    var batch = 'B' + Date.now().toString(36), at = nowIso(), base = Q.items.reduce(function(m, x){ return Math.max(m, x.n || 0); }, 0), made = [];
    files.forEach(function(f, i){
      var type = typeOf(f.name, f.type), it = { id: batch + '-' + (++seq) + '-' + i, batch: batch, n: base + i + 1, name: s(f.name) || 'file ' + (i + 1), type: type, size: f.size || 0, at: at, by: myName(), st: 'new', blob: f };
      if (!(OK_TYPE.test(type) || OK_EXT.test(it.name))) { it.st = 'placed'; it.out = { k: 'error', why: 'not a PDF or a photo — not taken' }; delete it.blob; }
      else if (f.size > MAX_FILE) { it.st = 'placed'; it.out = { k: 'error', why: 'over 45 MB — too big for the file store' }; delete it.blob; }
      Q.items.push(it); made.push(it);
    });
    Q.view = batch; Q.filter = '';
    return Promise.all(made.map(function(it){ return save(it); })).then(function(){ run(); paintSoon(); return made; });
  });
}

/* ════════ 7. the summary ════════ */
var KINDS = [['attached', '📎'], ['subinv', '🧾'], ['expense', '✅'], ['needs', '📥'], ['dup', '♻️'], ['error', '⚠️']];
function summary(batch){
  var L = batchOf(batch || Q.view || lastBatch()), c = { attached: 0, subinv: 0, expense: 0, needs: 0, dup: 0, error: 0 }, src = {}, left = 0;
  L.forEach(function(x){ if (!terminal(x)) { left++; return; } var k = x.out ? x.out.k : 'error'; c[k] = (c[k] || 0) + 1; if (k === 'attached') src[x.out.src || 'crm'] = 1; });
  var srcs = Object.keys(src), lineWord = srcs.length === 1 && srcs[0] === 'qb' ? 'QuickBooks' : srcs.length === 1 && srcs[0] === 'card' ? 'card' : 'existing';
  var parts = [];
  if (c.attached) parts.push({ k: 'attached', t: c.attached + ' attached to ' + (c.attached === 1 ? 'a' + (lineWord === 'existing' ? 'n ' : ' ') + lineWord + ' line' : lineWord + ' lines') });
  if (c.subinv) parts.push({ k: 'subinv', t: c.subinv + ' sub invoice' + (c.subinv === 1 ? '' : 's') + ' to Approvals' });
  if (c.expense) parts.push({ k: 'expense', t: c.expense + ' expense' + (c.expense === 1 ? '' : 's') + ' booked' });
  if (c.needs) parts.push({ k: 'needs', t: c.needs + (c.needs === 1 ? ' needs a job' : ' need a job') });
  if (c.dup) parts.push({ k: 'dup', t: c.dup + ' duplicate' + (c.dup === 1 ? '' : 's') + ' skipped' });
  if (c.error) parts.push({ k: 'error', t: c.error + ' not taken' });
  var text = L.length + ' file' + (L.length === 1 ? '' : 's') + (parts.length ? ' — ' + parts.map(function(p){ return p.t; }).join(', ') : '') + (left ? ' (' + left + ' still working)' : '');
  return { files: L.length, left: left, counts: c, parts: parts, text: text, done: !left && L.length > 0 };
}

/* ════════ 8. the window ════════ */
var CSS = '.gc-bd-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.6);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:inherit;box-sizing:border-box}' +
  '.gc-bd-card{background:#fff;color:#0f172a;border-radius:12px;width:min(820px,100%);padding:18px;margin-top:8px;box-sizing:border-box}' +
  '.gc-bd-zone{display:block;border:3px dashed #93c5fd;border-radius:12px;background:#eff6ff;padding:28px 12px;text-align:center;cursor:pointer;margin:10px 0;transition:background .15s}' +
  '.gc-bd-zone.on{background:#dbeafe;border-color:#1d4ed8}.gc-bd-zone b{display:block;font-size:19px;color:#1e3a8a}.gc-bd-zone span{font-size:13px;color:#475569}' +
  '.gc-bd-bar{height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin:6px 0}.gc-bd-bar i{display:block;height:100%;background:#16a34a;transition:width .3s}' +
  '.gc-bd-sum{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 12px;margin:8px 0;font-size:14px}.gc-bd-sum.wip{background:#f8fafc;border-color:#e2e8f0}' +
  '.gc-bd-chip{display:inline-block;margin:4px 6px 0 0;padding:5px 10px;border-radius:99px;border:1px solid #cbd5e1;background:#fff;font-size:12.5px;font-weight:700;cursor:pointer;color:#0f172a}.gc-bd-chip.on{background:#1d4ed8;color:#fff;border-color:#1d4ed8}' +
  '.gc-bd-list{max-height:52vh;overflow:auto;border:1px solid #e2e8f0;border-radius:10px}.gc-bd-row{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-top:1px solid #f1f5f9;font-size:13px}.gc-bd-row:first-child{border-top:none}' +
  '.gc-bd-row .n{font-weight:700;word-break:break-word}.gc-bd-row .w{color:#475569;font-size:12.5px;margin-top:2px;word-break:break-word}.gc-bd-row .m{flex:1;min-width:0}.gc-bd-row button{flex:0 0 auto;padding:5px 9px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;font-size:12px}' +
  '.gc-bd-row.k-needs .w{color:#92400e}.gc-bd-row.k-error .w{color:#b91c1c}.gc-bd-btn{border:1px solid #7c3aed;background:#7c3aed;color:#fff;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;font-size:13px}' +
  '@media (max-width:600px){.gc-bd-ov{padding:8px}.gc-bd-card{padding:12px}.gc-bd-zone{padding:22px 8px}.gc-bd-row{flex-wrap:wrap}}';
function css(){ if (D.getElementById('gc-bd-css')) return; var st = D.createElement('style'); st.id = 'gc-bd-css'; st.textContent = CSS; D.head.appendChild(st); }
var OV = null;
var STATE_TXT = { 'new': 'keeping the file…', stored: 'reading…', read: 'placing…' };
function rowHtml(x){
  var k = terminal(x) ? (x.out ? x.out.k : 'error') : 'wip', icon = k === 'wip' ? '⏳' : (KINDS.filter(function(p){ return p[0] === k; })[0] || ['', '•'])[1];
  var r = x.read || {}, what = r.vendor ? s(r.vendor) + (r.total ? ' · ' + money(r.total) : '') + (r.invoiceNumber ? ' · #' + s(r.invoiceNumber) : '') + (r.date ? ' · ' + r.date : '') : '';
  var w = k === 'wip' ? (x.wait && x.wait > Date.now() ? s(x.note) || 'waiting…' : (Q.busy[x.id] ? STATE_TXT[x.st] || '…' : 'in the queue')) : s(x.out && x.out.why);
  if (k === 'needs' && x.out.guess) w += ' · best guess: ' + s(x.out.guess.name) + (x.out.guess.conf ? ' (' + x.out.guess.conf + '%)' : '');
  var open = k === 'wip' || k === 'error' ? '' : '<button type="button" data-bd="go" title="Open what it became">' + (k === 'needs' ? '📥 Pick the job' : k === 'subinv' ? '✅ Approvals' : k === 'dup' ? '🔗 Open it' : '🔗 Open') + '</button>';
  return '<div class="gc-bd-row k-' + k + '" data-id="' + esc(x.id) + '"><span>' + icon + '</span><div class="m"><div class="n">' + esc(x.name) + '</div>' + (what ? '<div class="w" style="color:#0f172a">' + esc(what) + '</div>' : '') + '<div class="w">' + esc(w) + '</div></div>' +
    (x.ref ? '<button type="button" data-bd="file" title="Open the file">📄</button>' : '') + open + '</div>';
}
function render(){
  if (!OV || !D.body.contains(OV)) { OV = null; return; }
  var batch = Q.view || lastBatch(), L = batchOf(batch), sm = summary(batch), done = L.length - sm.left;
  var list = Q.filter ? L.filter(function(x){ return terminal(x) && x.out && x.out.k === Q.filter; }) : L;
  var box = OV.querySelector('[data-bd="body"]'); if (!box) return;
  if (!L.length) { box.innerHTML = '<div style="color:#64748b;font-size:13px;padding:6px 2px">Nothing dropped yet.</div>'; return; }
  var sig = JSON.stringify([batch, Q.filter, L.map(function(x){ return [x.id, x.st, x.out && x.out.k, !!Q.busy[x.id], x.note, x.read && x.read.vendor]; }), Q.paused, Q.authErr]);
  if (sig === OV.__sig) return; OV.__sig = sig;
  var sc = OV.querySelector('.gc-bd-list'), top = sc ? sc.scrollTop : 0;
  box.innerHTML = '<div class="gc-bd-bar" aria-label="progress"><i style="width:' + Math.round(done * 100 / L.length) + '%"></i></div>' +
    '<div class="gc-bd-sum' + (sm.done ? '' : ' wip') + '" data-bd="sum"><b>' + esc(sm.text) + '</b>' +
    (sm.parts.length ? '<div>' + sm.parts.map(function(p){ return '<button type="button" class="gc-bd-chip' + (Q.filter === p.k ? ' on' : '') + '" data-bd="f" data-k="' + p.k + '">' + esc(p.t) + '</button>'; }).join('') + (Q.filter ? '<button type="button" class="gc-bd-chip" data-bd="f" data-k="">Show all</button>' : '') + '</div>' : '') +
    (Q.paused ? '<div style="margin-top:6px;font-size:12.5px;color:#92400e">⏸ Data-entry mode is on — the files were placed; nothing was sent to anyone.</div>' : '') +
    (Q.authErr ? '<div style="margin-top:6px;font-size:12.5px;color:#b91c1c">' + esc(Q.authErr) + '</div>' : '') +
    (sm.done && sm.counts.needs ? '<div style="margin-top:6px"><button type="button" class="gc-bd-btn" data-bd="needs">📥 Open Needs a job (' + sm.counts.needs + ')</button></div>' : '') + '</div>' +
    '<div class="gc-bd-list">' + list.map(rowHtml).join('') + '</div>';
  var sc2 = OV.querySelector('.gc-bd-list'); if (sc2) sc2.scrollTop = top;
}
var paintT = null;
function paintSoon(){ if (paintT || !OV) return; paintT = later(function(){ paintT = null; render(); }, 250); }
function go(link){
  if (!link) return;
  var p = link.pid ? proj(link.pid) : null;
  close();
  try {
    if (link.t === 'needs') { if (W._gcOpenNeedsJob) W._gcOpenNeedsJob(); return; }
    if (link.t === 'mm') { var mm = mmList().filter(function(x){ return x.id === link.id; })[0]; if (mm && W._gcOpenNeedsJob && !(mmDone()[mm.id] || {}).done) { W._gcOpenNeedsJob(); return; } }
    if (link.t === 'inv') { var iv = arr(crm().invoices).filter(function(x){ return s(x.id) === link.id; })[0] || {}; if (iv.subinv && /received|pending/i.test(s(iv.status)) && W._gcOpenApprovals) { W._gcOpenApprovals(); return; } if (!p && iv.pid) p = proj(iv.pid); }
    if (link.t === 'exp' && !p) { var e = arr(crm().expenses).filter(function(x){ return s(x.id) === link.id; })[0]; if (e && e.pid) p = proj(e.pid); }
    if (p) { if (typeof W._gcOpenProject === 'function') W._gcOpenProject(p); else if (W._openJobDetail) W._openJobDetail(p); if (W._setView) W._setView('projects'); return; }
    if (link.t === 'inv' && W._gcOpenAllInvoices) { W._gcOpenAllInvoices(); return; }
    if (W._gcOpenExpenseCenter) W._gcOpenExpenseCenter();
  } catch (e) {}
}
function open(){
  css(); load().then(function(){ if (!Q.view) Q.view = lastBatch(); run(); render(); });
  if (OV && D.body.contains(OV)) return OV;
  OV = D.createElement('div'); OV.className = 'gc-bd-ov'; OV.setAttribute('data-gc-keep', '1'); OV.setAttribute('data-gc-linked', '1');
  OV.innerHTML = '<div class="gc-bd-card" role="dialog" aria-label="Drop invoices and receipts">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="font-size:18px">📥 Drop invoices & receipts</b><button type="button" data-bd="x" aria-label="Close" style="border:none;background:none;font-size:22px;cursor:pointer">✕</button></div>' +
    '<div style="font-size:12.5px;color:#475569;margin:4px 0 0">Every invoice, bill and receipt — PDFs and photos, as many as you like. Each one is kept in the CRM\'s files, read, and put where it belongs: on the QuickBooks / card line it pays for, a sub\'s invoice to ✅ Approvals, a receipt or supplier bill on its job — or 📥 Needs a job when the CRM is not sure. You can close this window; it keeps going.</div>' +
    '<label class="gc-bd-zone" data-bd="zone"><b>Drop the files here</b><span>or tap to pick (many at once — on a phone, from your photos)</span>' +
    '<input type="file" data-bd="pick" multiple accept="application/pdf,.pdf,image/*,.heic,.heif" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"></label>' +
    '<div data-bd="body"></div></div>';
  D.body.appendChild(OV);
  var zone = OV.querySelector('[data-bd="zone"]'), pick = OV.querySelector('[data-bd="pick"]');
  ['dragenter', 'dragover'].forEach(function(n){ OV.addEventListener(n, function(e){ e.preventDefault(); zone.classList.add('on'); }); });
  ['dragleave', 'drop'].forEach(function(n){ OV.addEventListener(n, function(e){ e.preventDefault(); if (n === 'drop' || e.target === OV) zone.classList.remove('on'); }); });
  OV.addEventListener('drop', function(e){ var f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) add(f); });
  pick.addEventListener('change', function(){ if (pick.files && pick.files.length) add(pick.files); try { pick.value = ''; } catch (e) {} });
  OV.addEventListener('click', function(ev){
    var t = ev.target, b = t && t.closest ? t.closest('[data-bd]') : null, a = b ? b.getAttribute('data-bd') : '';
    if (t === OV || a === 'x') { close(); return; }
    if (a === 'f') { Q.filter = b.getAttribute('data-k') || ''; OV.__sig = ''; render(); return; }
    if (a === 'needs') { close(); if (W._gcOpenNeedsJob) W._gcOpenNeedsJob(); return; }
    var row = t.closest && t.closest('[data-id]'); if (!row) return;
    var it = Q.items.filter(function(x){ return x.id === row.getAttribute('data-id'); })[0]; if (!it) return;
    if (a === 'file') { try { if (W._gcOpenRef) W._gcOpenRef(it.ref, it.name); } catch (e) {} return; }
    if (a === 'go') go(it.out && it.out.link);
  });
  render();
  return OV;
}
function close(){ if (OV) { try { OV.remove(); } catch (e) {} } OV = null; }

/* ════════ 9. the button: the Accounting screen's tool row and the To-Do — nowhere else ════════ */
function btnLabel(){ var left = Q.items.filter(function(x){ return !terminal(x); }).length; return '📥 Drop invoices & receipts' + (left ? ' (' + left + ' working…)' : ''); }
/* after: put it right after that element; else before: right before that one; else at the end of parent */
function ensureBtn(id, parent, after, before, cls, style){
  var b = D.getElementById(id);
  if (!b) { b = D.createElement('button'); b.type = 'button'; b.id = id; b.className = 'gc-bulkdrop-btn ' + (cls || ''); b.setAttribute('data-gc-keep', '1'); b.setAttribute('data-gc-linked', '1'); if (style) b.style.cssText = style; b.addEventListener('click', function(e){ e.preventDefault(); open(); }); }
  var placed = b.parentElement === parent && (after ? after.nextSibling === b : before ? b.nextSibling === before : true);
  if (!placed) parent.insertBefore(b, after ? after.nextSibling : (before || null));
  var l = btnLabel(); if (b.textContent !== l) b.textContent = l;
  return b;
}
function paintBtns(){
  var ok = moneyPerson();
  /* To-Do: right after patch MONEY's row (📥 Needs a job · 💳 Import card statement · 🏦 Import bank statement) */
  var mount = D.getElementById('_todoMount'), host = D.getElementById('gc-money-needs'), tb = D.getElementById('gc-bulkdrop-todo');
  if (ok && mount && mount.parentElement) {
    var anchor = host && host.parentElement === mount.parentElement ? host : null;
    ensureBtn('gc-bulkdrop-todo', mount.parentElement, anchor, anchor ? null : mount, '', 'display:inline-block;margin:0 0 8px;border:1px solid #7c3aed;background:#7c3aed;color:#fff;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer');
  } else if (tb) tb.remove();
  /* Accounting: in its own tool row (it is redrawn with the screen, so it never outlives it) */
  var tools = D.querySelector('#gck-root .gck-tools'), ab = D.getElementById('gc-bulkdrop-acct');
  if (ok && tools && low(lsGet('grayco_view')) === 'taxcenter') ensureBtn('gc-bulkdrop-acct', tools, null, null, 'gck-btn', 'background:#7c3aed;color:#fff;border-color:#7c3aed;font-weight:700');
  else if (ab) ab.remove();
  /* never anywhere else */
  Array.prototype.forEach.call(D.querySelectorAll('.gc-bulkdrop-btn'), function(b){
    var good = (b.id === 'gc-bulkdrop-todo' && mount && b.parentElement === mount.parentElement) || (b.id === 'gc-bulkdrop-acct' && tools && b.parentElement === tools);
    if (!good || !ok) b.remove();
  });
}

/* ════════ 10. the light tick + the resume ════════ */
var booted = false;
function tick(){
  if (D.hidden) return;
  try { paintBtns(); } catch (e) {}
  if (!booted && moneyPerson() && arr(crm().projects).length && typeof W._gcStoreFile === 'function') {
    booted = true;
    load().then(function(){ if (Q.items.some(function(x){ return !terminal(x); })) run(); });   /* the queue a closed window left goes on */
  }
}
RI.call(W, tick, 1500); later(tick, 1200);
W._gcBulkDrop = { open: open, close: close, add: add, run: run, summary: summary, state: function(){ return Q; }, items: function(){ return Q.items.slice(); },
  reset: function(){ Q.items = []; Q.loaded = true; Q.view = ''; Q.filter = ''; Q.paused = false; return tx('readwrite', function(st){ return st.clear(); }); }, _t: { findLine: findLine, hashHit: hashHit, invNoHit: invNoHit, sameVendor: sameVendor, outcomeOf: outcomeOf, parseRead: parseRead } };
try { console.log('[GC] 📥 Drop invoices & receipts: many files → kept, read, attached / booked / Needs a job (patch BULKDROP)'); } catch (e) {}
})();
