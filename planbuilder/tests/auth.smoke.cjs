// Browser test: PlanBuilder's sign-in is the CRM's. The sign-in service and staff list are stood in for here
// (no real accounts are used). Run from the repo root with python3 -m http.server 8765:
//   node planbuilder/tests/auth.smoke.cjs [screenshot-dir]
const { chromium } = require('playwright');
const assert = require('assert');
const URL = process.env.PB_URL || 'http://localhost:8765/planbuilder/';
const shots = process.argv[2];
const SB = 'https://ieeonhpfahmwwecizdut.supabase.co';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (meta = {}) => `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', app_metadata: meta })}.sig`;
// people the stand-in sign-in service knows
const PEOPLE = {
  'wes@grayco-cs.com': { pw: 'right', staff: [{ email: 'wes@grayco-cs.com', role: 'admin', active: true }] },
  'temp@grayco-cs.com': { pw: 'right', staff: [{ email: 'temp@grayco-cs.com', role: 'staff', active: true }], meta: { must_change_password: true } },
  'gone@grayco-cs.com': { pw: 'right', staff: [{ email: 'gone@grayco-cs.com', role: 'staff', active: false }] },
  'mkt@grayco-cs.com': { pw: 'right', staff: [{ email: 'mkt@grayco-cs.com', role: 'staff', active: false, profile: 'marketing', mkt_active: true }] },
  'cust@gmail.com': { pw: 'right', staff: [] },
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 850 } });
  const calls = [];
  await ctx.route(SB + '/**', async route => {
    const u = new globalThis.URL(route.request().url()), body = route.request().postData() || '';
    calls.push(u.pathname + u.search);
    if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') {
      const { email, password } = JSON.parse(body); const P = PEOPLE[email];
      if (!P || P.pw !== password) return route.fulfill({ status: 400, json: { error: 'invalid_grant' } });
      return route.fulfill({ json: { access_token: jwt(P.meta) + '.' + Buffer.from(email).toString('base64url'), refresh_token: 'r-' + email + '-1', expires_in: 3600, user: { id: 'id-' + email, email } } });
    }
    if (u.pathname === '/auth/v1/token') {   // refresh
      const { refresh_token } = JSON.parse(body); const email = refresh_token.split('-').slice(1, -1).join('-');
      if (!PEOPLE[email]) return route.fulfill({ status: 400, json: {} });
      return route.fulfill({ json: { access_token: jwt() + '.' + Buffer.from(email).toString('base64url'), refresh_token: 'r-' + email + '-2', expires_in: 3600, user: { id: 'id-' + email, email } } });
    }
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    if (u.pathname === '/rest/v1/gc_staff') {
      const email = decodeURIComponent((u.searchParams.get('email') || '').replace(/^eq\./, ''));
      const tok = Buffer.from((route.request().headers().authorization || '').split('.').pop(), 'base64url').toString();
      if (tok !== email) return route.fulfill({ status: 401, json: {} });
      return route.fulfill({ json: (PEOPLE[email] || { staff: [] }).staff });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('pb.forceGate', '1'); } catch (e) { /* ignore */ } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  const appRunning = () => p.evaluate(() => !!(window.PlanBuilder && PlanBuilder.project));
  const gateText = () => p.textContent('#pb-gate');
  const signIn = async (email, pw) => { await p.waitForSelector('.gate-go:not([disabled])'); await p.evaluate(() => { const m = document.querySelector('.gate-msg'); if (m) m.textContent = ''; }); await p.fill('#gate-email', email); await p.fill('#gate-pw', pw); await p.click('.gate-go'); };

  // 1) not signed in: only the sign-in screen, the app has not started
  await p.goto(URL);
  await p.waitForSelector('#gate-email');
  assert.equal(await appRunning(), false, 'nothing runs before sign-in');
  assert.equal(await p.isVisible('#btn-catalog'), false); assert.equal(await p.isVisible('#plan'), false);
  if (shots) await p.screenshot({ path: shots + '/signin.png' });

  // 2) wrong password, a customer account, an inactive person, a marketing-only sign-in: all kept out
  await signIn('wes@grayco-cs.com', 'wrong'); await p.waitForFunction(() => /do not match/.test(document.querySelector('.gate-msg').textContent), null, { polling: 100 });
  await signIn('cust@gmail.com', 'right'); await p.waitForFunction(() => /not on the GrayCo staff list/.test(document.querySelector('.gate-msg').textContent), null, { polling: 100 });
  await signIn('gone@grayco-cs.com', 'right'); await p.waitForFunction(() => /not on the GrayCo staff list/.test(document.querySelector('.gate-msg').textContent), null, { polling: 100 });
  await signIn('mkt@grayco-cs.com', 'right'); await p.waitForFunction(() => /Marketing/.test(document.querySelector('.gate-msg').textContent), null, { polling: 100 });
  assert.equal(await p.evaluate(() => localStorage.getItem('gc_auth_v1')), null, 'a refused sign-in is not kept');
  assert.equal(await appRunning(), false);
  // a starting password: sent to the CRM to choose a new one
  await signIn('temp@grayco-cs.com', 'right'); await p.waitForFunction(() => /starting password/.test(document.querySelector('.gate-msg').textContent), null, { polling: 100 });
  assert.equal(await appRunning(), false);
  await p.click('#gate-other');

  // 3) staff: in, and the session is the CRM's own (the CRM opens signed in)
  await signIn('wes@grayco-cs.com', 'right');
  await p.waitForFunction(() => window.PlanBuilder && PlanBuilder.project, null, { polling: 100 });
  assert.equal(await p.isVisible('#pb-gate'), false); assert.equal(await p.isVisible('#plan'), true);
  const sess = await p.evaluate(() => JSON.parse(localStorage.getItem('gc_auth_v1')));
  assert.equal(sess.email, 'wes@grayco-cs.com'); assert.equal(sess.role, 'admin'); assert.equal(sess.roleKnown, true); assert.ok(sess.refresh_token && sess.expires_at);
  assert.ok(+await p.evaluate(() => localStorage.getItem('gc_auth_last_active')) > 0);

  // 4) already signed in (to the CRM or before): straight in, no form
  await p.reload();
  await p.waitForFunction(() => window.PlanBuilder && PlanBuilder.project, null, { polling: 100 });
  assert.equal(await p.$('#gate-email'), null);

  // 5) an expiring sign-in is refreshed, the CRM's way
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('gc_auth_v1')); s.expires_at = Math.floor(Date.now() / 1000) + 30; localStorage.setItem('gc_auth_v1', JSON.stringify(s)); });
  calls.length = 0;
  await p.reload(); await p.waitForFunction(() => window.PlanBuilder && PlanBuilder.project, null, { polling: 100 });
  assert.ok(calls.some(c => c.includes('grant_type=refresh_token')), 'refreshed');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('gc_auth_v1')).refresh_token), 'r-wes@grayco-cs.com-2');

  // 6) the CRM's idle sign-out: 8 hours without use
  await p.evaluate(() => localStorage.setItem('gc_auth_last_active', String(Date.now() - 9 * 3600e3)));
  await p.reload(); await p.waitForSelector('#gate-email');
  assert.ok(/hours without use/.test(await gateText()));
  assert.equal(await p.evaluate(() => localStorage.getItem('gc_auth_v1')), null);
  await signIn('wes@grayco-cs.com', 'right'); await p.waitForFunction(() => window.PlanBuilder && PlanBuilder.project, null, { polling: 100 });

  // 7) signing out of the CRM (another tab) signs out here
  const crm = await ctx.newPage(); await crm.goto(URL.replace(/planbuilder\/$/, 'planbuilder/README.md'));
  await crm.evaluate(() => localStorage.removeItem('gc_auth_v1'));
  await p.waitForSelector('#gate-email');
  assert.ok(/from the CRM/.test(await gateText()));
  await crm.close();
  await signIn('wes@grayco-cs.com', 'right'); await p.waitForSelector('#pb-gate', { state: 'detached' });

  // 8) Sign out from the File menu
  await p.click('#btn-file');
  assert.ok((await p.textContent('#btn-signout')).includes('wes@grayco-cs.com'));
  await p.click('#btn-signout');
  await p.waitForSelector('#gate-email');
  assert.equal(await p.evaluate(() => localStorage.getItem('gc_auth_v1')), null);

  assert.deepEqual(errs, []);
  await b.close();
  console.log('PlanBuilder sign-in test passed');
})().catch(e => { console.error(e); process.exit(1); });
