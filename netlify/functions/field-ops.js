// netlify/functions/field-ops.js
// GrayCo — the server half of patch AUTO8's job tools (signed-in staff only).
//
//   POST {action:'crew_text', projectId, kind:'arrived'|'done'}
//        "Crew arrived" / "Done for today" from the superintendent: a short text to the job's own customer phone when
//        texting is set up (Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM on Netlify). Until then it does
//        nothing and says so (the portal post is made by the CRM either way). Never twice the same day (gc_kv
//        gc_crew_texts). The job switch "🗓 Schedule updates" (⚙ Automations) off → no text.
//   POST {action:'queue_doc', kind:'pay_app', projectId, ref, fileName, subject, html, title}
//        An AIA pay application (G702/G703 PDF the CRM made and stored) to the job's own customer e-mail: it waits on
//        ✅ Approvals (the PM, then an admin — money), the PDF attached when it goes out (portal.js aqSend).
//   POST {action:'queue_doc', kind:'offer_letter', candidateId, to, name, ref, fileName, subject, html}   (admins)
//        A new hire's offer letter (Admin → Hiring → Hired): waits on ✅ Approvals for an admin.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const SEL = require('./selections.js')._sel;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function core(){ return require('./portal.js')._core; }
const EMAIL_RE = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i;
const REF_RE = /^sb:crm-files\/[0-9a-f]{64}\.pdf$/;
const PID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

