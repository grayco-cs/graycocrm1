/* netlify/functions/_lib/estpdf.js — patch ESTPDF: "when I pull up estimates here I want to pull up the PDF that was SENT
   OUT … The PDF has to be in the CRM to be sent out." (owner, 11/01)

   ONE record of every estimate / proposal that reached a customer, gc_kv "gc_est_sent" (a JSON list, changed only with
   portal.js kvListUpdate so no save is lost). Each entry is one version of one estimate:
     { id, estId, pid, leadId, name, ref: 'sb:crm-files/<sha256>.pdf', sha256, size, version, status: 'sent' | 'held',
       sentAt (the moment it really went — a 7 PM–7 AM e-mail: the 7 AM release), heldAt, releaseAt, sentTo, cc, sentBy,
       sentByEmail, via: 'crm-email' | 'proposal' | 'esign' | 'portal' | 'compose' | 'bid', channels: [...] }
   The same PDF (same sha256) sent again on another channel (the e-mail, then the portal) is the SAME version; a different
   PDF is the next version (v1, v2 …). The CRM folds these into the estimate (estimate.sentPdfs / sentPdf) and the job's
   Files & Docs.

   The owner's rule, enforced on the server for every approval that carries an estimate (aroundSend): the PDF must be in
   the CRM's file storage (crm-files) as a real PDF whose bytes match its fingerprint — else NOTHING is sent and the
   approval says "Couldn't save the PDF to the CRM — not sent. Try again." */
'use strict';
const crypto = require('crypto');
const KEY = 'gc_est_sent';
const BLOCK = "Couldn't save the PDF to the CRM — not sent. Try again.";
const REF_RE = /^sb:crm-files\/([0-9a-f]{64})\.pdf$/i;

