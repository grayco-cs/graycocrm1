// test_DESKTAPS.mjs <build-dir> [roles] [desk|phone] — patch NICKFREEZE: the desk CRM, tab by tab, the way each person uses it,
// measuring the main thread. Owner 11/22: "Everything is lagging and freezing on everyone's screen".
// For each role (nick · wesley · office · pm · est · crew · marketing): sign in, open the CRM (desk 1440×900, CPU ×2; or a
// phone 390×844, CPU ×4, switched to the desk view as an owner does), then click EVERY tab of the left menu, and on each tab up
// to DT_BTNS of its main buttons (destructive ones are listed, never pressed). For each step:
//   • tap response = the Event Timing duration of the click (input → the next frame), in ms;
//   • the long tasks (PerformanceObserver 'longtask') from the click until the page has been quiet for 1 s (at most 12 s):
//     the worst one, how many over 500 ms / 1 s, their sum.
// A step with a long task over DT_MAX ms (default 1000) or a tap response over DT_TAPMAX ms (default 1000) is a FAIL.
// Data: the read-only snapshot of the company's rows when one is in the scratchpad (DT_SNAP=<dir>; DT_SNAP=none for the
// made-up company-sized data below) — loaded into the offline harness's fake cloud; nothing leaves the machine.
// Out: one line per step, a per-role summary table, JSON in DT_OUT (default scratchpad/dt/out). Exit 1 on any FAIL.
// Usage: node test_DESKTAPS.mjs <build> [nick,wesley,office,pm,est,crew,marketing|all] [desk|phone]
//   DT_BTNS buttons per tab (4) · DT_TABS regex of tab labels · DT_CPU · DT_MAX · DT_TAPMAX · DT_BUDGET seconds per role (1300)
import fs from 'fs'; import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCR = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs').href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_DESKTAPS.mjs <build> [roles|all] [desk|phone]'); process.exit(2); }
const ALL = ['nick', 'wesley', 'office', 'pm', 'est', 'crew', 'marketing'];
const ROLES = (process.argv[3] || 'all') === 'all' ? ALL : process.argv[3].split(',');
const DEV = process.argv[4] || 'desk';
const PHONE = DEV === 'phone';
const CPU = +(process.env.DT_CPU || (PHONE ? 4 : 2));
const BTNS = +(process.env.DT_BTNS || 4), MAXMS = +(process.env.DT_MAX || 1000), TAPMAX = +(process.env.DT_TAPMAX || 1000), BUDGET = +(process.env.DT_BUDGET || 1300);
const TABRX = process.env.DT_TABS ? new RegExp(process.env.DT_TABS, 'i') : null;
const OUT = process.env.DT_OUT || path.join(SCR, 'dt/out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = H.sleep;
const DESTRUCT = /sign ?out|log ?out|delete|remove|🗑|reset|wipe|erase|purge|void|archive|deactivat|clear (all|cloud|data)|forget|fresh start|uninstall|merge|deny|reject|discard|terminate|send|text |e-?mail|post|publish|charge|pay |refund|approve|import|upload|print|download|export|backup|restore|sync now|connect|disconnect|install|update now|reload|refresh/i;

/* ── the data: the scratchpad snapshot, else a made-up company of the same size ── */
let snapDir = process.env.DT_SNAP;
const L = await import(pathToFileURL(path.join(path.resolve(build), 'tools/qa/qa_lib.mjs')).href).catch(() => null);
if (snapDir === undefined && L) snapDir = L.latestSnap(path.join(SCR, 'qa/snap')) || 'none';
const useSnap = L && snapDir && snapDir !== 'none' && fs.existsSync(path.join(snapDir, 'rows.ndjson'));
const CREW = { email: 'crew.demo@example.test', name: 'Demo Crew', role: 'Superintendent' };
let WHO = {};
function seed(){
  if (useSnap) {
    const snap = L.readSnap(snapDir); L.loadIntoHarness(H, snap); L.accountsFromSnap(H, snap);
    const users = (snap.get('users') || []).filter(u => u && u.email && u.active !== false);
    const by = (rx, pref) => { const l = users.filter(u => rx.test(u.role || '')); return (l.find(u => pref && pref.test(u.email)) || l[0] || {}).email; };
    WHO = { nick: by(/^admin$/i, /^nthomas@/) , wesley: by(/^admin$/i, /^wjohnson@/), office: by(/office/i, /^office@/), pm: by(/project manager/i), est: by(/estimator/i), marketing: by(/marketing/i), crew: CREW.email };
    const us = H.cget('users'); const arr = typeof us === 'string' ? JSON.parse(us) : (us || []);
    if (!arr.some(u => u && u.email === CREW.email)) { arr.push({ id: 'u-crewdemo', name: CREW.name, email: CREW.email, role: CREW.role, active: true, phone: '9015550199' }); H.cset('users', arr); }
    H.ACCOUNTS[CREW.email] = { id: 'u-crewdemo', name: CREW.name, role: 'staff' };
    return 'snapshot ' + path.basename(snapDir) + ' (' + snap.rows.length + ' rows)';
  }
  H.resetCloud();
  const people = [['nick', 'nick.demo@example.test', 'Demo Owner Nick', 'Admin', 'admin'], ['wesley', 'wesley.demo@example.test', 'Demo Owner Wes', 'Admin', 'admin'],
    ['office', 'office.demo@example.test', 'Office Demo', 'Office Admin', 'office'], ['pm', 'pm.demo@example.test', 'Demo PM', 'Project Manager', 'staff'],
    ['est', 'est.demo@example.test', 'Demo Estimator', 'Estimator', 'staff'], ['crew', CREW.email, CREW.name, CREW.role, 'staff'], ['marketing', 'mkt.demo@example.test', 'Demo Marketing', 'Marketing Manager', 'staff']];
  for (const k of Object.keys(H.ACCOUNTS)) delete H.ACCOUNTS[k];
  people.forEach(([k, e, n, r, a], i) => { WHO[k] = e; H.ACCOUNTS[e] = { id: 'u-demo' + i, name: n, role: a }; });
  H.cset('users', people.map(([k, e, n, r], i) => ({ id: 'u-demo' + i, name: n, email: e, role: r, active: true, payType: k === 'nick' || k === 'wesley' ? 'owner' : 'hourly', phone: '901555010' + i })));
  const iso = d => new Date(Date.now() - d * 864e5).toISOString(), day = d => iso(d).slice(0, 10);
  const pj = [], ld = [], sc = [], es = [], iv = [];
  for (let i = 0; i < 480; i++) pj.push({ id: 'PB' + i, name: 'Demo Job ' + i, client: 'Demo Client ' + i, address: i + ' Demo St', autoPO: 'A' + (100 + i), pm: i % 2 ? 'Demo PM' : 'Demo Owner Wes', estimator: 'Demo Estimator', status: i % 3 ? 'completed' : 'active', contract: 10000 + i * 37, contractSigned: true, createdAt: iso(i % 300), updatedAt: iso(i % 30) });
  for (let i = 0; i < 1200; i++) ld.push({ id: 'LB' + i, name: 'Demo lead ' + i, client: 'Demo Lead ' + i, type: 'Residential Reno', stage: i % 4 ? 'Lost' : 'New Lead', phone: '90155' + String(10000 + i), estimator: 'Demo Estimator', createdAt: iso(i % 250), updatedAt: iso(i % 250) });
  for (let i = 0; i < 2500; i++) sc.push({ id: 'SB' + i, pid: 'PB' + (i % 480), projectId: 'PB' + (i % 480), date: day(60 - (i % 120)), start: day(60 - (i % 120)), end: day(60 - (i % 120)), title: 'Demo work ' + i, crew: [CREW.name] });
  for (let i = 0; i < 600; i++) es.push({ id: 'E' + i, name: 'Demo estimate ' + i, pid: 'PB' + (i % 480), status: i % 2 ? 'Sent' : 'Draft', lines: [{ id: 'l' + i, desc: 'Demo line', qty: 1, cost: 100, price: 150 }], totalCost: 100, totalCharge: 150, createdAt: iso(i % 200), updatedAt: iso(i % 200) });
  for (let i = 0; i < 900; i++) iv.push({ id: 'I' + i, type: i % 3 ? 'client' : 'sub', pid: 'PB' + (i % 480), client: 'Demo Client ' + (i % 480), invNum: String(7000 + i), amt: 1000 + i, date: day(i % 300), dueDate: day((i % 300) - 30), status: i % 2 ? 'paid' : 'sent' });
  H.cset('projects', pj); H.cset('leads', ld); H.cset('schedule', sc); H.cset('estimates', es); H.cset('invs', iv);
  H.cset('gc_office_tasks', JSON.stringify(Array.from({ length: 800 }, (_, i) => ({ id: 'T' + i, text: 'Demo task ' + i, done: i % 3 === 0, createdAt: iso(i % 90), assignee: 'Demo PM', pid: 'PB' + (i % 480) }))));
  return 'made-up data (480 jobs, 1200 leads, 2500 schedule rows, 600 estimates, 900 invoices)';
}

/* ── in the page: long tasks and Event Timing ── */
const INIT = `(() => { const Q = window.__dt = { lt: [], ev: [] };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) Q.lt.push({ t: e.startTime, ms: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) Q.ev.push({ n: e.name, t: e.startTime, ms: Math.round(e.duration) }); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch (e) {}
  try { new MutationObserver(l => { for (const m of l) for (const n of m.addedNodes) if (n.nodeType === 1 && /^\\u26D4 WRONG SITE/.test(n.textContent || '')) n.remove(); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  if (${PHONE}) { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
    d(Navigator.prototype, 'userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1'); d(Navigator.prototype, 'maxTouchPoints', 5); }
})()`;
/* the left menu: clickable rows in the sidebar column */
const MENU = () => {
  const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 30 || r.height < 14) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.1; };
  const side = [...document.querySelectorAll('nav, aside, div')].filter(e => { const r = e.getBoundingClientRect(); return r.left <= 2 && r.width >= 150 && r.width <= 330 && r.height > innerHeight * 0.6 && vis(e); }).sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
  if (!side) return [];
  const seen = new Set(), out = [];
  side.querySelectorAll('*').forEach(e => {
    if (!vis(e) || e.closest('[data-dt-skip]')) return;
    const cs = getComputedStyle(e); if (cs.cursor !== 'pointer' || (e.parentElement && getComputedStyle(e.parentElement).cursor === 'pointer')) return;
    const t = (e.innerText || '').replace(/\s+/g, ' ').trim(); if (!t || t.length > 40 || seen.has(t)) return; seen.add(t);
    const r = e.getBoundingClientRect(); out.push({ label: t, x: r.left + Math.min(r.width / 2, 90), y: r.top + r.height / 2 });
  });
  return out;
};
/* the main buttons of the screen now (outside the menu): the first few distinct ones */
const BUTTONS = ([n, rxs]) => {
  const rx = new RegExp(rxs, 'i');
  const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.1; };
  const minX = innerWidth > 700 ? 250 : 0, out = [], seen = new Set(), skipped = [];
  for (const e of document.querySelectorAll('button,[role=button],[role=tab]')) {
    if (!vis(e) || e.disabled) continue; const r = e.getBoundingClientRect(); if (r.left < minX || r.top < 40) continue;
    const t = (e.getAttribute('aria-label') || e.innerText || e.title || '').replace(/\s+/g, ' ').trim().slice(0, 40); if (!t || seen.has(t)) continue; seen.add(t);
    if (rx.test(t)) { skipped.push(t); continue; }
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!h || !(h === e || e.contains(h))) continue;
    out.push({ label: t, x: r.left + r.width / 2, y: r.top + r.height / 2 }); if (out.length >= n) break;
  }
  return { out, skipped };
};

