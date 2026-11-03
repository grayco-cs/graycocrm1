/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   patch TVMUSIC — 🎵 music in the background of the office TVs (owner 11/03: "make sure i can play youtube or spotify in
   background of office tvs").

   The TV screens: the 🖥 front room (lobby) TV (lobby.html, /lobby — content from functions/lobby.js with the link code), the
   📺 back office TV (#gc-otv: patch OFFICETV + TVFIX; crm.grayco-cs.com/#tv), a personal TV screen (the same #gc-otv,
   #tv=<id> / #/tv=<id>, sessionStorage gc_tv_screen) and the old navy slideshow (#gc-a8-tv, only when OFFICETV did not load).
   Not the lobby editor's preview (lobby.html?preview=1).

   1. 🎵 a small corner button (top left, hides itself 4 s after the last touch / mouse / key, like the TV's own controls).
      It opens a panel: paste a YouTube link (a video, a playlist, a live stream; youtu.be, music.youtube.com,
      youtube.com/live/…, /channel/UC…/live) or a Spotify link (playlist, album, track, artist, podcast; spotify: URIs).
      ▶ / ⏸, volume (YouTube; Spotify has none: the TV's own volume), ⏭ next (YouTube playlists), 🙈 Hide video (the
      default: the player sits behind the TV, playing; "📺 Show video" puts a small video in the bottom-right corner).
   2. Players: YouTube through its IFrame API (the same loader as the training videos: window.YT, onYouTubeIframeAPIReady
      chained), youtube-nocookie, a video loops, a playlist plays on by itself and starts again at its end; a video that
      cannot be played elsewhere is skipped in a playlist and said out loud for a single video. Spotify through its embed
      (open.spotify.com/embed, its IFrame API for ▶ / ⏸; without that API the Spotify player is shown so it can be tapped).
   3. Browsers keep a page quiet until a person has tapped it once. After a load or a reload with music set: one big
      "▶ Tap to start music" (a tap anywhere, or the remote's OK / Enter, starts it). Music that does not start says so.
   4. It survives the TV: the player is its own element on the page (#gc-tvm-p), never inside the TV, so the slides turning,
      the 60 s / 5 min data refreshes, the lobby's 5-minute content pull, a personal screen being opened and the TV closing
      and reopening around a sign-in never touch it. The TV closed by a person (or signed out after the CRM's idle sign-out)
      pauses it; the TV back resumes it. No TV for 2 minutes: the player is taken down (it comes back with the TV).
      A real reload (a new version, an admin's "Refresh this computer", the browser's own): the source, the playlist video
      and the second it was at are kept (every 5 s and when the page goes) and it carries on from there after the tap.
   5. Storage: this TV — localStorage gc_tvm_v1:crm / gc_tvm_v1:lobby { src: '' (the company music) | link | 'off',
      on, vol, hide, pos, idx, key }. The company music (set once by an admin, every TV picks it up): ⚙ Admin → 📺 TVs →
      🎵 Music — gc_kv gc_tv_goals.music (back office TVs; the TVs read it with the team goals) and .lobbyMusic (the lobby
      TV; functions/lobby.js serves it, checked, with the lobby's content).
   API: window._gcTVM = { parse(link), state(), set(link), play(), pause(), next(), vol(n), hide(b), useDefault(), off(),
        open(), close(), admin() }
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_TVMUSIC__) return; window.__GC_PATCH_TVMUSIC__ = true;
var W = window, D = document;
var PAGE = W.__GC_TVM_PAGE__ === 'lobby' ? 'lobby' : 'crm';
if (PAGE === 'lobby' && /[?&]preview=1\b/.test(location.search)) return;   /* the editor's preview: never music */
var STO = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var SIV = W.__GC_REAL_SETINTERVAL__ || W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return STO.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function lsRaw(k){ try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function warn(e){ try { console.warn('[GC TVMUSIC]', e && e.message || e); } catch (x) {} }
function now(){ return Date.now(); }

/* ── the links ── */
var SPK = { playlist: 'Spotify playlist', album: 'Spotify album', track: 'Spotify song', artist: 'Spotify artist', episode: 'Spotify podcast episode', show: 'Spotify podcast' };
function tsec(v){ v = s(v); if (!v) return 0; if (/^\d+$/.test(v)) return +v; var m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; }
function bad(why){ return { ok: false, why: why }; }
function spot(t, id){ t = t.toLowerCase(); return { ok: true, kind: 'sp', type: t, id: id, uri: 'spotify:' + t + ':' + id, key: 'sp:' + t + ':' + id, url: 'https://open.spotify.com/' + t + '/' + id, label: SPK[t] }; }
function parse(raw){
  var t = s(raw).replace(/^<|>$/g, ''), m;
  if (!t) return null;
  if ((m = /^spotify:(playlist|album|track|artist|episode|show):([A-Za-z0-9]{22})$/i.exec(t))) return spot(m[1], m[2]);
  if ((m = /^spotify:user:[^:\s]+:playlist:([A-Za-z0-9]{22})$/i.exec(t))) return spot('playlist', m[1]);
  if (/^spotify:/i.test(t)) return bad('That Spotify link is not a playlist, album, song, artist or podcast.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) { if (/^[\w.-]+\.[a-z]{2,}\//i.test(t)) t = 'https://' + t; else return bad('Paste a YouTube or Spotify link (it starts with https://).'); }
  var u; try { u = new URL(t); } catch (e) { return bad('That is not a link.'); }
  if (!/^https?:$/.test(u.protocol)) return bad('Paste a YouTube or Spotify link (it starts with https://).');
  var h = u.hostname.toLowerCase().replace(/^(www|m)\./, ''), path = u.pathname.replace(/\/+$/, '') || '/', q = u.searchParams;
  if (h === 'open.spotify.com' || h === 'play.spotify.com') {
    m = /^(?:\/intl-[a-z]{2}(?:-[a-z]{2})?)?(?:\/embed)?\/(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]{22})$/i.exec(path);
    if (m) return spot(m[1], m[2]);
    m = /^\/user\/[^/]+\/playlist\/([A-Za-z0-9]{22})$/i.exec(path); if (m) return spot('playlist', m[1]);
    return bad('That Spotify page is not a playlist, album, song, artist or podcast.');
  }
  if (h === 'spotify.link' || h === 'spotify.app.link') return bad('That is a Spotify short link: open it, then copy the link from the address bar (open.spotify.com/…).');
  var yt = h === 'youtube.com' || h === 'music.youtube.com' || h === 'youtube-nocookie.com' || h === 'youtu.be';
  if (!yt) return bad('Only YouTube and Spotify links play on the TV.');
  var v = '', list = s(q.get('list')), ch = '', live = false, start = tsec(q.get('t') || q.get('start'));
  if (h === 'youtu.be') v = path.slice(1);
  else if (path === '/watch') v = s(q.get('v'));
  else if (path === '/playlist' || path === '/embed/videoseries') { if (!list) return bad('That playlist link has no list in it.'); }
  else if (path === '/embed/live_stream') { ch = s(q.get('channel')); live = true; }
  else if ((m = /^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/live|\/streams)?$/.exec(path))) { ch = m[1]; live = true; }
  else if ((m = /^\/(embed|live|shorts|v|e)\/([A-Za-z0-9_-]{11})$/.exec(path))) { v = m[2]; live = m[1] === 'live'; }
  else if (/^\/(@[^/]+|c\/[^/]+|user\/[^/]+)(\/.*)?$/.test(path)) return bad('That is a YouTube channel: open its live stream or a video, press Share and paste that link (youtu.be/…).');
  else return bad('That YouTube page is not a video, a playlist or a live stream.');
  if (v && !/^[A-Za-z0-9_-]{11}$/.test(v)) return bad('That YouTube link has no video in it.');
  if (list && !/^[A-Za-z0-9_-]{2,80}$/.test(list)) list = '';
  if (ch && !/^UC[A-Za-z0-9_-]{22}$/.test(ch)) return bad('That YouTube live link has no channel in it.');
  if (!v && !list && !ch) return bad('That YouTube link has no video or playlist in it.');
  if (ch) { v = ''; list = ''; }
  var o = { ok: true, kind: 'yt', v: v, list: list, ch: ch, live: live, start: live ? 0 : start };
  o.key = 'yt:' + v + ':' + list + ':' + ch;
  o.url = ch ? 'https://www.youtube.com/channel/' + ch + '/live' : live ? 'https://www.youtube.com/live/' + v :
    list && !v ? 'https://www.youtube.com/playlist?list=' + list : 'https://www.youtube.com/watch?v=' + v + (list ? '&list=' + list : '') + (o.start ? '&t=' + o.start : '');
  o.label = live ? 'YouTube live stream' : list ? 'YouTube playlist' : 'YouTube video';
  return o;
}

/* ── this TV's choice + the company music ── */
var LSK = 'gc_tvm_v1:' + PAGE;
function load(){ var c = {}; try { c = obj(JSON.parse(localStorage.getItem(LSK) || 'null')); } catch (e) {}
  return { src: s(c.src).slice(0, 400), on: c.on !== false,   /* a TV that never chose: plays the company music */
    vol: c.vol >= 0 && c.vol <= 100 ? Math.round(c.vol) : 70, hide: c.hide !== false, pos: +c.pos > 0 ? +c.pos : 0, idx: +c.idx > 0 ? Math.floor(+c.idx) : 0, key: s(c.key) }; }
var ST = load();
function save(){ try { localStorage.setItem(LSK, JSON.stringify({ src: ST.src, on: ST.on, vol: ST.vol, hide: ST.hide, pos: Math.round(ST.pos), idx: ST.idx, key: ST.key, at: new Date().toISOString() })); } catch (e) {} }
function companyMusic(){
  if (PAGE === 'lobby') { try { return s(W.__lobby && W.__lobby.data && obj(W.__lobby.data()).music); } catch (e) { return ''; } }
  try { return s(obj(JSON.parse(lsRaw('gc_tv_goals_cache') || 'null')).music); } catch (e) { return ''; }
}
function effective(){ if (ST.src === 'off') return ''; return ST.src || companyMusic(); }

/* ── is a TV on screen? ── */
var HOST = { on: false, since: 0, gone: 0 };
function hostEl(){
  if (PAGE === 'lobby') return D.getElementById('stage');
  return D.getElementById('gc-otv') || D.getElementById('gc-a8-tv');
}
function hostLive(){
  if (PAGE === 'lobby') { try { return !!(W.__lobby && W.__lobby.state().n > 0); } catch (e) { return false; } }
  return !!hostEl();
}

/* ── the player ── */
var P = { key: '', info: null, kind: '', yt: null, sp: null, frame: null, ready: false, playing: false, state: -1, made: 0, err: '', want: false,
  autoPaused: false, lastPlay: 0, tries: 0, gaveUp: false, errs: 0, live: false, fallback: false, spStarted: false, spPos: 0, spDur: 0, spSeek: 0 };
var GEST = false;   /* a person has touched this page since it loaded */
function activated(){ if (GEST) return true; try { return !!(navigator.userActivation && navigator.userActivation.hasBeenActive); } catch (e) { return false; } }
var BOX = null;
function box(){
  if (BOX && BOX.isConnected) return BOX;
  BOX = D.getElementById('gc-tvm-p');
  if (!BOX) { BOX = D.createElement('div'); BOX.id = 'gc-tvm-p'; BOX.setAttribute('data-gc-keep', '1'); BOX.setAttribute('aria-hidden', 'true'); }
  if (!BOX.isConnected) (D.body || D.documentElement).appendChild(BOX);
  return BOX;
}
function boxLook(){ var b = BOX; if (!b) return; var want = 'gc-tvm-p ' + (ST.hide ? 'hid' : 'show') + ' ' + (P.kind || 'none') + (P.fallback ? ' fb' : ''); if (b.className !== want) b.className = want; }
var YTP = null;
function ytApi(){
  if (W.YT && W.YT.Player) return Promise.resolve(W.YT);
  if (YTP) return YTP;
  YTP = new Promise(function(res, rej){
    var prev = W.onYouTubeIframeAPIReady;
    W.onYouTubeIframeAPIReady = function(){ try { if (typeof prev === 'function') prev(); } catch (e) {} res(W.YT); };
    if (!D.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      var sc = D.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; sc.async = true; sc.onerror = function(){ YTP = null; rej(new Error('the YouTube player could not load (no internet?)')); };
      (D.head || D.documentElement).appendChild(sc);
    }
    later(function(){ if (!(W.YT && W.YT.Player)) { YTP = null; rej(new Error('the YouTube player did not answer')); } }, 15000);
  });
  return YTP;
}
var SPP = null;
function spApi(){
  if (W.__gcSpotifyAPI) return Promise.resolve(W.__gcSpotifyAPI);
  if (SPP) return SPP;
  SPP = new Promise(function(res, rej){
    var prev = W.onSpotifyIframeApiReady;
    W.onSpotifyIframeApiReady = function(api){ try { if (typeof prev === 'function') prev(api); } catch (e) {} W.__gcSpotifyAPI = api; res(api); };
    var sc = D.createElement('script'); sc.src = 'https://open.spotify.com/embed/iframe-api/v1'; sc.async = true; sc.onerror = function(){ SPP = null; rej(new Error('the Spotify player could not load')); };
    (D.head || D.documentElement).appendChild(sc);
    later(function(){ if (!W.__gcSpotifyAPI) { SPP = null; rej(new Error('the Spotify player did not answer')); } }, 15000);
  });
  return SPP;
}
var YTERR = { 2: 'that video link is not right', 5: 'that video cannot play in this browser', 100: 'that video is private or was taken down', 101: 'the video\'s owner does not let it play on other sites', 150: 'the video\'s owner does not let it play on other sites', 153: 'YouTube refused to play it here' };
function tagFrame(){ var f = BOX && BOX.querySelector('iframe'); if (f && !f.__tvm) f.__tvm = P.made; P.frame = f || null; }
function destroy(){
  try { if (P.yt && P.yt.destroy) P.yt.destroy(); } catch (e) {}
  try { if (P.sp && P.sp.destroy) P.sp.destroy(); } catch (e) {}
  if (BOX) BOX.innerHTML = '';
  P.yt = P.sp = P.frame = null; P.ready = P.playing = P.want = P.autoPaused = P.fallback = P.spStarted = false; P.state = -1; P.err = ''; P.tries = 0; P.gaveUp = false; P.errs = 0; P.live = false; P.kind = ''; P.info = null; P.key = '';
}
function create(info){
  destroy();
  P.key = info.key; P.info = info; P.kind = info.kind; P.made++;
  var resume = ST.key === info.key, b = box(), slot = D.createElement('div'); slot.className = 'slot'; b.appendChild(slot); boxLook();
  var myKey = info.key;
  if (info.kind === 'yt') {
    ytApi().then(function(YT){
      if (P.key !== myKey) return;
      var pv = { autoplay: 0, controls: 1, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3, fs: 0, origin: location.origin };
      var o = { host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%', playerVars: pv, events: {
        onReady: function(){ if (P.key !== myKey) return; P.ready = true; try { P.yt.setVolume(ST.vol); if (P.info.list) P.yt.setLoop(true); } catch (e) {} tagFrame(); if (P.want) play(); paint(); },
        onStateChange: function(ev){ if (P.key !== myKey) return; P.state = ev.data;
          if (ev.data === 1) { P.playing = true; P.err = ''; P.errs = 0; P.tries = 0; P.gaveUp = false; try { var vd = P.yt.getVideoData && P.yt.getVideoData(); P.live = !!(vd && vd.isLive) || !!P.info.live; } catch (e) {} }
          else if (ev.data === 2 || ev.data === 0 || ev.data === -1 || ev.data === 5) P.playing = false;
          if (ev.data === 0 && !P.info.list) { try { P.yt.seekTo(0, true); P.yt.playVideo(); } catch (e) {} }   /* one video: round again */
          paint(); },
        onError: function(ev){ if (P.key !== myKey) return; var why = YTERR[ev && ev.data] || ('YouTube error ' + (ev && ev.data));
          if (P.info.list && ++P.errs <= 5) { say('🎵 Skipped a video: ' + why + '.'); try { P.yt.nextVideo(); } catch (e) {} return; }
          P.err = 'This does not play: ' + why + '. Pick another link.'; P.playing = false; say('🎵 ' + P.err, true); paint(); } } };
      if (info.ch) { o.videoId = 'live_stream'; pv.channel = info.ch; }
      else if (info.list && (!info.v || (resume && ST.idx > 0))) { pv.listType = 'playlist'; pv.list = info.list; if (resume) { pv.index = ST.idx; if (ST.pos > 1) pv.start = Math.floor(ST.pos); } }
      else { o.videoId = info.v; if (info.list) { pv.list = info.list; pv.listType = 'playlist'; } else { pv.loop = 1; pv.playlist = info.v; }
        var st = resume && ST.pos > 1 && !info.live ? Math.floor(ST.pos) : info.start; if (st) pv.start = st; }
      P.yt = new YT.Player(slot, o);
      later(tagFrame, 50);
    }, function(e){ if (P.key !== myKey) return; P.err = 'The music could not start: ' + s(e && e.message) + '.'; say('🎵 ' + P.err, true); paint(); });
  } else {
    P.spSeek = resume && ST.pos > 1 && (info.type === 'track' || info.type === 'episode') ? ST.pos : 0;
    spApi().then(function(API){
      if (P.key !== myKey) return;
      API.createController(slot, { uri: info.uri, width: '100%', height: 152 }, function(c){
        if (P.key !== myKey) { try { c.destroy(); } catch (e) {} return; }
        P.sp = c; tagFrame();
        try { c.addListener('ready', function(){ if (P.key !== myKey) return; P.ready = true; tagFrame(); if (P.want) play(); paint(); }); } catch (e) {}
        try { c.addListener('playback_update', function(e){ if (P.key !== myKey) return; var d = (e && e.data) || {};
          var was = P.playing; P.playing = !d.isPaused; P.state = d.isBuffering ? 3 : P.playing ? 1 : 2; P.spPos = (+d.position || 0) / 1000; P.spDur = (+d.duration || 0) / 1000;
          if (P.playing) { P.err = ''; P.tries = 0; P.gaveUp = false; if (P.spSeek > 1) { var sk = P.spSeek; P.spSeek = 0; try { c.seek(sk); } catch (x) {} } }
          /* the end of it: round again (Spotify stops at the end of a song, a playlist or an album) */
          if (was && !P.playing && ST.on && P.spDur > 0 && P.spPos >= P.spDur - 1.5) later(function(){ try { if (ST.on && !P.playing && P.sp) P.sp.play(); } catch (x) {} }, 1200);
          paint(); }); } catch (e) {}
        P.ready = true;   /* the controller answers commands from here on; 'ready' (if it comes) says the same */
        if (P.want) later(play, 300);
      });
    }, function(e){
      if (P.key !== myKey) return;
      /* no Spotify API: the plain Spotify player, shown so it can be tapped */
      P.fallback = true; ST.hide = false; boxLook();
      slot.innerHTML = '<iframe title="Spotify" src="https://open.spotify.com/embed/' + esc(info.type) + '/' + esc(info.id) + '?utm_source=generator" allow="autoplay; encrypted-media" loading="eager" style="width:100%;height:152px;border:0;border-radius:12px"></iframe>';
      tagFrame(); P.ready = false;
      P.err = 'Spotify\'s controls did not load (' + s(e && e.message) + '): tap ▶ in the Spotify player in the corner.'; say('🎵 ' + P.err, true); paint();
    });
  }
}
function play(){
  P.want = true; P.autoPaused = false;
  if (!P.ready) return;
  P.lastPlay = now();
  try {
    if (P.yt) { P.yt.setVolume(ST.vol); P.yt.playVideo(); }
    else if (P.sp) { if (P.spStarted) P.sp.resume(); else { P.spStarted = true; P.sp.play(); } }
  } catch (e) { warn(e); }
}
function pauseP(){ P.want = false; try { if (P.yt) P.yt.pauseVideo(); else if (P.sp) P.sp.pause(); } catch (e) {} }
function keepPos(){
  if (!P.ready || !P.key || P.key !== ST.key) return;
  try {
    if (P.yt) { if (P.live) { ST.pos = 0; return; } var t = +P.yt.getCurrentTime() || 0, d = +P.yt.getDuration() || 0; if (d > 0 && d < 6 * 3600) ST.pos = t; if (P.info && P.info.list && P.yt.getPlaylistIndex) { var i = +P.yt.getPlaylistIndex(); if (i >= 0) ST.idx = i; } }
    else if (P.sp && P.spDur > 0) ST.pos = P.spPos;
  } catch (e) {}
}

/* ── the screen part: 🎵 button, panel, tap prompt, a short message ── */
var CSS = '#gc-tvm{position:fixed;left:0;top:0;z-index:2147483200;font:600 clamp(14px,1.05vw,26px)/1.35 Inter,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}' +
  '#gc-tvm *{box-sizing:border-box}#gc-tvm button{font:inherit;cursor:pointer}' +
  '#gc-tvm .bt{position:fixed;left:.35em;top:.35em;width:2.5em;height:2.5em;border-radius:50%;border:.1em solid rgba(212,160,23,.55);background:rgba(11,22,38,.78);color:#fff;font-size:1.05em;display:flex;align-items:center;justify-content:center;transition:opacity .6s;padding:0;line-height:1}' +
  '#gc-tvm .bt.on{border-color:#F2C14E;box-shadow:0 0 0 .14em rgba(242,193,78,.25)}#gc-tvm .bt:focus-visible,#gc-tvm .pn button:focus-visible,#gc-tvm .tap button:focus-visible{outline:.18em solid #F2C14E;outline-offset:.12em}' +
  '#gc-tvm.idle .bt{opacity:0}#gc-tvm.nohost .bt,#gc-tvm.nohost .pn,#gc-tvm.nohost .tap{display:none}' +
  '#gc-tvm .pn{position:fixed;left:.35em;top:3.2em;width:min(34em,calc(100vw - .7em));max-height:calc(100vh - 3.6em);overflow:auto;background:#0B1626;border:.08em solid rgba(212,160,23,.45);border-radius:1em;padding:1em 1.1em;box-shadow:0 1em 3em rgba(0,0,0,.5)}' +
  '#gc-tvm .pn[hidden],#gc-tvm .tap[hidden],#gc-tvm .msg[hidden]{display:none}' +
  '#gc-tvm .pn h3{margin:0 0 .6em;font-size:1.2em;font-weight:800;display:flex;align-items:center;gap:.4em}#gc-tvm .pn h3 span{flex:1}' +
  '#gc-tvm .pn .x{all:unset;cursor:pointer;padding:.1em .45em;border-radius:.4em;color:#A9B7CA;font-size:1.1em}' +
  '#gc-tvm .row{display:flex;flex-wrap:wrap;gap:.45em;align-items:center;margin:.45em 0}' +
  '#gc-tvm input[type=text]{flex:1;min-width:0;padding:.6em .7em;border-radius:.6em;border:.08em solid rgba(255,255,255,.28);background:#13243B;color:#fff;font:inherit;font-weight:500}' +
  '#gc-tvm .pn button.b{padding:.55em .9em;border-radius:.6em;border:.08em solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#fff;font-weight:700;min-height:2.4em}' +
  '#gc-tvm .pn button.b.g{background:#D4A017;border-color:#D4A017;color:#0B1626}#gc-tvm .pn button.b:disabled{opacity:.45;cursor:default}' +
  '#gc-tvm .pk{font-size:.9em;min-height:1.3em;color:#A9B7CA}#gc-tvm .pk.ok{color:#86EFAC}#gc-tvm .pk.no{color:#FCA5A5}' +
  '#gc-tvm .now{padding:.6em .7em;border-radius:.6em;background:rgba(255,255,255,.06);margin:.6em 0 .3em}#gc-tvm .now b{color:#F2C14E}#gc-tvm .now .er{color:#FCA5A5;display:block;margin-top:.25em}' +
  '#gc-tvm input[type=range]{flex:1;min-width:6em;accent-color:#D4A017}#gc-tvm .mut{color:#A9B7CA;font-size:.85em;font-weight:500}' +
  '#gc-tvm .tap{position:fixed;left:50%;bottom:22vh;transform:translateX(-50%);z-index:2;display:flex;flex-direction:column;align-items:center;gap:.5em}' +
  '#gc-tvm .tap .go{padding:.7em 1.6em;border-radius:1em;border:.12em solid #F2C14E;background:rgba(11,22,38,.92);color:#fff;font-size:2.1em;font-weight:800;box-shadow:0 .4em 1.6em rgba(0,0,0,.5);min-width:10em}' +
  '#gc-tvm .tap .go small{display:block;font-size:.42em;font-weight:600;color:#A9B7CA;margin-top:.25em}' +
  '#gc-tvm .tap .no{all:unset;cursor:pointer;color:#A9B7CA;font-size:.95em;padding:.3em .8em;border-radius:.5em;background:rgba(11,22,38,.6)}' +
  '#gc-tvm .msg{position:fixed;left:50%;top:1em;transform:translateX(-50%);max-width:min(48em,calc(100vw - 2em));background:#0B1626;border:.08em solid rgba(212,160,23,.5);color:#fff;padding:.6em 1em;border-radius:.8em;box-shadow:0 .6em 2em rgba(0,0,0,.45)}#gc-tvm .msg.bad{border-color:#F87171}' +
  '.gc-tvm-p{position:fixed;overflow:hidden;background:#000}.gc-tvm-p .slot,.gc-tvm-p iframe{width:100%;height:100%;border:0;display:block}' +
  '.gc-tvm-p.hid{left:0;bottom:0;width:200px;height:200px;opacity:.01;pointer-events:none;z-index:0}' +
  '.gc-tvm-p.show{right:1.2vw;bottom:15vh;width:clamp(240px,22vw,520px);aspect-ratio:16/9;z-index:2147483100;border-radius:.8em;box-shadow:0 .6em 2em rgba(0,0,0,.5);border:2px solid rgba(212,160,23,.55)}' +
  '.gc-tvm-p.sp.show,.gc-tvm-p.sp.hid{height:152px;aspect-ratio:auto}.gc-tvm-p.sp.show{width:clamp(300px,24vw,480px);background:transparent;border:0}.gc-tvm-p.sp.hid{width:300px}.gc-tvm-p.none{display:none}' +
  /* the admin's 🎵 Music dialog (CRM) */
  '#gc-tvm-ed{position:fixed;inset:0;z-index:2147482500;background:rgba(15,29,47,.55);display:flex;align-items:center;justify-content:center;font:14px/1.45 Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#0F1D2F}' +
  '#gc-tvm-ed .win{background:#fff;border-radius:16px;width:min(640px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35)}' +
  '#gc-tvm-ed .top{display:flex;align-items:center;gap:10px;padding:14px 18px;background:#0F1D2F;color:#fff}#gc-tvm-ed .top b{flex:1;font-size:17px}#gc-tvm-ed .x{all:unset;cursor:pointer;font-size:20px;padding:2px 8px}' +
  '#gc-tvm-ed .body{padding:14px 18px}#gc-tvm-ed label{display:block;font-weight:800;margin:12px 0 5px}#gc-tvm-ed input{width:100%;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}' +
  '#gc-tvm-ed .pk{font-size:12.5px;min-height:18px;margin-top:3px;color:#64748b}#gc-tvm-ed .pk.ok{color:#15803d}#gc-tvm-ed .pk.no{color:#b91c1c}#gc-tvm-ed .mut{color:#64748b;font-size:12.5px}' +
  '#gc-tvm-ed .bar{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}#gc-tvm-ed button.b{padding:9px 16px;border-radius:8px;border:none;background:#e2e8f0;color:#0f172a;font:inherit;font-weight:800;cursor:pointer;min-height:38px}#gc-tvm-ed button.b.g{background:#D4A017;color:#0F1D2F}';
var NOTE = 'Spotify plays full songs when this TV\'s browser is signed in to Spotify (open.spotify.com once). Otherwise Spotify only plays 30-second previews. YouTube needs no sign-in.';
var UI = null, OPEN = false, SKIP = false, LAST = now(), MSGT = 0, PSIG = '';
function css(){ if (D.getElementById('gc-tvm-css')) return; var st = D.createElement('style'); st.id = 'gc-tvm-css'; st.textContent = CSS; (D.head || D.documentElement).appendChild(st); }
function ui(){
  if (UI) return UI;
  css();
  UI = D.createElement('div'); UI.id = 'gc-tvm'; UI.setAttribute('data-gc-keep', '1'); UI.className = 'nohost';
  UI.innerHTML = '<button type="button" class="bt" data-tvm="toggle" title="🎵 Music on this TV" aria-label="Music on this TV">🎵</button>' +
    '<div class="pn" role="dialog" aria-label="Music on this TV" hidden></div>' +
    '<div class="tap" hidden><button type="button" class="go" data-tvm="start">▶ Tap to start music<small></small></button><button type="button" class="no" data-tvm="notnow">Not now</button></div>' +
    '<div class="msg" role="status" hidden></div>';
  UI.addEventListener('click', onClick);
  UI.addEventListener('input', onInput);
  UI.addEventListener('change', onInput);
  UI.addEventListener('keydown', function(e){ if (e.key === 'Enter' && e.target && e.target.hasAttribute && e.target.hasAttribute('data-tvm-in')) { e.preventDefault(); apply(e.target.value); } });
  return UI;
}
function place(){
  /* the TV in full screen (its ⛶): only what is inside it is drawn, so the 🎵 part goes in with it (the player stays put) */
  var fs = D.fullscreenElement || D.webkitFullscreenElement || null, want = fs && fs !== D.documentElement && fs !== D.body ? fs : D.body;
  if (want && UI.parentNode !== want) want.appendChild(UI);
}
function say(t, isBad){
  var u = ui(), m = u.querySelector('.msg'); m.textContent = t; m.className = 'msg' + (isBad ? ' bad' : ''); m.hidden = false;
  try { clearTimeout(MSGT); } catch (e) {} MSGT = later(function(){ m.hidden = true; }, isBad ? 14000 : 6000);
}
function status(){
  if (!effective()) return ST.src === 'off' ? 'No music on this TV.' : 'No music set.';
  var i = parse(effective()); if (!i || !i.ok) return 'The music link is not right.';
  if (P.err) return '';
  if (!P.key) return HOST.on ? 'Loading…' : 'Waiting for the TV.';
  if (P.playing) return '▶ Playing';
  if (P.state === 3) return 'Loading…';
  if (ST.on && !activated()) return 'Tap the screen once to start it.';
  if (ST.on && !P.ready) return 'Loading…';
  return '⏸ Paused';
}
function panelHtml(){
  var eff = effective(), i = eff ? parse(eff) : null, co = companyMusic(), ci = co ? parse(co) : null, own = ST.src && ST.src !== 'off';
  var isYT = P.kind === 'yt' || (i && i.ok && i.kind === 'yt'), isSP = !isYT && i && i.ok;
  var h = '<h3><span>🎵 Music on this TV</span><button type="button" class="x" data-tvm="close" aria-label="Close">✕</button></h3>' +
    '<div class="row"><input type="text" data-tvm-in placeholder="Paste a YouTube or Spotify link" aria-label="YouTube or Spotify link" spellcheck="false" autocomplete="off">' +
    '<button type="button" class="b g" data-tvm="apply">▶ Play this</button><button type="button" class="b" data-tvm="paste" title="Paste the link you copied">📋 Paste</button></div>' +
    '<div class="pk" data-tvm-pk>A video, a playlist or a live stream from YouTube (youtu.be, music.youtube.com too); a playlist, album, song or artist from Spotify.</div>' +
    '<div class="now">' + (i && i.ok ? '<b>' + esc(i.label) + '</b> · ' + (own ? 'this TV\'s music' : 'the company music') + ' · <span data-tvm-st>' + esc(status()) + '</span>' : '<span data-tvm-st>' + esc(status()) + '</span>') +
    (P.err ? '<span class="er">' + esc(P.err) + '</span>' : '') + '</div>' +
    '<div class="row"><button type="button" class="b g" data-tvm="pp"' + (i && i.ok ? '' : ' disabled') + '>' + (P.playing || (ST.on && P.want) ? '⏸ Pause' : '▶ Play') + '</button>' +
    (isYT && i && i.ok && i.list ? '<button type="button" class="b" data-tvm="next">⏭ Next</button>' : '') +
    '<button type="button" class="b" data-tvm="hide"' + (i && i.ok ? '' : ' disabled') + '>' + (ST.hide ? '📺 Show video' : '🙈 Hide video') + '</button></div>' +
    '<div class="row">🔉 ' + (isSP ? '<span class="mut">Spotify: use the TV\'s own volume.</span>' : '<input type="range" min="0" max="100" step="5" value="' + ST.vol + '" data-tvm-vol aria-label="Volume"><span data-tvm-vl>' + ST.vol + '</span>') + '</div>' +
    '<div class="row">' + (own ? '<button type="button" class="b" data-tvm="default">↺ Use the company music</button>' : '') + (ST.src !== 'off' ? '<button type="button" class="b" data-tvm="off">⏹ No music on this TV</button>' : '<button type="button" class="b" data-tvm="default">↺ Use the company music</button>') + '</div>' +
    '<div class="mut">Company music: ' + (ci && ci.ok ? esc(ci.label) : 'none') + (PAGE === 'crm' ? ' — an admin sets it in ⚙ Admin → 📺 TVs → 🎵 Music.' : ' — set in the CRM: ⚙ Admin → 📺 TVs → 🎵 Music.') + '</div>' +
    '<p class="mut" style="margin:.7em 0 0">' + esc(NOTE) + '</p>';
  return h;
}
function paint(force){
  if (!UI) return;
  var pn = UI.querySelector('.pn');
  if (OPEN) {
    var sig = [effective(), ST.src, P.playing, P.want, ST.on, ST.hide, P.err, P.kind, P.state, P.ready, companyMusic(), activated(), HOST.on].join('|');
    if (force || pn.hidden || sig !== PSIG) {
      var inp = pn.querySelector('[data-tvm-in]'), keep = inp ? inp.value : '', foc = inp && D.activeElement === inp;
      if (force || pn.hidden || !foc) { pn.innerHTML = panelHtml(); var ni = pn.querySelector('[data-tvm-in]'); if (ni) { ni.value = keep; if (foc) ni.focus(); if (keep) showParse(keep); } }
      else { var stn = pn.querySelector('[data-tvm-st]'); if (stn) stn.textContent = status(); }
      PSIG = sig; pn.hidden = false;
    }
  } else if (!pn.hidden) pn.hidden = true;
  var bt = UI.querySelector('.bt'); bt.classList.toggle('on', !!P.playing);
  bt.title = P.playing ? '🎵 Music playing — tap for the controls' : '🎵 Music on this TV';
}
function showParse(v){
  var pk = UI && UI.querySelector('[data-tvm-pk]'); if (!pk) return;
  var i = parse(v);
  if (!i) { pk.className = 'pk'; pk.textContent = 'A video, a playlist or a live stream from YouTube (youtu.be, music.youtube.com too); a playlist, album, song or artist from Spotify.'; return; }
  pk.className = 'pk ' + (i.ok ? 'ok' : 'no'); pk.textContent = i.ok ? '✓ ' + i.label + ' — press ▶ Play this' : '✗ ' + i.why;
}
function apply(v){
  var i = parse(v);
  if (!i || !i.ok) { showParse(v); say('🎵 ' + (i ? i.why : 'Paste a YouTube or Spotify link first.'), true); return; }
  GEST = true; ST.src = i.url; ST.on = true; ST.pos = 0; ST.idx = 0; ST.key = i.key; save();
  var inp = UI.querySelector('[data-tvm-in]'); if (inp) inp.value = '';
  sync(true); play(); paint(true); say('🎵 ' + i.label + ' — playing on this TV');
}
function onInput(e){
  var t = e.target; if (!t || !t.hasAttribute) return;
  if (t.hasAttribute('data-tvm-in')) showParse(t.value);
  if (t.hasAttribute('data-tvm-vol')) { ST.vol = Math.max(0, Math.min(100, Math.round(+t.value || 0))); var l = UI.querySelector('[data-tvm-vl]'); if (l) l.textContent = ST.vol; try { if (P.yt && P.ready) P.yt.setVolume(ST.vol); } catch (x) {} if (e.type === 'change') save(); }
}
function start(){
  GEST = true; SKIP = false; ST.on = true; save(); P.tries = 0; P.gaveUp = false;
  var tp = UI.querySelector('.tap'); tp.hidden = true;
  if (!P.key) sync(true);
  play(); paint();
}
function onClick(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-tvm]') : null; if (!b) return;
  e.stopPropagation();
  var a = b.getAttribute('data-tvm'); poke();
  if (a === 'toggle') { OPEN = !OPEN; paint(true); if (OPEN) later(function(){ var i = UI.querySelector('[data-tvm-in]'); if (i && !effective()) try { i.focus(); } catch (x) {} }, 30); }
  else if (a === 'close') { OPEN = false; paint(); }
  else if (a === 'start') start();
  else if (a === 'notnow') { SKIP = true; UI.querySelector('.tap').hidden = true; }
  else if (a === 'apply') apply((UI.querySelector('[data-tvm-in]') || {}).value);
  else if (a === 'paste') {
    try { navigator.clipboard.readText().then(function(t){ var i = UI.querySelector('[data-tvm-in]'); if (i) { i.value = s(t); showParse(i.value); } }, function(){ say('🎵 This browser did not let me read the clipboard: paste with Ctrl+V (or long-press → Paste).', true); }); }
    catch (x) { say('🎵 Paste with Ctrl+V (or long-press → Paste).', true); }
  }
  else if (a === 'pp') { if (P.playing || (ST.on && P.want)) { ST.on = false; keepPos(); save(); pauseP(); } else { GEST = true; ST.on = true; save(); if (!P.key) sync(true); P.tries = 0; P.gaveUp = false; play(); } paint(true); }
  else if (a === 'next') { try { if (P.yt && P.ready) { P.yt.nextVideo(); ST.on = true; save(); } } catch (x) {} }
  else if (a === 'hide') { ST.hide = !ST.hide; save(); boxLook(); paint(true); }
  else if (a === 'default') { ST.src = ''; ST.on = !!companyMusic(); ST.pos = 0; ST.idx = 0; save(); GEST = true; sync(true); if (ST.on) play(); paint(true); }
  else if (a === 'off') { ST.src = 'off'; ST.on = false; save(); destroy(); paint(true); }
  try { b.blur && a !== 'toggle' && b.blur(); } catch (x) {}
}
function poke(){ LAST = now(); if (UI && UI.classList.contains('idle')) UI.classList.remove('idle'); }

/* ── the loop (the browser's own 1 s timer: not slowed when nobody is at the computer) ── */
var TICKS = 0, PUT = 0;
function sync(force){
  var live = hostLive(), t = now();
  if (live) { if (!HOST.on) { HOST.on = true; HOST.since = t; } HOST.gone = 0; }
  else if (HOST.on) { if (!HOST.gone) HOST.gone = t; if (t - HOST.gone > (PAGE === 'lobby' ? 10000 : 3000)) HOST.on = false; }
  var u = ui(); if (u.parentNode !== (D.fullscreenElement && D.fullscreenElement !== D.documentElement ? D.fullscreenElement : D.body)) place();
  u.classList.toggle('nohost', !HOST.on);
  var eff = effective(), info = eff ? parse(eff) : null; if (info && !info.ok) info = null;
  /* a new source (this TV's, or the company's changed) → a new player; the same one is never made again */
  if (HOST.on && (info ? info.key : '') !== P.key) {
    if (info) { if (P.key && ST.key && ST.key !== info.key) { ST.pos = 0; ST.idx = 0; } create(info); if (ST.key !== info.key) { ST.key = info.key; save(); } if (ST.on && activated() && !SKIP) play(); }
    else if (P.key) destroy();
  }
  if (!HOST.on && P.key) {
    if (P.playing || P.want) { keepPos(); save(); pauseP(); P.autoPaused = true; }
    if (HOST.gone && t - HOST.gone > 120000) destroy();
  }
  if (HOST.on && P.key && ST.on && !SKIP && activated()) {
    if (P.autoPaused || (!P.want && !P.playing)) play();
    /* asked to play and it is not: try again twice, then say so */
    else if (P.ready && !P.playing && P.state !== 3 && !P.err && !P.gaveUp && P.lastPlay && t - P.lastPlay > 8000) {
      if (++P.tries <= 2) play(); else { P.gaveUp = true; say('🎵 The music did not start. Tap 🎵 and press ▶ Play, or try another link.', true); showTap(true); }
    }
  }
  showTap(false);
  if (P.playing && TICKS % 5 === 0) { keepPos(); save(); }
  if (t - LAST > 4000 && !OPEN && !u.classList.contains('idle')) u.classList.add('idle');
  if (OPEN && t - LAST > 90000 && !(D.activeElement && u.contains(D.activeElement) && D.activeElement.tagName === 'INPUT')) { OPEN = false; }
  boxLook(); paint(force);
}
function showTap(again){
  var tp = UI.querySelector('.tap'), need = HOST.on && ST.on && !SKIP && !!P.key && (!activated() || again === true || (P.gaveUp && !P.playing));
  if (need && P.playing) need = false;
  if (tp.hidden === !need) return;
  tp.hidden = !need;
  if (need) { var i = P.info, sm = tp.querySelector('small'); sm.textContent = i ? i.label + ' · the browser waits for one tap before it plays sound' : ''; try { tp.querySelector('.go').focus({ preventScroll: true }); } catch (e) {} }
}
function tick(){ TICKS++; try { sync(false); } catch (e) { warn(e); } }

/* a person at the TV: the 🎵 button shows; with music waiting, their first tap or OK / Enter starts it */
['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'].forEach(function(ev){
  D.addEventListener(ev, function(e){
    if (e && e.isTrusted === false) return;
    poke();
    if (ev === 'pointerdown' || ev === 'keydown' || ev === 'touchstart') {
      if (ev === 'keydown' && (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta')) return;
      var was = activated(); GEST = true;
      var tp = UI && UI.querySelector('.tap');
      if (tp && !tp.hidden && !(e.target && e.target.closest && e.target.closest('[data-tvm="notnow"]'))) { start(); }
      else if (!was && HOST.on && ST.on && !SKIP && P.key) later(function(){ sync(false); }, 0);
    }
  }, { capture: true, passive: true });
});
/* Esc closes the 🎵 panel first (the TV's own Esc closes the TV) */
W.addEventListener('keydown', function(e){ if (e.key === 'Escape' && OPEN) { OPEN = false; paint(); try { e.stopImmediatePropagation(); e.preventDefault(); } catch (x) {} } }, true);
function onGo(){ keepPos(); save(); }
W.addEventListener('pagehide', onGo); W.addEventListener('beforeunload', onGo);
D.addEventListener('visibilitychange', function(){ if (D.hidden) onGo(); });
D.addEventListener('fullscreenchange', function(){ try { if (UI) place(); } catch (e) {} });

/* ── ⚙ Admin → 📺 TVs → 🎵 Music: the company music (CRM, admins) ── */
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function me(){ try { var u = W.meUser && W.meUser(); if (u && u.name) return s(u.name); } catch (e) {} return ''; }
function creds(){ return { u: (s(lsRaw('grayco_sb_url')) || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), k: s(lsRaw('grayco_sb_key')) }; }
function sbH(extra){ var c = creds(), h = { 'Content-Type': 'application/json' }; if (c.k) { h.apikey = c.k; h.Authorization = 'Bearer ' + c.k; } return Object.assign(h, extra || {}); }
function goalsGet(){ var c = creds(); return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.gc_tv_goals&select=value', { headers: sbH(), cache: 'no-store' })
  .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('read ' + r.status)); }).then(function(rows){ return rows && rows[0] ? obj(rows[0].value) : {}; }); }
function goalsPut(v){ var c = creds(); return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: sbH({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
  body: JSON.stringify({ key: 'gc_tv_goals', value: v, updated_at: new Date().toISOString() }) }).then(function(r){ return r.ok; }, function(){ return false; }); }
function cachedGoals(){ try { return obj(JSON.parse(lsRaw('gc_tv_goals_cache') || 'null')); } catch (e) { return {}; } }
function toast(msg, isBad){ try { var t = D.createElement('div'); t.className = 'gc-tvs-toast' + (isBad ? ' bad' : ''); t.setAttribute('role', 'status'); t.textContent = msg; D.body.appendChild(t); later(function(){ try { t.remove(); } catch (e) {} }, 4200); } catch (e) {} }
function admin(){
  if (PAGE !== 'crm') return null;
  if (!isAdmin()) { toast('Only an admin sets the company music.', true); return null; }
  css();
  var old = D.getElementById('gc-tvm-ed'); if (old) old.remove();
  var g = cachedGoals(), el = D.createElement('div'); el.id = 'gc-tvm-ed'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Music on the TVs'); el.setAttribute('data-gc-keep', '1');
  function fld(k, lab, sub){ return '<label for="gc-tvm-ed-' + k + '">' + lab + '</label><input id="gc-tvm-ed-' + k + '" type="text" data-k="' + k + '" spellcheck="false" autocomplete="off" placeholder="Paste a YouTube or Spotify link (empty: no company music)" value="' + esc(g[k] || '') + '"><div class="pk" data-pk="' + k + '">' + esc(sub) + '</div>'; }
  el.innerHTML = '<div class="win"><div class="top"><b>🎵 Music on the TVs</b><button type="button" class="x" data-a="x" aria-label="Close">✕</button></div><div class="body">' +
    '<div class="mut">Set once: every TV plays it in the background, under its slides. A TV can still pick its own music with its 🎵 button (that TV only). After a TV is switched on or reloaded, one tap on it starts the sound (browsers wait for that).</div>' +
    fld('music', '📺 Back office TVs', 'The back office TV and the personal TV screens.') + fld('lobbyMusic', '🖥 Front room (lobby) TV', 'The customers\' screen — pick something calm.') +
    '<p class="mut">' + esc(NOTE) + '</p><div class="bar"><button type="button" class="b" data-a="x">Cancel</button><button type="button" class="b g" data-a="save">💾 Save for every TV</button></div></div></div>';
  D.body.appendChild(el);
  function check(inp){ var pk = el.querySelector('[data-pk="' + inp.getAttribute('data-k') + '"]'), i = parse(inp.value); if (!i) { pk.className = 'pk'; pk.textContent = 'No company music.'; return true; } pk.className = 'pk ' + (i.ok ? 'ok' : 'no'); pk.textContent = i.ok ? '✓ ' + i.label : '✗ ' + i.why; return i.ok; }
  Array.prototype.forEach.call(el.querySelectorAll('input[data-k]'), function(i){ if (i.value) check(i); });
  el.addEventListener('input', function(e){ if (e.target.hasAttribute('data-k')) check(e.target); });
  el.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-a]'); if (!b) { if (e.target === el) el.remove(); return; }
    var a = b.getAttribute('data-a'); if (a === 'x') return el.remove();
    if (a === 'save') {
      var patch = {}, okAll = true;
      Array.prototype.forEach.call(el.querySelectorAll('input[data-k]'), function(inp){ if (!check(inp)) okAll = false; var i = parse(inp.value); patch[inp.getAttribute('data-k')] = i && i.ok ? i.url : null; });
      if (!okAll) return toast('One of the links is not a YouTube or Spotify link.', true);
      b.disabled = true;
      /* the row also holds the team goals and the TV look: read it first so nothing else is wiped */
      goalsGet().then(function(cur){
        var v = Object.assign({}, cur, patch, { at: new Date().toISOString(), by: me() }); Object.keys(v).forEach(function(k){ if (v[k] === null) delete v[k]; });
        return goalsPut(v).then(function(ok){ b.disabled = false; if (!ok) return toast('Could not save it — try again.', true);
          try { localStorage.setItem('gc_tv_goals_cache', JSON.stringify(v)); } catch (e) {}
          el.remove(); toast('🎵 Saved — every TV picks it up within 5 minutes (one tap on a TV starts the sound).'); sync(true); });
      }, function(){ b.disabled = false; toast('Could not read the TV settings — check the internet and try again.', true); });
    }
  });
  return el;
}
/* the 🎵 Music button in the 📺 TVs row (patch TVFIX draws the row; the button is put back whenever the row is redrawn) */
function adminBtn(){
  if (PAGE !== 'crm') return;
  var row = D.querySelector('#gc-otv-lobbycard.gc-tvs'); if (!row) return;
  var bt = row.querySelector('.bt'); if (!bt || bt.querySelector('[data-tvm-adm]')) return;
  if (!isAdmin()) return;
  var b = D.createElement('button'); b.type = 'button'; b.setAttribute('data-tvm-adm', '1'); b.textContent = '🎵 Music'; b.title = 'Music in the background of every TV (YouTube or Spotify)';
  b.style.background = '#e2e8f0'; b.style.color = '#0f172a';
  b.addEventListener('click', function(e){ e.stopPropagation(); admin(); });
  var sel = bt.querySelector('[data-tvs-def]'); bt.insertBefore(b, sel || null);
}

