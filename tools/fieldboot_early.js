/* __GC_PATCH_FIELDBOOT__ — a phone opens straight in GrayCo Field: the Desk never shows first.   (patch FIELDBOOT)
   Owner 11/03 (iPhone, the Home Screen app): "when I open from the share/home screen app it briefly goes to this first,
   like half a second. I want it straight to Field view/app." The Desk (dark sidebar, Company Dashboard) was drawn by
   React first; GrayCo Field (patch FIELD) only took over from its own timer (350 ms after the CRM's data object, then
   its 1.2 s look) — so the Desk showed for about half a second on every open.
   This tiny script runs in <head>, before anything is drawn, and makes the SAME choice as patch FIELDDESK
   (tools/fielddesk.js, phone()): a phone browser (iPhone / Android "Mobile" / userAgentData.mobile) is a phone; a
   computer's own system (Windows, ChromeOS, desktop Linux, a Mac that is not an iPad) or a mouse / touchpad as the main
   pointer is a computer; otherwise the screen's short side ≤ 500 CSS px, or a coarse pointer with no fine one, is a phone.
   The Home Screen app (display-mode: standalone / navigator.standalone) is the same phone — noted in state() only.
   On a phone:
   • <html> gets the class gc-boot-field: a plain white splash (the GrayCo logo + "GrayCo Field") covers the page, so the
     Desk is never seen; the "Loading the CRM…" cover (patch BOOT) stays out of the way;
   • patch FIELD opens GrayCo Field at once (no 350 ms wait, no 1.2 s timer) while the class is on;
   • the class goes the moment GrayCo Field is on screen — or the sign-in screen is (not signed in), or a Desk view was
     chosen for this open (patch FIELDDESK's per-open switch: _gcView.pref() === 'desk' — never forced back to Field), or
     6 s after the page is read (45 s after it started arriving) at the latest: whatever is ready shows, never a white page.
   A computer: nothing here does anything (no class, no splash) — it opens on the Desk as before.
   Kill switches (this device): localStorage gc_fieldboot_off = "1"; gc_fielddesk_off = "1" (FIELDDESK off) also turns
   this off. Console: _gcFieldBoot.state() */
