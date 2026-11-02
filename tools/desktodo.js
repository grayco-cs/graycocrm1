/* patch DESKTODO */
/* The Desk home (patch ROLEAPPS, #gc-ra-desk) steps aside the moment any other screen opens, by any path.
   ROLEAPPS hid it from its own buttons and from its _setView wrapper; but the CRM hands out a new window._setView on
   every screen change (the wrapper is gone until ROLEAPPS' next check, which slows to every 30 s when nobody touches
   the computer), and links, notifications, To-Do cards, @mention To-Dos and search results also open windows on top
   without a screen change. Here: (1) every screen change (the CRM always writes localStorage grayco_view), (2) a link
   opened by its address (#lead=…, #appr=…, #tv, …: notifications), (3) a window put up over the page (a fixed layer that
   covers most of it) hide the Desk at once. Its own sheets, the dock, toasts and small bars never do. The dock's 🏠 Home
   brings it back. window._gcDeskToDo.state() tells what hid it last. */
(function(){
  'use strict';
  var W = window, D = document;
  if (W.__GC_DESKTODO__) return; W.__GC_DESKTODO__ = true;
  var last = { at: 0, why: '' }, n = 0;
  function shown(){ var el = D.getElementById('gc-ra-desk'); return !!(el && el.style.display !== 'none' && el.isConnected); }
  function hide(why){
    if (!shown()) return false;
    try { if (W._gcRA && typeof W._gcRA.hide === 'function') W._gcRA.hide(); else { var el = D.getElementById('gc-ra-desk'); if (el) el.style.display = 'none'; } } catch (e) { return false; }
    last = { at: Date.now(), why: why }; n++;
    return true;
  }
  /* 1. a screen change, whoever made it */
  try {
    var SP = Storage.prototype, setItem = SP.setItem;
    SP.setItem = function(k, v){
      var change = false;
      try { if (k === 'grayco_view' && this === W.localStorage) change = String(v) !== String(W.localStorage.getItem('grayco_view')); } catch (e) {}
      var r = setItem.apply(this, arguments);
      if (change) { try { hide('screen: ' + String(v)); } catch (e) {} }
      return r;
    };
  } catch (e) {}
  /* 2. a link opened by its address (a notification, an e-mailed link, a To-Do link) */
  W.addEventListener('hashchange', function(){ if ((location.hash || '').length > 1) hide('link: ' + location.hash.slice(0, 40)); });
  /* 3. a window put up over the page */
  function ours(el){ return !!(el.id === 'gc-ra-desk' || el.id === 'gc-ra-dock' || (el.closest && el.closest('#gc-ra-desk, #gc-ra-dock, .gc-ra-sheet')) || /gc-ra-|toast|apx-undo/i.test(String(el.className || '') + ' ' + el.id)); }
  function covers(el){
    try {
      if (!el || el.nodeType !== 1 || ours(el)) return false;
      var cs = getComputedStyle(el); if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return false;
      var r = el.getBoundingClientRect(); return r.width * r.height > 0.5 * innerWidth * innerHeight;
    } catch (e) { return false; }
  }
  try {
    /* the browser's own observer: the CRM's observer governor holds callbacks while the person is moving the mouse, which is
       exactly when a window is being opened */
    var MO = (W.MutationObserver && W.MutationObserver.prototype && typeof W.MutationObserver.prototype.constructor === 'function') ? W.MutationObserver.prototype.constructor : W.MutationObserver;
    new MO(function(ms){
      if (!shown()) return;
      for (var i = 0; i < ms.length; i++) { var a = ms[i].addedNodes; for (var j = 0; j < a.length; j++) if (covers(a[j])) { hide('window: ' + (a[j].id || String(a[j].className || '').slice(0, 30) || a[j].tagName)); return; } }
    }).observe(D.body || D.documentElement, { childList: true });
  } catch (e) {}
  W._gcDeskToDo = { state: function(){ return { shown: shown(), last: last, hides: n }; }, hide: hide };
})();
