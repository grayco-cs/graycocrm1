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

// netlify/functions/voice-intake.js — patch AUTAI, automation #11: VOICE NOTES → JOB NOTES, TO-DOS, CHANGE-ORDER DRAFTS.
//
// Owner 10/21: "I want on field view to be able to click the microphone and update whatever I want, choose what job
// I'm talking about … or choose where I can put the message — in a job board or to the company etc." The CRM's 🎤
// sheet (tail_AUTAI.js) records (speech recognition on the phone, or the keyboard's dictation, or — only when a
// transcription key is set — a recording sent here), and its "✨ Smart route" sends the words here.
//
//   GET  ?caps=1                         { ai, transcribe } — what this server can do (staff)
//   POST { action:'route', text, projectId?, jobs:[{id,name,client,address,po,pm}], people:[names], today }
//        → Claude splits the note into actions (job notes, to-dos with assignee + due date, change-order drafts with
//          scope / price, schedule changes, a customer update, a daily log, a message, an announcement) and picks the
//          job when none was chosen. NOTHING is applied here: the CRM shows each action and the person taps Post.
//   POST { action:'transcribe', audio:<base64>, mime }   only when OPENAI_API_KEY or DEEPGRAM_API_KEY is set
//   GET  ?list=1 / POST ?act=1 {id, op:'done'|'dismiss'}  the e-mailed notes waiting to be reviewed
//   POST (Resend inbound webhook, signed)  a Plaud (or any) transcript e-mailed to notes@: read, routed with the
//        active jobs, and kept in gc_kv "gc_voice_inbox" until someone reviews it in the 🎤 sheet ("📥 E-mailed notes").
//
// Env: ANTHROPIC_API_KEY (Claude, the same key claude-proxy uses); RESEND_API_KEY (to fetch an inbound e-mail);
//      VOICE_INBOUND_SECRET or RESEND_INBOUND_SECRET (the notes@ webhook's signing secret) or VOICE_INBOX_TOKEN (?token=);
//      optional VOICE_INBOX_TO (default notes@in.grayco-cs.com,notes@grayco-cs.com), OPENAI_API_KEY / DEEPGRAM_API_KEY
//      (server transcription; without one the option is hidden), AUT_AI_MODEL. No key is ever written in a file or logged.
'use strict';
const crypto = require('crypto');
const AI = require('./_lib/ai.js');
let portalCore = null;
function core(){ if (!portalCore) portalCore = require('./portal.js')._core; return portalCore; }

function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function hdrs(event){ const h = {}; Object.keys((event && event.headers) || {}).forEach(function(k){ h[low(k)] = event.headers[k]; }); return h; }
function rawBody(event){ return event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || ''); }
function same(a, b){ a = Buffer.from(s(a)); b = Buffer.from(s(b)); if (!a.length || a.length !== b.length) return false; try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; } }
const KV = 'gc_voice_inbox';
const TYPES = ['note', 'board', 'todo', 'change_order', 'schedule', 'customer_update', 'daily_log', 'message', 'announcement'];

