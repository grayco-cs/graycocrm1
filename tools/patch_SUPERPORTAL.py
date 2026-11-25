# patch SUPERPORTAL (owner 11/25): "Make sure the superintendent can post updates to the customer or sub portal, have on his
# left tabs the portals." + "superintendent is responsible for all of the paperwork to be filled out etc."
#   1. A Superintendent (role: Superintendent / Field Supervisor — by role, never by name) gets the PM's portal powers on HIS jobs
#      (superintendent, PM or APM on the job): 👤 Customer portal + 🔧 Sub portal on the Field job cards, the job field page, the
#      desk 🏠 Portal card's ✏️ Open portal (PORTALED follows _gcFP.perms) and the 📒 Site Book job page. Posting reuses the
#      existing functions (patch Q's 📣 post, patch SUB's sub thread) — the same rules, the same Approvals.
#   2. Left tabs: 🔨 Sub Portal on the Superintendent's / Field Supervisor's default tabs (merged into the role table, the saved one
#      included), and a new 👤 Customer portals tab (view id custportals) for admin / office / PM / APM / Superintendent.
#   3. Paperwork: on his jobs the Superintendent adds a required paper (JOBREQ) and archives / restores job files (JOBINFO's
#      📄 Documents) like the PM; the paperwork To-Dos / reminders that went to the job's PM go to the job's superintendent
#      when one is set (an active person on the team), the PM as the fallback (and named on the To-Do as pmCc).
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
s = open(P, encoding='utf-8').read()
def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:90])
    s = s.replace(a, b)

PT = "(window._gcPaperTo ? window._gcPaperTo({p}) : s({p}.pm))"
PC = "(window._gcPaperCc ? window._gcPaperCc({p}) : '')"

# ── 0. the app's view: 👤 Customer portals (bundle, the view switch's prefix) ──
rep('/* patch MITWS */if(P==="planbuilder")',
    '/* patch MITWS */if(P==="custportals")return e.jsx("div",{key:"gc-view-custportals",id:"gc-cpx-mount",ref:function(el){try{if(el&&window._gcSuperPortal)window._gcSuperPortal.mount(el)}catch(_x){}},style:{width:"100%",minHeight:"calc(100vh - 60px)"}});/* patch SUPERPORTAL */if(P==="planbuilder")')

# ── 1. FIELDPORTAL: the portal buttons — + a Superintendent on his jobs ──
rep("""  var all = seesAll(), mine = all || own(p), pm = !all && mine && pmRole();
  return { cust: all || pm, sub: all || pm, photos: mine, msg: mine };""",
    """  var all = seesAll(), mine = all || own(p), pm = !all && mine && pmRole();
  var sp = !all && !pm && (function(){ try { return !!(W._gcSuperPortal && W._gcSuperPortal.can(p)); } catch (e) { return false; } })();   /* patch SUPERPORTAL: a Superintendent on his jobs */
  return { cust: all || pm || sp, sub: all || pm || sp, photos: mine, msg: mine };""")

# ── 2. SUPERVIS: a Field Supervisor is a superintendent too (the jobs where he is the job team's superintendent) ──
rep("function isSuperRole(){ try { return !!(W._gcRP && typeof W._gcRP.role === 'function' && W._gcRP.role() === 'Superintendent'); } catch (e) { return false; } }",
    "function isSuperRole(){ try { return !!(W._gcRP && typeof W._gcRP.role === 'function' && /^(superintendent|field supervisor)$/i.test(String(W._gcRP.role() || '').trim())); } catch (e) { return false; } }   /* patch SUPERPORTAL: + Field Supervisor */")

# FIELD: a Superintendent's GrayCo Field home lists his jobs — superintendent, PM or APM on the job (myJobsOf's rule)
rep("  if (k === 'super') return [p.superintendent, p.superName, p.super].some(function(x){ return low(x) === n; });",
    "  if (k === 'super') return [p.superintendent, p.superName, p.super, p.pm, p.apm, p.assistantPm].some(function(x){ return low(x) === n; });   /* patch SUPERPORTAL: + the jobs he runs as PM / APM */")

# ── 3. the 📒 Site Book job page: 👤 Customer portal · 🔧 Sub portal in its header ──
rep("""<h2>' + esc(p.name) + '</h2><span class="sp"></span>' + navA(p.address) + '</div>' +""",
    """<h2>' + esc(p.name) + '</h2><span class="sp"></span>' + (W._gcSuperPortal ? W._gcSuperPortal.sbBtns(p) : '') /* patch SUPERPORTAL */ + navA(p.address) + '</div>' +""")

# ── 4. paperwork To-Dos: the job's superintendent first, the PM as the fallback ──
# OFFICETAB: 📝 No daily log for 3+ working days
rep("if (wd == null || wd >= 3) add(p.pm, 'nolog',",
    "if (wd == null || wd >= 3) add((window._gcPaperTo ? window._gcPaperTo(p) : '') || p.pm, 'nolog',")   # patch SUPERPORTAL
# LEADASB: give the customer the lead / asbestos papers
rep("Keep signed papers 3 years.', assignee: s(p.pm), addedBy: 'CRM',",
    "Keep signed papers 3 years.', assignee: " + PT.format(p='p') + ", pmCc: " + PC.format(p='p') + " /* patch SUPERPORTAL */, addedBy: 'CRM',")
# LEADASB3: day 20 / day 28 completion papers
rep("l.push({ id: id, kind: 'leadasb', pid: w.p.id, label: x.label, note: x.note, assignee: s(w.p.pm), prio: x.prio,",
    "l.push({ id: id, kind: 'leadasb', pid: w.p.id, label: x.label, note: x.note, assignee: " + PT.format(p='w.p') + ", pmCc: " + PC.format(p='w.p') + " /* patch SUPERPORTAL */, prio: x.prio,")
