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
/* patch SMSALERT2 (owner 10/29: "text alerts for certain types of leads too: roof, insurance, water mitigation, commercial etc"):
   per-person lead TYPES. A person gets a new-lead text when "New leads (all)" is on, OR it is assigned to them, OR one of
   their ticked types matches. The type comes from the CRM's own lead classification (leadTypes below). */
const LEAD_TYPES = [
  { id: 'roof', label: 'Roofing' }, { id: 'ins', label: 'Insurance / restoration' }, { id: 'water', label: 'Water / mitigation' },
  { id: 'fire', label: 'Fire' }, { id: 'storm', label: 'Storm / tree' }, { id: 'remodel', label: 'Remodel / residential' },
  { id: 'comm', label: 'Commercial / bids (plan rooms)' }, { id: 'web', label: 'Website leads' }, { id: 'text', label: 'Text-message leads' },
  { id: 'missed', label: 'Missed calls' }, { id: 'other', label: 'Other' }];
const LT_IDS = LEAD_TYPES.map(x => x.id);
/* the restoration split (lead-roles: "restoration = water, fire and storm") */
const R_WATER = /\b(water|flood(s|ed|ing)?|leak(s|ed|ing|y)?|pipe|burst|sewage|mitigation|mold|mould|dry-?out|moisture)\b/i;
const R_FIRE = /\b(fire|smoke|soot|burn(ed|t)?)\b/i;
const R_STORM = /\b(storm|hail|wind|tree|tornado)\b/i;
/* the lead's types, from the existing classifiers: lead-roles.classify / isRoofing (SPAMROLE), bid-role (plan rooms, public
   bids), bid-alerts' website / partner flags, the text-message / missed-call flags, emergency.isMitigation */
