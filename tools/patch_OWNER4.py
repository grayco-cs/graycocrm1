#!/usr/bin/env python3
"""Idempotent patch OWNER4 (owner 10/26, four decisions). Every find-string count is asserted. Usage: python3 tools/patch_OWNER4.py  (repo root)

1. (index.html) Lead settings gets "Mitigation emergencies also go to:" next to the alert setting (tools/mitto_tail.js). The routing itself is
   netlify/functions/_lib/emergency.js + bid-alerts.js (not touched here).
2. Sub documents: every pay-when-paid / owner-payment / "Net 30" wording is gone; retainage is released within 15 days after the work is complete
   and accepted + final unconditional waiver + closeout documents; the weekly pay rule stays (portal-app.js payRule too).
3. Insurance denial: the 11 "If the insurance claim is denied ..." paragraphs, the state clause (legal2.js x3, cancel.py), the 4 Ks templates,
   the portal Work Authorization / Direction to Pay (visible paragraph + its own checkbox), the Emergency Services Waiver, the mitigation
   agreements and the water / fire templates now say the customer pays for emergency / mitigation services regardless of the claim outcome.
4. Backcharges and Default clause in the Master Subcontract (9.4), Work Order, library Subcontract Agreement, Forms & Docs sub agreement,
   field Subcontractor Agreement, scope e-mail and the ITB (index.html x3, bid.html).
Admin-only "pending attorney review" flags (never printed): a second note on the library rows (same pattern as OPCLAUSE / FEES).
"""
import re, sys, os
MARK = 'OWNER4-patch'
HERE = os.path.dirname(os.path.abspath(__file__))
def rd(p): return open(p, encoding='utf-8').read()
def wr(p, t): open(p, 'w', encoding='utf-8').write(t)
def once(t, old, new, label, n=1):
    c = t.count(old)
    assert c == n, ('anchor count', label, c, 'expected', n)
    return t.replace(old, new)

src = rd('index.html')
if '__GC_PATCH_MITTO__' in src:
    print('already patched'); sys.exit(0)

RET = "Retainage is released within 15 days after Subcontractor's work is complete and accepted by GrayCo and Subcontractor delivers its final unconditional lien waiver and any required warranty/closeout documents."
WEEK = "invoices received by Wednesday are paid the Friday of the following week; later invoices are paid the Friday after that; GrayCo may mark an invoice Pay ASAP."
BC_HEAD = "Backcharges and Default."
BC = ("If Subcontractor's work is defective, untimely or unfinished, GrayCo will give notice and Subcontractor must cure within 48 hours (24 hours for emergencies or safety). "
      "If Subcontractor does not cure, GrayCo may correct or complete the work itself or through others and backcharge Subcontractor the actual cost plus a 15% administrative fee. "
      "Subcontractor also pays delay damages and any liquidated damages GrayCo owes the owner because of Subcontractor's delay (passed through), the cost to repair damage Subcontractor causes to the property or to the work of others, and cleanup Subcontractor fails to do. "
      "GrayCo may deduct backcharges from any amount owed to Subcontractor under this or any other work order, and Subcontractor remains liable for any excess.")
BC_ITB = ("Backcharges and Default: defective, untimely or unfinished work is backcharged after a 48-hour cure notice (24 hours for emergencies or safety) at actual cost plus a 15% administrative fee; "
          "delay damages and owner liquidated damages caused by the sub are passed through; deductions may be taken from any amount owed. See Backcharges and Default in the Master Subcontract (Section 9.4).")
def sq(x): return x.replace("'", "\\'")          # for a single-quoted JS string

