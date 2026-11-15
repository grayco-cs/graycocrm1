#!/usr/bin/env python3
r"""Idempotent patch ADMWARN (owner 11/03, Admin -> Team: "ive x this before and its back and i fixed the spaces etc").
1. The "extra spaces in the name" card: its content (for the x / 7-day hide, patch ADMDISMISS) is the PERSON (record id),
   not the title. Before, the title held the name with its spaces, so fixing "Steven  Biffle" into "Steven Biffle " (or
   any other change of the spaces) was "new content" and the dismissed card came back 45 s later.
2. Names are trimmed (spaces collapsed) on LOAD (window._healUsers: start-up and the disk follow; _gcApplySync 'users':
   the sync) and on SAVE (_gcApplySync / _supaUpsert / idbSet of 'users'; and the job PM fields pm / pmName / owner /
   broughtInBy / createdBy of 'projects' and 'leads'). Before, Admin -> Employees -> Save of "Steven Biffle" was stamped
   newer, but any other computer still holding "Steven Biffle " re-stamped the whole record on its next save of that
   person (role, Senior PM, pay...) and newest-wins put the space back. Now no computer keeps or writes the space.
3. Two people on one e-mail: a third button "✓ That's right — leave it" accepts the pair for good (company-wide, gc_kv
   "gc_adm_accept" = {v, pairs: {<e-mail>: {email, names, at, by}}}, + a copy on this computer). The card stays away
   unless the names on that e-mail change. "Edit <name>" and "Team access" stay.
Usage: python3 tools/patch_ADMWARN.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch ADMWARN */'
if MARK in t:
    print('already patched'); sys.exit(0)

EDITS = []
def edit(tag, old, new):
    assert MARK in new, tag
    EDITS.append((tag, old, new))

edit('ADM dup-email: accepted pair',
"""    var g = byMail[e]; if (g.length < 2) return;
    var keep = g.filter(isPlaceholder)[0] || g[0];""",
"""    var g = byMail[e]; if (g.length < 2) return;
    var accNames = g.map(function(u){ return s(u.name).replace(/\\s+/g, ' '); });   """ + MARK + """
    try { if (W._gcAdmAccept && W._gcAdmAccept.has(e, accNames)) return; } catch (x) {}   """ + MARK + """
    var keep = g.filter(isPlaceholder)[0] || g[0];""")
edit('ADM dup-email: the accept button',
"""        .concat([{ label: 'Team access', run: function(){ call('_gcTeamAccess'); } }]) });""",
"""        .concat([{ label: 'Team access', run: function(){ call('_gcTeamAccess'); } }])
        .concat(W._gcAdmAccept ? [{ label: '✓ That’s right — leave it', run: function(){ W._gcAdmAccept.accept(e, accNames); paintTop(); } }] : []) });   """ + MARK)
edit('ADM name-spaces: content is the person',
"""    out.push({ id: 'name-spaces', level: 'amber', key: u.id, title: '“' + esc(u.name) + '” has extra spaces in the name',""",
"""    out.push({ id: 'name-spaces', level: 'amber', key: u.id, items: ['person:' + s(u.id || u.email || low(u.name).replace(/\\s+/g, ' '))],   """ + MARK + """
      title: '“' + esc(u.name) + '” has extra spaces in the name',""")

END_ADMD = """try { console.log('[GC] ⚙ Admin: a ✕ stays dismissed until something new shows up (patch ADMDISMISS) — _gcAdmDismiss.state()'); } catch (e) {}
})();
</script>
"""
BLOCK = r"""<script id="gc-patch-admwarn">
/* patch ADMWARN */
/* __GC_PATCH_ADMWARN__ — ⚙ Admin → Team: names without stray spaces everywhere they are loaded or saved; "✓ That's right —
   leave it" for two people on one e-mail (see tools/patch_ADMWARN.py). API: window._gcAdmAccept, window._gcCleanName */
(function(){
'use strict';
if (window.__GC_PATCH_ADMWARN__) return; window.__GC_PATCH_ADMWARN__ = true;
var W = window, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, RI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clean(v){ return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v; }
function parse(v){ if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } } return v; }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
W._gcCleanName = clean;

/* ── names: trimmed on load and on save ── */
var FIELDS = { users: ['name'], projects: ['pm', 'pmName', 'owner', 'broughtInBy', 'createdBy'], leads: ['pm', 'pmName', 'owner', 'broughtInBy', 'createdBy'] };
function cleanList(key, list){
  var f = FIELDS[key]; if (!f || !Array.isArray(list)) return list;
  var out = null;
  for (var i = 0; i < list.length; i++) {
    var r = list[i]; if (!r || typeof r !== 'object') continue;
    var ch = null;
    f.forEach(function(k){ var v = r[k]; if (typeof v === 'string' && clean(v) !== v) { ch = ch || {}; ch[k] = clean(v); } });
    if (ch) { if (!out) out = list.slice(); out[i] = Object.assign({}, r, ch); }
  }
  return out || list;
}
function cleanVal(key, v){
  if (!FIELDS[key]) return v;
  if (Array.isArray(v)) return cleanList(key, v);
  if (typeof v === 'string' && /^\s*\[/.test(v)) { var a = parse(v); if (Array.isArray(a)) { var c = cleanList(key, a); return c === a ? v : JSON.stringify(c); } }
  return v;
}
W._gcCleanList = cleanList;
function wrap(name, mk){
  var f = W[name]; if (typeof f !== 'function' || f.__gcAdmwarn) return;
  var g = mk(f); g.__gcAdmwarn = true;
  try { Object.keys(f).forEach(function(k){ if (!(k in g)) g[k] = f[k]; }); } catch (e) {}
  W[name] = g;
}
function arm(){
  wrap('_healUsers', function(f){ return function(loaded, defs){ return cleanList('users', f.call(this, cleanList('users', loaded), defs)); }; });
  ['_gcApplySync', '_supaUpsert', 'idbSet'].forEach(function(n){
    wrap(n, function(f){ return function(key, value){ var a = Array.prototype.slice.call(arguments); try { if (typeof key === 'string' && FIELDS[key]) a[1] = cleanVal(key, value); } catch (e) {} return f.apply(this, a); }; });
  });
  /* the list on the screen (loaded before this ran, or set by a sync that went round the wrappers) */
  try { var U = W._crm && W._crm.users, C = cleanList('users', U); if (C !== U && typeof W._gcUsersRaw === 'function' && !(D.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(D.activeElement.tagName))) { W._crm.users = C; W._gcUsersRaw(C.slice()); } } catch (e) {}
}
var D = document;
arm(); RI.call(W, arm, 1500);

/* ── "✓ That's right — leave it": an accepted pair on one e-mail (company-wide) ── */
var ROW = 'gc_adm_accept', LOC = 'gc_adm_accept_local', A = { pairs: {}, pulledAt: 0, err: '', dirty: false };
function namesKey(names){ return (names || []).map(function(n){ return low(clean(n)); }).sort().join('|'); }
function me(){ try { var x = W.__GC_AUTH__; var e = x && x.email && x.email(); if (e) return low(e); } catch (e) {} return ''; }
function creds(){ return { u: (lsGet('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), k: lsGet('grayco_sb_key') || '' }; }
function merge(a, b){ var out = {}; [a, b].forEach(function(m){ Object.keys(m || {}).forEach(function(k){ var r = m[k]; if (r && typeof r === 'object' && (!out[k] || s(r.at) > s(out[k].at))) out[k] = r; }); }); return out; }
(function(){ var l = parse(lsGet(LOC)); if (l && l.pairs) { A.pairs = merge({}, l.pairs); A.dirty = !!l.dirty; } })();
function saveLocal(){ lsSet(LOC, JSON.stringify({ pairs: A.pairs, dirty: A.dirty })); }
function cloudRead(){
  var c = creds(); if (!c.k) return Promise.reject(new Error('not connected'));
  return W.fetch(c.u + '/rest/v1/gc_kv?select=value&key=eq.' + ROW, { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k }, cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('read ' + r.status)); })
    .then(function(rows){ var v = parse(rows && rows[0] ? rows[0].value : null); return v && v.pairs && typeof v.pairs === 'object' ? v.pairs : {}; });
}
function cloudWrite(){
  var c = creds(); if (!c.k) return Promise.reject(new Error('not connected'));
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: c.k, Authorization: 'Bearer ' + c.k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: ROW, value: JSON.stringify({ v: 1, pairs: A.pairs }), updated_at: new Date().toISOString() }) })
    .then(function(r){ if (!r.ok) throw new Error('save ' + r.status); return true; });
}
function repaint(){ try { if (typeof W._gcAdmPaintTop === 'function') W._gcAdmPaintTop(); } catch (e) {} }
function pull(){
  return cloudRead().then(function(cl){ var before = JSON.stringify(A.pairs); A.pairs = merge(A.pairs, cl); A.pulledAt = Date.now(); A.err = ''; saveLocal(); if (A.dirty) push(); if (JSON.stringify(A.pairs) !== before) repaint(); return true; },
    function(e){ A.err = s(e && e.message); return false; });
}
function push(){
  A.dirty = true; saveLocal();
  return cloudRead().then(function(cl){ A.pairs = merge(cl, A.pairs); return cloudWrite(); })
    .then(function(){ A.dirty = false; A.err = ''; saveLocal(); return true; }, function(e){ A.err = s(e && e.message); return false; });
}
function has(email, names){ var r = A.pairs[low(email)]; return !!(r && !r.off && r.k === namesKey(names)); }
function accept(email, names){
  var e = low(email); if (!e) return false;
  A.pairs[e] = { email: e, names: (names || []).map(clean), k: namesKey(names), at: new Date().toISOString(), by: me() };
  saveLocal(); push(); return true;
}
function undo(email){ var e = low(email); A.pairs[e] = { email: e, off: true, at: new Date().toISOString(), by: me() }; saveLocal(); push(); repaint(); return true; }
W._gcAdmAccept = { has: has, accept: accept, undo: undo, pull: pull, push: push, state: function(){ return JSON.parse(JSON.stringify(A)); } };
var lastPull = 0;
RI.call(W, function(){
  try {
    var adm = low(lsGet('grayco_view')) === 'admin', now = Date.now();
    if (!me()) return;
    if ((adm && now - lastPull > 120000) || !lastPull) { lastPull = now; pull(); }
    else if (A.dirty && now - lastPull > 30000) { lastPull = now; push(); }
  } catch (e) {}
}, 1000);
try { console.log('[GC] ⚙ Admin: names trimmed on load and save; "✓ That’s right — leave it" for one e-mail (patch ADMWARN) — _gcAdmAccept.state()'); } catch (e) {}
})();
</script>
"""
edit('ADMWARN block after ADMDISMISS', END_ADMD, END_ADMD + BLOCK)

for tag, old, new in EDITS:
    n = t.count(old)
    assert n == 1, (tag, n)
    t = t.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(t)
print('patched ADMWARN: %d edits' % len(EDITS))
