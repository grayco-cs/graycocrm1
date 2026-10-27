/* ============================================================================
   GrayCo — THE office@ MAILBOX → RECEIPTS, SUB INVOICES AND ORDERS (patch SUBINV).   netlify/functions/_lib/money-box.js

   Owner (10/27): the CRM reads the office@ MAILBOX itself (not only what reaches invoices@), once "🌐 All GrayCo e-mail"
   is set up (docs/EMAIL-ALL.md: a Google service account with domain-wide delegation, scope gmail.readonly — read only).
   Every 15 minutes mail-all-sync looks at each mailbox's new mail (metadata). For the money mailboxes (MONEY_MAILBOXES,
   default office@grayco-cs.com) an incoming e-mail that looks like an invoice, a receipt or a supplier's order is queued
   (gc_kv "gc_mail_money_q"); the slow half (bid-inbox-background, 15 minutes allowed — the AI reads PDFs there) fetches
   the full message with its attachments and hands it to the SAME code as invoices@ / receipts@ / orders@:
     invoice → money-mail.js (sub_invoice → patch SUBINV: job, pending P&L cost, payable, ✅ Approvals);
     receipt → money-mail.js (receipt → 📧 Receipts e-mailed in → expense);
     order   → fa-orders.js (the job's deliveries).
   No duplicates when the same e-mail ALSO reached invoices@in (a Gmail filter, a routing rule, a forward): the record id
   comes from the Message-ID, and the same attachment (SHA-256) is never kept twice.
   Nothing here sends, changes or deletes mail.
   ========================================================================== */
