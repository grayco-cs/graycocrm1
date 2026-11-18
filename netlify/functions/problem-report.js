// netlify/functions/problem-report.js — patch REPORTPROB: "🆘 Report a problem / Ask a question" for people the CRM page
// cannot write for: someone who CANNOT SIGN IN (the sign-in screen's "Can't sign in? Report it"), and the Marketing Manager
// (signed in, but his sign-in cannot write gc_kv). Signed-in staff save from the page itself (gc_kv, the same row).
//   POST (application/json) { op: 'submit', dev, report: { type, text, screen, view, app, kind, build, ua, gate, name, phone,
//                             diag: [ { k: 'err' | 'slow', at, t, ms, v } … ≤ 20 ] }, shot?: 'data:image/jpeg;base64,…' }
//     → gc_kv "gc_problem_reports" (a JSON-text list, append only: a report is never deleted; status open / answered / fixed)
//       gc_kv "gc_problem_detail_<id>" (the errors / slow taps, the browser) · gc_kv "gc_problem_shot_<id>" (the photo)
//     → the admins and the office are told (the AWAY staff notices: phone push, else one staff text; inside the 9 PM – 7 AM
//       quiet hours it waits for the 7 AM bundle; an admin who is Away gets nothing — _lib/staffpush.js decides all that)
// Who sent it: a real sign-in only (the call carries the person's Supabase token, checked with Supabase); otherwise the
// name and phone TYPED IN (both required) — "signed out" is written on the report.
// Guarded like BOOTWATCH (bootwatch.js): calls from a browser must come from the CRM's own site; 8 KB for the report itself
// (+ one photo ≤ 800 KB); at most 1 report a device every 30 s and 200 a device a day; a new device only while fewer than
// 1000 devices sent in the last 24 h; anything that looks like a password, a token or a key is removed from the texts.
// Signed-out reports tell the office at most 20 times a day (the rest are saved and listed, without a phone notice).
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY), SITE_ORIGIN, CRM_URL — nothing new.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: staff notices only (pushes are tagged staff; texts go to staff phones) */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const MAX_BYTES = 8192, MAX_SHOT = 800 * 1024, MIN_GAP = 30e3, DAY_MAX = 200, NEW_DEV_MAX = 1000, NOTIFY_DAY_MAX = 20, DIAG_MAX = 20;
const KEY = 'gc_problem_reports', DETAIL = 'gc_problem_detail_', SHOT = 'gc_problem_shot_', RL = 'gc_problem_rl_', RL_ALL = 'gc_problem_rl__all';
const TYPES = { broke: 'Something broke', find: "I can't find something", question: 'Question', idea: 'Idea', signin: "Can't sign in" };

