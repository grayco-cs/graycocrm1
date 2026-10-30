#!/usr/bin/env python3
"""Synthetic card / bank statements for test_STMTPDF.mjs (made-up names and numbers only; nothing real).
Usage: python3 make_fixtures.py <out-dir>
Writes <name>.pdf + <name>.json ({ kind: card|bank, rows: [{date, amt, dir: out|in, kind, check?}], last4, total checks })
and one image-only PDF (scan.pdf). Every layout is drawn the way that bank lays its statement out (columns, sections,
two-line merchants, page breaks, Dec→Jan years), so the CRM's PDF reader is tested on positions, not on plain text.
Also writes QuickBooks Online CSV exports (qbo_*.csv) with their header blocks, totals rows and number styles."""
import json, os, sys, io
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT = sys.argv[1] if len(sys.argv) > 1 else 'fixtures'
os.makedirs(OUT, exist_ok=True)


def m(v):
    return '{:,.2f}'.format(v)


class Doc:
    def __init__(self, name, header, font='Helvetica', size=8.5, lead=12, top=740, bottom=60):
        self.name, self.header, self.font, self.size, self.lead, self.top, self.bottom = name, header, font, size, lead, top, bottom
        self.pages = [[]]
        self.y = None

    def _newpage(self):
        self.pages.append([])

    def line(self, items, gap=0):
        """items: [(x, text, 'l'|'r', bold?)]"""
        self.pages[-1].append(('line', items, gap))

    def blank(self, n=1):
        self.pages[-1].append(('gap', n))

    def pagebreak(self):
        self.pages.append([])

    def save(self):
        path = os.path.join(OUT, self.name + '.pdf')
        c = canvas.Canvas(path, pagesize=letter)
        c.setTitle('Statement')
        # lay the flow out, breaking pages when full
        flows = []
        for pg in self.pages:
            flows.append(list(pg))
        laid = [[]]
        for fi, pg in enumerate(flows):
            if fi > 0:
                laid.append([])
            y = self.top - 14 * (len(self.header(0, 0)) if callable(self.header) else 0)
            for it in pg:
                if it[0] == 'gap':
                    y -= self.lead * it[1]
                    laid[-1].append(('gap', it[1]))
                    continue
                if y < self.bottom:
                    laid.append([])
                    y = self.top - 14 * len(self.header(0, 0))
                laid[-1].append(it)
                y -= self.lead
        n = len(laid)
        for pi, pg in enumerate(laid):
            hy = self.top
            for (x, t, al, b) in self.header(pi + 1, n):
                c.setFont(self.font + ('-Bold' if b else ''), self.size + (1 if b else 0))
                (c.drawRightString if al == 'r' else c.drawString)(x, hy, t)
                hy -= 14
            y = hy - 6
            for it in pg:
                if it[0] == 'gap':
                    y -= self.lead * it[1]
                    continue
                for tup in it[1]:
                    x, t, al = tup[0], tup[1], tup[2]
                    b = len(tup) > 3 and tup[3]
                    c.setFont(self.font + ('-Bold' if b else ''), self.size)
                    (c.drawRightString if al == 'r' else c.drawString)(x, y, t)
                y -= self.lead
            c.setFont(self.font, 7)
            c.drawString(40, 30, 'Page %d of %d' % (pi + 1, n))
            c.showPage()
        c.save()
        return path


def hdr(lines):
    return lambda p, n: lines if p <= 1 else [lines[0], (40, 'Statement continued', 'l', False)]


FIX = {}


def write(name, kind, rows, extra=None):
    d = {'kind': kind, 'rows': rows}
    d.update(extra or {})
    FIX[name] = d
    with open(os.path.join(OUT, name + '.json'), 'w') as f:
        json.dump(d, f, indent=1)


def tot(rows, kinds):
    return round(sum(r['amt'] for r in rows if r['kind'] in kinds), 2)


# ───────────────────────────── CARDS ─────────────────────────────
# 1. Chase — Dec→Jan rollover, MM/DD, one Amount column, credits with "-", sections, a two-line merchant.
def chase():
    rows = [
        dict(date='2025-12-16', desc='THE HOME DEPOT #6620 MEMPHIS TN', amt=245.10, dir='out', kind='charge'),
        dict(date='2025-12-19', desc='Payment Thank You - Web', amt=1500.00, dir='in', kind='payment'),
        dict(date='2025-12-22', desc="LOWE'S #1234 PO A101 CORDOVA TN", amt=88.40, dir='out', kind='charge'),
        dict(date='2025-12-29', desc='ABC SUPPLY 8382 LAURETT COVE', amt=1512.00, dir='out', kind='charge'),
        dict(date='2026-01-02', desc='THE HOME DEPOT #6620 RETURN', amt=45.10, dir='in', kind='refund'),
        dict(date='2026-01-04', desc='SHELL OIL 57444 MEMPHIS TN', amt=61.50, dir='out', kind='charge'),
        dict(date='2026-01-09', desc='FACEBK *ADS 8XK2Q', amt=300.00, dir='out', kind='charge'),
        dict(date='2026-01-13', desc='PURCHASE INTEREST CHARGE', amt=12.34, dir='out', kind='interest'),
    ]
    prev = 2000.00
    pay = tot(rows, ['payment', 'refund'])
    pur = tot(rows, ['charge'])
    intr = tot(rows, ['interest'])
    new = round(prev - pay + pur + intr, 2)
    d = Doc('chase_card', hdr([(40, 'CHASE INK BUSINESS', 'l', True), (40, 'Account Number: XXXX XXXX XXXX 4421', 'l', False),
                               (40, 'Opening/Closing Date 12/14/25 - 01/13/26', 'l', False)]))
    d.line([(40, 'ACCOUNT SUMMARY', 'l', True)])
    for lab, v in [('Previous Balance', '$' + m(prev)), ('Payment, Credits', '-$' + m(pay)), ('Purchases', '+$' + m(pur)),
                   ('Cash Advances', '$0.00'), ('Fees Charged', '$0.00'), ('Interest Charged', '+$' + m(intr)), ('New Balance', '$' + m(new))]:
        d.line([(40, lab, 'l'), (300, v, 'r')])
    d.line([(40, 'Payment Due Date 02/07/26', 'l'), (300, 'Minimum Payment Due $40.00', 'r')])
    d.blank()
    d.line([(40, 'ACCOUNT ACTIVITY', 'l', True)])
    d.line([(40, 'Date of Transaction', 'l', True), (130, 'Merchant Name or Transaction Description', 'l', True), (560, '$ Amount', 'r', True)])
    d.line([(40, 'PAYMENTS AND OTHER CREDITS', 'l', True)])
    for r in rows:
        if r['dir'] == 'in':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (130, r['desc'], 'l'), (560, '-' + m(r['amt']), 'r')])
    d.line([(40, 'PURCHASE', 'l', True)])
    for r in rows:
        if r['kind'] == 'charge':
            if 'LAURETT' in r['desc']:
                d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (130, 'ABC SUPPLY', 'l'), (560, m(r['amt']), 'r')])
                d.line([(130, '8382 LAURETT COVE', 'l')])
            else:
                d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (130, r['desc'], 'l'), (560, m(r['amt']), 'r')])
    d.line([(40, 'INTEREST CHARGED', 'l', True)])
    for r in rows:
        if r['kind'] == 'interest':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (130, r['desc'], 'l'), (560, m(r['amt']), 'r')])
    d.line([(40, 'TOTAL INTEREST FOR THIS PERIOD', 'l'), (560, '$' + m(intr), 'r')])
    d.blank()
    d.line([(40, 'INTEREST CHARGES', 'l', True)])
    d.line([(40, 'Balance Type', 'l'), (200, 'Annual Percentage Rate (APR)', 'l'), (360, 'Balance Subject To Interest Rate', 'r'), (480, 'Interest Charges', 'r')])
    d.line([(40, 'Purchases', 'l'), (200, '20.49%(v)(d)', 'l'), (360, '$' + m(722.80), 'r'), (480, '$' + m(intr), 'r')])
    d.save()
    write('chase_card', 'card', rows, {'last4': '4421', 'bank': 'Chase', 'balanceCheck': True})


