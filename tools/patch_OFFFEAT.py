#!/usr/bin/env python3
"""Idempotent patch OFFFEAT (owner 10/30): four office features — see the header of tools/offfeat.js.
* 🏢 Office page, "📋 What needs you today": a 📬 Collections line (past-due $ and count) that opens the board.
* Accounting (patch K): a 📬 Collections card on 🏠 Home; on ⬇ Money In a 5-bucket strip + "Open the Collections board",
  and the ✉ Remind column becomes "Send payment reminder" through ✅ Approvals with the last reminder date.
* 🛡 Sub Compliance board: "expires in N days / expired N days ago" chips, a COI expiring within 30 days needs papers,
  "⛔ Payment blocked: …" under the sub, Request docs → ✅ Approvals (one open per sub) with its state on the row.
* Subs tab compliance table (React): the expiry chip under GL Ins and the reason under "Can Pay? ⛔".
* netlify/functions/_lib/lien-deadlines.js (the lien rules, shared with the server) and tools/offfeat.js go in as
  <script id="gc-patch-offfeat"> at the end of the page (replaced when they change).
Every hook feature-detects window._gcOffFeat, so the page works the same if the script is missing.
Usage: python3 tools/patch_OFFFEAT.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
t = open(p, encoding='utf-8').read()
MARK = 'patch OFFFEAT'
n_done = 0
def once(old, new, tag):
    """replace one exact anchor; skip when the marked replacement is already there"""
    global t, n_done
    if new in t:
        return
    c = t.count(old)
    assert c == 1, ('OFFFEAT anchor', tag, c, old[:100])
    t = t.replace(old, new); n_done += 1

# 1. 🏢 Office page: "What needs you today"
once("""    out.push(tile('\\uD83D\\uDCB0','Collect overdue invoices',needCollect,'#ef4444','invoices'));\n""",
     """    out.push(tile('\\uD83D\\uDCB0','Collect overdue invoices',needCollect,'#ef4444','invoices'));\n    if(window._gcOffFeat&&window._gcOffFeat.todayTile){ try{ out.push(window._gcOffFeat.todayTile()); }catch(_e){} }   /* patch OFFFEAT: 📬 Collections */\n""", 'office today')

# 2. Accounting → Home card, Money In strip, the reminder column
once("""  cards.push('<button class="gck-card" data-tab="k_out"><h3>⬆ Money going out</h3>""",
     """  if(seesCompany()&&window._gcOffFeat&&window._gcOffFeat.acctCard){ try{ cards.push(window._gcOffFeat.acctCard()); }catch(_e){} }   /* patch OFFFEAT: 📬 Collections */\n  cards.push('<button class="gck-card" data-tab="k_out"><h3>⬆ Money going out</h3>""", 'acct home')
once("""  var h='<div class="gck-tiles">'+BUCKETS.map(function(b){ return '<button class="gck-tile" data-act="bucket:'+b[0]+'\"""",
     """  var h=(seesCompany()&&window._gcOffFeat&&window._gcOffFeat.inStrip?(function(){ try{ return window._gcOffFeat.inStrip(); }catch(_e){ return ''; } })():'')+'<div class="gck-tiles">'+BUCKETS.map(function(b){ return '<button class="gck-tile" data-act="bucket:'+b[0]+'\"""", 'money in strip')
once("""      {h:'', v:function(){ return ''; }, f:function(r){ return '<button class="gck-btn s gck-noprint" data-act="remind:'+esc(r.id)+'" title="Write a polite payment reminder (you see it before anything is sent)">✉ Remind</button>'; }}""",
     """      {h:'', v:function(){ return ''; }, f:function(r){ if(window._gcOffFeat&&window._gcOffFeat.remindCell){ try{ var _oc=window._gcOffFeat.remindCell(r); if(_oc) return _oc; }catch(_e){} }   /* patch OFFFEAT: through ✅ Approvals */ return '<button class="gck-btn s gck-noprint" data-act="remind:'+esc(r.id)+'" title="Write a polite payment reminder (you see it before anything is sent)">✉ Remind</button>'; }}""", 'money in remind')
once("""<span class="gck-note" style="padding:0">Reminders are never sent by themselves — you see the email first.</span>""",
     """<span class="gck-note" style="padding:0">'+(window._gcOffFeat?'Payment reminders wait on ✅ Approvals — nothing goes to the customer until it is approved.':'Reminders are never sent by themselves — you see the email first.')+'</span>""", 'money in note')

# 3. 🛡 Sub Compliance board
# r17b: patch OFFFIX5 (r17) already lists each sub once on this board (by id, else by name/company) -- keep it, skip this hook
if 'patch OFFFIX5: each sub once' not in t:
  once("""  function subs(){ var c=crm(); var all=(c.subs||[]).concat(c.vendors||[]); return all.filter(function(s){ return s && (s.isSub || s.trade || (c.subs||[]).indexOf(s)>=0); }); }""",
     """  function subs(){ var c=crm(); var all=(c.subs||[]).concat(c.vendors||[]), seen={}; return all.filter(function(s){ if(!(s && (s.isSub || s.trade || (c.subs||[]).indexOf(s)>=0))) return false; var k=String(s.id||s.name||''); if(k&&seen[k]) return false; if(k) seen[k]=1; return true; }); }   /* patch OFFFEAT: subs and vendors are the same list — each sub once */""", 'board dedupe')
