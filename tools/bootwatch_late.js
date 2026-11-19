/* tools/bootwatch_late.js — patch BOOTWATCH, the part of tools/bootwatch_early.js that is compiled only when first needed
   (eval'd inside that script, so it shares its variables): what was on screen, the "Opening GrayCo Field…" progress screen,
   the "Tap to update" banner and its update, the version check, and sending. tools/patch_BOOTWATCH.py puts it in the page just
   before the early script as <script type="text/plain" id="gc-bw-late"> (not compiled until needed; its notes dropped). */
  onScreenImpl = function(){ var u = under(); return cov ? 'the Opening progress screen (' + stage()[1] + ') over ' + u : u; };
  var under = function(){
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
  var stage = function(){
    var nsT = +get(NS_K) || 900, mb = (+get(BY_K) || 0) / 1048576;
    if (D.readyState === 'loading') { var p = Math.max(3, Math.min(88, Math.round(D.scripts.length / nsT * 88)));
      return [p, 'Downloading the app' + (mb > 0.5 ? ' — ' + Math.round(p / 88 * 100) + '% of about ' + mb.toFixed(1) + ' MB' : ' — ' + Math.round(p / 88 * 100) + '%')]; }
    if (B.m.load == null) return [92, 'Starting the app…'];
    return [97, 'Loading your jobs…'];
  };
  drawImpl = function(since){
    try {
      var fld = true; try { fld = W._gcDevice && W._gcDevice.fieldDevice ? !!W._gcDevice.fieldDevice() : /iPhone|iPod|iPad|Android/i.test(UA); } catch (e) {}
      if (!cov) {
        cov = D.createElement('div'); cov.id = 'gc-bw-opening'; cov.setAttribute('data-gc-keep', '1'); cov.setAttribute('data-gcnav-ignore', '1'); cov.setAttribute('role', 'status'); cov.setAttribute('aria-live', 'polite');
        cov.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:24px;box-sizing:border-box;z-index:2147483646;background:#fff;color:#0f2440;display:flex;flex-direction:column;' +
          'align-items:center;justify-content:center;gap:14px;font:600 15px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Inter,sans-serif;text-align:center;-webkit-user-select:none;user-select:none';
        cov.innerHTML = '<img src="grayco-logo.jpg" alt="" style="width:84px;height:84px;border-radius:20px;object-fit:contain;box-shadow:0 6px 24px rgba(15,36,64,.14)" onerror="this.style.display=\'none\'">' +
          '<div id="gc-bw-op-t" style="font-size:22px;font-weight:800">' + (fld ? 'Opening GrayCo Field…' : 'Opening the CRM…') + '</div>' +
          '<div style="width:min(320px,80vw);height:8px;border-radius:4px;background:#e2e8f0;overflow:hidden"><div id="gc-bw-op-bar" style="height:100%;width:3%;background:#2563eb;border-radius:4px;transition:width .4s"></div></div>' +
          '<div id="gc-bw-op-s" style="color:#475569;font-size:14px;min-height:20px"></div>';
        cov.addEventListener('click', function(){ if (!covSlow) return; B.retry = ms(); dirty = true; send('retry', true); W.__GC_USER_WANTS_RELOAD__ = true; try { if (typeof W._gcReloadNow === 'function') W._gcReloadNow(); else W.location.reload(); } catch (e) {} });
        H.appendChild(cov); mark('cover'); dirty = true;
      }
      var st = stage(), bar = D.getElementById('gc-bw-op-bar'), sub = D.getElementById('gc-bw-op-s');
      if (bar) bar.style.width = st[0] + '%';
      if (ms() - since > 45000 && !covSlow) {
        covSlow = true; mark('slow'); stuck('slow', 'signed in, not ready after 45 s: ' + st[1] + (NAV.onLine === false ? ' (offline)' : ''));
        var t = D.getElementById('gc-bw-op-t'); if (t) t.textContent = 'Still loading — weak signal?';
        cov.style.cursor = 'pointer';
      }
      if (sub) {
        /* slow: the "Tap to retry" button stays, with the stage under it */
        var h = covSlow ? '<b style="display:inline-block;margin-top:6px;padding:10px 22px;border-radius:8px;background:#2563eb;color:#fff">Tap to retry</b><br><span style="font-size:12px">' + st[1] + '</span>' : '';
        if (covSlow) { if (sub.getAttribute('data-s') !== h) { sub.innerHTML = h; sub.setAttribute('data-s', h); } } else sub.textContent = st[1];
      }
    } catch (e) {}
  };
  bannerImpl = function(live){
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
  };
  /* Tap to update: this site's caches emptied, its old service workers removed (the AWAY rule: never /crm-push-sw.js, the
     phone notifications — it has no cache and no fetch handler), then ONE reload. At most once per 10 minutes. */
  var updating = false;
  updateImpl = function(){
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
  };

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
  sendImpl = function(why, final){
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
      /* signed in: fetch (the sign-in layer adds the token, so the function knows who); else — and when the page is being
         left, where only a beacon is sure to get out — a beacon */
      if (!final && authed() && typeof W.fetch === 'function') {
        try { W.fetch(URL_FN, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } })
          .then(function(r){ if (r && r.ok) done(); else fail(); }, fail); ok = true; } catch (e) { ok = false; }
      }
      if (!ok && NAV.sendBeacon) { try { ok = NAV.sendBeacon(URL_FN, body); if (ok) done(); } catch (e) { ok = false; } }
      if (!ok && typeof NF === 'function') { try { NF.call(W, URL_FN, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).then(function(r){ if (r && r.ok) done(); else fail(); }, fail); ok = true; } catch (e) {} }
      if (!ok) fail();
      return ok;
    } catch (e) { return false; }
  };

  /* ── an old build: /version.txt (no-store) against this page's build ── */
  var num = function(v){ var m = /^(\d+)\.(\d+)(?:-(\d{4}-\d\d-\d\d))?(.*)$/.exec(s(v).trim()); return m ? [+m[1], +m[2], m[3] || '', m[4] || ''] : null; };
  olderImpl = function(mine, live){
    mine = s(mine).trim(); live = s(live).trim(); if (!mine || !live || mine === live) return false;
    var a = num(mine), b = num(live); if (!a || !b) return false;
    for (var i = 0; i < 4; i++) { if (a[i] < b[i]) return true; if (a[i] > b[i]) return false; }
    return false;
  };
  var checking = null;
  var fetchLive = function(){
    if (checking) return checking;
    checking = NF.call(W, '/version.txt?t=' + Date.now(), { cache: 'no-store' }).then(function(r){ return r && r.ok ? r.text() : ''; }, function(){ return ''; })
      .then(function(v){ checking = null; v = s(v).trim().slice(0, 60); if (v) LIVE = { v: v, at: Date.now() }; return v; });
    return checking;
  };
  /* an OLD copy that came from the browser's cache or back from the background (Safari's back / forward and tab restore hand
     back the cached page whatever its Cache-Control says: Steven's iPhone opened 33.273 when the server had 33.277): besides
     the banner, the update runs by itself at the first safe moment — the page on screen, nobody tapping or typing for 15 s,
     no upload on its way. The stale gate (REGFIX) holds this copy's shared uploads until then; what is saved here stays in
     IndexedDB and goes up from the new copy. At most once per 10 minutes (updateImpl), so it can never loop. */
  var autoT = null, lastAct = 0, autoN = 0;
  var autoUpdate = function(){
    if (autoT || autoN) return;
    try { ['keydown', 'input', 'pointerdown', 'touchstart', 'wheel'].forEach(function(t){ D.addEventListener(t, function(){ lastAct = Date.now(); }, true); }); } catch (e) {}
    var tick = function(){
      autoT = null; if (++autoN > 600) return;
      var busy = '';
      try {
        if (D.visibilityState === 'hidden') busy = 'hidden';
        else if (Date.now() - lastAct < 15000) busy = 'in use';
        else { var a = D.activeElement; if (a && a !== D.body && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) busy = 'typing'; }
        if (!busy && W._gcSending && W._gcSending().length) busy = 'sending';
      } catch (e) {}
      if (!busy) { B.autoUpd = ms(); dirty = true; if (update()) return; }
      autoT = NST.call(W, tick, 3000);
    };
    autoT = NST.call(W, tick, 1500);
  };
  checkImpl = function(resumed){
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
      if (!recent && (src || resumed || gateUp() || !authed())) { banner(live); autoUpdate(); }
      return true;
    });
  };
