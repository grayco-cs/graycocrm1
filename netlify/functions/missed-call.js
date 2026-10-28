/* ============================================================================
   GrayCo — MISSED-CALL TEXT-BACK (Twilio).   netlify/functions/missed-call.js   (patch AUTO6)

   Owner (10/21): "yes on 4" — a call nobody answers gets a text back at once and becomes a lead.

   DORMANT until Netlify has TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (the GrayCo Twilio number,
   +1XXXXXXXXXX). Before that every webhook answers politely and does nothing; ?ping=1 says "not set up".

   How the call gets here (docs/MISSED-CALL-TEXTBACK.md):
     A) the office line forwards on no-answer / busy to the Twilio number → every call that reaches Twilio IS a
        missed call (the default), or
     B) the Twilio number is the published number and TWILIO_RING_TO is set (the office line, +1XXXXXXXXXX):
        Twilio rings it for TWILIO_RING_SECONDS (20) and only an unanswered / busy / failed ring is a missed call.
   Twilio webhooks (Phone Numbers → the number):
     A call comes in   → POST https://crm.grayco-cs.com/.netlify/functions/missed-call?event=voice
     A message comes in → POST https://crm.grayco-cs.com/.netlify/functions/missed-call?event=sms
   Every POST must carry a valid X-Twilio-Signature (HMAC-SHA1 with TWILIO_AUTH_TOKEN) — anything else is 403.
     C) patches CALLCHAIN + CALLSCREEN (owner 10/28: "call in order office, nick owner 1, wesley owner 2, general manager,
        lead pm" · "these leads need to be qualified … everything else we do not accept on this phone number"): the
        📞 Call order (Admin; _lib/callorder.js, gc_lead_inbox_kv "gc_call_order"). The caller first hears the menu
        (1 work · 2 current customer · 3 anything else / sales); nothing twice → goodbye (likely a robocall); 3, a blocked
        number or a failed STIR/SHAKEN attestation → "we don't take sales calls" — no ring, no text, no lead, logged only.
        1 → "in a few words, what work do you need?" → the call order rings one at a time (<Dial answerOnBridge
        action=…?event=dialdone&step=N>), each person first hears "GrayCo call: <what they said>. Press 1 to accept"
        (<Number url=…?event=whisper>), so a voicemail does not take the call. 2 → the job's PM first (caller's number on a
        job), then the call order. Nobody accepts → the missed call below (one text, lead / call-back to-do with what
        they said). Every hop is a new signed webhook. Log: gc_lead_inbox_kv "gc_call_log" (Admin card: the last 50).
        This runs before the rc-r13 24/7 emergency chain (patch CHAIN, TWILIO_CALL_CHAIN=1), which is only reached when
        an admin turns both the call order and the screening off.

   A missed call:
     · the caller gets ONE text (not again within 12 hours, never after they texted STOP):
       "Sorry we missed your call — this is GrayCo Construction Services. How can we help? Reply here or call 901-585-0944."
     · a NEW caller → a GrayCo lead in Leads → 📥 Lead Inbox, source "Missed call", not assigned (the admins get
       "📞 Missed call — auto-text sent", and the speed-to-lead reminders apply, as for a website lead);
     · an EXISTING customer (same phone on a job or a customer record) → no lead: a "📞 Call back" to-do on THAT
       job for its PM (the shared Office To-Do when the job has no PM), and the admins + PM are e-mailed.
   A text in (patch TXT, _lib/sms.js — "text us" for customers):
     · STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT → never texted from here again (START / UNSTOP undoes it;
       Twilio's own opt-out also blocks every GrayCo text to that number); HELP → the standard help answer;
     · anything else → matched to the sender's job (Job Messages + the job's 💬 timeline; no job → 📥 Unsorted), a
       new number becomes a lead (source "Text message", routed by the lead roles), the staff relay list (+ PM) is
       e-mailed, and ONE approved automatic answer may go back (Admin → 💬 Text auto-answers; never while data-entry
       mode is on). A missed-call lead / call-back to-do the number already has gets the text too.
   State (service-only, gc_lead_inbox_kv "gc_sms_state"): calls handled, last text per number, opt-outs, the
   lead / to-do each number belongs to.
   ========================================================================== */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');

const TEXT = 'Sorry we missed your call — this is GrayCo Construction Services. How can we help? Reply here or call 901-585-0944.';
const SAY = 'Thanks for calling GrayCo Construction Services. Sorry we missed you. We just sent you a text message, and someone from our team will get back to you shortly. Goodbye.';
const KS = 'gc_sms_state';
const RETEXT_H = 12;
const STOP = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|opt[\s-]?out)\s*[.!]*\s*$/i;
const START = /^\s*(start|unstop|yes)\s*[.!]*\s*$/i;

function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clip(v, n){ v = s(v); return v.length > n ? v.slice(0, n - 1) + '…' : v; }
function nowIso(){ return new Date().toISOString(); }
function digits(v){ return s(v).replace(/\D/g, ''); }
function phone10(v){ const d = digits(v); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function esc(v){ return s(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function now(){ return typeof exports._now === 'function' ? exports._now() : Date.now(); }

function ready(){ return !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM')); }
function site(){ return (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function hookUrl(ev, q){ return site() + '/.netlify/functions/missed-call?event=' + ev + (q ? '&' + Object.keys(q).map(k => k + '=' + encodeURIComponent(String(q[k]))).join('&') : ''); }   /* patch CALLCHAIN: the exact URL Twilio calls back (and signs) */
function L(){ return require('./bid-inbox.js')._lib; }
/* patch CHAIN: the 24/7 emergency line — on call → insurance → admins (_lib/callchain.js) */
let CC_ = null;
function CC(){ return CC_ || (CC_ = require('./_lib/callchain.js').make({ env, now, kvGet: k => L().kvGet(k), kvCas: (k, f) => L().kvCas(k, f), sb: (path, o) => L().sb(path, o) })); }
function dialStep(i, chain){
  return '<Dial timeout="' + CC().ringSecs() + '" answerOnBridge="true" action="' + esc(hookUrl('chain') + '&i=' + (i + 1)) + '" method="POST">'
    + '<Number url="' + esc(hookUrl('screen') + '&i=' + i) + '" method="POST">+1' + chain[i].phone + '</Number></Dial>';
}
function WI(){ return require('./website-intake.js')._lib; }
function SA(){ return require('./_lib/smsalert.js'); }   /* patch SMSALERT: text alerts to staff cell phones */
function LM(){ return require('./_lib/leadmsg.js'); }   /* patch LEADMAILMSG: what the customer said + call buttons in the e-mails */
function core(){ return require('./portal.js')._core; }

/* ── Twilio's signature: base64(HMAC-SHA1(token, url + every POST param name+value, sorted by name)) ── */
function params(event){
  let raw = event.body || '';
  if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
  const out = {}; new URLSearchParams(raw).forEach((v, k) => { out[k] = v; });
  return out;
}
function header(event, name){ const h = event.headers || {}; const k = Object.keys(h).find(x => x.toLowerCase() === name); return k ? s(h[k]) : ''; }
function sigFor(url, p, token){
  const data = url + Object.keys(p).sort().map(k => k + p[k]).join('');
  return crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf8')).digest('base64');
}
function signed(event, p){
  const got = header(event, 'x-twilio-signature'); if (!got) return false;
  const token = env('TWILIO_AUTH_TOKEN'); if (!token) return false;
  const qs = event.queryStringParameters || {};
  const q = Object.keys(qs).length ? '?' + Object.keys(qs).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(qs[k])).join('&') : '';
  const urls = [s(event.rawUrl), site() + '/.netlify/functions/missed-call' + q, env('TWILIO_WEBHOOK_BASE') ? env('TWILIO_WEBHOOK_BASE').replace(/\/$/, '') + q : ''].filter(Boolean);
  return urls.some(u => { const want = sigFor(u, p, token); return want.length === got.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got)); });
}

function twiml(inner){ return { statusCode: 200, headers: { 'Content-Type': 'text/xml', 'Cache-Control': 'no-store' }, body: '<?xml version="1.0" encoding="UTF-8"?><Response>' + (inner || '') + '</Response>' }; }
function J(code, body){ return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) }; }
const sayBye = () => twiml('<Say voice="Polly.Joanna">' + esc(SAY) + '</Say><Hangup/>');

/* ── state ── */
function loadState(v){
  const st = Object.assign({ calls: {}, texted: {}, optout: {}, owner: {} }, v && typeof v === 'object' ? v : {});
  /* patch SMSC2: marketing consent by phone — written only by the e-sign function / staff, NEVER by an inbound text */
  ['calls', 'texted', 'optout', 'owner', 'consent', 'welcomed', 'marketing'].forEach(k => { if (!st[k] || typeof st[k] !== 'object') st[k] = {}; });
  /* forget handled calls after 7 days */
  const cut = new Date(now() - 7 * 86400000).toISOString();
  Object.keys(st.calls).forEach(k => { if (s(st.calls[k]) < cut) delete st.calls[k]; });
  /* patch TXT: texts already handled (Twilio retries) and the automatic answers per number — kept 3 days */
  const cut3 = new Date(now() - 3 * 86400000).toISOString();
  /* patch SMSROUTE: who texted each number last (the reply goes back to them) — kept 30 days */
  const cut30 = new Date(now() - 30 * 86400000).toISOString();
  if (st.lastOut && typeof st.lastOut === 'object') Object.keys(st.lastOut).forEach(k => { if (!st.lastOut[k] || s(st.lastOut[k].at) < cut30) delete st.lastOut[k]; });
  if (st.seen && typeof st.seen === 'object') Object.keys(st.seen).forEach(k => { if (s(st.seen[k]) < cut3) delete st.seen[k]; });
  if (st.auto && typeof st.auto === 'object') Object.keys(st.auto).forEach(k => { const l = Array.isArray(st.auto[k]) ? st.auto[k].filter(x => x && s(x.at) >= cut3) : []; if (l.length) st.auto[k] = l; else delete st.auto[k]; });
  return st;
}
async function stateGet(){ return loadState(await L().kvGet(KS)); }
async function stateCas(fn){ return L().kvCas(KS, v => { const st = loadState(v); const r = fn(st); return r === undefined ? undefined : st; }); }

/* ── Twilio REST: one text ── */
async function sendSms(to10, body, from){   /* patch SMSROUTE: from = one of our numbers (default TWILIO_FROM) */
  if (!ready()) return { ok: false, why: 'not set up' };
  const sid = env('TWILIO_ACCOUNT_SID');
  try {
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', { method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + env('TWILIO_AUTH_TOKEN')).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+1' + to10, From: s(from) || env('TWILIO_FROM'), Body: clip(body, 600) }).toString() });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, why: 'Twilio unreachable' }; }
}

