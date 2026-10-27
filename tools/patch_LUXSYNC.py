#!/usr/bin/env python3
"""Idempotent patch LUXSYNC: two small fixes on the new Leads screen (LEADSUX / LUXFIX).

 * Assign / reassign / bulk assign / stage change / mark contacted push the lead list to the cloud right away.
   Every one of them saves through the Leads engine's persist(); persist() now also asks the live push (patch N's
   window._gcLivePush('leads'), the same immediate path the old hub's other lead savers use) to send the list, debounced
   (250 ms) so a burst of saves is one push. The live push reads the cloud row and writes a union, so the write goes
   through the SCALE20 compare-and-set gate (a PATCH on the version read; never a blind write).
   A bulk assign saves every selected lead in ONE write (patchMany): one save, one push, instead of one per lead.
 * Saved Leads filters that come back on the next visit (an estimator's stage / due date / unassigned-only, two of them
   behind "More filters") no longer leave an empty list with no visible reason: the Leads list and the Bids list show a
   "Filters on (N) · Clear all" chip whenever a non-default filter is on, and an empty list says
   "No leads match your filters — Clear filters" (with the button).
Every find-string must occur exactly once (else nothing is written).  Usage: python3 tools/patch_LUXSYNC.py [index.html]
"""
import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '/* patch LUXSYNC */'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_LEADSUX__' in src, 'patch LEADSUX must be applied first'
assert '/* patch LUXFIX */' in src, 'patch LUXFIX must be applied first'
assert 'window._gcLivePush = function(k)' in src, 'the live push (patch N) must be present'

EDITS = []
def once(old, new, label):
    EDITS.append((old, new, label))

# ── 1. the Leads engine (gc-patch-leads): an immediate, debounced live push after every save; bulk = one save
once("W._gcManualNow('lead edited'); } catch (e) {}\n"
     "  try { if (typeof W.idbSet === 'function') W.idbSet('leads', list); } catch (e) {}\n"
     "  try { if (typeof W._supaUpsert === 'function') W._supaUpsert('leads', list); } catch (e) {}\n",
     "W._gcManualNow('lead edited'); } catch (e) {}\n"
     "  try { if (typeof W.idbSet === 'function') W.idbSet('leads', list); } catch (e) {}\n"
     "  try { if (typeof W._supaUpsert === 'function') W._supaUpsert('leads', list); } catch (e) {}\n"
     "  luxPush();   " + MARK + "\n",
     'persist pushes')
once("function patchLead(id, fn2){\n  return setLeads(function(list){\n    var i = -1; list.forEach(function(l, k){ if (l && l.id === id) i = k; });",
     "/* patch LUXSYNC: an assign / stage change / contacted is in the cloud within about a second (other computers see it in a few\n"
     "   seconds), not with the next regular sync. The live push (patch N) reads the cloud row and writes the union, so it goes\n"
     "   through the SCALE20 compare-and-set; a burst of saves (a bulk assign) is one push. */\n"
     "var LPT = 0;\n"
     "function luxPush(){ try { if (LPT) W.clearTimeout(LPT); } catch (e) {} LPT = later(function(){ LPT = 0; try { if (typeof W._gcLivePush === 'function') W._gcLivePush('leads'); } catch (e) {} }, 250); }\n"
     "/* patch LUXSYNC: every patchLead() made inside run() is saved in ONE write (a bulk assign: one save, one push) */\n"
     "var LUXB = null;\n"
     "function patchMany(run){\n"
     "  var b = LUXB = []; try { run(); } finally { LUXB = null; }\n"
     "  if (!b.length) return Promise.resolve(0);\n"
     "  return setLeads(function(list){\n"
     "    var at = {}, any = false; list.forEach(function(l, k){ if (l && l.id != null) at[String(l.id)] = k; });\n"
     "    b.forEach(function(x){ x.ok = false; var i = at[String(x.id)]; if (i == null) return; var l = Object.assign({}, list[i]); if (x.fn2(l) === false) return; l.updatedAt = nowIso(); list[i] = l; x.ok = any = true; });\n"
     "    if (!any) return null; LEADS_NOW = list; LEADS_SIG = ''; return list;\n"
     "  }).then(function(ok){ var n = 0; b.forEach(function(x){ var y = !!(ok && x.ok); if (y) n++; x.res(y); }); return n; });\n"
     "}\n"
     "function patchLead(id, fn2){\n  if (LUXB) return new Promise(function(res){ LUXB.push({ id: id, fn2: fn2, res: res }); });   " + MARK + "\n"
     "  return setLeads(function(list){\n    var i = -1; list.forEach(function(l, k){ if (l && l.id === id) i = k; });",
     'patchLead batch')
