#!/usr/bin/env python3
"""Idempotent patch PRICEBOOK: Admin -> Estimate Builder -> Price Book (one cloud price list for the builder).

Owner (10/26): reprice the estimate builder all at once and let the estimators see the new prices.
  * gc_kv gc_price_book (versioned): every calculator starting price the builder reads (paint $/gal, framing labor,
    drywall hang + boards + accessories, ACT, flooring, roofing / TPO, crew + hauling, gutters) and every Rate Book
    item, plus the builder's margins and sales tax (the same on every computer). Admins edit inline or upload the
    review workbook (.xlsx, its NEW columns) or a CSV; old -> new is shown before Apply; every change is logged.
  * Owner (later 10/26): "ALWAYS go from spreadsheet data for prices." Every calculator price and the Rate Book read the
    Price Book; the numbers in the code are only the first-run seed while the Price Book has no price. Uploading the
    workbook takes every row (the NEW price where filled in, else the sheet's current price), so after one upload the
    Price Book is the spreadsheet. "Download as spreadsheet" gives the same layout back (round trip). The few prices it
    cannot hold are listed by _gcPriceBook.unwired(). Item ids are generic (trade.item); no company name in price logic.
    Saved / sent estimates keep their own line costs; new lines and calculator runs use the new prices.
  * Framing (owner decision): the main framing calculator charges metal stud labor per LF of WALL (Price Book
    frame.metal.wall, $5.00 like the saved zones) - a 100 LF room is $500 labor. The per-LF-of-material options stay
    in the list as "(old basis)".
  * Margins: residential 30 / commercial $500,000 or less 25 (now a setting) / large commercial 20 / insurance = residential;
    sales tax 9.75 - kept, now stored in the Price Book (cloud) instead of per computer.
  * "Import supplier prices" no longer overwrites a Price Book price without showing old -> new and asking.
  * Estimators: a "Prices updated by <admin> on <date> - see changes" banner in the builder once per update,
    and a one-page price sheet (logo header) to print / save as PDF.
New UI = tools/pricebook_tail.js (appended as <script id="gc-patch-PRICEBOOK">).
Every find-string is asserted (else nothing is written).
Usage: python3 tools/patch_PRICEBOOK.py [index.html]
"""
import sys, os, re, base64
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
MARK = '__GC_PATCH_PRICEBOOK__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
TAIL = open(os.path.join(HERE, 'pricebook_tail.js'), encoding='utf-8').read().rstrip('\n')
assert '</script>' not in TAIL and MARK in TAIL

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

def infunc(start, end, reps, label):
    """replace inside one function only: start..end (both must be found, start exactly once)"""
    global src
    assert src.count(start) == 1, ('function start', label, src.count(start))
    i = src.find(start); j = src.find(end, i)
    assert j > i, ('function end', label)
    body = src[i:j]
    for old, new, cnt in reps:
        c = body.count(old)
        assert c == cnt, ('in ' + label, old[:60], c, cnt)
        body = body.replace(old, new)
    src = src[:i] + body + src[j:]

# ── 0. the reader every calculator uses: _gcPB(id, field, today's number) ─────────────────────────
once("\n// ─── SEED DATA ───", """
/* __GC_PATCH_PRICEBOOK__ reader: a calculator's starting price comes from the cloud Price Book (gc_kv gc_price_book,
   cached on this computer) when an admin has set it; the third argument is today's built-in price (the fallback). */
window.__GC_PB_CACHE__=window.__GC_PB_CACHE__||(function(){try{return JSON.parse(localStorage.getItem('gc_price_book')||'null');}catch(e){return null;}})();
function _gcPB(id,f,d){try{var b=window.__GC_PB_CACHE__,it=b&&b.items&&b.items[id],v=it?it[f]:null;return (typeof v==='number'&&isFinite(v)&&v>=0)?v:d;}catch(e){return d;}}
window._gcPB=_gcPB;
/* a preset list plus the Price Book price (and the value already chosen), so a pick list always shows the price in use */
function _gcPBOpts(list){var o=list.slice();for(var i=1;i<arguments.length;i++){var v=parseFloat(arguments[i]);if(isFinite(v)&&v>0&&!o.some(function(x){return Math.abs(x-v)<0.001;}))o.push(v);}return o.sort(function(a,b){return a-b;});}
/* the lumber size of the picked option ("2×10 ($0.624/LF)" -> "2×10"): the label never depends on the price */
function _gcSelLbl(id,d){try{var e=document.getElementById(id),o=e&&e.selectedOptions&&e.selectedOptions[0],t=o?String(o.getAttribute('data-pbl0')||o.textContent||'').trim():'',m=/^(\\d+(?:\\.\\d+)?\\s*[×x]\\s*\\d+)/.exec(t);return m?m[1]:d;}catch(x){return d;}}
// ─── SEED DATA ───""", 'pb reader')

# ── 1. paint: a new zone starts at the paint type's price (Price Book), not a fixed 75 / 25 ──────────
once("cov:350,laborRate:75,matRate:25,chargeRate:150,mult:'type'});",
     "cov:350,laborRate:PT_TYPES.interior.laborRate,matRate:PT_TYPES.interior.matRate,chargeRate:150,mult:'type'});   /* PRICEBOOK */", 'paint zone')

# ── 2. framing: metal stud labor per LF of WALL in the main calculator ────────────────────────────────
m = re.search(r"var _estHTML=decodeURIComponent\(escape\(atob\('([A-Za-z0-9+/=]+)'\)\)\)", src)
assert m and src.count(m.group(1)) == 1, 'estHTML'
eh = base64.b64decode(m.group(1)).decode('utf-8')
OLD_OPT = '<option value="partition" selected>Partition / Interior — $1.00/LF of material</option>\n            <option value="partition_075">Partition / Interior — $0.75/LF of material</option>'
assert eh.count(OLD_OPT) == 1, 'fr-labor-opt options'
eh = eh.replace(OLD_OPT, '<option value="wall_lf" selected>Metal framing labor — $5.00/LF of wall (labor only)</option>\n'
                '            <option value="partition">(old basis) Partition / Interior — $1.00/LF of material</option>\n'
                '            <option value="partition_075">(old basis) Partition / Interior — $0.75/LF of material</option>')
src = src.replace(m.group(1), base64.b64encode(eh.encode('utf-8')).decode('ascii'))

