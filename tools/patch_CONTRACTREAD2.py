#!/usr/bin/env python3
"""patch CONTRACTREAD2 + DOCSCHED (owner 11/27): the contract price and the schedule are read from the documents ALREADY on the jobs
(not only at a ZIP import), and approved change orders show as part of the contract everywhere it is shown.

  python3 tools/patch_CONTRACTREAD2.py [index.html]

  · tools/zipimport_tail.js (the ZIPIMPORT / ZIPSCHED / CONTRACTREAD script, now with CONTRACTREAD2): replaces the body of
    <script id="gc-patch-zipimp">.
  · TENTPOST (tools/tentpost.js, same text in index.html): its card can say which document the tentative schedule came from, and it
    tells the reader which button was pressed (window.__gcTentDecided).
  · The money: the Projects list's Contract column says "incl. $X in change orders"; its sort uses contract + approved COs; a deleted
    change order never counts; the job page's money tiles show the same hint; the field strip and the PM's Job Financials sheet count
    approved change orders the same way (status approved, not one already folded into the contract by the old code: _filed).
Every anchor must occur exactly once. A re-run prints "already patched".
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'index.html')
src = open(path, encoding='utf-8').read()
if '/* patch CONTRACTREAD2 */' in src and 'patch CONTRACTREAD2 + DOCSCHED' in src:
    print('already patched'); sys.exit(0)

tail = open(os.path.join(HERE, 'zipimport_tail.js'), encoding='utf-8').read().rstrip('\n')
assert '</script' not in tail.lower(), 'no </script> inside the patch'
assert 'patch CONTRACTREAD2 + DOCSCHED' in tail
open_tag = '<script id="gc-patch-zipimp">\n'
assert src.count(open_tag) == 1, ('ZIPIMPORT script', src.count(open_tag))
a = src.index(open_tag) + len(open_tag)
b = src.index('\n</script>', a)
assert 'patch CONTRACTREAD' in src[a:b] and 'patch CONTRACTREAD2' not in src[a:b], 'the CONTRACTREAD script'
src = src[:a] + tail + src[b:]

def rep(old, new):
    global src
    n = src.count(old)
    assert n == 1, (n, old[:100])
    src = src.replace(old, new)

# ── TENTPOST: the document the tentative schedule came from; which button was pressed ──
TP = [
  ("function ask(pid, why){\n  var p = proj(pid); if (!p) return false;\n  var n = tentOf(pid).length; if (!n) return false;\n  OPEN[s(pid)] = { at: Date.now(), why: why || '' }; STATS.asked++;",
   "function ask(pid, why, info){\n  var p = proj(pid); if (!p) return false;\n  var n = tentOf(pid).length; if (!n) return false;\n  OPEN[s(pid)] = { at: Date.now(), why: why || '', info: info || null }; STATS.asked++;   /* patch CONTRACTREAD2: info = { file, n, readId } — a tentative schedule read from a job document */"),
  ("  return '<div class=\"t\">📅 <b>' + nm + '</b> has ' + n + ' tentative schedule item' + (n === 1 ? '' : 's') + '.</div>",
   "  var inf = OPEN[s(pid)] && OPEN[s(pid)].info;   /* patch CONTRACTREAD2 */\n  return '<div class=\"t\">' + (inf && inf.file ? '📅 Tentative schedule found in <b>' + esc(inf.file) + '</b> (' + n + ' item' + (n === 1 ? '' : 's') + ') for <b>' + nm + '</b>.' : '📅 <b>' + nm + '</b> has ' + n + ' tentative schedule item' + (n === 1 ? '' : 's') + '.') + '</div>"),
  ("  var a = b.getAttribute('data-tp'), pid = b.getAttribute('data-pid');\n  try {",
   "  var a = b.getAttribute('data-tp'), pid = b.getAttribute('data-pid');\n  var inf = (OPEN[s(pid)] || {}).info;   /* patch CONTRACTREAD2: the reader keeps the answer */\n  if (inf && /^(post|edit|later)$/.test(a)) { try { if (typeof W.__gcTentDecided === 'function') W.__gcTentDecided(pid, a, inf); } catch (x) { oops(x); } }\n  try {"),
]
tpj = os.path.join(HERE, 'tentpost.js')
tps = open(tpj, encoding='utf-8').read()
for o, n in TP:
    rep(o, n)
    if tps.count(n) == 1: continue   # tools/tentpost.js already carries it
    assert tps.count(o) == 1, ('tentpost.js', o[:80])
    tps = tps.replace(o, n)
open(tpj, 'w', encoding='utf-8').write(tps)

# ── the money: contract + approved change orders ──
# the job totals (Projects list, job page, PM views): a deleted change order never counts
rep('(hr||[]).forEach(function(c){if(c&&c.pid!=null&&!c._filed&&String(c.status||"").toLowerCase()==="approved"&&(c.pid in _cm))',
    '(hr||[]).forEach(function(c){if(c&&c.pid!=null&&c.deleted!==true&&!c._filed&&String(c.status||"").toLowerCase()==="approved"&&(c.pid in _cm))/* patch CONTRACTREAD2: + not deleted */')
rep('window._gcApprovedCOs=window._gcApprovedCOs||function(pid){var t=0;try{((window._crm&&window._crm.changeOrders)||[]).forEach(function(c){if(c&&c.pid===pid&&!c._filed&&',
    'window._gcApprovedCOs=window._gcApprovedCOs||function(pid){var t=0;try{((window._crm&&window._crm.changeOrders)||[]).forEach(function(c){if(c&&c.pid===pid&&c.deleted!==true&&!c._filed&&/* patch CONTRACTREAD2 */')
# Projects list: the Contract column's hint, and its sort by the total
rep('children:at.cos?e.jsxs("span",{children:[ue(at.contract),e.jsx("div",{style:{fontSize:9,color:u.tx2},children:"incl. COs "+ue(at.cos)})]}):ue(jt.contract)}',
    'children:at.cos?e.jsxs("span",{children:[ue(at.contract),e.jsx("div",{style:{fontSize:9,color:u.tx2},title:"Original contract "+ue(at.base)+" + approved change orders "+ue(at.cos),children:"incl. "+ue(at.cos)+" in change orders"})]}):ue(jt.contract)}/* patch CONTRACTREAD2 */')
rep('Tt==="contract"?(Mt=jt.contract||0,ln=at.contract||0,le*(Mt-ln))',
    'Tt==="contract"?(Mt=ji(jt.id).contract,ln=ji(at.id).contract,le*(Mt-ln))/* patch CONTRACTREAD2: the total */')
# the job page's money tiles: a hint line under a tile (h)
rep('children:G.l}),e.jsx("div",{style:{fontSize:15,fontWeight:700,color:G.c||u.tx},children:G.v})]},G.l))',
    'children:G.l}),e.jsx("div",{style:{fontSize:15,fontWeight:700,color:G.c||u.tx},children:G.v}),G.h?e.jsx("div",{"data-gc-tile-hint":"1",style:{fontSize:9,color:u.tx2,marginTop:1},children:G.h}):null/* patch CONTRACTREAD2 */]},G.l))')
rep("  else tiles.push({ l: cl, v: ue(kt.contract), c: (pipe && bid && Math.abs(bid.amount - co) > 1) ? '#d97706' : undefined });",
    "  else tiles.push({ l: cl, v: ue(kt.contract), c: (pipe && bid && Math.abs(bid.amount - co) > 1) ? '#d97706' : undefined, h: kt.cos ? 'incl. ' + ue(kt.cos) + ' in change orders' : undefined });   /* patch CONTRACTREAD2: h */")
# the field job page: the same change orders as the desk (approved, not deleted, not already folded in by the old code)
rep("var cos = arr(c.changeOrders || c.cos).filter(on), coOk = cos.filter(function(x){ return /approv|signed|accept|complete|paid/i.test(s(x.status)); });",
    "var cos = arr(c.changeOrders || c.cos).filter(on), coOk = cos.filter(function(x){ return /^approved$/i.test(s(x.status)) && !x._filed; });   /* patch CONTRACTREAD2: the desk's rule (was any approv/signed/accept/complete/paid, and _filed counted twice) */")
rep("  else h += cell(m.co ? 'Contract + COs' : 'Contract', usd(m.contract + (m.co || 0)));",
    "  else h += cell(m.co ? 'Contract · incl. ' + usd(m.co) + ' in change orders' : 'Contract', usd(m.contract + (m.co || 0)));   /* patch CONTRACTREAD2 */")
# the PM's 💰 Job Financials sheet: the contract with its approved change orders (the balance due was short by them)
rep("    var contract=parseFloat(job.contract||job.contractAmount)||0;\n    var invoices=(crm.invoices||crm.invs||[])",
    "    var _base=parseFloat(job.contract||job.contractAmount)||0,_cos=window._gcApprovedCOs?(window._gcApprovedCOs(job.id)||0):0,contract=Math.round((_base+_cos)*100)/100;   /* patch CONTRACTREAD2 */\n    var invoices=(crm.invoices||crm.invs||[])")
rep("      stat('CONTRACT',money(contract))+\n      stat('COLLECTED',money(collected),'#22c55e')+",
    "      stat(_cos?'CONTRACT + COs':'CONTRACT',money(contract)+(_cos?'<div style=\"font-size:11px;font-weight:600;color:#8fa8c4;margin-top:2px\">incl. '+money(_cos)+' in change orders</div>':''))+   /* patch CONTRACTREAD2 */\n      stat('COLLECTED',money(collected),'#22c55e')+")

open(path, 'w', encoding='utf-8').write(src)
print('CONTRACTREAD2 ok')
