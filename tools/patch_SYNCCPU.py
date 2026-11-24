#!/usr/bin/env python3
"""Idempotent patch SYNCCPU: phones and computers are not kept busy by background sync that changes nothing
(owner 11/24: "make sure no one's phone or computer is bogged down").

Measured with the real data snapshot, the owner (admin) signed in on an emulated iPhone (CPU x4), Field Home, idle
(tools/tests/test_SYNCCPU.mjs; CPU profiles + per-call counters):
1. TOMBLOOP: the delete list's cloud upload (pushTombs) ran every ~2 s for ever on a phone. Its own upload passed the
   delete-list hook (fixRow), which always asked for another upload; on a phone the upload is held (FIELDGUARD), so the
   cloud never became equal and the next round went again: each round read the 160K delete list from the cloud three
   times, compared and hashed it. The hook now asks for another round only when the upload brought marks this computer
   did not have (that is the only case where a round has anything new to send).
2. IDLEPACE (in gc-patch-quiet's timer tagging): the measured screen painters' fast re-check timers (the Home's top, the approval
   badge / chip / panel, To-Do decorations, nav badges: 0.25-2 s each, 26 scripts that only redraw from saved data) run at most every
   max(3 s, 2 x their period) while nobody has touched the screen for 3 s; a tap / click / key / wheel / finger puts them back on
   their own period at once. Every other timer (saves, uploads, pulls, sweeps, clocks): as before.
3. REGRECON: the 2-minute accounting reconcile offered ~760 rows to the register each pass (each through the de-dup chain: ~100
   disk reads of the register / expenses, 5-10 s of a phone's main thread) with nothing changed; the rows are gathered and offered
   (all, same order) only when they differ from the last offer or the register changed since the last pass began (30 min at most).
4. KVVER: a first script counts the writes of each IndexedDB "kv" key (used by 6. below).
5. LSCMP: the live feed's 2-second look at the shared office lists in localStorage compares the text before hashing it.
6. KVSKIP: the screens' copies of saved lists (leads 1.5 s / 5 s, customers, the jobs drawn from disk 5 s, the old list cache 10 s,
   estimate -> contract 15 s) are not read from disk again while the list was not written since (1 / 5 minutes at most).
7. SPTEXT: the upload de-dup (spSend) recognises the same upload text by a string compare instead of hashing MBs again.
8. APPRMEMO: the approval set is worked out once per 2.5 s while nobody touches the screen (0.8 s as before otherwise).
9. TD2SEEN: the To-Do's "cleared on its own" memory (gc_td2_seen) is written at most every 30 s (and when the page is hidden).
10. DECSAVE: the decisions ledger (gc_decisions_v1) is written once per burst of decisions, not once per decision.
Nothing changes in what is uploaded or when a person's save goes: every skip is "the same input as last time".
Usage: python3 tools/patch_SYNCCPU.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
t = open(p, encoding='utf-8').read()

SKIP = [x for x in os.environ.get('SYNCCPU_SKIP', '').split(',') if x]   # for bisecting: parts left out
def sub(name, old, new):
    global t
    if any(name.startswith(x) for x in SKIP):
        return
    if new in t:
        return
    assert t.count(old) == 1, ('SYNCCPU anchor', name, t.count(old))
    t = t.replace(old, new)
    print('SYNCCPU:', name)

# 1. TOMBLOOP
sub('TOMBLOOP',
"""  if(k === TK){
    absorbMap(v);
    var c; try{ c = await cloudRow(TK); absorbMap(c); }catch(e){}
    var out = Object.assign({}, (c && typeof c==='object' && !Array.isArray(c)) ? c : {}, (v && typeof v==='object' && !Array.isArray(v)) ? v : {}, M);
    ST.call(window, changed, 0);
""",
"""  if(k === TK){
    var _sc = absorbMap(v);
    var c; try{ c = await cloudRow(TK); _sc += absorbMap(c); }catch(e){}
    var out = Object.assign({}, (c && typeof c==='object' && !Array.isArray(c)) ? c : {}, (v && typeof v==='object' && !Array.isArray(v)) ? v : {}, M);
    if(_sc) ST.call(window, changed, 0);   /* SYNCCPU: only when this upload or the cloud brought marks this computer did not have (its own upload asked for the next one: every ~2 s for ever while the cloud did not take it) */
""")


# 2. IDLEPACE — the screens' fast re-check loops run every 3-4 s (not every 0.7-2 s) while nobody touches the screen
sub('IDLEPACE list',
"""var held = new Map();
if (off) return;""",
"""var held = new Map();
if (off) return;
/* SYNCCPU (IDLEPACE): the screens' fast re-check timers (badges, the Home's top, the To-Do decorations, the approval chips —
   each re-reads saved data and redraws only what changed; measured as most of an idle phone's main thread) run at most
   every max(3 s, 2 x their period) while nobody has touched the screen for 3 s. A tap, a key, a wheel or a finger on the
   screen puts them back on their own period at once. Saves, uploads, pulls and every other timer: as before. */
var PACE = {}; ["roleapps", "ap2", "adm", "plan", "est3", "jobmention", "datafull", "addr2", "apx", "ap4", "ccs", "supplierstmt", "coleak2",
  "officefix-mm", "leads", "x10", "auto6", "tabvis", "newproj", "jobfill-punch", "apprnosend", "invlink", "leadwatch", "acctfix2", "phoneui", "timeoff"].forEach(function(k){ PACE['gc-patch-' + k] = 1; });
PACE['gc-fix-apprset'] = 1;
var lastIn = Date.now(), IDLE_MS = 3000;
try { ['pointerdown', 'touchstart', 'keydown', 'wheel', 'input'].forEach(function(t){ W.addEventListener(t, function(e){ if (!e || e.isTrusted !== false) lastIn = Date.now(); }, { capture: true, passive: true }); }); } catch (e) {}
try { W.addEventListener('click', function(){ lastIn = Date.now(); }, { capture: true, passive: true }); } catch (e) {}   /* a click made by code for a person (a button's .click()) counts too */
S.paced = {};
W.__gcQuiet.paceList = Object.keys(PACE);
W.__gcQuiet.idleMs = function(){ return Date.now() - lastIn; };   /* how long nobody has touched the screen */""")
sub('IDLEPACE timer',
"""    var a = Array.prototype.slice.call(arguments), f = fn, gate = repeat && LIST[o] && +ms <= 5000, box = {};
    a[0] = function(){
      if (gate && home()) { held.set(box, { o: o, f: f, self: this, args: arguments }); S.skips[o] = (S.skips[o] || 0) + 1; return; }""",
"""    var a = Array.prototype.slice.call(arguments), f = fn, gate = repeat && LIST[o] && +ms <= 5000, box = {};
    var pace = repeat && +ms > 0 && +ms <= 2000 && !!PACE[o], slow = Math.max(3000, 2 * ms), ranAt = 0;   /* SYNCCPU (IDLEPACE) */
    a[0] = function(){
      if (gate && home()) { held.set(box, { o: o, f: f, self: this, args: arguments }); S.skips[o] = (S.skips[o] || 0) + 1; return; }
      if (pace) { var pn = Date.now(); if (pn - lastIn > IDLE_MS && pn - ranAt < slow - 50) { S.paced[o] = (S.paced[o] || 0) + 1; return; } ranAt = pn; }""")


# 3. REGRECON — the 2-minute accounting reconcile offers its ~760 rows to the register only when something it offers or the register changed
A3 = """  window._gcReconcileAccounting = async function(){
    if(window.__GC_IS_TYPING__ || document.hidden) return;
    if(!window._gcAddToRegister) return;
    try{
"""
E3 = """      console.log('[GC] Accounting reconciled.');
    }catch(e){ console.warn('[GC] reconcile error', e); }
  };
"""
if 'SYNCCPU (REGRECON)' not in t:
    assert t.count(A3) == 1, ('SYNCCPU anchor', 'REGRECON start', t.count(A3))
    i = t.index(A3); j = t.index(E3, i); assert j - i < 12000
    body = t[i + len(A3):j]
    assert body.count('window._gcAddToRegister(') == 6, body.count('window._gcAddToRegister(')
    body = body.replace('window._gcAddToRegister(', '_offer(')
    head = """  /* SYNCCPU (REGRECON): every 2 minutes this offered every invoice, sub bill, change order and expense to the register again
     (~760 rows on the real data, each through the de-dup chain: ~100 reads of the register and of the expenses from disk, 5-10 s of
     a phone's main thread) although nothing had changed. The rows are now gathered first and offered — all of them, in the same
     order — only when they differ from the last offer or the register changed since the last pass began (or 30 minutes went by). */
  var _recLast = { sig: '', reg: '', at: 0 };
  function _recHash(str){ var h1 = 0x811c9dc5, h2 = 5381; for(var i = 0; i < str.length; i++){ var c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (Math.imul(h2, 33) + c) | 0; } return str.length + ':' + (h1 >>> 0).toString(36) + ':' + (h2 >>> 0).toString(36); }
  function _recRegSig(rows){ if(!Array.isArray(rows)) return 'none'; var a = new Array(rows.length); for(var i = 0; i < rows.length; i++){ var r = rows[i]; a[i] = r && typeof r === 'object' ? [r._id, r.id, r.srcInvId, r.status, r.amt, r.paidDate, r.date, r.pid, r.type, r._dupOf, r.deleted, r.archived, r.updatedAt].join('|') : String(r); } return _recHash(a.join('|~|')); }
"""
    tail = """      /* SYNCCPU (REGRECON) */
      var _sig = ''; try{ _sig = _recHash(JSON.stringify(_offers)); }catch(e){}
      var _reg = ''; try{ _reg = _recRegSig(await window.idbGet('gcAcctRegister')); }catch(e){ _reg = ''; }
      if(_sig && _reg && _sig === _recLast.sig && _reg === _recLast.reg && Date.now() - _recLast.at < 30 * 60e3){ window._gcRecSkipped = (window._gcRecSkipped || 0) + 1; return; }
      _offers.forEach(function(o){ window._gcAddToRegister(o); });
      _recLast = { sig: _sig, reg: _reg, at: Date.now() };   /* the next pass runs again if these offers changed the register, and then rests */
"""
    new = head + A3 + "      var _offers = [], _offer = function(o){ _offers.push(o); };   /* SYNCCPU (REGRECON) */\n" + body + tail + E3
    t = t[:i] + new + t[j + len(E3):]
    print('SYNCCPU: REGRECON')


# 4. KVVER — a write counter per IndexedDB "kv" key (the first script of the page: every write of every later script passes it)
EARLY = """<script id="gc-patch-synccpu-early">
/* __GC_PATCH_SYNCCPU_EARLY__ (tools/patch_SYNCCPU.py): a count of the writes of each IndexedDB "kv" key on this page, so a background
   job can tell "this list was not written since I last looked" without reading and serialising it again. The first script on the
   page: every later wrapper of IDBObjectStore put / add / delete / clear ends here. Console: __gcKvVer('projects') */
(function(){
'use strict';
var W = window; if (W.__gcKvVer) return;
var V = {}, ALL = 0;
W.__gcKvVer = function(k){ return ALL + ':' + (V[k] || 0); };
try {
  var P = W.IDBObjectStore && W.IDBObjectStore.prototype; if (!P) return;
  var bump = function(st, k){ try { if (st && st.name === 'kv') { if (typeof k === 'string') V[k] = (V[k] || 0) + 1; else ALL++; } } catch (e) { ALL++; } };
  ['put', 'add'].forEach(function(m){ var o = P[m]; if (typeof o !== 'function') return; P[m] = function(v, k){ var r = o.apply(this, arguments); bump(this, arguments.length > 1 ? k : undefined); return r; }; });
  var od = P['delete']; if (typeof od === 'function') P['delete'] = function(k){ var r = od.apply(this, arguments); bump(this, k); return r; };
  var oc = P.clear; if (typeof oc === 'function') P.clear = function(){ var r = oc.apply(this, arguments); bump(this, undefined); return r; };
  /* a database deleted or opened at a new version: everything counts as written */
  var F = W.IDBFactory && W.IDBFactory.prototype, odb = F && F.deleteDatabase; if (typeof odb === 'function') F.deleteDatabase = function(){ ALL++; return odb.apply(this, arguments); };
} catch (e) {}
})();
</script>
"""
if '<script id="gc-patch-synccpu-early">' not in t and 'KVVER' not in SKIP:
    a = '<script id="gc-patch-lsguard">'
    assert t.count(a) == 1 and t.index(a) < 2000
    t = t.replace(a, EARLY + a)
    print('SYNCCPU: KVVER early script')



# 5. LSCMP — the live feed's 2-second look at the shared office lists in localStorage compares the text, not a hash of it
sub('LSCMP',
"""        var s = window.localStorage.getItem(ks[i]);
        if(s == null) continue;
        var g = s.length + ':' + sigOf(s);""",
"""        var s = window.localStorage.getItem(ks[i]);
        if(s == null) continue;
        if(lsRawPrev[ks[i]] === s) continue;   /* SYNCCPU (LSCMP): the same text as 2 s ago — not hashed again (gc_office_tasks alone is 630K characters) */
        lsRawPrev[ks[i]] = s;
        var g = s.length + ':' + sigOf(s);""")
sub('LSCMP var',
"""  var lsLast = {};
  RI.call(window, function(){""",
"""  var lsLast = {}, lsRawPrev = {};
  RI.call(window, function(){""")


# 6. KVSKIP — the screens' copies of saved lists (leads, customers, the jobs drawn from disk) are not read from disk again while the
#    list was not written since the last read (the count above); at least once a minute anyway
sub('KVSKIP hot3 leads',
"""function pull(){
  if (LBUSY || typeof W.idbGet !== 'function') return; LBUSY = true;
  try { Promise.resolve(W.idbGet('leads')).then(function(v){ LBUSY = false; if (Array.isArray(v)) LEADS = v; }, function(){ LBUSY = false; }); } catch (e) { LBUSY = false; }
}""",
"""var LVER = '', LVAT = 0;   /* SYNCCPU (KVSKIP): the saved list was not written since this copy was read — not read again (it was every 1.5 s) */
function pull(){
  if (LBUSY || typeof W.idbGet !== 'function') return;
  var lv = W.__gcKvVer ? W.__gcKvVer('leads') : ''; if (LEADS && lv && lv === LVER && Date.now() - LVAT < 60000) return;
  LBUSY = true;
  try { Promise.resolve(W.idbGet('leads')).then(function(v){ LBUSY = false; if (Array.isArray(v)) { LEADS = v; LVER = lv; LVAT = Date.now(); } }, function(){ LBUSY = false; }); } catch (e) { LBUSY = false; }
}""")
sub('KVSKIP pullLeads',
"""function pullLeads(force){
  if (LEADS_BUSY || (!force && Date.now() - LEADS_AT < 4000) || typeof W.idbGet !== 'function') return Promise.resolve(LEADS_NOW);
  LEADS_AT = Date.now(); LEADS_BUSY = true;
  return Promise.resolve(W.idbGet('leads')).then(function(v){ LEADS_BUSY = false; if (Array.isArray(v)) LEADS_NOW = v; return LEADS_NOW; }, function(){ LEADS_BUSY = false; return LEADS_NOW; });
}""",
"""var LEADS_VER = '', LEADS_VAT = 0;   /* SYNCCPU (KVSKIP) */
function pullLeads(force){
  if (LEADS_BUSY || (!force && Date.now() - LEADS_AT < 4000) || typeof W.idbGet !== 'function') return Promise.resolve(LEADS_NOW);
  var lv = W.__gcKvVer ? W.__gcKvVer('leads') : ''; if (!force && LEADS_NOW && lv && lv === LEADS_VER && Date.now() - LEADS_VAT < 60000) return Promise.resolve(LEADS_NOW);   /* not written since read */
  LEADS_AT = Date.now(); LEADS_BUSY = true;
  return Promise.resolve(W.idbGet('leads')).then(function(v){ LEADS_BUSY = false; if (Array.isArray(v)) { LEADS_NOW = v; LEADS_VER = lv; LEADS_VAT = Date.now(); } return LEADS_NOW; }, function(){ LEADS_BUSY = false; return LEADS_NOW; });
}""")
sub('KVSKIP loadCust',
"""function loadCust(){ try { if (typeof W.idbGet === 'function') Promise.resolve(W.idbGet('customers')).then(function(v){ CUST = arr(v); }, function(){}); } catch (e) {} }""",
"""var CVER = '', CVAT = 0;   /* SYNCCPU (KVSKIP) */
function loadCust(){ try { if (typeof W.idbGet !== 'function') return; var cv = W.__gcKvVer ? W.__gcKvVer('customers') : ''; if (CUST.length && cv && cv === CVER && Date.now() - CVAT < 60000) return; Promise.resolve(W.idbGet('customers')).then(function(v){ CUST = arr(v); CVER = cv; CVAT = Date.now(); }, function(){}); } catch (e) {} }""")
sub('KVSKIP peekLeads',
"""  try { if (typeof W.idbGet === 'function') Promise.resolve(W.idbGet('leads')).then(function(d){ d = arr(d && !Array.isArray(d) && Array.isArray(d.v) ? d.v : d); var have = {};""",
"""  var pv = W.__gcKvVer ? W.__gcKvVer('leads') : '', pm = LEADS;   /* SYNCCPU (KVSKIP): the saved list and the screen's list both as last time — the same DISK */
  if (pv && PEEK.v === pv && PEEK.m === pm && Date.now() - PEEK.at < 60000) return;
  try { if (typeof W.idbGet === 'function') Promise.resolve(W.idbGet('leads')).then(function(d){ PEEK = { v: pv, m: pm, at: Date.now() }; d = arr(d && !Array.isArray(d) && Array.isArray(d.v) ? d.v : d); var have = {};""")
sub('KVSKIP peekLeads var',
"""var DISK = [];
function allLeads(){""",
"""var DISK = [], PEEK = { v: '', m: null, at: 0 };
function allLeads(){""")
sub('KVSKIP PJX',
"""    var scr = window._crm && window._crm.projects; if(!Array.isArray(scr) || !scr.length) return;
    Promise.resolve(window.idbGet('projects')).then(function(d){
      if(!Array.isArray(d)) return;
      var on = {}; scr.forEach(function(r){ if(r && r.id != null) on[s(r.id)] = 1; });
      var dead = deadIds(), aside = asideIds(), cut = new Date(Date.now() - 3 * 3600e3).toISOString();
      var add = d.filter(function(r){ if(!r || r.id == null) return false; var id = s(r.id); return !on[id] && !TRIED[id] && !dead[id] && !aside[id] && stampOf(r) > cut && boardOK(r); });
      if(!add.length) return;""",
"""    var scr = window._crm && window._crm.projects; if(!Array.isArray(scr) || !scr.length) return;
    /* SYNCCPU (KVSKIP): the saved jobs and the screen's jobs both as at a look that found nothing to draw — nothing to draw now either
       (time, the delete marks and the tried list only take candidates away); the saved jobs were read every 5 s */
    var pv = window.__gcKvVer ? window.__gcKvVer('projects') : '';
    if(pv && NOADD.v === pv && NOADD.scr === scr && Date.now() - NOADD.at < 60000) return;
    Promise.resolve(window.idbGet('projects')).then(function(d){
      if(!Array.isArray(d)) return;
      var on = {}; scr.forEach(function(r){ if(r && r.id != null) on[s(r.id)] = 1; });
      var dead = deadIds(), aside = asideIds(), cut = new Date(Date.now() - 3 * 3600e3).toISOString();
      var add = d.filter(function(r){ if(!r || r.id == null) return false; var id = s(r.id); return !on[id] && !TRIED[id] && !dead[id] && !aside[id] && stampOf(r) > cut && boardOK(r); });
      if(!add.length){ NOADD = { v: pv, scr: scr, at: Date.now() }; return; }""")
sub('KVSKIP PJX var',
"""var TRIED = {};
/* only what the job board shows""",
"""var TRIED = {}, NOADD = { v: '', scr: null, at: 0 };   /* SYNCCPU (KVSKIP) */
/* only what the job board shows""")


sub('KVSKIP GC cache',
"""  function refreshCache(){
    // Pause during typing AND during recent clicks (within 2.5s of last interaction)
    if (window.__GC_IS_ACTIVE__ || window.__GC_IS_TYPING__) return;
    try {
      var req = indexedDB.open("grayco_crm");""",
"""  var _rcVer = {}, _rcAt = 0;   /* SYNCCPU (KVSKIP): a list not written since its last read gives the same copy — not read again */
  function refreshCache(){
    // Pause during typing AND during recent clicks (within 2.5s of last interaction)
    if (window.__GC_IS_ACTIVE__ || window.__GC_IS_TYPING__) return;
    var _rcK = ["projects","invs","cos","expenses","schedule","leads","vendors","customers","subs"], _rcNow = {};
    try { if (window.__gcKvVer && Date.now() - _rcAt < 300000) { var _rcAny = false; _rcK.forEach(function(k){ _rcNow[k] = window.__gcKvVer(k); if (_rcVer[k] !== _rcNow[k]) _rcAny = true; }); if (!_rcAny) return; } else _rcAt = Date.now(); } catch (e) {}
    try {
      var req = indexedDB.open("grayco_crm");""")
sub('KVSKIP GC cache keys',
"""          var keys = ["projects","invs","cos","expenses","schedule","leads","vendors","customers","subs"];
          var done = 0;
          keys.forEach(function(k){
            var r = store.get(k);
            r.onsuccess = function(){""",
"""          var keys = _rcK.filter(function(k){ return !_rcNow[k] || _rcVer[k] !== _rcNow[k]; });   /* SYNCCPU (KVSKIP) */
          if (!keys.length) { db.close(); return; }
          var done = 0;
          keys.forEach(function(k){
            var r = store.get(k);
            r.onsuccess = function(){
              if (_rcNow[k]) _rcVer[k] = _rcNow[k];""")


sub('KVSKIP est2contract start',
"""async function syncEstimateToContract(){
  if(_processing) return;
  _processing = true;
  try {
    var estimates = await idb('estimates') || [];""",
"""var _secV = { e: '', c: '', ok: false, at: 0 };   /* SYNCCPU (KVSKIP): estimates and change orders not written since a pass that found nothing new */
async function syncEstimateToContract(){
  if(_processing) return;
  var _ve = window.__gcKvVer ? window.__gcKvVer('estimates') : '', _vc = window.__gcKvVer ? window.__gcKvVer('cos') : '';
  if(_ve && _secV.ok && _secV.e === _ve && _secV.c === _vc && Date.now() - _secV.at < 300000) return;
  _processing = true;
  try {
    var estimates = await idb('estimates') || [];""")
sub('KVSKIP est2contract end',
"""      try{ if(window._setProjects){ var _fill={}; projects.forEach(function(p){ if(p && p._lastEstId && parseFloat(p.contract)) _fill[p.id]=p.contract; });""",
"""      _ve = '';   /* SYNCCPU: written — the next pass looks again */
      try{ if(window._setProjects){ var _fill={}; projects.forEach(function(p){ if(p && p._lastEstId && parseFloat(p.contract)) _fill[p.id]=p.contract; });""")
sub('KVSKIP est2contract mark',
"""  } catch(e){
    console.warn('Estimate sync error:', e);
  }
  _processing = false;
}""",
"""    _secV = { e: _ve, c: _vc, ok: !!_ve && estHash === _lastEstHash && coHash === _lastCOHash, at: Date.now() };   /* SYNCCPU (KVSKIP) */
  } catch(e){
    console.warn('Estimate sync error:', e);
  }
  _processing = false;
}""")


# 7. SPTEXT — the upload de-dup (spSend) does not hash the same text again: a one-row upload whose text (without its save time)
#    is the text it last hashed for that key is recognised by a string compare
sub('SPTEXT check',
r'''    if (one) {
      rawH = spHash(init.body.replace(/,"updated_at":"[^"]*"\}$/, '}'));
      var mm = SP_MEMO[one[1]]; if (mm && mm.h === rawH) return [{ key: mm.k, sig: mm.s }];
    }''',
r'''    var spT = null;
    if (one) {
      /* SYNCCPU (SPTEXT): the text without the save time at the end, cut where that field starts (not a regex over the whole text) */
      var spI = init.body.lastIndexOf(',"updated_at":"'); spT = spI > 0 && /"\}$/.test(init.body.slice(-2)) && init.body.indexOf('"', spI + 15) === init.body.length - 2 ? init.body.slice(0, spI) : init.body;
      var mm = SP_MEMO[one[1]]; if (mm && typeof mm.t === 'string' && mm.t === spT) return [{ key: mm.k, sig: mm.s }];   /* the same text as last time: no hash */
      rawH = spHash(init.body.replace(/,"updated_at":"[^"]*"\}$/, '}'));
      if (mm && mm.h === rawH) { if (spT.length <= 2000000) mm.t = spT; return [{ key: mm.k, sig: mm.s }]; }
    }''')
sub('SPTEXT store',
'''    if (rawH && out.length === 1) SP_MEMO[one[1]] = { h: rawH, k: out[0].key, s: out[0].sig };''',
'''    if (rawH && out.length === 1) SP_MEMO[one[1]] = { h: rawH, k: out[0].key, s: out[0].sig, t: spT && spT.length <= 2000000 ? spT : null };   /* SYNCCPU (SPTEXT) */''')


# 8. APPRMEMO — the approval set (the badge, the chip, the Home's numbers) is worked out once per 2.5 s while nobody touches the
#    screen (once per 0.8 s as before while someone does); its three painters are paced to 3 s then anyway
sub('APPRMEMO',
'''  function current(){ if (memo && Date.now() - memo.at < 800) return memo; memo = window._gcApprovalSet(); return memo; }''',
'''  function current(){ var ttl = 800; try { var q = window.__gcQuiet; if (q && q.idleMs && q.idleMs() > 3000) ttl = 2500; } catch (e) {}   /* SYNCCPU (APPRMEMO) */
    if (memo && Date.now() - memo.at < ttl) return memo; memo = window._gcApprovalSet(); return memo; }''')


# 9. TD2SEEN — the To-Do's "cleared on its own" memory (gc_td2_seen, only compared over 36 hours) is kept in memory and written at most
#    every 30 s (and when the page is hidden / closed): lines appearing while the lists load after an open wrote it 5-7 times in 150 s
sub('TD2SEEN',
'''    if (seenDirty) lsSet('gc_td2_seen', JSON.stringify(seenMap));''',
'''    if (seenDirty) seenSave();   /* SYNCCPU (TD2SEEN) */''')
sub('TD2SEEN fn',
'''var dirty = true, ST8 = null, lastBuild = 0, seenMap = null, autoLog = [], lastAuto = 0;''',
'''var dirty = true, ST8 = null, lastBuild = 0, seenMap = null, autoLog = [], lastAuto = 0;
/* SYNCCPU (TD2SEEN): the first change is written at once, later ones at most every 30 s; whatever waits is written when the page is hidden / left */
var seenT = 0, seenAt = 0;
function seenFlush(){ if (seenT) { try { clearTimeout(seenT); } catch (e) {} seenT = 0; } if (seenMap) { seenAt = Date.now(); lsSet('gc_td2_seen', JSON.stringify(seenMap)); } }
function seenSave(){ if (seenT) return; var wait = 30000 - (Date.now() - seenAt); if (wait <= 0) { seenFlush(); return; } seenT = (W.__GC_NATIVE_SETTIMEOUT__ || setTimeout).call(W, function(){ seenT = 0; seenFlush(); }, wait); }
try { W.addEventListener('pagehide', function(){ if (seenT) seenFlush(); }); D.addEventListener('visibilitychange', function(){ if (D.hidden && seenT) seenFlush(); }); } catch (e) {}''')


# 10. DECSAVE — the decisions ledger (gc_decisions_v1) is written once per burst of decisions (a clean-up pass records dozens in
#     one go; each wrote the whole ledger: 73 writes in 150 s on the owner's phone), at the end of the same task
sub('DECSAVE',
'''function dirty(){ DIRTY = true; saveLocal(); schedulePush(); }''',
'''var saveSoon = false;   /* SYNCCPU (DECSAVE): the ledger is in memory; written once when this burst of decisions is over (same task) */
function dirty(){ DIRTY = true; if (!saveSoon) { saveSoon = true; Promise.resolve().then(function(){ saveSoon = false; saveLocal(); }); } schedulePush(); }''')



open(p, 'w', encoding='utf-8').write(t)
