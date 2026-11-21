#!/usr/bin/env python3
"""Idempotent patch FIELDTAPS (owner 11/20, iPhone, GrayCo Field installed app: "New appointment and other buttons don't
work ... why hasn't every button been tested?"). Found by tools/tests/test_FIELDTAPS.mjs (every Field control tapped as an
installed iPhone app, per role, fresh / after a background-resume / after a network drop):

1. GrayCo Photos opened from a job page (📸 Photos, 🔗 Share photos, the camera) remembers the job so that closing it comes
   back to that job page 150 ms / 700 ms later. When it was closed because the person tapped the bottom bar (🏠 Home, Jobs,
   Today, ...), that delayed "back to the job" re-opened the job page OVER the screen the tab had just opened: the 🏠 Home
   tab looked dead (crew, after a resume). Now a bottom-bar tap in the last 2.5 s wins: the tab goes where it says.
2. "✅ Estimate saved — N on file" toast (every estimate save, autosave included): 5 s at the bottom right, z-index max, taking
   taps — on the phone it lay over the bottom bar and ate taps on 🏠 Home / ☰ More (PM: More → 🧮 Estimates → 🏠 Home did
   nothing; job page → back to Home trapped). Now pointer-events:none, and above the Field's bottom bar.
3. A lead asked to open (Field Home "Open", a link) waits up to 150 s for Leads to be ready, then opens its drawer — even when
   the person had already tapped 🏠 Home: the lead drawer popped up over Home later (start, a big company, after a network
   drop). A bottom-bar tap after the ask now cancels it.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch FIELDTAPS'
if MARK in t: print('FIELDTAPS: already patched'); sys.exit(0)
def once(a, b):
    global t
    n = t.count(a); assert n == 1, ('FIELDTAPS anchor', n, a[:90]); t = t.replace(a, b)

# the bottom bar (and a desk page's ‹ in the Field) — a tap there means "take me there", newer than anything pending
TABSEL = "#gc-fh-tabs [data-t],#gc-ra-dock [data-t],#_gcAppBack"
HOOK = "try { if (!window.__gcTabTapHook) { window.__gcTabTapHook = 1; ['pointerdown', 'click'].forEach(function(ev){ window.addEventListener(ev, function(e){ var x = e.target; if (x && x.closest && x.closest('" + TABSEL + "')) window.__gcTabTapAt = Date.now(); }, true); }); } } catch (e) {}   /* patch FIELDTAPS */\n"

# 1. GrayCo Photos close(): no "back to the job page" when a bottom-bar tab closed it
once("""  var fd = S.fromDash; S.fromDash = '';
  if (fd) [150, 700].forEach(function(ms){ later(function(){ try { if (!S.open && !document.getElementById('_gcJobDash') && document.documentElement.classList.contains('_fieldmode')""",
"""  var fd = S.fromDash; S.fromDash = '';
  /* patch FIELDTAPS: closed by a tap on the bottom bar (🏠 Home, Jobs, Today…): the tab goes where it says — no job page over it */
  var tabbed = function(){ return Date.now() - (+window.__gcTabTapAt || 0) < 2500; };
  if (fd && tabbed()) fd = '';
  if (fd) [150, 700].forEach(function(ms){ later(function(){ try { if (!S.open && !tabbed() && !document.getElementById('_gcJobDash') && document.documentElement.classList.contains('_fieldmode')""")

# 1b. note every bottom-bar tap (window capture: before any screen's own handler closes anything)
once("""function close(){
  S.open = false;
  gpsStop(); teardown();""",
HOOK + """function close(){
  S.open = false;
  gpsStop(); teardown();""")

# 2. "✅ Estimate saved — N on file" (each estimate save, autosave too): a 5-second toast at the bottom right, on top of
#    everything (z max) and catching taps — on a phone it lay over the bottom bar (🏠 Home, ☰ More) and ate those taps.
#    Now taps go through it, and in the Field it sits above the bottom bar.
once("""        t.style.cssText='position:fixed;bottom:20px;right:20px;z-index:2147483647;background:'
          +(color||'#16a34a')+';color:#fff;padding:11px 18px;border-radius:8px;'
          +'font-family:Arial,sans-serif;font-size:13px;font-weight:700;'
          +'box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:80vw';""",
"""        t.style.cssText='position:fixed;bottom:20px;right:20px;z-index:2147483647;background:'
          +(color||'#16a34a')+';color:#fff;padding:11px 18px;border-radius:8px;'
          +'font-family:Arial,sans-serif;font-size:13px;font-weight:700;'
          +'box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:80vw;pointer-events:none';   /* patch FIELDTAPS: a toast never eats a tap */
        try{ if(document.documentElement.classList.contains('_fieldmode')) t.style.bottom='calc(116px + env(safe-area-inset-bottom,0px))'; }catch(e){}   /* patch FIELDTAPS: above the Field's bottom bar */""")

# 3. a lead asked to open (Field Home "Open", a lead link …) waits up to 150 s for the Leads screen to be ready and then opens
#    its drawer. If the person meanwhile tapped 🏠 Home (or another tab, or the page's ‹), the drawer still popped up later
#    over that screen (seen at the start, on a big company and after a network drop). A tap on the bar after the ask cancels it.
once("""W._gcOpenLead = function(id, sec){ WANT = { id: s(id), sec: s(sec), at: Date.now(), refreshed: true }; return tickWant(); };""",
HOOK + """W._gcOpenLead = function(id, sec){ WANT = { id: s(id), sec: s(sec), at: Date.now(), refreshed: true }; return tickWant(); };""")
once("""  if (!WANT || !signedIn()) return false;""",
"""  if (!WANT || !signedIn()) return false;
  if (WANT.at && (+W.__gcTabTapAt || 0) > WANT.at) { WANT = null; clearHash(); return false; }   /* patch FIELDTAPS: the person went elsewhere — the lead does not pop up later */""")

open(p, 'w', encoding='utf-8').write(t)
print('FIELDTAPS: patched')
