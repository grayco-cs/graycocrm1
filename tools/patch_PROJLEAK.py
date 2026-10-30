#!/usr/bin/env python3
"""Idempotent patch PROJLEAK: the Projects screen shows every company project only to Wesley, Nick and the office.

  Owner 10/30: "nick and wesley can see all projects and all pms" (the office has full access too). The Projects table
  already followed that rule (React: _gcIsOwnerAdmin on the person being viewed, else window._gcProjVisible), but parts
  added around it counted / listed every job for everyone:
    year bar       "Year: All (64) · 2027 (2) · 2026 (62)"                  -> counts only the person's jobs
    Find any job   "64 jobs on file", search over every job / invoice / …    -> their jobs and records on their jobs only;
                   orphan POs (invoices with no job) and "Make Active"         orphan POs for admins / office only
    Merge Jobs     button + picker of every job                             -> admins / office only
    estimator      "🏢 All company projects" switch (patch HOT2), on a tap  -> only for an estimator an admin allowed
                   (and a switch re-counts the year bar / "jobs on file" at once):
                   Admin → Team roles & Senior PM → "📐 Estimators who may see every project" (gc_team_settings
                   .estAllProjects = e-mails); off for everyone until an admin ticks them
  One shared test: window._gcProjSeesAll() / _gcProjScope(list) / _gcProjScopeIds() (GrayCo Photos uses it too).
Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_PROJLEAK.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_PROJLEAK__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

HELP = r"""/* __GC_PATCH_PROJLEAK__ — patch PROJLEAK: who sees every project on the Projects screen. The same test as the React
   Projects table (_gcIsOwnerAdmin on the person being viewed — an admin's "View as" follows the viewed person): Admin or
   Office role, owner pay type, or the owner / office sign-ins. Everyone else: the jobs window._gcProjVisible gives them. */