# 2. Amex — 3 pages, MM/DD/YY*, two-line merchants (city on the 2nd line), "-$" credits, sections across pages.
def amex():
    vend = [('HOME DEPOT 6620', 'MEMPHIS TN'), ('LOWES #01234 PO T724', 'HERNANDO MS'), ('SUNBELT RENTALS #512', 'MEMPHIS TN'),
            ('FERGUSON ENT #1440', 'MEMPHIS TN'), ('QT 1137', 'CORDOVA TN'), ('SHERWIN WILLIAMS 702', 'GERMANTOWN TN'),
            ('84 LUMBER 0451', 'OLIVE BRANCH MS'), ('ACE HARDWARE 9012', 'BARTLETT TN')]
    rows = []
    for i in range(46):
        v, city = vend[i % len(vend)]
        day = 15 + (i * 29) // 46
        mo, dd = (9, day) if day <= 30 else (10, day - 30)
        rows.append(dict(date='2026-%02d-%02d' % (mo, dd), desc=v + ' ' + city, amt=round(37.11 + i * 13.37, 2), dir='out', kind='charge', two=True))
    rows.insert(5, dict(date='2026-09-21', desc='AUTOPAY PAYMENT RECEIVED - THANK YOU', amt=3200.00, dir='in', kind='payment'))
    rows.insert(12, dict(date='2026-09-24', desc='HOME DEPOT 6620 MEMPHIS TN', amt=74.22, dir='in', kind='refund'))
    rows.sort(key=lambda r: r['date'])
    prev = 3200.00
    cred = tot(rows, ['payment', 'refund'])
    newc = tot(rows, ['charge'])
    new = round(prev - cred + newc, 2)
    d = Doc('amex_card', hdr([(40, 'American Express Business Gold Card', 'l', True), (40, 'Account Ending 7-31005', 'l', False),
                              (40, 'Closing Date 10/14/26', 'l', False)]))
    d.line([(40, 'Previous Balance', 'l'), (300, '$' + m(prev), 'r')])
    d.line([(40, 'Payments/Credits', 'l'), (300, '-$' + m(cred), 'r')])
    d.line([(40, 'New Charges', 'l'), (300, '+$' + m(newc), 'r')])
    d.line([(40, 'Fees', 'l'), (300, '+$0.00', 'r')])
    d.line([(40, 'Interest Charged', 'l'), (300, '+$0.00', 'r')])
    d.line([(40, 'New Balance', 'l'), (300, '$' + m(new), 'r')])
    d.line([(40, 'Payment Due Date 11/08/26', 'l')])
    d.blank()
    d.line([(40, 'Payments', 'l', True), (560, 'Amount', 'r', True)])
    for r in rows:
        if r['kind'] == 'payment':
            d.line([(40, us(r['date'], True) + '*', 'l'), (110, r['desc'], 'l'), (560, '-$' + m(r['amt']), 'r')])
    d.line([(40, 'Credits', 'l', True), (560, 'Amount', 'r', True)])
    for r in rows:
        if r['kind'] == 'refund':
            d.line([(40, us(r['date'], True), 'l'), (110, r['desc'].rsplit(' MEMPHIS', 1)[0], 'l'), (560, '-$' + m(r['amt']), 'r')])
            d.line([(110, 'MEMPHIS TN', 'l')])
    d.line([(40, 'New Charges', 'l', True)])
    d.line([(40, 'Summary', 'l')])
    d.line([(40, 'Total', 'l'), (560, '$' + m(newc), 'r')])
    d.line([(40, 'Detail', 'l', True), (560, 'Amount', 'r', True)])
    for r in rows:
        if r['kind'] == 'charge':
            v, city = r['desc'].rsplit(' ', 2)[0], ' '.join(r['desc'].rsplit(' ', 2)[1:])
            for vv, cc in vend:
                if r['desc'] == vv + ' ' + cc:
                    v, city = vv, cc
            d.line([(40, us(r['date'], True), 'l'), (110, v, 'l'), (560, '$' + m(r['amt']), 'r')])
            d.line([(110, city, 'l')])
    d.line([(40, 'Fees', 'l', True)])
    d.line([(40, 'Total Fees for this Period', 'l'), (560, '$0.00', 'r')])
    d.line([(40, 'Interest Charged', 'l', True)])
    d.line([(40, 'Total Interest Charged for this Period', 'l'), (560, '$0.00', 'r')])
    d.save()
    for r in rows:
        r.pop('two', None)
    write('amex_card', 'card', rows, {'last4': '1005', 'bank': 'Amex', 'pages': 3, 'balanceCheck': True})


def us(ymd, yy=False):
    return ymd[5:7] + '/' + ymd[8:10] + '/' + (ymd[2:4] if yy else ymd[0:4])


MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def mon(ymd):
    return MON[int(ymd[5:7]) - 1] + ' ' + str(int(ymd[8:10]))


# 3. Capital One — "Sep 18" month-name dates, Trans Date + Post Date, "- $" credits.
def capone():
    rows = [
        dict(date='2026-09-18', desc='THE HOME DEPOT 0512 MEMPHISTN', amt=77.25, dir='out', kind='charge'),
        dict(date='2026-09-20', desc='CAPITAL ONE AUTOPAY PYMT', amt=500.00, dir='in', kind='payment'),
        dict(date='2026-09-23', desc='SUNBELT RENTALS 0442 MEMPHIS TN', amt=389.00, dir='out', kind='charge'),
        dict(date='2026-10-02', desc='SUNBELT RENTALS 0442 CREDIT', amt=60.00, dir='in', kind='refund'),
        dict(date='2026-10-07', desc='VERIZON WRLS P0042 800-922-0204', amt=212.48, dir='out', kind='charge'),
        dict(date='2026-10-11', desc='GOOGLE *ADS4471923 CC@GOOGLE.COM', amt=450.00, dir='out', kind='charge'),
        dict(date='2026-10-12', desc='LATE FEE', amt=39.00, dir='out', kind='fee'),
    ]
    d = Doc('capone_card', hdr([(40, 'Capital One Spark Cash', 'l', True), (40, 'Account ending in 9902', 'l', False),
                                (40, 'Sep 15, 2026 - Oct 14, 2026 | 30 days in Billing Cycle', 'l', False)]))
    prev = 900.0
    cr = tot(rows, ['payment', 'refund'])
    tr = tot(rows, ['charge'])
    fee = tot(rows, ['fee'])
    d.line([(40, 'Previous Balance', 'l'), (150, 'Payments', 'l'), (260, 'Other Credits', 'l'), (360, 'Transactions', 'l'), (450, 'Fees Charged', 'l'), (540, 'New Balance', 'l')])
    d.line([(40, '$' + m(prev), 'l'), (150, '- $' + m(500), 'l'), (260, '- $' + m(60), 'l'), (360, '+ $' + m(tr), 'l'), (450, '+ $' + m(fee), 'l'), (540, '$' + m(round(prev - cr + tr + fee, 2)), 'l')])
    d.blank()
    d.line([(40, 'Transactions', 'l', True)])
    d.line([(40, 'Trans Date', 'l', True), (100, 'Post Date', 'l', True), (160, 'Description', 'l', True), (560, 'Amount', 'r', True)])
    d.line([(40, 'Payments, Credits and Adjustments', 'l', True)])
    for r in rows:
        if r['dir'] == 'in':
            d.line([(40, mon(r['date']), 'l'), (100, mon(r['date']), 'l'), (160, r['desc'], 'l'), (560, '- $' + m(r['amt']), 'r')])
    d.line([(40, 'Transactions', 'l', True)])
    for r in rows:
        if r['kind'] == 'charge':
            d.line([(40, mon(r['date']), 'l'), (100, mon(r['date']), 'l'), (160, r['desc'], 'l'), (560, '$' + m(r['amt']), 'r')])
    d.line([(40, 'Total Transactions for This Period', 'l'), (560, '$' + m(tr), 'r')])
    d.line([(40, 'Fees', 'l', True)])
    for r in rows:
        if r['kind'] == 'fee':
            d.line([(40, mon(r['date']), 'l'), (100, mon(r['date']), 'l'), (160, r['desc'], 'l'), (560, '$' + m(r['amt']), 'r')])
    d.line([(40, 'Total Fees for This Period', 'l'), (560, '$' + m(fee), 'r')])
    d.line([(40, 'Interest Charged', 'l', True)])
    d.line([(40, 'Total Interest for This Period', 'l'), (560, '$0.00', 'r')])
    d.save()
    write('capone_card', 'card', rows, {'last4': '9902', 'bank': 'Capital One', 'balanceCheck': True})


