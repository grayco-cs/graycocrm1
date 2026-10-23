/* ============================================================================
   GrayCo — bid-job notices to subs (patch SYS2).   netlify/functions/_lib/bp-notice.js

   An addendum, a due-date change or an update posted from the CRM's 🏗 Bid portal → 📂 Manage is on the bid site at once
   (only for the subs who may see that job). The E-MAIL to the subs is never sent from there: it waits on ✅ Approvals
   (kind "bp_notice", queued by bid-hub.js), and nothing is queued while ⏸ Data-entry mode is on (the CRM shows
   "held — data-entry mode" with a Send button for later). portal.js aqSend → onApproved(item) sends it: one e-mail per sub
   (nobody sees who else got it), in Spanish when that is the sub's language, from the bid site's sender.
   item.meta = { jobId, what: 'addendum' | 'post', ref, to: [{ email, lang }], en: { subject, html }, es: { subject, html } }
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }

/* the note on the job: what happened to its e-mail (shown in 📂 Manage) */
async function mark(SP, jobId, what, ref, patch){
  try {
    const row = await SP.getRow('jobs', jobId); if (!row) return;
    const job = Object.assign({}, row.data);
    if (what === 'addendum') job.addenda = arr(job.addenda).map(function(a){ return a && String(a.num) === String(ref) ? Object.assign({}, a, { notice: Object.assign({}, a.notice || {}, patch) }) : a; });
    else job.posts = arr(job.posts).map(function(p){ return p && p.id === ref ? Object.assign({}, p, { notice: Object.assign({}, p.notice || {}, patch) }) : p; });
    job.log = arr(job.log).concat([{ at: new Date().toISOString(), by: 'approvals', what: (what === 'addendum' ? 'Addendum #' + ref : 'Update') + ' e-mail ' + s(patch.status) + (patch.n != null ? ' (' + patch.n + ' sub' + (patch.n === 1 ? '' : 's') + ')' : '') }]).slice(-300);
    await SP.upsertRows([SP.rowFor('jobs', job)], 'approvals');
  } catch (e) {}
}

async function onApproved(item, now){
  const SP = require('../subportal.js')._hub;
  const m = (item && item.meta) || {};
  const to = arr(m.to).filter(function(x){ return x && SP.okEmail(s(x.email).toLowerCase()); });
  let n = 0;
  for (const x of to) {
    const L = x.lang === 'es' && m.es && m.es.subject ? m.es : m.en;
    try { if (await SP.sendMail(s(x.email).toLowerCase(), s(L.subject), s(L.html))) n++; } catch (e) {}
  }
  await mark(SP, s(m.jobId), s(m.what), s(m.ref), { status: 'sent', sentAt: now || new Date().toISOString(), n: n });
  return n || !to.length ? { ok: true, sent: n } : { ok: false, error: 'No e-mail went out (the e-mail service did not answer).' };
}
module.exports = { onApproved, mark };
