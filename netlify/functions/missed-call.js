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
function hookUrl(ev){ return site() + '/.netlify/functions/missed-call?event=' + ev; }
function L(){ return require('./bid-inbox.js')._lib; }
function WI(){ return require('./website-intake.js')._lib; }
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
  ['calls', 'texted', 'optout', 'owner'].forEach(k => { if (!st[k] || typeof st[k] !== 'object') st[k] = {}; });
  /* forget handled calls after 7 days */
  const cut = new Date(now() - 7 * 86400000).toISOString();
  Object.keys(st.calls).forEach(k => { if (s(st.calls[k]) < cut) delete st.calls[k]; });
  /* patch TXT: texts already handled (Twilio retries) and the automatic answers per number — kept 3 days */
  const cut3 = new Date(now() - 3 * 86400000).toISOString();
  if (st.seen && typeof st.seen === 'object') Object.keys(st.seen).forEach(k => { if (s(st.seen[k]) < cut3) delete st.seen[k]; });
  if (st.auto && typeof st.auto === 'object') Object.keys(st.auto).forEach(k => { const l = Array.isArray(st.auto[k]) ? st.auto[k].filter(x => x && s(x.at) >= cut3) : []; if (l.length) st.auto[k] = l; else delete st.auto[k]; });
  return st;
}
async function stateGet(){ return loadState(await L().kvGet(KS)); }
async function stateCas(fn){ return L().kvCas(KS, v => { const st = loadState(v); const r = fn(st); return r === undefined ? undefined : st; }); }

/* ── Twilio REST: one text ── */
async function sendSms(to10, body){
  if (!ready()) return { ok: false, why: 'not set up' };
  const sid = env('TWILIO_ACCOUNT_SID');
  try {
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', { method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + env('TWILIO_AUTH_TOKEN')).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+1' + to10, From: env('TWILIO_FROM'), Body: clip(body, 600) }).toString() });
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
      body: JSON.stringify({ from: env('BID_ALERT_FROM') || 'GrayCo Leads <leads@grayco-cs.com>', reply_to: env('REPLY_TO_ADMIN') || 'replies@grayco-cs.com', to, subject: require('./_lib/mailtag.js').tag(subject, to, 'area:Leads'), html, text, headers: { 'X-GrayCo-CRM': 'missed-call' } }) });
    return { ok: r.ok, to };
  } catch (e) { return { ok: false, why: 'Resend unreachable' }; }
}
function box(head, body){
  return '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">' + esc(head) + '</div><div style="padding:6px 18px 18px">' + body
    + '<p style="margin-top:18px"><a href="' + esc(site()) + '/#leads" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open the CRM</a></p></div></div>';
}

/* ── an existing customer's missed call → a "📞 Call back" to-do on that job ── */
async function callBackTodo(cust, ph, callSid, at){
  const C = core();
  let pm = null; try { pm = cust.pm ? await C.pmByName(cust.pm) : null; } catch (e) {}
  const id = 'MISSED_' + phone10(ph) + '_' + at.slice(0, 10);
  const label = '📞 Call back ' + (cust.client || tidy(ph)) + ' — missed call' + (cust.job ? ' (' + cust.job + ')' : '');
  const line = 'Missed call ' + at.slice(0, 16).replace('T', ' ') + ' UTC from ' + tidy(ph) + ' — the automatic text went out.';
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
  const html = box('GrayCo — missed call (existing customer)', '<p><b>' + esc(cust.client || 'A customer') + '</b> called from <b>' + esc(tidy(ph)) + '</b> and nobody answered. They got the automatic text.</p>'
    + (cust.job ? '<p>Their job: <b>' + esc(cust.job) + '</b>' + (cust.pm ? ' — PM <b>' + esc(cust.pm) + '</b>' : '') + '. A “📞 Call back” to-do is on that job' + (cust.pm ? ' for ' + esc(cust.pm) : ' (Office To-Do)') + '.</p>' : '<p>A “📞 Call back” to-do is on the Office To-Do.</p>'));
  const m = await mailStaff(pm && pm.email ? [pm.email] : [], subj, html, subj + '\n\nCall back: ' + tidy(ph) + '\n' + site());
  return { todo: id, saved: !!r.ok, mailed: m.ok };
}