# ENVCOMP: state notices, air samples, crew papers
rep("l.push({ id: id, kind: 'envcomp', pid: w.p.id, label: w.label, note: w.note, assignee: s(w.p.pm), prio: w.prio,",
    "l.push({ id: id, kind: 'envcomp', pid: w.p.id, label: w.label, note: w.note, assignee: " + PT.format(p='w.p') + ", pmCc: " + PC.format(p='w.p') + " /* patch SUPERPORTAL */, prio: w.prio,")
# ENVDOCS: the job's environmental papers (a program's yearly review keeps its own assignee)
rep("assignee: s(w.assignee || (w.p && w.p.pm)), prio: w.prio,",
    "assignee: s(w.assignee || (w.p && (window._gcPaperTo ? window._gcPaperTo(w.p) : w.p.pm))), pmCc: w.assignee || !w.p ? '' : " + PC.format(p='w.p') + " /* patch SUPERPORTAL */, prio: w.prio,")
# EPAHUD (two writers: EPAHUD and PAPERS) — the EPA / HUD papers due on the job
rep("want['EPAHUD_' + p.id + '_' + z.x.k] = { p: p, assignee: s(p.pm) || 'Office', prio: z.d.over ? 'high' : 'med',",
    "want['EPAHUD_' + p.id + '_' + z.x.k] = { p: p, assignee: " + PT.format(p='p') + " || 'Office' /* patch SUPERPORTAL */, prio: z.d.over ? 'high' : 'med',")
rep("want['EPAHUD_' + p.id + '_' + z.x.k] = { p: p, assignee: s(p.pm) || 'Office', prio: past && req ? 'high' : 'med',",
    "want['EPAHUD_' + p.id + '_' + z.x.k] = { p: p, assignee: " + PT.format(p='p') + " || 'Office' /* patch SUPERPORTAL */, prio: past && req ? 'high' : 'med',")
rep("if (!cur) { l.push({ id: id, kind: 'epahud', pid: w.p.id, label: w.label, note: w.note, assignee: w.assignee, prio: w.prio,",
    "if (!cur) { l.push({ id: id, kind: 'epahud', pid: w.p.id, label: w.label, note: w.note, assignee: w.assignee, pmCc: /^EPAHUD_ESC_/.test(id) ? '' : " + PC.format(p='w.p') + " /* patch SUPERPORTAL */, prio: w.prio,")
rep("var p = proj(y.pid); if (!office() && !(p && low(p.pm) === low(me()))) return;",
    "var p = proj(y.pid); if (!office() && !(p && (low(p.pm) === low(me()) || low(y.assignee) === low(me())))) return;   /* patch SUPERPORTAL: + the person it is on (the superintendent) */")
# JOBINFO: 📷 finish photos at 100 % (closeout)
rep("else l.push({ id: id, kind: kind, pid: s(p.id), label: label, note: note || '', assignee: s(p.pm), forRole: s(p.pm) ? '' : 'office',",
    "else l.push({ id: id, kind: kind, pid: s(p.id), label: label, note: note || '', assignee: " + PT.format(p='p') + ", pmCc: " + PC.format(p='p') + " /* patch SUPERPORTAL */, forRole: " + PT.format(p='p') + " ? '' : 'office',")
# AUT3: a dated inspection on the schedule; a template step for the super
rep("type: 'inspection', assignee: s(p.pm), address: s(p.address), notes: 'From the inspections list'",
    "type: 'inspection', assignee: " + PT.format(p='p') + " /* patch SUPERPORTAL */, address: s(p.address), notes: 'From the inspections list'")
rep("assignee: /^(PM|super)$/i.test(t.who) ? s(p.pm) : '',",
    "assignee: /^super$/i.test(t.who) ? " + PT.format(p='p') + " /* patch SUPERPORTAL */ : /^PM$/i.test(t.who) ? s(p.pm) : '',")

# ── 5. paperwork powers on his jobs ──
# JOBREQ: ＋ Add a required paper — the job's PM … and its superintendent
rep("""  return !!((n && (low(p.pm) === n || low(p.projectManager) === n)) || (e && (low(p.pmEmail) === e || low(p.pm) === e)) || (r && s(r.id) && s(p.pmId) === s(r.id)));""",
    """  return !!((n && (low(p.pm) === n || low(p.projectManager) === n)) || (e && (low(p.pmEmail) === e || low(p.pm) === e)) || (r && s(r.id) && s(p.pmId) === s(r.id)))
    || (function(){ try { return !!(W._gcSuperPortal && W._gcSuperPortal.can(p)); } catch (x) { return false; } })();   /* patch SUPERPORTAL: the job's superintendent does the paperwork */""")
# JOBINFO: 🗄 Archive / ♻ Restore a job file
rep("    if (!canEdit(proj(p.id) || p)) { toast('Only the office, an admin or the job\\'s own PM can archive files.'); return; }",
    "    if (!canEdit(proj(p.id) || p) && !(function(){ try { return !!(W._gcSuperPortal && W._gcSuperPortal.can(proj(p.id) || p)); } catch (x) { return false; } })()) { toast('Only the office, an admin or the job\\'s own PM or superintendent can archive files.'); return; }   /* patch SUPERPORTAL */")

# ── 6. the patch itself (right before PORTALED) ──
JS = open(__file__.replace('patch_SUPERPORTAL.py', 'superportal.js'), encoding='utf-8').read()
rep('<script id="gc-patch-portaled">', JS + '<script id="gc-patch-portaled">')
open(P, 'w', encoding='utf-8').write(s)
print('SUPERPORTAL ok')
