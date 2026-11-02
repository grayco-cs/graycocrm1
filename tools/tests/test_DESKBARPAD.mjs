// test_DESKBARPAD.mjs <build-dir> — patch DESKBARPAD: on a computer, the role app's floating bottom bar (#gc-ra-dock:
// Home · Jobs · Approvals · Photos · More) never covers the bottom of a CRM page. The CRM's pages scroll inside <main>;
// scrolled to the bottom, the last thing on the page must end above the bar. Without the bar (gc_roleapps_off) <main> keeps
// its old padding. Also: the patch is idempotent (a second run says "already patched").
// Offline harness (GC_HARNESS, default the scratchpad's wN/harness_N.mjs), made-up data, 1366x900.
// Usage: node tools/tests/test_DESKBARPAD.mjs <dir with index.html>
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL, fileURLToPath } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_DESKBARPAD.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const sleep = H.sleep;

/* the patch: idempotent on the build's own index.html (a temp copy) */
{
  const here = path.dirname(fileURLToPath(import.meta.url)), patch = path.join(here, '..', 'patch_DESKBARPAD.py');
  const tmp = path.join(process.env.TMPDIR || os.tmpdir(), 'deskbarpad_' + process.pid + '.html');
  fs.copyFileSync(path.join(build, 'index.html'), tmp);
  let out = '';
  try { out = execFileSync('python3', [patch, tmp], { encoding: 'utf8' }); } catch (e) { out = String(e.stdout || e.message); }
  ok(/already patched/.test(out), 'the build is patched; a re-run says "already patched"', out.trim());
  ok(fs.readFileSync(tmp, 'utf8') === fs.readFileSync(path.join(build, 'index.html'), 'utf8'), 'the re-run changes nothing');
  fs.unlinkSync(tmp);
}

const ago = d => new Date(Date.now() - d * 864e5).toISOString();
function seed(){
  H.resetCloud();
  H.cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, phone: '9015550100' },
    { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
  const P = [];
  for (let i = 1; i <= 60; i++) P.push({ id: 'P' + i, po: 'PO-' + (3000 + i), name: 'Demo Job ' + i, client: 'Sample Client ' + i, address: i + ' Demo St, Bartlett TN', pm: 'Sample PM', status: 'Active', contract: 10000 + i, contractSigned: true, pct: 20, updatedAt: ago(i / 10) });
  H.cset('projects', P);
  H.cset('leads', []); H.cset('subs', []); H.cset('invs', []); H.cset('schedule', []); H.cset('punch', []); H.cset('timesheets', []); H.cset('cos', []);
}
async function mocks(c){
  await c.ctx.route(u => /\/storage\/v1\//.test(u.href || u), r => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
  await c.ctx.route(u => /\/\.netlify\/functions\/(bid-inbox|texts|portal-access)/.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
}
/* scroll <main> to the bottom: where does its content end, and where does the bar start? */
const measure = c => c.ev(() => {
  const m = document.querySelector('main'); if (!m) return { main: false };
  m.scrollTop = m.scrollHeight;
  const mr = m.getBoundingClientRect(), pb = parseFloat(getComputedStyle(m).paddingBottom) || 0;
  let low = 0;
  for (const e of m.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.height > 0 && r.width > 0 && getComputedStyle(e).position !== 'fixed' && r.bottom > low) low = r.bottom; }
  const d = document.getElementById('gc-ra-dock'), dr = d && d.getClientRects().length ? d.getBoundingClientRect() : null;
  return { main: true, scrolls: m.scrollHeight > m.clientHeight + 4, pb, contentBottom: Math.round(low), mainBottom: Math.round(mr.bottom), dockTop: dr ? Math.round(dr.top) : null, deskOn: document.documentElement.classList.contains('gc-ra-desk-on') };
});

const views = ['projects', 'leads', 'approvals'];
for (const off of [false, true]) {
  seed();
  const c = await H.computer(off ? 'DESK-OFF' : 'DESK', { build, mobile: false }); await mocks(c);
  await c.page().setViewportSize({ width: 1366, height: 900 });
  if (off) await c.ctx.addInitScript(() => { try { localStorage.setItem('gc_roleapps_off', '1'); } catch (e) {} });
  c.ev = (f, a) => c.page().evaluate(f, a);
  await H.signIn(c, 'wjohnson@grayco-cs.com', 9000);
  if (!off) {
    const up = await H.waitFor(c, () => !!(window._gcRA && window._gcRA.state().app === 'admin' && document.getElementById('gc-ra-dock')), null, 45000);
    ok(!!up, 'owner on a computer: the Desk app and its bottom bar are up');
    await c.ev(() => window._gcRA.hide()); await sleep(600);
    for (const v of views) {
      await c.ev(v => window._setView(v), v); await sleep(1800);
      const r = await measure(c);
      ok(r.main && r.deskOn && r.dockTop !== null, `${v}: the CRM page is under the bar`, r);
      ok(r.pb >= 90, `${v}: <main> has room at the bottom for the bar (${r.pb}px)`, r);
      ok(r.dockTop === null || r.contentBottom <= r.dockTop, `${v}: scrolled to the bottom, the page ends above the bar (content ${r.contentBottom} ≤ bar ${r.dockTop})`, r);
    }
    /* a long page (any screen taller than the window): its last line must scroll clear of the bar */
    const r = await c.ev(() => {
      const m = document.querySelector('main'), host = m.firstElementChild || m;
      const tall = document.createElement('div'); tall.style.height = '2400px'; tall.id = 'dbp-tall';
      const last = document.createElement('div'); last.id = 'dbp-last'; last.textContent = 'the last line of a long page'; last.style.height = '24px';
      host.appendChild(tall); host.appendChild(last); m.scrollTop = m.scrollHeight;
      const lr = last.getBoundingClientRect(), d = document.getElementById('gc-ra-dock').getBoundingClientRect();
      const out = { scrolls: m.scrollHeight > m.clientHeight + 4, lastBottom: Math.round(lr.bottom), dockTop: Math.round(d.top), gap: Math.round(d.top - lr.bottom) };
      tall.remove(); last.remove(); return out;
    });
    ok(r.scrolls && r.lastBottom <= r.dockTop, `a long page: scrolled to the bottom, its last line ends above the bar (${r.lastBottom} ≤ ${r.dockTop})`, r);
    await c.page().screenshot({ path: path.join(process.env.TMPDIR || os.tmpdir(), 'deskbarpad_projects.png') }).catch(() => {});
  } else {
    await sleep(3000); await c.ev(() => window._setView && window._setView('projects')); await sleep(1500);
    const r = await measure(c);
    ok(r.main && !r.deskOn && r.dockTop === null && r.pb < 40, 'gc_roleapps_off: no bar, <main> keeps its old padding', r);
  }
  ok(c.errs.length === 0, `${off ? 'roleapps off' : 'desk'}: no page errors`, c.errs.slice(0, 3));
  await c.b.close().catch(() => {});
}
console.log(`DESKBARPAD ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
