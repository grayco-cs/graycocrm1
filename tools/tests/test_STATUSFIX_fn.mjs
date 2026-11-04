// test_STATUSFIX_fn.mjs [index.html] — patch STATUSFIX: the REAL core (window.__GC_STATUSFIX__) and repair card code, lifted
// out of index.html and run in a vm. Replays the 11/04 incident shape: an old copy saved over the newer list.
//  · a save stamps only the records it changed (no bulk restamp); a background write stamps nothing
//  · completed / lost are kept unless a person changed a status (gesture / CRM job-status writer / newer person status edit)
//  · job year: schedule / job dates → the year the job starts (ROTC Cordova, EAH Wash Bay → 2026)
//  · the repair card lists the 10 jobs, ROTC pre-ticked with its note, and "Put back" goes through _gcxPatchJob with a log line
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, '..', '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const grab = id => { const m = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>')); if (!m) throw new Error('no script ' + id); return m[1]; };
let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info) : '')); } };

const win = {}; const ctx = vm.createContext(Object.assign(win, { window: win, console, JSON, Date, Math, Object, Array, String, Number, isFinite, parseInt }));
vm.runInContext(grab('gc-patch-statusfix-core'), ctx);
const SF = ctx.__GC_STATUSFIX__;
ok(!!SF && typeof SF.stampChanged === 'function', 'core loaded');

// ── 1. a save stamps only what changed ────────────────────────────────────────────────────────────────────────
const OLD = '2026-10-26T19:10:01.616Z', NOW = '2026-11-04T19:33:47.391Z';
const mk = n => Array.from({ length: n }, (_, i) => ({ id: 'P' + i, name: 'Job ' + i, status: i % 3 ? 'active' : 'completed', updatedAt: OLD, savedAt: OLD }));
let list = mk(382);
ok(SF.stampChanged('projects', list, NOW) === 0, 'first write of a list: the baseline, nothing stamped');
ok(list.every(r => r.updatedAt === OLD), 'no job re-stamped by the first write');
list[5] = Object.assign({}, list[5], { pm: 'Nick' });
ok(SF.stampChanged('projects', list, NOW) === 1, 'a save that changed one job stamps exactly one');
ok(list[5].updatedAt === NOW && list.filter(r => r.updatedAt === NOW).length === 1, 'only the changed job carries the new stamp');
ok(SF.stampChanged('projects', list, '2026-11-04T19:40:00.000Z') === 0, 'the same list saved again: nothing stamped (updatedAt is not a change)');
list.forEach(r => { r.jobYear = 2026; r.jobYearFrom = 'schedule'; });
ok(SF.stampChanged('projects', list, NOW) === 0, 'a job-year recompute is not a change');
const bg = list.map(r => r.id === 'P7' ? Object.assign({}, r, { status: 'lost' }) : r);
ok(SF.stampChanged('projects', bg, NOW, true) === 0 && bg[7].updatedAt === OLD, 'a background write (no one clicking): remembered, nothing stamped');
ok(SF.stampChanged('projects', bg, NOW) === 0, '… and that pulled change is not stamped by the next save either');
ok(SF.stampChanged('invs', [{ id: 'I1' }], NOW) === 0, 'lists are tracked per key');

// ── 2. completed / lost kept (the 11/04 old-copy save replayed) ────────────────────────────────────────────────
const CASES = [
  ['PRJf570wdyf36b', 'Jason Watkins- reroof', 'completed', 'active'], ['PRJqwpno4m', 'Zoo Boardwalk Redecking', 'completed', 'approved'],
  ['PRJ3b2y5z3', 'Somerville ceilings', 'completed', 'approved'], ['PRJmrjnbxgi', 'EAN Holdings- 600 W. church St.- remodel', 'completed', 'approved'],
  ['PRJf5rtc0gzn73', 'Roof 2', 'completed', 'bidding'], ['PRJ0sx249j6n8v', 'ROTC Cordova', 'approved', 'active'],
  ['PRJ_mstd56bh4hcb', 'Fayette County Fire Station', 'lost', 'bidding'], ['PRJejk50lxun18', 'ISmash Memphis', 'lost', 'bidding'],
  ['PRJ3aw4kp1u31r', 'EAH - Wash Bay Jonesboro', 'lost', 'bidding'], ['PRJep9czbdsn5k', 'Custom Bathroom  remodel', 'lost', 'bidding']];
