/* netlify/functions/_lib/envcomp.js — ENVCOMP: environmental compliance on the server.
   The rules and checks are in /envcomp-core.js (the same file the CRM page loads).

   MEDICAL & EXPOSURE RECORDS (owner 11/16: "doctor visits taken down here and the dates we are scheduled for next blood test";
   "exposure assessment, air monitoring, blood testing, medical exams and results have to be shown to the employee"; medical removal
   with pay protection). They live in the database table gc_medical (docs/envcomp-medical.sql: Row Level Security on and NO rules →
   no browser can read or write it, not even an admin's; only these server functions, with the service key). Who sees what:
     • the worker: their OWN records (op 'mine'), and opening them stamps "seen" on every new result (the company's proof);
     • admins and the Office Manager (gc_staff.payroll = true — the payroll grant): everyone's (ops 'person', 'all', 'removals');
     • everyone else: only gc_kv gc_medical_status = per person { byKind: current / due / over / none, fit, med, removed } — never a
       date, a test name or a result (publicStatus in envcomp-core.js).
   Notifications never carry a value: "A new air monitoring result was added to your records", "Your blood lead + ZPP test is due 12/3".
   store = { v: 1, people: { email: { name, visits: [], exposures: [], removals: [], due: { key: date }, appts: [], notices: [], opened: [] } } }

   medOp(who, body, deps) → { code, out }   who = { email, name, priv }
   run(data, deps) → the daily reminders (gc-portal-daily): medical 30 / 14 / 3 days + overdue (worker + admins / Office Manager), the end
     of a medical removal's protected pay period, the worker's own certifications 90 / 60 / 30 days + expired (the admins already get
     📜 Certifications' own reminders), and job notices / clearance due (admins + office + the job's PM). Each step once. */
