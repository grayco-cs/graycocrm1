// test_W4SAFE_fn.mjs <build-dir | index.html> — patch W4SAFE without a browser (Node vm, the page's own scripts):
//  A. the payroll-profile merge rule (_gcPayProfileMerge, used by _gcUnionMerge and the stable-id fold)
//  B. profiles() (Payroll part 1) on a FRESH computer: nothing is created before the cloud's list was read; the cloud's W-4
//     survives the first call, a failed cloud read, concurrent calls, and the cloud push that follows.
// Made-up people only.   node tools/tests/test_W4SAFE_fn.mjs <build-dir>
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import os from 'os'; import { execFileSync } from 'child_process';
const here = path.dirname(new URL(import.meta.url).pathname);
let html = process.argv[2] || path.join(here, '..', '..', 'index.html');
if (fs.existsSync(html) && fs.statSync(html).isDirectory()) html = path.join(html, 'index.html');
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i !== undefined ? ' ' + JSON.stringify(i).slice(0, 500) : '')); } };
const src = fs.readFileSync(html, 'utf8');
ok((src.match(/\/\* W4SAFE: one merge rule for payroll profiles/g) || []).length === 1, 'the patch is in the page once');
{ const tmp = path.join(os.tmpdir(), 'w4safe_idem_' + process.pid + '.html'); fs.writeFileSync(tmp, src);
  const out = execFileSync('python3', [path.join(here, '..', 'patch_W4SAFE.py'), tmp]).toString(); ok(/already patched/.test(out) && fs.readFileSync(tmp, 'utf8') === src, 'patch is idempotent'); fs.unlinkSync(tmp); }
const lines = src.split('\n');
function block(marker){ const s0 = lines.findIndex(l => l.includes(marker)); let a = s0; while (!lines[a].startsWith('<script')) a--; let b = s0; while (!lines[b].startsWith('</script')) b++; return lines.slice(a + 1, b).join('\n'); }
const NLD = block('GrayCo NEVER-LOSE-DATA invariant'), PAY = block("var K_PROF='payrollProfiles'");

function world(opts){
  opts = opts || {};
  const store = {}, idb = new Map(Object.entries(opts.idb || {}));
  const cloud = { payrollProfiles: opts.cloud };
  const W = { console: { log(){}, warn(){} }, JSON, Object, Array, String, Math, Date, Number, isNaN, isFinite, RegExp, Promise, Error, parseFloat, parseInt, encodeURIComponent };
  W.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  W.document = { addEventListener(){}, getElementById(){ return null; }, querySelector(){ return null; }, querySelectorAll(){ return []; }, createElement(){ return { style: {}, appendChild(){}, setAttribute(){}, addEventListener(){} }; }, body: { appendChild(){} }, head: { appendChild(){} } };
  W.setTimeout = (f) => { W.__t = (W.__t || []).concat([f]); return 1; }; W.setInterval = () => 1; W.clearInterval = () => {}; W.clearTimeout = () => {};
  W.addEventListener = () => {};
  W.fetchCalls = 0;
  W.fetch = async (u) => { W.fetchCalls++; if (opts.offline) throw new TypeError('Failed to fetch');
    if (/key=eq\.payrollProfiles/.test(String(u))) { await new Promise(r => setTimeout(r, 5)); return { ok: true, json: async () => (cloud.payrollProfiles === undefined ? [] : [{ value: JSON.parse(JSON.stringify(cloud.payrollProfiles)) }]) }; }
    return { ok: true, json: async () => [] }; };
  W.idbGet = async k => (idb.has(k) ? JSON.parse(JSON.stringify(idb.get(k))) : null);
  W.idbSet = async (k, v) => { idb.set(k, JSON.parse(JSON.stringify(v))); return true; };
  W.pushes = [];
  W._supaUpsert = (k, v) => { W.pushes.push(k); if (k === 'payrollProfiles') cloud.payrollProfiles = W._gcUnionMerge(k, JSON.parse(JSON.stringify(cloud.payrollProfiles || [])), JSON.parse(JSON.stringify(v))); };
  W._crm = { users: opts.users || [] };
  W.window = W; vm.createContext(W); vm.runInContext(NLD, W);
  if (opts.pay) vm.runInContext(PAY, W);
  const flush = async () => { for (let i = 0; i < 5; i++) { const t = W.__t || []; W.__t = []; t.forEach(f => { try { f(); } catch (e) {} }); await new Promise(r => setTimeout(r, 10)); } };
  return { W, idb, cloud, flush };
}
const NOWISO = new Date().toISOString(), old = '2026-10-20T15:00:00.000Z';
const REAL = { id: 'PPu-pat', userId: 'u-pat', name: 'Pat Example', payType: 'hourly', hourlyRate: 24, filing: 'married', dependentsCredit: 2000, extra: 15, ssn4: '1234', hireDate: '2025-03-01', period: 'weekly', otherDeductions: [{ label: 'Uniform', amount: 5 }], updatedAt: old };
const LEGACY_SEED = { id: 'PPu-pat', userId: 'u-pat', name: 'Pat Example', payType: 'hourly', hourlyRate: 24, filing: 'single', dependentsCredit: 0, extra: 0, ssn4: '', hireDate: '', period: 'weekly', otherDeductions: [], active: true, updatedAt: NOWISO };
const w4 = p => ({ filing: p.filing, dep: p.dependentsCredit, extra: p.extra, ssn4: p.ssn4, hire: p.hireDate, ded: (p.otherDeductions || []).length, rate: p.hourlyRate });

