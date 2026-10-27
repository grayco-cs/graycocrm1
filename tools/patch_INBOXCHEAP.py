#!/usr/bin/env python3
"""Idempotent patch INBOXCHEAP: the Lead Inbox's 25 s collect (INBOXLEAD) does the heavy part only when something changed.
Every collect used to re-run the whole import over the full leads list (setLeads updater, save, re-render, badge) even
when the server's inbox was identical — on real data that froze the page every ~25 s. Now the server list's signature
(id + status + updatedAt of every item) is remembered; an unchanged list skips the import and the list re-read, and the
open-CRM check runs every 40 s (+ jitter) for admins/office instead of 25 s.
Usage: python3 tools/patch_INBOXCHEAP.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch INBOXCHEAP */'
if MARK in t:
    print('INBOXCHEAP: already patched'); sys.exit(0)
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('INBOXCHEAP anchor count != 1', n, old[:80]); t = t.replace(old, new)
once("""    lastErr = '';
    return hydrated().then(importItems).then(function(){ return readList('_setLeads'); });""",
"""    lastErr = '';
    """ + MARK + """ var sig = S.items.map(function(x){ return x ? (x.id + ':' + x.status + ':' + (x.updatedAt || x.receivedAt || '')) : ''; }).join('|');
    if (sig === pull._sig && pull._sigAt && Date.now() - pull._sigAt < 600000) return null;   /* nothing changed on the server: no import, no re-save */
    pull._sig = sig; pull._sigAt = Date.now();
    return hydrated().then(importItems).then(function(){ return readList('_setLeads'); });""")
once("""      if (Date.now() - lastPull > (fast ? 25000 : 300000)) pull(true);""",
"""      if (Date.now() - lastPull > 7200000) pull(true);   /* patch INBOXCHEAP: owner 10/27 — check the lead list every 2 hours, not every 25 s */""")
open(p, 'w', encoding='utf-8').write(t); print('INBOXCHEAP: patched')