/* ── Resend's signature (Svix), the same check as bid-inbox.js ── */
function svixOk(raw, h, secret){
  secret = s(secret); if (!secret) return false;
  const id = s(h['svix-id'] || h['webhook-id']), ts = s(h['svix-timestamp'] || h['webhook-timestamp']), sigs = s(h['svix-signature'] || h['webhook-signature']);
  if (!id || !ts || !sigs) return false;
  const t = parseInt(ts, 10); if (!isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  let key; try { key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64'); } catch (e) { return false; }
  if (!key.length) return false;
  const want = crypto.createHmac('sha256', key).update(id + '.' + ts + '.' + raw, 'utf8').digest('base64');
  return sigs.split(/\s+/).some(function(p){ const i = p.indexOf(','); return i > 0 && p.slice(0, i) === 'v1' && same(p.slice(i + 1), want); });
}
function inboundOk(event, raw){
  const h = hdrs(event), qs = event.queryStringParameters || {}, tok = env('VOICE_INBOX_TOKEN');
  const secrets = [env('VOICE_INBOUND_SECRET'), env('RESEND_INBOUND_SECRET')].filter(Boolean);
  if (secrets.some(function(x){ return svixOk(raw, h, x); })) return true;
  return !!(tok && same(qs.token, tok));
}

/* ── the route: Claude reads the note ── */
const TOOL = { name: 'route_voice_note', description: 'Split a construction PM\'s voice note into actions for the CRM.',
  input_schema: { type: 'object', properties: {
    job_id: { type: 'string', description: 'id of the job from the list the note is about, or "" when unclear' },
    job_confidence: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
    summary: { type: 'string' },
    actions: { type: 'array', items: { type: 'object', properties: {
      type: { type: 'string', enum: TYPES },
      text: { type: 'string', description: 'what to post / do, cleaned up, in the speaker\'s words' },
      assignee: { type: 'string', description: 'to-do / message: a person from the people list, "" = the speaker' },
      due: { type: 'string', description: 'YYYY-MM-DD or ""' },
      scope: { type: 'string', description: 'change order: the extra work' },
      price: { type: ['number', 'null'], description: 'change order: the price if one was said, else null' },
      schedule_item: { type: 'string', description: 'schedule change: what moves' },
      new_date: { type: 'string', description: 'schedule change: YYYY-MM-DD' } }, required: ['type', 'text'] } } },
    required: ['job_id', 'job_confidence', 'summary', 'actions'] } };
function prompt(text, jobs, people, today, picked){
  return 'You turn a construction project manager\'s spoken note (dictated on a phone, so expect transcription errors) into CRM actions for GrayCo Construction Services. ' +
    'Today is ' + today + ' (dates are Central time; "Friday" means the next Friday). Call the route_voice_note tool exactly once.\n' +
    'Action types: note (a job note for the team record), board (a message on the job\'s team message board), todo (a task: text, assignee from the people list or "" for the speaker, due date when said), ' +
    'change_order (extra work the customer asked for or that was found: scope, price only if a number was said), schedule (a date that moves: schedule_item + new_date), ' +
    'customer_update (something to tell the customer — friendly, no internal details, no prices unless said for the customer), daily_log (what the crew did today, weather, crew count), ' +
    'message (to one person: assignee), announcement (to the whole company). One note may give several actions; do not repeat the same thing twice; never invent anything that was not said. ' +
    (picked ? 'The speaker already picked the job: ' + picked + '. ' : 'Pick the job from the list by name, customer, street or PO; leave job_id "" and job_confidence "none" when it is not clear. ') +
    '\nJobs: ' + JSON.stringify(jobs.slice(0, 120)) + '\nPeople: ' + JSON.stringify(people.slice(0, 80)) + '\n\nThe note:\n"""' + clip(text, 12000) + '"""';
}
function fuzzyJob(text, jobs){
  const t = low(text); let best = null, score = 0;
  jobs.forEach(function(j){
    let sc = 0;
    const st = low(j.address).match(/^\s*(\d+)\s+([a-z]+)/); if (st && t.indexOf(st[1]) >= 0 && t.indexOf(st[2]) >= 0) sc += 3;
    if (s(j.po) && t.indexOf(low(j.po)) >= 0) sc += 3;
    const ln = low(j.client).split(/\s+/).filter(function(w){ return w.length > 2; }).pop(); if (ln && new RegExp('\\b' + ln.replace(/[^a-z0-9]/g, '') + '\\b').test(t)) sc += 2;
    const nm = low(j.name).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function(w){ return w.length > 3; }); if (nm.length && nm.every(function(w){ return t.indexOf(w) >= 0; })) sc += 2;
    if (sc > score) { score = sc; best = j; }
  });
  return score >= 2 ? best : null;
}
function ymdOk(v){ return /^\d{4}-\d{2}-\d{2}$/.test(s(v)) ? s(v) : ''; }
function normalize(out, jobs, picked, text){
  const ids = {}; jobs.forEach(function(j){ ids[s(j.id)] = j; });
  let jobId = picked && ids[picked] ? picked : (out && ids[s(out.job_id)] ? s(out.job_id) : '');
  let conf = picked ? 'picked' : s(out && out.job_confidence) || 'none';
  if (!jobId) { const f = fuzzyJob(text, jobs); if (f) { jobId = s(f.id); conf = 'guess'; } }
  const acts = arr(out && out.actions).filter(function(a){ return TYPES.indexOf(s(a.type)) >= 0 && s(a.text || a.scope); }).slice(0, 12).map(function(a, i){
    const price = typeof a.price === 'number' && isFinite(a.price) ? Math.round(a.price * 100) / 100 : null;
    return { id: 'va' + i, type: s(a.type), text: clip(a.text || a.scope, 2000), assignee: clip(a.assignee, 80), due: ymdOk(a.due), scope: clip(a.scope, 1000), price: price,
      scheduleItem: clip(a.schedule_item, 200), newDate: ymdOk(a.new_date) };
  });
  return { jobId: jobId, jobConfidence: conf, summary: clip(out && out.summary, 600), actions: acts };
}
async function route(text, jobs, people, picked, today){
  jobs = arr(jobs).map(function(j){ return { id: clip(j.id, 80), name: clip(j.name, 90), client: clip(j.client, 60), address: clip(j.address, 120), po: clip(j.po, 20), pm: clip(j.pm, 50) }; });
  people = (Array.isArray(people) ? people : []).map(function(x){ return clip(typeof x === 'string' ? x : x && x.name, 60); }).filter(Boolean);
  const pj = picked && jobs.find(function(j){ return j.id === picked; });
  const r = await AI.ask({ tool: TOOL, maxTokens: 3000, content: [{ type: 'text', text: prompt(text, jobs, people, today, pj ? pj.name + ' (' + pj.id + ')' : '') }] });
  if (!r.ok) return { ok: false, error: r.why, fallback: normalize(null, jobs, picked, text) };
  return Object.assign({ ok: true }, normalize(r.out, jobs, picked, text));
}

/* ── optional server transcription (hidden unless a key is set) ── */
function transcriber(){ return env('OPENAI_API_KEY') ? 'openai' : (env('DEEPGRAM_API_KEY') ? 'deepgram' : ''); }
async function transcribe(b64, mime){
  const who = transcriber(); if (!who) return { ok: false, error: 'Transcription is not set up.' };
  const buf = Buffer.from(s(b64), 'base64'); if (!buf.length || buf.length > 24 * 1024 * 1024) return { ok: false, error: 'The recording is empty or too long.' };
  mime = /^audio\/[a-z0-9.+-]+$/i.test(s(mime).split(';')[0]) ? s(mime).split(';')[0] : 'audio/webm';
  try {
    if (who === 'openai') {
      const fd = new FormData(); fd.append('model', env('OPENAI_TRANSCRIBE_MODEL') || 'whisper-1');
      fd.append('file', new Blob([buf], { type: mime }), 'note.' + (mime.split('/')[1] || 'webm').replace(/[^a-z0-9]/g, ''));
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + env('OPENAI_API_KEY') }, body: fd });
      const j = await r.json().catch(function(){ return null; });
      return r.ok && j ? { ok: true, text: s(j.text) } : { ok: false, error: 'Transcription answered ' + r.status };
    }
    const r = await fetch('https://api.deepgram.com/v1/listen?smart_format=true&punctuate=true', { method: 'POST', headers: { Authorization: 'Token ' + env('DEEPGRAM_API_KEY'), 'Content-Type': mime }, body: buf });
    const j = await r.json().catch(function(){ return null; });
    const t = j && j.results && j.results.channels && j.results.channels[0] && j.results.channels[0].alternatives && j.results.channels[0].alternatives[0];
    return r.ok && t ? { ok: true, text: s(t.transcript) } : { ok: false, error: 'Transcription answered ' + r.status };
  } catch (e) { return { ok: false, error: 'Transcription unreachable' }; }
}

