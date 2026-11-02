// test_TVFIX.mjs <build-dir> — patch TVFIX (owner 11/02):
//   • every "Office TV" entry point opens the NEW office TV: ⚙ Admin, _gcA8.tv, patch AUTO8's button, 🧭 Systems tiles, #tv;
//   • ⚙ Admin, opened from the role-app Desk (☰ More → All systems → Admin, as a person does) and from the left menu, at
//     1366×768 and 1920×1080 on a fresh sign-in: the "📺 TVs · back office and front room screens" row in the Admin list
//     (where OFFICETV's 📺 Lobby TV row was, above 📟 On call) with 📺 Back office TV and 🖥 Front room (lobby) TV side by
//     side; 🏁 Team goals still right under 🎯 Company goal; no "Office TV scoreboard" anywhere;
//   • 🔵 Blue / ⚪ White: Blue by default; the switch in the TV's control bar (kept on this computer); the admin's default for
//     every TV (gc_kv gc_tv_goals.theme, kept when the team goals are saved); in both looks, every slide at 1366×768 and
//     1920×1080: nothing overlaps or spills, and the text contrast (Blue: ≥ 4.5 : 1 everywhere);
//   • OFFICETV broken on purpose (throws while loading): the reason is caught, the TVs row is still there, the old scoreboard
//     is the fallback, the perf report says so.
//   • SHOTS: tvfix_admin.png (the TVs row, 1366×768), tvfix_blue.png / tvfix_white.png (🎯 Goals, 1920×1080).
// Env: MIRROR, SHOTS (folder), GC_HARNESS, DAY.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const { lobbyFn } = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'lobby_fn_mock.mjs')).href);
const build = process.argv[2] && path.resolve(process.argv[2]);
if (!build) { console.error('usage: node test_TVFIX.mjs <build-dir>'); process.exit(2); }
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/';
const DAY = process.env.DAY || '2026-10-30T19:00:00Z';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
H.resetCloud(); for (const r of rows) H.cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
H.cset('gc_tv_goals', { reviews: 5, jobs: 6, leads: 25, at: '2026-10-01T12:00:00Z', by: 'test' });
const V = k => { let v = H.cloud.get(k) && H.cloud.get(k).value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
const F = lobbyFn(build, H.cloud, tok => { const m = /^utok-(u-[a-z]+)-/.exec(tok); if (!m) return ''; return Object.keys(H.ACCOUNTS).find(k => H.ACCOUNTS[k].id === m[1]) || ''; });

async function device(name, w, h, html){
  const c = await H.computer(name, { build });
  await c.ctx.addInitScript(([day]) => {   /* the page's clock on the mirror's day, so "this month" has data (timers untouched) */
    const OFF = Date.parse(day) - Date.now(), _D = Date;
    function D2(...a){ if (!(this instanceof D2)) return new _D(_D.now() + OFF).toString(); return a.length ? new _D(...a) : new _D(_D.now() + OFF); }
    D2.prototype = _D.prototype; D2.now = () => _D.now() + OFF; D2.parse = _D.parse; D2.UTC = _D.UTC; window.Date = D2;
    try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
  }, [DAY]);
  await c.ctx.route('**/.netlify/functions/x10*', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (b.action === 'goal-get') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, goal: { goal: 2000000, basis: 'collected', year: '2026', by: 'wjohnson@grayco-cs.com', at: '2026-01-02T00:00:00Z' }, canEdit: true }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }); });
  await c.ctx.route('**/.netlify/functions/lobby*', F.route);
  if (html) await c.ctx.route(u => /app\.local\/(index\.html)?$/.test(String(u)), r => r.fulfill({ body: html, contentType: 'text/html' }));
  await c.page().setViewportSize({ width: w, height: h });
  return c;
}
async function signInAt(c, email, url){
  const p = c.page(); await p.goto(url || 'https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 60000 }); await sleep(1500);
  for (let i = 0; i < 5; i++) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(H.ACCOUNTS[email].pw); await sleep(300); if ((await p.locator('#gc-auth-email').inputValue()) === email) break; }
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
}
const tvs = c => c.page().evaluate(() => ({ nw: !!document.getElementById('gc-otv'), old: !!document.getElementById('gc-a8-tv') }));
const closeTVs = c => c.page().evaluate(() => { try { window._gcOTV && window._gcOTV.close(); } catch (e) {} const o = document.getElementById('gc-a8-tv'); if (o) { try { o.__close ? o.__close() : o.remove(); } catch (e) { o.remove(); } } const l = document.getElementById('gc-lob'); if (l) l.remove(); });
/* ⚙ Admin the way a person opens it from the role-app Desk: ☰ More → All systems → Admin; else the left menu */
async function openAdminFromDesk(c){
  const p = c.page();
  const via = await p.evaluate(() => { const vis = e => e && e.getClientRects().length;
    const more = [...document.querySelectorAll('#gc-ra-dock button, [data-ra-a="more"], .gc-ra-hb')].find(b => vis(b) && /More/.test(b.textContent || ''));
    if (more) { more.click(); return 'more'; } return ''; });
  if (via === 'more') { await sleep(800);
    const hit = await p.evaluate(() => { const b = [...document.querySelectorAll('[data-ra-a="nav"]')].find(x => /^\W*Admin\s*$/.test((x.textContent || '').trim())); if (b) { b.click(); return true; } return false; });
    if (hit) return 'Desk ☰ More → All systems → Admin'; }
  const left = await p.evaluate(() => { const b = [...document.querySelectorAll('aside nav button')].find(x => /^\W*Admin\s*$/.test((x.innerText || x.textContent || '').trim())); if (b) { b.click(); return true; } return false; });
  return left ? 'left menu → Admin' : '';
}
const ROW = '#gc-otv-lobbycard.gc-tvs';
const rowInfo = c => c.page().evaluate(ROW => { const r = document.querySelector(ROW); if (!r || !r.getClientRects().length) return null;
  const ob = r.querySelector('[data-tvs-b="office"]'), lb = r.querySelector('[data-tvs-b="lobby"]'), g = document.getElementById('gc-otv-goals');
  const bars = r.parentNode ? [...r.parentNode.children] : [], oc = bars.findIndex(x => /On call/.test(x.textContent || ''));
  const main = document.querySelector('main') ? document.querySelector('main').innerText : '';
  return { text: r.innerText.replace(/\s+/g, ' ').slice(0, 200), office: ob && ob.textContent, lobby: lb && lb.textContent,
    side: !!(ob && lb) && Math.abs(ob.getBoundingClientRect().top - lb.getBoundingClientRect().top) < 4 && lb.getBoundingClientRect().left > ob.getBoundingClientRect().right - 1,
    def: !!r.querySelector('[data-tvs-def]'), aboveOnCall: oc < 0 || bars.indexOf(r) < oc, inX10: !!r.closest('#gc-x10-admin'),
    goals: g ? { inputs: g.querySelectorAll('input[data-tg]').length, underGoal: !!g.previousElementSibling && /Company goal/.test(g.previousElementSibling.innerText) } : null,
    rows: document.querySelectorAll('#gc-otv-lobbycard').length, goalRows: document.querySelectorAll('#gc-otv-goals').length,
    oldText: /Office TV scoreboard/.test(main), oldBtn: !!document.querySelector('[data-a8adm="tv"]'), a8: document.getElementById('gc-a8-admin') ? document.getElementById('gc-a8-admin').innerText.replace(/\s+/g, ' ').slice(0, 80) : null }; }, ROW);
