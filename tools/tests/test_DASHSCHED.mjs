// test_DASHSCHED.mjs <build-dir> <mirror.json> — patch DASHSCHED in a real browser on a READ-ONLY mirror of the production data
// (a JSON array of { key, value|v, updated_at } rows; customer data: keep it OUTSIDE git), served by the offline harness
// (nothing leaves this computer). A few schedule items for the next days and two suppliers with expired insurance are added
// to the mirror's copy in memory, so the role rules and the supplier rule have something to bite on.
//   owner (admin, 1440x900): the 📅 Schedule card sits where the alerts grid was (above Active jobs), the old schedule cards
//     are folded, the insurance card is BELOW Active jobs and titled "Sub insurance — expired / expiring", expired rows are
//     red + "expired", soonest / most overdue first, no supplier row, the ✉ (if any) kept; an item opens its job; leaving
//     and coming back to the dashboard redraws it in the same frame (no frame with the grid on top); idle = no mutations;
//     the observer's longest run < 200 ms and no long task > 200 ms while the dashboard is redrawn; the admin Desk home has
//     one 📅 Schedule card; "Full CRM" still shows the classic dashboard with the card.
//   PM (Steven Biffle): "My schedule" with only his jobs' items (not the owner's, not the owner's personal item).
// Env: GC_HARNESS (default wN/harness_N.mjs), SHOT (after screenshot path), MAXTASK (200).
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, sleep, cloud, ACCOUNTS, waitFor } = H;
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3];
if (!BUILD || !MIRROR) { console.error('usage: node test_DASHSCHED.mjs <build-dir> <mirror.json>'); process.exit(2); }
const MAXTASK = +(process.env.MAXTASK || 200), SHOT = process.env.SHOT || '';
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
const ymd = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const T = 'DSTEST ';
const ADD_SCHED = [
  { id: 'SCH_DS1', pid: 'PRJ0sx249j6n8v', date: ymd(0), time: '09:00', type: 'inspection', title: T + 'ROTC Cordova — Framing inspection', assignee: 'Wesley Johnson', by: 'Wesley Johnson' },
  { id: 'SCH_DS2', pid: 'PRJn03ikrm783z', date: ymd(1), time: '08:00', type: 'work', title: T + 'Ginger ford — Gutter return visit', assignee: 'Steven Biffle', by: 'Wesley Johnson' },
  { id: 'SCH_DS3', pid: 'PRJcc_117464230', date: ymd(2), time: '10:30', type: 'appointment', title: T + 'Easley Transportation — Site visit', assignee: '', by: 'Automations' },
  { id: 'SCH_DS4', pid: 'PRJ0sx249j6n8v', date: ymd(1), time: '15:00', type: 'reminder', scope: 'personal', title: T + 'Owner personal item', assignee: 'Wesley Johnson', by: 'Wesley Johnson' },
  { id: 'SCH_DS5', pid: 'PRJ3el70ml164', date: ymd(3), time: '07:30', type: 'sub_work', title: T + 'Loch Meade — Drywall', assignee: 'Nick Thomas', by: 'Nick Thomas' }];
const OWNER_SEES = ['SCH_DS1', 'SCH_DS2', 'SCH_DS3', 'SCH_DS4', 'SCH_DS5'], PM_SEES = ['SCH_DS2', 'SCH_DS3'];
const SUPPLIERS = [{ id: 'VDS_SUP1', name: 'DSTEST Lumber Supply', isSub: false, cat: 'Lumber', insExp: ymd(-40) }, { id: 'VDS_SUP2', name: 'DSTEST Materials Co', type: 'Supplier', insExp: ymd(-5) }];
function loadCloud(){
  cloud.clear();
  for (const r of rows) {
    let v = r.value !== undefined ? r.value : r.v;
    if (r.key === 'schedule' && Array.isArray(v)) v = v.concat(ADD_SCHED);
    if (r.key === 'subs' && Array.isArray(v)) v = v.concat(SUPPLIERS);
    cloud.set(r.key, { key: r.key, value: v, updated_at: r.updated_at });
  }
}
ACCOUNTS['sbiffle@grayco-cs.com'].role = 'staff';
let pass = 0, fail = 0;
function ok(cond, name, info){ if (cond) { pass++; console.log('PASS ' + name + (info ? '  ' + info : '')); } else { fail++; console.log('FAIL ' + name + (info ? '  ' + info : '')); } }

