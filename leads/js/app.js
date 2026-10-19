// GrayCo lead list. The built-in company list comes from leads/data/seed.json
// (through the leads-seed function on the website); saved work lives in the CRM's
// Supabase project (js/store.js). Opened on this computer (file:// or localhost)
// it can also run with no sign-in, saving only in this browser.
let SEED_BUILT = "";
const ME = {name:"Wesley Johnson", title:"Co-Owner", co:"GrayCo Construction Services, LLC", addr:"4007 Broadway Rd., Bartlett, TN 38135", phone:"(901) 585-0944", lic:"TN License #85034"};
const ST1 = ["To do","Started","Submitted","Approved / on list","Not needed"];
const ST2 = ["Not contacted","Reached out","Talked to someone","Meeting set","On bid list","Bidding / working","Not a fit"];
const DONE1 = new Set(["Submitted","Approved / on list","Not needed"]);
const DONE2 = new Set(["Talked to someone","Meeting set","On bid list","Bidding / working","Not a fit"]);
const KIND = {call:"Called",email:"Emailed",visit:"Visited",signup:"Signed up",talk:"Talked to someone",reply:"Got a reply",note:"Note"};

let leads = [], custom = {}, prog = {};
let local = false, cloud = false;
let ui = {tab:"1", q:"", st:"open", zone:"all", src:"", open:null, order:[], nav:null};
const $ = (s,el=document)=>el.querySelector(s);
const esc = (s)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = ()=>new Date().toISOString().slice(0,10);
const addDays=(d,n)=>{const x=new Date(d+"T12:00:00");x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
const href = (u)=>!u?"":/^https?:\/\//i.test(u)?u:"https://"+u.replace(/^\/+/,"");
const telHref=(p)=>"tel:"+String(p).replace(/[^\d+]/g,"");
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove("on"),2200)}

/* ---------- data access ---------- */
let LIST=null; function dirty(){ LIST=null; }
function allLeads(){
  if(LIST) return LIST;
  const cu=Object.values(custom).sort((a,b)=>(b.added||"").localeCompare(a.added||""));
  LIST = cu.concat(leads).map((l,i)=>[l,i]).sort((x,y)=>{const a=x[0],b=y[0];
    const ac=a.sheet==="Added by you"?1:0, bc=b.sheet==="Added by you"?1:0;
    const ai=a.phase===1&&/insurance/i.test(a.sheet)?1:0, bi=b.phase===1&&/insurance/i.test(b.sheet)?1:0;
    return a.phase-b.phase || (bc-ac) || ((b.setup?1:0)-(a.setup?1:0)) || (bi-ai) || a.pri-b.pri || ((b.inz?1:0)-(a.inz?1:0)) || x[1]-y[1];}).map(x=>x[0]);
  return LIST;
}
function byId(id){ return allLeads().find(l=>l.id===id); }
function P(id){ return prog[id] || {}; }
function statusOf(l){ const p=P(l.id); if(p.status) return p.status; if(l.init) return l.init; return l.phase===1?ST1[0]:ST2[0]; }
function isDone(l){ const s=statusOf(l); return l.phase===1?DONE1.has(s):DONE2.has(s); }
function isStarted(l){ const s=statusOf(l); return s!==ST1[0] && s!==ST2[0]; }
function contact(l){
  const c=(P(l.id).c)||{};
  return {
    name: c.name ?? l.person ?? "",
    title: c.title ?? "",
    email: c.email ?? (l.emails||[])[0] ?? "",
    email2: (l.emails||[])[1] || "",
    phone: c.phone ?? (l.phones||[])[0] ?? "",
    phone2: (l.phones||[])[1] || "",
    web: c.web ?? (l.links||[])[0] ?? "",
    web2: (l.links||[])[1] || "",
    portal: c.portal ?? (l.phase===1?((l.links||[])[0]||""):""),
    addr: c.addr ?? l.area ?? ""
  };
}
function lastTouch(l){ const g=P(l.id).log||[]; return g.length?g[g.length-1].t.slice(0,10):""; }
function followDue(l){
  const p=P(l.id); if(isDoneFinal(l)) return "";
  if(p.fu) return p.fu;
  if(statusOf(l)==="Reached out"){ const lt=lastTouch(l); if(lt) return addDays(lt,7); }
  return "";
}
function isDoneFinal(l){ const s=statusOf(l); return s==="Not a fit"||s==="Not needed"||s==="Approved / on list"; }

/* ---------- storage ---------- */
const chains = {}, pending = {}, pendingC = {}, savedC = {};
// An added or deleted company is left alone by live sync while its save is in flight
// and for a minute after (a sync that set off before the save may still be on its way).
const busyC = (id)=>pendingC[id] || Date.now()-(savedC[id]||0) < 60000;
function setSave(t,bad){ const el=document.getElementById("saveState"); if(el){ el.textContent=t; el.style.color=bad?"var(--late)":"var(--muted)"; } }
function saveProg(id){
  const body = JSON.parse(JSON.stringify(prog[id]||{})); body.upd=new Date().toISOString();
  prog[id]=body;
  if(local){ try{localStorage.setItem("gl-prog",JSON.stringify(prog)); setSave("Saved on this device");}catch(e){ setSave("Not saved",true); } return; }
  pending[id]=(pending[id]||0)+1; setSave("Saving…");
  chains[id]=(chains[id]||Promise.resolve()).then(()=>Store.saveProgress(id,JSON.parse(JSON.stringify(prog[id]))))
    .then(()=>{ setSave("Saved"); })
    .catch(e=>{ setSave("Not saved — check connection",true); if(e.code==="signed-out") return signedOut(); toast(e.code==="denied"?"You can view this list but not save changes.":"Couldn't save. Check your connection and try again."); })
    .finally(()=>{ pending[id]--; if(pending[id]<=0) delete pending[id]; });
}
function saveCustom(id){
  if(local){ dirty(); try{localStorage.setItem("gl-custom",JSON.stringify(custom))}catch(e){} return; }
  const body=custom[id];
  dirty(); setSave("Saving…"); pendingC[id]=(pendingC[id]||0)+1;
  chains["c"+id]=(chains["c"+id]||Promise.resolve()).then(()=> body? Store.saveCustom(id,JSON.parse(JSON.stringify(body))) : Store.deleteCustom(id))
    .then(()=>setSave("Saved")).catch(()=>{ setSave("Not saved — check connection",true); toast("Couldn't save the company."); })
    .finally(()=>{ savedC[id]=Date.now(); pendingC[id]--; if(pendingC[id]<=0) delete pendingC[id]; });
}
function chunk(arr){ const out=[];let cur=[],size=0; for(const it of arr){const s=JSON.stringify(it).length; if(size+s>180000&&cur.length){out.push(cur);cur=[];size=0} cur.push(it);size+=s} if(cur.length)out.push(cur); return out; }
async function saveLeadList(list,fileName){
  const at=new Date().toISOString();
  if(local){ try{localStorage.setItem("gl-leads",JSON.stringify({at,fileName,list}))}catch(e){toast("List too large to save on this device; it will reload from the built-in copy.")} return; }
  const parts=chunk(list);
  await Store.saveLeadList(parts,{at,fileName,chunks:parts.length,count:list.length});
}
async function loadLeadList(){
  if(local){ try{const x=JSON.parse(localStorage.getItem("gl-leads")||"null"); if(x&&x.at>SEED_BUILT) return x;}catch(e){} return null; }
  const x=await Store.loadLeadList();
  if(!x||!(x.meta.at>SEED_BUILT)) return null;
  return x.list.length?{...x.meta,list:x.list}:null;
}

