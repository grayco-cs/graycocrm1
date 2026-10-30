#!/usr/bin/env python3
"""Idempotent patch APOFFICE4 (owner Wesley, 10/30): "i want office to have all auto text thank yous portal texts just anything
needed for approval for that stuff i want her to approve and so can admin but if she approves that is good all auto text emails
invoices whatever we need approved i want office to approve".

The office (office profile / Office Admin, office@grayco-cs.com) is a FULL approver of every customer- or outside-facing
approval on the shared list (gc_approval_queue) from the moment it is made:
  * those items are in her "Waiting on me" (To-Do line, green APPROVE, 📋 Approvals) at once — not behind "👷 PM approvals",
    no 24-hour wait — at the PM step AND at the admin step;
  * her Approve is final ("✅ Approve & send", never "→ admin"); admins can still approve the same item; first action wins
    (the server's claim, portal.js approvalAction);
  * owner money / permission kinds (payroll, pay, offer letters, referral credits / gift codes, ad spend, partner payouts,
    experiments, feature requests, overrides, lead assignments …) are never hers: no button, and AP4's 24-hour escalation
    no longer hands them to her.
The kinds: window._gcApOfficeKind(x) / window._gcApAdminOnlyKind(x), the same lists as netlify/functions/_lib/office-kinds.js
(tools/tests/test_APOFFICE4.mjs checks they match). Kinds on neither list behave exactly as before (APOFFICE / APOFFICE2 / AP4).
Needs patches APOFFICE, APOFFICE2 (and AP2, AP4, APX). Usage: python3 tools/patch_APOFFICE4.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch APOFFICE4'
if MARK in src:
    print('APOFFICE4: already patched'); sys.exit(0)
assert '/* patch APOFFICE2' in src, 'APOFFICE4 needs patch APOFFICE2 first'
def rep(old, new, n=1):
    global src
    c = src.count(old)
    assert c == n, ('APOFFICE4 find-string count', c, '!=', n, old[:100])
    src = src.replace(old, new)

OFFICE_KINDS = '["portal_publish","portal_link","portal_docs","portal_post","weekly_update","sub_contact","gcp_link","invoice","final_invoice","final_reminder","payment_reminder","invoice_statement","maint_invoice","pay_app","gcp_payapp_invoice","proposal_send","sign_contract","contract","estimate_followup","maint_quote","selection_sign","walkthrough_sign","gcp_co_contract","document","thank_you","review_request","lead_first_contact","welcome","next_steps","appt_confirm","appt_reminder","closeout","checkup","progress_update","anniversary","warranty_check","cneeds_remind","winback","mail_followup","brain_email","maintenance","applicant_reply","lien_waiver","sub_lien_request","bp_notice","gcp_coi","gcp_inspect","mkt_campaign","newsletter","social_post","soc_week","mkt_neighbor","mkt_event","mkt_giveaway","mkt_outreach","mkt_page"]'
ADMIN_ONLY_KINDS = '["offer_letter","refcredit","refgift","mkt_payout","mkt_ad","mkt_addraft","mkt_experiment","mkt_feature"]'
ADMIN_ONLY_RE = '/payroll|pay_?run|pay_?stub|paycheck|pay_?week|pay_?change|pay_?rate|raise|wage|bank|cash|owner_?draw|^draw|delete|merge|staff|access|permission|role|override|assign/'
OFFICE_PREFIX = '/^sign_[a-z0-9_]+$/'

# 1. patch APPR (the base list): the kinds; "waiting on me", who may act, the last step, the label
rep("""window._gcApOfficeMe = officeMe;
function waitingOnMe(x){""", """window._gcApOfficeMe = officeMe;
""" + MARK + """ (owner 10/30): every customer / outside-facing approval is the office's own at once, at any step, and her
   approval is final; owner money / permission kinds never are. Same lists as netlify/functions/_lib/office-kinds.js. */
var AP4K_OFFICE = """ + OFFICE_KINDS + """;
var AP4K_ADMIN = """ + ADMIN_ONLY_KINDS + """;
var AP4K_ADMIN_RE = """ + ADMIN_ONLY_RE + """, AP4K_PREFIX = """ + OFFICE_PREFIX + """;
function ap4kKind(x){ return low(x && typeof x === 'object' ? x.kind : x); }
function adminOnlyKind(x){ var k = ap4kKind(x), m = (x && typeof x === 'object' && x.meta) || {}; return AP4K_ADMIN.indexOf(k) >= 0 || AP4K_ADMIN_RE.test(k) || m.payroll === true || m.adminOnly === true || !!(x && typeof x === 'object' && x.adminOnly === true); }
function officeKind(x){ if(adminOnlyKind(x)) return false; var k = ap4kKind(x); return AP4K_OFFICE.indexOf(k) >= 0 || AP4K_PREFIX.test(k); }
function officeTakes(x){ return !!(x && officeMe() && officeKind(x)); }
window._gcApOfficeKind = officeKind; window._gcApAdminOnlyKind = adminOnlyKind; window._gcApOfficeTakes = officeTakes;
function waitingOnMe(x){""")
rep("""  return x.step === 'pm' && pmIsMe(x);   /* patch APOFFICE2: the office's PM-step items are optional — behind "👷 PM approvals", not in her list */
}""", """  return (x.step === 'pm' && pmIsMe(x)) || officeTakes(x);   /* patch APOFFICE2: the office's PM-step items are optional — behind "👷 PM approvals", not in her list */   """ + MARK + """: except her own kinds — hers at once, any step */
}""")
rep("""function canAct(x){ return x.status === 'waiting' && (isAdmin() || (x.step === 'pm' && (pmIsMe(x) || officeMe()))); }""",
"""function canAct(x){ return x.status === 'waiting' && (isAdmin() || officeTakes(x) || (x.step === 'pm' && (pmIsMe(x) || (officeMe() && !adminOnlyKind(x))))); }   """ + MARK + """ */""")
rep("""  var id = esc(x.id), act1 = canAct(x), lastStep = isAdmin() || (x.steps || []).indexOf(x.step) >= (x.steps || []).length - 1;""",
"""  var id = esc(x.id), act1 = canAct(x), lastStep = isAdmin() || officeTakes(x) || (x.steps || []).indexOf(x.step) >= (x.steps || []).length - 1;   """ + MARK + """: her approval is final */""")
rep("""  var who = x.step === 'admin' ? 'Admin (Wesley or Nick)' : 'PM ' + esc(x.pm || '?') + ' or the office';""",
"""  var who = x.step === 'admin' ? 'Admin (Wesley or Nick)' + (officeKind(x) ? ' or the office' : '') : 'PM ' + esc(x.pm || '?') + (adminOnlyKind(x) ? '' : ' or the office');   """ + MARK + """ */""")
rep("""(a.step === 'admin' || a.role === 'admin' ? 'admin' : 'PM')""",
"""(a.role === 'office' ? 'office' : a.step === 'admin' || a.role === 'admin' ? 'admin' : 'PM')""")

# 2. patch AP2 (the green cards / preview): her approval is final; who approved
rep("""function lastStep(x){ return isAdmin() || (x.steps || []).indexOf(x.step) >= (x.steps || []).length - 1; }""",
"""function lastStep(x){ return isAdmin() || !!(window._gcApOfficeTakes && window._gcApOfficeTakes(x)) || (x.steps || []).indexOf(x.step) >= (x.steps || []).length - 1; }   """ + MARK + """ */""")
rep("""x.approvals.map(function(a){ return '✔ ' + esc(a.by) + ' (' + (a.role === 'admin' ? 'admin' : 'PM') + ') '""",
"""x.approvals.map(function(a){ return '✔ ' + esc(a.by) + ' (' + (a.role === 'admin' ? 'admin' : a.role === 'office' ? 'office' : 'PM') + ') '""")

# 3. patch AP4's wrapper: an owner money / permission kind is not escalated to the office
rep("""        var add = (r.all || []).filter(function(x){ return due(x) && !have[x.id]; });""",
"""        var add = (r.all || []).filter(function(x){ return due(x) && !have[x.id] && !(window._gcApAdminOnlyKind && window._gcApAdminOnlyKind(x)); });   """ + MARK + """ */""")

# 4. patch APX (📋 Approvals): her kinds are hers (any step), final, and never "goes to the office in …"
rep("""  var steps = arr(x.steps), lastStep = steps.indexOf(x.step) >= steps.length - 1;""",
"""  var steps = arr(x.steps), lastStep = steps.indexOf(x.step) >= steps.length - 1 || ap4Takes(x);   """ + MARK + """: her approval is final */""")
rep("""  var clock = step === 'admin' ? (function(){""",
"""  if (step === 'admin' && ap4Kind(x)) waits = 'Wesley, Nick or the office';   """ + MARK + """ */
  var clock = step === 'admin' && !ap4Kind(x) ? (function(){""")
rep("""approve: x.status === 'waiting' && (mine || realAdmin() || (x.step === 'pm' && isOfficePerson()))""",
"""approve: x.status === 'waiting' && (mine || realAdmin() || ap4Takes(x) || (x.step === 'pm' && isOfficePerson() && !ap4AdminOnly(x)))""")
rep("""sc.kind === 'office' ? (escalatedQ(x, now) || x.status === 'sending' || x.step === 'pm') :""",
"""sc.kind === 'office' ? ((escalatedQ(x, now) && !ap4AdminOnly(x)) || x.status === 'sending' || x.step === 'pm' || ap4Kind(x)) :""")
rep("""    var mine = sc.preview ? (sc.kind === 'pm' ? x.step === 'pm' : escalatedQ(x, now)) : false;""",
"""    var mine = sc.preview ? (sc.kind === 'pm' ? x.step === 'pm' : ((escalatedQ(x, now) && !ap4AdminOnly(x)) || (x.status === 'waiting' && ap4Kind(x)))) : false;   """ + MARK + """ */""")
rep("""function samePerson(a, b){ return !!s(a) && low(a) === low(b); }
function escalatedQ(x, now){""", """function samePerson(a, b){ return !!s(a) && low(a) === low(b); }
""" + MARK + """: the office's own kinds (patch APPR's lists) */
function ap4Kind(x){ try { return !!(W._gcApOfficeKind && W._gcApOfficeKind(x)); } catch (e) { return false; } }
function ap4AdminOnly(x){ try { return !!(W._gcApAdminOnlyKind && W._gcApAdminOnlyKind(x)); } catch (e) { return false; } }
function ap4Takes(x){ return !realAdmin() && isOfficePerson() && ap4Kind(x); }
function escalatedQ(x, now){""")

open(path, 'w', encoding='utf-8').write(src)
print('APOFFICE4: patched', path)
