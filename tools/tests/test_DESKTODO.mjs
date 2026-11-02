// test_DESKTODO.mjs <build-dir> — patch DESKTODO: the office's Desk home steps aside whenever another screen opens, by any path
//   (a code call, a notification link, a window opened over the page, the menu, the Desk's own Open To-Do), and the To-Do's
//   import buttons can then be clicked; the Desk's own More sheet does not hide it. 1366×768 and 1920×1080. Made-up data, offline.
import { pathToFileURL } from 'url';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wME/harness.mjs';
const { computer, sleep, waitFor, cset, cget, signIn, cloud } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_MONEY.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };

/* ── made-up world ── */
const pad = n => String(n).padStart(2, '0'); const now = new Date(); const Y = now.getFullYear();
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const us = ymd => ymd.slice(5, 7) + '/' + ymd.slice(8, 10) + '/' + ymd.slice(0, 4);
cloud.clear();
const iso = new Date().toISOString();
cset('users', [{ id: 'U1', name: 'Demo Office', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { id: 'U2', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [
  { id: 'P1', name: 'Demo Hollis Reroof', address: '8382 Laurett Cove, Cordova, TN', autoPO: 'A101', pm: 'Demo Owner', client: 'Demo Hollis', status: 'Active', contract: 20000, type: 'Residential', leadSource: 'Facebook/Instagram Ads', created: day(-20), savedAt: iso, updatedAt: iso },
  { id: 'P2', name: 'Demo Brent Kitchen', address: '123 Senatobia Dr, Hernando, MS', autoPO: 'T724', pm: 'Demo Owner', client: 'Demo Brent', status: 'Active', contract: 30000, type: 'Residential', created: day(-30), savedAt: iso, updatedAt: iso },
  { id: 'P3', name: 'Demo Old Deck', address: '77 Finished Rd, Memphis TN', autoPO: 'D404', pm: 'Demo Owner', client: 'X', status: 'completed', contract: 5000, created: day(-200), savedAt: iso, updatedAt: iso }
]);
cset('invs', [{ id: 'I1', type: 'client', pid: 'P1', amt: 10000, status: 'paid', paid: 10000, paidDate: day(-5), date: day(-10), invNum: '9001', savedAt: iso, updatedAt: iso }]);
cset('expenses', [
  { id: 'E1', pid: 'P2', type: 'purchase', vendor: 'THE HOME DEPOT #6620', desc: 'lumber', amt: 120, category: 'Materials', status: 'approved', approved: true, date: day(-12), payMethod: 'Credit Card', savedAt: iso, updatedAt: iso },
  { id: 'E2', pid: 'P2', type: 'purchase', vendor: 'HOME DEPOT 6620', desc: 'screws', amt: 40, category: 'Materials', status: 'approved', approved: true, date: day(-8), payMethod: 'Credit Card', savedAt: iso, updatedAt: iso },
  { id: 'E3', pid: '', type: 'purchase', vendor: 'SHELL OIL 5741', desc: 'Card charge PO T724', amt: 61.5, category: 'Fuel/Gas', status: 'approved', date: day(-3), payMethod: 'Credit Card', by: 'CC Import', savedAt: iso, updatedAt: iso }
]);
/* (every row is an hour old, like a real cloud: the CRM's catch-up poll must not think the seed just changed) */
const seedLeads = [1, 2, 3, 4].map(i => ({ id: 'L' + i, name: 'Demo lead ' + i, source: 'Facebook/Instagram Ads', status: i === 1 ? 'won' : 'new', stage: i === 1 ? 'Won' : 'New Lead', createdAt: day(-i) + 'T12:00:00Z', created: day(-i), projectId: i === 1 ? 'P1' : '' }));
cset('leads', seedLeads);
const old = new Date(Date.now() - 3600e3).toISOString(); for (const [k, r] of cloud) cloud.set(k, Object.assign({}, r, { updated_at: old }));

const A = await computer('A', { build });
await A.ctx.route(u => new URL(u).pathname.startsWith('/.netlify/functions/'), r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
const p = A.page(); await p.setViewportSize({ width: 1366, height: 768 });
await signIn(A, 'office@grayco-cs.com', 1500);
ok(await waitFor(A, () => !!(window._gcMoney && window._crm && (window._crm.projects || []).length === 3 && (window._crm.expenses || []).length >= 3 && window._gcAddCardCharge && window._gcAcctModel), null, 90000), 'the CRM loaded with the made-up jobs and the money patch');
await p.evaluate(() => { for (const b of [...document.querySelectorAll('button')]) if (b.offsetParent && /^(Later|Got it!?|Not now|×|✕)$/.test(b.textContent.trim())) b.click(); }).catch(() => {});



/* ── the Desk and the To-Do's import buttons ── */
const deskShown = () => p.evaluate(() => { const el = document.getElementById('gc-ra-desk'); return !!(el && el.isConnected && el.style.display !== 'none' && el.getBoundingClientRect().width > 0); });
const why = () => p.evaluate(() => (window._gcDeskToDo && window._gcDeskToDo.state().last.why) || '');
const reopen = async () => { await p.evaluate(() => { try { window._gcRA.open(); } catch (e) {} }); await sleep(800); return deskShown(); };
const BTN = ['#gc-money-needs [data-mn="import"]', '#gc-money-needs [data-mn="bank"]', '#gc-money-needs [data-mn="needs"]', '#gc-bulkdrop-todo'];
async function clickable(){
  const out = {};
  for (const sel of BTN) {
    if (!(await p.locator(sel).count())) { out[sel] = 'absent'; continue; }
    try { await p.locator(sel).first().scrollIntoViewIfNeeded(); await p.click(sel, { timeout: 4000, trial: true }); out[sel] = 'ok'; } catch (e) { out[sel] = 'COVERED ' + (String(e.message).split('\n').find(l => /intercepts/.test(l)) || '').replace(/\x1b\[[0-9;]*m/g, '').trim().slice(0, 120); }
  }
  return out;
}
const allOk = c => Object.values(c).every(v => v === 'ok' || v === 'absent') && c[BTN[0]] === 'ok' && c[BTN[1]] === 'ok';
for (const [w, h] of [[1366, 768], [1920, 1080]]) {
  await p.setViewportSize({ width: w, height: h }); await sleep(1200);
  const tag = w + '×' + h + ': ';
  ok(await reopen(), tag + 'the office is on the Desk home');
  /* a code call (the screen opened by the CRM itself, no click) */
  await p.evaluate(() => window._setView('todo')); await sleep(1500);
  ok(!(await deskShown()), tag + 'a code call opens the To-Do: the Desk steps aside', await why());
  await waitFor(A, () => !!document.querySelector('#gc-money-needs [data-mn="import"]'), null, 15000);
  let c = await clickable(); ok(allOk(c), tag + 'the import buttons can be clicked (card, bank, needs a job, drop invoices)', c);
  /* a notification / e-mailed link */
  await reopen(); await p.evaluate(() => { location.hash = '#lead=L2'; }); await sleep(1500);
  ok(!(await deskShown()), tag + 'a notification link (#lead=…) opens: the Desk steps aside', await why());
  await p.evaluate(() => { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} });
  /* a window opened over the page (a To-Do card's / @mention window) */
  await reopen(); await p.evaluate(() => { const ov = document.createElement('div'); ov.id = 'desktodo-probe-ov'; ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.4)'; document.body.appendChild(ov); }); await sleep(1200);
  ok(!(await deskShown()), tag + 'a window opened over the page: the Desk steps aside', await why());
  await p.evaluate(() => { const o = document.getElementById('desktodo-probe-ov'); if (o) o.remove(); });
  /* the left menu reached from code, as test_MONEY does */
  await reopen(); await p.evaluate(() => { const b = [...document.querySelectorAll('aside nav button, nav button')].find(y => /To-Do/.test(y.textContent)); if (b) b.click(); }); await sleep(1500);
  ok(!(await deskShown()), tag + 'the menu To-Do (clicked from code, under the Desk): the Desk steps aside', await why());
  /* the Desk's own Open To-Do, clicked like a person */
  await reopen(); await p.evaluate(() => window._setView('dashboard')); await reopen();
  const open = p.locator('#gc-ra-desk button', { hasText: /Open To-Do/ });
  if (await open.count()) { await open.first().click(); await sleep(1500); ok(!(await deskShown()), tag + 'the Desk\'s own "Open To-Do": the Desk steps aside'); c = await clickable(); ok(allOk(c), tag + 'the import buttons can be clicked after the Desk\'s Open To-Do', c); }
  else ok(false, tag + 'the Desk shows "Open To-Do"');
  /* the Desk's own More sheet does not hide it */
  await reopen(); await p.evaluate(() => { try { window._gcRA.more(); } catch (e) {} }); await sleep(1000);
  ok(await deskShown(), tag + 'the Desk\'s own More sheet keeps the Desk');
  await p.evaluate(() => { document.querySelectorAll('.gc-ra-sheet').forEach(x => x.remove()); });
}
ok(!A.errs.length, 'no page errors', A.errs.slice(0, 3));
console.log('\nDESKTODO ' + pass + '/' + (pass + fail) + (fail ? ' — ' + fail + ' FAILED' : ''));
await A.b.close(); process.exit(fail ? 1 : 0);
