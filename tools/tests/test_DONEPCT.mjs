// test_DONEPCT.mjs <build-dir> — patch DONEPCT (owner 11/20, desk Projects table): "if jobs are completed they should be 100"
//   + "i dont want this share job button … on this main screen" (the 🏢 ▾ on each row; keep the choice in New / Edit Project).
//   Desk (1440x900) as the owner, made-up jobs: a Completed row (no pct saved) shows 100 % and a full green bar; a Bidding row at
//   40 % stays 40; changing an Active row's STATUS to Completed saves pct 100 (screen and cloud); no 🏢 ▾ on the rows; the job
//   page's ✏️ Edit Project has "Shared with" next to Company, and ticking Environmental + Save saves sharedWith. No page errors.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_DONEPCT.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
H.resetCloud();
H.cset('users', [{ id: 'U2', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true, payType: 'owner' }]);
const J = (id, po, name, status, pct) => ({ id, autoPO: po, name, client: 'Sample Client', address: '1 Demo Ln, Lakeland, TN', type: 'Residential', status, contract: 10000, startDate: '2026-03-05', ...(pct != null ? { pct } : {}) });
H.cset('projects', [J('P0', 'J901', 'Done Deck', 'completed'), J('P1', 'J902', 'Bid Roof', 'bidding', 40), J('P2', 'J903', 'Active Porch', 'active', 30)]);
let c;
try {
  c = await H.computer('DESK', { build });
  await H.signIn(c, 'wjohnson@grayco-cs.com', 9000);
  await H.waitFor(c, () => window._crm && (window._crm.projects || []).length >= 3 && window._gcDonePct ? 1 : 0, null, 60000);
  await c.ev(() => window._setView('projects'));
  await H.waitFor(c, () => document.querySelectorAll('#root table[data-gcx-projects] input[type=number]').length >= 2 ? 1 : 0, null, 20000);
  await c.ev(() => { document.querySelectorAll('#root table[data-gcx-projects] tr[data-gc-jo-head]').forEach(h => { if (/▸/.test(h.textContent)) h.click(); }); });
  await H.sleep(1500);
  const cell = name => c.ev(name => { const tr = [...document.querySelectorAll('#root table[data-gcx-projects] tbody tr')].find(r => r.children[1] && r.children[1].textContent.includes(name)); if (!tr) return null;
    const inp = tr.querySelector('input[type=number]'), bar = inp && inp.parentElement.querySelector('div > div > div'), co = tr.querySelector('[data-co-jobmenu]');
    return { v: inp && inp.value, w: bar && bar.style.width, bg: bar && getComputedStyle(bar).backgroundColor, sel: (tr.querySelector('select') || {}).value, co: !!co, coVis: !!(co && co.getClientRects().length) }; }, name);
  let d = await cell('Done Deck'), b = await cell('Bid Roof');
  ok(d && d.v === '100' && d.w === '100%', 'a Completed job with no % saved shows 100 % and a full bar', d);
  ok(d && /rgb\(22, 163, 74\)|rgb\(21, 128, 61\)|rgb\(34, 197, 94\)/.test(d.bg), 'its bar is green', d && d.bg);
  ok(b && b.v === '40' && b.w === '40%', 'a Bidding job at 40 % stays 40 %', b);
  ok(d && b && !d.coVis && !b.coVis, 'no 🏢 ▾ on the Projects rows', { d, b });
  /* STATUS → completed on the Active row */
  await c.ev(() => { const tr = [...document.querySelectorAll('#root table[data-gcx-projects] tbody tr')].find(r => r.children[1] && r.children[1].textContent.includes('Active Porch'));
    const sel = tr.querySelector('select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, 'completed'); sel.dispatchEvent(new Event('change', { bubbles: true })); });
  const p2 = await H.waitFor(c, () => { const p = window._crm.projects.find(x => x.id === 'P2'); return p && p.status === 'completed' && p.pct === 100 ? 1 : 0; }, null, 10000).catch(() => 0);
  ok(!!p2, 'STATUS → Completed saves pct 100 on the job', await c.ev(() => { const p = window._crm.projects.find(x => x.id === 'P2'); return p && { st: p.status, pct: p.pct }; }));
  await H.sleep(4000);
  let cl = null; for (let k = 0; k < 30 && !(cl && cl.status === 'completed' && cl.pct === 100); k++) { await H.sleep(500); cl = (H.cget('projects') || []).find(x => x && x.id === 'P2'); }
  if (!(cl && cl.pct === 100)) console.log('    writes:', JSON.stringify(H.writes.slice(-8)));
  ok(cl && cl.status === 'completed' && cl.pct === 100, 'the cloud got it Completed at 100 %', cl && { st: cl.status, pct: cl.pct });
  await c.ev(() => window._setView('projects')); await H.sleep(1200);
  await c.ev(() => { document.querySelectorAll('#root table[data-gcx-projects] tr[data-gc-jo-head]').forEach(h => { if (/▸/.test(h.textContent)) h.click(); }); }); await H.sleep(800);
  const a = await cell('Active Porch');
  ok(a && a.v === '100' && a.w === '100%', 'the row now shows 100 % and a full bar', a);
  /* patch-path writes of a done status carry 100 */
  const pp = await c.ev(async () => { await window._gcxPatchJob('P1', { status: 'closed' }, 'test'); await new Promise(r => setTimeout(r, 600)); const p = window._crm.projects.find(x => x.id === 'P1'); return p && { st: p.status, pct: p.pct }; });
  ok(pp && pp.st === 'closed' && pp.pct === 100, 'a _gcxPatchJob write of a closed status saves pct 100', pp);
  /* New Project form has it too */
    await c.ev(() => { const bt = [...document.querySelectorAll('#root button')].find(x => /New Project/.test(x.textContent)); bt && bt.click(); }); await H.sleep(1500);
  ok(await c.ev(() => document.querySelectorAll('#root input[data-co-sharefield]').length >= 1), 'New Project has "Shared with" too');
  /* Edit Project: Shared with */
  await c.ev(() => { const j = window._crm.projects.find(x => x && x.id === 'P1'); window._openJobDetail(j); }); await H.sleep(2000);
  await c.ev(() => { const bt = [...document.querySelectorAll('main button')].find(x => /Edit Project/.test(x.textContent)); bt && bt.click(); }); await H.sleep(900);
  const f = await c.ev(() => { const L = [...document.querySelectorAll('main input[data-co-sharefield]')]; return L.map(x => x.getAttribute('data-co-sharefield')); });
  ok(f.length >= 1 && f.includes('environmental') && !f.includes('construction'), 'Edit Project has "Shared with" (the other companies) next to Company', f);
  await c.ev(() => { const x = document.querySelector('main input[data-co-sharefield="environmental"]'); x && x.click(); }); await H.sleep(300);
  ok(await c.ev(() => !!(document.querySelector('main input[data-co-sharefield="environmental"]') || {}).checked), 'ticking Environmental checks it');
  await c.ev(() => { const bt = [...document.querySelectorAll('main button')].find(x => x.textContent.trim() === 'Save'); bt && bt.click(); });
  const sw = await H.waitFor(c, () => { const p = window._crm.projects.find(x => x.id === 'P1'); return p && Array.isArray(p.sharedWith) && p.sharedWith.includes('environmental') ? 1 : 0; }, null, 8000).catch(() => 0);
  ok(!!sw, 'Save keeps sharedWith: [environmental] on the job');
  const errs = c.errs || []; ok(!errs.length, 'no page errors', errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw ' + (e && e.stack || e)); }
finally { try { await c.b.close(); } catch (e) {} }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
