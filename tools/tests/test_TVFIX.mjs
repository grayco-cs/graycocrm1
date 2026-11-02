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
//   • ⛳ Golf, 🌲 National parks (NPS photos, the park named), 📷 Office photos (the back office album; none yet → a hint, Blue);
//   • personal TV screens: ＋ New TV screen → its editor (link, photos, look, what it shows); photos added (3 test images through
//     the CRM's upload pipeline); Open → photos + clock and date + the ticker; its link #tv=<id> after sign-in; another
//     admin cannot open it; Delete asks first and takes its album.
//   • SHOTS (1920×1080): tvfix_admin.png (the TVs row, 1366×768), tvfix_blue.png, tvfix_white.png, tvfix_golf.png,
//     tvfix_parks.png, tvfix_officephotos.png, tvfix_personal.png, tvfix_personal_editor.png.
// Env: MIRROR, SHOTS (folder), GC_HARNESS, DAY.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import { pathToFileURL } from 'url';
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

/* three small test photos (solid-colour PNGs with a band), as a phone would hand them over */
function png(w, h, rgb, band){ const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3, c = Math.abs(y - h / 2) < h / 8 ? band : rgb; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; } }
  const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([l, td, cr]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; ih[10] = 0; ih[11] = 0; ih[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const PHOTOS = [png(640, 400, [46, 125, 50], [255, 213, 79]), png(640, 400, [21, 101, 192], [255, 255, 255]), png(640, 400, [183, 28, 28], [255, 236, 179])].map((b, i) => ({ name: 'family-' + (i + 1) + '.png', mimeType: 'image/png', buffer: b }));
const STORE = new Map();
async function device(name, w, h, html){
  const c = await H.computer(name, { build });
  await c.ctx.route(u => /\/storage\/v1\/object\//.test(String(u)), r => { const q = r.request(), k = new URL(q.url()).pathname.replace(/^.*\/object\/(public\/|authenticated\/|sign\/)?/, '');
    if (q.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (q.method() === 'POST' || q.method() === 'PUT') { STORE.set(k, q.postDataBuffer()); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Key: k }) }); }
    const b = STORE.get(k); return b ? r.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' }, body: b }) : r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' }); });
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
  /* anchored by the rows' own buttons (patch X10: data-a="goal" / "oc"), not by sibling positions other patches may change */
  const F = (a, b) => !!(a && b) && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const gb = document.querySelector('#gc-x10-admin [data-a="goal"]'), goalBar = gb && (gb.closest('.gcx10-bar') || gb.parentNode);
  const ob2 = document.querySelector('#gc-x10-admin [data-a="oc"]'), ocBar = ob2 && (ob2.closest('.gcx10-bar') || ob2.parentNode);
  const main = document.querySelector('main') ? document.querySelector('main').innerText : '';
  return { text: r.innerText.replace(/\s+/g, ' ').slice(0, 200), office: ob && ob.textContent, lobby: lb && lb.textContent,
    side: !!(ob && lb) && Math.abs(ob.getBoundingClientRect().top - lb.getBoundingClientRect().top) < 4 && lb.getBoundingClientRect().left > ob.getBoundingClientRect().right - 1,
    def: !!r.querySelector('[data-tvs-def]'), aboveOnCall: !ocBar || F(r, ocBar), inX10: !!r.closest('#gc-x10-admin'),
    goals: g ? { inputs: g.querySelectorAll('input[data-tg]').length, underGoal: !!goalBar && F(goalBar, g) && F(g, r) && !!g.closest('#gc-x10-admin') } : null,
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
  const hc = document.documentElement.classList, base = hc.contains('gc-otv-photo') ? [4, 8, 15] : hc.contains('gc-otv-golf') ? [12, 59, 38] : hc.contains('gc-otv-dark') ? [11, 22, 38] : [255, 255, 255];
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
/* ⛳ Golf's course photos are put in by tools/golf_photos.py (Commons, licences checked); with them the look must use them */
const HAS_GOLF = (() => { try { return JSON.parse(fs.readFileSync(path.join(build, 'img', 'tv', 'golf', 'golf.json'), 'utf8')).length >= 2; } catch (e) { return false; } })();
let SCREEN_ID = '';

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
  const th0 = await A.page().evaluate(() => { const b = document.querySelector('#gc-otv .ctl [data-tvs-theme]'), x = document.querySelector('#gc-otv .ctl [data-k="x"]');
    return { cls: document.documentElement.classList.contains('gc-otv-blue'), btn: b && b.textContent, beforeClose: !!b && b.nextElementSibling === x, logo: document.querySelector('#gc-otv .hd img').getAttribute('src') }; });
  ok(th0.cls && th0.btn === '🎨 🔵 Blue ▾' && th0.beforeClose && /portal-logo/.test(th0.logo), 'the TV opens 🔵 Blue by default; the 🎨 look menu is in its control bar (before Close); the logo for a dark screen', th0);
  const pick = async k => { await A.page().locator('#gc-otv [data-tvs-theme]').click(); await sleep(300); await A.page().locator('#gc-otv .gc-tvs-menu [data-tvs-th="' + k + '"]').click(); await sleep(900); };
  await A.page().locator('#gc-otv [data-tvs-theme]').click(); await sleep(300);
  const items = await A.page().evaluate(() => [...document.querySelectorAll('#gc-otv .gc-tvs-menu [data-tvs-th]')].map(b => b.textContent));
  ok(items.join('|') === '🔵 Blue|⚪ White|⛳ Golf|🌲 National parks|📷 Office photos', 'the 🎨 menu: Blue · White · Golf · National parks · Office photos', items);
  await A.page().locator('#gc-otv [data-tvs-theme]').click(); await sleep(300);
  for (const look of ['blue', 'white', 'golf', 'parks']) {
    if (look !== 'blue') await pick(look);
    if (look === 'white') { const w = await A.page().evaluate(() => ({ cls: document.documentElement.className, btn: document.querySelector('#gc-otv [data-tvs-theme]').textContent, ls: localStorage.getItem('gc_otv_theme'), open: !!document.getElementById('gc-otv'), logo: document.querySelector('#gc-otv .hd img').getAttribute('src') }));
      ok(!/gc-otv-dark/.test(w.cls) && w.btn === '🎨 ⚪ White ▾' && w.ls === '"white"' && w.open && /grayco-logo-wide/.test(w.logo), '🎨 → ⚪ White (kept on this computer); the TV stays open', w); }
    if (look === 'golf' && !HAS_GOLF) { await sleep(800);
      const gp = await A.page().evaluate(() => ({ golf: document.documentElement.classList.contains('gc-otv-golf'), photo: document.documentElement.classList.contains('gc-otv-photo'), stripes: /repeating-linear-gradient/.test(getComputedStyle(document.querySelector('#gc-otv .stg')).backgroundImage) }));
      console.log('    (no img/tv/golf/golf.json in this build yet — run tools/golf_photos.py; checking the plain green look)');
      ok(gp.golf && !gp.photo && !gp.stripes, '🎨 → ⛳ Golf with no course photos yet: the plain green look, no stripes', gp); }
    if (look === 'golf' && HAS_GOLF) { await sleep(2500);
      const gf = () => A.page().evaluate(() => { const on = document.querySelector('#gc-otv .gc-tvs-bg i.on'), st = getComputedStyle(document.querySelector('#gc-otv .stg'));
        return { golf: document.documentElement.classList.contains('gc-otv-golf'), photo: document.documentElement.classList.contains('gc-otv-photo'), bg: on ? on.style.backgroundImage : '', cap: (document.querySelector('#gc-otv .gc-tvs-bg .cap') || {}).textContent || '', stripes: /repeating-linear-gradient/.test(st.backgroundImage) }; });
      const g1 = await gf();
      ok(g1.golf && g1.photo && /\/img\/tv\/golf\/[a-z0-9-]+\.jpg/.test(g1.bg) && /^📍 .+ · photo: .+, (CC BY(-SA)? [0-9.]+|CC0|public domain)$/i.test(g1.cap) && !g1.stripes,
        '🎨 → ⛳ Golf: a famous course behind the numbers, the course + author + licence in the caption (' + g1.cap + '), no stripes', g1);
      await A.page().evaluate(() => window._gcOTV.el().__go('board')); await sleep(2800); const g2 = await gf();
      ok(g2.bg && g2.bg !== g1.bg && g2.cap !== g1.cap, '⛳ Golf: the next slide brings a different course (' + g2.cap + ')', { g1: g1.bg, g2: g2.bg });
      await A.page().evaluate(() => window._gcOTV.el().__go('goals')); await sleep(800); }
    if (look === 'parks') { await sleep(2500); const pk = await A.page().evaluate(() => { const on = document.querySelector('#gc-otv .gc-tvs-bg i.on'); return { photo: document.documentElement.classList.contains('gc-otv-photo'), bg: on ? on.style.backgroundImage : '', cap: (document.querySelector('#gc-otv .gc-tvs-bg .cap') || {}).textContent }; });
      ok(pk.photo && /\/img\/tv\/parks\/[a-z-]+\.jpg/.test(pk.bg) && /National Park · NPS photo/.test(pk.cap), '🎨 → 🌲 National parks: an NPS photo behind the numbers, the park named (' + pk.cap + ')', pk); }
    const bads = [], lows = [];
    for (const k of SL) { await A.page().evaluate(k => window._gcOTV.el().__go(k), k); await sleep(1000);
      const b = await A.page().evaluate(OVL); if (b.length) bads.push(k + ': ' + b.join('; '));
      const c = await A.page().evaluate(CONTRAST); if (c.low.length && c.low[0].r < 4.5) lows.push(k + ': ' + JSON.stringify(c.low.filter(x => x.r < 4.5)));
      if (k === 'goals' && W === 1920) await A.page().screenshot({ path: path.join(SHOTS, 'tvfix_' + look + '.png') }); }
    ok(!bads.length, W + '×' + Hh + ' ' + look + ': every slide — nothing overlaps or spills', bads);
    if (look !== 'white') ok(!lows.length, W + '×' + Hh + ' ' + look + ': every text ≥ 4.5 : 1 contrast', lows);
    else console.log('    white (OFFICETV\'s own look, unchanged) — text under 4.5 : 1: ' + (lows.length ? lows.join(' | ') : 'none'));
  }
  await pick('album'); await sleep(600);
  const al = await A.page().evaluate(() => ({ hint: (document.querySelector('#gc-otv .gc-tvs-hint') || {}).textContent || '', blue: document.documentElement.classList.contains('gc-otv-blue') }));
  ok(/Add photos in ⚙ Admin → 📺 TVs/.test(al.hint) && al.blue, '🎨 → 📷 Office photos with none yet: "add photos in ⚙ Admin → 📺 TVs", drawn Blue', al);
  await pick('white');
  await A.page().evaluate(() => window._gcOTV.close()); await sleep(300);
  await A.page().evaluate(() => window._gcOTV.open()); await sleep(800);
  ok(await A.page().evaluate(() => !document.documentElement.classList.contains('gc-otv-dark')), 'reopened: still ⚪ White on this computer');
  await pick('blue'); await closeTVs(A);
  if (W === 1920) {
    /* 📷 Office photos: the back office album, any admin */
    await A.page().locator(ROW + ' [data-tvs-scr="office"]').click();
    await H.waitFor(A, () => document.querySelector('#gc-tvs-ed [data-e="file"]') ? 1 : null, null, 15000, 300);
    await A.page().setInputFiles('#gc-tvs-ed [data-e="file"]', PHOTOS.slice(0, 2));
    const op = await H.waitFor(A, () => { const n = document.querySelectorAll('#gc-tvs-ed .ph .t').length; return n === 2 ? n : null; }, null, 30000, 400);
    const ov = (V('gc_tv_screens') || {}).screens || [], of = ov.find(x => x.id === 'office');
    ok(op === 2 && of && of.photos.length === 2 && of.photos.every(r => /^sb:crm-files\/[0-9a-f]{64}\.(jpg|png)$/.test(r)), '📷 Office photos: 2 photos added through the CRM\'s upload pipeline (crm-files refs in gc_kv gc_tv_screens)', of);
    await A.page().evaluate(() => document.querySelector('#gc-tvs-ed [data-e="x"]').click());
    await A.page().evaluate(() => { window._gcTVFIX.setTheme('album'); window._gcTVFIX.office(); }); await sleep(3000);
    const ob = await A.page().evaluate(() => { const on = document.querySelector('#gc-otv .gc-tvs-bg i.on'); return { photo: document.documentElement.classList.contains('gc-otv-photo'), bg: on ? on.style.backgroundImage : '', hint: !!document.querySelector('#gc-otv .gc-tvs-hint') }; });
    ok(ob.photo && /blob:/.test(ob.bg) && !ob.hint, 'the back office TV in 📷 Office photos: the album behind the numbers', ob);
    await A.page().screenshot({ path: path.join(SHOTS, 'tvfix_officephotos.png') });
    await A.page().evaluate(() => window._gcTVFIX.setTheme(null)); await closeTVs(A);
    /* a personal TV screen */
    A.prompts = ["Wesley's office"];
    await A.page().locator(ROW + ' [data-tvs-scr="new"]').click();
    await H.waitFor(A, () => document.querySelector('#gc-tvs-ed [data-e="link"]') ? 1 : null, null, 15000, 300);
    await A.page().setInputFiles('#gc-tvs-ed [data-e="file"]', PHOTOS);
    await H.waitFor(A, () => document.querySelectorAll('#gc-tvs-ed .ph .t img[src^="blob:"]').length === 3 ? 1 : null, null, 30000, 400);
    await A.page().screenshot({ path: path.join(SHOTS, 'tvfix_personal_editor.png') });
    const ps = ((V('gc_tv_screens') || {}).screens || []).find(x => x.name === "Wesley's office");
    const link = await A.page().evaluate(() => document.querySelector('#gc-tvs-ed [data-e="link"]').value);
    ok(ps && ps.owner === 'wjohnson@grayco-cs.com' && ps.photos.length === 3 && ps.mode === 'photos' && ps.ticker === true && link.endsWith('#tv=' + ps.id),
      '＋ New TV screen "Wesley\'s office": his, its own link (#tv=' + (ps && ps.id) + '), 3 photos, photos + clock + ticker by default', { ps, link });
    ok(await A.page().evaluate(() => !!document.querySelector('#gc-otv-lobbycard [data-tvs-scr^="s"]')), 'the screen is in the 📺 TVs row (🏠 Wesley\'s office)');
    await A.page().evaluate(() => document.querySelector('#gc-tvs-ed [data-e="open"]').click()); await sleep(3500);
    const pv = await A.page().evaluate(() => { const on = document.querySelector('#gc-otv .gc-tvs-bg i.on'), ck = document.querySelector('#gc-otv .gc-tvs-clock'), cs = e => e && getComputedStyle(e).display;
      return { only: document.documentElement.classList.contains('gc-otv-photosonly'), bg: on ? on.style.backgroundImage : '', clock: ck && ck.innerText.replace(/\s+/g, ' '), bd: cs(document.querySelector('#gc-otv .bd')), tk: cs(document.querySelector('#gc-otv .tk')), screen: window._gcTVFIX.state().screen }; });
    ok(pv.only && /blob:/.test(pv.bg) && /\d{1,2}:\d{2} (AM|PM)/.test(pv.clock || '') && /Wesley's office/.test(pv.clock || '') && pv.bd === 'none' && pv.tk !== 'none' && pv.screen === ps.id,
      'Open: his photos, the clock and date, the screen\'s name, the ticker; no back office slides', pv);
    await A.page().screenshot({ path: path.join(SHOTS, 'tvfix_personal.png') });
    const bads = await A.page().evaluate(() => { const ck = document.querySelector('#gc-otv .gc-tvs-clock').getBoundingClientRect(), tk = document.querySelector('#gc-otv .tk').getBoundingClientRect(), ft = document.querySelector('#gc-otv .ft').getBoundingClientRect(); return ck.bottom > Math.min(tk.top, ft.top) + 1 ? ['clock over the footer'] : []; });
    ok(!bads.length, 'the clock clears the footer and the ticker', bads);
    await closeTVs(A); await sleep(1500);
    ok(await A.page().evaluate(() => !window._gcTVFIX.state().screen && !document.documentElement.classList.contains('gc-otv-photosonly')), 'closed: back to the back office TV\'s look');
    await A.page().evaluate(id => window._gcTVFIX.screens.edit(id), ps.id); await sleep(800);
    await A.page().selectOption('#gc-tvs-ed [data-e="mode"]', 'office'); await sleep(1500);
    ok((((V('gc_tv_screens') || {}).screens || []).find(x => x.id === ps.id) || {}).mode === 'office', 'Shows → 📊 back office slides: saved');
    await A.page().evaluate(() => document.querySelector('#gc-tvs-ed [data-e="x"]').click());
    await A.page().evaluate(id => window._gcTVFIX.screens.open(id), ps.id); await sleep(2500);
    const pv2 = await A.page().evaluate(() => ({ only: document.documentElement.classList.contains('gc-otv-photosonly'), bd: getComputedStyle(document.querySelector('#gc-otv .bd')).display, photo: document.documentElement.classList.contains('gc-otv-photo') }));
    ok(!pv2.only && pv2.bd !== 'none' && pv2.photo, 'in back office slides mode: the slides on top of his photos', pv2);
    await closeTVs(A); await sleep(1200);
    SCREEN_ID = ps.id;
  }
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

console.log('— a personal screen\'s link: its owner, then another admin');
if (SCREEN_ID) {
  const A = await device('MYLINK', 1920, 1080); await signInAt(A, 'wjohnson@grayco-cs.com', 'https://app.local/index.html#tv=' + SCREEN_ID);
  const st = await H.waitFor(A, () => window._gcTVFIX && window._gcTVFIX.state().screen && document.getElementById('gc-otv') ? window._gcTVFIX.state() : null, null, 120000, 500);
  ok(st && st.screen === SCREEN_ID, 'crm.grayco-cs.com/#tv=' + SCREEN_ID + ' → his screen, straight after sign-in', st);
  await A.b.close();
  const N = await device('NICK', 1366, 768); await signInAt(N, 'nthomas@grayco-cs.com', 'https://app.local/index.html#tv=' + SCREEN_ID);
  await H.waitFor(N, () => (window._crm && (window._crm.projects || []).length > 100) || null, null, 120000, 500); await sleep(6000);
  const nk = await N.page().evaluate(id => { const r = window._gcTVFIX.screens.open(id); return { opened: !!document.getElementById('gc-otv'), screen: window._gcTVFIX.state().screen, toast: [...document.querySelectorAll('.gc-tvs-toast')].map(x => x.textContent).join(' | ') }; }, SCREEN_ID);
  ok(!nk.opened && !nk.screen && /someone else/.test(nk.toast), 'another admin (Nick): his link and _gcTVFIX.screens.open → refused, nothing shown', nk);
  await N.b.close();
  const D2 = await device('DEL', 1366, 768); await signInAt(D2, 'wjohnson@grayco-cs.com');
  await H.waitFor(D2, () => (window._crm && (window._crm.projects || []).length > 100) || null, null, 120000, 500);
  await D2.page().evaluate(() => window._setView('admin')); await waitRow(D2); await sleep(2500);
  await D2.page().locator('#gc-otv-lobbycard [data-tvs-scr="' + SCREEN_ID + '"]').click(); await sleep(800);
  D2.acceptConfirm = true; await D2.page().evaluate(() => document.querySelector('#gc-tvs-ed [data-e="del"]').click()); await sleep(2000);
  ok(!(((V('gc_tv_screens') || {}).screens || []).some(x => x.id === SCREEN_ID)) && D2.dialogs.some(d => /Delete the TV screen/.test(d)), 'Delete (asked first): the screen and its album are gone', D2.dialogs.slice(-2));
  await D2.b.close();
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
