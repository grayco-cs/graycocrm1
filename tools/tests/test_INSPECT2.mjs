// test_INSPECT2.mjs [build-dir] [shot-dir] — patch INSPECT2 (owner: "Make sure in portals or on all jobs we can schedule inspections").
// Offline, made-up data only: the CRM (index.html) in Chromium on the harness (harness_N), the REAL portal.js / sub-portal server on the
// in-memory Supabase of custportal_world.mjs, portal.html + portal-app.js in Chromium.
//
//  A. node: _lib/inspect2.js — the customer's words (date, type, Scheduled / Passed / Rescheduled; nothing internal), the switch, a sub's trade.
//  B. a PM on a phone (GrayCo Field): the job's 📋 Inspections tile → schedules an electrical inspection (type, date + window, inspector,
//     internal phone + notes, who meets) → on the company schedule at its time → "📋 Inspections coming up" on the Field Home →
//     ✗ Fail → a punch item + a To-Do to reschedule (PM + office) + the PM / office told through window._gcNotify.
//  C. the office on a computer: every job type (Residential, Environmental, Mitigation, Industrial) has the 📋 Inspections button;
//     📅 Reschedule → the old date stays in the history; the schedule item moves; 🗄 Archive keeps the row.
//  D. the customer portal: the inspections (date, type, plain result) — never the notes, the inspector, the phone, who meets or the carrier.
//  E. the sub portal: the sub sees the job's inspections for their trade, sends "📋 Request an inspection" → the PM's To-Do card →
//     the PM's 📋 Inspections "📩 Requested by subs" → 📅 Schedule it (the card closes, the sub sees "Booked").
//  F. the office turns "Show inspections on the customer portal" off → the portal hides them.
//  G. the day-before reminder (once): the PM through window._gcNotify, the sub of that trade in their portal thread.
import fs from 'fs'; import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.resolve(process.argv[2] || path.join(HERE, '../..')), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const W = await import(pathToFileURL(path.join(BUILD, 'tools/tests/custportal_world.mjs')).href);   /* the fake Supabase (global fetch) + the REAL functions */
W.setAt(new Date(W.realNow()).toISOString());   /* today's real clock (the CRM in the browser runs on it too) */
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 15000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { try { v = await f(); } catch (e) { v = null; } if (v) return v; await sleep(250); } return v; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }).catch(() => {}); };
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const IPHONE = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} }; d(Navigator.prototype, 'userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'); d(Navigator.prototype, 'maxTouchPoints', 5); })()`;
const IN2 = require(path.join(BUILD, 'netlify/functions/_lib/inspect2.js'));
const PA_NAME = 'portal-' + 'access';
const PM_E = 'pm' + '@grayco-cs.com', OF_E = 'office' + '@grayco-cs.com';

/* ═════ A. the rules ═════ */
{
  const P = { id: 'PX', name: 'Demo', portalInspections: undefined };
  const store = { PX: [
    { id: 'i1', type: 'electrical', label: 'Electrical inspection', date: '2026-12-03', from: '08:00', to: '10:00', status: 'scheduled', inspector: 'Bartlett Code Office', phone: '901-555-0177', notes: 'INTERNAL gate 4411', meet: 'Demo PM',
      history: [{ what: 'rescheduled', from: { date: '2026-11-20' }, to: { date: '2026-12-03' }, note: 'INTERNAL reason' }] },
    { id: 'i2', type: 'framing', label: 'Framing inspection', date: '2026-11-10', status: 'passed', notes: 'INTERNAL' },
    { id: 'i3', type: 'plumbing', label: 'Plumbing inspection', date: '2026-11-12', status: 'failed', resultNote: 'INTERNAL leak' },
    { id: 'i4', label: 'Final', date: '2026-11-01', done: true },
    { id: 'i5', type: 'mold', label: 'Mold clearance inspection', date: '2026-12-05', status: 'scheduled', archived: true }] };
  const v = IN2.custView(store, P, '2026-11-18'), js = JSON.stringify(v);
  ok('A1 the customer sees upcoming (date, time window, type, "Scheduled") and past ("Passed" / "Rescheduled"; the moved date too); an archived one is not shown',
    v.upcoming.length === 1 && v.upcoming[0].type === 'Electrical inspection' && v.upcoming[0].window === '8 AM – 10 AM' && v.upcoming[0].result === 'Scheduled' &&
    v.past.some(x => x.date === '2026-11-20' && x.result === 'Rescheduled') && v.past.some(x => x.type === 'Framing inspection' && x.result === 'Passed') && v.past.some(x => x.type === 'Plumbing inspection' && x.result === 'Rescheduled') &&
    v.past.some(x => x.type === 'Final inspection' && x.result === 'Passed') && !/Mold/.test(js), v);
  ok('A1 … and nothing internal: no notes, inspector, phone, who meets, the reason or the word "failed"', !/INTERNAL|Bartlett|555-0177|Demo PM|4411|fail/i.test(js), js);
  ok('A2 the job\'s switch off (portalInspections false) → nothing', IN2.custView(store, Object.assign({}, P, { portalInspections: false }), '2026-11-18') === null);
  const sv = IN2.subView(store, P, 'Electrical', '2026-11-18').map(x => x.type), sv2 = IN2.subView(store, P, 'Plumbing', '2026-11-18').map(x => x.type), sv0 = IN2.subView(store, P, '', '2026-11-18').map(x => x.type);
  ok('A3 a sub sees the inspections of their trade (+ building / final for everyone); no trade → all of the job\'s', sv.includes('Electrical inspection') && !sv.includes('Plumbing inspection') && sv.includes('Final inspection') && sv2.includes('Plumbing inspection') && !sv2.includes('Electrical inspection') && sv0.length === 4, { sv, sv2, sv0 });
  ok('A4 a request needs a known type and a day from today on', IN2.cleanReq({ type: 'nope', date: '2026-12-01' }, '2026-11-18').error && IN2.cleanReq({ type: 'final', date: '2026-11-01' }, '2026-11-18').error && IN2.cleanReq({ type: 'final', date: '2026-12-01', note: 'x' }, '2026-11-18').type === 'final');
  const U = [{ name: 'Demo PM', email: 'pm@x.test' }, { name: 'Sue Super', email: 'sue@x.test' }];
  ok('A5 a request goes to the PM — the superintendent on a commercial job', IN2.ownerOf({ pm: 'Demo PM', superintendent: 'Sue Super', type: 'Residential Reno' }, U).email === 'pm@x.test' && IN2.ownerOf({ pm: 'Demo PM', superintendent: 'Sue Super', type: 'Commercial TI' }, U).email === 'sue@x.test');
}

/* ═════ the made-up company ═════ */
const now = () => new Date().toISOString();
const USERS = [{ id: 'u2', name: 'Demo PM', email: PM_E, role: 'Project Manager', phone: '901-555-0110', active: true },
  { id: 'u5', name: 'Office Demo', email: OF_E, role: 'Office Manager', active: true }, { id: 'u6', name: 'Sue Super', email: 'sue.super@demo.test', role: 'Superintendent', active: true }];
const SUBE = { id: 'SUBELEC1', name: 'Volt Demo Electric', company: 'Volt Demo Electric', contact: 'Vic Volt', phone: '901-555-0150', email: 'vic@voltdemo.test', isSub: true, trade: 'Electrical' };
const SUBP = { id: 'SUBPLMB1', name: 'Demo Pipe Plumbing', company: 'Demo Pipe Plumbing', contact: 'Pam Pipe', phone: '901-555-0151', email: 'pam@demopipe.test', isSub: true, trade: 'Plumbing' };
const P1 = { id: 'PINS1', name: 'Demo Kitchen & Bath', client: 'Pat Demo', clientEmail: 'pat@demo.test', clientPhone: '901-555-0101', address: '12 Demo St, Bartlett, TN 38134', pm: 'Demo PM', status: 'Active', type: 'Residential Reno',
  contract: 42000, contractSigned: true, autoPO: 'T811', startDate: day(-10), pct: 30, insCarrier: 'Zebra Mutual Insurance', insuranceCompany: 'Zebra Mutual Insurance',
  subs: [{ id: 'r1', subId: SUBE.id, name: SUBE.name, trade: 'Electrical', status: 'Awarded' }, { id: 'r2', subId: SUBP.id, name: SUBP.name, trade: 'Plumbing', status: 'Awarded' }], createdAt: now(), updatedAt: now() };
const P2 = { id: 'PINS2', name: 'Demo Mold Clearance House', client: 'Eve Demo', address: '40 Demo Rd, Memphis, TN', pm: 'Demo PM', status: 'Active', type: 'Mold remediation', companyId: 'environmental', contract: 9000, contractSigned: true, autoPO: 'E812', createdAt: now(), updatedAt: now() };
const P3 = { id: 'PINS3', name: 'Demo Water Loss', client: 'Mo Demo', address: '41 Demo Rd, Memphis, TN', pm: 'Demo PM', status: 'Active', type: 'Water mitigation', companyId: 'mitigation', contract: 6000, contractSigned: true, autoPO: 'M813', createdAt: now(), updatedAt: now() };
const P4 = { id: 'PINS4', name: 'Demo Plant Retrofit', client: 'Demo Industrial LLC', address: '42 Demo Pkwy, Memphis, TN', pm: 'Demo PM', superintendent: 'Sue Super', status: 'Active', type: 'Industrial', contract: 150000, contractSigned: true, autoPO: 'I814', createdAt: now(), updatedAt: now() };
const JOBS = [P1, P2, P3, P4];
H.resetCloud();
H.cset('users', USERS); H.cset('projects', JOBS); H.cset('vendors', [SUBE, SUBP]); H.cset('subs', [SUBE, SUBP]); H.cset('schedule', []); H.cset('punch', [{ id: 'PEXIST1', pid: 'PINS1', item: 'Existing punch item', status: 'open', updatedAt: now() }]); H.cset('gc_office_tasks', '[]');
const NOTIFY = [], SSEND = [];
H.onFn('appr-away', ({ body }) => { if (body && body.op === 'notify') NOTIFY.push(body); return { ok: true, to: [].concat(body && body.to || []), pushed: [] }; });
H.onFn(PA_NAME, ({ body }) => { if (body && body.action === 's-send') SSEND.push(body); return { ok: true }; });
const cloudJson = k => { let v = H.cget(k); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
const lsRows = (pid) => JSON.parse(localStorage.getItem('gc_job_inspections') || '{}')[pid] || [];
void lsRows;

/* ═════ B. the PM on a phone ═════ */
const T1 = day(3), T2 = day(9);
let INS = null;
const pm = await H.computer('PM', { build: BUILD, mobile: true, init: [IPHONE] }); const pp = pm.page();
try {
  await H.signIn(pm, PM_E, 12000);
  ok('B0 the phone opens in GrayCo Field', !!(await H.waitFor(pm, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 40000)));
  await sleep(2500);
  /* the job page (the Field job dashboard) → its 📋 Inspections tile */
  await pm.ev(pid => { if (window._gcJobDashboard) window._gcJobDashboard(pid); }, P1.id);
  const SEL = '#_gcJobDash [data-fa="insp"], #_gcJobDash [data-tool="insp"], #_gcJobPick [data-fa="insp"][data-pid="PINS1"]';
  let tile = await H.waitFor(pm, sel => { const b = document.querySelector(sel); return b ? b.textContent.trim() : null; }, SEL, 15000);
  ok('B1 the job page has a "📋 Inspections" tile', !!tile && /Inspections/.test(tile), tile || await pm.ev(() => [...document.querySelectorAll('[data-fa]')].map(b => b.getAttribute('data-fa') + ':' + b.getAttribute('data-pid')).slice(0, 40)));
  if (tile) await pp.locator(SEL).first().click(); else await pm.ev(pid => window._gcFieldTools.run('insp', pid), P1.id);
  const panel = await H.waitFor(pm, () => { const o = document.getElementById('gi2-panel'); return o ? o.innerText : null; }, null, 8000);
  ok('B1 … it opens the job\'s 📋 Inspections with "＋ Schedule an inspection" for the PM', !!panel && /Inspections — Demo Kitchen & Bath/.test(panel) && /Schedule an inspection/.test(panel), panel);
  await pp.click('[data-gi2-a="new"]');
  await pp.waitForSelector('#gi2-type');
  const opts = await pm.ev(() => [...document.querySelectorAll('#gi2-type option')].map(o => o.textContent));
  ok('B2 the types: building, electrical, plumbing, mechanical, framing, final, lead / asbestos / mold clearance, other', ['Building', 'Electrical', 'Plumbing', 'Mechanical', 'Framing', 'Final', 'Lead clearance', 'Asbestos clearance', 'Mold clearance', 'Other'].every(x => opts.includes(x)), opts);
  await pp.selectOption('#gi2-type', 'electrical'); await pp.fill('#gi2-date', T1); await pp.fill('#gi2-from', '08:00'); await pp.fill('#gi2-to', '10:00');
  await pp.fill('#gi2-insp', 'Bartlett Code Enforcement'); await pp.fill('#gi2-phone', '901-555-0177'); await pp.fill('#gi2-notes', 'INTERNAL gate code 4411');
  const meetOpts = await pm.ev(() => [...document.querySelectorAll('#gi2-meet option')].map(o => o.value));
  await pp.selectOption('#gi2-meet', 'Demo PM');
  await shot(pp, 'insp2_b2_phone_form');
  await pp.click('#gi2-save');
  INS = await H.waitFor(pm, pid => { const l = (JSON.parse(localStorage.getItem('gc_job_inspections') || '{}')[pid] || []); return l.find(r => r.type === 'electrical') || null; }, P1.id, 8000);
  ok('B2 saved on the job\'s inspections list: electrical, date, 8–10 AM, inspector, internal phone + notes, who meets (picked from the job\'s team + subs)', !!INS && INS.date === T1 && INS.from === '08:00' && INS.to === '10:00' && INS.inspector === 'Bartlett Code Enforcement' && INS.phone === '901-555-0177' && INS.meet === 'Demo PM' && INS.status === 'scheduled' && INS.history.length === 1 && meetOpts.includes('Volt Demo Electric'), { INS, meetOpts });
  const cl = await until(() => { const v = cloudJson('gc_job_inspections'); return v && v[P1.id] && v[P1.id].some(r => r.id === INS.id) ? v : null; }, 20000);
  ok('B2 … and in the cloud (gc_job_inspections), so the portals see it', !!cl);
  const si = await H.waitFor(pm, id => { const s = (window._crm.schedule || []).find(x => x && x.id === 'SCH_INS_' + id); return s ? { date: s.date, time: s.time, endTime: s.endTime, title: s.title, assignee: s.assignee, type: s.type } : null; }, INS.id, 10000);
  ok('B3 it is on the company schedule (the crew sees it): the date, 8:00–10:00, "Demo Kitchen & Bath — Electrical inspection", for the person meeting the inspector', !!si && si.date === T1 && si.time === '08:00' && si.endTime === '10:00' && si.title === 'Demo Kitchen & Bath — Electrical inspection' && si.assignee === 'Demo PM' && si.type === 'inspection', si);
  /* a second one (plumbing) through the API — the sub test needs one of another trade */
  await pm.ev(([pid, d]) => window._gcInsp2.schedule(pid, { type: 'plumbing', date: d, from: '13:00', to: '15:00', inspector: 'Shelby County', notes: 'INTERNAL plumbing note', meet: 'Demo Pipe Plumbing' }), [P1.id, T2]);
  /* home */
  await pm.ev(() => { ['gi2-panel', 'gi2-form', '_gcJobDash'].forEach(id => { const o = document.getElementById(id); if (o) o.remove(); }); });
  const home = await H.waitFor(pm, () => { const c = document.getElementById('gi2-field-home'); return c && c.offsetParent !== null ? c.innerText : null; }, null, 12000);
  ok('B4 the Field Home shows "📋 Inspections coming up" with the electrical one (date, time) for the PM on the job', !!home && /Inspections coming up/.test(home) && /Electrical inspection/.test(home) && /8 AM – 10 AM/.test(home) && /Demo Kitchen & Bath/.test(home), home);
  await shot(pp, 'insp2_b4_field_home');
  /* ✗ fail */
  await pp.click('#gi2-field-home [data-ins="' + INS.id + '"]');
  await pp.waitForSelector('#gi2-panel [data-gi2-row="' + INS.id + '"] [data-gi2-a="result"]');
  await pp.click('#gi2-panel [data-gi2-row="' + INS.id + '"] [data-gi2-a="result"]');
  await pp.waitForSelector('#gi2-rsave');
  await pp.click('[data-res="fail"]'); await pp.fill('#gi2-rnote', 'Missing GFCI by the kitchen sink');
  await pp.setInputFiles('#gi2-rph', { name: 'tag.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await shot(pp, 'insp2_b5_fail_form');
  await pp.click('#gi2-rsave');
  const failed = await H.waitFor(pm, ([pid, id]) => { const r = (JSON.parse(localStorage.getItem('gc_job_inspections') || '{}')[pid] || []).find(x => x.id === id); return r && r.status === 'failed' ? r : null; }, [P1.id, INS.id], 15000);
  ok('B5 ✗ Fail is recorded (note, who, the photo noted, the history line)', !!failed && failed.result === 'Failed' && failed.resultNote === 'Missing GFCI by the kitchen sink' && failed.resultBy === 'Demo PM' && failed.history.some(h => h.what === 'result' && h.result === 'Failed' && h.photo === true), failed);
  const punch = await H.waitFor(pm, async id => { const l = (window.idbGet ? await window.idbGet('punch') : null) || []; const x = l.find(p => String(p.id).indexOf('PI-insp2-' + id) === 0); return x ? x : null; }, INS.id, 8000);
  ok('B5 → a punch item on the job ("Failed electrical inspection — Missing GFCI …")', !!punch && punch.pid === P1.id && /^Failed electrical inspection — Missing GFCI/.test(punch.item) && punch.status === 'open', punch);
  const todo = await H.waitFor(pm, id => { const l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return l.find(t => t.kind === 'insp_fail' && t.insId === id) || null; }, INS.id, 8000);
  ok('B5 → a To-Do to reschedule for the PM and the office', !!todo && /Reschedule the electrical inspection — Demo Kitchen & Bath/.test(todo.label) && todo.assignees.includes(PM_E) && todo.assignees.includes(OF_E) && !todo.done, todo);
  const nf = await until(() => NOTIFY.find(n => /FAILED/.test(n.title)), 8000);
  ok('B5 → the office (and the PM\'s team) told through window._gcNotify (quiet hours / Away handled there)', !!nf && [].concat(nf.to).includes(OF_E) && /Electrical inspection — Demo Kitchen & Bath/.test(nf.title) && /GFCI/.test(nf.body), NOTIFY);
  const tot = await until(() => { const p = cloudJson('punch'); return Array.isArray(p) && p.some(x => String(x.id).indexOf('PI-insp2-') === 0) ? p : 0; }, 15000);
  ok('B5 the punch item reaches the cloud — the job\'s other punch items are kept', !!tot && tot.some(x => x.id === 'PEXIST1'), tot);
  const home2 = await H.waitFor(pm, () => { const c = document.getElementById('gi2-field-home'); return c && /needs a new date/.test(c.innerText) ? c.innerText : null; }, null, 8000);
  ok('B6 the Field Home now flags it "⚠ needs a new date"', !!home2, await pm.ev(() => (document.getElementById('gi2-field-home') || {}).innerText));
  ok('B no page errors on the phone', pm.errs.length === 0, pm.errs.slice(0, 5));
} catch (e) { ok('B crashed: ' + (e && e.stack || e), false); }

/* ═════ C. the office on a computer ═════ */
const off = await H.computer('OFFICE', { build: BUILD }); const op = off.page();
let RES = null;
try {
  await H.signIn(off, OF_E, 12000);
  await sleep(3000);
  const hasRow = await H.waitFor(off, ([pid, id]) => (JSON.parse(localStorage.getItem('gc_job_inspections') || '{}')[pid] || []).some(r => r.id === id && r.status === 'failed'), [P1.id, INS && INS.id], 30000);
  ok('C0 the office\'s computer has the PM\'s inspection (synced)', !!hasRow);
  const btns = {};
  for (const j of JOBS) {
    await off.ev(() => { try { window._setView('projects'); } catch (e) {} }); await sleep(900);
    await off.ev(id => window._navToJob(id), j.id);
    btns[j.type] = await H.waitFor(off, pid => { const b = document.querySelector('.gcx10-jobbar[data-pid="' + pid + '"] [data-x10="insp"]'); return b && b.offsetParent !== null ? b.textContent.trim() : null; }, j.id, 15000);
  }
  ok('C1 every job type has the "📋 Inspections" button on its job page (Residential, Environmental, Mitigation, Industrial)', Object.values(btns).length === 4 && Object.values(btns).every(t => /📋 Inspections/.test(t || '')), btns);
  await off.ev(() => { try { window._setView('projects'); } catch (e) {} }); await sleep(900);
  await off.ev(id => window._navToJob(id), P2.id);
  await H.waitFor(off, pid => !!document.querySelector('.gcx10-jobbar[data-pid="' + pid + '"] [data-x10="insp"]'), P2.id, 15000);
  await op.click('.gcx10-jobbar[data-pid="' + P2.id + '"] [data-x10="insp"]');
  await op.waitForSelector('#gi2-panel [data-gi2-a="new"]');
  await op.click('[data-gi2-a="new"]'); await op.waitForSelector('#gi2-type');
  await op.selectOption('#gi2-type', 'mold'); await op.fill('#gi2-date', day(6)); await op.click('#gi2-save');
  const mold = await H.waitFor(off, pid => (JSON.parse(localStorage.getItem('gc_job_inspections') || '{}')[pid] || []).find(r => r.type === 'mold') || null, P2.id, 8000);
  ok('C2 the Environmental job: a mold clearance inspection is scheduled from the desk', !!mold && mold.label === 'Mold clearance inspection', mold);
  await off.ev(() => { ['gi2-panel', 'gi2-form'].forEach(id => { const o = document.getElementById(id); if (o) o.remove(); }); });
  /* 📅 reschedule the failed one */
  await off.ev(() => { try { window._setView('projects'); } catch (e) {} }); await sleep(900);
  await off.ev(id => window._navToJob(id), P1.id);
  await H.waitFor(off, pid => !!document.querySelector('.gcx10-jobbar[data-pid="' + pid + '"] [data-x10="insp"]'), P1.id, 15000);
  await op.click('.gcx10-jobbar[data-pid="' + P1.id + '"] [data-x10="insp"]');
  const pan = await H.waitFor(off, () => { const o = document.getElementById('gi2-panel'); return o ? o.innerText : null; }, null, 8000);
  ok('C3 the panel shows it under "⚠ Needs a re-inspection" with the internal notes for staff, and the portal switch (on)', !!pan && /Needs a re-inspection/.test(pan) && /Failed — reschedule/.test(pan) && /INTERNAL gate code 4411/.test(pan) &&
    await off.ev(() => { const c = document.querySelector('[data-gi2-portal]'); return !!c && c.checked; }), pan);
  await shot(op, 'insp2_c3_desk_panel');
  await op.click('#gi2-panel [data-gi2-row="' + INS.id + '"] [data-gi2-a="resched"]');
  await op.waitForSelector('#gi2-date');
  await op.fill('#gi2-date', day(5)); await op.fill('#gi2-from', '09:00'); await op.fill('#gi2-to', '11:00'); await op.fill('#gi2-why', 'GFCI installed — re-inspection');
  await op.click('#gi2-save');
  RES = await H.waitFor(off, ([pid, id]) => { const r = (JSON.parse(localStorage.getItem('gc_job_inspections') || '{}')[pid] || []).find(x => x.id === id); return r && r.status === 'scheduled' ? r : null; }, [P1.id, INS.id], 8000);
  const hr = RES && RES.history.find(h => h.what === 'rescheduled');
  ok('C4 📅 Reschedule: the new date + window, back to Scheduled; the history keeps the old date (after the fail), who and why', !!RES && RES.date === day(5) && RES.from === '09:00' && !!hr && hr.from.date === T1 && hr.to.date === day(5) && hr.after === 'failed' && hr.by === 'Office Demo' && /GFCI installed/.test(hr.note) && RES.history.some(h => h.what === 'result' && h.result === 'Failed'), RES);
  const pan2 = await H.waitFor(off, () => { const o = document.getElementById('gi2-panel'); return o && /Rescheduled from/.test(o.innerText) ? o.innerText : null; }, null, 6000);
  ok('C4 … the panel shows "📅 Rescheduled from … to …" on the row', !!pan2, pan2);
  const si2 = await until(() => { const l = cloudJson('schedule'); const s = Array.isArray(l) && l.find(x => x && x.id === 'SCH_INS_' + INS.id); return s && s.time === '09:00' ? s : null; }, 20000);
  ok('C5 the schedule item moved with it (same item, new day 9–11 — in the cloud for every device)', !!si2 && si2.date === day(5) && si2.endTime === '11:00' && !si2.done, si2 || await off.ev(id => ({ items: (window._crm.schedule || []).filter(x => x && /SCH_INS_/.test(x.id)).map(x => [x.id, x.date, x.time, x.done]), n: (window._crm.schedule || []).length, want: 'SCH_INS_' + id }), INS.id));
  const ft = await off.ev(id => (JSON.parse(localStorage.getItem('gc_office_tasks') || '[]')).filter(t => t.kind === 'insp_fail' && t.insId === id).map(t => t.done), INS.id);
  ok('C5 the "reschedule" To-Do is closed by the reschedule', ft.length >= 1 && ft.every(Boolean), ft);
  /* 🗄 archive (never delete) */
  const arch = await off.ev(([pid, d]) => { const r = window._gcInsp2.schedule(pid, { type: 'other', other: 'Fire sprinkler', date: d }); const a = window._gcInsp2.archive(pid, r.row.id, 'not needed'); const all = window._gcInsp2.list(pid, true); return { a: !!a.ok, kept: all.some(x => x.id === r.row.id && x.archived === true && x.archivedBy === 'Office Demo'), shown: window._gcInsp2.list(pid).some(x => x.id === r.row.id) }; }, [P1.id, day(12)]);
  ok('C6 🗄 Archive keeps the row (archived, with who / why) — off the list, never deleted', arch.a && arch.kept && !arch.shown, arch);
  ok('C no page errors on the computer', off.errs.length === 0, off.errs.slice(0, 5));
} catch (e) { ok('C crashed: ' + (e && e.stack || e), false); }

/* ═════ the cloud → the portal world (the same keys the CRM wrote) ═════ */
async function toWorld(){
  await sleep(2500);
  ['projects', 'users', 'vendors', 'subs', 'schedule', 'punch', 'gc_job_inspections', 'gc_office_tasks'].forEach(k => { const v = H.cget(k); if (v !== undefined) W.put(k, v); });
  W.resetCaches(); try { require(path.join(BUILD, 'netlify/functions/' + PA_NAME + '.js'))._core._reset(); } catch (e) {}
}
const LINK = W.tok();
W.TABLES.gc_portal = [{ token: LINK, project_id: P1.id, revoked: false, created_at: now() }];
W.put('gc_portal_gate', [{ id: '_meta', since: '2026-10-24T00:00:00Z', gf: {} }]);

/* ═════ D. the customer portal ═════ */
const srv = await W.startServer();
const browser = await W.launch();
const perrs = [];
const BASE = 'http://' + W.HOST + ':' + srv.PORT;
async function custPage(){
  const ctx = await W.context(browser, 'phone'); const p = await ctx.newPage(); p.on('pageerror', e => perrs.push(String(e.message).slice(0, 200)));
  await p.goto(BASE + '/#t=' + LINK, { waitUntil: 'domcontentloaded' });
  return { ctx, p };
}
try {
  await toWorld();
  const v = (await W.handlerCall('portal', { action: 'view' }, { 'x-portal-token': LINK })).data;
  const I = v && v.inspections, js = JSON.stringify(I || {});
  ok('D1 the portal view has the job\'s inspections: the electrical one on its new date ("Scheduled", 9 AM – 11 AM) and the old date "Rescheduled"', !!I && I.upcoming.some(x => x.type === 'Electrical inspection' && x.date === day(5) && x.window === '9 AM – 11 AM' && x.result === 'Scheduled') && I.past.some(x => x.type === 'Electrical inspection' && x.date === T1 && x.result === 'Rescheduled') && I.upcoming.some(x => x.type === 'Plumbing inspection'), I || v);
  ok('D1 … without anything internal: no notes, inspector, phone, who meets, the reason, "failed", the archived one, the carrier', !/INTERNAL|4411|Bartlett|Shelby|555-0177|Demo PM|Demo Pipe|GFCI|fail|Fire sprinkler|Zebra/i.test(js), js);
  {   /* the GC / owner page (gc-portal) carries the same customer words */
    const G = require(path.join(BUILD, 'netlify/functions/_lib/gcp.js')), C = require(path.join(BUILD, 'netlify/functions/portal.js'))._core;
    const data = await C.crmData(true), job = C.findProject(data, P1.id), gv = await G.gcView(data, job), gjs = JSON.stringify(gv.inspections || {});
    ok('D1 the GC / owner page gets the same plain list (gc-view), nothing internal', !!gv.inspections && gv.inspections.upcoming.some(x => x.type === 'Electrical inspection') && !/INTERNAL|4411|Bartlett|555-0177|GFCI|fail|Zebra/i.test(gjs) && gv.schedule.some(x => /Electrical inspection/.test(x.title)), { i: gv.inspections, s: gv.schedule });
  }
  const { ctx, p } = await custPage();
  const card = await until(() => p.evaluate(() => { const c = document.getElementById('gcInsp'); return c ? c.innerText : null; }), 30000);
  ok('D2 the customer\'s Home page shows "📋 Inspections" (coming up + past) with plain words', !!card && /Inspections/.test(card) && /Electrical inspection/.test(card) && /Scheduled/.test(card) && /Rescheduled/.test(card) && /9 AM – 11 AM/.test(card), card || await p.evaluate(() => document.body.innerText.slice(0, 300)));
  const body = await p.evaluate(() => document.body.innerText);
  ok('D2 … nothing internal anywhere on the page (notes, inspector, phone, the carrier)', !/INTERNAL|4411|Bartlett Code|555-0177|GFCI|Zebra Mutual/i.test(body), body.slice(0, 400));
  await shot(p, 'insp2_d2_customer_portal');
  await ctx.close();
} catch (e) { ok('D crashed: ' + (e && e.stack || e), false); }

/* ═════ E. the sub portal ═════ */
const SESS = 'S'.repeat(43), SUBLINK = 'L'.repeat(43), SESSP = 'Q'.repeat(43), SUBLINKP = 'K'.repeat(43);
W.TABLES.gc_sub_link = [{ token: SUBLINK, sub_id: SUBE.id, revoked: false, created_at: now() }, { token: SUBLINKP, sub_id: SUBP.id, revoked: false, created_at: now() }];
W.TABLES.gc_portal_session = [{ id: W.sha(SESS), kind: 'partner', sub_id: SUBE.id, links: [SUBLINK], created_at: now(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), last_seen_at: now(), revoked: false },
  { id: W.sha(SESSP), kind: 'partner', sub_id: SUBP.id, links: [SUBLINKP], created_at: now(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), last_seen_at: now(), revoked: false }];
const sub = (action, b, sess) => W.handlerCall(PA_NAME, Object.assign({ action }, b || {}), { 'x-portal-session': sess || SESS });
const reqDay = day(7);
try {
  let r = await sub('p-job', { projectId: P1.id });
  const types = (r.data.inspections || []).map(x => x.type), js = JSON.stringify(r.data.inspections || []);
  ok('E1 the electrician sees the job\'s electrical inspection (not the plumbing one), with the date / time — nothing internal', r.status === 200 && types.includes('Electrical inspection') && !types.includes('Plumbing inspection') && !/INTERNAL|Bartlett|555-0177|4411|GFCI/i.test(js), r.data.inspections || r);
  const rp = await sub('p-job', { projectId: P1.id }, SESSP);
  ok('E1 … the plumber sees the plumbing one', rp.status === 200 && (rp.data.inspections || []).some(x => x.type === 'Plumbing inspection') && !(rp.data.inspections || []).some(x => x.type === 'Electrical inspection'), rp.data.inspections || rp);
  const bad = await sub('p-insp-req', { projectId: P1.id, type: 'final', date: day(-2) });
  const notMine = await sub('p-insp-req', { projectId: P2.id, type: 'final', date: reqDay });
  ok('E2 a request for a past day is refused; a job the sub is not on is refused', bad.status === 400 && notMine.status === 404, [bad, notMine.status]);
  /* the sub portal page: 📋 Inspections card + Request an inspection */
  const ctx = await W.context(browser, 'phone'); const p = await ctx.newPage(); p.on('pageerror', e => perrs.push('sub: ' + String(e.message).slice(0, 200))); p.on('dialog', d => d.accept().catch(() => {}));
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(([s]) => { localStorage.setItem('gc_portal_s', s); localStorage.setItem('gc_lang', 'en'); }, [SESS]);
  await p.goto(BASE + '/#job=' + P1.id, { waitUntil: 'domcontentloaded' }); await p.reload({ waitUntil: 'domcontentloaded' });
  const card = await until(() => p.evaluate(() => { const c = document.getElementById('subInsp'); return c ? c.innerText : null; }), 30000);
  ok('E3 the sub\'s job page has "📋 Inspections" (their trade) and "📋 Request an inspection"', !!card && /Electrical inspection/.test(card) && !/Plumbing inspection/.test(card) && /Request an inspection/.test(card), card || await p.evaluate(() => document.body.innerText.slice(0, 300)));
  await p.click('#inReqBtn'); await p.waitForSelector('#inType');
  await p.selectOption('#inType', 'final'); await p.fill('#inDay', reqDay); await p.fill('#inNote', 'Panel and devices done — ready for the final');
  await shot(p, 'insp2_e3_sub_request');
  await p.click('#inSend');
  const asked = await until(() => p.evaluate(() => { const c = document.getElementById('subInsp'); return c && /Requested — waiting/.test(c.innerText) ? c.innerText : null; }), 15000);
  ok('E4 sent → the card shows "⏳ Requested — waiting for your PM to book it"', !!asked, await p.evaluate(() => (document.getElementById('subInsp') || {}).innerText));
  const tasks = () => { let l = W.get('gc_office_tasks'); if (typeof l === 'string') l = JSON.parse(l); return Array.isArray(l) ? l : []; };
  const tq = tasks().find(t => t.kind === 'insp_req');
  ok('E4 → a To-Do card for the job\'s PM: "📋 Volt Demo Electric asks for a Final inspection — Demo Kitchen & Bath", the day and the note', !!tq && tq.assignees[0] === PM_E && /^📋 Volt Demo Electric asks for a Final inspection — Demo Kitchen & Bath/.test(tq.label) && tq.inspReq.date === reqDay && /ready for the final/.test(tq.inspReq.note) && tq.pid === P1.id && !tq.done, tq);
  /* the PM's phone gets the card (the To-Do list syncs) */
  H.cset('gc_office_tasks', JSON.stringify(tasks()));
  await pm.ev(v => { localStorage.setItem('gc_office_tasks', v); }, JSON.stringify(tasks()));
  await pm.ev(pid => window._gcInsp2.open(pid), P1.id);
  const rq = await H.waitFor(pm, () => { const c = document.querySelector('#gi2-panel [data-gi2-req]'); return c ? c.innerText : null; }, null, 8000);
  ok('E5 the PM\'s 📋 Inspections shows "📩 Requested by subs": Volt Demo Electric — Final inspection — with "📅 Schedule it"', !!rq && /Volt Demo Electric/.test(rq) && /Final inspection/.test(rq) && /Schedule it/.test(rq), rq);
  await pp.click('#gi2-panel [data-gi2-a="fromreq"]'); await pp.waitForSelector('#gi2-save');
  const pre = await pm.ev(() => ({ t: document.getElementById('gi2-type').value, d: document.getElementById('gi2-date').value, n: document.getElementById('gi2-notes').value }));
  ok('E5 … prefilled with the type, the day and the sub\'s note', pre.t === 'final' && pre.d === reqDay && /ready for the final/.test(pre.n), pre);
  await pp.fill('#gi2-insp', 'Bartlett Code Enforcement'); await pp.click('#gi2-save');
  const booked = await H.waitFor(pm, pid => { const l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); const t = l.find(x => x.kind === 'insp_req'); const r = (JSON.parse(localStorage.getItem('gc_job_inspections') || '{}')[pid] || []).find(x => x.type === 'final'); return t && t.done && r ? { t, r } : null; }, P1.id, 8000);
  ok('E6 booked → the inspection is on the job (linked to the request) and the To-Do card is closed', !!booked && booked.r.reqId === tq.inspReq.id && booked.r.date === reqDay, booked);
  await until(() => { const l = cloudJson('gc_office_tasks'); return Array.isArray(l) && l.some(t => t.kind === 'insp_req' && t.done); }, 20000);
  await toWorld();
  const after = await sub('p-job', { projectId: P1.id });
  ok('E6 the sub sees it booked ("Booked by GrayCo") and the final inspection on their list', after.status === 200 && (after.data.inspReqs || []).some(x => x.state === 'scheduled') && (after.data.inspections || []).some(x => x.type === 'Final inspection' && x.date === reqDay), [after.data.inspReqs, after.data.inspections]);
  await ctx.close();
} catch (e) { ok('E crashed: ' + (e && e.stack || e), false); }

/* ═════ F. the portal switch ═════ */
try {
  await off.ev(pid => { ['gi2-panel', 'gi2-form'].forEach(id => { const o = document.getElementById(id); if (o) o.remove(); }); window._gcInsp2.open(pid); }, P1.id);
  await op.waitForSelector('[data-gi2-portal]');
  await op.click('[data-gi2-portal]');
  const offp = await until(() => { const l = cloudJson('projects') || []; const p = l.find(x => x.id === P1.id); return p && p.portalInspections === false ? p : null; }, 20000);
  ok('F1 the office turns "Show inspections on the customer portal" off → saved on the job', !!offp && offp.portalInspectionsBy === 'Office Demo', offp && { pi: offp.portalInspections });
  await toWorld();
  const v = (await W.handlerCall('portal', { action: 'view' }, { 'x-portal-token': LINK })).data;
  ok('F2 the portal view has no inspections now', v && v.ok && !v.inspections, v && v.inspections);
  {
    const G = require(path.join(BUILD, 'netlify/functions/_lib/gcp.js')), C = require(path.join(BUILD, 'netlify/functions/portal.js'))._core;
    const data = await C.crmData(true), gv = await G.gcView(data, C.findProject(data, P1.id));
    ok('F2 … nor the GC / owner page (its list, and the inspection items on its schedule)', !gv.inspections && !gv.schedule.some(x => /inspection/i.test(x.title)), { i: gv.inspections, s: gv.schedule });
  }
  const { ctx, p } = await custPage();
  await until(() => p.evaluate(() => !!document.getElementById('hello') && !document.getElementById('hello').hidden), 30000); await sleep(800);
  ok('F2 … and the customer\'s page shows no "📋 Inspections" card', await p.evaluate(() => !document.getElementById('gcInsp')));
  await ctx.close();
  ok('F3 the PM (not office / admin) cannot flip the switch', await pm.ev(pid => !!window._gcInsp2.portal(pid, true).error, P1.id));
} catch (e) { ok('F crashed: ' + (e && e.stack || e), false); }

/* ═════ G. the day-before reminder (PM / super through _gcNotify; the subs it touches through their portal thread) ═════ */
try {
  const g = await pm.ev(([pid]) => { const x = new Date(); x.setDate(x.getDate() + 1); const d = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');   /* the phone's own tomorrow */
    const r = window._gcInsp2.schedule(pid, { type: 'electrical', date: d, from: '10:00', to: '12:00', meet: 'Demo PM' }); const night = window._gcInsp2.remindTick(22); const n = window._gcInsp2.remindTick(10); const n2 = window._gcInsp2.remindTick(11); return { id: r.row && r.row.id, night, n, n2, hidden: document.hidden }; }, [P1.id]);
  ok('G0 at night (10 PM) nothing is sent — it waits for 7 AM', g.night === 0, g);
  {
    await sleep(1500);
    ok('G1 the day before: one reminder (not twice)', g.n >= 1 && g.n2 === 0, g);
    ok('G1 … to the PM through window._gcNotify', NOTIFY.some(n => /Electrical inspection tomorrow/.test(n.title) && [].concat(n.to).includes(PM_E)), NOTIFY.map(n => n.title));
    ok('G1 … and the electrician (their trade) in their portal thread — not the plumber', SSEND.some(m => m.party === 's:' + SUBE.id && /Reminder: Electrical inspection tomorrow/.test(m.text)) && !SSEND.some(m => m.party === 's:' + SUBP.id && /Electrical/.test(m.text)), SSEND);
  }
} catch (e) { ok('G crashed: ' + (e && e.stack || e), false); }

ok('no page errors (portals)', perrs.length === 0, perrs.slice(0, 5));
ok('no page errors (CRM)', pm.errs.length === 0 && off.errs.length === 0, pm.errs.concat(off.errs).slice(0, 6));
try { await browser.close(); } catch (e) {} try { await srv.close(); } catch (e) {} try { await pm.b.close(); } catch (e) {}
const n = R.filter(Boolean).length;
console.log('\nINSPECT2 ' + n + '/' + R.length + ' passed');
process.exit(n === R.length ? 0 : 1);
