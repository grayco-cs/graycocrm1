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

// QuickBooks API proxy — handles token refresh and all QBO API calls
// Env vars needed: QB_CLIENT_ID, QB_CLIENT_SECRET

const QB_PROD_BASE = 'https://quickbooks.api.intuit.com';
const QB_SAND_BASE = 'https://sandbox-quickbooks.api.intuit.com';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REDIRECT_URI = process.env.QB_REDIRECT_URI || 'https://graycocrm1.netlify.app/.netlify/functions/qb-callback';

async function refreshToken(refreshToken){
  const creds = Buffer.from(process.env.QB_CLIENT_ID+':'+process.env.QB_CLIENT_SECRET).toString('base64');
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic '+creds,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()
  });
  return resp.json();
}

exports.handler = async function(event) {
  const headers = Object.assign(gcCors(event, 'GET, POST, OPTIONS', 'x-qb-token, x-qb-refresh, x-qb-realm, x-qb-sandbox'),
    { 'Content-Type': 'application/json' });

  if(event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const who = await gcStaffAuth(event);
  if(!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ error: who.error }) };

  // Special: get OAuth URL
  if(event.queryStringParameters && event.queryStringParameters.action === 'auth_url'){
    const scope = 'com.intuit.quickbooks.accounting';
    const state = Math.random().toString(36).slice(2);
    const url = 'https://appcenter.intuit.com/connect/oauth2?'+
      'client_id='+encodeURIComponent(process.env.QB_CLIENT_ID||'')+
      '&redirect_uri='+encodeURIComponent(REDIRECT_URI)+
      '&response_type=code'+
      '&scope='+encodeURIComponent(scope)+
      '&state='+state;
    return { statusCode: 200, headers, body: JSON.stringify({ url }) };
  }

  // Special: refresh tokens
  if(event.queryStringParameters && event.queryStringParameters.action === 'refresh'){
    const body = JSON.parse(event.body||'{}');
    try {
      const tokens = await refreshToken(body.refresh_token);
      return { statusCode: 200, headers, body: JSON.stringify(tokens) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({error: e.message}) };
    }
  }

  // Proxy a QBO API call
  const access_token = event.headers['x-qb-token'] || event.headers['X-QB-Token'];
  const realm = event.headers['x-qb-realm'] || event.headers['X-QB-Realm'];
  const sandbox = event.headers['x-qb-sandbox'] === 'true';
  const base = sandbox ? QB_SAND_BASE : QB_PROD_BASE;

  if(!access_token || !realm){
    return { statusCode: 401, headers, body: JSON.stringify({error:'Missing token or realmId'}) };
  }

  const path = (event.queryStringParameters && event.queryStringParameters.path) || '/v3/company/'+realm+'/query?query=select * from Customer&minorversion=65';
  const method = event.httpMethod === 'POST' ? 'POST' : 'GET';

  try {
    const qbResp = await fetch(base+path, {
      method,
      headers: {
        'Authorization': 'Bearer '+access_token,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: method === 'POST' ? event.body : undefined
    });
    const data = await qbResp.json();
    return { statusCode: qbResp.status, headers, body: JSON.stringify(data) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({error: e.message}) };
  }
};
