// test_MOVESUP.mjs <build-dir> — patch MOVESUP (owner 11/23: "be able to move people to a supplier if I click their profile, also have their
// profile with phone number etc up top where that docs button is"). The built bid site + the REAL bid-site function on qaa_world's in-memory
// Supabase. Made-up data only; nothing leaves the machine.
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, TOK, ACC, putRow, rowData } = W;
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
W.install(); process.env.PORTAL_MAIL_OFF = '1';
const F = W.fns(BUILD);
W.H.resetCloud(); W.H.cset('leads', []); W.H.cset('schedule', []); W.H.cset('gc_automation_pause', { on: false });
W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin' }]);
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true });
putRow('users', 'st_owner', { id: 'st_owner', email: 'owner@grayco-cs.com', name: 'Demo Owner', phone: '901-555-0100', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: 'st_owner', email: 'owner@grayco-cs.com' });
putRow('users', 'u_cb', { id: 'u_cb', role: 'sub', approved: true, email: 'jason@trussdemo.test', name: 'Jason Demo', company: 'Component Demo Builders', phone: '901-555-0142', businessAddress: '1 Truss Way', businessCity: 'Memphis', businessState: 'TN', businessZip: '38118', trades: ['Wood roof trusses'], licenseNumbers: 'TN-12345', createdAt: '2026-11-01T10:00:00Z', authUserId: 'auth-cb' }, { user_id: 'u_cb', email: 'jason@trussdemo.test' });
TOK['tk-cb'] = 'jason@trussdemo.test'; ACC['owner@grayco-cs.com'] = { pw: 'Admin-Pass-1', id: 'auth-owner' }; ACC['jason@trussdemo.test'] = { pw: 'Sub-Pass-1', id: 'auth-cb' };
const call = async (tok, body) => { const r = await F.sp.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test', authorization: 'Bearer ' + tok, 'x-nf-client-connection-ip': '10.6.' + Math.floor(Math.random() * 200) + '.1' }, body: JSON.stringify(body) }); return { code: r.statusCode, b: JSON.parse(r.body) }; };
const until = async (f, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await new Promise(r => setTimeout(r, 250)); } return false; };

/* A. a sub can never move themselves */
let r = await call('tk-cb', { action: 'save', key: 'users', upsert: [Object.assign({}, rowData('users/u_cb'), { _moveTo: 'supplier', role: 'supplier' })] });
ok('A1 a sub saving their own profile with _moveTo stays a sub', rowData('users/u_cb').role === 'sub', rowData('users/u_cb').role);

const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
try {
  for (const kind of ['desktop', 'phone']) {
    const ctx = await W.bidsCtx(browser, BUILD, F, kind); const A = await ctx.newPage(); A.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); A.on('dialog', d => d.accept().catch(() => {}));
    await A.goto('https://bids.test/'); await W.bidsLogin(A, 'owner@grayco-cs.com', 'Admin-Pass-1');
    const nav = async (rx) => { await A.waitForTimeout(800); const bs = A.locator('button', { hasText: rx }); const n = await bs.count(); for (let i = 0; i < n; i++) { if (await bs.nth(i).isVisible()) { await bs.nth(i).click(); return true; } }
      const m = A.locator('button[aria-label*="enu" i], button:has-text("☰")'); if (await m.count()) { await m.first().click(); await A.waitForTimeout(400); const b2 = A.locator('button', { hasText: rx }); const k = await b2.count(); for (let i = 0; i < k; i++) if (await b2.nth(i).isVisible()) { await b2.nth(i).click(); return true; } } return false; };
    const from = rowData('users/u_cb').role, to = from === 'sub' ? 'supplier' : 'sub';
    await nav(from === 'sub' ? /Approved Subs/ : /Suppliers/);
    await A.waitForSelector('[data-profile-open="u_cb"]', { timeout: 15000 });
    await A.click('[data-profile-open="u_cb"]');
    const box = await A.textContent('[data-profile-box="u_cb"]');
    ok('B1 ' + kind + ': 👤 Profile shows phone, e-mail, address, trades, license', /901-555-0142/.test(box) && /jason@trussdemo\.test/.test(box) && /1 Truss Way/.test(box) && /Memphis, TN/.test(box) && /TN-12345/.test(box), box);
    ok('B2 ' + kind + ': the phone is a tap-to-call link', await A.locator('[data-profile-box="u_cb"] a[href="tel:9015550142"]').count() === 1);
    await A.click(`[data-move="${to}"]`);
    ok('B3 ' + kind + ': the move asks first (inline, no browser popup)', await A.locator(`[data-move-ask="${to}"]`).count() === 1 && rowData('users/u_cb').role === from);
    await A.click(`[data-move-yes="${to}"]`);
    ok('B4 ' + kind + ': moved to ' + to + ', who / when kept', await until(() => { const d = rowData('users/u_cb'); return d.role === to && (d.roleHistory || []).length >= 1 && d.roleHistory[d.roleHistory.length - 1].by === 'owner@grayco-cs.com'; }), rowData('users/u_cb'));
    ok('B5 ' + kind + ': still approved, no fields lost', rowData('users/u_cb').approved === true && rowData('users/u_cb').phone === '901-555-0142');
    if (kind === 'phone') ok('B6 phone: no sideways scroll', await A.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await ctx.close();
  }
  ok('B7 moved there and back: two history entries', (rowData('users/u_cb').roleHistory || []).length === 2, rowData('users/u_cb').roleHistory);
  ok('C no page errors', errs.length === 0, errs);
} finally { await browser.close(); }
const n = R.filter(Boolean).length; console.log('MOVESUP ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
