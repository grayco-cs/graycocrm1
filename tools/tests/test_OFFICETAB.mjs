// test_OFFICETAB.mjs <build-dir> <mirror.json> [base-build-dir] — patch OFFICETAB in a real browser on a READ-ONLY mirror of the
// production data (a JSON array of { key, value|v, updated_at } rows; customer data: keep it OUTSIDE git). Every network call is
// answered by the offline harness (nothing leaves this computer, nothing is written to production).
//   1. idle cost (only with [base-build-dir], e.g. r14d): the admin signs in on each build and the Office tab is never opened;
//      the requests per minute and the live setInterval timers must not grow, and the device read never happens.
//   2. admin, CPU x4 (CPU env): open 🏢 Office -> the office person's To-Do and "What the office did" are drawn, the longest
//      task while opening is under 1 s (MAXTASK); 🧭 Helpers and 👥 Team the same; "＋ Task for the office" saves into
//      gc_office_tasks (cloud) in the shape of the other assigned to-dos.
//   3. the office signs in on another computer: the new task is on her To-Do under "Yours" (mine), she has 📰 Activity and
//      🧭 Helpers but no 🏢 Office oversight and no 👥 Team.
//   4. a PM: nothing new (level none, no new tabs).
// Env: GC_HARNESS (offline harness, default the wME one), CPU (4), MAXTASK (1000), IDLE_MS (60000), SKIP_PM=1.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SP + '/wME/harness.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const { computer, sleep, cloud, ACCOUNTS, cget } = H;
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3], BASE = process.argv[4] && path.resolve(process.argv[4]);
if (!BUILD || !MIRROR) { console.error('usage: node test_OFFICETAB.mjs <build-dir> <mirror.json> [base-build-dir]'); process.exit(2); }
const CPU = +(process.env.CPU || 4), MAXTASK = +(process.env.MAXTASK || 1000), IDLE_MS = +(process.env.IDLE_MS || 60000);
ACCOUNTS['office@grayco-cs.com'].role = 'office';            /* production: gc_staff role "office" */
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
function loadCloud(){ cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at }); }
let pass = 0, fail = 0;
function ok(cond, name, info){ if (cond) { pass++; console.log('PASS ' + name + (info ? '  ' + info : '')); } else { fail++; console.log('FAIL ' + name + (info ? '  ' + info : '')); } }

/* every computer: long tasks and the setInterval timers, from the first script on */
async function instrument(c){
  await c.ctx.addInitScript(() => {
    window.__LT = []; window.__IV = { made: 0, live: 0, ids: new Set() };
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__LT.push({ t: e.startTime, ms: e.duration }))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
    const si = window.setInterval, ci = window.clearInterval;
    window.setInterval = function(){ const id = si.apply(this, arguments); window.__IV.made++; window.__IV.ids.add(id); return id; };
    window.clearInterval = function(id){ window.__IV.ids.delete(id); return ci.apply(this, arguments); };
  });
}
async function boot(name, build, email){
  const c = await computer(name, { build }); await instrument(c);
  const p = c.page(); await p.setViewportSize({ width: 1366, height: 800 });
  await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 120000 }); await sleep(1500);
  for (let i = 0; i < 5; i++) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); if ((await p.locator('#gc-auth-email').inputValue()) === email) break; }
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const t0 = Date.now(); let up = false;
  while (Date.now() - t0 < 150000) { up = await c.page().evaluate(() => !!(window._crm && (window._crm.projects || []).length > 50 && window.gcOfficeManager && window._gcTD2 && document.querySelector('nav button, aside button'))).catch(() => false); if (up) break; await sleep(1000); }
  return { c, up };
}
const ev = (c, f, a) => c.page().evaluate(f, a);
async function longest(c, since){ return ev(c, s => window.__LT.filter(x => x.t >= s).reduce((m, x) => Math.max(m, x.ms), 0), since); }
async function nowMs(c){ return ev(c, () => performance.now()); }
async function waitEv(c, f, a, ms){ const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await ev(c, f, a).catch(() => null); if (v) return v; await sleep(250); } return v; }

