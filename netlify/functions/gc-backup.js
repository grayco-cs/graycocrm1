// netlify/functions/gc-backup.js
// GrayCo — nightly protected backup. Scheduled in netlify.toml ([functions."gc-backup"]).
// Copies every row of the CRM's cloud tables into the private table gc_backups
// (one row per table per night: a jsonb snapshot + time). Keeps the newest 30
// per table. Never deletes a kept snapshot (keep = true: the fresh-start copy). gc_backups has Row Level Security on and NO policies, so the public
// key and every signed-in browser get nothing — only this function (service key)
// can read or write it. A bad sync or a stolen password cannot erase history.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY (already set).
// Restore: Supabase → SQL editor → see docs/SECURITY-SETUP.md ("Getting a backup back").
//
// Netlify does not let anyone call a scheduled function by its URL in production.
// As a second lock, any call that is not the scheduler must come from a signed-in admin.

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


const KEEP = 30;
// patch K: gc_admin_kv (the owners-only cash / bank records, docs/admin-data.sql) is backed up too —
// into gc_backups, which has no web access at all.
const TABLES = ['gc_kv', 'gc_admin_kv', 'app_data', 'projects', 'project_estimates', 'project_scope',
                'project_materials', 'estimate_line_items', 'products',
                // RoofScout (docs/roofscout-setup.sql); skipped until those tables exist
                'rs_leads', 'rs_activity', 'rs_settings', 'rs_profiles'];

function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function H(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }

const ORDER = { gc_kv: 'key', gc_admin_kv: 'key', app_data: 'key', rs_leads: 'id', rs_activity: 'id' };   // others are small; no guessed column names
async function readAll(table){
  const out = [];
  const ord = ORDER[table] ? '&order=' + ORDER[table] + '.asc' : '';
  for (let from = 0; from < 200000; from += 1000) {
    const r = await fetch(sbUrl() + '/rest/v1/' + table + '?select=*' + ord, { headers: H({ Range: from + '-' + (from + 999), 'Range-Unit': 'items' }) });
    if (r.status === 404) return null;                       // table does not exist here
    if (!r.ok && r.status !== 206) throw new Error(table + ' read ' + r.status);
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error(table + ' read: not a list');
    out.push.apply(out, rows);
    if (rows.length < 1000) break;
  }
  return out;
}

// Only this table's own nightly rows are ever let go: source is exactly the table
// name, and a row marked keep (the fresh-start snapshot, docs/fresh-start.sql —
// its source is 'fresh-start/<table>' anyway) is never selected. The database
// also refuses to delete a keep row (trigger gc_backups_keep_guard).
async function prune(table){
  const q = sbUrl() + '/rest/v1/gc_backups?select=id&source=eq.' + encodeURIComponent(table) +
    '&order=taken_at.desc&offset=' + KEEP + '&limit=500';
  let r = await fetch(q + '&keep=not.is.true', { headers: H() });
  if (r.status === 400) r = await fetch(q, { headers: H() });   // before fresh-start.sql there is no keep column (and no kept rows)
  if (!r.ok) return 0;
  const old = await r.json();
  if (!Array.isArray(old) || !old.length) return 0;
  await fetch(sbUrl() + '/rest/v1/gc_backups?id=in.(' + old.map(function(x){ return Number(x.id); }).join(',') + ')',
    { method: 'DELETE', headers: H({ Prefer: 'return=minimal' }) });
  return old.length;
}

function isScheduled(event){
  try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; }
}

exports.handler = async function (event) {
  event = event || {};
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (!isScheduled(event)) {
    const who = await gcStaffAuth(event);
    if (!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ error: who.error }) };
    if (who.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admins only.' }) };
  }
  if (!svcKey()) return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY not set.' }) };

  const report = [];
  for (const t of TABLES) {
    try {
      const rows = await readAll(t);
      if (rows === null) { report.push({ table: t, skipped: 'no such table' }); continue; }
      const ins = await fetch(sbUrl() + '/rest/v1/gc_backups', {
        method: 'POST', headers: H({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ source: t, row_count: rows.length, snapshot: rows })
      });
      if (!ins.ok) { report.push({ table: t, error: 'save ' + ins.status }); continue; }
      // only after a good save is anything old let go
      const removed = await prune(t);
      report.push({ table: t, rows: rows.length, pruned: removed });
    } catch (e) {
      report.push({ table: t, error: e.message });
    }
  }
  console.log('[gc-backup]', JSON.stringify(report));
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, at: new Date().toISOString(), report }) };
};
