#!/usr/bin/env python3
"""Idempotent patch MKTFIX (MKTGATE, owner 11/02: "can Malcolm sign in and does all his buttons work, I don't want him in
and stuff messes up"). Malcolm Lane, the Marketing Manager, signs in with a personal e-mail; his gc_staff row is
profile 'marketing', active false, mkt_active true. Found by tools/tests/test_MKTGATE.mjs against the real handlers:

  1. staff-admin.js — his first sign-in could not finish. Team access gives him a temporary password, the CRM then asks
     him to choose his own and calls staff-admin "password-changed" to clear the mark; that call refused him (403, "not
     on the GrayCo staff list": he is never active staff), so he stayed on "Your password is saved, but the CRM could
     not finish" at every sign-in. Now the Marketing Manager himself (his token + his marketing gc_staff row) may clear
     his OWN mark; everything else in staff-admin stays admins-only.
  2. staff-admin.js — before docs/marketing-role.sql is run, Team access → Add with the Marketing Manager profile said
     "Could not add to gc_staff (400): {...PGRST204 ... mkt_active ...}". It now says: run docs/marketing-role.sql first.
  3. _lib/mm.js (+ _lib/mkt.js) — approval bypass through his marketing saves: an APPROVED (or waiting / paused) e-mail
     campaign, post, door-hanger run, week plan, ad draft, giveaway, city page, outreach or roof-check event that he
     edited afterwards kept its "approved" status, so the CRM would send / post HIS new text (and he could write the
     campaign's approvedHtml). Now an edit to such a record puts it back to draft (it must be approved again), the
     approvedHtml field is locked, and an approval decided on the old version no longer approves the edited record
     (_lib/mkt.js onApproved refuses a record marked "edited:" and says why).
  4. index.html — his page (see the INDEX list below).

    python3 tools/patch_MKTFIX.py [repo-root]
"""
import sys, os
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
MARK = '/* patch MKTFIX */'

def patch(rel, edits):
    p = os.path.join(ROOT, rel)
    t = open(p, encoding='utf-8').read()
    if MARK in t:
        print('MKTFIX: ' + rel + ' already patched'); return
    for old, new in edits:
        assert t.count(old) == 1, (rel, t.count(old), old[:90])
        t = t.replace(old, new)
    assert MARK in t, rel
    open(p, 'w', encoding='utf-8').write(t)
    print('MKTFIX: ' + rel + ' patched')

# ── 1 + 2. staff-admin.js ──────────────────────────────────────────────────────────────────────────────────────
patch('netlify/functions/staff-admin.js', [
    ("""async function setProfile(email, profile){""",
     """/* patch MKTFIX */ /* the signed-in Marketing Manager himself: his token, then his gc_staff row (profile marketing, mkt_active, never
   active staff — the staff check above refuses him by construction). Used only for his OWN "choose your own password" mark. */
async function marketingSelf(event){
  const m = /^Bearer\\s+(\\S+)$/i.exec(gcHeader(event, 'authorization').trim()); if (!m) return null;
  let user = null;
  try { const r = await fetch(sbUrl() + '/auth/v1/user', { headers: { apikey: process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON, Authorization: 'Bearer ' + m[1] } }); if (r.ok) user = await r.json(); } catch (e) { return null; }
  const email = cleanEmail(user && user.email); if (!email || !user.id) return null;
  return require('./_lib/mm.js').isMarketingRow(await staffRow(email)) ? { email: email, userId: user.id } : null;
}
async function setProfile(email, profile){"""),
    ("""  if (!r.ok) return { ok: false, status: r.status, error: /profile/.test(txt) ? 'Run docs/role-profiles.sql in Supabase first (it adds the Profile column).'""",
     """  if (!r.ok) return { ok: false, status: r.status, error: profile === 'marketing' && /profile|check constraint|mkt_active/i.test(txt) ? 'Run docs/marketing-role.sql in Supabase first (it adds the Marketing Manager profile).' : /profile/.test(txt) ? 'Run docs/role-profiles.sql in Supabase first (it adds the Profile column).'"""),
    ("""  const who = await gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode, { error: who.error });""",
     """  const who = await gcStaffAuth(event);
  /* patch MKTFIX: the Marketing Manager finishes his own "choose your own password" (else he stays on that screen) */
  if (!who.ok && who.statusCode === 403 && event.httpMethod === 'POST' && /"action"\\s*:\\s*"password-changed"/.test(String(event.body || ''))) {
    const mm = await marketingSelf(event);
    if (mm) { const ok = await setAuthUser(mm.userId, { app_metadata: mustChangeMeta(false) }); return ok ? J(200, { ok: true }) : J(502, { error: 'Could not finish the password change. Try again.' }); }
  }
  if (!who.ok) return J(who.statusCode, { error: who.error });"""),
    ("""      if (!up.ok) return J(502, { error: 'Could not add to gc_staff (' + up.status + '): ' + (await up.text()).slice(0, 200) });""",
     """      if (!up.ok) { const ut = (await up.text()).slice(0, 300); if (profile === 'marketing' && /mkt_active|profile|check constraint|schema cache/i.test(ut)) return J(409, { error: 'Run docs/marketing-role.sql in Supabase first (it adds the Marketing Manager profile), then Add him again. Nothing was changed.' }); return J(502, { error: 'Could not add to gc_staff (' + up.status + '): ' + ut.slice(0, 200) }); }   /* patch MKTFIX */"""),
])