once("""      if(d<0) return {state:'expired', label:'Expired '+Math.abs(d)+'d ago'};
      if(d<=30) return {state:'expiring', label:'Expires in '+d+'d'};""",
     """      if(d<0) return {state:'expired', label:'Expired '+Math.abs(d)+' day'+(Math.abs(d)===1?'':'s')+' ago'};   /* patch OFFFEAT: plain words */
      if(d<=30) return {state:'expiring', label:(d===0?'Expires today':'Expires in '+d+' day'+(d===1?'':'s'))};""", 'board labels')
once("""      var coi = docStatus(!!(s.coi||s.insurance), s.coiExp||s.insExp);""",
     """      var coi = docStatus(!!(s.coi||s.insurance), s.coiExp||s.insExp||s.insuranceExp||s.coiExpiration);   /* patch OFFFEAT: every COI date field */""", 'board coi')
once("""      if(coi.state==='missing'||coi.state==='expired') missing.push('Certificate of Insurance (COI)');""",
     """      if(coi.state==='missing'||coi.state==='expired'||coi.state==='expiring') missing.push('Certificate of Insurance (COI)');   /* patch OFFFEAT: 30 days before it runs out */""", 'board missing')
once("""        +'<td style="padding:8px"><b>'+esc(r.sub.name||'(unnamed)')+'</b><div style="font-size:11px;color:#94a3b8">'+esc(r.sub.trade||r.sub.cat||'')+'</div></td>'""",
     """        +'<td style="padding:8px"><b>'+esc(r.sub.name||'(unnamed)')+'</b><div style="font-size:11px;color:#94a3b8">'+esc(r.sub.trade||r.sub.cat||'')+'</div>'+(window._gcOffFeat?window._gcOffFeat.payBlockHtml(r.sub):'')+'</td>'   /* patch OFFFEAT: payment block */""", 'board block')
once("""Request docs</button>':'<span style="color:#16a34a;font-size:16px">\\u2713</span>')+'</td>'""",
     """Request docs</button>'+(window._gcOffFeat?window._gcOffFeat.subReqState(r.sub):''):'<span style="color:#16a34a;font-size:16px">\\u2713</span>')+'</td>'""", 'board req state')
once("""        var r=rows[parseInt(btn.getAttribute('data-req'),10)]; if(!r) return;
        var msg=draftRequest(r.sub, r.missing);""",
     """        var r=rows[parseInt(btn.getAttribute('data-req'),10)]; if(!r) return;
        if(window._gcOffFeat&&window._gcOffFeat.subDoc){ window._gcOffFeat.subDoc(r.sub, r.missing, btn); return; }   /* patch OFFFEAT: through ✅ Approvals, one open per sub */
        var msg=draftRequest(r.sub, r.missing);""", 'board req click')
once("""      +'<div style="font-size:11px;color:#94a3b8;margin-top:10px">Tip: set each sub\\'s COI/insurance expiration date""",
     """      +(window._gcOffFeat?'<div style="font-size:12px;color:#475569;margin-top:10px">Request docs puts one request e-mail to the sub on ✅ Approvals (nothing goes out until it is approved). The CRM also asks by itself 30, 7 and 0 days before a COI runs out, and once for a missing W-9 — those wait on ✅ Approvals too.</div>':'')   /* patch OFFFEAT */
      +'<div style="font-size:11px;color:#94a3b8;margin-top:10px">Tip: set each sub\\'s COI/insurance expiration date""", 'board note')

# 4. Subs tab compliance table (React, minified)
once("""children:[Ut(w.insExp),q?"":" EXP",ke?" ⚠️":""]})""",
     """children:[Ut(w.insExp),q?"":" EXP",ke?" ⚠️":"",window._gcOffFeat?e.jsx("div",{style:{fontSize:10,fontWeight:700},children:window._gcOffFeat.expChip(w.insExp)}):null/* patch OFFFEAT */]})""", 'react gl chip')
once("""children:"✓ YES"}):e.jsx("span",{style:{color:u.red,fontWeight:700,fontSize:11},children:"⛔"})""",
     """children:"✓ YES"}):e.jsx("span",{style:{color:u.red,fontWeight:700,fontSize:11},title:window._gcOffFeat?window._gcOffFeat.blockWhy(w):"",children:["⛔",window._gcOffFeat?e.jsx("div",{style:{fontSize:10,fontWeight:600,maxWidth:160},children:window._gcOffFeat.blockWhy(w)}):null/* patch OFFFEAT */]})""", 'react can pay')

print('OFFFEAT: %d hook(s) patched' % n_done if n_done else 'OFFFEAT: hooks already patched')

# 5. the script (the lien rules, then the features)
TAG = '<script id="gc-patch-offfeat">'
rules = open(os.path.join(root, 'netlify/functions/_lib/lien-deadlines.js'), encoding='utf-8').read().strip()
feat = open(os.path.join(here, 'offfeat.js'), encoding='utf-8').read().strip()
js = rules + '\n' + feat + '\n'
assert '</script' not in js.lower()
if TAG in t:
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] == js: print('OFFFEAT: script already current')
    else: t = t[:i] + js + t[j:]; print('OFFFEAT: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'OFFFEAT: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + js + '</script>\n'
    print('OFFFEAT: script added')
open(p, 'w', encoding='utf-8').write(t)