# 4. Citi — MM/DD Sale + Post dates, "Standard Purchases", credits "-$".
def citi():
    rows = [
        dict(date='2026-09-17', desc='FLOOR & DECOR #182 MEMPHIS TN', amt=1288.40, dir='out', kind='charge'),
        dict(date='2026-09-25', desc='ONLINE PAYMENT, THANK YOU', amt=2000.00, dir='in', kind='payment'),
        dict(date='2026-09-30', desc='FLOOR & DECOR #182 RETURN', amt=210.00, dir='in', kind='refund'),
        dict(date='2026-10-04', desc='WASTE MANAGEMENT DUMPSTER 8382 LAURETT COVE', amt=465.00, dir='out', kind='charge'),
        dict(date='2026-10-09', desc='CHICK-FIL-A #01822 MEMPHIS TN', amt=48.15, dir='out', kind='charge'),
    ]
    d = Doc('citi_card', hdr([(40, 'Citi Business Card', 'l', True), (40, 'Account number ending in: 3318', 'l', False),
                              (40, 'Billing Period: 09/15/26-10/14/26', 'l', False)]))
    pur = tot(rows, ['charge'])
    d.line([(40, 'Previous balance', 'l'), (300, '$2,000.00', 'r')])
    d.line([(40, 'Payments', 'l'), (300, '-$2,000.00', 'r')])
    d.line([(40, 'Credits', 'l'), (300, '-$210.00', 'r')])
    d.line([(40, 'Purchases', 'l'), (300, '+$' + m(pur), 'r')])
    d.line([(40, 'New balance', 'l'), (300, '$' + m(round(2000 - 2210 + pur, 2)), 'r')])
    d.blank()
    d.line([(40, 'Sale', 'l', True), (90, 'Post', 'l', True), (140, 'Description', 'l', True), (560, 'Amount', 'r', True)])
    d.line([(40, 'Payments, Credits and Adjustments', 'l', True)])
    for r in rows:
        if r['dir'] == 'in':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (90, r['date'][5:7] + '/' + r['date'][8:], 'l'), (140, r['desc'], 'l'), (560, '-$' + m(r['amt']), 'r')])
    d.line([(40, 'Standard Purchases', 'l', True)])
    for r in rows:
        if r['dir'] == 'out':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (90, r['date'][5:7] + '/' + r['date'][8:], 'l'), (140, r['desc'], 'l'), (560, '$' + m(r['amt']), 'r')])
    d.line([(40, 'Total Standard Purchases', 'l'), (560, '$' + m(pur), 'r')])
    d.save()
    write('citi_card', 'card', rows, {'last4': '3318', 'bank': 'Citi', 'balanceCheck': True})


# 5. Bank of America — Reference Number + Account Number columns (long digits that are NOT amounts / checks).
def bofa():
    rows = [
        dict(date='2026-09-16', desc='PAYMENT - THANK YOU', amt=1000.00, dir='in', kind='payment'),
        dict(date='2026-09-19', desc='JOHNSTONE SUPPLY 033 MEMPHIS TN', amt=642.18, dir='out', kind='charge'),
        dict(date='2026-09-27', desc='UNITED RENTALS 0J7 BARTLETT TN', amt=980.00, dir='out', kind='charge'),
        dict(date='2026-10-05', desc='MCDONALDS F1234 CORDOVA TN', amt=23.47, dir='out', kind='charge'),
        dict(date='2026-10-10', desc='FOREIGN TRANSACTION FEE', amt=1.25, dir='out', kind='fee'),
    ]
    d = Doc('bofa_card', hdr([(40, 'Bank of America Business Advantage', 'l', True), (40, 'Account# 4400 1234 5678 0077', 'l', False),
                              (40, 'September 15 - October 14, 2026', 'l', False)]))
    pur = tot(rows, ['charge'])
    fee = tot(rows, ['fee'])
    d.line([(40, 'Previous Balance', 'l'), (300, '$1,000.00', 'r')])
    d.line([(40, 'Payments and Other Credits', 'l'), (300, '-1,000.00', 'r')])
    d.line([(40, 'Purchases and Adjustments', 'l'), (300, m(pur), 'r')])
    d.line([(40, 'Fees Charged', 'l'), (300, m(fee), 'r')])
    d.line([(40, 'Interest Charged', 'l'), (300, '0.00', 'r')])
    d.line([(40, 'New Balance Total', 'l'), (300, '$' + m(round(pur + fee, 2)), 'r')])
    d.blank()
    d.line([(40, 'Transaction', 'l', True), (95, 'Posting', 'l', True), (150, 'Description', 'l', True), (380, 'Reference Number', 'l', True), (470, 'Account Number', 'l', True), (565, 'Amount', 'r', True)])
    d.line([(40, 'Payments and Other Credits', 'l', True)])
    i = 0
    for r in rows:
        i += 1
        if r['dir'] == 'in':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (95, r['date'][5:7] + '/' + r['date'][8:], 'l'), (150, r['desc'], 'l'), (380, '7444%04d' % i, 'l'), (470, '0077', 'l'), (565, '-' + m(r['amt']), 'r')])
    d.line([(40, 'TOTAL PAYMENTS AND OTHER CREDITS FOR THIS PERIOD', 'l'), (565, '-$' + m(1000), 'r')])
    d.line([(40, 'Purchases and Adjustments', 'l', True)])
    for r in rows:
        i += 1
        if r['kind'] == 'charge':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (95, r['date'][5:7] + '/' + r['date'][8:], 'l'), (150, r['desc'], 'l'), (380, '2469%04d' % i, 'l'), (470, '0077', 'l'), (565, m(r['amt']), 'r')])
    d.line([(40, 'TOTAL PURCHASES AND ADJUSTMENTS FOR THIS PERIOD', 'l'), (565, '$' + m(pur), 'r')])
    d.line([(40, 'Fees Charged', 'l', True)])
    for r in rows:
        if r['kind'] == 'fee':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (95, r['date'][5:7] + '/' + r['date'][8:], 'l'), (150, r['desc'], 'l'), (565, m(r['amt']), 'r')])
    d.line([(40, 'TOTAL FEES FOR THIS PERIOD', 'l'), (565, '$' + m(fee), 'r')])
    d.line([(40, 'Interest Charged', 'l', True)])
    d.line([(40, 'TOTAL INTEREST CHARGED FOR THIS PERIOD', 'l'), (565, '$0.00', 'r')])
    d.save()
    write('bofa_card', 'card', rows, {'last4': '0077', 'bank': 'Bank of America', 'balanceCheck': True})


