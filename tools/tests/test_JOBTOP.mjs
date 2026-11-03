// test_JOBTOP.mjs <build-dir> — patch JOBTOP (owner 11/02): on a job page the summary strip (Contract · Bid · Spent ·
// Profit · Margin · Estimates · Change orders) and the tab bar come right under the job's header; every other card / bar
// is in #gc-job-widgets below the tab content and nothing is ever inserted above the strip (watched for 20 s).
// + "🔗 Share photos" (desk Photos tab header, Field job tile) opens GrayCo Photos' Photo report of that job.
//   Data: the real-data mirror (GC_MIRROR, default the session scratchpad's loop/mirror.json) in the offline harness
//   (GC_HARNESS) with a fake cloud — nothing is written anywhere else. Sizes: GC_SIZES (default 1462x987,1366x768;
//   the owner's laptop at 125 % is about 1093x480). Screenshots go to GC_SHOTS (default the scratchpad's wJOBTOP).
import { pathToFileURL } from 'url';
import fs from 'fs'; import path from 'path';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const MIRROR = process.env.GC_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wJOBTOP';
const SIZES = (process.env.GC_SIZES || '1462x987,1366x768').split(',').map(x => x.trim().split('x').map(Number)).filter(x => x[0] && x[1]);
const WATCH_MS = +(process.env.GC_WATCH_MS || 20000);
const build = process.argv[2];
if (!build) { console.error('usage: node test_JOBTOP.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
fs.mkdirSync(SHOTS, { recursive: true });

/* ── static ── */
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
ok(html.includes('__GC_PATCH_JOBTOP__') && html.indexOf('id="gc-patch-jobtop"') < html.indexOf('__GC_PATCH_Q__'), 'JOBTOP is in, before the first job-page injector (patch Q)');
ok((html.match(/window\._gcJobBox\(/g) || []).length >= 11, 'the 11 desk injectors use the one container (window._gcJobBox)', (html.match(/window\._gcJobBox\(/g) || []).length);
ok(!/var root = back\.parentElement, have = root\.querySelector\(':scope > \.(gcja-bar|gc-a8-bar|gcx9-bars|gcx10-jobbar|gcgp-bar|gca11-jobbar|gcx12-bar|gcsrc-line\[data-desk\]|gcsp-bar)'\)/.test(html), 'no injector puts its bar next to the job header any more');
ok(['window._gcCCLinkPaint = showOnJob', 'window._gcYearBarPaint = bar', 'window._gcAp3DeskJob = deskJob', 'window._gcJobMsgInject = inject', 'window._gcPhotosDeskBtn'].every(x => html.includes(x)), 'the header\'s late buttons can be painted when the header first appears');
ok(html.includes('"data-gc-sharephotos":j.id') && html.includes("mk('share', '🔗', 'Share photos')") && html.includes('report: openReport'), '🔗 Share photos: desk Photos tab, Field tile, _gcPhotos.report');

const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset, cget } = await import(pathToFileURL(HARNESS).href);
const EMAIL = 'wjohnson@grayco-cs.com';
resetCloud();
const M = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
for (const r of M) if (r && r.key && !/^_probe/.test(r.key)) cset(r.key, r.v !== undefined ? r.v : r.value);
let P0 = cget('projects'); if (typeof P0 === 'string') try { P0 = JSON.parse(P0); } catch (e) {}
P0 = (Array.isArray(P0) ? P0 : []).filter(p => p && p.id && p.name && !p.deleted);
const low = v => String(v == null ? '' : v).toLowerCase();
const pick = [];
const add = p => { if (p && !pick.some(x => x.id === p.id)) pick.push(p); };
add(P0.find(p => low(p.status) === 'active' && +p.contract > 0 && /portal\.html#t=/.test(p.portalUrl || '')) || P0.find(p => low(p.status) === 'active' && +p.contract > 0));
add(P0.find(p => low(p.status) === 'bidding' && /commercial/i.test(p.type || '')) || P0.find(p => low(p.status) === 'bidding'));
add(P0.find(p => /insurance|water|fire/i.test(p.type || '') && !/lost/.test(low(p.status))) || P0.find(p => low(p.status) === 'completed'));
ok(pick.length === 3, 'fixture: 3 real jobs from the mirror (active with contract · bidding · insurance)', pick.map(p => p.status + ' / ' + p.type));

const WIDGETS = '.gcq-card,.gcsub-row,.gcja-bar,.gc-a8-bar,.gcx9-bars,.gcx10-jobbar,.gcgp-bar,.gca11-jobbar,.gcx12-bar,.gcsrc-line,.gcsp-bar,.gcinsp-panel,.gcch-bar,.gcsubc-panel,.gcao-wait';
/* in the page: the job page's blocks, top to bottom */
const LAYOUT = (W) => {
  const back = [...document.querySelectorAll('main button')].find(b => /^\s*←\s*All Projects\s*$/.test(b.textContent || ''));
  if (!back) return null;
  const root = back.parentElement, kids = [...root.children];
  const tabBar = kids.find(k => [...k.children].some(b => b.tagName === 'BUTTON' && /^Files & Docs \(/.test((b.textContent || '').trim())));
  const tiles = kids.find(k => k !== tabBar && [...k.children].some(c => /^Change Orders/.test((c.textContent || '').trim())) && /Spent/.test(k.textContent || ''));
  const box = document.getElementById('gc-job-widgets');
  const top = el => el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
  const name = k => k === back ? 'back' : k === back.nextElementSibling ? 'header' : k === tiles ? 'SUMMARY' : k === tabBar ? 'TABS' : k === box ? 'box[' + box.children.length + ']' : ((k.id ? '#' + k.id : '') + (k.className && typeof k.className === 'string' ? '.' + k.className.split(' ')[0] : '')) || k.tagName.toLowerCase();
  const outside = [...root.querySelectorAll(':scope > :is(' + W + ')')].map(x => x.className.split(' ')[0]);
  const inBox = box ? [...box.children].map(x => (x.className || x.id || x.tagName).toString().split(' ')[0]) : [];
  const h1 = back.nextElementSibling && back.nextElementSibling.querySelector('h1');
  return { yBack: top(back), order: kids.map(name), iBack: kids.indexOf(back), iTiles: kids.indexOf(tiles), iTabs: kids.indexOf(tabBar), iBox: kids.indexOf(box), n: kids.length,
    boxLast: !!box && root.lastElementChild === box, boxInRoot: !!box && box.parentElement === root, outside, inBox, name: h1 ? h1.textContent.trim() : '',
    yTiles: top(tiles), yTabs: top(tabBar), yBox: box && box.children.length ? top(box) : null, tabsBottom: tabBar ? Math.round(tabBar.getBoundingClientRect().bottom + window.scrollY) : null,
    widgetTops: [...root.querySelectorAll(W)].filter(x => x.offsetParent).map(x => top(x)) };
};
/* in the page: watch the job root — every non-React node that lands above the tab bar */
const ARM = () => {
  const back = [...document.querySelectorAll('main button')].find(b => /^\s*←\s*All Projects\s*$/.test(b.textContent || ''));
  const root = back.parentElement; const W = window.__jtWatch = { above: [], tops: [] };
  const react = n => Object.keys(n).some(k => k.startsWith('__reactFiber'));
  const tabsIdx = () => [...root.children].findIndex(k => [...k.children].some(b => b.tagName === 'BUTTON' && /^Files & Docs \(/.test((b.textContent || '').trim())));
  const mo = new MutationObserver(recs => recs.forEach(r => r.addedNodes.forEach(n => {
    if (n.nodeType !== 1 || react(n) || n.id === 'gc-job-widgets') return;
    const i = [...root.children].indexOf(n), t = tabsIdx();
    if (i >= 0 && (t < 0 || i < t)) W.above.push((n.className || n.id || n.tagName).toString().slice(0, 40) + '@' + i + '<' + t);
  })));
  mo.observe(root, { childList: true }); W.mo = mo; return true;
};

const c = await computer('JT', { build }); const p = c.page();
const shots = [];
try {
  await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(EMAIL); await p.locator('#gc-auth-password').fill(ACCOUNTS[EMAIL].pw); await sleep(300); const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await waitFor(c, () => (window._crm && window._crm.projects || []).length > 100 && typeof window._navToJob === 'function' && typeof window._gcJobBox === 'function', null, 180000, 500); await sleep(6000);
  for (const [w, h] of SIZES) {
    await p.setViewportSize({ width: w, height: h });
    for (let i = 0; i < pick.length; i++) {
      const job = pick[i], tag = w + 'x' + h + ' · ' + job.status + ' "' + job.name.slice(0, 28) + '"';
      await c.ev(() => { try { window._setView('projects'); } catch (e) {} }); await sleep(1200);
      await c.ev(id => window._navToJob(id), job.id);
      const up = await waitFor(c, LAYOUT, WIDGETS, 20000, 150);
      if (!up || up.iTabs < 0) { ok(false, tag + ': the job page opened', up); continue; }
      await c.ev(ARM);
      const t0 = Date.now(), tops = [], abs = []; let bad = null;
      while (Date.now() - t0 < WATCH_MS) {
        const L = await c.ev(LAYOUT, WIDGETS);
        if (L) { tops.push(L.yTiles - L.yBack); abs.push(L.yTiles); if (!bad && !(L.iTiles === L.iBack + 2 && L.iTabs === L.iTiles + 1)) bad = L.order; }
        await sleep(500);
      }
      const L = await c.ev(LAYOUT, WIDGETS), above = await c.ev(() => window.__jtWatch.above.slice());
      ok(L.name === job.name.trim(), tag + ': the job page is this job', L.name);
      ok(L.iBack === 0 && L.iTiles === 2 && L.iTabs === 3, tag + ': header → summary strip → tab bar are the first blocks', L.order);
      ok(!bad, tag + ': …at every look over ' + WATCH_MS / 1000 + ' s', bad);
      ok(!above.length, tag + ': nothing was inserted above the tab bar in ' + WATCH_MS / 1000 + ' s', above);
      /* measured from the job page's own top ("← All Projects"): a banner above the whole page (Connect Google …) is not the job page */
      ok(Math.max(...tops) - Math.min(...tops) <= 1, tag + ': the summary strip never moved on the job page (' + Math.min(...tops) + '…' + Math.max(...tops) + ' px under the job page top; page y ' + Math.min(...abs) + '…' + Math.max(...abs) + ')', [...new Set(tops)]);
      ok(L.boxLast && !L.outside.length, tag + ': every card / bar is in the "Job tools" container, the last block (' + L.inBox.join(', ') + ')', { outside: L.outside, order: L.order });
      ok(L.widgetTops.every(y => y > L.tabsBottom), tag + ': every widget is drawn below the tab bar', { tabs: L.tabsBottom, w: L.widgetTops });
      /* the bottom bars: on a computer only ROLEAPPS' Desk dock (#gc-ra-dock, by design: Home · Jobs · Approvals · Photos ·
         More); the phone bars stay hidden; the dock never covers the summary strip or the tab bar, and main keeps room under it */
      const bars = await c.ev(() => { const vis = id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
        const back = [...document.querySelectorAll('main button')].find(b => /^\s*←\s*All Projects\s*$/.test(b.textContent || '')), kids = back ? [...back.parentElement.children] : [];
        const tabs = kids.find(k => [...k.children].some(b => b.tagName === 'BUTTON' && /^Files & Docs \(/.test((b.textContent || '').trim())));
        const dock = document.getElementById('gc-ra-dock'), dr = dock && vis('gc-ra-dock') ? dock.getBoundingClientRect() : null, tr = tabs ? tabs.getBoundingClientRect() : null;
        const tiles = kids.find(k => k !== tabs && [...k.children].some(c => /^Change Orders/.test((c.textContent || '').trim())));
        const hit = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const covers = !!dr && (hit(dr, tr) || hit(dr, tiles && tiles.getBoundingClientRect()));
        const main = document.querySelector('main');
        return { view: window._gcView ? window._gcView.state() : null, phoneBars: ['gc-fh-tabs', 'gc-mobile-bottom-nav', '_gcAppTabs'].filter(vis), dock: !!dr, dockTop: dr && Math.round(dr.top), tabsBottom: tr && Math.round(tr.bottom), mainPad: main ? parseFloat(getComputedStyle(main).paddingBottom) : 0, dockH: dr ? Math.round(dr.height) : 0, covers, side: !!dock && !!dock.closest('aside'), innerH: window.innerHeight }; });
      ok(bars.view && bars.view.phone === false && !bars.view.field && !bars.phoneBars.length, tag + ': Desk view, no phone bottom bar', bars);
      ok(!bars.dock || (!bars.covers && (bars.side || bars.mainPad >= bars.dockH)), tag + ': the Desk dock (if shown) never covers the summary strip or the tab bar (' + (bars.side ? 'compact, in the left menu' : 'floating; main keeps room for it') + ')', bars);
      if (bars.innerH < 600 && bars.dock) ok(bars.side, tag + ': a short window (' + bars.innerH + ' px): the dock is the compact icon row in the left menu', bars);
      if (i === 0) ok(L.inBox.length >= 2, tag + ': the widgets are still there (' + L.inBox.length + ')', L.inBox);
      const f = path.join(SHOTS, 'jobtop_' + w + 'x' + h + '_' + (i + 1) + '.png'); await p.screenshot({ path: f, fullPage: false }); shots.push(f);
      /* switch tabs: the container stays last, under the new tab's content */
      await c.ev(() => { const b = [...document.querySelectorAll('main button')].find(x => /^Schedule \(/.test((x.textContent || '').trim())); if (b) b.click(); }); await sleep(900);
      const L2 = await c.ev(LAYOUT, WIDGETS);
      ok(L2.boxLast && L2.iTabs === 3 && L2.iBox > L2.iTabs, tag + ': after a tab switch the tools stay under the tab content', L2.order);
      await c.ev(() => { const b = [...document.querySelectorAll('main button')].find(x => /^Overview$/.test((x.textContent || '').trim())); if (b) b.click(); }); await sleep(400);
      await c.ev(() => { try { window.__jtWatch.mo.disconnect(); } catch (e) {} });
    }
  }
  /* a short window: the compact dock's Home still opens the role's Desk home */
  if (SIZES.some(([w, h]) => h < 600)) {
    await p.setViewportSize({ width: 1093, height: 480 }); await sleep(1500);
    const hasDock = await c.ev(() => !!document.querySelector('aside #gc-ra-dock [data-t="home"]'));
    if (hasDock) {
      await c.ev(() => document.querySelector('aside #gc-ra-dock [data-t="home"]').click());
      const home = await waitFor(c, () => document.documentElement.classList.contains('gc-ra-home') && !!document.getElementById('gc-ra-desk') && getComputedStyle(document.getElementById('gc-ra-desk')).display !== 'none', null, 8000, 250);
      ok(!!home, '1093x480: the compact dock\'s Home opens the role\'s Desk home');
      { const f = path.join(SHOTS, 'jobtop_1093x480_home.png'); await p.screenshot({ path: f }); shots.push(f); }
    } else ok(true, '1093x480: no Desk dock for this role');
  }
  /* desk: 🔗 Share photos on the Photos tab → the Photo report of this job */
  const job = pick[0];
  await c.ev(() => { try { window._setView('projects'); } catch (e) {} }); await sleep(1000);
  await c.ev(id => window._navToJob(id), job.id); await waitFor(c, LAYOUT, WIDGETS, 20000, 200); await sleep(800);
  await c.ev(() => { const b = [...document.querySelectorAll('main button')].find(x => /^Photos \(/.test((x.textContent || '').trim())); if (b) b.click(); }); await sleep(900);
  const sb = p.locator('[data-gc-sharephotos="' + job.id + '"]');
  ok(await sb.count() === 1 && /Share photos/.test(await sb.innerText()), 'desk Photos tab: the 🔗 Share photos button is there');
  await sb.click();
  const rep = await waitFor(c, id => { const S = window._gcPhotos && window._gcPhotos.state; return S && S.open && S.screen === 'report' && S.jobId === id && /Copy share link \(customer, sub, adjuster\)/.test(document.body.innerText) ? S.jobId : null; }, job.id, 15000, 250);
  ok(rep === job.id, 'desk: it opens the Photo report (Copy share link · Text or email) of this job', rep);
  { const f = path.join(SHOTS, 'jobtop_share_desk.png'); await p.screenshot({ path: f }); shots.push(f); }
  const back1 = await c.ev(() => { const b = document.querySelector('#gcuOv [data-a="back"]'); if (b) { b.click(); return 'button'; } window._gcPhotos.close(); return 'close'; }); await sleep(800);
  ok(await c.ev(() => !(window._gcPhotos.state || {}).open), 'desk: ‹ / close goes back to the job (' + back1 + ')');
  ok(!c.errs.filter(e => !/cdnjs/.test(e)).length, 'desk: no page errors', c.errs.slice(0, 4));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await c.b.close();

/* ── the Field (phone) job screen: summary first, then the tiles, then the rest; 🔗 Share photos tile ── */
const m = await computer('JTF', { build, mobile: true }); const q = m.page();
try {
  await q.goto('https://app.local/index.html'); await sleep(2500);
  if (await q.locator('#gc-auth-email').count()) { await q.locator('#gc-auth-email').fill(EMAIL); await q.locator('#gc-auth-password').fill(ACCOUNTS[EMAIL].pw); await sleep(300); await q.locator('#gc-auth-submit').tap().catch(async () => { const bb = await q.locator('#gc-auth-submit').boundingBox(); await q.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }); }
  await waitFor(m, () => (window._crm && window._crm.projects || []).length > 100 && typeof window._gcJobDashboard === 'function', null, 180000, 500); await sleep(6000);
  for (let i = 0; i < pick.length; i++) {
    const job = pick[i];
    await m.ev(id => window._gcJobDashboard(id), job.id);
    const F = () => { const ov = document.getElementById('_gcJobDash'); if (!ov) return null; const body = ov.children[1]; const sum = body && body.querySelector(':scope > .gcjt-fsum'), top = body && body.querySelector(':scope > .gcfp-top');
      if (!sum || !top) return null; const y = el => Math.round(el.getBoundingClientRect().top);
      const vis = [...body.children].filter(k => k.offsetParent || k.getClientRects().length).sort((a, b) => y(a) - y(b)).map(k => (k.className || k.tagName).toString().split(' ')[0]);
      return { vis, ySum: y(sum), yTop: y(top), text: sum.innerText.replace(/\s+/g, ' '), share: !!top.querySelector('[data-fp="share"]') }; };
    let r = await waitFor(m, F, null, 15000, 250);
    const seen = [];
    for (let k = 0; k < 16 && r; k++) { await sleep(500); r = await m.ev(F); if (r) seen.push(r.vis.slice(0, 2).join('>')); }
    ok(r && r.vis[0] === 'gcjt-fsum' && r.vis[1] === 'gcfp-top' && r.ySum < r.yTop, 'field "' + job.name.slice(0, 28) + '": the summary first, then the tiles, the rest below', r && r.vis);
    ok(seen.every(x => x === 'gcjt-fsum>gcfp-top'), 'field: …and it stays that way for 8 s', [...new Set(seen)]);
    /* the labels are upper-cased by CSS (innerText); a bidding job without a contract reads "Contract: No contract yet" + "Bid / Estimate" like the desk strip */
    ok(r && /^\s*(contract|contract \+ cos)\b/i.test(r.text) && /\bspent\b/i.test(r.text) && /\bprofit\b/i.test(r.text) && /\bmargin\b/i.test(r.text) && /\bestimates\b/i.test(r.text) && /\bchange orders\b/i.test(r.text)
      && (!/no contract yet/i.test(r.text) || /bid \/ estimate/i.test(r.text)), 'field: the summary reads Contract (or No contract yet + Bid / Estimate) · Spent · Profit · Margin · Estimates · Change orders (owner)', r && r.text);
    ok(r && r.share, 'field: the 🔗 Share photos tile is on the job screen');
    if (i === 0) {
      const f = path.join(SHOTS, 'jobtop_field_390.png'); await q.screenshot({ path: f }); shots.push(f);
      await m.ev(() => { const b = document.querySelector('#_gcJobDash [data-fp="share"]'); b.scrollIntoView({ block: 'center' }); b.click(); });
      const rep = await waitFor(m, id => { const S = window._gcPhotos && window._gcPhotos.state; return S && S.open && S.screen === 'report' && S.jobId === id && /Copy share link/.test(document.body.innerText) ? S.jobId : null; }, job.id, 15000, 250);
      ok(rep === job.id, 'field: 🔗 Share photos opens the Photo report of this job', rep);
      const f2 = path.join(SHOTS, 'jobtop_share_field.png'); await q.screenshot({ path: f2 }); shots.push(f2);
      await m.ev(() => window._gcPhotos.close()); await sleep(1200);
    }
  }
  ok(!m.errs.filter(e => !/cdnjs/.test(e)).length, 'field: no page errors', m.errs.slice(0, 4));
} catch (e) { fail++; console.log('  ✗ FAIL crashed (field): ' + (e && e.stack || e)); }
await m.b.close();
console.log('screenshots: ' + shots.join(' '));
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
