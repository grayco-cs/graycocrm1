#!/usr/bin/env python3
"""Idempotent patch FEES: attorney-fee wording is ONE-WAY in GrayCo's favor on every customer contract, proposal and agreement.

Owner's decision (10/26): if GrayCo retains an attorney or collection agency to collect, or prevails in any action or proceeding, the
owner/customer pays GrayCo's reasonable attorney fees, collection costs and court costs, in addition to any other relief. If GrayCo does
not prevail, GrayCo does NOT pay the customer's fees. No "prevailing party" reciprocity anywhere on a customer document.
Style (owner): "I don't want it front and center" - ordinary sentence inside the existing payment/collection or dispute paragraph, same
font / size / weight as the clause around it. No bold, caps, heading, box or acknowledgment. Never hidden or smaller.

Changed (index.html unless noted):
  Job Type Template contract text: Residential (clause 9), Commercial (clause 9)             [dispute clause: sentence replaced]
  Insurance Restoration, Insurance Roof, Water Damage, Fire Damage templates (clause PAYMENT) [sentence added to the payment clause]
  TN / MS / AR contract variants: legal2.js DATA.dispute (3 states) + the generated contract builder (clause 9)
  printDoc contract (clause 9), DM.contract short-form PDF contract (payment clause)
  GrayCo-format proposal: the "LEGAL FEES" block (patch LEGAL3 made it mutual) is removed; the one-way sentence joins LATE PAYMENT
  Both print invoices (payment terms) and netlify/functions/_lib/invoice-pdf.js (payment terms)
  Library: Construction Agreement (9. Disputes), Payment Terms, Insurance Roof Agreement, Mitigation Services Agreement,
           Mold Remediation Agreement, Contents Pack-Out Authorization
  Final Demand Letter (customer letter): mutual wording -> one-way (and its admin flag)
  Admin-only note "One-way attorney-fee clause (owner 10/26): confirm enforceability in TN/MS/AR, esp. AR §16-22-308 and consumer contracts."
    on those library documents (Company Documents list + template editor) and under the Job Type Template select. Never printed.
NOT changed: Master Subcontract, Sub Work Order, Sub Agreement (sub relationship), Referral / HR / Independent-contractor forms, the
  mutual third-party-claim INDEMNITY clause (16), the Work Authorization (it has no fee language).
Every find-string must occur exactly once (the Residential + Commercial pair share one verbatim sentence: exactly twice).
Usage: python3 tools/patch_FEES.py [index.html] [legal2.js] [netlify/functions/_lib/invoice-pdf.js]
"""
import sys, os
ipath = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
lpath = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(ipath)), 'legal2.js')
vpath = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(ipath)), 'netlify/functions/_lib/invoice-pdf.js')
src = open(ipath, encoding='utf-8').read()
l2 = open(lpath, encoding='utf-8').read()
inv = open(vpath, encoding='utf-8').read()
MARK = 'FEES-patch'
if MARK in src:
    assert MARK in inv, 'half patched (invoice-pdf.js)'
    print('already patched'); sys.exit(0)
assert MARK not in inv and MARK not in l2, 'half patched'

def once(text, old, new, label, n=1):
    c = text.count(old)
    assert c == n, ('anchor count != %d' % n, label, c)
    return text.replace(old, new)

CORE = "reasonable attorney fees, collection costs and court costs, in addition to any other relief."
def S(who, doc, payer, poss, ap="’"):
    """The one-way sentence. who = GrayCo|Contractor, doc = 'this Agreement', payer = Owner / the customer / I, poss = GrayCo / Contractor."""
    return ("If %s retains an attorney or collection agency to collect amounts due under %s, or prevails in any action or proceeding "
            "arising out of %s, %s %s pay %s%ss " % (who, doc, doc, payer, 'will' if payer == 'I' else 'shall', poss, ap)) + CORE

# ------------------------------------------------------------------ Residential + Commercial template contracts (index.html, curly apostrophes)
OLD_A = ("In any mediation, arbitration, or legal proceeding, the prevailing party shall recover all reasonable attorney’s fees, court costs, "
         "arbitration fees, and related expenses, whether GrayCo is plaintiff or defendant, including any action to enforce this contract, "
         "collect payment, or defend against claims.")
NEW_A = S('GrayCo', 'this Agreement', 'Owner', 'GrayCo')
src = once(src, 'This Agreement is governed by the laws of Tennessee. ' + OLD_A, 'This Agreement is governed by the laws of Tennessee. ' + NEW_A, 'residential+commercial clause 9', n=2)

# generated contract builder (state variants), JS-escaped
OLD_B = OLD_A.replace('’', '\\u2019')
NEW_B = NEW_A.replace('’', '\\u2019')
src = once(src, "governed by the laws of '+stateName+'. " + OLD_B, "governed by the laws of '+stateName+'. " + NEW_B, 'contract builder clause 9')

