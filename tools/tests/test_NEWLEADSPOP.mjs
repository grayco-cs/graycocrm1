// test_NEWLEADSPOP.mjs <build-dir> — patch NEWLEADSPOP (the desk "lags a lot": the 📥 New leads card flickered over the Leads
// list) and patch LEADFIT / DESKFIT (the Leads, Projects and Invoices lists were wider than the desk window).
// On the company's REAL data (the read-only snapshot tools/qa/snapshot.mjs takes; read at run time, never committed), offline
// harness, a 1440×900 desk:
//   • the estimator (role, from the users list) on Leads: "🔔 N new for you" is a chip in the list's header row — no card inside
//     the list, nothing opens by itself; while the list redraws (teammates' edits arriving) the chip never disappears;
//   • the chip opens a short list (≤ 8 rows, "Open Leads" for the rest, "✓ Mark all N seen"); Esc closes it;
//   • ✓ Got it marks one; ✕ marks the batch — with localStorage full the save still lands (IndexedDB + the cloud row) and a
//     reload keeps it closed; a newly assigned lead brings the chip back (1);
//   • the admin on Leads: no card inside the list either, no flicker;
//   • no sideways scrolling: the page and the Leads list fit at 1366 and 1920 (and 1180: Source moves onto the Lead line);
//     Projects and Invoices fit their box at 1366; the estimator's Dashboard "My estimating" table too, with short rows.
// Env: GC_HARNESS (default the session's harness_N.mjs), QA_SNAP (default the newest snapshot under the scratchpad's qa/snap).
import path from 'path'; import { pathToFileURL } from 'url';
const SCR = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2]; if (!build) { console.error('usage: node test_NEWLEADSPOP.mjs <build-dir>'); process.exit(2); }
const L = await import(pathToFileURL(path.join(build, 'tools/qa/qa_lib.mjs')).href);
const H = await import(pathToFileURL(HARNESS).href);
const snapDir = process.env.QA_SNAP || L.latestSnap(SCR + '/qa/snap'); if (!snapDir) { console.error('no snapshot (node tools/qa/snapshot.mjs ' + SCR + '/qa/snap)'); process.exit(2); }
const snap = L.readSnap(snapDir);
let pass = 0, fail = 0; const ok = (m, c, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const sleep = H.sleep;

L.loadIntoHarness(H, snap); const acc = L.accountsFromSnap(H, snap);
const est = acc.users.find(u => /estimator/i.test(u.role || '')), adm = acc.map.admin;
if (!est || !adm) { console.error('the users list has no estimator / admin'); process.exit(2); }

async function open(who){
  const A = await H.computer('desk', { build, mobile: false, viewport: { width: 1440, height: 900 } });
  const errs = []; A.page().on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200)));
  ok(who.role + ': signed in', await H.signIn(A, who.email, 120000));
  await H.waitFor(A, () => (window._crm && window._crm.leads || []).length > 50, null, 120000);
  await sleep(6000);
  for (let i = 0; i < 3; i++) {   /* the Leads page, its header drawn and the 🔔 chip in it when there is a batch */
    await A.ev(() => window._setView('leads'));
    if (await H.waitFor(A, () => !!document.querySelector('#gc-leads-hub #gc-leads-chips') && (!window._gcNewLead.mine().length || !!document.querySelector('#gc-leads-chips #gc-nl-chip')), null, 20000)) break;
  }
  await sleep(2000);
  return { A, errs };
}
/* watch the chip / card for `ms` while teammates' edits arrive every 3 s (each one redraws the list) */
async function watch(A, ms){
  await A.ev(() => {
    const Q = window.__nlw = { gone: 0, card: 0, draws: 0, t0: performance.now(), last: null };
    new MutationObserver(ms => { for (const m of ms) if (m.target && m.target.id === 'gc-leads-hub' && m.removedNodes.length) Q.draws++; }).observe(document.getElementById('gc-leads-hub').parentNode, { childList: true, subtree: true });
    const f = () => { const n = window._gcNewLead.mine().length, c = document.getElementById('gc-nl-chip'), v = !!(c && c.isConnected && c.getClientRects().length);
      if (document.querySelector('#gc-leads-hub .gc-nl, #gc-nl-leads')) Q.card++;
      if (n && Q.last === true && !v) Q.gone++; Q.last = v; if (!Q.stop) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  const t0 = Date.now(); let i = 0;
  while (Date.now() - t0 < ms) {
    await sleep(3000);
    await A.ev(i => window._setLeads(prev => prev.map((x, j) => j === i % prev.length ? Object.assign({}, x, { updatedAt: new Date().toISOString(), priority: ((+x.priority || 0) % 10) + 1 }) : x)), i++);
  }
  return A.ev(() => { const Q = window.__nlw; Q.stop = 1; return { gone: Q.gone, card: Q.card, draws: Q.draws }; });
}

/* ═══ 1. the estimator ═══ */
{
  const { A, errs } = await open(est);
  const s0 = await A.ev(() => ({ n: window._gcNewLead.mine().length, chip: (document.querySelector('#gc-leads-chips #gc-nl-chip') || {}).textContent || '', card: !!document.querySelector('#gc-nl-leads, #gc-leads-hub .gc-nl'), pop: !!document.getElementById('gc-nl-pop') }));
  console.log('  estimator: ' + s0.n + ' new leads');
  ok('the estimator has a batch of new leads (> 8) in the snapshot', s0.n > 8, s0);
  ok('"🔔 N new for you" is a chip in the Leads header row', new RegExp('\\b' + s0.n + ' new for you').test(s0.chip), s0);
  ok('no card inside the Leads list, and nothing opened by itself', !s0.card && !s0.pop, s0);
  const w = await watch(A, 30000);
  ok('30 s of list redraws: the chip never disappears (' + w.draws + ' redraws)', w.draws >= 3 && w.gone === 0 && w.card === 0, w);

  /* the short list */
  await A.page().click('#gc-nl-chip [data-nlc="show"]'); await sleep(400);
  const p = await A.ev(() => { const p = document.getElementById('gc-nl-pop'); return p ? { rows: p.querySelectorAll('.gc-nl-r[data-id]').length, more: !!p.querySelector('[data-nlc="leads"]'), all: (p.querySelector('[data-nlc="all"]') || {}).textContent || '', h: Math.round(p.getBoundingClientRect().height), inHub: !!p.closest('#gc-leads-hub') } : null; });
  ok('the chip opens a short list: 8 rows, "Open Leads" for the rest, "✓ Mark all N seen"', p && p.rows === 8 && p.more && /Mark all \d+ seen/.test(p.all) && p.h < 640 && !p.inHub, p);
  await A.page().keyboard.press('Escape'); await sleep(200);
  ok('Esc closes it', await A.ev(() => !document.getElementById('gc-nl-pop')));
  await A.page().click('#gc-nl-chip [data-nlc="show"]'); await sleep(300);
  const first = await A.ev(() => document.querySelector('#gc-nl-pop .gc-nl-r[data-id]').getAttribute('data-id'));
  const gotSel = await A.ev(() => document.querySelector('#gc-nl-pop .gc-nl-r[data-id] [data-nl="got"]') ? '[data-nl="got"]' : '[data-lsa-b="good"]');
  if (gotSel === '[data-nl="got"]') { await A.page().click('#gc-nl-pop .gc-nl-r[data-id="' + first + '"] [data-nl="got"]'); await sleep(500);
    ok('✓ Got it marks that one (N − 1)', await A.ev(n => window._gcNewLead.mine().length === n - 1, s0.n)); }

  /* localStorage full, then ✕ closes the batch */
  const key = await A.ev(() => 'gc_lead_seen__' + window.__GC_AUTH__.email().toLowerCase());
  const ids = await A.ev(() => window._gcNewLead.mine().map(l => l.id));
  const full = await A.ev(k => { localStorage.removeItem(k); let n = 0, sz = 1 << 20; while (sz >= 64) { try { localStorage.setItem('__qa_full_' + n, 'x'.repeat(sz)); n++; } catch (e) { sz >>= 1; } if (n > 2000) break; } try { localStorage.setItem('__qa_probe', 'y'.repeat(4096)); localStorage.removeItem('__qa_probe'); return false; } catch (e) { return true; } }, key);
  ok('localStorage is full (this person\'s seen list is not in it)', full);
  await A.page().click('#gc-nl-chip [data-nlc="all"]'); await sleep(2500);
  const after = await A.ev(async k => ({ n: window._gcNewLead.mine().length, chip: !!(document.getElementById('gc-nl-chip') || {}).isConnected, idb: Object.keys((await window.idbGet(k)) || {}).length }), key);
  ok('✕ closes the batch: no chip, nothing new left', after.n === 0 && !after.chip, after);
  ok('…saved in IndexedDB although localStorage is full', after.idb >= ids.length, after);
  const cl = H.cget(key); const clv = typeof cl === 'string' ? JSON.parse(cl) : cl || {};
  ok('…and in the person\'s cloud row', ids.every(id => clv[id]), { have: Object.keys(clv).length, want: ids.length });
  await A.ev(k => localStorage.removeItem(k), key);   /* this desk's localStorage copy gone too (full: the save could not land there) */
  H.cset(key, {});   /* the cloud row lost (another device overwrote it): the desk's own IndexedDB still remembers */
  await A.page().reload({ waitUntil: 'domcontentloaded' });
  await H.waitFor(A, () => (window._crm && window._crm.leads || []).length > 50 && window._gcNewLead, null, 120000); await sleep(5000);
  await A.ev(() => window._setView('leads')); await H.waitFor(A, () => !!document.querySelector('#gc-leads-hub #gc-leads-chips'), null, 30000); await sleep(4000);
  const re = await A.ev(k => { let ls = {}; try { ls = JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) {} return { n: window._gcNewLead.mine().length, chip: !!(document.getElementById('gc-nl-chip') || {}).isConnected, ls: Object.keys(ls).length }; }, key);
  ok('after a reload with neither a localStorage copy nor the cloud row, the batch stays closed (IndexedDB)', re.n === 0 && !re.chip, re);
  await A.ev(() => { for (let i = 0; i < 3000; i++) localStorage.removeItem('__qa_full_' + i); });
  /* a new lead for the estimator brings the chip back */
  await A.ev(nm => window._setLeads(prev => prev.concat([{ id: 'QA-NLP-1', name: 'QA new lead', stage: 'New Lead', assignedTo: nm, assignedBy: 'Office', assignedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])), est.name);
  await sleep(3000);
  ok('a newly assigned lead brings the chip back (1 new)', await A.ev(() => /\b1 new for you/.test((document.getElementById('gc-nl-chip') || {}).textContent || '') && document.getElementById('gc-nl-chip').isConnected));
  /* the estimator's Dashboard: "My estimating" fits its box, one line of buttons per row */
  await A.page().setViewportSize({ width: 1366, height: 900 }); await A.ev(() => window._setView('dashboard'));
  await H.waitFor(A, () => !!document.querySelector('#gc-la-dash .tw tbody tr'), null, 30000); await sleep(1500);
  const dsh = await A.ev(() => { const t = document.querySelector('#gc-la-dash .tw'); if (!t) return null; const r = [...t.querySelectorAll('tbody tr')].map(x => x.getBoundingClientRect().height); return { over: t.scrollWidth - t.clientWidth, avg: Math.round(r.reduce((a, b) => a + b, 0) / r.length) }; });
  ok('Dashboard "My estimating" at 1366 px: no sideways scroll, rows ≈ ' + (dsh && dsh.avg) + ' px (were ~157)', dsh && dsh.over <= 1 && dsh.avg <= 80, dsh);
  ok('no page errors (estimator)', !errs.length, errs);
  await A.close();
}

/* ═══ 2. the admin: Leads holds still; the lists fit the window ═══ */
{
  const { A, errs } = await open(adm);
  const w = await watch(A, 15000);
  ok('admin on Leads: no card inside the list, the chip (if any) never disappears (' + w.draws + ' redraws)', w.card === 0 && w.gone === 0, w);
  const fits = async (wd) => { await A.page().setViewportSize({ width: wd, height: 900 }); await sleep(2500);
    return A.ev(() => { const se = document.scrollingElement, wr = document.querySelector('#gc-leads-hub .gcl-wrap'), src = document.querySelector('#gc-leads-hub th.c-src');
      return { page: se.scrollWidth, iw: innerWidth, wrap: wr ? wr.scrollWidth - wr.clientWidth : -1, src: src ? src.getClientRects().length > 0 : null, srcIn: !!document.querySelector('#gc-leads-hub .gcl-srcin .gcl-src') && [...document.querySelectorAll('#gc-leads-hub .gcl-srcin')].some(e => e.getClientRects().length && e.getBoundingClientRect().width > 0),
        rowH: (() => { const r = [...document.querySelectorAll('#gc-leads-hub tr.gcl-lr')].slice(0, 30).map(r => r.getBoundingClientRect().height); return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : 0; })() }; }); };
  for (const wd of [1366, 1920]) { const f = await fits(wd); ok('Leads at ' + wd + ' px: no sideways scroll (page ' + f.page + ' ≤ ' + f.iw + ', list box ' + f.wrap + ' px over), rows ≈ ' + f.rowH + ' px', f.page <= f.iw && f.wrap >= 0 && f.wrap <= 1 && f.rowH > 0 && f.rowH <= 76, f); }
  { const f = await fits(1180); ok('Leads at 1180 px: fits, Source moves onto the Lead line', f.page <= f.iw && f.wrap <= 1 && f.src === false && f.srcIn, f); }
  await A.page().setViewportSize({ width: 1366, height: 900 });
  for (const v of ['projects', 'invoices']) {
    await A.ev(v => window._setView(v), v); await sleep(5000);
    await H.waitFor(A, () => [...document.querySelectorAll('#root div[style*="overflow-x"] > table.gc-fit')].some(t => t.getClientRects().length), null, 20000);
    const f = await A.ev(() => { const t = [...document.querySelectorAll('#root div[style*="overflow-x"] > table')].find(t => t.getClientRects().length); if (!t) return null; const b = t.parentElement; return { cls: t.className, over: b.scrollWidth - b.clientWidth, page: document.scrollingElement.scrollWidth, iw: innerWidth }; });
    ok(v + ' at 1366 px: the table fits its box (no sideways scroll)', f && /gc-fit/.test(f.cls) && f.over <= 1 && f.page <= f.iw, f);
  }
  ok('no page errors (admin)', !errs.length, errs);
  await A.close();
}
console.log('NEWLEADSPOP ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