/* ── 1. idle cost, the tab never opened ── */
async function idle(build, label){
  loadCloud();
  const { c, up } = await boot('idle-' + label, build, 'wjohnson@grayco-cs.com');
  await sleep(+(process.env.SETTLE || 30000));
  const n0 = c.log.length, iv0 = await ev(c, () => ({ made: window.__IV.made, live: window.__IV.ids.size }));
  await sleep(IDLE_MS);
  const reqs = c.log.slice(n0), iv1 = await ev(c, () => ({ made: window.__IV.made, live: window.__IV.ids.size }));
  const dev = c.log.filter(x => /gc_adm_dev_\*|like\.gc_adm_dev/.test(x.q || '') && x.method === 'GET').length;
  const opened = await ev(c, () => !!document.querySelector('[data-ot-tab]'));
  const hist = {}; reqs.forEach(x => { const k = x.method + ' ' + x.path + ' ' + (/key=(eq|like|in)\.([^&]{0,40})/.exec(x.q || '') || ['', '', x.key1 || ''])[2]; hist[k] = (hist[k] || 0) + 1; });
  await c.b.close();
  return { hist, up, perMin: Math.round(reqs.length * 60000 / IDLE_MS), live: iv1.live, made: iv1.made - iv0.made, dev, opened };
}
if (BASE) {
  let a, b; if (process.env.NEW_FIRST) { b = await idle(BUILD, 'new'); a = await idle(BASE, 'base'); } else { a = await idle(BASE, 'base'); b = await idle(BUILD, 'new'); }
  const keys = [...new Set(Object.keys(a.hist).concat(Object.keys(b.hist)))].map(k => [k, a.hist[k] || 0, b.hist[k] || 0]).filter(x => x[1] !== x[2]).sort((x, y) => Math.abs(y[2] - y[1]) - Math.abs(x[2] - x[1])).slice(0, 12);
  delete a.hist; delete b.hist;
  console.log('idle  base', JSON.stringify(a), '\nidle  new ', JSON.stringify(b), '\nidle  differs (path base new):', JSON.stringify(keys));
  ok(a.up && b.up, 'idle: both builds signed in');
  /* r14e against itself swings ~16 % a minute (background lead / estimate syncs land in or out of the window): 25 % */
  ok(b.perMin <= a.perMin + Math.max(5, Math.round(a.perMin * 0.25)), 'idle: requests per minute with the tab never opened (within the run-to-run swing)', 'new ' + b.perMin + ' vs base ' + a.perMin);
  ok(b.live <= a.live, 'idle: no extra live setInterval timers', 'new ' + b.live + ' vs r14d ' + a.live);
  ok(b.dev === 0 && !b.opened, 'idle: the Office tab code never ran (no device read, nothing drawn)');
}

if (process.env.ONLY_IDLE) { console.log('RESULT ' + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0); }
/* ── 2. the admin ── */
loadCloud();
const A = (await boot('admin', BUILD, 'wjohnson@grayco-cs.com'));
ok(A.up, 'admin signed in on the real data');
const ac = A.c;
await sleep(25000);
const cd = await ac.ctx.newCDPSession(ac.page());
if (CPU > 1) await cd.send('Emulation.setCPUThrottlingRate', { rate: CPU });
let s0 = await nowMs(ac);
await ev(ac, () => window._setView('officemanager'));
const drawn = await waitEv(ac, () => { const h = document.querySelector('#gc-td2-as .td2-body'); const f = document.querySelector('[data-ot-feed="office"]'); return !!(h && h.children.length && f && !/Reading the records/.test(f.textContent)); }, null, 30000);
await sleep(3000);
let lt = await longest(ac, s0);
ok(!!drawn, 'admin: 🏢 Office shows the office To-Do and the feed');
ok(lt < MAXTASK, 'admin: longest task opening 🏢 Office at ' + CPU + 'x CPU < ' + MAXTASK + ' ms', Math.round(lt) + ' ms');
const info = await ev(ac, () => ({ st: window._gcOfficeTab.state(), who: (document.querySelector('#gc-td2-as .td2-who') || {}).textContent, chips: (document.querySelector('#gc-td2-as .td2-strip') || {}).textContent,
  secs: [...document.querySelectorAll('#gc-td2-as .td2-st')].map(x => x.textContent), feed: document.querySelectorAll('[data-ot-feed="office"] .ot-ev').length, feedTxt: (document.querySelector('[data-ot-feed="office"]') || {}).textContent.slice(0, 160),
  tabs: [...document.querySelectorAll('#gc-om-page .om-tab')].map(b => b.textContent.trim()), needs: !!document.querySelector('#om-tab-overview') }));
