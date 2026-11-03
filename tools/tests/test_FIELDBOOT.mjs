// test_FIELDBOOT.mjs <build-dir> — a phone opens straight in GrayCo Field; the Desk is never drawn first (patch FIELDBOOT).
// Owner 11/03 (iPhone, Home Screen app): "it briefly goes to this first, like half a second. I want it straight to Field."
//  • iPhone (UA, 390×844, touch, the Home Screen app = display-mode standalone + navigator.standalone): from the reload on,
//    screenshots about every 50 ms plus an in-page probe on EVERY animation frame (what is under the sidebar spot and the
//    dashboard spot) — no frame shows the Desk (sidebar / Company Dashboard); GrayCo Field is on screen within N s;
//  • the white splash goes as soon as Field is up; signed out: the sign-in screen is not hidden;
//  • a Desk view chosen for this open on the phone is honoured (Field not forced; the splash goes; ☰ More → Desk holds);
//    a reload is Field again (FIELDDESK: per open);
//  • the safety: if Field never comes, the splash goes 6 s after the page is read and whatever is ready shows;
//  • desktop 1462×987 (Windows): the Desk as before — no gc-boot-field class, no splash on any frame.
// Offline harness, made-up data. Usage: node test_FIELDBOOT.mjs <dir with index.html>  (GC_HARNESS, SHOTS, N_SEC)
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDBOOT.mjs <dir with index.html>'); process.exit(2); }
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/fieldboot_shots/';
const N_SEC = +(process.env.N_SEC || 10);
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const OWNER = 'wjohnson@grayco-cs.com';
function seed(){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Demo Owner', email: OWNER, role: 'Admin', payType: 'owner', active: true },
    { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
  H.cset('projects', [
    { id: 'P1', po: 'PO-2001', name: 'Demo Kitchen Remodel', client: 'Sample Homeowner', address: '100 Demo St', pm: 'Sample PM', status: 'Active', contract: 25000, contractSigned: true, pct: 40 },
    { id: 'P2', po: 'PO-2002', name: 'Demo Roof', client: 'Second Homeowner', address: '200 Demo Ave', pm: 'Sample PM', status: 'Active', contract: 14000, contractSigned: true }]);
  H.cset('leads', []); H.cset('punch', []); H.cset('timesheets', []);
}
const W = []; const closeAll = async () => { for (const c of W) await c.b.close().catch(() => {}); W.length = 0; };
async function mocks(c){
  await c.ctx.route(u => /\/storage\/v1\//.test(u.href || u), r => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
  await c.ctx.route(u => /\/\.netlify\/functions\/(bid-inbox|texts|portal-access)/.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
}
/* every animation frame from the very start of each page: what is under the sidebar spot and the dashboard spot */
const PROBE = () => {
  const rec = window.__fbProbe = [];
  const T0 = performance.now();
  const cls = el => {
    if (!el) return 'none';
    if (el.closest('#gc-fb-splash')) return 'splash';
    if (el.closest('#gc-boot-cover')) return 'bootcover';
    if (el.closest('#_gcJobPick,#_gcJobDash,#_gcFieldHomeOv,#gc-fh-tabs,.gc-fh-sheet,._gcSheetOv')) return 'field';
    if (el.closest('#gc-auth-email,#gc-auth-password,#gc-auth-submit') || el.closest('[id^="gc-auth"]')) return 'signin';
    if (el.closest('aside')) return 'DESK-sidebar';
    if (el.closest('#gc-ra-desk')) return 'DESK-home';
    if (el.closest('#root')) return 'DESK';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
  };
  const tick = () => {
    try {
      if (document.body) {
        const h = document.documentElement;
        rec.push({ t: Math.round(performance.now() - T0), a: cls(document.elementFromPoint(60, 450)), b: cls(document.elementFromPoint(260, 420)),
          boot: h.classList.contains('gc-boot-field'), fm: h.classList.contains('_fieldmode'), sp: !!document.getElementById('gc-fb-splash') });
        if (rec.length > 4000) rec.splice(0, 1000);
      }
    } catch (e) {}
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
/* the iPhone Home Screen app: display-mode standalone + navigator.standalone */
const STANDALONE = () => {
  try { Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }); } catch (e) {}
  const om = window.matchMedia.bind(window);
  window.matchMedia = function(q){ const s = String(q); if (/display-mode\s*:\s*standalone/i.test(s)) return Object.create(om('all'), { matches: { value: true }, media: { value: s } }); return om(q); };
};
/* test hooks for one open, set before a reload: 'desk' = the person chose Desk for this open before Field came;
   'nofield' = GrayCo Field can never open (the safety timeout) */
const HOOKS = () => {
  let h = ''; try { h = sessionStorage.getItem('fbtest_hook') || ''; sessionStorage.removeItem('fbtest_hook'); } catch (e) {}
  if (h === 'desk') { const iv = setInterval(() => { if (window._gcView) { clearInterval(iv); window._gcView.set('desk'); } }, 5); }
  if (h === 'nofield') { try { Object.defineProperty(window, '_gcSetFieldMode', { configurable: true, get: () => undefined, set: () => {} }); } catch (e) {} }
};
async function phoneDevice(name){
  const c = await H.computer(name, { build, mobile: true }); W.push(c); await mocks(c);
  await c.ctx.addInitScript(STANDALONE); await c.ctx.addInitScript(HOOKS); await c.ctx.addInitScript(PROBE);
  return c;
}
const S = c => c.ev(() => {
  const vis = s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
  return { field: document.documentElement.classList.contains('_fieldmode'), fh: vis('#_gcJobPick.gc-fh'), desk: vis('#gc-ra-desk'), boot: document.documentElement.classList.contains('gc-boot-field'),
    splash: !!document.getElementById('gc-fb-splash'), pref: window._gcView ? window._gcView.pref() : null, fb: window._gcFieldBoot ? window._gcFieldBoot.state() : null,
    phone: window._gcView ? window._gcView.phone() : null };
});
const isField = s => !!s && s.field && s.fh && !s.boot;
async function waitState(c, test, ms = 30000, step = 100){ const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await S(c).catch(() => null); if (test(s)) return s; await sleep(step); } return s; }
async function holds(c, test, ms = 5000){ const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await S(c).catch(() => null); if (!test(s)) return { broke: s }; await sleep(300); } return null; }
const pe = c => c.errs.filter(x => /PAGEERROR/.test(x));

/* reload with screenshots every ~50 ms (CDP, as presented) until `until` holds + 1.5 s, or the time is up */
async function sampledReload(c, tag, until, maxMs){
  const dir = path.join(SHOTS, tag); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await c.ctx.newCDPSession(c.page());
  let stop = false, n = 0; const t0 = Date.now(); const times = [];
  const loop = (async () => {
    while (!stop) {
      const ts = Date.now();
      try { const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 45 }); const f = path.join(dir, String(n).padStart(4, '0') + '_' + (ts - t0) + '.jpg'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); times.push(ts - t0); n++; } catch (e) {}
      const wait = 50 - (Date.now() - ts); if (wait > 0) await sleep(wait);
    }
  })();
  await sleep(120);
  const tr = Date.now() - t0;
  await c.page().reload({ waitUntil: 'commit' }).catch(() => {});
  let s = null, at = null; const tEnd = Date.now() + maxMs;
  while (Date.now() < tEnd) { s = await S(c).catch(() => null); if (until(s)) { at = Date.now() - t0 - tr; break; } await sleep(50); }
  await sleep(1500);
  stop = true; await loop; await cdp.detach().catch(() => {});
  const probe = await c.ev(() => window.__fbProbe || []).catch(() => []);
  const gaps = times.slice(1).map((t, i) => t - times[i]); const med = gaps.sort((a, b) => a - b)[gaps.length >> 1] || 0;
  return { dir, n, at, s, probe, medGap: med, reloadAt: tr };
}
/* python: how many frames show the Desk (the dark navy sidebar at the left + light dashboard at the right) */
function deskFrames(dir){
  const py = `
import sys, os
from PIL import Image
d = sys.argv[1]; bad = []; n = 0
for f in sorted(os.listdir(d)):
    if not f.endswith('.jpg'): continue
    n += 1
    im = Image.open(os.path.join(d, f)).convert('L'); w, h = im.size; sx = w / 390.0
    def frac(x0, y0, x1, y1, test):
        px = [im.getpixel((int(x * sx), int(y * sx))) for x in range(x0, x1, 6) for y in range(y0, y1, 12)]
        return sum(1 for v in px if test(v)) / float(len(px))
    side_dark = frac(8, 380, 150, 820, lambda v: v < 70)       # the Desk's dark sidebar (navy)
    right_light = frac(300, 300, 380, 700, lambda v: v > 170)  # the dashboard's white cards
    if side_dark > 0.6 and right_light > 0.25: bad.append(f)
print(n, len(bad), ' '.join(bad[:8]))
`;
  const out = execFileSync('python3', ['-I', '-c', py, dir], { encoding: 'utf8' }).trim().split(' ');
  return { frames: +out[0], desk: +out[1], first: out.slice(2) };
}
const deskProbe = p => p.filter(r => /^DESK/.test(r.a) || /^DESK/.test(r.b));

