// netlify/functions/portal-sign.js
// GrayCo — EVERY SIGNATURE IN THE CUSTOMER'S PORTAL, ESTIMATE FOLLOW-UPS, REFERRALS (patch AUTO5).
//
// Owner 10/21: "the job is probably already a job if we send an estimate out anyway … but I do want all signatures
// to be in their portal." "All change orders need a signature." Estimate nudges on day 2, 5 and 10 — only the first
// one needs approval. "Contact your PM about our referral program."
//
// The papers waiting for a customer's signature live in ONE shared list, gc_kv "gc_sign_requests" (JSON text,
// changed only through portal.js kvListUpdate, so no save is ever lost). The CRM reads it (patch AUTO5) and does the
// rest on the job: estimate / contract signed → the job is signed (AUT3 kickoff: schedule from the job type's
// template, deposit invoice draft → approval); change order signed → the CO is approved; the signed copy goes into
// the job's documents.
//
// STAFF (signed in to the CRM + on gc_staff — the same inline check as every function):
//   POST {action:'request', projectId, kind, refId, title, amount, lines, docRef|url, note, auto}
//        → the paper waits in the customer's portal ("✍️ Papers to sign"); the e-mail asking them to sign waits on
//          ✅ Approvals (estimate / contract: the PM, then an admin; change order / other: the PM). A request the
//          CRM made by itself (auto, e.g. a new change order) shows in the portal only once that e-mail is approved.
//   POST {action:'list', projectId}   → the job's requests (with the e-mail's approval state)
//   POST {action:'void', id}          → take a request back (it leaves the portal)
// PUBLIC (the customer's link code in x-portal-token, or a portal session — exactly like portal.js / selections.js):
//   POST {action:'view'}                                → this ONE job's papers to sign / signed / declined + the PM
//   POST {action:'sign', id, name, agree:true, strokes?} → typed name (+ drawn signature): a signed copy (PDF) goes to
//                                                          the private file storage, the customer gets it at once,
//                                                          the PM an e-mail, the office a to-do
//   POST {action:'decline', id, reason}                 → the PM and the office are told
//   POST {action:'refer', name, phone, email, address, note} → "Refer a friend": a GrayCo lead on the Lead Inbox,
//                                                          assigned to this customer's PM, tagged "Referred by …"
// SCHEDULED: runFollowups() — called by portal-reminders.js every hour.
//
// Env: the portal's (SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, PORTAL_MAIL_OFF, PORTAL_BASE_URL,
// PORTAL_AUTO_EMAIL), optional EST_FOLLOWUPS_OFF=1.

/* ── GrayCo staff check (the same inline copy every function carries) ───────── */
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const GC_PORTAL_ORIGIN = 'https://portal.grayco-cs.com';
function portalOrigin(){ const v = String(process.env.PORTAL_BASE_URL || '').trim().replace(/\/$/, ''); return /^https:\/\//.test(v) ? v : GC_PORTAL_ORIGIN; }
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
function gcCors(event, methods, extraHeaders){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').concat([portalOrigin()]).map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization' + (extraHeaders ? ', ' + extraHeaders : ''), 'Access-Control-Allow-Methods': methods || 'POST, OPTIONS' };
}
async function gcStaffAuth(event){
  const m = /^Bearer\s+(\S+)$/i.exec(gcHeader(event, 'authorization').trim());
  if (!m) return { ok: false, statusCode: 401, error: 'Sign in to the GrayCo CRM first (no sign-in token was sent).' };
  const url = sbUrl(), anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  let user = null;
  try { const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + m[1] } }); if (r.ok) user = await r.json(); }
  catch (e) { return { ok: false, statusCode: 503, error: 'Could not reach the sign-in service. Try again.' }; }
  const email = low(user && user.email);
  if (!email) return { ok: false, statusCode: 401, error: 'Your sign-in has expired. Sign in again.' };
  let role = null, listed = false, name = '';
  if (svcKey()) {
    try {
      const r = await fetch(url + '/rest/v1/gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(email), { headers: keyHeaders(svcKey()) });
      if (r.ok) { listed = true; const rows = await r.json(); const row = Array.isArray(rows) && rows[0]; if (row && row.active !== false) { role = low(row.role || 'staff'); name = s(row.name); } }
    } catch (e) {}
  }
  if (!listed) { const env = (process.env.STAFF_EMAILS || '').split(',').map(low).filter(Boolean); if (env.indexOf(email) > -1) role = 'staff'; }
  if (!role) return { ok: false, statusCode: 403, error: 'This account (' + email + ') is not on the GrayCo staff list.' };
  return { ok: true, email: email, role: role, name: name };
}

const crypto = require('crypto');
try { require('./_lib/brand.js').installResend(); } catch (e) {}   /* every customer e-mail gets the GrayCo shell */
const OFFICE_PHONE = '901-585-0944';
const NOT_ACTIVE = 'This link is not active — call GrayCo ' + OFFICE_PHONE;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const KEY = 'gc_sign_requests', FU_KEY = 'gc_est_followups';
const KINDS = { estimate: 'Estimate', contract: 'Contract', change_order: 'Change order', doc: 'Document' };
const SIGN_SECS = 3600, MIN_FAIL_MS = 250, DAY = 86400e3;
const FU_DAYS = [2, 5, 10];   /* owner: nudges on day 2, 5 and 10 until signed or declined */
const COMMON_CARRIERS = /\b(state\s*farm|allstate|usaa|liberty\s*mutual|nationwide|travelers|progressive|american\s*family|erie\s*insurance|chubb|the\s*hartford|auto[\s-]*owners|safeco|geico|homesite|metlife|amica|tennessee\s*farmers|farmers\s*insurance|farm\s*bureau|shelter\s*insurance|cincinnati\s*insurance|universal\s*property|citizens\s*property|kemper|hippo\s*insurance|foremost|assurant|american\s*strategic|asi\s*insurance|stillwater)\b/gi;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function num(v){ if (v == null || v === '') return NaN; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : NaN; }
function money(n){ return Math.round(n * 100) / 100; }
function usd(n){ return (n < 0 ? '−' : '') + '$' + Math.abs(money(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function isJwt(k){ return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(k || '')); }
function keyHeaders(k){ return isJwt(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }; }
function H(extra){ return Object.assign(keyHeaders(svcKey()), { 'Content-Type': 'application/json' }, extra || {}); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function firstName(v){ return s(v).split(/[\s,&]+/)[0] || ''; }
function mailOff(){ return process.env.PORTAL_MAIL_OFF === '1' || process.env.PORTAL_MAIL_OFF === 'true'; }
function okEmail(v){ return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(v)); }
function needsApproval(){ return process.env.PORTAL_AUTO_EMAIL !== '1'; }
function core(){ return require('./portal.js')._core; }        /* the approvals list, the office to-dos, the shared-list writer */
function sel(){ return require('./selections.js')._sel; }      /* the signed-copy PDF writer and the input checks (patch SEL) */
function central(iso){ try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' (Central)'; } catch (e) { return iso; } }
function wallHour(t){ try { return +new Date(t).toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }) % 24; } catch (e) { return 12; } }

