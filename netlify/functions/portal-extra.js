// netlify/functions/portal-extra.js — patch AUTO7: the customer portal's "Report an issue" (warranty tickets) and
// "Materials arriving", and the CRM's side of tickets, supplier orders and sub ratings.
//
// Owner (10/21): "Warranty tickets from the portal" — the customer taps Report an issue (photos + what is wrong);
// it becomes a ticket on the job for its PM with a 48-hour clock (PM To-Do; the admins hear if nobody answered in 48 h,
// field-auto.js). The customer sees its status in the portal and whether the job is still under warranty
// (5 years on all roofing and on insurance work, 1 year on everything else). Supplier orders matched to the job show
// as "Materials arriving <day>" — no prices, no supplier papers.
//
// PUBLIC (the portal link code in x-portal-token, or the signed-in customer session in x-portal-session — exactly as
// portal.js / selections.js):
//   POST {action:'info'}                               → { warranty, materials[], tickets[] }
//   POST {action:'issue', text, where?, photos:[dataUrl]} → one ticket (at most 4 photos, 3 MB each; 3 tickets a day)
// STAFF (CRM sign-in + gc_staff):
//   POST {action:'tickets'}                            → every ticket (the CRM shows them; signed photo links)
//   POST {action:'ticket-update', id, patch}           → status / reply / responsible sub / note (who + when kept)
//   POST {action:'orders'}                             → gc_orders
//   POST {action:'order-assign', id, pid}              → an unmatched order gets its job (+ the Site Book delivery)
//   POST {action:'rate-sub', pid, subId, subName, rating 1-5, note}  → gc_sub_ratings (the sub scorecard)
'use strict';
const crypto = require('crypto');
const portal = require('./portal.js');
const FA = require('./_lib/fa-core.js');
const ORD = require('./_lib/fa-orders.js');
const C = portal._core;
const TICKETS = 'gc_warranty_tickets', RATINGS = 'gc_sub_ratings';
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const MAX_PHOTO = 3 * 1024 * 1024, MAX_PHOTOS = 4;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return FA.arr(v); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-portal-token, x-portal-session', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
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
async function storeImage(dataUrl){
  const m = /^data:(image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/=]+)$/.exec(s(dataUrl));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64'); if (!buf.length || buf.length > MAX_PHOTO) return null;
  const ext = m[1].split('/')[1].replace('jpeg', 'jpg'), path = 'tickets/' + crypto.createHash('sha256').update(buf).digest('hex') + '.' + ext;
  try {
    const r = await fetch(C.sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: Object.assign(C.keyHeaders(C.svcKey()), { 'Content-Type': m[1], 'x-upsert': 'true' }), body: buf });
    if (r.ok || r.status === 409) return { ref: 'sb:crm-files/' + path, type: m[1], size: buf.length };
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
function claimOf(data, pid){ try { return C.insClaim(data, pid); } catch (e) { return null; } }
/* what the customer may see of a ticket */
function custTicket(t){
  const st = FA.ticketState(t);
  return { id: s(t.id), at: s(t.createdAt).slice(0, 19), text: clip(t.text, 600), status: s(t.status) || 'new', statusText: FA.TICKET_STATUS[s(t.status) || 'new'] || s(t.status),
    reply: clip(t.customerReply, 600), visit: s(t.visitDate), photos: arr(t.photos).length, inWarranty: t.inWarranty !== false, open: st.open };
}
async function notifyPm(t, p, pmU){
  const key = s(process.env.RESEND_API_KEY); if (!key) return false;
  const to = [pmU && pmU.email].filter(function(x){ return /@/.test(s(x)); });
  const admins = (process.env.OWNER_EMAILS || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(Boolean);
  const list = to.length ? to : admins;
  const subj = require('./_lib/mailtag.js').tag(C.withJob('🛠 Warranty: ' + clip(t.text, 70), p), list, 'area:Warranty');
  const site = (process.env.CRM_URL || 'https://crm.grayco-cs.com').replace(/\/$/, '');
  const html = '<div style="font:14px Arial;color:#1b1640;max-width:600px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700">GrayCo — a customer reported an issue</div><div style="padding:8px 18px">' +
    '<p><b>' + esc(p.name) + '</b>' + (p.address ? ' · ' + esc(p.address) : '') + '</p><p style="white-space:pre-wrap">' + esc(t.text) + '</p>' +
    '<p>' + (t.inWarranty ? '✅ In warranty (' + esc(t.warrantyLabel) + (t.warrantyEnd ? ', to ' + esc(t.warrantyEnd) : '') + ')' : '⚠️ Out of warranty since ' + esc(t.warrantyEnd)) + ' · ' + arr(t.photos).length + ' photo(s)</p>' +
    '<p><b>Answer the customer within 48 hours.</b> It is on your To-Do; the admins hear about it if nobody answered by ' + esc(new Date(Date.parse(t.createdAt) + 48 * 36e5).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '.</p>' +
    '<p><a href="' + site + '/#todo" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open To-Do</a></p></div></div>';
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: list, subject: subj, html: html, headers: { 'X-GrayCo-CRM': 'warranty-ticket' } }) });
    return r.ok;
  } catch (e) { return false; }
}