infunc("function onFrTypeChange(){", "function calcFrExtras(){", [
    ("    laborOpt.value='partition';\n", "    laborOpt.value='wall_lf';   /* PRICEBOOK: metal labor per LF of wall */\n", 1),
    ("if(laborOpt.value==='partition'||laborOpt.value==='2.00') laborOpt.value='auto';", "if(laborOpt.value==='partition'||laborOpt.value==='wall_lf'||laborOpt.value==='2.00') laborOpt.value='auto';", 1),
    ("if(laborOpt.value==='partition') laborOpt.value='auto';", "if(laborOpt.value==='partition'||laborOpt.value==='wall_lf') laborOpt.value='auto';", 1),
], 'onFrTypeChange')

infunc("function calcFr(){try{", "function calcDw(){try{", [
    ("  } else if(isPartition){\n", "  } else if(frLaborOpt==='wall_lf'){\n    frLaborRate=_gcPB('frame.metal.wall','lab',5.00);   /* PRICEBOOK: $/LF of WALL, labor only (owner 10/26) */\n  } else if(isPartition){\n", 1),
    ("c2lines.push({desc:`Framing labor  --  ${fmtN(lf)} LF`,cost:laborCost,qty:1,cat:'Framing',type:'labor',calcNote:`$${frLaborRate}/LF`});",
     "c2lines.push({desc:`Framing labor  --  ${fmtN(lf)} LF${frLaborOpt==='wall_lf'?' of wall (labor only)':''}`,cost:laborCost,qty:1,cat:'Framing',type:'labor',calcNote:`$${frLaborRate}/LF${frLaborOpt==='wall_lf'?' of wall':''}`});", 2),
    ("const metalScrewDefaultBox=208.75;", "const metalScrewDefaultBox=_gcPB('frame.screws','mat',208.75);", 1),
    ("const woodNailBoxCost=woodNailRate?woodNailRate.cost:45.00;", "const woodNailBoxCost=woodNailRate?woodNailRate.cost:_gcPB('frame.nails','mat',45.00);", 1),
], 'calcFr')
once("    laborRate: parseFloat(qvs('fr-labor-rate'))||5.00,", "    laborRate: parseFloat(qvs('fr-labor-rate'))||_gcPB('frame.metal.wall','lab',5.00),   /* PRICEBOOK */", 'frZone rate')

# ── 3. drywall: first zone's hang labor, board price table, accessories ───────────────────────────────
once("labor:28,extras:3,waste:5", "labor:(_gcPB('dw.hangfinish','lab',0)>0?_gcPB('dw.hangfinish','lab',0):(DW_SIZES.find(function(s){return s.id==='48';})||{laborDef:28}).laborDef),extras:3,waste:5", 'dw zone')
once("  // Fall back to price table\n", "  // Fall back to price table (PRICEBOOK: the Price Book's board price first)\n  {const _pbv=_gcPB('dw.board.'+typeKey+'.'+(sizeId==='32_cement'?'32':sizeId),'mat',NaN);if(isFinite(_pbv))return _pbv;}\n", 'dw board')
infunc("function calcDw(){try{", "function calcTc(){try{", [
    ("let perBox=5000, boxCost=44.98;", "let perBox=5000, boxCost=_gcPB('dw.screws','mat',44.98);", 1),
    ("(mudRM?mudRM.cost:15)", "(mudRM?mudRM.cost:_gcPB('dw.mud','mat',15))", 1),
    ("${mudRM?mudRM.cost:15}", "${mudRM?mudRM.cost:_gcPB('dw.mud','mat',15)}", 1),
    ("(tapeRM?tapeRM.cost:7)", "(tapeRM?tapeRM.cost:_gcPB('dw.tape','mat',7))", 1),
    ("${tapeRM?tapeRM.cost:7}", "${tapeRM?tapeRM.cost:_gcPB('dw.tape','mat',7)}", 1),
    ("(sandRM?sandRM.cost:1)", "(sandRM?sandRM.cost:_gcPB('dw.pads','mat',1))", 1),
    ("${sandRM?sandRM.cost:1}", "${sandRM?sandRM.cost:_gcPB('dw.pads','mat',1)}", 1),
    ("const cbStickCost=cbRM?cbRM.cost:4.41;", "const cbStickCost=cbRM?cbRM.cost:_gcPB('dw.bead','mat',4.41);", 1),
    ("z.fireCaulkRate:1.75;", "z.fireCaulkRate:_gcPB('dw.firestop','lab',1.75);", 1),
    ("const fcTubeCost=fcTubeRM?fcTubeRM.cost:9.50;", "const fcTubeCost=fcTubeRM?fcTubeRM.cost:_gcPB('dw.fctube','mat',9.50);", 1),
], 'calcDw')

# ── 4. ACT: the simple ACT calculator uses the ACT regular-finish price (zones read ACT_LABOR, set by the Price Book) ──
infunc("function calcTc(){try{", "function calcRo(){try{", [
    ("const installRateMap={'grid_large':2.00,'tile_large':2.00};", "const installRateMap={'grid_large':ACT_LABOR.regular,'tile_large':ACT_LABOR.regular};   /* PRICEBOOK */", 1),
    ("const installLabel={'grid_large':'ACT grid install $2.00/SF','tile_large':'ACT tile install $2.00/SF'}[jobOpt]",
     "const installLabel={'grid_large':'ACT grid install $'+installRate.toFixed(2)+'/SF','tile_large':'ACT tile install $'+installRate.toFixed(2)+'/SF'}[jobOpt]", 1),
], 'calcTc')

