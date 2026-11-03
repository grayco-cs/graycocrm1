#!/usr/bin/env python3
"""patch F941ACK (owner 11/03: "do whatever I can to get those errors off" on the Form 941 worksheet):
 - old unpaid drafts / denied runs in the quarter are retired automatically when the worksheet opens (the PAYREPLACE
   rule: an unpaid line of someone with a paid check, dated on/before the cutoff, is dropped; a copy is kept);
 - "No approved payroll was paid in <month>" gets a button "✓ Nobody was paid in <month>" — stored per month in
   payroll settings (f941NoPayMonths), then shown as a blue note instead of a red warning;
 - "No deposits recorded" + "Line 13 ≠ line 12" get a button "✓ No deposits were made — we're paying the balance now"
   (f941PayLater[YYYY-Qn]) → one blue note with the balance due and how to pay / record it.
Edits index.html + tools/f941_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'f941_tail.js')]
MARK = '/* patch F941ACK'
R = [
 ("  qi.months.forEach(function(m,i){ if(!month[m].checks) warn.push(",
  "  var _np=(Array.isArray(set.f941NoPayMonths)?set.f941NoPayMonths:[]), nopayAsk=[];   /* patch F941ACK */\n"
  "  qi.months.forEach(function(m,i){ if(!month[m].checks && _np.indexOf(m)>=0){ info.push('No payroll in '+MONTHS[+m.slice(5,7)-1]+' '+m.slice(0,4)+' — marked “nobody was paid that month”.'); return; } if(!month[m].checks) nopayAsk.push(m); if(!month[m].checks) warn.push("),
 ("  if(!deps.some(function(d){return d.counted;}) && L.L12>0) warn.push(",
  "  var _pl=!!(set.f941PayLater && set.f941PayLater[qi.year+'-Q'+qi.q]) && !deps.some(function(d){return d.counted;});   /* patch F941ACK */\n"
  "  if(_pl) info.push('No deposits were made this quarter — the balance due '+money(L.L14)+' (line 14) is being paid now. Pay it on EFTPS (or a same-day wire / an IRS-approved card processor), then record it: Payroll → Withholding & Taxes → record a payment, type “Federal 941 deposit”.');\n"
  "  if(!_pl && !deps.some(function(d){return d.counted;}) && L.L12>0) warn.push("),
 ("  if(Math.abs(L.L13-L.L12)>=0.01) warn.push(",
  "  if(!_pl && Math.abs(L.L13-L.L12)>=0.01) warn.push("),
 ("    futa:futa, suta:suta, erPaysEE:r2(T.erPaysEE), warnings:warn, info:info, ssBase:ssBase, checks:T.checks };",
  "    futa:futa, suta:suta, erPaysEE:r2(T.erPaysEE), warnings:warn, info:info, ssBase:ssBase, checks:T.checks, nopayAsk:nopayAsk, payLaterAsk:(!_pl && !deps.some(function(d){return d.counted;}) && L.L12>0) };"),
 ("  var d=await load(), R;\n",
  "  var d=await load(), R;\n"
  "  /* patch F941ACK: retire old unpaid drafts of people who have paid checks (copy kept), then reload */\n"
  "  try{ if(W._gcPayReplace){ var _em={}; (d.runs||[]).forEach(function(r){ if(r && ['paid','approved'].indexOf(s(r.status))>=0) (r.lines||[]).forEach(function(L){ var k=String(L.empId||L.name||''); if(k) _em[k]={ empId:k, name:L.name }; }); });\n"
  "    var _rp=await W._gcPayReplace(Object.keys(_em).map(function(k){ return _em[k]; })); if(_rp && _rp.changed) d=await load(); } }catch(_rpE){}\n"),
 ("    + R.warnings.map(function(w){ return '<div data-f941-warn=\"1\" style=\"'+RED+'\">⚠ '+esc(w)+'</div>'; }).join('')\n",
  "    + R.warnings.map(function(w){ return '<div data-f941-warn=\"1\" style=\"'+RED+'\">⚠ '+esc(w)+'</div>'; }).join('')\n"
  "    + ((R.nopayAsk&&R.nopayAsk.length)||R.payLaterAsk ? ('<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin:-2px 0 10px\">'   /* patch F941ACK */\n"
  "      + (R.nopayAsk||[]).map(function(mk){ return '<button data-f941-nopay=\"'+esc(mk)+'\" style=\"'+BTN+'\">✓ Nobody was paid in '+esc(MONTHS[+mk.slice(5,7)-1])+'</button>'; }).join('')\n"
  "      + (R.payLaterAsk?'<button data-f941-paylater=\"1\" style=\"'+BTN+'\">✓ No deposits were made — we’re paying the balance now</button>':'')+'</div>') : '')\n"),
 ("  var ppb=body.querySelector('[data-f941-past]'); if(ppb) ppb.onclick=function(){ W._gcPastPayOpen(); };",
  "  var ppb=body.querySelector('[data-f941-past]'); if(ppb) ppb.onclick=function(){ W._gcPastPayOpen(); };\n"
  "  /* patch F941ACK: the two acknowledgements, saved in payroll settings */\n"
  "  async function _ack(fn){ try{ var p=P(), st=(await p.settings())||{}; fn(st); await p.saveSettings(st); }catch(e){ alert('Could not save: '+(e&&e.message)); return; } render(body); }\n"
  "  Array.prototype.forEach.call(body.querySelectorAll('[data-f941-nopay]'), function(b){ b.onclick=function(){ var mk=b.getAttribute('data-f941-nopay'); if(!confirm('Nobody at all was paid wages in '+MONTHS[+mk.slice(5,7)-1]+' '+mk.slice(0,4)+'?')) return; _ack(function(st){ var a=Array.isArray(st.f941NoPayMonths)?st.f941NoPayMonths:[]; if(a.indexOf(mk)<0) a.push(mk); st.f941NoPayMonths=a; }); }; });\n"
  "  var plb=body.querySelector('[data-f941-paylater]'); if(plb) plb.onclick=function(){ if(!confirm('No 941 deposits were made for Q'+UI.sel.q+' '+UI.sel.year+', and you are paying the balance now?')) return; _ack(function(st){ st.f941PayLater=Object.assign({}, st.f941PayLater||{}); st.f941PayLater[UI.sel.year+'-Q'+UI.sel.q]=new Date().toISOString(); }); };"),
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
print('patched F941ACK (%d file(s))' % done if done else 'already patched')
