/* ── GrayCo Marketing, part 2 — the server side (patch MKT2) ─────────────────────────────────────────
   Owner (22 Oct 2026): "yes 1 [Google Ads + Facebook in the Marketing tab], yes 2 [tracked links / QR / numbers],
   interested in 3 [pixels] … give option for PMs to make flyers for different neighborhoods … yes 6 for approvals
   [Google Business drafts] … I assume yes [city pages] … yes referral partner program for realtors, agents,
   managers … can you make me have a lot of ads I can always be posting in different places … yes 12 [lead magnet],
   yes 13 [yearly calendar], yes 14 [monthly newsletter] want to be able to edit it too".

   What lives here (each function file is a thin door onto it):
   * ADS — Google Ads + Meta (Facebook / Instagram): OAuth (refresh tokens kept ONLY in the service-only store
     gc_lead_inbox_kv "gc_ads_tokens"), a daily pull of spend / impressions / clicks / conversions per campaign into
     the Marketing records (gc_mkt_v1 "spend", origin google_api / meta_api, one record per campaign per month — the
     Dashboard's cost per lead / per job counts them) and "adcamps" (one per campaign: status, budget, 30-day totals).
     Changes to live ads (pause, resume, budget) are only made after ✅ Approvals (kind mkt_ad); when the platform
     refuses the write (no Basic access on the developer token, no ads_management), the office gets a to-do to make
     the change in Ads Manager by hand. New ads are drafts only (copy + "open Ads Manager").
   * TRACKED LINKS — crm.grayco-cs.com/go/<code> → the page with the UTM tags + gc=<code>; clicks counted in the
     service-only store ("gc_mkt_clicks"). A partner's code works as a link too.
   * TRACKING PHONE NUMBERS — Twilio numbers per source forward to the office; each call is logged (track-call.js).
   * SITE DATA — the public numbers the website may show (pixel IDs, completed jobs per city, testimonials the
     customer allowed). Never a name, address or price.
   * REFERRAL PARTNERS (realtors, insurance agents, property managers) — partner records in gc_mkt_v1 "partners";
     a magic-link dashboard (partner.html + partner-portal.js); partner leads are tagged; payouts only after
     ✅ Approvals (kind mkt_payout).
   * NEWSLETTER SIGN-UPS — lead-magnet downloads join GrayCo News (service-only "gc_news_signups"; the unsubscribe
     list still wins — news.js sendNews).
   * THE MONTHLY NEWSLETTER DRAFT — a campaign record (kind newsletter) the office edits, then sends for approval. */