/* ---------- sign in & loading ---------- */
const LOCAL_OK = location.protocol==="file:" || location.hostname==="localhost" || location.hostname==="127.0.0.1";
if(!LOCAL_OK) document.querySelectorAll(".local-only").forEach(el=>el.remove());
function gate(msg,{form=true,actions=false}={}){
  stopPolling();
  $("#app").hidden=true; $("#gate").hidden=false; document.body.style.overflow="";
  $("#gateMsg").textContent=msg||"Sign in with your GrayCo CRM email and password.";
  $("#loginFields").hidden=!form; $("#gateActions").hidden=!actions; $("#loginErr").hidden=true;
  if(form) setTimeout(()=>$("#loginEmail").focus(),0);
}
function showApp(){ $("#gate").hidden=true; $("#app").hidden=false; }
function signedOut(msg){ cloud=false; gate(msg||"Your sign-in has ended. Please sign in again."); }
function useSeed(x){ SEED_BUILT=x.built||""; leads=(x.leads||[]).slice(); dirty(); }

function start(){
  if(LOCAL_OK && sessionStorage.getItem("gl-mode")==="local") return startLocal();
  if(Cloud.session()) return startCloud();
  gate();
}
async function startCloud(){
  gate("Loading the team's lead list…",{form:false});
  try{
    const [seed,saved]=await Promise.all([Store.seed(),Store.load()]);
    useSeed(seed); prog=saved.prog; custom=saved.custom; dirty();
    cloud=true; local=false;
    let note="Synced";
    try{ const ls=await loadLeadList(); if(ls){ leads=ls.list; dirty(); note="Synced · spreadsheet updated "+ls.at.slice(0,10); } }catch(e){}
    $("#sync").textContent=note; $("#signOut").textContent="Sign out";
    showApp(); render(); startPolling();
  }catch(e){
    if(e.code==="signed-out") return signedOut("Please sign in again.");
    if(e.code==="no-tables") return gate("The lead list's database is not set up yet. An admin runs docs/leads-setup.sql once in Supabase (SQL Editor), then clicks Try again.",{form:false,actions:true});
    gate(e.message||"Could not load the lead list.",{form:false,actions:true});
  }
}
async function startLocal(){
  sessionStorage.setItem("gl-mode","local"); local=true; cloud=false;
  gate("Loading…",{form:false});
  try{ useSeed(await (await fetch("data/seed.json")).json()); }
  catch(e){ return gate("Couldn't read data/seed.json. Open this folder through a local web server (for example: python3 -m http.server), not as a file.",{form:false,actions:true}); }
  try{ prog=JSON.parse(localStorage.getItem("gl-prog")||"{}"); custom=JSON.parse(localStorage.getItem("gl-custom")||"{}"); }catch(e){} dirty();
  const saved=await loadLeadList(); if(saved){leads=saved.list; dirty(); $("#sync").textContent="Saved on this device · spreadsheet "+(saved.fileName||"");} else $("#sync").textContent="Saved on this device only";
  $("#signOut").textContent="Leave";
  showApp(); render();
}

// Live sync: what teammates changed shows up within about 20 seconds.
// A company with a save still in flight, or whose saved copy is older than the
// one on this screen, is left alone (so a draft autosave never undoes a click).
let pollT=null, polling=false;
function startPolling(){ stopPolling(); pollT=setInterval(pollNow,20000); }
function stopPolling(){ clearInterval(pollT); pollT=null; }
async function pollNow(){
  if(!cloud||polling||document.hidden) return;
  polling=true;
  try{
    const ch=await Store.poll();
    let changed=false;
    for(const [id,d] of Object.entries(ch.prog)){
      if(pending[id]) continue;
      const mine=prog[id];
      if(mine && mine.upd && (d.upd||"") <= mine.upd) continue;
      prog[id]=d; changed=true;
    }
    const ids=new Set(Object.keys(ch.custom));
    for(const id of Object.keys(custom)) if(!ids.has(id)&&!busyC(id)){ delete custom[id]; changed=true; }
    for(const [id,d] of Object.entries(ch.custom)){ if(!busyC(id)&&JSON.stringify(custom[id])!==JSON.stringify(d)){ custom[id]=d; changed=true; } }
    if(changed){ dirty(); scheduleRender(); }
    if(/paused/.test($("#sync").textContent)) $("#sync").textContent="Synced";
  }catch(e){
    if(e.code==="signed-out") return signedOut();
    $("#sync").textContent="Live sync paused — retrying";
  }finally{ polling=false; }
}
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) pollNow(); });

$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault(); const b=$("#loginBtn"); b.disabled=true; $("#loginErr").hidden=true;
  try{ await Cloud.signIn($("#loginEmail").value,$("#loginPass").value); $("#loginPass").value=""; sessionStorage.removeItem("gl-mode"); b.disabled=false; startCloud(); }
  catch(err){ b.disabled=false; $("#loginErr").textContent=err.message; $("#loginErr").hidden=false; }
});
$("#retryBtn").onclick=start;
$("#gateOut").onclick=()=>{ Cloud.signOut(); gate(); };
$("#localBtn")?.addEventListener("click",startLocal);
$("#signOut").onclick=()=>{
  if(ui.open) closeProfile();
  if(cloud){ Cloud.signOut(); cloud=false; } else { sessionStorage.removeItem("gl-mode"); local=false; }
  leads=[]; prog={}; custom={}; dirty(); gate();
};
// Keep the CRM's idle timer from signing someone out while they work here.
["click","keydown"].forEach(t=>document.addEventListener(t,()=>{ if(cloud) Cloud.touch(); },{passive:true}));
let rT=null; function scheduleRender(){ clearTimeout(rT); rT=setTimeout(()=>{ render(); if(ui.open && !document.activeElement?.closest?.("#prof")) renderProfile(); },120); }

