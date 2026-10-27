// netlify/functions/sub-photos.js
// GrayCo Photos (patch U2) — THE SUB PORTAL'S PHOTOS. Contract: docs/SUB-PHOTOS-API.md.
//
// A subcontractor opens the sub portal (portal.grayco-cs.com, a link with its own code). The sub portal sends
// that code here in the x-sub-token header (never in the address, so it is never in a log). This function:
//   POST {action:'jobs'}                       → the jobs this sub is on (id, name, address, photo count)
//   POST {action:'photos', jobId}              → that job's photos the sub may see, as short-lived signed links
//   POST {action:'upload', jobId, name, data, tag?, note?}
//                                              → a photo the sub took goes into that job's GrayCo Photos,
//                                                tagged with the sub (source 'sub'); staff decide if the customer sees it
// READ-ONLY for everything else: it never changes a job, a photo record of GrayCo's, or a setting.
//
// Who the sub is: the row of the code in table gc_sub_portal (docs/grayco-photos-setup.sql: RLS on, no
// policies, only this server reads it): sub_id, sub_name, sub_email, revoked, expires_at. A code that is
// unknown, turned off or expired gets the SAME answer every time ("not active"). Per-address rate limit.
// Which jobs: the job's subs list in the CRM (projects[].subs: {id|vendorId, name, email, status}) names the
// sub and the sub is not removed / declined there, OR the code's row lists the job in job_ids.
// What a sub sees: GrayCo Photos records of that job (gc_kv "gc_photos": not deleted, not a flag record) that
// are not "Hidden from subs" — hideSubs true hides, false shows, not set follows "Customer sees it", so an
// "Internal only" photo (and a Damage photo nobody turned on) is never shown — plus the job's CompanyCam photos
// (server key) unless a person hid that one (flag record ccf_<id>). One per picture. Notes, who took it (other
// than "you"), comments and chat are never sent. Pictures from the private bucket crm-files: signed links that
// expire after SIGN_SECS (1 hour).
//
// Another server function (the sub portal's own) can call the same code without HTTP:
//   const sp = require('./sub-photos')._core;
//   await sp.photosForSub({ id, name, email }, jobId)   → { ok, job, photos, expiresIn } | { ok:false, status, error }
//   await sp.jobsForSub({ id, name, email })
//   await sp.uploadForSub({ id, name, email }, jobId, { name, data(base64)|buffer, contentType, tag, note })
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, COMPANYCAM_TOKEN (optional), SUB_PORTAL_ORIGIN (default
// https://portal.grayco-cs.com, comma list; the CRM's own origins are always allowed).

require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const OFFICE_PHONE = '901-585-0944';
const NOT_ACTIVE = 'This link is not active — call GrayCo ' + OFFICE_PHONE;
const SIGN_SECS = 3600, MIN_FAIL_MS = 250, KV_TTL = 20e3, CC_TTL = 5 * 60e3, MAX_PHOTOS = 400;
const MAX_UPLOAD = 4.5 * 1024 * 1024;           /* bytes after base64 decoding (Netlify takes ~6 MB of body) */
const TAGS = ['Before', 'During', 'Damage', 'After', 'Punch'];
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function ids(v){ return Array.isArray(v) ? v.map(String) : []; }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function ymd(v){
  if (!v) return '';
  if (typeof v === 'number') { const d = new Date(v > 1e12 ? v : v * 1000); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
  const t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function isJwt(k){ return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(k || '')); }
function keyHeaders(k){ return isJwt(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }; }
function H(extra){ return Object.assign(keyHeaders(svcKey()), { 'Content-Type': 'application/json' }, extra || {}); }
function httpsUrl(u){ const t = s(u); return /^https:\/\/[^\s"'<>]+$/i.test(t) ? t : ''; }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
function cors(event){
  const allowed = (s(process.env.SUB_PORTAL_ORIGIN) || 'https://portal.grayco-cs.com').split(',').concat((process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(','))
    .map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, x-sub-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
}
function reply(code, headers, obj){ return { statusCode: code, headers: headers, body: JSON.stringify(obj) }; }

/* ── rate limit per address (per warm instance) ── */
const hits = new Map();
function ipOf(event){ return s(hdr(event, 'x-nf-client-connection-ip') || hdr(event, 'x-forwarded-for').split(',')[0] || 'unknown'); }
function limited(ip, cost){ const now = Date.now(); let h = hits.get(ip); if (!h || now - h.start > 600e3) { h = { start: now, req: 0, bad: 0 }; hits.set(ip, h); } h.req += cost || 1; if (hits.size > 5000) hits.delete(hits.keys().next().value); return h.req > 240 || h.bad >= 8; }
function noteBad(ip){ const h = hits.get(ip); if (h) h.bad++; }

/* ── the CRM's records (gc_kv; a big list may be in pieces: <key>__manifest + <key>__chunkN) ── */
let kvCache = null;
async function kvRead(keys){
  const want = []; keys.forEach(function(k){ want.push(k, k + '__manifest'); });
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value,updated_at&key=in.(' + want.map(function(k){ return '"' + k + '"'; }).join(',') + ')', { headers: H() });
  if (!r.ok) throw new Error('gc_kv read ' + r.status);
  const rows = await r.json(), by = {};
  (Array.isArray(rows) ? rows : []).forEach(function(x){ if (x && x.key) by[x.key] = x; });
  const out = {};
  for (const k of keys) {
    let val = by[k] ? by[k].value : null;
    const man = by[k + '__manifest']; let mv = man && man.value; if (typeof mv === 'string') { try { mv = JSON.parse(mv); } catch (e) { mv = null; } }
    if (mv && mv.chunked && mv.count > 0 && (!by[k] || s(man.updated_at) >= s(by[k].updated_at))) {
      const names = []; for (let i = 0; i < Math.min(mv.count, 60); i++) names.push('"' + k + '__chunk' + i + '"');
      const rr = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value&key=in.(' + names.join(',') + ')', { headers: H() });
      if (rr.ok) { const parts = await rr.json(), b2 = {}; (Array.isArray(parts) ? parts : []).forEach(function(x){ b2[x.key] = x.value; }); let all = []; for (let i = 0; i < mv.count; i++) all = all.concat(arr(b2[k + '__chunk' + i])); if (all.length) val = all; }
    }
    out[k] = typeof val === 'string' ? (function(){ try { return JSON.parse(val); } catch (e) { return val; } })() : val;
  }
  return out;
}
async function crm(force){
  if (!force && kvCache && Date.now() - kvCache.at < KV_TTL) return kvCache.data;
  const data = await kvRead(['projects', 'gc_photos', 'gc_deleted_projects']);
  kvCache = { at: Date.now(), data: data }; return data;
}

/* ── who sees what (the same rules as the app: parts/01_core.js sharedOf / subsOf) ── */
function sharedOf(r, f){ if (f && f.deleted !== true && f.shared != null) return f.shared === true; return r.shared === true || (r.shared == null && s(r.tag) !== 'Damage'); }
function subsOf(r, f){ const h = f && f.deleted !== true ? f.hideSubs : r.hideSubs; if (h === true) return false; if (h === false) return true; return sharedOf(r, f); }
function custOf(r, f){ return sharedOf(r, f); }

/* ── the sub and the job ── */
const REMOVED = /\b(removed|declined|cancel+ed|fired|terminated|replaced|lost|rejected)\b/i;
function subMatches(entry, sub){
  if (!entry || typeof entry !== 'object' || REMOVED.test(s(entry.status))) return false;
  const ids = [entry.id, entry.vendorId, entry.subId].map(s).filter(Boolean);
  if (sub.id && ids.indexOf(s(sub.id)) >= 0) return true;
  if (sub.email && low(entry.email) && low(entry.email) === low(sub.email)) return true;
  if (sub.name && low(entry.name) && low(entry.name) === low(sub.name)) return true;
  return false;
}
function liveProject(data, pid){
  const del = Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects.map(String) : [];
  if (del.indexOf(String(pid)) >= 0) return null;
  const p = arr(data.projects).find(function(x){ return s(x.id) === String(pid); });
  if (!p || p.deleted === true || /\b(lost|dead|cancel+ed|void|spam|junk|duplicate)\b/i.test(s(p.status))) return null;
  return p;
}
function assigned(data, sub, pid){
  const p = liveProject(data, pid); if (!p) return null;
  if (ids(sub.jobIds).indexOf(String(pid)) >= 0) return p;
  return arr(p.subs).some(function(e){ return subMatches(e, sub); }) ? p : null;
}
function jobsOf(data, sub){
  const extra = ids(sub.jobIds);
  return arr(data.projects).filter(function(p){ return p && p.id && liveProject(data, p.id) && (extra.indexOf(String(p.id)) >= 0 || arr(p.subs).some(function(e){ return subMatches(e, sub); })); });
}

/* ── CompanyCam (server key; optional) ── */
function ccIdFromAny(v){ if (v == null || v === '') return ''; const t = String(v); const m = t.match(/companycam\.com\/projects\/(\d+)/) || t.match(/^PRJcc_(\d+)$/); if (m) return m[1]; return /^\d{3,}$/.test(t.trim()) ? t.trim() : ''; }
function ccIdOf(p){ const f = ['ccProjectId', 'companyCamId', 'companycamId', 'ccamId', 'ccId', 'companyCamUrl', 'ccamUrl', 'ccUrl', 'ccProjectUrl', 'id']; for (const k of f) { const id = ccIdFromAny(p[k]); if (id) return id; } return ''; }
const ccCache = new Map();
async function ccPhotos(ccId){
  const hit = ccCache.get(ccId); if (hit && Date.now() - hit.at < CC_TTL) return hit.list;
  const token = s(process.env.COMPANYCAM_TOKEN); if (!token || !/^\d{3,}$/.test(ccId)) return [];
  const out = [];
  for (let page = 1; page <= 20; page++) {
    let r; try { r = await fetch('https://api.companycam.com/v2/projects/' + ccId + '/photos?per_page=100&page=' + page, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }); } catch (e) { break; }
    if (!r.ok) break;
    const chunk = await r.json().catch(function(){ return null; });
    if (!Array.isArray(chunk) || !chunk.length) break;
    chunk.forEach(function(ph){
      if (!ph || ph.id == null || !Array.isArray(ph.uris)) return;
      const by = {}; ph.uris.forEach(function(u){ if (u && u.type) by[u.type] = httpsUrl(u.uri || u.url); });
      const f = by.web || by.original || by.large || '', t = by.thumbnail || by.web || f; if (!f || !t) return;
      out.push({ ccId: String(ph.id), t: t, f: f, at: ymd(ph.captured_at || ph.created_at) });
    });
    if (chunk.length < 100) break;
  }
  ccCache.set(ccId, { at: Date.now(), list: out }); if (ccCache.size > 200) ccCache.delete(ccCache.keys().next().value);
  return out;
}

/* ── the private bucket: short-lived signed links ── */
function refPath(ref){ const m = /^sb:crm-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/.exec(s(ref)); return m ? m[1] : ''; }
async function signRefs(refs){
  const paths = Array.from(new Set(refs.map(refPath).filter(Boolean))), out = {};
  for (let i = 0; i < paths.length; i += 100) {
    try {
      const r = await fetch(sbUrl() + '/storage/v1/object/sign/crm-files', { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: SIGN_SECS, paths: paths.slice(i, i + 100) }) });
      if (!r.ok) continue;
      const j = await r.json();
      (Array.isArray(j) ? j : []).forEach(function(x){ const u = s(x && (x.signedURL || x.signedUrl)); if (x && x.path && u && !x.error) out['sb:crm-files/' + x.path] = /^https:/.test(u) ? u : sbUrl() + '/storage/v1' + (u[0] === '/' ? '' : '/') + u; });
    } catch (e) {}
  }
  return out;
}

/* ── the photos of one job, for one audience ('sub' or 'customer') ── */
async function jobPhotos(data, p, who, sub){
  const pid = String(p.id), recs = arr(data.gc_photos), flags = {};
  recs.forEach(function(r){ if (r.source === 'ccflag' && s(r.ccId)) flags[s(r.ccId)] = r; });
  const see = who === 'customer' ? custOf : subsOf;
  const seen = {}, pick = [];
  recs.forEach(function(r){
    if (r.deleted === true || r.source === 'ccflag' || s(r.jobId) !== pid) return;
    if (!see(r)) return;
    const full = refPath(r.annotatedRef) ? r.annotatedRef : r.ref; if (!refPath(full)) return;
    const k = s(r.hash) || full; if (seen[k]) return; seen[k] = 1;
    const mine = !!(sub && r.source === 'sub' && s(r.subId) && s(r.subId) === s(sub.id));
    pick.push({ id: s(r.id), full: full, thumb: refPath(r.thumbRef) ? r.thumbRef : full, at: s(r.at), tag: TAGS.indexOf(s(r.tag)) >= 0 ? s(r.tag) : '', src: r.source === 'sub' ? 'sub' : 'grayco', mine: mine });
  });
  pick.sort(function(a, b){ return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  const top = pick.slice(0, MAX_PHOTOS), signed = await signRefs([].concat.apply([], top.map(function(x){ return [x.full, x.thumb]; })));
  const out = top.map(function(x){ const f = signed[x.full]; if (!f) return null; const o = { id: x.id, t: signed[x.thumb] || f, f: f, at: ymd(x.at), tag: x.tag, src: x.src }; if (x.mine) o.mine = true; return o; }).filter(Boolean);
  const ccId = ccIdOf(p);
  if (ccId) (await ccPhotos(ccId)).forEach(function(c){ const f = flags[c.ccId]; if (!see({ shared: true }, f)) return; out.push({ id: 'cc_' + c.ccId, t: c.t, f: c.f, at: c.at, tag: '', src: 'companycam' }); });
  out.sort(function(a, b){ return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  return out;
}

/* ── the sub's code → who the sub is ── */
async function subByToken(token){
  const table = s(process.env.SUB_PORTAL_TABLE) || 'gc_sub_portal';
  const r = await fetch(sbUrl() + '/rest/v1/' + table + '?select=token,sub_id,sub_name,sub_email,job_ids,revoked,expires_at&token=eq.' + encodeURIComponent(token) + '&limit=1', { headers: H() });
  if (r.status === 404) { const e = new Error('setup'); e.setup = true; throw e; }
  if (!r.ok) throw new Error('read ' + r.status);
  const row = (await r.json())[0];
  if (!row || row.revoked === true) return null;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return null;
  return { id: s(row.sub_id), name: s(row.sub_name), email: low(row.sub_email), jobIds: Array.isArray(row.job_ids) ? row.job_ids.map(String) : [] };
}

/* ── the three things a sub can do ── */
async function jobsForSub(sub){
  const data = await crm(false);
  return { ok: true, jobs: jobsOf(data, sub).slice(0, 200).map(function(p){ return { id: s(p.id), name: clip(p.name, 120), address: clip(p.address || p.jobAddress, 160) }; }) };
}
async function photosForSub(sub, jobId){
  const pid = s(jobId);
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(pid)) return { ok: false, status: 400, error: 'Which job? (jobId)' };
  const data = await crm(false), p = assigned(data, sub, pid);
  if (!p) return { ok: false, status: 404, error: 'This job is not on your list.' };
  const photos = await jobPhotos(data, p, 'sub', sub);
  return { ok: true, job: { id: s(p.id), name: clip(p.name, 120), address: clip(p.address || p.jobAddress, 160) }, photos: photos, expiresIn: SIGN_SECS };
}
function sniff(buf){
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { ext: 'png', type: 'image/png' };
  if (buf.length > 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  if (buf.length > 12 && buf.slice(4, 8).toString('latin1') === 'ftyp' && /hei[cfsx]|mif1|msf1/.test(buf.slice(8, 12).toString('latin1'))) return { ext: 'heic', type: 'image/heic' };
  return null;
}
/* the record goes into gc_photos the way the app does it: read, add, write the whole list back; the app merges
   (union by id) on its next push, and this checks a moment later that the record is still there */
async function addRecord(rec){
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(sbUrl() + '/rest/v1/gc_kv?key=eq.gc_photos&select=value', { headers: H() });
    if (!r.ok) throw new Error('gc_photos read ' + r.status);
    const rows = await r.json(); let list = rows.length ? rows[0].value : [];
    if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e) { list = []; } }
    if (!Array.isArray(list)) list = [];
    if (!list.some(function(x){ return x && x.id === rec.id; })) {
      list.push(rec);
      const w = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: 'gc_photos', value: list, updated_at: new Date().toISOString() }) });
      if (!w.ok) throw new Error('gc_photos write ' + w.status);
    }
    await sleep(attempt === 0 ? (module.exports._core.CHECK_MS) : 400);
    const c = await fetch(sbUrl() + '/rest/v1/gc_kv?key=eq.gc_photos&select=value', { headers: H() });
    if (c.ok) { const cr = await c.json(); let v = cr.length ? cr[0].value : []; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } if (Array.isArray(v) && v.some(function(x){ return x && x.id === rec.id; })) return true; }
  }
  return false;
}
async function uploadForSub(sub, jobId, file){
  const pid = s(jobId);
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(pid)) return { ok: false, status: 400, error: 'Which job? (jobId)' };
  const data = await crm(true), p = assigned(data, sub, pid);
  if (!p) return { ok: false, status: 404, error: 'This job is not on your list.' };
  let buf = file && file.buffer;
  if (!buf && file && typeof file.data === 'string') { try { buf = Buffer.from(file.data.replace(/^data:[^,]*,/, ''), 'base64'); } catch (e) { buf = null; } }
  if (!buf || !buf.length) return { ok: false, status: 400, error: 'No photo was sent.' };
  if (buf.length > MAX_UPLOAD) return { ok: false, status: 413, error: 'That photo is too big. Send it at a smaller size (under 4 MB).' };
  const kind = sniff(buf); if (!kind) return { ok: false, status: 415, error: 'Only photos (JPEG, PNG, WebP, HEIC) can be added.' };
  const hash = crypto.createHash('sha256').update(buf).digest('hex'), path = hash + '.' + kind.ext;
  const recs = arr(data.gc_photos);
  const dup = recs.find(function(r){ return r.deleted !== true && s(r.jobId) === pid && (s(r.hash) === hash || s(r.srcHash) === hash); });
  if (dup) return { ok: true, id: s(dup.id), duplicate: true };
  const up = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: Object.assign(keyHeaders(svcKey()), { 'Content-Type': kind.type, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }), body: buf });
  if (!up.ok && up.status !== 409) return { ok: false, status: 502, error: 'The photo could not be stored. Try again.' };
  const now = new Date().toISOString(), tag = TAGS.indexOf(s(file.tag)) >= 0 ? s(file.tag) : 'During';
  const rec = { id: 'ph_sub_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'), jobId: pid, ref: 'sb:crm-files/' + path, thumbRef: 'sb:crm-files/' + path,
    tag: tag, note: clip(file.note, 300), by: clip(sub.name || 'Subcontractor', 80) + ' (sub)', byKey: 'sub:' + (s(sub.id) || low(sub.email) || low(sub.name)), subId: s(sub.id), subName: clip(sub.name, 80),
    at: now, addedAt: now, updatedAt: now, lat: null, lng: null, shared: false, hideSubs: false, annotatedRef: '', pairId: '', source: 'sub', hash: hash, srcHash: hash, size: buf.length, fileName: clip(file.name, 120) };
  const kept = await addRecord(rec);
  if (kvCache) kvCache = null;
  if (!kept) return { ok: false, status: 503, error: 'The photo was stored but could not be added to the job yet. Try again in a minute.' };
  return { ok: true, id: rec.id, tag: tag };
}

