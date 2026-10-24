/* ============================================================================
   GrayCo — THE BID INBOX.   netlify/functions/bid-inbox.js        (patch LD, re-anchored as LD2)

   "how can i make the lead tab get all my potential leads, plans, bids etc.
    We get emails but also BuildingConnected, PlanHub and other bid boards …
    I want the lead tab to be constantly getting leads in"

   patch EST4 (owner 10/22): bid NOTICES now go to leads@grayco-cs.com (a Google Group whose member
   leads@in.grayco-cs.com is a Resend receiving address on this webhook); an invitation that reaches leads@
   takes the bid path below, a customer the lead path (website-intake.js).
   patch BIDSEND (owner 10/22): OUR bids go out FROM bids@grayco-cs.com (send-email.js mode 'bid') and GCs reply to
   it, so mail for bids@ is one of THREE kinds (bidsKind, _lib/subbids.js): (a) a GC's REPLY to one of our bids → filed
   on that lead's GC row, urgent ones alert the estimator (_lib/bid-replies.js); (b) a SUBCONTRACTOR's bid (a sub
   bid) → matched to the bid-portal job, the estimator is told (subBidFromEmail); (c) an INVITATION to bid → the bid
   path, so nothing is lost; anything else → "Unsorted bids@ mail" (the estimator says what it is). A GC's reply
   that reaches the e-mail history (mail@in, X9) is filed on its lead as well (the same e-mail once).

   For every e-mail this function:
     1. checks Resend's signature (Svix, RESEND_INBOUND_SECRET), or ?token=BID_INBOX_TOKEN;
     2. ignores mail that is not for bids@ (it shares the webhook with bills@ and
        claims@), mail the CRM sent itself, auto-replies and bounces;
     3. answers Resend at once and does the slow part in bid-inbox-background;
     4. keeps the attachments (plans, specs, addenda) in the private crm-files
        bucket (SHA-256 names, one copy per file), and the e-mail itself as a
        text file, so nothing depends on the mailbox later;
     5. asks Claude (server side, ANTHROPIC_API_KEY) what the e-mail is: the
        board, project, owner/GC, address, bid due, pre-bid, trades, type
        (commercial / insurance / residential / government), plan links, contact;
     6. merges it into gc_kv "gc_lead_inbox": the same project from several
        boards, a reminder or an addendum lands on ONE lead ("also on PlanHub",
        "Addendum #2 received"); a lead someone marked Not interested stays
        dismissed and is never brought back.
   The CRM (tail_LD2.js) collects the list when someone opens it and turns new
   items into leads on the Leads tab (through the CRM's own synced setters).

   LD2 (owner 10/20: "every time a new job is added it goes to our bid portal and our leads in the
   CRM, so we never miss anything … alert admins about new bid opportunities"):
     7. every NEW opportunity also becomes a DRAFT bid job in the bid portal (_lib/bid-portal.js:
        sp_rows / subportal-files, never shown to subs; queued while the portal is not set up), and
        an addendum updates that draft. Only an admin's "Publish to bid portal" makes it public.
     8. the admins are told (_lib/bid-alerts.js, patch LA): ONE e-mail (+ phone push when patch TD's
        push piece is there) the moment an e-mail brings new leads — several bids in one e-mail are one
        message listing them all — with "Bid due Tue Oct 28 2:00 PM" or "Bid due date: NOT FOUND — add it"
        in the subject; then one "⏰ Bid due in 1 hour" (bid-alerts.js, every 10 minutes). No hourly digest.
     9. the bid due date is read from the e-mail text too (_lib/bid-due.js: "Bids due", "Due Date",
        "Bid Date", "Proposals due", "Submission Deadline", BuildingConnected / PlanHub, times and time
        zones, stored as Central time) when the AI left it out or gave the day without the time.
   RoofScout is NOT read here any more: RoofScout leads reach the CRM as LEAD_RS_<id> (patch RSL);
   the inbox page only shows them.

   It never answers the sender. The only e-mail it sends is the admins' alert.

   leads@ (patch STL): leads@grayco-cs.com is a Google Group too; its member leads@in.grayco-cs.com is on the same
   Resend receiving domain and webhook. Mail for leads@ (and not for bids@) — the website's Squarespace form
   notifications, people writing to the company — is handed to website-intake.js fromEmail: an unassigned GrayCo
   lead (source "Website / leads@ e-mail"), the admins' 🌐 new-lead alert, then the speed-to-lead reminders
   (_lib/bid-alerts.js). Mail for bids@ is handled exactly as before.

   orders@ (patch AUTO7): supplier order confirmations. Google Workspace routing ALSO delivers supplier mail sent to
   office@ to orders@in.grayco-cs.com (docs/ORDERS-SETUP.md). Mail for orders@ — or mail to this receiving domain that
   is for none of bids@ / leads@ and is plainly a supplier's order confirmation — goes to _lib/fa-orders.js: a gc_orders
   record matched to the job (PO, address, name), the Site Book delivery, the job schedule, the portal's "Materials
   arriving". Mail for bids@ and leads@ is handled exactly as before.

   DOORS
     POST /.netlify/functions/bid-inbox            Resend webhook (signed)
     GET  ?ping=1                                  alive check, says nothing secret
     GET  ?list=1                                  the inbox for the CRM (staff sign-in), with the bid
                                                   portal's state and the alert queue
     POST ?act=1   {id, op, …}                     the CRM records what a person did
                                                   (imported / assigned / job / dismissed / merged / restore /
                                                    publish — the admin's "Publish to bid portal" /
                                                    due {bidDue} — the bid due date typed on the lead, LA)
     POST ?settings=1 {keywords, exclude, sources} the public-bid watcher's settings (admins)
     POST ?watch=1                                 run the public-bid watcher now (admins)

   ENV (Netlify → Site configuration → Environment variables)
     BID_INBOUND_SECRET      the bids@ webhook's signing secret (whsec_…); or RESEND_INBOUND_SECRET when
                             one secret is shared with the bill / claim inbox webhooks
     RESEND_API_KEY          to fetch the e-mail body and attachments from Resend
     ANTHROPIC_API_KEY       Claude reads the e-mail
     SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
     optional: BID_INBOX_TO (default bids@in.grayco-cs.com,bids@grayco-cs.com),
               LEAD_INBOX_TO (default leads@in.grayco-cs.com,leads@grayco-cs.com),
               ORDER_INBOX_TO (default orders@in.grayco-cs.com,orders@grayco-cs.com — patch AUTO7, supplier orders),
               BID_INBOX_TOKEN, BID_AI_MODEL (default claude-opus-5-5),
               BID_AI_TIMEOUT_MS, BID_INBOX_INLINE=1, LEAD_ADMINS (extra e-mails
               allowed to dismiss/merge; admins on the staff list always can),
               BID_PORTAL_DRAFTS=0 (no bid-portal drafts), OWNER_EMAILS / BID_ALERT_TO /
               BID_ALERTS_OFF=1 / BID_ALERT_FROM / CRM_URL (the admins' alerts)
   ========================================================================== */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */

const crypto = require('crypto');
const BD = require('./_lib/bid-due.js');

const KV = 'gc_lead_inbox', KV_SET = 'gc_lead_inbox_settings', KV_NOTE = 'gc_lead_inbox_notices';
const KEEP_ACTIVE = 600, KEEP_DISMISSED = 3000;
const MAX_BYTES = 25 * 1024 * 1024, MAX_FILES = 15, AI_MAX_BYTES = 20 * 1024 * 1024;
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const OK_TYPES = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'image/tiff': 'tif',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip', 'application/x-zip-compressed': 'zip', 'text/csv': 'csv', 'application/rtf': 'rtf', 'text/plain': 'txt'
};
const EXT_TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip', csv: 'text/csv', rtf: 'application/rtf',
  dwg: 'application/octet-stream', dxf: 'application/octet-stream' };
const AI_TYPES = { 'application/pdf': 'document', 'image/jpeg': 'image', 'image/png': 'image', 'image/gif': 'image', 'image/webp': 'image' };
const SOURCES = ['BuildingConnected', 'PlanHub', 'A&B Planroom', 'RKA Planroom', 'GC direct', 'Government', 'Other'];
const TYPES = ['commercial', 'insurance', 'residential', 'government'];

