// test_ENVCOMP.mjs <build-dir> [shot-dir] — ENVCOMP in the CRM (offline harness, made-up data, the envcomp function answered by the real
// _lib/envcomp.js over an in-memory private store). Admin → worker → PM computers:
//   A (admin): an env job gets the 🛡 Compliance panel by itself, a plain job does not; a missing license blocks (and only warns when the
//      rule is set not to block); state-notice To-Do and filing it; air samples (personal → the worker's own records, clearance → close-out
//      gate); the daily log (Field tool → the full form → the database; edit keeps the earlier version; Desk shows it with totals);
//      archive-not-delete + a record removed behind its back is put back; medical removal → ⛔ on the job + the schedule warns + the payroll
//      draft line; the "not seen yet" admin view; certifications on the staff profile.
//   B (worker): 🩺 My health & exposure records shows their own results, stamps "seen", 📅 Schedule puts the appointment on their schedule.
//   C (PM): no one else's results anywhere (function 403, panel, profile).
import { createRequire } from 'module'; import path from 'path'; import fs from 'fs';
const require = createRequire(import.meta.url);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const H = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { computer, signIn, sleep, cset, cget, resetCloud, onFn, ACCOUNTS } = H;
const C = require(path.join(BUILD, 'envcomp-core.js'));
const LIB = require(path.join(BUILD, 'netlify/functions/_lib/envcomp.js'));
const day = n => C.addDays(C.today(), n);
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 864e5).toISOString();