const prev = {}; CASES.forEach(([id, , was]) => { prev[id] = { status: was }; });
const stale = () => CASES.map(([id, name, , bad]) => ({ id, name, status: bad, updatedAt: NOW }));
let s1 = stale(), held = SF.holdTerminal(prev, s1, {});
ok(held.length === 9, 'old copy with no person status change: the 9 completed / lost jobs are held', held.length);
ok(s1.filter(r => r.id !== 'PRJ0sx249j6n8v').every(r => r.status === prev[r.id].status), 'each keeps its completed / lost status');
ok(s1.find(r => r.id === 'PRJ0sx249j6n8v').status === 'active', 'ROTC Cordova (approved → active is not leaving completed / lost) is not touched');
let s2 = stale(); held = SF.holdTerminal({ PRJqwpno4m: { status: 'Completed' } }, s2, {});
ok(held.length === 1 && s2[1].status === 'Completed', 'status case does not matter ("Completed")');
let s3 = stale(); held = SF.holdTerminal(prev, s3, { gesture: true });
ok(held.length === 6, 'a person just changed a status: up to 3 jobs may leave completed / lost in one save, the rest are held', held.length);
let s4 = stale(); held = SF.holdTerminal(prev, s4, { forced: { PRJqwpno4m: 1 } });
ok(held.length === 8 && s4[1].status === 'approved', "the CRM's own job-status writer for that job passes");
let s5 = stale(); s5[1]._fe = { status: { v: 'approved', at: '2026-11-05T10:00:00.000Z', by: 'owner' } };
held = SF.holdTerminal(prev, s5, { fe: { PRJqwpno4m: { status: { v: 'completed', at: '2026-10-21T01:07:52.967Z' } } } });
ok(s5[1].status === 'approved' && held.length === 8, 'a copy carrying a NEWER person status edit (a real reopen elsewhere) passes');
let s6 = stale(); s6[1]._fe = { status: { v: 'approved', at: '2026-11-04T18:12:49.998Z', by: 'office' } };
SF.holdTerminal(prev, s6, { fe: { PRJqwpno4m: { status: { v: 'completed', at: '2026-11-04T20:00:00.000Z' } } } });
ok(s6[1].status === 'completed', 'a status edit OLDER than the put-back (the 18:12 old-copy stamp) is held');
ok(SF.isTerm('Lost') && SF.isTerm('completed') && SF.isTerm('cancelled') && !SF.isTerm('active') && !SF.isTerm('bidding'), 'terminal statuses');

// ── 3. job year ───────────────────────────────────────────────────────────────────────────────────────────────
const rotc = ['2027-01-05', '2027-01-20', '2027-01-21', '2027-01-26', '2027-02-25', '2026-11-16', '2026-11-25'];
ok(SF.jobYearOf(rotc, 'schedule') === 2026, 'ROTC Cordova (schedule starts 2026-11-16, punch list Jan 2027) → 2026');
ok(SF.jobYearOf(['2027-01-01', '2026-08-22'], 'job dates') === 2026, 'EAH - Wash Bay Jonesboro (start 2026-08-22, end 2027-01-01) → 2026');
ok(SF.jobYearOf(['2027-01-18'], 'job dates') === 2027, 'Collierville New Build (starts 2027-01-18) stays 2027');
ok(SF.jobYearOf(['2025-06-01', '2026-02-01'], 'payments') === 2026, 'money: still the most recent payment year');
ok(/jobYearOf\(dates, src\)/.test(html), '_gcJobYear uses the new rule');

