/* gc-address.js — GrayCo's company address with its scheduled move (patch ADDR2).
   Owner (10/21): "We are at the current address for about one more week, then we move down Broadway Rd."
   ONE setting (gc_kv "gc_company_address" = { current, next, switchOn }) edited in ⚙ Admin → 🏢 Company address.
   Before switchOn (a Central-time day) every page shows `current`, on and after it `next`.
   The defaults below are used until the setting is read (and with no network). The server has the same rule
   (netlify/functions/_lib/brand.js companyAddress()); the CRM page inlines this file.
     window._gcCompanyAddress(when?)  → "4007 Broadway Rd, Bartlett, TN 38135"
     window._gcCompanyStreet(when?)   → "4007 Broadway Rd"
     window._gcCompanyAddress.config() → { current, next, switchOn }
   Static pages: <span data-gc-addr>…</span> / <span data-gc-street>…</span> are filled in.
   patch ADDRALL: window._gcCompanyAddress.ready → a Promise that settles once the saved setting was read (or after 4 s);
   a change fires the window event "gc:company-address" ({ detail: config }). */
(function(){
  if (window._gcCompanyAddress) return;
  var DEF = { current: '4007 Broadway Rd, Bartlett, TN 38135', next: '4014 Broadway Rd, Bartlett, TN 38135', switchOn: '' };
  var LK = 'gc_company_address';
  function s(v){ return v == null ? '' : String(v).trim(); }
  function merge(v){
    var c = { current: DEF.current, next: DEF.next, switchOn: DEF.switchOn };
    if (v && typeof v === 'object') {
      if (s(v.current)) c.current = s(v.current);
      if (s(v.next)) c.next = s(v.next);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s(v.switchOn))) c.switchOn = s(v.switchOn); else if (v.switchOn === '') c.switchOn = '';
    }
    /* patch ADDRALL: the addresses used before ({ address, until }); a paper dated before `until` keeps that one */
    c.history = (v && Array.isArray(v.history) ? v.history : []).filter(function(x){ return x && s(x.address) && !isNaN(Date.parse(s(x.until))); })
      .map(function(x){ return { address: s(x.address), until: s(x.until) }; }).sort(function(a, b){ return Date.parse(a.until) - Date.parse(b.until); }).slice(-30);
    return c;
  }
  function stored(){ try { return JSON.parse(localStorage.getItem(LK) || 'null'); } catch (e) { return null; } }
  function cfg(){ return merge(stored()); }
  function centralDay(d){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
    catch (e) { return new Date(d.getTime() - 6 * 3600e3).toISOString().slice(0, 10); }
  }
  function addr(when){
    var c = cfg(), d = when ? new Date(when) : new Date(); if (isNaN(d.getTime())) d = new Date();
    if (when && c.history.length) { for (var i = 0; i < c.history.length; i++) if (Date.parse(c.history[i].until) > d.getTime()) return c.history[i].address; }
    if (!c.next || !c.switchOn) return c.current;
    return centralDay(d) >= c.switchOn ? c.next : c.current;
  }
  function street(when){ return addr(when).split(',')[0].trim(); }
  function fill(){
    try {
      var a = addr(), st = street();
      document.querySelectorAll('[data-gc-addr]').forEach(function(e){ if (e.textContent !== a) e.textContent = a; });
      document.querySelectorAll('[data-gc-street]').forEach(function(e){ if (e.textContent !== st) e.textContent = st; });
    } catch (e) {}
  }
  addr.config = cfg; addr.defaults = DEF; addr.street = street; addr.fill = fill; addr.centralDay = centralDay; addr.merge = merge;
  addr.set = function(v){
    var before = JSON.stringify(cfg()), c = merge(v); try { localStorage.setItem(LK, JSON.stringify(c)); } catch (e) {} fill();
    if (JSON.stringify(c) !== before) { try { window.dispatchEvent(new CustomEvent('gc:company-address', { detail: c })); } catch (e) {} }
    return c;
  };
  var settle = null; addr.ready = new Promise(function(res){ settle = res; });
  setTimeout(function(){ settle(cfg()); }, 4000);
  window._gcCompanyAddress = addr; window._gcCompanyStreet = street;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill); else fill();
  /* the saved setting, through the CRM's public door (the CRM page itself reads gc_kv instead) */
  if (window.__GC_ADDR_NO_FETCH__ || !window.fetch || !/^https?:$/.test(location.protocol)) { settle(cfg()); return; }
  try {
    fetch('/.netlify/functions/mkt-public?company=1', { cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
      if (j && j.ok && j.config) { addr.set(j.config); }
    }).catch(function(){}).then(function(){ settle(cfg()); });
  } catch (e) { settle(cfg()); }
})();
