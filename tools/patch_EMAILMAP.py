#!/usr/bin/env python3
"""Idempotent patch EMAILMAP: every e-mail address says the same thing, everywhere (owner 10/26).

  leads@    every lead and every bid invitation / bid-board notice (the CRM reads it into the Lead Inbox)
  bids@     only OUR bids going out, GC replies to them, and subs' prices for bids we are pricing
  claims@   insurance carriers, TPAs and adjusters (claim mail; new assignments become insurance leads)
  invoices@ subcontractor and supplier bills / invoices (filed under Invoices for approval)
  receipts@ staff e-mail receipt photos / PDFs (To-Do "Receipts e-mailed in")
  billing@  what customer invoices, statements and pay apps are sent FROM; customers reply here (lands in office@)
  office@   main office mailbox      orders@ supplier order confirmations      estimates@ estimates / takeoffs sent to the CRM
  replies@ / portal@ / news@ send-only or reply-to addresses.   Phone / text: (901) 582-8255 text, (901) 585-0944 office line.

What it changes (TEXT ONLY, small and localised; every find-string must occur the stated number of times, re-running changes nothing):
  1. Subs: "Send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO)" in the Master Subcontract (4.2), the
     Work Order, the Forms & Docs sub agreement, the sub e-mail agreement text, the sub scope sheet and scope e-mails, the onboarding packet,
     the bid package texts, the supplier PO ("Bill to"), the sub portal (home, pay screen, bid-site footer, invite e-mails) and the lien
     waiver request e-mail; "Send your price for our bids to bids@grayco-cs.com" in the Invitation to Bid and the scope-request e-mail.
  2. Customers: one short "How to reach us" block (questions / scheduling, payments, insurance claims, emergencies): customer portal,
     the welcome e-mail, the contract Notices clause (office@ + mailing address), the Work Authorization (claims@).
  3. Handbook + training: "E-mail addresses - what goes where" in the Employee Handbook, the PM Playbook, the Training tab and the setup docs.
  4. The Email Center default address list (mailcenter.js) now lists invoices@ and receipts@ and describes each address by the rule above.
  5. In-CRM help that told suppliers to e-mail bills to billing@ now says invoices@.
Usage: python3 tools/patch_EMAILMAP.py   (from the repo root; files are rewritten in place)
"""
import os, re, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MARK = 'EMAILMAP-patch'
FILES = {}
CHANGED = []

def rd(p):
    if p not in FILES:
        FILES[p] = open(os.path.join(ROOT, p), encoding='utf-8').read()
    return FILES[p]
def wr_all():
    for p, t in FILES.items():
        cur = open(os.path.join(ROOT, p), encoding='utf-8').read()
        if cur != t:
            open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(t); CHANGED.append(p)

def edit(path, old, new, label, n=1):
    """replace `old` (n occurrences) by `new`; if `new` is already there, the edit was done before"""
    t = rd(path)
    if new in t and (old not in t or new.count(old) and t.count(new) >= n):
        return
    c = t.count(old)
    assert c == n, ('anchor count != %d' % n, label, path, c)
    FILES[path] = t.replace(old, new)

# ------------------------------------------------------------------ the one wording
SUBL = 'Send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO).'
BIDL = 'Send your price for our bids to bids@grayco-cs.com.'
REACH_Q = 'Questions or scheduling: office (901) 585-0944, text (901) 582-8255, or your GrayCo Portal.'
REACH_P = 'Payments and billing: billing@grayco-cs.com.'
REACH_C = 'Insurance claims: claims@grayco-cs.com.'
REACH_E = 'Emergency (water, fire): call (901) 585-0944.'

