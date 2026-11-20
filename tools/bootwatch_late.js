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
  /* AUTOUPD (owner 11/19: "automatic update as soon as the CRM updates … so everyone is on the same version always") —
     UPDSAFE (owner 11/20: "it timed away from that screen so I have to redo it": the 📢 bid-portal sheet was open while he
     looked for plans in his file picker, and the update reloaded the page): an OLD copy still updates by itself, no bar, a
     2-second "Updating…" note — but ONLY when nothing can be lost. It waits while any of these is true:
       the page is hidden (it goes once it is back on screen AND idle); a file picker is (or may be) open: a file box clicked
       in the last 10 min, or the window lost focus right after one; a write is on its way (any non-GET fetch / XHR, the
       CRM's uploads _gcSending, saves not sent yet _gcUnsent); a real tap / key in the last 2 min (or back on screen < 60 s);
       a sheet / dialog / drawer / modal is open (role=dialog, aria-modal, <dialog open>, any large fixed panel over the page:
       the bid-portal sheet, the estimate / invoice editors, Fix dialogs, forms …; the form hold __GC_FORM_OPEN__); a box
       with text in it that was typed in or differs from how it was drawn (search boxes aside); a file chosen; and the screen
       is not a main list / home (Desk: Dashboard, Jobs, Leads, … lists; Field: home or a job; the sign-in screen; a page
       still opening that nobody has touched).
     After 30 min of waiting: a small white "New version ready — tap to update" pill (never a popup, never forced). An old copy
     may keep running meanwhile: the stale gate (REGFIX) holds only its automatic background writes; a person's own Save
     still goes. updateImpl keeps it to one update per 10 minutes (never a loop). Console: _gcBootWatch.upd() → why it waits */
  var autoT = null, lastType = 0, autoN = 0, autoT0 = 0, pill = null;
  var CFG = U.cfg;
  var HOME_V = /^(dashboard|projects|leads|invoices|expenses|estimates|schedule|approvals|subs|payments|files|customers|vendors|todo|allphotos|documents|changeorders|insurance|bidportal|mastercrm|list)$/;
  var OK_ID = /^(gc-bw-|gc-upd-pill$|gc-boot-cover$|gc-bootsafe$|_gcFieldHomeOv$|_gcJobPick$|_gcJobDash$|_gcReloadAsk$|gc-auth-gate$)/;
  var seen = function(e){ try { if (!e || !e.isConnected) return null; var r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 ? r : null; } catch (x) { return null; } };
  var mine = function(e){ for (var k = e, i = 0; k && k.nodeType === 1 && i < 30; k = k.parentNode, i++) if (k.id && OK_ID.test(k.id)) return true; return false; };
  var nameOf = function(e){ return s(e.id || e.getAttribute('aria-label') || e.className || e.tagName).slice(0, 40); };
  var sheet = function(){
    try {
      var q = D.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"],dialog[open]');
      for (var i = 0; i < q.length && i < 50; i++) if (seen(q[i]) && !mine(q[i])) return 'dialog ' + nameOf(q[i]);
      var vw = W.innerWidth || 1, vh = W.innerHeight || 1, c = [];
      [D.body, H].forEach(function(p){ for (var k = p && p.firstElementChild; k; k = k.nextElementSibling) c.push(k); });
      var rq = D.querySelectorAll('#root [style*="position: fixed"],#root [style*="position:fixed"]');
      for (var j = 0; j < rq.length && j < 80; j++) c.push(rq[j]);
      for (var n = 0; n < c.length && n < 400; n++) {
        var e = c[n]; if (/^(SCRIPT|STYLE|LINK|META|HEAD|BODY|NOSCRIPT|TEMPLATE)$/.test(e.tagName) || e.id === 'root' || mine(e)) continue;
        var r = seen(e); if (!r) continue;
        var cs = W.getComputedStyle(e); if (cs.position !== 'fixed' || cs.visibility === 'hidden' || cs.pointerEvents === 'none' || +cs.opacity === 0) continue;
        var a = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
        if (a > 0.3 * vw * vh) return 'panel ' + nameOf(e);
      }
    } catch (x) {}
    return '';
  };
  var SEARCHY = /search|filter|find|lookup/i;
  var unsaved = function(){
    try {
      var q = D.querySelectorAll('input,textarea,select,[contenteditable=""],[contenteditable="true"]');
      for (var i = 0; i < q.length && i < 800; i++) {
        var e = q[i], t = s(e.type).toLowerCase(), tg = e.tagName, tch = !!(U.touched && U.touched.has(e));
        if (/^(hidden|button|submit|reset|image|search)$/.test(t) || !seen(e)) continue;
        if (SEARCHY.test(s(e.id) + ' ' + s(e.name) + ' ' + s(e.placeholder) + ' ' + s(e.getAttribute && e.getAttribute('aria-label')))) continue;
        var gate = e.closest && e.closest('#gc-auth-gate'), inForm = !!(e.form || (e.closest && e.closest('form')));
        if (t === 'file') { if (e.files && e.files.length) return 'a file chosen'; continue; }
        if (tg === 'SELECT' || t === 'checkbox' || t === 'radio') {
          if (!inForm || gate) continue;   /* list filters / toggles are not work; a form's own choices are */
          if (tg === 'SELECT') { for (var o = 0; o < e.options.length; o++) if (e.options[o].selected !== e.options[o].defaultSelected && (tch || e.options[o].defaultSelected)) return 'a choice in ' + nameOf(e); }
          else if (e.checked !== e.defaultChecked) return 'a box ticked in ' + nameOf(e);
          continue;
        }
        var v = e.isContentEditable && tg !== 'INPUT' && tg !== 'TEXTAREA' ? s(e.textContent) : s(e.value);
        if (!v.trim()) continue;
        if (tch || (!gate && !e.isContentEditable && v !== s(e.defaultValue))) return 'text in ' + nameOf(e);
      }
    } catch (x) {}
    return '';
  };
  var screenOk = function(){
    if (gateUp()) return '';
    var fs = firstScreen();
    if (!fs) return B.m.paint == null && !U.act ? '' : 'not a main screen';
    if (/^field (home|job)$/.test(fs)) return '';
    var m = /^desk (.*)$/.exec(fs); return m && HOME_V.test(m[1]) ? '' : 'not a main screen (' + fs + ')';
  };
  var whyBusy = function(){
    try {
      var t = Date.now();
      if (D.visibilityState === 'hidden') return 'hidden';
      if (U.picker || (U.file && t - U.file < CFG.file)) return 'file picker';
      for (var k in U.fly) { if (t - U.fly[k] < 300000) return 'saving'; delete U.fly[k]; }
      if (W._gcSending && W._gcSending().length) return 'uploading';
      /* a save that failed is kept on this computer (IndexedDB) and sent again by the new copy; only one being retried right now, while
         signed in, waits — for 10 min at most (a write the stale gate held, a refused one, never: that would wait for good) */
      if (authed() && t - (autoT0 || t) < 600000 && W._gcUnsent && W._gcUnsent().some(function(x){ return x && !/held/i.test(s(x.why)) && !/^(401|403|413)$/.test(s(x.status)) && t - (+x.at || 0) < 60000; })) return 'not sent yet';
      if (U.act && t - U.act < Math.max(CFG.act, CFG.idle)) return 'in use';
      if (t - Math.max(lastType, lastKey) < 3000) return 'typing';
      if (t - U.vis < CFG.idle && (U.act || B.m.paint != null) && U.vis > T0 + 1000) return 'just back on screen';
      var a = D.activeElement;
      if (a && a !== D.body && ((/^(INPUT|TEXTAREA)$/.test(a.tagName) && s(a.value).trim()) || (a.isContentEditable && s(a.textContent).trim()))) return 'editing';
      var sh = sheet(); if (sh) return 'open: ' + sh;
      if (W.__GC_FORM_OPEN__ === true && !gateUp()) return 'a form is open';   /* (the sign-in screen's own focused box is no form) */
      var un = unsaved(); if (un) return 'unsaved: ' + un;
      return screenOk();
    } catch (e) { return 'error'; }
  };
  whyImpl = whyBusy;
  var showPill = function(){
    try {
      if (pill && pill.isConnected) return;
      pill = D.createElement('button'); pill.type = 'button'; pill.id = 'gc-upd-pill'; pill.setAttribute('data-gc-keep', '1'); pill.setAttribute('role', 'status');
      pill.style.cssText = 'position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2147483000;background:#fff;color:#0f2440;border:1px solid #cbd5e1;border-radius:999px;padding:8px 14px;' +
        'font:700 13px -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;box-shadow:0 4px 14px rgba(15,36,64,.18);cursor:pointer;max-width:calc(100vw - 32px)';
      pill.textContent = 'New version ready — tap to update';
      pill.addEventListener('click', function(ev){
        try { ev.stopPropagation(); } catch (e) {}
        var w = whyBusy();
        if (/^(open|unsaved|a form|editing|saving|uploading|not sent|file)/.test(w) && !W.confirm('Something is still open or not saved (' + w + ').\n\nUpdate now anyway? The page reloads.')) return;
        B.pillTap = ms(); dirty = true; try { pill.remove(); } catch (e) {} update();
      });
      (D.body || H).appendChild(pill); B.pill = ms(); dirty = true;
    } catch (e) {}
  };
  var autoUpdate = function(){
    if (autoT) return;
    if (!autoN) { try { ['keydown', 'input', 'compositionupdate'].forEach(function(t){ D.addEventListener(t, function(){ lastType = Date.now(); }, true); }); } catch (e) {} }
    autoT0 = autoT0 || Date.now();
    var tick = function(){
      autoT = null; autoN++;
      var why = whyBusy(); B.updWait = why;
      if (!why) {
        B.autoUpd = ms(); dirty = true; autoToast();
        /* looked at again just before the reload: a tap or a sheet in those 2 seconds stops it */
        NST.call(W, function(){ var w2 = whyBusy(); if (w2) { B.updWait = w2; try { var tt = D.getElementById('gc-bw-updating'); if (tt) tt.remove(); } catch (e) {} autoT = NST.call(W, tick, CFG.tick); return; } if (!update()) { autoT0 = 0; } }, 2000);
        return;
      }
      if (Date.now() - autoT0 > CFG.pill) showPill();
      autoT = NST.call(W, tick, Date.now() - autoT0 > 600000 ? Math.max(CFG.tick, 5000) : CFG.tick);
    };
    autoT = NST.call(W, tick, 300);
  };
  var autoToast = function(){
    try { var t = D.getElementById('gc-bw-updating'); if (t) return; t = D.createElement('div'); t.id = 'gc-bw-updating'; t.setAttribute('role', 'status'); t.setAttribute('data-gc-keep', '1');
      t.style.cssText = 'position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483647;background:#1e293b;color:#fff;padding:8px 16px;border-radius:999px;font:700 14px -apple-system,Segoe UI,Arial,sans-serif;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.25)';
      t.textContent = 'Updating…'; (D.body || H).appendChild(t); NST.call(W, function(){ try { t.remove(); } catch (e) {} }, 4000); } catch (e) {}
  };
  autoImpl = autoUpdate;
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
      if (!recent) autoUpdate();   /* AUTOUPD: no bar, no button — the update runs by itself */
      return true;
    });
  };
