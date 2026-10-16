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

// GrayCo Calendar Feed — serves an .ics feed of schedule items for Google Calendar / phone
// Subscribe URL: https://graycocrm1.netlify.app/.netlify/functions/calendar-feed?who=NAME
// Pulls live schedule from Supabase, filters by person, returns iCalendar format.

async function getSchedule(){
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if(!url || !key) return [];
    const q = url.replace(/\/$/,'') + '/rest/v1/gc_kv?key=eq.schedule&select=value';
    const resp = await fetch(q, { headers: { apikey: key, Authorization: 'Bearer '+key } });
    if(!resp.ok) return [];
    const rows = await resp.json();
    return (rows[0] && rows[0].value) || [];
  } catch(e){ return []; }
}

function pad(n){ return String(n).padStart(2,'0'); }

function toIcsDate(dateStr, timeStr){
  // dateStr = YYYY-MM-DD, timeStr = HH:MM (local). Output floating local time.
  if(!dateStr) return null;
  const d = dateStr.replace(/-/g,'');
  const t = (timeStr||'08:00').replace(/:/g,'') ;
  return d + 'T' + (t.length===4 ? t+'00' : '080000');
}

function esc(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n'); }

const crypto = require('crypto');
/* A feed link is  ...calendar-feed?who=<name>&t=<signature>.  The signature is an
   HMAC of the name with CALENDAR_FEED_SECRET (or, if that is not set, a secret
   derived from the service key, which never leaves the server). Old links
   without t= stop working; a signed-in person gets their new link from the CRM
   (the 📅 Schedule to Phone button). Changing the secret cancels every link. */
function feedSecret(){
  const own = process.env.CALENDAR_FEED_SECRET;
  if (own) return own;
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return svc ? crypto.createHmac('sha256', svc).update('gc-calendar-feed-v1').digest('hex') : '';
}
function feedSig(who){
  const sec = feedSecret();
  if (!sec) return '';
  return crypto.createHmac('sha256', sec).update('who:' + String(who || '').toLowerCase().trim()).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}
function sameStr(a, b){
  a = Buffer.from(String(a || '')); b = Buffer.from(String(b || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
exports._feedSig = feedSig;

exports.handler = async function(event){
  const qp = event.queryStringParameters || {};
  // The CRM asks for a signed link (signed-in staff only).
  if (qp.link === '1') {
    const cors = Object.assign(gcCors(event, 'GET, OPTIONS'), { 'Content-Type': 'application/json' });
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
    const me = await gcStaffAuth(event);
    if (!me.ok) return { statusCode: me.statusCode, headers: cors, body: JSON.stringify({ error: me.error }) };
    const name = String(qp.who || '').trim();
    const sig = feedSig(name);
    if (!sig) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY / CALENDAR_FEED_SECRET not set on Netlify.' }) };
    const base = 'https://' + (gcHeader(event, 'host') || 'graycocrm1.netlify.app') + '/.netlify/functions/calendar-feed';
    return { statusCode: 200, headers: cors, body: JSON.stringify({ url: base + '?' + (name ? 'who=' + encodeURIComponent(name) + '&' : '') + 't=' + sig }) };
  }
  const who = (qp.who || '').toLowerCase().trim();
  if (!sameStr(qp.t, feedSig(who))) {
    return { statusCode: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      body: 'This calendar link is not valid any more. Open the GrayCo CRM, sign in, and copy your new link from the \uD83D\uDCC5 Schedule to Phone button.' };
  }
  const sched = await getSchedule();

  let items = Array.isArray(sched) ? sched : [];
  if(who){
    items = items.filter(function(it){
      if(!it) return false;
      const a = (it.assignee||'').toLowerCase();
      const b = (it.by||'').toLowerCase();
      const sf = (it.schedFor||'').toLowerCase();
      const v = (it.vendor||'').toLowerCase();
      return a.indexOf(who)>-1 || b.indexOf(who)>-1 || sf.indexOf(who)>-1 || v.indexOf(who)>-1;
    });
  }

  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//GrayCo//CRM Schedule//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:GrayCo Schedule'+(who?(' - '+who):'')+'\r\n';

  items.forEach(function(it, idx){
    if(!it || !it.date) return;
    const start = toIcsDate(it.date, it.time);
    const end = toIcsDate(it.endDateSch || it.date, it.endTime || '17:00');
    if(!start) return;
    const uid = (it.id || ('gc'+idx)) + '@grayco-cs.com';
    const title = it.title || it.type || 'Work';
    const loc = it.address || '';
    const desc = [it.notes, it.vendor?('Sub: '+it.vendor):'', it.assignee?('Assigned: '+it.assignee):''].filter(Boolean).join(' \\n ');
    ics += 'BEGIN:VEVENT\r\n';
    ics += 'UID:'+uid+'\r\n';
    ics += 'DTSTART:'+start+'\r\n';
    ics += 'DTEND:'+end+'\r\n';
    ics += 'SUMMARY:'+esc(title)+'\r\n';
    if(loc) ics += 'LOCATION:'+esc(loc)+'\r\n';
    if(desc) ics += 'DESCRIPTION:'+esc(desc)+'\r\n';
    ics += 'END:VEVENT\r\n';
  });

  ics += 'END:VCALENDAR\r\n';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="grayco-schedule.ics"',
      'Cache-Control': 'no-cache'
    },
    body: ics
  };
};
