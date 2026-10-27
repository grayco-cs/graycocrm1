#!/usr/bin/env python3
"""Idempotent patch: rewrite the X10 'Sub availability' conflict logic + popup in index.html."""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* SUBAVAIL-FIX v1 */'
if MARK in src:
    print('already patched'); sys.exit(0)

A = 'function subKey(x){ return s(x.subId) || low(x.vendor || x.sub || x.assignee); }\n'
B = 'function conflictLine(){'
C = 'function watchConflicts(){'
D = "var O = overlay('🗓 Sub availability', 'Booked on a day the sub marked busy, or two jobs the same day. A warning only — you decide.');"
for k in (A, B, C, D):
    assert src.count(k) == 1, ('anchor count != 1', k[:50], src.count(k))
a = src.index(A); b = src.index(B); c = src.index(C)
assert a < b < c
# the old conflictLine() .. openConflicts() block is replaced up to watchConflicts
new_block = MARK + r'''
function jobName(pid, x){ var p = proj(pid); var n = p && s(p.name || p.address || p.projectName); if (n) return n; n = s(x && x.address); return n || 'a job'; }
var NOT_WORK = /^[\s\W]*(tentative\s+)?(project\s+)?(start|finish|end|begin|completion|complete|deadline)\b/i;
function isRealWork(x){
  var ty = low(x.type), ti = s(x.title);
  if (/milestone|phase/.test(ty) || x._autoBookend) return false;
  if (/scope sent|note|reminder|inspection|meeting/.test(ty)) return false;
  if (x.tentative || low(x.scope) === 'tentative') return false;
  if (NOT_WORK.test(ti) || /\bend date\b/i.test(ti)) return false;
  return true;
}
function realSubs(){
  var staff = {}; users().forEach(function(u){ if (!u) return; [u.name, u.email].forEach(function(v){ v = low(v); if (v) staff[v] = 1; }); });
  var by = {}, ids = {};
  arr(crm().subs).forEach(function(su){
    if (!su || su.deleted || !s(su.id)) return;
    var nm = s(su.company || su.name); if (!nm) return;
    if (staff[low(su.name)] || staff[low(su.email)] || staff[low(nm)]) return;
    ids[s(su.id)] = nm; by[low(su.company)] = by[low(su.company)] || s(su.id); by[low(su.name)] = by[low(su.name)] || s(su.id);
  });
  delete by['']; return { ids: ids, byName: by };
}
function conflicts(){
  var t = today(), out = [], by = {}, R = realSubs();
  arr(crm().schedule).forEach(function(x){
    if (!x || x.deleted || !x.date || s(x.date).slice(0, 10) < t || !isRealWork(x)) return;
    var sid = s(x.subId); if (!R.ids[sid]) sid = R.byName[low(x.vendor || x.sub)] || '';
    if (!sid) return;                      /* staff / PMs / unknown people never count */
    var d = s(x.date).slice(0, 10), key = sid + '|' + d, e = by[key] = by[key] || { sid: sid, d: d, jobs: {}, order: [], items: [] };
    var jk = s(x.pid) || low(x.title); if (!e.jobs[jk]) { e.jobs[jk] = jobName(x.pid, x); e.order.push(jk); } e.items.push(x);
  });
  Object.keys(by).forEach(function(key){ var e = by[key], nm = R.ids[e.sid], av = AV.data[e.sid], jobs = e.order.map(function(k){ return e.jobs[k]; });
    var bz = av && av.days && av.days[e.d];
    if (bz) out.push({ id: 'busy|' + key, kind: 'busy', date: e.d, sub: nm, jobs: jobs, title: jobs.join(' and '), pid: '', note: s(bz.note) });
    if (jobs.length > 1) out.push({ id: 'dbl|' + key, kind: 'double', date: e.d, sub: nm, jobs: jobs, title: jobs.join(' and '), pid: '', note: '' });
  });
  out.sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return out;
}
function shortDay(iso){ var d = new Date(s(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function jobList(j){ return j.length < 2 ? (j[0] || 'a job') : j.slice(0, -1).join(', ') + ' and ' + j[j.length - 1]; }
function conflictText(x){
  if (x.kind === 'busy') return shortDay(x.date) + ' · ' + x.sub + ' marked this day busy but is booked on ' + jobList(x.jobs);
  return shortDay(x.date) + ' · ' + x.sub + ' is booked on ' + x.jobs.length + ' jobs: ' + jobList(x.jobs);
}
function conflictLine(){ var c = conflicts(); return c.length ? '⚠️ ' + c.length + ' booking(s) on a busy day or double-booked' : 'no conflicts — subs mark their busy days in the sub portal'; }
function openConflicts(){
  var O = overlay('🗓 Sub availability', 'Booked on a day the sub marked busy, or two jobs the same day. A warning only — you decide.');
  AV.at = 0; pullAvail().then(function(){ var c = conflicts(), wrap = 'white-space:normal;overflow-wrap:anywhere;word-break:break-word;max-width:100%';
    O.body.style.overflowWrap = 'anywhere';
    O.body.innerHTML = c.length ? '<div style="' + wrap + '">' + c.map(function(x){ return '<div style="padding:8px 0;border-bottom:1px solid #e2e8f0;' + wrap + '">' + esc(conflictText(x)) + (x.note ? '<br><span class="gcx10-mut">their note: ' + esc(x.note) + '</span>' : '') + ' ' + (x.kind === 'busy' ? '<span class="gcx10-chip red">marked busy</span>' : '<span class="gcx10-chip amb">double-booked</span>') + '</div>'; }).join('') + '</div>' : '<p>No conflicts — no sub is booked on a busy day or on two jobs the same day.</p>';
    var R = realSubs(), days = []; Object.keys(AV.data).forEach(function(sid){ var a = AV.data[sid]; if (!R.ids[sid]) return; Object.keys(a.days || {}).forEach(function(d){ if (d >= today()) days.push({ d: d, n: R.ids[sid], note: (a.days[d] || {}).note }); }); });
    days.sort(function(a, b){ return a.d < b.d ? -1 : 1; });
    O.body.innerHTML += '<h3>Busy days the subs marked</h3>' + (days.length ? '<table class="gcx10-tbl" style="table-layout:fixed;' + wrap + '">' + days.slice(0, 120).map(function(x){ return '<tr><td>' + esc(day(x.d)) + '</td><td>' + esc(x.n) + '</td><td class="gcx10-mut">' + esc(x.note) + '</td></tr>'; }).join('') + '</table>' : '<p class="gcx10-mut">None.</p>');
  });
}
'''
src = src[:a] + new_block + src[c:]
assert src.count(MARK) == 1 and src.count('function conflicts(){') == 1 and src.count('function openConflicts(){') == 1
open(path, 'w', encoding='utf-8').write(src)
print('patched')
