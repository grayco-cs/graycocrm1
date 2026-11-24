// test_BIDEST_SITE.mjs <build-dir> [shot-dir] — the owner's 11/19 bid-site reports in the browser (built subportal/ in Chromium against the
// REAL subportal.js on qaa_world's in-memory Supabase; made-up data only):
//   1. ✎ Edit Job Details on a job with NO estimator stored (the Lead Inbox's jobs): the select used to SHOW the first person while the form
//      held '' → "Please select an Estimator." Now: a commercial job opens with the Senior Estimator (the CRM setting) picked and saves
//      ("Job updated.", stored on the job); a residential job with none shows "— Select —" (no fake pick) and asks.
//   2. the sub sees the estimator's phone + e-mail next to the PM's.
//   3. the sub's job page: no "Solicitation & documents" link, no invitation to bid; the plans, addendum and scope are there. The admin
//      sees everything with "Visible to subs" / "Hidden from subs" ticks; ticking one shows it to the sub.
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, ACC, putRow, rowData } = W;
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: false }).catch(() => {}); };
const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(250); } return false; };
W.install();
const F = W.fns(BUILD);
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud(); W.H.cset('projects', []); W.H.cset('leads', []); W.H.cset('schedule', []);
W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin' }]);
DB.lkv.set('gc_lead_inbox_settings', { key: 'gc_lead_inbox_settings', value: { estimator: { name: 'Est Beta', email: 'estb@grayco-cs.com' } }, updated_at: now });
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true }, { email: 'aaa@grayco-cs.com', name: 'Aaa First', role: 'admin', active: true }, { email: 'estb@grayco-cs.com', name: 'Est Beta', role: 'admin', active: true });
const staffRow = (id, email, name, phone, title) => putRow('users', id, { id, email, name, phone, title, role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: id, email });
staffRow('st_owner', 'owner@grayco-cs.com', 'Demo Owner', '901-555-0100', 'Owner');
staffRow('st_aaa', 'aaa@grayco-cs.com', 'Aaa First', '901-555-0101', 'Office');
staffRow('st_estb', 'estb@grayco-cs.com', 'Est Beta', '901-555-0122', 'Commercial Estimator');
ACC['owner@grayco-cs.com'] = { pw: 'Admin-Pass-1', id: 'auth-owner' };
ACC['sub@demo.test'] = { pw: 'Sub-Pass-1', id: 'auth-sub' };
putRow('users', 'u_sub', { id: 'u_sub', role: 'sub', approved: true, email: 'sub@demo.test', name: 'Demo Sub', company: 'Demo HVAC', trades: ['HVAC'], authUserId: 'auth-sub' }, { user_id: 'u_sub', email: 'sub@demo.test' });
putRow('subdocs', 'u_sub', { items: [] }, { user_id: 'u_sub' });
const SOL = 'https://www.demo-city.test/bids/26-014';
const job = (id, x) => putRow('jobs', id, Object.assign({ id, status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(20), pmId: 'st_owner', estimatorId: '', grayCoRole: 'gc', tradesSought: 'HVAC', createdAt: now }, x), { job_id: id });
job('J1', { title: 'Auditorium HVAC Demo', address: 'Demo City, TN',
  plansLinks: [{ id: 'pl1', url: SOL, label: 'Solicitation & documents (Demo City)', board: 'Government' }, { id: 'pl2', url: 'https://files.demo.test/plans', label: 'Plan set' }],
  plans: [{ name: 'Invitation to Bid.pdf', size: 1000 }, { name: 'M-101 HVAC Plan.pdf', size: 2000 }, { name: 'Addendum 1.pdf', size: 300 }],
  scopeDocs: [{ id: 'sc1', name: 'GrayCo HVAC Scope.pdf', size: 1000, fileRef: 'staff/x/scope.pdf' }] });
