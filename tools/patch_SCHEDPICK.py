#!/usr/bin/env python3
"""Idempotent patch SCHEDPICK (owner 11/01, ROTC Cordova PO T724: "how did all of this get in there, I don't hate it but
it's wrong and should be chosen to be on there when making schedule etc, that schedule is completely made up"; then
"the templates DON'T APPLY AUTOMATICALLY UNLESS I CLICK APPLY TEMPLATES").

Why it happened: patch AUT3's kickoff (STAGE_RUN.signed) ran draftSchedule() when the job reached "signed" (Oct 22,
16:01 UTC): type "New Construction" → the "Large commercial" template → 16 rows with draft:true written straight into
gc_kv "schedule", and the same moment the permit checklist, a contract draft and the job's customer-portal plan
(p.schedPlan, 14 steps marked portal). Nothing on any screen looked at draft, so the suggestions showed everywhere.
The e-signature path (REL applyContract) applied the template the same way when a customer signed in the portal.

  1. CORE (first script after BOOTSAFE, tools/schedpick_core.js): window._gcSchedDraft / _gcSchedVisible — a
     template suggestion is not the schedule; a duplicate automatic Start / Finish milestone is hidden (kept) when a
     person-made start / end item is on the same day for the same job.
  2. The CRM's own screens: the schedule state is renamed (__gcLa0, what is saved, synced, exported and backed up,
     and what window._crm.schedule carries); every screen of the CRM reads la = _gcSchedVisible(__gcLa0) — the
     Schedule list, calendars, the dashboard, the job pages.
  3. The other readers that SHOW or NOTIFY: smart digest, schedule confirmations, printable schedules, iPhone .ics,
     Field schedule editor (list only — it still saves the full list), triple-booking guard, PM alerts, sub agreement
     dates, voice schedule, job tab visibility, crew names, Field "today", Office TV slides, sub-conflict toasts,
     sub views, capacity grids, the next date on a job, field "today on this job", sub days, job timeline.
  4. Automatic Start / Finish: not created when the job already has a person-made start / end item; new ones say
     "Job start date" / "Job end date" (never "Auto").
  5. AUT3: no template is applied by an automation (kickoff, e-signature): templates are OFFERED on the job
     (tools/schedpick_tail.js: 📋 Templates bar). The draw default, the permit & inspection checklist and the kickoff
     papers (contract, work authorization) are offered with their own Apply / Make. The final walkthrough is a punch
     SUGGESTION (Punch tab), not an item. The template chain: a recurring / reminder task (weekly OAC, monthly pay
     apps, retainage, depreciation, invoices) is never what another task waits on; Large commercial's Demo waits on
     the pre-construction meeting and the permit; a picked template can be fitted to the job's start → end dates.
     Stage / progress / SLA / welcome-e-mail steps never come from a suggestion. The customer-portal plan marks
     suggestions (draft) and is rebuilt when tasks are added or dismissed.
  6. PM Field Controls: the job-type checklist is offered ("📋 Apply the checklist"); a list the old rule filled gets a
     one-time keep / remove.
  7. ⚙ Automations switch texts say "offered", not "made"."""
import sys, os
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
HERE = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
MARK = '/* patch SCHEDPICK */'
if MARK in t: print('SCHEDPICK: already patched'); sys.exit(0)
def once(a, b, n=1):
    global t
    c = t.count(a); assert c == n, ('SCHEDPICK anchor', c, a[:100]); t = t.replace(a, b)
def near(before, a, b, within=4000):
    """replace the first `a` after the unique `before`"""
    global t
    c = t.count(before); assert c == 1, ('SCHEDPICK context', c, before[:100])
    i = t.index(before); j = t.find(a, i, i + within + len(before)); assert j >= 0, ('SCHEDPICK near', before[:60], a[:60])
    t = t[:j] + b + t[j + len(a):]
def read(f):
    x = open(os.path.join(HERE, f), encoding='utf-8').read().rstrip('\n'); assert '</script>' not in x, f; return x
V = 'window._gcSchedVisible'

# 1. CORE, right after the first script (BOOTSAFE)
i = t.index('</script>') + len('</script>')
t = t[:i] + '\n<script id="gc-patch-schedpick-core">\n' + MARK + '\n' + read('schedpick_core.js') + '\n</script>' + t[i:]

