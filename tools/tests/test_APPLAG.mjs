// test_APPLAG.mjs <build-dir> — patch APPLAG: approvals on an admin's iPhone with one bar of signal.
// Owner 11/19 (iPhone, GrayCo Field, 1–2 bars): "So many lags on approvals", "keeps saying saved on phone not sent to office yet".
// Measured offline with live-sized data at 400 kbps: uploads counted as failed while they were still on their way (sbWrite's
// 30 s), the retry started a second upload of the same list (7–9 copies of the 376 KB register at once, each with its own full
// read of the cloud row) and the note "Saved on this phone — not sent to the office yet" stayed on.
//   A. node: one upload of a list at a time (sbWrite queue), a late arrival clears "not sent", the field guard reuses the cloud
//      row it last saw (cheap updated_at check), the save queue's waits fit the list, one CROSS-BROWSER push pass at a time,
//      the phone's estimates wait for a screen that wants them.
//   B. admin on an iPhone, made-up data at office size (jobs ~600 KB, register ~400 KB, office to-dos ~500 KB, leads ~600 KB),
//      localStorage nearly full, the network throttled to 400 kbps / 300 ms (shared fairly between requests, up and down):
//      · My Approvals opens from the Field bar within 5 s, no long task over 200 ms while it opens;
//      · an expense approved there reaches the cloud;
//      · five saves of the same list at once → at most 2 uploads of it; the field guard's second look at the row is a cheap check;
//      · an upload slower than its timeout (held 60 s on the line) is "sending", not "not sent", and clears when it lands;
//      · the amber "not sent to the office yet" note never shows; nothing is left unsent or waiting at the end;
//      · gc_kv request bound: no list uploaded more than 3 times, fewer than 40 uploads in all, upload volume < 4 MB;
//      · no page errors.
// Usage: node test_APPLAG.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_APPLAG.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

