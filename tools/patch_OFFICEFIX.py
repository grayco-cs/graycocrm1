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
  5. 📋 Approvals: an approve the server refused or could not send hid its card as if it went out; now the card stays.
  6. PM / estimator dropdowns: the workload hint ("— 1 job · 17 leads · $42k") was saved as the PM's name; not now.
  7. To-Do: the 🧹 Nightly data check is under ⚙️ Setup & admin instead of 💵 Money.
  8. 🧰 Job tools: ⚖️ Liens & waivers / ✍️ Unsigned COs (and the estimate buttons) also opened the 🎬 reel kit page.
  9. "+ New Invoice": the PO / project dropdown did not open in the box that already had the cursor.
 10. ⚙ Admin → 👤 Employees: Role "Marketing Manager" (Marketing-only menu), a line + button to give him a sign-in in
     💎 Team access (whose Add form now offers the Marketing Manager profile). A personal e-mail is accepted.

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

# ── 5. 📋 Approvals: a refused / failed approve keeps its card (office day 11/01) ───────────────────────────────────
# approveQueue() showed the server's answer in a toast but resolved with nothing, so the card's finish() counted it as
# done and hid the card: an approve the server refused or could not send ("E-mail is not set up", a send error) looked
# like it went out — the item was still waiting. Now the server's answer is passed on: the card stays, marked failed.
once("    paintSoon();\n  }, function(){ delete busy[id]; toast('⚠ Try again.'); paintSoon(); });\n}",
     "    paintSoon();\n    return j;   /* patch OFFICEFIX: finish() sees ok:false — the card stays */\n  }, function(){ delete busy[id]; toast('⚠ Try again.'); paintSoon(); return false; });\n}",
     'approve-result')
once("if (!busy[id]) call('_gcAp2Preview', id); return; }",
     "if (!busy[id]) call('_gcAp2Preview', id); return false; }   /* patch OFFICEFIX: nothing approved yet — keep the card */",
     'approve-early')

# ── 6. PM / estimator dropdowns: the workload hint is never saved as the name (office day 11/01) ─────────────────────
# The 2.5 s annotate() adds "— 1 job · 17 leads · $42k" to each PM option's TEXT. The options have no value attribute,
# so their value became that text, and a lead / job saved after the hint appeared got pm "Nick Thomas — 1 job · …"
# (production already has 3 jobs with "Glenn Miller — 0 jobs · 16 leads · $0"). Now the value is pinned to the name
# first. (Re-pick the PM on jobs already saved that way.)
once("      if (o.text !== txt) { o.setAttribute('data-gcwl', nm); o.text = txt; }",
     "      if (o.text !== txt) { if (!o.hasAttribute('value')) o.setAttribute('value', nm); o.setAttribute('data-gcwl', nm); o.text = txt; }   /* patch OFFICEFIX: the value stays the name */",
     'pm-option-value')

# ── 7. To-Do: the 🧹 Nightly data check is filed under ⚙️ Setup & admin, not 💵 Money (office day 11/01) ─────────────
# "data check" matched the money words (\bchecks?\b), so the nightly item sat under 💵 Money, behind "Show all".
once("  if (t.kind === 'admin_seed') return 'setup';\n  if (/invoice|payment|\\bpaid\\b|check run|\\bchecks?\\b|supplier bill|collect|a\\/r\\b/i.test(L)) return 'money';",
     "  if (t.kind === 'admin_seed') return 'setup';\n  if (t.kind === 'datacheck') return 'setup';   /* patch OFFICEFIX: not money */\n  if (/invoice|payment|\\bpaid\\b|check run|\\bchecks?\\b|supplier bill|collect|a\\/r\\b/i.test(L)) return 'money';",
     'datacheck-cat')

# ── 8. 🧰 Job tools: ⚖️ Liens & waivers / ✍️ Unsigned COs no longer open the 🎬 reel kit too (office day 11/01) ──────
# The 🗞 Flyer / 🎬 Video click handler answered ANY [data-mkt2] element, and the other Job tools buttons (liens, unsigned
# COs, the estimate buttons) sit in <span data-mkt2="…"> holders — so each of them also opened "🎬 Before/after reel kit"
# as a full page behind its own window; after closing the window the office was left on the reel page.
once("  var b = ev.target.closest && ev.target.closest('[data-mkt2]'); if (!b) return;",
     "  var b = ev.target.closest && ev.target.closest('[data-mkt2=\"flyer\"],[data-mkt2=\"video\"]'); if (!b) return;   /* patch OFFICEFIX: only 🗞 Flyer and 🎬 Video */",
     'mkt2-only-flyer-video')