/* ── e-mail to the admins (+ the PM) ── */
async function mailStaff(extra, subject, html, text){
  const key = env('RESEND_API_KEY'); if (!key) return { ok: false, why: 'RESEND_API_KEY is not set' };
  let to = [];
  try { to = await L().alertsApi().recipients(extra); } catch (e) {}
  if (!to.length) return { ok: false, why: 'nobody to tell' };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('BID_ALERT_FROM') || 'GrayCo Leads <leads@grayco-cs.com>', reply_to: env('REPLY_TO_ADMIN') || 'replies@grayco-cs.com', to, subject: require('./_lib/mailtag.js').tag(subject, to, 'area:Leads'), html: LM().telify(html), text, headers: { 'X-GrayCo-CRM': 'missed-call' } }) });
    return { ok: r.ok, to };
  } catch (e) { return { ok: false, why: 'Resend unreachable' }; }
}
function box(head, body){
  return '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">' + esc(head) + '</div><div style="padding:6px 18px 18px">' + body
    + '<p style="margin-top:18px"><a href="' + esc(site()) + '/#leads" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open the CRM</a></p></div></div>';
}

/* ── an existing customer's missed call → a "📞 Call back" to-do on that job ── */
async function callBackTodo(cust, ph, callSid, at, what){
  const C = core();
  let pm = null; try { pm = cust.pm ? await C.pmByName(cust.pm) : null; } catch (e) {}
  const id = 'MISSED_' + phone10(ph) + '_' + at.slice(0, 10);
  const label = '📞 Call back ' + (cust.client || tidy(ph)) + ' — missed call' + (cust.job ? ' (' + cust.job + ')' : '');
  const line = 'Missed call ' + at.slice(0, 16).replace('T', ' ') + ' UTC from ' + tidy(ph) + ' — the automatic text went out.' + (what ? ' They said: “' + clip(what, 200) + '”.' : '');   /* patch CALLSCREEN */
  let r = { ok: false };
  try {
    r = await C.kvListUpdate('gc_office_tasks', function(l){
      const t = l.find(x => x && s(x.id) === id);
      if (t) { if (s(t.note).indexOf(callSid) >= 0) return null; t.note = clip(s(t.note) + '\n' + line + ' [' + callSid + ']', 2000); t.done = false; t.repeats = (parseInt(t.repeats, 10) || 1) + 1; t.updatedAt = nowIso(); return { list: l, check: l2 => l2.some(x => x && s(x.id) === id) }; }
      const item = { id, label, note: line + ' [' + callSid + ']', pid: s(cust.pid), phone: tidy(ph), assignees: pm && pm.name ? [pm.name] : [], prio: 'high', due: at.slice(0, 10),
        kind: 'missed_call', addedBy: 'Missed call (Twilio)', addedAt: at, updatedAt: at, done: false };
      return { list: l.concat([item]), check: l2 => l2.some(x => x && s(x.id) === id) };
    });
  } catch (e) { r = { ok: false, error: s(e && e.message) }; }
  const subj = '📞 Missed call from an existing customer: ' + (cust.client || tidy(ph)) + (cust.job ? ' — ' + cust.job : '');
  const html = box('GrayCo — missed call (existing customer)', LM().buttons({ phone: ph }) + LM().boxHtml(LM().textInfo({ name: cust.client, phone: ph, kind: 'customer', job: cust.job }), '📞 Who called') + '<p><b>' + esc(cust.client || 'A customer') + '</b> called from <b>' + esc(tidy(ph)) + '</b> and nobody answered. They got the automatic text.</p>'
    + (cust.job ? '<p>Their job: <b>' + esc(cust.job) + '</b>' + (cust.pm ? ' — PM <b>' + esc(cust.pm) + '</b>' : '') + '. A “📞 Call back” to-do is on that job' + (cust.pm ? ' for ' + esc(cust.pm) : ' (Office To-Do)') + '.</p>' : '<p>A “📞 Call back” to-do is on the Office To-Do.</p>'));
  const m = await mailStaff(pm && pm.email ? [pm.email] : [], subj, html, subj + '\n\nCall back: ' + tidy(ph) + '\n' + site());
  return { todo: id, saved: !!r.ok, mailed: m.ok };
}

