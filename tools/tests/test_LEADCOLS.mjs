// test_LEADCOLS.mjs <build-dir> — patch LEADCOLS: Leads → List view.
//   Columns Lead | Due | Priority | Bid to | Status | 🗑, each sortable (default Due, soonest first, no due last);
//   Due colouring (overdue red, within 3 days amber, "—"); Bid to (one GC by name, "3 GCs" for one project bid to
//   three GCs on separate leads, the owner on a prime bid); Priority chip tap → 1–10 saved on that one lead;
//   🗑 (admin / office / estimator only) → "Delete this lead?" → gone, tombstoned, still gone after a reload and on a
//   second computer; Undo; phone layout (cards); 600+ leads render in pages of 60; no page errors.
// Offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs) with made-up demo data only
// (GC_DEMO_SEED, default wDEMO/seed.mjs). Every computer runs in ONE headless browser.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, cset, cget, signIn, mclick, ACCOUNTS } = await import(pathToFileURL(HARNESS).href);
const { seedDemo } = await import(pathToFileURL(process.env.GC_DEMO_SEED || SPD + '/wDEMO/seed.mjs').href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_LEADCOLS.mjs <dir with index.html>'); process.exit(2); }
const SHOTS = process.env.GC_SHOTS || '';
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };

/* ── made-up leads ── */
seedDemo();
ACCOUNTS['gmiller@grayco-cs.com'] = ACCOUNTS['gmiller@grayco-cs.com'] || { pw: 'Correct-Horse-5', id: 'u-g', role: 'staff' };
const pad = n => String(n).padStart(2, '0');
const local = (ms, time) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + (time ? 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : ''); };
const H = 3600e3, now = Date.now(), ago = h => new Date(now - h * H).toISOString();
const LD = (id, o) => Object.assign({ id, name: id, stage: 'New Lead', status: 'new', createdAt: ago(48), updatedAt: ago(48) }, o);
const BC = { source: 'BuildingConnected', leadKind: 'Commercial', estimator: 'Sample Estimator' };
const LEADS = [
  LD('L_over', Object.assign({ name: 'Demo Overdue Warehouse', address: '1 Late Rd', city: 'Memphis', bidDue: local(now - 50 * H), dueToCompany: 'Solo Late Builders Inc' }, BC)),
  LD('L_soon', Object.assign({ name: 'Demo Soon Clinic', address: '2 Soon St', city: 'Bartlett', bidDue: local(now + 30 * H, true), priority: 3, dueToCompany: 'A & B Construction Co., Inc.' }, BC)),
  LD('L_lib1', Object.assign({ name: 'Demo Library Expansion', address: '3 Book Ave', bidDue: local(now + 6 * 24 * H), dueToCompany: 'A & B Construction Co., Inc.' }, BC)),
  LD('L_lib2', Object.assign({ name: 'Demo Library Expansion', bidDue: local(now + 6 * 24 * H), dueToCompany: 'Sample Builders LLC', gc: 'Sample Builders LLC' }, BC, { source: 'PlanHub' })),
  LD('L_lib3', Object.assign({ name: 'ITB: Demo Library Expansion', bidDue: local(now + 7 * 24 * H), dueToCompany: 'Demo General Contractors Inc' }, BC)),
  LD('L_prime', { name: 'Demo School Gym Floor', source: 'City of Memphis', origin: 'watch', leadKind: 'Government', owner: 'Memphis-Shelby County Schools', bidDue: local(now + 9 * 24 * H), estimator: 'Sample Estimator' }),
  LD('L_later', Object.assign({ name: 'Demo Later Office', address: '4 Far Blvd', bidDue: local(now + 10 * 24 * H), priority: 9, dueToCompany: 'Zeta Contracting Co' }, BC)),
  LD('L_none', { name: 'Demo No Due Kitchen', address: '5 Home Ct', source: 'Website', type: 'Residential', websiteLead: true, pm: 'Sample PM' }),
];
for (let i = 0; i < 560; i++) LEADS.push(LD('LF' + i, { name: 'Filler Lead ' + String(i).padStart(3, '0'), address: i + ' Filler Way', source: 'Website', type: 'Residential', websiteLead: true, bidDue: i % 5 ? '' : local(now + (20 + i) * 24 * H), createdAt: ago(100 + i), updatedAt: ago(100 + i) }));
cset('leads', LEADS);
const cloudLeads = () => { let v = cget('leads'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} return Array.isArray(v) ? v : []; };
const inCloud = id => cloudLeads().some(l => l && l.id === id);
const tomb = id => { let v = cget('gc_tombstones'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} return !!(v && v['leads:' + id]); };