# the address table: (address, what goes there, what the CRM does)
ROWS = [
 ('leads@grayco-cs.com', 'Every lead and every bid invitation or bid-board notice: BuildingConnected, PlanHub, plan rooms, public bid sites, GC invitation lists, and the website, Facebook and Google forms. Sign up for every bid site with leads@.', 'Read into Leads → 📥 Lead Inbox. Alerts go to the office.'),
 ('bids@grayco-cs.com', 'Only our own bids going out, GC replies to them, and subcontractors\' prices for bids we are pricing.', 'GC replies are filed on the bid; sub prices land in Leads → 📨 Sub bids.'),
 ('claims@grayco-cs.com', 'Insurance carriers, TPAs and adjusters: claim correspondence and new assignments. Copy claims@ on insurance e-mail.', 'Filed on the claim. A new assignment becomes an insurance lead.'),
 ('invoices@grayco-cs.com', 'Subcontractor and supplier bills and invoices. Forward any invoice you get to invoices@.', 'Filed under Invoices, waiting for approval.'),
 ('receipts@grayco-cs.com', 'Staff e-mail receipt photos and PDFs.', 'Shows on the To-Do as "Receipts e-mailed in". Someone confirms it.'),
 ('billing@grayco-cs.com', 'Customer invoices, statements and pay apps are sent from here. Customers reply here about payments.', 'Lands in office@ (Brittany).'),
 ('office@grayco-cs.com', 'The main office mailbox.', 'Brittany reads it.'),
 ('orders@grayco-cs.com', 'Supplier order confirmations.', 'Linked to the job: delivery, schedule, Materials arriving.'),
 ('estimates@grayco-cs.com', 'Estimators e-mail a takeoff or estimate (Word, PDF, Excel) to the CRM.', 'Stored for the office to build the estimate.'),
 ('replies@ · portal@ · news@', 'Send-only. The CRM sends from them (portal links, newsletters); replies@ is the Reply-To of automatic e-mails.', 'Nothing reads them by machine; people answer replies@.'),
]
RULES = [
 'Never sign up for bid sites with bids@ or your personal e-mail. Use leads@grayco-cs.com.',
 'Forward any invoice you get to invoices@grayco-cs.com.',
 'Forward receipts (photo or PDF) to receipts@grayco-cs.com.',
 'Insurance correspondence: copy claims@grayco-cs.com.',
 'Tell subcontractors: invoices and pay requests go to invoices@, their prices for our bids go to bids@.',
 'Tell customers: payments and billing go to billing@, insurance claims go to claims@. Texts go to (901) 582-8255; the office line is (901) 585-0944.',
]
TITLE = 'E-mail addresses: what goes where'

