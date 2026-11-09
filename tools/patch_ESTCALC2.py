"""patch ESTCALC2 (owner 11/9, estimate builder):
 · framing labor by FLOOR SF for new construction (wood or metal) — $4.50–6.50, default $5.50 — and partition framing
   by LF of WALL (not LF of material) — $4–6, default $5.00; old $/LF-of-material choices kept; Floor SF box; the
   "$5.50/floor SF" choices used to be multiplied by wall LF, and picking a labor choice on metal snapped back to partition
 · RC-1 resilient channel: $1.50 per 12' piece, priced by LF (pieces rounded up); 7/8 hat channel LF is now priced;
   extras survive a re-calc and go in with "Add to estimate"
 · sheetrock: DensGlass in the board-type pull-down
 · paint: supplier pull-down — Sherwin-Williams / Farrell-Calhoun — prices saved to the rate book as you go"""
import re, base64, sys
P = 'index.html'; src = open(P).read()
if '/*ESTCALC2*/' in src: print('already patched'); sys.exit(0)
def rep(a, b, n=1):
    global src
    c = src.count(a); assert c == n, (a[:80], c); src = src.replace(a, b)

# ── 1. the builder's form (stored base64 in _estHTML) ──
m = re.search(r"var _estHTML=decodeURIComponent\(escape\(atob\('([A-Za-z0-9+/=]+)'\)\)\);", src)
h = base64.b64decode(m.group(1)).decode('utf-8')
def hrep(a, b):
    global h
    c = h.count(a); assert c == 1, (a[:80], c); h = h.replace(a, b)
i = h.index('      <div class="g2" style="margin-top:7px">\n        <div class="f"><label>Include framing labor?</label>')
j = h.index('</select>\n        </div></div>', i) + len('</select>\n        </div></div>')
h = h[:i] + '''      <div class="g3" style="margin-top:7px"><!--ESTCALC2-->
        <div class="f"><label>Charge framing labor by</label>
          <select id="fr-labor-opt" onchange="frLaborChanged(true)">
            <option value="sf" selected>New construction — $ per floor SF</option>
            <option value="wall">Partition — $ per LF of wall</option>
            <option value="partition">Partition — $1.00/LF of material</option>
            <option value="partition_075">Partition — $0.75/LF of material</option>
            <option value="8.00">Addition — $8.00/floor SF</option>
            <option value="9.00">Renovation — $9.00/floor SF</option>
            <option value="none">No labor — material only</option>
          </select></div>
        <div class="f" id="fr-floorsf-wrap"><label>Floor SF</label><input id="fr-floorsf" type="number" min="0" step="1" placeholder="e.g. 3200" oninput="calcFr()"></div>
        <div class="f" id="fr-rate-wrap"><label id="fr-rate-label">Labor $/floor SF</label><input id="fr-labor-rate" type="number" min="0" step="0.25" value="5.50" oninput="calcFr()"><div id="fr-rate-hint" style="font-size:10px;color:var(--text2)">we pay $4.50–6.50 · default $5.50</div></div>
      </div>''' + h[j:]
hrep('        <div id="fr-extras-res"', '''        <!-- ESTCALC2: RC-1 (metal or wood) -->
        <div class="sect" style="margin-bottom:6px;font-size:11px">RC-1 resilient channel</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;align-items:end">
          <div class="f"><label style="font-size:10px">RC-1 LF</label><input type="number" id="fr-rc1-lf" min="0" step="1" placeholder="LF of RC-1" oninput="calcFrExtras()"></div>
          <div class="f"><label style="font-size:10px">Price per 12' piece</label><input type="number" id="fr-rc1-pc" min="0" step="0.05" value="1.50" oninput="calcFrExtras()"></div>
        </div>
        <div id="fr-extras-res"''')
enc = base64.b64encode(h.encode('utf-8')).decode()
src = src[:m.start(1)] + enc + src[m.end(1):]

# ── 2. framing: labor menu no longer reset by the frame-type logic ──
rep("""  if(type==='metal'){
    laborOpt.value='partition';
    if(extrasWrap)""", """  if(type==='metal'){
    if(extrasWrap)""")