/* ---------- list ---------- */
function filtered(){
  const q=ui.q.trim().toLowerCase();
  let arr = allLeads().filter(l=>{
    if(ui.tab==="fu"){ const d=followDue(l); if(!d||d>today()) return false; }
    else if(String(l.phase)!==ui.tab) return false;
    if(ui.zone==="in"&&!l.inz) return false; if(ui.zone==="out"&&l.inz) return false;
    if(ui.src && l.sheet!==ui.src) return false;
    if(ui.tab!=="fu"){
      if(ui.st==="open"&&isDone(l)) return false;
      if(ui.st==="done"&&!isDone(l)) return false;
      if(ui.st==="prog"&&!(isStarted(l)&&!isDone(l))) return false;
    }
    if(q){ const c=contact(l); const hay=(l.title+" "+c.name+" "+c.addr+" "+l.sheet+" "+(l.zone||"")+" "+(l.what||"")).toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  });
  if(ui.tab==="fu") arr.sort((a,b)=>followDue(a).localeCompare(followDue(b)));
  return arr;
}
let ORD=new Map(); function buildOrder(){ ORD=new Map(); const c={1:0,2:0}; for(const l of allLeads()){ c[l.phase]=(c[l.phase]||0)+1; ORD.set(l.id,c[l.phase]); } }
function order(l){ return ORD.get(l.id)||0; }
function groupName(l){
  if(ui.tab==="fu") return followDue(l)<today()?"Overdue":"Due today";
  if(l.setup) return "Set up first";
  if(l.sheet==="Added by you") return "Added by you";
  if(l.phase===1 && /insurance/i.test(l.sheet)) return "Insurance & restoration programs — priority 1";
  return "Priority "+l.pri+(l.inz?" — within 100 miles":" — outside 100 miles");
}
function render(){
  buildOrder();
  const all=allLeads(); const p1=all.filter(l=>l.phase===1), p2=all.filter(l=>l.phase===2);
  const d1=p1.filter(isDone).length, s2=p2.filter(isStarted).length, t2=p2.filter(isDone).length;
  const fu=all.filter(l=>{const d=followDue(l);return d&&d<=today()}).length;
  $("#n1").textContent=p1.length; $("#n2").textContent=p2.length; $("#nfu").textContent=fu;
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===ui.tab));
  if(ui.tab==="1"){ $("#bigNum").textContent=d1; $("#bigOf").textContent="of "+p1.length+" signed up"; $("#tape").style.width=(p1.length?d1/p1.length*100:0)+"%"; }
  else if(ui.tab==="2"){ $("#bigNum").textContent=s2; $("#bigOf").textContent="of "+p2.length+" contacted, "+t2+" talked to"; $("#tape").style.width=(p2.length?s2/p2.length*100:0)+"%"; }
  else { $("#bigNum").textContent=fu; $("#bigOf").textContent="follow-ups due"; $("#tape").style.width=fu?"100%":"0"; }
  // sources
  const srcs=[...new Set(all.filter(l=>ui.tab==="fu"||String(l.phase)===ui.tab).map(l=>l.sheet))];
  const sel=$("#fSrc"); const cur=ui.src; sel.innerHTML='<option value="">Every tab</option>'+srcs.map(s=>`<option ${s===cur?"selected":""}>${esc(s)}</option>`).join("");
  $("#fStatus").disabled = ui.tab==="fu";
  const arr=filtered(); ui.order=arr.map(l=>l.id);
  const firstOpen = ui.tab!=="fu" ? arr.find(l=>!isStarted(l)) : null;
  $("#listHint").textContent = ui.tab==="1" ? "Portals, plan rooms and programs to sign up for — work top to bottom." : ui.tab==="2" ? "Companies to call or email — nearest and highest priority first." : "People you reached out to over a week ago with no answer, plus follow-up dates you set.";
  if(!arr.length){ $("#list").innerHTML=`<p class="empty">${ui.tab==="fu"?"No follow-ups due. Log a call or email on any company and it will come back here in 7 days if they don't answer.":"Nothing matches. Clear the search or switch the status filter to All."}</p>`; return; }
  let html="", g=null;
  for(const l of arr){
    const gn=groupName(l);
    if(gn!==g){ if(g!==null) html+="</ol>"; html+=`<h2 class="group">${esc(gn)}</h2><ol class="list">`; g=gn; }
    html+=rowHtml(l, l===firstOpen);
  }
  html+="</ol>";
  $("#list").innerHTML=html;
}
function chipFor(l){
  const s=statusOf(l); const d=followDue(l);
  let cls = isDone(l)?"s-done":isStarted(l)?"s-go":"";
  if(ui.tab==="fu"||(d&&d<today()&&!isDone(l))) cls="s-late";
  return `<span class="chip ${cls}">${esc(ui.tab==="fu"?("Due "+d.slice(5)):s)}</span>`;
}
function rowHtml(l,next){
  const c=contact(l); const n=order(l); const tries=(P(l.id).log||[]).filter(x=>x.k==="call"||x.k==="email"||x.k==="visit").length;
  const bits=[]; if(c.name) bits.push("<b>"+esc(c.name)+"</b>"); bits.push(esc(l.sheet)); if(!l.inz&&l.zone) bits.push(esc(l.zone)); if(tries) bits.push(tries+(tries>1?" tries":" try")); const lt=lastTouch(l); if(lt) bits.push("last "+lt.slice(5));
  const q=[];
  if(c.portal) q.push(`<a class="btn" href="${esc(href(c.portal))}" target="_blank" rel="noopener" data-stop>Bid portal</a>`);
  if(c.web && c.web!==c.portal) q.push(`<a class="btn" href="${esc(href(c.web))}" target="_blank" rel="noopener" data-stop>Website</a>`);
  if(c.phone) q.push(`<a class="btn" href="${esc(telHref(c.phone))}" data-stop data-log="call" data-id="${esc(l.id)}">Call</a>`);
  if(c.email) q.push(`<button class="btn" data-stop data-draft="${esc(l.id)}">Email</button>`);
  return `<li class="row ${next?"next":""}" data-open="${esc(l.id)}" tabindex="0"><span class="num">${n}</span><div><div class="t">${esc(l.title)}</div><div class="meta">${bits.join(", ")}</div>${q.length?`<div class="quick">${q.join("")}</div>`:""}</div>${chipFor(l)}</li>`;
}

/* ---------- actions ---------- */
function ensure(id){ if(!prog[id]) prog[id]={}; return prog[id]; }
function logAct(id,k,n){
  const l=byId(id); const p=ensure(id); p.log=(p.log||[]).concat([{t:new Date().toISOString(),k,n:n||""}]).slice(-80);
  const s=statusOf(l);
  if(l.phase===2){
    if((k==="call"||k==="email"||k==="visit") && s===ST2[0]) p.status="Reached out";
    if(k==="talk"||k==="reply"){ if(ST2.indexOf(s)<2) p.status="Talked to someone"; }
    if(k==="call"||k==="email"||k==="visit"){ if(!p.fu||p.fu<=today()) p.fu=addDays(today(),7); }
    if(k==="talk"||k==="reply"){ if(p.fu&&p.fu<=today()) delete p.fu; }
  } else {
    if(k==="signup") p.status="Submitted";
    else if(s===ST1[0]) p.status="Started";
  }
  saveProg(id); render(); if(ui.open===id) renderProfile();
}

