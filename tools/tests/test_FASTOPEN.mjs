// test_FASTOPEN.mjs <build-dir> — patch FASTOPEN: the CRM opens from a saved copy and a warm open pulls only what changed.
// MADE-UP data only, offline harness (nothing leaves the machine). The harness must allow a service worker on a secure origin:
// GC_HARNESS_SW = a copy of the offline harness with computer(..., { sw: true, https: true }) and onStatic(fn) (default: the
// session scratchpad's fastopen/harness_fo.mjs). Fast link: this checks behaviour; the timing is in docs/FASTOPEN.md.
//   A. node: the patch is in the page once and idempotent; the worker answers only GET navigations of / and /index.html;
//      AWAY keeps the saved page; BOOTWATCH counts it as a cached copy and its update keeps it only when it is the live build.
//   B. first open of a phone (GrayCo Field): signs in, the sync's marks are kept, the worker is registered and the page saved.
//   C. warm open: the page comes from the saved copy; only the list that changed in the cloud (leads) is downloaded — the
//      others are checked by their stamp; a list changed on this phone and not sent (projects) is pulled and merged, never
//      hidden (it stays and the SAVES "ahead" rules apply); nothing is uploaded that should not be.
//   D. offline: the CRM still opens from the saved copy with this phone's data.
//   E. a new build: the saved (old) copy opens at once and the stale gate HOLDS its automatic uploads (nothing written to the
//      cloud) while a person's own save goes; BOOTWATCH offers the update; the new build is downloaded in the background and
//      checked; the next open is the new build, from the saved copy.
//   F. a newer build not downloaded yet: a reload goes to the network (gets the new build), never the old copy again.
//   G. kill switch: gc_fastopen_sw_off = 1 → the page comes from the network and the saved copy is gone.
// Usage: node tools/tests/test_FASTOPEN.mjs <dir with index.html>
import fs from 'fs'; import path from 'path'; import os from 'os'; import { pathToFileURL } from 'url'; import { execFileSync } from 'child_process';
const HARNESS = process.env.GC_HARNESS_SW || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/fastopen/harness_fo.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_FASTOPEN.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

console.log('A. node');
const page0 = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(build, 'crm-push-sw.js'), 'utf8');
ok((page0.match(/<script id="gc-patch-fastopen">/g) || []).length === 1 && page0.indexOf('<script id="gc-patch-fastopen">') < page0.indexOf('<script id="gc-patch-regfix-stalegate">') && page0.indexOf('var BUILD_ID = "') < page0.indexOf('<script id="gc-patch-fastopen">'), 'the page script sits once, after the build id, before the stale gate');
{ const tmp = path.join(os.tmpdir(), 'fastopen_idem_' + process.pid + '.html'); fs.writeFileSync(tmp, page0);
  const out = execFileSync('python3', [path.join(build, 'tools', 'patch_FASTOPEN.py'), tmp]).toString(); ok(/already applied/.test(out) && fs.readFileSync(tmp, 'utf8') === page0, 'the patch is idempotent'); fs.unlinkSync(tmp); }
