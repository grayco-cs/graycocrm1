// test_PERMTAB.mjs <build-dir> — PERMTAB (owner 11/19: "The permitted jobs scan needs to be a tab on Leads"). Offline harness, made-up permits.
//   1. admin, desk: Leads → views row has "🏗 Permits" (from the switcher's own list); it shows patch PERMITS' screen under the Leads header —
//      the scanned permits (date, area, type, address, value, contractor) with its filters; ➕ Lead makes the CRM lead (LPMT_…) and tells the
//      server (set-state); Dismiss (in the permit's sheet) archives it; the left menu's 🏗️ Permitted jobs still works;
//   2. the office on a phone: the tab is there and fits the screen; 3. a PM: no Permits tab.
import { computer, signIn, sleep, cset, resetCloud, waitFor, onFn } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const build = process.argv[2];
const ITEMS = () => [
  { key: 'nash:demo1', src: 'nashville', number: 'T2026-0001', type: 'Building Residential - Rehab', subtype: 'Roof', address: '101 Demo St', city: 'Nashville', zip: '37201', value: 85000, contractor: 'Demo Builders LLC', contractorPhone: '6155550100', issued: '2026-11-17', state: 'new', hint: 'construction', reasons: ['roof'], cos: ['construction'] },
  { key: 'nash:demo2', src: 'nashville', number: 'T2026-0002', type: 'Building Commercial - Alteration', address: '202 Sample Ave', city: 'Nashville', zip: '37203', value: 410000, contractor: 'Sample Contracting Inc', issued: '2026-11-16', state: 'new', hint: 'construction', reasons: ['interior'], cos: ['construction'] }];
