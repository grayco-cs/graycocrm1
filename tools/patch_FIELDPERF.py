#!/usr/bin/env python3
"""Idempotent patch FIELDPERF: GrayCo Field's Home stops recomputing the same numbers several times a second.

The owner's iPhone (11/03, iOS 18.7 Safari, admin, Field Home): "the Home page is lagging". Profiled in the offline
harness on the real-data mirror (iPhone 390x844, touch, CPU throttled 5x, localStorage capped at Safari's ~2.75 M
characters): the Home screen's own figures were rebuilt on every short timer even when no data had changed.

1. The approval set (gc-fix-apprset: window._gcApprovalSet — the ✅ badge, "My approvals", the To-Do chip, the
   admin's Approvals tile) was cached for only 800 ms, while about ten timers (700 ms - 1.5 s) ask for it; each rebuild
   parses gc_email_queue / gc_sub_approvals from localStorage, walks every invoice x every project, the expense list,
   the material requests and the lead-assign rows (the biggest single JavaScript cost on the Home: ~2.3 s per minute
   at 5x). Now the cached set is reused for up to 5 s while its inputs are the same objects / the same text
   (projects, invoices, To-Do's last approval rows, gc_email_queue, gc_sub_approvals, gc_expense_approvals, the person,
   👁 View as…); any change there rebuilds it at once, and _gcApprovalSetFresh() still drops it (approve in place,
   a forced repaint).
2. ROLEAPPS' sync (every 900 ms) rebuilt the Home's quick buttons (their counts) and the admin's "All jobs" list
   (30 cards, each with its 4 portal / photos / message buttons) as HTML every tick, only to find it unchanged. The
   two HTML strings are now kept for up to 3 s while the role, the projects / leads / invoices lists, the approval
   count and 👁 View as… are the same; any of those changing rebuilds them at once (the DOM was, and is, only touched
   when the HTML differs).
3. GrayCo Field's "This week" figures (patch A8 tvNumbers: every lead, invoice and payment) are reused for up to 10 s
   while the leads / invoices / projects lists are the same objects.
Nothing on screen changes: same sections, same numbers, same buttons. Kill switch: localStorage gc_fieldperf_off = '1'
(this device) -> every figure is rebuilt each time, as before.
Usage: python3 tools/patch_FIELDPERF.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_FIELDPERF__'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

OFF = "(function(){ try { return localStorage.getItem('gc_fieldperf_off') === '1'; } catch (e) { return false; } })()"

# 1. the approval set: reused while its inputs are unchanged (at most 5 s)
A1 = "  function current(){ if (memo && Date.now() - memo.at < 800) return memo; memo = window._gcApprovalSet(); return memo; }\n"
src = once(src, A1,
  "  /* patch FIELDPERF (" + MARK + "): about ten timers ask for this set every 0.7-1.5 s; rebuilding it walks every invoice x\n"
  "     project and parses the approval queues. Reused for up to 5 s while its inputs are the same objects / text;\n"
  "     any change rebuilds it at once (Off: localStorage gc_fieldperf_off = '1'). */\n"
  "  var FPOFF = " + OFF + ", memoIn = null;\n"
  "  function memoInputs(){\n"
  "    var c = window._crm || {}, g = function(k){ try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, v = '';\n"
  "    try { v = window._gcVAS && window._gcVAS.active() ? String(window._gcVAS.label()) : ''; } catch (e) {}\n"
  "    return [c.projects, c.invoices, c.users, window._gcTD2 && window._gcTD2.__lastItems, g('gc_email_queue'), g('gc_sub_approvals'), g('gc_expense_approvals'), g('grayco_user'), v];\n"
  "  }\n"
  "  function sameIn(a, b){ if (!a || !b || a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }\n"
  "  function current(){\n"
  "    var now = Date.now(); if (memo && now - memo.at < 800) return memo;\n"
  "    var inp = FPOFF ? null : memoInputs();\n"
  "    if (memo && inp && now - memo.at < 5000 && sameIn(inp, memoIn)) return memo;\n"
  "    memo = window._gcApprovalSet(); memoIn = inp; return memo;\n"
  "  }\n")
A1b = "  window._gcApprovalSetFresh = function(){ memo = null; };   /* patch APPRCOUNT */\n"
src = once(src, A1b, "  window._gcApprovalSetFresh = function(){ memo = null; memoIn = null; };   /* patch APPRCOUNT */   /* patch FIELDPERF */\n")

# 2. ROLEAPPS: the Home's quick buttons + admin "All jobs" HTML kept while nothing they show changed (at most 3 s)
A2 = "    var th = fieldTop(a), bh = fieldBottom(a);\n"
src = once(src, A2,
  "    /* patch FIELDPERF: built at most every 3 s while the role, the lists and the approval count are the same */\n"
  "    var fk = fpKey(a), th, bh;\n"
  "    if (FPH && fk && FPH.k.length === fk.length && FPH.k.every(function(x, i){ return x === fk[i]; }) && Date.now() - FPH.at < 3000) { th = FPH.th; bh = FPH.bh; }\n"
  "    else { th = fieldTop(a); bh = fieldBottom(a); FPH = fk ? { k: fk, th: th, bh: bh, at: Date.now() } : null; }\n")
A2b = "var homeObs = null, homeEl = null, injecting = false;\n"
src = once(src, A2b,
  A2b +
  "/* patch FIELDPERF: what the Home's quick buttons and the admin's job cards are made from */\n"
  "var FPH = null, FPOFF = " + OFF + ";\n"
  "function fpKey(a){\n"
  "  if (FPOFF) return null;\n"
  "  var c = C(), v = '', n = null; try { v = vas(); } catch (e) {} try { n = apprCount(); } catch (e) {}\n"
  "  var fj = null; try { fj = typeof W._gcFPJobs === 'function' ? W._gcFPJobs : null; } catch (e) {}\n"
  "  return [a, mode(a), c.projects, c.leads, c.invoices, c.users, c.schedule, W.__gcLeadsLive, fj, v, n, myName()];\n"
  "}\n")

# 3. GrayCo Field "This week": tvNumbers reused for up to 10 s while the lists are the same objects
A3 = "function scoreNums(){ try { var v = W._gcA8 && W._gcA8.tvNumbers ? W._gcA8.tvNumbers() : null;"
src = once(src, A3,
  "/* patch FIELDPERF: the week's figures walk every lead, invoice and payment — reused for up to 10 s while the lists are the same */\n"
  "var SNC = null, SNOFF = " + OFF + ";\n"
  "function scoreNums(){ var c = C(), k = [c.leads, c.invoices, c.projects, c.payments, W.__gcLeadsLive];\n"
  "  if (!SNOFF && SNC && Date.now() - SNC.at < 10000 && SNC.k.every(function(x, i){ return x === k[i]; })) return SNC.v;\n"
  "  var r = scoreNums0(); if (!SNOFF) SNC = { k: k, v: r, at: Date.now() }; return r; }\n"
  "function scoreNums0(){ try { var v = W._gcA8 && W._gcA8.tvNumbers ? W._gcA8.tvNumbers() : null;")

open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDPERF')