'use strict';
const crypto = require('crypto');

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function num(v){ const x = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(x) ? x : 0; }
function env(k){ return s(process.env[k]); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
let nowFn = function(){ return Date.now(); };
function nowIso(){ return new Date(nowFn()).toISOString(); }
function site(){ return (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function web(){ return (env('WEBSITE_URL') || 'https://grayco-cs.com').replace(/\/$/, ''); }
function M(){ return require('./mkt.js'); }
function L(){ return require('../bid-inbox.js')._lib; }
function rec(doc, coll, id){ const r = doc && doc[coll] && doc[coll][id]; return r && !r.del ? r : null; }
function recs(doc, coll){ const m = (doc && doc[coll]) || {}; return Object.keys(m).map(function(k){ return m[k]; }).filter(function(r){ return r && !r.del; }); }
function cfg(doc){ return rec(doc, 'cfg', 'main') || {}; }
function secret(tag){ const own = env('MKT2_SECRET'); const k = own.length >= 16 ? own : (env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')); return k ? crypto.createHmac('sha256', k).update('gc-mkt2-' + tag).digest() : null; }
function hmac(tag, data){ const k = secret(tag); return k ? crypto.createHmac('sha256', k).update(String(data)).digest('base64url') : ''; }
function same(a, b){ a = Buffer.from(s(a)); b = Buffer.from(s(b)); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); }

/* ══════════════════ 1. TRACKED LINKS ══════════════════ */
const CODE_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
function cleanCode(c){ c = low(c).replace(/[^a-z0-9-]/g, '').slice(0, 40); return CODE_RE.test(c) ? c : ''; }
function withParams(url, p){
  let u = s(url) || web(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  const hash = u.indexOf('#') >= 0 ? u.slice(u.indexOf('#')) : ''; if (hash) u = u.slice(0, u.indexOf('#'));
  const q = Object.keys(p).filter(function(k){ return s(p[k]); }).map(function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(s(p[k])); });
  return (q.length ? u + (u.indexOf('?') >= 0 ? '&' : '?') + q.join('&') : u) + hash;
}
/* where /go/<code> sends a visitor (null: unknown code) */
function linkTarget(doc, code){
  code = cleanCode(code); if (!code) return null;
  const l = rec(doc, 'links', code);
  if (l) return { kind: 'link', code: code, url: withParams(l.dest || web(), { utm_source: l.src || l.kind || 'grayco', utm_medium: l.med || l.kind || 'offline', utm_campaign: l.camp || code, utm_content: l.content || '', gc: code }) };
  const p = recs(doc, 'partners').find(function(x){ return low(x.code) === code && x.status === 'active'; });
  if (p) return { kind: 'partner', code: code, url: withParams(web() + '/#contact', { utm_source: 'partner', utm_medium: 'referral', utm_campaign: 'partner-' + code, ref: p.code }) };
  return null;
}
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|linkedin|embedly|curl|wget|python|monitor/i;
async function countClick(code, ua){
  if (BOT.test(s(ua))) return false;
  const day = nowIso().slice(0, 10);
  await L().kvCas('gc_mkt_clicks', function(v){
    v = v && typeof v === 'object' ? v : {};
    const c = v[code] || (v[code] = { n: 0, days: {} });
    c.n = (+c.n || 0) + 1; c.last = nowIso(); c.days = c.days || {}; c.days[day] = (+c.days[day] || 0) + 1;
    const keep = Object.keys(c.days).sort().slice(-120), d2 = {}; keep.forEach(function(k){ d2[k] = c.days[k]; }); c.days = d2;
    return v;
  });
  return true;
}
async function clicks(){ try { return (await L().kvGet('gc_mkt_clicks')) || {}; } catch (e) { return {}; } }

/* ══════════════════ 2. TRACKING PHONE NUMBERS (Twilio) ══════════════════ */
function e164(v){ const d = s(v).replace(/\D/g, ''); return d.length === 10 ? '+1' + d : d.length === 11 && d[0] === '1' ? '+' + d : ''; }
function trackNumber(doc, to){ const t = e164(to); return arr(cfg(doc).trackNumbers).find(function(x){ return x && e164(x.number) === t; }) || null; }
function forwardTo(doc){ return e164(env('TRACK_FORWARD_TO')) || e164(cfg(doc).trackForward) || '+19015850944'; }
async function logCall(c){
  await L().kvCas('gc_mkt_calls', function(v){ v = arr(v); v.push(c); return v.slice(-2000); });
}
async function calls(){ try { return arr(await L().kvGet('gc_mkt_calls')); } catch (e) { return []; } }

/* ══════════════════ 3. ADS: Google Ads + Meta ══════════════════ */
const G_VER = function(){ return env('GOOGLE_ADS_API_VERSION') || 'v21'; };
const FB_VER = function(){ return env('META_API_VERSION') || 'v21.0'; };
function gConfigured(){ return !!(env('GOOGLE_ADS_DEVELOPER_TOKEN') && (env('GOOGLE_ADS_CLIENT_ID') || env('GOOGLE_CLIENT_ID')) && (env('GOOGLE_ADS_CLIENT_SECRET') || env('GOOGLE_CLIENT_SECRET'))); }
function gClient(){ return { id: env('GOOGLE_ADS_CLIENT_ID') || env('GOOGLE_CLIENT_ID'), secret: env('GOOGLE_ADS_CLIENT_SECRET') || env('GOOGLE_CLIENT_SECRET') }; }
function mConfigured(){ return !!(env('META_SYSTEM_TOKEN') || (env('META_APP_ID') && env('META_APP_SECRET'))); }
function redirectUri(){ return site() + '/.netlify/functions/ads?callback=1'; }
async function tokens(){ try { return (await L().kvGet('gc_ads_tokens')) || {}; } catch (e) { return {}; } }
async function saveTokens(plat, t){ await L().kvCas('gc_ads_tokens', function(v){ v = v && typeof v === 'object' ? v : {}; v[plat] = Object.assign({}, v[plat] || {}, t); return v; }); }
async function forget(plat){ await L().kvCas('gc_ads_tokens', function(v){ v = v && typeof v === 'object' ? v : {}; if (!v[plat]) return undefined; delete v[plat]; return v; }); }
async function adsStatus(){
  const t = await tokens();
  const g = t.google || {}, m = t.meta || {};
  return {
    google: { configured: gConfigured(), connected: !!(g.refresh), customers: arr(g.customers).map(function(c){ return { id: c.id, name: c.name || '' }; }), connectedAt: s(g.connectedAt), by: s(g.by), lastSync: s(g.lastSync), lastError: s(g.lastError),
      canWrite: g.canWrite !== false },
    meta: { configured: mConfigured(), connected: !!(m.token || env('META_SYSTEM_TOKEN')), system: !!env('META_SYSTEM_TOKEN'), accounts: arr(m.accounts).map(function(a){ return { id: a.id, name: a.name || '' }; }), connectedAt: s(m.connectedAt), by: s(m.by),
      expiresAt: s(m.expiresAt), lastSync: s(m.lastSync), lastError: s(m.lastError) }
  };
}
/* the OAuth "state": who started it, when, which platform — signed, 15 minutes */
function makeState(plat, email){ const body = Buffer.from(JSON.stringify({ p: plat, e: low(email), t: nowFn() })).toString('base64url'); return body + '.' + hmac('oauth', body); }
function readState(st){
  const i = s(st).lastIndexOf('.'); if (i < 1) return null;
  const body = st.slice(0, i); if (!same(st.slice(i + 1), hmac('oauth', body))) return null;
  let o; try { o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!o || nowFn() - (+o.t || 0) > 15 * 60e3) return null;
  return o;
}
function authUrl(plat, email){
  const st = makeState(plat, email);
  if (plat === 'google') {
    if (!gConfigured()) return '';
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + ['client_id=' + encodeURIComponent(gClient().id), 'redirect_uri=' + encodeURIComponent(redirectUri()), 'response_type=code',
      'scope=' + encodeURIComponent('https://www.googleapis.com/auth/adwords'), 'access_type=offline', 'prompt=consent', 'state=' + encodeURIComponent(st)].join('&');
  }
  if (plat === 'meta') {
    if (!(env('META_APP_ID') && env('META_APP_SECRET'))) return '';
    return 'https://www.facebook.com/' + FB_VER() + '/dialog/oauth?' + ['client_id=' + encodeURIComponent(env('META_APP_ID')), 'redirect_uri=' + encodeURIComponent(redirectUri()),
      'scope=' + encodeURIComponent('ads_read,ads_management,business_management'), 'state=' + encodeURIComponent(st)].join('&');
  }
  return '';
}
async function jfetch(url, opts){
  const r = await fetch(url, opts || {}); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { j = null; }
  return { ok: r.ok, status: r.status, j: j, t: t.slice(0, 600) };
}
function apiErr(r){ const j = r.j || {}; const e = Array.isArray(j) ? j[0] && j[0].error : j.error; return s((e && (e.message || e.error_user_msg)) || (typeof e === 'string' ? e : '') || r.t).slice(0, 300) || ('HTTP ' + r.status); }
async function callback(q){
  const st = readState(q.state);
  if (!st) return { ok: false, error: 'This sign-in link expired. Start again from Marketing → Ads hub.' };
  if (q.error) return { ok: false, error: s(q.error_description || q.error) };
  if (!s(q.code)) return { ok: false, error: 'No code came back.' };
  if (st.p === 'google') {
    const c = gClient();
    const r = await jfetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: ['code=' + encodeURIComponent(q.code), 'client_id=' + encodeURIComponent(c.id), 'client_secret=' + encodeURIComponent(c.secret), 'redirect_uri=' + encodeURIComponent(redirectUri()), 'grant_type=authorization_code'].join('&') });
    if (!r.ok || !r.j || !r.j.refresh_token) return { ok: false, error: 'Google did not give a refresh token: ' + apiErr(r) };
    await saveTokens('google', { refresh: r.j.refresh_token, connectedAt: nowIso(), by: st.e, lastError: '' });
    try { await googleCustomers(true); } catch (e) {}
    return { ok: true, platform: 'Google Ads' };
  }
  if (st.p === 'meta') {
    const base = 'https://graph.facebook.com/' + FB_VER() + '/oauth/access_token?';
    const r = await jfetch(base + ['client_id=' + encodeURIComponent(env('META_APP_ID')), 'redirect_uri=' + encodeURIComponent(redirectUri()), 'client_secret=' + encodeURIComponent(env('META_APP_SECRET')), 'code=' + encodeURIComponent(q.code)].join('&'));
    if (!r.ok || !r.j || !r.j.access_token) return { ok: false, error: 'Facebook did not give a token: ' + apiErr(r) };
    const r2 = await jfetch(base + ['grant_type=fb_exchange_token', 'client_id=' + encodeURIComponent(env('META_APP_ID')), 'client_secret=' + encodeURIComponent(env('META_APP_SECRET')), 'fb_exchange_token=' + encodeURIComponent(r.j.access_token)].join('&'));
    const tok = (r2.ok && r2.j && r2.j.access_token) || r.j.access_token, exp = (r2.j && +r2.j.expires_in) || (+r.j.expires_in || 3600);
    await saveTokens('meta', { token: tok, expiresAt: new Date(nowFn() + exp * 1000).toISOString(), connectedAt: nowIso(), by: st.e, lastError: '' });
    try { await metaAccounts(true); } catch (e) {}
    return { ok: true, platform: 'Facebook / Instagram' };
  }
  return { ok: false, error: 'Unknown platform.' };
}
/* Google: an access token from the refresh token */
async function gAccess(){
  const t = (await tokens()).google || {}; if (!t.refresh) throw new Error('Google Ads is not connected.');
  const c = gClient();
  const r = await jfetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: ['client_id=' + encodeURIComponent(c.id), 'client_secret=' + encodeURIComponent(c.secret), 'refresh_token=' + encodeURIComponent(t.refresh), 'grant_type=refresh_token'].join('&') });
  if (!r.ok || !r.j || !r.j.access_token) throw new Error('Google sign-in failed: ' + apiErr(r));
  return r.j.access_token;
}
function gHeaders(at){
  const h = { Authorization: 'Bearer ' + at, 'developer-token': env('GOOGLE_ADS_DEVELOPER_TOKEN'), 'Content-Type': 'application/json' };
  const lc = env('GOOGLE_ADS_LOGIN_CUSTOMER_ID').replace(/\D/g, ''); if (lc) h['login-customer-id'] = lc;
  return h;
}
const GBASE = function(){ return 'https://googleads.googleapis.com/' + G_VER(); };
async function googleCustomers(save){
  const fixed = env('GOOGLE_ADS_CUSTOMER_ID').split(',').map(function(x){ return x.replace(/\D/g, ''); }).filter(Boolean);
  let ids = fixed;
  if (!ids.length) {
    const at = await gAccess();
    const r = await jfetch(GBASE() + '/customers:listAccessibleCustomers', { headers: gHeaders(at) });
    if (!r.ok) throw new Error('Google Ads: ' + apiErr(r));
    ids = arr(r.j && r.j.resourceNames).map(function(n){ return s(n).replace(/^customers\//, ''); });
  }
  const list = ids.slice(0, 10).map(function(id){ return { id: id }; });
  if (save) await saveTokens('google', { customers: list });
  return list;
}
async function gQuery(at, cid, query){
  const r = await jfetch(GBASE() + '/customers/' + cid + '/googleAds:searchStream', { method: 'POST', headers: gHeaders(at), body: JSON.stringify({ query: query }) });
  if (!r.ok) throw new Error('Google Ads: ' + apiErr(r));
  const out = []; arr(r.j).forEach(function(b){ arr(b && b.results).forEach(function(x){ out.push(x); }); });
  return out;
}
/* → [{ platform, campaignId, name, status, budget (per day $), budgetRef, date, spend, impressions, clicks, conversions, account }] */
async function googlePull(days){
  const at = await gAccess(); let cust = ((await tokens()).google || {}).customers;
  if (!arr(cust).length) cust = await googleCustomers(true);
  const out = [], dur = days <= 7 ? 'LAST_7_DAYS' : 'LAST_30_DAYS';
  for (const c of arr(cust)) {
    const rows = await gQuery(at, c.id, 'SELECT campaign.id, campaign.name, campaign.status, campaign.campaign_budget, campaign_budget.amount_micros, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date DURING ' + dur);
    rows.forEach(function(x){
      const cp = x.campaign || {}, mt = x.metrics || {}, b = x.campaignBudget || {};
      out.push({ platform: 'google', account: c.id, campaignId: s(cp.id), name: s(cp.name), status: s(cp.status), budget: num(b.amountMicros) / 1e6, budgetRef: s(cp.campaignBudget),
        date: s(x.segments && x.segments.date), spend: num(mt.costMicros) / 1e6, impressions: num(mt.impressions), clicks: num(mt.clicks), conversions: num(mt.conversions) });
    });
  }
  return out;
}
async function metaToken(){
  if (env('META_SYSTEM_TOKEN')) return env('META_SYSTEM_TOKEN');
  const t = (await tokens()).meta || {}; if (!t.token) throw new Error('Facebook / Instagram ads are not connected.');
  if (t.expiresAt && Date.parse(t.expiresAt) < nowFn()) throw new Error('The Facebook connection expired — connect again in Marketing → Ads hub.');
  return t.token;
}
const FBASE = function(){ return 'https://graph.facebook.com/' + FB_VER(); };
async function metaAccounts(save){
  const fixed = env('META_AD_ACCOUNT_ID').split(',').map(function(x){ x = s(x).replace(/^act_/, '').replace(/\D/g, ''); return x; }).filter(Boolean);
  let list = fixed.map(function(id){ return { id: id }; });
  if (!list.length) {
    const tok = await metaToken();
    const r = await jfetch(FBASE() + '/me/adaccounts?fields=account_id,name,account_status&limit=25&access_token=' + encodeURIComponent(tok));
    if (!r.ok) throw new Error('Facebook: ' + apiErr(r));
    list = arr(r.j && r.j.data).map(function(a){ return { id: s(a.account_id || s(a.id).replace(/^act_/, '')), name: s(a.name) }; });
  }
  if (save) await saveTokens('meta', { accounts: list.slice(0, 10) });
  return list;
}
async function metaPull(days){
  const tok = await metaToken(); let acc = ((await tokens()).meta || {}).accounts;
  if (!arr(acc).length) acc = await metaAccounts(true);
  const out = [];
  for (const a of arr(acc)) {
    const r = await jfetch(FBASE() + '/act_' + a.id + '/insights?level=campaign&time_increment=1&date_preset=' + (days <= 7 ? 'last_7d' : 'last_30d') +
      '&fields=campaign_id,campaign_name,spend,impressions,clicks,actions&limit=500&access_token=' + encodeURIComponent(tok));
    if (!r.ok) throw new Error('Facebook: ' + apiErr(r));
    const st = await jfetch(FBASE() + '/act_' + a.id + '/campaigns?fields=id,name,effective_status,daily_budget&limit=200&access_token=' + encodeURIComponent(tok));
    const by = {}; arr(st.j && st.j.data).forEach(function(c){ by[s(c.id)] = c; });
    arr(r.j && r.j.data).forEach(function(x){
      const lead = arr(x.actions).filter(function(y){ return /lead|contact|submit_application|complete_registration/.test(s(y.action_type)); }).reduce(function(t, y){ return t + num(y.value); }, 0);
      const c = by[s(x.campaign_id)] || {};
      out.push({ platform: 'meta', account: a.id, campaignId: s(x.campaign_id), name: s(x.campaign_name), status: s(c.effective_status), budget: num(c.daily_budget) / 100, budgetRef: s(x.campaign_id),
        date: s(x.date_start), spend: num(x.spend), impressions: num(x.impressions), clicks: num(x.clicks), conversions: lead });
    });
    Object.keys(by).forEach(function(id){ if (!out.some(function(o){ return o.campaignId === id; })) out.push({ platform: 'meta', account: a.id, campaignId: id, name: s(by[id].name), status: s(by[id].effective_status), budget: num(by[id].daily_budget) / 100, budgetRef: id, date: '', spend: 0, impressions: 0, clicks: 0, conversions: 0 }); });
  }
  return out;
}
/* rows → the Marketing records: spend (per campaign per month) + adcamps (per campaign) */
function toRecords(rows){
  const spend = {}, camps = {};
  rows.forEach(function(x){
    const ck = x.platform + '_' + x.campaignId;
    const c = camps[ck] || (camps[ck] = { id: ck, platform: x.platform, account: x.account, campaignId: x.campaignId, name: x.name, status: x.status, budget: x.budget, budgetRef: x.budgetRef, spend30: 0, impressions30: 0, clicks30: 0, conversions30: 0, origin: 'api' });
    c.spend30 += x.spend; c.impressions30 += x.impressions; c.clicks30 += x.clicks; c.conversions30 += x.conversions;
    if (x.name) c.name = x.name; if (x.status) c.status = x.status; if (x.budget) c.budget = x.budget;
    if (!x.date) return;
    const mo = x.date.slice(0, 7), sk = 'api_' + ck + '_' + mo;
    const r = spend[sk] || (spend[sk] = { id: sk, origin: x.platform === 'google' ? 'google_api' : 'meta_api', channel: x.platform === 'google' ? 'Google Ads' : 'Facebook/Instagram Ads', campaign: x.name || x.campaignId, campaignId: x.campaignId,
      month: mo, date: mo + '-01', amount: 0, impressions: 0, clicks: 0, conversions: 0, days: {} });
    r.days[x.date] = { a: x.spend, i: x.impressions, c: x.clicks, v: x.conversions };
  });
  Object.keys(spend).forEach(function(k){ const r = spend[k]; Object.keys(r.days).forEach(function(d){ const v = r.days[d]; r.amount += v.a; r.impressions += v.i; r.clicks += v.c; r.conversions += v.v; }); r.amount = Math.round(r.amount * 100) / 100; delete r.days; });
  Object.keys(camps).forEach(function(k){ const c = camps[k]; c.spend30 = Math.round(c.spend30 * 100) / 100; });
  return { spend: spend, camps: camps };
}
/* pull both platforms; a month already in the records is replaced only by fresher API numbers (days merged by month) */
async function syncAds(o){
  o = o || {}; const days = o.days || 30, out = { google: null, meta: null };
  const all = [];
  for (const plat of ['google', 'meta']) {
    const st = await adsStatus();
    if (!st[plat].connected) { out[plat] = { skipped: 'not connected' }; continue; }
    try {
      const rows = plat === 'google' ? await googlePull(days) : await metaPull(days);
      rows.forEach(function(x){ all.push(x); });
      out[plat] = { ok: true, rows: rows.length };
      await saveTokens(plat, { lastSync: nowIso(), lastError: '' });
    } catch (e) { out[plat] = { ok: false, error: s(e && e.message).slice(0, 300) }; await saveTokens(plat, { lastError: s(e && e.message).slice(0, 300), lastErrorAt: nowIso() }); }
  }
  if (!all.length) return out;
  /* a 30-day pull covers part of last month: keep the older days of that month (from the earlier record) */
  const R = toRecords(all), monthsPulled = {};
  Object.keys(R.spend).forEach(function(k){ monthsPulled[k] = 1; });
  const w = await M().update(function(doc){
    const ch = [];
    Object.keys(R.spend).forEach(function(k){
      const old = rec(doc, 'spend', k), nw = R.spend[k];
      const firstDay = all.filter(function(x){ return x.date; }).map(function(x){ return x.date; }).sort()[0] || '';
      if (old && firstDay > nw.month + '-01' && num(old.amount) > nw.amount) return;   /* an older month we only see a tail of */
      (doc.spend = doc.spend || {})[k] = Object.assign({}, old || {}, nw); ch.push(['spend', k]);
    });
    Object.keys(R.camps).forEach(function(k){ (doc.adcamps = doc.adcamps || {})[k] = Object.assign({}, rec(doc, 'adcamps', k) || {}, R.camps[k], { syncedAt: nowIso() }); ch.push(['adcamps', k]); });
    return ch;
  });
  out.saved = !!w.ok;
  return out;
}
/* an APPROVED change (adchanges record) → the platform; { ok, applied, error } */
async function applyChange(r){
  const action = s(r.action), plat = s(r.platform);
  try {
    if (plat === 'google') {
      const at = await gAccess(), cid = s(r.account).replace(/\D/g, ''), id = s(r.campaignId).replace(/\D/g, '');
      if (!cid || !id) return { ok: false, error: 'missing account / campaign' };
      let resp;
      if (action === 'pause' || action === 'enable') {
        resp = await jfetch(GBASE() + '/customers/' + cid + '/campaigns:mutate', { method: 'POST', headers: gHeaders(at),
          body: JSON.stringify({ operations: [{ update: { resourceName: 'customers/' + cid + '/campaigns/' + id, status: action === 'pause' ? 'PAUSED' : 'ENABLED' }, updateMask: 'status' }] }) });
      } else if (action === 'budget') {
        const ref = s(r.budgetRef); if (!/^customers\/\d+\/campaignBudgets\/\d+$/.test(ref)) return { ok: false, error: 'no budget reference — sync first' };
        resp = await jfetch(GBASE() + '/customers/' + cid + '/campaignBudgets:mutate', { method: 'POST', headers: gHeaders(at),
          body: JSON.stringify({ operations: [{ update: { resourceName: ref, amountMicros: String(Math.round(num(r.amount) * 1e6)) }, updateMask: 'amount_micros' }] }) });
      } else return { ok: false, error: 'unknown change' };
      if (!resp.ok) return { ok: false, error: 'Google Ads refused: ' + apiErr(resp) };
      return { ok: true, applied: true };
    }
    if (plat === 'meta') {
      const tok = await metaToken(), id = s(r.campaignId).replace(/\D/g, '');
      if (!id) return { ok: false, error: 'missing campaign' };
      const body = action === 'pause' ? 'status=PAUSED' : action === 'enable' ? 'status=ACTIVE' : action === 'budget' ? 'daily_budget=' + Math.round(num(r.amount) * 100) : '';
      if (!body) return { ok: false, error: 'unknown change' };
      const resp = await jfetch(FBASE() + '/' + id, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body + '&access_token=' + encodeURIComponent(tok) });
      if (!resp.ok) return { ok: false, error: 'Facebook refused: ' + apiErr(resp) };
      return { ok: true, applied: true };
    }
  } catch (e) { return { ok: false, error: s(e && e.message).slice(0, 300) }; }
  return { ok: false, error: 'unknown platform' };
}
/* AI ad copy within the platform limits (Google RSA: headlines ≤ 30, descriptions ≤ 90; Meta: primary text, headline ≤ 40) */
const LIMITS = { google: { headline: 30, description: 90, nH: 10, nD: 4 }, meta: { headline: 40, primary: 300, nH: 5, nD: 3 } };
function fit(list, max, n){ const seen = {}; return arr(list).map(function(x){ x = s(x).replace(/\s+/g, ' '); if (x.length > max) x = x.slice(0, max).replace(/\s+\S*$/, ''); return x; }).filter(function(x){ if (!x || seen[low(x)]) return false; seen[low(x)] = 1; return true; }).slice(0, n); }
async function draftCopy(o){
  o = o || {}; const plat = o.platform === 'meta' ? 'meta' : 'google', lim = LIMITS[plat];
  const facts = 'GrayCo Construction Services, ' + require('./brand.js').companyAddress() + ', (901) 585-0944, licensed general contractor (TN #85034 BCB). Services: roofing, roof repair, storm and insurance restoration, water mitigation, remodeling, maintenance plans. Warranty: 5 years on roofing and insurance work, 1 year on other work. Areas: Bartlett, Memphis, Germantown, Collierville, Cordova, Arlington, Lakeland, DeSoto County.';
  const ask = 'Write ' + (plat === 'google' ? 'a Google Ads responsive search ad: ' + lim.nH + ' headlines (max ' + lim.headline + ' characters each) and ' + lim.nD + ' descriptions (max ' + lim.description + ' characters each)'
    : 'Facebook / Instagram ad copy: ' + lim.nD + ' primary texts (max ' + lim.primary + ' characters) and ' + lim.nH + ' headlines (max ' + lim.headline + ' characters). Facebook home-improvement ads run in the Housing special category: no wording about age, gender, family or who the reader is') +
    ' for: ' + (s(o.service) || 'roof replacement') + (s(o.city) ? ' in ' + s(o.city) + ', TN' : '') + (s(o.offer) ? '. Offer: ' + s(o.offer) : '') +
    '. Facts you may use (use NOTHING else; no prices, no percentages, no "#1", no review counts, no years in business unless given): ' + facts + ' Return JSON {"headlines":[],"descriptions":[]}.';
  let out = null;
  try {
    const AI = require('./ai.js');
    if (AI.ready()) { const r = await AI.ask({ content: [{ type: 'text', text: ask }], maxTokens: 1200, timeoutMs: 20000 }); out = r && r.ok ? (r.out || AI.parseLoose(r.text)) : null; }
  } catch (e) { out = null; }
  const svc = s(o.service) || 'Roof Replacement', city = s(o.city);
  const base = plat === 'google' ? {
    headlines: [svc + (city ? ' ' + city : ''), 'GrayCo Construction', 'Licensed TN Contractor', 'Free Estimates', '5-Year Roofing Warranty', 'Storm Damage? Call Us', 'Insurance Claim Help', 'Local Bartlett Contractor', 'Call (901) 585-0944', 'Book Your Free Inspection'],
    descriptions: ['GrayCo Construction Services — licensed TN general contractor. Free estimates. Call (901) 585-0944.', '5-year warranty on roofing and insurance work. Serving Bartlett, Memphis, Germantown and Collierville.', 'Storm or water damage? We help with your insurance claim from inspection to final repair.', 'Local contractor at ' + require('./brand.js').companyStreet() + ', Bartlett. Book a free inspection today.'] }
    : { headlines: ['Free Roof Inspection', 'Storm Damage? We Can Help', svc, 'GrayCo Construction', 'Book a Free Estimate'],
      descriptions: [svc + ' by GrayCo Construction Services — a licensed Tennessee general contractor. Free estimates. 5-year warranty on roofing and insurance work. Call (901) 585-0944.',
        'Storm or water damage? GrayCo helps from the first inspection through the insurance claim to the final repair. Serving the Memphis area.', 'Local, licensed and right here in Bartlett. Book your free inspection with GrayCo today.'] };
  const src = out && arr(out.headlines).length ? out : base;
  return { ok: true, ai: !!(out && arr(out.headlines).length), platform: plat,
    headlines: fit(src.headlines, lim.headline, lim.nH), descriptions: fit(src.descriptions || src.primary || src.primaryTexts, plat === 'google' ? lim.description : lim.primary, lim.nD), limits: lim };
}

/* ══════════════════ 4. PUBLIC SITE DATA (pixels, counts, testimonials) ══════════════════ */
const CITIES = ['Bartlett', 'Memphis', 'Germantown', 'Collierville', 'Cordova', 'Arlington', 'Lakeland', 'Millington', 'Olive Branch', 'Southaven', 'Horn Lake', 'Oakland'];
function cityKey(addr){ const a = low(addr); const c = CITIES.find(function(x){ return a.indexOf(low(x)) >= 0; }); return c ? low(c).replace(/\s+/g, '-') : ''; }
function doneJob(p){ return p && p.deleted !== true && /^(completed?|closed|paid|finished)/i.test(s(p.status)); }
function kindKey(p){ const t = low([p.type, p.jobType, p.projectType, p.category, p.name].join(' ')); if (/roof/.test(t)) return 'roofing'; if (/water|mitigat|dry/.test(t)) return 'water-mitigation'; if (p.isInsurance === true || /insur|claim|storm|fire|restor/.test(t)) return 'storm-restoration'; if (/remodel|kitchen|bath|floor|renov/.test(t)) return 'remodeling'; return 'other'; }
const CACHE = { at: 0, v: null };
async function siteData(){
  if (CACHE.v && nowFn() - CACHE.at < 3600e3) return CACHE.v;
  let doc = {}, data = {};
  try { doc = await M().readDoc(); } catch (e) {}
  try { data = await M().crmData(['projects']); } catch (e) {}
  const c = cfg(doc), px = c.pixels || {};
  const stats = { total: 0, cities: {}, services: {} };
  arr(data.projects).forEach(function(p){
    if (!doneJob(p)) return; stats.total++;
    const ck = cityKey(p.address || p.jobAddress), kk = kindKey(p);
    if (ck) { const x = stats.cities[ck] || (stats.cities[ck] = { total: 0 }); x.total++; x[kk] = (x[kk] || 0) + 1; }
    stats.services[kk] = (stats.services[kk] || 0) + 1;
  });
  const tm = recs(doc, 'testimonials').filter(function(t){ return t.permission === true && (t.approved === true || /^(approved|ok|use)/i.test(s(t.status))) && s(t.text); })
    .slice(-30).map(function(t){ const nm = s(t.name).split(/\s+/); return { text: s(t.text).slice(0, 600), name: nm[0] + (nm[1] ? ' ' + nm[1][0] + '.' : ''), city: s(t.city), service: s(t.service) }; });
  /* patch MKT2 (owner 22): the city pages' own text — only what an admin approved — and job photos the customer allowed */
  const pages = {}; recs(doc, 'citypages').forEach(function(pg){ const a = pg.approved; if (!a || !/^[a-z0-9-]{3,80}$/.test(s(pg.id))) return; pages[pg.id] = { headline: s(a.headline).slice(0, 140), intro: s(a.intro).slice(0, 1200), body: s(a.body).slice(0, 4000) }; });
  const photos = {}; try {
    const perm = {}; recs(doc, 'perms').forEach(function(x){ if (x.jobId && x.marketing === true) perm[x.jobId] = 1; });
    const pj = {}; arr(data.projects).forEach(function(p){ if (p && (perm[p.id] || p.marketingOk === true || p.mktPhotoOk === true) && doneJob(p)) pj[p.id] = p; });
    let ph = []; if (Object.keys(pj).length) { try { ph = arr((await M().crmData(['gc_photos'])).gc_photos); } catch (e) {} }
    for (const r of ph) {
      const p = r && pj[s(r.jobId)]; if (!p || r.deleted === true || !s(r.ref) || /damage/i.test(s(r.tag))) continue;
      const ck = cityKey(p.address || p.jobAddress) || 'other'; const l = photos[ck] || (photos[ck] = []); if (l.length >= 8 || l.some(function(x){ return x.job === p.id; })) continue;
      const u = await M().signRef(r.ref, 7 * 86400); if (u) l.push({ url: u, service: kindKey(p), job: p.id });
    }
    Object.keys(photos).forEach(function(k){ photos[k].forEach(function(x){ delete x.job; }); });
  } catch (e) {}
  CACHE.v = { ok: true, pages: pages, photos: photos, pixels: { gtag: /^G-[A-Z0-9]{4,}$/.test(s(px.gtag)) ? s(px.gtag) : '', ads: /^AW-\d{5,}(\/[\w-]+)?$/.test(s(px.ads)) ? s(px.ads) : '', meta: /^\d{8,20}$/.test(s(px.meta)) ? s(px.meta) : '' },
    stats: stats, testimonials: tm, at: nowIso() };
  CACHE.at = nowFn();
  return CACHE.v;
}

/* ══════════════════ 5. REFERRAL PARTNERS ══════════════════ */
const PARTNER_TYPES = { realtor: 'Realtor', insurance: 'Insurance agent', property: 'Property manager', other: 'Other partner' };
function partnerType(v){ v = low(v); if (/realt|agent.*real|broker/.test(v)) return 'realtor'; if (/insur/.test(v)) return 'insurance'; if (/propert|manag|landlord|hoa/.test(v)) return 'property'; return PARTNER_TYPES[v] ? v : 'other'; }
function newCode(name, type, taken){
  const pre = { realtor: 'RE', insurance: 'IN', property: 'PM', other: 'GP' }[type] || 'GP';
  const base = s(name).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6) || 'PART';
  for (let i = 0; i < 50; i++) { const c = pre + '-' + base + (i ? i + 1 : ''); if (!taken[low(c)]) return c; }
  return pre + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}
function feeFor(p, c){ const f = num(p && p.fee); if (f > 0) return f; const t = (c && c.partnerFees) || {}; const d = num(t[p && p.type]); return d > 0 ? d : null; }
function findPartner(doc, by){
  const list = recs(doc, 'partners');
  if (by.id) return list.find(function(p){ return p.id === by.id; }) || null;
  if (by.code) return list.find(function(p){ return low(p.code) === low(by.code); }) || null;
  if (by.email) return list.find(function(p){ return low(p.email) === low(by.email); }) || null;
  return null;
}
/* a website "Become a referral partner" form → a pending partner (an admin turns it on) */
async function partnerJoin(f){
  const type = partnerType(f.partnerType || f.company_type || f.service || f.property);
  let made = null, existing = false;
  const w = await M().update(function(doc){
    const old = findPartner(doc, { email: f.email });
    if (old) { existing = true; made = old; return null; }
    const taken = {}; recs(doc, 'partners').forEach(function(p){ taken[low(p.code)] = 1; });
    const id = 'pt_' + crypto.randomBytes(5).toString('hex');
    made = { id: id, code: newCode(f.name, type, taken), name: s(f.name).slice(0, 80), company: s(f.company).slice(0, 100), type: type, email: low(f.email), phone: s(f.phone).slice(0, 30),
      status: 'pending', source: 'website', note: s(f.message).slice(0, 600), joinedAt: nowIso() };
    (doc.partners = doc.partners || {})[id] = made; return [['partners', id]];
  });
  if (!w.ok) throw new Error('busy');
  if (!existing) {
    try {
      const A = L().alertsApi(), to = await A.recipients();
      const key = env('RESEND_API_KEY');
      if (key && to.length) await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({
        from: 'GrayCo CRM <noreply@grayco-cs.com>', to: to, subject: require('./mailtag.js').tag('New referral partner sign-up: ' + made.name + (made.company ? ' (' + made.company + ')' : '') + ' — ' + PARTNER_TYPES[made.type], to, 'marketing'),
        html: '<p><b>' + esc(made.name) + '</b>' + (made.company ? ' — ' + esc(made.company) : '') + ' (' + esc(PARTNER_TYPES[made.type]) + ') signed up on grayco-cs.com to be a GrayCo referral partner.</p><p>' + esc(made.email) + ' · ' + esc(made.phone) + '</p>' + (made.note ? '<p>' + esc(made.note) + '</p>' : '') +
          '<p>Turn them on (and set their fee) in the CRM: Marketing → 🤝 Referral partners. Nothing is sent to them until you do.</p>' }) });
    } catch (e) {}
  }
  return { ok: true, id: made.id, existing: existing };
}
/* the magic link: partner id + expiry, signed */
function partnerToken(id, days){ const exp = nowFn() + (days || 30) * 864e5; const body = Buffer.from(s(id) + '.' + exp).toString('base64url'); return body + '.' + hmac('partner', body); }
function readPartnerToken(t){
  const i = s(t).lastIndexOf('.'); if (i < 1) return null;
  const body = t.slice(0, i); if (!same(t.slice(i + 1), hmac('partner', body))) return null;
  const raw = Buffer.from(body, 'base64url').toString('utf8'), j = raw.lastIndexOf('.');
  const id = raw.slice(0, j), exp = +raw.slice(j + 1);
  if (!id || !(exp > nowFn())) return null;
  return { id: id, exp: exp };
}
function partnerLink(p){ return site() + '/partner.html?t=' + partnerToken(p.id); }
async function sendPartnerLink(p){
  const key = env('RESEND_API_KEY'); if (!key || !okEmail(p.email)) return { ok: false };
  const link = partnerLink(p);
  const html = '<div style="font-family:Arial,sans-serif;max-width:560px"><div style="background:#0F1D2F;padding:14px 18px"><img src="' + site() + '/portal-logo.png" alt="GrayCo" style="height:40px;background:#fff;border-radius:6px;padding:2px"></div>' +
    '<div style="padding:16px 18px;color:#14202E"><p>Hi ' + esc(s(p.name).split(/\s+/)[0] || 'there') + ',</p><p>Here is your link to your <b>GrayCo Referral Partner</b> page — your partner code, your share link, the people you referred and where each one stands.</p>' +
    '<p style="margin:22px 0"><a href="' + esc(link) + '" style="background:#D4A017;color:#0F1D2F;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Open my partner page</a></p>' +
    '<p style="color:#55626F;font-size:13px">The link works for 30 days; you can ask for a new one any time on that page. Questions: (901) 585-0944.</p>' +
    '<p style="color:#55626F;font-size:12px">GrayCo Construction Services · ' + require('./brand.js').companyAddress() + '</p></div></div>';
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'GrayCo Referral Partners <portal@grayco-cs.com>', reply_to: (env('REPLY_TO_ADMIN') || 'replies@grayco-cs.com'), to: [low(p.email)], subject: 'Your GrayCo Referral Partner page', html: html }) }).catch(function(){ return { ok: false }; });
  return { ok: !!(r && r.ok) };
}
const STAGE_TXT = function(l, won, lost){ if (won) return 'Hired GrayCo'; if (lost) return 'Closed'; const st = low(l && (l.stage || l.status)); if (/estimat|proposal|quote|bid/.test(st)) return 'Estimate'; if (/contact|appoint|inspect|schedul/.test(st)) return 'In contact'; return 'Received'; };
function shortName(n){ const p = s(n).split(/\s+/).filter(Boolean); return p.length ? p[0] + (p[1] ? ' ' + p[1][0] + '.' : '') : 'Referral'; }
/* the partner's own page: their code + links, their referrals (first name + initial and where it stands), fees */
async function partnerView(pid){
  const doc = await M().readDoc(), c = cfg(doc), p = findPartner(doc, { id: pid });
  if (!p || p.status !== 'active') return null;
  let data = {}; try { data = await M().crmData(['leads', 'projects']); } catch (e) {}
  let inbox = []; try { inbox = arr(await L().kvGet(L().KV)); } catch (e) {}
  const code = low(p.code), mine = function(x){ return x && (low(x.partnerCode) === code || low(x.leadExtra && x.leadExtra.partnerCode) === code); };
  const projects = arr(data.projects).filter(function(x){ return x && x.deleted !== true; });
  const out = {}, leadIds = {};
  arr(data.leads).filter(mine).forEach(function(l){
    leadIds[l.id] = 1; if (l.inboxId) leadIds['in:' + l.inboxId] = 1;
    const pj = projects.find(function(x){ return x.leadId === l.id || x.fromLeadId === l.id || (l.projectId && x.id === l.projectId) || (l.jobId && x.id === l.jobId); });
    const won = !!(pj && !/^(lost|cancel|dead)/i.test(s(pj.status))) || low(l.stage) === 'won', lost = !won && /lost|dead|declin|closed/.test(low(l.stage || l.status));
    out[l.id] = { name: shortName(l.name || l.client || (l.contact && l.contact.name)), received: s(l.createdAt || l.date || l.created).slice(0, 10), stage: STAGE_TXT(l, won, lost), won: won };
  });
  inbox.filter(mine).forEach(function(it){ if (leadIds['in:' + it.id] || leadIds['LEADIN-' + s(it.id).replace(/^LI-/, '')]) return; out['in:' + it.id] = { name: shortName(it.contact && it.contact.name), received: s(it.leadExtra && it.leadExtra.receivedAt || it.createdAt).slice(0, 10), stage: 'Received', won: false }; });
  const list = Object.keys(out).map(function(k){ return out[k]; }).sort(function(a, b){ return a.received < b.received ? 1 : -1; });
  const pays = recs(doc, 'payouts').filter(function(x){ return x.partnerId === p.id && !/^(rejected|draft)$/.test(s(x.status)); })
    .map(function(x){ return { amount: num(x.amount), status: /paid/.test(s(x.status)) ? 'Paid' : /approved/.test(s(x.status)) ? 'Approved — on its way' : 'Being reviewed', date: s(x.paidAt || x.approvedAt || x.at).slice(0, 10), job: shortName(x.leadName) }; });
  const fee = feeFor(p, c);
  return { ok: true, partner: { name: p.name, company: p.company, type: PARTNER_TYPES[p.type] || 'Partner', code: p.code, fee: fee, feeText: fee ? '$' + fee.toLocaleString('en-US') + ' for every referral that hires GrayCo' : 'Your referral fee is set by GrayCo — ask us for details' },
    links: { website: withParams(web() + '/', { ref: p.code, utm_source: 'partner', utm_medium: 'referral', utm_campaign: 'partner-' + low(p.code) }), short: site() + '/go/' + low(p.code) },
    referrals: list, payouts: pays, totals: { referred: list.length, hired: list.filter(function(x){ return x.won; }).length, paid: pays.filter(function(x){ return x.status === 'Paid'; }).reduce(function(t, x){ return t + x.amount; }, 0) } };
}
/* a referral typed on the partner page → a GrayCo lead in the Lead Inbox, tagged with the partner */
async function partnerRefer(pid, b){
  const doc = await M().readDoc(), p = findPartner(doc, { id: pid });
  if (!p || p.status !== 'active') return { ok: false, status: 403, error: 'Your partner page is not active.' };
  const W = require('../website-intake.js')._lib;
  const f = { type: 'estimate', name: s(b.name).slice(0, 120), email: low(b.email), phone: s(b.phone).slice(0, 30), address: s(b.address).slice(0, 200), city: '', state: '', zip: '', message: s(b.note).slice(0, 1500), company: '', service: s(b.service).slice(0, 80) };
  if (!f.name) return { ok: false, status: 400, error: 'Add their name.' };
  if (!okEmail(f.email) && W.phone10(f.phone).length !== 10) return { ok: false, status: 400, error: 'Add their phone number or e-mail.' };
  const r = await W.fileLead(f, { source: 'Referral partner — ' + p.name + (p.company ? ' (' + p.company + ')' : ''), how: 'sent by referral partner ' + p.name + ' on their GrayCo partner page',
    notes: ['REFERRAL PARTNER: ' + p.name + (p.company ? ', ' + p.company : '') + ' (' + (PARTNER_TYPES[p.type] || 'partner') + ', code ' + p.code + '). Thank them; their fee is paid after the job is hired (Marketing → 🤝 Referral partners).'],
    leadExtra: { websiteLead: true, websiteForm: 'Referral partner', partnerCode: p.code, partnerName: p.name, partnerType: p.type, mkSource: 'Referral', howHeard: 'Referral' } });
  if (r.action === 'added') { try { await W.alertLead(r.rec); } catch (e) {} }
  return { ok: true, id: r.id };
}
/* a lead from the website with ?ref=<code> */
async function partnerFor(code){ if (!s(code)) return null; try { const doc = await M().readDoc(); const p = findPartner(doc, { code: code }); return p && p.status === 'active' ? p : null; } catch (e) { return null; } }

