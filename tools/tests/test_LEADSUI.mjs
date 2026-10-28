// test_LEADSUI.mjs <build-dir> — patch LEADSUI: the Leads screen rebuilt.
//   Opens on 📋 List / All (never a remembered filter, also after a reload); the 5 views Board · List · Calendar · Map ·
//   Outreach on top and every round trip back to List (Outreach too, and its own "Back to Leads"); chips toggle and
//   ✕ Clear; the three count boxes toggle; columns + header sort (default soonest due, then priority); due colours and
//   "time not stated"; distance (miles on rows, Within N mi, Distance sort, a lazy geocode); priority set from the list
//   and from the panel shows at once and is saved; the panel's order; 🗑 delete stays deleted after a reload and on a
//   2nd computer; the Bids chip shows Lead Inbox bids; the old Bid Board is gone and its open bids became leads once;
//   ⋯ More holds the rarely used items; phone layout; no page errors; idle 60 s → no DOM change on the Leads screen;
//   open / click timings.
// Offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs), made-up demo data only
// (GC_DEMO_SEED, default wDEMO/seed.mjs). GC_SHOTS=<dir> saves screenshots. GC_IDLE=<s> (default 60).
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, cset, cget, signIn, mclick } = await import(pathToFileURL(HARNESS).href);
const { seedDemo } = await import(pathToFileURL(process.env.GC_DEMO_SEED || SPD + '/wDEMO/seed.mjs').href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_LEADSUI.mjs <dir with index.html>'); process.exit(2); }
const SHOTS = process.env.GC_SHOTS || '';
const IDLE = +(process.env.GC_IDLE || 60);
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
const T = {};

/* ── made-up data ── */
seedDemo();
const pad = n => String(n).padStart(2, '0');
const local = (ms, time) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + (time ? 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : ''); };
const H = 3600e3, now = Date.now(), ago = h => new Date(now - h * H).toISOString();
const LD = (id, o) => Object.assign({ id, name: id, stage: 'New Lead', status: 'new', createdAt: ago(48), updatedAt: ago(48) }, o);
const BC = { source: 'BuildingConnected', leadKind: 'Commercial', estimator: 'Sample Estimator' };
const LEADS = [
  LD('L_over', Object.assign({ name: 'Demo Overdue Warehouse', address: '1 Late Rd', city: 'Memphis', bidDue: local(now - 50 * H, true), dueToCompany: 'Solo Late Builders Inc', inboxId: 'LI-over', inboxRev: 1 }, BC)),
  LD('L_soon', Object.assign({ name: 'Demo Soon Clinic', address: '2 Soon St', city: 'Bartlett', bidDue: local(now + 30 * H, true), priority: 3, dueToCompany: 'A & B Construction Co., Inc.' }, BC)),
  LD('L_tieA', Object.assign({ name: 'Demo Tie Low', bidDue: local(now + 4 * 24 * H, true), priority: 2, dueToCompany: 'Tie GC' }, BC)),
  LD('L_tieB', Object.assign({ name: 'Demo Tie High', bidDue: local(now + 4 * 24 * H, true), priority: 9, dueToCompany: 'Tie GC' }, BC)),
  LD('L_date', Object.assign({ name: 'Demo Date Only School', bidDue: local(now + 5 * 24 * H), dueToCompany: 'Date GC LLC' }, BC)),
  LD('L_lib1', Object.assign({ name: 'Demo Library Expansion', address: '3 Book Ave', bidDue: local(now + 6 * 24 * H, true), dueToCompany: 'A & B Construction Co., Inc.' }, BC)),
  LD('L_lib2', Object.assign({ name: 'Demo Library Expansion', bidDue: local(now + 6 * 24 * H, true) + '', dueToCompany: 'Sample Builders LLC', gc: 'Sample Builders LLC' }, BC, { source: 'PlanHub' })),
  LD('L_lib3', Object.assign({ name: 'ITB: Demo Library Expansion', bidDue: local(now + 7 * 24 * H + 2 * H, true), dueToCompany: 'Demo General Contractors Inc' }, BC)),
  LD('L_prime', { name: 'Demo School Gym Floor', source: 'City of Memphis', origin: 'watch', leadKind: 'Government', owner: 'Memphis-Shelby County Schools', bidDue: local(now + 9 * 24 * H, true), estimator: 'Sample Estimator' }),
  LD('L_res', { name: 'Demo Kitchen Lead', address: '5 Home Ct', city: 'Bartlett', source: 'Website', type: 'Residential', websiteLead: true, pm: 'Sample PM', stage: 'Contacted', contactedAt: ago(20), phone: '901-555-0199', geoLat: 35.21, geoLng: -89.80 }),
  LD('L_ins', { name: 'Demo Water Claim', address: '6 Flood Ln', source: 'Phone call', leadKind: 'Insurance', type: 'Insurance', isInsurance: true, claimNumber: 'CLM-1', geoLat: 35.6145, geoLng: -88.8139 }),
  LD('L_geo', { name: 'Demo Geocode Me', address: '77 Lookup Rd', city: 'Arlington', state: 'TN', source: 'Referral', type: 'Residential', pm: 'Sample PM' }),
];
for (let i = 0; i < 500; i++) LEADS.push(LD('LF' + i, { name: 'Filler Lead ' + String(i).padStart(3, '0'), address: i + ' Filler Way', source: 'Website', type: 'Residential', websiteLead: true, pm: i % 3 ? 'Sample PM' : '', bidDue: i % 5 ? '' : local(now + (20 + i) * 24 * H), createdAt: ago(100 + i), updatedAt: ago(100 + i) }));
cset('leads', LEADS);
cset('bidLists', [
  { id: 'BID1', title: 'Old Board Clinic Reroof', client: 'Old GC Inc', address: '9 Old Rd', bidDue: local(now + 12 * 24 * H), status: 'Open', priority: 'High', gcEmail: 'est@oldgc.example.invalid' },
  { id: 'BID2', title: 'Old Board Lost Job', client: 'Old GC Inc', status: 'Lost' },
  { id: 'BID3', title: 'Demo Kitchen Lead', address: '5 Home Ct', status: 'Bidding' }]);
