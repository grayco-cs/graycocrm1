// test_LEADASB3.mjs <build-dir> [shot-dir] — patch LEADASB3 (owner's 11/15 list, item 2). Made-up data only, offline harness, fake functions.
//   A. node: LEADCERT90 — Company documents: the EPA RRP firm certificate / a certified renovator running out in 80 days gets the
//      reminder (90d step, To-Do + e-mail to admins + office), a license 80 days out does not (still 30 days), no repeat.
//   B. the CRM: LEADSTART (a lead job started on this computer without Lead 01 is put back + "📄 Give the customer Lead 01 first";
//      Start anyway (admin); Lead 01 given or a signed copy in the job files → it starts; a non-lead job is never stopped),
//      LEADALERT (⏰ 7 days before start, ⏰ day 20 / 🚨 day 28 after completion; closed once given), LEADSEND (👁 Filled in /
//      📤 Send on the ☣️ card → ✅ Approvals queue with the job's customer + address filled in; written on the job; ⏸ data-entry mode
//      sends nothing), the Company documents slots in the library with the 90-day badge.
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const require = createRequire(import.meta.url);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const FN = path.join(BUILD, 'netlify/functions');
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/* ════ A ════ */
{
  const kv = {}, tasks = [], mails = [];
  const fakeLib = { kvGet: async k => kv[k], kvCas: async (k, fn) => { const nv = fn(kv[k] === undefined ? undefined : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { value: kv[k] }; }, alertsApi: () => ({ recipients: async () => [] }), sb: async () => ({ ok: false }) };
  const fakeCore = { kvListUpdate: async (key, fn) => { const r = fn(tasks.slice()); if (r && r.list) { tasks.length = 0; r.list.forEach(x => tasks.push(x)); } return { ok: true }; }, signRefs: async refs => Object.fromEntries(refs.map(r => [r, 'https://signed.example/' + r])) };
  require.cache[require.resolve(path.join(FN, 'bid-inbox.js'))] = { id: 'bi', filename: 'bi', loaded: true, exports: { _lib: fakeLib } };
  require.cache[require.resolve(path.join(FN, 'portal.js'))] = { id: 'po', filename: 'po', loaded: true, exports: { _core: fakeCore } };
  process.env.RESEND_API_KEY = 'test';
  const realFetch = global.fetch;
  global.fetch = async (u, init) => { if (/resend/.test(String(u))) { mails.push(JSON.parse(init.body)); return { ok: true, status: 200 }; } return { ok: false, status: 404, json: async () => [] }; };
  const G = require(path.join(FN, '_lib/gcp.js'));
  const data = { users: [{ name: 'Owner', email: 'owner@grayco-cs.com', role: 'Admin', payType: 'owner' }, { name: 'Office', email: 'office@grayco-cs.com', role: 'Office' }], projects: [] };
  const who = { email: 'office@grayco-cs.com' }, ref = 'sb:crm-files/' + 'b'.repeat(64) + '.pdf';
  await G.docAdd(data, { kind: 'license', folder: 'licenses', slot: 'epa_rrp_firm', title: 'EPA RRP Lead-Safe Certified Firm', ref, name: 'epa.pdf', expires: day(80) }, who);
  await G.docAdd(data, { kind: 'license', folder: 'licenses', slot: 'rrp_renovator_1', title: 'EPA RRP Certified Renovator — 1', ref, name: 'r1.pdf', expires: day(85) }, who);
  await G.docAdd(data, { kind: 'license', folder: 'licenses', slot: 'lic_tn', title: 'TN license', ref, name: 'tn.pdf', expires: day(80) }, who);
  const r = await G.complianceRun(data);
  const t = tasks.find(x => /^GCP_DOCS_/.test(x.id)), m = mails[mails.length - 1];
  ok('A1 the EPA firm cert and the renovator 80-85 days out get the reminder (To-Do), the TN license 80 days out does not', r.reminded === 2 && t && /EPA RRP Lead-Safe Certified Firm/.test(t.label) && /Renovator — 1/.test(t.label) && !/TN license/.test(t.label), { r, t });
  ok('A1 the e-mail goes to the admins and the office', m && m.to.includes('office@grayco-cs.com') && m.to.includes('owner@grayco-cs.com'), m && m.to);
  const r2 = await G.complianceRun(data);
  ok('A2 not repeated the next run', r2.reminded === 0, r2);
  global.fetch = realFetch;
}

/* ════ B ════ */
const { computer, signIn, sleep, cset, cget, resetCloud, onFn } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 864e5).toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
const LJ = { yearBuilt: 1962, disturbsPaint: true };
cset('projects', [
  { id: 'P1', name: 'Zedd Paint Job', client: 'Zedd Demo', clientPhone: '9015550111', address: '11 Demo St, Memphis, TN', status: 'active', pct: 0, startDate: day(5), pm: 'Demo PM', leadAsb: LJ, createdAt: at, updatedAt: at },
  { id: 'P2', name: 'Demo Window Job', client: 'Dee Demo', clientPhone: '9015550112', address: '12 Demo St', status: 'active', pct: 0, startDate: day(3), pm: 'Demo PM', leadAsb: LJ, createdAt: at, updatedAt: at },
  { id: 'P3', name: 'Demo Done 21', client: 'Dot Demo', clientPhone: '9015550113', address: '13 Demo St', status: 'complete', pct: 100, startDate: day(-40), completionDate: day(-21), pm: 'Demo PM', leadAsb: Object.assign({ given: { L01: { on: day(-41), how: 'signed' } } }, LJ), createdAt: at, updatedAt: at },
  { id: 'P4', name: 'Demo Done 29', client: 'Dan Demo', clientPhone: '9015550114', address: '14 Demo St', status: 'complete', pct: 100, startDate: day(-50), completionDate: day(-29), pm: 'Demo PM', leadAsb: Object.assign({ given: { L01: { on: day(-51), how: 'signed' } } }, LJ), createdAt: at, updatedAt: at },
  { id: 'P5', name: 'Demo Plain Job', client: 'Del Demo', clientPhone: '9015550115', address: '15 Demo St', status: 'active', pct: 0, startDate: day(2), pm: 'Demo PM', createdAt: at, updatedAt: at }]);
