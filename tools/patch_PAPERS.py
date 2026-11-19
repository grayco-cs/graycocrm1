#!/usr/bin/env python3
"""Idempotent patch PAPERS: papers to send — older jobs keep only the basics, papers are suggested, the PM first
(owner 11/19: his phone said "Needs you · 📑 285 papers to send", every one OVERDUE, mostly on jobs from before the papers existed).

1. tools/papers_block.html becomes a script right after JOBREQ (the last of the papers blocks): window._gcPapers — the older-job
   rule (OLDER_BEFORE), the basics, PM → office (ESC_OFFICE_BD business days) → admins (ESC_ADMIN_BD; never in data-entry mode),
   the "suggested" wording, the per-job ↩ Turn them back on (admins). It wraps _gcEpaHud.cardTop / dueHtml.
2. One-line hooks (each falls back to the old code when window._gcPapers is not there):
   JOBDOCS stateOfItem → "Not needed (older job)" (no Undo on that row); EPAHUD fieldModel / wanted → the routing;
   the Field Needs-you heading / row wording; the sweep's reason when it ticks off a To-Do it no longer wants.
Nothing is written to any job by the rule itself; dropped papers stay on the job's 📑 Paperwork.
Usage: python3 tools/patch_PAPERS.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_PAPERS__' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

PP = 'W._gcPapers'
# JOBDOCS: a paper an older job does not keep → "Not needed (older job)" (after done / signed / N/A / sent: those still show as they are)
src = once(src, """  if (se) return { sent: true, txt: '📤 Sent ' + nice(se.on) + ' — waiting' };
  return null;
}
function handled(p, x){ return !!stateOfItem(p, x); }""", """  if (se) return { sent: true, txt: '📤 Sent ' + nice(se.on) + ' — waiting' };
  try { var pp = W._gcPapers && W._gcPapers.itemState(p, x); if (pp) return pp; } catch (e) {}   /* PAPERS: an older job keeps only the basics */
  return null;
}
function handled(p, x){ return !!stateOfItem(p, x); }""")
src = once(src, """(st && !st.sent ? '<button type="button" data-jd="undo">Undo</button>' :""",
              """(st && !st.sent ? (st.older ? '' : '<button type="button" data-jd="undo">Undo</button>') :""")
# EPAHUD: GrayCo Field Needs you — the PM first, then the office, then the admins
src = once(src, """function fieldModel(){
  var out = []; myPmJobs()""", """function fieldModel(){
  if (W._gcPapers && W._gcPapers.fieldModel) { try { return W._gcPapers.fieldModel(); } catch (e) { W.__gcEpErr = String(e && e.stack || e); } }   /* PAPERS: PM → office → admins */
  var out = []; myPmJobs()""")
src = once(src, "return [z.p.id, z.x.k, z.d.date, z.d.over]; })", "return [z.p.id, z.x.k, z.d.date, z.d.over, z.esc || '']; })")
src = once(src, """h += '<div class="fh-sec"><span>Needs you · 📑 ' + M.length + ' paper' + (M.length === 1 ? '' : 's') + ' to send</span></div>';""",
              """h += '<div class="fh-sec"><span>' + (W._gcPapers ? esc(W._gcPapers.head(M)) : 'Needs you · 📑 ' + M.length + ' paper' + (M.length === 1 ? '' : 's') + ' to send') + '</span></div>';   /* PAPERS: suggested */""")
src = once(src, """'</b><span style="display:block;font-size:12.5px;color:' + (z.d.over ? '#b91c1c' : '#475569') + '">' + (z.d.date ? (z.d.over ? 'OVERDUE — was due ' : 'Due ') + esc(nice(z.d.date)) : 'Due ' + esc(z.d.txt)) + (z.esc ? ' · office' : '') + '</span></div>""",
              """'</b>' + (W._gcPapers ? W._gcPapers.rowDue(z) : '<span style="display:block;font-size:12.5px;color:' + (z.d.over ? '#b91c1c' : '#475569') + '">' + (z.d.date ? (z.d.over ? 'OVERDUE — was due ' : 'Due ') + esc(nice(z.d.date)) : 'Due ' + esc(z.d.txt)) + (z.esc ? ' · office' : '') + '</span>') + '</div>""")
# EPAHUD: the To-Dos follow the same routing; a To-Do no longer wanted is ticked off with the reason (kept, never removed)
src = once(src, """function wanted(){
  var want = {}, mine = low(me());""", """function wanted(){
  if (W._gcPapers && W._gcPapers.wanted) { try { return W._gcPapers.wanted(); } catch (e) { W.__gcEpErr = String(e && e.stack || e); } }   /* PAPERS: PM → office → admins */
  var want = {}, mine = low(me());""")
src = once(src, "y.resolution = 'sent / handled on 📑 Paperwork';",
              "y.resolution = (W._gcPapers && W._gcPapers.closeWhy ? W._gcPapers.closeWhy(y) : '') || 'sent / handled on 📑 Paperwork';")

# ── TD2 (the one To-Do): older jobs' auto To-Dos are off; ✓ Not needed archives (row ⋯ menu + the admins' bulk tool on the desk) ──
src = once(src, "  try { if (typeof W._gcQbFactDrop === 'function') { var qbCtx = { owner: isAdmin() && !isOffice() }; raw = raw.filter(function(r){ return !W._gcQbFactDrop(r, qbCtx); }); } } catch (e) { warn(e); }   /* patch QBFACT */",
  "  try { if (typeof W._gcQbFactDrop === 'function') { var qbCtx = { owner: isAdmin() && !isOffice() }; raw = raw.filter(function(r){ return !W._gcQbFactDrop(r, qbCtx); }); } } catch (e) { warn(e); }   /* patch QBFACT */\n"
  "  try { if (W._gcPapers && W._gcPapers.todoDrop) raw = raw.filter(function(r){ return !W._gcPapers.todoDrop(r, proj); }); } catch (e) { warn(e); }   /* PAPERS: an older job's auto To-Dos are off */")
src = once(src, "      if (!t || !t.id || t.done || t.deleted) return;\n      if (n === AT && !company) return;",
  "      if (!t || !t.id || t.done || t.deleted || t.archived) return;   /* PAPERS: ✓ Not needed (archived) stays off, even if its generator opens it again */\n      if (n === AT && !company) return;")
src = once(src, "'\" data-k=\"' + esc(it.key) + '\">'\n    + '<input type=\"checkbox\" class=\"td2-ck _todoChk\"",
  "'\" data-k=\"' + esc(it.key) + '\">' + (W._gcPapers && W._gcPapers.selBox ? W._gcPapers.selBox(it, depth) : '')   /* PAPERS: bulk select (admins, desk) */\n    + '<input type=\"checkbox\" class=\"td2-ck _todoChk\"")
src = once(src, "'</span>' + (extra || '') + '</button><div class=\"td2-sbody\">'",
  "'</span>' + (extra || '') + '</button>' + (W._gcPapers && W._gcPapers.selAll ? W._gcPapers.selAll(id) : '') + '<div class=\"td2-sbody\">'")
src = once(src, "  var bh = bodyHtml(st, kind);", "  var bh = (W._gcPapers && W._gcPapers.bar ? W._gcPapers.bar(kind) : '') + bodyHtml(st, kind);   /* PAPERS: ☑ Select · 🗄 Show archived */")
src = once(src, "    if (a === 'snooze') snooze(it, v); else if (a === 'to') reassign(it, v); else if (a === 'del') remove(it);",
  "    if (a === 'snooze') snooze(it, v); else if (a === 'to') reassign(it, v); else if (a === 'del') remove(it);\n    else if (a === 'na') { notNeeded(it, true); paint(true); toast('✓ Not needed (archived): ' + it.title.slice(0, 60), function(){ notNeeded(it, false); paint(true); }); }   /* PAPERS */")
src = once(src, "    + '<div class=\"td2-mr\"><button type=\"button\" class=\"del\" data-m=\"del\">🗑 Delete'",
  "    + '<div class=\"td2-mr\"><button type=\"button\" data-m=\"na\">✓ Not needed (archive)</button></div>'   /* PAPERS */\n    + '<div class=\"td2-mr\"><button type=\"button\" class=\"del\" data-m=\"del\">🗑 Delete'")
src = once(src, "function menu(it, btn, root){", r"""/* PAPERS: ✓ Not needed — archived, never deleted: a saved To-Do keeps its record (done, archived, notNeeded {by, at}); a generated one
   is marked in gc_todo_meta (del + na, kept forever: metaPrune keeps del marks) so its generator never brings it back. on = false restores. */
function notNeeded(it, on){
  if (!it || vasRefuse()) return;
  var by = myName(), at = nowIso(), seen = {};
  var one = function(m){
    if (!m || !m.key || seen[m.key]) return; seen[m.key] = 1;
    if (m.store) { storeMut(m.store.n, m.store.id, function(t){ if (on) { t.done = true; t.archived = true; t.notNeeded = { by: by, at: at }; t.doneAt = at; t.doneBy = by + ' (not needed)'; } else { t.done = false; t.archived = false; t.restored = { by: by, at: at }; t.doneAt = ''; t.doneBy = ''; } }); return; }
    if (m.src === 'roll') return;   /* a roll-up line is its members: a new member of the same kind still shows */
    metaSet(m.key, on ? { del: true, na: true, sig: m.sig, title: s(m.title).slice(0, 160), pid: s(m.pid) } : { del: false, na: false });
  };
  [it].concat(it.members || []).forEach(one);
  (it.children || []).forEach(function(c){ [c].concat(c.members || []).forEach(one); });
  dirty = true;
}
function archivedList(){
  var out = [];
  Object.keys(meta).forEach(function(k){ var x = meta[k]; if (x && x.na && x.del) out.push({ key: k, title: s(x.title) || k, pid: s(x.pid), by: s(x.by), at: s(x.at) }); });
  [OT, AT].forEach(function(n){ storeList(n).forEach(function(t){ if (t && t.archived && !t.deleted) out.push({ key: 'st:' + n + ':' + s(t.id), title: s(t.label), pid: s(t.pid), by: s(obj(t.notNeeded).by), at: s(obj(t.notNeeded).at) }); }); });
  return out.sort(function(a, b){ return s(b.at) < s(a.at) ? -1 : 1; });
}
function restoreKey(k){ var m = /^st:([^:]+):(.+)$/.exec(s(k)); if (m) notNeeded({ key: k, store: { n: m[1], id: m[2] } }, false); else notNeeded({ key: k, sig: '' }, false); }
function menu(it, btn, root){""")
src = once(src, "  find: function(re){ re = re instanceof RegExp ? re : new RegExp(String(re), 'i'); return state(true).all.filter(function(x){ return re.test(x.title); }); }\n};",
  "  find: function(re){ re = re instanceof RegExp ? re : new RegExp(String(re), 'i'); return state(true).all.filter(function(x){ return re.test(x.title); }); },\n"
  "  /* PAPERS: ✓ Not needed (archive) by item key — the rows on screen; archived() lists them; restore(key) brings one back */\n"
  "  notNeeded: function(keys, on){ var n = 0; arr(keys).forEach(function(k){ if (on === false) { restoreKey(k); n++; return; } var it = ITEMS[k]; if (it) { notNeeded(it, true); n++; } }); dirty = true; paint(true); return n; },\n"
  "  archived: function(){ return archivedList(); }, restore: function(k){ restoreKey(k); dirty = true; paint(true); return true; }\n};")

# ── TD2: on the desk every group opens collapsed; open / closed is remembered for this page session only ──
src = once(src, "  var col = UI.col[id] != null ? UI.col[id] : !!collapsedDefault;",
  "  var col = W._gcPapers && W._gcPapers.colOf ? W._gcPapers.colOf(id, UI.col[id], collapsedDefault) : (UI.col[id] != null ? UI.col[id] : !!collapsedDefault);   /* PAPERS: desk groups start collapsed */")
src = once(src, "UI.col[id] = !secEl.classList.contains('col'); secEl.classList.toggle('col', UI.col[id]); uiSave(); return; }",
  "UI.col[id] = !secEl.classList.contains('col'); secEl.classList.toggle('col', UI.col[id]); uiSave(); try { if (W._gcPapers && W._gcPapers.colSet) W._gcPapers.colSet(id, UI.col[id]); } catch (x) {} return; }")

# JOBDOCS: a "before work starts" paper with no timing rule — suggested, not a red "Was due before"
src = once(src, """(start ? (start < today() ? '<span class="bad">Was due before ' + esc(nice(start)) + '</span>' : '<span class="due">Due before ' + esc(nice(start)) + '</span>')""",
  """(start ? (W._gcPapers ? '<span class="' + (x.gate && start < today() ? 'bad' : 'due') + '">' + (x.gate ? 'Required before ' : 'Suggested before ') + esc(nice(start)) + (start < today() ? ' — not sent yet' : '') + '</span>' : start < today() ? '<span class="bad">Was due before ' + esc(nice(start)) + '</span>' : '<span class="due">Due before ' + esc(nice(start)) + '</span>')""")

BLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'papers_block.html'), encoding='utf-8').read().rstrip('\n')
a = src.index('<script id="gc-patch-jobreq">'); b = src.index('</script>', a) + len('</script>')
src = src[:b] + '\n' + BLOCK + src[b:]
open(path, 'w', encoding='utf-8').write(src)
print('patched')
