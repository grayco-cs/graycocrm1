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

// ---- Supabase persistence for pending CompanyCam leads (survives across function instances) ----
/* patch CCSYNC: the default project URL like every other function (without it a webhook project lived in memory only and
   was lost when the function went cold), and the SERVICE_ROLE spelling too */
const SUPABASE_URL = String(process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
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

/* ── The CompanyCam key lives on the server (33.144) ───────────────────────────
   COMPANYCAM_TOKEN (Netlify → Site configuration → Environment variables) is the
   ONE key every CompanyCam call uses. A key a browser sends in x-cc-token is used
   only while that variable is not set (the old way, kept as a fallback). No answer
   from this function ever contains the key. */
function ccTokenFor(event){
  const env = require('./_lib/cc-api.js').cleanToken(process.env.COMPANYCAM_TOKEN).token;   /* patch CCS2: spaces / quotes / "Bearer " cleaned */
  if (env) return { token: env, source: 'env' };
  const sent = gcHeader(event, 'x-cc-token').trim();
  if (sent) return { token: sent, source: 'browser' };
  return { token: '', source: 'none' };
}
const CC_API = 'https://api.companycam.com/v2';
function ccHeaders(token){ return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json' }; }
function ccAddr(a){
  a = a || {};
  return [a.street_address_1, a.street_address_2, a.city, a.state, a.postal_code].map(function(x){ return String(x || '').trim(); }).filter(Boolean).join(', ');
}
function ccWhen(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : v;
  const n = Number(v); if (isFinite(n) && String(v).trim() !== '') return n > 1e12 ? Math.floor(n / 1000) : n;
  const d = Date.parse(v); return isNaN(d) ? 0 : Math.floor(d / 1000);
}
/* patch PHOTOLINK: the project's feature image, the thumbnail size (https only) */
function ccThumb(p){
  const f = p && p.feature_image; const l = Array.isArray(f) ? f : (f && typeof f === 'object' ? (Array.isArray(f.uris) ? f.uris : [f]) : []);
  const by = {}; l.forEach(function(u){ if (u && u.type) by[u.type] = String(u.uri || u.url || ''); });
  const t = by.thumbnail || by.web || '';
  return /^https:\/\/[^\s"'<>]+$/i.test(t) ? t : '';
}
/* the small, safe shape of a project the review list needs */
function ccCompact(p){
  const a = p.address || {};
  const c = p.primary_contact || p.contact || (Array.isArray(p.contacts) && p.contacts[0]) || null;
  const cr = p.creator || {};
  return {
    id: String(p.id || ''),
    name: String(p.name || '').trim(),
    address: ccAddr(a),
    street: String(a.street_address_1 || '').trim(),
    city: String(a.city || '').trim(), state: String(a.state || '').trim(), zip: String(a.postal_code || '').trim(),
    created_at: ccWhen(p.created_at), updated_at: ccWhen(p.updated_at || p.created_at),
    creator: String(cr.name || [cr.first_name, cr.last_name].filter(Boolean).join(' ') || p.creator_name || p.created_by_name || '').trim(),
    photo_count: (p.photo_count != null ? Number(p.photo_count) : null),
    thumb: ccThumb(p),   /* patch PHOTOLINK: the project's cover, small (GrayCo Photos cards; no photo read per card) */
    status: String(p.status || ''),
    url: String(p.project_url || p.url || ('https://app.companycam.com/projects/' + (p.id || ''))),
    contact: c ? { name: String(c.name || c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || ''),
                   phone: String(c.phone_number || c.phone || ''), email: String(c.email || c.email_address || '') } : null
  };
}

async function listPendingLeads(){
  if(!SUPABASE_URL || !SUPABASE_KEY){
    const p = global._ccPendingLeads || [];
    return p.map(function(l, i){ if(!l.__rowId) l.__rowId = 'm' + Date.now().toString(36) + i; return Object.assign({ rowId: l.__rowId }, l); });
  }
  try{
    const r = await sb('cc_pending_leads?select=id,lead,created_at&order=created_at.asc&limit=500', { method:'GET' });
    if(!r.ok) return [];
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).map(function(x){ return Object.assign({ rowId: String(x.id), arrivedAt: x.created_at || '' }, x.lead || {}); });
  }catch(e){ return []; }
}
async function ackPendingLeads(ids){
  if(!ids.length) return 0;
  if(!SUPABASE_URL || !SUPABASE_KEY){
    const before = (global._ccPendingLeads || []).length;
    global._ccPendingLeads = (global._ccPendingLeads || []).filter(function(l){ return ids.indexOf(String(l.__rowId)) < 0; });
    return before - global._ccPendingLeads.length;
  }
  try{
    const r = await sb('cc_pending_leads?id=in.(' + ids.join(',') + ')', { method:'DELETE', headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY, 'Prefer':'return=minimal' } });
    return r.ok ? ids.length : 0;
  }catch(e){ return 0; }
}

/* patch PHOTODL: GET ?proxy=img&url=<CompanyCam image link> — a signed-in, staff-only fetch of ONE CompanyCam picture, for
   browsers whose direct fetch of the image CDN is refused (CORS). It is not an open proxy: https only, no credentials or odd
   ports, host must be a CompanyCam image host (checked again on every redirect), the answer must be an image, 15 MB at most. */
const CC_IMG_MAX = 15 * 1024 * 1024;
function ccImgHostOk(h){
  h = String(h || '').toLowerCase();
  if(h === 'api.companycam.com' || h === 'app.companycam.com') return false;
  return /^([a-z0-9-]+\.)+companycam\.com$/.test(h) || /^companycam[a-z0-9.-]*\.s3[a-z0-9.-]*\.amazonaws\.com$/.test(h);
}
function ccImgParse(raw){
  try{
    raw = String(raw || ''); if(!raw || raw.length > 2048) return null;
    const u = new URL(raw);
    if(u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    return ccImgHostOk(u.hostname) ? u : null;
  }catch(e){ return null; }
}
async function ccImgProxy(raw, headers){
  const J = function(code, msg){ return { statusCode: code, headers, body: JSON.stringify({ error: msg }) }; };
  let u = ccImgParse(raw);
  if(!u) return J(400, 'Only CompanyCam image links can be fetched.');
  let r = null;
  try{
    for(let hop = 0; hop < 4; hop++){
      r = await fetch(u.toString(), { redirect: 'manual', headers: { Accept: 'image/*' } });
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : '';
      if(!loc) break;
      u = ccImgParse(new URL(loc, u).toString());
      if(!u) return J(400, 'Only CompanyCam image links can be fetched.');
      r = null;
    }
  }catch(e){ return J(502, 'Could not fetch the photo.'); }
  if(!r) return J(502, 'Too many redirects.');
  if(!r.ok) return J(r.status === 404 ? 404 : 502, 'CompanyCam answered ' + r.status);
  const ct = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if(!/^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/.test(ct)) return J(415, 'That link is not a picture.');
  if((parseInt(r.headers.get('content-length') || '0', 10) || 0) > CC_IMG_MAX) return J(413, 'That photo is larger than 15 MB.');
  const chunks = []; let n = 0;
  try{
    if(r.body && typeof r.body.getReader === 'function'){
      const rd = r.body.getReader();
      for(;;){
        const x = await rd.read(); if(x.done) break;
        n += x.value.length;
        if(n > CC_IMG_MAX){ try{ await rd.cancel(); }catch(e){} return J(413, 'That photo is larger than 15 MB.'); }
        chunks.push(Buffer.from(x.value));
      }
    } else {
      const b = Buffer.from(await r.arrayBuffer()); n = b.length;
      if(n > CC_IMG_MAX) return J(413, 'That photo is larger than 15 MB.');
      chunks.push(b);
    }
  }catch(e){ return J(502, 'The photo download was cut off.'); }
  return { statusCode: 200, isBase64Encoded: true, body: Buffer.concat(chunks).toString('base64'),
    headers: Object.assign({}, headers, { 'Content-Type': ct, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' }) };
}

// Netlify function — CompanyCam integration:
// 1. GET  ?proxy=api&endpoint=... : proxy CompanyCam READ calls (avoids CORS)
// 2. GET  ?proxy=find&name=..&address=.. : search existing CompanyCam projects for a match
// 3. POST ?proxy=create : create a CompanyCam project from the CRM (enter-once sync)
// 4. POST (webhook body): receive CompanyCam webhook events (project.created, photo.created)
// 5. GET  (no proxy): poll for pending webhook leads (drains them — kept for old pages)
// 6. GET  ?proxy=status : is the CompanyCam key working? {ok, reason, source} — never the key
// 7. GET  ?proxy=recent&days=N|since=<unix> : every active project changed since then (all pages), small shape
// 9. GET  ?proxy=img&url=<CompanyCam image link> : one picture, staff only (patch PHOTODL)
// 8. GET  ?proxy=pending : the webhook's waiting projects WITHOUT removing them; POST ?proxy=ack {ids} removes them

exports.handler = async function(event, context) {
  const headers = Object.assign(gcCors(event, 'POST, GET, OPTIONS', 'x-companycam-secret, x-cc-token, x-gc-cc'),
    { 'Content-Type': 'application/json' });

  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 200, headers, body: '' };
  }

  const qs = event.queryStringParameters || {};

  // Everything the CRM calls (the ?proxy= calls and the GET that drains pending
  // leads) is staff only. The plain webhook POST from CompanyCam is not a staff
  // call and stays as it was: it can only put a lead on the review list.
  let who = null;   /* patch CCSYNC: kept for the admin / office checks below */
  if(event.httpMethod === 'GET' || qs.proxy){
    who = await gcStaffAuth(event);
    if(!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ error: who.error }) };
  }

  // POST ?proxy=create {name, address, lat, lng} — patch FIELD: the matching CompanyCam project for a job added in
  // GrayCo Field (admin switch "Also create in CompanyCam"). Staff only (checked above). Answers {ok, id} — never the key.
  if(event.httpMethod === 'POST' && qs.proxy === 'create'){
    const k = ccTokenFor(event);
    if(!k.token) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'no_key' }) };
    let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { b = {}; }
    const name = String(b.name || '').trim().slice(0, 200), addr = String(b.address || '').trim().slice(0, 300);
    if(!name) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'name required' }) };
    const m = /^(.+?),\s*([^,]+?),\s*([A-Za-z]{2})\s*(\d{5})?/.exec(addr) || [];
    const body = { name: name, address: { street_address_1: m[1] || addr, city: m[2] || '', state: m[3] || '', postal_code: m[4] || '', country: 'US' } };
    if(isFinite(+b.lat) && isFinite(+b.lng) && b.lat != null && b.lng != null) body.coordinates = { lat: +b.lat, lon: +b.lng };
    try {
      const r = await fetch(CC_API + '/projects', { method: 'POST', headers: { Authorization: 'Bearer ' + k.token, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(function(){ return {}; });
      if(r.ok && j && j.id) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: String(j.id) }) };
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, status: r.status, reason: 'companycam_' + r.status }) };
    } catch (e) { return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'unreachable' }) }; }
  }

  // GET ?proxy=status — one cheap question to CompanyCam: does the key work?
  if(event.httpMethod === 'GET' && qs.proxy === 'status'){
    const k = ccTokenFor(event);
    const out = { ok: false, reason: '', source: k.source, checkedAt: new Date().toISOString() };
    if(!k.token){
      out.reason = 'no_key';
      out.message = 'No CompanyCam key is set. Add COMPANYCAM_TOKEN on Netlify (Environment variables) and deploy again.';
      return { statusCode: 200, headers, body: JSON.stringify(out) };
    }
    /* patch CCS2 — the one truth: a fresh authenticated GET /v2/company that answers 200 WITH a company object.
       Recorded with its time (gc_kv gc_cc_whoami). The projects list can fail on its own (see ?proxy=sync). */
    const CCA = require('./_lib/cc-api.js');
    const w = await CCA.whoami(k.token);
    out.status = w.status; out.verified = w.accepted === true; out.checkedAt = w.at;
    if(w.accepted === true){ out.ok = true; out.reason = 'ok'; out.message = 'Token accepted'; }
    else if(w.accepted === false){ out.reason = 'refused'; out.message = 'Token not accepted (' + w.status + ')'; }
    else if(w.status === 0){ out.reason = 'unreachable'; out.message = 'Could not reach CompanyCam from the server.'; }
    else { out.reason = 'companycam_' + w.status; out.message = 'CompanyCam answered ' + w.status + (w.status === 200 ? ' without the company record' : '') + '. Try again later.'; }
    if(k.source === 'env') await CCA.saveWhoami(w);   /* only the Netlify key's check is the company's record */
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  }

  // POST ?proxy=syncnow — patch CCSYNC: an admin / the office ask for a full CompanyCam re-read ("⟳ Sync all now"); the
  // 15-minute companycam-sync does it on its next run (gc_kv gc_cc_sync_request). POST ?proxy=review {cc, act, kind} —
  // a person's answer on the review list: make (a new job on the next run) · dismiss (not a new job, never again) · done.
  if(event.httpMethod === 'POST' && (qs.proxy === 'syncnow' || qs.proxy === 'review')){
    const role = String(who && who.role || '').toLowerCase();
    if(!/^(admin|owner|office)$/.test(role)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Only an admin or the office can do this.' }) };
    const url = String(process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
    const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if(!svc) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY is not set in Netlify.' }) };
    const SH = { apikey: svc, Authorization: 'Bearer ' + svc, 'Content-Type': 'application/json' };
    const rd = async function(keys){ const r = await fetch(url + '/rest/v1/gc_kv?select=key,value&key=in.(' + keys.map(function(k){ return '%22' + k + '%22'; }).join(',') + ')', { headers: SH });
      const o = {}; if(r.ok){ const rows = await r.json(); (Array.isArray(rows) ? rows : []).forEach(function(x){ let v = x && x.value; if(typeof v === 'string'){ try{ v = JSON.parse(v); }catch(e){} } if(x && x.key) o[x.key] = v; }); } else throw new Error('read ' + r.status); return o; };
    const wr = async function(rows){ const r = await fetch(url + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, SH),
      body: JSON.stringify(rows.map(function(x){ return { key: x.key, value: x.value, updated_at: new Date().toISOString() }; })) }); return r.ok; };
    const isObj = function(v){ return !!v && typeof v === 'object' && !Array.isArray(v); };
    try{
      const cur = await rd(['gc_cc_sync_request', 'gc_cc_review', 'gc_cc_dismissed', 'gc_cc_link_no']);
      const req = Object.assign({}, isObj(cur.gc_cc_sync_request) ? cur.gc_cc_sync_request : {}), at = new Date().toISOString();
      if(qs.proxy === 'syncnow'){
        Object.assign(req, { full: true, at: at, by: who.email || '' });
        const ok = await wr([{ key: 'gc_cc_sync_request', value: req }]);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: ok, message: ok ? 'Full CompanyCam sync asked for — it runs within 15 minutes.' : 'Could not save the request.' }) };
      }
      let b = {}; try{ b = JSON.parse(event.body || '{}') || {}; }catch(e){ b = {}; }
      const cc = String(b.cc || '').trim(), act = String(b.act || ''), kind = String(b.kind || ''), job = String(b.job || '').trim();
      if(!/^\d{1,20}$/.test(cc) || !/^(dismiss|make|done|link|notthis)$/.test(act)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'cc and act (make | dismiss | done | link | notthis) are required' }) };
      if((act === 'link' || act === 'notthis') && !/^[A-Za-z0-9_\-:.]{1,80}$/.test(job)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'job is required' }) };
      const list = Array.isArray(cur.gc_cc_review) ? cur.gc_cc_review : [];
      /* patch PHOTOLINK: "Link" — the project's photos go on that job (the 15-minute sync ties it; the CRM page ties it at once);
         "Not this job" — that pair is never suggested or linked again (gc_kv gc_cc_link_no); the project stays on the list
         with whatever other jobs it could be */
      if(act === 'notthis'){
        const no = Object.assign({}, isObj(cur.gc_cc_link_no) ? cur.gc_cc_link_no : {}); no[cc + '|' + job] = { at: at, by: who.email || '' };
        const next = list.map(function(x){ return x && String(x.cc) === cc && Array.isArray(x.jobs) ? Object.assign({}, x, { jobs: x.jobs.filter(function(j){ return j && String(j.id) !== job; }) }) : x; });
        const ok = await wr([{ key: 'gc_cc_link_no', value: no }, { key: 'gc_cc_review', value: next }]);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: ok }) };
      }
      const rows = [{ key: 'gc_cc_review', value: list.filter(function(x){ return !(x && String(x.cc) === cc && (!kind || x.kind === kind)); }) }];
      if(act === 'dismiss'){ const dis = Object.assign({}, isObj(cur.gc_cc_dismissed) ? cur.gc_cc_dismissed : {}); dis['id:' + cc] = { at: at, by: who.email || '', why: 'CompanyCam review list: not a new job' }; rows.push({ key: 'gc_cc_dismissed', value: dis }); }
      if(act === 'link'){ req.link = Object.assign({}, isObj(req.link) ? req.link : {}); req.link[cc] = job; rows.push({ key: 'gc_cc_sync_request', value: req }); }
      if(act === 'make'){ req.make = Object.assign({}, isObj(req.make) ? req.make : {}); req.make[cc] = at; Object.assign(req, { full: true, at: at, by: who.email || '' }); rows.push({ key: 'gc_cc_sync_request', value: req }); }
      const ok = await wr(rows);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: ok }) };
    }catch(err){ return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'Could not reach the CRM database. Try again.' }) }; }
  }

  // POST ?proxy=photoindex — patch CCPHOTOS: an admin / the office ask for "⟳ Index all photos now": every photo of every linked
  // CompanyCam project is listed again (gc_kv ccidx_request), at once in the background function (up to ~13 minutes a go; the
  // 15-minute companycam-photos goes on from where it stopped). Nothing is copied; never the token.
  if(event.httpMethod === 'POST' && qs.proxy === 'photoindex'){
    const role = String(who && who.role || '').toLowerCase();
    if(!/^(admin|owner|office)$/.test(role)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Only an admin or the office can do this.' }) };
    const url = String(process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
    const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if(!svc) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY is not set in Netlify.' }) };
    if(!String(process.env.COMPANYCAM_TOKEN || '').trim()) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'COMPANYCAM_TOKEN is not set in Netlify.' }) };
    const CP = require('./_lib/cc-photos.js'), at = new Date().toISOString();
    try{
      const r = await fetch(url + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: svc, Authorization: 'Bearer ' + svc, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ key: CP.REQ, value: { at: at, by: who.email || '' }, updated_at: at }]) });
      if(!r.ok) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'Could not save the request (' + r.status + ').' }) };
    }catch(err){ return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'Could not reach the CRM database. Try again.' }) }; }
    const started = await CP.kickBackground('admin');
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, started: started, message: started ? 'Indexing every CompanyCam photo now — press Refresh to see how far it is.' : 'Asked — the next 15-minute run starts it.' }) };
  }

  // GET ?proxy=sync — patch CCS: what the 15-minute companycam-sync recorded on its last run (gc_kv gc_cc_sync_health)
  // and whether COMPANYCAM_TOKEN is set here. Never the key. No CompanyCam call.
  if(event.httpMethod === 'GET' && qs.proxy === 'sync'){
    const out = { ok: true, tokenSet: !!String(process.env.COMPANYCAM_TOKEN || '').trim(), health: null, checkedAt: new Date().toISOString() };
    const url = String(process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
    const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if(!svc){ out.serviceKey = false; return { statusCode: 200, headers, body: JSON.stringify(out) }; }
    try{
      /* + patch CCS2 (one truth): gc_cc_whoami, the last real GET /company check, with its time */
      const r = await fetch(url + '/rest/v1/gc_kv?select=key,value&key=in.(%22gc_cc_sync_health%22,%22gc_cc_whoami%22,%22gc_cc_review%22,%22gc_cc_sync_request%22,%22ccidx_state%22)', { headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
      if(r.ok){
        const rows = await r.json();
        (Array.isArray(rows) ? rows : []).forEach(function(x){
          let v = x && x.value; if(typeof v === 'string'){ try{ v = JSON.parse(v); }catch(e){ v = null; } }
          if(!v || typeof v !== 'object') return;
          if(x.key === 'ccidx_state'){ out.photoIndex = require('./_lib/cc-photos.js').statusOf(v); return; }   /* patch CCPHOTOS */
          if(x.key === 'gc_cc_sync_health') out.health = v; else if(x.key === 'gc_cc_whoami') out.whoami = v;
          else if(x.key === 'gc_cc_review') out.review = Array.isArray(v) ? v.slice(0, 100) : []; else if(x.key === 'gc_cc_sync_request') out.request = { at: v.at || '', by: v.by || '' };   /* patch CCSYNC */
        });
      }
      else out.readError = r.status;
    }catch(err){ out.readError = 'unreachable'; }
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  }

  // GET ?proxy=recent&days=N — every ACTIVE project changed in the last N days, all pages, small shape
  if(event.httpMethod === 'GET' && qs.proxy === 'recent'){
    const token = ccTokenFor(event).token;
    if(!token){ return { statusCode: 401, headers, body: JSON.stringify({error:'No token'}) }; }
    let days = parseInt(qs.days, 10); if(!(days > 0)) days = 90; if(days > 3650) days = 3650;
    let since = Math.floor(Date.now() / 1000) - days * 86400;
    const sinceQ = parseInt(qs.since, 10); if(sinceQ > 0 && sinceQ < Math.floor(Date.now() / 1000)) since = sinceQ;   // ?since=<unix> wins
    const out = []; let pages = 0, truncated = false;
    /* patch CCS2: modified_since is ISO8601 per CompanyCam's v2 spec (was unix seconds); a 5xx is retried once,
       then the same list without the filter (newest first; stop at the first page with nothing changed since) */
    const CCA = require('./_lib/cc-api.js'), iso = CCA.isoOf(since);
    try{
      let filter = true;
      for(let page = 1; page <= 40; page++){
        const g = await CCA.getRetry(CC_API + '/projects?per_page=50&page=' + page + '&status=active' + (filter ? '&modified_since=' + encodeURIComponent(iso) : ''), token);
        if(!g.r){
          if(page === 1 && filter && (g.status >= 500 || g.status === 400 || g.status === 422 || g.status === 0)){ filter = false; page = 0; continue; }
          if(page === 1) return { statusCode: g.status || 502, headers, body: JSON.stringify({ error: 'CompanyCam ' + g.status, detail: g.body || '' }) };
          truncated = true; break;
        }
        const chunk = await g.r.json();
        pages = page;
        if(!Array.isArray(chunk) || !chunk.length) break;
        let fresh = 0;
        chunk.forEach(function(p){
          if(!p || p.id == null) return;
          const c = ccCompact(p);
          if(c.status && c.status !== 'active') return;
          if(Math.max(c.created_at, c.updated_at) && Math.max(c.created_at, c.updated_at) < since) return;
          out.push(c); fresh++;
        });
        if(!filter && !fresh) break;
        if(chunk.length < 50) break;
        if(page === 40) truncated = true;
      }
    }catch(err){ return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not reach CompanyCam.' }) }; }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, days: days, pages: pages, truncated: truncated, projects: out }) };
  }

  // GET ?proxy=pending — what the webhook left waiting, NOT removed (the CRM files it, then acks)
  if(event.httpMethod === 'GET' && qs.proxy === 'pending'){
    const rows = await listPendingLeads();
    return { statusCode: 200, headers, body: JSON.stringify({ leads: rows }) };
  }
  // POST ?proxy=ack {ids:[...]} — the CRM has filed these on its review list; remove them here
  if(event.httpMethod === 'POST' && qs.proxy === 'ack'){
    let b = {}; try{ b = JSON.parse(event.body || '{}'); }catch(e){ return { statusCode: 400, headers, body: JSON.stringify({error:'Bad JSON'}) }; }
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(function(x){ return String(x); }).filter(function(x){ return /^[A-Za-z0-9_-]{1,64}$/.test(x); });
    const n = await ackPendingLeads(ids);
    return { statusCode: 200, headers, body: JSON.stringify({ removed: n }) };
  }

  // GET ?proxy=img — patch PHOTODL: one CompanyCam picture for the download button (staff check ran above)
  if(event.httpMethod === 'GET' && qs.proxy === 'img'){
    return await ccImgProxy(qs.url, headers);
  }

  // GET ?proxy=api — proxy CompanyCam read calls from the browser
  if(event.httpMethod === 'GET' && qs.proxy === 'api'){
    const token = ccTokenFor(event).token;
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
        // pass on only these CompanyCam list parameters (the Photos tab searches by name and pages through photos)
        const pq = new URLSearchParams({ per_page: String(Math.min(parseInt(qs.per_page, 10) || 100, 100)) });
        ['query', 'page', 'status'].forEach(function(k){ if (qs[k] != null && String(qs[k]).length < 200) pq.set(k, String(qs[k])); });
        /* patch CCS2: a CompanyCam 5xx (photos, notes, searches) is retried once before it reaches the page */
        const gg = await require('./_lib/cc-api.js').getRetry(`https://api.companycam.com/v2/${String(endpoint).replace(/^\/+/, '')}?${pq.toString()}`, token);
        if(!gg.r) return { statusCode: gg.status || 502, headers, body: JSON.stringify({ error: 'CompanyCam ' + gg.status, detail: gg.body || '' }) };
        const rd = await gg.r.json();
        return { statusCode: gg.status, headers, body: JSON.stringify(rd) };
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
    const token = ccTokenFor(event).token;
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
    const token = ccTokenFor(event).token;
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
    const token = ccTokenFor(event).token;
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
      createdAt: proj.created_at || proj.updated_at || '',   // no date → the CRM treats it as made before 2026 (never imported)
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
