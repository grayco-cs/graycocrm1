#!/usr/bin/env python3
"""patch PASTPAY — 📥 Enter past payroll (from paystubs), on a build that already has patch F941.
usage: python3 tools/patch_PASTPAY.py [index.html]      (in place; idempotent: a patched file is left as it is)
Owner 11/02: enter every week of Q3 payroll from the paystubs tonight and file Form 941 from it.
  1. the F941 script block is replaced by tools/f941_tail.js (a check with NO Social Security / Medicare withheld:
     line 5 still both halves, the employee half is the company's cost, not a line-7 adjustment; orange warnings for
     "none withheld"; the worksheet's "📥 Enter past payroll" button)
  2. WAGESBOOKS: a run marked noBooks (source 'paystub-entry') is never posted to the accounting register (the wages
     are already in QuickBooks) and is not counted as "missing from the books"
  3. Payroll → Run Payroll: "📥 Enter past payroll (from paystubs)" next to "✍ Enter a week by hand" (admins)
  4. tools/pastpay_tail.js after the last </script>"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
t = open(path, encoding='utf-8').read()
if '__GC_PASTPAY__' in t:
    print('already patched (PASTPAY) — nothing changed'); sys.exit(0)
assert '__GC_F941__' in t, 'patch F941 first (tools/patch_F941.py)'

def rep(a, b, n=1):
    global t
    c = t.count(a)
    assert c == n, (c, n, a[:100])
    t = t.replace(a, b)

# 1. the F941 block, replaced whole
f941 = open(os.path.join(here, 'f941_tail.js'), encoding='utf-8').read().rstrip('\n')
start_tag = '<script>\n/* __GC_F941__'
assert t.count(start_tag) == 1 and f941.startswith(start_tag)
i = t.index(start_tag); j = t.index('</script>', i) + len('</script>')
t = t[:i] + f941 + t[j:]
# 2. WAGESBOOKS
rep("""  if(['approved','paid'].indexOf(low(run.status))<0) return 0;
  if(typeof window._gcAddToRegister !== 'function') return 0;""",
    """  if(['approved','paid'].indexOf(low(run.status))<0) return 0;
  if(run.noBooks || run.source==='paystub-entry') return 0;   /* patch PASTPAY: already in QuickBooks — never posted again */
  if(typeof window._gcAddToRegister !== 'function') return 0;""")
rep("""    if(['approved','paid'].indexOf(low(run.status))<0) return;
    run.lines.forEach(function(L,i){""",
    """    if(['approved','paid'].indexOf(low(run.status))<0) return;
    if(run.noBooks || run.source==='paystub-entry') return;   /* patch PASTPAY */
    run.lines.forEach(function(L,i){""")
# 3. the button on Run Payroll
rep("""      + '<button id="_pManual" title="Type in a week of payroll yourself — any week" style="'+CSS.btnG+'margin-left:auto;">✍ Enter a week by hand</button>'   /* patch PAYMANUAL */""",
    """      + '<button id="_pManual" title="Type in a week of payroll yourself — any week" style="'+CSS.btnG+'margin-left:auto;">✍ Enter a week by hand</button>'   /* patch PAYMANUAL */
      + ((P.isAdmin() && window._gcPastPayOpen) ? '<button id="_pPast" onclick="window._gcPastPayOpen()" title="Weeks already paid: type each employee\\'s gross from the paystubs — taxes fill in; saved as paid, nothing sent or booked" style="'+CSS.btnG+'">📥 Enter past payroll (from paystubs)</button>' : '')   /* patch PASTPAY */""")
# 4. the tail
tail = open(os.path.join(here, 'pastpay_tail.js'), encoding='utf-8').read().rstrip('\n')
assert tail.startswith('<script>') and tail.endswith('</script>') and tail.count('</script>') == 1
k = t.rfind('</script>'); assert k > 0
k += len('</script>')
t = t[:k] + '\n' + tail + t[k:]
open(path, 'w', encoding='utf-8').write(t)
print('patched (PASTPAY)')
