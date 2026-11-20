#!/usr/bin/env python3
"""patch JAQUIET (owner 11/20, phone: "It lagged into this screen"): when a job is made from an estimate / bid / lead / approval /
schedule, the ⚙ Automations sheet popped up full-screen 0.9 s later, on top of whatever the person was doing, and its option cards
were dark navy (the staff CRM has no navy). Now: no pop-up — a small green note at the bottom says the job was made with its usual
automations, with "⚙ Change" to open the sheet (it goes away by itself after 12 s; nothing waits on it). The sheet, the box and the job
bar are always the light look (white cards, purple accent) on desk and Field."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
MARK = '/* patch JAQUIET */'
if MARK in src: print('already patched'); sys.exit(0)
def rep(old, new):
    global src
    assert src.count(old) == 1, ('not found once', old[:80], src.count(old))
    src = src.replace(old, new)
rep("""  if (!hadBox && ASK[ctx] && Date.now() - lastInput < 20000) ST(function(){ open(pid, { fresh: true, job: p }); }, 900);""",
    """  if (!hadBox && ASK[ctx] && Date.now() - lastInput < 20000) ST(function(){ madeNote(pid, p); }, 900);   """ + MARK)
rep("""function toast(msg){
  try { var t = D.createElement('div'); t.textContent = msg; t.style.cssText = 'position:fixed;bottom:84px;left:50%;transform:translateX(-50%);background:#16a34a;""",
    """/* patch JAQUIET: a new job's note — never a sheet over the screen */
function madeNote(pid, p){
  try {
    var old = D.getElementById('gcja-made'); if (old) old.remove();
    var t = D.createElement('div'); t.id = 'gcja-made'; t.setAttribute('role', 'status');
    t.style.cssText = 'position:fixed;bottom:84px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;background:#16a34a;color:#fff;padding:9px 10px 9px 16px;border-radius:10px;z-index:2147483200;font:700 13px Inter,Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.18);max-width:calc(100vw - 24px);box-sizing:border-box';
    var m = D.createElement('span'); m.textContent = 'Job made with its usual automations.'; t.appendChild(m);
    var b = D.createElement('button'); b.type = 'button'; b.textContent = '⚙ Change';
    b.style.cssText = 'background:#fff;color:#15803d;border:none;border-radius:8px;padding:7px 12px;font:800 13px Inter,Arial,sans-serif;cursor:pointer;min-height:34px;white-space:nowrap';
    b.onclick = function(){ t.remove(); open(pid, { fresh: true, job: p }); };
    t.appendChild(b); D.body.appendChild(t);
    ST(function(){ if (t.parentNode) t.remove(); }, 12000);
  } catch (e) {}
}
function toast(msg){
  try { var t = D.createElement('div'); t.textContent = msg; t.style.cssText = 'position:fixed;bottom:84px;left:50%;transform:translateX(-50%);background:#16a34a;""")
rep("""  var light = st.mode === 'draft' && lightAt(host);""", """  var light = true;   /* patch JAQUIET: no navy in the staff CRM */""")
rep("""b.className = 'gcja-bar' + (field ? '' : ' gcja-light');""", """b.className = 'gcja-bar gcja-light';""")
rep("""  if (lightAt(h1.parentNode)) c.className += ' gcja-light';""", """  c.className += ' gcja-light';""")
rep("""    '@media (max-width:520px){.gcja-grid{grid-template-columns:1fr}""",
    """    '.gcja-ov{background:rgba(15,23,42,.35)}.gcja-sheet{background:#fff;border-color:#e2e8f0;color:#0f172a}.gcja-sheet h2{color:#0f172a}.gcja-sheet .gcja-note{color:#475569}.gcja-cancel{border-color:#cbd5e1;color:#334155}' +
    '.gcja-tabs button{background:#f8fafc;border-color:#cbd5e1;color:#1e293b}' +
    '@media (max-width:520px){.gcja-grid{grid-template-columns:1fr}""")
open(P, 'w', encoding='utf-8').write(src); print('patched')