# ================================================================= 2 + 4. sub documents
# ---- Master Subcontract (JSON in the library, double-quoted)
OLD45 = ('<b>4.5 Payment is not conditioned on the owner paying GrayCo,</b> except retainage: if retainage is held under a Work Order, GrayCo pays Subcontractor\'s retainage within 15 days after GrayCo actually receives the corresponding retainage from the owner or general contractor (or earlier if the Work Order says so).')
NEW45 = '<b>4.5 Retainage release.</b> ' + RET + ' (Earlier if the Work Order says so.)'
src = once(src, OLD45, NEW45, 'msa-4.5')
src = once(src, 'Retainage is released as the Work Order and Section 4.5 provide.', 'Retainage is released as Section 4.5 and the Work Order provide.', 'msa-4.6')
src = once(src, "back-charges for cleanup, damage, insurance or other costs Subcontractor owes;", "backcharges under Section 9.4 and other costs Subcontractor owes (cleanup, damage, insurance);", 'msa-4.7')
src = once(src, 'including earlier \\"Net 30\\" and \\"pay-when-paid\\" forms and the Invitation to Bid summary', 'including earlier subcontract payment forms and the Invitation to Bid summary', 'msa-16.1')
OLD92 = ("<b>9.2</b> Liquidated damages apply only if the Work Order states an amount per day (a reasonable estimate of GrayCo's delay damages that the parties agree is not a penalty). Otherwise GrayCo may recover its actual delay damages.")
NEW92 = ("<b>9.2</b> Liquidated damages apply if the Work Order states an amount per day (a reasonable estimate of GrayCo's delay damages that the parties agree is not a penalty). Otherwise GrayCo may recover its actual delay damages. Either way, Section 9.4 applies.")
src = once(src, OLD92, NEW92, 'msa-9.2')
OLD93 = '["p","<b>9.3 Changes.</b>'
MSA94 = ('["p","<b>9.4 Backcharges and Default.</b> (a) <b>Notice and cure.</b> If Subcontractor\'s work is defective, untimely or unfinished, if Subcontractor damages property or the work of others, or if Subcontractor leaves its work area unclean, GrayCo will give Subcontractor notice (a written notice, e-mail, text or Sub Portal message is enough), and Subcontractor must cure within <b>48 hours</b> after the notice (<b>24 hours</b> for an emergency or a safety problem)."],'
         '["p","(b) <b>GrayCo may cure.</b> If Subcontractor does not cure in time, GrayCo may correct or complete the work itself or through others, and may backcharge Subcontractor the <b>actual cost plus a 15% administrative fee</b>."],'
         '["p","(c) <b>Delay damages.</b> Subcontractor pays the delay damages, and any liquidated damages GrayCo owes the owner, that result from Subcontractor\'s delay. They are passed through to Subcontractor at the amount GrayCo owes."],'
         '["p","(d) <b>Damage and cleanup.</b> Subcontractor pays to repair damage it causes to the property or to the work of others, and the cost of any cleanup it fails to do."],'
         '["p","(e) <b>Deduction.</b> GrayCo may deduct backcharges from any amount owed to Subcontractor under this or any other Work Order. Subcontractor remains liable for any amount in excess of what GrayCo deducts."],')
src = once(src, OLD93, MSA94 + OLD93, 'msa-9.3-anchor')
# Exhibit B (retainage + backcharge pointer)
OLDEXB = '"Current certificate of insurance (with additional-insured and waiver-of-subrogation endorsements) and W-9 must be on file before the first payment."'
assert src.count(OLDEXB) == 1, 'exhibit B'
src = src.replace(OLDEXB, '"Retainage (if any): ' + RET.replace("\\", "") + '","Backcharges (Section 9.4): 48-hour cure notice (24 hours for emergencies or safety); actual cost plus a 15% administrative fee; deductible from any amount owed under any Work Order.",' + OLDEXB)

# ---- Work Order
OLDWO = "A conditional lien waiver goes with each invoice and an unconditional waiver after payment. Send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO).\"],[\"p\",\"Special terms:"
NEWWO = ("A conditional lien waiver goes with each invoice and an unconditional waiver after payment. " + RET + " Send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO).\"],"
         "[\"p\",\"<b>" + BC_HEAD + "</b> " + BC + " (Master Subcontract Agreement, Section 9.4.)\"],[\"p\",\"Special terms:")
src = once(src, OLDWO, NEWWO, 'wo')

# ---- library "Subcontract Agreement" (commercial)
OLDLIB = "h('Payment') + p('Monthly pay applications, less retainage per the prime contract, paid within the time GrayCo is paid for the work, with lien waivers for each payment.') +"
NEWLIB = ("h('Payment') + p('Payment follows the GrayCo weekly pay schedule (Master Subcontract Agreement, Section 4): " + sq(WEEK) + " Lien waivers go with each payment. " + sq(RET) + "') +\n"
          "  h('Backcharges and Default') + p('" + sq(BC) + "') +")
