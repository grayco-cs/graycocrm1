// netlify/functions/roofscout-skiptrace.js
// RoofScout "📞 Find owner contact": asks Tracerfy (paid skip tracing) for the phones and
// emails of a lead's property owner.
//
// Env vars: TRACERFY_API_KEY (never sent to the browser), SUPABASE_URL, SUPABASE_SERVICE_KEY,
//           SUPABASE_ANON_KEY (already set). Optional: TRACERFY_API_URL (default
//           https://tracerfy.com/v1/api; https://mock.tracerfy.com/v1/api is Tracerfy's free sandbox).
//
//   GET  ?action=status                      → { connected, usedThisMonth, limit, balance }
//   POST { leadId, owner, address, mail, again } → { contact: { phones, emails, names, hit, source, fetchedAt }, cached, usedThisMonth, limit }
//
// Costs credits, so: only on a person's click; ONE lookup per lead, kept in rs_skiptrace
// (a second click, or two clicks at once, never pays twice; "Trace again" must say again:true);
// an admin monthly limit (RoofScout Settings, default 200) counted in rs_usage (kind 'tracerfy',
// hits only: Tracerfy charges nothing for a miss); refused for leads marked "Do not contact"
// and owners on the do-not-contact list.
'use strict';

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

const TRACERFY_DEFAULT = 'https://tracerfy.com/v1/api';
const DEFAULT_LIMIT = 200;
const LEAD_ID = /^[A-Za-z0-9_-]{1,40}$/;

function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function svcHeaders(){ const k = svcKey(); return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; }
function month(){ return new Date().toISOString().slice(0, 7); }
function apiBase(){ return (process.env.TRACERFY_API_URL || TRACERFY_DEFAULT).replace(/\/$/, ''); }
function fail(status, code, message, extra){ return Object.assign(new Error(message), { status: status, code: code }, extra || {}); }

async function fetchT(url, opts, ms) {
  const ac = new AbortController();
  const t = setTimeout(function(){ ac.abort(); }, ms || 8000);
  try { return await fetch(url, Object.assign({}, opts || {}, { signal: ac.signal })); }
  finally { clearTimeout(t); }
}

async function rpc(name, args) {
  const r = await fetch(sbUrl() + '/rest/v1/rpc/' + name, { method: 'POST', headers: svcHeaders(), body: JSON.stringify(args) });
  if (!r.ok) throw fail(500, 'no-tables', 'RoofScout skip-trace tables missing: run docs/roofscout-setup.sql again in Supabase.');
  return r.json();
}

async function settingsAndUsage() {
  let limit = DEFAULT_LIMIT, dnc = '';
  const s = await fetch(sbUrl() + '/rest/v1/rs_settings?id=eq.main&select=data', { headers: svcHeaders() });
  if (s.ok) {
    const rows = await s.json();
    const d = (rows[0] && rows[0].data) || {};
    const v = d.skiptrace && d.skiptrace.monthlyLimit;
    if (v >= 0 && v !== null && v !== '') limit = Number(v);
    dnc = (d.areaScan && d.areaScan.doNotContact) || '';
  }
  const u = await fetch(sbUrl() + '/rest/v1/rs_usage?kind=eq.tracerfy&month=eq.' + month() + '&select=count', { headers: svcHeaders() });
  if (!u.ok) throw fail(500, 'no-tables', 'RoofScout usage table missing: run docs/roofscout-setup.sql again in Supabase.');
  const rows = await u.json();
  return { limit: limit, used: rows[0] ? Number(rows[0].count) || 0 : 0, dnc: dnc };
}

// Tracerfy's account summary (GET /analytics/) includes the credit balance; the field name is
// not fixed in their docs, so look for the likely ones. null when unknown.
async function balance(key) {
  try {
    const r = await fetchT(apiBase() + '/analytics/', { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } }, 4000);
    if (!r.ok) return null;
    const j = await r.json();
    const keys = ['credit_balance', 'credits_balance', 'balance', 'credits', 'credits_remaining', 'remaining_credits', 'available_credits'];
    const look = function(o){ if (!o || typeof o !== 'object') return null; for (const k of keys) if (typeof o[k] === 'number' || (typeof o[k] === 'string' && o[k] !== '' && isFinite(o[k]))) return Number(o[k]); return null; };
    return look(j) != null ? look(j) : look(j.data) != null ? look(j.data) : look(j.account);
  } catch (e) { return null; }
}

