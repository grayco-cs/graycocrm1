#!/usr/bin/env python3
"""Idempotent patch OPCLAUSE: the "Cancellation / Overhead & Profit (Liquidated Damages)" clause on every insurance / claim document.

Owner: every insurance-claim document, roofing included, carries the same clause the insurance Work Authorization already has
(GrayCo gets the claim approved, the homeowner then uses another contractor -> 20% liquidated damages, due in 30 days, never
during the 3-business-day cancellation period). The wording is COPIED from the Work Authorization (printDoc 'work_auth') at run
time, so it cannot drift. Coordinator additions: the sentence "This fee applies whether or not the insurer's estimate includes a
separate overhead and profit line." everywhere; the ROOF documents base the fee on 20% of the total insurer-approved amount for
the roofing work (RCV incl. approved supplements) whether or not the estimate has an O&P line.

Documents changed (index.html unless noted):
  Job Type Template (proposal contract text): Insurance Restoration, Water Damage, Fire Damage  + NEW "Insurance Roof" =
    "Insurance Roof Agreement (Contingency)" (selectable in the same Job Type Template list; wo() maps roof+insurance job types to it)
  Work Authorization: printDoc work_auth (sentence added), automations DM.work_auth, _gcGenJobDoc work_auth, library T('work_auth'),
    AUTO13 WA_DEFAULT, claim paper PAPER_TEXT.workauth, on-site signing PAPERS 'wa' (insurance jobs only)
  Direction to Pay: library T('direction_to_pay'), AUTO13 DTP_DEFAULT, claim paper PAPER_TEXT.dtp (own acknowledged paragraph),
    portal.html "Direction to Pay" item (own paragraph + its own acknowledgement box; the DTP wording itself is untouched)
  Library: NEW T('roof_contingency') "Insurance Roof Agreement (Contingency)" (Insurance & Restoration; insurance + residential jobs)
  Admin-only note "O&P clause pending attorney review (sent 10/26)": Company Documents list + template editor (gcb_work_auth,
    gcb_direction_to_pay, gcb_roof_contingency) and under the Job Type Template select (admins only). Never printed.
Every find-string must occur exactly once. Usage: python3 tools/patch_OPCLAUSE.py [index.html] [portal.html]
"""
import sys, re
ipath = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
ppath = sys.argv[2] if len(sys.argv) > 2 else 'portal.html'
src = open(ipath, encoding='utf-8').read()
psrc = open(ppath, encoding='utf-8').read()
MARK = 'OPCLAUSE-patch'
if MARK in src and MARK in psrc:
    print('already patched'); sys.exit(0)
assert MARK not in src and MARK not in psrc, 'half patched'

def once(text, old, new, label):
    n = text.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    return text.replace(old, new)

# ---------------------------------------------------------------- the wording, copied from the Work Authorization
a = src.index("'• <b>Cancellation / Overhead &amp; Profit (Liquidated Damages).</b> ")
a_end = src.index("</b><br>',", a)
raw = src[a:a_end]
assert raw.count('Cancellation / Overhead &amp; Profit (Liquidated Damages)') == 1
body = raw.split('</b> ', 1)[1]                       # "GrayCo performs ... another contractor."
body = body.replace("\\'", "'").replace('\\u2014', '—')
assert body.startswith('GrayCo performs substantial work before construction begins') and body.endswith('to use another contractor.')
assert '(other than as permitted by the statutory cancellation rights described below)' in body
assert 'twenty percent (20%) of the total approved estimate' in body and 'thirty (30) days' in body
SENT_NR = " This fee applies whether or not the insurer's estimate includes a separate overhead and profit line."
NR = body + SENT_NR                                   # non-roof insurance documents (existing wording + one sentence)
OLD_BASE = ("of the total approved estimate, which the parties agree is a reasonable pre-estimate of GrayCo's overhead, profit, and the value of "
            "the work performed in preparing, documenting, and securing the approved claim.")