src = once(src, OLDLIB, NEWLIB, 'lib-subcontract')

# ---- Forms & Docs sub agreement
OLDFD = ("Payment is not conditioned on the owner paying GrayCo. <b>Exception — Retainage:</b> retainage held by the Owner on this project is paid to Sub within 15 days of GrayCo\\'s actual receipt of that retainage from the Owner. Retainage held:")
NEWFD = ("<b>Retainage:</b> " + sq(RET) + " Retainage held:")
src = once(src, OLDFD, NEWFD, 'fd-sub-pay')
OLDFD8 = "'<b>8. Attorney\\'s Fees:</b> In any dispute arising from this agreement,"
NEWFD8 = ("'<b>8. " + BC_HEAD + "</b> " + sq(BC) + "<br>',\n          '<b>9. Attorney\\'s Fees:</b> In any dispute arising from this agreement,")
src = once(src, OLDFD8, NEWFD8, 'fd-sub-bc')

# ---- field Subcontractor Agreement (jsPDF)
OLDFA = ("Payment is not conditioned on the owner paying GrayCo, except retainage, which is paid within 15 days after GrayCo actually receives it from the owner or general contractor.';   /* CONSIST-patch */")
NEWFA = ("' + '" + sq(RET) + "';   /* CONSIST-patch / " + MARK + " */")
src = once(src, OLDFA, NEWFA, 'field-terms')
OLDBASIC = "'This price is full and complete for the Scope above; extra work requires written approval from GrayCo.'];"
NEWBASIC = "'This price is full and complete for the Scope above; extra work requires written approval from GrayCo.','" + sq(BC_HEAD + " " + BC) + "'];   /* " + MARK + " */"
src = once(src, OLDBASIC, NEWBASIC, 'field-basic')

# ---- scope e-mail (PRICING & PAYMENT)
src = once(src, "' (paid when GrayCo receives retainage from Owner)' : 'Retainage:            None',", "' (released within 15 days after your work is complete and accepted by GrayCo and you deliver your final unconditional lien waiver and any required warranty/closeout documents)' : 'Retainage:            None',", 'scope-ret')
src = once(src, "'Payment Terms:        Net 30 days from invoice receipt and approval',", "'Payment Terms:        Weekly: invoices received by Wednesday are paid the Friday of the following week; later invoices the Friday after that (Pay ASAP when GrayCo marks it)',", 'scope-pay')
src = once(src, "      '• By beginning work, you agree to these terms in full.',", "      '• " + sq(BC_HEAD + " " + BC) + "',\n      '• By beginning work, you agree to these terms in full.',", 'scope-bc')

# ---- sub onboarding + scope sheets: Net 30 -> weekly
src = once(src, "payment terms (Net 30 from invoice receipt). Send all invoices", "payment terms (weekly pay: invoices received by Wednesday are paid the Friday of the following week; later invoices the Friday after that). Send all invoices", 'onboard-net30')
src = once(src, "<td>Payment terms: Net 30 from GrayCo receipt of invoice. Send all invoices", "<td>Payment terms: weekly pay (invoices received by Wednesday are paid the Friday of the following week; later invoices the Friday after that). Send all invoices", 'scope2-net30')
src = once(src, "'<li>Payment terms: Net 30 from invoice receipt</li><li>Send all invoices", "'<li>Payment terms: weekly pay (invoices received by Wednesday are paid the Friday of the following week; later invoices the Friday after that)</li><li>Send all invoices", 'scope3-net30')

# ---- ITB (index.html x3 places)
src = once(src, "• Sub invoices due by the 25th of each month — payment Net 30", "• Sub invoices: in by Wednesday, paid the Friday of the following week; later invoices the Friday after that\n• Retainage: " + RET + "\n• " + BC_ITB, 'itb-react')
src = once(src, "\\u2022 Payment Terms: Net 30 from approved invoice\\n\\u2022 Retainage: 10% held until substantial completion\\n",
           "\\u2022 Payment Terms: Weekly \\u2014 invoices received by Wednesday are paid the Friday of the following week; later invoices the Friday after that\\n\\u2022 Retainage: 10% held. " + RET + "\\n", 'itb-bm-pay')