/* ── one missed call ── */
async function missed(p, how, extra){
  extra = extra || {};   /* patch CALLSCREEN: { what } — what the caller said they need */
  const ph = phone10(p.From), callSid = s(p.CallSid) || ('call-' + ph + '-' + nowIso().slice(0, 16)), at = nowIso();
  if (ph.length !== 10 || /^(anonymous|restricted|unknown|private)/i.test(s(p.From))) return { skipped: 'no caller id' };
  /* patch CALLCHAIN: our own office line / Twilio number as the caller ID (a forward that shows the forwarding line) is no lead and gets no text */
  if (ph === CO().companyPhone() || ph === phone10(env('TWILIO_FROM'))) return { skipped: 'our own number' };
  /* claim the call (a retry from Twilio or a second webhook for the same call does nothing) */
  let first = false, textIt = false;
  await stateCas(st => {
    if (st.calls[callSid]) return undefined;
    st.calls[callSid] = at; first = true;
    const last = Date.parse(st.texted[ph] || 0);
    textIt = !st.optout[ph] && !(isFinite(last) && now() - last < RETEXT_H * 3600000);
    if (textIt) st.texted[ph] = at;
    return true;
  });
  if (!first) return { skipped: 'already handled' };
  const out = { how };
  /* patch SMSCONSENT: a customer who declined texts on their contract gets no automatic text (STOP is already handled above) */
  if (textIt) { try { const SC = require('./_lib/smsconsent.js'), D0 = await core().kvRead(['customers', 'projects', 'leads']), s0 = await stateGet();
    if (SC.statusFor(D0, ph, s0.consent) === 'no') { textIt = false; out.consent = 'declined'; } } catch (e) {} }
  if (textIt) {
    out.text = await sendSms(ph, s(extra.text) || TEXT);   /* patch AFTERHOURS: the after-hours wording */
    if (!out.text.ok) await stateCas(st => { if (st.texted[ph] === at) delete st.texted[ph]; return true; }).catch(() => {});
  } else out.text = { skipped: 'texted recently or opted out' };
  /* existing customer? */
  let cust = null; try { cust = await WI().findCustomer({ phone: ph, email: '' }); } catch (e) {}
  try { out.cellAlerts = await SA().missedCall({ ph, name: cust ? cust.client : s(p.CallerName), job: cust ? cust.job : '', pid: cust ? cust.pid : '' }); } catch (e) {}   /* patch SMSALERT */
  if (cust && (cust.pid || cust.client)) {
    out.customer = await callBackTodo(cust, ph, callSid, at, s(extra.what));
    await stateCas(st => { st.owner[ph] = { todo: out.customer.todo, pid: s(cust.pid), pm: s(cust.pm), at }; return true; }).catch(() => {});
    return out;
  }
  /* a new caller → a GrayCo lead */
  const who = s(p.CallerName) && !/^(wireless caller|unknown|anonymous)/i.test(s(p.CallerName)) ? s(p.CallerName).replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()) : '';
  const city = [s(p.FromCity), s(p.FromState)].filter(Boolean).join(', ');
  const f = { type: 'estimate', name: who || 'Caller ' + tidy(ph), email: '', phone: ph, address: '', city: s(p.FromCity), state: s(p.FromState).slice(0, 2), zip: s(p.FromZip),
    message: 'Missed call ' + at.slice(0, 16).replace('T', ' ') + ' UTC' + (city ? ' (caller ID area: ' + city + ')' : '') + '. ' + (out.text.ok ? 'The automatic text went out.' : 'No automatic text (' + (out.text.skipped || out.text.why || 'not sent') + ').') + (s(extra.what) ? ' They said they need: “' + clip(extra.what, 300) + '”.' : ''),
    company: '', service: '', property: '', bestTime: '', damageDate: '', carrier: '', claimFiled: '', claimNumber: '', project: '', bidDue: '', plansLink: '', buildings: '', plan: '', urgency: '' };
  const sid = crypto.createHash('sha256').update('missed|' + ph + '|' + at.slice(0, 10)).digest('hex').slice(0, 24);
  /* patch AFTERHOURS: an after-hours "1", or what they said sounds like one (water / flood / leak / fire / smoke / tree / storm) → an EMERGENCY lead */
  let emerg = !!extra.emergency; if (!emerg && s(extra.what)) { try { emerg = require('./_lib/emergency.js').isEmergency({ title: s(extra.what), detail: s(extra.what) }); } catch (e) {} }
  if (emerg) out.emergency = true;
  const r = await WI().fileLead(f, { sid, source: 'Missed call', how: 'a missed call to the GrayCo number', formLabel: 'Missed call', customer: null,
    title: (emerg ? '🚨 EMERGENCY call — ' : 'Missed call — ') + (who || tidy(ph)) + (city ? ' — ' + city : ''), patch: emerg ? { emergency: true, urgency: 'Emergency' } : undefined, leadExtra: Object.assign({ missedCall: true, callSid }, s(extra.what) ? { callerSaid: clip(extra.what, 300) } : {}) });
  out.lead = r.id; out.action = r.action;
  await stateCas(st => { st.owner[ph] = { lead: r.id, at }; return true; }).catch(() => {});
  out.alerts = r.action === 'added' ? await WI().alertLead(r.rec) : { skipped: r.action };
  return out;
}

/* ── patch EMERGCALL: the CRM's own escalation calls about an emergency nobody acknowledged (_lib/emergcall.js) ── */
function EC(){
  return require('./_lib/emergcall.js').make({ env, now, kvGet: k => L().kvGet(k), kvCas: (k, f) => L().kvCas(k, f),
    crm: () => core().kvRead(['users', 'gc_senior_pm']), users: async () => { try { return (await core().kvRead(['users'])).users; } catch (e) { return []; } },
    sms: (ph, body) => sendSms(ph, body),
    ackCtx: async () => {   /* what counts as "someone has it": the Lead Inbox item, the CRM lead, the on-call page, a staff text */
      const o = { inbox: {}, leads: {}, pages: [], lastOut: {}, msgs: [] };
      try { (await L().kvGet(L().KV) || []).forEach(x => { if (x && x.id) o.inbox[s(x.id)] = x; }); } catch (e) {}
      try { const D0 = await core().kvRead(['leads', 'gc_job_messages']); (Array.isArray(D0.leads) ? D0.leads : []).forEach(l => { if (l) ['id', 'inboxId', 'key', 'leadKey'].forEach(f => { if (s(l[f])) o.leads[s(l[f])] = l; }); }); o.msgs = Array.isArray(D0.gc_job_messages) ? D0.gc_job_messages : []; } catch (e) {}
      try { const v = await L().kvGet('gc_x10_pages'); o.pages = Array.isArray(v) ? v : (v && Array.isArray(v.list) ? v.list : []); } catch (e) {}
      try { o.lastOut = (await stateGet()).lastOut || {}; } catch (e) {}
      return o;
    },
    mailAdmins: (subject, r) => mailStaff([], subject, box('GrayCo — nobody answered the emergency calls', '<p><b>' + esc(r.title) + '</b>' + (r.contact && r.contact.phone ? ' · ' + esc(tidy(r.contact.phone)) : '') + '</p><p>The CRM called everyone on call and on the 📞 Call order twice and nobody pressed 1 or 2. Please call the customer now.</p>'), subject + '\n\n' + r.title) });
}