# 6. Wells Fargo card — Credits and Charges in TWO columns (the side tells which).
def wfcard():
    rows = [
        dict(date='2026-09-16', desc='WINSUPPLY OF MEMPHIS', amt=318.92, dir='out', kind='charge'),
        dict(date='2026-09-22', desc='PAYMENT THANK YOU', amt=700.00, dir='in', kind='payment'),
        dict(date='2026-09-29', desc='WINSUPPLY OF MEMPHIS RETURN', amt=41.10, dir='in', kind='refund'),
        dict(date='2026-10-03', desc='SHELBY COUNTY PERMITS', amt=150.00, dir='out', kind='charge'),
        dict(date='2026-10-08', desc='AT&T*BILL PAYMENT', amt=189.33, dir='out', kind='charge'),
    ]
    d = Doc('wf_card', hdr([(40, 'Wells Fargo Business Platinum Card', 'l', True), (40, 'Account Number Ending in 6150', 'l', False),
                            (40, 'Statement Period 09/15/2026 to 10/14/2026', 'l', False)]))
    ch = tot(rows, ['charge'])
    d.line([(40, 'Previous Balance', 'l'), (300, '$700.00', 'r')])
    d.line([(40, 'Payments', 'l'), (300, '- $700.00', 'r')])
    d.line([(40, 'Other Credits', 'l'), (300, '- $41.10', 'r')])
    d.line([(40, 'Purchases, Balance Transfers & Other Charges', 'l'), (300, '+ $' + m(ch), 'r')])
    d.line([(40, 'New Balance', 'l'), (300, '$' + m(round(700 - 741.10 + ch, 2)), 'r')])
    d.blank()
    d.line([(40, 'Transaction Details', 'l', True)])
    d.line([(40, 'Trans', 'l', True), (80, 'Post', 'l', True), (120, 'Reference Number', 'l', True), (240, 'Description', 'l', True), (480, 'Credits', 'r', True), (560, 'Charges', 'r', True)])
    k = 0
    for r in rows:
        k += 1
        c = [(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (80, r['date'][5:7] + '/' + r['date'][8:], 'l'), (120, '55432%06d' % k, 'l'), (240, r['desc'], 'l')]
        c.append((480, m(r['amt']), 'r') if r['dir'] == 'in' else (560, m(r['amt']), 'r'))
        d.line(c)
    d.line([(40, 'TOTAL', 'l'), (480, m(741.10), 'r'), (560, m(ch), 'r')])
    d.save()
    write('wf_card', 'card', rows, {'last4': '6150', 'bank': 'Wells Fargo', 'balanceCheck': True})


# 7. Discover — a merchant Category column between the merchant and the amount.
def discover():
    rows = [
        dict(date='2026-09-18', desc='HOMEDEPOT.COM 8382 LAURETT COVE', amt=233.00, dir='out', kind='charge'),
        dict(date='2026-09-26', desc='INTERNET PAYMENT - THANK YOU', amt=400.00, dir='in', kind='payment'),
        dict(date='2026-10-01', desc='EXXONMOBIL 4471 HERNANDO MS', amt=72.80, dir='out', kind='charge'),
        dict(date='2026-10-06', desc='STAPLES 00123 MEMPHIS TN', amt=58.99, dir='out', kind='charge'),
    ]
    d = Doc('discover_card', hdr([(40, 'Discover it Business Card', 'l', True), (40, 'Account number ending in 2846', 'l', False),
                                  (40, 'Open to Close Date: 09/15/2026 - 10/14/2026', 'l', False)]))
    pur = tot(rows, ['charge'])
    d.line([(40, 'Previous Balance', 'l'), (300, '$400.00', 'r')])
    d.line([(40, 'Payments and Credits', 'l'), (300, '-$400.00', 'r')])
    d.line([(40, 'Purchases', 'l'), (300, '+$' + m(pur), 'r')])
    d.line([(40, 'New Balance', 'l'), (300, '$' + m(pur), 'r')])
    d.blank()
    d.line([(40, 'Trans. date', 'l', True), (110, 'Purchases', 'l', True), (380, 'Merchant Category', 'l', True), (565, 'Amount', 'r', True)])
    d.line([(40, 'Payments and Credits', 'l', True)])
    for r in rows:
        if r['dir'] == 'in':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (110, r['desc'], 'l'), (380, 'Payments and Credits', 'l'), (565, '-$' + m(r['amt']), 'r')])
    d.line([(40, 'Purchases', 'l', True)])
    cats = ['Home Improvement', 'Gasoline', 'Merchandise']
    i = 0
    for r in rows:
        if r['dir'] == 'out':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (110, r['desc'], 'l'), (380, cats[i % 3], 'l'), (565, '$' + m(r['amt']), 'r')])
            i += 1
    d.save()
    write('discover_card', 'card', rows, {'last4': '2846', 'bank': 'Discover', 'balanceCheck': True})


# 8. US Bank — Post Date first, Ref # column, credits with "CR" after the amount.
def usbank():
    rows = [
        dict(date='2026-09-17', desc='GRAINGER 912 MEMPHIS TN', amt=356.40, dir='out', kind='charge'),
        dict(date='2026-09-24', desc='PAYMENT THANK YOU', amt=600.00, dir='in', kind='payment'),
        dict(date='2026-10-02', desc='HAMPTON INN NASHVILLE', amt=189.00, dir='out', kind='charge'),
        dict(date='2026-10-04', desc='HAMPTON INN NASHVILLE ADJ', amt=20.00, dir='in', kind='refund'),
    ]
    d = Doc('usbank_card', hdr([(40, 'U.S. Bank Business Leverage Visa', 'l', True), (40, 'Account Number XXXX XXXX XXXX 5519', 'l', False),
                                (40, 'Statement Date: 10/14/2026', 'l', False), (40, 'Closing Date 10/14/2026', 'l', False)]))
    pur = tot(rows, ['charge'])
    d.line([(40, 'Previous Balance', 'l'), (300, '$600.00', 'r')])
    d.line([(40, 'Payments', 'l'), (300, '- $600.00', 'r')])
    d.line([(40, 'Other Credits', 'l'), (300, '- $20.00', 'r')])
    d.line([(40, 'Purchases and Other Debits', 'l'), (300, '+ $' + m(pur), 'r')])
    d.line([(40, 'New Balance', 'l'), (300, '$' + m(round(600 - 620 + pur, 2)), 'r')])
    d.blank()
    d.line([(40, 'Post Date', 'l', True), (95, 'Trans Date', 'l', True), (150, 'Ref #', 'l', True), (210, 'Transaction Description', 'l', True), (565, 'Amount', 'r', True)])
    d.line([(40, 'Payments and Other Credits', 'l', True)])
    k = 0
    for r in rows:
        k += 1
        if r['dir'] == 'in':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (95, r['date'][5:7] + '/' + r['date'][8:], 'l'), (150, '%04d' % (8800 + k), 'l'), (210, r['desc'], 'l'), (565, '$' + m(r['amt']) + 'CR', 'r')])
    d.line([(40, 'Purchases and Other Debits', 'l', True)])
    for r in rows:
        k += 1
        if r['dir'] == 'out':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (95, r['date'][5:7] + '/' + r['date'][8:], 'l'), (150, '%04d' % (8800 + k), 'l'), (210, r['desc'], 'l'), (565, '$' + m(r['amt']), 'r')])
    d.line([(40, 'TOTAL THIS PERIOD', 'l'), (565, '$' + m(pur), 'r')])
    d.save()
    write('usbank_card', 'card', rows, {'last4': '5519', 'bank': 'US Bank', 'balanceCheck': True})


