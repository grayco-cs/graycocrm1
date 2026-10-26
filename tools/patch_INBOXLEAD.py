#!/usr/bin/env python3
"""Idempotent patch INBOXLEAD: a new Lead Inbox item (website form, leads@ / claims@ e-mail, bid mail, CompanyCam, phone,
referral…) becomes a lead on the Leads screen within about a minute, while the CRM is open.

Root cause: the Lead Inbox (patch LD2) only collected the server's list (bid-inbox ?list=1) 7 s after the page loaded,
when its panel was first mounted (at most once a minute), after the tab was hidden for 3+ minutes, or on "online".
Since the Leads screen became one view with a persistent tab bar (LEADSCON / LEADFREEZE) the panel is mounted once and
never re-mounted, so a CRM left open never collected anything new: the item sat in gc_lead_inbox (the alert e-mail
went out) but never reached the Lead Pipeline until a reload.

Fix: while the page is visible and someone is signed in, LD2 collects when its last collect is 25+ s old (checked
every 10 s, so a new item shows within ~35-45 s) for admins, office and the lead roles (whose Leads scope is not just
"my leads"), and every 5 minutes for everyone else. The collect turns a new item into an unassigned "New Lead".

Usage: python3 tools/patch_INBOXLEAD.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch INBOXLEAD */'
if MARK in src:
    print('INBOXLEAD: already patched'); sys.exit(0)

def once(s, old, new):
    n = s.count(old)
    assert n == 1, ('INBOXLEAD anchor count != 1', n, old[:90])
    return s.replace(old, new)

OLD = """  later(function(){ pull(false); }, 7000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && Date.now() - lastPull > 180000) pull(false); });
  window.addEventListener('online', function(){ later(function(){ pull(true); }, 2000); });
}"""
NEW = """  later(function(){ pull(false); }, 7000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && Date.now() - lastPull > 180000) pull(false); });
  window.addEventListener('online', function(){ later(function(){ pull(true); }, 2000); });
  """ + MARK + """   /* a CRM left open collects new inbox items (website / leads@ / claims@ …) within about a minute */
  var IV = window.__GC_NATIVE_SETINTERVAL__ || setInterval;
  IV.call(window, function(){
    try {
      if (document.hidden || navigator.onLine === false || busy) return;
      var A = window.__GC_AUTH__; if (!A || !A.email || !A.email()) return;
      var fast = isAdmin(); if (!fast) { try { var sc = window._gcLeadScope && window._gcLeadScope.of(); fast = !!(sc && sc.kind && sc.kind !== 'mine'); } catch (e) {} }
      if (Date.now() - lastPull > (fast ? 25000 : 300000)) pull(true);
    } catch (e) { warn(e); }
  }, 10000);
}"""
src = once(src, OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('INBOXLEAD: patched')
