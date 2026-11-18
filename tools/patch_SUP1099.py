#!/usr/bin/env python3
# patch_SUP1099.py <index.html> — 1099 superintendent / contractor staff (owner 11/18).
# Small edits in place (each must match exactly once) + the gc-patch-sup1099 block (tools/sup1099_tail.js) before </body>
# (when it is near the end) or at the end. Idempotent: a file that already has __GC_PATCH_SUP1099__ is only re-checked.
import sys, os, re
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'index.html')
HERE = os.path.dirname(os.path.abspath(__file__))
t = open(P, encoding='utf-8').read()

EDITS = [
 # ── Admin → Employees editor (React): the Employment setting beside Role ──
 ('role:"Project Manager",payType:"",overhead:""',
  'role:"Project Manager",employment:"",payType:"",overhead:""'),
 ('shirtSize:K.shirtSize,notes:K.notes,photo:K.photo}',
  'shirtSize:K.shirtSize,notes:K.notes,photo:K.photo,...((K.employment==="1099"||(W&&W.employment))?{employment:K.employment==="1099"?"1099":"w2"}:{})}/* patch SUP1099: W-2 (default, nothing written) | 1099 */'),
 ('Ya(j=>j.map(kt=>kt.id===W.id?{...kt,...Ne}:kt)),F(null),$e(Re),se("Updated "+K.name)',
  'Ya(j=>j.map(kt=>kt.id===W.id?{...kt,...Ne}:kt)),(window._gc1099&&window._gc1099.saved({...W,...Ne})),F(null),$e(Re),se("Updated "+K.name)'),
 ('Ya(j=>[...j,{...K,password:void 0,pwHash:Ne,id:$t("U"),active:!0,...ye,...Te,...J}]),$e(Re),',
  'Ya(j=>[...j,{...K,password:void 0,pwHash:Ne,id:$t("U"),active:!0,...ye,...Te,...J}]),(window._gc1099&&window._gc1099.saved({...K,password:void 0,...J})),$e(Re),'),
 ('ye=[{id:"info",l:"👤 Info"},{id:"pay",l:"💰 Pay"},{id:"insurance",l:"🏥 Insurance"},{id:"extra",l:"📋 Additional"}];',
  'ye=[{id:"info",l:"👤 Info"},{id:"pay",l:"💰 Pay"},{id:"insurance",l:"🏥 Insurance"},{id:"extra",l:"📋 Additional"}].filter(Te=>K.employment!=="1099"||(Te.id!=="pay"&&Te.id!=="insurance"));/* patch SUP1099: a 1099 contractor has no payroll pay or benefits */'),
 ('de==="pay"&&', 'de==="pay"&&K.employment!=="1099"&&'),
 ('de==="insurance"&&', 'de==="insurance"&&K.employment!=="1099"&&'),
 ('children:zx.map(Te=>e.jsx("option",{children:Te},Te))})}),',
  'children:zx.map(Te=>e.jsx("option",{children:Te},Te))})}),'
  'e.jsx(re,{l:"Employment",children:e.jsxs("select",{style:R,"data-gc-employment":"1",value:K.employment==="1099"?"1099":"w2",onChange:Te=>$e({...K,employment:Te.target.value==="1099"?"1099":""}),children:[e.jsx("option",{value:"w2",children:"W-2 employee"}),e.jsx("option",{value:"1099",children:"1099 contractor"})]})}),'
  'K.employment==="1099"&&e.jsx("div",{"data-gc-employment-note":"1",style:{gridColumn:"1/-1",fontSize:11,lineHeight:1.45,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"6px 9px"},children:"1099 contractor: no payroll, pay stubs, W-2, PTO, sick days, commissions or benefits. The time clock only records hours on site (job records, his invoices). Saving links him to a Subs record by his e-mail (made if there is none) so his W-9, COI, contractor agreement and invoices go through the sub portal."}),/* patch SUP1099 */'),
 # ── the employee's profile (admin view): the 1099 badge, the Contractor paperwork card, no pay structure / benefits ──
 ('e.jsx("div",{"data-gc-co-user":String(ye.id)})/* patch COLEAK2: the Companies boxes */',
  'e.jsx("div",{"data-gc-co-user":String(ye.id)})/* patch COLEAK2: the Companies boxes */,e.jsx("div",{"data-gc1099-user":String(ye.id)})/* patch SUP1099: Contractor paperwork */'),
 ('children:ye.role}),ye.hireDate&&e.jsxs("span"',
  'children:ye.role}),ye.employment==="1099"&&e.jsx("span",{"data-gc1099-badge":"1",style:{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,background:"#fef3c7",color:"#92400e"},children:"1099 contractor"}),ye.hireDate&&e.jsxs("span"'),
 ('e.jsxs("div",{style:Ke,children:[e.jsx("b",{style:{fontSize:12,color:u.acc,display:"block",marginBottom:6},children:"💰 Pay Structure"})',
  'e.jsxs("div",{style:ye.employment==="1099"?{display:"none"}:Ke,children:[e.jsx("b",{style:{fontSize:12,color:u.acc,display:"block",marginBottom:6},children:"💰 Pay Structure"})'),
 ('e.jsxs("div",{style:Ke,children:[e.jsx("b",{style:{fontSize:12,color:u.acc,display:"block",marginBottom:6},children:"🏥 Insurance"})',
  'e.jsxs("div",{style:ye.employment==="1099"?{display:"none"}:Ke,children:[e.jsx("b",{style:{fontSize:12,color:u.acc,display:"block",marginBottom:6},children:"🏥 Insurance"})'),
 ('e.jsx("button",{style:{...ht,background:"#0f766e",color:"#fff"},onClick:()=>{window._gcPayrollOpenEmp&&window._gcPayrollOpenEmp(ye.id,ye.name)},children:"🧾 W-4 & taxes →"}),',
  'ye.employment!=="1099"&&e.jsx("button",{style:{...ht,background:"#0f766e",color:"#fff"},onClick:()=>{window._gcPayrollOpenEmp&&window._gcPayrollOpenEmp(ye.id,ye.name)},children:"🧾 W-4 & taxes →"}),/* patch SUP1099: no W-4 / payroll tax for a 1099 contractor */'),
 # ── the Employees list: Pay Type says 1099 ──
 ('children:ye.role})}),e.jsx("td",{style:{padding:"6px 10px",fontSize:11},children:ye.payType==="owner"?"Owner"',
  'children:ye.role})}),e.jsx("td",{style:{padding:"6px 10px",fontSize:11},children:ye.employment==="1099"?"1099 contractor (invoices)":ye.payType==="owner"?"Owner"'),
 # ── time off / sick (patch TIMEOFF): a 1099 contractor gets "Can't make it today" instead of Time off + Call in sick ──
 ("""function btnsHtml(){ return '<div class="gc-to-btns"><button type="button" data-to-a="off"><span class="e">🏖</span>Time off</button><button type="button" data-to-a="sick"><span class="e">🤒</span>Call in sick</button>""",
  """function btnsHtml(){ var c1099 = false; try { c1099 = !!(W._gc1099 && W._gc1099.meIs()); } catch (e) {} return '<div class="gc-to-btns">' + (c1099 ? '<button type="button" data-gc1099="cant"><span class="e">🚧</span>Can’t make it today</button>' : '<button type="button" data-to-a="off"><span class="e">🏖</span>Time off</button><button type="button" data-to-a="sick"><span class="e">🤒</span>Call in sick</button>') + '"""),
 # ── the time clock: a 1099 contractor's punch is "hours on site" (job records, his invoices) — never payroll ──
 ("""      list.push({ id:'TS'+Date.now()+Math.floor(Math.random()*999), user:u, date:d,
                  clockIn:start, actualIn:actual, clockOut:'', manual:false,
                  updatedAt:new Date().toISOString(), savedAt:new Date().toISOString() });""",
  """      list.push(Object.assign({ id:'TS'+Date.now()+Math.floor(Math.random()*999), user:u, date:d,
                  clockIn:start, actualIn:actual, clockOut:'', manual:false,
                  updatedAt:new Date().toISOString(), savedAt:new Date().toISOString() }, (window._gc1099&&window._gc1099.punchTag)?window._gc1099.punchTag(u):{}));   /* patch SUP1099: { onsite:true, payroll:false } for a 1099 contractor */"""),
 ("""      +'<div style="font-size:18px;font-weight:800;">🕐 '+(admin?'Timesheets — all employees':'My Timesheet')+'</div>'""",
  """      +'<div style="font-size:18px;font-weight:800;">🕐 '+(admin?'Timesheets — all employees':((window._gc1099&&window._gc1099.meIs())?'My hours on site <span style="font-size:12px;font-weight:600;color:#fcd34d">— for job records and your invoices (1099: not payroll)</span>':'My Timesheet'))+'</div>'"""),
 # ── payroll: a 1099 contractor's on-site hours are never paid hours ──
 ("""    if(!r || r.user!==name || !r.date) return false;
    if(from && r.date<from) return false;""",
  """    if(!r || r.user!==name || !r.date) return false;
    if(r.payroll===false) return false;   /* patch SUP1099: a 1099 contractor's hours on site */
    if(from && r.date<from) return false;"""),
 # ── payroll: no payroll profile is made for a 1099 contractor; runs skip one ──
 ("""  users().forEach(function(u){
    if(u.active===false) return;
    var p = (u.id && byUser[u.id]) || byName[nameKey(u.name)];""",
  """  users().forEach(function(u){
    if(u.active===false) return;
    if(String(u.employment||'').toLowerCase()==='1099') return;   /* patch SUP1099: a 1099 contractor is not on payroll */
    var p = (u.id && byUser[u.id]) || byName[nameKey(u.name)];"""),
 ("""  var profs=(await P.profiles()).filter(function(p){ return p.active!==false; });
  body.innerHTML=''""",
  """  var profs=(await P.profiles()).filter(function(p){ return p.active!==false && !(window._gc1099&&window._gc1099.skipPay(p)); });   /* patch SUP1099 */
  body.innerHTML=''"""),
 ("""    var profs = (await P.profiles()).filter(function(p){ return p && p.active !== false; });
    for (var i = 0; i < profs.length; i++) {""",
  """    var profs = (await P.profiles()).filter(function(p){ return p && p.active !== false && !(W._gc1099 && W._gc1099.skipPay(p)); });   /* patch SUP1099 */
    for (var i = 0; i < profs.length; i++) {"""),
 ("""  var profs = []; try{ profs = (await p.profiles()).filter(function(x){ return x && x.name && x.active !== false; }); }catch(e){}""",
  """  var profs = []; try{ profs = (await p.profiles()).filter(function(x){ return x && x.name && x.active !== false && !(window._gc1099 && window._gc1099.skipPay(x)); }); }catch(e){}   /* patch SUP1099 */"""),
 # ── commissions: a 1099 contractor earns no PM commission (his portion stays with GrayCo, like an owner's) ──
 ("""function isOwner(nm){ var u=userByName(nm); return !!(u && low(u.payType)==='owner'); }""",
  """function isOwner(nm){ var u=userByName(nm); return !!(u && (low(u.payType)==='owner' || low(u.employment)==='1099')); }   /* patch SUP1099: a 1099 contractor earns no commission */"""),
]

if '__GC_PATCH_SUP1099__' not in t:
  for a, b in EDITS:
    n = t.count(a)
    if n != 1: sys.exit('SUP1099: expected 1 match, found %d: %s' % (n, a[:90]))
    t = t.replace(a, b)
  block = open(os.path.join(HERE, 'sup1099_tail.js'), encoding='utf-8').read()
  tag = '<script id="gc-patch-sup1099">\n' + block + '\n</script>\n'
  tail = t[-400:]   # a real </body> only near the end (the file has '</body>' inside script strings)
  i = len(t) - 400 + tail.rfind('</body>') if '</body>' in tail else -1
  t = (t[:i] + tag + t[i:]) if i > -1 else (t.rstrip('\n') + '\n' + tag)
  open(P, 'w', encoding='utf-8').write(t)
  print('SUP1099 applied: %d edits + the block' % len(EDITS))
else:
  print('SUP1099 already applied')
