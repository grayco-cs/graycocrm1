#!/usr/bin/env python3
"""Idempotent patch ESTMATH: honest, consistent line math in the Estimate Builder.

The owner, on "Hyatt Studios" (Olive Branch, Ms.): "not correct math here ... it's 6800 sheets". The screws line said
"$4806.72 + 9.75% tax = $5275.38 -> x1.25 = $6825.02" but 5,275.38 x 1.25 = 6,594.22. What it did not say:
  * the 3.5% Mississippi contractor tax: lineBaseCost() adds it to EVERY line (but man-hours) when the job is in MS
    (settings.jobState, from the address); "Base w/tax" and "Charge" included it, the text did not;
  * which margin: the line is on "type", so effMult() uses the estimate's JOB margin (x1.25 = commercial over $500k,
    20%) - not the material type default x1.4286 the pulldown named, and not a "material dflt" as the chip said.
  * the 48 boxes of screws were the drywall calculator's ceil(6,848 sheets x 35 screws / 5,000 per box) = 48.

  1. tools/estmath_block.js goes in right after lineCharge(): the line text names every factor in order (qty x unit,
     + sales tax, + MS contractor tax, x the margin really used with its name = charge); "Base" and "Charge" are the same
     numbers. The chip and the pulldown name the margin really used ("Job margin (1.25x)", "1.25x (job margin 20%)").
  2. Drywall screws are a takeoff: sheets x screws per board (48, editable per estimate) / screws per box (the item's
     pack size, asked once and saved on the item) = boxes, rounded up, at the item's price PER BOX (the calculator
     priced the whole lot at one box's price: cost = box price / boxes). Sheets change -> screws follow; a typed qty
     is kept and shown "overridden". Saved estimates figured at 35/board are not changed: "Math updated - review" and
     the new count beside the old until saved again.
  3. Totals: the summary's MS row is the MS tax really in the lines (it added 3.5% of man-hour lines' cost too, which
     lineBaseCost never charges); man-hour lines get their own "By type" row, so the rows add up to the total.
  4. "Save & Create Proposal" priced each line as lineCharge x qty (qty counted twice): now lineCharge.
  5. Opening a saved estimate kept only some fields of each line: man-hour and equipment lines came back as materials
     (taxed), the takeoff note was dropped. A builder line now keeps its own fields and type.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch ESTMATH */'
if MARK in t:
    print('ESTMATH: already patched'); sys.exit(0)


def once(src, a, b, n=1):
    c = src.count(a)
    assert c == n, 'ESTMATH: expected %d of %r, found %d' % (n, a[:90], c)
    return src.replace(a, b)


# ── 1. the helpers, right after lineCharge() ─────────────────────────────────────────────────────────────────
BLOCK = open(os.path.join(HERE, 'estmath_block.js'), encoding='utf-8').read().rstrip('\n')
LC = ("function lineCharge(line){\n"
      "  if((line.type||'labor')==='mh')return line.qty*(settings.mhCharge||75);\n"
      "  return lineBaseCost(line)*effMult(line);\n"
      "}\n")
t = once(t, LC, LC + MARK + '\n' + BLOCK + '\n')

# ── 2. the line: chip, pulldown, "Base" label, the full text, the takeoff row, the review banner ─────────────
ML = "const ml=_lineSet?`${em.toFixed(2)}x (this line)`:useOvr?`ovr ${ovrMult}x`:(!l.mult||l.mult==='type')?`${em.toFixed(2)}x (${l.type} dflt)`:`${em.toFixed(2)}x`;"
t = once(t, ML, "const ml=_gcMultChip(l);   " + MARK, 2)
t = once(t, "<option value=\"type\" ${!l.mult||l.mult==='type'?'selected':''}>Type default (${typeMultiplier(l.type||'labor')}x)</option>",
         "<option value=\"type\" ${!l.mult||l.mult==='type'?'selected':''}>${_gcTypeOptLabel(l)}</option>")
t = once(t, "onchange=\"ul('${l.id}','mult',this.value)\" title=\"Set this line's own margin (overrides the global override for this line)\">",
         "onchange=\"ul('${l.id}','mult',this.value)\" title=\"The margin this line is charged at. A margin set here wins; otherwise the Override when it is on; otherwise the job margin (top of the estimate); the type default (Settings) only when the job margin is By type.\">")
t = once(t, "<div style=\"font-size:9px;color:var(--text2)\">Base${isMat?' w/tax':''}</div>",
         "<div style=\"font-size:9px;color:var(--text2)\">Base${isMat?' w/tax':''}${settings.jobState==='MS'&&(l.type||'labor')!=='mh'?' + MS '+(settings.msContractorTax||3.5)+'%':''}</div>")
OLDTXT = ("        ${isMat?`<span style=\"color:var(--amber);font-size:10px\">${fmt(l.cost*l.qty)} + ${settings.tax}% tax = ${fmt(taxed(l.cost*l.qty))} -> x${em.toFixed(2)} = ${fmt(charge)}</span>`:''}\n"
          "              ${(l.type||'labor')==='mh'?`<span style=\"color:var(--teal);font-size:10px\">${l.qty} MH x $${l.cost}/hr cost -> $${settings.mhCharge||75}/hr charge = ${fmt(charge)}</span>`:''}\n")
t = once(t, OLDTXT, "        ${_gcLineMathHTML(l)}${_gcTkLineHTML(l)}   <!-- " + MARK + " -->\n")
t = once(t, "  wrap.innerHTML=lines.slice(0,_ebCap).map(l=>{try{",
         "  wrap.innerHTML=(window._gcMathBannerHTML?window._gcMathBannerHTML():'')+lines.slice(0,_ebCap).map(l=>{try{   " + MARK)

# ── 3. ul(): the takeoff follows the sheets; the text updates with the numbers ───────────────────────────────
t = once(t, "    v=String(_n);\n  }\n  l[f]=v;\n",
         "    v=String(_n);\n  }\n  l[f]=v;\n"
         "  var _gcTkRedraw=false; try{ _gcTkRedraw=!!(window._gcTkOnEdit&&window._gcTkOnEdit(l,f)); }catch(_te){}   " + MARK + "\n")
t = once(t, "          mlEl.textContent=ml;\n        }\n",
         "          mlEl.textContent=ml;\n        }\n"
         "        const mathEl=row.querySelector('[data-math]'); if(mathEl) mathEl.outerHTML=_gcLineMathHTML(l);   " + MARK + "\n")
t = once(t, "    // Also update summary + persist after short delay\n    clearTimeout(_saveTimer);",
         "    if(_gcTkRedraw){ try{ renderLines(); }catch(_re){} }   " + MARK + "\n"
         "    // Also update summary + persist after short delay\n    clearTimeout(_saveTimer);")

# ── 4. drywall calculator: screws per board, per box from the item, price per box, linked to the board line ──
t = once(t, "    allLines.push({desc:`Drywall${typeTag} ${sz.label}${areaTag}`,cost:matPre/(sheets||1),qty:sheets,unit:'sheet',cat:'Drywall',type:'material',mult:zMult,calcNote:`${DW_TYPE_LABELS[typeKey]||typeKey} pre-tax`});",
         "    allLines.push({desc:`Drywall${typeTag} ${sz.label}${areaTag}`,cost:matPre/(sheets||1),qty:sheets,unit:'sheet',cat:'Drywall',type:'material',mult:zMult,calcNote:`${DW_TYPE_LABELS[typeKey]||typeKey} pre-tax`,tkSrc:'dwz:'+z.id});   " + MARK)
t = once(t, "    const screwsPerSheet=35;\n",
         "    const screwsPerSheet=(window._gcScrewsPerBoard?window._gcScrewsPerBoard():48);   " + MARK + " // was 35\n")
t = once(t, "    let perBox=5000, boxCost=44.98;\n    if(screwBoxRM){\n      boxCost=screwBoxRM.cost||boxCost;\n      const cm=(screwBoxRM.desc||'').match(/([\\d,]{3,6})\\s*(?:ct|count|pc|piece)/i);\n      if(cm) perBox=parseFloat(cm[1].replace(/,/g,''))||perBox;\n    }\n",
         "    let perBox=5000, boxCost=44.98, packFrom='assumed';\n    if(screwBoxRM){\n      boxCost=screwBoxRM.cost||boxCost;\n"
         "      const cm=(screwBoxRM.desc||'').match(/([\\d,]{3,6})\\s*(?:ct|count|pc|piece)/i);\n"
         "      if(parseFloat(screwBoxRM.packSize)>0){ perBox=parseFloat(screwBoxRM.packSize); packFrom='item'; }   " + MARK + "\n"
         "      else if(cm){ perBox=parseFloat(cm[1].replace(/,/g,''))||perBox; packFrom='item'; }\n    }\n")
t = once(t, "    allLines.push({desc:`Drywall screws${areaTag}`,cost:boxCost/(screwBoxes||1),qty:screwBoxes,unit:'box',cat:'Drywall',type:'material',unit:'box',mult:zMult,calcNote:`${fmtN(sheets)} sheets × ${screwsPerSheet} = ${fmtN(totalScrews)} screws ÷ ${fmtN(perBox)}/box`});",
         "    /* " + "patch ESTMATH: the price is PER BOX (it was box price / boxes: the whole lot priced as one box) */\n"
         "    allLines.push({desc:`Drywall screws${areaTag}`,cost:boxCost,qty:screwBoxes,unit:'box',cat:'Drywall',type:'material',mult:zMult,calcNote:`${fmtN(sheets)} sheets × ${screwsPerSheet} = ${fmtN(totalScrews)} screws ÷ ${fmtN(perBox)}/box = ${fmtN(screwBoxes)} box${screwBoxes===1?'':'es'}`,"
         "takeoff:{rule:'dwScrews',src:'dwz:'+z.id,perBoard:screwsPerSheet,perBox:perBox,packFrom:packFrom,itemId:(screwBoxRM&&screwBoxRM.id)||'',itemDesc:(screwBoxRM&&screwBoxRM.desc)||''}});")
t = once(t, "Screws: '+fmtN(sheets*35)", "Screws: '+fmtN(sheets*(window._gcScrewsPerBoard?window._gcScrewsPerBoard():48))")
t = once(t, "  const newLines=allCalcLines.map(l=>({id:uid(),...l,mult:(_calcMult!=='type'?_calcMult:(l.mult||'type'))}));\n",
         "  const newLines=allCalcLines.map(l=>({id:uid(),...l,mult:(_calcMult!=='type'?_calcMult:(l.mult||'type'))}));\n"
         "  try{ if(window._gcTkLink) window._gcTkLink(newLines); }catch(_tk){}   " + MARK + "\n")

# ── 5. explicit Save = the estimate has been reviewed under the new math ─────────────────────────────────────
t = once(t, "function doSave(update){\n  closeModal('save-modal');saveSlotState();\n",
         "function doSave(update){\n  closeModal('save-modal');saveSlotState();\n"
         "  try{ if(window._gcMathOnSave) window._gcMathOnSave(); }catch(_ms){}   " + MARK + "\n")

# ── 6. summary: MS row = the MS tax really in the lines; man-hour lines have a row ───────────────────────────
t = once(t, "<span>⚠ MS contractor tax (${settings.msContractorTax||3.5}% on ALL lines)</span><span>${fmt(lines.reduce((s,l)=>{const b=(l.type||'labor')==='material'?taxed(l.cost*l.qty):l.cost*l.qty;return s+b*((settings.msContractorTax||3.5)/100);},0))}</span>",
         "<span>⚠ MS contractor tax (${settings.msContractorTax||3.5}% of each line's cost, before margin; not on man-hours)</span><span>${fmt(window._gcMsTaxTotal?window._gcMsTaxTotal():0)}</span>")
EQ = "    ${eqLines.length?`<div class=\"sr\"><span style=\"color:var(--text2)\">🚜 Equipment (${eqLines.length} lines)</span><span>${fmt(eqCharge)}</span></div>`:''}\n"
t = once(t, EQ, EQ + "    ${(function(){const _mh=lines.filter(l=>(l.type||'labor')==='mh');return _mh.length?`<div class=\"sr\"><span style=\"color:var(--text2)\">⏱ Man-hours (${_mh.length} lines)</span><span>${fmt(_mh.reduce((s,l)=>s+lineCharge(l),0))}</span></div>`:'';})()}   <!-- " + MARK + " -->\n")

# ── 7. Save & Create Proposal: a line's charge already includes its qty ──────────────────────────────────────
t = once(t, "        var charge=(typeof lineCharge==='function')?lineCharge(l)*qty:cost*qty;\n",
         "        var charge=(typeof lineCharge==='function')?lineCharge(l):cost*qty;   " + MARK + " // was lineCharge x qty\n")
t = once(t, "      totalCharge:_lines.reduce(function(s,l){ return s+((typeof lineCharge==='function')?lineCharge(l)*(parseFloat(l.qty)||1):(parseFloat(l.cost)||0)*(parseFloat(l.qty)||1)); },0)\n",
         "      totalCharge:_lines.reduce(function(s,l){ return s+((typeof lineCharge==='function')?lineCharge(l):(parseFloat(l.cost)||0)*(parseFloat(l.qty)||1)); },0)   " + MARK + "\n")

# ── 8. opening a saved estimate keeps each builder line's own fields and type ────────────────────────────────
t = once(t, "      return e.lines.map(function(l){ return toLine(l, null); }).filter(Boolean);\n    }\n    // 2) Separate materials / labor / subs arrays.",
         "      /* " + "patch ESTMATH: a builder line keeps its own fields (takeoff, calcNote) and type (man-hours / equipment came back as taxed materials) */\n"
         "      return e.lines.map(function(l){ var L=toLine(l, null); if(L && l && typeof l==='object' && l.id){ L=Object.assign({}, l, L); var _t=String(l.type||''); if(/^(labor|material|sub|equipment|mh)$/.test(_t)) L.type=_t; } return L; }).filter(Boolean);\n"
         "    }\n    // 2) Separate materials / labor / subs arrays.")

open(p, 'w', encoding='utf-8').write(t)
print('ESTMATH: patched')
