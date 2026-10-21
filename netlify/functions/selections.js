// netlify/functions/selections.js
// GrayCo — CUSTOMER SELECTIONS in the customer portal (patch SEL).
//
// Owner 10/21: "I want everyone in the company able to add products to that database, prices too, and always keep
// the most updated price. I do want customers picking inside the portal if possible, but the PM can pick too, and
// always require customer signature for PM-selected materials. If the customer picks in the portal, that is their choice."
//
// The CRM keeps the job's selections in gc_kv "selectionChoices" (and a copy on the job, project.portalChoices).
// What the CUSTOMER does is kept apart, in gc_kv "selectionResponses" (JSON text) — written ONLY here, read by the CRM.
//
// PUBLIC (the customer's portal link code in x-portal-token, exactly like portal.js):
//   POST {action:'view'}                                   → this ONE job's selections: options with photo, name, price;
//                                                            what is chosen / waiting for a signature / signed; signed copies
//   POST {action:'pick', picks:[{choiceId, optionId}], name, agree:true}
//                                                          → the customer's own choice (= their choice and their signature)
//   POST {action:'sign', choiceIds:[…], name, strokes?, agree:true}
//                                                          → the customer signs what the PM picked for them
//   Each one records the typed name, the time and the address (IP); a signed copy (PDF) goes to the private file
//   storage, the customer gets it by e-mail at once (a signed copy is never held for approval), the PM gets a note
//   and the office a to-do. Every input is checked here. A code that is unknown or turned off gets the same answer
//   as portal.js. A job only ever sees its own selections.
//
// STAFF (signed in to the CRM + on gc_staff):
//   POST {action:'request-sign', projectId}  → the e-mail asking the customer to sign waits on ✅ Approvals
//                                               (gc_approval_queue, kind selection_sign — the job's PM approves it)
//
// Env: the portal's (SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, PORTAL_MAIL_OFF, PORTAL_BASE_URL).

