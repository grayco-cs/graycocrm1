/* ── GrayCo staff check (security build) ──────────────────────────────────────
   A call from the CRM must carry the signed-in person's Supabase token:
       Authorization: Bearer <access token>
   The token is checked with Supabase (/auth/v1/user) and the email must be on
   the staff list: table gc_staff (read with the service key) once it exists —
   it is then the ONLY list, so removing someone there blocks them here at
   once — and the STAFF_EMAILS variable only before that table exists.
   No token / bad token → 401.  Signed in but not staff → 403.
   (Kept inline in every function on purpose: each function is bundled alone.) */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret) */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* CORS: only the CRM's own site may call from a browser (SITE_ORIGIN, comma list). */
function gcCors(event, methods, extraHeaders){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',')
    .map(function(s){ return s.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event, 'origin').replace(/\/$/, '');
  return {
    'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization' + (extraHeaders ? ', ' + extraHeaders : ''),
    'Access-Control-Allow-Methods': methods || 'POST, OPTIONS'
  };
}
async function gcStaffAuth(event){
  const m = /^Bearer\s+(\S+)$/i.exec(gcHeader(event, 'authorization').trim());
  if (!m) return { ok: false, statusCode: 401, error: 'Sign in to the GrayCo CRM first (no sign-in token was sent).' };
  const token = m[1];
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  let user = null;
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (r.ok) user = await r.json();
  } catch (e) {
    return { ok: false, statusCode: 503, error: 'Could not reach the sign-in service. Try again.' };
  }
  const email = String((user && user.email) || '').trim().toLowerCase();
  if (!email) return { ok: false, statusCode: 401, error: 'Your sign-in has expired. Sign in again.' };
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let role = null, listed = false, name = '';
  if (svc) {
    try {
      const r = await fetch(url + '/rest/v1/gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(email),
        { headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
      if (r.ok) {
        listed = true;
        const rows = await r.json();
        const row = Array.isArray(rows) && rows[0];
        if (row && row.active !== false) { role = String(row.role || 'staff').toLowerCase(); name = row.name || ''; }
      }
    } catch (e) {}
  }
  if (!listed) {
    const env = (process.env.STAFF_EMAILS || '').split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
    if (env.indexOf(email) > -1) role = 'staff';
  }
  if (!role) return { ok: false, statusCode: 403, error: 'This account (' + email + ') is not on the GrayCo staff list.' };
  return { ok: true, email: email, role: role, name: name, userId: user.id || '' };
}
/* ── end GrayCo staff check ────────────────────────────────────────────────── */

// netlify/functions/mkt2.js — GrayCo 📣 Marketing part 2 (patch MKT2): the staff calls + the ad platforms' sign-in return.
//   GET  ?callback=1&code&state          → Google / Facebook send the owner back here after "Connect" (signed state)
//   POST { op:'ads_status' }                     → which ad platforms are set up / connected, last sync, errors
//   POST { op:'ads_connect', platform }   admin  → the sign-in URL (Google Ads or Facebook)
//   POST { op:'ads_disconnect', platform } admin → forget the tokens
//   POST { op:'ads_sync' }                admin  → pull spend / clicks / conversions now (the daily job does it too)
//   POST { op:'ad_copy', platform, service, city, offer } → AI-drafted ad copy within the platform limits
//   POST { op:'link_stats' }                     → clicks per tracked link, calls per tracking number
//   POST { op:'partner_link', id }        admin  → e-mail an active partner their sign-in link
//   POST { op:'newsletter', month, force }       → draft this month's newsletter (one per month)
//   POST { op:'coupon_check', code } / { op:'coupon_redeem', code, amount, jobId, jobName, ref, otherCoupons }
//   POST { op:'coupon_stats' }                   → claims / redemptions per sponsorship
//   POST { op:'event_signups', id }              → who signed up for a free roof check
//   POST { op:'giveaway_entries', id } / { op:'giveaway_draw', id } (admin) → entries; the logged random draw
//   POST { op:'site_stats' }                     → what the website's city pages show
// Signed-in GrayCo staff only (admins where marked). Customer-facing sends still go through ✅ Approvals.
'use strict';
const X = require('./_lib/mkt2.js');
function mk(){ return require('./_lib/mkt.js'); }
function reply(code, headers, o){ return { statusCode: code, headers: headers, body: JSON.stringify(o) }; }
function page(title, msg, ok){
  return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title></head>' +
      '<body style="font-family:Arial,sans-serif;background:#F5F7FB;margin:0;padding:40px 16px"><div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #dce3ee;border-radius:12px;padding:22px">' +
      '<h2 style="color:' + (ok ? '#166534' : '#9a3412') + ';margin-top:0">' + (ok ? '✓ ' : '') + title + '</h2><p>' + String(msg).replace(/[<>&]/g, '') + '</p>' +
      '<p><a href="/" style="color:#1E2060;font-weight:bold">Back to the GrayCo CRM → Marketing → 📈 Ads hub</a></p></div></body></html>' };
}
exports.handler = async function(event){
  const q = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && q.callback === '1') {
    try { const r = await X.callback(q); return r.ok ? page(r.platform + ' is connected', 'The CRM pulls your ad numbers every morning. You can close this tab.', true) : page('Not connected', r.error, false); }
    catch (e) { return page('Not connected', String(e && e.message || e).slice(0, 200), false); }
  }
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  const who = await gcStaffAuth(event);
  if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
  let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const op = String(body.op || '');
  let data = {}; try { data = await mk().crmData(['users']); } catch (e) {}
  const role = mk().roleOf(who, data), admin = role === 'admin', office = admin || role === 'office';
  try {
    if (op === 'ads_status') return reply(200, headers, Object.assign({ ok: true, role: role }, await X.adsStatus()));
    if (op === 'ad_copy') {   /* patch SOC: paid ads only for the services in the Ads focus (default: restoration — water, fire, storm) */
      const SC = require('./_lib/soc-content.js'), d0 = await require('./_lib/mkt.js').readDoc(), af = ((d0.cfg && d0.cfg.main) || {}).adsFocus;
      if (!String(body.service || '').trim()) body.service = 'Water damage restoration';
      if (!SC.adsAllowed(af, String(body.service))) return reply(400, headers, { ok: false, error: 'Ads focus: paid ads are restoration only right now (water, fire, storm). Change it in Marketing → ⚙️ Focus & approvals.' });
      return reply(200, headers, await X.draftCopy(body));
    }
    if (op === 'link_stats') { const c = await X.calls(); return reply(200, headers, { ok: true, clicks: await X.clicks(), calls: c.slice(-500).map(function(x){ return Object.assign({}, x, { from: office ? x.from : String(x.from || '').slice(-4) }); }) }); }
    if (op === 'newsletter') { if (!office) return reply(403, headers, { ok: false, error: 'Only the office or an admin can do that.' }); return reply(200, headers, await X.ensureNewsletter({ month: /^\d{4}-\d{2}$/.test(String(body.month || '')) ? body.month : '', force: body.force === true })); }
    if (op === 'coupon_check') return reply(200, headers, await X.couponCheck(String(body.code || '')));
    if (op === 'coupon_redeem') {
      let setts = {}; try { const doc = await mk().readDoc(); setts = ((doc.cfg && doc.cfg.main) || {}).coupons || {}; } catch (e) {}
      return reply(200, headers, await X.couponRedeem(String(body.code || ''), Object.assign({}, body, { by: who.email }), setts));
    }
    if (op === 'coupon_stats') return reply(200, headers, { ok: true, by: await X.couponStats() });
    if (op === 'event_signups') { const all = await X.eventSignups(); return reply(200, headers, { ok: true, list: (all[String(body.id || '')] || []).map(function(x){ return { name: x.name, phone: x.phone, email: x.email, address: x.address, slot: x.slot, leadId: x.leadId || '', at: x.at, reminded: x.reminded || '' }; }) }); }
    if (op === 'giveaway_entries') { const l = await X.giveawayEntries(String(body.id || X.gwId())); return reply(200, headers, { ok: true, count: l.length, list: office ? l.slice(-300).map(function(x){ return { name: x.name, email: x.email, zip: x.zip, src: x.src, at: x.at }; }) : [] }); }
    if (op === 'site_stats') { X._cache.v = null; return reply(200, headers, await X.siteData()); }
    if (!admin) return reply(403, headers, { ok: false, error: 'Only Wesley or Nick can do that.' });
    if (op === 'news_web') { const r = await X.newsWeb(String(body.id || ''), body.published === true, who.email); return reply(r.status || 200, headers, r); }   /* patch ADDR2: a newsletter on / off the website */
    if (op === 'ads_connect') { const u = X.authUrl(String(body.platform || ''), who.email); return u ? reply(200, headers, { ok: true, url: u }) : reply(400, headers, { ok: false, setup: true, error: 'This platform is not set up on Netlify yet — see the setup steps.' }); }
    if (op === 'ads_disconnect') { await X.forget(String(body.platform || '')); return reply(200, headers, { ok: true }); }
    if (op === 'ads_sync') return reply(200, headers, Object.assign({ ok: true }, await X.syncAds({ days: 30 })));
    if (op === 'giveaway_draw') return reply(200, headers, await X.giveawayDraw(String(body.id || X.gwId()), who.email));
    if (op === 'partner_link') {
      const doc = await mk().readDoc(), p = X.findPartner(doc, { id: String(body.id || '') });
      if (!p) return reply(404, headers, { ok: false, error: 'Partner not found (wait a few seconds for it to reach the cloud).' });
      if (p.status !== 'active') return reply(400, headers, { ok: false, error: 'Turn the partner on first.' });
      const r = await X.sendPartnerLink(p); return reply(200, headers, { ok: r.ok, error: r.ok ? '' : 'The e-mail did not go out (check RESEND_API_KEY and their address).' });
    }
    return reply(400, headers, { ok: false, error: 'Unknown op' });
  } catch (e) { return reply(500, headers, { ok: false, error: 'Marketing hit a problem: ' + String(e && e.message || e).slice(0, 200) }); }
};
