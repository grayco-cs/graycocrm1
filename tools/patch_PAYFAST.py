#!/usr/bin/env python3
"""Idempotent patch PAYFAST: the owner's laptop froze 3.7 s at a time, back to back, on every screen.

Measured on that laptop (patch PERFREP, 29 stalls in 14 min): 95% of the frozen time was money() inside the
payroll engine's computeLine, run by the automatic payroll draft (AUTOPAY build) — every 4 minutes and after every
clock-in, for every employee, on whatever screen was open. money() is Number#toLocaleString with options, which
builds a new number formatter on every call; on that browser each one was very slow.

1. Number#toLocaleString keeps one Intl.NumberFormat per (locale, options) and reuses it — the same text out, by
   the language spec (toLocaleString is defined as a NumberFormat with those arguments). Every one of the ~360
   money/number formats in the CRM gets faster at once. Off on a computer: localStorage gc_payfast_off = '1'.
2. The automatic payroll draft recalculates in the background at most once an hour (it still recalculates at
   once while the Payroll screen is open, and Calculate / _gcAutoPayroll() always run now)."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '<script id="gc-patch-payfast">'
if MARK in t: print('PAYFAST: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('PAYFAST anchor count != 1', n, old[:90])
    t = t.replace(old, new)

FAST = MARK + r"""
/* patch PAYFAST: Number#toLocaleString reuses one Intl.NumberFormat per (locale, options) */
(function(){
'use strict';
try { if (localStorage.getItem('gc_payfast_off') === '1') return; } catch (e) {}
if (typeof Intl !== 'object' || typeof Intl.NumberFormat !== 'function' || Number.prototype.toLocaleString.__gcFast) return;
var orig = Number.prototype.toLocaleString, cache = new Map(), MAX = 300;
function keyOf(loc, opt){
  var l = loc == null ? '' : (Array.isArray(loc) ? loc.join(',') : String(loc));
  if (opt == null) return l + '|';
  if (typeof opt !== 'object') return null;
  var k = l + '|', names = Object.keys(opt).sort();
  for (var i = 0; i < names.length; i++) { var v = opt[names[i]]; if (v !== undefined && typeof v === 'object') return null; k += names[i] + '=' + String(v) + ';'; }
  return k;
}
var fast = function toLocaleString(loc, opt){
  try {
    if (typeof this !== 'number' && !(this instanceof Number)) return orig.apply(this, arguments);
    var k = keyOf(loc, opt); if (k === null) return orig.apply(this, arguments);
    var f = cache.get(k);
    if (!f) { f = new Intl.NumberFormat(loc, opt); if (cache.size >= MAX) cache.clear(); cache.set(k, f); }
    return f.format(Number(this));
  } catch (e) { return orig.apply(this, arguments); }
};
fast.__gcFast = true;
try { Object.defineProperty(Number.prototype, 'toLocaleString', { value: fast, writable: true, configurable: true, enumerable: false }); } catch (e) {}
})();
</script>
"""
anchor = '<script id="gc-patch-perfclick-watch">'
assert t.count(anchor) == 1
t = t.replace(anchor, FAST + anchor)

once("""async function refresh(force){
  var P = window.__GC_PAY;
  if(!P) return null;
  try{
    if(!force){
      if(document.hidden) return null;
      if(window.__GC_FORM_OPEN__ || window.__GC_IS_TYPING__) return null;
    }""",
"""var _bgAt = Date.now();   /* patch PAYFAST: the background draft runs at most once an hour (not at start-up) */
async function refresh(force){
  var P = window.__GC_PAY;
  if(!P) return null;
  try{
    if(!force){
      if(document.hidden) return null;
      if(window.__GC_FORM_OPEN__ || window.__GC_IS_TYPING__) return null;
      var _onPay = !!document.getElementById('gc-payroll-mount');
      if(!_onPay && Date.now() - _bgAt < 3600e3) return null;
      _bgAt = Date.now();
    }""")

open(p, 'w', encoding='utf-8').write(t)
print('PAYFAST: patched', p)