/* ══════════════════ 6. NEWSLETTER SIGN-UPS (lead magnets) ══════════════════ */
async function addSignup(o){
  const e = low(o.email); if (!okEmail(e)) return false;
  await L().kvCas('gc_news_signups', function(v){ v = arr(v); if (v.some(function(x){ return low(x.email) === e; })) return undefined; v.push({ email: e, name: s(o.name).slice(0, 80), source: s(o.source).slice(0, 60), zip: s(o.zip).slice(0, 10), at: nowIso() }); return v.slice(-20000); });
  return true;
}
async function signups(){ try { return arr(await L().kvGet('gc_news_signups')); } catch (e) { return []; } }

/* ══════════════════ 7. THE MONTHLY NEWSLETTER DRAFT ══════════════════ */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NL_TIPS = {
  1: 'Ice dams and frozen gutters: keep gutters clear and attics vented so snowmelt drains instead of backing up under shingles.',
  2: 'Look up at your ceilings after a freeze — a new brown spot is the first sign of a roof or plumbing leak. Call before it spreads.',
  3: 'Spring storms are coming: take photos of your roof and siding now, so you can show what changed after hail or wind.',
  4: 'After a hailstorm, check your gutters, downspouts and car — dents there mean your roof should be looked at too.',
  5: 'Trim branches that hang over the roof: they scrape shingles and drop leaves that hold water.',
  6: 'Run your hand along the bottom of the attic sheathing on a hot day — damp or dark wood means poor ventilation.',
  7: 'Summer storms: if water gets in, stop it fast. Wet drywall and flooring can grow mold within 24–48 hours.',
  8: 'A good time to book exterior painting and caulking before fall — sealed trim keeps water out of the walls.',
  9: 'Fall checklist: clean the gutters, check flashing around chimneys and vents, and replace cracked caulk.',
  10: 'Before the holidays: check that downspouts carry water at least a few feet away from your foundation.',
  11: 'Leaves in the gutters freeze into dams. A fall gutter cleaning is the cheapest roof protection there is.',
  12: 'Planning a remodel next year? Winter is the best time to design it and pick materials, so work starts on time in spring.'
};
function monthOfIso(iso){ return s(iso).slice(0, 7); }
function draftNewsletter(doc, data, month){
  month = month || nowIso().slice(0, 7);
  const m = +month.slice(5, 7), yr = month.slice(0, 4), name = MONTHS[m - 1] + ' ' + yr;
  const prev = (function(){ const d = new Date(Date.UTC(+yr, m - 2, 1)); return d.toISOString().slice(0, 7); })();
  const perms = {}; recs(doc, 'perms').forEach(function(x){ if (x.jobId && x.marketing === true) perms[x.jobId] = 1; });
  const done = arr(data && data.projects).filter(function(p){ return doneJob(p) && monthOfIso(p.completedAt || p.completionDate || p.endDate || p.updatedAt) === prev; });
  const shown = done.filter(function(p){ return perms[p.id] || p.marketingOk === true || p.mktPhotoOk === true; }).slice(0, 4);
  const byKind = {}; done.forEach(function(p){ const k = kindKey(p); byKind[k] = (byKind[k] || 0) + 1; });
  const KL = { roofing: 'roofs', 'storm-restoration': 'storm & insurance repairs', 'water-mitigation': 'water mitigation jobs', remodeling: 'remodels', other: 'other projects' };
  const sum = Object.keys(byKind).map(function(k){ return byKind[k] + ' ' + KL[k]; }).join(', ');
  const ref = recs(doc, 'referrals').filter(function(r){ return monthOfIso(r.at) === prev; }).length;
  const gw = recs(doc, 'events').filter(function(e){ return /giveaway/i.test(s(e.title || e.kind)) && monthOfIso(e.date || e.at) === prev; })[0];
  let body = '<p>Hi {{first_name}},</p><p>Here is what is new at GrayCo this month.</p>';
  if (done.length) body += '<h3 style="color:#1E2060">Last month at GrayCo</h3><p>Our crews finished ' + esc(sum || done.length + ' projects') + ' around the Memphis area. Thank you to every family who trusted us with their home.</p>';
  shown.forEach(function(p){ const ck = cityKey(p.address || p.jobAddress); body += '<p>• A ' + esc((KL[kindKey(p)] || 'project').replace(/s$/, '').replace(/ie$/, 'y')) + (ck ? ' in ' + esc(CITIES.find(function(c){ return low(c).replace(/\s+/g, '-') === ck; })) : '') + '</p>'; });
  body += '<h3 style="color:#1E2060">Tip of the month</h3><p>' + esc(NL_TIPS[m]) + '</p>';
  body += '<h3 style="color:#1E2060">The GrayCo Referral Program</h3><p>Know someone who needs a roof, a repair or a remodel? Every friend you refer who hires GrayCo earns you GrayCo credit toward your own projects.' + (ref ? ' Thank you to the ' + ref + ' customers who sent us a friend last month!' : '') + ' Reply to this e-mail or ask your project manager how it works.</p>';
  if (gw) body += '<h3 style="color:#1E2060">Giveaway</h3><p>' + esc(s(gw.title)) + (s(gw.winner) ? ' — congratulations to ' + esc(shortName(gw.winner)) + '!' : '') + '</p>';
  body += '<p>Need anything for your home? Call us at (901) 585-0944 — we are right here in Bartlett.</p>';
  return { id: 'nl_' + month.replace('-', ''), kind: 'newsletter', title: 'GrayCo News — ' + name, ctitle: 'GrayCo News — ' + name, subject: 'GrayCo News — ' + name, preheader: 'What is new at GrayCo, a home tip for ' + MONTHS[m - 1] + ', and our referral program',
    body: body, cta: { label: 'Book a free inspection', url: web() + '/#contact' }, aud: { type: 'all' }, status: 'draft', month: month, autoDrafted: true, draftedAt: nowIso() };
}
/* the 1st of the month (or any day after): one draft per month, never over an edited one */
async function ensureNewsletter(o){
  o = o || {}; const month = o.month || nowIso().slice(0, 7);
  let data = {}; try { data = await M().crmData(['projects']); } catch (e) {}
  let made = false;
  const w = await M().update(function(doc){
    const id = 'nl_' + month.replace('-', '');
    if (doc.campaigns && doc.campaigns[id]) return null;
    if (cfg(doc).newsletterAuto === false && !o.force) return null;
    const r = draftNewsletter(doc, data, month); (doc.campaigns = doc.campaigns || {})[r.id] = r; made = true; return [['campaigns', r.id]];
  });
  return { ok: !!w.ok, made: made };
}