/* the private medical store behind the envcomp function (the real rules, in memory) */
const MED = { v: 1, people: {} }, MAILS = [];
const deps = { medGet: async () => JSON.parse(JSON.stringify(MED)), medPut: async v => { Object.keys(MED).forEach(k => delete MED[k]); Object.assign(MED, JSON.parse(JSON.stringify(v))); },
  kvGet: async k => cget(k), kvPut: async (k, v) => cset(k, v), kvCas: async (k, fn) => { const v = fn(cget(k)); if (v !== undefined) cset(k, v); return { value: v }; },
  mail: async (to, subject, html) => { MAILS.push({ to, subject, html }); return { ok: true }; }, todo: async it => { const l = cget('gc_office_tasks') || []; if (!l.some(t => t.id === it.id)) { l.push(Object.assign({ done: false, addedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, it)); cset('gc_office_tasks', l); } return true; },
  todoDone: async ids => { const l = cget('gc_office_tasks') || []; l.forEach(t => { if (ids.includes(t.id)) t.done = true; }); cset('gc_office_tasks', l); return true; }, payrollEmails: async () => ['office@grayco-cs.com'] };
const CALLS = [];
onFn('envcomp', async ({ body, A }) => { const e = A.name, a = ACCOUNTS[e] || {}; CALLS.push({ who: e, op: body && body.op }); const who = { email: e, name: a.name, priv: a.role === 'admin' || e === 'office@grayco-cs.com', admin: a.role === 'admin' }; const r = await LIB.medOp(who, body, deps); return r.code === 200 ? r.out : { status: r.code, body: r.out }; });

resetCloud();
cset('users', [
  { id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Manager', active: true },
  { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u6', name: 'Demo Estimator', email: 'sbiffle@grayco-cs.com', role: 'Environmental Tech', active: true },
  { id: 'u7', name: 'Wes Worker', email: 'wworker@example.com', role: 'Abatement Worker', active: true }]);
cset('projects', [
  { id: 'P1', name: 'Demo Asbestos Job', client: 'Ann Demo', type: 'Asbestos abatement', companyId: 'environmental', address: '21 Demo St, Memphis, TN 38103', status: 'active', pct: 10, startDate: day(-2), abatementSupervisor: 'Demo Estimator', crew: ['Wes Worker'], pm: 'Demo PM', envComp: { asbBy: 'crew' }, createdAt: at, updatedAt: at },   /* ENVDOCS: GrayCo's own crew does this asbestos work (the default is a licensed sub) */
  { id: 'P2', name: 'Demo Kitchen Remodel', client: 'Bo Demo', type: 'Kitchen remodel', address: '22 Demo St, Memphis, TN 38103', status: 'active', pct: 10, startDate: day(-2), pm: 'Demo PM', crew: ['Wes Worker'], createdAt: at, updatedAt: at },
  { id: 'P3', name: 'Demo Lead Abatement', client: 'Cy Demo', type: 'Lead abatement', companyId: 'environmental', address: '23 Demo Rd, Little Rock, AR 72201', status: 'active', pct: 95, startDate: day(-20), abatementSupervisor: 'Demo Estimator', pm: 'Demo PM', finishPhotoWaived: { by: 'Wesley Johnson', at: at }, createdAt: at, updatedAt: at }]);   /* (patch FINISHPHOTO's own gate is not what this test is about) */
cset('gc_certs', { list: [
  { id: 'CE1', holderType: 'person', holder: 'sbiffle@grayco-cs.com', holderName: 'Demo Estimator', ckind: 'asb_supervisor', name: 'Asbestos Supervisor', state: 'TN', expires: day(300) },
  { id: 'CE2', holderType: 'company', holder: 'company', holderName: 'GrayCo', ckind: 'asb_firm', name: 'TN asbestos contractor license', state: 'TN', expires: day(400) },
  { id: 'CE3', holderType: 'person', holder: 'sbiffle@grayco-cs.com', holderName: 'Demo Estimator', ckind: 'lead_supervisor', name: 'Lead Abatement Supervisor Initial', issuer: 'Seagull Environmental Training', state: 'AR', issued: '2026-11-16', expires: day(364) }], updatedAt: at });
cset('schedule', []);
cset('payrollRuns', [{ id: 'RUN1', status: 'paid', from: '2026-01-05', to: '2026-01-11', payDate: '2026-01-16', lines: [{ empId: 'u7', name: 'Wes Worker', gross: 1000 }] }, { id: 'RUN2', status: 'paid', from: '2026-01-12', to: '2026-01-18', payDate: '2026-01-23', lines: [{ empId: 'u7', name: 'Wes Worker', gross: 1200 }] }]);

const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await signIn(A, 'wjohnson@grayco-cs.com', 20000);
const wait = async (X, f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await X.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('A0 the CRM is up with ENVCOMP', !!await wait(A, () => window._gcEnvComp && window._gcEnvCompCore && (window._crm.projects || []).length >= 3 && typeof window._navToJob === 'function', null, 60000));
const evalJob = (X, pid) => X.ev(pid => { const p = window._crm.projects.find(x => x.id === pid); const e = window._gcEnvComp.evaluate(p); return { on: e.on, status: e.status, kinds: e.kinds, items: e.items.map(i => ({ id: i.id, st: i.st, note: i.note, label: i.label })), closeout: e.closeout }; }, pid);
const open = async (X, pid) => { await X.ev(() => { try { window._setView('projects'); } catch (e) {} }); await sleep(900); await X.ev(id => window._navToJob(id), pid); };

/* 1 · the panel turns on by itself */
await open(A, 'P1');
const pan = await wait(A, () => { const c = document.getElementById('gc-ec'); return c && c.getAttribute('data-pid') === 'P1' ? { st: c.getAttribute('data-status'), t: c.textContent } : null; });
ok('A1 an asbestos (Environmental) job gets the 🛡 Compliance panel by itself, with a status', pan && /Compliance/.test(pan.t) && /1 · People on the job/.test(pan.t) && /Air testing/.test(pan.t) && /TDEC/.test(pan.t) && pan.st === 'block', pan && { st: pan.st, t: pan.t.slice(0, 400) });
await shot(A, 'a1_panel');
await open(A, 'P2'); await sleep(2500);
ok('A1 a kitchen remodel (not environmental) has no panel and is not affected', !await A.ev(() => !!document.getElementById('gc-ec')) && !(await evalJob(A, 'P2')).on);

/* 2 · a missing certification blocks — per the admin's rules */
let E1 = await evalJob(A, 'P1');
const wItem = E1.items.find(i => i.id === 'asb-worker:wes worker');
ok('A2 Wes Worker has no state asbestos worker license → ⛔ blocking', wItem && wItem.st === 'block', wItem);
ok('A2 the supervisor\'s license and the firm license count', E1.items.find(i => i.id === 'asb-sup').st === 'ok' && E1.items.find(i => i.id === 'asb-firm').st === 'ok', E1.items.filter(i => /asb-(sup|firm)/.test(i.id)));
await A.ev(() => { const C0 = window._gcEnvCompCore, R = JSON.parse(JSON.stringify(window._gcEnvComp.rules())); R.people = R.people.map(r => r.id === 'asb-worker' ? Object.assign({}, r, { block: false }) : r); return window._gcEnvComp.saveRules(R); });
ok('A2 an admin sets that rule not to block → only ⚠', !!await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'P1'); const i = window._gcEnvComp.evaluate(p).items.find(x => x.id === 'asb-worker:wes worker'); return i && i.st === 'due'; }, null, 8000), await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'P1'); const R = window._gcEnvComp.rules(); return { ec: p.envComp, rule: (R.people || []).find(r => r.id === 'asb-worker'), items: window._gcEnvComp.evaluate(p).items.filter(i => /asb/.test(i.id)).map(i => i.id + ':' + i.st), err: window.__gcEcErr || '' }; }));   /* ENVDOCS: polled (the page's own timers run alongside) */
ok('A2 the rules are saved for every computer (gc_kv gc_envcomp_rules)', !!await wait(A, () => true) && (cget('gc_envcomp_rules') || {}).people && cget('gc_envcomp_rules').people.find(r => r.id === 'asb-worker').block === false);
await A.ev(() => { const R = JSON.parse(JSON.stringify(window._gcEnvComp.rules())); R.people = R.people.map(r => r.id === 'asb-worker' ? Object.assign({}, r, { block: true }) : r); return window._gcEnvComp.saveRules(R); });
{ let hl = 0; for (let i = 0; i < 30 && !hl; i++) { hl = ((cget('gc_envcomp_rules_history') || {}).list || []).length; if (!hl) await sleep(300); } ok('A2 every version of the rules is kept (gc_envcomp_rules_history)', hl >= 1, hl); }