/* ── env, read at call time (tests change it) ───────────────────────────────── */
function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function sbUrl(){ return (env('SUPABASE_URL') || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function sbKey(){ return env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY'); }
function dbReady(){ return !!(sbUrl() && sbKey()); }

/* ── small helpers ─────────────────────────────────────────────────────────── */
function s(v){ return (v == null ? '' : String(v)).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function nowIso(){ return new Date().toISOString(); }
function sha256(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
function same(a, b){ a = Buffer.from(s(a)); b = Buffer.from(s(b)); if (!a.length || a.length !== b.length) return false; try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; } }
function hdrs(event){ const h = {}; Object.keys((event && event.headers) || {}).forEach(k => { h[low(k)] = event.headers[k]; }); return h; }
function rawBody(event){ return event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || ''); }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
function cors(event){
  const allowed = (env('SITE_ORIGIN') || GC_DEFAULT_ORIGINS).split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const origin = s(hdrs(event).origin).replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function addr(v){
  let t = v; if (Array.isArray(t)) t = t[0]; if (t && typeof t === 'object') t = t.email || t.address || t.value || '';
  t = s(t); const m = t.match(/<([^>]+)>/); const email = low(m ? m[1] : t).replace(/^mailto:/, '');
  const name = s(m ? t.slice(0, t.indexOf('<')) : '').replace(/^"|"$/g, '');
  return { name, email, domain: email.indexOf('@') > 0 ? email.split('@').pop() : '' };
}
function list(v){ return (Array.isArray(v) ? v : (v ? String(v).split(',') : [])).map(addr).filter(x => x.email); }
function decodeEntities(t){ return String(t || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#039;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)); }
function htmlToText(h){ return s(decodeEntities(String(h || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n')); }
function headerMap(h){ const o = {}; if (Array.isArray(h)) h.forEach(x => { if (x && x.name) o[low(x.name)] = s(x.value); }); else if (h && typeof h === 'object') Object.keys(h).forEach(k => { o[low(k)] = Array.isArray(h[k]) ? h[k].map(s).join(', ') : s(h[k]); }); return o; }

/* ── dates: "Bid due Oct 30, 2026 2:00 PM CDT" → "2026-10-30" + "14:00" ─────── */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function pad(n){ return ('0' + n).slice(-2); }
function isoDay(v){
  const t = s(v); if (!t) return '';
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; if (+m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) return y + '-' + pad(m[1]) + '-' + pad(m[2]); }
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i); if (m) return m[3] + '-' + pad(MONTHS[low(m[1]).slice(0, 4)] || MONTHS[low(m[1]).slice(0, 3)]) + '-' + pad(m[2]);
  m = t.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i); if (m) return m[3] + '-' + pad(MONTHS[low(m[2]).slice(0, 3)]) + '-' + pad(m[1]);
  return '';
}
function hhmm(v){
  const t = s(v); if (!t) return '';
  let m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/i);
  if (m) { let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12; return pad(h) + ':' + (m[2] || '00'); }
  if (/\bnoon\b/i.test(t)) return '12:00';
  m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/); if (m) return pad(m[1]) + ':' + m[2];
  return '';
}
function dueOf(day, time){ const d = isoDay(day); if (!d) return ''; const t = hhmm(time) || hhmm(day); return t ? d + 'T' + t : d; }

/* ── 1. is this really Resend? (Svix signature, or a secret path token) ────── */
function svixOk(raw, h, secret){
  secret = s(secret); if (!secret) return false;
  const id = s(h['svix-id'] || h['webhook-id']), ts = s(h['svix-timestamp'] || h['webhook-timestamp']), sigs = s(h['svix-signature'] || h['webhook-signature']);
  if (!id || !ts || !sigs) return false;
  const t = parseInt(ts, 10); if (!isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  let key; try { key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64'); } catch (e) { return false; }
  if (!key.length) return false;
  const want = crypto.createHmac('sha256', key).update(id + '.' + ts + '.' + raw, 'utf8').digest('base64');
  return sigs.split(/\s+/).some(p => { const i = p.indexOf(','); return i > 0 && p.slice(0, i) === 'v1' && same(p.slice(i + 1), want); });
}
function verified(event, raw){
  /* each Resend webhook has its own signing secret: BID_INBOUND_SECRET for the bids@ webhook, else the shared one */
  const h = hdrs(event), qs = event.queryStringParameters || {}, tok = env('BID_INBOX_TOKEN');
  const secrets = [env('BID_INBOUND_SECRET'), env('RESEND_INBOUND_SECRET')].filter(Boolean);
  if (!secrets.length && !tok) return { ok: false, code: 503, why: 'The bid inbox is not set up yet (BID_INBOUND_SECRET or RESEND_INBOUND_SECRET on Netlify).' };
  if (secrets.some(sec => svixOk(raw, h, sec))) return { ok: true, how: 'svix' };
  if (tok && same(qs.token, tok)) return { ok: true, how: 'token' };
  return { ok: false, code: 401, why: 'Not signed by Resend.' };
}

/* ── hand-off to the background function, signed with the same secret ────── */
function handoffKey(){ return env('BID_INBOUND_SECRET') || env('RESEND_INBOUND_SECRET') || env('BID_INBOX_TOKEN'); }
function handoffSig(ts, body){ return crypto.createHmac('sha256', 'bid-handoff:' + handoffKey()).update(ts + '.' + body, 'utf8').digest('hex'); }
function handoffOk(event, raw){
  const h = hdrs(event), ts = s(h['x-bid-ts']);
  if (!handoffKey() || !ts || Math.abs(Date.now() - parseInt(ts, 10)) > 120000) return false;
  return same(h['x-bid-handoff'], handoffSig(ts, raw));
}
async function handOff(raw){
  const base = (env('URL') || env('DEPLOY_PRIME_URL')).replace(/\/$/, '');
  if (!base || env('BID_INBOX_INLINE') === '1' || raw.length > 400000 || !handoffKey()) return false;
  const ts = String(Date.now());
  try {
    const r = await fetch(base + '/.netlify/functions/bid-inbox-background', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bid-ts': ts, 'x-bid-handoff': handoffSig(ts, raw) }, body: raw });
    return r.status === 202 || r.ok;
  } catch (e) { return false; }
}

/* ── the database and the file store (service key, server side only) ───────── */
function svcH(extra){ return Object.assign({ apikey: sbKey(), Authorization: 'Bearer ' + sbKey() }, extra || {}); }
function sb(path, opts){
  opts = opts || {};
  return fetch(sbUrl() + '/rest/v1/' + path, { method: opts.method || 'GET',
    headers: svcH(Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {})), body: opts.body });
}
function parseVal(v){ if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { return JSON.parse(v); } catch (e) {} } return v; }
/* the inbox's own table (docs/lead-inbox.sql: service key only, never synced to a browser);
   gc_kv until that SQL has run, so a deploy before the SQL still works */
let KVT = null, KVT_AT = 0;
async function kvTable(){
  if (KVT && Date.now() - KVT_AT < 300000) return KVT;
  const r = await sb('gc_lead_inbox_kv?select=key&limit=1');
  if (r.ok) KVT = 'gc_lead_inbox_kv';
  else {
    const t = await r.text().catch(() => '');
    if (r.status === 404 || /PGRST20[0-9]|does not exist|schema cache/i.test(t)) KVT = 'gc_kv';
    else throw new Error('database unavailable (' + r.status + ')');   /* never guess the store on a hiccup */
  }
  KVT_AT = Date.now(); return KVT;
}
async function kvRead(key){
  const T = await kvTable();
  const r = await sb(T + '?select=value,updated_at&key=eq.' + encodeURIComponent(key));
  if (!r.ok) throw new Error('database read failed (' + r.status + ')');
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) return { exists: false, v: null, at: '' };
  return { exists: true, v: parseVal(rows[0].value), at: s(rows[0].updated_at) };
}
async function kvGet(key){ try { return (await kvRead(key)).v; } catch (e) { return null; } }
/* read → change → write only if nobody wrote in between (compare-and-set on updated_at); retried */
async function kvCas(key, change, tries){
  tries = tries || 6;
  const T = await kvTable();
  for (let i = 0; i < tries; i++) {
    const cur = await kvRead(key);
    const next = change(cur.v == null ? null : JSON.parse(JSON.stringify(cur.v)));
    if (next === undefined) return { ok: true, unchanged: true, value: cur.v };
    const at = nowIso();
    let r;
    if (cur.exists) {
      r = await sb(T + '?key=eq.' + encodeURIComponent(key) + '&updated_at=eq.' + encodeURIComponent(cur.at), { method: 'PATCH',
        headers: { Prefer: 'return=representation' }, body: JSON.stringify({ value: next, updated_at: at }) });
      if (r.ok) { const rows = await r.json().catch(() => []); if (Array.isArray(rows) && rows.length) return { ok: true, value: next }; }
      else if (r.status >= 500) throw new Error('database write failed (' + r.status + ')');
    } else {
      r = await sb(T, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ key, value: next, updated_at: at }) });
      if (r.ok) return { ok: true, value: next };
      if (r.status >= 500) throw new Error('database write failed (' + r.status + ')');
    }
    await new Promise(res => setTimeout(res, 120 + Math.floor(Math.random() * 400)));
  }
  throw new Error('the lead inbox was busy — try again');
}
async function kvPut(key, value){
  const r = await sb((await kvTable()) + '?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key, value, updated_at: nowIso() }) });
  return r.ok;
}
/* same name the CRM gives a stored file: sb:crm-files/<sha256>.<ext> */
async function storeFile(buf, type, name){
  const extName = low(s(name).split('.').pop());
  const ext = OK_TYPES[type] || (EXT_TYPES[extName] ? extName : 'bin'), hash = sha256(buf), path = hash + '.' + ext, ref = 'sb:crm-files/' + path;
  try {
    const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST',
      headers: svcH({ 'Content-Type': type || 'application/octet-stream', 'x-upsert': 'false', 'cache-control': '3600' }), body: buf });
    if (r.ok || r.status === 409) return { ref, hash, stored: true };
    const t = await r.text().catch(() => '');
    if (r.status === 400 && /exist|duplicate/i.test(t)) return { ref, hash, stored: true };
    return { ref: '', hash, stored: false, why: 'storage ' + r.status };
  } catch (e) { return { ref: '', hash, stored: false, why: 'storage unreachable' }; }
}

/* ── 2. the e-mail itself, from Resend (the webhook carries metadata only) ─── */
async function resendGet(path){
  const key = env('RESEND_API_KEY'); if (!key) return null;
  try { const r = await fetch('https://api.resend.com' + path, { headers: { Authorization: 'Bearer ' + key } }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
function typeOf(a){
  let t = low(a.content_type || a.contentType || a.type || a.mime_type || a.mimeType).split(';')[0];
  const ext = low(s(a.filename || a.name).split('.').pop());
  if ((!t || /octet-stream/.test(t)) && EXT_TYPES[ext]) t = EXT_TYPES[ext];
  if (t === 'image/jpg') t = 'image/jpeg';
  if (/octet-stream/.test(t) && /^(dwg|dxf)$/.test(ext)) t = 'application/octet-stream';
  return t;
}
function keepType(type, name){ return !!OK_TYPES[type] || (type === 'application/octet-stream' && /\.(dwg|dxf)$/i.test(name)); }
async function readMail(data){
  const d = data || {};
  const id = s(d.email_id || d.emailId || d.id);
  let full = id ? await resendGet('/emails/receiving/' + encodeURIComponent(id)) : null;
  if (full && full.data && !full.subject && !full.text) full = full.data;
  const m = Object.assign({}, d, full || {});
  let atts = arr(d.attachments).slice();
  if (id) {   /* always ask: the webhook does not always list the attachments */
    const al = await resendGet('/emails/receiving/' + encodeURIComponent(id) + '/attachments');
    const a2 = al && (Array.isArray(al.data) ? al.data : (Array.isArray(al) ? al : null));
    if (a2 && a2.length) { const by = {}; atts.forEach(a => { if (a && a.id) by[a.id] = a; }); atts = a2.map(a => Object.assign({}, by[a.id] || {}, a)); }
  } else if (full && arr(full.attachments).length) atts = full.attachments;
  const files = [], skipped = [];
  for (const a of atts) {
    if (!a || typeof a !== 'object') continue;
    const name = s(a.filename || a.name) || 'attachment', type = typeOf(a);
    if (!keepType(type, name)) { skipped.push({ name, why: 'file type not kept' }); continue; }
    if (a.size != null && +a.size > MAX_BYTES) { skipped.push({ name, why: 'over 25 MB — use the plan link instead' }); continue; }
    if (files.length >= MAX_FILES) { skipped.push({ name, why: 'more than ' + MAX_FILES + ' files in one e-mail' }); continue; }
    let buf = null;
    if (a.content) { try { buf = Buffer.from(String(a.content), 'base64'); } catch (e) {} }
    else if (a.download_url || a.downloadUrl || a.url) { try { const r = await fetch(a.download_url || a.downloadUrl || a.url); if (r.ok) buf = Buffer.from(await r.arrayBuffer()); } catch (e) {} }
    if (!buf || !buf.length) { skipped.push({ name, why: 'could not be downloaded' }); continue; }
    if (buf.length > MAX_BYTES) { skipped.push({ name, why: 'over 25 MB — use the plan link instead' }); continue; }
    if (type === 'application/pdf' && buf.slice(0, 5).toString('latin1') !== '%PDF-') { skipped.push({ name, why: 'not a real PDF' }); continue; }
    files.push({ name, type, size: buf.length, buf });
  }
  const html = s(m.html);
  return { id, from: addr(m.from || d.from), to: list(m.to || d.to), cc: list(m.cc || d.cc), subject: s(m.subject || d.subject),
    text: (s(m.text) || htmlToText(html)).slice(0, 40000), html: html.slice(0, 400000), date: s(m.created_at || d.created_at),
    files, skipped, headers: headerMap(m.headers || d.headers), messageId: s(m.message_id || (headerMap(m.headers || d.headers)['message-id'])) };
}

/* ── 3. routing: only bids@ mail; never our own; never auto-replies ─────────── */
function inboxAddrs(){ return (env('BID_INBOX_TO') || 'bids@in.grayco-cs.com,bids@grayco-cs.com').split(',').map(low).filter(Boolean); }
function recipients(mail, data){
  const H = mail.headers || {};
  return list((data || {}).to).concat(list((data || {}).cc), mail.to, mail.cc).map(x => x.email)
    .concat([H['x-forwarded-to'], H['delivered-to'], H['x-original-to'], H['x-google-original-to'], H['envelope-to']].join(',').split(',').map(x => addr(x).email)).filter(Boolean);
}
function leadAddrs(){ return (env('LEAD_INBOX_TO') || 'leads@in.grayco-cs.com,leads@grayco-cs.com').split(',').map(low).filter(Boolean); }
function forLeads(mail, data){ return forBids(mail, data, leadAddrs()); }
/* patch AUTO7: orders@ — supplier order confirmations (Google routing copies them from office@) */
/* patch ESTIN: estimates@ — kept in gc_kv gc_estin_inbox (the files in crm-files); an admin / office computer makes the estimates */
function estimateAddrs(){ return (env('ESTIMATE_INBOX_TO') || 'estimates@in.grayco-cs.com,estimates@grayco-cs.com').split(',').map(low).filter(Boolean); }
function forEstimates(mail, data){ return forBids(mail, data, estimateAddrs()); }
async function estimateMail(mail){
  const id = 'eml_' + itemId('estimate|' + (mail.messageId || mail.id || (mail.from.email + mail.subject + mail.date)));
  const have = arr(await kvGet('gc_estin_inbox'));
  if (have.some(x => x && x.id === id)) return { ok: true, already: true, id };
  const files = [];
  for (const f of (mail.files || [])) { if (!/\.(pdf|docx|xlsx|csv|txt)$/i.test(s(f.name))) continue; const st = await storeFile(f.buf, f.type, f.name); files.push({ name: f.name, type: f.type, size: f.size, ref: st.ref }); }
  const rec = { id, at: nowIso(), from: mail.from.email, fromName: s(mail.from.name), subject: s(mail.subject).slice(0, 240), text: s(mail.text).slice(0, 6000), files };
  await kvCas('gc_estin_inbox', v => arr(v).filter(x => x && x.id !== id).concat([rec]).slice(-300));
  return { ok: true, id, files: files.length };
}
function orderAddrs(){ return (env('ORDER_INBOX_TO') || 'orders@in.grayco-cs.com,orders@grayco-cs.com').split(',').map(low).filter(Boolean); }
function forOrders(mail, data){ return forBids(mail, data, orderAddrs()); }
function forBids(mail, data, addrs){
  const want = addrs || inboxAddrs(), H = mail.headers || {};
  if (recipients(mail, data).some(x => want.indexOf(x) >= 0)) return true;
  /* a Google Group keeps its own address in List-Id: <bids.grayco-cs.com> */
  const lid = low(H['list-id']);
  return want.some(w => { const p = w.split('@'); return p.length === 2 && lid.indexOf(p[0] + '.' + p[1]) >= 0; });
}
/* the webhook names the bill / claim inbox and not ours: theirs (checked again on the full e-mail) */
function otherInbox(data){
  const d = data || {}, want = inboxAddrs();
  const others = (env('BID_OTHER_INBOXES') || 'bills@in.grayco-cs.com,claims@in.grayco-cs.com,billing@grayco-cs.com,claims@grayco-cs.com').split(',').map(low).filter(Boolean);
  const to = list(d.to).concat(list(d.cc)).map(x => x.email);
  return to.length > 0 && !to.some(x => want.indexOf(x) >= 0) && to.some(x => others.indexOf(x) >= 0);
}
function ownOrAuto(mail){
  const H = mail.headers || {};
  const mine = (env('BID_IGNORE_FROM') || 'bids@grayco-cs.com,leads@grayco-cs.com,noreply@grayco-cs.com,portal@grayco-cs.com,billing@grayco-cs.com,claims@grayco-cs.com').split(',').map(low);
  if (mine.indexOf(mail.from.email) >= 0) return 'sent by the CRM';
  if (H['x-grayco-crm'] || H['x-grayco-item']) return 'sent by the CRM (header)';
  const a = low(H['auto-submitted']); if (a && a !== 'no' && !/auto-generated/.test(a)) return 'automatic reply';
  if (/^(out of office|automatic reply|auto(matic)?[- ]?reply|undeliverable|delivery status notification|mail delivery)/i.test(mail.subject)) return 'automatic reply';
  if (/^(mailer-daemon|postmaster)@/.test(mail.from.email)) return 'bounce';
  return '';
}

/* ── 4. links and the board each one belongs to ───────────────────────────── */
const BOARDS = [
  [/(^|\.)buildingconnected\.com$/, 'BuildingConnected'], [/(^|\.)planhub\.com$/, 'PlanHub'],
  [/(^|\.)aandbplanroom\.com$/, 'A&B Planroom'], [/(^|\.)rkaplanroom\.com$/, 'RKA Planroom'],
  [/(^|\.)(isqft|constructconnect|bidclerk|cmdgroup|dodge|construction)\.com$/, 'ConstructConnect/Dodge'],
  [/(^|\.)(procore|smartbidnet|pipelinesuite|bidmail|bidplanroom|e-builder|textura|plangrid|bluebeam|planswift)\.(com|net)$/, 'Bid platform'],
  [/(^|\.)(ionwave\.net|bidnetdirect\.com|centralbidding\.com|demandstar\.com|bonfirehub\.com|opengov\.com|periscopeholdings\.com|bidsync\.com|questcdn\.com|arbuy\.arkansas\.gov|ms\.gov|tn\.gov|arkansas\.gov)$/, 'Government'],
  [/(^|\.)(memphistn|shelbycountytn|shelbycountybids|scsk12|mlgw|flymemphis|desotocountyms|southaven|olivebranchms|cityofsouthaven|hernandoms)\.(gov|org|com)$/, 'Government']
];
function boardOf(host){ host = low(host); for (const b of BOARDS) if (b[0].test(host)) return b[1]; if (/\.gov$|\.k12\.|\.us$/.test(host)) return 'Government'; return ''; }
const FILE_HOSTS = /(^|\.)(dropbox\.com|box\.com|drive\.google\.com|docs\.google\.com|sharefile\.com|egnyte\.com|onedrive\.live\.com|1drv\.ms|sharepoint\.com|wetransfer\.com|we\.tl|hightail\.com)$/;
const JUNK_LINK = /unsubscribe|optout|opt-out|preferences|privacy|terms|facebook\.com|twitter\.com|x\.com\/|linkedin\.com|instagram\.com|youtube\.com|apple\.com\/app|play\.google\.com|mailto:|tel:|\.(png|jpg|gif)(\?|$)|tracking|\/o\/[A-Za-z0-9]{20,}|list-manage|sendgrid\.net\/wf\/open|google\.com\/maps/i;
function linksOf(mail){
  const out = [], seen = {};
  const add = (url, label) => {
    url = decodeEntities(s(url)).replace(/[)>\].,;'"]+$/, '');
    if (!/^https?:\/\//i.test(url) || JUNK_LINK.test(url) || url.length > 1200) return;
    let host = ''; try { host = new URL(url).hostname; } catch (e) { return; }
    const key = url.replace(/[#?].*$/, '').toLowerCase(); if (seen[key]) return; seen[key] = 1;
    const board = boardOf(host), files = FILE_HOSTS.test(host);
    if (!board && !files && !/plan|bid|spec|drawing|document|project|addend|invite|rfp|rfq|download|file/i.test(url + ' ' + label)) return;
    out.push({ url, label: s(label).replace(/\s+/g, ' ').slice(0, 80) || (board || host), board: board || (files ? 'File share' : ''), host });
  };
  String(mail.html || '').replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => { add(href, htmlToText(inner)); return m; });
  String(mail.text || '').replace(/https?:\/\/[^\s<>"')\]]+/g, (u) => { add(u, ''); return u; });
  return out.slice(0, 25);
}
/* the board that sent it: the sender's domain, a forwarded "From:" line, or the links */
function sourceHint(mail, links){
  const doms = [mail.from.domain];
  const fwd = String(mail.text || '').match(/(?:^|\n)\s*(?:from|de)\s*:\s*[^\n<]*<?([a-z0-9._%+-]+@[a-z0-9.-]+)>?/gi) || [];
  fwd.forEach(l => { const m = l.match(/@([a-z0-9.-]+)/i); if (m) doms.push(low(m[1])); });
  for (const d of doms) { const b = boardOf(d); if (b && b !== 'Bid platform' && b !== 'ConstructConnect/Dodge') return b; }
  const counts = {}; links.forEach(l => { if (l.board && SOURCES.indexOf(l.board) >= 0) counts[l.board] = (counts[l.board] || 0) + 1; });
  const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  return best || '';
}

/* ── 5. Claude reads the e-mail ────────────────────────────────────────────── */
const LEAD_TOOL = {
  name: 'record_bid_leads',
  description: 'Record what this e-mail is and every construction project / bid opportunity it announces for GrayCo Construction Services.',
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['invitation', 'addendum', 'planroom_notice', 'public_bid', 'gc_direct', 'reminder_or_update', 'not_a_lead'],
        description: 'invitation = invited to bid by a GC or a board; addendum = an addendum / revised documents / bid date change for a project; planroom_notice = a planroom or bid board telling of new projects; public_bid = a government solicitation notice; gc_direct = a GC or owner writing directly about a project; reminder_or_update = a reminder or update on a project already announced; not_a_lead = anything else (advertising, newsletters, invoices, spam, account notices)' },
      leads: { type: 'array', items: { type: 'object', properties: {
        source_board: { type: 'string', enum: SOURCES, description: 'where the opportunity came from' },
        project_name: { type: 'string' }, owner: { type: 'string', description: 'the building owner / public agency' },
        gc_name: { type: 'string', description: 'the general contractor inviting bids, if any (not GrayCo)' },
        address: { type: 'string' }, city: { type: 'string' }, state: { type: 'string', description: '2-letter' }, zip: { type: 'string' },
        bid_due_date: { type: 'string', description: 'YYYY-MM-DD or empty' }, bid_due_time: { type: 'string', description: 'HH:MM 24-hour local time or empty' },
        prebid_date: { type: 'string', description: 'YYYY-MM-DD or empty' }, prebid_time: { type: 'string' }, prebid_location: { type: 'string' }, prebid_mandatory: { type: 'boolean' },
        trades: { type: 'array', items: { type: 'string' }, description: 'trades / bid packages asked for, e.g. roofing, drywall, general' },
        scope_summary: { type: 'string', description: 'one or two sentences' },
        lead_type: { type: 'string', enum: TYPES, description: 'insurance = storm/fire/water claim work for an insured owner; government = a public agency is the owner; residential = a home; else commercial' },
        bid_number: { type: 'string', description: 'solicitation / bid / project number as printed' },
        addendum_number: { type: ['integer', 'null'] },
        plans_links: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, label: { type: 'string' } } } },
        contact_name: { type: 'string' }, contact_email: { type: 'string' }, contact_phone: { type: 'string' },
        submit_to_company: { type: 'string', description: 'who the bid is due TO: the GC / company / agency that receives it' },
        submit_to_contact: { type: 'string', description: 'the person the bid goes to' }, submit_to_email: { type: 'string' }, submit_to_phone: { type: 'string' },
        submit_method: { type: 'string', enum: ['email', 'portal', 'sealed', 'in_person', 'other', ''], description: 'how the bid is submitted: e-mail, an online portal / bid board, a sealed bid delivered, in person' },
        submit_where: { type: 'string', description: 'the e-mail address, the portal name / link, or the delivery address' },
        bond_required: { type: 'boolean' }, prevailing_wage: { type: 'boolean' }, estimated_value: { type: ['number', 'null'] },
        attachment_indexes: { type: 'array', items: { type: 'integer' }, description: '0-based attachments that belong to this project' },
        notes: { type: 'string' }, confidence: { type: 'number' }
      }, required: ['project_name'] } }
    },
    required: ['kind', 'leads']
  }
};
function aiPrompt(mail, links, hint){
  return 'You sort incoming bid e-mail for GrayCo Construction Services, a roofing, insurance restoration, residential and commercial contractor in Bartlett, TN '
    + '(Memphis metro, North Mississippi, Arkansas). The e-mail below reached the GrayCo bid / leads inbox (leads@grayco-cs.com). It may be a BuildingConnected or PlanHub invitation, a planroom '
    + 'notice, a public bid notice, a GC writing directly, an addendum, a reminder, or not a lead at all.\n'
    + 'Call the record_bid_leads tool exactly once with what you find. One entry per project (a digest listing three projects gives three entries). '
    + 'Use only what is written in the e-mail and its attachments: leave a field empty rather than guess. GrayCo is never the GC or the owner. '
    + 'Dates as YYYY-MM-DD, times as 24-hour HH:MM local time. Always give the bid due date and who the bid is due to (submit_to_*) and how it is submitted when written. For an addendum, set addendum_number. For something that is not a bid opportunity, use kind "not_a_lead" and an empty leads list.\n\n'
    + 'From: ' + (mail.from.name ? mail.from.name + ' ' : '') + '<' + mail.from.email + '>' + (hint ? ' (looks like: ' + hint + ')' : '') + '\nSubject: ' + mail.subject + '\n'
    + 'Attachments: ' + (mail.files.length ? mail.files.map((f, i) => i + ': ' + f.name + ' (' + f.type + ')').join(', ') : 'none') + '\n'
    + 'Links found: ' + (links.length ? links.slice(0, 15).map(l => l.url + (l.label ? ' [' + l.label + ']' : '')).join('\n  ') : 'none') + '\n\n'
    + 'E-mail text:\n' + (mail.text || '(empty)').slice(0, 15000);
}
function parseLoose(text){
  const t = s(text).replace(/^```(?:json)?/i, '').replace(/```$/, '');
  try { return JSON.parse(t); } catch (e) {}
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (e) {} }
  return null;
}
async function callClaude(body, ms){
  const key = env('ANTHROPIC_API_KEY');
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    if (body.fallbacks) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctl.signal, headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    return { status: r.status, ok: r.ok, j };
  } finally { clearTimeout(timer); }
}
async function extract(mail, links, hint, maxMs){
  if (!env('ANTHROPIC_API_KEY')) return { ok: false, why: 'ANTHROPIC_API_KEY is not set', kind: '', leads: [] };
  const content = []; let bytes = 0; const sent = [];
  mail.files.forEach((f, i) => {
    const kind = AI_TYPES[f.type]; if (!kind || bytes + f.size > AI_MAX_BYTES) return;
    bytes += f.size; sent.push(i);
    content.push({ type: kind, source: { type: 'base64', media_type: f.type, data: f.buf.toString('base64') } });
  });
  content.push({ type: 'text', text: aiPrompt(mail, links, hint) });
  /* tool_choice "auto" + an instruction: the current models refuse a forced tool choice */
  const body = { model: env('BID_AI_MODEL') || 'claude-opus-5-5', max_tokens: 8000, tools: [LEAD_TOOL], tool_choice: { type: 'auto' },
    output_config: { effort: env('BID_AI_EFFORT') || 'low' }, fallbacks: 'default', messages: [{ role: 'user', content }] };
  let ms = parseInt(env('BID_AI_TIMEOUT_MS') || '150000', 10); if (maxMs && maxMs < ms) ms = maxMs;
  try {
    let r = await callClaude(body, ms);
    if (r.status === 400 && /fallback/i.test(JSON.stringify(r.j || ''))) { delete body.fallbacks; r = await callClaude(body, ms); }
    if (!r.ok || !r.j) return { ok: false, why: 'AI answered ' + r.status, kind: '', leads: [], sent };
    if (r.j.stop_reason === 'refusal') return { ok: false, why: 'AI declined to read it', kind: '', leads: [], sent };
    const blocks = arr(r.j.content);
    const tool = blocks.find(b => b && b.type === 'tool_use' && b.name === LEAD_TOOL.name);
    let out = tool && tool.input;
    if (!out) out = parseLoose(blocks.filter(b => b && b.type === 'text').map(b => b.text).join('\n'));
    if (!out || typeof out !== 'object') return { ok: false, why: 'AI gave no answer', kind: '', leads: [], sent };
    return { ok: true, kind: s(out.kind), leads: arr(out.leads).filter(x => x && typeof x === 'object').slice(0, 12), sent, model: body.model };
  } catch (e) {
    return { ok: false, why: e && e.name === 'AbortError' ? 'AI timed out' : 'AI unreachable', kind: '', leads: [], sent };
  }
}

