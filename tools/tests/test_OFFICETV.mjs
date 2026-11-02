// test_OFFICETV.mjs <build-dir> — patch OFFICETV: the 📺 Office TV and the 📺 Lobby TV editor, on the real-data mirror.
//   • crm.grayco-cs.com/#tv: the owner signs in from the sign-in screen and the TV opens by itself (kiosk), Wake Lock asked;
//   • every slide (🎯 Goals, 🏆 PM leaderboard month + quarter, 📊 Scoreboard, 🏗 This week) draws with no page errors;
//   • it rotates by itself; ⏸ / Space pauses it; "$" off → no dollar amount anywhere on the TV;
//   • no customer name or street address from the mirror anywhere in the TV DOM (every slide, $ on and off);
//   • the office sign-in opens it; a PM gets no TV (not by _gcA8.tv(), not by #tv, no tile); the old entry points open it;
//   • ⚙ Admin: 🏁 Team goals inputs next to 🎯 Company goal; the 📺 Lobby TV editor (playlist + live preview) for admin and
//     office, Offers only for the Marketing Manager (her offers wait for an admin's approval).
//   • SHOTS (1920×1080): officetv_<slide>_moneyoff.png ×4, officetv_goals_moneyon.png, officetv_board_moneyon.png,
//     officetv_board_quarter.png, officetv_goals_1366.png, lobby_editor.png, lobby_editor_library.png, lobby_editor_offers.png.
// The page clock is set to the mirror's day (2026-10-30, 2 PM Central) so "this month" is the month the data is from (DAY=).
// The company goal is not in the mirror (it lives on the server): a sample $2,000,000 goal is served (GOAL=).
// Env: MIRROR, SHOTS, GC_HARNESS, DAY, GOAL.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const { lobbyFn } = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'lobby_fn_mock.mjs')).href);
const build = process.argv[2] && path.resolve(process.argv[2]);
if (!build) { console.error('usage: node test_OFFICETV.mjs <build-dir>'); process.exit(2); }
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/officetv_shots/';
const DAY = process.env.DAY || '2026-10-30T19:00:00Z', GOAL = +(process.env.GOAL || 2000000);
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const sleep = H.sleep;
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
function load(){ H.resetCloud(); for (const r of rows) H.cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at }); }
load();
const V = k => { let v = H.cloud.get(k) && H.cloud.get(k).value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
const NAMES = new Set(), STREETS = new Set();
const addN = n => { n = String(n || '').trim().replace(/\s+/g, ' '); if (n.split(' ').length >= 2 && n.length >= 6 && !/grayco|llc|inc\b|church|school|apartments|city of|county/i.test(n)) NAMES.add(n.toLowerCase()); };
const addS = a => { const st = String(a || '').split(',')[0].trim(); if (/^\d+\s+\S+/.test(st) && st.length >= 8) STREETS.add(st.toLowerCase()); };
(V('projects') || []).forEach(p => { if (p) { addN(p.client); addS(p.address); } }); (V('customers') || []).forEach(c => { if (c) { addN(c.name); addS(c.address); } });
(V('leads') || []).forEach(l => { if (l) { addN(l.client); addS(l.address); } });
const staff = new Set((V('users') || []).map(u => String(u.name || '').trim().toLowerCase()));
for (const n of [...NAMES]) if (staff.has(n)) NAMES.delete(n);
console.log('mirror: ' + (V('projects') || []).length + ' jobs; looking for ' + NAMES.size + ' customer names and ' + STREETS.size + ' street addresses');
function leaks(t){ const x = String(t || '').toLowerCase(), o = []; for (const n of NAMES) if (x.includes(n)) o.push(n); for (const s of STREETS) if (x.includes(s)) o.push(s); return o; }
H.cset('gc_tv_goals', { reviews: 5, jobs: 6, leads: 25, at: '2026-10-01T12:00:00Z', by: 'test' });
/* accounts: the owner (admin), the office, a PM, the Marketing Manager */
H.ACCOUNTS['sbiffle@grayco-cs.com'] = H.ACCOUNTS['sbiffle@grayco-cs.com'] || { pw: 'Correct-Horse-7', id: 'u-s', role: 'staff' };
H.ACCOUNTS['mkt.demo@grayco-cs.com'] = { pw: 'Correct-Horse-45', id: 'u-m', role: 'staff' };
const users = V('users') || []; if (!users.find(u => /mkt\.demo/.test(u.email))) users.push({ id: 'u-mkt', name: 'Malcolm Demo', email: 'mkt.demo@grayco-cs.com', role: 'Marketing Manager', active: true }); H.cset('users', users);
const F = lobbyFn(build, H.cloud, tok => { const m = /^utok-(u-[a-z]+)-/.exec(tok); if (!m) return ''; return Object.keys(H.ACCOUNTS).find(k => H.ACCOUNTS[k].id === m[1]) || ''; });

async function device(name, w, h){
  const c = await H.computer(name, { build });
  await c.ctx.addInitScript(([day]) => {   /* the page's clock on the mirror's day (timers untouched) */
    const OFF = Date.parse(day) - Date.now(), _D = Date;
    function D2(...a){ if (!(this instanceof D2)) return new _D(_D.now() + OFF).toString(); return a.length ? new _D(...a) : new _D(_D.now() + OFF); }
    D2.prototype = _D.prototype; D2.now = () => _D.now() + OFF; D2.parse = _D.parse; D2.UTC = _D.UTC; window.Date = D2;
    try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
    try { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => { window.__wake = (window.__wake || 0) + 1; return Promise.resolve({ release(){ return Promise.resolve(); }, addEventListener(){} }); } } }); } catch (e) {}
  }, [DAY]);
  await c.ctx.route('**/.netlify/functions/x10*', r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (b.action === 'goal-get') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, goal: { goal: GOAL, basis: 'collected', year: '2026', by: 'wjohnson@grayco-cs.com', at: '2026-01-02T00:00:00Z' }, canEdit: true }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }); });
  await c.ctx.route('**/.netlify/functions/lobby*', F.route);
  await c.page().setViewportSize({ width: w || 1920, height: h || 1080 });
  return c;
}
async function signInAt(c, email, url){
  const p = c.page(); await p.goto(url || 'https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 60000 }); await sleep(1500);
  for (let i = 0; i < 5; i++) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(H.ACCOUNTS[email].pw); await sleep(300); if ((await p.locator('#gc-auth-email').inputValue()) === email) break; }
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
}
const tvText = c => c.page().evaluate(() => { const e = document.getElementById('gc-otv'); return e ? e.innerText : ''; });
const state = c => c.page().evaluate(() => window._gcOTV && window._gcOTV.state());