'use strict';
const C = require('../../../envcomp-core.js');
const K_RULES = 'gc_envcomp_rules', K_STATUS = 'gc_medical_status', K_STATE = 'gc_envcomp_state';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n) : t; }
function ymd(v){ const t = s(v); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function uid(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function md(d){ d = ymd(d); return d ? (+d.slice(5, 7)) + '/' + (+d.slice(8, 10)) : ''; }
const T = { now: null };
function nowMs(){ return T.now ? T.now() : Date.now(); }
function nowIso(){ return new Date(nowMs()).toISOString(); }
function today(){ const d = new Date(nowMs() - 6 * 3600e3); return d.toISOString().slice(0, 10); }   /* Central time, near enough for a daily run */

/* ── the real connections (tests pass their own deps) ── */
function sbUrl(){ return (process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function svcHeaders(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
function realDeps(){
  let LIB = null, CORE = null;
  const lib = function(){ if (!LIB) LIB = require('../bid-inbox.js')._lib; return LIB; };
  const core = function(){ if (!CORE) CORE = require('../portal.js')._core; return CORE; };
  return {
    medGet: async function(){
      if (!svcKey()) throw new Error('The server key is not set — medical records cannot be read.');
      const r = await fetch(sbUrl() + '/rest/v1/gc_medical?select=value&key=eq.all', { headers: svcHeaders() });
      if (!r.ok) throw new Error(r.status === 404 ? 'Run docs/envcomp-medical.sql in Supabase first (the private medical table is missing).' : 'gc_medical read answered ' + r.status);
      const rows = await r.json(); return rows && rows[0] ? obj(rows[0].value) : {};
    },
    medPut: async function(v){
      const r = await fetch(sbUrl() + '/rest/v1/gc_medical?on_conflict=key', { method: 'POST', headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: 'all', value: v, updated_at: nowIso() }) });
      if (!r.ok) throw new Error(r.status === 404 ? 'Run docs/envcomp-medical.sql in Supabase first.' : 'gc_medical write answered ' + r.status);
    },
    kvGet: function(k){ return lib().kvGet(k); },
    kvPut: function(k, v){ return lib().kvCas(k, function(){ return v; }); },
    kvCas: function(k, fn){ return lib().kvCas(k, fn); },
    mail: async function(to, subject, html){
      to = Array.from(new Set(arr(to).map(low).filter(okEmail))); if (!to.length) return { ok: false };
      const key = s(process.env.RESEND_API_KEY); if (!key) return { ok: false, skipped: true };
      try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: to, subject: subject, html: '<div style="font-family:Arial,sans-serif;max-width:600px;color:#14202E;font-size:15px;line-height:1.55">' + html + '</div>', headers: { 'X-GrayCo-CRM': 'envcomp' } }) }); return { ok: r.ok }; } catch (e) { return { ok: false }; }
    },
    todo: async function(item){
      const id = s(item.id), at = nowIso(), it = Object.assign({ addedBy: 'GrayCo CRM', addedAt: at, updatedAt: at, done: false }, item);
      const has = function(l){ return l.some(function(t){ return t && s(t.id) === id; }); };
      try { const r = await core().kvListUpdate('gc_office_tasks', function(l){ return has(l) ? null : { list: l.concat([it]), check: has }; }); return !!r.ok; } catch (e) { return false; }
    },
    todoDone: async function(ids){
      if (!arr(ids).length) return false; const at = nowIso();
      try { const r = await core().kvListUpdate('gc_office_tasks', function(l){ let ch = false; const out = l.map(function(t){ if (t && ids.indexOf(s(t.id)) >= 0 && !t.done) { ch = true; return Object.assign({}, t, { done: true, doneAt: at, updatedAt: at, resolution: 'seen' }); } return t; }); return ch ? { list: out, check: function(){ return true; } } : null; }); return !!r.ok; } catch (e) { return false; }
    },
    payrollEmails: async function(){
      if (!svcKey()) return [];
      try { const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=email,active,payroll&payroll=eq.true', { headers: svcHeaders() }); if (!r.ok) return []; return arr(await r.json()).filter(function(x){ return x && x.active !== false; }).map(function(x){ return low(x.email); }); } catch (e) { return []; }
    }
  };
}
async function privEmails(data, deps){
  const users = arr(data && data.users).filter(function(u){ return u && u.active !== false && okEmail(u.email); });
  const admins = users.filter(function(u){ return /^(admin|administrator|owner)/i.test(s(u.role)) || low(u.payType) === 'owner'; }).map(function(u){ return low(u.email); });
  let pay = []; try { pay = arr(deps.payrollEmails ? await deps.payrollEmails() : []); } catch (e) {}
  return Array.from(new Set(admins.concat(pay).filter(okEmail)));
}
function kv(deps, k){ return Promise.resolve().then(function(){ return deps.kvGet(k); }).catch(function(){ return null; }); }
async function rulesOf(deps){ return C.rules(obj(await kv(deps, K_RULES))); }