function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function sbUrl(){ return s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function svc(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function H(){ const k = svc(); return { apikey: k, Authorization: 'Bearer ' + k }; }
function isPdfRef(ref){ return REF_RE.test(s(ref)); }
function sha256(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
function nowIso(){ return new Date(Date.now()).toISOString(); }   /* Date.now: a test can set the clock */
function newId(){ return 'es_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }

/* the stored PDF, read back from our private bucket: a real PDF whose bytes are its fingerprint (the file name) */
async function readPdf(ref){
  const m = REF_RE.exec(s(ref));
  if (!m) return { ok: false, why: 'not a PDF in the CRM' };
  if (!svc()) return { ok: false, why: 'SUPABASE_SERVICE_KEY is not set' };
  let r;
  try { r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + m[1].toLowerCase() + '.pdf', { headers: H() }); }
  catch (e) { return { ok: false, why: 'file storage not reachable' }; }
  if (!r || !r.ok) return { ok: false, why: 'HTTP ' + (r ? r.status : 0) };
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5 || buf.slice(0, 5).toString('latin1') !== '%PDF-') return { ok: false, why: 'not a PDF' };
  const h = sha256(buf);
  if (h !== m[1].toLowerCase()) return { ok: false, why: 'the stored file does not match its fingerprint' };
  return { ok: true, buf: buf, sha256: h, size: buf.length };
}

/* one version of one estimate; the same PDF again (same sha256 or the same entry id) is merged, never a new version */
async function record(core, e){
  const now = nowIso();
  let out = null;
  const r = await core.kvListUpdate(KEY, function(l){
    const mine = l.filter(function(x){ return x && s(x.estId) === s(e.estId) && x.status !== 'failed'; });
    const same = (e.id && l.find(function(x){ return x && x.id === e.id; })) || (e.sha256 && mine.find(function(x){ return x.sha256 === e.sha256; })) || null;
    if (same) {
      const ch = [].concat(Array.isArray(same.channels) ? same.channels : [same.via]).concat(e.via ? [e.via] : []).filter(function(x, i, a){ return x && a.indexOf(x) === i; });
      const up = Object.assign({}, same, { channels: ch, updatedAt: now });
      if (e.status === 'sent' && same.status !== 'sent') { up.status = 'sent'; up.sentAt = e.sentAt || now; }
      if (!s(up.sentTo) && s(e.sentTo)) up.sentTo = e.sentTo;
      if (e.portalAt && !up.portalAt) up.portalAt = e.portalAt;
      out = up;
      return { list: l.map(function(x){ return x === same ? up : x; }), check: function(l2){ return l2.some(function(y){ return y && y.id === up.id && y.updatedAt === now; }); }, result: up };
    }
    const v = mine.reduce(function(m, x){ return Math.max(m, +x.version || 0); }, 0) + 1;
    out = Object.assign({}, e, { id: e.id || newId(), version: v, channels: e.via ? [e.via] : [], createdAt: now, updatedAt: now });
    if (out.status === 'sent' && !out.sentAt) out.sentAt = now;
    return { list: l.concat([out]).slice(-3000), check: function(l2){ return l2.some(function(y){ return y && y.id === out.id; }); }, result: out };
  });
  return r && r.ok ? (r.result || out) : null;
}
/* a held e-mail went out at 7 AM (cust-release.js / cust-quiet.js "Send now"): the version is sent NOW */
async function markSent(core, id, how){
  if (!s(id)) return false;
  const now = nowIso();
  const r = await core.kvListUpdate(KEY, function(l){
    const x = l.find(function(y){ return y && y.id === s(id); }); if (!x || x.status === 'sent') return null;
    x.status = 'sent'; x.sentAt = now; x.releasedHow = s(how) || 'release'; x.updatedAt = now;
    return { list: l, check: function(l2){ return l2.some(function(y){ return y && y.id === s(id) && y.status === 'sent'; }); } };
  });
  return !!(r && r.ok);
}
async function list(core){ try { const cur = await core.kvListRead(KEY); return cur ? cur.list : []; } catch (e) { return []; } }

/* which estimate (and which PDF) an approval carries */
async function estimateOf(core, item){
  const k = s(item && item.kind), m = (item && item.meta) || {};
  if (k === 'portal_publish' && /^e:/.test(s(m.gateKey))) {
    const estId = s(m.gateKey).slice(2);
    const sent = (await list(core)).filter(function(x){ return s(x.estId) === estId && isPdfRef(x.ref) && x.status !== 'failed'; })
      .sort(function(a, b){ return (+b.version || 0) - (+a.version || 0); })[0];
    if (sent) return { estId: estId, pid: s(item.jobId || sent.pid), ref: sent.ref, name: s(sent.name), via: 'portal' };
    let data = null; try { data = await core.crmData(true); } catch (e) {}
    const d = arr(data && data.projectDocs).filter(function(x){ return x.deleted !== true && s(x.estimateId) === estId && isPdfRef(x.ref); })
      .sort(function(a, b){ return s(b.uploadedAt || b.savedAt || b.uploaded).localeCompare(s(a.uploadedAt || a.savedAt || a.uploaded)); })[0];
    return { estId: estId, pid: s(item.jobId), ref: d ? s(d.ref) : '', name: d ? s(d.name) : '', via: 'portal' };
  }
  if ((k === 'proposal_send' || /^sign_/.test(k)) && s(m.signRequestId)) {
    let r = null;
    try { const cur = await core.kvListRead('gc_sign_requests'); r = cur ? cur.list.find(function(x){ return x && s(x.id) === s(m.signRequestId); }) : null; } catch (e) {}
    if (!r || s(r.kind) !== 'estimate') return null;
    return { estId: s(r.refId), pid: s(r.pid || item.jobId), ref: s(r.docRef), name: s(r.docName || r.title), via: k === 'proposal_send' ? 'proposal' : 'esign', sentTo: s(item.to) };
  }
  return null;
}
/* portal.js aqSend, wrapped: an estimate goes out only with its PDF in the CRM; what went out is recorded */
async function aroundSend(core, item, now, raw){
  let est = null;
  try { est = await estimateOf(core, item); } catch (e) { est = null; }
  let pdf = null;
  if (est) {
    pdf = est.ref ? await readPdf(est.ref) : { ok: false, why: 'no PDF' };
    if (!pdf.ok) { try { console.log('[estpdf] blocked ' + s(item.kind) + ' for estimate ' + est.estId + ': ' + pdf.why); } catch (e) {} return { ok: false, error: BLOCK, estPdf: pdf.why }; }
  }
  const res = await raw(item, now);
  if (est && res && res.ok && !res.skipped) {
    const ap = arr(item.approvals).slice(-1)[0] || {};
    try {
      await record(core, { estId: est.estId, pid: est.pid, name: est.name, ref: est.ref, sha256: pdf.sha256, size: pdf.size, status: 'sent', sentAt: nowIso(),
        sentTo: est.via === 'portal' ? '' : s(item.to), sentBy: s(ap.by), sentByEmail: s(ap.email), via: est.via, approvalId: s(item.id), portalAt: est.via === 'portal' ? nowIso() : undefined });
    } catch (e) {}
  }
  return res;
}
/* an e-mail from someone's own address (send-email.js personal / bid) that attached an estimate's PDF from the job's
   files: that PDF is already in the CRM — it is recorded as a send of that estimate */
async function noteAttached(core, refs, o){
  refs = (refs || []).filter(isPdfRef); if (!refs.length) return 0;
  let data = null; try { data = await core.crmData(true); } catch (e) { return 0; }
  let n = 0;
  for (const ref of refs) {
    const d = arr(data && data.projectDocs).find(function(x){ return x.deleted !== true && s(x.ref) === ref && s(x.estimateId); });
    if (!d) continue;
    try { if (await record(core, { estId: s(d.estimateId), pid: s(d.pid || o.pid), name: s(d.name), ref: ref, sha256: REF_RE.exec(ref)[1].toLowerCase(), status: o.held ? 'held' : 'sent',
      sentAt: o.held ? '' : nowIso(), releaseAt: o.releaseAt || '', sentTo: s(o.to), sentBy: s(o.by), sentByEmail: s(o.byEmail), via: o.via || 'compose', emailId: s(o.emailId) })) n++; } catch (e) {}
  }
  return n;
}

module.exports = { KEY, BLOCK, REF_RE, isPdfRef, readPdf, record, markSent, list, estimateOf, aroundSend, noteAttached, sha256, newId };
