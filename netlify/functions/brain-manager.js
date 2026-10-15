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

// netlify/functions/brain-manager.js
// GrayCo Business Brain — manage brain_files (list/get/update/delete) + changelog.
//
// Required env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//
// Supabase tables expected:
//   brain_files    (name text PK, category text, content text, updated_at timestamptz)
//   brain_changelog(id bigserial PK, file_name text, action text, actor text, note text, created_at timestamptz default now())

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function sb(path, opts) {
  return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    }
  }, opts || {}));
}

async function logChange(fileName, action, actor, note) {
  try {
    await sb('brain_changelog', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ file_name: fileName, action: action, actor: actor || 'unknown', note: note || '' })
    });
  } catch (e) { /* changelog is best-effort */ }
}

exports.handler = async function (event) {
  const headers = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const who = await gcStaffAuth(event);
  if (!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ error: who.error }) };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_URL / SUPABASE_SERVICE_KEY not set on Netlify.' }) };
  }

  try {
    // ── GET actions ──────────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      const action = q.action || 'list';

      if (action === 'list') {
        const r = await sb('brain_files?select=name,category,content,updated_at&order=category.asc,name.asc');
        const files = await r.json();
        return { statusCode: 200, headers, body: JSON.stringify({ files: Array.isArray(files) ? files : [] }) };
      }

      if (action === 'get') {
        const name = q.file;
        if (!name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'file required' }) };
        const r = await sb('brain_files?name=eq.' + encodeURIComponent(name) + '&select=name,category,content,updated_at');
        const rows = await r.json();
        return { statusCode: 200, headers, body: JSON.stringify({ file: (rows && rows[0]) || null }) };
      }

      if (action === 'changelog') {
        const limit = Math.min(parseInt(q.limit || '100', 10) || 100, 500);
        const r = await sb('brain_changelog?select=*&order=created_at.desc&limit=' + limit);
        const rows = await r.json();
        return { statusCode: 200, headers, body: JSON.stringify({ changelog: Array.isArray(rows) ? rows : [] }) };
      }

      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action: ' + action }) };
    }

    // ── POST actions ─────────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
      const action = body.action;
      const actor = (body.actor || body.currentUser || 'unknown') + ' <' + who.email + '>';

      if (action === 'update') {
        const name = body.name;
        if (!name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name required' }) };
        const row = {
          name: name,
          category: body.category || 'general',
          content: body.content != null ? body.content : '',
          updated_at: new Date().toISOString()
        };
        // upsert on primary key `name`
        const r = await sb('brain_files', {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(row)
        });
        if (!r.ok) { const t = await r.text(); return { statusCode: r.status, headers, body: JSON.stringify({ error: t }) }; }
        await logChange(name, 'update', actor, body.note || '');
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, name: name }) };
      }

      if (action === 'delete') {
        const name = body.name;
        if (!name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name required' }) };
        const r = await sb('brain_files?name=eq.' + encodeURIComponent(name), { method: 'DELETE' });
        if (!r.ok) { const t = await r.text(); return { statusCode: r.status, headers, body: JSON.stringify({ error: t }) }; }
        await logChange(name, 'delete', actor, body.note || '');
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action: ' + action }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
