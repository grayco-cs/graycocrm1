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

// netlify/functions/send-email.js
// GrayCo — sends email through Resend. Used by invoices (office@), the thank-you
// email (office@), and marketing (news@). Every send is triggered by an admin
// clicking "send" in the CRM after review — nothing auto-sends from here.
//
// Required env var: RESEND_API_KEY
//
// POST body:
//   {
//     to:        "client@example.com"  (required),
//     subject:   "..."                 (required),
//     html:      "<...>"               (required),
//     from:      "office" | "news"     (optional, default "office"),
//     replyTo:   "..."                 (optional),
//     cc:        [...]                 (optional)
//   }
//
// Patch AP2 — GrayCo News: anything sent from news@ is news. It goes to ONE customer per e-mail, an
// unsubscribed address is skipped (answer { ok:true, skipped:'unsubscribed' }), and it gets the footer
// ("You're receiving GrayCo news because you're a GrayCo customer. Unsubscribe from our newsletters",
// the street address and phone) and the List-Unsubscribe / List-Unsubscribe-Post (one-click) headers.
// See _lib/news.js. Invoices, portal links, signed papers and receipts (office@ / billing@) are not news.
//
// Patch AP2 — "send from your own e-mail with one click":
//   { mode:'personal', to, cc?, subject, html, attachments?, pid?, customer?, kind? }
//   From = "<your name> <your @grayco-cs.com address>" — ALWAYS the signed-in person's own address (the sign-in
//   token decides, never the request), Reply-To = the same, and a BCC to you so it is in your own mailbox.
//   Person-to-person mail needs no approval. Each one is logged (gc_kv "gc_email_log") for the job / customer.
//   attachments: [{ filename, content: <base64> } | { filename, ref: "sb:crm-files/<sha256>.<ext>" }] —
//   pdf / png / jpg only, at most 5, 10 MB in all; a ref is read from OUR crm-files bucket only.
// And on every path: a personal @grayco-cs.com sender must be the signed-in person (only the shared
// mailboxes office@ / billing@ / news@ / portal@ may be used by any staff member). Nobody can send as someone else.

const RESEND_URL = 'https://api.resend.com/emails';

/* patch AUT2 (audit #4): every e-mail sent here gets the ONE GrayCo shell (logo, the sender's signature — name,
   title, cell, e-mail, photo — the office line and the licenses), unless it already has it (data-gc-shell) or the
   caller asks for none ({shell:false}). The signature is the signed-in sender's own (body.sender may name the PM
   for a shared mailbox: office@ / billing@). */