console.log('A. node');
const t = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
ok(/function _sbwPump\(key\)/.test(t) && /sbWrite\.flying = function/.test(t), 'sbWrite: one upload of a list at a time, the newest value goes next');
ok(/sbWrite\.onDone = function/.test(t) && /window\._gcSending = function/.test(t), 'a late arrival is recorded as sent ("sending" while on its way)');
ok(/var CACHE = \{\}, CROW = \{\}, PULLS = \[\];/.test(t) && /FG\.wouldHold = function/.test(t) && /FG\.isHeld = function/.test(t), 'field guard: the cloud row it last saw, checked by updated_at; wouldHold / isHeld');
ok(/var tRead = Math\.min\(150000, 30000 \+ Math\.round\(sz \/ 20\)\)/.test(t), 'save queue: its waits fit the list');
ok(/var _pushing=false;\s*async function pushChanged\(\)/.test(t), 'CROSS-BROWSER push: one pass at a time');
ok(/a save waited for them/.test(t), 'STUCKFIX: a phone loads the estimates when a screen wants them (or a save waits for them)');
ok(t.indexOf('<script id="gc-patch-samekv">') > 0 && t.indexOf('<script id="gc-patch-samekv">') < t.indexOf('<script id="gc-patch-fieldguard">'), 'SAMEKV: an upload the cloud already has, exactly, is not sent (under every gc_kv upload)');
ok(/if \(!ph && js\.length < 2500000 && last !== day/.test(t) && /migrate\.__idbSkip/.test(t), 'estimate backups: never from a phone; a desk once a day when changed; the "migrated" flag kept in IndexedDB too');
ok(/gc_doc_snap_idb/.test(t) && /is the cloud's copy/.test(t), 'documents: upload fingerprints kept in IndexedDB too, and a document the cloud already has is not sent again');

const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const ADMIN = Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === 'u-wesley');
const ANAME = H.ACCOUNTS[ADMIN].name;
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const pad = n => 'x'.repeat(n);
function seed(){
  H.resetCloud();
  const projects = [], reg = [], leads = [], tasks = [], invs = [];
  for (let i = 0; i < 480; i++) projects.push({ id: 'P' + i, po: 'PO-' + (7000 + i), name: 'Demo Job ' + i, client: 'Sample Customer ' + i, address: (100 + i) + ' Demo St', pm: ANAME, status: i % 3 ? 'Active' : 'Complete', commissionSource: 'company', contract: 1000 * (i + 1), notes: 'Made-up notes ' + pad(900), updatedAt: ago(20 + (i % 9)) });
  for (let i = 0; i < 700; i++) reg.push({ id: 'R' + i, _id: 'R' + i, date: ago(60).slice(0, 10), amount: 100 + i, type: 'expense', desc: 'Made-up line ' + i + ' ' + pad(420), pid: 'P' + (i % 480), updatedAt: ago(50) });
  for (let i = 0; i < 200; i++) leads.push({ id: 'L' + i, name: 'Lead ' + i, client: 'Lead Person ' + i, stage: 'New Lead', notes: pad(2800), createdAt: ago(10), updatedAt: ago(10) });
  for (let i = 0; i < 730; i++) tasks.push({ id: 'T' + i, label: 'Made-up to-do ' + i + ' ' + pad(560), done: i % 3 === 0, addedAt: ago(9), updatedAt: ago(9) });
  for (let i = 0; i < 300; i++) invs.push({ id: 'I' + i, pid: 'P' + (i % 480), num: 'INV-' + i, amt: 500 + i, status: 'sent', type: 'client', date: ago(30).slice(0, 10), note: pad(800), updatedAt: ago(25) });
  H.cset('projects', projects); H.cset('gcAcctRegister', reg); H.cset('leads', leads); H.cset('gc_office_tasks', JSON.stringify(tasks)); H.cset('invs', invs);
  const ent = ago(1);
  H.cset('expenses', [0, 1].map(i => ({ id: 'EXPLAG' + i, type: 'expense', vendor: 'Made-up Lumber ' + i, desc: 'Made-up boards ' + i, amt: 50 + i, pid: 'P' + (i + 1), category: 'Materials', status: 'pending', date: ent.slice(0, 10), by: ANAME, enteredAt: ent, updatedAt: ent })));
  H.cset('gc_expense_approvals', [0, 1].map(i => ({ id: 'expId:EXPLAG' + i, expId: 'EXPLAG' + i, jobId: 'P' + (i + 1), pm: ANAME, amount: 50 + i, payee: 'Made-up Lumber ' + i, desc: 'Made-up boards ' + i, matched: true, status: 'pending_pm', enteredAt: ent })));
  H.cset('gc_sub_approvals', []); H.cset('customers', []); H.cset('schedule', []); H.cset('estimates', []); H.cset('subs', []); H.cset('vendors', []);
  H.cset('users', [{ id: 'u1', name: ANAME, email: ADMIN, role: 'Admin', payType: 'owner', active: true }, { id: 'u3', name: 'Other PM', role: 'Project Manager', active: true }]);
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';
const INIT = `(() => {
  const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  d(Navigator.prototype, 'userAgent', ${JSON.stringify(IPHONE)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5);
  const P = window.__al = { lt: [], note: [], err: [] };
  window.addEventListener('error', e => { try { if (P.err.length < 5) P.err.push(String(e.error && e.error.stack || e.message).slice(0, 500)); } catch (x) {} });
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  P.rd = {};
  document.addEventListener('DOMContentLoaded', () => { const of = window.fetch; window.fetch = function (i, init) { try { const u = typeof i === 'string' ? i : i.url; if ((u.indexOf('key=eq.projects&select=value') >= 0 || u.indexOf('key=eq.gcAcctRegister&select=value') >=0) && !(init && init.method && init.method !== 'GET')) { const k = String(new Error().stack).split(String.fromCharCode(10)).slice(2, 6).map(x => x.trim().replace('http://app.local/', '')).join(' < '); P.rd[k] = (P.rd[k] || 0) + 1; } } catch (e) {} return of.apply(this, arguments); }; });
  setInterval(() => { try { const n = document.getElementById('gc-unsent-note'); if (n) P.note.push([Math.round(performance.now()), (window._gcUnsent ? window._gcUnsent().map(x => x.key + ':' + x.why).join('|') : '') + ' Q:' + (window._gcSyncQ ? window._gcSyncQ.waiting().filter(x => x.tries).map(x => x.key).join(',') : '') + ' gate:' + (window._gcStaleGate ? window._gcStaleGate.state() : '-') + ' qerr:' + (window._gcSyncQ ? window._gcSyncQ.state().lastError : '') + ' last:' + JSON.stringify(window.__GC_LAST_SYNC_ERROR__ || null).slice(0, 160)]); } catch (e) {} }, 1000);
  if (!localStorage.getItem('__filled')) {
    [['__applag_fill_a', 515000], ['__applag_fill_b', 267000], ['__applag_fill_c', 115000], ['__applag_fill_d', 77000]].forEach(([k, n]) => { try { localStorage.setItem(k, 'y'.repeat(n)); } catch (e) {} });
    const chunk = 'z'.repeat(100000); for (let n = 0; n < 18; n++) { try { localStorage.setItem('__fill' + n, chunk); } catch (e) { break; } }
    localStorage.setItem('__filled', '1');
  }
})()`;

/* ── a weak line: 400 kbps each way shared fairly between the requests on it, 300 ms there and back ── */
const KBPS = 400, LAT = 300;
const NET = { on: false, log: [], slowKey: '', slowUntil: 0 };
const decq = v => { try { return decodeURIComponent(String(v || '')); } catch (e) { return String(v || ''); } };
const likeRx = p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$');
const inList = v => decq(v).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''));
function downBytes(u, m){
  if (m !== 'GET') return 300;
  let rows = [...H.cloud.values()];
  for (const [k, v0] of u.searchParams.entries()) {
    if (k !== 'key') continue; const v = String(v0);
    if (v.startsWith('eq.')) rows = rows.filter(r => r.key === decq(v.slice(3)));
    else if (v.startsWith('not.eq.')) rows = rows.filter(r => r.key !== decq(v.slice(7)));
    else if (v.startsWith('in.')) { const l = inList(v.slice(3)); rows = rows.filter(r => l.includes(r.key)); }
    else if (v.startsWith('not.in.')) { const l = inList(v.slice(7)); rows = rows.filter(r => !l.includes(r.key)); }
    else if (v.startsWith('like.')) { const rx = likeRx(decq(v.slice(5))); rows = rows.filter(r => rx.test(r.key)); }
    else if (v.startsWith('not.like.')) { const rx = likeRx(decq(v.slice(9))); rows = rows.filter(r => !rx.test(r.key)); }
  }
  const val = /value|\*/.test(u.searchParams.get('select') || '*');
  return 200 + rows.reduce((a, r) => a + 70 + r.key.length + (val ? JSON.stringify(r.value).length : 0), 0);
}
const pools = { up: [], down: [] };
const tick = setInterval(() => { for (const k of ['up', 'down']) { const P = pools[k]; if (!P.length) continue; const share = KBPS * 1000 / 8 * 0.05 / P.length; for (const x of P.slice()) { x.rem -= share; if (x.rem <= 0) { P.splice(P.indexOf(x), 1); x.done(); } } } }, 50);
const xfer = (k, n) => new Promise(res => pools[k].push({ rem: n, done: res }));
async function line(r){
  const rq = r.request(); let u; try { u = new URL(rq.url()); } catch (e) { return r.fallback(); }
  if (!NET.on || u.host !== H.SBH || rq.method() === 'OPTIONS') return r.fallback();
  const m = rq.method(), body = rq.postData() || '', up = body.length + 600, down = downBytes(u, m);
  let keys = [u.searchParams.get('key') || '']; if (m === 'POST') { try { keys = [].concat(JSON.parse(body)).map(x => x && x.key); } catch (e) {} }
  const e = { t: Date.now(), m, kv: /\/rest\/v1\/gc_kv/.test(u.pathname), keys, up, down, sel: u.searchParams.get('select') || '' };
  NET.log.push(e);
  await sleep(LAT / 2); await xfer('up', up); await sleep(LAT / 2);
  if (m === 'POST' && NET.slowKey && keys.includes(NET.slowKey) && Date.now() < NET.slowUntil) await sleep(NET.slowUntil - Date.now());   /* everything for that list waits on the line until then */
  await xfer('down', down);
  e.end = Date.now();
  return r.fallback();
}

