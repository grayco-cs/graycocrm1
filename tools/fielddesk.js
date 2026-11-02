/* __GC_PATCH_FIELDDESK__ — FIELD or DESK: a computer opens on the Desk, a phone in GrayCo Field.   (patch FIELDDESK)
   Owner 11/02 (HP touch-screen laptop, Edge): "this isn't right, I'm on desk and clicked desk and it won't go away";
   then: "it needs to always pop up desktop for computer and field view when on your phone screen / app on phone".
   A laptop window less than 500 px tall (125 % Windows scaling + the browser's bars) counted as a phone, so GrayCo
   Field opened by itself on every load and the Desk home never came; the old Desk / Field button named the view you
   were IN, so "Desk" on the desk opened Field.
   • Every open / reload picks by the DEVICE. A computer — Windows, ChromeOS, Linux, a Mac (touch screen or not, any
     window size, Windows scaling or zoom), or any device whose main pointer is a mouse / touchpad — gets the Desk.
     A phone (a phone browser, the screen's short side ≤ 500 CSS px, or a coarse pointer with no fine one), also the
     installed phone app, gets GrayCo Field. The window's own size no longer counts.
   • Any Desk / Field button switches for THIS open only (kept in memory, never saved): the next open or reload picks
     by the device again. GrayCo Field (patch FIELD) and the role apps (patch ROLEAPPS) ask window._gcView.
   • Every Desk button (the old Desk / Field button and the toolbar's, GrayCo Field's header and ☰ More, ⚙ Settings'
     "Use desk view", the old field app's buttons) leaves Field at once and shows the role's Desk home, or the CRM as
     before for a role without one. Crews always stay in Field; 👁 View as… a crew member previews Field and coming
     back restores the view they had (patch ROLEAPPS puts it back).
   • Kill switch: localStorage gc_fielddesk_off = "1" (this device) → everything as before.
   API: window._gcView = { phone(), pref(), set(v), choose(v), state() }, window._gcChooseView(v) */