once("    ids.reduce(function(pr, id){ return pr.then(function(n){ return assign(id, to).then(function(ok){ return n + (ok ? 1 : 0); }); }); }, Promise.resolve(0))",
     "    (ids.length > 1 ? (function(){ var ps = []; patchMany(function(){ ids.forEach(function(id){ ps.push(assign(id, to)); }); }); return Promise.all(ps).then(function(r){ return r.filter(Boolean).length; }); })()   " + MARK + "\n"
     "      : ids.reduce(function(pr, id){ return pr.then(function(n){ return assign(id, to).then(function(ok){ return n + (ok ? 1 : 0); }); }); }, Promise.resolve(0)))",
     'bulk assign one save')

# ── 2. the new Leads / Bids screens (gc-patch-leadsux): "Filters on (N) · Clear all" + an empty state that says why
once(".lux-empty{padding:40px;text-align:center;color:var(--k-mut);border:1px dashed var(--k-bd);border-radius:14px;margin-top:20px}",
     ".lux-empty{padding:40px;text-align:center;color:var(--k-mut);border:1px dashed var(--k-bd);border-radius:14px;margin-top:20px}\n"
     ".lux-fon{display:flex;flex-wrap:wrap;align-items:center;gap:6px;width:fit-content;max-width:100%;margin:10px 0 0;padding:6px 12px;border-radius:999px;border:1px solid var(--k-acc);background:var(--k-soft);color:var(--k-tx);font-size:13px}   " + MARK + "\n"
     ".lux-fon[hidden]{display:none}\n"
     ".lux-fon b{color:var(--k-acc)}\n"
     ".lux-fon small{color:var(--k-mut);font-size:12px}\n"
     ".lux-fon button,.lux-empty button{border:0;background:none;color:var(--k-acc2);text-decoration:underline;font:inherit;font-weight:700;cursor:pointer;padding:2px 4px;min-height:32px}",
     'css')
once("    + '<div class=\"lux-filters\" data-lux=\"filters\" hidden></div><div data-lux=\"body\"></div></div>';",
     "    + '<div class=\"lux-fon\" data-lux=\"fon\" role=\"status\" hidden></div>'   " + MARK + "\n"
     "    + '<div class=\"lux-filters\" data-lux=\"filters\" hidden></div><div data-lux=\"body\"></div></div>';",
     'leads skeleton chip')
once("  if (!g.total) h += '<div class=\"lux-empty\">No leads match. Clear a filter or a chip to see more.</div>';",
     "  if (!g.total) h += activeFilters().length ? '<div class=\"lux-empty\">No leads match your filters — <button type=\"button\" data-lux-act=\"clearf\">Clear filters</button></div>'   " + MARK + "\n"
     "    : '<div class=\"lux-empty\">No leads to show.</div>';",
     'leads empty state')
once("  else if (a === 'menu') { UX.menu = true; }",
     "  else if (a === 'menu') { UX.menu = true; }\n"
     "  else if (a === 'clearf') { clearFilters(); }   " + MARK,
     'leads clear action')
once("  setHtml(q1('[data-lux=chips]'), chipsHtml());",
     "  setHtml(q1('[data-lux=chips]'), chipsHtml());\n"
     "  var fo = q1('[data-lux=fon]'), af = activeFilters(); setHidden(fo, !af.length); if (af.length) setHtml(fo, fonHtml(af));   " + MARK,
     'leads chip render')