/* ── GrayCo staff check (the same inline copy every function carries) ───────── */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
function gcCors(event, methods, extraHeaders){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
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
try { require('./_lib/brand.js').installResend(); } catch (e) {}   /* patch AUT2: every customer e-mail gets the GrayCo shell */
const OFFICE_PHONE = '901-585-0944';
const NOT_ACTIVE = 'This link is not active — call GrayCo ' + OFFICE_PHONE;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const RESP_KEY = 'selectionResponses', CH_KEY = 'selectionChoices', LIB_KEY = 'selectionLibrary';
const SIGN_SECS = 3600, MIN_FAIL_MS = 250;
const COMMON_CARRIERS = /\b(state\s*farm|allstate|usaa|liberty\s*mutual|nationwide|travelers|progressive|american\s*family|erie\s*insurance|chubb|the\s*hartford|auto[\s-]*owners|safeco|geico|homesite|metlife|amica|tennessee\s*farmers|farmers\s*insurance|farm\s*bureau|shelter\s*insurance|cincinnati\s*insurance|universal\s*property|citizens\s*property|kemper|hippo\s*insurance|foremost|assurant|american\s*strategic|asi\s*insurance|stillwater)\b/gi;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function num(v){ const n = Number(v); return isFinite(n) ? n : 0; }
function money(n){ return Math.round(num(n) * 100) / 100; }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function isJwt(k){ return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(k || '')); }
function keyHeaders(k){ return isJwt(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }; }
function H(extra){ return Object.assign(keyHeaders(svcKey()), { 'Content-Type': 'application/json' }, extra || {}); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function usd(n){ return '$' + money(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function firstName(v){ return s(v).split(/\s+/)[0] || ''; }
function mailOff(){ return process.env.PORTAL_MAIL_OFF === '1' || process.env.PORTAL_MAIL_OFF === 'true'; }
function okEmail(v){ return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(v)); }
function portalCore(){ return require('./portal.js')._core; }   /* the approvals list, the office to-dos, the shared-list writer */

/* ── the CRM's records in gc_kv (a big list may be in pieces: <key>__manifest + <key>__chunkN, newer wins) ── */
async function kvRead(keys){
  const want = []; keys.forEach(function(k){ want.push(k, k + '__manifest'); });
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value,updated_at&key=in.(' + want.map(function(k){ return '"' + k + '"'; }).join(',') + ')', { headers: H() });
  if (!r.ok) throw new Error('gc_kv read ' + r.status);
  const rows = await r.json(), byKey = {};
  (Array.isArray(rows) ? rows : []).forEach(function(x){ if (x && x.key) byKey[x.key] = x; });
  const out = {};
  for (const k of keys) {
    let val = byKey[k] ? byKey[k].value : null;
    const man = byKey[k + '__manifest'];
    let mv = man && man.value; if (typeof mv === 'string') { try { mv = JSON.parse(mv); } catch (e) { mv = null; } }
    if (mv && mv.chunked && mv.count > 0 && (!byKey[k] || s(man.updated_at) >= s(byKey[k].updated_at))) {
      try {
        const names = []; for (let i = 0; i < Math.min(mv.count, 60); i++) names.push('"' + k + '__chunk' + i + '"');
        const rr = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value&key=in.(' + names.join(',') + ')', { headers: H() });
        if (rr.ok) { const parts = await rr.json(), by = {}; (Array.isArray(parts) ? parts : []).forEach(function(x){ by[x.key] = x.value; });
          let all = []; for (let i = 0; i < mv.count; i++) all = all.concat(arr(by[k + '__chunk' + i])); if (all.length) val = all; }
      } catch (e) {}
    }
    out[k] = (typeof val === 'string') ? (function(){ try { return JSON.parse(val); } catch (e) { return val; } })() : val;
  }
  return out;
}
function findProject(data, pid){
  const del = Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects.map(String) : [];
  if (del.indexOf(String(pid)) >= 0) return null;
  return arr(data.projects).find(function(p){ return s(p.id) === String(pid); }) || null;
}
/* the job's selections: the shared list ∪ the copy on the job, by id — the newer save wins, a removal sticks */
function mergeById(a, b){
  const by = {};
  a.concat(b).forEach(function(r){
    if (!r || !r.id) return; const o = by[r.id];
    if (!o) { by[r.id] = r; return; }
    const newer = s(r.updatedAt) > s(o.updatedAt) ? r : o, older = newer === r ? o : r;
    const m = Object.assign({}, older, newer); if (r.removed || o.removed) m.removed = true; by[r.id] = m;
  });
  return Object.keys(by).map(function(k){ return by[k]; });
}
function choicesOf(data, p){
  const pid = s(p.id);
  const shared = arr(data[CH_KEY]).filter(function(c){ return s(c.pid) === pid; });
  const onJob = arr(p.portalChoices).map(function(c){ return Object.assign({ pid: pid }, c); });
  return mergeById(shared, onJob).filter(function(c){ return c.id && !c.removed && c.portal !== false; })
    .sort(function(a, b){ return s(a.at) < s(b.at) ? -1 : 1; });
}

/* ── the one rule (the CRM has the same one, patch SEL): what state a selection is in ──────────────
   PM picked it        → "needs-sign" until a signature for exactly that pick (pick.at) is on file → "signed"
   customer picked it  → "chosen" (their choice is their signature)
   nobody yet          → "open" (the customer picks in the portal)
   The PM changing a pick (a new pick.at) or reopening it needs a new signature / a new choice. */
function offerOf(c){ return s(c.offerAt || c.at); }
function stateOf(c, resps){
  const mine = resps.filter(function(r){ return s(r.choiceId) === s(c.id); }).sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; });
  const pk = c.pick && !c.pick.reopened && (s(c.pick.label) || s(c.pick.optionId)) ? c.pick : null;
  const reopenAt = c.pick && c.pick.reopened ? s(c.pick.at) : '';
  if (pk && pk.how !== 'customer') {
    const sg = mine.find(function(r){ return r.kind === 'sign' && s(r.pickAt) === s(pk.at); });
    return sg ? { status: 'signed', pick: pk, resp: sg } : { status: 'needs-sign', pick: pk };
  }
  if (pk) return { status: 'chosen', pick: pk, resp: mine.find(function(r){ return r.kind === 'pick' && s(r.at) === s(pk.at); }) || null };
  const cp = mine.find(function(r){ return r.kind === 'pick' && s(r.offerAt) === offerOf(c) && s(r.at) > reopenAt; });
  if (cp) return { status: 'chosen', pick: { optionId: cp.optionId, label: cp.label, price: cp.price, unit: cp.unit, photo: cp.photo, how: 'customer', by: cp.name, at: cp.at }, resp: cp };
  return { status: 'open' };
}
function titleOf(c){ return [s(c.cat), [s(c.brand), s(c.line)].filter(Boolean).join(' ')].filter(Boolean).join(' — '); }
function optLabel(c, o){ return s(o.label) || s(o.color) || [s(c.brand), s(c.line)].filter(Boolean).join(' ') || 'Option'; }
function optionsOf(c, lib){
  const out = (Array.isArray(c.options) ? c.options : []).filter(function(o){ return o && s(o.id); });
  if (c.anyInLine && lib) {
    const n = function(v){ return low(v).replace(/\s+/g, ' '); };
    lib.filter(function(r){ return !r.removed && s(r.color) && n(r.cat) === n(c.cat) && n(r.brand) === n(c.brand) && n(r.line) === n(c.line); }).forEach(function(r){
      if (out.some(function(o){ return n(o.color || o.label) === n(r.color); })) return;
      out.push({ id: 'lib_' + s(r.id).slice(0, 60), productId: r.id, color: r.color, price: r.price, unit: r.unit, photo: r.photo });
    });
  }
  return out;
}

