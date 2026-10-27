#!/usr/bin/env python3
"""Idempotent patch MARGINFIX: commercial default margins by size, every trade on the job margin.

  * Large commercial = price at the 25% default over $500,000, i.e. COST over $375,000 (stable: it does
    not depend on the margin applied, so moving to 20% never flips it back). Hint says "judged by cost over $375k".
  * Drywall hang labor no longer forces x1.60 (37.5%) when the zone margin is "Default": it follows the job
    margin like every other line. An explicit zone / per-line margin still wins.
  * Saved COMMERCIAL estimate whose margin is not the size default: a suggestion banner in the builder
    ("Large commercial (over $500k): default margin is 20% - Apply 20%" / 25% for $500k or less).
    Apply only on click, only on drafts (Draft / Pending Review, never Submitted/Won/Lost or sent/signed);
    it keeps explicit per-line margins (only drywall hang lines still on the old forced 1.6 are reset).
    Sent/signed estimates get the info line only. "Keep my margin" dismisses it for that estimate for good.
    The default only auto-applies to a new, untouched estimate (unchanged MARGIN500 behaviour).
  * The estimate summary shows the rule used: "Default margin: Commercial over $500k -> 20%".
Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_MARGINFIX.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
MARK = '__GC_PATCH_MARGINFIX__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_MARGIN500__' in src, 'MARGIN500 must be applied first'
def once(s, old, new, label):
    n = s.count(old); assert n == 1, ('anchor count != 1', label, n)
    return s.replace(old, new)

# 1. stable rule: judged at the 25% default price (cost over $375k)
src = once(src, "function _gcRuleTotal(){var c=0;try{lines.forEach(function(l){c+=lineBaseCost(l)||0;});}catch(e){}return c/(1-_gcLargeRate());}",
 "var GC_SMALL_COM_RATE=0.25; /* __GC_PATCH_MARGINFIX__ large = price at the 25% default over $500k = cost over $375k */\n"
 "function _gcRuleTotal(){var c=0;try{lines.forEach(function(l){c+=lineBaseCost(l)||0;});}catch(e){}return c/(1-GC_SMALL_COM_RATE);}", 'ruleTotal')
src = once(src, "' · judged by cost over $'+Math.round(GC_LARGE_COM_TOTAL*(1-_gcLargeRate())/1000)+'k (price over $500k at '+Math.round(_gcLargeRate()*100)+'%)'",
 "' · judged by cost over $'+Math.round(GC_LARGE_COM_TOTAL*(1-GC_SMALL_COM_RATE)/1000)+'k (price over $500k at '+Math.round(GC_SMALL_COM_RATE*100)+'%)'", 'hint')

# 2. drywall hang labor follows the job margin at "Default"
src = once(src, "type:'labor',mult:zMult==='type'?'1.6':zMult,calcNote:`$${labor}/sheet`}",
 "type:'labor',mult:zMult,calcNote:`$${labor}/sheet`}", 'dwhang')

# 3+4. banner on saved commercial estimates + rule line on the summary
helpers = r"""/* __GC_PATCH_MARGINFIX__ default-margin rule line + suggestion banner (saved commercial estimates). Never automatic. */
function _gcMfRec(){var s=openSlots[activeSlot];if(!s||!s._savedEstId)return null;return estimates.find(function(e){return e&&e.id===s._savedEstId;})||null;}
function _gcMfLocked(e){var re=/submitted|won|lost|sent|signed|accepted/i;if(re.test(String((qs('ej-status')||{}).value||''))||re.test(String((e&&e.status)||'')))return true;return !!(e&&(e.sentAt||e.signedAt||e.submittedAt||e.contractSignedAt||e.acceptedAt));}
function _gcMfLegacyHang(l){return !!l&&/^Drywall hang labor/.test(String(l.desc||''))&&String(l.mult)==='1.6';}
function _gcMfOff(e,id){if(e&&e.marginHintOff)return true;try{return !!JSON.parse(localStorage.getItem('gc_margin_hint_off')||'{}')[id];}catch(x){return false;}}
function _gcMfRule(){var t=(qs('ej-type')||{}).value||'Residential';
  if(t==='Commercial'){var big=_gcRuleTotal()>GC_LARGE_COM_TOTAL;return {type:t,big:big,pct:_gcComPct(),label:big?'Commercial over $500k':'Commercial $500k or less'};}
  var p=Math.round(window._gcDefaultMargin(t,0)*1000)/10;return {type:t,big:false,pct:p,label:t==='Insurance'?'Insurance':'Residential'};}
