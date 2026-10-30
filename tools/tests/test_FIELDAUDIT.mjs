// test_FIELDAUDIT.mjs <build-dir> — the field-view audit (10/30) regression: GrayCo Field on a phone (390x844, touch)
// works with the office's CRM. Offline harness, made-up data, a fake cloud + storage. Covers patches FIELDFIX1-9:
//   1  a punch item made on the phone shows on the office's open Punch List without a reload
//   2-5 field work done on a weak signal, with the page reloaded before the signal is back, reaches the cloud
//   6  a field daily log (Site Book) reaches the office computer's Site Book copy (what FIELDFIX6's inactivity check reads)
//   7  the crew's automatic clock-in is kept (own key) and lands in the office's Timesheets
//   8  "Back to GrayCo Field" is tappable over the Google bar; the field home's tap targets are 30 px+
//   9  the Site Book job name is readable in field mode; the daily log's Manpower hours box is on screen
// Usage: node test_FIELDAUDIT.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDAUDIT.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
const sleep = H.sleep;
const D0 = new Date(); const today = D0.getFullYear() + '-' + String(D0.getMonth() + 1).padStart(2, '0') + '-' + String(D0.getDate()).padStart(2, '0');
H.ACCOUNTS['crew@grayco-cs.com'] = { pw: 'Correct-Horse-5', id: 'u-c', role: 'staff' };
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u4', name: 'Carl Crew', email: 'crew@grayco-cs.com', role: 'Superintendent', payType: 'hourly', active: true }]);
H.cset('projects', [
  { id: 'P1', po: 'PO-1001', name: 'Demo Kitchen Remodel', client: 'Sample Homeowner', address: '100 Demo St, Bartlett TN', pm: 'Sample PM', superintendent: 'Carl Crew', status: 'Active', contract: 25000, contractSigned: true, pct: 40, updatedAt: '2026-10-01T00:00:00.000Z' },
  { id: 'P2', po: 'PO-1002', name: 'Demo Roof Replace', client: 'Second Homeowner', address: '200 Demo Ave, Cordova TN', pm: 'Sample PM', superintendent: 'Carl Crew', status: 'Active', contract: 14000, contractSigned: true, pct: 10, updatedAt: '2026-10-01T00:00:00.000Z' }]);