console.log('      ', JSON.stringify(info).slice(0, 900));
ok(/office/.test(info.who || '') && info.needs, 'admin: the To-Do is the office person’s, and 📊 Overview (What needs you today) is still a tab');
/* the feed with every day: something the office really did shows */
await ev(ac, () => { const s = document.querySelector('[data-ot-f="office|day"]'); s.value = '30'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await sleep(400);
const feed30 = await ev(ac, () => ({ n: document.querySelectorAll('[data-ot-feed="office"] .ot-ev').length, more: !!document.querySelector('[data-ot-more="office"]'), txt: [...document.querySelectorAll('[data-ot-feed="office"] .ot-ev')].slice(0, 3).map(x => x.textContent.slice(0, 90)) }));
console.log('       feed (30 days):', JSON.stringify(feed30));
ok(feed30.n <= 50, 'admin: the feed shows at most 50 at a time', feed30.n + ' rows' + (feed30.more ? ' + Show more' : ''));
for (const [tab, sel, name] of [['ot_help', '[data-ot-board="pm"] .ot-pcard, [data-ot-board="pm"] .ot-empty:not(:empty)', '🧭 Helpers'], ['ot_team', '[data-ot-team] .ot-tbl', '👥 Team']]) {
  s0 = await nowMs(ac);
  await ev(ac, t => window.gcOfficeManager.tab(t), tab);
  const d = await waitEv(ac, q => { const e = document.querySelector(q); return !!e && !/Reading/.test(e.textContent); }, sel, 30000);
  await sleep(2500);
  lt = await longest(ac, s0);
  ok(!!d, 'admin: ' + name + ' drawn');
  ok(lt < MAXTASK, 'admin: longest task opening ' + name + ' at ' + CPU + 'x CPU < ' + MAXTASK + ' ms', Math.round(lt) + ' ms');
}
const boards = await ev(ac, () => { const T = window._gcOfficeTab; const c = (l, g) => l.map(r => r.name + ':' + g.map(k => r.g[k].length).join('/')); return { est: c(T.estBoard(), ['due', 'notsent', 'nofu', 'nc']), pm: c(T.pmBoard(), ['nc', 'behind', 'nolog', 'punch', 'stale']).slice(0, 8), ncHub: window._gcLeadNC ? 'shared' : 'missing', team: (document.querySelector('[data-ot-team]') || {}).textContent.slice(0, 300) }; });
console.log('       boards', JSON.stringify(boards).slice(0, 900));
ok(boards.ncHub === 'shared', 'the PM board uses the Leads page’s Not contacted test');
/* "who hasn't checked Approvals today": absent without window._gcApprovalsCheckedToday, drawn from it when it is there */
const apc0 = await ev(ac, () => !!document.querySelector('[data-ot-apc]'));
await ev(ac, () => { window._gcApprovalsCheckedToday = () => Promise.resolve([{ name: 'Steven Biffle', email: 'sbiffle@grayco-cs.com', waiting: 2, lastSeen: new Date(Date.now() - 864e5).toISOString(), checkedToday: false }, { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', waiting: 0, lastSeen: new Date().toISOString(), checkedToday: true }]); window.gcOfficeManager.tab('ot_help'); });
const apc = await waitEv(ac, () => { const e = document.querySelector('[data-ot-apc]'); return e && /Haven’t checked/.test(e.textContent) ? e.textContent : null; }, null, 5000);
await ev(ac, () => { delete window._gcApprovalsCheckedToday; });
ok(!apc0 && /Steven Biffle/.test(apc || '') && !/Wesley/.test(apc || ''), 'who hasn’t checked Approvals today (only when _gcApprovalsCheckedToday exists)', (apc || '').slice(0, 90));
/* Remind (a To-Do for that person) */
const rem = await ev(ac, () => { window.gcOfficeManager.tab('ot_help'); return new Promise(r => setTimeout(() => { const b = document.querySelector('[data-ot-rem]:not([disabled])'); if (!b) return r(null); const who = b.getAttribute('data-whon'); b.click(); r({ who, txt: b.textContent }); }, 400)); });
await sleep(1500);
if (rem) { const r = cloudTasks().filter(t => t && t.remindKey && t.assignee === rem.who); ok(r.length >= 1 && /Reminded/.test(rem.txt), 'Remind: a To-Do for ' + rem.who + ' in gc_office_tasks', r[0] && r[0].label.slice(0, 80)); }
else console.log('       (no line to remind on this data)');
/* ＋ Task for the office */
await ev(ac, () => window.gcOfficeManager.tab('ot_office'));
await sleep(800);
const LABEL = 'OFFICETAB test — call the supplier ' + Date.now().toString(36);
await ev(ac, () => document.querySelector('[data-ot-a="task-new"]').click());
await sleep(500);
await ac.page().locator('#ot-f-label').fill(LABEL);
await ac.page().locator('#ot-f-note').fill('made by the test');
await ac.page().selectOption('#ot-f-prio', 'high');
const td = new Date(); const due = td.getFullYear() + '-' + String(td.getMonth() + 1).padStart(2, '0') + '-' + String(td.getDate()).padStart(2, '0');
await ac.page().locator('#ot-f-due').fill(due);
await ev(ac, () => document.querySelector('[data-ot-a="task-save"]').click());
await sleep(3000);
function cloudTasks(){ let v = cget('gc_office_tasks'); for (let i = 0; i < 2 && typeof v === 'string'; i++) { try { v = JSON.parse(v); } catch (e) { break; } } return Array.isArray(v) ? v : []; }
const rec = cloudTasks().filter(t => t && t.label === LABEL)[0];
ok(!!rec && rec.assignees && rec.assignees[0] === 'office@grayco-cs.com' && rec.kind === 'assigned' && rec.personal === true && rec.due === due && rec.prio === 'high' && !rec.done, '＋ Task for the office: saved in gc_office_tasks for the office', rec ? JSON.stringify({ assignees: rec.assignees, assignee: rec.assignee, kind: rec.kind, prio: rec.prio, due: rec.due, addedBy: rec.addedBy }) : 'not in the cloud');
const inAs = await waitEv(ac, l => [...document.querySelectorAll('#gc-td2-as .td2-ti')].some(x => x.textContent === l), LABEL, 8000);
ok(!!inAs, 'admin: the new task is on the office’s To-Do on the tab');
if (CPU > 1) await cd.send('Emulation.setCPUThrottlingRate', { rate: 1 });
ok(ac.errs.filter(e => /officetab|ot-|_gcOfficeTab|asState|clickH/i.test(e)).length === 0, 'admin: no page errors from this patch', ac.errs.slice(0, 3).join(' | '));

if (process.env.ONLY_TIMING) { await A.c.b.close(); console.log('RESULT ' + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0); }
/* ── 3. the office ── */
const O = await boot('office', BUILD, 'office@grayco-cs.com');
ok(O.up, 'office signed in');
await sleep(15000);
const off = await waitEv(O.c, l => { try { const st = window._gcTD2.state(); const it = st.items.filter(x => x.title === l)[0]; return it ? { mine: it.mine, due: it.dueCls, prio: it.prio, count: st.counts.mine } : null; } catch (e) { return null; } }, LABEL, 30000);
ok(!!off && off.mine, 'office: the task is on her To-Do as hers (📌 Yours)', JSON.stringify(off));
await ev(O.c, () => window._setView('officemanager'));
await sleep(5000);
const otabs = await ev(O.c, () => ({ level: window._gcOfficeTab.state().level, tabs: [...document.querySelectorAll('#gc-om-page .om-tab')].map(b => b.id) }));
console.log('       office tabs', JSON.stringify(otabs));
ok(otabs.level === 'office' && !otabs.tabs.includes('om-tab-ot_team') && !otabs.tabs.includes('om-tab-ot_office'), 'office: no admin sections (no 👥 Team, no 🏢 Office oversight)');
ok(otabs.tabs.includes('om-tab-ot_help') && otabs.tabs.includes('om-tab-todo'), 'office: her own ✅ To-Do as before, plus 🧭 Helpers');
await O.c.b.close();

/* ── 4. a PM ── */
if (!process.env.SKIP_PM) {
  const P = await boot('pm', BUILD, 'sbiffle@grayco-cs.com');
  await sleep(8000);
  const pm = await ev(P.c, () => ({ level: window._gcOfficeTab ? window._gcOfficeTab.state().level : 'none', tabs: document.querySelectorAll('[id^="om-tab-ot_"]').length }));
  ok(P.up && pm.level === 'none' && pm.tabs === 0, 'PM: nothing new', JSON.stringify(pm));
  await P.c.b.close();
}
await A.c.b.close();
console.log('RESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
