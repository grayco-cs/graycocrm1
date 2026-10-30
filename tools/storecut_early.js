/* __GC_PATCH_STORECUT__ — one estimates store in the cloud ("estimates"; the builder's "__est__gc_ests_v2" is not uploaded and a
   named read of it is answered from "estimates"), identical reads in flight share one download, and a hidden tab repeats no
   read for 5 minutes (tools/patch_STORECUT.py). Kill switch: localStorage gc_storecut_off = '1'. Console: _gcStoreCut.state() */
(function(){
'use strict';
if (window.__GC_PATCH_STORECUT__) return; window.__GC_PATCH_STORECUT__ = true;
var W = window, NF = W.fetch, NST = W.setTimeout;
if (typeof NF !== 'function') return;
var OFF = false; try { OFF = localStorage.getItem('gc_storecut_off') === '1'; } catch (e) {}
if (W.__GC_BOOTSAFE__ === true) OFF = true;           /* BOOTSAFE: the last opens of this page drew nothing -- plain fetch */
if (OFF) { try { console.log('[GC] STORECUT off (' + (W.__GC_BOOTSAFE__ === true ? 'safe mode' : 'gc_storecut_off') + ')'); } catch (e) {} return; }
try {   /* BOOTSAFE: nothing below may throw out of this script; any failure leaves the plain fetch in place */
var V2 = '__est__gc_ests_v2', EST = 'estimates';
var HIDDEN_TTL = 5 * 60e3, HIDDEN_AFTER = 30e3, MAX_CACHE = 60;
var S = { internalErr: 0, validated: 0, savedBytes: 0, v2WritesDropped: 0, v2ReadsServed: 0, bulkFiltered: 0, shared: 0, hiddenServed: 0, net: 0, allow: {}, hiddenSince: 0 };
function urlOf(input){ try { return typeof input === 'string' ? input : (input && input.url) ? input.url : String(input); } catch (e) { return ''; } }
function methodOf(input, init){ var m = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET'; return String(m).toUpperCase(); }
function qs(u){ var i = u.indexOf('?'); return i < 0 ? '' : u.slice(i + 1); }
function dec(x){ try { return decodeURIComponent(x); } catch (e) { return x; } }
function keyEq(q){ var m = /(?:^|&)key=eq\.([^&]*)/.exec(q); return m ? dec(m[1]).replace(/^"|"$/g, '') : ''; }
function fake(status, body){ return Promise.resolve(new Response(status === 204 ? null : (body == null ? '[]' : body), { status: status, headers: { 'content-type': 'application/json' } })); }
function NET(input, init){ return NF.call(W, input, init).then(null, function(e){ throw { __gcNet: true, err: e }; }); }
function hdr(input, init, name){
  try { var h = (init && init.headers) || (input && typeof input === 'object' && input.headers); if (!h) return ''; if (typeof h.get === 'function') return h.get(name) || ''; return h[name] || h[name.toLowerCase()] || ''; } catch (e) { return ''; }
}

/* ── 1. one estimates store ─────────────────────────────────────────────── */
function v2Read(input, init, u){
  /* the builder's store, asked for by name: the same records from "estimates", in the builder's shape (JSON text) */
  var u2 = u.replace(/([?&]key=eq\.)[^&]*/, '$1' + EST);
  var req = typeof input === 'string' ? u2 : (function(){ try { return new Request(u2, input); } catch (e) { return u2; } })();
  return NET(req, init).then(function(r){
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
function kvOf(u){ return u.indexOf('/rest/v1/gc_kv') >= 0; }
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
/* ── 3. a big row is downloaded again only when it changed ─────────────────────────────
   A named read of rows with their values (key=eq. / key=in.): the first big answer (>= 50 KB) is kept with the
   rows' time stamps; the next identical read first asks for the stamps only (key + updated_at, a few bytes) and,
   when every stamp is the same, answers from the kept copy. A write of one of those keys from this page drops
   the copy; a copy is never older than 10 minutes. */
var VC = new Map(), VC_TTL = 10 * 60e3, VC_MIN = 50000, VC_MAX = 16e6, vcBytes = 0;
function valueRead(u){
  var q = qs(u); if (!q || /(?:^|&)(updated_at|limit|offset|order)=/.test(q)) return false;
  if (!/(?:^|&)key=(eq|in)\./.test(q) || /(?:^|&)key=(like|ilike)\./.test(q)) return false;
  var sel = (/(?:^|&)select=([^&]*)/.exec(q) || [])[1]; sel = sel == null ? '*' : dec(sel);
  return sel === '*' || /\bvalue\b/.test(sel);
}
function stampUrl(u){
  var i = u.indexOf('?'), base = u.slice(0, i), parts = u.slice(i + 1).split('&').filter(function(x){ return !/^select=/.test(x); });
  parts.push('select=key,updated_at'); return base + '?' + parts.join('&');
}
function sigOf(rows){
  if (!Array.isArray(rows)) rows = rows && typeof rows === 'object' ? [rows] : null;
  if (!rows) return null;
  var out = [];
  for (var i = 0; i < rows.length; i++) { var r = rows[i]; if (!r || r.key == null || !r.updated_at) return null; out.push(String(r.key) + '@' + String(r.updated_at)); }
  return out.sort().join('|') || '-';
}
function keysOfUrl(u){
  var q = qs(u), m = /(?:^|&)key=eq\.([^&]*)/.exec(q); if (m) return [dec(m[1]).replace(/^"|"$/g, '')];
  m = /(?:^|&)key=in\.\(([^&]*)\)/.exec(q); return m ? dec(m[1]).split(',').map(function(x){ return x.replace(/^"|"$/g, ''); }) : [];
}
function vcDrop(keys){
  if (!VC.size) return;
  VC.forEach(function(c, id){ if (!keys || c.keys.some(function(k){ return keys.indexOf(k) >= 0; })) { vcBytes -= c.body.length; VC['delete'](id); } });
}
function writtenKeys(u, init){
  var ks = keysOfUrl(u), b = init && init.body;
  if (typeof b === 'string') { var re = /"key"\s*:\s*"([^"]+)"/g, m; while ((m = re.exec(b.slice(0, 200000)))) ks.push(m[1]); }
  return ks.length ? ks : null;
}
function stampsNow(input, init, u){
  var su = stampUrl(u), req = su;
  if (typeof input !== 'string') { try { req = new Request(su, input); } catch (e) { req = su; } }
  return NET(req, init).then(function(r){ return r && r.ok ? r.json().then(sigOf, function(){ return null; }) : null; }, function(){ return null; });
}
function valueFetch(input, init, u, id){
  var c = VC.get(id), fresh = c && Date.now() - c.at < VC_TTL;
  if (c && c.small && fresh) return NET(input, init);             /* a small row: not worth a second request */
  /* the stamps are asked BEFORE the download (also the first time), so a kept copy is never newer than its stamps;
     BOOTSAFE: always asked (a few bytes) -- they are the kept copy's signature, the big answer is never parsed here */
  var pre = stampsNow(input, init, u);
  return pre.then(function(sig){
    if (c && fresh && sig && sig === c.sig && c.body != null) {
      S.validated++; S.savedBytes += c.body.length;
      var hh = { 'content-type': 'application/json' }; if (c.range) hh['content-range'] = c.range; return new Response(c.body, { status: 200, headers: hh });
    }
    return NET(input, init).then(function(r){
      if (!r || !r.ok || r.status !== 200) return r;
      return r.clone().text().then(function(t){
        if (t.length < VC_MIN || t.length > VC_MAX / 2) { if (!VC.has(id) && VC.size < 400) VC.set(id, { at: Date.now(), small: true, body: '', keys: keysOfUrl(u) }); return r; }
        /* BOOTSAFE: the signature is the stamps asked BEFORE the download (never newer than the body); the old code also
           JSON.parse'd every answer of 50 KB - 8 MB here (estimates 2.7 MB) -- a second full parse on the main thread */
        var useSig = sig;
        var old = VC.get(id); if (old) { vcBytes -= old.body.length; VC['delete'](id); }
        if (!useSig) { VC.set(id, { at: Date.now(), sig: null, needStamp: true, body: '', keys: keysOfUrl(u) }); return r; }
        while (vcBytes + t.length > VC_MAX && VC.size) { var k0 = VC.keys().next().value; vcBytes -= VC.get(k0).body.length; VC['delete'](k0); }
        VC.set(id, { at: Date.now(), sig: useSig, body: t, keys: keysOfUrl(u), range: r.headers.get('content-range') || '' }); vcBytes += t.length;
        return r;
      }, function(){ return r; });
    });
  });
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
  var vr = kvOf(u) && valueRead(u) && !hdr(input, init, 'Range');
  p = (vr ? valueFetch(input, init, u, id) : NET(input, init)).then(function(r){
    inflight['delete'](id);
    if (r && r.ok && r.status === 200 && small(u, r)) remember(id, r.clone()); else memo['delete'](id);
    return r;
  }, function(e){ inflight['delete'](id); throw e; });
  inflight.set(id, p);
  return p.then(function(r){ return r.clone(); });
}

function wrapped(input, init){
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
      if (kv) vcDrop(writtenKeys(u, init));
      if (kv) { var w = v2Write(input, init, u, m); if (w && typeof w.then === 'function') return w; if (w && w.init) init = w.init; }
    }
  } catch (e) { S.internalErr++; }
  return NET(input, init);   /* a network failure (of a write too) is passed on as it is -- never sent twice */
}
W.fetch = function(input, init){
  /* BOOTSAFE: a failure of this layer (not of the network) is answered by the plain fetch, never by an error */
  var r; try { r = wrapped(input, init); } catch (e) { S.internalErr++; return NF.call(W, input, init); }
  if (!r || typeof r.then !== 'function') return NF.call(W, input, init);
  return r.then(null, function(e){
    if (e && e.__gcNet) throw e.err;
    S.internalErr++; try { console.warn('[GC] STORECUT: plain fetch after an internal error', e && e.message || e); } catch (x) {}
    return NF.call(W, input, init);
  });
};
try { W.fetch.__gcStorecut = true; } catch (e) {}
W._gcStoreCut = {
  state: function(){ return { internalErrors: S.internalErr, v2WritesDropped: S.v2WritesDropped, v2ReadsServed: S.v2ReadsServed, bulkFiltered: S.bulkFiltered, sharedReads: S.shared, hiddenServed: S.hiddenServed, networkReads: S.net, bigReadsUnchanged: S.validated, mbNotDownloaded: Math.round(S.savedBytes / 1e4) / 100, keptCopies: VC.size, remembered: memo.size, hiddenFor: S.hiddenSince ? Date.now() - S.hiddenSince : 0 }; },
  raw: function(u, init){ return NF.call(W, u, init); },   /* the admin clean-up: below every later door (no-file-sync, file conversions) */
  allow: function(k, on){ if (on) S.allow[k] = true; else delete S.allow[k]; },
  forget: function(){ memo.clear(); vcDrop(null); }
};
try { console.log('[GC] STORECUT: one estimates store; reads shared; a hidden tab stays quiet — _gcStoreCut.state()'); } catch (e) {}
} catch (e) { try { W.fetch = NF; delete W._gcStoreCut; console.warn('[GC] STORECUT not installed:', e && e.message || e); } catch (x) {} }
})();
