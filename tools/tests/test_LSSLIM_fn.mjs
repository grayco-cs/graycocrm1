// test_LSSLIM_fn.mjs <build-dir> [base-index.html] — patch LSSLIM: gc_active_no_deposit stays one entry per job.
// Runs the build's OWN code (no browser): the job-status menu's writer, the never-lose union merge (_gcUnionMerge /
// _gcEnsureRecordIds), the company-sync merge (_gcPullMerge / mergeVal, also used by the union push) and the alert bar's
// reader, on three computers sharing one cloud row (stored like Postgres jsonb: keys re-ordered). Real job ids / names come
// from the read-only mirror (MIRROR=..., default the loop mirror).
// 1. base build (default: git show 717d5ef:index.html): the list grows on every sync round until a phone's copy is
//    >= 1.5 M characters (the owner's iPhone, 11/03: 1,554,832).
// 2. the patched build takes those exact computers + cloud: the page load slims the copy, sync keeps it slim
//    (one entry per job, <= 50), the cloud copy goes slim on the next push, and the alert bar still shows the same jobs.
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { execFileSync } from 'child_process';

const build = process.argv[2];
if (!build) { console.error('usage: node test_LSSLIM_fn.mjs <dir with index.html> [base index.html]'); process.exit(2); }
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 300) : '')); } };
const K = 'gc_active_no_deposit';

function blocks(src) {
  const cut = (a, b, incB) => { const i = src.indexOf(a); if (i < 0) throw new Error('anchor not found: ' + a.slice(0, 60)); const j = src.indexOf(b, i); if (j < 0) throw new Error('end not found: ' + b.slice(0, 60)); return src.slice(i, incB ? j + b.length : j); };
  const never = cut("(function(){\n  // Deterministic hash of a string", "console.log('[GC] Never-lose-data invariant loaded", false);
  const neverEnd = src.indexOf('})();', src.indexOf("console.log('[GC] Never-lose-data invariant loaded")) + 5;
  return {
    never: src.slice(src.indexOf("(function(){\n  // Deterministic hash of a string"), neverEnd),
    merge: cut('var PULL_SKIP = { navOrders:1', '/* before each push: the localStorage-backed lists go into IndexedDB', false),
    writer: cut('var _dna=JSON.parse(localStorage.getItem("gc_active_no_deposit")||"[]");', 'JSON.stringify(_dna.slice(0,50)));', true),
    reader: cut('  // ── ACTIVE WITHOUT DEPOSIT ALERTS', '  // ── NEW LEAD ALERTS', false),
  };
}

let clock = Date.parse('2026-10-01T13:00:00Z');
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(clock); } static now() { return clock; } }
function computer(B, name, store) {
  store = store || {};
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const window = { localStorage };
  const ctx = { window, localStorage, console: { log() {}, warn() {} }, JSON, Object, Array, String, Math, Date: FakeDate, isNaN, parseFloat };
  vm.createContext(ctx);
  vm.runInContext(B.never, ctx);
  vm.runInContext('(function(){' + B.merge + '})();', ctx);   // also runs the page-load step of the build, if it has one
  const writer = new vm.Script('(function(jt){ ' + B.writer + ' })');
  const reader = new vm.Script('(function(isAdmin, alerts){ ' + B.reader + ' })');
  return { name, store, ctx, window, idb: {}, write: jt => writer.runInContext(ctx)(jt), alerts: projects => { window._crm = { projects }; const a = []; reader.runInContext(ctx)(true, a); return a; } };
}
const jsonb = v => Array.isArray(v) ? v.map(jsonb) : (v && typeof v === 'object') ? Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).reduce((o, k) => (o[k] = jsonb(v[k]), o), {}) : v;
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const world = { cloud: null };
async function pull(d) {   // the pull loop of the main sync for one row (SAFETY NET union, then patch D merge)
  if (world.cloud == null) return;
  let val = clone(world.cloud);
  const gen = clone(d.idb[K]);
  if (Array.isArray(val) && val.length && val[0] && typeof val[0] === 'object' && Array.isArray(gen)) val = d.window._gcUnionMerge(K, gen, val);
  val = await d.window._gcPullMerge(K, val, clone(d.idb[K]));
  d.idb[K] = clone(val);
}
function push(d) {          // _gcPushAll: localStorage -> IndexedDB, then the union push (mergeVal with the cloud copy)
  const raw = d.store[K]; if (raw != null) d.idb[K] = JSON.parse(raw);
  let v = clone(d.idb[K]); if (v == null) return;
  if (world.cloud != null) v = d.window._gcMergeValue(K, v, clone(world.cloud));
  world.cloud = jsonb(v);
}
const lsLen = d => (d.store[K] || '').length + K.length;   // what LSGUARD reports as "size"
async function round(devs) { for (const d of devs) { await pull(d); push(d); } clock += 30000; }

