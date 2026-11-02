// test_JOBACTIVE.mjs <build-dir> <mirror.json> — patch JOBACTIVE on a READ-ONLY mirror of the production data (customer data:
// keep it OUTSIDE git), offline harness. Owner 11/02: the Projects "Active" card read 8 instead of 3; five old QuickBooks
// customer rows (status "Active" from the QuickBooks import, on the board because a payment / document / text points at
// them) had moved into it with r17j (patch JOBORDER compares the status in any case).
// Four jobs are added to the mirror's copy in memory (all kept on the board with keepAsJob):
//   JATEST QB import   source QuickBooks, status "Active"   -> no working group (All only), not under Active
//   JATEST QB set      source quickbooks, status "active"   -> Active (a person chose it in the drop-down)
//   JATEST Maint       source Maintenance, status "Active"  -> Active (the maintenance screen writes "Active")
//   JATEST Typed       no source, status "Active"           -> Active (test_JOBORDER's mixed-case job)
// admin (Projects, All): the Active card counts no QuickBooks-import "Active" row, every such row on the board is in
// group 'other', the three others are 'active'; the Active card's list shows none of the import rows.
// Env: GC_HARNESS (default wN/harness_N.mjs).
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, sleep, cloud, ACCOUNTS, waitFor } = H;
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3];
if (!BUILD || !MIRROR) { console.error('usage: node test_JOBACTIVE.mjs <build-dir> <mirror.json>'); process.exit(2); }
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
const now = Date.now(), iso = h => new Date(now - h * 3600e3).toISOString(), day0 = new Date().toISOString().slice(0, 10);
const JOBS = [
  { id: 'QB_JATEST_IMPORT', name: 'JATEST QB import', client: 'JATEST QB import', source: 'QuickBooks', status: 'Active', keepAsJob: true, created: day0, updatedAt: iso(1) },
  { id: 'QB_JATEST_SET', name: 'JATEST QB set', client: 'JATEST QB set', source: 'quickbooks', status: 'active', keepAsJob: true, created: day0, updatedAt: iso(2) },
  { id: 'MTJATEST', name: 'JATEST Maint', source: 'Maintenance', status: 'Active', keepAsJob: true, created: day0, updatedAt: iso(3) },
  { id: 'PRJJATEST_TYPED', name: 'JATEST Typed', status: 'Active', created: day0, startDate: day0, updatedAt: iso(4) }];
function loadCloud(){ cloud.clear(); for (const r of rows) { let v = r.value !== undefined ? r.value : r.v; if (r.key === 'projects' && Array.isArray(v)) v = v.concat(JOBS); cloud.set(r.key, { key: r.key, value: v, updated_at: r.updated_at }); } }
let pass = 0, fail = 0;
function ok(cond, name, info){ if (cond) { pass++; console.log('PASS ' + name + (info ? '  ' + info : '')); } else { fail++; console.log('FAIL ' + name + (info ? '  ' + info : '')); } }

loadCloud();
const c = await computer('wj', { build: BUILD });
await c.ctx.addInitScript(() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
const p = c.page(); await p.setViewportSize({ width: 1440, height: 900 });
await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 120000 }); await sleep(1500);
const EM = 'wjohnson@grayco-cs.com';
await p.locator('#gc-auth-email').fill(EM); await p.locator('#gc-auth-password').fill(ACCOUNTS[EM].pw); await sleep(300); await p.locator('#gc-auth-submit').click();
await waitFor(c, () => (window._crm && window._crm.projects || []).some(p => p.id === 'PRJJATEST_TYPED') && document.querySelector('aside nav button'), null, 180000, 500);
await sleep(10000);
await c.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a=full]'); if (b && b.offsetParent) b.click(); }); await sleep(800);

/* the classifier on what is on the board */
const cl = await c.ev(() => {
  const L = window._crm.projects || [], g = id => { const x = L.find(p => p.id === id); return x ? window._gcJOCls(x) : 'absent'; };
  const qbImp = L.filter(p => String(p.status || '').trim() === 'Active' && String(p.source || '').toLowerCase() === 'quickbooks');
  return { patched: /qbImportStatus/.test(String(window._gcJOCls)), imp: g('QB_JATEST_IMPORT'), set: g('QB_JATEST_SET'), maint: g('MTJATEST'), typed: g('PRJJATEST_TYPED'),
    qbOnBoard: qbImp.map(p => p.autoPO || p.id), qbGroups: [...new Set(qbImp.map(p => window._gcJOCls(p)))],
    activeExpected: L.filter(p => window._gcJOCls(p) === 'active').length };
});
ok(cl.patched, 'the JOBACTIVE rule is in _gcJOCls');
ok(cl.imp === 'other', 'a QuickBooks-import "Active" row is in no working group', cl.imp);
ok(cl.set === 'active' && cl.maint === 'active' && cl.typed === 'active', 'a person\'s "active", a maintenance "Active", a typed "Active" stay active', JSON.stringify([cl.set, cl.maint, cl.typed]));
ok(cl.qbGroups.every(k => k === 'other'), 'every QuickBooks-import "Active" row on the board is "other"', JSON.stringify(cl.qbOnBoard));

/* the Projects screen: Active card count + its list */
await c.ev(() => { try { localStorage.setItem('gc_proj_subtab', 'active'); } catch (e) {} window._setView('dashboard'); }); await sleep(800);
await c.ev(() => window._setView('projects'));
await waitFor(c, () => [...document.querySelectorAll('#root button')].some(b => /🔨 Active/.test(b.textContent)), null, 30000, 300); await sleep(1500);
await c.ev(() => { const b = [...document.querySelectorAll('#root button')].find(b => /🔨 Active/.test(b.textContent)); if (b) b.click(); }); await sleep(1200);
await c.ev(() => { const b = [...document.querySelectorAll('#root button')].find(b => /^All \(\d+\)$/.test(b.textContent.trim())); if (b) b.click(); }); await sleep(1200);
const scr = await c.ev(() => {
  const b = [...document.querySelectorAll('#root button')].find(b => /🔨 Active/.test(b.textContent)), n = b ? parseInt(b.textContent, 10) : NaN;
  const tb = document.querySelector('#root tbody > tr[data-gc-jo]'); const trs = tb ? [...tb.parentElement.children].filter(r => r.hasAttribute('data-gc-jo')) : [];
  return { n, rows: trs.map(r => ({ k: r.getAttribute('data-gc-jo'), name: ((r.querySelector('b') || {}).textContent || '').trim() })) };
});
ok(scr.n === cl.activeExpected, 'the Active card counts the active-type jobs only', scr.n + ' vs ' + cl.activeExpected);
ok(scr.rows.length && scr.rows.every(r => r.k === 'active') && !scr.rows.some(r => r.name === 'JATEST QB import'), 'the Active list has no QuickBooks-import row', JSON.stringify(scr.rows.slice(0, 12)));
ok(['JATEST QB set', 'JATEST Maint', 'JATEST Typed'].every(nm => scr.rows.some(r => r.name === nm)), 'the Active list has the three active test jobs');
ok(!c.errs.length, 'no page errors', c.errs.slice(0, 3).join(' | '));
await c.b.close();
console.log(`JOBACTIVE ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