/* ── the words the customer never sees (insurance carriers) ── */
function carrierWords(p){
  const out = [COMMON_CARRIERS];
  ['insCarrier', 'carrier', 'insurer', 'insuranceCompany', 'insuranceCarrier', 'insCompany', 'insuranceCo', 'carrierName', 'adjusterCompany', 'adjustingCompany', 'tpa'].forEach(function(k){ const v = s(p[k]); if (v.length >= 3) out.push(v); });
  return out;
}
function scrubText(t, words){
  let x = s(t);
  words.forEach(function(w){ const re = w instanceof RegExp ? new RegExp(w.source, 'gi') : new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); x = x.replace(re, 'your insurance company'); });
  return x;
}

/* ── files: the private bucket (short-lived signed links; uploads named by their SHA-256) ── */
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

/* ── the link table (gc_portal), the rate limit — as portal.js ── */
async function tokenRow(token){
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal?select=token,project_id,revoked&token=eq.' + encodeURIComponent(token), { headers: H() });
  if (!r.ok) return null;
  const rows = await r.json(), row = Array.isArray(rows) && rows[0];
  if (!row || typeof row.token !== 'string') return null;
  const a = Buffer.from(row.token), b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return row;
}
/* patch SUB: a customer signed in at portal.grayco-cs.com (e-mail + password) has a session instead of the link
   code — the same check as portal.js sessionRow(): a live customer session (gc_portal_session, sha-256 of the
   code) whose links include an active link for this job. Turning the link off ends it here too. */
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
const LIMIT = { req: 60, bad: 8, windowMs: 10 * 60e3, writes: 25 };
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

