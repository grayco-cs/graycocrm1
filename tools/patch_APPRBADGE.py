# APPRBADGE (r39c): the Field home's own ✅ badge painter used the raw count while the role app's painter takes off the approvals
# in their ↩ Undo window — both run on 'gc-approvals-changed', so the badge flipped between the two numbers (whichever ran last).
# Both now show the same number.
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
A = """  if (n == null) n = apprCount();
  var b = D.getElementById('gc-fh-badge'), tx = n > 0 ? String(n) : '';"""
B = """  if (n == null) n = apprCount();
  try { n = Math.max(0, n - (typeof W._gcApprovalPending === 'function' ? +W._gcApprovalPending() || 0 : 0)); } catch (e) {}   /* APPRBADGE: the same number as the role app's badge */
  var b = D.getElementById('gc-fh-badge'), tx = n > 0 ? String(n) : '';"""
assert t.count(A) == 1, t.count(A)
t = t.replace(A, B)
open(p, 'w', encoding='utf-8').write(t)
print('APPRBADGE: done')
