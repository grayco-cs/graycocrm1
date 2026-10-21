/* ── GrayCo News: who gets it, the unsubscribe link, and the one way news@ mail goes out (patch AP2) ──
   Owner (21 Oct 2026): "The thank-you e-mail can be from news@, and I want it to also have 'click to
   unsubscribe from our newsletters'. I will start making an auto news to my customer database and people
   will have to unsubscribe from that."

   * The list: every customer with an e-mail (the CRM's customers and the jobs' customer e-mails) is on
     GrayCo News — the opt-out model. subscribers(data) gives the list minus the unsubscribed.
   * Unsubscribed addresses live in a SERVER-ONLY table, gc_news_suppress (docs/news-unsubscribe.sql):
     row-level security on, no policy, nothing granted to anon / authenticated. Only the functions (service
     key) read or write it.
   * The link: /.netlify/functions/news-unsubscribe?t=<token>. The token is the address plus an HMAC-SHA256
     of it (NEWS_UNSUB_SECRET, or a key derived from the service key), so nobody can unsubscribe someone
     else by guessing.
   * sendNews(): THE way any news / marketing mail goes out. It skips unsubscribed addresses, sends from
     "GrayCo Construction Services <news@grayco-cs.com>" (reply-to office@), adds the footer (why you get it,
     one-click unsubscribe, the street address and phone — CAN-SPAM) and the List-Unsubscribe +
     List-Unsubscribe-Post (RFC 8058 one-click) headers.
   * Transactional mail (invoices, portal links, signed papers, receipts) never looks at this list.
   ──────────────────────────────────────────────────────────────────────────── */
