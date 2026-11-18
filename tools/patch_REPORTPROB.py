#!/usr/bin/env python3
"""Idempotent patch REPORTPROB: 🆘 Report a problem / Ask a question (owner 11/18: "Do they have where they can report issues
with CRM or ask questions").

Desk: the first item of the 💎 menu (pinned on top until 2026-12-16, then a normal 💎 item). GrayCo Field: ☰ More (Office rows)
and a small ❓ on the Field home. Every signed-in staff role. The form: what kind (Something broke / I can't find something /
Question / Idea), a short text, an optional screenshot or photo, the screen (taken when the button is pressed), the device,
the version and the last 20 page errors / slow taps (PERFREP). Saved in gc_kv gc_problem_reports (append only, never deleted;
open / answered / fixed); the admins and the office are told through window._gcNotify (AWAY: quiet hours and Away respected).
🆘 Problem reports (admins and the office): answer — the reporter sees it as a CRM notice — and mark fixed.
The sign-in screen: "Can't sign in? Report it" (signed out, name + phone) through netlify/functions/problem-report.js.
The page code is tools/reportprob.js (this script copies it into index.html; run again to refresh it).
Usage: python3 tools/patch_REPORTPROB.py [index.html]
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
JS = open(os.path.join(here, 'reportprob.js'), encoding='utf-8').read().rstrip('\n')
assert '__GC_PATCH_REPORTPROB__' in JS and '</script' not in JS
OPEN = '<script id="gc-patch-reportprob">\n'
assert '__GC_PATCH_AWAY__' in src, 'REPORTPROB goes after AWAY (window._gcNotify)'
if OPEN in src:
    i = src.index(OPEN) + len(OPEN); j = src.index('</script>', i)
    if src[i:j].rstrip('\n') == JS:
        print('REPORTPROB: already patched'); sys.exit(0)
    src = src[:i] + JS + '\n' + src[j:]
    print('REPORTPROB: refreshed')
else:
    src = src.rstrip('\n') + '\n' + OPEN + JS + '\n</script>\n'
    print('REPORTPROB: patched')
open(path, 'w', encoding='utf-8').write(src)
