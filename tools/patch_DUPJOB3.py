"""Idempotent patch DUPJOB3 (on top of DUPJOB2): no people's names in the CRM's LOGIC — roles instead.

  Owner 11/02: "Make sure any instance I say Glenn in the code is changed to lead estimator ... Make sure all names and
  titles are general so when I fire people I can replace them with a new lead."
  Owners = the people with the Admin / owner role in the staff list (window._gcOwnerUsers), plus the signed-in person
  when the company sign-in says admin. The Lead Estimator = window._gcLeadEstimator (patch DUPJOB2 / EST4).

  Replaced (logic only; comments, help text, data and seeds are left — see the DUPJOB report):
    • New lead form: the PM was set to an owner BY NAME from the customer's name → no PM (the owners assign it).
    • Admin checks by the owners' e-mail addresses (two places) → the owner role.
    • "Lead added": follow-up alerts for two named owners → the owners (role).
    • Invoice approve (embedded app): approvedBy a named owner → the person approving.
    • Estimator defaults 'Wesley' (four places) → the Lead Estimator (else the person signed in).
    • Job PM list / estimator list / "Who is the PM" fallbacks of two named owners → the owners (role).
    • Cash / Accounts isOwner() by name → the owner role.
    • Admin to-do seeding: two owner e-mails always added to the admins → the admins (role) only.
    • Field portal "call the owner" contact found by an owner's e-mail / first name → the first owner (role).
    • Mitigation alert default recipients (two owner e-mails) → the owners (role); also tools/mitto_tail.js.

Every find-string must occur exactly the given number of times (else nothing is written).
Usage: python3 tools/patch_DUPJOB3.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_DUPJOB3__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_DUPJOB2__' in src, 'run tools/patch_DUPJOB2.py first'


def once(old, new, label, count=1):
    global src
    n = src.count(old)
    assert n == count, ('anchor count != %d' % count, label, n)
    src = src.replace(old, new)


# owners by role (helpers block of DUPJOB)
once("W._gcLeadEstimator = leadEst; W._gcIsLeadEstimator = isLeadEst; W._gcMeUser2 = meUser;",
     """W._gcLeadEstimator = leadEst; W._gcIsLeadEstimator = isLeadEst; W._gcMeUser2 = meUser;
/* __GC_PATCH_DUPJOB3__ — the owners are a ROLE (Admin / owner in the staff list), never names in the code */
W._gcOwnerUsers = function(){ return users().filter(isOwnerUser); };
W._gcOwnerNames = function(){ return W._gcOwnerUsers().map(function(u){ return clean(u.name); }).filter(Boolean); };
W._gcOwnerEmails = function(){ var l = W._gcOwnerUsers().map(function(u){ return low(u.email); }).filter(function(e){ return e.indexOf('@') > 0; });
  try { var em = low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); if (em && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin() && !/^office@/.test(em) && l.indexOf(em) < 0) l.push(em); } catch (e) {}
  return l; };