# ── 5. roofing + TPO ────────────────────────────────────────────────────────────────────────────────
infunc("function calcRo(){try{", "function calcCr(){try{", [
    ("  let matDefault=matType==='tpo'?350:matType==='shingle'?140:0;",
     "  const _R1=_gcPB('roof.reroof1','lab',75),_RX=_gcPB('roof.extra','lab',5),_RN=_gcPB('roof.newcon','lab',50),_RA=_gcPB('roof.tpo_adhered','sub',950),_RM=_gcPB('roof.tpo_mech','sub',650);   /* PRICEBOOK */\n"
     "  let matDefault=matType==='tpo'?_gcPB('roof.tpo_mat','mat',350):matType==='shingle'?_gcPB('roof.shingle','mat',140):0;", 1),
    ("const rate=type==='tpo_adhered'?950:650;", "const rate=type==='tpo_adhered'?_RA:_RM;", 1),
    ("const label=type==='tpo_adhered'?'TPO fully adhered ($950/sq)':'TPO mechanically fastened ($650/sq)';", "const label=type==='tpo_adhered'?'TPO fully adhered ($'+_RA+'/sq)':'TPO mechanically fastened ($'+_RM+'/sq)';", 1),
    ("const labor=sq*50;", "const labor=sq*_RN;", 1),
    ("${sq} sq x $50/sq</span>", "${sq} sq x $${_RN}/sq</span>", 1),
    ("calcNote:'$50/sq'", "calcNote:'$'+_RN+'/sq'", 1),
    ("const labor=sq*75;", "const labor=sq*_R1;", 1),
    ("${sq} sq x $75/sq</span>", "${sq} sq x $${_R1}/sq</span>", 1),
    ("calcNote:'$75/sq'", "calcNote:'$'+_R1+'/sq'", 1),
    ("const baseTearoff=sq*75,extraTearoff=sq*extra*5,", "const baseTearoff=sq*_R1,extraTearoff=sq*extra*_RX,", 1),
    ("Base (${sq} sq x $75)", "Base (${sq} sq x $${_R1})", 1),
    ("(x $5/sq)", "(x $${_RX}/sq)", 1),
    ("calcNote:`$75/sq + $5/sq x ${extra} extra`", "calcNote:`$${_R1}/sq + $${_RX}/sq x ${extra} extra`", 1),
], 'calcRo')
infunc("function calcTpo(){try{", "// ── ACT CEILING GRID CALCULATOR", [
    ("  const rate=parseFloat(tpoParts[0])||950;\n  const tpoLaborOnly=tpoTypeVal.endsWith('_labor');",
     "  const tpoLaborOnly=tpoTypeVal.endsWith('_labor');\n  const _tpoBase=parseFloat(tpoParts[0])||950, _tpoId={'950_mat_lab':'roof.tpo_adhered','350_labor':'roof.tpo_adhered_lab','650_mat_lab':'roof.tpo_mech','250_labor':'roof.tpo_mech_lab'}[tpoTypeVal];\n"
     "  const rate=_tpoId?_gcPB(_tpoId,tpoLaborOnly?'lab':'sub',_tpoBase):_tpoBase;   /* PRICEBOOK */", 1),
    ("  const typeLabel=rate===950?'fully adhered':'mechanically fastened';", "  const typeLabel=_tpoBase===950?'fully adhered':'mechanically fastened';", 1),
], 'calcTpo')

# ── 6. crew + hauling, gutters ──────────────────────────────────────────────────────────────────────
infunc("function calcCr(){try{", "function cmuSFtoBlocks(){", [
    ("  const dumpCost=dumpLoads*175;", "  const _CL=_gcPB('crew.laborer','lab',300),_CF=_gcPB('crew.foreman','lab',400),_CD=_gcPB('crew.dump','mat',175);   /* PRICEBOOK */\n  const dumpCost=dumpLoads*_CD;", 1),
    ("qv('cr-dumpster-rate'):550;", "qv('cr-dumpster-rate'):_gcPB('crew.dumpster','mat',550);", 1),
    ("const laborTotal=laborers*days*300,foreTotal=fore*days*400,", "const laborTotal=laborers*days*_CL,foreTotal=fore*days*_CF,", 1),
    ("days x $400/day</span>", "days x $${_CF}/day</span>", 1),
    ("days x $300/day</span>", "days x $${_CL}/day</span>", 1),
    ("(4 yd) x $175</span>", "(4 yd) x $${_CD}</span>", 1),
    ("calcNote:`${fore?fore+'x foreman $400 + ':''}${laborers?laborers+'x laborer $300':''} x ${days} days`",
     "calcNote:`${fore?fore+'x foreman $'+_CF+' + ':''}${laborers?laborers+'x laborer $'+_CL:''} x ${days} days`", 1),
    ("calcNote:`${dumpLoads} × $175/load`", "calcNote:`${dumpLoads} × $${_CD}/load`", 1),
], 'calcCr')
infunc("function calcGutter(){try{", "function addCalc(key){", [
    ("const gutRate = size==='6' ? 9.00 : 7.50;", "const gutRate = size==='6' ? _gcPB('gut.6','mat',9.00) : _gcPB('gut.5','mat',7.50);   /* PRICEBOOK */", 1),
    ("const ds1Cost = ds1*85;", "const _D1=_gcPB('gut.ds1','mat',85),_D2=_gcPB('gut.ds2','mat',125);\n  const ds1Cost = ds1*_D1;", 1),
    ("const ds2Cost = ds2*125;", "const ds2Cost = ds2*_D2;", 1),
    ("${fmtN(ds1)} × $85</span>", "${fmtN(ds1)} × $${_D1}</span>", 1),
    ("calcNote:`$85 each`", "calcNote:`$${_D1} each`", 1),
    ("${fmtN(ds2)} × $125</span>", "${fmtN(ds2)} × $${_D2}</span>", 1),
    ("calcNote:`$125 each`", "calcNote:`$${_D2} each`", 1),
], 'calcGutter')

# ── 7. margins + tax: the commercial $500,000-or-less 25% is a setting; the cloud copy is applied after init ──
once("    return 0.25;}", "    var _sp=parseFloat(typeof settings!=='undefined'&&settings&&settings.comSmallMarginPct);return (isFinite(_sp)&&_sp>0&&_sp<95?_sp:25)/100;}   /* PRICEBOOK: a setting (default 25) */", 'com small')
once("  return 0.30;\n};", "  var _rp=parseFloat(typeof settings!=='undefined'&&settings&&settings.marginPct);return (isFinite(_rp)&&_rp>0&&_rp<95?_rp:30)/100;   /* PRICEBOOK: the residential setting (default 30) */\n};", 'res margin')
once("  var small=_gcMultOfPct(25),large", "  var small=_gcMultOfPct(window._gcDefaultMargin('Commercial',0)*100),large", 'auto com small')
once("  ['matMult','labMult','subMult','eqMult'].forEach(function(k){ if(!(parseFloat(settings[k])>1)) settings[k]=marginMult(settings.marginPct||30); });",
     "  ['matMult','labMult','subMult','eqMult'].forEach(function(k){ if(!(parseFloat(settings[k])>1)) settings[k]=marginMult(settings.marginPct||30); });\n"
     "  try{ if(window._gcPBInit) window._gcPBInit(); }catch(_pb){ console.warn('[GC] Price Book init', _pb); }   /* PRICEBOOK: cloud margins + tax, Rate Book prices */", 'init hook')
