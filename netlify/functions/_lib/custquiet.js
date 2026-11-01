/* ============================================================================
   GrayCo — CUSTOMER QUIET HOURS (patch CUSTQUIET).   netlify/functions/_lib/custquiet.js

   Owner (Wesley): "I do work after 9pm and approvals etc all the time never post to portal or send texts anything
   after 7pm -7am".

   ONE RULE, one clock, used everywhere (the CRM page has the same rule in index.html, patch CUSTQUIET):
     customer quiet = 7:00 PM – 7:00 AM Central (America/Chicago, daylight saving handled by the time zone):
       quiet(ms)       → hour >= 19 || hour < 7
       nextRelease(ms) → the next 7:00 AM Central (today's when it is before 7 AM, else tomorrow's)
       windowStart(ms) → when the current quiet window began (7:00 PM Central), '' outside the window
       heldNow(t, ms)  → a thing stamped t inside the CURRENT quiet window stays hidden from customers until 7 AM
   Staff keep working and approving at night; nothing goes OUT to a customer or a sub in the window. Anything sent in
   the window is HELD (queued, never dropped) and released at 7:00 AM Central by cust-release.js (scheduled), in the
   order it was held, each item exactly once (claimed before it is sent; a second run finds nothing to send).

   Where the hold happens:
     · every text (Twilio Messages) and every e-mail marked "customer" passes _lib/pause.js's fetch guard, which asks
       decide() here: inside the window it is stored in the queue (service-only gc_lead_inbox_kv "gc_cust_quiet") and a
       provider-like "queued" answer goes back (x-gc-held: 1, held: { id, releaseAt }) — nothing reaches the customer;
     · approvals (portal.js) are kept as status "scheduled" with releaseAt; portal posts / photos stamped inside the
       window are hidden until 7 AM; the portal's notice / reminder e-mails wait for the first run after 7 AM.
   What goes through at night (run(tag, fn) marks a send; AsyncLocalStorage carries it through every await):
     staff      — alerts / texts to staff cells (smsalert, on-call, emergency escalation): staff are not customers
     emergency  — a reply to an EMERGENCY the customer started (after-hours "press 1" / emergency words in their call or
                  text, the 5 = emergency menu answer, a staff reply to an emergency alert)
     reply      — what the customer asked for that moment: a sign-in code, the HELP answer the carriers require
     override   — an admin's "Send now (emergency)" for one item
     release    — the 7 AM release itself
   CUST_QUIET_OFF=1 on Netlify turns the hold off (everything then sends at once, as before).
   ========================================================================== */
'use strict';
const TZ = 'America/Chicago';
const START_H = 19, END_H = 7;
const KEY = 'gc_cust_quiet';
const KEEP_MS = 4 * 86400000, STALE_MS = 10 * 60000, MAX_TRIES = 3, MAX_ITEMS = 2000;
const SAY = '⏰ Scheduled for 7:00 AM — customers don\'t get posts or texts 7 PM–7 AM';
const ALLOW = { staff: 1, emergency: 1, reply: 1, override: 1, release: 1 };
const STAFF_DOMAIN = /(^|\.)grayco-cs\.com$/i;

function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
let nowFn = null;
function now(){ return typeof nowFn === 'function' ? nowFn() : Date.now(); }

