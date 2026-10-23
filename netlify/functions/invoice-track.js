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

// netlify/functions/invoice-track.js
// Tracks when a customer OPENS an invoice.
//   GET ?hit=<invId>   -> logs a view (timestamp) for that invoice, returns a 1x1 transparent GIF.
//                          (Used as both a tracking pixel for emails AND a beacon from the invoice page.)
//   GET ?views=<invId> -> returns the view log for that invoice (JSON) so the CRM can display it.
//
// Storage: Supabase table `app_data` (key/value), same table the CRM uses.
//   key = 'gc_invoice_views:<invId>'  value = JSON array of { at: ISO, ua: string }
//
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function sbHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
}

async function readViews(key) {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/app_data?key=eq.' + encodeURIComponent(key) + '&select=value', { headers: sbHeaders() });
    if (!r.ok) return [];
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length && rows[0].value) {
      const v = rows[0].value;
      return Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v) : []);
    }
  } catch (e) {}
  return [];
}

async function writeViews(key, arr) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/app_data?on_conflict=key', {
      method: 'POST',
      headers: Object.assign(sbHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ key: key, value: arr })
    });
  } catch (e) {}
}

exports.handler = async function (event) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: Object.assign({}, cors, gcCors(event, 'GET, OPTIONS')), body: '' };

  const qs = event.queryStringParameters || {};

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    // Still return a pixel so the invoice/email doesn't show a broken image.
    if (qs.hit) return { statusCode: 200, headers: Object.assign({ 'Content-Type': 'image/gif' }, cors), body: PIXEL.toString('base64'), isBase64Encoded: true };
    return { statusCode: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  // Return the view log for an invoice — staff only (the pixel above stays public)
  if (qs.views) {
    const vcors = Object.assign(gcCors(event, 'GET, OPTIONS'), { 'Content-Type': 'application/json' });
    const who = await gcStaffAuth(event);
    if (!who.ok) return { statusCode: who.statusCode, headers: vcors, body: JSON.stringify({ error: who.error }) };
    const key = 'gc_invoice_views:' + qs.views;
    const arr = await readViews(key);
    return {
      statusCode: 200,
      headers: vcors,
      body: JSON.stringify({ id: qs.views, count: arr.length, views: arr, last: arr.length ? arr[arr.length - 1].at : null })
    };
  }

  // Log a view (pixel/beacon)
  if (qs.hit) {
    const key = 'gc_invoice_views:' + qs.hit;
    try {
      const arr = await readViews(key);
      const now = Date.now();
      const ua = (event.headers['user-agent'] || '').slice(0, 160);
      // De-dupe rapid duplicate hits (same load firing pixel + beacon) within 20 seconds.
      const last = arr.length ? new Date(arr[arr.length - 1].at).getTime() : 0;
      if (now - last > 20000) {
        arr.push({ at: new Date(now).toISOString(), ua: ua });
        // keep a reasonable cap
        while (arr.length > 200) arr.shift();
        await writeViews(key, arr);
      }
    } catch (e) {}
    return { statusCode: 200, headers: Object.assign({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private' }, cors), body: PIXEL.toString('base64'), isBase64Encoded: true };
  }

  return { statusCode: 400, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: JSON.stringify({ error: 'need ?hit= or ?views=' }) };
};