// real jobs from the mirror (the status menu sets status "active")
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
let projects = rows.find(r => r.key === 'projects').v; if (typeof projects === 'string') projects = JSON.parse(projects);
const jobs = projects.filter(p => p && p.id && p.name && /^active$/i.test(p.status || '')).slice(0, 12).map(p => Object.assign({}, p, { status: 'active' }));
const crmProjects = projects.map(p => jobs.find(j => j.id === p.id) || p);
ok(jobs.length === 12, 'mirror: 12 real active jobs (' + projects.length + ' projects)');

// ── 1. the base build: it grows ──────────────────────────────────────────────────────────────────────────
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const baseSrc = process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8') : execFileSync('git', ['-C', repo, 'show', '717d5ef:index.html'], { maxBuffer: 1 << 30 }).toString('utf8');
const BB = blocks(baseSrc);
const old = ['A', 'B', 'C'].map(n => computer(BB, n));
let r = 0, t0 = Date.now(), grew = [];
// a few real status changes (each job went active once; four of them twice), then sync rounds only
for (let i = 0; i < 16; i++) { old[i % 3].write(jobs[i % 12]); clock += 3600e3; await round(old); r++; }
while (Math.max(...old.map(lsLen)) < 1554832 && r < 400) { await round(old); r++; if (r % 40 === 0) grew.push(Math.max(...old.map(lsLen))); }
const before = old.map(lsLen), cloudBefore = JSON.stringify(world.cloud).length;
const beforeEntries = JSON.parse(old[0].store[K]).length;
console.log('  base build: after ' + r + ' sync rounds (16 status changes) the copies are ' + before.join(' / ') + ' characters (' + beforeEntries + ' entries; cloud ' + cloudBefore + ') — ' + (Date.now() - t0) + ' ms');
ok(Math.max(...before) >= 1554832 && grew.every((g, i) => !i || g > grew[i - 1]), 'base build reproduces the phone: grows every round to >= 1,554,832 characters', { grew, before });
const oldAlerts = old[0].alerts(crmProjects);

// ── 2. the patched build on the same computers + cloud ────────────────────────────────────────────────────
const PB = blocks(fs.readFileSync(path.join(build, 'index.html'), 'utf8'));
ok(/__GC_PATCH_LSSLIM__/.test(PB.merge), 'build carries patch LSSLIM');
const now = old.map(d => { const c = computer(PB, d.name, Object.assign({}, d.store)); c.idb = clone(d.idb); return c; });   // page load
const atLoad = now.map(lsLen);
console.log('  patched build, at page load: ' + atLoad.join(' / ') + ' characters');
ok(atLoad.every(n => n < 8000), 'page load slims this computer\'s copy (was ' + Math.max(...before) + ')', atLoad);
const slim = JSON.parse(now[0].store[K]);
ok(slim.length === 12 && new Set(slim.map(e => e.pid)).size === 12, 'one entry per job (12 jobs)', slim.length);
ok(slim.every(e => Object.keys(e).sort().join() === 'at,id,name,pid' && e.id === 'dna:' + e.pid), 'entries are only {id, pid, name, at}', slim[0]);
ok(slim.every((e, i) => !i || slim[i - 1].at >= e.at), 'newest first');
ok(slim.every(e => jobs.find(j => j.id === e.pid && j.name === e.name)), 'names are the jobs\' names');
// the newest `at` per job survives: the job that went active twice keeps its second time
const second = jobs[0].id;   // written at i=0 and i=12
const atOf = (list, pid) => list.filter(e => e.pid === pid).map(e => e.at).sort().pop();
ok(atOf(slim, second) === atOf(JSON.parse(old[0].store[K]), second), 'the newest time a job went active is kept');