# 2. the CRM's own state: the full list is saved / synced / exported; the screens read the visible list
once('[la,_rn0]=ce.useState([]),rn=(v)=>', '[__gcLa0,_rn0]=ce.useState([]),la=(window._gcSchedVisible?window._gcSchedVisible(__gcLa0):__gcLa0),rn=(v)=>')
once('ma("schedule",la);try{if(window._supaUpsert)window._supaUpsert("schedule",la);}catch(_su){}}},[la])',
     'ma("schedule",__gcLa0);try{if(window._supaUpsert)window._supaUpsert("schedule",__gcLa0);}catch(_su){}}},[__gcLa0])')
once('openProject:be,schedule:la,candidates:Yn', 'openProject:be,schedule:__gcLa0,candidates:Yn')
once('schedule:la,bids:hr', 'schedule:__gcLa0,bids:hr')
once('warrs:Ts,schedule:la,laborRates', 'warrs:Ts,schedule:__gcLa0,laborRates')

# 3. readers that show or notify
once('var sched=(crm().schedule||[]); var mn=myName();', 'var sched=' + V + '(crm().schedule||[]); var mn=myName();')
once('  function schedule(){ return crm().schedule||[]; }', '  function schedule(){ return ' + V + '(crm().schedule||[]); }')
once('  function schedule(){ return crm().schedule || []; }', '  function schedule(){ return ' + V + '(crm().schedule || []); }')
once("var sched=((window._crm&&window._crm.schedule)||[]).filter(function(e){return e&&e.date;});", "var sched=" + V + "((window._crm&&window._crm.schedule)||[]).filter(function(e){return e&&e.date;});")
once("var sched=schedule().slice().filter(function(e){return e&&e.date;}).sort(", "var sched=" + V + "(schedule()).slice().filter(function(e){return e&&e.date;}).sort(")
near('/* ===== Triple-booking guard: warn (ask) when a sub is being booked 3+ times a day ===== */',
     "try{ return JSON.parse(localStorage.getItem('grayco_schedule')||'[]')||[]; }catch(e){ return []; }",
     "try{ return " + V + "(JSON.parse(localStorage.getItem('grayco_schedule')||'[]')||[]); }catch(e){ return []; }")
once('  try{schedule=JSON.parse(localStorage.getItem("grayco_schedule")||"[]")}catch(e){}', '  try{schedule=' + V + '(JSON.parse(localStorage.getItem("grayco_schedule")||"[]"))}catch(e){}')
near('function datesFor(p, name, trade){', 'var l = arr(crm().schedule).filter(', 'var l = arr(' + V + '(crm().schedule)).filter(')
once('var sch = arr(crm().schedule).filter(function(x){ return String(x.pid) === String(pid); });', 'var sch = arr(' + V + '(crm().schedule)).filter(function(x){ return String(x.pid) === String(pid); });', 2)   # VOICESCHED (both)
once('  function sched(){ return arr(C().schedule).filter(function(x){ return x && !x.deleted; }); }', '  function sched(){ return arr(' + V + '(C().schedule)).filter(function(x){ return x && !x.deleted; }); }')
once("  arr(crm().schedule).forEach(function(x){ if (x && FA.pidOf(x) === s(p.id)) { add(x.vendor);", "  arr(" + V + "(crm().schedule)).forEach(function(x){ if (x && FA.pidOf(x) === s(p.id)) { add(x.vendor);")
once('  var t = today(), sched = arr(crm().schedule).filter(function(x){ return x && !x.deleted && s(x.date) === t; });', '  var t = today(), sched = arr(' + V + '(crm().schedule)).filter(function(x){ return x && !x.deleted && s(x.date) === t; });')
once("  arr(crm().schedule).forEach(function(x){ var d = s(x.date).slice(0, 10), p = s(x.pid); if (p && d >= t0", "  arr(" + V + "(crm().schedule)).forEach(function(x){ var d = s(x.date).slice(0, 10), p = s(x.pid); if (p && d >= t0")
near("  var idx = {}; days.forEach(function(x, j){ idx[x.d] = j; });", 'arr(crm().schedule).forEach(', 'arr(' + V + '(crm().schedule)).forEach(', 200)
near('function conflicts(){\n  var t = today(), out = [], by = {}, R = realSubs();', 'arr(crm().schedule).forEach(', 'arr(' + V + '(crm().schedule)).forEach(', 200)
once("  arr(crm().schedule).forEach(function(r){ if (!r || r.deleted || !mine(r.vendor || r.sub || r.subName || r.assignee, r.subId)) return;", "  arr(" + V + "(crm().schedule)).forEach(function(r){ if (!r || r.deleted || !mine(r.vendor || r.sub || r.subName || r.assignee, r.subId)) return;")
once('    return W.GCFA.subScore(sb, { schedule: crm().schedule, punch:', '    return W.GCFA.subScore(sb, { schedule: ' + V + '(crm().schedule), punch:')
once('return CORE.grid({ schedule: crm().schedule, from: CV.from,', 'return CORE.grid({ schedule: ' + V + '(crm().schedule), from: CV.from,')
once('  var G = CORE.grid({ schedule: crm().schedule, from: CORE.addDay(today(), -30),', '  var G = CORE.grid({ schedule: ' + V + '(crm().schedule), from: CORE.addDay(today(), -30),')
once('wk = CORE.grid({ schedule: crm().schedule, from: monday(today()),', 'wk = CORE.grid({ schedule: ' + V + '(crm().schedule), from: monday(today()),')
once("  arr(crm().schedule).forEach(function(a){ if (a && a.pid === pid && /^\\d{4}-\\d{2}-\\d{2}/.test(s(a.date))", "  arr(" + V + "(crm().schedule)).forEach(function(a){ if (a && a.pid === pid && /^\\d{4}-\\d{2}-\\d{2}/.test(s(a.date))")
near('function schedToday(p){\n  var t = today();', 'return arr(C().schedule).filter(', 'return arr(' + V + '(C().schedule)).filter(', 100)
near('function subDays(p, x){', 'return arr(C().schedule).filter(', 'return arr(' + V + '(C().schedule)).filter(', 300)
near('function schedItems(p){\n  var pid = s(p.id), out = [];', 'arr(C().schedule).forEach(', 'arr(' + V + '(C().schedule)).forEach(', 100)

