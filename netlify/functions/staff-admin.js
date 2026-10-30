// netlify/functions/staff-admin.js
// GrayCo — "Team access": who may sign in to the CRM. Used by the 💎 → Team access
// panel. Only a signed-in person whose gc_staff role is 'admin' can list, add,
// remove or reset; any signed-in staff member can ask "who am I" (action=me).
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY (already set), SUPABASE_ANON_KEY.
//
//   GET  ?action=me                         → { email, role, name }
//   GET  ?action=list                       → { staff: [ {email,name,role,active,added_by,added_at} ] }
//   POST { action:'add',    email, name, role:'staff'|'admin', profile? }
//        → creates the sign-in (with a temporary password shown ONCE) and puts the
//          person on gc_staff. Re-adding a removed person lets them back in.
//   POST { action:'profile', email, profile } → the person's job profile (patch RP): '' (from their role in
//          Admin → Employees) | estimator | insurance | mitigation | super | pm | apm | office | field. The CRM shows that
//          profile's menu, home dashboard and field view. Needs docs/role-profiles.sql (gc_staff.profile).
//   POST { action:'remove', email }         → off gc_staff (blocked at once) + sign-in banned
//   POST { action:'reset',  email }         → new temporary password, shown ONCE; they must choose their own at sign-in
//   POST { action:'start-password', password, emails:[…] | all:true }   (patch PWRESET, admins)
//        → sets ONE starting password the admin chose for those people (everyone on the list except the admin
//          themself with all:true) and marks each sign-in app_metadata.must_change_password = true, so the CRM
//          shows only "Choose your own password" until they do. The password is never returned, saved or logged.
//   POST { action:'password-changed' }      → any signed-in staff member, about THEMSELF: clears their
//          must_change_password mark after the CRM changed their password (app_metadata: they cannot edit it).
//
// Nothing here is saved in the app: a temporary password is returned to the admin
// once and lives only in Supabase Auth (hashed).

require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');
/* ── GrayCo staff check (security build) ──────────────────────────────────────
   A call from the CRM must carry the signed-in person's Supabase token:
       Authorization: Bearer <access token>
   The token is checked with Supabase (/auth/v1/user) and the email must be on
   the staff list: table gc_staff (read with the service key) once it exists —
   it is then the ONLY list, so removing someone there blocks them here at
   once — and the STAFF_EMAILS variable only before that table exists.
   No token / bad token → 401.  Signed in but not staff → 403.
   (Kept inline in every function on purpose: each function is bundled alone.) */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret) */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* CORS: only the CRM's own site may call from a browser (SITE_ORIGIN, comma list). */
function gcCors(event, methods, extraHeaders){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',')
    .map(function(s){ return s.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event, 'origin').replace(/\/$/, '');
  return {
    'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization' + (extraHeaders ? ', ' + extraHeaders : ''),
    'Access-Control-Allow-Methods': methods || 'POST, OPTIONS'
  };
}
async function gcStaffAuth(event){
  const m = /^Bearer\s+(\S+)$/i.exec(gcHeader(event, 'authorization').trim());
  if (!m) return { ok: false, statusCode: 401, error: 'Sign in to the GrayCo CRM first (no sign-in token was sent).' };
  const token = m[1];
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  let user = null;
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (r.ok) user = await r.json();
  } catch (e) {
    return { ok: false, statusCode: 503, error: 'Could not reach the sign-in service. Try again.' };
  }
  const email = String((user && user.email) || '').trim().toLowerCase();
  if (!email) return { ok: false, statusCode: 401, error: 'Your sign-in has expired. Sign in again.' };
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let role = null, listed = false, name = '';
  if (svc) {
    try {
      const r = await fetch(url + '/rest/v1/gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(email),
        { headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
      if (r.ok) {
        listed = true;
        const rows = await r.json();
        const row = Array.isArray(rows) && rows[0];
        if (row && row.active !== false) { role = String(row.role || 'staff').toLowerCase(); name = row.name || ''; }
      }
    } catch (e) {}
  }
  if (!listed) {
    const env = (process.env.STAFF_EMAILS || '').split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
    if (env.indexOf(email) > -1) role = 'staff';
  }
  if (!role) return { ok: false, statusCode: 403, error: 'This account (' + email + ') is not on the GrayCo staff list.' };
  return { ok: true, email: email, role: role, name: name, userId: user.id || '' };
}
/* ── end GrayCo staff check ────────────────────────────────────────────────── */


function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function svcHeaders(extra){
  const k = svcKey();
  return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {});
}
function tempPassword(){
  // 16 characters, letters + digits, no look-alikes (0/O, 1/l/I)
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const b = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += abc[b[i] % abc.length];
  return out;
}
function cleanEmail(e){ return String(e || '').trim().toLowerCase(); }
function okEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

