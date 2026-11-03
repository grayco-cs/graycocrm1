// test_TVPHOTO.mjs <build-dir> — patch TVPHOTO (owner 11/03: "every photo on office tv should change with the screen changing"):
//   back office TV (#tv), 🌲 National parks look, company music playing: over 8 screen changes the background photo changes
//   every time, never the one just shown, no repeats within one pass of the set; the music player (#gc-tvm-p) is the same
//   node throughout and still playing. YouTube's API is stubbed as in test_TVMUSIC. Env: MIRROR, GC_HARNESS.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2] && path.resolve(process.argv[2]);
if (!build) { console.error('usage: node test_TVPHOTO.mjs <build-dir>'); process.exit(2); }
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
H.resetCloud(); for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) H.cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
H.cset('gc_tv_goals', { reviews: 5, jobs: 6, leads: 25, music: 'https://www.youtube.com/watch?v=jfKfPfyJRdk', theme: 'parks', at: '2026-11-01T12:00:00Z', by: 'test' });
const YT_STUB = `(function(){ var R = window.__yt = { made: [] };
window.YT = { PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }, Player: function(el, o){
  var me = this, f = document.createElement('iframe'), t0 = 0, at = 0; f.src = 'https://www.youtube.com/embed/' + (o.videoId || 'videoseries') + '?stub=1';
  el.parentNode.replaceChild(f, el); R.made.push(o.videoId || '');
  function emit(s){ try { o.events.onStateChange({ target: me, data: s }); } catch (e) {} }
  me.getIframe = function(){ return f; };
  me.playVideo = function(){ if (!navigator.userActivation.hasBeenActive) { emit(-1); return; } if (!t0) t0 = Date.now(); emit(1); };
  me.pauseVideo = function(){ at = me.getCurrentTime(); t0 = 0; emit(2); };
  me.getCurrentTime = function(){ return t0 ? at + (Date.now() - t0) / 1000 : at; }; me.getDuration = function(){ return 600; };
  me.getPlaylistIndex = function(){ return 0; }; me.nextVideo = function(){}; me.setVolume = function(){}; me.setLoop = function(){}; me.seekTo = function(x){ at = x; };
  me.getVideoData = function(){ return { isLive: false }; }; me.destroy = function(){ f.remove(); };
  setTimeout(function(){ o.events.onReady({ target: me }); }, 30);
} };
setTimeout(function(){ if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady(); }, 10); })();`;
const c = await H.computer('TVPHOTO', { build }), p = c.page();
await c.ctx.route(u => /^https:\/\/(www\.youtube-nocookie\.com|www\.youtube\.com\/embed)/.test(String(u)), r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body style="background:#000"></body></html>' }));
await c.ctx.route('https://www.youtube.com/iframe_api', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: YT_STUB }));
await p.setViewportSize({ width: 1920, height: 1080 });
await p.goto('https://app.local/index.html#tv'); await p.waitForSelector('#gc-auth-email', { timeout: 60000 }); await sleep(1500);
for (let i = 0; i < 5; i++) { await p.locator('#gc-auth-email').fill('wjohnson@grayco-cs.com'); await p.locator('#gc-auth-password').fill(H.ACCOUNTS['wjohnson@grayco-cs.com'].pw); await sleep(300); if ((await p.locator('#gc-auth-email').inputValue()) === 'wjohnson@grayco-cs.com') break; }
const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
await H.waitFor(c, () => { const x = window._gcTVM && window._gcTVM.state(); return x && x.host && x.prompt ? x : null; }, null, 150000, 500);
await p.locator('#gc-tvm .tap .go').click(); await sleep(800);
await p.evaluate(() => { window._gcTVFIX.setTheme('parks'); document.getElementById('gc-otv').__set({ paused: true }); window.__mp = document.getElementById('gc-tvm-p'); }); await sleep(3000);
const look = () => p.evaluate(() => { const on = document.querySelector('#gc-otv .gc-tvs-bg i.on'), m = window._gcTVM.state();
  return { slide: document.getElementById('gc-otv').__state().slide, bg: on ? on.style.backgroundImage : '', layers: document.querySelectorAll('#gc-otv .gc-tvs-bg i.on').length,
    same: !!window.__mp && window.__mp === document.getElementById('gc-tvm-p') && window.__mp.isConnected, playing: !!m.playing }; });
const seen = [await look()];
ok(/\/img\/tv\/parks\/.+\.jpg/.test(seen[0].bg) && seen[0].playing, 'National parks look: a park photo behind the first screen, the music playing', seen[0]);
for (let i = 0; i < 8; i++) { await p.mouse.move(600 + i, 600); await p.keyboard.press('ArrowRight'); await sleep(2600); seen.push(await look()); }
const bad = []; for (let i = 1; i < seen.length; i++) if (seen[i].slide === seen[i - 1].slide || !seen[i].bg || seen[i].bg === seen[i - 1].bg || seen[i].layers !== 1) bad.push({ i, prev: seen[i - 1], now: seen[i] });
ok(!bad.length, '8 screen changes: each one a new photo, never the one just shown, one photo layer on after the fade', bad.length ? bad : seen.map(x => x.slide + ' ' + x.bg.slice(-20)));
ok(new Set(seen.map(x => x.bg)).size === seen.length, 'no photo repeats within one pass of the 12 parks (' + seen.length + ' screens, ' + new Set(seen.map(x => x.bg)).size + ' photos)');
ok(seen.every(x => x.same && x.playing), 'the music player #gc-tvm-p is the same node throughout and keeps playing', seen.map(x => [x.same, x.playing]));
const errs = c.errs.filter(e => /tvfix|TVPHOTO|tvm/i.test(e)); ok(!errs.length, 'no page errors', errs);
await c.b.close();
console.log('\nTVPHOTO: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
