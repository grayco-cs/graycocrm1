#!/usr/bin/env python3
"""Idempotent patch CONSIST: consistency fixes found by the contract-text audit.

1. 20% overhead & profit clause on the proposal-contract (Ks) insurance templates. The clause was already in the Ks source text, but
   GCLegal.contract() (legal2.js) threw it away: its "replaced by the state clause" filter matches every paragraph that starts with
   CANCELLATION, and the O&P heading starts "CANCELLATION / OVERHEAD & PROFIT". Now:
     - legal2.js (and its two copies + tools/legal2/runtime.py) keeps the O&P paragraph and prints it AFTER the state right-to-cancel
       clause as its own numbered paragraph (91.), with "described below" turned into "described above";
     - each Ks insurance template (Insurance Restoration, Insurance Roof, Water Damage, Fire Damage) says the clause applies only after
       the cancellation period described in the Notice of Right to Cancel has expired (roof keeps the roof wording, the others the
       non-roof wording; the statutory-cancellation carve-out is untouched).
2. Library Payment Terms (and Construction Agreement): "due on receipt" -> due within 30 days of each invoice (Net 30), as the contracts say.
3. Field Subcontractor Agreement (and the Forms & Docs sub agreement): pay-when-paid default -> the CRM sub pay rule (Master Subcontract 4.3-4.5).
4. Work Authorization / insurance cancel paragraph: "claim denied -> agreement is void" -> owner may cancel per the notice and owes only
   emergency services authorized in writing, if any (LEGAL2 insurer-denial wording). 11 copies.
5. Invitation to Bid liquidated-damages wording (2 copies) -> passed through as provided in the Master Subcontract.
6. Entity name: CRM legal name (GC_BRAND.legalName) is "GrayCo Construction Services, LLC"; party / legal-entity lines use it. Headers,
   footers and branding are NOT touched.
Usage: python3 tools/patch_CONSIST.py   (run from the repo root)
"""
import re, sys
MARK = 'CONSIST-patch'
FILES_L2 = ['legal2.js', 'subportal/legal2.js', 'subportal-app/public/legal2.js', 'tools/legal2/runtime.py']

def rd(p): return open(p, encoding='utf-8').read()
def wr(p, t): open(p, 'w', encoding='utf-8').write(t)
def once(t, old, new, label, n=1):
    c = t.count(old)
    assert c == n, ('anchor count', label, c, 'expected', n)
    return t.replace(old, new)

src = rd('index.html')
if MARK in src:
    print('already patched'); sys.exit(0)

# ------------------------------------------------------------------ 1a. legal2.js: keep the O&P paragraph, print it after the state clause
OLD_L2A = "    if (/^(CANCELLATION|NOTICE OF RIGHT TO CANCEL|RIGHT TO CANCEL)\\b/.test(b)) return;"
NEW_L2A = ("    if (/^CANCELLATION \\/ OVERHEAD/.test(b)) { op.push(b); return; }   /* " + MARK + ": keep the 20% overhead & profit clause */\n"
           "    if (/^(CANCELLATION|NOTICE OF RIGHT TO CANCEL|RIGHT TO CANCEL)\\b/.test(b)) return;")
OLD_L2B = "  var out = [];\n  para(ct).forEach(function(p){"
NEW_L2B = "  var out = [], op = [];\n  para(ct).forEach(function(p){"
OLD_L2C = "  out.push('90. ' + clause(st, kind));\n  return out.join('\\n\\n');"
NEW_L2C = ("  out.push('90. ' + clause(st, kind));\n"
           "  op.forEach(function(b, i){ out.push((91 + i) + '. ' + b.replace('described below', 'described above')); });   /* " + MARK + ": after the cancellation clause */\n"
           "  return out.join('\\n\\n');")
for f in FILES_L2:
    t = rd(f)
    if MARK in t: continue
    t = once(t, OLD_L2A, NEW_L2A, f + ' filter')
    t = once(t, OLD_L2B, NEW_L2B, f + ' out')
    t = once(t, OLD_L2C, NEW_L2C, f + ' push')
    wr(f, t)

# ------------------------------------------------------------------ 1b. Ks insurance templates: "applies only after the cancellation period"
ONLY_AFTER = (" This provision applies only after the cancellation period described in the Notice of Right to Cancel (including any cancellation "
              "right after an insurer denial) has expired.")
SENT = "This fee applies whether or not the insurer's estimate includes a separate overhead and profit line."
HEAD = "CANCELLATION / OVERHEAD & PROFIT (LIQUIDATED DAMAGES): "
KS = [('label:"Insurance Restoration"', 'Insurance Restoration', False), ('label:"Insurance Roof Agreement (Contingency)"', 'Insurance Roof', True),
      ('label:"Water Damage Restoration"', 'Water Damage', False), ('label:"Fire Damage Restoration"', 'Fire Damage', False)]
