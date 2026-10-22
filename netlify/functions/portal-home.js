// netlify/functions/portal-home.js — patch X10: the customer portal's 🏠 HOME PROFILE and 💬 TESTIMONIAL.
//
// Owner 10/21: "Home profile … in their profile on their portal" — a permanent record of their home: the materials
// used (roof, siding, paint colors, fixtures and finishes from their selections), warranties, key photos, invoices,
// the maintenance plan and the service history. Built by itself from the job; the PM can fill in or correct any line
// (CRM job → 🏠 Home profile, x10.js home-set). No sub prices, no internal notes, never the insurance carrier.
// "Testimonial capture in the portal … after a good review or a 😀 at closeout" — a few words (and a short video if
// they like), with a permission box. It goes to 📣 Marketing → 💬 Testimonials for an admin to approve; nothing is
// posted by itself.
//
// PUBLIC (the portal link code in x-portal-token, or the signed-in customer session in x-portal-session):
//   POST {action:'home'}                                       → the home profile for this customer's home
//   POST {action:'testimonial', text, permission, name?, video?: dataUrl}   → their testimonial (once per job)
'use strict';
const crypto = require('crypto');
const C = require('./portal.js')._core;
const X10 = require('./x10.js');
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const MAX_VIDEO = 4 * 1024 * 1024;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : (v && Array.isArray(v.list) ? v.list : []); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, x-portal-token, x-portal-session', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function reply(code, headers, o){ return { statusCode: code, headers: headers, body: JSON.stringify(o) }; }
function nowIso(){ return new Date().toISOString(); }

/* this customer's jobs: the link's job, plus their other jobs with the same e-mail (never matched by name alone) */
function homeJobs(data, p){
  const em = low(p.clientEmail || p.customerEmail || p.email), addr = low(p.address || p.jobAddress).replace(/[^a-z0-9]/g, '');
  const out = [p];
  if (em) arr(data.projects).forEach(function(x){ if (x && x.id !== p.id && x.deleted !== true && low(x.clientEmail || x.customerEmail || x.email) === em && (!addr || low(x.address || x.jobAddress).replace(/[^a-z0-9]/g, '') === addr)) out.push(x); });
  return out;
}
async function profile(data, p, words){
  const jobs = homeJobs(data, p);
  const saved = await X10.listGet(X10.K.HOME), maint = arr((await C.kvRead(['gc_maint']))['gc_maint']), tickets = arr((await C.kvListRead('gc_warranty_tickets') || {}).list);
  const fields = {}, selD = Object.assign({}, data, await C.kvRead(['selectionChoices', 'selectionResponses']).catch(function(){ return {}; }));
  jobs.slice().reverse().forEach(function(j){ const a = X10.homeAuto(selD, j), r = saved.find(function(x){ return s(x.pid) === s(j.id); }); Object.assign(fields, a, r ? r.fields : {}); });
  Object.keys(fields).forEach(function(k){ if (!s(fields[k])) delete fields[k]; });
  const view = await C.buildView(data, p);
  const photos = []; arr(view.posts).forEach(function(x){ (x.photos || []).forEach(function(u){ if (photos.length < 8) photos.push(u); }); });
  const jobOut = [];
  for (const j of jobs) {
    const v = j === p ? view : await C.buildView(data, j);
    jobOut.push({ name: clip(v.job.name, 90), po: v.job.po, stage: v.job.stageName, warranty: v.warranty ? { label: s(v.warranty.title || v.warranty.label), start: s(v.warranty.start), end: s(v.warranty.end) } : null,
      invoices: arr(v.money && v.money.invoices).map(function(i){ return { number: i.number, date: i.date, amount: i.amount, balance: i.balance, status: i.status }; }) });
  }
  const pids = jobs.map(function(j){ return s(j.id); });
  const plans = maint.filter(function(c){ return pids.indexOf(s(c.pid)) >= 0 && s(c.status) === 'signed'; }).map(function(c){ return { name: s(c.planName), nextVisit: s(c.nextVisit), visits: arr(c.visits).map(function(x){ return s(x.at).slice(0, 10); }) }; });
  const history = [];
  tickets.filter(function(t){ return pids.indexOf(s(t.pid)) >= 0 && !t.deleted; }).forEach(function(t){ history.push({ date: s(t.createdAt).slice(0, 10), what: 'Service request: ' + clip(t.text, 140), status: s(t.status) }); });
  plans.forEach(function(pl){ pl.visits.forEach(function(d){ history.push({ date: d, what: pl.name + ' — maintenance visit', status: 'done' }); }); });
  history.sort(function(a, b){ return a.date < b.date ? 1 : -1; });
  const out = { ok: true, stage: Number(view.job && view.job.stage) || 0, address: clip(p.address || p.jobAddress, 160), fields: fields, labels: X10.HOME_FIELDS, jobs: jobOut, photos: photos, plans: plans, history: history.slice(0, 30) };
  return C.scrub(out, words);
}
async function storeVideo(dataUrl){
  const m = /^data:(video\/(?:mp4|quicktime|webm));base64,([A-Za-z0-9+/=]+)$/.exec(s(dataUrl)); if (!m) return null;
  const buf = Buffer.from(m[2], 'base64'); if (!buf.length || buf.length > MAX_VIDEO) return null;
  const path = 'testimonials/' + crypto.createHash('sha256').update(buf).digest('hex') + '.' + (m[1].split('/')[1] === 'quicktime' ? 'mov' : m[1].split('/')[1]);
  try { const r = await fetch(C.sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: Object.assign(C.keyHeaders(C.svcKey()), { 'Content-Type': m[1], 'x-upsert': 'true' }), body: buf }); if (r.ok || r.status === 409) return { ref: 'sb:crm-files/' + path, type: m[1], size: buf.length }; } catch (e) {}
  return null;
}

