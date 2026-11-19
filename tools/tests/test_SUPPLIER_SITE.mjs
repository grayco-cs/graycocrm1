// test_SUPPLIER_SITE.mjs <build-dir> [shot-dir] — patch SUPPLIER in the browser: the built subportal/ in Chromium against the REAL
// subportal.js on qaa_world's in-memory Supabase (made-up data only). A supplier signs up (🧱 Supplier, W-9 only), waits; an admin
// approves it in Pending, ticks "Suppliers can quote" + the material list on ✎ Edit Job Details; the supplier sees only that job with
// the material list, sends a material quote with line items; the admin sees it under "Material quotes" and accepts it; the supplier's
// My Quotes says Accepted; Suppliers → the likely CRM vendor match (e-mail) → Link it; the supplier's My Work shows the sent PO and bill.
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
const F = W.fns(BUILD);
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud(); W.H.cset('leads', []); W.H.cset('schedule', []);
W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin' }]);
W.H.cset('projects', [{ id: 'P1', name: 'Demo School HVAC', address: '1 Demo Rd', autoPO: 'Q501', status: 'active' }]);
W.H.cset('vendors', [{ id: 'V1', name: 'Demo Supply Co', email: 'sales@supply.test', cat: 'HVAC equipment' }]);
W.H.cset('gc_supplier_pos', [{ id: 'PO_a', pid: 'P1', poNo: 'Q501-1', supplier: 'Demo Supply Co', vendorId: 'V1', items: [{ desc: 'RTU 10 ton', qty: 4, unit: 'ea', cost: 9000 }], status: 'sent', sentAt: now }]);
W.H.cset('invs', [{ id: 'B1', type: 'supplier', supplier: 'Demo Supply Co', vendorId: 'V1', pid: 'P1', invNum: 'INV-77', amt: 36000, billDate: DAY(-3), dueDate: DAY(20), status: 'open' }]);
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true });
putRow('users', 'st_owner', { id: 'st_owner', email: 'owner@grayco-cs.com', name: 'Demo Owner', phone: '901-555-0100', title: 'Owner', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: 'st_owner', email: 'owner@grayco-cs.com' });
ACC['owner@grayco-cs.com'] = { pw: 'Admin-Pass-1', id: 'auth-owner' };
const job = (id, x) => putRow('jobs', id, Object.assign({ id, status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(20), pmId: 'st_owner', estimatorId: 'st_owner', grayCoRole: 'gc', tradesSought: 'HVAC', createdAt: now }, x), { job_id: id });
job('J_MAT', { title: 'School HVAC Demo', address: '1 Demo Rd', tradeScopes: [{ id: 't1', trade: 'HVAC', scope: 'Labour scope text' }] });
job('J_LAB', { title: 'Labour Only Demo' });