/* ── A. the merge rule ── */
{
  const { W } = world(); const M = (a, b) => W._gcPayProfileMerge(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  ok(typeof W._gcPayProfileMerge === 'function', '_gcPayProfileMerge is there');
  let m = M(REAL, LEGACY_SEED);
  ok(m.filing === 'married' && m.dependentsCredit === 2000 && m.extra === 15 && m.ssn4 === '1234' && m.hireDate === '2025-03-01' && m.otherDeductions.length === 1, 'the 11/16 case: an old-style default profile stamped NOW does not beat the real W-4 (cloud first)', w4(m));
  m = M(LEGACY_SEED, REAL);
  ok(m.filing === 'married' && m.extra === 15 && m.dependentsCredit === 2000, '…in either order', w4(m));
  const seed = Object.assign({}, LEGACY_SEED, { _seed: true, updatedAt: '', hourlyRate: 30, notes: 'from Team' });
  m = M(REAL, seed);
  ok(m.filing === 'married' && m.hourlyRate === 24 && m.notes === 'from Team' && !m._seed, 'a seed never outranks a real profile (its rate 30 loses to 24) and only fills an empty field (notes); the result is no seed', { w4: w4(m), notes: m.notes, seed: m._seed });
  m = M(Object.assign({}, seed, { updatedAt: '2099-01-01T00:00:00.000Z' }), REAL);
  ok(m.filing === 'married' && m.hourlyRate === 24, 'even a seed with a far-future stamp', w4(m));
  m = M(seed, Object.assign({}, seed, { id: 'PPu-pat', extra: 3 }));
  ok(m._seed === true, 'two seeds stay a seed', m._seed);
  const edit = Object.assign({}, REAL, { filing: 'single', extra: 0, updatedAt: '2026-11-16T10:00:00.000Z', editedAt: '2026-11-16T10:00:00.000Z' });
  m = M(REAL, edit);
  ok(m.filing === 'single' && m.extra === 0 && m.dependentsCredit === 2000, 'a person setting single / 0 (default values) wins over the older filled copy', w4(m));
  m = M(edit, REAL);
  ok(m.filing === 'single' && m.extra === 0, '…in either order', w4(m));
  const healed = Object.assign({}, REAL, { updatedAt: '2026-11-17T00:00:00.000Z', active: false, editedAt: '2026-11-01T00:00:00.000Z' });
  m = M(edit, healed);
  ok(m.filing === 'single' && m.extra === 0 && m.active === false, 'a later automatic change (newer stamp, older person edit) keeps the person\'s W-4 and brings its own change (active: false)', { w4: w4(m), active: m.active });
  m = M(Object.assign({}, REAL, { notes: 'keep me' }), Object.assign({}, REAL, { notes: '', updatedAt: NOWISO }));
  ok(m.notes === 'keep me', 'no person edit in between: an empty field on the newer copy does not wipe the older value', m.notes);
  m = M(Object.assign({}, REAL, { notes: 'old' }), Object.assign({}, REAL, { notes: '', updatedAt: NOWISO, editedAt: NOWISO }));
  ok(m.notes === '', '…but a person clearing it is kept', m.notes);
  m = M(Object.assign({}, REAL, { hourlyRate: 22 }), Object.assign({}, REAL, { hourlyRate: 26, updatedAt: NOWISO }));
  ok(m.hourlyRate === 26, 'two filled values: the newer wins as before', m.hourlyRate);
  /* through the union merge and the stable-id fold */
  const u = W._gcUnionMerge('payrollProfiles', [JSON.parse(JSON.stringify(LEGACY_SEED))], [JSON.parse(JSON.stringify(REAL))]);
  ok(u.length === 1 && u[0].filing === 'married' && u[0].extra === 15, '_gcUnionMerge(local seed, cloud) keeps the W-4', u.map(w4));
  const u2 = W._gcUnionMerge('payrollProfiles', [JSON.parse(JSON.stringify(REAL))], [JSON.parse(JSON.stringify(LEGACY_SEED))]);
  ok(u2.length === 1 && u2[0].filing === 'married' && u2[0].extra === 15, '_gcUnionMerge(cloud, local seed) — the push direction — keeps the W-4', u2.map(w4));
  const fl = [JSON.parse(JSON.stringify(LEGACY_SEED)), JSON.parse(JSON.stringify(REAL))]; W._gcEnsureRecordIds(fl, 'payrollProfiles');
  ok(fl.length === 1 && fl[0].filing === 'married', 'the stable-id fold of two copies in one list keeps the W-4', fl.map(w4));
  const ex = W._gcUnionMerge('expenses', [{ id: 'E1', amt: 5, note: 'x', updatedAt: old }], [{ id: 'E1', amt: 6, note: '', updatedAt: NOWISO }]);
  ok(ex[0].amt === 6 && ex[0].note === '', 'other lists: unchanged (newer wins, empty included)', ex);
}

/* ── B. profiles() on a fresh computer ── */
const USERS = [{ id: 'u-pat', name: 'Pat Example', email: 'pat@example.test', hourlyRate: 24, payType: 'hourly', active: true }, { id: 'u-new', name: 'New Hire', hourlyRate: 18, payType: 'hourly', active: true }];
{
  const t = world({ pay: true, users: USERS, cloud: [REAL] });
  ok(t.W.__GC_PAY && typeof t.W.__GC_PAY.profiles === 'function', 'Payroll part 1 loads in the test page');
  const [a, b, c] = await Promise.all([t.W.__GC_PAY.profiles(), t.W.__GC_PAY.profiles(), t.W.__GC_PAY.profiles()]);
  const pat = l => l.filter(p => p.name === 'Pat Example');
  ok([a, b, c].every(l => pat(l).length === 1 && pat(l)[0].filing === 'married' && pat(l)[0].extra === 15 && pat(l)[0].ssn4 === '1234'), 'three concurrent first calls on an empty computer: every one answers the cloud\'s W-4', [a, b, c].map(l => pat(l).map(w4)));
  ok(t.W.fetchCalls === 1, 'one cloud read for the three calls', t.W.fetchCalls);
  const nh = a.find(p => p.name === 'New Hire');
  ok(nh && nh._seed === true && !nh.updatedAt && nh.hourlyRate === 18, 'a Team member with no profile anywhere gets a seed (no stamp, _seed) once the cloud was read', nh);
  await t.flush();
  const cl = t.cloud.payrollProfiles.filter(p => p.name === 'Pat Example'), loc = (t.idb.get('payrollProfiles') || []).filter(p => p.name === 'Pat Example');
  ok(cl.length === 1 && cl[0].filing === 'married' && cl[0].extra === 15 && loc.length === 1 && loc[0].filing === 'married', 'after the save that follows: the cloud and this computer keep the W-4', { cl: cl.map(w4), loc: loc.map(w4) });
  const again = await t.W.__GC_PAY.profiles(); ok(pat(again)[0].filing === 'married' && t.W.fetchCalls === 1, 'a later call: still the W-4, no second read', t.W.fetchCalls);
}
{
  const t = world({ pay: true, users: USERS, cloud: [REAL], offline: true });
  const l = await t.W.__GC_PAY.profiles(); await t.flush();
  ok(Array.isArray(l) && l.length === 0 && !t.idb.has('payrollProfiles') && !t.W.pushes.includes('payrollProfiles'), 'the cloud read fails (offline): nothing is created, nothing saved, nothing pushed', { n: l.length, pushes: t.W.pushes });
  ok(t.cloud.payrollProfiles[0].filing === 'married', '…the cloud W-4 untouched');
}
{
  const t = world({ pay: true, users: USERS, cloud: undefined });
  const l = await t.W.__GC_PAY.profiles();
  ok(l.length === 2 && l.every(p => p._seed === true), 'a company with no payroll list yet (cloud read answers no row): profiles are seeded as before (as seeds)', l.map(p => p.id));
}
{
  /* a computer that already has an old default copy (made before W4SAFE) and a cloud with the real W-4 */
  const t = world({ pay: true, users: USERS, cloud: [REAL], idb: { payrollProfiles: [LEGACY_SEED] } });
  const l = await t.W.__GC_PAY.profiles(); await t.flush();
  const p = l.find(x => x.name === 'Pat Example'), cl = t.cloud.payrollProfiles.find(x => x.name === 'Pat Example');
  ok(p.filing === 'married' && p.extra === 15 && cl.filing === 'married' && cl.extra === 15, 'an old default copy already on this computer is healed from the cloud, not pushed over it', { here: w4(p), cloud: w4(cl) });
}
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
