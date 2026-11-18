// netlify/functions/bootwatch.js — patch BOOTWATCH: the sign-in watch (people who CANNOT get in are seen).
//   POST (text/plain JSON, from navigator.sendBeacon or fetch keepalive) { v: 1, dev, boot: {...}, prevBoot?: {...} }
//     → gc_kv "gc_bootrep_<dev>" = { dev, email?, emailAt?, kind, ua, build, sa, updated, boots: [ newest first, last 20 ] }
// Why here and not gc_kv from the page: the page that cannot sign in has no sign-in token, so it cannot write gc_kv.
// No sign-in needed to send. Who it was is recorded ONLY from a real sign-in: when the call carries the person's Supabase
// token (the page sends with fetch once signed in; the sign-in layer adds the token), it is checked with Supabase and that
// e-mail is kept. An e-mail in the body is never trusted, and never kept.
// Guarded: 8 KB at most; only the known fields, each with a type and a size; anything that looks like a password, a token
// or a key (by name or by shape) is removed; e-mail addresses in texts become "@"; at most 1 new open per device every
// 30 s (the same open again after 3 s, 6 times), 200 writes a device a day; a new device only while fewer than 1000
// devices reported in the last 24 h; calls from a browser must come from the CRM's own site.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY), SUPABASE_ANON_KEY, SITE_ORIGIN — the ones the
// other functions already use; nothing new.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode (this function sends nothing out; Supabase only) */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret): only used to check a sign-in token */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';

const MAX_BYTES = 8192, KEEP = 20, MIN_GAP = 30e3, SAME_GAP = 3e3, SAME_MAX = 6, DAY_MAX = 200, NEW_DEV_MAX = 1000;
const PREFIX = 'gc_bootrep_';

function s(v){ return v == null ? '' : String(v); }
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

