#!/usr/bin/env python3
"""Idempotent patch SCALE20: twenty people saving at the same time never undo each other.
 1. compare-and-set on gc_kv: every read-merge-write of a shared list (the live push, the save queue, the union
    pushes) is written only if the row is still the version that was read (PATCH ...&updated_at=eq.<read>);
    if another computer wrote in between, the cloud copy is read again, merged record by record, and written
    again (up to 5 tries, with jitter). A write with no read before it goes out exactly as before.
 2. the approval-queue timer (_gcSyncQueues) no longer overwrites the shared queues with this computer's copy
    every 90 s: the live union push carries them; the commission map is merged with the cloud copy.
Each find-string must occur exactly once."""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch SCALE20 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def sub(old, new, label):
    global src
    assert src.count(old) == 1, (label, 'count', src.count(old))
    src = src.replace(old, new)

GATE = r"""
/* patch SCALE20 */
/* ── compare-and-set for the shared lists (patch SCALE20) ─────────────────────
   Every part of the CRM that saves a shared list reads the cloud copy, merges, and
   writes it back. With many people saving at once, another computer can write in
   between the read and the write, and the write used to replace that save. Here,
   just above the fresh-start guard (so every other part's reads and writes pass
   through it), a write that follows a read of the same key goes up only if the row
   is still the version that was read; if not, the cloud copy is read again, merged
   record by record (newest edit wins, a record only the cloud has is kept, a
   tombstoned record stays out) and written again. _gcCasStatus() says what it did. */
(function(){
  if (window.__GC_SCALE20__) return; window.__GC_SCALE20__ = true;
  var below = window.fetch;
  var RD = {}, FRESH = 15000;
  var S = { reads: 0, gated: 0, ok: 0, inserts: 0, conflicts: 0, merged: 0, fallback: 0, blind: 0, blindBy: {}, passed: 0, last: '' };
  var SKIP = /(__chunk\d+|__manifest)$|^(gc_dailybackup_|users$|users__|gc_epoch$|__healthcheck__|gc_kv_probe)/;
  var MAPS = { gc_tombstones: 1, gc_commission_paid: 1, todoDone: 1 };
  var wait = function(ms){ return new Promise(function(r){ nST(r, ms); }); };
  function kvUrl(input){
    try {
      var u = typeof input === 'string' ? input : (input instanceof URL ? input.href : null);
      if (!u) return null;
      var x = new URL(u, location.href);
      return (x.host === SBH && x.pathname === '/rest/v1/gc_kv') ? x : null;
    } catch (e) { return null; }
  }
  function hdrs(h){
    var o = {};
    try { if (h && typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach(function(v, k){ o[k] = v; }); else if (Array.isArray(h)) h.forEach(function(p){ o[p[0]] = p[1]; }); else if (h) Object.keys(h).forEach(function(k){ o[k] = h[k]; }); } catch (e) {}
    return o;
  }
  function hget(o, n){ n = n.toLowerCase(); for (var k in o) if (k.toLowerCase() === n) return String(o[k]); return ''; }
  function hput(o, n, v){ var l = n.toLowerCase(); Object.keys(o).forEach(function(k){ if (k.toLowerCase() === l) delete o[k]; }); o[n] = v; return o; }
  function oneKey(x){ var k = x.searchParams.getAll('key'); return (k.length === 1 && /^eq\./.test(k[0])) ? k[0].slice(3).replace(/^"|"$/g, '') : null; }
  function note(key, rec){
    var l = RD[key] || (RD[key] = []), now = Date.now();
    l.push(rec); while (l.length && (l.length > 4 || now - l[0].t > FRESH)) l.shift();
    S.reads++;
  }
  /* ── record-by-record merge ── */
  function asList(x){ if (Array.isArray(x)) return { l: x, text: false }; if (typeof x === 'string' && /^\s*\[/.test(x)) { try { var a = JSON.parse(x); if (Array.isArray(a)) return { l: a, text: true }; } catch (e) {} } return null; }
  function asMap(x){ if (x && typeof x === 'object' && !Array.isArray(x)) return { m: x, text: false }; if (typeof x === 'string' && /^\s*\{/.test(x)) { try { var o = JSON.parse(x); if (o && typeof o === 'object' && !Array.isArray(o)) return { m: o, text: true }; } catch (e) {} } return null; }
  function isRec(r){ return r && typeof r === 'object' && !Array.isArray(r); }
  function rid(r){
    if (!isRec(r)) return null;
    if (r.id != null && r.id !== '') return 'i' + r.id;
    if (r._id != null && r._id !== '') return '_' + r._id;
    if (r.invId != null && r.invId !== '') return 'v' + r.invId;
    if (r.expId != null && r.expId !== '') return 'x' + r.expId;
    return null;
  }
  function plainId(r){ return isRec(r) ? String(r.id != null && r.id !== '' ? r.id : (r._id != null ? r._id : '')) : ''; }
  function ts(r){
    if (!isRec(r)) return '';
    var t = r.updatedAt || r.updated_at || r.modifiedAt || r.modified || r.lastModified || r.savedAt || '';
    if (typeof t === 'number' || /^\d{10,}$/.test(String(t))) { try { t = new Date(+t).toISOString(); } catch (e) { t = ''; } }
    return String(t || '');
  }
  function dead(key){
    var d = {};
    try { var m = JSON.parse(localStorage.getItem('gc_tombstones') || '{}') || {}; Object.keys(m).forEach(function(k){ if (k.indexOf(key + ':') === 0) d[k.slice(key.length + 1)] = 1; }); } catch (e) {}
    try { (JSON.parse(localStorage.getItem(key === 'invoices' ? 'gc_deleted_invs' : 'gc_deleted_' + key) || '[]') || []).forEach(function(id){ d[String(id)] = 1; }); } catch (e) {}
    return d;
  }
  function J(v){ try { return JSON.stringify(v); } catch (e) { return String(Math.random()); } }
  function pick(bs, o, c){
    var so = J(o), sc = J(c);
    if (so === sc) return c;
    if (bs !== undefined) { if (bs === so) return c; if (bs === sc) return o; }       /* only one side changed it */
    var to = ts(o), tc = ts(c);
    return (to && tc && tc > to) ? c : o;                                               /* both: the newer edit */
  }
  function merge(key, base, out, cloud){
    var lo = asList(out), lc = asList(cloud);
    if (lo && lc) {
      var lb = base !== undefined ? asList(base) : null, B = null, D = dead(key), O = {}, res = [], at = {}, seen = {};
      if (lb) { B = {}; lb.l.forEach(function(r){ var id = rid(r); if (id != null) B[id] = J(r); else B['=' + J(r)] = 1; }); }
      var prim = function(r){ var j = '=' + J(r); if (seen[j]) return; seen[j] = 1; res.push(r); };
      lo.l.forEach(function(r){ var id = rid(r); if (id != null && !(id in O)) O[id] = r; });
      var outPrim = {}; lo.l.forEach(function(r){ if (rid(r) == null) outPrim['=' + J(r)] = 1; });
      lc.l.forEach(function(r){
        var id = rid(r);
        if (id == null) { var j = '=' + J(r); if (!outPrim[j] && B && B[j]) return; prim(r); return; }   /* a plain item this writer removed stays removed */
        if (D[plainId(r)] || (id in at)) return;
        var o = O[id];
        if (o === undefined) {
          if (B && (id in B) && B[id] === J(r)) return;            /* this writer removed it, nobody changed it since */
          at[id] = res.length; res.push(r); return;                /* added on another computer */
        }
        at[id] = res.length; res.push(pick(B ? B[id] : undefined, o, r));
      });
      lo.l.forEach(function(r){
        var id = rid(r);
        if (id == null) { prim(r); return; }
        if (D[plainId(r)] || (id in at)) return;
        at[id] = res.length; res.push(r);
      });
      S.merged++;
      return lo.text ? JSON.stringify(res) : res;
    }
    var mo = asMap(out), mc = asMap(cloud);
    if (mo && mc) {
      var all = function(m){ var ks = Object.keys(m); return ks.length >= 3 && ks.every(function(k){ return isRec(m[k]); }); };
      if (!(MAPS[key] || /^gc_deleted_|tombstone/i.test(key) || (all(mo.m) && all(mc.m)))) return undefined;
      var mb = base !== undefined ? asMap(base) : null, r2 = Object.assign({}, mc.m);
      Object.keys(mo.m).forEach(function(k){ r2[k] = (k in mc.m) ? pick(mb && (k in mb.m) ? J(mb.m[k]) : undefined, mo.m[k], mc.m[k]) : mo.m[k]; });
      if (mb) Object.keys(mc.m).forEach(function(k){ if (!(k in mo.m) && (k in mb.m) && J(mb.m[k]) === J(mc.m[k])) delete r2[k]; });
      S.merged++;
      return mo.text ? JSON.stringify(r2) : r2;
    }
    return undefined;                                               /* a setting: the write goes up as it was asked */
  }
  window._gcCasMerge = merge;
  /* ── the write ── */
  async function cas(self, x, init, row, at, has, base){
    var H = hdrs(init.headers), root = x.origin, key = row.key, out = row.value;
    var G = hput(hput(Object.assign({}, H), 'Prefer', ''), 'Content-Type', 'application/json'); delete G.Prefer;
    for (var i = 0; i < 5; i++) {
      var body = Object.assign({}, row, { value: out, updated_at: row.updated_at || new Date().toISOString() }), r;
      if (has) {
        /* the key stays in the body (the same value): an older proxy or test double that reads it still sees the row */
        r = await below.call(self, root + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&updated_at=eq.' + encodeURIComponent(at) + '&select=updated_at',
          { method: 'PATCH', headers: hput(Object.assign({}, G), 'Prefer', 'return=representation'), body: JSON.stringify(body) });
        if (!r || r.status !== 200) return r;                      /* refused / held / an error: as the plain write would have been */
        var got = null; try { got = await r.clone().json(); } catch (e) {}
        if (Array.isArray(got) && got.length) { S.ok++; return new Response(null, { status: 201, statusText: 'Created' }); }
      } else {
        r = await below.call(self, root + '/rest/v1/gc_kv', { method: 'POST', headers: hput(Object.assign({}, G), 'Prefer', 'return=minimal'), body: JSON.stringify(body) });
        if (r && r.ok) { S.ok++; S.inserts++; return r; }
        if (!r || r.status !== 409) return r;
      }
      S.conflicts++; S.last = key + ' @ ' + new Date().toISOString();
      try { console.log('[GC] ' + key + ': another computer saved first — merging and saving again.'); } catch (e) {}
      await wait(40 + Math.floor(Math.random() * 160 * (i + 1)));
      var g = await below.call(self, root + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value,updated_at', { headers: G, cache: 'no-store' });
      if (!g || !g.ok) return g || r;                              /* the cloud cannot be read now: nothing is sent blind (the caller tries again) */
      var rows = null; try { rows = await g.clone().json(); } catch (e) {}
      if (!Array.isArray(rows)) return new Response('{"message":"unreadable"}', { status: 503 });
      if (!rows.length) { if (has) break; continue; }
      if (typeof base === 'function') base = base();
      var m = merge(key, base, out, rows[0].value);
      if (m === undefined) break;
      out = m; base = rows[0].value; at = rows[0].updated_at; has = true;
      if (!at) break;
    }
    S.fallback++;                                                   /* still busy after 5 tries: the merged copy goes up the old way */
    var b2 = Object.assign({}, row, { value: out });
    return below.call(self, x.href, Object.assign({}, init, { body: JSON.stringify(b2) }));
  }
  var gate = function(input, init){
    var x = kvUrl(input);
    if (!x) return below.apply(this, arguments);
    try {
      var m = String((init && init.method) || 'GET').toUpperCase(), self = this, key = oneKey(x);
      if (m === 'GET' && key && !SKIP.test(key)) {
        var sel = x.searchParams.get('select');
        if (sel && !/(^|,)value(,|$)/.test(sel)) return below.apply(this, arguments);
        if (sel && !/(^|,)updated_at(,|$)/.test(sel)) { x.searchParams.set('select', sel + ',updated_at'); input = x.href; }
        var t0 = Date.now();
        return below.call(self, input, init).then(function(r){
          if (!r || !r.ok) return r;
          return r.clone().text().then(function(txt){
            /* no second parse of a big list: the row's stamp is the last "updated_at" in the answer (the value, if
               ever needed for a merge, is read from the kept text then) */
            try {
              var tt = txt.trim();
              if (tt === '[]') note(key, { t: t0, at: null, has: false });
              else if (tt.charAt(0) === '[') { var i2 = tt.lastIndexOf('"updated_at":"'); if (i2 > 0) note(key, { t: t0, at: tt.slice(i2 + 14, tt.indexOf('"', i2 + 14)), has: true, txt: tt }); }
            } catch (e) {}
            return r;
          }, function(){ return r; });
        });
      }
      if (m === 'POST' && init && typeof init.body === 'string') {
        var H = hdrs(init.headers), pref = hget(H, 'Prefer');
        if (/merge-duplicates/.test(pref) && !/return=representation/.test(pref)) {
          var b = JSON.parse(init.body), rows = Array.isArray(b) ? b : [b];
          if (rows.length === 1 && rows[0] && typeof rows[0].key === 'string' && 'value' in rows[0] && !SKIP.test(rows[0].key)) {
            /* the read this write was merged with is the last one of this key (the union wrappers read just before they write) */
            var k = rows[0].key, l = RD[k] || [], p = l[l.length - 1];
            delete RD[k];
            if (!p || Date.now() - p.t > FRESH || (p.has && !p.at)) { S.blind++; S.blindBy[k] = (S.blindBy[k] || 0) + 1; if (window.__GC_CAS_DEBUG__) { var bs = S.blindAt || (S.blindAt = {}); if (!bs[k] || bs[k].length < 3) (bs[k] = bs[k] || []).push(String(new Error().stack || '').split('\n').slice(2, 14).map(function(l){ return l.trim().replace(/https?:\/\/[^ )]*index\.html/, ''); }).join(' < ')); } return below.apply(this, arguments); }
            S.gated++;
            var baseF = function(){ if (!p.has) return []; try { var pr = JSON.parse(p.txt); if (Array.isArray(pr) && pr.length === 1) return pr[0].value; } catch (e) {} return undefined; };
            return cas(self, x, init, rows[0], p.at, p.has, baseF);
          }
        }
      }
    } catch (e) {}
    S.passed++;
    return below.apply(this, arguments);
  };
  gate.__gcCas = true;
  try { Object.keys(below).forEach(function(p){ if (!(p in gate)) gate[p] = below[p]; }); } catch (e) {}
  window.fetch = gate;
  window._gcCasStatus = function(){ return Object.assign({}, S); };
})();
"""

