#!/usr/bin/env python3
"""Idempotent patch FIELDPORTAL (owner 10/30): GrayCo Field — 👤 Customer portal / 🔧 Sub portal / 📸 Photos / 💬 Message on
every job, the job page as an app (tiles on top), 📸 Photos in the bottom bar instead of 💬 Messages, the message picker
reading the Jobs tab's list, 🧠 Business Brain in the 💎 menu, ⚙ Settings sections, the per-person "Customer can see?"
default. See the header of tools/fieldportal.js. The script goes in as <script id="gc-patch-fieldportal"> at the end of
the page (replaced when it changes). Every hook feature-detects window._gcFP, so the page works the same without it.
Usage: python3 tools/patch_FIELDPORTAL.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
n_done = 0
def once(old, new, tag):
    """replace one exact anchor; skip when the marked replacement is already there"""
    global t, n_done
    if new in t:
        return
    c = t.count(old)
    assert c == 1, ('FIELDPORTAL anchor', tag, c, old[:100])
    t = t.replace(old, new); n_done += 1

# 1. Field home job card: one row of four (👤 Customer portal · 🔧 Sub portal · 📸 Photos · 💬 Message)
once("""'</button><div class="fh-a">' + esc([p.address, p.client].filter(Boolean).join(' · ')) + '</div>';\n""",
     """'</button><div class="fh-a">' + esc([p.address, p.client].filter(Boolean).join(' · ')) + '</div>';\n  if (W._gcFP && W._gcFP.row) { try { h += W._gcFP.row(p); } catch (e) {} }   /* patch FIELDPORTAL */\n""", 'job card row')
# 2. Field home click: the row's buttons (in the tap — the iPhone keeps the user gesture)
once("""  W._gcCurrentJob = p; lsSet('grayco_openpid', s(p.id));\n""",
     """  W._gcCurrentJob = p; lsSet('grayco_openpid', s(p.id));\n  if (/^fp-/.test(a) && W._gcFP && W._gcFP.run) { W._gcFP.run(a, p); return; }   /* patch FIELDPORTAL */\n""", 'home click')
# 3. bottom bar: 💬 Messages → 📸 Photos (GrayCo Photos, the person's jobs)
once("""'<button type="button" data-t="msgs"><span class="e">💬</span>Messages</button><button type="button" data-t="more">""",
     """'<button type="button" data-t="photos"><span class="e">📸</span>Photos</button><button type="button" data-t="more">""", 'tab button')   # patch FIELDPORTAL
once("""    if (k === 'msgs') { if (W._gcPickJobForMessages) W._gcPickJobForMessages(); return; }\n    if (k === 'more') moreSheet();""",
     """    if (k === 'photos') { openPhotos(); return; }   /* patch FIELDPORTAL: the bar's 📸 Photos */\n    if (k === 'msgs') { if (W._gcPickJobForMessages) W._gcPickJobForMessages(); return; }\n    if (k === 'more') moreSheet();""", 'tab handler')
# 4. ⚙ Settings (Field): the new sections
once("""  o.querySelector('[data-s="desk"]').onclick = function(){""",
     """  try { if (W._gcFP && W._gcFP.settings) W._gcFP.settings(o, { admin: adm, rk: rk(), close: closeHome }); } catch (e) {}   /* patch FIELDPORTAL */\n  o.querySelector('[data-s="desk"]').onclick = function(){""", 'settings')
# 5. "Pick a job to message": the Jobs tab's list (role rules), "Loading your jobs…" until the jobs are on the phone
once("""    var projects=(crm().projects||[]).filter(function(p){ return p && p.id && (p.name||p.address); });\n    projects.sort(function(a,b){ var f=window._gcJobMsgLast;""",
     """    var projects=(typeof window._gcFPJobs==='function'?window._gcFPJobs():(crm().projects||[])).filter(function(p){ return p && p.id && (p.name||p.address); });   /* patch FIELDPORTAL */\n    projects.sort(function(a,b){ var f=window._gcJobMsgLast;""", 'picker source')
once("""<div id="_jpList">'+(rows||'<div style="color:#94a3b8;text-align:center;padding:20px">No jobs yet.</div>')+'</div></div>';""",
     """<div id="_jpList">'+(rows||'<div style="color:#94a3b8;text-align:center;padding:20px">'+(window._gcFPJobsLoading&&window._gcFPJobsLoading()?'Loading your jobs\\u2026':'No jobs yet.')+'</div>')+'</div></div>';   /* patch FIELDPORTAL */""", 'picker empty')
# 6. 💎 menu: 🧠 Business Brain first (the floating 🧠 is hidden in Field view)
once("""        { icon: "📋", label: "Job Profile", fn: function(){ if(window._gcOpenJobProfile) window._gcOpenJobProfile(); } },""",
     """        { icon: "🧠", label: "Business Brain", fn: function(){ if(window._gcOpenBrain) window._gcOpenBrain(); } },   /* patch FIELDPORTAL */\n        { icon: "📋", label: "Job Profile", fn: function(){ if(window._gcOpenJobProfile) window._gcOpenJobProfile(); } },""", 'hub brain')
# 7. "Customer can see?": the person's default (⚙ Settings → 📸 Customer photo default); it still asks every time
once("""  var def = tag !== 'Damage';\n""",
     """  var def = tag !== 'Damage';\n  try { var _fpd = typeof window._gcCustqDefault === 'function' ? window._gcCustqDefault() : null; if (_fpd === true || _fpd === false) def = _fpd; } catch (e) {}   /* patch FIELDPORTAL */\n""", 'custq default')
