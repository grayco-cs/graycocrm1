/* ============================================================================
   GrayCo — 📞 CALL ORDER: who the GrayCo Twilio number rings, one after the other.   netlify/functions/_lib/callorder.js
   (patches CALLCHAIN, CALLSCREEN)

   Owner (10/28): "i want twilio to call in order office, nick owner 1, wesley owner 2, general manager (we dont have
   one yet), lead pm".

   The order is data, not code — Admin → ⚙ Admin settings → 📞 Call order (texts.js ?callchain=1, admins only), kept in
   the service-only gc_lead_inbox_kv "gc_call_order" (never synced to a browser):
     { on, ringSeconds (15), slots: [{ id, label, on, kind, phone, person }],
       screen: { on, greeting, askWhat, whisper, blocked: [10-digit numbers] } }
   (Not the rc-r13 24/7 emergency chain — _lib/callchain.js, TWILIO_CALL_CHAIN=1 — which only runs when this order is off.)
   A slot is one of
     kind 'company' — the company office line (brand.js BRAND.phone, (901) 585-0944)
     kind 'phone'   — a typed number
     kind 'person'  — a person in the CRM's people list (gc_kv "users": id / e-mail / name) → their phone / cell / mobile
     kind 'senior'  — whoever is the Senior PM right now (Admin → 👥 Team roles & Senior PM, gc_kv "gc_senior_pm")
   resolved when the call comes in, so a new phone number or a new Senior PM needs no change here.
   Skipped at call time: a slot that is off or empty (no General Manager yet), a person no longer active, a number equal
   to the caller's, to one of our Twilio numbers, or to the line the call was forwarded from (ForwardedFrom /
   CalledVia — the office line may forward its no-answer calls to the Twilio number: ringing it again would loop), and
   a number already rung earlier in the list. Owner add-on: "also add pm 2 pm 3 and so on" — after Lead PM an admin adds
   any number of people (PM 2, PM 3, …; label editable, up to MAX_SLOTS). Each hop is its own <Dial>, so the whole list is
   walked; the Admin card shows how long a caller may wait before the text goes out.
   Nothing saved yet → the defaults below (or Netlify TWILIO_RING_TO as the only line, when it is set).

   patch CALLSCREEN (owner 10/28: "before we ring nicks phone i want to be sure ai or someone trying to sell something
   doesnt click the number and then call him, these leads need to be qualified and want to have something done in
   construction … everything else we do not accept on this phone number"): before anyone is rung the caller hears a
   short menu — 1 construction / repair work, 2 current customer, 3 anything else / sales. Nothing pressed twice → goodbye
   (likely a robocall); 3, a blocked number or a failed caller-ID attestation (STIR/SHAKEN) → "we don't take sales calls"
   and goodbye. Only 1 and 2 ring the call order; only they get the missed-call text and a lead. The person who
   answers hears "GrayCo call: <what they need>. Press 1 to accept" first, so a voicemail does not take the call.

   patch AFTERHOURS (owner 10/28: "after hours we do not get rings that goes to automatic texts immediately unless its an
   emergency claim and put into leads for the morning, if it is an emergency text or call we will get after hours
   mitigation manager, nick wesley, as order"): business hours (default Mon–Fri 7 AM–6 PM Central, weekends closed,
   holidays) — isOpen(now, settings), also for the SMS alerts' quiet hours. After hours the menu is 1 emergency (rings the
   AFTER-HOURS order: Mitigation manager → Nick → Wesley, editable) · 2 anything else (no ring: a text at once and a lead
   for the morning) · 3 sales.
   ========================================================================== */
'use strict';
const KEY = 'gc_call_order', LOG_KEY = 'gc_call_log';
const SLOT_IDS = ['office', 'owner1', 'owner2', 'gm', 'leadpm'];
const LABELS = { office: 'Office', owner1: 'Owner 1', owner2: 'Owner 2', gm: 'General Manager', leadpm: 'Lead PM' };
const KINDS = ['company', 'phone', 'person', 'senior', 'mitigation'];
const MAX_SLOTS = 20;
/* the owner's first order (10/28). Owner 1 / Owner 2 are looked up in the people list by name — an admin picks anyone else. */
const GREETING = "Thanks for calling GrayCo Construction Services. If you need construction, remodeling, roofing, or water, fire or storm damage repair, press 1. If you're a current GrayCo customer, press 2. For anything else, including sales calls, press 3.";
const SCREEN = { on: true, greeting: GREETING, askWhat: true, whisper: true, blocked: [] };
const NIGHT_GREETING = "Thanks for calling GrayCo Construction Services. Our office is closed. If you have an emergency — water, fire, or storm or tree damage — press 1. For anything else, press 2 and we'll text you and call you back in the morning. For sales, press 3.";
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const HOURS = { tz: 'America/Chicago', days: { sun: { open: false, start: '07:00', end: '18:00' }, mon: { open: true, start: '07:00', end: '18:00' }, tue: { open: true, start: '07:00', end: '18:00' },
  wed: { open: true, start: '07:00', end: '18:00' }, thu: { open: true, start: '07:00', end: '18:00' }, fri: { open: true, start: '07:00', end: '18:00' }, sat: { open: false, start: '07:00', end: '18:00' } }, holidays: [] };
