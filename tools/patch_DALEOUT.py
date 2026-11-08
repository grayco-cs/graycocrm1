#!/usr/bin/env python3
"""patch DALEOUT (owner 11/3: "NO DALE PERRITT ANYWHERE IN THE CRM"). A sweep of every cloud list (11/8) found him
only on one bid opportunity (bidLists, assignedTo). Bid opportunities are now cleaned as they load: anyone on the
let-go list (gc_fired_users, seeded with Dale) is taken off assignedTo / pm / estimator / assignee (the bid shows
unassigned, so the estimator rule applies), and the cleaned list is saved back once (any signed-in device)."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*DALEOUT*/' in src: print('part 1 already patched')
else:
  old = 'const Re=await g("bidLists",[]);tt(Re);'
  assert src.count(old) == 1
  new = ('const Re=(function(L){/*DALEOUT*/try{var f={};try{f=JSON.parse(localStorage.getItem("gc_fired_users")||"{}")||{}}catch(x){}f["dale perritt"]=1;'
         'var ch=0,out=(Array.isArray(L)?L:[]).map(function(b){if(!b)return b;var c=null;["assignedTo","pm","estimator","assignee"].forEach(function(k){var v=String(b[k]||"").trim().toLowerCase();if(v&&f[v]){c=c||Object.assign({},b);c[k]="Unassigned";c.formerAssignee=b[k];}});if(c){c.updatedAt=new Date().toISOString();ch++;return c}return b});'
         'if(ch){setTimeout(function(){try{window.idbSet&&window.idbSet("bidLists",out);var u=window._supaUpsertNow||window._supaUpsert;u&&u("bidLists",out)}catch(x){}},4000)}return out}catch(e){return L}})(await g("bidLists",[]));tt(Re);')
  src = src.replace(old, new)
  open(P, 'w', encoding='utf-8').write(src); print('patched')

# part 2 (11/8): the cloud copy can arrive after the first load (a new device) — a background check scrubs it too
src = open(P, encoding='utf-8').read()
if '__GC_DALEOUT2__' not in src:
    src = src.rstrip('\n') + '\n<script id="gc-patch-daleout2">/* __GC_DALEOUT2__ — patch DALEOUT part 2: bid opportunities in the local copy / cloud are cleaned of anyone let go (gc_fired_users + Dale), checked 10 times in the first 5 minutes */\n(function(W){ if (W.__GC_DALEOUT2__) return; W.__GC_DALEOUT2__ = true; var n = 0;\n  function run(){ if (++n > 10) return; try { if (!(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()) || !W.idbGet) return; Promise.resolve(W.idbGet("bidLists")).then(function(L){ if (typeof L === "string") { try { L = JSON.parse(L); } catch (e) { L = null; } } if (!Array.isArray(L)) return; var f = {}; try { f = JSON.parse(localStorage.getItem("gc_fired_users") || "{}") || {}; } catch (e) {} f["dale perritt"] = 1; var ch = 0;\n    var out = L.map(function(b){ if (!b) return b; var c = null; ["assignedTo", "pm", "estimator", "assignee"].forEach(function(k){ var v = String(b[k] || "").trim().toLowerCase(); if (v && f[v]) { c = c || Object.assign({}, b); c[k] = "Unassigned"; c.formerAssignee = b[k]; } }); if (c) { c.updatedAt = new Date().toISOString(); ch++; return c; } return b; });\n    if (ch) { W.idbSet && W.idbSet("bidLists", out); var u = W._supaUpsertNow || W._supaUpsert; u && u("bidLists", out); if (W._crm) W._crm.bidLists = out; } }).catch(function(){}); } catch (e) {} }\n  var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout; [8, 20, 40, 60, 90, 120, 160, 200, 250, 300].forEach(function(t){ ST.call(W, run, t * 1000); });\n})(window);\n</script>\n'
    open(P, 'w', encoding='utf-8').write(src); print('part 2 patched')
