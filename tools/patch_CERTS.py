#!/usr/bin/env python3
"""Idempotent patch CERTS — 📜 Certifications: company and employee licenses / certifications with exact expiration and
apply-by dates, renewal cycle, fees and a payment log, To-Do and daily e-mail reminders (owner 11/10). See tools/certs.js.
(The daily e-mails are in netlify/functions/_lib/gcp.js certRun, called from gc-portal-daily.js.)

1. index.html: tools/certs.js as <script id="gc-patch-certs"> right after patch TRAIN's script.
2. patch TRAIN: a "📜 Certifications" button beside "👥 Team progress" (admins only, like that button).
Usage: python3 tools/patch_CERTS.py [index.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'index.html')
TAG = '<script id="gc-patch-certs">'
TRAIN_TAG = '<script id="gc-patch-train">'
js = open(os.path.join(here, 'certs.js'), encoding='utf-8').read()
assert 'patch CERTS' in js[:200] and '</script' not in js.lower()
t = open(P, encoding='utf-8').read(); orig = t
assert t.count(TRAIN_TAG) == 1
if TAG in t:
    assert t.count(TAG) == 1
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != js: t = t[:i] + js + t[j:]; print('CERTS: script updated')
    else: print('CERTS: script already current')
else:
    i = t.index(TRAIN_TAG); j = t.index('</script>', i) + len('</script>')
    t = t[:j] + '\n' + TAG + '\n' + js + '</script>' + t[j:]; print('CERTS: script added')
ti = t.index(TRAIN_TAG); tj = t.index('</script>', ti); train = t[ti:tj]
old = '<button type="button" class="gctr-btn" data-tr="team">👥 Team progress</button>'
new = old + '<button type="button" class="gctr-btn" data-gcc-open="1">📜 Certifications</button>'
if 'data-gcc-open' in train: print('CERTS: TRAIN button already in')
else:
    assert train.count(old) == 1, 'CERTS: Team progress button not found once'
    train = train.replace(old, new); print('CERTS: TRAIN button added')
t = t[:ti] + train + t[tj:]
if t != orig: open(P, 'w', encoding='utf-8').write(t); print('CERTS: index.html written')
else: print('CERTS: already patched')
