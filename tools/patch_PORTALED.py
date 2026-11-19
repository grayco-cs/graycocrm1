#!/usr/bin/env python3
"""Idempotent patch PORTALED: 👤 Customer portal opens the job's portal full screen — what the customer sees + edit it.
Owner 11/19 (iPhone): "If I click customer portal I'd like to open their portal and see what's in it, edit jobs, add jobs,
tasks, scopes, whatever in the portal, add plans, addendum, ask questions, all in portal."

1. tools/portaled_block.html becomes a script right after FIELDPORTAL2: window._gcPortalEd (the full-screen page: 👁 Customer
   view = the real portal page in staff preview, ✏️ Edit portal = details / schedule / checklist / we need from you / scope /
   plans & documents / change orders & addendums / messages / updates / this customer's jobs / ✉️ Tell the customer).
2. FIELDPORTAL's run('fp-cust') (every 👤 Customer portal button in GrayCo Field: the job card, the job page tile, the More
   menu) opens it — for the same people as before (admin / office / the job's PM); the old sheet stays as _gcFP.cust().
3. The desk's 🏠 Portal card (patch Q) gets "✏️ Open portal" in its row, opening the same page.
Server side (not in index.html): netlify/functions/_lib/portaled.js + portal.js buildView (summary / checklist / scopes /
milestones), gateState's aq; portal.html draws them ("About your project", "Your project checklist", "Scope of work").
Usage: python3 tools/patch_PORTALED.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_PORTALED__' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

BLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'portaled_block.html'), encoding='utf-8').read().rstrip('\n')
a = src.index('<script id="gc-patch-fieldportal2">'); b = src.index('</script>', a) + len('</script>')
src = src[:b] + '\n' + BLOCK + src[b:]

# 2. GrayCo Field: 👤 Customer portal → the full-screen portal
src = once(src, "  if (a === 'fp-cust' && pm.cust) { custSheet(p); return true; }",
    "  if (a === 'fp-cust' && pm.cust) { if (W._gcPortalEd && W._gcPortalEd.open(p.id)) return true; custSheet(p); return true; }   /* patch PORTALED: the portal, full screen */")

# 3. the desk's 🏠 Portal card: ✏️ Open portal
src = once(src, "    '<button type=\"button\" data-q=\"post\" style=\"min-height:40px;padding:0 14px;border:0;border-radius:10px;background:' + GOLD + ';color:' + NAVY + ';font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;white-space:nowrap\">📣 Post</button>' +",
    "    (window._gcPortalEd && window._gcPortalEd.can(p.id) ? '<button type=\"button\" data-q=\"ped\" title=\"Open the customer portal: see it as the customer and edit it\" style=\"min-height:40px;padding:0 12px;border:1px solid ' + NAVY + ';border-radius:10px;background:' + NAVY + ';color:#fff;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;white-space:nowrap\">✏️ Open portal</button>' : '') +   /* patch PORTALED */\n"
    "    '<button type=\"button\" data-q=\"post\" style=\"min-height:40px;padding:0 14px;border:0;border-radius:10px;background:' + GOLD + ';color:' + NAVY + ';font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;white-space:nowrap\">📣 Post</button>' +")
src = once(src, "    if (q === 'post') return openPost(pid);\n    if (q === 'docs') return openDocs(pid);",
    "    if (q === 'ped') { if (window._gcPortalEd) window._gcPortalEd.open(pid); return; }   /* patch PORTALED */\n    if (q === 'post') return openPost(pid);\n    if (q === 'docs') return openDocs(pid);")
open(path, 'w', encoding='utf-8').write(src)
print('patched')
