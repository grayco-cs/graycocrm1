#!/usr/bin/env python3
"""patch ACCTFIX2 — the real money bugs found by tools/tests/test_ACCTGATE.mjs (coordinator 11/02). Idempotent: each part has
its own /* patch ACCTFIX2… */ marker and asserts every anchor exactly once; a re-run prints "already patched".
  A. tools/patch_ACCTFIX2.block.js → one <script id="gc-patch-acctfix2"> (window._gcCostGate / _gcCostCounts /
     _gcCostPending / _gcIsCostCredit / _gcDepositMatch / _gcStatement — see its header).
  B. APPROVAL GATES THE BOOKS: every place that adds up costs asks window._gcCostCounts(row) — the accounting P&L
     (_gcSpendRows: isSpend + isSpendAny, accrual and cash), _gcJobSpent / _gcTotalSpent, the job strip's Spent (React),
     _gcJobCostsSync + _gcJobExpenses (commission), JC job costing (expenses + sub bills), the expense inbox job P&L, the
     register report (DA), the To-Do over-budget alert, X12 budget health, marketing cost per job, the Projects screen
     cost, the company totals by year. Pending → "⏳ Waiting for approval $X" on the P&L, the job strip and the job P&L.
  C. CARD REFUNDS / CREDITS reduce the P&L and the job cost (they were dropped as "money in": direction 'in').
  D. BANK DEPOSITS → OPEN INVOICES: the bank import hands its deposits to window._gcDepositsFromStatement; certain ones
     join 💵 Payment matches (AUTAI addMatches); its confirm no longer rewrites the register for a line not in it.
  E. 📥 Expense inbox redraws after every import (see its part for the cause).
Usage: python3 tools/patch_ACCTFIX2.py [index.html]"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
src = open(path, encoding='utf-8').read()
BLOCK = open(os.path.join(HERE, 'patch_ACCTFIX2.block.js'), encoding='utf-8').read()
GATE = "(window._gcCostCounts&&!window._gcCostCounts({V}))"
def gate(v): return GATE.replace('{V}', v)

PARTS = []
# ── A. the shared block, before the first early script (runtime only; defined before anything adds up money) ──
A1 = '<script id="gc-patch-todoperf-early">'
PARTS.append(('__GC_PATCH_ACCTFIX2__', [(A1, '<script id="gc-patch-acctfix2">\n' + BLOCK + '\n</script>\n' + A1)]))

# ── B/C. the spend rows (accounting P&L, dashboard): gate + refunds are cost credits ──
B1 = ("    if(window._gcIsIncome && window._gcIsIncome(e)) return false;\n"
      "    if(e.isIncome===true || e.direction==='in') return false;\n"
      "    var hasJob = !!pidOf(e);\n")
B1n = ("    var _cc = !!(window._gcIsCostCredit && window._gcIsCostCredit(e));   /* patch ACCTFIX2-B1: a refund / credit takes money off; only approved costs count */\n"
       "    if(!_cc && window._gcIsIncome && window._gcIsIncome(e)) return false;\n"
       "    if(!_cc && (e.isIncome===true || e.direction==='in')) return false;\n"
       "    if(" + gate('e') + ") return false;\n"
       "    var hasJob = !!pidOf(e);\n")
B2 = ("    if(window._gcIsIncome && window._gcIsIncome(e)) return false;\n"
      "    if(e.isIncome===true || e.direction==='in') return false;\n"
      "    return true;\n  }\n")
B2n = ("    var _cc = !!(window._gcIsCostCredit && window._gcIsCostCredit(e));   /* patch ACCTFIX2-B1 */\n"
       "    if(!_cc && window._gcIsIncome && window._gcIsIncome(e)) return false;\n"
       "    if(!_cc && (e.isIncome===true || e.direction==='in')) return false;\n"
       "    if(" + gate('e') + ") return false;\n"
       "    return true;\n  }\n")
PARTS.append(('/* patch ACCTFIX2-B1:', [(B1, B1n), (B2, B2n)]))
C1 = "window._gcIsMoneyIn = function(e){\n  if(!e) return false;\n"
C1n = C1 + "  if(window._gcIsCostCredit && window._gcIsCostCredit(e)) return false;   /* patch ACCTFIX2-C1: a card refund / vendor credit is a cost credit, not money in */\n"
PARTS.append(('/* patch ACCTFIX2-C1:', [(C1, C1n)]))
# _gcJobSpent / _gcTotalSpent
B3 = "    if((e.status||'')==='denied' || (e.status||'')==='rejected') return false;\n    if(window._gcIsIncome && window._gcIsIncome(e)) return false; // draws/income are not spend\n"
B3n = ("    if((e.status||'')==='denied' || (e.status||'')==='rejected') return false;\n"
       "    if(" + gate('e') + ") return false;   /* patch ACCTFIX2-B3: approved costs only */\n"
       "    var _cc3 = !!(window._gcIsCostCredit && window._gcIsCostCredit(e));\n"
       "    if(!_cc3 && window._gcIsIncome && window._gcIsIncome(e)) return false; // draws/income are not spend\n")
PARTS.append(('/* patch ACCTFIX2-B3:', [(B3, B3n)]))
# the job strip's Spent (React ji): the gate, and a fresh map when an approval changes
B4 = 'if(!window.__gcSpentMap||window.__gcSpentMapSrc!==Ea){var _m=Object.create(null);for(var _k=0;_k<Ea.length;_k++){var _y=Ea[_k];if(!_y||_y.type==="mpo"||_y.status==="denied"||'
B4n = ('if(!window.__gcSpentMap||window.__gcSpentMapSrc!==Ea||window.__gcSpentMapVer!==window.__gcCostGateVer){window.__gcSpentMapVer=window.__gcCostGateVer;/* patch ACCTFIX2-B4 */var _m=Object.create(null);for(var _k=0;_k<Ea.length;_k++){var _y=Ea[_k];if(!_y||_y.type==="mpo"||_y.status==="denied"||' + gate('_y') + '||')
PARTS.append(('/* patch ACCTFIX2-B4 */', [(B4, B4n)]))
# commission engine: _gcJobCostsSync
B5 = "    var st=low(e.status); if(st==='void'||st==='rejected'||st==='excluded'||st==='denied') return;\n    var ty=low(e.type); if(ty==='payment'||ty==='mpo'||ty==='cardpayment'||ty==='income') return;\n"
B5n = B5.replace("    var ty=low(e.type);", "    if(" + gate('e') + ") return;   /* patch ACCTFIX2-B5 */\n    var ty=low(e.type);")
B6 = "    var st=low(b.status); if(st==='rejected'||st==='void'||st==='cancelled') return;\n    tot+=n(b.amt||b.amount);\n"
B6n = "    var st=low(b.status); if(st==='rejected'||st==='void'||st==='cancelled') return;\n    if(" + gate('b') + ") return;   /* patch ACCTFIX2-B5 */\n    tot+=n(b.amt||b.amount);\n"
PARTS.append(('/* patch ACCTFIX2-B5 */', [(B5, B5n), (B6, B6n)]))
# _gcJobExpenses
B7 = "      if(st==='void'||st==='rejected'||st==='excluded'||st==='denied') return;\n      var _ty=String(e.type||'').toLowerCase();"
B7n = "      if(st==='void'||st==='rejected'||st==='excluded'||st==='denied') return;\n      if(" + gate('e') + ") return;   /* patch ACCTFIX2-B7 */\n      var _ty=String(e.type||'').toLowerCase();"
B8 = "      if(st==='rejected'||st==='void'||st==='cancelled') return;\n      var amt=n(b.amt||b.amount);\n"
B8n = "      if(st==='rejected'||st==='void'||st==='cancelled') return;\n      if(" + gate('b') + ") return;   /* patch ACCTFIX2-B7 */\n      var amt=n(b.amt||b.amount);\n"
PARTS.append(('/* patch ACCTFIX2-B7 */', [(B7, B7n), (B8, B8n)]))
# JC job costing (budget / projected margin)
B9 = "      if (NOT_COST.test(low(e.status))) return;\n"
B9n = "      if (NOT_COST.test(low(e.status))) return;\n      if (" + gate('e') + ") return;   /* patch ACCTFIX2-B9 */\n"
B10 = "      if (/rejected|void|cancel/.test(low(b.status))) return;\n"
B10n = "      if (/rejected|void|cancel/.test(low(b.status))) return;\n      if (" + gate('b') + ") return;   /* patch ACCTFIX2-B9 */\n"
PARTS.append(('/* patch ACCTFIX2-B9 */', [(B9, B9n), (B10, B10n)]))
# the expense inbox job P&L (+ the waiting line)
B11 = "function spentRow(y){ return y && y.type !== 'mpo' && y.status !== 'denied' &&"
B11n = "function spentRow(y){ return y && y.type !== 'mpo' && y.status !== 'denied' && !" + gate('y') + " &&   /* patch ACCTFIX2-B11 */"
B12 = "    ' · Expenses ' + money(p.spent) + ' · Invoiced '"
B12n = "    ' · Expenses ' + money(p.spent) + (function(){ var w = W._gcCostPending ? W._gcCostPending(pid) : null; return w && w.total ? ' · <span data-acctfix2=\"waiting\" style=\"color:#b45309\">⏳ Waiting for approval ' + money(w.total) + '</span>' : ''; })() + ' · Invoiced '   /* patch ACCTFIX2-B11 */"
PARTS.append(('/* patch ACCTFIX2-B11 */', [(B11, B11n), (B12, B12n)]))
# the accounting P&L: the waiting line under Job costs (whole company view)
B13 = "    +'<tr class=\"h\"><td>Job costs</td><td class=\"n\">'+mcell(p.jobCosts,'pl:job')+'</td></tr>'\n"
B13n = B13 + "    +(function(){ try{ var w=(!pmv && window._gcCostPending)?window._gcCostPending():null; return w&&w.total?'<tr data-acctfix2=\"waiting\"><td class=\"ind\" style=\"color:#b45309\">⏳ Waiting for approval — not in costs ('+w.rows.length+')</td><td class=\"n\" style=\"color:#b45309\">'+money(w.total)+'</td></tr>':''; }catch(e){ return ''; } })()   /* patch ACCTFIX2-B13 */\n"
PARTS.append(('/* patch ACCTFIX2-B13 */', [(B13, B13n)]))
# the register report (DA) and the other raw sums
B14 = "    if(_st==='denied'||_st==='rejected'||_st==='void'||_st==='voided') return false;\n    // INCOME IS NOT AN EXPENSE"
B14n = "    if(_st==='denied'||_st==='rejected'||_st==='void'||_st==='voided') return false;\n    if(" + gate('r') + ") return false;   /* patch ACCTFIX2-B14 */\n    // INCOME IS NOT AN EXPENSE"
B15 = 'var expenses2=(crm.expenses||[]).filter(function(e2){return e2.pid===p.id}).reduce('
B15n = 'var expenses2=(crm.expenses||[]).filter(function(e2){return e2.pid===p.id&&!' + gate('e2') + '/* patch ACCTFIX2-B14 */}).reduce('
B16 = "spent = arr(ctx.expenses).filter(function(e){ return pidOf(e) === pid; }).reduce("
B16n = "spent = arr(ctx.expenses).filter(function(e){ return pidOf(e) === pid && !" + gate('e') + "; /* patch ACCTFIX2-B14 */ }).reduce("
B17 = "  arr(D.expenses).forEach(function(x){ if (deleted(x) || !x.pid || x.overhead) return; if (/payment|refund|transfer/.test(low(x.type))) return;"
B17n = "  arr(D.expenses).forEach(function(x){ if (deleted(x) || !x.pid || x.overhead) return; if (/payment|refund|transfer/.test(low(x.type))) return; if (" + gate('x') + ") return; /* patch ACCTFIX2-B14 */"
B18 = "var ex=(crm().expenses||[]).filter(function(x){return x&&x.pid===job.id&&x.status!=='denied'&&(window._gcIsSpend?"
B18n = "var ex=(crm().expenses||[]).filter(function(x){return x&&x.pid===job.id&&x.status!=='denied'&&!" + gate('x') + "/* patch ACCTFIX2-B14 */&&(window._gcIsSpend?"
PARTS.append(('/* patch ACCTFIX2-B14 */', [(B14, B14n), (B15, B15n), (B16, B16n), (B17, B17n), (B18, B18n, 2)]))
B19 = "e&&e.status!=='denied'&&e.type!=='mpo'"
B19n = "e&&e.status!=='denied'&&!" + gate('e') + "/* patch ACCTFIX2-B19 */&&e.type!=='mpo'"
PARTS.append(('/* patch ACCTFIX2-B19 */', [(B19, B19n, 2)]))

# ── D. bank deposits → 💵 Payment matches ──
D1 = "\nW._gcAUTAI = {\n"
D1n = ("\n/* patch ACCTFIX2-D1: bank-statement deposits that match an open invoice (window._gcDepositMatch) join this list */\n"
       "function addMatches(l){ var fresh = arr(l).filter(function(m){ return m && m.id && !PM.list.some(function(c){ return c.id === m.id; }); }); if (!fresh.length) return Promise.resolve(0); return kvAdd(PMK, fresh).then(function(){ PM.list = arr(lsGet(PMK)); paintPills(); return fresh.length; }); }" + D1)
D2 = "  apply: apply, payMatches: function(){ scanPayments(); return PM.list.slice(); },"
D2n = "  apply: apply, addMatches: addMatches, payMatches: function(){ scanPayments(); return PM.list.slice(); },"
D3 = "  /* the register line points at the invoice */\n  var reg = regList().map("
D3n = "  /* the register line points at the invoice — patch ACCTFIX2-D1: only when that line IS in the loaded register (a bank-statement\n     deposit match has none; an empty / unloaded register is never written back) */\n  if (!m.noReg && regList().some(function(x){ return regId(x) === m.regId; })) {\n  var reg = regList().map("
D4 = "  regPatchCloud(m.regId, reg.filter(function(x){ return regId(x) === m.regId; })[0]);\n"
D4n = D4 + "  }\n"
PARTS.append(('/* patch ACCTFIX2-D1:', [(D1, D1n), (D2, D2n), (D3, D3n), (D4, D4n)]))
D5 = ("      var dups = rows.filter(function(r){ return r.dup && importable(r, mode); }).length;\n"
      "      if (!pick.length && !dups) return;\n")
D5n = ("      var dups = rows.filter(function(r){ return r.dup && importable(r, mode); }).length;\n"
       "      var deps = (!card && W._gcDepositsFromStatement) ? rows.filter(function(r){ return r.dir === 'in' && r.kind === 'deposit'; }) : [];   /* patch ACCTFIX2-D5: deposits → open invoices */\n"
       "      if (!pick.length && !dups && !deps.length) return;\n")
D6 = ("      (card ? importCard(pick, dups) : importBank(pick, dups)).then(function(out){\n"
      "        q('prev').innerHTML = out;\n")
D6n = ("      (card ? importCard(pick, dups) : importBank(pick, dups).then(function(out){ return deps.length ? W._gcDepositsFromStatement(deps).then(function(m){ W._gcMoney && (W._gcMoney.lastDeposits = m); return out + W._gcDepositHtml(m); }, function(){ return out; }) : out; })).then(function(out){   /* patch ACCTFIX2-D5 */\n"
       "        q('prev').innerHTML = out;\n")
PARTS.append(('/* patch ACCTFIX2-D5:', [(D5, D5n), (D6, D6n)]))

# ── E. the 📥 Expense inbox redraws after every import. Cause: the two "what he is typing in" guards (NOTHING REDRAWS THE
#    SCREEN EXCEPT YOU, WHAT HE IS TYPING IN CANNOT BE TORN DOWN) count ANY <input> as typing — a FILE input too — so picking a
#    file held the inbox card for 90 s and its own redraw (the "rows added / duplicates" line, the new rows) was refused.
#    A file pick / a button-like input is not typing; and the inbox's redraw after the import is the person's own action. ──
E1 = "  try{ return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName||'') || el.isContentEditable===true); }\n"
E1n = "  try{ return !!el && ((/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName||'') && !(el.tagName==='INPUT' && /^(file|button|submit|reset|image)$/i.test(el.type||''))) || el.isContentEditable===true); }   /* patch ACCTFIX2-E1: a file pick is not typing */\n"
E2 = "      render();\n    }, function(e){ msg = '⚠ Could not read that file: ' + s(e && e.message || e); render(); });\n"
E2n = "      W.__GC_MANUAL_SAVE__ = true; try { render(); } finally { W.__GC_MANUAL_SAVE__ = false; }   /* patch ACCTFIX2-E1: her own import — always redrawn */\n    }, function(e){ msg = '⚠ Could not read that file: ' + s(e && e.message || e); W.__GC_MANUAL_SAVE__ = true; try { render(); } finally { W.__GC_MANUAL_SAVE__ = false; } });\n"
PARTS.append(('/* patch ACCTFIX2-E1:', [(E1, E1n, 2), (E2, E2n)]))

done = 0
for mark, edits in PARTS:
    if mark in src:
        continue
    for e in edits:
        a, b = e[0], e[1]; n = e[2] if len(e) > 2 else 1
        assert src.count(a) == n, ('anchor count', mark, a[:80], src.count(a), 'want', n)
    for e in edits:
        src = src.replace(e[0], e[1])
    done += 1
if not done:
    print('already patched'); sys.exit(0)
open(path, 'w', encoding='utf-8').write(src)
print('patched ACCTFIX2 (%d part(s))' % done)
