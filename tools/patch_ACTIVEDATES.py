#!/usr/bin/env python3
"""Idempotent patch ACTIVEDATES (owner 10/30): "when marking job active require start and finish date for job in roofing
residential or commercial estimated and for insurance do what TPA says but we don't have finish dates just we log the
actual start date of construction".

tools/activedates_tail.js (window._gcAD) is the box and the rules; this script wires every place a job is set Active:
  1. the projects setter (Wn): the dates the box returned are merged into the list the save's updater gets, so the
     save that sets the job Active carries its dates (one save; nothing is ever saved Active without them);
  2. Projects list: the status select on each row (the replay runs the row's own handler: contract / draws / deposit
     warnings, tentative schedule, all as before);
  3. Job page: ✏️ Edit Project → Save with Status = active;
  4. Projects: ＋ New Project → Create with Status = active;
  5. Estimates: 🚀 Activate (makes the job Active);
  6. 🎤 voice "change status" to active;
  7. window._gcMakeJobActive (Find a job → Make Active) and window._gcCreateJobForPO (a job for an orphan PO);
  8. the customer signing in the portal (no person at the screen): the job goes Active as before and, when its
     dates are missing, the PM gets the To-Do "Add start/finish dates for <job>".
Launch Job makes the job as Bidding (not Active) and already has its Start / End Date fields, so it is not asked."""
import sys, os
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
HERE = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
MARK = '/* patch ACTIVEDATES'
if MARK in t: print('ACTIVEDATES: already patched'); sys.exit(0)
def once(a, b):
    global t
    n = t.count(a); assert n == 1, ('ACTIVEDATES anchor', n, a[:90]); t = t.replace(a, b)

# 1. the projects setter
once('Wn=(v)=>_Wn0(p=>{let r=typeof v==="function"?v(p):v;try{',
     'Wn=(v)=>_Wn0(p=>{' + MARK + ': the box\'s dates ride with the save that sets Active */const _ad=window._gcAD;let r=typeof v==="function"?v(_ad?_ad.prep(p):p):(_ad?_ad.prep(v):v);try{if(_ad)_ad.post(r);}catch(_ae){}try{')
# 2. Projects list row status select
once('onChange:function(Mt){Mt.stopPropagation();var _ns=Mt.target.value;var _os=jt.status;if(_ns===_os)return;',
     'onChange:function __gcADrow(Mt){Mt.stopPropagation();var _ns=Mt.target.value;var _os=jt.status;if(_ns===_os)return;' + MARK + ' */if(!Mt.__gcAD&&window._gcAD&&window._gcAD.block(jt,_ns,function(){__gcADrow({__gcAD:1,stopPropagation:function(){},target:{value:_ns}})},{prevStatus:_os,onCancel:function(){try{Mt.target.value=_os}catch(_e){}}}))return;')
# 3. job page: Edit Project → Save
once('onClick:()=>{const G=j.startDate,St=z.startDate,un=j.endDate,vt=z.endDate;',
     'onClick:(__adE)=>{' + MARK + ' */if(window._gcAD&&window._gcAD.form(j,z,function(d){De(Object.assign({},z,d))},__adE))return;const G=j.startDate,St=z.startDate,un=j.endDate,vt=z.endDate;')
# 4. New Project → Create
once('onClick:()=>{var _gcCanAssign=(function(){', 'onClick:(__adE)=>{var _gcCanAssign=(function(){')
once('if(!y.name){se("Name required");return}var _ds=(y.drawSchedule||"").trim();const j=$t("PRJ")',
     'if(!y.name){se("Name required");return}' + MARK + ' */if(window._gcAD&&window._gcAD.form(null,y,function(d){T(Object.assign({},y,d))},__adE))return;var _ds=(y.drawSchedule||"").trim();const j=$t("PRJ")')
once('Wn(Pt=>[...Pt,_np]);', 'try{if(window._gcAD)window._gcAD.formSaved("form:new",_np)}catch(_ade){}Wn(Pt=>[...Pt,_np]);')
# 5. Estimates: 🚀 Activate
once('onClick:function(ev){ev.stopPropagation();var _name=T.name||"Project";',
     'onClick:function(ev){ev.stopPropagation();' + MARK + ' */if(window._gcAD&&window._gcAD.fresh("est:"+T.id,{name:(T.name||"Project").replace(/ — Draft Estimate| — Final Quote/g,"").trim(),type:T.type||"Residential Reno",client:T.client,pm:T.by||n.name,source:T.source,claimNumber:T.claimNumber||T.claimNo,isInsurance:T.isInsurance,status:"bidding",startDate:Lt(),endDate:""},ev))return;var _name=T.name||"Project";')
