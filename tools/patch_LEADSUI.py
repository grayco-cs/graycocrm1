#!/usr/bin/env python3
"""patch LEADSUI — the Leads screen rebuilt, organized (owner 10/28: "very new, needs to be more organized and easy to use,
refined"; approved layout, "build it"; then: keep Board · List · Calendar · Map · Outreach at the top, List first; search by
distance too).

  · header: Leads · one search · 🗂 Board · 📋 List · 📅 Calendar · 🗺 Map · 🛰 Outreach (List is where Leads opens) · ⋯ More · ＋ New lead
  · chips: All · Bids · Residential · Insurance · Unassigned · Due this week · 📍 Within 25/50/100/200 mi (from the office —
    the company address setting — or from my location) · ✕ Clear. Nothing is remembered: every visit and reload opens on All.
  · three count boxes: Needs assigning · Due in 7 days · Not contacted (each toggles its filter)
  · one list (the LEADCOLS code): Lead | Due | Priority | Bid to | Stage | Assigned | Distance | 🗑 — soonest due, then
    priority; every header sorts; overdue red, ≤ 3 days amber, "time not stated" for a date only; priority chip → 1–10;
    Assigned leaves room for LEADHOLD's "⏳ Suggested: X — assigns at 5:00 PM"; 🗑 (admin / office / estimators) asks, then
    the CRM's lead delete (tombstone: gone on every computer) with Undo; 60 rows, then "Show more"; phone: one card per lead
  · ⋯ More: Lead Inbox cards · Website & lead forms · Imported · Archived · lost / closed · Expired · More filters ·
    Clean up · Duplicates · Lead settings · Insurance claims go to… · Old Bid Board (read-only) · old table
  · the lead panel: Status (stage · priority · assigned · won / lost) → ⏰ Bid (due + where it came from · bid to · distance ·
    plans) → 🏢 Bidding to (BIDSEND) → Contact → Notes & activity → "More on this lead" (details, sub bid portal, estimate & job)
  · a change shows at once (the changed lead is drawn from its new copy until the saved list carries it) and is saved as before
  · speed: drawn from one model per (lead list, filters, distances); the 1.5 s tick redraws nothing while nothing changed
  · Outreach keeps the header and the view buttons on screen (it used to hide the whole Leads header — no way back)
  · the old manual Bid Board is gone from the screen (its tab is now 📥 Lead Inbox); its open bids (Open / Bidding /
    Submitted) become bid leads once (id LBB_<bid>, a deleted one stays deleted, the same name + address is not added
    twice); the rest stays in bidLists, shown read-only under ⋯ More → Old Bid Board
  · patch LDEL: estimators may delete (and Undo) leads too (from LEADCOLS)
JS: tools/leadsui_hub.js, placed inside the Leads hub (gc-patch-leads) before bodyHtml().
Idempotent; every find-string must be found exactly once. Usage: python3 tools/patch_LEADSUI.py [index.html]
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '/* ═══ patch LEADSUI'
if MARK in src:
    print('LEADSUI: already patched'); sys.exit(0)
assert '/* patch LEADSTICK' in src, 'LEADSUI needs patch LEADSTICK first'
assert '/* patch LEADCOLS v1 */' not in src, 'LEADSUI replaces LEADCOLS (the same list block) — apply it to a build without LEADCOLS'

def one(old, new):
    global src
    n = src.count(old)
    assert n == 1, ('LEADSUI anchor count %d != 1' % n, old[:90])
    src = src.replace(old, new)

def between(a, b, new):
    """replace from the start of a through the end of b (both found once, b after a, close together)"""
    global src
    assert src.count(a) == 1, ('LEADSUI range start count', src.count(a), a[:80])
    i = src.index(a); j = src.index(b, i); assert src.count(b, i, j + len(b)) == 1 and j - i < 6000, ('LEADSUI range', a[:60])
    src = src[:i] + new + src[j + len(b):]

JS = open(os.path.join(here, 'leadsui_hub.js'), encoding='utf-8').read().rstrip('\n')
assert JS.startswith(MARK) and '</script>' not in JS

# ── 1. the hub: its own functions renamed, the new ones (leadsui_hub.js) take their names ──
one("function rawLeads(){ if (view() === 'leads') pullLeads();", "function rawLeads0(){ if (view() === 'leads') pullLeads();")
one("    if (i < 0) { var shown = rawLeads().filter(function(x){ return x && x.id === id; })[0];", "    if (i < 0) { var shown = rawLeads0().filter(function(x){ return x && x.id === id; })[0];")
one("function patchLead(id, fn2){\n  return setLeads(function(list){\n    var i = -1; list.forEach(function(l, k){ if (l && l.id === id) i = k; });\n", "function patchLead0(id, fn2){\n  return setLeads(function(list){\n    var i = -1; list.forEach(function(l, k){ if (l && l.id === id) i = k; });\n")
one("function hubHtml(){\n  var ks = kpis();", "function hubHtml0(){\n  var ks = kpis();")
one("function drawerHtml(l){\n  var it = inboxOf(l) || {}, pl = plansOf(l)", "function drawerHtml0(l){\n  var it = inboxOf(l) || {}, pl = plansOf(l)")
one("function bodyHtml(){\n", JS + "\n/* ═══ end LEADSUI block ═══ */\nfunction bodyHtml(){\n")

one("function isBidL(l){ try { if (typeof W._gcIsBidLead === 'function') return !!W._gcIsBidLead(l); } catch (e) {} return /commercial|government/.test(typeOf(l)); }",
    "function isBidL(l){ var k = s(l && l.id) + '|' + s(l && (l.updatedAt || l.savedAt)) + '|' + s(l && l.leadKind) + '|' + s(l && l.type) + '|' + s(l && l.source); var v = ISB_M[k]; if (v !== undefined) return v; if (++ISB_N > 6000) { ISB_M = {}; ISB_N = 0; } return (ISB_M[k] = isBidL0(l)); }   /* patch LEADSUI: remembered per lead version */\nvar ISB_M = {}, ISB_N = 0;\nfunction isBidL0(l){ try { if (typeof W._gcIsBidLead === 'function') return !!W._gcIsBidLead(l); } catch (e) {} return /commercial|government/.test(typeOf(l)); }")

# ── 2. nothing remembered: every visit opens on List, All ──
between("function loadUI(){\n", "var UI = loadUI();",
"""function loadUI(){   /* patch LEADSUI: every visit (and reload) opens on 📋 List and All — no filter, sort or view is remembered */
  return { _k: uiKey(), v: 'list', who: '', src: '', type: '', stage: '', due: '', un: false, q: '', sort: 'born', dir: -1, open: '', cal: '', classic: false, closed: false, preset: 'all', exp: false, prio: '', role: '',
    k: '', wk: false, d7: false, nc: false, mi: 0, lsort: amEstimator() ? 'born' : 'due', ldir: amEstimator() ? -1 : 1, imp: false, arch: false };   /* an estimator: newest bid first (HOT2), any header re-sorts */
}
var UI = loadUI();""")
between("function saveUI(){ lsSet(UI._k || uiKey(),", "/* patch PRIMESUB: role */",
        "function saveUI(){ /* patch LEADSUI: nothing is remembered between visits */ }")

# ── 3. the chips / count boxes / distance in the one filter ──
one("    if (UI.preset === 'bids' && !isBidL(l)) return false;   /* patch HOT2: 📐 Bids */",
    "    if (UI.preset === 'bids' && !isBidL(l)) return false;   /* patch HOT2: 📐 Bids */\n    if (!chipPass(l, now)) return false;   /* patch LEADSUI */")

# ── 4. the list view, the map's miles, outreach ──
one("  var list = filtered();\n  if (UI.v === 'board') {", "  if (UI.v === 'outreach') return '';   /* patch LEADSUI */\n  if (UI.v === 'list') return uiListHtml();   /* patch LEADSUI */\n  var list = filtered();\n  if (UI.v === 'board') {")
one("    var withAddr = list.filter(function(l){ return s(l.address || l.city); });",
    "    var withAddr = list.filter(function(l){ return s(l.address || l.city); });\n    if (UI.lsort === 'dist') withAddr.sort(function(a, b){ var x = distOf(a), y = distOf(b); return (x == null ? 9e9 : x) - (y == null ? 9e9 : y); });   /* patch LEADSUI */")
one("'</span> ' + dueChip(l) + '</li>'; }).join('')",
    "'</span> ' + (distOf(l) != null ? '<span class=\"gclu-mi\">📍 ' + miTxt(distOf(l)) + '</span> ' : '') + dueChip(l) + '</li>'; }).join('')")

# ── 5. mount: the model's version, not a clock; Leads opens on its own tab; Outreach keeps the header ──
one("""  if (view() !== 'leads') { var old = D.getElementById('gc-leads-hub'); if (old) old.remove(); D.body.classList.remove('gcl-noclassic'); if (D.getElementById('gcl-settings')) closeSettings(); return; }
  syncUI();""",
"""  if (view() !== 'leads') { LU.inLeads = false; var old = D.getElementById('gc-leads-hub'); if (old) old.remove(); D.body.classList.remove('gcl-noclassic'); if (D.getElementById('gcl-settings')) closeSettings(); return; }
  if (!LU.inLeads) {   /* patch LEADSUI: a visit to Leads opens on the Leads screen itself, List, All */
    var tb0 = D.getElementById('gc-leads-tabs');
    if (tb0 && tb0.getAttribute('data-tab') !== 'leads') { var lb = tb0.querySelector('[data-gc-tab="leads"]'); if (lb) { try { lb.click(); } catch (e) {} } return; }
    LU.inLeads = true; UI = loadUI(); MORE = {}; LU.more = false; LU.adv = false; HUB_SIG = '';
    try { if (rsoOn()) W._gcRSO.close(); } catch (e) {}
  }
  syncUI();""")
one("  var a = anchor(); if (!a || !a.parentElement) return;\n  css();\n", "  var a = anchor(); if (!a || !a.parentElement) return;\n  css(); css2();\n")
between("  var LL = leads(), mx = '';   /* patch LEADPERF-2: one pass */", "  if (sig === HUB_SIG) return;",
"""  if (UI.v === 'outreach' && !rsoOn()) UI.v = 'list';   /* patch LEADSUI: Outreach's own "Back to Leads" */
  var sig = [refId(rawLeads()), OVL_V, JSON.stringify(UI), JSON.stringify(MORE), Object.keys(PICK).filter(function(k){ return PICK[k]; }).length, myScope().kind, myScope().why, GEO.ver, GEO.from, Object.keys(LC_GONE).length, LU.more, LU.adv, rsoOk(), Math.floor(Date.now() / 6e5)].join('|');   /* patch LEADSUI: the model's version — nothing changed, nothing drawn */
  if (sig === HUB_SIG) return;""")
one("function tick(){ try { if (D.hidden) return; css(); mount(); navBadge();",
    "function tick(){ try { if (D.hidden) return; css(); mount(); luTick(); navBadge();")
one("function redraw(){ HUB_SIG = ''; FORCE = true; mount(); FORCE = false; }",
"""function redraw(){ HUB_SIG = ''; FORCE = true; mount(); FORCE = false; }
/* patch LEADSUI: the Leads screen's light housekeeping (no drawing): Outreach under the header, distances, the old Bid Board */
function luTick(){
  if (view() !== 'leads') return;
  var hub = D.getElementById('gc-leads-hub'); if (!hub) return;
  var rp = D.getElementById('gc-rso'); if (rp && rp.parentNode === hub.parentNode && hub.nextElementSibling !== rp) hub.parentNode.insertBefore(rp, hub.nextSibling);
  try { var rows = modelRows().slice(0, lim('ulist', LC_PAGE)).map(function(x){ return x.l; }); rows = rows.concat(UI.mi || UI.lsort === 'dist' || UI.v === 'map' ? scoped() : model().list); geoPump(rows);   /* the rows on screen first, then the rest, 20 at a time */ } catch (e) { warn(e); }
  try { bbMigrate(); } catch (e) { warn(e); }
}""")

# ── 6. Outreach no longer hides the whole hub (only its body: the header and view buttons stay) ──
one("st.textContent = 'body.gcrso-on #gc-leads-hub{display:none!important}' +",
    "st.textContent = 'body.gcrso-on #gc-leads-hub .gcl-hide-rso{display:none!important}' +   /* patch LEADSUI */")

# ── 7. the old manual Bid Board leaves the screen; its tab is the Lead Inbox ──
one('{id:"bidboard",l:"Bids ("+st.length+")"}', '{id:"bidboard",l:"📥 Lead Inbox"}')
one('g==="bidboard"&&e.jsxs("div",{children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14},children:[e.jsxs("div",{children:[e.jsx("h1",{style:{fontSize:18,fontWeight:700,margin:0},children:"Bid Board"})',
    'g==="bidboard"&&window.__GC_OLD_BIDBOARD__&&e.jsxs("div",{children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14},children:[e.jsxs("div",{children:[e.jsx("h1",{style:{fontSize:18,fontWeight:700,margin:0},children:"Bid Board"})')

# ── 7b. the help page for the Leads screen ──
one('{"id": "the-leads-screen", "title": "The Leads screen", "body": "- Views: **🗂 Board**, **📋 List**, **📅 Calendar**, **🗺 Map**, **🛰 Outreach**. The List shows 100 rows at a time and loads more as you scroll; each Board column shows 30 cards with \\"Show more\\".\\n- Stages: 🆕 New Lead → 📞 Contacted → 📍 Site Visit → 📐 Estimate Sent → 🤝 Negotiating → 🏆 Won, or ✖ Lost.\\n- The tiles along the top: Unassigned, Needs priority, New today, Bids due in 7 days, Not contacted > 4h, Win rate, Open pipeline.\\n- Filters: everyone or **Mine**, **📐 My bids (estimator)**, source (Website, Google, BuildingConnected, PlanHub, RoofScout, QuickBooks (imported) and others) and type (Roofing, Restoration – Water, Fire and so on).\\n- Every bid shows a **Bid due** chip: red within 24 hours, amber within 3 days, \\"Add due date\\" when missing. Click the chip to set the date and time.\\n- **＋ New lead** adds one by hand. A bid needs its due date and time and the \\"due to\\" company, unless you choose **Unknown yet**.\\n- **🚀 Convert to job** on a won lead makes the job."}',
    '{"id": "the-leads-screen", "title": "The Leads screen", "body": "- Leads opens on **📋 List** with **All** leads. On top: one search box, the views **🗂 Board**, **📋 List**, **📅 Calendar**, **🗺 Map**, **🛰 Outreach**, **⋯ More** and **＋ New lead**.\\n- Chips: **All**, **📐 Bids**, **🏠 Residential**, **🛡 Insurance**, **👤 Unassigned**, **⏰ Due this week**, **📍 Within 25 / 50 / 100 / 200 mi** (from the office, or **from my location**). Tap a chip to narrow the list, tap it again to clear it; **✕ Clear** clears everything. Nothing is remembered: every visit starts on All.\\n- Three boxes count what needs you: **Needs assigning**, **Due in 7 days**, **Not contacted**. Tap one to see those leads.\\n- The list: Lead (name and address), Due (red overdue, amber within 3 days, \\"time not stated\\" when only a date is known), Priority (tap to set 1–10), Bid to (the GC or the owner; \\"3 GCs\\" when several), Stage, Assigned, Distance and 🗑. Soonest due first, then priority; tap a header to sort. 60 rows, then **Show more**.\\n- Click a lead: Status (stage, priority, assigned, Won / Lost), Bid (due date and where it came from, bid to, plans), 🏢 Bidding to, Contact, Notes & activity; the rest under **More on this lead**.\\n- **⋯ More**: the Lead Inbox cards, Website & lead forms, Imported, Archived, lost / closed, expired bids, more filters, Clean up, Duplicates, Lead settings, Insurance claims, and the old Bid Board (read-only: its open bids are now bid leads).\\n- **🚀 Convert to job** on a won lead makes the job."}')

# ── 8. patch LDEL: estimators delete leads too (LEADCOLS) ──
one("  var pm = !admin && !office && /project\\s*manager|^pm$/i.test(role);\n",
    "  var pm = !admin && !office && /project\\s*manager|^pm$/i.test(role);\n"
    "  var est = !admin && !office && /estimat/i.test(role + ' ' + s(u.profile));   /* patch LEADSUI (LEADCOLS): estimators delete leads too */\n")
one("  return { email: email, name: s(u.name), admin: admin, office: office, pm: pm, all: admin || office };\n",
    "  return { email: email, name: s(u.name), admin: admin, office: office, pm: pm, est: est, all: admin || office };\n")
one("function can(l, me){ me = me || who(); if (!me.email) return false; if (me.all) return true; return me.pm && mine(l, me); }",
    "function can(l, me){ me = me || who(); if (!me.email) return false; if (me.all || me.est) return true; return me.pm && mine(l, me); }")
one("    if (!(me.all || (me.pm && mine(e.rec, me)))) return;\n",
    "    if (!(me.all || me.est || (me.pm && mine(e.rec, me)))) return;\n")

open(path, 'w', encoding='utf-8').write(src)
print('LEADSUI: patched')
