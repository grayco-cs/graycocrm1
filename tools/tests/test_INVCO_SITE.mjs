// test_INVCO_SITE.mjs <build-dir> [shot-dir] — patch INVCO (owner 11/23 "make sure i can enter the companies name on this invite subs spot"):
// the bid site's ✉️ Invite subs has a company-name box: typing part of a name lists the subs / suppliers we know (portal accounts and the
// CRM's sub list), picking one fills its e-mail, the invite keeps the company name; a new company typed by hand keeps its name too.
// Made-up data only, on qaa_world's in-memory Supabase; e-mail captured, nothing leaves.
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, ACC, putRow, rowData, rowsOf } = W;
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: false }).catch(() => {}); };
const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(250); } return false; };
W.install();
const MAIL = []; const f0 = globalThis.fetch;
globalThis.fetch = async (url, init) => { if (String(url).indexOf('api.resend.com') > -1) { MAIL.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'm' + MAIL.length }), text: async () => '{}' }; } return f0(url, init); };
process.env.RESEND_API_KEY = 'test-mail-key'; delete process.env.PORTAL_MAIL_OFF; process.env.CUST_QUIET_OFF = '1';
const F = W.fns(BUILD);
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud(); W.H.cset('leads', []); W.H.cset('schedule', []); W.H.cset('gc_automation_pause', { on: false });
W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin' }]);
W.H.cset('subs', [{ id: 'S9', name: 'Electra Power LLC', company: 'Electra Power LLC', email: 'bids@electra.test', trade: 'Electrical' }]);
W.H.cset('projects', [{ id: 'P1', name: 'Demo Clinic Remodel', address: '1 Demo Rd', autoPO: 'Q601', status: 'active' }]);
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true });
putRow('users', 'st_owner', { id: 'st_owner', email: 'owner@grayco-cs.com', name: 'Demo Owner', phone: '901-555-0100', title: 'Owner', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: 'st_owner', email: 'owner@grayco-cs.com' });
putRow('users', 'u_a', { id: 'u_a', role: 'sub', approved: true, email: 'a@sub.test', name: 'Alex Alpha', company: 'Alpha Drywall', trades: ['Drywall'], authUserId: 'auth-u_a' }, { user_id: 'u_a', email: 'a@sub.test' });
putRow('users', 'u_sup', { id: 'u_sup', role: 'supplier', approved: true, email: 'q@supply.test', name: 'Sam Supply', company: 'Demo Supply', authUserId: 'auth-u_sup' }, { user_id: 'u_sup', email: 'q@supply.test' });
ACC['owner@grayco-cs.com'] = { pw: 'Admin-Pass-1', id: 'auth-owner' }; ACC['a@sub.test'] = { pw: 'Sub-Pass-1', id: 'auth-u_a' }; ACC['q@supply.test'] = { pw: 'Sup-Pass-1', id: 'auth-u_sup' };
const job = (id, x) => putRow('jobs', id, Object.assign({ id, status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(20), pmId: 'st_owner', estimatorId: 'st_owner', grayCoRole: 'gc', tradesSought: 'Drywall', createdAt: now }, x), { job_id: id });
job('J_PUB', { title: 'Clinic Drywall Demo', address: '1 Demo Rd', suppliersCanQuote: true, materialList: '200 sheets 5/8 Type X @ $14.50 ea\n40 boxes screws', budget: 250000 });
job('J_PRIV', { title: 'Private Fit-out Demo', visibility: 'private' });
putRow('bids', 'b_a', { id: 'b_a', jobId: 'J_PUB', userId: 'u_a', userEmail: 'a@sub.test', userCompany: 'Alpha Drywall', amount: 61000 }, { job_id: 'J_PUB', user_id: 'u_a' });
putRow('mquotes', 'mq_1', { id: 'mq_1', jobId: 'J_PUB', userId: 'u_sup', userEmail: 'q@supply.test', userCompany: 'Demo Supply', status: 'submitted', lines: [{ id: 'l1', desc: 'Type X board 5/8', spec: 'ASTM C1396', qty: 200, unit: 'sht', unitPrice: 14.5, total: 2900 }], total: 2900 }, { job_id: 'J_PUB', user_id: 'u_sup' });

