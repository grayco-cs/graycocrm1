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
  var clean = function(t, n){ return s(t).replace(/eyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]*/g, '[token]').replace(/\b(bearer|token|apikey|password|pw)\b[\s:=]+\S+/gi, '$1 [removed]')
    .replace(/[^\s@]+@[^\s@]+/g, '@').replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, '[removed]').replace(/\s+/g, ' ').trim().slice(0, n || 160); };
  var path = function(u){ return s(u).replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/[?#].*$/, '').slice(0, 80); };

  /* ── this device / this open ── */
  var DEV = get('gc_adm_device_id');
  if (!DEV || !/^[A-Za-z0-9_-]{4,40}$/.test(DEV)) { DEV = 'P' + T0.toString(36) + Math.random().toString(36).slice(2, 6); set('gc_adm_device_id', DEV); }
  var UA = s(NAV.userAgent);
  var mq = function(q){ try { return !!(W.matchMedia && W.matchMedia(q).matches); } catch (e) { return false; } };
  var swUrl = function(){ try { var c = NAV.serviceWorker && NAV.serviceWorker.controller; return c ? path(c.scriptURL) || '?' : ''; } catch (e) { return ''; } };
  var sess = false; try { var a0 = JSON.parse(get('gc_auth_v1') || 'null'); sess = !!(a0 && a0.access_token); } catch (e) {}
  var B = { id: T0.toString(36) + Math.random().toString(36).slice(2, 5), at: new Date(T0).toISOString(), build: '', prev: s(get('gc_build_id')).slice(0, 40),
    ua: UA.slice(0, 160), kind: '', sa: mq('(display-mode: standalone)') || NAV.standalone === true, sw: swUrl(), on: NAV.onLine !== false, sess: sess,
    nav: '', m: {}, si: [], errs: [], stuck: [], p: {} };
  try { var ne = PF.getEntriesByType && PF.getEntriesByType('navigation')[0];
    if (ne) B.nav = s(ne.type) + (ne.deliveryType ? ' ' + ne.deliveryType : '') + (typeof ne.transferSize === 'number' ? ' ts' + ne.transferSize : ''); } catch (e) {}
  var fromCache = function(){
    if (B.sw && !/crm-push-sw\.js$/.test(B.sw)) return 'sw';
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
  try { D.addEventListener('DOMContentLoaded', function(){ mark('html'); B.build = s(W.__GC_BUILD_ID__).slice(0, 40); NST.call(W, checkVersion, 1500); }); } catch (e) {}
  try { W.addEventListener('load', function(){ mark('scripts'); }); } catch (e) {}
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
      if (!pollOn) { pollOn = true; NST.call(W, poll, 250); }   /* signing in again later (after the idle sign-out) is watched too */
    } catch (e) {}
  }, true); } catch (e) {}

  var vis = function(el){ try { return !!(el && el.getClientRects().length); } catch (e) { return false; } };
  var gateUp = function(){ return vis(D.getElementById('gc-auth-email')); };
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
      if (D.querySelector('#root>div>aside')) return 'desk ' + s(get('grayco_view') || 'dashboard').slice(0, 30);
    } catch (e) {}
    return '';
  };
  var onScreen = function(){
    try {
      if (D.getElementById('gc-bootsafe')) return 'the "has not opened yet" panel';
      if (H.classList.contains('gc-boot-field')) return 'spinner (the GrayCo Field splash)';
      if (D.getElementById('gc-boot-cover')) return 'spinner (Loading the CRM…)';
      if (H.classList.contains('gc-applogin')) return 'the app\'s own sign-in screen';
      var r = D.getElementById('root'), tx = r ? s(r.textContent).replace(/\s+/g, ' ').trim() : '';
      if (!r || !r.firstElementChild || tx.length < 20) return 'blank' + (tx ? ': ' + clean(tx, 40) : '');
      if (/loading|please wait/i.test(tx.slice(0, 200))) return 'spinner: ' + clean(tx, 60);
      return 'other: ' + clean(tx, 60);
    } catch (e) { return '?'; }
  };
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
      var fs = firstScreen();
      if (fs && mark('paint', fs)) { dirty = true; B.view = fs; heartbeat(); }
      /* stuck: nothing to use 20 s after the start, or after the sign-in */
      var since = Math.max(0, B.m.signed || 0);
      if (B.m.paint == null && !g && ms() - since > 20000) stuck('screen', (B.m.signed != null ? 'signed in, ' : '') + 'no first screen ' + Math.round((ms() - since) / 1000) + ' s: ' + onScreen());
      if (att && !att.err && !att.ok && ms() - att.t > 20000) stuck('signin', 'Sign in pressed, no answer in 20 s' + (lastMsg ? ': ' + lastMsg : ''));
    } catch (e) {}
    cost += pnow() - c0;
    var waiting = att && !att.err && !att.ok && ms() - att.t < 60000;
    if ((B.m.paint != null && !waiting) || (Date.now() - T0 > 15 * 60e3 && !waiting)) { pollOn = false; return; }
    NST.call(W, poll, gateUp() ? 500 : 250);
  };
  pollOn = true; NST.call(W, poll, 250);

  /* ── an old build: /version.txt (no-store) against this page's build ── */
  var num = function(v){ var m = /^(\d+)\.(\d+)(?:-(\d{4}-\d\d-\d\d))?(.*)$/.exec(s(v).trim()); return m ? [+m[1], +m[2], m[3] || '', m[4] || ''] : null; };
  var older = function(mine, live){
    mine = s(mine).trim(); live = s(live).trim(); if (!mine || !live || mine === live) return false;
    var a = num(mine), b = num(live); if (!a || !b) return false;
    for (var i = 0; i < 4; i++) { if (a[i] < b[i]) return true; if (a[i] > b[i]) return false; }
    return false;
  };
  var LIVE = { v: '', at: 0 }, checking = null;
  var fetchLive = function(){
    if (checking) return checking;
    checking = NF.call(W, '/version.txt?t=' + Date.now(), { cache: 'no-store' }).then(function(r){ return r && r.ok ? r.text() : ''; }, function(){ return ''; })
      .then(function(v){ checking = null; v = s(v).trim().slice(0, 60); if (v) LIVE = { v: v, at: Date.now() }; return v; });
    return checking;
  };
  function checkVersion(resumed){
    return fetchLive().then(function(live){
      var mine = B.build = s(W.__GC_BUILD_ID__ || B.build).slice(0, 40);
      if (!older(mine, live)) return false;
      var src = fromCache();
      var healed = +get(HEAL_K) || 0, recent = healed && Date.now() - healed < 10 * 60e3;
      B.old = { mine: mine, live: live, src: src || (resumed ? 'resumed' : 'network'), t: ms() };
      if (recent) B.old.afterUpdate = Math.round((Date.now() - healed) / 1000) + ' s after Tap to update';
      problem('old');
      /* the banner: a cached / service-worker copy, an app back from the background, or the sign-in screen (the CRM's own
         update bar cannot show over it); a fresh page while signed in gets the CRM's own bar (same update) */
      if (!recent && (src || resumed || gateUp() || !authed())) banner(live);
      return true;
    });
  }
  /* the home-screen app comes back from the background (not a new open): look again, at most every 10 minutes */
  var lastResume = 0;
  var resume = function(){ if (D.visibilityState === 'hidden' || Date.now() - lastResume < 10 * 60e3 || Date.now() - T0 < 60e3) return; lastResume = Date.now(); checkVersion(true); };
  try { D.addEventListener('visibilitychange', resume); W.addEventListener('pageshow', function(e){ if (e && e.persisted) { lastResume = 0; resume(); } }); } catch (e) {}

  var bar = null;
  function banner(live){
    try {
      if (bar && bar.isConnected) return;
      var old = D.getElementById('gc-update-bar'); if (old) old.remove();
      bar = D.createElement('div'); bar.id = 'gc-bw-update'; bar.setAttribute('data-gc-keep', '1'); bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:auto;height:auto;overflow:visible;z-index:2147483647;margin:0;border:0;width:100%;max-width:none;box-sizing:border-box;padding:calc(10px + env(safe-area-inset-top,0px)) 16px 10px;' +
        'background:#2563eb;color:#fff;font:700 15px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Inter,sans-serif;text-align:center;cursor:pointer;';
      bar.innerHTML = '<button type="button" id="gc-bw-update-btn" style="all:unset;cursor:pointer;display:block;width:100%">A newer version is ready — Tap to update</button>';
      bar.title = 'This copy: ' + B.build + ' · on the server: ' + live;
      bar.addEventListener('click', function(ev){ try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {} update(); }, true);
      try { bar.setAttribute('popover', 'manual'); } catch (e) {}
      H.appendChild(bar);   /* after <body>: above the sign-in screen even without the top layer */
      try { if (bar.showPopover) bar.showPopover(); } catch (e) {}
      B.banner = ms(); dirty = true;
    } catch (e) {}
  }
  /* Tap to update: this site's caches emptied, its old service workers removed (the AWAY rule: never /crm-push-sw.js, the
     phone notifications — it has no cache and no fetch handler), then ONE reload. At most once per 10 minutes. */
  var updating = false;
  function update(){
    var last = +get(HEAL_K) || 0;
    if (updating || (last && Date.now() - last < 10 * 60e3)) {
      try { var b = D.getElementById('gc-bw-update-btn'); if (b) b.textContent = 'Just updated — if this stays, close the app and open it again.'; } catch (e) {}
      return false;
    }
    updating = true; set(HEAL_K, String(Date.now())); B.heal = ms(); B.p.heal = 1; dirty = true; send('update');
    try { var b2 = D.getElementById('gc-bw-update-btn'); if (b2) b2.textContent = 'Updating…'; } catch (e) {}
    var jobs = [];
    try { if (NAV.serviceWorker && NAV.serviceWorker.getRegistrations) jobs.push(NAV.serviceWorker.getRegistrations().then(function(rs){
      return Promise.all(rs.map(function(w){ var u = ''; try { u = s((w.active || w.waiting || w.installing || {}).scriptURL); } catch (e) {} return /\/crm-push-sw\.js(\?|$)/.test(u) ? null : w.unregister(); })); })); } catch (e) {}
    try { if (typeof caches !== 'undefined' && caches.keys) jobs.push(caches.keys().then(function(k){ return Promise.all(k.map(function(n){ return caches.delete(n); })); })); } catch (e) {}
    var go = false, reload = function(){
      if (go) return; go = true;
      W.__GC_USER_WANTS_RELOAD__ = true;   /* a person asked: the CRM's reload guard lets it through */
      try { if (typeof W._gcReloadNow === 'function') W._gcReloadNow(); else W.location.reload(); } catch (e) { try { W.location.reload(); } catch (x) {} }
    };
    Promise.all(jobs).then(reload, reload); NST.call(W, reload, 2500);
    return true;
  }

  /* ── sending ── */
  var isProblem = function(){ for (var k in B.p) return true; return false; };
  function heartbeat(){ if (get(HB_K) !== day()) { hbDue = true; NST.call(W, function(){ send('hb'); }, 1500); } }
  function soon(){ if (!timer) timer = NST.call(W, function(){ timer = null; send('problem'); }, 1500); }
  var kind = function(){ try { var k = W._gcDevice && W._gcDevice.kind ? W._gcDevice.kind() : ''; if (k) return k === 'computer' ? 'pc' : k; } catch (e) {} return /iPhone|iPod|Android.*Mobile/i.test(UA) ? 'phone' : /iPad|Android/i.test(UA) ? 'tablet' : 'pc'; };
  var prevBoot = function(){ var v = get(PEND_K); if (!v || v.length > 3500) return null; try { var pv = JSON.parse(v); return pv && pv.id && pv.id !== B.id ? pv : null; } catch (e) { del(PEND_K); return null; } };
  var savePend = function(){ try { var j = JSON.stringify(B); if (j.length < 3500) set(PEND_K, j); } catch (e) {} };
  function payload(why){
    B.kind = kind(); B.on = NAV.onLine !== false; B.sw = swUrl() || B.sw; B.why = why; B.t = ms();
    if (!B.build) B.build = s(W.__GC_BUILD_ID__).slice(0, 40);
    if (hbDue) B.hb = day();
    var o = { v: 1, dev: DEV, boot: B }, pv = prevBoot(); if (pv) o.prevBoot = pv;
    var j = JSON.stringify(o);
    if (j.length > 7800) { delete o.prevBoot; B.errs = B.errs.slice(0, 3); B.stuck = B.stuck.slice(0, 3); B.si = B.si.slice(-2); j = JSON.stringify(o); }
    return { o: o, j: j };
  }
  /* the function's limits, kept here too: a new open 30 s after this device's last send; the same open again after 3 s, 6 times */
  var mayNow = function(){
    var t = Date.now(); if (sentN >= 6) return -1;
    if (!sentN) { var la = +get(LAST_K) || 0; return !la || la > t || t - la >= 30000 ? 0 : 30000 - (t - la); }
    return t - lastSent >= 3000 ? 0 : 3000 - (t - lastSent);
  };
  function send(why, final){
    try {
      var hb = hbDue, pv = prevDue && !!get(PEND_K);
      if (!hb && !pv && !(dirty && isProblem())) return false;
      if (NAV.onLine === false) { if (isProblem()) savePend(); return false; }   /* sent when the signal is back, or with the next open */
      var wait = mayNow();
      if (wait < 0) return false;
      if (wait > 0 && !final) { if (!timer) timer = NST.call(W, function(){ timer = null; send(why); }, wait + 50); return false; }
      var p = payload(why), body = p.j, ok = false;
      dirty = false; prevDue = false; lastSent = Date.now(); sentN++; set(LAST_K, String(lastSent));
      var done = function(){ if (hb) { set(HB_K, day()); hbDue = false; } del(PEND_K); };
      var fail = function(){ dirty = true; if (hb) hbDue = true; if (isProblem()) savePend(); };
      if (hb) hbDue = false;
      /* signed in: fetch (the sign-in layer adds the token, so the function knows who); else a beacon */
      if (authed() && typeof W.fetch === 'function') {
        try { W.fetch(URL_FN, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } })
          .then(function(r){ if (r && r.ok) done(); else fail(); }, fail); ok = true; } catch (e) { ok = false; }
      }
      if (!ok && NAV.sendBeacon) { try { ok = NAV.sendBeacon(URL_FN, body); if (ok) done(); } catch (e) { ok = false; } }
      if (!ok && typeof NF === 'function') { try { NF.call(W, URL_FN, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).then(function(r){ if (r && r.ok) done(); else fail(); }, fail); ok = true; } catch (e) {} }
      if (!ok) fail();
      return ok;
    } catch (e) { return false; }
  }
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
