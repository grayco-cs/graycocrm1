#!/usr/bin/env python3
"""Idempotent patch RATES30: the owner's new default labor rates in the Estimate Builder.
  - CMU mortar + fill labor $5.00 a block (the masonry calculator's labor box starts at 5; was 0 / optional)
  - Brick labor stays $0.45 a brick (already the default everywhere; nothing to change)
  - TPO: the calculator now starts on "TPO labor only -- $150/sq" (a labor line); membrane and adhesive /
    fasteners are still priced in their own boxes. The $950 / $650 installed (sub) choices and the $350 / $250
    labor-only choices stay in the menu. Labor-only choices now add a labor line (they added a sub line).
  - Metal roof labor $150/sq and TPO labor $150/sq as Rate Book rows (there is no metal roof calculator)
  - Residential (shingle) re-roof labor $65 a square (was $75): calcRo tear-off 1 layer + install and the
    multi-layer base, the Rate Book rows "Roofing tear off + install (1 layer)", "Roof labor" and the internal
    sheet's "Roof labor per square". New construction ($50) and each extra layer ($5) are unchanged.
  - Spray DTM (exposed structure) paint labor $50 a gallon (was $85). Epoxy floors stay $90.
  - The SAVED Rate Book: the two GrayCo default rows still at $75 move to $65 once (rows marked r30, never moved
    again); a price someone typed is never touched.
Runs after MARGIN12 and PAINT50. Usage: python3 tools/patch_RATES30.py [index.html]"""
import sys, base64
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = "/* patch RATES30: owner's default labor rates (CMU $5/block, TPO + metal $150/sq, re-roof $65/sq, DTM $50/gal) */"
if MARK in t: print('RATES30: already patched'); sys.exit(0)
assert "/* patch PAINT50: paint labor $50/gal by default */" in t, 'RATES30 runs after PAINT50'
assert "'1.25','1.2','1.2821'" in t, 'RATES30 runs after MARGIN12'

def once(old, new, s=None):
    global t
    src = t if s is None else s
    n = src.count(old); assert n == 1, ('RATES30 anchor count != 1', n, old[:90])
    out = src.replace(old, new)
    if s is None: t = out
    return out

# 1. the estimate screen's HTML (base64): CMU labor box + TPO type menu
A = "_estHTML=decodeURIComponent(escape(atob('"
assert t.count(A) == 1, ('RATES30 _estHTML', t.count(A))
i = t.index(A) + len(A); j = t.index("'", i)
h = base64.b64decode(t[i:j]).decode('utf-8')
h = once("""<div class="f"><label>Mortar + fill labor ($/block)</label>
            <input id="cmu-labor" type="number" value="0" step="0.25" min="0" placeholder="optional" oninput="calcMas()">""",
         """<div class="f"><label>Mortar + fill labor ($/block, default $5)</label>
            <input id="cmu-labor" type="number" value="5.00" step="0.25" min="0" placeholder="0 = no labor line" oninput="calcMas()">""", h)
h = once("""<select id="tpo-type" onchange="calcTpo()">
          <option value="950_mat_lab">Fully adhered — $950/sq (mat+labor bundled)</option>""",
         """<select id="tpo-type" onchange="calcTpo()">
          <option value="150_labor" selected>TPO labor only — $150/sq (membrane + accessories priced below)</option>
          <option value="950_mat_lab">Fully adhered — $950/sq (mat+labor bundled)</option>""", h)
t = t[:i] + base64.b64encode(h.encode('utf-8')).decode('ascii') + t[j:]