console.log('— the owner opens crm.grayco-cs.com/#tv (1920×1080)');
const A = await device('ADMIN');
await signInAt(A, 'wjohnson@grayco-cs.com', 'https://app.local/index.html#tv');
let st = await H.waitFor(A, () => window._gcOTV && window._gcOTV.state(), null, 120000, 500);
ok(st && st.kiosk, '#tv: the TV opened by itself after the sign-in (kiosk)', st);
ok(await A.page().evaluate(() => (window.__wake || 0) > 0), 'Screen Wake Lock asked for');
ok(await A.page().evaluate(() => /#tv$/.test(location.hash)), 'the address keeps #tv (a reload comes back to the TV)');
await H.waitFor(A, () => (window._crm && (window._crm.projects || []).length > 100) || null, null, 60000, 500);
await A.page().evaluate(() => { const e = window._gcOTV.el(); e.__set({ paused: true, money: true, period: 'month' }); });
await sleep(1500);
const SL = ['goals', 'board', 'score', 'week'];
const errs0 = A.errs.length;
async function shot(c, k, file){ await c.page().evaluate(k => window._gcOTV.el().__go(k), k); await sleep(1300); const t = await tvText(c); const lk = leaks(t); if (lk.length) ok(false, file + ': customer data on the TV', lk.slice(0, 5)); await c.page().screenshot({ path: path.join(SHOTS, file) }); return t; }
const T = {};
for (const k of ['goals', 'board']) T[k + '_on'] = await shot(A, k, 'officetv_' + k + '_moneyon.png');
await A.page().evaluate(() => window._gcOTV.el().__set({ money: false }));
for (const k of SL) T[k + '_off'] = await shot(A, k, 'officetv_' + k + '_moneyoff.png');
await A.page().evaluate(() => window._gcOTV.el().__set({ money: true, period: 'quarter' }));
T.board_q = await shot(A, 'board', 'officetv_board_quarter.png');
T.score_on = await shot(A, 'score', 'officetv_score_moneyon.png');
T.week_on = await shot(A, 'week', 'officetv_week_moneyon.png');
await A.page().evaluate(() => window._gcOTV.el().__set({ period: 'month' }));
ok(A.errs.length === errs0, 'every slide draws with no page errors (4 slides, $ on / off, month / quarter)', A.errs.slice(errs0, errs0 + 4));
ok(/On pace|Behind by/.test(T.goals_on) && /revenue goal/i.test(T.goals_on) && /Team goals/i.test(T.goals_on), 'Goals: the ring, on pace / behind, team goals');
ok(/\$[\d.,]+[KM]?/.test(T.goals_on) && /\$[\d.,]+[KM]?/.test(T.score_on), '$ on: dollar amounts shown');
const money = ['goals_off', 'board_off', 'score_off', 'week_off'].filter(k => /\$\s?\d/.test(T[k]));
ok(money.length === 0, '$ off: no dollar amount anywhere on the TV', money.map(k => k + ': ' + (T[k].match(/.{0,30}\$\s?\d.{0,20}/) || [''])[0]));
ok(/%/.test(T.goals_off), '$ off: the goal as % instead');
ok(/PM leaderboard|leads the|fresh month/i.test(T.board_on) && /Score 0–100|Score:/.test(T.board_on), 'Leaderboard: ranked rows + the formula in small print');
ok(!/spend|spending/i.test(T.board_on + T.board_q), 'the leaderboard never ranks spending');
const brd = await A.page().evaluate(() => window._gcOTV.data('board'));
console.log('    leaderboard (this month): ' + brd.rows.map(r => r.name + ' ' + r.score + ' [jobs ' + r.jobs + ', $' + Math.round(r.usd) + ', rv ' + r.rv + ', punch ' + r.punch + ', logs ' + r.logs + (r.margin != null ? ', margin ' + Math.round(r.margin) + '%' : '') + ']').join(' · ') + ' — measures used: ' + brd.used.join(','));
ok(brd.rows.length >= 2, 'one row per PM (' + brd.rows.map(r => r.name).join(', ') + ')');
/* the live ticker: a different look per slide, CSS-transform crawl, a breaking banner per new event */
const LOOK = { goals: 'espn', board: 'board', score: 'stock', week: 'news' };
for (const k of SL) { await A.page().evaluate(k => window._gcOTV.el().__go(k), k); await sleep(700);
  const tk = await A.page().evaluate(() => { const t = document.querySelector('#gc-otv .tk'); const tr = t.querySelector('.trk'); const an = document.getAnimations().filter(a => a.effect && a.effect.target === tr);
    return { cls: t.className, items: tr.querySelectorAll('.it').length, tab: t.querySelector('.tab').textContent, transform: an.length > 0 && an[0].effect.getKeyframes().every(f => 'transform' in f), text: t.innerText }; });
  ok(tk.cls.includes(LOOK[k]) && tk.items > 0 && tk.transform, 'ticker on ' + k + ': the "' + LOOK[k] + '" look (' + tk.tab + ', ' + tk.items / 2 + ' items), a CSS transform crawl', tk);
  ok(!leaks(tk.text).length, 'ticker on ' + k + ': no customer name / address', leaks(tk.text)); }
const cust = (V('projects') || []).find(p => p && /^[A-Za-z]+ [A-Za-z]+$/.test(String(p.client || '').trim()) && /^\d+ /.test(String(p.address || '')));
const b0 = (await state(A)).breaking;
await A.page().evaluate(c => { window._crm.projects.push({ id: 'PTVTEST', status: 'Active', type: 'Commercial TI', autoPO: 'Z999', name: c.client + ' build-out', client: c.client, address: c.address, contract: 48000, contractSignedAt: new Date().toISOString(), pm: 'Steven Biffle' }); window._gcOTV.el().__go('goals'); window._gcOTV.el().__poll(); }, { client: cust.client, address: cust.address });
await sleep(1200);
let bs = await state(A); const bTxt = await A.page().evaluate(() => document.querySelector('#gc-otv .brk.on') ? document.querySelector('#gc-otv .brk').innerText : '');
await A.page().screenshot({ path: path.join(SHOTS, 'officetv_breaking.png') });
ok(bs.breaking === b0 + 1 && /CONTRACT SIGNED/.test(bTxt) && /Z999/.test(bTxt), 'a new signed contract → one breaking banner ("' + bTxt.replace(/\s+/g, ' ').slice(0, 70) + '")', bs.lastBreak);
ok(!bTxt.toLowerCase().includes(cust.client.toLowerCase()) && !leaks(bTxt).length, 'the banner names the job by type + number, never the customer');
await A.page().evaluate(() => window._gcOTV.el().__poll()); await sleep(300);
ok((await state(A)).breaking === b0 + 1, 'the same event never makes a second banner');
await sleep(9000);
ok(await A.page().evaluate(() => !document.querySelector('#gc-otv .brk.on') && /Z999/.test(document.querySelector('#gc-otv .tk').innerText)), 'after ~8 s the banner goes and the event is in the crawl');
await A.page().evaluate(() => { window._crm.projects = window._crm.projects.filter(p => p.id !== 'PTVTEST'); });
const pf = (await state(A)).perf; ok(pf.max < 120, 'no long work: the TV\'s longest step ' + pf.max + ' ms (' + pf.at + ')', pf);
/* rotation + pause */
await A.page().evaluate(() => window._gcOTV.el().__set({ paused: false, iv: 15 }));
let s0 = (await state(A)).slide; await sleep(16500); let s1 = (await state(A)).slide;
ok(s0 !== s1, 'it rotates by itself (15 s here; 20 s by default): ' + s0 + ' → ' + s1);
await A.page().keyboard.press('Space'); await sleep(300);
st = await state(A); ok(!st.playing, 'Space pauses it', st);
s0 = st.slide; await sleep(16500); s1 = (await state(A)).slide;
ok(s0 === s1, 'paused: it stays on ' + s0);
await A.page().keyboard.press('Space'); await sleep(300); ok((await state(A)).playing, 'Space again plays');
await A.page().evaluate(() => window._gcOTV.el().__set({ iv: 20, paused: true }));
/* every slide, DOM check for customer data ($ on, quarter, …) */
const all = Object.values(T).join('\n'); ok(leaks(all).length === 0, 'no customer name or address from the mirror anywhere in the TV DOM (all slides, $ on/off)', leaks(all).slice(0, 5));
/* close → the #tv comes off */
await A.page().evaluate(() => window._gcOTV.close()); await sleep(500);
ok(await A.page().evaluate(() => !document.getElementById('gc-otv') && !/#tv$/.test(location.hash)), 'Close: the TV goes and #tv comes off');
await sleep(2500); ok(await A.page().evaluate(() => !document.getElementById('gc-otv')), 'closed stays closed (the #tv link does not reopen it)');
ok(await A.page().evaluate(() => { window._gcA8.tv(); return !!document.getElementById('gc-otv'); }), 'the old entry point (_gcA8.tv — ⚙ Admin / 🧭 Systems) opens the new TV');
await A.page().evaluate(() => window._gcOTV.close());
/* ⚙ Admin: Team goals + Lobby TV cards */
await A.page().evaluate(() => { try { window._setView('admin'); } catch (e) {} });
await sleep(3000); console.log('    admin debug: ' + await A.page().evaluate(() => { try { window._gcOTV._adm(); } catch (e) { return 'ERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]; } return 'ran; goals=' + !!document.getElementById('gc-otv-goals') + ' box=' + !!document.getElementById('gc-x10-admin'); }));
/* the order by the rows' own buttons (patch X10: data-a="goal" / "oc"), not adjacency; with patch TVFIX the 📺 Lobby TV card is the
   "📺 TVs" row (📺 Back office TV · 🖥 Front room (lobby) TV). Waited for: a stand-in drawn before X10's card box exists moves in. */
const ORDER = () => { const F = (a, b) => !!(a && b) && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const g = document.getElementById('gc-otv-goals'), l = document.getElementById('gc-otv-lobbycard'), x = document.getElementById('gc-x10-admin');
  const gb = x && x.querySelector('[data-a="goal"]'), goal = gb && (gb.closest('.gcx10-bar') || gb.parentNode), ob = x && x.querySelector('[data-a="oc"]'), oc = ob && (ob.closest('.gcx10-bar') || ob.parentNode);
  if (!g || !l) return null;
  const tvs = !!l.querySelector('[data-tvs-b="office"]') && !!l.querySelector('[data-tvs-b="lobby"]'), lob = !!l.querySelector('[data-otv="lobby"]');
  return { g: g.innerText.slice(0, 120), inputs: g.querySelectorAll('input').length, card: tvs ? 'TVs row' : lob ? 'Lobby TV card' : '?',
    near: !!x && x.contains(g) && x.contains(l) && F(goal, g) && F(g, l) && (!oc || F(l, oc)) && (tvs || lob) }; };
const cards = await H.waitFor(A, ORDER => { const r = (0, eval)('(' + ORDER + ')')(); return r && r.near ? r : null; }, ORDER.toString(), 30000, 500) || await A.page().evaluate(ORDER => (0, eval)('(' + ORDER + ')')(), ORDER.toString());
ok(cards && cards.inputs === 3 && cards.near, '⚙ Admin: 🎯 Company goal → 🏁 Team goals (3 inputs) → the ' + (cards && cards.card) + ' → 📟 On call', cards || await A.page().evaluate(() => ({ h1: [...document.querySelectorAll('main h1')].map(h => h.textContent).slice(0, 4), x10: !!document.getElementById('gc-x10-admin'), view: localStorage.getItem('grayco_view') })));
await A.page().screenshot({ path: path.join(SHOTS, 'admin_goal_cards.png') });
/* the lobby editor (admin) */
await A.page().evaluate(() => window._gcLobbyAdmin.open());
const ed = await H.waitFor(A, () => { const e = document.getElementById('gc-lob'); return e && e.querySelector('.it') ? { n: e.querySelectorAll('.it').length, tabs: [...e.querySelectorAll('[data-tab]')].map(b => b.textContent) } : null; }, null, 30000, 300);
ok(ed && ed.n === 8 && ed.tabs.length === 3, 'Lobby editor (admin): the default playlist of 8 + Playlist / Offers / Lobby link', ed);
await H.waitFor(A, () => { const f = document.querySelector('#gc-lob [data-if]'); try { return f && f.contentWindow.__lobby && f.contentWindow.__lobby.state().n > 0 ? 1 : null; } catch (e) { return null; } }, null, 20000, 300);
ok(await A.page().evaluate(() => { const f = document.querySelector('#gc-lob [data-if]'); return f.contentWindow.__lobby.state().type === 'welcome'; }), 'the live preview shows the selected slide (from the function\'s preview answer)');
await A.page().evaluate(() => { const it = document.querySelectorAll('#gc-lob .it')[3]; it.click(); });
await sleep(1800); await A.page().screenshot({ path: path.join(SHOTS, 'lobby_editor.png') });
await A.page().evaluate(() => document.querySelector('#gc-lob [data-a="lib"]').click()); await sleep(500);
await A.page().screenshot({ path: path.join(SHOTS, 'lobby_editor_library.png') });
await A.page().evaluate(() => document.querySelector('#gc-lob [data-add="commaint"]').click()); await sleep(300);
ok(await A.page().evaluate(() => document.querySelectorAll('#gc-lob .it').length === 9), 'add a slide from the library');
await A.page().evaluate(() => document.querySelector('#gc-lob [data-a="save"]').click()); await sleep(1500);
const saved = V('gc_lobby'); ok(saved && saved.slides.length === 9 && saved.slides[8].type === 'commaint', 'Save writes the playlist (gc_kv gc_lobby)', saved && saved.slides.length);
await A.page().evaluate(() => document.querySelector('#gc-lob [data-tab="link"]').click()); await sleep(300);
await A.page().evaluate(() => document.querySelector('#gc-lob [data-a="newlink"]').click()); await sleep(1500);
const acc = V('gc_lobby_access'); ok(acc && acc.on && /^[A-Za-z0-9_-]{43}$/.test(acc.token), 'Lobby link: on, with a long random code (32 bytes)', acc && { on: acc.on, len: (acc.token || '').length });
const linkTxt = await A.page().evaluate(() => (document.querySelector('#gc-lob [data-link]') || {}).value || '');
ok(linkTxt.endsWith('/lobby.html#t=' + acc.token), 'the link shown: /lobby.html#t=…');
await A.page().evaluate(() => document.querySelector('#gc-lob [data-tab="offers"]').click()); await sleep(400);
await A.page().evaluate(() => { const c = document.querySelector('#gc-lob [data-src="coupon"]'); c.click(); }); await sleep(300);
await A.page().evaluate(() => document.querySelector('#gc-lob [data-a="saveoffers"]').click()); await sleep(1200);
await A.page().screenshot({ path: path.join(SHOTS, 'lobby_editor_offers.png') });
const offs = V('gc_lobby_offers'); const cpn = offs && Object.values(offs.offers || {}).find(o => o.src === 'coupon');
ok(cpn && cpn.on && !cpn.pending, 'Offers: the $100 coupon switched onto the lobby (an admin: no approval needed)', cpn);
await A.page().evaluate(() => { document.querySelector('#gc-lob [data-tab="link"]').click(); });
await sleep(300);
A.acceptConfirm = true;
await A.page().evaluate(() => document.querySelector('#gc-lob [data-a="off"]').click()); await sleep(1500);
ok(V('gc_lobby_access') && !V('gc_lobby_access').on && !V('gc_lobby_access').token, 'Turn the lobby off: the code is gone');
/* a 1366×768 TV */
await A.page().evaluate(() => { const e = document.getElementById('gc-lob'); if (e) e.remove(); });
await A.page().setViewportSize({ width: 1366, height: 768 });
await A.page().evaluate(() => { window._gcOTV.open(); window._gcOTV.el().__set({ paused: true, money: true }); window._gcOTV.el().__go('goals'); }); await sleep(1500);
const fit = await A.page().evaluate(() => { const s = document.querySelector('#gc-otv .stg').getBoundingClientRect(); return { w: Math.round(s.width), h: Math.round(s.height), sx: document.documentElement.scrollWidth, sy: document.documentElement.scrollHeight, ov: getComputedStyle(document.documentElement).overflow }; });
ok(Math.abs(fit.w - 1366) <= 1 && Math.abs(fit.h - 768) <= 1 && fit.ov === 'hidden', '1366×768: the whole TV scales to the screen, no scrolling', fit);
const OVL = () => { const tv = document.getElementById('gc-otv'), bd = tv.querySelector('.bd').getBoundingClientRect(), ft = tv.querySelector('.ft').getBoundingClientRect(), bad = [];
  tv.querySelectorAll('.bd .sl.in *').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return; if (r.bottom > bd.bottom + 1 || r.bottom > ft.top + 1) bad.push((e.className || e.tagName) + ' bottom ' + Math.round(r.bottom) + ' > ' + Math.round(Math.min(bd.bottom, ft.top))); if (r.right > bd.right + 1) bad.push((e.className || e.tagName) + ' right'); });
  tv.querySelectorAll('.bd .sl.in .cd').forEach(c => { if (c.scrollHeight > c.clientHeight + 2) bad.push('card overflows: ' + c.innerText.slice(0, 40)); });
  tv.querySelectorAll('.bd .sl.in .cd').forEach(c => { const cr = c.getBoundingClientRect(); c.querySelectorAll('*').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > cr.right + 1) bad.push('spills out of its card: ' + (e.innerText || e.className).slice(0, 30)); }); });
  tv.querySelectorAll('.bd .sl.in *').forEach(e => { const cs = getComputedStyle(e); if ((cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 2) bad.push('text cut off: ' + e.innerText.slice(0, 40)); });
  return bad.slice(0, 5); };
for (const k of SL) for (const m of [true, false]) { await A.page().evaluate(([k, m]) => { window._gcOTV.el().__set({ money: m }); window._gcOTV.el().__go(k); }, [k, m]); await sleep(1000);
  const bad = await A.page().evaluate(OVL); ok(!bad.length, '1366×768 ' + k + ' ($ ' + (m ? 'on' : 'off') + '): nothing overlaps or spills', bad);
  if (m) await A.page().screenshot({ path: path.join(SHOTS, 'officetv_' + k + '_1366.png') }); }
await A.page().setViewportSize({ width: 1920, height: 1080 });
for (const k of SL) { await A.page().evaluate(k => { window._gcOTV.el().__set({ money: true }); window._gcOTV.el().__go(k); }, k); await sleep(900); const bad = await A.page().evaluate(OVL); ok(!bad.length, '1920×1080 ' + k + ': nothing overlaps or spills', bad); }
await A.page().evaluate(() => window._gcOTV.el().__go('goals'));
await A.page().setViewportSize({ width: 3840, height: 2160 }); await sleep(600);
const fit4 = await A.page().evaluate(() => { const s = document.querySelector('#gc-otv .stg').getBoundingClientRect(); return { w: Math.round(s.width), h: Math.round(s.height) }; });
ok(Math.abs(fit4.w - 3840) <= 1 && Math.abs(fit4.h - 2160) <= 1, '3840×2160: scales up', fit4);
await A.b.close();

console.log('— the office sign-in');
const O = await device('OFFICE');
await signInAt(O, 'office@grayco-cs.com');
await H.waitFor(O, () => (window._crm && (window._crm.projects || []).length > 100 && window._gcOTV && window._gcRP && window._gcRP.role()) || null, null, 120000, 500);
const orole = await O.page().evaluate(() => window._gcRP.role());
ok(await O.page().evaluate(() => { window._gcOTV.open(); return !!document.getElementById('gc-otv'); }), 'office (' + orole + '): the TV opens');
await O.page().evaluate(() => window._gcOTV.close());
ok(await O.page().evaluate(() => { window._gcLobbyAdmin.open(); return new Promise(r => setTimeout(() => { const e = document.getElementById('gc-lob'); r(!!e && !!e.querySelector('[data-tab="play"]') && !e.querySelector('[data-tab="link"]')); }, 2500)); }), 'office: the lobby playlist editor (no lobby-link tab — that is the admin\'s)');
await O.b.close();

console.log('— a PM: no TV');
const P = await device('PM');
await signInAt(P, 'sbiffle@grayco-cs.com', 'https://app.local/index.html#tv');
await H.waitFor(P, () => (window._crm && (window._crm.projects || []).length > 100 && window._gcRP && window._gcRP.role()) || null, null, 120000, 500);
await sleep(4000);
const pm = await P.page().evaluate(() => ({ role: window._gcRP.role(), allowed: window._gcOTV.allowed(), opened: !!document.getElementById('gc-otv'),
  viaA8: (window._gcA8.tv(), !!document.getElementById('gc-otv')), viaApi: (window._gcOTV.open(), !!document.getElementById('gc-otv')), hash: location.hash, lobby: (window._gcLobbyAdmin.open(), !!document.getElementById('gc-lob')) }));
ok(pm.role && !pm.allowed && !pm.opened && !pm.viaA8 && !pm.viaApi, 'PM (' + pm.role + '): no TV — not by #tv, not by _gcA8.tv(), not by _gcOTV.open()', pm);
ok(!pm.lobby, 'PM: no lobby editor');
await P.b.close();

console.log('— the Marketing Manager: offers only, waiting for approval');
const M = await device('MKT');
await signInAt(M, 'mkt.demo@grayco-cs.com');
await H.waitFor(M, () => (window._gcLobbyAdmin && window._gcIsMM && window._gcIsMM()) || null, null, 120000, 500);
const mm = await M.page().evaluate(() => new Promise(r => { window._gcLobbyAdmin.open(); setTimeout(() => { const e = document.getElementById('gc-lob'); r({ open: !!e, tabs: e ? [...e.querySelectorAll('[data-tab]')].map(b => b.getAttribute('data-tab')) : [], tv: window._gcOTV.allowed(), mm: window._gcIsMM(), role: window._gcRP && window._gcRP.role(), toast: [...document.querySelectorAll('.gc-otv-toast')].map(x => x.textContent) }); }, 2500); }));
if (!mm.open) console.log('    MKT errs: ' + JSON.stringify(M.errs.slice(0, 4)));
ok(mm.open && mm.tabs.join() === 'offers' && !mm.tv, 'Marketing Manager: the Offers tab only (no playlist, no link, no office TV)', mm);
if (mm.open) {
  await M.page().evaluate(() => document.querySelector('#gc-lob [data-a="newoffer"]').click()); await sleep(300);
  await M.page().evaluate(() => { const c = [...document.querySelectorAll('#gc-lob [data-oid]')].find(x => !x.querySelector('[data-o="h"]').value); const h = c.querySelector('[data-o="h"]'); h.value = 'Free gutter check with any roof inspection'; h.dispatchEvent(new Event('change', { bubbles: true })); const on = c.querySelector('[data-oon]'); on.click(); });
  await M.page().evaluate(() => document.querySelector('#gc-lob [data-a="saveoffers"]').click()); await sleep(1500);
  const mo = Object.values((V('gc_lobby_offers') || {}).offers || {}).find(o => /gutter check/.test(o.h || ''));
  ok(mo && mo.on && mo.pending === true, 'her offer is saved waiting for an admin\'s approval (marketing approval rule)', mo);
  H.cset('gc_lobby_access', { on: true, token: 'Q'.repeat(43), at: '2026-10-30T20:00:00Z' }); F.mod._test.reset();
  const r = await F.call('GET', { 'x-lobby-token': 'Q'.repeat(43) });
  ok(r.status === 200 && !r.json.offers.some(o => /gutter check/.test(o.h)), 'lobby.js does not serve it until it is approved');
}
await M.b.close();
console.log('\nOFFICETV: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