ok(/req\.method !== 'GET' \|\| req\.mode !== 'navigate'\) return;/.test(sw) && /u\.pathname !== '\/' && u\.pathname !== '\/index\.html'/.test(sw), 'the worker answers only GET page navigations of / and /index.html');
ok(/addEventListener\('push'/.test(sw) && /notificationclick/.test(sw), 'the worker still shows the phone notifications');
ok(/if\(!\/\^gc-crm-shell-\/\.test\(n\)\)caches\.delete\(n\)/.test(page0), 'AWAY keeps the saved page (and still empties every other cache)');
ok(/return 'sw-shell';/.test(page0) && /W\._gcFastOpen\.sw\.keep\(n, LIVE\.v\)/.test(page0), 'BOOTWATCH: a saved copy is a cached copy; its update keeps the copy only when it is the live build');
ok(/if\(h\.updated_at === _pmSeedHeads\[h\.key\]\)/.test(page0) && /if\(DT\.has\(k\)\)\{ _pmStat\.mismatch\+\+/.test(page0) && page0.indexOf('<script id="gc-patch-fastopen-dirty">') < page0.indexOf('<script id="gc-patch-bootsafe">'), 'marks: a kept list is skipped only with the exact cloud stamp and no write here since (the write watch runs before the app)');

const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const ADMIN = Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === 'u-wesley');
const ANAME = H.ACCOUNTS[ADMIN].name;
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const V1 = fs.readFileSync(path.join(build, 'version.txt'), 'utf8').trim();
const tmpd = fs.mkdtempSync(path.join(os.tmpdir(), 'fastopen-'));
function release(tag){ const v = V1.replace(/-([a-z0-9]+)$/, (m, a) => '-' + a + tag); const f = path.join(tmpd, tag + '.html'); fs.writeFileSync(f, page0.split(V1).join(v)); return { v, f }; }
let cur = { v: V1, f: path.join(build, 'index.html') };
const pageHits = [];
H.onStatic(u => {
  if (u.pathname === '/version.txt') return { status: 200, contentType: 'text/plain', body: cur.v + '\n' };
  if (u.pathname === '/' || u.pathname === '/index.html') { pageHits.push({ at: Date.now(), v: cur.v }); return { path: cur.f, contentType: 'text/html' }; }
  return null;
});
function seed(){
  H.resetCloud();
  const projects = [], leads = [], invs = [], customers = [];
  for (let i = 0; i < 60; i++) projects.push({ id: 'P' + i, po: 'PO-' + (7000 + i), name: 'Demo Job ' + i, client: 'Sample Customer ' + i, address: (100 + i) + ' Demo St', pm: ANAME, status: 'Active', updatedAt: ago(5) });
  for (let i = 0; i < 40; i++) leads.push({ id: 'L' + i, name: 'Lead ' + i, client: 'Lead Person ' + i, stage: 'New Lead', createdAt: ago(10), updatedAt: ago(10) });
  for (let i = 0; i < 30; i++) invs.push({ id: 'I' + i, pid: 'P' + i, num: 'INV-' + i, amt: 500 + i, status: 'sent', type: 'client', date: ago(30).slice(0, 10), updatedAt: ago(25) });
  for (let i = 0; i < 20; i++) customers.push({ id: 'C' + i, name: 'Customer ' + i, updatedAt: ago(20) });
  H.cset('projects', projects); H.cset('leads', leads); H.cset('invs', invs); H.cset('customers', customers);
  H.cset('schedule', []); H.cset('estimates', []); H.cset('subs', []); H.cset('vendors', []); H.cset('expenses', []);
  H.cset('users', [{ id: 'u1', name: ANAME, email: ADMIN, role: 'Admin', payType: 'owner', active: true }]);
}
seed();
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';
const INIT = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  d(Navigator.prototype, 'userAgent', ${JSON.stringify(IPHONE)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5); })()`;
const kvValueReads = () => H.reads.filter(r => r.table === 'gc_kv' && /select=key%2Cvalue%2Cupdated_at|select=key,value,updated_at/.test(r.q) && /key=in\./.test(r.q));
const keysOf = q => { const m = /key=in\.([^&]*)/.exec(q); if (!m) return []; return decodeURIComponent(m[1].replace(/\+/g, ' ')).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')); };
let A = null;
const ev = (f, a) => A.ev(f, a);
const until = async (f, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await f(); if (v) return v; } catch (e) {} await sleep(300); } return null; };
const served = () => until(() => ev(() => window.__GC_SHELL__ || (navigator.serviceWorker && navigator.serviceWorker.controller ? null : { from: 'no worker' })), 15000);
const opened = () => until(() => ev(() => !!window._crm && !!document.querySelector('#root *') && !document.getElementById('gc-auth-gate')), 90000);
async function reload(){ await A.page().reload({ waitUntil: 'commit', timeout: 120000 }).catch(() => {}); return opened(); }
try {
  console.log('B. first open of the phone');
  A = await H.computer('Phone', { build, mobile: true, sw: true, https: true, init: INIT });
  ok(await H.signIn(A, ADMIN, 60000), 'the admin signs in on the phone');
  ok(!!(await opened()), 'the CRM opens');
  const m1 = await until(() => ev(() => { const i = window._gcFastOpen && window._gcFastOpen.marks.info(); return i && i.saves && i.kept >= 2 ? i : null; }), 150000);
  ok(!!m1, 'the sync kept its marks after the first pull', m1);
  await ev(() => window._gcFastOpen.sw.start());
  const s1 = await until(() => ev(() => { const i = window._gcFastOpen.sw.info(); return i.meta && i.meta.build ? i : null; }), 90000);
  ok(!!s1 && s1.meta.build === V1 && s1.meta.mode === 'fast' && !!(await ev(() => !!navigator.serviceWorker.controller)), 'the worker is registered and the page is saved (build ' + V1 + ', "fast" on a phone)', s1);

  console.log('C. warm open');
  await sleep(4000);
  H.cset('leads', H.cget('leads').concat([{ id: 'LNEW', name: 'New lead from the office', stage: 'New Lead', createdAt: ago(0), updatedAt: ago(0) }]));
  await ev(() => new Promise(res => { const q = indexedDB.open('grayco_crm', 3); q.onsuccess = () => { const db = q.result, tx = db.transaction('kv', 'readwrite'), st = tx.objectStore('kv'), g = st.get('projects');
    g.onsuccess = () => { const v = g.result || []; v.push({ id: 'PLOCAL', name: 'Made-up job saved on the phone, not sent', status: 'Active', updatedAt: new Date().toISOString() }); st.put(v, 'projects'); }; tx.oncomplete = () => res(true); }; }));
  const r0 = H.reads.length, w0 = H.writes.length;
  ok(!!(await reload()), 'the CRM opens again');
  const sv = await served();
  ok(sv && sv.from === 'cache' && sv.build === V1, 'the page came from the saved copy', sv);
  const m2 = await until(() => ev(() => { const i = window._gcFastOpen.marks.info(); return i.seeded && i.logged ? i : null; }), 60000);
  const valueKeys = [...new Set(H.reads.slice(r0).filter(r => r.table === 'gc_kv' && /key=in\./.test(r.q) && /value/.test(decodeURIComponent(r.q)) && /updated_at/.test(decodeURIComponent(r.q))).flatMap(r => keysOf(r.q)))];
  ok(!!m2 && m2.seeded >= 1 && (m2.seededNow || []).includes('customers'), 'the kept marks were checked and used (' + (m2 && m2.seeded) + ' lists)', m2);
  ok(valueKeys.includes('leads'), 'the list changed in the cloud (leads) was downloaded', valueKeys);
  ok(!valueKeys.includes('customers'), 'a list unchanged in the cloud and not written here since (customers) was NOT downloaded again', valueKeys);
  ok(!!m2.restored && m2.unchanged >= 1, 'it was checked by its cloud stamp only (key+stamp read)', m2);
  ok(valueKeys.includes('projects') && !(m2.seededNow || []).includes('projects'), 'the list changed on this phone (projects, not sent) was marked by the write watch and was pulled and merged', { valueKeys, mis: m2 && m2.mis });
  const hasNew = await until(() => ev(async () => ((await window.idbGet('leads')) || []).some(l => l && l.id === 'LNEW')), 30000);
  ok(!!hasNew, "the office's new lead is on the phone");
  const keptLocal = await until(() => ev(async () => ((await window.idbGet('projects')) || []).some(p => p && p.id === 'PLOCAL')), 20000);
  ok(!!keptLocal, "the phone's own unsent job is still there after the pull");
  const badW = H.writes.slice(w0).filter(w => ['invs', 'customers', 'users', 'leads'].includes(w.key) && !w.same);
  ok(!badW.length, 'no list was changed in the cloud by the warm open', badW.map(w => w.key));

  console.log('D. offline');
  await A.ctx.setOffline(true);
  ok(!!(await reload()), 'with no signal the CRM opens');
  const so = await served();
  ok(so && /cache/.test(so.from), 'from the saved copy', so);
  ok(!!(await until(() => ev(async () => ((await window.idbGet('projects')) || []).length >= 60), 20000)), "with this phone's data");
  await A.ctx.setOffline(false);
  await reload();

  console.log('E. a new build is released');
  const R2 = release('x2'); cur = R2;
  const w1 = H.writes.length;
  ok(!!(await reload()), 'the CRM opens at once from the saved copy');
  const se = await served(); const b1 = await ev(() => window.__GC_BUILD_ID__);
  ok(se && se.from === 'cache' && b1 === V1, 'the saved (old) copy opened (' + b1 + ')', se);
  const st = await until(() => ev(() => window._gcStaleGate && window._gcStaleGate.state() === 'stale' ? window._gcStaleGate.info() : null), 40000);
  ok(!!st && st.live === R2.v, 'the stale gate sees the newer live build', st);
  const held = await ev(() => window._supaUpsert('gc_folded', [{ id: 'FX', note: 'automatic' }]).then(() => 'sent', e => String(e && e.message || e)));
  ok(/held/.test(held) && !H.writes.slice(w1).some(w => w.key === 'gc_folded'), 'an automatic upload from the old copy is held (nothing written to the cloud)', held);
  /* AUTOUPD (main 11/19): no bar any more — BOOTWATCH sees the old copy and updates it by itself at the first quiet moment */
  const upd = await until(() => ev(() => { if (document.getElementById('gc-bw-update') || document.getElementById('gc-update-bar') || document.getElementById('gc-stalegate-note') || document.getElementById('gc-bw-updating') || document.getElementById('gc-upd-pill')) return 'shown';
    const b = window._gcBootWatch && window._gcBootWatch.state().boot; return b && (b.old || b.updWait || b.autoUpd) ? { old: b.old, wait: b.updWait, auto: b.autoUpd } : null; }), 20000);
  ok(!!upd, 'the update is offered / runs by itself (AUTOUPD)', upd);
  await A.page().touchscreen.tap(200, 400).catch(() => {});
  const mine = await ev(() => window._supaUpsert('gc_team_settings', { fastopenTest: 1 }).then(() => 'sent', e => String(e && e.message || e)));
  ok(mine === 'sent', "a person's own save still goes (a tap in the last 15 s)", mine);
  const hits0 = pageHits.length;
  await ev(() => window._gcFastOpen.sw.refresh('test'));
  const s2 = await until(() => ev(() => { const i = window._gcFastOpen.sw.info(); return i.meta && i.meta.build ? i : null; }), 60000);
  ok(s2 && s2.meta.build === R2.v && !s2.meta.stale && pageHits.length > hits0, 'the new build was downloaded in the background, checked and saved', s2);
  ok(!!(await reload()), 'the next open');
  const s3 = await served(); const b2 = await ev(() => window.__GC_BUILD_ID__);
  ok(s3 && s3.from === 'cache' && b2 === R2.v, 'is the new build, from the saved copy (' + b2 + ')', s3);
  ok(!!(await until(() => ev(() => window._gcStaleGate.state() === 'current'), 30000)), 'and the stale gate opens');

  console.log('F. a newer build not downloaded yet');
  const R3 = release('x3'); cur = R3;
  await reload();
  const sf = await served();
  ok(sf && sf.from === 'cache', 'the saved copy opens first', sf);
  /* AUTOUPD: the old copy may also be updated by itself at once — BOOTWATCH's update then drops the copy (it is not the live build) */
  const marked = await until(() => ev(async () => { const c = await caches.open('gc-crm-shell-v1'); const r = await c.match('/__gc_shell_meta'); const m = r ? await r.json() : null;
    if (m && m.stale) return m; if (!m || !m.build) return { dropped: true }; window.__foLast = { meta: m, build: window.__GC_BUILD_ID__, sw: window._gcFastOpen && window._gcFastOpen.sw && window._gcFastOpen.sw.info(), bw: window._gcBootWatch && window._gcBootWatch.state().boot.updWait }; return null; }), 30000);
  ok(!!marked && (marked.staleFor === R3.v || marked.dropped), 'the old copy is never opened again once the newer build is seen: marked stale, or dropped by the automatic update', marked || await ev(() => window.__foLast).catch(e => String(e)));
  ok(!!(await reload()), 'a reload (the update)');
  const sf2 = await served(); const b3 = await ev(() => window.__GC_BUILD_ID__);
  ok(sf2 && sf2.from === 'network' && b3 === R3.v, 'goes to the network and gets the new build (' + b3 + ')', sf2);

  console.log('G. kill switch');
  await ev(() => { localStorage.setItem('gc_fastopen_sw_off', '1'); });
  await reload();
  const gone = await until(() => ev(async () => { const c = await caches.open('gc-crm-shell-v1'); const r = await c.match('/index.html'); return !r; }), 20000);
  ok(!!gone, 'the saved copy is emptied');
  ok(!!(await reload()), 'the CRM opens');
  const sg = await served();
  ok(sg && sg.from === 'network', 'from the network', sg);
  const errs = (A.errs || []).filter(e => !/Failed to fetch|NetworkError|net::|Load failed/i.test(e) && !/^held: this copy of the CRM is out of date/.test(e));   /* the stale gate's own refusal of an old copy's upload (E) is expected */
  ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL stopped: ' + (e && e.stack || e)); }
try { await A.b.close(); } catch (e) {}
try { fs.rmSync(tmpd, { recursive: true, force: true }); } catch (e) {}
console.log(`RESULT ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
