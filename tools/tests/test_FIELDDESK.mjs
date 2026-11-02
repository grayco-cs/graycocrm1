// test_FIELDDESK.mjs <build-dir> — Field or Desk (patch FIELDDESK). The owner on an HP touch-screen laptop (Windows, Edge)
// got GrayCo Field on his computer and "Desk" did not hold. Owner's rule: "always pop up desktop for computer and field
// view when on your phone screen / app on phone". Here, as the owner (admin):
//  • laptops / desktops (Windows Edge) — 1366×768 and 1920×1080, touch screen or not (also one the browser reports as
//    touch-only), Windows scaling 100 / 125 / 150 % (devicePixelRatio 1.25 / 1.5, the screen in CSS px), a browser
//    window narrower or shorter than 500 px — always open on the Desk home, and again after a reload;
//  • every Desk control (the toolbar's / old Desk-Field button, GrayCo Field's header, ☰ More, ⚙ Settings' "Use desk
//    view", the old field app's Desk View pill, job list and More) leaves Field at once and shows the Desk home;
//    a Field switch lasts for this open only — a reload is back on the Desk;
//  • a phone opens GrayCo Field; Desk there lasts for this open only ("Back to GrayCo Field" returns; a reload is Field);
//  • crews always Field (also on a computer); 👁 View as a crew member previews Field and coming back restores the
//    view the owner had (Desk or Field).
// Offline harness, made-up data. A laptop is emulated in the page (screen size, devicePixelRatio, mouse / touch pointer
// media, touch points), since the headless browser's own screen is its window. Screenshots: SHOTS.
// Usage: node test_FIELDDESK.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs; ONLY=laptops,controls,phone,crew,vas)
import fs from 'fs';
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDDESK.mjs <dir with index.html>'); process.exit(2); }
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/fielddesk_shots/';
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = k => !ONLY || ONLY.includes(k);
const OWNER = 'wjohnson@grayco-cs.com', CREW = 'crew.demo@grayco-cs.com';
if (!H.ACCOUNTS[CREW]) H.ACCOUNTS[CREW] = { pw: 'Correct-Horse-44', id: 'u-crew', role: 'staff' };
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function seed(){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Demo Owner', email: OWNER, role: 'Admin', payType: 'owner', active: true },
    { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true },
    { id: 'u9', name: 'Demo Super', email: CREW, role: 'Superintendent', active: true }]);
  H.cset('projects', [
    { id: 'P1', po: 'PO-2001', name: 'Demo Kitchen Remodel', client: 'Sample Homeowner', address: '100 Demo St', pm: 'Sample PM', superintendent: 'Demo Super', status: 'Active', contract: 25000, contractSigned: true, pct: 40 },
    { id: 'P2', po: 'PO-2002', name: 'Demo Roof', client: 'Second Homeowner', address: '200 Demo Ave', pm: 'Sample PM', status: 'Active', contract: 14000, contractSigned: true }]);
  H.cset('schedule', [{ id: 'SC1', pid: 'P1', projectId: 'P1', date: ymd(new Date()), title: 'Drywall hang', start: ymd(new Date()), end: ymd(new Date()) }]);
  H.cset('leads', []); H.cset('punch', []); H.cset('timesheets', []);
}
const W = []; const closeAll = async () => { for (const c of W) await c.b.close().catch(() => {}); W.length = 0; };
async function mocks(c){
  await c.ctx.route(u => /\/storage\/v1\//.test(u.href || u), r => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
  await c.ctx.route(u => /\/\.netlify\/functions\/(bid-inbox|texts|portal-access)/.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
}
/* a computer: the screen (CSS px, as Windows scaling reports it), devicePixelRatio, the pointers, the window */
async function laptop(name, cf){
  const c = await H.computer(name, { build }); W.push(c); await mocks(c);
  await c.ctx.addInitScript(cf => {
    const def = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
    def(Screen.prototype, 'width', cf.sw); def(Screen.prototype, 'height', cf.sh); def(Screen.prototype, 'availWidth', cf.sw); def(Screen.prototype, 'availHeight', cf.sh - 40);
    def(window, 'devicePixelRatio', cf.dpr);
    def(Navigator.prototype, 'userAgent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0');
    def(Navigator.prototype, 'platform', 'Win32');
    def(Navigator.prototype, 'userAgentData', { mobile: false, platform: 'Windows', brands: [{ brand: 'Microsoft Edge', version: '130' }] });
    if (cf.touch) { def(Navigator.prototype, 'maxTouchPoints', 10); try { window.ontouchstart = null; } catch (e) {} }
    /* a laptop: the touchpad / mouse is the main pointer (fine, hovers); a touch screen adds a coarse one */
    const M = cf.touchOnly ? { 'pointer': ['coarse'], 'any-pointer': ['coarse'], 'hover': ['none'], 'any-hover': ['none'] }   /* a touch laptop the browser reports as touch-only (tablet mode) */
      : { 'pointer': ['fine'], 'any-pointer': cf.touch ? ['fine', 'coarse'] : ['fine'], 'hover': ['hover'], 'any-hover': ['hover'] };
    const om = window.matchMedia.bind(window);
    window.matchMedia = function(q){
      const s = String(q); if (!/pointer|hover/i.test(s)) return om(q);
      const res = s.split(/\s+and\s+/i).every(cl => { const m = cl.match(/\(\s*([a-z-]+)\s*:\s*([a-z]+)\s*\)/i); if (!m || !(m[1].toLowerCase() in M)) return om(cl).matches; return M[m[1].toLowerCase()].includes(m[2].toLowerCase()); });
      return Object.create(om('all'), { matches: { value: res }, media: { value: s } });
    };
  }, cf);
  await c.page().setViewportSize({ width: cf.w, height: cf.h });
  return c;
}
const S = c => c.ev(() => {
  const vis = s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
  const ra = window._gcRA ? window._gcRA.state() : {};
  return { field: document.documentElement.classList.contains('_fieldmode'), fh: vis('#_gcJobPick.gc-fh'), pick: !!document.getElementById('_gcJobPick'), desk: vis('#gc-ra-desk'), deskApp: (document.getElementById('gc-ra-desk') || { getAttribute: () => '' }).getAttribute('data-app'),
    app: ra.app, mode: ra.mode, pref: window._gcView ? window._gcView.pref() : null, saved: localStorage.getItem('gc_view_pref') || localStorage.getItem('gc_phone_desk') || '', phone: window._gcView ? window._gcView.phone() : null, fm: (document.getElementById('_fmToggle') || {}).textContent, inner: [innerWidth, innerHeight] };
});
const isDesk = s => !!s && !s.field && s.desk && s.deskApp === 'admin' && !s.fh && s.mode === 'desk';
const isField = s => !!s && s.field && s.fh;
async function waitState(c, test, ms = 30000){ const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await S(c).catch(() => null); if (test(s)) return s; await sleep(300); } return s; }
/* stays that way (nothing puts it back a moment later) */
async function holds(c, test, ms = 5000){ const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await S(c).catch(() => null); if (!test(s)) return { broke: s }; await sleep(400); } return null; }
async function reload(c){ await c.page().reload(); await sleep(1500); }
const pe = c => c.errs.filter(x => /PAGEERROR/.test(x));

