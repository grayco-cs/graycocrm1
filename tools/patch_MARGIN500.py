#!/usr/bin/env python3
"""Idempotent patch MARGIN500: "large commercial" = a commercial job OVER $500,000.

Default margins are unchanged: residential 30%, commercial $500,000 or less 25%, large commercial 20%,
insurance as set (Estimate Builder: the 30% default; Job Profit goal 40%).
  * window._gcDefaultMargin(type, total) is the one place that decides a new estimate's default margin.
  * Estimate Builder: a commercial estimate still on its default margin moves 25% <-> 20% as the running
    total crosses $500,000. A margin the estimator picked or typed is never changed. Stable rule: judged
    from COST at the 20% price (cost / 0.80 > $500,000, i.e. cost over $400,000), so the answer does not
    depend on the margin currently applied and cannot flip back and forth.
  * Job Profit margin goals: the commercial goal follows the same rule (25% goal for jobs of $500,000 or less).
  * PM Playbook text and the Admin info line say "large commercial = jobs over $500,000".
Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_MARGIN500.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
MARK = '__GC_PATCH_MARGIN500__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
def once(s, old, new, label):
    n = s.count(old); assert n == 1, ('anchor count != 1', label, n)
    return s.replace(old, new)

# 1. the helper + stable rule + auto-switch + hint (replaces _gcComMult)
old = "function _gcComMult(){var p=parseFloat(settings.comMarginPct);if(!isFinite(p)||p<=0||p>=95)p=20;return Math.round(1e4/(1-p/100))/1e4;}"
new = r"""/* __GC_PATCH_MARGIN500__  Default margin by job type and size. Large commercial = a commercial job OVER $500,000.
   Residential 30%, commercial $500,000 or less 25%, large commercial 20% (Settings "commercial margin", default 20),
   insurance = the builder's 30% default (Job Profit goal 40%).
   STABLE RULE for the builder: "over $500,000" is judged from COST priced at the large-commercial margin
   (cost / (1 - 0.20) > 500,000, i.e. cost over $400,000). That number does not depend on the margin currently applied,
   so crossing the line at 25% never drops back under it and the default cannot flip back and forth. */
