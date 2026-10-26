#!/usr/bin/env python3
"""Idempotent patch LEADSDOC: the leads@ / bids@ process rule in the in-CRM training (Company documents -> Training) and the PM playbook.

  leads@grayco-cs.com = all incoming leads and bid invitations (bid sites, plan rooms, bid boards, GC invitation lists, web / Facebook / Google forms).
  bids@grayco-cs.com  = ONLY our own bids going out (sent from the CRM) and GCs' replies to them. Never sign up for notices with bids@.

Text only. Edits the BUILTIN training JSON (Estimators, Office, How do I...?) and the PM playbook bullet; each find-string must occur exactly once.
Usage: python3 tools/patch_LEADSDOC.py [index.html]
"""
import sys, json
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = 'LEADSDOC-rule'
if MARK in src:
    print('already patched'); sys.exit(0)

def j(s):  # JSON-escaped string body (no outer quotes), as the BUILTIN line stores it
    return json.dumps(s, ensure_ascii=False)[1:-1]

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

RULE = ("**leads@grayco-cs.com is for all incoming leads and bid invitations.** Every bid site, plan room (BuildingConnected, PlanHub and others), "
        "city, county and school bid board, and GC invitation list gets signed up with leads@grayco-cs.com. %sWebsite, Facebook and Google lead forms also send to leads@. "
        "The CRM reads leads@ and turns each e-mail into a lead or bid lead in Leads → \U0001F4E5 Lead Inbox / Bids automatically.\n\n"
        "**bids@grayco-cs.com is only for our own bids going out** (sent from the CRM) **and GCs' replies to them.** Never sign up for notices with bids@.%s\n\n")

# 1. Estimators: Bid boards and the Lead Inbox (rule first, then the existing bullets)
once('"id": "bid-boards-and-the-lead-inbox", "title": "Bid boards and the Lead Inbox", "body": "',
     '"id": "bid-boards-and-the-lead-inbox", "title": "Bid boards and the Lead Inbox", "body": "' + j(RULE % ('Tell GCs: "send invitations to leads@grayco-cs.com". ', '')), 'estimator part')

# 2. Office: a new part before the Email Center part
office = {"id": "where-leads-and-bid-invitations-go", "title": "Where leads and bid invitations go",
          "body": (RULE % ('If you set one up or a GC asks where to send an invitation, say: "send invitations to leads@grayco-cs.com". ',
                           ' Supplier receipts and invoices have their own addresses, as described under Expenses and receipts.')).rstrip('\n')}
once('{"id": "email-center-the-gmail-tab"', json.dumps(office, ensure_ascii=False) + ', {"id": "email-center-the-gmail-tab"', 'office part')

# 3. How do I...?: a question at the end of Leads and bids (before the Jobs part)
Q = ("\n\n**What e-mail do I sign up for bid sites with, and where do bid invitations go?** **leads@grayco-cs.com**, always. It is for all incoming leads and bid invitations: "
     "every bid site, plan room (BuildingConnected, PlanHub and others), city, county and school bid board, and GC invitation list. "
     'Tell GCs: "send invitations to leads@grayco-cs.com". Website, Facebook and Google lead forms also send to leads@. '
     "The CRM turns each e-mail into a lead or bid lead in Leads → \U0001F4E5 Lead Inbox / Bids automatically. "
     "Never sign up with bids@: it is only for our own bids going out (sent from the CRM) and GCs' replies to them.")
once('Each GC gets its own e-mail and PDF."}, {"id": "jobs", "title": "Jobs"',
     'Each GC gets its own e-mail and PDF.' + j(Q) + '"}, {"id": "jobs", "title": "Jobs"', 'faq part')

# 4. The PM playbook text kept in the CRM (one bullet under Leads)
once(r"<li><b>Bid invitations go to leads@grayco-cs.com<\/b> (the boards, planrooms, GCs and agencies);",
     r"<li><b>leads@grayco-cs.com is for all incoming leads and bid invitations.<\/b> Every bid site, plan room (BuildingConnected, PlanHub and others), city, county and school bid board and GC invitation list is signed up with leads@, and GCs are told \"send invitations to leads@grayco-cs.com\". Website, Facebook and Google lead forms send there too, and the CRM turns each e-mail into a lead or bid lead in Leads → <b>📥 Lead Inbox<\/b> / Bids. <b>Never sign up for notices with bids@.<\/b>",
     'playbook lead')
once(r"is for <b>Sub bids<\/b> (prices subs send us — they land under Leads → <b>📨 Sub bids<\/b>) and GCs\' replies to <b>Our bids<\/b>",
     r"is only for <b>our own bids going out<\/b> and GCs\' replies to <b>Our bids<\/b> (subs' prices e-mailed there still land under Leads → <b>📨 Sub bids<\/b>)",
     'playbook bids@')
src = src.replace('var SEEDV = 3;', 'var SEEDV = 3; /* ' + MARK + ' */', 1) if src.count('var SEEDV = 3;') == 1 else src
assert MARK in src
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
