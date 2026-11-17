// test_ENVCOMP_fn.mjs [build dir] — ENVCOMP server side: /envcomp-core.js (the checks), netlify/functions/_lib/envcomp.js (the private
// medical & exposure records, the daily reminders) and netlify/functions/envcomp.js (sign-in). Made-up data, no network, no live writes.
import { createRequire } from 'module'; import path from 'path';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.');
const C = require(path.join(BUILD, 'envcomp-core.js'));
const LIB = require(path.join(BUILD, 'netlify/functions/_lib/envcomp.js'));
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const day = n => C.addDays(C.today(), n);
const md = d => (+d.slice(5, 7)) + '/' + (+d.slice(8, 10));
LIB.T.now = () => Date.parse(C.today() + 'T18:00:00Z');   /* the lib's "today" (Central) = the core's today */

/* ── the checks ── */
const users = [{ name: 'Sam Sup', email: 'sam@example.com', role: 'Abatement Supervisor' }, { name: 'Wes Work', email: 'wes@example.com', role: 'Abatement Worker' }, { name: 'Pat PM', email: 'pat@example.com', role: 'Project Manager' }, { name: 'Owner', email: 'owner@example.com', role: 'Admin' }, { name: 'Office', email: 'office@example.com', role: 'Office Manager' }];
const certs = [
  { id: 'c1', holderType: 'person', holder: 'sam@example.com', holderName: 'Sam Sup', ckind: 'asb_supervisor', name: 'Asbestos Supervisor', state: 'TN', expires: day(300) },
  { id: 'c2', holderType: 'company', holder: 'company', name: 'TN asbestos contractor license', ckind: 'asb_firm', state: 'TN', expires: day(400) },
  { id: 'c3', holderType: 'person', holder: 'sam@example.com', holderName: 'Sam Sup', name: 'Lead Abatement Supervisor Initial', issuer: 'Seagull Environmental Training', ckind: 'lead_supervisor', state: 'AR', issued: '2026-11-16', expires: day(364) }];