/* ── 1. iPhone Home Screen app: straight to GrayCo Field ── */
async function phone(){
  console.log('── iPhone 390×844, touch, Home Screen app (standalone)');
  seed(); const c = await phoneDevice('P');
  /* signed out: the sign-in screen is shown (the splash does not hide it) */
  await c.page().goto('https://app.local/index.html');
  const si = await H.waitFor(c, () => { const e = document.getElementById('gc-auth-email'); return e && e.getClientRects().length && !document.documentElement.classList.contains('gc-boot-field') && !document.getElementById('gc-fb-splash') ? (window._gcFieldBoot.state()) : null; }, null, 30000, 100);
  ok(!!si && si.why === 'the sign-in screen' && si.phone && si.standalone, 'signed out: the splash steps aside for the sign-in screen (phone, standalone app)', si);
  const hit = await c.ev(() => { const e = document.getElementById('gc-auth-email'), r = e.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(h && (h === e || e.contains(h))); });
  ok(hit, 'signed out: the e-mail box is on top (tappable)');
  await H.signIn(c, OWNER, 4000);
  let s = await waitState(c, isField, 30000);
  ok(isField(s), 'signed in: GrayCo Field', s);
  /* the owner chooses Desk for this open (☰ More → Desk view): it holds, no splash comes back */
  await c.page().locator('#gc-fh-tabs [data-t="more"]').first().tap({ timeout: 4000 }).catch(() => {}); await sleep(700);
  await c.page().locator('.gc-fh-sheet [data-gc-view="desk"]').first().tap({ timeout: 4000 }).catch(() => {});
  s = await waitState(c, s => !!s && !s.field && s.desk && s.pref === 'desk', 8000);
  ok(!!s && !s.field && s.desk && s.pref === 'desk' && !s.boot && !s.splash, 'phone: ☰ More → Desk view shows the Desk home (no splash)', s);
  ok(!(await holds(c, s => !!s && !s.field && !s.boot && !s.splash, 4000)), 'phone: the Desk choice holds for this open (Field not forced back)');

  /* THE OWNER'S CASE: open the app again (reload) — sampled every ~50 ms and on every animation frame */
  for (const k of [1, 2]) {
    const r = await sampledReload(c, 'phone_open' + k, isField, N_SEC * 1000 + 30000);
    const df = deskFrames(r.dir), dp = deskProbe(r.probe);
    console.log(`    open ${k}: ${r.n} screenshots (median gap ${r.medGap} ms), ${r.probe.length} animation frames probed; Field after ${r.at} ms; splash gone after ${r.s && r.s.fb && r.s.fb.ms} ms (${r.s && r.s.fb && r.s.fb.why})`);
    const kinds = {}; r.probe.forEach(x => { const kk = x.a + '|' + x.b; kinds[kk] = (kinds[kk] || 0) + 1; });
    console.log('    frames (sidebar spot | dashboard spot): ' + JSON.stringify(kinds));
    ok(r.n >= 20, `open ${k}: screenshots taken from the reload on (${r.n})`);
    ok(df.desk === 0, `open ${k}: no screenshot shows the Desk sidebar / dashboard (${df.frames} looked at)`, df);
    ok(r.probe.length > 20 && dp.length === 0, `open ${k}: no animation frame has the Desk under the sidebar or dashboard spot (${r.probe.length} frames)`, dp.slice(0, 5));
    ok(r.probe.some(x => x.a === 'splash') && r.probe.some(x => x.a === 'field'), `open ${k}: the white splash, then GrayCo Field`, Object.keys(kinds));
    ok(r.at != null && r.at < N_SEC * 1000, `open ${k}: GrayCo Field on screen within ${N_SEC} s (${r.at} ms)`, r.s);
    ok(r.s && r.s.fb && r.s.fb.why === 'GrayCo Field on screen' && !r.s.pref, `open ${k}: the splash went because Field was up; a reload is Field again (no choice carried over)`, r.s && r.s.fb);
    const first = r.probe.findIndex(x => x.a === 'field'); const after = first >= 0 ? r.probe.slice(first) : [];
    ok(after.length && after.every(x => !x.boot && x.a !== 'splash'), `open ${k}: once Field is drawn the splash is gone in the same frame`, after.filter(x => x.boot).slice(0, 3));
    if (k === 1) {
      const fr = fs.readdirSync(r.dir).sort(); for (const i of [0, Math.floor(fr.length / 3), Math.floor(fr.length * 2 / 3), fr.length - 1]) if (fr[i]) fs.copyFileSync(path.join(r.dir, fr[i]), path.join(SHOTS, 'phone_frame_' + fr[i]));
    }
  }
  ok(!(await holds(c, isField, 4000)), 'phone: GrayCo Field stays (the old 1.2 s Desk timer does not take it back)');
  await c.page().screenshot({ path: SHOTS + 'phone_field.png' });

  /* a Desk view chosen for this open BEFORE Field came: honoured — no Field forced, the splash goes, the Desk shows */
  await c.ev(() => sessionStorage.setItem('fbtest_hook', 'desk'));
  await c.page().reload();
  s = await waitState(c, s => !!s && !s.boot && !s.splash && s.fb && s.fb.why, 20000);
  ok(!!s && s.fb.why === 'Desk view chosen for this open' && s.pref === 'desk', 'Desk chosen for this open before Field: the splash goes at once', s);
  s = await waitState(c, s => !!s && s.desk, 15000);
  ok(!!s && s.desk && !s.field, 'Desk chosen for this open: the Desk home, GrayCo Field not forced', s);
  ok(!(await holds(c, s => !!s && !s.field && !s.boot, 4000)), 'Desk chosen for this open: it holds');
  ok(!pe(c).length, 'phone: no page errors', pe(c).slice(0, 3));

  /* the safety: GrayCo Field can never open → the splash goes 6 s after the page is read; whatever is ready shows */
  await c.ev(() => sessionStorage.setItem('fbtest_hook', 'nofield'));
  const t0 = Date.now(); await c.page().reload();
  s = await waitState(c, s => !!s && !s.boot && !s.splash && s.fb && s.fb.why, 30000);
  ok(!!s && /^6 s after the page was read/.test(s.fb.why) && s.fb.ms < 20000, `Field never comes: the splash goes by itself (${s && s.fb && s.fb.ms} ms after the start; ${Date.now() - t0} ms here)`, s);
  s = await waitState(c, s => !!s && s.desk, 10000);
  ok(!!s && !s.boot, 'Field never comes: the app shows (never a white page forever)', s);
  await closeAll();
}

