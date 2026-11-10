/* ============================================================================
   GrayCo — 📱 TEXT ALERTS TO STAFF CELL PHONES (patch SMSALERT).   netlify/functions/_lib/smsalert.js

   Owner 10/28: "is there a way for our cell phones to get grayco texts also, if so add that in something i can turn
   on for each person for each type of leads admin etc".

   Admin → ⚙ Admin settings → 📱 Text alerts to cell phones: one row per staff person (their cell, editable), a master
   on/off, quiet hours (default 9 PM–7 AM Central; emergencies ignore them) and one switch per alert type:
     cust      Customer texts to the GrayCo number — 'off' | 'mine' (their own jobs / texts routed to them) | 'all'
     newAll    New leads (all)          newMine   New leads assigned to me      emerg   Emergency leads (water / fire / storm)
     missed    Missed calls (screened callers)       subs      Sub texts
     approvals Approvals waiting for me (one daily summary at most)
     system    Admin / system alerts (backup / health failures) — admins only (checked again at send time)
   Settings: service-only gc_lead_inbox_kv "gc_sms_alerts" (written by texts.js ?alerts=1, admins only).
   State:    gc_lead_inbox_kv "gc_sms_alerts_state" (rate limit, burst counts, the last alert per staff phone, held alerts).

   Sending (from TWILIO_FROM_ALERTS, else TWILIO_FROM — about 1¢ a text):
     · never while data-entry mode is on (_lib/pause), never to a phone that texted STOP (the gc_sms_state opt-out list);
     · quiet hours: nothing (an emergency still goes; a system alert is held until the next morning run);
       owner 10/28 "SMSALERT: quiet hours follow business hours": quiet = outside the 📞 Call order business hours
       (_lib/callorder.js isOpen — default Mon–Fri 7 AM–6 PM Central, weekends / holidays closed) OR inside the
       person's own window (default 9 PM–7 AM; the only rule when the call order can't be read). Held lead / text /
       missed-call alerts are not sent later (the e-mail covers them); only emergencies text after hours;
     · at most 1 text per person per minute per thread — the rest are counted and the next text says "+3 more";
     · ≤ 300 characters: "GrayCo: …" + a deep link. Only a name / short job name + the message excerpt — nothing else.
   Replying from the cell: a staff phone in this table that texts the GrayCo number within 30 minutes of an alert that
   has a reply-to (a customer / sub text, a missed call, a lead that texted or called) → the text goes to that person
   from the GrayCo number, signed with the employee's first name, and is posted on Job Messages as from that employee.
   A staff phone in this table NEVER becomes a lead (missed-call.js asks staffInbound() first).
   ========================================================================== */
'use strict';
const KEY = 'gc_sms_alerts';
const SKEY = 'gc_sms_alerts_state';
const RATE_MS = 60 * 1000;
const REPLY_MS = 30 * 60 * 1000;
const MAX = 300;
const TYPES = [
  { id: 'cust', label: 'Customer texts', choice: true },
  { id: 'newAll', label: 'New leads (all)' },
  { id: 'newMine', label: 'New leads assigned to me' },
  { id: 'emerg', label: 'Emergency leads (water / fire / storm)' },
  { id: 'missed', label: 'Missed calls (screened callers)' },
  { id: 'subs', label: 'Sub texts' },
  { id: 'approvals', label: 'Approvals waiting for me (daily summary)' },
  { id: 'system', label: 'Admin / system alerts (admins only)', adminOnly: true }
];
const BOOL_TYPES = TYPES.filter(t => !t.choice).map(t => t.id);
const START = /^\s*(start|unstop)\s*[.!]*\s*$/i;
/* owner 10/28 defaults (used until an admin saves the card): Nick + Wesley get emergencies + every new lead (a customer text
   that makes a lead is a new lead); the mitigation manager role (whoever holds it — none yet → skipped) gets emergencies.
   Phones come from their CRM people records. Everyone else off. */
