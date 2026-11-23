#!/usr/bin/env python3
"""Made-up supplier statements for test_SUPSTMT.mjs (demo names, demo addresses, demo numbers -- nothing real).
Usage: python3 make_fixtures.py <out-dir>
Writes:
  abc_stmt.pdf   a building-supplier statement drawn the way such statements are laid out: company block, account / statement
                 date / statement # block, a column header (Inv Date, Invoice #, Type, Customer PO, Ship To / Job Address,
                 Job Name / Memo, Amount, Balance Due), one line per invoice / credit / finance charge / payment, a two-line entry
                 (its ship-to on the next line), a page break with the header again, Total Due and an aging row.
  abc_stmt.txt   the same lines typed / pasted (2+ spaces between the columns, no header)
  abc_stmt.csv   the same lines as a CSV with a header
  abc_next.pdf   the next month's statement (repeats one invoice that the first statement paid)
  scan.pdf       a picture-only PDF (no text)
  expect.json    what each line must read as
"""
import json, os, sys
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT = sys.argv[1] if len(sys.argv) > 1 else 'fixtures'
os.makedirs(OUT, exist_ok=True)

SUP = 'ABC SUPPLY CO., INC.'
# (date, invoice #, type, PO, ship-to, memo, amount) -- the second ship-to line is drawn under the memo when ship2 is set
LINES = [
    ('10/02/26', '2345678-00', 'INV', 'T601', '1234 Oak Ridge Dr, Memphis TN', 'PAT DEMO KITCHEN', 1250.00, None),
    ('10/06/26', '2345701-00', 'INV', 'T602', '88 Maple Cv, Cordova TN', 'LEE SAMPLE BATH', 842.17, None),
    ('10/09/26', '2345733-00', 'INV', 'T605', '902 Walnut Grove Rd, Memphis TN', 'SIDING', 2210.40, None),
    ('10/12/26', '2345760-00', 'INV', '', '3301 Elm St, Bartlett TN', 'GARAGE LUMBER', 615.00, None),
    ('10/15/26', '2345799-00', 'INV', 'T604', '', 'BROOKS DECK', 389.55, None),
    ('10/20/26', '2345803-00', 'INV', '', '', 'JOB: DEMO REROOF HARLAN', 1075.25, None),
    ('10/22/26', '2345811-00', 'INV', '', '', 'WILL CALL', 214.60, None),
    ('10/24/26', '2345702-00', 'CM', 'T602', '', 'RETURN - DAMAGED VANITY', -125.00, None),
    ('10/31/26', 'FC1031', 'FC', '', '', 'FINANCE CHARGE', 18.75, None),
    ('11/03/26', '88123', 'PMT', '', '', 'PAYMENT - THANK YOU CHECK 4410', -842.17, None),
    ('11/05/26', '2345850-00', 'INV', 'T606', '', 'GARAGE SHINGLES', 1980.00, '3301 ELM ST BARTLETT TN'),
]
TOTAL = round(sum(l[6] for l in LINES), 2)
EXPECT = [
    {'invNo': '2345678-00', 'kind': 'invoice', 'po': 'T601', 'ship': '1234 Oak Ridge Dr', 'amount': 1250.00, 'st': 'ok', 'pid': 'P1', 'how': 'po', 'bill': 'B1'},
    {'invNo': '2345701-00', 'kind': 'invoice', 'po': 'T602', 'ship': '88 Maple Cv', 'amount': 842.17, 'st': 'already', 'pid': 'P2', 'bill': 'B2'},
    {'invNo': '2345733-00', 'kind': 'invoice', 'po': 'T605', 'ship': '902 Walnut Grove Rd', 'amount': 2210.40, 'st': 'wrong', 'pid': 'P5', 'how': 'po', 'bill': 'B3'},
    {'invNo': '2345760-00', 'kind': 'invoice', 'po': '', 'ship': '3301 Elm St', 'amount': 615.00, 'st': 'ok', 'pid': 'P6', 'how': 'address', 'bill': 'B4'},
    {'invNo': '2345799-00', 'kind': 'invoice', 'po': 'T604', 'ship': '', 'amount': 389.55, 'st': 'new', 'pid': 'P4', 'how': 'po', 'closed': True},
    {'invNo': '2345803-00', 'kind': 'invoice', 'po': '', 'ship': '', 'amount': 1075.25, 'st': 'new', 'pid': 'P3', 'how': 'memo'},
    {'invNo': '2345811-00', 'kind': 'invoice', 'po': '', 'ship': '', 'amount': 214.60, 'st': 'nojob', 'pid': ''},
    {'invNo': '2345702-00', 'kind': 'credit', 'po': 'T602', 'ship': '', 'amount': -125.00, 'st': 'credit', 'pid': 'P2', 'how': 'po'},
    {'invNo': 'FC1031', 'kind': 'finance', 'po': '', 'ship': '', 'amount': 18.75, 'st': 'finance', 'pid': ''},
    {'invNo': '88123', 'kind': 'payment', 'po': '', 'ship': '', 'amount': -842.17, 'st': 'info', 'pid': ''},
    {'invNo': '2345850-00', 'kind': 'invoice', 'po': 'T606', 'ship': '3301 ELM ST', 'amount': 1980.00, 'st': 'new', 'pid': 'P6', 'how': 'po'},
]


