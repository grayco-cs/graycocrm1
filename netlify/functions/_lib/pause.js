/* netlify/functions/_lib/pause.js — patch PAUSE: "⏸ Data-entry mode" (owner 10/23: "a button that stops all automatic
   everything … I need to enter all my data but don't want to send invoices to people that already got invoices").

   ONE RULE, enforced here at the lowest level (every function file installs it on its first line, so it wraps the
   global fetch before any other code of that bundle runs):
     While gc_kv "gc_automation_pause" has { on: true }, nothing leaves GrayCo for a customer, a sub, a GC or the public.
       • Resend e-mail (POST /emails, /emails/batch): sent ONLY when every to / cc / bcc address is @grayco-cs.com (or a
         subdomain such as in.grayco-cs.com) — staff alerts keep working; anything with an outside address is skipped.
       • Twilio (SMS / calls): skipped (a phone number cannot be told apart as staff).
       • Social posting / review replies: Facebook + Instagram (graph.facebook.com), TikTok (/post/), LinkedIn
         (api.linkedin.com), Google Business (mybusiness.googleapis.com), Ayrshare — every write skipped; reads go on.
       • Google Ads: ":mutate" skipped (the CRM never spends; reads go on).
       • QuickBooks writes (POST / DELETE to the QuickBooks API): refused with an error, so no fake QuickBooks id is ever
         recorded — the item simply stays "not in QuickBooks". Reads go on.
       • Any write (POST / PUT / PATCH / DELETE) to a host that is not on the known list below: refused (fail safe).
     A skipped send answers like the provider would on success (so nothing retries it later and nothing piles up for
     when the pause ends) with  paused: true, skipped: 'data-entry mode'  in the body, and logs one line.
     Not affected: reads, Supabase (incl. sign-in e-mails), our own sites / functions, AI services, CompanyCam,
     Autodesk, geocoding / solar, Turnstile, staff web-push (web-push only ever goes to staff phones).
   FAIL CLOSED: when the flag cannot be read (no service key, Supabase down, bad answer) the CRM counts as PAUSED.
   The flag is read only when something is about to be sent, and cached 30 s per function instance. */
'use strict';
const KEY = 'gc_automation_pause';
const CACHE_MS = 30 * 1000;
const STAFF_DOMAIN = /(^|\.)grayco-cs\.com$/i;
const ALLOW_WRITE_HOSTS = [
  /(^|\.)supabase\.co$/i, /(^|\.)grayco-cs\.com$/i, /(^|\.)netlify\.app$/i, /(^|\.)netlify\.com$/i,
  /^api\.anthropic\.com$/i, /^api\.openai\.com$/i, /^api\.deepgram\.com$/i,
  /(^|\.)companycam\.com$/i, /^developer\.api\.autodesk\.com$/i, /(^|\.)tracerfy\.com$/i,
  /^challenges\.cloudflare\.com$/i, /^oauth2\.googleapis\.com$/i, /^accounts\.google\.com$/i, /^www\.googleapis\.com$/i,
  /^solar\.googleapis\.com$/i, /^tile\.googleapis\.com$/i, /^maps\.googleapis\.com$/i, /^oauth\.platform\.intuit\.com$/i,
  /^www\.linkedin\.com$/i, /^tools\.brightlocal\.com$/i, /^localhost$/i, /^127\.0\.0\.1$/i
];
let state = { at: 0, paused: null, why: '' };

function s(v){ return v == null ? '' : String(v); }
function envHosts(){
  return ['URL', 'DEPLOY_URL', 'DEPLOY_PRIME_URL', 'CRM_URL', 'PORTAL_BASE_URL', 'SUPABASE_URL', 'SITE_URL'].map(function(k){
    try { return new URL(s(process.env[k])).hostname.toLowerCase(); } catch (e) { return ''; }
  }).filter(Boolean);
}
function sbEnv(){
  return { url: s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''),
           key: s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) };
}
function parseFlag(v){
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v && typeof v === 'object' ? v : null;
}
/* the flag, read with the service key straight from gc_kv; null row = not paused; anything unreadable = paused */
async function readFlag(){
  const e = sbEnv(), f = globalThis.fetch;   /* a GET to Supabase is never a "send", so the guard lets it through */
  if (!e.key) return { paused: true, why: 'the pause flag cannot be read (no SUPABASE_SERVICE_KEY) — failing closed' };
  try {
    const r = await f(e.url + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(KEY), { headers: { apikey: e.key, Authorization: 'Bearer ' + e.key } });
    if (!r || !r.ok) return { paused: true, why: 'the pause flag cannot be read (answer ' + (r && r.status) + ') — failing closed' };
    const rows = await r.json();
    if (!Array.isArray(rows)) return { paused: true, why: 'the pause flag answer was not a list — failing closed' };
    const v = rows[0] ? parseFlag(rows[0].value) : null;
    return { paused: !!(v && v.on), why: v && v.on ? 'data-entry mode is on' : '' , flag: v };
  } catch (err) { return { paused: true, why: 'the pause flag cannot be read (' + s(err && err.message) + ') — failing closed' }; }
}
async function isPaused(opts){
  if (!(opts && opts.fresh) && state.paused !== null && Date.now() - state.at < CACHE_MS) return state.paused;
  const r = await readFlag();
  state = { at: Date.now(), paused: r.paused, why: r.why, flag: r.flag || null };
  return r.paused;
}
function why(){ return state.why; }
function reset(){ state = { at: 0, paused: null, why: '' }; }