/* ── 6. one lead per project: normalise, match, merge ─────────────────────── */
const STOP = { the: 1, a: 1, an: 1, of: 1, for: 1, and: 1, at: 1, to: 1, in: 1, on: 1, project: 1, bid: 1, bids: 1, invite: 1, invitation: 1, request: 1, proposal: 1, proposals: 1, rfp: 1, rfq: 1, itb: 1, ifb: 1, new: 1, rebid: 1, re: 1, fw: 1, fwd: 1,
  /* a GC inviting per trade package: "X – Roofing" and "X – Drywall" are one project */
  roofing: 1, drywall: 1, framing: 1, package: 1, packages: 1, trade: 1, trades: 1, scope: 1, bp: 1 };
const ABBR = { bldg: 'building', blds: 'buildings', ctr: 'center', cntr: 'center', centre: 'center', hs: 'high school', ms: 'middle school', es: 'elementary school', elem: 'elementary', sch: 'school',
  hosp: 'hospital', med: 'medical', ofc: 'office', univ: 'university', dept: 'department', fac: 'facility', reno: 'renovation', renovations: 'renovation', repairs: 'repair', roofs: 'roof',
  reroofing: 'reroof', 're-roof': 'reroof', st: 'saint', mt: 'mount', ft: 'fort', no: 'number', ph: 'phase', bldgs: 'buildings' };
