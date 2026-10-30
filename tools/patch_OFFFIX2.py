#!/usr/bin/env python3
"""Idempotent patch OFFFIX2 (office audit, 10/30): small things the office clicks in 📊 Accounting that gave no answer.

  1. Accounting → ✅ To Match → "Approve…" (patch APPRINPLACE) approves the expense in place, but its "Approved → P&L"
     message never showed: it called window.showToast, which does not exist (the page's toast is window._toast). Now the
     message shows. (Skipped with a note when APPRINPLACE's toast was already changed upstream.)
  2. Accounting → To Match → "↻ Re-check duplicates" looked dead: it read the lists again and redrew the same screen
     with no word. Now the button says "Checking…" while it reads, and a short message says it is done.
  3. Accounting → 🏠 Home → 💵 Cash today said "Owners only." to the office, who has it too (patch OFFICEFULL): it now
     says "Owners and the office only."
No timers, no polling. Usage: python3 tools/patch_OFFFIX2.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch OFFFIX2'
if MARK in t:
    print('OFFFIX2: already patched'); sys.exit(0)
def once(a, b):
    global t
    n = t.count(a); assert n == 1, ('OFFFIX2 anchor', n, a[:90]); t = t.replace(a, b)

# 1. APPRINPLACE's toast
OLD1 = "function toast(m){ try { if (typeof W.showToast === 'function') { W.showToast(m); return; } } catch (e) {} }\n"
if t.count(OLD1) == 1:
    t = t.replace(OLD1, "function toast(m){ try { if (typeof W.showToast === 'function') { W.showToast(m); return; } } catch (e) {} try { if (typeof W._toast === 'function') W._toast(m); } catch (e) {} }   "
                  + MARK + ": the page's toast is window._toast */\n")
else:
    assert t.count(OLD1) == 0, ('OFFFIX2 anchor 1', t.count(OLD1))
    print('OFFFIX2: step 1 skipped (APPRINPLACE toast already changed)')

# 2. Re-check duplicates: say it is working, then that it is done
once("    case 'reload': return loadExtras().then(render);",
     "    case 'reload': if(el){ el.disabled=true; el.textContent='↻ Checking…'; } return loadExtras().then(render).then(function(){ try{ if(typeof window._toast==='function') window._toast('✓ Checked again — the list is up to date'); }catch(e){} });   "
     + MARK + ": an answer for Re-check duplicates */")

# 3. Cash today: who sees it
once('<div class="gck-sub">Owners only. Bank and card balances', '<div class="gck-sub">Owners and the office only. Bank and card balances')
open(p, 'w', encoding='utf-8').write(t)
print('OFFFIX2: patched ' + p)