'use strict';
const QKEY = 'gc_mail_money_q', QKEEP = 1500;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function env(k){ return s(process.env[k]); }
function core(){ return require('../portal.js')._core; }
function moneyBoxes(){ return (env('MONEY_MAILBOXES') || 'office@grayco-cs.com').split(',').map(low).filter(Boolean); }
const WORDS = /\b(invoice|inv\s*#|bill|billing|statement|pay\s*app(lication)?|amount\s+due|balance\s+due|receipt|order|confirmation|delivery|shipment|packing\s+slip)\b/i;
function staff(e){ return /@([a-z0-9-]+\.)*grayco-cs\.com$/i.test(s(e)); }
/* a mailbox row (metadata) worth fetching */
function candidate(r){
  if (!r || r.dir !== 'in' || !r.id) return false;
  if (arr(r.labels).some(function(l){ return l === 'SPAM' || l === 'TRASH' || l === 'DRAFT'; })) return false;
  const fwd = /^\s*(fwd?|fw)\s*:/i.test(s(r.subject));
  if (staff(r.from) && !fwd) return false;
  if (/^(mailer-daemon|postmaster|noreply-.*|.*-noreply)@/i.test(s(r.from)) && !WORDS.test(s(r.subject))) return false;
  return WORDS.test(s(r.subject)) || (r.att && WORDS.test(s(r.snippet)));
}
/* mail-all's sync hands over the rows of each mailbox it read → the queue (once per message) */
async function queue(box, rows, deps){
  box = low(box);
  if (moneyBoxes().indexOf(box) < 0) return 0;
  const since = Date.now() - Math.max(1, parseInt(env('MONEY_MAILBOX_DAYS') || '3', 10)) * 864e5;   /* the first look reads 30 days of mail: only the newest days become invoices */
  const add = arr(rows).filter(function(r){ return candidate(r) && !(Date.parse(r.at) < since); }).map(function(r){ return { key: box + ':' + r.id, box: box, id: s(r.id), mid: s(r.mid), subject: s(r.subject).slice(0, 160), at: new Date().toISOString() }; });
  if (!add.length) return 0;
  const C = (deps && deps.core) || core();
  let n = 0;
  const w = await C.kvListUpdate(QKEY, function(l){
    const have = {}; l.forEach(function(x){ if (x && x.key) have[x.key] = 1; });
    const fresh = add.filter(function(x){ return !have[x.key]; }); n = fresh.length;
    return fresh.length ? { list: l.concat(fresh).slice(-QKEEP), check: function(l2){ return fresh.every(function(f){ return l2.some(function(y){ return y && y.key === f.key; }); }); } } : null;
  });
  return w.ok ? n : 0;
}

/* one Gmail message (format=full) → the e-mail object the inbox code reads, with its attachments */
function fromB64u(v){ return Buffer.from(s(v).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
async function mailOf(G, box, id){
  const m = await G.api(box, '/messages/' + encodeURIComponent(id), { format: 'full' });
  const p = m.payload || {}, H = {};
  arr(p.headers).forEach(function(h){ if (h && h.name) H[low(h.name)] = s(h.value); });
  const body = G.bodyOf(m);
  const fromRaw = H.from || '', mm = /<([^>]+)>/.exec(fromRaw);
  const from = { email: low(mm ? mm[1] : fromRaw), name: s(mm ? fromRaw.slice(0, fromRaw.indexOf('<')) : '').replace(/^"|"$/g, '') };
  const files = [], skipped = [];
  const parts = [];
  (function walk(q){ if (!q) return; if (s(q.filename) && q.body && (q.body.attachmentId || q.body.data)) parts.push(q); arr(q.parts).forEach(walk); })(p);
  for (const q of parts.slice(0, 15)) {
    if ((q.body.size || 0) > 25 * 1024 * 1024) { skipped.push({ name: q.filename, why: 'over 25 MB' }); continue; }
    let buf = null;
    try { buf = q.body.data ? fromB64u(q.body.data) : fromB64u((await G.api(box, '/messages/' + encodeURIComponent(id) + '/attachments/' + encodeURIComponent(q.body.attachmentId))).data); } catch (e) { buf = null; }
    if (!buf || !buf.length) { skipped.push({ name: q.filename, why: 'could not be fetched' }); continue; }
    files.push({ name: s(q.filename), type: low(q.mimeType), size: buf.length, buf: buf });
  }
  const text = s(body.text) || s(body.html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ');
  return { id: 'gm_' + id, from: from, to: [], cc: [], subject: H.subject || '', text: text.slice(0, 40000), html: s(body.html).slice(0, 400000),
    date: m.internalDate ? new Date(parseInt(m.internalDate, 10)).toISOString() : (H.date || ''), files: files, skipped: skipped, headers: H, messageId: H['message-id'] || '' };
}

/* the Drive reader for a Google link in an invoice e-mail: as the mailbox owner (office@), then as the forwarder */
function driveExporter(asWho){
  return async function(link){
    const GD = require('./gdocs.js');
    for (const email of asWho.filter(Boolean)) {
      let t; try { t = await GD.tokenFor({ email: email, name: '' }); } catch (e) { t = null; }
      if (!t || !t.ok) continue;
      const base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(link.id);
      const url = link.kind === 'document' || link.kind === 'presentation' ? base + '/export?mimeType=text/plain' : link.kind === 'spreadsheets' ? base + '/export?mimeType=text/csv' : base + '?alt=media&supportsAllDrives=true';
      try {
        const r = await fetch(url, { headers: { Authorization: 'Bearer ' + t.t } });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer()), ct = low(r.headers.get('content-type')).split(';')[0];
        const SI = require('./subinv.js');
        const kind = link.kind === 'spreadsheets' ? 'csv' : (link.kind === 'document' || link.kind === 'presentation') ? 'txt' : (SI.kindOf('', ct) || 'pdf');
        return { ok: true, via: 'Google Drive (' + email + ')', kind: kind, buf: buf, type: kind === 'txt' ? 'text/plain' : kind === 'csv' ? 'text/csv' : ct };
      } catch (e) {}
    }
    return { ok: false };
  };
}
/* the deps money-mail.js needs (shared with bid-inbox.js's invoices@ path) */
function moneyDeps(storeFile, extra){
  const C = core();
  return Object.assign({
    storeFile: storeFile,
    kvListUpdate: function(k, f){ return C.kvListUpdate(k, f); },
    kvListRead: function(k){ return C.kvListRead(k); },
    crmData: function(){ return C.kvRead(['projects', 'subs', 'vendors', 'invs', 'invoices', 'gc_deleted_projects']); },
    doneRead: function(){ return C.kvRead(['gc_mail_money_done']).then(function(o){ const v = o && o.gc_mail_money_done; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }); },   /* patch MAILFIX */
    ai: require('./ai.js'),
    driveExport: driveExporter(moneyBoxes())
  }, extra || {});
}

/* the slow half: fetch and file what the queue holds (bid-inbox-background, or inline when that is not available) */
async function drain(opts){
  opts = opts || {};
  const G = opts.gmail || require('./gmail.js');
  if (!G.configured()) return { ok: true, skipped: 'Gmail reading is not set up' };
  const C = opts.core || core();
  const deadline = Date.now() + (opts.budgetMs || 600000);
  const MM = require('./money-mail.js'), FA = require('./fa-orders.js');
  const storeFile = opts.storeFile || require('../bid-inbox.js')._lib.storeFile;
  const cur = await C.kvListRead(QKEY);
  const todo = (cur ? cur.list : []).filter(function(x){ return x && !x.done; }).slice(0, opts.max || 40);
  const out = { ok: true, read: 0, filed: [] };
  for (const q of todo) {
    if (Date.now() > deadline) break;
    let res;
    try {
      const mail = await mailOf(G, q.box, q.id);
      out.read++;
      const fwd = /^\s*(fwd?|fw)\s*:/i.test(mail.subject);
      if (staff(mail.from.email) && !fwd) res = { ignored: 'sent by GrayCo' };
      else if (/^(out of office|automatic reply|auto(matic)?[- ]?reply|undeliverable)/i.test(mail.subject)) res = { ignored: 'automatic reply' };
      else {
        const kind = MM.kindFromWords(mail);
        if (kind) res = await MM.fromEmail(mail, kind, moneyDeps(storeFile, { via: q.box + ' mailbox' }));
        else if (FA.looksLikeOrder(mail)) res = Object.assign({ kind: 'order' }, await FA.fromEmail(mail));
        else res = { ignored: 'not an invoice, receipt or order' };
      }
    } catch (e) { res = { error: s(e && e.message).slice(0, 160) }; }
    const fail = !!res.error && !/404|not found/i.test(res.error);
    out.filed.push({ key: q.key, kind: res.kind || '', route: res.route || '', ignored: res.ignored || '', error: res.error || '' });
    await C.kvListUpdate(QKEY, function(l){
      const x = l.find(function(y){ return y && y.key === q.key; }); if (!x) return null;
      x.tries = (x.tries || 0) + 1;
      if (!fail || x.tries >= 3) { x.done = true; x.result = { kind: res.kind || '', route: res.route || '', ignored: res.ignored || '', error: res.error || '', id: res.id || res.order || '' }; x.doneAt = new Date().toISOString(); }
      return { list: l, check: function(l2){ const z = l2.find(function(y){ return y && y.key === q.key; }); return !!z && (z.tries || 0) >= x.tries; } };
    });
  }
  return out;
}
module.exports = { queue, drain, candidate, mailOf, moneyBoxes, moneyDeps, driveExporter, QKEY };
