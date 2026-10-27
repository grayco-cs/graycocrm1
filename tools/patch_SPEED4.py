#!/usr/bin/env python3
"""Idempotent patch SPEED4: overnight speed work (reads, saves, the busiest screens).
 1. READ CACHE at the one door every database request goes through (the sign-in layer):
    - the same read already on its way is shared, not sent twice;
    - what the live feed just delivered (key + value + timestamp) answers the re-read that every other computer
      made ~400 ms after each save; the cloud is not asked for it again (20 s, while the live feed is connected);
    - once the server confirms the docs/scale-20.sql timestamp trigger (checked by the CRM itself with a tiny probe
      row), the ~25 once-a-minute readers are answered by ONE batched "which of these changed?" question
      (key + timestamp only, asked after the read); only a list whose timestamp moved is downloaded again (a save's
      two or three re-reads of its list, and the big estimates list, are not re-downloaded while unchanged).
      Without the trigger this part stays off.
    A save to a key, a conflict, or a live-feed change drops its copy at once; nothing is ever written from it.
 (The click-latency half is tools/patch_SPEED4C.py, which also applies to origin/main on its own.)
Each find-string must occur exactly once."""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch SPEED4 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def sub(old, new, label, count=1):
    global src
    assert src.count(old) == count, (label, 'count', src.count(old))
    src = src.replace(old, new)

