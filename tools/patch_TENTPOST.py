# patch TENTPOST (owner 11/25): "when I change a job to active and it has a tentative schedule, ask if we want to post that as the
# schedule or edit it before posting the schedule." — an inline card (✅ Post as the schedule · ✏️ Edit first · Later), never a popup.
#   • the Schedule screen opens on its 📋 Tentative tab filtered to one job when asked (window.__gcSchedOpen, window._gcSchedSet);
#   • tools/tentpost.js: the card, the desk save's hold, Post / Edit first / Later (a To-Do for the job's superintendent or PM).
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
HERE = os.path.dirname(os.path.abspath(__file__))
s = open(P, encoding='utf-8').read()
def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:90])
    s = s.replace(a, b)
# the Schedule screen (bundle): open on a tab / job asked for, and a setter for when it is already open
rep('[_pidF,_setPidF]=ce.useState(null)',
    '[_pidF,_setPidF]=ce.useState(function(){try{var h=window.__gcSchedOpen;return h&&Date.now()-h.at<15000&&h.pid||null}catch(_e){return null}})/* patch TENTPOST */')
rep('[U,Z]=ce.useState("mine"),',
    '[U,Z]=ce.useState(function(){try{var h=window.__gcSchedOpen;return h&&Date.now()-h.at<15000&&h.scope||"mine"}catch(_e){return"mine"}}),_gcTPset=(window._gcSchedSet=function(o){try{if(o&&o.pid!==undefined)_setPidF(o.pid);if(o&&o.scope)Z(o.scope)}catch(_e){}}),/* patch TENTPOST */')
JS = open(os.path.join(HERE, 'tentpost.js'), encoding='utf-8').read()
rep('<script id="gc-patch-portaled">', JS + '<script id="gc-patch-portaled">')
open(P, 'w', encoding='utf-8').write(s)
print('TENTPOST ok')