'use strict';
const crypto = require('crypto');
const NEWS_FROM = 'GrayCo Construction Services <news@grayco-cs.com>';
const REPLY_TO = 'office@grayco-cs.com';
const ADDRESS = '4014 Broadway Rd, Bartlett, TN 38135';
const PHONE = '(901) 585-0944';
const TABLE = 'gc_news_suppress';
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function isJwt(k){ return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(k || '')); }
function H(extra){ const k = svcKey(); return Object.assign(isJwt(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }, { 'Content-Type': 'application/json' }, extra || {}); }
function baseUrl(){
  const env = s(process.env.PORTAL_BASE_URL).replace(/\/$/, '');
  if (/^https:\/\//.test(env)) return env;
  return (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean)[0];
}

/* ── the signed token ── */
function secret(){
  const own = s(process.env.NEWS_UNSUB_SECRET);
  if (own.length >= 16) return own;
  const k = svcKey(); if (!k) return '';
  return crypto.createHmac('sha256', k).update('gc-news-unsubscribe-v1').digest('hex');
}
function sig(email){ const k = secret(); if (!k) return ''; return crypto.createHmac('sha256', k).update('unsub:' + low(email)).digest('base64url').slice(0, 32); }
function token(email){ const e = low(email); if (!okEmail(e)) return ''; const g = sig(e); return g ? Buffer.from(e).toString('base64url') + '.' + g : ''; }
function verify(tok){
  const m = /^([A-Za-z0-9_-]{4,400})\.([A-Za-z0-9_-]{32})$/.exec(s(tok)); if (!m) return null;
  let e = ''; try { e = low(Buffer.from(m[1], 'base64url').toString('utf8')); } catch (x) { return null; }
  if (!okEmail(e)) return null;
  const want = sig(e); if (!want) return null;
  const a = Buffer.from(want), b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? e : null;
}
function unsubUrl(email){ const t = token(email); return t ? baseUrl() + '/.netlify/functions/news-unsubscribe?t=' + t : ''; }
function listHeaders(email){
  const u = unsubUrl(email); if (!u) return {};
  return { 'List-Unsubscribe': '<' + u + '>, <mailto:news@grayco-cs.com?subject=unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}
function footerHtml(email){
  const u = unsubUrl(email);
  return '<div class="gc-news-footer" style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:18px auto 0;padding:14px 16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;text-align:center">' +
    'You’re receiving GrayCo news because you’re a GrayCo customer. ' +
    (u ? '<a href="' + esc(u) + '" style="color:#374151;font-weight:bold;text-decoration:underline">Unsubscribe from our newsletters</a>' : '<b>Reply “unsubscribe” to stop our newsletters.</b>') +
    '<br>GrayCo Construction Services · ' + ADDRESS + ' · ' + PHONE + '</div>';
}

/* ── the suppression list (server only) ── */
async function rows(emails){
  const list = (emails || []).map(low).filter(okEmail);
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < list.length; i += 80) {
    const part = list.slice(i, i + 80).map(function(e){ return '"' + e.replace(/"/g, '') + '"'; }).join(',');
    const r = await fetch(sbUrl() + '/rest/v1/' + TABLE + '?select=email,unsubscribed,unsubscribed_at,resubscribed_at,resubscribed_by,source&email=in.(' + encodeURIComponent(part) + ')', { headers: H() });
    if (!r.ok) { const e = new Error('suppression list ' + r.status); e.status = r.status; throw e; }
    (await r.json()).forEach(function(x){ out.push(x); });
  }
  return out;
}
/* a Set of the unsubscribed addresses among emails. If the list cannot be read, it THROWS: news never goes out blind. */
async function suppressed(emails){
  const set = new Set();
  (await rows(emails)).forEach(function(x){ if (x && x.unsubscribed !== false) set.add(low(x.email)); });
  return set;
}
async function isUnsubscribed(email){ return (await suppressed([email])).has(low(email)); }
async function status(emails){
  const out = {};
  (emails || []).map(low).filter(okEmail).forEach(function(e){ out[e] = { subscribed: true }; });
  (await rows(emails)).forEach(function(x){ const e = low(x.email); out[e] = x.unsubscribed !== false ? { subscribed: false, unsubscribedAt: x.unsubscribed_at || '' } : { subscribed: true, resubscribedAt: x.resubscribed_at || '', resubscribedBy: x.resubscribed_by || '' }; });
  return out;
}
async function upsert(row){
  const r = await fetch(sbUrl() + '/rest/v1/' + TABLE + '?on_conflict=email', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(row) });
  return r.ok;
}
async function unsubscribe(email, source){
  const e = low(email); if (!okEmail(e)) return false;
  return upsert({ email: e, unsubscribed: true, unsubscribed_at: new Date().toISOString(), source: s(source).slice(0, 60) || 'link' });
}
async function resubscribe(email, by){
  const e = low(email); if (!okEmail(e)) return false;
  return upsert({ email: e, unsubscribed: false, resubscribed_at: new Date().toISOString(), resubscribed_by: s(by).slice(0, 120) || 'customer' });
}

/* every customer with an e-mail (customers + the jobs' customer e-mails), unsubscribed ones left out */
function everyone(data){
  const by = {};
  function add(email, name, from){ const e = low(email); if (!okEmail(e) || by[e]) return; by[e] = { email: e, name: s(name), from: from }; }
  arr(data && data.customers).forEach(function(c){ if (c && c.deleted !== true) add(c.email || c.contactEmail, c.name || c.company, 'customer'); });
  arr(data && data.projects).forEach(function(p){ if (p && p.deleted !== true) add(p.clientEmail || p.customerEmail || p.email, p.client || p.customer, 'job'); });
  return Object.keys(by).map(function(k){ return by[k]; });
}
async function subscribers(data){
  const all = everyone(data);
  const off = await suppressed(all.map(function(x){ return x.email; }));
  return all.filter(function(x){ return !off.has(x.email); });
}

/* THE way news@ mail goes out. o = { to, subject, html, text? }. → { ok, skipped?, status?, error? } */
async function sendNews(o){
  const to = low(o && o.to);
  if (!okEmail(to)) return { ok: false, error: 'bad address' };
  const key = s(process.env.RESEND_API_KEY);
  if (!key) return { ok: false, error: 'E-mail is not set up on Netlify (RESEND_API_KEY).' };
  let off;
  try { off = await isUnsubscribed(to); } catch (e) { return { ok: false, error: 'The unsubscribe list could not be read (run docs/news-unsubscribe.sql).' }; }
  if (off) return { ok: true, skipped: 'unsubscribed' };
  const html = String(o.html || '') + footerHtml(to);
  const body = { from: NEWS_FROM, reply_to: REPLY_TO, to: [to], subject: s(o.subject), html: html, headers: listHeaders(to) };
  if (o.text) body.text = String(o.text) + '\n\n--\nYou’re receiving GrayCo news because you’re a GrayCo customer. Unsubscribe: ' + unsubUrl(to) + '\nGrayCo Construction Services · ' + ADDRESS + ' · ' + PHONE;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, error: 'no answer' }; }
}

module.exports = { NEWS_FROM: NEWS_FROM, REPLY_TO: REPLY_TO, ADDRESS: ADDRESS, PHONE: PHONE, TABLE: TABLE,
  token: token, verify: verify, unsubUrl: unsubUrl, listHeaders: listHeaders, footerHtml: footerHtml,
  suppressed: suppressed, isUnsubscribed: isUnsubscribed, status: status, unsubscribe: unsubscribe, resubscribe: resubscribe,
  everyone: everyone, subscribers: subscribers, sendNews: sendNews, okEmail: okEmail };