/* ── 1. every laptop / desktop shape opens on the Desk home, and again after a reload ── */
const LAPTOPS = [
  ['1366×768 100% · no touch', { w: 1366, h: 641, sw: 1366, sh: 768, dpr: 1, touch: false }],
  ['1366×768 100% · touch screen', { w: 1366, h: 641, sw: 1366, sh: 768, dpr: 1, touch: true }],
  ['1366×768 Windows 125% (dpr 1.25) · touch screen — the owner\'s laptop', { w: 1093, h: 480, sw: 1093, sh: 614, dpr: 1.25, touch: true }],
  ['1366×768 Windows 125% (dpr 1.25) · no touch', { w: 1093, h: 480, sw: 1093, sh: 614, dpr: 1.25, touch: false }],
  ['1920×1080 100% · no touch', { w: 1920, h: 950, sw: 1920, sh: 1080, dpr: 1, touch: false }],
  ['1920×1080 Windows 125% (dpr 1.25) · touch screen', { w: 1536, h: 730, sw: 1536, sh: 864, dpr: 1.25, touch: true }],
  ['1920×1080 Windows 150% (dpr 1.5) · touch screen', { w: 1280, h: 585, sw: 1280, sh: 720, dpr: 1.5, touch: true }],
  ['1920×1080 Windows 150% (dpr 1.5) · no touch', { w: 1280, h: 585, sw: 1280, sh: 720, dpr: 1.5, touch: false }],
  ['HP touch-screen laptop the browser reports as touch-only (no mouse, no hover), 125%, short window', { w: 1093, h: 480, sw: 1093, sh: 614, dpr: 1.25, touch: true, touchOnly: true }],
  ['1366×768 · a window 480 px wide', { w: 480, h: 700, sw: 1366, sh: 768, dpr: 1, touch: false }],
  ['1366×768 · a window 420 px tall', { w: 1200, h: 420, sw: 1366, sh: 768, dpr: 1, touch: true }]
];
async function laptops(){
  for (const [label, cf] of LAPTOPS) {
    console.log('── ' + label);
    seed(); const c = await laptop('L', cf);
    await H.signIn(c, OWNER, 6000);
    let s = await waitState(c, isDesk, 30000);
    ok(isDesk(s) && s.phone === false, label + ': the owner opens on the Desk home (not GrayCo Field)', s);
    const br = await holds(c, isDesk, 6000);
    ok(!br, label + ': it stays on the Desk (nothing opens Field a moment later)', br);
    ok(s && /Field/.test(s.fm || ''), label + ': the old Desk / Field button names where it goes ("📱 Field")', s && s.fm);
    await c.page().screenshot({ path: SHOTS + 'laptop_' + cf.w + 'x' + cf.h + (cf.touch ? '_touch' : '') + '.png' });
    await reload(c);
    s = await waitState(c, isDesk, 30000);
    ok(isDesk(s), label + ': after a reload, the Desk home again', s);
    const br2 = await holds(c, isDesk, 5000);
    ok(!br2, label + ': … and it stays', br2);
    if (cf.touch && cf.dpr === 1.25 && cf.w === 1093 && !cf.touchOnly) {
      /* left-overs from older versions on this computer: Field "chosen", the old sticky Field key, "desk view on this phone" */
      await c.ev(() => { localStorage.setItem('gc_view_pref', 'field'); localStorage.setItem('_fieldMode', '1'); localStorage.setItem('gc_field_dashboard', '1'); });
      await reload(c);
      s = await waitState(c, isDesk, 30000);
      ok(isDesk(s) && !(await holds(c, isDesk, 16000)), label + ': old saved Field keys on the computer: still the Desk home (and it stays past the old 15 s guard)', s);
    }
    ok(!pe(c).length, label + ': no page errors', pe(c).slice(0, 3));
    await closeAll();
  }
}

