"""Idempotent patch DUPJOB2 (on top of DUPJOB): roles, not names; owners' jobs and leads are GrayCo's with no PM;
the Lead Estimator is every new job / lead / estimate's estimator; commercial types.

  Owner 11/02: "lead estimator is always estimator until there are 2 estimators, then the lead will assign it. Make sure
  any instance I say Glenn in the code is changed to lead estimator. ... Make sure all names and titles are general so
  when I fire people I can replace them with a new lead." — "Default commercial = Commercial Reno (sub bids, bid
  invites, the lead estimator's work); New Construction only for GrayCo's own GC commercial bids; never default to
  Residential." — "any jobs Nick creates in the CRM are GrayCo leads and Nick or Wesley has to assign that job; same if
  Wesley or any owner makes the lead: they go to no PM and get assigned by the owners/admin."

  1. Role slots, resolved at run time (no names): the Lead Estimator = window._gcDefEst() (patch EST4: the one active
     person with the Estimator role, or the Senior/Lead Estimator picked in settings when there are several; none
     picked → nobody, the admins assign); the Lead Roofing / Insurance managers = window._gcLeadRoles.holder()
     (gc_team_settings.leadRoles). window._gcLeadSlot(kind) returns the holder. Owners = the Admin / owner role.
  2. "Commercial person" (DUPJOB's title check) → the Lead Estimator, or anyone with the Estimator role.
  3. Commercial type: "Commercial Reno"; "New Construction" when the lead is GrayCo's own GC (prime) commercial bid
     (window._gcPrimeSub). Unknown → blank + "Pick job type" (unchanged).
  4. The Lead Estimator is the default estimator of every new job made by code (window._gcJA.stamp), every lead or job
     entered by hand (patch CC2 / LEADHOLD stamp), the estimate builder's empty estimator box, and ESTIN / ESTPDF jobs.
  5. A job or lead created by an owner (Admin role), on any path: GrayCo's (company) lead, PM blank (never the creator),
     needsPm — shown on the admins' "N jobs have no PM assigned" alert and on 🧾 Missing job data ("PM — an owner
     assigns it"). Launch Job no longer defaults the PM to an owner who launches it. The office entering a job: no PM.

Every find-string must occur exactly the given number of times (else nothing is written).
Usage: python3 tools/patch_DUPJOB2.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_DUPJOB2__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_DUPJOB__' in src, 'run tools/patch_DUPJOB.py first'


def once(old, new, label, count=1):
    global src
    n = src.count(old)
    assert n == count, ('anchor count != %d' % count, label, n)
    src = src.replace(old, new)


# ── 1-2. role slots; "commercial person" is a role ─────────────────────────────────────────────────────────────────────
once("function commercialPerson(n){ var u = userOf(n); return !!u && /commercial/.test(roleText(u)); }",
     """/* __GC_PATCH_DUPJOB2__ — roles, not names: the Lead Estimator / lead managers are resolved from the staff list at run time */