/* ── never the carrier (owner rule: the insurance company's name is never shown to the customer) ── */
function carrierWords(p){
  const out = [];
  ['insCarrier', 'carrier', 'insurer', 'insuranceCompany', 'insuranceCarrier', 'insCompany', 'insuranceCo', 'carrierName'].forEach(function(k){ const v = s(p && p[k]); if (v.length >= 3) out.push(v); });
  return out;
}
function scrubber(p){
  if (p && p.portalShowCarrier === true) return function(t){ return s(t); };
  const res = carrierWords(p).map(function(w){ return new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); }).concat([COMMON_CARRIERS]);
  return function(t){ t = s(t); res.forEach(function(re){ re.lastIndex = 0; t = t.replace(re, 'your insurance company'); }); return t; };
}

/* ── private file storage (crm-files) ── */
function refPath(ref){ const m = /^sb:crm-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/.exec(s(ref)); return m ? m[1] : ''; }
async function signRefs(refs){
  const paths = Array.from(new Set(refs.map(refPath).filter(Boolean))).slice(0, 120), out = {};
  if (!paths.length || !svcKey()) return out;
  try {
    const r = await fetch(sbUrl() + '/storage/v1/object/sign/crm-files', { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: SIGN_SECS, paths: paths }) });
    if (!r.ok) return out;
    (await r.json() || []).forEach(function(x){ const u = s(x && (x.signedURL || x.signedUrl)); if (x && x.path && u && !x.error) out['sb:crm-files/' + x.path] = /^https:/.test(u) ? u : sbUrl() + '/storage/v1' + (u[0] === '/' ? '' : '/') + u; });
  } catch (e) {}
  return out;
}
async function uploadPdf(buf){
  const hash = crypto.createHash('sha256').update(buf).digest('hex'), path = hash + '.pdf';
  try {
    const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: Object.assign(keyHeaders(svcKey()), { 'Content-Type': 'application/pdf', 'x-upsert': 'true' }), body: buf });
    if (r.ok || r.status === 409) return 'sb:crm-files/' + path;
  } catch (e) {}
  return '';
}

/* ── the link table (gc_portal) and the customer sessions — as portal.js / selections.js ── */
async function tokenRow(token){
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal?select=token,project_id,revoked&token=eq.' + encodeURIComponent(token), { headers: H() });
  if (!r.ok) return null;
  const rows = await r.json(), row = Array.isArray(rows) && rows[0];
  if (!row || typeof row.token !== 'string') return null;
  const a = Buffer.from(row.token), b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return row;
}
async function sessionLinkRow(sessTok, pid){
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(sessTok)) return null;
  const id = crypto.createHash('sha256').update(sessTok).digest('hex');
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal_session?select=kind,links,expires_at,revoked&id=eq.' + id, { headers: H() });
  if (!r.ok) return null;
  const ses = ((await r.json()) || [])[0];
  if (!ses || ses.kind !== 'customer' || ses.revoked === true || Date.parse(ses.expires_at) < Date.now()) return null;
  const links = (Array.isArray(ses.links) ? ses.links : []).map(String).filter(function(x){ return TOKEN_RE.test(x); });
  if (!links.length) return null;
  const q = await fetch(sbUrl() + '/rest/v1/gc_portal?select=token,project_id,revoked&revoked=eq.false&token=in.(' + links.map(function(x){ return '"' + x + '"'; }).join(',') + ')', { headers: H() });
  if (!q.ok) return null;
  const live = (await q.json()) || [];
  return live.find(function(x){ return String(x.project_id) === String(pid); }) || (!pid && live.length === 1 ? live[0] : null);
}
const hits = new Map(), writes = new Map();
const LIMIT = { req: 60, bad: 8, windowMs: 10 * 60e3, writes: 20 };
function ipOf(event){ return s(gcHeader(event, 'x-nf-client-connection-ip') || gcHeader(event, 'x-forwarded-for').split(',')[0] || gcHeader(event, 'client-ip') || 'unknown'); }
function limited(ip){
  const now = Date.now(); let h = hits.get(ip);
  if (!h || now - h.start > LIMIT.windowMs) { h = { start: now, req: 0, bad: 0 }; hits.set(ip, h); }
  h.req++; if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return h.req > LIMIT.req || h.bad >= LIMIT.bad;
}
function noteBad(ip){ const h = hits.get(ip); if (h) h.bad++; }
function tooManyWrites(token){
  const now = Date.now(); let w = writes.get(token);
  if (!w || now - w.start > LIMIT.windowMs) { w = { start: now, n: 0 }; writes.set(token, w); }
  w.n++; if (writes.size > 5000) writes.delete(writes.keys().next().value);
  return w.n > LIMIT.writes;
}

/* ── the job, its PM, its customer ── */
async function jobData(force){ return core().crmData(!!force); }
function pmFull(data, p){
  const name = s(p.pm || p.projectManager || p.pmName);
  if (!name) return null;
  const u = arr(data.users).find(function(x){ return low(x.name) === low(name); }) || {};
  return { name: name, email: low(u.email || p.pmEmail || ''), phone: s(u.phone || u.cell || u.mobile || '') };
}
function custEmail(p){ return s(p.clientEmail || p.customerEmail || p.email); }
function jobTag(p, T){
  const po = s(p.autoPO || p.po);
  return [po ? 'PO ' + po : '', T(p.name), s(p.address || p.jobAddress)].filter(Boolean).join(' · ');
}

/* ── the shared list ── */
async function readReqs(){ const cur = await core().kvListRead(KEY); return cur ? cur.list : null; }
function apprId(r){ return 'appr_sign_' + r.id; }
async function approvals(){ try { const cur = await core().kvListRead(core().AQ_KEY); return cur ? cur.list : []; } catch (e) { return []; } }
function apprOf(list, r){ return list.find(function(x){ return x && s(x.id) === apprId(r); }) || null; }
/* what the customer sees: a request a person made at once; one the CRM made by itself once its e-mail went out */
function visible(r, aq){
  if (!r || r.status === 'void') return false;
  if (r.status !== 'pending') return true;
  if (!r.auto) return true;
  if (!needsApproval()) return true;
  const a = apprOf(aq, r); return !!(a && a.status === 'sent');
}