# 4. automatic Start / Finish
once("      // --- START bookend ---\n      if(sd){",
     "      // --- START bookend ---   // patch SCHEDPICK: never when a person made the job's start item\n      if(sd && !(window._gcSchedPersonBookend && window._gcSchedPersonBookend(sched, p.id, 'start'))){")
once("      // --- FINISH bookend ---\n      if(ed){",
     "      // --- FINISH bookend ---\n      if(ed && !(window._gcSchedPersonBookend && window._gcSchedPersonBookend(sched, p.id, 'finish'))){")
once("notes:'Project start (auto)', scope:'company', by:'Auto',", "notes:'Project start (from the job’s start date)', scope:'company', by:'Job start date',")
once("notes:'Project finish (auto)', scope:'company', by:'Auto',", "notes:'Project finish (from the job’s end date)', scope:'company', by:'Job end date',")

# 5. AUT3
once("""      sla: o.sla || null, optional: !!o.optional, recurring: o.recurring || 0 });
    prev = tid;
  });
  return out;
}""", """      sla: o.sla || null, optional: !!o.optional, recurring: o.recurring || 0, reminder: isReminder(o) });
    if (!isReminder(o)) prev = tid;   // patch SCHEDPICK: a recurring / reminder task is never what the next one waits on
  });
  return fixChain(out);
}
/* patch SCHEDPICK: recurring tasks (weekly OAC, monthly pay apps) and money reminders (invoices, retainage,
   depreciation, collection) are reminders; a task that waits on one waits on the task before it instead */
var REMIND = /invoice|pay ?app|payment|retainage|depreciation|collection/i;
function isReminder(o){ return !!(o && (o.reminder || num(o.recurring) > 0 || (o.internal && REMIND.test(s(o.name))))); }
function fixChain(t){
  if (!t || !Array.isArray(t.tasks)) return t;
  var rem = {}, prevOf = {}, last = null;
  var tasks = t.tasks.map(function(x){ if (!x || typeof x !== 'object') return x; var y = Object.assign({}, x, { dep: arr(x.dep).slice() }); y.reminder = isReminder(y); if (y.reminder) rem[y.id] = 1; prevOf[y.id] = last; if (!y.reminder) last = y.id; return y; });
  tasks.forEach(function(y){ if (!y || typeof y !== 'object') return; var d = []; y.dep.forEach(function(id){ var to = rem[id] ? prevOf[y.id] : id; if (to && to !== y.id && d.indexOf(to) < 0) d.push(to); }); y.dep = d; });
  return Object.assign({}, t, { tasks: tasks });
}""")
once("    ['Demo', 20, 5, 'crew', { stage: 'in_progress', pct: 5 }],", "    ['Demo', 20, 5, 'crew', { stage: 'in_progress', pct: 5, dep: ['pre_construction_meeting', 'permit'] }],   " + MARK)
once("if (t.deleted) { delete o[k]; return; } o[k] = Object.assign({}, t, { id: k, builtin: !!SEED[k] }); });",
     "if (t.deleted) { delete o[k]; return; } o[k] = fixChain(Object.assign({}, t, { id: k, builtin: !!SEED[k] })); });   " + MARK)
