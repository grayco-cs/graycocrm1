// test_TOMBFIX2.mjs <build-dir> — patch TOMBFIX2 in the offline browser harness (made-up data only).
// The owner's PC on r36c: the cloud delete list already clean (3,000 entries), but this computer still holds the old 21 MB
// list (IndexedDB gc_tombstones_all, written by an older version) and an older script writes the 21 MB list into
// localStorage once. Then a person deletes leads on the Leads view and the money sweep deletes 20 register rows.
// Checked (long tasks from the browser's own PerformanceObserver):
//  1. while deleting / sweeping and the 10 s after: no long task over 500 ms
//  2. the deletes stay deleted (screen, after a reload; the browser copy, IndexedDB, the cloud); no runaway entry comes back
//  3. reported: the longest task during the first load and right after the old script's 21 MB write
// Usage: node test_TOMBFIX2.mjs <dir with index.html>   (run under the scratchpad browser lock)
import path from 'path'; import { pathToFileURL } from 'url';
const build = path.resolve(process.argv[2] || '.');
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
let pass = 0, fail = 0;
const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); } };
const EMAIL = 'wjohnson@grayco-cs.com';
const NOW = Date.now(), DAY = 864e5, iso = t => new Date(t).toISOString(), at = iso(NOW - 5 * DAY);

function djb(s){ let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'gid' + (h >>> 0).toString(36); }
const FP = djb('Zedd Stub|||||||||||||||||'), SFP = djb('s|zedd');
/* 3,000 compact entries (the clean cloud list) */
const CLEAN = {};
['schedule', 'expenses', 'projects', 'estimates', 'invs'].forEach((c, ci) => { for (let i = 0; i < 600; i++) CLEAN[c + ':ZZ' + ci + 'x' + i.toString(36)] = iso(NOW - (i % 30) * DAY); });
['LDEL1', 'LDEL2'].forEach(id => { CLEAN['leads:' + id] = iso(NOW - 2 * DAY); });
/* the old 21 MB list = the clean one + 26.8k runaway payroll-profile ids */
function legacy(){
  const m = Object.assign({}, CLEAN);
  m['payrollProfiles:' + FP] = '2026-11-12T13:40:38.933Z'; m['payrollProfiles:' + FP + '-' + SFP] = m['payrollProfiles:' + FP];
  for (let n = 2; n <= 9016; n++) m['payrollProfiles:' + FP + '-' + SFP + '-' + n] = '2026-11-12T13:40:38.933Z';
  for (let n = 2; n < 57; n++) { let id = FP + '-' + SFP + '-' + n; for (let s = 1; s <= 212; s++) { if (s <= 112) m['payrollProfiles:' + id + '-' + (s % 2 ? SFP : FP) + '-' + (s % 2 ? SFP : FP)] = '2026-11-12T13:40:38.933Z'; id += '-' + (s % 2 ? FP : SFP); m['payrollProfiles:' + id] = '2026-11-12T13:40:38.933Z'; } }
  return m;
}
const L = (id, o) => Object.assign({ id, name: 'Zedd Lead ' + id, stage: 'New Lead', source: 'Referral', createdAt: at, updatedAt: at }, o);
const LEADS = []; for (let i = 1; i <= 30; i++) LEADS.push(L('L' + i)); LEADS.push(L('LDEL1'), L('LDEL2'));
const REG = []; for (let i = 1; i <= 40; i++) REG.push({ id: 'REG' + i, _id: 'REG' + i, date: '2026-11-0' + (1 + i % 9), desc: 'Zedd register row ' + i, amount: -(10 + i), account: 'Checking', updatedAt: at });
H.resetCloud();
H.cset('users', [{ id: 'u-wesley', name: 'Wesley Johnson', email: EMAIL, role: 'Admin', payType: 'owner', active: true }]);
H.cset('leads', LEADS); H.cset('gcAcctRegister', REG);
H.cset('projects', [{ id: 'P1', name: 'Zedd Job', status: 'Active', updatedAt: at }]);
H.cset('gc_tombstones', CLEAN);