/* ── the Central clock ── */
function parts(ms){
  const o = {};
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, se: +o.second };
  } catch (e) {   /* no time-zone data: Central standard time (fails toward "quiet" by an hour in summer, never toward sending) */
    const d = new Date(ms - 6 * 3600000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), se: d.getUTCSeconds() };
  }
}
function hour(ms){ return parts(ms == null ? now() : ms).h; }
function quiet(ms){ const h = hour(ms); return h >= START_H || h < END_H; }
/* the UTC time of y-mo-d h:00 Central (the offset is read from the time zone at that moment) */
function atCentral(y, mo, d, h){
  let guess = Date.UTC(y, mo - 1, d, h, 0, 0);
  for (let i = 0; i < 3; i++) {
    const p = parts(guess), shown = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.se);
    const diff = Date.UTC(y, mo - 1, d, h, 0, 0) - shown;
    if (!diff) break;
    guess += diff;
  }
  return guess;
}
function dayAdd(p, n){ const t = new Date(Date.UTC(p.y, p.mo - 1, p.d + n)); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
function nextRelease(ms){
  ms = ms == null ? now() : ms;
  const p = parts(ms);
  const day = p.h < END_H ? p : dayAdd(p, 1);
  return atCentral(day.y, day.mo, day.d, END_H);
}
function windowStart(ms){
  ms = ms == null ? now() : ms;
  if (!quiet(ms)) return 0;
  const p = parts(ms), day = p.h >= START_H ? p : dayAdd(p, -1);
  return atCentral(day.y, day.mo, day.d, START_H);
}
function iso(ms){ return new Date(ms).toISOString(); }
/* stamped inside the window we are in now → still hidden from the customer */
function heldNow(stamp, ms){
  ms = ms == null ? now() : ms;
  const t = typeof stamp === 'number' ? stamp : Date.parse(s(stamp));
  if (!isFinite(t)) return false;
  const w = windowStart(ms);
  return !!w && t >= w && t <= ms + 60000;
}
function off(){ return s(process.env.CUST_QUIET_OFF) === '1'; }

/* ── which send is this (AsyncLocalStorage: the tag follows the call through every await) ── */
let als = null;
try { als = new (require('async_hooks').AsyncLocalStorage)(); } catch (e) { als = null; }
function run(tag, fn, meta){
  if (!als || !tag) return fn();
  const parent = als.getStore() || {};
  return als.run({ tag: s(tag), meta: Object.assign({}, parent.meta || {}, meta || {}) }, fn);
}
function ctx(){ return als ? als.getStore() || null : null; }
function tag(){ const c = ctx(); return c ? c.tag : ''; }
function allowed(){ return !!ALLOW[tag()]; }

/* ── the fetch guard's question: hold this request? → null (let it go) or { kind, item } ── */
function bodyText(opts){ const b = opts && opts.body; return typeof b === 'string' ? b : (b && typeof b.toString === 'function' && !(b instanceof ArrayBuffer) ? String(b) : ''); }
function addrs(v){ const out = []; (Array.isArray(v) ? v : [v]).forEach(x => s(x).split(',').forEach(p => { const m = /<([^>]+)>/.exec(p); const a = s(m ? m[1] : p).toLowerCase(); if (a) out.push(a); })); return out; }
function staffMail(m){ const all = addrs(m && m.to).concat(addrs(m && m.cc), addrs(m && m.bcc)); return all.length > 0 && all.every(a => STAFF_DOMAIN.test(a.split('@')[1] || '')); }
function classify(url, opts){
  let u; try { u = new URL(s(url)); } catch (e) { return null; }
  if (s((opts && opts.method) || 'GET').toUpperCase() !== 'POST') return null;
  const host = u.hostname.toLowerCase();
  if (host === 'api.twilio.com' && /\/Messages(\.json)?$/i.test(u.pathname)) {
    const p = {}; try { new URLSearchParams(bodyText(opts)).forEach((v, k) => { p[k] = v; }); } catch (e) {}
    return { kind: 'sms', to: s(p.To), from: s(p.From), body: s(p.Body) };
  }
  if (host === 'api.resend.com' && /^\/emails(\/batch)?\/?$/.test(u.pathname)) {
    if (tag() !== 'customer') return null;   /* only e-mails marked as customer notices are held (sign-in links, staff mail … go) */
    let j = null; try { j = JSON.parse(bodyText(opts)); } catch (e) { return null; }
    const list = Array.isArray(j) ? j : [j];
    if (!list.length || list.every(staffMail)) return null;
    return { kind: Array.isArray(j) ? 'email_batch' : 'email', payload: j, to: list.map(m => addrs(m && m.to).join(', ')).join('; ') };
  }
  return null;
}
function decide(url, opts, ms){
  if (off()) return null;
  const c = classify(url, opts); if (!c) return null;
  if (allowed()) return null;
  if (!quiet(ms == null ? now() : ms)) return null;
  return c;
}

/* ── the queue: service-only store (gc_lead_inbox_kv, gc_kv until that table exists), compare-and-set ── */
function sbUrl(){ return s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function svc(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function rawFetch(){ const f = globalThis.fetch; return f && f.__gcRaw ? f.__gcRaw : f; }
function H(extra){ const k = svc(), h = { apikey: k, 'Content-Type': 'application/json' }; if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(k)) h.Authorization = 'Bearer ' + k; return Object.assign(h, extra || {}); }
let TABLE = null;
async function table(){
  if (TABLE) return TABLE;
  const r = await rawFetch()(sbUrl() + '/rest/v1/gc_lead_inbox_kv?select=key&limit=1', { headers: H() });
  if (r.ok) TABLE = 'gc_lead_inbox_kv';
  else if (r.status === 404 || /PGRST20|does not exist|schema cache/i.test(await r.text().catch(() => ''))) TABLE = 'gc_kv';
  else throw new Error('database unavailable (' + r.status + ')');
  return TABLE;
}
const dbStore = {
  async read(){
    const T = await table();
    const r = await rawFetch()(sbUrl() + '/rest/v1/' + T + '?select=value,updated_at&key=eq.' + KEY, { headers: H() });
    if (!r.ok) throw new Error('queue read ' + r.status);
    const rows = await r.json(); const row = Array.isArray(rows) && rows[0];
    let v = row ? row.value : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
    return { exists: !!row, v: v, at: row ? s(row.updated_at) : '' };
  },
  async write(cur, value){
    const T = await table(), at = new Date().toISOString();
    const r = cur.exists
      ? await rawFetch()(sbUrl() + '/rest/v1/' + T + '?key=eq.' + KEY + '&updated_at=eq.' + encodeURIComponent(cur.at), { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ value: value, updated_at: at }) })
      : await rawFetch()(sbUrl() + '/rest/v1/' + T, { method: 'POST', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ key: KEY, value: value, updated_at: at }) });
    if (!r.ok) { if (r.status >= 500) throw new Error('queue write ' + r.status); return false; }
    if (cur.exists) { const rows = await r.json().catch(() => []); return Array.isArray(rows) && rows.length > 0; }
    return true;
  }
};
let store = dbStore;
function load(v){ const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; return { items: arr(o.items), notices: o.notices === true ? true : undefined }; }
/* change(state) → false/undefined = nothing to write */
async function cas(change){
  for (let i = 0; i < 6; i++) {
    const cur = await store.read();
    const st = load(cur.v && JSON.parse(JSON.stringify(cur.v)));
    const r = change(st);
    if (r === false || r === undefined) return { ok: true, unchanged: true, state: st };
    const t = now();
    st.items = st.items.filter(x => !(/^(sent|failed|skipped)$/.test(x.status) && t - Date.parse(x.doneAt || x.heldAt || 0) > KEEP_MS)).slice(-MAX_ITEMS);
    if (await store.write(cur, st)) return { ok: true, state: st };
    await new Promise(res => setTimeout(res, 80 + Math.floor(Math.random() * 300)));
  }
  throw new Error('the customer queue was busy');
}