// "6000 Stage Rd, Bartlett, TN 38134" → { address, city, state, zip }. null when it can't be split.
function splitAddress(a) {
  const parts = String(a || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  if (parts.length < 2 || !/^\d/.test(parts[0])) return null;
  const last = parts[parts.length - 1];
  let m = /^([A-Za-z]{2})\.?\s+(\d{5})(-\d{4})?$/.exec(last);
  if (m && parts.length >= 3) return { address: parts[0], city: parts[parts.length - 2], state: m[1].toUpperCase(), zip: m[2] };
  m = /^(.*\S)\s+([A-Za-z]{2})\.?\s+(\d{5})(-\d{4})?$/.exec(last);
  if (m) return { address: parts[0], city: parts.length >= 3 ? parts[parts.length - 2] : m[1], state: m[2].toUpperCase(), zip: m[3] };
  m = /^([A-Za-z]{2})$/.exec(last);
  if (m && parts.length >= 3) return { address: parts[0], city: parts[parts.length - 2], state: m[1].toUpperCase(), zip: '' };
  return null;
}

function digits(v){ return String(v || '').replace(/\D/g, ''); }
function fmtPhone(v){ const d = digits(v).replace(/^1(\d{10})$/, '$1'); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : String(v || '').trim(); }
function bool(v){ return v === true || v === 'true' || v === 1 || v === 'Y' || v === 'y' || v === 'yes'; }
function has(o, k){ return o && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== null && o[k] !== undefined && o[k] !== ''; }

// Tracerfy lookup answer → { hit, names, phones: [{ number, type, dnc, litigator, checked }], emails: [] }.
// dnc / litigator are true, false, or null (null = Tracerfy did not say: "not checked").
function normalize(j) {
  const persons = Array.isArray(j && j.persons) ? j.persons : Array.isArray(j && j.results) ? j.results : [];
  const phones = [], emails = [], names = [], seenP = {}, seenE = {};
  persons.forEach(function(p){
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
    if (name) names.push({ name: String(name).trim(), owner: has(p, 'property_owner') ? bool(p.property_owner) : null, deceased: has(p, 'deceased') ? bool(p.deceased) : null, litigator: has(p, 'litigator') ? bool(p.litigator) : null });
    (Array.isArray(p.phones) ? p.phones : []).forEach(function(ph){
      const o = typeof ph === 'object' && ph ? ph : { number: ph };
      const raw = o.number || o.phone || o.phone_number || '';
      const d = digits(raw);
      if (d.length < 10 || seenP[d]) return;
      seenP[d] = 1;
      const dncKnown = has(o, 'dnc');
      const litKnown = has(o, 'tcpa') || has(o, 'litigator') || has(p, 'litigator');
      phones.push({
        number: fmtPhone(raw),
        type: String(o.type || o.phone_type || o.line_type || '').trim(),
        dnc: dncKnown ? bool(o.dnc) : null,
        litigator: litKnown ? (bool(o.tcpa) || bool(o.litigator) || bool(p.litigator)) : null,
        rank: Number(o.rank) || phones.length + 1,
        person: name || ''
      });
    });
    (Array.isArray(p.emails) ? p.emails : []).forEach(function(em){
      const e = String(typeof em === 'object' && em ? (em.email || em.address || '') : em || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || seenE[e]) return;
      seenE[e] = 1;
      emails.push(e);
    });
  });
  const hit = j && has(j, 'hit') ? bool(j.hit) : persons.length > 0;
  return { hit: hit && (phones.length + emails.length + names.length) > 0, names: names.slice(0, 6), phones: phones.slice(0, 10), emails: emails.slice(0, 6), credits: Number(j && j.credits_deducted) || null };
}

async function lookup(key, where) {
  let r;
  try {
    r = await fetchT(apiBase() + '/trace/lookup/', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ address: where.address, city: where.city, state: where.state, zip: where.zip, find_owner: true })
    }, 9000);
  } catch (e) { throw fail(504, 'timeout', 'Tracerfy did not answer in time. Nothing was charged by RoofScout; try again.'); }
  const j = await r.json().catch(function(){ return {}; });
  const msg = String((j && (j.detail || j.error || j.message)) || '');
  if (r.status === 401 || r.status === 403) throw fail(502, 'bad-key', 'Tracerfy did not accept the API key. An admin checks TRACERFY_API_KEY in Netlify.');
  if (r.status === 402 || /credit|balance|insufficient/i.test(msg) && !r.ok) throw fail(402, 'no-credits', 'The Tracerfy account is out of credits. An admin can buy more at tracerfy.com.');
  if (r.status === 429) throw fail(429, 'rate-limit', 'Tracerfy is limiting requests right now. Wait a minute and try again.');
  if (r.status === 404) return { hit: false, names: [], phones: [], emails: [], credits: 0 };
  if (!r.ok) throw fail(502, 'tracerfy-error', 'Tracerfy error ' + r.status + (msg ? ': ' + msg.slice(0, 160) : '') + '.');
  return normalize(j);
}