/* 3 · notices: a To-Do when due / overdue; filing it closes it */
await A.ev(() => window._gcEnvComp.sweep());
let tasks = await A.ev(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'));
const nt = tasks.find(t => t.id === 'ENVCOMP_N_P1_asb-notice-tn');
ok('A3 the overdue TN asbestos notice → a To-Do for the PM ("OVERDUE")', nt && !nt.done && /OVERDUE/.test(nt.label) && nt.assignee === 'Demo PM' && nt.prio === 'high', nt);
ok('A3 the plain job gets no compliance To-Do', !tasks.some(t => /^ENVCOMP_/.test(t.id) && t.pid === 'P2'));
await A.ev(() => window._gcEnvComp.fileNotice('P1', 'asb-notice-tn', { filedOn: '2026-10-30', conf: 'TDEC-4471' }));
await sleep(1200);
ok('A3 filed on + confirmation # → ✅ on the panel', (await evalJob(A, 'P1')).items.find(i => i.id === 'asb-notice-tn').st === 'ok');
await A.ev(() => window._gcEnvComp.sweep());
tasks = await A.ev(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'));
ok('A3 … and the To-Do closes by itself', tasks.find(t => t.id === 'ENVCOMP_N_P1_asb-notice-tn').done === true);

/* 4 · air: a personal sample goes to the worker's own records; the job keeps only that it was taken */
await A.ev(() => window._gcEnvComp.logAir('P1', { atype: 'personal', rule: 'asb-personal', worker: 'sbiffle@grayco-cs.com', date: window._gcEnvCompCore.today(), task: 'removing pipe wrap', sampler: 'Wesley Johnson', lab: 'Demo Lab', method: 'PCM (fibers/cc)', result: '0.0042 f/cc', limit: '0.1 f/cc', pass: 'Pass' }));
await sleep(1500);
const sp = MED.people['sbiffle@grayco-cs.com'];
ok('A4 the personal result is in the worker\'s private records (with the comparison)', sp && sp.exposures.length === 1 && sp.exposures[0].result === '0.0042 f/cc' && /0\.1/.test(sp.exposures[0].al), sp);
const stub = (cget('projects') || []).find(p => p.id === 'P1').envLog.find(r => r.private);
ok('A4 the job record only says a personal sample was taken (no worker, no result) — and it reached the database', stub && !stub.result && !/0\.0042/.test(JSON.stringify(stub)), stub);
ok('A4 the worker is told — no value in the message', MAILS.some(m => m.to.includes('sbiffle@grayco-cs.com') && /new air monitoring result/.test(m.subject) && !/0\.0042/.test(m.subject + m.html)));
/* close-out waits for clearance (P3, lead abatement at 95 %) */
let E3 = await evalJob(A, 'P3');
ok('A5 the lead abatement job cannot be closed before clearance', E3.closeout.length === 1 && E3.items.find(i => i.id === 'la-clear').st === 'block', E3.closeout);
await A.ev(() => window._gcEnvComp.closeGate());
await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setProjects(prev => prev.map(p => p.id === 'P3' ? Object.assign({}, p, { status: 'complete', pct: 100, updatedAt: new Date().toISOString() }) : p)); });
const gateDlg = await wait(A, () => { const d = document.getElementById('gc-ec-modal'); return d && /Clearance has not passed/.test(d.innerText) ? d.innerText : null; }, null, 8000);
await sleep(1500);
const st3 = await A.ev(() => window._crm.projects.find(p => p.id === 'P3').status);
ok('A5 closing it is put back with "⛔ Clearance has not passed"', !!gateDlg && st3 === 'active', { gateDlg, st3 });
await shot(A, 'a5_gate');
await A.ev(() => { const d = document.getElementById('gc-ec-modal'); if (d) d.remove(); });
await A.ev(() => window._gcEnvComp.logAir('P3', { atype: 'clearance', rule: 'la-clear', date: window._gcEnvCompCore.today(), task: 'all rooms', sampler: 'Demo Inspector', lab: 'Demo Lab', method: 'Lead dust wipe (µg/ft²)', result: '4 µg/ft²', limit: '10 µg/ft²', pass: 'Pass' }));
await sleep(1500);
ok('A5 clearance logged (date, sampler, lab, result, pass) → close-out allowed', (await evalJob(A, 'P3')).closeout.length === 0);
ok('A5 the clearance result is added to the records of the worker on that job that day', (MED.people['sbiffle@grayco-cs.com'].exposures || []).some(x => x.scope === 'area' && x.pid === 'P3'));
await A.page().keyboard.press('Shift');   /* a person's input (trusted), then the status change */
await A.ev(() => window._gcxPatchJob('P3', { status: 'complete', pct: 100 }, 'test: close the job'));   /* the CRM's own status writer (what the status picker uses) */
await sleep(4000);
{ const st5 = await A.ev(() => ({ st: window._crm.projects.find(p => p.id === 'P3').status, modal: (document.getElementById('gc-ec-modal') || {}).textContent || '', co: window._gcEnvComp.evaluate(window._crm.projects.find(p => p.id === 'P3')).closeout, air: (window._crm.projects.find(p => p.id === 'P3').envLog || []).filter(r => r.kind === 'air').length })); ok('A5 … and now it closes', st5.st === 'complete' && !st5.modal, st5); }

