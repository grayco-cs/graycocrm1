// test_TVMUSIC.mjs <build-dir> — patch TVMUSIC: 🎵 YouTube / Spotify music in the background of the office TVs.
//   YouTube's IFrame API, Spotify's IFrame API and both players' frames are stubbed (deterministic, nothing leaves the
//   machine; the stubs refuse to play sound until the page has had a tap, as browsers do).
//   • lobby TV: the 🎵 button (hides itself when idle); every link form parsed; the company music (lobby.js, checked);
//     paste → plays; hidden player, the slides fully visible; a content refresh and a rotation → the same player;
//     reload → "▶ Tap to start music" → plays from where it was; Spotify; ?preview=1 has no music.
//   • back office TV (#tv): the company music plays after sign-in; rotation, data refresh, the TV re-made → the same
//     player; closed → paused, reopened → playing; reload → the tap prompt → plays from where it was.
// Env: MIRROR, GC_HARNESS.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const { lobbyFn } = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'lobby_fn_mock.mjs')).href);
const build = process.argv[2] && path.resolve(process.argv[2]);
if (!build) { console.error('usage: node test_TVMUSIC.mjs <build-dir>'); process.exit(2); }
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const sleep = H.sleep;
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
H.resetCloud(); for (const r of rows) H.cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const TOKEN = 'T'.repeat(20) + 'lobbyTestToken_0123456789abcdef';
H.cset('gc_lobby_access', { on: true, token: TOKEN, at: '2026-10-30T10:00:00Z', by: 'test' });
H.cset('gc_lobby', { v: 1, interval: 12, slides: [{ id: 'w', type: 'welcome', on: true }, { id: 'e', type: 'emergency', on: true }, { id: 's', type: 'services', on: true }] });
const LOBBY_MUSIC = 'https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';
const OFFICE_MUSIC = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';
H.cset('gc_tv_goals', { reviews: 5, jobs: 6, leads: 25, music: OFFICE_MUSIC, lobbyMusic: LOBBY_MUSIC, at: '2026-11-01T12:00:00Z', by: 'test' });
const F = lobbyFn(build, H.cloud, () => '');

/* the stubs */
const YT_STUB = `(function(){ var R = window.__yt = { made: [], calls: [], vol: null, loop: null };
window.YT = { PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }, Player: function(el, o){
  var me = this, pv = o.playerVars || {}, f = document.createElement('iframe');
  f.src = (o.host || 'https://www.youtube.com') + '/embed/' + (o.videoId || 'videoseries') + '?stub=1'; f.setAttribute('allow', 'autoplay');
  el.parentNode.replaceChild(f, el); R.made.push({ videoId: o.videoId || '', pv: pv, host: o.host });
  var t0 = 0, at = +pv.start || 0, idx = +pv.index || 0;
  function emit(s){ try { o.events.onStateChange({ target: me, data: s }); } catch (e) {} }
  me.getIframe = function(){ return f; };
  me.playVideo = function(){ R.calls.push('play'); if (!navigator.userActivation.hasBeenActive) { emit(-1); return; } if (!t0) t0 = Date.now(); emit(1); };
  me.pauseVideo = function(){ R.calls.push('pause'); at = me.getCurrentTime(); t0 = 0; emit(2); };
  me.getCurrentTime = function(){ return t0 ? at + (Date.now() - t0) / 1000 : at; }; me.getDuration = function(){ return 600; };
  me.getPlaylistIndex = function(){ return idx; }; me.nextVideo = function(){ R.calls.push('next'); idx++; at = 0; if (t0) t0 = Date.now(); };
  me.setVolume = function(v){ R.vol = v; }; me.setLoop = function(b){ R.loop = b; }; me.seekTo = function(x){ at = x; if (t0) t0 = Date.now(); };
  me.getVideoData = function(){ return { isLive: false }; }; me.destroy = function(){ R.calls.push('destroy'); f.remove(); };
  setTimeout(function(){ o.events.onReady({ target: me }); }, 30);
} };
setTimeout(function(){ if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady(); }, 10); })();`;
const SP_STUB = `(function(){ var R = window.__sp = { made: [], calls: [] };
setTimeout(function(){ window.onSpotifyIframeApiReady && window.onSpotifyIframeApiReady({ createController: function(el, o, cb){
  var f = document.createElement('iframe'); f.src = 'https://open.spotify.com/embed/stub?uri=' + encodeURIComponent(o.uri); el.parentNode.replaceChild(f, el); R.made.push(o.uri);
  var L = {}, paused = true; function upd(){ L.playback_update && L.playback_update({ data: { isPaused: paused, isBuffering: false, position: 5000, duration: 200000 } }); }
  var c = { addListener: function(e, fn){ L[e] = fn; }, play: function(){ R.calls.push('play'); if (!navigator.userActivation.hasBeenActive) return; paused = false; upd(); },
    resume: function(){ R.calls.push('resume'); if (!navigator.userActivation.hasBeenActive) return; paused = false; upd(); }, pause: function(){ R.calls.push('pause'); paused = true; upd(); },
    seek: function(x){ R.calls.push('seek:' + x); }, destroy: function(){ R.calls.push('destroy'); f.remove(); } };
  cb(c); setTimeout(function(){ L.ready && L.ready({}); }, 20); } }); }, 10); })();`;