function s(v){ return v == null ? '' : String(v); }
function low(v){ return s(v).trim().toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(x => x.toLowerCase() === name); return k ? s(h[k]) : ''; }
function origins(){ return (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean); }
function cors(event){
  const allowed = origins(), o = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(o) > -1 ? o : allowed[0], 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
}
/* a browser call must come from the CRM's own site (or a deploy preview of it); a call with no Origin (a tool) is allowed */
function originOk(event){
  const o = hdr(event, 'origin').replace(/\/$/, '');
  if (!o || o === 'null') return true;
  if (origins().indexOf(o) > -1) return true;
  if (/^https:\/\/[a-z0-9-]+--graycocrm1\.netlify\.app$/i.test(o)) return true;
  for (const k of ['URL', 'DEPLOY_URL', 'DEPLOY_PRIME_URL']) { const u = s(process.env[k]).replace(/\/$/, ''); if (u && u === o) return true; }
  return false;
}
function sbUrl(){ return s(process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function svcHeaders(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
function parse(v){ if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } } return v; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── cleaning: nothing that looks like a secret ── */
function scrub(t, n){
  return s(t)
    .replace(/eyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]*/g, '[removed]')
    .replace(/\b(bearer|token|apikey|api_key|access_token|refresh_token|password|passwd|pwd|pw|secret)\b(\s*[:=]\s*|\s+)\S+/gi, '$1 [removed]')
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, '[removed]')
    .replace(/[\u0000-\u0008\u000b-\u001f]+/g, ' ').slice(0, n || 160);
}
const str = (v, n) => scrub(v, n).trim();
const num = v => { const x = +v; return isFinite(x) ? Math.max(0, Math.min(Math.round(x), 864e5)) : undefined; };
function drop(o){ Object.keys(o).forEach(k => { if (o[k] === undefined || o[k] === '' || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; }); return o; }
const isoOk = v => /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(s(v)) && !isNaN(Date.parse(v));
function cleanReport(r){
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const type = TYPES[s(r.type)] ? s(r.type) : '';
  if (!type) return null;
  const text = str(r.text, 1500);
  if (!text && type !== 'signin') return null;
  return drop({
    type: type, text: text, screen: str(r.screen, 160), view: str(r.view, 50), app: /^(desk|field)$/.test(s(r.app)) ? s(r.app) : undefined,
    kind: /^(phone|tablet|pc)$/.test(s(r.kind)) ? s(r.kind) : undefined, build: str(r.build, 40), ua: str(r.ua, 200), gate: str(r.gate, 200),
    name: str(r.name, 60), phone: s(r.phone).replace(/[^\d+]/g, '').slice(0, 16),
    diag: arr(r.diag).slice(-DIAG_MAX).map(d => d && typeof d === 'object' ? drop({ k: /^(err|slow|net)$/.test(s(d.k)) ? s(d.k) : 'err', at: isoOk(d.at) ? s(d.at) : undefined, t: str(d.t, 200), ms: num(d.ms), v: str(d.v, 40), n: num(d.n) }) : null).filter(Boolean)
  });
}

/* ── who: only a real sign-in token, checked with Supabase ── */
async function signedEmail(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim());
  if (!m || m[1] === svcKey()) return '';
  try {
    const r = await fetch(sbUrl() + '/auth/v1/user', { headers: { apikey: svcKey(), Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) return '';
    const u = await r.json();
    return low(u && u.email).slice(0, 120);
  } catch (e) { return ''; }
}

/* ── gc_kv ── */
async function kvGet(key){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value,updated_at&key=eq.' + encodeURIComponent(key), { headers: svcHeaders() });
  if (!r.ok) throw new Error('gc_kv read answered ' + r.status);
  const rows = await r.json(); return rows && rows[0] ? { value: parse(rows[0].value), updated_at: s(rows[0].updated_at) } : null;
}
async function kvPut(key, value){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error('gc_kv write answered ' + r.status);
}
/* append to the shared list without losing anybody's save (the page's admins write the same row): read, re-read just before
   writing (changed meanwhile: start over), write as JSON text (the CRM's format), read back (our report must be in it) */
async function listAppend(key, rec){
  const has = l => l.some(x => x && x.id === rec.id);
  for (let tries = 0; tries < 5; tries++) {
    const cur = await kvGet(key), v0 = cur ? (typeof cur.value === 'string' ? parse(cur.value) : cur.value) : null;
    if (v0 != null && !Array.isArray(v0)) throw new Error('the list is unreadable');   /* never write over what cannot be read */
    const l0 = Array.isArray(v0) ? v0 : [];
    if (has(l0)) return true;
    const again = await kvGet(key);
    if (s(again && again.updated_at) !== s(cur && cur.updated_at)) { await sleep(120 + 180 * tries); continue; }
    await kvPut(key, JSON.stringify(l0.concat([rec])));
    const after = await kvGet(key);
    if (after && has(arr(after.value))) return true;
    await sleep(120 + 180 * tries);
  }
  return false;
}
/* how many devices sent in the last 24 h (only asked for a device with no row yet) */
async function recentDevices(){
  const since = new Date(Date.now() - 864e5).toISOString();
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key&key=like.' + RL + '*&updated_at=gte.' + encodeURIComponent(since) + '&limit=1',
    { method: 'HEAD', headers: svcHeaders({ Prefer: 'count=exact' }) });
  const cr = r.headers && r.headers.get ? s(r.headers.get('content-range')) : '';
  const n = +(cr.split('/')[1] || 0);
  return isFinite(n) ? n : 0;
}
async function staff(){
  let users = [];
  try { const u = await kvGet('users'); users = arr(u && u.value); } catch (e) {}
  users = users.filter(u => u && u.active !== false && /@/.test(s(u.email)));
  const admins = users.filter(u => /^admin$/i.test(s(u.role)) || low(u.payType) === 'owner').map(u => low(u.email));
  const office = users.filter(u => /office/i.test(s(u.role)) && !/^admin$/i.test(s(u.role))).map(u => low(u.email));
  const to = admins.concat(office).filter((e, i, a) => e && /@(in\.)?grayco-cs\.com$/.test(e) && a.indexOf(e) === i);
  return { users, to };
}

/* ── the staff notice: the same path as appr-away.js op notify (phone push, else one staff text) ── */
async function notifyStaff(to, n){
  const SP = require('./_lib/staffpush.js');
  const p = await SP.send(to, { title: n.title, body: n.body, url: n.url, tag: 'gc-problem' }, {});
  const none = arr(p && p.none).filter(e => arr(p && p.to).indexOf(e) < 0);
  let texted = [];
  if (!(p && p.held) && none.length) { try { const r = await require('./_lib/smsalert.js').notify({ type: 'system', only: none, text: n.title + (n.body ? ': ' + n.body : ''), link: n.url, thread: 'notice:problem' }); texted = arr(r && r.to); } catch (e) {} }
  return { pushed: arr(p && p.to), held: arr(p && p.held), texted };
}
let NOTIFY = notifyStaff;

const MEM = new Map();   /* device → last report (this warm instance): a flood is refused before any database call */
function localDay(t){ return new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }
function newId(now){ return 'PR' + now.toString(36) + Math.random().toString(36).slice(2, 6); }

exports.handler = async function(event){
  const headers = cors(event);
  const J = (code, body) => ({ statusCode: code, headers, body: JSON.stringify(body) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST only' });
  if (!originOk(event)) return J(403, { error: 'Not from the CRM' });
  let raw = s(event.body);
  if (event.isBase64Encoded) { if (raw.length > (MAX_BYTES + MAX_SHOT) * 1.4) return J(413, { error: 'Too big' }); try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch (e) { return J(400, { error: 'Bad body' }); } }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES + MAX_SHOT + 256) return J(413, { error: 'Too big — try a smaller photo.' });
  let body; try { body = JSON.parse(raw); } catch (e) { return J(400, { error: 'Invalid JSON' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return J(400, { error: 'Invalid body' });
  if (s(body.op || 'submit') !== 'submit') return J(400, { error: 'Unknown op' });
  const shot = s(body.shot);
  if (shot && (shot.length > MAX_SHOT || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(shot))) return J(413, { error: 'The photo is too big or not a picture.' });
  if (Buffer.byteLength(JSON.stringify(body.report || null), 'utf8') > MAX_BYTES) return J(413, { error: 'Too long (8 KB at most)' });
  const dev = s(body.dev);
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(dev)) return J(400, { error: 'Bad device id' });
  const rep = cleanReport(body.report);
  if (!rep) return J(400, { error: 'Pick what kind of problem it is and say what happened.' });
  if (!svcKey()) return J(500, { error: 'SUPABASE_SERVICE_KEY is not set on Netlify.' });

  const now = Date.now();
  const mem = MEM.get(dev);
  if (mem && now - mem < MIN_GAP) return J(429, { error: 'One report every 30 seconds — try again in a moment.', retryMs: MIN_GAP - (now - mem) });

  /* the limits, kept in their own row (they hold across function instances) */
  const today = localDay(now);
  let rlRow = null; try { rlRow = await kvGet(RL + dev); } catch (e) { return J(502, { error: 'Could not reach the CRM — try again.' }); }
  const rl = rlRow && rlRow.value && typeof rlRow.value === 'object' ? rlRow.value : {};
  const n = rl.day === today ? (+rl.n || 0) : 0;
  if (n >= DAY_MAX) return J(429, { error: 'Daily limit for this device' });
  if (rl.last && now - (+rl.last || 0) < MIN_GAP) return J(429, { error: 'One report every 30 seconds — try again in a moment.', retryMs: MIN_GAP - (now - rl.last) });
  if (!rlRow) { try { if (await recentDevices() >= NEW_DEV_MAX) return J(429, { error: 'Too many devices today' }); } catch (e) {} }

  const email = await signedEmail(event);
  const S = await staff();
  const u = email ? S.users.filter(x => low(x.email) === email)[0] : null;
  if (!email) {
    if (str(rep.name, 60).length < 2) return J(400, { error: 'Type your name.' });
    if (rep.phone.replace(/\D/g, '').length < 7) return J(400, { error: 'Type a phone number we can call you back on.' });
  }
  try { await kvPut(RL + dev, { day: today, n: n + 1, last: now }); } catch (e) {}
  MEM.set(dev, now); if (MEM.size > 5000) MEM.clear();

  const at = new Date(now).toISOString(), id = newId(now);
  const by = email ? drop({ email: email, name: s(u && u.name) || rep.name || email.split('@')[0], role: s(u && u.role), phone: rep.phone }) : drop({ name: rep.name, phone: rep.phone });
  const rec = drop({ id: id, at: at, updatedAt: at, type: rep.type, text: rep.text, screen: rep.screen, view: rep.view, app: rep.app, kind: rep.kind, build: rep.build, dev: dev,
    by: by, signedOut: email ? undefined : true, status: 'open', replies: [], via: 'fn', shot: shot ? true : undefined, diagN: rep.diag ? rep.diag.length : undefined });
  try {
    if (shot) await kvPut(SHOT + id, { id: id, at: at, data: shot });
    await kvPut(DETAIL + id, drop({ id: id, at: at, diag: rep.diag, ua: rep.ua, gate: rep.gate }));
    if (!await listAppend(KEY, rec)) return J(503, { error: 'The CRM was busy — try again.' });
  } catch (e) { return J(502, { error: 'Could not save: ' + s(e && e.message).slice(0, 80) }); }

  /* tell the admins and the office (signed-out reports: at most 20 notices a day) */
  let told = null;
  try {
    let allow = true;
    if (!email) {
      let all = null; try { all = await kvGet(RL_ALL); } catch (e) {}
      const a = all && all.value && all.value.day === today ? all.value : { day: today, n: 0 };
      allow = (+a.n || 0) < NOTIFY_DAY_MAX;
      if (allow) try { await kvPut(RL_ALL, { day: today, n: (+a.n || 0) + 1 }); } catch (e) {}
    }
    const to = S.to.filter(e => e !== email);
    if (allow && to.length) {
      const who = s(by.name) || 'Someone';
      const title = (rep.type === 'signin' ? "🆘 Can't sign in — " + who : '🆘 ' + TYPES[rep.type] + ' — ' + who + (email ? '' : ' (signed out)')).slice(0, 120);
      const text = ((rep.text || '').slice(0, 180) + (email ? '' : ' · call ' + by.phone)).trim();
      const base = (s(process.env.CRM_URL) || 'https://crm.grayco-cs.com').replace(/\/$/, '');
      told = await NOTIFY(to, { title: title, body: text, url: base + '/#problems=' + id, id: id });
    }
  } catch (e) { told = { error: s(e && e.message).slice(0, 80) }; }
  return J(200, { ok: true, id: id, told: told ? { to: arr(told.pushed).length + arr(told.texted).length, held: arr(told.held).length } : null });
};
exports._test = { cleanReport, scrub, originOk, MEM, setNotify: f => { NOTIFY = f || notifyStaff; }, LIMITS: { MAX_BYTES, MAX_SHOT, MIN_GAP, DAY_MAX, NEW_DEV_MAX, NOTIFY_DAY_MAX } };
