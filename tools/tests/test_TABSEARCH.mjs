// test_TABSEARCH.mjs <build-dir> — 🔍 Search tabs in the left menu: a result opens its tab (mouse click and Enter).
//   Owner (desktop, 11/02): typed "templ" → "Estimates (templates)" and "Templates" listed, "these buttons aren't clicking".
//   Offline harness (GC_HARNESS, default wN/harness_N.mjs), real-data mirror (MIRROR), owner signed in, 1462×987.
//   For each case: Dashboard, type the query in #gc-navsearch with the keyboard, then pick the result with a real mouse
//   click (page.mouse at the item's centre), and again with ↓ / Enter. Pass = the app's view is that tab (the stored view
//   AND the heading the app draws for it, compared with opening the tab directly).
//   Plus (ESTTPLBTN): the Estimates header is ＋ New estimate → 📋 Templates (outlined) → ⋯ More; ⋯ More starts with
//   "Copy from a similar job" + hint and opens the old similar-job window; 📋 Templates opens Templates; wraps at 1093 / 390 px.
//   GC_NO_EST=1 skips the Estimates-header part. Browser tests: one at a time, under the shared browser lock.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const BUILD = path.resolve(process.argv[2] || ''); if (!process.argv[2]) { console.error('usage: node test_TABSEARCH.mjs <build-dir>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, cloud, ACCOUNTS } = await import(pathToFileURL(HARNESS).href);
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const OWNER = 'wjohnson@grayco-cs.com';
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const c = await computer('owner', { build: BUILD }); c.acceptConfirm = false;
await c.ctx.route(u => { const x = new URL(u); return x.host === 'app.local' && x.pathname.startsWith('/.netlify/functions/'); }, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await c.ctx.route(u => /supabase\.co\/rest\/v1\/(gc_staff|rpc\/gc_my_access|gc_admin_kv)/.test(u), async r => {
  const u = new URL(r.request().url()), m = r.request().method();
  const J = (st, b) => r.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: typeof b === 'string' ? b : JSON.stringify(b) });
  if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (u.pathname.endsWith('/gc_staff')) return J(200, [{ email: OWNER, role: 'admin', active: true, name: '', payroll: true }]);
  if (u.pathname.endsWith('/gc_my_access')) return J(200, { email: OWNER, staff: true, admin: true, payroll: true, office: false, sec2: 1 });
  return m === 'GET' ? J(200, []) : J(201, '');
});
await c.ctx.addInitScript(() => {
  try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
  /* what happens to a result between the press and the click: was it replaced / hidden, did the click reach it */
  const T = window.__TS = { log: [] };
  ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(ev => document.addEventListener(ev, e => {
    const it = e.target && e.target.closest ? e.target.closest('.gc-nsr-item') : null;
    const res = document.getElementById('gc-navsearch-results');
    T.log.push({ ev, t: Math.round(performance.now()), tgt: (e.target && (e.target.id || e.target.className || e.target.tagName)) + '', item: it ? it.getAttribute('data-id') : null, conn: it ? it.isConnected : null, shown: res ? res.style.display : 'none' });
  }, true));
});
const p = c.page(); await p.setViewportSize({ width: 1462, height: 987 });
await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 60000 }); await sleep(1500);
for (let i = 0; i < 5; i++) { await p.locator('#gc-auth-email').fill(OWNER); await p.locator('#gc-auth-password').fill(ACCOUNTS[OWNER].pw); await sleep(300); if ((await p.locator('#gc-auth-email').inputValue()) === OWNER) break; }
const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
await waitFor(c, () => document.querySelectorAll('aside nav button, aside button[draggable="true"]').length > 5 && !document.getElementById('gc-auth-email') && !!document.getElementById('gc-navsearch'), null, 90000, 500);
await sleep(5000);
ok(await c.ev(() => !!document.getElementById('gc-navsearch')), 'owner signed in, 🔍 Search tabs is in the left menu');

const view = () => c.ev(() => { let v = ''; try { v = localStorage.getItem('grayco_view') || ''; } catch (e) {}
  const m = document.querySelector('main') || document.body; const h = m.querySelector('h1, h2'); return { v, h: h ? h.textContent.trim().slice(0, 60) : '' }; });
const go = async v => { await c.ev(v => window._setView(v), v); await sleep(2200); };

