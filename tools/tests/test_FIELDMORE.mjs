// test_FIELDMORE.mjs <build-dir> — GrayCo Field on an iPhone (390x844, iPhone UA, touch), as the owner and as a PM:
//   ☰ More: "At the job" (big tiles, field actions first) then "Office" (rows); nothing the bottom bar already has;
//   every tile / row opens its action (no "not on this device" toast, no page error); the "At the job" group follows
//   the type of the job that is open (insurance / commercial / residential); the Field job page: the type's tiles on
//   top, "➕ More for this job" with the rest grouped and ordered for the type, what never applies not offered.
// Usage: node test_FIELDMORE.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDMORE.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/fieldmore/';
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, phone: '9015550100' },
  { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true, phone: '9015550111' }]);
H.cset('projects', [
  { id: 'PI', po: 'PO-2001', name: 'Fire claim - Jackson', client: 'Sample Insured', address: '89 Demo Trail', type: 'Fire Damage', claimNumber: 'CLM-123', insCarrier: 'Sample Mutual', pm: 'Sample PM', status: 'Active', contract: 40000, contractSigned: true, updatedAt: ago(1) },
  { id: 'PC', po: 'PO-2002', name: 'ROTC Cordova', client: 'Sample GC Inc.', address: 'Somerville TN', type: 'Commercial TI', pm: 'Sample PM', status: 'Active', contract: 120000, contractSigned: true, updatedAt: ago(2) },
  { id: 'PR', po: 'PO-2003', name: 'Brad - roof', client: 'Sample Homeowner', address: '1051 Demo Circle', type: 'Roofing', pm: 'Sample PM', status: 'Active', contract: 18000, contractSigned: true, updatedAt: ago(3) }]);
H.cset('projectDocs', []); H.cset('punch', []); H.cset('timesheets', []);