/* 6 · the daily log: the Field tool opens the full form; it reaches the database; an edit keeps the earlier version */
ok('A6 GrayCo Field has 🛡 Compliance + 📋 Daily log on env jobs only', await A.ev(() => { const L = window._gcFieldTools.list().map(t => t.id); return L.includes('envcomp') && L.includes('envcomp_log'); }));
await A.ev(() => window._gcFieldTools.run('envcomp_log', 'P1'));
const form = await wait(A, () => { const d = document.querySelector('#gc-ec-modal[data-ec-daily]'); return d ? d.textContent : null; });
ok('A6 the daily log form has every section', form && ['Conditions', 'Crew', 'Containment', 'Negative air', 'Equipment', 'Air monitoring', 'PPE & decon', 'Waste', 'Signage', 'Incidents', 'Sign-off'].every(s => form.indexOf(s) >= 0) && /Wes Worker/.test(await A.ev(() => [...document.querySelectorAll('#gc-ec-modal [data-rows="crew"] input')].map(i => i.value).join(' '))), form && form.slice(0, 600));
await A.ev(() => {
  const o = document.getElementById('gc-ec-modal'), f = (k, v) => { const i = o.querySelector('[data-f="v_' + k + '"]'); if (i) i.value = v; };
  f('weather', 'Sunny, light wind'); f('outTemp', '71'); f('outRH', '40'); f('tasks', 'Removed pipe wrap in the basement'); f('incidents', 'Near miss: ladder slipped, nobody hurt'); f('supNotes', 'Good day');
  const row = (k, vals) => { const tr = o.querySelector('[data-rows="' + k + '"] tbody tr'); Object.keys(vals).forEach(c => { const i = tr.querySelector('[data-col="' + c + '"]'); if (i) i.value = vals[c]; }); };
  row('areas', { area: 'Basement', temp: '68', rh: '55', dew: '51' }); row('negair', { unit: 'NAM-2', on: '7:30', off: '16:00', filter: 'pre-filter 12:00' }); row('mano', { time: '8:00', reading: '-0.03 in. w.c.', where: 'Basement door' });
  row('equip', { type: 'HEPA vacuum', unit: 'HV-1', act: 'placed', meter: '112.4' }); row('air', { sample: 'Personal — Demo Estimator', pump: 'P-7', pre: '2.0', post: '2.0', start: '8:05', stop: '15:35', vol: '900' });
  row('ppe', { resp: 'Half-face P100', suit: 'Tyvek, boots', who: 'all' }); row('waste', { bags: '6', drums: '1', manifest: 'WSR-1001', store: 'locked trailer' }); row('visitors', { name: 'Demo Inspector', org: 'TDEC', in: '10:00', out: '10:40', why: 'inspection' });
  ['containSet', 'critical', 'signs', '__signoff'].forEach(k => { const c = o.querySelector('[data-c="' + k + '"]'); if (c) c.checked = true; });
  o.querySelector('[data-m="save"]').click();
});
const dbLog = await wait(A, () => true, null, 500) && await (async () => { for (let i = 0; i < 40; i++) { const p = (cget('projects') || []).find(x => x.id === 'P1'); const r = p && (p.envLog || []).find(x => x.kind === 'compday'); if (r) return r; await sleep(300); } return null; })();
ok('A6 the Field daily log (every section) reaches the database', dbLog && dbLog.values.weather === 'Sunny, light wind' && dbLog.values.outRH === '40' && dbLog.values.containSet === true && dbLog.rows.negair[0].unit === 'NAM-2' && dbLog.rows.mano[0].reading === '-0.03 in. w.c.' && dbLog.rows.air[0].pump === 'P-7' && dbLog.rows.waste[0].manifest === 'WSR-1001' && dbLog.rows.visitors[0].org === 'TDEC' && dbLog.rows.crew.length >= 2 && dbLog.signoff && dbLog.signoff.name === 'Wesley Johnson', dbLog);
await open(A, 'P1');
const desk = await wait(A, () => { const c = document.getElementById('gc-ec'); return c && /signed Wesley Johnson/.test(c.innerText) && /6 bags \/ 1 drums/.test(c.innerText) ? c.innerText : null; });
ok('A6 it shows on the Desk job page with the totals (6 bags / 1 drum, manifest WSR-1001, 1 pressure reading)', desk && /WSR-1001/.test(desk) && /1 pressure readings/.test(desk), desk && desk.slice(0, 900));
await shot(A, 'a6_daily');
await A.ev(() => window._gcEnvComp.dailyForm('P1', window._gcEnvCompCore.today()));
await wait(A, () => !!document.querySelector('#gc-ec-modal[data-ec-daily]'));
await A.ev(() => { const o = document.getElementById('gc-ec-modal'); o.querySelector('[data-f="v_weather"]').value = 'Rain after 2 PM'; o.querySelector('[data-m="save"]').click(); });
let ver = null; for (let i = 0; i < 40; i++) { const r = ((cget('projects') || []).find(x => x.id === 'P1').envLog || []).find(x => x.kind === 'compday'); if (r && r.values.weather === 'Rain after 2 PM') { ver = r; break; } await sleep(300); }
ok('A6 editing the day\'s log keeps the earlier version (who, when, the old values) — still one log for the day', ver && ver.versions.length === 1 && ver.versions[0].prev.values.weather === 'Sunny, light wind' && ver.versions[0].by === 'Wesley Johnson' && ((cget('projects') || []).find(x => x.id === 'P1').envLog || []).filter(x => x.kind === 'compday').length === 1, ver && ver.versions);

