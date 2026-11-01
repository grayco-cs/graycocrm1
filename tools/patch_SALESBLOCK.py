#!/usr/bin/env python3
"""Idempotent patch SALESBLOCK (index.html): Leads → 🧹 Sales & spam, ⚙ Admin settings → 🚫 Blocked, 🚫 Block sender on a
lead and on an Unsorted text, the alert text's signed "Block:" link (?sgb=). Admins and the office only.
The page code is tools/salesblock_tail.js; the detector (the RULES-BEGIN … RULES-END block) is copied VERBATIM from
netlify/functions/_lib/salesguard.js so the page and the server use the same rules. Placed right after the
📱 Text alerts script (gc-patch-smsalert). Every anchor must occur exactly once; a re-run prints "already patched".
Usage: python3 tools/patch_SALESBLOCK.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(path, encoding='utf-8').read()
MARK = '/* patch SALESBLOCK */'
# owner 11/01 follow-up: "don't promise any days in portal or text, just say with you shortly" (customer-facing text in the CRM)
DAYS = [
    ("new: 'Received — your PM will reach out within 2 business days',", "new: 'Received — your PM will be with you shortly' /* patch SALESBLOCK: no day promise */,"),
    ("'Warranty claims: call (901) 585-0944 or email office@grayco-cs.com. All warranty service requests acknowledged within 2 business days.',",
     "'Warranty claims: call (901) 585-0944 or email office@grayco-cs.com. Someone from our team will be with you shortly.' /* patch SALESBLOCK: no day promise */,"),
]
days_done = 0
for old, new in DAYS:
    if src.count(new) == 1 and old not in src: continue
    assert src.count(old) == 1, ('day-promise anchor count', old[:60], src.count(old))
    src = src.replace(old, new); days_done += 1
# owner 11/01: a small ✕ on each Messages → 📥 Unsorted row (tools/salesblock_unsorted.js), right after the main script
UNS_MARK = '__GC_PATCH_SALESBLOCK_UNSORTED__'
def unsorted(src):
    if UNS_MARK in src: return src, 0
    t = open(os.path.join(HERE, 'salesblock_unsorted.js'), encoding='utf-8').read().rstrip('\n')
    assert '</script' not in t.lower()
    end = "try { console.log('[GC] 🧹 Sales & spam + 🚫 Blocked (patch SALESBLOCK) — _gcSalesBlock'); } catch (e) {}\n})();\n</script>\n"
    assert src.count(end) == 1, ('salesblock script end', src.count(end))
    assert src.count('W._gcMsgUnsorted = function(){') == 1 and src.count("'<div class=\"gc-qa-urow\"") == 1, 'Unsorted hooks'
    return src.replace(end, end + '<script id="gc-patch-salesblock-unsorted">\n/* patch SALESBLOCK unsorted */\n' + t + '\n</script>\n'), 1
if '__GC_PATCH_SALESBLOCK__' in src:
    src, n = unsorted(src)
    if days_done or n: open(path, 'w', encoding='utf-8').write(src); print('patched', path, '(no day promises / Unsorted ✕)')
    else: print('already patched')
    sys.exit(0)
lib = open(os.path.join(HERE, '..', 'netlify', 'functions', '_lib', 'salesguard.js'), encoding='utf-8').read()
a, b = lib.find('/* RULES-BEGIN'), lib.find('/* RULES-END */')
assert a >= 0 and b > a and lib.count('/* RULES-BEGIN') == 1 and lib.count('/* RULES-END */') == 1, 'rules block markers'
rules = lib[a:b + len('/* RULES-END */')]
tail = open(os.path.join(HERE, 'salesblock_tail.js'), encoding='utf-8').read().rstrip('\n')
assert tail.count('/*__SG_RULES__*/') == 1
tail = tail.replace('/*__SG_RULES__*/', rules)
assert '</script' not in tail.lower(), 'no </script> inside the patch'
anchor = "try { console.log('[GC] 📱 Text alerts to cell phones: ⚙ Admin → 📱 Text alerts (patch SMSALERT) — _gcSmsAlerts'); } catch (e) {}\n})();\n</script>\n"
assert src.count(anchor) == 1, ('anchor count', src.count(anchor))
assert src.count('W._gcAdmAddSection = function(c)') == 1, 'admin sections hook'
assert src.count("W._gcLeadsHub = {") == 1, 'leads hub'
src = src.replace(anchor, anchor + '<script id="gc-patch-salesblock">\n' + MARK + '\n' + tail + '\n</script>\n')
src, _n = unsorted(src)
assert src.count('__GC_PATCH_SALESBLOCK__') >= 1 and src.count(MARK) == 1
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
