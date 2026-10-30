// test_SIGNINLOOK.mjs <build> [shotDir] — the company sign-in gate wears the ORIGINAL look and keeps every behavior:
// owner + office sign in, wrong password message, Forgot password (e-mail sent, back), the eye toggle, Remember me
// (prefill on / forgotten off), phone + tablet layouts without sideways scroll, 16 px inputs on the phone, no page errors.
import { computer, sleep, SP, seedCloudFromBackup, waitFor, resetCloud, ACCOUNTS } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import path from 'path';
const build = process.argv[2], shots = process.argv[3] || '';
const OWNER = 'wjohnson@grayco-cs.com', OFFICE = 'office@grayco-cs.com';
resetCloud(); seedCloudFromBackup(SP + '/GrayCo_CLEAN_DATA_2026-10-16.json');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };
const errs = [];
const URL0 = 'https://app.local/index.html';
const gateUp = p => p.waitForSelector('#gc-auth-email', { state: 'visible', timeout: 40000 });
const signedInAs = (c, em) => waitFor(c, e => { try { return !document.getElementById('gc-auth-gate') && window.__GC_AUTH__ && window.__GC_AUTH__.email() === e && !!document.querySelector('#root>div>aside'); } catch (x) { return false; } }, em, 90000, 400);

// ── desktop 1280x800 ────────────────────────────────────────────────────────────────────────────────
const c = await computer('SL', { build }); let p = c.page();
await p.setViewportSize({ width: 1280, height: 800 });
c.ctx.on('page', pg => pg.on('pageerror', e => errs.push(String(e)))); p.on('pageerror', e => errs.push(String(e)));
const resets = [];
await c.ctx.route('**/.netlify/functions/password-reset', r => { resets.push(r.request().postData() || ''); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, message: 'If that e-mail is on the team, a reset link is on its way.' }) }); });
await p.goto(URL0); await gateUp(p); await sleep(2500);
const look = await p.evaluate(() => {
  const q = s => document.querySelector(s), r = s => { const e = q(s); return e ? e.getBoundingClientRect() : null; };
  const logo = q('#gc-auth-gate .gca-logo'), brand = q('#gc-auth-gate .gca-brand');
  return { h2: (q('#gc-auth-gate h2') || {}).textContent, sub: (q('#gc-auth-gate .gca-head p') || {}).textContent,
    h1: (q('#gc-auth-gate h1') || {}).textContent, chips: document.querySelectorAll('#gc-auth-gate .gca-chip').length,
    logoW: logo && logo.getBoundingClientRect().width, logoLoaded: !!(logo && logo.complete && logo.naturalWidth > 0), logoBg: logo && getComputedStyle(logo).backgroundColor,
    brandW: brand && brand.getBoundingClientRect().width, brandBg: brand && getComputedStyle(brand).backgroundImage,
    ph: q('#gc-auth-email').placeholder, rem: !!(q('#gc-auth-remember') || {}).checked, eye: !!q('#gc-auth-password-show'),
    staff: /For GrayCo staff only/.test(q('#gc-auth-gate').textContent), contact: /901-585-0944/.test(q('#gc-auth-gate').textContent) && /info@grayco-cs\.com/.test(q('#gc-auth-gate').textContent),
    bart: /Bartlett, Tennessee/.test(q('#gc-auth-gate').textContent), sync: /Cloud Sync Active/.test(q('#gc-auth-gate').textContent),
    btn: q('#gc-auth-submit').textContent, card: r('#gc-auth-gate .gca-card'), focus: document.activeElement && document.activeElement.id,
    sw: document.documentElement.scrollWidth, iw: innerWidth, onTop: [[40, 40], [640, 400], [1240, 760], [880, 300], [200, 600]].every(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#gc-auth-gate')); }) };
});
console.log(JSON.stringify(look));
ok(look.h2 === 'Sign in to your account' && look.sub === 'Enter your credentials to access the project hub', 'original headings');
ok(/Project Management/.test(look.h1) && /by GrayCo/.test(look.h1) && look.chips === 14, 'brand panel title + 14 feature chips');
ok(look.logoLoaded && look.logoW >= 280 && look.logoW <= 380 && look.logoBg === 'rgba(0, 0, 0, 0)', 'gold logo, no white tile, ~2x bigger (' + Math.round(look.logoW) + ' px)');
ok(look.brandW === 480 && /linear-gradient/.test(look.brandBg), 'blue gradient brand panel 480 px');
ok(look.ph === 'you@grayco-cs.com' && look.rem && look.eye && look.btn === 'Sign In', 'placeholder, Remember me (default on), eye, Sign In');
ok(look.staff && look.contact && look.bart && look.sync, 'staff note, 901-585-0944 / info@, Bartlett, Tennessee, Cloud Sync line');
ok(look.focus === 'gc-auth-email', 'focus starts in the e-mail box');
ok(look.sw <= look.iw, 'no sideways scroll at 1280');
ok(look.onTop, 'the re-skinned gate covers the whole screen (the old React login is not what shows)');
if (shots) await p.screenshot({ path: path.join(shots, 'after_desktop.png') });

// eye toggle
await p.locator('#gc-auth-password').fill('Secret-123');
await p.locator('#gc-auth-password-show').click();
const t1 = await p.evaluate(() => [document.getElementById('gc-auth-password').type, document.getElementById('gc-auth-password-show').getAttribute('aria-pressed')]);
await p.locator('#gc-auth-password-show').click();
const t2 = await p.evaluate(() => [document.getElementById('gc-auth-password').type, document.getElementById('gc-auth-password').value]);
ok(t1[0] === 'text' && t1[1] === 'true' && t2[0] === 'password' && t2[1] === 'Secret-123', 'the eye shows and hides the password (' + t1 + ' / ' + t2[0] + ')');

// wrong password
await p.locator('#gc-auth-email').fill(OWNER); await p.locator('#gc-auth-password').fill('wrong-password');
await p.locator('#gc-auth-submit').click();
const wm = await waitFor(c, () => { const m = document.getElementById('gc-auth-msg'); return m && /do not match/.test(m.textContent) ? m.textContent : null; }, null, 15000);
const wmVis = await p.evaluate(() => { const m = document.getElementById('gc-auth-msg'); return !!(m && m.getClientRects().length && getComputedStyle(m).display !== 'none'); });
ok(!!wm && wmVis, 'wrong password shows the error (' + wm + ')');

// forgot password
await p.locator('#gc-auth-forgot').click(); await sleep(400);
const fg = await p.evaluate(() => ({ scr: !!document.getElementById('gc-pw-screen'), gate: !!document.getElementById('gc-auth-gate'), em: (document.getElementById('gc-forgot-email') || {}).value,
  look: !!document.querySelector('#gc-pw-screen .gca-brand .gca-logo') && !!document.querySelector('#gc-pw-screen .gca-card'), title: (document.querySelector('#gc-pw-screen h2') || {}).textContent }));
ok(fg.scr && !fg.gate && fg.em === OWNER && fg.look && fg.title === 'Forgot your password?', 'Forgot password opens its screen (same look) with the e-mail filled in');
await p.locator('#gc-forgot-send').click();
const fm = await waitFor(c, () => { const m = document.getElementById('gc-pw-msg'); return m && /reset link/i.test(m.textContent) ? m.textContent : null; }, null, 15000);
ok(!!fm && resets.length === 1 && JSON.parse(resets[0]).email === OWNER, 'the reset e-mail is requested for the owner (' + fm + ')');
await p.locator('#gc-forgot-back').click(); await sleep(400);
ok(await p.evaluate(() => !document.getElementById('gc-pw-screen') && !!document.getElementById('gc-auth-email') && document.getElementById('gc-auth-email').getClientRects().length > 0), 'Back returns to the sign-in');

// owner signs in (Remember me on)
await p.locator('#gc-auth-email').fill(OWNER); await p.locator('#gc-auth-password').fill(ACCOUNTS[OWNER].pw);
await p.locator('#gc-auth-submit').click();
ok(!!(await signedInAs(c, OWNER)), 'the owner signs in and the CRM opens');
p = c.page();
ok(await p.evaluate(() => localStorage.getItem('gc_auth_last_email')) === OWNER, 'Remember me on: the e-mail is kept');
await p.evaluate(() => window.__gcAuthSignOut('Signed out.')); await sleep(800);
await p.goto(URL0); await gateUp(p); await sleep(1500);
const pre = await p.evaluate(() => ({ v: document.getElementById('gc-auth-email').value, f: document.activeElement && document.activeElement.id, r: document.getElementById('gc-auth-remember').checked }));
ok(pre.v === OWNER && pre.f === 'gc-auth-password' && pre.r, 'next time: e-mail prefilled, focus in the password (' + JSON.stringify(pre) + ')');

// office signs in with Remember me off
await p.locator('#gc-auth-remember').uncheck();
await p.locator('#gc-auth-email').fill(OFFICE); await p.locator('#gc-auth-password').fill(ACCOUNTS[OFFICE].pw);
await p.locator('#gc-auth-submit').click();
ok(!!(await signedInAs(c, OFFICE)), 'the office account signs in and the CRM opens');
p = c.page();
ok(await p.evaluate(() => localStorage.getItem('gc_auth_last_email')) === null, 'Remember me off: the e-mail is not kept');
await p.evaluate(() => window.__gcAuthSignOut('Signed out.')); await sleep(800);
await p.goto(URL0); await gateUp(p); await sleep(1500);
const pre2 = await p.evaluate(() => ({ v: document.getElementById('gc-auth-email').value, r: document.getElementById('gc-auth-remember').checked }));
ok(pre2.v === '' && pre2.r === false, 'next time: no e-mail prefilled, Remember me stays off (' + JSON.stringify(pre2) + ')');

// tablet portrait
await p.setViewportSize({ width: 768, height: 1024 }); await sleep(500);
const tb = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, gw: document.getElementById('gc-auth-gate').scrollWidth, iw: innerWidth }));
ok(tb.sw <= tb.iw && tb.gw <= tb.iw, 'tablet 768: no sideways scroll (' + JSON.stringify(tb) + ')');
await c.b.close();

