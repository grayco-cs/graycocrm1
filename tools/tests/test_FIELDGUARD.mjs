// test_FIELDGUARD.mjs <build-dir> — patch FIELDGUARD: a GrayCo Field phone never rewrites the company's lists by itself.
// 11/18: a PM's iPhone, opened for the first time in 16 days, uploaded ~40 shared lists with no tap (380 of 480 jobs
// restamped "now"), wrote gc_kept_log ~100 times in 2 minutes, and kept office-sized local copies in a full localStorage.
//   A. node: the block is in index.html, before the sign-in layer captures fetch; the kept-log write is paced.
//   B. PM on an iPhone (made-up data, localStorage pre-filled near full with office-sized copies):
//      · 40 s after opening with no input: no shared list (projects, invs, leads, vendors, subs, gcAcctRegister …) went to
//        the cloud; the phone's own rows (perfrep / bootrep / adm_dev / activity / timeclock) may;
//      · gc_snap_* / gc_safenet_* / gc_projects_backup are removed from localStorage and not written again; gc_kept_log is
//        written at most once every 5 s;
//      · a person's change (a tap, then a job edited) reaches the cloud; jobs that differ only in updatedAt are sent as the
//        cloud has them (no mass restamp);
//      · no page errors.
//   C. admin (desk): unchanged — a restamp-only change of every job is uploaded as before (the gate is for Field phones).
// Usage: node test_FIELDGUARD.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDGUARD.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };

console.log('A. node');
const t = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const iG = t.indexOf('<script id="gc-patch-fieldguard">'), iA = t.indexOf('var nativeFetch = window.fetch.bind(window);');
ok(iG > 0 && iA > iG, 'the FIELDGUARD block is in index.html, before the sign-in layer takes its copy of fetch', { iG, iA });
ok(/keptPend\.push\(rec\)/.test(t) && /function flushKept\(\)/.test(t), 'gc_kept_log: repairs are collected and written at most once every 5 s');