var GC_LARGE_COM_TOTAL=500000;
window._gcDefaultMargin=function(type,total){
  var t=String(type||'');
  if(/insur|restor|water|fire|claim/i.test(t)&&!/commercial/i.test(t)){var ip=parseFloat(typeof settings!=='undefined'&&settings&&settings.marginPct);return (isFinite(ip)&&ip>0&&ip<95?ip:30)/100;}
  if(/commercial/i.test(t)){
    if((parseFloat(total)||0)>GC_LARGE_COM_TOTAL){var lp=parseFloat(typeof settings!=='undefined'&&settings&&settings.comMarginPct);return (isFinite(lp)&&lp>0&&lp<95?lp:20)/100;}
    return 0.25;}
  return 0.30;
};
function _gcLargeRate(){return window._gcDefaultMargin('Commercial',GC_LARGE_COM_TOTAL+1);}
function _gcRuleTotal(){var c=0;try{lines.forEach(function(l){c+=lineBaseCost(l)||0;});}catch(e){}return c/(1-_gcLargeRate());}
function _gcComPct(){return Math.round(window._gcDefaultMargin('Commercial',_gcRuleTotal())*1000)/10;}
function _gcMultOfPct(p){return Math.round(1e4/(1-p/100))/1e4;}
function _gcComMult(){return _gcMultOfPct(_gcComPct());}
var _gcAutoBusy=false;
function _gcAutoComMargin(){
  if(_gcAutoBusy)return;var s=openSlots[activeSlot];
  if(!s||s._savedEstId||s._priceByHand||s._pinned||useOvr)return;
  var el=qs('ej-type');if(!el||el.value!=='Commercial')return;
  var cur=parseFloat(jobMult),want=_gcComMult();
  var small=_gcMultOfPct(25),large=_gcMultOfPct(_gcLargeRate()*100);
  if(!(Math.abs(cur-small)<1e-9||Math.abs(cur-large)<1e-9)||Math.abs(cur-want)<1e-9)return; /* only an untouched default moves */
  _gcAutoBusy=true;try{jobMult=want;s.jobMult=want;try{updJM();}catch(e){}renderLines();}finally{_gcAutoBusy=false;}
}
function _gcLargeHint(b){
  var el=qs('ej-type'),h=qs('ej-large-hint');
  var big=!!el&&el.value==='Commercial'&&_gcRuleTotal()>GC_LARGE_COM_TOTAL;
  if(!big){if(h)h.style.display='none';return;}
  if(!h){h=document.createElement('span');h.id='ej-large-hint';h.style.cssText='margin-left:6px;padding:1px 7px;border-radius:9px;background:#e0f2fe;color:#075985;font-weight:700;font-size:10px';b.parentNode.appendChild(h);}
  var lg=_gcMultOfPct(_gcLargeRate()*100),onDef=Math.abs(parseFloat(jobMult)-lg)<1e-9;
  h.textContent='Large commercial (over $500k): default margin '+Math.round(_gcLargeRate()*100)+'%'+(onDef?'':' (your margin is kept)')+' · judged by cost over $'+Math.round(GC_LARGE_COM_TOTAL*(1-_gcLargeRate())/1000)+'k (price over $500k at '+Math.round(_gcLargeRate()*100)+'%)';
  h.style.display='';
}"""
src = once(src, old, new, 'comMult')

src = once(src, "function renderSummary(){try{try{_gcTypeBadge();}catch(_e){}",
 "function renderSummary(){try{try{_gcAutoComMargin();}catch(_e){}try{_gcTypeBadge();}catch(_e){}", 'renderSummary')

src = once(src, "((settings.comMarginPct||20)+'% margin (x'+cm+') commercial'):('x'+jm.toFixed(2)+' set by hand');}",
 "(_gcComPct()+'% margin (x'+cm+') commercial'):('x'+jm.toFixed(2)+' set by hand');try{_gcLargeHint(b);}catch(_e){}}", 'badge')

src = once(src, "est.jobType==='Commercial'?((typeof settings!=='undefined'&&settings.comMarginPct)||20):",
 "est.jobType==='Commercial'?Math.round(window._gcDefaultMargin('Commercial',est.totalCharge)*1000)/10:", 'crmfallback')

src = once(src, "var GOAL_DEFAULT = {insurance:40, residential:30, commercial:20};",
 "var GOAL_DEFAULT = {insurance:40, residential:30, commercial:20, commercialSmall:25}; /* MARGIN500: commercial = large (over $500,000); commercialSmall = $500,000 or less */", 'goaldef')
src = once(src, "var j=map[k], p=P[k]||{}, kind=jobKind(p), goal=G[kind];",
 "var j=map[k], p=P[k]||{}, kind=jobKind(p), goal=G[kind];\n    if(kind==='commercial'){ var _ct=contractWithCOs(p)||allBilled[k]||0; if(!(_ct>500000)) goal=G.commercialSmall; }", 'goalrule')
src = once(src, "⚙ Margin goals: Ins '+G.insurance+'% · Res '+G.residential+'% · Com '+G.commercial+'%</button>",
 "⚙ Margin goals: Ins '+G.insurance+'% · Res '+G.residential+'% · Com '+G.commercialSmall+'% (to $500k) / '+G.commercial+'% (over $500k)</button>", 'goalbtn')
src = once(src, "['residential','Residential (and any other type)'],['commercial','Commercial']]",
 "['residential','Residential (and any other type)'],['commercialSmall','Commercial, $500,000 or less'],['commercial','Large commercial (over $500,000)']]", 'goalrows')
src = once(src, "['insurance','residential','commercial'].forEach(function(k){ ov.querySelector('#gck-g-'+k).value=GOAL_DEFAULT[k]; });",
 "['insurance','residential','commercialSmall','commercial'].forEach(function(k){ ov.querySelector('#gck-g-'+k).value=GOAL_DEFAULT[k]; });", 'goalreset')
src = once(src, "var o={}; ['insurance','residential','commercial'].forEach(function(k){ var v=parseFloat(ov.querySelector('#gck-g-'+k).value);",
 "var o={}; ['insurance','residential','commercialSmall','commercial'].forEach(function(k){ var v=parseFloat(ov.querySelector('#gck-g-'+k).value);", 'goalsave')
src = once(src, "Owner defaults (40 / 30 / 20)", "Owner defaults (40 / 30 / 25 / 20)", 'goalresetlabel')

src = once(src, "'Residential 30%, small commercial 25%, all large commercial 20% (written in the PM Playbook and used by the Estimate Builder).'",
 "'Residential 30%, commercial jobs of $500,000 or less 25%, large commercial 20%. Large commercial = jobs over $500,000 (written in the PM Playbook and used by the Estimate Builder).'", 'admininfo')
src = once(src, r"<b>All large commercial jobs 20%<\/b> (×1.25). <b>Small commercial 25–30%<\/b> (×1.3333 to ×1.4286).",
 r"<b>Large commercial 20%<\/b> (×1.25), where large commercial = jobs over $500,000. <b>Commercial jobs of $500,000 or less 25%<\/b> (×1.3333).", 'pbbullet')
src = once(src, r"<tr><td>Large commercial<\/td><td>20% (×1.25)<\/td><\/tr>\n        <tr><td>Small commercial<\/td><td>25–30% (×1.3333 to ×1.4286)<\/td><\/tr>",
 r"<tr><td>Large commercial (jobs over $500,000)<\/td><td>20% (×1.25)<\/td><\/tr>\n        <tr><td>Commercial, $500,000 or less<\/td><td>25% (×1.3333)<\/td><\/tr>", 'pbtable')

open(path, 'w', encoding='utf-8').write(src)
print('patched')
