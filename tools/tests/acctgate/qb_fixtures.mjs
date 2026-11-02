// acctgate/qb_fixtures.mjs — SYNTHETIC QuickBooks Online CSV exports for test_ACCTGATE.mjs (made-up vendors, jobs and numbers).
// Laid out the way QuickBooks Online writes them: a 3-line header block (company · report · dates) and a blank line, the
// report's column row (QBO puts an empty first column for the indent), account / vendor section headings alone on their row,
// "Total for …" rows, a TOTAL row and the "Accrual basis <date>" footer. Amounts as QBO exports them: 1,284.50 · "$148.62" ·
// -212.00; a multi-line memo in quotes; blank rows; MM/DD/YYYY dates.
//
// THE COSTS (what the office must end up with on the books — each counted ONCE):
//   C1 10/03 ABC Supply Co          1,284.50  Job Materials      memo "Shingles, PO A101"            → job PO A101 (Materials)
//   C2 10/09 Shell Oil                 61.37  Fuel               memo "Fuel truck 2"                  → overhead / no job (Fuel)
//   C3 10/07 Agt Delta Gutter Co    2,400.00  Subcontractors     check 1207, memo names 1880 Wren Hollow Rd (2 lines) → job Q902 (Sub)
//   C4 10/22 Lowe's                   148.62  Job Materials      memo "PO Q902 trim"                  → job Q902 (Materials)
//   C5 10/12 Shelby County Code Enf.  175.00  Permits            memo "Permit 4471 Quarry Bend"      → job PO A101 (Permit)
//   C6 10/15 Agt Print Shop            96.40  Advertising        (P&L Detail only)                    → overhead
//   C7 10/18 Agt Landfill              85.00  Dump Fees          (P&L Detail only) memo "4471 Quarry Bend" → job PO A101 (Dump)
//   C8 10/24 Agt Rental Co            310.00  Equipment Rental   (Expenses by Vendor only) memo "1880 Wren Hollow" → job Q902 (Equipment)
//   not costs: the ABC return (-212.00, a credit), the customer deposit / invoice / payment (money in), card payment, totals.
export const COSTS = [
  { k: 'C1', date: '2026-10-03', vendor: 'ABC Supply Co', amount: 1284.50, cat: 'Materials', job: 'A101' },
  { k: 'C2', date: '2026-10-09', vendor: 'Shell Oil', amount: 61.37, cat: 'Fuel', job: '' },
  { k: 'C3', date: '2026-10-07', vendor: 'Agt Delta Gutter Co', amount: 2400.00, cat: 'Sub', job: 'Q902', ref: '1207' },
  { k: 'C4', date: '2026-10-22', vendor: "Lowe's", amount: 148.62, cat: 'Materials', job: 'Q902' },
  { k: 'C5', date: '2026-10-12', vendor: 'Shelby County Code Enforcement', amount: 175.00, cat: 'Permit', job: 'A101' },
  { k: 'C6', date: '2026-10-15', vendor: 'Agt Print Shop', amount: 96.40, cat: 'Overhead', job: '' },
  { k: 'C7', date: '2026-10-18', vendor: 'Agt Landfill', amount: 85.00, cat: 'Dump', job: 'A101' },
  { k: 'C8', date: '2026-10-24', vendor: 'Agt Rental Co', amount: 310.00, cat: 'Equipment', job: 'Q902' }
];
const HEAD = (title) => ['GrayCo Demo Construction LLC', title, 'October 1-31, 2026', ''];
const FOOT = ['', '', 'Accrual basis Sunday, November 1, 2026 09:14 PM GMT-06:00'];
const COLS = ',Date,Transaction Type,Num,Name,Memo/Description,Split,Amount,Balance';

/* Transaction Detail by Account: every account, so each card charge is listed twice (under the card — a liability, +) and
   under its expense account (+); each check under the bank (−) and its expense account (+). */
