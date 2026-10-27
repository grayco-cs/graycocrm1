#!/usr/bin/env python3
"""Idempotent patch OFFICEAPPR: the office approves everything except payroll; employee mileage log.

Owner (10/27):
  A. The office manager (role starting with "Office", e.g. "Office Admin"; office@grayco-cs.com) "can approve
     everything except payroll." She may approve every approval type an admin may, at any step (the PM's step counts
     as done, the same rule as an admin): change orders of any size (commercial CO steps too), estimates / proposals /
     contracts to sign, customer e-mails / texts / portal invites, money / legal papers, automations, sub invoices,
     expenses, invoice sign-offs, bid e-mails, materials, sub scopes, the bid site. Payroll runs, the payroll week
     sign-off and pay stubs stay Wesley / Nick (admins) only (page and server). No admin-only screens are opened to
     her (payroll screens, staff / security settings, API keys). Customer-facing items still ask once. Who approved,
     as what (role "office"), and when, is recorded.
  B. 🚗 My mileage (top 💎 menu and the phone field app's More sheet): log company-errand miles (date, from / to or
     purpose, optional job, miles or odometer, round trip) at $0.70 / mile (admin setting, every computer); weekly
     totals; each week to ✅ Approvals (Wesley, Nick or the office; nobody approves their own); approved weeks are a
     non-taxable "Mileage reimbursement" line on the person's next payroll run and pay stub.
  C. Late fees: wording only, nothing in the CRM adds a late fee (checked by the test).
Server side (not this script): netlify/functions/portal.js approvalAction, portal-access.js, _lib/office-appr.js.
New UI = tools/officeappr_tail.js (appended as <script id="gc-patch-OFFICEAPPR">).
Every find-string is asserted (else nothing is written).
Usage: python3 tools/patch_OFFICEAPPR.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
MARK = '__GC_PATCH_OFFICEAPPR__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
TAIL = open(os.path.join(HERE, 'officeappr_tail.js'), encoding='utf-8').read().rstrip('\n')
assert '</script>' not in TAIL and MARK in TAIL

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

def every(old, new, cnt, label):
    global src
    n = src.count(old)
    assert n == cnt, ('anchor count', label, n, cnt)
    src = src.replace(old, new)

def infunc(start, end, reps, label):
    """replace inside one function only: start..end (start exactly once)"""
    global src
    assert src.count(start) == 1, ('function start', label, src.count(start))
    i = src.find(start); j = src.find(end, i)
    assert j > i, ('function end', label)
    body = src[i:j]
    for old, new, cnt in reps:
        c = body.count(old)
        assert c == cnt, ('in ' + label, old[:60], c, cnt)
        body = body.replace(old, new)
    src = src[:i] + body + src[j:]

OA = "(window._gcOA && window._gcOA.canAct(x))"

# ── 1. patch APPR (customer e-mail / text approvals): the office acts like an admin, payroll aside ─────────────
once("""function waitingOnMe(x){
  if(x.status !== 'waiting') return false;
  if(isAdmin()) return x.step === 'admin' || pmIsMe(x);""", """function waitingOnMe(x){
  if(x.status !== 'waiting') return false;
  if(isAdmin() || """ + OA + """) return x.step === 'admin' || pmIsMe(x);   /* patch OFFICEAPPR: the office, like an admin */""", 'appr waitingOnMe')
once("function canAct(x){ return x.status === 'waiting' && (isAdmin() || (x.step === 'pm' && pmIsMe(x))); }\nfunction visible(x){ return isAdmin() || pmIsMe(x); }",
     "function canAct(x){ return x.status === 'waiting' && (isAdmin() || " + OA + " || (x.step === 'pm' && pmIsMe(x))); }   /* patch OFFICEAPPR */\nfunction visible(x){ return isAdmin() || " + OA + " || pmIsMe(x); }", 'appr canAct')
once("function showButton(){ if(!myEmail()) return false; return isAdmin() || isPmPerson() || list.some(pmIsMe); }",
     "function showButton(){ if(!myEmail()) return false; return isAdmin() || (window._gcOA && window._gcOA.office()) || isPmPerson() || list.some(pmIsMe); }   /* patch OFFICEAPPR */", 'appr showButton')
once("id = esc(x.id), act1 = canAct(x), lastStep = isAdmin() ||", "id = esc(x.id), act1 = canAct(x), lastStep = isAdmin() || " + OA + " ||", 'appr card lastStep')
every("a.role === 'admin' ? 'admin' : 'PM'", "a.role === 'admin' ? 'admin' : a.role === 'office' ? 'office' : 'PM'", 2, 'approval chain role label')

# ── 2. patch AP2 (cards + Preview / Edit): the office can open, edit and approve any (non-payroll) item ─────────
once("function lastStep(x){ return isAdmin() || (x.steps || []).indexOf(x.step) >= (x.steps || []).length - 1; }",
     "function lastStep(x){ return isAdmin() || " + OA + " || (x.steps || []).indexOf(x.step) >= (x.steps || []).length - 1; }   /* patch OFFICEAPPR */", 'ap2 lastStep')
once("  var can = items().some(function(y){ return y.id === id; });",
     "  var can = items().some(function(y){ return y.id === id; }) || (x.status === 'waiting' && " + OA + ");   /* patch OFFICEAPPR */", 'ap2 preview can')

# ── 3. patch APX (📋 Approvals tab): the office sees every waiting item and approves it like an admin ───────────
once("    var vis = sc.kind === 'admin' ? true : sc.kind === 'office' ? (escalatedQ(x, now) || x.status === 'sending')",
     "    var vis = sc.kind === 'admin' ? true : sc.kind === 'office' ? true /* patch OFFICEAPPR: everything, like an admin */", 'apx office vis')
once("  if (sc.kind === 'admin') c.push(['pm', 'Waiting on a PM', rows.filter(function(r){ return r.step === 'pm'; }).length]);",
     "  if (sc.kind === 'admin' || sc.kind === 'office') c.push(['pm', 'Waiting on a PM', rows.filter(function(r){ return r.step === 'pm'; }).length]);   /* patch OFFICEAPPR */", 'apx office chip')
infunc("function rowQueue(x, mine, now){", "function rowSub(a, mine, now){", [
    ("  var steps = arr(x.steps), lastStep = steps.indexOf(x.step) >= steps.length - 1;",
     "  var steps = arr(x.steps), lastStep = steps.indexOf(x.step) >= steps.length - 1, adm = realAdmin() || (!!W._gcOA && W._gcOA.canAct(x));   /* patch OFFICEAPPR */", 1),
    ("approve: x.status === 'waiting' && (mine || realAdmin()) ?", "approve: x.status === 'waiting' && (mine || adm) ?", 1),
    ("(realAdmin() || lastStep)", "(adm || lastStep)", 2),
    ("x.kind === 'portal_publish' || realAdmin() || lastStep", "x.kind === 'portal_publish' || adm || lastStep", 1),
], 'apx rowQueue')

# ── 4. the old approval queues (_gcCanApprove): the office approves any of them except payroll ──────────────────
once("""    if(isOwner(u)) return true;
    // Office manager may approve invoices & change orders (owner decision), same as owners for those.""",
"""    if(isOwner(u)) return true;
    if(isOffice(u)) return !/payroll|pay_?stub|paystub|paycheck|pay_?run/i.test(String(key||''));   /* patch OFFICEAPPR (owner 10/27): everything except payroll, any amount */
    // Office manager may approve invoices & change orders (owner decision), same as owners for those.""", 'legacy _gcCanApprove')

# ── 5. payroll stays Wesley / Nick only (supersedes "the office can approve payroll on payday", build 33.104) ───
once("""  if(isOffice()){
    var pd = payDateOf(run);""", """  if(isOffice()) return { ok:false, as:'office', why:'Payroll is approved by Wesley or Nick only (owner, 10/27). The office prepares it and sends it for approval.' };   /* patch OFFICEAPPR */
  if(false){
    var pd = payDateOf(run);""", 'payroll run office')
once("      if(!isOffice()){ alert('Only an owner or the office can approve payroll.'); return null; }",
     "      alert('Payroll is approved by Wesley or Nick only.'); return null;   /* patch OFFICEAPPR: never the office */", 'payroll week office')

# ── 6. bid e-mails waiting for an approval, and materials requests: the office too ──────────────────────────────
once("  if (isAdmin()) Object.keys(S.req).forEach(function(id){",
     "  if (isAdmin() || (W._gcOA && W._gcOA.office())) Object.keys(S.req).forEach(function(id){   /* patch OFFICEAPPR */", 'bid send approvals')
once("var out = [], adm = false; try { adm = !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) {}",
     "var out = [], adm = false; try { adm = !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) || !!(W._gcOA && W._gcOA.office()); } catch (e) {}   /* patch OFFICEAPPR */", 'materials approvals')

# ── 7. the phone field app: More → 🚗 My mileage ───────────────────────────────────────────────────────────────
once("      row('\\uD83D\\uDCB5','My Pay','mypay')+", "      row('\\uD83D\\uDCB5','My Pay','mypay')+\n      row('\\uD83D\\uDE97','My mileage','mileage')+ /* OFFICEAPPR */", 'field more row')
once("      else if(a==='mypay'){ if(window._gcOpenMyPayRecord) window._gcOpenMyPayRecord(); }",
     "      else if(a==='mypay'){ if(window._gcOpenMyPayRecord) window._gcOpenMyPayRecord(); }\n      else if(a==='mileage'){ if(window._gcMileage) window._gcMileage.open(); } /* OFFICEAPPR */", 'field more handler')

# ── 8. the pay stub: approved mileage is its own non-taxable line ───────────────────────────────────────────────
once("  if (n2(L.reimbursement) > 0) earn.push({ label: 'Reimbursement (not taxed)', amount: r2(L.reimbursement) });",
     "  var _gcMi = r2(Math.min(n2(L.mileage), n2(L.reimbursement)));   /* patch OFFICEAPPR: mileage on its own line */\n"
     "  if (n2(L.reimbursement) - _gcMi > 0.004) earn.push({ label: 'Reimbursement (not taxed)', amount: r2(n2(L.reimbursement) - _gcMi) });\n"
     "  if (_gcMi > 0) earn.push({ label: 'Mileage reimbursement (not taxed)', amount: _gcMi, miles: r2(L.mileageMiles) });", 'stub mileage')

# ── 8b. the change-order form's approval line: the office approves too ─────────────────────────────────────────
once("requires <b>owner approval</b> (Nick or Wesley)", "requires <b>owner approval</b> (Nick, Wesley or the office)", 'co form text')
once("Over $2,500: owner approval (Nick or Wesley)", "Over $2,500: owner approval (Nick, Wesley or the office)", 'co form text commercial')

# ── 9. the tail ────────────────────────────────────────────────────────────────────────────────────────────────
assert src.count('<script id="gc-patch-OFFICEAPPR">') == 0
src = src.rstrip('\n') + '\n<script id="gc-patch-OFFICEAPPR">\n' + TAIL + '\n</script>\n'
assert src.count(MARK) >= 1 and src.count('<script id="gc-patch-OFFICEAPPR">') == 1
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