async function boot(email){
  loadCloud();
  const c = await computer(email.slice(0, 2), { build: BUILD });
  await c.ctx.addInitScript(() => {
    try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
    window.__LT = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__LT.push({ t: e.startTime, ms: e.duration }))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  });
  const p = c.page(); await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 120000 }); await sleep(1500);
  await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click();
  await waitFor(c, () => (window._crm && window._crm.projects || []).length > 5 && document.querySelector('aside nav button'), null, 180000, 500);
  await sleep(12000);
  return c;
}
async function toDashboard(c){
  await c.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a=full]'); if (b && b.offsetParent) b.click(); });
  await sleep(800);
  await c.ev(() => window._setView('dashboard'));
  await waitFor(c, () => !!document.getElementById('gc-dsched') && document.getElementById('gc-dsched').isConnected, null, 30000, 250);
  await sleep(1500);
}
/* the dashboard's layout as the person sees it: each card's top / bottom on the page */
const layout = c => c.ev(() => {
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), shown: r.height > 0 && getComputedStyle(el).display !== 'none' }; };
  const h1 = document.querySelector('#root h1'), host = h1 && h1.parentElement.parentElement.parentElement;
  const card = document.getElementById('gc-dsched'), jobs = document.querySelector('[data-gc-jobs]');
  const grid = host && [...host.children].find(e => e.style.display === 'grid' && [...e.querySelectorAll('b')].some(b => /Budget Alerts|insurance/i.test(b.textContent)));
  const ins = grid && [...grid.children].find(k => /insurance/i.test((k.querySelector('b') || {}).textContent || ''));
  const kids = host ? [...host.children] : [];
  const old = kids.filter(e => { const b = e.querySelector('b'); const t = b ? b.textContent : ''; return /^📅 /.test(t) && (/ Week — /.test(t) || /^📅 (Company|My) Schedule$/.test(t)); });
  const own = b => [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim();
  const insRows = ins ? [...ins.children].filter(e => e.tagName === 'DIV' && e.querySelector('b')).map(e => { const r = e.getBoundingClientRect(); return { name: own(e.querySelector('b')), txt: e.textContent, shown: r.height > 0, top: Math.round(r.top), exp: e.hasAttribute('data-gc-ds-exp'), color: getComputedStyle(e).color, mail: !!e.querySelector('button,a,[title]') }; }) : [];
  return { h1: h1 && h1.textContent, card: box(card), cardNextIsGrid: !!(card && grid && card.nextElementSibling === grid), cardNextIsJobs: !!(card && jobs && card.nextElementSibling === jobs),
    jobs: box(jobs), grid: box(grid), ins: box(ins), insTitle: ins ? ins.querySelector('b').textContent : null, insRows, oldShown: old.filter(e => box(e).shown).length, oldN: old.length,
    cardText: card ? card.innerText : '', rowsPid: card ? [...card.querySelectorAll('[data-gc-ds-pid]')].map(b => b.getAttribute('data-gc-ds-pid')) : [] };
});

/* ═════ owner ═════ */
let c = await boot('wjohnson@grayco-cs.com');
const desk = await c.ev(() => ({ on: !!(window._gcRA && window._gcRA.state().desk), n: document.querySelectorAll('#gc-ra-desk [data-card="sched"]').length, txt: ((document.querySelector('#gc-ra-desk [data-card="sched"]') || {}).innerText || '').slice(0, 400) }));
if (desk.on) { ok(desk.n === 1 && /DSTEST ROTC Cordova/.test(desk.txt), 'admin Desk home: one 📅 Schedule card with the week\'s items', JSON.stringify(desk).slice(0, 300)); }
else console.log('note: the owner opened on the classic dashboard (no Desk home on this build/profile)');
await toDashboard(c);
/* two suppliers with expired insurance into the CRM's own sub / vendor list (the mirror's list comes from its chunks), then
   the dashboard is drawn again from it */
