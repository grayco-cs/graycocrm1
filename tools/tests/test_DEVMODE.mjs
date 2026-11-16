// test_DEVMODE.mjs <build-dir> — Desk or GrayCo Field by the DEVICE (patch DEVMODE). Owner 11/16: "The desk view should
// always pull up unless it's opened from an iPhone then it should be field opening … From the phone and app always do field
// view app mode", plus a per-person "Ask me Field or Desk when I sign in" (default OFF) for someone who uses one computer
// both ways (Biffle, a PM).
//  1. devices × roles: Windows Chrome, Mac Chrome, Mac Safari, a touch-screen laptop (also one the browser reports as
//     touch-only, short window), iPhone Safari, the iPhone Home Screen app, an Android phone, an iPad (iPadOS Safari says
//     "Macintosh") — each opens the right view for admin, office, PM and field (Superintendent) roles, and keeps it;
//  2. the ask setting: off → a computer opens the Desk, no question; on → one question after sign-in, the pick holds on a
//     reload and in a new tab, sign out + in asks again; "Stop asking me" turns it off; a phone never asks;
//  3. a Desk / Field switch without the ask setting lasts for this open only (a reload / the next sign-in is the Desk);
//  4. My Profile has the person's own switch, 💎 Team access a box per person (admin), both saved in gc_kv gc_view_prefs.
// Offline harness, made-up data. Usage: node test_DEVMODE.mjs <dir with index.html>   (ONLY=devices,ask,switch,profile)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_DEVMODE.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const sleep = H.sleep;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = k => !ONLY || ONLY.includes(k);
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ADMIN = byId('u-wesley'), OFFICE = byId('u-office'), PM = byId('u-sbiffle'), CREW = byId('u-pm');
function seed(){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Office Demo', email: OFFICE, role: 'Office', active: true },
    { id: 'u3', name: 'Sample PM', email: PM, role: 'Project Manager', active: true },
    { id: 'u4', name: 'Demo Super', email: CREW, role: 'Superintendent', active: true }]);
  H.cset('projects', [
    { id: 'P1', po: 'PO-2001', name: 'Demo Kitchen Remodel', client: 'Sample Homeowner', address: '100 Demo St', pm: 'Sample PM', superintendent: 'Demo Super', status: 'Active', contract: 25000, contractSigned: true },
    { id: 'P2', po: 'PO-2002', name: 'Demo Roof', client: 'Second Homeowner', address: '200 Demo Ave', pm: 'Sample PM', superintendent: 'Demo Super', status: 'Active', contract: 14000, contractSigned: true }]);
  H.cset('leads', []); H.cset('punch', []); H.cset('timesheets', []);
}
H.onFn('staff-admin', ({ query }) => query && query.action === 'list' ? { staff: [ADMIN, OFFICE, PM, CREW].map(e => ({ email: e, name: H.ACCOUNTS[e].name, role: H.ACCOUNTS[e].role === 'admin' ? 'admin' : 'staff', active: true, profile: '' })) } : { email: '', role: 'staff' });

