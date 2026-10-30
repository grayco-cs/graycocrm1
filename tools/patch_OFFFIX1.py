#!/usr/bin/env python3
"""Idempotent patch OFFFIX1 (office audit, 10/30): the office can assign the leads her Approvals ask her to assign.

Found in the office audit: the office's 📋 Approvals → "Waiting on me" holds every "👤 Assign this lead" item (patch HOT1 sends
them to the admins / office and the estimators: 66 of her 76 on the live data), and "✅ 👤 Assign" opens the lead at
"Assigned to" — where the picker was disabled for her ("An admin or the estimator assigns leads."). A dead end: the
items could never leave her list. The owner gave the office the whole CRM except staff access, security and the
destructive tools; assigning a lead is none of those.

Now the office (window._gcIsOfficeFull(), patch OFFICEFULL) assigns a lead like an admin: the drawer's picker, the
Leads list's 👤 Assign button, the pick boxes and "Assign the picked" (the hub's own canAssignAll()). The priority
and everything else are unchanged. PMs, estimators and an admin's "View as" are unchanged.
The held new leads card ("⏳ N new leads waiting to be assigned", patch LEADHOLD: ✅ Approve the suggestion / pick someone)
is hers too. The CRM's copy of the approval kinds (patch APOFFICE4, window._gcApOfficeKind) moves lead assignment
(lead_assign, assign_estimator, assign_pm) to the office list and drops "assign" from the admin-only pattern; access /
role / permission / staff stay admin-only — the same change as netlify/functions/_lib/office-kinds.js (test_APOFFICE4
checks the two match).
Usage: python3 tools/patch_OFFFIX1.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch OFFFIX1'
if MARK in t:
    print('OFFFIX1: already patched'); sys.exit(0)
def once(a, b):
    global t
    n = t.count(a); assert n == 1, ('OFFFIX1 anchor', n, a[:90]); t = t.replace(a, b)

once("function canAssignAll(){ return isAdmin() && myScope().kind === 'all' && myScope().why === 'admin'; }",
     "function officeAsg(){ try { return typeof W._gcIsOfficeFull === 'function' && !!W._gcIsOfficeFull() && !(W._gcVAS && W._gcVAS.active && W._gcVAS.active()); } catch (e) { return false; } }   "
     + MARK + ": the office assigns leads (her Approvals' \"Assign this lead\") */\n"
     "function canAssignAll(){ return (isAdmin() && myScope().kind === 'all' && myScope().why === 'admin') || officeAsg(); }")
once("(adm || isEstimatorMe() || amEstimator() || (W._gcLeadRoles && W._gcLeadRoles.mine && W._gcLeadRoles.mine(l))",
     "(adm || canAssignAll() || isEstimatorMe() || amEstimator() || (W._gcLeadRoles && W._gcLeadRoles.mine && W._gcLeadRoles.mine(l))")
once("(adm || isEstimatorMe() ? '' : '<span class=\"note\">An admin or the estimator assigns leads.</span>')",
     "(adm || canAssignAll() || isEstimatorMe() ? '' : '<span class=\"note\">An admin, the office or the estimator assigns leads.</span>')")
once('"mkt_outreach","mkt_page"];', '"mkt_outreach","mkt_page","lead_assign","assign_estimator","assign_pm"];   ' + MARK + ': lead assignment is office work */')
once("delete|merge|staff|access|permission|role|override|assign/, AP4K_PREFIX", "delete|merge|staff|access|permission|role|override/, AP4K_PREFIX")
# patch LEADHOLD: "isAdmin" there means "may decide a held lead"; the office may (after an admin's View as check)
once("""function isAdmin(){
  try { if (W._gcVAS && W._gcVAS.active()) return /admin|owner/i.test(s(W._gcVAS.role())); } catch (e) {}
  try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {}
  var u = meUser(); return !!(u && (u.role === 'Admin' || low(u.payType) === 'owner'));""", """function isAdmin(){
  try { if (W._gcVAS && W._gcVAS.active()) return /admin|owner/i.test(s(W._gcVAS.role())); } catch (e) {}
  try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {}
  try { if (typeof W._gcIsOfficeFull === 'function' && W._gcIsOfficeFull()) return true; } catch (e) {}   """ + MARK + """: the office decides held leads too */
  var u = meUser(); return !!(u && (u.role === 'Admin' || low(u.payType) === 'owner'));""")
once("toast('Only an admin approves a suggested lead.');", "toast('Only an admin or the office approves a suggested lead.');")
open(p, 'w', encoding='utf-8').write(t)
print('OFFFIX1: patched ' + p)
