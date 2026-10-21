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

// netlify/functions/sub-doc-read.js — patch AUTAI, automation #15: A COI OR W-9 IS READ, AND FILLS THE SUB RECORD.
//
// A sub's certificate of insurance or W-9 — dropped on the sub form ("📄 Drop COI / W-9" by Insurance & Compliance),
// filed on the sub's documents in the CRM, or uploaded by the sub in the sub portal — is read here by Claude
// (ANTHROPIC_API_KEY, the same key claude-proxy uses):
//   COI: insurer(s), policy numbers, GL limits (each occurrence / aggregate), workers' comp, auto, effective and
//        expiry dates, whether GrayCo is an additional insured, the certificate holder;
//   W-9: legal name, business name, tax classification, address, EIN or SSN.
// NOTHING is written to the sub here: the CRM shows the values, a person confirms, then the sub is filled and the
// COI expiry set (it drives the 30-day expiry alert).
// THE TAX ID: the full EIN / SSN never leaves this function except into gc_kv "gc_tax_ids" — an ADMIN-class key
// (docs/security-data.sql, the same class as users_private: only Wesley and Nick read it). The answer to the page
// carries only the masked number (XX-XXX1234 / XXX-XX-1234). It is never logged.
//
//   POST { subId?, ref: "sb:crm-files/<sha256>.<pdf|jpg|png>" | file: <base64>, mime, name, kind?: 'coi'|'w9' }
//        → { ok, read: { id, kind, fields, tinMasked, taxRef } }   (one read per file: the same file again is free)
//   POST { act: 'link', taxRef, subId }   the confirmed sub takes the stored tax id (admins and the office)
//   GET  ?list=1                          reads waiting for a person (from the sub portal / filed documents)
//   POST { act: 'done', id }              a read was confirmed or dismissed
// For the sub portal (patch SUB): require('./sub-doc-read.js')._core.read({ buf, mime, name, subId, by }) from its
// own upload handler queues the read the same way (status "new"); the office confirms it in the CRM.
'use strict';
const crypto = require('crypto');
const AI = require('./_lib/ai.js');
let pc = null; function core(){ if (!pc) pc = require('./portal.js')._core; return pc; }
function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
function sbUrl(){ return (env('SUPABASE_URL') || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svc(){ return env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'); }
const READS = 'gc_subdoc_reads', TAX = 'gc_tax_ids';
const TYPES = { 'application/pdf': 'document', 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image' };
const EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

async function fileOf(body){
  if (s(body.file)) { const b = Buffer.from(s(body.file), 'base64'); return { buf: b, mime: s(body.mime) || 'application/pdf' }; }
  const m = /^sb:crm-files\/([0-9a-f]{64})\.([a-z0-9]{1,5})$/.exec(s(body.ref));
  if (!m) throw new Error('No file was sent.');
  const k = svc(); if (!k) throw new Error('SUPABASE_SERVICE_KEY is not set on Netlify.');
  const h = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k };
  const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + m[1] + '.' + m[2], { headers: h });
  if (!r.ok) throw new Error('The file could not be read from the CRM files (HTTP ' + r.status + ').');
  return { buf: Buffer.from(await r.arrayBuffer()), mime: EXT[m[2]] || 'application/pdf' };
}

const TOOL = { name: 'read_sub_document', description: 'The fields of a subcontractor\'s certificate of insurance (ACORD 25) or IRS Form W-9.',
  input_schema: { type: 'object', properties: {
    doc_type: { type: 'string', enum: ['coi', 'w9', 'other'] },
    coi: { type: 'object', properties: {
      insured_name: { type: 'string' }, producer: { type: 'string' }, certificate_holder: { type: 'string' },
      additional_insured: { type: 'boolean', description: 'true when the certificate names the holder (GrayCo) as additional insured' },
      additional_insured_text: { type: 'string' },
      policies: { type: 'array', items: { type: 'object', properties: {
        kind: { type: 'string', enum: ['general_liability', 'workers_comp', 'auto', 'umbrella', 'other'] },
        insurer: { type: 'string' }, policy_number: { type: 'string' }, effective: { type: 'string', description: 'YYYY-MM-DD' }, expires: { type: 'string', description: 'YYYY-MM-DD' },
        each_occurrence: { type: ['number', 'null'] }, aggregate: { type: ['number', 'null'] }, wc_each_accident: { type: ['number', 'null'] }, combined_single_limit: { type: ['number', 'null'] } },
        required: ['kind', 'insurer', 'policy_number', 'expires'] } } } },
    w9: { type: 'object', properties: {
      legal_name: { type: 'string' }, business_name: { type: 'string' }, tax_classification: { type: 'string', description: 'individual/sole proprietor, C corp, S corp, partnership, trust/estate, LLC (C/S/P), other' },
      address: { type: 'string' }, city_state_zip: { type: 'string' }, tin_type: { type: 'string', enum: ['ein', 'ssn', ''] }, tin: { type: 'string', description: 'digits as printed' },
      signed_date: { type: 'string' } } } },
    required: ['doc_type'] } };
const PROMPT = 'This file is a document a subcontractor gave a construction company (GrayCo Construction Services): a certificate of liability insurance (usually ACORD 25) or an IRS Form W-9. ' +
  'Call the read_sub_document tool once with exactly what is printed — never guess; leave a field empty (or null) when it is not printed. Dates as YYYY-MM-DD. Limits as plain numbers (1000000, not $1,000,000). ' +
  'For a COI list every policy line (general liability, workers compensation, automobile, umbrella) with its insurer (from the INSURER A/B/C… letters), policy number, effective and expiration dates and limits; ' +
  'additional_insured is true only when the certificate says the certificate holder is an additional insured. For a W-9 give the line 1 name, line 2 business name, the box checked on line 3, the address, and the taxpayer identification number with whether it is an EIN or an SSN.';

function digits(v){ return s(v).replace(/\D/g, ''); }
function mask(tin, type){ const d = digits(tin); if (d.length !== 9) return ''; return type === 'ssn' ? 'XXX-XX-' + d.slice(5) : 'XX-XXX' + d.slice(5); }
function ymdOk(v){ return /^\d{4}-\d{2}-\d{2}$/.test(s(v)) ? s(v) : ''; }
function n(v){ return typeof v === 'number' && isFinite(v) ? v : null; }
/* the CRM's sub fields (React form E.*: insCarrier, insPolicy, insExp, wcCarrier, wcPolicy, wcExp, autoInsCarrier, autoInsExp, ein) */
function fieldsOf(out){
  const t = s(out && out.doc_type);
  if (t === 'coi') {
    const c = out.coi || {}, P = Array.isArray(c.policies) ? c.policies : [];
    const gl = P.find(function(p){ return p && p.kind === 'general_liability'; }) || {}, wc = P.find(function(p){ return p && p.kind === 'workers_comp'; }) || {}, au = P.find(function(p){ return p && p.kind === 'auto'; }) || {}, um = P.find(function(p){ return p && p.kind === 'umbrella'; }) || {};
    return { kind: 'coi', fields: {
      insuredName: clip(c.insured_name, 120), producer: clip(c.producer, 120), certHolder: clip(c.certificate_holder, 160),
      insCarrier: clip(gl.insurer, 100), insPolicy: clip(gl.policy_number, 60), insEff: ymdOk(gl.effective), insExp: ymdOk(gl.expires), glEach: n(gl.each_occurrence), glAgg: n(gl.aggregate),
      wcCarrier: clip(wc.insurer, 100), wcPolicy: clip(wc.policy_number, 60), wcEff: ymdOk(wc.effective), wcExp: ymdOk(wc.expires), wcEach: n(wc.wc_each_accident),
      autoInsCarrier: clip(au.insurer, 100), autoInsPolicy: clip(au.policy_number, 60), autoInsExp: ymdOk(au.expires), autoCsl: n(au.combined_single_limit),
      umbCarrier: clip(um.insurer, 100), umbExp: ymdOk(um.expires), umbEach: n(um.each_occurrence),
      addlInsured: c.additional_insured === true, addlInsuredText: clip(c.additional_insured_text, 300) } };
  }
  if (t === 'w9') {
    const w = out.w9 || {};
    return { kind: 'w9', fields: { legalName: clip(w.legal_name, 120), businessName: clip(w.business_name, 120), taxClass: clip(w.tax_classification, 60),
      address: clip([w.address, w.city_state_zip].filter(function(x){ return s(x); }).join(', '), 200), tinType: w.tin_type === 'ssn' ? 'ssn' : (w.tin_type === 'ein' ? 'ein' : (digits(w.tin).length === 9 ? 'ein' : '')), signed: clip(w.signed_date, 20) },
      tin: digits(w.tin) };
  }
  return { kind: 'other', fields: {} };
}

/* the tax id goes ONLY to the admin-class key */
async function keepTin(id, tin, type, subId, by){
  const now = new Date().toISOString();
  const rec = { id: id, subId: s(subId), tin: tin, type: type, at: now, by: s(by) };
  return core().kvListUpdate(TAX, function(l){
    const x = l.find(function(y){ return s(y.id) === id; });
    if (x && x.tin === tin && x.subId === rec.subId) return null;
    const out = l.filter(function(y){ return s(y.id) !== id && !(rec.subId && s(y.subId) === rec.subId && y.type === type); }).concat([rec]);
    return { list: out, check: function(l2){ return l2.some(function(y){ return s(y.id) === id && y.tin === tin; }); } };
  });
}
async function read(o){
  const buf = o.buf, mime = TYPES[o.mime] ? o.mime : 'application/pdf';
  if (!buf || !buf.length) return { ok: false, error: 'The file is empty.' };
  if (buf.length > 20 * 1024 * 1024) return { ok: false, error: 'The file is over 20 MB.' };
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const id = 'sd_' + hash.slice(0, 20);
  const prev = await core().kvListRead(READS);
  const had = prev && prev.list.find(function(x){ return s(x.id) === id; });
  if (had && !o.force) return { ok: true, read: had, cached: true };
  if (!AI.ready()) return { ok: false, error: 'ANTHROPIC_API_KEY is not set on Netlify' };
  const r = await AI.ask({ tool: TOOL, maxTokens: 2500, effort: 'medium', timeoutMs: 25000, content: [{ type: TYPES[mime], source: { type: 'base64', media_type: mime, data: buf.toString('base64') } }, { type: 'text', text: PROMPT + (o.kind ? ' (It was filed as a ' + (o.kind === 'w9' ? 'W-9' : 'COI') + '.)' : '') }] });
  if (!r.ok) return { ok: false, error: r.why };
  const f = fieldsOf(r.out);
  const rec = { id: id, at: new Date().toISOString(), by: s(o.by), subId: s(o.subId), name: clip(o.name, 120), ref: s(o.ref), kind: f.kind, fields: f.fields, status: 'new', source: s(o.source) || 'crm' };
  if (f.tin && f.tin.length === 9) {
    rec.tinMasked = mask(f.tin, f.fields.tinType); rec.taxRef = 'tx_' + hash.slice(0, 20);
    const k = await keepTin(rec.taxRef, f.tin, f.fields.tinType || 'ein', o.subId, o.by);
    rec.tinStored = !!k.ok;
  }
  const has = function(l){ return l.some(function(x){ return s(x.id) === id; }); };
  await core().kvListUpdate(READS, function(l){ return has(l) ? null : { list: l.concat([rec]).slice(-500), check: has }; });
  return { ok: true, read: rec };
}

exports.handler = async function(event){
  event = event || {};
  const cors = gcCors(event, 'GET, POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  const who = await gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode, { ok: false, error: who.error }, cors);
  const qs = event.queryStringParameters || {};
  try {
    if (event.httpMethod === 'GET' && qs.list) { const cur = await core().kvListRead(READS); return J(200, { ok: true, items: cur ? cur.list.filter(function(x){ return x.status === 'new'; }).slice(-100) : [] }, cors); }
    if (event.httpMethod !== 'POST') return J(405, { ok: false, error: 'Method not allowed' }, cors);
    let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Bad request' }, cors); }
    if (body.act === 'link') {
      const ref = s(body.taxRef), sub = s(body.subId); if (!/^tx_[0-9a-f]{20}$/.test(ref) || !sub) return J(400, { ok: false, error: 'Bad request' }, cors);
      const w = await core().kvListUpdate(TAX, function(l){ const x = l.find(function(y){ return s(y.id) === ref; }); if (!x || x.subId === sub) return null;
        const out = l.filter(function(y){ return !(s(y.subId) === sub && y.type === x.type && s(y.id) !== ref); }); out.forEach(function(y){ if (s(y.id) === ref) { y.subId = sub; y.linkedBy = who.email; y.linkedAt = new Date().toISOString(); } });
        return { list: out, check: function(l2){ return l2.some(function(y){ return s(y.id) === ref && y.subId === sub; }); } }; });
      return J(w.ok ? 200 : 502, { ok: w.ok }, cors);
    }
    if (body.act === 'done') {
      const id = s(body.id);
      const w = await core().kvListUpdate(READS, function(l){ const x = l.find(function(y){ return s(y.id) === id; }); if (!x || x.status !== 'new') return null; x.status = body.dismiss ? 'dismissed' : 'applied'; x.doneBy = who.email; x.doneAt = new Date().toISOString(); if (body.subId) x.subId = s(body.subId); return { list: l, check: function(l2){ const z = l2.find(function(y){ return s(y.id) === id; }); return !!(z && z.status !== 'new'); } }; });
      return J(w.ok ? 200 : 502, { ok: w.ok }, cors);
    }
    const f = await fileOf(body);
    const r = await read({ buf: f.buf, mime: f.mime, name: body.name, subId: body.subId, by: who.name || who.email, kind: s(body.kind), ref: s(body.ref), force: body.force === true, source: s(body.source) });
    return J(r.ok ? 200 : 502, r, cors);
  } catch (e) { return J(500, { ok: false, error: 'Could not read it: ' + clip(e && e.message || e, 120) }, cors); }
};
exports._core = { read: read, fieldsOf: fieldsOf, mask: mask };