function newId(){ return 'cq_' + now().toString(36) + Math.random().toString(36).slice(2, 8); }
/* store a held send; → { id, releaseAt } (throws when it cannot be stored — the caller then does NOT send) */
async function hold(c, extra){
  const t = now(), c0 = ctx(), meta = Object.assign({}, (c0 && c0.meta) || {}, (extra && extra.meta) || {});
  const item = { id: newId(), kind: c.kind, to: s(c.to).slice(0, 300), from: s(c.from).slice(0, 40), body: c.kind === 'sms' ? s(c.body).slice(0, 1600) : undefined,
    payload: c.kind === 'sms' ? undefined : c.payload, heldAt: iso(t), releaseAt: iso(nextRelease(t)), status: 'held', tries: 0, meta: meta };
  await cas(st => { st.items.push(item); return true; });
  return { id: item.id, releaseAt: item.releaseAt };
}
/* the answer the caller gets for a held send (looks like the provider's "queued") */
function heldResponse(c, h){
  const body = c.kind === 'sms' ? { sid: 'SMheld' + h.id.slice(3), status: 'queued' } : c.kind === 'email_batch' ? { data: (Array.isArray(c.payload) ? c.payload : [0]).map((_, i) => ({ id: 'held-' + h.id + '-' + i })) } : { id: 'held-' + h.id };
  Object.assign(body, { held: { id: h.id, releaseAt: h.releaseAt, say: SAY } });
  const headers = { 'Content-Type': 'application/json', 'x-gc-held': '1', 'x-gc-held-id': h.id, 'x-gc-release-at': h.releaseAt };
  const status = c.kind === 'sms' ? 201 : 200;
  if (typeof Response === 'function') return new Response(JSON.stringify(body), { status, headers });
  return { ok: true, status, headers: { get: k => headers[k] || headers[s(k).toLowerCase()] || null }, json: async () => body, text: async () => JSON.stringify(body) };
}
/* the guard: called by pause.js for every request (after the data-entry check); null → send it now */
async function guard(url, opts){
  const c = decide(url, opts);
  if (!c) return null;
  try {
    const h = await hold(c);
    try { console.log('[custquiet] held ' + c.kind + ' until ' + h.releaseAt + ' (' + h.id + ')'); } catch (e) {}
    return heldResponse(c, h);
  } catch (e) {
    try { console.log('[custquiet] could not queue a ' + c.kind + ' (' + s(e && e.message) + ') — not sent'); } catch (e2) {}
    const body = { error: 'Customer quiet hours (7 PM–7 AM): the send could not be queued, so it was NOT sent. Try again.', held: false };
    if (typeof Response === 'function') return new Response(JSON.stringify(body), { status: 503, headers: { 'Content-Type': 'application/json' } });
    return { ok: false, status: 503, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
  }
}
/* read a held answer back (missed-call.js sendSms) */
function heldOf(res){ try { if (res && res.headers && res.headers.get && res.headers.get('x-gc-held') === '1') return { id: s(res.headers.get('x-gc-held-id')), releaseAt: s(res.headers.get('x-gc-release-at')) }; } catch (e) {} return null; }

/* ── sending a held item (the release and "Send now") ── */
async function sendItem(x){
  const f = globalThis.fetch;   /* through the data-entry guard: paused at 7 AM → nothing goes */
  if (x.kind === 'sms') {
    const sid = s(process.env.TWILIO_ACCOUNT_SID), tok = s(process.env.TWILIO_AUTH_TOKEN);
    if (!sid || !tok) return { ok: false, retry: false, error: 'texting is not set up' };
    const r = await f('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', { method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: x.to, From: x.from || s(process.env.TWILIO_FROM), Body: s(x.body) }).toString() });
    return { ok: !!r.ok, retry: !r.ok && r.status >= 500, status: r.status, paused: pausedOf(r) };
  }
  const key = s(process.env.RESEND_API_KEY);
  if (!key) return { ok: false, retry: false, error: 'e-mail is not set up' };
  const r = await f('https://api.resend.com/emails' + (x.kind === 'email_batch' ? '/batch' : ''), { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(x.payload) });
  return { ok: !!r.ok, retry: !r.ok && r.status >= 500, status: r.status, paused: pausedOf(r) };
}
function pausedOf(r){ try { return !!(r && r.headers && r.headers.get && s(r.headers.get('x-gc-paused')) === '1'); } catch (e) { return false; } }   /* _lib/pause.js skipped it (data-entry mode) */
let sender = sendItem;
let afterSend = null;   /* hook (cust-release.js): a released text's Job Messages line loses its "Scheduled" label */