/* ---------- email drafting ---------- */
function template(l){
  const c=contact(l); const first=(c.name||"").split(/[ ,]/)[0]; const looksPerson=(c.name||"").trim().split(/\s+/).length>=2 && /^[A-Z][a-z]+$/.test(first) && !l.title.toLowerCase().includes(first.toLowerCase()) && !/^(warm|our|see|city|purchasing|property|facility|facilities|development|construction|local|via|through|nearest|usually|chamber|staff|members|brokers|center|mall)$/i.test(first); const hi=looksPerson?`Hi ${first},`:"Hello,";
  let hook=(l.how||"").replace(/\.$/,""); if(/^(Your|The|Our)\b/.test(hook)&&!/^The [A-Z]/.test(hook)) hook=hook.charAt(0).toLowerCase()+hook.slice(1); const sig=`\n\nThank you,\n${ME.name}\n${ME.title}, ${ME.co}\n${ME.addr}\n${ME.phone}\n${ME.lic}`;
  const S=l.sheet.toLowerCase(); let s,b;
  const insur = /insurance/i.test(l.sheet) || /restoration/i.test((l.raw&&l.raw.Type)||"") || /restoration/i.test(l.title);
  if(insur){ s=`Contractor network application — GrayCo Construction (insurance restoration)`; b=`${hi}\n\nGrayCo Construction Services is a licensed general contractor (up to $3 million in Tennessee, unlimited in Mississippi and Arkansas) based in Bartlett, TN, with a dedicated insurance restoration division. We handle insurance repairs and rebuilds after water, fire and storm losses on residential, multifamily and commercial properties, write our estimates in Xactimate, and self-perform all Division 9 finishes. Our team is IICRC WRT certified.\n\n${/insurance/i.test(l.sheet)?"We'd like to join "+l.title.replace(/\s*\(.*?\)\s*/g," ").replace(/\s+—.*$/,"").trim():"We'd like to be added to "+l.title.replace(/\s*\(.*?\)\s*/g," ").replace(/\s+—.*$/,"").trim()+"'s rebuild subcontractor list"} for the Memphis area, North Mississippi and East Arkansas. Could you send the application steps or connect me with the person who manages your ${/insurance/i.test(l.sheet)?"contractor network":"subcontractor list"}?`; }
  else if(l.phase===1){ s=`Vendor / bidder registration — GrayCo Construction Services`; b=`${hi}\n\nGrayCo Construction Services is a licensed general contractor (up to $3 million in Tennessee, unlimited in Mississippi and Arkansas) based in Bartlett, TN, and we self-perform all Division 9 finishes on commercial and multifamily projects. We'd like to register as a vendor and get on your bidder list for ${l.title}. Could you point me to the right registration steps or the person who keeps the bid list?`; }
  else if(S.includes("multifamily")){ s=`Drywall & paint pricing for your communities — GrayCo`; b=`${hi}\n\nI'm reaching out about ${hook||"your upcoming multifamily work"}. GrayCo self-performs all Division 9 finishes on commercial and multifamily, labor-only or furnish-and-install, and we're also a licensed general contractor (up to $3 million in Tennessee, unlimited in Mississippi and Arkansas).\n\nCould we get on your bid list for this and future projects?`; }
  else if(S.includes("architect")){ s=`Please add GrayCo to your bidder list`; b=`${hi}\n\n${hook?"I'm reaching out about your work on "+hook+".\n\n":""}GrayCo Construction Services is a licensed general contractor (up to $3 million in Tennessee, unlimited in Mississippi and Arkansas) in Bartlett, TN, and we self-perform all Division 9 finishes on commercial and multifamily projects. We'd like to be added to your invited bidder list for commercial and multifamily projects. I'm happy to send our qualification package.`; }
  else if(S.includes("home builder")){ s=`Sheetrock, framing & paint pricing for your homes — GrayCo`; b=`${hi}\n\nWe're a Division 9 subcontractor in Memphis, licensed up to $3 million in Tennessee, and we'd love to bid your sheetrock, framing and paint — and any other trade we can help with.\n\nFull transparency on pricing: $6 labor on framing, $70 a sheet turnkey for sheetrock, and under $100 a gallon turnkey for paint.\n\nWe pair competitive pricing with strict project management. Our goal is to be your easy button, so you spend less time at the jobsite and more time selling homes. We're thorough and hungry for opportunities.\n\nWould love to talk soon.`; }
  else if(S.includes("marketing")){ s=`Lead generation for a Memphis contractor`; b=`${hi}\n\nGrayCo Construction Services is a Bartlett, TN general contractor looking for more residential and small commercial leads (Google Local Services Ads, PPC and local SEO). Our site redesign is already underway. Could we set up a short call to talk about your approach, pricing and whether leads are exclusive to us?`; }
  else if(S.includes("corporate")){ s=`GC for renovations, build-outs and maintenance — GrayCo`; b=`${hi}\n\n${l.what?("I understand "+l.title+" "+(/^(runs|owns|largest|one of)/i.test(l.what)?l.what.charAt(0).toLowerCase()+l.what.slice(1):"has ongoing work in our area")+".\n\n"):""}GrayCo Construction Services is a licensed general contractor (up to $3 million in Tennessee, unlimited in Mississippi and Arkansas) in Bartlett, TN. We handle renovations, tenant build-outs and maintenance, and self-perform all Division 9 finishes on commercial and multifamily projects. We currently work for Enterprise Rent-A-Car and Renasant Bank. Could we be added to your approved contractor list?`; }
  else { s=`Add GrayCo to your subcontractor bid list`; b=`${hi}\n\nGrayCo Construction Services is a Bartlett, TN contractor that self-performs all Division 9 finishes on commercial, institutional and multifamily work, and we're also a licensed general contractor (up to $3 million in Tennessee, unlimited in Mississippi and Arkansas). We'd like to be added to your bid list${l.inz?" for Memphis-area projects":""}. I can send our qualifications and insurance certificate.`; }
  const GROW = insur ? "We're growing, our pricing is very competitive, and we'd love to be your easy button on claims in our area."
    : l.phase===1 ? "We're growing, our pricing is very competitive, and we'd love to work for you and be an easy button on your projects."
    : S.includes("multifamily") ? "We're growing, our pricing is very competitive, and we'd love to work for you and be your easy button on your communities."
    : S.includes("architect") ? "We're growing, our pricing is very competitive, and we'd love to be an easy button for your owners and project teams."
    : S.includes("corporate") ? "We're growing, our pricing is very competitive, and we'd love to work for you and be your easy button for renovations, build-outs and maintenance."
    : S.includes("marketing") ? ""
    : "We're growing, our pricing is very competitive, and we'd love to work for you and be your easy button on your Division 9 scope.";
  if(S.includes("home builder")) return {to:c.email, s, b:b+sig};
  const parts=b.split("\n\n"); const last=parts[parts.length-1];
  if(GROW){ if(parts.length>2 && /\?\s*$/.test(last) && last.length<160) parts.splice(parts.length-1,0,GROW); else parts.push(GROW); }
  b=parts.join("\n\n");
  return {to:c.email, s, b:b+sig};
}
const PJ_B="We're currently pricing a 312-unit community in Bartlett.";
const PJ_36A="We're currently pricing a 36-unit complex.", PJ_36B="We're also pricing a 36-unit complex.";
const PJ_BOTH="We're currently pricing a 312-unit community in Bartlett and a 36-unit complex.";
function hasB(t){ return t.includes(PJ_B)||t.includes(PJ_BOTH); }
function has36(t){ return t.includes(PJ_36A)||t.includes(PJ_36B)||t.includes(PJ_BOTH); }
function setProjects(text,b,u){
  let t=text; [PJ_BOTH,PJ_B,PJ_36A,PJ_36B].forEach(x=>{ t=t.split(" "+x).join("").split(x+" ").join("").split(x).join(""); });
  t=t.replace(/\n{3,}/g,"\n\n");
  const add = b&&u ? PJ_BOTH : b ? PJ_B : u ? PJ_36A : "";
  if(!add) return t;
  const parts=t.split("\n\n"); const k=parts.length>1?1:0; parts[k]=parts[k].replace(/\s*$/,"")+" "+add; return parts.join("\n\n");
}
async function claudeDraft(l, box){
  const c=contact(l); const t=template(l); const p=P(l.id);
  const replies=(p.replies||[]).map(r=>`${r.t.slice(0,10)} ${r.from||""}: ${r.said||""} (${r.outcome||""})`).join("\n");
  const prompt=`Write a short, plain business email from ${ME.name} (${ME.title}, ${ME.co}, ${ME.addr}, ${ME.phone}, ${ME.lic}).
Facts you may use about GrayCo (use no others): self-performs all Division 9 finishes on commercial and multifamily projects (say it that way — do not list individual trades or assemblies); also a licensed general contractor (up to $3 million in Tennessee, unlimited in Mississippi and Arkansas); does renovations, tenant build-outs, multifamily Division 9, insurance restoration; works for Enterprise Rent-A-Car and Renasant Bank.${(()=>{const b=document.getElementById("pjB")?.checked,u=document.getElementById("pj36")?.checked; return b&&u?" Mention that GrayCo is currently pricing a 312-unit community in Bartlett and a 36-unit complex.":b?" Mention that GrayCo is currently pricing a 312-unit community in Bartlett.":u?" Mention that GrayCo is currently pricing a 36-unit complex.":" Do not mention any specific jobs GrayCo is pricing.";})()}
${(/insurance/i.test(l.sheet)||/restoration/i.test(l.title))?"Insurance facts you must use: GrayCo has a dedicated insurance restoration division; handles insurance repairs and rebuilds after water, fire and storm losses (residential, multifamily, commercial); writes estimates in Xactimate; team is IICRC WRT certified. Mention the insurance work and the WRT certification.\n":""}${/home builder/i.test(l.sheet)?"Builder email rules: GrayCo is a Division 9 subcontractor in Memphis licensed up to $3 million in Tennessee; offer to bid sheetrock, framing, paint and any other trade; state the pricing exactly: $6 labor on framing, $70 a sheet turnkey for sheetrock, under $100 a gallon turnkey for paint; mention strict project management and being their easy button so they spend less time at the jobsite and more time selling homes; thorough and hungry for opportunities. Do NOT include the 'We're growing' sentence for builders.\n":""}Recipient: ${l.title}${c.name?(", contact "+c.name):""}. Their list: ${l.sheet}. What they do / project: ${l.what||"n/a"}. Angle to mention: ${l.how||"n/a"}. Current status: ${statusOf(l)}.${replies?"\nPrevious replies:\n"+replies:""}
Goal: ${l.phase===1?"get registered / on their bid list":"get GrayCo on their bid list or approved contractor list and set a short call"}.
Unless told otherwise above, include this sentence word for word: "${(template(l).b.match(/We're growing[^\n]*/)||["We're growing, our pricing is very competitive, and we'd love to work for you and be your easy button."])[0]}"
Rules: under 150 words, no exclamation points, one clear ask, sign with the full signature. Output exactly:
Subject: <subject line>

<body>`;
  box.textContent="Writing…";
  try{
    const txt=(await Store.draft(prompt)).trim(); const m=txt.match(/^Subject:\s*(.+)\n+([\s\S]*)$/i);
    return m?{to:t.to,s:m[1].trim(),b:m[2].trim()}:{to:t.to,s:t.s,b:txt};
  }catch(e){ box.textContent=""; if(e.code==="signed-out"){ signedOut(); return null; } toast(e.code==="rate_limited"?"Too many drafts at once — try again in a minute.":"Couldn't write a draft right now — use the template."); return null; }
}

