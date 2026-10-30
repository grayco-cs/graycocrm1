#!/usr/bin/env python3
"""Idempotent patch STMTPDF (owner 10/30): "I will put credit cards bank statements and quickbooks csv in CRM today for office
to mess around with. Make sure all those buttons work for PDFs and pull the right data so I can match to jobs".

1. tools/stmtpdf_tail.js goes in as <script id="gc-patch-stmtpdf"> right AFTER gc-patch-money (before gc-patch-approrder):
   PDF card / bank statements read by position (pdf.js), one review window for cards and banks, duplicates caught;
2. patch MONEY's "💳 Import card statement" opens that window (window._gcMoneyImportUI); the To-Do gets 🏦 Import bank statement;
3. 💎: "🏦 Import bank statement" next to 💳 Import card statement; 🏦 Bank Accounts / Monthly Bank Check open the bank import
   with a plain "Ask Wesley to finish the database setup" for the office (window._gcStmtBankDoor);
4. the older doors send a PDF / a whole statement to the import: Expenses → 📊 CC Statement → 📁 Upload Statement,
   💳 Credit Card Transactions → Import statement, the Expense Center's PDF drop label, Monthly Bank Check's own file button;
5. 💎 → 📥 Import from QuickBooks (CSV) reads QuickBooks Online exports right: the running "Balance" of Transaction Detail by
   Account is not an open balance, account headings are accounts (not names), an invoice listed again per income line keeps
   its total, Bill List rows are bills (paid when their open balance is 0), "Oct 30, 2026" dates, more QBO column names /
   transaction types, "Phone: …" prefixes dropped.
Every find-string must occur exactly once. Usage: python3 tools/patch_STMTPDF.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'stmtpdf_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_STMTPDF__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '</script>' not in TAIL
assert '__GC_PATCH_MONEY__' in src, 'patch MONEY must be in first'
CARD_BTN = ("'<button type=\"button\" data-mn=\"import\" style=\"border:1px solid #1d4ed8;background:#fff;color:#1d4ed8;border-radius:8px;"
            "padding:7px 12px;font-weight:700;cursor:pointer\">💳 Import card statement</button>';")
EDITS = [
  # 1. the tail
  ('<script id="gc-patch-approrder">', '<script id="gc-patch-stmtpdf">\n' + TAIL + '\n</script>\n<script id="gc-patch-approrder">'),
  # 2. patch MONEY → the new window; the To-Do's bank button
  ("function openImport(){\n  var old = D.querySelector('.gc-money-imp'); if (old) old.remove();",
   "function openImport(o){\n  if (W._gcMoneyImportUI) return W._gcMoneyImportUI(o);   /* patch STMTPDF: PDF statements, cards and banks */\n  var old = D.querySelector('.gc-money-imp'); if (old) old.remove();"),
  (CARD_BTN, CARD_BTN[:-1] + " +\n    '<button type=\"button\" data-mn=\"bank\" style=\"border:1px solid #0f766e;background:#fff;color:#0f766e;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer\">🏦 Import bank statement</button>';   /* patch STMTPDF */"),
  ("if (b.getAttribute('data-mn') === 'needs') openNeeds(); else openImport(); }); }",
   "if (b.getAttribute('data-mn') === 'needs') openNeeds(); else openImport(b.getAttribute('data-mn') === 'bank' ? { mode: 'bank' } : null); }); }"),
  ("W._gcMoney = { parseStatement: parseStatement,",
   "W._gcMoneyRepaint = function(){ try { paint(true); } catch (e) {} };   /* patch STMTPDF */\nW._gcMoney = { parseStatement: parseStatement,"),
  ("Bank website → the card → Statements / Activity → Download → CSV. To-Do → 💳 Import card statement → pick the card → choose the file → Read → check the jobs → Import.",
   "Bank website → the card → Statements → download the PDF statement (or Activity → Download → CSV). To-Do → 💳 Import card statement → choose the file → check the lines, the totals and the jobs → Import. Bank accounts the same way with 🏦 Import bank statement."),
  # 3. 💎
  ('        { icon: "💳", label: "Import card statement", fn: function(){ window._gcOpenCardImport && window._gcOpenCardImport(); } },',
   '        { icon: "💳", label: "Import card statement", fn: function(){ window._gcOpenCardImport && window._gcOpenCardImport(); } },\n'
   '        { icon: "🏦", label: "Import bank statement", fn: function(){ window._gcOpenBankImport && window._gcOpenBankImport(); } },   /* patch STMTPDF */'),
  ('"Import card statement": "Money & Invoices",', '"Import card statement": "Money & Invoices", "Import bank statement": "Money & Invoices",'),
  ('label: "Bank Accounts", adminOnly: true, fn: function(){ window._gcOpenAccounts && window._gcOpenAccounts(); } },',
   'label: "Bank Accounts", adminOnly: true, fn: function(){ if (window._gcStmtBankDoor && window._gcStmtBankDoor("accounts")) return; window._gcOpenAccounts && window._gcOpenAccounts(); } },'),
  ('label: "Monthly Bank Check", adminOnly: true, fn: function(){ window._gcOpenBankReconcile && window._gcOpenBankReconcile(); } },',
   'label: "Monthly Bank Check", adminOnly: true, fn: function(){ if (window._gcStmtBankDoor && window._gcStmtBankDoor("recon")) return; window._gcOpenBankReconcile && window._gcOpenBankReconcile(); } },'),
  # 4. the older doors
  ('L&&y(L),Q.current&&(Q.current.value="")', 'L&&(window._gcStmtTakeFile&&window._gcStmtTakeFile(L,"card")||y(L)),Q.current&&(Q.current.value="")'),
  ("Upload your monthly CC statement (PDF, image, or CSV). AI will extract all transactions — then assign projects and approve each one for P&L.",
   "Upload your monthly CC statement. A PDF or CSV opens 💳 Import card statement (every line shown first, jobs suggested, duplicates caught); a photo of a statement is read by AI."),
  ('e.jsx("button",{style:ht,onClick:()=>_(!0),children:"+ Import CSV"})',
   'e.jsx("button",{style:{...ht,background:"#1d4ed8",color:"#fff"},onClick:()=>window._gcOpenCardImport&&window._gcOpenCardImport(),children:"💳 Import statement (PDF / CSV)"}),e.jsx("button",{style:ht,onClick:()=>_(!0),children:"+ Paste CSV"})'),
  ("AI reads every transaction</span>", "opens 💳 Import card statement (a photo: AI)</span>"),
  ("Export your bank statement as CSV (most banks: Transactions",
   "The bank\\u2019s PDF statement works too (it opens \\uD83C\\uDFE6 Import bank statement). Or export your bank statement as CSV (most banks: Transactions"),
  ("inp.type='file'; inp.accept='.csv,text/csv';\n        inp.onchange=function(ev){\n          var f=ev.target.files[0]; if(!f) return;\n          var rd=new FileReader();",
   "inp.type='file'; inp.accept='.csv,text/csv,.pdf,application/pdf';\n        inp.onchange=function(ev){\n          var f=ev.target.files[0]; if(!f) return;\n          if(window._gcStmtIsPdf && window._gcStmtIsPdf(f) && window._gcOpenBankImport){ ov.remove(); window._gcOpenBankImport({ file:f }); return; }   /* patch STMTPDF */\n          var rd=new FileReader();"),
  # 5. QuickBooks Online CSV
  ("  name:     ['name','customer','customer name','customer full name','vendor','vendor name','payee','display name','customer/project','client'],",
   "  name:     ['name','customer','customer name','customer full name','vendor','vendor name','payee','display name','customer/project','client','vendor display name','customer display name','payee name','customer/job'],"),
  ("  amount:   ['amount','total','total amount','invoice amount','debit','amount ($)'],",
   "  amount:   ['amount','total','total amount','invoice amount','debit','amount ($)','amount (usd)','total ($)','total (usd)'],"),
  ("  open:     ['open balance','balance','balance due','open bal'],", "  open:     ['open balance','balance','balance due','open bal','open balance (usd)'],"),
  ("  account:  ['account','split','category'],", "  account:  ['account','split','category','split account','distribution account','account name','account full name','item split account'],"),
  ("'vendor credit':'vendorcredit' };",
   "'vendor credit':'vendorcredit', 'credit card credit':'vendorcredit', 'cash expense':'expense', 'purchase':'expense', 'transfer':'journal', 'credit card payment':'journal', 'sales tax payment':'expense', 'payroll check':'expense' };   /* patch STMTPDF */"),
  ("  else if(/invoice list/.test(title)) kind='invoicelist';",
   "  else if(/invoice list/.test(title)) kind='invoicelist';\n  else if(/\\bbills? list\\b|unpaid bills|bill payment list/.test(title) || (m.type===undefined && /vendor|supplier/.test(nameH) && m.amount!==undefined)) kind='billlist';   /* patch STMTPDF: QuickBooks Bill List = bills, not client invoices */"),
  ("var KIND_LABEL={ transactions:'Transaction List by Date',", "var KIND_LABEL={ billlist:'Bill List', transactions:'Transaction List by Date',"),
  ("function parseQb(text){",
   "/* patch STMTPDF: \"Oct 30, 2026\" / \"October 30, 2026\" dates (some QuickBooks exports) */\n"
   "function qbDate(v){ var m=s(v).match(/^([A-Za-z]{3})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})/), M={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12}; if(!m||!M[low(m[1])]) return ''; return m[3]+'-'+('0'+M[low(m[1])]).slice(-2)+'-'+('0'+m[2]).slice(-2); }\n"
   "function parseQb(text){"),
  ("var m=d.map, recs=[], curName='';", "var m=d.map, recs=[], curName='', curAcct='';"),
  ("if(r.filter(function(x){ return x; }).length===1 && first && m.date!==undefined && !ymd(first)){ curName=first; continue; }",
   "if(r.filter(function(x){ return x; }).length===1 && first && m.date!==undefined && !ymd(first)){ if(d.kind==='transactions') curAcct=first; else curName=first; continue; }   /* patch STMTPDF: Transaction Detail by Account headings are accounts */"),
  ("rec.phone=g('phone');", "rec.phone=g('phone').replace(/^(phone|mobile|tel|work|home|main):\\s*/i,'');"),
  ("    if(d.kind==='salesbycustomer' && !t) rec.kind='invoice';",
   "    if(d.kind==='salesbycustomer' && !t) rec.kind='invoice';\n    if(d.kind==='billlist') rec.kind=/payment/.test(t)?'billpayment':(/credit/.test(t)?'vendorcredit':'bill');   /* patch STMTPDF */"),
  ("rec.qbType=g('type')||'Invoice';", "rec.qbType=g('type')||(d.kind==='billlist'?'Bill':'Invoice');"),
  ("rec.date=ymd(g('date')); rec.num=g('num').replace(/^#/,''); rec.name=g('name')||curName; rec.memo=g('memo'); rec.due=ymd(g('due'));",
   "rec.date=ymd(g('date'))||qbDate(g('date')); rec.num=g('num').replace(/^#/,''); rec.name=g('name')||curName; rec.memo=g('memo'); rec.due=ymd(g('due'))||qbDate(g('due'));"),
  ("var a=g('amount'); rec.amount=num(a); rec.open = g('open')!=='' ? num(g('open')) : null; rec.account=g('account'); rec.status=g('status');",
   "var a=g('amount'); rec.amount=num(a); rec.open = (g('open')!=='' && !(d.kind==='transactions' && /^balance$/i.test(s(d.headers[m.open])))) ? num(g('open')) : null; rec.account=(curAcct && /^split/i.test(s(d.headers[m.account]))) ? curAcct : (g('account')||curAcct); rec.status=g('status');   /* patch STMTPDF: a running Balance is not an open balance; the heading is the account, Split the other side */"),
  ("  /* Sales by Customer Detail: one invoice = several product lines → add them up per invoice number */",
   "  /* patch STMTPDF: Transaction Detail by Account lists an invoice under A/R (its total) and again under each income account\n"
   "     (its lines): keep the total, once */\n"
   "  if(d.kind==='transactions'){ var byK={}, keepR=[]; recs.forEach(function(r){ var k=r.key, big=/^(invoice|bill|salesreceipt|creditmemo)$/.test(r.kind); if(!big || !byK[k]){ if(big) byK[k]=r; keepR.push(r); return; } if(Math.abs(r.amount)>Math.abs(byK[k].amount)){ keepR[keepR.indexOf(byK[k])]=r; byK[k]=r; } }); recs=keepR; }\n"
   "  /* Sales by Customer Detail: one invoice = several product lines → add them up per invoice number */"),
  ("status:'received', source:'quickbooks', qbKey:r.key, by:'QuickBooks import' }; }",
   "status:(r.open===0?'paid':'received'), paid:(r.open===0)||undefined, openBalance:r.open!=null?r.open:undefined, source:'quickbooks', qbKey:r.key, by:'QuickBooks import' }; }   /* patch STMTPDF: a Bill List row with no open balance is paid */"),
]
for a, b in EDITS:
    assert src.count(a) == 1, ('find-string count != 1', a[:90], src.count(a))
    src = src.replace(a, b)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