/* ── STAFF: ask for a signature ── */
const ID_RE = /^[A-Za-z0-9_.:-]{1,90}$/;
function cleanLines(v){
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).map(function(x){
    if (x && typeof x === 'object') return { l: clip(x.l != null ? x.l : x.label, 140), r: clip(x.r != null ? x.r : x.value, 60) };
    return { l: clip(x, 140), r: '' };
  }).filter(function(x){ return x.l; });
}
async function request(body, who){
  const pid = s(body.projectId), kind = s(body.kind);
  if (!ID_RE.test(pid)) return { status: 400, out: { ok: false, error: 'Open a job first.' } };
  if (!KINDS[kind]) return { status: 400, out: { ok: false, error: 'Unknown paper.' } };
  const title = clip(body.title, 120); if (!title) return { status: 400, out: { ok: false, error: 'The paper needs a title.' } };
  const refId = s(body.refId); if (refId && !ID_RE.test(refId)) return { status: 400, out: { ok: false, error: 'Bad request' } };
  const amount = num(body.amount);
  const docRef = refPath(body.docRef) ? s(body.docRef) : '';
  const url = /^https:\/\/[^\s"'<>]{4,500}$/.test(s(body.url)) ? s(body.url) : '';
  const data = await jobData(true), p = core().findProject(data, pid);
  if (!p) return { status: 404, out: { ok: false, retry: true, error: 'The job is not in the cloud yet — try again in a minute.' } };
  const T = scrubber(p);
  const now = new Date().toISOString();
  const base = 'sr_' + pid + '_' + kind + '_' + (refId || crypto.createHash('sha256').update(title).digest('hex').slice(0, 10));
  let made = null, existing = null;
  const res = await core().kvListUpdate(KEY, function(l){
    const mine = l.filter(function(x){ return s(x.id) === base || s(x.id).indexOf(base + '_v') === 0; });
    const open = mine.find(function(x){ return x.status === 'pending'; });
    if (open) {   /* asked already: the same paper again is the same request (its amount / lines brought up to date) */
      existing = open;
      const same = (isNaN(amount) ? open.amount == null : open.amount === money(amount)) && s(open.title) === title;
      if (same) return null;
      const up = Object.assign({}, open, { title: title, amount: isNaN(amount) ? null : money(amount), lines: cleanLines(body.lines), docRef: docRef || open.docRef || '', url: url || open.url || '', updatedAt: now });
      existing = up;
      return { list: l.map(function(x){ return s(x.id) === s(open.id) ? up : x; }), check: function(l2){ return l2.some(function(x){ return s(x.id) === up.id && x.updatedAt === now; }); } };
    }
    if (mine.some(function(x){ return x.status === 'signed' && (isNaN(amount) || x.amount === money(amount)); }) && body.again !== true) { existing = mine.find(function(x){ return x.status === 'signed'; }); return null; }
    const id = mine.length ? base + '_v' + (mine.length + 1) : base;
    made = { id: id, pid: pid, kind: kind, refId: refId, title: title, amount: isNaN(amount) ? null : money(amount), lines: cleanLines(body.lines), docRef: docRef, url: url, docName: clip(body.docName, 120),
      note: clip(body.note, 500), auto: body.auto === true, status: 'pending', createdBy: s(who.name) || who.email, createdByEmail: who.email, createdAt: now, updatedAt: now };
    return { list: l.concat([made]), check: function(l2){ return l2.some(function(x){ return s(x.id) === id; }); } };
  });
  if (!res.ok) return { status: 503, out: { ok: false, error: 'Could not save it just now — try again.' } };
  const r = made || existing;
  if (!r) return { status: 200, out: { ok: true, nothing: true } };
  if (!made) return { status: 200, out: { ok: true, id: r.id, already: true, status: r.status } };
  /* the e-mail asking the customer to sign → ✅ Approvals (owner rule) */
  let pm = pmFull(data, p); const to = custEmail(p), label = KINDS[kind];
  /* patch ESTIN: a GrayCo-template proposal goes to the job's (or its lead's) PM; no PM → the estimator who owns it; else the admins */
  if (body.estin === true && !pm) { const ld = arr(data.leads).find(function(x){ return s(x.id) && s(x.id) === s(p.leadId || p.fromLeadId); }) || {}; pm = pmFull(data, { pm: ld.pm }) || pmFull(data, { pm: p.estimator || ld.estimator || body.owner }); }
  if (!okEmail(to)) {
    await core().officeTodo('portal_sign_' + r.id, '✍️ Ask ' + (s(p.client) || 'the customer') + ' to sign: ' + label.toLowerCase() + ' — ' + T(p.name),
      'No customer e-mail on file. “' + title + '” waits for their signature in their GrayCo Portal (Home → ✍️ Papers to sign). Call or text them the portal link.');
    return { status: 200, out: { ok: true, id: r.id, queued: false, noEmail: true } };
  }
  const amt = r.amount != null ? '<p style="font-size:15px"><b>' + (kind === 'change_order' ? 'Change to your contract: ' : 'Amount: ') + esc(usd(r.amount)) + '</b></p>' : '';
  const html = '<p>Hi ' + esc(firstName(p.client) || 'there') + ',</p><p>' + esc(pm ? pm.name : 'Your Project Manager') + ' sent you ' + (kind === 'change_order' ? 'a change order' : kind === 'doc' ? 'a paper' : 'your ' + label.toLowerCase()) + ' for <b>' + esc(T(p.name)) + '</b>: <b>' + esc(T(title)) + '</b>.</p>' + amt +
    '<p>Please look it over and sign it in your GrayCo Portal — it takes a minute, on your phone or computer.</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + core().LINK_PH + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">Review and sign</a></p>' +
    '<p style="font-size:13px;color:#55626F">Questions? Call ' + esc(pm ? pm.name : 'us') + (pm && pm.phone ? ' at ' + esc(pm.phone) : '') + ' or the office at ' + OFFICE_PHONE + '. You get a copy of what you sign.</p>';
  const q = await core().queueApproval({ id: apprId(r), kind: body.estin === true ? 'proposal_send' : (kind === 'estimate' || kind === 'contract' ? 'sign_contract' : 'sign_' + kind), priority: s(body.priority), pid: pid, jobName: T(p.name), pm: pm ? { name: pm.name, email: pm.email } : null, to: to,
    title: body.estin === true && s(body.apprTitle) ? T(clip(body.apprTitle, 120)) : '✍️ ' + label + ' to sign — ' + T(title),
    subject: 'Please review and sign: ' + T(title), html: html, attachments: [{ name: label + ' (in the customer portal)', kind: 'portal' }],
    meta: { signRequestId: r.id, kind: kind, amount: r.amount, refId: refId, fromPm: true, by: who.email } });
  return { status: q ? 200 : 502, out: { ok: !!q, id: r.id, queued: !!q } };
}
async function listFor(pid){
  const l = await readReqs(); if (!l) return { status: 503, out: { ok: false, error: 'Could not read the list just now.' } };
  const aq = await approvals();
  return { status: 200, out: { ok: true, items: l.filter(function(x){ return s(x.pid) === pid; }).map(function(x){ const a = apprOf(aq, x); return Object.assign({}, x, { email: a ? { status: a.status, step: a.step, sentAt: a.sentAt || '' } : null, inPortal: visible(x, aq) }); }) } };
}
async function voidReq(id, who){
  if (!ID_RE.test(id)) return { status: 400, out: { ok: false, error: 'Bad request' } };
  const now = new Date().toISOString(); let hit = null;
  const res = await core().kvListUpdate(KEY, function(l){
    const x = l.find(function(y){ return s(y.id) === id; }); if (!x) return { list: null, result: 'missing' };
    if (x.status !== 'pending') return { list: null, result: x.status };
    hit = x;
    return { list: l.map(function(y){ return s(y.id) === id ? Object.assign({}, y, { status: 'void', voidBy: s(who.name) || who.email, voidAt: now, updatedAt: now }) : y; }), check: function(l2){ return l2.some(function(y){ return s(y.id) === id && y.status === 'void'; }); }, result: 'ok' };
  });
  if (!res.ok) return { status: 503, out: { ok: false, error: 'Could not save it just now.' } };
  if (res.result !== 'ok') return { status: res.result === 'missing' ? 404 : 409, out: { ok: false, error: res.result === 'missing' ? 'Not found.' : 'It is already ' + res.result + '.' } };
  /* its e-mail, if still waiting, is taken off the approvals list too */
  try { await core().kvListUpdate(core().AQ_KEY, function(l){ const a = l.find(function(x){ return s(x.id) === 'appr_sign_' + id && (x.status === 'waiting' || x.status === 'sending'); }); if (!a) return null; return { list: l.map(function(x){ return x === a ? Object.assign({}, x, { status: 'rejected', rejectedBy: s(who.name) || who.email, rejectedAt: now, reason: 'Signature request taken back', updatedAt: now }) : x; }), check: function(l2){ return l2.some(function(x){ return s(x.id) === a.id && x.status === 'rejected'; }); } }; }); } catch (e) {}
  return { status: 200, out: { ok: true, id: hit.id } };
}

/* ── PUBLIC: the customer's view ── */
/* LEGAL2-patch: the job's state (TN default, MS / AR from the address) so the portal shows the right Notice of Cancellation */
function legalState(p){ const a = s(p && (p.state || p.address)); let m; if ((m = /\b(MS|AR|TN)\b\.?,?\s*\d{5}/.exec(a)) || (m = /,\s*(MS|AR|TN)\b/.exec(a))) return m[1]; if (/mississippi/i.test(a)) return 'MS'; if (/arkansas/i.test(a)) return 'AR'; return 'TN'; }
async function view(pid){
  const data = await jobData(false), p = core().findProject(data, pid);
  if (!p) return null;
  const T = scrubber(p), l = (await readReqs()) || [], aq = await approvals();
  const mine = l.filter(function(x){ return s(x.pid) === pid && visible(x, aq); });
  const refs = []; mine.forEach(function(x){ if (refPath(x.docRef)) refs.push(x.docRef); if (x.signed && refPath(x.signed.docRef)) refs.push(x.signed.docRef); });
  const signed = await signRefs(refs);
  const pm = pmFull(data, p) || { name: '', phone: '', email: '' };
  const items = mine.sort(function(a, b){ return s(a.createdAt) < s(b.createdAt) ? 1 : -1; }).map(function(x){
    return { id: s(x.id), kind: x.kind, label: KINDS[x.kind] || 'Document', title: T(x.title), amount: x.amount != null ? money(x.amount) : null,
      lines: arr(x.lines).map(function(y){ return { l: T(y.l), r: T(y.r) }; }), doc: signed[x.docRef] || (x.url && !refPath(x.docRef) ? x.url : ''),
      status: x.status, at: s(x.createdAt), signed: x.status === 'signed' && x.signed ? { name: clip(x.signed.name, 80), at: s(x.signed.at), url: signed[x.signed.docRef] || '' } : null,
      declined: x.status === 'declined' && x.declined ? { at: s(x.declined.at) } : null,
      sms: (x.kind === 'contract' || x.kind === 'estimate') && x.status === 'pending' ? { phone: require('./_lib/sms.js').tidy(p.clientPhone || p.phone || p.customerPhone || '') } : null };   /* patch SMSCONSENT */
  });
  return { ok: true, job: { name: T(p.name), state: legalState(p), group: /commercial|tenant|government|bid/i.test(s(p.type || p.jobType)) ? 'commercial' : 'residential', address: s(p.address) }, items: items,   /* LEGAL2-patch */ pm: { name: clip(pm.name, 60), phone: clip(pm.phone, 40) }, office: OFFICE_PHONE };
}

/* ── the signed copy ── */
function signedCopyPdf(o){
  const b = [{ t: 'title', text: 'GrayCo Construction Services' }, { t: 'p', text: o.label + ' — signed', bold: true, size: 12 }, { t: 'gap', h: 4 },
    { t: 'p', text: 'Job: ' + o.job }, o.address ? { t: 'p', text: 'Address: ' + o.address } : null, o.po ? { t: 'p', text: 'PO: ' + o.po } : null, { t: 'p', text: 'Customer: ' + o.customer }, { t: 'gap', h: 6 },
    { t: 'h', text: o.title }];
  o.lines.forEach(function(x){ b.push({ t: 'row', left: x.l, right: x.r }); });
  if (o.amount != null) b.push({ t: 'row', left: o.kind === 'change_order' ? 'Change to the contract price' : 'Amount', right: usd(o.amount) });
  if (o.docName) b.push({ t: 'p', text: 'Document: ' + o.docName + ' (in the GrayCo Portal with this record)', size: 9, muted: true });
  b.push({ t: 'gap', h: 10 });
  b.push({ t: 'p', text: o.kind === 'change_order'
    ? 'I approve this change order. The work and the change to the contract price shown above are added to my contract with GrayCo Construction Services.'
    : o.kind === 'doc' ? 'I reviewed this document and I sign it.'
    : 'I accept this ' + o.label.toLowerCase() + ' for the work and the price shown above, and I authorize GrayCo Construction Services to schedule and do the work. I understand a change to the scope or the price needs a signed change order.' });
  b.push({ t: 'p', text: 'Warranty: 5 years on roofing and insurance work, 1 year on all other work, from substantial completion, as stated on the warranty certificate.', size: 9, muted: true });
  if (o.esign) b.push({ t: 'p', text: 'Electronic records: the signer agreed to do business electronically (E-SIGN / UETA disclosure, version ' + (o.esign.version || '') + ') before signing.', size: 9, muted: true });   /* LEGAL2-patch */
  if (o.cancel) b.push({ t: 'p', text: 'Notice of Cancellation: the signer confirmed receiving the Notice of Cancellation (' + o.cancel.state + ') and the explanation of the right to cancel. Form rev. 10/26/2026.', size: 9, muted: true });
  if (o.sms || o.smsM) {   /* patch SMSCONSENT + SMSC2: two separate boxes, each shown ticked or not */
    const SCx = require('./_lib/smsconsent.js'), so = o.sms || o.smsM;
    b.push({ t: 'gap', h: 6 }, { t: 'h', text: 'Text messages' }, { t: 'p', text: 'Mobile number for texts: ' + (so.phone ? require('./_lib/sms.js').tidy(so.phone) : '(none given)') });
    if (o.sms) b.push({ t: 'p', text: (o.sms.status === 'yes' ? '[X]  ' : '[  ]  ') + 'Job texts: ' + SCx.CONSENT_TEXT, size: 9 },
      { t: 'p', text: o.sms.status === 'yes' ? 'The customer ticked this box themselves.' : 'The customer did not tick this box — GrayCo will not send them job text messages.', size: 9, muted: true });
    if (o.smsM) b.push({ t: 'p', text: (o.smsM.status === 'yes' ? '[X]  ' : '[  ]  ') + 'Offers (optional, separate): ' + SCx.MARKETING_TEXT, size: 9 },
      { t: 'p', text: o.smsM.status === 'yes' ? 'The customer ticked this box themselves.' : 'The customer did not tick this box — GrayCo will not send them promotional text messages.', size: 9, muted: true });
  }
  b.push({ t: 'gap', h: 6 }, { t: 'h', text: 'Signature' }, { t: 'sig', strokes: o.strokes, name: o.name });
  b.push({ t: 'p', text: 'Signed by: ' + o.name + (o.strokes && o.strokes.length ? ' (typed name and drawn signature)' : ' (typed name — accepted electronically)') });
  b.push({ t: 'p', text: 'Date and time: ' + central(o.at) }, { t: 'p', text: 'Signed in the GrayCo customer portal from address ' + o.ip + ' · reference ' + o.ref, size: 9, muted: true });
  b.push({ t: 'gap', h: 10 }, { t: 'p', text: 'GrayCo customer portal · portal.grayco-cs.com', size: 9, muted: true } /* patch LOGO2: the company block is in the header */);
  return sel().buildPdf(b.filter(Boolean));
}
async function resend(o){
  const key = s(process.env.RESEND_API_KEY);
  if (!key || mailOff() || !okEmail(o.to)) return { ok: false, skipped: true };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ from: o.from || 'GrayCo Construction Services Portal <portal@grayco-cs.com>', reply_to: o.replyTo || (s(process.env.REPLY_TO_ADMIN) || 'replies@grayco-cs.com'), to: [o.to],
        subject: require('./_lib/mailtag.js').tag(o.subject, [o.to], o.area || 'portal signed'), html: o.html }, o.attachments ? { attachments: o.attachments } : {})) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false }; }
}
function shell(title, body){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E"><div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center;font-size:18px;font-weight:bold">' + esc(title) + '</div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px;font-size:15px;line-height:1.5">' + body + '</div></div>';
}

