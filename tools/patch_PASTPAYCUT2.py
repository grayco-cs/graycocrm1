#!/usr/bin/env python3
"""patch PASTPAYCUT2 (owner 11/03: "after 11/3 i still want to edit them if i can but yes real rules after that"):
after the cutoff a check STARTS on the CRM formulas (W-4), but can still be edited: the tax choices are no longer locked,
📄 Stub shows again, and a typed amount that differs from the formula gets a yellow "changed from the formula" note.
On/before the cutoff nothing changes (rows start on the paper amounts). Edits index.html + tools/pastpay_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'pastpay_tail.js')]
MARK = '/* patch PASTPAYCUT2'
R = [
 ("    if(_after){ fm='calc'; xm='calc'; r.fedMode='calc'; r.ficaMode='calc'; out.note.push('Paid after '+_cut+': the CRM formulas are used (from the W-4 on file). Checks paid on or before '+_cut+' are typed from the paper.'); }\n",
  "    /* patch PASTPAYCUT2: after the cutoff the formulas are the starting point — still editable, flagged when changed */\n"
  "    if(_after && (fm!=='calc' || xm!=='calc' || (r.stMode && r.stMode!=='calc'))) out.warn.push('Paid after '+_cut+': changed from the CRM formula — make sure the check matches what you typed.');\n"),
 ("    if(_after){ sm='calc'; r.stMode='calc'; }   /* patch PASTPAYCUT */\n", ""),
 ("['fedMode','ficaMode','stMode'].forEach(function(k){ var el=tr.querySelector('[data-k=\"'+k+'\"]'); if(el){ el.disabled=_aft; if(_aft) el.value='calc'; } }); var _sb=tr.querySelector('[data-stub]'); if(_sb) _sb.style.display=_aft?'none':'';   /* patch PASTPAYCUT */",
  "/* patch PASTPAYCUT2: nothing locked after the cutoff */"),
 ("Checks after 11/3 always use the CRM formulas from the W-4.",
  "Checks after 11/3 start on the CRM formulas from the W-4 — you can still change them, and a change is flagged."),
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
print('patched PASTPAYCUT2 (%d file(s))' % done if done else 'already patched')