LDLINE = "Liquidated damages, if stated in the bid documents or Work Order, will be passed through as provided in the Master Subcontract."
src = once(src, "\\u2022 " + LDLINE + "\\n", "\\u2022 " + BC_ITB + "\\n", 'itb-bm-ld')
src = once(src, "\\u2022 Payment Terms: Net 30 from date of approved invoice\n\\u2022 Retainage: 10% held until substantial completion of your scope\n",
           "\\u2022 Payment Terms: Weekly \\u2014 invoices received by Wednesday are paid the Friday of the following week; later invoices the Friday after that\n\\u2022 Retainage: 10% held. " + RET + "\n", 'itb-bp-pay')
src = once(src, "\\u2022 Schedule: Time is of the essence \\u2014 " + LDLINE + "\n", "\\u2022 Schedule: Time is of the essence\n\\u2022 " + BC_ITB + "\n", 'itb-bp-ld')

# ================================================================= 3. insurance denial = customer pays emergency work
DEN_OLD = "If the insurance claim is denied, Owner may cancel as stated in the Notice of Right to Cancel, and Owner owes GrayCo only for emergency services Owner authorized in writing, if any, that were already performed."
DEN = ("Owner is responsible for payment for all emergency and mitigation services GrayCo performed (for example water extraction, drying, board-up, tarping) regardless of insurance coverage or the outcome of the claim. "
       "If the claim is denied, Owner may cancel the remaining repair work as stated in the Notice of Right to Cancel, and Owner remains responsible for the emergency/mitigation services already performed, at the rates in this agreement or, if none, GrayCo's standard rates.")
# the 11 copies: each takes the apostrophe style of its own string (the O&P clause just before it carries GrayCo\'s / GrayCo's)
out, pos, n = [], 0, 0
for m in re.finditer(re.escape(DEN_OLD), src):
    back = src[max(0, m.start() - 4000):m.start()]
    ap = re.findall(r"[A-Za-z](\\*)'s\b", back)
    assert ap, ('no apostrophe style before copy', src.count('\n', 0, m.start()) + 1)
    esc = ap[-1] + "'"
    out.append(src[pos:m.start()]); out.append(DEN.replace("'", esc)); pos = m.end(); n += 1
out.append(src[pos:]); src = ''.join(out)
assert n == 11, ('denial copies', n)

# the state clause sentence (4 Ks templates in index.html; legal2.js x3 and cancel.py are patched below)
CL_OLD = "Owner owes GrayCo only for emergency services Owner asked for in writing and that were already performed, and for any work Owner approved in writing after the denial."
CL_NEW = ("Owner remains responsible for payment for all emergency and mitigation services GrayCo performed at Owner's written request (for example water extraction, drying, board-up, tarping) regardless of insurance coverage or the outcome of the claim, "
          "at the rates in this Agreement or, if none, GrayCo's standard rates, and for any work Owner approved in writing after the denial. This does not waive the right to cancel the remaining repair work.")
src = once(src, CL_OLD, CL_NEW, 'ks-clause', 4)
# the admin Work Authorization template paragraphs (163575-163578) and the claim Work Authorization / library Work Authorization
W5_OLD = "I will owe the reasonable cost of the emergency services performed even if I later cancel or"
assert src.count(W5_OLD) >= 1
W6_OLD = "and I will owe only for emergency services already performed at my request and for work I approved in writing after the denial."
c6 = src.count(W6_OLD); assert c6 >= 1, c6
W6_NEW = ("and I remain responsible for payment for all emergency and mitigation services GrayCo performed (for example water extraction, drying, board-up, tarping) regardless of insurance coverage or the outcome of the claim, at the rates in this agreement or, if none, GrayCo\\'s standard rates, and for work I approved in writing after the denial.")
# apostrophe style per copy
def sub_style(t, old, new_tpl):
    o, p, k = [], 0, 0
    for m in re.finditer(re.escape(old), t):
        back = t[max(0, m.start() - 6000):m.start()]
        ap = re.findall(r"(?:GrayCo|insurer|mechanic|Owner)(\\*)'s", back)
        esc = (ap[-1] if ap else '') + "'"
        o.append(t[p:m.start()]); o.append(new_tpl.replace("'", esc)); p = m.end(); k += 1
    o.append(t[p:]); return ''.join(o), k