const CASES = [
  { q: 'templ', id: 'templates', label: 'Templates' },
  { q: 'templ', id: 'estimates', label: 'Estimates' },
  { q: 'acc', id: 'taxcenter', label: 'Accounting' },
  { q: 'lead', id: 'leads', label: 'Leads' },
  { q: 'adm', id: 'admin', label: 'Admin' },
];
/* what each tab looks like when opened directly (the app's heading for it) */
const want = {};
for (const k of CASES) { await go(k.id); want[k.id] = await view(); }
await go('dashboard'); const dash = await view();
console.log('  · direct: ' + JSON.stringify(want) + ' dashboard=' + JSON.stringify(dash));

async function typeQuery(q){
  await go('dashboard');
  const box = await p.locator('#gc-navsearch').boundingBox();
  await p.mouse.click(box.x + 40, box.y + box.height / 2);
  await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace');
  await p.keyboard.type(q, { delay: 90 });
  await sleep(400);
  return c.ev(() => { const r = document.getElementById('gc-navsearch-results'); if (!r || r.style.display === 'none') return [];
    return [].map.call(r.querySelectorAll('.gc-nsr-item'), x => ({ id: x.getAttribute('data-id'), t: x.textContent.trim() })); });
}
const opened = (k, got) => got.v === k.id && got.h === want[k.id].h && got.h !== dash.h;
for (const k of CASES) {
  for (const how of ['click', 'enter']) {
    const items = await typeQuery(k.q);
    const idx = items.findIndex(x => x.id === k.id);
    if (idx < 0) { ok(false, `"${k.q}" lists ${k.label}`, items); continue; }
    await c.ev(() => { window.__TS.log.length = 0; });
    let hit = null;
    if (how === 'click') {
      const loc = p.locator(`#gc-navsearch-results .gc-nsr-item[data-id="${k.id}"]`).first();
      const b = await loc.boundingBox();
      hit = await c.ev(([x, y]) => { const e = document.elementFromPoint(x, y); const it = e && e.closest && e.closest('.gc-nsr-item'); return it ? 'item:' + it.getAttribute('data-id') : (e ? (e.id || e.className || e.tagName) + '' : null); }, [b.x + b.width / 2, b.y + b.height / 2]);
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await sleep(120);
      await p.mouse.down(); await sleep(110); await p.mouse.up();   /* a person's press: ~0.1 s */
    } else {
      for (let i = 0; i <= idx; i++) { await p.keyboard.press('ArrowDown'); await sleep(60); }
      await p.keyboard.press('Enter');
    }
    await sleep(2500);
    const got = await view();
    const st = await c.ev(() => ({ val: (document.getElementById('gc-navsearch') || {}).value, shown: (document.getElementById('gc-navsearch-results') || {}).style?.display, log: window.__TS.log.slice(-8) }));
    ok(opened(k, got), `"${k.q}" → ${how === 'click' ? 'click' : '↓×' + (idx + 1) + ' Enter'} "${k.label}" opens ${k.id}`, { got, want: want[k.id], hit, items: items.map(x => x.id), st });
    if (how === 'click') console.log('    · hit=' + hit + ' events=' + JSON.stringify(st.log.map(x => x.ev + ':' + x.item + (x.conn === false ? '(detached)' : '') + '/' + x.shown)));
  }
}

