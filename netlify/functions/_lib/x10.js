/* ============================================================================
   GrayCo — patch X10 shared logic (no network here; the functions pass their own storage / mail helpers in).
     · 📟 on-call rotation for after-hours emergencies (Mitigation): who is on call, after hours or not,
       is this lead an emergency, the paging chain (the on-call person → the next person … → all admins)
     · 💵 monthly customer statements (open balances across a customer's jobs, 60+ days → a call)
     · 🚚 vehicles & gas (reminders: oil / service by miles or date, registration and insurance expiring)
     · 🎯 company goal (yearly revenue goal → monthly pace)
     · 📊 "My data" numbers per person (jobs, billed, collected, leads, close rate)
   Everything goes by role / the rotation list / the job's PM — never a hard-coded person.
   ========================================================================== */
'use strict';
const TZ = 'America/Chicago';
const DAY = 864e5;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function r2(n){ return Math.round(num(n) * 100) / 100; }
function okEmail(e){ return /^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/i.test(s(e)); }

/* ── Central wall clock ── */
function wall(t){
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
    .formatToParts(new Date(t)).forEach(function(x){ p[x.type] = x.value; });
  const hh = p.hour === '24' ? '00' : p.hour;
  return { day: p.year + '-' + p.month + '-' + p.day, hm: hh + ':' + p.minute, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
function dayNum(ymd){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(ymd)); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : NaN; }
function addDays(ymd, n){ const d = dayNum(ymd); return isFinite(d) ? new Date((d + n) * DAY).toISOString().slice(0, 10) : ''; }

/* ══ 📟 ON CALL ═══════════════════════════════════════════════════════════════ */
const ONCALL_DEFAULT = { rotation: [], startDate: '', hours: { start: '07:00', end: '18:00' }, weekends: true, holidays: [], escalateMin: 10, on: true };
function oncallCfg(v){
  const c = Object.assign({}, ONCALL_DEFAULT, v && typeof v === 'object' ? v : {});
  c.rotation = arr(c.rotation).map(function(p){ return { email: low(p.email), name: s(p.name).slice(0, 80), phone: s(p.phone).replace(/[^\d]/g, '').slice(-10) }; }).filter(function(p){ return okEmail(p.email); }).slice(0, 20);
  const h = c.hours && typeof c.hours === 'object' ? c.hours : {};
  c.hours = { start: /^\d{2}:\d{2}$/.test(s(h.start)) ? s(h.start) : '07:00', end: /^\d{2}:\d{2}$/.test(s(h.end)) ? s(h.end) : '18:00' };
  c.holidays = (Array.isArray(c.holidays) ? c.holidays : []).map(s).filter(function(d){ return /^\d{4}-\d{2}-\d{2}$/.test(d); }).slice(0, 40);
  c.escalateMin = Math.max(5, Math.min(60, Math.round(num(c.escalateMin) || 10)));
  c.startDate = /^\d{4}-\d{2}-\d{2}$/.test(s(c.startDate)) ? s(c.startDate) : '';
  c.weekends = c.weekends !== false; c.on = c.on !== false;
  return c;
}
/* after hours: before the start / after the end of the work day, weekends (unless turned off), holidays */
function afterHours(t, cfg){
  cfg = oncallCfg(cfg); const w = wall(t);
  if (cfg.holidays.indexOf(w.day) >= 0) return true;
  if (cfg.weekends && (w.dow === 0 || w.dow === 6)) return true;
  return w.hm < cfg.hours.start || w.hm >= cfg.hours.end;
}
/* the week's on-call person: the rotation turns every Monday (Central), counted from startDate (or the first Monday of 2026) */
function onCallIndex(t, cfg){
  cfg = oncallCfg(cfg); const n = cfg.rotation.length; if (!n) return -1;
  const w = wall(t), today = dayNum(w.day), monday = today - ((w.dow + 6) % 7);
  let start = dayNum(cfg.startDate || '2026-01-05'); if (!isFinite(start)) start = dayNum('2026-01-05');
  start = start - ((new Date(start * DAY).getUTCDay() + 6) % 7);   /* the Monday of the start week */
  const weeks = Math.floor((monday - start) / 7);
  return ((weeks % n) + n) % n;
}
function onCallNow(t, cfg){ cfg = oncallCfg(cfg); const i = onCallIndex(t, cfg); return i < 0 ? null : cfg.rotation[i]; }
/* the paging chain: this week's person first, then the others in rotation order */
function chain(t, cfg, activeEmails){
  cfg = oncallCfg(cfg); const i = onCallIndex(t, cfg); if (i < 0) return [];
  const act = activeEmails ? activeEmails.map(low) : null;
  const out = [];
  for (let k = 0; k < cfg.rotation.length; k++) { const p = cfg.rotation[(i + k) % cfg.rotation.length]; if (!act || act.indexOf(p.email) >= 0) out.push(p); }
  return out;
}
const EMERG = /(emergenc|\b24\s*\/\s*7\b|water\s*damage|water\s*in\s*(my|the)|flood|burst|broken\s*pipe|pipe\s*(burst|broke|leak)|sewage|sewer\s*back|standing\s*water|active\s*leak|leaking\s*(now|into|through)|ceiling\s*(is\s*)?(leak|fall|collaps|drip)|\bfire\b|smoke\s*damage|\bmitigation\b|water\s*mitigation|tree\s*(fell|on\s*(my|the)\s*(roof|house)))/i;
function isEmergency(it){
  if (!it) return false;
  if (it.emergency === true || /^emergency$/i.test(s(it.type)) || /^emergency$/i.test(s(it.websiteForm))) return true;
  if (/commercial|government/i.test(s(it.type || it.leadKind)) && !/emergenc/i.test(s(it.title) + ' ' + s(it.detail))) return false;   /* a bid invitation mentioning "fire station" is not an emergency */
  const c = it.contact && typeof it.contact === 'object' ? it.contact : {};
  const txt = [it.type, it.title, it.detail, it.websiteForm, it.form, it.service, it.message, it.notes, it.source, c.message].map(s).join(' ');
  if (/fire\s*station|fire\s*dept|fire\s*department|firehouse|fire\s*alarm\s*(system|contract)/i.test(txt) && !/emergenc|smoke\s*damage|house\s*fire|fire\s*damage/i.test(txt)) return false;
  return EMERG.test(txt);
}
/* one page: who has it now, what is due next (dueStep) — pure, the scheduler acts on it */
function pageNext(pg, t, cfg){
  cfg = oncallCfg(cfg);
  if (!pg || pg.acceptedAt || pg.done) return null;
  const last = Date.parse(pg.lastSentAt || pg.createdAt || 0); if (!isFinite(last)) return null;
  if (t - last < cfg.escalateMin * 60e3) return null;
  const next = (pg.step || 0) + 1;
  if (next < arr(pg.chain).length) return { step: next, to: [pg.chain[next]], admins: false };
  if (!pg.adminsAt) return { step: next, to: [], admins: true };
  return null;
}

/* ══ 💵 MONTHLY CUSTOMER STATEMENTS ══════════════════════════════════════════ */
/* invoices: the CRM's customer invoices with { pid, number, date, amount, paid, balance }; grouped by the customer
   (their e-mail when there is one, else the job) → one statement each; ages from the invoice date */
function statements(rows, today){
  const by = {};
  rows.forEach(function(r){
    if (!(r.balance > 0.01)) return;
    const key = okEmail(r.email) ? 'e:' + low(r.email) : 'p:' + s(r.pid);
    const g = by[key] = by[key] || { key: key, email: okEmail(r.email) ? low(r.email) : '', name: s(r.name), pids: [], lines: [], balance: 0, over60: 0, oldestDays: 0, lastPid: '', lastDate: '' };
    const age = Math.max(0, dayNum(today) - dayNum(s(r.date).slice(0, 10))) || 0;
    g.lines.push({ pid: s(r.pid), job: s(r.job), number: s(r.number), date: s(r.date).slice(0, 10), amount: r2(r.amount), paid: r2(r.paid), balance: r2(r.balance), age: age });
    g.balance = r2(g.balance + r.balance); if (age > 60) g.over60 = r2(g.over60 + r.balance);
    if (age > g.oldestDays) g.oldestDays = age;
    if (g.pids.indexOf(s(r.pid)) < 0) g.pids.push(s(r.pid));
    if (s(r.date) >= g.lastDate) { g.lastDate = s(r.date); g.lastPid = s(r.pid); }
    if (!g.name && r.name) g.name = s(r.name);
  });
  return Object.keys(by).map(function(k){ const g = by[k]; g.lines.sort(function(a, b){ return a.date < b.date ? -1 : 1; }); return g; });
}
function bucket(age){ return age > 90 ? '90+' : age > 60 ? '61–90' : age > 30 ? '31–60' : '0–30'; }

/* ══ 🚚 VEHICLES & GAS ═══════════════════════════════════════════════════════ */
function vehicleClean(v){
  v = v && typeof v === 'object' ? v : {};
  const o = { id: s(v.id).slice(0, 60), name: s(v.name).slice(0, 80), plate: s(v.plate).slice(0, 20), vin: s(v.vin).slice(0, 25), driver: low(v.driver).slice(0, 120), driverName: s(v.driverName).slice(0, 80),
    kind: /^(truck|card|allowance)$/.test(s(v.kind)) ? s(v.kind) : 'truck',
    miles: Math.max(0, Math.round(num(v.miles))), oilEvery: Math.max(0, Math.round(num(v.oilEvery) || 5000)), oilAtMiles: Math.max(0, Math.round(num(v.oilAtMiles))), oilDate: dt(v.oilDate),
    serviceEveryMonths: Math.max(0, Math.round(num(v.serviceEveryMonths) || 6)), regExp: dt(v.regExp), insExp: dt(v.insExp), gasAllowance: r2(v.gasAllowance), notes: s(v.notes).slice(0, 400),
    retired: v.retired === true };
  return o;
  function dt(x){ x = s(x).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : ''; }
}
/* what each vehicle needs: oil by miles (within 300 mi) or by months since the last one; registration / insurance within 30 days */
function vehicleDue(v, today){
  v = vehicleClean(v); const out = []; if (v.retired) return out;
  if (v.oilEvery && v.miles && v.oilAtMiles >= 0 && v.miles - v.oilAtMiles >= v.oilEvery - 300) out.push({ k: 'oil', label: 'Oil change due (' + (v.miles - v.oilAtMiles).toLocaleString('en-US') + ' mi since the last one)', over: v.miles - v.oilAtMiles >= v.oilEvery });
  else if (v.oilDate && v.serviceEveryMonths && dayNum(today) - dayNum(v.oilDate) >= v.serviceEveryMonths * 30 - 7) out.push({ k: 'oil', label: 'Oil / service due (last ' + v.oilDate + ')', over: dayNum(today) - dayNum(v.oilDate) >= v.serviceEveryMonths * 30 });
  [['reg', 'regExp', 'Registration'], ['ins', 'insExp', 'Insurance card']].forEach(function(x){
    const d = v[x[1]]; if (!d) return; const left = dayNum(d) - dayNum(today);
    if (left <= 30) out.push({ k: x[0], label: x[2] + (left < 0 ? ' EXPIRED ' + d : ' expires ' + d + ' (' + left + ' days)'), over: left < 0 });
  });
  return out;
}
/* gas per person per month: gas entries (manual / gas card) + the receipts the CRM read (AUTAI) */
function gasByPerson(entries, month){
  const by = {};
  arr(entries).forEach(function(g){ if (g.deleted || s(g.date).slice(0, 7) !== month) return; const k = low(g.driver) || 'unassigned'; by[k] = r2((by[k] || 0) + num(g.amount)); });
  return by;
}

/* ══ 🎯 COMPANY GOAL ═════════════════════════════════════════════════════════ */
/* goal = the yearly revenue goal; revenueByMonth = { 'YYYY-MM': $ } this year (collected or billed — the setting says) */
function goalPace(goal, revenueByMonth, today){
  goal = r2(goal); const y = s(today).slice(0, 4), m = +s(today).slice(5, 7);
  let ytd = 0; for (let i = 1; i <= m; i++) ytd += num(revenueByMonth[y + '-' + String(i).padStart(2, '0')]);
  ytd = r2(ytd);
  const d = +s(today).slice(8, 10), dim = new Date(Date.UTC(+y, m, 0)).getUTCDate();
  const yearFrac = ((m - 1) + d / dim) / 12;
  const shouldBe = r2(goal * yearFrac), left = r2(Math.max(0, goal - ytd)), monthsLeft = Math.max(1, 12 - (m - 1) - d / dim);
  return { goal: goal, ytd: ytd, pct: goal > 0 ? Math.round(ytd / goal * 1000) / 10 : 0, shouldBe: shouldBe, ahead: r2(ytd - shouldBe), onPace: ytd >= shouldBe,
    neededPerMonth: r2(left / monthsLeft), thisMonth: r2(revenueByMonth[s(today).slice(0, 7)] || 0), monthGoal: r2(goal / 12) };
}

/* ══ 📊 MY DATA (the server's part: jobs, billed, collected, leads) ═════════ */
function personNumbers(email, name, data, month, h){
  email = low(email); name = low(name);
  const mine = function(p){ return (name && (low(p.pm) === name || low(p.apm) === name || low(p.superintendent || p.super) === name || low(p.estimator) === name)) || (email && (low(p.pmEmail) === email || low(p.apmEmail) === email)); };
  const jobs = arr(data.projects).filter(function(p){ return p && p.id && p.deleted !== true && mine(p); });
  const open = jobs.filter(function(p){ return !/complete|closed|cancel|lost|archived/i.test(s(p.status)); });
  const ids = {}; jobs.forEach(function(p){ ids[s(p.id)] = 1; });
  let billed = 0, collected = 0, billedMonth = 0, collectedMonth = 0;
  (h.invoices(data) || []).forEach(function(iv){
    const pid = s(iv.projectId || iv.pid || iv.jobId || iv.project_id); if (!ids[pid]) return;
    const amt = h.invAmount(iv), paid = Math.max(0, amt - h.invBalance(iv)); billed += amt; collected += paid;
    if (s(iv.date || iv.sentDate || iv.created).slice(0, 7) === month) billedMonth += amt;
    arr(iv.payments).forEach(function(p){ if (s(p.date || p.paidDate).slice(0, 7) === month) collectedMonth += num(p.amt || p.amount); });
  });
  const leads = arr(data.leads).filter(function(l){ return l && !l.deleted && name && (low(l.pm) === name || low(l.estimator) === name || low(l.assignedTo) === name); });
  const won = leads.filter(function(l){ return /won|converted|sold/i.test(s(l.stage || l.status || l.bidStatus)); }).length;
  const lost = leads.filter(function(l){ return /lost|dead|declined/i.test(s(l.stage || l.status || l.bidStatus)); }).length;
  return { jobs: jobs.length, openJobs: open.length, billed: r2(billed), collected: r2(collected), billedMonth: r2(billedMonth), collectedMonth: r2(collectedMonth),
    leads: leads.length, won: won, lost: lost, closeRate: won + lost ? Math.round(won / (won + lost) * 100) : null };
}

/* ══ 🔐 ACCESS CODES: who may see them ═══════════════════════════════════════ */
function onJobTeam(p, email, name){
  email = low(email); name = low(name); if (!p) return false;
  const names = [p.pm, p.apm, p.assistantPm, p.superintendent, p.super, p.fieldSuper].map(low).filter(Boolean);
  const emails = [p.pmEmail, p.apmEmail, p.superEmail, p.superintendentEmail].map(low).filter(Boolean);
  return (!!name && names.indexOf(name) >= 0) || (!!email && emails.indexOf(email) >= 0);
}
function jobClosed(p){ return !!p && (p.deleted === true || p.archived === true || p.closedAt && /complete|closed|archiv/i.test(s(p.status)) || /^(closed|archived|cancell?ed|lost)$/i.test(s(p.status)) || /^complete(d)?$/i.test(s(p.status)) && !!s(p.closedAt || p.completedAt)); }

/* ══ 📋 PERMIT & INSPECTION TEMPLATES (per city; admin-editable; checklists only — no legal claims) ══ */
const INSP_STEPS = [
  ['permit', 'Apply for the permit (check the city’s current requirements)'], ['approved', 'Permit approved — card posted on site'],
  ['footing', 'Footing / foundation inspection (if structural work)'], ['rough', 'Framing / rough-in inspection (electrical, plumbing, mechanical as needed)'],
  ['roofdeck', 'Roof deck / underlayment inspection (only if the city asks for it)'], ['insul', 'Insulation inspection (if new walls / ceilings)'],
  ['final', 'Final inspection'], ['closed', 'Permit closed / certificate received — copy filed on the job']
];
const CITIES = { 'Bartlett': 'City of Bartlett', 'Memphis / Shelby County': 'Memphis & Shelby County Division of Planning and Development', 'Germantown': 'City of Germantown',
  'Collierville': 'Town of Collierville', 'Arlington': 'Town of Arlington', 'Lakeland': 'City of Lakeland', 'Millington': 'City of Millington', 'Southaven / DeSoto County': 'City of Southaven / DeSoto County' };
function inspTemplates(v){
  v = v && typeof v === 'object' ? v : {};
  const cities = {};
  Object.keys(CITIES).forEach(function(c){ const sv = v.cities && v.cities[c]; cities[c] = { office: s(sv && sv.office) || CITIES[c], phone: s(sv && sv.phone).slice(0, 30), steps: (sv && Array.isArray(sv.steps) && sv.steps.length ? sv.steps : INSP_STEPS.map(function(x){ return { id: x[0], label: x[1] }; })).map(function(x){ return { id: s(x.id || x[0]).slice(0, 30), label: s(x.label || x[1]).slice(0, 160) }; }).filter(function(x){ return x.id && x.label; }).slice(0, 20) }; });
  if (v.cities) Object.keys(v.cities).forEach(function(c){ if (!cities[c] && s(c).length < 60) { const sv = v.cities[c]; cities[c] = { office: s(sv.office).slice(0, 120), phone: s(sv.phone).slice(0, 30), steps: arr(sv.steps).map(function(x){ return { id: s(x.id).slice(0, 30), label: s(x.label).slice(0, 160) }; }).filter(function(x){ return x.id && x.label; }).slice(0, 20) }; } });
  const needs = s(v.needs) || 'roof|reroof|remodel|renovat|addition|new\\s*constr|kitchen|bath|deck|structural|rebuild|fire|framing|electrical|plumb|hvac|siding|window';
  return { cities: cities, needs: needs, updatedAt: s(v.updatedAt) };
}
function cityOf(addr){
  const a = low(addr);
  if (/bartlett/.test(a)) return 'Bartlett'; if (/germantown/.test(a)) return 'Germantown'; if (/collierville/.test(a)) return 'Collierville'; if (/arlington/.test(a)) return 'Arlington';
  if (/lakeland/.test(a)) return 'Lakeland'; if (/millington/.test(a)) return 'Millington'; if (/southaven|olive branch|horn lake|hernando|desoto|,\s*ms\b/.test(a)) return 'Southaven / DeSoto County';
  if (/memphis|cordova|shelby|eads|\btn\b/.test(a)) return 'Memphis / Shelby County';
  return '';
}
function needsPermit(p, tpl){ let re; try { re = new RegExp(tpl.needs, 'i'); } catch (e) { re = /roof|remodel|addition/i; } return re.test([p.type, p.jobType, p.category, p.scope, p.name].map(s).join(' ')) && !/repair\s*only|mitigation\s*only|gutter\s*only|paint\s*only/i.test(s(p.type) + ' ' + s(p.jobType)); }
function inspFor(p, tpl, city){
  const c = city && tpl.cities[city] ? city : cityOf(p.address || p.jobAddress || p.city);
  const t = tpl.cities[c] || tpl.cities['Memphis / Shelby County'];
  return { city: c || 'Memphis / Shelby County', office: t.office, phone: t.phone, needed: needsPermit(p, tpl), steps: t.steps.map(function(x){ return { id: x.id, label: x.label, done: false, date: '', result: '', notes: '' }; }) };
}

module.exports = { TZ, wall, dayNum, addDays, oncallCfg, afterHours, onCallIndex, onCallNow, chain, isEmergency, pageNext, EMERG,
  statements, bucket, onJobTeam, jobClosed, inspTemplates, inspFor, cityOf, needsPermit, CITIES, vehicleClean, vehicleDue, gasByPerson, goalPace, personNumbers, okEmail, r2, num, s, low, arr };
