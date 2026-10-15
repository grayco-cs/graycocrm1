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

// ---- Supabase persistence for pending CompanyCam leads (survives across function instances) ----
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
function sb(path, opts){
  return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    }
  }, opts || {}));
}
async function pushPendingLead(lead){
  if(!SUPABASE_URL || !SUPABASE_KEY){ if(!global._ccPendingLeads) global._ccPendingLeads=[]; global._ccPendingLeads.push(lead); return; }
  try{
    await sb('cc_pending_leads', {
      method:'POST',
      headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY, 'Content-Type':'application/json', 'Prefer':'return=minimal' },
      body: JSON.stringify({ lead: lead, cc_id: lead.ccId||'', created_at: new Date().toISOString() })
    });
  }catch(e){ if(!global._ccPendingLeads) global._ccPendingLeads=[]; global._ccPendingLeads.push(lead); }
}
async function drainPendingLeads(){
  if(!SUPABASE_URL || !SUPABASE_KEY){ const p=global._ccPendingLeads||[]; global._ccPendingLeads=[]; return p; }
  try{
    const r = await sb('cc_pending_leads?select=id,lead&order=created_at.asc', { method:'GET' });
    if(!r.ok) return [];
    const rows = await r.json();
    if(!Array.isArray(rows) || !rows.length) return [];
    const ids = rows.map(function(x){ return x.id; });
    // delete the ones we're about to return so they're only delivered once
    try{ await sb('cc_pending_leads?id=in.(' + ids.join(',') + ')', { method:'DELETE', headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY, 'Prefer':'return=minimal' } }); }catch(e){}
    return rows.map(function(x){ return x.lead; });
  }catch(e){ return []; }
}

// Netlify function — CompanyCam integration:
// 1. GET  ?proxy=api&endpoint=... : proxy CompanyCam READ calls (avoids CORS)
// 2. GET  ?proxy=find&name=..&address=.. : search existing CompanyCam projects for a match
// 3. POST ?proxy=create : create a CompanyCam project from the CRM (enter-once sync)
// 4. POST (webhook body): receive CompanyCam webhook events (project.created, photo.created)
// 5. GET  (no proxy): poll for pending webhook leads

