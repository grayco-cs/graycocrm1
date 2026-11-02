#!/usr/bin/env python3
"""Idempotent patch ASSIGNFIX: an assigned lead's "👤 Assign this lead" card leaves Approvals and stays gone; "☐ Select
all routine" / "✅ Approve selected" count and complete the cards they show.

A. "i assigned these and they didnt go off the approvals" (Altus Construction — companycam, S.W. Eavenson Construction
   — QuickBooks, Vanderbilt mortgage and Finance — QuickBooks). Measured on the live mirror (10/30) with a desk, a
   phone, a cloud pull and reloads: the assignment itself is saved and kept everywhere (the lead's pm / estimator, on
   disk, in the cloud, on the second device). What stays is ANOTHER CARD FOR THE SAME LEAD. Every QuickBooks /
   CompanyCam sync has made the same customer again under a new id (Altus V579, Eavenson C221 and Vanderbilt D615 are
   each 3 QuickBooks rows with the same CompanyCam project), each row kept off the job board is filed as a lead
   (LQB_<row id>), and the CompanyCam lead merged with one of them still has its twin on the list. "Assign this lead"
   made one card per COPY: on the mirror Altus has two -- LEADmsgitrd827x (companycam) and LQB_QB_1787770954124_updf1
   (QuickBooks), both "nobody assigned", the same title. Assigning one card left the other: the toast said "Assigned
   to Wesley Johnson" and an identical card stayed.
   Now: copies of one lead (the same importer row, CompanyCam project or QuickBooks customer, or merged into one
   another) are ONE card -- the CompanyCam / inbox lead before an importer copy -- and a lead counts as assigned when
   any of its copies is assigned by a person. Assigning the card clears every copy's card at once; a copy filed again
   later by a sync does not bring the card back. (The save path was fine: the mirror, a stale second device editing
   leads, a cloud pull and reloads all kept the assignment.)

B. "☐ Select all routine (0)" / "✅ Approve selected (0)" (owner: "these arent working"). The bulk bar counted only cards
   that approve in place (approve.mode: expenses, sub invoices ...). The "Routine" cards on his screen are To-Do
   approvals -- "👤 Assign this lead" -- whose button opens a picker, so they were never counted and had no tick box.
   Now:
   * an "Assign this lead" card is bulk-safe (it is internal: nothing goes to a customer). It gets a tick box, and
     "Select all routine" ticks the Routine ones. "Approve selected" assigns each ticked lead to its default person
     (the person it was set to automatically, or its lead-role holder: Senior Estimator / Senior Insurance PM / Senior
     Roofing PM) and opens ONE picker for the ticked leads that have no default ("👤 Assign N leads").
     Each assigned card leaves at once, the badge drops, and the assignment is the lead's own (it survives a reload,
     a cloud pull and shows on every device).
   * anything that goes to a customer (e-mail, text, portal, proposal, invoice) stays one at a time: those are tier
     "Soon" (never "Routine"), and a ticked 'confirm' card still asks on its own card (CUSTQUIET / approval rules).
   * other To-Do approvals that only open a list ("7 invoices to review") cannot be completed from here and are not
     counted.
Usage: python3 tools/patch_ASSIGNFIX.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch ASSIGNFIX'
if MARK in t:
    print('ASSIGNFIX: already patched'); sys.exit(0)

def rep(name, old, new, count=1):
    global t
    n = t.count(old)
    assert n == count, 'ASSIGNFIX %s: expected %d, found %d' % (name, count, n)
    t = t.replace(old, new)

# ── A. one card per lead, not per copy ────────────────────────────────────────────────────────────────────
rep('hot1-group',
    "W._gcLeadsToAssign = function(){ return leads().filter(needsAssign); };",
    MARK + " A: copies of ONE lead (the same importer row, CompanyCam project or QuickBooks customer, or merged into one\n"
    "   another -- every QuickBooks sync filed the same customer again under a new id) are one card, and the lead counts as\n"
    "   assigned when any copy is. Owner: \"i assigned these and they didnt go off the approvals\" -- an identical card for\n"
    "   the other copy stayed. */\n"
    "function afKeys(l){\n"
    "  var k = ['id:' + s(l.id)];\n"
    "  if (s(l.fromProjectId)) k.push('p:' + s(l.fromProjectId));\n"
    "  if (s(l.ccamId || l.ccId)) k.push('cc:' + s(l.ccamId || l.ccId));\n"
    "  if (s(l.qbId || l.qbCustomerId)) k.push('qb:' + s(l.qbId || l.qbCustomerId));\n"
    "  var m = /^L(QB|CC)_(.+)$/.exec(s(l.id)); if (m) k.push('p:' + m[2]);\n"
    "  [].concat(arr(l._mergedFrom), arr(l.mergedFrom)).forEach(function(x){ x = s(x && typeof x === 'object' ? x.id : x); if (!x) return; k.push('id:' + x); var mm = /^L(QB|CC)_(.+)$/.exec(x); if (mm) k.push('p:' + mm[2]); });\n"
    "  return k;\n"
    "}\n"
    "function afImp(l){ return /^L(QB|CC|CCR)_/.test(s(l.id)); }\n"
    "function afGroups(list){\n"
    "  var par = {}, own = {};\n"
    "  function f(x){ while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }\n"
    "  list.forEach(function(l, i){ par[i] = i; afKeys(l).forEach(function(k){ if (own[k] == null) own[k] = i; else par[f(i)] = f(own[k]); }); });\n"
    "  var g = {}; list.forEach(function(l, i){ var r = f(i); (g[r] = g[r] || []).push(l); });\n"
    "  return Object.keys(g).map(function(r){ return g[r]; });\n"
    "}\n"
    "var AFC = { sig: '', v: [] };\n"
    "W._gcLeadsToAssign = function(){\n"
    "  var L = leads(), sig = L.length + '|' + L.map(function(l){ return s(l && l.id) + ':' + s(l && l.updatedAt) + ':' + s(l && (l.pm || l.estimator || l.apm)); }).join(',');\n"
    "  try { if (W._gcLeadHold) sig += '|h' + W._gcLeadHold.approvals().length; } catch (e) {}\n"
    "  if (AFC.sig === sig && Date.now() - AFC.at < 5000) return AFC.v.slice();\n"
    "  var out = [];\n"
    "  afGroups(L.filter(function(l){ return l && l.id && !closed(l); })).forEach(function(g){\n"
    "    if (g.some(function(l){ return s(l.pm || l.estimator || l.apm) && !needsAssign(l); })) return;   /* a copy is assigned: the lead is */\n"
    "    var c = g.filter(needsAssign); if (!c.length) return;\n"
    "    c.sort(function(a, b){ return (afImp(a) - afImp(b)) || (s(b.updatedAt) < s(a.updatedAt) ? -1 : s(b.updatedAt) > s(a.updatedAt) ? 1 : 0); });\n"
    "    out.push(c[0]);\n"
    "  });\n"
    "  AFC = { sig: sig, v: out, at: Date.now() };\n"
    "  return out.slice();\n"
    "};\n"
    "/* patch ASSIGNFIX B: the person an \"Assign this lead\" card defaults to -- the one it was set to automatically, else the\n"
    "   holder of its lead role (Senior Estimator / Senior Insurance PM / Senior Roofing PM); '' = nobody (pick one) */\n"
    "W._gcHot1Default = function(id){\n"
    "  var l = byId(id); if (!l) return '';\n"
    "  var auto = s(l.pm || l.estimator); if (auto) return auto;\n"
    "  try { var R = W._gcLeadRoles, k = R && R.classify ? R.classify(l) : '', h = k && R.holder ? R.holder(k) : null; if (h && s(h.name)) return s(h.name); } catch (e) {}\n"
    "  return '';\n"
    "};")

# ── B. bulk ────────────────────────────────────────────────────────────────────────────────────────────────
# B2. the Leads hub hands out its own assign (the one the picker uses: saves, notifies, clears the card)
rep('hub-assign',
    ", picker: openPicker, canAssign: canAssignAll,",
    ", picker: openPicker, canAssign: canAssignAll, assign: assign,   " + MARK + " B */")
# B3. Approvals: what may be ticked, what "Select all routine" ticks, what "Approve selected" does
rep('apx-helpers',
    "W.addEventListener('gc-lead-assigned', function(ev){ var d = ev && ev.detail; if (d && d.id) goneNow('td:hot1:asg:' + s(d.id)); });",
    "W.addEventListener('gc-lead-assigned', function(ev){ var d = ev && ev.detail; if (d && d.id) goneNow('td:hot1:asg:' + s(d.id)); });\n"
    + MARK + " B: the bulk bar. Tickable = approves in place (approve.mode) or an \"Assign this lead\" card (internal; I may\n"
    "   assign). Routine = tickable and tier Routine (anything that goes to a customer is tier Soon or ASAP, never here). */\n"
    "function afLid(r){ var m = /^td:hot1:asg:(.+)$/.exec(bareKey(r && r.key)); return m ? m[1] : ''; }\n"
    "function afAsg(r){ return !!(r && r.approve && afLid(r) && canAssignHere()); }\n"
    "function afTick(r){ return !!(r && r.mine && r.approve && (r.approve.mode || afAsg(r)) && !PEND[r.key] && !DONE[r.key]); }\n"
    "function afRoutine(r){ return afTick(r) && !!W._gcApprovalTier && (W._gcApprovalTier(r) || {}).t === 2; }\n"
    "function afDefault(r){ try { return typeof W._gcHot1Default === 'function' ? s(W._gcHot1Default(afLid(r))) : ''; } catch (e) { return ''; } }\n"
    "function afBulkNote(){\n"
    "  var a = 0, b = 0; Object.keys(SEL).forEach(function(k){ var r = rowByKey(k); if (r && afAsg(r)) { if (afDefault(r)) a++; else b++; } });\n"
    "  return (a ? ' <span class=\"apx-afn\" style=\"font-size:12px;color:#334155\">👤 ' + a + ' lead' + (a === 1 ? '' : 's') + ' to ' + (a === 1 ? 'its' : 'their') + ' usual person</span>' : '') + (b ? ' <span class=\"apx-afn\" style=\"font-size:12px;color:#334155\">👤 ' + b + ' lead' + (b === 1 ? '' : 's') + ': you pick who next</span>' : '');\n"
    "}\n"
    "/* the ticked \"Assign this lead\" cards: the default person through the Leads hub's own assign (one after the other), the\n"
    "   rest in ONE picker. Each assign fires gc-lead-assigned: the card leaves and the count drops at once. */\n"
    "function afBulkAssign(rows, anchor){\n"
    "  var H = W._gcLeadsHub, pick = [], go = [];\n"
    "  rows.forEach(function(r){ var lid = afLid(r), to = afDefault(r); if (to && H && typeof H.assign === 'function') go.push([lid, to]); else pick.push(lid); });\n"
    "  go.reduce(function(pr, x){ return pr.then(function(){ return Promise.resolve(H.assign(x[0], x[1])).catch(function(e){ warn(e); }); }); }, Promise.resolve())\n"
    "    .then(function(){ if (go.length > 1) toast('👤 ' + go.length + ' leads assigned to their usual person'); });\n"
    "  if (pick.length && H && typeof H.picker === 'function') later(function(){ try { H.picker(pick, anchor && anchor.isConnected ? anchor : null); } catch (e) { warn(e); } }, 0);\n"
    "}")
rep('routineN',
    "  var routineN = list.filter(function(r){ return r.mine && r.approve && r.approve.mode && !PEND[r.key] && !DONE[r.key] && W._gcApprovalTier && (W._gcApprovalTier(r) || {}).t === 2; }).length;",
    "  var routineN = list.filter(afRoutine).length;   " + MARK + " B: + the Assign this lead cards */")
rep('bulk-bar',
    "if (list.some(function(r){ return r.mine && r.approve && r.approve.mode; })) h += '<div class=\"apx-bulk\">'",
    "if (list.some(afTick)) h += '<div class=\"apx-bulk\">'   " + MARK + " B */")
rep('bulk-note',
    "? Nothing that goes to a customer is sent without its own look.</span><button type=\"button\" class=\"apx-b go\" data-apx-bulk=\"yes\">",
    "? Nothing that goes to a customer is sent without its own look.</span>' + afBulkNote() + '<button type=\"button\" class=\"apx-b go\" data-apx-bulk=\"yes\">")
rep('tickbox',
    "    + (where === 'tab' && r.mine && r.approve && r.approve.mode && !PEND[r.key] && !DONE[r.key] ? '<label class=\"apx-sel\"><input type=\"checkbox\" data-apx-sel=\"' + esc(r.key) + '\"' + (SEL[r.key] ? ' checked' : '') + '> Select</label>' : '')",
    "    + (where === 'tab' && afTick(r) ? '<label class=\"apx-sel\"><input type=\"checkbox\" data-apx-sel=\"' + esc(r.key) + '\"' + (SEL[r.key] ? ' checked' : '') + '> Select' + (afAsg(r) ? (afDefault(r) ? ' — assign to ' + esc(afDefault(r)) : ' — you pick who') : '') + '</label>' : '')   " + MARK + " B */")
rep('select-routine',
    "    if (bv === 'routine') { filtered(scope(), build().rows).forEach(function(r){ if (r.mine && r.approve && r.approve.mode && W._gcApprovalTier && (W._gcApprovalTier(r) || {}).t === 2) SEL[r.key] = 1; }); }",
    "    if (bv === 'routine') { filtered(scope(), build().rows).forEach(function(r){ if (afRoutine(r)) SEL[r.key] = 1; }); }   " + MARK + " B */")
rep('approve-selected',
    "    else if (bv === 'yes') { BULK = 0; var keys = Object.keys(SEL); SEL = {}; keys.forEach(function(k){ var r = rowByKey(k); if (!r || !r.approve || !r.approve.mode) return; if (r.approve.mode === 'confirm') { CONF[k] = 1; return; } inlineApprove(r); }); }",
    "    else if (bv === 'yes') { BULK = 0; var keys = Object.keys(SEL), asg = []; SEL = {}; keys.forEach(function(k){ var r = rowByKey(k); if (r && afAsg(r) && r.mine) { asg.push(r); return; } if (!r || !r.approve || !r.approve.mode) return; if (r.approve.mode === 'confirm') { CONF[k] = 1; return; } inlineApprove(r); }); if (asg.length) afBulkAssign(asg, bk); }   " + MARK + " B */")

open(p, 'w', encoding='utf-8').write(t)
print('ASSIGNFIX: patched')
