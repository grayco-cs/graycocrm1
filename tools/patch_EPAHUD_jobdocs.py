#!/usr/bin/env python3
"""EPAHUD: builds on 📑 JOBDOCS (the paperwork-by-job-type table) — the EPA / HUD papers in the table (lead, asbestos), their
conditions, who each goes to and when it is due (epahud-core.js), the admin's saved table picks up the new papers, the editor keeps
the new fields, the job card shows the due dates + 📤 Send… (portal / e-mail / text / share) and 🏛 Filed for agency filings.
Idempotent (each replacement checks its marker). Run: python3 tools/patch_EPAHUD_jobdocs.py index.html"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
h = open(p, encoding='utf-8').read()
i = h.index('<script id="gc-patch-jobdocs">'); j = h.index('</script>', i)
s = h[i:j]

def rep(old, new, mark):
    global s
    if mark in s: return
    assert s.count(old) == 1, ('anchor', old[:80], s.count(old))
    s = s.replace(old, new)

# 1 · the core + the DEFAULT table gets the EPA / HUD papers
rep("var KV = 'gc_jobdocs_table', LK = 'gc_jobdocs_table_v1'",
    "var EP = W._gcEpaHudCore || null;   /* EPAHUD: the EPA / HUD papers, their recipients and timing (epahud-core.js) */\nvar KV = 'gc_jobdocs_table', LK = 'gc_jobdocs_table_v1'", 'var EP = W._gcEpaHudCore')
rep("""var CONDS = { construction:""",
    """/* EPAHUD: the lead and asbestos types get the EPA / HUD papers GrayCo was missing (the HUD hazard-reduction notice now has its form) */
if (EP) DEFAULT.types.forEach(function(r){ if (r.key !== 'lead' && r.key !== 'asbestos') return; r.items = r.items.filter(function(x){ return !(x.needsForm && /HUD notice of lead hazard reduction/i.test(x.label)); }).concat(EP.items(r.key)); });
/* EPAHUD: the state asbestos (NESHAP) notification is for a NESHAP facility (commercial / 5+ units) or a demolition — its own label says so */
if (EP) DEFAULT.types.forEach(function(r){ arr(r.items).forEach(function(x){ if (x.doc === 'gcb_env_asb_notification' && !arr(x.only).length) x.only = ['neshap']; }); });
var CONDS = { construction:""", 'EPAHUD: the lead and asbestos types get')
rep("abatement: 'lead abatement', hud: 'HUD-assisted', units5: 'commercial / 5+ units',",
    "abatement: 'lead abatement', hud: 'HUD-assisted', units5: 'commercial / 5+ units', commonArea: 'common areas (multi-unit)', tenantOccupied: 'owner does not live there', ebll: 'child with elevated blood lead', rrp: 'RRP (not abatement)', notifyStmt: 'common areas or child-occupied', occupantCopy: 'tenant / common area / child-occupied', hudOrAbatement: 'HUD-assisted or abatement', neshap: 'NESHAP facility (commercial / 5+ units / demolition)', demolition: 'demolition',",
    "commonArea: 'common areas (multi-unit)'")

# 2 · the admin's saved table: new built-in EPA / HUD papers are added once (unless the admin took them off — t.dropped)
rep("function table(){ if (TABLE) return TABLE; var v = null; try { v = JSON.parse(localStorage.getItem(LK) || 'null'); } catch (e) {} TABLE = valid(v) ? v : clone(DEFAULT); return TABLE; }",
    """/* EPAHUD: a table an admin saved before the EPA / HUD papers existed gets them (once; one the admin removed stays removed — t.dropped) */
function epMerge(t){
  if (!t || !valid(t)) return t; var drop = arr(t.dropped);
  DEFAULT.types.forEach(function(d){ var r = t.types.find(function(x){ return s(x.key) === s(d.key); }); if (!r) return; var have = {}; arr(r.items).forEach(function(x){ have[keyOf(x)] = 1; });
    arr(d.items).forEach(function(x){ if (!x.ep) return; var k = keyOf(x); if (have[k] || drop.indexOf(k) > -1) return; r.items.push(clone(x)); have[k] = 1; }); });
  return t;
}
function table(){ if (TABLE) return TABLE; var v = null; try { v = JSON.parse(localStorage.getItem(LK) || 'null'); } catch (e) {} TABLE = valid(v) ? epMerge(v) : clone(DEFAULT); return TABLE; }""", 'function epMerge(t)')
rep("function pull(){ return sb(KV).then(function(v){ if (valid(v) && s(v.at) !== s(table().at)) { TABLE = v;",
    "function pull(){ return sb(KV).then(function(v){ if (valid(v) && s(v.at) !== s(table().at)) { TABLE = epMerge(v);", 'TABLE = epMerge(v)')
rep("  var out = clone(t); out.v = 1; out.at = new Date().toISOString(); out.by = me();",
    """  var out = clone(t); out.v = 1; out.at = new Date().toISOString(); out.by = me();
  /* EPAHUD: the built-in EPA / HUD papers the admin took off stay off */
  var drop = arr(table().dropped).slice(); DEFAULT.types.forEach(function(d){ var r = out.types.find(function(x){ return s(x.key) === s(d.key); }); if (!r) return; var have = {}; arr(r.items).forEach(function(x){ have[keyOf(x)] = 1; }); arr(d.items).forEach(function(x){ var k = keyOf(x); if (x.ep && !have[k] && drop.indexOf(k) < 0) drop.push(k); if (have[k]) drop = drop.filter(function(z){ return z !== k; }); }); });
  if (drop.length) out.dropped = drop; else delete out.dropped;""", 'the built-in EPA / HUD papers the admin took off')

# 3 · the conditions
rep("function cond(p, c){\n  var a = la(p);",
    "function cond(p, c){\n  if (EP) { var e = EP.cond(p, c, function(k){ return cond(p, k); }); if (e !== null) return e; }   /* EPAHUD: hud, abatement, commonArea, tenantOccupied, ebll, rrp, neshap … (the job's 🏛 EPA / HUD facts, else the ☣️ card) */\n  var a = la(p);",
    'EPAHUD: hud, abatement, commonArea')

# 4 · want(): keep who it goes to / when it is due / the rule
rep("      if (gt) y.gate = true; if (x.la) y.la = s(x.la);",
    "      if (gt) y.gate = true; if (x.la) y.la = s(x.la);\n      if (EP) { var M = EP.meta(x); y.to = M.to; if (M.due) y.due = M.due; if (M.cite) y.cite = M.cite; if (x.ep) y.ep = 1; }   /* EPAHUD: recipient, timing, the rule */",
    'EPAHUD: recipient, timing, the rule')

# 5 · the editor keeps the new fields (who it goes to, when it is due, the rule)
rep("""    + '<input type="hidden" data-e="la" value="' + esc(x.la || '') + '"></div></div>';""",
    """    + (EP ? '<select data-e="to" title="Goes to" style="' + I + '">' + Object.keys(EP.TO).map(function(k){ var cur = s(x.to) || EP.meta(x).to; return '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>→ ' + esc(EP.TO[k].label) + '</option>'; }).join('') + '</select>'
      + '<select data-e="due" title="Due" style="' + I + '"><option value="">due: by the column</option>' + Object.keys(EP.DUE).map(function(k){ var cur = s(x.due) || EP.meta(x).due; return '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>due: ' + esc(EP.DUE[k].txt) + '</option>'; }).join('') + '</select>' : '')
    + '<input type="hidden" data-e="cite" value="' + esc(x.cite || '') + '"><input type="hidden" data-e="ep" value="' + (x.ep ? 1 : '') + '">'
    + '<input type="hidden" data-e="la" value="' + esc(x.la || '') + '"></div></div>';""", 'data-e="cite"')
rep("      if (g('gate').checked) x.gate = true; if (s(g('la').value)) x.la = s(g('la').value);",
    "      if (g('gate').checked) x.gate = true; if (s(g('la').value)) x.la = s(g('la').value);\n      [['to', 'to'], ['due', 'due'], ['cite', 'cite']].forEach(function(z){ var el = g(z[0]); if (el && s(el.value)) x[z[1]] = s(el.value); }); if (g('ep') && g('ep').value) x.ep = 1;   /* EPAHUD */",
    "[['to', 'to'], ['due', 'due'], ['cite', 'cite']]")

# 6 · the job card: due dates from the timing rules, who it goes to, 📤 Send… (channels) / 🏛 Filed, the 🏛 EPA / HUD facts
rep("      var due = w === 'before' ? (start ?",
    "      var due = (EP && W._gcEpaHud && W._gcEpaHud.dueHtml && (x.due || EP.meta(x).due)) ? W._gcEpaHud.dueHtml(p, x) : w === 'before' ? (start ?",
    'W._gcEpaHud.dueHtml(p, x)')
rep("""        + '<div class="tag">' + (x.who === 'file' ? 'job file / crew' : 'customer') + (x.stale ?""",
    """        + '<div class="tag">' + (EP && EP.TO[x.to || EP.meta(x).to] ? '→ ' + esc(EP.TO[x.to || EP.meta(x).to].label) + (x.cite ? ' · ' + esc(x.cite) : '') : x.who === 'file' ? 'job file / crew' : 'customer') + (x.stale ?""",
    "'→ ' + esc(EP.TO[x.to || EP.meta(x).to].label)")
rep("""        + (!st && x.doc && /^gcb_/.test(x.doc) && x.who !== 'file' ? '<button type="button" data-jd="send">📤 Send</button>' : '')""",
    """        + (W._gcEpaHud && W._gcEpaHud.sendBtn ? W._gcEpaHud.sendBtn(p, x, st) : (!st && x.doc && /^gcb_/.test(x.doc) && x.who !== 'file' ? '<button type="button" data-jd="send">📤 Send</button>' : ''))   /* EPAHUD: 📤 Send… (portal / e-mail / text / share) · 🏛 Filed */""",
    'EPAHUD: 📤 Send… (portal')
rep("""  if (em) h += '<div class="em">🚨 Emergency mitigation job""",
    """  try { if (W._gcEpaHud && W._gcEpaHud.cardTop) h += W._gcEpaHud.cardTop(p, items); } catch (e) {}   /* EPAHUD: 📑 N papers to send · 🏛 EPA / HUD facts · crew certified */
  if (em) h += '<div class="em">🚨 Emergency mitigation job""", 'EPAHUD: 📑 N papers to send')
rep("  if (a === 'send') { b.disabled = true; send(pid, k).then(function(){ b.disabled = false; }); return; }",
    "  if (a === 'send') { b.disabled = true; send(pid, k).then(function(){ b.disabled = false; }); return; }\n  if (a === 'ep' && W._gcEpaHud) { W._gcEpaHud.action(pid, k, b.getAttribute('data-ep'), b); return; }   /* EPAHUD */",
    "a === 'ep' && W._gcEpaHud")
rep("  if (a === 'edit') return openEditor();",
    "  if (a === 'edit') return openEditor();\n  if (a === 'facts' && W._gcEpaHud) return W._gcEpaHud.facts(pid);   /* EPAHUD: 🏛 EPA / HUD facts */",
    "a === 'facts' && W._gcEpaHud")
# 7 · API: the EPAHUD patch reads the table, the items and the state of a paper
rep("W._gcJobDocs = {", "W._gcJobDocs = { stateOfItem: stateOfItem, findItem: findItem, patchJD: patchJD, handled: handled, given: given, keyOf: keyOf,", 'stateOfItem: stateOfItem, findItem')

h = h[:i] + s + h[j:]
open(p, 'w', encoding='utf-8').write(h)
print('JOBDOCS patched')
