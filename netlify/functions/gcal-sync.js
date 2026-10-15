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

// GrayCo Google Calendar → CRM sync
// Reads each connected PM's Google Calendar and writes new/changed events into the CRM schedule.
// Duplicate-safe: tags imported events with their Google event id (gcalId) and updates in place.
// Runs on a schedule (set in netlify.toml). Env: GOOGLE_CLIENT_ID/SECRET, SUPABASE_URL/SERVICE_KEY.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function sbHeaders(){
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { apikey: key, Authorization: 'Bearer '+key, 'Content-Type':'application/json' };
}
function sbUrl(path){ return process.env.SUPABASE_URL.replace(/\/$/,'') + path; }

async function sbGet(rowKey){
  const r = await fetch(sbUrl('/rest/v1/gc_kv?key=eq.'+encodeURIComponent(rowKey)+'&select=value'), { headers: sbHeaders() });
  if(!r.ok) return null;
  const rows = await r.json();
  return rows[0] ? rows[0].value : null;
}
async function sbSet(rowKey, value){
  await fetch(sbUrl('/rest/v1/gc_kv?on_conflict=key'), {
    method:'POST',
    headers: Object.assign({}, sbHeaders(), { Prefer:'resolution=merge-duplicates' }),
    body: JSON.stringify({ key: rowKey, value: value })
  });
}
async function listTokenKeys(){
  const r = await fetch(sbUrl('/rest/v1/gc_kv?key=like.gcal_token_*&select=key,value'), { headers: sbHeaders() });
  if(!r.ok) return [];
  return await r.json();
}

async function refreshToken(tok){
  if(tok.expiry && tok.expiry > Date.now()+60000) return tok; // still valid
  if(!tok.refresh_token) return tok;
  const resp = await fetch(TOKEN_URL, {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token'
    }).toString()
  });
  const j = await resp.json();
  if(j.access_token){
    tok.access_token = j.access_token;
    tok.expiry = Date.now() + ((j.expires_in||3600)*1000);
    await sbSet('gcal_token_'+tok.user, tok);
  }
  return tok;
}

async function fetchEvents(tok){
  const now = new Date();
  const timeMin = new Date(now.getTime() - 7*86400000).toISOString();  // last week
  const timeMax = new Date(now.getTime() + 90*86400000).toISOString(); // next 90 days
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'+
    '?timeMin='+encodeURIComponent(timeMin)+'&timeMax='+encodeURIComponent(timeMax)+
    '&singleEvents=true&orderBy=startTime&maxResults=250';
  const r = await fetch(url, { headers: { Authorization: 'Bearer '+tok.access_token } });
  if(!r.ok) return [];
  const j = await r.json();
  return j.items || [];
}

function toDate(g){ // google event start/end -> YYYY-MM-DD + HH:MM
  if(!g) return {date:'', time:''};
  if(g.date) return { date: g.date, time: '' }; // all-day
  if(g.dateTime){
    const d = new Date(g.dateTime);
    const date = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const time = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    return { date, time };
  }
  return {date:'', time:''};
}

exports.handler = async function(event){
  const who = await gcStaffAuth(event || {});
  if(!who.ok) return { statusCode: who.statusCode, headers: gcCors(event || {}, 'GET, POST, OPTIONS'), body: JSON.stringify({ error: who.error }) };
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY){
    return { statusCode: 200, body: 'Supabase not configured' };
  }
  const tokenRows = await listTokenKeys();
  if(!tokenRows.length) return { statusCode: 200, body: 'No connected calendars' };

  // load current CRM schedule once
  let schedule = (await sbGet('schedule')) || [];
  if(!Array.isArray(schedule)) schedule = [];

  // load projects for name/address matching
  let projects = (await sbGet('projects')) || [];
  if(!Array.isArray(projects)) projects = [];

  function matchJob(title, loc){
    const t = (title||'').toLowerCase(), l = (loc||'').toLowerCase();
    let best=null;
    projects.forEach(function(p){
      const pn=(p.name||'').toLowerCase(), pa=(p.address||'').toLowerCase();
      if(pn && (t.indexOf(pn)>-1 || (l && pa && l.indexOf(pa)>-1))) best=p;
    });
    return best;
  }

  let added=0, updated=0;

  for(const row of tokenRows){
    let tok = row.value;
    if(!tok || !tok.access_token) continue;
    tok = await refreshToken(tok);
    const user = tok.user || '';
    let events = [];
    try { events = await fetchEvents(tok); } catch(e){ continue; }

    events.forEach(function(ev){
      if(!ev || ev.status==='cancelled') return;
      const gid = ev.id;
      const start = toDate(ev.start);
      const end = toDate(ev.end);
      if(!start.date) return;
      const job = matchJob(ev.summary, ev.location);
      const existing = schedule.find(function(s){ return s && s.gcalId===gid; });
      const item = {
        id: existing ? existing.id : ('SCH_g_'+gid.slice(0,12)+'_'+Date.now().toString(36)),
        gcalId: gid,
        title: ev.summary || 'Event',
        pid: job ? job.id : (existing ? existing.pid : ''),
        date: start.date,
        endDateSch: end.date && end.date!==start.date ? end.date : '',
        time: start.time || '08:00',
        endTime: end.time || '17:00',
        assignee: user,
        by: user,
        schedFor: user,
        vendor: '',
        type: 'work',
        address: ev.location || (job ? job.address : '') || '',
        notes: ev.description || '',
        scope: 'company',
        source: 'gcal'
      };
      if(existing){
        Object.assign(existing, item);
        updated++;
      } else {
        schedule.push(item);
        added++;
      }
    });
  }

  if(added || updated){
    await sbSet('schedule', schedule);
  }
  return { statusCode: 200, body: JSON.stringify({ added, updated, calendars: tokenRows.length }) };
};
