// test_TOMBFIX2_fn.mjs <build-dir | index.html> — patch TOMBFIX2 without a browser (Node vm, the page's own scripts):
//  1. the localStorage door parses only a text that carries a runaway entry, once per distinct text; a clean text is stored as is
//  2. a cloud answer for key=in.(…): only the gc_tombstones row is cleaned (other map rows with old times are left alone)
//  3. the universal tombstones module: 20 deletes in one burst = one localStorage write, one push; memory has all 20 at once;
//     a runaway payroll-profile mark never enters its memory
//  4. the page's in-memory delete lists all refuse runaway marks (FIX_INV absorbMap, fix-pack, cloud sync) and FIX_INV repairs
//     its browser copy once per burst
// Made-up data only.   node tools/tests/test_TOMBFIX2_fn.mjs <build-dir>
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import os from 'os'; import { execFileSync } from 'child_process';
const here = path.dirname(new URL(import.meta.url).pathname);
let html = process.argv[2] || path.join(here, '..', '..', 'index.html');
if (fs.existsSync(html) && fs.statSync(html).isDirectory()) html = path.join(html, 'index.html');
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i !== undefined ? ' ' + JSON.stringify(i).slice(0, 400) : '')); } };
const src = fs.readFileSync(html, 'utf8');
const EARLY = fs.readFileSync(path.join(here, '..', 'tombfix_early.js'), 'utf8');
ok(src.includes('TOMBFIX2 (r36c') && src.includes(EARLY.trim().split('\n').slice(30, 40).join('\n')), 'the page carries the TOMBFIX2 early script (= tools/tombfix_early.js)');
{ const tmp = path.join(os.tmpdir(), 'tombfix2_idem_' + process.pid + '.html'); fs.writeFileSync(tmp, src);
  const out = execFileSync('python3', [path.join(here, '..', 'patch_TOMBFIX2.py'), tmp]).toString(); ok(/already patched/.test(out) && fs.readFileSync(tmp, 'utf8') === src, 'patch is idempotent'); fs.unlinkSync(tmp); }