// ── 4. the patched writers / SYNC_A ───────────────────────────────────────────────────────────────────────────
ok(!/val\.forEach\(function\(r\)\{ if\(r && typeof r==='object'\)\{ r\.updatedAt=_now;/.test(html), '_gcRecIDBput no longer stamps every record');
ok(!/list\.forEach\(function\(r\)\{ if\(r && typeof r==='object'\)\{ r\.updatedAt=now; if\(!r\.savedAt\) r\.savedAt=now; \} \}\);\n    return list;/.test(html), 'SAVE-FOR-GOOD stampAll no longer stamps every record');
ok(/stampAll\(value, key, !\(window\.__GC_IS_ACTIVE__/.test(html), 'background writes still seed the change baseline');
ok(/cand\.length > 2\)\) return;/.test(html), 'SYNC_A: one save of 3+ jobs is not a person edit');
ok(/SF\.holdTerminal\(lastRows, value/.test(html), 'SYNC_A disk hook holds completed / lost');
ok(/termHold = f === 'status'/.test(html), "SYNC_A merge: a person's completed / lost wins over a copy without a newer status edit");
ok(html.indexOf('id="gc-patch-statusfix-core"') < html.indexOf('function _gcRecIDBput'), 'core defined before the first writer');

// ── 5. repair card ────────────────────────────────────────────────────────────────────────────────────────────
const fresh = JSON.parse(JSON.stringify(stale())); fresh.push({ id: 'PRJ8v8yl0h', name: 'Mister Car Wash', contract: 247978 });
fresh.find(r => r.id === 'PRJf570wdyf36b').contract = 0;
const calls = [];
const w2 = { _crm: { projects: fresh }, meUser: () => ({ role: 'admin', name: 'Owner' }),
  _gcxPatchJob: async (id, patch, why) => { calls.push({ id, patch, why }); const p = fresh.find(x => x.id === id); Object.assign(p, patch); return true; },
  _gcStatusIntent: () => {} };
const timers = [];
const c2 = vm.createContext(Object.assign(w2, { window: w2, document: { getElementById: () => null, querySelector: () => null }, localStorage: { getItem: () => null, setItem() {} },
  setTimeout: (f) => timers.push(f), setInterval: () => 0, console, JSON, Date, Math, Object, Array, String, Number, Promise }));
vm.runInContext(grab('gc-patch-statusfix'), c2);
let pend = w2._gcStatusFixPending();
const st = pend.filter(x => x.f === 'status');
ok(st.length === 10 && st.every(x => x.tick), 'card: the 10 jobs with 10/29 → now status, all pre-ticked', st.length);
ok(st.find(x => x.id === 'PRJ0sx249j6n8v').note && /Wesley Johnson/.test(st.find(x => x.id === 'PRJ0sx249j6n8v').note), 'card: ROTC Cordova shows who set Active (owner can untick)');
ok(pend.filter(x => x.f !== 'status').every(x => !x.tick) && pend.some(x => x.f === 'contract' && x.id === 'PRJf570wdyf36b'), 'card: the other fields the same saves changed are listed unticked');
const r = await w2._gcStatusFixPutBack(st.filter(x => x.id !== 'PRJ0sx249j6n8v'));
ok(r.ok === 9 && r.fail === 0, 'Put back (ROTC unticked): 9 jobs written', r);
ok(calls.every(c => c.why === 'STATUSFIX put back' && Array.isArray(c.patch.autoLog) && /STATUSFIX/.test(c.patch.autoLog[c.patch.autoLog.length - 1].text)), 'each through _gcxPatchJob with a log line on the job');
ok(fresh.find(x => x.id === 'PRJqwpno4m').status === 'completed' && fresh.find(x => x.id === 'PRJejk50lxun18').status === 'lost' && fresh.find(x => x.id === 'PRJ0sx249j6n8v').status === 'active', 'statuses back; ROTC left Active');
pend = w2._gcStatusFixPending();
ok(pend.filter(x => x.f === 'status').length === 1, 'after: only the unticked ROTC row is still listed');
w2.meUser = () => ({ role: 'pm' });

console.log(`\nSTATUSFIX fn: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