/* claim → send → mark. Only items this run claimed are sent; a claimed item is never sent by anyone else. */
async function sendClaimed(claimed, how){
  const out = [];
  for (const x of claimed.sort((a, b) => s(a.heldAt).localeCompare(s(b.heldAt)) || s(a.id).localeCompare(s(b.id)))) {
    let r; try { r = await run(how, () => sender(x)); } catch (e) { r = { ok: false, retry: false, error: s(e && e.message) }; }
    await cas(st => {
      const y = st.items.find(z => z.id === x.id); if (!y || y.claim !== x.claim) return false;
      y.tries = (y.tries || 0) + 1;
      if (r.ok) { y.status = r.paused ? 'skipped' : 'sent'; y.doneAt = iso(now()); y.how = how; if (r.paused) y.error = 'data-entry mode'; }
      else if (r.retry && y.tries < MAX_TRIES) { y.status = 'held'; y.error = s(r.error || r.status); }
      else { y.status = 'failed'; y.doneAt = iso(now()); y.error = s(r.error || r.status || 'not sent'); }
      delete y.claim; return true;
    });
    if (r.ok && !r.paused && afterSend) { try { await afterSend(x, how); } catch (e) {} }
    out.push({ id: x.id, kind: x.kind, ok: !!r.ok, paused: !!r.paused });
  }
  return out;
}
/* 7 AM: everything held whose time came, oldest first, each once. Idempotent: a second run finds nothing held. */
async function release(opts){
  opts = opts || {};
  const t = now();
  if (quiet(t) && !opts.force) return { ok: true, quiet: true, sent: 0, releaseAt: iso(nextRelease(t)) };
  const claim = 'r' + t.toString(36) + Math.random().toString(36).slice(2, 6);
  let claimed = [], notices = false;
  await cas(st => {
    let ch = false;
    st.items.forEach(x => {
      if (x.status === 'sending' && t - Date.parse(x.claimAt || 0) > STALE_MS) { x.status = 'failed'; x.error = 'stopped while sending — not sent again (check by hand)'; x.doneAt = iso(t); delete x.claim; ch = true; }
      if (x.status === 'held' && Date.parse(x.releaseAt || 0) <= t) { x.status = 'sending'; x.claim = claim; x.claimAt = iso(t); ch = true; }
    });
    if (st.notices) { notices = true; delete st.notices; ch = true; }
    claimed = st.items.filter(x => x.claim === claim).map(x => JSON.parse(JSON.stringify(x)));
    return ch;
  });
  const res = await sendClaimed(claimed, 'release');
  return { ok: true, sent: res.filter(x => x.ok).length, failed: res.filter(x => !x.ok).length, items: res, notices: notices };
}
/* an admin's "Send now (emergency)" for ONE held item */
async function sendNow(id){
  const t = now(), claim = 'n' + t.toString(36);
  let one = null;
  await cas(st => { const x = st.items.find(z => z.id === s(id)); if (!x || x.status !== 'held') return false; x.status = 'sending'; x.claim = claim; x.claimAt = iso(t); one = JSON.parse(JSON.stringify(x)); return true; });
  if (!one) return { ok: false, error: 'That one is not waiting any more (already sent?).' };
  const r = (await sendClaimed([one], 'override'))[0];
  return { ok: !!(r && r.ok), id: one.id, sent: !!(r && r.ok), error: r && r.ok ? '' : 'It did not go out.' };
}
/* the customer-notice e-mails waited for the morning: the release run asks notifyAll once */
async function noteNotices(){ try { await cas(st => { if (st.notices) return false; st.notices = true; return true; }); } catch (e) {} }
async function list(){ const cur = await store.read(); return load(cur.v).items; }

module.exports = { TZ, KEY, SAY, START_H, END_H, ALLOW, parts, hour, quiet, nextRelease, windowStart, heldNow, atCentral, off, run, ctx, tag, allowed,
  classify, decide, guard, hold, heldResponse, heldOf, release, sendNow, noteNotices, list, staffMail,
  _t: { setNow: f => { nowFn = f; }, setStore: st => { store = st || dbStore; }, setSender: f => { sender = f || sendItem; }, setAfterSend: f => { afterSend = f || null; }, memStore: function(){
    let row = null, n = 0;
    return { read: async () => row ? { exists: true, v: JSON.parse(JSON.stringify(row.v)), at: row.at } : { exists: false, v: null, at: '' },
      write: async (cur, v) => { if ((row ? row.at : '') !== cur.at) return false; row = { v: JSON.parse(JSON.stringify(v)), at: 't' + (++n) }; return true; }, peek: () => row && row.v };
  }, sendItem, dbStore },
  setAfterSend: f => { afterSend = f || null; } };