/* 7 · archive, not delete; a record removed behind its back is put back */
const airId = await A.ev(() => window._crm.projects.find(p => p.id === 'P3').envLog.find(r => r.kind === 'air' && /Clearance/.test(r.type)).id);
await A.ev(() => window._gcEnvComp.guard());
await A.ev(id => window._gcEnvComp.archive('P3', id, 'logged twice'), airId); await sleep(1500);
let p3 = (cget('projects') || []).find(x => x.id === 'P3'), ar = p3.envLog.find(r => r.id === airId);
ok('A7 🗄 Archive keeps the record (who / when / why) and hides it from the active lists', ar && ar.archived && ar.archived.why === 'logged twice' && ar.archived.by === 'Wesley Johnson' && (await evalJob(A, 'P3')).closeout.length === 1, ar);
await A.ev(id => window._gcEnvComp.restore('P3', id), airId); await sleep(1200);
ok('A7 an admin restores it (the archive is kept in its history)', (await evalJob(A, 'P3')).closeout.length === 0 && ((cget('projects') || []).find(x => x.id === 'P3').envLog.find(r => r.id === airId).versions || []).some(v => v.restored));
await A.ev(id => window._setProjects(prev => prev.map(p => p.id === 'P3' ? Object.assign({}, p, { envLog: p.envLog.filter(r => r.id !== id), updatedAt: new Date().toISOString() }) : p)), airId);
await sleep(800); const put = await A.ev(() => window._gcEnvComp.guard()); await sleep(1500);
ok('A7 a compliance record removed without an admin\'s audited delete is put back (kept forever)', put >= 1 && (cget('projects') || []).find(x => x.id === 'P3').envLog.some(r => r.id === airId && r.restoredAt), put);
await A.ev(id => window._gcEnvComp.del('P3', id, 'test entry by mistake'), airId); await sleep(1200); await A.ev(() => window._gcEnvComp.guard()); await sleep(800);
p3 = (cget('projects') || []).find(x => x.id === 'P3');
ok('A7 an admin delete (with a reason) removes it and leaves an audit entry; it is not put back', p3.envLog.filter(r => r.id === airId).every(r => r.deleted && !r.result && !r.lab) && (p3.envAudit || []).some(a => a.id === airId && a.why === 'test entry by mistake' && a.by === 'Wesley Johnson'), p3.envAudit);

