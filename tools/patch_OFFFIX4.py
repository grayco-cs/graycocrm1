#!/usr/bin/env python3
"""Idempotent patch OFFFIX4 (office audit, 10/30; coordinator: "gate jobs"): deleting or merging a whole job stays with the admins.

The owner gave the office the whole CRM except staff access, security and the destructive tools. The audit found the
office could still delete a job (Projects row 🗑 → "Delete this job? … removed for good on every computer"), merge two
jobs (⊕ Merge Jobs: the duplicate is deleted for good) and merge draw invoices (🧾 Merge Draw Invoices: the other drafts
are dropped, no undo). For the office (window._gcIsOfficeFull(), patch OFFICEFULL) these are now hidden AND refused when
called directly:
  * window._gcAskDeleteJob (the job bin's confirm box, used by window._gcDeleteProject) → refused, nothing deleted;
  * window._openMergeJobs (⊕ Merge Jobs), window._gcOpenMergeProjects, window._gcMergeDuplicateJobs (not its silent
    automatic run) → refused;
  * window._gcOpenDrawMerge, window._gcMergeDrawInvoices, window._gcMergeDrawSet → refused;
  * the Projects 🗑 (the row bin, the card bin [data-gcx-del], the hover bin), #gc-merge-btn and #_invMergeBtn are
    hidden (html.gc-offno).
Single-record deletes (an invoice, an expense, a lead → 30-day Recycle bin, a vendor) stay hers. Admins are unchanged.
Feature-detected, order-free: a small script at the end of the page wraps whatever of those exists (also after patch
PROJLEAK, which shows Merge Jobs to "admins and office"); the class is refreshed on each screen change and click — no
timers, no polling. Kill switch: localStorage gc_offfix4_off = '1'.
Usage: python3 tools/patch_OFFFIX4.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '<script id="gc-patch-offfix4">'
if MARK in t:
    print('OFFFIX4: already patched'); sys.exit(0)

JS = MARK + r"""
/* patch OFFFIX4 (office audit 10/30): deleting or merging a whole job (and merging draw invoices, which drops the other
   drafts for good) stays with Wesley and Nick. The office: hidden and refused. Single-record deletes are unchanged. */
(function(){
'use strict';
if (window.__GC_OFFFIX4__) return; window.__GC_OFFFIX4__ = true;
var W = window, D = document;
try { if (localStorage.getItem('gc_offfix4_off') === '1') return; } catch (e) {}
var SAY = 'Deleting or merging a whole job is for Wesley or Nick. Ask them, or flag it for review.';
function office(){ try { return typeof W._gcIsOfficeFull === 'function' && !!W._gcIsOfficeFull(); } catch (e) { return false; } }
function say(){ try { if (typeof W._toast === 'function') { W._toast(SAY); return; } } catch (e) {} try { alert(SAY); } catch (e) {} }
function mark(){ try { var on = office(); var h = D.documentElement; if (h.classList.contains('gc-offno') !== on) h.classList.toggle('gc-offno', on); } catch (e) {} }
var css = D.createElement('style'); css.id = 'gc-offfix4-css';
css.textContent = 'html.gc-offno ._gcRowX,html.gc-offno ._gcRowX[data-gcx],html.gc-offno [data-del-job],html.gc-offno [data-gcx-del],html.gc-offno #gcx-binfloat,html.gc-offno #gc-merge-btn,html.gc-offno #_invMergeBtn{display:none!important}';
(D.head || D.documentElement).appendChild(css);
/* wrap a window function: the office is refused; a function defined or replaced later is wrapped on the next screen change */
function guard(name, refuse){
  var f = W[name]; if (typeof f !== 'function' || f.__gcOff4) return;
  var w = function(){ if (office() && refuse.apply(this, arguments)) { say(); return name === '_gcAskDeleteJob' ? Promise.resolve(false) : false; } return f.apply(this, arguments); };
  try { Object.keys(f).forEach(function(k){ w[k] = f[k]; }); } catch (e) {}
  w.__gcOff4 = true; W[name] = w;
}
function always(){ return true; }
function wrapAll(){
  guard('_gcAskDeleteJob', always);
  guard('_openMergeJobs', always);
  guard('_gcOpenMergeProjects', always);
  guard('_gcMergeDuplicateJobs', function(silent){ return !silent; });
  guard('_gcOpenDrawMerge', always);
  guard('_gcMergeDrawInvoices', always);
  guard('_gcMergeDrawSet', always);
}
wrapAll(); mark();
/* each screen change (window._setView) and each click: the class follows who is signed in; late definitions get wrapped */
var sv = W._setView;
if (typeof sv === 'function' && !sv.__gcOff4) { var w = function(){ var r = sv.apply(this, arguments); try { wrapAll(); mark(); } catch (e) {} return r; }; try { Object.keys(sv).forEach(function(k){ w[k] = sv[k]; }); } catch (e) {} w.__gcOff4 = true; W._setView = w; }
D.addEventListener('pointerdown', function(){ mark(); }, true);
D.addEventListener('click', function(ev){
  var t = ev.target; if (!t || !t.closest) return;
  var b = t.closest('._gcRowX,[data-del-job],[data-gcx-del],#gcx-binfloat,#gc-merge-btn,#_invMergeBtn'); if (!b) return;
  wrapAll(); mark(); if (!office()) return;
  ev.preventDefault(); ev.stopImmediatePropagation(); say();
}, true);
W._gcOffFix4 = { office: office, mark: mark, wrap: wrapAll };
})();
</script>
"""
assert t.rstrip().endswith('</script>'), 'OFFFIX4: page end'
t = t.rstrip() + '\n' + JS
open(p, 'w', encoding='utf-8').write(t)
print('OFFFIX4: patched ' + p)