# ───────────────────────────── BANKS ─────────────────────────────
def bank_summary(d, beg, dep, wd, end, lab=('Beginning Balance', 'Deposits and Other Credits', 'Withdrawals and Other Debits', 'Ending Balance')):
    d.line([(40, lab[0], 'l'), (300, '$' + m(beg), 'r')])
    d.line([(40, lab[1], 'l'), (300, '+' + m(dep), 'r')])
    d.line([(40, lab[2], 'l'), (300, '-' + m(wd), 'r')])
    d.line([(40, lab[3], 'l'), (300, '$' + m(end), 'r')])


def bt(rows):
    dep = round(sum(r['amt'] for r in rows if r['dir'] == 'in'), 2)
    wd = round(sum(r['amt'] for r in rows if r['dir'] == 'out'), 2)
    return dep, wd


# First Horizon — sections: Deposits & Other Credits / Checks (several per line) / Withdrawals & Other Debits / Daily Balances.
def firsthorizon():
    rows = [
        dict(date='2026-09-16', desc='DEPOSIT HOLLIS DEMO DRAW 1', amt=10000.00, dir='in', kind='deposit'),
        dict(date='2026-09-22', desc='MOBILE DEPOSIT', amt=2500.00, dir='in', kind='deposit'),
        dict(date='2026-09-18', desc='Check 1201', amt=1850.00, dir='out', kind='check', check='1201'),
        dict(date='2026-09-25', desc='Check 1202', amt=600.00, dir='out', kind='check', check='1202'),
        dict(date='2026-10-02', desc='Check 1204', amt=2275.50, dir='out', kind='check', check='1204'),
        dict(date='2026-09-19', desc='POS PURCHASE THE HOME DEPOT 6620 MEMPHIS TN', amt=112.40, dir='out', kind='withdrawal'),
        dict(date='2026-09-30', desc='ACH DEBIT INTUIT QUICKBOOKS ONLINE', amt=90.00, dir='out', kind='withdrawal'),
        dict(date='2026-10-05', desc='ONLINE TRANSFER TO CHASE CARD 4421 PAYMENT', amt=1500.00, dir='out', kind='transfer'),
        dict(date='2026-10-13', desc='SERVICE CHARGE', amt=15.00, dir='out', kind='withdrawal'),
    ]
    dep, wd = bt(rows)
    d = Doc('firsthorizon_bank', hdr([(40, 'FIRST HORIZON BANK', 'l', True), (40, 'GRAYCO DEMO LLC  Business Checking  Account Number: XXXXXX8832', 'l', False),
                                      (40, 'Statement Period 09/15/2026 through 10/14/2026', 'l', False)]))
    bank_summary(d, 5000.00, dep, wd, round(5000 + dep - wd, 2))
    d.blank()
    d.line([(40, 'Deposits & Other Credits', 'l', True)])
    d.line([(40, 'Date', 'l', True), (100, 'Description', 'l', True), (560, 'Amount', 'r', True)])
    for r in rows:
        if r['dir'] == 'in':
            d.line([(40, r['date'][5:7] + '-' + r['date'][8:], 'l'), (100, r['desc'], 'l'), (560, m(r['amt']), 'r')])
    d.line([(40, 'Total Deposits & Other Credits', 'l'), (560, m(dep), 'r')])
    d.line([(40, 'Checks', 'l', True)])
    d.line([(40, 'Check', 'l', True), (90, 'Date', 'l', True), (190, 'Amount', 'r', True), (240, 'Check', 'l', True), (290, 'Date', 'l', True), (390, 'Amount', 'r', True)])
    ck = [r for r in rows if r['kind'] == 'check']
    d.line([(40, '1201', 'l'), (90, '09-18', 'l'), (190, m(1850), 'r'), (240, '1202', 'l'), (290, '09-25', 'l'), (390, m(600), 'r')])
    d.line([(40, '1204*', 'l'), (90, '10-02', 'l'), (190, m(2275.50), 'r')])
    d.line([(40, '* gap in check sequence', 'l')])
    d.line([(40, 'Withdrawals & Other Debits', 'l', True)])
    d.line([(40, 'Date', 'l', True), (100, 'Description', 'l', True), (560, 'Amount', 'r', True)])
    for r in rows:
        if r['dir'] == 'out' and r['kind'] != 'check':
            d.line([(40, r['date'][5:7] + '-' + r['date'][8:], 'l'), (100, r['desc'], 'l'), (560, m(r['amt']), 'r')])
    d.line([(40, 'Daily Balances', 'l', True)])
    d.line([(40, '09-16', 'l'), (160, m(15000), 'r'), (220, '09-18', 'l'), (340, m(13150), 'r'), (400, '09-19', 'l'), (520, m(13037.6), 'r')])
    d.save()
    write('firsthorizon_bank', 'bank', rows, {'last4': '8832', 'bank': 'First Horizon', 'balanceCheck': True})


# Regions — "DEPOSITS & CREDITS", "WITHDRAWALS", "FEES", "CHECKS" sections, MM/DD dates, amounts without $.
def regions():
    rows = [
        dict(date='2026-09-17', desc='Deposit Brent Demo', amt=8000.00, dir='in', kind='deposit'),
        dict(date='2026-09-21', desc='Card Purchase 09/20 Lowes #01234 PO T724 Hernando MS', amt=301.77, dir='out', kind='withdrawal'),
        dict(date='2026-09-28', desc='Zelle Transfer to Demo Painting Sub', amt=1200.00, dir='out', kind='withdrawal'),
        dict(date='2026-10-01', desc='Check 3301', amt=450.00, dir='out', kind='check', check='3301'),
        dict(date='2026-10-08', desc='Monthly Maintenance Fee', amt=12.00, dir='out', kind='withdrawal'),
    ]
    dep, wd = bt(rows)
    d = Doc('regions_bank', hdr([(40, 'REGIONS BANK', 'l', True), (40, 'LifeGreen Business Checking   Account # 0098-4417', 'l', False),
                                 (40, 'September 15, 2026 through October 14, 2026', 'l', False)]))
    d.line([(40, 'SUMMARY', 'l', True)])
    bank_summary(d, 1200.00, dep, wd, round(1200 + dep - wd, 2), ('Beginning Balance', 'Deposits & Credits', 'Withdrawals', 'Ending Balance'))
    d.blank()
    d.line([(40, 'DEPOSITS & CREDITS', 'l', True)])
    for r in rows:
        if r['dir'] == 'in':
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (100, r['desc'], 'l'), (560, m(r['amt']), 'r')])
    d.line([(40, 'WITHDRAWALS', 'l', True)])
    for r in rows:
        if r['kind'] == 'withdrawal' and 'Fee' not in r['desc']:
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (100, r['desc'], 'l'), (560, m(r['amt']), 'r')])
    d.line([(40, 'FEES', 'l', True)])
    for r in rows:
        if 'Fee' in r['desc']:
            d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (100, r['desc'], 'l'), (560, m(r['amt']), 'r')])
    d.line([(40, 'CHECKS', 'l', True)])
    d.line([(40, 'Date', 'l', True), (100, 'Check No.', 'l', True), (560, 'Amount', 'r', True)])
    d.line([(40, '10/01', 'l'), (100, '3301', 'l'), (560, m(450), 'r')])
    d.line([(40, 'DAILY BALANCE SUMMARY', 'l', True)])
    d.line([(40, '09/17', 'l'), (200, m(9200), 'r'), (260, '09/21', 'l'), (420, m(8898.23), 'r')])
    d.save()
    write('regions_bank', 'bank', rows, {'last4': '4417', 'bank': 'Regions', 'balanceCheck': True})


