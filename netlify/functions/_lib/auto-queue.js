/* ── The automations' customer e-mails / texts → the ONE approvals list (patch AUT2) ──────────────────────
   portal.js { action:'approval', op:'queue', kind, projectId, ref?, subject, html, channel?, title? } for these kinds
   (the CRM's automations ask; nothing here sends without approval, except the appointment rule below):
     welcome          👋 welcome / portal link / what happens next (job signed)          job switch: welcome
     next_steps       🗓 "what happens next" (materials ordered / scheduled)               job switch: scheduleUpdates
     appt_confirm     📅 appointment confirmation (made or moved)                         job switch: scheduleUpdates
     appt_reminder    ⏰ the day-before reminder                                            job switch: scheduleUpdates
     closeout         🏁 Certificate of Completion / warranty in your portal               job switch: warrantyCert
     checkup          🔧 one-year checkup                                                   job switch: yearlyCheckup
     contract         ✍️ contract for signature (PM, then an admin: money / legal)          job switch: contractSign
     progress_update  📸 the weekly progress update                                         job switch: progressPosts
     document         📄 a paper from the document library (patch DOCLIB; ref = template id)  no job switch
   The recipient is always the job's own customer e-mail (or phone for a text) — never one the page sends.
   One item per (kind, job, ref): asking again is harmless.
   APPOINTMENTS ("the PM approves the first; later ones go with the approved wording", as final-invoice reminders):
   once a person approved and sent an appointment message on a job, or the job's switch apptAuto is on, later
   appointment messages on that job go out at once — recorded on the list as sent, "auto". */