once("""function planFor(p, tpl, start){
  var made = Date.parse(s(p.createdAt) || s(p.created)) || Date.now();
  return tpl.tasks.map(function(t){
    var date = addDays(start, t.day), end = addDays(date, t.days - 1);
    var row = { id: 'SCH_T_' + p.id + '_' + t.id, title: s(p.name) + ' — ' + t.name, pid: p.id, date: date, endDate: end, days: t.days,""",
"""function planFor(p, tpl, start, fit){
  var made = Date.parse(s(p.createdAt) || s(p.created)) || Date.now();
  // patch SCHEDPICK: fitted between the job's own start and end dates when the template is longer (the person still moves any date)
  var span = 0; tpl.tasks.forEach(function(t){ if (!isReminder(t)) span = Math.max(span, num(t.day) + num(t.days)); });
  var room = /^\\d{4}-\\d{2}-\\d{2}/.test(s(fit)) && s(fit).slice(0, 10) >= start ? dayDiff(start, s(fit).slice(0, 10)) + 1 : 0, f = room && span > room ? room / span : 1;
  return tpl.tasks.map(function(t){
    var day = t.day, days = t.days;
    if (f < 1) {
      if (isReminder(t) && t.day >= span) day = room + (t.day - span);
      else { day = Math.min(room - 1, Math.round(t.day * f)); days = Math.max(1, Math.min(Math.round(t.days * f), room - day)); }
    }
    var date = addDays(start, day), end = addDays(date, days - 1);
    var row = { id: 'SCH_T_' + p.id + '_' + t.id, title: s(p.name) + ' — ' + t.name, pid: p.id, date: date, endDate: end, days: days,""")
once("tplName: t.name, dep: t.dep.slice(), portal: !!t.portal, customerVisible: !!t.portal, internal: !!t.internal,",
     "tplName: t.name, dep: t.dep.slice(), portal: !!t.portal, customerVisible: !!t.portal && !t.internal, internal: !!t.internal, reminder: isReminder(t),")
