#!/usr/bin/env python3
"""patch DEC2 - two owner decisions.  Idempotent: a second run prints "already patched" and changes nothing.
Every find-string must occur exactly once or the script stops without writing.

1. OFFICE TV: the TV slideshow scope (tvScope) treats an office / office-manager role (role starts with "office")
   like an admin, for the TV only. Nothing else (admin cards, goal editing, other pages) is widened. PMs,
   estimators and supers keep the personal view.
2. ACCOUNTING REGISTER: the two client-invoice writers (_gcPostPaidInvoices and _gcReconcileAccounting step 1) now build the
   row from ONE function (window._gcClientInvRow): category "Invoice" ("Change Order" for COs), the raw invoice desc,
   date = paid date when paid (sent date while unpaid). `source` is only set by the writer that creates the row.
   EXPENSE_ rows: _gcExpToAcct writes amt + amount + status the same way step 4 does, and step 4 also writes amount.
   A one-time admin migration (flag gc_dec2_regnorm_v1, a synced localStorage key = gc_kv) normalizes existing rows:
   category, desc, date only - never an amount.

usage: python3 tools/patch_DEC2.py [path/to/index.html]
"""
import os, sys

P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
src = open(P, encoding='utf-8').read()
MARK = "patch DEC2"
if 'id="gc-patch-dec2"' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    n = s.count(old)
    assert n == 1, (n, old[:90])
    return s.replace(old, new)

# ---- 1. Office TV ---------------------------------------------------------------------------------------------
src = once(src,
 "function tvScope(){ var adm = isAdmin(), nm = adm ? '' : me(); return { adm: adm, name: nm }; }",
 "/* patch DEC2: office / office-manager staff see the company-wide TV like an admin (TV only; nothing else is widened) */\n"
 "function tvOffice(){ try { var u = (W._gcMeUser && W._gcMeUser()) || (W.meUser && W.meUser()); return !!u && low(u.role).indexOf('office') === 0; } catch (e) { return false; } }\n"
 "function tvScope(){ var adm = isAdmin() || tvOffice(), nm = adm ? '' : me(); return { adm: adm, name: nm }; }")

# ---- 2a. the one client-invoice row builder (next to writer B) --------------------------------------------------
src = once(src,
 "  window._gcReconcileAccounting = async function(){\n    if(window.__GC_IS_TYPING__ || document.hidden) return;",
 "  /* patch DEC2: the ONE definition of a client-invoice register row. Both writers (_gcPostPaidInvoices and step 1 below) use it,\n"
 "     so they can never disagree: category Invoice / Change Order, the raw desc, date = PAID date when paid (sent date while unpaid). */\n"
 "  window._gcClientInvRow = function(iv){\n"
 "    var st=String(iv.status||'').toLowerCase(), paid=(iv.paid===true||st==='paid'), td=new Date().toISOString().slice(0,10);\n"
 "    var sent=iv.sentDate||iv.date||'', pd=paid?(iv.paidDate||iv.recvDate||sent||td):'';\n"
 "    return { srcInvId: iv.id, pid: iv.pid||'', type:'income', category:(iv.drawType==='change_order'?'Change Order':'Invoice'),\n"
 "      desc: iv.desc||('Invoice '+iv.id), amt: parseFloat(iv.amt||iv.amount)||0, date: paid?pd:(sent||td), paidDate: pd, status: paid?'paid':'invoiced' };\n"
 "  };\n"
 "  window._gcReconcileAccounting = async function(){\n    if(window.__GC_IS_TYPING__ || document.hidden) return;")

src = once(src,
 "        if(st!=='sent' && st!=='paid') return; // drafts don't post\n"
 "        var p=projects.find(function(x){return x.id===iv.pid;});\n"
 "        window._gcAddToRegister({\n"
 "          srcInvId: iv.id,\n"
 "          pid: iv.pid, type:'income', category:(iv.drawType==='change_order'?'Change Order':'Invoice'),\n"
 "          desc: iv.desc||('Invoice '+iv.id),\n"
 "          amt: parseFloat(iv.amt||iv.amount)||0,\n"
 "          date: iv.sentDate||iv.date||new Date().toISOString().slice(0,10),\n"
 "          paidDate: st==='paid'?(iv.paidDate||iv.recvDate||new Date().toISOString().slice(0,10)):'',\n"
 "          status: st==='paid'?'paid':'invoiced'\n"
 "        });",
 "        if(st!=='sent' && st!=='paid' && iv.paid!==true) return; // drafts don't post\n"
 "        window._gcAddToRegister(window._gcClientInvRow(iv));   /* patch DEC2: same row as _gcPostPaidInvoices */")

