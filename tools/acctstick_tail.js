/*__GC_PATCH_ACCTSTICK__ (owner 11/20, upset: "There are things in accounting that keep coming back and messing up … it needs to work
   flawlessly" · and the rule for the whole CRM: "When I click approve or any button physically, remember it's forever, so nothing
   from another computer can overwrite data. If anything is manually entered, if I click approve it should work and stay approved").

   WHAT WAS COMING BACK (read-only check of the live data, 11/21):
     • a duplicate QuickBooks bill the automatic fixes had archived (#12128755 Farrell Calhoun) was a live bill again, and a bill's
       payment link (#3657869 SouthernCarlson) was undone: the office computer re-stamped ~13 unpaid bills at 18:15 (the Friday
       pay-date stamper writes the whole record it holds, with a new save time) from an OLDER copy; the sync takes the newer stamp
       for the whole record, so the old type / qbKeys / qbAmountWas went over the fix (the fields only the fix has, _archived,
       amtCheck, stayed — the record said "archived" and was not).
     • a register line the fixes moved to its job (bill #1302, Mt Moriah) was back on "Lexington Enterprise" (an old copy).
     • a person's decision had no memory of its own: the record's whole-copy save time was the only judge, so any older copy that a
       background job (pay-date stamper, job finder, import, start-up sweep) re-stamped, or a computer that was offline, won.
       A field a person CLEARED came back from a copy that still had it (the merge keeps a key one copy still has).
     • "Assign sub to job" wrote its queue entry with no save time: on a push the cloud's waiting copy won the tie and the match
       came back as "to match".
     • ⚠ Needs a look: ✓ Done was one read-modify-write of the whole list in the cloud (two computers at once: one lost); nothing
       was ever taken off by itself when the bill / invoice was fixed another way, so the count never went down.

   THE RULE NOW (one layer, every screen):
     1. DECISIONS LEDGER (gc_kv gc_decisions, this computer's copy in localStorage): every person action on a record — a click or
        typing that saves it (approve, deny, mark paid, check #, void, match, assign, move to a job, unlink, it's right, undo …) —
        is kept per record + field: { v (the value; a cleared field is kept as cleared), at, by, src:'person' }. The one-time
        automatic accounting fixes are kept the same way with src:'fix'. A person's decision is only replaced by a NEWER person
        decision (↩ Undo is one); a fix by a newer fix or any person. It is shared by every computer and phone.
     2. WHEREVER TWO COPIES MEET — the union merge (every pull, push, restore), the pull merge of the approval queues, every write
        to this computer's disk (IndexedDB) and to the queues in localStorage — the decided fields are put back to the decision
        and the record is stamped at least as new as it. So an older copy, a re-stamped stale copy, a background recompute, an
        automatic fix, an import (QuickBooks / e-mail), another computer's cache: none of them can undo a decision.
        Protected lists: invs, expenses, gcAcctRegister, projectPayments, subs, vendors, customers, leads, gc_sub_approvals,
        gc_invoice_approvals, gc_expense_approvals, gc_check_queue. (projects: its own person-edit ledger, SYNC_A; schedule and
        estimates keep their own merges.)
     3. What counts as a person: a trusted click / key / change in the last 12 s, a write of at most 6 records, not a pull (no
        merge of that list in the last 2.5 s). Computed fields (pay-date stamping, job guesses, reminders, logs, files) are never
        taken as decisions. Code that acts for a person can say so: window._gcDecide(list, id, fields, { src, what }).
     4. The live records the fixes had changed and an old copy undid are put back once (the fix's value, only where the record
        still shows the fix's value or the value it replaced — never over a later person edit).
     5. ⚠ Needs a look (patch ACCTAUTO): ✓ Done is kept here first and merged into the cloud's list (never lost to another
        computer's write; re-sent until the cloud has it), ↩ Undo right after; an item whose bill / invoice was settled another way
        (moved to a job, archived, the copy archived, the total or balance changed, the sub added) leaves the list by itself.
        "Assign sub to job" entries whose bill is history (paid / archived) or was put on a job by a person elsewhere stop counting
        as "to match".
   NOTE for claude/fastopen2 (sync performance): this wraps window._gcUnionMerge / window._gcPullMerge (outermost) and
   IDBObjectStore.prototype.put / Storage.prototype.setItem for the protected keys only; each costs one pass over that list.
   API: window._gcDecide(list, idOrRecord, fields, opts) · window._gcDecisions = { get, all, guard, stats, pull, push, forget, applyAll } */