/* ── the store ── */
function person(store, email, name){
  store.people = obj(store.people); const k = low(email);
  const p = store.people[k] = Object.assign({ name: '', visits: [], exposures: [], removals: [], due: {}, appts: [], notices: [], opened: [] }, obj(store.people[k]));
  if (name && !p.name) p.name = clip(name, 120);
  return p;
}
const WHAT = { exposure: 'air monitoring result', area: 'air monitoring result for your job', visit: 'medical record', fit: 'respirator fit test result', bloodLead: 'blood test result', removal: 'medical removal record', opinion: 'written medical opinion' };
function noticeWhat(cat, rec){ if (cat === 'exposure') return rec.scope === 'area' ? WHAT.area : WHAT.exposure; if (cat === 'removal') return WHAT.removal; return WHAT[s(rec.type)] || (/exam|physical|pft|clear/i.test(s(rec.type)) ? 'medical exam result' : WHAT.visit); }
function cleanFile(f){ f = obj(f); return s(f.ref) ? { ref: clip(f.ref, 300), name: clip(f.name, 160) } : null; }
function cleanVisit(r){ return { id: s(r.id) || uid('MV'), date: ymd(r.date), type: clip(r.type, 40) || 'other', provider: clip(r.provider, 160), summary: clip(r.summary, 2000), result: clip(r.result, 200), fit: r.fit ? { model: clip(obj(r.fit).model, 80), size: clip(obj(r.fit).size, 20), method: clip(obj(r.fit).method, 60), result: clip(obj(r.fit).result, 40) } : undefined, file: cleanFile(r.file) }; }
function cleanExposure(r){ return { id: s(r.id) || uid('EX'), date: ymd(r.date), pid: clip(r.pid, 80), job: clip(r.job, 160), task: clip(r.task, 200), scope: r.scope === 'area' ? 'area' : 'personal', atype: clip(r.atype, 60), method: clip(r.method, 80), result: clip(r.result, 80), unit: clip(r.unit, 30), al: clip(r.al, 60), pel: clip(r.pel, 60), cmp: clip(r.cmp, 80), pass: clip(r.pass, 30), lab: clip(r.lab, 120), sampler: clip(r.sampler, 120), sampleId: clip(r.sampleId, 80), file: cleanFile(r.file) }; }
function cleanRemoval(r){ return { id: s(r.id) || uid('RM'), start: ymd(r.start), end: ymd(r.end), reason: clip(r.reason, 400), criteria: clip(r.criteria, 600), basis: /^(average|normal|set)$/.test(s(r.basis)) ? s(r.basis) : '', avgWeeks: +r.avgWeeks || undefined, weekly: +r.weekly || undefined, weeklyHours: +r.weeklyHours || undefined, wcWeekly: +r.wcWeekly || 0, maxMonths: +r.maxMonths || undefined, file: cleanFile(r.file), clearance: cleanFile(r.clearance) }; }
function view(rec, R, t){
  rec = obj(rec);
  const rm = C.activeRemoval(rec, t, R);
  return { name: s(rec.name), visits: arr(rec.visits).filter(function(v){ return !v.deleted; }), exposures: arr(rec.exposures).filter(function(v){ return !v.deleted; }), removals: arr(rec.removals).filter(function(v){ return !v.deleted; }).map(function(r){ return Object.assign({}, r, { protectEnd: C.addMonths(r.start, +r.maxMonths || +R.removal.maxMonths || 18) }); }),
    appts: arr(rec.appts), notices: arr(rec.notices), opened: arr(rec.opened).slice(-20), due: obj(rec.due), summary: C.medSummary(rec, R, t), removal: rm, visitTypes: R.visitTypes, removalNote: s(R.removal.note) };
}
async function publish(store, R, deps){
  const t = today(), people = {};
  Object.keys(obj(store.people)).forEach(function(e){ const p = store.people[e]; people[e] = Object.assign({ name: s(p.name) }, C.publicStatus(p, R, t)); });
  const v = { at: nowIso(), people: people };
  try { await deps.kvPut(K_STATUS, v); } catch (e) {}
  return v;
}
async function notify(deps, email, name, what, noticeId){
  const subj = '🩺 A new ' + what + ' was added to your records';
  const html = '<p>Hi ' + esc(s(name).split(' ')[0] || 'there') + ',</p><p>A new ' + esc(what) + ' was added to your health &amp; exposure records on ' + esc(md(today())) + '.</p><p>Open the GrayCo CRM → <b>🩺 My health &amp; exposure records</b> to see it (GrayCo Field: the 🩺 button on Home).</p>';
  try { if (okEmail(email)) await deps.mail([email], subj, html); } catch (e) {}
  try { await deps.todo({ id: 'ECMED_N_' + noticeId, kind: 'envcomp_med', assignees: [low(email)], assignee: s(name), personal: true, shared: false, prio: 'high', label: subj + ' — open 🩺 My health & exposure records', note: 'Only you, the admins and the Office Manager can see your records.' }); } catch (e) {}
}

