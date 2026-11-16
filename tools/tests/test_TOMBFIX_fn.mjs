// test_TOMBFIX_fn.mjs <build-dir | index.html> — patch TOMBFIX without a browser (Node vm, the page's own scripts):
//  A. the stable-id step (_gcEnsureRecordIds, NEVER-LOSE-DATA block): copies of one id-less payroll stub keep ONE stable id and
//     fold into one record; the 11/12 runaway ids (gid-gid-N-gid-gid-…) are re-keyed and folded; nothing is lost; a 2-computer +
//     cloud sync loop does not grow; exact copies in any list fold; different records with one id still both survive.
//  B. the compaction rule (tools/tombfix_early.js): auto payroll-profile ids dropped, everything else kept 400 days, idempotent,
//     union-safe; localStorage / IndexedDB / cloud doors; the one clean write-back is a union and never empty.
// Synthetic data only (the 21 MB shape is generated here).   node tools/tests/test_TOMBFIX_fn.mjs <build-dir>
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import os from 'os'; import { execFileSync } from 'child_process';
const here = path.dirname(new URL(import.meta.url).pathname);
let html = process.argv[2] || path.join(here, '..', '..', 'index.html');
if (fs.existsSync(html) && fs.statSync(html).isDirectory()) html = path.join(html, 'index.html');
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i !== undefined ? ' ' + JSON.stringify(i).slice(0, 400) : '')); } };
const src = fs.readFileSync(html, 'utf8');
const EARLY = fs.readFileSync(path.join(here, '..', 'tombfix_early.js'), 'utf8');

/* ── the page carries it once, in the right place; the patch is idempotent ── */
ok((src.match(/<script id="gc-patch-tombfix">/g) || []).length === 1 && src.includes(EARLY.trim().split('\n').slice(3, 12).join('\n')), 'early script in the page once (= tools/tombfix_early.js)');
const iT = src.indexOf('<script id="gc-patch-tombfix">');
ok(iT > src.indexOf('<script id="gc-patch-storecut">') && iT < src.indexOf('var nativeFetch = window.fetch.bind(window);') && iT < src.indexOf("var TK='gc_tombstones';"), 'after STORECUT, before the sign-in captures fetch and before every tombstone module');
{ const tmp = path.join(os.tmpdir(), 'tombfix_idem_' + process.pid + '.html'); fs.writeFileSync(tmp, src);
  const out = execFileSync('python3', [path.join(here, '..', 'patch_TOMBFIX.py'), tmp]).toString(); ok(/already patched/.test(out) && fs.readFileSync(tmp, 'utf8') === src, 'patch is idempotent'); fs.unlinkSync(tmp); }

