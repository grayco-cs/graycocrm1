#!/usr/bin/env python3
"""Idempotent patch LEADFREEZE: the Leads screen no longer freezes at several hundred leads / bid items.

Root causes (measured at 782 leads, 150 inbox items, 608 outreach rows, 4x CPU, admin): the hidden classic Lead Pipeline
table rendered EVERY lead (~18,000 DOM nodes, 3,800 buttons) and the hidden Lead Inbox drew every card (~3,000 nodes),
so every page-wide decorator / scanner (To-Do 'EDIT' scan, layers, partsIn, menu scans ...) walked 23,000 nodes each tick.
Fixes (all localized to Leads code; each find-string must occur exactly once):
  1. (dropped: windowing of the old React table - the Leads redesign replaces it)
  2. Lead Inbox: not drawn while the Bids tab is not showing; 40 cards + "Show more".
  3. see the other numbered blocks below.
Usage: python3 tools/patch_LEADFREEZE.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch LEADFREEZE'
if MARK in src:
    print('already patched'); sys.exit(0)

EDITS = []
def E(name, find, repl):
    EDITS.append((name, find, repl))

# ── 1. classic table windowing ────────────────────────────────────────────────────────────────────────────────────
# ── 2. Lead Inbox: drawn only when the Bids tab shows it, 40 cards at a time ──────────────────────────────────────
E('ldi render gate',
  "function render(){\n  var root = document.getElementById('gc-ldi'); if (!root || !root.isConnected) return;\n  var list = filtered(), n = newCount(), w = S.watch && S.watch.lastRun;",
  "var LDI_DIRTY = true, LDI_DRAWN = false, LDI_FORCE = false, LDI_LIM = 40;   /* patch LEADFREEZE-2: 40 cards at a time; nothing drawn while another Leads tab is showing */\n"
  "function render(){\n  var root = document.getElementById('gc-ldi'); if (!root || !root.isConnected) return;\n"
  "  var tb0 = document.getElementById('gc-leads-tabs'); if (!LDI_FORCE && LDI_DRAWN && tb0 && tb0.getAttribute('data-tab') !== 'bidboard') { LDI_DIRTY = true; return; }   /* hidden: drawn when the Bids tab opens */\n"
  "  LDI_DIRTY = false; LDI_DRAWN = true; LDI_FORCE = false;\n"
  "  var list = filtered(), n = newCount(), w = S.watch && S.watch.lastRun;")
E('ldi cards',
  "    h += list.length ? '<div class=\"grid\">' + list.map(card).join('') + '</div>'",
  "    h += list.length ? '<div class=\"grid\">' + list.slice(0, LDI_LIM).map(card).join('') + '</div>' + (list.length > LDI_LIM ? '<div style=\"padding:0 12px 12px\"><button class=\"b pri\" data-a=\"more\">Show ' + Math.min(40, list.length - LDI_LIM) + ' more (' + (list.length - LDI_LIM) + ' not shown)</button></div>' : '')")
E('ldi click force',
  "  var a = b.getAttribute('data-a'), cardEl = b.closest('.card'), id = cardEl && cardEl.getAttribute('data-id');\n  e.preventDefault(); e.stopPropagation();\n",
  "  var a = b.getAttribute('data-a'), cardEl = b.closest('.card'), id = cardEl && cardEl.getAttribute('data-id');\n  e.preventDefault(); e.stopPropagation(); LDI_FORCE = true;   /* patch LEADFREEZE-2: a person's own action always draws */\n")
E('ldi more click',
  "  if (a === 'fold') { UI.open = !UI.open; lsSet(K_UI, UI); return render(); }\n",
  "  if (a === 'fold') { UI.open = !UI.open; lsSet(K_UI, UI); return render(); }\n  if (a === 'more') { LDI_LIM += 40; return render(); }   /* patch LEADFREEZE-2 */\n")
E('ldi filter reset',
  "UI[f] = e.target.value; lsSet(K_UI, UI); render(); }\nfunction dropHandlers(",
  "UI[f] = e.target.value; lsSet(K_UI, UI); LDI_LIM = 40; LDI_FORCE = true; render(); }\nfunction dropHandlers(")
E('ldi mount',
  "  if (cur && cur.previousElementSibling === bar) return;   /* LEADSCON:",
  "  if (cur && cur.previousElementSibling === bar) { if (LDI_DIRTY && bar.getAttribute('data-tab') === 'bidboard') render(); return; }   /* patch LEADFREEZE-2 */   /* LEADSCON:")


# ── 3. one cheap check before the layout-forcing one (To-Do "＋ To-do" buttons on Admin → Employees rows) ──────────────
E('todo decorate order',
  "      if (b.__gca || !b.offsetParent || !/^\\s*EDIT\\s*$/.test(b.textContent || '')) return;\n",
  "      if (b.__gca || !/^\\s*EDIT\\s*$/.test(b.textContent || '') || !b.offsetParent) return;   /* patch LEADFREEZE-3: text first - offsetParent forced a layout for every button on the page */\n")

# ── 4. the hub: search waits for the typing hand (250 ms); the map list is paged ──────────────────────────────────────
E('hub search debounce',
  "  function qNow(t){ if (UI.q === t.value) return; UI.q = t.value; redraw(); }   /* at once: a few hundred leads draw in a few ms */",
  "  var QT = null;\n"
  "  function qNow(t){ if (UI.q === t.value) return; UI.q = t.value; MORE.list = 0; try { if (QT) W.clearTimeout(QT); } catch (e) {} QT = later(function(){ QT = null; redraw(); }, 250); }   /* patch LEADFREEZE-4: 250 ms after the last key, not one full draw per key */")
E('hub map paged',
  "withAddr.slice(0, 300).map(function(l){",
  "withAddr.slice(0, lim('map', 50)).map(function(l){")
E('hub map more',
  "+ (withAddr.length ? '' : '<li>No leads with an address match the filters.</li>') + '</ul>'",
  "+ (withAddr.length ? '' : '<li>No leads with an address match the filters.</li>') + (withAddr.length > lim('map', 50) ? '<li>' + moreBtn('map', withAddr.length, 50) + '</li>' : '') + '</ul>'")

# ── 5. hub timers: the leads read backs off when nothing changed; the auto-assign scan waits when it found nothing ─────
E('auto scan memo',
  "  var plan = {}, n = 0, key = [];\n  leads().forEach(function(l){\n    if (shut(l) || (!force && (AUTO_TRIES[l.id] || 0) >= 3)) return;",
  "  var plan = {}, n = 0, key = [];\n"
  "  var scanRef = rawLeads(), scanMin = Math.floor(Date.now() / 30000);   /* patch LEADFREEZE-5: the same list that gave nobody to route 30 s ago gives nobody now */\n"
  "  if (!force && AUTO_SCAN.ref === scanRef && AUTO_SCAN.min === scanMin && AUTO_SCAN.none) return Promise.resolve(0);\n"
  "  leads().forEach(function(l){\n    if (shut(l) || (!force && (AUTO_TRIES[l.id] || 0) >= 3)) return;")
E('auto scan record',
  "  AUTO_LAST = { why: 'candidates', ids: key.slice(0, 20), at: nowIso() };\n",
  "  AUTO_SCAN = { ref: scanRef, min: scanMin, none: !n };\n  AUTO_LAST = { why: 'candidates', ids: key.slice(0, 20), at: nowIso() };\n")
E('auto scan var',
  "function autoAssignBids(force){\n",
  "var AUTO_SCAN = { ref: null, min: 0, none: false };\nfunction autoAssignBids(force){\n")

# ── 6. company outreach list: 50 rows + Show more, a row's form is built when it is opened, search waits 250 ms,
#       nothing is drawn while the Outreach view is not showing ────────────────────────────────────────────────────────
E('ol lazy row',
  "  var f = function(k, l, v, ty){ return '<label>' + l + '<input data-ol-f=\"' + k + '\" type=\"' + (ty || 'text') + '\" value=\"' + esc(v) + '\"></label>'; };",
  "  if (!open) return '<details class=\"ol-it\" data-ol-id=\"' + esc(it.id) + '\" data-ol-lazy=\"1\">' + sum + '</details>';   /* patch LEADFREEZE-6: the form is built when the row is opened */\n"
  "  var f = function(k, l, v, ty){ return '<label>' + l + '<input data-ol-f=\"' + k + '\" type=\"' + (ty || 'text') + '\" value=\"' + esc(v) + '\"></label>'; };")
E('ol list paged',
  "  return list.slice(0, 300).map(rowHtml).join('') + (list.length > 300 ? '<div class=\"ol-sub\">Showing 300 of ' + list.length + ' — narrow it with the filters.</div>' : '');",
  "  var lm = ST.ui.lim || 50;   /* patch LEADFREEZE-6 */\n"
  "  return list.slice(0, lm).map(rowHtml).join('') + (list.length > lm ? '<button type=\"button\" class=\"ol-btn\" data-ol-more=\"1\" style=\"margin:8px 0\">Show ' + Math.min(100, list.length - lm) + ' more (' + (list.length - lm) + ' not shown)</button>' : '');")
E('ol redraw hidden',
  "function redraw(){\n  var el = D.getElementById('gc-ol'); if (!el) return;\n",
  "function redraw(){\n  var el = D.getElementById('gc-ol'); if (!el) return;\n  if (!D.body.classList.contains('gcrso-on')) { el.__drawn = false; return; }   /* patch LEADFREEZE-6: drawn when the Outreach view opens */\n")
E('ol more click',
  "[data-ol-g],[data-ol-new],[data-ol-imp],[data-ol-exp],[data-ol-all],[data-ol-addlog]') : null; if (!t) return;\n    if (t.hasAttribute('data-ol-g')) { ST.ui.g = t.getAttribute('data-ol-g'); el.__force = true; redraw(); }",
  "[data-ol-g],[data-ol-new],[data-ol-imp],[data-ol-exp],[data-ol-all],[data-ol-addlog],[data-ol-more]') : null; if (!t) return;\n"
  "    if (t.hasAttribute('data-ol-more')) { ST.ui.lim = (ST.ui.lim || 50) + 100; drawList(); return; }   /* patch LEADFREEZE-6 */\n"
  "    if (t.hasAttribute('data-ol-g')) { ST.ui.g = t.getAttribute('data-ol-g'); ST.ui.lim = 50; el.__force = true; redraw(); }")
E('ol new visible',
  "ST.items.push(it); ST.ui.open[id] = true; persist();",
  "ST.items.push(it); ST.ui.open[id] = true; ST.ui.lim = Math.max(ST.ui.lim || 50, ST.items.length); persist();")
E('ol search debounce',
  "t.hasAttribute('data-ol-q')) { ST.ui.q = t.value; drawList(); } });",
  "t.hasAttribute('data-ol-q')) { ST.ui.q = t.value; ST.ui.lim = 50; try { if (el.__qt) W.clearTimeout(el.__qt); } catch (e) {} el.__qt = NST.call(W, function(){ el.__qt = 0; drawList(); }, 250); } });   /* patch LEADFREEZE-6: 250 ms after the last key */")
E('ol filters reset',
  "    if (t.hasAttribute('data-ol-fs')) { ST.ui.st = t.value; drawList(); return; }",
  "    if (t.hasAttribute('data-ol-fs')) { ST.ui.st = t.value; ST.ui.lim = 50; drawList(); return; }")
E('ol toggle build',
  "if (d.open) ST.ui.open[d.getAttribute('data-ol-id')] = true; else delete ST.ui.open[d.getAttribute('data-ol-id')]; } }, true);",
  "if (d.open) ST.ui.open[d.getAttribute('data-ol-id')] = true; else delete ST.ui.open[d.getAttribute('data-ol-id')];\n"
  "    if (d.open && d.hasAttribute('data-ol-lazy')) { var it0 = byId(d.getAttribute('data-ol-id')); if (it0) { var tmp = D.createElement('div'); tmp.innerHTML = rowHtml(it0); var bd = tmp.querySelector('.ol-body'); if (bd) { d.appendChild(bd); d.removeAttribute('data-ol-lazy'); } } } } }, true);   /* patch LEADFREEZE-6 */")

# ── 7. the duplicate sweep (every minute, on leads / customers / vendors / subs): it compared every row with every kept row
#       (782 leads = 300,000 name normalisations, 3-5 s). Same answer, found through an index on name / e-mail / phone. ─────
E('dupes index fn',
  "function collapse(rows, L){\n  if(!Array.isArray(rows) || rows.length<2) return null;\n  var keepers=[], dropped=[], review=[];\n",
  "/* patch LEADFREEZE-7: the first kept row that samePerson() would match, found without comparing against every kept row.\n"
  "   samePerson(k, r): same name key; or (either has no name) same e-mail or same 10-digit phone. */\n"
  "function personIndex(){\n"
  "  var K=[], N={}, E={}, P={}, U=[];\n"
  "  function put(m, key, i){ (m[key]||(m[key]=[])).push(i); }\n"
  "  function drop(m, key, i){ var a=m[key]; if(!a) return; var j=a.indexOf(i); if(j>=0) a.splice(j,1); }\n"
  "  return {\n"
  "    add: function(i, r){ var n=nameKey(r), e=emailKey(r), p=phoneKey(r); K[i]=[n,e,p]; if(n) put(N,n,i); else U.push(i); if(e) put(E,e,i); if(p) put(P,p,i); },\n"
  "    remove: function(i){ var k=K[i]; if(!k) return; if(k[0]) drop(N,k[0],i); else { var j=U.indexOf(i); if(j>=0) U.splice(j,1); } if(k[1]) drop(E,k[1],i); if(k[2]) drop(P,k[2],i); K[i]=null; },\n"
  "    find: function(r){\n"
  "      var n=nameKey(r), e=emailKey(r), p=phoneKey(r), best=-1, a, x;\n"
  "      if(n){\n"
  "        a=N[n]; if(a) for(x=0;x<a.length;x++) if(best<0||a[x]<best) best=a[x];\n"
  "        if(e && (a=E[e])) for(x=0;x<a.length;x++) if(!K[a[x]][0] && (best<0||a[x]<best)) best=a[x];\n"
  "        if(p && (a=P[p])) for(x=0;x<a.length;x++) if(!K[a[x]][0] && (best<0||a[x]<best)) best=a[x];\n"
  "      } else {\n"
  "        if(e && (a=E[e])) for(x=0;x<a.length;x++) if(best<0||a[x]<best) best=a[x];\n"
  "        if(p && (a=P[p])) for(x=0;x<a.length;x++) if(best<0||a[x]<best) best=a[x];\n"
  "      }\n"
  "      return best;\n"
  "    }\n"
  "  };\n"
  "}\n"
  "function collapse(rows, L){\n  if(!Array.isArray(rows) || rows.length<2) return null;\n  var keepers=[], dropped=[], review=[];\n"
  "  var IX = (L.same===samePerson && !L.careful) ? personIndex() : null;   /* patch LEADFREEZE-7 */\n")
E('dupes find',
  "    var hit=-1;\n    for(var k=0;k<keepers.length;k++){\n      var ok=false; try{ ok = L.same(keepers[k], r); }catch(e){ ok=false; }\n      if(ok){ hit=k; break; }\n    }\n    if(hit<0){ keepers.push(r); continue; }\n",
  "    var hit=-1;\n    if(IX){ try{ hit = IX.find(r); }catch(e){ hit=-1; } }\n"
  "    else for(var k=0;k<keepers.length;k++){\n      var ok=false; try{ ok = L.same(keepers[k], r); }catch(e){ ok=false; }\n      if(ok){ hit=k; break; }\n    }\n"
  "    if(hit<0){ keepers.push(r); if(IX) IX.add(keepers.length-1, r); continue; }\n")
E('dupes survivor',
  "      absorbAll(r, keepers[hit]); dropped.push(keepers[hit]); keepers[hit]=r;\n    }else{\n      absorbAll(keepers[hit], r); dropped.push(r);\n    }\n",
  "      absorbAll(r, keepers[hit]); dropped.push(keepers[hit]); keepers[hit]=r; if(IX){ IX.remove(hit); IX.add(hit, r); }\n    }else{\n      absorbAll(keepers[hit], r); dropped.push(r); if(IX){ IX.remove(hit); IX.add(hit, keepers[hit]); }\n    }\n")

for name, find, repl in EDITS:
    n = src.count(find)
    assert n == 1, (name, 'find-string count != 1', n)
    src = src.replace(find, repl)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path, len(EDITS), 'edits')