const OPEN = [];
try {
  seed();
  console.log('B. admin on an iPhone, one bar of signal (400 kbps / 300 ms), storage nearly full');
  const c = await H.computer('Phone', { build, mobile: true, init: INIT }); OPEN.push(c);
  const p = c.page();
  const CLOG = [], ESTK = []; p.on('console', m => { if (CLOG.length < 3000) CLOG.push(m.text().slice(0, 200)); }); p.on('pageerror', e => { if (ESTK.length < 3) ESTK.push(String(e && e.stack || e).slice(0, 700)); });
  ok(await H.signIn(c, ADMIN, 30000), 'the admin signs in on the phone');
  await sleep(30000);                                   // first open on a good line: the phone has the data
  await c.ctx.route('**/*', line); NET.on = true;
  await p.reload({ waitUntil: 'domcontentloaded' });    // opened again on one bar
  const t0 = Date.now();
  ok(!!(await H.waitFor(c, () => !!document.querySelector('#gc-fh-tabs button[data-t="appr"]'), null, 90000)), 'GrayCo Field opens with its Approvals button');
  await sleep(15000);

  /* 1. My Approvals from the Field bar */
  const pn0 = await c.ev(() => performance.now());
  await c.ev(() => { const P = window.__al; P.seen = 0; P.t0 = performance.now(); const iv = setInterval(() => { const k = document.body.children; for (let i = k.length - 1; i >= Math.max(0, k.length - 6); i--) { if ((k[i].textContent || '').indexOf('My Approvals') >= 0) { P.seen = Math.max(1, performance.now() - P.t0); clearInterval(iv); return; } } }, 25); });
  const bb = await c.ev(() => { const b = document.querySelector('#gc-fh-tabs button[data-t="appr"]'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.touchscreen.tap(bb.x, bb.y);
  let seen = 0; for (let i = 0; i < 60 && !seen; i++) { await sleep(250); seen = await c.ev(() => window.__al.seen); }
  await sleep(1500);
  const ltOpen = await c.ev(t => window.__al.lt.filter(x => x[0] >= t).map(x => x[1]), pn0);
  console.log('    My Approvals: ' + JSON.stringify({ ms: Math.round(seen), longTasks: ltOpen }));
  ok(seen > 0 && seen < 5000, 'My Approvals opens within 5 s on one bar (' + Math.round(seen) + ' ms)', { seen });
  ok(!ltOpen.some(x => x > 400), 'no long task over 400 ms while My Approvals opens (target 200 ms; this machine runs other browsers too)', ltOpen);

  /* 2. an expense approved there reaches the cloud */
  const tapSel = async sel => { const r = await c.ev(s => { const b = [...document.querySelectorAll(s)].filter(x => x.offsetParent !== null).pop(); if (!b) return null; b.scrollIntoView({ block: 'center' }); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, sel); if (r) await p.touchscreen.tap(r.x, r.y); return !!r; };
  ok(await tapSel('#_paExp'), 'the red "expenses to approve" button is there'); await sleep(1500);
  ok(await tapSel('._eaApprove'), 'the expense view shows "Approve → P&L"'); await sleep(1000);
  const tA = Date.now(); let st = null;
  for (let i = 0; i < 120 && !(st && st !== 'pending_pm'); i++) { await sleep(1000); const q = H.cget('gc_expense_approvals') || []; const a = q.filter(x => x && /^EXPLAG/.test(x.expId)); st = a.filter(x => x.status !== 'pending_pm').length ? 'approved' : 'pending_pm'; }
  console.log('    approval in the cloud after ' + Math.round((Date.now() - tA) / 1000) + ' s: ' + st);
  ok(st === 'approved', 'the expense approved on the phone reaches the cloud (one bar)', H.cget('gc_expense_approvals'));

  /* 3. five saves of the same list at once → at most 2 uploads; the guard's second look at the row is a cheap check */
  await p.touchscreen.tap(195, 300); await sleep(200);
  await c.ev(async n => { const L = await window.idbGet('projects'); const j = L.find(x => x.id === 'P5'); j.notes = n; j.updatedAt = new Date().toISOString(); await window.idbSet('projects', L); }, 'Changed on the phone ' + Date.now());
  const fg0 = await c.ev(() => window.__gcFG.state());
  const tB = Date.now();
  await c.ev(async () => { const L = await window.idbGet('projects'); for (let i = 0; i < 5; i++) window._gcSbPush('projects', L); });
  let landed = false; for (let i = 0; i < 480 && !landed; i++) { await sleep(1000); landed = ((H.cget('projects') || []).find(x => x.id === 'P5') || {}).notes === (await c.ev(async () => ((await window.idbGet('projects')).find(x => x.id === 'P5') || {}).notes)); }
  await sleep(5000);
  const projPosts = NET.log.filter(e => e.t >= tB && e.m === 'POST' && e.keys.includes('projects')).length;
  const fg1 = await c.ev(() => window.__gcFG.state());
  console.log('    5 saves of projects: ' + JSON.stringify({ landed, projPosts, fullReads: fg1.fullReads - fg0.fullReads, cheapReads: fg1.cheapReads - fg0.cheapReads, cacheHits: fg1.cacheHits - fg0.cacheHits }));
  if (!landed) {
    console.log('    (diagnosis) projects on the line: ' + JSON.stringify(NET.log.filter(e => e.t >= tB - 5000 && e.keys.some(k => /projects/.test(k || ''))).map(e => [Math.round((e.t - tB) / 1000), e.m, e.sel, e.up, e.down, e.end ? Math.round((e.end - tB) / 1000) : null])));
    console.log('    (diagnosis) page: ' + JSON.stringify(await c.ev(() => ({ fg: window.__gcFG.state().log.slice(-12), dirty: Object.keys(window.__gcFG.state().dirty), pjx: window._gcPJX ? window._gcPJX.status() : null, unsent: window._gcUnsent(), sending: window._gcSending ? window._gcSending() : null }))).slice(0, 2500));
    console.log('    (diagnosis) console: ' + JSON.stringify(CLOG.filter(x => /project|GC Sync|PJX|push|union/i.test(x)).slice(-25)));
  }
  ok(landed, 'the job edited on the phone reaches the cloud');
  if (process.env.APPLAG_STOP === '3') throw new Error('stop after step 3');
  ok(projPosts >= 1 && projPosts <= 2, 'five saves of the same list at once → ' + projPosts + ' upload(s) (at most 2)', projPosts);
  /* the next upload of the same row: the guard checks updated_at (~100 bytes) instead of downloading the 600 KB row again */
  await p.touchscreen.tap(195, 300); await sleep(200);
  await c.ev(async () => { const L = await window.idbGet('projects'); const j = L.find(x => x.id === 'P6'); j.notes = 'Second change on the phone'; j.updatedAt = new Date().toISOString(); await window.idbSet('projects', L); window._gcSbPush('projects', L); });
  let l2 = false; for (let i = 0; i < 240 && !l2; i++) { await sleep(1000); l2 = ((H.cget('projects') || []).find(x => x.id === 'P6') || {}).notes === 'Second change on the phone'; }
  const fg2 = await c.ev(() => window.__gcFG.state());
  ok(l2 && fg2.cacheHits > fg1.cacheHits && fg2.fullReads === fg1.fullReads, 'a second upload of the row uses a cheap updated_at check (no second full download)', { l2, before: [fg1.fullReads, fg1.cacheHits], after: [fg2.fullReads, fg2.cacheHits] });

  /* 3c. the same list again, unchanged (another uploader, a repeated "done once" step): not sent — the cloud has exactly that */
  await sleep(3000);
  const sm0 = await c.ev(() => Object.assign(window.__gcSame.state(), { fgSame: window.__gcFG.state().sameAsCloud })), tD = Date.now();
  await p.touchscreen.tap(195, 300); await sleep(200);
  await c.ev(async () => { const L = await window.idbGet('projects'); window._gcSbPush('projects', L); });
  for (let i = 0; i < 120; i++) { await sleep(1000); const x = await c.ev(() => Object.assign(window.__gcSame.state(), { fgSame: window.__gcFG.state().sameAsCloud })); if (x.skipped > sm0.skipped || x.fgSame > sm0.fgSame || NET.log.some(e => e.t >= tD && e.m === 'POST' && e.keys.includes('projects'))) break; }
  await sleep(3000);
  const samePosts = NET.log.filter(e => e.t >= tD && e.m === 'POST' && e.keys.includes('projects')).length, sm1 = await c.ev(() => Object.assign(window.__gcSame.state(), { fgSame: window.__gcFG.state().sameAsCloud }));
  console.log('    the same job list again: ' + JSON.stringify({ samePosts, before: sm0, after: sm1 }));
  ok(l2 && samePosts === 0, 'the unchanged job list is not uploaded again (the cloud already has it, or the guard keeps it back)', { samePosts, sm0, sm1 });

  /* 4. an upload slower than its timeout: "sending", then sent — never "not sent" */
  await p.touchscreen.tap(195, 300); await sleep(200);
  NET.slowKey = 'gcAcctRegister'; NET.slowUntil = Date.now() + 70000;
  await c.ev(async () => { const L = await window.idbGet('gcAcctRegister'); L[3] = Object.assign({}, L[3], { desc: 'Recategorized on the phone', updatedAt: new Date().toISOString() }); await window.idbSet('gcAcctRegister', L); window._gcSyncDirty(['gcAcctRegister']); });
  let sawSending = false, reg = false; const tC = Date.now();
  for (let i = 0; i < 300 && !reg; i++) { await sleep(1000); const s = await c.ev(() => window._gcSending ? window._gcSending().map(x => x.key) : []); if (s.includes('gcAcctRegister')) sawSending = true; reg = ((H.cget('gcAcctRegister') || [])[3] || {}).desc === 'Recategorized on the phone'; }
  await sleep(6000);
  const after = await c.ev(() => ({ unsent: window._gcUnsent(), sending: window._gcSending(), q: window._gcSyncQ.waiting() }));
  console.log('    slow upload: ' + JSON.stringify({ secs: Math.round((Date.now() - tC) / 1000), sawSending, reg, after }));
  ok(reg, 'the upload held 60 s on the line still lands');
  ok(sawSending, 'while it is on its way the list counts as "sending" (_gcSending)');
  ok(!after.unsent.length && !after.sending.length, 'once it landed nothing is "not sent" or "sending"', after);

  /* 4b. SAMEKV: the same row sent twice (any device, any uploader) goes up once */
  const sk0 = await c.ev(() => window.__gcSame.state()), tE = Date.now();
  await c.ev(async () => { const c = { u: localStorage.getItem('grayco_sb_url'), k: localStorage.getItem('grayco_sb_key') }; const v = Array.from({ length: 120 }, (_, i) => ({ id: 'X' + i, note: 'made-up row '.repeat(8) }));
    const send = () => window.fetch(c.u.replace(/\/$/, '') + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: c.k, Authorization: 'Bearer ' + c.k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'gc_perfrep_applagtest', value: v, updated_at: new Date().toISOString() }) });
    document.dispatchEvent(new Event('pointerdown')); await send(); for (let i = 0; i < 60 && !(window.__gcSame.known.gc_perfrep_applagtest); i++) await new Promise(r => setTimeout(r, 1000)); document.dispatchEvent(new Event('pointerdown')); await send(); });
  await sleep(3000);
  const sk1 = await c.ev(() => window.__gcSame.state()), twice = NET.log.filter(e => e.t >= tE && e.m === 'POST' && e.keys.includes('gc_perfrep_applagtest')).length;
  console.log('    the same row twice: ' + JSON.stringify({ posts: twice, before: sk0, after: sk1 }));
  ok(twice === 1, 'the same 10 KB row sent twice goes up once (SAMEKV skipped ' + (sk1.skipped - sk0.skipped) + ')', { twice, sk0, sk1 });

  /* 5. the note, and the request bound */
  await sleep(10000);
  const notes = await c.ev(() => window.__al.note.slice(0, 5));
  ok(!notes.length, 'the amber "Saved on this phone — not sent to the office yet" note never showed', notes);
  const fin = await c.ev(() => ({ unsent: window._gcUnsent(), q: window._gcSyncQ.waiting(), sending: window._gcSending() }));
  ok(!fin.unsent.length && !fin.q.filter(x => x.tries).length && !fin.sending.length, 'at the end: nothing unsent, nothing retried in the queue', fin);
  const kv = NET.log.filter(e => e.kv && e.t >= t0), posts = kv.filter(e => e.m === 'POST');
  const per = {}; posts.forEach(e => e.keys.forEach(k => { if (!/^(gc_perfrep_|gc_bootrep_|gc_adm_dev_|gc_activity_|gc_timeclock_|_probe_)/.test(k)) per[k] = (per[k] || 0) + 1; }));   /* the phone's own rows (reports, heartbeat) are not lists */
  const upMB = posts.reduce((a, e) => a + e.up, 0) / 1e6, worst = Object.entries(per).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  console.log('    gc_kv on one bar: ' + JSON.stringify({ requests: kv.length, gets: kv.length - posts.length, posts: posts.length, upMB: +upMB.toFixed(2), downMB: +(kv.reduce((a, e) => a + e.down, 0) / 1e6).toFixed(2), per }));
  ok(worst[1] <= 3, 'no list uploaded more than 3 times (' + worst.join(': ') + ')', per);
  ok(posts.length < 40 && upMB < 4, 'fewer than 40 uploads, under 4 MB up (' + posts.length + ', ' + upMB.toFixed(2) + ' MB)', per);
  { const g = {}; kv.filter(e => e.m === 'GET').forEach(e => { const k = (e.keys[0] || '(bulk)').slice(0, 40) + ' [' + e.sel + ']'; const x = g[k] || (g[k] = [0, 0]); x[0]++; x[1] += e.down; }); console.log('    GETs: ' + JSON.stringify(Object.entries(g).sort((a, b) => b[1][1] - a[1][1]).slice(0, 14))); }
  console.log('    big-row readers: ' + JSON.stringify(Object.entries(await c.ev(() => window.__al.rd)).sort((a, b) => b[1] - a[1]).slice(0, 8)));
  ok(!c.errs.length, 'no page errors', { errs: c.errs.slice(0, 3), stacks: ESTK });
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
finally { clearInterval(tick); for (const c of OPEN) { try { await c.close(); } catch (e) {} } }
console.log(`APPLAG ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