/* how long the page was blocked: a 50 ms timer chain started before the page's own scripts (native timers); a gap over
   100 ms is a task that held the page that long */
const LT = `(function(){ window.__lt = []; var st = window.setTimeout, last = performance.now();
  (function tick(){ var n = performance.now(), g = n - last - 50; if (g > 100) window.__lt.push({ d: Math.round(g), t: Math.round(last) }); last = n; st(tick, 50); })(); })();`;
const lt = (A, from) => A.ev(f => (window.__lt || []).filter(e => e.t >= f), from || 0);
const now = A => A.ev(() => Math.round(performance.now()));
const maxOf = l => l.reduce((m, e) => Math.max(m, e.d), 0);
const leadIds = A => A.ev(() => ((window._crm && window._crm.leads) || []).map(l => l && l.id));
async function ready(A){ return H.waitFor(A, () => (window._crm && (window._crm.leads || []).length >= 20 && typeof window._gcTombstone === 'function') || null, null, 90000); }

const A = await H.computer('A', { build, init: LT });
try {
  /* the old copies an earlier version left on this computer: IndexedDB, written on a page of this origin with no CRM scripts */
  const page = A.page();
  await page.goto('http://app.local/__no_such_page__', { waitUntil: 'domcontentloaded' });
  const seeded = await page.evaluate(big => new Promise(res => {
    const q = indexedDB.open('grayco_crm', 3);
    q.onupgradeneeded = () => { const db = q.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
    q.onsuccess = () => { const db = q.result; const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(big, 'gc_tombstones_all'); tx.oncomplete = () => { db.close(); res(Object.keys(big).length); }; tx.onerror = () => res('err ' + tx.error); };
    q.onerror = () => res('open err');
  }), legacy());
  console.log('    legacy IndexedDB gc_tombstones_all seeded: ' + seeded + ' entries');
  await A.goto();
  await H.signIn(A, EMAIL, 20000); await ready(A); await H.sleep(25000);
  const load = await lt(A, 0);
  console.log('    first load: longest task ' + maxOf(load) + ' ms (' + load.length + ' long tasks; > 500 ms: ' + load.filter(e => e.d > 500).length + ')');
  /* an older script writes the 21 MB list into localStorage once (what the old cloud pulls did) */
  const t0 = await now(A);
  await A.ev(big => { window.__big = big; }, legacy());
  await A.ev(() => new Promise(r => setTimeout(() => { try { localStorage.setItem('gc_tombstones', JSON.stringify(window.__big)); } catch (e) {}
    try { window.idbSet('gc_tombstones_all', window.__big); } catch (e) {} window.__big = null; r(); }, 0)));
  await H.sleep(8000);
  const inj = await lt(A, t0);
  console.log('    an older script writes the 21 MB list (localStorage + IndexedDB) and the 8 s after it: longest task ' + maxOf(inj) + ' ms (' + inj.length + ' long tasks)');
  /* the person deletes leads; the money sweep deletes 20 register rows */
  const t1 = await now(A);
  const DEL = ['L3', 'L7', 'L11', 'L15', 'L19'];
  for (const id of DEL) {   /* each delete as its own task, the way a click is */
    await A.ev(id => new Promise(r => setTimeout(() => { window.__GC_MANUAL_SAVE__ = true; if (window._gcTombstone) window._gcTombstone('leads', id); if (window._setLeads) window._setLeads(l => (l || []).filter(x => x && x.id !== id)); r(); }, 0)), id);
    await H.sleep(300);
  }
  await A.ev(rows => new Promise(r => setTimeout(() => { Promise.resolve(window._gcRegDeleteRows ? window._gcRegDeleteRows(rows) : null).then(r, r); }, 0)), REG.slice(0, 20));
  await H.sleep(10000);
  const del = await lt(A, t1);
  console.log('    deleting 5 leads + sweeping 20 register rows, and the 10 s after: longest task ' + maxOf(del) + ' ms (' + del.length + ' long tasks: ' + JSON.stringify(del.map(e => e.d)).slice(0, 200) + ')');
  ok(maxOf(del) <= 500, '1. deleting on Leads + the sweep: no long task over 500 ms (longest ' + maxOf(del) + ' ms)', del);
  ok(inj.filter(e => e.d > 500).length <= 1, '1. the older script\'s 21 MB write costs one stall (that write itself), not a loop (' + inj.filter(e => e.d > 500).length + ' over 500 ms, longest ' + maxOf(inj) + ' ms)', inj);
  /* 2. the deletes stay deleted */
  const ids = await leadIds(A);
  ok(DEL.every(id => !ids.includes(id)) && !ids.includes('LDEL1') && !ids.includes('LDEL2') && ids.includes('L1'), '2. the deleted leads (and the two deleted earlier) are off the list; the others are there', ids.length);
  const st = await A.ev(() => { const m = JSON.parse(localStorage.getItem('gc_tombstones') || '{}'); return { n: Object.keys(m).length, len: (localStorage.getItem('gc_tombstones') || '').length, run: Object.keys(m).filter(k => /^payrollProfiles:gid/.test(k)).length,
    leads: ['L3', 'L7', 'L11', 'L15', 'L19'].every(id => m['leads:' + id]), reg: Object.keys(m).filter(k => /^gcAcctRegister:REG/.test(k)).length }; });
  ok(st.run === 0 && st.leads && st.reg >= 20 && st.len < 400000, '2. the browser copy: the 5 lead deletes + 20 register deletes, no runaway entry, ' + st.len + ' characters', st);
  const idb = await A.ev(() => window.idbGet('gc_tombstones_all').then(v => v ? { n: Object.keys(v).length, run: Object.keys(v).filter(k => /^payrollProfiles:gid/.test(k)).length, leads: !!v['leads:L3'] } : null));
  ok(idb && idb.run === 0 && idb.leads, '2. IndexedDB: the deletes, no runaway entry', idb);
  await H.sleep(4000);
  const ct = H.cget('gc_tombstones') || {};
  ok(DEL.every(id => ct['leads:' + id]) && !Object.keys(ct).some(k => /^payrollProfiles:gid/.test(k)) && Object.keys(ct).length < 4000, '2. the cloud: the deletes, no runaway entry (' + Object.keys(ct).length + ' entries)', Object.keys(ct).length);
  const mem = await A.ev(() => { const r = {}; try { r.fixinv = window._gcxTombstones ? window._gcxTombstones().marked : null; } catch (e) {} try { r.uni = Object.keys(window._gcTombstones()).length; r.uniRun = Object.keys(window._gcTombstones()).filter(k => /^payrollProfiles:gid/.test(k)).length; } catch (e) {} return r; });
  ok(mem.fixinv !== null && mem.fixinv < 4000 && mem.uniRun === 0, '2. in memory: the delete lists hold no runaway entry (' + JSON.stringify(mem) + ')', mem);
  const cl = (H.cget('leads') || []).map(x => x && x.id);
  await A.page().reload({ waitUntil: 'domcontentloaded' }); await ready(A); await H.sleep(10000);
  const ids2 = await leadIds(A);
  ok(DEL.every(id => !ids2.includes(id)) && !ids2.includes('LDEL1') && ids2.includes('L1'), '2. after a reload the deleted leads stay deleted', { cloudStillHas: DEL.filter(id => cl.includes(id)) });
  const after = await lt(A, 0);
  console.log('    reload: longest task ' + maxOf(after) + ' ms');
  const errs = A.errs.filter(e => !/ResizeObserver|Script error/.test(e));
  ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
} catch (e) { fail++; console.log('FAIL exception ' + (e && e.stack || e)); }
finally { try { await A.close(); } catch (e) {} }
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