NEW_BASE = ("of the total insurer-approved amount for the roofing work (replacement cost value, including any supplements approved), whether or not "
            "the insurer's estimate includes overhead and profit. The parties agree this is a reasonable pre-estimate of the value of GrayCo's inspection, "
            "estimating, documentation, adjuster meetings and claim approval work and of the profit GrayCo would have earned.")
assert body.count(OLD_BASE) == 1
ROOF = body.replace(OLD_BASE, NEW_BASE).replace('inspecting the loss', 'inspecting the roof and the loss') + SENT_NR
TITLE = 'Cancellation / Overhead & Profit (Liquidated Damages)'
CANCEL_BODY = ("Owner may cancel within 3 business days of signing. After 3 days, Owner is responsible for work completed and materials ordered. "
               "If insurance claim is denied, this agreement is void and Owner owes only for emergency services performed.")
CANCEL_SENT = "The overhead & profit / liquidated-damages provision above applies only after these cancellation rights have expired."
CANCEL = 'CANCELLATION: ' + CANCEL_BODY + ' ' + CANCEL_SENT
ACK = 'I/we have read and acknowledge the paragraph above. Initials: __________'

def sq(t):  # body of a single-quoted JS string
    return t.replace('\\', '\\\\').replace("'", "\\'")
def esc_html(t):
    return t.replace('&', '&amp;')

# ---------------------------------------------------------------- 1. Job Type Template contract texts (index.html bundle)
KS_NR = 'CANCELLATION / OVERHEAD & PROFIT (LIQUIDATED DAMAGES): ' + NR
KS_ROOF = 'CANCELLATION / OVERHEAD & PROFIT (LIQUIDATED DAMAGES): ' + ROOF
for t in (KS_NR, KS_ROOF):
    assert '`' not in t and '${' not in t and '\\' not in t

# Insurance Restoration: 9 CANCELLATION / 10 ENTIRE  ->  9 clause / 10 CANCELLATION / 11 ENTIRE
src = once(src,
  "9. CANCELLATION: Owner may cancel within 3 business days of signing. After 3 days, Owner is responsible for work completed and materials ordered. If insurance claim is denied, this agreement is void and Owner owes only for emergency services performed.\n\n10. ENTIRE AGREEMENT: This document constitutes the complete agreement between the parties.`,checklist:[{text:\"Insurance adjuster",
  "9. " + KS_NR + "\n\n10. " + CANCEL + "\n\n11. ENTIRE AGREEMENT: This document constitutes the complete agreement between the parties.`,checklist:[{text:\"Insurance adjuster", 'ks-ins')
# Water Damage
src = once(src,
  "8. CANCELLATION: Owner may cancel within 3 business days. After emergency services begin, Owner is responsible for mitigation costs regardless of insurance outcome.\n\n9. ENTIRE AGREEMENT: This document constitutes the complete agreement.`}",
  "8. " + KS_NR + "\n\n9. CANCELLATION: Owner may cancel within 3 business days. After emergency services begin, Owner is responsible for mitigation costs regardless of insurance outcome. " + CANCEL_SENT + "\n\n10. ENTIRE AGREEMENT: This document constitutes the complete agreement.`}", 'ks-water')
# Fire Damage
src = once(src,
  "9. CANCELLATION: Owner may cancel within 3 business days of signing. After emergency services begin, Owner is responsible for emergency service costs.\n\n10. ENTIRE AGREEMENT: This document constitutes the complete agreement between the parties.`}}",
  "9. " + KS_NR + "\n\n10. CANCELLATION: Owner may cancel within 3 business days of signing. After emergency services begin, Owner is responsible for emergency service costs. " + CANCEL_SENT + "\n\n11. ENTIRE AGREEMENT: This document constitutes the complete agreement between the parties.`}}", 'ks-fire')

