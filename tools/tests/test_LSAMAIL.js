const path=require('path').join(__dirname,'../../netlify/functions/_lib/bid-alerts.js');
process.env.RESEND_API_KEY='k';
const BA=require(path); const sent=[];
global.fetch=async(url,init)=>{ if(/resend/.test(url)){ sent.push(JSON.parse(init.body)); return {ok:true,status:200,json:async()=>({id:'x'})}; } return {ok:false,status:404,json:async()=>[]}; };
const store={}, kv={gc_lead_inbox_settings:{alertTo:['none']}};
const sb=async p=>{ const m=/^gc_kv\?select=value&key=eq\.(.+)$/.exec(p); if(m){ const k=decodeURIComponent(m[1]); return {ok:true,json:async()=>(k in kv?[{value:kv[k]}]:[])}; } return {ok:false,json:async()=>[]}; };
const ENV={RESEND_API_KEY:'k',OWNER_EMAILS:'',CRM_URL:'https://crm.test'};
const A=BA.make({env:k=>ENV[k]!=null?ENV[k]:'',s:v=>v==null?'':String(v).trim(),low:v=>v==null?'':String(v).trim().toLowerCase(),arr:v=>Array.isArray(v)?v:[],nowIso:()=>new Date().toISOString(),sb,kvGet:async k=>store[k],kvCas:async(k,fn)=>{const nv=fn(store[k]); if(nv!==undefined) store[k]=nv; return {value:store[k]};},now:()=>Date.now()});
(async()=>{
 await A.notifyNew([{id:'l1',title:'Roof replacement quote',source:'Google LSA',leadExtra:{leadSource:'Google LSA',lsaCheck:'pending'},contact:{name:'Pat',phone:'9015550111'}}]);
 await A.notifyNew([{id:'l2',title:'Kitchen remodel',source:'Website',contact:{name:'Q'}}]);
 console.log(JSON.stringify(sent.map(b=>[b.subject,b.to])));
 const ok=sent.length===1 && ['wjohnson@grayco-cs.com','nthomas@grayco-cs.com','office@grayco-cs.com'].every(e=>sent[0].to.includes(e)) && /Google LSA lead/.test(sent[0].subject);
 console.log(ok?'PASS LSA → Wesley + Nick + office (even with lead e-mails off); a normal lead is not sent':'FAIL'); process.exit(ok?0:1);
})();