window._gcProjViewer = function(){ var vo = window._gcMeNow || null; try { if (typeof window._gcVASUser === 'function') vo = window._gcVASUser(vo) || vo; } catch (e) {} return vo; };
window._gcProjSeesAll = function(){
  try {
    var vo = window._gcProjViewer() || {}, r = String(vo.role || '').toLowerCase(), pt = String(vo.payType || '').toLowerCase(), em = String(vo.email || '').toLowerCase();
    return r === 'admin' || /office/.test(r) || pt === 'owner' || em === 'office@grayco-cs.com' || em === 'wjohnson@grayco-cs.com' || em === 'nthomas@grayco-cs.com';
  } catch (e) { return true; }
};
window._gcProjScope = function(list){
  list = Array.isArray(list) ? list : [];
  if (window._gcProjSeesAll()) return list;
  var vo = window._gcProjViewer(); if (!vo) return [];
  return list.filter(function(j){
    if (!j) return false;
    try { if (typeof window._gcProjVisible === 'function') return !!window._gcProjVisible(j, vo); if (typeof window._gcSamePM === 'function') return !!window._gcSamePM(j.pm, vo, j); } catch (e) { return false; }
    return j.pm === vo.name;
  });
};
window._gcProjScopeIds = function(){ var m = {}; window._gcProjScope((window._crm && window._crm.projects) || []).forEach(function(p){ if (p && p.id) m[p.id] = 1; }); return m; };
"""
# 1. the shared test, ahead of every user of it
once("// GrayCo CRM — Merge Jobs\n// Injects a \"⊕ Merge Jobs\" button into the Projects tab header.",
     HELP + "// GrayCo CRM — Merge Jobs\n// Injects a \"⊕ Merge Jobs\" button into the Projects tab header. (patch PROJLEAK: admins / office only)", 'helpers')
# 2. Merge Jobs: admins / office only
once("function injectMergeBtn(){\n  if(document.getElementById('gc-merge-btn')) return;",
     "function injectMergeBtn(){\n  if(!window._gcProjSeesAll || !window._gcProjSeesAll()){ var mb=document.getElementById('gc-merge-btn'); if(mb) mb.remove(); return; }   /* patch PROJLEAK */\n  if(document.getElementById('gc-merge-btn')) return;", 'merge button')
once("window._openMergeJobs=function(presetSource){\n",
     "window._openMergeJobs=function(presetSource){\n  if(window._gcProjSeesAll && !window._gcProjSeesAll()) return;   /* patch PROJLEAK: admins / office only */\n", 'merge open')
# 3. the year bar counts the person's own jobs
once("      var projects=(window._crm&&window._crm.projects)||[];\n      var years={};",
     "      var projects=window._gcProjScope((window._crm&&window._crm.projects)||[]);   /* patch PROJLEAK */\n      var years={};", 'year bar')
# 4. "Find any job": their jobs (and records on their jobs) only; the count; orphan POs for admins / office
once("  var k=low(q); if(k.length<2) return [];\n  var kpo=poNorm(q);",
     "  var k=low(q); if(k.length<2) return [];\n  var kpo=poNorm(q);\n  var lim=window._gcProjSeesAll()?null:window._gcProjScopeIds();   /* patch PROJLEAK */", 'find scope')
once("      var o=list[i]; if(!o) continue;\n      var h=hay(o);",
     "      var o=list[i]; if(!o) continue;\n      if(lim && !lim[w.key==='projects' ? o.id : (o.pid||o.projectId||o.jobId||'')]) continue;   /* patch PROJLEAK */\n      var h=hay(o);", 'find filter')
once("  var orphans=window._gcOrphanPOs();", "  var orphans=window._gcProjSeesAll()?window._gcOrphanPOs():[];   /* patch PROJLEAK */", 'orphans')
once("  if(note) note.textContent=projects().length+' jobs on file';",
     "  if(note) note.textContent=window._gcProjScope(projects()).length+' jobs on file';   /* patch PROJLEAK */", 'jobs on file')
# 5. the estimator's "All company projects": only when an admin allowed it
once("function mode(){ try { return localStorage.getItem(modeKey()) === 'all' ? 'all' : 'mine'; } catch (e) { return 'mine'; } }",
     "/* patch PROJLEAK: \"All company projects\" only for an estimator an admin allowed (Admin → Team roles & Senior PM →\n"
     "   📐 Estimators who may see every project; gc_team_settings.estAllProjects). An admin's \"View as Estimator\" follows the person viewed. */\n"
     "function estAllowed(){\n"
     "  try {\n"
     "    var ts = W._gcPeople && typeof W._gcPeople.team === 'function' ? W._gcPeople.team() : null, l = arr(ts && ts.estAllProjects).map(low); if (!l.length) return false;\n"
     "    var e = ''; try { if (W._gcVAS && W._gcVAS.active()) e = low(W._gcVAS.email()); } catch (x) {}\n"
     "    if (!e) e = low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email());\n"
     "    return !!e && l.indexOf(e) >= 0;\n"
     "  } catch (e) { return false; }\n"
     "}\n"
     "function mode(){ try { return localStorage.getItem(modeKey()) === 'all' && estAllowed() ? 'all' : 'mine'; } catch (e) { return 'mine'; } }", 'est mode')
once("  if (view() !== 'projects' || !isEst()) { if (old) old.remove(); return; }",
     "  if (view() !== 'projects' || !isEst() || !estAllowed()) { if (old) old.remove(); return; }   /* patch PROJLEAK */", 'est bar')
once("function leadRolesHtml(){",
     "/* patch PROJLEAK: which estimators may switch to \"🏢 All company projects\" */\n"
     "function estAllHtml(){\n"
     "  var on = arr(teamSettings().estAllProjects).map(low), ests = active(allUsers()).filter(function(u){ return /estimator/i.test(s(u.role)) && s(u.email); }).sort(function(a, b){ return s(a.name).localeCompare(s(b.name)); });\n"
     "  return '<h4 style=\"margin:16px 0 6px\">📐 Estimators who may see every project</h4>'\n"
     "    + '<div style=\"color:#475569;margin-bottom:6px\">Only Wesley, Nick and the office see every project. An estimator sees the jobs they estimated (Projects and GrayCo Photos); tick one here to give them the “🏢 All company projects” button too.</div>'\n"
     "    + (ests.length ? ests.map(function(u){ var em = low(u.email); return '<label style=\"display:block;margin:3px 0\"><input type=\"checkbox\" data-pmg-est=\"' + esc(em) + '\"' + (on.indexOf(em) >= 0 ? ' checked' : '') + '> ' + esc(u.name) + '</label>'; }).join('')\n"
     "      + '<button type=\"button\" class=\"gc-adm-btn\" data-pmg-act=\"estAll\">Save</button>' : '<div style=\"color:#475569\">No active estimators.</div>');\n"
     "}\n"
     "function leadRolesHtml(){", 'est admin html')
once("    + leadRolesHtml()   /* patch HOT2 */", "    + leadRolesHtml()   /* patch HOT2 */\n    + estAllHtml()   /* patch PROJLEAK */", 'est admin section')
once("  if (a === 'senior') setSenior(val('senior'))",
     "  if (a === 'estAll') {   /* patch PROJLEAK */\n"
     "    var ems = Array.prototype.filter.call(UI.box.querySelectorAll('[data-pmg-est]'), function(x){ return x.checked; }).map(function(x){ return x.getAttribute('data-pmg-est'); });\n"
     "    setTeam({ estAllProjects: ems }).then(function(ok){ UI.msg = ok ? 'Estimators who may see every project: ' + (ems.length ? ems.join(', ') : 'none') + '.' : 'Saved on this computer only — the cloud did not answer.'; paint(); toast(UI.msg, !ok); });\n"
     "    return;\n"
     "  }\n"
     "  if (a === 'senior') setSenior(val('senior'))", 'est admin save')
# 6. switching "My estimated" / "All company" re-counts at once: the year bar is rebuilt (its 4-s timer) and the
#    "N jobs on file" line is set now (the find card repaints only on the idle beat)
once("function rerender(){ try { var m = W._gcMeNow; if (m && typeof W._gcSetMeUser === 'function') W._gcSetMeUser(Object.assign({}, m)); } catch (e) {} later(bar, 60); }",
     "function rerender(){ try { var m = W._gcMeNow; if (m && typeof W._gcSetMeUser === 'function') W._gcSetMeUser(Object.assign({}, m)); } catch (e) {} later(bar, 60);\n"
     "  try { var yb = D.getElementById('_gcYearBar'); if (yb) yb.remove(); var nt = D.getElementById('_fjNote'); if (nt && W._gcProjScope) nt.textContent = W._gcProjScope(arr(W._crm && W._crm.projects)).length + ' jobs on file'; } catch (e) {}   /* patch PROJLEAK */\n}", 'est re-count')
assert src.count(MARK) == 1, src.count(MARK)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
