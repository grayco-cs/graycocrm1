#!/usr/bin/env python3
"""Idempotent patch LUXFIX: fixes found by re-running the old Leads regression tests on the new Leads screen (LEADSUX).

 * Idle repaint: the 6 s heartbeat (and every grayco_view write) forced a full redraw of the Leads / Bids screen, and the redraw
   re-set aria-pressed / aria-expanded / hidden / the filter-button text even when nothing changed (7-36 DOM mutations per
   10 s on an idle screen).  The heartbeat now redraws only when something changed; the redraw only touches what changed.
 * Bids search / Mine / Due date / Show more: the redraw key did not include the Bids screen's own choices, so typing in the
   Bids search box (or picking Mine / a due date) did nothing until the next heartbeat forced a redraw.  They are in the key now.
 * Priority (HOT2-prio): the priority badge is back on Leads cards and Bids rows (when one is set) and "Most important first"
   is in both ⋯ menus (the engine's own sort, remembered).
 * + New lead / Edit details / Delete (HOT2b): the classic add / edit form opened invisibly and Edit / Delete never found their row.
 * More filters (LCLEAN): Source counts and a "Kind" list with every lead type are back.
 * Role views (LROLEVIEW): only a plain PM starts on "Mine"; Insurance / Senior Roofing PM see their whole scope again.
 * Opening "More filters" no longer counts as a form being open (it held every background sync / update while open).
Every find-string must occur exactly once (else nothing is written).  Usage: python3 tools/patch_LUXFIX.py [index.html]
"""
import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '/* patch LUXFIX */'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_LEADSUX__' in src, 'patch LEADSUX must be applied first'

EDITS = []
def once(old, new, label):
    EDITS.append((old, new, label))

# ── 1. the redraw only touches what changed
once("function setText(el, t){ if (el && el.textContent !== t) el.textContent = t; }",
     "function setText(el, t){ if (el && el.textContent !== t) el.textContent = t; }\n"
     "function setAttr(el, k, v){ if (el && el.getAttribute(k) !== v) el.setAttribute(k, v); }   " + MARK + "\n"
     "function setHidden(el, h){ if (el && el.hidden !== !!h) el.hidden = !!h; }",
     'helpers')
once("b.classList.toggle('on', b.getAttribute('data-lux-view') === UX.v); b.setAttribute('aria-pressed', String(b.getAttribute('data-lux-view') === UX.v)); });",
     "b.classList.toggle('on', b.getAttribute('data-lux-view') === UX.v); setAttr(b, 'aria-pressed', String(b.getAttribute('data-lux-view') === UX.v)); });",
     'view buttons')
once("  var fb = q1('[data-lux-act=filters]'); fb.setAttribute('aria-expanded', String(UX.filters)); fb.textContent = UX.filters ? 'Hide filters' : 'More filters';",
     "  var fb = q1('[data-lux-act=filters]'); setAttr(fb, 'aria-expanded', String(UX.filters)); setText(fb, UX.filters ? 'Hide filters' : 'More filters');",
     'filters button')
once("  var dd = q1('[data-lux=dd]'); dd.hidden = !UX.menu; if (UX.menu) setHtml(dd, menuHtml());",
     "  var dd = q1('[data-lux=dd]'); setHidden(dd, !UX.menu); if (UX.menu) setHtml(dd, menuHtml());",
     'leads menu hidden')
once("  var dd = b.querySelector('[data-lux=bdd]'); dd.hidden = !UX.menu;",
     "  var dd = b.querySelector('[data-lux=bdd]'); setHidden(dd, !UX.menu);",
     'bids menu hidden')

# ── 2. the redraw key covers the Bids screen's own choices + which tab is up; the heartbeat no longer forces a redraw
once("    var key = fsig() + '|' + UX.filters + '|' + UX.menu + '|' + UX.closedOpen + '|' + UX.bulk + '|' + JSON.stringify(UX.more) + '|' + ssGet('gcl_classic_ok') + '|' + ymd(new Date());",
     "    var key = fsig() + '|' + UX.filters + '|' + UX.menu + '|' + UX.closedOpen + '|' + UX.bulk + '|' + JSON.stringify(UX.more) + '|' + ssGet('gcl_classic_ok') + '|' + ymd(new Date())\n"
     "      + '|' + LUX.tab + '|' + JSON.stringify([UX.bq, UX.bMine, UX.bdue, UX.bShowHidden, UX.bMore, !!LUX.bClassic]);   " + MARK,
     'render key')