src, k6 = sub_style(src, W6_OLD, W6_NEW.replace("\\'", "'")); print('WA para 6 copies', k6)
src = once(src, "6. EMERGENCY SERVICES: If emergency mitigation (water extraction, board-up, tarping) was performed, those costs are included in the insurance claim and covered under this agreement.",
           "6. EMERGENCY SERVICES: If emergency mitigation (water extraction, board-up, tarping) was performed, those costs are included in the insurance claim and covered under this agreement. Owner is responsible for payment for all emergency and mitigation services GrayCo performed regardless of insurance coverage or the outcome of the claim, at the rates in this agreement or, if none, GrayCo's standard rates.", 'ks-emerg6')

# library Mitigation Services Agreement
OLDMIT = "p('Charges are billed at the rates used for the claim; the owner is responsible for amounts not paid by insurance and for the deductible. In any action"
NEWMIT = ("p('Charges are billed at the rates used for the claim; the owner is responsible for amounts not paid by insurance and for the deductible. " + sq(DEN) + "') +\n  p('In any action")
src = once(src, OLDMIT, NEWMIT, 'lib-mitigation')
# Emergency Services Waiver (LEGAL2)
OLDWV = "I understand that I will owe the reasonable cost of emergency work already performed even if I later cancel the rest of the contract. My right to cancel any work that is not emergency work is not affected."
NEWWV = ("I understand that I am responsible for payment for all emergency and mitigation services GrayCo performs (for example water extraction, drying, board-up, tarping) regardless of insurance coverage or the outcome of the claim, even if I later cancel the rest of the contract, at the rates in my agreement or, if none, GrayCo's standard rates. My right to cancel any work that is not emergency work is not affected, and if my claim is denied I may cancel the remaining repair work as stated in my Notice of Right to Cancel.")
src = once(src, OLDWV, NEWWV, 'waiver')
# mold + pack-out emergency payment lines are left alone (not emergency / mitigation services of this clause); library Work Authorization + Direction to Pay
OLDWAL = "p('I authorize ' + GCO + ' to perform emergency services, mitigation and the repairs agreed to at the property above, and to communicate with my insurance company and its adjuster about this claim.') +"
NEWWAL = (OLDWAL + "\n  p('" + sq(DEN) + "') +")
src = once(src, OLDWAL, NEWWAL, 'lib-workauth')
# the Ks Fire template: emergency authorization line
OLDFIRE = "Owner authorizes Contractor to begin emergency services immediately upon signing, including board-up, tarping, property securing, and initial smoke/soot mitigation to prevent further damage to the property."
src = once(src, OLDFIRE, OLDFIRE + " Owner is responsible for payment for all emergency and mitigation services GrayCo performed (for example water extraction, drying, board-up, tarping) regardless of insurance coverage or the outcome of the claim, at the rates in this agreement or, if none, GrayCo's standard rates.", 'ks-fire')

# ---- portal: the Work Authorization / Direction to Pay signing view (portal.html)
P = rd('portal.html')
OLDV = "If insurance claim is denied, this agreement is void and Owner owes only for emergency services performed."
NEWV = "If the insurance claim is denied, Owner may cancel the remaining repair work as stated in the Notice of Right to Cancel (see the emergency and mitigation services paragraph below)."
P = once(P, OLDV, NEWV, 'portal-void')
OLDH = "  var isDtp = /direction to pay/i.test(String(x.title || '')), opAck = null;"
NEWH = ("  var isDtp = /direction to pay/i.test(String(x.title || '')), opAck = null;\n"
        "  /* OWNER4-patch: the Work Authorization AND the Direction to Pay carry the emergency / mitigation payment paragraph with its own acknowledgement */\n"
        "  var isWa = /work authori[sz]ation/i.test(String(x.title || '')) || /^(work_auth|workauth)$/i.test(String(x.docType || x.tmpl || x.template || '')), denAck = null;")
