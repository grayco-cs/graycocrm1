#!/usr/bin/env python3
"""Idempotent patch MKTFIX1 (Marketing audit, security): the Marketing Manager's browser asks the database for
marketing only — even while the database itself is still open.

Found 10/30: live still runs without docs/security-lockdown.sql, so the public key reads every gc_kv row. The
Marketing Manager profile is locked by the database (docs/marketing-role.sql) — and without the lockdown that lock
is not there: his first sign-in downloaded projects, customers, leads, scopes, vendors, the commission queue, other
people's to-dos and the approvals list into his browser (IndexedDB + localStorage), with customer names, phones,
e-mails, addresses and job costs. The screens hid it; the computer had it.

    python3 tools/patch_MKTFIX1.py [index.html]

In the sign-in layer (the one place every database request passes):
  1. MM fence: when the session is a Marketing Manager (S.marketing), a database read is answered on the computer
     with an empty list unless it asks only for the keys docs/marketing-role.sql lets him read (users,
     gc_company_address, gc_epoch, gc_mkt_admin, gc_automation_pause; a mixed list is cut to those) or his own
     gc_staff row; signed picture links still open; every database write is refused (403) like the database does.
  2. The live feed (realtime) drops, for him, every row change except those keys; a Netlify function that refuses him
     anyway (every staff function but soc / mkt / mkt2 / referral) is answered on his computer (no refused calls).
  3. His first sign-in opens the Marketing layout: the page opens again when the marketing profile was not on yet,
     and when he is not on the employee list yet he opens as "Marketing Manager" (his name from Team access).
Every find-string must match exactly once; a file that already carries the marker is left alone.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = 'patch MKTFIX1'
if MARK in t:
    print('MKTFIX1: already patched'); sys.exit(0)

R = []
# 0. his name from Team access (gc_staff.name) for a first sign-in that is not on the employee list yet
R.append(("""      S.role = mkt ? 'marketing' : low(row.role || 'staff'); S.marketing = mkt; S.roleKnown = true; store(S);""",
"""      S.role = mkt ? 'marketing' : low(row.role || 'staff'); S.marketing = mkt; S.roleKnown = true; if (mkt) S.mmName = String(row.name || '');   /* patch MKTFIX1 */ store(S);"""))
# 1. the fence
R.append(("""function gcFetch(input, init){
  var u = urlOf(input), kind = classify(u);
  if (kind === 'sb') {
""",
"""/* patch MKTFIX1: the Marketing Manager asks the database for marketing only — the same four keys docs/marketing-role.sql
   lets him read, his own gc_staff row and the signed picture links; nothing else leaves (or lands on) his computer,
   even while the database lock (docs/security-lockdown.sql) is not run. Everything marketing comes through soc.js. */
var MM_KEYS = { users: 1, gc_company_address: 1, gc_epoch: 1, gc_mkt_admin: 1, gc_automation_pause: 1 };
function mmAnswer(status, body){ return Promise.resolve(new Response(body, { status: status, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } })); }
function mmFence(input, init, u){
  var x; try { x = new URL(u, location.href); } catch (e) { return mmAnswer(200, '[]'); }
  var p = x.pathname, m = methodOf(input, init);
  if ((m === 'GET' || m === 'HEAD') && (p.indexOf('/storage/v1/object/sign/') === 0 || p.indexOf('/storage/v1/object/public/') === 0)) return null;
  if (m !== 'GET' && m !== 'HEAD') return mmAnswer(403, '{"code":"42501","message":"The Marketing Manager profile saves marketing through the marketing server only."}');
  if (p === '/rest/v1/gc_staff') return null;   /* his own row (the profile) */
  if (p !== '/rest/v1/gc_kv') return mmAnswer(200, '[]');
  var want = [], other = [];
  x.searchParams.getAll('key').forEach(function(f){
    if (f.indexOf('eq.') === 0) want.push(f.slice(3));
    else if (f.indexOf('in.(') === 0) f.slice(4, -1).split(',').forEach(function(k){ want.push(k.replace(/^"|"$/g, '')); });
    else if (f.indexOf('not.') === 0) other.push(f);
    else want.push('\\u0000');
  });
  var ok = want.filter(function(k){ return MM_KEYS[k] === 1; });
  if (!want.length || !ok.length) return mmAnswer(200, '[]');
  if (ok.length === want.length) return null;
  if (typeof input !== 'string' && !(input instanceof URL)) return mmAnswer(200, '[]');
  x.searchParams.delete('key'); x.searchParams.append('key', 'in.(' + ok.map(function(k){ return '"' + k + '"'; }).join(',') + ')');
  other.forEach(function(f){ x.searchParams.append('key', f); });
  return { url: x.href };
}
/* … and only the functions that serve him (soc / mkt / mkt2 / referral and the public marketing doors): every other staff
   function refuses him anyway — answered here at once, so his page makes no refused calls (they were ~25 a load) */
var MM_FNS = { soc: 1, mkt: 1, mkt2: 1, referral: 1, 'mkt-public': 1, go: 1, 'track-call': 1, 'website-intake': 1, 'claude-proxy': 1 };
function mmFnRefused(u){ var n = ''; try { n = new URL(u, location.href).pathname.split('/')[3] || ''; } catch (e) {} return MM_FNS[n] === 1 ? null : mmAnswer(403, '{"ok":false,"error":"Not part of the Marketing Manager profile."}'); }
function mmFeedDrop(d){
  try {
    if (!(S && S.marketing === true) || typeof d !== 'string' || d.indexOf('postgres_changes') < 0) return false;
    var j = JSON.parse(d), dd = j && j.payload && j.payload.data; if (!dd) return false;
    var k = (dd.record && dd.record.key) || (dd.old_record && dd.old_record.key);
    return dd.table !== 'gc_kv' || MM_KEYS[String(k)] !== 1;
  } catch (e) { return true; }
}
function gcFetch(input, init){
  var u = urlOf(input), kind = classify(u);
  if (kind === 'sb' && S && S.marketing === true) { var mf = mmFence(input, init, u); if (mf && mf.url) { input = mf.url; u = mf.url; } else if (mf) return mf; }   /* patch MKTFIX1 */
  if (kind === 'fn' && S && S.marketing === true) { var mr = mmFnRefused(u); if (mr) return mr; }
  if (kind === 'sb') {
"""))
# 2. the live feed
R.append(("""      var ws = pr === undefined ? new SPWS(u) : new SPWS(u, pr);
      try {
""",
"""      var ws = pr === undefined ? new SPWS(u) : new SPWS(u, pr);
      try {   /* patch MKTFIX1: the Marketing Manager's live feed carries only the keys he may read */
        if (String(u).indexOf(SB_HOST) >= 0) {
          var omd = Object.getOwnPropertyDescriptor(SPWS.prototype, 'onmessage'), oael = ws.addEventListener;
          if (omd && omd.set) Object.defineProperty(ws, 'onmessage', { configurable: true, get: function(){ return omd.get.call(ws); },
            set: function(fn){ omd.set.call(ws, typeof fn === 'function' ? function(ev){ if (mmFeedDrop(ev && ev.data)) return; return fn.apply(this, arguments); } : fn); } });
          ws.addEventListener = function(type, fn, o){ if (type === 'message' && typeof fn === 'function') { var f0 = fn; fn = function(ev){ if (mmFeedDrop(ev && ev.data)) return; return f0.apply(this, arguments); }; } return oael.call(ws, type, fn, o); };
        }
      } catch (e) {}
      try {
"""))
# 3. his first sign-in opens the Marketing layout
R.append(("""    var reloading = await matchAppUser(email, prevEmail);""",
"""    var reloading = await matchAppUser(email, prevEmail);
    if (!reloading && S && S.marketing === true && !window._gcMMData) { reloading = true; say('Opening Marketing…', true); nST(reloadNow, 600); }   /* patch MKTFIX1: the marketing profile starts on the next open */"""))
R.append(("""    var match = await findAppUser(email);""",
"""    var match = await findAppUser(email);
    if (!match && S && S.marketing === true) match = { id: 'mm_' + low(email).replace(/[^a-z0-9]/g, ''), name: S.mmName || low(email).split('@')[0], email: low(email), role: 'Marketing Manager', active: true };   /* patch MKTFIX1: not on the employee list yet */"""))

for old, new in R:
    n = t.count(old)
    assert n == 1, (n, old[:80])
    t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('MKTFIX1: patched')
