#!/usr/bin/env python3
r"""Idempotent patch LEADSEE: new leads (text, website, missed call, e-mail) show in the CRM at once (owner 10/28:
"make sure the leads go in to crm, i dont see any text leads from earlier or website inquiries").

Why they did not show (r12): new leads land server-side in the private Lead Inbox (gc_lead_inbox_kv "gc_lead_inbox") and only
an open CRM copies them into gc_kv "leads" (patch LD2 pull → import). That pull
  · asked for the WHOLE inbox (bid-inbox ?list=1: up to 600 open + 3000 dismissed items with files / e-mails / notes, plus
    the watcher / portal / alert state) — a big, slow answer that can fail, and the failure was shown nowhere;
  · ran 7 s after start, then only every 2 HOURS (patch INBOXCHEAP) — a lead that came in while the CRM was open waited;
  · imported every item in one go (hundreds of new leads in one setter call);
and on the new Leads screen (LEADSUI) a lead with no due date sorts after every bid with one, past the first 60 rows,
and the 📥 Lead Inbox tab had no count.

What it does
  server (netlify/functions/bid-inbox.js)
    1. GET ?leads=1 (staff sign-in): the small list — open items only (new / imported, no stubs), received in the last
       60 days (or still new), newest first, at most 400, with only the fields the CRM's import reads;
    2. every write of the inbox also writes a tiny marker in gc_kv "gc_lead_inbox_sig" = {at, n, a, v} (the newest
       item's time and two counts — nothing about anyone), only when it changed.
  page (index.html, inside patch LD2 + one new block gc-patch-leadsee, tools/leadsee_tail.js)
    3. the pull asks for ?leads=1 (the whole ?list=1 only on the 📥 Lead Inbox tab, or when the server has no ?leads=1);
    4. the import adds at most 200 new leads per pass (the rest a moment later), never blocking the page;
    5. a signed-in CRM looks at the marker every 30 s while it is on screen (one small row from gc_kv) and collects the
       inbox the moment it changed; a safety pull every 15 minutes; on coming back to the tab it looks at once;
    6. Leads screen: "📥 Lead Inbox (N)" count on the tab; a strip above the list — "📥 N new leads — not assigned yet ·
       Open Lead Inbox", the last check time, any error with ↻ Check now; a "📥 New" / "📥 New · held until 5:00 PM"
       chip on the lead; a fresh unassigned lead (or a held one) sits at the TOP of the default list (soonest-due sort).
The import still saves through the CRM's own synced setter (gc_kv "leads"), so every other computer and phone gets it.

Usage: python3 tools/patch_LEADSEE.py [index.html] [netlify/functions/bid-inbox.js]
Applies to r12 (origin/main) and r13 (claude/rel-tonight); every find-string must be found exactly once.
"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
spath = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(path)), 'netlify', 'functions', 'bid-inbox.js')

def once(src, old, new, tag):
    n = src.count(old)
    assert n == 1, ('LEADSEE anchor count %d != 1 (%s)' % (n, tag), old[:120])
    return src.replace(old, new)

# ───────────────────────── server ─────────────────────────
srv = open(spath, encoding='utf-8').read()
SMARK = '/* patch LEADSEE (server) */'
if SMARK in srv:
    print('LEADSEE: bid-inbox.js already patched')
else:
    srv = once(srv, "async function kvCas(key, change, tries){\n  tries = tries || 6;",
"""/* patch LEADSEE (server) */
/* a tiny public marker in gc_kv ("gc_lead_inbox_sig": the newest open item's time and two counts — nothing about anyone).
   A signed-in CRM looks at that one small row every 30 s and collects the inbox the moment it changed. */
