/* ============================================================================
   GrayCo — LEAD SOURCE (GrayCo lead or the PM's own).   netlify/functions/lead-source.js   (patch SRC)
   The rule is in _lib/leadsource.js (earliest record at the street address wins; RoofScout leads count).
   GET  ?review=1                      → open jobs whose stored source differs from the rule (admins; read-only)
   GET  ?job=<id>                      → the rule's answer for one job, with the reason (staff)
   POST { action: 'check', job }       → the rule's answer for a NEW job the CRM is about to save (staff)
   POST { action: 'log', entry }       → add a line to the lead-source log (admins: Apply / Keep / Change)
   GET  ?log=1                         → the last 200 log lines (admins)
   Nothing here changes a job: the CRM saves what an admin chose, and new jobs only (see tail SRC).
   ========================================================================== */
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
'use strict';
const SRC = require('./_lib/leadsource.js');
function J(event, code, b){ return { statusCode: code, headers: Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }), body: JSON.stringify(b) }; }
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function parse(v){ if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { return JSON.parse(v); } catch (e) {} } return v; }
const LOG_KEY = 'gc_leadsrc_log', LOG_MAX = 2000;

/* ── Supabase (service key) ── */
function sbEnv(){ return { url: s(process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''), key: s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) }; }
function svcH(e, extra){ return Object.assign({ apikey: e.key, Authorization: 'Bearer ' + e.key }, extra || {}); }
async function kvRead(keys, table){
  const e = sbEnv();
  const r = await fetch(e.url + '/rest/v1/' + (table || 'gc_kv') + '?select=key,value&key=in.(' + keys.map(k => '"' + k + '"').join(',') + ')', { headers: svcH(e) });
  if (!r.ok) throw new Error((table || 'gc_kv') + ' read answered ' + r.status);
  const out = {}; arr(await r.json()).forEach(x => { if (x && x.key) out[x.key] = parse(x.value); });
  return out;
}
async function kvWrite(key, value){
  const e = sbEnv();
  const r = await fetch(e.url + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST',
    headers: svcH(e, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ key: key, value: value, updated_at: new Date().toISOString() }]) });
  if (!r.ok) throw new Error('gc_kv write answered ' + r.status);
}
/* the job list: one row "projects", or "projects__manifest" + "projects__chunkN" */
async function readProjects(){
  const m = await kvRead(['projects', 'projects__manifest']);
  const man = obj(m.projects__manifest);
  if (man.chunked && man.count > 0) {
    const keys = []; for (let i = 0; i < man.count; i++) keys.push('projects__chunk' + i);
    const c = await kvRead(keys);
    return [].concat.apply([], keys.map(k => arr(c[k])));
  }
  return arr(m.projects);
}
/* the Lead Inbox lives in its own table once docs/lead-inbox.sql has run (gc_kv before that) */
async function readInbox(kv){
  let v = null;
  try { v = (await kvRead(['gc_lead_inbox'], 'gc_lead_inbox_kv')).gc_lead_inbox; } catch (e) {}
  if (v == null) v = kv.gc_lead_inbox;
  return Array.isArray(v) ? v : arr(obj(v).items);
}
/* RoofScout leads (rs_leads), only the fields the rule needs, all pages */
async function readRoofScout(){
  const e = sbEnv(); const rows = [];
  for (let page = 0; page < 40; page++) {
    const r = await fetch(e.url + '/rest/v1/rs_leads?select=id,created_at,address:data->>address,name:data->>name,demo:data->>demo,dnc:data->>doNotContact&order=created_at.asc&limit=1000&offset=' + (page * 1000), { headers: svcH(e) });
    if (!r.ok) break;
    const got = arr(await r.json());
    got.forEach(x => rows.push({ id: x.id, created_at: x.created_at, data: { address: x.address, name: x.name, demo: x.demo === 'true' || x.demo === true, doNotContact: x.dnc === 'true' || x.dnc === true } }));
    if (got.length < 1000) break;
  }
  return SRC.roofscoutFrom(rows);
}
/* RoofScout leads at one address (a single new job) */
async function rsNear(address){
  const a = SRC.normAddr(address); if (a.length < 6) return [];
  const num = (/^\s*(\d+)/.exec(s(address)) || [])[1]; if (!num) return [];
  const e = sbEnv(); let rows = [];
  try {
    const r = await fetch(e.url + '/rest/v1/rs_leads?select=id,data,created_at&order=created_at.asc&limit=200&data->>address=ilike.' + encodeURIComponent(num + ' *'), { headers: svcH(e) });
    if (r.ok) rows = arr(await r.json());
  } catch (err) {}
  return SRC.roofscoutFrom(rows).filter(x => SRC.normAddr(x.address) === a);
}
async function lists(){
  const kv = await kvRead(['leads', 'customers', 'users', 'gc_lead_inbox', 'gc_job_source']);
  return { projects: await readProjects(), leads: arr(kv.leads), customers: arr(kv.customers), inbox: await readInbox(kv), jobSource: obj(kv.gc_job_source), admins: SRC.adminsFrom(kv.users) };
}
function isAdmin(who){ return /admin|owner/.test(s(who && who.role).toLowerCase()); }