/* ── cleaning: what is kept, and nothing that looks like a secret ─────────────────────────────────────────────── */
const SECRET_NAME = /pass|pwd|secret|token|auth(?!or)|api.?key|cookie|session|bearer|credential|jwt|refresh/i;
function scrub(t, n){
  return s(t)
    .replace(/eyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]*/g, '[removed]')                                   /* a JWT (a sign-in token, a key) */
    .replace(/\b(bearer|token|apikey|api_key|access_token|refresh_token|password|passwd|pwd|pw|secret)\b(\s*[:=]\s*|\s+)\S+/gi, '$1 [removed]')
    .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi, '@')                                        /* an e-mail address */
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, '[removed]')                                       /* a long key-shaped string */
    .replace(/[\u0000-\u001f]+/g, ' ').slice(0, n || 160);
}
const str = (v, n) => scrub(v, n);
const num = v => { const x = +v; return isFinite(x) ? Math.max(-1, Math.min(Math.round(x), 864e5)) : undefined; };
const bool = v => v === true || v === 1 || v === '1';
const hex = v => /^[0-9a-f]{6,64}$/i.test(s(v)) ? s(v).toLowerCase().slice(0, 32) : '';
const dom = v => { const x = s(v).toLowerCase().trim(); return /^(\(no @\)|\(empty\)|[a-z0-9.-]{1,60})$/.test(x) ? x : ''; };
function list(v, max, fn){ return Array.isArray(v) ? v.slice(-max).map(fn).filter(Boolean) : []; }
function drop(o){ Object.keys(o).forEach(k => { if (o[k] === undefined || o[k] === '' || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; }); return o; }
const MILESTONES = ['html', 'scripts', 'gate', 'try', 'err', 'signed', 'paint'];
function cleanBoot(b){
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const id = s(b.id);
  if (!/^[a-z0-9]{4,24}$/i.test(id)) return null;
  const m = {};
  if (b.m && typeof b.m === 'object') MILESTONES.forEach(k => { const x = num(b.m[k]); if (x !== undefined) m[k] = x; if (b.m[k + 'V'] != null) m[k + 'V'] = str(b.m[k + 'V'], 160); });
  const p = {};
  if (b.p && typeof b.p === 'object') Object.keys(b.p).slice(0, 12).forEach(k => { if (/^[a-z_]{1,20}$/i.test(k) && !SECRET_NAME.test(k)) p[k] = 1; });
  let at = s(b.at); if (!/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(at) || isNaN(Date.parse(at))) at = '';
  const old = b.old && typeof b.old === 'object' ? drop({ mine: str(b.old.mine, 40), live: str(b.old.live, 60), src: str(b.old.src, 20), t: num(b.old.t), afterUpdate: str(b.old.afterUpdate, 60) }) : undefined;
  return drop({
    id: id.toLowerCase(), at: at || undefined, build: str(b.build, 40), prev: str(b.prev, 40), ua: str(b.ua, 160),
    kind: /^(phone|tablet|pc)$/.test(s(b.kind)) ? s(b.kind) : undefined, sa: bool(b.sa) || undefined, sw: str(b.sw, 80), on: b.on === false ? false : undefined,
    sess: bool(b.sess) || undefined, nav: str(b.nav, 40), why: str(b.why, 12), t: num(b.t), hb: /^\d{4}-\d\d-\d\d$/.test(s(b.hb)) ? s(b.hb) : undefined,
    view: str(b.view, 50), gateMsg: str(b.gateMsg, 160), banner: num(b.banner), heal: num(b.heal), left: num(b.left),
    m: Object.keys(m).length ? m : undefined, p: Object.keys(p).length ? p : undefined, old: old && Object.keys(old).length ? old : undefined,
    si: list(b.si, 4, a => a && typeof a === 'object' ? drop({ t: num(a.t), dom: dom(a.dom), h: hex(a.h), on: a.on === false ? false : undefined, ok: num(a.ok), err: str(a.err, 160), errT: num(a.errT) }) : null),
    errs: list(b.errs, 6, e => e && typeof e === 'object' ? drop({ t: num(e.t), m: str(e.m, 200) }) : null),
    stuck: list(b.stuck, 5, x => x && typeof x === 'object' ? drop({ t: num(x.t), k: str(x.k, 12), why: str(x.why, 160), on: x.on === false ? false : undefined }) : null)
  });
}

/* ── who: only a real sign-in token, checked with Supabase ─────────────────────────────────────────────────── */
async function signedEmail(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim());
  if (!m) return '';
  try {
    const r = await fetch(sbUrl() + '/auth/v1/user', { headers: { apikey: process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON, Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) return '';
    const u = await r.json();
    return s(u && u.email).trim().toLowerCase().slice(0, 120);
  } catch (e) { return ''; }
}

async function kvGet(key){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value,updated_at&key=eq.' + encodeURIComponent(key), { headers: svcHeaders() });
  if (!r.ok) throw new Error('gc_kv read answered ' + r.status);
  const rows = await r.json(); return rows && rows[0] ? { value: parse(rows[0].value), updated_at: rows[0].updated_at } : null;
}
async function kvPut(key, value){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error('gc_kv write answered ' + r.status);
}
/* how many devices reported in the last 24 h (only asked for a device with no row yet) */
async function recentDevices(){
  const since = new Date(Date.now() - 864e5).toISOString();
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key&key=like.' + PREFIX + '*&updated_at=gte.' + encodeURIComponent(since) + '&limit=1',
    { method: 'HEAD', headers: svcHeaders({ Prefer: 'count=exact' }) });
  const cr = r.headers && r.headers.get ? s(r.headers.get('content-range')) : '';
  const n = +(cr.split('/')[1] || 0);
  return isFinite(n) ? n : 0;
}

const MEM = new Map();   /* device → last write (this warm instance): a flood is refused before any database call */
function localDay(t){ return new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }

exports.handler = async function(event){
  const headers = cors(event);
  const J = (code, body) => ({ statusCode: code, headers, body: JSON.stringify(body) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST only' });
  if (!originOk(event)) return J(403, { error: 'Not from the CRM' });
  let raw = s(event.body);
  if (event.isBase64Encoded) { if (raw.length > MAX_BYTES * 1.4) return J(413, { error: 'Too big' }); try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch (e) { return J(400, { error: 'Bad body' }); } }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) return J(413, { error: 'Too big (8 KB at most)' });
  let body; try { body = JSON.parse(raw); } catch (e) { return J(400, { error: 'Invalid JSON' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return J(400, { error: 'Invalid body' });
  const dev = s(body.dev);
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(dev)) return J(400, { error: 'Bad device id' });
  const boot = cleanBoot(body.boot);
  if (!boot) return J(400, { error: 'Bad boot' });
  const prevBoot = cleanBoot(body.prevBoot);
  if (!svcKey()) return J(500, { error: 'SUPABASE_SERVICE_KEY is not set on Netlify.' });

  const now = Date.now(), key = PREFIX + dev;
  const mem = MEM.get(dev);
  if (mem && now - mem.at < SAME_GAP) return J(429, { error: 'Too soon', retryMs: SAME_GAP - (now - mem.at) });
  if (mem && now - mem.at < MIN_GAP && mem.boot !== boot.id) return J(429, { error: 'Too soon', retryMs: MIN_GAP - (now - mem.at) });

  let row = null;
  try { row = await kvGet(key); } catch (e) { return J(502, { error: 'Could not read: ' + s(e && e.message).slice(0, 80) }); }
  const cur = row && row.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : null;
  /* the limits, kept in the row itself (they hold across function instances) */
  const today = localDay(now);
  const rl = cur && cur.rl && typeof cur.rl === 'object' ? cur.rl : {};
  const n = rl.day === today ? (+rl.n || 0) : 0;
  if (n >= DAY_MAX) return J(429, { error: 'Daily limit for this device' });
  const last = +rl.last || 0, same = rl.boot === boot.id;
  if (last && now - last < MIN_GAP) {
    if (!same) return J(429, { error: 'Too soon', retryMs: MIN_GAP - (now - last) });
    if (now - last < SAME_GAP || (+rl.bootN || 0) >= SAME_MAX) return J(429, { error: 'Too soon for this open' });
  }
  if (!cur) {
    try { if (await recentDevices() >= NEW_DEV_MAX) return J(429, { error: 'Too many devices today' }); } catch (e) {}
  }
  const email = await signedEmail(event);

  const boots = (cur && Array.isArray(cur.boots) ? cur.boots : []).filter(x => x && x.id);
  [prevBoot, boot].forEach(b => {
    if (!b) return;
    b.got = new Date(now).toISOString();
    if (email && b === boot) b.email = email;
    const i = boots.findIndex(x => x.id === b.id);
    if (i > -1) { if (!b.email && boots[i].email) b.email = boots[i].email; boots.splice(i, 1); }
    boots.unshift(b);
  });
  boots.sort((a, b) => s(b.at || b.got).localeCompare(s(a.at || a.got)));
  const value = drop({
    dev: dev, email: email || (cur && cur.email) || undefined, emailAt: email ? new Date(now).toISOString() : (cur && cur.emailAt) || undefined,
    kind: boot.kind || (cur && cur.kind), ua: boot.ua || (cur && cur.ua), build: boot.build || (cur && cur.build), sa: boot.sa || undefined,
    updated: new Date(now).toISOString(), boots: boots.slice(0, KEEP),
    rl: { day: today, n: n + 1, last: now, boot: boot.id, bootN: same ? (+rl.bootN || 0) + 1 : 1 }
  });
  try { await kvPut(key, value); } catch (e) { return J(502, { error: 'Could not save: ' + s(e && e.message).slice(0, 80) }); }
  MEM.set(dev, { at: now, boot: boot.id });
  if (MEM.size > 5000) MEM.clear();
  return J(200, { ok: true });
};
exports._test = { cleanBoot, scrub, originOk, MEM, LIMITS: { MAX_BYTES, KEEP, MIN_GAP, SAME_GAP, SAME_MAX, DAY_MAX, NEW_DEV_MAX } };
