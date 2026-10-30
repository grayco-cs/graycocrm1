#!/usr/bin/env python3
"""Idempotent patch OFFICETAB (owner 10/30): the 🏢 Office tab becomes the place to oversee the office (admins) and to help
estimators and PMs keep up (admins and the office). See the header of tools/officetab.js.
• The To-Do (patch TD2) gains a host "as" (#gc-td2-as data-as=<e-mail>): another person's list from the same state —
  their visibility, their "📌 Yours", nothing waiting that was given to them — with its own Today / Everything choice.
  The admin's ticks, reassigns and snoozes go through the To-Do's own actions; on that host the ⋯ menu also edits a saved
  to-do's note and due date. A saved to-do with leadId opens its lead.
• The Leads hub shares its "Not contacted" test (window._gcLeadNC), so the PM board counts what the Leads page counts.
• tools/officetab.js goes in as <script id="gc-patch-officetab"> at the end of the page (replaced when it changes).
Usage: python3 tools/patch_OFFICETAB.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
MARK = '/* patch OFFICETAB'
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('OFFICETAB anchor', n, old[:90]); t = t.replace(old, new)

if MARK + ': host as' not in t:
    once("""  var f = D.getElementById('_gcTD2Ov'); if (f) out.push([f, 'field']);""",
         """  var f = D.getElementById('_gcTD2Ov'); if (f) out.push([f, 'field']);
  var as = D.getElementById('gc-td2-as'); if (as && as.isConnected && as.getAttribute('data-as')) out.push([as, 'as']);   """ + MARK + """: host as */""")
    once("""var painting = false;""",
         """/* patch OFFICETAB: host "as" — another person's list (the office's, on an admin's 🏢 Office tab), from the same state:
   their visibility and "Yours"; a saved to-do given to them is theirs, not "waiting". Its own view / filter (ASUI). */
