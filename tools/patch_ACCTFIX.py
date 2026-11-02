#!/usr/bin/env python3
"""patch ACCTFIX — small accounting fixes found by tools/tests/test_ACCTGATE.mjs (the office's accounting + approvals gate).
Idempotent: every part asserts its anchor exactly once and carries its own /* patch ACCTFIX-n */ marker; a re-run prints
"already patched".
  1. 💎 → Import from QuickBooks (CSV): a QuickBooks P&L Detail / Transaction report's summary lines ("Gross Profit",
     "Net Operating Income", "Net Income" — no date, no number, only an amount) were read as client INVOICES with no
     customer (history mode recorded them: revenue and A/R went up by $1,378.88 + $961.11 in the test). A transaction row
     without a date and without a number is not a transaction.
  2. 📥 Expense inbox (QuickBooks export → rows to put on jobs):
     a. Transaction Detail by Account lists a card charge (or a bill) twice — under the card / A/P account and under its
        expense account; both were imported (the test: $5,415.36 for $4,069.49 of costs). The two sides name each other
        (the section heading of one is the Split of the other): the earlier one (QuickBooks lists the bank / card / A/P
        accounts first) is dropped.
     b. In that report and in P&L Detail the section heading is the account and "Split" is the OTHER side (the bank /
        card), so every cost's category came out "Materials" (Subcontractors, Permits, Dump Fees … lost). The heading is
        used as the account there.
  3. The old ⚙️ Automation Inbox → "📊 QuickBooks Entries" upload (GC_AUTO.uploadQuickBooksCSV) took the export's first
     line (the company name) as the column names and read 0 rows of a real QuickBooks export into a browser-only list. It
     now hands the file to 📥 Expense inbox (the same reader, duplicates skipped, synced) and opens it.
Usage: python3 tools/patch_ACCTFIX.py [index.html]"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()

PARTS = []

# ── 1. patch J parseQb: summary lines are not invoices ──
A1 = "    if(!rec.date && !rec.num && !rec.amount) continue;\n"
B1 = A1 + "    if(d.kind==='transactions' && !rec.date && !rec.num) continue;   /* patch ACCTFIX-1: P&L Detail's \"Gross Profit\" / \"Net Income\" lines are not invoices */\n"
PARTS.append(('/* patch ACCTFIX-1', [(A1, B1)]))

# ── 2. 📥 Expense inbox parseQB: one cost once, the account from the heading ──
A2a = "  var sect = '', out = [], skipped = 0, inc = false, income = 0;   /* patch ACCT-1 */\n"
B2a = A2a + "  var accIsSplit = cAcc >= 0 && /^split/.test(low(rows[hi][cAcc]));   /* patch ACCTFIX-2: Split = the other side (bank / card), the heading = the account */\n"
A2b = "    var vendor = s(cN >= 0 ? r[cN] : '') || sect;\n    out.push({ date: d, amount: Math.round(a * 100) / 100, vendor: vendor, memo: s(cM >= 0 ? r[cM] : ''), ref: s(cR >= 0 ? r[cR] : ''), account: s(cAcc >= 0 ? r[cAcc] : ''), type: s(cT >= 0 ? r[cT] : ''), customer: s(cC >= 0 ? r[cC] : '') });\n"
B2b = ("    var vendor = s(cN >= 0 ? r[cN] : '') || sect;\n"
       "    var split = cAcc >= 0 ? s(r[cAcc]) : '', acct = (accIsSplit && cN >= 0 && sect) ? sect : split;   /* patch ACCTFIX-2 */\n"
       "    out.push({ date: d, amount: Math.round(a * 100) / 100, vendor: vendor, memo: s(cM >= 0 ? r[cM] : ''), ref: s(cR >= 0 ? r[cR] : ''), account: acct, type: s(cT >= 0 ? r[cT] : ''), customer: s(cC >= 0 ? r[cC] : ''), _sec: sect, _split: split });\n")
A2c = "  return { rows: out, credits: skipped, income: income };   /* patch ACCT-1 */\n"
B2c = ("  /* patch ACCTFIX-2: Transaction Detail by Account lists a card charge / bill under the card or A/P account AND under its expense\n"
       "     account (each side's Split names the other). QuickBooks lists the balance-sheet accounts first: the earlier twin is dropped. */\n"
       "  if (accIsSplit && cN >= 0) {\n"
       "    var drop = {};\n"
       "    out.forEach(function(x, i){ if (drop[i] || !x._sec) return; for (var j = i + 1; j < out.length; j++) { var y = out[j]; if (!drop[j] && y._sec && low(x._sec) === low(y._split) && low(y._sec) === low(x._split) && x.date === y.date && x.amount === y.amount && low(x.vendor) === low(y.vendor) && x.ref === y.ref) { drop[i] = 1; break; } } });\n"
       "    out = out.filter(function(x, i){ return !drop[i]; });\n"
       "  }\n"
       "  out.forEach(function(x){ delete x._sec; delete x._split; });\n" + A2c)
PARTS.append(('/* patch ACCTFIX-2', [(A2a, B2a), (A2b, B2b), (A2c, B2c)]))

# ── 3. the old Automation Inbox QuickBooks upload → 📥 Expense inbox ──
A3 = "    window.GC_AUTO.uploadQuickBooksCSV = function(file){\n"
B3 = (A3 +
      "      /* patch ACCTFIX-3: a QuickBooks export goes to 📥 Expense inbox (the reader below took the export's first line — the company\n"
      "         name — as the column names and read nothing) */\n"
      "      if (window._gcExp2 && window._gcExp2.parseQB && window._gcExp2.importRows && file && typeof file.text === 'function') {\n"
      "        file.text().then(function(t){\n"
      "          var p = window._gcExp2.parseQB(t); if (p.error) { alert('QuickBooks import: ' + p.error); return; }\n"
      "          var r = window._gcExp2.importRows(p.rows);\n"
      "          alert('QuickBooks export → 📥 Expense inbox: ' + r.added + ' row(s) added' + (r.duplicates ? ', ' + r.duplicates + ' already in (skipped)' : '') + (p.credits ? ', ' + p.credits + ' credit(s) skipped' : '') + '. Put each one on its job there.');\n"
      "          try { if (window._gcExpInbox) window._gcExpInbox(); } catch (e) {}\n"
      "        }, function(e){ alert('Could not read that file: ' + (e && e.message || e)); });\n"
      "        return;\n"
      "      }\n")
PARTS.append(('/* patch ACCTFIX-3', [(A3, B3)]))

done = 0
for mark, edits in PARTS:
    if mark in src:
        continue
    for a, b in edits:
        assert src.count(a) == 1, ('anchor count != 1', mark, a[:70], src.count(a))
    for a, b in edits:
        src = src.replace(a, b, 1)
    done += 1
if not done:
    print('already patched'); sys.exit(0)
open(path, 'w', encoding='utf-8').write(src)
print('patched ACCTFIX (%d part(s))' % done)