# 2. Rate Book defaults (SEED)
once("""  {desc:'CMU block filled',cost:6.50,unit:'per block',cat:'Masonry',type:'sub',notes:'labor + material',supplier:'GrayCo Default Rate'},
""", """  {desc:'CMU block filled',cost:6.50,unit:'per block',cat:'Masonry',type:'sub',notes:'labor + material',supplier:'GrayCo Default Rate'},
  {desc:'CMU mortar + fill labor',cost:5,unit:'per block',cat:'Masonry',type:'labor',notes:'labor only, block priced separately',supplier:'GrayCo Default Rate'},
""")
once("""  {desc:'TPO mechanically fastened',cost:650,unit:'per square',cat:'Roofing',type:'sub',notes:'',supplier:'GrayCo Default Rate'},
  {desc:'Roofing tear off + install (1 layer)',cost:75,unit:'per square',cat:'Roofing',type:'labor',notes:'re-roof 1 layer',supplier:'GrayCo Default Rate'},""",
"""  {desc:'TPO mechanically fastened',cost:650,unit:'per square',cat:'Roofing',type:'sub',notes:'',supplier:'GrayCo Default Rate'},
  {desc:'TPO install labor',cost:150,unit:'per square',cat:'Roofing',type:'labor',notes:'labor only, membrane + accessories priced separately',supplier:'GrayCo Default Rate'},
  {desc:'Metal roof install labor',cost:150,unit:'per square',cat:'Roofing',type:'labor',notes:'labor only, panels + trim priced separately',supplier:'GrayCo Default Rate'},
  {desc:'Roofing tear off + install (1 layer)',cost:65,unit:'per square',cat:'Roofing',type:'labor',notes:'re-roof 1 layer',supplier:'GrayCo Default Rate',r30:'2026-10-30'},""")
once("""  {desc:'Roof labor',cost:75,unit:'per square',cat:'Roofing',type:'labor',notes:'',supplier:'GrayCo Default Rate'},""",
     """  {desc:'Roof labor',cost:65,unit:'per square',cat:'Roofing',type:'labor',notes:'',supplier:'GrayCo Default Rate',r30:'2026-10-30'},""")

# 3. the saved Rate Book: rows still at the old GrayCo default move once (right after the default-rows merge)
once("""    if(_added>0){ try{ if(typeof saveRatesDB==='function') saveRatesDB(); }catch(e){} console.log('[GC] Restored '+_added+' default price-book items (incl. wood framing).'); }
  }catch(e){ console.warn('rate-book merge skipped', e); }
""", """    if(_added>0){ try{ if(typeof saveRatesDB==='function') saveRatesDB(); }catch(e){} console.log('[GC] Restored '+_added+' default price-book items (incl. wood framing).'); }
  }catch(e){ console.warn('rate-book merge skipped', e); }
  """ + MARK + """
  /* Re-roof labor is $65 a square now. A GrayCo default row still at the old $75 moves to $65 ONCE. Every row of these
     two names is marked r30 the first time, so it is never looked at again: a price someone typed (now or later,
     even $75) is kept exactly as typed. A moved row is dated today, so the company sync (newest date wins) carries
     it to the other computers. Saves through the normal rate-book save. */
  try{
    var _r30={'roofing tear off + install (1 layer)':[75,65],'roof labor':[75,65]}, _r30m=0, _r30n=0;
    (Array.isArray(rates)?rates:[]).forEach(function(r){
      if(!r||r.r30) return; var _o=_r30[String(r.desc||'').toLowerCase().trim()]; if(!_o) return;
      if(String(r.supplier||'')==='GrayCo Default Rate' && (r.type||'labor')==='labor' && Math.abs((parseFloat(r.cost)||0)-_o[0])<1e-9){ r.cost=_o[1]; r.date=new Date().toISOString().slice(0,10); _r30n++; }
      r.r30='2026-10-30'; _r30m++;
    });
    if(_r30m){ try{ if(typeof saveRatesDB==='function') saveRatesDB(); }catch(e){} console.log('[GC] RATES30: '+_r30n+' rate-book row(s) moved to the new $65/sq re-roof default ('+_r30m+' checked).'); }
  }catch(e){ console.warn('RATES30 rate-book update skipped', e); }
""")

# 4. the internal pricing sheet row the supplier import re-applies on every load
once("""  {desc:'Roof labor per square',cost:75.00,unit:'per square',cat:'Roofing',type:'labor',date:'2026-06-19',supplier:'GrayCo Internal Rate',notes:'GrayCo pricing sheet · reroof 1 layer'},""",
     """  {desc:'Roof labor per square',cost:65.00,unit:'per square',cat:'Roofing',type:'labor',date:'2026-10-30',supplier:'GrayCo Internal Rate',notes:'GrayCo pricing sheet · reroof 1 layer · owner $65/sq'},""")