once("    version(); FORCE = true; render();",
     "    version(); render();   /* patch LUXFIX: no forced redraw (a new mount resets LAST_KEY, so it still draws; an unchanged screen is not redrawn) */",
     'ensure no force')

# ── 3. priority (patch HOT2-prio): the new cards / Bids rows dropped the priority badge and "Most important first".
#       The badge is back (only when a priority is set: P1-P10, the engine's own chip) and "Most important first" is in both
#       ⋯ menus (the engine's UI.sort = 'prio', remembered; priority 10 -> 1, then the soonest bid due, then the newest).
once("function cardHtml(l, g){",
     "function luxPrio(l){ try { var P = W._gcLeadPriority; return P && P.of(l) ? P.chip(l) : ''; } catch (x) { return ''; } }   " + MARK + "\n"
     "function luxImp(){ var P = W._gcLeadPriority, e = E(); return !!(P && P.importance && e && e.ui().sort === 'prio') ? P.importance : null; }\n"
     "function cardHtml(l, g){",
     'prio helpers')
once("+ '<div class=\"lux-meta\">' + meta + '</div>",
     "+ '<div class=\"lux-meta\">' + luxPrio(l) + meta + '</div>",
     'card prio chip')
once("  g.bd.sort(dueAsc);",
     "  g.bd.sort(dueAsc);\n  var IMP = luxImp(); if (IMP) { g.na.sort(IMP); g.ip.sort(IMP); g.bd.sort(IMP); }   /* patch LUXFIX: Most important first */",
     'groups importance')
once("  list.sort(function(a, b){ var x = e.dueMs(a), y = e.dueMs(b); x = isFinite(x) ? x : 9e15; y = isFinite(y) ? y : 9e15; return x - y || e.receivedMs(b) - e.receivedMs(a); });",
     "  list.sort(function(a, b){ var x = e.dueMs(a), y = e.dueMs(b); x = isFinite(x) ? x : 9e15; y = isFinite(y) ? y : 9e15; return x - y || e.receivedMs(b) - e.receivedMs(a); });\n"
     "  var IMP = luxImp(); if (IMP) list.sort(IMP);   /* patch LUXFIX: Most important first */",
     'bids importance')
once("'<div class=\"lux-br\" data-lux-open=\"' + esc(l.id) + '\" tabindex=\"0\">' + due + '<div class=\"lux-t\">' + esc(s(l.name || l.title) || 'Bid') + '<small>'",
     "'<div class=\"lux-br\" data-lux-open=\"' + esc(l.id) + '\" tabindex=\"0\">' + due + '<div class=\"lux-t\">' + esc(s(l.name || l.title) || 'Bid') + (luxPrio(l) ? ' ' + luxPrio(l) : '') + '<small>'",
     'bid row prio chip')
once("  h += item('numbers', 'Pipeline numbers');",
     "  h += item('prio', u.sort === 'prio' ? 'Most important first: on' : 'Most important first', '');   " + MARK + "\n  h += item('numbers', 'Pipeline numbers');",
     'leads menu prio')
once("  else if (a === 'numbers') {",
     "  else if (a === 'prio') { u.sort = u.sort === 'prio' ? 'born' : 'prio'; u.dir = -1; e.saveUI(); }   " + MARK + "\n  else if (a === 'numbers') {",
     'leads menu prio act')
once("+ item('watch', 'Watched boards')",
     "+ item('prio', e.ui().sort === 'prio' ? 'Most important first: on' : 'Most important first') + item('watch', 'Watched boards')",
     'bids menu prio')
once("      else if (k === 'watch') showWatch();",
     "      else if (k === 'prio') { var u0 = e.ui(); u0.sort = u0.sort === 'prio' ? 'born' : 'prio'; u0.dir = -1; e.saveUI(); }   " + MARK + "\n      else if (k === 'watch') showWatch();",
     'bids menu prio act')