const waitRow = c => H.waitFor(c, ROW => { const r = document.querySelector(ROW); return r && r.getClientRects().length ? 1 : null; }, ROW, 20000, 250);

/* in the TV: nothing overlapping / spilling (OFFICETV's check), and the text contrast */
const OVL = () => { const tv = document.getElementById('gc-otv'), bd = tv.querySelector('.bd').getBoundingClientRect(), ft = tv.querySelector('.ft').getBoundingClientRect(), bad = [];
  tv.querySelectorAll('.bd .sl.in *').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return; if (r.bottom > bd.bottom + 1 || r.bottom > ft.top + 1) bad.push((e.className || e.tagName) + ' bottom'); if (r.right > bd.right + 1) bad.push((e.className || e.tagName) + ' right'); });
  tv.querySelectorAll('.bd .sl.in .cd').forEach(c => { if (c.scrollHeight > c.clientHeight + 2) bad.push('card overflows: ' + c.innerText.slice(0, 40)); });
  tv.querySelectorAll('.bd .sl.in *').forEach(e => { const cs = getComputedStyle(e); if ((cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 2) bad.push('text cut off: ' + e.innerText.slice(0, 40)); });
  const ctl = tv.querySelector('.ctl').getBoundingClientRect(); if (ctl.right > innerWidth + 1) bad.push('control bar off the screen');
  return bad.slice(0, 5); };