async function shellOut(html, who, body){
  if (body && body.shell === false) return html;
  try {
    const B = require('./_lib/brand.js');
    const sd = body && body.sender && typeof body.sender === 'object' ? body.sender : null;
    return await B.shellFor(html, { email: (sd && sd.email) || who.email, name: (sd && sd.name) || who.name, portalUrl: body && /^https:\/\//.test(String(body.portalUrl || '')) ? body.portalUrl : '' });
  } catch (e) { return html; }
}

// Named shortcuts. But ANY @grayco-cs.com address is allowed as a sender, because
// the whole grayco-cs.com domain is verified in Resend — one setup covers everyone.
const FROM = {
  office:  'GrayCo Construction Services <office@grayco-cs.com>',
  news:    'GrayCo Construction Services <news@grayco-cs.com>',
  billing: 'GrayCo Construction Services Billing <billing@grayco-cs.com>'
};
const ALLOWED_DOMAIN = 'grayco-cs.com';
// Resolve the sender: a named shortcut, a full "Name <addr>" string, or a bare
// @grayco-cs.com address (with optional display name).
function resolveFrom(input, displayName){
  if(!input) return FROM.office;
  if(FROM[input]) return FROM[input];              // named shortcut
  var raw = String(input).trim();
  // extract the address if it's in "Name <addr>" form
  var m = raw.match(/<([^>]+)>/);
  var addr = (m ? m[1] : raw).trim().toLowerCase();
  // ONLY allow sending from your own verified domain — never someone else's.
  if(addr.indexOf('@'+ALLOWED_DOMAIN) < 0) return null;   // rejected
  var name = displayName || 'GrayCo Construction Services';
  return name + ' <' + addr + '>';
}

/* ── patch AP2: who may send as whom ── */
const SHARED_BOXES = ['office@grayco-cs.com', 'billing@grayco-cs.com', 'news@grayco-cs.com', 'portal@grayco-cs.com'];
function addrOf(from){ const m = String(from || '').match(/<([^>]+)>/); return String(m ? m[1] : from || '').trim().toLowerCase(); }
function cleanName(n){ return String(n || '').replace(/[<>"\r\n\\,;:@]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }
const EMAIL_RE = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i;
function emails(v){ return (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;\s]+/)).map(function(x){ return String(x || '').trim().toLowerCase(); }).filter(Boolean); }

/* ── attachments: our files only, small, pdf / png / jpg (same rules as patch SC) ── */
const ATT_MAX_BYTES = 10 * 1024 * 1024, ATT_MAX_FILES = 5;
const ATT_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
function attKind(buf){
  if (buf.length >= 5 && buf.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.length >= 8 && buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG') return 'png';
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  return '';
}
async function readAttachments(list){
  if (list == null) return { ok: true, files: [] };
  if (!Array.isArray(list)) return { ok: false, error: 'attachments must be a list' };
  if (list.length > ATT_MAX_FILES) return { ok: false, error: 'At most ' + ATT_MAX_FILES + ' attachments.' };
  const out = []; let total = 0;
  for (const a of list) {
    if (!a || typeof a !== 'object') return { ok: false, error: 'Bad attachment.' };
    const name = String(a.filename || '').replace(/[\\/\r\n\0]/g, '').trim().slice(0, 150);
    const ext = (name.match(/\.([A-Za-z0-9]+)$/) || [])[1];
    if (!name || !ext || !ATT_TYPES[ext.toLowerCase()]) return { ok: false, error: 'Only PDF, PNG or JPG attachments (' + (name || 'no name') + ').' };
    let buf;
    if (a.ref != null) {
      const m = /^sb:crm-files\/([0-9a-f]{64}\.(pdf|png|jpe?g))$/i.exec(String(a.ref));
      if (!m) return { ok: false, error: 'An attachment reference must be one of our job files.' };
      const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (!svc) return { ok: false, error: 'SUPABASE_SERVICE_KEY is not set on Netlify (needed to attach a job file).' };
      const base = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
      const r = await fetch(base + '/storage/v1/object/crm-files/' + m[1], { headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
      if (!r.ok) return { ok: false, error: 'The job file could not be read (HTTP ' + r.status + ').' };
      buf = Buffer.from(await r.arrayBuffer());
    } else if (typeof a.content === 'string') {
      const b64 = a.content.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return { ok: false, error: 'Attachment content must be base64.' };
      if (b64.length > Math.ceil(ATT_MAX_BYTES / 3) * 4 + 4) return { ok: false, error: 'Attachments are limited to 10 MB in all.' };
      buf = Buffer.from(b64, 'base64');
    } else return { ok: false, error: 'An attachment needs content (base64) or a job-file ref.' };
    total += buf.length;
    if (total > ATT_MAX_BYTES) return { ok: false, error: 'Attachments are limited to 10 MB in all.' };
    const kind = attKind(buf), want = ext.toLowerCase() === 'jpeg' ? 'jpg' : ext.toLowerCase();
    if (!kind || kind !== want) return { ok: false, error: name + ' is not a real ' + want.toUpperCase() + ' file.' };
    out.push({ filename: name, content: buf.toString('base64'), content_type: ATT_TYPES[want] });
  }
  return { ok: true, files: out };
}

/* ── the sent-mail log (gc_kv "gc_email_log", JSON text, newest 3000) — read again just before writing ── */
async function logSent(entry){
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!svc) return false;
  const base = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const H = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(svc) ? { apikey: svc, Authorization: 'Bearer ' + svc } : { apikey: svc };
  const read = async function(){
    const r = await fetch(base + '/rest/v1/gc_kv?select=value,updated_at&key=eq.gc_email_log', { headers: H });
    if (!r.ok) return null;
    const rows = await r.json(); let v = rows && rows[0] ? rows[0].value : [];
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } }
    return { list: Array.isArray(v) ? v : [], at: rows && rows[0] ? String(rows[0].updated_at || '') : '' };
  };
  for (let i = 0; i < 4; i++) {
    const cur = await read(); if (!cur) return false;
    const again = await read(); if (!again || again.at !== cur.at) continue;
    const list = cur.list.filter(function(x){ return x && x.id !== entry.id; }).concat([entry]).slice(-3000);
    const w = await fetch(base + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, H),
      body: JSON.stringify({ key: 'gc_email_log', value: JSON.stringify(list), updated_at: new Date().toISOString() }) });
    if (!w.ok) return false;
    const after = await read();
    if (after && after.list.some(function(x){ return x && x.id === entry.id; })) return true;
  }
  return false;
}

/* one click, from your own address (patch AP2) */
async function sendPersonal(body, who, key, headers){
  const me = String(who.email || '').toLowerCase();
  if (!/@grayco-cs\.com$/.test(me)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Your sign-in (' + me + ') is not a @grayco-cs.com address, so it cannot send as you.' }) };
  if (body.from != null && body.from !== '' && addrOf(body.from) !== me) return { statusCode: 403, headers, body: JSON.stringify({ error: 'You can only send from your own address (' + me + ').' }) };
  const to = emails(body.to), cc = emails(body.cc);
  if (!to.length || to.length > 10 || to.some(function(e){ return !EMAIL_RE.test(e); })) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Check the "To" address.' }) };
  if (cc.length > 10 || cc.some(function(e){ return !EMAIL_RE.test(e); })) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Check the CC addresses.' }) };
  const subject = String(body.subject || '').trim().slice(0, 250), html = String(body.html || '');
  if (!subject || !html.trim()) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Add a subject and a message.' }) };
  const att = await readAttachments(body.attachments);
  if (!att.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: att.error }) };
  const name = cleanName(who.name) || cleanName(body.fromName) || me.split('@')[0];
  const payload = { from: name + ' <' + me + '>', reply_to: me, to: to, subject: subject, html: await shellOut(html, who, body), bcc: [me], headers: { 'X-GrayCo-CRM': 'personal' } };   /* patch X9: the job's e-mail history shows it from the CRM's log, not twice */
  if (cc.length) payload.cc = cc;
  if (att.files.length) payload.attachments = att.files;
  let data = {}, resp;
  try {
    resp = await fetch(RESEND_URL, { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    data = await resp.json().catch(function(){ return {}; });
  } catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ error: 'The e-mail service did not answer.' }) }; }
  if (!resp.ok) return { statusCode: resp.status, headers, body: JSON.stringify({ error: (data && data.message) || 'Send failed' }) };
  const entry = { id: 'em_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), at: new Date().toISOString(), kind: 'personal',
    by: name, from: me, to: to, cc: cc, subject: subject, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
    pid: String(body.pid || '').slice(0, 80), customer: String(body.customer || '').slice(0, 120), about: String(body.about || '').slice(0, 40),
    attachments: att.files.map(function(f){ return f.filename; }), resendId: data && data.id || '' };
  let logged = false; try { logged = await logSent(entry); } catch (e) {}
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: data && data.id, from: payload.from, logged: logged, entry: entry }) };
}