once("""function draftSchedule(pid, opts){
  opts = opts || {};
  var p = A.proj(pid); if (!p) return null;
  if (!A.jobAuto(p, 'draftSchedule')) return null;
  var tpl = opts.template ? allTemplates()[opts.template] : pickTemplate(p); if (!tpl) return null;
  if (!opts.force && schedRows().some(function(r){ return r && String(r.pid) === String(pid) && r.tpl; })) return null;
  var start = /^\\d{4}-\\d{2}-\\d{2}/.test(s(p.startDate)) && s(p.startDate) >= today() ? s(p.startDate).slice(0, 10) : today();
  var rows = planFor(p, tpl, start);
  setRows(function(l){ var have = {}; l.forEach(function(r){ if (r && r.id) have[r.id] = 1; }); return l.concat(rows.filter(function(r){ return !have[r.id]; })); });
  var dates = jget(TDATES, {}); rows.forEach(function(r){ dates[r.id] = r.date; }); jset(TDATES, dates);
  A.saveProject(pid, function(q){ q.schedTemplate = q.schedTemplate || tpl.id; q.schedPlan = planOf(rows, tpl); A.jobNote(q, 'Draft schedule from the “' + tpl.name + '” template (' + rows.length + ' tasks) — move any date; the tasks after it follow.'); });
  return rows;
}""", """function draftSchedule(pid, opts){
  opts = opts || {};
  var p = A.proj(pid); if (!p) return null;
  if (!opts.manual) return null;   // patch SCHEDPICK: only a person picking the template (🗓 Start from a template) makes suggestions — never an automation
  var tpl = opts.template ? allTemplates()[opts.template] : pickTemplate(p); if (!tpl) return null;
  if (!opts.force && schedRows().some(function(r){ return r && String(r.pid) === String(pid) && r.tpl; })) return null;
  var start = /^\\d{4}-\\d{2}-\\d{2}/.test(s(p.startDate)) && s(p.startDate) >= today() ? s(p.startDate).slice(0, 10) : today();
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(s(opts.start))) start = s(opts.start);
  var who = spWho(), stamp = Date.now().toString(36);
  var rows = planFor(p, tpl, start, opts.fit === false ? '' : s(p.endDate)).map(function(r){ r.id = r.id + '_' + stamp; r.offeredBy = who; r.offeredAt = nowIso(); return r; });   /* SUGGESTIONS (draft) */
  setRows(function(l){ var have = {}; l.forEach(function(r){ if (r && r.id) have[r.id] = 1; }); return l.concat(rows.filter(function(r){ return !have[r.id]; })); });
  var dates = jget(TDATES, {}); rows.forEach(function(r){ dates[r.id] = r.date; }); jset(TDATES, dates);
  A.saveProject(pid, function(q){ q.schedTemplate = q.schedTemplate || tpl.id; A.jobNote(q, who + ' opened the “' + tpl.name + '” template: ' + rows.length + ' suggested tasks to review — nothing is on the schedule until they are added.'); });
  return rows;
}""")
once("function planOf(rows, tpl){ return { tpl: tpl.id, name: tpl.name, at: nowIso(), steps: rows.map(function(r){ return { id: r.tplTask, name: s(r.tplName) || r.title.replace(/^.*? — /, ''), date: r.date, end: r.endDate, portal: !!r.portal, stage: r.stage || '', done: !!r.done }; }) }; }",
     "function planOf(rows, tpl){ return { v: 2, tpl: tpl.id, name: tpl.name, at: nowIso(), steps: rows.map(function(r){ return { id: r.tplTask, name: s(r.tplName) || r.title.replace(/^.*? — /, ''), date: r.date, end: r.endDate, portal: !!r.portal && r.customerVisible !== false, stage: r.stage || '', done: !!r.done, draft: !!(W._gcSchedDraft && W._gcSchedDraft(r)) }; }) }; }   " + MARK)
once("/* the CRM saves its schedule itself (device store + cloud) when its state changes; _crm.schedule follows a few seconds",
     "/* patch SCHEDPICK: the rows that are really on the schedule (never a suggestion) — stages, progress, SLA, e-mails */\nfunction liveRows(){ return schedRows().filter(function(r){ return !(W._gcSchedDraft && W._gcSchedDraft(r)); }); }\n/* the CRM saves its schedule itself (device store + cloud) when its state changes; _crm.schedule follows a few seconds")
near('function derive(p){', '  schedRows().forEach(function(x){', '  liveRows().forEach(function(x){', 600)
once("function portalTasks(pid){ return schedRows().filter(", "function portalTasks(pid){ return liveRows().filter(")
near('function slaTick(){', '  schedRows().forEach(function(r){', '  liveRows().forEach(function(r){', 200)
once("  schedRows().forEach(function(r){ if (r && r.tpl && r.pid && !seen[r.pid]) { seen[r.pid] = 1; markAuto(r.pid); } });", "  liveRows().forEach(function(r){ if (r && r.tpl && r.pid && !seen[r.pid]) { seen[r.pid] = 1; markAuto(r.pid); } });")
once("  schedRows().forEach(function(r){ if (r && String(r.pid) === String(pid) && r.tpl && r.pct != null", "  liveRows().forEach(function(r){ if (r && String(r.pid) === String(pid) && r.tpl && r.pct != null")
# the kickoff pack: nothing from a template by itself (window.__GC_TPL_AUTO__ === true brings the old rule back)
once("  /* draft schedule from the template (first, so the welcome lists the next steps) */\n  draftSchedule(pid);\n",
     "  // patch SCHEDPICK: the schedule template is OFFERED on the job (📋 Templates → 🗓 Start from a template), never applied here\n")