const asb = { id: 'J1', name: 'Asbestos job', type: 'Asbestos abatement', companyId: 'environmental', address: '1 Demo St, Memphis, TN 38103', status: 'active', pct: 10, startDate: day(-2), abatementSupervisor: 'Sam Sup', crew: ['Wes Work'], pm: 'Pat PM' };
const plain = { id: 'J2', name: 'Kitchen', type: 'Kitchen remodel', address: '2 Demo St, Memphis, TN', status: 'active' };
const ctx = { rules: C.rules(), certs, users, schedule: [], medStatus: {}, today: C.today(), company: p => p.companyId || 'construction' };
let E = C.evaluate(asb, ctx);
ok(E.on && E.kinds.join() === 'asbestos' && E.state === 'TN', 'an Environmental asbestos job turns the checks on (kind asbestos, state TN)', E.kinds);
ok(!C.evaluate(plain, ctx).on && !C.isOn({ id: 'J3', name: 'Remodel', notes: 'found mold behind the sink', status: 'active' }, ctx), 'a plain Construction job is not affected (a Construction job that mentions mold is not a remediation job)');
ok(C.detectKinds({ id: 'J4', name: 'Paint', leadAsb: { yearBuilt: 1962, disturbsPaint: true } }, ctx).join() === 'lead_rrp' && C.detectKinds({ id: 'J5', type: 'Lead abatement' }, ctx).join() === 'lead_abate' && C.detectKinds({ id: 'J6', type: 'Trauma / biohazard cleanup' }, ctx).join() === 'trauma', 'lead RRP (☣️ card answers), lead abatement and trauma jobs are recognised');
const w = E.items.find(x => x.id === 'asb-worker:wes work'), s = E.items.find(x => x.id === 'asb-sup');
ok(w && w.st === 'block' && s && s.st === 'ok' && /Sam Sup/.test(s.note), 'a worker without the state asbestos worker license is ⛔; the supervisor\'s license counts', { w, s });
const R2 = C.rules({ people: C.DEFAULT_RULES.people.map(r => r.id === 'asb-worker' ? Object.assign({}, r, { block: false }) : r) });
ok(C.evaluate(asb, Object.assign({}, ctx, { rules: R2 })).items.find(x => x.id === 'asb-worker:wes work').st === 'due', 'admin config: the same missing license only ⚠ when the rule does not block');
const n = E.items.find(x => x.sec === 'notice' && /TDEC/.test(x.label));
ok(n && n.st === 'block' && n.over && /confirm/i.test(n.note), 'the TN asbestos notice is a checklist item, overdue once work started, labelled "confirm with the state program"', n);
const filed = Object.assign({}, asb, { envComp: { notices: { 'asb-notice-tn': { filedOn: day(-14), conf: 'TN-123' } } } });
ok(C.evaluate(filed, ctx).items.find(x => x.id === 'asb-notice-tn').st === 'ok', 'filed on + confirmation # → ✅');
const ar = { id: 'J7', name: 'Lead abatement', type: 'Lead abatement', address: '9 Demo Rd, Little Rock, AR 72201', status: 'active', pct: 95, startDate: day(-20), abatementSupervisor: 'Sam Sup' };
let E7 = C.evaluate(ar, ctx);
ok(E7.closeout.length === 1 && E7.items.find(x => x.id === 'la-clear').st === 'block' && E7.items.find(x => x.id === 'la-sup').st === 'ok', 'lead abatement near the end: clearance blocks close-out; the AR-accepted supervisor cert counts', E7.closeout);
ar.envLog = [{ id: 'a1', kind: 'air', type: 'Clearance', rule: 'la-clear', date: day(0), pass: 'Pass' }];
ok(C.evaluate(ar, ctx).closeout.length === 0, 'a passing clearance clears the close-out');
ar.envLog[0].archived = { by: 'x', at: 'y', why: 'z' };
ok(C.evaluate(ar, ctx).closeout.length === 1, 'an archived record does not count (kept, hidden)');
ok(C.retainUntil(C.rules(), 'exposure', '2026-01-01') === '' && C.retainUntil(C.rules({ retention: [{ cat: 'exposure', years: 30 }] }), 'exposure', '2026-01-01') === '2056-01-01', 'records are kept forever by default; an admin-set number of years is honoured');
const T0 = C.dailyTotals({ envLog: [{ id: 'd1', kind: 'compday', date: day(0), signoff: { name: 'Sam Sup', at: 'x' }, values: { incidents: 'none — near miss on ladder' }, rows: { waste: [{ bags: '6', drums: '1', manifest: 'WSR-1' }, { bags: '2' }], mano: [{ time: '8:00', reading: '-0.03' }, { time: '12:00', reading: '-0.025' }] } }] });
ok(T0.days === 1 && T0.signed === 1 && T0.sums['waste.bags'] === 8 && T0.sums['waste.drums'] === 1 && T0.manifests[0] === 'WSR-1' && T0.readings === 2 && T0.incidents === 1, 'daily log totals roll up (bags, drums, manifests, readings, incidents)', T0);

/* ── medical: next due, phases, removal follow-up, the public status ── */
const R = C.rules();
const rec = { visits: [{ date: day(-40), type: 'bloodLead' }, { date: day(-46), type: 'fit' }], removals: [] };
let S = C.medSummary(rec, R, C.today()), bl = S.find(x => x.key === 'bloodLead');
ok(bl.next === C.addMonths(day(-40), 2) && bl.st === 'due', 'blood lead: every 2 months in the first 6 months (default) → due', bl);
const rec2 = { visits: [{ date: day(-400), type: 'bloodLead' }, { date: day(-20), type: 'bloodLead' }] };
ok(C.medSummary(rec2, R, C.today()).find(x => x.key === 'bloodLead').next === C.addMonths(day(-20), 6), 'after the first 6 months: every 6 months');
const rec3 = { visits: [{ date: day(-20), type: 'bloodLead' }], removals: [{ id: 'r1', start: day(-10), reason: 'elevated blood lead' }] };
ok(C.medSummary(rec3, R, C.today()).find(x => x.key === 'bloodLead').next === C.addMonths(day(-10), 1), 'during a medical removal the follow-up blood test is monthly (default)');
const pub = C.publicStatus(rec3, R, C.today());
ok(pub.removed && pub.removedKinds.indexOf('lead_abate') >= 0 && !JSON.stringify(pub).match(/\d{4}-\d{2}-\d{2}|blood|lead \+/i), 'the public status: removed + current / due by kind — no date, no test name', pub);