/* ── 2. every Desk control, on the owner's laptop and on a big desktop ── */
async function toField(c, how){
  if (how === 'toolbar') {
    const sel = '#gc-topbar [title*="Field view"]';
    const n = await c.page().locator(sel).count();
    let done = false;
    if (n && await c.page().locator(sel).first().isVisible().catch(() => false)) done = await c.page().locator(sel).first().click({ timeout: 4000 }).then(() => true, () => false);
    if (!done && n) done = await c.ev(s => { const b = document.querySelector(s); if (b) b.click(); return !!b; }, sel);   /* (the harness's 🔗 Connect Google banner can sit over the toolbar) */
    if (!done) await c.ev(() => document.getElementById('_fmToggle').click());   /* the toolbar clicks the old button */
  } else await c.ev(() => document.getElementById('_fmToggle').click());
  return waitState(c, s => isField(s) && s.pref === 'field', 15000);
}
async function deskAfter(c, label, t0){
  const s = await waitState(c, isDesk, 6000);
  const ms = Date.now() - t0;
  ok(isDesk(s) && s.pref === 'desk' && ms < 3500, `${label}: leaves Field at once and shows the Desk home (${ms} ms)`, s);
  const br = await holds(c, isDesk, 4500);
  ok(!br, `${label}: stays on the Desk`, br);
  return s;
}
async function controls(label, cf){
  console.log('── Desk controls · ' + label);
  seed(); const c = await laptop('C', cf);
  await H.signIn(c, OWNER, 6000);
  let s = await waitState(c, isDesk, 30000);
  ok(isDesk(s), label + ': Desk home', s);
  const tb = await c.ev(() => { const b = document.querySelector('#gc-topbar [title*="Field view"]'); return b ? b.title : (document.querySelector('#gc-topbar [title*="Desk"]') || {}).title || ''; });
  ok(!/Desk/.test(tb), label + ': the toolbar\'s button on the Desk says where it goes (Field view), not "Desk"', tb);
  /* Field: the toolbar's button → GrayCo Field, for this open only */
  s = await toField(c, 'toolbar');
  ok(isField(s), label + ': the toolbar\'s Field view → GrayCo Field', s);
  ok(s && /Desk/.test(s.fm || ''), label + ': in Field the old button says "🖥 Desk"', s && s.fm);
  await c.page().screenshot({ path: SHOTS + 'field_' + cf.w + '.png' });
  ok(s && !s.saved, label + ': nothing is saved for the next open', s && s.saved);
  await reload(c);
  s = await waitState(c, isDesk, 30000);
  ok(isDesk(s) && !s.pref, label + ': the Field switch lasts for this open only: after a reload, the Desk home (a computer)', s);
  ok(!(await holds(c, isDesk, 5000)), label + ': … and it stays');
  s = await toField(c);
  ok(isField(s), label + ': Field again for this open', s);
  /* 1. GrayCo Field's header: 🖥 Desk */
  const hb = await c.page().locator('#_gcJobPick.gc-fh .fh-top .fh-desk').first();
  const hv = await hb.isVisible().catch(() => false);
  ok(hv, label + ': GrayCo Field\'s header has a 🖥 Desk button');
  let t0 = Date.now(); if (hv) await hb.click({ timeout: 4000 }); else await c.ev(() => window._gcChooseView('desk'));
  await deskAfter(c, label + ' · header 🖥 Desk', t0);
  await c.page().screenshot({ path: SHOTS + 'desk_after_' + cf.w + '.png' });
  await reload(c);
  s = await waitState(c, isDesk, 30000);
  ok(isDesk(s), label + ': after a reload, the Desk home', s);
  ok(!(await holds(c, isDesk, 5000)), label + ': … and it stays');
  /* 2. ☰ More → 🖥 Desk view */
  await toField(c);
  await c.page().locator('#gc-fh-tabs [data-t="more"]').first().click({ timeout: 4000 }).catch(() => {}); await sleep(700);
  const mi = c.page().locator('.gc-fh-sheet [data-gc-view="desk"]').first();
  const miv = await mi.isVisible().catch(() => false);
  ok(miv, label + ': ☰ More has 🖥 Desk view');
  t0 = Date.now(); if (miv) await mi.click({ timeout: 4000 });
  await deskAfter(c, label + ' · ☰ More → Desk view', t0);
  /* 3. ☰ More → ⚙ Settings → Use desk view */
  await toField(c);
  await c.page().locator('#gc-fh-tabs [data-t="more"]').first().click({ timeout: 4000 }).catch(() => {}); await sleep(700);
  await c.page().locator('.gc-fh-sheet [data-m="settings"]').first().click({ timeout: 4000 }).catch(() => {}); await sleep(700);
  const sv = c.page().locator('.gc-fh-sheet [data-s="desk"]').first();
  const svv = await sv.isVisible().catch(() => false);
  ok(svv, label + ': ⚙ Settings has "Use desk view"');
  t0 = Date.now(); if (svv) await sv.click({ timeout: 4000 });
  await deskAfter(c, label + ' · ⚙ Settings → Use desk view', t0);
  /* 4. the old Desk / Field button (bottom left; what the toolbar clicks) */
  await toField(c);
  t0 = Date.now(); await c.ev(() => document.getElementById('_fmToggle').click());
  await deskAfter(c, label + ' · the old Desk / Field button', t0);
  /* 5. the old job list's "Desk" */
  await toField(c);
  await c.ev(() => { window.__gcFhAll = true; window._gcJobPicker(); }); await sleep(800);
  const jp = await c.ev(() => !!document.getElementById('_jpDesk'));
  ok(jp, label + ': the job list has its Desk button');
  t0 = Date.now(); await c.ev(() => { const b = document.getElementById('_jpDesk'); if (b) b.click(); });
  await deskAfter(c, label + ' · the job list\'s Desk', t0);
  /* 6. the old field app's ☰ More → Switch to Desk View */
  await toField(c);
  await waitState(c, () => true, 100);
  const om = await H.waitFor(c, () => !!document.querySelector('#_gcAppTabs [data-tab="more"]'), null, 8000, 300);
  if (om) {
    await c.ev(() => document.querySelector('#_gcAppTabs [data-tab="more"]').click()); await sleep(700);
    const has = await c.ev(() => !!document.querySelector('._mi[data-a="desk"]'));
    ok(has, label + ': the old field app\'s More has Switch to Desk View');
    t0 = Date.now(); await c.ev(() => { const b = document.querySelector('._mi[data-a="desk"]'); if (b) b.click(); });
    await deskAfter(c, label + ' · old More → Switch to Desk View', t0);
  } else ok(true, label + ': (the old field app\'s tab bar is not built on this build — skipped)');
  /* 7. the old Desk View pill (put up by a timer while in Field) */
  await toField(c);
  const pill = await H.waitFor(c, () => !!document.getElementById('_gcDeskBtn'), null, 17000, 400);
  ok(!!pill, label + ': the old 🖥 Desk View pill is there in Field');
  t0 = Date.now(); await c.ev(() => { const b = document.getElementById('_gcDeskBtn'); if (b) b.click(); });
  await deskAfter(c, label + ' · the old Desk View pill', t0);
  await reload(c);
  s = await waitState(c, isDesk, 30000);
  ok(isDesk(s), label + ': after all that and a reload, the Desk home', s);
  ok(!pe(c).length, label + ': no page errors', pe(c).slice(0, 3));
  await closeAll();
}