cset('projectDocs', [{ id: 'DOC1', pid: 'P2', name: 'Lead 01 signed - Dee Demo.pdf', cat: 'Other', type: 'application/pdf', data: 'sb:crm-files/' + 'c'.repeat(64) + '.pdf', size: 52000, by: 'Demo PM', uploaded: day(-1) }]);
const QUEUED = [];
onFn('portal', ({ body }) => { if (body && body.action === 'approval') { QUEUED.push(body); return { ok: true, id: 'AP' + QUEUED.length }; } return { ok: true }; });
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await signIn(A, 'wjohnson@grayco-cs.com', 20000);
const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('B0 the CRM is up', !!await wait(() => window._gcLeadAsb3 && window._gcLeadAsb && (window._crm.projects || []).length >= 5 && typeof window._setProjectDocs === 'function', null, 60000));
/* the signed Lead 01 uploaded to P2's files on this computer (the CRM's own list setter) */
await A.ev(() => { const d = { id: 'DOC1', pid: 'P2', name: 'Lead 01 signed - Dee Demo.pdf', cat: 'Other', type: 'application/pdf', data: 'sb:crm-files/' + 'c'.repeat(64) + '.pdf', size: 52000, by: 'Demo PM', uploaded: '2026-11-14' }; window._setProjectDocs(prev => (prev || []).concat([d])); });
await sleep(800);
await sleep(2600);   /* the start watcher takes its first look */
const start = (pid) => A.ev(pid => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setProjects(prev => prev.map(p => p.id === pid ? Object.assign({}, p, { pct: 10, updatedAt: new Date().toISOString() }) : p)); }, pid);
const pct = pid => A.ev(pid => { const p = window._crm.projects.find(x => x.id === pid); return p ? +p.pct || 0 : -1; }, pid);
await start('P1');
const dlg = await wait(() => { const d = document.getElementById('gc-la3-gate'); return d && d.textContent; });
await sleep(1500);
ok('B1 a lead job started without Lead 01 → put back to 0 % and "📄 Give the customer Lead 01 first"', /Give the customer Lead 01 first/.test(dlg || '') && await pct('P1') === 0, { dlg, pct: await pct('P1') });
await shot(A, 'b1_gate');
await A.ev(() => document.querySelector('#gc-la3-gate [data-g3="waive"]').click());
await sleep(1800);
ok('B1 Start anyway (admin) → 10 % and stamped startWaived', await pct('P1') === 10 && await A.ev(() => !!window._crm.projects.find(x => x.id === 'P1').leadAsb.startWaived));
await start('P2'); await sleep(2500);
ok('B2 a signed Lead 01 in the job\'s files counts → it starts', await pct('P2') === 10 && !await A.ev(() => !!document.getElementById('gc-la3-gate')), await A.ev(() => ({ docs: (window._crm.projectDocs || []).map(d => [d.pid, d.name, d.fromTemplate]), g: window._gcLeadAsb3.lead01Given(window._crm.projects.find(p => p.id === 'P2')) })));
await A.ev(() => { const d = document.getElementById('gc-la3-gate'); if (d) d.remove(); });
await start('P5'); await sleep(2500);
ok('B2 a job that is not a lead job is never stopped', await pct('P5') === 10 && !await A.ev(() => !!document.getElementById('gc-la3-gate')));
/* LEADALERT */
await A.ev(() => window._setProjects(prev => prev.map(p => p.id === 'P1' ? Object.assign({}, p, { pct: 0, leadAsb: Object.assign({}, p.leadAsb, { startWaived: null }) }) : p)));
await sleep(500);
await A.ev(() => window._gcLeadAsb3.sweep());
let T = await A.ev(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => /^LEADASB(7|20|28)_/.test(t.id)).map(t => ({ id: t.id, label: t.label, done: t.done, a: t.assignee })));
const g = id => T.find(t => t.id === id);
ok('B3 ⏰ 7 days to start — P1 (starts in 5 days, Lead 01 not given), for the PM', g('LEADASB7_P1') && !g('LEADASB7_P1').done && /7 days to start .* give Zedd Demo Lead 01 before work starts/.test(g('LEADASB7_P1').label) && g('LEADASB7_P1').a === 'Demo PM', T);
ok('B3 P2 (signed copy uploaded) gets no start alert', !g('LEADASB7_P2'), T);
ok('B3 finished 21 days ago → ⏰ Day 20 of 30 (Lead 03), not day 28', g('LEADASB20_P3') && /Day 20 of 30 — give Dot Demo Lead 03/.test(g('LEADASB20_P3').label) && !g('LEADASB28_P3'), T);
ok('B3 finished 29 days ago → day 20 AND 🚨 Day 28 of 30', g('LEADASB20_P4') && g('LEADASB28_P4') && /🚨 Day 28 of 30 — 2 days left/.test(g('LEADASB28_P4').label), T);
await A.ev(() => window._setProjects(prev => prev.map(p => p.id === 'P3' ? Object.assign({}, p, { leadAsb: Object.assign({}, p.leadAsb, { given: Object.assign({}, p.leadAsb.given, { L03: { on: '2026-11-15', how: 'mailed' } }) }) }) : p)));
await sleep(500); await A.ev(() => window._gcLeadAsb3.sweep());
T = await A.ev(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => /^LEADASB(7|20|28)_/.test(t.id)).map(t => ({ id: t.id, done: t.done })));
ok('B3 Lead 03 marked given → the day-20 To-Do closes by itself', g('LEADASB20_P3') && T.find(t => t.id === 'LEADASB20_P3').done === true && T.find(t => t.id === 'LEADASB28_P4').done === false, T);
/* LEADSEND */
await A.ev(() => { const c = document.createElement('div'); c.id = 'gc-la'; c.setAttribute('data-pid', 'P1'); c.innerHTML = '<div class="p" data-k="L01"><b>Lead 01 — Renovate Right acknowledgment</b><span class="m">Due 11/19</span><span style="margin-left:auto;display:flex;gap:6px"><a href="#">📄 Form</a><button type="button" class="g" data-la="give">✓ Given</button></span></div>'; document.body.prepend(c); });
const btns = await wait(() => { const r = document.querySelector('#gc-la .p[data-k="L01"]'); return r && r.querySelector('[data-la3="send"]') && r.querySelector('[data-la3="view"]') ? 'yes' : null; }, null, 6000);
ok('B4 the ☣️ card paper gets 👁 Filled in and 📤 Send', btns === 'yes');
await A.ev(() => document.querySelector('#gc-la [data-la3="send"]').click());
const q = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 10000) { if (QUEUED.length) return QUEUED[0]; await sleep(300); } return null; })();
ok('B4 📤 Send queues the paper in ✅ Approvals for the job (kind document)', q && q.op === 'queue' && q.kind === 'document' && q.projectId === 'P1' && /Lead 01/i.test(q.title || q.subject || ''), q && { op: q.op, kind: q.kind, pid: q.projectId, t: q.title });
ok('B4 …filled in with the customer and the address', q && /Zedd Demo/.test(q.html) && /11 Demo St/.test(q.html), q && q.html.slice(0, 600));
const sent = await wait(() => { const p = window._crm.projects.find(x => x.id === 'P1'); return p.leadAsb.sent && p.leadAsb.sent.L01; });
ok('B4 the send is written on the job (leadAsb.sent.L01) — not marked given', sent && sent.on && await A.ev(() => !(window._crm.projects.find(x => x.id === 'P1').leadAsb.given || {}).L01));
await A.ev(() => { const e = document.getElementById('gc-la'); if (e) e.remove(); });
/* ⏸ data-entry mode: nothing sent */
await A.ev(() => { window.__zzPause = window._gcPause; window._gcPause = { state: () => ({ paused: true }) }; });
const n0 = QUEUED.length; await A.ev(() => window._gcLeadAsb3.sendPaper('L02', 'P1')); await sleep(1500);
ok('B5 data-entry mode on → nothing queued', QUEUED.length === n0);
await A.ev(() => { window._gcPause = window.__zzPause; });
/* the Company documents slots */
const slots = await A.ev(() => { try { window._gcCompanyLib.open('licenses'); } catch (e) {} return new Promise(r => setTimeout(() => r(document.body.innerText.match(/EPA RRP Lead-Safe Certified Firm|EPA RRP Certified Renovator — 1|EPA RRP Certified Renovator — 2/g)), 2500)); });
ok('B6 Company documents → Licenses lists the EPA firm and the two renovator slots', slots && new Set(slots).size === 3, slots);
await shot(A, 'b6_slots');
ok('B7 no page errors', A.errs.length === 0, A.errs);
await A.close();
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
