#!/usr/bin/env python3
"""Idempotent patch BIDINVITE (owner 11/20): "📨 Send sign-up link" in the CRM (Admin → 🔐 Sub portal accounts, Subs → Sub portal).
tools/bidinvite_block.html becomes a script right after SUBACCT. Server: bid-hub op signuplink (_lib/bidinvite.js); the bid-job invites
(bid-hub op invite, subportal invite-send) e-mail at once, tagged 'trade' so data-entry mode lets them go (_lib/pause.js).
Usage: python3 tools/patch_BIDINVITE.py [index.html]"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_BIDINVITE__' in src:
    print('already patched'); sys.exit(0)
BLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bidinvite_block.html'), encoding='utf-8').read().rstrip('\n')
a = src.index('<script id="gc-patch-subacct">'); b = src.index('</script>', a) + len('</script>')
src = src[:b] + '\n' + BLOCK + src[b:]
open(path, 'w', encoding='utf-8').write(src)
print('patched')