exports.handler = async function(event){
  event = event || {};
  const headers = Object.assign(cors(event), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  if (String(event.body || '').length > 5.8 * 1024 * 1024) return reply(413, headers, { ok: false, error: 'That video is too big — keep it under 30 seconds (4 MB).' });
  let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  if (!C.svcKey()) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
  const action = s(body.action || 'home');
  if (['home', 'testimonial'].indexOf(action) < 0) return reply(400, headers, { ok: false, error: 'Bad request' });
  const ip = C.ipOf(event);
  if (C.limited(ip)) return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + C.OFFICE_PHONE + '.' });
  const token = s(hdr(event, 'x-portal-token')), sess = s(hdr(event, 'x-portal-session'));
  let row = null;
  try { row = C.TOKEN_RE.test(token) ? await C.tokenRow(token) : (sess ? await C.sessionRow(sess, s(body.projectId)) : null); } catch (e) {}
  if (!row || row.revoked === true) { C.noteBad(ip); return reply(404, headers, { ok: false, error: C.NOT_ACTIVE }); }
  try {
    const data = await C.crmData(false), p = C.findProject(data, row.project_id);
    if (!p) return reply(404, headers, { ok: false, error: C.NOT_ACTIVE });
    const words = C.insWords(data, p);
    const testi = await X10.listGet(X10.K.TESTI), mine = testi.find(function(x){ return s(x.pid) === s(p.id) && !x.deleted; });
    if (action === 'home') {
      const out = await profile(data, p, words);
      const stage = out.stage; delete out.stage;
      out.testimonial = { ask: !mine && (stage >= 7 || p.reviewLeft === true || Number(p.reviewRating) >= 4 || /happy|😀|great/i.test(s(p.portalMood || p.checkinMood))), sent: !!mine };
      return reply(200, headers, out);
    }
    if (body.preview === true) return reply(403, headers, { ok: false, error: 'Preview — only the customer can send this.' });
    if (mine) return reply(200, headers, { ok: true, already: true });
    const text = clip(s(body.text).replace(/[<>]/g, ''), 1500); if (text.length < 10) return reply(400, headers, { ok: false, error: 'Write a sentence or two — thank you!' });
    const video = body.video ? await storeVideo(body.video) : null;
    if (body.video && !video) return reply(400, headers, { ok: false, error: 'That video did not upload — try a shorter one (under 30 seconds), or send just the words.' });
    const rec = { id: 'TS-' + crypto.randomBytes(6).toString('hex'), pid: s(p.id), job: clip(C.scrub({ n: s(p.name) }, words).n, 90), po: s(p.autoPO || p.po), name: clip(s(body.name).replace(/[<>]/g, '') || s(p.client || p.clientName), 80),
      city: clip(s(p.city) || (s(p.address).split(',')[1] || ''), 40), text: text, permission: body.permission === true, video: video, status: 'new', at: nowIso(), via: 'portal' };
    const r = await X10.listSet(X10.K.TESTI, function(l){ if (l.some(function(x){ return s(x.pid) === rec.pid && !x.deleted; })) return undefined; return l.concat([rec]).slice(-2000); });
    if (!r || r.ok === false) return reply(503, headers, { ok: false, error: 'We could not save it just now — please try again.' });
    try { await C.officeTodo('x10_testi_' + rec.id, '💬 New testimonial from ' + (rec.name || 'a customer') + ' — review it in 📣 Marketing', '"' + clip(text, 160) + '"' + (rec.permission ? ' · OK to use' : ' · NOT OK to share publicly') + (video ? ' · with a video' : '')); } catch (e) {}
    return reply(200, headers, { ok: true });
  } catch (e) { if (process.env.X10_DEBUG) console.error(e); return reply(500, headers, { ok: false, error: 'Something went wrong — please call GrayCo ' + C.OFFICE_PHONE + '.' }); }
};
exports._test = { homeJobs: homeJobs, profile: profile };
