import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R=[]; const ok=(n,c,i)=>{R.push(!!c);console.log((c?'PASS ':'FAIL ')+n+(i!==undefined?'  '+JSON.stringify(i).slice(0,300):''));};
resetCloud();
cset('users',[{id:'u1',name:'Wesley Johnson',email:'wjohnson@grayco-cs.com',role:'Admin',payType:'owner',active:true}]);
cset('projects',[{id:'P1',name:'Waters Jackson',client:'Stoa Group',status:'bidding',autoPO:'S900'}]);
const now=new Date().toISOString();
cset('gc_sent_pdfs',[{id:'sp_a',at:now,by:'gmiller@grayco-cs.com',to:['bids@stoa.example'],subject:'Proposal',name:'GrayCo_Proposal_Framing.pdf',ref:'sb:crm-files/'+'a'.repeat(64)+'.pdf',sha256:'a'.repeat(64),size:10,pid:'P1',kind:'proposal'},
 {id:'sp_b',at:now,by:'gmiller@grayco-cs.com',to:['x@other.example'],subject:'Quote',name:'Quote_Unknown.pdf',ref:'sb:crm-files/'+'b'.repeat(64)+'.pdf',sha256:'b'.repeat(64),size:10,pid:'',kind:'proposal'}]);
const A=await computer('wjohnson@grayco-cs.com',{build:process.argv[2]});
const errs=[]; A.page().on('pageerror',e=>errs.push(String(e.message).slice(0,200)));
await signIn(A,'wjohnson@grayco-cs.com',15000); await sleep(6000);
await A.ev(()=>window._gcSentPdfs.pull(true)); await sleep(2500);
const d=await A.ev(()=>(window._crm.projectDocs||[]).filter(x=>/^SENTPDF_/.test(x.id)).map(x=>[x.id,x.pid,x.cat,x.name,x.portalShare]));
ok('matched PDF filed on the job (Sent PDFs, not in the portal)', d.length===1&&d[0][1]==='P1'&&d[0][2]==='Sent PDFs'&&d[0][4]===false, d);
const bar=await A.ev(()=>{const b=document.getElementById('gc-sentpdf-bar');return b?b.innerText:'';});
ok('Estimates screen shows the unmatched one', /not matched to a job \(1\)/.test(bar), bar);
A.prompts=['waters']; await A.ev(()=>{ window._gcSentPdfs.link(window._gcSentPdfs.unmatched()[0]); }); await sleep(6000);
ok('Link to job files it', d2===2, d2);
for(let i=0;i<10;i++){ await sleep(2000); if(/SENTPDF_sp_b/.test(JSON.stringify(cget('projectDocs')||''))) break; }
const cd=JSON.stringify(cget('projectDocs')||'');
ok('saved to the cloud', /SENTPDF_sp_a/.test(cd)&&/SENTPDF_sp_b/.test(cd));
ok('no page errors', !errs.length, errs);
console.log('RESULT', R.filter(Boolean).length+'/'+R.length); process.exit(0);
