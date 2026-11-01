/* netlify/functions/_lib/capp.js — patch PORTALAPP: the customer portal as an app on the phone.
   Owner (10/30): "Notifications go to customer app portal as numbers." and "customers get NOTHING 7 PM–7 AM Central".

   • NUMBERS: what is new for the customer since they last looked, per section of their portal —
       home   = updates / posts from GrayCo        docs = new papers (to read or sign)
       pay    = new invoices with money due         photos = new GrayCo photos
       msgs   = messages from GrayCo not read yet (the portal's own read state, gc_portal_msg)
     "Last looked" is kept on the SERVER per job (gc_kv gc_portal_app__<job id>: { seen, subs, pushed, held }), so a
     phone, a tablet and a computer agree. The very first time, everything already there counts as seen.
   • PUSH (Web Push, only after the customer tapped "Turn on notifications" and the phone said yes): when an item is
     PUBLISHED to that customer's portal (an approved portal post / weekly update / "Put in the portal" paper / new
     papers e-mail / invoice), ONE push per item: a short title, never the item's words, never a sub, an insurance
     carrier or an internal note — plus the number for the app icon.
       - keys from Netlify only: PORTAL_VAPID_PUBLIC + PORTAL_VAPID_PRIVATE (or the staff VAPID_PUBLIC_KEY +
         VAPID_PRIVATE_KEY). No keys → no push; the numbers still update whenever the app is opened.
       - QUIET HOURS 7 PM – 7 AM Central: a push is HELD (gc_kv gc_portal_app_held) and goes at 7 AM (portal-reminders,
         hourly). isQuiet(ms) is the one place that decides — swap it for patch CUSTQUIET's at merge.
       - data-entry mode (pause): nothing goes; the global fetch guard refuses unknown hosts too.
     VAPID (RFC 8292) + aes128gcm (RFC 8291) with Node's own crypto — no npm package. */
'use strict';
const crypto = require('crypto');

const SECTIONS = ['home', 'photos', 'docs', 'pay', 'msgs'];
const KEY_PRE = 'gc_portal_app__', HELD_KEY = 'gc_portal_app_held';
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/i, /^android\.googleapis\.com$/i, /(^|\.)push\.apple\.com$/i, /^updates\.push\.services\.mozilla\.com$/i, /(^|\.)notify\.windows\.com$/i, /(^|\.)push\.services\.mozilla\.com$/i];
/* what a published item is, for the customer (anything not listed never pushes: sub, GC, marketing, staff kinds) */
const PUSH_KINDS = {
  weekly_update: { sec: 'home', title: 'GrayCo: new update on your project' },
  portal_post:   { sec: 'home', title: 'GrayCo: new update on your project' },
  portal_publish:{ sec: 'docs', title: 'GrayCo: something new on your project page' },
  portal_docs:   { sec: 'docs', title: 'GrayCo: new document on your project' },
  invoice:       { sec: 'pay',  title: 'GrayCo: new invoice on your project' },
  final_invoice: { sec: 'pay',  title: 'GrayCo: your final invoice is ready' }
};

function s(v){ return v == null ? '' : String(v); }
function arr(v){ return Array.isArray(v) ? v : []; }
function b64u(buf){ return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64u(str){ return Buffer.from(s(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

/* ── quiet hours (patch CUSTQUIET owns the real rule; this is the same rule, easy to swap) ── */
function chicagoHour(ms){
  try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date(ms))) % 24; }
  catch (e) { return (new Date(ms).getUTCHours() + 18) % 24; }
}
function isQuiet(ms){ const h = chicagoHour(ms == null ? clock() : ms); return h >= 19 || h < 7; }
let clockFn = null;   /* tests only: a fixed "now" */
function clock(){ return clockFn ? clockFn() : Date.now(); }

/* ── keys (Netlify environment only — never in a file) ── */
function vapidKeys(){
  const pub = s(process.env.PORTAL_VAPID_PUBLIC || process.env.VAPID_PUBLIC_KEY).trim(), priv = s(process.env.PORTAL_VAPID_PRIVATE || process.env.VAPID_PRIVATE_KEY).trim();
  if (!pub || !priv) return null;
  const P = unb64u(pub), D = unb64u(priv);
  if (P.length !== 65 || P[0] !== 4 || D.length !== 32) return null;
  return { pub: pub, P: P, D: D, subject: s(process.env.PORTAL_VAPID_SUBJECT || process.env.VAPID_SUBJECT) || 'mailto:office@grayco-cs.com' };
}
function vapidHeader(endpoint, K, nowMs){
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: aud, exp: Math.floor((nowMs || Date.now()) / 1000) + 12 * 3600, sub: K.subject }));
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: b64u(K.D), x: b64u(K.P.subarray(1, 33)), y: b64u(K.P.subarray(33, 65)) }, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + K.pub;
}
/* RFC 8291: one aes128gcm record */
function encrypt(sub, payload){
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const ecdh = crypto.createECDH('prime256v1'); const asPub = ecdh.generateKeys();
  const secret = ecdh.computeSecret(ua);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}