rep("""    if(laborOpt.value==='partition'||laborOpt.value==='2.00') laborOpt.value='auto';
""", "")
rep("""    if(laborOpt.value==='partition') laborOpt.value='auto';
""", "")
rep("""  populateFrDropdowns(type);
  calcFr();
}
function calcFrExtras(){""", """  populateFrDropdowns(type);
  try{ frLaborChanged(false); }catch(e){}
  calcFr();
}
/*ESTCALC2*/ function frLaborChanged(reset){
  const o=qvs('fr-labor-opt'), fw=qs('fr-floorsf-wrap'), rw=qs('fr-rate-wrap'), rl=qs('fr-rate-label'), rh=qs('fr-rate-hint'), ri=qs('fr-labor-rate');
  const floor=o==='sf'||o==='8.00'||o==='9.00', rate=o==='sf'||o==='wall';
  if(fw) fw.style.display=floor?'':'none';
  if(rw) rw.style.display=rate?'':'none';
  if(rl) rl.textContent=o==='wall'?'Labor $/LF of wall':'Labor $/floor SF';
  if(rh) rh.textContent=o==='wall'?'we charge $4.00–6.00 · default $5.00':'we pay $4.50–6.50 · default $5.50';
  if(ri && (reset || !ri.value)) ri.value=o==='wall'?'5.00':'5.50';
  if(reset) calcFr();
}
function calcFrExtras(){""")
rep("""      const laborCost=matLFtotal*partitionMatRate;
      const perWallLF=(laborCost/lf).toFixed(2);""", """      _frLab(matLFtotal); } else if(false){
      const laborCost=matLFtotal*partitionMatRate;
      const perWallLF=(laborCost/lf).toFixed(2);""")
rep("""    } else if(frLaborRate>0){
      const laborCost=frCustomLabor>0?frCustomLabor:frLaborRate*lf;""", """    } else { _frLab(matLFtotal); } if(false){
      const laborCost=frCustomLabor>0?frCustomLabor:frLaborRate*lf;""")
rep("""    if(!isPartition&&frLaborRate>0){
      const laborCost=frCustomLabor>0?frCustomLabor:frLaborRate*lf;""", """    _frLab(matLFtotal); if(false){
      const laborCost=frCustomLabor>0?frCustomLabor:frLaborRate*lf;""")
rep("""  let c2lines=[];
  if(type==='metal'){
    const track=lf*2;""", """  let c2lines=[];
  /*ESTCALC2: one labor rule for metal and wood */
  function _frLab(matLF){
    const o=frLaborOpt, fsf=qv('fr-floorsf'), ur=parseFloat(qvs('fr-labor-rate'));
    if(o==='none') return;
    let cost=0, desc='', note='';
    if(frCustomLabor>0){ cost=frCustomLabor; desc='Framing labor (flat amount)'; note='custom total'; }
    else if(isPartition){ cost=matLF*partitionMatRate; desc=`Partition framing labor  --  ${fmtN(matLF)} LF of material`; note=`$${partitionMatRate.toFixed(2)}/LF of material · ${fmtN(matLF)} mat LF`; }
    else if(o==='wall'){ const rr=ur>0?ur:5; cost=lf*rr; desc=`Partition framing labor  --  ${fmtN(lf)} LF of wall`; note=`$${rr.toFixed(2)}/LF of wall`; }
    else { const rr=o==='sf'?(ur>0?ur:5.5):(parseFloat(o)||0);
      if(!fsf){ html+=`<div class="cr" style="border-top:.5px solid var(--bdr);margin-top:5px;padding-top:5px"><span style="color:var(--amber)">Enter the Floor SF to price framing labor ($${rr.toFixed(2)}/floor SF)</span><span></span></div>`; return; }
      cost=fsf*rr; desc=`Framing labor  --  ${fmtN(fsf)} floor SF`; note=`$${rr.toFixed(2)}/floor SF`; }
    html+=`<div class="cr" style="border-top:.5px solid var(--bdr);margin-top:5px;padding-top:5px"><span style="color:var(--text2)">${desc} (${note})</span><span>${fmt(cost)}</span></div>`;
    c2lines.push({desc:desc,cost:cost,qty:1,cat:'Framing',type:'labor',calcNote:note});
  }
  if(type==='metal'){
    const track=lf*2;""")
rep("  if(!frZones||!frZones.length){cc2.fr={lines:c2lines};}", "  if(!frZones||!frZones.length){cc2.fr={lines:c2lines,extras:(cc2.fr&&cc2.fr.extras)||[]};}   /* ESTCALC2: keep the extras */")
rep("  cc2.fr={lines:allZoneLines};", "  cc2.fr={lines:allZoneLines,extras:(cc2.fr&&cc2.fr.extras)||[]};")

