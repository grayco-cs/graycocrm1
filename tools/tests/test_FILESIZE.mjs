// test_FILESIZE.mjs <build-dir> — patch FILESIZE: a job file saved without a size shows no "NaNKB"; a file with a size
// still shows it. Offline harness, made-up data, desk, admin.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, resetCloud, cset, signIn } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_FILESIZE.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 300) : '')); } };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
resetCloud();
cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [{ id: 'P5', po: 'PO-1005', name: 'Demo Church Roof', client: 'Demo Church', address: '5 Steeple Rd, Collierville TN', pm: 'Demo Owner', status: 'Active', type: 'Roofing',
  files: [{ id: 'F1', name: 'Roof plan sheet A1.png', cat: 'Plans/Drawings', type: 'image/png', data: PNG }, { id: 'F2', name: 'Site photo.png', cat: 'Photos', type: 'image/png', data: PNG, size: 20480, date: '2026-10-20' }] }]);
const c = await computer('FS', { build });
try {
  await signIn(c, 'wjohnson@grayco-cs.com', 15000);
  const p = c.page(); await p.setViewportSize({ width: 1366, height: 860 }); await sleep(3000);
  await p.evaluate(() => window._setView('projects')); await sleep(1500);
  await p.evaluate(() => { const j = window._crm.projects.find(x => x && x.id === 'P5'); window._openJobDetail(j); }); await sleep(2500);
  await p.evaluate(() => { const b = [...document.querySelectorAll('main button')].find(x => /^Files & Docs/.test(x.textContent.trim())); b && b.click(); }); await sleep(2500);
  const t = await p.evaluate(() => document.querySelector('main').innerText);
  ok(/Roof plan sheet A1\.png/.test(t) && /Site photo\.png/.test(t), 'both files are listed on Files & Docs');
  ok(!/NaN/.test(t), 'no "NaNKB" for the file without a size');
  ok(/20KB/.test(t), 'the file with a size shows it (20KB)');
  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await c.b.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