/* ── the operations ── */
async function medOp(who, body, deps){
  deps = deps || realDeps(); body = obj(body); who = obj(who);
  const op = s(body.op), me = low(who.email), priv = !!who.priv, t = today();
  if (!me) return { code: 401, out: { ok: false, error: 'Sign in first.' } };
  const R = await rulesOf(deps);
  if (op === 'status') { const v = await kv(deps, K_STATUS); return { code: 200, out: { ok: true, status: obj(v) } }; }
  let store;
  try { store = obj(await deps.medGet()); } catch (e) { return { code: 503, out: { ok: false, error: String(e && e.message || e) } }; }
  store.people = obj(store.people);
  const save = async function(){ store.v = 1; store.updatedAt = nowIso(); await deps.medPut(store); await publish(store, R, deps); };
  if (op === 'mine') {
    const rec = store.people[me]; if (!rec) return { code: 200, out: { ok: true, rec: view({}, R, t), mine: true } };
    let stamped = [];
    if (body.open) {
      const at = nowIso();
      arr(rec.notices).forEach(function(n){ if (!n.seenAt) { n.seenAt = at; stamped.push(n.id); } });
      rec.opened = arr(rec.opened).concat([{ at: at, via: clip(body.via, 20) }]).slice(-200);
      await save();
      if (stamped.length) { try { await deps.todoDone(stamped.map(function(id){ return 'ECMED_N_' + id; })); } catch (e) {} }
    }
    return { code: 200, out: { ok: true, rec: view(rec, R, t), mine: true, stamped: stamped.length, seenAt: body.open ? arr(rec.opened).slice(-1)[0].at : '' } };
  }
  if (op === 'person') { if (!priv) return { code: 403, out: { ok: false, error: 'Only the worker, the admins and the Office Manager see medical records.' } }; return { code: 200, out: { ok: true, rec: view(store.people[low(body.email)], R, t) } }; }
  if (op === 'all') {
    if (!priv) return { code: 403, out: { ok: false, error: 'Admins and the Office Manager only.' } };
    const out = {};
    Object.keys(store.people).forEach(function(e){ const p = store.people[e]; out[e] = { name: s(p.name), unseen: arr(p.notices).filter(function(n){ return !n.seenAt; }).map(function(n){ return { id: n.id, what: n.what, at: n.at }; }), notices: arr(p.notices).slice(-30), lastOpened: (arr(p.opened).slice(-1)[0] || {}).at || '', summary: C.medSummary(p, R, t), removal: C.activeRemoval(p, t, R) }; });
    return { code: 200, out: { ok: true, people: out } };
  }
  if (op === 'removals') {
    if (!priv) return { code: 403, out: { ok: false, error: 'Admins and the Office Manager only.' } };
    const L = []; Object.keys(store.people).forEach(function(e){ arr(store.people[e].removals).forEach(function(r){ if (r && !r.deleted && ymd(r.start)) L.push(Object.assign({ email: e, name: s(store.people[e].name) }, r)); }); });
    return { code: 200, out: { ok: true, removals: L, rules: R.removal } };
  }
  if (op === 'add') {
    const email = low(body.email || me), cat = s(body.cat), rec0 = obj(body.rec);
    if (!okEmail(email) && email.indexOf('@') < 0) return { code: 400, out: { ok: false, error: 'Which worker? (their e-mail)' } };
    const self = email === me;
    if (cat === 'exposure') { /* any staff may ADD an exposure result (the person taking the sample); nobody but the worker / admins / Office Manager reads it */ }
    else if (cat === 'visit') { if (!priv && !self) return { code: 403, out: { ok: false, error: 'Only the worker, the admins and the Office Manager add medical records.' } }; }
    else if (cat === 'removal') { if (!priv) return { code: 403, out: { ok: false, error: 'Admins and the Office Manager only.' } }; }
    else return { code: 400, out: { ok: false, error: 'Unknown record.' } };
    const P = person(store, email, body.name);
    const rec = cat === 'exposure' ? cleanExposure(rec0) : cat === 'visit' ? cleanVisit(rec0) : cleanRemoval(rec0);
    if (cat === 'removal' ? !rec.start : !rec.date) return { code: 400, out: { ok: false, error: 'The date is needed.' } };
    rec.by = clip(who.name || me, 120); rec.at = nowIso();
    if (cat === 'removal') P.removals = arr(P.removals).concat([rec]); else if (cat === 'visit') P.visits = arr(P.visits).concat([rec]); else P.exposures = arr(P.exposures).concat([rec]);
    let n = null;
    if (!(cat === 'visit' && self && !priv)) { n = { id: uid('N'), cat: cat, refId: rec.id, what: noticeWhat(cat, rec), at: nowIso(), by: rec.by, seenAt: '' }; P.notices = arr(P.notices).concat([n]); }
    await save();
    if (n) await notify(deps, email, P.name, n.what, n.id);
    return { code: 200, out: { ok: true, id: rec.id, notice: n ? n.id : '' } };
  }
  if (op === 'update') {
    if (!priv) return { code: 403, out: { ok: false, error: 'Admins and the Office Manager only.' } };
    const P = store.people[low(body.email)]; if (!P) return { code: 404, out: { ok: false, error: 'No records for that worker.' } };
    const cat = s(body.cat), L = cat === 'removal' ? P.removals : cat === 'visit' ? P.visits : P.exposures, r = arr(L).find(function(x){ return x && x.id === s(body.id); });
    if (!r) return { code: 404, out: { ok: false, error: 'No such record.' } };
    const pt = obj(body.patch), clean = cat === 'removal' ? cleanRemoval(Object.assign({}, r, pt)) : cat === 'visit' ? cleanVisit(Object.assign({}, r, pt)) : cleanExposure(Object.assign({}, r, pt));
    const prev = {}; Object.keys(clean).forEach(function(k){ if (k !== 'id' && clean[k] !== undefined && JSON.stringify(r[k]) !== JSON.stringify(clean[k])) prev[k] = r[k] === undefined ? null : r[k]; });
    Object.keys(clean).forEach(function(k){ if (k !== 'id' && clean[k] !== undefined) r[k] = clean[k]; });
    r.history = arr(r.history).concat([{ at: nowIso(), by: clip(who.name || me, 120), prev: prev }]);   /* the owner's rule: every edit keeps the previous values, who and when */
    const n = { id: uid('N'), cat: cat, refId: r.id, what: 'update to your ' + noticeWhat(cat, r), at: nowIso(), by: clip(who.name || me, 120), seenAt: '' };
    P.notices = arr(P.notices).concat([n]);
    await save(); await notify(deps, low(body.email), P.name, n.what, n.id);
    return { code: 200, out: { ok: true } };
  }
  /* "Always keep records for everything": Archive (admins + Office Manager — hidden from the lists, kept with who / when / why,
     restorable by admins); a true delete is admin-only with a reason and leaves an audit entry */
  if (op === 'archive' || op === 'restore' || op === 'delete') {
    if (!priv || ((op === 'restore' || op === 'delete') && !who.admin)) return { code: 403, out: { ok: false, error: op === 'archive' ? 'Admins and the Office Manager only.' : 'Admins only.' } };
    const P = store.people[low(body.email)], cat = s(body.cat), key = cat === 'removal' ? 'removals' : cat === 'visit' ? 'visits' : 'exposures';
    const L = P ? arr(P[key]) : [], r = L.find(function(x){ return x && x.id === s(body.id); });
    if (!r) return { code: 404, out: { ok: false, error: 'No such record.' } };
    const why = clip(body.why, 400); if ((op === 'archive' || op === 'delete') && !why) return { code: 400, out: { ok: false, error: 'Give the reason.' } };
    store.audit = arr(store.audit);
    if (op === 'archive') { r.archived = { at: nowIso(), by: clip(who.name || me, 120), why: why }; }
    if (op === 'restore') { r.history = arr(r.history).concat([{ at: nowIso(), by: clip(who.name || me, 120), prev: { archived: r.archived || null }, restored: true }]); delete r.archived; }
    if (op === 'delete') { P[key] = L.filter(function(x){ return x !== r; }); }
    store.audit.push({ at: nowIso(), by: clip(who.name || me, 120), op: op, email: low(body.email), cat: cat, id: r.id, date: s(r.date || r.start), why: why });
    await save(); return { code: 200, out: { ok: true } };
  }
  if (op === 'due') {
    if (!priv) return { code: 403, out: { ok: false, error: 'Admins and the Office Manager only.' } };
    const P = person(store, body.email, body.name), key = s(body.key); if (!arr(R.medical).some(function(m){ return m.key === key; })) return { code: 400, out: { ok: false, error: 'Unknown item.' } };
    P.due = obj(P.due); if (ymd(body.date)) P.due[key] = ymd(body.date); else delete P.due[key];
    await save(); return { code: 200, out: { ok: true } };
  }
  if (op === 'appt') {
    const email = low(body.email || me); if (!priv && email !== me) return { code: 403, out: { ok: false, error: 'Only for yourself (or an admin / the Office Manager).' } };
    const P = person(store, email, body.name), a = { id: s(body.id) || uid('AP'), date: ymd(body.date), time: clip(body.time, 10), key: clip(body.key, 40), scheduleId: clip(body.scheduleId, 80), by: clip(who.name || me, 120), at: nowIso() };
    if (!a.date) return { code: 400, out: { ok: false, error: 'The date is needed.' } };
    P.appts = arr(P.appts).concat([a]); await save(); return { code: 200, out: { ok: true, id: a.id } };
  }
  if (op === 'jobAir') {
    /* an area / clearance result on a job: each worker who was on the job that day gets it in their own records */
    const smp = cleanExposure(Object.assign({}, obj(body.sample), { scope: 'area', pid: body.pid, job: body.job })); if (!smp.date) return { code: 400, out: { ok: false, error: 'The date is needed.' } };
    const done = [];
    for (const w of arr(body.workers)) {
      const e = low(w && w.email); if (!okEmail(e) || done.indexOf(e) >= 0) continue;
      const P = person(store, e, w.name); if (arr(P.exposures).some(function(x){ return x && x.sampleId && x.sampleId === smp.sampleId && smp.sampleId; })) continue;
      const r = Object.assign({}, smp, { id: uid('EX'), by: clip(who.name || me, 120), at: nowIso() }); P.exposures = arr(P.exposures).concat([r]);
      const n = { id: uid('N'), cat: 'exposure', refId: r.id, what: WHAT.area, at: nowIso(), by: r.by, seenAt: '' }; P.notices = arr(P.notices).concat([n]); done.push(e); w.__n = n; w.__name = P.name;
    }
    if (done.length) { await save(); for (const w of arr(body.workers)) if (w && w.__n) await notify(deps, low(w.email), w.__name, w.__n.what, w.__n.id); }
    return { code: 200, out: { ok: true, workers: done.length } };
  }
  return { code: 400, out: { ok: false, error: 'Unknown request.' } };
}