async function customer(event, headers, body, action){
  const ip = C.ipOf(event);
  if (C.limited(ip)) return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + C.OFFICE_PHONE + '.' });
  const token = s(hdr(event, 'x-portal-token')), sess = s(hdr(event, 'x-portal-session'));
  let row = null;
  try { row = C.TOKEN_RE.test(token) ? await C.tokenRow(token) : (sess ? await C.sessionRow(sess, s(body.projectId)) : null); } catch (e) {}
  if (!row || row.revoked === true) { C.noteBad(ip); return reply(404, headers, { ok: false, error: C.NOT_ACTIVE }); }
  let data, p;
  try { data = await C.crmData(false); p = C.findProject(data, row.project_id); } catch (e) { return reply(503, headers, { ok: false, error: 'Please try again in a minute.' }); }
  if (!p) return reply(404, headers, { ok: false, error: C.NOT_ACTIVE });
  const pid = s(p.id), claim = claimOf(data, pid), w = FA.warranty(p, claim);
  const today = new Date().toISOString().slice(0, 10);
  if (action === 'info') {
    const o = await C.kvListRead(ORD.KEY), t = await C.kvListRead(TICKETS);
    const materials = arr(o && o.list).filter(function(x){ return s(x.pid) === pid && !x.deleted && x.deliveryDate && x.deliveryDate >= today && x.status !== 'cancelled'; })
      .sort(function(a, b){ return a.deliveryDate < b.deliveryDate ? -1 : 1; }).slice(0, 4).map(function(x){ return { day: x.deliveryDate }; });
    const tickets = arr(t && t.list).filter(function(x){ return s(x.pid) === pid && !x.deleted; }).sort(function(a, b){ return s(a.createdAt) < s(b.createdAt) ? 1 : -1; }).slice(0, 10).map(custTicket);
    return reply(200, headers, { ok: true, warranty: { label: w.label, years: w.years, start: w.start, end: w.end, inWarranty: w.inWarranty }, materials: materials, tickets: tickets, canReport: true });
  }
  /* issue */
  if (body.preview === true) return reply(403, headers, { ok: false, error: 'Preview — only the customer can report an issue.' });
  const text = clip(body.text, 2000); if (text.length < 5) return reply(400, headers, { ok: false, error: 'Tell us what is wrong (a few words is fine).' });
  const cur = await C.kvListRead(TICKETS);
  const todayN = arr(cur && cur.list).filter(function(x){ return s(x.pid) === pid && s(x.createdAt).slice(0, 10) === today; }).length;
  if (todayN >= 3) return reply(429, headers, { ok: false, error: 'You already sent us 3 today — your Project Manager will reach out. Urgent? Call ' + C.OFFICE_PHONE + '.' });
  const photos = [];
  for (const d of arr([]).concat(Array.isArray(body.photos) ? body.photos : []).slice(0, MAX_PHOTOS)) { const f = await storeImage(d); if (f) photos.push(f); }
  const pmU = C.pmOf(data, p);
  const now = new Date().toISOString();
  const t = { id: 'WT-' + crypto.randomBytes(6).toString('hex'), pid: pid, job: clip(p.name, 120), po: s(p.autoPO || p.po), address: clip(p.address || p.jobAddress, 160), pm: pmU ? pmU.name : '', pmEmail: pmU ? pmU.email : '',
    text: text, where: clip(body.where, 120), photos: photos, status: 'new', createdAt: now, updatedAt: now, by: 'customer (portal)', inWarranty: w.inWarranty, warrantyLabel: w.label, warrantyEnd: w.end, history: [{ at: now, by: 'customer', what: 'reported' }] };
  const has = function(l){ return l.some(function(x){ return s(x.id) === t.id; }); };
  const wr = await C.kvListUpdate(TICKETS, function(l){ return { list: l.concat([t]).slice(-3000), check: has }; });
  if (!wr.ok) return reply(503, headers, { ok: false, error: 'We could not save it just now — please try again, or call ' + C.OFFICE_PHONE + '.' });
  try { await notifyPm(t, p, pmU); } catch (e) {}
  return reply(200, headers, { ok: true, ticket: custTicket(t) });
}