/* ── patches CALLCHAIN + CALLSCREEN: the menu, then the 📞 Call order one at a time ── */
function CO(){ return require('./_lib/callorder.js'); }
const SAYV = '<Say voice="Polly.Joanna">';
const HOLD = 'Thanks for calling GrayCo Construction Services, please hold while we connect you.';
const HOLD2 = 'Thank you. Please hold while we connect you.';
const ASK_WHAT = 'In a few words, what work do you need?';
const SALES = "We don't take sales calls on this line. Please e-mail office at grayco-cs.com. Goodbye.";
const BYE_NOINPUT = 'Goodbye.';
async function orderCfg(){
  let raw = null; try { raw = await L().kvGet(CO().KEY); } catch (e) { raw = null; }
  if (raw && typeof raw === 'object') return { cfg: CO().clean(raw), saved: true };
  const d = CO().defaults(), ring = phone10(env('TWILIO_RING_TO'));   /* nothing saved: the owner's order, or TWILIO_RING_TO alone when set */
  if (ring.length === 10) d.slots = [{ id: 'ringto', label: 'Office', on: true, kind: 'phone', phone: ring, person: '' }];
  return { cfg: d, saved: false };
}
/* the call log (gc_lead_inbox_kv "gc_call_log"): one row per call, newest last, 200 kept */
async function logGet(sid){ try { const v = await L().kvGet(CO().LOG_KEY); return (v && Array.isArray(v.calls) ? v.calls : []).find(x => x && x.sid === sid) || null; } catch (e) { return null; } }
async function logPut(sid, patch){
  if (!sid) return null;
  let row = null;
  try {
    await L().kvCas(CO().LOG_KEY, v => {
      v = v && typeof v === 'object' ? v : {}; const l = Array.isArray(v.calls) ? v.calls : [];
      row = l.find(x => x && x.sid === sid);
      if (!row) { row = { sid, at: nowIso() }; l.push(row); }
      Object.assign(row, patch, { upd: nowIso() });
      v.calls = l.slice(-200); return v;
    });
  } catch (e) {}
  return row;
}
async function orderList(cfg, p, choice, ah){
  let data = {}; try { data = await core().kvRead(['users', 'gc_senior_pm']); } catch (e) {}
  let ours = [env('TWILIO_FROM')]; try { const set = SMS().settings(await L().kvGet(SMS().SETTINGS_KEY)); ours = ours.concat(require('./_lib/smsroute.js').numbers(set, env).map(x => x.number)); } catch (e) {}
  const c = JSON.parse(JSON.stringify(cfg));
  if (!c.on) c.slots = [];
  if (ah) c.slots = c.night.slots;   /* patch AFTERHOURS: the after-hours emergency order (Mitigation manager → Nick → Wesley) */
  else if (choice === '2') {   /* a current customer: their job's PM first, when the caller's number is on a job */
    try { const cust = await WI().findCustomer({ phone: phone10(p.From), email: '' }); const u = cust && cust.pm ? require('./_lib/people.js').findUser(data.users, cust.pm) : null;
      if (u && CO().userPhone(u).length === 10) c.slots.unshift({ id: 'jobpm', label: 'Job PM', on: true, kind: 'phone', phone: CO().userPhone(u), person: '' }); } catch (e) {}
  }
  return CO().resolve(c, data, CO().callCtx(p, ours)).list;
}
const AHQ = ah => ah ? { ah: 1 } : {};
function menuTwiml(cfg, n, ah){
  const u = hookUrl('menu', Object.assign({ try: n }, AHQ(ah)));
  return twiml('<Gather input="dtmf speech" numDigits="1" timeout="6" speechTimeout="auto" hints="one, two, three, emergency, construction, customer, sales" actionOnEmptyResult="true" action="' + esc(u) + '" method="POST">'
    + SAYV + esc(ah ? cfg.night.greeting : cfg.screen.greeting) + '</Say></Gather><Redirect method="POST">' + esc(u) + '</Redirect>');
}
/* patch AFTERHOURS: "2" after hours — no ring: a text at once and a lead for the morning */
const AH_TEXT = 'Thanks for calling GrayCo — our office is closed. We got your call and will call you back in the morning. Reply here with any details.';
async function nightText(p, row){
  await logPut(s(p.CallSid), { outcome: 'after hours — texted, lead for the morning' });
  await missed(p, 'after hours (pressed 2): texted, lead for the morning', { text: AH_TEXT, what: s(row && row.what) });
  return twiml(SAYV + "Thank you. We've sent you a text and will call you back in the morning. Goodbye.</Say><Hangup/>");
}
const isAh = (row, qs) => s(row && row.ah) === '1' || s(qs && qs.ah) === '1';
function dialTwiml(cfg, list, i, sid, sayText, c, ah){   /* c = the menu answer, carried in the signed URL too (the log is the first source) */
  const x = list[i];
  const num = cfg.screen.whisper ? '<Number url="' + esc(hookUrl('whisper', Object.assign({ step: i, p: sid }, c ? { c } : {}, AHQ(ah)))) + '" method="POST">+1' + x.number + '</Number>' : '<Number>+1' + x.number + '</Number>';
  return twiml((sayText ? SAYV + esc(sayText) + '</Say>' : '') + '<Dial timeout="' + x.secs + '" answerOnBridge="true" action="' + esc(hookUrl('dialdone', Object.assign({ step: i }, c ? { c } : {}, AHQ(ah)))) + '" method="POST">' + num + '</Dial>');
}
async function finishMissed(p, row, how, ah){
  const sid = s(p.CallSid);
  await logPut(sid, { outcome: 'missed' });
  await missed(p, how, { what: s(row && row.what), emergency: !!ah && s(row && row.choice) === '1' });   /* patch AFTERHOURS: an after-hours "1" is an emergency lead */
  return sayBye();
}
async function startRing(cfg, p, row, sayText, c, ah){
  c = s(row && row.choice) || s(c);
  const list = await orderList(cfg, p, c, ah);
  if (!list.length) return finishMissed(p, row || { choice: c }, 'call order: nobody to ring', ah);
  await logPut(s(p.CallSid), { outcome: 'ringing', step: 0 });
  return dialTwiml(cfg, list, 0, s(p.CallSid), sayText, c, ah);
}
/* → TwiML, or null when the call order and the screening are both off (the older paths below run) */
async function callOrder(ev, p, qs){
  const { cfg } = await orderCfg(), sid = s(p.CallSid);
  const active = cfg.on || cfg.screen.on;
  if (ev === 'voice') {
    if (!active) return null;
    const from = phone10(p.From);
    if (CO().isBlocked(cfg, from) || CO().attestationFailed(p)) {   /* known spam: like "3" */
      await logPut(sid, { from, choice: '3', outcome: CO().isBlocked(cfg, from) ? 'blocked number' : 'caller ID failed (STIR/SHAKEN ' + s(p.StirVerstat) + ')' });
      return twiml(SAYV + esc(SALES) + '</Say><Hangup/>');
    }
    const ah = !CO().isOpen(now(), cfg);   /* patch AFTERHOURS */
    if (cfg.screen.on) { await logPut(sid, { from, choice: '', outcome: 'menu', ah: ah ? '1' : '' }); return menuTwiml(cfg, 1, ah); }
    if (ah) { const r0 = await logPut(sid, { from, choice: '2', ah: '1' }); return nightText(p, r0); }   /* no menu after hours: no ring, a text + a lead */
    const row = await logPut(sid, { from, choice: 'direct', outcome: 'ringing' });
    return startRing(cfg, p, row, HOLD, 'direct');
  }
  if (ev === 'menu') {
    const c = CO().choiceOf(p), n = parseInt(qs.try, 10) || 1, ah = isAh(null, qs);
    if (!c) {
      if (n < 2) return menuTwiml(cfg, 2, ah);   /* once more */
      await logPut(sid, { from: phone10(p.From), outcome: 'no answer to menu (likely robocall)' });
      return twiml(SAYV + BYE_NOINPUT + '</Say><Hangup/>');
    }
    if (c === '3') { await logPut(sid, { from: phone10(p.From), choice: '3', outcome: 'sales / other (pressed 3)' }); return twiml(SAYV + esc(SALES) + '</Say><Hangup/>'); }
    const row = await logPut(sid, { from: phone10(p.From), choice: c, ah: ah ? '1' : '', outcome: ah ? (c === '1' ? 'after hours — EMERGENCY' : 'after hours') : c === '1' ? 'new work' : 'current customer' });
    if (ah && c === '2') return nightText(p, row || { choice: '2' });   /* patch AFTERHOURS */
    if (c === '1' && cfg.screen.askWhat) {
      const wu = hookUrl('what', Object.assign({ c }, AHQ(ah)));
      return twiml('<Gather input="speech" timeout="8" speechTimeout="auto" actionOnEmptyResult="true" action="' + esc(wu) + '" method="POST">' + SAYV + esc(ah ? 'In a few words, what happened?' : ASK_WHAT) + '</Say></Gather>'
        + '<Redirect method="POST">' + esc(wu) + '</Redirect>');
    }
    return startRing(cfg, p, row, HOLD2, c, ah);
  }
  if (ev === 'what') {
    const row0 = await logGet(sid), c0 = s(row0 && row0.choice) || s(qs.c), ah = isAh(row0, qs);
    if (['1', '2', 'direct'].indexOf(c0) < 0) return twiml(SAYV + BYE_NOINPUT + '</Say><Hangup/>');   /* never rings without a 1 / 2 */
    const row = await logPut(sid, { what: clip(s(p.SpeechResult), 200) });
    return startRing(cfg, p, row || { choice: c0, what: clip(s(p.SpeechResult), 200) }, HOLD2, c0, ah);
  }
  if (ev === 'whisper') {   /* the person's phone answered: "GrayCo call: … press 1 to accept" (a voicemail does not press 1) */
    const parent = s(qs.p) || s(p.ParentCallSid), row = await logGet(parent), step = parseInt(qs.step, 10) || 0;
    const ah = isAh(row, qs);
    const what = s(row && row.what) || (ah ? 'an emergency' : row && row.choice === '2' ? 'a current customer' : 'a new project');
    const line = SAYV + (ah ? 'GrayCo EMERGENCY call: ' : 'GrayCo call: ') + esc(clip(what, 140)) + '. Press 1 to accept.</Say>';
    return twiml('<Gather numDigits="1" timeout="6" action="' + esc(hookUrl('accept', { step, p: parent })) + '" method="POST">' + line + '<Pause length="1"/>' + line + '</Gather><Hangup/>');
  }
  if (ev === 'accept') {
    const parent = s(qs.p) || s(p.ParentCallSid);
    if (s(p.Digits) !== '1') return twiml('<Hangup/>');
    await logPut(parent, { accepted: true, acceptedStep: parseInt(qs.step, 10) || 0, acceptedBy: phone10(p.To || p.Called) });
    return twiml('');   /* connects them to the caller */
  }
  if (ev === 'dialdone' && qs.step != null && /^\d{1,3}$/.test(s(qs.step))) {
    const row = await logGet(sid), step = parseInt(qs.step, 10), c = s(row && row.choice) || s(qs.c), ah = isAh(row, qs);
    const list = await orderList(cfg, p, c, ah), who = list[step];
    const answered = /^(completed|answered)$/i.test(s(p.DialCallStatus)) && (!cfg.screen.whisper || !!(row && row.accepted)
      || (!row && (parseInt(p.DialCallDuration, 10) || 0) >= 20));   /* the log unreachable: a 20 s+ conversation counts as answered */
    if (answered) { await logPut(sid, { outcome: 'answered', by: who ? who.label + (who.name ? ' — ' + who.name : '') : '' }); return twiml('<Hangup/>'); }
    if (['1', '2', 'direct'].indexOf(c) < 0) return twiml('<Hangup/>');   /* never text a caller who did not press 1 or 2 */
    if (/^(completed|canceled)$/i.test(s(p.CallStatus))) return finishMissed(p, row || { choice: c }, 'call order: the caller hung up while it rang', ah);
    if (step + 1 < list.length) { await logPut(sid, { step: step + 1 }); return dialTwiml(cfg, list, step + 1, sid, '', c, ah); }
    return finishMissed(p, row || { what: '', choice: c }, 'call order: nobody answered (' + s(p.DialCallStatus || 'no-answer') + ')', ah);
  }
  return null;
}