# Renasant — one transaction list: Date | Description | Debits | Credits | Balance (columns decide the side).
def renasant():
    rows = [
        dict(date='2026-09-16', desc='ACH CREDIT DEMO INSURANCE CO CLAIM PMT', amt=14250.00, dir='in', kind='deposit'),
        dict(date='2026-09-18', desc='DEBIT CARD ABC SUPPLY CO 8382 LAURETT COVE', amt=2311.08, dir='out', kind='withdrawal'),
        dict(date='2026-09-24', desc='CHECK 5512', amt=3000.00, dir='out', kind='check', check='5512'),
        dict(date='2026-10-03', desc='DEBIT CARD REPUBLIC SERVICES', amt=410.00, dir='out', kind='withdrawal'),
        dict(date='2026-10-10', desc='DEPOSIT', amt=1800.00, dir='in', kind='deposit'),
    ]
    dep, wd = bt(rows)
    d = Doc('renasant_bank', hdr([(40, 'Renasant Bank', 'l', True), (40, 'Commercial Checking  Account Number ******2290', 'l', False),
                                  (40, 'Statement Dates 9/15/26 thru 10/14/26', 'l', False)]))
    bank_summary(d, 3000.00, dep, wd, round(3000 + dep - wd, 2), ('Previous Balance', 'Deposits/Credits', 'Checks/Debits', 'Current Balance'))
    d.blank()
    d.line([(40, 'ACTIVITY', 'l', True)])
    d.line([(40, 'Date', 'l', True), (90, 'Description', 'l', True), (420, 'Debits', 'r', True), (490, 'Credits', 'r', True), (565, 'Balance', 'r', True)])
    bal = 3000.0
    for r in rows:
        bal = round(bal + (r['amt'] if r['dir'] == 'in' else -r['amt']), 2)
        c = [(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (90, r['desc'], 'l')]
        c.append((490, m(r['amt']), 'r') if r['dir'] == 'in' else (420, m(r['amt']), 'r'))
        c.append((565, m(bal), 'r'))
        d.line(c)
    d.save()
    write('renasant_bank', 'bank', rows, {'last4': '2290', 'bank': 'Renasant', 'balanceCheck': True})


# Simmons — one signed Amount column (withdrawals negative) + running Balance.
def simmons():
    rows = [
        dict(date='2026-09-16', desc='POS DEBIT SHERWIN WILLIAMS 702 GERMANTOWN', amt=219.66, dir='out', kind='withdrawal'),
        dict(date='2026-09-20', desc='REMOTE DEPOSIT', amt=4200.00, dir='in', kind='deposit'),
        dict(date='2026-09-29', desc='ACH WITHDRAWAL STATE FARM INSURANCE', amt=388.12, dir='out', kind='withdrawal'),
        dict(date='2026-10-06', desc='CHECK # 7781', amt=950.00, dir='out', kind='check', check='7781'),
    ]
    dep, wd = bt(rows)
    d = Doc('simmons_bank', hdr([(40, 'Simmons Bank', 'l', True), (40, 'Business Checking ending in 6604', 'l', False),
                                 (40, 'For the period 09/15/2026 to 10/14/2026', 'l', False)]))
    bank_summary(d, 900.00, dep, wd, round(900 + dep - wd, 2))
    d.blank()
    d.line([(40, 'Date', 'l', True), (100, 'Description', 'l', True), (470, 'Amount', 'r', True), (565, 'Balance', 'r', True)])
    bal = 900.0
    for r in rows:
        bal = round(bal + (r['amt'] if r['dir'] == 'in' else -r['amt']), 2)
        d.line([(40, us(r['date']), 'l'), (100, r['desc'], 'l'), (470, ('' if r['dir'] == 'in' else '-') + m(r['amt']), 'r'), (565, m(bal), 'r')])
    d.save()
    write('simmons_bank', 'bank', rows, {'last4': '6604', 'bank': 'Simmons', 'balanceCheck': True})


# Trustmark — "Deposits/Credits" and "Checks/Debits" sections, checks with "^".
def trustmark():
    rows = [
        dict(date='2026-09-18', desc='DEPOSIT', amt=6500.00, dir='in', kind='deposit'),
        dict(date='2026-09-19', desc='CHECK 2101', amt=1100.00, dir='out', kind='check', check='2101'),
        dict(date='2026-09-26', desc='DBT CRD BEACON BUILDING PROD MEMPHIS', amt=2804.55, dir='out', kind='withdrawal'),
        dict(date='2026-10-09', desc='CHECK 2102', amt=640.00, dir='out', kind='check', check='2102'),
    ]
    dep, wd = bt(rows)
    d = Doc('trustmark_bank', hdr([(40, 'TRUSTMARK NATIONAL BANK', 'l', True), (40, 'Account 4400019918', 'l', False),
                                   (40, 'Statement Period: 09/15/26 - 10/14/26', 'l', False)]))
    bank_summary(d, 500.00, dep, wd, round(500 + dep - wd, 2), ('Beginning Balance', 'Deposits/Credits', 'Checks/Debits', 'Ending Balance'))
    d.blank()
    d.line([(40, 'Deposits/Credits', 'l', True)])
    d.line([(40, 'Date', 'l', True), (100, 'Description', 'l', True), (560, 'Amount', 'r', True)])
    d.line([(40, '09/18', 'l'), (100, 'DEPOSIT', 'l'), (560, m(6500), 'r')])
    d.line([(40, 'Checks/Debits', 'l', True)])
    d.line([(40, 'Date', 'l', True), (100, 'Description', 'l', True), (560, 'Amount', 'r', True)])
    d.line([(40, '09/19', 'l'), (100, 'CHECK 2101 ^', 'l'), (560, m(1100), 'r')])
    d.line([(40, '09/26', 'l'), (100, 'DBT CRD BEACON BUILDING PROD', 'l'), (560, m(2804.55), 'r')])
    d.line([(100, 'MEMPHIS', 'l')])
    d.line([(40, '10/09', 'l'), (100, 'CHECK 2102 ^', 'l'), (560, m(640), 'r')])
    d.line([(40, '^ Indicates image of check available', 'l')])
    d.save()
    write('trustmark_bank', 'bank', rows, {'last4': '9918', 'bank': 'Trustmark', 'balanceCheck': True})


# Truist — "Deposits, credits and interest" / "Checks" (check # first) / "Other withdrawals, debits and service charges".
def truist():
    rows = [
        dict(date='2026-09-17', desc='DEPOSIT', amt=3000.00, dir='in', kind='deposit'),
        dict(date='2026-10-14', desc='INTEREST PAYMENT', amt=0.42, dir='in', kind='deposit'),
        dict(date='2026-09-23', desc='Check 4410', amt=725.00, dir='out', kind='check', check='4410'),
        dict(date='2026-10-01', desc='DEBIT CARD PURCHASE 84 LUMBER 0451 OLIVE BRANCH MS', amt=1290.10, dir='out', kind='withdrawal'),
        dict(date='2026-10-07', desc='BUSINESS TO BUSINESS ACH CITY OF MEMPHIS PERMIT', amt=225.00, dir='out', kind='withdrawal'),
    ]
    dep, wd = bt(rows)
    d = Doc('truist_bank', hdr([(40, 'TRUIST', 'l', True), (40, 'SIMPLE BUSINESS CHECKING 1100002251', 'l', False),
                                (40, 'Your previous balance as of 09/14/2026', 'l', False)]))
    d.line([(40, 'Your previous balance as of 09/14/2026', 'l'), (300, '$2,000.00', 'r')])
    d.line([(40, 'Checks', 'l'), (300, '- 725.00', 'r')])
    d.line([(40, 'Other withdrawals, debits and service charges', 'l'), (300, '- ' + m(1515.10), 'r')])
    d.line([(40, 'Deposits, credits and interest', 'l'), (300, '+ ' + m(dep), 'r')])
    d.line([(40, 'Your new balance as of 10/14/2026', 'l'), (300, '= $' + m(round(2000 + dep - wd, 2)), 'r')])
    d.blank()
    d.line([(40, 'Checks', 'l', True)])
    d.line([(40, 'DATE', 'l', True), (100, 'CHECK #', 'l', True), (300, 'AMOUNT($)', 'r', True)])
    d.line([(40, '09/23', 'l'), (100, '4410', 'l'), (300, m(725), 'r')])
    d.line([(40, 'Total checks', 'l'), (300, '= $725.00', 'r')])
    d.line([(40, 'Other withdrawals, debits and service charges', 'l', True)])
    d.line([(40, 'DATE', 'l', True), (100, 'DESCRIPTION', 'l', True), (560, 'AMOUNT($)', 'r', True)])
    d.line([(40, '10/01', 'l'), (100, 'DEBIT CARD PURCHASE 84 LUMBER 0451', 'l'), (560, m(1290.10), 'r')])
    d.line([(100, 'OLIVE BRANCH MS', 'l')])
    d.line([(40, '10/07', 'l'), (100, 'BUSINESS TO BUSINESS ACH CITY OF MEMPHIS', 'l'), (560, m(225), 'r')])
    d.line([(100, 'PERMIT', 'l')])
    d.line([(40, 'Total other withdrawals, debits and service charges', 'l'), (560, '= $' + m(1515.10), 'r')])
    d.line([(40, 'Deposits, credits and interest', 'l', True)])
    d.line([(40, 'DATE', 'l', True), (100, 'DESCRIPTION', 'l', True), (560, 'AMOUNT($)', 'r', True)])
    d.line([(40, '09/17', 'l'), (100, 'DEPOSIT', 'l'), (560, m(3000), 'r')])
    d.line([(40, '10/14', 'l'), (100, 'INTEREST PAYMENT', 'l'), (560, m(0.42), 'r')])
    d.line([(40, 'Total deposits, credits and interest', 'l'), (560, '= $' + m(dep), 'r')])
    d.save()
    write('truist_bank', 'bank', rows, {'last4': '2251', 'bank': 'Truist', 'balanceCheck': True})


# Independent Bank — Date | Description | Withdrawals | Deposits | Balance, two-line descriptions.
def independent():
    rows = [
        dict(date='2026-09-16', desc='ACH DEBIT GUARDIAN DEMO ROOFING SUPPLY INV 4471', amt=3120.00, dir='out', kind='withdrawal'),
        dict(date='2026-09-22', desc='WIRE TRANSFER IN DEMO PROPERTY MGMT', amt=22000.00, dir='in', kind='deposit'),
        dict(date='2026-10-02', desc='CHECK 9001', amt=5400.00, dir='out', kind='check', check='9001'),
        dict(date='2026-10-12', desc='ACH DEBIT HARTFORD INSURANCE GL POLICY', amt=612.35, dir='out', kind='withdrawal'),
    ]
    dep, wd = bt(rows)
    d = Doc('independent_bank', hdr([(40, 'Independent Bank', 'l', True), (40, 'Business Checking  Acct ending 3077', 'l', False),
                                     (40, 'Statement Period 09/15/2026 - 10/14/2026', 'l', False)]))
    bank_summary(d, 1000.00, dep, wd, round(1000 + dep - wd, 2))
    d.blank()
    d.line([(40, 'Date', 'l', True), (90, 'Description', 'l', True), (420, 'Withdrawals', 'r', True), (490, 'Deposits', 'r', True), (565, 'Balance', 'r', True)])
    d.line([(40, '09/15', 'l'), (90, 'Beginning Balance', 'l'), (565, m(1000), 'r')])
    bal = 1000.0
    for r in rows:
        bal = round(bal + (r['amt'] if r['dir'] == 'in' else -r['amt']), 2)
        words = r['desc'].split(' ')
        first, second = ' '.join(words[:3]), ' '.join(words[3:])
        c = [(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (90, first if second else r['desc'], 'l')]
        c.append((490, m(r['amt']), 'r') if r['dir'] == 'in' else (420, m(r['amt']), 'r'))
        c.append((565, m(bal), 'r'))
        d.line(c)
        if second:
            d.line([(90, second, 'l')])
    d.line([(40, '10/14', 'l'), (90, 'Ending Balance', 'l'), (565, m(bal), 'r')])
    d.save()
    write('independent_bank', 'bank', rows, {'last4': '3077', 'bank': 'Independent Bank', 'balanceCheck': True})


# Orion FCU — Dec→Jan rollover, Trans Date | Eff Date | Description | Amount (parentheses = withdrawal) | Balance.
def orion():
    rows = [
        dict(date='2025-12-18', desc='SHARE DRAFT 1050', amt=880.00, dir='out', kind='check', check='1050'),
        dict(date='2025-12-23', desc='DEPOSIT AT BRANCH', amt=5000.00, dir='in', kind='deposit'),
        dict(date='2025-12-30', desc='POS WITHDRAWAL MAPCO 3341 MEMPHIS TN', amt=58.20, dir='out', kind='withdrawal'),
        dict(date='2026-01-06', desc='ACH WITHDRAWAL SPECTRUM BUSINESS', amt=149.99, dir='out', kind='withdrawal'),
        dict(date='2026-01-12', desc='DIVIDEND', amt=1.15, dir='in', kind='deposit'),
    ]
    dep, wd = bt(rows)
    d = Doc('orion_bank', hdr([(40, 'Orion Federal Credit Union', 'l', True), (40, 'Business Share Draft Account ****5120', 'l', False),
                               (40, 'Statement Period: 12/15/2025 - 01/14/2026', 'l', False)]))
    bank_summary(d, 300.00, dep, wd, round(300 + dep - wd, 2), ('Beginning Balance', 'Total Deposits', 'Total Withdrawals', 'Ending Balance'))
    d.blank()
    d.line([(40, 'Trans Date', 'l', True), (95, 'Eff Date', 'l', True), (150, 'Description', 'l', True), (470, 'Amount', 'r', True), (565, 'Balance', 'r', True)])
    bal = 300.0
    for r in rows:
        bal = round(bal + (r['amt'] if r['dir'] == 'in' else -r['amt']), 2)
        a = m(r['amt']) if r['dir'] == 'in' else '(' + m(r['amt']) + ')'
        d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (95, r['date'][5:7] + '/' + r['date'][8:], 'l'), (150, r['desc'], 'l'), (470, a, 'r'), (565, m(bal), 'r')])
    d.save()
    write('orion_bank', 'bank', rows, {'last4': '5120', 'bank': 'Orion FCU', 'balanceCheck': True})


