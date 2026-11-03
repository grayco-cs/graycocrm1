#!/usr/bin/env python3
"""patch PMPAYCHECK — 🔎 PM pay check (read-only): what each PM should be paid (the CRM's per-job commission ledger,
gc_commission_paid, worked out by the pay matrix / pay-source rules / overhead split, + the payroll profile salary)
against what the payroll runs paid, per pay date and per quarter. Q3 2026 and earlier: one collapsed "Known" total;
from 10/1/2026 every gap over $1 alerts until "✓ Checked — this is right" + a note (re-alerts if the amounts change).
usage: python3 tools/patch_PMPAYCHECK.py [index.html]      (in place; idempotent)
  1. Payroll page: a card above the tabs (admin + office: P.canSee) filled by window._gcPmPayCard
  2. window._gcPayrollOpenRun(id): Payroll → Approvals with that run opened (the flag's run link)
  3. tools/pmpaycheck_tail.js after the last </script>: the core, the card, the ✅ My Approvals items
Nothing is written to pay, runs, checks or the commission ledger; the checks go on gc_payroll_approvals."""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
t = open(path, encoding='utf-8').read()
MARK = '/* patch PMPAYCHECK */'
if MARK in t or '__GC_PMPAYCHECK__' in t:
    print('already patched'); sys.exit(0)

R = [
 ("    + (due && (due.subs.length||due.payroll.length) ? checksDueBar(due) : '')\n",
  "    + (due && (due.subs.length||due.payroll.length) ? checksDueBar(due) : '')\n"
  "    + ((P.canSee()&&window._gcPmPayCard) ? '<div id=\"_gcPmPayCardMount\"></div>' : '')   " + MARK + "\n"),
 ("  var body=m.querySelector('#_payBody');\n",
  "  var body=m.querySelector('#_payBody');\n"
  "  try{ var _pmpM=m.querySelector('#_gcPmPayCardMount'); if(_pmpM && window._gcPmPayCard) window._gcPmPayCard(_pmpM); }catch(_pmpE){}   " + MARK + "\n"),
 ("\nwindow._gcPayrollRender = render;\n",
  "\nwindow._gcPayrollRender = render;\n"
  "window._gcPayrollOpenRun = function(id){ S.tab='approvals'; S.emp=null; S.openRun=id; if(window._gcOpenPayrollTab) window._gcOpenPayrollTab('approvals'); };   " + MARK + "\n"),
]
for a, b in R:
    n = t.count(a)
    assert n == 1, ('anchor count %d' % n, a[:90])
for a, b in R:
    t = t.replace(a, b, 1)
tail = open(os.path.join(here, 'pmpaycheck_tail.js'), encoding='utf-8').read().rstrip('\n')
assert tail.startswith('<script>') and tail.endswith('</script>') and tail.count('</script>') == 1
i = t.rfind('</script>'); assert i > 0
i += len('</script>')
t = t[:i] + '\n' + tail + t[i:]
open(path, 'w', encoding='utf-8').write(t)
print('patched (PMPAYCHECK)')