# ── 1. the read cache ────────────────────────────────────────────────────────────────────────────────────────────
RC = r"""/* patch SPEED4 */
/* ── READ CACHE (patch SPEED4) ─────────────────────────────────────────────────────────────────────────────────
   Reads of gc_kv rows (one key, or a few with key=in.(…), columns key / value / updated_at only) are answered here
   when this computer already knows what the cloud holds:
   - A. the same read already on its way is shared (every tab and engine asks for the same rows at once);
   - B. what the live feed delivered (key, value, timestamp) in the last 20 s while it stayed connected — the
        re-read every other computer used to make right after each save;
   - C. only with the gc_kv_touch trigger (docs/scale-20.sql) confirmed by the probe below: a kept copy whose
        timestamp the cloud confirms unchanged, asked AFTER the read was (one tiny key+updated_at question for all
        the reads asked in the same 25 ms): a save's re-reads and the once-a-minute readers no longer download
        their whole list again when it did not change.
   A save of a key (sent, answered or refused), a live-feed change of it, or a dropped live connection forgets its
   copy at once; a read that started before a save is not kept. Nothing here writes. localStorage gc_rc_off = '1'
   turns it off; _gcReadCache() says what it did. */
var RC_E = {}, RC_G = {}, RC_W = {}, RC_VS = {}, RC_IN = {}, RC_RTOK = false, RC_SOCK = 0;
var RC_S = { hits: 0, rtHits: 0, stampHits: 0, shared: 0, net: 0, partial: 0, stampAsks: 0, stampKeys: 0, inval: 0, trigger: 'unknown', kbSaved: 0, why: {} };
var RC_RTTL = 20000, RC_MAXTXT = 8e6;
var RC_SKIPK = /(__manifest)$|^(gc_dailybackup_|users$|users__|gc_epoch$|__healthcheck__|gc_kv_probe)/;
var RC_ON = (function(){ try { return localStorage.getItem('gc_rc_off') !== '1'; } catch (e) { return true; } })();
var RC_TRIG = (function(){ try { var j = JSON.parse(localStorage.getItem('gc_kv_touch_ok') || 'null'); return !!(j && j.ok && Date.now() - j.at < 864e5); } catch (e) { return false; } })();
if (RC_TRIG) RC_S.trigger = 'confirmed (remembered)';
function rcReq(u, input, init){
  if (methodOf(input, init) !== 'GET') return null;
  var x; try { x = new URL(u, location.href); } catch (e) { return null; }
  if (x.host !== SB_HOST || x.pathname !== '/rest/v1/gc_kv') return null;
  var no = function(w){ RC_S.why[w] = (RC_S.why[w] || 0) + 1; return null; };
  if (input && typeof input === 'object' && !(input instanceof URL)) return no('request');   /* a Request object: not ours */
  if (init && init.signal) return no('signal');
  var kq = null, sel = null, bad = false, not = [];
  /* key=not.in.(…) is added by the accounts layer (keys that never leave it): those keys are left to the cloud */
  x.searchParams.forEach(function(v, k){ var mn = k === 'key' && /^not\.in\.\((.*)\)$/.exec(v); if (mn) not = not.concat(mn[1].split(',').map(function(z){ return z.replace(/^"|"$/g, ''); })); else if (k === 'key' && kq === null) kq = v; else if (k === 'select' && sel === null) sel = v; else bad = k; });
  if (bad || !kq || !sel) return no('param:' + (bad || (!kq ? 'nokey' : 'nosel')));
  var f = sel.split(','), want = {};
  for (var i = 0; i < f.length; i++) { var s = f[i].trim(); if (!/^(key|value|updated_at)$/.test(s)) return no('col'); want[s] = 1; }
  var keys, one = /^eq\./.test(kq);
  if (one) keys = [kq.slice(3)];
  else {
    var m = /^in\.\((.*)\)$/.exec(kq); if (!m || !want.key) return null;
    keys = m[1].split(',').map(function(k){ return k.replace(/^"|"$/g, ''); });
    if (!keys.length || keys.length > 200) return no('many');
  }
  for (var j = 0; j < keys.length; j++) if (!keys[j] || not.indexOf(keys[j]) >= 0 || RC_SKIPK.test(keys[j]) || /[",()*\\]/.test(keys[j])) return no('skipkey');
  RC_S.why.ok = (RC_S.why.ok || 0) + 1;
  return { x: x, keys: keys, one: one, val: !!want.value, norm: (want.key ? 'key,' : '') + (want.value ? 'value,' : '') + 'updated_at' };
}
function rcWriteKeys(u, input, init){
  var m = methodOf(input, init); if (m === 'GET' || m === 'HEAD') return null;
  var x; try { x = new URL(u, location.href); } catch (e) { return null; }
  if (x.host !== SB_HOST || x.pathname !== '/rest/v1/gc_kv') return null;
  var kq = x.searchParams.get('key') || '';
  if (/^eq\./.test(kq)) return [kq.slice(3)];
  var mi = /^in\.\((.*)\)$/.exec(kq); if (mi) return mi[1].split(',').map(function(k){ return k.replace(/^"|"$/g, ''); });
  var b = init && typeof init.body === 'string' ? init.body : '';
  var one = /^\s*\{\s*"key"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(b);
  if (one) { try { return [JSON.parse('"' + one[1] + '"')]; } catch (e) {} }
  return ['*'];
}
function rcInval(keys){
  var t = now();
  keys.forEach(function(k){
    if (k === '*') { Object.keys(RC_E).forEach(function(z){ RC_G[z] = (RC_G[z] || 0) + 1; RC_W[z] = t; }); RC_E = {}; RC_G['*'] = (RC_G['*'] || 0) + 1; RC_W['*'] = t; return; }
    RC_G[k] = (RC_G[k] || 0) + 1; RC_W[k] = t; delete RC_E[k];
  });
  RC_S.inval++;
}
function rcGen(k){ return (RC_G[k] || 0) + ':' + (RC_G['*'] || 0); }
/* tq: when this read was asked. A copy from the cloud counts only if the cloud confirmed its timestamp AFTER that
   (so a read is never older than the read it replaces); a live-feed copy while the feed stays connected. */
function rcValid(k, e, t, tq){
  if (!e) return false;
  if (e.src === 'rt') return RC_RTOK && t - e.t < RC_RTTL;
  var v = RC_VS[k];
  return !!(RC_TRIG && e.at && v && v.at === e.at && v.t >= tq);
}
/* a row's text ({…}, no brackets), '' when the cloud has no such row, null when not known in this shape */
function rcRow(k, e, norm){
  if (!e) return null;
  if (e.txt && Object.prototype.hasOwnProperty.call(e.txt, norm)) return e.txt[norm];
  if (e.src !== 'rt' || !e.at) return null;
  var parts = [];
  if (norm.indexOf('key,') === 0) parts.push('"key":' + JSON.stringify(k));
  if (norm.indexOf('value') >= 0) {
    if (e.vs == null) { try { e.vs = JSON.stringify(e.val === undefined ? null : e.val); } catch (er) { return null; } }
    parts.push('"value":' + e.vs);
  }
  parts.push('"updated_at":' + JSON.stringify(e.at));
  return '{' + parts.join(',') + '}';
}
function rcResp(body){ return new Response(body, { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
function rcUrl(q, keys){
  return 'https://' + SB_HOST + '/rest/v1/gc_kv?key=' + (q.one && keys.length === 1 ? 'eq.' + encodeURIComponent(keys[0]) : 'in.(' + keys.map(function(k){ return encodeURIComponent('"' + k + '"'); }).join(',') + ')') + '&select=' + q.norm;
}
/* the cloud's answer for these keys (one request, shared with the same request already on its way) */
function rcNet(q, keys, input, init){
  var id = q.norm + '|' + (q.one ? '=' : '') + keys.slice().sort().join(',');
  var inf = RC_IN[id];
  if (inf) { RC_S.shared++; return inf; }
  var t0 = now(), gens = {}; keys.forEach(function(k){ gens[k] = rcGen(k); });
  var url = rcUrl(q, keys);
  RC_S.net++;
  var p = nativeFetch(url, withAuth(url, init, true)).then(function(res){
    if (!res || !res.ok) return { res: res };
    return res.text().then(function(txt){
      var tt = txt.trim();
      if (tt.charAt(0) !== '[' || tt.charAt(tt.length - 1) !== ']') return { res: new Response(txt, { status: res.status, statusText: res.statusText, headers: res.headers }) };
      var inner = tt.slice(1, -1).trim();
      try {
        if (q.one && keys.length === 1 && q.val && tt.length < RC_MAXTXT && rcGen(keys[0]) === gens[keys[0]]) {
          var k = keys[0], at = null;
          if (inner) { var i2 = inner.lastIndexOf('"updated_at":"'); if (i2 > 0) at = inner.slice(i2 + 14, inner.indexOf('"', i2 + 14)); }
          var e = RC_E[k];
          if (!e || e.src !== 'net' || e.at !== at) e = RC_E[k] = { src: 'net', t: t0, at: at, txt: {} };
          e.t = t0; e.txt[q.norm] = inner;
          if (at) RC_VS[k] = { at: at, t: t0 };
        } else if (!q.val && tt.length < 400000) {
          var rows = JSON.parse(tt), seen = {};
          if (Array.isArray(rows)) {
            rows.forEach(function(r){ var rk = r && typeof r.key === 'string' ? r.key : (q.one ? keys[0] : null); if (rk && r.updated_at) { seen[rk] = 1; if (rcGen(rk) === gens[rk]) RC_VS[rk] = { at: String(r.updated_at), t: t0 }; } });
            keys.forEach(function(k){ if (!seen[k] && rcGen(k) === gens[k]) RC_VS[k] = { at: null, t: t0 }; });
          }
        }
      } catch (e2) {}
      return { inner: inner };
    });
  });
  RC_IN[id] = p;
  var clr = function(){ if (RC_IN[id] === p) delete RC_IN[id]; };
  p.then(clr, clr);
  return p;
}
/* the batched "which of these changed?" question (C: only with the trigger) */
var RC_SQ = null;
function rcStamps(keys){
  if (!RC_SQ) {
    RC_SQ = { keys: {}, p: null };
    var sq = RC_SQ;
    sq.p = new Promise(function(res){
      nST(function(){
        RC_SQ = null;
        var t = now(), ks = Object.keys(sq.keys);
        /* (one question for every read asked in the same moment — a save's two or three re-reads, the minute readers that fire together) */
        var gens = {}; ks.forEach(function(k){ gens[k] = rcGen(k); });
        var url = 'https://' + SB_HOST + '/rest/v1/gc_kv?key=in.(' + ks.map(function(k){ return encodeURIComponent('"' + k + '"'); }).join(',') + ')&select=key,updated_at';
        RC_S.stampAsks++; RC_S.stampKeys += ks.length;
        nativeFetch(url, withAuth(url, { headers: {} }, true)).then(function(r){ return r && r.ok ? r.json() : null; }).then(function(rows){
          if (Array.isArray(rows)) {
            var seen = {};
            rows.forEach(function(r){ if (r && typeof r.key === 'string') { seen[r.key] = 1; if (rcGen(r.key) === gens[r.key]) RC_VS[r.key] = { at: r.updated_at ? String(r.updated_at) : null, t: t }; } });
            ks.forEach(function(k){ if (!seen[k] && rcGen(k) === gens[k]) RC_VS[k] = { at: null, t: t }; });
          }
        }, function(){}).then(res, res);
      }, 25);
    });
  }
  keys.forEach(function(k){ RC_SQ.keys[k] = 1; });
  return RC_SQ.p;
}
function rcGet(q, input, init){
  var t = now(), tq = t, miss = [];
  q.keys.forEach(function(k){ if (!(rcValid(k, RC_E[k], t, tq) && rcRow(k, RC_E[k], q.norm) !== null)) miss.push(k); });
  var answer = function(net, how){
    var parts = [], kb = 0;
    if (net && net.inner) parts.push(net.inner);
    var netKeys = net ? net.keys : {};
    q.keys.forEach(function(k){ if (netKeys[k]) return; var e = RC_E[k], r = rcRow(k, e, q.norm); if (e) e.u = now(); if (r) { parts.push(r); kb += r.length; } });
    if (how) { RC_S[how]++; RC_S.kbSaved += Math.round(kb / 1024); }
    return rcResp('[' + parts.join(',') + ']');
  };
  if (!miss.length) { var rtOnly = q.keys.every(function(k){ return RC_E[k] && RC_E[k].src === 'rt'; }); return Promise.resolve(answer(null, rtOnly ? 'rtHits' : 'hits')); }
  var stampable = RC_TRIG ? miss.filter(function(k){ var e = RC_E[k]; return e && e.src === 'net' && e.at && e.txt && Object.prototype.hasOwnProperty.call(e.txt, q.norm); }) : [];
  var pre = stampable.length ? rcStamps(stampable) : Promise.resolve();
  return pre.then(function(){
    var t2 = now(), miss2 = q.keys.filter(function(k){ return !(rcValid(k, RC_E[k], t2, tq) && rcRow(k, RC_E[k], q.norm) !== null); });
    if (!miss2.length) return answer(null, 'stampHits');
    return rcNet(q, miss2, input, init).then(function(r){
      if (r.res) return r.res;   /* refused / an error: as the cloud said it */
      var nk = {}; miss2.forEach(function(k){ nk[k] = 1; });
      return answer({ inner: r.inner, keys: nk }, miss2.length < q.keys.length ? 'partial' : null);
    });
  });
}
/* the live feed: what the cloud now holds */
function rcEvent(dd, len){
  var rec = dd.record || {}, old = dd.old_record || {}, k = rec.key || old.key; if (!k) return;
  k = String(k); RC_G[k] = (RC_G[k] || 0) + 1;
  var t = now();
  if (dd.type === 'DELETE' || !('value' in rec) || !rec.updated_at || (dd.errors && dd.errors.length) || len > RC_MAXTXT
      || !RC_RTOK || RC_SKIPK.test(k) || t - (RC_W[k] || 0) < 3000 || t - (RC_W['*'] || 0) < 3000) { delete RC_E[k]; delete RC_VS[k]; return; }
  RC_E[k] = { src: 'rt', t: t, at: String(rec.updated_at), val: rec.value, vs: null, txt: null };
}
function rcRtLost(){ RC_RTOK = false; Object.keys(RC_E).forEach(function(k){ if (RC_E[k].src === 'rt') delete RC_E[k]; }); }
/* does the server move updated_at on every change (docs/scale-20.sql gc_kv_touch)? A probe row is written with an
   old timestamp, then changed without one: if the timestamp moved, the trigger is there. */
var RC_PROBE_AT = 0;
function rcProbe(){
  if (!RC_ON) return;
  if (!S || mode !== 'online') { nST(rcProbe, 60e3); return; }
  RC_PROBE_AT = now();
  var K = 'gc_kv_probe_touch', H = { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
  var up = function(row){ return window.fetch(SB_URL + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H, body: JSON.stringify(row) }).then(function(r){ if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status)); }); };
  var OLD = '2001-01-01T00:00:00+00:00';
  up({ key: K, value: { n: Math.random() }, updated_at: OLD }).then(function(){
    return up({ key: K, value: { n: Math.random(), by: 'SPEED4 probe' } });
  }).then(function(){
    var url = SB_URL + '/rest/v1/gc_kv?key=eq.' + K + '&select=updated_at';
    return nativeFetch(url, withAuth(url, { headers: {} }, true)).then(function(r){ return r && r.ok ? r.json() : null; });
  }).then(function(rows){
    if (!Array.isArray(rows) || !rows[0]) throw new Error('no probe row');
    var at = String(rows[0].updated_at || ''), ok = !!at && at.slice(0, 4) > '2001';
    RC_TRIG = ok; RC_S.trigger = ok ? 'confirmed' : 'not there (run docs/scale-20.sql)';
    try { localStorage.setItem('gc_kv_touch_ok', JSON.stringify({ ok: ok, at: now() })); } catch (e) {}
    nST(rcProbe, ok ? 6 * 3600e3 : 3600e3);
  }).catch(function(e){ RC_S.trigger = 'unknown (' + String(e && e.message || e).slice(0, 60) + ')'; nST(rcProbe, 10 * 60e3); });
}
nST(rcProbe, 25000);
nSI(function(){ var t = now(); Object.keys(RC_E).forEach(function(k){ var e = RC_E[k]; if (t - (e.u || e.t) > 600000) delete RC_E[k]; }); Object.keys(RC_VS).forEach(function(k){ if (t - RC_VS[k].t > 600000) delete RC_VS[k]; }); }, 120000);   /* a copy nobody asked for in 10 minutes is let go */
window._gcReadCache = function(){ return Object.assign({ on: RC_ON, live: RC_RTOK, kept: Object.keys(RC_E).length, triggerOn: RC_TRIG }, RC_S); };
function spSend(input, init){
  if (RC_ON) {
    var u0 = urlOf(input);
    try {
      var rq = rcReq(u0, input, init);
      if (rq) return rcGet(rq, input, init);
      var wk = rcWriteKeys(u0, input, init);
      if (wk) { rcInval(wk); var pw = spSend0(input, init); pw.then(function(){ rcInval(wk); }, function(){ rcInval(wk); }); return pw; }
    } catch (e) {}
  }
  return spSend0(input, init);
}
function spSend0(input, init){
  var u = urlOf(input), rows = spRows(u, init), t = now();"""