const CONTRAST = () => {
  const P = s => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const a = m[1].split(/[,/ ]+/).filter(Boolean).map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; };
  const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const blue = document.documentElement.classList.contains('gc-otv-blue'), base = blue ? [11, 22, 38] : [255, 255, 255];
  const bgOf = e => { const stack = []; for (let x = e; x && x.id !== 'gc-otv'; x = x.parentElement) { const c = P(getComputedStyle(x).backgroundColor); if (c && c[3] > 0) stack.push(c); if (c && c[3] >= 1) break; if (/\bstg\b/.test(x.className)) break; }
    let col = base.slice(); for (let i = stack.length - 1; i >= 0; i--) { const c = stack[i]; col = [0, 1, 2].map(k => c[k] * c[3] + col[k] * (1 - c[3])); } return col; };
  const tv = document.getElementById('gc-otv'), out = [];
  tv.querySelectorAll('.hd *, .bd .sl.in *, .ft .dots *, .ft .ctl button, .ft .note').forEach(e => {
    const own = [...e.childNodes].filter(n => n.nodeType === 3 && /[A-Za-z0-9$%]/.test(n.textContent)).map(n => n.textContent.trim()).join(' ');
    if (!own || !e.getClientRects().length) return;
    let op = 1; for (let x = e; x && x !== tv; x = x.parentElement) op *= +getComputedStyle(x).opacity; if (op < .9) return;
    const fg = P(getComputedStyle(e).color), bg = bgOf(e); if (!fg) return;
    const f = [0, 1, 2].map(k => fg[k] * fg[3] + bg[k] * (1 - fg[3])), l1 = L(f), l2 = L(bg), r = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
    out.push({ t: own.slice(0, 24), c: (e.className || e.tagName) + '', r: Math.round(r * 10) / 10 }); });
  out.sort((a, b) => a.r - b.r); return { n: out.length, low: out.slice(0, 6) };
};
const SL = ['goals', 'board', 'score', 'week'];

