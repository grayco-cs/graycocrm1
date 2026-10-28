// test_SCHEDFILL.mjs <build-dir> — patch SCHEDFILL: an idle CRM no longer re-saves the schedule every 30 s; a schedule
// item missing its job address still gets it filled (and saved). Offline harness, made-up data, desk, admin.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, cset, signIn } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_SCHEDFILL.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
resetCloud();
const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [{ id: 'P1', name: 'Demo Kitchen Remodel', client: 'Sample Homeowner', address: '100 Demo St, Bartlett TN', pm: 'Demo Owner', status: 'Active' },
  { id: 'P2', name: 'Demo Roof', client: 'Test Family', address: '22 Sample Ave, Cordova TN', pm: 'Demo Owner', status: 'Active' }]);
cset('schedule', [{ id: 'S1', pid: 'P1', projectId: 'P1', title: 'Cabinet install', date: d(1), address: '100 Demo St, Bartlett TN' },
  { id: 'S2', pid: 'P2', projectId: 'P2', title: 'Tear-off', date: d(2), address: '22 Sample Ave, Cordova TN' }]);
const c = await computer('SF', { build });
const schedPosts = since => c.log.filter(x => x.t > since && x.method === 'POST' && (/app_data/.test(x.path) ? /"key":"schedule"/.test(x.body) : x.key1 === 'schedule')).length;
try {
  await signIn(c, 'wjohnson@grayco-cs.com', 15000);
  const p = c.page(); await sleep(15000);
  const t0 = Date.now(); await sleep(95000);
  const n = schedPosts(t0);
  ok(n === 0, 'idle 95 s with every schedule item complete: the schedule was saved ' + n + ' times (was 3–4: every 30 s)');
  /* an item without its address: filled on the next check, and saved */
  await p.evaluate(dt => window._setSchedule(prev => prev.concat([{ id: 'S3', pid: 'P2', projectId: 'P2', title: 'Shingles', date: dt, updatedAt: new Date().toISOString() }])), d(3));
  await sleep(500);
  await p.evaluate(() => window._gcFillScheduleAddresses());
  const got = await waitFor(c, () => { let L = null; window._setSchedule(pr => { L = pr; return pr; }); const r = (L || []).find(x => x && x.id === 'S3'); return r && r.address ? r.address : null; }, null, 10000, 250);
  ok(got === '22 Sample Ave, Cordova TN', 'a schedule item missing its address gets the job address', got);
  let inCloud = false; for (let i = 0; i < 40 && !inCloud; i++) { await sleep(500); const v = c.log.filter(x => x.method === 'POST' && x.key1 === 'schedule' && /"S3"/.test(x.body) && /22 Sample Ave/.test(x.body)); inCloud = v.length > 0; }
  ok(inCloud, '…and that is saved to the cloud');
  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await c.b.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
