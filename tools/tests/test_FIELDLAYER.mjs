// test_FIELDLAYER.mjs <build-dir> — patch FIELDLAYER: on a phone (390 px, GrayCo Field), the job card's 🔁 Change order
// and 🎤 Voice note tiles open their window ON TOP of the field home (it was hidden behind it). Offline harness, made-up data.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, cset, signIn } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDLAYER.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
resetCloud();
const today = new Date().toISOString().slice(0, 10);
cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true, phone: '901-555-0101' }]);
cset('projects', [{ id: 'P1', po: 'PO-1001', name: 'Demo Kitchen Remodel', client: 'Sample Homeowner', clientPhone: '901-555-0111', address: '100 Demo St, Bartlett TN', pm: 'Sample PM', status: 'Active', type: 'Residential Reno', contract: 25000, contractSigned: true, startDate: today, pct: 40 }]);
cset('schedule', [{ id: 'S1', pid: 'P1', projectId: 'P1', date: today, title: 'Cabinet install', start: today, end: today }]);
const c = await computer('FL', { build, mobile: true }); const p = c.page();
const onTop = sel => p.evaluate(s => { const o = document.querySelector(s); if (!o || getComputedStyle(o).display === 'none') return { open: false }; const b = o.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + Math.min(160, b.height / 2); const top = document.elementFromPoint(x, y); return { open: true, onTop: !!(top && top.closest(s)), z: getComputedStyle(o).zIndex, under: top && (top.closest('[id]') || {}).id }; }, sel);
const tap = async lab => { await p.locator('#_gcJobPick.gc-fh button, #_gcJobPick.gc-fh a').filter({ hasText: lab }).first().click(); await sleep(1200); };
try {
  await signIn(c, 'sbiffle@grayco-cs.com', 9000);
  ok(!!(await waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 40000)), 'the phone opens in GrayCo Field');
  await sleep(1500);
  await tap('Change order');
  const co = await onTop('#gc-addco-overlay');
  ok(co.open && co.onTop, '🔁 Change order: the change-order form is on top of the field home', co);
  await p.evaluate(() => { const o = document.getElementById('gc-addco-overlay'); if (o) o.style.display = 'none'; });
  await tap('Voice note');
  const vo = await onTop('#_gcMicOv');
  ok(vo.open && vo.onTop, '🎤 Voice note: the voice-note sheet opens on top', vo);
  ok(await p.evaluate(() => (document.getElementById('_gcMicJob') || {}).value === 'P1'), "…already on this card's job");
  ok(await p.evaluate(() => { const v = document.getElementById('_voiceOverlay'); return !v || getComputedStyle(v).display === 'none'; }), 'the old voice-commands overlay is not opened behind the field home');
  await p.evaluate(() => { try { window._gcAUTAI.closeMic(); } catch (e) {} });
  /* desk view: the change-order form keeps its old layer */
  const desk = await p.evaluate(() => { document.documentElement.classList.remove('_fieldmode'); const o = document.getElementById('gc-addco-overlay'); return o ? getComputedStyle(o).zIndex : null; });
  ok(desk === '9800', 'outside the field view the change-order form keeps its usual layer', desk);
  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await c.b.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