function addrList(v){
  const out = [];
  (Array.isArray(v) ? v : [v]).forEach(function(x){
    s(x).split(',').forEach(function(p){ const m = /<([^>]+)>/.exec(p); const a = (m ? m[1] : p).trim().toLowerCase(); if (a) out.push(a); });
  });
  return out;
}
function staffOnly(mail){
  const all = addrList(mail && mail.to).concat(addrList(mail && mail.cc), addrList(mail && mail.bcc));
  if (!all.length) return false;
  return all.every(function(a){ const d = a.split('@')[1] || ''; return STAFF_DOMAIN.test(d); });
}
function bodyText(opts){ const b = opts && opts.body; return typeof b === 'string' ? b : (b && typeof b.toString === 'function' && !(b instanceof ArrayBuffer) ? s(b) : ''); }
function bodyJson(opts){ try { return JSON.parse(bodyText(opts)); } catch (e) { return null; } }

/* what a request is: null = let it through; { kind, fake } = a send to skip while paused */
function classify(url, opts){
  let u; try { u = new URL(s(url)); } catch (e) { return null; }
  const host = u.hostname.toLowerCase(), path = u.pathname, method = s((opts && opts.method) || 'GET').toUpperCase();
  const write = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (!write) return null;
  const tag = 'paused-' + Date.now().toString(36);
  if (host === 'api.resend.com') {
    if (/^\/emails\/batch\/?$/.test(path)) {
      const list = bodyJson(opts);
      if (Array.isArray(list) && list.length && list.every(staffOnly)) return null;
      return { kind: 'e-mail (batch)', status: 200, fake: { data: (Array.isArray(list) ? list : [0]).map(function(_, i){ return { id: tag + '-' + i }; }) } };
    }
    if (/^\/emails\/?$/.test(path)) {
      if (staffOnly(bodyJson(opts))) return null;
      return { kind: 'e-mail', status: 200, fake: { id: tag } };
    }
    return null;   /* domains, receiving, … */
  }
  if (host === 'api.twilio.com') {
    if (/\/Calls(\.json)?$/i.test(path)) return { kind: 'phone call', status: 201, fake: { sid: 'CA' + tag, status: 'queued' } };
    return { kind: 'text message', status: 201, fake: { sid: 'SM' + tag, status: 'queued' } };
  }
  if (host === 'graph.facebook.com') return { kind: 'Facebook / Instagram post', status: 200, fake: { id: tag, post_id: tag } };
  if (host === 'open.tiktokapis.com') {
    if (/\/oauth\//.test(path)) return null;
    return { kind: 'TikTok post', status: 200, fake: { data: { publish_id: tag }, error: { code: 'ok', message: '' } } };
  }
  if (host === 'api.linkedin.com') return { kind: 'LinkedIn post', status: 201, fake: { id: 'urn:li:share:' + tag }, headers: { 'x-restli-id': 'urn:li:share:' + tag } };
  if (host === 'mybusiness.googleapis.com' || host === 'mybusinessbusinessinformation.googleapis.com') return { kind: 'Google Business post / reply', status: 200, fake: { name: 'paused/' + tag } };
  if (host === 'api.ayrshare.com') return { kind: 'social post (Ayrshare)', status: 200, fake: { status: 'success', id: tag, postIds: [] } };
  if (host === 'googleads.googleapis.com') { if (/:mutate/i.test(path)) return { kind: 'Google Ads change', status: 200, fake: { results: [] } }; return null; }
  if (/(^|\.)quickbooks\.api\.intuit\.com$/i.test(host)) return { kind: 'QuickBooks write', status: 503, fake: { Fault: { Error: [{ Message: 'Data-entry mode is on — nothing is sent to QuickBooks.', code: 'paused' }], type: 'paused' } } };
  if (ALLOW_WRITE_HOSTS.some(function(re){ return re.test(host); }) || envHosts().indexOf(host) > -1) return null;
  return { kind: 'outside call (' + host + ')', status: 503, fake: { error: 'Data-entry mode is on — outside calls are paused.' } };
}

function fakeResponse(c){
  const body = Object.assign({}, c.fake, { paused: true, skipped: 'data-entry mode' });
  const headers = Object.assign({ 'Content-Type': 'application/json', 'x-gc-paused': '1' }, c.headers || {});
  if (typeof Response === 'function') return new Response(JSON.stringify(body), { status: c.status, headers: headers });
  return { ok: c.status < 300, status: c.status, headers: { get: function(k){ return headers[k] || headers[s(k).toLowerCase()] || null; } }, json: async function(){ return body; }, text: async function(){ return JSON.stringify(body); } };
}
/* patch MAILALL: every e-mail / text the CRM itself sends (sent, paused or failed) goes into the admins' "🌐 All GrayCo
   e-mail" index — metadata only (from, to, subject, kind, job, status), never the body. Logged here, at the one place
   every send passes, so no function can be missed. A slow or broken index never holds a send up (0.8 s cap, errors ignored). */
function sendKind(url, opts){
  let u; try { u = new URL(s(url)); } catch (e) { return null; }
  const method = s((opts && opts.method) || 'GET').toUpperCase(); if (method !== 'POST') return null;
  const host = u.hostname.toLowerCase();
  if (host === 'api.resend.com' && /^\/emails\/batch\/?$/.test(u.pathname)) return 'batch';
  if (host === 'api.resend.com' && /^\/emails\/?$/.test(u.pathname)) return 'email';
  if (host === 'api.twilio.com' && /\/Messages(\.json)?$/i.test(u.pathname)) return 'sms';
  return null;
}
async function logSend(kind, opts, status, res){
  try {
    const X = require('./mailidx.js');
    let ids = [];
    try { const r = res && typeof res.clone === 'function' ? res.clone() : null; const j = r ? await r.json() : null; if (j) ids = j.sid ? [j.sid] : j.id ? [j.id] : Array.isArray(j.data) ? j.data.map(function(x){ return x && x.id; }) : []; } catch (e) {}
    let rows = [], payloads = [];
    if (kind === 'sms') { const p = {}; try { new URLSearchParams(bodyText(opts)).forEach(function(v, k){ p[k] = v; }); } catch (e) {} rows = [X.crmRow('sms', '', p, status, ids[0])]; payloads = [null]; }
    else if (kind === 'batch') { payloads = bodyJson(opts) || []; rows = payloads.map(function(m, i){ return X.crmRow('email', '', m, status, ids[i]); }); }
    else { payloads = [bodyJson(opts) || {}]; rows = [X.crmRow('email', '', payloads[0], status, ids[0])]; }
    /* patch SENTLOG: each e-mail's type, its body kept (we wrote it) and — when it asks for something — its follow-up */
    let SL = null; try { SL = require('./sentlog.js'); SL.decorate(rows, payloads); } catch (e) { SL = null; }
    await Promise.race([Promise.all([X.logCrmSend(rows), SL ? SL.onSent(rows, payloads).catch(function(){}) : null]), new Promise(function(r){ setTimeout(r, 1500); })]);
  } catch (e) {}
}
async function guardedFetch(raw, url, opts){
  const target = url && typeof url === 'object' && url.url ? url.url : url;
  const o = opts || (url && typeof url === 'object' && url.method ? { method: url.method } : undefined);
  const c = classify(target, o), lk = sendKind(target, o);
  if (c && await isPaused()) {
    let host = ''; try { host = new URL(s(target)).hostname; } catch (e) {}
    try { console.log('[pause] skipped ' + c.kind + ' → ' + host + ' (data-entry mode' + (state.why && !/data-entry mode is on/.test(state.why) ? '; ' + state.why : '') + ')'); } catch (e) {}
    const fake = fakeResponse(c);
    if (lk) await logSend(lk, o, 'paused', fake);
    return fake;
  }
  const res = await raw.call(globalThis, url, opts);
  if (lk) await logSend(lk, o, res && res.ok ? 'sent' : 'failed', res);
  return res;
}
/* install once per bundle: wraps the global fetch (the function files call this on their first line). Each wrapper
   keeps the fetch it wrapped, so a second install (another wrapper in between, e.g. brand.js) only checks twice. */
function install(){
  if (typeof globalThis.fetch !== 'function') return module.exports;
  if (globalThis.fetch && globalThis.fetch.__gcPause) return module.exports;
  const raw = globalThis.fetch;
  const g = function(url, opts){ return guardedFetch(raw, url, opts); };
  g.__gcPause = true; g.__gcRaw = raw;
  globalThis.fetch = g;
  return module.exports;
}
/* for code that holds its own fetch: true when this send must be skipped right now */
async function shouldSkip(url, opts){ return !!(classify(url, opts) && await isPaused()); }

module.exports = { install, isPaused, why, reset, classify, staffOnly, shouldSkip, KEY, _t: { readFlag, addrList, fakeResponse, sendKind, logSend } };
