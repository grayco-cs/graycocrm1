/* __GC_PATCH_AUTOPANEL_CORE__ — ⚡ AUTOMATIONS: the ONE check every page automation asks first (patch AUTOPANEL)
   Owner (11/02): "make sure nothing is automatic in my CRM until I tell it to be auto".
   The list and the rule are window._gcAutoReg (netlify/functions/_lib/automations.js, word for word above). The switches are
   gc_kv "gc_automations", read through /.netlify/functions/automations (any staff member reads; only admins change them).
     window._gcAutoOn(key)            → true / false. Until the switches are read: an item that is OFF by default stays OFF,
                                        an item ON by default stays ON (the last switches this computer saw decide it).
     window._gcAutoGate(key, count)   → true = go ahead; false = it is OFF: do nothing. When OFF it records "held: would have
                                        done N" (count = a number, { n, sample } or a function giving one) — at most once per
                                        10 minutes per automation from this computer, sent in one small batch.
     window._gcAutoSince(key)         → when the automation was last switched ON (ms; 0 = never). Time-based automations count
                                        their waiting time from then, so switching one ON never fires a burst of old items.
     window._gcAutomations = { load(), state(), set({ key: bool }), before(), defaults() } */
(function(){
'use strict';
var W = window;
if (W.__GC_PATCH_AUTOPANEL_CORE__) return; W.__GC_PATCH_AUTOPANEL_CORE__ = true;
var R = W._gcAutoReg; if (!R) return;
var FN = '/.netlify/functions/automations', CK = 'gc_automations_cache', HELD_MS = 10 * 60e3, RAN_MS = 30 * 60e3;
var S = { row: null, loaded: false, held: {}, log: [], admin: false, at: 0, err: '' };
var cache = null; try { cache = JSON.parse(localStorage.getItem(CK) || 'null'); } catch (e) { cache = null; }
function T(f, ms){ var st = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout; return st.call(W, f, ms || 0); }
function I(f, ms){ var si = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval; return si.call(W, f, ms); }
function signedIn(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return false; } }
function F(){ return typeof W.__GC_AUTH_FETCH__ === 'function' ? W.__GC_AUTH_FETCH__ : W.fetch; }
function on(key){
  var a = R.BY[key]; if (!a) return false; if (a.fixed) return true;
  if (S.loaded) return R.valueOf(S.row, key);
  if (!a.defaultOn) return false;                         /* not read yet: OFF-by-default stays OFF */
  return cache ? R.valueOf(cache, key) : true;
}
function since(key){
  var t = 0; (S.log || []).forEach(function(x){ if (x && x.key === key && x.on === true) { var m = Date.parse(x.at); if (m > t) t = m; } }); return t;
}
/* held / ran records: batched, throttled */
var lastHeld = {}, lastRan = {}, pendHeld = {}, pendRan = {}, flushT = 0;
function flushSoon(){ if (flushT) return; flushT = T(flush, 4000); }
function flush(){
  flushT = 0;
  if (!signedIn()) { if (Object.keys(pendHeld).length || Object.keys(pendRan).length) flushT = T(flush, 30000); return; }
  var items = Object.keys(pendHeld).map(function(k){ return pendHeld[k]; }), keys = Object.keys(pendRan);
  pendHeld = {}; pendRan = {};
  var post = function(body){ try { return Promise.resolve(F().call(W, FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).catch(function(){}); } catch (e) { return Promise.resolve(); } };
  if (items.length) post({ op: 'held', items: items });
  if (keys.length) post({ op: 'ran', keys: keys });
}
function held(key, n, sample){
  if (!R.BY[key]) return;
  var now = Date.now(), loc = S.held[key] = S.held[key] || { n: 0, since: new Date(now).toISOString() };
  loc.n++; loc.last = new Date(now).toISOString(); loc.would = n == null ? null : n; loc.sample = (sample || []).slice(0, 3);
  if (lastHeld[key] && now - lastHeld[key] < HELD_MS) return;
  lastHeld[key] = now;
  pendHeld[key] = { key: key, n: n == null ? null : +n || 0, sample: (Array.isArray(sample) ? sample : sample == null ? [] : [sample]).slice(0, 3).map(function(x){ return String(x == null ? '' : x).slice(0, 120); }) };
  try { console.log('[GC] ⚡ held ' + key + ': would have done ' + (n == null ? '?' : n)); } catch (e) {}
  flushSoon();
}
function ran(key){ var now = Date.now(); if (lastRan[key] && now - lastRan[key] < RAN_MS) return; lastRan[key] = now; pendRan[key] = 1; flushSoon(); }
function gate(key, count){
  if (on(key)) { ran(key); return true; }
  var n = null, sample = [];
  try {
    var c = typeof count === 'function' ? count() : count;
    if (c && typeof c === 'object' && !Array.isArray(c)) { n = c.n; sample = c.sample || []; } else if (c != null) n = +c;
  } catch (e) {}
  if (arguments.length > 2 && Array.isArray(arguments[2])) sample = arguments[2];
  held(key, n, sample);
  return false;
}
/* the switches */
function apply(o){
  if (!o || typeof o !== 'object' || !o.settings) return false;
  S.row = o.row || {}; S.log = o.log || []; S.admin = !!o.admin; S.serverHeld = o.held || {}; S.loaded = true; S.at = Date.now(); S.err = '';
  try { localStorage.setItem(CK, JSON.stringify(S.row)); } catch (e) {}
  try { W.dispatchEvent(new CustomEvent('gc-automations', { detail: { at: S.at } })); } catch (e) {}
  return true;
}
function call(method, body){
  var p; try { p = F().call(W, FN, method === 'GET' ? { method: 'GET' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); } catch (e) { p = Promise.reject(e); }
  return Promise.resolve(p).then(function(r){ return r.text().then(function(t){ var o = {}; try { o = JSON.parse(t); } catch (e) { o = { error: t.slice(0, 200) }; } o.__status = r.status; return o; }); },
    function(e){ return { error: 'Cannot reach the server right now.', __status: 0 }; });
}
var loading = null;
function load(){
  if (!signedIn()) return Promise.resolve(state());
  if (loading) return loading;
  loading = call('GET').then(function(o){ loading = null; if (o && o.__status === 200) apply(o); else S.err = (o && o.error) || ('answer ' + (o && o.__status)); return state(); }, function(){ loading = null; return state(); });
  return loading;
}
function state(){ return { loaded: S.loaded, admin: S.admin, at: S.at, err: S.err, settings: R.all(S.loaded ? S.row : (cache || {})), row: S.row, log: S.log, held: S.serverHeld || {}, localHeld: S.held }; }
function set(changes){ return call('POST', { set: changes }).then(function(o){ if (o && o.__status === 200) apply(o); return o; }); }
function op(name){ return call('POST', { op: name }).then(function(o){ if (o && o.__status === 200) apply(o); return o; }); }

W._gcAutoOn = on;
W._gcAutoGate = gate;
W._gcAutoHeld = held;
W._gcAutoSince = since;
W._gcAutomations = { load: load, state: state, set: set, before: function(){ return op('before'); }, defaults: function(){ return op('defaults'); }, flush: flush, reg: R };
T(load, 1500);
I(function(){ if (!document.hidden) load(); }, 60000);
try { document.addEventListener('visibilitychange', function(){ if (!document.hidden) load(); }); } catch (e) {}
try { console.log('[GC] ⚡ Automations: one switch per automation (patch AUTOPANEL) — _gcAutomations.state()'); } catch (e) {}
})();