const cloudLeads = () => { let v = cget('leads'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} return Array.isArray(v) ? v : []; };
const tomb = id => { let v = cget('gc_tombstones'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} return !!(v && v['leads:' + id]); };
const NLEADS = LEADS.length;

const errsOf = c => c.errs.filter(e => !/ResizeObserver/.test(e) && !/unstable_scheduleCallback.*react-dom\.production/.test(e));
const rows = c => c.ev(() => [...document.querySelectorAll('#gc-leads-hub table.gclu-list tr[data-gcl-id]')].map(r => r.getAttribute('data-gcl-id')));
const cellTxt = (c, id, col) => c.ev(([id, col]) => { const r = document.querySelector('#gc-leads-hub tr[data-gcl-id="' + id + '"] td.c-' + col); return r ? r.innerText.trim() : null; }, [id, col]);
const drawerOpen = c => c.ev(() => { const d = document.getElementById('gcl-drawer'); if (!d) return false; const r = d.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(d).display !== 'none'; });
const chipOn = c => c.ev(() => [...document.querySelectorAll('#gc-leads-hub [data-gclu-chip].on')].map(b => b.getAttribute('data-gclu-chip')));
const viewOn = c => c.ev(() => { const b = document.querySelector('#gc-leads-hub .gclu-views button.on'); return b ? b.getAttribute('data-gcl-v') : ''; });
/* a click → the next paint, in the page (event → rAF → task) */
async function timed(c, sel){
  return c.ev(sel => new Promise(res => { const el = document.querySelector(sel); if (!el) return res(-1); const t0 = performance.now(); el.click(); requestAnimationFrame(() => (window.__NST || setTimeout)(() => res(Math.round(performance.now() - t0)), 0)); }), sel);
}
async function toLeads(c, all){
  const p = c.page();
  await c.ev(() => window._setView && window._setView('leads'));
  await waitFor(c, () => !!document.querySelector('#gc-leads-hub table.gclu-list tr[data-gcl-id]'), null, 60000);
  if (all) await waitFor(c, n => window._gcLeadsHubKit.all().length >= n && !!document.querySelector('#gc-leads-hub tr[data-gcl-id="L_lib2"]'), NLEADS, 120000, 1000);
  return p;
}
async function geoMock(c){
  c.geoCalls = [];
  await c.ctx.route(u => new URL(u).pathname === '/.netlify/functions/geocode', r => {
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    const a = b.addresses || []; c.geoCalls.push(a);
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, results: a.map(x => /Lookup Rd/.test(x) ? { lat: 35.2965, lng: -89.6620, matched: x } : null) }) });
  });
}