# ── 9. The PO / project / customer dropdown shows in the box that already has the cursor (office day 11/01) ───────────
# "+ New Invoice" opens with the cursor in "PO # (auto from project)". The dropdown scan skipped the box with the cursor
# (from when it used to MOVE the box — it does not any more), so typing there showed no list until she clicked away and
# back. Now the box with the cursor gets its dropdown too, and the scan also runs when a box gets the cursor.
once("    if(inp===live)return;\n    if(inp._acInit||inp.type===\"date\"",
     "    /* patch OFFICEFIX: the box with the cursor too — createAC never moves it now */\n    if(inp._acInit||inp.type===\"date\"",
     'ac-live')
once("document.addEventListener(\"focusout\",function(){setTimeout(scanInputs,200)},true);",
     "document.addEventListener(\"focusout\",function(){setTimeout(scanInputs,200)},true);\ndocument.addEventListener(\"focusin\",function(ev){var t=ev.target;if(t&&t.tagName===\"INPUT\"&&!t._acInit)setTimeout(scanInputs,0)},true);   /* patch OFFICEFIX */",
     'ac-focusin')

# ── 10. ⚙ Admin → 👤 Employees: Role "Marketing Manager" (owner 11/01: adding Malcolm Lane, a personal e-mail) ────────
# The Employees role list (the bundled zx / Ux) had no "Marketing Manager", so he could not be entered. Now it is there
# with the Marketing-only menu (the Marketing Manager profile's own tabs come from patch MM on top). The employee record
# never makes a sign-in: a line under the Role box says so, and its button opens 💎 → Team access filled in — whose Add
# form now offers the profile "Marketing Manager" too (staff-admin add: never active staff, mkt_active on).
once('zx=["Admin","Project Manager","Estimator","Insurance","Mitigation","Superintendent","Office Manager","Field Supervisor","Crew Lead"],Ux={Admin:[',
     'zx=["Admin","Project Manager","Estimator","Insurance","Mitigation","Superintendent","Office Manager","Field Supervisor","Crew Lead","Marketing Manager"],Ux={"Marketing Manager":["marketing","myprofile"],Admin:[',
     'employees-roles')
once('<option value="field">Profile: Field</option></select>\'',
     '<option value="field">Profile: Field</option><option value="marketing">Profile: Marketing Manager (marketing only)</option></select>\'',
     'team-access-marketing')
