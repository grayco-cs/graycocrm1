#!/usr/bin/env python3
"""patch AUTOFILL (owner 11/25, job editor): typing "rramos" in CLIENT EMAIL only listed jobs ("📁 Projects") — and picking one
put the job's NAME into the e-mail box. "it should pull his email up cuz I've used it before … and autofill his phone if so".

The app-wide type-ahead (SMART AUTOCOMPLETE DROPDOWNS) now knows the client contact boxes (label "Client …"/"Customer …":
name, phone, e-mail) and lists a "👤 Customers" group first on them: distinct contacts already used (Customers list + every
job's client / clientEmail / clientPhone), matched on name, e-mail or phone digits; each row is name · e-mail · phone.
Picking one fills the box typed in and the other client boxes of the same form that are empty or already hold that same
customer's value; a box holding a different value is kept (a short note under the box says so). The e-mail and phone boxes
no longer list Projects / Subs / Team (picking one wrote a job name into them); the client name box keeps them below.
Usage: python3 tools/patch_AUTOFILL.py index.html
"""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
s = open(P, encoding='utf-8').read()
if 'AUTOFILL' in s:
    print('already patched'); sys.exit(0)

def rep(old, new):
    global s
    n = s.count(old)
    assert n == 1, (n, old[:80])
    s = s.replace(old, new)

HELPERS = r'''/* patch AUTOFILL (owner 11/25): the client name / phone / e-mail boxes offer the customers already used ("👤 Customers", first);
   a pick fills the empty client boxes of the same form, never a box that holds a different value. */
var _afCss=document.createElement("style");
_afCss.textContent="._af-cat{color:#1d4ed8!important;background:#eff6ff!important;border-bottom-color:#dbeafe!important}._ac-item._af-row{flex-wrap:wrap;gap:1px 8px}._af-row ._af-n{font-weight:600;color:#111827}._af-row ._af-d{font-size:11px;color:#4b5563;overflow-wrap:anywhere}._af-note{padding:7px 10px;font-size:11px;color:#92400e;background:#fffbeb}";
document.head.appendChild(_afCss);
function afEsc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function afNorm(p){p=String(p||"").replace(/\D/g,"");if(p.length===11&&p.charAt(0)==="1")p=p.slice(1);return p}
function afLbl(inp){
  for(var el=inp.parentElement,k=0;el&&k<3;el=el.parentElement,k++){
    for(var c=el.firstElementChild;c;c=c.nextElementSibling){ if(c.tagName==="LABEL"&&!c.querySelector("input,select,textarea"))return (c.textContent||"").trim(); }
  }
  return "";
}
function afKind(inp){
  try{
    if(!inp||inp.tagName!=="INPUT"||(inp.type&&!/^(text|search|tel|email)$/i.test(inp.type)))return "";
    var l=afLbl(inp).toLowerCase().replace(/\s+/g," ");
    if(!/^(client|customer)\b/.test(l))return "";
    if(/e-?mail/.test(l))return "email";
    if(/phone|cell|mobile/.test(l))return "phone";
    if(/^(client|customer)( name)?\s*\*?$/.test(l))return "name";
  }catch(e){}
  return "";
}
function afFields(inp){
  var own=afKind(inp),f;
  for(var el=inp.parentElement,k=0;el&&k<7;el=el.parentElement,k++){
    f={};el.querySelectorAll("input").forEach(function(i){var kk=afKind(i);if(kk&&!f[kk])f[kk]=i});
    if((f.name?1:0)+(f.email?1:0)+(f.phone?1:0)>=2)break;
  }
  f=f||{};if(own)f[own]=inp;return f;
}
var _afCache=null,_afAt=0;
function afList(){
  if(_afCache&&Date.now()-_afAt<3000)return _afCache;
  var crm=window._crm||{},out=[];
  function add(n,e,p){
    n=String(n||"").trim();e=String(e||"").trim();p=String(p||"").trim();
    var el=e.toLowerCase(),pd=afNorm(p);
    if(el.indexOf("@")<1){e="";el=""}
    if(pd.length<7){p="";pd=""}
    if(!el&&!pd)return;
    for(var i=0;i<out.length;i++){var o=out[i];
      if((el&&o.el===el)||(pd&&o.pd===pd&&(!el||!o.el))){
        if(!o.n&&n)o.n=n; if(!o.el&&el){o.e=e;o.el=el} if(!o.pd&&pd){o.p=p;o.pd=pd} o.c++; return;
      }
    }
    out.push({n:n,e:e,el:el,p:p,pd:pd,c:1});
  }
  try{(crm.customers||[]).forEach(function(c){if(c)add(c.name,c.email,c.phone)})}catch(e){}
  try{(crm.projects||[]).forEach(function(p){if(p)add(p.client,p.clientEmail,p.clientPhone)})}catch(e){}
  _afCache=out;_afAt=Date.now();return out;
}
function afSame(k,v,o){
  v=String(v||"").trim();if(!v)return false;
  if(k==="phone")return !!o.pd&&afNorm(v)===o.pd;
  if(k==="email")return !!o.el&&v.toLowerCase()===o.el;
  return !!o.n&&v.toLowerCase()===o.n.toLowerCase();
}
function afWant(o){return {name:o.n,email:o.e,phone:o.p}}
function afMatch(q,input){
  var ql=String(q||"").trim().toLowerCase();if(!ql)return [];
  var qd=afNorm(ql),dig=qd.length>=3&&!/[a-z@]/i.test(ql),F=afFields(input),own=afKind(input);
  var r=afList().filter(function(o){
    if(dig?o.pd.indexOf(qd)<0:(o.n.toLowerCase().indexOf(ql)<0&&o.el.indexOf(ql)<0))return false;
    /* nothing left to fill: every client box already holds this customer's value */
    var W=afWant(o);
    return ["name","email","phone"].some(function(k){var i=F[k];if(!i||!W[k])return false;return i===input?i.value.trim()!==W[k]:!afSame(k,i.value,o)});
  });
  r.sort(function(a,b){
    var sa=(a.el.indexOf(ql)===0||a.n.toLowerCase().indexOf(ql)===0)?1:0,sb=(b.el.indexOf(ql)===0||b.n.toLowerCase().indexOf(ql)===0)?1:0;
    return (sb-sa)||(b.c-a.c);
  });
  return r.slice(0,6);
}
function afHtml(rows){
  var h='<div class="_ac-cat _af-cat">👤 Customers</div>';
  rows.forEach(function(o,i){h+='<div class="_ac-item _af-row" data-type="cust" data-af="'+i+'" title="Fill the client name, e-mail and phone"><span class="_af-n">'+afEsc(o.n||"(no name)")+'</span><span class="_af-d">'+afEsc([o.e,o.p].filter(Boolean).join(" · "))+"</span></div>"});
  return h;
}
function afSet(i,v){
  try{
    i._afBusy=true;
    var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
    ns.call(i,v);i.dispatchEvent(new Event("input",{bubbles:true}));i.dispatchEvent(new Event("change",{bubbles:true}));
    i.dispatchEvent(new FocusEvent("focusout",{bubbles:true}));   /* forms that save on blur (defaultValue + onBlur) */
  }catch(e){}
  setTimeout(function(){i._afBusy=false},60);
}
function afPick(input,el,note){
  var o=(input._afRows||[])[+el.getAttribute("data-af")];if(!o)return;
  var F=afFields(input),W=afWant(o),orig={},plan=[],kept=[];
  ["name","email","phone"].forEach(function(k){
    var i=F[k];if(!i)return;orig[k]=i.value;if(!W[k])return;
    var cur=String(i.value||"");
    if(i===input||!cur.trim())plan.push([k,i,W[k]]);
    else if(!afSame(k,cur,o))kept.push([k,cur,W[k]]);
  });
  var steps=plan.slice();
  (function next(){
    var s=steps.shift();
    if(s){afSet(s[1],s[2]);setTimeout(next,90);return}
    /* a box whose value something else changed meanwhile (the name box's own customer lookup) gets the intended value back */
    setTimeout(function(){
      ["name","email","phone"].forEach(function(k){
        var i=F[k];if(!i||!document.contains(i))return;
        var want=orig[k];plan.forEach(function(p){if(p[0]===k)want=p[2]});
        if(want!=null&&i.value!==want)afSet(i,want);
      });
    },120);
    if(kept.length&&note)note('<div class="_af-note">'+kept.map(function(x){return "Kept the "+(x[0]==="email"?"e-mail":x[0])+" already on the form ("+afEsc(x[1])+") — this customer has "+afEsc(x[2])+"."}).join("<br>")+"</div>");
  })();
}
'''

