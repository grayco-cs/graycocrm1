/* ===================================================================
   GrayCo CRM — PROJECT RECOVERY
   Paste this whole thing into the browser console on the CRM, press Enter.
   It only READS at first. Nothing is changed until you run GCPUT(n).
   =================================================================== */
(function(){
'use strict';
var SB='https://ieeonhpfahmwwecizdut.supabase.co';
var KEY=(function(){try{return localStorage.getItem('grayco_sb_key')||''}catch(e){return ''}})()
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
var H={apikey:KEY,Authorization:'Bearer '+KEY};

function db(){return new Promise(function(res,rej){
  var q=indexedDB.open('grayco_crm',3);
  q.onupgradeneeded=function(){var d=q.result;if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv');};
  q.onsuccess=function(){res(q.result)};q.onerror=function(){rej(q.error)};
});}
function lget(k){return db().then(function(d){return new Promise(function(res){
  try{var r=d.transaction('kv','readonly').objectStore('kv').get(k);
    r.onsuccess=function(){res(r.result)};r.onerror=function(){res(null)};}catch(e){res(null)}
});});}
function lkeys(){return db().then(function(d){return new Promise(function(res){
  try{var r=d.transaction('kv','readonly').objectStore('kv').getAllKeys();
    r.onsuccess=function(){res(r.result||[])};r.onerror=function(){res([])};}catch(e){res([])}
});});}
function lset(k,v){return db().then(function(d){return new Promise(function(res,rej){
  var tx=d.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);
  tx.oncomplete=function(){res(true)};tx.onerror=function(){rej(tx.error)};
});});}

function cget(k){return fetch(SB+'/rest/v1/gc_kv?key=eq.'+encodeURIComponent(k)+'&select=value',{headers:H})
  .then(function(r){return r.ok?r.json():[]}).then(function(rows){return rows[0]?rows[0].value:null})
  .catch(function(){return null});}
function ckeys(){return fetch(SB+'/rest/v1/gc_kv?select=key&limit=2000',{headers:H})
  .then(function(r){return r.ok?r.json():[]}).then(function(rows){return rows.map(function(r){return r.key})})
  .catch(function(){return []});}
function cput(k,v){return fetch(SB+'/rest/v1/gc_kv',{method:'POST',
  headers:Object.assign({'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},H),
  body:JSON.stringify({key:k,value:v})}).then(function(r){return r.ok}).catch(function(){return false});}

function arr(v){ if(Array.isArray(v))return v;
  if(typeof v==='string'){try{var p=JSON.parse(v);return Array.isArray(p)?p:[]}catch(e){return []}}
  if(v&&typeof v==='object'){ if(Array.isArray(v.projects))return v.projects;
    if(v.data&&Array.isArray(v.data.projects))return v.data.projects; }
  return []; }
function projOf(v){ if(Array.isArray(v))return v;
  if(typeof v==='string'){try{v=JSON.parse(v)}catch(e){return []}}
  if(Array.isArray(v))return v;
  if(v&&typeof v==='object'){ if(Array.isArray(v.projects))return v.projects;
    if(v.data&&Array.isArray(v.data.projects))return v.data.projects;
    if(v.kv&&Array.isArray(v.kv.projects))return v.kv.projects; }
  return []; }

var FOUND=[];
window.GCFIND=async function(){
  FOUND=[];
  console.log('%c GrayCo — looking for your projects… ','background:#7f1d1d;color:#fff;font-size:15px;font-weight:bold');

  var lk=[],ck=[];
  try{ lk=await lkeys(); }catch(e){ console.warn('local IDB unreadable',e); }
  try{ ck=await ckeys(); }catch(e){}
  console.log('local keys:',lk.length,' cloud keys:',ck.length);

  async function look(label,where,key){
    var v = where==='local'? await lget(key) : await cget(key);
    var p = projOf(v);
    if(p.length){ FOUND.push({label:label,where:where,key:key,count:p.length,data:p}); }
    return p.length;
  }

  await look('LIVE local projects','local','projects');
  await look('LIVE cloud projects','cloud','projects');
  await look('safety snapshot (local)','local','gc_safety_snap_projects');
  await look('safety snapshot (cloud)','cloud','gc_safety_snap_projects');

  var bl=lk.filter(function(k){return typeof k==='string'&&k.indexOf('gc_dailybackup_')===0}).sort().reverse();
  var bc=ck.filter(function(k){return typeof k==='string'&&k.indexOf('gc_dailybackup_')===0}).sort().reverse();
  for(var i=0;i<bl.length&&i<25;i++) await look('backup '+bl[i].replace('gc_dailybackup_',''),'local',bl[i]);
  for(var j=0;j<bc.length&&j<25;j++) await look('backup '+bc[j].replace('gc_dailybackup_',''),'cloud',bc[j]);

  // anything else local that smells like a project list
  for(var m=0;m<lk.length;m++){
    var k=lk[m]; if(typeof k!=='string')continue;
    if(k==='projects'||k.indexOf('gc_dailybackup_')===0||k==='gc_safety_snap_projects')continue;
    if(!/proj|job|backup|snap|restore/i.test(k))continue;
    await look('other: '+k,'local',k);
  }

  FOUND.sort(function(a,b){return b.count-a.count});
  console.log('%c FOUND: ','background:#166534;color:#fff;font-weight:bold');
  if(!FOUND.length){ console.log('  nothing yet — send Claude a screenshot of this whole console'); return FOUND; }
  FOUND.forEach(function(f,i){
    console.log('  ['+i+'] '+f.count+' projects — '+f.label+' ('+f.where+')');
  });
  var t=null; try{ t=await lget('gc_tombstones'); }catch(e){}
  if(t) console.log('  tombstones on file:',(Array.isArray(t)?t.length:Object.keys(t||{}).length));
  console.log('%c To put a set back:  GCPUT(0)   (use the number in brackets) ','background:#1e3a8a;color:#fff;font-weight:bold');
  console.log('   To look first:      GCPEEK(0)');
  return FOUND;
};

window.GCPEEK=function(i){
  var f=FOUND[i]; if(!f){console.log('run GCFIND() first');return;}
  console.log(f.count+' projects from '+f.label);
  console.table(f.data.slice(0,40).map(function(p){return {
    name:p.name||p.jobName||p.title||'', customer:p.customer||p.client||'',
    status:p.status||'', amount:p.amount||p.contractAmount||p.total||'', id:p.id||''};}));
  return f.data;
};

window.GCPUT=async function(i){
  var f=FOUND[i]; if(!f){console.log('run GCFIND() first');return;}
  // 1. snapshot whatever is there right now, so this is never one-way
  var cur=null; try{cur=await lget('projects')}catch(e){}
  var stamp='gc_prerestore_'+new Date().toISOString().replace(/[:.]/g,'-');
  try{ await lset(stamp,cur||[]); console.log('current state saved as '+stamp); }catch(e){}

  // 2. union: keep anything currently present that the backup doesn't have
  var out=f.data.slice(), seen={};
  out.forEach(function(p){ if(p&&p.id) seen[String(p.id)]=1; });
  var extra=0;
  (Array.isArray(cur)?cur:[]).forEach(function(p){
    if(p&&p.id&&!seen[String(p.id)]){ out.push(p); extra++; }
  });

  try{ await lset('projects', out); }
  catch(e){ console.log('%c LOCAL WRITE FAILED ','background:#7f1d1d;color:#fff',e); return 0; }
  try{ localStorage.setItem('gc_last_pull_at',''); }catch(e){}
  var ok=false; try{ ok=await cput('projects', out); }catch(e){}
  console.log('%c RESTORED '+out.length+' projects on this computer'+
    (extra?(' ('+extra+' kept from what was on screen)'):''),'background:#166534;color:#fff;font-size:14px;font-weight:bold');
  console.log(ok? 'Cloud updated too — other accounts will get them.'
               : 'Cloud write did NOT go through. Your computer is fixed; tell Claude so the cloud copy gets pushed.');
  console.log('Now reload the page.');
  return out.length;
};

console.log('%c Ready. Run:  GCFIND() ','background:#7f1d1d;color:#fff;font-size:16px;font-weight:bold');
})();
