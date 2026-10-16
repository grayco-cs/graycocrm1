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

// GrayCo — Auto-pull Google Docs quotes/estimates from team members' Drives.
// For each GrayCo user who has connected Google (token stored as gcal_token_<user>),
// this finds Google Docs that look like quotes/estimates, pulls their text, and adds
// them to the shared `estimates` list in gc_kv (linked + content), de-duplicated.
//
// REQUIREMENTS (must be set up before this works — see notes at bottom):
//   - Google Cloud OAuth project must include the Drive read scope:
//       https://www.googleapis.com/auth/drive.readonly
//     (currently the app only requests calendar.events.readonly — the scope must be added
//      and each person must re-connect / re-authorize once.)
//   - Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
//
// Trigger: called by the CRM on an interval (and can be scheduled). Safe to call often —
// it only imports docs it hasn't imported before (tracked by doc id).

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function sb(){ return { url: (process.env.SUPABASE_URL||'').replace(/\/$/,''), key: process.env.SUPABASE_SERVICE_KEY||'' }; }

async function kvGet(key){
  const { url, keyk } = { url: sb().url, keyk: sb().key };
  if(!url || !keyk) return null;
  const r = await fetch(url+'/rest/v1/gc_kv?key=eq.'+encodeURIComponent(key)+'&select=value', {
    headers: { apikey: keyk, Authorization: 'Bearer '+keyk }
  });
  if(!r.ok) return null;
  const rows = await r.json();
  return (rows && rows[0]) ? rows[0].value : null;
}
async function kvSet(key, value){
  const { url } = sb(); const keyk = sb().key;
  if(!url || !keyk) return false;
  const r = await fetch(url+'/rest/v1/gc_kv?on_conflict=key', {
    method:'POST',
    headers:{ apikey:keyk, Authorization:'Bearer '+keyk, 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value })
  });
  return r.ok;
}

// Refresh an access token from a stored refresh token.
async function freshAccess(tokens){
  if(!tokens) return null;
  // If we still have a non-expired access token, use it.
  if(tokens.access && tokens.expiry && Date.now() < (tokens.expiry - 60000)) return tokens.access;
  if(!tokens.refresh) return tokens.access || null;
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID||'',
    client_secret: process.env.GOOGLE_CLIENT_SECRET||'',
    refresh_token: tokens.refresh,
    grant_type: 'refresh_token'
  });
  const r = await fetch(TOKEN_URL, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
  if(!r.ok) return tokens.access || null;
  const j = await r.json();
  return j.access_token || tokens.access || null;
}

// List Google Docs that look like quotes/estimates, modified recently.
async function listQuoteDocs(access){
  // name contains quote/estimate/proposal/bid, is a Google Doc, not trashed.
  const q = "mimeType='application/vnd.google-apps.document' and trashed=false and (name contains 'quote' or name contains 'Quote' or name contains 'estimate' or name contains 'Estimate' or name contains 'proposal' or name contains 'Proposal' or name contains 'bid' or name contains 'Bid')";
  const url = 'https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&orderBy=modifiedTime desc&pageSize=25&fields=files(id,name,modifiedTime,owners(emailAddress),webViewLink)';
  const r = await fetch(url, { headers:{ Authorization:'Bearer '+access } });
  if(!r.ok) return [];
  const j = await r.json();
  return j.files || [];
}

// Export a Google Doc's plain text.
async function docText(access, id){
  const url = 'https://www.googleapis.com/drive/v3/files/'+id+'/export?mimeType=text/plain';
  const r = await fetch(url, { headers:{ Authorization:'Bearer '+access } });
  if(!r.ok) return '';
  return await r.text();
}

// Very light parse: pull a client name and a total $ if present.
function parseQuote(text){
  const out = { client:'', total:0 };
  try{
    const cm = text.match(/(?:client|customer|prepared for)\s*[:\-]\s*(.+)/i);
    if(cm) out.client = cm[1].split('\n')[0].trim().slice(0,60);
    // biggest dollar amount = likely the total
    const nums = (text.match(/\$\s?[\d,]+(?:\.\d{2})?/g)||[]).map(function(s){ return parseFloat(s.replace(/[^0-9.]/g,'')); }).filter(function(n){ return !isNaN(n); });
    if(nums.length) out.total = Math.max.apply(null, nums);
  }catch(e){}
  return out;
}