rep('function createAC(input){\n  if(input._acInit)return;input._acInit=true;',
    HELPERS + 'function createAC(input){\n  if(input._acInit)return;input._acInit=true;')
rep('    if(!filtered.length){list.classList.remove("show");return}\n    var groups={project:[],sub:[],person:[]};',
    '    var _afK=afKind(input),_afR=_afK?afMatch(q,input):[];input._afRows=_afR;   /* AUTOFILL: client boxes — customers first; e-mail / phone: customers only */\n'
    '    if(_afK==="email"||_afK==="phone")filtered=[];\n'
    '    if(!filtered.length&&!_afR.length){list.classList.remove("show");return}\n    var groups={project:[],sub:[],person:[]};')
rep('    list.innerHTML=html;place();list.classList.add("show");selIdx=-1;\n    list.querySelectorAll("._ac-item")',
    '    if(_afR.length)html=afHtml(_afR)+html;   /* AUTOFILL */\n    list.innerHTML=html;place();list.classList.add("show");selIdx=-1;\n    list.querySelectorAll("._ac-item")')
rep('  function pick(el){\n    var name=el.getAttribute("data-name");',
    '  function pick(el){\n    if(el.getAttribute("data-type")==="cust"){list.classList.remove("show");afPick(input,el,function(h){list.innerHTML=h;place();list.classList.add("show");setTimeout(function(){if(list.querySelector("._af-note"))list.classList.remove("show")},6000)});return}   /* AUTOFILL */\n    var name=el.getAttribute("data-name");')
rep('  input.addEventListener("input",function(){show(input.value)});\n  input.addEventListener("focus",function(){if(input.value)show(input.value)});',
    '  input.addEventListener("input",function(){if(input._afBusy)return;show(input.value)});   /* AUTOFILL: not while a pick fills it */\n  input.addEventListener("focus",function(){if(input.value)show(input.value)});')
open(P, 'w', encoding='utf-8').write(s)
print('AUTOFILL patched')
