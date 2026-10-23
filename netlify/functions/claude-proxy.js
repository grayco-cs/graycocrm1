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

// Netlify serverless function — proxies Anthropic API calls from the browser.
// Uses native fetch (Node 18+, available on Netlify by default).
// API key lives in ANTHROPIC_API_KEY environment variable — never in the browser.

const PROXY_TIMEOUT_MS = parseInt(process.env.CLAUDE_PROXY_TIMEOUT_MS || '25000', 10);   // Netlify stops a function at ~26 s

exports.handler = async function(event, context) {
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json' });

  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 200, headers, body: '' };
  }

  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, headers, body: JSON.stringify({error:{message:'Method Not Allowed'}}) };
  }

  // Only signed-in GrayCo staff may spend the Anthropic key.
  const who = await gcStaffAuth(event);
  if(!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({error:{type:'auth', message: who.error}}) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey){
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({error:{message:'ANTHROPIC_API_KEY not set. Go to Netlify → Site Settings → Environment Variables and add it.'}})
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e){ return { statusCode: 400, headers, body: JSON.stringify({error:{message:'Invalid JSON'}}) }; }
  if(!body || typeof body !== 'object' || Array.isArray(body)){
    return { statusCode: 400, headers, body: JSON.stringify({error:{message:'Body must be a JSON object'}}) };
  }

  // Only the models the CRM actually asks for (CLAUDE_MODELS on Netlify can replace the list).
  // patch WEB: the current models are allowed; the deprecated Claude Sonnet 4 (May 2025) id, asked for by nothing, is gone.
  const allowed = (process.env.CLAUDE_MODELS || 'claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5,claude-sonnet-4-6,claude-haiku-4-5-20251001,claude-haiku-4-5')
    .split(',').map(function(m){ return m.trim(); }).filter(Boolean);
  if(allowed.indexOf(String(body.model || '')) < 0){
    return { statusCode: 400, headers, body: JSON.stringify({error:{type:'invalid_request_error', message:'Model not allowed: ' + String(body.model || '(none)')}}) };
  }
  // Cap the answer length (the CRM never asks for more than 4000).
  const MAX_TOKENS = 8192;
  const mt = parseInt(body.max_tokens, 10);
  body.max_tokens = (mt > 0) ? Math.min(mt, MAX_TOKENS) : 1024;

  // Forward to Anthropic, giving up just before Netlify's own function time limit.
  const ctl = new AbortController();
  const timer = setTimeout(function(){ ctl.abort(); }, PROXY_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // kept: harmless for the generally-available web_search_20250305 tool the
        // price research sends, and removing it could not be tested offline
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify(body),
      signal: ctl.signal
    });
  } catch(e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      return { statusCode: 504, headers, body: JSON.stringify({error:{type:'timeout', message:'The AI took longer than ' + Math.round(PROXY_TIMEOUT_MS/1000) + ' seconds to answer. Try again, or ask for a shorter answer.'}}) };
    }
    return { statusCode: 502, headers, body: JSON.stringify({error:{type:'upstream_unreachable', message:'Could not reach the AI service: ' + String(e && e.message || e)}}) };
  }
  let text = '';
  try { text = await resp.text(); }
  catch(e) {
    clearTimeout(timer);
    const to = e && e.name === 'AbortError';
    return { statusCode: to ? 504 : 502, headers, body: JSON.stringify({error:{type: to ? 'timeout' : 'upstream_read', message: to ? 'The AI answer was cut off by the time limit. Try again.' : 'Could not read the AI answer: ' + String(e && e.message || e)}}) };
  }
  clearTimeout(timer);
  let data;
  try { data = JSON.parse(text); }
  catch(e) {
    return { statusCode: resp.ok ? 502 : resp.status, headers, body: JSON.stringify({error:{type:'upstream_not_json', status: resp.status, message:'The AI service answered ' + resp.status + ': ' + text.slice(0, 300)}}) };
  }
  return {
    statusCode: resp.status,
    headers,
    body: JSON.stringify(data)
  };
};