try {
  /* ── A: admin, desktop ── */
  const A = await computer('A', { build }); A.prompts = [];
  await geoMock(A);
  await A.ctx.addInitScript(() => { window.__NMO = window.MutationObserver; window.__NST = window.setTimeout; try { localStorage.setItem('gc_phone_desk', '1'); ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
  await signIn(A, 'wjohnson@grayco-cs.com', 12000);
  const pa = A.page();
  await pa.evaluate(() => window._setView && window._setView('dashboard'));
  await sleep(1500);
  T.openLeads = await pa.evaluate(() => new Promise(res => { const t0 = performance.now(); window._setView('leads'); (function k(){ if (document.querySelector('#gc-leads-hub table.gclu-list tr[data-gcl-id]')) return requestAnimationFrame(() => res(Math.round(performance.now() - t0))); if (performance.now() - t0 > 20000) return res(-1); setTimeout(k, 5); })(); }));
  await toLeads(A, true);
  T.openLeadsFull = await pa.evaluate(() => new Promise(res => { window._setView('dashboard'); setTimeout(() => { const t0 = performance.now(); window._setView('leads'); (function k(){ if (document.querySelector('#gc-leads-hub tr[data-gcl-id="L_over"]')) return requestAnimationFrame(() => res(Math.round(performance.now() - t0))); if (performance.now() - t0 > 20000) return res(-1); setTimeout(k, 5); })(); }, 800); }));
  ok(T.openLeadsFull > 0 && T.openLeadsFull < 300, 'opening Leads (' + NLEADS + ' leads) draws the list in < 300 ms (' + T.openLeadsFull + ' ms)', T);
  await sleep(1500);
  ok((await viewOn(A)) === 'list' && JSON.stringify(await chipOn(A)) === '["all"]', 'opens on 📋 List and All');
  const views = await A.ev(() => [...document.querySelectorAll('#gc-leads-hub .gclu-views button')].map(b => b.getAttribute('data-gcl-v')));
  ok(JSON.stringify(views.slice(0, 4)) === JSON.stringify(['board', 'list', 'cal', 'map']) && (views.length === 4 || views[4] === 'outreach'), 'views on top: Board · List · Calendar · Map · Outreach', views);
  ok(await A.ev(() => !document.querySelector('#gc-leads-tabs') || getComputedStyle(document.querySelector('#gc-leads-tabs')).display === 'none'), 'the Leads / Lead Inbox / Website sub-tabs are not the landing (hidden on Leads)');
  /* the old Bid Board */
  const bb = await A.ev(() => ({ h1: [...document.querySelectorAll('h1')].some(h => /Bid Board/.test(h.textContent)), newBtn: [...document.querySelectorAll('button')].some(b => /New Bid Opportunity/.test(b.textContent)), tab: [...document.querySelectorAll('#gc-leads-tabs button')].map(b => b.textContent) }));
  ok(!bb.h1 && !bb.newBtn && !bb.tab.some(t => /^Bids \(/.test(t)), 'the old manual Bid Board is gone (no board, no "+ New Bid Opportunity", no "Bids (N)" tab)', bb);
  let mig = null; for (let i = 0; i < 40 && !mig; i++) { await sleep(1000); const l = cloudLeads().filter(x => /^LBB_/.test(x.id)); if (l.length) mig = l; }
  ok(mig && mig.length === 1 && mig[0].id === 'LBB_BID1' && mig[0].name === 'Old Board Clinic Reroof' && mig[0].dueToCompany === 'Old GC Inc' && mig[0].priority === 7, 'its open bid became a bid lead (once; the Lost one stays archived; the one matching an existing lead by name + address is not added)', mig && mig.map(x => [x.id, x.name, x.priority]));
  ok(Array.isArray(cget('bidLists')) && cget('bidLists').length === 3, 'the old Bid Board data is kept (3 bids)');
  /* columns */
  const heads = await A.ev(() => [...document.querySelectorAll('#gc-leads-hub table.gclu-list thead th')].map(t => t.getAttribute('data-gcl-lsort') || (t.classList.contains('gcl-tc') ? 'trash' : '?')));
  ok(JSON.stringify(heads) === JSON.stringify(['name', 'due', 'prio', 'bidto', 'stage', 'who', 'dist', 'trash']), 'columns: Lead | Due | Priority | Bid to | Stage | Assigned | Distance | 🗑', heads);
  let order = await rows(A);
  ok(order.length === 60 && await A.ev(() => /Show \d+ more/.test((document.querySelector('#gc-leads-hub [data-gcl-more="ulist"]') || {}).innerText || '')), '60 rows, then "Show more"', order.length);
  ok(JSON.stringify(order.slice(0, 5)) === JSON.stringify(['L_over', 'L_soon', 'L_tieB', 'L_tieA', 'L_date']), 'default: soonest due first, the same due → the higher priority first', order.slice(0, 6));
  const due = await A.ev(() => Object.fromEntries(['L_over', 'L_soon', 'L_date', 'L_prime'].map(id => { const td = document.querySelector('#gc-leads-hub tr[data-gcl-id="' + id + '"] td.c-due'); const s = td && td.querySelector('.gcl-due'); return [id, td ? { t: td.innerText.trim(), k: s ? s.getAttribute('data-due') : '', color: s ? getComputedStyle(s).color : '' } : null]; })));
  ok(due.L_over && due.L_over.k === 'overdue' && due.L_over.color === 'rgb(185, 28, 28)', 'overdue: red', due.L_over);
  ok(due.L_soon && due.L_soon.k === 'soon' && due.L_soon.color === 'rgb(180, 83, 9)', 'due within 3 days: amber', due.L_soon);
  ok(due.L_date && /time not stated/.test(due.L_date.t) && !/time not stated/.test(due.L_soon.t), 'a date with no time: "time not stated"', due.L_date);
  const bt = {}; for (const id of ['L_over', 'L_lib1', 'L_prime']) bt[id] = await cellTxt(A, id, 'bidto');
  ok(bt.L_over === 'Solo Late Builders Inc' && bt.L_lib1 === '🏢 3 GCs' && bt.L_prime === 'Memphis-Shelby County Schools', 'Bid to: the GC by name · "3 GCs" · the owner on a prime bid', bt);
  ok(/A & B Construction/.test(await A.ev(() => document.querySelector('#gc-leads-hub tr[data-gcl-id="L_lib1"] td.c-bidto').title)), '… the names on hover');
  const who = { a: await cellTxt(A, 'L_soon', 'who'), u: await cellTxt(A, 'LF0', 'who') };
  if (!who.u) who.u = await A.ev(() => { const td = [...document.querySelectorAll('#gc-leads-hub td.c-who')].find(x => /Unassigned/.test(x.innerText)); return td ? td.innerText.trim() : null; });
  ok(/Sample Estimator/.test(who.a || '') && /Unassigned/.test(who.u || ''), 'Assigned column: the person, or Unassigned', who);
  /* chips */
  const ms = []; const clickMs = async sel => { const t = await timed(A, sel); ms.push(t); await sleep(250); return t; };
  await clickMs('#gc-leads-hub [data-gclu-chip="bids"]');
  order = await rows(A);
  const kinds = await A.ev(ids => ids.map(id => window._gcLeadsUI.kind(window._gcLeadsHubKit.all().find(l => l.id === id))), order);
  ok(order.includes('L_over') && order.includes('LBB_BID1') && kinds.every(k => k === 'bids') && JSON.stringify(await chipOn(A)) === '["bids"]', 'Bids chip: only bids — the Lead Inbox bid (L_over) and the moved Bid Board bid among them', { n: order.length, kinds: [...new Set(kinds)] });
  ok(await A.ev(() => !!document.querySelector('#gc-leads-hub [data-gclu-clear]')), '✕ Clear shows when a filter is on');
  await clickMs('#gc-leads-hub [data-gclu-chip="bids"]');
  ok(JSON.stringify(await chipOn(A)) === '["all"]' && await A.ev(() => !document.querySelector('#gc-leads-hub .gclu-chips [data-gclu-clear]')), 'tap again: cleared (All, no ✕ Clear)');
  await clickMs('#gc-leads-hub [data-gclu-chip="ins"]');
  ok(JSON.stringify(await rows(A)) === '["L_ins"]', 'Insurance chip', await rows(A));
  await clickMs('#gc-leads-hub [data-gclu-chip="res"]');
  order = await A.ev(() => window._gcLeadsUI.rows()); ok(order.includes('L_res') && !order.includes('L_ins') && !order.includes('L_over'), 'Residential chip (replaces Insurance)', order.slice(0, 4));
  await clickMs('#gc-leads-hub [data-gclu-chip="un"]');
  order = await rows(A); ok(order.length > 0 && !order.includes('L_res') && (await A.ev(ids => ids.every(id => { const l = window._gcLeadsHubKit.all().find(x => x.id === id); return !(l.pm || l.estimator || l.apm); }), order)), 'Unassigned + Residential: both narrow', order.length);
  await clickMs('#gc-leads-hub .gclu-chips [data-gclu-clear]');
  ok(JSON.stringify(await chipOn(A)) === '["all"]', '✕ Clear → All');
  await clickMs('#gc-leads-hub [data-gclu-chip="wk"]');
  order = await rows(A);
  const wkOk = await A.ev(ids => { const e = new Date(); e.setHours(23, 59, 59, 999); e.setDate(e.getDate() + ((7 - e.getDay()) % 7)); const s0 = new Date(); s0.setHours(0, 0, 0, 0); return ids.every(id => { const l = window._gcLeadsHubKit.all().find(x => x.id === id); const d = l.bidDue.length === 10 ? l.bidDue + 'T17:00:00' : l.bidDue; const t = Date.parse(d); return t >= s0.getTime() && t <= e.getTime(); }); }, order);
  ok(wkOk && !order.includes('L_over'), 'Due this week chip', order);
  await clickMs('#gc-leads-hub [data-gclu-chip="wk"]');
  /* counts */
  const cnt = await A.ev(() => Object.fromEntries([...document.querySelectorAll('#gc-leads-hub [data-gclu-cnt]')].map(b => [b.getAttribute('data-gclu-cnt'), +b.querySelector('b').textContent])));
  const mdl = await A.ev(() => window._gcLeadsUI.model().cnt);
  ok(Object.keys(cnt).join() === 'un,d7,nc' && cnt.un === mdl.un && cnt.d7 === mdl.d7 && cnt.nc === mdl.nc && cnt.d7 >= 6, 'three count boxes: Needs assigning · Due in 7 days · Not contacted', cnt);
  await clickMs('#gc-leads-hub [data-gclu-cnt="d7"]');
  order = await rows(A); ok(order.length === cnt.d7 && !order.includes('L_over') && order.includes('L_soon'), 'Due in 7 days box → its leads', { n: order.length, want: cnt.d7 });
  await clickMs('#gc-leads-hub [data-gclu-cnt="d7"]');
  ok((await rows(A)).length === 60, '… tap again: all');
  await clickMs('#gc-leads-hub [data-gclu-cnt="nc"]');
  order = await rows(A); ok(!order.includes('L_res') && order.includes('L_over'), 'Not contacted box', order.slice(0, 3));
  await clickMs('#gc-leads-hub [data-gclu-cnt="nc"]');
  /* sort */
  await clickMs('#gc-leads-hub th[data-gcl-lsort="prio"]');
  order = await rows(A); ok(order[0] === 'L_tieB', 'Priority header: highest first', order.slice(0, 3));
  await clickMs('#gc-leads-hub th[data-gcl-lsort="name"]');
  order = await rows(A); { const nm = await A.ev(ids => ids.slice(0, 8).map(id => (window._gcLeadsHubKit.all().find(l => l.id === id).name || '').toLowerCase()), order); ok(nm.every((x, i) => !i || nm[i - 1] <= x), 'Lead header: A → Z', nm); }
  await clickMs('#gc-leads-hub th[data-gcl-lsort="due"]');
  ok((await rows(A))[0] === 'L_over', 'back to Due');
  /* distance */
  const dists = await A.ev(() => Object.fromEntries(['L_res', 'L_ins'].map(id => { const d = window._gcLeadsGeo.dist(id); return [id, d == null ? null : (d < 10 ? d.toFixed(1).replace(/\.0$/, '') : Math.round(d)) + ' mi']; })));
  ok(/^\d(\.\d)? mi$/.test(dists.L_res || '') && /^\d+ mi$/.test(dists.L_ins || '') && +dists.L_ins.split(' ')[0] > 50, 'Distance column: miles from the office', dists);
  await A.ev(() => { const s = document.querySelector('#gc-leads-hub [data-gclu-mi]'); s.value = '25'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(500);
  order = await rows(A); ok(order.includes('L_res') && !order.includes('L_ins') && !order.includes('L_over'), 'Within 25 mi: near leads only; no position → left out', order);
  await A.ev(() => { const s = document.querySelector('#gc-leads-hub [data-gclu-mi]'); s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(300);
  await clickMs('#gc-leads-hub th[data-gcl-lsort="dist"]');
  order = await rows(A); ok(order[0] === 'L_res', 'Distance header: nearest first', order.slice(0, 3));
  let geoTxt = null; for (let i = 0; i < 30 && !(geoTxt && /mi/.test(geoTxt)); i++) { await sleep(500); geoTxt = await A.ev(() => { const d = window._gcLeadsGeo.dist('L_geo'); return d == null ? null : d.toFixed(1) + ' mi'; }); }
  ok(geoTxt && A.geoCalls.some(a => a.some(x => /Lookup Rd/.test(x))), 'a lead without a stored position is geocoded lazily and cached (' + geoTxt + ')', A.geoCalls.length);
  await clickMs('#gc-leads-hub th[data-gcl-lsort="due"]');
  T.clickMedian = ms.slice().sort((a, b) => a - b)[Math.floor(ms.length / 2)]; T.clickMax = Math.max(...ms);
  ok(T.clickMedian < 100, 'clicks (chips / counts / sort) draw in < 100 ms (median ' + T.clickMedian + ' ms, max ' + T.clickMax + ' ms)', ms);
  /* priority from the list: shows at once, saved */
  await mclick(pa, '#gc-leads-hub tr[data-gcl-id="L_lib2"] [data-gcl-lprio]'); await sleep(300);
  ok(await A.ev(() => document.querySelectorAll('#gcl-lprio-pop [data-lp]').length === 10) && !(await drawerOpen(A)), 'Priority chip: 1–10 (does not open the lead)');
  T.prioList = await timed(A, '#gcl-lprio-pop [data-lp="7"]');
  const p7 = await cellTxt(A, 'L_lib2', 'prio');
  ok(p7 === '7' && T.prioList < 100, 'priority 7 shows at once (' + T.prioList + ' ms)', p7);
  let pl = null; for (let i = 0; i < 30 && !pl; i++) { await sleep(500); const l = cloudLeads().find(x => x.id === 'L_lib2'); if (l && l.priority === 7) pl = l; }
  ok(!!pl, '… and is saved');
  /* the panel */
  T.panelOpen = await timed(A, '#gc-leads-hub tr[data-gcl-id="L_soon"] td.c-stage');
  ok(await drawerOpen(A) && T.panelOpen < 300, 'a row click opens the lead panel (' + T.panelOpen + ' ms)');
  await sleep(1200);
  const secs = await A.ev(() => [...document.querySelectorAll('#gcl-drawer section > h4, #gcl-drawer section > details > summary')].map(h => h.textContent.trim().slice(0, 20)));
  const iS = secs.findIndex(x => /^Status/.test(x)), iB = secs.findIndex(x => /^⏰ Bid/.test(x)), iG = secs.findIndex(x => /Bidding to/.test(x)), iC = secs.findIndex(x => /^Contact/.test(x)), iN = secs.findIndex(x => /Notes/.test(x));
  ok(iS === 0 && iB === 1 && iC > iB && iN > iC && (iG < 0 || (iG > iB && iG < iC)), 'panel: Status → ⏰ Bid → (🏢 Bidding to) → Contact → Notes & activity → More', secs);
  const pan = await A.ev(() => { const d = document.getElementById('gcl-drawer'); return { stage: !!d.querySelector('section select[data-d="stage"]'), prio: d.querySelectorAll('[data-gcl-prio]').length, asg: !!d.querySelector('select[data-d="assign"]'), won: !!d.querySelector('[data-d="won"]'), lost: !!d.querySelector('[data-d="lost"]'), bidto: /Bid to:/.test(d.innerText), from: /Due date (read from|typed|set by|from)/.test(d.innerText), contact: [...d.querySelectorAll('button,a')].some(b => /Customer|Call|E-mail|Log a call/.test(b.textContent)) }; });
  ok(pan.stage && pan.prio === 10 && pan.asg && pan.won && pan.lost, 'Status: stage · priority 1–10 · assigned · won / lost', pan);
  ok(pan.bidto && pan.from, 'Bid: due date and where it came from · bid to', pan);
  T.prioPanel = await A.ev(() => new Promise(res => { const b = document.querySelector('#gcl-drawer [data-gcl-prio="4"]'); const t0 = performance.now(); b.click(); requestAnimationFrame(() => (window.__NST || setTimeout)(() => { const ms = Math.round(performance.now() - t0), on = (document.querySelector('#gcl-drawer [data-gcl-prio].on') || {}).textContent; (window.__NST || setTimeout)(() => res({ ms, on, row: (document.querySelector('#gc-leads-hub tr[data-gcl-id="L_soon"] td.c-prio') || {}).innerText }), 300); }, 0)); }));
  ok(T.prioPanel.on === '4' && T.prioPanel.row === '4' && T.prioPanel.ms < 100, 'priority in the panel shows at once (' + T.prioPanel.ms + ' ms), the row right after', T.prioPanel);
  T.stagePanel = await A.ev(() => new Promise(res => { const s = document.querySelector('#gcl-drawer select[data-d="stage"]'); const t0 = performance.now(); s.value = 'Site Visit'; s.dispatchEvent(new Event('change', { bubbles: true })); requestAnimationFrame(() => (window.__NST || setTimeout)(() => res({ ms: Math.round(performance.now() - t0), v: document.querySelector('#gcl-drawer select[data-d="stage"]').value, row: (document.querySelector('#gc-leads-hub tr[data-gcl-id="L_soon"] td.c-stage') || {}).innerText }), 0)); }));
  ok(T.stagePanel.v === 'Site Visit' && /Site Visit/.test(T.stagePanel.row || ''), 'stage in the panel shows at once (' + T.stagePanel.ms + ' ms)', T.stagePanel);
  let ps = null; for (let i = 0; i < 30 && !ps; i++) { await sleep(500); const l = cloudLeads().find(x => x.id === 'L_soon'); if (l && l.priority === 4 && l.stage === 'Site Visit') ps = l; }
  ok(!!ps, '… both saved');
  if (SHOTS) await pa.screenshot({ path: SHOTS + '/desktop_panel.png' });
  T.panelClose = await timed(A, '#gcl-drawer [data-d="x"]');
  ok(!(await drawerOpen(A)) && T.panelClose < 100, 'Back from the lead (' + T.panelClose + ' ms)');
  /* More */
  await mclick(pa, '#gc-leads-hub [data-gclu-more]'); await sleep(300);
  const menu = await A.ev(() => [...document.querySelectorAll('#gc-leads-hub .gclu-menu button')].map(b => b.textContent.trim()));
  const want = [/Lead Inbox/, /Website/, /Imported/, /Archived/, /Clean up/, /Duplicates/, /Lead settings/, /Insurance claims/, /Old Bid Board/];
  ok(want.every(re => menu.some(t => re.test(t))) && !menu.some(t => /Calendar|Map|Outreach/.test(t)), '⋯ More: Lead Inbox · Website · Imported · Archived · Clean up · Duplicates · Lead settings · Insurance claims · Old Bid Board (views stay on top)', menu);
  if (SHOTS) await pa.screenshot({ path: SHOTS + '/desktop_more.png' });
  await mclick(pa, '#gc-leads-hub [data-gclu-oldbb]'); await sleep(800);
  const obb = await A.ev(() => { const o = document.getElementById('gclu-oldbb'); return o ? { rows: o.querySelectorAll('tbody tr').length, open: o.querySelectorAll('[data-gclu-open]').length, edit: [...o.querySelectorAll('button')].some(b => /edit|delete/i.test(b.textContent)) } : null; });
  ok(obb && obb.rows === 3 && obb.open === 1 && !obb.edit, 'Old Bid Board: read-only, 3 bids, the moved one links to its lead', obb);
  await pa.keyboard.press('Escape'); await sleep(200);
  await mclick(pa, '#gc-leads-hub [data-gclu-more]'); await sleep(200);
  await mclick(pa, '#gc-leads-hub [data-gclu-tab="bidboard"]'); await sleep(1500);
  ok(await A.ev(() => (document.getElementById('gc-leads-tabs') || {}).getAttribute && document.getElementById('gc-leads-tabs').getAttribute('data-tab') === 'bidboard' && getComputedStyle(document.getElementById('gc-leads-tabs')).display !== 'none'), '⋯ More → Lead Inbox opens the inbox cards (with the tab bar to come back)');
  T.backFromInbox = await pa.evaluate(() => new Promise(res => { const t0 = performance.now(); document.querySelector('#gc-leads-tabs [data-gc-tab="leads"]').click(); (function k(){ const h = document.getElementById('gc-leads-hub'); if (h && h.offsetParent && h.querySelector('tr[data-gcl-id]')) return res(Math.round(performance.now() - t0)); if (performance.now() - t0 > 10000) return res(-1); (window.__NST || setTimeout)(k, 10); })(); }));
  await waitFor(A, () => !!document.querySelector('#gc-leads-hub table.gclu-list tr[data-gcl-id]'), null, 20000);
  ok((await viewOn(A)) === 'list' && T.backFromInbox > 0 && T.backFromInbox < 1000, '… and back to the Leads list (' + T.backFromInbox + ' ms)', await A.ev(() => ({ v: window._gcLeadsHub.ui().v, tab: (document.getElementById('gc-leads-tabs') || {}).getAttribute && document.getElementById('gc-leads-tabs').getAttribute('data-tab'), hubs: document.querySelectorAll('#gc-leads-hub').length, on: [...document.querySelectorAll('#gc-leads-hub .gclu-views button')].map(b => b.className).join(','), rows: document.querySelectorAll('#gc-leads-hub tr[data-gcl-id]').length, vis: (document.getElementById('gc-leads-hub') || { getBoundingClientRect: () => ({}) }).getBoundingClientRect().height })));
  /* views round trip */
  const trip = [];
  for (const v of ['board', 'cal', 'map', 'outreach']) {
    const has = await A.ev(v => !!document.querySelector('#gc-leads-hub [data-gcl-v="' + v + '"]'), v); if (!has) { trip.push(v + (v === 'outreach' ? ':n/a' : ':MISSING')); continue; }
    const t1 = await timed(A, '#gc-leads-hub [data-gcl-v="' + v + '"]'); await sleep(900);
    const st = await A.ev(v => ({ on: (document.querySelector('#gc-leads-hub .gclu-views button.on') || {}).getAttribute('data-gcl-v'), btns: document.querySelectorAll('#gc-leads-hub .gclu-views button').length, vis: !!document.querySelector('#gc-leads-hub .gclu-views').offsetParent,
      body: v === 'board' ? !!document.querySelector('#gc-leads-hub .gcl-board') : v === 'cal' ? !!document.querySelector('#gc-leads-hub .gcl-cal') : v === 'map' ? !!document.querySelector('#gc-leads-hub .gcl-map') : !!(document.getElementById('gc-rso') && document.getElementById('gc-rso').offsetParent) && !!(document.getElementById('gc-leads-hub').compareDocumentPosition(document.getElementById('gc-rso')) & 4) }), v);
    if (v === 'outreach' && SHOTS) await pa.screenshot({ path: SHOTS + '/desktop_outreach.png' });
    const t2 = await timed(A, '#gc-leads-hub [data-gcl-v="list"]'); await sleep(600);
    const back = (await viewOn(A)) === 'list' && (await rows(A)).length > 0 && await A.ev(() => !document.body.classList.contains('gcrso-on'));
    trip.push(v + ':' + (st.on === v && st.vis && st.body && back ? 'ok' : 'BAD ' + JSON.stringify(st) + ' back=' + back) + ' ' + t1 + '/' + t2 + 'ms');
  }
  ok(trip.every(x => / ok|:ok|n\/a/.test(x)), 'List → Board / Calendar / Map / Outreach → List: the view buttons stay on screen, each comes back', trip);
  if (await A.ev(() => !!document.querySelector('#gc-leads-hub [data-gcl-v="outreach"]'))) {
    await mclick(pa, '#gc-leads-hub [data-gcl-v="outreach"]'); await sleep(1200);
    const bk = await A.ev(() => !!document.querySelector('[data-rso-back]'));
    if (bk) { await mclick(pa, '[data-rso-back]'); await sleep(2000); }
    ok(!bk || ((await viewOn(A)) === 'list' && (await rows(A)).length > 0), 'Outreach\'s own "◈ Back to Leads" returns to the list', bk);
  }
  /* trash */
  if ((await viewOn(A)) !== 'list') { await mclick(pa, '#gc-leads-hub [data-gcl-v="list"]'); await sleep(800); }
  T.trash = await timed(A, '#gc-leads-hub tr[data-gcl-id="L_over"] [data-gcl-del]');
  if (T.trash < 0) console.log('DBG trash', JSON.stringify(await A.ev(() => ({ ui: window._gcLeadsHub.ui(), rows: [...document.querySelectorAll('#gc-leads-hub tr[data-gcl-id]')].slice(0, 5).map(r => r.getAttribute('data-gcl-id')), dels: document.querySelectorAll('#gc-leads-hub [data-gcl-del]').length, has: window._gcLeadsHubKit.all().some(l => l.id === 'L_over') }))));
  ok(await A.ev(() => !!document.getElementById('gcl-delq')) && !(await drawerOpen(A)), '🗑 asks first (' + T.trash + ' ms)');
  await mclick(pa, '#gcl-delq [data-a="delete"]'); await sleep(600);
  ok(!(await rows(A)).includes('L_over'), 'deleted: the row is gone');
  let gone = false; for (let i = 0; i < 40 && !gone; i++) { await sleep(500); gone = tomb('L_over') && !cloudLeads().some(l => l.id === 'L_over'); }
  ok(gone, '… tombstoned and gone from the cloud copy');
  /* idle: nothing redraws */
  await sleep(3000);
  const idle = await pa.evaluate(ms => new Promise(res => { const m = { hub: 0, body: 0, where: {} }; const key = n => { for (let x = n; x; x = x.parentElement) if (x.id) return x.id; return '?'; };
    const hb = document.getElementById('gc-leads-hub'); let last = hb ? hb.__gcHtml : ''; m.diff = [];
    const mo = new window.__NMO(rs => rs.forEach(r => { m.body++; if (hb && hb.__gcHtml !== last && m.diff.length < 3) { const cur = hb.__gcHtml || ''; let i = 0; while (i < cur.length && cur[i] === last[i]) i++; m.diff.push(last.slice(Math.max(0, i - 60), i + 60) + ' ⇒ ' + cur.slice(Math.max(0, i - 60), i + 60)); last = cur; } else if (hb && m.diff.length < 3 && r.target.closest && r.target.closest('#gc-leads-hub') && hb.__gcHtml === last) m.diff.push('outside the hub draw: ' + r.type + ' ' + (r.target.className || r.target.nodeName) + ' ' + (r.attributeName || '') + ' +' + (r.addedNodes ? r.addedNodes.length : 0)); const k = key(r.target); m.where[k] = (m.where[k] || 0) + 1; if (r.target.closest ? r.target.closest('#gc-leads-hub') : (r.target.parentElement && r.target.parentElement.closest('#gc-leads-hub'))) m.hub++; }));
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true }); (window.__NST || setTimeout)(() => { mo.disconnect(); res(m); }, ms); }), IDLE * 1000);
  T.idle = idle;
  ok(idle.hub === 0, 'idle ' + IDLE + ' s: the Leads screen does not change (' + idle.hub + ' changes; whole page ' + idle.body + ')', { where: idle.where, diff: idle.diff });
  if (SHOTS) await pa.screenshot({ path: SHOTS + '/desktop_list.png' });
  /* a reload: still deleted, opens on All again */
  await mclick(pa, '#gc-leads-hub [data-gclu-chip="bids"]'); await sleep(300);
  await pa.reload(); await sleep(9000);
  await toLeads(A, false); await sleep(2500);
  ok((await viewOn(A)) === 'list' && JSON.stringify(await chipOn(A)) === '["all"]', 'after a reload: List and All again (no filter remembered)');
  ok(!(await A.ev(() => window._gcLeadsHubKit.all().some(l => l.id === 'L_over'))) && !(await rows(A)).includes('L_over'), 'after a reload: the deleted lead stays deleted');
  ok(cloudLeads().filter(x => /^LBB_/.test(x.id)).length === 1, 'the old Bid Board moved once (still one lead after the reload)');
  ok(errsOf(A).length === 0, 'A: no page errors', errsOf(A).slice(0, 4));

  /* ── B: a 2nd computer (admin, phone) ── */
  const B = await computer('B', { build, mobile: true });
  await B.ctx.addInitScript(() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
  await signIn(B, 'nthomas@grayco-cs.com', 12000);
  const pb = await toLeads(B, true); await sleep(2500);
  ok(!(await B.ev(() => window._gcLeadsHubKit.all().some(l => l.id === 'L_over'))) && !(await rows(B)).includes('L_over'), '2nd computer: the deleted lead is not there');
  ok((await B.ev(() => window._gcLeadsHubKit.all().filter(l => /^LBB_/.test(l.id)).length)) === 1 && cloudLeads().filter(x => /^LBB_/.test(x.id)).length === 1, '2nd computer: the old Bid Board bid once, not added again');
  const ph = await B.ev(() => { const tr = document.querySelector('#gc-leads-hub tr[data-gcl-id="L_soon"]'); const vis = c => { const td = tr.querySelector('td.c-' + c); return !!(td && td.offsetParent && getComputedStyle(td).display !== 'none'); };
    return { thead: getComputedStyle(document.querySelector('#gc-leads-hub table.gclu-list thead')).display, grid: getComputedStyle(tr).display, name: vis('name'), due: vis('due'), prio: vis('prio'), who: vis('who'), trash: !!tr.querySelector('[data-gcl-del]') && !!tr.querySelector('[data-gcl-del]').offsetParent, w: document.documentElement.scrollWidth, vw: innerWidth }; });
  ok(ph.thead === 'none' && ph.grid === 'grid' && ph.name && ph.due && ph.prio && !ph.who && ph.trash && ph.w <= ph.vw + 1, 'phone: one card per lead (name + address, Due, Priority, 🗑), no sideways scroll', ph);
  if (SHOTS) await pb.screenshot({ path: SHOTS + '/phone_list.png' });
  { const bb = await pb.locator('#gc-leads-hub tr[data-gcl-id="L_soon"] td.c-due').boundingBox(); await pb.mouse.click(bb.x + 6, bb.y + bb.height / 2); } await sleep(1200);
  ok(await drawerOpen(B), 'phone: the lead panel opens');
  if (SHOTS) await pb.screenshot({ path: SHOTS + '/phone_panel.png' });
  ok(errsOf(B).length === 0, 'B: no page errors', errsOf(B).slice(0, 4));
} catch (e) { fail++; console.log('  ✗ FAIL threw ' + (e && e.stack || e)); }
console.log('timings ' + JSON.stringify(T));
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
await shared.close().catch(() => {});
process.exit(fail ? 1 : 0);
