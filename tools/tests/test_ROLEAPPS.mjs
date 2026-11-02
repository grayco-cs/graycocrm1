// test_ROLEAPPS.mjs <build-dir> — role apps (patch ROLEAPPS): each role opens on its own home with its own buttons and bottom
// bar — GrayCo Field on a phone (390x844, touch), the Desk app on a computer (1366x900), crews always Field, Marketing unchanged —
// every home button and bar button opens its screen with no page errors, and the owner's 👁 View as… switches the app.
// Offline harness, made-up data. Screenshots: SHOTS (default the scratchpad's roleapps_shots/).
// Usage: node test_ROLEAPPS.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs; ONLY=pm,est… to run some roles)
import fs from 'fs';
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_ROLEAPPS.mjs <dir with index.html>'); process.exit(2); }
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/roleapps_shots/';
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const sleep = H.sleep;
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const today = ymd(new Date()), ago = d => new Date(Date.now() - d * 864e5).toISOString(), inDays = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 16);
const TOK = 'B'.repeat(43), PURL = 'https://app.local/portal.html#t=' + TOK;

/* the people: one per role (made-up names) */
const PEOPLE = {
  admin:  { email: 'wjohnson@grayco-cs.com' },
  pm:     { email: 'sbiffle@grayco-cs.com' },
  office: { email: 'office@grayco-cs.com' },
  est:    { email: 'est.demo@grayco-cs.com', pw: 'Correct-Horse-41' },
  ins:    { email: 'ins.demo@grayco-cs.com', pw: 'Correct-Horse-42' },
  mit:    { email: 'mit.demo@grayco-cs.com', pw: 'Correct-Horse-43' },
  crew:   { email: 'crew.demo@grayco-cs.com', pw: 'Correct-Horse-44' },
  mkt:    { email: 'mkt.demo@grayco-cs.com', pw: 'Correct-Horse-45' }
};
for (const k of Object.keys(PEOPLE)) { const p = PEOPLE[k]; if (p.pw && !H.ACCOUNTS[p.email]) H.ACCOUNTS[p.email] = { pw: p.pw, id: 'u-' + k, role: 'staff' }; }
function seed(){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, phone: '9015550100' },
    { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true, phone: '9015550111' },
    { id: 'u5', name: 'Office Desk', email: 'office@grayco-cs.com', role: 'Office Manager', active: true },
    { id: 'u6', name: 'Demo Estimator', email: 'est.demo@grayco-cs.com', role: 'Estimator', active: true },
    { id: 'u7', name: 'Demo Insurance', email: 'ins.demo@grayco-cs.com', role: 'Insurance', active: true },
    { id: 'u8', name: 'Demo Mitigation', email: 'mit.demo@grayco-cs.com', role: 'Mitigation', active: true },
    { id: 'u9', name: 'Demo Super', email: 'crew.demo@grayco-cs.com', role: 'Superintendent', active: true },
    { id: 'u10', name: 'Demo Marketing', email: 'mkt.demo@grayco-cs.com', role: 'Marketing Manager', active: true }]);
  H.cset('projects', [
    { id: 'P1', po: 'PO-2001', autoPO: 'PO-2001', name: 'Demo Kitchen Remodel', client: 'Sample Homeowner', clientPhone: '9015551234', address: '100 Demo St, Bartlett TN', pm: 'Sample PM', superintendent: 'Demo Super', estimator: 'Demo Estimator', status: 'Active', contract: 25000, contractSigned: true, pct: 40, portalUrl: PURL, updatedAt: ago(1),
      subs: [{ id: 'r1', subId: 'S1', name: 'Ace Drywall', trade: 'Drywall', status: 'Awarded' }] },
    { id: 'P2', po: 'PO-2002', name: 'Other PM Roof', client: 'Second Homeowner', address: '200 Demo Ave, Cordova TN', pm: 'Other PM', status: 'Active', contract: 14000, contractSigned: true, pct: 10, updatedAt: ago(5) },
    { id: 'P3', po: 'PO-2003', name: 'Water Loss Dry-out', client: 'Third Homeowner', address: '300 Demo Rd', pm: 'Sample PM', mitTech: 'Demo Mitigation', status: 'In Progress', contract: 9000, contractSigned: true, updatedAt: ago(0.2) },
    { id: 'P4', po: 'PO-2004', name: 'Done Bath', client: 'Fourth Homeowner', address: '400 Demo Ln', pm: 'Sample PM', status: 'Completed', contract: 7000, contractSigned: true, updatedAt: ago(0.5) }]);
  H.cset('subs', [{ id: 'S1', name: 'Ace Drywall', company: 'Ace Drywall', trade: 'Drywall', isSub: true, phone: '9015552000' }]);
  H.cset('schedule', [{ id: 'SC1', pid: 'P1', projectId: 'P1', date: today, title: 'Drywall hang', sub: 'Ace Drywall', start: today, end: today },
    { id: 'SC2', pid: 'P3', projectId: 'P3', date: today, title: 'Moisture readings', start: today, end: today }]);
  H.cset('leads', [
    { id: 'L1', name: 'Bid — demo warehouse', client: 'Demo Warehouse Co', type: 'Commercial', leadKind: 'Commercial', stage: 'New Lead', bidDue: inDays(1), estimator: 'Demo Estimator', pm: 'Demo Estimator', createdAt: ago(2), updatedAt: ago(2) },
    { id: 'L2', name: 'Burst pipe — flooding now', client: 'Demo Emergency', type: 'Restoration – Water', stage: 'New Lead', emergency: true, urgency: 'Emergency', phone: '9015553333', pm: 'Demo Insurance', createdAt: ago(0.05), updatedAt: ago(0.05) },
    { id: 'L3', name: 'Roof estimate', client: 'Demo Roof Lead', type: 'Roofing', stage: 'New Lead', pm: 'Demo Estimator', estimator: 'Demo Estimator', createdAt: ago(1), updatedAt: ago(1) }]);
  H.cset('invs', [{ id: 'INV1', pid: 'P1', type: 'client', num: '2001', amt: 10000, status: 'paid' }]);
  H.cset('punch', []); H.cset('timesheets', []); H.cset('cos', []);
}
/* roles → what must show */
const ROLES = {
  admin:  { app: 'admin',  field: ['Home', 'Jobs', 'Approvals', 'Photos', 'More'], desk: ['Home', 'Jobs', 'Approvals', 'Photos', 'More'] },
  pm:     { app: 'pm',     field: ['Home', 'My Jobs', 'Approvals', 'Photos', 'More'], desk: ['Home', 'My Jobs', 'Approvals', 'Photos', 'More'] },
  est:    { app: 'est',    field: ['Home', 'Leads', 'Estimates', 'Photos', 'More'], desk: ['Home', 'Leads', 'Estimates', 'Photos', 'More'] },
  ins:    { app: 'ins',    field: ['Home', 'Claims', 'Leads', 'Photos', 'More'], desk: ['Home', 'Claims', 'Leads', 'Photos', 'More'] },
  mit:    { app: 'ins',    field: ['Home', 'Claims', 'Leads', 'Photos', 'More'], desk: ['Home', 'Claims', 'Leads', 'Photos', 'More'] },
  crew:   { app: 'crew',   field: ['Home', 'Today', 'Photos', 'Messages'], desk: null },
  office: { app: 'office', field: ['Home', 'Approvals', 'Messages', 'More'], desk: ['Home', 'Approvals', 'Messages', 'More'] }
};
const HOMEBTN = { admin: ['appr', 'leads', 'money', 'viewas', 'systems', 'addjob'], pm: ['log', 'photos', 'punch', 'sched', 'msgs', 'appr'], est: ['bids', 'visit', 'roofscout', 'myleads', 'quickest', 'photos'],
  ins: ['emerg', 'oncall', 'drying', 'equip', 'photos', 'claims', 'tpa'], crew: ['clock', 'photos', 'log', 'punch'], office: ['appr', 'msgs', 'match', 'todo'] };
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const W = []; const closeAll = async () => { for (const c of W) await c.b.close().catch(() => {}); W.length = 0; };