/* ---------- profile ---------- */
function openProfile(id,focus){ if(!ui.nav||!ui.nav.includes(id)) ui.nav=ui.order.includes(id)?ui.order.slice():[id]; ui.open=id; renderProfile(focus); $("#sheet").classList.add("open"); $("#sheet").scrollTop=0; document.body.style.overflow="hidden"; }
function closeProfile(){ ui.open=null; ui.nav=null; $("#sheet").classList.remove("open"); document.body.style.overflow=""; render(); }
function fieldInput(name,label,val,type="text"){ return `<label class="f">${esc(label)}<input data-c="${name}" type="${type}" value="${esc(val)}"></label>`; }
function renderProfile(focus){
  const l=byId(ui.open); if(!l) return closeProfile();
  const p=P(l.id); const c=contact(l); const st=l.phase===1?ST1:ST2; const s=statusOf(l);
  const dr=p.draft||template(l);
  const portals=p.portals||[];
  const acts=[];
  if(c.phone) acts.push(`<a class="btn primary" href="${esc(telHref(c.phone))}" data-log="call" data-id="${esc(l.id)}">Call ${esc(c.phone)}</a>`);
  if(c.phone2) acts.push(`<a class="btn" href="${esc(telHref(c.phone2))}" data-log="call" data-id="${esc(l.id)}">Call ${esc(c.phone2)}</a>`);
  if(c.email) acts.push(`<button class="btn primary" data-jump="draftSec">Email ${esc(c.email)}</button>`);
  if(c.portal) acts.push(`<a class="btn mark" href="${esc(href(c.portal))}" target="_blank" rel="noopener">Open bid portal</a>`);
  if(c.web&&c.web!==c.portal) acts.push(`<a class="btn" href="${esc(href(c.web))}" target="_blank" rel="noopener">Website</a>`);
  if(c.web2) acts.push(`<a class="btn" href="${esc(href(c.web2))}" target="_blank" rel="noopener">${esc(c.web2.split("/")[0])}</a>`);
  portals.forEach(x=>acts.push(`<a class="btn mark" href="${esc(href(x.url))}" target="_blank" rel="noopener">${esc(x.label||"Portal")}</a>`));
  const raw=Object.entries(l.raw||{}).filter(([k])=>k!=="Priority");
  const log=(p.log||[]).slice().reverse();
  const replies=(p.replies||[]).slice().reverse();
  $("#prof").innerHTML=`
  <h2>${esc(l.title)}</h2>
  <div class="sub">${esc(l.sheet)}, priority ${l.pri}, ${l.inz?"within 100 miles":"outside 100 miles"+(l.zone?" ("+esc(l.zone)+")":"")}${l.what?"<br>"+esc(l.what):""}</div>
  <div class="bigact" style="margin:16px 0">${acts.join("")||'<span class="hint">No phone, email or link yet — add them below.</span>'}</div>

  <div class="sec"><h3>Status</h3>
    <div class="grid2">
      <label class="f">Where this stands<select data-p="status">${st.map(x=>`<option ${x===s?"selected":""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="f">Follow up on<input type="date" data-p="fu" value="${esc(p.fu||"")}"></label>
    </div>
    <h3 style="margin-top:16px">Log what you did</h3>
    <div class="pill-row">
      <button class="btn" data-log="call" data-id="${esc(l.id)}">Called</button>
      <button class="btn" data-log="email" data-id="${esc(l.id)}">Emailed</button>
      <button class="btn" data-log="visit" data-id="${esc(l.id)}">Visited</button>
      ${l.phase===1?`<button class="btn" data-log="signup" data-id="${esc(l.id)}">Signed up</button>`:""}
      <button class="btn" data-log="talk" data-id="${esc(l.id)}">Talked to someone</button>
      <button class="btn mark" data-jump="replySec">Log a reply</button>
    </div>
  </div>

  <div class="sec"><h3>Contact</h3>
    <div class="grid2">
      ${fieldInput("name","Contact person",c.name)}${fieldInput("title","Title",c.title)}
      ${fieldInput("email","Email",c.email,"email")}${fieldInput("phone","Phone",c.phone,"tel")}
      ${fieldInput("web","Website",c.web)}${fieldInput("portal","Bid portal link",c.portal)}
      ${fieldInput("addr","Address / city",c.addr)}
    </div>
    <h3 style="margin-top:16px">More bid portals</h3>
    <ul class="log">${portals.map((x,i)=>`<li><a href="${esc(href(x.url))}" target="_blank" rel="noopener">${esc(x.label||x.url)}</a> <button class="btn" style="min-height:28px;padding:2px 8px;margin-left:8px" data-delportal="${i}">Remove</button></li>`).join("")}</ul>
    <div class="grid2" style="margin-top:8px"><label class="f">Portal name<input id="plab" placeholder="e.g. BuildingConnected"></label><label class="f">Link<input id="purl" placeholder="https://…"></label></div>
    <div style="margin-top:8px"><button class="btn" id="addPortal">Add portal</button></div>
  </div>

  <div class="sec" id="draftSec"><h3>Email draft</h3>
    <div class="grid2"><label class="f">To<input id="dTo" type="email" value="${esc(dr.to||c.email)}"></label><label class="f">Subject<input id="dS" value="${esc(dr.s)}"></label></div>
    <div class="pill-row" style="margin-top:10px">
      <label class="btn" style="font-weight:500"><input type="checkbox" id="pjB" ${hasB(dr.b)?"checked":""}> Mention 312-unit Bartlett job</label>
      <label class="btn" style="font-weight:500"><input type="checkbox" id="pj36" ${has36(dr.b)?"checked":""}> Mention 36-unit job</label>
    </div>
    <label class="f" style="margin-top:10px">Message<textarea id="dB" rows="12">${esc(dr.b)}</textarea></label>
    <p class="hint draftout" id="dLive"></p>
    <div class="pill-row">
      <a class="btn primary" id="dSend" href="#">Open in email app</a>
      <button class="btn" id="dCopy">Copy</button>
      ${cloud?`<button class="btn mark" id="dClaude">Rewrite with Claude</button>`:""}
      <button class="btn" id="dReset">Reset to template</button>
    </div>
    <p class="hint">Opening it in your email app logs "Emailed" and sets a 7-day follow-up.</p>
  </div>

  <div class="sec" id="replySec"><h3>Log a reply or info you got back</h3>
    <div class="grid2">
      <label class="f">Who answered<input id="rFrom"></label><label class="f">Their title<input id="rTitle"></label>
      <label class="f">Their email<input id="rEmail" type="email"></label><label class="f">Their phone<input id="rPhone" type="tel"></label>
      <label class="f">Outcome<select id="rOut"><option>Added us to bid list</option><option>Send prequal / info</option><option>Call back later</option><option>Meeting set</option><option>Sent us a bid invite</option><option>Talk to someone else</option><option>Not now</option><option>Not a fit</option></select></label>
      <label class="f">Follow up on (optional)<input id="rFu" type="date"></label>
    </div>
    <label class="f" style="margin-top:10px">What they said / info they gave<textarea id="rSaid" rows="3"></textarea></label>
    <div style="margin-top:10px"><button class="btn primary" id="rSave">Save reply</button></div>
    ${replies.length?`<ul class="log" style="margin-top:14px">${replies.map(r=>`<li><time>${esc(r.t.slice(0,16).replace("T"," "))}</time><b>${esc(r.outcome||"")}</b>${r.from?", "+esc(r.from):""}${r.title?" ("+esc(r.title)+")":""}${r.email?", "+esc(r.email):""}${r.phone?", "+esc(r.phone):""}${r.said?"<br>"+esc(r.said):""}</li>`).join("")}</ul>`:""}
  </div>

  <div class="sec"><h3>Notes</h3><textarea data-p="notes" rows="4" style="width:100%;padding:10px;border:1px solid var(--rule);border-radius:6px;background:var(--bg)">${esc(p.notes||"")}</textarea></div>

  <div class="sec"><h3>History</h3>${log.length?`<ul class="log">${log.map(x=>`<li><time>${esc(x.t.slice(0,16).replace("T"," "))}</time>${esc(KIND[x.k]||x.k)}${x.n?": "+esc(x.n):""}</li>`).join("")}</ul>`:'<p class="hint">Nothing logged yet.</p>'}</div>

  <div class="sec"><h3>From the spreadsheet</h3>${raw.length?`<dl class="kv">${raw.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${linkify(v)}</dd>`).join("")}</dl>`:'<p class="hint">Added by you — not in the spreadsheet.</p>'}
  ${custom[l.id]?`<div style="margin-top:14px"><button class="btn" id="delCustom">Delete this company</button></div>`:""}</div>`;
  const i=ui.nav.indexOf(l.id); $("#prevP").disabled=i<=0; $("#nextP").disabled=i<0||i>=ui.nav.length-1;
  updateMailto();
  if(focus) setTimeout(()=>document.getElementById(focus)?.scrollIntoView({behavior:"smooth"}),50);
}
function linkify(v){
  let s=esc(v);
  s=s.replace(/([\w.+-]+@[\w-]+\.[a-z][\w.]*[a-z])/gi,'<a href="mailto:$1">$1</a>');
  s=s.replace(/(\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/g,(m)=>`<a href="${telHref(m)}">${m}</a>`);
  s=s.replace(/(^|[\s(|])((?:https?:\/\/)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|org|gov|net|edu|io|co|us|info)(?:\/[^\s|,;()<]*)?)/gi,(m,pre,u)=> u.includes("@")?m:`${pre}<a href="${esc(href(u))}" target="_blank" rel="noopener">${u}</a>`);
  return s;
}
function updateMailto(){
  const to=$("#dTo")?.value||"", s=$("#dS")?.value||"", b=$("#dB")?.value||"";
  const a=$("#dSend"); if(a) a.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(b)}`;
}
let dT=null;
function saveDraftSoon(){ clearTimeout(dT); dT=setTimeout(()=>{ const p=ensure(ui.open); p.draft={to:$("#dTo").value,s:$("#dS").value,b:$("#dB").value}; saveProg(ui.open); },900); }

/* ---------- events ---------- */
$("#tabs").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]"); if(!b) return; ui.tab=b.dataset.tab; ui.src=""; window.scrollTo(0,0); render();});
$("#q").addEventListener("input",e=>{ui.q=e.target.value; clearTimeout(rT); rT=setTimeout(render,150);});
$("#fStatus").addEventListener("change",e=>{ui.st=e.target.value; render();});
$("#fZone").addEventListener("change",e=>{ui.zone=e.target.value; render();});
$("#fSrc").addEventListener("change",e=>{ui.src=e.target.value; render();});
document.addEventListener("click",e=>{
  const lg=e.target.closest("[data-log]"); if(lg){ const a=lg.tagName==="A"; if(!a) e.preventDefault(); setTimeout(()=>{ logAct(lg.dataset.id,lg.dataset.log); toast(KIND[lg.dataset.log]+" logged"); }, a?400:0); return; }
  const dr=e.target.closest("[data-draft]"); if(dr){ e.preventDefault(); openProfile(dr.dataset.draft,"draftSec"); return; }
  if(e.target.closest("[data-stop]")) return;
  const o=e.target.closest("[data-open]"); if(o){ openProfile(o.dataset.open); return; }
  const j=e.target.closest("[data-jump]"); if(j){ document.getElementById(j.dataset.jump)?.scrollIntoView({behavior:"smooth"}); return; }
});
$("#list").addEventListener("keydown",e=>{ if(e.key==="Enter"){ const o=e.target.closest("[data-open]"); if(o) openProfile(o.dataset.open); }});
$("#closeP").onclick=closeProfile;
$("#prevP").onclick=()=>{const i=ui.nav.indexOf(ui.open); if(i>0) openProfile(ui.nav[i-1]);};
$("#nextP").onclick=()=>{const i=ui.nav.indexOf(ui.open); if(i>=0&&i<ui.nav.length-1) openProfile(ui.nav[i+1]);};
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&ui.open&&!document.querySelector("dialog[open]")) closeProfile(); });

const prof=$("#prof");
prof.addEventListener("change",e=>{
  const t=e.target, id=ui.open; if(!id) return;
  if(t.id==="pjB"||t.id==="pj36"){ const box=$("#dB"); box.value=setProjects(box.value,$("#pjB").checked,$("#pj36").checked); updateMailto(); saveDraftSoon(); return; }
  if(t.dataset.p==="status"){ ensure(id).status=t.value; if(isDoneFinal(byId(id))) delete prog[id].fu; saveProg(id); render(); renderProfile(); toast("Status saved"); }
  else if(t.dataset.p==="fu"){ const p=ensure(id); if(t.value) p.fu=t.value; else delete p.fu; saveProg(id); render(); toast("Follow-up saved"); }
  else if(t.dataset.c){ const p=ensure(id); p.c={...(p.c||{}),[t.dataset.c]:t.value.trim()}; saveProg(id); render(); toast("Contact saved"); }
});
let nT=null;
prof.addEventListener("input",e=>{
  const t=e.target;
  if(t.dataset.p==="notes"){ clearTimeout(nT); nT=setTimeout(()=>{ ensure(ui.open).notes=t.value; saveProg(ui.open); },800); }
  if(t.id==="dTo"||t.id==="dS"||t.id==="dB"){ updateMailto(); saveDraftSoon(); }
});
prof.addEventListener("click",async e=>{
  const id=ui.open; const l=byId(id); const t=e.target;
  if(t.id==="dSend"){ if(!$("#dTo").value){ e.preventDefault(); toast("Add an email address first."); return; } const p=ensure(id); p.draft={to:$("#dTo").value,s:$("#dS").value,b:$("#dB").value}; const subj=p.draft.s; setTimeout(()=>{ logAct(id,"email",subj); toast("Emailed logged — follow-up in 7 days"); },400); }
  if(t.id==="dCopy"){ try{ await navigator.clipboard.writeText("Subject: "+$("#dS").value+"\n\n"+$("#dB").value); toast("Copied"); }catch(_){ toast("Select the message and copy it manually."); } }
  if(t.id==="dReset"){ const p=ensure(id); delete p.draft; saveProg(id); renderProfile("draftSec"); }
  if(t.id==="dClaude"){ t.disabled=true; const d=await claudeDraft(l,$("#dLive")); t.disabled=false; if(d){ $("#dS").value=d.s; $("#dB").value=d.b; $("#dLive").textContent=""; updateMailto(); ensure(id).draft={to:$("#dTo").value,s:d.s,b:d.b}; saveProg(id); toast("Draft ready — edit anything before sending"); } }
  if(t.id==="rSave"){
    const r={t:new Date().toISOString(),from:$("#rFrom").value.trim(),title:$("#rTitle").value.trim(),email:$("#rEmail").value.trim(),phone:$("#rPhone").value.trim(),outcome:$("#rOut").value,said:$("#rSaid").value.trim()};
    const p=ensure(id); p.replies=(p.replies||[]).concat([r]).slice(-40);
    const eff=contact(l); const c={...(p.c||{})}; if(r.from&&!eff.name){ c.name=r.from; if(r.title) c.title=r.title; } if(r.email&&!eff.email) c.email=r.email; if(r.phone&&!eff.phone) c.phone=r.phone; p.c=c;
    const map={"Added us to bid list":"On bid list","Meeting set":"Meeting set","Sent us a bid invite":"Bidding / working","Not a fit":"Not a fit"};
    if(l.phase===2){ if(map[r.outcome]) p.status=map[r.outcome]; else if(ST2.indexOf(statusOf(l))<2) p.status="Talked to someone"; }
    else if(r.outcome==="Added us to bid list") p.status="Approved / on list";
    const fu=$("#rFu").value; if(fu) p.fu=fu; else if(r.outcome==="Call back later"||r.outcome==="Send prequal / info") p.fu=addDays(today(),5); else if(["On bid list","Not a fit","Meeting set"].includes(p.status)) delete p.fu;
    p.log=(p.log||[]).concat([{t:r.t,k:"reply",n:r.outcome+(r.said?" — "+r.said.slice(0,120):"")}]).slice(-80);
    saveProg(id); render(); renderProfile("replySec"); toast("Reply saved");
  }
  if(t.id==="addPortal"){ const u=$("#purl").value.trim(); if(!u){toast("Paste the portal link first.");return;} const p=ensure(id); p.portals=(p.portals||[]).concat([{label:$("#plab").value.trim()||"Bid portal",url:u}]); saveProg(id); renderProfile(); toast("Portal added"); }
  if(t.dataset.delportal!==undefined){ const p=ensure(id); p.portals=(p.portals||[]).filter((_,i)=>i!=t.dataset.delportal); saveProg(id); renderProfile(); }
  if(t.id==="delCustom"){ if(confirm("Delete "+l.title+"? Its history stays saved but the company leaves the list.")){ delete custom[id]; saveCustom(id); closeProfile(); toast("Company deleted"); } }
});

/* ---------- add company ---------- */
$("#addBtn").onclick=()=>{ $("#addForm").reset(); $("#addDlg").showModal(); };
$("#addDlg").addEventListener("close",()=>{
  if($("#addDlg").returnValue!=="ok") return;
  const f=new FormData($("#addForm")); const title=(f.get("title")||"").trim(); if(!title) return;
  const id="custom-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const phase=+f.get("phase");
  custom[id]={id,phase,sheet:"Added by you",setup:false,pri:+f.get("pri"),inz:f.get("inz")==="1",zone:"",title,what:(f.get("what")||"").trim(),how:(f.get("type")||"").trim(),area:(f.get("addr")||"").trim(),links:[],emails:[],phones:[],person:"",init:"",raw:{},added:new Date().toISOString()};
  saveCustom(id);
  const c={name:f.get("name").trim(),title:f.get("ctitle").trim(),email:f.get("email").trim(),phone:f.get("phone").trim(),web:f.get("web").trim(),portal:f.get("portal").trim(),addr:f.get("addr").trim()};
  ensure(id).c=Object.fromEntries(Object.entries(c).filter(([,v])=>v)); saveProg(id);
  ui.tab=String(phase); ui.q=""; $("#q").value=""; ui.src=""; ui.st="all"; $("#fStatus").value="all"; ui.zone="all"; $("#fZone").value="all"; render(); openProfile(id); toast("Company added — it's at the top of the list");
});

/* ---------- import spreadsheet ---------- */
$("#fileIn").addEventListener("change",async e=>{
  const file=e.target.files[0]; e.target.value=""; if(!file) return;
  if(typeof XLSX==="undefined"){ toast("The spreadsheet reader didn't load. Reload the page and try again."); return; }
  let list;
  try{ const wb=XLSX.read(await file.arrayBuffer(),{type:"array"}); list=parseWorkbook(XLSX,wb); }catch(err){ toast("Couldn't read that file. Save it as .xlsx and try again."); return; }
  if(!list.length){ toast("No rows with a Priority column were found in that file."); return; }
  const old=new Set(leads.map(l=>l.id)), neu=new Set(list.map(l=>l.id));
  const added=list.filter(l=>!old.has(l.id)).length, gone=leads.filter(l=>!neu.has(l.id)), kept=list.filter(l=>old.has(l.id)).length;
  const withProg=gone.filter(l=>prog[l.id]).length;
  $("#impBody").innerHTML=`<h3 style="margin-top:0">Update from ${esc(file.name)}</h3>
    <p>${list.length} companies found across ${new Set(list.map(l=>l.sheet)).size} tabs.</p>
    <ul><li>${added} new</li><li>${kept} already here — their calls, emails, replies and notes stay</li><li>${gone.length} no longer in the spreadsheet${withProg?` (${withProg} have history, which stays saved)`:""}</li></ul>
    <p class="hint">Renamed companies show up as new, so rename in the spreadsheet only when you need to.</p>
    <div class="pill-row" style="justify-content:flex-end"><button class="btn" id="impNo">Cancel</button><button class="btn primary" id="impYes">Update list</button></div>`;
  $("#impDlg").showModal();
  $("#impNo").onclick=()=>$("#impDlg").close();
  $("#impYes").onclick=async()=>{ $("#impYes").disabled=true; $("#impYes").textContent="Updating…";
    try{ await saveLeadList(list,file.name); leads=list; dirty(); $("#sync").textContent=(local?"Saved on this device":"Synced")+" · spreadsheet updated "+today(); $("#impDlg").close(); render(); toast("List updated from "+file.name); }
    catch(err){ $("#impDlg").close(); toast(err&&err.code==="denied"?"You can view this list but not update it.":"Couldn't save the new list. Try again."); } };
});

/* ---------- export ---------- */
$("#exportBtn").onclick=async()=>{
  if(typeof XLSX==="undefined"){ toast("The spreadsheet writer didn't load. Reload and try again."); return; }
  const rows=allLeads().map(l=>{ const c=contact(l),p=P(l.id); const tries=(p.log||[]).filter(x=>["call","email","visit"].includes(x.k)).length; const r=(p.replies||[])[ (p.replies||[]).length-1 ];
    return {"#":order(l),"List":l.phase===1?"Register":"Reach out","Spreadsheet tab":l.sheet,"Priority":l.pri,"Within 100 mi":l.inz?"Yes":"No","Company":l.title,"Contact":c.name,"Title":c.title,"Email":c.email,"Phone":c.phone,"Website":c.web,"Bid portal":c.portal,"Other portals":(p.portals||[]).map(x=>x.url).join(" | "),"Status":statusOf(l),"Attempts":tries,"Last touch":lastTouch(l),"Follow up":followDue(l),"Last reply":r?(r.outcome+(r.said?": "+r.said:"")):"","Notes":p.notes||""}; });
  const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Outreach progress");
  const buf=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  a.download="GrayCo_Outreach_Progress_"+today()+".xlsx"; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
};

/* ---------- bring in saved progress ---------- */
// A .json file {progress:{id:{…}}, custom:{id:{…}}}: for example the progress saved in the
// old Claude artifact. A company is only taken from the file when the file's copy is
// newer than the one already here, so running it twice changes nothing.
$("#progIn").addEventListener("change",async e=>{
  const file=e.target.files[0]; e.target.value=""; if(!file) return;
  let x; try{ x=JSON.parse(await file.text()); }catch(err){ toast("That isn't a progress file (.json)."); return; }
  const inP=(x&&x.progress)||{}, inC=(x&&x.custom)||{};
  const takeP=Object.keys(inP).filter(id=>inP[id]&&typeof inP[id]==="object"&&!((prog[id]||{}).upd>=(inP[id].upd||""))&&!(prog[id]&&!inP[id].upd));
  const takeC=Object.keys(inC).filter(id=>inC[id]&&typeof inC[id]==="object"&&inC[id].title&&!custom[id]);
  if(!takeP.length&&!takeC.length){ toast("Nothing new in that file — everything in it is already here."); return; }
  if(!confirm(`Bring in ${takeP.length} compan${takeP.length===1?"y's":"ies'"} progress and ${takeC.length} added compan${takeC.length===1?"y":"ies"} from ${file.name}?`)) return;
  for(const id of takeC){ custom[id]=inC[id]; saveCustom(id); }
  for(const id of takeP){ prog[id]=inP[id]; saveProg(id); }
  dirty(); render(); toast("Progress brought in from "+file.name);
});

start();
