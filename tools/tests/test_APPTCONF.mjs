// node tools/tests/test_APPTCONF.mjs <repo dir> — appointment confirmations: one per job/day/recipient; none on commercial jobs unless turned on
import { createRequire } from 'module'; import path from 'path';
const dir = path.resolve(process.argv[2] || '.'); const require = createRequire(import.meta.url);
const AQ = require(path.join(dir, 'netlify/functions/_lib/auto-queue.js'));
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else fail++; console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : ' ' + JSON.stringify(x))); };
function world(jobs, customers){
  const store = { list: [] };
  const I = { AQ_KEY: 'q', crmData: async () => ({ projects: jobs, customers: customers || [] }), findProject: (d, id) => d.projects.find(p => p.id === id),
    pmOf: () => 'Wesley Johnson', kvListRead: async () => ({ list: store.list }),
    kvListUpdate: async (k, fn) => { const r = fn(store.list); if (!r || !r.list) return { ok: false, result: r && r.result }; store.list = r.list; return { ok: true, result: r.result }; },
    queueApproval: async (it) => { if (!store.list.find(x => x.id === it.id)) store.list.push(Object.assign({ status: 'waiting', step: 'pm', steps: ['pm', 'admin'], jobId: it.pid, createdAt: new Date().toISOString() }, it)); return true; },
    aqSend: async () => ({ ok: true }) };
  return { I, store };
}
const html = '<p>Hi Pat,</p><p>This confirms your appointment.</p><p>Your project manager:</p>';
const res = { id: 'P1', name: 'ROTC Cordova', client: 'A & B Construction', clientEmail: 'office@aandbconstructionco.example', type: 'Residential Reno' };
let w = world([res]);
const q = (title, ref) => AQ.queue({ kind: 'appt_confirm', projectId: 'P1', ref, title, subject: 'Confirmed', html }, { email: 'w@x' }, w.I);
let a = await q('📅 Confirm Pre-construction meeting — ROTC Cordova (Monday, November 9)', 'S1_20261109');
let b = await q('📅 Confirm ROTC Cordova — ROTC Cordova (Monday, November 9)', 'S2_20261109');
ok('two schedule items the same day → one card', w.store.list.length === 1 && b.out.merged === true, w.store.list.map(x => x.id));
ok('the card lists both items', /Pre-construction meeting \+ ROTC Cordova/.test(w.store.list[0].title) && /The same day/.test(w.store.list[0].html), w.store.list[0].title);
let c = await q('📅 Confirm Framing — ROTC Cordova (Tuesday, November 10)', 'S3_20261110');
ok('another day → its own card', w.store.list.length === 2, w.store.list.map(x => x.id));
w.store.list[0].status = 'sent'; await q('📅 Confirm Dumpster — ROTC Cordova (Monday, November 9)', 'S4_20261109');
ok('after it was sent → no second e-mail that day', w.store.list.length === 2, w.store.list.map(x => x.id + ':' + x.status));
w = world([Object.assign({}, res, { type: 'Commercial Reno' })]);
let d = await q('📅 Confirm Pre-construction meeting — ROTC Cordova (Monday, November 9)', 'S1_20261109');
ok('commercial job → not queued', w.store.list.length === 0 && d.out.off === 'commercial', d.out);
w = world([Object.assign({}, res, { type: 'Commercial Reno', auto: { scheduleUpdates: true } })]);
await q('📅 Confirm Pre-construction meeting — ROTC Cordova (Monday, November 9)', 'S1_20261109');
ok('commercial job with the switch turned on by a person → queued', w.store.list.length === 1);
w = world([Object.assign({}, res, { type: '', customerId: 'C1' })], [{ id: 'C1', name: 'A & B Construction', type: 'GC' }]);
await q('📅 Confirm Pre-construction meeting — ROTC Cordova (Monday, November 9)', 'S1_20261109');
ok('GC customer → not queued', w.store.list.length === 0);
console.log(fail ? 'FAILED ' + pass + '/' + (pass + fail) : 'OK ' + pass + '/' + pass); process.exit(fail ? 1 : 0);