def esc_html(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
def html_table(style_t='', style_c='', cls=''):
    h = '<table%s%s><thead><tr><th>Address</th><th>What goes there</th><th>What the CRM does</th></tr></thead><tbody>' % (cls, style_t)
    for a, w, c in ROWS:
        h += '<tr><td%s><b>%s</b></td><td%s>%s</td><td%s>%s</td></tr>' % (style_c, esc_html(a), style_c, esc_html(w), style_c, esc_html(c))
    return h + '</tbody></table>'
def html_rules(li=''):
    return '<ul>' + ''.join('<li%s>%s</li>' % (li, esc_html(r)) for r in RULES) + '</ul>'
def md_table():
    out = ['| Address | What goes there | What the CRM does |', '|---|---|---|']
    for a, w, c in ROWS:
        out.append('| **%s** | %s | %s |' % (a, w.replace('|', '/'), c.replace('|', '/')))
    return '\n'.join(out)
def md_rules():
    return '\n'.join('- ' + r for r in RULES)

# ================================================================== index.html
IDX = 'index.html'

# --- 1a. the Master Subcontract (4.2) and the Work Order (the library text in index.html AND the generator source)
for p in (IDX, 'tools/legal2/subs.py'):
    edit(p, 'Subcontractor submits invoices through the GrayCo Sub Portal (or as GrayCo directs) showing the PO number',
         'Subcontractor submits invoices through the GrayCo Sub Portal or by e-mail to <b>invoices@grayco-cs.com</b> (include the job name/PO), showing the PO number',
         'MSA 4.2 ' + p)
    edit(p, 'A conditional lien waiver goes with each invoice and an unconditional waiver after payment.',
         'A conditional lien waiver goes with each invoice and an unconditional waiver after payment. ' + SUBL, 'work order ' + p)

# --- 1b. Forms & Docs: the sub agreement, the scope sheet, the scope e-mail, the onboarding packet
edit(IDX, '<b>1. Payment:</b> Payment follows Section 4', '<b>1. Payment:</b> Sub shall send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO). Payment follows Section 4', 'forms sub agreement')
edit(IDX, "Payment terms: Net 30 from GrayCo receipt of invoice</td>", "Payment terms: Net 30 from GrayCo receipt of invoice. " + SUBL + "</td>", 'sub scope sheet row')
edit(IDX, "<li>Payment terms: Net 30 from invoice receipt</li>", "<li>Payment terms: Net 30 from invoice receipt</li><li>" + SUBL + "</li>", 'sub scope general conditions')
edit(IDX, "payment terms (Net 30 from invoice receipt).</p>", "payment terms (Net 30 from invoice receipt). " + SUBL + "</p>", 'onboarding ack')
edit(IDX, "GrayCo issues 1099s for payments over $600/year.</b></p>", "GrayCo issues 1099s for payments over $600/year. " + SUBL + "</b></p>", 'onboarding tax note')
edit(IDX, "Send your bid to '+GC.email+' or reply directly to this email.</p>'+",
     "Send your price for our bids to bids@grayco-cs.com (put the project name in the subject). If you are awarded the work, send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO).</p>'+", 'sub scope e-mail template')
# the scope e-mail the CRM builds for a sub (Gmail draft body): after the requirements
edit(IDX, "• Sub invoices due by the 25th of each month — payment Net 30\n", "• Sub invoices due by the 25th of each month — payment Net 30\n• " + SUBL + "\n", 'sub scope e-mail requirements')
# the sub contract e-mail text (gcSubEmail)
edit(IDX, "'Payment Terms:        Net 30 days from invoice receipt and approval',",
     "'Payment Terms:        Net 30 days from invoice receipt and approval',\n      'Send invoices to:     invoices@grayco-cs.com (include the job name/PO)',", 'gcSubEmail')
# the bid package texts (bid portal + Gmail)
edit(IDX, "MUST appear on all invoices\\n\\u2022 Sub invoices due every Wednesday",
     "MUST appear on all invoices\\n\\u2022 Send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO)\\n\\u2022 Sub invoices due every Wednesday", 'bid package A')
edit(IDX, "MUST appear on all invoices\n\\u2022 Invoice Schedule: Sub invoices due every Wednesday",
     "MUST appear on all invoices\n\\u2022 Send invoices to: invoices@grayco-cs.com (include the job name/PO)\n\\u2022 Invoice Schedule: Sub invoices due every Wednesday", 'bid package B')
# the supplier PO
edit(IDX, "' · (901) 585-0944</p>';\n}\nfunction makePOs(e, opts){",
     "' · (901) 585-0944</p>' +\n    '<p><b>Bill to: invoices@grayco-cs.com</b> (put the PO number on every invoice). Send order confirmations to orders@grayco-cs.com.</p>';\n}\nfunction makePOs(e, opts){", 'supplier PO')
# sub text templates: a short invoice reminder
edit(IDX, "Reply Y to confirm. Reply STOP to opt out.' },\n  { id: 'tpl-default-5'",
     "Reply Y to confirm. Reply STOP to opt out.' },\n  { id: 'tpl-default-4b', name: 'Subcontractor invoice reminder', cat: 'Subcontractor', body: 'GrayCo Construction Services: please send your invoice to invoices@grayco-cs.com with the job name/PO. Questions? Call (901) 585-0944. Reply STOP to opt out.' },\n  { id: 'tpl-default-5'", 'sub sms template')

# --- 2. customers: the welcome e-mail, the contract Notices clause, the Work Authorization
REACH_HTML = ('<p style="font-size:13px;color:#55626F"><b>How to reach us</b><br>' + REACH_Q + '<br>' + REACH_P + '<br>' + REACH_C + '<br>' + REACH_E + '</p>')
edit(IDX, "esc(pm.phone) + ' with anything at all.</p>';\n}\nfunction nextStepsHtml",
     "esc(pm.phone) + ' with anything at all.</p>' +\n    '" + REACH_HTML + "';\n}\nfunction nextStepsHtml", 'welcome e-mail')
NOTICE_OLD = 'Notices shall be in writing, delivered by hand, mail, or email to the addresses of record.'
NOTICE_NEW = ('Notices shall be in writing, delivered by hand, mail, or email. Notices to GrayCo go to office@grayco-cs.com and to GrayCo Construction Services, LLC '
              'at the mailing address shown at the top of this Agreement (Bartlett, TN 38135); notices to Owner go to the e-mail and mailing address Owner gave GrayCo in this Agreement. '
              'Payment questions go to billing@grayco-cs.com and insurance claim papers to claims@grayco-cs.com.')
edit(IDX, NOTICE_OLD, NOTICE_NEW, 'contract notices', n=3)
CLAIMS_BULLET = 'Insurance claim papers and correspondence: e-mail claims@grayco-cs.com. Questions: (901) 585-0944 or office@grayco-cs.com.'
edit(IDX, "'• GrayCo will perform all work in accordance with insurance scope of loss and applicable building codes.<br>',",
     "'• GrayCo will perform all work in accordance with insurance scope of loss and applicable building codes.<br>',\n          '• " + CLAIMS_BULLET + "<br>',", 'work auth forms')
edit(IDX, "    P.txt('Project manager: ' + pm.name + (pm.phone ? ' · ' + pm.phone : ''));\n    P.sigs('Owner / date', 'GrayCo representative / date');\n  }).then(function(b){ return fileMade(job, 'work_auth'",
     "    P.txt('Project manager: ' + pm.name + (pm.phone ? ' · ' + pm.phone : ''));\n    P.txt('" + CLAIMS_BULLET + "');\n    P.sigs('Owner / date', 'GrayCo representative / date');\n  }).then(function(b){ return fileMade(job, 'work_auth'", 'work auth pdf')
edit(IDX, "If they conflict about the right to cancel, the right to cancel stated above controls.';",
     "If they conflict about the right to cancel, the right to cancel stated above controls.\\n\\n9. Contact. " + CLAIMS_BULLET + "';", 'work auth template')

# --- 5. in-CRM help that told suppliers to e-mail bills to billing@
edit(IDX, 'Supplier e-mails a bill to billing@<\\/td>', 'Supplier e-mails a bill to invoices@<\\/td>', 'help supplier bill 1')
edit(IDX, 'Suppliers e-mail billing@grayco-cs.com. The office approves each one onto a job.', 'Suppliers and subs e-mail invoices@grayco-cs.com. The office approves each one onto a job.', 'help supplier bill 2')

# --- 3. handbook (admin-only HR doc), PM playbook, Training tab
def D(x): return x.replace('"', '\\"').replace('</', '<\\/')   # the handbook is HTML inside a JSON string inside a JS string
H3 = D('<h3 style="font-size:12pt;margin:16px 0 6px;color:#0f2440">')
hb_html = (H3 + '7A. ' + TITLE + D('</h3><p style="margin:0 0 10px;line-height:1.55">Each kind of e-mail has one address. Use the right one so the CRM files it for you.</p>')
           + D(html_table(' style="width:100%;border-collapse:collapse;font-size:10pt;margin:0 0 10px"', ' style="border:1px solid #c9d3df;padding:4px 6px;vertical-align:top"'))
           + D(html_rules(' style="margin:0 0 5px"').replace('<ul>', '<ul style="margin:0 0 10px 20px;padding:0;line-height:1.5">')))
edit(IDX, H3 + '8. Timekeeping and pay' + D('</h3>'), hb_html + H3 + '8. Timekeeping and pay' + D('</h3>'), 'handbook section')
src_rows = ["%s: %s" % (a_, w_) for a_, w_, c_ in ROWS]
edit('tools/legal3_docs.py', "    ('h', '8. Timekeeping and pay'),",
     "    ('h', '7A. " + TITLE + "'),\n    ('p', 'Each kind of e-mail has one address. Use the right one so the CRM files it for you.'),\n    ('ul', " + repr(src_rows) + "),\n    ('ul', " + repr(RULES) + "),\n    ('h', '8. Timekeeping and pay'),", 'handbook source')

# PM Playbook (W._gcPlaybookHTML: a double-quoted JS string)
def pb(s): return s.replace('"', '\\"').replace('</', '<\\/')
pb_html = ('<h3>' + TITLE + '<\\/h3>\\n    <div class=\\"tw\\">' + pb(html_table('', '', ' class="qr"')) + '<\\/div>\\n    '
           + pb(html_rules()) + '\\n    <p>Customers and subs: ' + pb(esc_html(RULES[4] + ' ' + RULES[5])) + '<\\/p>\\n    ')
edit(IDX, '<section id=\\"email\\">\\n    <h2><span class=\\"n\\">13<\\/span>E-mail, marketing and the newsletter<\\/h2>\\n    <ul>',
     '<section id=\\"email\\">\\n    <h2><span class=\\"n\\">13<\\/span>E-mail, marketing and the newsletter<\\/h2>\\n    ' + pb_html + '<ul>', 'playbook email section')

# Training tab (BUILTIN JSON line): a part in "Start here" + the money parts
def j(s): return json.dumps(s, ensure_ascii=False)[1:-1]
part_body = ('Each kind of e-mail has one address. Use the right one and the CRM files it for you.\n\n' + md_table() + '\n\n' + md_rules()
             + '\n\nText messages go to (901) 582-8255. The office line is (901) 585-0944.')
part = {"id": "e-mail-addresses-what-goes-where", "title": TITLE, "body": part_body}
edit(IDX, '{"id": "what-the-crm-does-on-its-own"', json.dumps(part, ensure_ascii=False) + ', {"id": "what-the-crm-does-on-its-own"', 'training part')
edit(IDX, 'Invoices go out from **billing@grayco-cs.com** (an alias on office@), and billing@ is printed on every invoice.',
     'Invoices go out from **billing@grayco-cs.com** (an alias on office@), and billing@ is printed on every invoice. Customers reply to billing@ about payments. **Subcontractor and supplier bills come to invoices@grayco-cs.com**: tell subs ' + j('"') + 'send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO)' + j('"') + ', and forward any invoice you get to invoices@. The CRM files each one under Invoices for approval.', 'training invoices')
edit(IDX, '- **To-Do → 💳 Enter expenses:** log a receipt on a job.',
     '- **Receipts by e-mail:** forward a receipt photo or PDF to **receipts@grayco-cs.com**. It shows on the To-Do as ' + j('"') + 'Receipts e-mailed in' + j('"') + ' and someone confirms it.\\n- **To-Do → 💳 Enter expenses:** log a receipt on a job.', 'training receipts')
edit(IDX, '**Which e-mail do invoices come from?** billing@grayco-cs.com, which lands in office@.',
     '**Which e-mail do invoices come from?** billing@grayco-cs.com, which lands in office@.\\n\\n**Where do subs send their invoices?** invoices@grayco-cs.com, with the job name/PO. Their prices for our bids go to bids@grayco-cs.com. Forward any invoice you get to invoices@.\\n\\n**Which e-mail is for insurance?** claims@grayco-cs.com. Copy it on insurance correspondence; the carriers, TPAs and adjusters write there.\\n\\n**Where do receipts go?** Forward the photo or PDF to receipts@grayco-cs.com; it shows on the To-Do as ' + j('"') + 'Receipts e-mailed in' + j('"') + '.', 'training faq')

# ================================================================== the customer portal and the sub portal pages
PH = 'portal.html'
reach_fn = ("function reachBlock(){\n"
            "  var es = LANG === 'es';\n"
            "  return h('div', { class: 'muted', id: 'gcReach', style: 'margin-top:10px' }, [h('b', { text: es ? 'Cómo comunicarse con nosotros' : 'How to reach us' }), h('br'),\n"
            "    es ? 'Preguntas o citas: oficina (901) 585-0944, texto (901) 582-8255 o su Portal GrayCo.' : '" + REACH_Q + "', h('br'),\n"
            "    es ? 'Pagos y facturación: ' : 'Payments and billing: ', h('a', { href: 'mailto:billing@grayco-cs.com', text: 'billing@grayco-cs.com' }), h('br'),\n"
            "    es ? 'Reclamos de seguro: ' : 'Insurance claims: ', h('a', { href: 'mailto:claims@grayco-cs.com', text: 'claims@grayco-cs.com' }), h('br'),\n"
            "    es ? 'Emergencia (agua, fuego): llame al (901) 585-0944.' : '" + REACH_E + "']);\n"
            "}   /* " + MARK + " */\n")
edit(PH, "function infoCard(){\n", reach_fn + "function infoCard(){\n", 'portal reach fn')
edit(PH, "h('a', { href: 'tel:9015850944', text: 'Call us to change it' }), ' — ' + OFFICE + '.'])]);",
     "h('a', { href: 'tel:9015850944', text: 'Call us to change it' }), ' — ' + OFFICE + '.']), reachBlock()]);", 'portal info card')
edit(PH, "h('div', { class: 'muted' }, ['Questions about your claim? ', h('a', { href: 'tel:9015850944', text: 'Call us — ' + OFFICE }), '.'])]);",
     "h('div', { class: 'muted' }, ['Questions about your claim? ', h('a', { href: 'tel:9015850944', text: 'Call us — ' + OFFICE }), ' or e-mail ', h('a', { href: 'mailto:claims@grayco-cs.com', text: 'claims@grayco-cs.com' }), '.'])]);", 'portal claim help')

PA = 'portal-app.js'
edit(PA, "payRule: 'Invoices in by Wednesday are paid the following Friday.',",
     "payRule: 'Invoices in by Wednesday are paid the following Friday. Send invoices to invoices@grayco-cs.com (include the job name/PO).',", 'sub portal pay rule EN')
edit(PA, "payRule: 'Las facturas recibidas antes del miércoles se pagan el viernes de la semana siguiente.',",
     "payRule: 'Las facturas recibidas antes del miércoles se pagan el viernes de la semana siguiente. Envíe las facturas a invoices@grayco-cs.com (con el nombre del trabajo y el PO).',", 'sub portal pay rule ES')
edit(PA, "h('div', { class: 'muted', text: t('payRule') })]));\n  var wk = v.week || [];",
     "h('div', { class: 'muted', text: t('payRule') }), h('div', { class: 'muted' }, [h('a', { href: 'mailto:invoices@grayco-cs.com', text: 'invoices@grayco-cs.com' })])]));   /* " + MARK + " */\n  var wk = v.week || [];", 'sub portal home')

# the bid-site pages (compiled React app: static HTML only)
BAR = ('<div id="gc-sub-pay-note" style="text-align:center;font:13px Arial,sans-serif;color:#55626F;padding:10px 16px">Send all invoices and pay requests to '
       '<a href="mailto:invoices@grayco-cs.com">invoices@grayco-cs.com</a> (include the job name/PO). Send your price for our bids to <a href="mailto:bids@grayco-cs.com">bids@grayco-cs.com</a>.</div>')
for p in ('subportal/index.html', 'subportal-app/index.html'):
    edit(p, '<div id="root"></div>\n', '<div id="root"></div>\n    ' + BAR + '\n', 'bid site note ' + p)

# the sub's e-mails (portal-access.js) and the lien waiver request (lien.js)
PX = 'netlify/functions/portal-access.js'
edit(PX, "No password needed — keep this e-mail.',", "No password needed — keep this e-mail. Send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO).',", 'sub link mail EN')
edit(PX, "No necesita contraseña — guarde este correo.',", "No necesita contraseña — guarde este correo. Envíe todas las facturas a invoices@grayco-cs.com (con el nombre del trabajo y el PO).',", 'sub link mail ES')
edit(PX, "Open your portal to review it and sign it, or ask a question.', scopeBtn: 'Review and sign',",
     "Open your portal to review it and sign it, or ask a question. Send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO).', scopeBtn: 'Review and sign',", 'sub scope mail EN')
edit(PX, "Abra su portal para revisarlo y firmarlo, o hacer una pregunta.', scopeBtn: 'Revisar y firmar',",
     "Abra su portal para revisarlo y firmarlo, o hacer una pregunta. Envíe todas las facturas a invoices@grayco-cs.com (con el nombre del trabajo y el PO).', scopeBtn: 'Revisar y firmar',", 'sub scope mail ES')
edit('netlify/functions/_lib/lien.js', "Questions? Reply to this e-mail or call the office at 901-585-0944.</p></div>';",
     "Questions? Reply to this e-mail or call the office at 901-585-0944.</p>' +\n    '<p style=\"font-size:13px;color:#55626F\">Send all invoices and pay requests to <b>invoices@grayco-cs.com</b> (include the job name/PO).</p></div>';", 'lien request mail')

edit('netlify/functions/_lib/lien.js', 'module.exports = { run, request,', 'module.exports = { requestHtml, run, request,', 'lien export')

# ================================================================== the Invitation to Bid page
BP = 'bid.html'
edit(BP, 'href="mailto:office@grayco-cs.com?subject=Cordova%20Club%20%E2%80%94%20%5BYour%20Trade%5D">&#128231; Submit Your Bid</a>',
     'href="mailto:bids@grayco-cs.com?subject=Cordova%20Club%20%E2%80%94%20%5BYour%20Trade%5D">&#128231; Submit Your Bid</a>', 'ITB button')
edit(BP, '<div class="cta-subj">Sends to: office@grayco-cs.com<br>', '<div class="cta-subj">Send your price for our bids to: bids@grayco-cs.com<br>', 'ITB sends to')
edit(BP, '<div class="term"><div class="term-label">PO Number</div>',
     '<div class="term"><div class="term-label">Send Invoices To</div><div class="term-val">invoices@grayco-cs.com — include the job name and PO</div></div>\n    <div class="term"><div class="term-label">PO Number</div>', 'ITB invoices term')

# ================================================================== the Email Center default list
MC = 'netlify/functions/_lib/mailcenter.js'
edit(MC, "note: 'Customer leads and bid invitations — copy to leads@in.grayco-cs.com' }", "note: 'Every lead and every bid invitation or bid-board notice — copy to leads@in.grayco-cs.com' }", 'mc leads')
edit(MC, "note: 'Sub bids and GC replies to our bids — copy to bids@in.grayco-cs.com' }", "note: 'Only our own bids going out, GC replies and subs\\' prices for our bids — copy to bids@in.grayco-cs.com' }", 'mc bids')
edit(MC, "note: 'Invoices and payments (alias on office@)' },",
     "note: 'Customer invoices, statements and pay apps go out from here; customers reply here (alias on office@)' },\n  { address: 'invoices@grayco-cs.com', kind: 'group', mailbox: '', crm: true, note: 'Sub and supplier bills — copy to invoices@in.grayco-cs.com' },\n  { address: 'receipts@grayco-cs.com', kind: 'group', mailbox: '', crm: true, note: 'Receipt photos and PDFs from staff — copy to receipts@in.grayco-cs.com' },", 'mc invoices/receipts')

# ================================================================== docs
def add_doc_section(path, anchor, text, label, n=1):
    edit(path, anchor, text + anchor, label, n)
DOC_BLOCK = ('## ' + TITLE + '\n\n' + md_table() + '\n\n' + md_rules() +
             '\n\nPhone and text: text (901) 582-8255; office line (901) 585-0944. Tell subcontractors: ' + SUBL[0].lower() + SUBL[1:] + ' ' + BIDL + '\n\n')
t = rd('docs/LEAD-INBOX-SETUP.md')
if TITLE not in t:
    FILES['docs/LEAD-INBOX-SETUP.md'] = t.replace('**What you get.**', DOC_BLOCK + '**What you get.**', 1) if t.count('**What you get.**') == 1 else (_ for _ in ()).throw(AssertionError('LEAD-INBOX-SETUP anchor'))
for p in ('docs/ACTIVATE-EVERYTHING.md', 'docs/EMAIL-CENTER.md', 'docs/RECEIPTS-INVOICES-EMAIL.md'):
    t = rd(p)
    if TITLE not in t:
        FILES[p] = t.rstrip('\n') + '\n\n' + DOC_BLOCK.rstrip('\n') + '\n'
edit('docs/ACTIVATE-EVERYTHING.md', '| billing@grayco-cs.com | final invoices and payment reminders | yes, once you add the alias below; **suppliers send bills here** |',
     '| billing@grayco-cs.com | customer invoices, statements and payment reminders go out from here; customers reply here | yes, once you add the alias below; **suppliers and subs send bills to invoices@, not here** |', 'activate billing row')
edit('docs/ACTIVATE-EVERYTHING.md', '| billing@ | final invoices and reminders go out from it; supplier bills come in to it |',
     '| billing@ | customer invoices and reminders go out from it; customer payment questions come in to it (supplier and sub bills go to invoices@) |', 'activate billing row 2')
edit('docs/ACTIVATE-EVERYTHING.md', '1. Tell suppliers to email bills to **billing@grayco-cs.com**.', '1. Tell suppliers and subcontractors to email bills to **invoices@grayco-cs.com** (the CRM files them under Invoices; billing@ is for customers).', 'activate step 1')

wr_all()
print('patched:', ', '.join(CHANGED) if CHANGED else 'nothing (already patched)')