function okSub(x){
  if (!x || typeof x !== 'object' || !x.keys) return false;
  let u; try { u = new URL(s(x.endpoint)); } catch (e) { return false; }
  if (u.protocol !== 'https:' || !PUSH_HOSTS.some(function(re){ return re.test(u.hostname); })) return false;
  const p = unb64u(x.keys.p256dh), a = unb64u(x.keys.auth);
  return p.length === 65 && p[0] === 4 && a.length === 16 && s(x.endpoint).length < 1200;
}
async function sendOne(sub, obj, K){
  const r = await globalThis.fetch(sub.endpoint, { method: 'POST', headers: { Authorization: vapidHeader(sub.endpoint, K), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' }, body: encrypt(sub, JSON.stringify(obj)) });
  return { ok: !!(r && r.status >= 200 && r.status < 300), gone: !!(r && (r.status === 404 || r.status === 410)), status: r && r.status, paused: !!(r && r.headers && typeof r.headers.get === 'function' && r.headers.get('x-gc-paused')) };
}

/* ── storage: gc_kv, read and written with the service key (core.sbUrl / core.H from portal.js) ── */
async function kvGet(core, key){
  const r = await globalThis.fetch(core.sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: core.H() });
  if (!r.ok) throw new Error('gc_kv read ' + r.status);
  const rows = await r.json(); let v = rows && rows[0] ? rows[0].value : null;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v;
}
async function kvSet(core, key, value){
  const r = await globalThis.fetch(core.sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: core.H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error('gc_kv write ' + r.status);
}
function recOf(v){ v = v && typeof v === 'object' ? v : {}; return { seen: v.seen && typeof v.seen === 'object' ? v.seen : null, subs: arr(v.subs).filter(okSub), pushed: arr(v.pushed), held: arr(v.held) }; }
async function readRec(core, pid){ return recOf(await kvGet(core, KEY_PRE + pid)); }
async function writeRec(core, pid, rec){ return kvSet(core, KEY_PRE + pid, { seen: rec.seen, subs: rec.subs.slice(-5), pushed: rec.pushed.slice(-60), held: rec.held.slice(-30) }); }

/* ── the numbers ── */
function after(at, since){ const t = Date.parse(s(at).length === 10 ? at + 'T23:59:59Z' : at); return !isNaN(t) && t > (Date.parse(since) || 0); }
async function msgUnread(core, pid){
  try {
    const r = await globalThis.fetch(core.sbUrl() + '/rest/v1/gc_portal_msg?select=id&side=eq.gc&party=eq.c&read_at=is.null&project_id=eq.' + encodeURIComponent(pid) + '&limit=200', { headers: core.H() });
    const rows = r.ok ? await r.json() : []; return Array.isArray(rows) ? rows.length : 0;
  } catch (e) { return 0; }
}
async function photoTimes(core, pid){
  try { const recs = await core.grayCoRecords(); return arr(recs).filter(function(r){ return r && r.deleted !== true && r.source !== 'ccflag' && s(r.jobId) === s(pid) && (r.shared === true || (r.shared == null && s(r.tag) !== 'Damage')) && (r.source !== 'sub' || (r.shared === true && s(r.custOkBy))); }).map(function(r){ return s(r.at); }); }
  catch (e) { return []; }
}
function countsFrom(view, seen, extra){
  seen = seen || {}; extra = extra || {};
  const c = {
    home: arr(view && view.posts).filter(function(x){ return after(x.at, seen.home); }).length,
    docs: arr(view && view.docs).filter(function(x){ return after(x.date, seen.docs); }).length,
    pay: arr(view && view.money && view.money.invoices).filter(function(x){ return Number(x.balance) > 0 && after(x.date, seen.pay); }).length,
    photos: arr(extra.photos).filter(function(at){ return after(at, seen.photos); }).length,
    msgs: Number(extra.msgs) || 0
  };
  c.total = c.home + c.docs + c.pay + c.photos + c.msgs;
  return c;
}
async function countsFor(core, data, p, rec){
  const view = await core.buildView(data, p);
  return countsFrom(view, rec.seen, { msgs: await msgUnread(core, s(p.id)), photos: await photoTimes(core, s(p.id)) });
}

/* ── the portal page: POST portal.js {action:'app', op} with the customer's own link code / session ── */
async function portal(core, data, p, body, ctx){
  const pid = s(p.id), op = s(body.op || 'state'), preview = body.preview === true || !!(ctx && ctx.preview);
  const K = vapidKeys();
  let rec = await readRec(core, pid);
  const now = new Date().toISOString();
  if (op === 'state') {
    if (!rec.seen) { const base = {}; SECTIONS.forEach(function(k){ base[k] = now; }); rec.seen = base; if (!preview) await writeRec(core, pid, rec); }
    const c = await countsFor(core, data, p, rec);
    const ep = s(body.endpoint);
    return { code: 200, body: { ok: true, unread: c, total: c.total, push: { ready: !!K, key: K ? K.pub : '', on: !!(ep && rec.subs.some(function(x){ return x.endpoint === ep; })) } } };
  }
  if (preview) return { code: 200, body: { ok: false, error: 'Preview — nothing is saved.' } };
  if (op === 'seen') {
    const sec = s(body.section); if (SECTIONS.indexOf(sec) < 0 || sec === 'msgs') return { code: 400, body: { ok: false, error: 'Bad request' } };
    rec.seen = Object.assign({}, rec.seen || {}, { [sec]: now }); await writeRec(core, pid, rec);
    const c = await countsFor(core, data, p, rec);
    return { code: 200, body: { ok: true, unread: c, total: c.total } };
  }
  if (op === 'subscribe') {
    if (!K) return { code: 200, body: { ok: false, setup: true, error: 'Notifications are not set up yet — the numbers still show when you open the app.' } };
    const sub = body.sub && { endpoint: s(body.sub.endpoint), keys: { p256dh: s(body.sub.keys && body.sub.keys.p256dh), auth: s(body.sub.keys && body.sub.keys.auth) }, at: now, lang: s(body.lang) === 'es' ? 'es' : 'en' };
    if (!okSub(sub)) return { code: 400, body: { ok: false, error: 'That notification address is not one we can use.' } };
    rec.subs = rec.subs.filter(function(x){ return x.endpoint !== sub.endpoint; }).concat([sub]);
    if (!rec.seen) { const base = {}; SECTIONS.forEach(function(k){ base[k] = now; }); rec.seen = base; }
    await writeRec(core, pid, rec);
    return { code: 200, body: { ok: true, on: true } };
  }
  if (op === 'unsubscribe') {
    const ep = s(body.endpoint); rec.subs = rec.subs.filter(function(x){ return x.endpoint !== ep; }); await writeRec(core, pid, rec);
    return { code: 200, body: { ok: true, on: false } };
  }
  return { code: 400, body: { ok: false, error: 'Bad request' } };
}

/* ── an item was published to the customer (portal.js approvalAction, after it went out) ── */
async function pushNow(core, pid, rec, kinds, K){
  let data, p; try { data = await core.crmData(true); p = core.findProject(data, pid); } catch (e) { return { sent: 0, why: 'job not readable' }; }
  if (!p) return { sent: 0, why: 'job gone' };
  const c = await countsFor(core, data, p, rec);
  const last = PUSH_KINDS[kinds[kinds.length - 1]] || PUSH_KINDS.weekly_update;
  const one = kinds.length === 1;
  let sent = 0; const keep = [];
  for (const sub of rec.subs) {
    const es = sub.lang === 'es';
    const obj = { title: one ? (es ? 'GrayCo: hay algo nuevo en su proyecto' : last.title) : (es ? 'GrayCo: ' + kinds.length + ' cosas nuevas en su proyecto' : 'GrayCo: ' + kinds.length + ' new things on your project'),
      body: es ? 'Toque para abrir su portal de GrayCo.' : 'Tap to open your GrayCo portal.', count: c.total, url: '/#job=' + encodeURIComponent(pid) + '&tab=' + last.sec, tag: 'gc-portal-' + pid };
    let r = { ok: false }; try { r = await sendOne(sub, obj, K); } catch (e) {}
    if (r.paused) return { sent: 0, why: 'paused' };
    if (r.ok) sent++;
    if (!r.gone) keep.push(sub);
  }
  rec.subs = keep;
  return { sent: sent, count: c.total };
}
async function onPublished(core, item, opts){
  opts = opts || {};
  const kind = s(item && item.kind), pid = s(item && (item.jobId || item.pid));
  if (!PUSH_KINDS[kind] || !pid) return { skipped: 'not a customer item' };
  const K = vapidKeys(); if (!K) return { skipped: 'no keys' };
  const rec = await readRec(core, pid);
  if (!rec.subs.length) return { skipped: 'no consent' };
  const id = s(item.id) || kind + ':' + Date.now();
  if (rec.pushed.some(function(x){ return x.id === id; }) || rec.held.some(function(x){ return x.id === id; })) return { skipped: 'already' };
  try { if (await require('./pause.js').isPaused()) return { skipped: 'paused' }; } catch (e) { return { skipped: 'paused' }; }
  const nowMs = opts.now ? +new Date(opts.now) : clock();
  if (isQuiet(nowMs)) {
    rec.held.push({ id: id, kind: kind, at: new Date(nowMs).toISOString() }); await writeRec(core, pid, rec);
    let idx = []; try { idx = arr(await kvGet(core, HELD_KEY)); } catch (e) {}
    if (idx.indexOf(pid) < 0) await kvSet(core, HELD_KEY, idx.concat([pid]));
    return { held: true };
  }
  const r = await pushNow(core, pid, rec, [kind], K);
  if (r.why === 'paused') return { skipped: 'paused' };
  rec.pushed.push({ id: id, at: new Date(nowMs).toISOString(), sent: r.sent }); await writeRec(core, pid, rec);
  return r;
}
/* 7 AM: what waited through the night goes — one push per job (portal-reminders.js, every hour) */
async function flushHeld(core, opts){
  opts = opts || {};
  const nowMs = opts.now ? +new Date(opts.now) : clock();
  if (isQuiet(nowMs)) return { skipped: 'quiet hours' };
  let idx = []; try { idx = arr(await kvGet(core, HELD_KEY)); } catch (e) { return { error: 'held list not readable' }; }
  if (!idx.length) return { jobs: 0, sent: 0 };
  const K = vapidKeys(); if (!K) return { skipped: 'no keys' };
  try { if (await require('./pause.js').isPaused()) return { skipped: 'paused' }; } catch (e) { return { skipped: 'paused' }; }
  let sent = 0, jobs = 0;
  for (const pid of idx) {
    const rec = await readRec(core, pid);
    if (rec.held.length && rec.subs.length) {
      const r = await pushNow(core, pid, rec, rec.held.map(function(x){ return x.kind; }), K);
      if (r.why === 'paused') return { skipped: 'paused', jobs: jobs, sent: sent };
      sent += r.sent || 0; jobs++;
      rec.held.forEach(function(x){ rec.pushed.push({ id: x.id, at: new Date(nowMs).toISOString(), sent: r.sent || 0, held: true }); });
    }
    rec.held = []; await writeRec(core, pid, rec);
  }
  await kvSet(core, HELD_KEY, []);
  return { jobs: jobs, sent: sent };
}

module.exports = { _setClock: function(fn){ clockFn = fn || null; }, portal, onPublished, flushHeld, isQuiet, countsFrom, vapidKeys, encrypt, vapidHeader, okSub, PUSH_KINDS, SECTIONS, KEY_PRE, HELD_KEY };