once("  settings.comMarginPct=qv('set-com-margin')||settings.comMarginPct||20;",
     "  settings.comMarginPct=qv('set-com-margin')||settings.comMarginPct||20;\n  if(qs('set-com-small-margin')) settings.comSmallMarginPct=qv('set-com-small-margin')||settings.comSmallMarginPct||25;   /* PRICEBOOK */", 'save com small')
once("  saveSettingsDB();\n  updSettingsPreview();", "  saveSettingsDB();\n  try{ if(window._gcPBSettingsSaved) window._gcPBSettingsSaved(); }catch(_pb){}   /* PRICEBOOK: an admin's change goes to every computer */\n  updSettingsPreview();", 'save hook')

# ── 8. "Import supplier prices" never overwrites a Price Book price without asking ───────────────────
infunc("function _runSupplierImport(){", "async function importEubanksPrice(){", [
    ("function _runSupplierImport(){\n  let added=0,updated=0,skipped=0;", "function _runSupplierImport(){\n  let added=0,updated=0,skipped=0;const held=[];   /* PRICEBOOK: Price Book prices are held */", 1),
    ("        if(newMS>=storedMS){", "        if(newMS>=storedMS && !window.__GC_PB_ALLOW_HELD__ && window._gcPBHeld && window._gcPBHeld(ex.desc,p.cost)){ held.push({desc:ex.desc,cost:ex.cost,imp:p.cost}); skipped++; }\n        else if(newMS>=storedMS){", 1),
    ("  return {added,updated,skipped};", "  return {added,updated,skipped,held};", 1),
], 'supplier import')

# ── 9. SheetJS (already in the app bundle) is reachable for the Price Book upload ────────────────────
once("Zc=()=>Promise.resolve(R5),", "Zc=(window.__gcSheetJS=R5,()=>Promise.resolve(R5)),", 'sheetjs')

# ── 10. Admin -> Estimate Builder -> Price Book ───────────────────────────────────────────────────────
once("  { id: 'jobs', ic: '🏗', t: 'Jobs, estimating & documents'",
     "  { id: 'estbuilder', ic: '🧮', t: 'Estimate Builder', d: 'Price Book: calculator prices, Rate Book, margins and sales tax', rows: [\n"
     "    row('Price Book', 'Every calculator starting price (paint, framing, drywall, ACT, flooring, roofing, crew, gutters) and every Rate Book item, the same on every computer. Edit a price, or upload the price sheet (.xlsx / .csv): you see old → new first, then Apply. Every change is logged.', 'Admin → Estimate Builder → Price Book', F('_gcOpenPriceBook')),\n"
     "    row('Margins and sales tax', 'Residential and insurance 30%, commercial $500,000 or less 25%, large commercial 20%, sales tax 9.75% — stored in the cloud, the same for every estimator.', 'Price Book → Margins & tax', F('_gcOpenPriceBook', 'margins')),\n"
     "    row('Price sheet for the estimators', 'One page with the current calculator prices and margins, to print or save as PDF.', 'Price Book → Price sheet', F('_gcPriceSheet'))\n"
     "  ] },\n"
     "  { id: 'jobs', ic: '🏗', t: 'Jobs, estimating & documents'", 'adm section')
once("    info('Margins and defaults', 'Residential 30%, commercial jobs of $500,000 or less 25%, large commercial 20%. Large commercial = jobs over $500,000 (written in the PM Playbook and used by the Estimate Builder).', 'PM Playbook', F('_gcOpenPlaybook')),",
     "    info('Margins and defaults', 'Residential 30%, commercial jobs of $500,000 or less 25%, large commercial 20%. Large commercial = jobs over $500,000 (written in the PM Playbook; set in Admin → Estimate Builder → Price Book, the same on every computer).', 'PM Playbook', F('_gcOpenPlaybook')),", 'adm margins info')