# A statement whose lines do NOT add up to its printed totals (one line missing): the CRM must warn.
def mismatch():
    rows = [
        dict(date='2026-09-17', desc='THE HOME DEPOT #6620 MEMPHIS TN', amt=100.00, dir='out', kind='charge'),
        dict(date='2026-09-20', desc='LOWES #01234 MEMPHIS TN', amt=50.00, dir='out', kind='charge'),
    ]
    d = Doc('mismatch_card', hdr([(40, 'CHASE FREEDOM BUSINESS', 'l', True), (40, 'Account Number: XXXX XXXX XXXX 7777', 'l', False),
                                  (40, 'Opening/Closing Date 09/15/26 - 10/14/26', 'l', False)]))
    d.line([(40, 'Previous Balance', 'l'), (300, '$0.00', 'r')])
    d.line([(40, 'Purchases', 'l'), (300, '+$225.00', 'r')])
    d.line([(40, 'New Balance', 'l'), (300, '$225.00', 'r')])
    d.line([(40, 'PURCHASE', 'l', True)])
    for r in rows:
        d.line([(40, r['date'][5:7] + '/' + r['date'][8:], 'l'), (130, r['desc'], 'l'), (560, m(r['amt']), 'r')])
    d.save()
    write('mismatch_card', 'card', rows, {'last4': '7777', 'bank': 'Chase', 'mismatch': True})


