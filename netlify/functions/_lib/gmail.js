/* netlify/functions/_lib/gmail.js — patch MAILALL: read-only Gmail for every GrayCo mailbox (Google Workspace
   domain-wide delegation; docs/EMAIL-ALL.md).

   A Google service account signs a JWT (RS256, node crypto — no extra packages) and asks Google for an access token
   that acts as one mailbox ("sub"), with ONE scope: gmail.readonly. Nothing here can send, change or delete mail.
   Env (Netlify, Functions scope): GOOGLE_SA_EMAIL, GOOGLE_SA_KEY (the private key PEM — or the whole JSON key file),
   GMAIL_DOMAIN (grayco-cs.com). The key never leaves the server and is never logged. */
'use strict';
const crypto = require('crypto');
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const META_HEADERS = ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID'];
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function b64u(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function fromB64u(v){ return Buffer.from(s(v).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

/* the service account from the env: GOOGLE_SA_KEY may be the PEM (with real or "\n" line breaks) or the whole JSON key */
function account(){
  let key = s(process.env.GOOGLE_SA_KEY), email = s(process.env.GOOGLE_SA_EMAIL);
  if (/^\{/.test(key)) { try { const j = JSON.parse(key); key = s(j.private_key); email = email || s(j.client_email); } catch (e) { key = ''; } }
  key = key.replace(/\\n/g, '\n');
  const domain = low(process.env.GMAIL_DOMAIN || 'grayco-cs.com');
  const ok = !!(email && /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key));
  return { ok, email, key, domain };
}
function configured(){ return account().ok; }
/* the signed assertion Google trades for a token (exported for the tests) */
function jwt(acc, sub, nowSec){
  const iat = nowSec || Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: acc.email, scope: SCOPE, aud: TOKEN_URL, sub: low(sub), iat, exp: iat + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(acc.key);
  return head + '.' + body + '.' + b64u(sig);
}
const TOKENS = {};
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
/* a fetch with backoff on Google's "slow down" answers (429 / 5xx) */
async function gfetch(url, opts, tries){
  tries = tries || 4;
  let r;
  for (let i = 0; i < tries; i++) {
    r = await globalThis.fetch(url, opts);
    if (r.status !== 429 && r.status < 500) return r;
    await sleep(Math.min(4000, 400 * Math.pow(2, i)) + Math.floor(Math.random() * 200));
  }
  return r;
}
async function token(mailbox){
  const acc = account(); if (!acc.ok) throw Object.assign(new Error('Gmail reading is not set up (GOOGLE_SA_EMAIL / GOOGLE_SA_KEY).'), { code: 'not_configured' });
  const box = low(mailbox);
  if (!box.endsWith('@' + acc.domain)) throw Object.assign(new Error('Only ' + acc.domain + ' mailboxes can be read.'), { code: 'bad_mailbox' });
  const c = TOKENS[box]; if (c && c.exp - 120000 > Date.now()) return c.t;
  const r = await gfetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(jwt(acc, box)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw Object.assign(new Error('Google refused access to ' + box + ' (' + (j.error_description || j.error || r.status) + ') — check the domain-wide delegation (client ID + gmail.readonly scope).'), { code: 'denied', status: r.status });
  TOKENS[box] = { t: j.access_token, exp: Date.now() + (parseInt(j.expires_in, 10) || 3600) * 1000 };
  return j.access_token;
}
async function api(mailbox, path, qs){
  const t = await token(mailbox);
  const q = qs ? '?' + Object.keys(qs).filter(k => qs[k] != null && qs[k] !== '').map(k => arr(qs[k]).length ? qs[k].map(v => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') : encodeURIComponent(k) + '=' + encodeURIComponent(qs[k])).join('&') : '';
  const r = await gfetch(API + path + q, { headers: { Authorization: 'Bearer ' + t } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error('Gmail answered ' + r.status + ' for ' + low(mailbox) + (j.error && j.error.message ? ' — ' + j.error.message : '')), { status: r.status });
  return j;
}

/* ── shapes ── */
function hdr(payload, name){ const h = arr(payload && payload.headers).find(x => low(x.name) === low(name)); return h ? s(h.value) : ''; }
function hasAtt(p){ if (!p) return false; if (s(p.filename) && p.body && p.body.attachmentId) return true; return arr(p.parts).some(hasAtt); }
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
function addrs(v){ return Array.from(new Set((s(v).match(EMAIL) || []).map(low))); }
/* one Gmail message (format=metadata or full) → an index row (no body) */
function rowOf(mailbox, m){
  const p = m.payload || {}, from = hdr(p, 'From'), labels = arr(m.labelIds);
  const fromAddr = addrs(from)[0] || '';
  const at = m.internalDate ? new Date(parseInt(m.internalDate, 10)).toISOString() : (Date.parse(hdr(p, 'Date')) ? new Date(hdr(p, 'Date')).toISOString() : new Date().toISOString());
  return { id: s(m.id), thread: s(m.threadId), mid: hdr(p, 'Message-ID'), mailbox: low(mailbox), at, from: fromAddr, fromName: (/^\s*"?([^"<]+?)"?\s*</.exec(from) || [])[1] || '',
    to: addrs(hdr(p, 'To')), cc: addrs(hdr(p, 'Cc')), subject: hdr(p, 'Subject'), snippet: s(m.snippet).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    labels: labels.filter(l => /^(INBOX|SENT|IMPORTANT|STARRED|UNREAD|SPAM|TRASH|DRAFT)$/.test(l)), att: hasAtt(p),
    dir: labels.indexOf('SENT') >= 0 || fromAddr === low(mailbox) ? 'out' : 'in', src: 'gmail' };
}
/* the readable body of a full message: text and html parts, attachment names (never stored — shown once) */
function bodyOf(m){
  let text = '', html = ''; const files = [];
  (function walk(p){
    if (!p) return;
    const type = low(p.mimeType), data = p.body && p.body.data;
    if (s(p.filename)) files.push({ name: s(p.filename), size: (p.body && p.body.size) || 0, type });
    else if (data && type === 'text/plain' && !text) text = fromB64u(data).toString('utf8');
    else if (data && type === 'text/html' && !html) html = fromB64u(data).toString('utf8');
    arr(p.parts).forEach(walk);
  })(m.payload);
  const CAP = 400000;
  return { text: text.slice(0, CAP), html: html.slice(0, CAP), files };
}

async function profile(mailbox){ return api(mailbox, '/profile'); }
async function listIds(mailbox, o){
  o = o || {};
  const qs = { q: s(o.q), maxResults: Math.max(1, Math.min(100, parseInt(o.max, 10) || 25)), pageToken: s(o.pageToken) };
  if (o.label) qs.labelIds = o.label;
  const j = await api(mailbox, '/messages', qs);
  return { ids: arr(j.messages).map(x => s(x.id)), next: s(j.nextPageToken) };
}
async function meta(mailbox, id){ return rowOf(mailbox, await api(mailbox, '/messages/' + encodeURIComponent(id), { format: 'metadata', metadataHeaders: META_HEADERS })); }
async function full(mailbox, id){ const m = await api(mailbox, '/messages/' + encodeURIComponent(id), { format: 'full' }); return { row: rowOf(mailbox, m), body: bodyOf(m) }; }
async function thread(mailbox, id){ const t = await api(mailbox, '/threads/' + encodeURIComponent(id), { format: 'metadata', metadataHeaders: META_HEADERS }); return arr(t.messages).map(m => rowOf(mailbox, m)); }
/* new message ids since a historyId; { reset: true } when Google no longer has that history (start again) */
async function history(mailbox, startId, max){
  const ids = []; let page = '', hid = '';
  for (let i = 0; i < 10; i++) {
    let j;
    try { j = await api(mailbox, '/history', { startHistoryId: startId, historyTypes: 'messageAdded', maxResults: 500, pageToken: page }); }
    catch (e) { if (e.status === 404) return { reset: true }; throw e; }
    arr(j.history).forEach(h => arr(h.messagesAdded).forEach(a => { const id = s(a.message && a.message.id); if (id && ids.indexOf(id) < 0) ids.push(id); }));
    hid = s(j.historyId) || hid; page = s(j.nextPageToken);
    if (!page || ids.length >= (max || 500)) break;
  }
  return { ids, historyId: hid || startId };
}
/* run fns with at most n at once */
async function pool(items, n, fn){
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: e }; } } }));
  return out;
}

module.exports = { SCOPE, TOKEN_URL, API, account, configured, jwt, token, api, rowOf, bodyOf, profile, listIds, meta, full, thread, history, pool,
  _t: { reset: () => { Object.keys(TOKENS).forEach(k => delete TOKENS[k]); }, b64u, fromB64u } };