sub("guard.__gcEpoch = true;\nwindow.fetch = guard;\n", "guard.__gcEpoch = true;\nwindow.fetch = guard;\n" + GATE, 'gate')

# ---- 2. the 90-second approval-queue timer: merged, not a replace
sub("""      Object.keys(payload).forEach(function(k){
        if(k==='_syncedAt') return;
        fetch(url.replace(/\\/$/,'')+'/rest/v1/gc_kv', {
          method:'POST',
          headers:{ 'apikey':key, 'Authorization':'Bearer '+key, 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates' },
          body: JSON.stringify({ key:k, value:payload[k] })
        }).catch(function(){});
      });""",
"""      Object.keys(payload).forEach(function(k){
        if(k==='_syncedAt') return;
        /* patch SCALE20: the live push sends these lists as a union with the cloud copy (and only when they changed);
           this timer used to overwrite them with this computer's copy every 90 s, undoing another computer's approvals */
        if(k!=='gc_commission_paid' && typeof window._gcLivePush==='function'){ try{ window._gcLivePush(k); }catch(e){} return; }
        var _sig=''; try{ _sig=JSON.stringify(payload[k]); }catch(e){}
        window.__gcSQSig=window.__gcSQSig||{}; var _ls=window.__gcSQSig[k];
        if(_ls && _ls.s===_sig && Date.now()-_ls.at<600000) return;            /* unchanged here: nothing to send */
        var _b=url.replace(/\\/$/,''), _h={ 'apikey':key, 'Authorization':'Bearer '+key };
        fetch(_b+'/rest/v1/gc_kv?key=eq.'+encodeURIComponent(k)+'&select=value', { headers:_h, cache:'no-store' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(rows){
            if(!Array.isArray(rows)) return;
            var cl=rows.length?rows[0].value:undefined, v=payload[k];
            try{ if(cl!==undefined && cl!==null && typeof window._gcMergeValue==='function') v=window._gcMergeValue(k, payload[k], cl); }catch(e){}
            if(cl!==undefined && JSON.stringify(cl)===JSON.stringify(v)){ window.__gcSQSig[k]={s:_sig,at:Date.now()}; return; }
            return fetch(_b+'/rest/v1/gc_kv', { method:'POST',
              headers:Object.assign({ 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates,return=minimal' }, _h),
              body: JSON.stringify({ key:k, value:v, updated_at:new Date().toISOString() }) })
              .then(function(r){ if(r && r.ok) window.__gcSQSig[k]={s:_sig,at:Date.now()}; });
          }).catch(function(){});
      });""", 'syncqueues')