exports.handler = async function(event, context) {
  const headers = Object.assign(gcCors(event, 'POST, GET, OPTIONS', 'x-companycam-secret, x-cc-token'),
    { 'Content-Type': 'application/json' });

  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 200, headers, body: '' };
  }

  const qs = event.queryStringParameters || {};

  // Everything the CRM calls (the ?proxy= calls and the GET that drains pending
  // leads) is staff only. The plain webhook POST from CompanyCam is not a staff
  // call and stays as it was: it can only put a lead on the review list.
  if(event.httpMethod === 'GET' || qs.proxy){
    const who = await gcStaffAuth(event);
    if(!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ error: who.error }) };
  }

  // GET ?proxy=api — proxy CompanyCam read calls from the browser
  if(event.httpMethod === 'GET' && qs.proxy === 'api'){
    const token = event.headers['x-cc-token'] || event.headers['X-CC-Token'];
    if(!token){
      return { statusCode: 401, headers, body: JSON.stringify({error:'No token provided'}) };
    }
    const endpoint = qs.endpoint || 'projects';
    const status = qs.status || 'active';
    const all = qs.all === '1' || qs.all === 'true';   // pull EVERY page (all projects)
    try {
      if(all && endpoint === 'projects'){
        // Paginate through ALL projects (both active + archived) so we can bulk-import.
        let out = [];
        for(let page=1; page<=40; page++){   // up to ~2000 projects
          const r = await fetch(`https://api.companycam.com/v2/projects?per_page=50&page=${page}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          });
          if(!r.ok){ if(page===1){ return { statusCode: r.status, headers, body: JSON.stringify({error:'CompanyCam '+r.status}) }; } break; }
          const chunk = await r.json();
          if(!Array.isArray(chunk) || chunk.length===0) break;
          out = out.concat(chunk);
          if(chunk.length < 50) break;   // last page
        }
        return { statusCode: 200, headers, body: JSON.stringify(out) };
      }
      // Clean sub-path fetch (e.g. projects/ID/notes, projects/ID/todos) — no status param.
      if(qs.raw === '1'){
        const rr = await fetch(`https://api.companycam.com/v2/${endpoint}?per_page=100`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const rd = await rr.json();
        return { statusCode: rr.status, headers, body: JSON.stringify(rd) };
      }
      const ccResp = await fetch(`https://api.companycam.com/v2/${endpoint}?per_page=50&status=${status}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const data = await ccResp.json();
      return { statusCode: ccResp.status, headers, body: JSON.stringify(data) };
    } catch(err){
      return { statusCode: 500, headers, body: JSON.stringify({error: err.message}) };
    }
  }

  // GET ?proxy=find — search existing CompanyCam projects for a name/address match
  if(event.httpMethod === 'GET' && qs.proxy === 'find'){
    const token = event.headers['x-cc-token'] || event.headers['X-CC-Token'];
    if(!token){ return { statusCode: 401, headers, body: JSON.stringify({error:'No token'}) }; }
    const wantName = String(qs.name||'').toLowerCase().trim();
    const wantAddr = String(qs.address||'').toLowerCase().trim().slice(0,14);
    try{
      let match=null;
      for(let page=1; page<=6 && !match; page++){
        const r = await fetch(`https://api.companycam.com/v2/projects?per_page=50&page=${page}`, {
          headers:{ 'Authorization':`Bearer ${token}` }
        });
        if(!r.ok) break;
        const list = await r.json();
        if(!Array.isArray(list) || list.length===0) break;
        for(const p of list){
          const pn = String(p.name||'').toLowerCase().trim();
          const pa = p.address ? String(p.address.street_address_1||'').toLowerCase().trim() : '';
          const nameHit = wantName && pn && (pn===wantName || pn.includes(wantName) || wantName.includes(pn));
          const addrHit = wantAddr && pa && (pa.includes(wantAddr) || wantAddr.includes(pa.slice(0,14)));
          if(nameHit || addrHit){ match=p; break; }
        }
        if(list.length<50) break;
      }
      if(match){
        return { statusCode:200, headers, body: JSON.stringify({
          matched:true, id:String(match.id),
          url: match.url || ('https://app.companycam.com/projects/'+match.id),
          name: match.name||''
        }) };
      }
      return { statusCode:200, headers, body: JSON.stringify({matched:false}) };
    }catch(err){
      return { statusCode:500, headers, body: JSON.stringify({error:err.message}) };
    }
  }

  // POST ?proxy=create — create a CompanyCam project from the CRM
  if(event.httpMethod === 'POST' && qs.proxy === 'create'){
    const token = event.headers['x-cc-token'] || event.headers['X-CC-Token'];
    if(!token){ return { statusCode:401, headers, body: JSON.stringify({error:'No token'}) }; }
    let bodyIn;
    try{ bodyIn = JSON.parse(event.body||'{}'); }catch(e){ return { statusCode:400, headers, body: JSON.stringify({error:'Bad JSON'}) }; }
    const proj = {
      name: bodyIn.name || 'New Job',
    };
    // CompanyCam requires an address object with coords OR a street address.
    if(bodyIn.address){
      proj.address = {
        street_address_1: bodyIn.address || '',
        city: bodyIn.city || '',
        state: bodyIn.state || '',
        postal_code: bodyIn.zip || ''
      };
    }
    try{
      const r = await fetch('https://api.companycam.com/v2/projects', {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ project: proj })
      });
      const data = await r.json();
      if(r.ok && data && data.id){
        return { statusCode:200, headers, body: JSON.stringify({
          created:true, id:String(data.id),
          url: data.url || ('https://app.companycam.com/projects/'+data.id),
          name: data.name||proj.name
        }) };
      }
      return { statusCode: r.status, headers, body: JSON.stringify({created:false, error:(data&&data.errors)||data||'create failed'}) };
    }catch(err){
      return { statusCode:500, headers, body: JSON.stringify({created:false, error:err.message}) };
    }
  }

  // POST ?proxy=post&endpoint=... — a plain authenticated POST to the CompanyCam API.
  // Used to register the webhook so CompanyCam pushes new work to us instead of the
  // CRM asking over and over. Additive: nothing else on this file changes behaviour.
  if(event.httpMethod === 'POST' && qs.proxy === 'post'){
    const token = event.headers['x-cc-token'] || event.headers['X-CC-Token'];
    if(!token){ return { statusCode:401, headers, body: JSON.stringify({error:'No token'}) }; }
    const endpoint = String(qs.endpoint||'').replace(/^\/+/, '');
    if(!endpoint){ return { statusCode:400, headers, body: JSON.stringify({error:'No endpoint'}) }; }
    try{
      const r = await fetch('https://api.companycam.com/v2/'+endpoint, {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json' },
        body: event.body || '{}'
      });
      let data; try{ data = await r.json(); }catch(e){ data = {}; }
      return { statusCode: r.status, headers, body: JSON.stringify(data) };
    }catch(err){
      return { statusCode:500, headers, body: JSON.stringify({error:err.message}) };
    }
  }

  // GET (no proxy) — poll for pending webhook leads (from Supabase, durable across instances)
  if(event.httpMethod === 'GET'){
    const pending = await drainPendingLeads();
    return { statusCode: 200, headers, body: JSON.stringify({ leads: pending }) };
  }

  // POST (webhook body) — receive CompanyCam webhook payload
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, headers, body: JSON.stringify({error:'Method not allowed'}) };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch(e){ return { statusCode: 400, headers, body: JSON.stringify({error:'Invalid JSON'}) }; }

  const eventType = payload.event_name || payload.event_type || payload.type || '';
  const data = payload.payload || payload.data || payload;

  if(eventType.includes('project.created') || eventType.includes('project_created')){
    const proj = data.project || data;
    const addr = proj.address ? [proj.address.street_address_1, proj.address.city, proj.address.state].filter(Boolean).join(', ') : '';
    await pushPendingLead({
      type: 'new_project',
      ccId: String(proj.id || proj.public_id || ''),
      name: proj.name || addr || 'New CompanyCam Project',
      address: addr,
      url: proj.url || ('https://app.companycam.com/projects/' + (proj.id||'')),
      createdAt: proj.created_at || new Date().toISOString(),
      creator: (proj.creator && (proj.creator.name || (proj.creator.first_name ? (proj.creator.first_name + ' ' + (proj.creator.last_name||'')) : ''))) || proj.created_by_name || proj.user_name || '',
      source: 'companycam'
    });
  }

  if(eventType.includes('photo.created') || eventType.includes('photo_created')){
    const photo = data.photo || data;
    const proj = data.project || {};
    await pushPendingLead({
      type: 'new_photo',
      ccId: String(proj.id || photo.project_id || ''),
      projectName: proj.name || '',
      source: 'companycam'
    });
  }

  return { statusCode: 200, headers, body: JSON.stringify({ received: true, event: eventType }) };
};