const ROLE_MIT = 'role:mitigation';
const DEFAULT_PEOPLE = {
  'nthomas@grayco-cs.com': { on: true, name: 'Nick Thomas', emerg: true, newAll: true },
  'wjohnson@grayco-cs.com': { on: true, name: 'Wesley Johnson', emerg: true, newAll: true }
};
DEFAULT_PEOPLE[ROLE_MIT] = { on: true, name: 'Mitigation manager', emerg: true, qOff: true };

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function clip(v, n){ v = s(v).replace(/\s+/g, ' '); return v.length > n ? v.slice(0, Math.max(0, n - 1)) + '…' : v; }
function env(k){ return s(process.env[k]); }
function staffEmail(e){ return /^[a-z0-9._%+-]+@(in\.)?grayco-cs\.com$/.test(low(e)); }
function site(){ return (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function hourOf(v, d){ const n = parseInt(v, 10); return isFinite(n) && n >= 0 && n <= 23 ? n : d; }

/* ── dependencies (tests swap these) ── */
function L(){ return require('../bid-inbox.js')._lib; }
function MC(){ return require('../missed-call.js')._test; }
function core(){ return require('../portal.js')._core; }
const _D = {
  now: () => Date.now(),
  kvGet: k => L().kvGet(k),
  kvCas: (k, f) => L().kvCas(k, f),
  send: (to10, body, from, tag) => require('./custquiet.js').run(tag || 'staff', () => MC().sendSms(to10, body, from)),   /* patch CUSTQUIET: alerts go to staff cells (not held); a reply relayed to a customer is tagged by the caller */
  /* the saved 📞 Call order business hours (defaults when never saved); null when it can't be read → per-person window only */
  hours: async () => { try { const CO = require('./callorder.js'); const raw = await _D.kvGet(CO.KEY); return (raw && typeof raw === 'object' ? CO.clean(raw) : CO.defaults()).hours || null; } catch (e) { return null; } },
  paused: async () => { try { return await require('./pause').isPaused(); } catch (e) { return true; } },
  optouts: async () => { try { const st = await MC().stateGet(); return st && st.optout && typeof st.optout === 'object' ? st.optout : {}; } catch (e) { return {}; } },
  consentNo: async ph => { try { return (await require('./smsconsent.js').live(ph)) === 'no'; } catch (e) { return false; } },
  people: async () => {   /* the CRM's people list + gc_staff (role) */
    let users = [], staff = [];
    try { users = arr((await core().kvRead(['users'])).users); } catch (e) {}
    try { const r = await L().sb('gc_staff?select=email,name,role,active'); if (r && r.ok) staff = arr(await r.json()); } catch (e) {}
    return { users, staff };
  },
  /* the reply from a cell → Job Messages (as from the employee) + the 💬 timeline + "their reply comes back to this employee" */
  /* patch EMERGCALL (claude/callchain): a reply to an emergency alert text acknowledges it — no escalation calls (optional module) */
  ack: async (leadId, why) => { let EC = null; try { EC = require('./emergcall.js'); } catch (e) { return { skipped: 'no emergcall' }; }
    if (!EC || typeof EC.make !== 'function') return { skipped: 'no emergcall' };
    return EC.make({ env: k => s(process.env[k]), now: () => _D.now(), kvGet: k => _D.kvGet(k), kvCas: (k, f) => _D.kvCas(k, f) }).ack(leadId, why); },
  /* LSATEXT: GOOD / BAD texted back → the lead inbox item, gc_kv "gc_lsa_decisions" (the CRM page marks its lead), the office To-Do */
  lsaDecide: async d => {
    const at = new Date(_D.now()).toISOString(), out = { inbox: false, list: false, todo: false };
    try { await _D.kvCas('gc_lead_inbox', v => { const l = arr(v); const x = l.find(y => y && s(y.id) === s(d.leadId)); if (!x) return undefined;
      if (s(d.notes)) { const dt = new Date(_D.now()), line = '[' + (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + s(d.by) + '] ' + s(d.notes);   /* LSANOTES — owner 11/10: just the note (no "good lead" words) */
        if (Array.isArray(x.notes)) x.notes = x.notes.concat([line]); else x.notes = (s(x.notes) ? s(x.notes) + '\n' : '') + line; }
      x.lsaCheck = d.noAnswer ? 'no_answer' : d.good ? 'good' : 'bad'; x.leadExtra = Object.assign({}, obj(x.leadExtra), { lsaCheck: x.lsaCheck }); x.lsaDecidedBy = d.by; x.lsaDecidedAt = at; x.lsaVia = 'text';
      if (d.noAnswer) { x.noAnswerAt = at; x.noAnswerCount = (+x.noAnswerCount || 0) + 1; }
      else if (!d.good) { x.lsaReason = d.reason; x.lostReason = 'LSA — not a real lead (' + d.reason + ')'; }
      if (d.good && d.pm && d.pm.name) {   /* LSAPM: the PM texted with GOOD */
        x.pm = d.pm.name; x.pmEmail = low(d.pm.email); x.assignedBy = s(d.by) + ' (text)'; x.assignedAt = at; x.assignConfirmed = true; x.leadRole = x.leadRole || 'insurance';
        if (x.hold) x.hold = Object.assign({}, x.hold, { state: 'approved', name: d.pm.name, email: low(d.pm.email), doneAt: at, doneBy: s(d.by) + ' (text)' });
        if (x.status === 'new') x.status = 'imported';
        x.rev = (x.rev || 1) + 1; x.updatedAt = at; out.assigned = Object.assign({}, x);
      }
      out.inbox = true; return l; }); } catch (e) {}
    if (out.assigned) { try { out.notified = await L().alertsApi().notifyAssigned(Object.assign({}, out.assigned, { id: s(out.assigned.leadId) || ('LEADIN-' + s(out.assigned.id).replace(/^LI-/, '')) }), { by: s(d.byEmail) }); } catch (e) { out.notified = { error: s(e && e.message) }; } out.assigned = true; }
    try { const C = core(), row = { id: s(d.leadId), notes: s(d.notes).slice(0, 600), noAnswer: !!d.noAnswer, good: !!d.good, reason: s(d.reason), by: s(d.by), byEmail: s(d.byEmail), at, code: s(d.code), name: s(d.name), phone: s(d.phone), pm: d.pm ? s(d.pm.name) : '', pmEmail: d.pm ? low(d.pm.email) : '' };
      const has = l => l.some(x => x && s(x.id) === row.id && x.at === at);
      const w = await C.kvListUpdate('gc_lsa_decisions', l => ({ list: l.filter(x => x && s(x.id) !== row.id).concat([row]).slice(-500), check: has })); out.list = !!(w && w.ok); } catch (e) {}
    if (d.noAnswer) { try { out.todo = await core().officeTodo('LSACALLBACK_' + s(d.leadId) + '_' + at.slice(0, 10), '📞 Call back ' + clip(d.name || tidy(d.phone), 40) + (d.phone ? ' ' + tidy(d.phone) : '') + ' (Google LSA — no answer)',
      s(d.by) + ' texted NO ANSWER' + (d.reason ? ' (' + s(d.reason) + ')' : '') + '. Not a bad lead — call again, then mark it 👍 / 👎 on the lead (or text GOOD / BAD ' + s(d.code) + ').'); } catch (e) {} return out; }
    if (!d.good) { try { const by = new Date(_D.now() + 30 * 864e5), byS = (by.getMonth() + 1) + '/' + by.getDate() + '/' + by.getFullYear();
      out.todo = await core().officeTodo('LSADISPUTE_' + s(d.leadId), '⚖️ Dispute ' + clip(d.name || tidy(d.phone), 40) + ' (Google LSA) in Google Ads by ' + byS,
        s(d.by) + ' texted BAD: ' + s(d.reason) + '. Open ' + (s(d.link) || 'https://ads.google.com/localservices/leads') + ' → find ' + (d.phone ? tidy(d.phone) : d.name) + ' → Dispute lead (pick the reason). Office or marketing can do it.'); } catch (e) {} }
    return out;
  },
  lsaVerified: async leadId => { let ok = false; try { await _D.kvCas('gc_lead_inbox', v => { const l = arr(v); const x = l.find(y => y && s(y.id) === s(leadId)); if (!x) return undefined; x.lsaVerified = new Date(_D.now()).toISOString(); x.leadExtra = Object.assign({}, obj(x.leadExtra), { lsaVerified: x.lsaVerified }); ok = true; return l; }); } catch (e) {} return ok; },   /* LSAFLOW */
  postReply: async m => {
    const msg = { id: m.id, pid: m.pid || '', authorId: low(m.email), authorName: s(m.name || m.email) + ' 📱 (text to ' + tidy(m.to) + ', from cell)', text: m.text, tags: [], at: m.at, source: 'sms', channel: 'sms', dir: 'out', smsTo: m.to, viaCell: true };
    const has = l => l.some(x => x && s(x.id) === msg.id);
    try { await core().kvListUpdate('gc_job_messages', l => has(l) ? null : { list: l.concat([msg]), check: has }); } catch (e) {}
    if (m.pid) { try { await require('./comms.js').addMessage(m.pid, { id: 'sms_' + m.id, kind: 'text', dir: 'out', at: m.at, from: low(m.email), fromName: s(m.name), to: [tidy(m.to)], text: m.text }); } catch (e) {} }
    try { await require('./textlead.js').onOutbound({ ph: m.to, text: m.text, who: s(m.name) + ' (from cell)', id: m.id }); } catch (e) {}   /* patch TEXTLEAD */
    try { await MC().stateCas(x => { x.lastOut = x.lastOut && typeof x.lastOut === 'object' ? x.lastOut : {}; x.lastOut[m.to] = { email: low(m.email), name: s(m.name), pid: m.pid || '', at: m.at }; return true; }); } catch (e) {}
    return msg;
  }
};
function now(){ return _D.now(); }

/* ── settings ── */
function cleanPerson(p){
  p = obj(p);
  const out = { on: !!p.on, name: clip(p.name, 60), phone: phone10(p.phone).length === 10 ? phone10(p.phone) : '',
    cust: /^(off|mine|all)$/.test(s(p.cust)) ? s(p.cust) : 'off',
    qOff: !!p.qOff, qFrom: hourOf(p.qFrom, 21), qTo: hourOf(p.qTo, 7) };
  BOOL_TYPES.forEach(t => { out[t] = !!p[t]; });
  return out;
}
function settings(v){
  const o = obj(v), out = { people: {} };
  const saved = !!(s(o.at) || Object.keys(obj(o.people)).length);
  const ppl = saved ? obj(o.people) : DEFAULT_PEOPLE;
  if (!saved) out.defaults = true;
  Object.keys(ppl).slice(0, 200).forEach(e => { if (staffEmail(e) || e === ROLE_MIT) out.people[low(e)] = cleanPerson(ppl[e]); });
  if (s(o.by)) out.by = low(o.by).slice(0, 120);
  if (s(o.at)) out.at = s(o.at).slice(0, 40);
  return out;
}
/* staff people (active, @grayco-cs.com) with their phone and whether they are an admin */
function isActiveUser(u){ try { return require('./people.js').isActive(u); } catch (e) { return u.active !== false && !u.departed; } }
function ownerEmails(){ return (env('OWNER_EMAILS') || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(Boolean); }
function staffList(pp){
  pp = pp || {};
  const by = {}, owners = ownerEmails();
  arr(pp.users).forEach(u => {
    const e = low(u.email); if (!staffEmail(e) || !isActiveUser(u)) return;
    by[e] = { email: e, name: s(u.name) || e, phone: phone10(u.cell || u.mobile || u.phone || u.cellPhone), admin: /^admin$/i.test(s(u.role)) || low(u.payType) === 'owner' };
  });
  arr(pp.staff).forEach(r => {
    const e = low(r.email); if (!staffEmail(e)) return;
    if (r.active === false) { delete by[e]; return; }
    const x = by[e] || (by[e] = { email: e, name: s(r.name) || e, phone: '', admin: false });
    if (low(r.role) === 'admin') x.admin = true;
  });
  owners.forEach(e => { if (by[e]) by[e].admin = true; });
  Object.keys(by).forEach(e => { if (by[e].phone.length !== 10) by[e].phone = ''; });
  return Object.keys(by).map(e => by[e]).sort((a, b) => a.name.localeCompare(b.name));
}
async function load(){ try { return settings(await _D.kvGet(KEY)); } catch (e) { return settings(null); } }
/* the mitigation manager(s) — whoever holds the role (title / role / profile says mitigation + manager); none → [] */
function mitigationHolders(pp){
  let ems = []; try { ems = require('./emergency.js').mitigationMgrs(arr((pp || {}).users)); } catch (e) {}
  const list = staffList(pp), by = {}; list.forEach(x => { by[x.email] = x; });
  return ems.map(low).filter((e, i, l) => l.indexOf(e) === i && by[e]).map(e => by[e]);
}
/* everyone who can get a text now: [{ key, email, phone, p }] — a person's own cell from the card, else from their CRM record;
   the mitigation-manager row → its holder(s) (merged with their own row: either one's switches count) */
function resolve(set, pp){
  const list = staffList(pp), by = {}, out = {};
  list.forEach(x => { by[x.email] = x; });
  Object.keys(set.people).forEach(k => {
    if (k === ROLE_MIT) return;
    const p = set.people[k], x = by[k]; if (!x) return;
    const phone = p.phone || x.phone; if (!p.on || phone.length !== 10) return;
    out[k] = { key: k, email: k, phone, p };
  });
  const rp = set.people[ROLE_MIT];
  if (rp && rp.on) mitigationHolders(pp).forEach(x => {
    const phone = rp.phone || x.phone; if (phone.length !== 10) return;
    if (out[x.email]) { const m = Object.assign({}, out[x.email].p); BOOL_TYPES.forEach(t2 => { m[t2] = m[t2] || rp[t2]; }); out[x.email].p = m; }
    else out[x.email] = { key: ROLE_MIT, email: x.email, phone, p: rp };
  });
  return Object.keys(out).map(k => out[k]);
}
/* admins only (texts.js checks who): cleaned, an admin-only switch kept only for admins */
async function save(v, by){
  const pp = await _D.people(), list = staffList(pp), admin = {}, known = {};
  list.forEach(x => { known[x.email] = 1; if (x.admin) admin[x.email] = 1; });
  const set = settings(v);
  Object.keys(set.people).forEach(e => {
    if (e === ROLE_MIT) { const r = set.people[e]; BOOL_TYPES.forEach(t2 => { if (t2 !== 'emerg') r[t2] = false; }); r.cust = 'off'; return; }   /* the role row: emergencies only */
    if (!known[e]) { delete set.people[e]; return; } if (!admin[e]) set.people[e].system = false; });
  delete set.defaults;
  set.by = low(by); set.at = new Date(now()).toISOString();
  await _D.kvCas(KEY, () => set);
  return set;
}

/* ── quiet hours (Central) ── */
function centralHour(ms){
  try { return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date(ms)), 10) % 24; }
  catch (e) { return new Date(ms - 6 * 3600e3).getUTCHours(); }
}
function centralDay(ms){ try { return new Date(ms).toLocaleString('en-CA', { timeZone: 'America/Chicago' }).slice(0, 10); } catch (e) { return new Date(ms - 6 * 3600e3).toISOString().slice(0, 10); } }
function inQuiet(p, ms){
  if (p.qOff || p.qFrom === p.qTo) return false;
  const h = centralHour(ms);
  return p.qFrom > p.qTo ? (h >= p.qFrom || h < p.qTo) : (h >= p.qFrom && h < p.qTo);
}
/* quiet right now for this person: outside business hours (hours = the call order's, null → unknown) or in their own window */
function quietNow(p, ms, hours){
  if (hours) { try { if (!require('./callorder.js').isOpen(ms, { hours })) return true; } catch (e) {} }   /* after hours: always (owner rule) */
  return !p.qOff && inQuiet(p, ms);   /* + the person's own window (switchable) */
}

/* who wants this alert. o = { type, mine: [emails], emergency } */
function wants(p, email, o, isAdmin){
  const mine = (o.mine || []).map(low).indexOf(email) >= 0;
  switch (o.type) {
    case 'cust': return p.cust === 'all' || (p.cust === 'mine' && mine) || (!!o.emergency && p.emerg);
    case 'subs': return p.subs || (!!o.emergency && p.emerg);
    case 'lead': return p.newAll || (p.newMine && mine) || (!!o.emergency && p.emerg);
    case 'assigned': return p.newMine && mine;
    case 'missed': return p.missed;
    case 'approvals': return p.approvals && mine;
    case 'system': return p.system && isAdmin;
    default: return false;
  }
}
function compose(more, text, link, head0, bare){
  const head = s(head0 || 'GrayCo') + (more ? ' (+' + more + ' more)' : '') + ': ';
  const tail = link ? (bare ? ' ' : ' Open: ') + link : '';
  return head + clip(text, Math.max(20, MAX - head.length - tail.length)) + tail;
}
function loadState(v){
  const st = obj(v);
  ['last', 'reply', 'daily', 'held', 'seen', 'hint', 'lsa', 'lsaCust', 'lsaPm'].forEach(k => { st[k] = obj(st[k]); });   /* LSATEXT: + lsa; LSAFLOW: + lsaCust, lsaPm */
  const t = now();
  Object.keys(st.last).forEach(k => { if (t - Date.parse(st.last[k].at || 0) > 86400000) delete st.last[k]; });
  Object.keys(st.reply).forEach(k => { if (t - Date.parse(st.reply[k].at || 0) > REPLY_MS) delete st.reply[k]; });
  Object.keys(st.seen).forEach(k => { if (t - Date.parse(st.seen[k] || 0) > 3 * 86400000) delete st.seen[k]; });
  Object.keys(st.hint).forEach(k => { if (t - Date.parse(st.hint[k] || 0) > 86400000) delete st.hint[k]; });
  Object.keys(st.lsa).forEach(k => { st.lsa[k] = arr(st.lsa[k]).filter(x => x && t - Date.parse(x.at || 0) < LSA_MS); if (!st.lsa[k].length) delete st.lsa[k]; });   /* LSATEXT */
  Object.keys(st.lsaCust).forEach(k => { if (t - Date.parse(st.lsaCust[k].at || 0) > 7 * 86400000) delete st.lsaCust[k]; });
  Object.keys(st.daily).forEach(k => { if (s(st.daily[k]) < centralDay(t - 3 * 86400000)) delete st.daily[k]; });
  return st;
}
function fromNum(){ return env('TWILIO_FROM_ALERTS') || env('TWILIO_FROM'); }

/* ── one alert to everyone who wants it ──
   o = { type, text, link, thread, mine, emergency, daily, replyTo: { phone, pid, name } | null, hold } */
async function notify(o){
  o = o || {};
  const out = { sent: 0, to: [], skipped: {} };
  if (env('SMS_ALERTS_OFF') === '1') return Object.assign(out, { off: true });
  const set = await load();
  if (!Object.keys(set.people).some(k => set.people[k].on) && !Array.isArray(o.only)) return out;
  let pp = {}; try { pp = await _D.people(); } catch (e) { pp = {}; }
  const R = {}; resolve(set, pp).forEach(r => { R[r.email] = r; });
  const admins = {}; staffList(pp).forEach(x => { if (x.admin) admins[x.email] = 1; });
  let want = Object.keys(R).filter(e => wants(R[e].p, e, o, !!admins[e]));
  if (Array.isArray(o.only)) {   /* patch SUBALERT: a sub bid goes only to its estimator(s) — by their CRM cell even before they are on the text list */
    const only = o.only.map(low), sl = {}; staffList(pp).forEach(x => { sl[x.email] = x; });
    only.forEach(e => { if (!R[e] && sl[e] && sl[e].phone) { const sp = set.people[e]; if (!sp || sp.on !== false) R[e] = { key: e, email: e, phone: sl[e].phone, p: Object.assign({ on: true, newAll: true, name: sl[e].name }, sp || {}) }; } });
    want = Object.keys(R).filter(e => only.indexOf(e) >= 0);
  }
  if (!want.length) return out;
  /* patch AUTOPANEL: staff text alerts are a safety switch (default ON); data-entry mode no longer stops them — they go to
     staff cells, tagged 'staff', which _lib/pause.js lets through */
  if (!(await require('./automations.js').isOn('staff_text_alerts'))) return Object.assign(out, await require('./automations.js').held('staff_text_alerts', want.length, [s(o.type)]));
  const opt = await _D.optouts();
  let hours = null; if (!o.emergency) { try { hours = await _D.hours(); } catch (e) { hours = null; } }
  const t = now(), at = new Date(t).toISOString(), day = centralDay(t), thread = s(o.thread) || o.type;
  const go = [], skip = { optout: [], quiet: [], rate: [], daily: [], held: [] };
  /* claim each person (rate limit / daily / burst count) — recomputed on every kvCas retry */
  await _D.kvCas(SKEY, v => {
    const st = loadState(v); go.length = 0; Object.keys(skip).forEach(k => { skip[k] = []; });
    want.forEach(e => {
      const p = Object.assign({}, R[e].p, { phone: R[e].phone, name: R[e].p.name || e });
      if (opt[p.phone]) { skip.optout.push(e); return; }
      if (!o.emergency && !o.lsa && quietNow(p, t, hours)) {   /* LSATEXT: an LSA lead texts any time */
        if (o.hold) { const l = Array.isArray(st.held[e]) ? st.held[e] : []; if (l.length < 5 && !l.some(x => x.text === o.text)) l.push({ at, text: clip(o.text, 200), link: s(o.link) }); st.held[e] = l; skip.held.push(e); }
        else skip.quiet.push(e);
        return;
      }
      if (o.daily) { const dk = e + '|' + thread; if (st.daily[dk] === day) { skip.daily.push(e); return; } st.daily[dk] = day; }
      const k = e + '|' + thread, last = st.last[k];
      if (last && t - Date.parse(last.at || 0) < RATE_MS) { last.more = (last.more || 0) + 1; skip.rate.push(e); return; }
      go.push({ email: e, phone: p.phone, name: p.name, more: last ? last.more || 0 : 0 });
      st.last[k] = { at, more: 0 };
    });
    return st;
  });
  Object.keys(skip).forEach(k => { if (skip[k].length) out.skipped[k] = skip[k].slice(); });
  for (const g of go) {
    const body = typeof o.body === 'function' ? o.body(g.more) : compose(g.more, o.text, o.link);
    let r = { ok: false }; try { r = await _D.send(g.phone, body, fromNum()); } catch (e) { r = { ok: false, why: s(e && e.message) }; }
    if (r && r.ok) { out.sent++; out.to.push(g.email); }
    else { out.failed = (out.failed || 0) + 1; }
  }
  if (out.sent && o.lsa) {   /* LSATEXT: the phones that got this LSA lead can answer GOOD / BAD (72 h) */
    const ph2 = go.filter(g => out.to.indexOf(g.email) >= 0).map(g => g.phone);
    await _D.kvCas(SKEY, v => { const st = loadState(v); ph2.forEach(ph => { const l = arr(st.lsa[ph]).filter(x => x.leadId !== o.lsa.leadId); l.push(Object.assign({ at }, o.lsa)); st.lsa[ph] = l.slice(-12); }); return st; }).catch(() => {});
  }
  if (out.sent && o.replyTo && (phone10(o.replyTo.phone).length === 10 || s(o.replyTo.leadId))) {
    const rt = { at, to: phone10(o.replyTo.phone).length === 10 ? phone10(o.replyTo.phone) : '', pid: s(o.replyTo.pid), name: clip(o.replyTo.name, 60), kind: o.type,
      leadId: s(o.replyTo.leadId), emergency: !!o.emergency };
    const phones = go.filter(g => out.to.indexOf(g.email) >= 0).map(g => ({ phone: g.phone, email: g.email, name: g.name }));
    await _D.kvCas(SKEY, v => { const st = loadState(v); phones.forEach(x => { st.reply[x.phone] = Object.assign({ email: x.email, staff: x.name }, rt); }); return st; }).catch(() => {});
  }
  return out;
}
/* held (quiet-hours) system alerts: sent on the next daytime run (crm-health daily) */
async function flushHeld(){
  const set = await load(), t = now();
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  const R = {}; resolve(set, pp).forEach(r => { R[r.email] = Object.assign({}, r.p, { phone: r.phone }); });
  let held = {};
  await _D.kvCas(SKEY, v => { const st = loadState(v); held = {}; Object.keys(st.held).forEach(e => { const p = R[e]; if (p && !inQuiet(p, t)) { held[e] = st.held[e]; delete st.held[e]; } }); return Object.keys(held).length ? st : undefined; });
  const out = { sent: 0 };
  if (!Object.keys(held).length) return out;
  if (!(await require('./automations.js').isOn('staff_text_alerts'))) return Object.assign(out, { held: 'staff_text_alerts' });   /* patch AUTOPANEL (staff texts go in data-entry mode) */
  const opt = await _D.optouts();
  for (const e of Object.keys(held)) {
    const p = R[e]; if (opt[p.phone] || !p.system) continue;
    const l = arr(held[e]), text = l.length === 1 ? l[0].text : l.length + ' overnight alerts: ' + l.map(x => x.text).join(' · ');
    try { const r = await _D.send(p.phone, compose(0, text, l[0] && l[0].link), fromNum()); if (r && r.ok) out.sent++; } catch (e2) {}
  }
  return out;
}

/* ── a text from a phone in the alerts table (missed-call.js, before anything else; STOP is already handled there) ──
   null → not a staff phone in the table (the normal path goes on). Otherwise handled here — never a lead. */
async function staffInbound(ph, body, sid){
  ph = phone10(ph); if (ph.length !== 10) return null;
  const set = await load();
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  /* a phone in the table: on or off (an "off" staff phone still never becomes a lead) */
  const list = staffList(pp), byPhone = {};
  list.forEach(x => { const sp = set.people[x.email]; const ph2 = (sp && sp.phone) || (sp ? x.phone : ''); if (ph2) byPhone[ph2] = { email: x.email, name: (sp && sp.name) || x.name }; });
  resolve(set, pp).forEach(r => { byPhone[r.phone] = byPhone[r.phone] || { email: r.email, name: r.p.name }; });
  if (!byPhone[ph]) return null;
  const email = byPhone[ph].email, p = { name: (list.find(x => x.email === email) || {}).name || byPhone[ph].name }, t = now(), at = new Date(t).toISOString();
  const opt = await _D.optouts();
  if (opt[ph] && START.test(body)) return null;   /* START from an opted-out staff phone: the normal START path undoes it */
  let rep = null, fresh = false;
  await _D.kvCas(SKEY, v => { const st = loadState(v); fresh = false; rep = st.reply[ph] || null; if (sid && st.seen[sid]) return undefined; if (sid) st.seen[sid] = at; fresh = true; return st; });
  if (!fresh) return { handled: true, staff: email, skipped: 'already handled' };
  try { const lr = await lsaReply(ph, body, { email, name: p.name }); if (lr) return lr; } catch (e) {}   /* LSATEXT: GOOD / BAD for an LSA lead */
  if (!rep || t - Date.parse(rep.at || 0) > REPLY_MS) {
    /* a short "not sent" note, at most once a day per phone */
    let hint = false;
    await _D.kvCas(SKEY, v => { const st = loadState(v); hint = false; if (st.hint[ph]) return undefined; st.hint[ph] = at; hint = true; return st; }).catch(() => {});
    const out = { handled: true, staff: email, ignored: 'no alert in the last 30 minutes' };
    if (hint && !opt[ph]) {   /* patch AUTOPANEL: a staff-only hint, tagged 'staff' (goes in data-entry mode) */ try { out.hint = await _D.send(ph, 'GrayCo: your text was not sent to anyone. Reply within 30 min of an alert to answer that person, or answer in the CRM. ' + site(), fromNum()); } catch (e) {} }
    return out;
  }
  const to = rep.to, text = s(body).slice(0, 560);
  let acked = null;   /* a reply to an emergency alert = "I have it": the escalation calls stop (patch EMERGCALL) */
  if (rep.emergency && rep.leadId) { try { acked = await _D.ack(rep.leadId, 'replied to the alert text (' + (p.name || email) + ')'); } catch (e) { acked = { error: s(e && e.message) }; } }
  if (!to) return { handled: true, staff: email, acked, ignored: 'no number to answer (the emergency is marked as taken)' };
  if (!text) return { handled: true, staff: email, acked, ignored: 'empty' };
  if (await _D.paused()) return { handled: true, staff: email, notSent: 'data-entry mode is on' };
  if (opt[to]) return { handled: true, staff: email, notSent: 'that number texted STOP' };
  if (await _D.consentNo(to)) return { handled: true, staff: email, notSent: 'that customer declined texts' };
  let signed = text; try { signed = require('./smsroute.js').sign(text, p.name); } catch (e) {}
  signed = signed.slice(0, 600);
  /* patch CUSTQUIET: a staff reply relayed to a customer is a customer text — 7 PM–7 AM Central it waits for 7 AM, except the
     answer to an EMERGENCY the customer started (rep.emergency), which goes now */
  const r = await _D.send(to, signed, env('TWILIO_FROM'), rep.emergency ? 'emergency' : 'customer');
  if (!r || !r.ok) return { handled: true, staff: email, notSent: 'Twilio did not send it' };
  const id = 'SMSC_' + (sid || t.toString(36));
  const msg = await _D.postReply({ id, pid: rep.pid, email, name: p.name, to, text: signed, at });
  /* the 30-minute window stays open for a back-and-forth */
  await _D.kvCas(SKEY, v => { const st = loadState(v); if (st.reply[ph]) st.reply[ph].at = at; return st; }).catch(() => {});
  return { handled: true, staff: email, replied: true, to, pid: rep.pid, msg: msg && msg.id, acked };
}
/* is this phone a staff phone in the table (any state)? */
async function isStaffPhone(ph){ ph = phone10(ph); if (ph.length !== 10) return false; const set = await load(); let pp = {}; try { pp = await _D.people(); } catch (e) {} return resolve(set, pp).some(r => r.phone === ph); }

/* ── the hooks (one call each from missed-call.js, bid-alerts.js, auto-digest.js, gc-backup.js, crm-health.js) ── */
function quote(b){ return '"' + clip(b, 120) + '"'; }
/* a text in from a customer / sub (missed-call.js inboundSms) */
async function inboundText(o){
  const who = o.who || {}, kind = who.kind === 'sub' ? 'subs' : 'cust';
  if (who.kind === 'staff') return { skipped: 'staff' };
  /* LSAMSG (owner 11/10: "we can also answer these lead messages from CRM under Messages; they also go to the admins' phones for now"):
     a text from a Google LSA lead we texted → Wesley's and Nick's cells (any time), reply from the cell within 30 min */
  let lc = null; try { await _D.kvCas(SKEY, v => { lc = loadState(v).lsaCust[phone10(o.ph)] || null; return undefined; }); } catch (e) {}
  if (lc) {
    const shown = clip(s(who.name) || s(lc.name) || tidy(o.ph), 40) + ' ' + tidy(o.ph);
    return notify({ type: 'cust', lsa: { leadId: lc.leadId, code: lc.code, name: lc.name, phone: phone10(o.ph) }, text: 'LSA lead ' + lc.code + ' ' + shown + ' texted: ' + quote(o.body) + ' Reply here within 30 min to answer them (or in CRM Messages).',
      link: site() + '/?jobmsg=' + encodeURIComponent(o.pid || 'unsorted'), thread: 'p:' + phone10(o.ph), only: lsaAdmins(), replyTo: { phone: o.ph, pid: o.pid || '', name: who.name || lc.name || '' } });
  }
  const shown = clip(s(who.name) || tidy(o.ph), 40) + (who.name ? ' ' + tidy(o.ph) : '');
  const text = (o.urgent ? '🚨 ' : '') + 'text from ' + shown + (o.label ? ' — ' + clip(o.label, 40) : '') + ': ' + quote(o.body) + ' Reply here within 30 min to answer.';
  return notify({ type: kind, text, link: site() + '/?jobmsg=' + encodeURIComponent(o.pid || 'unsorted'), thread: 'p:' + phone10(o.ph), mine: o.mine || [], emergency: !!o.urgent,
    replyTo: { phone: o.ph, pid: o.pid || '', name: who.name || '' } });
}
/* a missed call (missed-call.js missed) */
async function missedCall(o){
  const shown = clip(s(o.name) || 'a caller', 40) + ' ' + tidy(o.ph);
  return notify({ type: 'missed', text: 'missed call from ' + shown + (o.job ? ' — ' + clip(o.job, 40) : '') + (s(o.said) ? ': ' + quote(o.said) : '') + '. They got the auto-text. Reply here within 30 min to text them.',
    link: site() + (o.pid ? '/?jobmsg=' + encodeURIComponent(o.pid) : '/#leads'), thread: 'p:' + phone10(o.ph), replyTo: { phone: o.ph, pid: o.pid || '', name: o.name || '' } });
}
/* patch SUBALERT (owner 10/29: "I don't want to see any sub leads in the GrayCo text for me or Nick — his prime leads and
   website leads, ads, Facebook etc., but no sub for a big GC commercial lead; all that goes directly to Glenn"):
   a bid where GrayCo would be a SUB to a GC (the server's prime / sub call, or a GC named on a bid-board invite with no
   call made) texts only the estimator(s): the lead's assignee if that is an estimator, else every active estimator. */
const BID_BOARDS = /buildingconnected|planhub|isqft|smartbid|bidclerk|constructconnect|procore|pantera|bluebook|dodge|bid ?board/i;
function isSubBid(r, x){
  const role = low(r.bidRole || x.bidRole || obj(r.leadExtra).bidRole);
  if (role === 'sub') return true;
  if (role === 'prime') return false;
  const src = [r.source, x.source].concat(arr(r.sources).map(y => s(y && y.name || y))).join(' ');
  return !!(s(r.gc || x.gc || r.dueToCompany) && BID_BOARDS.test(src));
}
async function estimatorsFor(r, x){
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  const est = arr(pp.users).filter(u => staffEmail(low(u.email)) && isActiveUser(u) && /estimat/i.test(s(u.role) + ' ' + s(u.title) + ' ' + s(u.profile))).map(u => low(u.email));
  const mine = [x.assigneeEmail, r.estimatorEmail, x.estimatorEmail].map(low).filter(Boolean);
  const hit = mine.filter(e => est.indexOf(e) >= 0);
  return hit.length ? hit : est;
}
/* new leads (bid-alerts.js notifyNew): mine = entries, raw = the raw items by id, isEm(x) */
function leadPhone(raw, x){ const r = raw || {}, le = obj(r.leadExtra), c = obj(r.contact || x.contact); return phone10(le.smsFrom || r.smsFrom || (le.missedCall || le.textMessage || r.missedCall || r.textMessage ? (r.phone || c.phone) : '')); }
async function leads(list, raw, isEm){
  const out = [];
  for (const x of arr(list)) {
    const r = obj((raw || {})[x.id]), em = !!(isEm && isEm(x)), ph = leadPhone(r, x);
    const c = obj(x.contact || r.contact), name = s(c.name || r.name || obj(r.leadExtra).contactName) || 'Unknown';
    const callPh = phone10(c.phone || r.phone || ph);
    let msg = ''; try { msg = require('./leadmsg.js').collect(Object.assign({}, r, x)).message; } catch (e) {}
    /* owner 10/28: "GrayCo NEW LEAD: <name> (901) 555-0100 — "<their message…>" <link>"; emergency "🚨 GrayCo EMERGENCY: …" */
    const head = em ? '🚨 GrayCo EMERGENCY' : 'GrayCo NEW LEAD', link = site() + '/#leads';
    const only = !em && isSubBid(r, x) ? await estimatorsFor(r, x) : null;   /* patch SUBALERT */
    if (isLsaLead(r, x)) {   /* LSATEXT: owner 11/10 — Google LSA leads to Wesley's and Nick's cells; they text back GOOD or BAD */
      const code = lsaCode(x.id), who = clip(name, 40) + (callPh.length === 10 ? ' ' + tidy(callPh) : '');
      /* LSAWORD (owner 11/10: "google lsa lead from 9016927255 wesley says blah blah blah, reply with if the lead is good and who is the PM") */
      const lt = more => { const head = (em ? '🚨 ' : '') + 'GrayCo: Google LSA lead ' + code + (more ? ' (+' + more + ' more)' : '') + ' from ' + (callPh.length === 10 ? tidy(callPh) + ' ' : '') + clip(name, 40),
          tail = ' Reply GOOD + PM name (e.g. GOOD Pat), BAD + why, or NA if no answer.', said = s(msg).replace(/\s+/g, ' '), room = MAX - head.length - tail.length - 9;
        return head + (said && room > 12 ? ' says "' + clip(said, room) + '".' : '.') + tail; };
      try { out.push(await notify({ type: 'lead', lsa: { leadId: s(x.id), code, name: clip(name, 60), phone: callPh, link: s(obj(r.leadExtra).lsaLink || r.lsaLink) }, text: lt(0), body: lt, link, only: lsaAdmins(), thread: 'lsa:' + s(x.id), emergency: em })); } catch (e) { out.push({ error: s(e && e.message) }); }
      try { out.push({ lsaAsk: await lsaAsk(callPh, { leadId: s(x.id), code, name, em, svc: s(obj(r.leadExtra).service || r.service || x.title) }) }); } catch (e) { out.push({ lsaAskError: s(e && e.message) }); }   /* LSAFLOW */
      continue;
    }
    let tail = link; if (em && callPh.length === 10) { try { tail = link + ' Not real? Block: ' + require('./salesguard.js').blockLink(site(), callPh); } catch (e) {} }   /* patch SALESBLOCK: one tap to block (signed; admins / office, asked first) */
    const body = more => leadText(head, more, clip(name, 40) + (callPh.length === 10 ? ' ' + tidy(callPh) : ''), msg, tail);
    const text = body(0);
    try { out.push(await notify({ type: 'lead', text, body, link, only, thread: ph ? 'p:' + ph : 'lead:' + s(x.key || x.id), mine: [x.assigneeEmail].concat(x.coEmails || []).filter(Boolean), emergency: em,
      replyTo: ph || em ? { phone: ph, pid: '', name, leadId: s(x.id) } : null })); } catch (e) { out.push({ error: s(e && e.message) }); }
  }
  return out;
}
/* ── LSATEXT (owner 11/10): "I need Google LSA leads to go to me and Nick's phones so we can send a text good or bad lead and
   then it works in my CRM as that type of lead, then alerts office or marketing … can I enter not good lead automatically
   through the text". The admins (OWNER_EMAILS, default Wesley and Nick) get "GrayCo GOOGLE LSA LEAD K7Q2: …"; a reply from
   that phone within 72 h — "GOOD", "BAD spam", "GOOD K7Q2", "BAD K7Q2 wrong service" (no code = the newest LSA lead sent
   to that phone) — marks the lead: good → kept; bad → closed as "LSA — not a real lead (why)" + an office To-Do
   "⚖️ Dispute … in Google Ads by <date>" (Google gives about 30 days; the CRM cannot file the dispute itself — Google's
   API has no dispute call). The CRM page applies the same mark to the lead (gc_kv "gc_lsa_decisions"). */
const LSA_MS = 72 * 3600 * 1000;
const LSA_LEADS_URL = 'https://ads.google.com/localservices/leads';   /* LSALINK: Google's LSA leads page (dispute a lead there) */
function isLsaLead(r, x){ const it = Object.assign({}, r || {}, x || {}), ex = obj(it.leadExtra); return it.lsaCheck === 'pending' || ex.lsaCheck === 'pending' || /google\s*lsa|local\s*services/i.test([it.source, it.leadSource, ex.leadSource].map(s).join(' ')); }
function lsaCode(id){ const h = require('crypto').createHash('sha256').update(s(id)).digest('hex'), A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 4; i++) c += A[parseInt(h.slice(i * 2, i * 2 + 2), 16) % A.length]; return c; }
function lsaAdmins(){ return (env('OWNER_EMAILS') || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(Boolean); }
const LSA_REPLY = /^\s*(no[\s-]*answer|noanswer|n\/a|na|vm|voice\s*mail|good|bad|g|b|👍|👎|yes|no)\b[\s:.,!-]*([A-Z0-9]{4})?\b[\s:.,!-]*([\s\S]*)$/i;
async function lsaReply(ph, body, who){
  let m = LSA_REPLY.exec(s(body));
  if (!m) {   /* LSANAME (owner 11/10: "if I reply with the PM name that means good lead"): just a PM's name (≤ 3 words, one active person) = GOOD + that PM */
    const words = s(body).replace(/[.!,]+$/, '').trim(); if (!words || words.split(/\s+/).length > 3) return null;
    let open0 = []; await _D.kvCas(SKEY, v => { open0 = arr(loadState(v).lsa[ph]).filter(x => !x.done); return undefined; }).catch(() => {});
    if (!open0.length || !(await pmByName(words))) return null;
    m = ['', 'good', '', words];
  }
  let list = []; await _D.kvCas(SKEY, v => { list = arr(loadState(v).lsa[ph]); return undefined; }).catch(() => {});
  if (!list.length) return null;
  let code = s(m[2]).toUpperCase(), rec = code ? list.find(x => x.code === code) : null, reason = s(m[3]);
  if (/^(g|b|yes|no|na|n\/a|vm|👍|👎)$/i.test(m[1]) && reason) return null;   /* "No problem, see you then" is a reply to the customer, not BAD */
  if (code && !rec) { reason = (m[2] + ' ' + reason).trim(); code = ''; }
  if (!rec) rec = list.filter(x => !x.done).slice(-1)[0] || list.slice(-1)[0];
  const good = /^(good|g|👍|yes)$/i.test(m[1]);
  /* LSANA (owner 11/10: "also put in leads as not answered — not necessarily a bad lead but no answer once we got the lead, will revisit") */
  if (/^(no[\s-]*answer|noanswer|n\/a|na|vm|voice\s*mail)$/i.test(m[1])) {
    const r0 = await _D.lsaDecide({ leadId: rec.leadId, name: rec.name, phone: rec.phone, code: rec.code, noAnswer: true, good: false, reason: reason, notes: reason, by: who.name || who.email, byEmail: who.email });
    let c0 = null; try { c0 = await _D.send(ph, 'GrayCo: ' + rec.code + ' ' + clip(rec.name, 40) + ' marked NO ANSWER — kept open, a call-back is on the office To-Do.' + (reason ? ' Notes saved.' : '') + ' Reply GOOD or BAD ' + rec.code + ' when you reach them.', fromNum()); } catch (e) {}
    return { handled: true, staff: who.email, lsa: rec.leadId, noAnswer: true, saved: r0, confirmed: !!(c0 && c0.ok) };
  }
  /*LSAPM (owner 11/10: "can we reply with good, PM is and name the PM … or we can put good, PM's name"): "GOOD Pat",
    "GOOD, PM is Pat Miller", "GOOD K7Q2 pm pat" → the lead is assigned to that PM now (no approval wait) */
  let pm = null, pmAsked = '', notes = '';
  if (good && reason) {
    pmAsked = reason.replace(/^[\s,.:;-]*(the\s+)?(pm|project\s*manager)?[\s,.:;-]*(is|will\s+be|=)?[\s,.:;-]*/i, '').trim();
    /* LSANOTES (owner 11/10: "if I add any notes on the good lead also enter those in that job's project notes"): "GOOD Pat roof is 20 years old"
       → PM Pat + the note "roof is 20 years old" (the first 1–3 words that are one person's name; the rest is the note) */
    const w = pmAsked.split(/\s+/);
    for (let k = Math.min(3, w.length); k >= 1 && !pm; k--) { const cand = w.slice(0, k).join(' ').replace(/[,.;:!-]+$/, ''); const hit = await pmByName(cand); if (hit) { pm = hit; notes = w.slice(k).join(' ').replace(/^[\s,.;:-]+/, '').trim(); } }
    if (!pm) notes = pmAsked.replace(/[.!]+$/, '');
  }
  if (!good) notes = reason;
  const r = await _D.lsaDecide({ leadId: rec.leadId, name: rec.name, phone: rec.phone, code: rec.code, good, reason: good ? '' : (reason || 'no reason given'), by: who.name || who.email, byEmail: who.email, pm, notes, link: s(rec.link) || LSA_LEADS_URL });
  await _D.kvCas(SKEY, v => { const st = loadState(v); arr(st.lsa[ph]).forEach(x => { if (x.leadId === rec.leadId) { x.done = good ? 'good' : 'bad'; } }); return st; }).catch(() => {});
  const gTxt = (pm ? 'GOOD — PM ' + pm.name + ' assigned; ' + pm.name.split(' ')[0] + ' and the customer are told.' : 'GOOD — no PM set: pick the PM in CRM Approvals (or reply GOOD ' + rec.code + ' <PM name>).') + (notes ? ' Notes saved on the lead.' : '');
  let conf = null; try { conf = await _D.send(ph, 'GrayCo: ' + rec.code + ' ' + clip(rec.name, 40) + ' marked ' + (good ? gTxt : 'BAD (' + clip(reason || 'no reason given', 50) + ') — closed, no PM. Dispute it in Google: ' + (s(rec.link) || LSA_LEADS_URL)), fromNum()); } catch (e) {}
  return { handled: true, staff: who.email, lsa: rec.leadId, good, reason: good ? '' : reason, pm: pm ? pm.name : '', pmAsked, notes, saved: r, confirmed: !!(conf && conf.ok) };
}
/* LSAPM: a PM by what was texted — full name, first name, last name or e-mail name (one active staff person, else nobody) */
async function pmByName(q){
  q = low(q).replace(/[^a-z0-9@.\s'-]/g, ' ').replace(/\s+/g, ' ').trim(); if (!q) return null;
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  const users = arr(pp.users).filter(u => u && s(u.name) && isActiveUser(u) && staffEmail(low(u.email)));
  const tries = [u => low(u.name) === q, u => low(u.email).split('@')[0] === q || low(u.email) === q, u => low(u.name).split(' ')[0] === q, u => low(u.name).split(' ').slice(-1)[0] === q, u => low(u.name).indexOf(q) === 0];
  for (const f of tries) { const hit = users.filter(f); if (hit.length === 1) return { name: s(hit[0].name), email: low(hit[0].email) }; if (hit.length > 1) return null; }
  return null;
}
/* ── LSAFLOW (owner 11/10: "send immediate texts from our text number to these leads to qualify them as real, and after we verify
   it will say here is your project manager's number and they will be calling you shortly" · "once the lead is good send it to
   admin for approval and who to be PM, then the lead needs to be contacted by that PM"):
   1. a new Google LSA lead with a cell → at once, from the GrayCo number: "Hi Pat, this is GrayCo … reply YES to confirm" (a
      customer text: 7 PM–7 AM it waits for 7 AM unless it is an emergency; never to a number that texted STOP or declined texts;
      LSA_QUALIFY_OFF=1 turns it off).
   2. their YES → "Thank you — confirmed …" back, Wesley and Nick get "✅ <code> <name> confirmed by text", the lead is marked
      lsaVerified (the text also lands on the lead as usual).
   3. Wesley / Nick mark it GOOD (text or CRM) → it waits in ✅ Approvals for an admin to approve / pick the PM (an LSA lead never
      auto-assigns at 5 PM — lead-hold.js lsaWait).
   4. the PM is assigned → the customer gets "Your GrayCo project manager is <PM> — <phone>. They will be calling you shortly."
      (once per lead; not for a lead marked BAD) and the PM gets the normal assigned alert + the 4 h / 24 h reach-out reminders. */
const YES = /^\s*(y|yes|yeah|yep|yup|confirm(ed)?|correct|real|si|sí|👍|ok(ay)?)\b/i;
function firstOf(n){ const f = s(n).split(/\s+/)[0]; return /^(unknown|customer|lead|google)$/i.test(f) ? '' : f; }
async function lsaAsk(ph, o){
  if (env('LSA_QUALIFY_OFF') === '1' || phone10(ph).length !== 10) return { skipped: 'no cell / off' };
  ph = phone10(ph);
  if (await _D.paused()) return { skipped: 'data-entry mode' };
  const opt = await _D.optouts(); if (opt[ph]) return { skipped: 'texted STOP' };
  if (await _D.consentNo(ph)) return { skipped: 'declined texts' };
  let claim = false; const at = new Date(now()).toISOString();
  await _D.kvCas(SKEY, v => { const st = loadState(v); claim = false; if (st.lsaCust[ph] && st.lsaCust[ph].leadId === o.leadId) return undefined; st.lsaCust[ph] = { leadId: o.leadId, code: o.code, name: clip(o.name, 60), at, stage: 'asked' }; claim = true; return st; });
  if (!claim) return { skipped: 'already asked' };
  const f = firstOf(o.name), svc = clip(s(o.svc).replace(/^(google\s*lsa|local services)[:\s-]*/i, ''), 50);
  const body = 'Hi' + (f ? ' ' + f : '') + ', this is GrayCo Construction Services. We received your request through Google' + (svc ? ' about ' + svc.toLowerCase() : '') + '. Reply YES to confirm you\'d like a call and we\'ll send you your project manager\'s name and number. Reply STOP to opt out.';
  const r = await _D.send(ph, body.slice(0, 320), env('TWILIO_FROM'), o.em ? 'emergency' : 'customer');
  return { sent: !!(r && r.ok), held: !!(r && r.held) };
}
/* a text from a customer (missed-call.js, before the normal path): their YES to the qualify text. Never stops the normal path. */
async function lsaCustomer(ph, body){
  ph = phone10(ph); if (ph.length !== 10) return null;
  let rec = null; await _D.kvCas(SKEY, v => { rec = loadState(v).lsaCust[ph] || null; return undefined; }).catch(() => {});
  if (!rec || rec.stage !== 'asked' || !YES.test(s(body))) return null;
  const at = new Date(now()).toISOString();
  await _D.kvCas(SKEY, v => { const st = loadState(v); if (st.lsaCust[ph]) { st.lsaCust[ph].stage = 'yes'; st.lsaCust[ph].yesAt = at; } return st; }).catch(() => {});
  let saved = null; try { saved = await _D.lsaVerified(rec.leadId); } catch (e) {}
  let ack = null; try { ack = await _D.send(ph, 'Thank you' + (firstOf(rec.name) ? ', ' + firstOf(rec.name) : '') + ' — you\'re confirmed. We\'re setting up your project manager now; you\'ll get their name and number by text shortly.', env('TWILIO_FROM'), 'customer'); } catch (e) {}
  let told = null; try { told = await notify({ type: 'lead', lsa: { leadId: rec.leadId, code: rec.code, name: rec.name, phone: ph }, text: '✅ ' + rec.code + ' ' + clip(rec.name, 40) + ' ' + tidy(ph) + ' confirmed by text (YES). Reply GOOD ' + rec.code + ' or BAD ' + rec.code + ' + why.', link: site() + '/#leads', only: lsaAdmins(), thread: 'lsa:' + rec.leadId + ':yes' }); } catch (e) {}
  return { lsaVerified: rec.leadId, saved, acked: !!(ack && ack.ok), told: told && told.sent };
}
/* the PM is set on an LSA lead (bid-alerts.js notifyAssigned) → the customer gets the PM's name and number, once */
async function lsaPmText(lead, x){
  lead = obj(lead); if (!isLsaLead(lead, {})) return null;
  const ex = obj(lead.leadExtra), chk = s(lead.lsaCheck || ex.lsaCheck);
  if (/bad/.test(chk) || /lost|dismiss/i.test(s(lead.status))) return { skipped: 'marked bad' };
  const c = obj(lead.contact), ph = phone10(c.phone || lead.phone || ex.smsFrom); if (ph.length !== 10) return { skipped: 'no cell' };
  const email = low(x && x.assigneeEmail), pmName = s(x && x.assignee); if (!pmName) return { skipped: 'no PM' };
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  const u = arr(pp.users).find(y => y && (low(y.email) === email || low(y.name) === low(pmName))) || {};
  const pmPh = phone10(u.cell || u.mobile || u.phone);
  if (await _D.paused()) return { skipped: 'data-entry mode' };
  const opt = await _D.optouts(); if (opt[ph]) return { skipped: 'texted STOP' };
  if (await _D.consentNo(ph)) return { skipped: 'declined texts' };
  const id = s(lead.id); let claim = false;
  await _D.kvCas(SKEY, v => { const st = loadState(v); claim = false; if (st.lsaPm[id]) return undefined; st.lsaPm[id] = new Date(now()).toISOString(); claim = true; return st; });
  if (!claim) return { skipped: 'already sent' };
  const f = firstOf(c.name || lead.name);
  const body = 'Hi' + (f ? ' ' + f : '') + ', your GrayCo project manager is ' + pmName + (pmPh.length === 10 ? ' — ' + tidy(pmPh) : '') + '. They will be calling you shortly. — GrayCo Construction Services';
  const r = await _D.send(ph, body.slice(0, 320), env('TWILIO_FROM'), 'customer');
  return { sent: !!(r && r.ok), to: ph, pm: pmName };
}
/* "<head>: <who> — "<message…>" <link>" in ≤ 300 characters; the message is what gets trimmed */
function leadText(head, more, who, msg, link){
  const h = head + (more ? ' (+' + more + ' more)' : '') + ': ' + who, tail = ' ' + link;
  msg = s(msg).replace(/\s+/g, ' ');
  if (!msg) return clip(h, MAX - tail.length) + tail;
  const room = MAX - h.length - tail.length - 5;   /* ' — "' + '"' */
  if (room < 12) return clip(h, MAX - tail.length) + tail;
  return h + ' — "' + clip(msg, room) + '"' + tail;
}
/* a lead assigned later (bid-alerts.js notifyAssigned) */
async function assigned(x){
  return notify({ type: 'assigned', text: 'lead assigned to you: ' + clip(x.title, 60) + (x.assignedBy ? ' (by ' + clip(x.assignedBy, 24) + ')' : ''), link: site() + '/#leads', thread: 'lead:' + s(x.key || x.id), mine: [x.assigneeEmail] });
}
/* the morning approvals digest (auto-digest.js) — at most one text a day per person */
async function approvals(email, n){
  return notify({ type: 'approvals', text: n + ' approval' + (n === 1 ? '' : 's') + ' waiting on you.', link: site() + '/#todo', thread: 'appr', mine: [email], daily: true });
}
/* admin / system (gc-backup, crm-health) — once a day per kind; held through quiet hours */
async function system(kind, text){
  return notify({ type: 'system', text: 'CRM alert — ' + text, link: site(), thread: 'sys:' + s(kind), daily: true, hold: true });
}

module.exports = { lsaAsk, lsaCustomer, lsaPmText, _lsaCode: lsaCode, _isLsaLead: isLsaLead, _lsaReply: lsaReply, _D: _D, _isSubBid: isSubBid, ROLE_MIT, DEFAULT_PEOPLE, resolve, mitigationHolders, leadText, KEY, SKEY, TYPES, RATE_MS, REPLY_MS, settings, cleanPerson, staffList, load, save, notify, flushHeld, staffInbound, isStaffPhone, inboundText, missedCall, leads, assigned, approvals, system,
  inQuiet, quietNow, centralHour, compose, wants, _D };