once("  if (!s(p.drawSchedule) && tpl && (DRAW_DEFAULTS[tpl.id] || tpl.draws)) {", "  if (W.__GC_TPL_AUTO__ === true && !s(p.drawSchedule) && tpl && (DRAW_DEFAULTS[tpl.id] || tpl.draws)) {   /* SCHEDPICK: offered (📎 Other templates) */")
once("    if (!s(p.contractUrl) && !p.contractSigned && !(p.autoDocs || {}).contract && A.jobAuto(p, 'contractSign')) {",
     "    if (W.__GC_TPL_AUTO__ === true && !s(p.contractUrl) && !p.contractSigned && !(p.autoDocs || {}).contract && A.jobAuto(p, 'contractSign')) {   /* SCHEDPICK: offered (📎 Other templates → Make) */")
once("    if (/insurance|claim|fire|water|restoration/i.test(groupText(p)) || p.isInsurance === true) {\n      if (!(p.autoDocs || {}).work_auth)",
     "    if (W.__GC_TPL_AUTO__ === true && (/insurance|claim|fire|water|restoration/i.test(groupText(p)) || p.isInsurance === true)) {   /* SCHEDPICK: offered */\n      if (!(p.autoDocs || {}).work_auth)")
once("    /* permits + inspections checklist */\n    seedPermits(pid);", "    /* permits + inspections checklist — SCHEDPICK: offered on the job, applied by a person */\n    if (W.__GC_TPL_AUTO__ === true) seedPermits(pid);")
once("STAGE_RUN.inspection = function(pid){\n  seedPermits(pid);", "STAGE_RUN.inspection = function(pid){\n  if (W.__GC_TPL_AUTO__ === true) seedPermits(pid);   /* SCHEDPICK */")
once("  var tpl = pickTemplate(p), items = (W._gcPunchWalkthrough ? W._gcPunchWalkthrough(p, tpl) : true) ? ['Final walkthrough with the customer'] : [];",
     "  var tpl = pickTemplate(p), items = W.__GC_TPL_AUTO__ === true && (W._gcPunchWalkthrough ? W._gcPunchWalkthrough(p, tpl) : true) ? ['Final walkthrough with the customer'] : [];   /* SCHEDPICK: the walkthrough is a Punch-tab suggestion */")
once("W._gcSchedTemplates = {\n", read('schedpick_aut3.js') + "\nW._gcSchedTemplates = {\n")
# the e-signature path
once("    ST(function(){ try { var q = A.proj(r.pid); if (q && !q.schedPlan && W._gcSchedTemplates) W._gcSchedTemplates.apply(r.pid); } catch (e) {} }, 6000);",
     "    // patch SCHEDPICK: the template is offered on the job (📋 Templates), never applied by the signature")

# punch: the final walkthrough is a suggestion
once("    out = arr(tpl && tpl.punch).slice();\n  }\n  return out.filter(function(x, i, a){ return a.indexOf(x) === i; });",
     "    out = arr(tpl && tpl.punch).slice();\n  }\n  try { if (W._gcPunchWalkthrough && W._gcPunchWalkthrough(p, tpl)) out.unshift('Final walkthrough with the customer'); } catch (e) {}   " + MARK + "\n  return out.filter(function(x, i, a){ return a.indexOf(x) === i; });")

# 6. PM Field Controls: the job-type checklist is offered
once("    // Merge: template first, then any estimate specifics not already covered\n    var allItems = template.slice();",
     "    // Merge: template first, then any estimate specifics not already covered\n    var allItems = [];   // patch SCHEDPICK: the job-type checklist is OFFERED (📋 Apply the checklist) — the job's own estimate lines start the list")
once("    // Add custom item\n    '<div style=\"display:flex;gap:6px;margin-bottom:14px;\">',",
     "    (window.__gcPMTpl ? window.__gcPMTpl(data, _proj) : ''),\n    // Add custom item\n    '<div style=\"display:flex;gap:6px;margin-bottom:14px;\">',")