/* ── A. the stable-id step from the page ── */
const lines = src.split('\n');
const s0 = lines.findIndex(l => l.includes('GrayCo NEVER-LOSE-DATA invariant')); let a = s0; while (!lines[a].startsWith('<script')) a--; let b = s0; while (!lines[b].startsWith('</script')) b++;
const NLD = lines.slice(a + 1, b).join('\n');
function world(){
  const store = {};
  const W = { console: { log(){}, warn(){} }, JSON, Object, Array, String, Math, Date, Number, isNaN, RegExp };
  W.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  W.window = W; vm.createContext(W); vm.runInContext(NLD, W);
  return { W, store, U: (k, x, y) => W._gcUnionMerge(k, JSON.parse(JSON.stringify(x)), JSON.parse(JSON.stringify(y))) };
}
function djb(s){ let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'gid' + (h >>> 0).toString(36); }
const NAME = 'Pat Example';
const FP = djb([NAME, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''].join('|'));     // fingerprint of {name}
const SFP = djb('s|' + ['', '', '', '', '', '', '', '', '', '', '', '', '', NAME, '', '', '', '', ''].join('|'));   // strongFp of {name}
/* the 11/12 shape: base, base-strong, base-strong-2..N, and base-strong-N(-base-strong)* chains */
function runawayIds(nSimple, nChains, chainLen, extra){ extra = extra || 0;
  const ids = [FP, FP + '-' + SFP];
  for (let n = 2; n <= nSimple; n++) ids.push(FP + '-' + SFP + '-' + n);
  for (let n = 2; n < 2 + nChains; n++) { let id = FP + '-' + SFP + '-' + n; for (let s = 1; s <= chainLen; s++) { if (s <= extra) ids.push(id + '-' + (s % 2 ? SFP : FP) + '-' + (s % 2 ? SFP : FP)); id += '-' + (s % 2 ? FP : SFP); ids.push(id); } }
  return ids;
}
{
  const { W, U } = world();
  ok(typeof W._gcPayProfileId === 'function' && W._gcPayProfileId({ name: ' Pat  Example ' }) === 'PPN-pat-example' && W._gcPayProfileId({ name: NAME, userId: 'u9' }) === 'PPu9'
    && W._gcPayProfileId({ id: FP + '-' + SFP + '-7', name: NAME }) === 'PPN-pat-example' && W._gcPayProfileId({ id: 'PPu1', name: NAME }) === 'PPu1' && W._gcPayProfileId({ id: 'PPab12cd', name: 'x' }) === 'PPab12cd',
    'a payroll profile id: PP+userId, else PPN-<name>; a real id is never touched, an auto (gid…) id is re-keyed');
  /* the old behaviour, for the record: copies of an id-less stub got new ids */
  const st = [{ name: NAME, frequency: 'weekly' }, { name: NAME, frequency: 'weekly' }, { name: NAME, homeState: 'TN', state: 'TN' }];
  const l1 = JSON.parse(JSON.stringify(st)); W._gcEnsureRecordIds(l1, 'payrollProfiles');
  ok(l1.length === 1 && l1[0].id === 'PPN-pat-example' && l1[0].frequency === 'weekly' && l1[0].homeState === 'TN', 'three id-less stubs of one person → ONE profile, stable id, every field kept', l1);
  /* the runaway copies that were in the list on 11/12 (one per id), plus the real profile */
  const ids = runawayIds(400, 20, 30);
  const real = { id: 'PPu-pat', userId: 'u-pat', name: NAME, payType: 'hourly', hourlyRate: 24, filing: 'married', updatedAt: '2026-11-01T00:00:00.000Z' };
  const big = [real].concat(ids.map((id, i) => ({ id, name: NAME, frequency: 'weekly', userId: i % 3 ? '' : 'u-pat' })));
  const t0 = Date.now(); W._gcEnsureRecordIds(big, 'payrollProfiles'); const ms = Date.now() - t0;
  const pr = big.find(p => p.id === 'PPu-pat');
  ok(big.length === 2 && pr && pr.hourlyRate === 24 && pr.filing === 'married' && pr.frequency === 'weekly' && big.some(p => p.id === 'PPN-pat-example') && big.every(p => !/^gid/.test(p.id)),
    (ids.length + 1) + ' copies with runaway ids → the real profile (pay kept, + the stub field) + one name-keyed copy, no auto id left (' + ms + ' ms)', big.map(p => p.id));
  /* the sync loop that made 26,826 copies: two computers + the cloud, stubs pushed now and then — before: grows, now: flat */
  let A = [real, { name: NAME, frequency: 'weekly' }], B = [real, { name: NAME, homeState: 'TN' }], C = [];
  for (let r = 0; r < 40; r++) { C = U('payrollProfiles', C, A); B = U('payrollProfiles', B, C); C = U('payrollProfiles', C, B); A = U('payrollProfiles', A, C);
    if (r % 3 === 0) A.push({ name: NAME, frequency: 'weekly' }); if (r % 4 === 0) B.push({ name: NAME, homeState: 'TN' }); }
  ok(C.length === 2 && Math.max(...C.map(p => p.id.length)) <= 16 && C.some(p => p.id === 'PPu-pat' && p.hourlyRate === 24), '40 sync rounds with stubs pushed on two computers: the cloud keeps 2 records, ids ≤ 16 characters', C.map(p => p.id));
  /* any list: an exact copy folds (newer stamp kept); different records with one id both survive (as before) */
  const ex = [{ id: 'E1', vendor: 'Demo Supply', amt: 10, updatedAt: '2026-11-01' }, { id: 'E1', vendor: 'Demo Supply', amt: 10, updatedAt: '2026-11-05' }, { id: 'E2', amt: 3 }];
  W._gcEnsureRecordIds(ex, 'expenses');
  ok(ex.length === 2 && ex[0].id === 'E1' && ex[0].updatedAt === '2026-11-05', 'two exact copies (same id, same content) are one record — the newer stamp kept', ex);
  const dif = [{ id: 'X1', name: 'one', amt: 1 }, { id: 'X1', name: 'two', amt: 2 }];
  W._gcEnsureRecordIds(dif, 'expenses');
  ok(dif.length === 2 && dif[0].id === 'X1' && dif[1].id !== 'X1' && dif[1].name === 'two', 'two DIFFERENT records with one id: both kept, the second de-collided (unchanged rule)', dif.map(r => r.id));
  const q = [{ id: 'invId:I1', invId: 'I1', status: 'pending' }, { id: 'invId:I1', invId: 'I1', status: 'approved', pmDecidedAt: 5 }];
  W._gcEnsureRecordIds(q, 'gc_sub_approvals'); ok(q.length === 1 && q[0].status === 'approved', 'approval queues keep their own rule (a decided entry wins)', q);
  /* a deleted profile stays deleted: an old stub of a deleted person (tombstoned under the stable id) is dropped */
  W.localStorage.setItem('gc_tombstones', JSON.stringify({ 'payrollProfiles:PPu-gone': '2026-11-10T00:00:00Z' }));
  const m = U('payrollProfiles', [real], [{ id: FP, name: 'Gone Person', userId: 'u-gone' }]);
  ok(m.length === 1 && m[0].id === 'PPu-pat', 'a stale copy of a deleted profile (auto id) is re-keyed to its stable id and stays deleted', m.map(p => p.id));
}