const G = '(window._gcTombGarbage && window._gcTombGarbage(';
ok(src.split(G).length - 1 === 5, 'five in-memory delete-list doors refuse runaway marks (FIX_INV, universal, fix-pack x2, cloud sync)', src.split(G).length - 1);
ok(/var repT = null;\nfunction changed\(\)\{\n  \/\* TOMBFIX2[^\n]*\n  if\(!repT\) repT = ST\.call\(window, function\(\)\{ repT = null; try\{ repairLS\(\); \}catch\(e\)\{\} \}, 120\);/.test(src), 'FIX_INV: repairLS once per burst (120 ms), not per delete');

function djb(s){ let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'gid' + (h >>> 0).toString(36); }
const FP = djb('x'), SFP = djb('y');
const NOW = Date.now(), DAY = 864e5, iso = t => new Date(t).toISOString();
function early(opts){
  opts = opts || {};
  const data = new Map(Object.entries(opts.ls || {})); let parses = 0;
  class Storage { getItem(k){ return data.has(k) ? data.get(k) : null; } setItem(k, v){ data.set(k, String(v)); } removeItem(k){ data.delete(k); } }
  const LS = new Storage();
  const calls = [];
  const fetch = async (input, init) => { calls.push(String(input)); return new Response(JSON.stringify(opts.rows || []), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const J = { parse: (s, r) => { parses++; return JSON.parse(s, r); }, stringify: JSON.stringify };
  const W = { Storage, localStorage: LS, fetch, Response, Headers, URL, JSON: J, Object, Array, String, Math, Date, Number, isFinite, RegExp, console: { log(){}, warn(){} }, location: { href: 'https://app.local/' }, setTimeout: () => 1 };
  W.window = W; vm.createContext(W); vm.runInContext(EARLY, W);
  return { W, LS, data, calls, parses: () => parses };
}
/* 1. the localStorage door */
{
  const t = early(); const big = {}; for (let i = 0; i < 3000; i++) big['leads:L' + i] = iso(NOW - i * 1000);
  const clean = JSON.stringify(big);
  const p0 = t.parses(); for (let i = 0; i < 20; i++) t.LS.setItem('gc_tombstones', clean);
  ok(t.parses() === p0 && t.data.get('gc_tombstones') === clean, '20 writes of a clean 3,000-entry list: stored as is, never parsed', t.parses() - p0);
  const dirty = Object.assign({}, big); for (let i = 0; i < 5000; i++) dirty['payrollProfiles:' + FP + '-' + SFP + '-' + i] = iso(NOW);
  const dt = JSON.stringify(dirty); const p1 = t.parses();
  for (let i = 0; i < 10; i++) t.LS.setItem('gc_tombstones', dt);
  ok(t.parses() - p1 === 1 && t.data.get('gc_tombstones') === clean, 'the same runaway text written 10 times: parsed once (remembered), stored clean', t.parses() - p1);
  ok(typeof t.W._gcTombGarbage === 'function' && t.W._gcTombGarbage('payrollProfiles:' + FP) && !t.W._gcTombGarbage('leads:' + FP), 'window._gcTombGarbage: the runaway rule (payroll-profile auto ids only)');
}
/* 2. a key=in.(…) answer */
{
  const old = NOW - 500 * DAY, seen = { a: old, b: old + 1 };
  const tomb = { 'leads:L1': iso(NOW), ['payrollProfiles:' + FP]: iso(NOW), 'projects:P-old': old };
  const t = early({ rows: [{ key: 'gc_doc_seen', value: seen }, { key: 'gc_tombstones', value: tomb }] });
  const r = await t.W.fetch('https://x.supabase.co/rest/v1/gc_kv?key=in.(%22gc_doc_seen%22,%22gc_tombstones%22)&select=key,value', {}); const j = await r.json();
  const ds = j.find(x => x.key === 'gc_doc_seen').value, tb = j.find(x => x.key === 'gc_tombstones').value;
  ok(ds.a === old && ds.b === old + 1, 'a key=in.(…) read: another map row (old times) is left exactly as it was', ds);
  ok(tb['leads:L1'] && !tb['payrollProfiles:' + FP] && !tb['projects:P-old'], '…the gc_tombstones row in it is cleaned', tb);
  const t2 = early({ rows: [{ value: tomb }] });
  const r2 = await t2.W.fetch('https://x.supabase.co/rest/v1/gc_kv?key=eq.gc_tombstones&select=value', {}); const j2 = await r2.json();
  ok(!j2[0].value['payrollProfiles:' + FP] && j2[0].value['leads:L1'], 'a key=eq.gc_tombstones read (rows without a key) is cleaned');
}
/* 3. the universal tombstones module */
function block(marker){ const lines = src.split('\n'); const s0 = lines.findIndex(l => l.includes(marker)); let a = s0; while (!lines[a].startsWith('<script')) a--; let b = s0; while (!lines[b].startsWith('</script')) b++; return lines.slice(a + 1, b).join('\n'); }
{
  const UNI = block('Universal tombstones: deleted things STAY deleted');
  const data = new Map(); let lsWrites = 0; const timers = [];
  const W = { console: { log(){}, warn(){} }, JSON, Object, Array, String, Math, Date, Number, RegExp, isFinite };
  W.localStorage = { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { if (k === 'gc_tombstones') lsWrites++; data.set(k, String(v)); }, removeItem: k => data.delete(k) };
  W.setTimeout = (f, ms) => { timers.push(f); return timers.length; }; W.clearTimeout = () => {}; W.setInterval = () => 1; W.clearInterval = () => {};
  W.addEventListener = () => {};
  const pushes = []; W._supaUpsertNow = (k, v) => pushes.push(k);
  W._gcTombGarbage = k => /^payrollProfiles:gid/.test(k);
  W.window = W; vm.createContext(W); vm.runInContext(UNI, W);
  for (let i = 0; i < 20; i++) W._gcTombstone('leads', 'LX' + i);
  const mem = W._gcTombstones();
  ok(Object.keys(mem).filter(k => /^leads:LX/.test(k)).length === 20 && W._gcIsTombstoned('leads', 'LX7'), '20 deletes: all 20 are deleted at once (memory)');
  ok(lsWrites === 0 && pushes.length === 0, '…no write yet inside the burst', { lsWrites, pushes: pushes.length });
  timers.splice(0).forEach(f => f());
  ok(lsWrites === 1 && pushes.length === 1 && Object.keys(JSON.parse(data.get('gc_tombstones'))).filter(k => /^leads:LX/.test(k)).length === 20, '…then ONE localStorage write and ONE cloud push with all 20', { lsWrites, pushes: pushes.length });
  data.set('gc_tombstones', JSON.stringify({ ['payrollProfiles:' + FP]: iso(NOW), 'leads:LY': iso(NOW) }));
  const m2 = W._gcTombstones();
  ok(m2['leads:LY'] && !m2['payrollProfiles:' + FP], 'a runaway payroll-profile mark read back from localStorage never enters memory');
}
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