once("function menuHtml(){",
     "/* patch LUXSYNC: which filters are on (not the role's default), the chip that says so, and Clear all */\n"
     "function whoDefault(e){ return e.myScope().kind === 'mine' ? '__me' : ''; }   /* the role's own start (patch LUXFIX roleDefaults) */\n"
     "function activeFilters(){\n"
     "  var e = E(); if (!e) return []; var u = e.ui(), f = [], CHN = { 'new': 'New', 'bids': 'Bids due this week', 'un': 'Unassigned', 'fu': 'Follow-ups today' };\n"
     "  var DUE = { '7': 'Due in 7 days', '30': 'Due in 30 days', past: 'Past due' }, PR = { hi: 'Priority 8–10', md: 'Priority 5–7', lo: 'Priority 1–4', none: 'No priority' };\n"
     "  if (UX.chip) f.push(CHN[UX.chip] || UX.chip);\n"
     "  if (s(u.q).trim()) f.push('Search “' + s(u.q).trim().slice(0, 24) + '”');\n"
     "  if (u.who && u.who !== whoDefault(e)) f.push(u.who === '__me' ? 'Mine' : u.who === '__mybids' ? 'My bids' : 'Assignee: ' + u.who);\n"
     "  if (u.type) f.push('Type: ' + u.type);\n"
     "  if (u.stage) f.push('Stage: ' + u.stage);\n"
     "  if (u.src) f.push('Source: ' + u.src);\n"
     "  if (u.prio) f.push(PR[u.prio] || 'Priority');\n"
     "  if (u.due) f.push(DUE[u.due] || 'Bid due date');\n"
     "  if (u.un) f.push('Unassigned only');\n"
     "  if (u.closed) f.push('Lost / closed shown');\n"
     "  if (u.exp) f.push('Expired');\n"
     "  if (u.imp) f.push('Imported');\n"
     "  if (u.arch) f.push('Archived');\n"
     "  if (u.preset === 'bids' && !e.amEstimator()) f.push('Bids only');\n"
     "  return f;\n"
     "}\n"
     "function fonHtml(f){ return '<b>Filters on (' + f.length + ')</b><small>' + esc(f.join(' · ')) + '</small><span aria-hidden=\"true\">·</span><button type=\"button\" data-lux-act=\"clearf\">Clear all</button>'; }\n"
     "function clearFilters(){\n"
     "  var e = E(); if (!e) return; var u = e.ui();\n"
     "  UX.chip = ''; uxSave();\n"
     "  u.q = ''; QV = ''; if (QT) { try { W.clearTimeout(QT); } catch (x) {} QT = 0; } var qi = LUX.root && q1('[data-lux=q]'); if (qi) qi.value = '';\n"
     "  u.who = whoDefault(e); u.type = ''; u.stage = ''; u.src = ''; u.prio = ''; u.due = ''; u.un = false; u.closed = false; u.exp = false; u.imp = false; u.arch = false;\n"
     "  if (!e.amEstimator() && u.preset === 'bids') u.preset = 'all';\n"
     "  UX.more = { na: 30, ip: 30, bd: 30, cl: 30 };\n"
     "  e.saveUI(); toast('Filters cleared');\n"
     "}\n"
     "function bidFilters(){ var f = []; if (s(UX.bq).trim()) f.push('Search “' + s(UX.bq).trim().slice(0, 24) + '”'); if (UX.bMine) f.push('Mine'); if (UX.bdue) f.push({ '7': 'Due in 7 days', '30': 'Due in 30 days', past: 'Past due' }[UX.bdue] || 'Due date'); return f; }\n"
     "function clearBidFilters(){ UX.bq = ''; BQV = ''; if (BQT) { try { W.clearTimeout(BQT); } catch (x) {} BQT = 0; } UX.bMine = false; UX.bdue = ''; UX.bMore = 50; var i = LUX.bids && LUX.bids.querySelector('[data-lux=bq]'); if (i) i.value = ''; }\n"
     "function menuHtml(){",
     'filter helpers')
once("    + '<div data-lux=\"bbody\"></div>';",
     "    + '<div class=\"lux-fon\" data-lux=\"bfon\" role=\"status\" hidden></div>'   " + MARK + "\n"
     "    + '<div data-lux=\"bbody\"></div>';",
     'bids skeleton chip')
once(": '<div class=\"lux-empty\">No bids match.</div>')",
     ": bidFilters().length ? '<div class=\"lux-empty\">No bids match your filters — <button type=\"button\" data-lux-bact=\"clearf\">Clear filters</button></div>' : '<div class=\"lux-empty\">No bids to show.</div>')   " + MARK,
     'bids empty state')
once("      else if (k === 'more') UX.bMore += 50;",
     "      else if (k === 'more') UX.bMore += 50;\n"
     "      else if (k === 'clearf') clearBidFilters();   " + MARK,
     'bids clear action')
once("  setHtml(b.querySelector('[data-lux=bbody]'), bidsHtml());",
     "  var bfo = b.querySelector('[data-lux=bfon]'), bf = bidFilters(); setHidden(bfo, !bf.length); if (bf.length) setHtml(bfo, '<b>Filters on (' + bf.length + ')</b><small>' + esc(bf.join(' · ')) + '</small><span aria-hidden=\"true\">·</span><button type=\"button\" data-lux-bact=\"clearf\">Clear all</button>');   " + MARK + "\n"
     "  setHtml(b.querySelector('[data-lux=bbody]'), bidsHtml());",
     'bids chip render')

bad = []
for old, new, label in EDITS:
    n = src.count(old)
    if n != 1: bad.append('%s: find-string found %d times' % (label, n))
if bad:
    print('NOT PATCHED:\n  ' + '\n  '.join(bad)); sys.exit(1)
for old, new, label in EDITS:
    src = src.replace(old, new, 1)
open(path, 'w', encoding='utf-8').write(src)
print('patched LUXSYNC: %d edits' % len(EDITS))