# ---- 2b. writer A uses the same row ---------------------------------------------------------------------------
src = once(src,
 "    var row={ srcInvId:iv.id, pid:iv.pid||'', type:sh.type, category:sh.category,\n"
 "              vendor:sh.who, payee:sh.who, desc:sh.desc, po:iv.po||'',\n"
 "              amt:Math.abs(amt), amount:Math.abs(amt),\n"
 "              date:iv.paidDate||iv.date||today(),\n"
 "              paidDate:iv.paidDate||today(),\n"
 "              source:low(iv.type)+'invoice', method:'payment',\n"
 "              direction:sh.direction, isIncome:sh.isIncome, status:'paid' };",
 "    var row={ srcInvId:iv.id, pid:iv.pid||'', type:sh.type, category:sh.category,\n"
 "              vendor:sh.who, payee:sh.who, desc:sh.desc, po:iv.po||'',\n"
 "              amt:Math.abs(amt), amount:Math.abs(amt),\n"
 "              date:iv.paidDate||iv.date||today(),\n"
 "              paidDate:iv.paidDate||today(),\n"
 "              source:low(iv.type)+'invoice', method:'payment',\n"
 "              direction:sh.direction, isIncome:sh.isIncome, status:'paid' };\n"
 "    if(low(iv.type)==='client'){      /* patch DEC2: a client payment is the SAME row the reconcile pass writes (category Invoice, raw desc, paid date) */\n"
 "      var cf=window._gcClientInvRow; if(typeof cf!=='function') continue;   /* the reconcile pass posts it within 2 minutes */\n"
 "      var cr=cf(iv); if(!cr.amt) cr.amt=Math.abs(amt);\n"
 "      row=Object.assign(cr,{ vendor:sh.who, payee:sh.who, po:iv.po||'', amount:cr.amt, source:'clientinvoice', method:'payment', direction:'in', isIncome:true });\n"
 "    }")

# ---- 2c. pair 2: EXPENSE_ rows -------------------------------------------------------------------------------
src = once(src,
 "        window._gcAddToRegister({\n"
 "          srcInvId:'EXPENSE_'+(ex.id||''),\n"
 "          pid: ex.pid, type:'expense', category: ex.category||ex.cat||'Expense',\n"
 "          desc: ex.desc||ex.vendor||'Expense',\n"
 "          amt: parseFloat(ex.amt||ex.amount)||0,\n",
 "        var _exAmt = parseFloat(ex.amt||ex.amount)||0;   /* patch DEC2: the row carries amt AND amount (same number) and a status, whoever wrote it */\n"
 "        window._gcAddToRegister({\n"
 "          srcInvId:'EXPENSE_'+(ex.id||''),\n"
 "          pid: ex.pid, type:'expense', category: ex.category||ex.cat||'Expense',\n"
 "          desc: ex.desc||ex.vendor||'Expense',\n"
 "          amt: _exAmt, amount: _exAmt,\n")

src = once(src,
 "    amount: (parseFloat(e.amt!=null?e.amt:e.amount)||0),\n"
 "    desc: e.desc||'',\n"
 "    category: e.cat||e.category||'Other',\n"
 "    pid: e.pid||'',",
 "    amount: (parseFloat(e.amt!=null?e.amt:e.amount)||0),\n"
 "    amt: (parseFloat(e.amt!=null?e.amt:e.amount)||0),                 /* patch DEC2: same fields reconcile step 4 writes, same values */\n"
 "    status: (e.status==='paid'?'paid':'owed'),\n"
 "    desc: e.desc||e.vendor||'Expense',\n"
 "    category: e.category||e.cat||'Expense',\n"
 "    pid: e.pid||'',")

src = once(src,
 "    type: e.type||'expense', isIncome: e.isIncome===true, direction: e.direction||'out', srcInvId: 'EXPENSE_'+(e.id||'')",
 "    type: 'expense', isIncome: e.isIncome===true, direction: e.direction||'out', srcInvId: 'EXPENSE_'+(e.id||'')")