async function device(name, w, h){
  const c = await H.computer(name, { build });
  await c.ctx.route(u => /^https:\/\/(www\.youtube-nocookie\.com|www\.youtube\.com\/embed|open\.spotify\.com\/embed\/(?!iframe-api))/.test(String(u)), r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body style="background:#000"></body></html>' }));
  await c.ctx.route('https://www.youtube.com/iframe_api', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: YT_STUB }));
  await c.ctx.route('https://open.spotify.com/embed/iframe-api/v1', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SP_STUB }));
  await c.ctx.route('**/.netlify/functions/lobby*', F.route);
  await c.page().setViewportSize({ width: w, height: h });
  return c;
}
const st = c => c.page().evaluate(() => window._gcTVM && window._gcTVM.state());
/* the slides on screen, not covered: the middle of the screen is the TV's own, the 🎵 parts are small */
const visible = (c, host) => c.page().evaluate(host => { const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2), H = document.querySelector(host);
  const bt = document.querySelector('#gc-tvm .bt').getBoundingClientRect(), p = document.getElementById('gc-tvm-p'), pr = p ? p.getBoundingClientRect() : null;
  return { mid: !!(H && el && H.contains(el)), btn: Math.round(bt.width), player: p ? { cls: p.className, op: getComputedStyle(p).opacity, pe: getComputedStyle(p).pointerEvents, area: Math.round(pr.width * pr.height) } : null }; }, host);