/* ── one missed call ── */
async function missed(p, how){
  const ph = phone10(p.From), callSid = s(p.CallSid) || ('call-' + ph + '-' + nowIso().slice(0, 16)), at = nowIso();
  if (ph.length !== 10 || /^(anonymous|restricted|unknown|private)/i.test(s(p.From))) return { skipped: 'no caller id' };
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
  if (textIt) {
    out.text = await sendSms(ph, TEXT);
    if (!out.text.ok) await stateCas(st => { if (st.texted[ph] === at) delete st.texted[ph]; return true; }).catch(() => {});
  } else out.text = { skipped: 'texted recently or opted out' };
  /* existing customer? */
  let cust = null; try { cust = await WI().findCustomer({ phone: ph, email: '' }); } catch (e) {}
  if (cust && (cust.pid || cust.client)) {
    out.customer = await callBackTodo(cust, ph, callSid, at);
    await stateCas(st => { st.owner[ph] = { todo: out.customer.todo, pid: s(cust.pid), pm: s(cust.pm), at }; return true; }).catch(() => {});
    return out;
  }
  /* a new caller → a GrayCo lead */
  const who = s(p.CallerName) && !/^(wireless caller|unknown|anonymous)/i.test(s(p.CallerName)) ? s(p.CallerName).replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()) : '';
  const city = [s(p.FromCity), s(p.FromState)].filter(Boolean).join(', ');
  const f = { type: 'estimate', name: who || 'Caller ' + tidy(ph), email: '', phone: ph, address: '', city: s(p.FromCity), state: s(p.FromState).slice(0, 2), zip: s(p.FromZip),
    message: 'Missed call ' + at.slice(0, 16).replace('T', ' ') + ' UTC' + (city ? ' (caller ID area: ' + city + ')' : '') + '. ' + (out.text.ok ? 'The automatic text went out.' : 'No automatic text (' + (out.text.skipped || out.text.why || 'not sent') + ').'),
    company: '', service: '', property: '', bestTime: '', damageDate: '', carrier: '', claimFiled: '', claimNumber: '', project: '', bidDue: '', plansLink: '', buildings: '', plan: '', urgency: '' };
  const sid = crypto.createHash('sha256').update('missed|' + ph + '|' + at.slice(0, 10)).digest('hex').slice(0, 24);
  const r = await WI().fileLead(f, { sid, source: 'Missed call', how: 'a missed call to the GrayCo number', formLabel: 'Missed call', customer: null,
    title: 'Missed call — ' + (who || tidy(ph)) + (city ? ' — ' + city : ''), leadExtra: { missedCall: true, callSid } });
  out.lead = r.id; out.action = r.action;
  await stateCas(st => { st.owner[ph] = { lead: r.id, at }; return true; }).catch(() => {});
  out.alerts = r.action === 'added' ? await WI().alertLead(r.rec) : { skipped: r.action };
  return out;
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
  if (S.HELP.test(body)) { out.help = optedOut ? { skipped: 'opted out' } : await sendSms(ph, S.HELP_TEXT); return out; }
  /* patch SUBTXT: an answer to a sub's schedule text — Y → ✓ Confirmed; anything else → the job's PM at once (push, 🔴 To-Do, e-mail) */
  try { const sh = await require('./sub-texts.js')._lib.handleReply(ph, body, at); if (sh && sh.handled) { out.subText = { confirmed: !!sh.confirmed, issue: !!sh.issue, key: sh.key }; return out; } } catch (e) { out.subTextError = s(e && e.message); }
  let data = {};
  try { data = await core().kvRead(['projects', 'customers', 'subs', 'vendors', 'leads', 'schedule', 'users', 'gc_deleted_projects', 'gc_team_settings']); } catch (e) {}
  let who = S.match(data, ph);
  if (!who && own.pid) { const p0 = arrL(data.projects).find(x => x && s(x.id) === s(own.pid)); if (p0) who = { kind: 'customer', pid: s(p0.id), name: s(p0.client), job: p0 }; }
  const job = who && who.job ? who.job : null, pid = who && who.pid ? who.pid : '';
  const name = s(who && who.name);
  const label = jobLabelOf(job);
  const shown = (name || tidy(ph)) + (who && who.kind === 'sub' ? ' (sub)' : '');
  /* 1) Job Messages (by job; no job → 📥 Unsorted) + the job's 💬 Communication timeline */
  out.msg = await postJobMsg({ id: 'SMS_' + sid, pid, authorId: 'sms:' + ph, authorName: '📱 ' + shown + ' (text)', text: clip(body, 1600), tags: [], at, source: 'sms', channel: 'sms', dir: 'in', smsFrom: ph });
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
  const wantLead = !own.lead && !own.todo && (!who || (rule && rule.lead && who.kind !== 'sub' && !pid));
  if (wantLead) {
    const f = { type: INS_WORDS.test(body) ? 'storm' : 'estimate', name: name || 'Texter ' + tidy(ph), email: '', phone: ph, address: '', city: '', state: '', zip: '',
      message: 'Text message ' + at.slice(0, 16).replace('T', ' ') + ' UTC: ' + clip(body, 1200), company: '', service: '', property: '', bestTime: '', damageDate: '', carrier: '', claimFiled: '', claimNumber: '',
      project: '', bidDue: '', plansLink: '', buildings: '', plan: '', urgency: rule && rule.id === 'emergency' ? 'Emergency' : '' };
    try {
      const lsid = crypto.createHash('sha256').update('text|' + ph + '|' + at.slice(0, 10)).digest('hex').slice(0, 24);
      const r = await WI().fileLead(f, { sid: lsid, source: 'Text message', how: 'a text message to the GrayCo number', formLabel: 'Text message',
        title: 'Text message — ' + (name || tidy(ph)), leadExtra: { textMessage: true, smsFrom: ph } });
      out.newLead = r.id; out.action = r.action;
      await stateCas(st => { st.owner[ph] = { lead: r.id, at }; return true; }).catch(() => {});
      out.alerts = r.action === 'added' ? await WI().alertLead(r.rec) : { skipped: r.action };
    } catch (e) { out.leadError = s(e && e.message); }
  }
  /* 5) the job's PM hears too */
  let pm = null; try { pm = job ? core().pmOf(data, job) : (own.pm ? await core().pmByName(own.pm) : null); } catch (e) {}
  /* 6) one automatic answer — never while data-entry mode is on, never to an opted-out number, limited per number */
  let reply = '', why = '';
  let paused = true; try { paused = await require('./_lib/pause').isPaused(); } catch (e) { paused = true; }
  if (optedOut) why = 'opted out';
  else if (paused) why = 'data-entry mode is on';
  else if (!set.autoOn) why = 'automatic answers are off';
  else if (!S.whenAllows(set, now(), rule)) why = 'outside the hours set for automatic answers';
  else if (who && who.kind === 'sub') why = 'a sub (staff answer subs)';
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
  if (reply) {
    out.reply = await sendSms(ph, reply);
    if (out.reply.ok) {
      const rid = 'SMSA_' + sid;
      await postJobMsg({ id: rid, pid, authorId: 'sms:auto', authorName: '🤖 GrayCo auto-answer (text)', text: reply, tags: [], at: nowIso(), source: 'sms', channel: 'sms', dir: 'out', smsTo: ph });
      await commsAdd(pid, { id: 'sms_' + rid, kind: 'text', dir: 'out', at: nowIso(), from: 'GrayCo (auto-answer)', fromName: 'GrayCo', to: [tidy(ph)], text: reply });
    }
  } else out.noReply = why;
  /* 7) the e-mail relay (staff only) — an emergency says so in the subject and also goes to the Senior Insurance PM */
  const extra = [];
  if (pm && pm.email) extra.push(pm.email);
  if (rule && rule.alert) { try { const h = require('./_lib/lead-roles.js').holder('insurance', data.gc_team_settings, data.users); if (h && h.email) extra.push(h.email); } catch (e) {} }
  const emerg = !!(rule && rule.alert);
  const subj = (emerg ? '🚨 EMERGENCY text from ' : '📱 Text from ') + shown + (label ? ' — ' + label : (out.newLead ? ' — new lead' : ''));
  const link = site() + (pid ? '/?jobmsg=' + encodeURIComponent(pid) : '/?jobmsg=unsorted');
  const html = '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:' + (emerg ? '#b91c1c' : '#241968') + ';color:#fff;padding:14px 18px;font-weight:700;font-size:16px">' + esc(emerg ? '🚨 Emergency text — call them now' : '📱 A text came in') + '</div><div style="padding:6px 18px 18px">'
    + '<p><b>' + esc(shown) + '</b> · ' + esc(tidy(ph)) + (label ? '<br>Job: <b>' + esc(label) + '</b>' + (pm && pm.name ? ' — PM ' + esc(pm.name) : '') : (out.newLead ? '<br>New lead in Leads → 📥 Lead Inbox (source "Text message").' : '<br>Not on a job — it is in Job Messages → 📥 Unsorted.')) + '</p>'
    + '<blockquote style="border-left:3px solid #d4a017;margin:0;padding:6px 12px;white-space:pre-wrap">' + esc(clip(body, 1600)) + '</blockquote>'
    + (reply ? '<p style="color:#475569">Automatic answer sent: <i>' + esc(reply) + '</i></p>' : '<p style="color:#475569">No automatic answer (' + esc(why || 'none') + ') — please text them back.</p>')
    + '<p style="margin-top:18px"><a href="' + esc(link) + '" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Reply in the CRM</a></p>'
    + '<p style="font-size:12px;color:#64748b">Replying to this e-mail does not reach them — answer from the CRM (Job Messages → 📱 Text them) so it goes out from the GrayCo number.</p></div></div>';
  out.mail = await relayMail(set, extra, subj, html, subj + '\n\n' + body + '\n\n' + (reply ? 'Auto-answer: ' + reply + '\n\n' : '') + 'Reply in the CRM: ' + link);
  return out;
}

