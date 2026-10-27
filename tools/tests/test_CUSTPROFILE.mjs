// test_CUSTPROFILE.mjs <build-dir> — patch CUSTPROFILE: GrayCo Field job cards on a phone (390 px).
// 👤 Customer profile replaces 📞 Call and opens the customer's profile (with a way to call); no Start day / End day
// (clock in / out) tile — not by default, not from a saved role layout, not offered in the role editor.
// One headless browser, the offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs), made-up demo data.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, cset, signIn } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_CUSTPROFILE.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };

resetCloud();
const today = new Date().toISOString().slice(0, 10);
cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true, phone: '901-555-0101' }]);
cset('customers', [{ id: 'CUdemo1', name: 'Sample Homeowner', phone: '901-555-0111', email: 'home@example.com', address: '100 Demo St, Bartlett TN' }]);
cset('projects', [
  { id: 'P1', po: 'PO-1001', name: 'Demo Kitchen Remodel', client: 'Sample Homeowner', customerId: 'CUdemo1', clientPhone: '901-555-0111', address: '100 Demo St, Bartlett TN', pm: 'Sample PM', status: 'Active', type: 'Residential Reno', contract: 25000, startDate: today, pct: 40 },
  { id: 'P2', po: 'PO-1002', name: 'Demo Roof Replacement', client: 'Test Family', clientPhone: '901-555-0112', address: '22 Sample Ave, Cordova TN', pm: 'Sample PM', status: 'Active', type: 'Roofing', contract: 14800, startDate: today, pct: 15 }]);
cset('schedule', [{ id: 'S1', pid: 'P1', projectId: 'P1', date: today, title: 'Cabinet install', start: today, end: today },
  { id: 'S2', pid: 'P2', projectId: 'P2', date: today, title: 'Tear-off', start: today, end: today }]);

const c = await computer('CP', { build, mobile: true }); const p = c.page();
try {
  await signIn(c, 'sbiffle@grayco-cs.com', 9000);
  ok(!!(await waitFor(c, () => document.querySelectorAll('#_gcJobPick.gc-fh').length && window._gcField, null, 40000)), 'the phone opens in GrayCo Field');
  await sleep(1500);
  const home = await c.ev(() => { const h = document.querySelector('#_gcJobPick.gc-fh'); const bs = [...h.querySelectorAll('button,a')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
    return { prof: bs.filter(t => /Customer profile/.test(t)).length, call: bs.filter(t => /^📞\s*Call$/.test(t)).length, day: bs.filter(t => /Start day|End day|Day ended/.test(t)).length, clock: /clock[ -]?(in|out)/i.test(h.innerText), tools: window._gcField.roleTools('pm') }; });
  ok(home.prof === 2, 'each job card has a 👤 Customer profile tile', home);
  ok(home.call === 0, 'no 📞 Call tile on the job cards', home);
  ok(home.day === 0 && !home.clock, 'no Start day / End day (clock in / out) tile in the field view', home);
  ok(home.tools.indexOf('day') < 0 && home.tools[2] === 'call', "the role's tools: Navigate, Job info, Customer profile, … without 'day'", home.tools);

  /* a role layout saved before (it lists 'day') still does not show it; the role editor does not offer it */
  const saved = await c.ev(() => { localStorage.setItem('gc_field_settings', JSON.stringify({ roles: { pm: { tools: ['nav', 'info', 'call', 'day', 'photos'], off: [] } } }));
    const ids = window._gcField.roleTools('pm'); const box = document.createElement('div'); window._gcField.roleEditor(box, 'pm'); const txt = box.innerText;
    localStorage.removeItem('gc_field_settings'); return { ids, editor: /Start \/ End day/.test(txt), hasProf: /Customer profile/.test(txt) }; });
  ok(saved.ids.indexOf('day') < 0 && saved.ids.indexOf('call') >= 0, "a saved role layout with 'day' → still not shown", saved);
  ok(!saved.editor && saved.hasProf, 'Apps by role: no "Start / End day", has "Customer profile"', saved);

  /* tap: the customer with a record → their profile (with call) */
  const tap = async n => { await c.ev(i => { const b = [...document.querySelectorAll('#_gcJobPick.gc-fh button, #_gcJobPick.gc-fh a')].filter(x => /Customer profile/.test(x.textContent))[i]; b.click(); }, n); };
  const t0 = Date.now(); await tap(0);
  const ov1 = await waitFor(c, () => { const o = [...document.querySelectorAll('._gcSheetOv')].pop(); return o && o.innerText ? { txt: o.innerText.slice(0, 400), tel: [...o.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute('href')) } : null; }, null, 5000, 50);
  ok(ov1 && /Sample Homeowner/.test(ov1.txt), 'Customer profile opens the customer\'s profile (' + (Date.now() - t0) + ' ms)', ov1);
  ok(ov1 && ov1.tel.some(h => /9015550111/.test(h.replace(/\D/g, ''))), 'the phone is reachable from the profile (📞 tel: link)', ov1 && ov1.tel);
  await c.ev(() => document.querySelectorAll('._gcSheetOv').forEach(o => o.remove())); await sleep(300);

  /* a customer with no record: the profile by name + the job's phone on top */
  await tap(1);
  const ov2 = await waitFor(c, () => { const o = [...document.querySelectorAll('._gcSheetOv')].pop(); return o && o.innerText ? { txt: o.innerText.slice(0, 400), tel: [...o.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute('href')) } : null; }, null, 5000, 50);
  ok(ov2 && /Test Family/.test(ov2.txt), 'a customer without a record: the profile opens by name', ov2);
  ok(ov2 && ov2.tel.some(h => /9015550112/.test(h.replace(/\D/g, ''))), "…and the job's phone is one tap away", ov2 && ov2.tel);
  await c.ev(() => document.querySelectorAll('._gcSheetOv').forEach(o => o.remove()));
  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await c.b.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
