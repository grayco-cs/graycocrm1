# patch BIDTILE2 (owner 11/24, iPhone Field home): "Click in needs to be bid portal for admin" / "change clock in button for pms to
# something they will use more" — the big ⏱ Clock in tile becomes 🏗 Bid portal for an admin and 💬 Messages for a PM (commission
# or salary); someone paid by the hour keeps ⏱ Clock in. The admin's small 🏗 Bid portal tile goes (the big one replaces it).
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
s = open(P, encoding='utf-8').read()
def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:80])
    s = s.replace(a, b)
rep("if (a === 'admin') L = ['leads', 'bidportal', 'speak', 'systems', 'addjob', 'todo']   /* BIDTILE */",
    "if (a === 'admin') L = ['leads', 'speak', 'systems', 'addjob', 'todo']   /* BIDTILE2: 🏗 Bid portal is the big tile */")
rep("""    var l = q[2], sm = q[3];
    if (q[0] === 'clock') {""",
    """    var l = q[2], sm = q[3];
    /* BIDTILE2: the clock slot — admin 🏗 Bid portal, PM 💬 Messages (an hourly person keeps ⏱ Clock in) */
    if (q[0] === 'clock' && com && a === 'admin' && k.shown('bidportal')) return '<button type="button" class="gc-pmf-t" data-pmf-a="bidportal"><span class="e">🏗</span><span class="l">Bid portal</span><small>Bid jobs · invites · sub bids</small></button>';
    if (q[0] === 'clock' && com && a === 'pm' && k.shown('msgs')) return '<button type="button" class="gc-pmf-t" data-pmf-a="msgs"><span class="e">💬</span><span class="l">Messages</span><small>Customers · subs · the team</small></button>';
    if (q[0] === 'clock') {""")
rep("  if (a === 'msgs') { closeSheets(); return k && k.run('msgs'); }\n",
    "  if (a === 'msgs') { closeSheets(); return k && k.run('msgs'); }\n"
    "  if (a === 'bidportal') { closeSheets(); return k && k.run('bidportal'); }   /* BIDTILE2 */\n")
rep("    if (QUICK.some(function(q){ return q[0] === a; })) return quick(a, b);",
    "    if (QUICK.some(function(q){ return q[0] === a; }) || a === 'bidportal' || a === 'msgs') return quick(a, b);   /* BIDTILE2 */")
open(P, 'w', encoding='utf-8').write(s)
print('BIDTILE2 ok')