def scan():
    """an image-only PDF (a photo of a statement): no text layer at all"""
    from PIL import Image, ImageDraw
    from reportlab.lib.utils import ImageReader
    img = Image.new('RGB', (1200, 1500), 'white')
    dr = ImageDraw.Draw(img)
    y = 60
    for t in ['DEMO BANK STATEMENT', '09/17  THE HOME DEPOT  100.00', '09/20  LOWES  50.00', 'NEW BALANCE 150.00']:
        dr.text((80, y), t, fill='black')
        y += 40
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    buf.seek(0)
    c = canvas.Canvas(os.path.join(OUT, 'scan.pdf'), pagesize=letter)
    c.drawImage(ImageReader(buf), 20, 20, width=572, height=752)
    c.showPage()
    c.save()


# ───────────────────── QuickBooks Online CSV exports ─────────────────────
def qbo():
    H = lambda title, period: 'GrayCo Demo LLC\n%s\n%s\n\n' % (title, period)
    foot = '\n\n"Accrual basis Friday, October 30, 2026 10:15 AM GMT-05:00"\n'
    files = {}
    files['qbo_transaction_detail_by_account.csv'] = H('Transaction Detail by Account', '"January 1 - December 31, 2025"') + '\n'.join([
        ',Date,Transaction Type,Num,Name,Memo/Description,Split,Amount,Balance',
        'Business Checking (8832),,,,,,,,',
        ',01/06/2025,Deposit,,Demo Qbo Client A,Draw 1,Accounts Receivable (A/R),"12,500.00","12,500.00"',
        ',01/09/2025,Expense,,Demo Lumber Yard,Framing lumber,Job Materials,"-1,844.20","10,655.80"',
        ',02/14/2025,Check,1001,Demo Qbo Painter,Paint labor,Subcontractors,"(3,200.00)","7,455.80"',
        'Total for Business Checking (8832),,,,,,,"$7,455.80",',
        'Accounts Receivable (A/R),,,,,,,,',
        ',01/02/2025,Invoice,5001,Demo Qbo Client A,Roof replacement,-Split-,"25,000.00","25,000.00"',
        ',01/06/2025,Payment,,Demo Qbo Client A,,Business Checking (8832),"-12,500.00","12,500.00"',
        ',03/03/2025,Invoice,5002,Demo Qbo Client B,Gutters,Sales,"4,250.00","16,750.00"',
        'Total for Accounts Receivable (A/R),,,,,,,"$16,750.00",',
        'Sales,,,,,,,,',
        ',01/02/2025,Invoice,5001,Demo Qbo Client A,Shingles,Accounts Receivable (A/R),"18,000.00","18,000.00"',
        ',01/02/2025,Invoice,5001,Demo Qbo Client A,Labor,Accounts Receivable (A/R),"7,000.00","25,000.00"',
        'Total for Sales,,,,,,,"$25,000.00",',
        'TOTAL,,,,,,,"$49,205.80",']) + foot
    files['qbo_invoice_list.csv'] = H('Invoice List', '"All Dates"') + '\n'.join([
        'Date,Num,Customer,Due date,Memo/Description,Amount,Open balance,Status',
        '01/02/2025,5001,Demo Qbo Client A,02/01/2025,Roof replacement,"25,000.00",0.00,Paid',
        '03/03/2025,5002,Demo Qbo Client B,04/02/2025,Gutters,"4,250.00","4,250.00",Overdue',
        '06/15/2025,5003,Demo Qbo Client C,07/15/2025,Siding repair,"9,875.50","2,000.00",Partial',
        'TOTAL,,,,,"$39,125.50","$6,250.00",']) + foot
    files['qbo_bill_list.csv'] = H('Bill List', '"All Dates"') + '\n'.join([
        'Date,Num,Vendor,Due date,Memo/Description,Amount,Open balance',
        '01/20/2025,B-77,Demo Qbo Supplier,02/19/2025,Shingles,"6,410.00",0.00',
        '04/11/2025,B-91,Demo Qbo Supplier,05/11/2025,Underlayment,"1,120.75",0.00',
        'TOTAL,,,,,"$7,530.75",$0.00']) + foot
    files['qbo_customer_contact_list.csv'] = H('Customer Contact List', '') + '\n'.join([
        'Customer,Phone Numbers,Email,Full Name,Billing Address,Shipping Address',
        'Demo Qbo Client A,"Phone: (901) 555-0101",clienta@example.com,Ann Demo,"100 Demo St, Memphis, TN 38103",',
        'Demo Qbo Client B,"Mobile: (901) 555-0102",clientb@example.com,Bob Demo,"200 Demo Ave, Cordova, TN 38016",',
        'Demo Qbo Client C,,clientc@example.com,Cal Demo,"300 Demo Cv, Germantown, TN 38138",']) + foot
    files['qbo_vendor_contact_list.csv'] = H('Vendor Contact List', '') + '\n'.join([
        'Vendor,Phone Numbers,Email,Full Name,Address,Account #',
        'Demo Qbo Supplier,"Phone: (901) 555-0201",supplier@example.com,Sam Supply,"1 Yard Rd, Memphis, TN 38118",GC-1001',
        'Demo Qbo Painter,,painter@example.com,Pat Painter,,']) + foot
    files['qbo_transaction_list_by_date.csv'] = H('Transaction List by Date', '"January 1 - December 31, 2025"') + '\n'.join([
        'Date,Transaction type,Num,Posting,Name,Memo/Description,Account,Split,Amount',
        '01/02/2025,Invoice,5001,Yes,Demo Qbo Client A,Roof replacement,Accounts Receivable (A/R),-Split-,"25,000.00"',
        '01/06/2025,Payment,,Yes,Demo Qbo Client A,,Undeposited Funds,Accounts Receivable (A/R),"12,500.00"',
        '01/09/2025,Expense,,Yes,Demo Lumber Yard,Framing lumber,Business Checking (8832),Job Materials,"-1,844.20"',
        '01/20/2025,Bill,B-77,Yes,Demo Qbo Supplier,Shingles,Accounts Payable (A/P),Job Materials,"6,410.00"',
        '02/14/2025,Check,1001,Yes,Demo Qbo Painter,Paint labor,Business Checking (8832),Subcontractors,"(3,200.00)"',
        '03/03/2025,Invoice,5002,Yes,Demo Qbo Client B,Gutters,Accounts Receivable (A/R),Sales,"4,250.00"',
        '04/02/2025,Credit Card Expense,,Yes,Demo Gas Station,Fuel,Chase Ink (4421),Fuel,-61.50']) + foot
    for n, t in files.items():
        with open(os.path.join(OUT, n), 'w', newline='') as f:
            f.write(t.replace('\n', '\r\n'))


for f in [chase, amex, capone, citi, bofa, wfcard, discover, usbank, firsthorizon, regions, renasant, simmons, trustmark, truist, independent, orion, mismatch, scan, qbo]:
    f()
with open(os.path.join(OUT, 'index.json'), 'w') as f:
    json.dump(sorted(FIX.keys()), f)
print('fixtures:', len(FIX), 'statements + scan.pdf + QuickBooks CSVs in', OUT)