MM_JS = '<script id="gc-patch-officefix-mm">\n/* patch OFFICEFIX (11/01): ⚙ Admin → 👤 Employees → Role "Marketing Manager". The role is on the list now (menu: 📣 Marketing\n   only — the same as the Marketing Manager profile). The employee record does not give a sign-in: the line under the Role\n   box says so and its button opens 💎 → Team access filled in (name, e-mail, profile "Marketing Manager") — pressing Add\n   there makes the sign-in and shows the temporary password once. A personal e-mail (not @grayco-cs.com) is fine. */\n(function(){\n\'use strict\';\nvar W = window, D = document; if (W.__GC_OFX_MM__) return; W.__GC_OFX_MM__ = 1;\nvar SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;\nfunction t(e){ return ((e && (e.innerText || e.textContent)) || \'\').trim(); }\nfunction isRoleBox(sel){ return !!sel && sel.tagName === \'SELECT\' && [].some.call(sel.options, function(o){ return o.text === \'Crew Lead\'; }) && [].some.call(sel.options, function(o){ return o.text === \'Marketing Manager\'; }); }\nfunction formRoot(sel){ var r = sel; for (var i = 0; i < 14 && r; i++) { r = r.parentElement; if (r && [].some.call(r.querySelectorAll(\'button\'), function(b){ return /^(Create Employee|Save Changes)$/.test(t(b)); })) return r; } return null; }\nfunction field(root, label){\n  if (!root) return null;\n  var l = [].filter.call(root.querySelectorAll(\'label, div, span, b\'), function(e){ return e.children.length === 0 && t(e) === label; })[0]; if (!l) return null;\n  var p = l.parentElement; for (var i = 0; i < 3 && p; i++) { var inp = p.querySelector(\'input\'); if (inp) return inp; p = p.parentElement; } return null;\n}\nfunction openTeam(name, email){\n  if (typeof W._gcTeamAccess !== \'function\') return false;\n  W._gcTeamAccess(); var n = 0;\n  (function fill(){\n    var e = D.getElementById(\'gcTaEmail\'), nm = D.getElementById(\'gcTaName\'), pr = D.getElementById(\'gcTaProfile\'), rl = D.getElementById(\'gcTaRole\');\n    if (!e) { if (++n < 50) ST.call(W, fill, 100); return; }\n    if (email) e.value = String(email).trim().toLowerCase(); if (nm && name) nm.value = name; if (rl) rl.value = \'staff\';\n    if (pr && [].some.call(pr.options, function(o){ return o.value === \'marketing\'; })) pr.value = \'marketing\';\n    try { (email ? D.getElementById(\'gcTaAdd\') : e).focus(); } catch (x) {}\n  })();\n  return true;\n}\nW._gcMMTeamAccess = openTeam;\nfunction paint(){\n  [].forEach.call(D.querySelectorAll(\'select\'), function(sel){\n    if (!isRoleBox(sel)) return;\n    var on = sel.value === \'Marketing Manager\', note = sel.parentElement && sel.parentElement.querySelector(\'[data-ofx-mm]\');\n    if (!on) { if (note) note.remove(); return; }\n    if (note) return;\n    note = D.createElement(\'div\'); note.setAttribute(\'data-ofx-mm\', \'1\'); note.setAttribute(\'data-gc-keep\', \'1\');\n    note.style.cssText = \'margin:6px 0 2px;padding:8px 10px;border:1px solid #c7d2fe;background:#eef2ff;color:#1e1b4b;border-radius:8px;font-size:12px;line-height:1.4\';\n    note.innerHTML = \'📣 <b>Marketing Manager</b>: his menu is 📣 Marketing only. A personal e-mail is fine. \'\n      + \'<b>Also add him in 💎 → Team access with the Marketing Manager profile to give him a sign-in.</b> \'\n      + \'<button type="button" data-ofx-mm-open style="margin-top:6px;display:block;border:1px solid #4338ca;background:#4338ca;color:#fff;border-radius:6px;padding:6px 10px;font-weight:700;cursor:pointer">🔐 Open Team access (filled in)</button>\';\n    sel.insertAdjacentElement(\'afterend\', note);\n  });\n}\nD.addEventListener(\'change\', function(ev){ if (isRoleBox(ev.target)) ST.call(W, paint, 0); }, true);\nD.addEventListener(\'click\', function(ev){\n  var b = ev.target && ev.target.closest && ev.target.closest(\'[data-ofx-mm-open]\'); if (!b) return;\n  ev.preventDefault(); ev.stopPropagation();\n  var sel = b.closest(\'[data-ofx-mm]\').previousElementSibling, root = formRoot(sel || b);\n  var n = field(root, \'Full Name\'), e = field(root, \'Email\');\n  if (!openTeam(n && n.value, e && e.value)) alert(\'Open 💎 → Team access and add him with the profile "Marketing Manager".\');\n}, true);\nSI.call(W, function(){ try { paint(); } catch (e) {} }, 800);\n})();\n</script>\n'
once("try { console.log('[GC] 📬 Collections · 🛡 sub papers · ⚖️ liens & waivers · ✍️ unsigned COs (patch OFFFEAT) — _gcOffFeat.state()'); } catch (e) {}\n})();\n</script>",
     "try { console.log('[GC] 📬 Collections · 🛡 sub papers · ⚖️ liens & waivers · ✍️ unsigned COs (patch OFFFEAT) — _gcOffFeat.state()'); } catch (e) {}\n})();\n</script>\n" + MM_JS.rstrip('\n'),
     'mm-helper-script')

open(path, 'w', encoding='utf-8').write(src)
print('patched OFFICEFIX')