ROOF_CONTRACT = """INSURANCE ROOF AGREEMENT (CONTINGENCY)

This Agreement is entered into on the date signed below between GrayCo Construction Services, LLC ("Contractor") and the property owner(s) identified on Page 1 ("Owner") for roof replacement or repair at the Property Address listed on Page 1, contingent upon approval of Owner's insurance claim.

Insurance Claim #: _________________________ Policy #: _________________________
Insurance Company: _________________________ Adjuster: _________________________
Date of Loss: _________________________ Type of Loss: ☐ Wind  ☐ Hail  ☐ Other: __________

1. SCOPE OF WORK: Contractor shall replace or repair the roof at the Property Address in accordance with the scope approved by the insurance company (the "insurer-approved scope"), including any supplements the insurance company approves. Work outside the insurer-approved scope is not included unless authorized in a signed Change Order.

2. CONTRACT PRICE & OWNER PAYMENT: The contract price equals the amount approved by the insurance company for the roofing work, including approved supplements. Owner pays only (a) the insurance policy deductible of $_____________ and (b) the cost of any upgrades or additional work Owner chooses in writing. Owner owes nothing else for the insurer-approved scope.

3. PAYMENT: Insurance proceeds for the approved scope shall be endorsed and delivered to Contractor upon receipt. Owner shall pay the deductible at the start of the project. Recoverable depreciation shall be collected from the insurance company and paid to Contractor upon collection.

4. ADJUSTER MEETING & SUPPLEMENTS: Contractor will meet the insurance adjuster at the property and will document and submit supplements for additional damage, hidden decking or flashing damage, and code-required items. Supplemental work will not proceed until approved by the insurance company or authorized in writing by Owner.

5. CONTINGENCY & TIMELINE: This Agreement is contingent on the insurance company's approval of the claim. Work begins upon insurance approval, signed authorization, and deductible payment. Timeline estimates are subject to insurance approval, weather, and material availability.

6. WARRANTY: Five (5) year workmanship warranty on roofing work, from completion. Manufacturer warranties on materials are separate and are passed through from the manufacturer.

7. INSURANCE & LICENSING: Contractor is licensed, insured, and bondable. Certificates available upon request.

8. """ + KS_ROOF + """

9. """ + CANCEL + """

10. ENTIRE AGREEMENT: This document constitutes the complete agreement between the parties."""
assert '`' not in ROOF_CONTRACT and '${' not in ROOF_CONTRACT and '\\' not in ROOF_CONTRACT
ROOF_KS = ('"Insurance Roof":{label:"Insurance Roof Agreement (Contingency)",inclusions:["Roof replacement or repair per the insurer-approved scope",'
  '"Meeting with your insurance adjuster at the property","Supplements for missed or hidden damage and code items","Tear-off, underlayment, flashing, ventilation and cleanup per the approved scope",'
  '"All required permits & inspections","Photo documentation for your records and your insurance","5-year workmanship warranty on roofing (manufacturer warranties on materials are separate)"],'
  'exclusions:["Upgrades or extra work you choose (priced and signed separately)","Items not covered by your insurance policy","Interior damage repairs (quoted separately)","Pre-existing damage unrelated to the insurance claim"],'
  'commPromise:["We meet your adjuster and handle the paperwork and supplements","Photo updates in your GrayCo customer portal","Same-day response to all calls, texts, and emails","Immediate notice of any supplemental items found during the work"],'
  'schedNotes:["Work begins upon insurance approval, signed authorization and deductible payment.","Supplements for hidden damage may extend the timeline.","Weather and material availability may affect scheduling."],'
  'payNotes:["Insurance proceeds for the approved scope are endorsed to GrayCo.","You pay only your insurance deductible plus any upgrades you choose.","We file all supplements directly with your insurance company.","We work with all major insurance carriers."],'
  'contract:`' + ROOF_CONTRACT + '`},')
src = once(src, ',"Water Damage":{label:"Water Damage Restoration",inclusions:[',
           ',' + ROOF_KS.rstrip(',') + ',"Water Damage":{label:"Water Damage Restoration",inclusions:[', 'ks-roof-entry')
# wo(): roof + insurance job types -> the roof agreement
src = once(src, 'const te=g.toLowerCase();return te.includes("water")?"Water Damage"',
  'const te=g.toLowerCase();return te.includes("roof")&&(te.includes("insur")||te.includes("claim")||te.includes("storm")||te.includes("hail")||te.includes("contingen"))?"Insurance Roof":te.includes("water")?"Water Damage"', 'wo')
