/* netlify/functions/_lib/staffpush.js — patch AWAY: phone pushes to STAFF that really arrive.
   Found 11/16: every staff push in the CRM (approval escalations, the 7 AM digest, bid / lead alerts, sub alerts) called
   require('web-push'), which is not installed (netlify/functions/package.json has no dependencies), and nothing ever saved
   a staff phone's subscription (gc_kv gc_push_subs__<email> — none live). So no staff push ever left.
   Now:
     • the CRM / GrayCo Field page (index.html patch AWAY, /crm-push-sw.js) subscribes the phone and saves it here
       (appr-away.js op subscribe) in gc_kv "gc_push_subs__<email>" = [{ endpoint, keys, device, ua, at }] (≤ 5 per person);
     • send(emails, payload) encrypts and posts each push with Node's own crypto (the customer app's code, _lib/capp.js:
       VAPID RFC 8292 + aes128gcm RFC 8291) — no npm package. Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (or the portal's
       PORTAL_VAPID_PUBLIC / PORTAL_VAPID_PRIVATE) in Netlify. A subscription the push service says is gone (404 / 410) is
       removed;
     • every push is tagged 'staff' (custquiet.run), so ⏸ data-entry mode lets it through (_lib/pause.js) — staff only;
     • an away person (_lib/away.js) gets none: send() hands their pushes to their cover;
     • compat(): a drop-in for require('web-push') (setVapidDetails / sendNotification) for the older callers, so their
       pushes go out too (and an away person's subscription is skipped).
   Payload (≤ 3 KB): { title, body, url, tag, count } — the service worker shows it and a tap opens url (this site only). */
'use strict';
const crypto = require('crypto');
const PRE = 'gc_push_subs__';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function capp(){ return require('./capp.js'); }
function core(){ return require('../portal.js')._core; }
function AW(){ return require('./away.js'); }
const D = { fetch: function(u, o){ return globalThis.fetch(u, o); } };   /* tests swap it */
function keys(){ try { return capp().vapidKeys(); } catch (e) { return null; } }
function okSub(x){ try { return capp().okSub(x); } catch (e) { return false; } }
function staffEmail(e){ return /^[a-z0-9._%+-]+@(in\.)?grayco-cs\.com$/.test(low(e)); }
function devOf(v){ v = low(v); return /^(phone|tablet|computer)$/.test(v) ? v : 'phone'; }

