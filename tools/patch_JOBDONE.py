#!/usr/bin/env python3
"""patch JOBDONE (owner 11/4: "I finished Phil Garcia's job and it went to 100 and I was supposed to get an approval and I
didn't"). Nothing turned 100 % into an approval (the auto-draw needs a contract amount; Phil Garcia's job had $0 and was
still "bidding"). Now any job at 100 % that is not marked complete puts "🏁 <job> is at 100 % — mark it complete?" on
the owner's ✅ My Approvals (desk and Field — it watches the saved jobs, so either path counts; existing jobs too).
🏁 Mark complete sets the status Complete + the completion date (so the 30-day tracking, warranty and closeout start) and
says what is next (final invoice, or "add the contract amount" when it has none)."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '__GC_JOBDONE__' in src: print('already patched'); sys.exit(0)
def rep(o, n):
    global src
    assert src.count(o) == 1, o[:70]; src = src.replace(o, n)
rep("function storedCat(t, who){\n  var L = s(t.label) + ' ' + s(t.note), id = s(t.id);",
    "function storedCat(t, who){\n  var L = s(t.label) + ' ' + s(t.note), id = s(t.id);\n  if (t.kind === 'job_done') return 'appr';   /* JOBDONE */")
rep("      if (t.kind === 'qb_home') o.act = { l: 'Find its job', f: function(){ call('_gcOpenQbHome', id); } };",
    "      if (t.kind === 'job_done') o.act = { l: '🏁 Mark complete', f: function(){ call('_gcJobDoneApprove', id); } };   /* JOBDONE */\n      else if (t.kind === 'qb_home') o.act = { l: 'Find its job', f: function(){ call('_gcOpenQbHome', id); } };")
tail = r'''
<script id="gc-patch-jobdone">/* __GC_JOBDONE__ — patch JOBDONE: a job at 100 % → "mark it complete?" on the owner's approvals (see tools/patch_JOBDONE.py) */
(function(W){ if (W.__GC_JOBDONE__) return; W.__GC_JOBDONE__ = true;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function admin(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /admin/i.test(s(u.role)) || /owner/i.test(s(u.payType)); } catch (e) { return false; } }
function tasks(){ try { var l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function saveTasks(l){ try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) {} try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u('gc_office_tasks', l); } catch (e) {} }
var DONE_ST = /complete|closed|lost|cancel|warrant|paid in full|archiv/i;
function sweep(){
  try {
    if (!admin()) return;
    var P = (W._crm && W._crm.projects) || []; if (!P.length) return;
    var l = tasks(), have = {}, ch = false;
    l.forEach(function(t){ if (t && t.kind === 'job_done') have[t.pid] = t; });
    P.forEach(function(p){
      if (!p || !p.id || p.deleted || p.mergedInto) return;
      var pct = parseFloat(p.pct), done = DONE_ST.test(s(p.status));
      var t = have[p.id];
      if (pct >= 100 && !done && !t) {
        var c = parseFloat(String(p.contract || p.contractAmount || '').replace(/[$,]/g, '')) || 0, now = new Date().toISOString();
        l.push({ id: 'JOBDONE_' + p.id, kind: 'job_done', pid: p.id, label: '🏁 ' + s(p.name || 'Job') + ' is at 100 % — mark it complete?', note: (s(p.pm) ? 'PM ' + s(p.pm) + ' set it to 100 %. ' : '') + (c ? 'Then send the final invoice.' : 'It has no contract amount yet — add it so the final invoice can go out.') + (/bid/i.test(s(p.status)) ? ' (It is still marked "' + s(p.status) + '".)' : ''), addedBy: 'CRM', addedAt: now, updatedAt: now, done: false, prio: 'high' });
        ch = true;
      } else if (t && !t.done && (done || !(pct >= 100))) { t.done = true; t.doneAt = new Date().toISOString(); t.updatedAt = t.doneAt; t.resolution = done ? 'marked complete' : 'progress went back under 100 %'; ch = true; }
    });
    if (ch) saveTasks(l);
  } catch (e) {}
}
W._gcJobDoneApprove = function(id){
  var l = tasks(), t = l.find(function(x){ return x && x.id === id; }); if (!t) return;
  var p = ((W._crm && W._crm.projects) || []).find(function(x){ return x && x.id === t.pid; }); if (!p) return;
  if (!W.confirm('Mark ' + s(p.name) + ' complete?\n\nStatus → Complete, completion date today (the 30-day tracking, warranty and closeout start).')) return;
  var now = new Date().toISOString(), day = now.slice(0, 10);
  var fn = function(list){ var out = (list || []).map(function(x){ return x && x.id === p.id ? Object.assign({}, x, { status: 'Complete', completionDate: x.completionDate || day, completedAt: x.completedAt || now, updatedAt: now }) : x; }); try { if (W._gcApplySync) W._gcApplySync('projects', out); } catch (e) {} return out; };
  if (W._setProjects) W._setProjects(fn); else if (W._gcApplySync) W._gcApplySync('projects', fn((W._crm && W._crm.projects) || []));
  t.done = true; t.doneAt = now; t.updatedAt = now; t.resolution = 'marked complete'; saveTasks(l);
  var c = parseFloat(String(p.contract || p.contractAmount || '').replace(/[$,]/g, '')) || 0;
  try { W.alert('🏁 ' + s(p.name) + ' is Complete.\n\n' + (c ? 'Next: the final invoice (job page → Invoices & Payments).' : 'Next: add the contract amount (Edit Project), then send the final invoice.')); } catch (e) {}
};
W._gcJobDone = { sweep: sweep };
ST.call(W, sweep, 15000); SI.call(W, sweep, 60000);
})(window);
</script>
'''
src = src.rstrip('\n') + '\n' + tail
open(P, 'w', encoding='utf-8').write(src); print('patched')