# ── 3. extras: hat channel + RC-1 ──
rep("""  res.innerHTML=html||'No extras added.';
  // Store extras in cc2.fr so they get added with the rest""", """  /*ESTCALC2*/ const hatLF=parseFloat(qs('fr-hat-lf')?.value)||0;
  if(hatLF){ const hr=parseFloat(qs('fr-hat-size')?.value)||2.00; const hc=hatLF*hr;
    html+=(html?'<br>':'')+'7/8" hat channel: '+fmtN(hatLF)+' LF × $'+hr.toFixed(2)+'/LF = <strong>'+fmt(taxed(hc))+'</strong> w/tax';
    lines.push({desc:'7/8" hat channel  --  '+fmtN(hatLF)+' LF',cost:hr,qty:Math.round(hatLF),unit:'LF',cat:'Framing',type:'material',calcNote:'$'+hr.toFixed(2)+'/LF pre-tax'}); }
  const rcLF=parseFloat(qs('fr-rc1-lf')?.value)||0;
  if(rcLF){ const pc=parseFloat(qs('fr-rc1-pc')?.value); const perPc=(isFinite(pc)&&pc>0)?pc:1.50; const pcs=Math.ceil(rcLF/12); const perLF=perPc/12;
    html+=(html?'<br>':'')+'RC-1 resilient channel: '+fmtN(rcLF)+' LF = '+pcs+' pcs (12\\') × $'+perPc.toFixed(2)+' = <strong>'+fmt(taxed(pcs*perPc))+'</strong> w/tax ($'+perLF.toFixed(3)+'/LF)';
    lines.push({desc:'RC-1 resilient channel  --  '+fmtN(rcLF)+' LF ('+pcs+' pcs × 12\\')',cost:perPc,qty:pcs,unit:'piece',cat:'Framing',type:'material',calcNote:'$'+perPc.toFixed(2)+' per 12\\' piece = $'+perLF.toFixed(3)+'/LF · '+fmtN(rcLF)+' LF'}); }
  res.innerHTML=html||'No extras added.';
  // Store extras in cc2.fr so they get added with the rest""")
rep("""  const calc=cc2[key];
  if(!calc||!calc.lines||!calc.lines.length)return;""", """  if(key==='fr'&&typeof calcFrExtras==='function'){ try{ calcFrExtras(); }catch(e){} }   /* ESTCALC2 */
  const calc=cc2[key];
  if(!calc||((!calc.lines||!calc.lines.length)&&!(key==='fr'&&calc.extras&&calc.extras.length)))return;
  if(!calc.lines) calc.lines=[];""")
rep("['fr-lf','fr-floorsf','fr-doors','fr-wins','fr-defl-lf','fr-block-lf'].forEach(", "['fr-lf','fr-floorsf','fr-doors','fr-wins','fr-defl-lf','fr-block-lf','fr-hat-lf','fr-rc1-lf'].forEach(")
rep("""      calcFr();
    }
    else if(key==='flr')""", """      calcFr(); try{ calcFrExtras(); }catch(e){}
    }
    else if(key==='flr')""")

# ── 4. zones: floor SF mode ──
rep("""    laborMode: qvs('fr-labor-mode')||'wall',       // 'material' | 'wall' | 'sf'
    laborRate: parseFloat(qvs('fr-labor-rate'))||5.00,""", """    /*ESTCALC2*/ laborMode: (function(o){ return o==='wall'?'wall':(o==='none'?'none':(o==='partition'||o==='partition_075'?'material':'floor')); })(qvs('fr-labor-opt')),
    laborRate: (function(o,ur){ return o==='sf'?(ur>0?ur:5.50):o==='wall'?(ur>0?ur:5.00):o==='partition'?1.00:o==='partition_075'?0.75:o==='none'?0:(parseFloat(o)||5.50); })(qvs('fr-labor-opt'),parseFloat(qvs('fr-labor-rate'))),
    floorSF: qv('fr-floorsf')||0,""")
rep("""    if(mode==='material') labor = matLF*rate;
    else if(mode==='sf') labor = wallSF*rate;""", """    if(mode==='material') labor = matLF*rate;
    else if(mode==='sf') labor = wallSF*rate;
    else if(mode==='floor') labor = (z.floorSF||0)*rate;   /* ESTCALC2: new construction $/floor SF */
    else if(mode==='none') labor = 0;""")