const NIGHT = { greeting: NIGHT_GREETING, slots: [
  { id: 'n_mit', label: 'Mitigation manager', on: true, kind: 'mitigation', phone: '', person: '' },
  { id: 'n_owner1', label: 'Nick', on: true, kind: 'person', phone: '', person: 'Nick Thomas' },
  { id: 'n_owner2', label: 'Wesley', on: true, kind: 'person', phone: '', person: 'Wesley Johnson' }] };
const DEFAULTS = {
  on: true, ringSeconds: 15, screen: SCREEN, hours: HOURS, night: NIGHT,
  slots: [
    { id: 'office', on: true, kind: 'company', phone: '', person: '' },
    { id: 'owner1', on: true, kind: 'person', phone: '', person: 'Nick Thomas' },
    { id: 'owner2', on: true, kind: 'person', phone: '', person: 'Wesley Johnson' },
    { id: 'gm', on: true, kind: 'person', phone: '', person: '' },
    { id: 'leadpm', on: true, kind: 'senior', phone: '', person: '' }
  ]
};

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function digits(v){ return s(v).replace(/\D/g, ''); }
function phone10(v){ const d = digits(v); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function clampInt(v, lo, hi, d){ const n = parseInt(v, 10); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; }
function P(){ return require('./people.js'); }
function companyPhone(){ try { return phone10(require('./brand.js').BRAND.phone); } catch (e) { return '9015850944'; } }

/* a saved / posted value → the clean settings (each slot once, in the posted order; unknown fields dropped) */
function cleanSlots(list){
  const seen = {}, slots = [];
  arr(list).forEach(x => {
    if (!x || typeof x !== 'object' || slots.length >= MAX_SLOTS) return;
    const id = s(x.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32); if (!id || seen[id]) return; seen[id] = 1;
    const kind = KINDS.indexOf(s(x.kind)) >= 0 ? s(x.kind) : 'phone';
    const ph = phone10(x.phone);
    slots.push({ id, label: s(x.label).slice(0, 40) || LABELS[id] || 'Person', on: x.on !== false, kind, phone: ph.length === 10 ? ph : '', person: s(x.person).slice(0, 120) });
  });
  return slots;
}
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
function cleanHours(h){
  h = h && typeof h === 'object' ? h : {};
  const days = {}, hd = h.days && typeof h.days === 'object' ? h.days : {};
  DAYS.forEach(k => { const d = hd[k] && typeof hd[k] === 'object' ? hd[k] : HOURS.days[k], st = HM.test(s(d.start)) ? s(d.start) : HOURS.days[k].start, en = HM.test(s(d.end)) ? s(d.end) : HOURS.days[k].end;
    days[k] = { open: hd[k] ? d.open !== false && st < en : HOURS.days[k].open, start: st, end: en }; });
  const holidays = (Array.isArray(h.holidays) ? h.holidays : s(h.holidays).split(/[\s,;]+/)).map(s).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, 60);
  return { tz: 'America/Chicago', days, holidays };
}
/* Central wall clock → { day: 'mon', date: 'YYYY-MM-DD', hm: 'HH:MM' } */
function wall(t, tz){
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/Chicago', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).forEach(x => { p[x.type] = x.value; });
  return { day: low(p.weekday).slice(0, 3), date: p.year + '-' + p.month + '-' + p.day, hm: p.hour + ':' + p.minute };
}
/* open for business right now? (settings: the saved call order, or just its hours) — the SMS alerts use this for quiet hours */
function isOpen(t, settings){
  const h = cleanHours(settings && settings.hours ? settings.hours : settings && settings.days ? settings : null), w = wall(t == null ? Date.now() : t, h.tz);
  if (h.holidays.indexOf(w.date) >= 0) return false;
  const d = h.days[w.day]; return !!(d && d.open && w.hm >= d.start && w.hm < d.end);
}
function clean(v){
  v = v && typeof v === 'object' ? v : {};
  const seen = {}, slots = [];
  arr(v.slots).forEach(x => {
    if (!x || typeof x !== 'object' || slots.length >= MAX_SLOTS) return;
    const id = s(x.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32); if (!id || seen[id]) return; seen[id] = 1;
    const kind = KINDS.indexOf(s(x.kind)) >= 0 ? s(x.kind) : 'phone';
    const ph = phone10(x.phone);
    slots.push({ id, label: s(x.label).slice(0, 40) || LABELS[id] || 'Person', on: x.on !== false, kind, phone: ph.length === 10 ? ph : '', person: s(x.person).slice(0, 120) });
  });
  const sc = v.screen && typeof v.screen === 'object' ? v.screen : {};
  const blocked = []; (Array.isArray(sc.blocked) ? sc.blocked : s(sc.blocked).split(/[\s,;]+/)).forEach(x => { const d = phone10(x); if (d.length === 10 && blocked.indexOf(d) < 0 && blocked.length < 500) blocked.push(d); });
  const screen = { on: sc.on !== false, greeting: s(sc.greeting).slice(0, 600) || GREETING, askWhat: sc.askWhat !== false, whisper: sc.whisper !== false, blocked };
  const em = v.emerg && typeof v.emerg === 'object' ? v.emerg : {};   /* patch EMERGCALL: escalation calls after N minutes */
  const nt = v.night && typeof v.night === 'object' ? v.night : {};   /* patch AFTERHOURS */
  const night = { greeting: s(nt.greeting).slice(0, 600) || NIGHT_GREETING, slots: Array.isArray(nt.slots) ? cleanSlots(nt.slots) : cleanSlots(NIGHT.slots) };
  const out = { on: v.on !== false, ringSeconds: clampInt(v.ringSeconds, 8, 60, 15), slots, screen, hours: cleanHours(v.hours), night, emerg: { on: em.on !== false, minutes: clampInt(em.minutes, 5, 120, 15) } };
  if (s(v.by)) out.by = low(v.by).slice(0, 120);
  if (s(v.at)) out.at = s(v.at).slice(0, 40);
  return out;
}
/* nothing saved yet: Netlify TWILIO_RING_SECONDS (the owner set 20) is the starting ring time; the card's saved value wins after */
function defaults(){ const d = JSON.parse(JSON.stringify(DEFAULTS)); const e = parseInt(process.env.TWILIO_RING_SECONDS, 10); if (isFinite(e)) d.ringSeconds = e; return clean(d); }

