# patch BIDTILE (owner 11/24, iPhone Field home): "want a button for the bid portal" — a 🏗 Bid portal tile on the Field home
# (admin, and a PM / estimator whose role may open the Bid portal screen; the tile hides when the role can't).
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
s = open(P, encoding='utf-8').read()
def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:80])
    s = s.replace(a, b)
rep("  leads:     { ic: '📥', l: 'Leads', view: 'leads', run: function(){ go('leads'); } },\n",
    "  leads:     { ic: '📥', l: 'Leads', view: 'leads', run: function(){ go('leads'); } },\n"
    "  bidportal: { ic: '🏗', l: 'Bid portal', view: 'bidportal', run: function(){ go('bidportal'); } },   /* BIDTILE: owner 11/24 — the Bid portal screen from the Field home */\n")
rep("if (a === 'admin') L = ['leads', 'speak', 'systems', 'addjob', 'todo']",
    "if (a === 'admin') L = ['leads', 'bidportal', 'speak', 'systems', 'addjob', 'todo']   /* BIDTILE */")
rep("else if (a === 'pm') L = ['speak', 'log', 'todo', 'sendest'];",
    "else if (a === 'pm') L = ['speak', 'log', 'todo', 'sendest', 'bidportal'];   /* BIDTILE: shown only when the role may open the Bid portal */")
open(P, 'w', encoding='utf-8').write(s)
print('BIDTILE ok')