for lab, name, roof in KS:
    a = src.index(lab); assert src.count(lab) == 1, lab
    c0 = src.index('contract:`', a); c1 = src.index('`', c0 + 11)
    body = src[c0:c1]
    assert body.count(HEAD) == 1 and body.count(SENT) == 1, name
    assert ('insurer-approved amount for the roofing work' in body) == roof, name          # roof wording only on the roof template
    assert ('total approved estimate' in body) == (not roof), name                           # non-roof wording elsewhere
    assert body.count('NOTICE OF RIGHT TO CANCEL') == 1 and 'third business day' in body, name   # the 3-business-day notice (LEGAL2)
    body = body.replace(SENT, SENT + ONLY_AFTER)
    src = src[:c0] + body + src[c1:]

# ------------------------------------------------------------------ 2. Payment Terms: net 30 like the contracts ("Payment is due within 30 days of each invoice")
src = once(src, "Invoices are due on receipt unless the proposal says otherwise.",
           "Payment is due within 30 days of each invoice (Net 30) unless the proposal says otherwise.", 'pay-contract')
src = once(src, "Payment schedule: as listed in your proposal. Invoices are due on receipt unless your proposal says otherwise.",
           "Payment schedule: as listed in your proposal. Payment is due within 30 days of each invoice (Net 30) unless your proposal says otherwise.", 'pay-terms')

# ------------------------------------------------------------------ 3. Sub pay terms: the CRM rule (Master Subcontract 4.3 - 4.5)
SUBRULE = ("Payment follows Section 4 of the GrayCo Master Subcontract Agreement. An invoice GrayCo receives by Wednesday (11:59 p.m. Central) is paid "
           "the Friday of the following week; an invoice received Thursday through Sunday is paid the Friday after that. GrayCo may mark an invoice "
           "Pay ASAP (placed on the next Friday pay list; GrayCo's normal approval still applies). Payment is not conditioned on the owner paying GrayCo, "
           "except retainage, which is paid within 15 days after GrayCo actually receives it from the owner or general contractor.")
JSQ = "'" + SUBRULE.replace("'", "\\'") + "'"
src = once(src, "||'Payment due after satisfactory completion and receipt of payment from the property owner.';",
           "||" + JSQ + ";   /* " + MARK + " */", 'sub-default')
src = once(src, 'placeholder="e.g. Net 15 after completion & GrayCo payment"',
           'placeholder="Leave blank for the standard GrayCo sub pay schedule (in by Wednesday: paid the Friday of the following week)"', 'sub-placeholder')
OLD_FD = ('<b>1. Payment:</b> GrayCo shall pay Sub within <b>30 days</b> of invoice receipt and approval, regardless of whether GrayCo has received '
          'payment from the Owner for such work ("Net 30"). <b>Exception — Retainage:</b> Any retainage held by the Owner on this project shall be '
          'paid to Sub within 15 days of GrayCo\\\'s actual receipt of retainage from Owner ("pay-when-paid" applies to retainage only). Retainage held:')
NEW_FD = ('<b>1. Payment:</b> Payment follows Section 4 of the GrayCo Master Subcontract Agreement. An invoice GrayCo receives by <b>Wednesday (11:59 p.m. Central)</b> '
          'is paid the <b>Friday of the following week</b>; an invoice received Thursday through Sunday is paid the Friday after that. GrayCo may mark an invoice '
          '<b>Pay ASAP</b> (next Friday pay list; normal approval still applies). Payment is not conditioned on the owner paying GrayCo. '
          '<b>Exception — Retainage:</b> retainage held by the Owner on this project is paid to Sub within 15 days of GrayCo\\\'s actual receipt of that retainage from the Owner. Retainage held:')
src = once(src, OLD_FD, NEW_FD, 'fd-sub-pay')

# ------------------------------------------------------------------ 4. Work Authorization / insurance cancel paragraph: denial = cancel right, not "void"
OLD_VOID = "If insurance claim is denied, this agreement is void and Owner owes only for emergency services performed."
NEW_VOID = ("If the insurance claim is denied, Owner may cancel as stated in the Notice of Right to Cancel, and Owner owes GrayCo only for emergency "
            "services Owner authorized in writing, if any, that were already performed.")
src = once(src, OLD_VOID, NEW_VOID, 'wa-denial', 11)