function e164(v){ const d = s(v).replace(/\D/g, ''); if (d.length === 10) return '+1' + d; if (d.length === 11 && d[0] === '1') return '+' + d; return ''; }
function centralDay(){ try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
function twilioReady(){ return !!(s(process.env.TWILIO_ACCOUNT_SID) && s(process.env.TWILIO_AUTH_TOKEN) && s(process.env.TWILIO_FROM)); }
async function twilioSend(to, body){
  const sid = s(process.env.TWILIO_ACCOUNT_SID), tok = s(process.env.TWILIO_AUTH_TOKEN), from = s(process.env.TWILIO_FROM);
  const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', {
    method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString() });
  return { ok: r.ok, status: r.status };
}
const CREW_TEXT = {
  arrived: function(p){ return 'GrayCo Construction: our crew just arrived at your job' + (s(p.address) ? ' (' + clip(s(p.address).split(',')[0], 60) + ')' : '') + '. Questions? Call 901-585-0944.'; },
  done: function(p){ return 'GrayCo Construction: our crew wrapped up for today at your job. Updates and photos are in your GrayCo Portal. Questions? Call 901-585-0944.'; }
};
async function crewText(body, who){
  const kind = s(body.kind), pid = s(body.projectId);
  if (!CREW_TEXT[kind] || !PID_RE.test(pid)) return { status: 400, out: { ok: false, error: 'Bad request' } };
  if (!twilioReady()) return { status: 200, out: { ok: true, sms: false, why: 'Texting is not set up yet (Twilio) — the update is in the customer portal.' } };
  const C = core(), data = await C.crmData(true), p = C.findProject(data, pid);
  if (!p) return { status: 404, out: { ok: false, retry: true, error: 'The job is not in the cloud yet.' } };
  if (!C.jaAllows(data, p, 'scheduleUpdates')) return { status: 200, out: { ok: true, sms: false, why: 'Schedule updates are turned off for this job (⚙ Automations).' } };
  try { if (await require('./_lib/smsconsent.js').live(p.clientPhone || p.phone || p.customerPhone) === 'no') return { status: 200, out: { ok: true, sms: false, why: 'This customer declined texts on their contract.' } }; } catch (e) {}   /* patch SMSCONSENT */
  if (p.textOptOut === true || p.smsOptOut === true) return { status: 200, out: { ok: true, sms: false, why: 'The customer asked for no texts.' } };
  const to = e164(p.clientPhone || p.phone || p.customerPhone);
  if (!to) return { status: 200, out: { ok: true, sms: false, why: 'No customer mobile number on this job.' } };
  const id = pid + '|' + centralDay() + '|' + kind;
  const has = function(l){ return l.some(function(x){ return s(x.id) === id; }); };
  const claim = await C.kvListUpdate('gc_crew_texts', function(l){ return has(l) ? { list: null, result: 'dup' } : { list: l.concat([{ id: id, pid: pid, kind: kind, at: new Date().toISOString(), by: who.email }]).slice(-2000), check: has, result: 'ok' }; });
  if (!claim.ok) return { status: 503, out: { ok: false, error: 'Could not record it — try again.' } };
  if (claim.result === 'dup') return { status: 200, out: { ok: true, sms: false, already: true } };
  let r; try { r = await twilioSend(to, CREW_TEXT[kind](p)); } catch (e) { r = { ok: false }; }
  return { status: 200, out: { ok: true, sms: !!r.ok, why: r.ok ? '' : 'The text did not go out (' + (r.status || 'no answer') + ').' } };
}
async function queueDoc(body, who){
  const kind = s(body.kind), C = core();
  const ref = s(body.ref), fileName = clip(body.fileName, 120) || 'document.pdf', html = String(body.html || '').slice(0, 60000), subject = clip(body.subject, 200);
  if (!REF_RE.test(ref)) return { status: 400, out: { ok: false, error: 'The PDF is not stored yet — try again in a moment.' } };
  if (!subject || !s(html)) return { status: 400, out: { ok: false, error: 'A subject and a message are needed.' } };
  if (kind === 'pay_app') {
    const pid = s(body.projectId); if (!PID_RE.test(pid)) return { status: 400, out: { ok: false, error: 'Open a job first.' } };
    const data = await C.crmData(true), p = C.findProject(data, pid);
    if (!p) return { status: 404, out: { ok: false, retry: true, error: 'The job is not in the cloud yet.' } };
    const num = s(body.number).replace(/[^0-9]/g, '').slice(0, 4) || '1';
    /* patch GCP: on a job GrayCo is hired on by a GC, the AIA pay app goes the GC portal's way — to the GC's billing
       contact, with an "Approve" link on their project page, and its status (sent / approved / paid) is kept */
    try {
      const G = require('./_lib/gcp.js');
      if (G.isGcJob(data, p) && G.billingOf(G.contactsOf(data, p))) {
        const r = await G.payappAdd(data, p, { id: 'AIA_' + pid.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) + '_' + num, number: num, amount: body.amount, retainage: body.retainage, ref: ref, fileName: fileName, source: 'aia' }, who);
        return { status: r.code, out: Object.assign({ gcPortal: true }, r.out, r.out.payapp ? { id: 'appr_gcp_pa_' + r.out.payapp.id } : {}) };
      }
    } catch (e) { if (/already approved/.test(s(e && e.message))) return { status: 409, out: { ok: false, error: s(e.message) } }; }
    const to = s(p.clientEmail || p.customerEmail || p.email);
    if (!EMAIL_RE.test(to)) return { status: 200, out: { ok: false, noEmail: true, error: 'No customer (GC / owner) e-mail on this job — add it on the job, then send again.' } };
    const id = 'appr_payapp_' + pid.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) + '_' + num;
    const ok = await C.queueApproval({ id: id, kind: 'pay_app', pid: pid, jobName: p.name, pm: C.pmOf(data, p), to: to, channel: 'email',
      title: clip(body.title, 120) || ('🏗 Pay application #' + num + ' — ' + clip(p.name, 80)), subject: subject, html: html,
      attachments: [{ kind: 'file', ref: ref, name: fileName }], meta: { by: who.email, number: num, amount: Number(body.amount) || 0 } });
    return { status: ok ? 200 : 502, out: { ok: !!ok, id: id, queued: !!ok } };
  }
  if (kind === 'offer_letter') {
    if (low(who.role) !== 'admin') return { status: 403, out: { ok: false, error: 'Only Wesley or Nick can send an offer letter.' } };
    const to = s(body.to); if (!EMAIL_RE.test(to)) return { status: 200, out: { ok: false, noEmail: true, error: 'No e-mail for the new hire — add it on the candidate.' } };
    const cid = s(body.candidateId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || 'x';
    const id = 'appr_offer_' + cid;
    const ok = await C.queueApproval({ id: id, kind: 'offer_letter', pid: '', jobName: 'Hiring', pm: null, to: to, channel: 'email',
      title: '🤝 Offer letter — ' + clip(body.name, 80), subject: subject, html: html, attachments: [{ kind: 'file', ref: ref, name: fileName }], meta: { by: who.email, candidateId: cid } });
    return { status: ok ? 200 : 502, out: { ok: !!ok, id: id, queued: !!ok } };
  }
  return { status: 400, out: { ok: false, error: 'Unknown paper.' } };
}

function reply(statusCode, headers, obj){ return { statusCode: statusCode, headers: headers, body: JSON.stringify(obj) }; }
exports.handler = async function(event){
 try { await require('./_lib/brand.js').addressReady(); } catch (e) {}   /* patch ADDRALL: the saved company address before anything is made */
  event = event || {};
  const headers = Object.assign(SEL.gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod === 'GET') return reply(200, headers, { ok: true, service: 'GrayCo field ops', texting: twilioReady() });
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  if (String(event.body || '').length > 120000) return reply(413, headers, { ok: false, error: 'Too big' });
  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const who = await SEL.gcStaffAuth(event);
  if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
  if (!SEL.svcKey()) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
  try {
    const a = s(body.action);
    const r = a === 'crew_text' ? await crewText(body, who) : a === 'queue_doc' ? await queueDoc(body, who) : { status: 400, out: { ok: false, error: 'Unknown action.' } };
    return reply(r.status, headers, r.out);
  } catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong: ' + clip(e && e.message || e, 120) }); }
};
exports._fo = { crewText: crewText, queueDoc: queueDoc, e164: e164, twilioReady: twilioReady, CREW_TEXT: CREW_TEXT };
