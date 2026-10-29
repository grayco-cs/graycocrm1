/* patch AUTOMONEY tests: node tools/tests/test_AUTOMONEY.js — the deposit gate + override + note, lien waivers by job type +
   the pay hold + signing unblocks, profit alerts fire once. Mocked KV / CRM data / storage; nothing is sent. */
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const FN = path.join(__dirname, '../../netlify/functions');
const ROOT = path.join(__dirname, '../..');

/* ── the mocked CRM core (portal.js _core) and data-entry mode ── */
const KV = {};
const DATA = {
  users: [
    { name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', active: true },
    { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true },
    { name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'Project Manager', active: true },
    { name: 'Olive Office', email: 'olive@grayco-cs.com', role: 'Office Manager', active: true },
    { name: 'Field Fred', email: 'fred@grayco-cs.com', role: 'Crew Lead', active: true }
  ],
  projects: [
    { id: 'P_RES', name: 'Smith Kitchen', type: 'Kitchen', pm: 'Pat PM', status: 'active', createdAt: '2026-10-29', autoPO: 'GC-101', contract: 40000 },
    { id: 'P_COM', name: 'Main St Retail TI', type: 'Commercial TI', pm: 'Pat PM', status: 'active', createdAt: '2026-10-29', autoPO: 'GC-102', contract: 90000 },
    { id: 'P_INS', name: 'Jones Water', type: 'Water Damage', pm: 'Pat PM', status: 'active', autoPO: 'GC-103' },
    { id: 'P_ROOF', name: 'Lee Roof (retail)', type: 'Roofing', pm: 'Pat PM', status: 'active', createdAt: '2026-10-29' }
  ],
  invs: [], jobAutoDefaults: null
};
const pushes = [];
const core = {
  kvRead: async (keys) => { const o = {}; keys.forEach(k => { o[k] = KV[k] != null ? KV[k] : null; }); return o; },
  kvListRead: async (k) => ({ list: JSON.parse(JSON.stringify(KV[k] || [])), at: 'x' }),
  kvListUpdate: async (k, f) => { const m = f(JSON.parse(JSON.stringify(KV[k] || []))); if (!m || !m.list) return { ok: true, unchanged: true, result: m && m.result }; KV[k] = m.list; return { ok: true, result: m.result, list: m.list }; },
  crmData: async () => DATA,
  findProject: (d, pid) => d.projects.find(p => p.id === String(pid)) || null,
  listOf: (d, keys) => [].concat(...keys.map(k => d[k] || [])),
  adminEmails: (d) => d.users.filter(u => /^admin$/i.test(u.role)).map(u => u.email),
  officeEmails: (d) => d.users.filter(u => /office/i.test(u.role)).map(u => u.email),
  pushTo: async (to, p) => { pushes.push({ to, p }); return { sent: to.length }; },
  gcStaffAuth: async () => ({ ok: true })
};
require.cache[path.join(FN, 'portal.js')] = { id: path.join(FN, 'portal.js'), filename: path.join(FN, 'portal.js'), loaded: true, exports: { _core: core } };
require.cache[path.join(FN, '_lib/pause.js')] = { id: 'p', filename: path.join(FN, '_lib/pause.js'), loaded: true, exports: { isPaused: async () => false, install(){ return this; } } };
global.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '' });
delete process.env.RESEND_API_KEY;

const MC = require(path.join(FN, '_lib/money-core.js'));
const JA = require(path.join(FN, '_lib/job-auto.js'));
const M = require(path.join(FN, '_lib/money-rules.js'));
const L = require(path.join(FN, '_lib/lien.js'));
let n = 0; const ok = (name) => { n++; console.log('  ✓ ' + name); };

