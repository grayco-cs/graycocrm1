#!/usr/bin/env python3
"""patch PMPAY2 (owner 11/03 on the Payroll page: "bottom part needs to be up top and NO DALE PERRITT ANYWHERE IN THE CRM,
wesley is owner no commission needed"):
 - Payroll page order: 💵 Payroll heading + tabs first, then the red / checks-due bars, then the tab's own content, and the
   🔎 PM pay check card LAST (it was above everything).
 - PM pay check: only people on Admin → Team who are active and not let go (gc_fired_users: Dale Perritt) and not an
   owner / admin (Wesley) are checked. Leftover payroll profiles or ledger names of anyone else are ignored.
Edits index.html + tools/pmpaycheck_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
IDX = os.path.join(H, '..', 'index.html'); TAIL = os.path.join(H, 'pmpaycheck_tail.js')
MARK = '/* patch PMPAY2'
WHO_A = ("      pms.push({ key:s((u && u.id) || nm), name:s(nm), prof:null, user:u });\n    });\n  });\n")
WHO_B = WHO_A + ("  /* patch PMPAY2: only active Team people who are not let go and not an owner / admin */\n"
  "  (function(){ var fired = {}; try{ fired = JSON.parse(localStorage.getItem('gc_fired_users') || '{}') || {}; }catch(_f){}\n"
  "    var owners = {}; try{ (window._gcOwnerNames ? window._gcOwnerNames() : []).forEach(function(n){ owners[low(n)] = 1; }); }catch(_o){}\n"
  "    pms = pms.filter(function(pm){ var u = pm.user, nm = low(pm.name), em = low(u && u.email);\n"
  "      if(fired[nm] || (em && fired[em])) return false;\n"
  "      if(users.length && !u) return false;\n"
  "      if(u && (u.active === false || u.fired === true || u.terminated === true || /inactive|terminat|former|fired|let go|removed/.test(low(u.status)))) return false;\n"
  "      if(owners[nm] || (u && (/^(admin|owner)$/.test(low(u.role)) || low(u.payType) === 'owner'))) return false;\n"
  "      return true; }); })();\n")
L_BARS = ("    + (pend.length ? redBar(pend) : '')\n"
          "    + (due && (due.subs.length||due.payroll.length) ? checksDueBar(due) : '')\n"
          "    + ((P.canSee()&&window._gcPmPayCard) ? '<div id=\"_gcPmPayCardMount\"></div>' : '')   /* patch PMPAYCHECK */\n")
L_END = "    + '</div><div id=\"_payBody\"></div></div>';\n"
L_END_B = ("    + '</div>'   /* patch PMPAY2: heading + tabs first, then the bars, the tab, and the PM pay check last */\n"
           "    + (pend.length ? redBar(pend) : '')\n"
           "    + (due && (due.subs.length||due.payroll.length) ? checksDueBar(due) : '')\n"
           "    + '<div id=\"_payBody\"></div>'\n"
           "    + ((P.canSee()&&window._gcPmPayCard) ? '<div id=\"_gcPmPayCardMount\" style=\"margin-top:18px\"></div>' : '')\n"
           "    + '</div>';\n")
def edit(P, pairs):
    t = open(P, encoding='utf-8').read()
    if MARK in t: return 0
    for a, b in pairs:
        n = t.count(a)
        if n != 1: print('anchor count', n, 'in', P, 'for', a[:80]); sys.exit(1)
        t = t.replace(a, b)
    open(P, 'w', encoding='utf-8').write(t); return 1
n = edit(TAIL, [(WHO_A, WHO_B)]) + edit(IDX, [(WHO_A, WHO_B), (L_BARS, ''), (L_END, L_END_B)])
print('patched PMPAY2 (%d file(s))' % n if n else 'already patched')