window._gcMarginRuleHTML=function(tc,tch){try{
  var r=_gcMfRule(),s=openSlots[activeSlot],out='';
  if(r.type==='Commercial'&&s&&s._savedEstId&&lines.length){var e=_gcMfRec();
    if(!_gcMfOff(e,s._savedEstId)){
      var m=_gcMultOfPct(r.pct),onDef=!useOvr&&Math.abs(parseFloat(jobMult)-m)<1e-9&&!lines.some(_gcMfLegacyHang);
      if(!onDef){var cur=tch?((tch-tc)/tch*100).toFixed(1):'0',head=(r.big?'Large commercial (over $500k)':'Commercial ($500k or less)')+': default margin is '+r.pct+'%',bs='margin-left:6px;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;';
        out='<div id="ej-margin-banner" style="background:#e0f2fe;border:.5px solid #7dd3fc;color:#075985;border-radius:var(--r);padding:.45rem .7rem;margin-bottom:.5rem;font-size:11px">'+head+' — this estimate is at '+cur+'%'
          +(_gcMfLocked(e)?' (already sent — not changed).':'. <button type="button" id="ej-margin-apply" onclick="_gcApplyRuleMargin()" style="'+bs+'background:#0369a1;color:#fff;border:0">Apply '+r.pct+'%</button>')
          +'<button type="button" id="ej-margin-keep" onclick="_gcDismissRuleMargin()" style="'+bs+'background:transparent;color:#075985;border:.5px solid #7dd3fc">Keep my margin</button></div>';}}}
  return out+'<div id="ej-margin-rule" style="font-size:11px;color:var(--text2);margin-bottom:.35rem">Default margin: '+r.label+' → '+r.pct+'%</div>';
}catch(x){return '';}};
window._gcApplyRuleMargin=function(){try{var s=openSlots[activeSlot];if(!s||!s._savedEstId)return false;var e=_gcMfRec();if(_gcMfLocked(e))return false;
  var r=_gcMfRule();if(r.type!=='Commercial')return false;var m=_gcMultOfPct(r.pct);
  lines.forEach(function(l){if(_gcMfLegacyHang(l))l.mult='type';}); /* old forced x1.6 only; explicit per-line margins are kept */
  useOvr=false;s.useOvr=false;try{var oc=qs('ovr-chk');if(oc)oc.checked=false;var ob=qs('ovr-mb');if(ob)ob.style.display='none';}catch(x){}
  jobMult=m;s.jobMult=m;s._pinned=false;s._marginRule=r.pct;s.lines=[...lines];
  try{updJM();}catch(x){}renderLines();renderSummary();try{_gcSaveSlotsDebounced();}catch(x){}
  var g=qs('save-msg');if(g){g.textContent='Margin set to the '+r.pct+'% default — press Save to keep it.';g.style.color='var(--green)';setTimeout(function(){g.textContent='';g.style.color='';},6000);}
  return true;}catch(x){console.warn('apply margin',x);return false;}};
window._gcDismissRuleMargin=function(){try{var s=openSlots[activeSlot];if(!s||!s._savedEstId)return;
  try{var k='gc_margin_hint_off',o=JSON.parse(localStorage.getItem(k)||'{}');o[s._savedEstId]=1;localStorage.setItem(k,JSON.stringify(o));}catch(x){}
  var e=_gcMfRec();if(e){e.marginHintOff=true;try{saveEstLocal();}catch(x){}}renderSummary();}catch(x){}};
function _gcSavedMult(e,ls){"""
src = once(src, "function _gcSavedMult(e,ls){", helpers, 'helpers')
src = once(src, '<div class="sect">By category</div>${rows}',
 '${window._gcMarginRuleHTML?window._gcMarginRuleHTML(tc,tch):\'\'}<div class="sect">By category</div>${rows}', 'summary')

open(path, 'w', encoding='utf-8').write(src)
print('patched MARGINFIX')