src = once(src, '_=g.jobType==="Insurance Restoration"||g.jobType==="Water Damage"||g.jobType==="Fire Damage"',
  '_=g.jobType==="Insurance Restoration"||g.jobType==="Insurance Roof"||g.jobType==="Water Damage"||g.jobType==="Fire Damage"', 'ins-flag')
# admin-only note under the Job Type Template select
NOTE = 'O&P clause pending attorney review (sent 10/26)'
src = once(src, 'children:E.label},w))})]})',
  'children:E.label},w))}),(window.__GC_AUTH__&&window.__GC_AUTH__.isAdmin&&window.__GC_AUTH__.isAdmin()&&["Insurance Restoration","Insurance Roof","Water Damage","Fire Damage"].indexOf(g.jobType)>=0)?e.jsx("div",{"data-gc-admin-note":"opclause",style:{fontSize:11,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"4px 8px",marginTop:4},children:"Admin note: ' + NOTE + '"}):null]})', 'ks-adminnote')

# ---------------------------------------------------------------- 2. Work Authorization versions
# 2a. printDoc work_auth: the existing clause + the one sentence (existing wording untouched)
src = once(src, "This amount is due within thirty (30) days of my/our election to use another contractor.</b><br>',",
           "This amount is due within thirty (30) days of my/our election to use another contractor." + sq(SENT_NR) + "</b><br>',", 'printdoc-wa')
# 2b. automations DM.work_auth (PDF)
src = once(src,
  "    P.txt('Project manager: ' + pm.name + (pm.phone ? ' · ' + pm.phone : ''));\n    P.sigs('Owner / date', 'GrayCo representative / date');\n  }).then(function(b){ return fileMade(job, 'work_auth',",
  "    P.txt('" + sq(TITLE.upper()) + "', 10.5, true); P.txt('" + sq(NR) + "');   /* OPCLAUSE-patch */\n"
  "    P.txt('YOUR RIGHT TO CANCEL', 10.5, true); P.txt('" + sq(CANCEL) + "');\n"
  "    P.txt('Project manager: ' + pm.name + (pm.phone ? ' · ' + pm.phone : ''));\n    P.sigs('Owner / date', 'GrayCo representative / date');\n  }).then(function(b){ return fileMade(job, 'work_auth',", 'dm-wa')
# 2c. _gcGenJobDoc work_auth (PDF, insurance / T&M)
src = once(src,
  "receive/endorse proceeds for the covered scope.');\n        sig();",
  "receive/endorse proceeds for the covered scope.');\n        h('" + sq(TITLE) + "'); p('" + sq(NR) + "');   /* OPCLAUSE-patch */\n        h('Your right to cancel'); p('" + sq(CANCEL) + "');\n        sig();", 'gen-wa')

# 2d. library T('work_auth') / T('direction_to_pay') (HTML)
CL_HTML = "p('<b>" + esc_html(TITLE) + ".</b> " + sq(NR) + "')"
CL_HTML_ROOF = "p('<b>" + esc_html(TITLE) + ".</b> " + sq(ROOF) + "')"
CN_HTML = "h('Your right to cancel') + p('" + sq(CANCEL) + "')"
src = once(src,
  "Payments received from my insurance company for this work will be paid to GrayCo.') + sigs('Property owner', GCO));",
  "Payments received from my insurance company for this work will be paid to GrayCo.') +\n  " + CL_HTML + " + " + CN_HTML + " + sigs('Property owner', GCO));   /* OPCLAUSE-patch */", 'T-wa')
src = once(src,
  "p('This direction stays in effect until the work is paid in full or I revoke it in writing.') + sigs('Insured / owner', GCO));",
  "p('This direction stays in effect until the work is paid in full or I revoke it in writing.') +\n  " + CL_HTML + " + p('" + sq(ACK) + "') + " + CN_HTML + " + sigs('Insured / owner', GCO));   /* OPCLAUSE-patch: its own acknowledged paragraph */", 'T-dtp')

