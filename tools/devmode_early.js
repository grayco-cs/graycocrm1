/* __GC_PATCH_DEVMODE_EARLY__ — DEVMODE: which device is this, and which view opens: the Desk or GrayCo Field.   (patch DEVMODE)
   Owner 11/16: "The field view app is pulling up as the first screen in Glenn's screen and everyone else's too and it should
   open desk cuz they are using computer. The desk view should always pull up unless it's opened from an iPhone then it
   should be field opening. … From the phone and app always do field view app mode." And for a PM who works both ways on one
   computer (Biffle): "have the option for it to ask on sign in if I want field or desk on my profile".
   The device only — never the role, the window's size or a view saved from before:
     • phone  — an iPhone / iPod, an Android phone ("Android … Mobile", userAgentData.mobile), other phone browsers; the
                installed Home Screen app on a phone is the same phone. A phone set to "Request Desktop Website" (it then
                says Mac / Linux) is still a phone: a touch screen only and a short side ≤ 500 CSS px.
     • tablet — an iPad (also iPadOS Safari, which says "Macintosh" but has a touch screen), an Android tablet
                ("Android" without "Mobile").
     • computer — Windows (touch-screen laptops too, any scaling, any window size), a Mac, ChromeOS, desktop Linux;
                an unknown system with a mouse / touchpad.
   Which view opens:
     • a phone: GrayCo Field, always (it never asks);
     • a tablet: GrayCo Field, unless a mouse / trackpad is its main pointer (then the Desk);
     • a computer: the Desk — unless the person has "Ask me Field or Desk when I sign in" on (My Profile, or an admin in
       💎 → Team access; gc_kv "gc_view_prefs") and picked Field for THIS sign-in. The pick lasts until they sign out
       (every tab, every reload of that sign-in); the next sign-in asks again. A Desk / Field switch without the ask setting
       lasts for this open only (patch FIELDDESK).
   API: window._gcDevice = { kind(), phone(), fieldDevice(), standalone(), choice(), setChoice(v), clearChoice(why),
        askCached(email), wantField(), state() }
   Kill switch (this device): localStorage gc_devmode_off = "1" → patch FIELDDESK's own device rule as before. */
