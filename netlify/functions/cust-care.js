// netlify/functions/cust-care.js — patch AUTO11: "We need from you" (the customer portal's document requests) and
// the warranty check-up offer's public page. The rules and the daily runs are in _lib/care11.js.
//
// PUBLIC (no sign-in):
//   GET  ?wcheck=<code>                          → a small page with one button (a mail scanner opening it does nothing)
//   POST {action:'wcheck-accept', code, note?}   → "Yes, schedule my free check-up" → a lead for the original PM
// CUSTOMER (the portal link code in x-portal-token, or the signed-in session in x-portal-session — as portal-extra.js):
//   POST {action:'needs'}                        → this job's checklist (codes are never shown back)
//   POST {action:'needs-answer', id, text?, files:[dataUrl]}  → an answer (images or PDF, at most 4 files, 4 MB each)
// STAFF (CRM sign-in + gc_staff):
//   POST {action:'needs-list', pid}              → the job's requests with signed file links
//   POST {action:'needs-request', pid, items:[{kind, label?, note?}]}
//   POST {action:'needs-update', id, cancel|reopen|done:true}
//   POST {action:'needs-kinds'}                  → the pick-list
//   POST {action:'warranty-stats'}               → Marketing → 🛡 Warranty check-ups
'use strict';
const crypto = require('crypto');
const portal = require('./portal.js');
const CARE = require('./_lib/care11.js');
const C = portal._core;
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const MAX_FILE = 4 * 1024 * 1024, MAX_FILES = 4;
const OFFICE_PHONE = '901-585-0944';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-portal-token, x-portal-session', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function reply(code, headers, o){ return { statusCode: code, headers: headers, body: JSON.stringify(o) }; }
async function staff(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim());
  if (!m) return { ok: false, code: 401, error: 'Sign in to the GrayCo CRM first.' };
  const url = C.sbUrl(), anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  let u = null; try { const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + m[1] } }); if (r.ok) u = await r.json(); } catch (e) {}
  const email = low(u && u.email); if (!email) return { ok: false, code: 401, error: 'Your sign-in has expired. Sign in again.' };
  try {
    const r = await fetch(url + '/rest/v1/gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(email), { headers: C.keyHeaders(C.svcKey()) });
    const row = r.ok ? ((await r.json()) || [])[0] : null;
    if (row && row.active !== false) return { ok: true, email: email, name: s(row.name) || email.split('@')[0], admin: low(row.role) === 'admin' };
  } catch (e) {}
  return { ok: false, code: 403, error: 'This account is not on the GrayCo staff list.' };
}
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };
async function storeFile(f){
  const d = f && typeof f === 'object' ? s(f.data) : s(f), name = f && typeof f === 'object' ? clip(f.name, 120) : '';
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(d);
  if (!m || !TYPES[m[1]]) return null;
  const buf = Buffer.from(m[2], 'base64'); if (!buf.length || buf.length > MAX_FILE) return null;
  if (m[1] === 'application/pdf' && buf.slice(0, 4).toString('latin1') !== '%PDF') return null;
  const path = 'needs/' + crypto.createHash('sha256').update(buf).digest('hex') + '.' + TYPES[m[1]];
  try {
    const r = await fetch(C.sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: Object.assign(C.keyHeaders(C.svcKey()), { 'Content-Type': m[1], 'x-upsert': 'true' }), body: buf });
    if (r.ok || r.status === 409) return { ref: 'sb:crm-files/' + path, type: m[1], size: buf.length, name: name || ('file.' + TYPES[m[1]]) };
  } catch (e) {}
  return null;
}
async function signRefs(refs){
  const paths = refs.map(function(r){ return s(r).replace(/^sb:crm-files\//, ''); }).filter(Boolean); if (!paths.length) return {};
  try {
    const r = await fetch(C.sbUrl() + '/storage/v1/object/sign/crm-files', { method: 'POST', headers: C.H(), body: JSON.stringify({ expiresIn: 3600, paths: paths }) });
    const out = {}; if (!r.ok) return out;
    (await r.json() || []).forEach(function(x){ if (x && x.signedURL) out['sb:crm-files/' + x.path] = C.sbUrl() + '/storage/v1' + x.signedURL; });
    return out;
  } catch (e) { return {}; }
}

/* ── the public warranty check-up page ── */
function page(title, body, ok){
  return { statusCode: ok === false ? 404 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' },
    body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' +
      '<style>body{margin:0;font:16px Arial,Helvetica,sans-serif;background:#F5F1E8;color:#14202E}.c{max-width:520px;margin:32px auto;background:#fff;border:1px solid #E2DCCD;border-radius:14px;padding:22px 20px}h1{font-size:22px;margin:0 0 10px}' +
      'button{background:#D4A017;color:#0F1D2F;font-weight:bold;border:0;border-radius:10px;padding:14px 22px;font-size:16px;min-height:48px;cursor:pointer}textarea{width:100%;box-sizing:border-box;border:1px solid #cfc8b6;border-radius:8px;padding:10px;font:15px Arial;min-height:70px;margin:8px 0 14px}.m{color:#55626F;font-size:14px}</style></head>' +
      '<body><div class="c"><div style="font-weight:800;color:#0F1D2F;margin-bottom:12px">GrayCo Construction Services</div>' + body + '</div></body></html>' };
}
async function wcheckPage(code){
  const o = await CARE.warrOffer(code);
  if (!o) return page('Link not active', '<h1>This link is not active</h1><p>Call GrayCo at ' + OFFICE_PHONE + ' and we will set up your check-up.</p>', false);
  if (o.acceptedAt) return page('You are all set', '<h1>You’re all set ✓</h1><p>Your Project Manager will call to set a time. Questions? Call ' + OFFICE_PHONE + '.</p>');
  return page('Free warranty check-up', '<h1>Free check-up before your warranty ends</h1><p>Your GrayCo warranty runs through <b>' + esc(new Date(o.end + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })) + '</b>. Tap below and your Project Manager will call to set a time that works for you.</p>' +
    '<label class="m" for="n">Anything we should look at? (optional)</label><textarea id="n" maxlength="600"></textarea><button id="b">Yes — schedule my free check-up</button><p class="m" id="r"></p>' +
    '<script>document.getElementById("b").onclick=function(){var b=this;b.disabled=true;fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"wcheck-accept",code:' + JSON.stringify(code) + ',note:document.getElementById("n").value})}).then(function(r){return r.json()}).then(function(j){document.getElementById("r").textContent=j.ok?"✓ Thank you! Your Project Manager will call to set a time.":(j.error||"That did not work — please call ' + OFFICE_PHONE + '.");if(!j.ok)b.disabled=false;}).catch(function(){b.disabled=false;document.getElementById("r").textContent="No connection — please try again.";});};</script>');
}

/* ── the customer: the checklist and the answers ── */
async function customer(event, headers, body, action){
  const ip = C.ipOf(event);
  if (C.limited(ip)) return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' });
  const token = s(hdr(event, 'x-portal-token')), sess = s(hdr(event, 'x-portal-session'));
  let row = null;
  try { row = C.TOKEN_RE.test(token) ? await C.tokenRow(token) : (sess ? await C.sessionRow(sess, s(body.projectId)) : null); } catch (e) {}
  if (!row || row.revoked === true) { C.noteBad(ip); return reply(404, headers, { ok: false, error: 'This link is not active — call GrayCo ' + OFFICE_PHONE }); }
  let data, p;
  try { data = await C.crmData(false); p = C.findProject(data, row.project_id); } catch (e) { return reply(503, headers, { ok: false, error: 'Please try again in a minute.' }); }
  if (!p) return reply(404, headers, { ok: false, error: 'This link is not active — call GrayCo ' + OFFICE_PHONE });
  const pid = s(p.id);
  if (action === 'needs') return reply(200, headers, { ok: true, items: await CARE.needsFor(pid, true) });
  /* needs-answer */
  if (body.preview === true) return reply(403, headers, { ok: false, error: 'Preview — only the customer can send this.' });
  const cur = (await CARE.needsAll()).find(function(x){ return s(x.id) === s(body.id) && s(x.pid) === pid; });
  if (!cur || cur.status === 'cancelled') return reply(404, headers, { ok: false, error: 'This item is no longer needed.' });
  const text = clip(body.text, 2000);
  const raw = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
  if (cur.kind === 'codes') {
    if (!text) return reply(400, headers, { ok: false, error: 'Type the code.' });
    await CARE.codeToVault(pid, clip(body.label, 60) || 'From the customer', text);
  } else if (!text && !raw.length) return reply(400, headers, { ok: false, error: 'Add a file or type your answer.' });
  const files = [];
  if (cur.kind !== 'codes') for (const f of raw) { const st = await storeFile(f); if (st) files.push(st); }
  if (raw.length && cur.kind !== 'codes' && !files.length && !text) return reply(400, headers, { ok: false, error: 'That file did not upload — send a photo or a PDF under 4 MB.' });
  const r = await CARE.needsAnswer(pid, cur.id, cur.kind === 'codes' ? '' : text, files, 'customer (portal)');
  if (!r.ok) return reply(409, headers, r);
  const left = (await CARE.needsAll()).filter(function(x){ return s(x.pid) === pid && x.status === 'open'; }).length;
  try { await CARE.needsNotifyPm(p, r.raw, C.pmOf(data, p), left); } catch (e) {}
  return reply(200, headers, { ok: true, item: r.item, open: left });
}

async function staffAction(event, headers, body, action){
  const who = await staff(event); if (!who.ok) return reply(who.code, headers, { ok: false, error: who.error });
  if (action === 'needs-kinds') return reply(200, headers, { ok: true, kinds: CARE.NEED_KINDS });
  if (action === 'warranty-stats') return reply(200, headers, await CARE.warrStats());
  if (action === 'needs-list') {
    const items = await CARE.needsFor(s(body.pid), false);
    const links = await signRefs([].concat.apply([], items.map(function(x){ return x.refs.map(function(f){ return f.ref; }); })));
    items.forEach(function(x){ x.refs.forEach(function(f){ f.url = links[f.ref] || ''; }); });
    return reply(200, headers, { ok: true, items: items, kinds: CARE.NEED_KINDS });
  }
  if (action === 'needs-request') {
    const data = await C.crmData(false); if (!C.findProject(data, s(body.pid))) return reply(404, headers, { ok: false, error: 'That job is not in the cloud yet.' });
    const r = await CARE.needsRequest(s(body.pid), body.items, who.name);
    return reply(r.ok ? 200 : 503, headers, r);
  }
  if (action === 'needs-update') { const r = await CARE.needsUpdate(s(body.id), body || {}, who.name); return reply(r.ok ? 200 : 404, headers, r); }
  return reply(400, headers, { ok: false, error: 'Bad request' });
}

exports.handler = async function(event){
  event = event || {};
  const headers = Object.assign(cors(event), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  const qs = event.queryStringParameters || {};
  try {
    if (event.httpMethod === 'GET' && qs.ping === '1') return reply(200, headers, { ok: true, service: 'GrayCo customer care (AUTO11)' });
    if (event.httpMethod === 'GET' && qs.wcheck) return await wcheckPage(s(qs.wcheck));
    if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
    if (String(event.body || '').length > 6 * 1024 * 1024) return reply(413, headers, { ok: false, error: 'Those files are too big — send 1 or 2 at a time.' });
    let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
    if (typeof body !== 'object' || Array.isArray(body)) return reply(400, headers, { ok: false, error: 'Bad request' });
    if (!C.svcKey()) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
    const action = s(body.action);
    if (action === 'wcheck-accept') {
      const ip = C.ipOf(event); if (C.limited(ip)) return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' });
      if (!CARE.TOKEN_RE.test(s(body.code))) { C.noteBad(ip); return reply(404, headers, { ok: false, error: 'This link is not active — call GrayCo ' + OFFICE_PHONE + '.' }); }
      const r = await CARE.warrAccept(s(body.code), clip(body.note, 600));
      return reply(r.ok ? 200 : 404, headers, r);
    }
    if (action === 'needs' || action === 'needs-answer') return await customer(event, headers, body, action);
    return await staffAction(event, headers, body, action);
  } catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong — please call GrayCo ' + OFFICE_PHONE + '.' }); }
};
exports._test = { storeFile: storeFile, wcheckPage: wcheckPage };