# ── 12. owner 10/26: "ALWAYS go from spreadsheet data for prices" — every other starting price the builder has ──────
def pb(id_, f, d): return "_gcPB('%s','%s',%s)" % (id_, f, d)
R = [  # (old, new, count) — whole file, each must occur exactly `count` times
  ("const chargeRate=z.chargeRate||150;", "const chargeRate=z.chargeRate||" + pb('paint.charge', 'sub', 150) + ";", 1),
  ("cov:350,laborRate:PT_TYPES.interior.laborRate,matRate:PT_TYPES.interior.matRate,chargeRate:150,", "cov:350,laborRate:PT_TYPES.interior.laborRate,matRate:PT_TYPES.interior.matRate,chargeRate:" + pb('paint.charge', 'sub', 150) + ",", 1),
  ("    frLaborRate=parseFloat(frLaborOpt)||0;", "    frLaborRate=_gcPB(({'4.50':'frame.large','5.00':'frame.medium','5.50':'frame.small','8.00':'frame.addition','9.00':'frame.reno'})[frLaborOpt]||'-','lab',parseFloat(frLaborOpt)||0);", 1),
  ("    frLaborRate=2.00;", "    frLaborRate=" + pb('frame.ti', 'lab', '2.00') + ";", 1),
  ("      : (frLaborOpt==='partition_075' ? 0.75\n", "      : (frLaborOpt==='partition_075' ? " + pb('frame.metal.mat075', 'lab', 0.75) + "\n", 1),
  ("      : 1.00);", "      : " + pb('frame.metal.mat', 'lab', '1.00') + ");", 1),
  ("const wood2x4LF=(wood2x4Rate&&wood2x4Rate.cost)||0.505;", "const wood2x4LF=(wood2x4Rate&&wood2x4Rate.cost)||" + pb('frame.wood2x4', 'mat', 0.505) + ";", 1),
  ("const woodPTLF=(woodPTRate&&woodPTRate.cost)||0.706;", "const woodPTLF=(woodPTRate&&woodPTRate.cost)||" + pb('frame.woodpt', 'mat', 0.706) + ";", 1),
  ("const wood2x8LF=(wood2x8Rate&&wood2x8Rate.cost)||0.834;", "const wood2x8LF=(wood2x8Rate&&wood2x8Rate.cost)||" + pb('frame.wood2x8', 'mat', 0.834) + ";", 1),
  ("blockSize: parseFloat(qvs('fr-block-size'))||0.365", "blockSize: parseFloat(qvs('fr-block-size'))||" + pb('frame.block2x4', 'mat', 0.365), 1),
  ("const pt2x4=liveRate([/2x4.*treated|treated.*2x4/i],0.706);", "const pt2x4=liveRate([/2x4.*treated|treated.*2x4/i]," + pb('frame.lum.pt2x4', 'mat', 0.706) + ");", 1),
  ("const pt2x6=liveRate([/2x6.*treated|treated.*2x6/i],1.097);", "const pt2x6=liveRate([/2x6.*treated|treated.*2x6/i]," + pb('frame.lum.pt2x6', 'mat', 1.097) + ");", 1),
  ("const pt2x8=liveRate([/2x8.*treated|treated.*2x8/i],1.222);", "const pt2x8=liveRate([/2x8.*treated|treated.*2x8/i]," + pb('frame.lum.pt2x8', 'mat', 1.222) + ");", 1),
  ("const sp2x4=liveRate([/2x4[^t]|2x4\\s*#2/i],0.365);", "const sp2x4=liveRate([/2x4[^t]|2x4\\s*#2/i]," + pb('frame.lum.2x4', 'mat', 0.365) + ");", 1),
  ("const sp2x6=liveRate([/2x6[^t]|2x6\\s*#2/i],0.573);", "const sp2x6=liveRate([/2x6[^t]|2x6\\s*#2/i]," + pb('frame.lum.2x6', 'mat', 0.573) + ");", 1),
  ("const sp2x8=liveRate([/2x8[^t]|2x8\\s*#2/i],0.624);", "const sp2x8=liveRate([/2x8[^t]|2x8\\s*#2/i]," + pb('frame.lum.2x8', 'mat', 0.624) + ");", 1),
  ("if(typeKey==='cement')allLines.push({desc:`Cement board mesh+thinset${areaTag}`,cost:4,qty:sheets,unit:'sheet',cat:'Drywall',type:'material',mult:zMult,calcNote:'$4/sheet'});",
   "if(typeKey==='cement')allLines.push({desc:`Cement board mesh+thinset${areaTag}`,cost:" + pb('dw.cementx', 'mat', 4) + ",qty:sheets,unit:'sheet',cat:'Drywall',type:'material',mult:zMult,calcNote:'$'+" + pb('dw.cementx', 'mat', 4) + "+'/sheet'});", 1),
  ("let wireCostEa=wireRate?wireRate.cost:0.779;", "let wireCostEa=wireRate?wireRate.cost:" + pb('act.wire', 'mat', 0.779) + ";", 1),
  ("if(wireCostEa>5)wireCostEa=0.779;", "if(wireCostEa>5)wireCostEa=" + pb('act.wire', 'mat', 0.779) + ";", 1),
  ("const screwPackCost=screwPackRate?screwPackRate.cost:22;", "const screwPackCost=screwPackRate?screwPackRate.cost:" + pb('act.screws', 'mat', 22) + ";", 1),
  ("qv('tc-grid')||0.90", "qv('tc-grid')||" + pb('act.simple.grid', 'mat', 0.90), 1),
  ("qv('tc-cost')||1.20", "qv('tc-cost')||" + pb('act.simple.tile', 'mat', 1.20), 1),
  ("{desc:'— Select a 2×4 tile product (est. $1.50/SF) —',cost:1.50,", "{desc:'— Select a 2×4 tile product (est. $1.50/SF) —',cost:" + pb('act.ph.2x4', 'mat', 1.50) + ",", 1),
  ("{desc:'— Select a 2×2 tile product (est. $1.20/SF) —',cost:1.20,", "{desc:'— Select a 2×2 tile product (est. $1.20/SF) —',cost:" + pb('act.ph.2x2', 'mat', 1.20) + ",", 1),
  ("{desc:'— Select a 4×4 tile product (est. $2.00/SF) —',cost:2.00,", "{desc:'— Select a 4×4 tile product (est. $2.00/SF) —',cost:" + pb('act.ph.4x4', 'mat', 2.00) + ",", 1),
  ("_tlRate('thinset|mortar|versabond',14)", "_tlRate('thinset|mortar|versabond'," + pb('tile.thinset', 'mat', 14) + ")", 1),
  ("_tlRate('grout',18)", "_tlRate('grout'," + pb('tile.grout', 'mat', 18) + ")", 1),
  ("_tlRate('backer.*screw',9)", "_tlRate('backer.*screw'," + pb('tile.screws', 'mat', 9) + ")", 1),
  ("_frpRate('frp.*panel|frp.*sheet|frp',1.75)", "_frpRate('frp.*panel|frp.*sheet|frp'," + pb('frp.panel', 'mat', 1.75) + ")", 1),
  ("_frpRate('frp.*glue|glue.*frp|panel adhesive|construction adhesive',28)", "_frpRate('frp.*glue|glue.*frp|panel adhesive|construction adhesive'," + pb('frp.glue', 'mat', 28) + ")", 1),
  ("qv('frp-sheetrate')||20", "qv('frp-sheetrate')||" + pb('frp.install', 'lab', 20), 1),
  ("qv('frp-trimrate')||2", "qv('frp-trimrate')||" + pb('frp.trim', 'lab', 2), 1),
  ("qv('gr-labor')||25", "qv('gr-labor')||" + pb('gr.counter', 'lab', 25), 1),
  ("qv('gr-mat')||26", "qv('gr-mat')||" + pb('gr.counter', 'mat', 26), 1),
  ("qv('gr-cut-cost')||150", "qv('gr-cut-cost')||" + pb('gr.cutout', 'lab', 150), 1),
  ("qv('gr-del')||150", "qv('gr-del')||" + pb('gr.delivery', 'sub', 150), 1),
  ("qv('mas-labor')||0.45", "qv('mas-labor')||" + pb('mas.brick', 'lab', 0.45), 1),
  ("qv('mas-matcost')||0.90", "qv('mas-matcost')||" + pb('mas.brick', 'mat', 0.90), 1),
  ("qv('cmu-cost')||6.50", "qv('cmu-cost')||" + pb('mas.cmu', 'mat', 6.50), 1),
  ("qv('win-lab')||150", "qv('win-lab')||" + pb('win.install', 'lab', 150), 1),
  ("qv('stu-rate')||18", "qv('stu-rate')||" + pb('stucco.sf', 'sub', 18), 1),
  ("qv('mb-rate')||13", "qv('mb-rate')||" + pb('metalbldg.sf', 'sub', 13), 1),
  ("qv('tv-mrate')||0.70", "qv('tv-mrate')||" + pb('travel.mile', 'mat', 0.70), 1),
  ("parseFloat(qs('trim-labor-lf')?.value)||1.00", "parseFloat(qs('trim-labor-lf')?.value)||" + pb('trim.labor', 'lab', '1.00'), 2),
  ("qv('ins-clg-rate')||1.15", "qv('ins-clg-rate')||" + pb('ins.ceiling', 'lab', 1.15), 1),
  ("qv('con-mat')||240", "qv('con-mat')||" + pb('con.readymix', 'mat', 240), 1),
  ("qv('con-lab')||250", "qv('con-lab')||" + pb('con.slab', 'lab', 250), 1),
  ("const defaultMat=matRate?matRate.cost:240;", "const defaultMat=matRate?matRate.cost:" + pb('con.readymix', 'mat', 240) + ";", 1),
  ("    labEl.value=250;", "    labEl.value=" + pb('con.slab', 'lab', 250) + ";", 1),
  ("    labEl.value=230;", "    labEl.value=" + pb('con.flat', 'lab', 230) + ";", 1),
  ("    labEl.value=2;", "    labEl.value=" + pb('con.laboronly', 'lab', 2) + ";", 1),
  ("qv('flr-base-labor')||0.35", "qv('flr-base-labor')||" + pb('flr.base.labor', 'lab', 0.35), 1),
  ("insWallZones.push({id:'iz'+insZoneId,wallType:'ceiling',lf:0,height:0,sf:0,rate:1.15,mult:'type'});", "insWallZones.push({id:'iz'+insZoneId,wallType:'ceiling',lf:0,height:0,sf:0,rate:" + pb('ins.ceiling', 'lab', 1.15) + ",mult:'type'});", 1),
  ("insWallZones.push({id:'iz'+insZoneId,wallType:'exterior',lf:0,height:10,sf:0,rate:1.10,mult:'type'});", "insWallZones.push({id:'iz'+insZoneId,wallType:'exterior',lf:0,height:10,sf:0,rate:" + pb('ins.wall', 'lab', 1.10) + ",mult:'type'});", 1),
  ("  if(val==='sab')z.rate=1.20;\n  else if(val==='ceiling')z.rate=1.15;\n  else if(!z.rate||z.rate===1.20||z.rate===1.15)z.rate=1.10;",
   "  var _iw=" + pb('ins.wall', 'lab', 1.10) + ",_ic=" + pb('ins.ceiling', 'lab', 1.15) + ",_is=" + pb('ins.sab', 'lab', 1.20) + ";   /* PRICEBOOK */\n  if(val==='sab')z.rate=_is;\n  else if(val==='ceiling')z.rate=_ic;\n  else if(!z.rate||z.rate===_is||z.rate===_ic)z.rate=_iw;", 1),
  ("calcNote:`$${labor}/sheet`});", "calcNote:`$${labor}/sheet`});\n    {const _fin=" + pb('dw.finish', 'lab', 0) + ";if(_fin>0&&sheets>0)allLines.push({desc:`Drywall finish labor (tape, mud, sand)${areaTag}`,cost:_fin,qty:sheets,unit:'sheet',cat:'Drywall',type:'labor',mult:zMult,calcNote:'$'+_fin+'/sheet'});}   /* PRICEBOOK: finish labor per sheet (0 = none) */", 1),
  ("z.laborPerSheet||20", "z.laborPerSheet||" + pb('ply.labor', 'lab', 20), 6),
  ("(z.rate||1.10)", "(z.rate||" + pb('ins.wall', 'lab', 1.10) + ")", 6),
  ("parseFloat(this.value)||1.10)", "parseFloat(this.value)||0)", 1),
  ("Exterior walls ($1.10/SF)", "Exterior walls ($'+" + pb('ins.wall', 'lab', 1.10) + ".toFixed(2)+'/SF)", 1),
  ("Partition / interior ($1.10/SF)", "Partition / interior ($'+" + pb('ins.wall', 'lab', 1.10) + ".toFixed(2)+'/SF)", 1),
  ("SAB — Sound Attenuation Blanket ($1.20/SF)", "SAB — Sound Attenuation Blanket ($'+" + pb('ins.sab', 'lab', 1.20) + ".toFixed(2)+'/SF)", 1),
  ("Ceiling insulation R30 ($1.15/SF)", "Ceiling insulation R30 ($'+" + pb('ins.ceiling', 'lab', 1.15) + ".toFixed(2)+'/SF)", 1),
]
for old, new, cnt in R:
    c = src.count(old)
    assert c == cnt, ('owner prices', old[:60], c, cnt)
    src = src.replace(old, new)