function userPhone(u){ return u ? phone10(u.phone || u.cell || u.mobile || u.cellPhone || u.mobilePhone) : ''; }
/* people with a phone, for the Admin picker (active only) */
function peopleWithPhones(users){
  return arr(users).filter(u => u && typeof u === 'object' && s(u.name) && P().isActive(u) && userPhone(u).length === 10)
    .map(u => ({ id: s(u.id) || low(u.email) || s(u.name), name: s(u.name), role: s(u.role || u.title || u.profile), phone: tidy(userPhone(u)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
/* the defaults' names → the person's id, so the picker shows them selected */
function pinPeople(cfg, users){
  if (cfg.night) cfg.night.slots.forEach(x => { if (x.kind === 'person' && x.person) { const u = P().findUser(users, x.person); if (u && s(u.id)) x.person = s(u.id); } });
  cfg.slots.forEach(x => { if (x.kind === 'person' && x.person) { const u = P().findUser(users, x.person); if (u && s(u.id)) x.person = s(u.id); } });
  return cfg;
}

/* one slot → { number, name } or { why } (why it is skipped) */
function slotNumber(x, data){
  if (!x.on) return { why: 'off' };
  const users = arr(data && data.users);
  if (x.kind === 'company') return { number: companyPhone(), name: 'Office line' };
  if (x.kind === 'phone') return x.phone ? { number: x.phone, name: tidy(x.phone) } : { why: 'empty' };
  if (x.kind === 'person') {
    if (!x.person) return { why: 'empty' };
    const u = P().findUser(users, x.person);
    if (!u) return { why: 'person not found' };
    if (!P().isActive(u)) return { why: 'no longer active', name: s(u.name) };
    const ph = userPhone(u); return ph.length === 10 ? { number: ph, name: s(u.name) } : { why: 'no phone on file', name: s(u.name) };
  }
  if (x.kind === 'mitigation') {   /* the mitigation manager: an active person whose role / title says mitigation + manager / lead */
    const u = users.find(y => y && P().isActive(y) && userPhone(y).length === 10 && /mitig/i.test([y.role, y.title, y.profile, y.position, y.jobTitle].map(s).join(' ')) && /manag|lead|supervis|director|chief/i.test([y.role, y.title, y.profile, y.position, y.jobTitle].map(s).join(' ')));
    return u ? { number: userPhone(u), name: s(u.name) } : { why: 'no mitigation manager yet' };
  }
  if (x.kind === 'senior') {
    const u = P().seniorPm(users, data && data.gc_senior_pm);
    if (!u) return { why: 'no Senior PM set' };
    const ph = userPhone(u); return ph.length === 10 ? { number: ph, name: s(u.name) } : { why: 'no phone on file', name: s(u.name) };
  }
  return { why: 'empty' };
}

/* the call's own numbers (Twilio's POST params) */
function callCtx(p, ours){
  p = p || {};
  return { from: phone10(p.From), to: phone10(p.To || p.Called),
    forwarded: [p.ForwardedFrom, p.CalledVia, p.Diversion && (/<?(?:tel|sip):\+?(\d{10,11})/i.exec(s(p.Diversion)) || [])[1]].map(phone10).filter(d => d.length === 10),
    ours: arr(ours).map(phone10).filter(d => d.length === 10) };
}
/* → { list: [{ id, label, number, name, secs }], skipped: [{ id, label, why, name? }] } */
function resolve(cfg, data, ctx){
  cfg = clean(cfg); ctx = ctx || {};
  const list = [], skipped = [], rung = {};
  const office = companyPhone();
  const fwd = arr(ctx.forwarded), ours = arr(ctx.ours).concat(ctx.to ? [ctx.to] : []);
  cfg.slots.forEach(x => {
    const lab = x.label || LABELS[x.id] || x.id, r = slotNumber(x, data);
    if (!r.number) { skipped.push({ id: x.id, label: lab, why: r.why, name: r.name || '' }); return; }
    const n = r.number;
    let why = '';
    if (ctx.from && n === ctx.from) why = 'the caller';
    else if (fwd.indexOf(n) >= 0 || (x.kind === 'company' && fwd.indexOf(office) >= 0)) why = 'the call was forwarded from this line';
    else if (ours.indexOf(n) >= 0) why = 'our own Twilio number';
    else if (rung[n]) why = 'already rung';
    if (why) { skipped.push({ id: x.id, label: lab, why, name: r.name || '' }); return; }
    rung[n] = 1;
    list.push({ id: x.id, label: lab, number: n, name: r.name || '', secs: cfg.ringSeconds });
  });
  return { list, skipped };
}
/* for the Admin card: the order as it would ring now (no caller) */
function preview(cfg, data, ours){
  const r = resolve(cfg, data, { ours });
  const wait = r.list.reduce((a, x) => a + x.secs, 0);
  return { wait, list: r.list.map(x => ({ id: x.id, label: x.label, name: x.name, phone: tidy(x.number), secs: x.secs })), skipped: r.skipped };
}

/* ── patch CALLSCREEN ── */
/* the caller's menu answer: '1' | '2' | '3' | '' (Digits, or what they said) */
function choiceOf(p){
  const d = s(p && p.Digits);
  if (/^[123]$/.test(d)) return d;
  if (d) return '3';   /* any other key: not work, not a customer */
  const t = low(p && p.SpeechResult);
  if (!t) return '';
  if (/\b(one|1)\b/.test(t) || /\b(construction|remodel\w*|roof\w*|repair\w*|water|fire|storm|damage|leak\w*|estimate|quote|build\w*|renovat\w*|mold|flood\w*)\b/.test(t)) return '1';
  if (/\b(two|2)\b/.test(t) || /\b(customer|my job|my project|existing|current)\b/.test(t)) return '2';
  if (/\b(three|3)\b/.test(t) || /\b(sales?|sell\w*|offer|marketing|seo|partner\w*|vendor|anything else|other)\b/.test(t)) return '3';
  return '';
}
/* STIR/SHAKEN: Twilio's StirVerstat says the caller ID failed validation */
function attestationFailed(p){ return /failed/i.test(s(p && p.StirVerstat)); }
function isBlocked(cfg, from){ const d = phone10(from); return !!d && arr(cfg && cfg.screen && cfg.screen.blocked).indexOf(d) >= 0; }

module.exports = { isOpen, wall, cleanHours, NIGHT_GREETING, DAYS, KEY, LOG_KEY, GREETING, SCREEN, choiceOf, attestationFailed, isBlocked, MAX_SLOTS, SLOT_IDS, LABELS, KINDS, DEFAULTS, clean, defaults, pinPeople, peopleWithPhones, userPhone, slotNumber, callCtx, resolve, preview, companyPhone, phone10, tidy };
