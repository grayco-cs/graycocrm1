#!/usr/bin/env python3
"""patch HUBBIDS: in 👷 Subs & portal on a job, when a 🏗 Bid portal job matches it (p.bidJobId, the lead it came from, or the same name):
"🏗 Invite subs to bid" (the Bid portal's multi-pick invite) and "See bids (n)" (award / not selected)."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*HUBBIDS*/' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    assert src.count(a) == 1, (src.count(a), a[:80]); src = src.replace(a, b)
rep("""    sh.body.innerHTML = h;
  }
  sh.el.__paint = paint;
  paint();
  loadPunch().then(paint);""",
"""    /*HUBBIDS*/ var bj = bidJob(); if (bj) h += '<section class="gcsub-card"><div class="gcsub-row2"><b>🏗 Sub bids — ' + esc(bj.title || '') + '</b><span class="gcsub-muted">' + esc(bj.visibility === 'public' ? 'Public' : 'Private') + ' · ' + (bj.invited || 0) + ' invited · ' + (bj.bids || 0) + ' bid' + (bj.bids === 1 ? '' : 's') + '</span></div><div class="gcsub-cta"><button type="button" class="gcsub-btn g" data-act="bid-invite" data-id="' + esc(bj.id) + '">🏗 Invite subs to bid</button><button type="button" class="gcsub-btn" data-act="bid-see" data-id="' + esc(bj.id) + '">See bids (' + (bj.bids || 0) + ') · award</button></div></section>';
    sh.body.innerHTML = h;
  }
  function bidJob(){ try {
    var S = window._gcSys && window._gcSys.bp; if (!S) return null; var L = S.jobs() || [];
    var norm = function(v){ return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }, nm = norm(p.name);
    return L.find(function(j){ return j && p.bidJobId && j.id === p.bidJobId; }) || L.find(function(j){ return j && j.leadId && (j.leadId === p.leadId || j.leadId === p.fromLead || j.leadId === p.leadInboxId); })
      || (nm.length >= 6 ? L.find(function(j){ var t = norm(j && j.title); return t.length >= 6 && (t === nm || t.indexOf(nm) > -1 || nm.indexOf(t) > -1); }) : null) || null;
  } catch (e) { return null; } }
  sh.el.__paint = paint;
  paint();
  try { if (window._gcSys && window._gcSys.bp) { window._gcSys.bp.load(); setTimeout(function(){ if (document.body.contains(sh.el)) paint(); }, 2500); } } catch (e) {}
  loadPunch().then(paint);""")
rep("""    if (act === 'scope-files') {""",
"""    if (act === 'bid-invite' || act === 'bid-see') { sh.close(); return act === 'bid-invite' ? window._gcSys.bp.invite(b.getAttribute('data-id')) : window._gcSys.bp.bids(b.getAttribute('data-id')); }
    if (act === 'scope-files') {""")
open(P, 'w', encoding='utf-8').write(src); print('patched')