W._gcIsOwnerEmail = function(em){ em = low(em); return !!em && W._gcOwnerEmails().indexOf(em) >= 0; };
W._gcIsOwnerUser = isOwnerUser;""",
     'owner helpers')

# new lead form: PM from the customer's name
once('_pm="Wesley Johnson";else if', '_pm=""/* DUPJOB3: never an owner by name — the owners assign the PM */;else if', 'lead form pm 1')
once('|evanson/.test(_s))_pm="Nick Thomas";}', '|evanson/.test(_s))_pm=""/* DUPJOB3 */;}', 'lead form pm 2')

# admin checks by e-mail
once('em==="office@grayco-cs.com"||em==="wjohnson@grayco-cs.com"||em==="nthomas@grayco-cs.com"',
     'em==="office@grayco-cs.com"||(window._gcIsOwnerEmail?window._gcIsOwnerEmail(em):false)/* DUPJOB3: the owner role */', 'admin check 1')
once("em === 'office@grayco-cs.com' || em === 'wjohnson@grayco-cs.com' || em === 'nthomas@grayco-cs.com'",
     "em === 'office@grayco-cs.com' || (window._gcIsOwnerEmail ? window._gcIsOwnerEmail(em) : false)/* DUPJOB3: the owner role */", 'admin check 2')

# "Lead added": the owners
once('followUpFor:["Nick Thomas","Wesley Johnson"]', 'followUpFor:(window._gcOwnerNames?window._gcOwnerNames():[])', 'lead follow-up')
once('se("Lead added — Nick & Wesley alerted for follow-up")', 'se("Lead added — the owners are alerted for follow-up")', 'lead toast')
once('forUsers:["Nick Thomas","Wesley Johnson"]', 'forUsers:(window._gcOwnerNames?window._gcOwnerNames():[])', 'lead forUsers')

# invoice approve (embedded app)
once('approvedBy: "Wesley Johnson"', 'approvedBy: (window._gcMeNow && window._gcMeNow.name) || ""/* DUPJOB3: the person approving */', 'invoice approvedBy')

# estimator defaults
LE = "((window._gcLeadEstimator&&window._gcLeadEstimator()||{}).name||(window._gcMeNow&&window._gcMeNow.name)||'')"
once("qs('ats-job-est')?.value?.trim()||'Wesley'", "qs('ats-job-est')?.value?.trim()||" + LE, 'est default 1')
once("estimator: _q('ej-est')||'Wesley',", "estimator: _q('ej-est')||" + LE + ",", 'est default 2')
once("estimator:(slot.fields&&slot.fields.estimator)||'Wesley',", "estimator:(slot.fields&&slot.fields.estimator)||" + LE + ",", 'est default 3')
once("else qs('ej-est').value=f.estimator||'Wesley';", "else qs('ej-est').value=f.estimator||" + LE + ";", 'est default 4')

# a sub scope sheet's estimator line: the Lead Estimator, never a named owner
once("var estName = (est.fields&&est.fields.estimator) || est.estimator || 'Wesley Johnson';",
     "var estName = (est.fields&&est.fields.estimator) || est.estimator || " + LE + ";   /* DUPJOB3 */", 'scope sheet estimator')

# fallbacks of two named owners → the owners (role)
once('var core=[{id:"U2",name:"Wesley Johnson"},{id:"U1",name:"Nick Thomas"}];',
     'var core=(An||[]).filter(function(u){return u&&u.active!==false&&window._gcIsOwnerUser&&window._gcIsOwnerUser(u);});/* DUPJOB3: the owners (role) */', '_pmList core')
once("    var core=['Wesley Johnson','Nick Thomas'];", "    var core=window._gcOwnerNames?window._gcOwnerNames():[];   /* DUPJOB3: the owners (role) */", 'estimators core')
once("    if(!out.length) out=['Wesley Johnson','Nick Thomas'];", "    if(!out.length) out=window._gcOwnerNames?window._gcOwnerNames():[];", 'estimators fallback')
once("    if(!out.length){ ['Wesley Johnson','Nick Thomas'].forEach(function(n){ out.push(n); }); }",
     "    if(!out.length){ (window._gcOwnerNames?window._gcOwnerNames():[]).forEach(function(n){ out.push(n); }); }   /* DUPJOB3: the owners (role) */", '_gcPMList fallback')

# isOwner by name
once("return !!(u && (u.name==='Wesley Johnson'||u.name==='Nick Thomas'||(u.role==='Admin'&&/wesley|nick/i.test(u.name||''))));",
     "return !!(u && (window._gcIsOwnerUser ? window._gcIsOwnerUser(u) : u.role==='Admin'));   /* DUPJOB3: the owner role */", 'isOwner')

# admin to-do seeding: the admins only
once("function adminEmails(){ var l = people().filter(isAdminUser).map(function(u){ return low(u.email); }); [OWNERS.w, OWNERS.n].forEach(function(e){ if (l.indexOf(e) < 0) l.push(e); }); return l; }",
     "function adminEmails(){ var l = people().filter(isAdminUser).map(function(u){ return low(u.email); }); return l; }   /* DUPJOB3: the admins (role), no named owners */", 'adminEmails')

# field portal: the owner to call
once("var wes = arr(C().users).filter(function(x){ return x && low(x.email) === 'wjohnson@grayco-cs.com'; })[0] || arr(C().users).filter(function(x){ return x && /^wesley\\b/i.test(s(x.name)); })[0] || null;",
     "var wes = (W._gcOwnerUsers ? W._gcOwnerUsers() : [])[0] || null;   /* DUPJOB3: the first owner (role) */", 'fieldportal owner')

# mitigation alert default recipients
once("var W = window, ID = 'gc-mitto-set', DEF = ['nthomas@grayco-cs.com', 'wjohnson@grayco-cs.com'];",
     "var W = window, ID = 'gc-mitto-set', DEF = [];   /* DUPJOB3: the owners (role) — defOwners() */\nfunction defOwners(){ try { return W._gcOwnerEmails ? W._gcOwnerEmails() : []; } catch (e) { return []; } }", 'mitto DEF')
once("function mitigationTo(){ var k = cache(), a = k.settings && k.settings.mitigationTo; a = Array.isArray(a) ? a.map(low).filter(Boolean) : []; return a.length ? a : DEF; }",
     "function mitigationTo(){ var k = cache(), a = k.settings && k.settings.mitigationTo; a = Array.isArray(a) ? a.map(low).filter(Boolean) : []; return a.length ? a : defOwners(); }", 'mitto to')
once("  if (!list.length) list = DEF.slice();\n  var btn = p.querySelector('[data-mt=\"save\"]');", "  if (!list.length) list = defOwners().slice();\n  var btn = p.querySelector('[data-mt=\"save\"]');", 'mitto list')

open(path, 'w', encoding='utf-8').write(src)
print('patched DUPJOB3')

# the same two blocks live in tools/ as the patch sources
for fn, pairs in [
    ('mitto_tail.js', [("var W = window, ID = 'gc-mitto-set', DEF = ['nthomas@grayco-cs.com', 'wjohnson@grayco-cs.com'];",
                        "var W = window, ID = 'gc-mitto-set', DEF = [];   /* DUPJOB3: the owners (role) — defOwners() */\nfunction defOwners(){ try { return W._gcOwnerEmails ? W._gcOwnerEmails() : []; } catch (e) { return []; } }"),
                       ("function mitigationTo(){ var k = cache(), a = k.settings && k.settings.mitigationTo; a = Array.isArray(a) ? a.map(low).filter(Boolean) : []; return a.length ? a : DEF; }",
                        "function mitigationTo(){ var k = cache(), a = k.settings && k.settings.mitigationTo; a = Array.isArray(a) ? a.map(low).filter(Boolean) : []; return a.length ? a : defOwners(); }"),
                       ("  if (!list.length) list = DEF.slice();", "  if (!list.length) list = defOwners().slice();")]),
    ('fieldportal.js', [("var wes = arr(C().users).filter(function(x){ return x && low(x.email) === 'wjohnson@grayco-cs.com'; })[0] || arr(C().users).filter(function(x){ return x && /^wesley\\b/i.test(s(x.name)); })[0] || null;",
                         "var wes = (W._gcOwnerUsers ? W._gcOwnerUsers() : [])[0] || null;   /* DUPJOB3: the first owner (role) */")]),
]:
    p = os.path.join(HERE, fn)
    if not os.path.exists(p):
        continue
    t = open(p, encoding='utf-8').read()
    if 'DUPJOB3' in t:
        continue
    for a, b in pairs:
        assert t.count(a) == 1, (fn, a[:50], t.count(a))
        t = t.replace(a, b)
    open(p, 'w', encoding='utf-8').write(t)
    print('patched tools/' + fn)