/* ── 3. a phone: GrayCo Field; Desk for this open only; Back to GrayCo Field returns ── */
async function phone(){
  console.log('── phone 390×844 (touch)');
  seed(); const c = await H.computer('P', { build, mobile: true }); W.push(c); await mocks(c);
  await H.signIn(c, OWNER, 6000);
  let s = await waitState(c, s => isField(s) && s.phone === true, 30000);
  ok(isField(s) && s.phone === true && !s.pref, 'phone: the owner opens in GrayCo Field (no choice made)', s);
  ok(!(await c.ev(() => { const b = document.querySelector('#_gcJobPick .fh-desk'); return b && b.getClientRects().length; })), 'phone: no header Desk button (☰ More has it)');
  await c.page().locator('#gc-fh-tabs [data-t="more"]').first().tap({ timeout: 4000 }).catch(() => {}); await sleep(700);
  const t0 = Date.now(); await c.page().locator('.gc-fh-sheet [data-gc-view="desk"]').first().tap({ timeout: 4000 }).catch(() => {});
  s = await waitState(c, s => !!s && !s.field && s.desk && s.pref === 'desk', 6000);
  ok(!!s && !s.field && s.desk && s.pref === 'desk', `phone: ☰ More → Desk view shows the Desk home (${Date.now() - t0} ms)`, s);
  const br = await holds(c, s => !!s && !s.field, 5000);
  ok(!br, 'phone: the Desk holds for this open (GrayCo Field does not come back by itself)', br);
  const back = await H.waitFor(c, () => !!document.getElementById('gc-fh-backfield'), null, 8000, 300);
  ok(!!back, 'phone: "📱 Back to GrayCo Field" is offered');
  await c.page().locator('#gc-fh-backfield').tap({ timeout: 4000 }).catch(() => c.ev(() => document.getElementById('gc-fh-backfield').click()));
  s = await waitState(c, s => isField(s) && s.pref === 'field', 8000);
  ok(isField(s), 'phone: Back to GrayCo Field → GrayCo Field', s);
  await c.ev(() => window._gcChooseView('desk')); await sleep(800);
  s = await S(c); ok(!!s && !s.field && !s.saved, 'phone: Desk again for this open, nothing saved', s);
  await reload(c);
  s = await waitState(c, isField, 30000);
  ok(isField(s) && !s.pref, 'phone: a reload opens GrayCo Field again (a phone)', s);
  ok(!pe(c).length, 'phone: no page errors', pe(c).slice(0, 3));
  await closeAll();
}