# metal stud / track starting prices (a matching Rate Book row still wins)
SPEC = [("label:'3-5/8\" 25ga metal stud', defaultCost:0.45,", 'frame.stud.358_25', '0.45'), ("label:'3-5/8\" 20ga metal stud', defaultCost:0.625,", 'frame.stud.358_20', '0.625'),
        ("label:'3-5/8\" 18ga metal stud', defaultCost:0.75,", 'frame.stud.358_18', '0.75'), ("label:'6\" 20ga metal stud',     defaultCost:0.88,", 'frame.stud.6_20', '0.88'),
        ("label:'6\" 18ga metal stud',     defaultCost:2.11,", 'frame.stud.6_18', '2.11'), ("label:'3-5/8\" 20ga metal track', defaultCost:0.625,", 'frame.track.358_20', '0.625'),
        ("label:'3-5/8\" 18ga metal track', defaultCost:0.75,", 'frame.track.358_18', '0.75'), ("label:'6\" 20ga metal track',    defaultCost:0.86,", 'frame.track.6_20', '0.86'),
        ("label:'6\" 18ga metal track',    defaultCost:1.86,", 'frame.track.6_18', '1.86')]
for old, id_, d in SPEC:
    assert src.count(old) == 1, ('spec', old, src.count(old))
    src = src.replace(old, old.replace('defaultCost:' + d + ',', 'defaultCost:' + pb(id_, 'mat', d) + ','))