// the alert bar reads the same jobs (no duplicates)
const newAlerts = now[0].alerts(crmProjects);
console.log('  alert bar, base: ' + oldAlerts.map(a => a.pid).join(' ') + ' | patched: ' + newAlerts.map(a => a.pid).join(' '));
ok(newAlerts.length === 5 && new Set(newAlerts.map(a => a.pid)).size === 5, 'alert bar: 5 alerts, 5 different jobs', newAlerts.map(a => a.pid));
// the jobs that went active most recently (newest time per job in the base build's big list)
const bigList = JSON.parse(old[0].store[K]), newest = {};
bigList.forEach(e => { if (e && e.pid && !(newest[e.pid] >= e.at)) newest[e.pid] = e.at; });
const want = Object.keys(newest).sort((a, b) => newest[b] < newest[a] ? -1 : 1).slice(0, 5);
ok(JSON.stringify(newAlerts.map(a => a.pid)) === JSON.stringify(want), 'alert bar: the 5 jobs that went active most recently, newest first', { want, got: newAlerts.map(a => a.pid) });
ok(new Set(oldAlerts.map(a => a.pid)).size < oldAlerts.length, 'base build: the same job twice among its 5 alerts (copies)', oldAlerts.map(a => a.pid));
ok(newAlerts.every(a => a.type === 'no_deposit' && a.title === 'Active with NO deposit: ' + jobs.find(j => j.id === a.pid).name), 'titles carry the job name');
// a cleared entry stays out
const cl = JSON.parse(now[1].store[K]); cl[0].cleared = true; now[1].store[K] = JSON.stringify(cl);
ok(!now[1].alerts(crmProjects).find(a => a.pid === cl[0].pid), 'a cleared entry raises no alert');
cl[0].cleared = false; delete cl[0].cleared; now[1].store[K] = JSON.stringify(cl);

// sync with the big cloud copy: stays slim, and the cloud goes slim
for (let i = 0; i < 3; i++) await round(now);
const cloudAfter = JSON.stringify(world.cloud).length;
console.log('  after 3 sync rounds: copies ' + now.map(lsLen).join(' / ') + ', IndexedDB ' + now.map(d => JSON.stringify(d.idb[K]).length).join(' / ') + ', cloud ' + cloudAfter + ' (was ' + cloudBefore + ')');
ok(now.every(d => lsLen(d) < 8000) && cloudAfter < 8000, 'the big cloud copy does not come back; the cloud copy is slim after the next push');
// new status changes + 60 more rounds: bounded
for (let i = 0; i < 60; i++) { if (i % 6 === 0) now[i % 3].write(jobs[(i / 6) % 12 | 0]); clock += 60000; await round(now); }
const fin = now.map(lsLen), finEntries = JSON.parse(now[0].store[K]);
console.log('  after 10 more status changes + 60 rounds: ' + fin.join(' / ') + ' characters, ' + finEntries.length + ' entries, cloud ' + JSON.stringify(world.cloud).length);
ok(fin.every(n => n < 8000) && finEntries.length === 12 && JSON.stringify(world.cloud).length < 8000, 'stays one entry per job, under 8,000 characters');
ok(new Set(now.map(d => d.store[K])).size === 1, 'all three computers hold the same list');
const fresh = now[2]; fresh.write(jobs[5]);
ok(JSON.parse(fresh.store[K])[0].pid === jobs[5].id && fresh.alerts(crmProjects)[0].pid === jobs[5].id, 'a new "went active" is first in the list and first in the alert bar');
await round(now); await round(now);   // C pushes after A pulled: A has it on the next round
ok(JSON.parse(now[0].store[K]).filter(e => e.pid === jobs[5].id).length === 1 && JSON.parse(now[0].store[K])[0].pid === jobs[5].id, 'it reaches the other computers as the one entry for that job');
// idempotent: slimming a slim list changes nothing
ok(typeof now[0].window._gcDnaSlim === 'function' && JSON.stringify(now[0].window._gcDnaSlim(JSON.parse(now[0].store[K]))) === now[0].store[K], 'slimming is idempotent');

console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
