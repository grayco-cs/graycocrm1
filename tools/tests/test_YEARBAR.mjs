// test_YEARBAR.mjs <build-dir> — patch YEARBAR (owner 11/20, Projects page: the "Year:" chips said other numbers than the year tabs;
//   the cards did not add up to All). Desk as the owner, made-up jobs (3 active, 2 bidding, 1 completed, 2 QuickBooks-import rows at
//   "Active"), a year filter left over from the old chips: after load (past the old 16 s first paint) there is no chip row, the stored
//   year is cleared and every row shows; the All card says "incl. 2 QuickBooks / other" and the cards add up; a third QuickBooks row
//   arriving → "incl. 3". No page errors.
// Usage: node test_YEARBAR.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_YEARBAR.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
H.resetCloud();
H.cset('users', [{ id: 'U2', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true, payType: 'owner' }, { id: 'U1', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', active: true }]);
const J = (id, status, extra) => Object.assign({ id, autoPO: 'T7' + id.slice(1).padStart(2, '0'), name: 'Demo job ' + id, client: 'Sample ' + id, pm: 'Nick Thomas', status, contract: 1000, created: '2026-03-0' + (id.length) }, extra || {});
H.cset('projects', [J('P1', 'active'), J('P2', 'active'), J('P3', 'approved'), J('P4', 'bidding'), J('P5', 'estimating'), J('P6', 'completed', { jobYear: 2025 }),
  J('Q1', 'Active', { source: 'quickbooks', qbId: 'QB1' }), J('Q2', 'Active', { source: 'quickbooks', qbId: 'QB2', jobYear: 2027 })]);
const W = []; const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
const cards = c => c.ev(() => { const g = [...document.querySelectorAll('main div[style*="grid-template-columns"]')].find(d => d.children.length === 5 && /All/.test(d.children[4].textContent)); if (!g) return null;
  const n = el => +((/^\D*?([\d,]+)/.exec(el.textContent) || [])[1] || '0').replace(/,/g, ''); return { c: [...g.children].map(n), note: (document.getElementById('gc-allnote') || {}).textContent || '' }; });
try {
  const O = await H.computer('DESK', { build, init: "try { localStorage.setItem('gc_job_year_filter', '2025'); } catch (e) {}" }); W.push(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  await H.waitFor(O, () => window._crm && (window._crm.projects || []).length >= 8 ? 1 : 0, null, 60000);
  await O.ev(() => window._setView('projects')); await H.sleep(18000);
  const st = await O.ev(() => ({ bar: !!document.getElementById('_gcYearBar'), f: localStorage.getItem('gc_job_year_filter'), hidden: [...document.querySelectorAll('main table tbody tr')].filter(r => r.style.display === 'none').length,
    tabs: [...document.querySelectorAll('main button')].map(b => b.textContent.trim()).filter(t => /^(All|20\d\d) \(\d+\)$/.test(t)) }));
  ok(!st.bar && !st.f && st.hidden === 0, 'past the old 16 s paint: no Year chip row, the stored year is cleared, no row hidden', st);
  let k = await cards(O);
  ok(k && JSON.stringify(k.c) === '[2,3,1,0,8]' && k.note === 'incl. 2 QuickBooks / other', 'cards 2 / 3 / 1 / 0, All 8 "incl. 2 QuickBooks / other" — they add up', k);
  ok(st.tabs.includes('All (8)'), 'the year tabs count the same 8', st.tabs);
  await O.ev(() => window._setProjects(prev => prev.concat([{ id: 'Q3', autoPO: 'T790', name: 'Demo job Q3', client: 'Sample Q3', status: 'Active', source: 'quickbooks', qbId: 'QB3', contract: 1000, pm: 'Nick Thomas', created: '2026-04-01' }])));
  k = await H.waitFor(O, () => { const n = document.getElementById('gc-allnote'); return n && n.textContent === 'incl. 3 QuickBooks / other' ? n.textContent : null; }, null, 10000);
  ok(!!k, 'a third QuickBooks row arrives → "incl. 3 QuickBooks / other"', await cards(O));
  ok(O.errs.length === 0, 'no page errors', O.errs);
} catch (e) { fail++; console.log('  ✗ FAIL threw ' + (e && e.stack || e)); }
await close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