/* ── input checks (everything the page sends is checked here) ── */
const ID_RE = /^[A-Za-z0-9_.:-]{1,90}$/;
function cleanName(v){
  if (typeof v !== 'string') return '';
  const t = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 80) return '';
  if (/[<>{}\[\]\\\/@=;|`$^~*_#%]|[\u0000-\u001f\u007f]/.test(t)) return '';
  if (!/\p{L}.*\p{L}/u.test(t)) return '';
  return t;
}
/* a drawn signature: strokes of points on a 600 × 200 pad. Kept as numbers only (never an image). */
function cleanStrokes(v){
  if (v == null) return { ok: true, strokes: [] };
  if (!Array.isArray(v) || v.length > 40) return { ok: false };
  let total = 0; const out = [];
  for (const st of v) {
    if (!Array.isArray(st) || st.length > 600) return { ok: false };
    const line = [];
    for (const pt of st) {
      if (!Array.isArray(pt) || pt.length !== 2) return { ok: false };
      const x = Number(pt[0]), y = Number(pt[1]);
      if (!isFinite(x) || !isFinite(y) || x < 0 || x > 600 || y < 0 || y > 200) return { ok: false };
      line.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    }
    total += line.length; if (total > 4000) return { ok: false };
    if (line.length) out.push(line);
  }
  return { ok: true, strokes: out };
}

/* ── the signed copy: a small PDF written here (Helvetica, no outside library) ── */
function latin(t){
  return s(t).replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"').replace(/[–—−]/g, '-').replace(/…/g, '...')
    .replace(/[✓✔]/g, 'x').replace(/ /g, ' ').replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
}
function pdfStr(t){ return '(' + latin(t).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')'; }
function wrap(t, max){
  const words = latin(t).split(' '), out = []; let cur = '';
  words.forEach(function(w){ while (w.length > max) { if (cur) { out.push(cur); cur = ''; } out.push(w.slice(0, max)); w = w.slice(max); } if ((cur + ' ' + w).trim().length > max) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
  if (cur) out.push(cur); return out.length ? out : [''];
}
function buildPdf(blocks){
  const W = 612, Hh = 792, M = 54, pages = []; let ops = [], y = Hh - M;
  function page(){ if (ops.length) pages.push(ops.join('\n')); ops = []; y = Hh - M; }
  function need(h){ if (y - h < M) page(); }
  function text(t, size, bold, x, color){ ops.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + (color || '0.08 0.13 0.18') + ' rg ' + (x || M) + ' ' + y.toFixed(1) + ' Td ' + pdfStr(t) + ' Tj ET'); }
  blocks.forEach(function(b){
    if (b.t === 'title') { need(30); y -= 18; text(b.text, 18, true); y -= 8; ops.push('0.83 0.63 0.09 RG 2 w ' + M + ' ' + y.toFixed(1) + ' m ' + (W - M) + ' ' + y.toFixed(1) + ' l S'); y -= 12; return; }
    if (b.t === 'h') { need(26); y -= 14; text(b.text, 12, true); y -= 6; return; }
    if (b.t === 'gap') { y -= b.h || 8; return; }
    if (b.t === 'row') {
      const l = wrap(b.left, 52), r = wrap(b.right, 38), n = Math.max(l.length, r.length); need(n * 13 + 6);
      for (let i = 0; i < n; i++) { y -= 13; if (l[i]) { ops.push('BT /F2 10 Tf 0.08 0.13 0.18 rg ' + M + ' ' + y.toFixed(1) + ' Td ' + pdfStr(l[i]) + ' Tj ET'); } if (r[i]) ops.push('BT /F1 10 Tf 0.08 0.13 0.18 rg ' + (M + 300) + ' ' + y.toFixed(1) + ' Td ' + pdfStr(r[i]) + ' Tj ET'); }
      y -= 5; ops.push('0.89 0.86 0.80 RG 0.5 w ' + M + ' ' + y.toFixed(1) + ' m ' + (W - M) + ' ' + y.toFixed(1) + ' l S'); return;
    }
    if (b.t === 'p') { const l = wrap(b.text, b.size === 9 ? 105 : 95); need(l.length * 13); l.forEach(function(x){ y -= 13; text(x, b.size || 10, !!b.bold, M, b.muted ? '0.33 0.38 0.44' : null); }); return; }
    if (b.t === 'sig') {
      need(96); y -= 86; const x0 = M, y0 = y, sc = 0.4;   /* the 600 × 200 pad, drawn at 240 × 80 */
      ops.push('0.75 0.75 0.75 RG 0.5 w ' + x0 + ' ' + y0.toFixed(1) + ' m ' + (x0 + 240) + ' ' + y0.toFixed(1) + ' l S');
      if (b.strokes && b.strokes.length) {
        const seg = ['0.06 0.11 0.18 RG 1.2 w 1 J 1 j'];
        b.strokes.forEach(function(st){ st.forEach(function(pt, i){ seg.push((x0 + pt[0] * sc).toFixed(1) + ' ' + (y0 + 80 - pt[1] * sc).toFixed(1) + (i ? ' l' : ' m')); }); if (st.length === 1) seg.push((x0 + st[0][0] * sc + 0.8).toFixed(1) + ' ' + (y0 + 80 - st[0][1] * sc).toFixed(1) + ' l'); seg.push('S'); });
        ops.push(seg.join('\n'));
      } else { ops.push('BT /F3 22 Tf 0.06 0.11 0.18 rg ' + (x0 + 6) + ' ' + (y0 + 12).toFixed(1) + ' Td ' + pdfStr(b.name) + ' Tj ET'); }
      y -= 4; return;
    }
  });
  page();
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = []; let n = 6;
  const pageObjs = pages.map(function(c){ const pg = n++, ct = n++; kids.push(pg + ' 0 R'); return { pg: pg, ct: ct, c: c }; });
  objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>';
  pageObjs.forEach(function(x){
    objs[x.pg] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + Hh + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ' + x.ct + ' 0 R >>';
    objs[x.ct] = '<< /Length ' + Buffer.byteLength(x.c, 'latin1') + ' >>\nstream\n' + x.c + '\nendstream';
  });
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const offs = [];
  for (let i = 1; i < objs.length; i++) { offs[i] = Buffer.byteLength(out, 'latin1'); out += i + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
  for (let i = 1; i < objs.length; i++) out += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
function central(iso){ try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' (Central)'; } catch (e) { return iso; } }
function signedCopy(o){
  const b = [{ t: 'title', text: 'GrayCo Construction Services' }, { t: 'p', text: 'Your selections — ' + (o.kind === 'sign' ? 'signed' : 'your choice'), bold: true, size: 12 }, { t: 'gap', h: 4 },
    { t: 'p', text: 'Job: ' + o.job }, o.address ? { t: 'p', text: 'Address: ' + o.address } : null, { t: 'p', text: 'Customer: ' + o.customer }, { t: 'gap', h: 6 }, { t: 'h', text: 'Selections' }];
  o.items.forEach(function(x){ b.push({ t: 'row', left: x.title, right: x.label + (x.price ? ' — ' + usd(x.price) + (x.unit ? ' / ' + x.unit : '') : '') + (num(x.priceDiff) ? ' (' + (x.priceDiff > 0 ? '+' : '-') + usd(Math.abs(x.priceDiff)) + ' on the contract)' : '') }); });
  b.push({ t: 'gap', h: 10 });
  b.push({ t: 'p', text: o.kind === 'sign'
    ? 'I reviewed the selections my GrayCo Project Manager made for me, listed above, and I approve them. I understand a change to a selection after I sign needs my signature again.'
    : 'I made these choices myself in my GrayCo Portal. They are my selections for this job. A change after today needs my approval again.' });
  b.push({ t: 'p', text: 'Colors on screens and samples can vary. Prices shown are per unit as listed on the day of signing; any price difference is added to (+) or taken off (-) the contract.', size: 9, muted: true });
  b.push({ t: 'gap', h: 6 }, { t: 'h', text: 'Signature' }, { t: 'sig', strokes: o.strokes, name: o.name });
  b.push({ t: 'p', text: 'Signed by: ' + o.name + (o.strokes && o.strokes.length ? ' (typed name and drawn signature)' : ' (typed name — accepted electronically)') });
  b.push({ t: 'p', text: 'Date and time: ' + central(o.at) }, { t: 'p', text: 'Signed in the GrayCo customer portal from address ' + o.ip + ' · reference ' + o.ref, size: 9, muted: true });
  b.push({ t: 'gap', h: 10 }, { t: 'p', text: 'GrayCo Construction Services · ' + OFFICE_PHONE + ' · portal.grayco-cs.com', size: 9, muted: true });
  return buildPdf(b.filter(Boolean));
}

/* ── e-mail (Resend). The customer's signed copy goes out by itself (owner rule: signed copies are not held). ── */
async function resend(o){
  const key = s(process.env.RESEND_API_KEY);
  if (!key || mailOff() || !okEmail(o.to)) return { ok: false, skipped: true };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ from: o.from || 'GrayCo Construction Services Portal <portal@grayco-cs.com>', reply_to: (String(process.env.REPLY_TO_ADMIN || '').trim() || 'replies@grayco-cs.com'), to: [o.to], subject: require('./_lib/mailtag.js').tag(o.subject, [o.to], 'portal selection'), html: o.html }, o.attachments ? { attachments: o.attachments } : {}, o.replyTo ? { reply_to: o.replyTo } : {})) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false }; }
}
function mailShell(title, body){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E"><div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center;font-size:18px;font-weight:bold">' + esc(title) + '</div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px;font-size:15px;line-height:1.5">' + body + '</div></div>';
}

/* ── the customer's view of THEIR job's selections (a strict whitelist) ── */
const JA = require('./_lib/job-auto.js');   /* patch JA */
function jaPick(J){ return JA.allows(J.p, 'portalSelections', JA.parseAdmin(J.data && J.data[JA.KV_KEY])); }
async function loadJob(pid){
  const data = await kvRead(['projects', 'gc_deleted_projects', 'users', CH_KEY, RESP_KEY, JA.KV_KEY]);
  const p = findProject(data, pid);
  return p ? { data: data, p: p, choices: choicesOf(data, p), resps: arr(data[RESP_KEY]).filter(function(r){ return s(r.pid) === s(pid); }) } : null;
}
async function libraryIfNeeded(choices){ if (!choices.some(function(c){ return c.anyInLine; })) return null; try { return arr((await kvRead([LIB_KEY]))[LIB_KEY]); } catch (e) { return null; } }
async function view(J){
  const words = carrierWords(J.p), lib = await libraryIfNeeded(J.choices);
  const refs = [];
  const items = J.choices.map(function(c){
    const st = stateOf(c, J.resps), opts = optionsOf(c, lib);
    opts.forEach(function(o){ if (refPath(o.photo)) refs.push(o.photo); });
    if (st.pick && refPath(st.pick.photo)) refs.push(st.pick.photo);
    return { c: c, st: st, opts: opts };
  }).filter(function(x){ return x.opts.length || x.st.pick; });
  J.resps.forEach(function(r){ if (refPath(r.docRef)) refs.push(r.docRef); });
  const signed = await signRefs(refs);
  const T = function(v){ return scrubText(v, words); };
  const canPick = jaPick(J);   /* patch JA: "customer can pick selections in the portal" (off: the PM picks, the customer signs) */
  const out = { ok: true, pickOff: !canPick, job: { name: T(J.p.name) }, items: items.map(function(x){
    const c = x.c, st = x.st, pk = st.pick;
    const it = { id: s(c.id), title: T(titleOf(c)), note: T(clip(c.note, 300)), dueBy: s(c.dueBy).slice(0, 10), status: st.status,
      options: st.status === 'open' && canPick ? x.opts.slice(0, 80).map(function(o){ return { id: s(o.id), label: T(optLabel(c, o)), price: o.price != null && o.price !== '' ? money(o.price) : null, unit: clip(o.unit, 12), priceDiff: num(o.priceDiff) ? money(o.priceDiff) : 0, photo: signed[o.photo] || '' }; }) : [] };
    if (pk) it.pick = { label: T(clip(pk.label || '', 160)), price: pk.price != null && pk.price !== '' ? money(pk.price) : null, unit: clip(pk.unit, 12), priceDiff: num(pk.priceDiff) ? money(pk.priceDiff) : 0, photo: signed[pk.photo] || '', by: pk.how === 'customer' ? 'you' : 'your Project Manager', at: s(pk.at) };
    if (st.resp) it.done = { name: clip(st.resp.name, 80), at: s(st.resp.at) };
    return it;
  }), docs: [] };
  const seen = {};
  J.resps.slice().sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; }).forEach(function(r){ const u = signed[r.docRef]; if (u && !seen[r.docRef]) { seen[r.docRef] = 1; out.docs.push({ title: clip(r.docName || 'Signed selections', 90), at: s(r.at), url: u }); } });
  return out;
}

/* ── the customer picks / signs ── */
async function record(event, row, body, J, kind){
  if (kind === 'pick' && !jaPick(J)) return { status: 403, out: { ok: false, pickOff: true, error: 'Your Project Manager picks the selections with you for this job — call ' + OFFICE_PHONE + '.' } };   /* patch JA */
  const ip = ipOf(event), at = new Date().toISOString(), sigId = 'sg_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const name = cleanName(body.name);
  if (!name) return { status: 400, out: { ok: false, error: 'Please type your full name (letters only) to sign.' } };
  if (body.agree !== true) return { status: 400, out: { ok: false, error: 'Please tick the box to agree.' } };
  const lib = await libraryIfNeeded(J.choices);
  const byId = {}; J.choices.forEach(function(c){ byId[s(c.id)] = c; });
  const want = [];
  let strokes = [];
  if (kind === 'pick') {
    if (!Array.isArray(body.picks) || !body.picks.length || body.picks.length > 30) return { status: 400, out: { ok: false, error: 'Pick at least one selection.' } };
    const seen = {};
    for (const x of body.picks) {
      const cid = s(x && x.choiceId), oid = s(x && x.optionId);
      if (!ID_RE.test(cid) || !ID_RE.test(oid) || seen[cid]) return { status: 400, out: { ok: false, error: 'Bad request' } };
      seen[cid] = 1;
      const c = byId[cid]; if (!c) return { status: 404, out: { ok: false, error: 'That selection is not on your job.' } };
      if (stateOf(c, J.resps).status !== 'open') return { status: 409, out: { ok: false, error: 'This selection was already made — call your Project Manager to change it.' } };
      const o = optionsOf(c, lib).find(function(y){ return s(y.id) === oid; });
      if (!o) return { status: 400, out: { ok: false, error: 'That option is not one you can pick.' } };
      want.push({ c: c, o: o });
    }
  } else {
    const ids = Array.isArray(body.choiceIds) ? body.choiceIds : null;
    if (!ids || !ids.length || ids.length > 30) return { status: 400, out: { ok: false, error: 'Nothing to sign.' } };
    const cs = cleanStrokes(body.strokes); if (!cs.ok) return { status: 400, out: { ok: false, error: 'The drawn signature could not be read — clear it and sign again.' } };
    strokes = cs.strokes;
    const seen = {};
    for (const raw of ids) {
      const cid = s(raw); if (!ID_RE.test(cid) || seen[cid]) return { status: 400, out: { ok: false, error: 'Bad request' } }; seen[cid] = 1;
      const c = byId[cid]; if (!c) return { status: 404, out: { ok: false, error: 'That selection is not on your job.' } };
      const st = stateOf(c, J.resps); if (st.status !== 'needs-sign') return { status: 409, out: { ok: false, error: st.status === 'signed' ? 'You already signed this one.' : 'This selection does not need your signature.' } };
      want.push({ c: c, pk: st.pick });
    }
  }
  const words = carrierWords(J.p);
  const items = want.map(function(w){
    const c = w.c, src = kind === 'pick' ? w.o : w.pk;
    return { title: scrubText(titleOf(c), words), label: scrubText(kind === 'pick' ? optLabel(c, w.o) : s(w.pk.label), words), price: src.price != null && src.price !== '' ? money(src.price) : null, unit: clip(src.unit, 12), priceDiff: num(src.priceDiff) };
  });
  const customer = s(J.p.client || J.p.clientName || J.p.customer);
  const pdf = signedCopy({ kind: kind, job: scrubText(J.p.name, words), address: s(J.p.address), customer: customer || name, items: items, name: name, strokes: strokes, at: at, ip: ip, ref: sigId });
  const docRef = await uploadPdf(pdf);
  const docName = (kind === 'sign' ? 'Signed selections' : 'Customer selections') + ' — ' + at.slice(0, 10) + '.pdf';
  const recs = want.map(function(w, i){
    const base = { id: sigId + '_' + i, sigId: sigId, pid: s(J.p.id), choiceId: s(w.c.id), kind: kind, name: name, at: at, ip: clip(ip, 60), ua: clip(gcHeader(event, 'user-agent'), 160), docRef: docRef, docName: docName, label: items[i].label, price: items[i].price, unit: items[i].unit, title: items[i].title };
    if (kind === 'pick') return Object.assign(base, { optionId: s(w.o.id), offerAt: offerOf(w.c), photo: refPath(w.o.photo) ? w.o.photo : '', priceDiff: num(w.o.priceDiff) });
    return Object.assign(base, { pickAt: s(w.pk.at), drawn: strokes.length > 0, strokes: strokes.length ? strokes : undefined });
  });
  const core = portalCore();
  const has = function(l){ return recs.every(function(r){ return l.some(function(x){ return s(x.id) === r.id; }); }); };
  const res = await core.kvListUpdate(RESP_KEY, function(l){
    const mineNow = l.filter(function(r){ return s(r.pid) === s(J.p.id); });
    const stillOk = want.every(function(w){ const st = stateOf(w.c, mineNow).status; return kind === 'pick' ? st === 'open' : st === 'needs-sign'; });
    if (!stillOk) return { list: null, result: 'conflict' };
    return { list: l.concat(recs), check: has, result: 'ok' };
  });
  if (!res.ok) return { status: 503, out: { ok: false, error: 'We could not save it just now. Please try again in a minute, or call GrayCo ' + OFFICE_PHONE + '.' } };
  if (res.result === 'conflict') return { status: 409, out: { ok: false, error: 'This was already done — reload the page.' } };
  /* tell the people: the PM (an e-mail), the office (a to-do), the customer (their copy, at once) */
  const pmName = s(J.p.pm || J.p.projectManager || J.p.pmName);
  const pmUser = arr(J.data.users).find(function(u){ return pmName && low(u.name) === low(pmName); });
  const pmEmail = low((pmUser && pmUser.email) || J.p.pmEmail);
  const what = items.map(function(x){ return x.title + ': ' + x.label; }).join('; ');
  const jobName = scrubText(J.p.name, words) || 'the job';
  try { await core.officeTodo('portal_sel_' + sigId, (kind === 'sign' ? '✍️ ' + name + ' signed their selections — ' : '🎨 ' + name + ' picked their selections — ') + jobName,
    what + '. Recorded in the customer portal ' + central(at) + (pmName ? '. PM: ' + pmName : '') + '. The signed copy is in the job\'s documents.'); } catch (e) {}
  let pmMail = { ok: false }, custMail = { ok: false };
  if (okEmail(pmEmail)) pmMail = await resend({ to: pmEmail, from: 'GrayCo CRM <office@grayco-cs.com>', subject: (kind === 'sign' ? 'Signed: ' : 'Customer picked: ') + jobName,
    html: mailShell(jobName, '<p>' + esc(name) + (kind === 'sign' ? ' signed the selections you picked for them' : ' picked their selections') + ' in the customer portal (' + esc(central(at)) + '):</p><ul>' + items.map(function(x){ return '<li>' + esc(x.title) + ': <b>' + esc(x.label) + '</b></li>'; }).join('') + '</ul><p>It is on the job in the CRM (Customer portal → 🎨 Customer choices).</p>') });
  const to = s(J.p.clientEmail || J.p.customerEmail || J.p.email);
  const jobTagSel = [s(J.p.autoPO || J.p.po) ? 'PO ' + s(J.p.autoPO || J.p.po) : '', jobName, s(J.p.address || J.p.jobAddress)].filter(Boolean).join(' \u00b7 ');   /* owner 10/21: the job in every subject; replies go to the PM */
  if (okEmail(to)) custMail = await resend({ to: to, replyTo: /@grayco-cs\.com$/i.test(pmEmail || '') ? pmEmail : '', subject: 'Your ' + (kind === 'sign' ? 'signed ' : '') + 'selections — ' + jobTagSel,
    html: mailShell(jobName, '<p>Hi ' + esc(firstName(customer || name) || 'there') + ',</p><p>Thank you! ' + (kind === 'sign' ? 'You signed these selections' : 'You chose these selections') + ' in your GrayCo Portal:</p><ul>' + items.map(function(x){ return '<li>' + esc(x.title) + ': <b>' + esc(x.label) + '</b></li>'; }).join('') + '</ul><p>Your copy is attached and is always in your portal. Questions? Call ' + esc(pmName || 'us') + ' or the office at ' + OFFICE_PHONE + '.</p>'),
    attachments: [{ filename: docName.replace(/[^\w .()-]+/g, '-'), content: pdf.toString('base64') }] });
  return { status: 200, out: { ok: true, ref: sigId, saved: recs.length, copy: !!docRef, emailed: !!custMail.ok, pmTold: !!pmMail.ok } };
}

/* ── STAFF: ask the customer to sign (the e-mail waits on ✅ Approvals for the PM) ── */
async function requestSign(pid, who){
  const J = await loadJob(pid);
  if (!J) return { status: 404, out: { ok: false, retry: true, error: 'The job is not in the cloud yet.' } };
  const need = J.choices.filter(function(c){ return stateOf(c, J.resps).status === 'needs-sign'; });
  if (!need.length) return { status: 200, out: { ok: true, nothing: true } };
  const words = carrierWords(J.p), jobName = scrubText(J.p.name, words) || 'your job';
  const key = crypto.createHash('sha256').update(need.map(function(c){ return c.id + '@' + s(c.pick.at); }).sort().join('|')).digest('hex').slice(0, 16);
  const to = s(J.p.clientEmail || J.p.customerEmail || J.p.email);
  const core = portalCore();
  const pmName = s(J.p.pm || J.p.projectManager || J.p.pmName);
  const pmUser = arr(J.data.users).find(function(u){ return pmName && low(u.name) === low(pmName); });
  const pm = pmName ? { name: pmName, email: low((pmUser && pmUser.email) || J.p.pmEmail) } : null;
  const list = need.map(function(c){ return '<li>' + esc(scrubText(titleOf(c), words)) + ': <b>' + esc(scrubText(c.pick.label, words)) + '</b></li>'; }).join('');
  if (!okEmail(to)) {
    await core.officeTodo('portal_selsign_' + pid + '_' + key, 'Ask ' + (s(J.p.client) || 'the customer') + ' to sign their selections — ' + jobName,
      'No customer e-mail on file. The selections the PM picked wait for the customer\'s signature in their portal (Home → Your selections). Call or text them the portal link.');
    return { status: 200, out: { ok: true, todo: true, noEmail: true } };
  }
  const html = mailShell(jobName, '<p>Hi ' + esc(firstName(J.p.client) || 'there') + ',</p><p>' + esc(pm ? pm.name : 'Your Project Manager') + ' picked these for your job. Please look them over and sign in your GrayCo Portal:</p><ul>' + list + '</ul>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + core.LINK_PH + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">Review and sign</a></p>' +
    '<p style="font-size:13px;color:#55626F">Questions? Call ' + esc(pm ? pm.name : 'us') + ' or the office at ' + OFFICE_PHONE + '.</p>');
  const id = 'appr_sel_' + pid + '_' + key;
  const q = await core.queueApproval({ id: id, kind: 'selection_sign', pid: pid, jobName: jobName, pm: pm, to: to, subject: 'Please review and sign your selections — ' + jobName, html: html,
    attachments: [{ name: 'Your selections (in the customer portal)', kind: 'portal' }], meta: { by: who.email, choices: need.map(function(c){ return s(c.id); }) } });
  return { status: q ? 200 : 502, out: { ok: !!q, queued: !!q, id: id } };
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

  if (action === 'request-sign') {
    const who = await gcStaffAuth(event);
    if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
    if (!svcKey()) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
    const pid = s(body.projectId);
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(pid)) return reply(400, headers, { ok: false, error: 'Open a job first.' });
    try { const r = await requestSign(pid, who); return reply(r.status, headers, r.out); }
    catch (e) { return reply(500, headers, { ok: false, error: 'Could not queue it: ' + clip(e && e.message || e, 120) }); }
  }

  if (['view', 'pick', 'sign'].indexOf(action) < 0) return reply(400, headers, { ok: false, error: 'Bad request' });
  const ip = ipOf(event);
  if (limited(ip)) { await sleep(MIN_FAIL_MS); return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' }); }
  const token = s(gcHeader(event, 'x-portal-token')), sess = s(gcHeader(event, 'x-portal-session'));
  if ((!TOKEN_RE.test(token) && !sess) || !svcKey()) { noteBad(ip); return notActive(headers, t0); }
  let row = null;
  try { row = TOKEN_RE.test(token) ? await tokenRow(token) : await sessionLinkRow(sess, s(body.projectId)); } catch (e) {}
  if (!row || row.revoked === true) { noteBad(ip); return notActive(headers, t0); }
  let J = null;
  try { J = await loadJob(s(row.project_id)); } catch (e) { return reply(503, headers, { ok: false, error: 'We could not load your selections just now. Please try again in a minute, or call GrayCo ' + OFFICE_PHONE + '.' }); }
  if (!J) return notActive(headers, t0);
  if (action === 'view') return reply(200, headers, await view(J));
  if (body.preview === true) return reply(403, headers, { ok: false, error: 'Preview — only the customer can pick or sign.' });
  if (tooManyWrites(row.token)) return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' });
  try { const r = await record(event, row, body, J, action); return reply(r.status, headers, r.out); }
  catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong — please call GrayCo ' + OFFICE_PHONE + '.' }); }
};
exports._sel = { stateOf: stateOf, cleanName: cleanName, cleanStrokes: cleanStrokes, buildPdf: buildPdf, signedCopy: signedCopy, RESP_KEY: RESP_KEY, _reset: function(){ hits.clear(); writes.clear(); } };
/* patch AUTO8: the final walkthrough (walkthrough.js) signs in the portal the same way — the same link / session check,
   rate limit, name and signature-pad rules, signed-copy PDF and e-mail */
Object.assign(exports._sel, { gcStaffAuth: gcStaffAuth, gcCors: gcCors, gcHeader: gcHeader, kvRead: kvRead, findProject: findProject, carrierWords: carrierWords, scrubText: scrubText,
  signRefs: signRefs, uploadPdf: uploadPdf, tokenRow: tokenRow, sessionLinkRow: sessionLinkRow, ipOf: ipOf, limited: limited, noteBad: noteBad, tooManyWrites: tooManyWrites,
  central: central, resend: resend, mailShell: mailShell, svcKey: svcKey, TOKEN_RE: TOKEN_RE, OFFICE_PHONE: OFFICE_PHONE, NOT_ACTIVE: NOT_ACTIVE, MIN_FAIL_MS: MIN_FAIL_MS });