/* 8 · medical removal: ⛔ on exposure jobs, the schedule warns, payroll keeps the pay */
const rr = await A.ev(() => window._gcEnvComp.fn({ op: 'add', email: 'wworker@example.com', name: 'Wes Worker', cat: 'removal', rec: { start: '2026-01-19', reason: 'elevated blood lead per the physician', basis: 'average', criteria: 'physician clearance' } }));
await A.ev(() => window._gcEnvComp.pullStatus()); await sleep(600);
ok('A8 a medical removal → Wes is ⛔ on the asbestos job (status only)', rr.ok && (await evalJob(A, 'P1')).items.some(i => i.id === 'removed:wes worker' && i.st === 'block'));
await A.ev(() => window._gcEnvComp.closeGate()); await sleep(1300);
await A.ev(() => window._setSchedule(prev => (prev || []).concat([{ id: 'SCH1', pid: 'P1', title: 'Pipe wrap removal', date: window._gcEnvCompCore.today(), assignee: 'Wes Worker' }])));
const sw = await wait(A, () => { const d = document.getElementById('gc-ec-modal'); return d && /Not cleared for exposure work/.test(d.innerText) ? d.innerText : null; }, null, 8000);
ok('A8 putting him on the asbestos job\'s schedule warns', !!sw && /Wes Worker/.test(sw), sw);
await A.ev(() => { const d = document.getElementById('gc-ec-modal'); if (d) d.remove(); window.__gcEcSchedWarn = null; });
await A.ev(() => window._setSchedule(prev => (prev || []).concat([{ id: 'SCH2', pid: 'P2', title: 'Cabinets', date: window._gcEnvCompCore.today(), assignee: 'Wes Worker' }])));
await sleep(3000);
ok('A8 … non-exposure work (the kitchen) is fine', !await A.ev(() => !!window.__gcEcSchedWarn) && (await A.ev(() => window._gcEnvComp.canSchedule('wworker@example.com', 'P2'))).ok);
const line = await A.ev(async () => { const P = window.__GC_PAY; const set = await P.settings(); const L = await window._gcPayrollComputeLine({ name: 'Wes Worker', userId: 'u7', payType: 'hourly', hourlyRate: 25, period: 'weekly', filing: 'single' }, '2026-01-19', '2026-01-25', set, {}); return { gross: L.gross, parts: L.grossParts, trace: (L.trace || []).filter(t => /Medical removal/.test(t.label)) }; });
const mp = (line.parts || []).find(x => /Medical removal protection/.test(x.label));
ok('A8 the payroll draft has the "Medical removal protection" line = the average of the weeks before ($1,100) with how it was worked out', mp && mp.amount === 1100 && line.trace.length === 1 && /average/.test(line.trace[0].detail), line);
const late = await A.ev(async () => { const P = window.__GC_PAY; const set = await P.settings(); const L = await window._gcPayrollComputeLine({ name: 'Wes Worker', userId: 'u7', payType: 'hourly', hourlyRate: 25, period: 'weekly' }, '2027-07-26', '2027-08-01', set, {}); return (L.grossParts || []).filter(x => /Medical removal/.test(x.label)).length; });
ok('A8 no protection line after the 18-month protected period', late === 0, late);

