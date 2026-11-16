/* __GC_PATCH_DEVMODE_EARLY__ — DEVMODE: which device is this, and which view opens: the Desk or GrayCo Field.   (patch DEVMODE)
   Owner 11/16: "The field view app is pulling up as the first screen in Glenn's screen and everyone else's too and it should
   open desk cuz they are using computer. The desk view should always pull up unless it's opened from an iPhone then it
   should be field opening. … From the phone and app always do field view app mode." Then: "Don't ask for field or desk when
   sign in — just do it by computer or iPhone/Android etc; iPad opens Field."
   The device only — never the role, the window's size or a view saved from before:
     • phone  — an iPhone / iPod, an Android phone ("Android … Mobile", userAgentData.mobile), other phone browsers; the
                installed Home Screen app on a phone is the same phone. A phone set to "Request Desktop Website" (it then
                says Mac / Linux) is still a phone: a touch screen only and a short side ≤ 500 CSS px.
     • tablet — an iPad (also iPadOS Safari, which says "Macintosh" but has a touch screen), an Android tablet
                ("Android" without "Mobile").
     • computer — Windows (touch-screen laptops too, any scaling, any window size), a Mac, ChromeOS, desktop Linux;
                an unknown system with a mouse / touchpad.
   Which view opens: a phone or a tablet → GrayCo Field; a computer → the Desk. A Desk / Field switch lasts for that open
   only (patch FIELDDESK). Nothing is asked and nothing is saved.
   API: window._gcDevice = { kind(), why(), phone(), fieldDevice(), standalone(), wantField(), signedEmail(), state() }
   Kill switch (this device): localStorage gc_devmode_off = "1" → patch FIELDDESK's own device rule as before. */
(function(){
'use strict';
var W = window;
try {
  if (W._gcDevice) return;
  var lsGet = function(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } };
  var lsDel = function(k){ try { if (W.localStorage.getItem(k) != null) W.localStorage.removeItem(k); } catch (e) {} };
  if (lsGet('gc_devmode_off') === '1') return;
  var mq = function(q){ try { return !!(W.matchMedia && W.matchMedia(q).matches); } catch (e) { return false; } };
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
  /* GrayCo Field opens by itself on a phone or a tablet (the owner: "iPad opens Field"); a computer opens the Desk */
  function fieldDevice(){ return K !== 'computer'; }
  function signedEmail(){ try { var j = JSON.parse(lsGet('gc_auth_v1') || 'null'); return j && j.access_token && j.email ? String(j.email).toLowerCase() : ''; } catch (e) { return ''; } }
  /* the old views saved on this device never decide anything again (also the first DEVMODE's sign-in pick) */
  ['gc_view_pref', 'gc_phone_desk', '_fieldMode', 'gc_dm_choice', 'gc_dm_ask'].forEach(lsDel);
  W._gcDevice = { kind: function(){ return K; }, why: function(){ return WHY; }, phone: function(){ return K === 'phone'; }, fieldDevice: fieldDevice, standalone: standalone,
    wantField: fieldDevice, signedEmail: signedEmail,
    state: function(){ return { kind: K, why: WHY, standalone: standalone(), fieldDevice: fieldDevice(), ua: ua().slice(0, 140), touchPoints: tp(), screenShort: short(), touchOnly: touchOnly(), mouse: mouseMain() }; } };
} catch (e) { try { console.warn('[GC] DEVMODE early not installed:', e && e.message || e); } catch (x) {} }
})();