function normTitle(t){
  return low(t).replace(/\bre-roof/g, 'reroof').replace(/\b(roof(ing)? replacement|replace(ment of)? (the )?roof(ing)?|roof(ing)? replace)\b/g, 'reroof').replace(/^((re|fw|fwd)\s*:\s*)+/g, '').replace(/\b(bid invite|invitation to bid|request for (bid|budgeting|proposal|quote)s?)\s*(from [^:]+)?:/g, ' ')
    .replace(/\baddend(um|a)\s*(no\.?|number|#)?\s*\d+\b/g, ' ').replace(/\bre-?bid\b/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/).map(w => ABBR[w] || w).join(' ').split(/\s+/).filter(w => w && !STOP[w]).join(' ').trim();
}
function normCity(c){ return low(c).replace(/,.*$/, '').replace(/\b(tn|ms|ar|tennessee|mississippi|arkansas|city of)\b/g, '').replace(/[^a-z ]+/g, '').replace(/\s+/g, ' ').trim(); }
function normNum(n){ const v = low(n).replace(/[^a-z0-9]+/g, ''); return v.length >= 4 ? v : ''; }
function tokens(t){ return normTitle(t).split(' ').filter(Boolean); }
function jaccard(a, b){ const A = {}, B = {}; a.forEach(x => A[x] = 1); b.forEach(x => B[x] = 1); const all = Object.keys(Object.assign({}, A, B)); if (!all.length) return 0; return all.filter(x => A[x] && B[x]).length / all.length; }
function dayOf(due){ return s(due).slice(0, 10); }
function dueGap(a, b){ if (!a || !b) return 0; return Math.abs(Date.parse(dayOf(a)) - Date.parse(dayOf(b))) / 86400000; }
function liveTarget(items, it){ let x = it, n = 0; while (x && x.status === 'merged' && x.mergedInto && n++ < 10) x = items.find(y => y.id === x.mergedInto) || null; return x || it; }
/* the existing item this record belongs to, or null */
function findMatch(items, rec){
  /* patch WEB: a website / Business Brain lead is one person's request — matched only by its own id, and never a bid's match */
  if (rec.origin === 'website' || rec.origin === 'brain') return items.find(x => x && x.id === rec.id) || null;
  const num = normNum(rec.bidNumber), nt = normTitle(rec.title), tk = tokens(rec.title), city = normCity(rec.city);
  let best = null, bestScore = 0;
  for (const it of items) {
    if (!it || it.id === rec.id) continue;
    if (it.origin === 'website' || it.origin === 'brain') continue;   /* patch WEB */
    if (rec.watchKey && arr(it.watchKeys).indexOf(rec.watchKey) >= 0) return it;
    if (rec.emailId && arr(it.emailIds).indexOf(rec.emailId) >= 0 && normTitle(it.title) === nt) return it;
    const ic = normCity(it.city), cityOk = !city || !ic || ic === city;
    const farApart = !rec.addendum && dueGap(rec.bidDue, it.bidDue) > 30;
    if (!cityOk || farApart) continue;
    let sc = 0;
    if (num && normNum(it.bidNumber) === num) sc = 1;
    else if (nt && normTitle(it.title) === nt) sc = 0.95;
    else {
      const j = jaccard(tk, tokens(it.title));
      const sameDay = rec.bidDue && it.bidDue && dayOf(rec.bidDue) === dayOf(it.bidDue);
      if (j >= 0.67 && city && ic && (sameDay || !rec.bidDue || !it.bidDue || rec.addendum)) sc = j;
      else if (j >= 0.8 && sameDay) sc = j;
    }
    if (sc > bestScore) { bestScore = sc; best = it; }
  }
  return best;
}
function uniqBy(list, key){ const seen = {}, out = []; list.forEach(x => { const k = key(x); if (!k || seen[k]) return; seen[k] = 1; out.push(x); }); return out; }
function fill(dst, src, fields){ fields.forEach(f => { if ((dst[f] == null || dst[f] === '' || (Array.isArray(dst[f]) && !dst[f].length)) && src[f] != null && src[f] !== '') dst[f] = src[f]; }); }
/* put one record into the list; returns { items, action, id } */
function upsert(items, rec){
  items = arr(items).filter(x => x && x.id);
  const t = nowIso();
  let hit = items.find(x => x.id === rec.id) || findMatch(items, rec);   /* the very same e-mail again, or the same project */
  if (hit) hit = liveTarget(items, hit);
  if (!hit) {
    const it = Object.assign({}, rec, { status: 'new', rev: 1, receivedAt: t, updatedAt: t, sources: rec.sources || [{ name: rec.source, at: t, ref: rec.sourceRef || '' }] });
    delete it.addendum; delete it.sourceRef;
    if (rec.addendum) { it.addenda = [{ n: rec.addendum, at: t, subject: rec.sourceRef || '' }]; it.addendumCount = rec.addendum; it.flag = 'Addendum #' + rec.addendum + ' received'; }
    items.push(it);
    return { items: trim(items), action: 'added', id: it.id };
  }
  if (hit.status === 'dismissed') {
    hit.repeats = (hit.repeats || 0) + 1; hit.lastSeenAt = t;
    return { items: trim(items), action: 'dismissed-repeat', id: hit.id };
  }
  const before = JSON.stringify(hit);
  const srcs = arr(hit.sources);
  if (!srcs.some(x => low(x.name) === low(rec.source))) srcs.push({ name: rec.source, at: t, ref: rec.sourceRef || '' });
  hit.sources = srcs;
  hit.alsoOn = uniqBy(srcs.map(x => x.name).filter(n => n && low(n) !== low(hit.source)), x => low(x));
  hit.plansLinks = uniqBy(arr(hit.plansLinks).concat(arr(rec.plansLinks)), l => low(l.url).replace(/[#?].*$/, '')).slice(0, 30);
  hit.files = uniqBy(arr(hit.files).concat(arr(rec.files)), f => f.hash || f.ref).slice(0, 80);
  hit.emails = uniqBy(arr(hit.emails).concat(arr(rec.emails)), e => e.id || e.subject + e.date).slice(-30);
  hit.emailIds = uniqBy(arr(hit.emailIds).concat(arr(rec.emailIds)), x => x).slice(-60);
  hit.watchKeys = uniqBy(arr(hit.watchKeys).concat(arr(rec.watchKeys)), x => x);
  hit.trades = uniqBy(arr(hit.trades).concat(arr(rec.trades)), x => low(x)).slice(0, 20);
  if (rec.addendum) {
    hit.addenda = arr(hit.addenda); if (!hit.addenda.some(a => a.n === rec.addendum)) hit.addenda.push({ n: rec.addendum, at: t, subject: rec.sourceRef || '' });
    hit.addendumCount = Math.max(hit.addendumCount || 0, rec.addendum);
    hit.flag = 'Addendum #' + hit.addendumCount + ' received';
    if (rec.bidDue && rec.bidDue !== hit.bidDue) { hit.bidDueWas = hit.bidDue; hit.bidDue = rec.bidDue; hit.flag += ' — bid date changed'; }
  } else if (rec.bidDue && (!hit.bidDue || (s(hit.bidDue).length === 10 && rec.bidDue.length > 10 && rec.bidDue.slice(0, 10) === hit.bidDue && !hit.bidDueManual))) hit.bidDue = rec.bidDue;   /* LA: a later notice gives the time */
  fill(hit, rec, ['owner', 'gc', 'address', 'city', 'state', 'zip', 'preBid', 'preBidLocation', 'scope', 'bidNumber', 'contact', 'estValue', 'rawRef',
    'dueToCompany', 'dueToContact', 'dueToEmail', 'dueToPhone', 'submitMethod', 'submitWhere']);
  if (rec.contact && hit.contact && !s(hit.contact.email) && s(rec.contact.email)) hit.contact = rec.contact;
  hit.notes = uniqBy(arr(hit.notes).concat(arr(rec.notes)), x => x).slice(-20);
  if (JSON.stringify(hit) === before) return { items: trim(items), action: 'same', id: hit.id };
  hit.rev = (hit.rev || 1) + 1; hit.updatedAt = t;
  return { items: trim(items), action: rec.addendum ? 'addendum' : 'merged', id: hit.id };
}
/* keep the list small: oldest finished items go first; dismissed ones shrink to a stub (enough to never re-import) */
function stub(it){ return { id: it.id, status: it.status, title: it.title, city: it.city, bidDue: it.bidDue, bidNumber: it.bidNumber, source: it.source, watchKeys: it.watchKeys, portal: it.portal, emailIds: arr(it.emailIds).slice(-5), reason: it.reason, by: it.by, mergedInto: it.mergedInto, updatedAt: it.updatedAt, stub: true }; }
function trim(items){
  const active = items.filter(x => x.status !== 'dismissed' && x.status !== 'merged');
  const done = items.filter(x => x.status === 'dismissed' || x.status === 'merged').map(x => x.stub ? x : (Date.now() - Date.parse(x.updatedAt || 0) > 30 * 86400000 ? stub(x) : x));
  active.sort((a, b) => s(a.receivedAt) < s(b.receivedAt) ? -1 : 1);
  return done.slice(-KEEP_DISMISSED).concat(active.slice(-KEEP_ACTIVE));
}
function itemId(seed){ return 'LI-' + sha256(seed).slice(0, 16); }

/* the AI's answer (or a plain-text guess) → records to upsert */
const TYPE_WORDS = { insurance: /\b(insurance|claim|adjuster|carrier|storm damage|hail|wind damage|fire damage|water damage|mitigation|xactimate)\b/i, government: /\b(county|city of|state of|school|authority|department|municipal|public works|federal|invitation for bid|ifb|itb)\b/i, residential: /\b(residence|residential|home ?owner|house|single[- ]family)\b/i };
function guessType(text, source){
  if (source === 'Government') return 'government';
  if (TYPE_WORDS.insurance.test(text)) return 'insurance';
  if (TYPE_WORDS.government.test(text)) return 'government';
  if (TYPE_WORDS.residential.test(text)) return 'residential';
  return 'commercial';
}
function cleanSource(v, hint){ const x = SOURCES.find(z => low(z) === low(v)); if (hint && hint !== 'Bid platform' && SOURCES.indexOf(hint) >= 0 && (!x || x === 'Other' || x === 'GC direct')) return hint; return x || hint || 'Other'; }
function phone(v){ const d = s(v).replace(/[^\d]/g, ''); if (d.length === 11 && d[0] === '1') return '(' + d.slice(1, 4) + ') ' + d.slice(4, 7) + '-' + d.slice(7); if (d.length === 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6); return s(v); }
function recordsFrom(mail, ai, links, hint, stored, rawRef){
  const leads = ai.ok ? ai.leads : [];
  const subj = mail.subject.replace(/^((re|fw|fwd)\s*:\s*)+/i, '').trim();
  const base = leads.length ? leads : [{ project_name: subj || '(no subject)', _unread: true }];
  const emailRow = { id: mail.id, from: mail.from.email, fromName: mail.from.name, subject: mail.subject, date: mail.date || nowIso(), rawRef, snippet: s(mail.text).slice(0, 1200) };
  /* LA: the bid due date written in the e-mail (with its time and time zone), for what the AI left out */
  const allText = mail.subject + '\n' + mail.text, ref = mail.date || nowIso();
  const txDue = BD.findDue(allText, { ref });
  return base.map((L, i) => {
    const source = cleanSource(L.source_board, hint);
    const title = s(L.project_name) || subj || 'Untitled project';
    const idx = arr(L.attachment_indexes).filter(n => Number.isInteger(n) && n >= 0 && n < stored.length);
    const files = (base.length === 1 ? stored : idx.map(n => stored[n])).filter(f => f && f.ref);
    const aiLinks = arr(L.plans_links).map(l => ({ url: s(l && l.url), label: s(l && l.label) })).filter(l => /^https?:\/\//.test(l.url)).map(l => { let h = ''; try { h = new URL(l.url).hostname; } catch (e) {} return Object.assign(l, { board: boardOf(h) || (FILE_HOSTS.test(h) ? 'File share' : ''), host: h }); });
    const plansLinks = uniqBy(aiLinks.concat(base.length === 1 ? links : []), l => low(l.url).replace(/[#?].*$/, '')).slice(0, 25);
    const addN = (L.addendum_number != null && isFinite(L.addendum_number)) ? parseInt(L.addendum_number, 10) : (/(addend(um|a))\s*(no\.?|#|number)?\s*(\d+)/i.exec(mail.subject) || [])[4];
    const isAdd = ai.kind === 'addendum' || !!addN;
    const text = [title, L.scope_summary, L.owner, mail.subject, mail.text.slice(0, 3000)].join(' ');
    const type = TYPES.indexOf(low(L.lead_type)) >= 0 ? low(L.lead_type) : guessType(text, source);
    const notes = [];
    const aiDue = dueOf(L.bid_due_date, L.bid_due_time);
    const tx = base.length > 1 ? BD.findDueFor(allText, s(L.project_name) || title, { ref }) : txDue;
    const bidDue = BD.merge(aiDue, tx);
    /* LA: who the bid is due to, and how it is submitted */
    const sub = BD.findSubmit(allText), board = SOURCES.indexOf(source) >= 0 && /BuildingConnected|PlanHub|Planroom/.test(source) ? source : '';
    const dueTo = { company: s(L.submit_to_company) || s(L.gc_name) || s(L.owner), contact: s(L.submit_to_contact) || s(L.contact_name), email: low(L.submit_to_email) || sub.email || low(L.contact_email),
      phone: phone(s(L.submit_to_phone) || s(L.contact_phone)), method: /^(email|portal|sealed|in_person|other)$/.test(s(L.submit_method)) ? s(L.submit_method) : (sub.method || (board ? 'portal' : '')),
      where: s(L.submit_where) || sub.where || board };
    if (!dueTo.company) notes.push('Bid due TO: NOT FOUND in the e-mail — add the GC / company on the lead.');
    if (bidDue && bidDue !== aiDue) notes.push('Bid due read from the e-mail text: "' + s(tx.label) + ' ' + s(tx.written) + '".');
    if (!bidDue) notes.push('Bid due date: NOT FOUND in the e-mail — add it on the lead (Leads → Bid due).');
    if (!ai.ok) notes.push('Not read by the AI (' + ai.why + ') — open the e-mail and fill in the details.');
    if (L.prebid_mandatory) notes.push('Pre-bid meeting is MANDATORY.');
    if (L.bond_required) notes.push('Bid bond required.');
    if (L.prevailing_wage) notes.push('Prevailing wage.');
    if (s(L.notes)) notes.push(s(L.notes).slice(0, 400));
    if (mail.skipped.length) notes.push('Not kept: ' + mail.skipped.map(x => x.name + ' (' + x.why + ')').join(', '));
    const rec = {
      id: itemId((mail.id || mail.messageId || mail.subject + mail.date) + '|' + i + '|' + normTitle(title)),
      title: title.slice(0, 200), source, sourceKind: ai.kind || (ai.ok ? '' : 'unread'), sourceRef: mail.subject.slice(0, 200),
      type, owner: s(L.owner), gc: s(L.gc_name), address: s(L.address), city: s(L.city), state: s(L.state).toUpperCase().slice(0, 2), zip: s(L.zip),
      bidDue, dueToCompany: dueTo.company, dueToContact: dueTo.contact, dueToEmail: dueTo.email, dueToPhone: dueTo.phone, submitMethod: dueTo.method, submitWhere: dueTo.where,
      preBid: dueOf(L.prebid_date, L.prebid_time), preBidLocation: s(L.prebid_location), preBidMandatory: !!L.prebid_mandatory,
      trades: arr(L.trades).map(s).filter(Boolean).slice(0, 12), scope: s(L.scope_summary).slice(0, 600), bidNumber: s(L.bid_number),
      contact: { name: s(L.contact_name), email: low(L.contact_email), phone: phone(L.contact_phone) },
      estValue: L.estimated_value != null && isFinite(L.estimated_value) ? +L.estimated_value : null,
      plansLinks, files: files.map(f => ({ ref: f.ref, name: f.name, type: f.type, size: f.size, hash: f.hash, kind: f.kind, addendum: isAdd ? (parseInt(addN, 10) || true) : undefined })),
      emails: [emailRow], emailIds: mail.id ? [mail.id] : [], rawRef, notes, addendum: isAdd ? (parseInt(addN, 10) || 1) : 0,
      needsReview: !ai.ok, aiConfidence: L.confidence != null ? +L.confidence : null, origin: 'email'
    };
    if (!rec.contact.email && mail.from.domain && !/grayco-cs\.com$/.test(mail.from.domain) && !boardOf(mail.from.domain)) rec.contact = { name: rec.contact.name || mail.from.name, email: mail.from.email, phone: rec.contact.phone };
    return rec;
  });
}
function fileKind(name){ const n = low(name); if (/addend/.test(n)) return 'addendum'; if (/spec|manual|project ?book/.test(n)) return 'specs'; if (/plan|drawing|dwg|sheet|arch|a\d{1,3}\b|s\d{1,3}\b/.test(n)) return 'plans'; if (/itb|ifb|rfp|rfq|invitation|bid form|proposal form/.test(n)) return 'bid docs'; return 'other'; }
function rawText(mail){
  return 'From: ' + (mail.from.name ? mail.from.name + ' ' : '') + '<' + mail.from.email + '>\nTo: ' + mail.to.map(x => x.email).join(', ') + (mail.cc.length ? '\nCc: ' + mail.cc.map(x => x.email).join(', ') : '')
    + '\nDate: ' + (mail.date || '') + '\nSubject: ' + mail.subject + '\nAttachments: ' + (mail.files.map(f => f.name).concat(mail.skipped.map(x => x.name + ' (not kept: ' + x.why + ')')).join(', ') || 'none')
    + '\n\n' + mail.text;
}
const BID_WORDS = /\b(bid|bids|bidding|rfp|rfq|itb|ifb|invitation|addend(um|a)|plans?|specs?|specifications|proposal|pre-?bid|solicitation|tender|scope of work)\b/i;

/* ── the whole job for one e-mail ──────────────────────────────────────────── */
/* ── patch EST4: a subcontractor's bid e-mailed to bids@ ───────────────────────
   Matched to the bid-portal job (PO, street address, the sub's invitation, the project title), its files kept
   (crm-files), the job's estimator told (else the Senior Estimator, else the admins). Unmatched ones wait in
   "Unmatched sub bids" (gc_sub_bids_email, service-only) for the estimator. Never a customer lead. */
const KV_SUBBIDS = 'gc_sub_bids_email';
async function portalJobs(){
  const H = svcH(), get = async q => { try { const r = await (exports._fetch || fetch)(sbUrl() + '/rest/v1/sp_rows?' + q, { headers: H }); return r.ok ? arr(await r.json()) : []; } catch (e) { return []; } };
  const [jobs, invites] = await Promise.all([get('collection=eq.jobs&select=job_id,data&limit=1000'), get('collection=eq.invites&select=job_id,email&limit=5000')]);
  const inv = {}; invites.forEach(r => { if (r && r.job_id) (inv[r.job_id] = inv[r.job_id] || []).push(low(r.email)); });
  return jobs.map(r => { const d = (r && r.data) || {}; return { id: s(r.job_id || d.id), title: s(d.title), po: s(d.poNumber || d.po), address: s(d.address), leadId: s(d.leadInbox && d.leadInbox.id), invited: inv[r.job_id] || [], status: s(d.status) }; })
    .filter(j => j.id && !/^(deleted|archived)$/i.test(j.status));
}
async function subBidMailTo(rec, est, head){
  const key = env('RESEND_API_KEY'); if (!key) return { ok: false, why: 'RESEND_API_KEY is not set' };
  let to = Array.from(new Set([head && head.email, est && est.email].map(low).filter(Boolean)));   /* patch BIDSEND: the Lead Estimator always */
  if (!to.length) { try { to = await alertsApi().recipients([]); } catch (e) {} }
  if (!to.length) return { ok: false, why: 'nobody to tell' };
  const site = (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, '');
  const who = rec.sub.company ? rec.sub.company + ' (' + rec.sub.name + ')' : rec.sub.name;
  const subject = rec.jobId ? 'Sub bid received: ' + who + ' — ' + rec.jobTitle : 'Sub bid received (no matching bid job): ' + who + ' — ' + s(rec.subject).slice(0, 80);
  const esc = v => s(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">GrayCo — sub bid received</div><div style="padding:6px 18px 18px">'
    + '<p><b>' + esc(who) + '</b> (' + esc(rec.sub.email) + ') sent a bid to bids@' + (rec.jobId ? ' for <b>' + esc(rec.jobTitle) + '</b>' : ' — <b>it did not match a bid job</b>; pick the job in the CRM (Leads → 📨 Sub bids)') + '.</p>'
    + '<p style="color:#555">Subject: ' + esc(rec.subject) + '<br>' + (rec.files.length ? rec.files.length + ' file(s): ' + rec.files.map(f => esc(f.name)).join(', ') : 'No files attached') + '</p>'
    + (rec.text ? '<blockquote style="border-left:3px solid #ddd;margin:8px 0;padding:4px 10px;color:#333">' + esc(rec.text.slice(0, 1200)).replace(/\n/g, '<br>') + '</blockquote>' : '')
    + '<p><a href="' + esc(site) + '/#leads" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open Sub bids in the CRM</a></p>'
    + '<p style="color:#777;font-size:12px">Hit Reply to answer the sub. Sent to the estimator (the Estimator role / Leads ⚙ Senior Estimator).</p></div></div>';
  try {
    const r = await (exports._fetch || fetch)('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('SUB_BID_FROM') || 'GrayCo Bids <bids@grayco-cs.com>', to, reply_to: rec.sub.email || undefined, subject: require('./_lib/mailtag.js').tag(subject, to, 'area:Bids'), html, headers: { 'X-GrayCo-CRM': 'sub-bid' } }) });
    return { ok: r.ok, to, why: r.ok ? '' : 'Resend answered ' + r.status };
  } catch (e) { return { ok: false, why: 'Resend unreachable' }; }
}
/* ── patch BIDSEND: what a bids@ e-mail is ──────────────────────────────────────
   (a) a GC's reply to one of our bids (a "Bidding to" contact / our subject) · (b) a sub bid (a sub we know, or "our
   price is attached") · (c) an invitation to bid · else unsorted (the estimator decides in the CRM). */
function repliesApi(){ return require('./_lib/bid-replies.js').make({ env, s, low, arr, nowIso, sb, storeFile, callClaude, estimatorOf: () => estimatorOf(), webPush: exports._webPush, now: exports._now, fetch: exports._fetch,
  recipients: x => alertsApi().recipients(x), kvAppendResult: x => alertsApi().kvAppendResult(x) }); }
async function knownSubs(){
  const set = {};
  try { (await portalJobs()).forEach(j => arr(j.invited).forEach(e => { if (e) set[low(e)] = 1; })); } catch (e) {}
  try { const r = await sb('gc_kv?select=value&key=eq.subs'); if (r.ok) { const rows = await r.json(); (JSON.stringify(rows && rows[0] ? rows[0].value : '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).forEach(e => { set[low(e)] = 1; }); } } catch (e) {}
  return e => !!set[low(e)];
}
async function bidsKind(mail){
  const SB = require('./_lib/subbids.js'), R = repliesApi();
  const isSub = await knownSubs(), ctx = await R.context();
  if (R.match(mail, ctx, { isSub })) { const r = await R.handle(mail, { via: 'bids@', ctx, isSub }); if (r) return { kind: 'reply', r }; }
  if (isSub(mail.from.email)) return { kind: 'sub' };
  if (SB.isInviteForBids(mail, boardOf)) return { kind: 'invite' };
  if (SB.isSubBid(mail)) return { kind: 'sub' };
  return { kind: 'unsorted' };
}
async function unsortedBidsMail(mail){
  const SB = require('./_lib/subbids.js');
  const id = 'sbu_' + itemId('unsorted|' + (mail.messageId || mail.id || (mail.from.email + mail.subject + mail.date)));
  if (arr(await kvGet(KV_SUBBIDS)).some(x => x && x.id === id)) return { ok: true, already: true, id };
  const files = [];
  for (const f of mail.files) { const st = await storeFile(f.buf, f.type, f.name); files.push({ name: f.name, type: f.type, size: f.size, ref: st.ref, stored: st.stored }); }
  const rec = { id, at: nowIso(), kind: 'unsorted', status: 'unsorted', sub: SB.subName(mail), subject: s(mail.subject).slice(0, 240), text: s(mail.text).replace(/\n>.*$/s, '').slice(0, 3000),
    files, jobId: '', jobTitle: '', leadId: '', match: '', estimator: '' };
  try { const d = await estimatorOf(); if (d.email) rec.estimator = low(d.email); } catch (e) {}   /* the unsorted list belongs to the Lead Estimator */
  await kvCas(KV_SUBBIDS, v => arr(v).filter(x => x && x.id !== id).concat([rec]).slice(-500));
  return { ok: true, id, unsorted: true };
}
async function subBidFromEmail(mail){
  const SB = require('./_lib/subbids.js');
  const id = 'sbe_' + itemId('subbid|' + (mail.messageId || mail.id || (mail.from.email + mail.subject + mail.date)));
  const have = arr(await kvGet(KV_SUBBIDS));
  if (have.some(x => x && x.id === id)) return { ok: true, already: true, id };
  const jobs = await portalJobs();
  const m = SB.matchJob(mail, jobs);
  const files = [];
  for (const f of mail.files) { const st = await storeFile(f.buf, f.type, f.name); files.push({ name: f.name, type: f.type, size: f.size, ref: st.ref, stored: st.stored }); }
  /* the job's own estimator (its Lead Inbox item), else the Senior Estimator */
  let est = null;
  if (m && m.job.leadId) { const it = arr(await kvGet(KV)).find(x => x && x.id === m.job.leadId); if (it && low(it.estimatorEmail)) est = { name: s(it.estimator), email: low(it.estimatorEmail) }; }
  let head = null; try { const d = await estimatorOf(); if (d.email) head = { name: d.name, email: low(d.email) }; } catch (e) {}   /* patch BIDSEND: the Lead Estimator */
  if (!est) est = head;
  const rec = { id, at: nowIso(), sub: SB.subName(mail), subject: s(mail.subject).slice(0, 240), text: s(mail.text).replace(/\n>.*$/s, '').slice(0, 3000),
    files, jobId: m ? m.job.id : '', jobTitle: m ? m.job.title : '', leadId: m ? m.job.leadId : '', match: m ? m.why.join(', ') : '', estimator: est ? est.email : '', status: m ? 'matched' : 'unmatched' };
  await kvCas(KV_SUBBIDS, v => arr(v).filter(x => x && x.id !== id).concat([rec]).slice(-500));
  const told = await subBidMailTo(rec, est, head);
  try { await kvCas(KV_SUBBIDS, v => { const l = arr(v); const x = l.find(y => y && y.id === id); if (!x) return undefined; x.told = { ok: told.ok, to: told.to || [], why: told.why || '' }; return l; }); } catch (e) {}
  return { ok: true, id, matched: !!m, jobId: rec.jobId, files: files.length, told: told.ok };
}

/* patch MAILC: every e-mail this webhook gets is noted for the Email Center's "📥 All company mail" (who, to which
   address, the subject, what the CRM did — never the body). The note never holds up or changes the result. */
async function processEvent(evt, opts){
  const r = await processEventCore(evt, opts);
  try { await require('./_lib/mailcenter.js').log(evt, r, { kvCas }); } catch (e) {}
  return r;
}
async function processEventCore(evt, opts){
  opts = opts || {};
  const type = s(evt && evt.type);
  if (type && type !== 'email.received') return { status: 200, body: { ok: true, ignored: 'event ' + type } };
  const data = (evt && (evt.data || evt)) || {};
  /* mail plainly for the bill or claim inbox (same webhook) is not even downloaded */
  if (otherInbox(data)) return { status: 200, body: { ok: true, ignored: 'not addressed to the bid inbox' } };
  const mail = await readMail(data);
  /* patch AUTO8: a GC's answer to the estimator's "Bid results?" e-mail (its Reply-To has results+<lead id>@in.grayco-cs.com):
     kept for the CRM (gc_kv gc_bid_results — the lead shows it, the estimator's dashboard counts it); never a new lead */
  const resHit = recipients(mail, data).map(x => /^results\+([a-z0-9_-]{1,60})@in\.grayco-cs\.com$/i.exec(x)).filter(Boolean)[0];
  if (resHit) {
    if (ownOrAuto(mail)) return { status: 200, body: { ok: true, ignored: ownOrAuto(mail) } };
    if (!dbReady()) return { status: 503, body: { ok: false, error: 'database not configured' } };
    const ok = await alertsApi().kvAppendResult({ id: 'ans_' + (mail.id || itemId(mail.from.email + mail.subject + mail.date)), kind: 'answer', lead: low(resHit[1]), at: nowIso(),
      from: mail.from.email, fromName: mail.from.name, subject: s(mail.subject).slice(0, 200), text: s(mail.text).replace(/\n>.*$/s, '').slice(0, 1500) }).catch(() => false);
    return ok ? { status: 200, body: { ok: true, results: true } } : { status: 503, body: { ok: false, error: 'GrayCo could not store the bid results yet — retry.' } };
  }
  /* patch ESTIN: an estimate e-mailed to estimates@ (Word / PDF / Excel / CSV, from a GrayCo address) → the CRM reads it */
  if (forEstimates(mail, data)) {
    if (ownOrAuto(mail)) return { status: 200, body: { ok: true, ignored: ownOrAuto(mail) } };
    if (!/@grayco-cs\.com$/i.test(mail.from.email)) return { status: 200, body: { ok: true, ignored: 'estimates@ takes estimates from GrayCo addresses only' } };
    if (!dbReady()) return { status: 503, body: { ok: false, error: 'database not configured' } };
    return { status: 200, body: Object.assign({ inbox: 'estimates' }, await estimateMail(mail)) };
  }
  /* patch X9: a copy for the job's e-mail history (the Google routing rule → mail@in.grayco-cs.com): kept on its job,
     or thrown away — never a lead or a bid, even when it was addressed to bids@ / leads@ */
  try { const CM = require('./_lib/comms.js'); if (CM.isJournal(mail, data, recipients(mail, data)) || CM.isBccCopy(recipients(mail, data), forBids(mail, data) || forLeads(mail, data))) { if (!dbReady()) return { status: 503, body: { ok: false, error: 'database not configured' } };
    /* patch BIDSEND: a GC's answer to one of our bids that came by the routing rule is filed on its lead too */
    let br = null; if (!/@(in\.)?grayco-cs\.com$/i.test(mail.from.email) && !ownOrAuto(mail)) br = await repliesApi().handle(mail, { via: 'e-mail history', isSub: await knownSubs() });
    return { status: 200, body: Object.assign({ inbox: 'history' }, await CM.fromJournal(mail), br ? { bidReply: br } : {}) }; } }
  catch (e) { return { status: 503, body: { ok: false, error: 'The e-mail history could not store this yet (' + (e && e.message) + ') — retry.' } }; }
  /* patch OWNERTODO: receipts@ / invoices@ — a receipt or a sub's invoice for the CRM (never a lead, a bid or an order) */
  { const MM = require('./_lib/money-mail.js'), mk = MM.kindOf(recipients(mail, data), mail.headers);
    if (mk) {
      const own0 = ownOrAuto(mail); if (own0) return { status: 200, body: { ok: true, ignored: own0 } };
      if (!dbReady()) return { status: 503, body: { ok: false, error: 'database not configured' } };
      try { const r = await MM.fromEmail(mail, mk, { storeFile: storeFile, kvListUpdate: function(k, f){ return require('./portal.js')._core.kvListUpdate(k, f); } }); return { status: 200, body: Object.assign({ inbox: mk === 'receipt' ? 'receipts' : 'sub-invoices' }, r) }; }
      catch (e) { return { status: 503, body: { ok: false, error: 'GrayCo could not keep this ' + (mk === 'receipt' ? 'receipt' : 'invoice') + ' yet (' + (e && e.message) + ') — retry.' } }; }
    } }
  /* patch EST4: leads@ carries bid invitations too (they take the bid path below); bids@ is only for subcontractors'
     bids (unless it is plainly an old-style invitation still sent to bids@) */
  const SB = require('./_lib/subbids.js');
  const toBids = forBids(mail, data), toLeads = forLeads(mail, data);
  const leadMail = !toBids && toLeads && !SB.isBidInvite(mail, boardOf).bid;
  let subBidMail = false;   /* patch BIDSEND: bids@ is sorted below (a GC's reply · a sub bid · an invitation · unsorted) */
  /* patch AUTO7: orders@ (or, sent to this receiving domain for none of bids@ / leads@, plainly a supplier's order confirmation) */
  const orderMail = !leadMail && !toBids && !toLeads && (forOrders(mail, data) || require('./_lib/fa-orders.js').looksLikeOrder(mail));
  if (!leadMail && !orderMail && !toBids && !toLeads) return { status: 200, body: { ok: true, ignored: 'not addressed to the bid inbox' } };
  const own = ownOrAuto(mail); if (own) return { status: 200, body: { ok: true, ignored: own } };
  if (!dbReady()) return { status: 503, body: { ok: false, error: 'database not configured' } };
  /* Google's forwarding / group set-up messages: kept for the owner, never a lead */
  if (/^(forwarding-noreply|groups-noreply|noreply-.*groups)@google\.com$/.test(mail.from.email) || /@googlegroups\.com$/.test(mail.from.email)) {
    await kvCas(KV_NOTE, v => arr(v).filter(x => x && x.id !== mail.id).concat([{ id: mail.id || itemId(mail.subject + mail.date), at: nowIso(), from: mail.from.email, subject: mail.subject, text: mail.text.slice(0, 3000) }]).slice(-20));
    return { status: 200, body: { ok: true, notice: true } };
  }
  if (!mail.files.length && !mail.text) return { status: 200, body: { ok: true, ignored: 'empty e-mail' } };
  if (toBids && !toLeads) {   /* patch BIDSEND */
    let k;
    try { k = await bidsKind(mail); } catch (e) { return { status: 503, body: { ok: false, error: 'GrayCo could not sort this bids@ e-mail yet (' + (e && e.message) + ') — retry.' } }; }
    if (k.kind === 'reply') return { status: 200, body: Object.assign({ inbox: 'bid-replies' }, k.r) };
    if (k.kind === 'sub') subBidMail = true;
    else if (k.kind === 'unsorted') {
      try { return { status: 200, body: Object.assign({ inbox: 'unsorted' }, await unsortedBidsMail(mail)) }; }
      catch (e) { return { status: 503, body: { ok: false, error: 'GrayCo could not keep this bids@ e-mail yet (' + (e && e.message) + ') — retry.' } }; }
    }
  }
  if (orderMail) {   /* patch AUTO7 */
    try { const r = await require('./_lib/fa-orders.js').fromEmail(mail); return { status: 200, body: Object.assign({ inbox: 'orders' }, r) }; }
    catch (e) { return { status: 503, body: { ok: false, error: 'GrayCo could not store this order yet (' + (e && e.message) + ') — retry.' } }; }
  }
  if (subBidMail) {   /* patch EST4 */
    try { const r = await subBidFromEmail(mail); return { status: 200, body: Object.assign({ inbox: 'sub-bids' }, r) }; }
    catch (e) { return { status: 503, body: { ok: false, error: 'GrayCo could not store this sub bid yet (' + (e && e.message) + ') — retry.' } }; }
  }
  if (leadMail) {
    try { const r = await require('./website-intake.js').fromEmail(mail); return { status: 200, body: Object.assign({ inbox: 'leads' }, r) }; }
    catch (e) { return { status: 503, body: { ok: false, error: 'GrayCo could not store this lead yet (' + (e && e.message) + ') — retry.' } }; }
  }
  const links = linksOf(mail), hint = sourceHint(mail, links);
  const ai = await extract(mail, links, hint, opts.inline ? 18000 : 0);
  const pdfs = mail.files.filter(f => f.type === 'application/pdf').length;
  if (ai.ok && (low(ai.kind) === 'not_a_lead' || !ai.leads.length) && !pdfs) return { status: 200, body: { ok: true, ignored: 'not a bid opportunity' } };
  if (!ai.ok && !pdfs && !hint && !BID_WORDS.test(mail.subject + ' ' + mail.text.slice(0, 2000))) return { status: 200, body: { ok: true, ignored: 'not a bid opportunity (not read by the AI)' } };
  /* the files, then the e-mail itself as a text document */
  const stored = [];
  for (const f of mail.files) { const st = await storeFile(f.buf, f.type, f.name); stored.push({ ref: st.ref, hash: st.hash, name: f.name, type: f.type, size: f.size, stored: st.stored, kind: fileKind(f.name) }); }
  const raw = await storeFile(Buffer.from(rawText(mail), 'utf8'), 'text/plain', 'email.txt');
  const recs = recordsFrom(mail, ai, links, hint, stored, raw.ref);
  const results = []; let stored2 = [];
  try {
    await kvCas(KV, v => { let items = arr(v); results.length = 0; recs.forEach(r => { const o = upsert(items, r); items = o.items; results.push({ action: o.action, id: o.id, title: r.title }); }); stored2 = items; return items; });
  } catch (e) { return { status: 503, body: { ok: false, error: 'GrayCo could not store this yet (' + (e && e.message) + ') — retry.' } }; }
  const after = await afterStore(results, stored2, { group: true });   /* one e-mail → one alert, listing every new lead it brought */
  return { status: 200, body: { ok: true, leads: results, read: ai.ok, files: stored.length, skipped: mail.skipped, portal: after.portal, alerts: after.alerts } };
}

/* ── after the inbox changed: the bid portal draft and the admins' alert (LD2, LA) ─
   results: [{action, id}] from upsert(); items: the list as stored; opt.group: the new ones came in one
   e-mail (one message lists them all; else one message per new lead). Never throws: the e-mail or the
   watcher run is already safe in the inbox; a draft that fails is queued, an alert that fails is retried. */
function portalApi(){ return require('./_lib/bid-portal.js').make({ env, s, low, arr, nowIso, sbUrl, svcH, kvCas, kvGet }); }
function alertsApi(){ return require('./_lib/bid-alerts.js').make({ env, s, low, arr, nowIso, sb, kvCas, kvGet, webPush: exports._webPush, now: exports._now, estimatorOf: () => estimatorOf() }); }
async function afterStore(results, items, opt){
  const out = { portal: [], alerts: null };
  const byId = {}; arr(items).forEach(x => { if (x && x.id) byId[x.id] = x; });
  const touched = []; const seen = {};
  arr(results).forEach(r => { if (r && /^(added|merged|addendum)$/.test(r.action) && byId[r.id] && !seen[r.id]) { seen[r.id] = 1; touched.push({ it: byId[r.id], action: r.action }); } });
  if (!touched.length) return out;
  /* patch LEADS: plans that are a plain public file link (a PDF / ZIP / drawing) are stored in the CRM too;
     a link that needs a login or is a web page stays a link (always kept on the lead) */
  try { await fetchPlans(touched.map(t => t.it)); } catch (e) {}
  const BP = portalApi();
  const marks = {};
  for (const t of touched) {
    try {
      const r = await BP.draft(t.it);
      out.portal.push({ id: t.it.id, state: r.state, jobId: r.jobId });
      if (r.state && r.state !== 'skipped' && r.state !== 'off') marks[t.it.id] = { jobId: r.jobId, state: r.state === 'updated' || r.state === 'unchanged' ? ((t.it.portal && t.it.portal.state) || 'draft') : r.state, at: nowIso(), why: s(r.why).slice(0, 200) };
    } catch (e) { out.portal.push({ id: t.it.id, state: 'error', why: s(e && e.message) }); }
  }
  if (Object.keys(marks).length) {
    try { await kvCas(KV, v => { const list = arr(v); let ch = false; list.forEach(x => { if (x && marks[x.id]) { x.portal = Object.assign({}, x.portal || {}, marks[x.id]); ch = true; } }); return ch ? list : undefined; }); } catch (e) {}
  }
  /* LA: commercial / government / bid-board bids go to the Senior Estimator (EST4: the Estimator role / Leads ⚙), unless assigned */
  const added = touched.filter(t => t.action === 'added').map(t => t.it);
  try {
    const est = await estimatorOf();
    const mine = added.filter(it => !it.pm && !it.estimator && est.email && isCommercial(it));
    if (mine.length) {
      const ids = {}, at = nowIso(); mine.forEach(it => { ids[it.id] = 1; it.estimator = est.name; it.estimatorEmail = est.email; it.assignedBy = 'Auto · Senior Estimator'; it.assignedAt = at; it.autoAssignedAt = at; it.leadRole = 'bid'; });   /* patch HOT2: logged as automatic */
      await kvCas(KV, v => { const list = arr(v); let ch = false; list.forEach(x => { if (x && ids[x.id] && !x.estimator) { x.estimator = est.name; x.estimatorEmail = est.email; x.assignedBy = 'Auto · Senior Estimator'; x.assignedAt = at; x.autoAssignedAt = at; x.leadRole = 'bid'; ch = true; } }); return ch ? list : undefined; });
      out.estimator = { name: est.name, email: est.email, n: mine.length };
    }
  } catch (e) { out.estimator = { error: s(e && e.message) }; }
  /* patch HOT2 (owner 10/22): the other lead roles, by type (Admin → 👥 Team roles; _lib/lead-roles.js) — insurance /
     restoration → the Senior Insurance PM, roofing → the Senior Roofing PM; a commercial ROOFING bid stays the Senior
     Estimator's and gets the Senior Roofing PM as a second person (coAssignees: the alerts and due reminders too).
     A role not set, or its person turned off → nobody (an admin assigns it). */
  try {
    const LR = require('./_lib/lead-roles.js');
    const team = await kvGet(LR.TEAM_KEY), users = arr(await kvGet('users')), at = nowIso(), set = {};
    const roofer = LR.holder('roofing', team, users);
    added.forEach(it => {
      if (!it) return;
      if (!it) return;
      const k = LR.classify(it, isCommercial);
      if (!it.pm && !it.estimator && (k === 'insurance' || k === 'roofing')) {
        const h = LR.holder(k, team, users);
        if (h) { Object.assign(it, { pm: h.name, pmEmail: h.email, assignedBy: 'Auto · ' + h.label, assignedAt: at, autoAssignedAt: at, leadRole: k }); set[it.id] = it; }
      }
      /* the Senior Roofing PM as the second person: a commercial roofing bid, a storm / water lead about a roof */
      const prim = low(it.pmEmail || it.estimatorEmail);
      if (LR.coRole(it, k) === 'roofing' && roofer && roofer.email !== prim && !arr(it.coAssignees).some(c => c && low(c.email) === roofer.email)) {
        it.coAssignees = arr(it.coAssignees).concat([{ name: roofer.name, email: roofer.email, role: 'roofing', label: roofer.label, at }]); set[it.id] = it;
      }
    });
    if (Object.keys(set).length) {
      await kvCas(KV, v => { const list = arr(v); let ch = false; list.forEach(x => { const y = x && set[x.id]; if (!y) return;
        if (y.coAssignees && !arr(x.coAssignees).length) { x.coAssignees = y.coAssignees; ch = true; }
        if (y.leadRole && y.leadRole !== 'bid' && y.pm && !x.pm && !x.estimator) { Object.assign(x, { pm: y.pm, pmEmail: y.pmEmail, assignedBy: y.assignedBy, assignedAt: y.assignedAt, autoAssignedAt: y.autoAssignedAt, leadRole: y.leadRole }); ch = true; } });
        return ch ? list : undefined; });
      out.leadRoles = { n: Object.keys(set).length };
    }
  } catch (e) { out.leadRoles = { error: s(e && e.message) }; }
  /* patch SYS: every estimator lead (commercial / government / bid board, or one with an estimator) is a PRIVATE bid
     job at once: invited subs only, until an admin or estimator makes it public. Never downgrades a public job. */
  try {
    const priv = added.filter(it => it && (it.estimatorEmail || it.estimator || isCommercial(it)) && marks[it.id] && /^(draft|updated|unchanged)$/.test(s(marks[it.id].state)));
    const pm = {};
    for (const it of priv.slice(0, 25)) {
      try { const r = await BP.setPortal(it, { mode: 'private', auto: true }, { email: 'auto' }); if (r && r.ok) pm[it.id] = { jobId: r.jobId, state: r.state, at: nowIso() }; } catch (e) {}
    }
    if (Object.keys(pm).length) {
      await kvCas(KV, v => { const list = arr(v); let ch = false; list.forEach(x => { if (x && pm[x.id]) { x.portal = Object.assign({}, x.portal || {}, pm[x.id]); ch = true; } }); return ch ? list : undefined; });
      out.private = Object.keys(pm).length;
    }
  } catch (e) { out.private = { error: s(e && e.message) }; }
  try { out.alerts = await alertsApi().notifyNew(added, { group: !!(opt && opt.group) }); } catch (e) { out.alerts = { error: s(e && e.message) }; }
  return out;
}
const PLAN_FILE_RE = /\.(pdf|zip|dwg|dxf|png|jpe?g|tiff?|docx?|xlsx?)(\?|#|$)/i, PLAN_MAX = 25 * 1024 * 1024;
async function fetchPlans(items){
  if (env('PLANS_FETCH') === '0') return { stored: 0 };
  let stored = 0; const changes = {};
  for (const it of arr(items)) {
    if (!it || !it.id) continue;
    const have = {}; arr(it.files).forEach(f => { if (f && f.fromUrl) have[f.fromUrl] = 1; });
    const links = arr(it.plansLinks).filter(l => l && /^https:\/\//.test(s(l.url)) && PLAN_FILE_RE.test(s(l.url).split('?')[0] + '?') && !have[s(l.url)] && !l.stored && !l.why).slice(0, 3);
    for (const l of links) {
      const res = { url: s(l.url) };
      try {
        const ctl = typeof AbortController === 'function' ? new AbortController() : null; const tm = ctl ? setTimeout(() => ctl.abort(), 20000) : null;
        const r = await fetch(res.url, { headers: { 'User-Agent': 'GrayCoBidWatch/1.0 (+https://crm.grayco-cs.com; bids@grayco-cs.com)' }, redirect: 'follow', signal: ctl ? ctl.signal : undefined });
        if (tm) clearTimeout(tm);
        const type = low(r.headers.get('content-type') || '').split(';')[0], len = +(r.headers.get('content-length') || 0);
        if (!r.ok) res.why = 'the link answered ' + r.status;
        else if (/text\/html/.test(type)) res.why = 'the link is a web page (a sign-in may be needed) — open it from the CRM';
        else if (len > PLAN_MAX) res.why = 'over 25 MB — open it from the link';
        else {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length > PLAN_MAX) res.why = 'over 25 MB — open it from the link';
          else {
            const name = decodeURIComponent(s(res.url).split('?')[0].split('/').pop() || 'plans.pdf').slice(0, 120);
            const f = await storeFile(buf, type || EXT_TYPES[low(name.split('.').pop())] || 'application/octet-stream', name);
            if (f.stored) { res.file = { name, size: buf.length, type: type || 'application/pdf', ref: f.ref, hash: f.hash, kind: 'plans', fromUrl: res.url, at: nowIso() }; stored++; }
            else res.why = 'could not be stored (' + s(f.why) + ')';
          }
        }
      } catch (e) { res.why = 'the link could not be reached'; }
      (changes[it.id] = changes[it.id] || []).push(res);
      if (res.file) { it.files = arr(it.files).concat([res.file]); }
      l.stored = !!res.file; if (res.why) l.why = res.why;
    }
  }
  if (Object.keys(changes).length) {
    await kvCas(KV, v => { const list = arr(v); let ch = false; list.forEach(x => { const c = x && changes[x.id]; if (!c) return; c.forEach(res => {
      if (res.file && !arr(x.files).some(f => f && f.fromUrl === res.url)) { x.files = arr(x.files).concat([res.file]); ch = true; }
      arr(x.plansLinks).forEach(l => { if (l && s(l.url) === res.url) { l.stored = !!res.file; if (res.why) l.why = res.why; ch = true; } });
    }); }); return ch ? list : undefined; });
  }
  return { stored, changes };
}
/* LA: what counts as a commercial bid (Senior Estimator): commercial (large and small), government, and anything
   from a bid board / planroom (BuildingConnected, PlanHub, A&B, RKA, ConstructConnect, the public bid sites) */
function isCommercial(it){
  if (!it || /^(referral|partner)$/.test(s(it.origin))) return false;   /* patch HOT2: homeowner leads never */
  if (it.websiteLead || s(it.origin) === 'website') return /^(commercial|government)$/.test(low(it.type));   /* the website's "Commercial bid inquiry" form is a bid */
  if (/resid|home|insur|storm|claim|mitig/i.test(s(it.type))) return false;
  return /^(commercial|government)$/.test(low(it.type)) || /buildingconnected|building connected|planhub|plan hub|planroom|constructconnect|dodge|isqft|government|county|city of|state of|mscs|mscaa|mlgw|stream|osp|sam\.gov|\bsam\b|bid ?board|procurement/i.test(s(it.source))
    || /^(watch|api|email|partner-bid)$/.test(s(it.origin));   /* patch HOT2: every bid source — bid e-mail (bids@ / leads@ bid path), public boards, the BuildingConnected API, SAM.gov, partner bids */
}
/* patch HOT2 (lead roles): one stored Lead Inbox item, routed by its type — for the paths that file a lead without
   afterStore (website-intake fileLead: website forms, missed calls, referrals; the partner API's leads). Only a lead
   nobody is on; a role nobody holds routes nothing. → the fields set, or null */
async function routeLead(id){
  const LR = require('./_lib/lead-roles.js');
  const it = arr(await kvGet(KV)).find(x => x && x.id === id); if (!it || it.pm || it.estimator) return null;
  const k = LR.classify(it, isCommercial); let h = null, field = 'pm', team = null, users = null;
  const roles = async () => { if (!users) { team = await kvGet(LR.TEAM_KEY); users = arr(await kvGet('users')); } };
  if (k === 'bid') { const est = await estimatorOf(); if (est.email) { h = { name: est.name, email: est.email, label: 'Senior Estimator' }; field = 'estimator'; } }
  else if (k === 'insurance' || k === 'roofing') { await roles(); h = LR.holder(k, team, users); }
  const at = nowIso(), patch = h ? { assignedBy: 'Auto · ' + h.label, assignedAt: at, autoAssignedAt: at, leadRole: k } : {};
  if (h) { patch[field] = h.name; patch[field + 'Email'] = h.email; }
  if (LR.coRole(it, k) === 'roofing') { await roles(); const r = LR.holder('roofing', team, users); if (r && r.email !== low(h ? h.email : '')) patch.coAssignees = [{ name: r.name, email: r.email, role: 'roofing', label: r.label, at }]; }   /* the Senior Roofing PM too: a commercial roofing bid, a storm / water lead about a roof */
  let done = false;
  if (!Object.keys(patch).length) return null;
  await kvCas(KV, v => { const list = arr(v); const x = list.find(y => y && y.id === id); if (!x || x.pm || x.estimator) return undefined; Object.assign(x, patch); done = true; return list; });
  return done ? patch : null;
}
/* the Senior Estimator (patch EST4): worked out from the people's roles (_lib/estimator.js) — the one active
   Estimator; with several, the Leads ⚙ "Senior Estimator" setting (an e-mail kept as data); none → the admins */
async function estimatorOf(settings){
  const st = Object.assign({}, DEFAULT_SETTINGS, settings || (await kvGet(KV_SET)) || {});
  const r = await require('./_lib/estimator.js').resolve({ sb, settings: st, fresh: !!settings });
  return { name: r.name, email: r.email, found: r.found, source: r.source, ambiguous: r.ambiguous, none: r.none, warning: r.warning, candidates: r.candidates };
}
/* drafts that waited for the portal (it was not set up yet): created as soon as it is */
async function flushPortal(){
  try {
    const r = await portalApi().flush(async ids => { const items = arr(await kvGet(KV)); const o = {}; items.forEach(x => { if (x && ids.indexOf(x.id) >= 0) o[x.id] = x; }); return o; });
    if (r.results && r.results.length) {
      const m = {}; r.results.forEach(x => { m[x.id] = { jobId: x.jobId, state: x.state === 'updated' || x.state === 'unchanged' ? 'draft' : x.state, at: nowIso() }; });
      await kvCas(KV, v => { const list = arr(v); let ch = false; list.forEach(x => { if (x && m[x.id]) { x.portal = Object.assign({}, x.portal || {}, m[x.id]); ch = true; } }); return ch ? list : undefined; });
    }
    return r;
  } catch (e) { return { created: 0, error: s(e && e.message) }; }
}

/* ── staff sign-in (same check as every CRM function) ──────────────────────── */
async function staffAuth(event){
  const m = /^Bearer\s+(\S+)$/i.exec(s(hdrs(event).authorization));
  if (!m) return { ok: false, code: 401, error: 'Sign in to the GrayCo CRM first.' };
  const anon = env('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
  let user = null;
  try { const r = await fetch(sbUrl() + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + m[1] } }); if (r.ok) user = await r.json(); }
  catch (e) { return { ok: false, code: 503, error: 'Could not reach the sign-in service.' }; }
  const email = low(user && user.email);
  if (!email) return { ok: false, code: 401, error: 'Your sign-in has expired. Sign in again.' };
  let role = null, name = '', listed = false;
  if (sbKey()) {
    try { const r = await sb('gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(email)); if (r.ok) { listed = true; const rows = await r.json(); const row = Array.isArray(rows) && rows[0]; if (row && row.active !== false) { role = low(row.role || 'staff'); name = s(row.name); } } } catch (e) {}
  }
  if (!listed && env('STAFF_EMAILS').split(',').map(low).indexOf(email) > -1) role = 'staff';
  if (!role) return { ok: false, code: 403, error: 'Not on the GrayCo staff list.' };
  const admins = env('LEAD_ADMINS').split(',').map(low).filter(Boolean);
  return { ok: true, email, name, role, admin: role === 'admin' || admins.indexOf(email) > -1 };
}

/* patch LEADS: a lead typed into the CRM (no inbox item) → the item shape the bid portal adapter reads */
function leadItem(l){
  const links = arr(l.plansLinks).concat(s(l.plansLink) ? [{ url: s(l.plansLink), label: 'Plans' }] : []).filter(x => x && /^https?:\/\//.test(s(x.url)));
  return { id: 'crm:' + s(l.id).slice(0, 80), title: s(l.name || l.title).slice(0, 200) || 'Lead', address: s(l.address), city: s(l.city), state: s(l.state), zip: s(l.zip),
    bidDue: s(l.bidDue), source: s(l.source) || 'CRM lead', type: s(l.leadKind || l.type), gc: s(l.gc || l.dueToCompany), bidNumber: s(l.bidNumber), scope: '', notes: [], plansLinks: links, files: [], trades: arr(l.trades) };
}
async function isEstimator(email){
  try { const r = await sb('gc_staff?select=profile,role&email=eq.' + encodeURIComponent(low(email))); if (!r.ok) return false; const row = arr(await r.json())[0]; return !!row && /estimat/i.test(s(row.profile) + ' ' + s(row.role)); } catch (e) { return false; }
}

/* ── what a person did in the CRM ──────────────────────────────────────────── */
const OPS = { portal: 'staff', imported: 'staff', assigned: 'admin', job: 'staff', dismissed: 'admin', merged: 'admin', restore: 'admin', publish: 'admin', due: 'staff' };
function applyAct(items, b, who){
  items = arr(items);
  const t = nowIso(), op = s(b.op), id = s(b.id);
  let it = items.find(x => x && x.id === id);
  if (!it) return { err: 'no such lead in the inbox' };
  if (op === 'imported') { if (it.status === 'new') it.status = 'imported'; it.leadId = s(b.leadId) || it.leadId; it.importedAt = it.importedAt || t; it.importedRev = it.rev; }
  else if (op === 'assigned') { if (it.status === 'new') it.status = 'imported'; it.pm = s(b.pm).slice(0, 80); it.assignedBy = who.email; it.assignedAt = t; }
  else if (op === 'job') { it.pid = s(b.pid); it.jobAt = t; if (it.status === 'new') it.status = 'imported'; }
  else if (op === 'dismissed') { it.status = 'dismissed'; it.reason = s(b.reason).slice(0, 300) || 'Not interested'; it.by = who.email; it.dismissedAt = t; }
  else if (op === 'merged') {
    const into = items.find(x => x && x.id === s(b.into)); if (!into || into.id === it.id) return { err: 'merge target not found' };
    const tgt = items.find(x => x.id === into.id);
    tgt.sources = uniqBy(arr(tgt.sources).concat(arr(it.sources)), x => low(x.name));
    tgt.alsoOn = uniqBy(tgt.sources.map(x => x.name).filter(n => low(n) !== low(tgt.source)), x => low(x));
    tgt.plansLinks = uniqBy(arr(tgt.plansLinks).concat(arr(it.plansLinks)), l => low(l.url).replace(/[#?].*$/, ''));
    tgt.files = uniqBy(arr(tgt.files).concat(arr(it.files)), f => f.hash || f.ref);
    tgt.emails = uniqBy(arr(tgt.emails).concat(arr(it.emails)), e => e.id || e.subject);
    tgt.emailIds = uniqBy(arr(tgt.emailIds).concat(arr(it.emailIds)), x => x);
    tgt.watchKeys = uniqBy(arr(tgt.watchKeys).concat(arr(it.watchKeys)), x => x);
    fill(tgt, it, ['owner', 'gc', 'address', 'city', 'state', 'bidDue', 'preBid', 'bidNumber', 'scope']);
    tgt.rev = (tgt.rev || 1) + 1; tgt.updatedAt = t;
    it.status = 'merged'; it.mergedInto = tgt.id; it.by = who.email;
  }
  else if (op === 'restore') { it.status = it.leadId ? 'imported' : 'new'; it.reason = ''; }
  else if (op === 'due') {   /* LA: the bid due date typed on the lead in the CRM ('' clears it) */
    const v = s(b.bidDue);
    if (v && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v)) return { err: 'bid due must be YYYY-MM-DD or YYYY-MM-DDTHH:MM' };
    ['dueToCompany', 'dueToContact', 'dueToEmail', 'dueToPhone', 'submitMethod', 'submitWhere'].forEach(k => { if (b[k] != null) it[k] = s(b[k]).slice(0, 200); });
    if (b.dueUnknown != null) it.dueUnknown = !!b.dueUnknown;
    if (v !== s(it.bidDue)) { it.bidDueWas = s(it.bidDue); it.bidDue = v; it.bidDueBy = who.email; it.bidDueAt = t; it.bidDueManual = true; }
  }
  else return { err: 'unknown action' };
  it.updatedAt = t; it.rev = (it.rev || 1) + 1;
  return { items: trim(items), item: it };
}
const DEFAULT_SETTINGS = {
  keywords: ['roof', 'roofing', 'reroof', 're-roof', 'roof replacement', 'roof repair', 'roof coating', 'shingle', 'tpo', 'epdm', 'metal roof', 'modified bitumen', 'built-up roof',
    'building', 'construction', 'new construction', 'general construction', 'general contractor', 'renovation', 'remodel', 'addition', 'alteration', 'build-out', 'buildout', 'finish-out',
    'tenant improvement', 'interior improvements', 'improvements', 'facility improvements', 'facility', 'building repairs', 'repair', 'maintenance', 'restoration',
    'bathroom', 'restroom', 'kitchen', 'flooring', 'floor', 'carpet', 'tile', 'painting', 'paint', 'drywall', 'framing', 'carpentry', 'ceiling', 'siding', 'gutter', 'gutters',
    'windows', 'window', 'doors', 'door', 'storefront', 'canopy', 'envelope', 'waterproofing', 'masonry', 'concrete', 'sidewalk', 'demolition', 'abatement',
    'water damage', 'fire damage', 'storm damage', 'mold', 'mitigation', 'remediation', 'ada', 'accessibility', 'hvac', 'mechanical', 'plumbing', 'electrical upgrades', 'insulation'],
  exclude: ['vehicle', 'truck', 'automobile', 'software', 'hardware', 'laptop', 'computer', 'it services', 'telecommunication', 'janitorial', 'custodial', 'uniform', 'food', 'catering',
    'fuel', 'lobbying', 'audit', 'consultant', 'consulting services', 'legal services', 'staffing', 'insurance broker', 'printing services', 'printing', 'mowing', 'lawn care',
    'medical', 'pharmaceutical', 'pharmacy', 'office supplies', 'supplies', 'textbook', 'furniture', 'elevator', 'bus', 'tires', 'ammunition', 'firearms'],
  allBids: true,   /* patch BW: "All public bids (no keyword filter)" — every solicitation from the boards except the excluded words */
  sources: {},
  /* LA / EST4: "Senior Estimator" (Leads ⚙) — empty: the one person with the Estimator role (_lib/estimator.js) */
  estimator: { name: '', email: '' }
};
function cleanSettings(b, cur){
  const words = v => arr(v).map(x => low(x).slice(0, 40)).filter(Boolean).slice(0, 120);
  const out = Object.assign({}, DEFAULT_SETTINGS, cur || {});
  if (b.keywords) out.keywords = words(b.keywords);
  if (b.exclude) out.exclude = words(b.exclude);
  if (b.allBids != null) out.allBids = !!b.allBids;   /* patch BW */
  if (b.estimator && typeof b.estimator === 'object') {
    const em = low(b.estimator.email);
    if (em && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(em)) throw new Error('The estimator e-mail does not look right.');
    out.estimator = { name: s(b.estimator.name).slice(0, 80), email: em };
  }
  if (b.sam && typeof b.sam === 'object') out.sam = { on: b.sam.on !== false, states: arr(b.sam.states).map(x => s(x).toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x)).slice(0, 6), naics: arr(b.sam.naics).map(x => s(x).replace(/\D/g, '')).filter(x => /^\d{2,6}$/.test(x)).slice(0, 20) };   /* patch BW */
  if (b.sources && typeof b.sources === 'object') { out.sources = Object.assign({}, out.sources || {}); Object.keys(b.sources).slice(0, 150).forEach(k => { const v = b.sources[k] || {}; out.sources[k.replace(/[^a-z0-9-]/g, '')] = { on: v.on !== false, url: /^https:\/\//.test(s(v.url)) ? s(v.url).slice(0, 400) : '' }; }); }
  out.updatedAt = nowIso();
  return out;
}

/* patch BW: an e-mail-alert board → ONE shared owners + office to-do "Sign up for bid alerts …" (gc_office_tasks, whoever
   does it first ticks it); each new board is a line on its checklist, and a done to-do is opened again for a new line */
const BW_TODO = 'bw_signups';
function signupLine(src){ return { id: BW_TODO + '_' + src.id, label: src.name + (src.url ? ' — ' + src.url : '') + (src.how ? ' (' + s(src.how).slice(0, 160) + ')' : ''), done: false }; }
function signupMerge(l, src, who){
  const owners = (env('OWNER_EMAILS') || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(x => /@/.test(x));
  const assignees = Array.from(new Set(owners.concat(['office@grayco-cs.com']))), at = nowIso(), line = signupLine(src);
  /* the existing "Sign up for government bid lists" seed to-do when it is there, else our own — never two */
  let t = l.find(x => x && String(x.id) === 'adm_seed_govbids_v1') || l.find(x => x && String(x.id) === BW_TODO);
  if (t && arr(t.items).some(i => i && i.id === line.id)) return null;   /* already on it */
  if (!t) { t = { id: BW_TODO, label: 'Sign up for bid alerts with leads@grayco-cs.com (boards added in 🔎 Bid boards)', note: 'Register as a vendor on each and use leads@grayco-cs.com for the bid notices (bids@ is only for subs sending their bids). Tick each one off; the boards are in Leads → 🔎 Bid boards.',
    addedBy: 'Bid boards (' + s(who && (who.name || who.email)) + ')', addedAt: at, done: false, assignees, assignee: 'the owners and the office', personal: false, shared: true, kind: 'admin_seed', items: [], source: 'bid-boards' }; l = l.concat([t]); }
  t.items = arr(t.items).concat([line]); t.done = false; t.doneAt = ''; t.updatedAt = at;
  return l;
}
async function signupTodo(src, who){
  const has = l => l.some(t => t && (String(t.id) === BW_TODO || String(t.id) === 'adm_seed_govbids_v1') && arr(t.items).some(i => i && i.id === BW_TODO + '_' + src.id));
  if (exports._todoAdd) { const r = await exports._todoAdd(src, who, signupMerge); return !!(r && r.ok !== false); }   /* tests */
  const r = await require('./portal.js')._core.kvListUpdate('gc_office_tasks', l => { const n = signupMerge(arr(l), src, who); return n ? { list: n, check: has } : null; });
  return !!(r && r.ok !== false);
}

/* ── handlers ──────────────────────────────────────────────────────────────── */
exports.handler = async function(event){
  const qs = event.queryStringParameters || {};
  const C = cors(event);
  if (event.httpMethod === 'OPTIONS') return J(200, {}, C);
  if (event.httpMethod === 'GET' && qs.ping)
    return J(200, { ok: true, service: 'GrayCo bid inbox', signed: !!(env('BID_INBOUND_SECRET') || env('RESEND_INBOUND_SECRET')), resendApi: !!env('RESEND_API_KEY'), ai: !!env('ANTHROPIC_API_KEY'), database: dbReady(), to: inboxAddrs(), leadsTo: leadAddrs(), ordersTo: orderAddrs(),
      buildingConnectedApi: !!(env('BC_CLIENT_ID') && env('BC_CLIENT_SECRET') && env('BC_REFRESH_TOKEN')), samApi: !!env('SAM_API_KEY') || !!(dbReady() && (await require('./bid-watch.js').samKey().catch(() => ({}))).key),
      bidPortal: !!(await portalApi().status().catch(() => ({}))).ready, adminAlerts: !!env('RESEND_API_KEY') && env('BID_ALERTS_OFF') !== '1',
      phonePush: !!(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY')) }, C);

  /* the CRM: the inbox list (+ the watcher's last run, the bid portal's state, the alert queue) */
  if (event.httpMethod === 'GET' && qs.list) {
    const who = await staffAuth(event); if (!who.ok) return J(who.code, { error: who.error }, C);
    if (!dbReady()) return J(500, { error: 'Supabase is not configured on Netlify.' }, C);
    try {
      const [items, settings, notices, watch] = [await kvGet(KV), await kvGet(KV_SET), await kvGet(KV_NOTE), await kvGet('gc_bid_watch_status')];
      const out = { items: arr(items), settings: Object.assign({}, DEFAULT_SETTINGS, settings || {}), notices: who.admin ? arr(notices) : [], watch: watch || null, me: { email: who.email, admin: who.admin }, at: nowIso() };
      try { const st = await portalApi().status(); out.portal = { ready: !!st.ready, why: st.why || '', queued: arr(await kvGet(require('./_lib/bid-portal.js').KQ)).length }; } catch (e) { out.portal = { ready: false, why: 'unknown' }; }
      if (who.admin) { try { out.alerts = await alertsApi().state(); } catch (e) {} }
      try { out.estimator = await estimatorOf(out.settings); } catch (e) {}
      return J(200, out, C);
    } catch (e) { return J(502, { error: 'Could not read the lead inbox.' }, C); }
  }
  /* patch BW: 🔎 Bid boards — the built-in boards, the admins' own, their last run and SAM.gov */
  if (event.httpMethod === 'GET' && qs.sources) {
    const who = await staffAuth(event); if (!who.ok) return J(who.code, { error: who.error }, C);
    if (!who.admin) return J(403, { error: 'Only an admin sees the bid boards.' }, C);
    const BW = require('./bid-watch.js');
    const settings = Object.assign({}, DEFAULT_SETTINGS, (await kvGet(KV_SET)) || {});
    const pub = x => ({ id: x.id, name: x.name, label: x.label || '', auto: !!x.auto, kind: x.kind || (x.auto ? 'links' : 'email'), url: x.url || '', how: x.how || '', local: !!x.local });
    const sk = await BW.samKey().catch(() => ({ key: '' }));   /* the key itself never leaves the server: where it came from + its last 4 */
    return J(200, { ok: true, builtins: BW.SOURCES.map(pub), custom: arr(settings.custom), settings: { keywords: settings.keywords, exclude: settings.exclude, allBids: settings.allBids !== false, sources: settings.sources || {} },
      defaults: { keywords: DEFAULT_SETTINGS.keywords, exclude: DEFAULT_SETTINGS.exclude },
      sam: { ready: !!sk.key, from: sk.from || '', last4: sk.key ? sk.last4 : '', settings: BW.samSettings(settings) }, watch: (await kvGet('gc_bid_watch_status')) || null }, C);
  }
  /* patch EST4: sub bids that came by e-mail to bids@ — the estimator's list (GET), pick the job / mark handled (POST) */
  if (qs.subbids) {
    const who = await staffAuth(event); if (!who.ok) return J(who.code, { error: who.error }, C);
    if (event.httpMethod === 'GET') {
      const list = arr(await kvGet(KV_SUBBIDS)).slice(-200).reverse();
      let jobs = []; try { jobs = (await portalJobs()).map(j => ({ id: j.id, title: j.title, po: j.po })); } catch (e) {}
      return J(200, { ok: true, items: list, jobs, unmatched: list.filter(x => x && x.status === 'unmatched').length, unsorted: list.filter(x => x && x.status === 'unsorted').length }, C);
    }
    let b; try { b = JSON.parse(rawBody(event) || '{}'); } catch (e) { return J(400, { error: 'Not JSON.' }, C); }
    const op = s(b.op); let out = null, err = '';
    /* patch BIDSEND: an unsorted bids@ e-mail is a GC's reply to our bid on this lead (and GC row) */
    if (op === 'reply') {
      const x = arr(await kvGet(KV_SUBBIDS)).find(y => y && y.id === s(b.id)); if (!x) return J(400, { error: 'No such e-mail.' }, C);
      const fake = { id: x.id, messageId: x.id, from: { email: low(x.sub && x.sub.email), name: s(x.sub && x.sub.name) }, subject: x.subject, text: x.text, date: x.at, files: arr(x.files).filter(f => f && f.ref) };
      let r; try { r = await repliesApi().handle(fake, { force: { leadId: s(b.leadId), bidderId: s(b.bidderId) }, via: 'bids@ (sorted by ' + who.email + ')' }); } catch (e) { return J(503, { error: s(e && e.message) }, C); }
      if (!r || r.ok === false) return J(400, { error: (r && r.why) || 'That lead was not found.' }, C);
      await kvCas(KV_SUBBIDS, v => { const l = arr(v); const y = l.find(z => z && z.id === x.id); if (!y) return undefined; y.status = 'handled'; y.kind = 'reply'; y.leadId = s(b.leadId); y.handledBy = who.email; y.handledAt = nowIso(); out = y; return l; });
      return J(200, { ok: true, item: out, reply: r }, C);
    }
    await kvCas(KV_SUBBIDS, v => { const l = arr(v); const x = l.find(y => y && y.id === s(b.id)); if (!x) { err = 'No such sub bid.'; return undefined; }
      if (op === 'assign') { x.jobId = s(b.jobId).slice(0, 80); x.jobTitle = s(b.jobTitle).slice(0, 200); x.status = x.jobId ? 'matched' : 'unmatched'; x.match = 'picked by ' + who.email; }
      else if (op === 'done') { x.status = 'handled'; x.handledBy = who.email; x.handledAt = nowIso(); }
      else if (op === 'sub') { x.kind = 'sub'; x.status = x.jobId ? 'matched' : 'unmatched'; x.match = 'sorted by ' + who.email; }   /* patch BIDSEND: "it is a sub bid" */
      else { err = 'Unknown action.'; return undefined; }
      out = x; return l; });
    return err ? J(400, { error: err }, C) : J(200, { ok: true, item: out }, C);
  }
  if (event.httpMethod !== 'POST') return J(405, { error: 'Method not allowed' }, C);

  /* LA: a lead assigned to someone in the CRM (or entered by hand for them): tell that person now (once) */
  if (qs.notify) {
    const who = await staffAuth(event); if (!who.ok) return J(who.code, { error: who.error }, C);
    let b; try { b = JSON.parse(rawBody(event) || '{}'); } catch (e) { return J(400, { error: 'Not JSON.' }, C); }
    const lead = b && b.lead; if (!lead || !s(lead.id)) return J(400, { error: 'No lead.' }, C);
    try { const r = await alertsApi().notifyAssigned(lead, { by: who.email, byName: who.name }); return J(200, Object.assign({ ok: true }, r), C); } catch (e) { return J(503, { error: s(e && e.message) }, C); }
  }
  if (qs.act || qs.settings || qs.watch || qs.boards || qs.testread) {
    const who = await staffAuth(event); if (!who.ok) return J(who.code, { error: who.error }, C);
    let b; try { b = JSON.parse(rawBody(event) || '{}'); } catch (e) { return J(400, { error: 'Not JSON.' }, C); }
    /* patch BW: "Test read" — one look at a page now, nothing kept */
    if (qs.testread) {
      if (!who.admin) return J(403, { error: 'Only an admin tests a bid board.' }, C);
      try { const r = await require('./bid-watch.js').testRead(b, { settings: await kvGet(KV_SET), fetchImpl: exports._fetch }); return J(200, r, C); }
      catch (e) { return J(502, { ok: false, why: 'Could not read it: ' + s(e && e.message) }, C); }
    }
    /* patch BW: add / change / remove an admin's own bid board (built-ins can only be switched off) */
    if (qs.boards) {
      if (!who.admin) return J(403, { error: 'Only an admin changes the bid boards.' }, C);
      const BW = require('./bid-watch.js'), op = s(b.op);
      /* the SAM.gov key, entered here: kept sealed server-side; only its last 4 come back */
      if (op === 'samkey') {
        const k = s(b.key).replace(/\s+/g, '');
        const r = await BW.samKeySet(k, who.email);
        if (r === false) return J(400, { error: 'That does not look like a SAM.gov API key (letters and numbers, 20–80 long).' }, C);
        if (!r) return J(503, { error: 'Could not save the key — try again.' }, C);
        const sk = await BW.samKey().catch(() => ({ key: '' }));
        return J(200, { ok: true, sam: { ready: !!sk.key, from: sk.from || '', last4: sk.key ? sk.last4 : '' } }, C);
      }
      if (op === 'samtest') { const r = await BW.samTest(s(b.key).replace(/\s+/g, ''), { fetchImpl: exports._fetch }); return J(200, r, C); }
      if (!/^(add|update|remove)$/.test(op)) return J(400, { error: 'Unknown action.' }, C);
      let err = '', done = null, wasEmail = false;
      try {
        await kvCas(KV_SET, v => {
          const cur = Object.assign({}, DEFAULT_SETTINGS, v || {}); const list = arr(cur.custom).slice();
          if (op === 'remove') { const i = list.findIndex(x => x && x.id === s(b.id)); if (i < 0) { err = 'No such bid board.'; return undefined; } done = list.splice(i, 1)[0]; }
          else {
            const old = op === 'update' ? list.find(x => x && x.id === s(b.id)) : null;
            if (op === 'update' && !old) { err = 'No such bid board.'; return undefined; }
            if (op === 'add' && list.length >= 60) { err = 'That is 60 boards already — remove one first.'; return undefined; }
            const c = BW.cleanCustom(Object.assign({}, b.source || {}, { addedBy: who.email }), old || {}); if (c.err) { err = c.err; return undefined; }
            if (list.some(x => x && x !== old && x.url && c.src.url && low(x.url) === low(c.src.url))) { err = 'That address is already a bid board.'; return undefined; }
            wasEmail = !!(old && old.kind === 'email');
            if (old) list[list.indexOf(old)] = c.src; else list.push(c.src); done = c.src;
          }
          cur.custom = list; cur.updatedAt = nowIso(); return cur;
        });
      } catch (e) { return J(503, { error: s(e.message) }, C); }
      if (err) return J(400, { error: err }, C);
      /* an e-mail-alert board: one shared sign-up to-do for the owners and the office (once per board) */
      let todo = false;
      if (op !== 'remove' && done && done.kind === 'email' && !wasEmail) { try { todo = await signupTodo(done, who); } catch (e) {} }
      return J(200, { ok: true, source: done, todo }, C);
    }
    if (qs.settings) {
      if (!who.admin) return J(403, { error: 'Only an admin changes the bid watcher.' }, C);
      try { const r = await kvCas(KV_SET, v => cleanSettings(b, v)); return J(200, { ok: true, settings: r.value, estimator: await estimatorOf(r.value) }, C); } catch (e) { return J(/look right/.test(s(e.message)) ? 400 : 503, { error: s(e.message) }, C); }
    }
    if (qs.watch) {
      if (!who.admin) return J(403, { error: 'Only an admin runs the bid watcher by hand.' }, C);
      const body = JSON.stringify({ type: 'watch.run', by: who.email, source: s(b.source) });
      if (await handOff(body)) return J(202, { ok: true, started: true }, C);
      try { const out = await require('./bid-watch.js').runAll({ only: s(b.source), budgetMs: 20000 }); return J(200, out, C); } catch (e) { return J(502, { error: 'The watcher could not run: ' + s(e.message) }, C); }
    }
    const need = OPS[s(b.op)]; if (!need) return J(400, { error: 'Unknown action.' }, C);
    if (need === 'admin' && !who.admin) return J(403, { error: 'Only an admin can do that.' }, C);
    if (s(b.op) === 'portal') {   /* patch LEADS: the lead's sub bid job — private (invited subs only) by default; public only on a person's say-so */
      const mode = /^(draft|private|public)$/.test(s(b.mode)) ? s(b.mode) : 'private';
      if (mode === 'public' && !who.admin && !(await isEstimator(who.email))) return J(403, { error: 'Only an admin or an estimator can make a bid job public to all subs.' }, C);
      let it = null;
      if (s(b.id)) { const items = arr(await kvGet(KV)); it = items.find(x => x && x.id === s(b.id)); if (it) it = liveTarget(items, it); if (!it || it.status === 'dismissed') return J(404, { error: 'No such lead in the inbox.' }, C); }
      else if (b.lead && s(b.lead.id)) it = leadItem(b.lead);
      else return J(400, { error: 'No lead.' }, C);
      const auto = mode === 'draft' && isCommercial(it);   /* patch SYS: an estimator lead's bid job is PRIVATE at once (never downgrades a public one) */
      let pr; try { pr = await portalApi().setPortal(it, { mode: auto ? 'private' : mode, auto, scope: b.scope, scopeMode: b.scopeMode, sharedNotes: b.sharedNotes, plansLinks: b.plansLinks || it.plansLinks }, who); } catch (e) { return J(502, { error: 'The sub bid portal could not be reached: ' + s(e && e.message) }, C); }
      if (!pr.ok) return J(pr.code || 502, { error: pr.error }, C);
      const mark = { jobId: pr.jobId, state: pr.state, visibility: pr.visibility, at: nowIso(), by: who.email };
      if (s(b.id)) { try { await kvCas(KV, v => { const list = arr(v); const x = list.find(y => y && y.id === it.id); if (!x) return undefined; x.portal = Object.assign({}, x.portal || {}, mark); x.updatedAt = nowIso(); return list; }); } catch (e) {} }
      return J(200, Object.assign({ ok: true }, mark), C);
    }
    if (s(b.op) === 'publish') {   /* "Publish to bid portal": the ONLY way a draft reaches the subs */
      const items = arr(await kvGet(KV)); let it = items.find(x => x && x.id === s(b.id)); if (it) it = liveTarget(items, it);
      if (!it || it.status === 'dismissed') return J(404, { error: 'No such lead in the inbox.' }, C);
      let pr; try { pr = await portalApi().publish(it, who); } catch (e) { return J(502, { error: 'The bid portal could not be reached: ' + s(e && e.message) }, C); }
      if (!pr.ok) return J(pr.code || 502, { error: pr.error }, C);
      let item = null;
      try { await kvCas(KV, v => { const list = arr(v); const x = list.find(y => y && y.id === it.id); if (!x) return undefined; x.portal = Object.assign({}, x.portal || {}, { jobId: pr.jobId, state: 'published', publishedAt: nowIso(), publishedBy: who.email }); x.rev = (x.rev || 1) + 1; x.updatedAt = nowIso(); item = x; return list; }); } catch (e) {}
      return J(200, { ok: true, state: 'published', jobId: pr.jobId, already: !!pr.already, item }, C);
    }
    let res = null;
    try { await kvCas(KV, v => { const r = applyAct(v, b, who); res = r; return r.err ? undefined : r.items; }); }
    catch (e) { return J(503, { error: s(e.message) }, C); }
    if (res && res.err) return J(404, { error: res.err }, C);
    return J(200, { ok: true, item: res && res.item }, C);
  }

  /* Resend → us */
  const raw = rawBody(event);
  const v = verified(event, raw);
  if (!v.ok) return J(v.code, { error: v.why });
  let evt; try { evt = JSON.parse(raw || '{}'); } catch (e) { return J(400, { error: 'Not JSON.' }); }
  if (s(evt.type) && s(evt.type) !== 'email.received') return J(200, { ok: true, ignored: 'event ' + evt.type });
  /* cheap routing before the hand-off: mail plainly for bills@ / claims@ is not touched */
  if (otherInbox(evt.data || evt)) { try { await require('./_lib/mailcenter.js').log(evt, { status: 200, body: { ok: true, ignored: 'for bills@ / claims@ (their own inbox handles it)' } }, { kvCas }); } catch (e) {} return J(200, { ok: true, ignored: 'not addressed to the bid inbox' }); }
  if (await handOff(raw)) return J(200, { ok: true, accepted: true, how: v.how });
  const r = await processEvent(evt, { inline: true });
  return J(r.status, r.body);
};

/* bid-inbox-background.js calls this: same work, after the hand-off signature is checked */
exports.backgroundHandler = async function(event){
  const raw = rawBody(event);
  if (!handoffOk(event, raw)) return J(401, { error: 'Not from the bid inbox.' });
  let evt; try { evt = JSON.parse(raw || '{}'); } catch (e) { return J(400, { error: 'Not JSON.' }); }
  if (evt && evt.type === 'watch.run') { try { const out = await require('./bid-watch.js').runAll({ only: s(evt.source), by: s(evt.by) }); return J(200, out); } catch (e) { console.error('[bid-inbox] watcher failed: ' + (e && e.message)); return J(500, { error: 'watcher failed' }); } }
  const r = await processEvent(evt);
  if (r.status >= 500) console.error('[bid-inbox] could not store: ' + JSON.stringify(r.body));
  return J(r.status, r.body);
};

/* shared with bid-watch.js, and the test harness */
exports._lib = { routeLead, env, s, low, arr, nowIso, sha256, sb, sbUrl, svcH, kvRead, kvGet, kvCas, kvPut, upsert, afterStore, flushPortal, portalApi, alertsApi, findMatch, normTitle, normCity, normNum, itemId, isoDay, hhmm, dueOf, guessType, boardOf,
  decodeEntities, htmlToText, DEFAULT_SETTINGS, KV, KV_SET, dbReady, sbKey, estimatorOf, isCommercial };
exports._test = { bidsKind, knownSubs, repliesApi, unsortedBidsMail, fetchPlans, leadItem, isCommercial, estimatorOf, subBidFromEmail, portalJobs, KV_SUBBIDS, svixOk, verified, forBids, forLeads, leadAddrs, forOrders, orderAddrs, otherInbox, ownOrAuto, linksOf, sourceHint, recordsFrom, extract, readMail, processEvent, applyAct, upsert, findMatch, trim, handoffSig, staffAuth, cleanSettings, LEAD_TOOL, afterStore, flushPortal, kvTable, resetKvTable: () => { KVT = null; } };
/* patch WEB: website-intake.js keeps an applicant's résumé in crm-files the same way */
exports._lib.storeFile = storeFile;
exports._test.processEvent = processEvent;
exports._test.estimateMail = estimateMail; exports._test.forEstimates = forEstimates;   /* patch ESTIN: tests */   /* patch MAILC: tests */