/* ── an e-mailed transcript (notes@) ── */
async function resendGet(path){
  const key = env('RESEND_API_KEY'); if (!key) return null;
  try { const r = await fetch('https://api.resend.com' + path, { headers: { Authorization: 'Bearer ' + key } }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
function addrOf(v){ let t = v; if (Array.isArray(t)) t = t[0]; if (t && typeof t === 'object') t = t.email || t.address || ''; t = s(t); const m = t.match(/<([^>]+)>/); return low(m ? m[1] : t); }
function addrs(v){ return (Array.isArray(v) ? v : (v ? String(v).split(',') : [])).map(addrOf).filter(Boolean); }
function htmlToText(h){ return s(String(h || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ')); }
async function readMail(data){
  const id = s(data.email_id || data.emailId || data.id);
  let full = id ? await resendGet('/emails/receiving/' + encodeURIComponent(id)) : null;
  if (full && full.data && !full.subject && !full.text) full = full.data;
  const m = Object.assign({}, data, full || {});
  let text = s(m.text) || htmlToText(m.html);
  let atts = arr(m.attachments);
  if (id) { const al = await resendGet('/emails/receiving/' + encodeURIComponent(id) + '/attachments'); const a2 = al && (Array.isArray(al.data) ? al.data : (Array.isArray(al) ? al : null)); if (a2 && a2.length) atts = a2; }
  for (const a of atts.slice(0, 5)) {
    const name = s(a.filename || a.name);
    if (!/\.(txt|md|vtt|srt)$/i.test(name) && !/^text\//i.test(s(a.content_type || a.contentType))) continue;
    let t = '';
    if (a.content) { try { t = Buffer.from(String(a.content), 'base64').toString('utf8'); } catch (e) {} }
    else if (a.download_url || a.url) { try { const r = await fetch(a.download_url || a.url); if (r.ok) t = await r.text(); } catch (e) {} }
    if (t) text += '\n\n[' + name + ']\n' + t.replace(/^\d+\s*$|^\d\d:\d\d:\d\d[.,]\d+ --> .*$|^WEBVTT.*$/gm, '').replace(/\n{2,}/g, '\n');
  }
  return { id: id, from: addrOf(m.from), to: addrs(m.to).concat(addrs(m.cc)), subject: clip(m.subject, 200), text: clip(text, 30000), headers: m.headers || {} };
}
function forNotes(mail){ const want = (env('VOICE_INBOX_TO') || 'notes@in.grayco-cs.com,notes@grayco-cs.com').split(',').map(low).filter(Boolean); return mail.to.some(function(x){ return want.indexOf(x) >= 0; }); }
async function inbound(evt){
  if (!evt || !/email\.received|inbound/i.test(s(evt.type)) && !(evt.data && (evt.data.email_id || evt.data.subject))) return { ok: true, ignored: 'not an e-mail' };
  const mail = await readMail(evt.data || {});
  if (!forNotes(mail)) return { ok: true, ignored: 'not for notes@' };
  if (/^(mailer-daemon|postmaster)@/.test(mail.from) || /^(portal|billing|noreply|news)@grayco-cs\.com$/.test(mail.from)) return { ok: true, ignored: 'our own / a bounce' };
  if (!s(mail.text)) return { ok: true, ignored: 'empty' };
  const C = core(); const d = await C.kvRead(['projects', 'users']);
  const users = arr(d.users), me = users.find(function(u){ return low(u.email) === mail.from; }) || {};
  const jobs = arr(d.projects).filter(function(p){ return p.deleted !== true && !/complete|closed|cancel|lost/i.test(s(p.status)); })
    .map(function(p){ return { id: p.id, name: p.name, client: p.client, address: p.address, po: p.autoPO || p.po, pm: p.pm }; });
  const r = await route(mail.text, jobs, users.filter(function(u){ return u.active !== false; }).map(function(u){ return u.name; }), '', new Date().toISOString().slice(0, 10));
  const item = { id: 'vn_' + (mail.id ? crypto.createHash('sha256').update(mail.id).digest('hex').slice(0, 16) : Date.now().toString(36)), at: new Date().toISOString(), source: 'email',
    from: mail.from, fromName: s(me.name), subject: mail.subject, text: mail.text, result: r.ok ? r : Object.assign({ aiError: r.error }, r.fallback), status: 'new' };
  const has = function(l){ return l.some(function(x){ return s(x.id) === item.id; }); };
  const w = await C.kvListUpdate(KV, function(l){ return has(l) ? null : { list: l.concat([item]).slice(-400), check: has }; });
  return { ok: w.ok, id: item.id, actions: (item.result.actions || []).length };
}

/* ── the door ── */
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
exports.handler = async function(event){
  event = event || {};
  const cors = gcCors(event, 'GET, POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  const qs = event.queryStringParameters || {};
  const raw = rawBody(event);
  let body = {}; try { body = JSON.parse(raw || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Bad request' }, cors); }
  /* the inbound webhook (no sign-in: Resend's signature instead) */
  if (event.httpMethod === 'POST' && !body.action && !qs.act && (body.type || body.data)) {
    if (!inboundOk(event, raw)) return J(401, { ok: false, error: 'Not signed by Resend.' });
    try { return J(200, await inbound(body)); } catch (e) { return J(200, { ok: false, error: 'kept for a retry' }); }
  }
  const who = await gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode, { ok: false, error: who.error }, cors);
  try {
    if (event.httpMethod === 'GET' && qs.caps) return J(200, { ok: true, ai: AI.ready(), transcribe: !!transcriber() }, cors);
    if (event.httpMethod === 'GET' && qs.list) { const cur = await core().kvListRead(KV); return J(200, { ok: true, items: cur ? cur.list.filter(function(x){ return x.status === 'new'; }) : [] }, cors); }
    if (event.httpMethod !== 'POST') return J(405, { ok: false, error: 'Method not allowed' }, cors);
    if (qs.act) {
      const id = s(body.id), op = s(body.op); if (!id || ['done', 'dismiss'].indexOf(op) < 0) return J(400, { ok: false, error: 'Bad request' }, cors);
      const now = new Date().toISOString();
      const w = await core().kvListUpdate(KV, function(l){ const x = l.find(function(y){ return s(y.id) === id; }); if (!x || x.status !== 'new') return null; x.status = op; x.doneBy = who.email; x.doneAt = now; return { list: l, check: function(l2){ const z = l2.find(function(y){ return s(y.id) === id; }); return !!(z && z.status === op); } }; });
      return J(w.ok ? 200 : 502, { ok: w.ok }, cors);
    }
    if (body.action === 'route') {
      const text = s(body.text); if (!text) return J(400, { ok: false, error: 'Say or type something first.' }, cors);
      if (!AI.ready()) return J(200, { ok: false, error: 'ANTHROPIC_API_KEY is not set on Netlify', noAi: true }, cors);
      const r = await route(text, body.jobs, body.people, s(body.projectId), ymdOk(body.today) || new Date().toISOString().slice(0, 10));
      return J(200, r, cors);
    }
    if (body.action === 'transcribe') return J(200, await transcribe(body.audio, body.mime), cors);
    return J(400, { ok: false, error: 'Bad request' }, cors);
  } catch (e) { return J(500, { ok: false, error: 'The voice note hit a problem: ' + clip(e && e.message || e, 120) }, cors); }
};
exports._test = { route: route, normalize: normalize, fuzzyJob: fuzzyJob, inbound: inbound, svixOk: svixOk, transcriber: transcriber };