exports.handler = async function(event){
  const m = s(event.httpMethod).toUpperCase(), qs = event.queryStringParameters || {};
  if (m === 'GET' && qs.ping === '1') {
    return J(200, { ok: true, service: 'GrayCo missed-call text-back', ready: ready(), mode: env('TWILIO_RING_TO') ? 'ring the office first' : 'office line forwards missed calls',
      voiceWebhook: hookUrl('voice'), smsWebhook: hookUrl('sms'), email: !!env('RESEND_API_KEY') });
  }
  if (m !== 'POST') return J(405, { ok: false, error: 'Method not allowed' });
  if (!ready()) return twiml('');   /* dormant: nothing is set up yet */
  const p = params(event);
  if (!signed(event, p)) return J(403, { ok: false, error: 'Bad signature' });
  const ev = s(qs.event) || 'voice';
  try {
    if (ev === 'sms') { await inboundSms(p); return twiml(''); }
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
      if (/^(no-answer|busy|failed|canceled)$/i.test(s(p.CallStatus))) await missed(p, 'status ' + s(p.CallStatus));
      return twiml('');
    }
    return twiml('');
  } catch (e) {
    try { console.warn('[missed-call]', e && e.message); } catch (x) {}
    return ev === 'sms' || ev === 'status' ? twiml('') : sayBye();
  }
};
exports._test = { sigFor, signed, params, missed, inboundSms, loadState, ready, sendSms, stateGet, stateCas, TEXT, STOP, START, KS };