# ── 4. "+ New lead", "Edit details" and "Delete" (patch HOT2b): they use the classic Lead Pipeline's own form / row buttons,
#       but (a) the new screen hid the whole classic block, so the add / edit form opened invisibly, and (b) the classic table
#       never redrew to draw the one row asked for (clicking the tabs does not re-render it), so Edit / Delete did nothing.
#       Now: the classic block is marked .lux-formhost and is shown while its form is open (html.lux-form; the HOT2b rules
#       still hide its title, search and table); the table is redrawn by typing the lead's id into its (hidden) search box,
#       which draws that one row; the search box is cleared again right after.
once('html.lux-on:not(.lux-classic) #gc-leads-tabs:not([data-tab="website"]) ~ *:not(.lux-keep):not(#gc-rso):not(#gc-ol):not(#gc-bw-watch.lux-open):not(#gc-ldi.lux-open):not(#gcl-settings){display:none!important}',
     'html.lux-on:not(.lux-classic) #gc-leads-tabs:not([data-tab="website"]) ~ *:not(.lux-keep):not(#gc-rso):not(#gc-ol):not(#gc-bw-watch.lux-open):not(#gc-ldi.lux-open):not(#gcl-settings):not(.lux-formhost){display:none!important}\n'
     'html.lux-on:not(.lux-classic):not(.lux-form) #gc-leads-tabs:not([data-tab="website"]) ~ .lux-formhost{display:none!important}   /* patch LUXFIX: the classic add / edit form shows while it is open */',
     'css form host')
once("function rerenderClassic(){   /* the page redraws the table when its tab is shown again */",
     "/* patch LUXFIX: the classic block (its title, search, add / edit form and table) and its form */\n"
     "function formHost(){ var bar = tabBar(), p = bar && bar.parentElement, i = p && p.querySelector('input[name=\"gc-projsearch\"]'), h = i; if (!h) return null;\n"
     "  while (h && h.parentElement !== p) h = h.parentElement; if (h && !h.classList.contains('lux-formhost')) h.classList.add('lux-formhost'); return h; }\n"
     "function formOpen(){ var h = formHost(); return !!h && Array.prototype.some.call(h.querySelectorAll('input,select,textarea'), function(i){ return !!i.offsetParent && i.type !== 'checkbox' && i.name !== 'gc-projsearch' && !i.closest('table'); }); }\n"
     "function formWatch(){ if (!H.classList.contains('lux-form')) return; if (view() !== 'leads' || !formOpen()) { H.classList.remove('lux-form'); return; } later(formWatch, 1500); }\n"
     "function formMode(){ formHost(); H.classList.add('lux-form'); later(formWatch, 1200); }\n"
     "function poke(v){ var h = formHost(), i = h && h.querySelector('input[name=\"gc-projsearch\"]'); if (!i) return false;   /* the classic table's own search box: a change redraws the table */\n"
     "  try { Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); return true; } catch (x) { warn(x); return false; } }\n"
     "function rerenderClassic(){   /* the page redraws the table when its tab is shown again */\n"
     "  var h = formHost(), i = h && h.querySelector('input[name=\"gc-projsearch\"]'); if (i && !i.value && poke('\\u0001')) { poke(''); return; }   /* patch LUXFIX: clicking the tabs alone did not redraw it */",
     'form host + poke')
once("  rerenderClassic(); var n = 0;",
     "  var poked = poke(String(id)) || (rerenderClassic(), false), n = 0;   /* patch LUXFIX: the search box finds the lead by its id, so the table draws that row */\n"
     "  var then0 = then; then = function(){ var r = then0(); if (poked) later(function(){ poke(''); }, 60); return r; };",
     'withRow poke')
once("  else if (a === 'new') { e.newLead(); }",
     "  else if (a === 'new') { formMode(); e.newLead(); }   " + MARK,
     'menu new form mode')
once("      else if (k === 'new') e.newLead();",
     "      else if (k === 'new') { formMode(); e.newLead(); }   " + MARK,
     'bids new form mode')
once("withRow(id0, function(){ var rb = e0.classicRow(id0, edit ? /✏/ : /🗑/); if (!rb) { toast('Not available for this lead.'); return; } e0.closeDrawer(); rb.click();",
     "withRow(id0, function(){ var rb = e0.classicRow(id0, edit ? /✏/ : /🗑/); if (!rb) { toast('Not available for this lead.'); return; } e0.closeDrawer(); formMode(); rb.click();   " + MARK + "\n     ",
     'edit/delete form mode')