# legal2.js DATA.dispute: one per state
for st in ('Tennessee', 'Mississippi', 'Arkansas'):
    l2 = once(l2, 'This Agreement is governed by the laws of %s. %s' % (st, OLD_A), 'This Agreement is governed by the laws of %s. %s' % (st, NEW_A), 'legal2.js dispute ' + st)

# ------------------------------------------------------------------ printDoc contract, clause 9 (plain text: the old sentence was bold)
OLD_C = ("In any such mediation, arbitration, or legal proceeding, the <b>prevailing party shall be entitled to recover all reasonable attorney\\'s fees, "
         "court costs, arbitration fees, and related legal expenses</b> from the non-prevailing party, whether GrayCo is the plaintiff or defendant, "
         "including any action to enforce this contract, collect payment, or defend against claims arising from the project.")
NEW_C = S('GrayCo', 'this contract', 'Owner', 'GrayCo', "\\'")
src = once(src, OLD_C, NEW_C, 'printDoc contract clause 9')

# ------------------------------------------------------------------ insurance templates: the PAYMENT clause (template literals, plain text)
def pay(old_line, doc='this Agreement'):
    global src
    sent = S('Contractor', doc, 'Owner', 'Contractor', "'")
    src = once(src, '\n' + old_line + '\n', '\n' + old_line + ' ' + sent + '\n', 'insurance payment: ' + old_line[:40] + old_line[-30:])
pay("3. PAYMENT: Insurance proceeds shall be endorsed and delivered to Contractor upon receipt. Owner shall pay the deductible amount at the start of the project. Any recoverable depreciation shall be collected by Owner from the insurance company and paid to Contractor upon receipt.")
pay("3. PAYMENT: Insurance proceeds for the approved scope shall be endorsed and delivered to Contractor upon receipt. Owner shall pay the deductible at the start of the project. Recoverable depreciation shall be collected from the insurance company and paid to Contractor upon collection.")
pay("3. PAYMENT: Insurance proceeds endorsed to Contractor upon receipt. Deductible due at project start. Recoverable depreciation paid to Contractor upon collection.")
pay("3. PAYMENT: Insurance proceeds endorsed to Contractor upon receipt. Deductible due at project start. Recoverable depreciation paid to Contractor upon collection from insurance.")

# ------------------------------------------------------------------ short-form PDF contract (DM.contract): the payment paragraph
src = once(src, "whichever is less.');   /* LEGAL3-patch: the one late-fee wording */",
           "whichever is less. " + S('GrayCo', 'this contract', 'Owner', 'GrayCo', "\\'") + "');   /* LEGAL3-patch: the one late-fee wording */   /* FEES-patch */",
           'DM.contract payment')

# ------------------------------------------------------------------ GrayCo-format proposal: LEGAL FEES block out, one-way sentence into LATE PAYMENT
src = once(src, "      + '<div class=\"small\" style=\"margin-top:8px\"><b>LEGAL FEES:</b> In the event that litigation arises concerning this contract between GrayCo Construction Services, LLC and the customer, the prevailing party shall be entitled to recover its reasonable attorney\\'s fees, court costs and related expenses from the non-prevailing party.</div>'\n", '', 'proposal LEGAL FEES block')
src = once(src, "from the original due date until payment is received in full.</div>'",
           "from the original due date until payment is received in full. " + S('GrayCo', 'this contract', 'the customer', 'GrayCo', "\\'") + "</div>'   /* FEES-patch */", 'proposal LATE PAYMENT')

# ------------------------------------------------------------------ print invoices (payment terms)
src = once(src, "          'In any legal action to collect payment, the prevailing party shall recover all reasonable attorney\\'s fees, court costs, and collection expenses.',",
           "          '" + S('GrayCo', 'this invoice', 'the customer', 'GrayCo', "\\'").replace('arising out of this invoice', 'arising out of this invoice or the contract') + "',   /* FEES-patch */", 'invoice 1')
src = once(src, "      'In any collection action, the prevailing party recovers all reasonable attorneys\\' fees and costs.',",
           "      '" + S('GrayCo', 'this invoice', 'the customer', 'GrayCo', "\\'").replace('arising out of this invoice', 'arising out of this invoice or the contract') + "',   /* FEES-patch */", 'invoice 2')

# ------------------------------------------------------------------ library documents
LIB = "’"
src = once(src, "This agreement is governed by the laws of the state where the job is located.') +",
           "This agreement is governed by the laws of the state where the job is located. " + S('Contractor', 'this agreement', 'the customer', 'Contractor') + "') +   /* FEES-patch */", 'library contract 9')
src = once(src, "Final payment is due at substantial completion.'));",
           "Final payment is due at substantial completion. " + S('GrayCo', 'these Payment Terms', 'the customer', 'GrayCo') + "'));   /* FEES-patch */", 'library payment terms')
src = once(src, "Insurance payments for the approved scope are endorsed to GrayCo.')",
           "Insurance payments for the approved scope are endorsed to GrayCo. " + S('GrayCo', 'this agreement', 'the homeowner', 'GrayCo') + "')", 'library roof contingency')