async function toList(c){
  const p = c.page();
  await p.evaluate(() => window._setView && window._setView('leads'));
  await waitFor(c, () => !!document.querySelector('#gc-leads-hub [data-gcl-v="list"]'), null, 60000);
  if (!(await p.locator('#gc-leads-hub table.gcl-lc').count())) await mclick(p, '#gc-leads-hub [data-gcl-v="list"]');
  return waitFor(c, () => document.querySelectorAll('#gc-leads-hub table.gcl-lc tr[data-gcl-id]').length > 0, null, 60000);
}
const ids = c => c.ev(() => [...document.querySelectorAll('#gc-leads-hub table.gcl-lc tr[data-gcl-id]')].map(r => r.getAttribute('data-gcl-id')));
const cellTxt = (c, id, col) => c.ev(([id, col]) => { const r = document.querySelector('#gc-leads-hub tr[data-gcl-id="' + id + '"] td.c-' + col); return r ? r.innerText.trim() : null; }, [id, col]);
const drawerOpen = c => c.ev(() => { const d = document.getElementById('gcl-drawer'); return !!(d && d.offsetParent !== null); });
/* the harness's React UMD load race (react-dom before its scheduler; seen on base builds too) is not the page's error */
const errsOf = c => c.errs.filter(e => !/ResizeObserver/.test(e) && !/unstable_scheduleCallback.*react-dom\.production/.test(e));