console.log('— lobby (front room TV)');
{ const c = await device('LOBBY', 1920, 1080), p = c.page();
  await p.goto('https://app.local/lobby.html#t=' + TOKEN);
  let s = await H.waitFor(c, () => { const x = window._gcTVM && window._gcTVM.state(); return x && x.host && x.made ? x : null; }, null, 20000, 250);
  ok(s && s.page === 'lobby' && s.company === LOBBY_MUSIC && s.eff === LOBBY_MUSIC && s.kind === 'yt', 'the company music for the lobby comes with its content (lobby.js)', s);
  ok(s && s.prompt && !s.playing, 'nobody has tapped this page: "▶ Tap to start music", nothing plays yet', s);
  /* every link form */
  const forms = await p.evaluate(() => { const P = window._gcTVM.parse; return [
    ['https://www.youtube.com/watch?v=jfKfPfyJRdk', 'yt', 'YouTube video', 'yt:jfKfPfyJRdk::'],
    ['https://youtu.be/jfKfPfyJRdk?si=abc&t=90', 'yt', 'YouTube video', 'yt:jfKfPfyJRdk::'],
    ['youtu.be/jfKfPfyJRdk', 'yt', 'YouTube video', 'yt:jfKfPfyJRdk::'],
    ['https://m.youtube.com/watch?v=jfKfPfyJRdk&feature=share', 'yt', 'YouTube video', 'yt:jfKfPfyJRdk::'],
    ['https://www.youtube.com/shorts/jfKfPfyJRdk', 'yt', 'YouTube video', 'yt:jfKfPfyJRdk::'],
    ['https://www.youtube.com/watch?v=jfKfPfyJRdk&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG&index=3', 'yt', 'YouTube playlist', 'yt:jfKfPfyJRdk:PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG:'],
    ['https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG', 'yt', 'YouTube playlist', 'yt::PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG:'],
    ['https://music.youtube.com/watch?v=jfKfPfyJRdk&list=RDAMVMjfKfPfyJRdk', 'yt', 'YouTube playlist', 'yt:jfKfPfyJRdk:RDAMVMjfKfPfyJRdk:'],
    ['https://music.youtube.com/playlist?list=OLAK5uy_kAbCdEfGhIjKlMnOpQrStUvWxYz012345', 'yt', 'YouTube playlist', 'yt::OLAK5uy_kAbCdEfGhIjKlMnOpQrStUvWxYz012345:'],
    ['https://www.youtube.com/live/jfKfPfyJRdk?si=x', 'yt', 'YouTube live stream', 'yt:jfKfPfyJRdk::'],
    ['https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow/live', 'yt', 'YouTube live stream', 'yt:::UCSJ4gkVC6NrvII8umztf0Ow'],
    ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc', 'sp', 'Spotify playlist', 'sp:playlist:37i9dQZF1DXcBWIGoYBM5M'],
    ['https://open.spotify.com/intl-de/album/4aawyAB9vmqN3uQ7FjRGTy', 'sp', 'Spotify album', 'sp:album:4aawyAB9vmqN3uQ7FjRGTy'],
    ['https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl', 'sp', 'Spotify song', 'sp:track:11dFghVXANMlKmJXsNCbNl'],
    ['https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF', 'sp', 'Spotify artist', 'sp:artist:0OdUWJ0sBjDrqHygGUXeCF'],
    ['https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M', 'sp', 'Spotify playlist', 'sp:playlist:37i9dQZF1DXcBWIGoYBM5M'],
    ['spotify:playlist:37i9dQZF1DXcBWIGoYBM5M', 'sp', 'Spotify playlist', 'sp:playlist:37i9dQZF1DXcBWIGoYBM5M'],
    ['spotify:track:11dFghVXANMlKmJXsNCbNl', 'sp', 'Spotify song', 'sp:track:11dFghVXANMlKmJXsNCbNl'],
    ['https://www.youtube.com/@LofiGirl', null], ['https://vimeo.com/12345', null], ['hello there', null], ['https://spotify.link/abcd', null], ['javascript:alert(1)', null]
  ].map(f => { const r = P(f[0]); return { link: f[0], good: f[1] ? !!(r && r.ok && r.kind === f[1] && r.label === f[2] && r.key === f[3]) : !!(r && !r.ok && r.why), r }; }); });
  const badF = forms.filter(f => !f.good);
  ok(!badF.length, 'every link form parsed (' + forms.length + ': videos, playlists, live, youtu.be, music.youtube.com, Spotify links + spotify: URIs; bad ones get a reason)', badF);
  /* the 🎵 button: there, small, hides itself */
  await p.mouse.move(400, 400); await sleep(400);
  const vis1 = await p.evaluate(() => getComputedStyle(document.querySelector('#gc-tvm .bt')).opacity);
  await sleep(5500);
  const vis2 = await p.evaluate(() => ({ idle: document.getElementById('gc-tvm').classList.contains('idle'), op: getComputedStyle(document.querySelector('#gc-tvm .bt')).opacity }));
  ok(vis1 === '1' && vis2.idle, 'the 🎵 button shows on a touch / mouse move and hides itself a few seconds later', { vis1, vis2 });
  /* the tap */
  await p.locator('#gc-tvm .tap .go').click(); await sleep(600);
  s = await st(c);
  ok(s.playing && !s.prompt && s.made === 1, 'one tap → the company music plays (the same player)', s);
  /* paste a link */
  await p.mouse.move(500, 500); await p.locator('#gc-tvm .bt').click(); await sleep(300);
  await p.locator('#gc-tvm [data-tvm-in]').fill('https://youtu.be/jfKfPfyJRdk?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
  const pk = await p.locator('#gc-tvm [data-tvm-pk]').innerText();
  const note = await p.locator('#gc-tvm .pn').innerText();
  ok(/✓ YouTube playlist/.test(pk) && /signed in to Spotify \(open\.spotify\.com once\)/.test(note) && /30-second previews/.test(note) && /YouTube needs no sign-in/.test(note), 'the panel reads the pasted link ("✓ YouTube playlist") and says how Spotify plays', { pk });
  await p.locator('#gc-tvm [data-tvm="apply"]').click(); await sleep(800);
  s = await st(c);
  ok(s.playing && s.made === 2 && s.src === 'https://www.youtube.com/watch?v=jfKfPfyJRdk&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' && s.label === 'YouTube playlist', '▶ Play this → this TV\'s own music plays', s);
  const ctl = await p.evaluate(() => ({ next: !!document.querySelector('#gc-tvm [data-tvm="next"]'), vol: !!document.querySelector('#gc-tvm [data-tvm-vol]'), hide: (document.querySelector('#gc-tvm [data-tvm="hide"]') || {}).textContent, loop: window.__yt.loop }));
  await p.locator('#gc-tvm [data-tvm="next"]').click(); await p.evaluate(() => window._gcTVM.vol(40)); await sleep(300);
  const yc = await p.evaluate(() => ({ next: window.__yt.calls.includes('next'), vol: window.__yt.vol, made: window.__yt.made.slice(-1)[0] }));
  ok(ctl.next && ctl.vol && /Show video/.test(ctl.hide || '') && ctl.loop === true && yc.next && yc.vol === 40 && yc.made.host === 'https://www.youtube-nocookie.com',
    'controls: ⏯, ⏭ next (playlist), volume, Hide video (hidden by default); youtube-nocookie, the playlist loops', { ctl, yc });
  await p.keyboard.press('Escape'); await sleep(300);
  const v = await visible(c, '#stage');
  ok(v.mid && v.btn < 80 && v.player && /hid/.test(v.player.cls) && +v.player.op < 0.05 && v.player.pe === 'none', 'the slides stay fully visible: the player is hidden behind, the button is small', v);
  /* a content refresh (lobby.js's answer changes) and a rotation: the same player keeps playing */
  const before = await st(c);
  H.cset('gc_lobby', { v: 2, interval: 12, slides: [{ id: 'w', type: 'welcome', on: true }, { id: 's', type: 'services', on: true }, { id: 'e', type: 'emergency', on: true }, { id: 'r', type: 'roofing', on: true }] });
  F.mod._test.reset(); await p.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange'))); await sleep(1500);
  const n1 = await p.evaluate(() => window.__lobby.state().n);
  const at0 = await p.evaluate(() => window.__lobby.state().at);
  await H.waitFor(c, a => window.__lobby.state().at !== a || null, at0, 16000, 500);
  const after = await st(c), at1 = await p.evaluate(() => window.__lobby.state().at);
  const destroyed = await p.evaluate(() => window.__yt.calls.filter(x => x === 'destroy').length);
  ok(n1 === 4 && at1 !== at0 && after.playing && after.made === before.made && after.frame === before.frame && destroyed === 1, 'content refresh (4 slides now) + a rotation: same player, same frame, still playing', { n1, at0, at1, before, after, destroyed });
  /* a reload: the source and the second it was at are kept; the tap prompt; then it carries on */
  await sleep(3000); const posB = (await st(c)).pos;
  await p.reload(); await H.waitFor(c, () => { const x = window._gcTVM && window._gcTVM.state(); return x && x.host && x.made ? x : null; }, null, 20000, 250); await sleep(500);
  s = await st(c); const made = await p.evaluate(() => window.__yt.made[0]);
  ok(s.prompt && !s.playing && s.src.includes('jfKfPfyJRdk') && made.pv.list === 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' && made.pv.start >= 2 && Math.abs(made.pv.start - posB) <= 6,
    'reload: "▶ Tap to start music"; the player is set up at the playlist video and second it was at (' + made.pv.start + ' s, index ' + made.pv.index + ')', { s, made, posB });
  await p.mouse.click(960, 300); await sleep(600);   /* a tap anywhere on the TV starts it */
  s = await st(c); ok(s.playing && !s.prompt, 'a tap anywhere → plays again', s);
  /* Spotify */
  await p.evaluate(() => window._gcTVM.set('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')); await sleep(800);
  s = await st(c); const sp = await p.evaluate(() => window.__sp);
  await p.evaluate(() => window._gcTVM.open()); await sleep(200);
  const spPanel = await p.locator('#gc-tvm .pn').innerText();
  ok(s.playing && s.kind === 'sp' && sp.made[0] === 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' && /use the TV's own volume/.test(spPanel), 'Spotify playlist plays (open.spotify.com/embed); the panel says the TV\'s volume is its volume', { s, sp });
  await p.reload(); await H.waitFor(c, () => { const x = window._gcTVM && window._gcTVM.state(); return x && x.made ? x : null; }, null, 20000, 250); await sleep(800);
  s = await st(c); ok(s.prompt && !s.playing && s.kind === 'sp', 'reload with Spotify: the tap prompt', s);
  await p.keyboard.press('Enter'); await sleep(600);
  s = await st(c); ok(s.playing && !s.prompt, 'the remote\'s OK / Enter starts it too', s);
  /* the company music cannot be anything else: lobby.js serves only YouTube / Spotify links */
  H.cset('gc_tv_goals', { music: OFFICE_MUSIC, lobbyMusic: 'javascript:alert(1)' }); F.mod._test.reset();
  const r1 = await F.call('GET', { 'x-lobby-token': TOKEN });
  H.cset('gc_tv_goals', { reviews: 5, jobs: 6, leads: 25, music: OFFICE_MUSIC, lobbyMusic: LOBBY_MUSIC }); F.mod._test.reset();
  const r2 = await F.call('GET', { 'x-lobby-token': TOKEN });
  ok(r1.status === 200 && !('music' in r1.json) && r2.json.music === LOBBY_MUSIC, 'lobby.js: a link that is not YouTube / Spotify is not served', { r1: r1.json.music, r2: r2.json.music });
  await p.goto('https://app.local/lobby.html?preview=1'); await sleep(800);
  ok(await p.evaluate(() => !window._gcTVM && !document.getElementById('gc-tvm')), 'the editor\'s preview (?preview=1): no music');
  const errs = c.errs.filter(e => /tvm|TVMUSIC/i.test(e)); ok(!errs.length, 'no page errors', errs);
  await c.b.close(); }

console.log('— back office TV (CRM #tv)');
{ const c = await device('OFFICE', 1920, 1080), p = c.page();
  await p.goto('https://app.local/index.html#tv'); await p.waitForSelector('#gc-auth-email', { timeout: 60000 }); await sleep(1500);
  for (let i = 0; i < 5; i++) { await p.locator('#gc-auth-email').fill('wjohnson@grayco-cs.com'); await p.locator('#gc-auth-password').fill(H.ACCOUNTS['wjohnson@grayco-cs.com'].pw); await sleep(300); if ((await p.locator('#gc-auth-email').inputValue()) === 'wjohnson@grayco-cs.com') break; }
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  let s = await H.waitFor(c, () => { const x = window._gcTVM && window._gcTVM.state(); return x && x.host && x.playing ? x : null; }, null, 150000, 500);
  ok(s && s.eff === OFFICE_MUSIC && s.company === OFFICE_MUSIC && s.made === 1 && !s.prompt, 'after sign-in the TV opens (#tv) and the company music plays (the sign-in tap counts)', s || await st(c));
  const yv = await p.evaluate(() => window.__yt.made[0]); ok(yv && yv.pv.loop === 1 && yv.pv.playlist === 'jfKfPfyJRdk', 'a single video loops', yv);
  const before = await st(c);
  await p.mouse.move(600, 600); await p.keyboard.press('ArrowRight'); await sleep(1200); await p.keyboard.press('ArrowRight'); await sleep(1200);
  await p.evaluate(() => { const tv = document.getElementById('gc-otv'); tv.__poll(); tv.__set({ money: false }); tv.__set({ money: true }); }); await sleep(800);
  const slide = await p.evaluate(() => document.getElementById('gc-otv').__state().slide);
  let after = await st(c);
  ok(slide === 'score' && after.playing && after.made === before.made && after.frame === before.frame, 'slides turned (→ ' + slide + ') + data refresh + redraws: same player, same frame, still playing', { before, after });
  await p.evaluate(() => window._gcOTV.open({ kiosk: true })); await sleep(2500);   /* the TV made again (a personal screen / sign-in round) */
  after = await st(c); ok(after.playing && after.made === before.made && after.frame === before.frame, 'the TV itself made again: music never stopped, same player', after);
  const v = await visible(c, '#gc-otv');
  ok(v.mid && v.btn < 80 && v.player && /hid/.test(v.player.cls) && +v.player.op < 0.05, 'the dashboard stays fully visible', v);
  await p.evaluate(() => window._gcOTV.close()); await sleep(4500);
  after = await st(c); ok(!after.playing && after.made === before.made && after.on, 'the TV closed by a person → the music pauses (the player stays)', after);
  await p.evaluate(() => { sessionStorage.setItem('gc_tv_want', '1'); window._gcOTV.open({ kiosk: true }); }); await sleep(2500);
  after = await st(c); ok(after.playing && after.made === before.made, 'the TV back → the music plays on', after);
  await sleep(6000); const posB = (await st(c)).pos;
  await p.reload();
  s = await H.waitFor(c, () => { const x = window._gcTVM && window._gcTVM.state(); return x && x.host && x.made ? x : null; }, null, 150000, 500); await sleep(800);
  s = await st(c); const made = await p.evaluate(() => window.__yt.made[0]);
  ok(s && s.prompt && !s.playing && made && made.pv.start >= 4 && Math.abs(made.pv.start - posB) <= 6, 'reload (a new version): the TV comes back with "▶ Tap to start music", set at the second it was at (' + (made && made.pv.start) + ' s)', { s, made, posB });
  await p.locator('#gc-tvm .tap .go').click(); await sleep(800);
  s = await st(c); ok(s.playing && !s.prompt, 'tap → plays', s);
  const errs = c.errs.filter(e => /tvm|TVMUSIC/i.test(e)); ok(!errs.length, 'no page errors', errs);
  await c.b.close(); }

console.log('\nTVMUSIC: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