P = once(P, OLDH, NEWH, 'portal-isWa')
DEN_JS = DEN.replace("'", "\\'")
OLDI = "  if (x.status === 'signed' && x.signed) {\n    box.appendChild(h('div', { class: 'muted', text: '✓ Signed by '"
NEWI = ("  if (isDtp || isWa) box.appendChild(h('div', { class: 'es-op es-den', 'data-gc-den': '1' }, [h('b', { text: 'Emergency and mitigation services — payment. ' }), h('span', { text: ' " + DEN_JS + "' })]));   /* OWNER4-patch */\n" + OLDI)
P = once(P, OLDI, NEWI, 'portal-den-para')
P = once(P, "  if (isDtp) opAck = kept(h('input', { type: 'checkbox', 'data-gc-op-ack': '1' }), 'o_' + x.id, true);",
         "  if (isDtp) opAck = kept(h('input', { type: 'checkbox', 'data-gc-op-ack': '1' }), 'o_' + x.id, true);\n  if (isDtp || isWa) denAck = kept(h('input', { type: 'checkbox', 'data-gc-den-ack': '1' }), 'd_' + x.id, true);   /* OWNER4-patch */", 'portal-denack')
P = once(P, "  box.appendChild(h('label', { class: 'sel-agree' }, [ag, h('span', { text: x.kind === 'change_order'",
         "  if (denAck) box.appendChild(h('label', { class: 'sel-agree' }, [denAck, h('span', { text: ' I have read and acknowledge the Emergency and mitigation services payment paragraph above: I am responsible for payment for emergency and mitigation services GrayCo performs, regardless of insurance coverage or the outcome of the claim.' })]));   /* OWNER4-patch */\n  box.appendChild(h('label', { class: 'sel-agree' }, [ag, h('span', { text: x.kind === 'change_order'", 'portal-denlabel')
P = once(P, "if (opAck && !opAck.checked) { msg.textContent = 'Please tick the box to acknowledge the Cancellation / Overhead & Profit paragraph.'; return; }",
         "if (opAck && !opAck.checked) { msg.textContent = 'Please tick the box to acknowledge the Cancellation / Overhead & Profit paragraph.'; return; } if (denAck && !denAck.checked) { msg.textContent = 'Please tick the box to acknowledge the Emergency and mitigation services payment paragraph.'; return; }", 'portal-dengate')
P = once(P, "api({ action: 'sign', id: x.id, name: nm.value, agree: true,", "api({ action: 'sign', id: x.id, name: nm.value, agree: true, emergencyPayAck: denAck ? true : undefined,", 'portal-denapi')
wr('portal.html', P)

# ---- legal2.js x3 + cancel.py: the state clause
for f in ['legal2.js', 'subportal/legal2.js', 'subportal-app/public/legal2.js', 'tools/legal2/cancel.py']:
    t = rd(f)
    t = once(t, CL_OLD, CL_NEW, f, 3 if f.endswith('.js') else 1)
    wr(f, t)

# ---- portal-app.js (sub portal pay rules, EN + ES) and bid.html (ITB page)
A = rd('portal-app.js')
A = once(A, "payRule: 'Invoices in by Wednesday are paid the following Friday. Send invoices",
         "payRule: 'Invoices in by Wednesday are paid the Friday of the following week; later invoices are paid the Friday after that. GrayCo may mark an invoice Pay ASAP. Send invoices", 'app-en')
A = once(A, "payRule: 'Las facturas recibidas antes del miércoles se pagan el viernes de la semana siguiente. Envíe",
         "payRule: 'Las facturas recibidas antes del miércoles se pagan el viernes de la semana siguiente; las demás, el viernes posterior. GrayCo puede marcar una factura como Pay ASAP. Envíe", 'app-es')
wr('portal-app.js', A)
B = rd('bid.html')
B = once(B, '<div class="term-label">Invoices Due</div><div class="term-val">By the 25th of each month</div>', '<div class="term-label">Invoices Due</div><div class="term-val">In by Wednesday: paid the Friday of the following week</div>', 'bid-inv')
B = once(B, '<div class="term-val">Net 30 from invoice due date</div>', '<div class="term-val">Weekly: invoices received by Wednesday are paid the Friday of the following week; later invoices the Friday after that (Pay ASAP when GrayCo marks it)</div>', 'bid-pay')
B = once(B, '<div class="term-val">Final retainage paid within 10 days of owner pay</div>', '<div class="term-val">' + RET + '</div>', 'bid-ret')
B = once(B, '    <div class="term"><div class="term-label">Clean-Up</div>', '    <div class="term"><div class="term-label">Backcharges and Default</div><div class="term-val">' + BC_ITB.replace('Backcharges and Default: ', '') + '</div></div>\n    <div class="term"><div class="term-label">Clean-Up</div>', 'bid-bc')
wr('bid.html', B)