/* 9 · certifications on the staff profile; the admin's "not seen yet" view */
await A.ev(() => window._gcEnvComp.openProfile('sbiffle@grayco-cs.com', 'Demo Estimator'));
const prof = await wait(A, () => { const d = document.getElementById('gc-ec-modal'); return d && /Lead Abatement Supervisor Initial/.test(d.innerText) && /Seagull Environmental Training/.test(d.innerText) && /Admins \/ Office Manager only/.test(d.innerText) ? d.innerText : null; });
ok('A9 the staff profile lists the certifications (provider, state accepted, issued, expires) and, for an admin, the medical records', !!prof && /AR/.test(prof) && /0\.0042/.test(prof), prof && prof.slice(0, 600));
await A.ev(() => { const d = document.getElementById('gc-ec-modal'); if (d) d.remove(); });
await A.ev(() => window._gcEnvComp.addCert({ email: 'wworker@example.com', name: 'Wes Worker' }, { ckind: 'asb_worker', name: 'Asbestos Abatement Worker', issuer: 'Demo Provider', state: 'TN', issued: '2026-11-01', expires: window._gcEnvCompCore.addDays(window._gcEnvCompCore.today(), 60) }));
await sleep(1500); await A.ev(() => window._gcCerts && window._gcCerts.load && window._gcCerts.load()); await sleep(1200);
ok('A9 a new certification is saved in 📜 Certifications (90-day reminders) and clears Wes\'s license item', (cget('gc_certs').list || []).some(c => c.holder === 'wworker@example.com' && c.warnDays === 90 && c.ckind === 'asb_worker') && (await evalJob(A, 'P1')).items.find(i => i.id === 'asb-worker:wes worker').st !== 'block');
await A.ev(() => { try { window._setView('enviro'); } catch (e) {} });
const over = await wait(A, () => { const el = document.getElementById('gc-ec-over'); return el && /Demo Asbestos Job/.test(el.innerText) && /Demo Estimator/.test(el.innerText) && !/Loading…/.test(el.innerText) ? el.innerText : null; }, null, 70000);   /* ENVDOCS: wait for the not-seen list to load too */
ok('A9 ☢️ Environmental: the compliance overview of active env jobs + the results the worker has not seen yet', !!over && !/Demo Kitchen/.test(over) && /air monitoring result/.test(over), over && over.slice(0, 700));
await shot(A, 'a9_overview');
ok('A no page errors (admin)', !A.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/i.test(e)).length, A.errs.slice(0, 5));
await A.close();