function boot(){
  if (!D.body) return later(boot, 50);
  ui(); (D.body).appendChild(UI);
  SIV.call(W, function(){ tick(); if (PAGE === 'crm' && TICKS % 2 === 0) { try { adminBtn(); } catch (e) {} } }, 1000);
  later(tick, 200);
}
boot();
W._gcTVM = {
  parse: parse, admin: admin,
  set: function(v){ apply(v); return parse(v); },
  play: function(){ GEST = GEST || activated(); ST.on = true; save(); if (!P.key) sync(true); play(); paint(true); },
  pause: function(){ ST.on = false; keepPos(); save(); pauseP(); paint(true); },
  next: function(){ try { if (P.yt && P.ready) P.yt.nextVideo(); } catch (e) {} },
  vol: function(n){ ST.vol = Math.max(0, Math.min(100, Math.round(+n || 0))); save(); try { if (P.yt && P.ready) P.yt.setVolume(ST.vol); } catch (e) {} },
  hide: function(b){ ST.hide = b !== false; save(); boxLook(); paint(true); },
  useDefault: function(){ ST.src = ''; save(); sync(true); }, off: function(){ ST.src = 'off'; ST.on = false; save(); destroy(); paint(true); },
  open: function(){ OPEN = true; poke(); paint(true); }, close: function(){ OPEN = false; paint(); },
  state: function(){ var tp = UI && UI.querySelector('.tap'), f = BOX && BOX.querySelector('iframe');
    return { page: PAGE, host: HOST.on, src: ST.src, eff: effective(), company: companyMusic(), key: P.key, kind: P.kind, label: P.info ? P.info.label : '', made: P.made, frame: f ? f.__tvm || 0 : 0,
      ready: P.ready, playing: P.playing, want: P.want, on: ST.on, prompt: !!(tp && !tp.hidden), hide: ST.hide, vol: ST.vol, pos: Math.round(ST.pos), idx: ST.idx, err: P.err, fallback: P.fallback,
      open: OPEN, idle: !!(UI && UI.classList.contains('idle')), activated: activated() }; }
};
try { console.log('[GC] TVMUSIC: 🎵 music on the TV (' + PAGE + ') — _gcTVM.state()'); } catch (e) {}
})();