rep("""            +'zz.laborRate=(this.value===\\'material\\')?1.00:(this.value===\\'sf\\'?0.75:5.00);}renderFrZones()">'
            +'<option value="wall"'+((z.laborMode||'wall')==='wall'?' selected':'')+'>LF of wall</option>'""", """            +'zz.laborRate=(this.value===\\'material\\')?1.00:(this.value===\\'sf\\'?0.75:(this.value===\\'floor\\'?5.50:(this.value===\\'none\\'?0:5.00)));}renderFrZones()">'
            +'<option value="floor"'+(z.laborMode==='floor'?' selected':'')+'>Floor SF (new construction)</option>'
            +'<option value="wall"'+((z.laborMode||'wall')==='wall'?' selected':'')+'>LF of wall</option>'""")
rep("""            +'<option value="sf"'+(z.laborMode==='sf'?' selected':'')+'>SF of wall</option>'
          +'</select></div>'""", """            +'<option value="sf"'+(z.laborMode==='sf'?' selected':'')+'>SF of wall</option>'
            +'<option value="none"'+(z.laborMode==='none'?' selected':'')+'>No labor</option>'
          +'</select></div>'""")
rep("""            : z.laborMode==='sf'
            ? '<input type="number" value="'+(z.laborRate!=null?z.laborRate:0.75)+'\"""", """            : z.laborMode==='none' ? '<div style="font-size:11px;color:var(--text2);padding:6px 0">material only</div>'
            : z.laborMode==='floor'
            ? '<div style="display:flex;gap:4px"><input type="number" value="'+(z.laborRate!=null?z.laborRate:5.50)+'" min="0" step="0.25" title="$/floor SF — we pay 4.50–6.50" oninput="var zz=frZones.find(x=>x.id===\\''+z.id+'\\');if(zz)zz.laborRate=parseFloat(this.value)||0;renderFrZones()" placeholder="$/floor SF">'
              +'<input type="number" value="'+(z.floorSF||'')+'" min="0" step="1" title="Floor SF" oninput="var zz=frZones.find(x=>x.id===\\''+z.id+'\\');if(zz)zz.floorSF=parseFloat(this.value)||0;renderFrZones()" placeholder="floor SF"></div>'
            : z.laborMode==='sf'
            ? '<input type="number" value="'+(z.laborRate!=null?z.laborRate:0.75)+'\"""")
rep("""              +[4.00,4.50,5.00,6.00].map(function(v){return '<option value="'+v.toFixed(2)+'"'+(Math.abs((z.laborRate||5)-v)<0.001?' selected':'')+'>$'+v.toFixed(2)+'/LF wall</option>';}).join('')""",
    """              +[4.00,4.50,5.00,5.50,6.00].map(function(v){return '<option value="'+v.toFixed(2)+'"'+(Math.abs((z.laborRate||5)-v)<0.001?' selected':'')+'>$'+v.toFixed(2)+'/LF wall</option>';}).join('')""")
rep("""      } else if(zc.laborMode==='sf'){""", """      } else if(zc.laborMode==='floor'){
        allZoneLines.push({desc:(z.name||'Zone')+' framing labor  --  '+fmtN(z.floorSF||0)+' floor SF',cost:zc.labor,qty:1,cat:'Framing',type:'labor',calcNote:'$'+zc.laborRate.toFixed(2)+'/floor SF × '+fmtN(z.floorSF||0)+' SF'});
      } else if(zc.laborMode==='sf'){""")

# ── 5. DensGlass ──
rep("""  ultracode:{label:'3/4" Type X Ultracode',""", """  densglass:{label:'DensGlass (5/8" glass-mat)',note:'5/8" DensGlass glass-mat gypsum — exterior sheathing / wet areas. Check the current price.',costAdj:20,badge:'DENSGLASS',badgeColor:'var(--amber)',badgeBg:'var(--abg)'},   /* ESTCALC2 */
  ultracode:{label:'3/4" Type X Ultracode',""")
rep("""cement:'Cement Board',ultracode:'3/4" Ultracode',lead:'Lead-lined'};""", """cement:'Cement Board',densglass:'5/8" DensGlass',ultracode:'3/4" Ultracode',lead:'Lead-lined'};""")
rep("""cement:35.00,ultracode:33.00,lead:90.00};""", """cement:35.00,densglass:30.00,ultracode:33.00,lead:90.00};""")
rep("""    ultracode:  {'32':33.00, '40':35.00, '48':37.00},
    lead:""", """    ultracode:  {'32':33.00, '40':35.00, '48':37.00},
    densglass:  {'32':30.00, '40':38.00, '48':45.00},
    lead:""")
