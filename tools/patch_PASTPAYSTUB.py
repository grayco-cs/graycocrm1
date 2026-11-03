#!/usr/bin/env python3
"""patch PASTPAYSTUB (owner 11/03: past checks kept showing CRM 'as calculated' numbers instead of what was paid):
each row gets a '📄 Stub' button. One tap sets Federal, Social Security / Medicare and State tax to 'amount on the check
stub', empties them and puts the cursor in Federal, so the paper's numbers are typed straight in. A hint says so.
Edits index.html + tools/pastpay_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'pastpay_tail.js')]
MARK = '/* patch PASTPAYSTUB'
R = [
 ("        +'<td style=\"padding:3px\"><button data-rm=\"'+i+'\" style=\"border:none;background:#fee2e2;color:#b91c1c;border-radius:5px;padding:4px 8px;cursor:pointer\">✕</button></td></tr>'",
  "        +'<td style=\"padding:3px;white-space:nowrap\"><button data-stub=\"'+i+'\" title=\"Already paid: type every tax from the paper\" style=\"border:1px solid #16a34a;background:#f0fdf4;color:#166534;border-radius:5px;padding:4px 8px;cursor:pointer;font-weight:800;margin-right:4px\">📄 Stub</button><button data-rm=\"'+i+'\" style=\"border:none;background:#fee2e2;color:#b91c1c;border-radius:5px;padding:4px 8px;cursor:pointer\">✕</button></td></tr>'"),
 ("  ov.addEventListener('click', function(e){ var b=e.target.closest&&e.target.closest('[data-rm]'); if(!b) return; rows.splice(+b.getAttribute('data-rm'),1); draw(); later(); });",
  "  ov.addEventListener('click', function(e){ var b=e.target.closest&&e.target.closest('[data-rm]'); if(!b) return; rows.splice(+b.getAttribute('data-rm'),1); draw(); later(); });\n"
  "  /* patch PASTPAYSTUB: one tap = every tax on this row comes from the paper */\n"
  "  ov.addEventListener('click', function(e){ var b=e.target.closest&&e.target.closest('[data-stub]'); if(!b) return; var i=+b.getAttribute('data-stub'), r=rows[i]; if(!r) return;\n"
  "    r.fedMode='stub'; r.ficaMode='stub'; r.fed=''; r.ss=''; r.med=''; if((s(r.st)||'TN').toUpperCase()!=='TN'){ r.stMode='stub'; r.stw=''; } r.netTyped=false; r.net='';\n"
  "    draw(); later(); setTimeout(function(){ var f=ov.querySelector('tr[data-row=\"'+i+'\"] [data-k=\"fed\"]'); if(f){ f.focus(); try{ f.scrollIntoView({block:'center'}); }catch(_e){} } }, 50); });"),
 ("Then open 🧾 Form 941.</div></div>'",
  "Then open 🧾 Form 941.<br><b style=\"color:#166534\">Check already paid? Tap 📄 Stub on its row and type Federal, SS, Medicare and State from the paper. Paid salary and commission as two checks? Make two rows with the same pay date.</b></div></div>'"),
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
print('patched PASTPAYSTUB (%d file(s))' % done if done else 'already patched')