/* ── a text in (patch TXT: matched to the job, on Job Messages, e-mailed to the relay list, one approved answer) ── */
function SMS(){ return require('./_lib/sms.js'); }
function arrL(v){ return Array.isArray(v) ? v : []; }
function jobLabelOf(p){ if (!p) return ''; const st = s(p.address || p.jobAddress || p.street).split(',')[0].trim(); const po = s(p.autoPO || p.poNumber || p.po); return [po ? 'PO ' + po : '', s(p.name), st && low(p.name).indexOf(low(st)) < 0 ? st : ''].filter(Boolean).join(' · '); }
async function postJobMsg(msg){
  const has = l => l.some(m => m && s(m.id) === msg.id);
  try { return await core().kvListUpdate('gc_job_messages', l => has(l) ? null : { list: l.concat([msg]), check: has }); } catch (e) { return { ok: false, error: s(e && e.message) }; }
}
async function commsAdd(pid, o){ if (!pid) return; try { await require('./_lib/comms.js').addMessage(pid, o); } catch (e) {} }
async function relayMail(set, extra, subject, html, text){
  const key = env('RESEND_API_KEY'); if (!key) return { ok: false, why: 'RESEND_API_KEY is not set' };
  let to = SMS().staffOnly(set.relayTo).concat(arrL(extra).map(low).filter(Boolean));
  if (set.relayAdmins) { try { to = to.concat(await L().alertsApi().recipients([])); } catch (e) {} }
  to = Array.from(new Set(to.map(low).filter(Boolean)));
  if (!to.length) return { ok: false, why: 'nobody to tell' };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('SMS_RELAY_FROM') || 'GrayCo Texts <leads@grayco-cs.com>', reply_to: env('REPLY_TO_ADMIN') || 'replies@grayco-cs.com', to, subject: require('./_lib/mailtag.js').tag(subject, to, 'area:Messages'), html, text, headers: { 'X-GrayCo-CRM': 'sms-relay' } }) });
    return { ok: r.ok, to };
  } catch (e) { return { ok: false, why: 'Resend unreachable' }; }
}
const INS_WORDS = /\b(water|flood|leak|fire|smoke|storm|hail|wind|tree|mold|insurance|claim|adjuster|emergency|burst|sewage)\b/i;