exports.handler = async function (event) {
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Only signed-in GrayCo staff may send mail as @grayco-cs.com.
  const who = await gcStaffAuth(event);
  if (!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ error: who.error }) };

  const key = process.env.RESEND_API_KEY;
  if (!key) return { statusCode: 500, headers, body: JSON.stringify({ error: 'RESEND_API_KEY not set on Netlify.' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  if (body.mode === 'personal') return sendPersonal(body, who, key, headers);   /* patch AP2 */

  const to = body.to;
  const subject = body.subject;
  const html = body.html;
  if (!to || !subject || !html) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'to, subject, and html are all required' }) };
  }

  const from = resolveFrom(body.from, body.fromName);
  if(!from){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Sender must be an @grayco-cs.com address (the verified domain).' }) };
  }

  /* patch AP2: nobody sends as another person — a personal address must be the signed-in one's own */
  if (SHARED_BOXES.indexOf(addrOf(from)) < 0 && addrOf(from) !== String(who.email || '').toLowerCase())
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'You can only send from your own address (' + who.email + ') or office@ / billing@.' }) };
  if (body.replyTo && SHARED_BOXES.indexOf(addrOf(body.replyTo)) < 0 && addrOf(body.replyTo) !== String(who.email || '').toLowerCase() && /@grayco-cs\.com$/i.test(addrOf(body.replyTo)))
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Reply-To must be your own address or a shared mailbox.' }) };

  /* patch AP2: news@ mail goes through the one news path (unsubscribed skipped, footer + one-click headers) */
  if (/<news@grayco-cs\.com>$/i.test(from)) {
    const list = Array.isArray(to) ? to : [to];
    if (list.length !== 1 || body.cc) return { statusCode: 400, headers, body: JSON.stringify({ error: 'GrayCo News goes to one customer per e-mail (each gets their own unsubscribe link).' }) };
    const res = await require('./_lib/news.js').sendNews({ to: list[0], subject: subject, html: await shellOut(html, who, body), text: body.text });
    if (res.skipped) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: res.skipped }) };
    if (!res.ok) return { statusCode: res.status || 502, headers, body: JSON.stringify({ error: res.error || 'Send failed' }) };
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  const payload = {
    from: from,
    to: Array.isArray(to) ? to : [to],
    subject: require('./_lib/mailtag.js').tag(subject, Array.isArray(to) ? to : [to], body.kind || body.template || ''),   /* owner 10/21: internal CRM mail says what it is about */
    html: await shellOut(html, who, body)
  };
  if (body.replyTo) payload.reply_to = body.replyTo;
  if (body.cc) payload.cc = Array.isArray(body.cc) ? body.cc : [body.cc];
  const att = await readAttachments(body.attachments);
  if (!att.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: att.error }) };
  if (att.files.length) payload.attachments = att.files;

  try {
    const resp = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (!resp.ok) {
      // Resend returns helpful errors — pass them through so the CRM can show why
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: (data && data.message) || 'Send failed', detail: data }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: data.id }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
