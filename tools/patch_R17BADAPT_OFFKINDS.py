#!/usr/bin/env python3
"""Idempotent adapter R17BADAPT_OFFKINDS (release r17b): OFFFEAT's three new approval kinds go on the OFFICE list.

OFFFEAT (tools/offfeat.js, netlify/functions/_lib/offfeat.js) queues sub_doc_request (a COI / W-9 request to the sub),
gcp_co_nudge (the GC: an unsigned change order) and sign_co_nudge (the customer: an unsigned change order) with
officeOk. The office approves everything that goes to an outside person (APOFFICE4), so the three kinds join the
office list in the CRM's copy (window._gcApOfficeKind, patch APOFFICE4 / OFFFIX1) -- the same change as
netlify/functions/_lib/office-kinds.js (tools/tests/test_APOFFICE4.mjs checks that the two lists match).
Usage: python3 tools/patch_R17BADAPT_OFFKINDS.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
OLD = '"lead_assign","assign_estimator","assign_pm"];'
NEW = '"lead_assign","assign_estimator","assign_pm","sub_doc_request","gcp_co_nudge","sign_co_nudge"];'
if NEW in t:
    print('R17BADAPT_OFFKINDS: already patched'); sys.exit(0)
assert t.count(OLD) == 1, ('R17BADAPT_OFFKINDS anchor', t.count(OLD))
t = t.replace(OLD, NEW)
open(p, 'w', encoding='utf-8').write(t)
print('R17BADAPT_OFFKINDS: patched ' + p)
