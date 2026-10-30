#!/usr/bin/env python3
"""Idempotent patch R17FIX1: the Office tab lists only the leads the Leads screen lists.

Found 10/30 on the live mirror (r17 gate test_OFFAUDIT 18/19): signed in as the office, Office -> Helpers -> "Open" on
a lead went to Leads but the lead's panel never opened (still closed 35 s later). The Helpers list read the lead list
(window._crm.leads / _gcLaLeads), which still holds leads the Leads screen leaves out since LEADBULK's dead(): deleted
(gc_tombstones) or the lead-delete guard's _gcLDEL.blocked (the same CompanyCam / QuickBooks / inbox id as a deleted
lead) -- 38 of 152 on the live data; the first lead in Helpers (LGN_...) was one of them. The Leads screen had its 114
leads at once (office and owner alike); only the Helpers row pointed at a lead it does not show.
Fix: the Office tab's openLeads() leaves out what the Leads screen's dead() leaves out (same two checks).
Usage: python3 tools/patch_R17FIX1.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch R17FIX1'
if MARK in src:
    print('R17FIX1: already patched'); sys.exit(0)
A = "function openLeads(){ return leadsL().filter(function(l){ return l && l.id && !l.deleted && !l.archived && !l.mergedInto && !importedL(l) && !shutL(l); }); }"
B = ("function hubDeadL(l){ try { if (typeof W._gcIsTombstoned === 'function' && W._gcIsTombstoned('leads', l.id)) return true; } catch (e) {}"
     " try { if (W._gcLDEL && typeof W._gcLDEL.blocked === 'function' && W._gcLDEL.blocked(l)) return true; } catch (e) {} return false; }"
     "   /* patch R17FIX1: the leads the Leads screen leaves out (LEADBULK dead()) are not offered here: Open could not open them */\n"
     "function openLeads(){ return leadsL().filter(function(l){ return l && l.id && !l.deleted && !l.archived && !l.mergedInto && !importedL(l) && !shutL(l) && !hubDeadL(l); }); }")
assert src.count(A) == 1, ('R17FIX1 anchor count != 1', src.count(A))
src = src.replace(A, B)
assert src.count(MARK) == 1
open(path, 'w', encoding='utf-8').write(src)
print('R17FIX1: patched', path)
