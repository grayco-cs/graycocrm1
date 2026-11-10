import { computer, signIn, sleep, cset, cget, resetCloud, cloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R=[]; const ok=(n,c,i)=>{R.push(!!c);console.log((c?'PASS ':'FAIL ')+n+(i!==undefined?'  '+JSON.stringify(i).slice(0,400):''));};
resetCloud();
cset('users',[{id:'u1',name:'Wesley Johnson',email:'wjohnson@grayco-cs.com',role:'Admin',payType:'owner',active:true}]);
const A=await computer('wjohnson@grayco-cs.com',{build:process.argv[2]});
const errs=[]; A.page().on('pageerror',e=>errs.push(String(e.message).slice(0,200)));
await signIn(A,'wjohnson@grayco-cs.com',15000); await sleep(8000);
await A.ev(()=>window._setView('estbuilder')); await sleep(4000);
await A.ev(()=>{ const t=[...document.querySelectorAll('#gc-est-wrap .tab')].find(x=>/calc/i.test(x.textContent)); t&&t.click(); }); await sleep(1500);
const set=async(id,v,ev='input')=>A.ev(([id,v,ev])=>{const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event(ev,{bubbles:true}));},[id,v,ev]);
// metal, new construction floor SF
await set('fr-type','metal','change'); await sleep(300);
let st=await A.ev(()=>({o:document.getElementById('fr-labor-opt').value, r:document.getElementById('fr-labor-rate').value, fsf:getComputedStyle(document.getElementById('fr-floorsf-wrap')).display}));
ok('metal keeps New construction $/floor SF, default 5.50, Floor SF shown', st.o==='sf'&&st.r==='5.50'&&st.fsf!=='none', st);
await set('fr-lf','200'); await set('fr-floorsf','3000'); await sleep(300);
let res=await A.ev(()=>document.getElementById('fr-res').innerText);
ok('metal: labor = 3,000 floor SF × $5.50 = $16,500', /3,000 floor SF/.test(res)&&/\$16500\.00/.test(res), res.split('\n').filter(l=>/labor/i.test(l)));
await set('fr-type','wood','change'); await sleep(300);
res=await A.ev(()=>document.getElementById('fr-res').innerText);
ok('wood: same $/floor SF labor', /3,000 floor SF/.test(res)&&/\$16500\.00/.test(res), res.split('\n').filter(l=>/labor/i.test(l)));
await set('fr-labor-rate','6.50'); await sleep(200);
res=await A.ev(()=>document.getElementById('fr-res').innerText);
ok('rate 6.50 → $19,500', /\$19500\.00/.test(res));
await set('fr-labor-opt','wall','change'); await sleep(300);
st=await A.ev(()=>({r:document.getElementById('fr-labor-rate').value, fsf:getComputedStyle(document.getElementById('fr-floorsf-wrap')).display, lab:document.getElementById('fr-rate-label').textContent}));
res=await A.ev(()=>document.getElementById('fr-res').innerText);
ok('partition by LF of wall: default 5.00, 200 LF → $1,000', st.r==='5.00'&&st.fsf==='none'&&/200 LF of wall/.test(res)&&/\$1000\.00/.test(res), [st, res.split('\n').filter(l=>/labor/i.test(l))]);
await set('fr-type','metal','change'); await sleep(300);
st=await A.ev(()=>document.getElementById('fr-labor-opt').value);
ok('switching to metal no longer snaps labor back to partition', st==='wall', st);
// extras: RC-1 + hat
await set('fr-rc1-lf','100'); await set('fr-hat-lf','50'); await sleep(300);
const ex=await A.ev(()=>document.getElementById('fr-extras-res').innerText);
ok('RC-1 100 LF = 9 pcs × $1.50 ($0.125/LF); hat channel priced', /9 pcs/.test(ex)&&/\$1\.50/.test(ex)&&/0\.125/.test(ex)&&/hat channel: 50 LF/.test(ex), ex);
await set('fr-lf','220'); await sleep(300);   // re-calc must keep the extras
await A.ev(()=>addCalc('fr')); await sleep(1500);
let lines=await A.ev(()=>lines.map(l=>({d:l.desc,c:l.cost,q:l.qty,t:l.type})));
ok('Add to estimate: labor $1,100 (220 LF × 5) + RC-1 + hat lines', lines.some(l=>/220 LF of wall/.test(l.d)&&Math.abs(l.c-1100)<0.01)&&lines.some(l=>/RC-1/.test(l.d)&&l.q===9&&l.c===1.5)&&lines.some(l=>/hat channel/.test(l.d)), lines.filter(l=>/labor|RC-1|hat/i.test(l.d)));
// zone with floor SF
await A.ev(()=>{const t=[...document.querySelectorAll('#gc-est-wrap .tab')].find(x=>/calc/i.test(x.textContent)); t&&t.click();}); await sleep(800);
await set('fr-labor-opt','sf','change'); await set('fr-lf','100'); await set('fr-floorsf','1000'); await sleep(200);
await A.ev(()=>addFrZone()); await sleep(500);
const z=await A.ev(()=>({z:frZones[0], cc:cc2.fr.lines.filter(l=>l.type==='labor').map(l=>[l.desc,l.cost])}));
ok('framing zone keeps floor-SF labor: 1,000 × 5.50 = $5,500', z.z.laborMode==='floor'&&z.cc.some(c=>/1,000 floor SF/.test(c[0])&&Math.abs(c[1]-5500)<0.01), z);
await A.ev(()=>{frZones=[];renderFrZones();});
// drywall DensGlass
await A.ev(()=>{ addDwZone(); }); await sleep(500);
const dg=await A.ev(()=>{ const z=dwZones[0]; const sel=[...document.querySelectorAll('#dw-zones-list select')].find(s=>[...s.options].some(o=>o.value==='densglass')); return {has:!!sel, opts:sel?[...sel.options].map(o=>o.text):[]}; });
ok('sheetrock board pull-down has DensGlass', dg.has, dg.opts);
const dgp=await A.ev(()=>getDwPrice('densglass','32'));
ok('DensGlass 4x8 price fallback $30', dgp===30, dgp);
// paint brand
await A.ev(()=>{ addPtZone(); }); await sleep(500);
const pz=await A.ev(()=>ptZones[0].id);
await A.ev(id=>ptBrandPick(id,'fc'),pz); await sleep(300);
await A.ev(id=>{ptZones.find(x=>x.id===id).matRate=31.5; ptBrandSave(id);},pz); await sleep(800);
const pr=await A.ev(()=>{const r=rates.find(x=>x.supplier==='Farrell-Calhoun'&&x.ptType==='interior'); const sel=document.querySelector('select[data-ptbrand]'); return {r:r&&[r.desc,r.cost], opts:sel?[...sel.options].map(o=>o.text):[]};});
ok('Farrell-Calhoun price saved to the rate book and shown in the pull-down', pr.r&&pr.r[1]===31.5&&pr.opts.some(t=>/Farrell-Calhoun \(\$31\.5\/gal\)/.test(t))&&pr.opts.some(t=>/Sherwin-Williams \(no price yet\)/.test(t)), pr);
await A.ev(()=>{ const z=ptZones[0]; z.sf=1000; addPtZone(); ptZones.pop(); const id2=uid(); ptZones.push({id:id2,name:'Z2',mode:'sf',type:'interior',substrate:'drywall',sf:500,gals:0,coats:2,primer:1,cov:350,laborRate:50,matRate:25,chargeRate:150,mult:'type'}); ptBrandPick(id2,'fc'); calcPaint(); });
await sleep(400);
const p2=await A.ev(()=>ptZones[1].matRate);
ok('new zone picking Farrell-Calhoun uses the saved $31.50', p2===31.5, p2);
// save estimate
const saved=await A.ev(async()=>{ const f=document.getElementById('ej-name')||document.querySelector('#gc-est-wrap input[id*="name"]'); if(f){f.value='Calc Test Job';f.dispatchEvent(new Event('input',{bubbles:true}));} await doSave(); return estimates.length;});
for(let i=0;i<20;i++){ await sleep(2000); const a=JSON.stringify(cget('estimates')||''), b=JSON.stringify(cget('__est__gc_rates_v3')||''); if(/RC-1/.test(a)&&/Farrell-Calhoun/.test(b)) break; }
const ek=cget('estimates'); const ekS=JSON.stringify(ek||'');
const mem=await A.ev(()=>estimates.some(e=>(e.lines||[]).some(l=>/RC-1/.test(l.desc))&&(e.lines||[]).some(l=>/LF of wall/.test(l.desc))));
ok('estimate saves with the RC-1 and labor lines', saved>=1 && mem, [saved, mem, /RC-1/.test(ekS)]);
const rk=cget('__est__gc_rates_v3'); ok('rate saved to the cloud', !!rk && /Farrell-Calhoun/.test(typeof rk==='string'?rk:JSON.stringify(rk)));
ok('no page errors', !errs.length, errs.slice(0,5));
console.log('RESULT', R.filter(Boolean).length+'/'+R.length);
process.exit(0);
