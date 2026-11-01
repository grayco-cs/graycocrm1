#!/usr/bin/env python3
"""Idempotent patch TAXALERTS: 🧾 tax deadlines — a tax calendar with alerts to the admins and the office (owner 11/01: "make sure
every month and quarterly we have a pay taxes alert to office and admin"; "payroll taxes, and personally Wesley and Nick pay a
quarterly number in to taxes").

What goes into index.html:
  1. <script id="gc-patch-taxalerts"> at the end of the page: the shared rules netlify/functions/_lib/taxcal.js (inlined, so the
     page and the server compute the same due dates — window._gcTaxCal) followed by tools/taxalerts.js (⚙ Admin → 🧾 Tax
     deadlines, the To-Do alerts with ✓ Paid, the 🧾 Taxes home cards — window._gcTax). Replaced when either file changes.
  2. One line in patch ROLEAPPS's deskCards(): other patches' Desk cards (window._gcRaCards) — the same line is in
     tools/roleapps.js, so a re-run of patch_ROLEAPPS stays "already patched".
Nothing else on the page changes. The server half is netlify/functions/_lib/taxalerts.js (auto-wins part 'tax').
Usage: python3 tools/patch_TAXALERTS.py [index.html]
"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
t = open(p, encoding='utf-8').read()
orig = t

def once(anchor, tag):
    """the page must have exactly one of each hook this patch builds on"""
    c = t.count(anchor)
    assert c == 1, ('TAXALERTS anchor', tag, c, anchor[:100])

once('W._gcAdmAddSection = function(c){', 'Admin settings sections (patch ADM API)')
once("arr(W._gcTodoExt).forEach(function(f){ if (typeof f !== 'function') return;", 'To-Do extension items (patch TD2)')
once('window._gcStoreFile = storeFile;', 'the CRM file storage')
once('window.__GC_PAY = {', 'Payroll engine')
once('window._gcRenderTaxOwed = async function(host, year, rerender){', 'Payroll tax owed')
once('W._gcVAS = {', 'View as')
once('<script id="gc-patch-roleapps">', 'ROLEAPPS script')

# 2. the Desk cards hook (patch ROLEAPPS)
HOOK = ("  try { (Array.isArray(W._gcRaCards) ? W._gcRaCards : []).forEach(function(f){ var x = typeof f === 'function' ? f(a, card) : ''; if (x) h += x; }); } catch (e) { warn(e); }"
        "   /* patch TAXALERTS: other patches' Desk cards (🧾 Taxes) */\n")
DESK = '  }\n  return h;\n}\nfunction deskHtml(a){'
if HOOK not in t:
    once(DESK, 'ROLEAPPS deskCards end')
    t = t.replace(DESK, '  }\n' + HOOK + '  return h;\n}\nfunction deskHtml(a){')
else:
    assert t.count(HOOK) == 1, 'TAXALERTS: Desk hook twice'
ra = open(os.path.join(here, 'roleapps.js'), encoding='utf-8').read()
assert ra.count(HOOK) == 1, 'TAXALERTS: tools/roleapps.js must carry the same Desk hook line'

# 1. the script
TAG = '<script id="gc-patch-taxalerts">'
MARK = '/* patch TAXALERTS */\n'
cal = open(os.path.join(root, 'netlify', 'functions', '_lib', 'taxcal.js'), encoding='utf-8').read().strip() + '\n'
js = open(os.path.join(here, 'taxalerts.js'), encoding='utf-8').read().strip() + '\n'
for part in (cal, js):
    assert '</script' not in part.lower(), 'TAXALERTS: a closing script tag in the source'
assert '(patch TAXALERTS)' in js and 'patch TAXALERTS' in cal
body = MARK + '/* ── netlify/functions/_lib/taxcal.js (inlined: the same rules as the server) ── */\n' + cal + js
if TAG in t:
    assert t.count(TAG) == 1, 'TAXALERTS: script tag twice'
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != body:
        t = t[:i] + body + t[j:]; print('TAXALERTS: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'TAXALERTS: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + body + '</script>\n'
    print('TAXALERTS: script added')
assert t.count(MARK) == 1
if t == orig:
    print('TAXALERTS: already patched')
    sys.exit(0)
open(p, 'w', encoding='utf-8').write(t)
print('TAXALERTS: patched', p)
