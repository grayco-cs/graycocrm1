"""patch ESTSKIN (owner 11/9: "make the estimate builder screens look better too … detailed by material quantities like how
Claude does it … don't do .... or ------, do one - then the price"):
 · builder screens: GrayCo navy / gold skin (cards, tabs, buttons, inputs, line items, totals) — CSS only, scoped to #gc-est-overlay
 · lines added from a calculator / Quick Build: "Framing labor  --  3,000 floor SF" → "Framing labor - 3,000 floor SF"
 · the proposal: each trade "1. Framing - $23,270.00", and every item a bullet WITH its quantity
   ("Metal studs 3-5/8" 20ga (1,830 LF)"); our unit prices ("($0.625/LF)") never show on the customer copy"""
import sys
P = 'index.html'; src = open(P).read()
if '/*ESTSKIN*/' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    c = src.count(a); assert c == 1, (a[:80], c); src = src.replace(a, b)
SKIN = """
/*ESTSKIN — GrayCo navy / gold (owner 11/9: "make the estimate builder screens look better") */
#gc-est-overlay{--text:#0F1D2F;--text2:#5B6778;--bg2:#F4F6FA;--bg3:#E9EDF3;--bdr:rgba(15,29,47,.10);--bdr2:rgba(15,29,47,.20);--gold:#D4A017;--navy:#0F1D2F;background:#E9EDF3 !important}
#gc-est-bar{background:#0F1D2F !important;border-bottom:3px solid #D4A017 !important}
#gc-est-overlay .app{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13.5px;color:var(--text)}
#gc-est-overlay .card{border:1px solid #DFE4EC;border-radius:14px;padding:1.05rem 1.2rem;box-shadow:0 1px 2px rgba(15,29,47,.05),0 4px 14px rgba(15,29,47,.04)}
#gc-est-overlay .sect{font-size:12px;color:var(--navy);letter-spacing:.08em;border-left:3px solid var(--gold);padding-left:8px;margin-bottom:.75rem}
#gc-est-overlay .tabs{border:1px solid #DFE4EC;border-radius:12px;padding:5px;box-shadow:0 1px 2px rgba(15,29,47,.05)}
#gc-est-overlay .tab{font-weight:600;font-size:12.5px;padding:7px 13px;border-radius:9px}
#gc-est-overlay .tab.active{background:var(--navy);color:#fff;box-shadow:inset 0 -2px 0 var(--gold)}
#gc-est-overlay .f label{font-size:11.5px;font-weight:600;color:#3D4A5C}
#gc-est-overlay .f input,#gc-est-overlay .f select,#gc-est-overlay .f textarea,#gc-est-overlay .li,#gc-est-overlay .srch{border:1px solid #D3DAE5;border-radius:9px;padding:8px 10px;font-size:13.5px;background:#fff}
#gc-est-overlay .li{padding:6px 8px;font-size:12.5px}
#gc-est-overlay .f input:focus,#gc-est-overlay .f select:focus,#gc-est-overlay .f textarea:focus,#gc-est-overlay .li:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(212,160,23,.18)}
#gc-est-overlay .btn{border:1px solid #CBD3DF;border-radius:9px;font-weight:600;padding:7px 13px}
#gc-est-overlay .btn.pri{background:var(--navy);border-color:var(--navy);color:#fff}
#gc-est-overlay .btn.pri:hover{opacity:1;background:#1B2D45;box-shadow:0 0 0 2px rgba(212,160,23,.35)}
#gc-est-overlay .cb,#gc-est-overlay .af{background:#F6F8FB;border:1px solid #E5E9F0;border-radius:12px}
#gc-est-overlay .el{border:1px solid #E1E6EE;border-radius:11px;margin-bottom:6px;box-shadow:0 1px 2px rgba(15,29,47,.04)}
#gc-est-overlay .el:hover{border-color:#C9D2DF}
#gc-est-overlay .elb{background:#F6F8FB;border-top:1px solid #E5E9F0;border-radius:0 0 11px 11px}
#gc-est-overlay th{background:#F1F4F8;color:var(--navy);font-size:10.5px}
#gc-est-overlay .met{background:#fff;border:1px solid #E1E6EE;border-radius:12px}
#gc-est-overlay .met .v{color:var(--navy);font-weight:700}
#gc-est-overlay .sr{font-size:13.5px}
#gc-est-overlay .sr.tot{color:var(--navy);font-size:16px;border-top:2px solid var(--gold)}
#gc-est-overlay .cr2{border:1px solid #E1E6EE;border-radius:10px}
#gc-est-overlay .info{border-radius:10px;border-color:rgba(12,68,124,.18)}
#gc-est-overlay .cf.active,#gc-est-overlay .mb.active,#gc-est-overlay .est-tab.active{background:var(--navy);border-color:var(--navy)}
"""
rep("""#gc-est-overlay input[list]:focus{outline:none;border-color:var(--blue);}
""", """#gc-est-overlay input[list]:focus{outline:none;border-color:var(--blue);}
""" + SKIN)
# one dash in line names
rep("""  const newLines=allCalcLines.map(l=>({id:uid(),...l,mult:(_calcMult!=='type'?_calcMult:(l.mult||'type'))}));""",
    """  const newLines=allCalcLines.map(l=>({id:uid(),...l,desc:String(l.desc||'').replace(/\\s+-{2,}\\s+/g,' - '),mult:(_calcMult!=='type'?_calcMult:(l.mult||'type'))}));   /* ESTSKIN: one dash */""")
