// test_BIDSITE3_SITE.mjs <build-dir> [shot-dir] — patch BIDSITE3 in the browser: the built subportal/ in Chromium against the REAL
// subportal.js on qaa_world's in-memory Supabase (made-up data only; e-mail captured where it would reach Resend, nothing leaves).
//   · admin: Invite (🔨 sub / 🧱 supplier) on a private job → the e-mail goes at once ("GrayCo invited you to bid: …"), the row says ✉ e-mailed
//   · admin: 📧 Bid site e-mails — six switches (we-lost, addendum, due reminder OFF); turning one on is saved
//   · admin: ✎ Edit Job Details → "Show supplier materials to subs while bidding" → saved on the job
//   · sub: the job's materials (the list without a $ price, the suppliers' materials without a price or a supplier name),
//     "Request more materials" → sent, listed "Waiting for the PM"
//   · supplier: the quote form has a spec per line and "Your files, specs and quotes" (attach a PDF → saved with the quote)
//   · no page errors
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
  /* ═══ the admin ═══ */
  const A = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
  await W.bidsLogin(A, 'owner@grayco-cs.com', 'Admin-Pass-1');
  await A.waitForSelector('h3:has-text("Private Fit-out Demo")', { timeout: 30000 });
  await A.click('h3:has-text("Private Fit-out Demo")');
  await A.waitForSelector('[data-invite-email]', { timeout: 15000 });
  await A.click('[data-invite-pick="supplier"]');
  await A.fill('[data-invite-email]', 'new@supply.test');
  await A.click('[data-invite-send]');
  ok('1 Invite (🧱 supplier) → the e-mail goes at once: "GrayCo invited you to bid: Private Fit-out Demo", the supplier sign-up link', await until(() => MAIL.some(m => m.to.includes('new@supply.test') && m.subject === 'GrayCo invited you to bid: Private Fit-out Demo' && /as=supplier/.test(m.html))), MAIL.map(m => m.subject));
  ok('2 the invite row says ✉ e-mailed (🧱), saved with as: supplier', await A.waitForSelector('[data-invite-row="new@supply.test"]:has-text("e-mailed")', { timeout: 10000 }).then(() => true, () => false) && rowsOf('invites').some(r => r.email === 'new@supply.test' && r.data.as === 'supplier' && r.data.mailedAt));
  await A.locator('[data-invite-row="new@supply.test"]').scrollIntoViewIfNeeded(); await shot(A, 'bs3_invite');
  await A.waitForTimeout(1500);
  ok('3 one invite only (the page\'s own save after the server\'s does not double it)', rowsOf('invites').filter(r => r.email === 'new@supply.test').length === 1);

  /* 📧 Bid site e-mails */
  await A.click('button:has-text("Back")').catch(() => {});
  await A.click('button:has-text("Bid site e-mails")');
  await A.waitForSelector('[data-bidmail-sw="lost"]', { timeout: 15000 });
  const sw = await A.evaluate(() => Array.from(document.querySelectorAll('[data-bidmail-sw]')).map(i => [i.getAttribute('data-bidmail-sw'), i.checked]));
  ok('4 📧 Bid site e-mails: six switches — invite / accepted / won-not-used ON; we-lost / addendum / due reminder OFF', JSON.stringify(sw) === JSON.stringify([['invite', true], ['accepted', true], ['wonNotUsed', true], ['lost', false], ['addendum', false], ['dueReminder', false]]), sw);
  await shot(A, 'bs3_bidmail');
  await A.click('[data-bidmail-sw="addendum"]');
  ok('5 turning "Addendum posted" on is saved', await until(() => { const r = rowData('settings/bidmail'); return r && r.switches && r.switches.addendum === true && r.switches.lost === false; }), rowData('settings/bidmail'));

  /* ✎ Edit Job Details → Show supplier materials */
  await A.click('button:has-text("Open Jobs")').catch(() => {});
  await A.click('button:has-text("Jobs")').catch(() => {});
  await A.waitForSelector('h3:has-text("Clinic Drywall Demo")', { timeout: 15000 });
  await A.click('h3:has-text("Clinic Drywall Demo")'); await A.click('button:has-text("Edit Job Details")');
  await A.waitForSelector('[data-ssm="on"]', { timeout: 10000 }); await A.check('[data-ssm="on"]');
  await A.locator('[data-ssm="on"]').scrollIntoViewIfNeeded(); await shot(A, 'bs3_edit_ssm');
  await A.click('button:has-text("Save Changes")');
  ok('6 ✎ Edit Job Details → "Show supplier materials to subs while bidding" saved on the job', await until(() => (rowData('jobs/J_PUB') || {}).showSupplierMaterials === true), rowData('jobs/J_PUB'));

  /* ═══ the sub ═══ */
  const S = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
  await W.bidsLogin(S, 'a@sub.test', 'Sub-Pass-1');
  await S.waitForSelector('h3:has-text("Clinic Drywall Demo")', { timeout: 30000 });
  await S.click('h3:has-text("Clinic Drywall Demo")');
  await S.waitForSelector('[data-sub-materials]', { timeout: 15000 });
  const mt = await S.evaluate(() => document.querySelector('[data-sub-materials]').innerText);
  ok('7 the sub sees the job\'s materials without the price, and the suppliers\' materials (Type X board · ASTM C1396 · 200 sht) with no price, no supplier name', /200 sheets 5\/8 Type X/.test(mt) && !/\$|14\.50/.test(mt) && /Type X board 5\/8/.test(mt) && /ASTM C1396/.test(mt) && /200 sht/.test(mt) && !/Demo Supply|2,900|2900/.test(mt), mt);
  ok('8 never GrayCo\'s budget anywhere on the page', !/250,000|250000/.test(await body(S)));
  await S.fill('[data-req="item"]', 'Metal studs 3-5/8'); await S.fill('[data-req="qty"]', '50'); await S.fill('[data-req="unit"]', 'ea'); await S.fill('[data-req="reason"]', 'Added soffit per RFI 4');
  await S.locator('[data-req-form]').scrollIntoViewIfNeeded(); await shot(S, 'bs3_sub_materials');
  await S.click('[data-req-send]');
  ok('9 "Request more materials" → saved for the PM (pending), and listed "Waiting for the PM"', await until(() => rowsOf('matreqs').some(r => r.data.item === 'Metal studs 3-5/8' && r.data.qty === 50 && r.data.status === 'pending')) && await S.waitForSelector('[data-req-status="pending"]:has-text("Waiting for the PM")', { timeout: 10000 }).then(() => true, () => false));

  /* ═══ the supplier ═══ */
  const Q = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
  await W.bidsLogin(Q, 'q@supply.test', 'Sup-Pass-1');
  await Q.waitForSelector('h3:has-text("Clinic Drywall Demo")', { timeout: 30000 });
  await Q.click('h3:has-text("Clinic Drywall Demo")');
  await Q.waitForSelector('[data-mq-form] [data-mq="spec"]', { timeout: 15000 });
  await Q.fill('[data-mq-line="0"] [data-mq="spec"]', 'ASTM C1396 Type X');
  const fi = await Q.$('[data-mq-docs] input[type=file]');
  ok('10 the supplier\'s quote form: a spec per line and "Your files, specs and quotes"', !!fi && /Your files, specs and quotes/i.test(await Q.evaluate(() => document.querySelector('[data-mq-docs]').textContent)));
  if (fi) await fi.setInputFiles({ name: 'Quote 4471.pdf', mimeType: 'application/pdf', buffer: W.PDF(1, 3000) });
  await Q.locator('[data-mq-form]').scrollIntoViewIfNeeded(); await shot(Q, 'bs3_supplier_quote');
  await Q.click('[data-mq-form] button:has-text("Update")').catch(() => Q.click('[data-mq-form] button:has-text("Send")'));
  ok('11 sent: the quote keeps the spec and the attached file (their own upload)', await until(() => { const q = rowData('mquotes/mq_1'); return q && q.lines[0].spec === 'ASTM C1396 Type X' && (q.docs || []).length === 1 && /^u\/u_sup\//.test(q.docs[0].fileRef) && q.docs[0].name === 'Quote 4471.pdf'; }, 20000), rowData('mquotes/mq_1'));
  ok('12 no page errors', errs.length === 0, errs);
} finally { await browser.close(); }
const n = R.filter(Boolean).length; console.log('BIDSITE3_SITE ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
