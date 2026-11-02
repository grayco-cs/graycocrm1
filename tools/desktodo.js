/* patch DESKTODO */
/* The Desk home (patch ROLEAPPS, #gc-ra-desk) steps aside the moment any other screen opens, by any path.
   ROLEAPPS hid it from its own buttons and from its _setView wrapper; but the CRM hands out a new window._setView on
   every screen change (the wrapper is gone until ROLEAPPS' next check, which slows to every 30 s when nobody touches
   the computer), and links, notifications, To-Do cards, @mention To-Dos and search results also open windows on top
   without a screen change. Here: (1) every screen change (the CRM always writes localStorage grayco_view), (2) a link
   opened by its address (#lead=…, #appr=…, #tv, …: notifications) hide the Desk at once. Windows the CRM puts up over the
   page (z-index 100000+) already sit above the Desk (9000) and are used as they are. The dock's 🏠 Home
   brings it back. A menu click and the CRM's own window._setView (patch_DESKTODO.py) also hide it, so a link to the screen that is already under
   the Desk shows it too. window._gcDeskToDo.state() tells what hid it last. */
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
  /* 1b. the menu (a menu item clicked, even to the screen already open under the Desk) */
  D.addEventListener('click', function(e){ try { var el = e.target; if (el && el.closest && el.closest('aside nav, aside [draggable="true"]') && !el.closest('#gc-ra-desk, #gc-ra-dock')) hide('menu'); } catch (x) {} }, true);
  /* 2. a link opened by its address (a notification, an e-mailed link, a To-Do link) */
  W.addEventListener('hashchange', function(){ if ((location.hash || '').length > 1) hide('link: ' + location.hash.slice(0, 40)); });
  W._gcDeskToDo = { state: function(){ return { shown: shown(), last: last, hides: n }; }, hide: hide };
})();
