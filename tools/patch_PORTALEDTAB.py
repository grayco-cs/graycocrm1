# PORTALEDTAB (owner 11/26, screenshot of 👤 Customer portals with "no portal yet" on all 5 Head Start jobs: "should be able to get into their
# portal and look around AND EDIT IF I NEED TO"): every job on the tab gets ✏️ Edit portal (the job's own portal editor, PORTALED — the same
# rules: nothing goes to the customer without its own button) next to 👁 See what they see; and opening the tab makes the missing links
# itself (a few at a time — nothing is sent to the customer), so "🏠 Make portal" is only a fallback when the server could not answer.
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'PORTALEDTAB' not in s
def sub(a, b):
    global s
    assert s.count(a) == 1, (a[:70], s.count(a)); s = s.replace(a, b)
sub("""  else if (!p.portalOff && typeof P.link === 'function') h += '<button type="button" class="spx-b" data-spx-a="make" data-pid="' + esc(p.id) + '">🏠 Make portal</button>';""",
    """  else if (!p.portalOff && typeof P.link === 'function') h += '<button type="button" class="spx-b" data-spx-a="make" data-pid="' + esc(p.id) + '"' + (AUTOMK[p.id] === 1 ? ' disabled>Making the link…' : '>🏠 Make portal') + '</button>';
  try { if (W._gcPortalEd && typeof W._gcPortalEd.open === 'function' && (typeof W._gcPortalEd.can !== 'function' || W._gcPortalEd.can(p.id))) h += '<button type="button" class="spx-b" data-spx-a="edit" data-pid="' + esc(p.id) + '">✏️ Edit portal</button>'; } catch (e) {}   /* patch PORTALEDTAB */""")
sub("""    if (a === 'see') return;   /* the link opens the tab itself */
    if (!p || !custOk(p)) { toast('This job is not one of yours.'); return; }
    var P = W._gcPortal || {};""",
    """    if (a === 'see') return;   /* the link opens the tab itself */
    if (!p || !custOk(p)) { toast('This job is not one of yours.'); return; }
    var P = W._gcPortal || {};
    if (a === 'edit') { try { W._gcPortalEd.open(p.id); } catch (e2) { toast('The portal editor did not open — reload the CRM.'); } return; }   /* patch PORTALEDTAB */""")
sub("""function paint(){
  var el = UI.el; if (!el || !D.body.contains(el)) return;
  var all = jobs(), q = low(UI.q),""",
    """/* patch PORTALEDTAB: the jobs on the tab with no link get it made, one after another (nothing is sent to the customer) */
var AUTOMK = {};
function autoMake(all){
  var P = W._gcPortal || {}; if (typeof P.link !== 'function' || navigator.onLine === false) return;
  var todo = all.filter(function(p){ return !p.portalOff && !linkOf(p) && !AUTOMK[p.id]; }).slice(0, 25);
  if (!todo.length) return;
  todo.forEach(function(p){ AUTOMK[p.id] = 1; });
  (function next(){ var p = todo.shift(); if (!p) { paint(); return; }
    Promise.resolve(P.link(p.id)).then(function(u){ if (u && LINK.test(u)) { MADE[p.id] = u; STATS.made++; AUTOMK[p.id] = 2; } else AUTOMK[p.id] = 3; }, function(){ AUTOMK[p.id] = 3; })
      .then(function(){ later(next, 600); }); })();
}
function paint(){
  var el = UI.el; if (!el || !D.body.contains(el)) return;
  try { if (canTab()) autoMake(jobs()); } catch (e) {}
  var all = jobs(), q = low(UI.q),""")
open(p, 'w', encoding='utf-8').write(s); print('PORTALEDTAB applied')
