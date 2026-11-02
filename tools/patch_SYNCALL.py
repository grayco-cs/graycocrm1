#!/usr/bin/env python3
"""Idempotent patch SYNCALL (on top of CUSTSYNC): every synced list reaches the screen after the first sign-in.

CUSTSYNC fixed the race for the customers only (see tools/patch_CUSTSYNC.py): the no-jump guard notes a cloud list as
"on the screen" before the hand-over happens, the hand-over is held (the sign-in click counts as working) and a held
cloud list older than 8 s is dropped - so ANY list (invoices, expenses, leads, jobs, the schedule, ...) could stay
stale or empty for that page after the first sign-in.

1. The CRM's own list setters are published: window.__gcListSetterOf(key) -> the setter a sync uses for that list
   (x.current[key], with the same "this came from a sync" mark), or null.
2. tools/syncall.js goes in as <script id="gc-patch-syncall"> right after CUSTSYNC's helper: window._gcCloudSeen also
   keeps the cloud's copy of every list a pull brings; a list the cloud delivered that did not reach the screen (records
   missing, or older copies) is put together with the cloud's through that list's own setter. Never shorter; deleted /
   put-aside records, zero-dollar expenses stay out; it waits while someone types, an edit is open, a job is open.
Usage: python3 tools/patch_SYNCALL.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
src = open(path, encoding='utf-8').read()
orig = src
js = open(os.path.join(HERE, 'syncall.js'), encoding='utf-8').read()
assert '</script' not in js.lower(), 'SYNCALL: a closing script tag in tools/syncall.js'


def once(s, old, new, label):
    n = s.count(old); assert n == 1, ('SYNCALL: anchor count != 1', label, n)
    return s.replace(old, new)


assert '<script id="gc-patch-custsync">' in src, 'SYNCALL: patch CUSTSYNC must be in first'

# 1. the list setters
MARK1 = '/* patch SYNCALL: the list setters */'
if MARK1 not in src:
    src = once(src, 'try{window._gcApplySyncRaw=function(k,v){if(x.current[k]){du.add(k);x.current[k](v);setTimeout(function(){du.delete(k)},1000)}};',
               'try{window.__gcListSetterOf=function(k){var f=x.current&&x.current[k];return typeof f==="function"?function(v){du.add(k);f(v);setTimeout(function(){du.delete(k)},1000)}:null};' + MARK1 +
               'window._gcApplySyncRaw=function(k,v){if(x.current[k]){du.add(k);x.current[k](v);setTimeout(function(){du.delete(k)},1000)}};',
               'the sync setters (x.current)')

# 2. the script (replaced when tools/syncall.js changes)
TAG = '<script id="gc-patch-syncall">'
if TAG in src:
    assert src.count(TAG) == 1, 'SYNCALL: script twice'
    i = src.index(TAG) + len(TAG) + 1; j = src.index('</script>', i)
    if src[i:j] != js: src = src[:i] + js + src[j:]
else:
    src = once(src, '<script id="gc-patch-custall">', TAG + '\n' + js + '</script>\n<script id="gc-patch-custall">', 'after CUSTSYNC')

if src == orig:
    print('SYNCALL: already patched'); sys.exit(0)
open(path, 'w', encoding='utf-8').write(src)
print('SYNCALL: patched', path)