/* ── 2. desktop 1462×987 (Windows, mouse): the Desk as before, no splash ── */
async function desktop(){
  console.log('── desktop 1462×987 (Windows, mouse)');
  seed();
  const c = await H.computer('D', { build }); W.push(c); await mocks(c);
  await c.ctx.addInitScript(() => {
    const def = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
    def(Navigator.prototype, 'userAgent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0');
    def(Navigator.prototype, 'userAgentData', { mobile: false, platform: 'Windows', brands: [{ brand: 'Microsoft Edge', version: '130' }] });
    def(Screen.prototype, 'width', 1536); def(Screen.prototype, 'height', 1080);
  });
  await c.ctx.addInitScript(PROBE);
  await c.page().setViewportSize({ width: 1462, height: 987 });
  await H.signIn(c, OWNER, 4000);
  let s = await waitState(c, s => !!s && s.desk && !s.field, 30000);
  ok(!!s && s.desk && !s.field && s.fb && s.fb.phone === false && !s.fb.on, 'desktop: the Desk home; FIELDBOOT does nothing on a computer', s);
  await c.ev(() => { window.__sawCover = 0; const mo = new MutationObserver(() => { if (document.getElementById('gc-boot-cover')) window.__sawCover = 1; }); mo.observe(document.documentElement, { childList: true }); });
  await c.page().reload();
  s = await waitState(c, s => !!s && s.desk && !s.field, 30000);
  ok(!!s && s.desk && !s.field, 'desktop: after a reload, the Desk home again', s);
  const probe = await c.ev(() => window.__fbProbe || []);
  ok(probe.length > 20 && probe.every(x => !x.boot && !x.sp && x.a !== 'splash'), `desktop: no gc-boot-field class and no splash on any frame (${probe.length} frames)`, probe.filter(x => x.boot || x.sp).slice(0, 3));
  const cover = await c.ev(() => typeof window.__gcBootMs === 'number');
  ok(cover, 'desktop: the "Loading the CRM…" cover ran as before (it timed the open)');
  ok(!(await holds(c, s => !!s && s.desk && !s.field && !s.boot, 4000)), 'desktop: it stays on the Desk');
  await c.page().screenshot({ path: SHOTS + 'desktop_1462x987.png' });
  ok(!pe(c).length, 'desktop: no page errors', pe(c).slice(0, 3));
  await closeAll();
}

try {
  if (!process.env.ONLY || /phone/.test(process.env.ONLY)) await phone();
  if (!process.env.ONLY || /desktop/.test(process.env.ONLY)) await desktop();
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
await closeAll();
console.log(`FIELDBOOT ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
