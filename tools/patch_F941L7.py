#!/usr/bin/env python3
"""patch F941L7 (owner 11/04: Line 7 −$0.14 still red after every check was corrected): the cents come from paying
salary and commission as separate checks that are entered on one row (each real check rounds its own Social Security /
Medicare), so the CRM counts fewer checks than were written. The warning gets a button "✓ This is rounding from separate
checks — file it": stored per quarter WITH the exact amount (f941L7Ok['YYYY-Qn'] = L7). Then it shows as a blue note;
if Line 7 changes later, the red warning comes back. Only offered up to $1.00. Edits index.html + tools/f941_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'f941_tail.js')]
MARK = '/* patch F941L7'
R = [
 ("  if(Math.abs(L.L7)>tolL7) warn.push(",
  "  var _l7k=qi.year+'-Q'+qi.q, _l7ok=!!(set.f941L7Ok && set.f941L7Ok[_l7k]!=null && Math.abs(n2(set.f941L7Ok[_l7k])-L.L7)<0.005), l7Ask=false;   /* patch F941L7 */\n"
  "  if(Math.abs(L.L7)>tolL7 && _l7ok) info.push('Line 7 is '+money(L.L7)+' — marked as rounding from salary and commission paid as separate checks. That is what line 7 is for.');\n"
  "  if(Math.abs(L.L7)>tolL7 && !_l7ok && Math.abs(L.L7)<=1) l7Ask=true;\n"
  "  if(Math.abs(L.L7)>tolL7 && !_l7ok) warn.push("),
 ("payLaterAsk:(!_pl && !deps.some(function(d){return d.counted;}) && L.L12>0) };",
  "payLaterAsk:(!_pl && !deps.some(function(d){return d.counted;}) && L.L12>0), l7Ask:l7Ask, l7:L.L7 };"),
 ("    + ((R.nopayAsk&&R.nopayAsk.length)||R.payLaterAsk ? (",
  "    + ((R.nopayAsk&&R.nopayAsk.length)||R.payLaterAsk||R.l7Ask ? ("),
 ("      + (R.payLaterAsk?'<button data-f941-paylater=\"1\" style=\"'+BTN+'\">✓ No deposits were made — we’re paying the balance now</button>':'')+'</div>') : '')",
  "      + (R.payLaterAsk?'<button data-f941-paylater=\"1\" style=\"'+BTN+'\">✓ No deposits were made — we’re paying the balance now</button>':'')\n"
  "      + (R.l7Ask?'<button data-f941-l7ok=\"1\" style=\"'+BTN+'\">✓ Line 7 is rounding from separate checks — file it</button>':'')+'</div>') : '')"),
 ("  var plb=body.querySelector('[data-f941-paylater]'); if(plb)",
  "  var l7b=body.querySelector('[data-f941-l7ok]'); if(l7b) l7b.onclick=function(){ var v=UI.last&&UI.last.l7; if(!confirm('Every check is entered exactly as paid, and Line 7 ('+money(v)+') is just the cents from checks paid separately?')) return; _ack(function(st){ st.f941L7Ok=Object.assign({}, st.f941L7Ok||{}); st.f941L7Ok[UI.sel.year+'-Q'+UI.sel.q]=v; }); };   /* patch F941L7 */\n"
  "  var plb=body.querySelector('[data-f941-paylater]'); if(plb)"),
]
done = 0
for P in FILES:
    t = open(P, encoding='utf-8').read()
    if MARK in t: continue
    for a, b in R:
        n = t.count(a)
        if n != 1: print('anchor count', n, 'in', P, 'for', a[:90]); sys.exit(1)
        t = t.replace(a, b)
    open(P, 'w', encoding='utf-8').write(t); done += 1
print('patched F941L7 (%d file(s))' % done if done else 'already patched')