const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
const page = async (ctx, url) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); p.on('dialog', d => d.accept().catch(() => {})); await p.goto(url || 'https://bids.test/'); return p; };
const body = p => p.evaluate(() => document.body.innerText);
try {
  const A = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
  await W.bidsLogin(A, 'owner@grayco-cs.com', 'Admin-Pass-1');
  await A.waitForSelector('h3:has-text("Private Fit-out Demo")', { timeout: 30000 });
  await A.click('h3:has-text("Private Fit-out Demo")');
  await A.waitForSelector('[data-invite-company]', { timeout: 15000 });
  ok('1 Invite subs has a company-name box', true);
  await A.click('[data-invite-company]'); await A.type('[data-invite-company]', 'ele', { delay: 40 });
  ok('2 typing "ele" lists Electra Power LLC from the CRM sub list', await A.waitForSelector('[data-invite-hit="Electra Power LLC"]', { timeout: 10000 }).then(() => true, () => false));
  await shot(A, 'invco_hits');
  await A.click('[data-invite-hit="Electra Power LLC"]');
  ok('3 picking it fills the company and its e-mail', (await A.inputValue('[data-invite-company]')) === 'Electra Power LLC' && (await A.inputValue('[data-invite-email]')) === 'bids@electra.test', [await A.inputValue('[data-invite-company]'), await A.inputValue('[data-invite-email]')]);
  await A.click('[data-invite-send]');
  ok('4 the invite is saved with the company name and e-mailed', await until(() => rowsOf('invites').map(r => r.data || r).some(r => r.email === 'bids@electra.test' && r.company === 'Electra Power LLC') && MAIL.some(m => m.to.includes('bids@electra.test'))), rowsOf('invites').map(r => r.data || r));
  ok('5 the invite row shows the company', await A.waitForSelector('[data-invite-row="bids@electra.test"]:has-text("Electra Power LLC")', { timeout: 10000 }).then(() => true, () => false));
  ok('6 the boxes are cleared after inviting', (await A.inputValue('[data-invite-company]')) === '' && (await A.inputValue('[data-invite-email]')) === '');
  await A.type('[data-invite-company]', 'alp', { delay: 40 });
  ok('7 portal accounts are found too ("alp" → Alpha Drywall)', await A.waitForSelector('[data-invite-hit="Alpha Drywall"]', { timeout: 10000 }).then(() => true, () => false));
  await A.fill('[data-invite-company]', 'Brand New Roofing Co'); await A.fill('[data-invite-email]', 'hello@newroof.test'); await A.click('[data-invite-send]');
  ok('8 a new company typed by hand keeps its name on the invite', await until(() => rowsOf('invites').map(r => r.data || r).some(r => r.email === 'hello@newroof.test' && r.company === 'Brand New Roofing Co')), rowsOf('invites').map(r => r.data || r));
  await A.fill('[data-invite-email]', 'x1@a.test, x2@a.test'); await A.fill('[data-invite-company]', 'Shared Name'); await A.click('[data-invite-send]');
  ok('9 several e-mails at once still work (no single company name stamped on all)', await until(() => rowsOf('invites').map(r => r.data || r).filter(r => /^x[12]@a\.test$/.test(r.email)).length === 2) && !rowsOf('invites').map(r => r.data || r).some(r => /^x[12]@a\.test$/.test(r.email) && r.company));
  const P = await page(await W.bidsCtx(browser, BUILD, F, 'phone'));
  await W.bidsLogin(P, 'owner@grayco-cs.com', 'Admin-Pass-1');
  await P.waitForSelector('h3:has-text("Private Fit-out Demo")', { timeout: 30000 }); await P.click('h3:has-text("Private Fit-out Demo")');
  await P.waitForSelector('[data-invite-company]', { timeout: 15000 }); await P.type('[data-invite-company]', 'ele', { delay: 40 });
  const fit = await P.waitForSelector('[data-invite-hit="Electra Power LLC"]', { timeout: 10000 }).then(() => P.evaluate(() => { const r = document.querySelector('[data-invite-hits]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }), () => false);
  ok('10 phone: the list fits the screen, no sideways scroll', fit);
  await shot(P, 'invco_phone');
  ok('11 no page errors', errs.length === 0, errs);
} catch (e) { ok('no crash', false, String(e && e.stack || e)); }
await browser.close();
const n = R.filter(Boolean).length; console.log(`\n${n} passed, ${R.length - n} failed`); process.exit(R.every(Boolean) ? 0 : 1);