sub("function spSend(input, init){\n  var u = urlOf(input), rows = spRows(u, init), t = now();", RC, 'spSend')

sub("var rec = dd.record, old = dd.old_record, kk = (rec && rec.key) || (old && old.key); if (kk) SP_EV[kk] = (SP_EV[kk] || 0) + 1;",
    "var rec = dd.record, old = dd.old_record, kk = (rec && rec.key) || (old && old.key); if (kk) SP_EV[kk] = (SP_EV[kk] || 0) + 1;\n"
    "            try { rcEvent(dd, d.length); } catch (eRc) {}   /* patch SPEED4 */", 'rt hook')
sub("        if (String(u).indexOf(SB_HOST) >= 0) ws.addEventListener('message', function(ev){\n          try {\n            var d = ev.data; if (typeof d !== 'string' || d.indexOf('postgres_changes') < 0",
    "        if (String(u).indexOf(SB_HOST) >= 0) {   /* patch SPEED4: the read cache trusts the live feed only while it is connected */\n"
    "          ws.addEventListener('open', function(){ RC_SOCK++; RC_RTOK = true; });\n"
    "          ws.addEventListener('close', function(){ RC_SOCK = Math.max(0, RC_SOCK - 1); rcRtLost(); });\n"
    "          ws.addEventListener('error', rcRtLost);\n"
    "        }\n"
    "        if (String(u).indexOf(SB_HOST) >= 0) ws.addEventListener('message', function(ev){\n          try {\n            var d = ev.data; if (typeof d !== 'string' || d.indexOf('postgres_changes') < 0", 'ws open/close')


open(path, 'w', encoding='utf-8').write(src)
print('patched SPEED4')
