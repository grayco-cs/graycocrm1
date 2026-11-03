#!/usr/bin/env python3
"""Idempotent patch W4UPLOAD (owner 11/3: "when i enter w4 for employees this info should add in automatically but im
doing it manually"). Payroll -> Employees -> <person>: "Upload W-4 / MS 89-350" reads the form (fillable PDF fields
with pdf.js, flat PDF text, or a photo through the CRM's claude-proxy) and fills the W-4 fields for review; nothing is
saved until Save. The file is kept in the CRM file store as "W-4 (2026)" on the employee (p.taxDocs). SSN: last 4 only.
Team -> employee profile gets "W-4 & taxes ->" which opens Payroll -> Employees -> that person."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch W4UPLOAD'
if MARK in t: print('W4UPLOAD: already patched'); sys.exit(0)
def once(a, b):
    global t
    n = t.count(a); assert n == 1, ('W4UPLOAD anchor', n, a[:80]); t = t.replace(a, b)

# 1. button + saved-files line in the W-4 card
once("""      +'<b style="font-size:13px;">W-4 &amp; withholding</b>'
      +'<div style="'+CSS.sub+'">Straight off the employee’s signed W-4 (2020 or later). This drives the federal number on every check.</div>'""",
"""      +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;"><b style="font-size:13px;">W-4 &amp; withholding</b>'
      +(canEdit?'<button id="_w4Up" style="'+CSS.btn2+'">📄 Upload W-4 / MS 89-350</button>':'')+'</div>'   """ + MARK + """ */
      +'<div style="'+CSS.sub+'">Straight off the employee’s signed W-4 (2020 or later). This drives the federal number on every check.</div>'
      +'<div id="_w4Msg"></div>'
      +((p.taxDocs||[]).length?'<div style="margin-top:6px;font-size:11px;">'+(p.taxDocs||[]).map(function(d,i){ return '<a href="#" data-w4doc="'+i+'" style="color:#2563eb;margin-right:10px;">📎 '+esc(d.label||d.name)+' · '+esc(String(d.uploadedAt||'').slice(0,10))+'</a>'; }).join('')+'</div>':'')""")

# 2. wire it (after the deduction wiring)
once("""  wireDed(body,p);
  var sv=body.querySelector('#_pSaveProf');""",
"""  wireDed(body,p);
  if(window.__GC_W4UPLOAD__) window.__GC_W4UPLOAD__.wire(body,p);   /* patch W4UPLOAD */
  var sv=body.querySelector('#_pSaveProf');""")

# 3. Save keeps the uploaded file with the employee
once("""    p.otherDeductions=readDed(body);
    p.updatedAt=new Date().toISOString();""",
"""    p.otherDeductions=readDed(body);
    if(body._gcW4Doc){ var _wd=body._gcW4Doc; p.taxDocs=(p.taxDocs||[]).filter(function(d){ return d.ref!==_wd.ref; }).concat([_wd]); body._gcW4Doc=null; }   /* patch W4UPLOAD */
    p.updatedAt=new Date().toISOString();""")

# 4. open Payroll -> Employees -> a person (part 2 scope has S)
once("""window._gcPayrollOpenRun = function(id){""",
"""window._gcPayrollOpenEmp = async function(id, name){   /* patch W4UPLOAD */
  if(!P.canSee()){ alert('Payroll is for admins and the office.'); return; }
  var profs=await P.profiles();
  var q=profs.find(function(x){ return id && x.userId===id; })||profs.find(function(x){ return name && x.name===name; });
  S.tab='employees'; S.emp=q?(q.userId||q.name):(name||id||null);
  if(window._gcOpenPayrollTab) window._gcOpenPayrollTab('employees');
};
window._gcPayrollOpenRun = function(id){""")

# 5. Team -> employee profile button
once("""e.jsx("button",{style:ht,onClick:()=>ze(ye),children:"EDIT"})""",
"""e.jsx("button",{style:{...ht,background:"#0f766e",color:"#fff"},onClick:()=>{window._gcPayrollOpenEmp&&window._gcPayrollOpenEmp(ye.id,ye.name)},children:"🧾 W-4 & taxes →"}),e.jsx("button",{style:ht,onClick:()=>ze(ye),children:"EDIT"})""")

# 6. the reader
JS = r"""
<script>
/* ===== patch W4UPLOAD: read a W-4 / MS 89-350 into the payroll employee editor ===== __GC_W4UPLOAD__ */
(function(){
'use strict';
var W=typeof window!=='undefined'?window:this;
function num(s){ if(s==null) return null; var m=String(s).replace(/[$,\s]/g,'').match(/-?\d+(\.\d+)?/); return m?Math.round(parseFloat(m[0])*100)/100:null; }
function on(v){ return v===true || (v!=null && v!==false && String(v)!=='' && !/^(off|no|false|0)$/i.test(String(v))); }
var FIL={single:'Single or Married filing separately',married:'Married filing jointly',hoh:'Head of household'};
var MSF={single:'Single',married:'Married (spouse not employed)',married_sep:'Married (spouse employed)',head:'Head of family'};
function money(n){ return '$'+Number(n).toLocaleString('en-US'); }
function ssn4(s){ var d=String(s||'').replace(/\D/g,''); return d.length>=4?d.slice(-4):null; }
/* out: { form, year, vals:{data-p key: value}, found:{key: text}, info:{name,address} } */
function blank(form){ return { form:form, year:null, vals:{}, found:{}, info:{} }; }
function put(R,k,v,txt){ if(v==null || (v==='' && k!=='w4Form') || (typeof v==='number' && isNaN(v))) return; R.vals[k]=v; R.found[k]=txt!=null?txt:String(v); }
function fedFill(R,f){
  if(f.filing) put(R,'filing',f.filing,FIL[f.filing]);
  if(f.step2!=null) put(R,'multipleJobs',f.step2?'yes':'no',f.step2?'Step 2(c) checked':'Step 2(c) not checked');
  if(f.step3!=null) put(R,'dependentsCredit',f.step3,money(f.step3));
  if(f.a4!=null) put(R,'otherIncome',f.a4,money(f.a4));
  if(f.b4!=null) put(R,'deductions',f.b4,money(f.b4));
  if(f.c4!=null) put(R,'extra',f.c4,money(f.c4)+' per check');
  if(f.exempt) put(R,'exemptFed','yes','Exempt checked');
  if(f.ssn) put(R,'ssn4',f.ssn,'…'+f.ssn);
  if(R.form==='w4' && (f.filing||f.step3!=null||f.a4!=null||f.b4!=null||f.c4!=null)) put(R,'w4Form','',(R.year||'2020+')+' form (no allowances)');
}
function msFill(R,f){
  if(f.msFiling) put(R,'msFiling',f.msFiling,MSF[f.msFiling]);
  if(f.msExemption!=null) put(R,'msExemption',f.msExemption,money(f.msExemption));
  if(f.msDeps!=null) put(R,'stateDependents',f.msDeps,String(f.msDeps));
}
/* fillable PDF: fields = [{name, value, alt}] (value of a checkbox is its export value or "Off") */
function fromFields(fields, text){
  text=String(text||'');
  var isMS=/89-350|Mississippi/i.test(text) || fields.some(function(x){ return /89-?350|mississippi/i.test((x.alt||'')+' '+x.name); });
  var R=blank(isMS?'ms89350':'w4'); var ym=text.replace(/\s+/g,' ').match(/W-4\s*(2\s?0\s?\d\s?\d)/); if(ym) R.year=ym[1].replace(/\s/g,'');
  var f={}, by=function(re){ return fields.find(function(x){ return re.test(x.name); }); };
  if(!isMS){
    var c=[0,1,2].map(function(i){ return by(new RegExp('c1_1\\['+i+'\\]')); });
    if(c[0]&&on(c[0].value)) f.filing='single'; else if(c[1]&&on(c[1].value)) f.filing='married'; else if(c[2]&&on(c[2].value)) f.filing='hoh';
    var s2=by(/c1_2\[0\]/); if(s2) f.step2=on(s2.value);
    var ex=by(/c1_3\[0\]/); if(ex) f.exempt=on(ex.value);
    var g=function(k){ var x=by(new RegExp(k+'\\[0\\]')); return x?num(x.value):null; };
    f.step3=g('f1_08'); if(f.step3==null){ var k1=g('f1_06'), k2=g('f1_07'); if(k1!=null||k2!=null) f.step3=(k1||0)+(k2||0); }
    f.a4=g('f1_09'); f.b4=g('f1_10'); f.c4=g('f1_11');
    var sx=by(/f1_05\[0\]/); if(sx) f.ssn=ssn4(sx.value);
    var t=function(k){ var x=by(new RegExp(k+'\\[0\\]')); return x&&x.value?String(x.value).trim():''; };
    R.info.name=(t('f1_01')+' '+t('f1_02')).trim(); R.info.address=[t('f1_03'),t('f1_04')].filter(Boolean).join(', ');
    fedFill(R,f);
  } else {
    fields.forEach(function(x){
      var k=((x.alt||'')+' '+x.name).toLowerCase(), v=x.value, n=num(v);
      if(/social|ssn/.test(k)){ var s=ssn4(v); if(s) f.ssn=s; return; }
      if(/dependent/.test(k) && n!=null && n<20 && !/\$|amount/.test(k)){ f.msDeps=n; return; }
      if(/total exemption|exemption claimed|line 6/.test(k) && n!=null){ f.msExemption=n; return; }
      var checked=on(v) && (n==null || n>0);
      if(!checked) return;
      if(/head of family/.test(k)) f.msFiling='head';
      else if(/spouse (is )?not employed|not employed/.test(k)) f.msFiling='married';
      else if(/spouse.*employed/.test(k)) f.msFiling='married_sep';
      else if(/single/.test(k)) f.msFiling='single';
    });
    if(f.ssn) put(R,'ssn4',f.ssn,'…'+f.ssn);
    msFill(R,f);
  }
  return R;
}
/* flat PDF / plain text */
var MK='(?:☒|☑|✓|✔|■|\\[\\s*[xX✓]\\s*\\]|\\(\\s*[xX]\\s*\\)|\\bX\\b)';
function fromText(text){
  var s=String(text||'').replace(/[ \t]+/g,' ');
  var isMS=/89-350|Mississippi Employee/i.test(s);
  var R=blank(isMS?'ms89350':'w4'); var ym=s.match(/W-4\s*(2\s?0\s?\d\s?\d)/); if(ym) R.year=ym[1].replace(/\s/g,'');
  var f={}, m;
  var sx=s.match(/\b\d{3}[- ]\d{2}[- ](\d{4})\b/); if(sx) f.ssn=sx[1];
  var amt='\\$?\\s*([\\d,]+(?:\\.\\d{2})?)';
  if(!isMS){
    if(new RegExp(MK+'\\s*Single or Married filing separately','i').test(s)) f.filing='single';
    else if(new RegExp(MK+'\\s*Married filing jointly','i').test(s)) f.filing='married';
    else if(new RegExp(MK+'\\s*Head of household','i').test(s)) f.filing='hoh';
    if(new RegExp('(?:2\\s*\\(c\\)|Step 2\\s*\\(c\\))\\s*:?\\s*'+MK,'i').test(s) || new RegExp(MK+'\\s*(?:Step 2\\s*)?\\(c\\)','i').test(s)) f.step2=true;
    m=s.match(new RegExp('Enter the total here[\\s.]*3\\s*'+amt,'i')) || s.match(new RegExp('Step 3\\s*(?:total)?\\s*[:=]\\s*'+amt,'i')); if(m) f.step3=num(m[1]);
    ['a','b','c'].forEach(function(L){ var r=s.match(new RegExp('4\\s*\\(\\s*'+L+'\\s*\\)\\s*\\$\\s*([\\d,]+(?:\\.\\d{2})?)','i')); if(r) f[L+'4']=num(r[1]); });
    if(new RegExp(MK+'\\s*[^\\n]{0,30}\\bexempt','i').test(s)) f.exempt=true;
    fedFill(R,f);
  } else {
    if(new RegExp(MK+'\\s*(?:\\d\\s*)?Single','i').test(s)) f.msFiling='single';
    if(new RegExp(MK+'\\s*(?:\\d\\s*\\(?a\\)?\\s*)?Married[^\\n]{0,20}spouse (?:is )?NOT employed','i').test(s)) f.msFiling='married';
    else if(new RegExp(MK+'\\s*(?:\\d\\s*\\(?b\\)?\\s*)?Married[^\\n]{0,20}spouse (?:is )?employed','i').test(s)) f.msFiling='married_sep';
    if(new RegExp(MK+'\\s*(?:\\d\\s*)?Head of family','i').test(s)) f.msFiling='head';
    m=s.match(new RegExp('Total Exemption Claimed[^$\\d]{0,60}'+amt,'i')); if(m) f.msExemption=num(m[1]);
    m=s.match(/(\d{1,2})\s*(?:x|×|\*)\s*\$?\s*1,?500/i) || s.match(/dependents?[^\d\n]{0,40}?:\s*(\d{1,2})\b/i); if(m) f.msDeps=+m[1];
    if(f.ssn) put(R,'ssn4',f.ssn,'…'+f.ssn);
    msFill(R,f);
  }
  return R;
}
/* photo: the CRM's claude-proxy answers JSON in this shape */
var AI_ASK='This is a photo of a US Form W-4 or a Mississippi Form 89-350 (employee withholding exemption certificate). Read ONLY what is written or checked. Return ONLY JSON: {"form":"w4"|"ms89350","year":"2026","filing":"single"|"married"|"hoh"|null,"step2c":true|false|null,"step3":number|null,"step4a":number|null,"step4b":number|null,"step4c":number|null,"exempt":true|false|null,"ssnLast4":"1234"|null,"name":string|null,"msFiling":"single"|"married"|"married_sep"|"head"|null,"msExemption":number|null,"msDependents":number|null}. Give only the LAST 4 digits of the SSN. null for anything blank or unreadable.';
function fromAI(o){
  o=o||{}; var R=blank(o.form==='ms89350'?'ms89350':'w4'); R.year=o.year||null; R.info.name=o.name||'';
  if(R.form==='w4') fedFill(R,{ filing:FIL[o.filing]?o.filing:null, step2:o.step2c==null?null:!!o.step2c, step3:num(o.step3), a4:num(o.step4a), b4:num(o.step4b), c4:num(o.step4c), exempt:o.exempt===true, ssn:ssn4(o.ssnLast4) });
  else { var s=ssn4(o.ssnLast4); if(s) put(R,'ssn4',s,'…'+s); msFill(R,{ msFiling:MSF[o.msFiling]?o.msFiling:null, msExemption:num(o.msExemption), msDeps:num(o.msDependents) }); }
  return R;
}
/* the real pdf.js 3.11.174 (form fields need it); the CRM's local text-only reader (pdfjsLib.__gcLocal) is the fallback */
function loadPdf(){
  if(W.pdfjsLib && !W.pdfjsLib.__gcLocal) return Promise.resolve(W.pdfjsLib);
  var local=W.pdfjsLib&&W.pdfjsLib.__gcLocal?W.pdfjsLib:null;
  return new Promise(function(res,rej){ var s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload=function(){ var L=W.pdfjsLib&&!W.pdfjsLib.__gcLocal?W.pdfjsLib:null; if(!L){ if(local){ res(local); return; } rej(new Error('the PDF reader did not load')); return; }
      try{ L.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }catch(e){} res(L); };
    s.onerror=function(){ if(local){ if(!W.pdfjsLib) W.pdfjsLib=local; res(local); } else rej(new Error('the PDF reader did not load')); }; document.head.appendChild(s); });
}
async function readPdf(buf){
  var lib=await loadPdf(); var doc=await lib.getDocument({data:new Uint8Array(buf)}).promise;
  var fields=[], text='';
  for(var i=1;i<=Math.min(doc.numPages,3);i++){
    var pg=await doc.getPage(i);
    if(pg.getAnnotations) (await pg.getAnnotations()).forEach(function(a){ if(a.fieldName) fields.push({ name:a.fieldName, value:a.fieldValue, alt:a.alternativeText||'' }); });
    text+=' '+(await pg.getTextContent()).items.map(function(x){ return x.str; }).join(' ');
  }
  var filled=fields.some(function(x){ return x.value!=null && String(x.value)!=='' && String(x.value)!=='Off'; });
  if(filled){ var R=fromFields(fields,text); R.source='fillable PDF'; return R; }
  var T=fromText(text); T.source='PDF text'; return T;
}
async function readPhoto(file){
  var b64=await new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(String(r.result).split(',')[1]); }; r.onerror=rej; r.readAsDataURL(file); });
  var resp=await fetch('/.netlify/functions/claude-proxy',{ method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:600, messages:[{ role:'user', content:[{ type:'image', source:{ type:'base64', media_type:file.type||'image/jpeg', data:b64 }},{ type:'text', text:AI_ASK }] }] }) });
  var d=await resp.json(); var txt=(d.content||[]).map(function(c){ return c.text||''; }).join('').replace(/```json|```/g,'').trim();
  var j=txt.match(/\{[\s\S]*\}/); if(!j) throw new Error('no answer');
  var R=fromAI(JSON.parse(j[0])); R.source='photo'; return R;
}
function apply(body,R){
  var n=0;
  Array.prototype.forEach.call(body.querySelectorAll('[data-w4found]'), function(x){ x.remove(); });
  Object.keys(R.vals).forEach(function(k){
    var el=body.querySelector('[data-p="'+k+'"]'); if(!el) return;
    var v=String(R.vals[k]), changed=String(el.value)!==v;
    el.value=v; if(String(el.value)!==v) return;
    if(changed){ el.style.background='#fef9c3'; el.style.borderColor='#f59e0b'; el.setAttribute('data-w4changed','1'); n++; }
    var note=document.createElement('div'); note.setAttribute('data-w4found',k);
    note.style.cssText='font-size:10px;margin-top:2px;color:'+(changed?'#b45309':'#16a34a')+';';
    note.textContent='found: '+R.found[k]+(changed?'':' (same)');
    el.parentElement.appendChild(note);
  });
  return n;
}
function wire(body,p){
  Array.prototype.forEach.call(body.querySelectorAll('[data-w4doc]'), function(a){ a.onclick=function(e){ e.preventDefault();
    var d=(p.taxDocs||[])[+a.getAttribute('data-w4doc')]; if(d&&d.ref&&W._gcFileUrl) Promise.resolve(W._gcFileUrl(d.ref)).then(function(u){ W.open(u,'_blank'); }); }; });
  var b=body.querySelector('#_w4Up'); if(!b) return;
  b.onclick=function(){
    var inp=document.createElement('input'); inp.type='file'; inp.accept='application/pdf,.pdf,image/*';
    inp.onchange=function(){ if(inp.files&&inp.files[0]) go(body,p,inp.files[0]); }; inp.click();
  };
}
async function go(body,p,file){
  var msg=body.querySelector('#_w4Msg'), say=function(h,c){ if(msg) msg.innerHTML='<div style="margin-top:8px;font-size:12px;padding:8px 10px;border-radius:6px;background:'+(c||'#eff6ff')+';">'+h+'</div>'; };
  var isPdf=/pdf/i.test(file.type)||/\.pdf$/i.test(file.name), isImg=/^image\//i.test(file.type);
  say('Reading '+(file.name||'the form')+'…');
  var R=null;
  try{
    if(isPdf) R=await readPdf(await file.arrayBuffer());
    else if(isImg){ try{ R=await readPhoto(file); }catch(e){ say('Can’t read a photo — type it, or upload the PDF.','#fef2f2'); return; } }
    else { say('That file type isn’t a PDF or photo.','#fef2f2'); return; }
  }catch(e){ say('Could not read that file ('+(e&&e.message||e)+'). Type it, or upload the PDF.','#fef2f2'); return; }
  var keys=Object.keys(R.vals);
  if(!keys.length){ say(isPdf?'Nothing filled in was found on this '+R.source+'. If it is a scan, upload a photo of it, or type the fields.':'Nothing readable was found. Type it, or upload the PDF.','#fef2f2'); return; }
  var n=apply(body,R);
  var lab=(R.form==='ms89350'?'MS 89-350':'W-4')+' ('+(R.year||new Date().getFullYear())+')';
  var who=R.info&&R.info.name?(' for <b>'+esc(R.info.name)+'</b>'+(p.name&&R.info.name.toLowerCase().indexOf(String(p.name).split(' ').pop().toLowerCase())<0?' <b style="color:#dc2626;">— not '+esc(p.name)+'?</b>':'')):'';
  say('Read '+esc(lab)+who+' from the '+esc(R.source)+': '+keys.length+' field'+(keys.length>1?'s':'')+' found, '+n+' changed (yellow). Anything not on the form was left alone. '
    +'<b>Check them, then click “Save this employee”.</b>'+(R.info&&R.info.address?'<div style="color:#64748b;">Address on form: '+esc(R.info.address)+'</div>':''));
  if(typeof W._gcStoreFile==='function'){
    try{ var meta=await W._gcStoreFile(file,{ kind:'doc', name:lab+' — '+(p.name||'')+(isPdf?'.pdf':'') });
      if(meta&&meta.ref) body._gcW4Doc={ label:lab, ref:meta.ref, name:file.name, type:meta.type||file.type, uploadedAt:new Date().toISOString() }; }catch(e){}
  }
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
W.__GC_W4UPLOAD__={ fromFields:fromFields, fromText:fromText, fromAI:fromAI, apply:apply, wire:wire, go:go, readPdf:readPdf };
})();
</script>"""
once("""console.log('[GC] Payroll employee profiles + pay stubs + approval alert ready.');
})();
</script>""", """console.log('[GC] Payroll employee profiles + pay stubs + approval alert ready.');
})();
</script>""" + JS)
open(p, 'w', encoding='utf-8').write(t); print('W4UPLOAD: patched')