once('tentativeSchedule:T.tentativeSchedule||[]};try{if(window._gcJA)window._gcJA.stamp(_proj,"estimate")}catch(_ja){}',
     'tentativeSchedule:T.tentativeSchedule||[]};try{if(window._gcAD)Object.assign(_proj,window._gcAD.take("est:"+T.id,_proj))}catch(_ade){}try{if(window._gcJA)window._gcJA.stamp(_proj,"estimate")}catch(_ja){}')
once('title:_proj.name+" start",pid:_proj.id,date:Lt(),', 'title:_proj.name+" start",pid:_proj.id,date:_proj.startDate||Lt(),')
# 6. voice: change status
once('g.action==="change_status"&&H&&te.status&&(Wn(_=>_.map(Q=>Q.id===H?{...Q,status:te.status}:Q)),se(`🎤 ${g.projectName} → ${te.status}`))',
     'g.action==="change_status"&&H&&te.status&&(function(){' + MARK + ' */var __j=Wt.find(function(Q){return Q&&Q.id===H}),__go=function(__pt){Wn(_=>_.map(Q=>Q.id===H?{...Q,...(__pt||{}),status:te.status}:Q)),se(`🎤 ${g.projectName} → ${te.status}`)};if(window._gcAD&&__j)window._gcAD.askFor(__j,te.status).then(function(__r){if(__r)__go(__r.patch)});else __go()})()')
# 7a. Find a job → Make Active
once("""window._gcMakeJobActive = async function(idOrName){
  var k=low(idOrName);
  var found=null;""", """window._gcMakeJobActive = async function(idOrName){
  var k=low(idOrName);
  var found=null;
  """ + MARK + """: the box first (dates, or an admin's Skip for now); Cancel changes nothing */
  var __adPatch={};
  try{ var __adJob=projects().filter(function(p){ return p && (low(p.id)===k || low(nameOf(p))===k); })[0];
    if(__adJob && window._gcAD){ var __adR=await window._gcAD.askFor(__adJob, 'active'); if(!__adR) return null; __adPatch=__adR.patch||{}; } }catch(_ade){}""")
once("""      return Object.assign({}, p, {status:'active', statusChangedAt:new Date().toISOString()});""",
     """      return Object.assign({}, p, __adPatch, {status:'active', statusChangedAt:new Date().toISOString()});""")
# 7b. a job for an orphan PO (made Active)
once("""  var name=String(nameOverride||guessJobName(inv)||('PO '+inv.po)).trim();
  var today=new Date().toISOString().slice(0,10);""", """  var name=String(nameOverride||guessJobName(inv)||('PO '+inv.po)).trim();
  var today=new Date().toISOString().slice(0,10);
  """ + MARK + """: the new job is Active — the box first */
  var __adR={patch:{}}; try{ if(window._gcAD){ __adR=await window._gcAD.askFor({ name:name, type:'Construction', status:'bidding', startDate:today, endDate:'' }, 'active'); if(!__adR) return null; } }catch(_ade){ __adR={patch:{}}; }""")
once("""    createdFrom:'sub invoice '+(inv.po||''), scope:''
  };""", """    createdFrom:'sub invoice '+(inv.po||''), scope:''
  };
  Object.assign(proj, (__adR&&__adR.patch)||{});
  try{ if(__adR&&__adR.skip&&window._gcAD) window._gcAD.pmTodo(proj, 'Made Active (a job for PO '+(inv.po||'')+') without its dates (Skip for now).'); }catch(_ade){}""")
# 8. the customer signed in the portal → Active; missing dates → the PM's To-Do
once("""{ q.status = 'active'; q.statusChangedAt = nowIso(); q.soldAt = q.soldAt || s(r.signed.at); }""",
     """{ q.status = 'active'; q.statusChangedAt = nowIso(); q.soldAt = q.soldAt || s(r.signed.at); try { if (W._gcAD) W._gcAD.autoTodo(q); } catch (_ade) {} }   """ + MARK + """ */""")

TAIL = open(os.path.join(HERE, 'activedates_tail.js'), encoding='utf-8').read().rstrip('\n')
assert '</script>' not in TAIL
assert t.rstrip().endswith('</script>'), 'ACTIVEDATES: file does not end with a script'
t = t.rstrip('\n') + '\n<script id="gc-patch-activedates">\n' + TAIL + '\n</script>\n'
open(p, 'w', encoding='utf-8').write(t); print('ACTIVEDATES: patched')