for (const [W, Hh] of [[1366, 768], [1920, 1080]]) {
  console.log('— the owner, fresh sign-in, ' + W + '×' + Hh);
  const A = await device('ADMIN' + W, W, Hh);
  await signInAt(A, 'wjohnson@grayco-cs.com');
  await H.waitFor(A, () => (window._crm && (window._crm.projects || []).length > 100) || null, null, 120000, 500);
  const desk = await H.waitFor(A, () => { const d = document.getElementById('gc-ra-dock'); return d && d.getClientRects().length ? d.id : null; }, null, 30000, 500);
  console.log('    the role-app Desk: ' + desk);
  const st0 = await A.page().evaluate(() => ({ otv: !!window._gcOTV, tvfix: window._gcTVFIX && window._gcTVFIX.state(), a8: !!(window._gcA8 && window._gcA8.tv && window._gcA8.tv.__tvfix) }));
  ok(st0.otv && st0.tvfix && st0.tvfix.load === 'ok' && st0.a8, 'the new office TV loaded (_gcOTV); _gcA8.tv re-pointed to it', st0);
  const via = await openAdminFromDesk(A);
  const row = (await waitRow(A)) && await rowInfo(A);
  ok(!!via && row && /📺 TVs · back office and front room screens/.test(row.text) && row.office === '📺 Back office TV' && row.lobby === '🖥 Front room (lobby) TV' && row.side && row.def,
    '⚙ Admin (' + via + '): "📺 TVs · back office and front room screens" — 📺 Back office TV and 🖥 Front room (lobby) TV side by side, + the TV look', row || await A.page().evaluate(() => window._gcTVFIX.state()));
  ok(row && row.inX10 && row.aboveOnCall && row.rows === 1, 'the row is in the Admin list, above 📟 On call (where 📺 Lobby TV was), once', row);
  ok(row && row.goals && row.goals.inputs === 3 && row.goals.underGoal && row.goalRows === 1, '🏁 Team goals stays right under 🎯 Company goal', row);
  ok(row && !row.oldText && !row.oldBtn && (!row.a8 || /Toolbox talk/.test(row.a8)), 'no "Office TV scoreboard" bar (AUTO8 keeps 🦺 Toolbox talk / 🏗 Retainage)', row);
  if (W === 1366) { await A.page().evaluate(() => document.getElementById('gc-otv-lobbycard').scrollIntoView({ block: 'center' })); await sleep(500);
    const r = await A.page().evaluate(() => { const a = document.getElementById('gc-otv-goals').getBoundingClientRect(), b = document.getElementById('gc-otv-lobbycard').getBoundingClientRect(); return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.right, b.right) - Math.min(a.x, b.x), h: Math.max(a.bottom, b.bottom) - Math.min(a.y, b.y) }; });
    const y0 = Math.max(0, r.y - 70); await A.page().screenshot({ path: path.join(SHOTS, 'tvfix_admin.png'), clip: { x: Math.max(0, r.x - 12), y: y0, width: Math.min(W - Math.max(0, r.x - 12), r.w + 24), height: Math.min(Hh - y0, r.h + 160) } }); }
  await A.page().locator(ROW + ' [data-tvs-b="office"]').click(); await sleep(1500);
  let t = await tvs(A); ok(t.nw && !t.old, '📺 Back office TV → the new office TV', t); await closeTVs(A); await sleep(400);
  await A.page().locator(ROW + ' [data-tvs-b="lobby"]').click();
  ok(!!(await H.waitFor(A, () => { const e = document.getElementById('gc-lob'); return e && e.querySelector('[data-tab]') ? 1 : null; }, null, 20000, 300)), '🖥 Front room (lobby) TV → the lobby editor'); await closeTVs(A); await sleep(300);
  if (W === 1366) {
    /* the admin's default look for every TV, then the team goals saved (the look is kept) */
    await A.page().selectOption(ROW + ' [data-tvs-def]', 'white'); await sleep(1500);
    ok(V('gc_tv_goals') && V('gc_tv_goals').theme === 'white' && V('gc_tv_goals').jobs === 6, 'TV look → ⚪ White: saved for every TV (gc_kv gc_tv_goals.theme), the goals kept', V('gc_tv_goals'));
    await A.page().evaluate(() => { const i = document.querySelector('#gc-otv-goals [data-tg="jobs"]'); i.value = '9'; });
    await A.page().locator('#gc-otv-goals [data-otv="tg"]').click(); await sleep(1500);
    const g = V('gc_tv_goals'); ok(g && g.jobs === 9 && g.reviews === 5 && g.leads === 25 && g.theme === 'white', '🏁 Team goals Save → saved, and the TV look kept', g);
    await A.page().evaluate(() => { window._gcTVFIX.setTheme(null); window._gcTVFIX.office(); }); await sleep(1000);
    ok(await A.page().evaluate(() => !document.documentElement.classList.contains('gc-otv-blue') && /White/.test(document.querySelector('#gc-otv [data-tvs-theme]').textContent)), 'a TV with no choice of its own opens in the admin\'s default (⚪ White)');
    await closeTVs(A); await A.page().selectOption(ROW + ' [data-tvs-def]', 'blue'); await sleep(1500);
    ok(V('gc_tv_goals').theme === 'blue' && V('gc_tv_goals').jobs === 9, 'TV look → 🔵 Blue for every TV', V('gc_tv_goals'));
  }
  /* every other entry point */
  await A.page().evaluate(() => window._gcA8.tv()); await sleep(800); t = await tvs(A); ok(t.nw && !t.old, '_gcA8.tv() → the new TV', t); await closeTVs(A);
  await A.page().evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-a8adm', 'tv'); document.body.appendChild(b); b.click(); b.remove(); }); await sleep(800);
  t = await tvs(A); ok(t.nw && !t.old, 'patch AUTO8\'s data-a8adm="tv" button (any copy of it) → the new TV', t); await closeTVs(A);
  /* 🔵 Blue / ⚪ White in the TV */
  await A.page().evaluate(() => { window._gcTVFIX.setTheme(null); window._gcOTV.open(); window._gcOTV.el().__set({ paused: true, money: true }); }); await sleep(1200);
  const th0 = await A.page().evaluate(() => { const b = document.querySelector('#gc-otv .ctl [data-tvs-theme]'), x = document.querySelector('#gc-otv .ctl [data-k="x"]'), st = getComputedStyle(document.querySelector('#gc-otv .stg'));
    return { cls: document.documentElement.classList.contains('gc-otv-blue'), btn: b && b.textContent, beforeClose: !!b && b.nextElementSibling === x, bg: st.backgroundColor, logo: document.querySelector('#gc-otv .hd img').getAttribute('src') }; });
  ok(th0.cls && th0.btn === '🔵 Blue' && th0.beforeClose && /portal-logo/.test(th0.logo), 'the TV opens 🔵 Blue by default; the 🔵 / ⚪ switch is in its control bar (before Close); the logo for a dark screen', th0);
  for (const look of ['blue', 'white']) {
    if (look === 'white') { await A.page().locator('#gc-otv [data-tvs-theme]').click(); await sleep(500);
      const w = await A.page().evaluate(() => ({ cls: document.documentElement.classList.contains('gc-otv-blue'), btn: document.querySelector('#gc-otv [data-tvs-theme]').textContent, ls: localStorage.getItem('gc_otv_theme'), open: !!document.getElementById('gc-otv'), logo: document.querySelector('#gc-otv .hd img').getAttribute('src') }));
      ok(!w.cls && w.btn === '⚪ White' && w.ls === '"white"' && w.open && /grayco-logo-wide/.test(w.logo), 'the switch → ⚪ White (kept on this computer); the TV stays open', w); }
    const bads = [], lows = [];
    for (const k of SL) { await A.page().evaluate(k => window._gcOTV.el().__go(k), k); await sleep(1000);
      const b = await A.page().evaluate(OVL); if (b.length) bads.push(k + ': ' + b.join('; '));
      const c = await A.page().evaluate(CONTRAST); if (c.low.length && c.low[0].r < 4.5) lows.push(k + ': ' + JSON.stringify(c.low.filter(x => x.r < 4.5)));
      if (look === 'blue' && k === 'goals' && W === 1920) await A.page().screenshot({ path: path.join(SHOTS, 'tvfix_blue.png') });
      if (look === 'white' && k === 'goals' && W === 1920) await A.page().screenshot({ path: path.join(SHOTS, 'tvfix_white.png') }); }
    ok(!bads.length, W + '×' + Hh + ' ' + look + ': every slide — nothing overlaps or spills', bads);
    if (look === 'blue') ok(!lows.length, W + '×' + Hh + ' blue: every text ≥ 4.5 : 1 contrast', lows);
    else console.log('    white (OFFICETV\'s own look, unchanged) — text under 4.5 : 1: ' + (lows.length ? lows.join(' | ') : 'none'));
  }
  await A.page().evaluate(() => window._gcOTV.close()); await sleep(300);
  await A.page().evaluate(() => window._gcOTV.open()); await sleep(600);
  ok(await A.page().evaluate(() => !document.documentElement.classList.contains('gc-otv-blue')), 'reopened: still ⚪ White on this computer');
  await A.page().locator('#gc-otv [data-tvs-theme]').click(); await sleep(300); await closeTVs(A);
  if (W === 1366) {
    await A.page().evaluate(() => window._setView('systems'));
    const tiles = await H.waitFor(A, () => { const m = document.getElementById('gc-sys-sys'); if (!m) return null; const g = [...m.querySelectorAll('.grp')].find(x => /The office/.test(x.textContent)); const box = g && g.nextElementSibling; return box ? [...box.querySelectorAll('[data-k]')].map(b => b.getAttribute('data-k') + ':' + b.querySelector('b').textContent) : null; }, null, 20000, 400);
    ok(tiles && tiles.includes('tv:Back office TV') && tiles.includes('lobbyed:Front room (lobby) TV'), '🧭 GrayCo Systems → The office: 📺 Back office TV + 🖥 Front room (lobby) TV', tiles);
    ok(await A.page().evaluate(() => !!document.querySelector('#gc-sys-sys [data-k="lobby"]')), '… and 📺 Lobby TV stays under Website & marketing');
    await A.page().locator('#gc-sys-sys [data-k="tv"]').click(); await sleep(1000); t = await tvs(A); ok(t.nw && !t.old, 'Systems tile 📺 Back office TV → the new TV', t); await closeTVs(A);
    await A.page().locator('#gc-sys-sys [data-k="lobbyed"]').click(); ok(!!(await H.waitFor(A, () => document.getElementById('gc-lob') ? 1 : null, null, 15000, 300)), 'Systems tile 🖥 Front room (lobby) TV → the lobby editor'); await closeTVs(A);
    await A.page().evaluate(() => window._setView('dashboard')); await sleep(1500);
    await A.page().evaluate(() => { const b = [...document.querySelectorAll('aside nav button')].find(x => /^\W*Admin\s*$/.test((x.innerText || x.textContent || '').trim())); if (b) b.click(); else window._setView('admin'); });
    const row2 = (await waitRow(A)) && await rowInfo(A);
    ok(row2 && row2.side && row2.inX10 && row2.rows === 1 && !row2.oldText, '⚙ Admin from the left menu: the same 📺 TVs row', row2);
    await A.page().evaluate(() => window._gcA8.tvClassic()); await sleep(2500); t = await tvs(A);
    ok(t.nw && !t.old, 'the old slideshow opened from an unknown place → replaced by the new TV', t); await closeTVs(A);
  }
  const pe = A.errs.filter(e => /PAGEERROR/.test(e)); ok(!pe.length, 'no page errors', pe.slice(0, 4));
  await A.b.close();
}

