// test_PROJLAYOUT.mjs <build> — patch PROJLAYOUT (the job page): Project Info + Financial Summary on top of every tab,
// foldable (kept across a reload); the COMMCO hold banner stays pinned first; the job header has one action row
// (📷 Open GrayCo Photos + ✉️ E-mail, no CompanyCam wording, no overflow); 🧹 Duplicates is in the 💎 menu and the
// loose button is gone; "Looks commercial — change?" (admin / the job's PM) sets the type and a second computer sees it.
// Offline: the harness's in-memory gc_kv + realtime. Needs the CLEAN fixture in the scratchpad (never committed).
import path from 'path';
import { computer, signIn, sleep, waitFor, resetCloud, seedCloudFromBackup, cloud, cset, SP } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const J = v => typeof v === 'string' ? JSON.parse(v) : v;

resetCloud(); seedCloudFromBackup(SP + '/GrayCo_CLEAN_DATA_2026-10-16.json');
/* a job with a CompanyCam link (the header must not say CompanyCam) whose type says residential while the client is a company */
const PID = 'PRJk1y8mj1';
const projs = J(cloud.get('projects').value).map(p => p.id === PID ? Object.assign({}, p, { companyCamUrl: 'https://app.companycam.com/projects/123', ccamUrl: 'https://app.companycam.com/projects/123' }) : p);
cset('projects', projs);
const before = projs.find(p => p.id === PID);
ok('fixture: the job is "Residential Reno" with a company client', before && before.type === 'Residential Reno' && /LLC/.test(before.client), before && [before.type, before.client]);