export function transactionDetailByAccount(){
  return HEAD('Transaction Detail by Account').concat([
    COLS,
    'Checking - Demo Bank 8832,,,,,,,,',
    ',10/07/2026,Check,1207,Agt Delta Gutter Co,"Gutters - 1880 Wren Hollow Rd\nprogress draw 1 of 2",Subcontractors,"-2,400.00","12,600.00"',
    ',10/12/2026,Expense,,Shelby County Code Enforcement,Permit 4471 Quarry Bend,Permits,-175.00,"12,425.00"',
    ',10/20/2026,Deposit,,Agt Hollis,Deposit - progress draw,Undeposited Funds,"5,000.00","17,425.00"',
    ',10/22/2026,Expense,,Lowe\'s,PO Q902 trim,Job Materials,-$148.62,"17,276.38"',
    ',10/28/2026,Credit Card Payment,,Chase,Card payment,Chase Ink 4421,"-1,133.87","16,142.51"',
    'Total for Checking - Demo Bank 8832,,,,,,,"$1,142.51",',
    ',,,,,,,,',
    'Chase Ink 4421,,,,,,,,',
    ',10/03/2026,Credit Card Expense,,ABC Supply Co,"Shingles, PO A101",Job Materials,"1,284.50","1,284.50"',
    ',10/09/2026,Credit Card Expense,,Shell Oil,Fuel truck 2,Fuel,61.37,"1,345.87"',
    ',10/14/2026,Credit Card Credit,,ABC Supply Co,Return - damaged bundle,Job Materials,-212.00,"1,133.87"',
    ',10/28/2026,Credit Card Payment,,Chase,Card payment,Checking - Demo Bank 8832,"-1,133.87",0.00',
    'Total for Chase Ink 4421,,,,,,,$0.00,',
    'Job Materials,,,,,,,,',
    ',10/03/2026,Credit Card Expense,,ABC Supply Co,"Shingles, PO A101",Chase Ink 4421,"1,284.50","1,284.50"',
    ',10/14/2026,Credit Card Credit,,ABC Supply Co,Return - damaged bundle,Chase Ink 4421,-212.00,"1,072.50"',
    ',10/22/2026,Expense,,Lowe\'s,PO Q902 trim,Checking - Demo Bank 8832,$148.62,"1,221.12"',
    'Total for Job Materials,,,,,,,"$1,221.12",',
    'Subcontractors,,,,,,,,',
    ',10/07/2026,Check,1207,Agt Delta Gutter Co,"Gutters - 1880 Wren Hollow Rd\nprogress draw 1 of 2",Checking - Demo Bank 8832,"2,400.00","2,400.00"',
    'Total for Subcontractors,,,,,,,"$2,400.00",',
    'Fuel,,,,,,,,',
    ',10/09/2026,Credit Card Expense,,Shell Oil,Fuel truck 2,Chase Ink 4421,61.37,61.37',
    'Total for Fuel,,,,,,,$61.37,',
    'Permits,,,,,,,,',
    ',10/12/2026,Expense,,Shelby County Code Enforcement,Permit 4471 Quarry Bend,Checking - Demo Bank 8832,175.00,175.00',
    'Total for Permits,,,,,,,$175.00,',
    '',
    'TOTAL,,,,,,,"$3,857.49",'
  ]).concat(FOOT).join('\r\n');
}
/* Profit and Loss Detail: income and expense accounts only (no bank / card side). */
export function profitAndLossDetail(){
  return HEAD('Profit and Loss Detail').concat([
    COLS,
    'Ordinary Income/Expenses,,,,,,,,',
    'Income,,,,,,,,',
    'Sales,,,,,,,,',
    ',10/20/2026,Invoice,1043,Agt Hollis,Progress draw,Accounts Receivable (A/R),"5,000.00","5,000.00"',
    'Total for Sales,,,,,,,"$5,000.00",',
    'Total for Income,,,,,,,"$5,000.00",',
    'Cost of Goods Sold,,,,,,,,',
    'Job Materials,,,,,,,,',
    ',10/03/2026,Credit Card Expense,,ABC Supply Co,"Shingles, PO A101",Chase Ink 4421,"1,284.50","1,284.50"',
    ',10/14/2026,Credit Card Credit,,ABC Supply Co,Return - damaged bundle,Chase Ink 4421,-212.00,"1,072.50"',
    ',10/22/2026,Expense,,Lowe\'s,PO Q902 trim,Checking - Demo Bank 8832,$148.62,"1,221.12"',
    'Total for Job Materials,,,,,,,"$1,221.12",',
    'Subcontractors,,,,,,,,',
    ',10/07/2026,Check,1207,Agt Delta Gutter Co,"Gutters - 1880 Wren Hollow Rd\nprogress draw 1 of 2",Checking - Demo Bank 8832,"2,400.00","2,400.00"',
    'Total for Subcontractors,,,,,,,"$2,400.00",',
    'Total for Cost of Goods Sold,,,,,,,"$3,621.12",',
    'Gross Profit,,,,,,,"$1,378.88",',
    'Expenses,,,,,,,,',
    'Advertising & Marketing,,,,,,,,',
    ',10/15/2026,Credit Card Expense,,Agt Print Shop,Yard signs,Chase Ink 4421,96.40,96.40',
    'Total for Advertising & Marketing,,,,,,,$96.40,',
    'Dump Fees,,,,,,,,',
    ',10/18/2026,Expense,,Agt Landfill,Dump - 4471 Quarry Bend,Checking - Demo Bank 8832,85.00,85.00',
    'Total for Dump Fees,,,,,,,$85.00,',
    'Fuel,,,,,,,,',
    ',10/09/2026,Credit Card Expense,,Shell Oil,Fuel truck 2,Chase Ink 4421,61.37,61.37',
    'Total for Fuel,,,,,,,$61.37,',
    'Permits,,,,,,,,',
    ',10/12/2026,Expense,,Shelby County Code Enforcement,Permit 4471 Quarry Bend,Checking - Demo Bank 8832,175.00,175.00',
    'Total for Permits,,,,,,,$175.00,',
    'Total for Expenses,,,,,,,$417.77,',
    'Net Operating Income,,,,,,,$961.11,',
    'Net Income,,,,,,,$961.11,'
  ]).concat(FOOT).join('\r\n');
}
/* Expenses by Vendor — QBO's own report is a SUMMARY (vendor · total, no dates) … */
export function expensesByVendorSummary(){
  return HEAD('Expenses by Vendor Summary').concat([
    ',Total',
    'ABC Supply Co,"1,072.50"', 'Agt Delta Gutter Co,"2,400.00"', 'Agt Landfill,85.00', 'Agt Print Shop,96.40', 'Agt Rental Co,310.00', "Lowe's,148.62", 'Shell Oil,61.37', 'Shelby County Code Enforcement,175.00',
    'TOTAL,"$4,348.89"'
  ]).concat(FOOT).join('\r\n');
}
/* … and its detail (the vendor heading, then each transaction; Account = the expense account, Split = the bank / card). */
export function expensesByVendorDetail(){
  return HEAD('Expenses by Vendor Detail').concat([
    ',Date,Transaction Type,Num,Memo/Description,Account,Split,Amount,Balance',
    'ABC Supply Co,,,,,,,,',
    ',10/03/2026,Credit Card Expense,,"Shingles, PO A101",Job Materials,Chase Ink 4421,"1,284.50","1,284.50"',
    ',10/14/2026,Credit Card Credit,,Return - damaged bundle,Job Materials,Chase Ink 4421,-212.00,"1,072.50"',
    'Total for ABC Supply Co,,,,,,,"$1,072.50",',
    'Agt Delta Gutter Co,,,,,,,,',
    ',10/07/2026,Check,1207,"Gutters - 1880 Wren Hollow Rd\nprogress draw 1 of 2",Subcontractors,Checking - Demo Bank 8832,"2,400.00","2,400.00"',
    'Total for Agt Delta Gutter Co,,,,,,,"$2,400.00",',
    'Agt Rental Co,,,,,,,,',
    ',10/24/2026,Expense,,Lift rental 1880 Wren Hollow,Equipment Rental,Checking - Demo Bank 8832,310.00,310.00',
    'Total for Agt Rental Co,,,,,,,$310.00,',
    ',,,,,,,,',
    "Lowe's,,,,,,,,",
    ',10/22/2026,Expense,,PO Q902 trim,Job Materials,Checking - Demo Bank 8832,$148.62,$148.62',
    "Total for Lowe's,,,,,,,$148.62,",
    'TOTAL,,,,,,,"$3,931.12",'
  ]).concat(FOOT).join('\r\n');
}
