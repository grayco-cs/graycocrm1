#!/usr/bin/env python3
"""Idempotent patch JOBUPDATES (owner 11/03, iPhone, Field, job "ROTC Cordova"): "Clicked Post Update, it popped up this
dark screen, not just a post update page. All updates need to be shown on that button along with add update. I want its
own button, and it just shows all updates and notes on this job."

Cause: the job page's "Post Update" tile (and its FIELDPORTAL re-order) called openJobProfileAt(job, '_jpUpdateText'),
i.e. window._gcOpenJobProfile — the old dark "Job Info" sheet (customer e-mail, Call/Email, Scope of Work, Photos,
Store a Document, Send job info to a sub…) scrolled down to its "Job Updates" box.

Now (tools/jobupdates.js, see its header):
  * the tile is "📝 Updates & notes" (same place) and opens its own white page in the CRM: ‹ Back + the job name on
    top (a fixed bar under the notch, always on screen), "Add an update" + a big Post button (the old box's own save:
    project.updates through window._setProjects), and below, newest first, every update and note the CRM already keeps
    on the job, with filter chips All · Updates · Notes · Daily log · Customer-visible. Read-only; nothing migrates.
  * the phone's Back returns to the job page (a history entry; patch NAV's back rule).
  * the 📋 Job Info tile and the Job Info sheet are not touched.

Also (owner, same day): "the ‹ Back button was not visible at first and only appeared after I tapped somewhere" — see
NAVFIRST below: patch NAV's floating ‹ Back pill (#_gcNavBk, the shared back control of Field sheets without their own)
is decided from the first paint, again whenever the screen scrolls or a sheet finishes opening, and is never hidden
behind the notch.

The script goes in as <script id="gc-patch-jobupdates"> at the end of the page (replaced when it changes).
Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_JOBUPDATES.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
orig = t
assert '<script id="gc-patch-fieldportal">' in t, 'JOBUPDATES needs patch FIELDPORTAL first'
assert '__GC_PATCH_NAV__' in t, 'JOBUPDATES needs patch NAV'

def rep(t, old, new, mark):
    if mark in t:
        return t
    n = t.count(old)
    assert n == 1, ('anchor count != 1', old[:80], n)
    return t.replace(old, new)

# ── NAVFIRST: the shared floating ‹ Back is there from the first paint ─────────────────────────────────────────────
# Measured (test_JOBUPDATES, iPhone 390x844, real-data mirror): on the job page patch NAV marks the job page
# data-gcnav-pad (it wants its own ‹ Back there) and patch FIELDPORTAL hides that button while the job page carries
# the mark ('html:has(#_gcJobDash.gcfp-shell[data-gcnav-pad]) #_gcNavBk{display:none}'). The mark was only ever cleared
# when NO button was needed — so a sheet opened over the job page (Job Info, the old "Post Update") got its button
# drawn but hidden by that rule, for as long as it stayed open; it came back only after something else re-ran the check.
# Now: whatever screen is on top, no screen under it keeps the mark (so the rule only applies while the job page IS
# the top screen). And the check ran late after a tap: the page's MutationObserver governor holds NAV's watcher for
# 1.5 s after any touch, so the button waited for NAV's 0.7 s loop (measured ~0.45 s). It now also runs right after a
# tap that changed the screens, and once a scroll stops (a sheet's own ✕ scrolled away).
NAVFIRST = [
    ("""  var need = !!t && (page || !hasOwnBack(t));
  if (!need) { if (b) b.style.display = 'none'; D.querySelectorAll('[data-gcnav-pad]').forEach(function(e){ if (e !== t) e.removeAttribute('data-gcnav-pad'); }); return; }""",
     """  var need = !!t && (page || !hasOwnBack(t));
  /* patch JOBUPDATES (NAVFIRST): only the top screen may carry the mark — patch FIELDPORTAL hides this button while the
     job page carries one, and a mark left on the job page hid the ‹ Back of every sheet opened over it */
  D.querySelectorAll('[data-gcnav-pad]').forEach(function(e){ if (e !== t) e.removeAttribute('data-gcnav-pad'); });
  if (!need) { if (b) b.style.display = 'none'; return; }""",
     'patch JOBUPDATES (NAVFIRST): only the top screen'),
    ("""try { new MutationObserver(soon).observe(D.body, { childList: true }); } catch (e) {}""",
     """try { new MutationObserver(soon).observe(D.body, { childList: true }); } catch (e) {}
/* patch JOBUPDATES (NAVFIRST): the page's MutationObserver governor holds every watcher (this one too) for 1.5 s after
   a tap, and for as long as the finger keeps moving — so a sheet opened by a tap waited for the next 0.7 s check, or
   for the next tap. Check right after the tap's own handlers ran (when the screens changed), and once a scroll stops. */
var _nfS = 0;
function nfSig(){ var b = D.body; return b ? b.childElementCount + '|' + (b.lastElementChild ? (b.lastElementChild.id || b.lastElementChild.className || b.lastElementChild.tagName) : '') : ''; }
D.addEventListener('click', function(){
  var a = nfSig(), lc = D.body && D.body.lastElementChild;
  var chk = function(){ if (nfSig() !== a || (D.body && D.body.lastElementChild !== lc)) soon(); };
  RT(chk, 0); RT(chk, 350);
}, true);
W.addEventListener('scroll', function(){ try { clearTimeout(_nfS); } catch (e) {} _nfS = RT(soon, 200); }, { capture: true, passive: true });""",
     'patch JOBUPDATES (NAVFIRST): the page'),
]

for old, new, mark in NAVFIRST:
    t = rep(t, old, new, mark)

# ── the page ────────────────────────────────────────────────────────────────────────────────────────────────────
TAG = '<script id="gc-patch-jobupdates">'
js = open(os.path.join(here, 'jobupdates.js'), encoding='utf-8').read().strip() + '\n'
assert '</script' not in js.lower()
if TAG in t:
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] == js: print('JOBUPDATES: script already current')
    else: t = t[:i] + js + t[j:]; print('JOBUPDATES: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'JOBUPDATES: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + js + '</script>\n'
    print('JOBUPDATES: script added')
if t != orig:
    open(p, 'w', encoding='utf-8').write(t)
else:
    print('JOBUPDATES: nothing to do')