exports.handler = async function(event){
  const _cors = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json' });
  if (event && event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: _cors, body: '' };
  const who = await gcStaffAuth(event);
  if (!who.ok) return { statusCode: who.statusCode, headers: _cors, body: JSON.stringify({ ok: false, error: who.error }) };
  try{
    var qp = (event && event.queryStringParameters) || {};
    if(qp.export){
      // Export a single Google Doc's plain text (used by the Change Order doc-reader).
      // Uses the first team member's token that works.
      var users = (await kvGet('gc_team_google_users')) || ['Wesley Johnson','Nick Thomas','Glenn Miller','office'];
      for(var ui=0; ui<users.length; ui++){
        var tks = await kvGet('gcal_token_'+users[ui]);
        if(!tks) continue;
        var acc = await freshAccess(tks);
        if(!acc) continue;
        try{
          var txt = await docText(acc, qp.export);
          if(txt){ return { statusCode:200, headers:_cors, body: JSON.stringify({ ok:true, text:txt }) }; }
        }catch(e){}
      }
      return { statusCode:200, headers:_cors, body: JSON.stringify({ ok:false, error:'Could not read that doc (is Google connected?).' }) };
    }
  }catch(e){}
  try{
    const teamRaw = await kvGet('gc_team_google_users');
    // Which users to check: explicit list, else default GrayCo owners/PMs.
    let users = Array.isArray(teamRaw) ? teamRaw : ['Wesley Johnson','Nick Thomas','Glenn Miller','office'];

    const seen = (await kvGet('gc_gdoc_imported')) || {};   // { docId: true }
    const estimates = (await kvGet('estimates')) || [];
    let added = 0;

    for(const user of users){
      const tokens = await kvGet('gcal_token_'+user);
      if(!tokens) continue;                       // this person hasn't connected Google
      const access = await freshAccess(tokens);
      if(!access) continue;
      let docs = [];
      try{ docs = await listQuoteDocs(access); }catch(e){ docs = []; }
      for(const d of docs){
        if(!d.id || seen[d.id]) continue;         // already imported
        let text = '';
        try{ text = await docText(access, d.id); }catch(e){ text = ''; }
        const meta = parseQuote(text||'');
        const est = {
          id: 'EST' + Date.now().toString(36) + Math.floor(Math.random()*9999).toString(36),
          name: d.name || 'Google Doc Quote',
          client: meta.client || '',
          pid: '', priceType:'margin', priceVal:30,
          status:'draft', date: (d.modifiedTime||new Date().toISOString()).slice(0,10),
          mats:[], labor:[], by: (d.owners && d.owners[0] && d.owners[0].emailAddress) || user,
          source:'gdoc-auto',
          gdocUrl: d.webViewLink || ('https://docs.google.com/document/d/'+d.id+'/edit'),
          gdocId: d.id,
          gdocText: (text||'').slice(0, 20000),   // keep the pulled content (capped)
          quoteTotal: meta.total || 0
        };
        estimates.push(est);
        seen[d.id] = true;
        added++;
      }
    }

    if(added){
      await kvSet('estimates', estimates);
      await kvSet('gc_gdoc_imported', seen);
    }
    return { statusCode: 200, headers:_cors, body: JSON.stringify({ ok:true, added }) };
  }catch(e){
    return { statusCode: 200, headers:_cors, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};

// SETUP NOTES:
// 1. In Google Cloud Console, add scope https://www.googleapis.com/auth/drive.readonly to the
//    OAuth consent screen, and update the CRM's connect button to request it (done in the app).
// 2. Each person (Wesley, Nick, Glenn, office) clicks Connect Google once to authorize Drive read.
// 3. Optionally set gc_team_google_users in gc_kv to the exact list of users to pull from.
// 4. This imports Docs whose NAME contains quote/estimate/proposal/bid. Tell users to name
//    their quote docs accordingly, or we can switch to watching a specific Drive folder.