exports.handler = async function(event){
  event = event || {};
  const t0 = Date.now(), headers = cors(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'POST only' });
  async function notActive(){ const w = MIN_FAIL_MS + Math.floor(Math.random() * 60) - (Date.now() - t0); if (w > 0) await sleep(w); return reply(404, headers, { ok: false, error: NOT_ACTIVE }); }
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const action = s(b.action);
  if (['jobs', 'photos', 'upload'].indexOf(action) < 0) return reply(400, headers, { ok: false, error: 'Bad request' });
  const ip = ipOf(event);
  if (limited(ip, action === 'upload' ? 4 : 1)) { await sleep(MIN_FAIL_MS); return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' }); }
  const token = s(hdr(event, 'x-sub-token'));
  if (!TOKEN_RE.test(token) || !svcKey()) { noteBad(ip); return notActive(); }
  let sub = null;
  try { sub = await module.exports._core.validate(token); }
  catch (e) { if (e && e.setup) return reply(503, headers, { ok: false, setup: true, error: 'The sub portal is not set up yet (docs/grayco-photos-setup.sql).' }); return reply(503, headers, { ok: false, error: 'We could not check your link just now. Try again in a minute.' }); }
  if (!sub) { noteBad(ip); return notActive(); }
  try {
    const out = action === 'jobs' ? await jobsForSub(sub) : action === 'photos' ? await photosForSub(sub, b.jobId)
      : await uploadForSub(sub, b.jobId, { data: b.data, name: b.name, tag: b.tag, note: b.note });
    if (out.ok) return reply(200, headers, out);
    const code = out.status || 400; delete out.status; return reply(code, headers, out);
  } catch (e) {
    return reply(503, headers, { ok: false, error: 'We could not load the photos just now. Please try again in a minute.' });
  }
};
exports._core = { validate: subByToken, jobsForSub: jobsForSub, photosForSub: photosForSub, uploadForSub: uploadForSub, jobPhotos: jobPhotos,
  sharedOf: sharedOf, subsOf: subsOf, assigned: assigned, SIGN_SECS: SIGN_SECS, CHECK_MS: 1500,
  _reset: function(){ kvCache = null; ccCache.clear(); hits.clear(); } };