/* patch RP: the job profile on gc_staff (docs/role-profiles.sql). Only these; '' = from the role in Admin → Employees. */
const PROFILES = ['', 'estimator', 'insurance', 'mitigation', 'super', 'pm', 'apm', 'office', 'field', 'marketing'];   /* patch PMG: + apm (Assistant PM) · patch MM: + marketing */
function cleanProfile(p){ const v = String(p == null ? '' : p).trim().toLowerCase(); return PROFILES.indexOf(v) > -1 ? v : null; }
async function listStaff(){
  /* select=* so the list works before and after docs/role-profiles.sql (the profile column) */
  const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=*&order=email.asc', { headers: svcHeaders() });
  if (!r.ok) throw new Error('Could not read gc_staff (' + r.status + '). Has docs/security-lockdown.sql been run?');
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map(function(x){ return { email: x.email, name: x.name, role: x.role, active: x.active, added_by: x.added_by, added_at: x.added_at, profile: x.profile || '', mkt_active: x.mkt_active === true }; });
}
/* patch MM: the Marketing Manager profile is NEVER active staff (docs/marketing-role.sql): active = false, mkt_active = true, role staff.
   Every staff rule in the database and the functions refuses him by construction; only the marketing calls let him in.
   Moving someone off the marketing profile makes them ordinary active staff again. */
async function staffRow(email){ try { const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=*&email=eq.' + encodeURIComponent(email), { headers: svcHeaders() }); if (!r.ok) return null; return (await r.json())[0] || null; } catch (e) { return null; } }
async function setProfile(email, profile){
  const row = await staffRow(email), body = { profile: profile || null };
  if (profile === 'marketing') {
    if (!row || !('mkt_active' in row)) return { ok: false, status: 409, error: 'Run docs/marketing-role.sql in Supabase first (it adds the Marketing Manager profile).' };
    if (String(row.role).toLowerCase() === 'admin') return { ok: false, status: 400, error: 'An admin cannot have the Marketing Manager profile.' };
    Object.assign(body, { active: false, mkt_active: true, role: 'staff' }); if ('payroll' in row) body.payroll = false;
  } else if (row && String(row.profile || '').toLowerCase() === 'marketing') Object.assign(body, { active: row.mkt_active === true, mkt_active: false });
  const r = await fetch(sbUrl() + '/rest/v1/gc_staff?email=eq.' + encodeURIComponent(email), {
    method: 'PATCH', headers: svcHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(body)
  });
  const txt = await r.text();
  if (!r.ok) return { ok: false, status: r.status, error: /profile/.test(txt) ? 'Run docs/role-profiles.sql in Supabase first (it adds the Profile column).' : 'Could not save the profile (' + r.status + '): ' + txt.slice(0, 200) };
  let rows = []; try { rows = JSON.parse(txt); } catch (e) {}
  if (!Array.isArray(rows) || !rows.length) return { ok: false, status: 404, error: email + ' is not on the staff list.' };
  return { ok: true };
}
async function signIns(){
  const staff = await listStaff(), want = {}, out = [];
  (Array.isArray(staff) ? staff : []).forEach(function(p){ if (p && p.email) want[cleanEmail(p.email)] = p; });
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(sbUrl() + '/auth/v1/admin/users?page=' + page + '&per_page=200', { headers: svcHeaders() });
    if (!r.ok) break;
    const j = await r.json();
    const users = Array.isArray(j) ? j : (j.users || []);
    users.forEach(function(u){ const e = cleanEmail(u.email); if (!want[e]) return;
      out.push({ email: e, lastSignInAt: u.last_sign_in_at || null, createdAt: u.created_at || null, banned: !!(u.banned_until && Date.parse(u.banned_until) > Date.now()), confirmed: !!(u.email_confirmed_at || u.confirmed_at) });
      delete want[e]; });
    if (users.length < 200) break;
  }
  Object.keys(want).forEach(function(e){ out.push({ email: e, lastSignInAt: null, noLogin: true }); });
  return out;
}
async function findAuthUser(email){
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(sbUrl() + '/auth/v1/admin/users?page=' + page + '&per_page=200', { headers: svcHeaders() });
    if (!r.ok) return null;
    const j = await r.json();
    const users = Array.isArray(j) ? j : (j.users || []);
    const hit = users.find(function(u){ return cleanEmail(u.email) === email; });
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}
/* patch PWRESET: the "choose your own password" mark — app_metadata, so only the service key can set or clear it */
function mustChangeMeta(on){ return on ? { must_change_password: true, must_change_password_at: new Date().toISOString() } : { must_change_password: false, must_change_password_at: null }; }
async function allAuthUsers(){
  const out = {};
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(sbUrl() + '/auth/v1/admin/users?page=' + page + '&per_page=200', { headers: svcHeaders() });
    if (!r.ok) break;
    const j = await r.json();
    const users = Array.isArray(j) ? j : (j.users || []);
    users.forEach(function(u){ const e = cleanEmail(u.email); if (e) out[e] = u; });
    if (users.length < 200) break;
  }
  return out;
}
async function setAuthUser(id, patch){
  const r = await fetch(sbUrl() + '/auth/v1/admin/users/' + encodeURIComponent(id), {
    method: 'PUT', headers: svcHeaders(), body: JSON.stringify(patch)
  });
  return r.ok;
}