/* ── the daily run ── */
function medStep(days){ return days == null ? '' : days < 0 ? 'over' : days <= 3 ? '3d' : days <= 14 ? '14d' : days <= 30 ? '30d' : ''; }
function certStep(days){ return days == null ? '' : days < 0 ? 'expired' : days <= 30 ? '30d' : days <= 60 ? '60d' : days <= 90 ? '90d' : ''; }
async function run(data, deps){
  deps = deps || realDeps(); data = obj(data);
  const t = today(), R = await rulesOf(deps), out = { medical: 0, removal: 0, certs: 0, jobs: 0, mailed: 0 };
  const st = obj(await kv(deps, K_STATE)), rem = obj(st.reminded), mark = {};
  const priv = await privEmails(data, deps);
  /* a. medical surveillance + medical removal */
  let store = null; try { store = obj(await deps.medGet()); } catch (e) { out.medicalError = String(e && e.message || e); }
  const adminLines = [], todoNames = [];
  if (store) {
    Object.keys(obj(store.people)).forEach(function(e){
      const P = store.people[e], mine = [];
      C.medSummary(P, R, t).forEach(function(x){
        if (!x.next) return; const step = medStep(C.daysBetween(t, x.next)); if (!step) return;
        const k = 'med|' + e + '|' + x.key + '|' + x.next + '|' + step; if (rem[k]) return; mark[k] = nowIso();
        mine.push((step === 'over' ? 'Overdue: your ' : 'Your ') + x.label + (step === 'over' ? ' was due ' : ' is due ') + md(x.next));
        adminLines.push(esc(s(P.name) || e) + ' — ' + esc(x.label) + (step === 'over' ? ' <b style="color:#b91c1c">overdue</b> (' + md(x.next) + ')' : ' due ' + md(x.next)));
        if (todoNames.indexOf(s(P.name) || e) < 0) todoNames.push((s(P.name) || e) + ' ' + md(x.next));
        out.medical++;
      });
      if (mine.length && okEmail(e)) { deps.__q = (deps.__q || []).concat([{ to: [e], subject: '🩺 ' + mine[0] + (mine.length > 1 ? ' (+' + (mine.length - 1) + ' more)' : ''), html: '<p>Hi ' + esc(s(P.name).split(' ')[0] || 'there') + ',</p><ul>' + mine.map(function(l){ return '<li>' + esc(l) + '</li>'; }).join('') + '</ul><p>Use 📅 Schedule in the CRM (🩺 My health &amp; exposure records) once the appointment is booked.</p>' }]); }
      const rm = C.activeRemoval(P, t, R);
      if (rm) {
        const dd = C.daysBetween(t, rm.protectEnd), w = +R.removal.warnDays || 30, step = dd < 0 ? 'ended' : dd <= 3 ? '3d' : dd <= 14 ? '14d' : dd <= w ? 'w' : '';
        const k = 'rm|' + e + '|' + rm.id + '|' + rm.protectEnd + '|' + step;
        if (step && !rem[k]) { mark[k] = nowIso(); out.removal++; adminLines.push('<b>Medical removal protection</b> for ' + esc(s(P.name) || e) + ' ' + (step === 'ended' ? '<b style="color:#b91c1c">ended ' + md(rm.protectEnd) + '</b>' : 'ends ' + md(rm.protectEnd) + ' (' + dd + ' days)') + ' — the protected pay stops then. Decide with the physician (return to work / next steps) and confirm with your attorney.');
          deps.__todos = (deps.__todos || []).concat([{ id: 'ECMED_RM_' + rm.id + '_' + step, kind: 'envcomp_med', prio: 'high', label: '🩺 Medical removal protection for ' + (s(P.name) || e) + (step === 'ended' ? ' ended ' : ' ends ') + md(rm.protectEnd), note: 'Payroll stops the protected pay on that date. Open their 🩺 records (admins / Office Manager).' }]); }
      }
    });
  }
  if (adminLines.length && priv.length) deps.__q = (deps.__q || []).concat([{ to: priv, subject: '🩺 Medical surveillance: ' + adminLines.length + ' item' + (adminLines.length === 1 ? '' : 's') + ' due', html: '<p>For the admins and the Office Manager only (do not forward).</p><ul>' + adminLines.map(function(l){ return '<li>' + l + '</li>'; }).join('') + '</ul><p>Details: the worker\'s profile → 🩺 Medical (admins / Office Manager).</p>' }]);
  if (todoNames.length) deps.__todos = (deps.__todos || []).concat([{ id: 'ECMED_DUE_' + t, kind: 'envcomp_med', prio: 'high', label: '🩺 Medical follow-up due: ' + todoNames.join(', '), note: 'Details on each worker\'s 🩺 Medical (admins / Office Manager only). Book the appointment and use 📅 Schedule.' }]);
  /* b. the worker's own certifications (person entries in 📜 Certifications) */
  const certs = arr(obj(await kv(deps, 'gc_certs')).list);
  const users = arr(data.users);
  certs.forEach(function(c){
    if (!c || c.archived || c.holderType === 'company' || !ymd(c.expires)) return;
    const e = okEmail(c.holder) ? low(c.holder) : low((users.find(function(u){ return u && low(u.name) === low(c.holderName); }) || {}).email); if (!okEmail(e)) return;
    const step = certStep(C.daysBetween(t, c.expires)); if (!step) return;
    const k = 'cert|' + c.id + '|' + ymd(c.expires) + '|' + step; if (rem[k]) return; mark[k] = nowIso(); out.certs++;
    const line = step === 'expired' ? 'Your ' + s(c.name) + ' EXPIRED ' + md(c.expires) + ' — you cannot work under it until it is renewed (refresher course).' : 'Your ' + s(c.name) + ' expires ' + md(c.expires) + ' — book the refresher now.';
    deps.__q = (deps.__q || []).concat([{ to: [e], subject: '📜 ' + line.split(' — ')[0], html: '<p>' + esc(line) + '</p>' + (s(c.issuer) ? '<p>Provider: ' + esc(c.issuer) + '</p>' : '') + '<p>Upload the new certificate on your profile (📜 Certifications) when you have it.</p>' }]);
    deps.__todos = (deps.__todos || []).concat([{ id: 'ECCERT_' + c.id + '_' + step, kind: 'envcomp_cert', assignees: [e], assignee: s(c.holderName), personal: true, prio: step === 'expired' || step === '30d' ? 'high' : 'med', label: '📜 ' + line }]);
  });
  /* c. jobs: notices due / overdue and clearance still needed on a finished job */
  const jobLines = [], pms = [];
  const ctx = { rules: R, certs: certs, users: users, schedule: arr(data.schedule), medStatus: obj(obj(await kv(deps, K_STATUS)).people), today: t };
  arr(data.projects).forEach(function(p){
    if (!p || p.deleted || /lost|cancel|dead|archiv/i.test(s(p.status))) return;
    const e = C.evaluate(p, ctx); if (!e.on) return;
    e.items.forEach(function(x){
      let step = '';
      if (x.sec === 'notice' && (x.st === 'block' || x.st === 'due') && x.due) step = x.over ? 'over' : 'due';
      if (x.sec === 'air' && x.gate && x.st === 'block' && C.finished(p)) step = 'clear';
      if (!step) return;
      const k = 'job|' + p.id + '|' + x.id + '|' + s(x.due) + '|' + step; if (rem[k]) return; mark[k] = nowIso(); out.jobs++;
      jobLines.push(esc(s(p.name) || p.id) + ': ' + esc(x.label) + ' — ' + (step === 'over' ? '<b style="color:#b91c1c">overdue</b> (was due ' + md(x.due) + ')' : step === 'clear' ? '<b>clearance not passed — the job cannot be closed</b>' : 'due ' + md(x.due)));
      const pm = users.find(function(u){ return u && low(u.name) === low(p.pm); }); if (pm && okEmail(pm.email) && pms.indexOf(low(pm.email)) < 0) pms.push(low(pm.email));
    });
  });
  if (jobLines.length) { let off = []; try { off = users.filter(function(u){ return u && u.active !== false && /office/i.test(s(u.role)) && okEmail(u.email); }).map(function(u){ return low(u.email); }); } catch (e) {}
    deps.__q = (deps.__q || []).concat([{ to: Array.from(new Set(priv.concat(off, pms))), subject: '🛡 Environmental compliance: ' + jobLines.length + ' item' + (jobLines.length === 1 ? '' : 's') + ' need attention', html: '<ul>' + jobLines.map(function(l){ return '<li>' + l + '</li>'; }).join('') + '</ul><p>Open the job → 🛡 Compliance (each is a checklist item to confirm with the state program).</p>' }]); }
  for (const m of arr(deps.__q)) { const r = await deps.mail(m.to, m.subject, m.html).catch(function(){ return { ok: false }; }); if (r && r.ok) out.mailed++; }
  for (const it of arr(deps.__todos)) await deps.todo(it).catch(function(){});
  deps.__q = []; deps.__todos = [];
  if (Object.keys(mark).length) await deps.kvCas(K_STATE, function(v){ const s2 = obj(v); s2.reminded = Object.assign(obj(s2.reminded), mark); return s2; });
  if (store) await publish(store, R, deps);
  return out;
}

module.exports = { medOp, run, realDeps, publish, view, privEmails, C, T, K_RULES, K_STATUS, K_STATE };