'use strict';
const KINDS = {
  welcome: { key: 'welcome', title: '👋 Welcome e-mail' },
  next_steps: { key: 'scheduleUpdates', title: '🗓 What happens next' },
  appt_confirm: { key: 'scheduleUpdates', title: '📅 Appointment confirmation', appt: true },
  appt_reminder: { key: 'scheduleUpdates', title: '⏰ Appointment reminder', appt: true },
  closeout: { key: 'warrantyCert', title: '🏁 Closeout papers' },
  checkup: { key: 'yearlyCheckup', title: '🔧 One-year checkup' },
  contract: { key: 'contractSign', title: '✍️ Contract for signature' },
  progress_update: { key: 'progressPosts', title: '📸 Progress update' },
  document: { key: 'docSend', title: '📄 Document' }   /* patch DOCLIB: a paper from 📚 the document library, sent from a job */
};
function s(v){ return v == null ? '' : String(v).trim(); }
function clip(v, n){ return s(v).slice(0, n); }
function handles(kind){ return Object.prototype.hasOwnProperty.call(KINDS, s(kind)); }
const EMAIL_RE = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i;
function switchOff(p, key, data){
  try { const ja = require('./job-auto.js'); if (ja && typeof ja.allows === 'function') return ja.allows(p, key, ja.parseAdmin(data && data.jobAutoDefaults)) === false; } catch (e) {}   /* patch JA: + the Admin defaults */   /* patch JA, when present */
  return !!(p && p.auto && p.auto[key] === false);
}
function commercialJob(p, data){
  const t = [p.type, p.jobType, p.category, p.projectType, p.kind, p.segment].map(s).join(' ');
  if (p.isCommercial === true || p.commercial === true) return true;
  if (/commercial|government|municipal|public|school|church|office build|retail|warehouse|tenant|industrial|hotel|restaurant|apartment|multi-?family/i.test(t)) return true;
  try { const cs = (data && (Array.isArray(data.customers) ? data.customers : [])) || []; const c = cs.find(function(x){ return x && (s(x.id) === s(p.customerId) || (s(x.name) && s(x.name) === s(p.client))); }); if (c && /^(gc|general contractor|commercial|business|government)$/i.test(s(c.type))) return true; } catch (e) {}
  return false;
}
function personTurnedOn(p, key){ return !!((p.auto && p.auto[key] === true) || (p.autoX && p.autoX.apptAuto === true) || (p.auto && p.auto.apptAuto === true)); }
async function queue(body, who, I){
  const kind = s(body.kind), K = KINDS[kind];
  const pid = s(body.projectId);
  const data = await I.crmData(true); const p = pid && I.findProject(data, pid);
  if (!p) return { status: 404, out: { ok: false, retry: true, error: 'The job is not in the cloud yet.' } };
  if (switchOff(p, K.key, data)) return { status: 200, out: { ok: false, off: K.key, error: 'Turned off for this job.' } };
  const sms = s(body.channel) === 'sms';
  const to = sms ? s(p.clientPhone || p.phone) : s(p.clientEmail || p.customerEmail || p.email);
  if (sms ? !/^\+?[0-9 ()-]{7,20}$/.test(to) : !EMAIL_RE.test(to)) return { status: 200, out: { ok: false, noEmail: true, error: sms ? 'No customer phone on this job.' : 'No customer e-mail on this job.' } };
  const ref = clip(body.ref, 80).replace(/[^A-Za-z0-9_.:-]/g, '');
  const qid = 'appr_' + kind + '_' + pid + (ref ? '_' + ref : '');
  const html = String(body.html || '').slice(0, 100000);
  if (!s(html) || !s(body.subject)) return { status: 400, out: { ok: false, error: 'A subject and a message are needed.' } };
  const pm = I.pmOf(data, p);
  let title = clip(body.title, 120) || (K.title + ' — ' + clip(p.name, 80));
  /* patch APPTCONF: no automatic appointment mail on a commercial job unless a person turned it on; one confirmation per job, day and recipient */
  const day = (ref.match(/_(\d{8})/) || [])[1] || '';
  if (K.appt && commercialJob(p, data) && !personTurnedOn(p, K.key)) return { status: 200, out: { ok: false, off: 'commercial', error: 'Commercial job: appointment e-mails are off unless someone turns them on for this job.' } };
  if (kind === 'appt_confirm' && day) {
    const cur0 = await I.kvListRead(I.AQ_KEY);
    const twin = cur0 && cur0.list.find(function(x){ return x && x.kind === 'appt_confirm' && s(x.jobId) === pid && s((x.meta || {}).day || ((s(x.id).match(/_(\d{8})/) || [])[1])) === day && s(x.to).toLowerCase() === to.toLowerCase() && /^(waiting|sending|sent|recorded)$/.test(s(x.status)) && s(x.id) !== qid; });
    if (twin) {
      const whatNew = (s(body.title).match(/Confirm (.+?) — /) || [])[1] || '';
      if (twin.status === 'waiting' && whatNew) {
        await I.kvListUpdate(I.AQ_KEY, function(l){ const x = l.find(function(y){ return s(y.id) === s(twin.id); }); if (!x || x.status !== 'waiting') return null;
          const items = Array.isArray((x.meta || {}).items) ? x.meta.items.slice() : [((s(x.title).match(/Confirm (.+?) — /) || [])[1] || '')].filter(Boolean);
          if (items.indexOf(whatNew) >= 0) return null;
          items.push(whatNew); x.meta = Object.assign({}, x.meta || {}, { items: items, day: day });
          x.title = clip(s(x.title).replace(/Confirm (.+?) — /, 'Confirm ' + items.join(' + ') + ' — '), 120);
          x.html = String(x.html || '').replace(/(<p>Your project manager:)/, '<p>The same day: <b>' + whatNew.replace(/[<>&]/g, '') + '</b>.</p>$1');
          x.updatedAt = new Date().toISOString();
          return { list: l, check: function(l2){ const z = l2.find(function(y){ return s(y.id) === s(twin.id); }); return !!(z && z.updatedAt === x.updatedAt); }, result: x }; });
      }
      return { status: 200, out: { ok: true, id: s(twin.id), queued: false, merged: true } };
    }
  }
  /* appointment rule: auto after the first approved one (or the job's apptAuto switch) */
  let auto = false;
  if (K.appt) {
    if ((p.autoX && p.autoX.apptAuto === true) || (p.auto && p.auto.apptAuto === true)) auto = 'job switch';   /* p.autoX: switches patch JA does not own */
    else {
      const cur = await I.kvListRead(I.AQ_KEY);
      const prior = cur && cur.list.find(function(x){ return x && KINDS[x.kind] && KINDS[x.kind].appt && s(x.jobId) === pid && x.status === 'sent' && (x.approvals || []).some(function(a){ return a && !a.auto; }); });
      if (prior) auto = 'first one approved by ' + s(((prior.approvals || []).filter(function(a){ return !a.auto; }).slice(-1)[0] || {}).by);
    }
  }
  const ok = await I.queueApproval({ id: qid, kind: kind, title: title, pid: pid, jobName: p.name, pm: pm, to: to, channel: sms ? 'sms' : 'email',
    subject: clip(body.subject, 200), html: html, attachments: [], meta: { by: who.email, ref: ref, auto: !!auto, day: day || undefined } });
  if (!ok) return { status: 502, out: { ok: false, error: 'Could not add it to the approvals list.' } };
  if (!auto) return { status: 200, out: { ok: true, id: qid, queued: true } };
  /* send it now, recorded on the list like an approval */
  const now = new Date().toISOString(), claim = 'auto' + Date.now().toString(36);
  const r = await I.kvListUpdate(I.AQ_KEY, function(l){
    const x = l.find(function(y){ return s(y.id) === qid; }); if (!x || x.status !== 'waiting') return null;
    x.status = 'sending'; x.claim = claim; x.updatedAt = now;
    x.approvals = (x.approvals || []).concat([{ step: x.step, by: 'Automatic (' + auto + ')', email: '', role: 'auto', at: now, auto: true }]);
    return { list: l, check: function(l2){ const z = l2.find(function(y){ return s(y.id) === qid; }); return !!(z && z.claim === claim); }, result: x };
  });
  if (!r || !r.ok || !r.result) return { status: 200, out: { ok: true, id: qid, queued: true } };   /* already handled: leave it */
  const sent = await I.aqSend(r.result, now);
  await I.kvListUpdate(I.AQ_KEY, function(l){
    const x = l.find(function(y){ return s(y.id) === qid; }); if (!x || x.claim !== claim) return null;
    if (sent.ok) { x.status = 'sent'; x.sentAt = new Date().toISOString(); x.sentBy = 'Automatic'; x.lastError = ''; }
    else { x.status = 'waiting'; x.lastError = sent.error; x.approvals = (x.approvals || []).filter(function(a){ return !a.auto; }); }
    x.updatedAt = new Date().toISOString();
    return { list: l, check: function(){ return true; } };
  });
  return { status: 200, out: { ok: true, id: qid, queued: !sent.ok, sent: !!sent.ok, auto: auto, error: sent.ok ? '' : sent.error } };
}
module.exports = { KINDS: KINDS, handles: handles, queue: queue };