(function(W){
'use strict';
if (W.__GC_PATCH_ACCTSTICK__) return; W.__GC_PATCH_ACCTSTICK__ = true;
var D = W.document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function every(f, ms){ return SI.call(W, f, ms); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function isObj(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function nowIso(){ return new Date().toISOString(); }
function num(v){ var x = typeof v === 'number' ? v : parseFloat(s(v).replace(/[^0-9.\-]/g, '')); return isFinite(x) ? x : 0; }
function cents(v){ return Math.round(num(v) * 100); }
function clone(v){ return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
/* the same value whatever the key order */
function canon(v){
  if (v === undefined) return '\u0000u';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(function(k){ return v[k] !== undefined; }).map(function(k){ return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
}
var lsSetRaw = Storage.prototype.setItem, lsGetRaw = Storage.prototype.getItem;
function lsGet(k){ try { return lsGetRaw.call(W.localStorage, k); } catch (e) { return null; } }
function lsPut(k, v){ try { lsSetRaw.call(W.localStorage, k, v); } catch (e) {} }
function jparse(t, d){ try { var v = JSON.parse(t); return v == null ? d : v; } catch (e) { return d; } }
function warn(e){ try { console.warn('[GC ACCTSTICK]', e && e.message || e); } catch (x) {} }
function me(){ try { if (typeof W._gcMeUser === 'function') { var u = W._gcMeUser(); if (u && (u.name || u.email)) return s(u.name || u.email); } } catch (e) {} var g = lsGet('grayco_user'); var j = jparse(g, null); return s(isObj(j) ? (j.name || j.email) : g) || 'someone'; }

/* ── which lists, and a record's id in each ── */
var LISTS = { invs: 'invs', invoices: 'invs', expenses: 'expenses', gcAcctRegister: 'gcAcctRegister', projectPayments: 'projectPayments', subs: 'subs', vendors: 'vendors',
  customers: 'customers', leads: 'leads', gc_sub_approvals: 'gc_sub_approvals', gc_invoice_approvals: 'gc_invoice_approvals', gc_expense_approvals: 'gc_expense_approvals', gc_check_queue: 'gc_check_queue' };
var LSQ = { gc_sub_approvals: 1, gc_invoice_approvals: 1, gc_expense_approvals: 1, gc_check_queue: 1 };   /* the queues live in localStorage */
var QALT = { gc_sub_approvals: 'invId', gc_invoice_approvals: 'invId', gc_expense_approvals: 'expId' };
function lk(key){ return LISTS[key] || ''; }
function rid(L, r){
  if (!isObj(r)) return '';
  if (L === 'gcAcctRegister') return s(r._id != null && r._id !== '' ? r._id : r.id);
  var a = QALT[L]; if (a && r[a] != null && r[a] !== '') return a + ':' + s(r[a]);   /* a queue entry is its invoice's / expense's */
  return s(r.id != null && r.id !== '' ? r.id : r._id);
}
/* fields that are never a person's decision: save stamps, ids, and what background code computes or appends */
var META = /^(id|_id|updatedAt|updated_at|savedAt|modified|modifiedAt|lastModified|updatedBy|createdAt|created|_fe|__.*)$/;
var AUTOF = /^(payDate|payDateAuto|payDateRule|payTerms|payTermsLabel|netDue|late|due|dueDate|_job(Conf|Guess|GuessName|Certain)|_autoRouted|_subRouted|_autoDrafted|_autoDrawKey|autoLinkWhy|autoLinked|matchWhy|readAmountHow|sendState|sentNote|remindLog|remindersPaused|noReminders|noAutoReminders|linkLog|statusHistory|history|payHistory|files|_files|fileData|fileName|fileLink|lines|views|opens|seen|lastSeen|readAt|readBy|_gc.*|_ai.*|ai[A-Z].*|.*(Log|Cache|Count|Summary))$/;
var MAXV = 4000;   /* a value bigger than this (as text) is not kept as a decision */

/* ── the ledger ── */
var KEY = 'gc_decisions', LSK = 'gc_decisions_v1';
var DL = {}, DIRTY = false, CLOUD_AT = '', STATS = { recorded: 0, explicit: 0, restored: 0, merges: 0, disk: 0, ls: 0, pulls: 0, pushes: 0, pushFail: 0, seeded: 0, skippedSweep: 0 };
(function load(){ var v = jparse(lsGet(LSK), null); if (isObj(v) && isObj(v.d)) { DL = v.d; DIRTY = !!v.dirty; } })();
function saveLocal(){ try { lsPut(LSK, JSON.stringify({ d: DL, dirty: DIRTY, at: nowIso() })); } catch (e) { prune(true); try { lsPut(LSK, JSON.stringify({ d: DL, dirty: DIRTY, at: nowIso() })); } catch (x) {} } }
/* which of two entries for one field stands: a person beats an automatic fix; else the newer */
function better(a, b){
  if (!a) return b; if (!b) return a;
  var pa = a.src !== 'fix', pb = b.src !== 'fix';
  if (pa !== pb) return pa ? a : b;
  return s(b.at) > s(a.at) ? b : a;
}
function mergeInto(dst, src){
  var ch = false;
  Object.keys(src || {}).forEach(function(L){
    var SL = src[L]; if (!isObj(SL)) return; var DLL = dst[L] = dst[L] || {};
    Object.keys(SL).forEach(function(id){
      var SR = SL[id]; if (!isObj(SR)) return; var DR = DLL[id] = DLL[id] || {};
      Object.keys(SR).forEach(function(f){ var e = SR[f]; if (!isObj(e) || !e.at) return; var w = better(DR[f], e); if (w !== DR[f]) { DR[f] = e; ch = true; } });
    });
  });
  return ch;
}
function prune(hard){
  var cut = new Date(Date.now() - (hard ? 120 : 400) * 864e5).toISOString();
  Object.keys(DL).forEach(function(L){ Object.keys(DL[L]).forEach(function(id){ var R = DL[L][id]; Object.keys(R).forEach(function(f){ if (s(R[f].at) < cut) delete R[f]; }); if (!Object.keys(R).length) delete DL[L][id]; }); });
}
function entry(v, at, by, src, what){ var e = { at: at, by: by, src: src || 'person' }; if (v === undefined) e.del = 1; else e.v = clone(v); if (what) e.what = s(what).slice(0, 80); return e; }
function put(L, id, f, e){ if (!L || !id || !f) return false; var R = (DL[L] = DL[L] || {})[id] = DL[L][id] || {}; var w = better(R[f], e); if (w === R[f]) return false; R[f] = e; return true; }
/* window._gcDecide: code acting for a person (or an automatic fix, src:'fix') says what was decided */
function decide(list, idOrRec, fields, opt){
  opt = opt || {}; var L = lk(list); if (!L) return 0;
  var id = isObj(idOrRec) ? rid(L, idOrRec) : s(idOrRec); if (!id || !isObj(fields)) return 0;
  var at = s(opt.at) || nowIso(), by = s(opt.by) || me(), n = 0;
  Object.keys(fields).forEach(function(f){ if (META.test(f)) return; var v = fields[f]; if (v === null && opt.nullIsClear !== false) v = undefined; if (v !== undefined && canon(v).length > MAXV * 4) return; if (put(L, id, f, entry(v, at, by, opt.src, opt.what))) n++; });
  if (n) { STATS.explicit += n; dirty(); }
  return n;
}
function dirty(){ DIRTY = true; saveLocal(); schedulePush(); }

/* ── a list corrected to the decisions (the same array when nothing to do) ── */
function fixRec(L, r){
  var id = rid(L, r); if (!id) return null; var M = DL[L] && DL[L][id]; if (!M) return null;
  var o = null, top = '';
  Object.keys(M).forEach(function(f){
    var E = M[f]; if (!E) return; if (s(E.at) > top) top = s(E.at);
    if (E.del) { if (r[f] !== undefined && r[f] !== null && r[f] !== '' && !(Array.isArray(r[f]) && !r[f].length)) { o = o || Object.assign({}, r); delete o[f]; } return; }
    if (canon(r[f]) !== canon(E.v)) { o = o || Object.assign({}, r); o[f] = clone(E.v); }
  });
  if (!o) return null;
  /* the corrected copy is newer than the copy it corrects (an old copy re-stamped later — even in the future — would tie with it and
     a tie keeps the cloud's) and at least as new as the decision; two computers correcting the same copy make the same record */
  var t0 = Date.parse(s(r.updatedAt)), bump = isFinite(t0) ? new Date(t0 + 1).toISOString() : '';
  if (bump > top) top = bump;
  if (s(o.updatedAt) < top) o.updatedAt = top;
  return o;
}
function guard(key, list){
  var L = lk(key); if (!L || !Array.isArray(list) || !DL[L]) return list;
  var out = null;
  for (var i = 0; i < list.length; i++) { var r = list[i]; if (!isObj(r)) continue; var f = fixRec(L, r); if (f) { out = out || list.slice(); out[i] = f; } }
  if (out) STATS.restored += out.filter(function(x, i){ return x !== list[i]; }).length;
  return out || list;
}

/* ── a person's edit, found where it is saved: this computer's disk and the queues in localStorage ── */
var lastInput = 0, selfAt = {}, CHG = {}, PULLING = {};
['pointerdown', 'keydown', 'change', 'input', 'click', 'touchend', 'submit'].forEach(function(ev){ try { D.addEventListener(ev, function(e){ if (e && e.isTrusted) lastInput = Date.now(); }, true); } catch (x) {} });
/* a person: a trusted click / key in the last 45 s (an approval can wait on the server), not this layer's own write, not a pull */
function personWindow(L){ var n = Date.now(); return n - lastInput < 45000 && !PULLING[L] && !(n - (selfAt[L] || 0) < 1500); }
/* what a merge produced (a pull / push): a record written exactly as a merge made it is not a person's edit */
function noteMerged(L, out, a, b){
  if (Date.now() - lastInput > 50000) return;
  var A = {}, B = {}, m = CHG[L] = {}, t = Date.now();
  arr(a).forEach(function(r){ var id = rid(L, r); if (id) A[id] = r; }); arr(b).forEach(function(r){ var id = rid(L, r); if (id) B[id] = r; });
  arr(out).forEach(function(r){ var id = rid(L, r); if (!id) return; if (r === A[id] && r === B[id]) return; m[id] = { b: body(r), t: t }; });
}
function fromMerge(L, id, b){ var c = CHG[L] && CHG[L][id]; return !!(c && c.b === b && Date.now() - c.t < 20000); }
var SNAP = {};   /* list → id → the record as text (stamps left out), as last written here */
function body(r){ return JSON.stringify(r, function(k, v){ return this === r && META.test(k) ? undefined : v; }); }   /* native: one pass per write */
function snapOf(L, list){ var m = {}; for (var i = 0; i < list.length; i++) { var r = list[i]; var id = rid(L, r); if (id) m[id] = { b: body(r), r: r }; } return m; }
function takeable(f, v){ if (META.test(f) || AUTOF.test(f)) return false; if (v !== undefined && v !== null && typeof v === 'object') { if (Array.isArray(v) ? f !== 'payments' : !/^(payInfo|amtCheck|_archived|payOverride)$/.test(f)) return false; } return canon(v).length <= MAXV; }
function record(L, list){
  var prev = SNAP[L], next = snapOf(L, list); SNAP[L] = next;
  if (!prev || !personWindow(L) || Date.now() < (W.__gcNotPersonUntil || 0)) return null;   /* an automatic fix running says so */
  var ch = [];
  Object.keys(next).forEach(function(id){ var p = prev[id]; if (p && p.b !== next[id].b) ch.push(id); });
  ch = ch.filter(function(id){ return !fromMerge(L, id, next[id].b); });
  if (!ch.length) return null;
  /* a sweep over the list is no person — unless it came right after a click (a bulk action: approve all, write checks) */
  if (ch.length > (Date.now() - lastInput < 4000 ? 80 : 6)) { STATS.skippedSweep++; return null; }
  var at = nowIso(), by = me(), n = 0, hit = {};
  ch.forEach(function(id){
    var a = jparse(prev[id].b, {}), b = next[id].r, ks = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function(k){ ks[k] = 1; });
    Object.keys(ks).forEach(function(f){
      var bv = b[f]; if (canon(a[f]) === canon(bv)) return;
      if (!takeable(f, bv) || !takeable(f, a[f] === undefined ? '' : a[f])) return;
      var cur = DL[L] && DL[L][id] && DL[L][id][f];
      if (cur && !cur.del && canon(cur.v) === canon(bv)) return;                 /* already the decision (the guard put it back) */
      if (cur && cur.del && (bv === undefined || bv === null || bv === '')) return;
      if (put(L, id, f, entry(bv === null && a[f] !== undefined && a[f] !== null ? undefined : bv, at, by, 'person'))) { n++; hit[id] = 1; }
    });
  });
  if (n) { STATS.recorded += n; dirty(); try { console.log('%c[GC] decision kept: ' + L + ' ' + Object.keys(hit).join(', ') + ' (' + n + ' field' + (n === 1 ? '' : 's') + ', ' + by + ')', 'background:#14532d;color:#fff;padding:2px 6px'); } catch (e) {} }
  return n ? { ids: hit, at: at } : null;
}
/* the record a person just changed carries the time of the change (a queue entry was saved with no stamp, so the cloud's waiting copy won the tie) */
function stampIds(L, list, rr){
  if (!rr) return list; var out = null;
  for (var i = 0; i < list.length; i++) { var r = list[i]; if (!isObj(r) || !rr.ids[rid(L, r)] || s(r.updatedAt) >= rr.at) continue; out = out || list.slice(); out[i] = Object.assign({}, r, { updatedAt: rr.at }); }
  return out || list;
}

/* ── where copies meet ── */
function wrapUnion(){
  var f = W._gcUnionMerge; if (typeof f !== 'function') return false; if (f.__gcStick) return true;
  var w = function(key, a, b){
    var out = f.apply(this, arguments);
    try { var L = lk(key); if (L && Array.isArray(out)) { var g = guard(key, out); if (g !== out) { STATS.merges++; out = g; } noteMerged(L, out, a, b); } } catch (e) { warn(e); }
    return out;
  };
  try { Object.keys(f).forEach(function(p){ if (!(p in w)) w[p] = f[p]; }); } catch (e) {}
  w.__gcStick = true; W._gcUnionMerge = w; return true;
}
function wrapPull(){
  var f = W._gcPullMerge; if (typeof f !== 'function') return false; if (f.__gcStick) return true;
  var w = async function(key, inc, idbLocal){
    var L = lk(key); if (L) PULLING[L] = 1;
    var out; try { out = await f.apply(this, arguments); } finally { if (L) delete PULLING[L]; }
    try {
      if (L && Array.isArray(out)) { var g = guard(key, out); if (g !== out) { STATS.merges++; out = g; if (LSQ[key]) { selfAt[L] = Date.now(); lsPut(key, JSON.stringify(g)); } } if (LSQ[key]) SNAP[L] = snapOf(L, out); }
    } catch (e) { warn(e); }
    return out;
  };
  try { Object.keys(f).forEach(function(p){ if (!(p in w)) w[p] = f[p]; }); } catch (e) {}
  w.__gcStick = true; W._gcPullMerge = w; return true;
}
(function hookIDB(){
  var P = W.IDBObjectStore && W.IDBObjectStore.prototype; if (!P || !P.put || P.put.__gcStick) return;
  var orig = P.put;
  var w = function(value, key){
    try {
      if (this.name === 'kv' && this.transaction && this.transaction.db && this.transaction.db.name === 'grayco_crm') {
        /* the three shapes the CRM has written over time: the list itself, { k, v: text } (a store keyed by k), { key, value } */
        var kn = typeof key === 'string' ? key : (isObj(value) && typeof value.k === 'string' ? value.k : (isObj(value) && typeof value.key === 'string' ? value.key : ''));
        var L = kn ? lk(kn) : '', list = null, shape = 0;
        if (L) {
          if (Array.isArray(value)) list = value;
          else if (isObj(value) && typeof value.v === 'string' && value.v.charAt(0) === '[') { list = jparse(value.v, null); shape = 1; }
          else if (isObj(value) && Array.isArray(value.value)) { list = value.value; shape = 2; }
        }
        if (L && Array.isArray(list)) {
          var rr = record(L, list), g0 = stampIds(L, list, rr), g = guard(kn, g0);
          if (g !== list) {
            arguments[0] = value = shape === 1 ? Object.assign({}, value, { v: JSON.stringify(g) }) : shape === 2 ? Object.assign({}, value, { value: g }) : g;
            STATS.disk++; SNAP[L] = snapOf(L, g); screenSoon(kn);
          }
        }
      }
    } catch (e) { warn(e); }
    return orig.apply(this, arguments);
  };
  w.__gcStick = true; P.put = w;
})();
(function hookLS(){
  var P = Storage.prototype; if (P.setItem.__gcStick) return;
  var orig = P.setItem;
  var w = function(k, v){
    try {
      if (this === W.localStorage && LSQ[k] && typeof v === 'string' && v.charAt(0) === '[') {
        var L = lk(k), list = jparse(v, null);
        if (Array.isArray(list)) { var rr = record(L, list), g0 = stampIds(L, list, rr), g = guard(k, g0); if (g === list && g0 !== list) g = g0; if (g !== list) { STATS.ls++; v = JSON.stringify(g); SNAP[L] = snapOf(L, g); arguments[1] = v; } }
      }
    } catch (e) { warn(e); }
    return orig.apply(this, arguments);
  };
  w.__gcStick = true; P.setItem = w;
})();
/* every write to the cloud (any sync engine, any whole-list writer): the decided fields go up as decided */
(function hookWire(){
  var prev = W.fetch; if (typeof prev !== 'function' || prev.__gcStick) return;
  var KRX = /"key"\s*:\s*"(invs|invoices|expenses|gcAcctRegister|projectPayments|subs|vendors|customers|leads|gc_sub_approvals|gc_invoice_approvals|gc_expense_approvals|gc_check_queue)"/;
  var w = function(input, init){
    try {
      var m = String((init && init.method) || 'GET').toUpperCase(), url = typeof input === 'string' ? input : (input && input.url) || '';
      if ((m === 'POST' || m === 'PATCH') && /\/rest\/v1\/gc_kv/.test(url) && init && typeof init.body === 'string' && init.body.length < 15000000 && KRX.test(init.body)) {
        var b = JSON.parse(init.body), rows = Array.isArray(b) ? b : [b], ch = false;
        rows.forEach(function(row){
          if (!row || !lk(row.key)) return; var v = row.value, txt = typeof v === 'string';
          if (txt && v.charAt(0) === '[') v = jparse(v, null);
          if (!Array.isArray(v)) return;
          var g = guard(row.key, v); if (g !== v) { row.value = txt ? JSON.stringify(g) : g; ch = true; STATS.wire = (STATS.wire || 0) + 1; }
        });
        if (ch) init = Object.assign({}, init, { body: JSON.stringify(b) });
        return prev.call(this, input, init);
      }
    } catch (e) { warn(e); }
    return prev.apply(this, arguments);
  };
  try { Object.keys(prev).forEach(function(p){ if (!(p in w)) w[p] = prev[p]; }); } catch (e) {}
  w.__gcStick = true; W.fetch = w;
})();
/* the screen: the lists the CRM's React state holds */
var SETTER = { invs: '_setInvoices', invoices: '_setInvoices', expenses: '_setExpenses', customers: '_setCustomers', subs: '_setSubs', vendors: '_setVendors', leads: '_setLeads' };
var scrT = {};
function screenSoon(key){ var L = lk(key); if (scrT[L]) return; scrT[L] = later(function(){ scrT[L] = 0; screen(key); }, 60); }
function screen(key){
  var L = lk(key);
  try {
    var c = W._crm || {}, fixed = false;
    (L === 'invs' ? ['invs', 'invoices'] : [L]).forEach(function(k){ if (Array.isArray(c[k])) { var g = guard(L, c[k]); if (g !== c[k]) { c[k] = g; fixed = true; } } });
    var fn = W[SETTER[L]];
    if (typeof fn === 'function') fn(function(prev){ var g = Array.isArray(prev) ? guard(L, prev) : prev; return g; });
    return fixed;
  } catch (e) { warn(e); return false; }
}
/* every copy on this computer, now (after a pull of the ledger or a seed) */
async function applyAll(){
  var n = 0;
  for (var k in SETTER) { if (k === 'invoices') continue; if (screen(k)) n++; }
  var keys = Object.keys(DL);
  for (var i = 0; i < keys.length; i++) {
    var L = keys[i];
    try {
      if (LSQ[L]) { var q = jparse(lsGet(L), null); if (Array.isArray(q)) { var gq = guard(L, q); if (gq !== q) { selfAt[L] = Date.now(); lsPut(L, JSON.stringify(gq)); SNAP[L] = snapOf(L, gq); n++; } } }
      if (typeof W.idbGet === 'function' && typeof W.idbSet === 'function') {
        var v = await (L === 'gcAcctRegister' && W._gcAc ? W._gcAc(L) : W.idbGet(L));
        if (Array.isArray(v)) { var g = guard(L, v); if (g !== v) { selfAt[L] = Date.now(); await (L === 'gcAcctRegister' && W._gcAcW ? W._gcAcW(L, g) : W.idbSet(L, g)); n++; if (L === 'gcAcctRegister') { try { if (W._gcRegisterFlush) W._gcRegisterFlush(); } catch (e) {} } } }
      }
    } catch (e) { warn(e); }
  }
  return n;
}

/* ── the shared copy (gc_kv gc_decisions) ── */
function sbBase(){ return s(lsGet('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function signedIn(){ try { return !!(W.__GC_AUTH__ && (W.__GC_AUTH__.email ? W.__GC_AUTH__.email() : true)) && !!lsGet('grayco_sb_key'); } catch (e) { return false; } }
function cloudGet(sel){
  var k = s(lsGet('grayco_sb_key')); if (!k || !W.fetch) return Promise.resolve(undefined);
  return Promise.race([W.fetch(sbBase() + '/rest/v1/gc_kv?key=eq.' + KEY + '&select=' + (sel || 'value,updated_at'), { headers: { apikey: k }, cache: 'no-store' })
    .then(function(r){ return r && r.ok ? r.json() : undefined; }).then(function(rows){ if (!Array.isArray(rows)) return undefined; var row = rows[0] || null; if (!row) return { v: null, at: '' }; var v = row.value; if (typeof v === 'string') v = jparse(v, null); return { v: v, at: s(row.updated_at) }; }, function(){ return undefined; }),
    new Promise(function(res){ later(function(){ res(undefined); }, 25000); })]);
}
function cloudPut(value){
  var k = s(lsGet('grayco_sb_key')); if (!k || !W.fetch) return Promise.resolve(false);
  return W.fetch(sbBase() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: KEY, value: value, updated_at: nowIso() }) }).then(function(r){ return !!(r && r.ok); }, function(){ return false; });
}
var pushing = false, pushT = 0, pulling = false;
function schedulePush(){ if (pushT) return; pushT = later(function(){ pushT = 0; push(); }, 1200); }
async function push(){
  if (pushing || !DIRTY) return false; pushing = true;
  try {
    var c = await cloudGet(); if (c === undefined) { STATS.pushFail++; later(schedulePush, 8000); return false; }
    if (c.v && isObj(c.v.d) && mergeInto(DL, c.v.d)) { later(applyAll, 0); }
    prune(false);
    var ok = await cloudPut({ v: 1, at: nowIso(), d: DL });
    if (ok) { DIRTY = false; STATS.pushes++; saveLocal(); } else { STATS.pushFail++; later(schedulePush, 8000); }
    return ok;
  } finally { pushing = false; }
}
async function pull(force){
  if (pulling) return false; pulling = true;
  try {
    if (!force) { var p = await cloudGet('updated_at'); if (p === undefined || (p.at && p.at === CLOUD_AT)) return false; }
    var c = await cloudGet(); if (c === undefined) return false;
    CLOUD_AT = c.at; STATS.pulls++;
    if (c.v && isObj(c.v.d) && mergeInto(DL, c.v.d)) { saveLocal(); await applyAll(); return true; }
    return false;
  } finally { pulling = false; }
}

/* ── 4. the fixes' values an old copy undid: put back once (only where the record still shows the fix's value or the one it replaced) ── */
async function seedFixes(){
  var AF = W._gcAcctFix; if (!AF || !AF.state) return 0;
  var st = AF.state(), log = arr(st && st.log); if (!log.length) return 0;
  var sig = log.map(function(e){ return s(e.id) + ':' + arr(e.items).filter(function(i){ return i.undone; }).length; }).join(','); if (lsGet('gc_acctstick_seed') === sig) return 0;
  var get = async function(L){ try { var v = await (L === 'gcAcctRegister' && W._gcAc ? W._gcAc(L) : W.idbGet(L)); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  var by = {}, n = 0;
  for (var i = 0; i < log.length; i++) {
    var e = log[i]; if (!e || !e.runId) continue;
    var its = arr(e.items);
    for (var j = 0; j < its.length; j++) {
      var it = its[j]; if (!it || it.undone) continue;
      var chs = arr(it.changes);
      for (var k = 0; k < chs.length; k++) {
        var ch = chs[k], L = lk(ch.list); if (!L || !isObj(ch.after)) continue;
        if (!by[L]) { by[L] = {}; (await get(L)).forEach(function(r){ var id = rid(L, r); if (id) by[L][id] = r; }); }
        var r = by[L][s(ch.id)]; if (!r) continue;
        Object.keys(ch.after).forEach(function(f){
          if (META.test(f)) return;
          var af = ch.after[f], bf = isObj(ch.before) ? ch.before[f] : undefined, cur = r[f] === undefined ? null : r[f];
          if (canon(cur) !== canon(af) && canon(cur) !== canon(bf === undefined ? null : bf)) return;   /* a later edit: left as it is */
          if (put(L, s(ch.id), f, entry(af === null ? undefined : af, s(it.at || e.at), s(e.by) || 'Automatic accounting fix', 'fix', s(it.title)))) n++;
        });
      }
    }
  }
  lsPut('gc_acctstick_seed', sig);
  if (n) { STATS.seeded += n; dirty(); await applyAll(); try { console.log('%c[GC] accounting fixes kept: ' + n + ' fields (an old copy had undone some)', 'background:#14532d;color:#fff;padding:2px 6px'); } catch (x) {} }
  return n;
}

/* ── 5. ⚠ Needs a look: settled another way → off the list ── */
function invAll(){ var c = W._crm || {}; var a = arr(c.invs).length ? c.invs : arr(c.invoices); return arr(a); }
function deadInv(r){ return !r || r.deleted === true || r._deleted === true || /^archived$/i.test(s(r.type)) || /^(void|voided|deleted|denied|rejected|cancell?ed)$/i.test(s(r.status)); }
function normName(v){ return low(v).replace(/&amp;/g, '&').replace(/&/g, ' and ').replace(/\b(llc|inc|co|corp|company|the|ltd)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function lookSettled(x, idx){
  if (!isObj(x)) return '';
  try {
    var I = idx || {}; if (!idx) invAll().forEach(function(r){ if (r && r.id != null) I[s(r.id)] = r; });
    var ids = arr(x.ids).map(s), one = I[s(x.inv || ids[0])];
    var k = s(x.kind);
    if (k === 'jobpick' || k === 'link') {
      if (!ids.length && !x.inv) return '';
      if (!one) return 'the invoice is gone';
      if (deadInv(one)) return 'archived';
      if (x.cur && s(x.cur.pid) !== s(one.pid)) return 'moved to a job';
      if (one.autoLinkOk || one._linkReviewed || one.pidManual) return 'job confirmed';
      return '';
    }
    if (k === 'dupbill') { if (ids.length < 2) return ''; var dead = ids.filter(function(id){ return deadInv(I[id]); }).length; return dead >= ids.length - 1 ? 'the extra copy is archived' : ''; }
    if (k === 'billtotal') { if (!one) return 'the bill is gone'; if (deadInv(one)) return 'archived'; if (x.amount != null && cents(one.amt != null && one.amt !== '' ? one.amt : one.amount) !== cents(x.amount)) return 'the total was changed'; if (one.amtCheck && one.amtCheck.by && one.amtCheck.by !== 'Automatic accounting fix') return 'the total was checked'; return ''; }
    if (k === 'openbal') { if (!one) return 'the invoice is gone'; if (deadInv(one)) return 'archived'; if (one.openBalance != null && one.openBalance !== '' && cents(one.openBalance) !== cents(x.amount)) return 'the balance was changed'; return ''; }
    if (k === 'addsub') { var m = /Add "([^"]+)"/.exec(s(x.title)); var nm = normName(m ? m[1] : ''); if (!nm) return ''; var c = W._crm || {}; return arr(c.subs).concat(arr(c.vendors)).some(function(v){ return v && !v.deleted && normName(v.name) === nm; }) ? 'the sub / vendor was added' : ''; }
  } catch (e) {}
  return '';
}
/* ✓ Done / ↩ Undo of Needs a look: every mark this computer has seen is kept here too (merged into the cloud's list, never
   replacing it): a computer that wrote an older list, or a lost write, cannot bring an item back — the next load puts the mark back */
var KNOWN_K = 'gc_acctfix_look_known';
function lookMerge(cloud, mem){
  var out = isObj(cloud) ? Object.assign({}, cloud) : { list: [], done: {} };
  out.list = arr(out.list); var cd = isObj(out.done) ? out.done : {}; out.done = Object.assign({}, cd);
  var known = jparse(lsGet(KNOWN_K), {}) || {}, ahead = false;
  [isObj(mem) ? mem.done : null, known].forEach(function(src){ Object.keys(src || {}).forEach(function(id){ var a = out.done[id], b = src[id]; if (!isObj(b) || !b.at) return; if (!a || s(b.at) > s(a.at)) out.done[id] = b; }); });
  Object.keys(out.done).forEach(function(id){ if (!cd[id] || s(cd[id].at) < s(out.done[id].at)) ahead = true; });
  lsPut(KNOWN_K, JSON.stringify(out.done));
  out.__ahead = ahead;
  return out;
}
function lookPending(id, e){ var p = jparse(lsGet(KNOWN_K), {}) || {}; if (!p[id] || s(p[id].at) < s(e.at)) p[id] = e; lsPut(KNOWN_K, JSON.stringify(p)); }
function lookIsDone(L, x){ var d = L && L.done && L.done[x.id]; return !!(d && !d.undone); }

/* ── "Assign sub to job" entries that are settled: a history bill (paid / archived) or a bill a person put on a job elsewhere ── */
function settleSubQueue(){
  try {
    if (!allowed()) return 0;
    var q = jparse(lsGet('gc_sub_approvals'), null); if (!Array.isArray(q) || !q.length) return 0;
    var I = {}; invAll().forEach(function(r){ if (r && r.id != null) I[s(r.id)] = r; }); if (!Object.keys(I).length) return 0;
    var P = {}; arr((W._crm || {}).projects).forEach(function(p){ if (p && p.id != null && !p.deleted) P[s(p.id)] = p; });
    var at = nowIso(), n = 0;
    var out = q.map(function(a){
      if (!a || a.status !== 'needs_office_match' || a.invId == null) return a;
      var iv = I[s(a.invId)]; if (!iv) return a;
      var hist = deadInv(iv) || iv.paid === true || low(iv.status) === 'paid';
      var placed = !hist && s(iv.pid) && P[s(iv.pid)] && (iv.pidManual || iv._matchConfirmed || iv.linkedBy || iv._linkReviewed || iv.autoLinkOk);
      if (!hist && !placed) return a;
      var o = Object.assign({}, a, hist ? { status: 'recorded', settledWhy: deadInv(iv) ? 'the bill is archived' : 'the bill is paid (history)' } : { status: 'pending_pm', matched: true, certain: true, pid: s(iv.pid), pmName: s(P[s(iv.pid)].pm), settledWhy: 'put on its job by ' + s(iv.linkedBy || 'a person') }, { settledAt: at, updatedAt: at });
      decide('gc_sub_approvals', o, { status: o.status, matched: o.matched, pid: o.pid }, { src: 'fix', at: at, by: 'Accounting clean-up', what: o.settledWhy });
      n++; return o;
    });
    if (n) { selfAt.gc_sub_approvals = Date.now(); lsPut('gc_sub_approvals', JSON.stringify(out)); SNAP.gc_sub_approvals = snapOf('gc_sub_approvals', out); try { if (W.idbSet) W.idbSet('gc_sub_approvals', out); } catch (e) {} }
    return n;
  } catch (e) { warn(e); return 0; }
}
function allowed(){
  try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {}
  var u = {}; try { u = (typeof W._gcMeUser === 'function' && W._gcMeUser()) || {}; } catch (e) {}
  return /^(admin|owner|office)/i.test(s(u.role)) || /^office/i.test(s(u.profile)) || low(u.payType) === 'owner';
}

/* ── a small "↩ Undo" after an action (no popup: a light bar at the bottom for 10 s) ── */
function toast(text, undo){
  try {
    var old = D.getElementById('gc-stick-undo'); if (old) old.remove();
    var b = D.createElement('div'); b.id = 'gc-stick-undo';
    b.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:2147483000;background:#fff;color:#0f1d2f;border:1px solid #cbd5e1;box-shadow:0 6px 24px rgba(15,29,47,.18);border-radius:10px;padding:9px 12px;font:13px/1.4 Inter,system-ui,sans-serif;display:flex;gap:12px;align-items:center;max-width:min(560px,calc(100vw - 32px))';
    var t = D.createElement('span'); t.textContent = text; t.style.cssText = 'flex:1;min-width:0';
    b.appendChild(t);
    if (typeof undo === 'function') { var u = D.createElement('button'); u.type = 'button'; u.setAttribute('data-stick-undo', '1'); u.textContent = '↩ Undo'; u.style.cssText = 'border:1px solid #0f1d2f;background:#fff;color:#0f1d2f;border-radius:7px;padding:5px 10px;font-weight:800;cursor:pointer;font-size:12.5px'; u.onclick = function(){ b.remove(); try { undo(); } catch (e) { warn(e); } }; b.appendChild(u); }
    var x = D.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Close'); x.style.cssText = 'border:0;background:none;color:#64748b;cursor:pointer;font-size:14px'; x.onclick = function(){ b.remove(); }; b.appendChild(x);
    D.body.appendChild(b);
    later(function(){ if (b.parentNode) b.remove(); }, 10000);
  } catch (e) {}
}

/* ── boot ── */
(function wire(){ var n = 0; (function again(){ var a = wrapUnion(), b = wrapPull(); if (++n < 400 && (!a || !b)) later(again, 250); })(); })();
/* keep this wrapper the outermost one: a later wrapper is wrapped again */
every(function(){ try { var f = W._gcUnionMerge; if (typeof f === 'function' && !f.__gcStick) wrapUnion(); var p = W._gcPullMerge; if (typeof p === 'function' && !p.__gcStick) wrapPull(); } catch (e) {} }, 3000);
(function prime(){ var t = 0; (function again(){ if (typeof W.idbGet !== 'function') { if (t++ < 200) later(again, 250); return; }
  Object.keys(LISTS).forEach(function(k){ if (k === 'invoices') return; var L = lk(k);
    if (LSQ[k]) { var q = jparse(lsGet(k), null); if (Array.isArray(q) && !SNAP[L]) SNAP[L] = snapOf(L, q); }
    else Promise.resolve(W.idbGet(k)).then(function(v){ if (Array.isArray(v) && !SNAP[L]) SNAP[L] = snapOf(L, v); }, function(){}); }); })(); })();
later(function(){ if (signedIn()) pull(true).then(function(){ if (DIRTY) push(); }); }, 1500);
every(function(){ if (D.hidden || !signedIn()) return; if (DIRTY) push(); pull(false); }, 30000);
try { D.addEventListener('visibilitychange', function(){ if (!D.hidden && signedIn()) later(function(){ pull(false); }, 800); }); } catch (e) {}
var seedTries = 0;
every(function(){ if (seedTries > 40 || !signedIn() || !allowed()) return; var AF = W._gcAcctFix; if (!AF || !AF.state || !arr(AF.state().log).length) { seedTries++; return; } seedTries = 99; seedFixes().catch(warn); }, 6000);
every(function(){ if (!D.hidden && signedIn()) settleSubQueue(); }, 20000);
/* Needs a look: read again now and then (its marks merged, put back in the cloud when an older list was written over them) */
every(function(){ try { var AF = W._gcAcctFix; if (D.hidden || !signedIn() || !allowed() || !AF || typeof AF.lookLoad !== 'function') return; AF.lookLoad().then(function(){ try { AF.paint(true); } catch (e) {} }, function(){}); } catch (e) {} }, 30000);

W._gcDecide = decide;
W._gcDecisions = {
  get: function(list, id){ var L = lk(list) || list; return id ? (DL[L] && DL[L][s(id)]) || null : DL[L] || null; },
  all: function(){ return DL; }, guard: guard, applyAll: applyAll, pull: pull, push: push, seed: seedFixes, settleSubQueue: settleSubQueue,
  stats: function(){ var n = 0; Object.keys(DL).forEach(function(L){ Object.keys(DL[L]).forEach(function(id){ n += Object.keys(DL[L][id]).length; }); }); return Object.assign({ fields: n, dirty: DIRTY }, STATS); },
  forget: function(list, id, f){ var L = lk(list) || list; if (DL[L] && DL[L][id]) { if (f) delete DL[L][id][f]; else delete DL[L][id]; dirty(); } },
  isPersonNow: function(list){ return personWindow(lk(list) || list); }
};
W._gcStick = { lookSettled: lookSettled, lookMerge: lookMerge, lookPending: lookPending, lookIsDone: lookIsDone, toast: toast, canon: canon };
try { console.log('[GC] A person\'s decision stays decided: older copies, re-stamped copies, automatic fixes and imports cannot undo it (patch ACCTSTICK) — _gcDecisions.stats()'); } catch (e) {}
})(window);