job('J2', { title: 'Residential Demo', projectType: 'residential' });
putRow('plans', 'J1', { items: [{ name: 'Invitation to Bid.pdf', fileRef: 'staff/x/itb.pdf' }, { name: 'M-101 HVAC Plan.pdf', fileRef: 'staff/x/m101.pdf' }, { name: 'Addendum 1.pdf', fileRef: 'staff/x/a1.pdf' }] }, { job_id: 'J1' });

const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
const page = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); await p.goto('https://bids.test/'); return p; };
const toast = p => p.evaluate(() => document.body.innerText);
try {
  const A = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
  await W.bidsLogin(A, 'owner@grayco-cs.com', 'Admin-Pass-1');
  await A.waitForSelector('h3:has-text("Auditorium HVAC Demo")', { timeout: 30000 });
  await A.click('h3:has-text("Auditorium HVAC Demo")');
  await A.click('button:has-text("Edit Job Details")');
  await A.waitForSelector('[data-edit-est]', { timeout: 10000 });
  const sel = await A.evaluate(() => { const s = document.querySelector('[data-edit-est]'); return { v: s.value, shown: s.options[s.selectedIndex] && s.options[s.selectedIndex].textContent }; });
  ok('1 ✎ Edit Job Details: the estimator select HOLDS the Senior Estimator (Est Beta, the CRM setting) — what it shows is what it saves', sel.v === 'st_estb' && /Est Beta/.test(sel.shown), sel);
  await shot(A, 'bidest_edit');
  await A.click('button:has-text("Save Changes")');
  await A.waitForSelector('text=Job updated.', { timeout: 10000 }).catch(() => {});
  const tx = await toast(A);
  ok('2 Save Changes → "Job updated." (no "Please select an Estimator.")', /Job updated\./.test(tx) && !/Please select an Estimator/.test(tx));
  ok('3 … the estimator is stored on the job', await until(() => (rowData('jobs/J1') || {}).estimatorId === 'st_estb'), rowData('jobs/J1'));
  /* the job page: the admin sees everything with the ticks */
  await A.waitForSelector('[data-subvis]', { timeout: 10000 });
  const vis = await A.evaluate(() => [...document.querySelectorAll('[data-subvis]')].map(x => x.closest('div[style]').parentElement.textContent.replace(/\s+/g, ' ').slice(0, 80) + '=' + x.getAttribute('data-subvis')));
  ok('4 admin: the invitation to bid and the solicitation link are "Hidden from subs"; the plans, addendum, scope and plan set "Visible to subs"',
    vis.some(v => /Invitation to Bid/.test(v) && /=off$/.test(v)) && vis.some(v => /M-101/.test(v) && /=on$/.test(v)) && vis.some(v => /GrayCo HVAC Scope/.test(v) && /=on$/.test(v)) && vis.filter(v => /=off$/.test(v)).length === 1, vis);
  const lv = await A.evaluate(() => [...document.querySelectorAll('[data-linkvis]')].map(x => x.closest('[data-planlink]').textContent.replace(/\s+/g, ' ')));
  ok('4b NOLINKS (owner 11/24): the solicitation link says "GrayCo only", the plan set link "Subs see this plan set" — no tick on links', lv.length === 2 && lv.some(v => /Solicitation/.test(v) && /GrayCo only/.test(v)) && lv.some(v => /Plan set/.test(v) && /Subs see this plan set/.test(v)), lv);
  ok('5 admin still sees the "Solicitation & documents" link', /Solicitation & documents/.test(await A.evaluate(() => document.body.innerText)));
  await A.locator('[data-planlink="0"]').scrollIntoViewIfNeeded().catch(() => {}); await shot(A, 'bidvis_admin');
  /* the residential job: no estimator → "— Select —" and the honest ask */
  await A.click('button:has-text("Back")'); await A.waitForSelector('h3:has-text("Residential Demo")', { timeout: 10000 });
  await A.click('h3:has-text("Residential Demo")'); await A.click('button:has-text("Edit Job Details")'); await A.waitForSelector('[data-edit-est]');
  const sel2 = await A.evaluate(() => { const s = document.querySelector('[data-edit-est]'); return { v: s.value, shown: s.options[s.selectedIndex].textContent }; });
  ok('6 a residential job with no estimator shows "— Select —" (not a person it does not hold)', sel2.v === '' && /Select/.test(sel2.shown), sel2);
  await A.click('button:has-text("Save Changes")'); await sleep(400);
  ok('7 … and Save asks to pick one', /Please select an Estimator/.test(await toast(A)));
  await A.selectOption('[data-edit-est]', 'st_aaa'); await A.click('button:has-text("Save Changes")');
  ok('8 picking one saves it', await until(() => (rowData('jobs/J2') || {}).estimatorId === 'st_aaa'), rowData('jobs/J2'));

  /* ═══ the sub ═══ */
  const S = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
  await W.bidsLogin(S, 'sub@demo.test', 'Sub-Pass-1');
  await S.waitForSelector('h3:has-text("Auditorium HVAC Demo")', { timeout: 30000 });
  await S.click('h3:has-text("Auditorium HVAC Demo")');
  await S.waitForSelector('[data-contact-email]', { timeout: 10000 }).catch(() => {});
  const c = await S.evaluate(() => ({ txt: document.body.innerText, mails: [...document.querySelectorAll('[data-contact-email]')].map(x => x.textContent), tels: [...document.querySelectorAll('a[href^="tel:"]')].map(x => x.textContent.trim()) }));
  ok('9 the sub sees the PM and the estimator (Est Beta): phones + e-mails side by side', c.mails.includes('owner@grayco-cs.com') && c.mails.includes('estb@grayco-cs.com') && c.tels.some(x => /901-555-0122/.test(x)) && c.tels.some(x => /901-555-0100/.test(x)) && /Est Beta/.test(c.txt), { mails: c.mails, tels: c.tels });
  await shot(S, 'bidest_sub_contacts');
  const html = await S.content();
  ok('10 the sub: no "Solicitation & documents" link, no invitation to bid, the URL nowhere on the page', !/Solicitation/.test(c.txt) && !/Invitation to Bid/.test(c.txt) && html.indexOf(SOL) < 0);
  ok('11 the sub: the plans, the addendum, GrayCo\'s scope and the plan set link are there; no ticks', /M-101 HVAC Plan/.test(c.txt) && /Addendum 1/.test(c.txt) && /GrayCo HVAC Scope/.test(c.txt) && /Plan set/.test(c.txt) && !(await S.$('[data-subvis]')));
  await S.locator('text=M-101 HVAC Plan').first().scrollIntoViewIfNeeded().catch(() => {}); await shot(S, 'bidvis_sub');

  /* the admin ticks the invitation to bid visible → the sub sees it */
  await A.click('button:has-text("Back")'); await A.click('h3:has-text("Auditorium HVAC Demo")');
  await A.waitForSelector('[data-subvis]');
  await A.evaluate(() => { const row = [...document.querySelectorAll('[data-subvis]')].find(x => /Invitation to Bid/.test(x.closest('div[style]').parentElement.textContent)); row.querySelector('input').click(); });
  ok('12 ticking "Visible to subs" on the invitation saves subsVisible true on the job', await until(() => ((rowData('jobs/J1') || {}).plans || []).some(p => p.name === 'Invitation to Bid.pdf' && p.subsVisible === true)), (rowData('jobs/J1') || {}).plans);
  await S.reload(); await S.waitForSelector('h3:has-text("Auditorium HVAC Demo")', { timeout: 30000 }).catch(() => {});
  if (await S.$('h3:has-text("Auditorium HVAC Demo")')) await S.click('h3:has-text("Auditorium HVAC Demo")').catch(() => {});
  await sleep(1200);
  ok('13 … the sub now sees it', /Invitation to Bid/.test(await S.evaluate(() => document.body.innerText)));
  ok('14 no page errors', errs.length === 0, errs);
} finally { await browser.close(); }
const n = R.filter(Boolean).length; console.log('BIDEST_SITE ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