const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const PM = byId('u-pm'), ADMIN = byId('u-wesley');
const OWN = /^(gc_perfrep_|gc_bootrep_|gc_adm_dev_|gc_activity_|gc_timeclock_|_probe_)/;
const SHARED = ['projects', 'invs', 'leads', 'vendors', 'subs', 'gcAcctRegister', 'customers', 'schedule', 'estimates', 'expenses', 'gc_office_tasks', 'commissionQueue', 'projectDocs'];
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
function seed(){
  H.resetCloud();
  const projects = [], invs = [], leads = [], vendors = [], subs = [], reg = [], tasks = [];
  for (let i = 0; i < 160; i++) projects.push({ id: 'P' + i, po: 'PO-' + (7000 + i), name: 'Demo Job ' + i, client: 'Sample Customer ' + i, address: (100 + i) + ' Demo St', pm: i < 20 ? 'Demo PM' : 'Other PM', status: i % 5 ? 'Active' : 'Complete', contract: 1000 * (i + 1), updatedAt: ago(20 + (i % 9)) });
  for (let i = 0; i < 120; i++) invs.push({ id: 'I' + i, pid: 'P' + (i % 160), num: 'INV-' + i, amt: 500 + i, status: 'sent', type: 'client', date: ago(30).slice(0, 10), updatedAt: ago(25) });
  for (let i = 0; i < 80; i++) leads.push({ id: 'L' + i, name: 'Lead ' + i, client: 'Lead Person ' + i, stage: 'New Lead', createdAt: ago(10), updatedAt: ago(10) });
  for (let i = 0; i < 40; i++) vendors.push({ id: 'V' + i, name: 'Sample Vendor ' + i, isSub: i % 2 === 0, insExp: '2020-01-01', wcExp: '2020-01-01', w9: true, updatedAt: ago(40) });
  for (let i = 0; i < 40; i++) subs.push({ id: 'S' + i, name: 'Sample Sub ' + i, trade: 'Drywall', isSub: true, insExp: '2020-01-01', wcExp: '2020-01-01', w9: true, updatedAt: ago(40) });
  for (let i = 0; i < 200; i++) reg.push({ id: 'R' + i, _id: 'R' + i, date: ago(60).slice(0, 10), amount: 100 + i, type: 'expense', desc: 'Made-up line ' + i, pid: 'P' + (i % 160), updatedAt: ago(50) });
  for (let i = 0; i < 400; i++) tasks.push({ id: 'T' + i, label: 'Made-up to-do ' + i, done: i % 3 === 0, assignee: 'Other PM', addedAt: ago(9), updatedAt: ago(9) });
  H.cset('projects', projects); H.cset('invs', invs); H.cset('leads', leads); H.cset('vendors', vendors); H.cset('subs', subs); H.cset('gcAcctRegister', reg);
  H.cset('gc_office_tasks', tasks); H.cset('customers', []); H.cset('schedule', []); H.cset('estimates', []); H.cset('expenses', []); H.cset('punch', []); H.cset('projectDocs', []);
  H.cset('users', [
    { id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', payType: 'salary_commission', active: true },
    { id: 'u3', name: 'Other PM', role: 'Project Manager', active: true }]);
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';
const FILLER = JSON.stringify(Array.from({ length: 1500 }, (_, i) => ({ id: 'X' + i, note: 'made-up cached copy '.repeat(6) })));
const INIT = `(() => {
  const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  d(Navigator.prototype, 'userAgent', ${JSON.stringify(IPHONE)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5);
  const P = window.__fgt = { lsw: {} };
  if (!localStorage.getItem('__filled')) {
    const F = ${JSON.stringify(FILLER)};
    ['gc_snap_invs', 'gc_safenet_invoices', 'gc_snap_projects', 'gc_safenet_projects', 'gc_projects_backup', 'gc_safenet_vendors'].forEach(k => { try { localStorage.setItem(k, F); } catch (e) {} });
    const chunk = 'y'.repeat(100000); for (let n = 0; n < 45; n++) { try { localStorage.setItem('__fill' + n, chunk); } catch (e) { try { localStorage.removeItem('__fill' + (n - 1)); } catch (x) {} break; } }
    localStorage.setItem('__filled', '1');
  }
  const S = Storage.prototype, os = S.setItem;
  S.setItem = function (k, v) { const r = P.lsw[k] || (P.lsw[k] = 0); P.lsw[k] = r + 1; return os.apply(this, arguments); };
})()`;
const sharedWrites = since => H.writes.filter(w => w.table === 'gc_kv' && w.at >= since && !OWN.test(w.key));

const OPEN = [];
try {
  seed();
  console.log('B. PM on an iPhone, storage nearly full');
  const pm = await H.computer('PM', { build, mobile: true, init: INIT }); OPEN.push(pm);
  const t0 = Date.now();
  ok(await H.signIn(pm, PM, 20000), 'PM signs in');
  await H.waitFor(pm, () => !!document.querySelector('#_gcJobPick'), null, 45000);
  await sleep(process.env.FG_QUICK ? 5000 : 40000);
  const st = await pm.ev(() => window.__gcFG && window.__gcFG.state());
  console.log('    state: ' + JSON.stringify(st));
  ok(st && st.guarded === true, 'the PM\'s phone is guarded', st);
  const sw = sharedWrites(t0);
  ok(!sw.length, 'no shared list went to the cloud in 40 s with no input', sw.map(w => w.key));
  ok(SHARED.every(k => !H.writes.some(w => w.key === k && w.at >= t0)), 'projects / invs / leads / vendors / subs / register / to-dos … all stayed as the office has them');
  const ls = await pm.ev(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^(gc_snap_|gc_safenet_|gc_projects_backup)/.test(k) && k !== 'gc_safenet_meta') o[k] = localStorage.getItem(k).length; } return { left: o, kept: (window.__fgt.lsw.gc_kept_log || 0), secs: performance.now() / 1000 }; });
  ok(!Object.keys(ls.left).length, 'the office-sized local copies are gone from the phone\'s localStorage', ls.left);
  ok(ls.kept <= Math.ceil(ls.secs / 5) + 2, 'gc_kept_log written at most once every 5 s (' + ls.kept + ' in ' + Math.round(ls.secs) + ' s)', ls);
  ok(!!(await pm.ev(() => !!document.querySelector('#_gcJobPick'))), 'GrayCo Field home is still on screen');

  // a person's change goes up; stamp-only records are sent as the cloud has them
  const before = H.cget('projects');
  await pm.page().touchscreen.tap(195, 120); await sleep(300);
  await pm.ev(async () => {
    const L = await window.idbGet('projects'); const now = new Date().toISOString();
    L.forEach(p => { p.updatedAt = now; });                      // a sweep restamps every job …
    const j = L.find(p => p.id === 'P3'); j.notes = 'Changed on the phone by the PM'; // … and the PM edits one
    await window.idbSet('projects', L);
    window._gcSyncDirty(['projects']);
  });
  let up = null; for (let i = 0; i < 60 && !up; i++) { await sleep(500); const c = H.cget('projects') || []; const p3 = c.find(p => p.id === 'P3'); if (p3 && p3.notes === 'Changed on the phone by the PM') up = c; }
  ok(!!up, 'the PM\'s change (a tap, then a job edited) reached the cloud');
  if (up) {
    const bm = new Map(before.map(p => [p.id, p]));
    const STAMPF = ['updatedAt', 'savedAt', 'modifiedAt', '_autoAssignChecked'];
    const bareJ = r => JSON.stringify(Object.keys(r).sort().filter(f => !STAMPF.includes(f)).map(f => [f, r[f]]));
    /* a job whose only difference from the office's copy is its stamp = a restamp (a job the CRM itself filled in is a real change) */
    const restamped = up.filter(p => p.id !== 'P3' && bm.get(p.id) && bm.get(p.id).updatedAt !== p.updatedAt && bareJ(bm.get(p.id)) === bareJ(p)).length;
    const ex = up.find(p => p.id === 'P10'), exb = bm.get('P10'); const dif = ex && exb ? [...new Set([...Object.keys(ex), ...Object.keys(exb)])].filter(f => JSON.stringify(ex[f]) !== JSON.stringify(exb[f])).map(f => f + ':' + JSON.stringify(exb[f]) + '=>' + JSON.stringify(ex[f])) : null;
    ok(restamped === 0, 'the other 159 jobs kept the office\'s updatedAt (no mass restamp)', { restamped, dif });
    ok(up.length === before.length, 'no job lost or added', [up.length, before.length]);
  }
  /* the CRM's own job writer (a person's edit: this phone's copy, the screen's copy, stamped, then synced) */
  const editJob = (id, note) => pm.ev(a => window._gcxPatchJob(a.id, { notes: a.note }, 'test edit'), { id, note });
  const cloudNote = id => ((H.cget('projects') || []).find(p => p.id === id) || {}).notes;

  // a save refused as busy (503) is retried and arrives, with no tap in between
  let n503 = 0, offline = false;
  await pm.ctx.route(/\/rest\/v1\/gc_kv/, async route => { const rq = route.request(); if (offline) return route.abort('internetdisconnected'); if (rq.method() === 'POST' && /"key":"projects"/.test(rq.postData() || '') && n503 < 2) { n503++; return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{"message":"busy"}' }); } return route.fallback(); });
  const REPS = +(process.env.FG_BUSY_REPS || 1); let busyOk = false;
  for (let rep = 0; rep < REPS; rep++) {
  n503 = 0; const bid = 'P' + (9 + rep * 10), bnote = 'Saved while the database was busy ' + rep;
  await pm.page().touchscreen.tap(195, 120); await sleep(200);
  await editJob(bid, bnote);
  busyOk = false; const tb = Date.now(); for (let i = 0; i < 240 && !busyOk; i++) { await sleep(500); busyOk = cloudNote(bid) === bnote; }
  console.log('    busy rep ' + rep + ': ' + JSON.stringify({ n503, busyOk, secs: Math.round((Date.now() - tb) / 1000) }));
  if (!busyOk) break;
  }
  if (!(n503 >= 1 && busyOk)) { const sx = await pm.ev(() => window.__gcFG.state()); console.log('    busy: ' + JSON.stringify({ n503, busyOk, dirty: sx.dirty, log: sx.log })); console.log('    unsent: ' + JSON.stringify(await pm.ev(() => window._gcUnsent ? window._gcUnsent() : null))); }
  ok(n503 >= 1 && busyOk, 'a save refused as busy (503) is retried and reaches the cloud (no tap in between)', { n503, busyOk });

  if (process.env.FG_QUICK) { console.log(`FIELDGUARD ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0); }
  // a save made offline goes up when the signal returns, 2+ minutes later, with no tap in between
  await pm.page().touchscreen.tap(195, 120); await sleep(200);
  offline = true; await pm.ctx.setOffline(true);
  await editJob('P7', 'Saved offline by the PM');
  await sleep(130000);
  ok(cloudNote('P7') !== 'Saved offline by the PM', 'offline: the save stays on the phone while there is no signal');
  offline = false; await pm.ctx.setOffline(false);
  await pm.ev(() => window.dispatchEvent(new Event('online')));
  let offOk = false; for (let i = 0; i < 180 && !offOk; i++) { await sleep(500); offOk = cloudNote('P7') === 'Saved offline by the PM'; }
  ok(offOk, 'offline: the save reaches the cloud when the signal returns (2+ min after the tap, no tap in between)', await pm.ev(() => window.__gcFG.state()));
  const st3 = await pm.ev(() => window.__gcFG.state());
  ok(!st3.dirty.projects, 'once the database took it, projects is no longer marked as a person\'s change', st3.dirty);
  ok(!pm.errs.length, 'no page errors (PM)', pm.errs.slice(0, 5));
  await pm.close();

  console.log('C. admin on the desk: unchanged');
  seed();
  const ad = await H.computer('Admin', { build }); OPEN.push(ad);
  ok(await H.signIn(ad, ADMIN, 20000), 'admin signs in');
  await sleep(8000);
  const st2 = await ad.ev(() => window.__gcFG && window.__gcFG.state());
  ok(st2 && st2.guarded === false, 'the admin\'s desk is not guarded', st2);
  const t2 = Date.now();
  await ad.ev(async () => { const L = await window.idbGet('projects'); const now = new Date().toISOString(); L.forEach(p => { p.updatedAt = now; }); await window.idbSet('projects', L); window._gcSyncDirty(['projects']); });
  let w2 = null; for (let i = 0; i < 70 && !w2; i++) { await sleep(500); w2 = H.writes.find(w => w.key === 'projects' && w.at >= t2); }
  ok(!!w2, 'an admin\'s upload of projects goes up as before (no gate on the desk)');
  ok(!ad.errs.length, 'no page errors (admin)', ad.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
finally { for (const c of OPEN) { try { await c.close(); } catch (e) {} } }
console.log(`FIELDGUARD ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
