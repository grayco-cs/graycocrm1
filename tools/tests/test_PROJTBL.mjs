// test_PROJTBL.mjs <build-dir> — patch PROJTBL (owner 11/20, desk Projects list): "put the message bubble under and make the
//   project name bigger spot" + "let me be able to make my columns however wide I want for each one".
//   Desk (1440x900) as the owner, made-up jobs: the 💬 is under the PO pill, PO# is narrow, PROJECT is the widest column,
//   a short name is one line and its 🏢 ▾ / 📸 chips share a row; dragging the Client header's edge widens it (no sort),
//   the width is kept through a reload, a double-click puts it back. PO pills never wrap or overflow their cell (owner: "J99/8")
//   at 1440 / 1280 / 1024 with the side menu open or closed, nor when the PO# edge is dragged far left. Phone (390): no handles, no pinned widths. No page errors.
// Usage: node test_PROJTBL.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs; GC_SHOT = a .png path)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_PROJTBL.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
H.resetCloud();
H.cset('users', [{ id: 'U2', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true, payType: 'owner' }, { id: 'U1', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', active: true }]);
const names = ['Kitchen Remodel and Back Porch Addition', 'Roof Replacement', 'Commercial Office Buildout Suite 200', 'Deck Job'], POS = ['J998', 'K795', 'C1024-2', 'T724'];
H.cset('projects', names.map((n, i) => ({ id: 'P' + i, autoPO: POS[i], name: n, client: 'Sample Client ' + i, address: (100 + i) + ' Demo Ln, Lakeland, TN', pm: 'Nick Thomas', type: 'Residential', status: 'active', contract: 10000 + i * 1000, startDate: '2026-0' + (i + 1) + '-05' })));
const W = []; const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
const open = async c => { await H.waitFor(c, () => window._crm && (window._crm.projects || []).length >= 4 && window._gcColW ? 1 : 0, null, 60000);
  await c.ev(() => window._setView('projects')); return H.waitFor(c, () => { const t = document.querySelector('#root table[data-gcx-projects]'); return t && t.querySelector('.__gcListMsgBtn') && t.querySelector('th .gccw-h') ? 1 : 0; }, null, 20000); };
const geo = c => c.ev(() => { const t = document.querySelector('#root table[data-gcx-projects]'), ths = [...t.querySelectorAll('thead th')], r = x => x.getBoundingClientRect();
  const row = [...t.querySelectorAll('tbody tr')].find(tr => /Deck Job/.test(tr.textContent)), po = row.children[0], pill = po.querySelector('span'), bub = po.querySelector('.__gcListMsgBtn');
  const nm = row.children[1].querySelector('b'), co = row.children[1].querySelector('[data-co-jobmenu]'), cam = row.children[1].querySelector('.gcu-rowcam');
  const w = {}; ths.forEach(th => { w[th.textContent.replace(/[▲▼]/g, '').trim().toLowerCase()] = Math.round(th.offsetWidth); });
  return { w, pinned: t.hasAttribute('data-gccw'), pillB: r(pill).bottom, bubT: r(bub).top, bubX: r(bub).left + r(bub).width / 2, pillX: r(pill).left + r(pill).width / 2,
    nameH: Math.round(r(nm).height), coT: co && Math.round(r(co).top), camT: cam && Math.round(r(cam).top), ls: Object.keys(window._gcColW.load()).length, sortHead: (ths.find(th => /▲|▼/.test(th.textContent)) || {}).textContent }; });
const edge = (c, col) => c.ev(col => { const th = [...document.querySelectorAll('#root table[data-gcx-projects] thead th')].find(h => h.textContent.trim().toLowerCase() === col); const b = th.querySelector('.gccw-h').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, col);
try {
  const O = await H.computer('DESK', { build }); W.push(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await open(O)), 'desk: the Projects table is up with 💬 buttons and resize handles');
  await H.sleep(1500);
  let g = await geo(O);
  ok(await O.ev(() => document.querySelectorAll('#root table[data-gcx-projects] .__gcListMsgBtn').length) === 4, 'every row has its 💬, the hyphenated PO C1024-2 too');
  ok(g.bubT >= g.pillB - 1 && Math.abs(g.bubX - g.pillX) < 6, 'the 💬 sits under the PO pill, centred', g);
  ok(g.w['po#'] <= 100 && g.w.project >= 190 && g.w.project === Math.max(...Object.values(g.w)), 'PO# is narrow, PROJECT is the widest column', g.w);
  ok(g.nameH < 24 && Math.abs(g.coT - g.camT) <= 2, 'a short name is one line; its 🏢 ▾ and 📸 chips share a row', g);
  ok(!g.pinned && g.ls === 0, 'no saved widths yet → nothing pinned');
  const pills = c => c.ev(() => [...document.querySelectorAll('#root table[data-gcx-projects] tbody tr > td:first-child')].map(td => { const sp = td.querySelector('span'), a = sp.getBoundingClientRect(), b = td.getBoundingClientRect();
    return { po: sp.textContent, h: Math.round(a.height), out: Math.round(a.right - b.right), th: td.closest('table').querySelector('th').offsetWidth }; }));
  const bad = L => L.filter(x => x.h > 28 || x.out > 0);
  /* no word drawn on two lines (a mid-word break = a word with 2 rects), no cell text cut off at its right edge */
  const broken = c => c.ev(() => { const t = document.querySelector('#root table[data-gcx-projects]'), out = [];
    t.querySelectorAll('th, td').forEach(cell => { if (!cell.getClientRects().length) return;
      if (cell.scrollWidth > cell.clientWidth + 1) out.push('cut: ' + cell.textContent.trim().slice(0, 30));
      const w = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const re = /\S+/g; let m; while ((m = re.exec(n.data))) { const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        const tops = new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))); if (tops.size > 1) out.push('split: ' + m[0]); } } });
    return out; });
  for (const side of ['as is', 'toggled'])
    for (const w of [1440, 1280, 1024]) {
      await O.page().setViewportSize({ width: w, height: 900 }); await H.sleep(1800);
      const L = await pills(O); ok(L.length === 4 && !bad(L).length, `${w} px, side menu ${side}: every PO pill is one line inside its cell`, L);
      const B = await broken(O); ok(!B.length, `${w} px, side menu ${side}: no word broken in two, no cell cut off`, B);
      if (w === 1024 && side === 'as is' && process.env.GC_SHOT1024) await O.page().screenshot({ path: process.env.GC_SHOT1024 });
      if (w === 1024 && side === 'as is') { await O.page().mouse.click(17, 26); await H.sleep(800); }   /* ☰ */
    }
  await O.page().mouse.click(17, 26); await H.sleep(800); await O.page().setViewportSize({ width: 1440, height: 900 }); await H.sleep(1800);
  { const e0 = await edge(O, 'po#'), p0 = O.page(); await p0.mouse.move(e0.x, e0.y); await p0.mouse.down(); await p0.mouse.move(e0.x - 100, e0.y, { steps: 3 }); await p0.mouse.move(e0.x - 200, e0.y, { steps: 3 }); await p0.mouse.up(); await H.sleep(400);
    const L = await pills(O); ok(!bad(L).length && L[0].th >= 80, 'dragging the PO# edge far left stops at the widest pill', L);
    const e1 = await edge(O, 'po#'); await p0.mouse.dblclick(e1.x, e1.y); await H.sleep(400); }
  g = await geo(O);
  const c0 = g.w.client, e = await edge(O, 'client'), p = O.page();
  await p.mouse.move(e.x, e.y); await p.mouse.down(); await p.mouse.move(e.x + 80, e.y, { steps: 4 }); await p.mouse.move(e.x + 150, e.y, { steps: 4 }); await p.mouse.up();
  await H.sleep(400); g = await geo(O);
  ok(Math.abs(g.w.client - (c0 + 150)) <= 3 && g.pinned && g.ls === 1, 'dragging the Client edge 150 px widens it by 150 and saves it', { c0, g, st: await O.ev(() => JSON.stringify(window._gcColW.load())) });
  ok(/Started/.test(g.sortHead || ''), 'the drag did not re-sort the table', g.sortHead);
  const saved = await O.ev(() => JSON.stringify(window._gcColW.load()));
  await p.reload({ waitUntil: 'domcontentloaded' }); ok(!!(await open(O)), 'reloaded: the table is back');
  await H.sleep(2500); g = await geo(O);
  ok(Math.abs(g.w.client - (c0 + 150)) <= 3 && g.pinned, 'after a reload the Client width is kept', { c0, w: g.w, saved });
  if (process.env.GC_SHOT) await p.screenshot({ path: process.env.GC_SHOT });
  const e2 = await edge(O, 'client'); await p.mouse.dblclick(e2.x, e2.y); await H.sleep(400); g = await geo(O);
  ok(g.w.client < c0 + 60 && !g.pinned && g.ls === 0, 'a double-click on the edge resets it (back to the default layout)', { c0, g });   /* the default shares can move a few px once the 33.x sizer runs */
  ok(O.errs.length === 0, 'no page errors (desk)', O.errs);
  const M = await H.computer('PHONE', { build, mobile: true }); W.push(M);
  await H.signIn(M, 'wjohnson@grayco-cs.com', 9000);
  await H.waitFor(M, () => window._crm && (window._crm.projects || []).length >= 4 && window._gcColW ? 1 : 0, null, 60000);
  await M.ev(() => window._setView('projects')); await H.sleep(3000);
  const ph = await M.ev(() => ({ h: document.querySelectorAll('.gccw-h').length, pin: document.querySelectorAll('table[data-gccw]').length }));
  ok(ph.h === 0 && ph.pin === 0, 'phone: no handles, nothing pinned', ph);
  ok(M.errs.length === 0, 'no page errors (phone)', M.errs);
} catch (e) { fail++; console.log('  ✗ FAIL threw ' + (e && e.stack || e)); }
await close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
