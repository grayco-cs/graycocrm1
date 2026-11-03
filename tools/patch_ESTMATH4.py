#!/usr/bin/env python3
"""Idempotent patch ESTMATH4: the Mississippi contractor's tax (3.5%) is charged ONCE, and only on MS jobs.

The Estimate Builder puts the 3.5% into every line's cost on an MS job (lineBaseCost, before the margin), so the
builder's grand total already carries it. The customer documents then added it AGAIN on top of that total:
  * the GrayCo-format proposal (_gcBuildGrayCoProposal: "Save & Create Proposal", Generate Proposal, 📄 Send estimate /
    the PDF, the portal's proposal — they all print through it): "Ms contractors tax (3.5%)" + "Total with contractors
    tax" = builder total x 1.035;
  * the Word proposal (_gcEstimateToWord): the same;
  * the contract (CONTRACT PRICE section): non-residential MS contracts over $10,000 showed "Total Including
    Contractor's Tax" = contract price x 1.035, while its own note (and the other contract text) says the tax is
    included in the price above.

Choice: KEEP the tax inside the lines and drop the extra line, because that is the only way the proposal total equals the
builder's grand total exactly (the builder applies 3.5% to cost before the margin, so the tax inside a line is
3.5% of its marked-up price / 1.035, not 3.5% of the price). The documents now say "Includes the Mississippi
contractor's tax (3.5%): $X" under the total. Only when an estimate's lines were NOT priced with the tax (an uploaded
proposal that listed it separately, or an estimate the MS check flagged after the fact: _msTaxApplied) is the tax still
added as its own line — once. Non-MS jobs: no MS tax anywhere.
"""
import sys

p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch ESTMATH4 */'
if MARK in t:
    print('ESTMATH4: already patched'); sys.exit(0)


def once(src, a, b):
    c = src.count(a)
    assert c == 1, 'ESTMATH4: expected 1 of %r, found %d' % (a[:90], c)
    return src.replace(a, b)


# ── 1. the GrayCo-format proposal ────────────────────────────────────────────────────────────────────────────
ISMS = "  function isMS(est){\n    var s=String((est&&(est.state||est.address))||'').toUpperCase();\n    return /\\bMS\\b|MISSISSIPPI/.test(s);\n  }\n"
t = once(t, ISMS, ISMS + r"""  /* patch ESTMATH4: are the estimate's prices ALREADY carrying the 3.5% (the builder adds it to every line's cost on
     an MS job)? The builder says so (msInLines), or the saved estimate's settings were MS when it was priced. An estimate
     the MS check flagged afterwards (_msTaxApplied) or an uploaded proposal that listed the tax apart does not. */
  function msInLines(est){
    if(!est) return false;
    if(est.msInLines === true) return true;
    if(est.msInLines === false) return false;
    return !!(est.settings && String(est.settings.jobState || '').toUpperCase() === 'MS') && est._msTaxApplied !== true;
  }
  window._gcProposalMsInLines = msInLines;
  /* the MS tax on a document whose (sub)total is `subtotal`: charged once */
  window._gcProposalMs = function(est, subtotal){
    est = est || {}; subtotal = parseFloat(subtotal) || 0;
    var rate = (est.settings && parseFloat(est.settings.msContractorTax) > 0 ? parseFloat(est.settings.msContractorTax) : 3.5) / 100;
    var inl = msInLines(est), ms = inl || isMS(est);
    if(!ms) return { ms: false, inLines: false, tax: 0, included: 0, grand: subtotal, rate: rate };
    if(!inl) return { ms: true, inLines: false, tax: subtotal * rate, included: 0, grand: subtotal * (1 + rate), rate: rate };
    var L = Array.isArray(est.lines) ? est.lines : [], withCharge = L.length && L.every(function(l){ return l && l.charge != null; });
    var mhRate = (est.settings && parseFloat(est.settings.mhCharge) > 0) ? parseFloat(est.settings.mhCharge) : 75;   /* man-hour lines carry no MS tax */
    var base = withCharge ? L.reduce(function(a, l){ return a + (String(l.type || '') === 'mh' ? 0 : (parseFloat(l.charge) || 0)); }, 0)
      : subtotal - L.reduce(function(a, l){ return a + (l && String(l.type || '') === 'mh' ? (parseFloat(l.qty) || 0) * mhRate : 0); }, 0);
    return { ms: true, inLines: true, tax: 0, included: base * rate / (1 + rate), grand: subtotal, rate: rate };
  };
""")
t = once(t, "    var ms = isMS(est);\n    var msTax = ms ? (subtotal*0.035) : 0;\n    var grand = subtotal + msTax;\n",
         "    var _msx = window._gcProposalMs(est, subtotal);   " + MARK + " // charged once: inside the lines, or as its own line\n"
         "    var ms = _msx.ms;\n    var msTax = _msx.tax;\n    var grand = _msx.grand;\n")