async function runRole(role){
  const T0 = Date.now(), rows = [];
  const email = WHO[role];
  if (!email || !H.ACCOUNTS[email]) { console.log(`— ${role}: no such person in the data (skipped)`); return { role, skipped: true, rows }; }
  const A = await H.computer('DT-' + role, { build, mobile: PHONE, viewport: PHONE ? { width: 390, height: 844 } : { width: 1440, height: 900 }, init: [INIT] });
  A.acceptConfirm = false;
  const pg = A.page(); const cdp = await A.ctx.newCDPSession(pg);
  const throttle = () => cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }).catch(() => {});
  const popups = []; A.ctx.on('page', p => { if (p !== pg) popups.push(p); });
  pg.on('filechooser', () => {});
  const now = () => pg.evaluate(() => performance.now());
  const quiet = async (t0, minMs) => {   /* until the page has had no long task for 1 s (at most 12 s) */
    const w0 = Date.now(); await sleep(minMs || 1200);
    while (Date.now() - w0 < 12000) { const last = await pg.evaluate(t => { const l = window.__dt.lt.filter(x => x.t >= t); const e = l.length ? l[l.length - 1] : null; return e ? performance.now() - (e.t + e.ms) : performance.now() - t; }, t0).catch(() => 1e9); if (last > 1000) break; await sleep(300); }
  };
  const measure = async (t0) => pg.evaluate(t => { const Q = window.__dt; const lt = Q.lt.filter(x => x.t >= t); const ev = Q.ev.filter(x => x.t >= t - 5 && /^(click|pointerdown|pointerup|mousedown|mouseup|touchstart|touchend|keydown)$/.test(x.n));
    return { worst: lt.reduce((a, b) => Math.max(a, b.ms), 0), n500: lt.filter(x => x.ms > 500).length, n1s: lt.filter(x => x.ms > 1000).length, sum: lt.reduce((a, b) => a + b.ms, 0), tap: ev.reduce((a, b) => Math.max(a, b.ms), 0), view: (function(){ try { return localStorage.getItem('grayco_view') || ''; } catch (e) { return ''; } })() }; }, t0).catch(() => null);
  const log = (screen, what, m, note) => {
    const bad = m && (m.worst > MAXMS || m.tap > TAPMAX);
    rows.push({ role, dev: DEV, screen, what, ...(m || {}), result: !m ? 'SKIP' : bad ? 'FAIL' : 'OK', note: note || '' });
    console.log(`  ${((Date.now() - T0) / 1000).toFixed(0).padStart(4)}s ${!m ? '·' : bad ? '✗' : '✓'} [${role}/${DEV}] ${screen} · ${what}` + (m ? ` — tap ${m.tap} ms, worst task ${m.worst} ms, >500 ms ×${m.n500}, >1 s ×${m.n1s}, sum ${m.sum} ms` : '') + (note ? ' — ' + note : ''));
  };
  const tap = async (x, y) => { if (PHONE) await pg.touchscreen.tap(x, y); else await pg.mouse.click(x, y); };
  const closeExtra = async () => {
    await pg.keyboard.press('Escape').catch(() => {});
    while (popups.length) { const p = popups.pop(); await p.close().catch(() => {}); }
    if (!/^http:\/\/app\.local\/?(#.*)?$/.test(pg.url())) { await pg.goto('http://app.local/', { waitUntil: 'domcontentloaded' }).catch(() => {}); await throttle(); await H.waitFor(A, () => typeof window._setView === 'function', null, 120000); await sleep(4000); }
  };
  try {
    const ok = await H.signIn(A, email, 90000);
    await throttle();
    if (!ok) { log('(open)', 'sign in', null, 'did not sign in'); throw new Error('nosign'); }
    /* the open: a reload the way the person opens the app, measured from the start */
    await pg.reload({ waitUntil: 'domcontentloaded', timeout: 180000 }); await throttle();
    await H.waitFor(A, () => typeof window._setView === 'function' && !!document.querySelector('#root *'), null, 150000);
    if (PHONE) { await H.waitFor(A, () => typeof window._gcChooseView === 'function', null, 60000); await pg.evaluate(() => { try { window._gcChooseView('desk'); } catch (e) {} }); }
    await quiet(0, 6000);
    log('(open)', 'open the CRM' + (PHONE ? ' → desk view' : ''), await measure(0));
    let menu = await pg.evaluate(MENU);
    if (!menu.length && PHONE) {   /* the phone's desk view: the menu sits behind ☰ */
      const hb = await pg.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(e => /^(☰|≡|menu)$/i.test((e.innerText || e.getAttribute('aria-label') || '').trim())); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      if (hb) { await tap(hb.x, hb.y); await sleep(800); menu = await pg.evaluate(MENU); }
    }
    if (TABRX) menu = menu.filter(m => TABRX.test(m.label));
    console.log(`— ${role}/${DEV}: ${menu.length} menu tabs: ${menu.map(m => m.label).join(' · ')}`);
    if (!menu.length) log('(menu)', 'the left menu', null, 'no menu found');
    for (const tab of menu) {
      if ((Date.now() - T0) / 1000 > BUDGET) { log(tab.label, '(tab)', null, 'time budget used up (DT_BUDGET ' + BUDGET + ' s)'); continue; }
      const openTab = async () => {
        let m = await pg.evaluate(MENU); let it = m.find(x => x.label === tab.label);
        if (!it && PHONE) { const hb = await pg.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(e => /^(☰|≡|menu)$/i.test((e.innerText || e.getAttribute('aria-label') || '').trim())); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); if (hb) { await tap(hb.x, hb.y); await sleep(700); m = await pg.evaluate(MENU); it = m.find(x => x.label === tab.label); } }
        if (!it) return null;
        const t0 = await now(); await tap(it.x, it.y); await quiet(t0, 1500); return await measure(t0);
      };
      const m = await openTab().catch(() => null);
      if (!m) { log(tab.label, '(tab)', null, 'not in the menu any more'); await closeExtra(); continue; }
      log(tab.label, '(tab) → ' + m.view, m);
      const b = await pg.evaluate(BUTTONS, [BTNS, DESTRUCT.source]).catch(() => ({ out: [], skipped: [] }));
      for (const [i, btn] of b.out.entries()) {
        if (i) { const m2 = await openTab().catch(() => null); if (!m2) break; }
        const cur = await pg.evaluate(BUTTONS, [BTNS, DESTRUCT.source]).catch(() => ({ out: [] }));
        const it = cur.out.find(x => x.label === btn.label) || null;
        if (!it) { log(tab.label, btn.label, null, 'not on the screen when the tab was reopened'); continue; }
        const t0 = await now(); await tap(it.x, it.y); await quiet(t0, 1200);
        log(tab.label, btn.label, await measure(t0));
        await closeExtra();
      }
      if (b.skipped.length) log(tab.label, '(not pressed)', null, b.skipped.slice(0, 8).join(' · '));
    }
  } catch (e) { if (!/nosign/.test(String(e))) log('(run)', '(test)', null, 'threw: ' + String(e && e.message || e).slice(0, 200)); }
  const errs = A.errs.slice(0, 5);
  await A.close().catch(() => {});
  return { role, rows, errs };
}

