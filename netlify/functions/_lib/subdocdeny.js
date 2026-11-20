// netlify/functions/_lib/subdocdeny.js — patch SUBDOCDENY (owner 11/20): "✕ Deny" on a "COI / W-9 to confirm" approval.
// The CRM (patch SUBDOCDENY in index.html) marks the file rejected on the sub's record (kept, never deleted) and takes the
// item off ✅ Approvals; then POST sub-doc-read { act: 'reject', id?, ref, subId, kind, reason, fileId, fileName } lands here:
//   1. the server read (gc_kv list of sub-doc reads) is closed as 'rejected' (with the reason) — it never comes back;
//   2. a paper the sub sent on the bid site (the CRM file id SBPAP_<bid-site doc id>) is marked rejected in their
//      My Documents (sp_rows subdocs) — the bid site shows "Rejected: <reason> — please upload a new one" and it no
//      longer counts as on file (papersMissing / spPapersOf skip it);
//   3. the sub hears it: an e-mail and a text when the sub record has an address / a mobile (subs are not customers:
//      tagged 'subdoc', which ⏸ data-entry mode lets through — _lib/pause.js PASS_TAGS; a STOP'd number is never texted;
//      7 PM – 7 AM Central the text waits for 7 AM like every text). The CRM's sub portal shows the same words on Papers.
// Their compliance stays "needs COI" / "needs W-9" (the CRM clears what that file alone had set); pay-block rules unchanged.
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function okEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(v)); }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function paperWord(kind){ return kind === 'w9' ? 'W-9' : 'insurance certificate (COI)'; }
/* the words the sub sees (portal, e-mail, text) */
function words(reason){ return 'Rejected: ' + clip(reason, 200) + ' — please upload a new one'; }

/* deps: { readsUpdate(fn), hub (subportal _hub), crmSubs(), sendMail(to, subj, html), sendSms(to10, text), optout(), portalLink(subId), bidsUrl, now } */
async function reject(body, who, deps){
  const reason = clip(body.reason, 200), ref = s(body.ref), subId = s(body.subId), kind = body.kind === 'w9' ? 'w9' : 'coi';
  if (!reason) return { ok: false, statusCode: 400, error: 'Say why it is denied.' };
  if (!ref && !s(body.id)) return { ok: false, statusCode: 400, error: 'Bad request' };
  const at = new Date(deps.now ? deps.now() : Date.now()).toISOString(), by = s(who && (who.name || who.email));
  const out = { ok: true, read: false, bidSite: false, mailed: false, texted: false, why: [] };
  /* 1. the server read */
  try {
    const w = await deps.readsUpdate(function(l){
      const hit = l.filter(function(y){ return y && (s(y.id) === s(body.id) || (ref && s(y.ref) === ref)) && y.status !== 'rejected'; });
      if (!hit.length) return null;
      hit.forEach(function(x){ x.status = 'rejected'; x.reason = reason; x.doneBy = s(who && who.email); x.doneAt = at; });
      return { list: l, check: function(l2){ return l2.filter(function(y){ return y && (s(y.id) === s(body.id) || (ref && s(y.ref) === ref)); }).every(function(y){ return y.status === 'rejected'; }); } };
    });
    out.read = !!(w && w.ok);
  } catch (e) { out.why.push('read: ' + clip(e && e.message, 80)); }
  /* 2. the bid site's My Documents */
  const m = /^SBPAP_(.+)$/.exec(s(body.fileId));
  if (m && deps.hub) {
    try {
      const rows = await deps.hub.listRows([deps.hub.eq('collection', 'subdocs')]);
      const row = rows.find(function(r){ return arr(r.data && r.data.items).some(function(d){ return d && s(d.id) === m[1]; }); });
      if (row) {
        const items = arr(row.data.items).map(function(d){ return d && s(d.id) === m[1] ? Object.assign({}, d, { rejected: { reason: reason, at: at, by: 'GrayCo' } }) : d; });
        await deps.hub.upsertRows([{ collection: 'subdocs', id: row.id, user_id: row.id, data: Object.assign({}, row.data, { items: items }) }], s(who && who.email) || 'crm');
        out.bidSite = true;
      }
    } catch (e) { out.why.push('bid site: ' + clip(e && e.message, 80)); }
  }
  /* 3. tell the sub (staff-type: never a customer; data-entry mode does not hold it) */
  let sub = null; try { sub = arr(await deps.crmSubs()).find(function(x){ return x && s(x.id) === subId; }) || null; } catch (e) {}
  if (!sub) { out.why.push('sub not found — not told'); return out; }
  const file = clip(body.fileName, 120), name = s(sub.contact) || s(sub.name) || 'there';
  const where = m ? s(deps.bidsUrl) || 'https://bids.grayco-cs.com' : s(await Promise.resolve(deps.portalLink ? deps.portalLink(subId) : '').catch(function(){ return ''; }));
  const line = 'GrayCo could not accept your ' + paperWord(kind) + (file ? ' (' + file + ')' : '') + '. ' + words(reason) + '.';
  const mail = low(sub.email);
  if (okEmail(mail) && deps.sendMail) {
    try {
      out.mailed = !!(await deps.sendMail(mail, 'GrayCo: please upload a new ' + (kind === 'w9' ? 'W-9' : 'insurance certificate'),
        '<p>Hi ' + esc(name) + ',</p><p>' + esc(line) + '</p>' + (where ? '<p><a href="' + esc(where) + '">Upload it here</a></p>' : '') + '<p>Questions? Reply to this e-mail or call the office.</p>'));
    } catch (e) { out.why.push('mail: ' + clip(e && e.message, 80)); }
  } else out.why.push('no e-mail on the sub');
  const ph = phone10(sub.cell || sub.mobile || sub.phone);
  if (ph.length === 10 && deps.sendSms) {
    let stop = {}; try { stop = (await deps.optout()) || {}; } catch (e) { stop = null; }
    if (!stop) out.why.push('STOP list unreadable — not texted');
    else if (stop[ph]) out.why.push('texts: STOP');
    else { try { const r = await deps.sendSms(ph, line + (where ? ' ' + where : '') + ' — GrayCo'); out.texted = !!(r && r.ok); if (r && r.held) out.textHeld = true; } catch (e) { out.why.push('text: ' + clip(e && e.message, 80)); } }
  } else out.why.push('no mobile on the sub');
  return out;
}
module.exports = { reject: reject, words: words };
