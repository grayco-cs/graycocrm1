// test_BIDPO_SITE.mjs <build-dir> [shot-dir] — patch BIDPO in the browser: the bid site's ✎ Edit Job Details shows the PO READ-ONLY with
// "from the CRM" (no typing), the job header shows it, 🔗 Link to CRM job when the server is not sure, and the site walk / questions
// deadline can be set there. The built subportal/ in Chromium against the REAL subportal.js on qaa_world's in-memory Supabase. Made-up data.
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, ACC, putRow, rowData } = W;
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: false }).catch(() => {}); };
W.install();
const F = W.fns(BUILD);
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud();
W.H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin' }]);
W.H.cset('projects', [
  { id: 'P_FIRE', name: 'Demo Apartment Fire', address: '2817 Los Gatos Ct', autoPO: 'H138', status: 'estimating' },
  { id: 'P_OLD', name: 'Demo Apartment Fire - Plans', address: '2817 Los Gatos Ct', autoPO: 'Y202', status: 'lost', archived: true },
  { id: 'P_A', name: 'Demo Unit A', address: '500 Demo Ave', autoPO: 'K111', status: 'bidding' },
  { id: 'P_B', name: 'Demo Unit B', address: '500 Demo Avenue', autoPO: 'K222', status: 'bidding' }]);