/* ── medical removal protection pay ── */
const st0 = '2026-03-02';
const runs = [{ status: 'paid', from: '2026-02-16', to: '2026-02-22', payDate: '2026-02-27', lines: [{ empId: 'u7', name: 'Wes Work', gross: 1000 }] }, { status: 'paid', from: '2026-02-23', to: '2026-03-01', payDate: '2026-03-06', lines: [{ empId: 'u7', name: 'Wes Work', gross: 1200 }] }, { status: 'draft', from: '2026-02-09', to: '2026-02-15', lines: [{ empId: 'u7', gross: 9999 }] }];
let m = C.mrpPay({ start: st0 }, '2026-03-02', '2026-03-08', { runs, empKey: 'u7', empKeys: ['Wes Work'], hourlyRate: 25 }, R);
ok(m && m.amount === 1100 && /average/.test(m.detail), 'protection pay = the average of the weeks before removal (1000 + 1200 → $1,100 / week)', m);
m = C.mrpPay({ start: st0, wcWeekly: 300 }, '2026-03-02', '2026-03-08', { runs, empKey: 'u7', earned: 200 }, R);
ok(m.amount === 600 && /workers' comp/.test(m.detail), 'less workers\' comp wage replacement and pay for other work this period', m);
m = C.mrpPay({ start: st0, basis: 'normal' }, '2026-03-02', '2026-03-08', { runs: [], hourlyRate: 25, weeklyHours: 40 }, R);
ok(m.amount === 1000, 'basis "normal": 40 h × $25 = $1,000', m);
ok(C.mrpPay({ start: st0 }, '2027-09-06', '2027-09-12', { runs, empKey: 'u7' }, R) === null, 'nothing after the 18-month protected period (default)');
m = C.mrpPay({ start: st0 }, '2027-08-30', '2027-09-05', { runs, empKey: 'u7' }, R);
ok(m && m.to === '2027-09-01' && Math.abs(m.amount - 1100 * 3 / 7) < 0.02, 'the last week is paid only up to the end of the protected period', m);
ok(C.mrpPay({ start: st0, end: '2026-03-05' }, '2026-03-02', '2026-03-08', { runs, empKey: 'u7' }, R).to === '2026-03-04', 'it stops the day before they go back to exposure work');

/* ── the private store: who sees what ── */
const store = { v: 1, people: {} }, kv = {}, mails = [], todos = [], done = [];
const deps = { medGet: async () => JSON.parse(JSON.stringify(store)), medPut: async v => { Object.keys(store).forEach(k => delete store[k]); Object.assign(store, JSON.parse(JSON.stringify(v))); }, kvGet: async k => kv[k], kvPut: async (k, v) => { kv[k] = v; }, kvCas: async (k, fn) => { const v = fn(kv[k]); if (v !== undefined) kv[k] = v; return { value: kv[k] }; },
  mail: async (to, subject, html) => { mails.push({ to, subject, html }); return { ok: true }; }, todo: async it => { todos.push(it); return true; }, todoDone: async ids => { done.push(...ids); return true; }, payrollEmails: async () => ['office@example.com'] };