async function inboundSms(p){
  const ph = phone10(p.From), body = s(p.Body), at = nowIso();
  const sid = s(p.MessageSid || p.SmsSid) || crypto.createHash('sha256').update(ph + '|' + body + '|' + at.slice(0, 16)).digest('hex').slice(0, 24);
  if (ph.length !== 10) return { skipped: 'no number' };
  if (STOP.test(body)) { await stateCas(st => { st.optout[ph] = at; return true; }); return { optout: true }; }
  try { const sa = await SA().staffInbound(ph, body, s(p.MessageSid || p.SmsSid)); if (sa) return Object.assign({ cellAlerts: true }, sa); } catch (e) {}   /* patch SMSALERT: a staff cell in the alerts table — a reply to the last alert, never a lead */
  if (START.test(body)) { await stateCas(st => { delete st.optout[ph]; return true; }); return { optin: true }; }
  /* Twilio retries a webhook it thinks failed: the same message is handled once */
  let fresh = false;
  await stateCas(st => { st.seen = st.seen && typeof st.seen === 'object' ? st.seen : {}; if (st.seen[sid]) return undefined; st.seen[sid] = at; fresh = true; return true; });
  if (!fresh) return { skipped: 'already handled' };
  const S = SMS(); let set = S.settings(null);
  try { set = S.settings(await L().kvGet(S.SETTINGS_KEY)); } catch (e) {}
  const st0 = await stateGet(), own = st0.owner[ph] || {}, optedOut = !!st0.optout[ph];
  const out = { sid };
  /* HELP: the standard answer, nothing else */
  /* patch SMSMENU: on the Customers / default number HELP opens the 1–5 menu (with the STOP line) further down */
  const menuLine0 = ['customers', 'main'].indexOf(require('./_lib/smsroute.js').purposeOf(phone10(p.To), set, env)) >= 0;
  if (S.HELP.test(body) && !menuLine0) { out.help = optedOut ? { skipped: 'opted out' } : await sendSms(ph, S.HELP_TEXT); return out; }
  /* patch SUBTXT: an answer to a sub's schedule text — Y → ✓ Confirmed; anything else → the job's PM at once (push, 🔴 To-Do, e-mail) */
  try { const sh = await require('./sub-texts.js')._lib.handleReply(ph, body, at); if (sh && sh.handled) { out.subText = { confirmed: !!sh.confirmed, issue: !!sh.issue, key: sh.key }; return out; } } catch (e) { out.subTextError = s(e && e.message); }
  let data = {};
  try { data = await core().kvRead(['projects', 'customers', 'subs', 'vendors', 'leads', 'schedule', 'users', 'gc_deleted_projects', 'gc_team_settings', 'invs', 'invoices']); } catch (e) {}
  let who = S.match(data, ph);
  if (!who && own.pid) { const p0 = arrL(data.projects).find(x => x && s(x.id) === s(own.pid)); if (p0) who = { kind: 'customer', pid: s(p0.id), name: s(p0.client), job: p0 }; }
  let job = who && who.job ? who.job : null, pid = who && who.pid ? who.pid : '';
  /* patch SMSROUTE: who gets this text — the employee who texted them last, the sub's / customer's PM, the lead's owner,
     billing → office, insurance → Senior Insurance PM, emergency → on call; nobody → the office */
  const RT = require('./_lib/smsroute.js'), toNum = phone10(p.To), purpose = RT.purposeOf(toNum, set, env);
  if (!who) { const su = arrL(data.users).find(u => [u.phone, u.cell, u.mobile].map(phone10).indexOf(ph) >= 0); if (su) who = { kind: 'staff', pid: '', name: s(su.name), email: low(su.email) }; }
  if (who && who.kind === 'sub') who.sub = arrL(data.subs).concat(arrL(data.vendors)).find(x => x && s(x.id) === s(who.subId)) || null;
  let insP = null; try { const h = require('./_lib/lead-roles.js').holder('insurance', data.gc_team_settings, data.users); if (h && (h.email || h.name)) insP = { name: s(h.name), email: low(h.email) }; } catch (e) {}
  let onP = null; try { const X = require('./_lib/x10.js'); const o = X.onCallNow(now(), X.oncallCfg(await L().kvGet('gc_x10_oncall'))); if (o) onP = { name: s(o.name), email: low(o.email), phone: s(o.phone) }; } catch (e) {}
  const rt = RT.route({ data, who, purpose, body, last: (st0.lastOut || {})[ph], pmOf: j => { try { return core().pmOf(data, j); } catch (e) { return null; } },
    insurance: insP, oncall: onP, leadsPerson: set.leadsPerson ? { name: '', email: set.leadsPerson } : null });
  if (rt.pid && !pid) { pid = rt.pid; job = rt.job || job; }
  out.route = { purpose, to: rt.to.map(x => x.email || x.name), office: rt.office, urgent: rt.urgent, why: rt.why };
  const name = s(who && who.name);
  const label = jobLabelOf(job);
  const shown = (name || tidy(ph)) + (who && who.kind === 'sub' ? ' (sub)' : '');
  /* 1) Job Messages (by job; no job → 📥 Unsorted) + the job's 💬 Communication timeline */
  out.msg = await postJobMsg({ id: 'SMS_' + sid, pid, authorId: 'sms:' + ph, authorName: '📱 ' + shown + ' (text)', text: clip(body, 1600), tags: RT.tagsFor(rt.to, data.users), at, source: 'sms', channel: 'sms', dir: 'in', smsFrom: ph,
    smsTo: toNum, purpose, routedTo: rt.to.map(x => ({ name: s(x.name), email: s(x.email), why: s(x.why) })), office: !!rt.office, urgent: !!rt.urgent, urgency: rt.urgent ? 'asap' : '' });
  await commsAdd(pid, { id: 'sms_' + sid, kind: 'text', dir: 'in', at, from: tidy(ph), fromName: name, text: body });
  /* 2) a missed-call lead / call-back to-do this number already has: the text is added there too (patch AUTO6) */
  const line = '📱 Text from ' + tidy(ph) + ' (' + at.slice(0, 16).replace('T', ' ') + ' UTC): ' + clip(body, 1000);
  if (own.lead) {
    try {
      await L().kvCas(L().KV, v => {
        const items = Array.isArray(v) ? v : []; const it = items.find(x => x && x.id === own.lead); if (!it) return undefined;
        it.notes = (Array.isArray(it.notes) ? it.notes : []).concat([line]).slice(-60); it.scope = clip(s(it.scope) + '\n' + line, 1200); it.updatedAt = at; it.lastTextAt = at;
        return items;
      });
      out.lead = own.lead;
    } catch (e) { out.error = s(e && e.message); }
  } else if (own.todo) {
    try {
      await core().kvListUpdate('gc_office_tasks', function(l){ const t = l.find(x => x && s(x.id) === own.todo); if (!t) return null; t.note = clip(s(t.note) + '\n' + line, 2000); t.done = false; t.updatedAt = at; return { list: l, check: () => true }; });
      out.todo = own.todo;
    } catch (e) { out.error = s(e && e.message); }
  }
  /* 3) which approved answer fits */
  let rule = S.pickRule(body, set, { pid });
  if (!rule) rule = await S.aiPick(body, set, { pid }, require('./_lib/ai.js'));
  out.rule = rule ? rule.id : '';
  /* 4) a new number (or a known person without a job asking for an estimate / with an emergency) → a lead, routed by the lead roles */
  /* patch SMSROUTE: a new number on the leads line is always a lead; on the main line only when it asks for work (an estimate / an emergency) */
  const wantLead = !own.lead && !own.todo && !(who && who.kind === 'staff') && (rt.wantLead || (!who && (!!(rule && rule.lead) || rt.urgent)) || (!!who && !!(rule && rule.lead) && who.kind !== 'sub' && !pid));
  if (wantLead) {
    const f = { type: INS_WORDS.test(body) ? 'storm' : 'estimate', name: name || 'Texter ' + tidy(ph), email: '', phone: ph, address: '', city: '', state: '', zip: '',
      message: 'Text message ' + at.slice(0, 16).replace('T', ' ') + ' UTC: ' + clip(body, 1200), company: '', service: '', property: '', bestTime: '', damageDate: '', carrier: '', claimFiled: '', claimNumber: '',
      project: '', bidDue: '', plansLink: '', buildings: '', plan: '', urgency: rule && rule.id === 'emergency' ? 'Emergency' : '' };
    try {
      const lsid = crypto.createHash('sha256').update('text|' + ph + '|' + at.slice(0, 10)).digest('hex').slice(0, 24);
      const r = await WI().fileLead(f, { sid: lsid, source: 'Text message', how: 'a text message to the GrayCo number', formLabel: 'Text message',
        title: 'Text message — ' + (name || tidy(ph)), leadExtra: { textMessage: true, smsFrom: ph, textBody: clip(body, 8000) } });   /* patch LEADMAILMSG: the full text */
      out.newLead = r.id; out.action = r.action;
      await stateCas(st => { st.owner[ph] = { lead: r.id, at }; return true; }).catch(() => {});
      out.alerts = r.action === 'added' ? await WI().alertLead(r.rec) : { skipped: r.action };
    } catch (e) { out.leadError = s(e && e.message); }
  }
  /* 5) the job's PM hears too */
  let pm = null; try { pm = job ? core().pmOf(data, job) : (own.pm ? await core().pmByName(own.pm) : null); } catch (e) {}
  try { out.cellAlerts = await SA().inboundText({ ph, body, who, pid, label, urgent: !!rt.urgent, mine: rt.to.map(x => x.email).concat(pm && pm.email ? [pm.email] : [], st0.lastOut && st0.lastOut[ph] ? [st0.lastOut[ph].email] : []) }); } catch (e) {}   /* patch SMSALERT */
  /* patch SMSCONSENT: texting us first is consent (via 'text') — only when nothing is recorded yet, never over STOP, never for subs / staff;
     the first reply to that number carries the subscription notice, once (prepended to the automatic answer, never a second text) */
  let noticeNow = false;
  try {
    const SC = require('./_lib/smsconsent.js'), dataOk = Array.isArray(data.customers) || Array.isArray(data.projects);
    if (dataOk && !optedOut && !(who && (who.kind === 'sub' || who.kind === 'staff'))) {
      let rec = SC.recordFor(data, ph, st0.consent);
      if (!rec) {
        const mine = { status: 'yes', at, via: 'text', phone: ph }; rec = mine;
        await stateCas(st => { st.consent = st.consent && typeof st.consent === 'object' ? st.consent : {}; if (st.consent[ph]) { rec = st.consent[ph]; return undefined; } st.consent[ph] = mine; return true; });
        out.consent = 'yes (texted first)';
      }
      noticeNow = !!rec && rec.status === 'yes' && rec.via === 'text' && !(st0.welcomed && st0.welcomed[ph]);
    }
  } catch (e) { out.consentError = s(e && e.message); }
  /* 6) one automatic answer — never while data-entry mode is on, never to an opted-out number, limited per number */
  let reply = '', why = '';
  let paused = true; try { paused = await require('./_lib/pause').isPaused(); } catch (e) { paused = true; }
  /* patch SMSMENU: customers (and unknown numbers) on the Customers / default number get the 1–5 menu, answered from the CRM;
     1–3 and the warranty only for the phone on file; 4 → the PM calls back; 5 → on call + the PM, ASAP; anything else → the PM */
  const MN = require('./_lib/smsmenu.js'), menu = { done: false };
  const menuLine = ['customers', 'main'].indexOf(purpose) >= 0 && !(who && (who.kind === 'sub' || who.kind === 'staff' || who.kind === 'lead'));
  if (menuLine && set.autoOn && !optedOut && !paused) {
    const onFile = !!(who && who.kind === 'customer');
    const isMenuWord = MN.MENU_WORD.test(body) || S.HELP.test(body);
    let c = isMenuWord ? 'menu' : (MN.choice(body) || MN.intent(body));
    if (!c && rule && MN.RULE_TO[rule.id]) c = MN.RULE_TO[rule.id];   /* one of the approved answers matched (keywords, or the small model only classifying) */
    const useApproved = !c && !!rule;   /* hours, address, services, an estimate request … → the approved answer below, as before */
    if (!c && !useApproved && !(st0.menu && st0.menu[ph])) c = 'menu';   /* their first text */
    if (!useApproved) {
    const pmFirst = S.firstName(pm && pm.name);
    let link = '';
    if (onFile && job && ['1', '2', '3', 'w'].indexOf(c) >= 0) {
      try { if (core().jaAllows(data, job, 'portalLink')) { const row = await core().activeFor(s(job.id)); const tok = row ? row.token : await core().createFor(s(job.id), 'text menu'); if (tok) link = core().linkFor(null, tok); } } catch (e) {}
    }
    let bal = { balance: null, openCount: 0 };
    if (c === '3' && onFile && job) { try { const C0 = core(); bal = MN.balanceOf(C0.listOf(data, ['invs', 'invoices']), job, C0.isCustomerInvoice, C0.invBalance); } catch (e) {} }
    const nv = pid ? S.nextVisit(data, pid, at) : null;
    const mctx = { first: S.firstName(name), pmFirst, job: onFile ? job : null, jobName: job ? s(job.name) : '', onFile, visitDate: nv ? s(nv.date || nv.start || nv.startDate) : '', link, balance: bal.balance, openCount: bal.openCount };
    if (c === 'menu') menu.reply = MN.menuText(mctx.first, S.HELP.test(body));
    else if (c) menu.reply = MN.answer(c, mctx);
    else { menu.reply = MN.forwarded(pmFirst); menu.needHuman = true; }
    if (c === '4') { menu.needHuman = true; menu.callback = true; rt.urgent = true; }
    if (c === '5') { menu.needHuman = true; rt.urgent = true; if (onP && !rt.to.some(x => low(x.email) === low(onP.email))) rt.to.push(Object.assign({ why: 'on call (emergency)' }, onP)); if (!job) rt.office = true; }
    if (!onFile && ['1', '2', '3', 'w'].indexOf(c) >= 0) { menu.needHuman = true; rt.office = true; }
    /* a runaway loop (an auto-responder texting back) gets at most 12 menu answers a day */
    let allowed = false;
    await stateCas(x => { x.menu = x.menu && typeof x.menu === 'object' ? x.menu : {}; x.menuN = x.menuN && typeof x.menuN === 'object' ? x.menuN : {};
      const l = (Array.isArray(x.menuN[ph]) ? x.menuN[ph] : []).filter(a => now() - Date.parse(a) < 86400000);
      if (l.length < 12 || c === '5') { l.push(at); allowed = true; } x.menuN[ph] = l; if (!x.menu[ph]) x.menu[ph] = at; return true; }).catch(() => { allowed = true; });
    menu.choice = c || 'forward'; out.menu = menu.choice;
    if (allowed && !c) { await stateCas(x => { x.fwd = x.fwd && typeof x.fwd === 'object' ? x.fwd : {}; if (now() - Date.parse(x.fwd[ph] || 0) < 12 * 3600000) { allowed = false; return undefined; } x.fwd[ph] = at; return true; }).catch(() => {}); }   /* "has your message" once per 12 h */
    if (allowed) { menu.reply = S.safe(menu.reply); menu.done = true; } else { menu.done = true; menu.reply = ''; menu.why = c ? 'menu limit reached for this number today' : 'they were told a person will answer'; menu.needHuman = true; }
    }
  }
  if (menu.done) { reply = menu.reply; why = menu.why || ''; }
  else if (optedOut) why = 'opted out';
  else if (paused) why = 'data-entry mode is on';
  else if (!set.autoOn) why = 'automatic answers are off';
  else if (!S.whenAllows(set, now(), rule)) why = 'outside the hours set for automatic answers';
  else if (who && who.kind === 'sub') why = 'a sub (staff answer subs)';
  else if (who && who.kind === 'staff') why = 'a GrayCo employee';   /* patch SMSROUTE */
  else {
    const B = require('./_lib/brand.js');
    const ctx = { address: B.companyAddress(), billing: (function(){ try { return B.billingEmail(); } catch (e) { return 'billing@grayco-cs.com'; } })(),
      first: S.firstName(name), job: job ? s(job.name) : '', pm: pm && pm.name ? pm.name : '', visit: pid ? S.nextVisit(data, pid, at) : null };
    ctx.nextVisit = S.nextVisitText(ctx);
    const key = rule ? rule.id : '_fallback';
    let ok = false;
    await stateCas(st => {
      st.auto = st.auto && typeof st.auto === 'object' ? st.auto : {};
      const list = (Array.isArray(st.auto[ph]) ? st.auto[ph] : []).filter(x => x && now() - Date.parse(x.at) < 86400000);
      const sameRule = list.some(x => x.rule === key && now() - Date.parse(x.at) < (key === '_fallback' ? 12 : 24) * 3600000);
      if (list.length >= set.maxPerDay || (sameRule && key !== 'emergency')) { st.auto[ph] = list; return true; }
      list.push({ at, rule: key }); st.auto[ph] = list; ok = true; return true;
    });
    if (!ok) why = 'already answered this number recently';
    else if (rule) reply = S.safe(rule.id === 'status' ? ctx.nextVisit : S.fill(rule.answer, ctx));
    else if (set.fallbackOn) reply = S.FALLBACK;
    else why = 'no answer fits';
  }
  if (noticeNow && !paused && !optedOut) reply = reply ? SMS().NOTICE_PREFIX + ' ' + reply : SMS().NOTICE_PREFIX;   /* patch SMSCONSENT */
  else noticeNow = false;
  if (reply) {
    out.reply = await sendSms(ph, reply, RT.isOurs(toNum, set, env) ? '+1' + toNum : '');   /* patch SMSROUTE: answered from the number they texted */
    if (out.reply.ok && noticeNow) { out.notice = true; await stateCas(st => { st.welcomed = st.welcomed && typeof st.welcomed === 'object' ? st.welcomed : {}; st.welcomed[ph] = at; return true; }).catch(() => {}); }   /* patch SMSCONSENT */
    if (out.reply.ok) {
      const rid = 'SMSA_' + sid;
      await postJobMsg({ id: rid, pid, authorId: 'sms:auto', authorName: '🤖 GrayCo auto-answer (text)', text: reply, tags: [], at: nowIso(), source: 'sms', channel: 'sms', dir: 'out', smsTo: ph });
      await commsAdd(pid, { id: 'sms_' + rid, kind: 'text', dir: 'out', at: nowIso(), from: 'GrayCo (auto-answer)', fromName: 'GrayCo', to: [tidy(ph)], text: reply });
    }
  } else out.noReply = why;
  /* patch SMSROUTE: the people it is routed to hear at once (phone push), and a "reply to this text" to-do when a person must answer */
  if (!(who && who.kind === 'staff') && !(rt.urgent && out.newLead && out.action === 'added')) {   /* patch EMERG: a new emergency lead is alerted by the lead path (once) */
    let offEmails = []; if (rt.office) { try { offEmails = core().officeEmails(data); } catch (e) {} }
    if (rt.urgent) { try { offEmails = offEmails.concat(await L().alertsApi().recipients([])); } catch (e) {} if (!offEmails.length) offEmails = ['office@grayco-cs.com']; }   /* patch EMERG: + every admin */
    const pushList = Array.from(new Set(rt.to.map(x => low(x.email)).concat(offEmails).filter(Boolean)));
    if (pushList.length) { try { out.push = await core().pushTo(pushList, { title: (rt.urgent ? '🚨 ' : '📱 ') + 'Text from ' + clip(shown, 60), body: clip(body, 160), tag: 'sms-' + ph, url: '/?jobmsg=' + encodeURIComponent(pid || 'unsorted') }); } catch (e) { out.push = { ok: false }; } }
    if (rt.urgent || !reply || menu.needHuman) {   /* patch SMSMENU: a menu answer that still needs a person counts too */
      const tid = 'SMSR_' + ph, names = rt.to.map(x => s(x.name)).filter(Boolean);
      const tline = at.slice(0, 16).replace('T', ' ') + ' UTC — ' + clip(body, 600) + (rt.why ? '  [' + rt.why + ']' : '');
      try {
        out.replyTodo = await core().kvListUpdate('gc_office_tasks', function(l){
          const t = l.find(x => x && s(x.id) === tid && !x.done);
          if (t) { if (s(t.note).indexOf(sid) >= 0) return null; t.note = clip(s(t.note) + '\n' + tline + ' [' + sid + ']', 2000); t.updatedAt = at; if (rt.urgent) { t.prio = 'urgent'; t.urgency = 'asap'; } names.forEach(n => { if ((t.assignees || []).indexOf(n) < 0) t.assignees = (t.assignees || []).concat([n]); }); return { list: l, check: () => true }; }
          const item = { id: tid, label: (menu.callback ? '📞 Call back ' : rt.urgent ? '🚨 Text back ' : '📱 Text back ') + (name || tidy(ph)) + (label ? ' — ' + label : ''), note: tline + ' [' + sid + ']', pid: pid || '', phone: tidy(ph),
            assignees: names, office: !names.length || !!rt.office, prio: rt.urgent ? 'urgent' : 'high', urgency: rt.urgent ? 'asap' : 'soon', due: at.slice(0, 10), kind: 'sms_reply', addedBy: 'Text message (Twilio)', addedAt: at, updatedAt: at, createdAt: at, done: false };
          l = l.filter(x => !(x && s(x.id) === tid && x.done));
          return { list: l.concat([item]), check: l2 => l2.some(x => x && s(x.id) === tid) };
        });
      } catch (e) { out.replyTodo = { ok: false }; }
    }
  }
  /* 7) the e-mail relay (staff only) — an emergency says so in the subject and also goes to the Senior Insurance PM */
  const extra = [];
  rt.to.forEach(x => { if (x.email) extra.push(x.email); });   /* patch SMSROUTE */
  if (rt.office) { try { core().officeEmails(data).forEach(e => extra.push(e)); } catch (e) {} }
  if (pm && pm.email) extra.push(pm.email);
  /* patch EMERG: an emergency text → on call (else the Senior Insurance PM, via the routing) + the admins + the office; no longer the Senior Insurance PM only */
  if (rt.urgent) { try { (await L().alertsApi().recipients([])).forEach(e => extra.push(e)); } catch (e) {} try { core().officeEmails(data).forEach(e => extra.push(e)); } catch (e) {} }
  const emerg = !!(rule && rule.alert) || !!rt.urgent;   /* patch SMSROUTE: emergency words count too */
  const subj = (emerg ? '🚨 EMERGENCY text from ' : '📱 Text from ') + shown + (label ? ' — ' + label : (out.newLead ? ' — new lead' : ''));
  const link = site() + (pid ? '/?jobmsg=' + encodeURIComponent(pid) : '/?jobmsg=unsorted');
  const convo = { html: '', text: '' }; try { const th = LM().threadOf(((await core().kvListRead('gc_job_messages')) || {}).list, ph, 10); convo.html = LM().threadHtml(th); convo.text = LM().threadText(th); } catch (e) {}   /* patch LEADMAILMSG */
  const html = '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:' + (emerg ? '#b91c1c' : '#241968') + ';color:#fff;padding:14px 18px;font-weight:700;font-size:16px">' + esc(emerg ? '🚨 Emergency text — call them now' : '📱 A text came in') + '</div><div style="padding:6px 18px 18px">' + LM().buttons({ phone: ph })
    + '<p><b>' + esc(shown) + '</b> · ' + esc(tidy(ph)) + (label ? '<br>Job: <b>' + esc(label) + '</b>' + (pm && pm.name ? ' — PM ' + esc(pm.name) : '') : (out.newLead ? '<br>New lead in Leads → 📥 Lead Inbox (source "Text message").' : '<br>Not on a job — it is in Job Messages → 📥 Unsorted.')) + '</p>'
    + LM().boxHtml(LM().textInfo({ body, name, phone: ph, kind: who && who.kind, job: label })) + convo.html   /* patch LEADMAILMSG: the full text + the conversation so far */
    + (reply ? '<p style="color:#475569">Automatic answer sent: <i>' + esc(reply) + '</i></p>' : '<p style="color:#475569">No automatic answer (' + esc(why || 'none') + ') — please text them back.</p>')
    + '<p style="margin-top:18px"><a href="' + esc(link) + '" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Reply in the CRM</a></p>'
    + '<p style="font-size:12px;color:#64748b">Replying to this e-mail does not reach them — answer from the CRM (Job Messages → 📱 Text them) so it goes out from the GrayCo number.</p></div></div>';
  out.mail = await relayMail(set, extra, subj, LM().telify(html), subj + '\n\n' + body + '\n\n' + (convo.text ? convo.text + '\n' : '') + (reply ? 'Auto-answer: ' + reply + '\n\n' : '') + 'Reply in the CRM: ' + link);
  return out;
}