const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
const page = async (ctx, url) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); p.on('dialog', d => d.accept().catch(() => {})); await p.goto(url || 'https://bids.test/'); return p; };
const body = p => p.evaluate(() => document.body.innerText);
try {
  /* ═══ the supplier signs up (?as=supplier opens the supplier sign-up) ═══ */
  const S = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'), 'https://bids.test/?as=supplier');
  await S.waitForSelector('[data-acct-type]', { timeout: 30000 });
  ok('1 the sign-up opens as 🧱 Supplier (?as=supplier); W-9 only, no COI / WC / license rows', await S.evaluate(() => document.querySelector('[data-acct-type]').getAttribute('data-acct-type') === 'supplier' && !!document.querySelector('[data-pp-row="w9"]') && !document.querySelector('[data-pp-row="gl"]') && !document.querySelector('[data-pp-row="wc"]') && !document.querySelector('[data-pp-row="lic"]')));
  await S.click('[data-acct="sub"]');
  ok('2 switching to Subcontractor brings the COI rows back', await S.evaluate(() => !!document.querySelector('[data-pp-row="gl"]')));
  await S.click('[data-acct="supplier"]');
  await S.fill('[data-su="company"]', 'Demo Supply Co'); await S.fill('[data-su="name"]', 'Sam Supply'); await S.fill('[data-su="email"]', 'sales@supply.test');
  await S.fill('[data-su="phone"]', '901-555-0199'); await S.fill('[data-su="city"]', 'Memphis'); await S.fill('[data-su="state"]', 'TN');
  await S.fill('[data-su="tradeOther"]', 'HVAC equipment'); await S.fill('[data-su="pw"]', 'Supply-Pass-1');
  await shot(S, 'supplier_signup');
  await S.locator('button:has-text("Request Access")').last().click();
  ok('3 the account: role supplier, waiting for approval', await until(() => rowsOf('users').some(r => r.email === 'sales@supply.test' && r.data.role === 'supplier' && r.data.approved === false)), rowsOf('users').map(r => r.email + ':' + r.data.role));
  const SID = (rowsOf('users').find(r => r.email === 'sales@supply.test') || {}).id;

  /* ═══ the admin: Pending → approve; ✎ Edit Job Details → Suppliers can quote ═══ */
  const A = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
  await W.bidsLogin(A, 'owner@grayco-cs.com', 'Admin-Pass-1');
  await A.waitForSelector('h3:has-text("School HVAC Demo")', { timeout: 30000 });
  await A.click('button:has-text("Pending Approvals")');
  await A.waitForSelector('[data-pending-supplier]', { timeout: 10000 });
  ok('4 Pending lists the supplier with a 🧱 Supplier badge', /Demo Supply Co/.test(await body(A)));
  await shot(A, 'supplier_pending');
  await A.getByRole('button', { name: 'Approve', exact: true }).click();
  ok('5 approved; still a supplier', await until(() => (rowData('users/' + SID) || {}).approved === true && rowData('users/' + SID).role === 'supplier'), rowData('users/' + SID));
  await A.click('button:has-text("Open Jobs")');
  await A.click('h3:has-text("School HVAC Demo")'); await A.click('button:has-text("Edit Job Details")');
  await A.waitForSelector('[data-sq="on"]'); await A.check('[data-sq="on"]');
  await A.fill('[data-sq="list"]', '4 RTUs 10-ton\n4 roof curbs');
  await A.locator('[data-supplier-edit]').scrollIntoViewIfNeeded(); await shot(A, 'supplier_edit_job');
  await A.click('button:has-text("Save Changes")');
  ok('6 saved on the job: suppliersCanQuote + the material list', await until(() => (rowData('jobs/J_MAT') || {}).suppliersCanQuote === true && /4 roof curbs/.test(rowData('jobs/J_MAT').materialList)), rowData('jobs/J_MAT'));

  /* ═══ the supplier ═══ */
  await S.reload();
  await S.waitForSelector('h3:has-text("School HVAC Demo")', { timeout: 30000 });
  const sl = await body(S);
  ok('7 the supplier sees only the job open for material quotes', /School HVAC Demo/.test(sl) && !/Labour Only Demo/.test(sl));
  await S.click('h3:has-text("School HVAC Demo")');
  await S.waitForSelector('[data-mq-form]', { timeout: 10000 });
  const sj = await body(S);
  ok('8 the job page: the material list, the quote form; no labour scope, no labour bid form', /4 roof curbs/.test(sj) && !/Labour scope text/.test(sj) && !(await S.$('text=Submit Bid')), sj.slice(0, 300));
  await S.fill('[data-mq-line="0"] [data-mq="desc"]', 'RTU 10 ton'); await S.fill('[data-mq-line="0"] [data-mq="qty"]', '4');
  await S.fill('[data-mq-line="0"] [data-mq="unit"]', 'ea'); await S.fill('[data-mq-line="0"] [data-mq="price"]', '9500');
  await S.click('[data-mq="add"]');
  await S.fill('[data-mq-line="1"] [data-mq="desc"]', 'Roof curb'); await S.fill('[data-mq-line="1"] [data-mq="qty"]', '4'); await S.fill('[data-mq-line="1"] [data-mq="price"]', '450');
  await S.fill('[data-mq="freight"]', '250'); await S.fill('[data-mq="lead"]', '3 weeks');
  const tot = await S.evaluate(() => document.querySelector('[data-mq-total]').textContent);
  ok('9 the form totals as you type: $40,050.00', /\$40,050\.00/.test(tot), tot);
  await S.locator('[data-mq-form]').scrollIntoViewIfNeeded(); await shot(S, 'supplier_quote_form');
  await S.click('[data-mq-form] button:has-text("Send quote")');
  const qrow = () => rowsOf('mquotes').find(r => r.data.jobId === 'J_MAT');
  ok('10 the quote is saved: 2 lines, total 40,050 (server), lead time', await until(() => qrow() && qrow().data.total === 40050 && qrow().data.lines.length === 2 && qrow().data.leadTime === '3 weeks'), qrow() && qrow().data);

  /* ═══ the admin sees it and accepts ═══ */
  await A.reload(); await A.waitForSelector('h3:has-text("School HVAC Demo")', { timeout: 30000 });
  await A.click('h3:has-text("School HVAC Demo")');
  await A.waitForSelector('[data-mq-admin]', { timeout: 10000 });
  const ad = await A.evaluate(() => document.querySelector('[data-mq-admin]').innerText);
  ok('11 admin: "Material quotes" lists Demo Supply Co · $40,050.00 · lead time', /Demo Supply Co/.test(ad) && /\$40,050\.00/.test(ad) && /3 weeks/.test(ad), ad);
  await A.locator('[data-mq-admin]').scrollIntoViewIfNeeded(); await shot(A, 'supplier_admin_quotes');
  await A.locator('[data-mq-admin]').getByRole('button', { name: 'Accept', exact: true }).click();
  ok('12 accepted (saved)', await until(() => qrow() && qrow().data.status === 'accepted'), qrow() && qrow().data);

  /* ═══ Suppliers → link the CRM vendor (likely match by e-mail) ═══ */
  await A.click('button:has-text("Back")').catch(() => {});
  await A.click('button:has-text("Suppliers")');   /* the admin tab */
  await A.waitForSelector('[data-vendor-match="V1"]', { timeout: 15000 });
  await shot(A, 'supplier_link');
  await A.click('[data-vendor-match="V1"] button');
  ok('13 Suppliers: the likely match (same e-mail) → Link it → crmVendorId V1', await until(() => (rowData('users/' + SID) || {}).crmVendorId === 'V1'), rowData('users/' + SID));

  /* ═══ the supplier: My Quotes, My Work ═══ */
  await S.reload(); await S.waitForSelector('h3:has-text("School HVAC Demo")', { timeout: 30000 });
  await S.click('button:has-text("My Quotes")');
  await S.waitForSelector('[data-myquote]', { timeout: 10000 });
  ok('14 My Quotes: School HVAC Demo · Accepted · $40,050.00', /Accepted/.test(await body(S)) && /\$40,050\.00/.test(await body(S)));
  await S.click('button:has-text("My Work & Pay")');
  await S.waitForSelector('[data-sw-po]', { timeout: 15000 }).catch(() => {});
  const mw = await body(S);
  ok('15 My Work: PO Q501-1 (RTU 10 ton, no GrayCo cost) and bill INV-77 $36,000.00', /Q501-1/.test(mw) && /RTU 10 ton/.test(mw) && /INV-77/.test(mw) && /\$36,000\.00/.test(mw) && !/9,000|9000/.test(mw), mw.slice(0, 600));
  await shot(S, 'supplier_mywork');
  ok('16 no page errors', errs.length === 0, errs);
} finally { await browser.close(); }
const n = R.filter(Boolean).length; console.log('SUPPLIER_SITE ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
