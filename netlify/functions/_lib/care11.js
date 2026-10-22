/* ── GrayCo — patch AUTO11: three owner-approved automations (10/22) ──────────────────────────────────────────
   1. COI RENEWAL REQUESTS. A sub's insurance certificate (the CRM's sub record: insExp / coiExp / insuranceExp)
      30 days out, 7 days out and on the day it runs out → the sub gets an e-mail from portal@ (reply-to replies@,
      English or Spanish by the sub's portal language) asking for the new certificate, with the sub-portal link.
      They upload it in the sub portal (Papers → Insurance, with the new date); the CRM files it on the sub, and the
      COI reader (sub-doc-read.js, patch AUTAI) reads it for the office to confirm. A newer date on file = no more
      e-mails for the old one (each e-mail is keyed by the expiration date). The shared Office To-Do gets ONE item per
      sub and date: "🛡 COI expiring: <sub>"; it ticks itself off when a newer COI is on file. An expired COI is
      already flagged by the sub pay check (patch AUTO6). Nothing here ever goes to a customer.
   2. WARRANTY-ENDING CHECK-UPS. A finished job's workmanship warranty (portal.js warrantyOf: 5 years on all roofing
      and insurance work, 1 year on everything else) ends in 60 days or less → the customer is offered a FREE
      check-up before it ends, from news@ with the unsubscribe footer. Each daily run puts at most ONE approval item
      ("🛡 Warranty check-up offer: N customers") on ✅ Approvals (owner rule: nothing to a customer without approval);
      approved → one e-mail each. "Yes, schedule my check-up" (a POST from the link's page — a mail scanner opening
      the link does nothing) → a lead for the original PM (people.js: the Senior PM when that PM is no longer here;
      no one → unassigned + the admins' alert), with the maintenance-plan line (patch X9) in the e-mail.
   3. "WE NEED FROM YOU" — document requests in the customer portal. The PM / office picks items for a job
      (insurance policy papers, adjuster info, HOA approval letter, colors, door / gate codes, signed forms, photos,
      other, or their own). The customer sees a checklist in the portal and uploads files or types an answer. Door /
      gate codes go straight into the job's 🔐 Access codes vault (patch X10) and are never shown back. Each answer →
      an e-mail to the PM. Reminders: day 3 → a reminder on ✅ Approvals (the PM; the first reminder needs approval),
      day 7 → the same reminder again by itself if the first was approved, and a PM To-Do for anything still open.
   Everything is kept in the service-only lead-inbox table (bid-inbox.js kvGet / kvCas), never synced to browsers:
     gc_coi_req_state · gc_warr_check_state · gc_cust_needs · gc_cust_needs_state
   ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
'use strict';
const crypto = require('crypto');

const K = { COI: 'gc_coi_req_state', WARR: 'gc_warr_check_state', NEEDS: 'gc_cust_needs', NST: 'gc_cust_needs_state' };
const COI_STAGES = [{ k: 'd30', max: 30, min: 8 }, { k: 'd7', max: 7, min: 1 }, { k: 'd0', max: 0, min: -9999 }];
const WARR_DAYS = 60;
const NEED_KINDS = {
  policy: 'Insurance policy / declarations page',
  adjuster: 'Adjuster name, phone and e-mail',
  hoa: 'HOA approval letter',
  colors: 'Paint / material colors',
  codes: 'Door / gate / lockbox code',
  forms: 'Signed forms',
  photos: 'Photos',
  other: 'Other'
};
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : (v && Array.isArray(v.list) ? v.list : []); }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function ymd(v){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(v)); if (m) return m[0]; const d = new Date(s(v)); return s(v) && !isNaN(d) ? d.toISOString().slice(0, 10) : ''; }
function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function nowIso(){ return new Date().toISOString(); }
function newToken(){ return crypto.randomBytes(32).toString('base64url'); }
function firstName(n){ n = s(n).replace(/^(mr|mrs|ms|dr)\.?\s+/i, ''); const w = n.split(/[\s,&]+/)[0] || ''; return /^[A-Za-z][A-Za-z'-]{1,20}$/.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''; }
function L(){ return require('../bid-inbox.js')._lib; }
let CORE = null; function core(){ return CORE || require('../portal.js')._core; }
function setCore(c){ CORE = c; }
function P(){ return require('./people.js'); }
function todayCentral(t){ return new Date(t || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }
function daysUntil(day, t){ return Math.round((Date.parse(day + 'T12:00:00Z') - Date.parse(todayCentral(t) + 'T12:00:00Z')) / 864e5); }
function niceDay(d){ try { return new Date(s(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return s(d); } }
function crmBase(){ return (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function portalBase(){ const v = env('PORTAL_BASE_URL').replace(/\/$/, ''); return /^https:\/\//.test(v) ? v : 'https://portal.grayco-cs.com'; }
function replyTo(){ return env('REPLY_TO_ADMIN') || 'replies@grayco-cs.com'; }
function mailOff(){ return /^(1|true|yes)$/i.test(env('PORTAL_MAIL_OFF')); }
async function get(key, dflt){ const v = await L().kvGet(key); return v == null ? dflt : v; }
async function cas(key, fn){ return L().kvCas(key, fn); }
async function resend(payload){
  const key = env('RESEND_API_KEY'); if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };
  if (mailOff()) return { ok: false, error: 'mail off' };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, error: 'Resend unreachable' }; }
}
function admins(data){
  const own = env('OWNER_EMAILS') || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com';
  const a = arr(data && data.users).filter(function(u){ return u.active !== false && /^admin$/i.test(s(u.role)) && okEmail(u.email); }).map(function(u){ return low(u.email); });
  return Array.from(new Set(a.concat(own.split(',').map(low).filter(okEmail))));
}
async function todoAdd(item){
  const id = s(item.id), at = nowIso();
  const it = Object.assign({ addedBy: 'GrayCo CRM', addedAt: at, updatedAt: at, done: false }, item);
  const has = function(l){ return l.some(function(t){ return t && s(t.id) === id; }); };
  try { const r = await core().kvListUpdate('gc_office_tasks', function(l){ return has(l) ? null : { list: l.concat([it]), check: has }; }); return !!(r && r.ok); } catch (e) { return false; }
}
/* tick to-dos off whose id passes test (only ones the CRM made, never a person's own) */
async function todoDone(test, why){
  const at = nowIso(); let n = 0;
  try {
    await core().kvListUpdate('gc_office_tasks', function(l){
      n = 0; l.forEach(function(t){ if (t && !t.done && test(s(t.id), t)) { t.done = true; t.doneAt = at; t.autoDone = true; t.doneNote = why || ''; t.updatedAt = at; n++; } });
      return n ? { list: l, check: function(l2){ return !l2.some(function(t){ return t && !t.done && test(s(t.id), t); }); } } : null;
    });
  } catch (e) {}
  return n;
}

