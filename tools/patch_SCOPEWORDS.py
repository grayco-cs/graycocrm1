r"""Idempotent patch SCOPEWORDS: every scope the CRM writes is wording only — no prices.

  Owner 11/03: "NO prices on any scope, just the wording" … "if the existing scope builders put prices in a scope, fix
  them too." One shared helper, window._gcScopeWords(textOrLines[, { lines: true }]), strips every amount the same way:
  dollar figures, unit prices ("@ $65", "$45/hr"), "= $520" line totals, bare trailing money columns ("350.00 350.00"),
  and drops whole money lines (subtotal / total / tax / MS contractor's tax / balance / deposit / discount / O&P / payment).
  The descriptive wording stays (items, materials, areas, quantities such as "12 sheets").

  Builders changed (they put prices in a scope before):
    1. Estimate detail → Scope of Work → "Generate from estimate" (scopeFromEstimate): each trade line ended "= $x" —
       now wording only. Exposed as window._gcScopeFromEstimate(est) for ESTUPLOAD.
    2. The GrayCo proposal (_gcBuildGrayCoProposal — the estimate builder's "Save & Create Proposal", ESTIN's template
       version, the ⚙ Proposal template's {{SCOPE}}): each SCOPE OF WORK line ended " - $x" — now wording only.
       The proposal's total / MS-tax lines are the price section and stay.
    3. _gcEstimateToWord (the Word proposal): each scope row ended " = $x" — now wording only; its totals stay.
    4. ESTIN's signature-request scope line ("Scope: …", from the estimate's scope notes) — through the helper.
    5. The customer portal's estimate card (netlify/functions/portal.js): its "short scope" listed each section's
       amount — now the section names only (the card's total stays); a scope-notes line is stripped too.
  Left alone on purpose (prices kept): the sub Scope of Work / Subcontractor Agreement price lines and amount
  (scopeHTML's labor cost per trade, the sub portal), the proposal's price section and totals, the estimate itself.
  The leads' "scope with no prices" (_gcStripPrices / _gcScopeFromLines) already strips money; unchanged.

Every find-string must occur exactly the given number of times (else nothing is written).
Usage: python3 tools/patch_SCOPEWORDS.py [index.html]   (also patches netlify/functions/portal.js)
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_SCOPEWORDS__'

HELPER = r"""<script id="gc-patch-scopewords">
/* __GC_PATCH_SCOPEWORDS__ — one wording-only scope for every builder (owner 11/03: "NO prices on any scope, just the wording").
   window._gcScopeWords(text | [lines] [, { lines: true }]) → the text with every amount removed (or the cleaned lines).
   Removed: $ figures, unit prices (@ $65, $45/hr), "= $520" totals, trailing money columns, and whole money lines
   (subtotal, total, tax, contractor's tax, balance, deposit, discount, O&P, payment). Kept: the wording. */