const what = seed();
console.log(`DESKTAPS ${path.basename(path.resolve(build))} · ${DEV} (${PHONE ? '390×844' : '1440×900'}, CPU ×${CPU}) · ${what}`);
const res = [];
for (const r of ROLES) { seed(); res.push(await runRole(r)); }
const all = res.flatMap(r => r.rows);
fs.writeFileSync(path.join(OUT, `desktaps_${DEV}_${ROLES.join('-')}.json`), JSON.stringify({ build, dev: DEV, cpu: CPU, data: what, res }, null, 1));
console.log('\n| role | device | steps | worst task (ms) | tasks > 1 s | tasks > 500 ms | worst tap (ms) | open: worst task | FAIL |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of res) {
  const m = r.rows.filter(x => x.result !== 'SKIP'); if (!m.length) { console.log(`| ${r.role} | ${DEV} | 0 | – | – | – | – | – | ${r.skipped ? 'not in data' : '–'} |`); continue; }
  const w = m.reduce((a, b) => b.worst > a.worst ? b : a), tp = m.reduce((a, b) => b.tap > a.tap ? b : a), op = m.find(x => x.screen === '(open)');
  console.log(`| ${r.role} | ${DEV} | ${m.length} | ${w.worst} (${w.screen} · ${w.what.slice(0, 30)}) | ${m.reduce((a, b) => a + b.n1s, 0)} | ${m.reduce((a, b) => a + b.n500, 0)} | ${tp.tap} (${tp.screen} · ${tp.what.slice(0, 24)}) | ${op ? op.worst : '–'} | ${m.filter(x => x.result === 'FAIL').length} |`);
}
const fails = all.filter(x => x.result === 'FAIL');
console.log(`\nDESKTAPS: ${all.filter(x => x.result !== 'SKIP').length} steps, ${fails.length} FAIL`);
for (const f of fails) console.log(`  FAIL [${f.role}/${f.dev}] ${f.screen} · ${f.what}: worst task ${f.worst} ms, tap ${f.tap} ms`);
process.exit(fails.length ? 1 : 0);