/* ── PUBLIC: sign / decline ── */
async function sign(event, pid, body){
  const id = s(body.id); if (!ID_RE.test(id)) return { status: 400, out: { ok: false, error: 'Bad request' } };
  const name = sel().cleanName(body.name);
  if (!name) return { status: 400, out: { ok: false, error: 'Please type your full name (letters only) to sign.' } };
  if (body.agree !== true) return { status: 400, out: { ok: false, error: 'Please tick the box to agree.' } };
  /* LEGAL2-patch: E-SIGN / UETA — nothing is signed until the customer agreed to do business electronically */
  if (!body.esignConsent || body.esignConsent.agree !== true) return { status: 400, out: { ok: false, error: 'Please tick the box to agree to do business electronically, then sign.' } };
  const esignC = { agree: true, at: new Date().toISOString(), version: clip(body.esignConsent.version, 20), consentAt: clip(body.esignConsent.at, 40) };
  const cancelC = body.cancelNotice && body.cancelNotice.ack === true ? { ack: true, state: clip(body.cancelNotice.state, 2) } : null;
  const cs = sel().cleanStrokes(body.strokes); if (!cs.ok) return { status: 400, out: { ok: false, error: 'The drawn signature could not be read — clear it and sign again.' } };
  const data = await jobData(true), p = core().findProject(data, pid);
  if (!p) return { status: 404, out: { ok: false, error: NOT_ACTIVE } };
  const l = await readReqs(); if (!l) return { status: 503, out: { ok: false, error: 'We could not save it just now. Please try again in a minute.' } };
  const aq = await approvals();
  const r = l.find(function(x){ return s(x.id) === id && s(x.pid) === pid && visible(x, aq); });
  if (!r) return { status: 404, out: { ok: false, error: 'That paper is not on your job.' } };
  if (r.status !== 'pending') return { status: 409, out: { ok: false, error: r.status === 'signed' ? 'You already signed this one.' : 'This paper does not need your signature any more.' } };
  /* patch SMSCONSENT: the text-message box on a contract / estimate — its own tick, never part of the agreement */
  const SC = require('./_lib/smsconsent.js'); let smsC = null;
  if ((r.kind === 'contract' || r.kind === 'estimate') && body.smsConsent && typeof body.smsConsent === 'object') {
    const ph = SC.phone10(body.smsConsent.phone), yes = body.smsConsent.agree === true;
    if (yes && ph.length !== 10) return { status: 400, out: { ok: false, error: 'Please enter the 10-digit mobile number for texts, or leave the text-message box unticked.' } };
    smsC = { status: yes ? 'yes' : 'no', at: new Date().toISOString(), via: 'contract', phone: ph.length === 10 ? ph : '' };
  }
  /* patch SMSC2: the separate, optional OFFERS box (promotional texts) — its own tick, its own record (smsMarketing) */
  let smsM = null;
  if ((r.kind === 'contract' || r.kind === 'estimate') && body.smsMarketing && typeof body.smsMarketing === 'object') {
    const ph = SC.phone10(body.smsMarketing.phone), yes = body.smsMarketing.agree === true;
    if (yes && ph.length !== 10) return { status: 400, out: { ok: false, error: 'Please enter the 10-digit mobile number for texts, or leave the offers box unticked.' } };
    smsM = { status: yes ? 'yes' : 'no', at: new Date().toISOString(), via: 'contract', phone: ph.length === 10 ? ph : '' };
  }
  const T = scrubber(p), ip = ipOf(event), at = new Date().toISOString(), sigId = 'ps_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const label = KINDS[r.kind] || 'Document', customer = s(p.client || p.clientName || p.customer) || name;
  const pdf = signedCopyPdf({ kind: r.kind, label: label, job: T(p.name), address: s(p.address), po: s(p.autoPO || p.po), customer: customer, title: T(r.title), lines: arr(r.lines).map(function(y){ return { l: T(y.l), r: T(y.r) }; }),
    amount: r.amount, docName: T(r.docName), name: name, strokes: cs.strokes, at: at, ip: ip, ref: sigId, sms: smsC, smsM: smsM, esign: esignC, cancel: cancelC });
  const docRef = await uploadPdf(pdf);
  const docName = 'Signed ' + label.toLowerCase() + ' — ' + clip(T(r.title), 60).replace(/[\\/:*?"<>|]+/g, '-') + ' — ' + at.slice(0, 10) + '.pdf';
  const signedRec = { name: name, at: at, ip: clip(ip, 60), ua: clip(gcHeader(event, 'user-agent'), 160), drawn: cs.strokes.length > 0, docRef: docRef, docName: docName, sigId: sigId };
  signedRec.esign = esignC; if (cancelC) signedRec.cancelNotice = cancelC;   /* LEGAL2-patch */
  if (smsC) signedRec.smsConsent = smsC;   /* patch SMSCONSENT */
  if (smsM) signedRec.smsMarketing = smsM;   /* patch SMSC2 */
  const res = await core().kvListUpdate(KEY, function(cur){
    const x = cur.find(function(y){ return s(y.id) === id; });
    if (!x || x.status !== 'pending') return { list: null, result: 'conflict' };
    return { list: cur.map(function(y){ return s(y.id) === id ? Object.assign({}, y, { status: 'signed', signed: signedRec, updatedAt: at }) : y; }), check: function(l2){ return l2.some(function(y){ return s(y.id) === id && y.status === 'signed' && y.signed && y.signed.sigId === sigId; }); }, result: 'ok' };
  });
  if (!res.ok) return { status: 503, out: { ok: false, error: 'We could not save it just now. Please try again in a minute, or call GrayCo ' + OFFICE_PHONE + '.' } };
  if (res.result === 'conflict') return { status: 409, out: { ok: false, error: 'This was already done — reload the page.' } };
  /* patch SMSCONSENT: the answer is enforced at once (the SMS state); the CRM also writes it onto the job and the customer when it applies this signature */
  if (smsC) { try { await SC.record(smsC, [p.clientPhone, p.phone, p.customerPhone]); } catch (e) {} }
  if (smsM) { try { await SC.record(smsM, [p.clientPhone, p.phone, p.customerPhone], 'marketing'); } catch (e) {} }   /* patch SMSC2 */
  /* tell the people: the office (a to-do), the PM (an e-mail), the customer (their copy, at once — owner rule) */
  const pm = pmFull(data, p), jobName = T(p.name) || 'the job';
  try { await core().officeTodo('portal_signed_' + sigId, '✍️ ' + name + ' signed the ' + label.toLowerCase() + ' — ' + jobName,
    '“' + T(r.title) + '”' + (r.amount != null ? ' (' + usd(r.amount) + ')' : '') + ' — signed in the customer portal ' + central(at) + (pm ? '. PM: ' + pm.name : '') + '. The signed copy is in the job\'s documents.' + (r.kind === 'estimate' || r.kind === 'contract' ? ' The job moves to Signed: the schedule and the deposit invoice are drafted for approval.' : '')); } catch (e) {}
  let pmMail = { ok: false }, custMail = { ok: false };
  if (pm && okEmail(pm.email)) pmMail = await resend({ to: pm.email, from: 'GrayCo CRM <office@grayco-cs.com>', subject: 'Signed: ' + label + ' — ' + jobTag(p, T), area: 'area:Portal',
    html: shell(jobName, '<p>' + esc(name) + ' signed the ' + esc(label.toLowerCase()) + ' <b>' + esc(T(r.title)) + '</b>' + (r.amount != null ? ' (' + esc(usd(r.amount)) + ')' : '') + ' in the customer portal (' + esc(central(at)) + ').</p><p>The signed copy is in the job\'s documents in the CRM.</p>') });
  const to = custEmail(p);
  if (okEmail(to)) custMail = await resend({ to: to, replyTo: pm && /@grayco-cs\.com$/i.test(pm.email) ? pm.email : '', subject: 'Your signed ' + label.toLowerCase() + ' — ' + jobTag(p, T),
    html: shell(jobName, '<p>Hi ' + esc(firstName(customer)) + ',</p><p>Thank you! You signed <b>' + esc(T(r.title)) + '</b> in your GrayCo Portal. Your copy is attached and is always in your portal.</p><p>Questions? Call ' + esc(pm ? pm.name : 'us') + (pm && pm.phone ? ' at ' + esc(pm.phone) : '') + ' or the office at ' + OFFICE_PHONE + '.</p>'),
    attachments: [{ filename: docName.replace(/[^\w .()-]+/g, '-'), content: pdf.toString('base64') }] });
  return { status: 200, out: { ok: true, ref: sigId, copy: !!docRef, emailed: !!custMail.ok, pmTold: !!pmMail.ok } };
}
async function decline(event, pid, body){
  const id = s(body.id); if (!ID_RE.test(id)) return { status: 400, out: { ok: false, error: 'Bad request' } };
  const reason = clip(String(body.reason || '').replace(/[\u0000-\u001f\u007f<>]/g, ' '), 500);
  const data = await jobData(true), p = core().findProject(data, pid);
  if (!p) return { status: 404, out: { ok: false, error: NOT_ACTIVE } };
  const aq = await approvals(), l = await readReqs();
  if (!l) return { status: 503, out: { ok: false, error: 'We could not save it just now. Please try again in a minute.' } };
  const r = l.find(function(x){ return s(x.id) === id && s(x.pid) === pid && visible(x, aq); });
  if (!r) return { status: 404, out: { ok: false, error: 'That paper is not on your job.' } };
  const at = new Date().toISOString();
  const res = await core().kvListUpdate(KEY, function(cur){
    const x = cur.find(function(y){ return s(y.id) === id; });
    if (!x || x.status !== 'pending') return { list: null, result: 'conflict' };
    return { list: cur.map(function(y){ return s(y.id) === id ? Object.assign({}, y, { status: 'declined', declined: { at: at, reason: reason, ip: clip(ipOf(event), 60) }, updatedAt: at }) : y; }), check: function(l2){ return l2.some(function(y){ return s(y.id) === id && y.status === 'declined'; }); }, result: 'ok' };
  });
  if (!res.ok) return { status: 503, out: { ok: false, error: 'We could not save it just now. Please try again in a minute.' } };
  if (res.result === 'conflict') return { status: 409, out: { ok: false, error: 'This was already done — reload the page.' } };
  const T = scrubber(p), pm = pmFull(data, p), label = KINDS[r.kind] || 'Document';
  try { await core().officeTodo('portal_declined_' + id, '↩️ ' + (s(p.client) || 'The customer') + ' did not sign the ' + label.toLowerCase() + ' — ' + T(p.name), '“' + T(r.title) + '”' + (reason ? ' — their note: “' + reason + '”' : '') + '. Call them' + (pm ? ' (PM: ' + pm.name + ')' : '') + '.'); } catch (e) {}
  if (pm && okEmail(pm.email)) await resend({ to: pm.email, from: 'GrayCo CRM <office@grayco-cs.com>', subject: 'Not signed: ' + label + ' — ' + jobTag(p, T), area: 'area:Portal',
    html: shell(T(p.name), '<p>' + esc(s(p.client) || 'The customer') + ' chose not to sign <b>' + esc(T(r.title)) + '</b> in the portal.</p>' + (reason ? '<p>Their note: “' + esc(reason) + '”</p>' : '') + '<p>Give them a call.</p>') });
  return { status: 200, out: { ok: true } };
}

/* ── PUBLIC: refer a friend (owner: "contact your PM about our referral program") ── */
function cleanText(v, n){ return clip(String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' '), n); }
async function refer(event, pid, body){
  const name = sel().cleanName(body.name);
  if (!name) return { status: 400, out: { ok: false, error: 'Please add your friend\'s name.', field: 'name' } };
  const email = low(body.email), phone = s(body.phone).replace(/[^\d+()\-. ]/g, '').slice(0, 30), digits = phone.replace(/\D/g, '');
  if (email && !okEmail(email)) return { status: 400, out: { ok: false, error: 'That e-mail address does not look right.', field: 'email' } };
  if (!okEmail(email) && digits.length < 10) return { status: 400, out: { ok: false, error: 'Please add a phone number or an e-mail so your Project Manager can reach them.', field: 'phone' } };
  const data = await jobData(true), p = core().findProject(data, pid);
  if (!p) return { status: 404, out: { ok: false, error: NOT_ACTIVE } };
  const pm = pmFull(data, p), referrer = s(p.client || p.clientName || p.customer) || 'a GrayCo customer';
  let r;
  try {
    r = await require('./website-intake.js').fromReferral({ name: name, email: email, phone: phone, address: cleanText(body.address, 200), note: cleanText(body.note, 1000),
      referrer: referrer, referrerPid: pid, referrerJob: s(p.name), referrerEmail: custEmail(p), pm: pm });
  } catch (e) { return { status: 503, out: { ok: false, error: 'We could not send it just now. Please call ' + (pm && pm.phone ? pm.name + ' at ' + pm.phone : 'GrayCo at ' + OFFICE_PHONE) + '.' } }; }
  try { await require('./_lib/referral.js').fromPortalReferral(p, { name: name, email: email, phone: phone, address: cleanText(body.address, 200), note: cleanText(body.note, 1000) }, r && r.id); } catch (e) {}   /* patch REF: the referrer earns credit when the friend pays */
  /* the PM: a new lead for them, and a thank-you to the customer who referred them */
  const leadLine = name + (phone ? ' · ' + phone : '') + (email ? ' · ' + email : '') + (s(body.address) ? ' · ' + cleanText(body.address, 200) : '');
  const to = pm && okEmail(pm.email) ? pm.email : '';
  if (to) await resend({ to: to, from: 'GrayCo CRM <office@grayco-cs.com>', subject: '🎁 Referral from ' + referrer + ': ' + name, area: 'area:Leads',
    html: shell('New referral', '<p><b>' + esc(referrer) + '</b> (' + esc(s(p.name)) + ') referred a friend in their GrayCo Portal:</p><p><b>' + esc(leadLine) + '</b></p>' + (s(body.note) ? '<p>Their note: “' + esc(cleanText(body.note, 1000)) + '”</p>' : '') +
      '<p>It is on Leads → 📥 Lead Inbox, assigned to you. Please reach out to them, and thank ' + esc(firstName(referrer)) + ' for the referral (our referral program).</p>') });
  try { await core().officeTodo('portal_referral_' + (r && r.id || Date.now()), '🎁 Thank ' + referrer + ' for referring ' + name + (pm ? ' — PM ' + pm.name : ''),
    referrer + ' referred ' + leadLine + ' from their GrayCo Portal. ' + (pm ? pm.name + ' follows up with the new lead and with ' + firstName(referrer) + ' (referral program).' : 'Assign the lead to a PM.')); } catch (e) {}
  return { status: 200, out: { ok: true, pmTold: !!to } };
}

/* ── SCHEDULED: estimate follow-ups (day 2, 5, 10; only the first one needs approval — like AP3) ── */
const PIPE = /^(bidding|quoted|submitted|proposal|estimate sent|estimating|estimate|lead|pending|negotiat\w*|sent)$/i;
const SIGNED_ST = /^(active|approved|in.?progress|scheduled|contract|signed|sold|won|complete|completed|closed|done|on_hold)$/i;
const DEAD = /lost|dead|cancel|declin|no.?bid|not.?bidding/i;
function fuHtml(p, T, pm, n, r){
  const what = r ? (r.kind === 'contract' ? 'contract' : 'estimate') : 'estimate';
  return '<p>Hi ' + esc(firstName(p.client) || 'there') + ',</p><p>' + (n === 1 ? 'Just checking in on the ' + what + ' we sent for <b>' + esc(T(p.name)) + '</b>. Do you have any questions, or anything you would like us to change?'
    : 'Following up on your ' + what + ' for <b>' + esc(T(p.name)) + '</b>. We would love to get you on the schedule.') + '</p>' +
    '<p>You can look it over' + (r ? ' and sign it' : '') + ' in your GrayCo Portal:</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + core().LINK_PH + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">Open my ' + what + '</a></p>' +
    '<p style="font-size:13px;color:#55626F">Questions? Call ' + esc(pm ? pm.name : 'us') + (pm && pm.phone ? ' at ' + esc(pm.phone) : '') + ' or the office at ' + OFFICE_PHONE + '.</p>';
}
function signedJob(p){ return SIGNED_ST.test(s(p.status)) || low(p.contractStatus) === 'signed' || !!s(p.contractSignedAt); }
async function sendFromPm(item, p, pm){
  const key = s(process.env.RESEND_API_KEY); if (!key || mailOff()) return { ok: false, error: 'mail off' };
  let html = s(item.html);
  if (html.indexOf(core().LINK_PH) >= 0) {
    let token; try { token = await core().createFor(s(p.id), 'auto: estimate follow-up'); } catch (e) { return { ok: false, error: 'no link' }; }
    html = html.split(core().LINK_PH).join(esc(core().linkFor(null, token)));
  }
  try { html = await require('./_lib/brand.js').shellFor(html, { email: pm && pm.email, name: pm && pm.name }); } catch (e) {}
  const fromPm = pm && /@grayco-cs\.com$/i.test(pm.email) && !/^office@/i.test(pm.email);
  const payload = { from: fromPm ? pm.name.replace(/[<>"]/g, '') + ' — GrayCo Construction Services <' + pm.email + '>' : 'GrayCo Construction Services Portal <portal@grayco-cs.com>',
    reply_to: fromPm ? pm.email : (s(process.env.REPLY_TO_ADMIN) || 'replies@grayco-cs.com'), to: [item.to], subject: core().withJob(item.subject, p), html: html };
  if (Array.isArray(item.cc) && item.cc.length) payload.cc = item.cc.slice(0, 5);
  try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); return { ok: r.ok, error: r.ok ? '' : String(r.status) }; }
  catch (e) { return { ok: false, error: 'no answer' }; }
}
async function runFollowups(opts){
  opts = opts || {};
  if (process.env.EST_FOLLOWUPS_OFF === '1') return { ok: true, off: true };
  const now = opts.now ? new Date(opts.now) : new Date(), nowIso = now.toISOString();
  const data = await jobData(true), reqs = (await readReqs()) || [], aq = await approvals();
  const st = await core().kvListRead(FU_KEY); if (!st) return { ok: false, error: 'unreadable' };
  const rep = { queued: 0, sent: 0, stopped: 0, waiting: 0, details: [] };
  /* what was sent and not signed: a signature request whose e-mail went out, or a job with proposalSentAt */
  const cands = [];
  reqs.forEach(function(r){
    if (!/^(estimate|contract)$/.test(s(r.kind))) return;
    const a = apprOf(aq, r);
    const sentAt = a && a.status === 'sent' ? s(a.sentAt || a.updatedAt) : (!needsApproval() ? s(r.createdAt) : '');
    cands.push({ key: 'r_' + r.id, pid: s(r.pid), r: r, sentAt: sentAt });
  });
  arr(data.projects).forEach(function(p){
    const sent = s(p.proposalSentAt); if (!sent || !PIPE.test(s(p.status))) return;
    if (cands.some(function(c){ return c.pid === s(p.id); })) return;
    cands.push({ key: 'p_' + s(p.id) + '_' + sent.slice(0, 10), pid: s(p.id), r: null, sentAt: sent });
  });
  for (const c of cands) {
    const p = core().findProject(data, c.pid);
    const prev = st.list.find(function(x){ return s(x.id) === c.key; }) || null;
    if (prev && prev.stopped) continue;
    const why = !p ? 'deleted' : DEAD.test(s(p.status)) ? 'lost' : signedJob(p) ? 'signed'
      : c.r && c.r.status !== 'pending' ? c.r.status : '';
    if (why) { if (prev || c.sentAt) { await core().kvListUpdate(FU_KEY, function(l){ const x = l.find(function(y){ return s(y.id) === c.key; }); if (x && x.stopped) return null; const rec = Object.assign({}, x || { id: c.key, pid: c.pid, sent: [] }, { stopped: why, stoppedAt: nowIso }); return { list: x ? l.map(function(y){ return y === x ? rec : y; }) : l.concat([rec]), check: function(l2){ return l2.some(function(y){ return s(y.id) === c.key && y.stopped; }); } }; }); rep.stopped++; } continue; }
    if (!c.sentAt) continue;
    if (p.portalRemindersPaused === true || p.estFollowupsPaused === true) continue;
    const days = (now - new Date(c.sentAt)) / DAY;
    const done = prev ? arr(prev.sent).length : 0;
    if (done >= FU_DAYS.length) continue;
    const firstId = 'appr_estfu_' + c.key + '_1';
    const first = aq.find(function(x){ return s(x.id) === firstId; });
    if (done === 0) {
      if (first) {
        if (first.status === 'sent') {   /* approved and sent by the approvals list: that was nudge 1 */
          await core().kvListUpdate(FU_KEY, function(l){ const x = l.find(function(y){ return s(y.id) === c.key; }); if (x && arr(x.sent).length) return null; const rec = Object.assign({}, x || { id: c.key, pid: c.pid }, { sent: [{ n: 1, at: s(first.sentAt) || nowIso, how: 'approved' }], firstId: firstId }); return { list: x ? l.map(function(y){ return y === x ? rec : y; }) : l.concat([rec]), check: function(l2){ return l2.some(function(y){ return s(y.id) === c.key && arr(y.sent).length; }); } }; });
          rep.details.push({ key: c.key, n: 1, how: 'approved' });
        } else if (first.status === 'rejected') {
          await core().kvListUpdate(FU_KEY, function(l){ const x = l.find(function(y){ return s(y.id) === c.key; }); if (x && x.stopped) return null; const rec = Object.assign({}, x || { id: c.key, pid: c.pid, sent: [] }, { stopped: 'first nudge rejected', stoppedAt: nowIso }); return { list: x ? l.map(function(y){ return y === x ? rec : y; }) : l.concat([rec]), check: function(l2){ return l2.some(function(y){ return s(y.id) === c.key && y.stopped; }); } }; });
          rep.stopped++;
        } else rep.waiting++;
        continue;
      }
      if (days < FU_DAYS[0]) continue;
      const to = custEmail(p); if (!okEmail(to)) continue;
      const T = scrubber(p), pm = pmFull(data, p);
      const ok = await core().queueApproval({ id: firstId, kind: 'estimate_followup', pid: c.pid, jobName: T(p.name), pm: pm ? { name: pm.name, email: pm.email } : null, to: to,
        title: '📨 Estimate follow-up (day ' + FU_DAYS[0] + ') — ' + T(p.name),
        subject: 'Following up on your ' + (c.r && c.r.kind === 'contract' ? 'contract' : 'estimate') + ' from GrayCo', html: fuHtml(p, T, pm, 1, c.r),
        attachments: [{ name: 'Your estimate (in the customer portal)', kind: 'portal' }],
        meta: { followupKey: c.key, n: 1, signRequestId: c.r ? c.r.id : '', fromPm: true, note: 'Only this first nudge needs approval. Day ' + FU_DAYS[1] + ' and day ' + FU_DAYS[2] + ' go out by themselves with the text you approve here, unless the customer signs or declines.' } });
      if (ok) { rep.queued++; rep.details.push({ key: c.key, n: 1, how: 'approval' }); }
      continue;
    }
    /* nudge 2 and 3: the approved text, by themselves (business hours, Central) */
    if (days < FU_DAYS[done]) continue;
    const h = wallHour(now); if (h < 8 || h >= 18) continue;
    if (!first || first.status !== 'sent') continue;
    const n = done + 1;
    let claimed = false;
    await core().kvListUpdate(FU_KEY, function(l){ const x = l.find(function(y){ return s(y.id) === c.key; }); if (!x || arr(x.sent).length !== done || x.stopped) return null; claimed = true; const rec = Object.assign({}, x, { sent: arr(x.sent).concat([{ n: n, at: nowIso, how: 'sending' }]) }); return { list: l.map(function(y){ return y === x ? rec : y; }), check: function(l2){ return l2.some(function(y){ return s(y.id) === c.key && arr(y.sent).length === n; }); } }; });
    if (!claimed) continue;
    const pm = pmFull(data, p);
    const sent = await sendFromPm(first, p, pm);
    await core().kvListUpdate(FU_KEY, function(l){ const x = l.find(function(y){ return s(y.id) === c.key; }); if (!x) return null;
      const list = arr(x.sent).filter(function(y){ return !(y.n === n && y.how === 'sending'); }); if (sent.ok) list.push({ n: n, at: nowIso, how: 'auto (approved text)' });
      const rec = Object.assign({}, x, { sent: list, lastError: sent.ok ? '' : s(sent.error) }); return { list: l.map(function(y){ return y === x ? rec : y; }), check: function(){ return true; } }; });
    if (sent.ok) { rep.sent++; rep.details.push({ key: c.key, n: n, how: 'auto' }); }
  }
  return Object.assign({ ok: true }, rep);
}

function reply(statusCode, headers, obj){ return { statusCode: statusCode, headers: headers, body: JSON.stringify(obj) }; }
async function notActive(headers, t0){ const wait = MIN_FAIL_MS + Math.floor(Math.random() * 60) - (Date.now() - t0); if (wait > 0) await sleep(wait); return reply(404, headers, { ok: false, error: NOT_ACTIVE }); }

exports.handler = async function(event){
  event = event || {};
  const t0 = Date.now();
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS', 'x-portal-token, x-portal-session'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  if (String(event.body || '').length > 200000) return reply(413, headers, { ok: false, error: 'Too big' });
  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  if (typeof body !== 'object' || Array.isArray(body)) return reply(400, headers, { ok: false, error: 'Bad request' });
  const action = s(body.action || 'view');

  if (action === 'request' || action === 'list' || action === 'void' || action === 'followups') {
    const who = await gcStaffAuth(event);
    if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
    if (!svcKey()) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
    try {
      if (action === 'request') { const r = await request(body, who); return reply(r.status, headers, r.out); }
      if (action === 'list') { const pid = s(body.projectId); if (!ID_RE.test(pid)) return reply(400, headers, { ok: false, error: 'Open a job first.' }); const r = await listFor(pid); return reply(r.status, headers, r.out); }
      if (action === 'void') { const r = await voidReq(s(body.id), who); return reply(r.status, headers, r.out); }
      if (who.role !== 'admin') return reply(403, headers, { ok: false, error: 'Admins only.' });
      return reply(200, headers, await runFollowups({}));
    } catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong: ' + clip(e && e.message || e, 120) }); }
  }

  if (['view', 'sign', 'decline', 'refer'].indexOf(action) < 0) return reply(400, headers, { ok: false, error: 'Bad request' });
  const ip = ipOf(event);
  if (limited(ip)) { await sleep(MIN_FAIL_MS); return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' }); }
  const token = s(gcHeader(event, 'x-portal-token')), sess = s(gcHeader(event, 'x-portal-session'));
  if ((!TOKEN_RE.test(token) && !sess) || !svcKey()) { noteBad(ip); return notActive(headers, t0); }
  let row = null;
  try { row = TOKEN_RE.test(token) ? await tokenRow(token) : await sessionLinkRow(sess, s(body.projectId)); } catch (e) {}
  if (!row || row.revoked === true) { noteBad(ip); return notActive(headers, t0); }
  const pid = s(row.project_id);
  try {
    if (action === 'view') { const v = await view(pid); return v ? reply(200, headers, v) : notActive(headers, t0); }
    if (body.preview === true) return reply(403, headers, { ok: false, error: 'Preview — only the customer can sign or send a referral.' });
    if (tooManyWrites(row.token)) return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' });
    const r = action === 'sign' ? await sign(event, pid, body) : action === 'decline' ? await decline(event, pid, body) : await refer(event, pid, body);
    return reply(r.status, headers, r.out);
  } catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong — please call GrayCo ' + OFFICE_PHONE + '.' }); }
};
exports._ps = { runFollowups: runFollowups, visible: visible, signedCopyPdf: signedCopyPdf, KEY: KEY, FU_KEY: FU_KEY, FU_DAYS: FU_DAYS, KINDS: KINDS, _reset: function(){ hits.clear(); writes.clear(); } };

/* LEGAL2-patch */
