#!/usr/bin/env python3
"""patch F941 — 🧾 Form 941 worksheet (read-only), Payroll tab + a "📄 Form 941 numbers" button on the tax calendar.
usage: python3 tools/patch_F941.py [index.html]      (in place; idempotent: a patched file is left as it is)
  1. Payroll page: a "🧾 Form 941" tab for admins / owners (P.isAdmin)
  2. the tab renders window._gcF941Render (tools/f941_tail.js)
  3. Tax calendar: the "Form 941 — quarterly federal payroll return" row (id 941q) gets a "📄 Form 941 numbers" button
  4. tools/f941_tail.js after the last </script>: the worksheet (every 941 line, Part 2, payroll register, FUTA / SUTA
     estimates, Copy / CSV), "📄 Filled Form 941 (PDF)" (forms/f941-2026.pdf filled with pdf-lib from cdnjs), and the
     quarterly ✅ Approvals item for owners + the office (gc_payroll_approvals, one record per quarter: approve optional,
     Mark filed with date + confirmation; automation key f941_quarter_prep, default ON).
Nothing is written to payroll data; nothing is sent to the IRS."""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
t = open(path, encoding='utf-8').read()
if '__GC_F941__' in t:
    print('already patched (F941) — nothing changed'); sys.exit(0)

def rep(a, b, n=1):
    global t
    c = t.count(a)
    assert c == n, (c, n, a[:100])
    t = t.replace(a, b)

# 1. the tab (admins / owners only)
rep("""['employees','Employees'],['withholding','Withholding & Taxes'],['settings','Settings']];""",
    """['employees','Employees'],['withholding','Withholding & Taxes'],['settings','Settings']].concat((P.isAdmin()&&window._gcF941Render)?[['f941','🧾 Form 941']]:[]);   /* patch F941 */""")
# 2. its body
rep("""  if(S.tab==='settings')     return renderSettings(body);
}
window._gcPayrollRender = render;""",
    """  if(S.tab==='settings')     return renderSettings(body);
  if(S.tab==='f941')         return window._gcF941Render ? window._gcF941Render(body) : null;   /* patch F941 */
}
window._gcPayrollRender = render;""")
# 3. the tax calendar's Form 941 row
rep("""    + '<td>' + (it.link ? '<a href="' + esc(it.link) + '" target="_blank" rel="noopener">' + esc(it.link.replace(/^https:\\/\\//, '').split('/')[0]) + ' ›</a>' : '') + '</td>'""",
    """    + '<td>' + (it.link ? '<a href="' + esc(it.link) + '" target="_blank" rel="noopener">' + esc(it.link.replace(/^https:\\/\\//, '').split('/')[0]) + ' ›</a>' : '') + ((it.id === '941q' && window._gcF941CanSee && window._gcF941CanSee()) ? '<div><button type="button" class="gctx-btn" data-f941-open="1" onclick="window._gcF941Open&&window._gcF941Open()" style="margin-top:4px">📄 Form 941 numbers</button></div>' : '') + '</td>'   /* patch F941 */""")
# 4. the tail
tail = open(os.path.join(here, 'f941_tail.js'), encoding='utf-8').read().rstrip('\n')
assert tail.startswith('<script>') and tail.endswith('</script>') and tail.count('</script>') == 1
i = t.rfind('</script>'); assert i > 0
i += len('</script>')
t = t[:i] + '\n' + tail + t[i:]
open(path, 'w', encoding='utf-8').write(t)
print('patched (F941)')