async function mocks(c){
  await c.ctx.route(u => /\/storage\/v1\//.test(u.href || u), r => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
  await c.ctx.route(u => /\/\.netlify\/functions\/(bid-inbox|texts|portal-access)/.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
}
async function device(name, mobile){
  const c = await H.computer(name, { build, mobile }); W.push(c); await mocks(c);
  if (!mobile) await c.page().setViewportSize({ width: 1366, height: 900 });
  return c;
}
const homeSel = (where, app) => where === 'field' ? `#_gcJobPick.gc-fh[data-ra="${app}"] .gc-ra-q` : `#gc-ra-desk[data-app="${app}"]`;
const visible = (c, sel) => c.ev(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; }, sel);
async function waitHome(c, where, app, ms = 45000){ return H.waitFor(c, ([w, a, s]) => { const st = window._gcRA && window._gcRA.state(); const e = document.querySelector(s); return !!(st && st.app === a && e && e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none'); }, [where, app, homeSel(where, app)], ms, 300); }
async function barLabels(c, where){ return c.ev(w => [...document.querySelectorAll(w === 'field' ? '#gc-fh-tabs [data-t]' : '#gc-ra-dock [data-t]')].filter(b => b.getClientRects().length).map(b => b.textContent.replace(/[^A-Za-z ]/g, '').trim()), where); }
/* back to the role's home, every overlay put away */
async function goHome(c, where){
  await c.ev(w => {
    try { window._gcPhotos && window._gcPhotos.close && window._gcPhotos.close(); } catch (e) {}
    try { window._gcClaims && window._gcClaims.close && window._gcClaims.close(); } catch (e) {}
    document.querySelectorAll('[data-ra-mark="new"]').forEach(o => { try { o.remove(); } catch (e) {} });
    document.querySelectorAll('.gc-ra-sheet,.gc-fh-sheet,.gcfp-sheet,#_gcJobMsgOv,._gcSheetOv,.gcsub-sheet,#gc-vas-ov,.gc-money-ov,#_gcJobDash,#gc-x10-ov').forEach(o => o.remove());
    if (w === 'field') { try { window._gcField.open(); } catch (e) {} } else { try { window._setView('dashboard'); } catch (e) {} try { window._gcRA.open(); } catch (e) {} }
  }, where);
  await sleep(700);
}
/* tap one button; "opened" = the CRM changed screen (and the desk home stepped aside), or a new / newly shown overlay is on top */
async function tryButton(c, where, sel, label){
  const before = await c.ev(() => { [...document.body.children].forEach(e => { e.__raVis = !!(e.getClientRects().length && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'); e.__raSeen = 1; }); const t = document.getElementById('gc-ra-toast'); if (t) t.style.display = 'none'; return { view: localStorage.getItem('grayco_view'), errs: 0 }; });
  const e0 = c.errs.length;
  const loc = c.page().locator(sel).first();
  await loc.waitFor({ state: 'attached', timeout: 4000 }).catch(() => {});
  if (!(await loc.count())) { await c.page().screenshot({ path: SHOTS + 'nobutton_' + label + '.png' }).catch(() => {}); return { ok: false, why: 'no button ' + sel, home: await c.ev(() => { const h = document.getElementById('_gcJobPick'); return h ? h.className + ' :: ' + h.innerHTML.slice(0, 300) : 'none'; }), have: await c.ev(() => [...document.querySelectorAll('[data-ra-a]')].map(b => b.getAttribute('data-ra-a')).join(',') + ' | ' + JSON.stringify(window._gcRA.state())) }; }
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  try { if (c.mobile) await loc.tap({ timeout: 5000 }); else await loc.click({ timeout: 5000 }); } catch (e) { return { ok: false, why: 'tap: ' + String(e.message).slice(0, 160) }; }
  await sleep(1300);
  let r = await c.ev(() => {
    const vis = e => !!(e.getClientRects().length && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden');
    const skip = /^(gc-ra-toast|gc-fh-toast|gcfp-toast|gc-ra-dock|gc-fh-tabs|gc-ra-desk)$/;
    const fresh = [...document.body.children].filter(e => !skip.test(e.id || '') && !(e.id === '_gcJobPick' && e.classList.contains('gc-fh')) && vis(e) && (!e.__raSeen || !e.__raVis) && e.getBoundingClientRect().width * e.getBoundingClientRect().height > 20000);
    fresh.forEach(e => { if (!e.__raSeen) e.setAttribute('data-ra-mark', 'new'); });
    const top = fresh.length ? (() => { const r = fresh[fresh.length - 1].getBoundingClientRect(); const el = document.elementFromPoint(Math.min(innerWidth - 2, r.left + r.width / 2), Math.min(innerHeight - 2, r.top + Math.min(r.height / 2, 200))); return !!el && fresh.some(f => f.contains(el)); })() : null;
    const t = document.getElementById('gc-ra-toast');
    const st = window._gcRA.state();
    return { view: localStorage.getItem('grayco_view'), fresh: fresh.map(e => e.id || String(e.className).slice(0, 30)), top, desk: st.desk, toast: t && t.style.display === 'block' ? t.textContent : '', picker: !!document.querySelector('.gc-ra-sheet [data-pj]') };
  });
  /* a job button with several jobs: pick the first one */
  if (r.picker) {
    await c.page().locator('.gc-ra-sheet [data-pj]').first().click({ timeout: 4000 }).catch(() => {}); await sleep(1300);
    const r2 = await c.ev(() => { const vis = e => !!(e.getClientRects().length && getComputedStyle(e).display !== 'none'); const skip = /^(gc-ra-toast|gc-fh-toast|gcfp-toast|gc-ra-dock|gc-fh-tabs|gc-ra-desk)$/;
      const fresh = [...document.body.children].filter(e => !skip.test(e.id || '') && !(e.id === '_gcJobPick' && e.classList.contains('gc-fh')) && vis(e) && (!e.__raSeen || !e.__raVis) && e.getBoundingClientRect().width * e.getBoundingClientRect().height > 20000); fresh.forEach(e => { if (!e.__raSeen) e.setAttribute('data-ra-mark', 'new'); });
      const t = document.getElementById('gc-ra-toast'); return { view: localStorage.getItem('grayco_view'), fresh: fresh.map(e => e.id || String(e.className).slice(0, 30)), top: true, desk: window._gcRA.state().desk, toast: t && t.style.display === 'block' ? t.textContent : '' }; });
    r = Object.assign(r2, { picked: true });
  }
  const viewChanged = r.view !== before.view;
  const opened = (viewChanged && (where === 'field' || !r.desk)) || (r.fresh.length > 0 && r.top !== false);
  const errs = c.errs.slice(e0).filter(x => /PAGEERROR/.test(x));
  return { ok: opened && !r.toast && !errs.length, r, viewChanged, errs, label };
}
const SKIPBAR = { home: 1 };

async function roleRun(role, where){
  const R = ROLES[role], P = PEOPLE[role], mobile = where === 'field';
  if (where === 'desk' && !R.desk) {
    /* crews always get Field — also on a computer */
    seed(); const c = await device(role.toUpperCase() + '-D', false); await H.signIn(c, P.email, 9000);
    const h = await waitHome(c, 'field', R.app);
    ok(!!h, `${role} on a computer: GrayCo Field (crews always get Field), no desk home`, await c.ev(() => window._gcRA && window._gcRA.state()));
    ok(!(await visible(c, '#gc-ra-desk')), `${role} on a computer: no Desk app`);
    const bl = await barLabels(c, 'field');
    ok(JSON.stringify(bl) === JSON.stringify(R.field), `${role} on a computer: the Field bar ${R.field.join(' · ')}`, bl);
    await c.page().screenshot({ path: SHOTS + `${role}_desk_1366.png` });
    ok(!c.errs.filter(x => /PAGEERROR/.test(x)).length, `${role} on a computer: no page errors`, c.errs.slice(0, 3));
    await closeAll(); return;
  }
  seed();
  const c = await device(role.toUpperCase() + (mobile ? '-F' : '-D'), mobile);
  await H.signIn(c, P.email, 9000);
  const h = await waitHome(c, where, R.app);
  const st = await c.ev(() => window._gcRA && window._gcRA.state());
  ok(!!h, `${role} ${mobile ? 'phone' : 'computer'}: opens on the ${R.app} ${where} home`, st);
  if (!h) { await c.page().screenshot({ path: SHOTS + `${role}_${where}_FAIL.png` }); await closeAll(); return; }
  await sleep(1500);
  const bl = await barLabels(c, where);
  ok(JSON.stringify(bl) === JSON.stringify(R[where]), `${role} ${where}: bottom bar ${R[where].join(' · ')}`, bl);
  const btns = await c.ev(([w, a]) => [...document.querySelectorAll(w === 'field' ? '#_gcJobPick .gc-ra-q [data-ra-a]' : '#gc-ra-desk .gc-ra-tiles [data-ra-a]')].map(b => b.getAttribute('data-ra-a')), [where, R.app]);
  ok(JSON.stringify(btns) === JSON.stringify(HOMEBTN[R.app]), `${role} ${where}: the home buttons ${HOMEBTN[R.app].join(', ')}`, btns);
  if (where === 'desk') {
    const look = await c.ev(() => { const d = document.getElementById('gc-ra-desk'); const r = d.getBoundingClientRect(); const body = d.querySelector('.ra-body'); return { full: r.width >= innerWidth - 1 && r.bottom >= innerHeight - 1 && r.top < 120, bg: getComputedStyle(d).backgroundColor, pageScroll: document.scrollingElement.scrollHeight > innerHeight + 2 && getComputedStyle(document.body).overflow !== 'hidden', inner: getComputedStyle(body).overflowY }; });
    ok(look.full && /245, 246, 248/.test(look.bg) && look.inner === 'auto', `${role} desk: a full-window white app (only the cards scroll)`, look);
    const cards = await c.ev(() => [...document.querySelectorAll('#gc-ra-desk .gc-ra-card')].map(x => x.getAttribute('data-card')));
    ok(cards.length >= 2, `${role} desk: the role's cards (${cards.join(', ')})`, cards);
  } else {
    const nos = await c.ev(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth + 1);
    ok(nos, `${role} phone: no sideways scroll`);
  }
  await c.page().screenshot({ path: SHOTS + `${role}_${where}_${mobile ? '390' : '1366'}.png` });
  /* every home button */
  const bad = [];
  for (const id of btns) {
    await goHome(c, where);
    const sel = where === 'field' ? `#_gcJobPick .gc-ra-q [data-ra-a="${id}"]` : `#gc-ra-desk .gc-ra-tiles [data-ra-a="${id}"]`;
    const res = await tryButton(c, where, sel, id);
    if (!res.ok) bad.push({ id, res });
  }
  ok(!bad.length, `${role} ${where}: every home button opens its screen (${btns.length})`, bad);
  /* every bar button */
  const keys = await c.ev(w => [...document.querySelectorAll(w === 'field' ? '#gc-fh-tabs [data-t]' : '#gc-ra-dock [data-t]')].map(b => b.getAttribute('data-t')), where);
  const badB = [];
  for (const k of keys) {
    await goHome(c, where);
    if (k === 'home') {
      if (where === 'desk') { await c.ev(() => window._gcRA.hide()); await sleep(300); }
      await c.page().locator((where === 'field' ? '#gc-fh-tabs' : '#gc-ra-dock') + ' [data-t="home"]').first().click({ timeout: 4000 }).catch(() => {}); await sleep(900);
      if (!(await visible(c, homeSel(where, R.app)))) badB.push({ k, why: 'home did not come back' });
      continue;
    }
    const res = await tryButton(c, where, (where === 'field' ? '#gc-fh-tabs' : '#gc-ra-dock') + ` [data-t="${k}"]`, k);
    if (!res.ok) badB.push({ k, res });
  }
  ok(!badB.length, `${role} ${where}: every bar button opens its screen (${keys.join(', ')})`, badB);
  /* More: the role's other buttons + every menu item the person already has */
  if (keys.includes('more')) {
    await goHome(c, where);
    await c.page().locator((where === 'field' ? '#gc-fh-tabs' : '#gc-ra-dock') + ' [data-t="more"]').first().click({ timeout: 4000 }).catch(() => {}); await sleep(900);
    const mo = await c.ev(w => { const sh = w === 'field' ? [...document.querySelectorAll('.gc-fh-sheet')].pop() : document.querySelector('.gc-ra-sheet'); if (!sh) return null; return { role: [...sh.querySelectorAll('[data-ra-a]')].map(b => b.getAttribute('data-ra-a')), sys: sh.querySelectorAll('[data-ra-a="nav"]').length, all: !!sh.querySelector('[data-m="tools"]') }; }, where);
    ok(!!mo && mo.role.length > 0 && (where === 'field' ? mo.all : mo.sys >= 3), `${role} ${where}: More has the role's other buttons and all systems`, mo);
    if (['admin', 'pm', 'office'].includes(role)) ok(!!mo && mo.role.includes('maint'), `${role} ${where}: More lists 🛠 Maintenance (patch MAINTTAB's tab)`, mo);   /* r17h */
    await c.page().screenshot({ path: SHOTS + `${role}_${where}_more.png` });
    if (where === 'desk' && mo && mo.sys) {
      /* a menu item from More opens that CRM screen and the home steps aside */
      const v0 = await c.ev(() => localStorage.getItem('grayco_view'));
      const t = await c.ev(() => { const b = [...document.querySelectorAll('.gc-ra-sheet [data-ra-a="nav"]')].find(x => !/dashboard/i.test(x.textContent)); return b ? b.textContent : ''; });
      await c.page().locator('.gc-ra-sheet [data-ra-a="nav"]', { hasText: t }).first().click({ timeout: 4000 }).catch(() => {}); await sleep(1200);
      const after = await c.ev(() => ({ v: localStorage.getItem('grayco_view'), desk: window._gcRA.state().desk }));
      ok(!after.desk && after.v !== v0, `${role} desk: More → "${t}" opens it (the home steps aside)`, after);
    }
  }
  /* the CRM opening a screen puts the desk home away; the dock's Home brings it back */
  if (where === 'desk') {
    await goHome(c, where);
    await c.ev(() => window._setView('projects')); await sleep(800);
    const gone = await c.ev(() => window._gcRA.state().desk);
    await c.page().locator('#gc-ra-dock [data-t="home"]').click(); await sleep(800);
    ok(!gone && (await visible(c, homeSel('desk', R.app))), `${role} desk: a CRM screen puts the home away, the dock's Home brings it back`);
  }
  const pe = c.errs.filter(x => /PAGEERROR/.test(x));
  ok(!pe.length, `${role} ${where}: no page errors`, pe.slice(0, 4));
  await closeAll();
}

async function viewAs(where){
  seed(); const mobile = where === 'field';
  const c = await device('VAS-' + where, mobile);
  await H.signIn(c, PEOPLE.admin.email, 9000);
  ok(!!(await waitHome(c, where, 'admin')), `owner ${where}: the Admin app`);
  const PLAN = [['Project Manager', 'pm', where], ['Estimator', 'est', where], ['Insurance', 'ins', where], ['Mitigation', 'ins', where], ['Superintendent', 'crew', 'field'], ['Office', 'office', where], ['Marketing Manager', '', ''], ['', 'admin', where]];
  for (const [v, a, w] of PLAN) {
    await c.ev(x => window._gcVAS.set(x), v);
    if (!a) {
      const st = await H.waitFor(c, () => { const s = window._gcRA.state(); return s.app === '' && !document.getElementById('gc-ra-dock') && !(document.getElementById('gc-ra-desk') && getComputedStyle(document.getElementById('gc-ra-desk')).display !== 'none') && (!document.getElementById('gc-fh-tabs') || !document.getElementById('gc-fh-tabs').hasAttribute('data-ra-bar')) ? s : null; }, null, 20000, 300);
      ok(!!st, `View as ${v} (${where}): no role app — Marketing exactly as before`, await c.ev(() => window._gcRA.state()));
      continue;
    }
    if (mobile || w === 'field') await c.ev(() => { try { if (!document.querySelector('#_gcJobPick.gc-fh')) window._gcField.open(); } catch (e) {} });
    const hh = await waitHome(c, w, a, 20000);
    const want = ROLES[{ pm: 'pm', est: 'est', ins: 'ins', crew: 'crew', office: 'office', admin: 'admin' }[a]][w];
    const bl = await barLabels(c, w);
    ok(!!hh && JSON.stringify(bl) === JSON.stringify(want), `View as ${v || 'Admin (exit)'} (${where}): the ${a} ${w} home and bar ${want.join(' · ')}`, { st: await c.ev(() => window._gcRA.state()), bl });
    if (v && w === where) await c.page().screenshot({ path: SHOTS + `viewas_${a}_${where}.png` });
  }
  const fm = await c.ev(() => document.documentElement.classList.contains('_fieldmode'));
  if (!mobile) ok(!fm, 'owner desk: after View as Superintendent and back, the computer is back in desk view');
  const pe = c.errs.filter(x => /PAGEERROR/.test(x));
  ok(!pe.length, `View as (${where}): no page errors`, pe.slice(0, 4));
  await closeAll();
}

try {
  for (const role of ['admin', 'pm', 'est', 'ins', 'mit', 'crew', 'office']) {
    if (ONLY && !ONLY.includes(role)) continue;
    for (const where of ['field', 'desk']) { if (process.env.WHERE && process.env.WHERE !== where) continue; console.log(`── ${role} · ${where === 'field' ? 'phone 390×844' : 'computer 1366×900'}`); await roleRun(role, where); }
  }
  if (!ONLY || ONLY.includes('mkt')) {
    for (const mobile of [true, false]) {
      console.log('── marketing · ' + (mobile ? 'phone' : 'computer'));
      seed(); const c = await device('MKT', mobile); await H.signIn(c, PEOPLE.mkt.email, 9000); await sleep(4000);
      const st = await c.ev(() => ({ ra: window._gcRA.state(), dock: !!document.getElementById('gc-ra-dock'), desk: !!document.getElementById('gc-ra-desk'), bar: !!document.querySelector('#gc-fh-tabs[data-ra-bar]'), q: !!document.querySelector('.gc-ra-q') }));
      ok(st.ra.app === '' && !st.dock && !st.desk && !st.bar && !st.q, `marketing ${mobile ? 'phone' : 'computer'}: unchanged (no role app)`, st);
      await c.page().screenshot({ path: SHOTS + `mkt_${mobile ? 'field_390' : 'desk_1366'}.png` });
      await closeAll();
    }
  }
  if (!ONLY || ONLY.includes('vas')) { console.log('── View as… (owner)'); await viewAs('desk'); await viewAs('field'); }
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
await closeAll();
console.log(`ROLEAPPS ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
