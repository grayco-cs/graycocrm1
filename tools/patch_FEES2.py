#!/usr/bin/env python3
"""Idempotent patch FEES2: owner changed his mind (10/26) - attorney fees are a MUTUAL prevailing-party clause on every customer document.

Replaces the one-way sentence FEES put everywhere with one mutual sentence (document noun kept: this Agreement / this contract / this invoice /
these Payment Terms / this Authorization), same paragraph, ordinary styling:
  "In any action or proceeding arising out of or relating to <doc>, including collection of amounts due, the prevailing party shall be entitled
   to recover its reasonable attorney fees, collection costs and court costs from the other party."
Final Demand Letter: GrayCo "may seek its attorney fees and costs as provided in the agreement and by law" (no one-way promise).
Admin-only flag text -> "Prevailing-party attorney-fee clause (owner 10/26): confirm wording for TN/MS/AR." (still admin-only).
Subcontract documents are not touched. Every find-string is asserted to occur the expected number of times.
Usage: python3 tools/patch_FEES2.py [index.html] [legal2.js] [netlify/functions/_lib/invoice-pdf.js]
"""
import sys, os, re
from collections import Counter
ipath = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
base = os.path.dirname(os.path.abspath(ipath))
lpath = sys.argv[2] if len(sys.argv) > 2 else os.path.join(base, 'legal2.js')
vpath = sys.argv[3] if len(sys.argv) > 3 else os.path.join(base, 'netlify/functions/_lib/invoice-pdf.js')
src = open(ipath, encoding='utf-8').read()
l2 = open(lpath, encoding='utf-8').read()
inv = open(vpath, encoding='utf-8').read()
MARK = 'FEES2-patch'
if MARK in src:
    assert 'arising out of or relating to this invoice' in inv, 'half patched (invoice-pdf.js)'
    print('already patched'); sys.exit(0)
assert 'arising out of or relating to' not in inv and 'arising out of or relating to' not in l2, 'half patched'

ONEWAY = re.compile(
    r"If (?:GrayCo|Contractor) retains an attorney or collection agency to collect amounts due under (?P<doc>[A-Za-z ]+?), or prevails in any action or "
    r"proceeding arising out of (?P=doc)(?P<x> or the contract)?, (?:Owner|the customer|the homeowner|the owner|I) (?:shall|will) pay "
    r"(?:GrayCo|Contractor)(?:’|\\u2019|\\'|')s reasonable attorney fees, collection costs and court costs, in addition to any other relief\.")

def mutual(m):
    return ("In any action or proceeding arising out of or relating to %s%s, including collection of amounts due, the prevailing party shall be "
            "entitled to recover its reasonable attorney fees, collection costs and court costs from the other party." % (m.group('doc'), m.group('x') or ''))

def sweep(text, expect, label):
    found = Counter(m.group('doc') + (m.group('x') or '') for m in ONEWAY.finditer(text))
    assert dict(found) == expect, ('one-way sentence count mismatch', label, dict(found), expect)
    return ONEWAY.sub(mutual, text)

# expected counts in index.html: 18 one-way sentences (the Final Demand Letter is handled separately below)
found = Counter(m.group('doc') + (m.group('x') or '') for m in ONEWAY.finditer(src))
EXP_INDEX = {'this Agreement': 8, 'this agreement': 3, 'these Payment Terms': 1, 'this Authorization': 1, 'this contract': 3, 'this invoice or the contract': 2}
assert dict(found) == EXP_INDEX, ('index.html one-way counts', dict(found))
src = ONEWAY.sub(mutual, src)
l2 = sweep(l2, {'this Agreement': 3}, 'legal2.js')
inv = sweep(inv, {'this invoice or the contract': 1}, 'invoice-pdf.js')

def once(text, old, new, label, n=1):
    c = text.count(old)
    assert c == n, ('anchor count != %d' % n, label, c)
    return text.replace(old, new)

# Final Demand Letter: no one-way promise
src = once(src, "and if GrayCo retains an attorney or collection agency to collect amounts due under your contract, or prevails in any action or proceeding arising out of it, you pay GrayCo's reasonable attorney fees, collection costs and court costs, in addition to any other relief.",
           "and GrayCo may seek its attorney fees and costs as provided in the agreement and by law.", 'final demand letter')
src = once(src, "Attorney fees are one-way in GrayCo's favor (owner 10/26), matching the contract and invoice wording.",
           "Attorney fees: GrayCo may seek them \"as provided in the agreement and by law\" (owner 10/26: prevailing-party, mutual); no one-way promise in this letter.".replace('"', '\\"'), 'final demand flag')

# admin-only flag text (index.html: var FEE_NOTE + job template select; both admin-only)
OLDN = "One-way attorney-fee clause (owner 10/26): confirm enforceability in TN/MS/AR, esp. AR §16-22-308 and consumer contracts."
NEWN = "Prevailing-party attorney-fee clause (owner 10/26): confirm wording for TN/MS/AR."
src = once(src, OLDN, NEWN, 'admin flag text', n=2)
src = once(src, "/* FEES-patch: admin-only flag on the templates that carry the one-way attorney-fee clause. Never printed. */",
           "/* FEES-patch / FEES2-patch: admin-only flag on the templates that carry the prevailing-party attorney-fee clause. Never printed. */", 'comment')

open(ipath, 'w', encoding='utf-8').write(src)
open(lpath, 'w', encoding='utf-8').write(l2)
open(vpath, 'w', encoding='utf-8').write(inv)
print('patched', ipath, lpath, vpath)
