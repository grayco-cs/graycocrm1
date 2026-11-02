// test_SYNCALL.mjs <build-dir> — patch SYNCALL: every synced list reaches the screen after the first sign-in.
//   E. Five first sign-ins: the cloud's invoices, expenses, leads, jobs, schedule and customers all reach the screen
//      (a record deleted in the cloud stays out).
//   B. A dropped hand-over for each of the six lists (the cloud's copy noted, never applied): the screen gets the cloud's
//      records, keeps a record only it has (never shorter), a deleted record stays out; the cloud is not shortened.
//   C. Nothing is put on the screen while a job is open (projects) — it lands once the job is closed.
// Offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs), made-up data. BOOTS (default 5).
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, cset, cget, signIn } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_SYNCALL.mjs <dir with index.html>'); process.exit(2); }
const BOOTS = +(process.env.BOOTS || 5);
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };

const old = '2026-09-01T15:00:00.000Z';
const KEYS = ['invs', 'expenses', 'leads', 'projects', 'schedule', 'customers'];
function rec(k, id, i){
  const b = { id, savedAt: old, updatedAt: old };
  if (k === 'invs') return Object.assign(b, { pid: 'P1', num: 'INV-' + id, client: 'Hannah Brooks', amount: 1000 + i, total: 1000 + i, status: 'Sent', date: '2026-09-01' });
  if (k === 'expenses') return Object.assign(b, { pid: 'P1', vendor: 'Demo Supply ' + i, amt: 50 + i, date: '2026-09-02', cat: 'Materials' });
  if (k === 'leads') return Object.assign(b, { name: 'Lead Person ' + id, phone: '901-555-02' + String(10 + i), status: 'New', type: 'residential', created: '2026-09-03' });
  if (k === 'projects') return Object.assign(b, { po: 'PO-' + id, name: 'Job ' + id, client: 'Hannah Brooks', customerId: 'CU1', address: (100 + i) + ' Oak St, Bartlett TN', status: 'Active', type: 'Residential Reno', created: '2026-09-01' });
  if (k === 'schedule') return Object.assign(b, { pid: 'P1', title: 'Crew day ' + id, date: '2026-11-' + String(10 + i).padStart(2, '0'), start: '2026-11-' + String(10 + i).padStart(2, '0'), crew: 'Crew ' + i });
  return Object.assign(b, { name: 'Customer ' + id, phone: '901-555-01' + String(10 + i) });
}
const IDS = { invs: ['I1', 'I2', 'I3'], expenses: ['X1', 'X2', 'X3'], leads: ['L1', 'L2', 'L3'], projects: ['P1', 'P2'], schedule: ['S1', 'S2', 'S3'], customers: ['CU1', 'CU2', 'CU3'] };
function seed(){
  resetCloud();
  cset('users', [{ id: 'u1', name: 'Wes Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
  KEYS.forEach(k => cset(k, IDS[k].map((id, i) => rec(k, id, i))));
  /* in the cloud list but deleted (the cloud's delete list says so): it may not show */
  cset('expenses', cget('expenses').concat([rec('expenses', 'XDEAD', 9)]));
  cset('gc_tombstones', { 'expenses:XDEAD': '2026-10-01T00:00:00.000Z' });
}
async function boot(name){
  const c = await computer(name, { build }); const p = c.page();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  let navs = 0; p.on('framenavigated', f => { if (f === p.mainFrame()) navs++; });
  await signIn(c, 'wjohnson@grayco-cs.com', 9000);
  for (let last = -1, t0 = Date.now(); last !== navs && Date.now() - t0 < 90000; ) { last = navs; await sleep(8000); }   /* the sign-in reloads: wait until settled */
  await waitFor(c, () => window.__GC_RAW_SETTERS__ && (window._crm && window._crm.projects || []).length >= 1, null, 60000);
  return { c, errs };
}
/* what is on the screen: each list read through the CRM's own setter (the React state itself) */
const read = c => c.ev(() => new Promise(res => {
  const R = window.__GC_RAW_SETTERS__ || {}, out = {};
  const S = { invs: R._setInvoices, expenses: R._setExpenses, leads: R._setLeads, projects: R._setProjects, schedule: R._setSchedule, customers: window.__gcSetCustomersNow || window._setCustomers };
  const ks = Object.keys(S); let n = 0; const done = () => { if (++n === ks.length) res(out); };
  ks.forEach(k => { const f = S[k]; if (typeof f !== 'function') { out[k] = null; return done(); } try { f(prev => { if (!(k in out)) { out[k] = (Array.isArray(prev) ? prev : []).map(x => x && x.id).filter(Boolean).sort(); done(); } return prev; }); } catch (e) { out[k] = 'ERR ' + e.message; done(); } });
  setTimeout(() => res(out), 4000);
}));
const want = k => IDS[k].slice().sort();
const same = (a, b) => Array.isArray(a) && a.join(',') === b.join(',');

/* ── E. first sign-ins ── */
console.log('E. ' + BOOTS + ' first sign-ins — every list reaches the screen');
const tally = {}; KEYS.forEach(k => { tally[k] = 0; });
for (let b = 0; b < BOOTS; b++) {
  seed();
  const { c, errs } = await boot('SAE' + b);
  try {
    await sleep(6000);
    const scr = await read(c);
    const healed = await c.ev(() => window.__gcSyncAll ? window.__gcSyncAll.stats().healed : null);
    KEYS.forEach(k => { const good = same(scr[k], want(k)); if (good) tally[k]++; ok(good, 'E' + (b + 1) + '. ' + k + ': the screen has the cloud’s ' + IDS[k].length, { screen: scr[k], healed }); });
    ok(!(scr.expenses || []).includes('XDEAD'), 'E' + (b + 1) + '. the deleted expense stays out', scr.expenses);
    ok(!errs.length, 'E' + (b + 1) + '. no page errors', errs.slice(0, 3));
  } finally { await c.b.close(); }
}
console.log('  first sign-ins with the whole list on the screen: ' + KEYS.map(k => k + ' ' + tally[k] + '/' + BOOTS).join(', '));

/* ── B. a dropped hand-over, list by list ── */
console.log('B. the cloud’s copy noted but never handed over — each list');
seed();
{
  const { c, errs } = await boot('SAB');
  try {
    await sleep(4000);
    const hasApi = await c.ev(() => typeof window.__gcListSetterOf === 'function' && !!window.__gcSyncAll);
    ok(hasApi, 'the list setters are published (window.__gcListSetterOf) and SYNCALL is on');
    for (const k of KEYS) {
      const base = (cget(k) || []).filter(r => r.id !== 'XDEAD');
      const extra = ['N1', 'N2', 'N3', 'NDEAD'].map((s, i) => rec(k, k.slice(0, 2).toUpperCase() + s, 20 + i));
      const deadId = extra[3].id, localId = k.slice(0, 2).toUpperCase() + 'LOCAL';
      /* a record only this screen has (made here, not in the cloud's copy) */
      await c.ev(([k, r]) => { const f = window.__gcListSetterOf(k); f(prev => (prev || []).concat([r])); }, [k, rec(k, localId, 30)]);
      await c.ev(([k, id]) => { const t = JSON.parse(localStorage.getItem('gc_tombstones') || '{}'); t[k + ':' + id] = new Date().toISOString(); localStorage.setItem('gc_tombstones', JSON.stringify(t)); }, [k, deadId]);
      const before = (await read(c))[k];
      await c.ev(([k, l]) => window._gcCloudSeen(k, l), [k, base.concat(extra)]);   /* noted, never handed over */
      const got = await waitFor(c, ([k, ids]) => new Promise(res => { const f = window.__gcListSetterOf(k); let d = false; f(prev => { if (!d) { d = true; const h = new Set((prev || []).map(x => x && x.id)); res(ids.every(i => h.has(i)) ? [...h] : null); } return prev; }); setTimeout(() => { if (!d) res(null); }, 1500); }), [k, extra.slice(0, 3).map(r => r.id)], 20000, 500);
      const after = (await read(c))[k];
      ok(!!got, 'B. ' + k + ': the cloud’s new records reach the screen', after);
      ok(Array.isArray(after) && before.every(id => after.includes(id)) && after.length >= before.length, 'B. ' + k + ': nothing the screen had is lost (' + before.length + ' → ' + (after || []).length + ', the screen-only record stays)', { before, after });
      ok(Array.isArray(after) && !after.includes(deadId), 'B. ' + k + ': the deleted record stays out', after);
    }
    await sleep(9000);
    const cloudOk = KEYS.every(k => IDS[k].every(id => (cget(k) || []).some(r => r.id === id)));
    ok(cloudOk, 'B. the cloud’s lists still hold every record they had (nothing shortened)');
    ok(!errs.length, 'B. no page errors', errs.slice(0, 3));

    /* ── C. a job is open: the jobs list waits ── */
    console.log('C. a job is open — the jobs list waits for it to close');
    await c.ev(() => { window.__syncallSavedOpen = window._gcOpenProject; window._gcOpenProject = { id: 'P1' }; });
    await c.ev(l => window._gcCloudSeen('projects', l), (cget('projects') || []).concat([rec('projects', 'PWAIT', 40)]));
    await sleep(6000);
    const mid = (await read(c)).projects;
    ok(!mid.includes('PWAIT'), 'C. while the job is open, the jobs list is left alone', mid);
    await c.ev(() => { window._gcOpenProject = window.__syncallSavedOpen || null; });
    const landed = await waitFor(c, () => new Promise(res => { const f = window.__gcListSetterOf('projects'); let d = false; f(prev => { if (!d) { d = true; res((prev || []).some(x => x && x.id === 'PWAIT')); } return prev; }); setTimeout(() => { if (!d) res(false); }, 1500); }), null, 20000, 1000);
    ok(!!landed, 'C. once the job is closed, the cloud’s new job reaches the screen');
  } finally { await c.b.close(); }
}
console.log('\nSYNCALL ' + pass + '/' + (pass + fail) + (fail ? ' — ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