function isEstUser(u){ return !!u && u.active !== false && !isOfficeUser(u) && /estimat/i.test(s(u.role) + ' ' + s(u.profile)); }
function leadEst(){ try { var d = typeof W._gcDefEst === 'function' ? W._gcDefEst() : null; if (d && (s(d.name) || s(d.email)) && !d.none && !d.ambiguous) return { name: s(d.name), email: low(d.email), label: 'Lead Estimator' }; } catch (e) {} return null; }
function isLeadEst(n){ var h = leadEst(), u = userOf(n); if (!h || !u) return false; return (!!h.email && low(u.email) === h.email) || low(clean(u.name)) === low(clean(h.name)); }
/* the Lead Estimator's work, or an estimator's (the estimators do the commercial work) */
function commercialPerson(n){ return isLeadEst(n) || isEstUser(userOf(n)); }
function meUser(){ var m = W._gcMeNow || (W._crm && W._crm.currentUser) || {}; var u = userOf(m.name); if (!u) { try { u = userOf(low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email())); } catch (e) {} } return u; }
W._gcLeadEstimator = leadEst; W._gcIsLeadEstimator = isLeadEst; W._gcMeUser2 = meUser;
/* a role slot's holder: 'estimator' (or 'bid') → the Lead Estimator; 'roofing' / 'insurance' → patch HOT2's lead roles */
W._gcLeadSlot = function(kind){ if (/^(estimator|bid)$/.test(s(kind))) return leadEst(); try { return W._gcLeadRoles && W._gcLeadRoles.holder ? W._gcLeadRoles.holder(kind) : null; } catch (e) { return null; } };
/* the PM a form may fill in by itself for the person using it: a PM, never an owner (the owners assign) nor the office */
W._gcAutoPmFor = function(n){ var u = userOf(n); return canPM(n) && !isOwnerUser(u) ? clean(n) : ''; };""",
     'commercialPerson')

# ── 3. commercial type: own GC bid → New Construction ──────────────────────────────────────────────────────────────────
once("  if (people.some(commercialPerson) || isBidInvite(l) || /commercial/i.test(s(e.jobType) + ' ' + s(l && (l.projectType || l.type || l.leadKind)))) return COMMERCIAL_TYPE;",
     "  if (people.some(commercialPerson) || isBidInvite(l) || /commercial/i.test(s(e.jobType) + ' ' + s(l && (l.projectType || l.type || l.leadKind)))) {\n    try { if (l && W._gcPrimeSub && W._gcPrimeSub.of(l) === 'prime') return 'New Construction'; } catch (x) {}   /* GrayCo's own GC commercial bid */\n    return COMMERCIAL_TYPE;   /* sub bids, bid invites, the Lead Estimator's work */\n  }",
     'jobTypeFor prime')

# ── 4. the Lead Estimator by default ───────────────────────────────────────────────────────────────────────────────────

# ── 5. code-made jobs: the Lead Estimator; an owner's job is GrayCo's with no PM ──────────────────────────────────────
once("  var t = s(p.type);\n  if (!t || RAW.test(t)) {",
     """  var cr = userOf(p.createdBy) || meUser();
  if (isOwnerUser(cr) && !p._ccServer && !p._ccAuto) {   /* DUPJOB2: an owner's job is a GrayCo lead; the owners assign the PM */
    if (s(p.pm) && low(clean(p.pm)) === low(clean(cr.name)) && via !== 'launch' && via !== 'proj') { p.pmCleared = p.pmCleared || { was: p.pm, at: new Date().toISOString(), why: 'an owner made it — the owners assign the PM (patch DUPJOB2)' }; p.pm = ''; }
    Object.assign(p, { commissionSource: 'company', owner: 'GrayCo', pmSourced: false, selfGenerated: false, leadIsMine: false, ownLead: false, graycoOrigin: true, broughtInBy: '', leadOwner: '' });
    if (!s(p.leadSource) || /^self-generated/i.test(s(p.leadSource))) p.leadSource = 'GrayCo';
  }
  if (!s(p.pm) && isOwnerUser(cr)) p.needsPm = true;
  var t = s(p.type);
  if (!t || RAW.test(t)) {""",
     'fixNewJob owner + estimator')
once("  if (/commercial/i.test(s(p.type))) p.isCommercial = true;\n  if (s(p.type)) delete p.needsType; else p.needsType = true;",
     "  if (/commercial/i.test(s(p.type))) p.isCommercial = true;\n  if (s(p.type)) delete p.needsType; else p.needsType = true;\n  if (!s(p.estimator)) { var le = leadEst(); if (le && le.name) { p.estimator = le.name; p.estimatorDefault = true; } }   /* DUPJOB2: the Lead Estimator by default (after the type: a default is no type signal) */",
     'fixNewJob estimator default')
once("    var nt = jobTypeFor({ est: e || { jobType: t }, lead: l, people: [p.estimator, p.pmCleared && p.pmCleared.was, p.ccCreator] });",
     "    var nt = jobTypeFor({ est: e || { jobType: t }, lead: l, people: [p.estimatorDefault ? '' : p.estimator, p.pmCleared && p.pmCleared.was, p.ccCreator] });",
     'fixNewJob type people')
once("  var est = [l && l.estimator, e.estimator, e.by].map(clean).filter(canEstimate)[0] || '';",
     "  var est = [l && l.estimator, e.estimator, e.by].map(clean).filter(canEstimate)[0] || '', byDefault = false;\n  if (!est && leadEst()) { est = leadEst().name; byDefault = true; }   /* DUPJOB2: else the Lead Estimator */",
     'newJobPeople lead estimator')
once("  return { pm: pm, estimator: est };\n};", "  return { pm: pm, estimator: est, byDefault: byDefault };\n};", 'newJobPeople return')
once("    pm: NJ.pm, estimator: NJ.estimator,   /* patch DUPJOB: the estimator is never made the PM */",
     "    pm: NJ.pm, estimator: NJ.estimator, estimatorDefault: !!NJ.byDefault || undefined,   /* patch DUPJOB: the estimator is never made the PM */",
     'ESTIN estimatorDefault')

# Launch Job: never an owner (or the office) as the PM by default
once('pm:Le.pm||(window._gcCanPM&&!window._gcCanPM(n.name)?"":n.name)/* patch DUPJOB */',
     'pm:Le.pm||(window._gcAutoPmFor?window._gcAutoPmFor(n.name):"")/* patch DUPJOB2 */', 'launch pm', count=2)

# patch CC2 / LEADHOLD stamp (every job / lead entered by hand): an owner or the office → no PM; the Lead Estimator
once("  if (!s(o.pm) && !keepRouting) o.pm = m.name;",
     """  if (!s(o.pm) && !keepRouting && !adm) o.pm = m.name;   /* patch DUPJOB2: an owner / the office → no PM; the owners assign it */
  if (adm && !s(o.pm) && kind === 'job') o.needsPm = true;
  if (!s(o.estimator)) { try { var _le = W._gcLeadEstimator && W._gcLeadEstimator(); if (_le && _le.name) o.estimator = _le.name; } catch (e) {} }   /* the Lead Estimator by default */""",
     'LEADHOLD stamp')

# the estimate builder's empty estimator box: the Lead Estimator, else the person signed in
once("      if(f && !f.value){ var me=currentUserName(); if(me) f.value=me; }",
     "      if(f && !f.value){ var _le=window._gcLeadEstimator&&window._gcLeadEstimator(); var me=(_le&&_le.name)||currentUserName(); if(me){ if(window._gcSetEstPick) window._gcSetEstPick(f, me); else f.value=me; } }   /* patch DUPJOB2 */",
     'builder default 1')
once("      var who=currentName();\n      if(who){ f.value=who; }",
     "      var _le=window._gcLeadEstimator&&window._gcLeadEstimator(); var who=(_le&&_le.name)||currentName();   /* patch DUPJOB2: the Lead Estimator */\n      if(who){ if(window._gcSetEstPick) window._gcSetEstPick(f, who); else f.value=who; }",
     'builder default 2')
once("try{ if(ev.target && ev.target.id==='ej-est' && !ev.target.value.trim()){ var w=currentName(); if(w) ev.target.value=w; } }catch(e){}",
     "try{ if(ev.target && ev.target.id==='ej-est' && !ev.target.value.trim()){ var _le=window._gcLeadEstimator&&window._gcLeadEstimator(); var w=(_le&&_le.name)||currentName(); if(w){ if(window._gcSetEstPick) window._gcSetEstPick(ev.target, w); else ev.target.value=w; } } }catch(e){}",
     'builder default 3')

# the admins' "no PM assigned" alert also lists an owner's new job waiting for its PM
once("      if(['active','approved'].indexOf(p.status) < 0) return false;",
     "      if(['active','approved'].indexOf(p.status) < 0 && !(p.needsPm === true && !/lost|dead|cancel|complete|closed|archiv/i.test(String(p.status||'')))) return false;   /* patch DUPJOB2 */",
     'no-PM alert')

# 🧾 Missing job data (the page's copy of _lib/jobdata.js)
JD_A = "{ key: 'type', label: 'Job type (pick one)', group: 'Job', from: 'bidding',"
JD_B = "{ key: 'pmAssign', label: 'PM — an owner assigns it', group: 'Job', from: 'bidding', to: 'estimate', test: function(p){ return !(p.needsPm === true && !s(p.pm || p.projectManager || p.pmName)); }, fix: { field: 'pm', input: 'pm' } },\n    " + JD_A
once(JD_A, JD_B, 'jobdata copy pmAssign')

open(path, 'w', encoding='utf-8').write(src)
print('patched DUPJOB2')
