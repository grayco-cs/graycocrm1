/* __GC_PATCH_BOOTWATCH__ — the sign-in watch: people who CANNOT get in are seen (tools/patch_BOOTWATCH.py).
   11/18: a PM could not open GrayCo Field on his phone and nobody knew. The device report (PERFREP, gc_perfrep_<device>) only
   goes out AFTER sign-in, so a phone stuck before that (an old cached copy, a sign-in that fails, a page that never draws)
   was invisible. This tiny script runs on every open, signed in or not, and writes down this open ("boot"):
     the device (gc_adm_device_id, the same id as PERFREP), the build, phone / tablet / pc, the home-screen app or a browser
     tab, which service worker controls the page, online or not; and each step with its time (ms since the page started):
       html  the page was read      scripts  every script loaded      gate  the sign-in screen showed
       try   Sign in was pressed (the e-mail's DOMAIN and a short hash of the e-mail only — never the password)
       err   the sign-in screen's error text      signed  signed in      paint  the first screen (Desk or Field, which view)
     page errors before the first screen; "stuck": no first screen 20 s after the start / the sign-in (what was on screen:
     a spinner, a blank page …), a sign-in that never answered, the sign-in screen left without signing in; and an OLD build
     (this page's build is older than /version.txt on the server).
   It is sent to OUR function /.netlify/functions/bootwatch (a signed-out page cannot write gc_kv; the function stores it in
   gc_kv gc_bootrep_<device>, the last 20 opens) — ONLY when something went wrong (each error once a day), plus one
   heartbeat a day per device once the first screen is on. navigator.sendBeacon, fetch keepalive as the fallback; while
   signed in, fetch, so the function can read the signed-in e-mail from the sign-in token itself. A send that never left
   (no signal) is sent with the next open.
   An OLD build at open (or after the app comes back from the background), served by a service worker or the browser's cache,
   or behind the sign-in screen: a small plain banner "A newer version is ready — Tap to update": the tap empties this site's
   caches, removes its old service workers (never the phone-notifications one, /crm-push-sw.js: it has no cache and serves
   nothing) and reloads — at most once per 10 minutes, never by itself. The CRM's own "Yes, update" button uses the same.
   Cost: a few small reads now; a cheap look every 250-500 ms until the first screen. Console: _gcBootWatch.state()
   Off on this device: localStorage gc_bootwatch_off = '1'. */
