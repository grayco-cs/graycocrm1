#!/usr/bin/env python3
"""Idempotent patch OFFICEFIX: every button on the office's screens works for the office (office@ — Brittany).

  Owner 11/01: "i need to make sure the office page every button works — she logs in and everything doesn't work
  correctly." Production (the office's computer, r17b): POST auto-wins 403 x88 in 8 minutes on 📋 Approvals, GET referral
  403. Both are SCHEDULED functions, and a scheduled function cannot be called by its URL in production: Netlify itself
  answered 403, for the owner too. The server side (netlify/functions, plain edits) moves those schedules to
  auto-wins-scheduled.js / referral-scheduled.js; this file is the page side:

  1. 📋 Approvals "opened today" stamp (patch SUBPHOTOS stamp()): every render of the Approvals tab ticks it; a failed
     stamp set lastStamp = 0, so the next tick posted again — a request loop (88 in 8 minutes). Now: one stamp at a time;
     refused (401 / 403 / 404 / 405) → no more stamps this session; any other failure → again in 2 minutes, never on
     every tick.
  2. "Who checked Approvals today" (window._gcApprovalsCheckedToday, the Office tab card): one call a minute at most
     (shared while it runs); refused → said once, plainly, and not asked again this session.
  3. The lead-alert settings readers (claims / alerts / mitigation / emergencies) asked bid-inbox?list=1 once from page
     load — on the sign-in screen, with no sign-in (401), and never again. Now they wait for the sign-in.
  4. "💳 Import card statement" / "🏦 Import bank statement" / "📥 Needs a job", the receipts chip and the "waiting on a
     reply" chip stayed on top of every page after the To-Do list (their loops only ran while To-Do was on screen).

Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_OFFICEFIX.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_OFFICEFIX__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

# ── 1. the Approvals stamp: no retry loop ─────────────────────────────────────────────────────────────────────────
once("var lastStamp = 0;\n"
     "function stamp(){ var now = Date.now(); if (D.hidden || !me() || now - lastStamp < 10 * 60e3) return; lastStamp = now; post('auto-wins', { action: 'appr-seen' }).then(function(j){ if (!j || !j.ok) lastStamp = 0; }); }",
     "/* __GC_PATCH_OFFICEFIX__ — patch OFFICEFIX: one stamp at a time; refused → stop for this session; failed → again in 2 min.\n"
     "   Before, a failed stamp set lastStamp = 0 and every render of the tab posted again (88 posts in 8 minutes). */\n"
     "var lastStamp = 0, stampBusy = false, stampOff = false;\n"
     "function stamp(){\n"
     "  var now = Date.now(); if (stampOff || stampBusy || D.hidden || !me() || now - lastStamp < 10 * 60e3) return;\n"
     "  lastStamp = now; stampBusy = true;\n"
     "  post('auto-wins', { action: 'appr-seen' }).then(function(j){\n"
     "    stampBusy = false; var st = j && j.__status;\n"
     "    if (j && j.ok) return;\n"
     "    if (st === 401 || st === 403 || st === 404 || st === 405) { stampOff = true; try { console.warn('[GC] OFFICEFIX: the Approvals \"opened today\" stamp was refused (' + st + ') — not asked again this session.'); } catch (e) {} return; }\n"
     "    if (st === 200) return;   /* answered (not stamped): the next one in 10 minutes */\n"
     "    lastStamp = now - 8 * 60e3;   /* offline / server hiccup: again in 2 minutes */\n"
     "  }, function(){ stampBusy = false; lastStamp = now - 8 * 60e3; });\n"
     "}",
     'stamp')
once("W._gcApprovalStamp = function(){ lastStamp = 0; stamp(); };",
     "W._gcApprovalStamp = function(){ if (!stampBusy) lastStamp = 0; stamp(); };",
     'stamp-now')

# ── 2. who checked Approvals today: cached a minute, refused said once ───────────────────────────────────────────────
once("W._gcApprovalsCheckedToday = function(){\n"
     "  return post('auto-wins', { action: 'appr-seen-list' }).then(function(j){\n"
     "    if (!j || !j.ok) return [];",
     "/* patch OFFICEFIX: one call a minute at most (shared while it runs); refused → [] for this session, said once */\n"
     "var APC = { at: 0, p: null, v: null, off: false };\n"
     "W._gcApprovalsCheckedToday = function(){\n"
     "  if (APC.off) return Promise.resolve([]);\n"
     "  if (APC.p) return APC.p;\n"
     "  if (APC.v && Date.now() - APC.at < 60e3) return Promise.resolve(APC.v);\n"
     "  return (APC.p = post('auto-wins', { action: 'appr-seen-list' }).then(function(j){\n"
     "    APC.p = null; APC.at = Date.now();\n"
     "    if (j && (j.__status === 401 || j.__status === 403)) { APC.off = true; try { console.warn('[GC] OFFICEFIX: \"who checked Approvals today\" is for the office and the admins (' + j.__status + ').'); } catch (e) {} }\n"
     "    if (!j || !j.ok) return (APC.v = []);",
     'checked-today')
once("    return arr(j.rows).map(function(r){ return { name: s(r.name), email: low(r.email), waiting: +r.waiting || 0, lastSeen: s(r.lastSeen), checkedToday: !!r.checkedToday }; });\n"
     "  });\n"
     "};",
     "    return (APC.v = arr(j.rows).map(function(r){ return { name: s(r.name), email: low(r.email), waiting: +r.waiting || 0, lastSeen: s(r.lastSeen), checkedToday: !!r.checkedToday }; }));\n"
     "  }, function(){ APC.p = null; APC.at = Date.now(); return (APC.v = []); }));\n"
     "};",
     'checked-today-end')

# ── 3. the lead-alert settings readers (claims / alerts / mitigation / emergencies): not before the sign-in ─────────────
# Each asked bid-inbox?list=1 once, on a timer from page load — on the sign-in screen that went out without a sign-in
# (401) and the one ask was spent. Now each waits until someone is signed in.
SIGNED = "if (!(W.__GC_AUTH__ && typeof W.__GC_AUTH__.email === 'function' && W.__GC_AUTH__.email())) return;   /* patch OFFICEFIX: not before the sign-in (it was a 401) */ "
once("  if (asked || claimsTo()) return; asked = true;\n  try { W.fetch('/.netlify/functions/bid-inbox?list=1'",
     "  if (asked || claimsTo()) return; " + SIGNED + "asked = true;\n  try { W.fetch('/.netlify/functions/bid-inbox?list=1'", 'claims-load')
for key in ('alertTo', 'mitigationTo', 'emergenciesTo'):
    old = "  if (asked) return; var k0 = cache(); if (k0.settings && Array.isArray(k0.settings." + key + ")) return; asked = true;"
    once(old, old.replace(" asked = true;", " " + SIGNED + "asked = true;"), key + '-load')

# ── 4. To-Do buttons that stayed on every page (owner 11/01: "shouldn't be on every page") ───────────────────────────
# "💳 Import card statement" / "🏦 Import bank statement" / "📥 Needs a job" (#gc-money-needs), the receipts chip (#gc-mm)
# and the "e-mail waiting on a reply" chip (#gc-sl-todo) sit beside the To-Do list, outside it. Their loops only repainted
# while the To-Do list was on screen, so after leaving To-Do nothing took them away: they stayed on top of every page.
# Now the loops run on every page; each paint already removes its host when the To-Do list is gone.
once("  if (!mount || !moneyPerson()) { if (host) host.remove(); return; }\n  var n = needs().length;",
     "  if (!mount || !moneyPerson()) { if (host) { host.remove(); lastSig = ''; } return; }   /* patch OFFICEFIX: gone with the To-Do list; drawn again on return */\n  var n = needs().length;",
     'money-needs-remove')
once("  try { if (!D.hidden && D.getElementById('_todoMount')) paint(); } catch (e) {}",
     "  try { if (!D.hidden) paint(); } catch (e) {}   /* patch OFFICEFIX: also off To-Do, so the buttons leave with it */",
     'money-needs-tick')
once("    else if (on) paintMM();",
     "    else paintMM();   /* patch OFFICEFIX: also off To-Do, so the receipts chip leaves with it */",
     'gc-mm-loop')
once("  var on = D.getElementById('_todoMount') || D.getElementById('gc-om-page');\n  if (!on) return;",
     "  var on = D.getElementById('_todoMount') || D.getElementById('gc-om-page');\n  if (!on) { try { todoChip(); } catch (e) {} return; }   /* patch OFFICEFIX: the To-Do chip leaves with the To-Do list */",
     'gc-sl-loop')

open(path, 'w', encoding='utf-8').write(src)
print('patched OFFICEFIX')