async function staffAction(event, headers, body, action){
  const who = await staff(event); if (!who.ok) return reply(who.code, headers, { ok: false, error: who.error });
  if (action === 'tickets') {
    const t = await C.kvListRead(TICKETS); const list = arr(t && t.list).filter(function(x){ return !x.deleted; });
    const refs = []; list.forEach(function(x){ arr(x.photos).forEach(function(f){ refs.push(f.ref); }); });
    const signed = await signRefs(refs.slice(0, 200));
    return reply(200, headers, { ok: true, tickets: list.map(function(x){ return Object.assign({}, x, { photoUrls: arr(x.photos).map(function(f){ return signed[f.ref] || ''; }), sla: FA.ticketState(x) }); }) });
  }
  if (action === 'ticket-update') {
    const id = s(body.id), patch = body.patch && typeof body.patch === 'object' ? body.patch : {};
    const allowed = ['status', 'customerReply', 'internalNote', 'subId', 'subName', 'visitDate', 'assignee'];
    const now = new Date().toISOString();
    const r = await C.kvListUpdate(TICKETS, function(l){
      const t = l.find(function(x){ return s(x.id) === id; }); if (!t) return null;
      const before = JSON.stringify(t);
      allowed.forEach(function(k){ if (k in patch) t[k] = clip(patch[k], k === 'customerReply' || k === 'internalNote' ? 1200 : 120); });
      if (t.status && !FA.TICKET_STATUS[t.status]) t.status = 'answered';
      if (!t.firstResponseAt && (patch.customerReply || /answered|scheduled|in_progress|resolved|closed/.test(s(patch.status)))) { t.firstResponseAt = now; t.firstResponseBy = who.name; }
      if (/resolved|closed/.test(s(t.status)) && !t.closedAt) t.closedAt = now;
      t.history = arr(t.history).concat([{ at: now, by: who.name, what: Object.keys(patch).filter(function(k){ return allowed.indexOf(k) >= 0; }).join(', ') }]).slice(-40);
      t.updatedAt = now; t.updatedBy = who.name;
      return JSON.stringify(t) === before ? null : { list: l, check: function(a){ return a.some(function(x){ return s(x.id) === id && x.updatedAt === now; }); } };
    });
    return reply(r.ok ? 200 : 503, headers, { ok: !!r.ok, error: r.ok ? '' : 'Could not save — try again.' });
  }
  if (action === 'orders') { const o = await C.kvListRead(ORD.KEY); return reply(200, headers, { ok: true, orders: arr(o && o.list).filter(function(x){ return !x.deleted; }).slice(-400) }); }
  if (action === 'order-assign') {
    const id = s(body.id), pid = s(body.pid), now = new Date().toISOString();
    const data = await C.crmData(true); if (pid && !C.findProject(data, pid)) return reply(404, headers, { ok: false, error: 'That job is not in the cloud yet.' });
    let rec = null;
    const r = await C.kvListUpdate(ORD.KEY, function(l){
      const o = l.find(function(x){ return s(x.id) === id; }); if (!o) return null;
      if (body.dismiss === true) { o.deleted = true; o.deletedBy = who.name; o.updatedAt = now; rec = o; return { list: l, check: function(a){ return a.some(function(x){ return s(x.id) === id && x.deleted; }); } }; }
      if (s(o.pid) === pid) { rec = o; return null; }
      o.pid = pid; o.status = 'assigned'; o.matchedBy = 'office'; o.assignedBy = who.name; o.updatedAt = now; rec = o;
      return { list: l, check: function(a){ return a.some(function(x){ return s(x.id) === id && s(x.pid) === pid; }); } };
    });
    if (!r.ok) return reply(503, headers, { ok: false, error: 'Could not save — try again.' });
    let sb = false; if (rec && !rec.deleted) { try { sb = await ORD.sitebookDelivery(rec); } catch (e) {} }
    return reply(200, headers, { ok: true, sitebook: sb });
  }
  if (action === 'rate-sub') {
    const rating = Math.round(Number(body.rating)); if (!(rating >= 1 && rating <= 5)) return reply(400, headers, { ok: false, error: 'Pick 1 to 5 stars.' });
    const now = new Date().toISOString(), id = 'SR-' + s(body.pid).slice(0, 40) + '-' + (s(body.subId) || low(body.subName).replace(/[^a-z0-9]+/g, '-')).slice(0, 40);
    const rec = { id: id, pid: s(body.pid), subId: s(body.subId), subName: clip(body.subName, 120), rating: rating, note: clip(body.note, 400), by: who.name, at: now };
    const r = await C.kvListUpdate(RATINGS, function(l){ const rest = l.filter(function(x){ return s(x.id) !== id; }); return { list: rest.concat([rec]).slice(-4000), check: function(a){ return a.some(function(x){ return s(x.id) === id && x.at === now; }); } }; });
    return reply(r.ok ? 200 : 503, headers, { ok: !!r.ok });
  }
  return reply(400, headers, { ok: false, error: 'Bad request' });
}

exports.handler = async function(event){
  event = event || {};
  const headers = Object.assign(cors(event), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  if (String(event.body || '').length > 5.5 * 1024 * 1024) return reply(413, headers, { ok: false, error: 'Those photos are too big — send 1 or 2 at a time.' });
  let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  if (!C.svcKey()) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
  const action = s(body.action || 'info');
  try {
    if (action === 'info' || action === 'issue') return await customer(event, headers, body, action);
    return await staffAction(event, headers, body, action);
  } catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong — please call GrayCo ' + C.OFFICE_PHONE + '.' }); }
};
exports._test = { custTicket: custTicket, storeImage: storeImage, TICKETS: TICKETS, RATINGS: RATINGS };
