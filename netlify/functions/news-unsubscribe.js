// netlify/functions/news-unsubscribe.js — the "Unsubscribe from our newsletters" link in every GrayCo news e-mail.
//
//   GET  ?t=<token>                       → unsubscribes that address (the time is recorded) and shows
//                                           "You're unsubscribed from GrayCo news" with a Resubscribe button
//   POST ?t=<token>  List-Unsubscribe=One-Click   → the mail program's one-click unsubscribe (RFC 8058)
//   POST t=<token>&do=resubscribe (form)  → the customer changed their mind: back on the list
//
// The token is the address + an HMAC of it (_lib/news.js), so a guessed or edited link does nothing.
// The list is the server-only table gc_news_suppress (docs/news-unsubscribe.sql). No sign-in needed.
'use strict';
const news = require('./_lib/news.js');

const hits = new Map();
function limited(ip){
  const now = Date.now(); let h = hits.get(ip);
  if (!h || now - h.start > 10 * 60e3) { h = { start: now, n: 0 }; hits.set(ip, h); }
  h.n++; if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return h.n > 40;
}
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] || '') : ''; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function mask(e){ const m = /^(.)(.*)(@.*)$/.exec(e || ''); return m ? m[1] + m[2].replace(/./g, '•').slice(0, 6) + m[3] : ''; }

function page(status, title, msg, tok, button){
  const body = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow"><title>' + esc(title) + ' — GrayCo</title><style>' +
    'body{margin:0;background:#F5F1E8;font-family:Arial,Helvetica,sans-serif;color:#14202E}' +
    '.top{background:#0F1D2F;padding:22px 16px;text-align:center}.top img{width:190px;max-width:70%}' +
    '.card{max-width:520px;margin:-14px auto 24px;background:#fff;border:1px solid #E2DCCD;border-radius:14px;padding:26px 22px;box-sizing:border-box;width:calc(100% - 32px)}' +
    'h1{font-size:22px;margin:0 0 10px}p{font-size:15px;line-height:1.55;margin:0 0 12px}' +
    'button{background:#D4A017;color:#0F1D2F;border:none;border-radius:10px;padding:13px 20px;font-size:15px;font-weight:bold;cursor:pointer;width:100%}' +
    '.foot{text-align:center;color:#55626F;font-size:12px;padding:0 16px 30px;line-height:1.6}</style></head><body>' +
    '<div class="top"><img src="/portal-logo.png" alt="GrayCo Construction Services"></div><div class="card"><h1>' + esc(title) + '</h1>' + msg +
    (button ? '<form method="post" action="/.netlify/functions/news-unsubscribe"><input type="hidden" name="t" value="' + esc(tok) + '"><input type="hidden" name="do" value="' + esc(button.op) + '"><button type="submit">' + esc(button.label) + '</button></form>' : '') +
    '</div><div class="foot">GrayCo Construction Services · ' + news.ADDRESS + ' · ' + news.PHONE + '</div></body></html>';
  return { statusCode: status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }, body: body };
}
const BAD = function(){ return page(400, 'This link is not valid', '<p>This unsubscribe link is not complete or was changed. Use the link at the bottom of the newest GrayCo e-mail, or call us at ' + news.PHONE + ' and we will take you off the list.</p>'); };
const BROKE = function(){ return page(503, 'Something went wrong', '<p>We could not save that just now. Please try the link again in a minute, or call us at ' + news.PHONE + '.</p>'); };

function formOf(event){
  let raw = event.body || '';
  if (event.isBase64Encoded) { try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch (e) { raw = ''; } }
  const out = {};
  try { new URLSearchParams(raw).forEach(function(v, k){ out[k] = v; }); } catch (e) {}
  return out;
}

exports.handler = async function(event){
  event = event || {};
  const ip = hdr(event, 'x-nf-client-connection-ip') || hdr(event, 'x-forwarded-for').split(',')[0] || 'x';
  if (limited(ip)) return page(429, 'Too many tries', '<p>Please wait a few minutes and try again.</p>');
  const q = event.queryStringParameters || {};
  const m = String(event.httpMethod || 'GET').toUpperCase();
  if (m === 'HEAD') return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, body: '' };   /* a link checker: nothing changes */
  if (m === 'GET') {
    const email = news.verify(q.t);
    if (!email) return BAD();
    if (!(await news.unsubscribe(email, 'link').catch(function(){ return false; }))) return BROKE();
    return page(200, 'You’re unsubscribed from GrayCo news',
      '<p><b>' + esc(mask(email)) + '</b> will not get GrayCo newsletters any more.</p>' +
      '<p>You will still get e-mails about your own job — invoices, your portal link, papers you signed and receipts.</p><p>Changed your mind?</p>',
      q.t, { op: 'resubscribe', label: 'Resubscribe to GrayCo news' });
  }
  if (m === 'POST') {
    const f = formOf(event);
    const tok = q.t || f.t;
    const email = news.verify(tok);
    if (!email) return BAD();
    if (f.do === 'resubscribe') {
      if (!(await news.resubscribe(email, 'customer (link)').catch(function(){ return false; }))) return BROKE();
      return page(200, 'Welcome back!', '<p><b>' + esc(mask(email)) + '</b> is on GrayCo news again. Thank you!</p>', tok, { op: 'unsubscribe', label: 'Unsubscribe again' });
    }
    /* RFC 8058 one-click (List-Unsubscribe=One-Click), or the "Unsubscribe again" button */
    if (!(await news.unsubscribe(email, f['List-Unsubscribe'] === 'One-Click' ? 'one-click' : 'link').catch(function(){ return false; }))) return BROKE();
    if (f['List-Unsubscribe'] === 'One-Click') return { statusCode: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: 'Unsubscribed.' };
    return page(200, 'You’re unsubscribed from GrayCo news', '<p><b>' + esc(mask(email)) + '</b> will not get GrayCo newsletters any more.</p>', tok, { op: 'resubscribe', label: 'Resubscribe to GrayCo news' });
  }
  return { statusCode: 405, headers: { 'Content-Type': 'text/plain' }, body: 'Method not allowed' };
};
exports._news = news;
