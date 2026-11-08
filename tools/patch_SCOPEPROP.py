#!/usr/bin/env python3
"""patch SCOPEPROP (owner 11/5: "i want a created scope from our proposals for each sub and ability to edit the scope
before i put it in their portal"). The sub's 🧾 Scope editor (Subs & portal → the sub → 🧾 Create scope) gets
"📝 Draft from our proposal (<trade>)": it fills the lines from the job's estimate / proposal lines in the sub's trade
(the job's estimate by job id, PO or name) — the work and quantities only, NEVER our prices. The PM / owner edits it,
then Save draft / Send for approval as before (nothing reaches the portal until it is approved)."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*SCOPEPROP*/' in src: print('already patched'); sys.exit(0)
def rep(o, n):
    global src
    assert src.count(o) == 1, o[:60]; src = src.replace(o, n)
rep("  function scSources(){ return (Array.isArray(p.subScopes) ? p.subScopes : []).filter(function(z){ return z && Array.isArray(z.lines) && z.lines.length; }); }",
    "  function scSources(){ return (Array.isArray(p.subScopes) ? p.subScopes : []).filter(function(z){ return z && Array.isArray(z.lines) && z.lines.length; }); }\n"
    "  /*SCOPEPROP*/ function propLines(){ try {\n"
    "    var E = (window._gcEST && window._gcEST.all) ? window._gcEST.all() : (window._gcEstimatesState || (window._crm && window._crm.estimates) || []);\n"
    "    var codes = [p.po, p.autoPO].filter(Boolean).map(function(c){ return String(c).toLowerCase(); }), nm = String(p.name || '').toLowerCase();\n"
    "    var mine = (Array.isArray(E) ? E : []).filter(function(e){ return e && !e._isDraft && (String(e.pid || e.projectId || '') === String(pid) || (e.po && codes.indexOf(String(e.po).toLowerCase()) > -1) || (nm && String(e.name || '').toLowerCase() === nm)); });\n"
    "    if (!mine.length) return [];\n"
    "    var est = mine.sort(function(a, b){ return String(b.savedAt || b.updatedAt || '') < String(a.savedAt || a.updatedAt || '') ? -1 : 1; })[0];\n"
    "    var tr = String(sb.trade || sb.cat || '').toLowerCase().replace(/[^a-z ]/g, ' ').trim(), words = tr.split(/\\s+/).filter(function(w){ return w.length > 2; });\n"
    "    var fit = function(cat){ cat = String(cat || '').toLowerCase(); return !words.length || words.some(function(w){ return cat.indexOf(w) > -1 || (cat && w.indexOf(cat) > -1); }); };\n"
    "    var seen = {}, out = [];\n"
    "    (est.lines || []).concat((est.labor || []).map(function(l){ return { cat: l.cat, desc: l.desc, qty: '', unit: '' }; })).forEach(function(l){ if (!l || !fit(l.cat)) return; var d = String(l.desc || l.name || '').replace(/\\s+/g, ' ').trim(); if (!d || seen[d.toLowerCase()]) return; seen[d.toLowerCase()] = 1; out.push({ room: String(l.cat || ''), desc: d, meas: '', qty: l.qty == null ? '' : l.qty, unit: l.unit || '' }); });\n"
    "    return out.slice(0, 80);\n"
    "  } catch (e) { return []; } }")
rep("      (src.length ? '<div class=\"gcsub-cta\"><select class=\"gcsub-inp\" id=\"sc-src\">",
    "      (propLines().length ? '<div class=\"gcsub-cta\"><button type=\"button\" class=\"gcsub-btn g\" id=\"sc-prop\">📝 Draft from our proposal (' + esc(sb.trade || 'all trades') + ' · ' + propLines().length + ' lines)</button><span class=\"gcsub-muted\">Work and quantities only — never our prices. Edit before sending.</span></div>' : '') +\n"
    "      (src.length ? '<div class=\"gcsub-cta\"><select class=\"gcsub-inp\" id=\"sc-src\">")
rep("    if (t.id === 'sc-add') { read(); lines.push(",
    "    if (t.id === 'sc-prop') { var keepP = read(); var pl = propLines(); var blank = lines.length === 1 && !lines[0].desc; lines = (blank ? [] : lines).concat(pl); paint(); restore(keepP); toast('Drafted ' + pl.length + ' lines from the proposal — check and edit them.'); return; }   /* SCOPEPROP */\n"
    "    if (t.id === 'sc-add') { read(); lines.push(")
open(P, 'w', encoding='utf-8').write(src); print('patched')
