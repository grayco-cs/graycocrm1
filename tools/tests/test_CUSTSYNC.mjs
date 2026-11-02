// test_CUSTSYNC.mjs <build-dir> — patch CUSTSYNC: the Customers list after the first sign-in, and CUSTALL's safety.
//   A. The screen's customer list far behind the cloud's (a dropped hand-over): the two are put together, nothing lost.
//   E. Four more first sign-ins: the cloud's customers always reach the screen (the race; the base build loses ~half).
//   B. CUSTALL with the cloud's list not confirmed this session: a new job → zero writes to the list, nothing in the
//      cloud changes, the backfill waits; once the cloud's list is in, the queued job's customer is added.
//   C. CUSTALL with a near-empty list next to the cloud's (under half): zero writes.
//   D. A computer whose customer list is EMPTY and whose cloud customers never arrive (the race): a new job →
//      zero writes, the cloud's customers untouched.
// Offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs), made-up data.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, cset, cget, signIn } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_CUSTSYNC.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };

const old = '2026-09-01T15:00:00.000Z';
function seed(){
  resetCloud();
  cset('users', [{ id: 'u1', name: 'Wes Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
  cset('customers', [
    { id: 'CU1', name: 'Hannah Brooks', phone: '901-555-0111', email: 'hannah@example.com', address: '100 Oak St, Bartlett TN', savedAt: old, updatedAt: old },
    { id: 'CU2', name: 'Marcus Lee', phone: '901-555-0122', savedAt: old, updatedAt: old },
    { id: 'CU3', name: 'Dana Fox', phone: '901-555-0177', address: '9 Elm St, Memphis TN', savedAt: old, updatedAt: old }]);
  cset('projects', [{ id: 'P1', po: 'PO-1', name: 'Brooks Kitchen', client: 'Hannah Brooks', customerId: 'CU1', address: '100 Oak St, Bartlett TN', status: 'Active', type: 'Residential Reno', created: '2026-09-01', savedAt: old, updatedAt: old }]);
}
const cloudIds = () => (cget('customers') || []).map(x => x.id).sort().join(',');
async function boot(name, init){
  const c = await computer(name, { build }); const p = c.page();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  let navs = 0; p.on('framenavigated', f => { if (f === p.mainFrame()) navs++; });
  if (init) await c.ctx.addInitScript(init);
  await signIn(c, 'wjohnson@grayco-cs.com', 9000);
  for (let last = -1, t0 = Date.now(); last !== navs && Date.now() - t0 < 90000; ) { last = navs; await sleep(8000); }   /* the sign-in reloads: wait until settled */
  await waitFor(c, () => window._gcCustAllSaw && (window._crm && window._crm.projects || []).length >= 1, null, 60000); await sleep(2500);
  return { c, errs };
}
const custs = c => c.ev(() => new Promise(r => { const set = window.__gcSetCustomersNow || window._setCustomers; set(prev => { r(JSON.parse(JSON.stringify(prev || []))); return prev; }); }));
const addJob = (c, j) => c.ev(j => window._setProjects(prev => (prev || []).concat([Object.assign({ status: 'Active', type: 'Residential Reno', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, j)])), j);

/* ── A / B / C ── */
seed();
const ids0 = cloudIds();
let { c, errs } = await boot('CS1');
try {
  const cs = await custs(c);
  ok(cs.length === 3, 'the CRM loads the cloud’s 3 customers', cs.length);
  const seen = await c.ev(() => window.__gcCloudSeen && window.__gcCloudSeen.customers);
  ok(seen && seen.n === 3 && seen.ids.length === 3, 'the cloud’s customers are noted as come in this session (n = 3)', seen);

  /* A. the screen's list far behind the cloud's (the dropped hand-over): the two are put together, nothing pushed */
  const ten = Array.from({ length: 10 }, (_, i) => ({ id: 'CX' + i, name: 'Cloud Person ' + i, phone: '901-555-07' + String(10 + i), savedAt: old, updatedAt: old }));
  await c.ev(l => { window.__csSeen0 = window.__gcCloudSeen.customers; window._gcCloudSeen('customers', l); }, (cget('customers') || []).concat(ten)); await sleep(1500);
  const csA = await custs(c);
  ok(csA.length === 13 && csA.some(x => x.id === 'CX9') && csA.some(x => x.id === 'CU1'), 'A. a screen list missing most of the cloud’s customers gets them (3 → 13, nothing lost)', csA.length);
  await c.ev(() => { window.__gcCloudSeen.customers = window.__csSeen0; });

  /* B. not confirmed */
  await sleep(8000); const idsB = cloudIds();   /* A's list has reached the cloud by now */
  await c.ev(() => { window.__csSeen = window.__gcCloudSeen.customers; delete window.__gcCloudSeen.customers; });
  const w0 = await c.ev(() => window._gcCustAllState());
  await addJob(c, { id: 'PB', name: 'B Job', client: 'Betty Waits', clientPhone: '901-555-0301', address: '1 Wait St' }); await sleep(1800);
  const w1 = await c.ev(() => window._gcCustAllState());
  ok(w1.writes === w0.writes && (await custs(c)).length === 13 && cloudIds() === idsB, 'B. cloud list not confirmed: a new job writes nothing (list and cloud unchanged)', { w0, w1 });
  ok(await c.ev(() => window._gcCustAllCount()) === '…' && (await c.ev(() => window._gcCustAllOpen())) === null && !(await c.ev(() => !!document.getElementById('gc-custall'))), 'B. the backfill waits (no count, no dry run)');
  ok((await c.ev(() => window._gcCustAllApply({ customers: [{ id: 'X1', name: 'Should Not' }], links: [], rows: [] }))).waiting === true && cloudIds() === idsB, 'B. a backfill run is refused too');
  await c.ev(() => { window.__gcCloudSeen.customers = window.__csSeen; window._gcCustAllKick(); }); await sleep(1800);
  const after = await custs(c);
  ok(after.length === 14 && after.some(x => x.name === 'Betty Waits'), 'B. once the cloud’s list is in, the waiting job’s customer is added', after.map(x => x.name));

  /* C. near-empty next to the cloud */
  await c.ev(() => { window.__gcCloudSeen.customers = { at: Date.now(), n: 100 }; });
  const w2 = await c.ev(() => window._gcCustAllState()), cl2 = cloudIds();
  await addJob(c, { id: 'PC', name: 'C Job', client: 'Carl Nearempty', clientPhone: '901-555-0302', address: '2 Wait St' }); await sleep(1800);
  const w3 = await c.ev(() => window._gcCustAllState());
  ok(w3.writes === w2.writes && (await custs(c)).length === 14 && cloudIds() === cl2, 'C. a list under half the cloud’s: zero writes, cloud unchanged', { w2, w3 });
  ok(!errs.length, 'no page errors', errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw ' + (e && e.stack || e)); }
await c.b.close();

/* ── E. the race, 4 more first sign-ins: the cloud's customers always reach the screen ── */
for (let k = 0; k < 4; k++) {
  seed();
  const b = await boot('CSE' + k);
  const n = (await custs(b.c)).length;
  ok(n === 3, 'E' + (k + 1) + '. a first sign-in shows the cloud’s 3 customers', n);
  await b.c.b.close();
}

/* ── D. empty here, and the cloud's customers never arrive ── */
seed();
({ c, errs } = await boot('CS2', () => {
  const of = window.fetch;
  window.fetch = function(u, o){
    return of.apply(this, arguments).then(function(r){
      try {
        const url = String(u && u.url || u), m = String((o && o.method) || (u && u.method) || 'GET').toUpperCase();
        if (!/\/rest\/v1\/gc_kv/.test(url) || m !== 'GET') return r;
        return r.clone().text().then(function(tx){ let j; try { j = JSON.parse(tx); } catch (e) { return r; } if (!Array.isArray(j)) return r;
          const f = j.filter(x => !(x && /^customers(__|$)/.test(String(x.key || '')))); return new Response(JSON.stringify(f), { status: r.status, statusText: r.statusText, headers: r.headers }); });
      } catch (e) { return r; }
    });
  };
}));
try {
  const cs = await custs(c), st = await c.ev(() => window._gcCustAllState());
  ok(cs.length === 0 && st.cloud === -1, 'D. local list empty, the cloud’s customers not come in', { n: cs.length, st });
  await addJob(c, { id: 'PD', name: 'D Job', client: 'Dora Empty', clientPhone: '901-555-0303', address: '3 Wait St' }); await sleep(2500);
  const st2 = await c.ev(() => window._gcCustAllState());
  ok(st2.writes === st.writes && (await custs(c)).length === 0, 'D. a new job writes nothing to the list', { st, st2 });
  ok(cloudIds() === ids0, 'D. the cloud’s 3 customers are untouched', cloudIds());
  ok((await c.ev(() => window._gcCustAllCount())) === '…', 'D. the backfill waits');
} catch (e) { fail++; console.log('  ✗ FAIL threw ' + (e && e.stack || e)); }
await c.b.close();
console.log(`CUSTSYNC ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
