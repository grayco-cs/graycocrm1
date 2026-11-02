// test_TVFIX.mjs <build-dir> — patch TVFIX: every "Office TV" entry point opens the NEW office TV; ⚙ Admin has one 📺 TVs bar
// (📺 Back office TV · 🖥 Front room (lobby) TV editor · 🏁 Team goals) however Admin is opened; 🧭 GrayCo Systems → The office
// has the same two tiles; the old navy scoreboard only when the new TV did not load (and then it is in the perf report).
//   • the owner signs in fresh at 1366×768 and 1920×1080, the role-app Desk comes up, he opens ⚙ Admin from the Desk's ☰ More →
//     All systems (as a person does) and from the left menu: the 📺 TVs bar is there, AUTO8's "Office TV scoreboard" is not;
//   • 📺 Back office TV → the new TV (#gc-otv), never #gc-a8-tv; 🖥 lobby editor → #gc-lob; 🏁 Save → gc_kv gc_tv_goals;
//   • _gcA8.tv(), the AUTO8 button handler, 🧭 Systems tiles, the #tv link → the new TV;
//   • OFFICETV broken on purpose (it throws while loading): the reason is caught, the old scoreboard is the fallback, and the
//     perf report says so;
//   • SHOT: tvfix_admin.png (the TVs bar, 1366×768).
// Env: MIRROR, SHOT, GC_HARNESS.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const { lobbyFn } = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'lobby_fn_mock.mjs')).href);
const build = process.argv[2] && path.resolve(process.argv[2]);
if (!build) { console.error('usage: node test_TVFIX.mjs <build-dir>'); process.exit(2); }
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOT = process.env.SHOT || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/tvfix_admin.png';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
H.resetCloud(); for (const r of rows) H.cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
H.cset('gc_tv_goals', { reviews: 5, jobs: 6, leads: 25, at: '2026-10-01T12:00:00Z', by: 'test' });
const V = k => { let v = H.cloud.get(k) && H.cloud.get(k).value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
const F = lobbyFn(build, H.cloud, tok => { const m = /^utok-(u-[a-z]+)-/.exec(tok); if (!m) return ''; return Object.keys(H.ACCOUNTS).find(k => H.ACCOUNTS[k].id === m[1]) || ''; });

async function device(name, w, h, html){
  const c = await H.computer(name, { build });
  await c.ctx.addInitScript(() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
  await c.ctx.route('**/.netlify/functions/lobby*', F.route);
  if (html) await c.ctx.route(u => /app\.local\/(index\.html)?$/.test(String(u)) || /app\.local\/index\.html#/.test(String(u)), r => r.fulfill({ body: html, contentType: 'text/html' }));
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
  const via = await p.evaluate(() => {
    const vis = e => e && e.getClientRects().length;
    const more = [...document.querySelectorAll('#gc-ra-dock button, [data-ra-a="more"], .gc-ra-hb')].find(b => vis(b) && /More/.test(b.textContent || ''));
    if (more) { more.click(); return 'more'; }
    return '';
  });
  if (via === 'more') {
    await sleep(800);
    const hit = await p.evaluate(() => { const b = [...document.querySelectorAll('[data-ra-a="nav"]')].find(x => /^\W*Admin\s*$/.test((x.textContent || '').trim())); if (b) { b.click(); return true; } return false; });
    if (hit) return 'Desk ☰ More → All systems → Admin';
  }
  const left = await p.evaluate(() => { const b = [...document.querySelectorAll('aside nav button')].find(x => /^\W*Admin\s*$/.test((x.innerText || x.textContent || '').trim())); if (b) { b.click(); return true; } return false; });
  return left ? 'left menu → Admin' : '';
}
const barInfo = c => c.page().evaluate(() => { const b = document.getElementById('gc-tvs-admin'); if (!b || !b.getClientRects().length) return null; const r = b.getBoundingClientRect();
  return { text: b.innerText.replace(/\s+/g, ' ').slice(0, 260), office: !!b.querySelector('[data-tvs="office"]'), lobby: !!b.querySelector('[data-tvs="lobby"]'), inputs: b.querySelectorAll('#gc-otv-goals input[data-tg]').length,
    goalsIds: document.querySelectorAll('#gc-otv-goals').length, lobbyIds: document.querySelectorAll('#gc-otv-lobbycard').length, oldText: /Office TV scoreboard/.test(document.querySelector('main') ? document.querySelector('main').innerText : ''),
    a8: document.getElementById('gc-a8-admin') ? document.getElementById('gc-a8-admin').innerText.replace(/\s+/g, ' ').slice(0, 120) : null, next: b.nextElementSibling ? b.nextElementSibling.id : null, w: Math.round(r.width) }; });

for (const [W, Hh] of [[1366, 768], [1920, 1080]]) {
  console.log('— the owner, fresh sign-in, ' + W + '×' + Hh);
  const A = await device('ADMIN' + W, W, Hh);
  await signInAt(A, 'wjohnson@grayco-cs.com');
  await H.waitFor(A, () => (window._crm && (window._crm.projects || []).length > 100) || null, null, 120000, 500);
  const desk = await H.waitFor(A, () => { const d = document.getElementById('gc-ra-dock') || document.querySelector('[id^="gc-ra-"]'); return d && d.getClientRects().length ? d.id : null; }, null, 30000, 500);
  console.log('    the role-app Desk: ' + desk);
  const st0 = await A.page().evaluate(() => ({ otv: !!window._gcOTV, tvfix: window._gcTVFIX && window._gcTVFIX.state(), a8: !!(window._gcA8 && window._gcA8.tv && window._gcA8.tv.__tvfix) }));
  ok(st0.otv && st0.tvfix && st0.tvfix.load === 'ok', 'the new office TV loaded (_gcOTV) on a fresh sign-in', st0);
  ok(st0.a8, '_gcA8.tv is re-pointed to the new TV', st0);
  const via = await openAdminFromDesk(A);
  const bar = await H.waitFor(A, () => { const b = document.getElementById('gc-tvs-admin'); return b && b.getClientRects().length ? 1 : null; }, null, 20000, 300) && await barInfo(A);
  ok(!!via && bar && bar.office && bar.lobby && bar.inputs === 3, '⚙ Admin (' + via + '): one 📺 TVs bar — 📺 Back office TV, 🖥 Front room (lobby) TV editor, 🏁 Team goals (3)', bar || await A.page().evaluate(() => ({ h1: [...document.querySelectorAll('main h1')].map(h => h.textContent + (h.getClientRects().length ? '' : ' (hidden)')), bar: !!document.getElementById('gc-tvs-admin'), tv: window._gcTVFIX && window._gcTVFIX.state(), desk: [...document.querySelectorAll('[id^="gc-ra"],[id^="gc-desk"]')].filter(e => e.getClientRects().length).map(e => e.id), paint: (() => { try { window._gcTVFIX.paint(); return 'ok ' + !!document.getElementById('gc-tvs-admin'); } catch (e) { return 'ERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]; } })(), canTV: window._gcTVFIX.canTV(), role: window._gcRP && window._gcRP.role() })));
  ok(bar && !bar.oldText && bar.goalsIds === 1 && bar.lobbyIds === 1, 'no old "Office TV scoreboard" bar, no second Team goals / Lobby card', bar);
  ok(bar && (!bar.a8 || (/Toolbox talk/.test(bar.a8) && bar.next === 'gc-a8-admin')), 'it sits where AUTO8\'s TV bar was (AUTO8 keeps 🦺 Toolbox talk / 🏗 Retainage)', bar);
  if (W === 1366) { await A.page().evaluate(() => document.getElementById('gc-tvs-admin').scrollIntoView({ block: 'center' })); await sleep(500);
    const r = await A.page().evaluate(() => { const b = document.getElementById('gc-tvs-admin').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
    await A.page().screenshot({ path: SHOT, clip: { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 60), width: Math.min(W - Math.max(0, r.x - 12), r.w + 24), height: Math.min(Hh, r.h + 140) } }); console.log('    shot: ' + SHOT); }
  /* the buttons, clicked */
  await A.page().locator('#gc-tvs-admin [data-tvs="office"]').click(); await sleep(1500);
  let t = await tvs(A); ok(t.nw && !t.old, '📺 Back office TV → the new office TV', t); await closeTVs(A); await sleep(400);
  await A.page().locator('#gc-tvs-admin [data-tvs="lobby"]').click();
  const ed = await H.waitFor(A, () => { const e = document.getElementById('gc-lob'); return e && e.querySelector('[data-tab]') ? 1 : null; }, null, 20000, 300);
  ok(!!ed, '🖥 Front room (lobby) TV editor → the lobby editor'); await closeTVs(A); await sleep(300);
  if (W === 1366) {
    await A.page().evaluate(() => { const i = document.querySelector('#gc-tvs-admin [data-tg="jobs"]'); i.value = '9'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await A.page().locator('#gc-tvs-admin [data-tvs="tg"]').click(); await sleep(1500);
    const g = V('gc_tv_goals'); ok(g && g.jobs === 9 && g.reviews === 5 && g.leads === 25, '🏁 Save goals → gc_kv gc_tv_goals (what the TV reads)', g);
  }
  /* every other entry point */
  await A.page().evaluate(() => window._gcA8.tv()); await sleep(800); t = await tvs(A); ok(t.nw && !t.old, '_gcA8.tv() → the new TV', t); await closeTVs(A);
  await A.page().evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-a8adm', 'tv'); document.body.appendChild(b); b.click(); b.remove(); }); await sleep(800);
  t = await tvs(A); ok(t.nw && !t.old, 'patch AUTO8\'s data-a8adm="tv" button (any copy of it) → the new TV', t); await closeTVs(A);
  if (W === 1366) {
    await A.page().evaluate(() => window._setView('systems'));
    const tiles = await H.waitFor(A, () => { const m = document.getElementById('gc-sys-sys'); if (!m) return null; const g = [...m.querySelectorAll('.grp')].find(x => /The office/.test(x.textContent)); const box = g && g.nextElementSibling; return box ? [...box.querySelectorAll('[data-k]')].map(b => b.getAttribute('data-k') + ':' + b.querySelector('b').textContent) : null; }, null, 20000, 400);
    ok(tiles && tiles.includes('tv:Back office TV') && tiles.includes('lobbyed:Front room (lobby) TV editor'), '🧭 GrayCo Systems → The office: 📺 Back office TV + 🖥 Front room (lobby) TV editor', tiles);
    const lob = await A.page().evaluate(() => !!document.querySelector('#gc-sys-sys [data-k="lobby"]')); ok(lob, '… and 📺 Lobby TV stays under Website & marketing');
    await A.page().locator('#gc-sys-sys [data-k="tv"]').click(); await sleep(1000); t = await tvs(A); ok(t.nw && !t.old, 'Systems tile 📺 Back office TV → the new TV', t); await closeTVs(A);
    await A.page().locator('#gc-sys-sys [data-k="lobbyed"]').click(); const ed2 = await H.waitFor(A, () => document.getElementById('gc-lob') ? 1 : null, null, 15000, 300); ok(!!ed2, 'Systems tile 🖥 lobby editor → the lobby editor'); await closeTVs(A);
    /* ⚙ Admin from the left menu too (the classic way) */
    await A.page().evaluate(() => window._setView('dashboard')); await sleep(1500);
    await A.page().evaluate(() => { const b = [...document.querySelectorAll('aside nav button')].find(x => /^\W*Admin\s*$/.test((x.innerText || x.textContent || '').trim())); if (b) b.click(); else window._setView('admin'); });
    const bar2 = await H.waitFor(A, () => { const b = document.getElementById('gc-tvs-admin'); return b && b.getClientRects().length ? 1 : null; }, null, 20000, 300) && await barInfo(A);
    ok(bar2 && bar2.office && bar2.lobby && bar2.inputs === 3 && !bar2.oldText, '⚙ Admin from the left menu: the same 📺 TVs bar', bar2);
    /* the old slideshow, if anything still opens it while the new TV is loaded, is swapped for the new one */
    await A.page().evaluate(() => window._gcA8.tvClassic()); await sleep(2500); t = await tvs(A);
    ok(t.nw && !t.old, 'the old slideshow opened from an unknown place → replaced by the new TV', t); await closeTVs(A);
  }
  const pe = A.errs.filter(e => /PAGEERROR/.test(e)); ok(!pe.length, 'no page errors', pe.slice(0, 4));
  await A.b.close();
}

console.log('— the #tv link (fresh sign-in)');
{ const A = await device('TVLINK', 1920, 1080); await signInAt(A, 'wjohnson@grayco-cs.com', 'https://app.local/index.html#tv');
  const st = await H.waitFor(A, () => window._gcOTV && window._gcOTV.state(), null, 120000, 500); const t = await tvs(A);
  ok(st && st.kiosk && t.nw && !t.old, '#tv → the new TV (kiosk)', { st: st && st.kiosk, t }); await A.b.close(); }

console.log('— OFFICETV broken on purpose (throws while it loads)');
{ const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8').replace("if (window.__GC_PATCH_OFFICETV__) return; window.__GC_PATCH_OFFICETV__ = true;", "if (window.__GC_PATCH_OFFICETV__) return; window.__GC_PATCH_OFFICETV__ = true; throw new Error('TVFIX test: OFFICETV broken');");
  const A = await device('BROKEN', 1366, 768, html); await signInAt(A, 'wjohnson@grayco-cs.com');
  await H.waitFor(A, () => (window._crm && (window._crm.projects || []).length > 100) || null, null, 120000, 500); await sleep(1500);
  const st = await A.page().evaluate(() => ({ otv: !!window._gcOTV, s: window._gcTVFIX && window._gcTVFIX.state() }));
  ok(!st.otv && st.s && /TVFIX test: OFFICETV broken/.test(st.s.load), 'the reason is caught: ' + (st.s && st.s.load), st);
  await openAdminFromDesk(A); const bar = await H.waitFor(A, () => document.getElementById('gc-tvs-admin') ? 1 : null, null, 20000, 300) && await barInfo(A);
  ok(bar && bar.office && bar.lobby, 'the 📺 TVs bar is still in ⚙ Admin', bar);
  await A.page().locator('#gc-tvs-admin [data-tvs="office"]').click(); await sleep(1500);
  const t = await tvs(A); ok(t.old && !t.nw, 'fallback: the old scoreboard (the new TV is not loaded)', t);
  const rep = await A.page().evaluate(() => JSON.stringify((window._gcPerfRep && window._gcPerfRep.report().net) || {}));
  ok(/TVFIX: the new office TV \(OFFICETV\) did not load: error: (Uncaught Error: )?TVFIX test/.test(rep) && /TVFIX: the old scoreboard was shown/.test(rep), 'the perf report says so', rep.slice(0, 400));
  await A.b.close(); }

console.log('\nTVFIX: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