def m(v):
    return ('-' if v < 0 else '') + '{:,.2f}'.format(abs(v))


COLS = [(36, 'Inv Date', 'l'), (84, 'Invoice #', 'l'), (142, 'Type', 'l'), (170, 'Customer PO', 'l'), (226, 'Ship To / Job Address', 'l'),
        (366, 'Job Name / Memo', 'l'), (522, 'Amount', 'r'), (578, 'Balance Due', 'r')]


def statement(name, no, date, lines, total, split_at=None):
    c = canvas.Canvas(os.path.join(OUT, name + '.pdf'), pagesize=letter)
    def top(page):
        c.setFont('Helvetica-Bold', 14); c.drawString(36, 750, SUP)
        c.setFont('Helvetica', 8.5); c.drawString(36, 737, 'Branch 0457  4100 Demo Industrial Pkwy  Memphis TN 38118  Phone 901-555-0100')
        c.setFont('Helvetica-Bold', 13); c.drawRightString(578, 750, 'STATEMENT')
        c.setFont('Helvetica', 8.5)
        c.drawString(36, 716, 'Sold To: GRAYCO DEMO CONSTRUCTION'); c.drawString(36, 705, 'PO BOX 100  MEMPHIS TN 38101')
        c.drawString(380, 716, 'Account No:'); c.drawString(460, 716, '900123')
        c.drawString(380, 705, 'Statement Date:'); c.drawString(460, 705, date)
        c.drawString(380, 694, 'Statement No:'); c.drawString(460, 694, no)
        c.drawString(380, 683, 'Page ' + str(page))
        c.setFont('Helvetica-Bold', 7.5)
        for x, t, a in COLS:
            (c.drawRightString if a == 'r' else c.drawString)(x, 660, t)
        c.setFont('Helvetica', 7.5)
    page = 1; top(page); y = 646
    for i, (d, inv, ty, po, ship, memo, amt, ship2) in enumerate(lines):
        if split_at is not None and i == split_at:
            c.showPage(); page += 1; top(page); y = 646
        vals = [d, inv, ty, po, ship, memo, m(amt), m(amt) if ty != 'PMT' else '']
        for (x, _, a), v in zip(COLS, vals):
            if v:
                (c.drawRightString if a == 'r' else c.drawString)(x, y, v)
        y -= 11
        if ship2:
            c.drawString(366, y, 'SHIP TO: ' + ship2); y -= 11
    y -= 8
    c.setFont('Helvetica-Bold', 9); c.drawString(380, y, 'Total Due:'); c.drawRightString(578, y, m(total)); y -= 22
    c.setFont('Helvetica', 7.5)
    c.drawString(36, y, 'Current'); c.drawString(120, y, '1-30 Days'); c.drawString(200, y, '31-60 Days'); c.drawString(290, y, 'Over 60'); y -= 10
    c.drawString(36, y, m(total)); c.drawString(120, y, '0.00'); c.drawString(200, y, '0.00'); c.drawString(290, y, '0.00'); y -= 16
    c.drawString(36, y, 'Please remit to: ABC Supply Demo Lockbox, PO Box 999, Demo City TN 38000. Thank you for your business.')
    c.save()


statement('abc_stmt', 'ST-1115-0457', '11/15/2026', LINES, TOTAL, split_at=7)
NEXT = [('11/02/26', '2345678-00', 'INV', 'T601', '1234 Oak Ridge Dr, Memphis TN', 'PAT DEMO KITCHEN', 1250.00, None),
        ('11/09/26', '2346001-00', 'INV', 'T603', '4500 Poplar Ave, Memphis TN', 'HARLAN REROOF', 3120.00, None)]
statement('abc_next', 'ST-1215-0457', '12/15/2026', NEXT, round(sum(l[6] for l in NEXT), 2))

with open(os.path.join(OUT, 'abc_stmt.txt'), 'w') as f:
    for d, inv, ty, po, ship, memo, amt, ship2 in LINES:
        f.write('  '.join(x for x in [d, inv, ty, po, ship, memo + (' / SHIP TO: ' + ship2 if ship2 else ''), m(amt)] if x) + '\n')
with open(os.path.join(OUT, 'abc_stmt.csv'), 'w') as f:
    f.write('Invoice Date,Invoice #,Type,PO #,Ship To,Description,Amount\n')
    for d, inv, ty, po, ship, memo, amt, ship2 in LINES:
        f.write(','.join('"%s"' % x.replace('"', '""') for x in [d, inv, ty, po, ship or (ship2 or ''), memo, m(amt)]) + '\n')

# a picture-only PDF: a filled rectangle, no text
c = canvas.Canvas(os.path.join(OUT, 'scan.pdf'), pagesize=letter); c.setFillGray(0.85); c.rect(36, 300, 500, 400, fill=1, stroke=0); c.save()
json.dump({'supplier': SUP, 'stmtNo': 'ST-1115-0457', 'stmtDate': '2026-11-15', 'total': TOTAL, 'lines': EXPECT, 'next': {'stmtNo': 'ST-1215-0457', 'total': round(sum(l[6] for l in NEXT), 2)}},
          open(os.path.join(OUT, 'expect.json'), 'w'), indent=1)
print('fixtures in', OUT, 'total', TOTAL)