// ── phone 390x844 ───────────────────────────────────────────────────────────────────────────────────
const m = await computer('SLM', { build, mobile: true }); const mp = m.page(); mp.on('pageerror', e => errs.push(String(e)));
await mp.goto(URL0); await mp.waitForSelector('#gc-auth-email', { state: 'visible', timeout: 40000 }); await sleep(2500);
const ph = await mp.evaluate(() => {
  const g = document.getElementById('gc-auth-gate'), q = s => g.querySelector(s), R = e => e.getBoundingClientRect();
  return { sw: document.documentElement.scrollWidth, gw: g.scrollWidth, iw: innerWidth,
    fs: [...g.querySelectorAll('input[type=email],input[type=password]')].map(i => parseFloat(getComputedStyle(i).fontSize)),
    logoW: R(q('.gca-logo')).width, brandBottom: R(q('.gca-brand')).bottom, cardTop: R(q('.gca-card')).top, cardW: R(q('.gca-card')).width,
    chips: getComputedStyle(q('.gca-chips')).display, remAp: getComputedStyle(q('#gc-auth-remember')).appearance, title: getComputedStyle(q('.gca-h1')).display };
});
console.log(JSON.stringify(ph));
ok(ph.sw <= ph.iw && ph.gw <= ph.iw, 'phone 390: no sideways scroll');
ok(ph.fs.length === 2 && ph.fs.every(f => f >= 16), 'phone inputs are 16 px or more (no iOS zoom)');
ok(ph.brandBottom <= ph.cardTop && ph.chips === 'none' && ph.title !== 'none' && ph.logoW >= 150 && ph.logoW <= 260, 'phone: compact logo + title header above the card');
ok(ph.remAp !== 'none', 'phone: the Remember me box is drawn (' + ph.remAp + ')');
ok(ph.cardW >= 340, 'phone: the card uses the width (' + Math.round(ph.cardW) + ')');
if (shots) await mp.screenshot({ path: path.join(shots, 'after_phone.png') });
await mp.locator('#gc-auth-email').fill(OWNER); await mp.locator('#gc-auth-password').fill(ACCOUNTS[OWNER].pw);
await mp.locator('#gc-auth-submit').click();
ok(!!(await waitFor(m, e => { try { return !document.getElementById('gc-auth-gate') && window.__GC_AUTH__.email() === e; } catch (x) { return false; } }, OWNER, 90000, 400)), 'phone: the owner signs in');
await m.b.close();

const real = errs.filter(e => !/ResizeObserver/.test(e));
ok(!real.length, 'no page errors (' + real.slice(0, 3).join(' | ') + ')');
console.log(`SIGNINLOOK ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