async function handle(event){
  if (event.httpMethod === 'OPTIONS') return J(event, 200, {});
  const who = await gcStaffAuth(event); if (!who.ok) return J(event, who.statusCode, { ok: false, error: who.error });
  if (!sbEnv().key) return J(event, 200, { ok: false, error: 'SUPABASE_SERVICE_KEY is not set' });
  const q = event.queryStringParameters || {};
  if (event.httpMethod === 'GET') {
    if (q.review) {
      if (!isAdmin(who)) return J(event, 403, { ok: false, error: 'Only an admin can review lead sources.' });
      const L = await lists(), rs = await readRoofScout();
      const items = SRC.reviewList(L, rs, { jobSource: L.jobSource, admins: L.admins });
      return J(event, 200, { ok: true, items: items, checked: L.projects.length, roofscout: rs.length, at: new Date().toISOString() });
    }
    if (q.log) {
      if (!isAdmin(who)) return J(event, 403, { ok: false, error: 'Admins only.' });
      const kv = await kvRead([LOG_KEY]);
      return J(event, 200, { ok: true, log: arr(kv[LOG_KEY]).slice(-200) });
    }
    if (q.job) {
      const L = await lists(), j = L.projects.find(x => x && s(x.id) === s(q.job));
      if (!j) return J(event, 404, { ok: false, error: 'No such job.' });
      const c = SRC.classify(j, { records: SRC.recordsFrom(L), roofscout: await rsNear(j.address), admins: L.admins });
      return J(event, 200, { ok: true, id: j.id, stored: SRC.storedOf(j, L.jobSource) || '', source: c.source, pm: c.pm, reason: c.reason, evidence: c.evidence });
    }
    return J(event, 400, { ok: false, error: 'Nothing asked.' });
  }
  if (event.httpMethod !== 'POST') return J(event, 405, { ok: false, error: 'GET or POST' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(event, 400, { ok: false, error: 'Bad JSON' }); }
  if (b.action === 'check') {
    const j = obj(b.job); if (!j.id) return J(event, 400, { ok: false, error: 'No job.' });
    const L = await lists();
    const c = SRC.classify(j, { records: SRC.recordsFrom(L), roofscout: await rsNear(j.address), admins: L.admins });
    return J(event, 200, { ok: true, id: j.id, source: c.source, pm: c.pm, reason: c.reason, evidence: c.evidence, fields: SRC.fieldsFor(c) });
  }
  if (b.action === 'log') {
    const en = obj(b.entry);
    if (s(en.action) !== 'auto' && !isAdmin(who)) return J(event, 403, { ok: false, error: 'Only an admin can change a lead source.' });   /* 'auto' = a new job the CRM set by the rule */
    const line = { at: new Date().toISOString(), by: s(who.name) || who.email, email: who.email, job: s(en.job).slice(0, 80), name: s(en.name).slice(0, 160),
      action: s(en.action).slice(0, 20), from: s(en.from).slice(0, 20), to: s(en.to).slice(0, 20), pm: s(en.pm).slice(0, 80), note: s(en.note).slice(0, 500), reason: s(en.reason).slice(0, 300) };
    if (!line.job || !/^(apply|keep|override|auto)$/.test(line.action)) return J(event, 400, { ok: false, error: 'A log line needs a job and an action.' });
    const kv = await kvRead([LOG_KEY]);
    await kvWrite(LOG_KEY, arr(kv[LOG_KEY]).concat([line]).slice(-LOG_MAX));
    return J(event, 200, { ok: true, entry: line });
  }
  return J(event, 400, { ok: false, error: 'Unknown action.' });
}
exports.handler = async function(event){
  try { return await handle(event || {}); }
  catch (e) { return J(event, 200, { ok: false, error: String(e && e.message || e) }); }
};
exports._t = { handle, readRoofScout, rsNear, lists };