src = once(src, "the owner is responsible for amounts not paid by insurance and for the deductible.')",
           "the owner is responsible for amounts not paid by insurance and for the deductible. " + S('GrayCo', 'this agreement', 'the owner', 'GrayCo') + "')", 'library mitigation')
src = once(src, "apply; if none, mediation first, then the courts or AAA arbitration in the county and state where the property is located. This Agreement, the estimate",
           "apply; if none, mediation first, then the courts or AAA arbitration in the county and state where the property is located. " + S('GrayCo', 'this Agreement', 'Owner', 'GrayCo', "'") + " This Agreement, the estimate", 'library mold contract')
src = once(src, "I am responsible for my deductible and for any amount my insurance does not pay. GrayCo does not act as my adjuster",
           "I am responsible for my deductible and for any amount my insurance does not pay. " + S('GrayCo', 'this Authorization', 'I', 'GrayCo', "'") + " GrayCo does not act as my adjuster", 'library packout')

# ------------------------------------------------------------------ Final Demand Letter (customer letter, one-way too)
src = once(src, "and the prevailing party in a collection action recovers its reasonable attorneys' fees and costs.",
           "and if GrayCo retains an attorney or collection agency to collect amounts due under your contract, or prevails in any action or proceeding arising out of it, you pay GrayCo's " + CORE, 'final demand letter')
src = once(src, 'Attorney fees are \\"prevailing party\\" (mutual), matching the contract and invoice wording.',
           'Attorney fees are one-way in GrayCo\'s favor (owner 10/26), matching the contract and invoice wording.', 'final demand flag')

# ------------------------------------------------------------------ admin-only flag (never printed)
NOTE = "One-way attorney-fee clause (owner 10/26): confirm enforceability in TN/MS/AR, esp. AR §16-22-308 and consumer contracts."
src = once(src, "function l2box(t){",
           "/* FEES-patch: admin-only flag on the templates that carry the one-way attorney-fee clause. Never printed. */\n"
           "var FEE_NOTE = " + repr(NOTE) + ", FEE_IDS = { gcb_contract: 1, gcb_payment_terms: 1, gcb_roof_contingency: 1, gcb_mitigation: 1, gcb_mold_contract: 1, gcb_packout_auth: 1 };\n"
           "function feeNoteRow(row, id){ if (!FEE_IDS[id] || !row || row.querySelector('[data-gc-admin-note=\"fees\"]')) return; var nt = D.createElement('span'); nt.setAttribute('data-gc-admin-note', 'fees'); nt.textContent = FEE_NOTE; nt.style.cssText = 'font-size:10.5px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:2px 6px'; row.appendChild(nt); }\n"
           "function l2box(t){", 'fee note helper')
src = once(src, "    l2NoteRow(row, m[1]);   /* LEGAL2-patch: admin-only */",
           "    l2NoteRow(row, m[1]);   /* LEGAL2-patch: admin-only */\n    feeNoteRow(row, m[1]);   /* FEES-patch: admin-only */", 'fee note list hook')
src = once(src, "(L2_IDS[b.id] ? '<br><span data-gc-admin-note=\"legal2\">' + L2_NOTE + '</span>' : '') + '</div>' +",
           "(L2_IDS[b.id] ? '<br><span data-gc-admin-note=\"legal2\">' + L2_NOTE + '</span>' : '') + (FEE_IDS[b.id] ? '<br><span data-gc-admin-note=\"fees\">' + FEE_NOTE + '</span>' : '') + '</div>' +", 'fee note editor')
src = once(src, 'children:"Admin note: DRAFT — pending attorney review (sent 10/26) (right-to-cancel clause, state contract wording, retainage)"}):null]})',
           'children:"Admin note: DRAFT — pending attorney review (sent 10/26) (right-to-cancel clause, state contract wording, retainage)"}):null,(window.__GC_AUTH__&&window.__GC_AUTH__.isAdmin&&window.__GC_AUTH__.isAdmin())?e.jsx("div",{"data-gc-admin-note":"fees",style:{fontSize:11,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"4px 8px",marginTop:4},children:' + repr(NOTE).replace("'", '"') + '}):null]})', 'fee note job template select')

# ------------------------------------------------------------------ server: invoice PDF payment terms
inv = once(inv, "In a collection action the prevailing party recovers its reasonable attorneys\\' fees and costs.', 8.5, R - L)",
           S('GrayCo', 'this invoice', 'the customer', 'GrayCo', "\\'").replace('arising out of this invoice', 'arising out of this invoice or the contract') + "', 8.5, R - L)   /* FEES-patch */", 'invoice-pdf.js')

open(ipath, 'w', encoding='utf-8').write(src)
open(lpath, 'w', encoding='utf-8').write(l2)
open(vpath, 'w', encoding='utf-8').write(inv)
print('patched', ipath, lpath, vpath)
