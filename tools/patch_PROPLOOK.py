"""patch PROPLOOK (owner 11/9: "make the estimate builder look like our estimates … it's very typewritery"):
the builder's proposal PDF (_gcBuildGrayCoProposal) now follows the GrayCo proposal the team sends (the Nichols garage
proposal): Arial, logo header, PROPOSAL + date, a PROJECT block (Project / Location / Submitted To / Scope), SCOPE OF WORK
AND PRICING — each trade a bold numbered heading with its price on the right and its items as bullets —, the estimate's
own Inclusions / Exclusions (Scope tab) as their own sections, then the company notes / exclusions / terms as before
(the ⚙ Proposal template's markers are unchanged), and a page footer."""
import sys
P = 'index.html'; src = open(P).read()
if '/*PROPLOOK*/' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    c = src.count(a); assert c == 1, (a[:80], c); src = src.replace(a, b)
rep("""      var label=cat + (hints? (' - '+hints):'');
      return { label:label, total:groups[cat].total };""", """      var label=cat + (hints? (' - '+hints):'');
      return { label:label, total:groups[cat].total, cat:cat, items:groups[cat].items.filter(Boolean) };   /*PROPLOOK*/""")
rep("""    var scopeHTML = lines.map(function(l, i){
      return '<li style="margin:4px 0"><b>'+esc(l.label)+'</b>'+(l.total? (' - <b>$'+money(l.total)+'</b>') : '')+'</li>';
    }).join('');""", """    var scopeHTML = lines.map(function(l, i){   /* PROPLOOK: "1. Framing ............ $23,270.00" + its items as bullets */
      var seen = {}, items = (l.items || []).map(function(t){ return String(t).replace(/\\s+--\\s+/g, ' — ').replace(/\\s+/g, ' ').trim(); }).filter(function(t){ var k = t.toLowerCase(); if (!t || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 10);
      return '<li class="trade"><div class="th"><span>'+esc(l.cat || l.label)+'</span>'+(l.total? '<span>$'+money(l.total)+'</span>' : '')+'</div>'
        + (items.length ? '<ul class="items">'+items.map(function(t){ return '<li>'+esc(t)+'</li>'; }).join('')+'</ul>' : '') + '</li>';
    }).join('');
    var _sc = est.scope || {}, _lst = function(t){ return String(t || '').split(/\\n+/).map(function(x){ return x.replace(/^\\s*[-•*\\u2022]\\s*/, '').trim(); }).filter(Boolean); };
    var incList = _lst(_sc.inc || est.inclusions), excList = _lst(_sc.exc || est.exclusionsText);
    var submittedTo = est.client || est.gc || est.customer || '';""")
rep("""    var css = 'body{font-family:\\"Times New Roman\\",Georgia,serif;color:#111;font-size:12pt;line-height:1.5;margin:0 auto;padding:40px 54px;max-width:8.5in}'""",
    """    var css = 'body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:10.5pt;line-height:1.45;margin:0 auto;padding:36px 54px 60px;max-width:8.5in}'   /* PROPLOOK: Arial like the proposals the team sends */
      +'.ptitle{text-align:center;font-size:17pt;font-weight:700;letter-spacing:.02em;margin:18px 0 0}.pdate{text-align:center;font-size:10.5pt;margin:2px 0 14px}'
      +'.proj div{margin:2px 0}.proj b{font-weight:700}'
      +'ol.scope{list-style:none;counter-reset:tr;padding-left:0}ol.scope>li.trade{counter-increment:tr;margin:10px 0 8px;break-inside:avoid}'
      +'ol.scope .th{display:flex;justify-content:space-between;gap:12px;font-weight:700}ol.scope .th>span:first-child::before{content:counter(tr) ". "}'
      +'ul.items{margin:3px 0 0;padding-left:34px;list-style:disc}ul.items li{margin:1px 0}'
      +'.pfoot{margin-top:24px;text-align:center;font-size:8.5pt;color:#555}@media print{.pfoot{position:fixed;bottom:6px;left:0;right:0;margin:0}}'""")
rep("""      +'h2{font-size:12pt;margin:18px 0 6px;text-decoration:underline}'""", """      +'h2{font-size:11pt;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.02em}'""")
rep("""      +'.total{font-weight:700;font-size:12.5pt;margin:12px 0}'""", """      +'.total{font-weight:700;font-size:12pt;margin:14px 0 10px;padding:8px 0;border-top:1.5px solid #111;overflow:hidden}'""")
rep("""      +'.small{font-size:10.5pt;color:#222}'""", """      +'.small{font-size:9.5pt;color:#222}'""")
rep("""      + '<div class="center" style="margin:22px 0 14px;font-weight:700">'+esc(dateStr)+'</div>'
      + '<h2>OVERVIEW:</h2>'
      + '<div class="center" style="margin:6px 0"><u><b>Project:</b></u> <b>'+esc(proj)+'</b></div>'
      + (loc? '<div class="center" style="margin:6px 0"><u><b>Location</b></u> : <b>'+esc(loc)+'</b></div>' : '')
      + (scopeSummary? '<div class="center" style="margin:8px 0"><u><b>Proposed scope of work:</b></u> <b>'+esc(scopeSummary)+'</b></div>' : '')
      + '<h2 style="margin-top:18px">SCOPE OF WORK:</h2>'
      + '<ol class="scope">'+scopeHTML+'</ol>'
      + '<div class="total">The total amount of this Proposal is: $'+money(subtotal)+'</div>'""",
"""      + '<div class="ptitle">PROPOSAL</div><div class="pdate">'+esc(dateStr)+'</div>'
      + '<h2>Project</h2><div class="proj">'
        + '<div><b>Project:</b> '+esc(proj)+'</div>'
        + (loc? '<div><b>Location:</b> '+esc(loc)+'</div>' : '')
        + (submittedTo? '<div><b>Submitted To:</b> '+esc(submittedTo)+'</div>' : '')
        + (scopeSummary? '<div><b>Scope:</b> '+esc(scopeSummary)+'</div>' : '')
      + '</div>'
      + '<h2 style="margin-top:18px">Scope of Work and Pricing</h2>'
      + '<ol class="scope">'+scopeHTML+'</ol>'
      + (incList.length ? '<h2>Inclusions</h2><ul class="notes small">'+incList.map(function(t){ return '<li>'+esc(t)+'</li>'; }).join('')+'</ul>' : '')
      + (excList.length ? '<h2>Project Exclusions</h2><ul class="notes small">'+excList.map(function(t){ return '<li>'+esc(t)+'</li>'; }).join('')+'</ul>' : '')
      + '<div class="total">The total amount of this Proposal is: $'+money(subtotal)+'</div>'""")
rep("""        + 'Contractor Signature:__________________________ Date:____'+esc(new Date().toLocaleDateString('en-US'))+'____'
      + '</div>'
      + '</body></html>';""", """        + 'Contractor Signature:__________________________ Date:____'+esc(new Date().toLocaleDateString('en-US'))+'____'
      + '</div>'
      + '<div class="pfoot">GrayCo Construction Services, LLC | '+esc(proj)+'</div>'
      + '</body></html>';""")
open(P, 'w').write(src); print('ok')