exports.handler = async function(event){
  const m = s(event.httpMethod).toUpperCase(), qs = event.queryStringParameters || {};
  if (m === 'GET' && qs.ping === '1') {
    return J(200, { ok: true, service: 'GrayCo missed-call text-back', ready: ready(), mode: 'menu (1 work · 2 customer · 3 other) → the 📞 Call order (Admin) → missed-call text',
      voiceWebhook: hookUrl('voice'), smsWebhook: hookUrl('sms'), email: !!env('RESEND_API_KEY') });
  }
  if (m !== 'POST') return J(405, { ok: false, error: 'Method not allowed' });
  if (!ready()) return twiml('');   /* dormant: nothing is set up yet */
  const p = params(event);
  if (!signed(event, p)) return J(403, { ok: false, error: 'Bad signature' });
  const ev = s(qs.event) || 'voice';
  try {
    if (ev === 'sms') { await inboundSms(p); return twiml(''); }
    if (ev === 'ecall') return twiml(await EC().twimlCall(s(qs.id), parseInt(qs.step, 10) || 0));   /* patch EMERGCALL: our outbound call answered */
    if (ev === 'ecallkey') return twiml(await EC().key(s(qs.id), parseInt(qs.step, 10) || 0, p.Digits, p.To || p.Called));
    if (ev === 'ecallstatus') { if (/^(completed|no-answer|busy|failed|canceled)$/i.test(s(p.CallStatus))) await EC().advance(s(qs.id), parseInt(qs.step, 10) || 0); return twiml(''); }
    if (/^(voice|menu|what|whisper|accept|dialdone)$/.test(ev)) { const r = await callOrder(ev, p, qs); if (r) return r; }   /* patches CALLCHAIN + CALLSCREEN */
    if (ev === 'voice' && CC().on()) {   /* patch CHAIN */
      const chain = await CC().start(s(p.CallSid), p.From).catch(() => []);
      if (chain.length) return twiml('<Say voice="Polly.Joanna">Thanks for calling GrayCo Construction Services. Please hold while we connect you.</Say>' + dialStep(0, chain));
    }
    if (ev === 'chain') {   /* one person's ring ended: done if someone took it, else the next one, else the text-back */
      const c = await CC().get(s(p.CallSid)), i = parseInt(qs.i, 10) || 0;
      if (c && c.took) return twiml('<Hangup/>');
      if (c && i < c.chain.length) return twiml(dialStep(i, c.chain));
      await missed(p, 'call chain: nobody took it');
      return sayBye();
    }
    if (ev === 'screen') {   /* the person's phone answered: a voicemail must not take the call — press 1 */
      const c = await CC().get(s(p.ParentCallSid)).catch(() => null);
      const four = c && c.from ? c.from.split('').join(' ') : '';
      return twiml('<Gather numDigits="1" timeout="8" action="' + esc(hookUrl('take') + '&i=' + (parseInt(qs.i, 10) || 0)) + '" method="POST"><Say voice="Polly.Joanna">GrayCo emergency line.'
        + (four ? ' Caller ending in ' + four + '.' : '') + ' Press 1 to take this call.</Say></Gather><Hangup/>');
    }
    if (ev === 'take') {
      if (s(p.Digits) !== '1') return twiml('<Hangup/>');
      await CC().took(s(p.ParentCallSid), parseInt(qs.i, 10) || 0).catch(() => {});
      return twiml('');   /* connects them to the caller */
    }
    if (ev === 'voice') {
      const ring = phone10(env('TWILIO_RING_TO'));
      if (ring.length === 10) {
        const secs = Math.max(8, Math.min(60, parseInt(env('TWILIO_RING_SECONDS') || '20', 10) || 20));
        return twiml('<Dial timeout="' + secs + '" action="' + esc(hookUrl('dialdone')) + '" method="POST"><Number>+1' + ring + '</Number></Dial>');
      }
      await missed(p, 'forwarded');
      return sayBye();
    }
    if (ev === 'dialdone') {
      if (/^(completed|answered)$/i.test(s(p.DialCallStatus))) return twiml('<Hangup/>');
      await missed(p, 'ring ' + s(p.DialCallStatus || 'no-answer'));
      return sayBye();
    }
    if (ev === 'status') {   /* a status callback: only an unanswered / busy / failed call counts */
      if (/^(no-answer|busy|failed|canceled)$/i.test(s(p.CallStatus))) {
        const row = await logGet(s(p.CallSid));   /* patch CALLSCREEN: a screened call is texted only after a 1 / 2 */
        if (!row || ['1', '2', 'direct'].indexOf(s(row.choice)) >= 0) await missed(p, 'status ' + s(p.CallStatus), { what: s(row && row.what) });
      }
      return twiml('');
    }
    return twiml('');
  } catch (e) {
    try { console.warn('[missed-call]', e && e.message); } catch (x) {}
    return ev === 'sms' || ev === 'status' ? twiml('') : sayBye();
  }
};
exports._test = { EC, callOrder, orderCfg, logGet, hookUrl, dialStep, CC, sigFor, signed, params, missed, inboundSms, loadState, ready, sendSms, stateGet, stateCas, TEXT, STOP, START, KS };