exports.handler = async function (event) {
  const headers = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json' });
  const J = function(code, body){ return { statusCode: code, headers, body: JSON.stringify(body) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (!svcKey()) return J(500, { error: 'SUPABASE_SERVICE_KEY is not set on Netlify.' });

  const who = await gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode, { error: who.error });

  const q = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && (q.action || 'me') === 'me') {
    let profile = '';
    try { const pr = await fetch(sbUrl() + '/rest/v1/gc_staff?select=*&email=eq.' + encodeURIComponent(who.email), { headers: svcHeaders() }); if (pr.ok) { const rows = await pr.json(); profile = (rows && rows[0] && rows[0].profile) || ''; } } catch (e) {}
    return J(200, { email: who.email, role: who.role, name: who.name || '', profile: profile });
  }
  /* patch PWRESET: after the CRM changed the signed-in person's own password, their "choose your own" mark is cleared */
  if (event.httpMethod === 'POST') {
    let pb = null; try { pb = JSON.parse(event.body || '{}'); } catch (e) { pb = null; }
    if (pb && pb.action === 'password-changed') {
      if (!who.userId) return J(400, { error: 'Sign in again.' });
      const ok = await setAuthUser(who.userId, { app_metadata: mustChangeMeta(false) });
      return ok ? J(200, { ok: true }) : J(502, { error: 'Could not finish the password change. Try again.' });
    }
  }
  if (!require('./_lib/staff-role.js').isAdmin(who)) return J(403, { error: 'Only an admin can change who has access.' });   /* patch AUTHFIX: an owner counts as an admin */

  try {
    if (event.httpMethod === 'GET') {
      if (q.action === 'list') return J(200, { staff: await listStaff() });
      /* patch ADM: when each person on the staff list last signed in (Supabase sign-in records) — dates only */
      if (q.action === 'signins') return J(200, { signins: await signIns() });
      return J(400, { error: 'Unknown action.' });
    }
    if (event.httpMethod !== 'POST') return J(405, { error: 'Method not allowed' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'Invalid JSON' }); }
    const action = body.action;

    if (action === 'start-password') {   /* patch PWRESET */
      const pw = typeof body.password === 'string' ? body.password : '';
      if (pw.length < 10 || pw.length > 72) return J(400, { error: 'The starting password needs 10 to 72 characters.' });
      const staff = (await listStaff()).filter(function(p){ return p && p.email && (p.active !== false || p.mkt_active === true); });
      let want;
      if (body.all === true) want = staff.map(function(p){ return cleanEmail(p.email); });
      else want = (Array.isArray(body.emails) ? body.emails : []).map(cleanEmail).filter(okEmail);
      want = want.filter(function(e, i, a){ return a.indexOf(e) === i && e !== who.email; });   /* never the admin themself */
      if (!want.length) return J(400, { error: 'Pick at least one person (you cannot set your own this way).' });
      const onList = {}; staff.forEach(function(p){ onList[cleanEmail(p.email)] = true; });
      const users = await allAuthUsers();
      const done = [], skipped = [];
      for (const e of want) {
        if (!onList[e]) { skipped.push({ email: e, why: 'not on the active staff list' }); continue; }
        const u = users[e];
        if (!u) { skipped.push({ email: e, why: 'no sign-in yet (use Add)' }); continue; }
        const ok = await setAuthUser(u.id, { password: pw, app_metadata: mustChangeMeta(true) });
        if (ok) done.push(e); else skipped.push({ email: e, why: 'Supabase refused the change' });
      }
      return J(200, { ok: done.length > 0, done: done, skipped: skipped, error: done.length ? undefined : 'Nobody was changed.' });
    }

    const email = cleanEmail(body.email);
    if (!okEmail(email)) return J(400, { error: 'A valid email address is required.' });

    if (action === 'profile') {
      const profile = cleanProfile(body.profile);
      if (profile === null) return J(400, { error: 'Unknown profile. Use one of: ' + PROFILES.filter(Boolean).join(', ') + ' (or empty).' });
      const r = await setProfile(email, profile);
      if (!r.ok) return J(r.status === 404 ? 404 : 502, { error: r.error });
      return J(200, { ok: true, email: email, profile: profile });
    }

    if (action === 'add') {
      const role = String(body.role || 'staff').toLowerCase() === 'admin' ? 'admin' : 'staff';
      const profile = cleanProfile(body.profile);
      if (profile === 'marketing' && role === 'admin') return J(400, { error: 'An admin cannot have the Marketing Manager profile.' });
      const name = String(body.name || '').trim().slice(0, 80);
      // 1. on the list (this is what RLS and the functions check)
      const up = await fetch(sbUrl() + '/rest/v1/gc_staff?on_conflict=email', {
        method: 'POST',
        headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(Object.assign({ email: email, name: name, role: role, active: profile !== 'marketing', added_by: who.email }, profile === 'marketing' ? { profile: 'marketing', mkt_active: true } : {}))   /* patch MM: never active staff */
      });
      if (!up.ok) return J(502, { error: 'Could not add to gc_staff (' + up.status + '): ' + (await up.text()).slice(0, 200) });
      // 2. a sign-in for them
      const pw = tempPassword();
      const cr = await fetch(sbUrl() + '/auth/v1/admin/users', {
        method: 'POST', headers: svcHeaders(),
        body: JSON.stringify({ email: email, password: pw, email_confirm: true, user_metadata: { name: name }, app_metadata: mustChangeMeta(true) })   /* patch PWRESET */
      });
      /* patch RP: the profile (if one was picked; an older database without the column just skips it) */
      let profileNote = '';
      if (profile) { const pr = await setProfile(email, profile); if (!pr.ok) profileNote = ' Profile not saved: ' + pr.error; }
      if (cr.ok) return J(200, { ok: true, email: email, role: role, profile: profile || '', created: true, tempPassword: pw, note: profileNote || undefined });
      // already has a sign-in (e.g. was removed before): lift any ban, keep their password
      const existing = await findAuthUser(email);
      if (existing) {
        await setAuthUser(existing.id, { ban_duration: 'none' });
        return J(200, { ok: true, email: email, role: role, created: false,
          note: 'This person already had a sign-in; it is switched back on with their existing password. Use "Reset password" if they need a new one.' });
      }
      return J(502, { ok: false, error: 'On the list, but the sign-in could not be created (' + cr.status + '): ' + (await cr.text()).slice(0, 200) });
    }

    if (action === 'remove') {
      if (email === who.email) return J(400, { error: 'You cannot remove yourself.' });
      const all = await listStaff();
      const target = all.find(function(x){ return cleanEmail(x.email) === email; });
      if (target && String(target.role).toLowerCase() === 'admin' && target.active !== false) {
        const admins = all.filter(function(x){ return String(x.role).toLowerCase() === 'admin' && x.active !== false; });
        if (admins.length <= 1) return J(400, { error: 'That is the last admin. Make someone else admin first.' });
      }
      const del = await fetch(sbUrl() + '/rest/v1/gc_staff?email=eq.' + encodeURIComponent(email), {
        method: 'DELETE', headers: svcHeaders({ Prefer: 'return=minimal' })
      });
      if (!del.ok) return J(502, { error: 'Could not remove from gc_staff (' + del.status + ').' });
      // ban the sign-in too, so the account cannot even get a new token
      const u = await findAuthUser(email);
      let banned = false;
      if (u) banned = await setAuthUser(u.id, { ban_duration: '876000h' });
      return J(200, { ok: true, email: email, removed: true, signInBlocked: banned });
    }

    if (action === 'reset') {
      const u = await findAuthUser(email);
      if (!u) return J(404, { error: 'No sign-in exists for ' + email + '. Use Add.' });
      const pw = tempPassword();
      const ok = await setAuthUser(u.id, { password: pw, ban_duration: 'none', app_metadata: mustChangeMeta(true) });   /* patch PWRESET */
      if (!ok) return J(502, { error: 'Could not set a new password.' });
      return J(200, { ok: true, email: email, tempPassword: pw });
    }

    return J(400, { error: 'Unknown action: ' + action });
  } catch (e) {
    return J(500, { error: e.message });
  }
};
