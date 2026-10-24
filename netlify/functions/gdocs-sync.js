/* ── GrayCo staff check (security build) ──────────────────────────────────────
   A call from the CRM must carry the signed-in person's Supabase token:
       Authorization: Bearer <access token>
   The token is checked with Supabase (/auth/v1/user) and the email must be on
   the staff list: table gc_staff (read with the service key) once it exists —
   it is then the ONLY list, so removing someone there blocks them here at
   once — and the STAFF_EMAILS variable only before that table exists.
   No token / bad token → 401.  Signed in but not staff → 403.
   (Kept inline in every function on purpose: each function is bundled alone.) */
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
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

// GrayCo — the team's Google Docs → the CRM (patch GDOCS; the reading itself is netlify/functions/_lib/gdocs.js).
// Every active staff member's Google Docs are read (Workspace domain-wide delegation with drive.readonly, or a person's own
// "Connect my Google Drive"); only business papers (proposals / quotes / estimates, invoices, change orders, contracts,
// scopes) are kept; the CRM page matches each one to its job (tail GDOCS). READ ONLY: nothing in Drive is ever changed.
//   GET  ?op=status                     → people, last read, counts, settings            (admin / office)
//   GET  ?op=inbox                      → the papers waiting / in review / recently done  (admin / office)
//   POST {op:'sync', backfill?, only?}  → read the Drives now ("Sync now")                (admin / office; backfill: admin)
//   POST {op:'mark', id, state, result} → what the CRM page did with a paper              (admin / office)
//   POST {op:'settings', …}             → switches, folders, per-person on/off            (admin)
//   GET  ?export=<docId>                → one Google Doc's text (the Change Order doc reader)  (staff)
//   POST (no op)                        → the older "Sync my Google Docs" button = sync
const GD = require('./_lib/gdocs');
function J(code, body, headers){ return { statusCode: code, headers: headers, body: JSON.stringify(body) }; }
async function extra(email){
  try {
    const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''), k = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!k) return {};
    const r = await fetch(url + '/rest/v1/gc_staff?select=profile&email=eq.' + encodeURIComponent(email), { headers: { apikey: k, Authorization: 'Bearer ' + k } });
    if (!r.ok) return {}; const row = ((await r.json()) || [])[0]; return row || {};
  } catch (e) { return {}; }
}
exports.handler = async function(event){
  const _cors = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event && event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: _cors, body: '' };
  const who = await gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode, { ok: false, error: who.error }, _cors);
  const qp = (event && event.queryStringParameters) || {};
  let body = {}; try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { body = {}; }
  const admins = String(process.env.LEAD_ADMINS || '').split(',').map(function(x){ return x.trim().toLowerCase(); }).filter(Boolean);
  const admin = who.role === 'admin' || admins.indexOf(who.email) > -1;
  const office = admin || /office/.test(who.role) || /office/i.test(String((await extra(who.email)).profile || ''));
  try {
    if (qp.export) {   /* one doc's text, for the Change Order doc reader: whoever's Drive can open it */
      const team = await GD.people();
      for (const p of team) {
        const t = await GD.tokenFor(p); if (!t.ok) continue;
        try {
          const r = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(qp.export) + '/export?mimeType=text/plain', { headers: { Authorization: 'Bearer ' + t.t } });
          if (r.ok) return J(200, { ok: true, text: await r.text() }, _cors);
        } catch (e) {}
      }
      return J(200, { ok: false, error: 'Could not read that doc (is Google connected?).' }, _cors);
    }
    const op = String(qp.op || body.op || (event.httpMethod === 'POST' ? 'sync' : 'status'));
    /* patch ESTIN: any staff member (a PM in the field) may start a new Doc from the GrayCo estimate template in their own Drive */
    if (op === 'newdoc') { if (event.httpMethod !== 'POST') return J(405, { ok: false, error: 'POST' }, _cors); return J(200, await GD.createDoc({ email: who.email, name: who.name || '' }, String(body.title || ''), String(body.html || '')), _cors); }
    if (!office) return J(403, { ok: false, error: 'Only an admin or the office can see the Google Docs import.' }, _cors);
    if (op === 'status') return J(200, Object.assign(await GD.status(), { admin: admin }), _cors);
    if (op === 'inbox') {
      const items = (await GD.inbox()).map(function(x){ return (x.state === 'new' || x.state === 'review') ? x : Object.assign({}, x, { text: '' }); });
      return J(200, { ok: true, items: items, settings: await GD.status().then(function(s){ return s.settings; }) }, _cors);
    }
    if (op === 'sync') {
      if (body.backfill && !admin) return J(403, { ok: false, error: 'Only an admin can bring in older docs.' }, _cors);
      const r = await GD.run({ backfill: !!body.backfill, only: body.only ? String(body.only).toLowerCase() : '', force: true, budgetMs: 20000 });
      return J(200, r, _cors);
    }
    if (op === 'mark') {
      if (!body.id || !/^(applied|review|ignored|undone|new)$/.test(String(body.state || ''))) return J(400, { ok: false, error: 'id and state needed' }, _cors);
      return J(200, await GD.mark(String(body.id), { state: body.state, result: body.result || null, reason: body.reason || '', by: who.name || who.email, doneAt: new Date().toISOString(),
        undoneAt: body.state === 'undone' ? new Date().toISOString() : undefined, undoneBy: body.state === 'undone' ? (who.name || who.email) : undefined }), _cors);
    }
    if (op === 'settings') {
      if (!admin) return J(403, { ok: false, error: 'Only an admin changes the Google Docs settings.' }, _cors);
      return J(200, await GD.saveSettings(body, who.name || who.email), _cors);
    }
    return J(400, { ok: false, error: 'Unknown op' }, _cors);
  } catch (e) {
    return J(200, { ok: false, error: String(e && e.message || e) }, _cors);
  }
};
