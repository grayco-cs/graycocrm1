#!/usr/bin/env python3
"""patch PASTPAYEDIT (owner 11/03: "how do I enter or edit past payroll if it didn't save" — after Save all the grid is
empty, and saved checks could not be changed): a "✏️ Edit saved checks" button loads every check saved from paystubs
(source paystub-entry) between FIRST and LAST PAYDAY back into the grid, exactly as saved. Change anything, add or ✕ rows,
then Save all: the loaded runs are REPLACED (old ones removed + tombstoned so sync can't bring them back). Paid runs made
any other way are never touched. Edits index.html + tools/pastpay_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'pastpay_tail.js')]
MARK = '/* patch PASTPAYEDIT'
R = [
 ("    +'<button data-pp=\"clear\" style=\"'+BT+'color:#b91c1c\">Clear all rows</button></div>'",
  "    +'<button data-pp=\"load\" style=\"'+BT+'border-color:#2563eb;color:#1d4ed8\">✏️ Edit saved checks</button>'\n"
  "    +'<button data-pp=\"clear\" style=\"'+BT+'color:#b91c1c\">Clear all rows</button></div>'"),
 ("  $('clear').onclick=function(){ if(rows.length && confirm('Clear all '+rows.length+' rows from this screen? (Nothing saved is touched.)')){ rows=[]; draw(); saveDraft(rows); } };",
  "  $('clear').onclick=function(){ if(rows.length && confirm('Clear all '+rows.length+' rows from this screen? (Nothing saved is touched.)')){ rows=[]; _loaded={}; draw(); saveDraft(rows); } };\n"
  "  /* patch PASTPAYEDIT: load the checks already saved from paystubs back in, to fix them */\n"
  "  var _loaded={};\n"
  "  $('load').onclick=async function(){ var msg=$('msg'); var all=[]; try{ all=(await p.runs())||[]; }catch(e){}\n"
  "    var a=s($('first').value), b=s($('last').value);\n"
  "    var pick=all.filter(function(x){ return x && x.source==='paystub-entry' && !x.tombstoned && !x.deleted && (!a || s(x.payDate)>=a) && (!b || s(x.payDate)<=b) && !_loaded[x.id]; });\n"
  "    if(!pick.length){ msg.style.color='#b91c1c'; msg.textContent='No saved checks between those paydays.'; return; }\n"
  "    if(rows.length && !confirm('Add '+pick.length+' saved run(s) below the '+rows.length+' row(s) already on screen?')) return;\n"
  "    var n=0; pick.forEach(function(run){ _loaded[run.id]=1; (run.lines||[]).forEach(function(L){ var st=(s(L.withholdState||L.stateName)||'TN').toUpperCase(), cm=r2(n2(L.commission));\n"
  "      rows.push({ payDate:s(run.payDate), from:s(run.from), to:s(run.to), name:s(L.name), empKey:s(L.empId||L.name), payType:s(L.payType), hours:(n2(L.hours)?String(L.hours):''),\n"
  "        gross:r2(n2(L.gross)-cm).toFixed(2), comm:(cm?cm.toFixed(2):''), fedMode:(L.fedNotWithheld?'none':'stub'), fed:r2(L.fed).toFixed(2), ficaMode:(L.ficaNotWithheld?'none':'stub'), ss:r2(L.ss).toFixed(2), med:r2(n2(L.med)+n2(L.addlMed)).toFixed(2),\n"
  "        st:st, stMode:(st==='TN'?'calc':'stub'), stw:r2(L.state).toFixed(2), sutaSt:s(L.sutaState), other:(n2(L.otherDed)?r2(L.otherDed).toFixed(2):''), net:'', netTyped:false, checkNo:s(L.checkNo), _mset:1, _fromRun:run.id }); n++; }); });\n"
  "    draw(); later(); msg.style.color='#1d4ed8'; msg.innerHTML='✏️ Loaded '+n+' saved check'+(n===1?'':'s')+' from '+pick.length+' run'+(pick.length===1?'':'s')+'. Fix anything, then <b>Save all</b> — the saved ones are replaced (✕ a row to delete that check).'; };"),
 ("    var dup=fresh.filter(function(x){ return x && ['approved','paid'].indexOf(low(x.status))>=0 && dates[s(x.payDate)]; });",
  "    var dup=fresh.filter(function(x){ return x && !_loaded[x.id] && ['approved','paid'].indexOf(low(x.status))>=0 && dates[s(x.payDate)]; });\n"
  "    var _rep=Object.keys(_loaded).filter(function(id){ return fresh.some(function(x){ return x && x.id===id; }); });   /* patch PASTPAYEDIT */"),
 ("      +'\\n\\nSaved as already paid: no checks to write, no alerts, nothing booked to accounting.')) return;\n    fresh.push.apply(fresh, made);",
  "      +(_rep.length?('\\n\\n✏️ This REPLACES '+_rep.length+' saved run(s) you loaded to edit.'):'')\n"
  "      +'\\n\\nSaved as already paid: no checks to write, no alerts, nothing booked to accounting.')) return;\n"
  "    if(_rep.length){ fresh=fresh.filter(function(x){ return !(x && _loaded[x.id]); }); try{ if(W._gcTombstoneMany) W._gcTombstoneMany('payrollRuns', _rep); }catch(_tE){} }   /* patch PASTPAYEDIT */\n"
  "    fresh.push.apply(fresh, made);"),
 ("  var rows=readDraft()||[];\n",
  "  var rows=(readDraft()||[]).filter(function(r){ return !(r && r._fromRun); });   /* patch PASTPAYEDIT: loaded checks are reloaded fresh, never from an old draft */\n"),
 ("    runs=fresh; rows=rows.filter(function(r){ return live.indexOf(r)<0; }); saveDraft(rows); draw();",
  "    runs=fresh; _loaded={}; rows=rows.filter(function(r){ return live.indexOf(r)<0 && !r._fromRun; }); saveDraft(rows); draw();"),
]
done = 0
for P in FILES:
    t = open(P, encoding='utf-8').read()
    if MARK in t: continue
    for a, b in R:
        n = t.count(a)
        if n != 1: print('anchor count', n, 'in', P, 'for', a[:90]); sys.exit(1)
        t = t.replace(a, b)
    open(P, 'w', encoding='utf-8').write(t); done += 1
print('patched PASTPAYEDIT (%d file(s))' % done if done else 'already patched')