# ---- 3. the supabase library's own calls to the dead app_data table (every save also went there: 18-36 a minute
#         per computer, each answered 520 + a CORS error in production) are answered here, never sent
sub("""    if (mine) {
      opts = Object.assign({}, opts || {});
      if (!opts.accessToken) opts.accessToken = function(){ return Promise.resolve((S && S.access_token) || key); };
    }""",
"""    if (mine) {
      opts = Object.assign({}, opts || {});
      if (!opts.accessToken) opts.accessToken = function(){ return Promise.resolve((S && S.access_token) || key); };
      /* patch SCALE20: the old app_data table is not used (everything lives in gc_kv); the library's calls to it stay here */
      var _gl = Object.assign({}, opts.global || {}), _f0 = _gl.fetch || window.fetch;
      _gl.fetch = function(input, init){
        try { var _u = typeof input === 'string' ? input : (input && input.url) || ''; if (_u.indexOf('/rest/v1/app_data') >= 0) return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })); } catch (e) {}
        return _f0.apply(window, arguments);
      };
      opts.global = _gl;
    }""", 'appdata')

# ---- 4. INBOXLEAD: the 25 s inbox re-read is spread out (jitter) and eases to 45 s when nobody has touched the computer for
#         5 minutes — new leads still show within a minute for admins / office
if "      if (Date.now() - lastPull > (fast ? 25000 : 300000)) pull(true);" in src:
    sub("      if (Date.now() - lastPull > (fast ? 25000 : 300000)) pull(true);",
        "      var _idle = Date.now() - (window.__GC_LAST_INPUT_AT__ || Date.now()) > 300000;   /* patch SCALE20: spread out, slower when nobody is here */\n"
        "      if (Date.now() - lastPull > (fast ? (_idle ? 45000 : 25000) + Math.floor(Math.random() * 5000) : 300000)) pull(true);", 'inboxlead')

open(path, 'w', encoding='utf-8').write(src)
print('patched')