# ------------------------------------------------------------------ 5. Invitation to Bid: liquidated damages
LD = "Liquidated damages, if stated in the bid documents or Work Order, will be passed through as provided in the Master Subcontract."
src = once(src, r"Time is of the essence \u2014 liquidated damages apply", r"Time is of the essence \u2014 " + LD, 'itb-ld-1')
src = once(src, "\\u2022 Liquidated Damages: Per subcontract agreement", "\\u2022 " + LD, 'itb-ld-2')

# ------------------------------------------------------------------ 6. entity name: party / legal-entity lines use the CRM legal name (GC_BRAND.legalName)
LLC = 'GrayCo Construction Services, LLC'
E = [  # (old, new, count)
 ('<div class="fname">GrayCo Construction Services LLC</div>', '<div class="fname">' + LLC + '</div>', 1),
 ('Make checks payable to GrayCo Construction Services LLC,', 'Make checks payable to ' + LLC + ',', 1),
 ("'<b>GrayCo Construction Services LLC</b><br>',", "'<b>" + LLC + "</b><br>',", 1),
 ('Pay by check (GrayCo Construction Services LLC)', 'Pay by check (' + LLC + ')', 1),
 ('Pay by check to GrayCo Construction Services LLC or call', 'Pay by check to ' + LLC + ' or call', 1),
 ("row2('Contractor','GrayCo Construction Services LLC'", "row2('Contractor','" + LLC + "'", 1),
 ('Arkansas law, GrayCo Construction Services LLC and any', 'Arkansas law, ' + LLC + ' and any', 1),
 ('This form authorizes GrayCo Construction Services LLC to', 'This form authorizes ' + LLC + ' to', 1),
 ('I/we authorize GrayCo Construction Services LLC ("GrayCo")', 'I/we authorize ' + LLC + ' ("GrayCo")', 1),
 ("row2('Company','GrayCo Construction Services LLC'", "row2('Company','" + LLC + "'", 1),
 ('<b>GrayCo Construction Services LLC hereby provides notice', '<b>' + LLC + ' hereby provides notice', 1),
 ("sigRow('GrayCo Construction Services LLC — Authorized Rep','Owner", "sigRow('" + LLC + " — Authorized Rep','Owner", 1),
 ("row2('General Contractor','GrayCo Construction Services LLC'", "row2('General Contractor','" + LLC + "'", 1),
 ("'GrayCo Construction Services LLC — Authorized Rep, Date')", "'" + LLC + " — Authorized Rep, Date')", 2),
 ("'GrayCo Construction Services LLC — PM / Rep, Date'", "'" + LLC + " — PM / Rep, Date'", 1),
 ("'From','GrayCo Construction Services LLC'", "'From','" + LLC + "'", 1),
 ("'GrayCo Construction Services LLC hereby requests release", "'" + LLC + " hereby requests release", 1),
 ("Payable to <b>GrayCo Construction Services LLC</b>", "Payable to <b>" + LLC + "</b>", 1),
 ("sigRow('GrayCo Construction Services LLC — Authorized Rep, Date','Owner", "sigRow('" + LLC + " — Authorized Rep, Date','Owner", 1),
 ("Payable to:<br><b>GrayCo Construction Services LLC</b>", "Payable to:<br><b>" + LLC + "</b>", 1),
 # plain "GrayCo Construction Services" in party / signature lines
 ("sigRow('Property Owner','GrayCo Construction Services — Representative')", "sigRow('Property Owner','" + LLC + " — Representative')", 1),
 ("sigRow('Property Owner / Authorized Signer','GrayCo Construction Services — Representative')", "sigRow('Property Owner / Authorized Signer','" + LLC + " — Representative')", 1),
 ("to the warranty provided by GrayCo Construction Services.", "to the warranty provided by " + LLC + ".", 1),
 ("doc.text('Contractor: GrayCo Construction Services (\"GrayCo\")'", "doc.text('Contractor: " + LLC + " (\"GrayCo\")'", 1),
 ("workauth: 'I authorize GrayCo Construction Services to perform", "workauth: 'I authorize " + LLC + " to perform", 1),
 ("has been completed by GrayCo Construction Services to my satisfaction", "has been completed by " + LLC + " to my satisfaction", 1),
 ("['Contractor:', 'GrayCo Construction Services']", "['Contractor:', '" + LLC + "']", 1),
 ("doc.text('GrayCo Construction Services — authorized signature / date'", "doc.text('" + LLC + " — authorized signature / date'", 1),
 ("return 'I authorize GrayCo Construction Services (TN license #85034)", "return 'I authorize " + LLC + " (TN license #85034)", 1),
]
for old, new, n in E:
    if src.count(old) == 0: continue    # already handled by patch LOGO2
    src = once(src, old, new, 'entity ' + old[:50], n)

assert MARK in src
wr('index.html', src)
print('CONSIST patched')