# ── 3. _lib/mm.js: an edit after approval needs approving again ────────────────────────────────────────────────
patch('netlify/functions/_lib/mm.js', [
    ("""const LOCKED_FIELDS = ['apprId', 'approvedBy', 'approvedEmail', 'approvedAt', 'autoApproved', 'vetoUntil', 'claim', 'claimAt', 'postedAt', 'sentAt', 'stats', 'submits', 'submittedBy', 'weekApproved', 'apprStage', 'mm'];""",
     """const LOCKED_FIELDS = ['apprId', 'approvedBy', 'approvedEmail', 'approvedAt', 'autoApproved', 'vetoUntil', 'claim', 'claimAt', 'postedAt', 'sentAt', 'stats', 'submits', 'submittedBy', 'weekApproved', 'apprStage', 'mm', 'approvedHtml', 'editedAfter'];   /* patch MKTFIX: + approvedHtml (what a campaign sends), editedAfter */
/* patch MKTFIX */ /* what goes out to customers / the public is only ever what was approved: a waiting / approved / paused record of these
   that he changes afterwards is a draft again (status, places, times — anything but the bookkeeping fields below) */
const SEND_COLLS = { posts: 1, campaigns: 1, neighbors: 1, socweeks: 1, addrafts: 1, adchanges: 1, giveaways: 1, citypages: 1, outreach: 1, roofevents: 1 };
const META_KEYS = { id: 1, at: 1, by: 1, status: 1, results: 1, updatedAt: 1, createdAt: 1, reason: 1, needsManual: 1, lastError: 1 };
function normV(v){ v = redact(v); if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) return 'null'; return JSON.stringify(v); }
function contentChanged(cur, inc){ return Object.keys(inc || {}).some(function(k){ if (META_KEYS[k] || LOCKED_FIELDS.indexOf(k) >= 0 || PII_KEYS.test(k)) return false; return normV(cur[k]) !== normV(inc[k]); }); }"""),
    ("""        if (c === 'experiments') rec.stage = cur ? expStage(s(cur.stage), s(inc.stage)) : 'idea';""",
     """        if (cur && SEND_COLLS[c] && /^(waiting|approved|paused)$/.test(was) && (rec.status === 'draft' || contentChanged(cur, inc))) {   /* patch MKTFIX: changed (or taken back) after approval → approve again; the old approval no longer counts */
          rec.status = 'draft'; rec.weekApproved = false; rec.editedAfter = was; if (s(cur.apprId)) rec.apprId = 'edited:' + s(cur.apprId).replace(/^edited:/, '');
        }
        if (c === 'experiments') rec.stage = cur ? expStage(s(cur.stage), s(inc.stage)) : 'idea';"""),
])

# ── 3b. _lib/mkt.js: an approval decided on the old version does not approve the edited record ─────────────────
patch('netlify/functions/_lib/mkt.js', [
    ("""  const last = (item.approvals || []).slice(-1)[0] || {};
  const r = await update(function(d){
    const rec = get(d, coll, id); if (!rec) return null;""",
     """  const last = (item.approvals || []).slice(-1)[0] || {};
  let edited = false;   /* patch MKTFIX */
  const r = await update(function(d){
    const rec = get(d, coll, id); if (!rec) return null;
    if (/^edited:/.test(s(rec.apprId))) { edited = true; return null; }   /* patch MKTFIX: changed after it was sent for approval (_lib/mm.js) */"""),
    ("""  if (!r.ok) return { ok: false, error: 'Approved, but the marketing record could not be updated — try again.' };""",
     """  if (edited) return { ok: false, error: 'Not sent: the Marketing Manager changed this draft after it was sent for approval. It is back in his drafts — approve the new version when he sends it again.' };   /* patch MKTFIX */
  if (!r.ok) return { ok: false, error: 'Approved, but the marketing record could not be updated — try again.' };"""),
])

