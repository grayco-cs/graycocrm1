/* __GC_PATCH_BOOTSAFE__ — the page can never stay blank without saying so (tools/patch_BOOTSAFE.py).
   r15b showed a black screen on the owner's Edge (rolled back 10/29, cause not proven). This first script of the page:
   * remembers each open until something is drawn (the sign-in screen or the CRM); errors thrown before that are kept
     (gc_boot_err) and shown;
   * 25 s after the page is read with nothing drawn: a panel says so, with "Reload" and "Open in safe mode";
   * SAFE MODE (automatic after 2 opens in a row that drew nothing, or 5 loads of this tab within 90 s = a reload loop;
     or by the button): this open runs without the r16 speed layers (STORECUT, SWEEPCHUNK, IDLETRIM, TODOPHONE = the r14d
     behaviour); it stays on for 24 h. localStorage gc_bootsafe_off = '1' turns all of this off.
   Tiny and synchronous: reads 2 small keys; nothing big is read, parsed or written before the first paint.
   Console: _gcBootSafe.state() */
(function(){
'use strict';
var W = window, D = document;
try {
  if (W.__GC_PATCH_BOOTSAFE__) return; W.__GC_PATCH_BOOTSAFE__ = true;
  var NST = W.setTimeout, T0 = Date.now(), KEY = 'gc_boot_try', SAFEK = 'gc_bootsafe', ERRK = 'gc_boot_err';
  var LS = null, SS = null; try { LS = W.localStorage; } catch (e) {} try { SS = W.sessionStorage; } catch (e) {}
  var get = function(st, k){ try { return st ? st.getItem(k) : null; } catch (e) { return null; } };
  var set = function(st, k, v){ try { if (st) { st.setItem(k, v); return true; } } catch (e) {} return false; };
  var del = function(st, k){ try { if (st) st.removeItem(k); } catch (e) {} };
  var jget = function(k){ var v = get(LS, k) || get(SS, k); if (!v || v.length > 4000) return null; try { return JSON.parse(v); } catch (e) { return null; } };
  var jset = function(k, o){ var s = JSON.stringify(o); if (!set(LS, k, s)) set(SS, k, s); };
  if (get(LS, 'gc_bootsafe_off') === '1') return;
  var st = { t0: T0, safe: false, why: '', drawn: 0, errs: [], prevFails: 0, loads: 0, panel: false };
  /* 1. the last opens: did they draw anything? */
  var prev = jget(KEY), fails = 0;
  if (prev && prev.open && T0 - (prev.at || 0) < 10 * 60e3) fails = (prev.fails || 0) + 1;
  st.prevFails = fails;
  /* 2. a reload loop in this tab */
  var loads = []; try { loads = JSON.parse(get(SS, 'gc_boot_loads') || '[]'); if (!Array.isArray(loads)) loads = []; } catch (e) { loads = []; }
  loads = loads.filter(function(t){ return typeof t === 'number' && T0 - t < 90e3; }); loads.push(T0); set(SS, 'gc_boot_loads', JSON.stringify(loads.slice(-8)));
  st.loads = loads.length;
  /* 3. safe mode for this open? */
  var sv = get(LS, SAFEK) || get(SS, SAFEK), until = sv ? +sv : 0;
  if (until && until > T0) { st.safe = true; st.why = 'safe mode on until ' + new Date(until).toLocaleString(); }
  else if (fails >= 2) { st.safe = true; st.why = fails + ' opens in a row drew nothing'; }
  else if (loads.length >= 5) { st.safe = true; st.why = loads.length + ' loads of this tab in 90 s'; }
  if (st.safe) {
    W.__GC_BOOTSAFE__ = true;
    if (!(until > T0)) { var u24 = String(T0 + 24 * 3600e3); if (!set(LS, SAFEK, u24)) set(SS, SAFEK, u24); }
    /* the speed layers that read their kill switch later (SWEEPCHUNK, IDLETRIM, TODOPHONE) see it switched off */
    try {
      var OFFK = { gc_storecut_off: 1, gc_sweepchunk_off: 1, gc_idletrim_off: 1, gc_todophone_off: 1 }, P = W.Storage && W.Storage.prototype, G0 = P && P.getItem;
      if (G0) P.getItem = function(k){ if (this === LS && OFFK[k] === 1) return '1'; return G0.apply(this, arguments); };
    } catch (e) {}
    try { console.warn('[GC] BOOTSAFE: safe mode (' + st.why + ') — the r16 speed layers are off for this open'); } catch (e) {}
  }
  jset(KEY, { open: 1, at: T0, fails: fails, safe: st.safe });
  /* 4. errors before anything is drawn */
  var onErr = function(ev){
    try {
      if (st.drawn) return;
      var m = ev && (ev.message || (ev.reason && (ev.reason.message || String(ev.reason))) || (ev.error && ev.error.message)) || 'error';
      var where = ev && ev.filename ? ' @' + String(ev.lineno || '') + ':' + String(ev.colno || '') : '';
      if (st.errs.length < 5) st.errs.push(String(m).slice(0, 160) + where);
      jset(ERRK, { at: T0, errs: st.errs, ua: String(navigator.userAgent || '').slice(0, 120) });
    } catch (e) {}
  };
  try { W.addEventListener('error', onErr, true); W.addEventListener('unhandledrejection', onErr, true); } catch (e) {}
  /* 5. drawn? (the sign-in screen, or the CRM in #root) -- a cheap poll, stops at the first yes */
  var isDrawn = function(){
    try {
      var g = D.getElementById('gc-auth-email'); if (g && g.getClientRects().length) return 'sign-in';
      var r = D.getElementById('root'); if (r && r.firstElementChild && (r.textContent || '').length > 20) return 'crm';
    } catch (e) {}
    return '';
  };
  var panel = null;
  var showPanel = function(){
    try {
      if (panel || st.drawn) return; st.panel = true;
      panel = D.createElement('div'); panel.id = 'gc-bootsafe'; panel.setAttribute('role', 'alert'); panel.setAttribute('data-gc-keep', '1');
      panel.style.cssText = 'position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:2147483647;max-width:460px;width:calc(100% - 32px);box-sizing:border-box;background:#fff;color:#0f2440;border-radius:12px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.45);font:14px/1.45 Inter,-apple-system,Segoe UI,sans-serif';
      var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
      panel.innerHTML = '<div style="font-weight:800;font-size:16px;margin-bottom:4px">The CRM has not opened yet</div>' +
        '<div style="color:#475569">It is taking much longer than it should. You can reload, or open it in safe mode (the newest speed changes switched off for a day).</div>' +
        (st.errs.length ? '<div style="margin-top:8px;font:12px/1.4 monospace;color:#b91c1c;max-height:90px;overflow:auto">' + st.errs.map(esc).join('<br>') + '</div>' : '') +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="button" data-a="reload" style="flex:1;min-width:120px;padding:9px 12px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">Reload</button>' +
        '<button type="button" data-a="safe" style="flex:1;min-width:120px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#0f2440;font-weight:700;cursor:pointer">Open in safe mode</button></div>';
      panel.addEventListener('click', function(ev){
        var a = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-a'); if (!a) return;
        if (a === 'safe') { var u = String(Date.now() + 24 * 3600e3); if (!set(LS, SAFEK, u)) set(SS, SAFEK, u); }
        try { location.reload(); } catch (e) {}
      });
      (D.body || D.documentElement).appendChild(panel);
    } catch (e) {}
  };
  var readAt = 0;
  var poll = function(){
    try {
      var w = isDrawn();
      if (w) {
        st.drawn = Date.now() - T0; st.what = w;
        jset(KEY, { open: 0, at: T0, fails: 0, drawnMs: st.drawn, safe: st.safe });
        if (!st.errs.length) del(LS, ERRK);
        try { W.removeEventListener('error', onErr, true); W.removeEventListener('unhandledrejection', onErr, true); } catch (e) {}
        if (panel) { try { panel.remove(); } catch (e) {} panel = null; }
        return;
      }
      if (D.readyState !== 'loading' && !readAt) readAt = Date.now();
      if (readAt && Date.now() - readAt > 25000 && D.visibilityState !== 'hidden') showPanel();
      if (Date.now() - T0 > 15 * 60e3) return;
    } catch (e) {}
    NST.call(W, poll, 500);
  };
  NST.call(W, poll, 500);
  W._gcBootSafe = {
    state: function(){ return { safe: st.safe, why: st.why, drawnMs: st.drawn, what: st.what || '', errorsBeforeDraw: st.errs.slice(), previousBlankOpens: st.prevFails, loadsIn90s: st.loads, panelShown: st.panel, lastError: jget(ERRK) }; },
    off: function(){ del(LS, SAFEK); del(SS, SAFEK); return 'safe mode off from the next open'; }
  };
} catch (e) { try { console.warn('[GC] BOOTSAFE not installed:', e && e.message || e); } catch (x) {} }
})();
