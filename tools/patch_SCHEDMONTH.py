# SCHEDMONTH (owner 11/25: "yes open on current month"): on 11/24 the Schedule opened on December 2026 (0 items) — the month the person
# had moved to earlier, remembered for as long as the page stays open (the old "keep your month" fix, so it does not snap back while
# someone works in it). Now: still kept while you work in it, but after 10 minutes without touching the month / year buttons the
# Schedule opens on the CURRENT month and year again.
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'SCHEDMONTH' not in s
def sub(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:60], s.count(a)); s = s.replace(a, b)
sub("onClick:()=>{_schedNav.m=xe;Y(xe)}", "onClick:()=>{_schedNav.at=Date.now();_schedNav.m=xe;Y(xe)}")
sub("onClick:()=>{_schedNav.m=-1;Y(-1)}", "onClick:()=>{_schedNav.at=Date.now();_schedNav.m=-1;Y(-1)}")
sub("onClick:()=>{_schedNav.y=F;B(F)}", "onClick:()=>{_schedNav.at=Date.now();_schedNav.y=F;B(F)}")
sub("ce.useState(_schedNav.m)", "ce.useState((Date.now()-(_schedNav.at||0)>6e5&&(_schedNav.m=new Date().getMonth(),_schedNav.y=new Date().getFullYear()),_schedNav.m))/*SCHEDMONTH: 10 min untouched → the current month*/")
open(p, 'w', encoding='utf-8').write(s); print('SCHEDMONTH applied')