(function(){
'use strict';
var W = window, D = document;
try {
  if (W._gcBootWatch) return;
  var T0 = Date.now(), PF = W.performance, pnow = function(){ try { return PF.now(); } catch (e) { return Date.now() - T0; } };
  var C0 = pnow(), cost = 0, polls = 0, syncMs = 0;
  var dirty = false, sentN = 0, lastSent = 0, timer = null, hbDue = false, prevDue = false, pollOn = false, att = null;
  var LS = null, SS = null; try { LS = W.localStorage; } catch (e) {} try { SS = W.sessionStorage; } catch (e) {}
  var get = function(k){ try { return LS ? LS.getItem(k) : null; } catch (e) { return null; } };
  var set = function(k, v){ try { if (LS) LS.setItem(k, v); } catch (e) {} };
  var del = function(k){ try { if (LS) LS.removeItem(k); } catch (e) {} };
  if (get('gc_bootwatch_off') === '1') return;
  var NST = W.setTimeout, NF = W.fetch, NAV = W.navigator || {};
  var URL_FN = '/.netlify/functions/bootwatch', HEAL_K = 'gc_bw_heal_at', HB_K = 'gc_bw_hb', PEND_K = 'gc_bw_pend', SIG_K = 'gc_bw_sig', LAST_K = 'gc_bw_last';
  var s = function(v){ return v == null ? '' : String(v); };
  var ms = function(){ return Math.round(pnow()); };
  var day = function(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  /* nothing that looks like an address, a token or a long secret ever leaves in a text */
  var clean = function(t, n){ return s(t).replace(/eyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]*/g, '[token]').replace(/\bbearer\s+\S+/gi, 'bearer [removed]').replace(/\b(token|apikey|password|passwd|pwd|pw|secret)\s*[:=]\s*\S+/gi, '$1=[removed]')
    .replace(/[^\s@]+@[^\s@]+/g, '@').replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, '[removed]').replace(/\s+/g, ' ').trim().slice(0, n || 160); };
  var path = function(u){ return s(u).replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/[?#].*$/, '').slice(0, 80); };

  /* ── this device / this open ── */
  var DEV = get('gc_adm_device_id');
  if (!DEV || !/^[A-Za-z0-9_-]{4,40}$/.test(DEV)) { DEV = 'P' + T0.toString(36) + Math.random().toString(36).slice(2, 6); set('gc_adm_device_id', DEV); }
  var UA = s(NAV.userAgent);
  var mq = function(q){ try { return !!(W.matchMedia && W.matchMedia(q).matches); } catch (e) { return false; } };
  var swUrl = function(){ try { var c = NAV.serviceWorker && NAV.serviceWorker.controller; return c ? path(c.scriptURL) || '?' : ''; } catch (e) { return ''; } };
  var sess = /"access_token"/.test(s(get('gc_auth_v1')));
  var B = { id: T0.toString(36) + Math.random().toString(36).slice(2, 5), at: new Date(T0).toISOString(), build: '', prev: s(get('gc_build_id')).slice(0, 40),
    ua: UA.slice(0, 160), kind: '', sa: NAV.standalone === true, sw: '', on: NAV.onLine !== false, sess: sess,
    nav: '', m: {}, si: [], errs: [], stuck: [], p: {} };
  /* read when the page is in (the load event), not now: nothing here may slow the open */
  var navInfo = function(){ try { var ne = PF.getEntriesByType && PF.getEntriesByType('navigation')[0];
    if (ne) B.nav = s(ne.type) + (ne.deliveryType ? ' ' + ne.deliveryType : '') + (typeof ne.transferSize === 'number' ? ' ts' + ne.transferSize : ''); } catch (e) {}
    if (!B.sa) B.sa = mq('(display-mode: standalone)'); };
  var fromCache = function(){
    B.sw = swUrl() || B.sw; if (B.sw && !/crm-push-sw\.js$/.test(B.sw)) return 'sw';
    try { var e = PF.getEntriesByType('navigation')[0]; if (e && (e.deliveryType === 'cache' || (e.transferSize === 0 && e.decodedBodySize > 0))) return 'http-cache'; } catch (x) {}
    return '';
  };
  var mark = function(k, v){ if (B.m[k] == null) { B.m[k] = ms(); if (v != null) B.m[k + 'V'] = v; return true; } return false; };
  var problem = function(k, v){ var n = !B.p[k]; B.p[k] = v || 1; dirty = true; if (n) soon(); };

  /* ── page errors before the first screen ── */
  var onErr = function(ev){
    try {
      if (B.m.paint != null || B.errs.length >= 6) return;
      var t = ev && ev.target, m;
      if (t && t !== W && t.tagName) m = 'load ' + s(t.tagName).toLowerCase() + ' ' + path(t.src || t.href);
      else if (ev && 'reason' in ev) { var r = ev.reason; m = 'promise: ' + clean(r && r.message || r, 140); }
      else m = clean(ev && ev.message, 140) + (ev && ev.lineno ? ' @' + path(ev.filename) + ':' + ev.lineno + ':' + (ev.colno || 0) : '');
      B.errs.push({ t: ms(), m: m });
      /* the same error on every open is sent once a day, not on every open */
      var sig = day() + ' ' + m.slice(0, 60), seen = s(get(SIG_K));
      if (seen.indexOf(sig) < 0) { set(SIG_K, ((seen.indexOf(day()) === 0 ? seen + '\n' : '') + sig).slice(-1500)); problem('err'); }
    } catch (e) {}
  };
  try { W.addEventListener('error', onErr, true); W.addEventListener('unhandledrejection', onErr); } catch (e) {}

  /* ── the steps ── */
  /* the page itself: first byte (ttfb) and the whole page downloaded (dl) from the browser's own timing; read (html); the load
     event (load: every script in); the app ready (the CRM's data object, React drawn) — real phone load times */
  var NS_K = 'gc_bw_ns', BY_K = 'gc_bw_bytes';
  try { D.addEventListener('DOMContentLoaded', function(){ mark('html'); B.build = s(W.__GC_BUILD_ID__).slice(0, 40); try { set(NS_K, String(D.scripts.length)); } catch (e) {} NST.call(W, checkVersion, 1500); }); } catch (e) {}
  try { W.addEventListener('load', function(){
    mark('load'); navInfo(); B.sw = swUrl(); if (W._crm || H.classList.contains('_fieldmode')) mark('ready');
    try { var e = PF.getEntriesByType('navigation')[0]; if (e) { if (e.responseStart > 0) B.m.ttfb = Math.round(e.responseStart); if (e.responseEnd > 0) B.m.dl = Math.round(e.responseEnd);
      B.bytes = { tr: e.transferSize || 0, enc: e.encodedBodySize || 0, dec: e.decodedBodySize || 0 }; if (e.encodedBodySize > 1e5) set(BY_K, String(e.encodedBodySize)); } } catch (x) {}
  }); } catch (e) {}
  /* Sign in pressed: the e-mail's domain and a hash — the password field is never read */
  var hash = function(t){
    var h1 = 0x811c9dc5, h2 = 0x1b873593;
    for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822507) >>> 0; }
    return ('0000000' + h1.toString(16)).slice(-8) + ('0000000' + h2.toString(16)).slice(-4);
  };
  try { D.addEventListener('submit', function(ev){
    try {
      var f = ev.target, em = f && f.querySelector && f.querySelector('#gc-auth-email'); if (!em) return;
      var v = s(em.value).trim().toLowerCase(), at = v.lastIndexOf('@');
      att = { t: ms(), dom: at > 0 ? v.slice(at + 1).slice(0, 60) : (v ? '(no @)' : '(empty)'), h: v ? hash(v) : '', on: NAV.onLine !== false };
      if (B.si.length >= 4) B.si.shift(); B.si.push(att); mark('try'); dirty = true; lastMsg = '\u0000';
      watchGate();
      if (!pollOn) { pollOn = true; NST.call(W, poll, 400); }   /* signing in again later (after the idle sign-out) is watched too */
    } catch (e) {}
  }, true); } catch (e) {}

  /* the sign-in screen is in the page only while it shows (it is removed when hidden): no layout is forced to know it */
  var gateUp = function(){ return !!D.getElementById('gc-auth-email'); };
  var authed = function(){ try { var A = W.__GC_AUTH__; return A && A.email && A.email() ? s(A.mode && A.mode()) || 'on' : ''; } catch (e) { return ''; } };
  var H = D.documentElement;
  var firstScreen = function(){
    try {
      if (gateUp() || H.classList.contains('gc-boot-field') || H.classList.contains('gc-applogin')) return '';
      if (H.classList.contains('_fieldmode')) {
        if (D.getElementById('_gcJobDash')) return 'field job';
        if (D.getElementById('_gcJobPick') || D.getElementById('_gcFieldHomeOv')) return 'field home';
        return '';
      }
      var r = D.getElementById('root'), c = r && r.firstElementChild;
      if (c && c.tagName === 'DIV') for (var k = c.firstElementChild; k; k = k.nextElementSibling) if (k.tagName === 'ASIDE') return 'desk ' + s(get('grayco_view') || 'dashboard').slice(0, 30);
    } catch (e) {}
    return '';
  };
  /* the rest (the progress screen, the update banner, sending) is compiled only when first needed: a normal open never pays
     for it before its first screen (tools/bootwatch_late.js: the patch puts it just before this script as <script type="text/plain">) */
  var onScreenImpl = null, drawImpl = null, bannerImpl = null, updateImpl = null, sendImpl = null, bar = null, lateOn = false;
  function L(){ if (lateOn) return; lateOn = true; try { var t = D.getElementById('gc-bw-late'); eval(t ? t.textContent : ''); } catch (e) { try { console.warn('[GC] BOOTWATCH late part:', e && e.message || e); } catch (x) {} } }
  var onScreen = function(){ L(); return onScreenImpl ? onScreenImpl() : '?'; };
  function banner(live){ L(); if (bannerImpl) bannerImpl(live); }
  function update(){ L(); return updateImpl ? updateImpl() : false; }
  function send(why, final){ L(); return sendImpl ? sendImpl(why, final) : false; }
  var stuck = function(k, why){ if (B.stuck.length < 5 && !B.p['stuck_' + k]) { B.stuck.push({ t: ms(), k: k, why: why, on: NAV.onLine !== false }); B.p['stuck_' + k] = 1; problem('stuck'); } };
  var lastMsg = '';
  var poll = function(){
    var c0 = pnow(); polls++;
    try {
      if (!B.build) B.build = s(W.__GC_BUILD_ID__).slice(0, 40);
      var g = gateUp(), au = authed();
      if (g && mark('gate')) dirty = true;
      /* the sign-in screen's message: an error is red (Signing in… / Opening … are green) */
      var mg = g ? D.getElementById('gc-auth-msg') : null, tx = mg ? clean(mg.textContent, 160) : '';
      if (tx !== lastMsg) {
        lastMsg = tx;
        var green = mg && /22,\s*101,\s*52|166534/i.test(s(mg.style && mg.style.color));
        if (tx && !green) {
          if (att && !att.err && !att.ok) { att.err = tx; att.errT = ms(); mark('err', tx); problem('signin'); }
          else if (!B.m.gate || ms() - B.m.gate < 1500) B.gateMsg = tx;     /* why the sign-in screen showed (signed out after 8 h …) */
        }
      }
      if (au && mark('signed', au)) dirty = true;
      if (au && att && !att.ok && !att.err) { att.ok = ms(); dirty = true; }
      /* the app ready: every script in AND the CRM's data object (React draws its own screens long before the page is in) */
      if (B.m.ready == null && B.m.load != null && (W._crm || H.classList.contains('_fieldmode'))) mark('ready');
      var fs = firstScreen();
      if (fs && mark('paint', fs)) { dirty = true; B.view = fs; heartbeat(); }
      opening(g, au);
      /* stuck: nothing to use 20 s after the start, or after the sign-in */
      var since = Math.max(0, B.m.signed || 0);
      if (B.m.paint == null && !g && ms() - since > 20000) stuck('screen', (B.m.signed != null ? 'signed in, ' : '') + 'no first screen ' + Math.round((ms() - since) / 1000) + ' s: ' + onScreen());
      if (att && !att.err && !att.ok && ms() - att.t > 20000) stuck('signin', 'Sign in pressed, no answer in 20 s' + (lastMsg ? ': ' + lastMsg : ''));
    } catch (e) {}
    cost += pnow() - c0;
    var waiting = att && !att.err && !att.ok && ms() - att.t < 60000;
    if ((B.m.paint != null && !waiting && !cov) || (Date.now() - T0 > 15 * 60e3 && !waiting)) { pollOn = false; opening(true, ''); return; }
    NST.call(W, poll, gateUp() ? 800 : 400);
  };
  pollOn = true; NST.call(W, poll, 400);

  /* ── signed in before the app is ready: "Opening GrayCo Field…" with a progress bar, never a blank / frozen page ──
     The page is ~7 MB to download: the sign-in box shows in under a second, the rest can take 10-20 s on a phone's signal.
     Shown only while signed in, with no first screen yet, nothing else covering the page (the sign-in screen, the Field
     splash, "Loading the CRM…") for 600 ms. Progress: while the page arrives, how much of it has been read (its scripts
     counted against the last open's count, with the last open's size in MB); then "Starting" (read) and "Loading your jobs"
     (every script in). Gone the moment the first screen is on (or 10 s after the app is ready, whatever it shows). After 45 s:
     "Still loading — weak signal? Tap to retry" and a stuck report. On a fast open it never appears. */
  var cov = null, covWant = 0, covSlow = false, gateMo = null;
  /* Sign in pressed: the moment the sign-in screen goes (signed in), the progress screen is there — not 400 ms later. Watched
     only from the press until the screen goes (or 60 s). */
  function watchGate(){
    try {
      if (gateMo || typeof MutationObserver !== 'function') return;
      gateMo = new MutationObserver(function(){ try { if (!gateUp() && authed()) { gateMo.disconnect(); gateMo = null; if (B.m.paint == null) { mark('signed', authed()); opening(false, authed(), true); } } } catch (e) {} });
      gateMo.observe(H, { childList: true, subtree: false }); if (D.body) gateMo.observe(D.body, { childList: true, subtree: false });
      NST.call(W, function(){ if (gateMo) { gateMo.disconnect(); gateMo = null; } }, 60000);
    } catch (e) {}
  }
  /* the CRM's own old sign-in screen while signed in here is a step (patch SIGNIN finds the person and reopens): covered 8 s */
  var appLog = 0;
  var other = function(){
    if (H.classList.contains('gc-applogin')) { if (!appLog) appLog = ms(); if (ms() - appLog > 8000) return true; } else appLog = 0;
    return H.classList.contains('gc-boot-field') || !!D.getElementById('gc-boot-cover') || !!D.getElementById('gc-bootsafe');
  };
  function opening(g, au, now){
    try {
      var since = Math.max(B.m.signed || 0, B.m.try || 0);
      /* 45 s after signing in (or opening signed in) with nothing to use: shown over anything (the Field splash too) */
      var late45 = B.m.signed != null && ms() - since > 45000;
      var want = !!au && !g && B.m.paint == null && !(B.m.ready != null && ms() - B.m.ready > 10000) && (!other() || covSlow || late45);
      if (!want) { covWant = 0; if (cov) { try { cov.remove(); } catch (e) {} cov = null; B.m.coverOff = ms(); } return; }
      if (!covWant) covWant = ms();
      if (!cov && !now && !(B.m.try != null && B.m.signed != null) && ms() - covWant < 600) return;   /* right after a sign-in: at once */
      L(); if (drawImpl) drawImpl(since);
      /* signed in before the app was ready (or the progress screen up 3 s): reported, with how long it took */
      if (cov && !B.p.opening && (B.m.try != null || ms() - B.m.cover > 3000)) problem('opening');
    } catch (e) {}
  }


  /* ── an old build: /version.txt (no-store) against this page's build ── */
  var LIVE = { v: '', at: 0 }, olderImpl = null, checkImpl = null;
  var older = function(mine, live){ L(); return olderImpl ? olderImpl(mine, live) : false; };
  function checkVersion(resumed){ L(); return checkImpl ? checkImpl(resumed) : Promise.resolve(false); }
  /* the home-screen app comes back from the background (not a new open): look again, at most every 10 minutes */
  var lastResume = 0;
  var resume = function(){ if (D.visibilityState === 'hidden' || Date.now() - lastResume < 10 * 60e3 || Date.now() - T0 < 60e3) return; lastResume = Date.now(); checkVersion(true); };
  try { D.addEventListener('visibilitychange', resume); W.addEventListener('pageshow', function(e){ if (e && e.persisted) { lastResume = 0; resume(); } }); } catch (e) {}

  /* ── sending ── */
  var isProblem = function(){ for (var k in B.p) return true; return false; };
  /* once a day, when the first screen is on — sent when the page is in (so it carries the real load times), 30 s at most */
  function heartbeat(){ if (get(HB_K) === day()) return; hbDue = true; var t0 = Date.now();
    var go = function(){ if (B.m.load == null && Date.now() - t0 < 30000) { NST.call(W, go, 1000); return; } send('hb'); }; NST.call(W, go, 1500); }
  function soon(){ if (!timer) timer = NST.call(W, function(){ timer = null; send('problem'); }, 1500); }
  var leaving = function(){
    try {
      if (gateUp() && B.m.signed == null && !authed() && !B.p.gate) { B.p.gate = 1; B.left = ms(); dirty = true; }   /* the sign-in screen left without getting in */
      if (dirty && isProblem()) send('leave', true);
    } catch (e) {}
  };
  try { W.addEventListener('pagehide', leaving); D.addEventListener('visibilitychange', function(){ if (D.visibilityState === 'hidden') leaving(); }); } catch (e) {}
  try { W.addEventListener('online', function(){ if ((dirty && isProblem()) || get(PEND_K)) { prevDue = true; send('online'); } }); } catch (e) {}
  /* an open that went wrong and never got out (no signal): sent with this open */
  if (get(PEND_K)) NST.call(W, function(){ if (!sentN && get(PEND_K)) { prevDue = true; send('prev'); } }, 4000);

  W._gcBootWatch = {
    state: function(){ return { dev: DEV, boot: JSON.parse(JSON.stringify(B)), sent: sentN, live: LIVE.v, cost: { syncMs: +syncMs.toFixed(3), pollMs: +cost.toFixed(3), polls: polls } }; },
    older: older, update: update, banner: function(){ return !!(bar && bar.isConnected); },
    /* the CRM's own version check uses the answer this open already has (no second request) */
    live: function(maxAge){ return LIVE.v && Date.now() - LIVE.at < (maxAge || 60000) ? LIVE.v : ''; },
    send: function(){ dirty = true; return send('manual'); }
  };
  syncMs = pnow() - C0;
} catch (e) { try { console.warn('[GC] BOOTWATCH not installed:', e && e.message || e); } catch (x) {} }
})();
