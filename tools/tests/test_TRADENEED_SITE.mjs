// test_TRADENEED_SITE.mjs <build-dir> — patch TRADENEED (owner 11/24: "If they haven't picked a trade make them choose"): a sub with no trade
// on file gets "🧰 Pick your trade(s)" on Available Jobs (a card, not a popup); picking + Save stores the trades on their account and the
// card goes; a sub WITH a trade never sees it. Made-up data only, the real subportal.js on qaa_world's in-memory Supabase.
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { ACC, putRow, rowData } = W;
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(250); } return false; };
W.install();
const F = W.fns(BUILD);
const DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud(); W.H.cset('projects', []); W.H.cset('leads', []);
ACC['notrade@demo.test'] = { pw: 'Sub-Pass-1', id: 'auth-nt' };
ACC['hastrade@demo.test'] = { pw: 'Sub-Pass-2', id: 'auth-ht' };
putRow('users', 'u_nt', { id: 'u_nt', role: 'sub', approved: true, email: 'notrade@demo.test', name: 'No Trade', company: 'Old Account LLC', trades: [], authUserId: 'auth-nt' }, { user_id: 'u_nt', email: 'notrade@demo.test' });
putRow('users', 'u_ht', { id: 'u_ht', role: 'sub', approved: true, email: 'hastrade@demo.test', name: 'Has Trade', company: 'Roof Co', trades: ['Roofing'], authUserId: 'auth-ht' }, { user_id: 'u_ht', email: 'hastrade@demo.test' });
putRow('subdocs', 'u_nt', { items: [] }, { user_id: 'u_nt' }); putRow('subdocs', 'u_ht', { items: [] }, { user_id: 'u_ht' });
putRow('jobs', 'J1', { id: 'J1', title: 'Demo Roof Job', status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(10), tradesSought: 'Roofing', createdAt: new Date().toISOString() }, { job_id: 'J1' });
const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
const page = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); await p.goto('https://bids.test/'); return p; };
try {
  const A = await page(await W.bidsCtx(browser, BUILD, F, 'phone'));
  await W.bidsLogin(A, 'notrade@demo.test', 'Sub-Pass-1');
  const card = await A.waitForSelector('[data-tradeneed]', { timeout: 30000 }).catch(() => null);
  ok('1 a sub with no trade: "🧰 Pick your trade(s)" on Available Jobs (in the page, not a popup)', !!card && /Pick your trade/.test(await card.textContent()) && !(await A.$('[role=dialog]')));
  await A.click('[data-tn="save"]');
  ok('2 Save with nothing picked → "Pick at least one trade."', await until(async () => /Pick at least one trade/.test(await A.evaluate(() => document.body.innerText))));
  const chip = A.locator('[data-tradeneed] button', { hasText: /Roof/ }).first();
  if (await chip.count()) await chip.click(); else await A.fill('[data-tn="other"]', 'Roofing');
  await A.fill('[data-tn="other"]', 'Gutters');
  await A.click('[data-tn="save"]');
  ok('3 picked + Save → the trades are stored on their account', await until(() => { const u = rowData('users/u_nt') || {}; return Array.isArray(u.trades) && u.trades.some(x => /gutter/i.test(x)); }, 20000), rowData('users/u_nt'));
  ok('4 … and the card is gone', await until(async () => !(await A.$('[data-tradeneed]'))));
  const B = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
  await W.bidsLogin(B, 'hastrade@demo.test', 'Sub-Pass-2');
  await B.waitForSelector('h3:has-text("Demo Roof Job")', { timeout: 30000 });
  ok('5 a sub WITH a trade never sees the card', !(await B.$('[data-tradeneed]')));
  ok('6 no page errors', !errs.length, errs);
} catch (e) { ok('threw: ' + String(e.message).slice(0, 200), false); }
await browser.close();
const n = R.length, f = R.filter(x => !x).length;
console.log('TRADENEED_SITE ' + (n - f) + '/' + n);
process.exit(f ? 1 : 0);