# a Rate Book row saved in the builder's Rate Book tab goes into the Price Book (one source)
once("  saveRatesDB();clearRF();refreshCalcDropdowns();renderRB();qs('rf-msg').textContent='Saved [OK]';",
     "  saveRatesDB();clearRF();refreshCalcDropdowns();renderRB();qs('rf-msg').textContent='Saved [OK]';\n  try{ if(window._gcPBRateSaved) window._gcPBRateSaved(desc,cost,type); }catch(_pb){}   /* PRICEBOOK */", 'rate saved')

# ── 13. the rest of the builder's starting prices (overnight pass): framing zones + wood default, rafter / joist mode,
#        drywall hang + finish per sheet (owner 10/26) and the hang markup, Quick build, ACT grid by tile brand,
#        trim nails / caulk / putty, concrete footer zone; tile backer boards and pump trucks are set by the Price Book file ──
infunc("function calcFr(){try{", "function calcDw(){try{", [
    ("  if(frLaborRate<=0 && frLaborOpt!=='none'){\n    frLaborRate=1.25;\n  }",
     "  if(frLaborRate<=0 && frLaborOpt!=='none'){\n    frLaborRate=_gcPB('frame.wood.default','lab',1.25);   /* PRICEBOOK: no labor choice picked (wood) */\n  }", 1),
], 'calcFr wood default')
R13 = [
  # saved framing zones: the starting rate of each labor basis, and the pick lists show the Price Book price
  (r"zz.laborRate=(this.value===\'material\')?1.00:(this.value===\'sf\'?0.75:5.00);",
   r"zz.laborRate=(this.value===\'material\')?_gcPB(\'frame.metal.mat\',\'lab\',1):(this.value===\'sf\'?_gcPB(\'frame.metal.sf\',\'lab\',0.75):_gcPB(\'frame.metal.wall\',\'lab\',5));", 1),
  ("[0.50,0.75,1.00].map(function(v){return '<option value=\"'+v.toFixed(2)+'\"'+(Math.abs((z.laborRate||1)-v)<0.001?",
   "_gcPBOpts([0.50,0.75,1.00],_gcPB('frame.metal.mat','lab',1),z.laborRate).map(function(v){return '<option value=\"'+v.toFixed(2)+'\"'+(Math.abs((z.laborRate||1)-v)<0.001?", 1),
  ("[4.00,4.50,5.00,6.00].map(function(v){return '<option value=\"'+v.toFixed(2)+'\"'+(Math.abs((z.laborRate||5)-v)<0.001?",
   "_gcPBOpts([4.00,4.50,5.00,6.00],_gcPB('frame.metal.wall','lab',5),z.laborRate).map(function(v){return '<option value=\"'+v.toFixed(2)+'\"'+(Math.abs((z.laborRate||5)-v)<0.001?", 1),
  ("+(z.laborRate!=null?z.laborRate:0.75)+", "+(z.laborRate!=null?z.laborRate:_gcPB('frame.metal.sf','lab',0.75))+", 1),
  # framing calculator, Rafter / Joist mode: the size label comes from the pick list, not from the price
  ("  var rafterCost=parseFloat(qvs('fr-rafter-size'))||0.707;", "  var rafterCost=parseFloat(qvs('fr-rafter-size'))||_gcPB('frame.rafter.2x8','mat',0.707);", 1),
  ("var rafterSizeLabel=rafterCost<=0.366?'2×4':rafterCost<=0.574?'2×6':rafterCost<=0.708?'2×8':rafterCost<=0.625?'2×10':'2×12';",
   "var rafterSizeLabel=_gcSelLbl('fr-rafter-size',rafterCost<=0.366?'2×4':rafterCost<=0.574?'2×6':rafterCost<=0.708?'2×8':rafterCost<=0.625?'2×10':'2×12');   /* PRICEBOOK */", 1),
  ("var ridgeSizeLabel=ridgeCost<=0.708?'2×8':ridgeCost<=0.625?'2×10':'2×12';",
   "var ridgeSizeLabel=_gcSelLbl('fr-ridge',ridgeCost<=0.708?'2×8':ridgeCost<=0.625?'2×10':'2×12');", 1),
  # Quick build
  ("const laborR=qbTier>=10000?4.50:qbTier>=5000?5.00:5.50;", "const laborR=qbTier>=10000?_gcPB('frame.large','lab',4.50):qbTier>=5000?_gcPB('frame.medium','lab',5.00):_gcPB('frame.small','lab',5.50);   /* PRICEBOOK */", 1),
  ("const sheets=Math.ceil(wallSF*1.05/dwsize),matCost=sheets*22,extras=sheets*3;", "const _qbS=_gcPB('dw.quick.sheet','mat',22),_qbX=_gcPB('dw.quick.extras','mat',3),_qbHF=_gcPB('dw.hangfinish','lab',0);   /* PRICEBOOK */\n    const sheets=Math.ceil(wallSF*1.05/dwsize),matCost=sheets*_qbS,extras=sheets*_qbX;", 1),
  ("const laborRate=dwsize===32?35:dwsize===40?28:30;", "const laborRate=_qbHF>0?_qbHF:dwsize===32?_gcPB('dw.quick.hang.32','lab',35):dwsize===40?_gcPB('dw.quick.hang.40','lab',28):_gcPB('dw.quick.hang.48','lab',30);", 1),
  ("calcNote:'$3/sheet pre-tax'});", "calcNote:'$'+_qbX+'/sheet pre-tax'});", 1),
  ("newLines.push({id:uid(),desc:`Drywall hang labor  --  ${fmtN(sheets)} sheets`,", "newLines.push({id:uid(),desc:`Drywall ${_qbHF>0?'hang + finish':'hang'} labor  --  ${fmtN(sheets)} sheets`,", 1),
  ("cost:1.10*wallSF,qty:1,cat:'Insulation',type:'labor',mult:'type',calcNote:'$1.10/SF'}", "cost:_gcPB('ins.wall','lab',1.10)*wallSF,qty:1,cat:'Insulation',type:'labor',mult:'type',calcNote:'$'+_gcPB('ins.wall','lab',1.10).toFixed(2)+'/SF'}", 1),
  ("const paintRate=wallSF>2000?0.35:0.55;", "const paintRate=wallSF>2000?_gcPB('paint.quick.large','lab',0.35):_gcPB('paint.quick.small','lab',0.55);   /* PRICEBOOK */", 1),
  ("cost:0.10*wallSF,qty:1,cat:'Paint',type:'material',mult:'type',calcNote:'$0.10/SF pre-tax'}", "cost:_gcPB('paint.quick.mat','mat',0.10)*wallSF,qty:1,cat:'Paint',type:'material',mult:'type',calcNote:'$'+_gcPB('paint.quick.mat','mat',0.10).toFixed(2)+'/SF pre-tax'}", 1),
  ("const flrRates={lvp:1.50,lvt:1.00,tile_l:3.00,tile_s:4.00,hardwood:2.00};\n    const rate=flrRates[flrtype]||1.50;",
   "const flrRates={lvp:_gcPB('flr.lvp','lab',1.50),lvt:_gcPB('flr.quick.lvt','lab',1.00),tile_l:_gcPB('flr.tile_l','lab',3.00),tile_s:_gcPB('flr.tile_s','lab',4.00),hardwood:_gcPB('flr.hardwood','lab',2.00)};   /* PRICEBOOK */\n    const rate=flrRates[flrtype]||flrRates.lvp;", 1),
  ("cost:2.00*clgsf,qty:1,cat:'Ceilings',type:'labor',mult:'type',calcNote:'$2/SF'}", "cost:_gcPB('act.regular','lab',2.00)*clgsf,qty:1,cat:'Ceilings',type:'labor',mult:'type',calcNote:'$'+short2(_gcPB('act.regular','lab',2.00))+'/SF'}", 1),
  ("cost:clgsf*2*0.90,qty:1,cat:'Ceilings',type:'material',mult:'type',calcNote:'$0.90/LF pre-tax'}", "cost:clgsf*2*_gcPB('act.simple.grid','mat',0.90),qty:1,cat:'Ceilings',type:'material',mult:'type',calcNote:'$'+_gcPB('act.simple.grid','mat',0.90).toFixed(2)+'/LF pre-tax'}", 1),
  # ACT: the grid picked by tile brand (a Rate Book row still wins)
  ("const donnCost=donnRate?donnRate.cost:0.78;", "const donnCost=donnRate?donnRate.cost:_gcPB('act.grid.std','mat',0.78);", 1),
  ("const prelCost=prelRate?prelRate.cost:0.88;", "const prelCost=prelRate?prelRate.cost:_gcPB('act.grid.alt','mat',0.88);", 1),
  # trim: wood putty; concrete footer zone
  ("desc:'Wood putty / filler (trim job)',cost:10,", "desc:'Wood putty / filler (trim job)',cost:_gcPB('trim.putty','mat',10),", 1),
  ("const puttyTotal=10;", "const puttyTotal=_gcPB('trim.putty','mat',10);", 1),
  ("pourType:'slab',sf:0,yds:yds,matRate:240,labRate:250,pump:0,", "pourType:'slab',sf:0,yds:yds,matRate:_gcPB('con.readymix','mat',240),labRate:_gcPB('con.slab','lab',250),pump:0,", 1),
]
for old, new, cnt in R13:
    c = src.count(old)
    assert c == cnt, ('overnight prices', old[:70], c, cnt)
    src = src.replace(old, new)