(function(){
'use strict';
if (window.__GC_PATCH_FIELDDESK__) return; window.__GC_PATCH_FIELDDESK__ = true;
var W = window, D = document, KEY = 'gc_view_pref';
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
if (lsGet('gc_fielddesk_off') === '1') { try { console.log('[GC] FIELDDESK off on this device (gc_fielddesk_off)'); } catch (e) {} return; }
function warn(e){ try { console.warn('[GC FIELDDESK]', e && e.message || e); } catch (x) {} }
function mq(q){ try { return !!(W.matchMedia && W.matchMedia(q).matches); } catch (e) { return false; } }
function html(){ return D.documentElement; }
function inField(){ return html().classList.contains('_fieldmode'); }

/* ── the device ── */
function deskPointer(){ return mq('(pointer: fine)') && mq('(hover: hover)'); }   /* a mouse / touchpad is the main pointer */
function ua(){ try { return String(navigator.userAgent || ''); } catch (e) { return ''; } }
function uaMobile(){ try { var d = navigator.userAgentData; if (d && typeof d.mobile === 'boolean' && d.mobile) return true; } catch (e) {} return /iPhone|iPod|Android.*Mobile|Mobile.*Android|Windows Phone|IEMobile|BlackBerry|Opera Mini/i.test(ua()); }
/* a computer's own system: Windows (an HP touch-screen laptop is a computer), ChromeOS, desktop Linux, a Mac (not an iPad, which says "Macintosh" with touch) */
function computerOS(){
  var u = ua(), tp = 0; try { tp = +navigator.maxTouchPoints || 0; } catch (e) {}
  try { var d = navigator.userAgentData; if (d && d.mobile === false && /^(Windows|Chrome OS|ChromeOS|Linux)$/i.test(String(d.platform || ''))) return true; } catch (e) {}
  if (/Windows NT|CrOS/i.test(u)) return true;
  if (/X11|Linux x86_64|Linux i686/i.test(u) && !/Android/i.test(u)) return true;
  if (/Macintosh|Mac OS X/i.test(u) && !/iPhone|iPad|iPod/i.test(u) && tp <= 1) return true;
  return false;
}
function phone(){
  if (uaMobile()) return true;
  if (computerOS() || deskPointer()) return false;
  var sc = W.screen || {}, sw = Math.min(+sc.width || 9999, +sc.height || 9999);
  if (sw > 0 && sw <= 500) return true;
  return mq('(pointer: coarse)') && !mq('(any-pointer: fine)');
}
/* ── a switch for THIS open only (in memory; a reload or the next open picks by the device again) ── */
var CUR = '';
function pref(){ return CUR; }
function set(v){ CUR = v === 'field' || v === 'desk' ? v : ''; }
/* no view is ever carried over from before: GrayCo Field's "desk view on this phone", the old sticky Field key */
lsSet(KEY, null); lsSet('gc_phone_desk', null); lsSet('_fieldMode', null);
function crewApp(){ try { return !!(W._gcRA && W._gcRA.app() === 'crew'); } catch (e) { return false; } }

function toast(t){
  var el = D.getElementById('gc-fd-toast'); if (!el) { el = D.createElement('div'); el.id = 'gc-fd-toast'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('data-gcnav-ignore', '1'); D.body.appendChild(el); }
  el.textContent = t; el.style.display = 'block'; clearTimeout(el.__t); el.__t = later(function(){ el.style.display = 'none'; }, 3500);
}

/* ── Desk ── */
var FIELD_LAYERS = '#_gcJobPick,#_gcJobDash,#_gcFieldHomeOv,#_gcAppTabs,#_gcAppHead,#_gcDeskBtn,#gc-fh-backfield,.gc-fh-sheet,._gcSheetOv';
function toDesk(){
  try { if (typeof W._gcSetFieldMode === 'function') W._gcSetFieldMode(false); } catch (e) { warn(e); }
  html().classList.remove('_fieldmode', '_fmAppOpen', '_fm', 'gc-fh-on');
  try { Array.prototype.forEach.call(D.querySelectorAll(FIELD_LAYERS), function(o){ o.remove(); }); } catch (e) {}
  W.__gcFhAll = false;
  /* the role's Desk home; a role without one: the CRM as before (the screen under the Field drawn again) */
  var ra = W._gcRA;
  try { if (ra && ra.sync) ra.sync(); if (ra && ra.mode && ra.mode() === 'desk' && ra.open && ra.open()) return 'home'; } catch (e) { warn(e); }
  try { if (typeof W._setView === 'function') W._setView(lsGet('grayco_view') || 'dashboard'); } catch (e) { warn(e); }
  return 'crm';
}
/* ── Field ── */
function toField(){
  try { if (W._gcRA && W._gcRA.hide) W._gcRA.hide(); } catch (e) {}
  var b = D.getElementById('gc-fh-backfield'); if (b) b.remove();
  if (!inField()) { try { if (typeof W._gcSetFieldMode === 'function') W._gcSetFieldMode(true); } catch (e) { warn(e); } }
  else { try { if (W._gcField && W._gcField.open) W._gcField.open(); else if (W._gcJobPicker) W._gcJobPicker(); } catch (e) { warn(e); } }
  try { if (W._gcRA && W._gcRA.sync) W._gcRA.sync(); } catch (e) {}
  return 'field';
}
var last = null;
function choose(v){
  v = v === 'field' ? 'field' : 'desk';
  if (v === 'desk' && crewApp()) { toast('Crews use GrayCo Field.'); return 'crew'; }
  set(v);
  var r = v === 'desk' ? toDesk() : toField();
  last = { v: v, r: r, at: Date.now() };
  paint();
  /* GrayCo Field / the role apps look again a moment later (their own timers): make sure the choice holds */
  [400, 1500].forEach(function(ms){ later(function(){ try { if (pref() !== v) return; if (v === 'desk' && inField() && !crewApp()) toDesk(); paint(); } catch (e) {} }, ms); });
  return r;
}

/* ── every Desk / Field button, old and new: one rule ── */
var CTRL = '#_fmToggle,#_jpDesk,#_fhDesk,#_gcDeskBtn,._mi[data-a="desk"],.gc-fh-sheet [data-s="desk"],#gc-fh-backfield,[data-gc-view]';
function onClick(ev){
  var t = ev.target; if (!t || !t.closest) return;
  var b = t.closest(CTRL); if (!b) return;
  var v = b.getAttribute('data-gc-view') || (b.id === '_fmToggle' ? (inField() ? 'desk' : 'field') : b.id === 'gc-fh-backfield' ? 'field' : 'desk');
  ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
  try { var sh = b.closest('.gc-fh-sheet,._gcSheetOv,.gc-ra-sheet'); if (sh) sh.remove(); } catch (e) {}
  try { choose(v); } catch (e) { warn(e); }
}
W.addEventListener('click', onClick, true);

/* ── the old Desk / Field button names where it goes ── */
function paint(){
  var f = inField(), b = D.getElementById('_fmToggle');
  if (b) {
    var tx = f ? '🖥 Desk' : '📱 Field', ti = f ? 'Switch to Desk view' : 'Switch to Field view (GrayCo Field)';
    if (b.textContent !== tx) b.textContent = tx;
    if (b.title !== ti) b.title = ti;
  }
}
try { new MutationObserver(paint).observe(html(), { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
later(paint, 0); later(paint, 1500);

/* GrayCo Field's header button and ☰ More item (patch FIELD asks for them) */
function headBtn(){ return phone() ? '' : '<button type="button" class="fh-desk" data-gc-view="desk" title="Switch to Desk view">🖥 Desk</button>'; }
function moreItem(){ return '<button type="button" data-gc-view="desk"><span class="e">🖥</span><span>Desk view<small>The full CRM on this ' + (phone() ? 'phone' : 'device') + ' — 📱 Field brings you back</small></span></button>'; }

(function css(){
  var st = D.createElement('style'); st.id = 'gc-fd-css';
  st.textContent = '.gc-fh .fh-top #gc-fh-sync{margin-left:auto}' +
    '.gc-fh .fh-top .fh-desk{flex:0 0 auto;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:6px 12px;font:800 13px Inter,-apple-system,Segoe UI,sans-serif;cursor:pointer;min-height:0!important;white-space:nowrap}' +
    'html.gc-ra-field #_fmToggle,html.gc-ra-field [data-gc-view]{display:none!important}' +
    '#gc-fd-toast{display:none;position:fixed;left:50%;transform:translateX(-50%);bottom:calc(110px + env(safe-area-inset-bottom,0px));z-index:2147483000;background:#111827;color:#fff;border-radius:12px;padding:12px 16px;font:600 14px Inter,sans-serif;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:calc(100% - 32px)}';
  (D.head || D.documentElement).appendChild(st);
})();

W._gcChooseView = choose;
W._gcView = { phone: phone, pref: pref, set: set, choose: choose, headBtn: headBtn, moreItem: moreItem,
  state: function(){ return { phone: phone(), pref: pref(), field: inField(), deskPointer: deskPointer(), screen: [W.screen && W.screen.width, W.screen && W.screen.height], last: last }; } };
try { console.log('[GC] 🖥📱 Field or Desk: your own choice wins; a computer is a computer (patch FIELDDESK) — _gcView.state()'); } catch (e) {}
})();
