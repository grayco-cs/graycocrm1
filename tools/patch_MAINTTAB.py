#!/usr/bin/env python3
"""Idempotent patch MAINTTAB (+ MAINTPLUS) — the 🛠 Maintenance tab in the main CRM menu (owner 10/30: "I want to have a
maintenance tab in the CRM to offer commercial maintenance plans and focus on reaching out to maintenance managers … this
needs to be in pm office and admin tabs"). See the header of tools/mainttab.js.

1. The menu: a "🛠 Maintenance" tab (id maint) in the page's menu list; shown when window._gcMaintCanSee() says so (admins,
   the office, PMs — never the Marketing Manager, subs or crews), in the normal menu and in the office's own menu (RP).
   The tab's page is a mount point (like 🗂 GrayCo Photos): tools/mainttab.js draws into it.
2. ✅ Approvals: the office approves maint_outreach / maint_repair / maint_reminder (the CRM copy of _lib/office-kinds.js).
3. The Maintenance Schedule is its own list (gc_maint_visits): patch X9 no longer puts plan visits on the job schedule.
4. tools/mainttab.js goes in as <script id="gc-patch-mainttab"> at the end of the page (replaced when it changes).
Usage: python3 tools/patch_MAINTTAB.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
MARK = '/* patch MAINTTAB'


def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('MAINTTAB anchor count != 1', n, old[:90])
    t = t.replace(old, new)


if MARK + ': menu */' not in t:
    once('{id:"officemanager",l:"Office",ic:"🏢"}]', '{id:"officemanager",l:"Office",ic:"🏢"},{id:"maint",l:"Maintenance",ic:"🛠"}]')
    once('g.id==="marketing"?!!(window._gcMktCanSee&&window._gcMktCanSee()):((yi||n)',
         'g.id==="marketing"?!!(window._gcMktCanSee&&window._gcMktCanSee()):g.id==="maint"?!!(window._gcMaintCanSee&&window._gcMaintCanSee()):((yi||n)')
    once('case"approvals":return e.jsx("div",{key:"gc-view-approvals"',
         'case"maint":return e.jsx("div",{key:"gc-view-maint",id:"gc-mt-mount",ref:function(el){try{if(el&&window._gcMaintTab)window._gcMaintTab.mount(el)}catch(_x){}}});case"approvals":return e.jsx("div",{key:"gc-view-approvals"')
    once("        if (g.id === 'marketing') return !!(W._gcMktCanSee && W._gcMktCanSee());\n        return AD.indexOf(g.id) >= 0",
         "        if (g.id === 'marketing') return !!(W._gcMktCanSee && W._gcMktCanSee());\n        if (g.id === 'maint') return !!(W._gcMaintCanSee && W._gcMaintCanSee());   " + MARK + ": menu */\n        return AD.indexOf(g.id) >= 0")
    once("        if (g.id === 'marketing') return !!(W._gcMktCanSee && W._gcMktCanSee());\n        return OFFICE_TABS.indexOf(g.id) >= 0",
         "        if (g.id === 'marketing') return !!(W._gcMktCanSee && W._gcMktCanSee());\n        if (g.id === 'maint') return !!(W._gcMaintCanSee && W._gcMaintCanSee());\n        return OFFICE_TABS.indexOf(g.id) >= 0")
    once('"sign_co_nudge"]', '"sign_co_nudge","maint_outreach","maint_repair","maint_reminder"]')
    once("function scheduleVisits(){\n  if (typeof W._setSchedule !== 'function') return;",
         "function scheduleVisits(){\n  return;   " + MARK + ": maintenance visits live on their own 🗓 Maintenance Schedule (🛠 Maintenance tab), never on the job schedule */\n  if (typeof W._setSchedule !== 'function') return;")
    print('MAINTTAB: menu, approvals, schedule patched')
else:
    print('MAINTTAB: menu already patched')

TAG = '<script id="gc-patch-mainttab">'
js = open(os.path.join(here, 'mainttab.js'), encoding='utf-8').read()
assert '</script' not in js
if TAG in t:
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] == js: print('MAINTTAB: script already current')
    else: t = t[:i] + js + t[j:]; print('MAINTTAB: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'MAINTTAB: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + js + '</script>\n'
    print('MAINTTAB: script added')
open(p, 'w', encoding='utf-8').write(t)