# 5. re-roof calculator (calcRo): tear off 1 layer + install, and the multi-layer base, $75 -> $65
once("""  }else if(type==='reroof1'){
    const labor=sq*75;
    html=`<div class="cr sub">Re-roof  --  tear off 1 layer + install</div><div class="cr"><span style="color:var(--text2)">${sq} sq x $75/sq</span>""",
     """  }else if(type==='reroof1'){
    const labor=sq*65;
    html=`<div class="cr sub">Re-roof  --  tear off 1 layer + install</div><div class="cr"><span style="color:var(--text2)">${sq} sq x $65/sq</span>""")
once("""    lines2.push({desc:`Roofing tear off 1 layer + install  --  ${sq} sq`,cost:labor,qty:1,cat:'Roofing',type:'labor',calcNote:'$75/sq'});""",
     """    lines2.push({desc:`Roofing tear off 1 layer + install  --  ${sq} sq`,cost:labor,qty:1,cat:'Roofing',type:'labor',calcNote:'$65/sq'});""")
once("""    const baseTearoff=sq*75,extraTearoff=sq*extra*5,total=baseTearoff+extraTearoff;""",
     """    const baseTearoff=sq*65,extraTearoff=sq*extra*5,total=baseTearoff+extraTearoff;""")
once("""<span style="color:var(--text2)">Base (${sq} sq x $75)</span>""", """<span style="color:var(--text2)">Base (${sq} sq x $65)</span>""")
once("""calcNote:`$75/sq + $5/sq x ${extra} extra`});""", """calcNote:`$65/sq + $5/sq x ${extra} extra`});""")

# 6. TPO calculator: $150/sq labor-only is the default; labor-only choices add a labor line
once("""  const tpoTypeVal=qvs('tpo-type')||'950_mat_lab';
  const tpoParts=tpoTypeVal.split('_');
  const rate=parseFloat(tpoParts[0])||950;""", """  const tpoTypeVal=qvs('tpo-type')||'150_labor';
  const tpoParts=tpoTypeVal.split('_');
  const rate=parseFloat(tpoParts[0])||150;""")
once("""  const typeLabel=rate===950?'fully adhered':'mechanically fastened';
  let html=`<div class="cr"><span style="color:var(--text2)">${sq} sq labor (${typeLabel})</span><span>${fmt(laborTotal)}</span></div>`;""",
     """  const typeLabel=tpoTypeVal==='150_labor'?'labor':((rate===950||rate===350)?'fully adhered':'mechanically fastened')+(tpoLaborOnly?' labor':'');
  let html=`<div class="cr"><span style="color:var(--text2)">${sq} sq x $${rate}/sq ${tpoLaborOnly?'labor':'installed'}${tpoTypeVal==='150_labor'?'':' ('+typeLabel+')'}</span><span>${fmt(laborTotal)}</span></div>`;""")
once("""  const tpoLines=[{desc:`TPO ${typeLabel}  --  ${sq} sq`,cost:laborTotal,qty:1,cat:'Roofing',type:'sub',calcNote:`${fmt(rate)}/sq`}];""",
     """  const tpoLines=[{desc:`TPO ${typeLabel}  --  ${sq} sq`,cost:laborTotal,qty:1,cat:'Roofing',type:tpoLaborOnly?'labor':'sub',calcNote:`${fmt(rate)}/sq`}];""")

# 7. spray DTM (exposed structure) paint labor $85 -> $50 a gallon
once("""  exposed:   {label:'Exposed structure (DTM) — spray',laborRate:85, matRate:35, cov:300, matLabel:'DTM paint'},""",
     """  exposed:   {label:'Exposed structure (DTM) — spray',laborRate:50, matRate:35, cov:300, matLabel:'DTM paint'},""")

open(p, 'w', encoding='utf-8').write(t)
print('RATES30: patched', p)
