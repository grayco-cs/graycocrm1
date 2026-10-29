/* __GC_PATCH_STORECUT__ — one estimates store in the cloud ("estimates"; the builder's "__est__gc_ests_v2" is not uploaded and a
   named read of it is answered from "estimates"), identical reads in flight share one download, and a hidden tab repeats no
   read for 5 minutes (tools/patch_STORECUT.py). Kill switch: localStorage gc_storecut_off = '1'. Console: _gcStoreCut.state() */
(function(){
'use strict';
if (window.__GC_PATCH_STORECUT__) return; window.__GC_PATCH_STORECUT__ = true;
var W = window, NF = W.fetch, NST = W.setTimeout;
if (typeof NF !== 'function') return;
var OFF = false; try { OFF = localStorage.getItem('gc_storecut_off') === '1'; } catch (e) {}
if (OFF) { try { console.log('[GC] STORECUT off (gc_storecut_off)'); } catch (e) {} return; }
var V2 = '__est__gc_ests_v2', EST = 'estimates';
var HIDDEN_TTL = 5 * 60e3, HIDDEN_AFTER = 30e3, MAX_CACHE = 60;
var S = { v2WritesDropped: 0, v2ReadsServed: 0, bulkFiltered: 0, shared: 0, hiddenServed: 0, net: 0, allow: {}, hiddenSince: 0 };
function urlOf(input){ try { return typeof input === 'string' ? input : (input && input.url) ? input.url : String(input); } catch (e) { return ''; } }
function methodOf(input, init){ var m = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET'; return String(m).toUpperCase(); }
function qs(u){ var i = u.indexOf('?'); return i < 0 ? '' : u.slice(i + 1); }
function dec(x){ try { return decodeURIComponent(x); } catch (e) { return x; } }
function keyEq(q){ var m = /(?:^|&)key=eq\.([^&]*)/.exec(q); return m ? dec(m[1]).replace(/^"|"$/g, '') : ''; }
function fake(status, body){ return Promise.resolve(new Response(status === 204 ? null : (body == null ? '[]' : body), { status: status, headers: { 'content-type': 'application/json' } })); }
function hdr(input, init, name){
  try { var h = (init && init.headers) || (input && typeof input === 'object' && input.headers); if (!h) return ''; if (typeof h.get === 'function') return h.get(name) || ''; return h[name] || h[name.toLowerCase()] || ''; } catch (e) { return ''; }
}

/* ── 1. one estimates store ─────────────────────────────────────────────── */
function v2Read(input, init, u){
  /* the builder's store, asked for by name: the same records from "estimates", in the builder's shape (JSON text) */
  var u2 = u.replace(/([?&]key=eq\.)[^&]*/, '$1' + EST);
  var req = typeof input === 'string' ? u2 : (function(){ try { return new Request(u2, input); } catch (e) { return u2; } })();
  return NF.call(W, req, init).then(function(r){
    if (!r || !r.ok) return r;
    return r.clone().json().then(function(rows){
      if (!Array.isArray(rows)) return r;
      S.v2ReadsServed++;
      var out = rows.map(function(x){ var o = Object.assign({}, x); if ('key' in o) o.key = V2; if ('value' in o && typeof o.value !== 'string' && o.value != null) o.value = JSON.stringify(o.value); return o; });
      var h = new Headers(r.headers); h.set('content-type', 'application/json');
      return new Response(JSON.stringify(out), { status: r.status, statusText: r.statusText, headers: h });
    }, function(){ return r; });
  });
}
function v2Write(input, init, u, m){
  if (S.allow[V2]) return null;                      /* the admin clean-up empties it on purpose */
  var k = keyEq(qs(u));
  if (k === V2) { S.v2WritesDropped++; return fake(m === 'POST' ? 201 : 204); }
  var b = init && init.body;
  if (typeof b !== 'string' || b.indexOf(V2) < 0) return null;
  var j = null; try { j = JSON.parse(b); } catch (e) { return null; }
  if (!j || typeof j !== 'object') return null;
  var arr = Array.isArray(j) ? j : [j], keep = arr.filter(function(r){ return !(r && r.key === V2); });
  if (keep.length === arr.length) return null;
  S.v2WritesDropped++;
  if (!keep.length) return fake(m === 'POST' ? 201 : 204);
  return { init: Object.assign({}, init, { body: JSON.stringify(Array.isArray(j) ? keep : keep[0]) }) };
}
function bulkRewrite(u){
  /* a read of many rows (start-up pull, change check, "what changed" pull): never the builder copy */
  var q = qs(u); if (!q || /(?:^|&)key=eq\./.test(q)) return u;
  if (/(?:^|&)key=in\./.test(q) && q.indexOf(V2) < 0 && q.indexOf(encodeURIComponent(V2)) < 0) return u;
  S.bulkFiltered++;
  return u + '&key=not.eq.' + V2;
}

/* ── 2. reads: share the ones in flight; a hidden tab does not repeat itself ─────────────────────── */
var inflight = new Map(), memo = new Map();
function hiddenLong(){ try { return document.visibilityState === 'hidden' && S.hiddenSince && Date.now() - S.hiddenSince > HIDDEN_AFTER; } catch (e) { return false; } }
function onVis(){ try { if (document.visibilityState === 'hidden') { if (!S.hiddenSince) S.hiddenSince = Date.now(); } else { S.hiddenSince = 0; memo.clear(); } } catch (e) {} }
try { document.addEventListener('visibilitychange', onVis, true); onVis(); } catch (e) {}
function cacheable(u){
  /* the database's REST reads and the CRM's own functions; never auth, file storage, realtime or a "changed since" read */
  if (u.indexOf('/auth/v1/') >= 0 || u.indexOf('/storage/v1/') >= 0 || u.indexOf('/realtime/') >= 0) return false;
  if (/[?&]updated_at=gte?\./.test(u)) return false;
  return u.indexOf('/rest/v1/') >= 0 || u.indexOf('/.netlify/functions/') >= 0;
}
function small(u, r){
  /* only small answers are remembered: the change check (keys + time stamps) and the functions' status reads */
  var n = 0; try { n = +(r.headers.get('content-length') || 0); } catch (e) {}
  if (n > 300000) return false;
  if (u.indexOf('/.netlify/functions/') >= 0) return true;
  return /[?&]select=(key,updated_at|updated_at,key|updated_at)(&|$)/.test(u) || (n > 0 && n < 20000);
}
function remember(id, r){
  if (memo.size >= MAX_CACHE) { var first = memo.keys().next().value; memo['delete'](first); }
  memo.set(id, { at: Date.now(), r: r });
}
function shareRead(input, init, u){
  if (init && init.signal) return null;              /* a read that can be cancelled is left alone */
  var id = u + '\n' + hdr(input, init, 'Authorization') + '\n' + hdr(input, init, 'Range') + '\n' + hdr(input, init, 'Accept') + '\n' + hdr(input, init, 'Prefer');
  if (hiddenLong()) {
    var c = memo.get(id);
    if (c && Date.now() - c.at < HIDDEN_TTL) { S.hiddenServed++; return Promise.resolve(c.r.clone()); }
  }
  var p = inflight.get(id);
  if (p) { S.shared++; return p.then(function(r){ return r.clone(); }); }
  S.net++;
  p = NF.call(W, input, init).then(function(r){
    inflight['delete'](id);
    if (r && r.ok && r.status === 200 && small(u, r)) remember(id, r.clone()); else memo['delete'](id);
    return r;
  }, function(e){ inflight['delete'](id); throw e; });
  inflight.set(id, p);
  return p.then(function(r){ return r.clone(); });
}

W.fetch = function(input, init){
  try {
    var u = urlOf(input), m = methodOf(input, init);
    var kv = u.indexOf('/rest/v1/gc_kv') >= 0;
    if (m === 'GET' || m === 'HEAD') {
      if (kv) {
        if (keyEq(qs(u)) === V2 && m === 'GET') return v2Read(input, init, u);
        var u2 = bulkRewrite(u);
        if (u2 !== u) { u = u2; if (typeof input === 'string') input = u2; else { try { input = new Request(u2, input); } catch (e) { input = u2; } } }
      }
      if (m === 'GET' && cacheable(u)) { var sr = shareRead(input, init, u); if (sr) return sr; }
    } else {
      memo.clear();                                   /* anything written: no remembered answer is trusted any more */
      if (kv) { var w = v2Write(input, init, u, m); if (w && typeof w.then === 'function') return w; if (w && w.init) init = w.init; }
    }
  } catch (e) {}
  return NF.call(W, input, init);
};
try { W.fetch.__gcStorecut = true; } catch (e) {}
W._gcStoreCut = {
  state: function(){ return { v2WritesDropped: S.v2WritesDropped, v2ReadsServed: S.v2ReadsServed, bulkFiltered: S.bulkFiltered, sharedReads: S.shared, hiddenServed: S.hiddenServed, networkReads: S.net, remembered: memo.size, hiddenFor: S.hiddenSince ? Date.now() - S.hiddenSince : 0 }; },
  allow: function(k, on){ if (on) S.allow[k] = true; else delete S.allow[k]; },
  forget: function(){ memo.clear(); }
};
try { console.log('[GC] STORECUT: one estimates store; reads shared; a hidden tab stays quiet — _gcStoreCut.state()'); } catch (e) {}
})();