/* ── the devices (what the page can see: user agent, userAgentData, touch points, pointer / hover / display-mode, screen) ── */
const UA = {
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
};
const DESKP = { pointer: ['fine'], 'any-pointer': ['fine'], hover: ['hover'], 'any-hover': ['hover'] };
const TOUCHP = { pointer: ['coarse'], 'any-pointer': ['coarse'], hover: ['none'], 'any-hover': ['none'] };
const DEVICES = {
  'Windows Chrome': { ua: UA.win, plat: 'Win32', uad: { mobile: false, platform: 'Windows' }, tp: 0, mq: DESKP, sw: 1920, sh: 1080, vp: { width: 1440, height: 860 }, field: false },
  'Mac Chrome': { ua: UA.macChrome, plat: 'MacIntel', uad: { mobile: false, platform: 'macOS' }, tp: 0, mq: DESKP, sw: 1512, sh: 982, vp: { width: 1440, height: 860 }, field: false },
  'Mac Safari': { ua: UA.macSafari, plat: 'MacIntel', uad: null, tp: 0, mq: DESKP, sw: 1512, sh: 982, vp: { width: 1400, height: 820 }, field: false },
  'touch-screen laptop (Windows Edge, 125 %)': { ua: UA.win + ' Edg/131.0.0.0', plat: 'Win32', uad: { mobile: false, platform: 'Windows' }, tp: 10, mq: { pointer: ['fine'], 'any-pointer': ['fine', 'coarse'], hover: ['hover'], 'any-hover': ['hover'] }, sw: 1093, sh: 614, vp: { width: 1093, height: 480 }, field: false },
  'touch-screen laptop the browser reports as touch-only (tablet mode, short window)': { ua: UA.win + ' Edg/131.0.0.0', plat: 'Win32', uad: { mobile: false, platform: 'Windows' }, tp: 10, mq: TOUCHP, sw: 1093, sh: 614, vp: { width: 1093, height: 460 }, field: false },
  'iPhone Safari': { ua: UA.iphone, plat: 'iPhone', uad: null, tp: 5, mq: TOUCHP, sw: 390, sh: 844, vp: { width: 390, height: 844 }, mobile: true, field: true },
  'iPhone Home Screen app': { ua: UA.iphone, plat: 'iPhone', uad: null, tp: 5, mq: TOUCHP, sw: 390, sh: 844, vp: { width: 390, height: 844 }, mobile: true, standalone: true, field: true },
  'Android phone (Chrome)': { ua: UA.android, plat: 'Linux armv81', uad: { mobile: true, platform: 'Android' }, tp: 5, mq: TOUCHP, sw: 412, sh: 915, vp: { width: 412, height: 915 }, mobile: true, field: true },
  'iPad (iPadOS Safari says Macintosh)': { ua: UA.macSafari, plat: 'MacIntel', uad: null, tp: 5, mq: TOUCHP, sw: 820, sh: 1180, vp: { width: 820, height: 1180 }, mobile: true, field: true }
};
function deviceInit(cf){
  return `(() => { const cf = ${JSON.stringify(cf)};
    const def = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
    def(Navigator.prototype, 'userAgent', cf.ua); def(Navigator.prototype, 'platform', cf.plat); def(Navigator.prototype, 'maxTouchPoints', cf.tp);
    def(Navigator.prototype, 'userAgentData', cf.uad ? Object.assign({ brands: [] }, cf.uad) : undefined);
    if (cf.standalone) def(Navigator.prototype, 'standalone', true);
    def(Screen.prototype, 'width', cf.sw); def(Screen.prototype, 'height', cf.sh); def(Screen.prototype, 'availWidth', cf.sw); def(Screen.prototype, 'availHeight', cf.sh);
    const M = Object.assign({}, cf.mq, { 'display-mode': [cf.standalone ? 'standalone' : 'browser'] });
    const om = window.matchMedia.bind(window);
    window.matchMedia = function(q){
      const s = String(q); if (!/pointer|hover|display-mode/i.test(s)) return om(q);
      const res = s.split(/\\s+and\\s+/i).every(cl => { const m = cl.match(/\\(\\s*([a-z-]+)\\s*:\\s*([a-z-]+)\\s*\\)/i); if (!m || !(m[1].toLowerCase() in M)) return om(cl).matches; return M[m[1].toLowerCase()].includes(m[2].toLowerCase()); });
      return Object.create(om('all'), { matches: { value: res }, media: { value: s }, addListener: { value: () => {} }, removeListener: { value: () => {} }, addEventListener: { value: () => {} }, removeEventListener: { value: () => {} } });
    };
  })()`;
}
const W = [];
async function device(name){
  const cf = DEVICES[name];
  const c = await H.computer(name, { build, mobile: !!cf.mobile, viewport: cf.vp, init: [deviceInit(cf)] }); W.push(c);
  return c;
}
const S = c => c.ev(() => {
  const vis = s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
  let dev = {}; try { dev = window._gcDevice.state(); } catch (e) {}
  return { field: document.documentElement.classList.contains('_fieldmode'), fh: vis('#_gcJobPick.gc-fh') || vis('#_gcJobDash'), ask: !!document.getElementById('gc-dm-ask'), kind: dev.kind, why: dev.why, choice: dev.choice,
    phone: window._gcView ? window._gcView.phone() : null, mode: window._gcRA && window._gcRA.mode ? window._gcRA.mode() : '', app: window._gcRA && window._gcRA.app ? window._gcRA.app() : '', aside: vis('aside'), splash: vis('#gc-fb-splash') };
});
const isField = s => !!s && s.field && s.fh && !s.ask;
const isDesk = s => !!s && !s.field && !s.fh && !s.ask && !s.splash;
async function waitState(c, test, ms = 30000){ const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await S(c).catch(() => null); if (test(s)) return s; await sleep(300); } return s; }
async function holds(c, test, ms = 4000){ const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await S(c).catch(() => null); if (!test(s)) return { broke: s }; await sleep(400); } return null; }
async function signedReady(c){ await H.waitFor(c, () => !!(window._gcRA && window._gcRA.app && window._gcRA.app()), null, 30000); }
async function signOutIn(c, email){
  await c.ev(() => window.__GC_AUTH__.signOut());
  await sleep(800);
  return H.signIn(c, email, 9000);
}
const closeAll = async () => { for (const c of W.splice(0)) await c.close().catch(() => {}); };