# 2e. NEW library template: Insurance Roof Agreement (Contingency)
ROOF_T = (
"T('roof_contingency', 'Insurance Roof Agreement (Contingency)', 'Insurance & Restoration', ['insurance', 'residential'], true,\n"
"  title('Insurance Roof Agreement (Contingency)') + info([['Property owner', '{customer}']].concat(JOB).concat([['Insurance company', '____________'], ['Claim #', '____________'], ['Policy #', '____________'], ['Adjuster', '____________'], ['Date of loss', '____________']])) +\n"
"  h('1. Scope of work') + p('GrayCo will replace or repair the roof at the property above according to the scope approved by the insurance company (the \"insurer-approved scope\"), including any supplements the insurance company approves. Work outside the insurer-approved scope is not included unless added by a signed change order.') +\n"
"  h('2. What the homeowner pays') + p('The homeowner pays only the insurance deductible plus any upgrades or extra work the homeowner chooses in writing. Insurance payments for the approved scope are endorsed to GrayCo.') +\n"
"  h('3. Adjuster meeting and supplements') + p('GrayCo will meet the insurance adjuster at the property and will document and submit supplements for additional damage, hidden decking or flashing damage and code-required items. Supplemental work does not start until the insurance company approves it or the homeowner authorizes it in writing.') +\n"
"  h('4. Contingency') + p('This agreement is contingent on the insurance company\\u2019s approval of the claim. Work begins after insurance approval, this signed agreement and payment of the deductible.') +\n"
"  h('5. Warranty') + p('Five (5) year workmanship warranty on roofing work, from completion. Manufacturer warranties on materials pass through to the homeowner.') +\n"
"  " + CL_HTML_ROOF + " + " + CN_HTML + " + sigs('Property owner', GCO));   /* OPCLAUSE-patch */\n\n"
"T('satisfaction', 'Certificate of Satisfaction'")
src = once(src, "T('satisfaction', 'Certificate of Satisfaction'", ROOF_T, 'T-roof-new')
src = once(src, "gcb_direction_to_pay: 'Insurance', ", "gcb_direction_to_pay: 'Insurance', gcb_roof_contingency: 'Insurance', ", 'tplgroup')

# 2f. admin-only attorney-review note: Company Documents list + template editor (never printed)
src = once(src, "var ATTORNEY = 'Have your attorney review before first use.';",
  "var ATTORNEY = 'Have your attorney review before first use.';\nvar OPNOTE = '" + sq(NOTE) + "', OP_IDS = { gcb_work_auth: 1, 'gen:work_auth': 1, gcb_direction_to_pay: 1, gcb_roof_contingency: 1 };   /* OPCLAUSE-patch: admin-only */\n"
  "function opNoteRow(row, id){ if (!OP_IDS[id] || !row || row.querySelector('[data-gc-admin-note]')) return; var nt = D.createElement('span'); nt.setAttribute('data-gc-admin-note', 'opclause'); nt.textContent = OPNOTE; nt.style.cssText = 'font-size:10.5px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:2px 6px'; row.appendChild(nt); }", 'opnote-const')
src = once(src, "var m = /_dlTplData\\('([^']+)'\\)/.exec(b0.getAttribute('onclick') || ''); if (!m || !byId(m[1])) return;",
  "var m = /_dlTplData\\('([^']+)'\\)/.exec(b0.getAttribute('onclick') || ''); if (m && m[1] === 'gen:work_auth') { opNoteRow(b0.parentElement, m[1]); return; } if (!m || !byId(m[1])) return;", 'opnote-genrow')
src = once(src, "    e1.onclick = function(){ edit(m[1]); };\n    row.appendChild(e1);\n",
  "    e1.onclick = function(){ edit(m[1]); };\n    row.appendChild(e1);\n    opNoteRow(row, m[1]);\n", 'opnote-list')
