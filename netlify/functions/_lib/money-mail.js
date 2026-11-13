/* ============================================================================
   GrayCo — RECEIPTS AND SUB INVOICES BY E-MAIL (patch OWNERTODO, part B).   netlify/functions/_lib/money-mail.js

   Owner (10/24): "invoices, receipts into crm — i have to finish that setup?"
   receipts@grayco-cs.com and invoices@grayco-cs.com are Google Groups (or aliases) whose member / routing copy is
   receipts@in.grayco-cs.com and invoices@in.grayco-cs.com — the same Resend receiving domain and webhook as bids@,
   leads@ and orders@, handled by bid-inbox.js, which hands such mail here.
   One e-mail → one record in gc_kv "gc_mail_money" { id, kind receipt | sub_invoice, at, from, fromName, subject,
   text, files[{ name, type, size, ref }], skipped[] }. Nothing is sent and nothing is booked here:
     · receipt     → the office To-Do "📧 Receipts e-mailed in": the CRM reads it with the 💳 receipt reader, the office
                     picks the job and taps ✅ Confirm → a pending expense (the usual approval);
     · sub_invoice → read and placed (patch SUBINV, _lib/subinv.js → rec.si): the CRM books a received sub invoice on the
                     job its address matches (+ the pending job cost), to approve — or asks "Match this invoice".
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const KEY = 'gc_mail_money', KEEP = 800;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function env(k){ return s(process.env[k]); }
function addrs(k, def){ return (env(k) || def).split(',').map(low).filter(Boolean); }
function receiptAddrs(){ return addrs('RECEIPT_INBOX_TO', 'receipts@in.grayco-cs.com,receipts@grayco-cs.com'); }
function invoiceAddrs(){ return addrs('INVOICE_INBOX_TO', 'invoices@in.grayco-cs.com,invoices@grayco-cs.com'); }
function hit(recipients, list, headers){
  if ((recipients || []).some(function(x){ return list.indexOf(low(x)) >= 0; })) return true;
  const lid = low((headers || {})['list-id']);   /* a Google Group keeps its own address in List-Id */
  return !!lid && list.some(function(w){ const p = w.split('@'); return p.length === 2 && lid.indexOf(p[0] + '.' + p[1]) >= 0; });
}
/* which money inbox an e-mail is for ('' = neither) */
function kindOf(recipients, headers){
  if (hit(recipients, receiptAddrs(), headers)) return 'receipt';
  if (hit(recipients, invoiceAddrs(), headers)) return 'sub_invoice';
  return '';
}
/* patch INVMAIL: one Message-ID however it is written (Resend / Gmail / a header copy: with or without < >, spaces) — "<x@y>" stays
   exactly what it was before, so the ids of records already kept do not change */
function midKey(v){ const m = s(v).replace(/^<+|>+$/g, '').trim(); return m ? '<' + m + '>' : ''; }
function mailId(mail){ return 'MM-' + crypto.createHash('sha256').update(midKey(mail.messageId) || s(mail.id) || (s(mail.subject) + '|' + s(mail.date) + '|' + s(mail.from && mail.from.email))).digest('hex').slice(0, 16); }

/* patch SUBINV: a sub's invoice comes as Word (.docx / .doc), PDF, a photo, Excel / CSV, a Google Doc / Sheet (attached or a
   link) or typed in the e-mail; a receipt is still a PDF or a photo (the CRM's 💳 receipt reader). */
function invoiceFile(f){ const k = SI().kindOf(f.name, f.type); return !!k && (k !== 'txt' || /inv|bill|statement/i.test(s(f.name))); }
function receiptFile(f){ return /^(application\/pdf|image\/)/i.test(s(f.type)) || /^(pdf|image)$/.test(SI().kindOf(f.name, f.type)); }
function SI(){ return require('./subinv.js'); }
/* the same file already came in (an invoices@ copy and the office@ mailbox, a re-forward): its SHA-256 */
/* patch MAILFIX: a copy the office SET ASIDE (gc_mail_money_done skip) never blocks the same file coming in again */
function seenFile(list, kind, hashes, id, done){
  if (!hashes.length) return null;
  done = done || {};
  return list.find(function(x){ return x && s(x.id) !== id && x.kind === kind && !(done[x.id] && done[x.id].skip) && (x.files || []).some(function(f){ return f && f.sha && hashes.indexOf(f.sha) >= 0; }); }) || null;
}