/* B · the worker: their own records, seen stamp, schedule */
const B = await computer('sbiffle@grayco-cs.com', { build: BUILD });
await signIn(B, 'sbiffle@grayco-cs.com', 20000);
await sleep(6000);   /* the sign-in reloads the page once */
ok('B0 the CRM is up (worker)', !!await wait(B, () => window._gcEnvComp && (window._crm.projects || []).length >= 1, null, 60000));
const unseen0 = (MED.people['sbiffle@grayco-cs.com'].notices || []).filter(n => !n.seenAt).length;
await B.ev(() => window._gcEnvComp.openMine());
const mine = await wait(B, () => { const d = document.querySelector('[data-ec-mine]'); return d && /0\.0042 f\/cc/.test(d.innerText) ? d.innerText : null; });
ok('B1 🩺 My health & exposure records: their own personal result (task, result, the limit it is compared with, lab) and the clearance on their job', !!mine && /removing pipe wrap/.test(mine) && /0\.1 f\/cc/.test(mine) && /Clearance/.test(mine) && /Demo Lab/.test(mine), mine && mine.slice(0, 700));
ok('B1 opening it stamps every new result "seen" (date / time)', unseen0 >= 2 && (MED.people['sbiffle@grayco-cs.com'].notices || []).every(n => n.seenAt) && (MED.people['sbiffle@grayco-cs.com'].opened || []).length === 1);
ok('B1 a printable / downloadable copy', await B.ev(() => { const b = document.querySelector('[data-ec-mine] [data-ec-dl]'); if (!b) return false; b.click(); return (window.__gcEcDownloaded || 0) > 0 && !!document.querySelector('[data-ec-mine] [data-ec-print]'); }));
await shot(B, 'b1_mine');
await B.ev(() => window._gcEnvComp.schedAppt('sbiffle@grayco-cs.com', 'Demo Estimator', 'bloodLead', { date: window._gcEnvCompCore.addDays(window._gcEnvCompCore.today(), 9), time: '9:30 AM' }));
await sleep(1500);
let ap = []; for (let i = 0; i < 30 && !ap.length; i++) { ap = await B.ev(() => window._gcEnvComp._sched().list.filter(x => x && x.kind === 'envcomp_appt')); if (!ap.length) await sleep(400); }   /* the list the app itself saved (its save hook) */
ok('B2 📅 Schedule puts "🩺 Medical appointment" on their own schedule (no test name) and records it', ap.length === 1 && ap[0].title === '🩺 Medical appointment' && ap[0].assignee === 'Demo Estimator' && ap[0].scope === 'personal' && (MED.people['sbiffle@grayco-cs.com'].appts || []).length === 1, ap);
const other = await B.ev(() => window._gcEnvComp.fn({ op: 'person', email: 'wworker@example.com' }));
ok('B3 a worker cannot read another worker\'s records', other.ok === false && !JSON.stringify(other).match(/blood lead per/));
await B.close();

/* C · the PM: status only, never someone else's results */
const P = await computer('pm@grayco-cs.com', { build: BUILD });
await signIn(P, 'pm@grayco-cs.com', 20000);
await sleep(6000);
ok('C0 the CRM is up (PM)', !!await wait(P, () => window._gcEnvComp && (window._crm.projects || []).length >= 1, null, 60000));
await P.ev(() => window._gcEnvComp.pullStatus()); await sleep(800);
await open(P, 'P1');
const pmPanel = await wait(P, () => { const c = document.getElementById('gc-ec'); return c && c.getAttribute('data-pid') === 'P1' ? c.innerText : null; });
ok('C1 the PM sees the job\'s compliance (medical: current / due only) — never the personal result', !!pmPanel && /Medical surveillance|medical/i.test(pmPanel) && !/0\.0042/.test(pmPanel) && /in the worker's own records/.test(pmPanel), pmPanel && pmPanel.slice(0, 500));
const pmFn = await P.ev(() => Promise.all([window._gcEnvComp.fn({ op: 'person', email: 'sbiffle@grayco-cs.com' }), window._gcEnvComp.fn({ op: 'all' }), window._gcEnvComp.fn({ op: 'removals' })]));
ok('C2 the function refuses the PM someone else\'s records, the list and the removals', pmFn.every(r => r.ok === false));
await P.ev(() => window._gcEnvComp.openProfile('sbiffle@grayco-cs.com', 'Demo Estimator'));
const pmProf = await wait(P, () => { const d = document.getElementById('gc-ec-modal'); return d ? d.innerText : null; });
ok('C3 on a profile the PM sees certifications and "medical current / due" only', !!pmProf && /Lead Abatement Supervisor Initial/.test(pmProf) && /visible only to the worker, the admins and the Office Manager/.test(pmProf) && !/0\.0042|Demo Lab|pipe wrap/.test(pmProf), pmProf);
const statusRow = cget('gc_medical_status');
ok('C4 the shared status row has no dates, tests or results', statusRow && !/0\.0042|pipe wrap|blood lead per|\d{4}-\d{2}-\d{2}T/.test(JSON.stringify(statusRow.people)), statusRow);
ok('C no page errors (PM)', !P.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/i.test(e)).length, P.errs.slice(0, 5));
await P.close();

const n = R.filter(Boolean).length; console.log(n + ' passed, ' + (R.length - n) + ' failed'); process.exit(R.length - n ? 1 : 0);