src = once(src, "Admin note (never printed): ' + ATTORNEY + '</div>' +",
  "Admin note (never printed): ' + ATTORNEY + (OP_IDS[b.id] ? '<br><span data-gc-admin-note=\"opclause\">' + OPNOTE + '</span>' : '') + '</div>' +", 'opnote-edit')

# 2g. AUTO13 templates (the portal Work Authorization / Direction to Pay the office sends)
WA_ADD = "\\n\\n" + sq(TITLE.upper()) + "\\n" + sq(NR) + "\\n\\nYOUR RIGHT TO CANCEL\\n" + sq(CANCEL)
DTP_ADD = "\\n\\n" + sq(TITLE.upper()) + "\\n" + sq(NR) + "\\n" + sq(ACK) + "\\n\\nYOUR RIGHT TO CANCEL\\n" + sq(CANCEL)
src = once(src, "at the property above.\\n\\n[Terms reviewed by your attorney go here.]';",
           "at the property above." + WA_ADD + "\\n\\n[Terms reviewed by your attorney go here.]';", 'wa-default')
src = once(src, "as a payee on payments for this claim.\\n\\n[Terms reviewed by your attorney go here.]';",
           "as a payee on payments for this claim." + DTP_ADD + "\\n\\n[Terms reviewed by your attorney go here.]';", 'dtp-default')
# an admin-saved template without the clause still gets it (the clause is part of every insurance claim paper)
src = once(src, "function tpl(){ var t = cs().workAuthTpl || {}; return { wa: s(t.wa) || WA_DEFAULT, dtp: s(t.dtp) || DTP_DEFAULT, by: s(t.by), at: s(t.at) }; }",
  "function opEnsure(txt, add){ return /liquidated damages and not as a penalty/i.test(txt) ? txt : txt + add; }   /* OPCLAUSE-patch */\n"
  "function tpl(){ var t = cs().workAuthTpl || {}; return { wa: opEnsure(s(t.wa) || WA_DEFAULT, '" + WA_ADD + "'), dtp: opEnsure(s(t.dtp) || DTP_DEFAULT, '" + DTP_ADD + "'), by: s(t.by), at: s(t.at) }; }", 'tpl-fn')

# 2h. claim papers (paperBlocks): the Work Authorization and Direction to Pay
src = once(src, "{ p: PAPER_TEXT[k] || '', size: 11 }, { gap: 24 },",
  "{ p: PAPER_TEXT[k] || '', size: 11 }].concat(opBlocks(k)).concat([{ gap: 24 },", 'paper-blocks-a')
src = once(src, "{ p: 'GrayCo representative: ______________________________   Date: ____________', size: 11 }\n  ] };",
  "{ p: 'GrayCo representative: ______________________________   Date: ____________', size: 11 }\n  ]) };", 'paper-blocks-b')
src = once(src, "function paperBlocks(c, k){",
  "/* OPCLAUSE-patch: the Work Authorization and the Direction to Pay carry the O&P clause (its own paragraph) and the 3-business-day cancellation notice */\n"
  "function opBlocks(k){\n  if (k !== 'workauth' && k !== 'dtp') return [];\n"
  "  var b = [{ gap: 8 }, { p: '" + sq(TITLE) + ". " + sq(NR) + "', size: 11 }];\n"
  "  if (k === 'dtp') b.push({ gap: 6 }, { p: '" + sq(ACK) + "', size: 11 });\n"
  "  b.push({ gap: 8 }, { p: '" + sq(CANCEL) + "', size: 11 });\n  return b;\n}\nfunction paperBlocks(c, k){", 'paper-blocks-fn')

# 2i. on-site signing on the phone: insurance jobs only (a residential work authorization never gets it)
src = once(src,
  "text: function(p){ return 'I authorize GrayCo Construction Services (TN license #85034) to perform the work at ' + s(p.address) + '. I understand the work, its scope and price are confirmed in writing before work beyond emergency services begins.'; } },",
  "text: function(p){ var ins = false; try { ins = typeof window._jobTypeKey === 'function' && window._jobTypeKey(p.type) === 'insurance'; } catch (e) {}   /* OPCLAUSE-patch */\n"
  "    return 'I authorize GrayCo Construction Services (TN license #85034) to perform the work at ' + s(p.address) + '. I understand the work, its scope and price are confirmed in writing before work beyond emergency services begins.'\n"
  "      + (ins ? '\\n\\n" + sq(TITLE) + ". " + sq(NR) + "\\n\\n" + sq(CANCEL) + "' : ''); } },", 'onsite-wa')