/* bid-inbox.js (and the office@ mailbox reader) hands over the e-mail;
   deps = { storeFile(buf, type, name), kvListUpdate(key, fn), kvListRead?(key), crmData?(), ai?, fetch?, driveExport?, via? } */
/* ── patch INVMAIL: ONE record per invoice, whichever mailboxes it came to (invoices@, Wesley, Nick, office@ …) ──
   rec.cameTo = the GrayCo addresses it was sent to / reached (To, Cc, the mailbox copies), rec.vias = each way it reached the CRM.
   The same Message-ID, the same attachment (SHA-256), or — when it reached the CRM a DIFFERENT way (another mailbox) — the same
   invoice (vendor + invoice # + amount) is noted on the record already kept instead of making a second one. */
const OURS_RE = /@grayco-cs\.com$/i;
function cameToOf(mail, deps){
  const out = [];
  function add(e){ e = low(e).replace(/^.*<|>.*$/g, ''); if (e && OURS_RE.test(e) && out.indexOf(e) < 0) out.push(e); }
  [].concat(mail.to || [], mail.cc || []).forEach(function(x){ add(x && typeof x === 'object' ? x.email : x); });
  (deps && Array.isArray(deps.cameTo) ? deps.cameTo : []).forEach(add);
  const v = low(deps && deps.via); const m = /^([a-z0-9._+-]+@grayco-cs\.com)/.exec(v); if (m) add(m[1]); else if (/^(invoices|receipts)@$/.test(v)) add(v + 'grayco-cs.com');
  return out.slice(0, 12);
}
function routeOf(via){ return low(via).replace(/\s*\(.*$/, '').replace(/\s+mailbox$/, '').replace(/@in\.grayco-cs\.com$|@grayco-cs\.com$/, '@'); }
function noteOn(x, cameTo, via, mid){
  let ch = false;
  x.cameTo = Array.isArray(x.cameTo) ? x.cameTo : [];
  cameTo.forEach(function(e){ if (x.cameTo.indexOf(e) < 0) { x.cameTo.push(e); ch = true; } });
  x.vias = Array.isArray(x.vias) ? x.vias : (x.via ? [s(x.via)] : []);
  if (via && x.vias.indexOf(via) < 0) { x.vias.push(via); ch = true; }
  if (mid) { x.mids = Array.isArray(x.mids) ? x.mids : []; if (x.mids.indexOf(mid) < 0 && x.mids.length < 12) { x.mids.push(mid); ch = true; } }
  return ch;
}
async function noteCame(deps, recId, cameTo, via, mid){
  if (!deps || !deps.kvListUpdate || !recId) return;
  try { await deps.kvListUpdate(KEY, function(l){ const x = l.find(function(y){ return y && s(y.id) === recId; }); if (!x || !noteOn(x, cameTo, via, mid)) return null; return { list: l, check: function(l2){ const z = l2.find(function(y){ return y && s(y.id) === recId; }); return !!z && cameTo.every(function(e){ return (z.cameTo || []).indexOf(e) >= 0; }); } }; }); } catch (e) {}
}
function cents(v){ return Math.round(num(v) * 100); }
/* the same invoice already kept (vendor + invoice # + amount) that reached the CRM ANOTHER way — not a duplicate to set aside, the same one */
function sameInvoice(list, rec, done){
  const r = (rec.si && rec.si.read) || {}, k = SI().invKey(r.invoiceNumber), amt = cents(r.total), route = routeOf(rec.via);
  if (!k || !(amt > 0)) return null;
  const vend = (rec.si.sub && rec.si.sub.conf >= 80 && rec.si.sub.id) || '';
  return list.find(function(x){
    if (!x || !x.si || s(x.id) === rec.id || x.kind !== rec.kind || (done[x.id] && done[x.id].skip)) return false;
    const xr = x.si.read || {};
    if (SI().invKey(xr.invoiceNumber) !== k || cents(xr.total) !== amt) return false;
    const routes = (Array.isArray(x.vias) && x.vias.length ? x.vias : [x.via]).map(routeOf);
    if (routes.indexOf(route) >= 0) return false;   /* the same way twice = a re-send: the office's ⚠️ Possible duplicate decides */
    const xs = x.si.sub || {};
    return (vend && s(xs.id) === vend && xs.conf >= 80) || (low(x.si.fromEmail) && low(x.si.fromEmail) === low(rec.si.fromEmail)) || SI().sameSub(xs.name || xr.vendor, (rec.si.sub && rec.si.sub.name) || r.vendor);
  }) || null;
}

async function fromEmail(mail, kind, deps){
  const id = mailId(mail);
  const cameTo = cameToOf(mail, deps), via0 = s(deps && deps.via) || (kind === 'receipt' ? 'receipts@' : 'invoices@'), mid0 = midKey(mail.messageId);
  /* patch MONEY: GrayCo's own invoice e-mailed by QuickBooks (a copy sent to office@ / invoices@) is a CLIENT invoice — never a bill */
  if (kind === 'sub_invoice' && SI().ownInvoice(mail)) kind = 'client_invoice';
  const files = [], keep = [];
  for (const f of (mail.files || [])) {
    if (!(kind === 'receipt' ? receiptFile(f) : invoiceFile(f))) continue;   /* client_invoice: the invoice PDF QuickBooks attached */
    const type = SI().typeFor(f.name, f.type);
    const st = await deps.storeFile(f.buf, type, f.name);
    if (!st.stored) throw new Error('could not keep ' + f.name + ' (' + (st.why || 'storage') + ')');
    const sha = st.hash || SI().fileHash(f.buf);
    files.push({ name: s(f.name).slice(0, 160), type: type, size: f.size, ref: st.ref, sha: sha });
    keep.push({ name: f.name, type: type, buf: f.buf, ref: st.ref, hash: sha });
  }
  const body = s(mail.text);
  const bodyInvoice = kind !== 'receipt' && !files.length && (SI().googleLinks(body + ' ' + s(mail.html)).length > 0 || (/\b(invoice|amount\s+due|balance\s+due)\b/i.test(body + ' ' + s(mail.subject)) && /\$?\s*\d[\d,]*\.\d{2}/.test(body)));
  if (!files.length && !bodyInvoice) return { ok: true, ignored: kind === 'receipt' ? 'no PDF or photo attached' : 'no invoice attached or typed in the e-mail', kind: kind };
  let cur = null; try { cur = deps.kvListRead ? await deps.kvListRead(KEY) : null; } catch (e) { cur = null; }
  const list = cur && Array.isArray(cur.list) ? cur.list : [];
  if (list.some(function(x){ return x && s(x.id) === id; })) { await noteCame(deps, id, cameTo, via0, mid0); return { ok: true, kind: kind, id: id, already: true, cameTo: cameTo }; }
  let done = {}; try { done = deps.doneRead ? (await deps.doneRead()) || {} : {}; } catch (e) { done = {}; }
  const same = deps.rerun ? null : seenFile(list, kind, files.map(function(f){ return f.sha; }), id, done);   /* a by-hand re-run: analyze's own duplicate check still flags a booked one */
  if (same) { await noteCame(deps, s(same.id), cameTo, via0, mid0); return { ok: true, kind: kind, id: id, already: true, sameFileAs: same.id }; }
  const rec = { id: id, kind: kind, at: new Date().toISOString(), from: low(mail.from && mail.from.email).slice(0, 120), fromName: s(mail.from && mail.from.name).slice(0, 120),
    subject: s(mail.subject).slice(0, 200), text: body.slice(0, 1500), files: files, skipped: (mail.skipped || []).slice(0, 8), via: via0,
    cameTo: cameTo, vias: [via0], mids: mid0 ? [mid0] : [] };   /* patch INVMAIL */
  /* patch MONEY: receipts and QuickBooks client invoices are read and placed too (receipt → an Expense on the job its PO / address
     names; client invoice → ▥ Invoices) — the same reader, job match and duplicate check as a sub invoice */
  if (kind === 'sub_invoice' || kind === 'receipt' || kind === 'client_invoice') {
    let data = {}; try { data = deps.crmData ? (await deps.crmData()) || {} : {}; } catch (e) { data = {}; }
    try { rec.si = await SI().analyze(mail, keep, { data: data, mailList: list.filter(function(x){ return !(x && done[x.id] && done[x.id].skip); }), selfId: id, ai: deps.ai, fetch: deps.fetch, driveExport: deps.driveExport, now: deps.now, kind: kind }); }
    catch (e) { rec.si = { v: 1, route: 'match', why: 'it could not be read (' + s(e && e.message).slice(0, 80) + ')', read: {}, top: [], at: rec.at }; }
    if (rec.si && rec.si.forwardedBy) { rec.forwardedBy = rec.si.forwardedBy; rec.from = rec.si.fromEmail || rec.from; rec.fromName = rec.si.fromName || rec.fromName; }
  }
  /* patch INVMAIL: the same invoice already came in another way (invoices@ and Wesley's / Nick's / office@'s mailbox) → noted on that one */
  if (rec.si && !deps.rerun) { const twin = sameInvoice(list, rec, done); if (twin) { await noteCame(deps, s(twin.id), cameTo, via0, mid0); return { ok: true, kind: kind, id: s(twin.id), already: true, sameInvoiceAs: s(twin.id), cameTo: cameTo }; } }
  const has = function(l){ return l.some(function(x){ return x && s(x.id) === id; }); };
  let twin2 = null;
  const w = await deps.kvListUpdate(KEY, function(l){
    twin2 = null;
    const ex = l.find(function(x){ return x && s(x.id) === id; }) || (!deps.rerun && seenFile(l, kind, files.map(function(f){ return f.sha; }), id, done)) || (rec.si && !deps.rerun ? sameInvoice(l, rec, done) : null);
    if (ex) { twin2 = s(ex.id); return noteOn(ex, cameTo, via0, mid0) ? { list: l, check: function(){ return true; } } : null; }   /* written meanwhile by another copy */
    return { list: l.concat([rec]).slice(-KEEP), check: has };
  });
  if (!w.ok) throw new Error('could not save it (' + (w.error || 'busy') + ')');
  if (twin2) return { ok: true, kind: kind, id: twin2, already: true, sameAs: twin2, cameTo: cameTo };
  return { ok: true, kind: kind, id: id, files: files.length, already: !!w.unchanged, cameTo: cameTo, route: rec.si ? rec.si.route : undefined, why: rec.si ? rec.si.why : undefined,
    jobId: rec.si && rec.si.job ? s(rec.si.job.pid) : undefined, job: rec.si && rec.si.job ? s(rec.si.job.name || rec.si.job.address).slice(0, 80) : undefined };
}
/* the office@ mailbox (patch SUBINV): which money inbox a mailbox e-mail belongs to ('' = none) */
function kindFromWords(mail){
  const sub = s(mail.subject), names = (mail.files || []).map(function(f){ return s(f.name); }).join(' '), t = sub + ' ' + names;
  if (/\b(receipt|paid|payment\s+confirmation|order\s+receipt)\b/i.test(t) && !/\binvoice\b/i.test(t)) return 'receipt';
  if (/\b(invoice|inv\s*#|bill|statement|pay\s*app(lication)?|amount\s+due|balance\s+due)\b/i.test(t)) return 'sub_invoice';
  if (/\b(invoice|amount\s+due|balance\s+due)\b/i.test(s(mail.text).slice(0, 3000)) && ((mail.files || []).length || /docs\.google\.com|drive\.google\.com/.test(s(mail.text)))) return 'sub_invoice';
  return '';
}
/* ════ patch BULKDROP: 📥 Drop invoices & receipts — files the office dropped into the CRM (owner 11/01: "yes add the drop many
   invoices button"). The CRM has already KEPT each file (crm-files, its SHA-256 name) and READ it (the 💳 receipt reader's AI,
   through claude-proxy); here each one is placed exactly like an e-mailed one — the same analyze() (the PO, the job-site
   address, the sub's only open job, the sub pay rule, retainage, duplicates) — and kept in gc_kv "gc_mail_money" (via
   "bulk drop"), so the CRM books it the same way: a sub's invoice → ▥ Invoices → ✅ Approvals (patch SUBINV), a supplier's bill
   or a receipt → a PENDING expense on the job (patch MONEY), anything not certain → 📥 Needs a job. Nothing is sent to anyone.
   items: [{ id, name, type, size, ref, sha, srcSha, kind: sub_invoice | supplier_invoice | receipt | other, read: { vendor,
   invoiceNumber, date, dueDate, total, subtotal, tax, jobAddress, po, jobName, paid, lines } }] → { results: [{ id, mmId, rec,
   already }] }. deps = { kvListUpdate, kvListRead, crmData, doneRead, now, by } ════ */
const DROP_KINDS = { sub_invoice: 1, supplier_invoice: 1, receipt: 1, other: 1 };
function dropId(it){ return 'MM-' + crypto.createHash('sha256').update('bulkdrop|' + (s(it.srcSha) || s(it.sha) || s(it.ref))).digest('hex').slice(0, 16); }
function num(v){ const n = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function ymd(v){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(v)); return m ? m[0] : ''; }
function dropRead(it){
  const r = it.read && typeof it.read === 'object' ? it.read : {}, k = DROP_KINDS[s(it.kind)] ? s(it.kind) : 'other';
  const total = Math.round(Math.abs(num(r.total)) * 100) / 100;
  return { vendor: s(r.vendor).slice(0, 120), vendorEmail: low(r.vendorEmail).slice(0, 120), invoiceNumber: s(r.invoiceNumber).slice(0, 60), invoiceDate: ymd(r.date || r.invoiceDate), dueDate: ymd(r.dueDate),
    terms: s(r.terms).slice(0, 60), jobAddress: s(r.jobAddress).slice(0, 200), po: s(r.po).toUpperCase().slice(0, 40), customer: s(r.jobName || r.customer).slice(0, 120),
    lines: (Array.isArray(r.lines) ? r.lines : []).slice(0, 10).map(function(l){ return { desc: s(l && l.desc).slice(0, 120), amount: Math.round(num(l && l.amount) * 100) / 100 }; }),
    subtotal: Math.round(num(r.subtotal) * 100) / 100, tax: Math.round(num(r.tax) * 100) / 100, retainage: 0, total: total,
    isInvoice: k !== 'other', weOwe: k === 'receipt' ? true : r.paid !== true };
}
async function fromDrop(items, deps){
  deps = deps || {};
  items = (Array.isArray(items) ? items : []).filter(function(it){ return it && /^sb:crm-files\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/.test(s(it.ref)); }).slice(0, 8);
  if (!items.length) return { ok: false, error: 'no stored file' };
  let cur = null; try { cur = deps.kvListRead ? await deps.kvListRead(KEY) : null; } catch (e) { cur = null; }
  const list = cur && Array.isArray(cur.list) ? cur.list : [];
  let done = {}; try { done = deps.doneRead ? (await deps.doneRead()) || {} : {}; } catch (e) { done = {}; }
  let data = {}; try { data = deps.crmData ? (await deps.crmData()) || {} : {}; } catch (e) { data = {}; }
  const mailList = list.filter(function(x){ return !(x && done[x.id] && done[x.id].skip); });
  const now = deps.now || Date.now(), at = new Date(now).toISOString(), out = [], add = [];
  for (const it of items) {
    const id = dropId(it), have = list.find(function(x){ return x && s(x.id) === id; });
    if (have) { out.push({ id: s(it.id), mmId: id, rec: have, already: true }); continue; }
    const k = DROP_KINDS[s(it.kind)] ? s(it.kind) : 'other', read = dropRead(it), name = s(it.name).slice(0, 160) || 'file';
    const kind = k === 'receipt' || k === 'other' ? 'receipt' : 'sub_invoice';   /* "other" waits in 📥 Needs a job like a receipt (Save on a job / Not ours) */
    const type = SI().typeFor(name, it.type);
    const file = { name: name, type: type, size: Math.max(0, parseInt(it.size, 10) || 0), ref: s(it.ref), sha: s(it.sha) || s(it.ref).replace(/^.*\/|\..*$/g, '') };
    if (s(it.srcSha) && s(it.srcSha) !== file.sha) file.srcSha = s(it.srcSha);
    const mail = { from: { email: '', name: read.vendor }, subject: name, text: '', date: at };
    /* patch SHIPTO: the dropped file's own text (its ship-to / job / deliver-to lines), read again from crm-files — no AI needed */
    let shipText = '';
    if (deps.loadRef && /^(pdf|docx|doc|xlsx|xls|csv|txt)$/.test(SI().kindOf(name, type))) { try { const b = await deps.loadRef(file.ref); if (b && b.length && b.length < 15e6) shipText = s(SI().textOf(b, SI().kindOf(name, type))).slice(0, 40000); } catch (e) {} }
    let si;
    try { si = await SI().analyze(mail, [{ name: name, type: type, ref: file.ref, hash: file.sha }], { data: data, mailList: mailList.concat(add), selfId: id, kind: kind, payee: k === 'supplier_invoice' ? 'supplier' : '', read: read, now: now, shipText: shipText }); }
    catch (e) { si = { v: 1, route: 'match', why: 'it could not be placed (' + s(e && e.message).slice(0, 80) + ')', read: read, top: [], at: at }; }
    if (k === 'other') { si.route = 'review'; si.why = 'the CRM could not tell it is an invoice or a receipt'; }
    else if (!(read.total > 0) && si.route !== 'dup') { si.route = 'match'; si.why = 'the amount could not be read'; }
    if (si.read) si.read.lines = (si.read.lines || []).slice(0, 10);
    si.src = 'bulk drop'; si.dropKind = k;
    const rec = { id: id, kind: kind, at: at, from: '', fromName: read.vendor || name, subject: name, text: '', files: [file], skipped: [], via: 'bulk drop', by: s(deps.by).slice(0, 120), dropId: s(it.id).slice(0, 60), si: si };
    add.push(rec); out.push({ id: s(it.id), mmId: id, rec: rec });
  }
  if (add.length) {
    const ids = add.map(function(r){ return r.id; });
    const has = function(l){ return ids.every(function(i){ return l.some(function(x){ return x && s(x.id) === i; }); }); };
    const w = await deps.kvListUpdate(KEY, function(l){ const fresh = add.filter(function(r){ return !l.some(function(x){ return x && s(x.id) === r.id; }); }); return fresh.length ? { list: l.concat(fresh).slice(-KEEP), check: has } : null; });
    if (!w.ok) throw new Error('could not save them (' + (w.error || 'busy') + ')');
  }
  return { ok: true, results: out };
}
module.exports = { fromEmail, seenFile, kindOf, mailId, midKey, cameToOf, sameInvoice, noteCame, receiptAddrs, invoiceAddrs, kindFromWords, fromDrop, dropId, KEY, DONE_KEY: 'gc_mail_money_done' };