function leadTypes(l){
  l = obj(l);
  const le = obj(l.leadExtra), out = {};
  let LR = null, BR = null, E = null;
  try { LR = require('./lead-roles.js'); } catch (e) {}
  try { BR = require('./bid-role.js'); } catch (e) {}
  try { E = require('./emergency.js'); } catch (e) {}
  const bidRole = BR ? s(BR.role(l)) : '';
  const kind = LR ? LR.classify(l, x => !!bidRole) : '';
  const tx = [l.title, l.name, l.scope, l.service, l.detail, l.message, le.textBody, le.callerSaid, le.workType, obj(le.said).message, obj(le.said).service].map(s).join(' | ');
  if (kind === 'bid' || bidRole || /commerc|gov/i.test(s(l.leadKind || l.type))) out.comm = 1;
  if (kind === 'roofing' || (LR && (out.comm ? LR.roofBid(l) : LR.isRoofing(l)))) out.roof = 1;
  if (kind === 'insurance') {
    out.ins = 1;
    if (R_WATER.test(tx) || (E && E.isMitigation(l) && !R_FIRE.test(tx))) out.water = 1;
    if (R_FIRE.test(tx)) out.fire = 1;
    if (R_STORM.test(tx)) out.storm = 1;
  }
  if (!out.comm && !out.ins && !out.roof && (/remodel|residential|kitchen|bath|renovat|addition/i.test(tx) || /^(residential|remodel|estimate)$/i.test(s(l.leadKind || l.type)))) out.remodel = 1;
  if (le.textMessage || l.textMessage || s(l.websiteForm || le.websiteForm) === 'Text message') out.text = 1;
  else if (le.missedCall || l.missedCall || s(l.websiteForm || le.websiteForm) === 'Missed call') out.missed = 1;
  else if (s(l.origin) === 'website' || l.websiteLead || le.websiteLead || /^website\b/i.test(s(l.source))) out.web = 1;
  if (!out.comm && !out.roof && !out.ins && !out.remodel) out.other = 1;
  return LT_IDS.filter(k => out[k]);
}
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
  send: (to10, body, from) => MC().sendSms(to10, body, from),
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
  const lt = obj(p.lt); out.lt = {}; LT_IDS.forEach(k => { if (lt[k]) out.lt[k] = true; });   /* patch SMSALERT2 */
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
    if (e === ROLE_MIT) { const r = set.people[e]; BOOL_TYPES.forEach(t2 => { if (t2 !== 'emerg') r[t2] = false; }); r.cust = 'off'; r.lt = {}; return; }   /* the role row: emergencies only */
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
    case 'lead': return p.newAll || (p.newMine && mine) || (!!o.emergency && p.emerg) || (o.types || []).some(k => !!obj(p.lt)[k]);   /* patch SMSALERT2: a ticked lead type */
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
  ['last', 'reply', 'daily', 'held', 'seen', 'hint'].forEach(k => { st[k] = obj(st[k]); });
  const t = now();
  Object.keys(st.last).forEach(k => { if (t - Date.parse(st.last[k].at || 0) > 86400000) delete st.last[k]; });
  Object.keys(st.reply).forEach(k => { if (t - Date.parse(st.reply[k].at || 0) > REPLY_MS) delete st.reply[k]; });
  Object.keys(st.seen).forEach(k => { if (t - Date.parse(st.seen[k] || 0) > 3 * 86400000) delete st.seen[k]; });
  Object.keys(st.hint).forEach(k => { if (t - Date.parse(st.hint[k] || 0) > 86400000) delete st.hint[k]; });
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
  if (!Object.keys(set.people).some(k => set.people[k].on)) return out;
  let pp = {}; try { pp = await _D.people(); } catch (e) { pp = {}; }
  const R = {}; resolve(set, pp).forEach(r => { R[r.email] = r; });
  const admins = {}; staffList(pp).forEach(x => { if (x.admin) admins[x.email] = 1; });
  const want = Object.keys(R).filter(e => wants(R[e].p, e, o, !!admins[e]));
  if (!want.length) return out;
  if (await _D.paused()) return Object.assign(out, { paused: true });
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
      if (!o.emergency && quietNow(p, t, hours)) {
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
  if (await _D.paused()) return Object.assign(out, { paused: true });
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
  if (!rep || t - Date.parse(rep.at || 0) > REPLY_MS) {
    /* a short "not sent" note, at most once a day per phone */
    let hint = false;
    await _D.kvCas(SKEY, v => { const st = loadState(v); hint = false; if (st.hint[ph]) return undefined; st.hint[ph] = at; hint = true; return st; }).catch(() => {});
    const out = { handled: true, staff: email, ignored: 'no alert in the last 30 minutes' };
    if (hint && !opt[ph] && !(await _D.paused())) { try { out.hint = await _D.send(ph, 'GrayCo: your text was not sent to anyone. Reply within 30 min of an alert to answer that person, or answer in the CRM. ' + site(), fromNum()); } catch (e) {} }
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
  const r = await _D.send(to, signed, env('TWILIO_FROM'));
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
    const body = more => leadText(head, more, clip(name, 40) + (callPh.length === 10 ? ' ' + tidy(callPh) : ''), msg, link);
    const text = body(0);
    let types = []; try { types = leadTypes(Object.assign({}, r, x, { leadExtra: Object.assign({}, obj(x.leadExtra), obj(r.leadExtra)) })); } catch (e) {}   /* patch SMSALERT2 */
    try { out.push(await notify({ type: 'lead', types, text, body, link, thread: ph ? 'p:' + ph : 'lead:' + s(x.key || x.id), mine: [x.assigneeEmail].concat(x.coEmails || []).filter(Boolean), emergency: em,
      replyTo: ph || em ? { phone: ph, pid: '', name, leadId: s(x.id) } : null })); } catch (e) { out.push({ error: s(e && e.message) }); }
  }
  return out;
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

module.exports = { LEAD_TYPES, LT_IDS, leadTypes, ROLE_MIT, DEFAULT_PEOPLE, resolve, mitigationHolders, leadText, KEY, SKEY, TYPES, RATE_MS, REPLY_MS, settings, cleanPerson, staffList, load, save, notify, flushHeld, staffInbound, isStaffPhone, inboundText, missedCall, leads, assigned, approvals, system,
  inQuiet, quietNow, centralHour, compose, wants, _D };