try {
  /* ── 1. every device × role ── */
  if (want('devices')) {
    const ROLES = [['admin', ADMIN], ['office', OFFICE], ['PM', PM], ['field (Superintendent)', CREW]];
    for (const dn of Object.keys(DEVICES)) {
      const cf = DEVICES[dn];
      for (const [rn, em] of ROLES) {
        seed(); const c = await device(dn);
        await H.signIn(c, em, 9000); await signedReady(c);
        const test = cf.field ? isField : isDesk;
        const s = await waitState(c, test, 25000);
        ok(test(s), dn + ' · ' + rn + ': opens ' + (cf.field ? 'GrayCo Field' : 'the Desk'), s);
        const br = await holds(c, test, 3500);
        ok(!br, dn + ' · ' + rn + ': … and stays there', br);
        if (rn === 'admin') ok(s && s.kind === (dn.startsWith('iPad') ? 'tablet' : cf.field ? 'phone' : 'computer'), dn + ': the device is a ' + (s && s.kind) + ' (' + (s && s.why) + ')', s);
        if (rn === 'field (Superintendent)' || rn === 'PM') {
          await c.page().reload(); await signedReady(c);
          const s2 = await waitState(c, test, 25000);
          ok(test(s2), dn + ' · ' + rn + ': after a reload, the same view', s2);
        }
        ok(!c.errs.length, dn + ' · ' + rn + ': no page errors', c.errs.slice(0, 3));
        await closeAll();
      }
    }
  }

  /* ── 2. the ask setting ── */
  if (want('ask')) {
    console.log('── ask: off (default) on a computer');
    seed(); let c = await device('Windows Chrome');
    await H.signIn(c, PM, 9000); await signedReady(c);
    let s = await waitState(c, isDesk, 20000); await sleep(2500); s = await S(c);
    ok(isDesk(s) && !s.ask, 'ask off: the PM\'s computer opens the Desk and asks nothing', s);
    await closeAll();

    console.log('── ask: on (Biffle) on a computer');
    seed(); H.cset('gc_view_prefs', { [PM]: { ask: true, at: new Date().toISOString(), by: ADMIN } });
    c = await device('Windows Chrome');
    await H.signIn(c, PM, 9000); await signedReady(c);
    s = await waitState(c, x => x && x.ask, 20000);
    ok(s && s.ask, 'ask on: after sign-in the CRM asks Desk or GrayCo Field', s);
    const btns = await c.ev(() => [...document.querySelectorAll('#gc-dm-ask [data-dm]')].map(b => b.getAttribute('data-dm')));
    ok(btns.includes('desk') && btns.includes('field'), 'two buttons: 🖥 Desk and 📱 GrayCo Field (+ Stop asking me)', btns);
    await c.page().screenshot({ path: '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/dm/ask.png' }).catch(() => {});
    await c.page().click('#gc-dm-ask [data-dm="field"]');
    s = await waitState(c, isField, 20000);
    ok(isField(s) && s.choice === 'field', 'Field picked: GrayCo Field opens on the computer', s);
    ok(!(await holds(c, isField, 3500)), '… and stays');
    await c.page().reload(); await signedReady(c);
    s = await waitState(c, isField, 25000); await sleep(1500); s = await S(c);
    ok(isField(s) && !s.ask, 'a reload of the same sign-in: GrayCo Field again, no second question', s);
    const p2 = await c.ctx.newPage(); p2.on('pageerror', e => c.errs.push(String(e.message || e)));
    await p2.goto('http://app.local/', { waitUntil: 'domcontentloaded' });
    await H.waitFor({ ev: (f, a) => p2.evaluate(f, a) }, () => !!(window._gcRA && window._gcRA.app && window._gcRA.app()), null, 30000);
    await sleep(3000);
    const s3 = await p2.evaluate(() => ({ ask: !!document.getElementById('gc-dm-ask'), field: document.documentElement.classList.contains('_fieldmode') }));
    ok(!s3.ask && s3.field, 'a new tab of the same sign-in: no question, GrayCo Field', s3);
    await p2.close();
    /* the switch while the ask setting is on: it changes this sign-in's pick */
    await c.ev(() => window._gcChooseView('desk'));
    s = await waitState(c, isDesk, 15000);
    ok(isDesk(s) && s.choice === 'desk', '🖥 Desk switch: the Desk, and this sign-in\'s pick becomes Desk', s);
    await c.page().reload(); await signedReady(c);
    s = await waitState(c, isDesk, 20000); await sleep(1500); s = await S(c);
    ok(isDesk(s) && !s.ask, '… a reload keeps the Desk (this sign-in), no question', s);
    /* sign out + in: asked again */
    await signOutIn(c, PM); await signedReady(c);
    s = await waitState(c, x => x && x.ask, 20000);
    ok(s && s.ask && !s.choice, 'sign out + sign in: asked again (the last sign-in\'s pick is gone)', s);
    await c.page().click('#gc-dm-ask [data-dm="desk"]');
    s = await waitState(c, isDesk, 15000);
    ok(isDesk(s) && s.choice === 'desk', 'Desk picked: the Desk', s);
    /* Stop asking me */
    await signOutIn(c, PM); await signedReady(c);
    s = await waitState(c, x => x && x.ask, 20000);
    ok(s && s.ask, 'asked again at the next sign-in', s);
    await c.page().click('#gc-dm-ask [data-dm="stop"]');
    await sleep(1500);
    s = await S(c);
    ok(isDesk(s) && H.cget('gc_view_prefs')[PM].ask === false, '"Stop asking me": the Desk, and the setting is off in the cloud', { s, prefs: H.cget('gc_view_prefs') });
    await signOutIn(c, PM); await signedReady(c);
    s = await waitState(c, isDesk, 20000); await sleep(2500); s = await S(c);
    ok(isDesk(s) && !s.ask, 'the next sign-in: the Desk, no question', s);
    ok(!c.errs.length, 'ask flow: no page errors', c.errs.slice(0, 3));
    await closeAll();

    console.log('── ask: on, but a phone never asks');
    seed(); H.cset('gc_view_prefs', { [PM]: { ask: true } });
    c = await device('iPhone Home Screen app');
    await H.signIn(c, PM, 9000); await signedReady(c);
    s = await waitState(c, isField, 25000); await sleep(2500); s = await S(c);
    ok(isField(s) && !s.ask, 'iPhone Home Screen app with the setting on: GrayCo Field, no question', s);
    await closeAll();

    console.log('── ask: on, a different person on the same computer is not asked');
    seed(); H.cset('gc_view_prefs', { [PM]: { ask: true } });
    c = await device('Windows Chrome');
    await H.signIn(c, OFFICE, 9000); await signedReady(c);
    s = await waitState(c, isDesk, 20000); await sleep(2500); s = await S(c);
    ok(isDesk(s) && !s.ask, 'the office (setting off) on that computer: the Desk, no question', s);
    await closeAll();
  }

  /* ── 3. a switch without the ask setting: this open only ── */
  if (want('switch')) {
    console.log('── switch without the ask setting');
    seed(); const c = await device('Windows Chrome');
    await H.signIn(c, PM, 9000); await signedReady(c);
    let s = await waitState(c, isDesk, 20000);
    await c.page().click('#_fmToggle').catch(async () => { await c.ev(() => window._gcChooseView('field')); });
    s = await waitState(c, isField, 15000);
    ok(isField(s), '📱 Field on a computer: GrayCo Field', s);
    ok(!(await holds(c, isField, 3000)), '… and it holds');
    await c.page().reload(); await signedReady(c);
    s = await waitState(c, isDesk, 20000); await sleep(1500); s = await S(c);
    ok(isDesk(s) && !s.choice, 'a reload: the Desk again (the switch was for that open only)', s);
    await c.ev(() => window._gcChooseView('field')); await waitState(c, isField, 15000);
    await signOutIn(c, PM); await signedReady(c);
    s = await waitState(c, isDesk, 20000); await sleep(1500); s = await S(c);
    ok(isDesk(s), 'Field switched, then sign out + in: the Desk', s);
    const keys = await c.ev(() => Object.keys(localStorage).filter(k => /^(gc_view_pref|gc_phone_desk|_fieldMode)$/.test(k)));
    ok(!keys.length, 'no saved last-used view on this computer', keys);
    ok(!c.errs.length, 'switch: no page errors', c.errs.slice(0, 3));
    await closeAll();
    console.log('── a phone: Desk for this open only');
    seed(); const p = await device('iPhone Safari');
    await H.signIn(p, PM, 9000); await signedReady(p);
    await waitState(p, isField, 25000);
    await p.ev(() => window._gcChooseView('desk'));
    s = await waitState(p, isDesk, 15000);
    ok(isDesk(s), 'iPhone: 🖥 Desk view switches to the Desk', s);
    await p.page().reload(); await signedReady(p);
    s = await waitState(p, isField, 25000);
    ok(isField(s), 'iPhone: a reload is GrayCo Field again', s);
    await closeAll();
  }

  /* ── 4. My Profile and 💎 Team access ── */
  if (want('profile')) {
    console.log('── My Profile');
    seed(); let c = await device('Windows Chrome');
    await H.signIn(c, PM, 9000); await signedReady(c);
    await waitState(c, isDesk, 20000);
    await c.ev(() => window._setView('myprofile'));
    const cb = await H.waitFor(c, () => { const x = document.querySelector('#gc-dm-prof input[data-dm-ask="me"]'); return !!x && !x.disabled; }, null, 15000);
    ok(cb, 'My Profile shows "Ask me Field or Desk when I sign in" (off)');
    if (cb) {
      ok(!(await c.ev(() => document.querySelector('#gc-dm-prof input').checked)), '… off by default');
      await c.page().click('#gc-dm-prof input[data-dm-ask="me"]');
      await sleep(1500);
      ok((H.cget('gc_view_prefs') || {})[PM] && H.cget('gc_view_prefs')[PM].ask === true, 'turned on: saved in gc_kv gc_view_prefs for this person', H.cget('gc_view_prefs'));
      let s = await S(c); ok(!s.ask, 'turning it on does not ask right away (this sign-in keeps what is on screen)', s);
    }
    await closeAll();
    console.log('── on another computer, the setting follows the person');
    c = await device('Mac Safari');
    await H.signIn(c, PM, 9000); await signedReady(c);
    let s = await waitState(c, x => x && x.ask, 20000);
    ok(s && s.ask, 'the PM signs in on another computer: asked (the setting follows him)', s);
    await closeAll();
    console.log('── 💎 Team access (admin)');
    seed(); c = await device('Windows Chrome');
    await H.signIn(c, ADMIN, 9000); await signedReady(c);
    await c.ev(() => window._gcTeamAccess());
    const box = await H.waitFor(c, e => !!document.querySelector('input[data-dm-ask="' + e + '"]'), PM, 15000);
    ok(box, 'Team access: an "Ask Field/Desk" box on each person\'s row');
    if (box) {
      await c.ev(e => document.querySelector('input[data-dm-ask="' + e + '"]').click(), PM);
      await sleep(1500);
      ok((H.cget('gc_view_prefs') || {})[PM] && H.cget('gc_view_prefs')[PM].ask === true, 'the admin ticks it for the PM: saved for him', H.cget('gc_view_prefs'));
    }
    ok(!c.errs.length, 'profile / Team access: no page errors', c.errs.slice(0, 3));
    await closeAll();
  }
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
await closeAll();
console.log(`DEVMODE ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