const A = await computer('A', { build });
const open = async (C, pid) => { await C.ev(pid => window._navToJob(pid), pid); return waitFor(C, pid => { const r = document.querySelector('.gc-pl-root'); return r && r.getAttribute('data-pid') === pid && !!r.querySelector('.gc-pl-info'); }, pid, 30000, 250); };
const layout = C => C.ev(() => {
  const r = document.querySelector('.gc-pl-root'); if (!r) return null;
  const y = el => el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
  const kids = [...r.children];
  const kpi = kids.find(x => /^Contract|Contract \+ COs/.test((x.textContent || '').trim()) && getComputedStyle(x).display === 'grid');
  const tabs = kids.find(x => [...x.children].some(b => b.tagName === 'BUTTON' && b.textContent.trim() === 'Overview'));
  const info = r.querySelector(':scope > .gc-pl-info');
  return { back: y(r.querySelector(':scope > .gc-pl-back')), head: y(r.querySelector(':scope > .gc-pl-head')), info: y(info), kpi: y(kpi), tabs: y(tabs),
    pinfo: !!(info && info.querySelector('[data-section=pinfo]') && info.querySelector('[data-section=pinfo]').offsetParent),
    fin: !!(info && info.querySelector('[data-section=fin]') && info.querySelector('[data-section=fin]').offsetParent),
    col: !!(info && info.classList.contains('gc-pl-col')), sum: info ? (info.querySelector('.gc-pl-sum') || {}).textContent : '',
    ovHasInfo: kids.some(x => x !== info && /Project Info/.test(x.textContent || '') && /Financial Summary/.test(x.textContent || '')) };
});
try {
  await signIn(A, 'wjohnson@grayco-cs.com', 4000);
  ok('signed in, data loaded', await waitFor(A, () => (window._crm && window._crm.projects || []).length > 20 && window._gcPL && window._gcJA && window._gcDedupe, null, 120000, 300));
  await sleep(6000);
  /* the loose 🧹 Duplicates button: the Approvals page used to leave it behind above "← All Projects" */
  await A.ev(() => window._setView('approvals')); await sleep(4000);
  const ddApx = await A.ev(() => document.querySelectorAll('[data-gcdd-btn]').length);
  ok('job page opens', await open(A, PID));
  await sleep(1500);
  const dd = await A.ev(() => document.querySelectorAll('[data-gcdd-btn]').length);
  ok('no loose 🧹 Duplicates button (Approvals page or job page)', ddApx === 0 && dd === 0, [ddApx, dd]);

  let L = await layout(A);
  ok('Project Info + Financial Summary at the top: under the title, above the money strip and the tabs', L && L.back < L.head && L.head < L.info && L.info < L.kpi && L.info < L.tabs && L.pinfo && L.fin && !L.col, L);
  ok('…and no second copy in Overview', L && !L.ovHasInfo, L);
  /* another tab: still on top */
  await A.ev(() => { const b = [...document.querySelectorAll('.gc-pl-root button')].find(x => /^Schedule/.test(x.textContent.trim())); b && b.click(); });
  await sleep(800);
  L = await layout(A);
  ok('on the Schedule tab they are still shown on top', L && L.pinfo && L.fin && L.info < L.tabs, L);
  await A.ev(() => { const b = [...document.querySelectorAll('.gc-pl-root button')].find(x => x.textContent.trim() === 'Overview'); b && b.click(); });

  /* the header action row */
  const H = await A.ev(() => {
    const h = document.querySelector('.gc-pl-head'), hb = h.getBoundingClientRect();
    const ph = document.getElementById('_gcGPOpenBtn'), ml = h.querySelector('._gcJobMailBtn'), h1 = h.querySelector('h1');
    const r = el => el ? el.getBoundingClientRect() : null, a = r(ph), m = r(ml), t = r(h1);
    const over = [...h.querySelectorAll('*')].filter(el => { const b = el.getBoundingClientRect(); return b.width && b.right > hb.right + 1; }).map(el => el.tagName + ':' + (el.textContent || '').slice(0, 30));
    return { cc: /CompanyCam/i.test(h.textContent), every: /Every photo/.test(h.textContent), ph: ph && ph.textContent, ml: ml && ml.textContent, sameRow: !!(a && m && Math.abs(a.top - m.top) < 4), below: !!(a && t && a.top >= t.bottom - 2), over };
  });
  ok('header: "📷 Open GrayCo Photos" and "✉️ E-mail …" side by side on one row under the title', H.ph === '📷 Open GrayCo Photos' && /^✉️ E-mail/.test(H.ml || '') && H.sameRow && H.below, H);
  ok('header: no CompanyCam wording, nothing sticking out', !H.cc && !H.every && !H.over.length, H);

  /* fold, reload, still folded */
  await A.ev(() => document.querySelector('.gc-pl-tog').click()); await sleep(300);
  L = await layout(A);
  ok('fold: one-line summary (client · type · PM · status · contract · spent · profit · margin), cards hidden', L.col && !L.pinfo && !L.fin && /Knockout Flooring LLC · Residential Reno · PM: .* · Contract \$[\d,.]+ · Spent \$[\d,.]+ · Profit .* · Margin/.test(L.sum), L);
  await A.page().reload(); await waitFor(A, () => (window._crm && window._crm.projects || []).length > 20 && window._gcPL, null, 120000, 300); await sleep(4000);
  await open(A, PID); await sleep(1000);
  L = await layout(A);
  ok('…still folded after a reload (per person, this device)', L && L.col && !L.pinfo, L);
  await A.ev(() => document.querySelector('.gc-pl-tog').click()); await sleep(300);
  L = await layout(A);
  ok('unfold', L && !L.col && L.pinfo && L.fin, L);

  /* the hold banner stays pinned first (whatever the bars are doing): put one where COMMCO puts it, at the end */
  const pin = await A.ev(() => {
    const r = document.querySelector('.gc-pl-root'); const w = document.createElement('div'); w.className = 'gccc-wrap'; w.id = 'pl-fake-hold';
    w.innerHTML = '<div class="gccc-ban" role="alert" data-gccc="hold"><span>⛔ Work stopped — test</span></div>'; r.appendChild(w);
    const y = el => el.getBoundingClientRect().top;
    const firstVisible = [...r.children].filter(x => x.getClientRects().length && x.offsetHeight).sort((a, b) => y(a) - y(b)).map(x => x.className || x.tagName).slice(0, 4);
    w.remove(); return firstVisible;
  });
  ok('COMMCO hold banner is pinned first (right under "← All Projects", above the title and the info)', pin[0] === 'gc-pl-back' && pin[1] === 'gccc-wrap' && pin[2] === 'gc-pl-head' && /gc-pl-info/.test(pin[3]), pin);

  /* idle: nothing on the job page redraws by itself (after the reload's sync has settled) */
  await sleep(20000);
  const idle = await A.ev(async () => {
    const info = document.querySelector('.gc-pl-info'); let n = 0; const what = []; const mo = new MutationObserver(l => { n += l.length; l.forEach(m => what.length < 8 && what.push(m.type + ':' + (m.target.nodeType === 1 ? m.target.tagName + '.' + (m.target.className || '') : m.target.parentNode && m.target.parentNode.tagName) + ':' + (m.attributeName || '') + ':' + [...m.addedNodes].map(x => (x.textContent || '').slice(0, 20)).join('|') + '/-' + [...m.removedNodes].map(x => (x.textContent || '').slice(0, 20)).join('|'))); }); mo.observe(info, { subtree: true, childList: true, attributes: true, characterData: true });
    const lt = []; let po; try { po = new PerformanceObserver(l => l.getEntries().forEach(e => lt.push(e.duration))); po.observe({ type: 'longtask' }); } catch (e) {}
    await new Promise(r => setTimeout(r, 15000)); mo.disconnect(); try { po.disconnect(); } catch (e) {}
    return { what, mut: n, longtasks: lt.length, longMs: Math.round(lt.reduce((a, b) => a + b, 0)) };
  });
  ok('15 s idle on the job page: Project Info / Financial Summary never redrawn', idle.mut === 0, idle);
  console.log('     idle long tasks (whole page, 15 s): ' + JSON.stringify(idle));

  /* 💎 → 🧹 Duplicates */
  await A.ev(() => { const b = document.querySelector('[data-tb="hub"]'); b && b.click(); });
  await sleep(800);
  const it = await A.ev(() => !!document.querySelector('.gc-hub-item[data-label="Duplicates"]'));
  await A.ev(() => { const x = document.querySelector('.gc-hub-item[data-label="Duplicates"]'); x && x.click(); });
  const box = await waitFor(A, () => { const b = document.querySelector('.gcdd-box'); return b ? b.textContent.slice(0, 40) : null; }, null, 8000, 200);
  ok('💎 menu has 🧹 Duplicates (admin) and it opens the Duplicates review', it && /Duplicates/.test(box || ''), [it, box]);
  await A.ev(() => { const x = document.querySelector('.gcdd-box [data-x]'); x && x.click(); });

  /* "Looks commercial — change?" */
  const hint = await A.ev(() => { const b = document.querySelector('.gc-pl-hint'); return b ? b.textContent : null; });
  ok('Type row: "Looks commercial — change?" (saved Residential Reno, the rule says commercial)', hint === 'Looks commercial — change?', hint);
  const zoo = await A.ev(() => window._gcPLTypeHint(window._crm.projects.find(p => p.id === 'PRJqwpno4m')));
  ok('no hint on a job already typed commercial', zoo === false, zoo);
  await A.ev(() => document.querySelector('.gc-pl-hint').click());
  const tp = await waitFor(A, pid => { const p = window._crm.projects.find(x => x.id === pid); const b = document.querySelector('.gc-pl-hint'); return p && p.type === 'Commercial Reno' && !b ? p.type : null; }, PID, 10000, 200);
  ok('one click: type is Commercial Reno, the hint is gone', tp === 'Commercial Reno', tp);
  const cl = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 30000) { const p = J(cloud.get('projects').value).find(x => x.id === PID); if (p && p.type === 'Commercial Reno') return p.type; await sleep(500); } return null; })();
  ok('…saved to the cloud', cl === 'Commercial Reno', cl);

  /* a second computer: another person (not the job's PM) */
  const B = await computer('B', { build });
  await signIn(B, 'sbiffle@grayco-cs.com', 4000);
  await waitFor(B, () => (window._crm && window._crm.projects || []).length > 20 && window._gcPL, null, 120000, 300); await sleep(5000);
  await open(B, PID); await sleep(1500);
  const b2 = await B.ev(pid => ({ type: (window._crm.projects.find(x => x.id === pid) || {}).type, row: [...document.querySelectorAll('[data-section=pinfo] div')].map(d => d.textContent).find(t => /^Type/.test(t)), info: !!document.querySelector('.gc-pl-info [data-section=pinfo]'), dd: document.querySelectorAll('[data-gcdd-btn]').length }), PID);
  ok('second computer: the job shows Commercial Reno, Project Info on top', b2.type === 'Commercial Reno' && /Commercial Reno/.test(b2.row || '') && b2.info, b2);
  const hint2 = await B.ev(() => { const p = window._crm.projects.find(x => x.id === 'PRJ3b2y5z3'); return p ? [p.pm, window._gcPLTypeHint(Object.assign({}, p, { type: 'Residential Reno' }))] : null; });
  ok('the rule is the same on every computer', hint2 && hint2[1] === true, hint2);
  await B.ev(() => { const b = document.querySelector('[data-tb="hub"]'); b && b.click(); }); await sleep(800);
  const it2 = await B.ev(() => [!!document.querySelector('.gc-hub-panel'), !!document.querySelector('.gc-hub-item[data-label="Duplicates"]')]);
  console.log('     staff 💎 menu: ' + JSON.stringify({ panel: it2[0], duplicates: it2[1] }));
  ok('no page errors', !A.errs.length && !B.errs.length, A.errs.concat(B.errs).slice(0, 5));
  await B.b.close();
} catch (e) { ok('test ran', false, String(e && e.stack || e)); }
await A.b.close();
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