const CALLS = [];
onFn('permit-watch', ({ body }) => {
  CALLS.push(body);
  if (body && body.action === 'list') return { ok: true, items: ITEMS(), total: 2, counts: { new: 2, lead: 0, dismissed: 0, filtered: 0 }, status: { nashville: { at: new Date().toISOString(), kept: 2 } }, settings: { nashville: { on: true }, shovels: { on: false } }, active: { nashville: true, shovels: false }, shovelsConfigured: false, admin: true };
  if (body && body.action === 'set-state') return { ok: true, item: Object.assign({}, ITEMS().find(x => x.key === body.id) || {}, { state: body.state, leadId: body.leadId || '' }) };
  return { ok: true };
});
function seed(){
  resetCloud(); const at = new Date().toISOString();
  cset('users', [{ id: 'u-wesley', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u-office', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office', active: true },
    { id: 'u-pm', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
  cset('leads', [{ id: 'L1', name: 'Demo lead', stage: 'New Lead', createdAt: at, updatedAt: at }]);
}
const tabBtn = () => [...document.querySelectorAll('#gc-leads-hub .gclu-views [data-gcl-v]')].map(b => b.getAttribute('data-gcl-v') + '=' + b.textContent.trim());
const OPEN = [];
try {
  seed();
  const A = await computer('W', { build }); OPEN.push(A);
  ok('admin signs in', await signIn(A, 'wjohnson@grayco-cs.com', 20000));
  await sleep(5000); await A.ev(() => window._setView('leads')); await sleep(3000);
  const v = await A.ev(tabBtn);
  ok('the views row has "🏗 Permits" after the other views', v.includes('permits=🏗 Permits') && v.indexOf('permits=🏗 Permits') > v.indexOf('list=📋 List'), v);
  await A.ev(() => document.querySelector('#gc-leads-hub [data-gcl-v="permits"]').click());
  await waitFor(A, () => document.querySelectorAll('#gcl-pj-wrap #gc-pj tr[data-k]').length >= 2, null, 15000);
  const st = await A.ev(() => { const w = document.getElementById('gcl-pj-wrap'), hub = document.getElementById('gc-leads-hub'); return { vis: !!(w && w.getClientRects().length), after: !!(w && w.previousElementSibling === hub), rows: w ? w.querySelectorAll('tr[data-k]').length : 0, txt: w ? w.textContent : '', filt: w ? w.querySelectorAll('select, input[type=search], input').length : 0, chips: !!(hub.querySelector('.gclu-chips')) }; });
  ok('the Permits view: the scanned permits under the Leads header (date, area, type, address, value, contractor) with filters', st.vis && st.after && st.rows === 2 && /101 Demo St/.test(st.txt) && /Building Residential - Rehab/.test(st.txt) && /\$85,000|\$85k/.test(st.txt) && /Demo Builders LLC/.test(st.txt) && /11\/17\/26/.test(st.txt) && st.filt >= 2 && !st.chips, st);
  await A.ev(() => document.querySelector('#gcl-pj-wrap [data-pj-a="lead"][data-k="nash:demo1"]').click());
  await waitFor(A, () => (window._crm.leads || []).some(l => l.permitKey === 'nash:demo1'), null, 10000);
  const ld = await A.ev(() => (window._crm.leads || []).find(l => l.permitKey === 'nash:demo1') || null);
  ok('➕ Lead → a CRM lead (LPMT_…, source "Building permit — …") + set-state lead on the server', ld && /^LPMT_/.test(ld.id) && /Building permit/.test(ld.source || '') && CALLS.some(c => c.action === 'set-state' && c.id === 'nash:demo1' && c.state === 'lead'), { ld, CALLS });
  await A.ev(() => { const r = document.querySelector('#gcl-pj-wrap tr[data-k="nash:demo2"]'); if (r) r.click(); }); await sleep(800);
  const dis = await A.ev(() => { const b = document.querySelector('[data-pj-a="dismiss"][data-k="nash:demo2"]'); if (b) b.click(); return !!b; }); await sleep(1200);
  ok('Dismiss (the permit\'s sheet) archives it (set-state dismissed)', dis && CALLS.some(c => c.action === 'set-state' && c.id === 'nash:demo2' && c.state === 'dismissed'), CALLS);
  await A.ev(() => { const b = document.querySelector('#gc-leads-hub [data-gcl-v="list"]'); if (b) b.click(); }); await sleep(1500);
  ok('back on List the permits box is hidden', await A.ev(() => { const w = document.getElementById('gcl-pj-wrap'); return !w || !w.getClientRects().length; }));
  await A.ev(() => window._setView('permitjobs')); await sleep(2500);
  ok('the left menu\'s 🏗️ Permitted jobs still opens', await A.ev(() => !!document.querySelector('#gc-pj') && document.querySelector('#gc-pj').getClientRects().length > 0));
  ok('no page errors (desk)', !A.errs.length, A.errs);
  await A.close(); OPEN.length = 0;

  seed();
  const O = await computer('O', { build, mobile: true }); OPEN.push(O);
  ok('office signs in on a phone', await signIn(O, 'office@grayco-cs.com', 20000));
  await sleep(4000); await O.ev(() => window._setView('leads')); await sleep(3000);
  const vo = await O.ev(tabBtn);
  ok('the office has the Permits tab', vo.includes('permits=🏗 Permits'), vo);
  await O.ev(() => document.querySelector('#gc-leads-hub [data-gcl-v="permits"]').click());
  await waitFor(O, () => document.querySelectorAll('#gcl-pj-wrap #gc-pj tr[data-k], #gcl-pj-wrap #gc-pj [data-k]').length >= 2, null, 15000);
  const so = await O.ev(() => ({ n: document.querySelectorAll('#gcl-pj-wrap [data-k]').length, sw: document.documentElement.scrollWidth, vw: innerWidth }));
  ok('phone: the permits show and the page does not scroll sideways', so.n >= 2 && so.sw <= so.vw + 1, so);
  ok('no page errors (phone)', !O.errs.length, O.errs);
  await O.close(); OPEN.length = 0;

  seed();
  const P = await computer('P', { build }); OPEN.push(P);
  ok('a PM signs in', await signIn(P, 'pm@grayco-cs.com', 20000));
  await sleep(4000); await P.ev(() => window._setView('leads')); await sleep(3000);
  const vp = await P.ev(tabBtn);
  ok('a PM has no Permits tab (role gate)', vp.length > 0 && !vp.some(x => /^permits=/.test(x)), vp);
} catch (e) { ok('crash: ' + (e && e.stack), false); }
for (const x of OPEN) { try { await x.close(); } catch (e) {} }
const nF = R.filter(x => !x).length;
console.log(nF ? 'FAILED ' + (R.length - nF) + '/' + R.length : 'PERMTAB ' + R.length + '/' + R.length);
process.exit(nF ? 1 : 0);
