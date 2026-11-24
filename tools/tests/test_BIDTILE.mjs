// test_BIDTILE.mjs <build-dir> — patch BIDTILE (owner 11/24, iPhone): "want a button for the bid portal" on the GrayCo Field home.
//   · the admin's big ⏱ Clock in tile is 🏗 Bid portal (BIDTILE2), a PM's is 💬 Messages; a tap opens the Bid portal screen (its jobs list mounts),
//     🏠 Home brings the dashboard back; no page errors.
//   · a PM whose role may not open the Bid portal screen does not get the tile.
// Usage: node test_BIDTILE.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs) — made-up data, nothing leaves the machine.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const sleep = H.sleep;
const acct = name => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].name === name);
const NICK = acct('Nick Gray'), PM = acct('Demo PM');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', payType: 'salary_commission', active: true }]);
H.cset('projects', [
  { id: 'P1', po: 'PO-3001', name: 'Kitchen - Maple', client: 'Sample Homeowner A', address: '101 Demo St', pm: 'Demo PM', status: 'Active', updatedAt: ago(1) },
  { id: 'P2', po: 'PO-3002', name: 'Roof - Oak', client: 'Sample Homeowner B', address: '202 Demo Ave', pm: 'Nick Gray', status: 'Active', updatedAt: ago(2) },
  { id: 'P3', po: 'PO-3003', name: 'Office TI - Elm', client: 'Sample Biz', address: '303 Demo Blvd', pm: 'Demo PM', status: 'Active', updatedAt: ago(3) }]);
H.cset('schedule', []); H.cset('leads', []);
const IPHONE = () => { try { Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }); } catch (e) {} };
const OPEN = [];
async function phone(email, who){
  const c = await H.computer(who, { build, mobile: true, init: IPHONE }); OPEN.push(c);
  await H.signIn(c, email, 9000);
  await H.waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh') && !!document.querySelector('#gc-fh-tabs[data-ra-bar]'), null, 45000);
  await H.waitFor(c, () => (window._crm && window._crm.projects || []).length >= 3, null, 30000);
  await sleep(2000);
  return c;
}
const tiles = c => c.ev(() => [...document.querySelectorAll('#_gcJobPick .gc-pmf-x [data-ra-a], #_gcJobPick .gc-pmf-x button')].map(b => b.textContent.trim().replace(/\s+/g, ' ')));
const big = c => c.ev(() => [...document.querySelectorAll('#_gcJobPick .gc-pmf-q .gc-pmf-t')].map(b => (b.querySelector('.l') || b).textContent.trim()));
try {
  const a = await phone(NICK, 'nick');
  const T = await tiles(a);
  console.log('    admin tiles: ' + JSON.stringify(T));
  const B = await big(a); console.log('    admin big tiles: ' + JSON.stringify(B));
  ok(B[5] === 'Bid portal' && !B.some(t => /Clock/.test(t)), 'admin (BIDTILE2): the big 🏗 Bid portal tile is where ⏱ Clock in was', B);
  ok(!T.some(t => /Bid portal/.test(t)), 'admin: no second, small Bid portal tile', T);
  const e0 = a.errs.length;
  const b = a.page().locator('#_gcJobPick .gc-pmf-q .gc-pmf-t', { hasText: 'Bid portal' }).first();
  await b.scrollIntoViewIfNeeded().catch(() => {}); const bb = await b.boundingBox();
  await a.page().touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const opened = await H.waitFor(a, () => !!document.querySelector('#gc-sys-bp-mount') && document.querySelector('#gc-sys-bp-mount').offsetParent !== null, null, 15000);
  ok(!!opened, 'a tap opens the Bid portal screen', await a.ev(() => ({ mount: !!document.querySelector('#gc-sys-bp-mount'), body: document.body.innerText.slice(0, 300) })));
  await a.ev(() => { const x = [...document.querySelectorAll("#gc-fh-tabs [data-t], #gc-fh-tabs button")].find(b => /Home/.test(b.textContent)); if (x) x.click(); });
  const back = await H.waitFor(a, () => { const h = document.getElementById('_gcJobPick'); return !!h && h.getClientRects().length > 0 && getComputedStyle(h).display !== "none" && !!h.querySelector(".gc-pmf-q"); }, null, 10000);
  ok(!!back, '🏠 Home brings the dashboard back');
  ok(a.errs.length === e0, 'no page errors', a.errs.slice(e0, e0 + 3));
  const p = await phone(PM, 'pm');
  const allowed = await p.ev(() => typeof window._gcViewAllowed !== 'function' || !!window._gcViewAllowed('bidportal'));
  const TP = await tiles(p);
  console.log('    PM may open the Bid portal: ' + allowed + '; PM tiles: ' + JSON.stringify(TP));
  ok(TP.some(t => /Bid portal/.test(t)) === allowed, 'PM: the small Bid portal tile follows what the role may open', { allowed, TP });
  const BP = await big(p); console.log('    PM big tiles: ' + JSON.stringify(BP));
  ok(BP[5] === 'Messages' && !BP.some(t => /Clock/.test(t)), 'PM (BIDTILE2): 💬 Messages where ⏱ Clock in was', BP);
  const e1 = p.errs.length;
  await p.ev(() => document.querySelector('#_gcJobPick .gc-pmf-q [data-pmf-a="msgs"]').click()); await sleep(1500);
  const opened2 = await p.ev(() => ({ sheet: !!document.querySelector('.gc-ra-sheet,.gc-fh-sheet,.gc-pmf-sheet,._gcSheetOv'), txt: document.body.innerText.slice(0, 160) }));
  ok(opened2.sheet || !/GrayCo Field/.test(opened2.txt.slice(0, 40)), 'PM: 💬 Messages opens something', opened2);
  ok(p.errs.length === e1, 'PM: no page errors', p.errs.slice(e1));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const x of OPEN) await x.close().catch(() => {});
console.log(`BIDTILE ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