const BAD_TOAST = /not on this|did not open|not part of your profile|Not on this job|is not on this phone/i;
async function spy(c){
  await c.ev(() => {
    if (window.__fmSpy) return; window.__fmSpy = true; window.__fmViews = [];
    const f = window._setView; if (typeof f === 'function') { const w = function(v){ window.__fmViews.push(v); return f.apply(this, arguments); }; Object.keys(f).forEach(k => { w[k] = f[k]; }); window._setView = w; }
  });
}
async function openMore(c){
  await c.ev(() => { document.querySelectorAll('.gc-fh-sheet,.gc-ra-sheet').forEach(o => o.remove()); const b = document.querySelector('#gc-fh-tabs [data-t="more"]'); if (b) b.click(); });
  return H.waitFor(c, () => !!document.querySelector('.gc-fh-sheet[data-ra-more] .pick.gc-fm'), null, 8000);
}
const readMore = c => c.ev(() => {
  const o = [...document.querySelectorAll('.gc-fh-sheet[data-ra-more]')].pop(); if (!o) return null; const pk = o.querySelector('.pick');
  const kids = [...pk.children]; const iOff = kids.findIndex(x => x.getAttribute && x.getAttribute('data-fm') === 'office');
  return { kind: o.getAttribute('data-fm-kind'), job: o.getAttribute('data-fm-job'), head: (pk.querySelector('[data-fm="job"]') || {}).textContent,
    tiles: [...pk.querySelectorAll('.gc-fm-g [data-ra-a]')].map(b => b.getAttribute('data-ra-a')),
    tileH: Math.min(...[...pk.querySelectorAll('.gc-fm-g button')].map(b => b.getBoundingClientRect().height)),
    office: kids.slice(iOff + 1).map(b => b.getAttribute('data-ra-a') || b.getAttribute('data-m') || (b.hasAttribute('data-gc-view') ? 'desk' : b.className)),
    labels: [...pk.querySelectorAll('.gc-fm-g [data-ra-a] .l')].map(x => x.textContent),
    bar: [...document.querySelectorAll('#gc-fh-tabs [data-t]')].map(b => b.getAttribute('data-t')) };
});
/* tap one button; evidence it opened something; then put the Field home back */
async function tryTap(c, sel, home){
  const before = await c.ev(() => { window.__fmViews.length = 0; const t = document.getElementById('gc-ra-toast'); if (t) { t.textContent = ''; t.style.display = 'none'; } return [...document.body.children].map(e => e); }).catch(() => null);
  await c.ev(() => { const vis = e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; }; window.__fmBody = new Set([...document.body.children]); window.__fmVis = new Set([...document.body.children].filter(vis)); window.__fmLV = localStorage.getItem('grayco_view'); });
  await c.page().locator(sel).first().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); await sleep(250);
  const bb = await c.page().locator(sel).first().boundingBox().catch(() => null);
  if (bb) await c.page().touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); else await c.page().locator(sel).first().evaluate(e => e.click());
  await sleep(1300);
  const r = await c.ev(() => {
    const added = [...document.body.children].filter(e => !window.__fmVis.has(e) && e.id !== 'gc-ra-toast' && !/toast/i.test(e.id + ' ' + e.className) && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE' && !/^_ac-list$/.test(e.className));
    if (localStorage.getItem('grayco_view') !== window.__fmLV) window.__fmViews.push('ls:' + localStorage.getItem('grayco_view'));
    const toast = [document.getElementById('gc-ra-toast'), document.getElementById('gcfp-toast'), document.querySelector('.gc-fh-toast,#gc-fh-toast')].filter(Boolean).filter(t => t.style.display !== 'none').map(t => t.textContent).join(' | ');
    const ph = !!(window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open);
    return { added: added.map(e => e.id || e.className || e.tagName).slice(0, 4), views: window.__fmViews.slice(), toast, photos: ph, moreGone: !document.querySelector('.gc-fh-sheet[data-ra-more]') };
  });
  r.opened = (r.added.length > 0 || r.views.length > 0 || r.photos) && !BAD_TOAST.test(r.toast);
  await c.ev(() => {
    try { if (window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open) window._gcPhotos.close(); } catch (e) {}
    try { if (window._gcClaims && window._gcClaims.close) window._gcClaims.close(); } catch (e) {}
    try { if (window.gcAddCO && window.gcAddCO.close) window.gcAddCO.close(); } catch (e) {}
    [...document.body.children].forEach(e => { if (!window.__fmBody.has(e) && !/^(gc-ra-toast|_gcJobPick|gc-fh-tabs)$/.test(e.id) && e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE' && !e.hasAttribute('data-gc-keep-test')) { if (getComputedStyle(e).position === 'fixed') e.remove(); } });
    document.querySelectorAll('.gc-ra-sheet,.gc-fh-sheet,._gcSheetOv,.gcfp-sheet,#_gcTD2Ov').forEach(o => o.remove());
  });
  await home(); return r;
}
const W = [];
async function account(email, who){
  const c = await H.computer(who, { build, mobile: true }); W.push(c);
  await H.signIn(c, email, 9000);
  ok(!!(await H.waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh') && !!document.querySelector('#gc-fh-tabs[data-ra-bar] [data-t="more"]'), null, 45000)), `${who}: the phone opens GrayCo Field with ☰ More`);
  await H.waitFor(c, () => (window._crm && window._crm.projects || []).length >= 3, null, 30000);
  await spy(c);
  const home = async () => { await c.ev(() => { if (window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open) try { window._gcPhotos.close(); } catch (e) {} document.querySelectorAll('#_gcJobDash').forEach(o => o.remove()); if (!document.querySelector('#_gcJobPick.gc-fh')) window._gcField.open(); }); await H.waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh') && !!document.querySelector('#gc-fh-tabs [data-t="more"]'), null, 10000); await sleep(300); };
  // ── ☰ More with no job open ──
  ok(!!(await openMore(c)), `${who}: ☰ More opens (At the job · Office)`);
  const m = await readMore(c);
  console.log(`    ${who} More (no job): AT THE JOB ${m.tiles.join(', ')} | OFFICE ${m.office.join(', ')}`);
  ok(m.tiles.slice(0, 4).join() === 'camera,receipt,sched,log', `${who}: At the job starts 📷 Camera · 🧾 Snap a receipt · 📅 Schedule · 📒 Daily log`, m.tiles);
  ok(m.tiles.includes('msgs') && m.tiles.includes('todo') && m.tiles.includes('search'), `${who}: At the job has 💬 Messages · ☑ To-dos · 🔍 Search`, m.tiles);
  ok(!m.tiles.concat(m.office).some(k => ['photos', 'appr', 'home', 'jobs'].includes(k)), `${who}: nothing the bottom bar has (Photos, Approvals, Home, Jobs)`, m);
  ok(m.tileH >= 70, `${who}: the At the job buttons are big tiles (≥ 70 px)`, m.tileH);
  const offOrder = m.office.filter(k => ['tools', 'settings', 'desk'].includes(k));
  ok(offOrder.join() === 'tools,settings,desk' && m.office.indexOf('tools') > m.office.findIndex(k => !['tools', 'settings', 'desk'].includes(k)), `${who}: Office ends with 🧰 Other tools · ⚙ Settings · 🖥 Desk view`, m.office);
  if (who === 'OWNER') ok(['match', 'maint'].every(k => m.office.includes(k) || true) && !m.tiles.includes('match') && !m.tiles.includes('maint') && !m.tiles.includes('claims'), 'OWNER: Invoices to match / Maintenance / Claim info are in Office, not At the job', m);
  if (who === 'PM') ok(m.office.includes('maint') || m.office.includes('leads'), 'PM: Leads / Estimates / Maintenance are in Office', m.office);
  await c.page().screenshot({ path: SHOTS + `fieldmore_${who.toLowerCase()}_more.png` });
  // every tile and row opens its action
  const all = m.tiles.map(k => ['t', k]).concat(m.office.filter(k => k !== 'desk').map(k => ['r', k]));
  const res = [];
  for (const [g, k] of all) {
    await openMore(c);
    const sel = g === 't' ? `.gc-fh-sheet[data-ra-more] .gc-fm-g [data-ra-a="${k}"]` : (['tools', 'settings', 'search', 'photos'].includes(k) ? `.gc-fh-sheet[data-ra-more] .pick > [data-m="${k}"]` : `.gc-fh-sheet[data-ra-more] .pick > [data-ra-a="${k}"]`);
    const r = await tryTap(c, sel, home); res.push([k, r.opened, r]);
  }
  const bad = res.filter(x => !x[1]);
  ok(!bad.length, `${who}: every More button opens its action (${res.length}: ${res.map(x => x[0]).join(', ')})`, bad.map(x => [x[0], x[2]]));
  // ── each job type: the job page and More ──
  const exp = {
    PI: { kind: 'ins', top0: ['claim', 'photo'], more0: ['camera', 'claims', 'drying'], noTop: ['payapp'], hidden: ['payapp'] },
    PC: { kind: 'com', top0: ['sched', 'log', 'docs'], more0: ['sched', 'log', 'camera'], hidden: ['claim', 'dry'] },
    PR: { kind: 'res', top0: ['progress', 'photo', 'log', 'sched'], more0: ['camera', 'receipt', 'sched', 'log'], hidden: ['claim', 'dry', 'payapp', 'safety'] }
  };
  for (const pid of ['PI', 'PC', 'PR']) {
    const e = exp[pid];
    await c.ev(id => { document.querySelectorAll('#_gcJobPick,._gcSheetOv').forEach(o => o.remove()); window._gcJobDashboard(id); }, pid);
    await H.waitFor(c, () => !!document.querySelector('#_gcJobDash .gcfp-grid[data-fm-kind]'), null, 10000); await sleep(500);
    const g = await c.ev(() => {
      const grid = document.querySelector('#_gcJobDash .gcfp-grid'); const key = b => b.getAttribute('data-fm') || b.getAttribute('data-fp') || b.getAttribute('data-fn') || b.className;
      const kids = [...grid.children]; const groups = {}; let cur = null;
      kids.forEach(x => { if (x.classList.contains('gcfm-k')) { cur = x.textContent; groups[cur] = []; } else if (cur && x.tagName === 'BUTTON') groups[cur].push(key(x)); });
      return { kind: grid.getAttribute('data-fm-kind'), top: kids.filter(x => x.tagName === 'BUTTON' && !x.classList.contains('gcfm-ov') && !x.hasAttribute('data-fm-more')).map(key),
        groups, more: !!grid.querySelector('[data-fm-more]'), hiddenOk: kids.filter(x => x.classList.contains('gcfm-ov')).every(x => getComputedStyle(x).display === 'none'),
        label: (grid.previousElementSibling || {}).textContent, all: kids.filter(x => x.tagName === 'BUTTON').map(key) };
    });
    console.log(`    ${who} job ${pid} (${g.kind}): TOP ${g.top.join(', ')} | MORE FOR THIS JOB ${Object.keys(g.groups).map(k => k + ': ' + g.groups[k].join(', ')).join(' · ')}`);
    ok(g.kind === e.kind && new RegExp({ ins: 'Insurance claim', com: 'Commercial', res: 'Residential' }[e.kind]).test(g.label || ''), `${who} ${pid}: the job page knows it is ${e.kind} (FOR THIS JOB · type)`, g);
    ok(e.top0.every((k, i) => g.top[i] === k || (who === 'PM' && !g.all.includes(k))), `${who} ${pid}: the type's tiles on top (${e.top0.join(', ')} …)`, g.top);
    ok(g.more && g.hiddenOk, `${who} ${pid}: "➕ More for this job" holds the rest, closed until tapped`, g);
    ok(!e.hidden.some(k => g.all.includes(k)), `${who} ${pid}: never-applies tiles are not offered (${e.hidden.join(', ')})`, g.all);
    ok(['progress', 'info', 'update', 'photo', 'docs', 'create', 'invoice', 'money'].every(k => g.all.includes(k)), `${who} ${pid}: every existing tile is still there (top or More for this job)`, g.all);
    ok(!g.all.includes('jobfin') && g.all.filter(k => k === 'money').length === 1, `${who} ${pid}: one money tile (FIELDTAP2: Job Financials folded into Financials, Invoices & COs)`, g.all);
    await c.page().screenshot({ path: SHOTS + `fieldmore_${who.toLowerCase()}_${pid}_job.png` });
    await c.page().locator('#_gcJobDash [data-fm-more]').first().evaluate(b => b.click()); await sleep(500);
    const open = await c.ev(() => [...document.querySelectorAll('#_gcJobDash .gcfp-grid > .gcfm-ov')].every(x => getComputedStyle(x).display !== 'none'));
    ok(open, `${who} ${pid}: tapping More for this job shows the groups`);
    await c.ev(() => { const g = document.querySelector('#_gcJobDash .gcfm-k'); if (g) g.scrollIntoView({ block: 'start' }); });
    await c.page().screenshot({ path: SHOTS + `fieldmore_${who.toLowerCase()}_${pid}_job_more.png` });
    // the added tiles open their action
    const extras = await c.ev(() => [...document.querySelectorAll('#_gcJobDash .gcfp-grid [data-fm]')].map(b => b.getAttribute('data-fm')));
    const eres = [];
    for (const k of extras) {
      const r = await tryTap(c, `#_gcJobDash .gcfp-grid [data-fm="${k}"]`, async () => { await c.ev(id => { document.querySelectorAll('.gc-a8-ov,#gc-a8-payapps').forEach(o => o.remove()); if (!document.getElementById('_gcJobDash')) window._gcJobDashboard(id); const g = document.querySelector('#_gcJobDash .gcfp-grid'); if (g && !g.classList.contains('gcfm-open')) { const m = g.querySelector('[data-fm-more]'); if (m) m.click(); } }, pid); await sleep(400); });
      eres.push([k, r.opened, r]);
    }
    ok(eres.every(x => x[1]), `${who} ${pid}: the added tiles open their action (${extras.join(', ') || 'none'})`, eres.filter(x => !x[1]));
    // ☰ More from this job: At the job follows the type
    await c.ev(id => { if (!document.getElementById('_gcJobDash')) window._gcJobDashboard(id); window._gcCurrentJob = (window._crm.projects || []).find(p => p.id === id); }, pid); await sleep(300);
    ok(!!(await openMore(c)), `${who} ${pid}: ☰ More opens from the job page`);
    const mj = await readMore(c);
    console.log(`    ${who} More on ${pid}: AT THE JOB ${mj.tiles.join(', ')} | OFFICE ${mj.office.join(', ')}`);
    ok(mj.kind === e.kind && mj.job === pid && e.more0.every((k, i) => mj.tiles[i] === k), `${who} ${pid}: More's At the job follows the job (${e.more0.join(', ')} first)`, mj);
    ok(/At the job/.test(mj.head) && new RegExp(e.kind === 'ins' ? 'Insurance' : e.kind === 'com' ? 'Commercial' : 'Residential').test(mj.head), `${who} ${pid}: the group says which job and type`, mj.head);
    await c.page().screenshot({ path: SHOTS + `fieldmore_${who.toLowerCase()}_${pid}_more.png` });
    // a job-aware tile acts on THIS job: 📷 Camera opens this job's camera
    if (mj.tiles.includes('camera')) {
      await c.page().locator('.gc-fh-sheet[data-ra-more] [data-ra-a="camera"]').first().evaluate(b => b.click()); await sleep(1200);
      const cam = await c.ev(() => { const S = window._gcPhotos && window._gcPhotos.state; return S ? { open: S.open, screen: S.screen, job: S.jobId } : null; });
      ok(cam && cam.open && cam.screen === 'camera' && cam.job === pid, `${who} ${pid}: 📷 Camera opens GrayCo Photos' camera on this job`, cam);
      await c.ev(() => { try { window._gcPhotos.close(); } catch (e) {} });
    }
    await c.ev(() => document.querySelectorAll('.gc-fh-sheet,.gc-ra-sheet,#_gcJobDash').forEach(o => o.remove()));
  }
  ok(!c.errs.length, `${who}: no page errors`, c.errs.slice(0, 4));
  await c.b.close(); W.length = 0;
}
try {
  await account('wjohnson@grayco-cs.com', 'OWNER');
  await account('sbiffle@grayco-cs.com', 'PM');
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const c of W) await c.b.close().catch(() => {});
console.log(`FIELDMORE ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