const ADMIN = { email: 'owner@example.com', name: 'Owner', priv: true, admin: true }, OFFICE = { email: 'office@example.com', name: 'Office', priv: true }, PM = { email: 'pat@example.com', name: 'Pat PM', priv: false }, SAM = { email: 'sam@example.com', name: 'Sam Sup', priv: false }, WES = { email: 'wes@example.com', name: 'Wes Work', priv: false };
let r = await LIB.medOp(PM, { op: 'add', email: 'sam@example.com', name: 'Sam Sup', cat: 'exposure', rec: { date: day(0), pid: 'J1', job: 'Asbestos job', task: 'scraping', result: '0.004', unit: 'f/cc', al: '0.1', pass: 'Pass', lab: 'Demo Lab', file: { ref: 'sb:crm-files/x.pdf', name: 'lab.pdf' } } }, deps);
ok(r.code === 200 && store.people['sam@example.com'].exposures.length === 1, 'the person taking a sample (a PM) can ADD a personal result to the worker\'s records', r);
const mail1 = mails.find(x => x.to.includes('sam@example.com'));
ok(mail1 && /A new air monitoring result was added/.test(mail1.subject) && !/0\.004|f\/cc|Pass/.test(mail1.subject + mail1.html), 'the worker is e-mailed "a new air monitoring result was added" — no value in the message', mail1);
ok(todos.some(t => /^ECMED_N_/.test(t.id) && t.assignees[0] === 'sam@example.com' && t.personal && !/0\.004/.test(t.label)), 'a To-Do for the worker only (no value)');
r = await LIB.medOp(PM, { op: 'person', email: 'sam@example.com' }, deps);
ok(r.code === 403, 'a PM cannot read someone else\'s records (403)');
r = await LIB.medOp(PM, { op: 'all' }, deps); ok(r.code === 403, 'nor the list of everyone');
r = await LIB.medOp(WES, { op: 'mine' }, deps); ok(r.code === 200 && r.out.rec.exposures.length === 0, 'another worker sees only their own (none)');
r = await LIB.medOp(SAM, { op: 'mine' }, deps);
ok(r.out.rec.exposures[0].result === '0.004' && !r.out.rec.notices[0].seenAt, 'the worker sees their own result (not opened yet)');
r = await LIB.medOp(OFFICE, { op: 'all' }, deps);
ok(r.code === 200 && r.out.people['sam@example.com'].unseen.length === 1, 'admins / Office Manager: the "not seen yet" list shows the new result');
r = await LIB.medOp(SAM, { op: 'mine', open: true, via: 'field' }, deps);
ok(r.out.stamped === 1 && store.people['sam@example.com'].notices[0].seenAt && store.people['sam@example.com'].opened.length === 1 && done.some(x => /^ECMED_N_/.test(x)), 'opening "My health & exposure records" stamps seen (date / time) and closes the To-Do');
r = await LIB.medOp(OFFICE, { op: 'all' }, deps); ok(r.out.people['sam@example.com'].unseen.length === 0 && r.out.people['sam@example.com'].lastOpened, 'and the admin view shows it seen');
ok(kv.gc_medical_status && kv.gc_medical_status.people['sam@example.com'] && !/0\.004|scraping|Demo Lab/.test(JSON.stringify(kv.gc_medical_status)), 'gc_medical_status (what other staff read) has no result, task or lab', kv.gc_medical_status);
r = await LIB.medOp(PM, { op: 'add', email: 'sam@example.com', cat: 'visit', rec: { date: day(-1), type: 'bloodLead', result: 'BLL 12' } }, deps); ok(r.code === 403, 'a PM cannot add a medical visit');
r = await LIB.medOp(SAM, { op: 'add', email: 'sam@example.com', cat: 'visit', rec: { date: day(-40), type: 'bloodLead', provider: 'Demo Clinic' } }, deps); ok(r.code === 200, 'the worker may write down their own doctor visit');
r = await LIB.medOp(OFFICE, { op: 'add', email: 'sam@example.com', name: 'Sam Sup', cat: 'visit', rec: { date: day(-45), type: 'fit', result: 'PASS', fit: { model: 'Demo half-face', result: 'Pass' } } }, deps); ok(r.code === 200 && kv.gc_medical_status.people['sam@example.com'].fit === 'ok', 'the Office Manager adds a fit test → status fit current');
r = await LIB.medOp(OFFICE, { op: 'jobAir', pid: 'J1', job: 'Asbestos job', sample: { date: day(0), atype: 'Clearance', result: '0.003', pass: 'Pass', sampleId: 'S1' }, workers: [{ email: 'sam@example.com', name: 'Sam Sup' }, { email: 'wes@example.com', name: 'Wes Work' }] }, deps);
ok(r.out.workers === 2 && store.people['wes@example.com'].exposures[0].scope === 'area', 'an area / clearance result goes to everyone who was on the job that day');
/* archive, never just delete; edits keep the previous values */
const vid = store.people['sam@example.com'].visits[0].id;
r = await LIB.medOp(PM, { op: 'archive', email: 'sam@example.com', cat: 'visit', id: vid, why: 'x' }, deps); ok(r.code === 403, 'a PM cannot archive');
r = await LIB.medOp(OFFICE, { op: 'archive', email: 'sam@example.com', cat: 'visit', id: vid }, deps); ok(r.code === 400, 'archive needs a reason');
r = await LIB.medOp(OFFICE, { op: 'archive', email: 'sam@example.com', cat: 'visit', id: vid, why: 'entered twice' }, deps);
ok(r.code === 200 && store.people['sam@example.com'].visits.find(v => v.id === vid).archived.why === 'entered twice', 'the Office Manager archives: the record is KEPT with who / when / why');
r = await LIB.medOp(OFFICE, { op: 'delete', email: 'sam@example.com', cat: 'visit', id: vid, why: 'y' }, deps); ok(r.code === 403, 'a true delete is admin-only');
r = await LIB.medOp(OFFICE, { op: 'restore', email: 'sam@example.com', cat: 'visit', id: vid }, deps); ok(r.code === 403, 'restore is admin-only');
r = await LIB.medOp(ADMIN, { op: 'restore', email: 'sam@example.com', cat: 'visit', id: vid }, deps); ok(r.code === 200 && !store.people['sam@example.com'].visits.find(v => v.id === vid).archived, 'an admin restores it');
r = await LIB.medOp(ADMIN, { op: 'update', email: 'sam@example.com', cat: 'visit', id: vid, patch: { provider: 'Other Clinic' } }, deps);
const vh = store.people['sam@example.com'].visits.find(v => v.id === vid).history;
ok(r.code === 200 && vh.some(h => h.prev && h.prev.provider === 'Demo Clinic' && h.by === 'Owner'), 'an edit keeps the previous value, who and when', vh);
r = await LIB.medOp(ADMIN, { op: 'delete', email: 'sam@example.com', cat: 'visit', id: vid, why: 'wrong person' }, deps);
ok(r.code === 200 && !store.people['sam@example.com'].visits.some(v => v.id === vid) && store.audit.some(a => a.op === 'delete' && a.id === vid && a.why === 'wrong person' && a.by === 'Owner'), 'an admin delete (with a reason) leaves an audit entry');
/* medical removal */
r = await LIB.medOp(PM, { op: 'add', email: 'wes@example.com', cat: 'removal', rec: { start: day(-10) } }, deps); ok(r.code === 403, 'a PM cannot record a medical removal');
r = await LIB.medOp(OFFICE, { op: 'add', email: 'wes@example.com', name: 'Wes Work', cat: 'removal', rec: { start: day(-10), reason: 'elevated blood lead per physician', criteria: 'two BLL below the return level', basis: 'average' } }, deps);
ok(r.code === 200 && kv.gc_medical_status.people['wes@example.com'].removed === true, 'a medical removal → the public status says "not cleared for exposure work" (no reason)');
const e2 = C.evaluate(asb, Object.assign({}, ctx, { medStatus: kv.gc_medical_status.people }));
ok(e2.items.some(x => x.id === 'removed:wes work' && x.st === 'block'), 'and the asbestos job shows ⛔ for that worker');
r = await LIB.medOp(OFFICE, { op: 'removals' }, deps); ok(r.out.removals.length === 1 && r.out.removals[0].email === 'wes@example.com', 'payroll reads the removals (admins / Office Manager)');
r = await LIB.medOp(PM, { op: 'removals' }, deps); ok(r.code === 403, 'a PM cannot');
r = await LIB.medOp(WES, { op: 'mine' }, deps); ok(r.out.rec.removal && r.out.rec.removal.protectEnd === C.addMonths(day(-10), 18), 'the worker sees their removal and the end of the protected pay');