(async function(){
  /* 0 · the CRM page carries the same core and the same JA defaults */
  const html = fs.readFileSync(process.argv[2] ? path.join(process.argv[2], 'index.html') : path.join(ROOT, 'index.html'), 'utf8');
  const core = fs.readFileSync(path.join(FN, '_lib/money-core.js'), 'utf8').trim();
  assert.ok(html.indexOf(core) >= 0, 'index.html embeds money-core.js exactly'); ok('index.html embeds _lib/money-core.js as is');
  assert.ok(/\['depositGate', 'internal', '💰 Deposit before scheduling', [^\n]*\{ residential: true, other: false \}\]/.test(html));
  assert.ok(/\['subLien', 'internal', '📝 Sub lien waivers required', [^\n]*\{ commercial: true, other: false \}\]/.test(html)); ok('JA option table (page) = job-auto.js defaults');

  /* 1 · DEPOSIT GATE */
  const g = (p) => JA.defaultsFor(JA.groupOf(p)).depositGate;
  assert.strictEqual(g(DATA.projects[0]), true); assert.strictEqual(g(DATA.projects[3]), true);
  assert.strictEqual(g(DATA.projects[1]), false); assert.strictEqual(g(DATA.projects[2]), false); ok('deposit required: residential + retail roofing on; commercial + insurance off');
  const res = DATA.projects[0];
  let dep = MC.depositState(res, [{ id: 'I1', pid: 'P_RES', type: 'client', drawType: 'Deposit', status: 'sent' }], []);
  assert.strictEqual(dep.paid, false);
  let gt = MC.gate({ p: res, required: true, dep: dep, overrides: [], item: { title: 'Drywall crew', type: 'work' } });
  assert.strictEqual(gt.ok, false); assert.strictEqual(gt.why, 'deposit'); ok('no deposit → crew day blocked');
  assert.strictEqual(MC.gate({ p: res, required: true, dep: dep, overrides: [], item: { title: 'Pre-con meeting with owner' } }).ok, true); ok('a meeting is never blocked');
  assert.strictEqual(MC.gate({ p: DATA.projects[2], required: g(DATA.projects[2]), dep: dep, overrides: [] }).ok, true); ok('insurance job: not required');
  dep = MC.depositState(res, [{ id: 'I1', pid: 'P_RES', type: 'client', drawType: 'Deposit', status: 'paid', paidDate: '2026-10-29' }], []);
  assert.strictEqual(MC.gate({ p: res, required: true, dep: dep, overrides: [], item: { title: 'Demo' } }).ok, true); ok('deposit paid → allowed');
  assert.strictEqual(MC.depositState(res, [], [{ pid: 'P_RES', amount: 5000 }]).paid, true); ok('a recorded customer payment counts');
  /* grandfathered: a job already on the schedule before the rule */
  assert.strictEqual(MC.gate({ p: { id: 'OLD', status: 'active', createdAt: '2026-09-01' }, required: true, dep: { paid: false }, overrides: [], hasWork: true, item: { title: 'Framing' } }).ok, true); ok('jobs already scheduled before 10/29 are left alone');
  /* who may override */
  assert.ok(MC.canOverride({ me: 'Pat PM', pm: 'Pat PM' })); assert.ok(MC.canOverride({ admin: true, me: 'Nick', pm: 'Pat PM' })); assert.ok(!MC.canOverride({ me: 'Field Fred', pm: 'Pat PM' })); ok('PM or admin may override, nobody else');
  let r = await M.override({ pid: 'P_RES', reason: 'x' }, { email: 'pat@grayco-cs.com', role: 'staff', name: 'Pat PM' });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.status, 400); ok('override needs a reason');
  r = await M.override({ pid: 'P_RES', reason: 'Customer pays deposit Monday' }, { email: 'fred@grayco-cs.com', role: 'staff', name: 'Field Fred' });
  assert.strictEqual(r.status, 403); ok('crew lead cannot override (server)');
  r = await M.override({ pid: 'P_RES', reason: 'Customer pays deposit Monday', what: 'Drywall crew' }, { email: 'pat@grayco-cs.com', role: 'staff', name: 'Pat PM' });
  assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.override.role, 'pm');
  const tasks = KV.gc_office_tasks || [];
  assert.ok(tasks.some(t => /Scheduled before the deposit/.test(t.label) && !t.assignees), 'shared office note');
  assert.strictEqual(tasks.filter(t => /Scheduled before the deposit/.test(t.label) && t.assignees).length, 2, 'one note per admin');
  assert.ok(tasks.every(t => /Customer pays deposit Monday/.test(t.note)));
  assert.ok(pushes.some(x => x.to.indexOf('olive@grayco-cs.com') >= 0 && x.to.indexOf('nthomas@grayco-cs.com') >= 0)); ok('PM override → To-Do note for the office + each admin, push to them');
  gt = MC.gate({ p: res, required: true, dep: { paid: false }, overrides: KV.gc_deposit_overrides, item: { title: 'Drywall crew' } });
  assert.strictEqual(gt.ok, true); assert.strictEqual(gt.why, 'scheduled anyway'); ok('after the override the job can be scheduled');
  const notes = await M.digestNotes(Date.now());
  assert.strictEqual(notes.office.length, 1); assert.ok(/Smith Kitchen — scheduled before the deposit by Pat PM: “Customer pays deposit Monday”/.test(notes.admins[0])); ok('the 7 AM digest gets the line (admins + office)');
  const dg = fs.readFileSync(path.join(FN, '_lib/auto-digest.js'), 'utf8'); assert.ok(/digestNotes\(now\)/.test(dg) && /noteHtml\(email\)/.test(dg)); ok('auto-digest.js includes the notes');

  /* 2 · LIEN WAIVERS */
  const st = { subs: {}, jobs: {} };
  assert.strictEqual(L.requiredFor(st, 'S1', 'Acme', DATA.projects[0], null), false);
  assert.strictEqual(L.requiredFor(st, 'S1', 'Acme', DATA.projects[1], null), true);
  assert.strictEqual(L.requiredFor(st, 'S1', 'Acme', DATA.projects[2], null), false); ok('waivers by job type: residential off, commercial on, insurance off');
  assert.strictEqual(L.requiredFor(st, 'S1', 'Acme', Object.assign({}, DATA.projects[0], { auto: { subLien: true } }), null), true);
  assert.strictEqual(L.requiredFor(st, 'S1', 'Acme', Object.assign({}, DATA.projects[1], { auto: { subLien: false } }), null), false); ok('per job: residential can be made to have them, commercial can be changed to no');
  assert.strictEqual(L.requiredFor({ subs: { 'id:S1': { on: true } }, jobs: {} }, 'S1', 'Acme', DATA.projects[0], null), true); ok('the old "always ask this sub" still counts');
  assert.strictEqual(L.requiredFor(st, 'S1', 'Acme', DATA.projects[0], { residential: { subLien: true } }), true); ok('admin can change the type default');
  const inv = { id: 'SI1', type: 'sub', pid: 'P_COM', sub: 'Acme Drywall', subId: 'S1', amt: 5000, recvDate: '2026-10-29', status: 'approved' };
  let hold = MC.payHold({ required: true, waiver: null, inv: inv });
  assert.ok(/Lien waiver needed/.test(hold) && /not requested yet/.test(hold)); ok('required + no waiver → the check is held, with a clear reason');
  assert.strictEqual(MC.payHold({ required: true, waiver: null, inv: Object.assign({}, inv, { recvDate: '2026-10-20' }) }), null); ok('an invoice in before the rule is not held');
  assert.strictEqual(MC.payHold({ required: false, waiver: null, inv: inv }), null); ok('not required → not held');
  KV.gc_lien_waivers = [{ id: 'LWc_SI1', kind: 'conditional', invId: 'SI1', pid: 'P_COM', jobName: 'Main St Retail TI', jobAddress: '1 Main', sub: 'Acme Drywall', subId: 'S1', subEmail: 'acme@example.com', amount: 5000, through: '2026-10-29', status: 'sent', tokenHash: 'h', updatedAt: '2026-10-29T00:00:00Z' }];
  hold = MC.payHold({ required: true, waiver: KV.gc_lien_waivers[0], inv: inv }); assert.ok(/waiting for their signature in the Sub Portal/.test(hold)); ok('sent → held, waiting for the sub');
  const sub = { id: 'S1', name: 'Acme Drywall', company: 'Acme Drywall' }, other = { id: 'S2', name: 'Other Co' };
  const mine = await L.forSub(sub); assert.strictEqual(mine.length, 1); assert.deepStrictEqual(Object.keys(mine[0]).sort(), ['address', 'amount', 'id', 'invNum', 'job', 'kind', 'paras', 'signedAt', 'signerName', 'status', 'through', 'title'].sort());
  assert.strictEqual((await L.forSub(other)).length, 0); ok('the portal shows a sub only its own waivers (job, address, amount, wording — nothing else)');
  r = await L.signForSub('LWc_SI1', other, { name: 'Somebody Else', agree: true, esign: { agree: true } }); assert.strictEqual(r.status, 404); ok('another sub cannot sign it');
  r = await L.signForSub('LWc_SI1', sub, { name: 'Al Acme', agree: true }); assert.strictEqual(r.ok, false); ok('E-SIGN consent required');
  r = await L.signForSub('LWc_SI1', sub, { name: 'Al Acme', title: 'Owner', agree: true, esign: { agree: true, version: '1' }, strokes: [[[1, 2], [3, 4]]], ip: '1.2.3.4' });
  assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(KV.gc_lien_waivers[0].status, 'signed'); assert.strictEqual(KV.gc_lien_waivers[0].via, 'sub portal');
  assert.strictEqual(MC.payHold({ required: true, waiver: KV.gc_lien_waivers[0], inv: inv }), null); ok('signed in the Sub Portal → the hold is gone');
  const pdf = L.pdf(KV.gc_lien_waivers[0]); assert.strictEqual(pdf.slice(0, 5).toString(), '%PDF-'); assert.ok(/Al Acme/.test(pdf.toString('latin1')) && /Main St Retail TI/.test(pdf.toString('latin1'))); ok('the CRM makes the waiver PDF (job, amount, period, signature)');
  /* received on paper (office) */
  DATA.invs.push({ id: 'SI2', type: 'sub', pid: 'P_COM', sub: 'Beta Paint', subId: 'S3', amt: 1200, date: '2026-10-29', status: 'approved' });
  const scan = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n' + 'x'.repeat(200)).toString('base64');
  r = await L.paper({ invId: 'SI2', file: scan, name: 'beta.pdf' }, { name: 'Olive Office' });
  assert.ok(r.ok, JSON.stringify(r)); const w2 = KV.gc_lien_waivers.find(w => w.id === 'LWc_SI2');
  assert.strictEqual(w2.status, 'paper'); assert.strictEqual(w2.paperBy, 'Olive Office'); assert.strictEqual(MC.payHold({ required: true, waiver: w2, inv: DATA.invs[1] }), null); ok('received on paper (with the scan) → the hold is gone');
  /* reminders: every 3 days until signed */
  KV.gc_lien_waivers.push({ id: 'LWc_SI3', kind: 'conditional', status: 'sent', subEmail: 'c@example.com', sentAt: new Date(Date.now() - 4 * 864e5).toISOString(), amount: 1, jobName: 'J' });
  process.env.RESEND_API_KEY = 'test'; const calls = []; global.fetch = async (u, o) => { calls.push(u); return { ok: true, status: 200, json: async () => [], text: async () => '' }; };
  let rm = await L.remind({}); assert.strictEqual(rm.sent, 1); rm = await L.remind({}); assert.strictEqual(rm.sent, 0); assert.strictEqual(KV.gc_lien_waivers.find(w => w.id === 'LWc_SI3').reminders, 1); ok('reminder e-mail every 3 days until signed (not twice in a row)');
  delete process.env.RESEND_API_KEY; global.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '' });

  /* 3 · PROFIT ALERT */
  let c = MC.profitCheck({ actual: 7000, budget: 10000, set: {}, fired: {} }); assert.strictEqual(c.fire, 0); ok('70 % → no alert');
  c = MC.profitCheck({ actual: 8000, budget: 10000, set: {}, fired: {} }); assert.strictEqual(c.fire, 80); ok('80 % → first alert');
  c = MC.profitCheck({ actual: 9000, budget: 10000, set: {}, fired: { 80: true } }); assert.strictEqual(c.fire, 0); ok('80 % already sent → nothing');
  c = MC.profitCheck({ actual: 10100, budget: 10000, set: {}, fired: { 80: true } }); assert.strictEqual(c.fire, 100); assert.ok(c.over); ok('100 % → over-budget alert');
  c = MC.profitCheck({ actual: 12000, budget: 10000, set: {}, fired: {} }); assert.strictEqual(c.fire, 100); assert.deepStrictEqual(c.mark, [80, 100]); ok('straight past both → one alert');
  c = MC.profitCheck({ actual: 7600, budget: 10000, set: { warnPct: 75, overPct: 95 }, fired: {} }); assert.strictEqual(c.fire, 75); ok('levels from Admin');
  assert.strictEqual(MC.profitCheck({ actual: 500, budget: 0 }).fire, 0); ok('no budget → no alert');
  pushes.length = 0;
  r = await M.profit({ pid: 'P_COM', actual: 8200, budget: 10000 }, { name: 'Olive Office' }); assert.ok(r.fired); assert.strictEqual(r.alert.level, 80);
  assert.ok(pushes[0].to.indexOf('pat@grayco-cs.com') >= 0 && pushes[0].to.indexOf('wjohnson@grayco-cs.com') >= 0); ok('server: alert pushed to the PM + admins');
  r = await M.profit({ pid: 'P_COM', actual: 8400, budget: 10000 }, {}); assert.strictEqual(r.fired, false); ok('server: the same level fires once');
  r = await M.profit({ pid: 'P_COM', actual: 10400, budget: 10000 }, {}); assert.ok(r.fired); assert.strictEqual(r.alert.level, 100);
  r = await M.profit({ pid: 'P_COM', actual: 11000, budget: 10000 }, {}); assert.strictEqual(r.fired, false); ok('server: 100 % once, then quiet');
  assert.strictEqual((KV.gc_profit_alerts || []).length, 2); assert.ok((KV.gc_office_tasks || []).some(t => /Over budget — GC-102/.test(t.label))); ok('the notice is kept for the job page + a To-Do');
  const sv = await M.saveSettings({ warnPct: 100, overPct: 80 }, {}); assert.strictEqual(sv.ok, false); ok('Admin levels: first must be lower');
  console.log('\nAUTOMONEY: ' + n + ' passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
