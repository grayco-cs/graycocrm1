// test_NICKFREEZE.mjs <build-dir> — patch NICKFREEZE (owner 11/22: "It is freezing really bad for Nick ... on everyone's screen").
// Offline harness (GC_HARNESS), made-up data only. Checks:
//  A. LSSIDE (desk): a backup copy / snapshot / the removed-rows log written by the CRM is NOT in the browser's localStorage, is
//     read back by localStorage.getItem on this page and after a reload (IndexedDB gc_lsside); a copy already in localStorage
//     before the update is moved (IndexedDB first), the removed-rows log is merged, gc_safenet_meta and real lists stay.
//  B. LSSIDE (phone): the backup copies stay in memory (not in localStorage, not read back stale after a reload); the
//     rate-book / price-log mirrors are never written to localStorage.
//  C. the crm-files queue: a file already in the store is marked done without an upload; "Duplicate" 400 = done; a refused
//     name is kept back with its reason and not sent again; a 500 waits (tries, nextAt) and the other files still go.
//  D. the file door: a pull whose only base64 is an <img src="data:…"> inside saved page text is not parsed / converted;
//     a real data: value still is.
//  E. the per-PO 💬 buttons: 480 jobs on the Projects list (phone, CPU ×4) — the buttons are there, once per row, and no
//     long task of the button pass is over 500 ms.
import { pathToFileURL } from 'url';
const H = await import(pathToFileURL(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs').href);
const build = process.argv[2]; if (!build) { console.error('usage: node test_NICKFREEZE.mjs <build>'); process.exit(2); }
const sleep = H.sleep; let pass = 0, fail = 0;
const ONLY = process.env.NF_ONLY || 'ABCDE';   /* parts to run */
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const iso = d => new Date(Date.now() - d * 864e5).toISOString();
const NATIVE = `(() => { const P = Storage.prototype; window.__nat = { get: P.getItem, set: P.setItem, key: P.key };
  window.__natGet = k => window.__nat.get.call(localStorage, k);
  window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push({ t: e.startTime, ms: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {} })()`;
function seed(n){
  H.resetCloud();
  H.cset('users', [{ id: 'u0', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true, payType: 'owner' }, { id: 'u1', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }]);
  const pj = []; for (let i = 0; i < (n || 3); i++) pj.push({ id: 'P' + i, name: 'Demo Job ' + i, client: 'Demo Client ' + i, address: i + ' Demo St', autoPO: 'A' + (100 + i), pm: 'Wesley Johnson', status: 'active', contract: 1000 + i, contractSigned: true, createdAt: iso(5), updatedAt: iso(1) });
  H.cset('projects', pj);
}
const ready = A => H.waitFor(A, () => !!(window.__gcLsSide && window.__gcLsSide.state().ready && window._crm), null, 90000);

/* ── A. desk ── */
if (ONLY.includes('A')) console.log('A. backup copies off localStorage (desk)');
if (ONLY.includes('A')) {
  seed();
  /* a desk computer from before the update: its copies are in localStorage */
  /* a desk computer from before the update: its copies are in localStorage (written with the browser's own setItem) */
  const A = await H.computer('NF-A', { build, init: [NATIVE] });
  await H.signIn(A, 'wjohnson@grayco-cs.com', 60000); await ready(A); await sleep(1500);
  await A.ev(() => { const set = (k, v) => window.__nat.set.call(localStorage, k, v);
    set('gc_snap_nfdemo', JSON.stringify({ t: 1, n: 1, data: [{ id: 'OLD1' }] }));
    set('gc_dupes_removed', JSON.stringify([{ at: '2026-11-01', from: 'invs', row: { id: 'D1' } }])); });
  await A.page().reload({ waitUntil: 'domcontentloaded' }); await ready(A); await sleep(2500);
  let s = await A.ev(() => ({ st: window.__gcLsSide.state(), natSnap: window.__natGet('gc_snap_nfdemo'), natDup: window.__natGet('gc_dupes_removed'), snap: localStorage.getItem('gc_snap_nfdemo'), metaSide: window.__gcLsSide.isSide('gc_safenet_meta'), tombSide: window.__gcLsSide.isSide('gc_tombstones') }));
  ok(s.st.ready && !s.st.failed, 'IndexedDB side store ready (' + s.st.readyMs + ' ms after the start)');
  ok(s.natSnap == null && s.natDup == null && s.st.moved >= 2, 'the old copies left localStorage (moved ' + s.st.moved + ')');
  ok(!s.metaSide && !s.tombSide, 'gc_safenet_meta and real lists (gc_tombstones) stay in localStorage');
  ok(/OLD1/.test(s.snap || ''), 'localStorage.getItem still reads the moved snapshot');
  /* the CRM writes them as before */
  await A.ev(() => { localStorage.setItem('gc_ests_backup', JSON.stringify([{ id: 'E1', name: 'x'.repeat(5000) }])); localStorage.setItem('gc_bak_nfdemo', '[1,2,3]');
    const l = JSON.parse(localStorage.getItem('gc_dupes_removed') || '[]'); l.push({ at: '2026-11-22', from: 'leads', row: { id: 'D2' } }); localStorage.setItem('gc_dupes_removed', JSON.stringify(l)); localStorage.setItem('gc_nf_plain', 'stays'); });
  s = await A.ev(() => ({ nat: window.__natGet('gc_ests_backup'), get: (localStorage.getItem('gc_ests_backup') || '').length, plain: window.__natGet('gc_nf_plain') }));
  ok(s.nat == null && s.get > 5000, 'a new gc_ests_backup is read back but not in localStorage');
  ok(s.plain === 'stays', 'any other key is written to localStorage as before');
  await sleep(2500);
  await A.page().reload({ waitUntil: 'domcontentloaded' }); await ready(A); await sleep(1000);
  s = await A.ev(() => ({ b: (localStorage.getItem('gc_ests_backup') || '').length, k: localStorage.getItem('gc_bak_nfdemo'), d: localStorage.getItem('gc_dupes_removed'), nat: window.__natGet('gc_ests_backup'), st: window.__gcLsSide.state() }));
  ok(s.b > 0 && s.k === '[1,2,3]', 'after a reload the copies are read back from IndexedDB');
  ok(/D1/.test(s.d || '') && /D2/.test(s.d || ''), 'the removed-rows log kept its old and new rows');
  ok(s.nat == null, 'and they are still not in localStorage (side store ' + Math.round(s.st.chars / 1000) + ' K chars)');
  await A.close();
}

/* ── B. phone ── */
if (ONLY.includes('B')) console.log('B. phone: copies in memory only, mirrors never in localStorage');
if (ONLY.includes('B')) {
  seed();
  const A = await H.computer('NF-B', { build, mobile: true, init: [NATIVE] });
  await H.signIn(A, 'wjohnson@grayco-cs.com', 60000); await ready(A); await sleep(1500);
  await A.ev(() => { localStorage.setItem('gc_snap_estimates', JSON.stringify({ t: 2, n: 1, data: [{ id: 'S1' }] })); localStorage.setItem('gc_matlog_v2', JSON.stringify([{ id: 'm1' }])); localStorage.setItem('gc_rates_v3', JSON.stringify([{ id: 'r1' }])); });
  let s = await A.ev(() => ({ phone: window.__gcLsSide.state().phone, nat: window.__natGet('gc_snap_estimates'), get: localStorage.getItem('gc_snap_estimates'), ml: window.__natGet('gc_matlog_v2'), rt: window.__natGet('gc_rates_v3'), mlGet: localStorage.getItem('gc_matlog_v2') }));
  ok(s.phone, 'seen as a phone');
  ok(s.nat == null && /S1/.test(s.get || ''), 'the snapshot is read back on this page, not stored in localStorage');
  ok(s.ml == null && s.rt == null && /m1/.test(s.mlGet || ''), 'the price-log / rate-book mirrors stay in page memory');
  await sleep(2000); await A.page().reload({ waitUntil: 'domcontentloaded' }); await ready(A); await sleep(800);
  s = await A.ev(() => ({ get: localStorage.getItem('gc_snap_estimates') }));
  ok(!/S1/.test(s.get || ''), 'after a reload a phone does not read an old copy back');
  await A.close();
}

/* ── C. the upload queue ── */
if (ONLY.includes('C')) console.log('C. the crm-files upload queue');
if (ONLY.includes('C')) {
  seed();
  const A = await H.computer('NF-C', { build, init: [NATIVE] });
  const log = []; const there = new Set(); let mode = {};
  await A.ctx.route(u => /\/storage\/v1\/object\//.test(String(u)), async r => {
    const u = new URL(r.request().url()); const m = r.request().method();
    if (/\/object\/list\//.test(u.pathname)) { const b = JSON.parse(r.request().postData() || '{}'); log.push('list ' + b.search.slice(0, 6)); const hit = [...there].filter(p => p.startsWith(b.search)).map(p => ({ name: p })); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hit) }); }
    if (m === 'POST') { const p = u.pathname.split('/').pop(); log.push('post ' + p.slice(0, 6)); const md = mode[p.slice(0, 64)] || 'ok';
      if (md === 'dup') return r.fulfill({ status: 400, contentType: 'application/json', body: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}' });
      if (md === 'key') return r.fulfill({ status: 400, contentType: 'application/json', body: '{"statusCode":"400","error":"InvalidKey","message":"Invalid key"}' });
      if (md === '500') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' });
      there.add(p); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"crm-files/' + p + '"}' }); }
    return r.fallback();
  });
  await H.signIn(A, 'wjohnson@grayco-cs.com', 60000); await ready(A); await sleep(1000);
  /* five waiting files, each with its own answer */
  const hs = await A.ev(async () => {
    const mk = async (t, i) => ({ h: String(i + 1).repeat(64).slice(0, 64).replace(/[^0-9]/g, 'a'), b: new Blob([t], { type: 'text/plain' }) });   /* made-up fingerprints (the queue does not re-hash) */
    await window._gcFilesStatus();   /* the file store's IndexedDB exists */
    const out = []; let n = 0; for (const t of ['nf-there', 'nf-dup', 'nf-key', 'nf-500', 'nf-new']) out.push(await mk(t + ' demo file', n++));
    const db = await new Promise(r => { const q = indexedDB.open('grayco_files', 1); q.onsuccess = () => r(q.result); });
    await new Promise(r => { const tx = db.transaction('pending', 'readwrite'); out.forEach((o, i) => tx.objectStore('pending').put({ hash: o.h, path: o.h + '.txt', type: 'text/plain', blob: o.b, name: 'demo' + i + '.txt', at: Date.now() - 5000, tries: 0 })); tx.oncomplete = r; });
    return out.map(o => o.h);
  });
  there.add(hs[0] + '.txt'); mode[hs[1]] = 'dup'; mode[hs[2]] = 'key'; mode[hs[3]] = '500';
  await A.ev(() => window._gcFilesUploadNow()); await sleep(1500);
  const st = await A.ev(() => window._gcFilesStatus());
  const posts = log.filter(x => /^post/.test(x));
  ok(!posts.includes('post ' + hs[0].slice(0, 6)), 'a file already in the store is not sent (looked up first)');
  ok(posts.includes('post ' + hs[4].slice(0, 6)), 'a new file is sent');
  ok(st.keptBack.length === 1 && /name/.test(st.keptBack[0]), 'the refused name is kept back with its reason: ' + (st.keptBack[0] || '').slice(0, 90));
  ok(st.waitingAfterError.length === 1 && /1 tries/.test(st.waitingAfterError[0]), 'the 500 waits: ' + (st.waitingAfterError[0] || '').slice(0, 90));
  ok(st.waitingToUpload === 1, 'one file left waiting (the 500), the Duplicate is done (' + st.waitingToUpload + ')');
  const n0 = log.length; await A.ev(() => window._gcFilesUploadNow()); await sleep(1200);
  ok(log.slice(n0).filter(x => /^post/.test(x)).length === 0, 'the next drain sends nothing again (kept back / waiting): ' + log.slice(n0).join(', '));
  await A.close();
}

/* ── D. the file door ── */
if (ONLY.includes('D')) console.log('D. a saved page with an embedded logo is not converted');
if (ONLY.includes('D')) {
  seed();
  const big = 'A'.repeat(9000);
  H.cset('projectDocs', [{ id: 'DOC1', pid: 'P0', name: 'Proposal', html: '<html><img class="logo" src="data:image/png;base64,' + big + '"></html>' }]);
  H.cset('vendors', [{ id: 'V1', name: 'Demo vendor', files: [{ name: 'coi.txt', type: 'text/plain', data: 'data:text/plain;base64,' + Buffer.from('demo '.repeat(3000)).toString('base64') }] }]);
  const A = await H.computer('NF-D', { build, init: [NATIVE] });
  await H.signIn(A, 'wjohnson@grayco-cs.com', 60000); await ready(A); await sleep(8000);
  const st = await A.ev(async () => ({ stats: Object.assign({}, window.__GC_FILES__.stats), html: await fetch('https://ieeonhpfahmwwecizdut.supabase.co/rest/v1/gc_kv?key=eq.projectDocs&select=value').then(r => r.text()).then(t => t.indexOf(';base64,') > 0) }));
  ok(st.html, 'the saved page keeps its embedded logo');
  ok(st.stats.stored >= 1, 'the vendor\'s real file is still moved to the file store (' + st.stats.stored + ' stored)');
  await A.close();
}

/* ── E. the per-PO buttons on a phone with 480 jobs ── */
if (ONLY.includes('E')) console.log('E. 💬 buttons on the Projects list, 480 jobs, phone CPU ×4');
if (ONLY.includes('E')) {
  seed(480);
  const A = await H.computer('NF-E', { build, mobile: true, init: [NATIVE] });
  await H.signIn(A, 'wjohnson@grayco-cs.com', 60000);
  const cdp = await A.ctx.newCDPSession(A.page());
  await H.waitFor(A, () => typeof window._gcChooseView === 'function' && !!window._setView, null, 90000);
  await A.ev(() => { window._gcChooseView('desk'); window._setView('projects'); }); await sleep(6000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const tc = await A.ev(() => performance.now()); await sleep(9000);   /* the same 9 s without the pass: what else runs */
  const quiet = await A.ev(t => window.__lt.filter(x => x.t >= t).reduce((a, x) => Math.max(a, x.ms), 0), tc);
  const t0 = await A.ev(() => performance.now());
  await A.ev(() => document.querySelectorAll('.__gcListMsgBtn').forEach(b => b.remove()));   /* the pass runs again (observer + 4 s timer) */
  await sleep(9000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const s = await A.ev(t => { const b = [...document.querySelectorAll('.__gcListMsgBtn')]; const rows = new Map(); let dup = 0; b.forEach(x => { const r = x.closest('tr') || x.parentNode; const k = x.getAttribute('data-pid'); const key = k + '|' + (rows.has(r) ? 1 : 0); if (rows.get(r) === k) dup++; rows.set(r, k); });
    return { n: b.length, dup, worst: window.__lt.filter(x => x.t >= t).reduce((a, x) => Math.max(a, x.ms), 0) }; }, t0);
  ok(s.n > 0, s.n + ' 💬 buttons on the list');
  ok(s.dup === 0, 'one per row');
  ok(s.worst <= Math.max(500, quiet + 200), 'putting them back adds no long task over 500 ms (worst ' + s.worst + ' ms; the same 9 s without the pass: ' + quiet + ' ms)');
  await A.close();
}
console.log(`\nNICKFREEZE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