async function kvGet(key){
  const C = core();
  const r = await D.fetch(C.sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: C.H() });
  if (!r || !r.ok) throw new Error('gc_kv read ' + (r && r.status));
  const rows = await r.json(); return arr(rows && rows[0] ? rows[0].value : []);
}
async function kvSet(key, value){
  const C = core();
  const r = await D.fetch(C.sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: C.H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
  if (!r || !r.ok) throw new Error('gc_kv write ' + (r && r.status));
}
async function subsOf(email){ try { return (await kvGet(PRE + low(email))).filter(okSub); } catch (e) { return []; } }
/* { device, at } per saved phone — never the endpoint (it is a secret address) */
async function devices(email){ return (await subsOf(email)).map(function(x){ return { device: devOf(x.device), at: s(x.at), ua: s(x.ua).slice(0, 60) }; }); }
async function subscribe(email, sub, meta){
  email = low(email); meta = meta || {};
  const rec = sub && { endpoint: s(sub.endpoint), keys: { p256dh: s(sub.keys && sub.keys.p256dh), auth: s(sub.keys && sub.keys.auth) }, device: devOf(meta.device), ua: s(meta.ua).slice(0, 120), at: new Date().toISOString() };
  if (!staffEmail(email)) return { ok: false, error: 'Staff only.' };
  if (!okSub(rec)) return { ok: false, error: 'That notification address is not one we can use.' };
  const l = (await kvGet(PRE + email).catch(function(){ return []; })).filter(function(x){ return x.endpoint !== rec.endpoint && okSub(x); }).concat([rec]).slice(-5);
  await kvSet(PRE + email, l);
  return { ok: true, on: true, devices: l.length };
}
async function unsubscribe(email, endpoint){
  email = low(email);
  const l = await kvGet(PRE + email).catch(function(){ return []; });
  const n = l.filter(function(x){ return x.endpoint !== s(endpoint); });
  if (n.length !== l.length) await kvSet(PRE + email, n);
  return { ok: true, on: false, devices: n.length };
}
function hasOn(list, endpoint){ return !!s(endpoint) && list.some(function(x){ return x.endpoint === s(endpoint); }); }

/* one push to one subscription (capp.js's encryption), tagged 'staff' so data-entry mode lets it through */
async function sendOne(sub, obj, K){
  const C = capp(), CQ = require('./custquiet.js');
  const go = function(){ return D.fetch(sub.endpoint, { method: 'POST', headers: { Authorization: C.vapidHeader(sub.endpoint, K), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' }, body: C.encrypt(sub, JSON.stringify(obj)) }); };
  const r = await (CQ.run ? CQ.run('staff', go) : go());
  return { ok: !!(r && r.status >= 200 && r.status < 300), gone: !!(r && (r.status === 404 || r.status === 410)), status: r && r.status, paused: !!(r && r.headers && typeof r.headers.get === 'function' && r.headers.get('x-gc-paused')) };
}
/* send(emails, { title, body, url, tag, count }) → { sent, to: [emails that got one], none: [emails with no phone saved], why }
   opts.noAway: true = do not re-route (the caller already did) */
async function send(emails, payload, opts){
  opts = opts || {};
  let to = (Array.isArray(emails) ? emails : [emails]).map(low).filter(staffEmail);
  if (!opts.noAway) { try { to = AW().redirect(to, await AW().activeNow()); } catch (e) {} }
  to = to.filter(function(e, i, a){ return a.indexOf(e) === i; });
  const out = { sent: 0, to: [], none: [], failed: 0 };
  /* QUIET (owner: 9 PM – 7 AM only call-outs / emergencies): anything else is held for the 7 AM bundle (_lib/staffquiet.js) */
  if (!opts.noQuiet && !opts.emergency && to.length) { const SQ = require('./staffquiet.js'); if (!SQ.emergency(payload) && await SQ.isQuiet()) { await SQ.hold(to, { kind: 'push', title: payload && payload.title, body: payload && payload.body, url: payload && (payload.url || payload.link) }); return Object.assign(out, { held: to.slice(), why: 'quiet hours — held until ' + require('./staffquiet.js').DEF.to + ' AM' }); } }
  const K = keys(); if (!K) return Object.assign(out, { none: to.slice(), why: 'phone push is not set up (VAPID keys missing in Netlify)' });
  const obj = { title: s(payload && payload.title).slice(0, 120) || 'GrayCo CRM', body: s(payload && payload.body).slice(0, 240), url: s(payload && (payload.url || payload.link)).slice(0, 600), tag: s(payload && payload.tag).slice(0, 60) || 'gc-staff' };
  if (payload && typeof payload.count === 'number') obj.count = payload.count;
  for (const e of to) {
    const subs = await subsOf(e);
    if (!subs.length) { out.none.push(e); continue; }
    let got = false; const gone = [];
    for (const sub of subs) {
      let r = null; try { r = await sendOne(sub, obj, K); } catch (x) { r = { ok: false }; }
      if (r && r.ok && !r.paused) { out.sent++; got = true; } else { out.failed++; if (r && r.gone) gone.push(sub.endpoint); }
    }
    if (got) out.to.push(e); else out.none.push(e);
    if (gone.length) { try { const l = await kvGet(PRE + e); await kvSet(PRE + e, l.filter(function(x){ return gone.indexOf(x.endpoint) < 0; })); } catch (x) {} }
  }
  return out;
}
/* the endpoints of everybody away right now (compat() skips them) */
let AWAYEP = null;
async function awayEndpoints(){
  if (AWAYEP && Date.now() - AWAYEP.at < 60e3) return AWAYEP.set;
  const set = {};
  try { const m = await AW().activeNow(); for (const e of Object.keys(m)) (await subsOf(e)).forEach(function(x){ set[x.endpoint] = e; }); } catch (e) {}
  AWAYEP = { at: Date.now(), set: set };
  return set;
}
/* require('web-push') look-alike for the older staff-push callers (portal.js pushTo, bid alerts / replies, the sub portal) */
function compat(){
  return {
    setVapidDetails: function(){},
    sendNotification: async function(sub, payload){
      const K = keys(); if (!K) throw new Error('phone push is not set up');
      if (!okSub(sub)) throw new Error('bad subscription');
      if ((await awayEndpoints())[sub.endpoint]) return { statusCode: 204, skipped: 'away' };
      let obj = {}; try { obj = typeof payload === 'string' ? JSON.parse(payload) : (payload || {}); } catch (e) { obj = { body: s(payload) }; }
      if (!obj.url && obj.link) obj.url = obj.link;
      const SQ = require('./staffquiet.js');   /* QUIET: held for the 7 AM bundle unless it is an emergency / call-out */
      if (!SQ.emergency(obj) && await SQ.isQuiet()) { const e = await emailOfEndpoint(sub.endpoint); if (e) { await SQ.hold([e], { kind: 'push', title: obj.title, body: obj.body, url: obj.url }); return { statusCode: 202, held: true }; } }
      const r = await sendOne(sub, obj, K);
      if (!r.ok || r.paused) { const er = new Error('push failed ' + r.status); er.statusCode = r.status; throw er; }
      return { statusCode: r.status };
    }
  };
}
/* whose phone is this (the older callers hand over a subscription, not a person) */
async function emailOfEndpoint(ep){
  try {
    const C = core();
    const r = await D.fetch(C.sbUrl() + '/rest/v1/gc_kv?select=key,value&key=like.' + encodeURIComponent(PRE + '*'), { headers: C.H() });
    const rows = r && r.ok ? await r.json() : [];
    const hit = (Array.isArray(rows) ? rows : []).filter(function(x){ return arr(x && x.value).some(function(y){ return y.endpoint === ep; }); })[0];
    return hit ? low(s(hit.key).slice(PRE.length)) : '';
  } catch (e) { return ''; }
}
function _reset(){ AWAYEP = null; }
module.exports = { PRE, D, keys, subsOf, devices, subscribe, unsubscribe, hasOn, send, compat, awayEndpoints, _reset };