/* ── the daily run ── */
mails.length = 0; todos.length = 0;
store.people['sam@example.com'].visits.push({ id: 'v9', date: C.addMonths(day(14), -2), type: 'bloodLead' });
store.people['wes@example.com'].removals[0].start = C.addMonths(day(14), -18);
kv.gc_certs = { list: certs.concat([{ id: 'c9', holderType: 'person', holder: 'wes@example.com', holderName: 'Wes Work', name: 'Asbestos Worker', issuer: 'Demo Provider', expires: day(55) }, { id: 'c10', holderType: 'person', holder: 'sam@example.com', holderName: 'Sam Sup', name: 'HazCom', expires: day(-2) }]) };
const data = { users: users.concat([{ name: 'Owner', email: 'owner@example.com', role: 'Admin' }]), projects: [asb, plain] };
let out = await LIB.run(data, deps);
const sm = mails.find(x => x.to.length === 1 && x.to[0] === 'sam@example.com' && /Blood lead/.test(x.subject));
ok(out.medical >= 1 && sm && new RegExp('due ' + md(day(14)).replace('/', '\\/')).test(sm.subject), 'medical: "Your Blood lead + ZPP test is due ' + md(day(14)) + '" to the worker (14 days)', mails.map(x => x.subject));
const pm = mails.find(x => x.to.includes('owner@example.com') && x.to.includes('office@example.com') && /Medical surveillance/.test(x.subject));
ok(pm && /Medical removal protection/.test(pm.html) && /Wes Work/.test(pm.html), 'admins + Office Manager: the due list and the end of Wes\'s protected pay (14 days)', pm && pm.html);
ok(todos.some(t => /^ECMED_RM_/.test(t.id)) && todos.some(t => /^ECMED_DUE_/.test(t.id) && !/blood/i.test(t.label)), 'To-Dos: the removal end, and "medical follow-up due" without the test name');
ok(mails.some(x => x.to[0] === 'wes@example.com' && /Asbestos Worker expires/.test(x.subject)) && mails.some(x => x.to[0] === 'sam@example.com' && /HazCom EXPIRED/.test(x.subject)), 'certifications: the worker at 60 days and once expired (refresher)', mails.map(x => x.to + ' ' + x.subject));
const jm = mails.find(x => /Environmental compliance/.test(x.subject));
ok(jm && jm.to.includes('pat@example.com') && /TDEC/.test(jm.html) && /overdue/.test(jm.html), 'jobs: the overdue state notice → admins + office + the job\'s PM', jm && jm.to);
const before = mails.length; out = await LIB.run(data, deps);
ok(mails.length === before && out.medical === 0 && out.certs === 0 && out.jobs === 0, 'nothing is repeated the next day', out);

/* ── the function: sign-in first ── */
const H = require(path.join(BUILD, 'netlify/functions/envcomp.js')).handler;
const resp = await H({ httpMethod: 'POST', headers: {}, body: '{"op":"mine"}' });
ok(resp.statusCode === 401, 'the function refuses a call without a sign-in (401)');
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