t = once(t, "      + (ms ? ('<div class=\"total\" style=\"font-size:11.5pt\">Ms contractors tax (3.5%) = $'+money(msTax)+'</div>'\n             +'<div class=\"total\">Total with contractors tax = $'+money(grand)+'</div>') : '')",
         "      + (ms && msTax ? ('<div class=\"total\" style=\"font-size:11.5pt\">Ms contractors tax (3.5%) = $'+money(msTax)+'</div>'\n             +'<div class=\"total\">Total with contractors tax = $'+money(grand)+'</div>')\n"
         "        : ms && _msx.inLines ? ('<div style=\"font-size:10.5pt;margin:-6px 0 12px\">Includes the Mississippi contractor\\u2019s tax (3.5%): $'+money(_msx.included)+'</div>') : '')")

# ── 2. the Word proposal ─────────────────────────────────────────────────────────────────────────────────────
t = once(t, "    var isMS = state==='MS' || /(,|\\s)MS(\\s|$|\\.)/.test(est.address||est.location||'');\n    var msTax = isMS ? subtotal*0.035 : 0;\n",
         "    var isMS = state==='MS' || /(,|\\s)MS(\\s|$|\\.)/.test(est.address||est.location||'');\n"
         "    var _msx = window._gcProposalMs ? window._gcProposalMs(est, subtotal) : null;   " + MARK + " // charged once\n"
         "    if(_msx && _msx.inLines) isMS = true;\n"
         "    var msTax = (isMS && !(_msx && _msx.inLines)) ? subtotal*((_msx&&_msx.rate)||0.035) : 0;\n")
t = once(t, "    +(msTax>0?('<br><p><b>Ms contractors tax = '+money(msTax)+'</b></p><br><p><b>Total with contractors tax = '+money(grand)+'</b></p>'):'')\n",
         "    +(msTax>0?('<br><p><b>Ms contractors tax = '+money(msTax)+'</b></p><br><p><b>Total with contractors tax = '+money(grand)+'</b></p>'):'')\n"
         "    +(_msx&&_msx.inLines?('<p>Includes the Mississippi contractor\\u2019s tax (3.5%): '+money(_msx.included)+'</p>'):'')   /* patch ESTMATH4 */\n")

# ── 3. the builder's two proposal buttons say the prices carry the tax ──────────────────────────────────────
t = once(t, "      lines:estLines,\n      totalCharge:totalCharge\n    };",
         "      lines:estLines,\n      totalCharge:totalCharge,\n"
         "      msInLines:settings.jobState==='MS', settings:{jobState:settings.jobState, msContractorTax:settings.msContractorTax}   " + MARK + "\n    };")
t = once(t, "      scope:Object.assign({}, scope),\n      lines:_lines.map(function(l){",
         "      scope:Object.assign({}, scope),\n"
         "      msInLines:settings.jobState==='MS', settings:{jobState:settings.jobState, msContractorTax:settings.msContractorTax},   " + MARK + "\n"
         "      lines:_lines.map(function(l){")

# ── 4. the contract: the tax is part of the contract price (as its note says), not added on top ─────────────
t = once(t, "          if(!_isResidential && _amt>10000){\n            var _tax=_amt*0.035; var _tot=_amt+_tax;\n",
         "          if(!_isResidential && _amt>10000){\n            var _tax=_amt*0.035/1.035; var _tot=_amt;   " + MARK + " // included in the price (it was added on top: x1.035)\n")
t = once(t, "              +'<tr><td style=\"width:55%\">Mississippi Contractor\\'s Tax (3.5% of contract price)</td><td style=\"text-align:right;font-weight:700\">'+fmt$(_tax)+'</td></tr>'\n"
            "              +'<tr><td><b>Total Including Contractor\\'s Tax</b></td><td style=\"text-align:right;font-weight:800;color:#1a3a5f\">'+fmt$(_tot)+'</td></tr>'\n",
         "              +'<tr><td style=\"width:55%\">Mississippi Contractor\\'s Tax (3.5%), included in the contract price</td><td style=\"text-align:right;font-weight:700\">'+fmt$(_tax)+'</td></tr>'\n"
         "              +'<tr><td><b>Total Contract Price (contractor\\'s tax included)</b></td><td style=\"text-align:right;font-weight:800;color:#1a3a5f\">'+fmt$(_tot)+'</td></tr>'\n")
open(p, 'w', encoding='utf-8').write(t)
print('ESTMATH4: patched')