const inj = await c.ev(sup => { const a = window._crm.subs; if (!Array.isArray(a)) return -1; sup.forEach(x => { if (!a.some(y => y && y.id === x.id)) a.push(x); }); return a.length; }, SUPPLIERS);
await c.ev(() => window._setView('projects')); await sleep(1500); await c.ev(() => window._setView('dashboard'));
await waitFor(c, () => !!document.getElementById('gc-dsched') && document.getElementById('gc-dsched').isConnected, null, 30000, 250); await sleep(1200);
let L = await layout(c);
console.log('owner layout', JSON.stringify({ h1: L.h1, card: L.card, jobs: L.jobs, grid: L.grid, ins: L.ins, oldN: L.oldN, oldShown: L.oldShown }));
ok(L.card && L.card.shown && (L.cardNextIsGrid || L.cardNextIsJobs), 'the 📅 Schedule card sits where the alerts grid was (just before it in the page)');
ok(L.card && L.jobs && L.card.bottom <= L.jobs.top + 1, 'the Schedule card is above Active jobs', L.card && L.jobs ? L.card.bottom + ' <= ' + L.jobs.top : '');
ok(L.ins && L.jobs && L.ins.top >= L.jobs.bottom - 1, 'the insurance card is BELOW Active jobs', L.ins && L.jobs ? L.ins.top + ' >= ' + L.jobs.bottom : JSON.stringify(L.ins));
ok(L.insTitle === 'Sub insurance — expired / expiring', 'the insurance card is titled "Sub insurance — expired / expiring"', L.insTitle);
ok(L.oldN >= 1 && L.oldShown === 0, 'the old schedule cards lower down are folded (one schedule card on the dashboard)', L.oldN + ' old, ' + L.oldShown + ' shown');
for (const id of OWNER_SEES) ok(L.cardText.indexOf(ADD_SCHED.find(x => x.id === id).title) >= 0, 'owner sees ' + id);
ok(/Full schedule/.test(L.cardText), 'the card has "Full schedule →"');
const shownIns = L.insRows.filter(r => r.shown);
console.log('insurance rows', JSON.stringify(shownIns.map(r => r.txt)));
const today = ymd(0);
ok(shownIns.length >= 1, 'the insurance card lists subs', String(shownIns.length));
ok(L.insRows.filter(r => /DSTEST/.test(r.name)).length === 2, 'fixture: the two suppliers reach the React insurance list', 'subs ' + inj + ', ' + JSON.stringify(L.insRows.map(r => r.name)));
ok(!L.insRows.some(r => r.shown && /DSTEST/.test(r.name)), 'no supplier in the insurance card (isSub:false / type Supplier)', JSON.stringify(L.insRows.filter(r => /DSTEST/.test(r.name)).map(r => [r.name, r.shown])));
const expRows = shownIns.filter(r => r.exp);
ok(expRows.length >= 1 && expRows.every(r => /expired/i.test(r.txt) && /rgb\(185, 28, 28\)/.test(r.color)), 'expired rows are red and say "expired"', expRows.length + ' expired');
ok(shownIns.filter(r => !r.exp).every(r => !/expired/i.test(r.txt)), 'rows not yet expired do not say "expired"');
const tops = shownIns.map(r => r.top), sorted = tops.every((t, i) => !i || t > tops[i - 1]);
const order = await c.ev(() => { const ins = document.querySelector('[data-gc-ds-ins]'); if (!ins) return null; return [...ins.children].filter(e => e.tagName === 'DIV' && getComputedStyle(e).display !== 'none').sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(e => { const n = [...e.querySelector('b').childNodes].filter(x => x.nodeType === 3).map(x => x.nodeValue).join('').trim(); const r = (window._crm.subs || []).find(x => x && x.name === n); return r ? String(r.insExp).slice(0, 10) : '?'; }); });
ok(order && order.every((d, i) => !i || d >= order[i - 1]), 'soonest / most overdue first', JSON.stringify(order));
/* an item opens its job */
const opened = await c.ev(async () => {
  let got = null; const f = window._gcJobDashboard; window._gcJobDashboard = function(id){ got = id; };
  const b = document.querySelector('#gc-dsched [data-gc-ds-pid="PRJ0sx249j6n8v"]'); if (b) b.click();
  window._gcJobDashboard = f; return got;
});
ok(opened === 'PRJ0sx249j6n8v', 'clicking an item opens its job', String(opened));
/* leave and come back: in every painted frame the card is already above the jobs card (no flicker) */
await c.ev(() => window._setView('projects')); await sleep(2500);
const away = await c.ev(() => window._gcDashSched.state());
ok(!away.rootObs, 'off the dashboard: no #root-wide observer (only the parent childList one)', JSON.stringify(away));
await c.ev(() => { window.__FR = []; window.__LT.length = 0; const t0 = performance.now(); const tick = () => { const j = document.querySelector('[data-gc-jobs]'), card = document.getElementById('gc-dsched'), g = document.querySelector('[data-gc-ds-grid]');
  if (j) window.__FR.push({ t: Math.round(performance.now() - t0), h1: (document.querySelector('#root h1') || {}).textContent, ds: window._gcDashSched.state().runs, card: !!(card && card.isConnected), above: !!(card && card.getBoundingClientRect().bottom <= j.getBoundingClientRect().top + 1), gridBelow: !g || g.getBoundingClientRect().top >= j.getBoundingClientRect().bottom - 1 });
  if (performance.now() - t0 < 4000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); window._setView('dashboard'); });
await sleep(4500);
const fr = await c.ev(() => ({ n: window.__FR.length, bad: window.__FR.filter(f => !f.card || !f.above || !f.gridBelow).length, badAt: window.__FR.map((f, i) => [i, f]).filter(([i, f]) => !f.card || !f.above || !f.gridBelow).slice(0, 4), lt: window.__LT.map(x => Math.round(x.ms)), st: window._gcDashSched.state() }));
ok(fr.n > 0 && fr.bad === 0, 'coming back to the dashboard: every painted frame already has the new layout (no flicker)', JSON.stringify({ frames: fr.n, bad: fr.bad, badAt: fr.badAt }));
ok(fr.st.maxMs < MAXTASK, 'the observer\'s longest run < ' + MAXTASK + ' ms', 'max ' + fr.st.maxMs + ' ms, avg ' + fr.st.avgMs + ' ms over ' + fr.st.runs + ' runs');
/* idle: nothing written by the patch, no loop */
const idle = await c.ev(() => new Promise(done => { const r0 = window._gcDashSched.state().runs; let n = 0; const h = document.querySelector('[data-gc-ds-host]');
  const o = new MutationObserver(ms => { ms.forEach(m => { const t = m.target; if (t.id === 'gc-dsched' || (t.closest && t.closest('#gc-dsched,[data-gc-ds-ins]')) || [...m.addedNodes].some(x => x.id === 'gc-dsched')) n++; }); });
  o.observe(h, { subtree: true, childList: true, attributes: true, characterData: true });
  setTimeout(() => { o.disconnect(); done({ muts: n, runs: window._gcDashSched.state().runs - r0 }); }, 10000); }));
ok(idle.muts === 0 && idle.runs <= 6, 'idle 10 s on the dashboard: the patch writes nothing and does not loop', JSON.stringify(idle));
/* no long task over MAXTASK ms from the observer: force 20 full redraws (new signature every time) and time them */
const forced = await c.ev(max => { const lt0 = window.__LT.length; const t = []; for (let i = 0; i < 20; i++) { const card = document.getElementById('gc-dsched'); card.innerHTML = ''; const a = performance.now(); window._gcDashSched.restore(); window._gcDashSched.apply(); t.push(performance.now() - a); } return { max: Math.round(Math.max(...t)), lt: window.__LT.slice(lt0).map(x => Math.round(x.ms)).filter(x => x > max) }; }, MAXTASK);
ok(forced.max < MAXTASK && !forced.lt.length, 'a full redraw by the observer stays under ' + MAXTASK + ' ms (no long task from it)', JSON.stringify(forced));
await sleep(500);
L = await layout(c);
ok(L.card && L.card.shown && L.ins && L.ins.top >= L.jobs.bottom - 1, 'after the redraws the layout is the same');
if (SHOT) { await c.ev(() => { [...document.querySelectorAll('button')].filter(b => /^Skip — just a meeting$/.test(b.textContent.trim()) && b.offsetParent).forEach(b => b.click()); window.scrollTo(0, 0); }); await sleep(300); await c.page().screenshot({ path: SHOT }); console.log('screenshot ' + SHOT); }
/* kill switch */
const ks = await c.ev(async () => { localStorage.setItem('gc_dashsched_off', '1'); window._gcDashSched.apply(); const a = { card: !!document.getElementById('gc-dsched'), host: !!document.querySelector('[data-gc-ds-host]') }; localStorage.removeItem('gc_dashsched_off'); window._gcDashSched.apply(); return a; });
ok(!ks.card && !ks.host, 'kill switch gc_dashsched_off=1 puts the dashboard back as React drew it', JSON.stringify(ks));
const errs1 = c.errs.slice(); ok(!errs1.length, 'owner: no page errors', errs1.slice(0, 3).join(' | '));
await c.b.close();

/* ═════ PM ═════ */
c = await boot('sbiffle@grayco-cs.com');
await toDashboard(c);
L = await layout(c);
console.log('pm layout', JSON.stringify({ h1: L.h1, card: L.card, jobs: L.jobs, grid: L.grid, ins: L.ins, rowsPid: L.rowsPid }));
ok(L.card && L.card.shown, 'PM: the 📅 Schedule card is on his dashboard', L.h1);
ok(/My schedule/.test(L.cardText), 'PM: titled "My schedule"');
for (const x of ADD_SCHED) { const sees = L.cardText.indexOf(x.title) >= 0; ok(sees === PM_SEES.includes(x.id), 'PM ' + (PM_SEES.includes(x.id) ? 'sees' : 'does not see') + ' ' + x.id + ' (' + x.title.slice(T.length, T.length + 30) + ')'); }
const pmJobs = await c.ev(() => { const its = window._gcDashSched.items(); const P = {}; (window._crm.projects || []).forEach(p => { P[p.id] = p; }); return its.wk.concat(its.next).map(x => [x.pid, x.pid && P[x.pid] ? P[x.pid].pm : '', x.title]); });
ok(pmJobs.every(([pid, pm]) => !pid || /biffle/i.test(pm)), 'PM: every item with a job is one of his jobs', JSON.stringify(pmJobs).slice(0, 300));
if (L.jobs && L.ins) ok(L.ins.top >= L.jobs.bottom - 1, 'PM: the insurance card (if shown) is below his jobs');
ok(!c.errs.length, 'PM: no page errors', c.errs.slice(0, 3).join(' | '));
await c.b.close();
console.log(`DASHSCHED ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