# ---- 2d. one-time migration ---------------------------------------------------------------------------------
MIG = r'''
<script id="gc-patch-dec2">
/* patch DEC2 (migration): existing client-invoice register rows get the agreed format - category "Invoice" / "Change Order",
   the raw invoice desc (no "Client payment: " prefix), date = paid date when paid (sent date while unpaid).
   category, desc and date ONLY - an amount is never touched. Runs once for an admin (flag gc_dec2_regnorm_v1; a localStorage key,
   so it syncs through gc_kv), when the page is idle, a minute after load. One write of the register, as a person's change, then the cloud copy. */
(function(){
'use strict';
var W = window; if (W.__gcDec2Mig) return; W.__gcDec2Mig = 1;
var KEY = 'gcAcctRegister', FLAG = 'gc_dec2_regnorm_v1';
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
function isAdmin(){ try { return !!(W.__gcAuthIsAdmin && W.__gcAuthIsAdmin()); } catch (e) { return false; } }
function lc(v){ return String(v == null ? '' : v).toLowerCase(); }
function flags(on){ try { if (on && W._gcManualNow) W._gcManualNow('normalize register rows'); W.__GC_MANUAL_SAVE__ = on; W.__GC_FORCE_PUSH__ = on; } catch (e) {} }
function eq(a, b){ return String(a == null ? '' : a) === String(b == null ? '' : b); }
async function invoices(){
  var c = W._crm || {}, l = Array.isArray(c.invoices) && c.invoices.length ? c.invoices : (Array.isArray(c.invs) ? c.invs : []);
  if (l.length) return l;
  try { var v = await W.idbGet('invs'); if (Array.isArray(v) && v.length) return v; v = await W.idbGet('invoices'); if (Array.isArray(v)) return v; } catch (e) {}
  return [];
}
/* the plan: [{ row, set }] - set holds only category / desc / date and only where the row differs */
function plan(rows, invs){
  var by = {}, out = [], mk = W._gcClientInvRow;
  (invs || []).forEach(function(iv){ if (iv && iv.id && lc(iv.type) === 'client') by[String(iv.id)] = iv; });
  (rows || []).forEach(function(r){
    if (!r || !r.srcInvId) return;
    var iv = by[String(r.srcInvId)], set = {};
    if (iv && typeof mk === 'function') {
      var w = mk(iv), known = (iv.paid === true || lc(iv.status) === 'paid') ? (iv.paidDate || iv.recvDate || iv.sentDate || iv.date) : (iv.sentDate || iv.date);
      if (lc(r.type) !== 'income' && r.type != null && r.type !== '') return;
      if (!eq(r.category, w.category)) set.category = w.category;
      if (!eq(r.desc, w.desc)) set.desc = w.desc;
      if (known && !eq(r.date, w.date)) set.date = w.date;
    } else {
      if (r.category === 'Client Invoice') set.category = 'Invoice';
      if (/^Client payment: /.test(String(r.desc || ''))) set.desc = String(r.desc).replace(/^Client payment: /, '');
    }
    if (Object.keys(set).length) out.push({ row: r, set: set });
  });
  return out;
}
function cloudCreds(){ return { u: String(lsGet('grayco_sb_url') || '').replace(/\/+$/, ''), k: lsGet('grayco_sb_key') || '' }; }
async function cloudRegister(){
  var c = cloudCreds(); if (!c.u || !c.k) return null;
  try {
    var r = await fetch(c.u + '/rest/v1/gc_kv?key=eq.' + KEY + '&select=value', { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k } });
    if (!r.ok) return null; var j = await r.json();
    return (Array.isArray(j) && j.length && Array.isArray(j[0].value)) ? j[0].value : (Array.isArray(j) && !j.length ? [] : null);
  } catch (e) { return null; }
}
var running = false, waits = 0;
async function run(opts){
  opts = opts || {};
  if (running) return { skipped: 'running' }; running = true;
  try {
    if (lsGet(FLAG) && !opts.force) return { skipped: 'already done' };
    if (!isAdmin() && !opts.force) return { skipped: 'not an admin here' };
    if (typeof W._gcAddToRegister !== 'function' || typeof W._gcClientInvRow !== 'function') return { skipped: 'not ready' };
    var rows = await W.idbGet(KEY), invs = await invoices();
    if (!Array.isArray(rows) || !rows.length) return { skipped: 'register not loaded yet' };
    var P = plan(rows, invs), cl = await cloudRegister();
    if (cl === null && !opts.force) return { skipped: 'not ready (cloud copy not readable yet)' };
    var PC = cl ? plan(cl, invs) : [];   /* the reconcile passes may already have fixed this computer's rows; the cloud copy is what a pull would bring back */
    if (opts.dry) return { plan: P.map(function(p){ return { id: p.row.srcInvId, set: p.set }; }), cloud: PC.length };
    if (P.length || PC.length) {
      /* a person's-change write (manual window): the rows get a fresh stamp, so a pull of an older cloud copy cannot put the old wording
         back, and the cloud copy is written too - otherwise the reconcile passes and the pull would keep trading the two formats */
      flags(true);
      try {
        var fresh = await W.idbGet(KEY); fresh = Array.isArray(fresh) ? fresh : [];
        P = plan(fresh, invs);
        P.forEach(function(p){ Object.assign(p.row, p.set); });   /* category, desc, date only */
        var stamp = new Date().toISOString(), hot = {};
        P.concat(PC).forEach(function(p){ hot[String(p.row.srcInvId)] = 1; });
        /* a row whose content did not change keeps its old stamp (the store restores it), and then the cloud copy ties with it and wins the next pull;
           so every row we normalize also carries a one-word marker - a real change, stamped now, newer than the cloud copy */
        fresh.forEach(function(r){ if (r && r.srcInvId && hot[String(r.srcInvId)]) { r.regNorm = 'dec2'; r.updatedAt = stamp; } });
        {
          await W.idbSet(KEY, fresh);
          try { W._gcRegisterCache = fresh; } catch (e) {}
          try { if (W._gcRegisterFlush) await W._gcRegisterFlush(); } catch (e) {}
          /* the cloud copy: this computer's rows + any row only the cloud has (normalized too), so the push loses nothing and the
             "list got smaller" guard has nothing to object to */
          var have = {};
          fresh.forEach(function(r){ if (r) { if (r._id) have['i' + r._id] = 1; if (r.srcInvId) have['s' + r.srcInvId] = 1; } });
          var build = function(c){
            var only = (c || []).filter(function(r){ return r && !((r._id && have['i' + r._id]) || (r.srcInvId && have['s' + r.srcInvId])); });
            plan(only, invs).forEach(function(p){ Object.assign(p.row, p.set); p.row.regNorm = 'dec2'; p.row.updatedAt = stamp; });
            return fresh.concat(only);
          };
          try { if (W._supaUpsertNow) W._supaUpsertNow(KEY, build(cl)); else if (W._supaUpsert) W._supaUpsert(KEY, build(cl)); } catch (e) {}
          /* the sync layers may merge an older copy back in: look at the cloud copy again, and if it is still the old wording, write it plainly */
          await new Promise(function(r){ ST.call(W, r, 3000); });
          var c2 = await cloudRegister();
          if (c2 && plan(c2, invs).length) {
            var cr = cloudCreds();
            try { await fetch(cr.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: cr.k, Authorization: 'Bearer ' + cr.k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
              body: JSON.stringify({ key: KEY, value: build(c2), updated_at: new Date().toISOString() }) }); } catch (e) {}
          }
          try { if (W._gcRefreshSpend) W._gcRefreshSpend(); } catch (e) {}
        }
      } finally { ST.call(W, function(){ flags(false); }, 2500); }
    }
    if (!opts.force) lsSet(FLAG, new Date().toISOString() + ' ' + P.length + '/' + PC.length);
    try { console.log('[GC] Register normalized (DEC2): ' + P.length + ' row(s) here, ' + PC.length + ' in the cloud copy now use category Invoice, the invoice wording and the paid date.'); } catch (e) {}
    return { changed: P.length, cloud: PC.length };
  } catch (e) { try { console.warn('[GC] DEC2 migration failed', e); } catch (_e) {} return { error: String(e) }; }
  finally { running = false; }
}
W._gcDec2Migrate = run;
function once(){
  if (lsGet(FLAG)) return;
  if (W.__GC_IS_TYPING__ || W.__GC_IS_ACTIVE__ || document.hidden) { if (++waits < 40) ST.call(W, once, 15000); return; }
  if (!isAdmin()) return;
  var go = function(){ run().then(function(r){ if (r && /not ready|not loaded/.test(r.skipped || '') && ++waits < 40) ST.call(W, once, 30000); }); };
  if (W.requestIdleCallback) W.requestIdleCallback(go, { timeout: 10000 }); else ST.call(W, go, 0);
}
ST.call(W, once, 60000);
})();
</script>
'''
src = src.rstrip('\n') + '\n' + MIG
for k in ('id="gc-patch-dec2"', 'window._gcClientInvRow = function', 'function tvOffice('):
    assert src.count(k) == 1, k
open(P, 'w', encoding='utf-8').write(src)
print('patched')