# 8. job lists (Field Jobs tab + Field home): Active / In progress first, then the other open stages, then Completed / Lost;
#    within each group the latest activity on top
once("""      f.sort(function(a,b){ var ac=/complete|closed/i.test(a.status||'')?1:0, bc=/complete|closed/i.test(b.status||'')?1:0; return ac-bc; });""",
     """      if(window._gcFPSort){ f=window._gcFPSort(f); } else f.sort(function(a,b){ var ac=/complete|closed/i.test(a.status||'')?1:0, bc=/complete|closed/i.test(b.status||'')?1:0; return ac-bc; });   /* patch FIELDPORTAL */""", 'jobs tab sort')
once("""      h += m.J.list.length ? m.J.list.map(jobCard).join('')""",
     """      h += m.J.list.length ? (W._gcFPSort ? W._gcFPSort(m.J.list) : m.J.list).map(jobCard).join('')   /* patch FIELDPORTAL */""", 'home sort')
# 10. the open job is the job: every Field job tool falls back to the job the Field page has open (window._gcCurrentJob)
#     when its own lookup misses it (the job page found it, the tool must too) — Job Info, the 🧰 Job tools (walkthrough,
#     crew arrived, done for today, safety), 👤 Customer, 🏠 Home profile / 🔐 Access codes / 📋 Inspections
CUR = "(window._gcCurrentJob && String(window._gcCurrentJob.id) === String(pid) ? window._gcCurrentJob : null)"
once("""  var R = RECENT[pid]; if (!p && R && Date.now() - R.at < 120e3) return R.rec;   /* a job the CRM's copy does not show yet */""",
     """  var R = RECENT[pid]; if (!p && R && Date.now() - R.at < 120e3) return R.rec;   /* a job the CRM's copy does not show yet */\n  if (!p) p = """ + CUR + """;   /* patch FIELDPORTAL: the job the Field page has open */""", 'aut proj')
once("""    var job=jobId ? projects.find(function(p){return p.id===jobId;}) : null;""",
     """    var job=jobId ? (projects.find(function(p){return p && String(p.id)===String(jobId);}) || (window._gcCurrentJob && String(window._gcCurrentJob.id)===String(jobId) ? window._gcCurrentJob : null)) : null;   /* patch FIELDPORTAL: the open job, whatever the id's type */""", 'job profile')
once("""b.onclick = function(e){ e.preventDefault(); e.stopPropagation(); var p = projects().filter(function(x){ return String(x.id) === pid; })[0]; W._gcCustomer360(""",
     """b.onclick = function(e){ e.preventDefault(); e.stopPropagation(); var p = projects().filter(function(x){ return String(x.id) === pid; })[0] || (W._gcCurrentJob && String(W._gcCurrentJob.id) === pid ? W._gcCurrentJob : null);   /* patch FIELDPORTAL */ W._gcCustomer360(""", 'd1 customer btn')
once("""    var p = projects().filter(function(x){ return String(x.id) === String(pid); })[0];\n    if (p) {\n      var em = low(p.clientEmail || p.customerEmail), ph = digits(p.clientPhone || p.customerPhone);""",
     """    var p = projects().filter(function(x){ return String(x.id) === String(pid); })[0] || """ + CUR + """;   /* patch FIELDPORTAL */\n    if (p) {\n      var em = low(p.clientEmail || p.customerEmail), ph = digits(p.clientPhone || p.customerPhone);""", 'd1 findCustomer')
P_OLD = "function proj(pid){ return projects().filter(function(x){ return x && String(x.id) === String(pid); })[0] || null; }"
P_NEW = "function proj(pid){ return projects().filter(function(x){ return x && String(x.id) === String(pid); })[0] || " + CUR + "; }   /* patch FIELDPORTAL */"
if P_OLD in t:
    assert t.count(P_OLD) == 4, ('FIELDPORTAL proj x4', t.count(P_OLD))
    t = t.replace(P_OLD, P_NEW); n_done += 1
# 11. the field job page's ✉️ E-mail the customer goes below the tiles (with Call / Text / Map), not in the header
once("""  head.appendChild(b);\n  var body = ov.children[1]; if(body){ var lb = logBox(""",
     """  var _fpLow = ov.querySelector('.gcfp-low'); (_fpLow || head).appendChild(b);   /* patch FIELDPORTAL: below the tiles */\n  var body = ov.children[1]; if(body){ var lb = logBox(""", 'mail button')
# 12. 💎 menu: 🧠 Business Brain in the "Daily Work" group (first section)
once("""var _hubGroups = {"Print pack": "Help & Tools", """, """var _hubGroups = {"Business Brain": "Daily Work", "Print pack": "Help & Tools", """, 'hub group')
print('FIELDPORTAL: %d hook(s) patched' % n_done if n_done else 'FIELDPORTAL: hooks already patched')

# 9. the script
TAG = '<script id="gc-patch-fieldportal">'
js = open(os.path.join(here, 'fieldportal.js'), encoding='utf-8').read().strip() + '\n'
assert '</script' not in js.lower()
if TAG in t:
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] == js: print('FIELDPORTAL: script already current')
    else: t = t[:i] + js + t[j:]; print('FIELDPORTAL: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'FIELDPORTAL: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + js + '</script>\n'
    print('FIELDPORTAL: script added')
open(p, 'w', encoding='utf-8').write(t)