(function(){
'use strict';
var W = window, D = document;
try {
  if (W._gcDevice) return;
  var lsGet = function(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } };
  var lsSet = function(k, v){ try { if (v == null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, v); } catch (e) {} };
  if (lsGet('gc_devmode_off') === '1') return;
  var mq = function(q){ try { return !!(W.matchMedia && W.matchMedia(q).matches); } catch (e) { return false; } };
  var CH = 'gc_dm_choice', ASK = 'gc_dm_ask';
  var ua = function(){ try { return String(navigator.userAgent || ''); } catch (e) { return ''; } };
  var tp = function(){ try { return +navigator.maxTouchPoints || 0; } catch (e) { return 0; } };
  var short = function(){ var sc = W.screen || {}; var a = +sc.width || 0, b = +sc.height || 0; return a && b ? Math.min(a, b) : 0; };
  var touchOnly = function(){ return mq('(pointer: coarse)') && !mq('(any-pointer: fine)'); };
  var mouseMain = function(){ return mq('(pointer: fine)') && mq('(hover: hover)'); };
  var why = '';
  function kind(){
    var u = ua(), d = null; try { d = navigator.userAgentData || null; } catch (e) {}
    var small = short() > 0 && short() <= 500;
    if (/iPhone|iPod/i.test(u)) { why = 'iPhone'; return 'phone'; }
    if (/Android/i.test(u) && /Mobile/i.test(u)) { why = 'Android phone'; return 'phone'; }
    if (d && d.mobile === true) { why = 'userAgentData.mobile'; return 'phone'; }
    if (/Windows Phone|IEMobile|BlackBerry|BB10|Opera Mini|webOS/i.test(u)) { why = 'phone browser'; return 'phone'; }
    if (/iPad/i.test(u)) { why = 'iPad'; return 'tablet'; }
    if (/Macintosh|Mac OS X/i.test(u) && tp() > 1) { why = small ? 'iPhone asking for the desktop site' : 'iPad (iPadOS Safari says Macintosh)'; return small ? 'phone' : 'tablet'; }
    if (/Android/i.test(u)) { why = small && touchOnly() ? 'Android phone' : 'Android tablet'; return small && touchOnly() ? 'phone' : 'tablet'; }
    if (/Windows NT|CrOS/i.test(u)) { why = 'Windows / ChromeOS'; return 'computer'; }
    if (/Macintosh|Mac OS X/i.test(u)) { why = 'Mac'; return 'computer'; }
    if (/X11|Linux/i.test(u)) { if (small && touchOnly()) { why = 'phone asking for the desktop site (Linux, touch only, small screen)'; return 'phone'; } why = 'desktop Linux'; return 'computer'; }
    try { if (d && d.mobile === false && /^(Windows|Chrome OS|ChromeOS|macOS|Linux)$/i.test(String(d.platform || ''))) { why = 'userAgentData ' + d.platform; return 'computer'; } } catch (e) {}
    if (mouseMain()) { why = 'a mouse / touchpad'; return 'computer'; }
    if (touchOnly()) { why = 'touch only'; return small ? 'phone' : 'tablet'; }
    why = 'unknown: computer'; return 'computer';
  }
  var K = kind(), WHY = why;
  function standalone(){ return mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || (function(){ try { return navigator.standalone === true; } catch (e) { return false; } })(); }
  /* the view this device opens by itself */
  function fieldDevice(){ return K === 'phone' || (K === 'tablet' && !mouseMain()); }
  /* who is signed in on this browser (the sign-in's own record) */
  function signedEmail(){ try { var j = JSON.parse(lsGet('gc_auth_v1') || 'null'); return j && j.access_token && j.email ? String(j.email).toLowerCase() : ''; } catch (e) { return ''; } }
  /* this sign-in's pick (Ask me Field or Desk) — gone when nobody is signed in */
  function choice(){
    try { var c = JSON.parse(lsGet(CH) || 'null'), em = signedEmail(); if (c && em && c.email === em && (c.v === 'desk' || c.v === 'field')) return c.v; } catch (e) {}
    return '';
  }
  function setChoice(v){ var em = signedEmail(); if (!em || (v !== 'desk' && v !== 'field')) return false; lsSet(CH, JSON.stringify({ email: em, v: v, at: new Date().toISOString() })); return true; }
  function clearChoice(why){ if (lsGet(CH) != null) { lsSet(CH, null); try { console.log('[GC] DEVMODE: the Field / Desk pick of the last sign-in is cleared (' + (why || '') + ')'); } catch (e) {} } }
  /* signed out (or someone else signed in): the last sign-in's pick does not carry over */
  (function(){ var em = signedEmail(); if (!em) clearChoice('nobody signed in'); else { try { var c = JSON.parse(lsGet(CH) || 'null'); if (c && c.email !== em) clearChoice('another person signed in'); } catch (e) { clearChoice('unreadable'); } } })();
  function askCached(email){ try { var m = JSON.parse(lsGet(ASK) || '{}') || {}; return m[String(email || signedEmail()).toLowerCase()] === true; } catch (e) { return false; } }
  /* GrayCo Field opens by itself: a phone (always), a tablet without a mouse, a computer whose person picked Field for this sign-in */
  function wantField(){ if (K === 'phone') return true; var c = choice(); if (c) return c === 'field'; return fieldDevice(); }
  /* the old views that were saved on this device never decide anything again */
  lsSet('gc_view_pref', null); lsSet('gc_phone_desk', null); lsSet('_fieldMode', null);
  W._gcDevice = { kind: function(){ return K; }, why: function(){ return WHY; }, phone: function(){ return K === 'phone'; }, fieldDevice: fieldDevice, standalone: standalone,
    choice: choice, setChoice: setChoice, clearChoice: clearChoice, askCached: askCached, signedEmail: signedEmail, wantField: wantField,
    canAsk: function(){ return K !== 'phone'; },
    state: function(){ return { kind: K, why: WHY, standalone: standalone(), fieldDevice: fieldDevice(), choice: choice(), wantField: wantField(), email: signedEmail(), askCached: askCached(), ua: ua().slice(0, 140), touchPoints: tp(), screenShort: short(), touchOnly: touchOnly(), mouse: mouseMain() }; } };
} catch (e) { try { console.warn('[GC] DEVMODE early not installed:', e && e.message || e); } catch (x) {} }
})();