H.cset('schedule', [{ id: 'S1', pid: 'P1', projectId: 'P1', date: today, title: 'Cabinet install', start: today, end: today, assignee: 'Carl Crew' }]);
H.cset('punch', []); H.cset('timesheets', []);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const store = new Map();
async function storageMock(c){
  await c.ctx.route(u => /\/storage\/v1\//.test(u.href || u), async r => {
    const u = new URL(r.request().url()); const m = r.request().method(); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (c.down) return r.abort('internetdisconnected');
    if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: h });
    const path = u.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/|public\/|sign\/)?/, '');
    if (m === 'POST' || m === 'PUT') { store.set(path, r.request().postDataBuffer() || Buffer.alloc(0)); return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify({ Key: path }) }); }
    const b = store.get(path); return b ? r.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'image/jpeg' }, h), body: b }) : r.fulfill({ status: 404, headers: h, body: '{}' });
  });
}
const fh = c => H.waitFor(c, () => { const j = document.querySelector('#_gcJobPick.gc-fh'); return !!j && getComputedStyle(j).display !== 'none'; }, null, 40000);
async function home(c){ await c.page().evaluate(() => { try { window._gcPhotos && window._gcPhotos.close && window._gcPhotos.close(); } catch (e) {} document.querySelectorAll('.gc-fh-sheet,#_gcLogExpOv,#_gcJobMsgOv').forEach(o => o.remove()); try { window._gcField.open(); } catch (e) {} }); await sleep(800); }
async function tool(c, label, job = 0){ await home(c); await c.page().locator('#_gcJobPick .fh-job').nth(job).locator('.fh-b').filter({ hasText: label }).first().click({ timeout: 8000 }); await sleep(1000); }
async function go(c){ await c.page().locator('.gc-fh-sheet [data-go]').last().click({ timeout: 8000 }); await sleep(1500); }
const has = (key, tag) => String(JSON.stringify(H.cget(key))).includes(tag);
async function until(fn, ms){ const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return Date.now() - t0; await sleep(500); } return -1; }
const W = []; const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
try {
  // ── 7: the crew's clock-in ──
  const C = await H.computer('CREW', { build, mobile: true }); W.push(C);
  await H.signIn(C, 'crew@grayco-cs.com', 9000); await fh(C);
  const own = () => { for (const [k, r] of H.cloud) if (/^gc_timeclock_/.test(k) && Array.isArray(r.value) && r.value.length) return r.value; return null; };
  ok(await until(() => own(), 40000) >= 0, '7: the crew clock-in reached the cloud (own key)', own());
  await C.b.close(); W.length = 0;
  // ── the office (desk) and the PM's phone ──
  const O = await H.computer('OFF', { build }); W.push(O); await storageMock(O);
  const P = await H.computer('PH', { build, mobile: true }); W.push(P); await storageMock(P);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 4000);
  await H.signIn(P, 'sbiffle@grayco-cs.com', 9000);
  ok(!!(await fh(P)), 'the phone opens in GrayCo Field');
  await H.waitFor(O, () => (window._crm && window._crm.projects || []).length >= 2, null, 60000); await sleep(4000);
  ok(await until(() => (H.cget('timesheets') || []).some(x => x && /Carl/.test(x.user || '') && x.date === today), 40000) >= 0, '7: the office computer added the crew clock-in to Timesheets (local date)', H.cget('timesheets'));
  // ── 8: layout ──
  const lay = await P.page().evaluate(() => { const out = { sideways: document.documentElement.scrollWidth > innerWidth + 2, small: [] }; document.querySelectorAll('#_gcJobPick button, #_gcJobPick a[href]').forEach(b => { const r = b.getBoundingClientRect(); if (!r.width || r.top > innerHeight * 3) return; if (r.width < 30 || r.height < 30) out.small.push(b.textContent.trim().slice(0, 30) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }); return out; });
  ok(!lay.sideways && !lay.small.length, '8: field home — no sideways scroll, every tap target 30 px+', lay);
  // ── 1: punch → office Punch List, no reload ──
  await tool(P, 'Punch'); await P.page().fill('#gc-fh-pi', 'Touch up paint FA1'); await go(P);
  ok(await until(() => has('punch', 'Touch up paint FA1'), 20000) >= 0, '1: the punch item reached the cloud');
  await sleep(8000);
  await O.page().evaluate(() => { const els = [...document.querySelectorAll('a,button,div,span,li')].filter(e => /Punch List$/.test((e.textContent || '').trim()) && e.textContent.trim().length < 16 && e.getBoundingClientRect().width); els.sort((a, b) => a.textContent.length - b.textContent.length); if (els[0]) (els[0].closest('button,a') || els[0]).click(); });
  ok(!!(await H.waitFor(O, () => document.body.innerText.includes('Touch up paint FA1'), null, 15000, 500)), '1: the office\'s Punch List shows it without a reload');
  // ── 6 + 9: a daily log on P2 (no schedule: "No activity in 7+ days" until the log) ──
  await home(P); await P.page().evaluate(() => window._gcRP.site().open('P2', 'log')); await sleep(1500);
  const sb = await P.page().evaluate(() => { const h = document.querySelector('#gc-rp-sb .sb-hd h2'); const c = h ? getComputedStyle(h).color : ''; return { color: c }; });
  ok(/rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)/.test(sb.color), '9: the Site Book job name is light on the dark field page', sb);
  const st = P.page().locator('button', { hasText: 'Start the daily log' }); if (await st.count()) { await st.first().click(); await sleep(1500); }
  const hrs = await P.page().evaluate(() => { const i = document.querySelector('form[data-sb-form=log] input[name=mp_hours_0], form[data-sb-form=log] input[name=mp_hours_new]'); if (!i) return null; const r = i.getBoundingClientRect(); return { right: Math.round(r.right), w: innerWidth }; });
  ok(hrs && hrs.right <= hrs.w, '9: the Manpower hours box is on screen', hrs);
  await P.page().fill('form[data-sb-form=log] textarea[name=work]', 'Tear-off done FA6'); await P.page().locator('form[data-sb-form=log] button', { hasText: /^Save$/ }).first().click(); await sleep(1500);
  ok(await until(() => has('gc_sitebook', 'Tear-off done FA6'), 20000) >= 0, '6: the daily log reached the cloud');
  ok(!!(await H.waitFor(O, () => String(localStorage.getItem('gcRP_sitebook_v1') || '').includes('Tear-off done FA6'), null, 30000, 500)), '6: the office computer has the field daily log (its Site Book)');
  ok(await O.page().evaluate(() => { try { const m = JSON.parse(localStorage.getItem('gcRP_sitebook_v1') || '{}'); return Object.keys(m).some(k => (m[k].logs || []).some(l => l && !l.deleted && /Tear-off done FA6/.test(l.work || ''))); } catch (e) { return false; } }), '6: the log the inactivity check reads (Site Book copy) is there by job and date');
  // ── a photo, progress, a message (online sanity) ──
  await home(P); await P.page().evaluate(() => window._gcPhotos.open('P1', { camera: true })); await sleep(1500);
  if (!(await P.page().locator('#gcu-capf').count())) await P.page().locator('#gcuOv [data-a=camera]').first().click();
  await sleep(1000); await P.page().locator('#gcu-capf').setInputFiles({ name: 'fa.png', mimeType: 'image/png', buffer: PNG });
  ok(await until(() => (H.cget('gc_photos') || []).some(x => x && x.jobId === 'P1'), 30000) >= 0, 'a photo reached the cloud');
  // ── 2-5: weak signal, then the page is reloaded before the signal is back ──
  await home(P); P.down = true; await sleep(500);
  await tool(P, 'Punch'); await P.page().fill('#gc-fh-pi', 'Re-caulk tub FB1'); await go(P);
  await tool(P, 'Progress'); await P.page().locator('._fpQuick[data-v="75"]').first().click(); await sleep(300); await P.page().locator('#_fpSave').click(); await sleep(1500);
  await home(P); await P.page().evaluate(() => window._gcOpenJobMessages('P1')); await sleep(1200); await P.page().fill('#_jmText', 'No signal here FB2'); await P.page().click('#_jmSend'); await sleep(1200); await P.page().click('#_jmX').catch(() => {});
  await tool(P, 'Problem'); await P.page().fill('#gc-fh-pn', 'Rain delay FB3'); await go(P);
  ok(!has('punch', 'FB1') && !has('gc_job_messages', 'FB2'), '2-5: nothing reached the cloud with no signal (the test is real)');
  await sleep(3000); await P.page().reload().catch(() => {}); await sleep(15000);
  P.down = false;
  const t0 = Date.now();
  const res = { punch: -1, progress: -1, message: -1, log: -1 };
  while (Date.now() - t0 < 240000 && Object.values(res).some(v => v < 0)) {
    if (res.punch < 0 && has('punch', 'FB1')) res.punch = Date.now() - t0;
    if (res.progress < 0 && (H.cget('projects') || []).some(x => x.id === 'P1' && +x.pct === 75)) res.progress = Date.now() - t0;
    if (res.message < 0 && has('gc_job_messages', 'FB2')) res.message = Date.now() - t0;
    if (res.log < 0 && has('gc_sitebook', 'FB3')) res.log = Date.now() - t0;
    await sleep(1000);
  }
  for (const k of Object.keys(res)) ok(res[k] >= 0, '2-5: weak signal + reload: the ' + k + ' reached the cloud after the signal came back' + (res[k] >= 0 ? ' (' + Math.round(res[k] / 1000) + ' s)' : ''));
  // ── 8: Desk view on the phone and back, over the Google bar ──
  await fh(P); await sleep(1500); const p = P.page();
  await p.locator('#gc-fh-tabs button', { hasText: 'More' }).click(); await sleep(800);
  await p.locator('.gc-fh-sheet button', { hasText: 'Settings' }).click(); await sleep(800);
  await p.locator('.gc-fh-sheet button', { hasText: 'Use desk view' }).click(); await sleep(2500);
  const top = await p.evaluate(() => { const b = document.getElementById('gc-fh-backfield'); if (!b) return { none: true, bar: !!document.getElementById('_gConnBar') }; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { onTop: e === b || b.contains(e), bar: !!document.getElementById('_gConnBar'), h: Math.round(r.height) }; });
  ok(top.onTop && top.h >= 30, '8: "Back to GrayCo Field" is on top and tappable' + (top.bar ? ' (with the Google bar showing)' : ''), top);
  await p.locator('#gc-fh-backfield').click({ timeout: 5000 }).catch(() => {}); await sleep(2500);
  ok(!!(await fh(P)), '8: back in GrayCo Field');
  const errs = O.errs.concat(P.errs); ok(!errs.length, 'no page errors', errs.slice(0, 5));
} catch (e) { ok(false, 'the test ran to the end', String(e && e.message || e).slice(0, 300)); }
await close();
console.log('RESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