try {
  /* ── A: admin, desktop ── */
  const A = await computer('A', { build });
  await signIn(A, 'wjohnson@grayco-cs.com', 12000);
  const pa = A.page();
  ok(!!(await toList(A)), 'A (admin): the Leads list view is drawn');
  /* the first load can take a while to bring every lead onto this computer's disk (the CRM's start-up sync, also
     on the base build): wait for the whole made-up list */
  await waitFor(A, () => window._gcLeadsHubKit.all().length >= 568 && document.querySelector('#gc-leads-hub tr[data-gcl-id="L_lib2"]'), null, 120000, 1000);
  const heads = await A.ev(() => [...document.querySelectorAll('#gc-leads-hub table.gcl-lc thead th')].map(t => t.getAttribute('data-gcl-lsort') || (t.classList.contains('gcl-tc') ? '🗑' : '?')));
  ok(JSON.stringify(heads) === JSON.stringify(['name', 'due', 'prio', 'bidto', 'stage', '🗑']), 'columns: Lead | Due | Priority | Bid to | Status | 🗑', heads);
  const lbl = await A.ev(() => [...document.querySelectorAll('#gc-leads-hub table.gcl-lc thead th')].map(t => t.innerText.trim()));
  ok(/^Lead/.test(lbl[0]) && /^Due ▲/.test(lbl[1]) && /^Priority/.test(lbl[2]) && /^Bid to/.test(lbl[3]) && /^Status/.test(lbl[4]), 'header labels; Due is the sort (▲)', lbl);
  let order = await ids(A);
  ok(order.length === 60, 'the first 60 rows only (600+ leads)', order.length);
  ok(await A.ev(() => /Show \d+ more/.test((document.querySelector('#gc-leads-hub [data-gcl-more="list"]') || {}).innerText || '')), '… then "Show more"');
  ok(JSON.stringify(order.slice(0, 7)) === JSON.stringify(['L_over', 'L_soon', 'L_lib1', 'L_lib2', 'L_lib3', 'L_prime', 'L_later']), 'default sort: due date soonest first', order.slice(0, 8));
  if (process.env.GC_DBG && !order.includes('L_lib2')) console.log('DBG', JSON.stringify(await A.ev(() => { const raw = window._gcLeadsHubKit.all().find(l => l.id === 'L_lib2'); return { raw, ui: window._gcLeadsHub.ui(), crm: ((window._crm || {}).leads || []).find(l => l.id === 'L_lib2') }; })), JSON.stringify(cloudLeads().find(l => l.id === 'L_lib2')));
  const nameCell = await A.ev(() => { const td = document.querySelector('#gc-leads-hub tr[data-gcl-id="L_over"] td.c-name'); return td ? { b: td.querySelector('b').innerText, addr: (td.querySelector('.gcl-addr') || {}).innerText, badge: (td.querySelector('.gc-role') || {}).textContent } : null; });
  ok(nameCell && /Demo Overdue Warehouse/.test(nameCell.b) && nameCell.addr === '1 Late Rd, Memphis' && /SUB/.test(nameCell.badge || ''), 'first column: name + address (+ the Prime/Sub badge)', nameCell);
  /* due colouring */
  const due = await A.ev(() => Object.fromEntries(['L_over', 'L_soon', 'L_later', 'L_none'].map(id => { const td = document.querySelector('#gc-leads-hub tr[data-gcl-id="' + id + '"] td.c-due'); const s = td && td.querySelector('.gcl-due'); return [id, td ? { t: td.innerText.trim(), k: s ? s.getAttribute('data-due') : '', color: s ? getComputedStyle(s).color : '' } : null]; })));
  ok(due.L_over && due.L_over.k === 'overdue' && due.L_over.color === 'rgb(185, 28, 28)', 'overdue: red', due.L_over);
  ok(due.L_soon && due.L_soon.k === 'soon' && due.L_soon.color === 'rgb(180, 83, 9)' && /\d(a|p)$|\d:\d\d(a|p)$/.test(due.L_soon.t), 'due within 3 days: amber (with its time)', due.L_soon);
  ok(due.L_later && due.L_later.k === 'later', 'due later: plain', due.L_later);
  /* bid to */
  const bt = {}; for (const id of ['L_over', 'L_soon', 'L_lib1', 'L_lib2', 'L_lib3', 'L_prime']) bt[id] = await cellTxt(A, id, 'bidto');
  ok(bt.L_over === 'Solo Late Builders Inc' && bt.L_soon === 'A & B Construction Co., Inc.', 'Bid to: one GC → its name', bt);
  ok(bt.L_lib1 === '🏢 3 GCs' && bt.L_lib2 === '🏢 3 GCs' && bt.L_lib3 === '🏢 3 GCs', 'Bid to: one project, three GCs on separate leads → "3 GCs" on each', bt);
  ok(bt.L_prime === 'Memphis-Shelby County Schools', 'Bid to: a prime bid → the owner', bt.L_prime);
  const gtitle = await A.ev(() => document.querySelector('#gc-leads-hub tr[data-gcl-id="L_lib1"] td.c-bidto').title);
  ok(/A & B Construction/.test(gtitle) && /Sample Builders/.test(gtitle) && /Demo General Contractors/.test(gtitle), '… hover lists the three names', gtitle);
  await mclick(pa, '#gc-leads-hub tr[data-gcl-id="L_lib1"] [data-gcl-gcs]'); await sleep(400);
  const gp = await A.ev(() => { const p = document.getElementById('gcl-lprio-pop'); return p ? [...p.querySelectorAll('li')].map(x => x.textContent) : null; });
  ok(gp && gp.length === 3 && !(await drawerOpen(A)), '… a tap lists them too (and does not open the lead)', gp);
  await pa.keyboard.press('Escape'); await sleep(200);
  /* sorting */
  await mclick(pa, '#gc-leads-hub th[data-gcl-lsort="prio"]'); await sleep(600);
  order = await ids(A);
  ok(order[0] === 'L_later' && order[1] === 'L_soon', 'Priority header: highest first', order.slice(0, 3));
  await mclick(pa, '#gc-leads-hub th[data-gcl-lsort="name"]'); await sleep(600);
  order = await ids(A);
  ok(order[0] === 'L_later' && order[1] === 'L_lib1' && order[3] === 'L_none', 'Lead header: A → Z', order.slice(0, 4));
  await mclick(pa, '#gc-leads-hub th[data-gcl-lsort="name"]'); await sleep(600);
  order = await ids(A);
  ok(order[0] === 'L_lib3' && /^LF/.test(order[1]), '… tap again: Z → A', order.slice(0, 3));
  await mclick(pa, '#gc-leads-hub th[data-gcl-lsort="due"]'); await sleep(600);
  await mclick(pa, '#gc-leads-hub th[data-gcl-lsort="due"]'); await sleep(600);
  order = await ids(A);
  ok(/^LF/.test(order[0]) && !order.includes('L_none'), 'Due ▼: latest first, leads with no due still last', order.slice(0, 3));
  await mclick(pa, '#gc-leads-hub th[data-gcl-lsort="due"]'); await sleep(600);
  ok((await ids(A))[0] === 'L_over' && (await A.ev(() => window._gcLeadsHub.ui().lsort)) === 'due', 'back to Due ▲');
  /* performance: a redraw with 600+ leads */
  const tms = await A.ev(() => { const t = []; for (let i = 0; i < 5; i++) { const t0 = performance.now(); window._gcLeadsHub.redraw(); t.push(performance.now() - t0); } return t.sort((a, b) => a - b)[2]; });
  ok(tms < 120, 'a redraw of the list with 568 leads stays small (median ' + Math.round(tms) + ' ms)', tms);
  /* priority chip */
  const savesBefore = cloudLeads().filter(l => l.priority).map(l => l.id).sort();
  await mclick(pa, '#gc-leads-hub tr[data-gcl-id="L_lib2"] [data-gcl-lprio]'); await sleep(400);
  ok(await A.ev(() => document.querySelectorAll('#gcl-lprio-pop [data-lp]').length === 10) && !(await drawerOpen(A)), 'Priority chip: a tap opens 1–10 (not the lead)');
  await mclick(pa, '#gcl-lprio-pop [data-lp="7"]');
  let pl = null; for (let i = 0; i < 30 && !pl; i++) { await sleep(500); const l = cloudLeads().find(x => x.id === 'L_lib2'); if (l && l.priority === 7) pl = l; }
  ok(!!pl, 'priority 7 saved on that lead in the cloud');
  ok(JSON.stringify(cloudLeads().filter(l => l.priority).map(l => l.id).sort()) === JSON.stringify(savesBefore.concat(['L_lib2']).sort()), '… and on no other lead');
  ok(/P7/.test(await cellTxt(A, 'L_lib2', 'prio')), 'the chip shows P7');

  /* ── B: the office, a second computer (open before the delete) ── */
  const B = await computer('B', { build });
  await signIn(B, 'office@grayco-cs.com', 12000);
  ok(!!(await toList(B)), 'B (office): the list is drawn');
  await waitFor(B, () => window._gcLeadsHubKit.all().length >= 567, null, 120000, 1000);
  ok(await B.ev(() => document.querySelectorAll('#gc-leads-hub tr[data-gcl-id] .gcl-del').length > 0), 'the office sees the 🗑');
  ok((await ids(B)).includes('L_over'), 'B shows the overdue lead before the delete');

  /* ── delete ── */
  await A.page().bringToFront();
  ok(await A.ev(() => document.querySelectorAll('#gc-leads-hub tr[data-gcl-id]').length === document.querySelectorAll('#gc-leads-hub tr[data-gcl-id] td.gcl-tc .gcl-del').length), 'admin: a 🗑 at the end of every row');
  await mclick(pa, '#gc-leads-hub tr[data-gcl-id="L_over"] .gcl-del'); await sleep(400);
  const q = await pa.locator('#gcl-delq').innerText().catch(() => '');
  ok(/Delete this lead\?/.test(q) && /Demo Overdue Warehouse/.test(q) && !(await drawerOpen(A)) && !A.dialogs.length, 'the 🗑 asks "Delete this lead?" in the page (no browser dialog), the lead does not open', q);
  await mclick(pa, '#gcl-delq [data-a=cancel]'); await sleep(400);
  ok((await ids(A)).includes('L_over') && !(await pa.locator('#gcl-delq').count()), 'Cancel: nothing deleted');
  await mclick(pa, '#gc-leads-hub tr[data-gcl-id="L_over"] .gcl-del'); await sleep(300);
  await mclick(pa, '#gcl-delq [data-a=delete]'); await sleep(800);
  ok(!(await ids(A)).includes('L_over'), 'Delete: the row is gone at once');
  const tt = await pa.locator('#gcl-deltoast').innerText().catch(() => '');
  ok(/Deleted/.test(tt) && /Undo/.test(tt), '"Deleted · Undo" shows', tt);
  await sleep(5000);
  ok(!(await pa.locator('#gcl-deltoast').count()), '… for 5 s');
  let gone = false; for (let i = 0; i < 30 && !gone; i++) { await sleep(1000); gone = !inCloud('L_over') && tomb('L_over'); }
  ok(gone, 'deleted the CRM way: off the cloud list, a tombstone written (gc_tombstones leads:L_over)', { inCloud: inCloud('L_over'), tomb: tomb('L_over') });
  let bGone = null; for (let i = 0; i < 40 && !bGone; i++) { await sleep(1000); bGone = await B.ev(() => !document.querySelector('#gc-leads-hub tr[data-gcl-id="L_over"]') && !((window._crm && window._crm.leads) || []).some(l => l && l.id === 'L_over')); }
  ok(!!bGone, 'the second computer (B): gone without a reload');
  /* Undo */
  ok((await ids(A)).includes('L_later'), 'a second lead (Demo Later Office) on the list …');
  ok(await mclick(pa, '#gc-leads-hub tr[data-gcl-id="L_later"] .gcl-del'), '… its 🗑'); await sleep(300);
  ok(await mclick(pa, '#gcl-delq [data-a=delete]'), '… Delete'); await sleep(800);
  ok(!(await ids(A)).includes('L_later'), '… gone from the list');
  let tb2 = false; for (let i = 0; i < 20 && !tb2; i++) { await sleep(500); tb2 = tomb('L_later') || !inCloud('L_later'); }
  ok(await mclick(pa, '#gcl-deltoast [data-a=undo]'), '… Undo (within the 5 s)');
  let back = null; for (let i = 0; i < 20 && !back; i++) { await sleep(500); back = (await ids(A)).includes('L_later'); }
  ok(!!back, '… Undo brings it back on the list');
  let backCloud = false; for (let i = 0; i < 30 && !backCloud; i++) { await sleep(1000); backCloud = inCloud('L_later'); }
  ok(backCloud, '… back on the cloud list too (the CRM\'s Restore)', { inCloud: inCloud('L_later'), tomb: (() => { let v = cget('gc_tombstones'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} return v && v['leads:L_later']; })() });
  /* reload both */
  await sleep(4000);
  await pa.reload(); await sleep(12000); await toList(A);
  await B.page().reload(); await sleep(12000); await toList(B);
  await sleep(8000);
  ok(!(await ids(A)).includes('L_over') && !(await A.ev(() => ((window._crm && window._crm.leads) || []).some(l => l && l.id === 'L_over'))), 'A after a reload: still gone');
  ok(!(await ids(B)).includes('L_over'), 'B after a reload: still gone');
  ok(!inCloud('L_over'), 'the cloud: still gone after both reloads');
  ok((await ids(A)).includes('L_later') && (await ids(B)).includes('L_later'), 'the lead brought back by Undo is on both computers after the reload');
  ok(await A.ev(() => window._gcLeadsHub.ui().lsort === 'due'), 'the list sort is remembered');
  if (SHOTS) await pa.screenshot({ path: SHOTS + '/leadcols_desktop.png' });
  ok(!errsOf(A).length && !errsOf(B).length, 'no page errors (A, B)', errsOf(A).concat(errsOf(B)).slice(0, 4));
  await A.ctx.close(); await B.ctx.close();

  /* ── P: a PM (not admin / office / estimator) sees no 🗑 ── */
  const P = await computer('P', { build });
  await signIn(P, 'sbiffle@grayco-cs.com', 12000);
  await toList(P);
  ok((await P.ev(() => document.querySelectorAll('#gc-leads-hub .gcl-del, #gc-leads-hub th.gcl-tc').length)) === 0, 'a PM: no 🗑 on the list', await ids(P));
  ok(!errsOf(P).length, 'no page errors (PM)', errsOf(P).slice(0, 3));
  await P.ctx.close();

  /* ── M: the estimator, on a phone ── */
  const M = await computer('M', { build, mobile: true });
  await signIn(M, 'gmiller@grayco-cs.com', 12000);
  ok(!!(await toList(M)), 'phone (estimator): the list is drawn');
  const pm = M.page();
  const lay = await M.ev(() => {
    const t = document.querySelector('#gc-leads-hub table.gcl-lc'), r = t && t.querySelector('tr[data-gcl-id="L_soon"]');
    const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    if (!r) return { none: true, ids: [...document.querySelectorAll('#gc-leads-hub tr[data-gcl-id]')].map(x => x.getAttribute('data-gcl-id')).slice(0, 5) };
    const nb = r.querySelector('td.c-name').getBoundingClientRect(), tb = r.querySelector('.gcl-del').getBoundingClientRect();
    return { head: vis(t.querySelector('thead')), name: vis(r.querySelector('td.c-name')), due: vis(r.querySelector('td.c-due')), badge: vis(r.querySelector('.gc-role')), trash: vis(r.querySelector('.gcl-del')),
      prio: vis(r.querySelector('td.c-prio')), bidto: vis(r.querySelector('td.c-bidto')), stage: vis(r.querySelector('td.c-stage')), trashRight: tb.left > nb.left + nb.width * 0.5,
      scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth, rowW: r.getBoundingClientRect().width, vw: innerWidth };
  });
  ok(lay && !lay.head && lay.name && lay.due && lay.badge && lay.trash && lay.trashRight, 'phone: one card per lead — name, address, Due, badge, 🗑 at the right', lay);
  ok(lay && !lay.prio && !lay.bidto && !lay.stage, 'phone: the other columns are hidden', lay);
  ok(lay && lay.scrollX <= 1 && lay.rowW <= lay.vw, 'phone: no sideways scroll', lay);
  if (SHOTS) { await pm.evaluate(() => { document.querySelector('#gc-leads-hub table.gcl-lc').scrollIntoView({ block: 'start' }); }); await sleep(500); await pm.screenshot({ path: SHOTS + '/leadcols_phone.png' }); }
  await mclick(pm, '#gc-leads-hub tr[data-gcl-id="L_soon"] .gcl-del'); await sleep(400);
  ok(/Delete this lead\?/.test(await pm.locator('#gcl-delq').innerText().catch(() => '')), 'the estimator can delete (the question shows)');
  await mclick(pm, '#gcl-delq [data-a=delete]'); await sleep(800);
  let mg = false; for (let i = 0; i < 30 && !mg; i++) { await sleep(1000); mg = !inCloud('L_soon') && tomb('L_soon'); }
  ok(mg && !(await ids(M)).includes('L_soon'), '… and the delete goes through (tombstoned)');
  ok(!errsOf(M).length, 'no page errors (phone)', errsOf(M).slice(0, 3));
  await M.ctx.close();
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await shared.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