# "$2/SF" in the Quick build ACT note: keep today's text when the price is $2.00
once("function buildQuick(){", "function short2(v){return Math.round(v)===v?String(v):v.toFixed(2);}   /* PRICEBOOK: $2 stays \"$2\" */\nfunction buildQuick(){", 'short2')
# drywall: hang + finish per sheet (owner 10/26: about $50 cost, priced at the normal margin); the hang-only markup is a Price Book number
infunc("function calcDw(){try{", "function calcTc(){try{", [
    ("    const labor=z.labor!=null?z.labor:sz.laborDef;\n",
     "    const _hf=typeKey!=='cement'?_gcPB('dw.hangfinish','lab',0):0;   /* PRICEBOOK: hang + finish per sheet (0 = off: hang only, finishing not priced) */\n"
     "    const _hfDef=z.labor==null||DW_SIZES.some(function(s){return s.laborDef===z.labor;});\n"
     "    const labor=_hf>0?(_hfDef?_hf:z.labor):(z.labor!=null?z.labor:sz.laborDef);\n", 1),
    ("    if(labor>0)allLines.push({desc:`Drywall hang labor${typeTag} ${sz.label}${areaTag}`,cost:laborCost/(sheets||1),qty:sheets,unit:'sheet',cat:'Drywall',type:'labor',mult:zMult==='type'?'1.6':zMult,calcNote:`$${labor}/sheet`});\n",
     "    if(_hf>0){ if(labor>0)allLines.push({desc:`Drywall hang + finish labor${typeTag} ${sz.label}${areaTag}`,cost:labor,qty:sheets,unit:'sheet',cat:'Drywall',type:'labor',mult:zMult,calcNote:`$${labor}/sheet hung + finished`}); }\n"
     "    else {\n"
     "    const _hm=_gcPB('dw.hangmult','lab',1.6);   /* PRICEBOOK: the hang-only markup (0 = the normal margin) */\n"
     "    if(labor>0)allLines.push({desc:`Drywall hang labor${typeTag} ${sz.label}${areaTag}`,cost:laborCost/(sheets||1),qty:sheets,unit:'sheet',cat:'Drywall',type:'labor',mult:zMult==='type'?(_hm>0?String(_hm):'type'):zMult,calcNote:`$${labor}/sheet`});\n", 1),
    ("/* PRICEBOOK: finish labor per sheet (0 = none) */\n", "/* PRICEBOOK: finish labor per sheet (0 = none) */\n    }\n", 1),
    ("<span style=\"color:var(--text2)\">Hang labor</span>", "<span style=\"color:var(--text2)\">${_gcPB('dw.hangfinish','lab',0)>0?'Hang + finish labor':'Hang labor'}</span>", 1),
], 'calcDw hang + finish')

# ── 11. the Price Book itself ────────────────────────────────────────────────────────────────────────
assert src.count('<script id="gc-patch-PRICEBOOK">') == 0
src = src.rstrip('\n') + '\n<script id="gc-patch-PRICEBOOK">\n' + TAIL + '\n</script>\n'
assert src.count(MARK) >= 2 and src.count('<script id="gc-patch-PRICEBOOK">') == 1
open(path, 'w', encoding='utf-8').write(src)
print('patched')