/* ── 4. crews: always Field, also on a computer ── */
async function crew(){
  console.log('── crew on a computer (1366×768)');
  seed(); const c = await laptop('K', LAPTOPS[0][1]);
  await H.signIn(c, CREW, 6000);
  let s = await waitState(c, s => isField(s) && s.app === 'crew', 30000);
  ok(isField(s) && s.app === 'crew', 'crew on a computer: GrayCo Field', s);
  ok(!(await c.ev(() => [...document.querySelectorAll('.fh-desk,[data-gc-view="desk"],#_fmToggle')].some(b => b.getClientRects().length && getComputedStyle(b).display !== 'none'))), 'crew: no Desk button shown');
  const r = await c.ev(() => window._gcChooseView('desk')); await sleep(2500);
  s = await S(c);
  ok(r === 'crew' && s.field && s.pref !== 'desk', 'crew: a Desk request is turned down — crews stay in Field', { r, s });
  await reload(c);
  s = await waitState(c, s => isField(s) && s.app === 'crew', 30000);
  ok(isField(s), 'crew: after a reload, GrayCo Field', s);
  ok(!pe(c).length, 'crew: no page errors', pe(c).slice(0, 3));
  await closeAll();
}

/* ── 5. 👁 View as a crew member previews Field; coming back restores the person's own choice ── */
async function vas(){
  for (const own of ['desk', 'field']) {
    console.log('── View as Superintendent, the owner\'s own choice: ' + own);
    seed(); const c = await laptop('V', LAPTOPS[2][1]);
    await H.signIn(c, OWNER, 6000);
    let s = await waitState(c, isDesk, 30000);
    ok(isDesk(s), 'View as (' + own + '): Desk home first', s);
    if (own === 'field') { s = await toField(c); ok(isField(s), 'View as (field): the owner switched to Field', s); }
    const p0 = s && s.pref;
    await c.ev(() => window._gcVAS.set('Superintendent'));
    s = await waitState(c, s => isField(s) && s.app === 'crew', 20000);
    ok(isField(s) && s.app === 'crew', 'View as Superintendent: the crew app in GrayCo Field', s);
    ok(s && s.pref === p0, 'View as Superintendent: the owner\'s own switch is untouched (' + (p0 || 'none') + ')', s && s.pref);
    await c.ev(() => window._gcVAS.set(''));
    const back = own === 'desk' ? isDesk : (x => isField(x) && x.app === 'admin');
    s = await waitState(c, back, 20000);
    ok(back(s) && s.pref === p0, 'back from View as: the owner\'s ' + own + ' again', s);
    ok(!(await holds(c, back, 5000)), 'back from View as: it stays');
    await reload(c);
    s = await waitState(c, isDesk, 30000);
    ok(isDesk(s), 'back from View as, after a reload: the Desk (a computer)', s);
    ok(!pe(c).length, 'View as (' + own + '): no page errors', pe(c).slice(0, 3));
    await closeAll();
  }
}

try {
  if (want('laptops')) await laptops();
  if (want('controls')) { await controls('the owner\'s laptop (1366×768 at 125%, touch)', LAPTOPS[2][1]); await controls('1920×1080 desktop', LAPTOPS[4][1]); }
  if (want('phone')) await phone();
  if (want('crew')) await crew();
  if (want('vas')) await vas();
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
await closeAll();
console.log(`FIELDDESK ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