W.H.cset('leads', []); W.H.cset('schedule', []);
DB.gc_staff.push({ email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', role: 'admin', active: true });
putRow('users', 'st_wjohnson', { id: 'st_wjohnson', email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', title: 'Owner', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: 'st_wjohnson', email: 'wjohnson@grayco-cs.com' });
const job = (id, x) => putRow('jobs', id, Object.assign({ id, status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(10), pmId: 'st_wjohnson', estimatorId: 'st_wjohnson', grayCoRole: 'gc', tradesSought: 'Framing, Paint', createdAt: now }, x), { job_id: id });
job('J_FIRE', { title: 'Apartment Fire', address: '2817 Los Gatos Ct', poNumber: '' });
job('J_AMB', { title: 'Demo Unit C', address: '500 Demo Ave' });
ACC['wjohnson@grayco-cs.com'] = { pw: 'Admin-Pass-1', id: 'auth-w' };
ACC['zz@demo.test'] = { pw: 'Sub-Pass-zz', id: 'auth-zz' };
putRow('users', 'u_zz', { id: 'u_zz', role: 'sub', approved: true, email: 'zz@demo.test', name: 'Zz Demo', company: 'Zz Framing', trades: ['Framing'], authUserId: 'auth-zz' }, { user_id: 'u_zz', email: 'zz@demo.test' });

const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
const page = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); await p.goto('https://bids.test/'); return p; };
try {
  /* ═══ the owner, on a phone (his screenshot) ═══ */
  const A = await page(await W.bidsCtx(browser, BUILD, F, 'phone'));
  await W.bidsLogin(A, 'wjohnson@grayco-cs.com', 'Admin-Pass-1');
  await A.waitForSelector('text=Apartment Fire', { timeout: 30000 });
  await A.click('h3:has-text("Apartment Fire")');
  await A.waitForSelector('[data-po-header]', { timeout: 15000 }).catch(() => {});
  const hdr = await A.evaluate(() => (document.querySelector('[data-po-header]') || {}).textContent || '');
  ok('1 the job header shows PO H138 (the CRM job at 2817 Los Gatos Ct) · from the CRM', /PO H138/.test(hdr) && /from the CRM/.test(hdr), hdr);
  await A.click('button:has-text("Edit Job Details")');
  await A.waitForSelector('[data-po-input]', { timeout: 10000 });
  const f = await A.evaluate(() => { const i = document.querySelector('[data-po-input]'); return { v: i.value, ro: i.readOnly, note: (document.querySelector('[data-po-note]') || {}).textContent || '', otherPo: [...document.querySelectorAll('input')].filter(x => x !== i && /PO/i.test(x.closest('div') && x.closest('div').previousSibling ? '' : '')).length, crmId: /CRM Project ID/.test(document.body.innerText) }; });
  ok('2 ✎ Edit Job Details: the PO is H138, READ-ONLY, "from the CRM · H138 · Demo Apartment Fire (same address)"', f.v === 'H138' && f.ro === true && /from the CRM/.test(f.note) && /Demo Apartment Fire/.test(f.note) && /same address/.test(f.note), f);
  ok('3 … no "CRM Project ID" box to type in any more', !f.crmId, f);
  await A.fill('[data-po-input]', 'TYPED1').catch(() => {});
  ok('4 typing into the PO does nothing', (await A.inputValue('[data-po-input]')) === 'H138');
  await A.locator('[data-po-input]').scrollIntoViewIfNeeded(); await shot(A, 'bidpo_edit_phone_po');
  /* the site walk */
  await A.fill('[data-sw="date"]', DAY(4)); await A.fill('[data-sw="time"]', '09:30'); await A.check('[data-sw="mandatory"]');
  await A.fill('[data-sw="questionsDue"]', DAY(3));
  const ph = await A.getAttribute('[data-sw="location"]', 'placeholder');
  ok('5 site walk: date, time, Mandatory, location (the job address by default), questions due', ph === '2817 Los Gatos Ct', ph);
  await A.locator('[data-sitewalk-edit]').scrollIntoViewIfNeeded(); await shot(A, 'bidpo_edit_phone_sitewalk');
  await A.click('button:has-text("Save Changes")');
  const t0 = Date.now(); while (Date.now() - t0 < 15000 && !((rowData('jobs/J_FIRE') || {}).siteWalk || {}).date) await sleep(300);
  const sj = rowData('jobs/J_FIRE') || {};
  ok('6 saved: the site walk (location = the job address), mandatory, questions due; the PO still H138', sj.siteWalk && sj.siteWalk.date === DAY(4) && sj.siteWalk.time === '09:30' && sj.siteWalk.mandatory === true && sj.siteWalk.location === '2817 Los Gatos Ct' && sj.questionsDue === DAY(3) && sj.poNumber === 'H138', sj.siteWalk);
  await A.waitForSelector('[data-bid-details]', { timeout: 10000 }).catch(() => {});
  const det = await A.evaluate(() => (document.querySelector('[data-bid-details]') || {}).textContent || '');
  ok('7 the job\'s "Bid details" shows the site walk (mandatory) and questions due', det.indexOf(DAY(4) + ' 09:30') > -1 && /mandatory/i.test(det) && det.indexOf(DAY(3)) > -1, det);

  /* ═══ not sure → 🔗 Link to CRM job ═══ */
  await A.click('button:has-text("Back")').catch(() => {}); await A.waitForSelector('h3:has-text("Demo Unit C")', { timeout: 10000 });
  await A.click('h3:has-text("Demo Unit C")'); await A.click('button:has-text("Edit Job Details")'); await A.waitForSelector('[data-po-box]', { timeout: 10000 });
  const amb = await A.evaluate(() => ({ v: document.querySelector('[data-po-input]').value, amb: !!document.querySelector('[data-po-ambiguous]'), cands: [...document.querySelectorAll('[data-po-cand]')].map(b => b.getAttribute('data-po-cand')).sort() }));
  ok('8 two CRM jobs at 500 Demo Ave → no PO yet, "More than one CRM job could be this one", both to pick', amb.v === '' && amb.amb && amb.cands.join() === 'P_A,P_B', amb);
  await A.locator('[data-po-box]').scrollIntoViewIfNeeded(); await shot(A, 'bidpo_edit_phone_ambiguous');
  await A.click('[data-po-cand="P_B"]');
  await A.waitForFunction(() => (document.querySelector('[data-po-input]') || {}).value === 'K222', null, { timeout: 10000 }).catch(() => {});
  const picked = await A.evaluate(() => ({ v: document.querySelector('[data-po-input]').value, note: document.querySelector('[data-po-note]').textContent }));
  ok('9 picked Demo Unit B → PO K222 at once, "from the CRM"; saved on the job', picked.v === 'K222' && /from the CRM/.test(picked.note) && (rowData('jobs/J_AMB') || {}).crmProjectId === 'P_B', picked);
  await A.click('button:has-text("Cancel")');

  /* ═══ a sub ═══ */
  const S = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
  await W.bidsLogin(S, 'zz@demo.test', 'Sub-Pass-zz');
  await S.waitForSelector('h3:has-text("Apartment Fire")', { timeout: 30000 });
  await S.click('h3:has-text("Apartment Fire")'); await S.waitForSelector('[data-po-header]', { timeout: 15000 }).catch(() => {});
  const sv = await S.evaluate(() => ({ hdr: (document.querySelector('[data-po-header]') || {}).textContent || '', edit: /Edit Job Details/.test(document.body.innerText), link: !!document.querySelector('[data-po-change]') }));
  ok('10 the sub sees "PO H138" on the job; no edit, no linking', /PO H138/.test(sv.hdr) && !/from the CRM/.test(sv.hdr) && !sv.edit && !sv.link, sv);
  await shot(S, 'bidpo_sub_job');
  ok('11 no page errors', errs.length === 0, errs);
} finally { await browser.close(); }
const n = R.filter(Boolean).length; console.log('BIDPO_SITE ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