# the proposal: quantities in the bullets, "1. Framing - $X"
rep("""      groups[cat].items.push(l.desc||'');""", """      groups[cat].items.push(l.desc||'');
      (groups[cat].rows=groups[cat].rows||[]).push(l);   /* ESTSKIN */""")
rep("""      return { label:label, total:groups[cat].total, cat:cat, items:groups[cat].items.filter(Boolean) };   /*PROPLOOK*/""",
    """      return { label:label, total:groups[cat].total, cat:cat, items:groups[cat].items.filter(Boolean), rows:groups[cat].rows||[] };   /*PROPLOOK*/""")
rep("""      var seen = {}, items = (l.items || []).map(function(t){ return String(t).replace(/\\s+--\\s+/g, ' — ').replace(/\\s+/g, ' ').trim(); }).filter(function(t){ var k = t.toLowerCase(); if (!t || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 10);
      return '<li class="trade"><div class="th"><span>'+esc(l.cat || l.label)+'</span>'+(l.total? '<span>$'+money(l.total)+'</span>' : '')+'</div>'""",
    """      /* ESTSKIN: every item with its quantity — "Metal studs 3-5/8" 20ga (1,830 LF)"; never our unit prices */
      var fmtQ = function(n){ n = parseFloat(n) || 0; return n ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''; };
      var itemOf = function(r){
        var d = String((r && r.desc) || r || '').replace(/\\s*\\((?:[^()]*\\$[^()]*)\\)/g, '').replace(/\\s*@\\s*\\$[\\d.,]+(\\/\\w+)?/g, '').replace(/\\$[\\d.,]+\\s*\\/\\s*\\w+/g, '').replace(/\\s+/g, ' ').trim();
        var m = /^(.*?)\\s+-{1,2}\\s+([\\d,.]+\\s*[A-Za-z][\\w ./]*)$/.exec(d), q = '';
        if (m) { d = m[1]; q = m[2]; }
        else if (r && typeof r === 'object') { var qq = parseFloat(r.qty) || 0, u = String(r.unit || '').replace(/^per\\s+/i, ''); if (qq > 1 && u) q = fmtQ(qq) + ' ' + u; }
        d = d.replace(/\\s+-{2,}\\s+/g, ' - ').replace(/[\\s\\-]+$/, '');
        return d ? d + (q ? ' (' + q.replace(/\\s+/g, ' ').trim() + ')' : '') : '';
      };
      var seen = {}, items = ((l.rows && l.rows.length) ? l.rows : (l.items || [])).map(itemOf).filter(function(t){ var k = t.toLowerCase(); if (!t || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 14);
      return '<li class="trade"><div class="th"><span>'+esc(l.cat || l.label)+(l.total? ' - $'+money(l.total) : '')+'</span></div>'""")
rep("""+'ol.scope .th{display:flex;justify-content:space-between;gap:12px;font-weight:700}""", """+'ol.scope .th{font-weight:700}""")
open(P, 'w').write(src); print('ok')
# (applied in the same release) the TIN in the proposal's top header: _gcDocHeader({ tin: true }) adds " · TIN #33-2106808"
# to the license line; the separate "TIN#33-2106808" line under the header is gone.
# (same release) the quantity is not added when the item text already carries one; units plural ("120 sheets", "9 pcs").