/* ── B. compaction (the early script) ── */
function early(opts){
  opts = opts || {};
  const data = new Map(Object.entries(opts.ls || {}));
  class Storage { getItem(k){ return data.has(k) ? data.get(k) : null; } setItem(k, v){ if (opts.cap && String(v).length > opts.cap) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } data.set(k, String(v)); } removeItem(k){ data.delete(k); } }
  const LS = new Storage();
  const idb = new Map();
  class IDBRequest { get result(){ if (!this._done) { const e = new Error('not done'); e.name = 'InvalidStateError'; throw e; } return this._r; } }
  class IDBObjectStore { put(v, k){ idb.set(k, JSON.parse(JSON.stringify(v))); const r = new IDBRequest(); r._done = true; r._r = k; return r; } get(k){ const r = new IDBRequest(); r._done = true; r._r = idb.has(k) ? idb.get(k) : undefined; return r; } }
  const calls = [];
  const cloud = opts.cloud || {};
  const fetch = async (input, init) => {
    const u = String(input), m = ((init && init.method) || 'GET').toUpperCase(); calls.push({ u, m, body: init && init.body });
    if (m !== 'GET') return new Response('', { status: 201 });
    const k = /key=eq\.([^&]+)/.exec(u);
    const rows = k ? (cloud[k[1]] !== undefined ? [/select=value(&|$)/.test(u) ? { value: cloud[k[1]] } : { key: k[1], value: cloud[k[1]] }] : []) : Object.keys(cloud).map(x => ({ key: x, value: cloud[x], updated_at: 't' }));
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json', 'content-length': '9' } });
  };
  const timers = [];
  const W = { Storage, localStorage: LS, IDBObjectStore, IDBRequest, fetch, Response, Headers, URL, JSON, Object, Array, String, Math, Date, Number, isFinite, RegExp, console: { log(){}, warn(){} }, location: { href: 'https://app.local/' },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; } };
  W.window = W; if (opts.pre) opts.pre(W); vm.createContext(W); vm.runInContext(EARLY, W);
  return { W, LS, data, idb, calls, cloud, timers, OS: new IDBObjectStore() };
}
const NOW = Date.now(), DAY = 864e5, iso = t => new Date(t).toISOString();
function snapshot(){
  const m = {};
  runawayIds(9016, 55, 212, 112).forEach(id => { m['payrollProfiles:' + id] = '2026-11-12T13:40:38.933Z'; });
  const N = { schedule: 1791, expenses: 362, projects: 161, estimates: 145, leads: 138, invs: 103, gcAcctRegister: 94, invoices: 81, payrollRuns: 20, vendors: 6, subs: 4, users: 1 };
  Object.keys(N).forEach(c => { for (let i = 0; i < N[c]; i++) m[c + ':' + c.slice(0, 3).toUpperCase() + 'mtz' + i.toString(36)] = i % 3 ? iso(NOW - (i % 40) * DAY) : NOW - (i % 40) * DAY; });
  m['payrollProfiles:PPu-left'] = iso(NOW - 2 * DAY);         // a real deleted profile
  m['payrollProfiles:PPN-old-name'] = iso(NOW - 3 * DAY);
  m['payrollProfiles:PPab12cd'] = iso(NOW - 3 * DAY);
  m['leads:L-young'] = iso(NOW - 399 * DAY);                 // inside the 400-day window
  m['leads:L-ancient'] = iso(NOW - 401 * DAY);               // outside
  m['projects:P-nodate'] = 'yes';                            // unreadable time: kept for good
  m['projects:P-zero'] = 0;
  return m;
}
{
  const t = early(); const TF = t.W._gcTombFix;
  const snap = snapshot(), txt = JSON.stringify(snap);
  const real = Object.keys(snap).filter(k => !/^payrollProfiles:gid/.test(k));
  const t0 = Date.now(); const c = TF.compact(snap); const ms = Date.now() - t0;
  const ck = Object.keys(c), ctxt = JSON.stringify(c);
  ok(Object.keys(snap).length > 29000 && txt.length > 19e6, 'synthetic 11/12 shape: ' + Object.keys(snap).length + ' entries, ' + (txt.length / 1e6).toFixed(1) + ' M characters');
  ok(!ck.some(k => /^payrollProfiles:gid/.test(k)) && ck.includes('payrollProfiles:PPu-left') && ck.includes('payrollProfiles:PPN-old-name') && ck.includes('payrollProfiles:PPab12cd'), 'every auto payroll-profile id dropped; real payroll deletes kept');
  ok(real.every(k => k === 'leads:L-ancient' || k in c) && !('leads:L-ancient' in c) && ck.includes('leads:L-young') && ck.includes('projects:P-nodate') && ck.includes('projects:P-zero'), 'every real entry younger than 400 days kept (399 d kept, 401 d aged out, unreadable / 0 times kept)');
  ok(ctxt.length < 200000, 'compacted: ' + ctxt.length + ' characters (from ' + txt.length + ') in ' + ms + ' ms');
  ok(TF.compact(c) === c, 'idempotent: compacting the compacted list changes nothing (same object)');
  const half1 = {}, half2 = {}; Object.keys(snap).forEach((k, i) => { (i % 2 ? half1 : half2)[k] = snap[k]; });
  const u = Object.assign({}, TF.compact(half1), TF.compact(half2));
  ok(JSON.stringify(Object.keys(u).sort()) === JSON.stringify(ck.slice().sort()), 'two computers compacting their halves at once: the union is the compacted whole');
  ok(TF.garbage('payrollProfiles:' + FP) && TF.garbage('payrollProfiles:' + FP + '-' + SFP + '-9016') && !TF.garbage('payrollProfiles:PPu1') && !TF.garbage('projects:' + FP) && !TF.garbage('payrollRuns:' + FP), 'the auto-id rule is for payroll profiles only');
}
/* localStorage door: an old 21 MB copy is cleaned at start; a write of the big list is cleaned before it is stored */
{
  const snap = snapshot();
  const t = early({ ls: { gc_tombstones: JSON.stringify(snap), other: 'x' } });
  const v = t.data.get('gc_tombstones');
  ok(v.length < 200000 && !/payrollProfiles:gid/.test(v) && JSON.parse(v)['leads:L-young'], 'start-up: the old copy in localStorage is cleaned (' + v.length + ' characters)');
  t.LS.setItem('gc_tombstones', JSON.stringify(snap));
  const v2 = t.data.get('gc_tombstones'); ok(v2.length < 200000 && !/payrollProfiles:gid/.test(v2), 'localStorage.setItem of the 21 MB list stores the clean one');
  const small = JSON.stringify({ 'leads:L1': iso(NOW) }); t.LS.setItem('gc_tombstones', small); ok(t.data.get('gc_tombstones') === small, 'a small clean list is stored as it is');
  t.LS.setItem('projects_x', 'y'); ok(t.data.get('projects_x') === 'y', 'other keys untouched');
  const huge = {}; for (let i = 0; i < 40000; i++) huge['schedule:S' + i] = iso(NOW - i * 1000); for (let i = 0; i < 1000; i++) huge['leads:L' + i] = iso(NOW - 9 * DAY);
  t.LS.setItem('gc_tombstones', JSON.stringify(huge)); const v3 = JSON.parse(t.data.get('gc_tombstones'));
  ok(t.data.get('gc_tombstones').length <= 1000000 && Object.keys(v3).filter(k => k.startsWith('leads:')).length === 1000, 'a real list over 1 M characters: the quick-start copy is capped, every non-schedule entry kept first', t.data.get('gc_tombstones').length);
}
/* IndexedDB door */
{
  const t = early(); const snap = snapshot();
  t.OS.put(snap, 'gc_tombstones_all'); const st = t.idb.get('gc_tombstones_all');
  ok(Object.keys(st).length < 4000 && !Object.keys(st).some(k => /^payrollProfiles:gid/.test(k)), 'IndexedDB put of gc_tombstones_all stores the clean list');
  t.OS.put({ k: 'gc_tombstones', v: JSON.stringify(snap) }, 'gc_tombstones'); ok(!/payrollProfiles:gid/.test(t.idb.get('gc_tombstones').v), 'the old {k, v: text} shape too');
  t.idb.set('gc_tombstones_all', snap);   /* written by an older version */
  const r = t.OS.get('gc_tombstones_all'); ok(Object.keys(r.result).length < 4000 && r.result['leads:L-young'], 'IndexedDB get of an old 21 MB copy answers the clean list');
  t.OS.put([1, 2], 'projects'); ok(JSON.stringify(t.idb.get('projects')) === '[1,2]', 'other IndexedDB keys untouched');
}
/* the cloud door + the one write-back */
{
  const snap = snapshot();
  const t = early({ cloud: { gc_tombstones: snap, projects: [{ id: 'P1' }] } });
  t.W._gcTombstones = () => ({ 'leads:L-here-only': iso(NOW) });
  const pushes = []; t.W._supaUpsertNow = (k, v) => pushes.push([k, v]);
  const r = await t.W.fetch('https://x.supabase.co/rest/v1/gc_kv?key=eq.gc_tombstones&select=value', {});
  const j = await r.json();
  ok(Array.isArray(j) && Object.keys(j[0].value).length < 4000 && j[0].value['payrollProfiles:PPu-left'] && !Object.keys(j[0].value).some(k => /^payrollProfiles:gid/.test(k)), 'a read of gc_tombstones answers the clean list');
  const r2 = await t.W.fetch('https://x.supabase.co/rest/v1/gc_kv?select=key,value,updated_at', {}); const j2 = await r2.json();
  const tr = j2.find(x => x.key === 'gc_tombstones');
  ok(tr && Object.keys(tr.value).length < 4000 && j2.find(x => x.key === 'projects').value[0].id === 'P1', 'a bulk read: the gc_tombstones row cleaned, the other rows as they were');
  const r3 = await t.W.fetch('https://x.supabase.co/rest/v1/gc_kv?key=eq.projects&select=value', {}); ok((await r3.json())[0].value[0].id === 'P1', 'a read of another key is passed through');
  ok(t.timers.some(x => x.ms === 25000), 'a dirty cloud list schedules ONE clean write-back');
  t.timers.filter(x => x.ms === 25000).forEach(x => x.f());
  ok(pushes.length === 1 && pushes[0][0] === 'gc_tombstones' && pushes[0][1]['leads:L-here-only'] && pushes[0][1]['payrollProfiles:PPu-left'] && pushes[0][1]['leads:L-young'] && !Object.keys(pushes[0][1]).some(k => /^payrollProfiles:gid/.test(k)),
    'the write-back is the union of the cloud\'s clean list and this computer\'s (nothing real left out)', pushes.length);
  await t.W.fetch('https://x.supabase.co/rest/v1/gc_kv?key=eq.gc_tombstones&select=value', {});
  ok(t.timers.filter(x => x.ms === 25000).length === 1, 'not again within 10 minutes');
  /* uploads */
  await t.W.fetch('https://x.supabase.co/rest/v1/gc_kv?on_conflict=key', { method: 'POST', body: JSON.stringify([{ key: 'projects', value: [{ id: 'P1' }] }, { key: 'gc_tombstones', value: snap }]) });
  const up = JSON.parse(t.calls[t.calls.length - 1].body);
  ok(up.length === 2 && up[0].key === 'projects' && Object.keys(up[1].value).length < 4000 && !('__gcTF' in up[1]) && !('__gcTF' in up[0]), 'an upload of the big list sends the clean one (other rows untouched)');
  await t.W.fetch('https://x.supabase.co/rest/v1/gc_kv?on_conflict=key', { method: 'POST', body: JSON.stringify({ key: 'gc_tombstones', value: JSON.stringify(snap) }) });
  const up2 = JSON.parse(t.calls[t.calls.length - 1].body); ok(typeof up2.value === 'string' && up2.value.length < 200000, 'as JSON text too (kept as text)');
  await t.W.fetch('https://x.supabase.co/rest/v1/gc_kv?key=eq.gc_tombstones', { method: 'PATCH', body: JSON.stringify({ value: snap }) });
  ok(Object.keys(JSON.parse(t.calls[t.calls.length - 1].body).value).length < 4000, 'a PATCH of the row too');
  const n = t.calls.length; const pb = JSON.stringify({ key: 'projects', value: [] });
  await t.W.fetch('https://x.supabase.co/rest/v1/gc_kv?on_conflict=key', { method: 'POST', body: pb }); ok(t.calls[n].body === pb, 'other uploads are passed through unchanged');
}
{ /* an empty computer never pushes an empty list */
  const t = early(); const pushes = []; t.W._supaUpsertNow = (k, v) => pushes.push(v); t.W._gcTombFix.pushClean(); ok(pushes.length === 0, 'no write-back of an empty list'); }
{ /* off switch */
  const t = early({ ls: { gc_tombfix_off: '1', gc_tombstones: JSON.stringify(snapshot()) } }); ok(!t.W._gcTombFix && t.data.get('gc_tombstones').length > 19e6, 'gc_tombfix_off = 1: not installed', [typeof t.W._gcTombFix, t.data.get('gc_tombstones').length]); }

console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
