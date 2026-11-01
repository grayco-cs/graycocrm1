#!/usr/bin/env python3
"""Idempotent patch DASHSCHED (owner 11/01, on the 🏠 Dashboard: "put this farther down, put schedule here").
  * 📅 Schedule card where the "Budget Alerts / Insurance Expiring (30 days)" grid was (today + the next 6 days from the
    Schedule screen's list, each item opens its job, "Full schedule →"); the two old schedule cards lower down fold away.
  * The alerts grid goes below Active jobs; the insurance card is "Sub insurance — expired / expiring": expired rows red
    with "expired", soonest / most overdue first, suppliers left out (patch SUPPLIERPAY's rule).
  * The admin Desk home (patch ROLEAPPS) gets the same 📅 Schedule card (first), if it does not have one.
A DOM layer only (tools/dashsched.js as <script id="gc-patch-dashsched"> at the end of the page): the React bundle is not
changed. The script relies on the React dashboard's alerts grid, its two titles and the jobs card (asserted here once);
the one ROLEAPPS line is changed in the page and in tools/roleapps.js alike, so a later ROLEAPPS run changes nothing.
Usage: python3 tools/patch_DASHSCHED.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
MARK = '/* patch DASHSCHED */'
t = open(p, encoding='utf-8').read()
if MARK in t:
    print('DASHSCHED: already patched'); sys.exit(0)

def once(src, anchor, tag):
    c = src.count(anchor)
    assert c == 1, ('DASHSCHED anchor', tag, c, anchor[:100])

# what the DOM layer reads in the React dashboard (each exactly once)
once(t, '(Z.length>0||w.length>0)&&e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr"', 'alerts grid')
once(t, 'children:"Budget Alerts"', 'Budget Alerts title')
once(t, 'children:"Insurance Expiring (30 days)"}),w.map(N=>e.jsxs("div",{style:{fontSize:12,padding:"3px 0"},children:[e.jsx("b",{children:N.name})," — exp ",Ut(N.insExp)]},N.id))', 'insurance rows')
once(t, '"data-gc-jobs":"1"', 'jobs card')
once(t, 'children:H?g.name+"\'s Dashboard":y?"Company Dashboard":"My Dashboard"', 'dashboard title')
once(t, 'children:_isAdm?"📅 Company Schedule":"📅 My Schedule"', '14-day schedule card')
once(t, '"📅 ",H?g.name.split(" ")[0]+"\'s":"My"," Week — "', 'week card')
once(t, 'window._gcProjSeesAll = function(){', 'PROJLEAK scope')
once(t, '<script id="gc-patch-roleapps">', 'ROLEAPPS script')

# the admin Desk home: the schedule card first, when it is not there yet
DESK_A = "    var J = jobsOf('admin').list, S = moneyNums();\n"
DESK_B = DESK_A + ("    if (h.indexOf('data-card=\"sched\"') < 0 && W._gcDashSched && typeof W._gcDashSched.deskHtml === 'function') { var SH = ''; try { SH = W._gcDashSched.deskHtml(); } catch (e) { warn(e); }"
                   " if (SH) h += card('sched', '📅 Schedule', SH, '<button type=\"button\" class=\"gc-ra-link\" data-ra-a=\"go\" data-v=\"schedule\">Full schedule ›</button>'); }   /* DASHSCHED: the schedule card */\n")
def desk(src, tag):
    if DESK_B in src: return src
    once(src, DESK_A, tag)
    return src.replace(DESK_A, DESK_B)
t = desk(t, 'ROLEAPPS admin desk (page)')
rp = os.path.join(here, 'roleapps.js')
r = open(rp, encoding='utf-8').read(); r2 = desk(r, 'ROLEAPPS admin desk (roleapps.js)')
if r2 != r: open(rp, 'w', encoding='utf-8').write(r2); print('DASHSCHED: tools/roleapps.js desk card added')

TAG = '<script id="gc-patch-dashsched">'
js = open(os.path.join(here, 'dashsched.js'), encoding='utf-8').read().strip() + '\n'
assert '</script' not in js.lower()
assert TAG not in t
assert t.rstrip().endswith('</script>'), 'DASHSCHED: page end'
t = t.rstrip() + '\n' + TAG + '\n' + MARK + '\n' + js + '</script>\n'
open(p, 'w', encoding='utf-8').write(t)
print('DASHSCHED: patched')