once("async function save(){ await idbSet(PMSCOPE_KEY, _allData); }\n\nwindow.gcPMScope = {\n  open: openPM,",
"""async function save(){ await idbSet(PMSCOPE_KEY, _allData); }
/* patch SCHEDPICK: the job-type checklist on offer; a list the old rule filled by itself gets a one-time keep / remove */
function __pmTplItems(proj){ return getTemplate((proj && proj.type) || ''); }
function __pmUntouched(i){ return i && !i.done && !i.flagged && !i.note && !i.by && !i.src; }
window.__gcPMTpl = function(data, proj){
  try {
    var tpl = __pmTplItems(proj), set = {}, have = {}; tpl.forEach(function(x){ set[x] = 1; }); data.items.forEach(function(i){ have[i.text] = 1; });
    var auto = data.items.filter(function(i){ return set[i.text] && __pmUntouched(i); });
    var box = function(h){ return '<div data-gcsp-pm style="background:#1a1500;border:1px solid #d4a01760;border-left:3px solid #d4a017;border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;color:#eee">' + h + '</div>'; };
    if (auto.length && !data.tplReviewed) return box('🧾 <b>' + auto.length + ' items were added automatically</b> from the ' + (proj.type || 'job-type') + ' checklist. Keep them or remove the untouched ones — you are asked once. ' +
      '<button class="gc-pm-btn gc-pm-btn-p" data-gcsp-pm-keep onclick="window.gcPMScope.keepTemplate()">Keep</button> <button class="gc-pm-btn gc-pm-btn-flag" data-gcsp-pm-rm onclick="window.gcPMScope.removeTemplate()">Remove them</button>');
    var miss = tpl.filter(function(x){ return !have[x]; });
    if (miss.length && !data.tplApplied) return box('📋 The ' + (proj.type || 'job-type') + ' checklist has ' + miss.length + ' items. Nothing is added until you apply it. ' +
      '<button class="gc-pm-btn gc-pm-btn-p" data-gcsp-pm-apply onclick="window.gcPMScope.applyTemplate()">Apply the checklist</button>');
  } catch (e) {}
  return '';
};

window.gcPMScope = {
  open: openPM,
  applyTemplate: async function(){
    var d = _allData[_currentPid]; if (!d) return;
    var have = {}; d.items.forEach(function(i){ have[i.text] = 1; });
    __pmTplItems(_proj).forEach(function(txt){ if (!have[txt]) d.items.push({id:uid(), text:txt, done:false, note:'', flagged:false, flagNote:'', by:'', date:'', src:'template', addedBy:_user.name, addedAt:today()}); });
    d.tplApplied = true; d.tplReviewed = true; await save(); renderPM();
  },
  keepTemplate: async function(){ var d = _allData[_currentPid]; if (!d) return; d.tplReviewed = { at: today(), by: _user.name, kept: true }; await save(); renderPM(); },
  removeTemplate: async function(){
    var d = _allData[_currentPid]; if (!d) return;
    var set = {}; __pmTplItems(_proj).forEach(function(x){ set[x] = 1; });
    d.items = d.items.filter(function(i){ return !(set[i.text] && __pmUntouched(i)); });
    d.tplReviewed = { at: today(), by: _user.name, kept: false }; await save(); renderPM();
  },""")

# 7. the ⚙ Automations switches say what they do now
once("  ['draftSchedule', '🗓 Draft schedule from the job type', 'When the job is signed, its schedule is drafted from the template (Admin → 🗓 Schedule templates).'],",
     "  ['draftSchedule', '🗓 Offer a schedule template', 'The job shows its template as suggestions (📋 Templates → 🗓 Start from a template) — nothing goes on the schedule until a person adds it.'],")
once("  ['permits', '📄 Permit & inspection checklist', 'Permit rows and inspections from the job kind and its jurisdiction.'],",
     "  ['permits', '📄 Offer the permit & inspection checklist', 'From the job kind and its jurisdiction, offered on the job (📋 Templates) — added only when a person applies it.'],")
once("  ['punchList', '✅ Punch list at substantial completion', 'Template items plus the final walkthrough.'],",
     "  ['punchList', '✅ Punch-list suggestions at substantial completion', 'Suggested items (and the final walkthrough) on the Punch tab — the PM ticks the ones that apply.'],")
once("  ['contractSign', 'docs', '✍️ Contract for signature', 'Sent to the customer to sign.', true, false, 'admin'],",
     "  ['contractSign', 'docs', '✍️ Contract for signature', 'Made from the template when a person clicks Make (📋 Templates), then sent to the customer to sign.', true, false, 'admin'],")

# 8. the 📋 Templates bar and panels
TAIL = read('schedpick_tail.js')
assert t.rstrip().endswith('</script>'), 'SCHEDPICK: file does not end with a script'
t = t.rstrip('\n') + '\n<script id="gc-patch-schedpick">\n' + MARK + '\n' + TAIL + '\n</script>\n'
open(p, 'w', encoding='utf-8').write(t); print('SCHEDPICK: patched')