console.log('— the #tv link (fresh sign-in)');
{ const A = await device('TVLINK', 1920, 1080); await signInAt(A, 'wjohnson@grayco-cs.com', 'https://app.local/index.html#tv');
  const st = await H.waitFor(A, () => window._gcOTV && window._gcOTV.state(), null, 120000, 500); const t = await tvs(A);
  const blue = await A.page().evaluate(() => document.documentElement.classList.contains('gc-otv-blue'));
  ok(st && st.kiosk && t.nw && !t.old && blue, '#tv → the new TV (kiosk), 🔵 Blue', { st: st && st.kiosk, t, blue }); await A.b.close(); }

console.log('— OFFICETV broken on purpose (throws while it loads)');
{ const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8').replace("if (window.__GC_PATCH_OFFICETV__) return; window.__GC_PATCH_OFFICETV__ = true;", "if (window.__GC_PATCH_OFFICETV__) return; window.__GC_PATCH_OFFICETV__ = true; throw new Error('TVFIX test: OFFICETV broken');");
  const A = await device('BROKEN', 1366, 768, html); await signInAt(A, 'wjohnson@grayco-cs.com');
  await H.waitFor(A, () => (window._crm && (window._crm.projects || []).length > 100) || null, null, 120000, 500); await sleep(1500);
  const st = await A.page().evaluate(() => ({ otv: !!window._gcOTV, s: window._gcTVFIX && window._gcTVFIX.state() }));
  ok(!st.otv && st.s && /TVFIX test: OFFICETV broken/.test(st.s.load), 'the reason is caught: ' + (st.s && st.s.load), st);
  await openAdminFromDesk(A); const row = (await waitRow(A)) && await rowInfo(A);
  ok(row && row.side && row.goals && row.goals.inputs === 3, 'the 📺 TVs row (+ 🏁 Team goals) is still in ⚙ Admin', row);
  await A.page().locator(ROW + ' [data-tvs-b="office"]').click(); await sleep(1500);
  const t = await tvs(A); ok(t.old && !t.nw, 'fallback: the old scoreboard (the new TV is not loaded)', t);
  const rep = await A.page().evaluate(() => JSON.stringify((window._gcPerfRep && window._gcPerfRep.report().net) || {}));
  ok(/TVFIX: the new office TV \(OFFICETV\) did not load: error: (Uncaught Error: )?TVFIX test/.test(rep) && /TVFIX: the old scoreboard was shown/.test(rep), 'the perf report says so', rep.slice(0, 400));
  await A.b.close(); }

console.log('\nTVFIX: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