(function(){
'use strict';
var W = window, D = document;
try {
  if (W.__GC_PATCH_FIELDBOOT__) return; W.__GC_PATCH_FIELDBOOT__ = true;
  var NST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, T0 = Date.now();
  var lsGet = function(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } };
  var mq = function(q){ try { return !!(W.matchMedia && W.matchMedia(q).matches); } catch (e) { return false; } };
  var ua = ''; try { ua = String(navigator.userAgent || ''); } catch (e) {}
  /* ── the device: the same rules as patch FIELDDESK's phone() ── */
  var deskPointer = function(){ return mq('(pointer: fine)') && mq('(hover: hover)'); };
  var uaMobile = function(){ try { var d = navigator.userAgentData; if (d && typeof d.mobile === 'boolean' && d.mobile) return true; } catch (e) {} return /iPhone|iPod|Android.*Mobile|Mobile.*Android|Windows Phone|IEMobile|BlackBerry|Opera Mini/i.test(ua); };
  var computerOS = function(){
    var tp = 0; try { tp = +navigator.maxTouchPoints || 0; } catch (e) {}
    try { var d = navigator.userAgentData; if (d && d.mobile === false && /^(Windows|Chrome OS|ChromeOS|Linux)$/i.test(String(d.platform || ''))) return true; } catch (e) {}
    if (/Windows NT|CrOS/i.test(ua)) return true;
    if (/X11|Linux x86_64|Linux i686/i.test(ua) && !/Android/i.test(ua)) return true;
    if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua) && tp <= 1) return true;
    return false;
  };
  var phone = function(){
    if (uaMobile()) return true;
    if (computerOS() || deskPointer()) return false;
    var sc = W.screen || {}, sw = Math.min(+sc.width || 9999, +sc.height || 9999);
    if (sw > 0 && sw <= 500) return true;
    return mq('(pointer: coarse)') && !mq('(any-pointer: fine)');
  };
  var standalone = false; try { standalone = mq('(display-mode: standalone)') || navigator.standalone === true; } catch (e) {}
  var st = { phone: false, standalone: standalone, on: false, off: '', why: '', ms: 0, at: T0 };
  if (lsGet('gc_fieldboot_off') === '1') st.off = 'gc_fieldboot_off';
  else if (lsGet('gc_fielddesk_off') === '1') st.off = 'gc_fielddesk_off';
  st.phone = phone();
  W._gcFieldBoot = { state: function(){ return { phone: st.phone, standalone: st.standalone, on: st.on, off: st.off, why: st.why, ms: st.ms, boot: D.documentElement.classList.contains('gc-boot-field') }; },
    phone: phone, active: function(){ return D.documentElement.classList.contains('gc-boot-field'); }, done: function(){} };
  if (st.off || !st.phone) return;

  /* ── a phone: the white splash until GrayCo Field is on screen ── */
  var H = D.documentElement; H.classList.add('gc-boot-field'); st.on = true;
  var css = D.createElement('style'); css.id = 'gc-fb-css';
  css.textContent = 'html.gc-boot-field,html.gc-boot-field body{background:#fff!important}' +
    '#gc-fb-splash{display:none}' +
    'html.gc-boot-field #gc-fb-splash{display:flex;position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:16px;box-sizing:border-box;z-index:2147483646;background:#fff;' +
    'flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#0f2440;font:800 22px/1.2 Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;-webkit-user-select:none;user-select:none}' +
    '#gc-fb-splash img{width:96px;height:96px;border-radius:22px;object-fit:contain;background:#fff;box-shadow:0 6px 24px rgba(15,36,64,.14)}' +
    '#gc-fb-splash i{display:block;width:22px;height:22px;border:3px solid #dbe3ee;border-top-color:#2563eb;border-radius:50%;animation:gcFbSpin .8s linear infinite;margin-top:6px}' +
    '@keyframes gcFbSpin{to{transform:rotate(360deg)}}';
  (D.head || H).appendChild(css);
  var sp = D.createElement('div'); sp.id = 'gc-fb-splash'; sp.setAttribute('data-gc-keep', '1'); sp.setAttribute('data-gcnav-ignore', '1');
  sp.setAttribute('role', 'status'); sp.setAttribute('aria-label', 'Opening GrayCo Field');
  sp.innerHTML = '<img src="grayco-logo.jpg" alt="GrayCo" onerror="this.style.display=\'none\'"><div>GrayCo Field</div><i></i>';
  H.appendChild(sp);

  var gone = false, readAt = 0, mo = null;
  var done = function(why){
    if (gone) return; gone = true; st.why = why; st.ms = Date.now() - T0;
    try { if (mo) mo.disconnect(); } catch (e) {}
    H.classList.remove('gc-boot-field');
    try { sp.remove(); } catch (e) {}
    try { console.log('[GC] FIELDBOOT: ' + why + ' after ' + st.ms + ' ms (patch FIELDBOOT)'); } catch (e) {}
  };
  W._gcFieldBoot.done = function(){ done('done()'); };
  var vis = function(el){ try { return !!(el && el.getClientRects().length); } catch (e) { return false; } };
  var fieldUp = function(){ return H.classList.contains('_fieldmode') && !!(D.getElementById('_gcJobPick') || D.getElementById('_gcJobDash') || D.getElementById('_gcFieldHomeOv')); };
  var check = function(){
    if (gone) return;
    try {
      if (fieldUp()) { done('GrayCo Field on screen'); return; }
      if (W._gcView && W._gcView.pref && W._gcView.pref() === 'desk') { done('Desk view chosen for this open'); return; }
      if (W._gcView && W._gcView.phone && !W._gcView.phone()) { done('not a phone (FIELDDESK)'); return; }
      if (vis(D.getElementById('gc-auth-email'))) { done('the sign-in screen'); return; }
      if (!readAt && D.readyState !== 'loading') readAt = Date.now();
      if (readAt && Date.now() - readAt > 6000) { done('6 s after the page was read: show whatever is ready'); return; }
      if (Date.now() - T0 > 45000) { done('45 s: show whatever is ready'); return; }
    } catch (e) { done('error: ' + (e && e.message || e)); }
  };
  var poll = function(){ check(); if (!gone) NST.call(W, poll, 40); };
  /* GrayCo Field adds its home to <body> / sets html._fieldmode: look at once (no frame of anything else between) */
  try { mo = new MutationObserver(function(){ if (!gone && fieldUp()) done('GrayCo Field on screen'); }); mo.observe(H, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true }); } catch (e) {}
  NST.call(W, poll, 40);
} catch (e) { try { D.documentElement.classList.remove('gc-boot-field'); console.warn('[GC] FIELDBOOT not installed:', e && e.message || e); } catch (x) {} }
})();