/* ══════════════════ 9. WEBSITE NEWS (patch ADDR2) ══════════════════
   Owner (10/22): every newsletter an admin approves also goes on grayco-cs.com/news. Only records of kind "newsletter"
   whose status is approved / sending / sent, and not taken off by an admin (webHidden). The public copy has the title,
   the date, a summary and the body cleaned to plain tags: no {{merge fields}} (no greeting with a name), no e-mail
   addresses, no phone numbers but GrayCo's, no scripts, styles, forms or tracking; only https pictures. The newsletter
   draft only names jobs the customer OK'd for marketing, and an admin approved the text, so nothing private is added. */
const NEWS_TAGS = { p: 1, h2: 1, h3: 1, h4: 1, ul: 1, ol: 1, li: 1, b: 1, strong: 1, i: 1, em: 1, br: 1, a: 1, img: 1, blockquote: 1 };
function newsSlug(r){ return ('grayco-news-' + (s(r.month) || s(r.id))).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); }
function attr(tag, name){ const m = new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag); return m ? s(m[2] != null ? m[2] : m[3] != null ? m[3] : m[4]) : ''; }
function cleanNewsHtml(html){
  let h = String(html || '');
  h = h.replace(/<(script|style|iframe|object|embed|form|head|title|noscript|svg|template)[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*\{\{\s*first_name[\s\S]*?<\/p>/gi, '');   /* "Hi {{first_name}}," */
  h = h.replace(/<a\b[^>]*(unsubscribe|news-unsubscribe|mailto:)[^>]*>[\s\S]*?<\/a>/gi, '');   /* the unsubscribe / personal links go with their text */
  h = h.replace(/\{\{[^}]*\}\}/g, '');
  const imgs = [];
  h = h.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, function(tag, name){
    name = name.toLowerCase(); if (!NEWS_TAGS[name]) return name === 'div' || name === 'tr' || name === 'table' ? ' ' : '';
    if (tag[1] === '/') return name === 'br' || name === 'img' ? '' : '</' + name + '>';
    if (name === 'a') { const u = attr(tag, 'href'); return /^https:\/\/[^\s"'<>]+$/i.test(u) && !/unsubscribe|news-unsubscribe|[?&](t|token|email)=/i.test(u) ? '<a href="' + esc(u) + '" rel="noopener">' : '<a>'; }
    if (name === 'img') { const u = attr(tag, 'src'); if (!/^https:\/\/[^\s"'<>]+$/i.test(u) || /[?&](token|sig|signature|x-amz|expires)=/i.test(u)) return ''; imgs.push(u); return '<img src="' + esc(u) + '" alt="' + esc(attr(tag, 'alt').slice(0, 120)) + '" loading="lazy">'; }
    return '<' + name + '>';
  });
  h = h.replace(/[A-Za-z0-9._%+-]+@(?!grayco-cs\.com)[A-Za-z0-9.-]+\.[a-z]{2,}/gi, '');
  h = h.replace(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, function(m){ return m.replace(/\D/g, '') === '9015850944' ? m : ''; });
  h = h.replace(/<(p|li|h[2-4])>\s*<\/\1>/g, '').replace(/\s{3,}/g, ' ').trim();
  return { html: h, images: imgs };
}
function newsText(html){ return s(String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ')); }
function newsPublic(r, full){
  const c = cleanNewsHtml(r.approvedHtml || r.body), text = newsText(c.html);
  const o = { slug: newsSlug(r), title: s(r.webTitle || r.title || r.subject).slice(0, 140), date: s(r.sentAt || r.approvedAt || r.at || (s(r.month) ? r.month + '-01' : '')).slice(0, 10),
    summary: text.length > 220 ? text.slice(0, 217).replace(/\s+\S*$/, '') + '…' : text, image: c.images[0] || '' };
  if (full) { o.html = c.html; o.images = c.images; if (r.cta && /^https:\/\//.test(s(r.cta.url))) o.cta = { label: s(r.cta.label).slice(0, 60), url: s(r.cta.url) }; }
  return o;
}
function newsVisible(r){ return r && r.kind === 'newsletter' && !r.del && /^(approved|sending|sent)$/.test(s(r.status)) && r.webHidden !== true; }
async function newsPosts(slug){
  const doc = await M().readDoc();
  const list = recs(doc, 'campaigns').filter(newsVisible).sort(function(a, b){ return s(a.approvedAt || a.month) < s(b.approvedAt || b.month) ? 1 : -1; });
  if (slug) { const r = list.find(function(x){ return newsSlug(x) === s(slug).toLowerCase(); }); return r ? { ok: true, post: newsPublic(r, true) } : null; }
  return { ok: true, posts: list.slice(0, 60).map(function(r){ return newsPublic(r, false); }) };
}
/* an admin takes a post off the website (or puts it back) */
async function newsWeb(id, published, by){
  let hit = null;
  const w = await M().update(function(doc){
    const r = doc.campaigns && doc.campaigns[s(id)]; if (!r || r.kind !== 'newsletter') return null; hit = r;
    if ((r.webHidden === true) === !published) return null;
    r.webHidden = !published; r.webBy = s(by); r.webAt = nowIso(); return [['campaigns', r.id]];
  });
  if (!hit) return { ok: false, status: 404, error: 'That newsletter is not here.' };
  return { ok: !!w.ok, published: !!published, live: newsVisible(Object.assign({}, hit, { webHidden: !published })), slug: newsSlug(hit) };
}

/* ══════════════════ 8. APPROVALS (kinds mkt_ad, mkt_payout) — called by _lib/mkt.js ══════════════════ */
function approvalFor(kind, r, doc){
  if (kind === 'mkt_ad') {
    const what = r.action === 'pause' ? 'Pause' : r.action === 'enable' ? 'Turn back on' : 'Set the daily budget to $' + num(r.amount).toFixed(2) + ' (was $' + num(r.oldAmount).toFixed(2) + ')';
    const plat = r.platform === 'google' ? 'Google Ads' : 'Facebook / Instagram';
    return { title: '📣 Marketing — ad change: ' + what + ' — “' + s(r.campaignName) + '” (' + plat + ')', to: plat, subject: 'Ad change: ' + s(r.campaignName),
      html: '<p><b>' + esc(what) + '</b> on the ' + esc(plat) + ' campaign <b>' + esc(r.campaignName) + '</b>.</p>' + (r.reason ? '<p>Why: ' + esc(r.reason) + '</p>' : '') +
        '<p>Last 30 days: $' + num(r.spend30).toFixed(2) + ' spent · ' + (+r.leads30 || 0) + ' leads in the CRM · ' + (+r.won30 || 0) + ' jobs won.</p><p>Approved, the CRM makes the change on ' + esc(plat) + ' (or the office gets a to-do to make it in Ads Manager if the platform does not allow it).</p>' };
  }
  if (kind === 'mkt_payout') {
    const p = findPartner(doc, { id: r.partnerId }) || {};
    return { title: '📣 Marketing — referral partner fee $' + num(r.amount).toFixed(2) + ' to ' + s(p.name || r.partnerName), to: s(p.name || r.partnerName) + (p.company ? ' (' + p.company + ')' : ''), subject: 'Referral partner fee: ' + s(p.name || r.partnerName),
      html: '<p>Pay <b>' + esc(p.name || r.partnerName) + '</b>' + (p.company ? ' (' + esc(p.company) + ')' : '') + ' a referral fee of <b>$' + num(r.amount).toFixed(2) + '</b> for <b>' + esc(r.leadName) + '</b>' + (r.jobName ? ' — job ' + esc(r.jobName) : '') + '.</p>' +
        '<p>Approved, the office gets a to-do to pay it; mark it paid in Marketing → 🤝 Referral partners.' + (p.type === 'insurance' || p.type === 'realtor' ? ' Note: licensed realtors and insurance agents may have rules about referral fees — keep it within those (a gift card or credit instead of cash if needed).' : '') + '</p>' };
  }
  if (kind === 'mkt_page') {
    const d = r.draft || {};
    return { title: '📣 Marketing — website page: ' + s(r.label || r.id), to: 'grayco-cs.com/' + s(r.id), subject: s(d.headline),
      html: '<h2>' + esc(d.headline) + '</h2><p>' + esc(d.intro).replace(/\n/g, '<br>') + '</p><div>' + esc(d.body).replace(/\n/g, '<br>') + '</div><p style="color:#55626F">Approved, this text shows on the page within the hour (job counts, testimonials and photos are filled in from the CRM).</p>' };
  }
  if (kind === 'mkt_outreach') {
    return { title: '📣 Marketing — outreach e-mail ' + s(r.step ? '#' + r.step : '') + ' to ' + s(r.targetName), to: s(r.toName) + ' <' + s(r.to) + '>', subject: s(r.subject), html: '<p style="color:#55626F">From: ' + esc(r.fromName) + ' &lt;' + esc(r.fromEmail) + '&gt;</p>' + esc(r.body).replace(/\n/g, '<br>') };
  }
  if (kind === 'mkt_giveaway') {
    const w = r.winner || {};
    return { title: '📣 Marketing — giveaway winner e-mail: ' + s(w.name) + ' (' + s(r.month) + ')', to: s(w.name) + ' <' + s(w.email) + '>', subject: 'You won the GrayCo giveaway!',
      html: '<p>Tell <b>' + esc(w.name) + '</b> (' + esc(w.email) + ') they won <b>' + esc(s(r.prize) || DEFAULT_PRIZE) + '</b> in the ' + esc(s(r.month)) + ' giveaway.</p><p>Drawn ' + esc(s(r.draw && r.draw.at).slice(0, 16).replace('T', ' ')) + ' UTC by ' + esc(s(r.draw && r.draw.by)) + ' from ' + (+(r.draw && r.draw.count) || 0) + ' entries (seed ' + esc(s(r.draw && r.draw.seed).slice(0, 12)) + '…, logged).</p>' };
  }
  if (kind === 'mkt_event') {
    return { title: '📣 Marketing — free roof check reminders: ' + s(r.title || 'Free Roof Check') + ' · ' + s(r.date), to: 'Everyone who signs up (e-mail' + (env('TWILIO_FROM') ? ' + text' : '') + ')', subject: 'Reminder: your free roof check tomorrow',
      html: '<p>The day before <b>' + esc(dayLabel(r.date)) + '</b>, everyone who signed up for <b>' + esc(r.title || 'the free roof check') + '</b>' + (r.area ? ' (' + esc(r.area) + ')' : '') + ' gets one reminder:</p>' +
        '<blockquote>Your free GrayCo roof check is tomorrow, ' + esc(dayLabel(r.date)) + ' at [their time]. You do not need to be on the roof or in the attic — we will knock when we arrive. Questions or need a new time? Call (901) 585-0944.</blockquote>' +
        (env('TWILIO_FROM') ? '<p>Text: “GrayCo reminder: your free roof check is tomorrow at [time]. Questions: (901) 585-0944. Reply STOP to opt out.”</p>' : '') + '<p>Approve once; every reminder for this event then goes out by itself.</p>' };
  }
  return null;
}
async function afterApproved(kind, r, item, core){
  if (kind === 'mkt_page') { await M().update(function(doc){ const x = rec(doc, 'citypages', r.id); if (!x) return null; x.approved = Object.assign({}, x.draft || {}); x.publishedAt = nowIso(); return [['citypages', r.id]]; }); CACHE.v = null; return { ok: true }; }
  if (kind === 'mkt_outreach') {
    const key = env('RESEND_API_KEY'); let ok = false;
    if (key && okEmail(r.to) && /@grayco-cs\.com$/i.test(s(r.fromEmail))) {
      const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#14202E">' + esc(r.body).replace(/\n/g, '<br>') + '<p style="color:#55626F;font-size:12px">GrayCo Construction Services · ' + require('./brand.js').companyAddress() + ' · (901) 585-0944<br>Not interested? Reply "no thanks" and we will not write again.</p></div>';
      const x = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: s(r.fromName || 'GrayCo').replace(/[<>"]/g, '') + ' <' + low(r.fromEmail) + '>', reply_to: low(r.fromEmail), to: [low(r.to)], subject: s(r.subject), html: html }) }).catch(function(){ return { ok: false }; });
      ok = !!(x && x.ok);
    }
    await M().update(function(doc){ const x = rec(doc, 'outreach', r.id); if (!x) return null; x.status = ok ? 'sent' : 'approved'; x.sentAt = ok ? nowIso() : ''; x.sendError = ok ? '' : 'not sent — check the addresses (send it from Gmail by hand)'; return [['outreach', r.id]]; });
    return { ok: ok };
  }
  if (kind === 'mkt_giveaway') { const res = await sendWinner(r); await M().update(function(doc){ const x = rec(doc, 'giveaways', r.id); if (!x) return null; x.notifyStatus = res.ok ? 'sent' : 'approved'; x.notifiedAt = res.ok ? nowIso() : ''; return [['giveaways', r.id]]; }); return res; }
  if (kind === 'mkt_event') { await M().update(function(doc){ const x = rec(doc, 'roofevents', r.id); if (!x) return null; x.remindApprovedAt = nowIso(); return [['roofevents', r.id]]; }); return { ok: true }; }
  if (kind === 'mkt_ad') {
    const res = await applyChange(r);
    await M().update(function(doc){ const x = rec(doc, 'adchanges', r.id); if (!x) return null; x.status = res.ok ? 'applied' : 'approved'; x.appliedAt = res.ok ? nowIso() : ''; x.applyError = res.ok ? '' : s(res.error); return [['adchanges', r.id]]; });
    if (!res.ok && core && core.officeTodo) { try { await core.officeTodo('mkt_ad_' + r.id, 'Make an approved ad change by hand: ' + s(item.title).replace(/^📣 Marketing — ad change: /, ''), 'The platform did not accept the change from the CRM (' + s(res.error).slice(0, 160) + '). Open ' + (r.platform === 'google' ? 'Google Ads (ads.google.com)' : 'Meta Ads Manager (adsmanager.facebook.com)') + ' and make it there.'); } catch (e) {} }
    return res;
  }
  if (kind === 'mkt_payout') {
    if (core && core.officeTodo) { try { await core.officeTodo('mkt_pay_' + r.id, 'Pay referral partner ' + s(r.partnerName) + ' $' + num(r.amount).toFixed(2), 'Approved referral fee for ' + s(r.leadName) + '. Pay it, then mark it paid in Marketing → 🤝 Referral partners.'); } catch (e) {} }
    return { ok: true };
  }
  return { ok: true };
}

/* ══════════════════ 9. FREE ROOF CHECK EVENTS ══════════════════
   gc_mkt_v1 "roofevents": { id, title, date (YYYY-MM-DD), area, address (meeting point / street — public), pm, pmEmail,
   slots: [{ t: '09:00', cap: 2 }], status: draft|open|closed, remindApprovedAt }. Sign-ups (service-only
   "gc_event_signups" { eventId: [ { id, name, email, phone, address, slot, leadId, at, reminded } ] }) — each one a
   lead in the Lead Inbox with its booked time, assigned to the event's PM. */
function slotLabel(t){ const m = /^(\d{1,2}):(\d{2})$/.exec(s(t)); if (!m) return s(t); let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + m[2] + ' ' + ap; }
function dayLabel(d){ const x = new Date(s(d) + 'T12:00:00Z'); return isFinite(x) ? x.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) : s(d); }
async function eventSignups(){ try { const v = await L().kvGet('gc_event_signups'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
async function eventPublic(eid){
  const doc = await M().readDoc(), ev = rec(doc, 'roofevents', s(eid));
  if (!ev || ev.status !== 'open') return null;
  const su = arr((await eventSignups())[ev.id]);
  const slots = arr(ev.slots).map(function(x){ const taken = su.filter(function(y){ return y.slot === x.t; }).length; return { t: x.t, label: slotLabel(x.t), left: Math.max(0, (+x.cap || 1) - taken) }; });
  return { ok: true, id: ev.id, kind: s(ev.kind) || 'roofcheck', audience: s(ev.audience), title: s(ev.title) || (ev.kind === 'lunch' ? 'Lunch & Learn' : 'Free Roof Check'), date: ev.date, day: dayLabel(ev.date), area: s(ev.area), place: s(ev.address), pm: s(ev.pm).split(/\s+/)[0], slots: slots, past: s(ev.date) < nowIso().slice(0, 10) };
}
async function eventSignup(eid, b){
  const doc = await M().readDoc(), ev = rec(doc, 'roofevents', s(eid));
  if (!ev || ev.status !== 'open' || s(ev.date) < nowIso().slice(0, 10)) return { ok: false, status: 404, error: 'Sign-ups for this event are closed. Call (901) 585-0944.' };
  const W = require('../website-intake.js')._lib;
  const name = s(b.name).slice(0, 100), email = low(b.email), phone = s(b.phone).slice(0, 30), address = s(b.address).slice(0, 200), slot = s(b.slot);
  if (!name) return { ok: false, status: 400, error: 'Please add your name.', field: 'name' };
  if (W.phone10(phone).length !== 10 && !okEmail(email)) return { ok: false, status: 400, error: 'Please add a phone number or an e-mail.', field: 'phone' };
  if (address.length < 5 && ev.kind !== 'lunch') return { ok: false, status: 400, error: 'Please add the home address to check.', field: 'address' };
  const sl = arr(ev.slots).find(function(x){ return x.t === slot; }); if (!sl) return { ok: false, status: 400, error: 'Pick a time.', field: 'slot' };
  let mine = null, full = false, dup = false;
  await L().kvCas('gc_event_signups', function(v){
    v = v && typeof v === 'object' ? v : {}; const list = arr(v[ev.id]);
    if (list.some(function(y){ return (email && low(y.email) === email) || (W.phone10(phone).length === 10 && W.phone10(y.phone) === W.phone10(phone)); })) { dup = true; return undefined; }
    if (list.filter(function(y){ return y.slot === slot; }).length >= (+sl.cap || 1)) { full = true; return undefined; }
    mine = { id: 'su_' + crypto.randomBytes(5).toString('hex'), name: name, email: email, phone: phone, address: address, slot: slot, at: nowIso() };
    list.push(mine); v[ev.id] = list; return v;
  });
  if (dup) return { ok: true, already: true, message: 'You are already signed up — see you on ' + dayLabel(ev.date) + '!' };
  if (full || !mine) return { ok: false, status: 409, error: 'That time just filled up — please pick another.' };
  if (ev.kind === 'lunch') {   /* a lunch-and-learn RSVP: the attendee joins the referral partner program (pending until an admin turns them on) */
    const en = await enrollPartner({ name: name, email: email, phone: phone, company: s(b.company), partnerType: s(b.partnerType || ev.audience) }, 'lunch-and-learn ' + ev.date);
    return { ok: true, id: mine.id, partner: en.id, message: 'You are registered: ' + dayLabel(ev.date) + ' at ' + slotLabel(slot) + '. Lunch is on us — see you there!' };
  }
  const f = { type: 'estimate', name: name, email: email, phone: phone, address: address, city: '', state: '', zip: '', message: 'Free roof check — ' + dayLabel(ev.date) + ' at ' + slotLabel(slot) + (ev.area ? ' (' + s(ev.area) + ')' : ''), company: '', service: 'Free roof check' };
  const pm = s(ev.pm) ? { pm: s(ev.pm), pmEmail: low(ev.pmEmail), assignedAt: nowIso(), assignedBy: 'Free roof check event' } : {};
  const r = await W.fileLead(f, { source: 'Free roof check — ' + (s(ev.title) || s(ev.area) || ev.date), how: 'signed up for the free roof check on ' + ev.date, title: ('Roof check ' + ev.date + ' ' + slotLabel(slot) + ' — ' + name).slice(0, 200),
    leadExtra: { websiteLead: true, websiteForm: 'Free roof check event', eventId: ev.id, eventSlot: ev.date + 'T' + slot, mkSource: 'Event', howHeard: 'Event', unassigned: !ev.pm }, patch: pm });
  await L().kvCas('gc_event_signups', function(v){ const list = arr(v && v[ev.id]); const x = list.find(function(y){ return y.id === mine.id; }); if (!x) return undefined; x.leadId = r.id; return v; }).catch(function(){});
  if (r.action === 'added') { try { await W.alertLead(r.rec); } catch (e) {} }
  return { ok: true, id: mine.id, message: 'You are booked: ' + dayLabel(ev.date) + ' at ' + slotLabel(slot) + '. We will send a reminder the day before.' };
}
/* the day before, from 9 AM Central: one reminder per sign-up — only on events whose reminders an admin approved */
async function eventReminders(){
  const doc = await M().readDoc(), today = nowIso().slice(0, 10), out = { sent: 0 };
  const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  const evs = recs(doc, 'roofevents').filter(function(e){ return e.status === 'open' && e.date === tomorrow && s(e.remindApprovedAt); });
  if (!evs.length) return out;
  const all = await eventSignups(), key = env('RESEND_API_KEY');
  for (const ev of evs) {
    for (const su of arr(all[ev.id])) {
      if (su.reminded) continue;
      let ok = false;
      if (key && okEmail(su.email)) {
        const html = '<p>Hi ' + esc(s(su.name).split(/\s+/)[0]) + ',</p><p>This is your reminder: your <b>free GrayCo roof check</b> is tomorrow, <b>' + esc(dayLabel(ev.date)) + ' at ' + esc(slotLabel(su.slot)) + '</b>' + (su.address ? ' at ' + esc(su.address) : '') + '.</p><p>You do not need to be on the roof or in the attic — we will knock when we arrive. Questions or need a new time? Call (901) 585-0944.</p><p>GrayCo Construction Services · ' + require('./brand.js').companyAddress() + '</p>';
        const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'GrayCo Construction Services <portal@grayco-cs.com>', reply_to: low(ev.pmEmail) || 'replies@grayco-cs.com', to: [su.email], subject: 'Reminder: your free roof check tomorrow at ' + slotLabel(su.slot), html: html }) }).catch(function(){ return { ok: false }; });
        ok = !!(r && r.ok);
      }
      let smsNo = false; try { smsNo = (await require('./smsconsent.js').live(su.phone)) === 'no'; } catch (e) {}   /* patch SMSCONSENT: a declined number gets no text reminder */
      if (!smsNo && env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM') && require('../website-intake.js')._lib.phone10(su.phone).length === 10) {
        try {
          const to = '+1' + require('../website-intake.js')._lib.phone10(su.phone);
          const r2 = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + env('TWILIO_ACCOUNT_SID') + '/Messages.json', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(env('TWILIO_ACCOUNT_SID') + ':' + env('TWILIO_AUTH_TOKEN')).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'To=' + encodeURIComponent(to) + '&From=' + encodeURIComponent(env('TWILIO_FROM')) + '&Body=' + encodeURIComponent('GrayCo reminder: your free roof check is tomorrow at ' + slotLabel(su.slot) + '. Questions: (901) 585-0944. Reply STOP to opt out.') });
          ok = ok || r2.ok;
        } catch (e) {}
      }
      if (ok) { out.sent++; await L().kvCas('gc_event_signups', function(v){ const x = arr(v && v[ev.id]).find(function(y){ return y.id === su.id; }); if (!x || x.reminded) return undefined; x.reminded = nowIso(); return v; }).catch(function(){}); }
    }
  }
  return out;
}

/* ══════════════════ 10. $100-OFF COUPONS ══════════════════
   A coupon QR (sponsorship, truck, shirt, banner …) → coupon.html?s=<source code> → the person claims ONE unique code
   (one per e-mail / phone / household address). Only a hash + the last 4 are kept (service-only "gc_coupons").
   Redeemed once, on work over $1,000 (server-checked). Each claim is a lead tagged with the source. */
const COUPON_VALUE = 100, COUPON_MIN = 1000;
/* patch LEGAL3 (counsel review F2: "coupon expiration — NOT FOUND"): every new coupon carries an expiration date (default 90 days after it is
   issued; Admin setting cfg.main.coupons.days, 1-730). It is shown on the coupon page and in the coupon e-mail, and redeeming after it is
   refused. Coupons claimed before this change have no date and stay valid. DRAFT wording pending attorney review. */
const COUPON_DAYS = 90;
const MONTHS_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function centralYmd(ms){ try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); } catch (e) { return new Date(ms - 6 * 3600e3).toISOString().slice(0, 10); } }
function couponDays(setts){ const n = Math.round(num(setts && setts.days)); return n >= 1 && n <= 730 ? n : COUPON_DAYS; }
function couponExpiry(issuedMs, days){ return centralYmd(issuedMs + days * 864e5); }
function longDate(ymd){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(ymd)); return m ? MONTHS_L[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : ''; }
async function couponSettings(){ try { const doc = await M().readDoc(); return cfg(doc).coupons || {}; } catch (e) { return {}; } }
function couponHash(code){ return crypto.createHash('sha256').update('gc-coupon:' + s(code).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex'); }
function newCoupon(){ const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const b = crypto.randomBytes(8); let x = ''; for (let i = 0; i < 8; i++) x += A[b[i] % A.length]; return 'GC100-' + x.slice(0, 4) + '-' + x.slice(4); }
function addrKey(a){ return low(a).replace(/[^a-z0-9]/g, '').slice(0, 24); }
async function couponSource(code){ const doc = await M().readDoc(); return rec(doc, 'sponsors', cleanCode(code)) || null; }
async function couponClaim(srcCode, b){
  const W = require('../website-intake.js')._lib;
  const sp = await couponSource(srcCode);
  const name = s(b.name).slice(0, 100), email = low(b.email), phone = s(b.phone).slice(0, 30), address = s(b.address).slice(0, 200);
  if (!name) return { ok: false, status: 400, error: 'Please add your name.', field: 'name' };
  if (!okEmail(email) && W.phone10(phone).length !== 10) return { ok: false, status: 400, error: 'Please add your e-mail or phone number.', field: 'email' };
  const ph = W.phone10(phone), ak = addrKey(address);
  const days = couponDays(await couponSettings()), issuedMs = nowFn(), expires = couponExpiry(issuedMs, days);   /* patch LEGAL3 */
  let code = '', dup = '', dupExp = '';
  await L().kvCas('gc_coupons', function(v){
    v = v && typeof v === 'object' ? v : {}; v.list = v.list || {};
    const hit = Object.keys(v.list).map(function(k){ return v.list[k]; }).find(function(c){ return (email && c.email === email) || (ph.length === 10 && c.phone10 === ph) || (ak.length >= 8 && c.addr === ak); });
    if (hit) { dup = hit.last4; dupExp = s(hit.expires); return undefined; }
    code = newCoupon(); const h = couponHash(code);
    v.list[h] = { last4: code.slice(-4), source: sp ? sp.id : cleanCode(srcCode) || 'unknown', sourceName: sp ? s(sp.name) : '', name: name, email: email, phone10: ph, addr: ak, at: nowIso(), expires: expires };   /* patch LEGAL3 */
    return v;
  });
  if (dup) return { ok: true, already: true, message: 'This household already has a GrayCo $100 coupon (ending ' + dup + '). It works once' + (dupExp ? ' and expires ' + longDate(dupExp) : '') + ' — mention it when you call (901) 585-0944.' };
  const f = { type: 'estimate', name: name, email: email, phone: phone, address: address, city: '', state: '', zip: '', message: 'Claimed a $100-off coupon (ending ' + code.slice(-4) + ')' + (sp ? ' from ' + s(sp.name) : '') + '.', company: '', service: '' };
  try {
    const r = await W.fileLead(f, { source: 'Coupon QR — ' + (sp ? s(sp.name) : cleanCode(srcCode) || 'unknown'), how: 'claimed a $100-off coupon by QR', notes: ['COUPON: $100 off work over $1,000, code ending ' + code.slice(-4) + ', expires ' + longDate(expires) + ' (one time — redeem it in Marketing → 🎟 Coupons).'],
      leadExtra: { websiteLead: true, websiteForm: 'Coupon QR', couponLast4: code.slice(-4), couponSource: sp ? sp.id : cleanCode(srcCode), trackCode: sp ? s(sp.linkCode) : '', mkSource: sp && /truck|shirt|uniform|sign/i.test(s(sp.kind)) ? 'Yard sign' : 'Event' } });
    await L().kvCas('gc_coupons', function(v){ const x = v && v.list && v.list[couponHash(code)]; if (!x) return undefined; x.leadId = r.id; return v; }).catch(function(){});
    if (r.action === 'added') { try { await W.alertLead(r.rec); } catch (e) {} }
  } catch (e) {}
  const key = env('RESEND_API_KEY');
  if (key && okEmail(email)) {
    await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'GrayCo Construction Services <portal@grayco-cs.com>', reply_to: 'replies@grayco-cs.com', to: [email],
      subject: 'Your GrayCo $100 coupon: ' + code, html: '<p>Hi ' + esc(name.split(/\s+/)[0]) + ',</p><p>Here is your coupon: <b style="font-size:20px;letter-spacing:1px">' + esc(code) + '</b></p><p><b>$100 off GrayCo work</b> on projects over $1,000.</p><p style="font-size:15px"><b>Expires ' + esc(longDate(expires)) + '</b> (' + days + ' days after it was issued).</p><p style="font-size:13px;color:#55626F">Terms: one coupon per household and one use per coupon; not combined with other coupons or discounts (GrayCo referral credit is OK); no cash value; not valid toward an insurance deductible or on insurance-paid work; not transferable or for sale; void where prohibited. Give the code to your GrayCo project manager before your estimate or invoice is final, on or before the expiration date.</p><p>Call (901) 585-0944 to book a free estimate.</p><p style="color:#55626F;font-size:12px">GrayCo Construction Services · ' + require('./brand.js').companyAddress() + '</p>' }) }).catch(function(){});
  }
  return { ok: true, code: code, expires: expires, expiresText: longDate(expires), message: 'Your coupon: ' + code + ' — $100 off GrayCo work on projects over $1,000. Expires ' + longDate(expires) + '. We also e-mailed it to you.' };
}
/* staff: look up / redeem. o = { code, amount (the estimate / invoice total), jobId, jobName, ref (estimate or invoice #), other coupons on it, by } */
async function couponCheck(code){
  const v = (await L().kvGet('gc_coupons')) || {}, c = v.list && v.list[couponHash(code)];
  if (!c) return { ok: false, error: 'No such coupon code.' };
  return { ok: true, last4: c.last4, name: c.name, source: c.sourceName || c.source, claimedAt: c.at, redeemed: c.redeemed || null, expires: s(c.expires), expired: !!(c.expires && centralYmd(nowFn()) > s(c.expires)) };   /* patch LEGAL3 */
}
async function couponRedeem(code, o, setts){
  o = o || {}; setts = setts || {};
  const amount = num(o.amount), min = num(setts.min) || COUPON_MIN;
  if (!(amount > min)) return { ok: false, error: 'This coupon is only for projects over $' + min.toLocaleString('en-US') + '.' };
  if (num(o.otherCoupons) > 0 && setts.combinable !== true) return { ok: false, error: 'This coupon cannot be combined with another coupon (Admin setting).' };
  const h = couponHash(code); let res = null;
  await L().kvCas('gc_coupons', function(v){
    const c = v && v.list && v.list[h];
    if (!c) { res = { ok: false, error: 'No such coupon code.' }; return undefined; }
    if (c.expires && centralYmd(nowFn()) > s(c.expires) && !c.redeemed) { res = { ok: false, expired: true, error: 'This coupon expired on ' + longDate(c.expires) + '.' }; return undefined; }   /* patch LEGAL3 */
    if (c.redeemed) { res = { ok: false, error: 'This coupon was already used on ' + s(c.redeemed.at).slice(0, 10) + (c.redeemed.jobName ? ' (' + c.redeemed.jobName + ')' : '') + '.' }; return undefined; }
    c.redeemed = { at: nowIso(), by: low(o.by), jobId: s(o.jobId), jobName: s(o.jobName).slice(0, 120), ref: s(o.ref).slice(0, 60), amount: amount };
    res = { ok: true, value: COUPON_VALUE, last4: c.last4, source: c.source };
    return v;
  });
  return res || { ok: false, error: 'Try again.' };
}
async function couponStats(){
  const v = (await L().kvGet('gc_coupons')) || {}, by = {};
  Object.keys(v.list || {}).forEach(function(k){ const c = v.list[k]; const x = by[c.source] || (by[c.source] = { claims: 0, redeemed: 0, list: [] }); x.claims++; if (c.redeemed) x.redeemed++; x.list.push({ last4: c.last4, name: c.name, at: c.at, leadId: c.leadId || '', redeemed: c.redeemed ? { at: c.redeemed.at, jobName: c.redeemed.jobName, amount: c.redeemed.amount } : null }); });
  return by;
}

/* ══════════════════ 11. THE MONTHLY GIVEAWAY ══════════════════
   gc_mkt_v1 "giveaways": { id: 'gw_YYYYMM', month, prize (default "a FREE handyman hour"), rules, status: open|closed|drawn,
   winner: { name, email, phone, city }, draw: { by, at, seed, count, index }, notifyStatus } — one per month.
   Entries (service-only "gc_giveaway_entries" { gwId: [ { id, name, email, phone, zip, src, at } ] }): one per person per
   month (e-mail or phone); every entrant joins GrayCo News (unsubscribe any time) and is a soft lead. */
const DEFAULT_PRIZE = 'a FREE handyman hour';
/* patch LEGAL3: eligibility is TN, MS and AR residents; the ZIP prefix is a sanity check (age and residence are self-certified on the entry form) */
function giveawayZipOk(zip){ const n = +s(zip).slice(0, 3); return (n >= 370 && n <= 385) || (n >= 386 && n <= 397) || (n >= 716 && n <= 729) || n === 755; }
function gwId(month){ return 'gw_' + s(month || nowIso().slice(0, 7)).replace('-', ''); }
async function giveawayCurrent(){
  const doc = await M().readDoc(), id = gwId(), g = rec(doc, 'giveaways', id);
  if (g && g.status === 'closed') return { ok: true, open: false };
  const month = nowIso().slice(0, 7), m = +month.slice(5, 7);
  /* patch LEGAL3: the entry period and prize value are fields the owner sets (Marketing → Giveaway); the rules text uses [START DATE] / [END DATE] / [PRIZE] / [PRIZE VALUE] */
  const ymd = function(v){ return /^\d{4}-\d{2}-\d{2}$/.test(s(v)) ? s(v) : ''; }, last = new Date(Date.UTC(+month.slice(0, 4), m, 0)).getUTCDate();
  return { ok: true, open: !g || g.status === 'open', id: id, month: month, monthName: MONTHS[m - 1] + ' ' + month.slice(0, 4), prize: s(g && g.prize) || DEFAULT_PRIZE, rulesUrl: site() + '/giveaway.html#rules', rules: s(g && g.rules),
    startDate: ymd(g && g.startDate) || month + '-01', endDate: ymd(g && g.endDate) || month + '-' + String(last).padStart(2, '0'), prizeValue: s(g && g.prizeValue).slice(0, 40) };
}
async function giveawayEnter(b){
  const cur = await giveawayCurrent(); if (!cur.open) return { ok: false, status: 409, error: 'This month\'s giveaway is closed — check back next month!' };
  const W = require('../website-intake.js')._lib;
  const name = s(b.name).slice(0, 100), email = low(b.email), phone = s(b.phone).slice(0, 30), zip = s(b.zip).replace(/\D/g, '').slice(0, 5);
  if (!name) return { ok: false, status: 400, error: 'Please add your name.', field: 'name' };
  if (!okEmail(email)) return { ok: false, status: 400, error: 'Please add your e-mail — that is how we tell the winner.', field: 'email' };
  if (b.agree !== true && b.agree !== 'true' && b.agree !== 'on') return { ok: false, status: 400, error: 'Please tick that you are 18 or older, live in Tennessee, Mississippi or Arkansas, and agree to the official rules.', field: 'agree' };
  if (zip.length === 5 && !giveawayZipOk(zip)) return { ok: false, status: 400, error: 'This giveaway is open to residents of Tennessee, Mississippi and Arkansas (18 or older).', field: 'zip' };   /* patch LEGAL3: eligibility */
  const ph = W.phone10(phone); let dup = false, me = null;
  const wantsNews = b.newsletter === true || b.newsletter === 'true' || b.newsletter === 'on';   /* patch LEGAL3: the newsletter box is an opt-in (unchecked by default) */
  await L().kvCas('gc_giveaway_entries', function(v){
    v = v && typeof v === 'object' ? v : {}; const list = arr(v[cur.id]);
    if (list.some(function(x){ return low(x.email) === email || (ph.length === 10 && W.phone10(x.phone) === ph); })) { dup = true; return undefined; }
    me = { id: 'en_' + crypto.randomBytes(5).toString('hex'), name: name, email: email, phone: phone, zip: zip, src: s(b.src || b.gc).slice(0, 40), news: wantsNews, at: nowIso() };
    list.push(me); v[cur.id] = list.slice(-20000); return v;
  });
  if (dup) return { ok: true, already: true, message: 'You are already entered for ' + cur.monthName + ' — one entry per person per month. Good luck!' };
  if (wantsNews) await addSignup({ email: email, name: name, source: 'giveaway:' + cur.month, zip: zip });   /* owner: "Join our newsletter" is an optional box (patch LEGAL3: opt-in, never pre-ticked) */
  try {
    await W.fileLead({ type: 'estimate', name: name, email: email, phone: phone, address: '', city: '', state: '', zip: zip, message: 'Entered the ' + cur.monthName + ' giveaway (' + cur.prize + ').', company: '', service: '' },
      { title: ('Giveaway entry — ' + name + ' (' + cur.monthName + ')').slice(0, 200), how: 'entered the monthly giveaway', source: 'Monthly giveaway', notes: ['Soft lead: entered the monthly giveaway' + (wantsNews ? ' and ticked the optional box to join GrayCo News (they can unsubscribe any time)' : ' (did not join GrayCo News)') + '. No reach-out clock.'],
        leadExtra: { softLead: true, websiteForm: 'Monthly giveaway', giveaway: cur.id, mkSource: /^fb|facebook/i.test(s(b.gc)) ? 'Facebook/Instagram Ads' : 'Event', trackCode: s(b.gc).slice(0, 40) } });
  } catch (e) {}
  return { ok: true, id: me.id, message: 'You are entered! We draw the winner at the end of ' + cur.monthName + ' and e-mail them. ' + (wantsNews ? ' You will also get GrayCo News — unsubscribe any time.' : '') };
}
async function giveawayEntries(id){ try { const v = await L().kvGet('gc_giveaway_entries'); return arr(v && v[id]); } catch (e) { return []; } }
/* the draw: a random seed, logged; the pick is HMAC(seed, the sorted entry ids) — anyone can re-check it from the log */
function pickIndex(seed, ids){ const h = crypto.createHmac('sha256', s(seed)).update(ids.slice().sort().join('|')).digest(); return h.readUInt32BE(0) % ids.length; }
async function giveawayDraw(id, by){
  const list = await giveawayEntries(id); if (!list.length) return { ok: false, error: 'Nobody entered yet.' };
  let out = null;
  const w = await M().update(function(doc){
    const g = rec(doc, 'giveaways', id) || { id: id, month: id.slice(3, 7) + '-' + id.slice(7), prize: DEFAULT_PRIZE, status: 'open' };
    if (g.status === 'drawn' && g.winner) { out = { ok: false, error: 'Already drawn: ' + g.winner.name + ' (' + s(g.draw && g.draw.at).slice(0, 10) + ').' }; return null; }
    const seed = crypto.randomBytes(16).toString('hex'), ids = list.map(function(x){ return x.id; }), i = pickIndex(seed, ids);
    const win = list.find(function(x){ return x.id === ids.slice().sort()[i]; });
    g.status = 'drawn'; g.winner = { id: win.id, name: win.name, email: win.email, phone: win.phone, zip: win.zip };
    g.draw = { by: low(by), at: nowIso(), seed: seed, count: list.length, index: i, method: 'HMAC-SHA256(seed, sorted entry ids) mod count' };
    (doc.giveaways = doc.giveaways || {})[id] = g; out = { ok: true, winner: { name: win.name }, draw: g.draw }; return [['giveaways', id]];
  });
  if (!w.ok && !out) return { ok: false, error: 'busy — try again' };
  return out;
}
async function sendWinner(g){
  const key = env('RESEND_API_KEY'), w = g && g.winner; if (!key || !w || !okEmail(w.email)) return { ok: false };
  const html = '<p>Hi ' + esc(s(w.name).split(/\s+/)[0]) + ',</p><p><b>Congratulations — you won the GrayCo ' + esc(s(g.monthName || g.month)) + ' giveaway: ' + esc(s(g.prize) || DEFAULT_PRIZE) + '!</b></p><p>Reply to this e-mail or call (901) 585-0944 and we will set up a time. ' + esc(s(g.claimNote) || 'Please reply within 14 days and return the signed Affidavit of Eligibility and Liability / Publicity Release we will send you (the Official Rules explain). If we do not hear from you in time, another winner may be drawn.') + '</p><p>Thank you for following GrayCo Construction Services.</p><p style="color:#55626F;font-size:12px">GrayCo Construction Services · ' + require('./brand.js').companyAddress() + '</p>';
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'GrayCo Construction Services <news@grayco-cs.com>', reply_to: 'replies@grayco-cs.com', to: [low(w.email)], subject: 'You won the GrayCo giveaway!', html: html }) }).catch(function(){ return { ok: false }; });
  return { ok: !!(r && r.ok) };
}

