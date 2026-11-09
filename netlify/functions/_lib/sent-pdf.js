/* ============================================================================
   GrayCo — EVERY PDF GRAYCO STAFF E-MAIL OUT IS KEPT IN THE CRM (patch SENTPDF).   netlify/functions/_lib/sent-pdf.js

   Owner (11/9): "save every PDF Glenn or PMs send into the CRM now" — "any PDF Glenn or any PM sends I want that in our
   system, along with if they make something on the estimate builder."
   The "🌐 All GrayCo e-mail" reader (mail-all-sync, every 15 minutes, Google domain-wide delegation, gmail.readonly) already
   sees every GrayCo mailbox. An e-mail SENT FROM a GrayCo mailbox to someone outside GrayCo with a PDF attached is queued
   here (gc_kv "gc_sent_pdf_q"); the background half fetches it and stores each PDF's exact bytes in the CRM's file store
   (crm-files, the file's SHA-256 is its name — the same file is never kept twice) and records it in gc_kv "gc_sent_pdfs":
     { id, at, box, by, to[], cc[], subject, name, ref, sha256, size, pid, cust, lead, mid, kind: 'proposal'|'pdf' }
   The job it belongs to is matched like the e-mail index does it (the recipient's address on a customer / job / lead, a
   PO like S251 in the subject). The CRM page puts each one in that job's Files & Docs ("Sent PDFs"); one with no job waits
   on the Estimates screen for "Link to job". Read only — nothing here sends, changes or deletes mail.
   ========================================================================== */
'use strict';
const QKEY = 'gc_sent_pdf_q', LKEY = 'gc_sent_pdfs', QKEEP = 1500, LKEEP = 3000;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function env(k){ return s(process.env[k]); }
function core(){ return require('../portal.js')._core; }
function staff(e){ return /@([a-z0-9-]+\.)*grayco-cs\.com$/i.test(s(e)); }
function on(){ return env('SENT_PDF_OFF') !== '1'; }
/* a mailbox row worth fetching: sent by this mailbox, an attachment, at least one outside recipient, not a draft */
function candidate(box, r){
  if (!r || r.dir !== 'out' || !r.id || !r.att) return false;
  if (arr(r.labels).some(function(l){ return l === 'DRAFT' || l === 'SPAM' || l === 'TRASH'; })) return false;
  if (low(r.from) && low(r.from) !== low(box) && !staff(r.from)) return false;
  const outside = arr(r.to).concat(arr(r.cc)).filter(function(e){ return e && !staff(e) && !/@in\.grayco-cs\.com$/i.test(e); });
  return outside.length > 0;
}
async function queue(box, rows, deps){
  if (!on()) return 0;
  box = low(box);
  const since = Date.now() - Math.max(1, parseInt(env('SENT_PDF_DAYS') || '7', 10)) * 864e5;
  const add = arr(rows).filter(function(r){ return candidate(box, r) && !(Date.parse(r.at) < since); }).map(function(r){
    return { key: box + ':' + r.id, box: box, id: s(r.id), mid: s(r.mid), subject: s(r.subject).slice(0, 200), at: s(r.at), to: arr(r.to).slice(0, 10), cc: arr(r.cc).slice(0, 10), pid: s(r.pid), cust: s(r.cust), lead: s(r.lead), queuedAt: new Date().toISOString() };
  });
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
function isPdf(f){ return /pdf/i.test(s(f && f.type)) || /\.pdf$/i.test(s(f && f.name)); }
function kindOf(name, subject){ return /proposal|estimate|quote|bid|pricing|scope/i.test(s(name) + ' ' + s(subject)) ? 'proposal' : 'pdf'; }
async function drain(opts){
  opts = opts || {};
  const G = opts.gmail || require('./gmail.js');
  if (!G.configured()) return { ok: true, skipped: 'Gmail reading is not set up' };
  const C = opts.core || core();
  const MB = opts.moneyBox || require('./money-box.js');
  const storeFile = opts.storeFile || require('../bid-inbox.js')._lib.storeFile;
  const deadline = Date.now() + (opts.budgetMs || 600000);
  const cur = await C.kvListRead(QKEY);
  const todo = (cur ? cur.list : []).filter(function(x){ return x && !x.done; }).slice(0, opts.max || 40);
  const out = { ok: true, read: 0, saved: 0 };
  for (const q of todo) {
    if (Date.now() > deadline) break;
    let res = { saved: [] }, fail = false;
    try {
      const mail = await MB.mailOf(G, q.box, q.id);
      out.read++;
      const pdfs = arr(mail.files).filter(isPdf);
      const rows = [];
      for (const f of pdfs) {
        const st = await storeFile(f.buf, 'application/pdf', f.name);
        if (!st || !st.ref) { fail = true; continue; }
        rows.push({ id: 'sp_' + st.hash.slice(0, 16) + '_' + s(q.id).slice(-8), at: s(mail.date) || q.at, box: q.box, by: q.box, to: q.to, cc: q.cc, subject: s(mail.subject || q.subject).slice(0, 200),
          name: s(f.name).slice(0, 160), ref: st.ref, sha256: st.hash, size: f.size, pid: q.pid, cust: q.cust, lead: q.lead, mid: q.mid || s(mail.messageId), kind: kindOf(f.name, mail.subject), savedAt: new Date().toISOString() });
      }
      if (rows.length) {
        const w = await C.kvListUpdate(LKEY, function(l){
          const have = {}; l.forEach(function(x){ if (x && x.id) have[x.id] = 1; });
          const fresh = rows.filter(function(r){ return !have[r.id]; });
          return fresh.length ? { list: l.concat(fresh).slice(-LKEEP), check: function(l2){ return fresh.every(function(f){ return l2.some(function(y){ return y && y.id === f.id; }); }); } } : null;
        });
        if (w && w.ok === false) fail = true; else { res.saved = rows.map(function(r){ return r.name; }); out.saved += rows.length; }
      }
    } catch (e) { res.error = s(e && e.message).slice(0, 160); fail = !/404|not found/i.test(res.error); }
    await C.kvListUpdate(QKEY, function(l){
      const x = l.find(function(y){ return y && y.key === q.key; }); if (!x) return null;
      x.tries = (x.tries || 0) + 1;
      if (!fail || x.tries >= 3) { x.done = true; x.result = { saved: res.saved || [], error: res.error || '' }; x.doneAt = new Date().toISOString(); }
      return { list: l, check: function(l2){ const z = l2.find(function(y){ return y && y.key === q.key; }); return !!z && (z.tries || 0) >= x.tries; } };
    });
  }
  return out;
}
module.exports = { queue, drain, candidate, isPdf, kindOf, QKEY, LKEY };
