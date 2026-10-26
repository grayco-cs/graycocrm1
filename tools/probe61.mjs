import * as H from './h.mjs';
const { b, p, errs } = await H.open(process.argv[2]);
await H.login(p);
const D='2026-11-20';
await H.seed(p,{
 projects:[{id:'PRJvd7c81ajj55u',name:'Druluck Roof/tree',status:'active'},{id:'PRJrotc1',name:'ROTC Cordova',status:'active'},{id:'PRJx',name:'Solo Job',status:'active'}],
 users:[{id:'u1',name:'Wesley Johnson',email:'wjohnson@grayco-cs.com',active:true}],
 subs:[{id:'SUB1',company:'ABC Roofing',name:'Abe Cee'},{id:'SUB2',company:'Solo Sub',name:'Sol'}],
 schedule:[
  {id:'a1',pid:'PRJvd7c81ajj55u',title:'Tear off',date:D,type:'work',subId:'SUB1',vendor:'ABC Roofing',assignee:'Wesley Johnson'},
  {id:'a2',pid:'PRJvd7c81ajj55u',title:'Tear off day 2',date:D,type:'work',subId:'SUB1',vendor:'ABC Roofing'},
  {id:'a3',pid:'PRJrotc1',title:'Flashing',date:D,type:'work',vendor:'ABC Roofing'},
  {id:'m1',pid:'PRJrotc1',title:'End Date · ROTC Cordova',date:D,type:'milestone',assignee:'Wesley Johnson'},
  {id:'m2',pid:'PRJrotc1',title:'Finish — ROTC Cordova',date:D,type:'milestone',assignee:'Wesley Johnson',vendor:'Wesley Johnson'},
  {id:'m3',pid:'PRJx',title:'Start',date:D,type:'work',vendor:'ABC Roofing'},
  {id:'s1',pid:'PRJx',title:'Install',date:D,type:'work',subId:'SUB2'},
  {id:'w1',pid:'PRJx',title:'Walk',date:D,type:'work',assignee:'Wesley Johnson'}]},9000);
const r = await p.evaluate(()=>window._gcX10.conflicts());
console.log(JSON.stringify(r));
await H.nav(p,'Admin'); await H.sleep(2500);
await H.clickText(p,'See'); await H.sleep(1500);
const t = await p.evaluate(()=>{const o=[...document.querySelectorAll('div')].filter(d=>/Booked on a day/.test(d.textContent)).pop(); return o?o.innerText:'(no overlay)';});
console.log(t);
console.log('overflow?', await p.evaluate(()=>{const e=[...document.querySelectorAll('div')].filter(d=>/is booked on/.test(d.textContent)&&d.children.length===0)[0]; return e?[e.scrollWidth,e.clientWidth]:null;}));
await p.screenshot({path:'probe61.png'});
const empty = await p.evaluate(()=>{ window._crm.schedule.length=0; return 0;});
console.log(errs.filter(e=>/PAGEERROR/.test(e)).join('\n')); await b.close();