# ---- admin-only "pending attorney review" flags on the library rows (never printed)
OLDOP = "function opNoteRow(row, id){"
O4 = ("/* OWNER4-patch: admin-only flags, same pattern as the O&P note */\n"
      "var O4_DEN = 'Emergency / mitigation payment + insurance-denial wording pending attorney review (sent 10/26)', O4_DEN_IDS = { gcb_work_auth: 1, 'gen:work_auth': 1, gcb_direction_to_pay: 1, gcb_roof_contingency: 1, gcb_mitigation: 1, gcb_cancel_waiver_emergency: 1, gcb_contract: 1 };\n"
      "var O4_BC = 'Sub backcharges / default clause pending attorney review (sent 10/26)', O4_BC_IDS = { gcb_msa: 1, gcb_sub_work_order: 1, gcb_subcontract: 1 };\n"
      "function o4NoteRow(row, id){ if (!row) return; [[O4_DEN_IDS, O4_DEN, 'owner4-den'], [O4_BC_IDS, O4_BC, 'owner4-bc']].forEach(function(a){ if (!a[0][id] || row.querySelector('[data-gc-admin-note=\"' + a[2] + '\"]')) return; var nt = D.createElement('span'); nt.setAttribute('data-gc-admin-note', a[2]); nt.textContent = a[1]; nt.style.cssText = 'font-size:10.5px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:2px 6px'; row.appendChild(nt); }); }\n")
src = once(src, OLDOP, O4 + OLDOP, 'o4-note-fn')
src = once(src, "if (m && m[1] === 'gen:work_auth') { opNoteRow(b0.parentElement, m[1]); return; }", "if (m && m[1] === 'gen:work_auth') { opNoteRow(b0.parentElement, m[1]); o4NoteRow(b0.parentElement, m[1]); return; }", 'o4-genwa')
src = once(src, "    feeNoteRow(row, m[1]);   /* FEES-patch: admin-only */", "    feeNoteRow(row, m[1]);   /* FEES-patch: admin-only */\n    o4NoteRow(row, m[1]);   /* OWNER4-patch: admin-only */", 'o4-rows')

# ---- Lead settings: the two new address lists, next to the alert setting
src = once(src, "One or more e-mail addresses, separated by commas. Emergency alerts are not changed (on-call PM, admins and office).",
           "One or more e-mail addresses, separated by commas. Emergencies are set by the two lists below it (on-call PM + office always get them).", 'alertto-text')
TAILS = rd(os.path.join(HERE, 'mitto_tail.js')).rstrip('\n'), rd(os.path.join(HERE, 'emergto_tail.js')).rstrip('\n')
for tl in TAILS: assert '</script>' not in tl
anchor = '<script id="gc-patch-pay2">'
src = once(src, anchor, '<script id="gc-patch-mitto">\n' + TAILS[0] + '\n</script>\n<script id="gc-patch-emergto">\n' + TAILS[1] + '\n</script>\n' + anchor, 'tails')
src = src.replace('/* __OWNER4_END__ */', '')
src += '\n<!-- ' + MARK + ' -->\n' if False else ''
# marker (inside an existing comment-free spot: the mitto script already carries __GC_PATCH_MITTO__; MARK guards re-runs)
src = once(src, '<script id="gc-patch-mitto">', '<script id="gc-patch-mitto"><!-- -->'.replace('<!-- -->', '/* ' + MARK + ' */') if False else '<script id="gc-patch-mitto">', 'mark-noop')
assert '__GC_PATCH_MITTO__' in src
wr('index.html', src)

# ---- version stamp (cache bust for portal-app.js is in portal.html; leave) 
print('OWNER4 patched')