/* lunch-and-learn sign-ups (an event with kind "lunch") enroll the attendee in the partner program */
async function enrollPartner(o, source){
  let made = null, existing = false;
  const w = await M().update(function(doc){
    const old = o.email ? findPartner(doc, { email: o.email }) : null; if (old) { existing = true; made = old; return null; }
    const type = partnerType(o.partnerType || o.type || ''), taken = {}; recs(doc, 'partners').forEach(function(p){ taken[low(p.code)] = 1; });
    const id = 'pt_' + crypto.randomBytes(5).toString('hex');
    made = { id: id, code: newCode(o.name, type, taken), name: s(o.name).slice(0, 80), company: s(o.company).slice(0, 100), type: type, email: low(o.email), phone: s(o.phone).slice(0, 30), status: 'pending', source: s(source) || 'lunch-and-learn', joinedAt: nowIso() };
    (doc.partners = doc.partners || {})[id] = made; return [['partners', id]];
  });
  return { ok: !!w.ok, existing: existing, id: made && made.id };
}

/* ══════════════════ 12. THANK-YOUS: December + milestones (owner 30) ══════════════════ */
async function thankYous(core){
  const doc = await M().readDoc(), now = nowIso(), yr = now.slice(0, 4), out = { todos: 0 };
  let data = {}; try { data = await M().crmData(['leads', 'projects']); } catch (e) {}
  const leads = arr(data.leads), projects = arr(data.projects).filter(function(p){ return p && p.deleted !== true; });
  const hired = function(l){ return projects.some(function(x){ return x.leadId === l.id || x.fromLeadId === l.id || (l.projectId && x.id === l.projectId); }); };
  const parts = recs(doc, 'partners').filter(function(p){ return p.status === 'active'; }).map(function(p){ const L = leads.filter(function(l){ return low(l.partnerCode) === low(p.code); }); return { p: p, n: L.length, won: L.filter(hired).length }; });
  const refs = {}; leads.forEach(function(l){ const r = s(l.referredBy); if (r) { const x = refs[low(r)] || (refs[low(r)] = { name: r, n: 0, won: 0, pid: s(l.referrerPid) }); x.n++; if (hired(l)) x.won++; } });
  const custAddr = function(pid){ const p = projects.find(function(x){ return x.id === pid; }); return p ? s(p.address || p.jobAddress) : ''; };
  const todo = async function(key, title, body){ if (core && core.officeTodo) { try { await core.officeTodo(key, title, body); out.todos++; } catch (e) {} } };
  if (now.slice(5, 7) === '12' && !cfg(doc)['thanks' + yr]) {
    const top = parts.filter(function(x){ return x.n; }).sort(function(a, b){ return b.won - a.won || b.n - a.n; }).slice(0, 15), topC = Object.keys(refs).map(function(k){ return refs[k]; }).sort(function(a, b){ return b.won - a.won || b.n - a.n; }).slice(0, 15);
    if (top.length || topC.length) {
      const lines = top.map(function(x){ return '• ' + x.p.name + (x.p.company ? ' (' + x.p.company + ')' : '') + ' — ' + x.n + ' referrals, ' + x.won + ' hired — gift: ' + (x.won >= 5 ? 'a $100 restaurant gift card + handwritten card' : x.won >= 1 ? 'a $50 gift card + card' : 'a handwritten card') + ' — ' + (x.p.email || '') + (x.p.phone ? ' · ' + x.p.phone : ''); })
        .concat(topC.map(function(x){ return '• Customer ' + x.name + ' — ' + x.n + ' referrals, ' + x.won + ' hired — gift: ' + (x.won >= 2 ? 'a holiday gift basket + card' : 'a handwritten card') + (custAddr(x.pid) ? ' — ' + custAddr(x.pid) : ''); }));
      await todo('mkt_thanks_' + yr, '🎁 Holiday thank-yous for our top referrers (' + yr + ')', 'Send a card or gift to each (the suggestions follow what they sent us). Check gift rules for licensed realtors / agents.\n' + lines.join('\n'));
    }
    await M().update(function(d){ const c = rec(d, 'cfg', 'main') || { id: 'main' }; c['thanks' + yr] = now; (d.cfg = d.cfg || {}).main = c; return [['cfg', 'main']]; });
  }
  const seen = cfg(doc).milestones || {}, hit = [];
  parts.forEach(function(x){ [3, 5, 10, 25].forEach(function(m){ const k = x.p.id + ':' + m; if (x.won >= m && !seen[k]) hit.push({ k: k, t: '🎉 Partner milestone: ' + x.p.name + ' — ' + m + ' referrals hired GrayCo', b: 'Send a thank-you (card or gift) to ' + x.p.name + (x.p.company ? ', ' + x.p.company : '') + ' — ' + (x.p.email || '') + (x.p.phone ? ' · ' + x.p.phone : '') + '.' }); }); });
  Object.keys(refs).forEach(function(k){ const x = refs[k]; [3, 5, 10].forEach(function(m){ const kk = 'c:' + k + ':' + m; if (x.won >= m && !seen[kk]) hit.push({ k: kk, t: '🎉 Referral milestone: ' + x.name + ' — ' + m + ' friends hired GrayCo', b: 'Send ' + x.name + ' a thank-you' + (custAddr(x.pid) ? ' — ' + custAddr(x.pid) : '') + '. (Their referral credits stack.)' }); }); });
  for (const h of hit) await todo('mkt_ms_' + h.k.replace(/[^a-z0-9]/gi, '_'), h.t, h.b);
  if (hit.length) await M().update(function(d){ const c = rec(d, 'cfg', 'main') || { id: 'main' }; c.milestones = Object.assign({}, c.milestones || {}); hit.forEach(function(h){ c.milestones[h.k] = now; }); (d.cfg = d.cfg || {}).main = c; return [['cfg', 'main']]; });
  return out;
}

