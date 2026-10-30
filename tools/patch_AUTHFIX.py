#!/usr/bin/env python3
"""patch AUTHFIX (idempotent) — index.html side of the owner's refused calls (live watch, r17c).

1. Admin -> Setup checklist: the "is this SQL file run?" probes no longer read the service-only tables from the
   browser (gc_portal, gc_lead_inbox_kv, gc_news_suppress, gc_photo_reports, gc_pending_money, gc_archive_fresh_start
   -- every admin's computer logged a 403 or 404 per table every few minutes). The server answers instead:
   portal?ping=1 now returns setup: { table: true | false | null } (netlify/functions/portal.js, service key).
   The browser only probes the tables a signed-in admin may read anyway (gc_staff, gc_admin_kv, rs_settings), and
   only when the ping did not answer with setup.
2. SUBPHOTOS post() (auto-wins: the "I opened Approvals" stamp, "who checked Approvals today"): a 401 (the sign-in
   ran out while the computer slept) renews the sign-in once and sends again, instead of failing until the next tick.

usage: python3 tools/patch_AUTHFIX.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch AUTHFIX */'
if MARK in src:
    print('already patched'); sys.exit(0)

def one(old, new):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', n, old[:80])
    src = src.replace(old, new)

# ── 1. the setup checklist's table probes ──
one("""function probeTable(t){
  return fetch(SB + '/rest/v1/' + t + '?select=*&limit=0', { cache: 'no-store' }).then(function(r){""",
"""/* patch AUTHFIX */ /* the server says which setup tables exist (portal?ping=1 -> setup, service key); the browser reads only
   the tables a signed-in admin may read anyway -- the others answered 403 / 404 on every admin computer, every few minutes */
var BROWSER_TABLES = { gc_staff: 1, gc_admin_kv: 1, rs_settings: 1 };
function probeTable(t){
  var pg = pj('portal'), su = pg && pg.setup && typeof pg.setup === 'object' ? pg.setup : null;
  if (su && Object.prototype.hasOwnProperty.call(su, t)) return Promise.resolve(su[t] === true ? true : su[t] === false ? false : null);
  if (!BROWSER_TABLES[t]) return Promise.resolve(null);
  return fetch(SB + '/rest/v1/' + t + '?select=*&limit=0', { cache: 'no-store' }).then(function(r){""")

one("""  var jobs = [
    getJSON(F + 'portal?ping=1').then(function(x){ ST8.p.portal = x; }),""",
"""  var pingDone = getJSON(F + 'portal?ping=1').then(function(x){ ST8.p.portal = x; });   /* patch AUTHFIX: the table answers come with it */
  var jobs = [
    pingDone,""")

one("""  ].concat(Object.keys(TABLES).map(function(t){ return probeTable(t).then(function(ok){ ST8.t[t] = ok; }); }));""",
"""  ].concat([pingDone.then(function(){ return Promise.all(Object.keys(TABLES).map(function(t){ return probeTable(t).then(function(ok){ ST8.t[t] = ok; }); })); })]);""")

# ── 2. SUBPHOTOS post(): a 401 renews the sign-in once and sends again ──
one("""function post(fn, body){
  return W.fetch('/.netlify/functions/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ j.__status = r.status; return j; }); }, function(e){ return { ok: false, error: 'offline' }; });
}""",
"""function post(fn, body, again){
  return W.fetch('/.netlify/functions/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ j = j && typeof j === 'object' ? j : {}; j.__status = r.status; return j; }); }, function(e){ return { ok: false, error: 'offline' }; })
    .then(function(j){   /* patch AUTHFIX: the sign-in ran out (the computer slept) -> renew once, send again */
      var A = W.__GC_AUTH__;
      if (again || !j || j.__status !== 401 || !A || typeof A.renew !== 'function') return j;
      return Promise.resolve().then(function(){ return A.renew(); }).then(function(){ return post(fn, body, true); }, function(){ return j; });
    });
}""")

open(path, 'w', encoding='utf-8').write(src)
print('patched')
