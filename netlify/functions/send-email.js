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

// netlify/functions/send-email.js
// GrayCo — sends email through Resend. Used by invoices (office@), the thank-you
// email (office@), and marketing (news@). Every send is triggered by an admin
// clicking "send" in the CRM after review — nothing auto-sends from here.
//
// Required env var: RESEND_API_KEY
//
// POST body:
//   {
//     to:        "client@example.com"  (required),
//     subject:   "..."                 (required),
//     html:      "<...>"               (required),
//     from:      "office" | "news"     (optional, default "office"),
//     replyTo:   "..."                 (optional),
//     cc:        [...]                 (optional)
//   }

const RESEND_URL = 'https://api.resend.com/emails';

// Named shortcuts. But ANY @grayco-cs.com address is allowed as a sender, because
// the whole grayco-cs.com domain is verified in Resend — one setup covers everyone.
const FROM = {
  office:  'GrayCo Construction Services <office@grayco-cs.com>',
  news:    'GrayCo Construction Services <news@grayco-cs.com>',
  billing: 'GrayCo Construction Services Billing <billing@grayco-cs.com>'
};
const ALLOWED_DOMAIN = 'grayco-cs.com';
// Resolve the sender: a named shortcut, a full "Name <addr>" string, or a bare
// @grayco-cs.com address (with optional display name).
function resolveFrom(input, displayName){
  if(!input) return FROM.office;
  if(FROM[input]) return FROM[input];              // named shortcut
  var raw = String(input).trim();
  // extract the address if it's in "Name <addr>" form
  var m = raw.match(/<([^>]+)>/);
  var addr = (m ? m[1] : raw).trim().toLowerCase();
  // ONLY allow sending from your own verified domain — never someone else's.
  if(addr.indexOf('@'+ALLOWED_DOMAIN) < 0) return null;   // rejected
  var name = displayName || 'GrayCo Construction Services';
  return name + ' <' + addr + '>';
}

exports.handler = async function (event) {
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Only signed-in GrayCo staff may send mail as @grayco-cs.com.
  const who = await gcStaffAuth(event);
  if (!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ error: who.error }) };

  const key = process.env.RESEND_API_KEY;
  if (!key) return { statusCode: 500, headers, body: JSON.stringify({ error: 'RESEND_API_KEY not set on Netlify.' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const to = body.to;
  const subject = body.subject;
  const html = body.html;
  if (!to || !subject || !html) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'to, subject, and html are all required' }) };
  }

  const from = resolveFrom(body.from, body.fromName);
  if(!from){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Sender must be an @grayco-cs.com address (the verified domain).' }) };
  }

  const payload = {
    from: from,
    to: Array.isArray(to) ? to : [to],
    subject: subject,
    html: html
  };
  if (body.replyTo) payload.reply_to = body.replyTo;
  if (body.cc) payload.cc = Array.isArray(body.cc) ? body.cc : [body.cc];

  try {
    const resp = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (!resp.ok) {
      // Resend returns helpful errors — pass them through so the CRM can show why
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: (data && data.message) || 'Send failed', detail: data }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: data.id }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
