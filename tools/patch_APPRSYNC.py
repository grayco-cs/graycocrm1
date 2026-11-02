#!/usr/bin/env python3
"""Idempotent patch APPRSYNC: one approval list on every device.

Owner 10/30 (phone, GrayCo Field): "I approved some of these on my computer and now on my phone they are back. All info
should be the same in field and desktop version."

 * A card decided on one computer (APPRCOUNT's "gone": approved / sent / assigned on Approvals, the Field home's
   Approve, the sub-invoice / expense in-place approve) was hidden on THAT computer only (an in-memory list for 10 min).
   It is now also one record in gc_apx_decided_approvals (gc_kv; a list like the other *_approvals queues: the live feed
   carries it, records merge per id, newest updatedAt wins): { id: 'd:<card key>', key, sig, at, by, updatedAt }.
   Every device's approval set leaves the card out until its own record changes (sig) or 10 minutes pass — the same
   rule as on the deciding computer. Denies already travel in gc_office_tasks (patch DENY).
 * "N new job messages" (a To-Do approval card) counted messages not read ON THIS DEVICE (gc_job_msg_seen, local only).
   What a person has read is now in the same row ({ id: 'jm:<email>:<job>', at }), newest read wins, so reading them on
   the computer clears the card on the phone.
 * The approvals queue read (every 20 s while the page shows, patch APPR) reads this row in the same request — no new
   polling; the live feed brings it at once.
 * The office To-Do's alert cards ("2 new job messages") were keyed by their place in that device's alert list, so the
   same card had another key on the phone (a deny / decision made on the computer did not match it): keyed by text now.
 * GrayCo Field's home "My approvals" repaints when the approval set changes (it waited for a CRM data rebuild, so a
   queue item approved elsewhere stayed on the phone); the job-cost routing (SUBINV) keeps APPRCOUNT's trim, so the
   badge, the desk's Approvals and the phone are one list.
Usage: python3 tools/patch_APPRSYNC.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_APPRSYNC__'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

MOD = r'''<script id="gc-patch-apprsync">
/* __GC_PATCH_APPRSYNC__ — one approval list on every device (owner 10/30: "I approved some of these on my computer and
   now on my phone they are back. All info should be the same in field and desktop version.")
   gc_apx_decided_approvals (gc_kv, merged per id, newest updatedAt wins; the live feed carries it):
     { id: 'd:<card key>', key, sig, at, by }  a card decided here: left out everywhere until its record changes or 10 min;
     { id: 'jm:<email>:<job id>', at }          the job messages that person read (newest read wins).
   Read with the approvals queue (one request, every 20 s, patch APPR) and from the live feed. API: window._gcApprShared */
(function(){
'use strict';
var W = window; if (W.__GC_PATCH_APPRSYNC__) return; W.__GC_PATCH_APPRSYNC__ = true;
var K = 'gc_apx_decided_approvals', SEEN = 'gc_job_msg_seen', TTL = 600000;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function nowIso(){ return new Date().toISOString(); }
function me(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function parse(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object' && x.id; }) : []; }
function creds(){ try { return { u: s(localStorage.getItem('grayco_sb_url')).replace(/\/$/, ''), k: s(localStorage.getItem('grayco_sb_key')) }; } catch (e) { return { u: '', k: '' }; } }
/* the local copy (localStorage, like the other approval lists; the live feed merges into it) */
var raw = null, byId = {}, readAt = 0, seenFor = '';
function list(){
  if (Date.now() - readAt < 400) return byId;
  readAt = Date.now();
  var r = null; try { r = localStorage.getItem(K); } catch (e) {}
  if (r !== raw) { raw = r; byId = {}; parse(r).forEach(function(x){ byId[x.id] = x; }); seenFor = ''; }
  if (seenFor !== me()) { seenFor = me(); if (seenFor) seenIn(); }
  return byId;
}
function merge(a, b){ var o = {}; a.concat(b).forEach(function(x){ var p = o[x.id]; if (!p || s(x.updatedAt) >= s(p.updatedAt)) o[x.id] = x; }); return o; }
function prune(o){
  var cutJ = new Date(Date.now() - 90 * 864e5).toISOString(), cutD = new Date(Date.now() - 2 * 864e5).toISOString();
  return Object.keys(o).map(function(k){ return o[k]; }).filter(function(x){ return s(x.updatedAt) >= (/^d:/.test(x.id) ? cutD : cutJ); })
    .sort(function(a, b){ return s(a.updatedAt) < s(b.updatedAt) ? -1 : 1; }).slice(-3000);
}
function save(l){ try { localStorage.setItem(K, JSON.stringify(l)); } catch (e) {} readAt = 0; return list(); }
function vals(o){ return Object.keys(o).map(function(k){ return o[k]; }); }
/* writes: this computer's records + the cloud's, newest per id, then the whole list (a union: nothing of anyone's is lost) */
var owe = false, pushT = null, busy = false;
function put(recs){
  if (!recs.length) return;
  var o = list(); recs.forEach(function(x){ x.updatedAt = nowIso(); o[x.id] = x; });
  save(prune(o)); owe = true;
  if (!pushT) pushT = ST.call(W, push, 300);
}
function push(){
  pushT = null; var c = creds(); if (!c.u || !c.k || !owe) return;
  if (busy) { pushT = ST.call(W, push, 800); return; }
  busy = true; owe = false;
  var h = { apikey: c.k, Authorization: 'Bearer ' + c.k };
  W.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + K + '&select=value', { headers: h, cache: 'no-store' })
    .then(function(r){ if (!r || !r.ok) throw new Error('read ' + (r && r.status)); return r.json(); })
    .then(function(rows){
      var l = prune(merge(parse(rows && rows[0] && rows[0].value), vals(list())));
      save(l);
      return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, h),
        body: JSON.stringify({ key: K, value: l, updated_at: nowIso() }) }).then(function(r){ if (!r || !r.ok) throw new Error('write ' + (r && r.status)); });
    })
    .catch(function(){ owe = true; })   /* sent with the next decision or the next read of the queue */
    .then(function(){ busy = false; });
}
/* the queue read (patch APPR) hands us the cloud row */
function take(v){
  var inc = parse(v); if (!inc.length && !owe) return;
  var o = list(), ch = false;
  inc.forEach(function(x){ var p = o[x.id]; if (!p || s(x.updatedAt) > s(p.updatedAt)) { o[x.id] = x; ch = true; } });
  if (ch) save(prune(o));
  if (owe && !pushT) pushT = ST.call(W, push, 300);
}
/* a decided card: left out while its record still says the same thing (sig) and for 10 minutes */
function has(k, sigFn){
  var x = list()['d:' + k]; if (!x) return false;
  if (!(Date.now() - (Date.parse(x.at) || 0) < TTL)) return false;
  var sg = ''; try { sg = typeof sigFn === 'function' ? sigFn() : s(sigFn); } catch (e) {}
  return s(x.sig) === s(sg);
}
function mark(k, sig){ k = s(k); if (!k || !me()) return; put([{ id: 'd:' + k, key: k, sig: s(sig), at: nowIso(), by: me() }]); }
/* job messages read: out (the job-messages module's setSeen) and in (another device's reads → this device's gc_job_msg_seen) */
function seenLocal(){ try { var o = JSON.parse(localStorage.getItem(SEEN) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function seen(o){
  var e = me(); if (!e || !o) return; var L = list(), out = [];
  Object.keys(o).forEach(function(pid){ var v = s(o[pid]), id = 'jm:' + e + ':' + pid, x = L[id]; if (v && (!x || s(x.at) < v)) out.push({ id: id, at: v }); });
  put(out);
}
function seenIn(){
  var e = me(), pre = 'jm:' + e + ':', loc = seenLocal(), ch = false;
  vals(byId).forEach(function(x){ if (x.id.indexOf(pre) !== 0) return; var pid = x.id.slice(pre.length), v = s(x.at); if (pid && v && s(loc[pid]) < v) { loc[pid] = v; ch = true; } });
  if (!ch) return;
  try { localStorage.setItem(SEEN, JSON.stringify(loc)); } catch (x) {}
  ST.call(W, function(){
    try { if (W._gcRefreshAlerts) W._gcRefreshAlerts(); } catch (x) {}
    try { if (W._gcTD2 && W._gcTD2.state) W._gcTD2.state(); } catch (x) {}   /* the To-Do's approval rows are taken from its last build */
    try { if (W._gcApprovalSetFresh) W._gcApprovalSetFresh(); } catch (x) {}
  }, 0);
}
W._gcApprShared = { key: K, has: has, mark: mark, take: take, seen: seen, push: push, list: function(){ return vals(list()); } };
})();
</script>
'''

# 1. the module, before the approval set (fix_3)
once('<script id="gc-fix-apprset">', MOD + '<script id="gc-fix-apprset">', 'module')

# 2. fix_3: the memoized set (the badge's) for the change signal
once("window._gcApprovalSetFresh = function(){ memo = null; };   /* patch APPRCOUNT */",
     "window._gcApprovalSetFresh = function(){ memo = null; };   /* patch APPRCOUNT */\n  window._gcApprovalCurrent = function(){ return current(); };   /* patch APPRSYNC */",
     'current')

# 3. APPRCOUNT: a decision here is shared; one decided on another device is left out here too
once("  if (DPEND[k]) return true;\n  var g = GONE[k]; if (!g) return false;",
     "  if (DPEND[k]) return true;\n  try { if (W._gcApprShared && W._gcApprShared.has(k, function(){ return gSig(k); })) return true; } catch (e) {}   /* patch APPRSYNC */\n  var g = GONE[k]; if (!g) return false;",
     'isGone')
once("function goneNow(k){ k = bareKey(k); if (!k) return; ASGC = null; GONE[k] = { at: Date.now(), sig: gSig(k) }; bump(); }",
     "function goneNow(k){ k = bareKey(k); if (!k) return; ASGC = null; GONE[k] = { at: Date.now(), sig: gSig(k) }; try { if (W._gcApprShared) W._gcApprShared.mark(k, GONE[k].sig); } catch (e) { warn(e); } bump(); }   /* patch APPRSYNC: every device */",
     'goneNow')
once("W._gcApprCount = { state: function(){ return { gone: Object.keys(GONE), denying: Object.keys(DPEND) }; }, isGone: isGone,",
     "W._gcApprCount = { state: function(){ return { gone: Object.keys(GONE), denying: Object.keys(DPEND) }; }, isGone: isGone, trim: trimSet,",
     'trim api')
# the change signal for the Field home (APX's own 1-s tick; no new timer)
once("    pinRoots(); navBadge();\n  } catch (e) { warn(e); }\n}",
     "    pinRoots(); navBadge();\n    apSig();   /* patch APPRSYNC */\n  } catch (e) { warn(e); }\n}\n"
     "var APSIG = '';\nfunction apSig(){ var cs = typeof W._gcApprovalCurrent === 'function' ? W._gcApprovalCurrent() : null; if (!cs || !cs.groups) return; var ids = []; Object.keys(cs.groups).forEach(function(g){ arr(cs.groups[g]).forEach(function(x){ ids.push(s(x && x.id)); }); }); var sg = cs.total + '|' + ids.join(','); if (sg === APSIG) return; APSIG = sg; try { W.dispatchEvent(new CustomEvent('gc-approvals-changed', { detail: { total: cs.total } })); } catch (e) {} }",
     'tick')

# 4. SUBINV's job-cost routing rebuilds two groups: APPRCOUNT's trim (gone / denied / decided elsewhere) applies to them too
once("      routeGroups(r.groups);\n",
     "      routeGroups(r.groups);\n      try { if (W._gcApprCount && typeof W._gcApprCount.trim === 'function') W._gcApprCount.trim(r); } catch (e) {}   /* patch APPRSYNC */\n",
     'route')

# 5. APPR: the queue read brings the decisions row in the same request
once("  loading = window.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + K + '&select=value,updated_at', { headers:{ apikey:c.k, Authorization:'Bearer ' + c.k }, cache:'no-store' })",
     "  loading = window.fetch(c.u + '/rest/v1/gc_kv?key=in.(' + K + ',gc_apx_decided_approvals)&select=key,value,updated_at', { headers:{ apikey:c.k, Authorization:'Bearer ' + c.k }, cache:'no-store' })   /* patch APPRSYNC */",
     'load url')
once("    .then(function(rows){ if(Array.isArray(rows)){ var v = norm(rows[0] ? rows[0].value : null); if(v){ list = merge(list, v); loadedAt = Date.now(); } } paint(); return list; })",
     "    .then(function(rows){ if(Array.isArray(rows)){ var r0 = rows.filter(function(x){ return x && x.key === K; })[0], r1 = rows.filter(function(x){ return x && x.key === 'gc_apx_decided_approvals'; })[0];   /* patch APPRSYNC */\n"
     "      try{ if(r1 && window._gcApprShared) window._gcApprShared.take(r1.value); }catch(e){}\n"
     "      var v = norm(r0 ? r0.value : null); if(v){ list = merge(list, v); loadedAt = Date.now(); } } paint(); return list; })",
     'load rows')

# 6. the live feed carries the row (an LS-backed *_approvals list: merged per id, newest wins)
once("'gc_contract_approvals','gc_outbound_approvals','gc_deleted_projects'",
     "'gc_contract_approvals','gc_outbound_approvals','gc_apx_decided_approvals','gc_deleted_projects'",
     'live keys')

# 7. job messages read here go to the shared row
once("  function setSeen(o){ try{ localStorage.setItem(SEEN_KEY, JSON.stringify(o)); }catch(e){} }",
     "  function setSeen(o){ try{ localStorage.setItem(SEEN_KEY, JSON.stringify(o)); }catch(e){} try{ if(window._gcApprShared) window._gcApprShared.seen(o); }catch(e){} }   /* patch APPRSYNC */",
     'setSeen')

# 8. the office To-Do's alert cards (e.g. "2 new job messages") are keyed by their text, not their place in the list: the
#    same card has the same key on every device (a deny, a decision or a done mark made on one device holds on the others)
once("        tasks.push({ id:'alert_'+i+'_'+(a.label||''), cat:'Approvals',",
     "        tasks.push({ id:'alert_'+(a.label||String(i)), cat:'Approvals',   /* patch APPRSYNC: the same key on every device */",
     'alert id')

# 9. GrayCo Field's home repaints when the approval set changes
once("W.addEventListener('online', soon); W.addEventListener('offline', soon);",
     "W.addEventListener('online', soon); W.addEventListener('offline', soon);\nW.addEventListener('gc-approvals-changed', soon);   /* patch APPRSYNC: the same list as the badge and the desk's Approvals */",
     'field')

open(path, 'w', encoding='utf-8').write(src)
print('patched APPRSYNC')
