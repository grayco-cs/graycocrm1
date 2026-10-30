#!/usr/bin/env python3
"""Idempotent patch MKTFIX6 (Marketing audit, security): the employee list stays with GrayCo.

The Marketing Manager could read gc_kv "users" — the employee list with every employee's phone, pay type, hire date,
vehicle and plate, shirt size and certificates. Malcolm works for the outside agency; none of that is marketing.
docs/marketing-role.sql no longer lets him read "users" (run it again), and his browser no longer asks for it
(patch MKTFIX1's fence). His own name comes from Team access (gc_staff.name, MKTFIX1); the server signs his work.

    python3 tools/patch_MKTFIX6.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = 'patch MKTFIX6'
if MARK in t:
    print('MKTFIX6: already patched'); sys.exit(0)
old = "var MM_KEYS = { users: 1, gc_company_address: 1, gc_epoch: 1, gc_mkt_admin: 1, gc_automation_pause: 1 };"
new = "var MM_KEYS = { gc_company_address: 1, gc_epoch: 1, gc_mkt_admin: 1, gc_automation_pause: 1 };   /* patch MKTFIX6: not \"users\" (employees' phones, pay type, plates …) */"
assert t.count(old) == 1, t.count(old)
t = t.replace(old, new)
# his name on what he makes (posts, drafts, "by"): the signed-in CRM user (Team access), not the employee list
old2 = "function meUser(){ var em = myEmail(); return arr(crm().users).filter(function(u){ return u && em && low(u.email) === em; })[0] || null; }"
new2 = "function meUser(){ var em = myEmail(); return arr(crm().users).filter(function(u){ return u && em && low(u.email) === em; })[0] || (function(){ try { var m = W._gcMMData && typeof W._gcMeUser === 'function' ? W._gcMeUser() : null; return m && m.name ? m : null; } catch (e) { return null; } })() || null; }   /* patch MKTFIX6: the Marketing Manager is not on the employee list he reads */"
assert t.count(old2) == 1, t.count(old2)
t = t.replace(old2, new2)
open(p, 'w', encoding='utf-8').write(t)
print('MKTFIX6: patched')