once("  LUX.active = false; LUX.tab = ''; LUX.bClassic = false; H.classList.remove('lux-on'); H.classList.remove('lux-classic'); closeModal();",
     "  LUX.active = false; LUX.tab = ''; LUX.bClassic = false; H.classList.remove('lux-on'); H.classList.remove('lux-classic'); H.classList.remove('lux-form'); closeModal();   " + MARK,
     'unmount form mode')

# ── 5. lead filters (patch LCLEAN): the old hub's Source list had counts and its Type list had every kind (Roofing, Restoration -
#       Water / Fire / Storm, Insurance claim, Mitigation, Remodel ...) with counts; the new Type pill has 4.  More filters now
#       has the counts on Source and a "Kind" list with every type and its count (the same engine filter, UI.type).
once("  var base = e.scoped().filter(function(l){ return !e.importedL(l); }), nShut = base.filter(e.shut).length, nExp = base.filter(e.expired).length;",
     "  var base = e.scoped().filter(function(l){ return !e.importedL(l); }), nShut = base.filter(e.shut).length, nExp = base.filter(e.expired).length;\n"
     "  var sc = {}, tc = {}, KT = (W._gcLeadTypes && W._gcLeadTypes.list) || [];   /* patch LUXFIX: counts per source / kind, as the old hub showed */\n"
     "  e.scoped().forEach(function(l){ if (e.importedL(l) && !u.imp) return; var k = e.srcCanon(l); sc[k] = (sc[k] || 0) + 1; e.typesOf(l).forEach(function(x){ tc[x] = (tc[x] || 0) + 1; }); });\n"
     "  srcs = srcs.map(function(x){ return { v: x, t: x + ' (' + (sc[x] || 0) + ')' }; });",
     'filters counts')
once("    + '<label>Source<select data-gcl-f=\"src\">' + opt(srcs, u.src, 'All sources') + '</select></label>'",
     "    + '<label>Source<select data-gcl-f=\"src\">' + opt(srcs, u.src, 'All sources') + '</select></label>'\n"
     "    + '<label>Kind<select data-gcl-f=\"type\">' + opt(KT.map(function(t){ return { v: t, t: t + ' (' + (tc[t] || 0) + ')' }; }), u.type, 'All kinds') + '</select></label>'   " + MARK,
     'filters kind')

# ── 6. role views (patch LROLEVIEW / HOT2-roles): the new screen started every non-admin on "Mine", so the Insurance profile and
#       the Senior Roofing PM no longer saw the unassigned leads of their specialty (which they are there to pick up / hand out).
#       Only a plain PM (scope "assigned to me") starts on Mine now; a specialist starts on his whole scope, as before.
once("  else if (sc.kind !== 'all') { var u = e.ui(); u.who = '__me'; e.saveUI(); }",
     "  else if (sc.kind === 'mine') { var u = e.ui(); u.who = '__me'; e.saveUI(); }   /* patch LUXFIX: insurance / roofing / ... specialists keep their whole scope */",
     'role default mine')

# ── 7. the page-wide "a form is open" hold (FORMHOLD) counted the Leads screen's "More filters" selects as a form being opened
#       (the box count jumps right after a click) and held ALL background work - syncs from other computers, React updates
#       reaching window._crm - for as long as the panel stayed open (up to 20 minutes).  The old hub's filter selects were always
#       on screen, so they never counted.  Filter controls of the Leads screen are not a form: they are left out of both counts
#       (FORMHOLD's fields() and the hands-off guard's fieldsOnScreen0(), which is the one that parked the updates).
once("    if(t==='hidden') continue;\n    if(vis(e)) out.push(e);",
     "    if(t==='hidden') continue;\n    if(e.closest && e.closest('#gc-lux [data-lux=filters]')) continue;   /* patch LUXFIX: the Leads screen's More filters are not a form */\n    if(vis(e)) out.push(e);",
     'formhold skip lux filters')
once("      if(e.id === 'gc-navsearch') continue;          /* the search bar is always there */",
     "      if(e.id === 'gc-navsearch') continue;          /* the search bar is always there */\n      if(e.closest && e.closest('#gc-lux [data-lux=filters]')) continue;   /* patch LUXFIX: the Leads screen's More filters are not a form (the hands-off hold too) */",
     'handsoff skip lux filters')

for old, new, label in EDITS:
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
for old, new, label in EDITS:
    src = src.replace(old, new)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