const KV_SIG = 'gc_lead_inbox_sig'; let SIG_LAST = '';
function leadSigOf(list){
  const act = arr(list).filter(x => x && !x.stub && x.status !== 'dismissed' && x.status !== 'merged');
  let at = ''; act.forEach(x => { const t = s(x.updatedAt || x.receivedAt); if (t > at) at = t; });
  return { at, n: act.filter(x => x.status === 'new').length, a: act.length, v: 1 };
}
async function leadSig(key, list){
  if (key !== KV || env('LEAD_SIG_OFF') === '1') return;
  try {
    const v = leadSigOf(list), k = JSON.stringify(v); if (k === SIG_LAST) return;
    const r = await sb('gc_kv?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: KV_SIG, value: v, updated_at: nowIso() }) });
    if (r.ok) SIG_LAST = k;
  } catch (e) {}
}
/* the small list for the CRM's import (?leads=1): open items only, the fields the import reads */
const LITE_DAYS = 60, LITE_MAX = 400;
function liteItem(x){
  const o = {};
  ['id', 'status', 'rev', 'title', 'source', 'sourceKind', 'type', 'origin', 'websiteLead', 'websiteForm', 'address', 'city', 'state', 'zip', 'bidDue', 'bidDueWas', 'preBid', 'preBidLocation', 'preBidMandatory',
   'bidNumber', 'gc', 'owner', 'scope', 'estValue', 'contact', 'pm', 'pmEmail', 'estimator', 'estimatorEmail', 'pid', 'leadId', 'hold', 'flag', 'addendumCount', 'needsReview', 'rawRef', 'portal',
   'bidRole', 'bidRoleWhy', 'dueToCompany', 'dueToContact', 'dueToEmail', 'dueToPhone', 'submitMethod', 'submitWhere', 'dueSnippet', 'receivedAt', 'updatedAt', 'importedAt', 'assignedBy', 'assignedAt',
   'autoAssignedAt', 'leadExtra', 'alsoOn'].forEach(k => { if (x[k] !== undefined && x[k] !== null && x[k] !== '') o[k] = x[k]; });
  o.trades = arr(x.trades).slice(0, 12); o.notes = arr(x.notes).slice(-8);
  o.plansLinks = arr(x.plansLinks).slice(0, 25).map(l => ({ url: l.url, label: l.label, board: l.board }));
  o.files = arr(x.files).filter(f => f && f.ref).slice(0, 40).map(f => ({ ref: f.ref, name: f.name, type: f.type, size: f.size, hash: f.hash, kind: f.kind, addendum: f.addendum }));
  o.emails = arr(x.emails).slice(-10).map(e => ({ subject: e.subject, from: e.from, fromName: e.fromName, date: e.date, rawRef: e.rawRef }));
  o.sources = arr(x.sources).slice(0, 12).map(z => ({ name: z && z.name }));
  return o;
}
function liteList(items){
  const since = new Date(Date.now() - LITE_DAYS * 864e5).toISOString();
  const open = arr(items).filter(x => x && x.id && !x.stub && (x.status === 'new' || x.status === 'imported'));
  const keep = open.filter(x => x.status === 'new' || s(x.updatedAt || x.receivedAt) >= since)
    .sort((a, b) => s(b.receivedAt) < s(a.receivedAt) ? -1 : s(b.receivedAt) > s(a.receivedAt) ? 1 : 0).slice(0, LITE_MAX);
  return { items: keep.map(liteItem), open: open.length };
}
async function kvCas(key, change, tries){
  tries = tries || 6;""", 'kvCas head')
    srv = once(srv, "      if (r.ok) { const rows = await r.json().catch(() => []); if (Array.isArray(rows) && rows.length) return { ok: true, value: next }; }\n      else if (r.status >= 500) throw new Error('database write failed (' + r.status + ')');\n    } else {\n      r = await sb(T, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ key, value: next, updated_at: at }) });\n      if (r.ok) return { ok: true, value: next };",
"      if (r.ok) { const rows = await r.json().catch(() => []); if (Array.isArray(rows) && rows.length) { await leadSig(key, next); return { ok: true, value: next }; } }   /* patch LEADSEE: the marker */\n      else if (r.status >= 500) throw new Error('database write failed (' + r.status + ')');\n    } else {\n      r = await sb(T, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ key, value: next, updated_at: at }) });\n      if (r.ok) { await leadSig(key, next); return { ok: true, value: next }; }   /* patch LEADSEE */", 'kvCas writes')
    srv = once(srv, "  /* the CRM: the inbox list (+ the watcher's last run, the bid portal's state, the alert queue) */\n",
"""  /* patch LEADSEE: the small list the CRM's import reads (open items only) — every signed-in staff member */
  if (event.httpMethod === 'GET' && qs.leads) {
    const who = await staffAuth(event); if (!who.ok) return J(who.code, { error: who.error }, C);
    if (!dbReady()) return J(500, { error: 'Supabase is not configured on Netlify.' }, C);
    try {
      const [items, settings] = [await kvRead(KV), await kvGet(KV_SET)];
      if (items.exists === false && !items.v) { /* nothing yet */ }
      const l = liteList(items.v);
      return J(200, { ok: true, lite: true, items: l.items, open: l.open, sig: leadSigOf(items.v), settings: Object.assign({}, DEFAULT_SETTINGS, settings || {}), me: { email: who.email, admin: who.admin }, at: nowIso() }, C);
    } catch (e) { return J(502, { error: 'Could not read the lead inbox: ' + s(e && e.message) }, C); }
  }
  /* the CRM: the inbox list (+ the watcher's last run, the bid portal's state, the alert queue) */
""", 'list door')
    srv = once(srv, "exports._lib = { routeLead,", "exports._lib = { leadSigOf, liteList, KV_SIG, routeLead,", '_lib')
    open(spath, 'w', encoding='utf-8').write(srv)
    print('LEADSEE: bid-inbox.js patched')

# ───────────────────────── page ─────────────────────────
src = open(path, encoding='utf-8').read()
MARK = '/* __GC_PATCH_LEADSEE__ */'
if MARK in src:
    print('LEADSEE: index.html already patched'); sys.exit(0)
assert '__GC_PATCH_LD2__' in src and '/* ═══ patch LEADSUI' in src, 'LEADSEE needs patches LD2 and LEADSUI'

# 3. the pull: the small list (the whole one on the Lead Inbox tab / an older server)
src = once(src, "function pull(force){\n  if (busy) return Promise.resolve(false);",
"""/* patch LEADSEE: the small list (open leads only, ?leads=1); the whole inbox (?list=1) only on the 📥 Lead Inbox tab or
   when the server has no small list */
function inboxGet(){
  var tb = document.getElementById('gc-leads-tabs'), full = !!(tb && tb.getAttribute('data-tab') === 'bidboard');
  if (full) return api('GET', 'list=1').catch(function(){ return api('GET', 'leads=1'); });
  return api('GET', 'leads=1').then(function(j){ if (!j || !Array.isArray(j.items)) throw new Error('no small list'); return j; })
    .catch(function(e){ if (e && (e.status === 401 || e.status === 403)) throw e; return api('GET', 'list=1'); });
}
function pull(force){
  if (busy) return Promise.resolve(false);""", 'pull head')
src = once(src, "  return flushOut().then(function(){ return api('GET', 'list=1'); }).then(function(j){\n    S = { items: arr(j.items), watch: j.watch || null, settings: j.settings || null, notices: arr(j.notices), portal: j.portal || null, alerts: j.alerts || null, at: j.at || nowIso(), me: j.me || {} };",
"  return flushOut().then(function(){ return inboxGet(); }).then(function(j){   /* patch LEADSEE */\n    var S0 = S || {};\n    S = { items: arr(j.items), watch: j.watch || (j.lite ? S0.watch : null) || null, settings: j.settings || S0.settings || null, notices: j.notices ? arr(j.notices) : (j.lite ? arr(S0.notices) : []), portal: j.portal || (j.lite ? S0.portal : null) || null, alerts: j.alerts || (j.lite ? S0.alerts : null) || null, at: j.at || nowIso(), me: j.me || {}, lite: !!j.lite };", 'pull list')

# 4. the import: at most 200 new leads per pass
src = once(src, "function importItems(healing){\n  var added = [], updated = [], tell = [];",
               "function importItems(healing){\n  var added = [], updated = [], tell = [], nNew = 0, more = false;   /* patch LEADSEE: nNew / more */", 'import vars')
src = once(src, "  return setLeads(function(list){\n    added = []; updated = []; tell = [];\n",
               "  return setLeads(function(list){\n    added = []; updated = []; tell = []; nNew = 0; more = false;\n", 'import reset')
src = once(src, "      if (i == null) {\n        var l = fromItem(it);",
               "      if (i == null) {\n        if (++nNew > 200) { more = true; return; }   /* patch LEADSEE: at most 200 new leads per pass — the rest a moment later */\n        var l = fromItem(it);", 'import cap')
src = once(src, "  }).then(function(){\n    tell.forEach(act);\n",
               "  }).then(function(){\n    if (more) later(function(){ importItems(healing); }, 1500);   /* patch LEADSEE */\n    tell.slice(0, 200).forEach(act);\n", 'import more')

# 5. look at the marker every 30 s; a safety pull every 15 minutes; at once on coming back
src = once(src, "  document.addEventListener('visibilitychange', function(){ if (!document.hidden && Date.now() - lastPull > 180000) pull(false); });",
               "  document.addEventListener('visibilitychange', function(){ if (!document.hidden) { sigCheck(true); if (Date.now() - lastPull > 180000) pull(false); } });   /* patch LEADSEE: + the marker at once */", 'visibility')
src = once(src, "      if (Date.now() - lastPull > 7200000) pull(true);   /* patch INBOXCHEAP: owner 10/27 — check the lead list every 2 hours, not every 25 s */",
               "      sigCheck(false);   /* patch LEADSEE: the marker (one small gc_kv row) every 30 s — the inbox is collected when it changed */\n      if (Date.now() - lastPull > 900000) pull(true);   /* patch LEADSEE (was INBOXCHEAP's 2 hours): a safety pull every 15 minutes */", 'interval')
src = once(src, "function start(){\n  if (!document.body) return later(start, 200);\n  observe();\n  /* a click (a menu",
"""/* patch LEADSEE: the server's marker gc_kv "gc_lead_inbox_sig" {at, n, a} — read straight from the database (no function call) */
var SIG = { at: '', checkedAt: 0, busy: false, err: '', val: null };
var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
function sigCheck(now){
  if (SIG.busy || document.hidden || navigator.onLine === false) return;
  if (!now && Date.now() - SIG.checkedAt < 30000) return;
  try { var A = window.__GC_AUTH__; if (!A || !A.email || !A.email()) return; } catch (e) { return; }
  var u = '', k = ''; try { u = localStorage.getItem('grayco_sb_url') || ''; k = localStorage.getItem('grayco_sb_key') || ''; } catch (e) {}
  u = (u || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\\/$/, ''); k = k || SB_ANON;
  SIG.busy = true; SIG.checkedAt = Date.now();
  window.fetch(u + '/rest/v1/gc_kv?select=value&key=eq.gc_lead_inbox_sig', { headers: { apikey: k, Authorization: 'Bearer ' + k }, cache: 'no-store' })
    .then(function(r){ if (!r.ok) throw new Error('marker ' + r.status); return r.json(); })
    .then(function(rows){
      SIG.busy = false; SIG.err = '';
      var v = Array.isArray(rows) && rows[0] && rows[0].value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
      if (!v || !v.at) return;
      SIG.val = v;
      if (v.at === SIG.at) return;
      SIG.at = v.at;
      if (!lastPull) return;   /* the start-up pull is on its way */
      if (s(v.at) > s(S && S.at) || Date.now() - lastPull > 60000) pull(true);   /* something new / changed since this computer last looked */
    }, function(e){ SIG.busy = false; SIG.err = s(e && e.message); });
}
function start(){
  if (!document.body) return later(start, 200);
  observe();
  /* a click (a menu""", 'sigCheck')
src = once(src, "  status: function(){ return { at: S.at, items: S.items.length,",
               "  sig: function(){ return { at: SIG.at, checkedAt: SIG.checkedAt, err: SIG.err, val: SIG.val }; }, sigCheck: function(){ sigCheck(true); },   /* patch LEADSEE */\n  status: function(){ return { at: S.at, lite: !!S.lite, lastPull: lastPull, items: S.items.length,", 'api')

# 6b. the Leads list: a fresh unassigned (or held) lead sits on top of the default (soonest-due) sort
src = once(src, "  rows.sort(function(a, b){ if (k === 'due') { var c0 = tie(a, b);",
"""  var FRESH = W._gcLeadSee && W._gcLeadSee.fresh;   /* patch LEADSEE: new leads first in the default sort */
  if (FRESH && k === 'due') rows.forEach(function(x){ x.fr = FRESH(x.l) ? 1 : 0; });
  rows.sort(function(a, b){ if (FRESH && k === 'due' && (a.fr || b.fr)) { if (a.fr !== b.fr) return b.fr - a.fr; var ta = s(a.l.createdAt || a.l.receivedAt), tb = s(b.l.createdAt || b.l.receivedAt); if (ta !== tb) return ta < tb ? 1 : -1; }
    if (k === 'due') { var c0 = tie(a, b);""", 'leadsui sort')

# 6. the new block, right after patch LD2
JS = open(os.path.join(here, 'leadsee_tail.js'), encoding='utf-8').read().rstrip('\n')
assert JS.startswith(MARK) and '</script>' not in JS
src = once(src, "try { console.log('[GC] Lead Inbox (patch LD2) ready — window._gcLeadInbox'); } catch (e) {}\n})();\n</script>\n",
           "try { console.log('[GC] Lead Inbox (patch LD2) ready — window._gcLeadInbox'); } catch (e) {}\n})();\n</script>\n<script id=\"gc-patch-leadsee\">\n" + JS + "\n</script>\n", 'block')

open(path, 'w', encoding='utf-8').write(src)
print('LEADSEE: index.html patched')