exports.handler = async function (event) {
  event = event || {};
  const headers = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json' });
  const out = function(code, obj){ return { statusCode: code, headers, body: JSON.stringify(obj) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const who = await gcStaffAuth(event);
  if (!who.ok) return out(who.statusCode, { error: who.error });
  if (!svcKey()) return out(500, { error: 'SUPABASE_SERVICE_KEY not set.' });
  const key = process.env.TRACERFY_API_KEY || '';
  const q = event.queryStringParameters || {};

  let su;
  try { su = await settingsAndUsage(); } catch (e) { return out(e.status || 500, { error: e.message, code: e.code }); }

  if (event.httpMethod === 'GET' && q.action === 'status') {
    return out(200, { connected: !!key, usedThisMonth: su.used, limit: su.limit, balance: key ? await balance(key) : null });
  }
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST { leadId, address }' });
  if (!key) return out(503, { error: 'Tracerfy is not connected yet: add TRACERFY_API_KEY in Netlify.', code: 'not-connected' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const leadId = String(body.leadId || '');
  if (!LEAD_ID.test(leadId)) return out(400, { error: 'leadId is required.' });

  // The lead as saved in the database (not what the browser says): it must exist and not be "Do not contact".
  const lr = await fetch(sbUrl() + '/rest/v1/rs_leads?id=eq.' + encodeURIComponent(leadId) + '&select=id,data', { headers: svcHeaders() });
  const lrows = lr.ok ? await lr.json() : [];
  if (!lrows[0]) return out(404, { error: 'Save the lead first, then look up the owner.', code: 'no-lead' });
  const lead = lrows[0].data || {};
  if (lead.doNotContact) return out(403, { error: 'This lead is marked "Do not contact".', code: 'do-not-contact' });
  // Made-up DEMO sites (early test phase) have no real owner: never spend a lookup on one.
  if (lead.demo === true || /^DEMO\s/.test(String(lead.name || ''))) return out(400, { error: 'This is a made-up DEMO site: there is no real owner to look up.', code: 'demo' });
  const ownerNames = [lead.owner && lead.owner.company, lead.owner && lead.owner.name, body.owner].filter(Boolean);
  const norm = function(v){ return String(v || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ').replace(/\b(LLC|INC|CORP|CO|LP|LLP|LTD|THE)\b/g, ' ').replace(/\s+/g, ' ').trim(); };
  const pid = lead.parcel && String(lead.parcel.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const blocked = String(su.dnc || '').split(/\r?\n/).map(function(s){ return s.trim(); }).filter(function(s){ return s && s[0] !== '#'; }).some(function(line){
    const id = line.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return (pid && id === pid) || ownerNames.some(function(n){ return norm(n) && norm(n) === norm(line); });
  });
  if (blocked) return out(403, { error: 'This owner is on the do-not-contact list (Settings → Area scan).', code: 'do-not-contact' });

  const where = splitAddress(body.address || lead.address) || splitAddress(body.mail || lead.ownerMail);
  if (!where) return out(400, { error: 'Tracerfy needs a full street address: "number street, city, ST 12345". Fix the lead\'s address first.', code: 'address' });

  // One lookup per lead: claim it (atomic in the database), or get the saved answer back.
  let claim;
  try { claim = await rpc('rs_skiptrace_claim', { p_lead: leadId, p_by: who.email, p_again: body.again === true }); }
  catch (e) { return out(e.status || 500, { error: e.message, code: e.code }); }
  if (!claim.claimed) {
    if (claim.busy) return out(409, { error: 'A lookup for this lead is already running. Wait a moment.', code: 'busy' });
    return out(200, { contact: claim.result, cached: true, usedThisMonth: su.used, limit: su.limit });
  }
  const release = function(){ return rpc('rs_skiptrace_release', { p_lead: leadId }).catch(function(){}); };
  if (su.used >= su.limit) {
    await release();
    return out(429, { error: 'This month\'s Tracerfy limit (' + su.limit + ' lookups) is used up. An admin can raise it in RoofScout Settings.', code: 'limit', usedThisMonth: su.used, limit: su.limit });
  }

  let res;
  try { res = await lookup(key, where); }
  catch (e) { await release(); return out(e.status || 502, { error: e.message, code: e.code }); }

  const contact = Object.assign(res, { source: 'Tracerfy', fetchedAt: new Date().toISOString(), by: who.email, query: where });
  await rpc('rs_skiptrace_finish', { p_lead: leadId, p_result: contact }).catch(function(){});
  let used = su.used;
  if (res.hit) {
    const b = await fetch(sbUrl() + '/rest/v1/rpc/rs_bump_usage', { method: 'POST', headers: svcHeaders(), body: JSON.stringify({ p_kind: 'tracerfy', p_month: month() }) });
    used = b.ok ? Number(await b.json()) : used + 1;
  }
  return out(200, { contact: contact, cached: false, usedThisMonth: used, limit: su.limit });
};

exports._normalize = normalize;     // for tests
exports._splitAddress = splitAddress;