/* ═══════════════════ 1. COI RENEWAL REQUESTS ═══════════════════ */
function coiExpOf(v){ return ymd(v.coiExp || v.insExp || v.insuranceExp || v.coiExpiration); }
function isSub(v){ return !!(v && (v.isSub === true || /^sub/i.test(s(v.cat)) || /subcontract/i.test(s(v.cat) + ' ' + s(v.type)))); }
function subName(v){ return s(v.company || v.name || v.contact) || 'your company'; }
/* the subs due an e-mail today: [{ subId, name, email, lang, exp, days, stage }] — one per sub (the latest stage) */
function coiDue(data, state, t){
  state = obj(state); const done = obj(state.done), out = [];
  arr(data.vendors).forEach(function(v){
    if (!isSub(v) || v.deleted === true || v.archived === true || v.active === false || v.inactive === true) return;
    const exp = coiExpOf(v); if (!exp) return;
    const email = low(v.email); if (!okEmail(email)) return;
    const days = daysUntil(exp, t);
    const st = COI_STAGES.filter(function(x){ return days <= x.max && days >= x.min; })[0];
    if (!st) return;
    if (days < -45) return;   /* long expired — the office already knows (pay check, Admin) */
    const key = s(v.id) + '|' + exp + '|' + st.k;
    if (done[key]) return;
    out.push({ subId: s(v.id), name: subName(v), email: email, lang: v.lang === 'es' ? 'es' : 'en', exp: exp, days: days, stage: st.k, key: key });
  });
  return out;
}
const COI_TXT = {
  en: { subj: function(x){ return x.days < 0 ? 'Your insurance certificate ran out — please send the new one' : x.days === 0 ? 'Your insurance certificate runs out today — please send the new one' : 'Your insurance certificate runs out in ' + x.days + ' day' + (x.days === 1 ? '' : 's') + ' — please send the new one'; },
    head: 'Please send your new insurance certificate',
    body: function(x){ return 'Hi ' + (x.name || 'there') + ', our records show your certificate of insurance (COI) ' + (x.days < 0 ? 'ran out on ' : 'runs out on ') + niceDay(x.exp) + '. To keep working with GrayCo and getting paid on time, please upload the renewed certificate in your GrayCo Portal: Papers → Insurance, with the new expiration date. Your agent can also e-mail it to us.'; },
    btn: 'Upload my new COI', foot: 'Questions? Call GrayCo at 901-585-0944.' },
  es: { subj: function(x){ return x.days < 0 ? 'Su certificado de seguro se venció — envíe el nuevo por favor' : x.days === 0 ? 'Su certificado de seguro se vence hoy — envíe el nuevo por favor' : 'Su certificado de seguro se vence en ' + x.days + ' día' + (x.days === 1 ? '' : 's') + ' — envíe el nuevo por favor'; },
    head: 'Por favor envíe su nuevo certificado de seguro',
    body: function(x){ return 'Hola ' + (x.name || '') + ', nuestros registros muestran que su certificado de seguro (COI) ' + (x.days < 0 ? 'se venció el ' : 'se vence el ') + niceDay(x.exp) + '. Para seguir trabajando con GrayCo y recibir sus pagos a tiempo, suba el certificado renovado en su Portal GrayCo: Papeles → Seguro, con la nueva fecha de vencimiento. Su agente también nos lo puede enviar por correo.'; },
    btn: 'Subir mi nuevo COI', foot: '¿Preguntas? Llame a GrayCo al 901-585-0944.' }
};
function coiMail(x){
  const T = COI_TXT[x.lang] || COI_TXT.en, link = portalBase() + '/';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E">' +
    '<div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center;font-size:18px;font-weight:bold">' + esc(T.head) + '</div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px">' +
    '<p style="font-size:15px;line-height:1.5">' + esc(T.body(x)) + '</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + esc(link) + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">' + esc(T.btn) + '</a></p>' +
    '<p style="font-size:13px;color:#55626F">' + esc(T.foot) + '</p></div></div>';
  return { subject: T.subj(x), html: html };
}
/* a COI already uploaded in the sub portal that the CRM has not filed yet → do not ask again */
async function pendingCoi(subIds){
  if (!subIds.length) return {};
  try {
    const r = await L().sb('gc_sub_event?select=sub_id,data,applied_at&kind=eq.paper&applied_at=is.null&sub_id=in.(' + subIds.map(function(x){ return '"' + String(x).replace(/"/g, '') + '"'; }).join(',') + ')');
    if (!r.ok) return {};
    const out = {}; (await r.json() || []).forEach(function(e){ if (e && e.data && e.data.paper === 'coi') out[s(e.sub_id)] = 1; });
    return out;
  } catch (e) { return {}; }
}
async function coiRun(t){
  if (env('COI_REQUESTS_OFF') === '1') return { off: true };
  const C = core();
  const data = await C.kvRead(['vendors', 'users']);
  const st = obj(await get(K.COI, {}));
  /* to-dos for a sub whose COI on file is newer than the one the to-do was about → ticked off */
  const cur = {}; arr(data.vendors).forEach(function(v){ if (isSub(v)) cur[s(v.id)] = coiExpOf(v); });
  const closed = await todoDone(function(id, x){ const m = /^COI_REQ_(.+)_(\d{4}-\d{2}-\d{2})$/.exec(id); return !!(m && cur[m[1]] && cur[m[1]] > m[2] && daysUntil(cur[m[1]], t) > 30); }, 'A newer certificate is on file.');
  const due = coiDue(data, st, t);
  const pend = await pendingCoi(due.map(function(x){ return x.subId; }));
  const out = { due: due.length, sent: 0, failed: 0, waitingFiling: 0, todos: 0, closed: closed };
  const doneKeys = {};
  for (const x of due) {
    if (pend[x.subId]) { out.waitingFiling++; continue; }
    const m = coiMail(x);
    let subj = m.subject; try { subj = require('./mailtag.js').tag(m.subject, [x.email], 'area:Subs'); } catch (e) {}
    const r = await resend({ from: 'GrayCo Portal <portal@grayco-cs.com>', reply_to: replyTo(), to: [x.email], subject: subj, html: m.html, headers: { 'X-GrayCo-CRM': 'coi-request' } });
    if (r.ok) { out.sent++; doneKeys[x.key] = { at: nowIso(), to: x.email }; } else { out.failed++; continue; }
    const label = '🛡 COI ' + (x.days < 0 ? 'expired' : 'expiring') + ': ' + x.name + ' — ' + x.exp;
    if (await todoAdd({ id: 'COI_REQ_' + x.subId + '_' + x.exp, kind: 'coi_request', label: label, prio: x.days <= 7 ? 'high' : 'normal',
      note: 'We e-mailed ' + x.name + ' (' + x.email + ') for the renewed certificate (' + (x.days < 0 ? 'expired ' + niceDay(x.exp) : 'runs out ' + niceDay(x.exp)) + '). They upload it in the sub portal; confirm the read COI in the CRM (📄 COI / W-9 to confirm). This ticks itself off once a newer COI is on file.' })) out.todos++;
  }
  if (Object.keys(doneKeys).length) await cas(K.COI, function(v){ const y = obj(v); y.done = Object.assign(obj(y.done), doneKeys); const cut = new Date(Date.now() - 400 * 864e5).toISOString(); Object.keys(y.done).forEach(function(k){ if (s(y.done[k].at) < cut) delete y.done[k]; }); y.last = nowIso(); return y; });
  return out;
}

/* ═══════════════════ 2. WARRANTY-ENDING CHECK-UPS ═══════════════════ */
function isDone(p){ return /complete|closed|done|paid/i.test(s(p.status)) || p.paidInFull === true || !!ymd(p.completionDate || p.completedAt); }
function warrantyEnd(p){ try { const w = core().warrantyOf(p, 9); return w && w.end ? w : null; } catch (e) { return null; } }
/* the customers due an offer today: [{ pid, email, name, first, pm, end, years, title, address }] */
function warrDue(data, state, t){
  state = obj(state); const done = obj(state.done);
  const dead = {}; (Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(function(x){ dead[s(x && typeof x === 'object' ? x.id : x)] = 1; });
  const seen = {}, out = [];
  arr(data.projects).forEach(function(p){
    if (!p.id || p.deleted === true || dead[s(p.id)] || !isDone(p)) return;
    if (/commercial|government|tenant|\bti\b|new construction/i.test(s(p.type)) || p.gcJob === true || p.hiredByGc === true) return;
    if (p.doNotContact || p.dnc || p.doNotEmail) return;
    const email = low(p.clientEmail || p.customerEmail || p.email); if (!okEmail(email) || seen[email]) return;
    const w = warrantyEnd(p); if (!w) return;
    const left = daysUntil(w.end, t); if (left < 0 || left > WARR_DAYS) return;
    if (done[s(p.id) + '|' + w.end]) return;
    seen[email] = 1;
    out.push({ pid: s(p.id), email: email, name: s(p.client || p.customer), first: firstName(p.client || p.customer), pm: s(p.pm), end: w.end, years: w.years, title: s(p.name), address: s(p.address) });
  });
  return out;
}
function warrMessage(){
  const subject = 'Your GrayCo warranty ends soon — a free check-up before it does';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.55">' +
    '<p>Hi {{FIRST_NAME}},</p>' +
    '<p>Your GrayCo workmanship warranty on <b>{{JOB}}</b> runs through <b>{{END}}</b>. Before it ends, we’d like to come out and give everything a <b>free check-up</b> — so if anything we did needs attention, it gets taken care of while you’re still covered.</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="{{CHECK_LINK}}" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">Yes — schedule my free check-up</a></p>' +
    '<p>{{MAINT_LINE}}</p>' +
    '<p>Questions? Just reply to this e-mail or call us at <b>(901) 585-0944</b>.</p>' +
    '<p>Thank you for choosing GrayCo,<br>The GrayCo team</p></div>';
  return { subject: subject, html: html };
}
function fillWarr(html, x, link){
  return s(html).split('{{FIRST_NAME}}').join(esc(x.first || 'there')).split('{{JOB}}').join(esc(x.title || 'your project')).split('{{END}}').join(esc(niceDay(x.end)))
    .split('{{CHECK_LINK}}').join(esc(link)).split('{{MAINT_LINE}}').join(esc(x.maintLine || ''));
}
async function warrRun(t){
  t = t || Date.now();
  if (env('WARRANTY_CHECK_OFF') === '1') return { off: true };
  const C = core(), M = require('./maint.js');
  const data = await C.kvRead(['projects', 'gc_deleted_projects', M.PLANS_KEY, M.LIST_KEY]);
  const st = obj(await get(K.WARR, {}));
  const list = warrDue(data, st, t);
  if (!list.length) return { due: 0 };
  const settings = M.settingsOf(data[M.PLANS_KEY]), contracts = arr(data[M.LIST_KEY]);
  list.forEach(function(x){ const p = C.findProject(data, x.pid) || {}; try { x.maintLine = M.offerLine(p, contracts, settings); } catch (e) { x.maintLine = ''; } });
  const day = todayCentral(t), msg = warrMessage(), id = 'appr_warrcheck_' + day;
  const ok = await C.queueApproval({ id: id, kind: 'warranty_check', title: '🛡 Warranty check-up offer: ' + list.length + ' customer' + (list.length === 1 ? '' : 's') + ' (warranty ends within 60 days, from news@)',
    pid: '', jobName: '', pm: null, to: list[0].email, channel: 'email', subject: msg.subject, html: msg.html,
    meta: { warr: 'offer', day: day, recipients: list.map(function(x){ return { pid: x.pid, email: x.email, first: x.first, name: x.name, pm: x.pm, end: x.end, title: x.title, maintLine: x.maintLine }; }),
      note: 'Goes to ' + list.length + ' customer' + (list.length === 1 ? '' : 's') + ', one e-mail each, from news@ with the unsubscribe link. {{FIRST_NAME}}, {{JOB}}, {{END}} and the button are filled in per person. A “yes” becomes a lead for their original PM. Not approved = nobody in this batch gets it, and they are not asked about again for this warranty.' } });
  if (!ok) return { due: list.length, queued: false };
  await cas(K.WARR, function(v){ const y = obj(v); y.done = obj(y.done); list.forEach(function(x){ y.done[x.pid + '|' + x.end] = { at: nowIso(), how: 'queued ' + id }; }); y.batches = arr(y.batches).concat([{ id: id, day: day, n: list.length, at: nowIso() }]).slice(-200); return y; });
  return { due: list.length, queued: id };
}
async function warrSend(item){
  const N = require('./news.js');
  const people = arr(item && item.meta && item.meta.recipients);
  if (!people.length) return { ok: false, error: 'Nobody in this batch.' };
  const st = obj(await get(K.WARR, {})), offers = obj(st.offers);
  let sent = 0, skipped = 0, failed = 0; const made = {};
  for (const x of people) {
    if (Object.keys(offers).some(function(k){ return offers[k].pid === x.pid && offers[k].end === x.end && offers[k].sent; })) { skipped++; continue; }
    const code = newToken(), link = crmBase() + '/.netlify/functions/cust-care?wcheck=' + code;
    const r = await N.sendNews({ to: x.email, subject: s(item.subject), html: fillWarr(item.html, x, link) });
    if (r.ok && !r.skipped) { sent++; made[code] = { pid: x.pid, email: x.email, name: x.name, pm: x.pm, end: x.end, title: x.title, at: nowIso(), sent: true }; }
    else if (r.ok) skipped++; else failed++;
  }
  if (Object.keys(made).length) await cas(K.WARR, function(v){ const y = obj(v); y.offers = Object.assign(obj(y.offers), made); return y; });
  if (failed && !sent) return { ok: false, error: 'The e-mails did not go out — approve it again to retry (nobody gets it twice).' };
  return { ok: true, sent: sent, skipped: skipped, failed: failed };
}
async function warrOffer(code){ if (!TOKEN_RE.test(s(code))) return null; const st = obj(await get(K.WARR, {})); return obj(st.offers)[code] || null; }
async function warrAccept(code, note){
  const o = await warrOffer(code); if (!o) return { ok: false, error: 'This link is not active — call GrayCo at (901) 585-0944.' };
  if (o.acceptedAt) return { ok: true, already: true, first: firstName(o.name) };
  const C = core(); let data = {}; try { data = await C.crmData(true); } catch (e) {}
  const p = C.findProject(data, o.pid) || {};
  let pm = null; try { pm = P().activePmFor(data.users, o.pm || p.pm, data.gc_senior_pm); } catch (e) {}
  if (pm && !okEmail(pm.email)) pm = pm.name ? pm : null;
  const at = nowIso(), id = L().itemId('warrcheck|' + code);
  const street = s(p.address || '').split(',')[0];
  const rec = { id: id, title: ('Warranty check-up — ' + (o.name || o.email) + (street ? ' — ' + street : '')).slice(0, 200), source: 'Warranty check-up offer', sourceKind: 'warranty', sourceRef: o.end,
    type: 'residential', address: s(p.address), city: '', state: '', zip: '', bidDue: '', scope: clip('Past customer accepted the free check-up before their GrayCo warranty ends (' + o.end + '). Job: ' + s(p.name || o.title) + (note ? '\nThey wrote: ' + s(note) : ''), 600),
    gc: '', owner: '', bidNumber: '', contact: { name: s(o.name), email: o.email, phone: s(p.clientPhone || p.customerPhone || p.phone) }, plansLinks: [], files: [], emails: [], emailIds: [],
    notes: ['Accepted the warranty check-up offer ' + at.slice(0, 16).replace('T', ' ') + ' UTC.', pm ? 'Assigned to ' + (pm.name || 'the PM') + (low(pm.name) === low(o.pm || p.pm) ? ' (the original PM).' : ' (the original PM is no longer here).') : 'No active PM for this customer — assign a PM.'],
    origin: 'website', websiteLead: true, pm: pm ? s(pm.name) : '', assignedBy: pm ? 'Warranty check-up (original PM)' : '', assignedAt: pm ? at : '',
    leadExtra: { websiteLead: true, warrantyCheck: true, warrantyEnd: o.end, existingCustomer: true, customerPid: s(o.pid), leadSource: 'Warranty check-up offer', owner: 'GrayCo', grayCoLead: true, contactName: s(o.name), receivedAt: at, unassigned: !pm, pm: pm ? s(pm.name) : '' },
    needsReview: false, dueUnknown: false };
  let action = '';
  await L().kvCas(L().KV, function(v){ const r = L().upsert(arr(v), rec); action = r.action; return r.items; });
  await cas(K.WARR, function(v){ const y = obj(v); y.offers = obj(y.offers); if (!y.offers[code]) return undefined; y.offers[code].acceptedAt = at; y.offers[code].leadId = id; return y; });
  if (action === 'added') {
    try { await L().alertsApi().notifyNew([Object.assign({}, rec, { pmEmail: pm ? low(pm.email) : '', detail: ['Warranty check-up — past customer', rec.contact.phone, rec.contact.email].filter(Boolean).join(' · ') })], { source: 'Warranty check-up offer' }); } catch (e) {}
  }
  return { ok: true, first: firstName(o.name) };
}
async function warrStats(t){
  const C = core();
  const st = obj(await get(K.WARR, {})), offers = obj(st.offers);
  let upcoming = 0; try { const data = await C.kvRead(['projects', 'gc_deleted_projects']); upcoming = warrDue(data, { done: {} }, t).length; } catch (e) {}
  const codes = Object.keys(offers), year = new Date(t || Date.now()).getFullYear();
  return { ok: true, sent: codes.length, accepted: codes.filter(function(k){ return offers[k].acceptedAt; }).length,
    sentYear: codes.filter(function(k){ return s(offers[k].at).slice(0, 4) === String(year); }).length,
    batches: arr(st.batches).slice(-12).reverse(), upcoming: upcoming,
    recent: codes.map(function(k){ const o = offers[k]; return { name: o.name, title: o.title, end: o.end, sentAt: o.at, acceptedAt: o.acceptedAt || '' }; }).sort(function(a, b){ return s(a.sentAt) < s(b.sentAt) ? 1 : -1; }).slice(0, 30) };
}

/* ═══════════════════ 3. "WE NEED FROM YOU" ═══════════════════ */
async function needsAll(){ return arr(await get(K.NEEDS, [])); }
async function needsSet(fn){ return cas(K.NEEDS, function(v){ const l = arr(v).slice(); const n = fn(l); return n === undefined ? undefined : n; }); }
function needOut(x, forCustomer){
  const o = { id: s(x.id), kind: s(x.kind), label: s(x.label) || NEED_KINDS[x.kind] || 'Item', note: s(x.note), status: s(x.status) || 'open',
    answeredAt: s(x.answeredAt), files: arr(x.files).length, createdAt: s(x.createdAt) };
  if (x.kind === 'codes') o.answer = x.status === 'done' ? 'Saved — thank you' : '';
  else o.answer = clip(x.answer, forCustomer ? 400 : 2000);
  if (!forCustomer) { o.createdBy = s(x.createdBy); o.refs = arr(x.files).map(function(f){ return { ref: s(f.ref), name: s(f.name), type: s(f.type) }; }); o.history = arr(x.history).slice(-10); o.pid = s(x.pid); }
  return o;
}
async function needsFor(pid, forCustomer){ return (await needsAll()).filter(function(x){ return s(x.pid) === s(pid) && x.status !== 'cancelled'; }).sort(function(a, b){ return s(a.createdAt) < s(b.createdAt) ? -1 : 1; }).map(function(x){ return needOut(x, forCustomer); }); }
async function needsRequest(pid, items, by){
  const at = nowIso(), add = [];
  const cur = await needsAll();
  arr(items).slice(0, 12).forEach(function(it){
    const kind = NEED_KINDS[s(it.kind)] ? s(it.kind) : 'other';
    const label = clip(it.label, 120) || NEED_KINDS[kind];
    if (cur.concat(add).some(function(x){ return s(x.pid) === s(pid) && x.status === 'open' && x.kind === kind && low(x.label) === low(label); })) return;
    add.push({ id: 'CN-' + crypto.randomBytes(6).toString('hex'), pid: s(pid), kind: kind, label: label, note: clip(it.note, 400), status: 'open', createdAt: at, createdBy: clip(by, 80), files: [], history: [{ at: at, by: clip(by, 80), what: 'requested' }] });
  });
  if (!add.length) return { ok: true, added: 0 };
  const r = await needsSet(function(l){ return l.concat(add).slice(-6000); });
  return { ok: !!(r && r.ok !== false), added: add.length, items: add.map(function(x){ return needOut(x, false); }) };
}
async function needsUpdate(id, patch, by){
  const at = nowIso(); let out = null;
  await needsSet(function(l){ const x = l.find(function(y){ return s(y.id) === s(id); }); if (!x) return undefined;
    if (patch.cancel === true) { x.status = 'cancelled'; x.history = arr(x.history).concat([{ at: at, by: by, what: 'cancelled' }]); }
    else if (patch.reopen === true) { x.status = 'open'; x.history = arr(x.history).concat([{ at: at, by: by, what: 'asked again' }]); }
    else if (patch.done === true) { x.status = 'done'; x.answeredAt = x.answeredAt || at; x.history = arr(x.history).concat([{ at: at, by: by, what: 'marked received' }]); }
    else return undefined;
    x.updatedAt = at; out = x; return l; });
  return out ? { ok: true, item: needOut(out, false) } : { ok: false, error: 'Not found.' };
}
/* the customer's answer: text and / or files (already stored; refs) */
async function needsAnswer(pid, id, text, files, who){
  const at = nowIso(); let out = null, why = '';
  const r = await needsSet(function(l){
    const x = l.find(function(y){ return s(y.id) === s(id) && s(y.pid) === s(pid); });
    if (!x) { why = 'missing'; return undefined; }
    if (x.status === 'cancelled') { why = 'cancelled'; return undefined; }
    if (x.kind === 'codes') x.answer = '(saved to 🔐 Access codes)';
    else if (text) x.answer = clip(text, 2000);
    x.files = arr(x.files).concat(arr(files)).slice(-12);
    x.status = 'done'; x.answeredAt = at; x.updatedAt = at;
    x.history = arr(x.history).concat([{ at: at, by: who || 'customer (portal)', what: 'answered' + (files && files.length ? ' (' + files.length + ' file' + (files.length === 1 ? '' : 's') + ')' : '') }]).slice(-30);
    out = x; return l;
  });
  if (!out) return { ok: false, error: why === 'cancelled' ? 'This item is no longer needed.' : 'Not found.' };
  return { ok: true, item: needOut(out, true), raw: out };
}
/* a door / gate code → the job's 🔐 Access codes vault (patch X10), never kept or shown anywhere else */
async function codeToVault(pid, label, code){
  const at = nowIso(), id = 'AC-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await cas('gc_x10_codes', function(v){ const l = arr(v).slice(); let r = l.find(function(x){ return s(x.pid) === s(pid); }); if (!r) { r = { pid: s(pid), codes: [], log: [] }; l.push(r); }
    r.codes = arr(r.codes).concat([{ id: id, label: clip(label, 60) || 'From the customer', code: clip(code, 60), addedBy: 'Customer (portal)', at: at }]).slice(-12);
    r.log = arr(r.log).concat([{ at: at, by: 'Customer (portal)', what: 'added ' + (clip(label, 60) || 'a code') }]).slice(-200); return l; });
  return id;
}
async function needsNotifyPm(p, item, pmU, remaining){
  const to = pmU && okEmail(pmU.email) ? [low(pmU.email)] : (env('OWNER_EMAILS') || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(okEmail);
  if (!to.length) return false;
  let subj = '📎 ' + s(p.client || p.customer || 'The customer') + ' sent: ' + s(item.label);
  try { subj = core().withJob(subj, p); } catch (e) {}
  try { subj = require('./mailtag.js').tag(subj, to, 'area:Portal'); } catch (e) {}
  const html = '<div style="font:14px Arial;color:#1b1640;max-width:600px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700">GrayCo — the customer answered a request</div><div style="padding:8px 18px">' +
    '<p><b>' + esc(p.name) + '</b>' + (p.address ? ' · ' + esc(p.address) : '') + '</p><p><b>' + esc(item.label) + '</b>: ' + (item.kind === 'codes' ? 'a code was added to the job’s 🔐 Access codes.' : esc(clip(item.answer, 600)) + (arr(item.files).length ? ' · ' + arr(item.files).length + ' file(s)' : '')) + '</p>' +
    '<p>' + (remaining ? remaining + ' item' + (remaining === 1 ? '' : 's') + ' still open.' : 'Everything you asked for is in.') + ' Open the job → 📎 Requested from customer.</p>' +
    '<p><a href="' + esc(crmBase()) + '/" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open the CRM</a></p></div></div>';
  const r = await resend({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: to, subject: subj, html: html, headers: { 'X-GrayCo-CRM': 'customer-needs' } });
  return !!r.ok;
}
function needsMail(p, open){
  const first = firstName(p.client || p.customer);
  const subject = 'A quick reminder: we still need a few things from you';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.55">' +
    '<p>Hi ' + esc(first || 'there') + ',</p><p>To keep your project moving, we still need:</p><ul>' + open.map(function(x){ return '<li><b>' + esc(x.label) + '</b>' + (x.note ? ' — ' + esc(x.note) : '') + '</li>'; }).join('') + '</ul>' +
    '<p>You can send them in your GrayCo portal under <b>“We need from you”</b> — upload a photo or a file, or type the answer.</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="{{PORTAL_LINK}}" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">Open my project page</a></p>' +
    '<p>Questions? Reply to this e-mail or call your Project Manager. Thank you!</p></div>';
  return { subject: subject, html: html };
}
/* the daily run: day 3 → a reminder on ✅ Approvals (the PM); day 7 → the same again by itself when the first was
   approved, and a PM To-Do for anything still open */
async function needsRun(t){
  t = t || Date.now();
  if (env('CUST_NEEDS_REMIND_OFF') === '1') return { off: true };
  const C = core();
  const items = (await needsAll()).filter(function(x){ return x.status === 'open'; });
  const byPid = {}; items.forEach(function(x){ (byPid[s(x.pid)] = byPid[s(x.pid)] || []).push(x); });
  const st = obj(await get(K.NST, {})), rem = obj(st.remind);
  const out = { jobs: Object.keys(byPid).length, queued: 0, sent: 0, todos: 0, closed: 0 };
  /* to-dos for jobs with nothing open any more → ticked off */
  out.closed = await todoDone(function(id){ const m = /^CNEEDS_(.+)$/.exec(id); return !!(m && !byPid[m[1]]); }, 'Everything requested came in.');
  if (!items.length) return out;
  let data = {}; try { data = await C.crmData(false); } catch (e) { return Object.assign(out, { error: 'no data' }); }
  const changes = {};
  for (const pid of Object.keys(byPid)) {
    const p = C.findProject(data, pid); if (!p || p.deleted === true) continue;
    const open = byPid[pid], oldest = open.map(function(x){ return s(x.createdAt); }).sort()[0];
    const ageD = (t - Date.parse(oldest)) / 864e5;
    const email = low(p.clientEmail || p.customerEmail || p.email);
    const pmU = C.pmOf(data, p);
    const r0 = Object.assign({}, obj(rem[pid])), batch = oldest;
    if (r0.batch !== batch) { r0.batch = batch; delete r0.s1; delete r0.s2; delete r0.approved; delete r0.todo; }
    const m = needsMail(p, open.map(function(x){ return { label: s(x.label) || NEED_KINDS[x.kind], note: s(x.note) }; }));
    if (ageD >= 3 && !r0.s1 && okEmail(email)) {
      const ok = await C.queueApproval({ id: 'appr_cneeds_' + pid + '_' + batch.slice(0, 10), kind: 'cneeds_remind', title: '📎 Reminder to ' + (s(p.client) || email) + ': ' + open.length + ' item' + (open.length === 1 ? '' : 's') + ' we still need',
        pid: pid, jobName: s(p.name), pm: pmU, to: email, channel: 'email', subject: m.subject, html: m.html, meta: { cneeds: true, pid: pid, batch: batch, note: 'The first reminder for the “We need from you” items. Approve it once: the day-7 reminder then goes by itself (same text, the items still open).' } });
      if (ok) { r0.s1 = nowIso(); out.queued++; }
    }
    if (ageD >= 7 && r0.approved && !r0.s2 && okEmail(email)) {
      let html = m.html;
      try { const tok = await C.createFor(pid, 'needs reminder'); html = html.split('{{PORTAL_LINK}}').join(esc(C.linkFor(null, tok))); } catch (e) { html = html.split('{{PORTAL_LINK}}').join(esc(portalBase() + '/')); }
      try { html = await require('./brand.js').shellFor(html, { email: pmU && pmU.email, name: pmU && pmU.name }); } catch (e) {}
      let subj = m.subject; try { subj = C.withJob(subj, p); } catch (e) {}
      const rr = await resend({ from: 'GrayCo Construction Services Portal <portal@grayco-cs.com>', reply_to: C.replyToFor ? C.replyToFor(pmU && pmU.email, 'portal') : replyTo(), to: [email], subject: subj, html: html, headers: { 'X-GrayCo-CRM': 'customer-needs-reminder' } });
      if (rr.ok) { r0.s2 = nowIso(); out.sent++; }
    }
    if (ageD >= 7 && !r0.todo) {
      const ok = await todoAdd({ id: 'CNEEDS_' + pid, kind: 'cust_needs', pid: pid, assignees: pmU && pmU.name ? [pmU.name] : [], prio: 'normal',
        label: '📎 Still waiting on ' + (s(p.client) || 'the customer') + ': ' + open.length + ' item' + (open.length === 1 ? '' : 's') + ' — ' + clip(p.name, 60),
        note: open.map(function(x){ return '• ' + (s(x.label) || NEED_KINDS[x.kind]); }).join('\n') + '\nAsked ' + Math.floor(ageD) + ' days ago in the customer portal (“We need from you”). Give them a call; this ticks itself off when everything is in.' });
      if (ok) { r0.todo = nowIso(); out.todos++; }
    }
    changes[pid] = r0;
  }
  if (Object.keys(changes).length) await cas(K.NST, function(v){ const y = obj(v); y.remind = Object.assign(obj(y.remind), changes); return y; });
  return out;
}
/* portal.js aqSend → the reminder was approved (it is then sent by the normal approval path) */
async function needsApproved(item){
  const pid = s(item && item.meta && item.meta.pid); if (!pid) return;
  await cas(K.NST, function(v){ const y = obj(v); y.remind = obj(y.remind); const r = Object.assign({}, obj(y.remind[pid])); r.approved = nowIso(); y.remind[pid] = r; return y; });
}

/* portal.js aqSend → our approval kinds */
async function onApproved(item){
  if (item && item.kind === 'warranty_check') return warrSend(item);
  return { ok: false, error: 'Unknown item.' };
}

module.exports = { K, NEED_KINDS, COI_STAGES, WARR_DAYS, TOKEN_RE, setCore, coiDue, coiMail, coiRun, coiExpOf, warrDue, warrMessage, fillWarr, warrRun, warrSend, warrOffer, warrAccept, warrStats,
  needsAll, needsFor, needsRequest, needsUpdate, needsAnswer, codeToVault, needsNotifyPm, needsMail, needsRun, needsApproved, needOut, onApproved, daysUntil, todayCentral };
