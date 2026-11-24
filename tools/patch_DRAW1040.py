# DRAW1040 (owner 11/23: "have 10/40/40/10 as default and an option"): the draw schedule — a 10/40/40/10 preset button (first), and the
# default for new jobs. Jobs that never had a schedule keep billing on the old standard 50/50 (_gcLegacyDraws), so nothing already
# billed changes.
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'DRAW1040' not in s
btn = 'e.jsx("button",{type:"button",style:{background:z.drawSchedule==="25/25/50"?"#d4a01733":"transparent",border:"1px solid #d4a01744",borderRadius:3,color:"#d4a017",padding:"2px 6px",fontSize:9,cursor:"pointer",fontFamily:"inherit"},onClick:()=>De({...z,drawSchedule:"25/25/50"}),children:"25/25/50"})'
assert s.count(btn) == 1
s = s.replace(btn, btn.replace('25/25/50', '10/40/40/10') + ',' + btn)
a = "window._gcDefaultDraws = '50/50';"
assert s.count(a) == 1
s = s.replace(a, "window._gcDefaultDraws = '10/40/40/10';   /* DRAW1040: new jobs */\nwindow._gcLegacyDraws = '50/50';   /* DRAW1040: a job that never had a schedule keeps its old 50/50 billing */")
b = "  return (window._gcValidDraws(own).ok) ? String(own) : window._gcDefaultDraws;"
assert s.count(b) == 1
s = s.replace(b, "  return (window._gcValidDraws(own).ok) ? String(own) : (window._gcLegacyDraws || '50/50');   /* DRAW1040 */")
open(p, 'w', encoding='utf-8').write(s); print('DRAW1040 applied')
