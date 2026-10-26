#!/usr/bin/env python3
"""Idempotent patch LEADSUX: the Leads screen redesign (Leads . Bids . Website & ads).

 * New UI = tools/leadsux_tail.js (+ tools/leadsux.css), inlined before gc-patch-pay2. It reads the lead list and every action
   from the existing Leads engine, exported as window._gcLeadsEngine (one block added to the end of gc-patch-leads).
 * The old hub is NOT decorated: while the new screen is on (window.__GC_LUX__, off with localStorage gc_lux_off=1) its renderer
   returns at once and its timers are slowed / switched off (see window._gcLux.disabled for the list).
 * The lead drawer element (#gcl-drawer) stays - every add-on that decorates it keeps working - but is laid out as a side panel.
Every find-string must occur exactly once (else nothing is written).  Usage: python3 tools/patch_LEADSUX.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_LEADSUX__'
if MARK in src:
    print('already patched'); sys.exit(0)
TAIL = open(os.path.join(HERE, 'leadsux_tail.js'), encoding='utf-8').read().rstrip('\n')
CSS = open(os.path.join(HERE, 'leadsux.css'), encoding='utf-8').read().rstrip('\n')
assert '</script>' not in TAIL and '</style>' not in CSS

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

# ───────────── 0. the switch + the early HOT2b watcher (250 ms -> 5 s; the storage hook and the new screen do the quick part)
once("if (window.__GC_HOT2B_EARLY__) return; window.__GC_HOT2B_EARLY__ = true;",
     "if (window.__GC_HOT2B_EARLY__) return; window.__GC_HOT2B_EARLY__ = true;\n  try { window.__GC_LUX__ = window.localStorage.getItem('gc_lux_off') !== '1'; } catch (e) { window.__GC_LUX__ = true; }   /* LEADSUX: the new Leads screen (off for one browser: localStorage gc_lux_off = 1) */", 'lux flag')
once("    if (document.getElementById('gc-leads-hub')) {\n      since = 0;",
     "    if (document.getElementById('gc-leads-hub') || document.getElementById('gc-lux') || document.getElementById('gc-lux-bids')) {   /* LEADSUX */\n      since = 0;", 'hot2b hub present')
once("  SI.call(W, sync, 250);",
     "  SI.call(W, sync, 5000); W._gcHot2bSync = sync;   /* LEADSUX: 5 s (was 250 ms); the grayco_view hook and the new screen call sync() when it matters */", 'hot2b interval')

# ───────────── 1. the hub script (gc-patch-leads): switches, hooks, the engine export
once("if (window.__GC_PATCH_LEADS__) return; window.__GC_PATCH_LEADS__ = true;\nvar W = window, D = document, ST = W.setTimeout, RI = W.setInterval;",
     "if (window.__GC_PATCH_LEADS__) return; window.__GC_PATCH_LEADS__ = true;\nvar W = window, D = document, ST = W.setTimeout, RI = W.setInterval;\nfunction LUXON(){ return !!W.__GC_LUX__ && !W.__GC_LUX_FAIL__; }   /* patch LEADSUX: the new Leads screen draws; this hub does not */", 'hub head')
once("function filtered(){\n  var q = low(UI.q), now = Date.now();",
     "function filtered(o){   /* patch LEADSUX: o.closed = include closed leads (the Recently closed group) */\n  var q = low(UI.q), now = Date.now(), LX = LUXON() && !!W._gcLux && !!W._gcLux.active;", 'filtered head')
once("else if (!UI.closed && !UI.arch && shut(l) && UI.stage !== 'Won' && UI.stage !== 'Lost') return false;",
     "else if (!UI.closed && !(o && o.closed) && !UI.arch && shut(l) && UI.stage !== 'Won' && UI.stage !== 'Lost') return false;", 'filtered closed')
once("    if (q && low([l.name, l.title, l.client, l.contact, l.email, l.phone, l.address, l.city, srcOf(l), assignee(l), l.gc, l.dueToCompany, l.bidNumber].join(' ')).indexOf(q) < 0) return false;\n    return true;",
     "    if (q && !(LX ? W._gcLux.match(l, q) : low([l.name, l.title, l.client, l.contact, l.email, l.phone, l.address, l.city, srcOf(l), assignee(l), l.gc, l.dueToCompany, l.bidNumber].join(' ')).indexOf(q) >= 0)) return false;   /* patch LEADSUX: + notes, phone digits */\n    if (LX && !W._gcLux.keep(l)) return false;   /* patch LEADSUX: the chip (New / Bids due / Unassigned / Follow-ups) */\n    return true;", 'filtered q')
once("if (view() === 'leads') later(function(){ HUB_SIG = ''; mount(); }, 0); } }, function(){ LEADS_BUSY = false; });",
     "if (view() === 'leads') later(function(){ HUB_SIG = ''; mount(); try { if (W._gcLux && W._gcLux.dirty) W._gcLux.dirty('sync'); } catch (e) {} }, 0); } }, function(){ LEADS_BUSY = false; });", 'pull dirty')
once("function mount(){\n  if (view() !== 'leads') {",
     "function mount(){\n  if (LUXON()) { var oh = D.getElementById('gc-leads-hub'); if (oh) oh.remove(); return; }   /* patch LEADSUX: the new Leads screen is on - this renderer does nothing */\n  if (view() !== 'leads') {", 'mount gate')
once("function redraw(){ HUB_SIG = ''; FORCE = true; mount(); FORCE = false; }",
     "function redraw(){ HUB_SIG = ''; if (LUXON()) { try { if (W._gcLux && W._gcLux.dirty) W._gcLux.dirty('redraw'); } catch (e) {} return; } FORCE = true; mount(); FORCE = false; }   /* patch LEADSUX */", 'redraw gate')
once("var b = t.closest('[data-gcl-asg],[data-gcl-bulkasg],[data-gcl-pickall],[data-gcl-pick]'); if (!b || !b.closest('#gc-leads-hub')) return;",
     "var b = t.closest('[data-gcl-asg],[data-gcl-bulkasg],[data-gcl-pickall],[data-gcl-pick]'); if (!b || !b.closest('#gc-leads-hub,#gc-lux,#gc-lux-bids')) return;   /* patch LEADSUX */", 'picker scope')
once("if (typeof W._setLeads !== 'function' || view() !== 'leads' || !D.getElementById('gc-leads-hub')) return;",
     "if (typeof W._setLeads !== 'function' || view() !== 'leads' || (!D.getElementById('gc-leads-hub') && !D.getElementById('gc-lux') && !D.getElementById('gc-lux-bids'))) return;   /* patch LEADSUX */", 'sweep scope')
once("function autoLoop(){ try { if (!D.hidden) autoAssignBids(); } catch (e) { warn(e); } later(autoLoop, 3000); }",
     "function autoLoop(){ try { if (!D.hidden) autoAssignBids(); } catch (e) { warn(e); } later(autoLoop, LUXON() ? 8000 : 3000); }   /* patch LEADSUX: 8 s (was 3 s) */", 'autoLoop')
once("RI.call(W, tick, 1500); later(tick, 600);",
     "RI.call(W, tick, LUXON() ? 6000 : 1500); later(tick, 600);   /* patch LEADSUX: 6 s (was 1.5 s); the tick no longer repaints (mount() is off) */", 'tick interval')
once("function drawerHtml(l){\n  var it = inboxOf(l) || {}, pl = plansOf(l), p = portalOf(l), a = assignee(l), adm = isAdmin(), est = estimateFor(l);",
     "function drawerHtml(l){   /* patch LEADSUX: the new side panel lays the same sections out again (every data-d handler below is unchanged) */\n  var h0 = drawerHtml0(l); try { if (LUXON() && W._gcLux && W._gcLux.panel) return W._gcLux.panel(l, h0); } catch (e) { warn(e); } return h0;\n}\nfunction drawerHtml0(l){\n  var it = inboxOf(l) || {}, pl = plansOf(l), p = portalOf(l), a = assignee(l), adm = isAdmin(), est = estimateFor(l);", 'drawerHtml')
once("held(function(){ d.innerHTML = html; }); d.scrollTop = top;\n}",
     "held(function(){ d.innerHTML = html; }); d.scrollTop = top;\n  try { if (LUXON() && W._gcLux && W._gcLux.afterOpen) W._gcLux.afterOpen(l); } catch (e) { warn(e); }   /* patch LEADSUX */\n}", 'openDrawer hook')
once("if (sh) Element.prototype.remove.call(sh); }); UI.open = ''; }",
     "if (sh) Element.prototype.remove.call(sh); }); UI.open = ''; try { if (LUXON() && W._gcLux && W._gcLux.afterClose) W._gcLux.afterClose(); } catch (e) { warn(e); } }   /* patch LEADSUX */", 'closeDrawer hook')
once("W._gcLeadsHub.tick = tick;   /* patch LEADPERF-2: the perf gate times the idle tick */",
     "W._gcLeadsHub.tick = tick;   /* patch LEADPERF-2: the perf gate times the idle tick */\n"
     "/* patch LEADSUX: what the new Leads screen reads and calls - the same functions this hub uses, so every rule stays one rule */\n"
     "W._gcLeadsEngine = { STAGES: STAGES, ui: function(){ return UI; }, saveUI: saveUI, syncUI: syncUI, css: css, pick: function(){ return PICK; }, more: function(){ return MORE; },\n"
     "  rawLeads: rawLeads, leads: leads, scoped: scoped, filtered: filtered, bodyHtml: bodyHtml, bind: bind, pull: pullLeads,\n"
     "  openDrawer: openDrawer, closeDrawer: closeDrawer, moveStage: moveStage, markContacted: markContacted, assign: assign, patchLead: patchLead, setLeads: setLeads, logAct: logAct, nowIso: nowIso, toast: toast,\n"
     "  stageOf: stageOf, closed: closed, shut: shut, expired: expired, contacted: contacted, isBidL: isBidL, assignee: assignee, dueMs: dueMs, born: born, receivedMs: receivedMs,\n"
     "  typesOf: typesOf, typeOf: typeOf, srcOf: srcOf, srcCanon: srcCanon, importedL: importedL, archivedL: archivedL, dead: dead, value: value, money: money, initials: initials,\n"
     "  canAssignAll: canAssignAll, isAdmin: isAdmin, amEstimator: amEstimator, myScope: myScope, myName: myName, myEmail: myEmail, mineL: mineL, people: people, loadOf: loadOf, openPicker: openPicker,\n"
     "  newLead: newLead, openSettings: openSettings, closeSettings: closeSettings, inboxOf: inboxOf, prioChip: prioChip, prioPicker: prioPicker, canPrio: canPrio, classicRow: classicRow };",
     'engine export')

# ───────────── 2. the Lead Inbox script (LD2): no MutationObserver on <body> while Leads is the view
once("var mo = null, moBody = null;\nfunction observe(){\n  if (moBody === document.body && mo) return;",
     "var mo = null, moBody = null;\nfunction luxHere(){ try { return !!window.__GC_LUX__ && !window.__GC_LUX_FAIL__ && localStorage.getItem('grayco_view') === 'leads'; } catch (e) { return false; } }   /* patch LEADSUX */\n"
     "function observe(){\n  if (luxHere()) { if (mo) { try { mo.disconnect(); } catch (e) {} } mo = null; moBody = null; return; }   /* patch LEADSUX: the new Leads / Bids screens need no watcher on the whole page */\n  if (moBody === document.body && mo) return;", 'ld2 observe')
once("function schedule(){ if (mt && Date.now() - mtAt < 2000) return;",
     "function schedule(){ if (luxHere()) return; if (mt && Date.now() - mtAt < 2000) return;", 'ld2 schedule')
once("  reminders: reminders, count: newCount, refresh: function(){ return pull(true); },",
     "  reminders: reminders, count: newCount, refresh: function(){ return pull(true); }, mountNow: function(){ try { tickNow(); } catch (e) {} }, wake: function(){ try { schedule(); } catch (e) {} },   /* patch LEADSUX */", 'ld2 export')

# ───────────── 3. the four Lead-settings bars: no 1 s timer; the new screen mounts them when Lead settings opens
for nm, exp in (('CLAIMLEAD', "W._gcClaimsTo = { get: claimsTo, who: who, mount: mount };"), ('ALERTTO', "W._gcAlertTo = { get: alertTo, mount: mount };"),
                ('MITTO', "W._gcMitTo = { get: mitigationTo, mount: mount };"), ('EMERGTO', "W._gcEmergTo = { get: emergenciesTo, mount: mount };")):
    old = exp + "\nfunction tick(){ try { mount(); load(); } catch (e) {} }\n" + ("/* the page slows plain timers down; the Leads patches use the native one (W.__GC_NATIVE_SETINTERVAL__), so do the same */\n" if nm == 'CLAIMLEAD' else "") + "(W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval).call(W, tick, 1000);"
    name = exp.split(' = ')[0]
    new = (exp + "\nfunction tick(){ try { mount(); load(); } catch (e) {} }\n" + name + ".tick = tick;\n"
           "/* patch LEADSUX: the 1 s timer is gone; the new Lead settings calls tick() when it opens (with the new screen off, the timer is as before) */\n"
           "if (!W.__GC_LUX__ || W.__GC_LUX_FAIL__) (W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval).call(W, tick, 1000);")
    once(old, new, 'settings bar ' + nm)

# ───────────── 4. outreach (RSO): hub() is also the new screen; its 1.5 s repaint is 6 s
once("function hub(){ return D.getElementById('gc-leads-hub'); }",
     "function hub(){ return D.getElementById('gc-leads-hub') || D.getElementById('gc-lux'); }   /* patch LEADSUX */", 'rso hub')
once("  if (UI.on) { if (!S.loadedAt && !S.loading) load(); paint(); }\n}, 1500);",
     "  if (UI.on) { if (!S.loadedAt && !S.loading) load(); paint(); }\n}, 6000);   /* patch LEADSUX: 6 s (was 1.5 s) */", 'rso interval')

# ───────────── 5. tab labels: Leads . Bids . Website & ads
once('xt=[{id:"leads",l:"Leads"},{id:"bidboard",l:"Bids ("+st.length+")"},{id:"website",l:"Website"}]',
     'xt=[{id:"leads",l:"Leads"},{id:"bidboard",l:"Bids"},{id:"website",l:"Website & ads"}]', 'tab labels')

# ───────────── 5b. the page-wide "search box" debouncer re-sent its own synthetic input event every 150 ms for ever (each re-sent event
#               re-armed it), on every search box once typed in: one re-send per real keystroke is enough
once('        el.addEventListener("input", function handler(ev) {\n          if (_debounceTimers[el.placeholder]) {',
     '        el.addEventListener("input", function handler(ev) {\n          if (ev && ev.isTrusted === false) return;   /* LEADSUX: its own re-sent event must not re-arm it (it looped every 150 ms for ever) */\n          if (_debounceTimers[el.placeholder]) {', 'search debouncer loop')

# ───────────── 6. the new screen itself
anchor = '<script id="gc-patch-pay2">'
assert src.count(anchor) == 1, ('anchor count != 1', src.count(anchor))
src = src.replace(anchor, '<style id="gc-leadsux-css">\n' + CSS + '\n</style>\n<script id="gc-patch-leadsux">\n' + TAIL + '\n</script>\n' + anchor)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