var ASUI = { view: 'today', filter: '', groupBy: 'category' }, GUI = null, ASC = null;
function asIn(){ if (GUI) return false; GUI = { view: UI.view, filter: UI.filter, groupBy: UI.groupBy }; UI.view = ASUI.view; UI.filter = ASUI.filter; UI.groupBy = ASUI.groupBy; return true; }
function asOut(){ if (!GUI) return; ASUI = { view: UI.view === 'team' ? 'today' : UI.view, filter: UI.filter, groupBy: UI.groupBy }; UI.view = GUI.view; UI.filter = GUI.filter; UI.groupBy = GUI.groupBy; GUI = null; }
function asState(st, host){
  var key = low(host.getAttribute('data-as')), name = s(host.getAttribute('data-as-name'));
  if (ASC && ASC.src === st && ASC.key === key && ASC.name === name) return ASC.v;
  var k2 = pkey(key) || key, items = [], snz = [];
  arr(st.all).forEach(function(g){
    var mine = g.who.indexOf(k2) >= 0; if (g.vis === 'who' && !mine) return;
    var c = Object.assign({}, g, { mine: mine }); if (mine && c.waiting && c.src === 'st') c.waiting = false;
    if (c.snoozedTo) snz.push(c); else items.push(c);
  });
  var v = Object.assign({}, st, { items: items, snoozed: snz, admin: false, me: k2, asName: name || person(k2).name, asKey: k2 });
  var c = Object.assign({}, st.counts || {}); c.over = c.today = c.week = c.wait = c.total = c.mine = 0;
  items.forEach(function(g){ if (g.waiting) { c.wait++; return; } c.total++; if (g.dueCls === 'over') c.over++; else if (g.dueCls === 'today') c.today++; else if (g.dueCls === 'week') c.week++; if (g.mine) c.mine++; });
  c.apprRows = 0; c.todos = c.total; c.now = c.over + c.today; v.counts = c;
  ASC = { src: st, key: key, name: name, v: v }; return v;
}
function setNote(it, txt){ if (!it || !it.store || vasRefuse()) return; storeMut(it.store.n, it.store.id, function(t){ t.note = s(txt).slice(0, 1000); t.noteBy = myName(); t.noteAt = nowIso(); }); dirty = true; paint(true); toast('Note saved: ' + it.title.slice(0, 50)); }
function setDue(it, d){ if (!it || !it.store || vasRefuse()) return; storeMut(it.store.n, it.store.id, function(t){ t.due = s(d); t.dueSetBy = myName(); }); dirty = true; paint(true); toast(d ? 'Due ' + dueLabel(d) + ': ' + it.title.slice(0, 50) : 'No due date: ' + it.title.slice(0, 50)); }
var painting = false;""")
    once("""    hs.forEach(function(h){ try { var r = ensureRoot(h[0], h[1]); paintRoot(r, st); } catch (e) { warn(e); } });""",
         """    hs.forEach(function(h){ try {
      if (h[1] === 'as') { var did = asIn(); try { var ra = ensureRoot(h[0], 'as'); paintRoot(ra, asState(st, h[0])); } finally { if (did) asOut(); } return; }   /* patch OFFICETAB */
      var pz = !!GUI; if (pz) asOut();
      try { var r = ensureRoot(h[0], h[1]); paintRoot(r, st); } finally { if (pz) asIn(); }
    } catch (e) { warn(e); } });""")
    once("""  var who = myName() + (isOffice() ? ' (office)' : isAdmin() ? ' (admin)' : '');""",
         """  var who = st && st.asName ? st.asName + ' (office) — as she sees it' : myName() + (isOffice() ? ' (office)' : isAdmin() ? ' (admin)' : '');   /* patch OFFICETAB */""")
    once("""<div><div class="td2-big">✅ To-Do</div>""", """<div><div class="td2-big">' + (st && st.asName ? '✅ Office To-Do' : '✅ To-Do') + '</div>""")
    once("""section('t:yours', '📌 Yours' + (isOffice() ? ' — the office' : ''),""", """section('t:yours', st.asName ? '📌 ' + esc(st.asName) + '’s' : '📌 Yours' + (isOffice() ? ' — the office' : ''),""")
    once("""function uiSave(){ lsSet(UIK,""", """function uiSave(){ if (GUI) return; lsSet(UIK,""")
    once("""  root.addEventListener('click', function(e){
    var b = e.target.closest('[data-td2]'); if (!b || !root.contains(b)) return;""",
         """  root.addEventListener('click', function(e){ var _as = root.getAttribute('data-td2-host') === 'as' && asIn(); try { clickH(e); } finally { if (_as) asOut(); } });   /* patch OFFICETAB: the "as" host's own view */
  function clickH(e){
    var b = e.target.closest('[data-td2]'); if (!b || !root.contains(b)) return;""")
    once("""    if (a === 'fappr') { closeHostOverlay(root); call('_gcOpenPmApprovals'); return; }
  });""", """    if (a === 'fappr') { closeHostOverlay(root); call('_gcOpenPmApprovals'); return; }
  }""")
    once("""    + (it.pid ? '<div class="td2-mr"><button type="button" data-m="job">🏗 Open the job</button></div>' : '')""",
         """    + (it.store && root.getAttribute('data-td2-host') === 'as' ? '<div class="td2-ml">📝 Note</div><div class="td2-mr"><input type="text" data-m="noteTxt" maxlength="1000" style="flex:1;min-width:160px" value="' + esc(s(it.rec && it.rec.note)) + '"><button type="button" data-m="note">Save note</button></div>'
       + '<div class="td2-ml">📅 Due date</div><div class="td2-mr"><input type="date" data-m="dueDate" value="' + esc(it.due || '') + '" aria-label="Due date">' + (it.due ? '<button type="button" data-m="nodue">No due date</button>' : '') + '</div>' : '')   /* patch OFFICETAB */
    + (it.pid ? '<div class="td2-mr"><button type="button" data-m="job">🏗 Open the job</button></div>' : '')""")
    once("""    else if (a === 'job') { closeHostOverlay(root); later(function(){ run(actJob(it.pid).f); }, 30); }""",
         """    else if (a === 'job') { closeHostOverlay(root); later(function(){ run(actJob(it.pid).f); }, 30); }
    else if (a === 'note') { var ni = m.querySelector('[data-m="noteTxt"]'); setNote(it, ni ? ni.value : ''); }   /* patch OFFICETAB */
    else if (a === 'nodue') setDue(it, '');""")
    once("""  var di = m.querySelector('[data-m="snoozeDate"]');""",
         """  var dd = m.querySelector('[data-m="dueDate"]'); if (dd) dd.onchange = function(){ if (dd.value) { m.remove(); setDue(it, dd.value); } };   /* patch OFFICETAB */
  var di = m.querySelector('[data-m="snoozeDate"]');""")
    once("""      else if (t.pid) o.act = actJob(t.pid);""",
         """      else if (t.pid) o.act = actJob(t.pid);
      else if (t.leadId) o.act = { l: 'Open lead', f: function(){ go('leads'); later(function(){ try { if (W._gcLA && W._gcLA.edit) W._gcLA.edit(t.leadId); } catch (e) {} }, 450); } };   /* patch OFFICETAB */""")
    once("""function css(){ if (D.getElementById('gc-td2-css')) return;""",
         """CSS += '.td2-as{background:#f8fafc;border-radius:12px;padding:10px}.td2-as .td2-qa,.td2-as .td2-qp{display:none}.td2-as .td2-big{font-size:18px}';   /* patch OFFICETAB */
function css(){ if (D.getElementById('gc-td2-css')) return;""")
    once("""W._gcLeadsUI = { model: function(){""",
         """W._gcLeadNC = { contacted: contacted, shut: shut, imported: importedL, stage: stageOf };   /* patch OFFICETAB: the "Not contacted" test, for the Office tab's PM board */
W._gcLeadsUI = { model: function(){""")
    print('OFFICETAB: To-Do host "as" + lead test patched')
else:
    print('OFFICETAB: To-Do host "as" already patched')

TAG = '<script id="gc-patch-officetab">'
js = open(os.path.join(here, 'officetab.js'), encoding='utf-8').read()
assert '</script' not in js
if TAG in t:
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] == js: print('OFFICETAB: script already current')
    else: t = t[:i] + js + t[j:]; print('OFFICETAB: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'OFFICETAB: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + js + '</script>\n'
    print('OFFICETAB: script added')
open(p, 'w', encoding='utf-8').write(t)
