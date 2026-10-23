// netlify/functions/mkt-public.js — GrayCo Marketing's PUBLIC doors (patch MKT2). No sign-in; nothing private comes out.
//   GET  ?site=1                     → pixel IDs, completed jobs per city, testimonials the customers allowed (the website's
//                                      city pages and the pixel loader read it; cached an hour)
//   GET  ?event=<id>                 → a free roof check event: day, area, open times (roofcheck.html)
//   POST { op:'event_signup', id, name, phone, email, address, slot } → booked; a lead for the event's PM
//   GET  ?coupon=<source>            → which sponsorship / truck / shirt the coupon QR is (coupon.html)
//   POST { op:'coupon_claim', s, name, email, phone, address } → ONE unique $100-off code per household
//   GET  ?giveaway=1                → this month's giveaway (prize, open or not); POST { op:'giveaway_enter', name, email, phone, zip, agree, gc }
//   POST { op:'partner_link', email }       → a referral partner asks for their sign-in link (always "sent")
//   POST { op:'partner_me', t }              → the partner page (partner.html): code, links, referrals, fees
//   POST { op:'partner_refer', t, name, phone, email, address, note } → a lead tagged with the partner
//   GET  ?news=1 / ?news=<slug>         → the approved newsletters on the website (patch ADDR2; no personal data)
//   POST { op:'news_signup', email, name, zip } → joins GrayCo News (the website's sign-up box)
//   GET  ?company=1                     → the company address with its scheduled move (gc-address.js)
// Spam: a honeypot field ("website"), per-connection limits, and short answers.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const X = require('./_lib/mkt2.js');
function s(v){ return v == null ? '' : String(v).trim(); }
const ORIGINS = ['https://grayco-cs.com', 'https://www.grayco-cs.com', 'https://crm.grayco-cs.com', 'https://graycocrm1.netlify.app'];
function origins(){ return ORIGINS.concat(s(process.env.WEBSITE_ORIGINS).split(','), s(process.env.SITE_ORIGIN).split(',')).map(x => s(x).replace(/\/$/, '')).filter(Boolean); }
function cors(event){ const h = event.headers || {}; const o = s(h.origin || h.Origin).replace(/\/$/, ''); return { 'Access-Control-Allow-Origin': origins().indexOf(o) >= 0 ? o : ORIGINS[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }; }
function J(event, code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors(event), extra || {}), body: JSON.stringify(body) }; }
const HITS = new Map();
function limited(ip, key, max, ms){ const k = key + '|' + ip, now = Date.now(); const l = (HITS.get(k) || []).filter(t => now - t < ms); l.push(now); HITS.set(k, l); if (HITS.size > 5000) HITS.clear(); return l.length > max; }
exports.handler = async function(event){
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(event), body: '' };
  const q = event.queryStringParameters || {}, h = event.headers || {};
  const ip = s(h['x-nf-client-connection-ip'] || h['client-ip'] || s(h['x-forwarded-for']).split(',')[0]) || 'x';
  try {
    if (event.httpMethod === 'GET') {
      if (q.site === '1') return J(event, 200, await X.siteData(), { 'Cache-Control': 'public, max-age=600' });
      if (q.giveaway != null) return J(event, 200, await X.giveawayCurrent());
      if (q.news != null) { const r = await X.newsPosts(q.news === '1' || q.news === '' ? '' : String(q.news).slice(0, 80)); return r ? J(event, 200, r, { 'Cache-Control': 'public, max-age=300' }) : J(event, 404, { ok: false, error: 'Not found.' }); }
      if (q.company != null) { const B = require('./_lib/brand.js'); await B.refreshAddress(); const c = B.addressConfig(); return J(event, 200, { ok: true, address: B.companyAddress(), config: { current: c.current, next: c.next, switchOn: c.switchOn } }, { 'Cache-Control': 'public, max-age=300' }); }
      if (q.event) { const e = await X.eventPublic(q.event); return e ? J(event, 200, e) : J(event, 404, { ok: false, error: 'This event is not open.' }); }
      if (q.coupon != null) { const doc = await require('./_lib/mkt.js').readDoc(); const sp = doc.sponsors && doc.sponsors[X.cleanCode(q.coupon)]; return J(event, 200, { ok: true, name: sp && !sp.del ? s(sp.publicName || '') : '', value: X.COUPON_VALUE, min: X.COUPON_MIN }); }
      return J(event, 400, { ok: false, error: 'Unknown request.' });
    }
    if (event.httpMethod !== 'POST') return J(event, 405, { ok: false, error: 'Method not allowed' });
    let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(event, 400, { ok: false, error: 'Bad request.' }); }
    if (s(b.website)) return J(event, 200, { ok: true });   /* the honeypot: a bot filled the hidden field */
    const op = s(b.op);
    if (op === 'news_signup') {
      if (limited(ip, 'ns', 5, 600000)) return J(event, 429, { ok: false, error: 'Too many tries — please try again later.' });
      const ok = await X.addSignup({ email: s(b.email).slice(0, 120), name: s(b.name).slice(0, 80), zip: s(b.zip).slice(0, 10), source: 'website-news' });
      return ok ? J(event, 200, { ok: true, message: 'Thank you — you are on GrayCo News.' }) : J(event, 400, { ok: false, error: 'Please enter a valid e-mail.' });
    }
    if (op === 'event_signup') {
      if (limited(ip, 'ev', 6, 600000)) return J(event, 429, { ok: false, error: 'Too many tries — please call (901) 585-0944.' });
      const r = await X.eventSignup(b.id, b); return J(event, r.status || 200, r);
    }
    if (op === 'giveaway_enter') {
      if (limited(ip, 'gw', 5, 3600000)) return J(event, 429, { ok: false, error: 'Too many tries — please try again later.' });
      const r = await X.giveawayEnter(b); return J(event, r.status || 200, r);
    }
    if (op === 'coupon_claim') {
      if (limited(ip, 'cp', 4, 3600000)) return J(event, 429, { ok: false, error: 'Too many tries — please call (901) 585-0944.' });
      const r = await X.couponClaim(b.s, b); return J(event, r.status || 200, r);
    }
    if (op === 'partner_link') {
      if (limited(ip, 'pl', 5, 3600000)) return J(event, 429, { ok: false, error: 'Too many tries — please wait an hour.' });
      try { const doc = await require('./_lib/mkt.js').readDoc(); const p = X.findPartner(doc, { email: b.email }); if (p && p.status === 'active') await X.sendPartnerLink(p); } catch (e) {}
      return J(event, 200, { ok: true, message: 'If that e-mail belongs to an active GrayCo referral partner, the link is on its way.' });
    }
    if (op === 'partner_me' || op === 'partner_refer') {
      if (limited(ip, 'pm', 60, 600000)) return J(event, 429, { ok: false, error: 'Too many requests.' });
      const t = X.readPartnerToken(s(b.t)); if (!t) return J(event, 401, { ok: false, expired: true, error: 'This link expired — ask for a new one below.' });
      if (op === 'partner_me') { const v = await X.partnerView(t.id); return v ? J(event, 200, v) : J(event, 403, { ok: false, error: 'Your partner page is not active. Call (901) 585-0944.' }); }
      if (limited(ip, 'pr', 10, 3600000)) return J(event, 429, { ok: false, error: 'Too many referrals in an hour — call us at (901) 585-0944.' });
      const r = await X.partnerRefer(t.id, b); return J(event, r.status || 200, r);
    }
    return J(event, 400, { ok: false, error: 'Unknown request.' });
  } catch (e) { return J(event, 503, { ok: false, error: 'We could not do that right now — please call (901) 585-0944.' }); }
};
exports._test = { limited, reset: () => HITS.clear() };