(function(){
  'use strict';
  var MONEYLINE = /^\s*(?:[-•*·\d.)\s]*)(?:sub\s*-?\s*total|grand\s*total|total(?:\s+(?:amount|price|cost|due|estimate|contract|project|bid|with\b.*|of\b.*))?|the\s+total\b.*|(?:ms\s+|mississippi\s+)?contractor'?s?\s+tax|(?:state\s+|local\s+|sales\s+|material\s+)*tax(?:es)?|balance(?:\s+due)?|amount\s+due|deposit|down\s+payment|discount|o\s*&\s*p|overhead(?:\s*(?:and|&)\s*profit)?|profit|markup|payment(?:s)?|price|cost)\b/i;
  function one(v){
    var t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (MONEYLINE.test(t) && /\d/.test(t)) return '';
    var prev;
    do {
      prev = t;
      t = t.replace(/\s*@\s*\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:\/|per)\s*[a-z]+\.?)?/gi, '')                  /* @ $65, @ 65/hr */
        .replace(/\s*=\s*\$?\s*-?\d[\d,]*(?:\.\d+)?/g, '')                                                    /* = $520 */
        .replace(/\(?\s*[$€£]\s?-?\d[\d,]*(?:\.\d+)?(?:\s*(?:\/|per)\s*[a-z]+\.?)?\s*\)?/gi, '')            /* $1,240.00, $45/hr */
        .replace(/\b(?:unit\s*price|price|cost|total|sub\s*total|amount|charge|rcv|acv|line\s*total)\s*[:=]?\s*-?\d[\d,]*(?:\.\d+)?/gi, '')
        .replace(/(?:\s+-?\d{1,3}(?:,\d{3})*\.\d{2}|\s+-?\d+\.\d{2})+\s*$/, '')                                 /* trailing money columns */
        .replace(/[\s:=\-–—|,;x×*\/]+$/i, '').replace(/^\s*[:=\-–—|,;]+\s*/, '')
        .replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
    } while (t !== prev);
    return /[A-Za-z]{2,}/.test(t) ? t : '';
  }
  function words(input, opt){
    opt = opt || {};
    var src = Array.isArray(input) ? input.map(function(x){ return x && typeof x === 'object' ? (x.desc || x.description || x.name || x.text || x.label || '') : x; })
      : String(input == null ? '' : input).split(/\r?\n/);
    var out = [];
    src.forEach(function(l){
      var raw = String(l == null ? '' : l), lead = (/^\s*((?:\d{1,2}[.)]|[-•*·])\s+)/.exec(raw) || ['', ''])[1];
      var w = one(raw.slice(lead.length));
      if (w) out.push(lead + w); else if (!s0(raw) && !opt.lines) out.push('');
    });
    var txt = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return opt.lines ? out.filter(Boolean) : txt;
  }
  function s0(v){ return String(v == null ? '' : v).trim(); }
  window._gcScopeWords = words;
  window._gcScopeWordsLine = one;
})();
</script>
"""

EDITS = [
    # 1. estimate detail → Generate scope
    ("      out.push((i+1)+'. '+t+' - '+(items.join('; '))+(sub?(' = '+money(sub)):''));",
     "      out.push((i+1)+'. '+t+' - '+(window._gcScopeWords ? window._gcScopeWords(items, { lines: true }) : items).join('; '));   /* patch SCOPEWORDS: wording only, no \"= $\" */",
     'estimate scope', 1),
    ("  // Ask Claude (via the existing proxy) to write a clean professional scope from the line items.",
     "  window._gcScopeFromEstimate = scopeFromEstimate;   /* patch SCOPEWORDS: the estimate's lines → a wording-only scope (ESTUPLOAD) */\n"
     "  // Ask Claude (via the existing proxy) to write a clean professional scope from the line items.",
     'expose scopeFromEstimate', 1),
    # 2. the GrayCo proposal's SCOPE OF WORK lines
    ("      return '<li style=\"margin:4px 0\"><b>'+esc(l.label)+'</b>'+(l.total? (' - <b>$'+money(l.total)+'</b>') : '')+'</li>';",
     "      return '<li style=\"margin:4px 0\"><b>'+esc(window._gcScopeWordsLine ? (window._gcScopeWordsLine(l.label) || l.label.replace(/[$][\\d,.]+/g, '')) : l.label)+'</b></li>';   /* patch SCOPEWORDS: no price on a scope line (the total is below) */",
     'proposal scope', 1),
    # 3. the Word proposal's scope rows
    ("      return '<p style=\"margin:2px 0 2px 40px;\"><b>'+(i+1)+'. '+esc(c.cat)+' = '+money(c.total)+'</b></p>';",
     "      return '<p style=\"margin:2px 0 2px 40px;\"><b>'+(i+1)+'. '+esc(c.cat)+'</b></p>';   /* patch SCOPEWORDS: no price on a scope row (the totals are below) */",
     'word scope', 1),
    # 4. ESTIN's signature-request scope line (two copies of the helper block)
    ("  var t = s(e.scopeNotes || e.description || sc.text); if (t) out.push({ l: 'Scope: ' + t.slice(0, 135) });",
     "  var t = s(e.scopeNotes || e.description || sc.text); if (t && W._gcScopeWords) t = s(W._gcScopeWords(t)).replace(/\\n+/g, ' · '); if (t) out.push({ l: 'Scope: ' + t.slice(0, 135) });   /* patch SCOPEWORDS */",
     'estin scope', 2),
]

src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
ANCH = '<script id="gc-patch-estin">'
assert src.count(ANCH) == 1, 'estin anchor'
for old, new, label, n in EDITS:
    c = src.count(old)
    assert c == n, ('anchor count', label, c, n)
for old, new, label, n in EDITS:
    src = src.replace(old, new)
src = src.replace(ANCH, HELPER + ANCH)
open(path, 'w', encoding='utf-8').write(src)
print('patched SCOPEWORDS')

# 5. the customer portal's estimate card (server)
pj = os.path.join(ROOT, 'netlify', 'functions', 'portal.js')
p = open(pj, encoding='utf-8').read()
if MARK in p:
    print('portal.js: already patched')
else:
    P = [("    let scope = order.slice(0, 14).map(function(c){ return { label: c, amount: groups[c] > 0 ? money(groups[c]) : null }; });",
          "    /* __GC_PATCH_SCOPEWORDS__: a scope is wording only — the sections, never their amounts (the card's total stays) */\n"
          "    let scope = order.slice(0, 14).map(function(c){ return { label: scopeWords(c) || c.replace(/[$][\\d,.]+/g, '').trim(), amount: null }; });"),
         ("    if (!scope.length) { const st = strip(e.scopeNotes || e.description || (e.scope && e.scope.text)); if (st) scope = [{ label: clip(st, 300), amount: null }]; }",
          "    if (!scope.length) { const st = scopeWords(strip(e.scopeNotes || e.description || (e.scope && e.scope.text))).replace(/\\n+/g, ' · '); if (st) scope = [{ label: clip(st, 300), amount: null }]; }"),
         ("  const strip = function(v){ return s(v).replace(COMMON_CARRIERS, 'your insurance company'); };",
          "  const strip = function(v){ return s(v).replace(COMMON_CARRIERS, 'your insurance company'); };\n"
          "  /* patch SCOPEWORDS: the same wording-only rule as window._gcScopeWords (index.html) */\n"
          "  const scopeWords = function(v){ return s(v).split(/\\r?\\n/).map(function(t){ t = t.replace(/\\s+/g, ' ').trim(); if (/^\\s*(?:sub\\s*-?\\s*total|grand\\s*total|total|tax|sales\\s*tax|balance|deposit|discount|payment|price|cost)\\b/i.test(t) && /\\d/.test(t)) return '';\n"
          "    let q; do { q = t; t = t.replace(/\\s*@\\s*\\$?\\s*\\d[\\d,]*(?:\\.\\d+)?(?:\\s*(?:\\/|per)\\s*[a-z]+\\.?)?/gi, '').replace(/\\s*=\\s*\\$?\\s*-?\\d[\\d,]*(?:\\.\\d+)?/g, '').replace(/\\(?\\s*[$]\\s?-?\\d[\\d,]*(?:\\.\\d+)?(?:\\s*(?:\\/|per)\\s*[a-z]+\\.?)?\\s*\\)?/gi, '').replace(/(?:\\s+-?\\d{1,3}(?:,\\d{3})*\\.\\d{2}|\\s+-?\\d+\\.\\d{2})+\\s*$/, '').replace(/[\\s:=\\-–—|,;x×*\\/]+$/i, '').replace(/\\s{2,}/g, ' ').trim(); } while (t !== q);\n"
          "    return /[A-Za-z]{2,}/.test(t) ? t : ''; }).filter(Boolean).join('\\n'); };")]
    for o, n in P:
        assert p.count(o) == 1, ('portal.js anchor', o[:60], p.count(o))
    for o, n in P:
        p = p.replace(o, n)
    open(pj, 'w', encoding='utf-8').write(p)
    print('portal.js: patched')