rep("""    ultracode:  {'32':[/ultracode|3\\/4.*type.*x/i],                 '48':[/ultracode/i]},
  };""", """    ultracode:  {'32':[/ultracode|3\\/4.*type.*x/i],                 '48':[/ultracode/i]},
    densglass:  {'32':[/dens.?glass.*4x8|4x8.*dens.?glass|dens.?glass(?!.*(4x10|4x12))/i], '40':[/dens.?glass.*4x10/i], '48':[/dens.?glass.*4x12/i]},
  };""")

# ── 6. paint: Sherwin-Williams / Farrell-Calhoun ──
rep("""function ptTypeChange(zid,typeKey){""", """/*ESTCALC2*/ const PT_BRANDS={sw:'Sherwin-Williams',fc:'Farrell-Calhoun'};
function ptBrandRate(bk,typeKey){ const b=PT_BRANDS[bk]; if(!b)return null; const t=PT_TYPES[typeKey]||PT_TYPES.interior;
  const r=(rates||[]).find(x=>x&&x.cat==='Paint'&&x.supplier===b&&x.ptType===typeKey); return r||null; }
function ptBrandPick(zid,bk){ const z=ptZones.find(x=>x.id===zid); if(!z)return; z.brand=bk||''; const r=ptBrandRate(bk,z.type); if(r){ z.matRate=r.cost; z.matDesc=r.desc; } renderPtZones(); }
function ptBrandSave(zid){ const z=ptZones.find(x=>x.id===zid); if(!z||!PT_BRANDS[z.brand])return; const t=PT_TYPES[z.type]||PT_TYPES.interior; const b=PT_BRANDS[z.brand];
  const cost=z.matRate!=null?z.matRate:t.matRate; if(!(cost>0)){ alert('Type the $/gal first.'); return; }
  let r=ptBrandRate(z.brand,z.type); const d=new Date().toISOString().slice(0,10);
  if(r){ r.cost=cost; r.date=d; } else { r={id:uid(),desc:b+' — '+t.matLabel,cost:cost,unit:'per gal',cat:'Paint',type:'material',supplier:b,ptType:z.type,date:d,notes:'saved from the paint calculator'}; rates.push(r); }
  z.matDesc=r.desc; try{ saveRatesDB(); }catch(e){} const m=qs('save-msg'); if(m){ m.textContent=b+' '+t.matLabel+' saved at $'+cost+'/gal'; m.style.color='var(--green)'; setTimeout(()=>{m.textContent='';m.style.color='';},3000); } renderPtZones(); }
function ptTypeChange(zid,typeKey){""")
rep("""  z.laborRate=t.laborRate;z.matRate=t.matRate;
  // Update coverage from substrate""", """  z.laborRate=t.laborRate;z.matRate=t.matRate;
  try{ const br=z.brand&&ptBrandRate(z.brand,typeKey); if(br){ z.matRate=br.cost; z.matDesc=br.desc; } }catch(e){}   /* ESTCALC2 */
  // Update coverage from substrate""")
rep("""        <div class="f"><label style="font-size:10px">Mat $/gal</label>""", """        <div class="f"><label style="font-size:10px">Paint supplier</label>
          <select data-ptbrand="1" onchange="ptBrandPick('${z.id}',this.value)"><option value="">— pick —</option>${Object.entries(PT_BRANDS).map(([k,v])=>{const r=ptBrandRate(k,z.type);return '<option value="'+k+'" '+(z.brand===k?'selected':'')+'>'+v+(r?' ($'+r.cost+'/gal)':' (no price yet)')+'</option>';}).join('')}</select>
          ${PT_BRANDS[z.brand]?'<button type="button" class="btn" style="margin-top:3px;font-size:10px;padding:2px 6px" onclick="ptBrandSave(\\''+z.id+'\\')">💾 Save as '+PT_BRANDS[z.brand]+' price</button>':''}</div>
        <div class="f"><label style="font-size:10px">Mat $/gal</label>""")
rep("""      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:6px;align-items:end">
        <div class="f"><label style="font-size:10px">Labor $/gal</label>""", """      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:6px;align-items:end">
        <div class="f"><label style="font-size:10px">Labor $/gal</label>""")
rep("""    allLines.push({desc:`${zname} paint material (${t.matLabel})  --  ${suffix}`""", """    allLines.push({desc:`${zname} paint material (${PT_BRANDS[z.brand]?PT_BRANDS[z.brand]+' ':''}${t.matLabel})  --  ${suffix}`""")
open(P, 'w').write(src); print('ok')
