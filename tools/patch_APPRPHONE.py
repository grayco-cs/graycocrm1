#!/usr/bin/env python3
"""patch APPRPHONE - approvals on the owner's phone go away when he acts on them, and the decision reaches the office.
Owner 11/24 (iPhone, GrayCo Field, 9 approvals waiting): "Trying to turn in approvals on phone idk if it's working not going away".
Measured offline (tools/tests/test_APPRPHONE.mjs; the 11/19 snapshot + one made-up card of each kind, emulated iPhone, the owner):
  1. Field home ✅ Approve on a sub invoice / expense: the card said "✓ Approved" for ~2 s, then the home was drawn again and the
     same card showed "✅ Approve" again for the rest of the 5-second undo window; ⚡ Needs you kept the old number (the bar badge
     had dropped). A second tap on the card opened the Approvals screen instead. Now an approval in its undo window is left out of
     the home's cards, Needs you and the badge at once (the ↩ Undo toast stays), and the home is drawn again on the tap and on Undo.
  2. To-Do approval cards from the alert feed - "N new job messages", "N new messages where you're tagged", "Payroll waiting on
     your approval" - did nothing at all on ✅ Approve / Review (their action only knew sub invoices and expenses), so they never
     left. They now open what clears them: the unread job messages, the Payroll approvals tab.
  3. On one bar with the phone's storage full (as the owner's iPhone reports), a sub invoice approved on the phone sometimes never
     reached the cloud: the list upload was "refused" again and again, the decisions ledger did not go up either, and after the app
     was opened again nothing re-sent it (the save queue's and the field guard's notes of it were in the full localStorage). The
     phone showed it approved; the office still had it waiting. Now a decision made here (sub invoice, expense) is also kept in
     IndexedDB and delivered on its own: the cloud's row is read, that one record is set to the decision, and the row is written,
     until the cloud has it - across reloads and updates. While that is so the card stays out of the set on this device; a later
     sync can't bring it back, unless someone decides that record again after us (then theirs stands).
  4. An approval still in its 5-second undo window when the page went away (the app closed, the automatic update reloading it)
     was dropped. It is now approved on the way out, like a deny was; and the automatic update waits while a decision is still
     on its way (window._gcSending lists it).
Each anchor must occur exactly once; the marker APPRPHONE is only inside JS comments.
usage: python3 tools/patch_APPRPHONE.py [index.html]"""
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
t = io.open(P, encoding='utf-8').read()
if '/* patch APPRPHONE' in t:
    print('APPRPHONE: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    if n != 1: sys.exit('APPRPHONE: anchor found %d times: %r' % (n, old[:90]))
    t = t.replace(old, new)

# ── 1. the inline-approve module (APX): its undo-window keys; an approval in its undo window is not lost when the page goes ──
once("""W._gcApprovalPending = function(){ return pendCount(); };""",
     """W._gcApprovalPending = function(){ return pendCount(); };
W._gcApprovalPendingKeys = function(){ return Object.keys(PEND); };   /* patch APPRPHONE: the cards in their 5-s undo window (left out of the Field home) */""")
once("""W.addEventListener('pagehide', function(){ Object.keys(DPEND).forEach(function(k){ try { commitDeny(k); } catch (e) {} }); });""",
     """W.addEventListener('pagehide', function(){ Object.keys(DPEND).forEach(function(k){ try { commitDeny(k); } catch (e) {} }); });
W.addEventListener('pagehide', function(){ Object.keys(PEND).forEach(function(k){ var p = PEND[k]; delete PEND[k]; try { if (p && p.r) commit(p.r); } catch (e) {} }); });   /* patch APPRPHONE: an approval in its undo window goes through when the page goes (the app closed, the update reloading it) */""")

# ── 2. the Field home dashboard (PMFIELD): its cache knows the undo window / the decisions on their way; the unread-messages sheet ──
once("""var key = [a, t, C().schedule, C().projects, C().leads, C().users, k.apprCount(), vasOn(), myName(), SAVES, pausedOn(), rest, coF(), jmCount(), Math.floor(Date.now() / 30000)];""",
     """var key = [a, t, C().schedule, C().projects, C().leads, C().users, k.apprCount(), vasOn(), myName(), SAVES, pausedOn(), rest, coF(), jmCount(), Math.floor(Date.now() / 30000), (W._gcApprPhone ? W._gcApprPhone.sig() : '')];   /* patch APPRPHONE: + the approvals acted on here */""")
once("""  alsoPm: alsoPm, kind: function(pid){""",
     """  alsoPm: alsoPm, jm: function(){ return jmSheet(); },   /* patch APPRPHONE: 💬 the unread job messages (the To-Do approval card's action) */
  kind: function(pid){""")

# ── 3. the role app's tap on a home card's ✅ Approve: the home is drawn again at once (the card leaves) ──
once("""    case 'apprnow': try { if (W._gcApproveInPlace && W._gcApproveInPlace(id)) { b.disabled = true; b.textContent = '✓ Approved'; later(function(){ deskRender(true); }, 5600); return; } } catch (e) {} openApprovals(); return;""",
     """    case 'apprnow': try { if (W._gcApprPhone && W._gcApprPhone.busy(id)) return; if (W._gcApproveInPlace && W._gcApproveInPlace(id)) { b.disabled = true; b.textContent = '✓ Approved'; later(function(){ deskRender(true); }, 5600); try { if (W._gcApprPhone) W._gcApprPhone.repaint(); } catch (e) {} return; } } catch (e) {} openApprovals(); return;   /* patch APPRPHONE: the card leaves at once; a second tap in the undo window does not open another screen */""")

# ── 4. the To-Do approval cards from the alert feed: job messages / payroll open what clears them ──
once("""action:function(){ if(a.act==='approvals'&&window._gcOpenSubApprovals) window._gcOpenSubApprovals(); else if(a.act==='expenses'&&window.gcExpCenter) gcExpCenter.open(); } });""",
     """action:function(){ if(a.act==='approvals'&&window._gcOpenSubApprovals) window._gcOpenSubApprovals(); else if(a.act==='expenses'&&window.gcExpCenter) gcExpCenter.open(); else if(a.act==='jobmsg'&&window._gcApprJobMsg) window._gcApprJobMsg(); else if(a.act==='payroll'&&window._gcApprPayroll) window._gcApprPayroll(); } });   /* patch APPRPHONE: these did nothing - the card never left */""")

# ── 5. the courier, the set filter, the home's repaint ──
JS = r"""
<script id="gc-patch-apprphone">
/* patch APPRPHONE ( tools/patch_APPRPHONE.py) - owner 11/24, iPhone: "Trying to turn in approvals on phone idk if
   it's working not going away".
   · The Field home leaves out a card in its 5-second undo window (✓ Approved — ↩ Undo is on the toast) and is drawn again on the tap
     and on Undo: the card, ⚡ Needs you and the ✅ badge drop together.
   · A decision made here (sub invoice approved, expense approved) is kept in IndexedDB (this phone's localStorage is often full) and
     delivered on its own: the cloud's row is read, that one record is set to the decision and the row written back, until the cloud
     has it. While it is on its way, and until this device's own copy says so too, the card stays out of the approval set (the
     badge, Needs you, the Approvals screen): a later sync cannot bring it back. Someone deciding that record again AFTER us wins.
   · window._gcSending lists a decision still on its way (the automatic update waits for it).
   Console: _gcApprPhone.state(), .run() */
(function(W, D){
'use strict';
if (W.__gcPhoneApprOn) return; W.__gcPhoneApprOn = true;
var NST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, NSI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function nowIso(){ return new Date().toISOString(); }
function warn(e){ try { console.warn('[GC phone approvals]', e && e.message || e); } catch (x) {} }
function later(f, ms){ return NST.call(W, f, ms || 0); }
/* the lists a decision is delivered to: which field names the record, which statuses still wait, when a later decision was made */
var KINDS = {
  sub: { list: 'gc_sub_approvals', idf: 'invId', wait: /^pending_pm$/, when: function(r){ return +r.pmDecidedAt || Date.parse(r.pmDecidedAt || '') || 0; } },
  exp: { list: 'gc_expense_approvals', idf: 'expId', wait: /^(pending_pm|escalated)$/, when: function(r){ return Date.parse(r.approvedAt || '') || 0; } }
};
var CQ = {}, LOADED = false, RUN = null, BUSY = false, ST = { delivered: 0, sends: 0, reads: 0, fails: 0, last: '' };
/* ── this device's own store (IndexedDB: the decision must outlive a full localStorage and a reload) ── */
var dbp = null;
function db(){
  if (dbp) return dbp;
  dbp = new Promise(function(res, rej){ try { var r = W.indexedDB.open('gc_apprphone', 1); r.onupgradeneeded = function(){ try { r.result.createObjectStore('q'); } catch (e) {} }; r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ dbp = null; rej(r.error); }; } catch (e) { dbp = null; rej(e); } });
  return dbp;
}
function save(){ return db().then(function(d){ return new Promise(function(res){ try { var tx = d.transaction('q', 'readwrite'); tx.objectStore('q').put(JSON.parse(JSON.stringify(CQ)), 'cq'); tx.oncomplete = function(){ res(true); }; tx.onerror = function(){ res(false); }; } catch (e) { res(false); } }); }).catch(function(){ return false; }); }
function load(){ return db().then(function(d){ return new Promise(function(res){ try { var g = d.transaction('q', 'readonly').objectStore('q').get('cq'); g.onsuccess = function(){ res(g.result); }; g.onerror = function(){ res(null); }; } catch (e) { res(null); } }); }).catch(function(){ return null; }); }
load().then(function(v){ if (v && typeof v === 'object') Object.keys(v).forEach(function(k){ if (!CQ[k]) CQ[k] = v[k]; }); LOADED = true; changed(); if (Object.keys(CQ).length) soon(6000); });
/* ── a person's decision (the deciding functions are wrapped, outermost) ── */
function person(){ try { var fg = W.__gcFG; if (fg && fg.lastInput) return Date.now() - fg.lastInput < 20000; } catch (e) {} return true; }
function me(){ try { var u = W._gcMeUser && W._gcMeUser(); if (u && u.name) return s(u.name); } catch (e) {} try { var a = W.__GC_AUTH__; if (a && a.name) return s(a.name()); } catch (e) {} return s(W.localStorage && W.localStorage.getItem('grayco_user')); }
function record(kind, id, fields){
  id = s(id); if (!id || !KINDS[kind]) return;
  var k = kind + ':' + id;
  CQ[k] = { k: k, kind: kind, id: id, f: fields, at: Date.now(), by: me(), tries: 0, sent: 0, ok: 0, next: Date.now() + 4000 };
  save(); changed(); soon(4000);
}
function wrapFns(){
  var f = W._gcPmDecideSub;
  if (typeof f === 'function' && !f.__gcApprPhone) {
    var w = function(invId, approve){ var r = f.apply(this, arguments);
      try { if (approve !== false && person()) { var t = Date.now(), who = me(); record('sub', invId, { status: 'pm_approved', pmDecidedBy: who, pmDecidedAt: t, decidedBy: who }); } } catch (e) { warn(e); }
      return r; };
    try { Object.keys(f).forEach(function(x){ w[x] = f[x]; }); } catch (e) {}
    w.__gcApprPhone = true; W._gcPmDecideSub = w;
  }
  var g = W._gcApproveExpense;
  if (typeof g === 'function' && !g.__gcApprPhone) {
    var w2 = function(expId){ var r = g.apply(this, arguments);
      try { if (person()) { var who = me(), at = nowIso(); record('exp', expId, { status: 'approved', approvedBy: who, approvedAt: at }); } } catch (e) { warn(e); }
      return r; };
    try { Object.keys(g).forEach(function(x){ w2[x] = g[x]; }); } catch (e) {}
    w2.__gcApprPhone = true; W._gcApproveExpense = w2;
  }
}
wrapFns(); NSI.call(W, wrapFns, 2000);
/* ── delivery ── */
function creds(){ try { return { u: s(W.localStorage.getItem('grayco_sb_url')).replace(/\/$/, ''), k: s(W.localStorage.getItem('grayco_sb_key')) }; } catch (e) { return {}; } }
/* its own request, straight to the database: the page's fetch wrappers answer a slow read on one bar with a made-up 503 and then
   pause that list ("the cloud is busy"), so on the owner's phone the list upload was refused again and again */
function xhr(m, url, h, body, ms){
  return new Promise(function(res){
    try {
      var x = new W.XMLHttpRequest(); x.open(m, url, true); x.timeout = ms;
      Object.keys(h || {}).forEach(function(k){ try { x.setRequestHeader(k, h[k]); } catch (e) {} });
      x.onload = function(){ res({ ok: x.status >= 200 && x.status < 300, status: x.status, text: x.responseText }); };
      x.onerror = x.ontimeout = x.onabort = function(){ res({ ok: false, status: 0, text: '' }); };
      x.send(body == null ? null : body);
    } catch (e) { res({ ok: false, status: 0, text: '' }); }
  });
}
function soon(ms){ if (RUN) return; RUN = later(function(){ RUN = null; run(); }, ms || 0); }
function lsList(key){ try { var v = JSON.parse(W.localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function localWaits(x){ var K = KINDS[x.kind], r = lsList(K.list).filter(function(a){ return a && s(a[K.idf]) === x.id; })[0]; return !!(r && K.wait.test(s(r.status))); }
/* this device's own copy still says "waiting" after the cloud has the decision: put the decision there too (it may not fit) */
function fixLocal(x){
  var K = KINDS[x.kind], l = lsList(K.list), ch = false;
  l = l.map(function(a){ if (a && s(a[K.idf]) === x.id && K.wait.test(s(a.status))) { ch = true; return Object.assign({}, a, x.f, { updatedAt: nowIso() }); } return a; });
  if (ch) { try { W.localStorage.setItem(K.list, JSON.stringify(l)); } catch (e) {} try { if (W.idbSet) W.idbSet(K.list, l); } catch (e) {} }
}
function run(){
  if (BUSY || !LOADED) { soon(3000); return; }
  var c = creds(), keys = Object.keys(CQ), t = Date.now();
  if (!keys.length) return;
  if (!c.u || !c.k) { soon(15000); return; }
  var due = keys.map(function(k){ return CQ[k]; }).filter(function(x){ return x && (x.next || 0) <= t; });
  var nextAt = keys.reduce(function(m, k){ var x = CQ[k]; return x && x.next ? Math.min(m, x.next) : m; }, t + 300000);
  if (!due.length) { soon(Math.max(1000, nextAt - t)); return; }
  /* delivered already, waiting only for this device's own copy: no network */
  due.filter(function(x){ return x.ok; }).forEach(function(x){ if (!localWaits(x)) { delete CQ[x.k]; return; } fixLocal(x); if (!localWaits(x) || Date.now() - x.at > 30 * 864e5) delete CQ[x.k]; else x.next = Date.now() + 300000; });
  var lists = {}; due.filter(function(x){ return !x.ok && CQ[x.k]; }).forEach(function(x){ var L = KINDS[x.kind].list; (lists[L] = lists[L] || []).push(x); });
  var names = Object.keys(lists);
  if (!names.length) { save(); changed(); soon(Math.max(1000, nextAt - t)); return; }
  BUSY = true;
  var h = { apikey: c.k, Authorization: 'Bearer ' + c.k };
  var chain = Promise.resolve();
  names.forEach(function(L){ chain = chain.then(function(){ return deliver(c, h, L, lists[L]); }).catch(function(e){ ST.fails++; ST.last = L + ': ' + (e && e.message || e); lists[L].forEach(function(x){ x.tries++; x.next = Date.now() + Math.min(300000, 15000 * Math.pow(2, Math.min(x.tries, 5))); }); }); });
  chain.then(function(){ BUSY = false; save(); changed(); soon(1000); });
}
function deliver(c, h, L, items){
  ST.reads++;
  return xhr('GET', c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(L) + '&select=value', h, null, 150000)
    .then(function(r){ if (!r || !r.ok) throw new Error('read ' + (r && r.status)); return JSON.parse(r.text || '[]'); })
    .then(function(rows){
      var raw = rows && rows[0] ? rows[0].value : null, str = typeof raw === 'string', list = raw;
      if (str) { try { list = JSON.parse(raw); } catch (e) { list = null; } }
      if (!Array.isArray(list)) throw new Error('no list in the cloud');
      var K = null, send = [];
      items.forEach(function(x){
        K = KINDS[x.kind];
        var i = -1; for (var j = 0; j < list.length; j++) { if (list[j] && s(list[j][K.idf]) === x.id) { i = j; break; } }
        if (i < 0) { x.tries++; x.next = Date.now() + 60000; if (x.tries > 5) delete CQ[x.k]; return; }   /* not in the cloud's list (yet) */
        var r = list[i];
        if (!K.wait.test(s(r.status))) { x.ok = Date.now(); ST.delivered++; x.next = Date.now() + 2000; return; }   /* the cloud has a decision */
        if (K.when(r) > x.at + 1000) { delete CQ[x.k]; return; }   /* someone sent it back / decided again after us: theirs stands */
        list[i] = Object.assign({}, r, x.f, { updatedAt: nowIso() });
        send.push(x);
      });
      if (!send.length) return;
      try { if (W.__gcFG && W.__gcFG.dirty) W.__gcFG.dirty[L] = Date.now(); } catch (e) {}   /* a person's decision: the field guard lets it go */
      ST.sends++;
      var body = JSON.stringify({ key: L, value: str ? JSON.stringify(list) : list, updated_at: nowIso() });
      return xhr('POST', c.u + '/rest/v1/gc_kv?on_conflict=key', Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, h), body, 180000)
        .then(function(r){
          if (!r || !r.ok) throw new Error('write ' + (r && r.status));
          send.forEach(function(x){ x.sent = Date.now(); x.next = Date.now() + 8000; });   /* read back once to be sure */
          try { console.log('[GC] phone approvals: ' + send.length + ' decision(s) delivered to ' + L); } catch (e) {}
        });
    });
}
/* ── the approval set leaves out what was decided here and is not in this device's copy / the cloud yet ── */
function held(){ var o = {}; Object.keys(CQ).forEach(function(k){ var x = CQ[k]; if (!x) return; if (x.kind === 'sub') { o['sub:' + x.id] = 1; o['sub:invId:' + x.id] = 1; } else if (x.kind === 'exp') { o['exp:' + x.id] = 1; o['exp:expId:' + x.id] = 1; } }); return o; }
function pend(){ try { return arr(W._gcApprovalPendingKeys && W._gcApprovalPendingKeys()); } catch (e) { return []; } }
function trim(r){
  try {
    if (!r || !r.groups) return r;
    var H = held(); if (!Object.keys(H).length) return r;
    var n = 0;
    Object.keys(r.groups).forEach(function(g){ var l = arr(r.groups[g]), k = l.filter(function(x){ return !(x && H[s(x.id)]); }); n += l.length - k.length; r.groups[g] = k; });
    if (n) r.total = Math.max(0, (r.total || 0) - n);
  } catch (e) { warn(e); }
  return r;
}
function wrapSet(){
  var f = W._gcApprovalSet; if (typeof f !== 'function' || f.__gcApprPhone) return;
  var w = function(){ return trim(f.apply(this, arguments)); };
  try { Object.keys(f).forEach(function(x){ w[x] = f[x]; }); } catch (e) {}
  w.__gcApprPhone = true; W._gcApprovalSet = w;
  try { if (W._gcApprovalSetFresh) W._gcApprovalSetFresh(); } catch (e) {}
}
/* the Field home's list: the cards in their undo window are left out too (the bar badge already leaves them out) */
function wrapField(){
  var F = W._gcField; if (!F || typeof F.approvals !== 'function' || F.approvals.__gcApprPhone) return;
  var f = F.approvals;
  var w = function(){ var L = arr(f.apply(this, arguments)), P = pend(), H = held(); if (!P.length && !Object.keys(H).length) return L; var po = {}; P.forEach(function(k){ po[s(k)] = 1; }); return L.filter(function(x){ var id = s(x && x.id); return !(po[id] || H[id]); }); };
  w.__gcApprPhone = true; F.approvals = w;
}
wrapSet(); wrapField(); NSI.call(W, function(){ wrapSet(); wrapField(); }, 3000);
/* ── the home is drawn again when what it shows changed here ── */
var SIG = '';
function sig(){ return pend().join(',') + '|' + Object.keys(held()).join(','); }
function changed(){ try { if (W._gcApprovalSetFresh) W._gcApprovalSetFresh(); } catch (e) {} watch(true); }
function repaint(){
  try { if (W._gcApprovalSetFresh) W._gcApprovalSetFresh(); } catch (e) {}
  try { W.dispatchEvent(new Event('gc-approvals-changed')); } catch (e) {}   /* the ✅ badge (the role app paints it on this event) */
  try { if (D.querySelector('#_gcJobPick.gc-fh') && W._gcField && typeof W._gcField.render === 'function') W._gcField.render(); } catch (e) { warn(e); }
}
function watch(force){ var g = sig(); if (g === SIG && !force) return; var was = SIG; SIG = g; if (force || was !== g) repaint(); }
NSI.call(W, function(){ try { watch(false); } catch (e) {} }, 700);
/* the automatic update waits for a decision still on its way */
function wrapSending(){
  var f = W._gcSending; if (typeof f !== 'function' || f.__gcApprPhone) return;
  var w = function(){ var l = arr(f.apply(this, arguments)); try { Object.keys(CQ).forEach(function(k){ var x = CQ[k]; if (x && !x.ok) l.push({ key: KINDS[x.kind].list + ' (' + x.k + ')', since: new Date(x.at).toISOString() }); }); pend().forEach(function(k){ l.push({ key: 'approval ' + k, since: nowIso() }); }); } catch (e) {} return l; };
  w.__gcApprPhone = true; W._gcSending = w;
}
wrapSending(); NSI.call(W, wrapSending, 3000);
/* ── the To-Do approval cards from the alert feed ── */
function closeHome(){ try { var h = D.querySelector('#_gcJobPick.gc-fh'); if (h) h.remove(); } catch (e) {} }
W._gcApprJobMsg = function(){
  try { if (D.querySelector('#_gcJobPick.gc-fh') && W._gcPmField && typeof W._gcPmField.jm === 'function') { W._gcPmField.jm(); return true; } } catch (e) { warn(e); }
  var L = []; try { L = arr(typeof W._gcJobMsgForMe === 'function' ? W._gcJobMsgForMe() : []); } catch (e) {}
  var pid = ''; L.forEach(function(x){ var p = s(x && x.m && x.m.pid); if (p && !pid) pid = p; });
  try { if (pid && typeof W._gcOpenJobMessages === 'function') { W._gcOpenJobMessages(pid); return true; } } catch (e) { warn(e); }
  try { if (typeof W._gcPickJobForMessages === 'function') { W._gcPickJobForMessages(); return true; } } catch (e) {}
  return false;
};
W._gcApprPayroll = function(){
  try { if (typeof W._gcOpenPayrollTab === 'function') { closeHome(); W._gcOpenPayrollTab('approvals'); return true; } } catch (e) { warn(e); }
  try { if (W._setView) { closeHome(); W._setView('payroll'); return true; } } catch (e) {}
  return false;
};
W._gcApprPhone = {
  sig: sig, repaint: function(){ SIG = sig(); repaint(); }, run: function(){ Object.keys(CQ).forEach(function(k){ if (CQ[k]) CQ[k].next = 0; }); soon(0); },
  busy: function(id){ id = s(id); return pend().indexOf(id) >= 0; },
  held: function(){ return Object.keys(held()); },
  record: record,
  state: function(){ return { loaded: LOADED, queue: JSON.parse(JSON.stringify(CQ)), stats: JSON.parse(JSON.stringify(ST)), pending: pend() }; }
};
try { console.log('[GC] 📱 Phone approvals: approvals acted on the phone leave at once and reach the office — _gcApprPhone.state()'); } catch (e) {}
})(window, document);
</script>"""
once("""try { console.log('[GC] 📱 PM field: 🏠 Home in the middle, the home dashboard, 📅 My Schedule, ✏️ Update job (patch PMFIELD) — _gcPmField.state()'); } catch (e) {}
})(window);
</script>""",
     """try { console.log('[GC] 📱 PM field: 🏠 Home in the middle, the home dashboard, 📅 My Schedule, ✏️ Update job (patch PMFIELD) — _gcPmField.state()'); } catch (e) {}
})(window);
</script>""" + JS)

io.open(P, 'w', encoding='utf-8').write(t)
print('APPRPHONE patched')