# ── 5. soc.js: 📺 Lobby TV → 🏷 Offers for the Marketing Manager (docs: admin, office and the Marketing Manager; his offers
#       wait for an admin's ✓ Approve). His page may not write gc_kv, so "Save offers" always said "Could not save the
#       offers." and he saw no offers. Now through soc.js: he reads the offers; an offer he adds or changes is saved as
#       waiting (pending) — lobby.js serves only approved ones; an unchanged offer keeps its approval.
patch('netlify/functions/soc.js', [
    ("""  if (/^mf_/.test(op)) { const a = await require('./_lib/mktfeat.js').op(op, body, who, { marketing: true }); return R(a.status, a.out); }""",
     """  if (op === 'mm_lobby_offers') {   /* patch MKTFIX */ /* 📺 Lobby TV → 🏷 Offers: read; save his changes as waiting for an admin */
    const K = 'gc_lobby_offers', row = await M.kvRow(K), cur = row.v && typeof row.v === 'object' && !Array.isArray(row.v) ? row.v : {}, offers = Object.assign({}, cur.offers || {});
    const inc = body.value && body.value.offers && typeof body.value.offers === 'object' ? body.value.offers : null;
    let n = 0;
    if (inc) {
      const norm = function(o){ const x = Object.assign({}, o || {}); ['at', 'by', 'pending', 'approvedBy', 'approvedAt'].forEach(function(k){ delete x[k]; }); return JSON.stringify(MM.redact(x)); };
      Object.keys(inc).slice(0, 80).forEach(function(id){ const o = inc[id]; if (!/^[\\w-]{1,60}$/.test(id) || !o || typeof o !== 'object' || Array.isArray(o)) return; if (offers[id] && norm(offers[id]) === norm(o)) return;
        const nx = Object.assign({}, MM.redact(o), { id: id, pending: true, by: who.name || who.email, at: new Date().toISOString() }); delete nx.approvedBy; delete nx.approvedAt; offers[id] = nx; n++; });
      if (n) { const sb = (process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\\/$/, ''), k = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const w = await fetch(sb + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: K, value: Object.assign({}, cur, { offers: offers, at: new Date().toISOString() }), updated_at: new Date().toISOString() }) });
        if (!w.ok) return R(502, { ok: false, error: 'Could not save the offers (' + w.status + ').' }); }
    }
    return R(200, { ok: true, changed: n, value: Object.assign({}, cur, { offers: offers }) });
  }
  if (/^mf_/.test(op)) { const a = await require('./_lib/mktfeat.js').op(op, body, who, { marketing: true }); return R(a.status, a.out); }"""),
])

# ── 4. index.html
#   a. his left menu: the OFFICEFIX Employees role list put "Marketing Manager": ["marketing", "myprofile"] in the page's role
#      table, and that table won over patch MMTABS's own list — his tabs (My To-Do, My leads, Marketing approvals, E-mail,
#      Social, Calendar, Reviews & referrals, Ads, Media, Ideas, Marketing logins) and 🧭 GrayCo Systems (marketing links,
#      📺 Lobby TV) were gone and refused. His menu is MMTABS's list again (+ My Profile from the table).
#   b. 💎 Team access listed him as "staff (off)" (he is never active staff on purpose) — no "(off)" for an active
#      Marketing Manager (the Profile column says Marketing Manager).
#   c. the Lobby TV editor reads / saves his offers (and the marketing document) through soc.js.
MMT = "(role === 'Marketing Manager' ? MM_TABS[role].concat(arr(ux()[role]).filter(function(x){ return MM_TABS[role].indexOf(x) < 0; })) : null) || ux()[role] || MM_TABS[role]"
patch('index.html', [
    ("    var role = effRole(), order = ux()[role] || MM_TABS[role];",
     "    var role = effRole(), order = " + MMT + ";   /* patch MKTFIX: his tabs (MMTABS) win over the role table's [marketing, myprofile] */"),
    ("      var role = effRole(), l = ux()[role] || MM_TABS[role];",
     "      var role = effRole(), l = " + MMT + ";   /* patch MKTFIX */"),
    ("esc(p.role) + (p.active === false ? ' (off)' : '')",
     "esc(p.role) + (p.active === false && p.mkt_active !== true /* patch MKTFIX: the Marketing Manager is on */ ? ' (off)' : '')"),
    ("""function kvGet(key){
  var c; try { c = creds(); } catch (e) { return Promise.resolve(undefined); }
  return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value,updated_at', { headers: sbH(), cache: 'no-store' })""",
     """/* patch MKTFIX */ /* the Marketing Manager's page may not read / write gc_kv: his offers and the marketing document come through soc.js */
function mmLobby(key){ return isMM() && !allowed() && !!W._gcMMData && (key === 'gc_lobby_offers' || key === 'gc_mkt_v1'); }
function kvGet(key){
  if (mmLobby(key)) return key === 'gc_mkt_v1' ? (W._gcMMKv ? W._gcMMKv.read(key).then(function(v){ return v; }, function(){ return undefined; }) : Promise.resolve(undefined))
    : W._gcMMData.call({ op: 'mm_lobby_offers' }).then(function(j){ return j && j.ok ? j.value : undefined; });
  var c; try { c = creds(); } catch (e) { return Promise.resolve(undefined); }
  return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value,updated_at', { headers: sbH(), cache: 'no-store' })"""),
    ("""function kvPut(key, value){
  var c = creds();
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: sbH({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: key, value: value, updated_at: nowIso() }) }).then(function(r){ return r.ok; }, function(){ return false; });""",
     """function kvPut(key, value){
  if (mmLobby(key)) return key === 'gc_lobby_offers' ? W._gcMMData.call({ op: 'mm_lobby_offers', value: value }).then(function(j){ return !!(j && j.ok); }, function(){ return false; }) : Promise.resolve(false);
  var c = creds();
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: sbH({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: key, value: value, updated_at: nowIso() }) }).then(function(r){ return r.ok; }, function(){ return false; });"""),
])