module.exports = {
  thankYous,
  DEFAULT_PRIZE, gwId, giveawayCurrent, giveawayEnter, giveawayEntries, giveawayDraw, pickIndex, sendWinner, enrollPartner,
  slotLabel, dayLabel, eventPublic, eventSignup, eventReminders, eventSignups,
  couponHash, newCoupon, couponClaim, couponCheck, couponRedeem, couponStats, COUPON_VALUE, COUPON_MIN, COUPON_DAYS, couponDays, couponExpiry, longDate,
  cleanCode, withParams, linkTarget, countClick, clicks, e164, trackNumber, forwardTo, logCall, calls,
  adsStatus, authUrl, callback, syncAds, applyChange, draftCopy, toRecords, forget, googleCustomers, metaAccounts, LIMITS,
  siteData, CITIES, cityKey, kindKey,
  PARTNER_TYPES, partnerType, partnerJoin, partnerToken, readPartnerToken, partnerLink, sendPartnerLink, partnerView, partnerRefer, partnerFor, findPartner, feeFor, newCode,
  addSignup, signups, draftNewsletter, ensureNewsletter, NL_TIPS,
  newsSlug, cleanNewsHtml, newsPublic, newsPosts, newsWeb,
  approvalFor, afterApproved, makeState, readState,
  _setNow: function(f){ nowFn = f || function(){ return Date.now(); }; }, _cache: CACHE
};