# ---------------------------------------------------------------- 3. portal.html: Direction to Pay = its own acknowledged paragraph
P_NOTE = "The customer's Direction to Pay"
psrc = once(psrc,
  "  if (x.doc) box.appendChild(h('a', { class: 'btn', href: x.doc, target: '_blank', rel: 'noopener', text: '📄 Read the ' + x.label.toLowerCase() }));\n",
  "  if (x.doc) box.appendChild(h('a', { class: 'btn', href: x.doc, target: '_blank', rel: 'noopener', text: '📄 Read the ' + x.label.toLowerCase() }));\n"
  "  /* OPCLAUSE-patch: the Direction to Pay carries the O&P clause as its own paragraph with its own acknowledgement; the direction itself is unchanged */\n"
  "  var isDtp = /direction to pay/i.test(String(x.title || '')), opAck = null;\n"
  "  if (isDtp) {\n"
  "    box.appendChild(h('div', { class: 'es-op', 'data-gc-op': '1' }, [h('b', { text: '" + sq(TITLE) + ". " + "' }), h('span', { text: ' ' + '" + sq(NR) + "' })]));\n"
  "    box.appendChild(h('div', { class: 'muted es-cancel', text: '" + sq(CANCEL) + "' }));\n"
  "  }\n", 'portal-dtp-para')
psrc = once(psrc,
  "  var ag = kept(h('input', { type: 'checkbox' }), 'a_' + x.id, true);\n",
  "  var ag = kept(h('input', { type: 'checkbox' }), 'a_' + x.id, true);\n"
  "  if (isDtp) opAck = kept(h('input', { type: 'checkbox', 'data-gc-op-ack': '1' }), 'o_' + x.id, true);\n", 'portal-dtp-ackvar')
psrc = once(psrc,
  "  box.appendChild(h('label', { class: 'sel-agree' }, [ag, h('span', { text: x.kind === 'change_order'",
  "  if (opAck) box.appendChild(h('label', { class: 'sel-agree' }, [opAck, h('span', { text: ' I have read and acknowledge the Cancellation / Overhead & Profit (Liquidated Damages) paragraph above.' })]));\n"
  "  box.appendChild(h('label', { class: 'sel-agree' }, [ag, h('span', { text: x.kind === 'change_order'", 'portal-dtp-ackbox')
psrc = once(psrc,
  "if (!ag.checked) { msg.textContent = 'Please tick the box to agree.'; return; }",
  "if (!ag.checked) { msg.textContent = 'Please tick the box to agree.'; return; } if (opAck && !opAck.checked) { msg.textContent = 'Please tick the box to acknowledge the Cancellation / Overhead & Profit paragraph.'; return; }", 'portal-dtp-gate')
psrc = once(psrc, ".es-item{display:flex;", ".es-op{font-size:13px;line-height:1.45;border:1px solid var(--rule);border-radius:8px;padding:8px 10px;background:#fffdf5}\n.es-item{display:flex;", 'portal-css')
psrc = psrc.replace('/* patch AUTO5: ✍️ Papers to sign', '/* ' + MARK + ' */\n/* patch AUTO5: ✍️ Papers to sign', 1)
assert MARK in psrc
src = src.replace("var ATTORNEY = 'Have your attorney review before first use.';", "var ATTORNEY = 'Have your attorney review before first use.';   /* " + MARK + " */", 1)
assert MARK in src

open(ipath, 'w', encoding='utf-8').write(src)
open(ppath, 'w', encoding='utf-8').write(psrc)
print('patched OPCLAUSE:', ipath, ppath)
