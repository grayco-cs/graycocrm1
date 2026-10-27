// GrayCo Google Calendar OAuth — starts the Google sign-in and handles the callback + token storage
// Env vars needed (set AFTER you create the Google Cloud OAuth project):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, SUPABASE_URL, SUPABASE_SERVICE_KEY
// Flow (patch GTOK):
//   1. The CRM (signed in) calls  POST ?op=start  → this checks the staff sign-in and answers the Google sign-in link.
//      Its "state" is SIGNED here: { the person's e-mail and CRM name from their verified sign-in, a nonce, an expiry
//      10 minutes out } + an HMAC-SHA256 with a key derived from SUPABASE_SERVICE_KEY. The browser never picks the name.
//   2. Google redirects here with ?code=...&state=...  → a missing, altered or expired state is refused with a friendly
//      "please press Connect again" page; a good one exchanges the code and stores {access, refresh, expiry} in the
//      server-only table, keyed by the person (_lib/gtok.js).

require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';   /* patch ESTIN: drive.file — the CRM may make (only) its own Docs: a new estimate from the GrayCo template */
const STATE_TTL_MS = 10 * 60 * 1000;

const GTOK = require('./_lib/gtok');   /* patch GTOK: the sign-in is kept where no browser can read it */
async function saveTokens(user, tokens){
  if(!process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  return GTOK.set(user, tokens);
}

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

/* ── the signed state (patch GTOK) ─────────────────────────────────────────── */
function stateKey(){
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return svc ? crypto.createHash('sha256').update('grayco-gcal-oauth-state:v1:' + svc).digest() : null;
}
const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
function signState(who, now){
  const k = stateKey(); if (!k) return '';
  const payload = b64u(JSON.stringify({ e: who.email, n: who.name, r: b64u(crypto.randomBytes(12)), x: (now || Date.now()) + STATE_TTL_MS }));
  return payload + '.' + b64u(crypto.createHmac('sha256', k).update(payload).digest());
}
function readState(state, now){
  const k = stateKey();
  const parts = String(state || '').split('.');
  if (!k || parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, why: 'missing' };
  const want = crypto.createHmac('sha256', k).update(parts[0]).digest(), got = unb64u(parts[1]);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return { ok: false, why: 'bad' };
  let p = null; try { p = JSON.parse(unb64u(parts[0]).toString('utf8')); } catch (e) {}
  if (!p || !p.e || !p.x) return { ok: false, why: 'bad' };
  if (Number(p.x) < (now || Date.now())) return { ok: false, why: 'expired' };
  return { ok: true, email: String(p.e), name: String(p.n || p.e) };
}
/* the person's CRM name: their row in the people list (by the VERIFIED e-mail), else the staff list's name, else the e-mail */
async function crmName(email, staffName){
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''), svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (svc) {
    try {
      const r = await fetch(url + '/rest/v1/gc_kv?select=value&key=eq.users', { headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
      if (r.ok) {
        let v = ((await r.json()) || [])[0]; v = v && v.value;
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
        const u = Array.isArray(v) && v.find(x => x && String(x.email || '').trim().toLowerCase() === email && x.name);
        if (u) return String(u.name).trim();
      }
    } catch (e) {}
  }
  return String(staffName || '').trim() || email;
}

function page(code, title, lines){
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return { statusCode: code, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;background:#0f2440;color:#fff;text-align:center;padding:60px 20px;">' +
          '<div style="background:#fff;display:inline-block;padding:12px 18px;border-radius:12px;margin-bottom:20px"><img src="/portal-logo.png" alt="GrayCo Construction Services" width="160" style="width:160px;max-width:60vw;height:auto;display:block"></div>' +   /* patch PORTALLOGO */
          '<h2>' + esc(title) + '</h2>' + lines.map(l => '<p>' + esc(l) + '</p>').join('') + '</body></html>' };
}
const TRY_AGAIN = ['Go back to the GrayCo CRM and press Connect Google again.', 'You can close this window.'];

async function start(event){
  const cors = gcCors(event, 'POST, OPTIONS');
  const J = (c, b) => ({ statusCode: c, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors), body: JSON.stringify(b) });
  const who = await gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode, { ok: false, error: who.error });
  const clientId = process.env.GOOGLE_CLIENT_ID, redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !redirectUri) return J(503, { ok: false, notConfigured: true, error: 'Google sign-in is not set up yet (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI in Netlify).' });
  const state = signState({ email: who.email, name: await crmName(who.email, who.name) });
  if (!state) return J(503, { ok: false, error: 'The server is missing its Supabase service key.' });
  const url = AUTH_URL + '?client_id=' + encodeURIComponent(clientId) + '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&response_type=code&access_type=offline&prompt=consent&scope=' + encodeURIComponent(SCOPE) + '&state=' + encodeURIComponent(state);
  return J(200, { ok: true, url: url });
}

exports.handler = async function(event){
  const params = (event && event.queryStringParameters) || {};
  if (event && event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: gcCors(event, 'POST, OPTIONS'), body: '' };
  if (params.op === 'start') return start(event);

  if (params.error) return page(200, 'Google was not connected', ['Google said: ' + String(params.error).slice(0, 80) + '.'].concat(TRY_AGAIN));
  const st = readState(params.state);
  if (!st.ok) return page(400, st.why === 'expired' ? 'That Google link has expired' : 'That Google link did not come from the CRM',
    ['For your safety the CRM only accepts a Google sign-in that was started from the CRM in the last 10 minutes.'].concat(TRY_AGAIN));
  const code = params.code;
  if(!code) return page(400, 'Google did not finish signing in', TRY_AGAIN);
  const user = st.name;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if(!clientId || !clientSecret || !redirectUri){
    return { statusCode: 500, body: 'Google OAuth not configured yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI in Netlify.' };
  }

  try{
    const tokenResp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    });
    const tok = await tokenResp.json();
    if(!tok.access_token){
      return page(502, 'Google did not finish signing in', ['Google answered: ' + String(tok.error_description || tok.error || 'no token').slice(0, 120) + '.'].concat(TRY_AGAIN));
    }
    const tokens = {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || '',
      expiry: Date.now() + ((tok.expires_in||3600) * 1000),
      user: user,
      email: st.email
    };
    if (!(await saveTokens(user, tokens))) return page(500, 'Google could not be saved', ['The CRM could not save the connection.'].concat(TRY_AGAIN));

    return page(200, '✅ Google connected!', [user + "'s Google Calendar and Docs are now linked to the GrayCo CRM.",
      'Schedule items you add in Google Calendar will sync into the CRM.', 'You can close this window.']);
  } catch(e){
    return page(500, 'Google could not be connected', ['Something went wrong (' + String(e.message).slice(0, 80) + ').'].concat(TRY_AGAIN));
  }
};
exports._t = { signState, readState, STATE_TTL_MS };