/* ESTTPLBTN: the Estimates header — ＋ New estimate → 📋 Templates → ⋯ More; "Copy from a similar job" in ⋯ More */
if (!process.env.GC_NO_EST) {
  await go('estimates');
  await waitFor(c, () => !!document.querySelector('#gc-est3-list .hd [data-l="new"]'), null, 20000, 300);
  await sleep(2500);   /* patch X12 paints its bar every few seconds: give it the chance to put a button back */
  const hd = await c.ev(() => {
    const h = document.querySelector('#gc-est3-list .hd'); if (!h) return null;
    const bs = [].filter.call(h.querySelectorAll('button'), b => b.offsetParent);
    const t = h.querySelector('[data-l="tpl"]');
    const cs = e => { if (!e) return null; const s = getComputedStyle(e); return { bg: s.backgroundColor, col: s.color, bd: s.borderTopColor + ' ' + s.borderTopWidth, h: Math.round(e.getBoundingClientRect().height) }; };
    return { order: bs.map(b => b.textContent.trim()), tpl: cs(t), sim: !!document.querySelector('main .gcx12-simbtn') };
  });
  console.log('  · Estimates header: ' + JSON.stringify(hd));
  const ord = (hd && hd.order) || [];
  ok(ord.length === 3 && ord[0] === '＋ New estimate' && ord[1] === '📋 Templates' && ord[2] === '⋯ More', 'Estimates header: ＋ New estimate → 📋 Templates → ⋯ More', ord);
  ok(hd && !hd.sim && !ord.some(x => /similar job/i.test(x)), '"＋ From a similar job" is no longer on the header', hd);
  ok(hd && hd.tpl && hd.tpl.bg === 'rgb(255, 255, 255)' && hd.tpl.col === 'rgb(76, 29, 149)' && /rgb\(196, 181, 253\) 1px/.test(hd.tpl.bd), '📋 Templates is outlined (white, purple text, light-purple border — the old "From a similar job" look)', hd && hd.tpl);
  for (const [w, h] of [[1093, 987], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h }); await sleep(1500);
    const lay = await c.ev(() => { const h = document.querySelector('#gc-est3-list .hd'); if (!h) return null; const r = h.getBoundingClientRect();
      const bs = [].filter.call(h.querySelectorAll('button'), b => b.offsetParent).map(b => { const x = b.getBoundingClientRect(); return { t: b.textContent.trim(), l: Math.round(x.left), r: Math.round(x.right), top: Math.round(x.top), h: Math.round(x.height) }; });
      return { hdL: Math.round(r.left), hdR: Math.round(r.right), vw: innerWidth, docW: document.documentElement.scrollWidth, bs }; });
    const inside = lay && lay.bs.length === 3 && lay.bs.every(b => b.l >= lay.hdL - 1 && b.r <= lay.hdR + 1 && b.r <= lay.vw && b.h < 60);
    ok(!!inside && lay.docW <= lay.vw, `${w} px: the header wraps cleanly (all three buttons inside the header, none cut off or squashed, no side-scroll)`, lay);
  }
  await p.setViewportSize({ width: 1462, height: 987 }); await sleep(1200);
  await go('estimates'); await waitFor(c, () => !!document.querySelector('#gc-est3-list .hd [data-l="more"]'), null, 15000, 300);
  const mb = await p.locator('#gc-est3-list .hd [data-l="more"]').first().boundingBox().catch(() => null);
  if (mb) { await p.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2); await sleep(600); }
  const menu = await c.ev(() => { const m = document.getElementById('gc-est3-more'); if (!m) return null; const b = m.querySelector('button'); return { first: b && b.firstChild && b.firstChild.textContent.trim(), hint: b && b.querySelector('small') && b.querySelector('small').textContent, items: [].map.call(m.querySelectorAll('button'), x => x.textContent.trim().slice(0, 40)) }; });
  ok(!!menu && /^⧉ Copy from a similar job$/.test(menu.first || '') && menu.hint === "start a new estimate from an old one's lines", '⋯ More starts with "Copy from a similar job" + the hint "start a new estimate from an old one\'s lines"', menu);
  const cb = await p.locator('#gc-est3-more button[data-i="0"]').first().boundingBox().catch(() => null);
  if (cb) { await p.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2); await sleep(900); }
  const sim = await c.ev(() => { const all = [].slice.call(document.querySelectorAll('body *')).filter(e => e.offsetParent !== null && /Estimate from a similar job/.test(e.textContent || '') && e.children.length < 3); const sel = [].slice.call(document.querySelectorAll('select')).filter(s => s.offsetParent && /pick the job/.test(s.textContent || ''))[0];
    return { title: all.length ? all[0].textContent.trim().slice(0, 60) : '', jobs: sel ? sel.options.length - 1 : -1 }; });
  ok(/Estimate from a similar job/.test(sim.title) && sim.jobs > 0, 'it opens the same "＋ Estimate from a similar job" window as before (pick the job → closest past estimate)', sim);
  await p.keyboard.press('Escape'); await sleep(400);
  await c.ev(() => { [].slice.call(document.querySelectorAll('body > *')).filter(e => /Estimate from a similar job/.test(e.textContent || '') && getComputedStyle(e).position === 'fixed').forEach(e => e.remove()); });
  await go('estimates'); await waitFor(c, () => !!document.querySelector('#gc-est3-list .hd [data-l="tpl"]'), null, 15000, 300);
  const tb = await p.locator('#gc-est3-list .hd [data-l="tpl"]').first().boundingBox().catch(() => null);
  if (tb) { await p.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await sleep(2500); }
  const got = await view();
  ok(!!tb && got.v === 'templates' && got.h === want.templates.h, '📋 Templates (Estimates header) opens the same Templates view as 🔍 Search tabs → Templates', { got, want: want.templates });
}
const errs = c.errs.filter(e => !/ResizeObserver loop/.test(e));
ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
await c.b.close();
console.log((fail ? '✗ ' : '✓ ') + 'TABSEARCH: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
