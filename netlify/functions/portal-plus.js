// netlify/functions/portal-plus.js
// GrayCo — the customer portal's "How did you hear about us?" and MAINTENANCE PLANS (patch X9).
//
// Owner 10/21: "Yes, always do maintenance contracts and try to sell those. Offer in portal for roofs and other
// residential items." and "How did you hear about us?" asked in the customer portal, one tap.
//
// PUBLIC (the customer's portal link code in x-portal-token, or a signed-in session in x-portal-session — exactly
// like selections.js; a code that is unknown or turned off gets the same answer as portal.js):
//   POST {action:'view'}                           → the one-tap question (and their answer), the plans offered for
//                                                     THIS home and this job's plan requests / quotes / signed plan
//   POST {action:'heard', answer, who?}             → their answer (who = the friend who referred them)
//   POST {action:'maint-request', planId, note?}    → "Request a quote": the PM prices it for this home
//   POST {action:'maint-sign', contractId, name, agree:true, strokes?} → signs the quoted plan (typed name + drawn
//                                                     signature, as selections.js): a signed copy (PDF) to private file
//                                                     storage and to the customer at once; the PM and the office are told
//   POST {action:'maint-decline', contractId}       → "No thanks"
// STAFF (signed in to the CRM + on gc_staff):
//   POST {action:'list'}                            → every plan contract, the plans, the portal answers (the CRM's view)
//   POST {action:'quote', pid, planId|contractId, price}   → the PM's yearly price for this home; the "your quote is
//                                                     ready" e-mail waits on ✅ Approvals (kind maint_quote, the PM)
//   POST {action:'update', contractId, nextVisit?, visitDone?, note?, cancel?}
//   POST {action:'plans', set?}                     → the plan list (admins change it)
// The yearly invoice: maint-scheduled.js queues it on ✅ Approvals (kind maint_invoice: the PM, then an admin);
// portal.js aqSend → maintInvoiceSend() here sends it once approved.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');
const M = require('./_lib/maint.js');
try { require('./_lib/brand.js').installResend(); } catch (e) {}   /* patch AUT2: every customer e-mail gets the GrayCo shell */

const OFFICE_PHONE = '901-585-0944';
const NOT_ACTIVE = 'This link is not active — call GrayCo ' + OFFICE_PHONE;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/, ID_RE = /^[A-Za-z0-9_.:-]{1,90}$/, MIN_FAIL_MS = 250;
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const COMMON_CARRIERS = /\b(state\s*farm|allstate|usaa|liberty\s*mutual|nationwide|travelers|progressive|american\s*family|erie\s*insurance|chubb|the\s*hartford|auto[\s-]*owners|safeco|geico|homesite|metlife|amica|tennessee\s*farmers|farmers\s*insurance|farm\s*bureau|shelter\s*insurance|cincinnati\s*insurance|universal\s*property|citizens\s*property|kemper|hippo\s*insurance|foremost|assurant|american\s*strategic|asi\s*insurance|stillwater)\b/gi;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ return Math.round(M.num(n) * 100) / 100; }
function usd(n){ return '$' + money(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function nowIso(){ return new Date().toISOString(); }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function H(extra){ const k = svcKey(); return Object.assign(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }, { 'Content-Type': 'application/json' }, extra || {}); }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-portal-token, x-portal-session', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function reply(code, headers, obj){ return { statusCode: code, headers: headers, body: JSON.stringify(obj) }; }
function core(){ return require('./portal.js')._core; }
function sel(){ return require('./selections.js')._sel; }
function okEmail(e){ return /^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function mailOff(){ return /^(1|true|yes)$/i.test(s(process.env.PORTAL_MAIL_OFF)); }
function central(iso){ try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' (Central)'; } catch (e) { return iso; } }
function niceDay(d){ try { return new Date(s(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return s(d); } }
function firstName(n){ return s(n).split(/\s+/)[0]; }

/* the carrier's name never reaches the customer (owner rule) */
function carrierWords(p){ const out = []; ['insCarrier', 'carrier', 'insurer', 'insuranceCompany', 'insuranceCarrier', 'insCompany', 'insuranceCo', 'carrierName'].forEach(function(k){ const v = s(p && p[k]); if (v.length >= 3) out.push(v); }); return out; }
function scrub(t, words){ t = s(t); (words || []).forEach(function(w){ t = t.split(w).join(''); }); return t.replace(COMMON_CARRIERS, '').replace(/\s*[—\-–]\s*(claim)?\s*$/i, '').replace(/\s{2,}/g, ' ').trim(); }

/* ── the portal link (gc_portal) / a signed-in customer session — as selections.js ── */
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
function ipOf(event){ return s(hdr(event, 'x-nf-client-connection-ip') || hdr(event, 'x-forwarded-for').split(',')[0] || hdr(event, 'client-ip') || 'unknown'); }
function limited(ip){ const now = Date.now(); let h = hits.get(ip); if (!h || now - h.start > 600000) { h = { start: now, req: 0, bad: 0 }; hits.set(ip, h); } h.req++; if (hits.size > 5000) hits.delete(hits.keys().next().value); return h.req > 60 || h.bad >= 8; }
function noteBad(ip){ const h = hits.get(ip); if (h) h.bad++; }
function tooManyWrites(token){ const now = Date.now(); let w = writes.get(token); if (!w || now - w.start > 600000) { w = { start: now, n: 0 }; writes.set(token, w); } w.n++; return w.n > 20; }
async function notActive(headers, t0){ const wait = MIN_FAIL_MS + Math.floor(Math.random() * 60) - (Date.now() - t0); if (wait > 0) await sleep(wait); return reply(404, headers, { ok: false, error: NOT_ACTIVE }); }

/* ── storage: the plans (settings) and the two lists, in gc_kv (JSON text, read again before every write) ── */
async function readAll(){
  const d = await core().kvRead(['projects', 'gc_deleted_projects', 'users', M.PLANS_KEY, M.LIST_KEY, M.HEARD_KEY, 'jobAutoDefaults']);
  return { data: d, settings: M.settingsOf(d[M.PLANS_KEY]), list: arr(d[M.LIST_KEY]), heard: arr(d[M.HEARD_KEY]) };
}
function findProject(d, pid){ return core().findProject(d, pid); }
async function listUpdate(key, mutate){ return core().kvListUpdate(key, mutate); }
async function contractChange(id, fn){
  let out = null;
  const r = await listUpdate(M.LIST_KEY, function(l){
    const i = l.findIndex(function(c){ return s(c.id) === s(id); }); if (i < 0) return { list: null, result: 'missing' };
    const c = JSON.parse(JSON.stringify(l[i])); const why = fn(c); if (why) return { list: null, result: why };
    c.updatedAt = nowIso(); l[i] = c; out = c;
    return { list: l, check: function(a){ return a.some(function(x){ return s(x.id) === c.id && s(x.updatedAt) === c.updatedAt; }); }, result: 'ok' };
  });
  return { ok: r.ok, result: r.result, c: out };
}
async function signUrl(ref){
  const m = /^sb:crm-files\/(.+)$/.exec(s(ref)); if (!m) return '';
  try {
    const r = await fetch(sbUrl() + '/storage/v1/object/sign/crm-files/' + m[1], { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: 3600 }) });
    if (!r.ok) return ''; const j = await r.json(); const u = s(j.signedURL || j.signedUrl);
    return u ? (/^https?:/.test(u) ? u : sbUrl() + '/storage/v1' + (u[0] === '/' ? '' : '/') + u) : '';
  } catch (e) { return ''; }
}
async function storePdf(buf, name){ try { const st = await require('./bid-inbox.js')._lib.storeFile(buf, 'application/pdf', name); return st.ref || ''; } catch (e) { return ''; } }
async function resend(o){
  const key = s(process.env.RESEND_API_KEY);
  if (!key || mailOff() || !okEmail(o.to)) return { ok: false, skipped: true };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ from: o.from || 'GrayCo Construction Services Portal <portal@grayco-cs.com>', reply_to: o.replyTo || (s(process.env.REPLY_TO_ADMIN) || 'replies@grayco-cs.com'), to: [o.to],
        subject: require('./_lib/mailtag.js').tag(o.subject, [o.to], 'portal maintenance'), html: o.html, headers: { 'X-GrayCo-CRM': 'maint' } }, o.attachments ? { attachments: o.attachments } : {})) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false }; }
}
function shell(title, body){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E"><div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center;font-size:18px;font-weight:bold">' + esc(title) + '</div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px;font-size:15px;line-height:1.5">' + body + '</div></div>';
}
function jobTag(p){ const po = s(p.autoPO || p.po), w = carrierWords(p); return [po ? 'PO ' + po : '', scrub(p.name, w), s(p.address || p.jobAddress)].filter(Boolean).join(' · '); }
function pmOf(d, p){ try { return core().pmOf(d, p); } catch (e) { return null; } }
function custEmail(p){ return s(p.clientEmail || p.customerEmail || p.email); }
function custName(p){ return s(p.client || p.clientName || p.customer); }

/* ── the customer's view ── */
async function view(A, p){
  const st = A.settings, mine = M.contractsFor(A.list, p.id).concat(arr(A.list).filter(function(c){ return s(c.pid) === s(p.id) && c.status === 'declined'; }));
  const offered = M.eligible(p, st);
  const plans = offered ? M.plansFor(p, st) : [];
  const docs = {};
  for (const c of mine) if (c.docRef) docs[c.id] = await signUrl(c.docRef);
  const h = A.heard.find(function(x){ return s(x.pid) === s(p.id); });
  return { ok: true, heard: { answer: h ? s(h.answer) : '', who: h ? s(h.who) : '', opts: M.HEARD_OPTS },
    maint: { offered: offered || mine.length > 0, plans: plans.map(function(x){ return { id: x.id, name: x.name, includes: x.includes.replace(/\s*Price:\s*\[PRICE\][^.]*\.?/i, '').trim(), visits: x.visits }; }),
      contracts: mine.map(function(c){ return { id: c.id, planId: s(c.planId), planName: s(c.planName), status: s(c.status), price: c.status === 'requested' ? null : (c.price != null ? money(c.price) : null),
        requestedAt: s(c.requestedAt), quotedAt: s(c.quotedAt), signedAt: s(c.signedAt), signName: s(c.signName), nextVisit: s(c.nextVisit), doc: docs[c.id] || '' }; }) } };
}

/* ── the customer's actions ── */
async function heard(event, row, body, A, p){
  const answer = M.heardNorm(body.answer); if (!answer) return { status: 400, out: { ok: false, error: 'Pick one answer.' } };
  const who = /referral/i.test(answer) ? clip(s(body.who).replace(/[<>{}\[\]\\\/@=;|`$^~*_#%]/g, ''), 80) : '';
  const rec = { id: 'hh_' + s(p.id), pid: s(p.id), answer: answer, who: who, channel: M.heardChannel(answer), at: nowIso(), via: 'portal' };
  const r = await listUpdate(M.HEARD_KEY, function(l){ const k = l.filter(function(x){ return s(x.pid) !== s(p.id); }); return { list: k.concat([rec]), check: function(a){ return a.some(function(x){ return x.id === rec.id && x.at === rec.at; }); } }; });
  return r.ok ? { status: 200, out: { ok: true, answer: answer, who: who } } : { status: 503, out: { ok: false, error: 'We could not save it just now — please try again.' } };
}
async function request(event, row, body, A, p){
  const plan = M.plansFor(p, A.settings).find(function(x){ return x.id === s(body.planId); });
  if (!plan || !M.eligible(p, A.settings)) return { status: 400, out: { ok: false, error: 'That plan is not offered for this job — call ' + OFFICE_PHONE + '.' } };
  const at = nowIso(), id = 'mt_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const note = clip(s(body.note).replace(/[<>]/g, ''), 400);
  const rec = { id: id, pid: s(p.id), planId: plan.id, planName: plan.name, visitsPerYear: plan.visits, status: 'requested', requestedAt: at, requestedBy: 'customer', note: note, history: [{ at: at, by: 'customer (portal)', what: 'Asked for a quote' }], updatedAt: at };
  const r = await listUpdate(M.LIST_KEY, function(l){
    if (l.some(function(c){ return s(c.pid) === s(p.id) && s(c.planId) === plan.id && /^(requested|quoted|signed)$/.test(s(c.status)); })) return { list: null, result: 'dup' };
    return { list: l.concat([rec]), check: function(a){ return a.some(function(x){ return x.id === id; }); }, result: 'ok' };
  });
  if (!r.ok) return { status: 503, out: { ok: false, error: 'We could not save it just now — please try again.' } };
  if (r.result === 'dup') return { status: 200, out: { ok: true, already: true } };
  const pm = pmOf(A.data, p), tag = jobTag(p);
  try { await core().officeTodo('maint_req_' + id, '🛠 Price a maintenance plan — ' + scrub(p.name, carrierWords(p)), (custName(p) || 'The customer') + ' asked for a quote on the ' + plan.name + ' in their portal' + (note ? ' ("' + note + '")' : '') + '. ' + (pm ? pm.name + ' prices it' : 'The PM prices it') + ' on the job (🛠 Maintenance → Quote).'); } catch (e) {}
  if (pm && okEmail(pm.email)) await resend({ to: pm.email, from: 'GrayCo CRM <noreply@grayco-cs.com>', replyTo: s(process.env.REPLY_TO_ADMIN) || 'replies@grayco-cs.com', subject: 'Maintenance plan quote wanted: ' + plan.name + ' — ' + tag,
    html: shell('Maintenance plan request', '<p>' + esc(custName(p) || 'The customer') + ' asked for a quote on the <b>' + esc(plan.name) + '</b> in their GrayCo portal' + (note ? ':</p><p><i>' + esc(note) + '</i></p><p>' : '. ') + 'Open the job in the CRM → <b>🛠 Maintenance</b> → enter your yearly price for this home → <b>Send quote</b>.</p>') });
  return { status: 200, out: { ok: true, id: id } };
}
function planPdf(o){
  const S = sel(), b = [{ t: 'title', text: 'GrayCo Construction Services' }, { t: 'p', text: 'Maintenance plan agreement — ' + o.planName, bold: true, size: 12 }, { t: 'gap', h: 4 },
    { t: 'p', text: 'Job: ' + o.job }, o.address ? { t: 'p', text: 'Address: ' + o.address } : null, { t: 'p', text: 'Customer: ' + o.customer }, { t: 'gap', h: 6 }, { t: 'h', text: 'What is included' },
    { t: 'p', text: o.includes || o.planName }, { t: 'gap', h: 4 },
    { t: 'row', left: 'Price', right: usd(o.price) + ' per year' }, { t: 'row', left: 'Visits', right: o.visits + (o.visits === 1 ? ' visit' : ' visits') + ' per year' }, { t: 'row', left: 'First visit', right: niceDay(o.nextVisit) },
    { t: 'gap', h: 8 },
    { t: 'p', text: 'The plan renews each year on its anniversary. GrayCo sends the yearly invoice before the visit. Either of us can end it with written notice (an e-mail is fine) before the next yearly invoice; no refund is owed for a visit already made. Repairs beyond the small touch-ups listed above are quoted separately and only done with your approval. This plan does not change or replace your GrayCo warranty.' },
    { t: 'gap', h: 6 }, { t: 'h', text: 'Signature' }, { t: 'sig', strokes: o.strokes, name: o.name },
    { t: 'p', text: 'Signed by: ' + o.name + (o.strokes && o.strokes.length ? ' (typed name and drawn signature)' : ' (typed name — accepted electronically)') },
    { t: 'p', text: 'Date and time: ' + central(o.at) }, { t: 'p', text: 'Signed in the GrayCo customer portal from address ' + o.ip + ' · reference ' + o.ref, size: 9, muted: true },
    { t: 'gap', h: 10 }, { t: 'p', text: 'GrayCo customer portal · portal.grayco-cs.com', size: 9, muted: true } /* patch LOGO2: the company block is in the header */];
  return S.buildPdf(b.filter(Boolean));
}
async function sign(event, row, body, A, p){
  const S = sel(), name = S.cleanName(body.name);
  if (!name) return { status: 400, out: { ok: false, error: 'Please type your full name (letters only) to sign.' } };
  if (body.agree !== true) return { status: 400, out: { ok: false, error: 'Please tick the box to agree.' } };
  const cs = S.cleanStrokes(body.strokes); if (!cs.ok) return { status: 400, out: { ok: false, error: 'The drawn signature could not be read — clear it and sign again.' } };
  const c0 = A.list.find(function(c){ return s(c.id) === s(body.contractId) && s(c.pid) === s(p.id); });
  if (!c0) return { status: 404, out: { ok: false, error: 'That plan is not on your job.' } };
  if (c0.status === 'signed') return { status: 409, out: { ok: false, error: 'You already signed this plan.' } };
  if (c0.status !== 'quoted' || !(M.num(c0.price) > 0)) return { status: 409, out: { ok: false, error: 'Your Project Manager has not priced this plan yet.' } };
  const at = nowIso(), ip = ipOf(event), ref = 'mts_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const plan = A.settings.plans.find(function(x){ return x.id === s(c0.planId); }) || { includes: '', visits: c0.visitsPerYear || 1 };
  const visits = Math.max(1, parseInt(c0.visitsPerYear || plan.visits, 10) || 1);
  const nextVisit = M.nextYear(at, Math.round(12 / visits));
  const words = carrierWords(p), job = scrub(p.name, words) || 'your job', customer = custName(p) || name;
  const pdf = planPdf({ planName: s(c0.planName), job: job, address: s(p.address), customer: customer, includes: s(plan.includes).replace(/\s*Price:\s*\[PRICE\][^.]*\.?/i, '').trim(), price: c0.price, visits: visits, nextVisit: nextVisit, name: name, strokes: cs.strokes, at: at, ip: ip, ref: ref });
  const docName = 'Maintenance plan — ' + s(c0.planName) + ' — signed ' + at.slice(0, 10) + '.pdf';
  const docRef = await storePdf(pdf, docName);
  const r = await contractChange(c0.id, function(c){
    if (c.status !== 'quoted') return 'changed';
    c.status = 'signed'; c.signedAt = at; c.signName = name; c.signIp = clip(ip, 60); c.drawn = cs.strokes.length > 0; c.docRef = docRef; c.docName = docName; c.ref = ref; c.nextVisit = nextVisit; c.visitsPerYear = visits;
    c.history = arr(c.history).concat([{ at: at, by: name + ' (portal)', what: 'Signed — ' + usd(c.price) + ' / year' }]);
  });
  if (!r.ok) return { status: 503, out: { ok: false, error: 'We could not save it just now. Please try again in a minute, or call GrayCo ' + OFFICE_PHONE + '.' } };
  if (r.result === 'changed') return { status: 409, out: { ok: false, error: 'This plan changed — reload the page.' } };
  const pm = pmOf(A.data, p), tag = jobTag(p);
  try { await core().officeTodo('maint_signed_' + c0.id, '🛠 Maintenance plan signed — ' + job, name + ' signed the ' + s(c0.planName) + ' (' + usd(c0.price) + ' / year) in the portal ' + central(at) + '. First visit ' + niceDay(nextVisit) + ' — it is on the schedule. Signed copy in the job\'s documents.' + (pm ? ' PM: ' + pm.name + '.' : '')); } catch (e) {}
  if (pm && okEmail(pm.email)) await resend({ to: pm.email, from: 'GrayCo CRM <noreply@grayco-cs.com>', subject: 'Maintenance plan signed: ' + s(c0.planName) + ' — ' + tag,
    html: shell('Maintenance plan signed', '<p>' + esc(name) + ' signed the <b>' + esc(c0.planName) + '</b> (' + esc(usd(c0.price)) + ' / year) in the customer portal.</p><p>First visit: <b>' + esc(niceDay(nextVisit)) + '</b> — it is on the schedule and in the To-Do. The yearly invoice waits on ✅ Approvals each year.</p>') });
  let mailed = { ok: false };
  const to = custEmail(p);
  if (okEmail(to)) mailed = await resend({ to: to, replyTo: pm && /@grayco-cs\.com$/i.test(pm.email) ? pm.email : '', subject: 'Your GrayCo maintenance plan — ' + tag,
    html: shell(job, '<p>Hi ' + esc(firstName(customer) || 'there') + ',</p><p>Thank you! You signed up for the <b>' + esc(c0.planName) + '</b> (' + esc(usd(c0.price)) + ' per year). Your first visit is planned for <b>' + esc(niceDay(nextVisit)) + '</b> — we will call before we come.</p><p>Your signed copy is attached and is always in your GrayCo Portal. Questions? Call ' + esc(pm ? pm.name : 'us') + ' or the office at ' + OFFICE_PHONE + '.</p>'),
    attachments: [{ filename: docName.replace(/[^\w .()-]+/g, '-'), content: pdf.toString('base64') }] });
  return { status: 200, out: { ok: true, ref: ref, nextVisit: nextVisit, emailed: !!mailed.ok } };
}
async function decline(event, row, body, A, p){
  const c0 = A.list.find(function(c){ return s(c.id) === s(body.contractId) && s(c.pid) === s(p.id); });
  if (!c0 || !/^(requested|quoted)$/.test(s(c0.status))) return { status: 404, out: { ok: false, error: 'That plan is not open on your job.' } };
  const r = await contractChange(c0.id, function(c){ if (!/^(requested|quoted)$/.test(s(c.status))) return 'changed'; c.status = 'declined'; c.declinedAt = nowIso(); c.history = arr(c.history).concat([{ at: nowIso(), by: 'customer (portal)', what: 'No thanks' }]); });
  return r.ok ? { status: 200, out: { ok: true } } : { status: 503, out: { ok: false, error: 'Please try again.' } };
}

/* ── staff ── */
async function staff(event){ return require('./bid-inbox.js')._test.staffAuth(event); }
async function staffAct(body, who){
  const act = s(body.action);
  const A = await readAll();
  if (act === 'list') return { status: 200, out: { ok: true, contracts: A.list, settings: A.settings, heard: A.heard, heardOpts: M.HEARD_OPTS } };
  if (act === 'plans') {
    if (!body.set) return { status: 200, out: { ok: true, settings: A.settings } };
    if (!(who.admin || who.office)) return { status: 403, out: { ok: false, error: 'Only an admin or the office changes the maintenance plans.' } };   /* patch OFFICEFULL */
    const v = body.set; if (!v || !Array.isArray(v.plans) || !v.plans.length || v.plans.length > 12) return { status: 400, out: { ok: false, error: 'Add at least one plan.' } };
    const clean = M.settingsOf({ plans: v.plans, offerOn: v.offerOn });
    clean.updatedAt = nowIso(); clean.by = who.email; delete clean.saved;
    const w = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: M.PLANS_KEY, value: JSON.stringify(clean), updated_at: nowIso() }) });
    return w.ok ? { status: 200, out: { ok: true, settings: M.settingsOf(clean) } } : { status: 502, out: { ok: false, error: 'Could not save (' + w.status + ').' } };
  }
  if (act === 'quote') {
    const price = money(body.price); if (!(price > 0) || price > 100000) return { status: 400, out: { ok: false, error: 'Enter the yearly price for this home.' } };
    let c0 = body.contractId ? A.list.find(function(c){ return s(c.id) === s(body.contractId); }) : null;
    const pid = s(c0 ? c0.pid : body.pid), p = findProject(A.data, pid);
    if (!p) return { status: 404, out: { ok: false, retry: true, error: 'The job is not in the cloud yet — try again in a minute.' } };
    if (!c0) {
      const plan = A.settings.plans.find(function(x){ return x.id === s(body.planId); }); if (!plan) return { status: 400, out: { ok: false, error: 'Pick a plan.' } };
      c0 = A.list.find(function(c){ return s(c.pid) === pid && s(c.planId) === plan.id && /^(requested|quoted)$/.test(s(c.status)); });
      if (!c0) {
        const at = nowIso(), id = 'mt_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
        const rec = { id: id, pid: pid, planId: plan.id, planName: plan.name, visitsPerYear: plan.visits, status: 'requested', requestedAt: at, requestedBy: who.email, history: [{ at: at, by: who.name || who.email, what: 'Offered by GrayCo' }], updatedAt: at };
        const ad = await listUpdate(M.LIST_KEY, function(l){ return { list: l.concat([rec]), check: function(a){ return a.some(function(x){ return x.id === id; }); } }; });
        if (!ad.ok) return { status: 503, out: { ok: false, error: 'Could not save — try again.' } };
        c0 = rec;
      }
    }
    if (c0.status === 'signed') return { status: 409, out: { ok: false, error: 'This plan is already signed.' } };
    const r = await contractChange(c0.id, function(c){ if (c.status === 'signed') return 'signed'; c.status = 'quoted'; c.price = price; c.quotedAt = nowIso(); c.quotedBy = who.name || who.email; c.history = arr(c.history).concat([{ at: nowIso(), by: who.name || who.email, what: 'Quoted ' + usd(price) + ' / year' }]); });
    if (!r.ok || r.result !== 'ok') return { status: r.result === 'signed' ? 409 : 503, out: { ok: false, error: r.result === 'signed' ? 'Already signed.' : 'Could not save — try again.' } };
    const pm = pmOf(A.data, p), to = custEmail(p), words = carrierWords(p), job = scrub(p.name, words) || 'your job';
    let queued = false;
    if (okEmail(to)) {
      const html = shell(job, '<p>Hi ' + esc(firstName(custName(p)) || 'there') + ',</p><p>Your price for the <b>' + esc(r.c.planName) + '</b> is <b>' + esc(usd(price)) + ' per year</b>. You can read what is included and sign up in your GrayCo Portal:</p>' +
        '<p style="text-align:center;margin:22px 0"><a href="' + core().LINK_PH + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">See my maintenance plan</a></p>' +
        '<p style="font-size:13px;color:#55626F">Questions? Call ' + esc(pm ? pm.name : 'us') + ' or the office at ' + OFFICE_PHONE + '.</p>');
      queued = await core().queueApproval({ id: 'appr_mtq_' + r.c.id + '_' + Math.round(price * 100), kind: 'maint_quote', pid: pid, jobName: job, pm: pm, to: to, subject: 'Your maintenance plan quote — ' + job, html: html,
        attachments: [{ name: 'The plan and its price (in the customer portal)', kind: 'portal' }], meta: { contractId: r.c.id, price: price, by: who.email } });
    } else { try { await core().officeTodo('maint_quote_' + r.c.id, '🛠 Tell ' + (custName(p) || 'the customer') + ' their maintenance plan price — ' + job, 'No customer e-mail on file. The quote (' + usd(price) + ' / year) is in their portal (Home → Maintenance plans): call or text them the portal link.'); } catch (e) {} }
    return { status: 200, out: { ok: true, contract: r.c, queued: !!queued } };
  }
  if (act === 'update') {
    const c0 = A.list.find(function(c){ return s(c.id) === s(body.contractId); }); if (!c0) return { status: 404, out: { ok: false, error: 'No such plan.' } };
    const r = await contractChange(c0.id, function(c){
      const by = who.name || who.email;
      if (body.nextVisit != null) { const d = s(body.nextVisit); if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'bad date'; c.nextVisit = d; c.history = arr(c.history).concat([{ at: nowIso(), by: by, what: 'Next visit ' + (d || 'cleared') }]); }
      if (body.visitDone) { const v = { at: nowIso(), by: by, note: clip(body.note, 400) }; c.visits = arr(c.visits).concat([v]); c.nextVisit = M.nextYear(v.at, Math.round(12 / Math.max(1, c.visitsPerYear || 1))); c.history = arr(c.history).concat([{ at: v.at, by: by, what: 'Visit done' + (v.note ? ': ' + v.note : '') }]); }
      if (body.cancel) { c.status = 'cancelled'; c.cancelledAt = nowIso(); c.history = arr(c.history).concat([{ at: nowIso(), by: by, what: 'Cancelled' + (body.note ? ': ' + clip(body.note, 200) : '') }]); }
    });
    if (r.result === 'bad date') return { status: 400, out: { ok: false, error: 'The date must be YYYY-MM-DD.' } };
    return r.ok && r.result === 'ok' ? { status: 200, out: { ok: true, contract: r.c } } : { status: 503, out: { ok: false, error: 'Could not save — try again.' } };
  }
  return { status: 400, out: { ok: false, error: 'Bad request' } };
}

/* ── the yearly invoice, once ✅ approved (portal.js aqSend → here) ── */
async function maintInvoiceSend(item, now){
  const meta = item.meta || {}, A = await readAll();
  const c = A.list.find(function(x){ return s(x.id) === s(meta.contractId); });
  if (!c || c.status !== 'signed') return { ok: false, error: 'The plan is no longer active — not sent.' };
  const p = findProject(A.data, c.pid); if (!p) return { ok: false, error: 'The job is not in the cloud.' };
  const to = s(item.to) || custEmail(p); if (!okEmail(to)) return { ok: false, error: 'No customer e-mail.' };
  const amount = money(meta.amount || c.price), year = s(meta.year), words = carrierWords(p), pm = pmOf(A.data, p);
  const number = 'M-' + s(p.autoPO || p.po || c.pid).replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) + '-' + year;
  const doc = { number: number, date: s(now || nowIso()).slice(0, 10), due: '', terms: 'Due on receipt', status: 'Open', client: custName(p), address: s(p.address), email: to, job: scrub(p.name, words), jobAddress: s(p.address),
    po: s(p.autoPO || p.po), lines: [{ desc: s(c.planName) + ' — yearly maintenance plan ' + year, amt: amount }], total: amount, paid: 0, balance: amount, isFinal: false, pm: pm ? pm.name : '', pmPhone: '' };
  let pdf; try { pdf = require('./_lib/invoice-pdf.js').build(doc); } catch (e) { return { ok: false, error: 'Could not make the invoice PDF.' }; }
  let html = s(item.html);
  try { html = await require('./_lib/brand.js').shellFor(html, { email: item.pmEmail, name: item.pm }); } catch (e) {}
  const key = s(process.env.RESEND_API_KEY); if (!key) return { ok: false, error: 'E-mail is not set up on Netlify (RESEND_API_KEY).' };
  if (mailOff()) return { ok: false, error: 'E-mail is switched off (PORTAL_MAIL_OFF).' };
  let subj = s(item.subject); try { subj = subj.indexOf('PO ') >= 0 ? subj : subj + ' — ' + jobTag(p); } catch (e) {}
  const payload = { from: require('./_lib/brand.js').billingFrom(), reply_to: require('./_lib/brand.js').billingEmail(), to: [to], subject: subj,   /* patch BILL */ html: html,
    attachments: [{ filename: 'GrayCo Invoice ' + number + '.pdf', content: pdf.toString('base64') }], headers: { 'X-GrayCo-CRM': 'maint-invoice' } };
  if (Array.isArray(item.cc) && item.cc.length) payload.cc = item.cc.slice(0, 5);
  let r; try { r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch (e) { return { ok: false, error: 'The e-mail service did not answer.' }; }
  if (!r.ok) return { ok: false, error: 'Resend answered ' + r.status };
  await contractChange(c.id, function(x){ x.invoices = arr(x.invoices).map(function(v){ return s(v.year) === year ? Object.assign({}, v, { status: 'sent', sentAt: nowIso(), number: number }) : v; }); });
  try { await core().officeTodo('maint_inv_' + c.id + '_' + year, '🧾 Record maintenance invoice ' + number + ' (' + usd(amount) + ') — ' + scrub(p.name, words), 'The yearly ' + s(c.planName) + ' invoice went to ' + to + ' after approval. Enter it in QuickBooks / the job\'s invoices so the payment can be matched.'); } catch (e) {}
  return { ok: true };
}

exports.handler = async function(event){
  event = event || {};
  const t0 = Date.now();
  const headers = Object.assign(cors(event), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  if (String(event.body || '').length > 200000) return reply(413, headers, { ok: false, error: 'Too big' });
  let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  if (typeof body !== 'object' || Array.isArray(body)) return reply(400, headers, { ok: false, error: 'Bad request' });
  const action = s(body.action || 'view');
  if (!svcKey()) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });

  if (['list', 'quote', 'update', 'plans'].indexOf(action) >= 0) {
    const who = await staff(event); if (!who.ok) return reply(who.code || 401, headers, { ok: false, error: who.error });
    try { const r = await staffAct(body, who); return reply(r.status, headers, r.out); }
    catch (e) { return reply(500, headers, { ok: false, error: 'The maintenance plans hit a problem: ' + clip(e && e.message || e, 120) }); }
  }
  if (['view', 'heard', 'maint-request', 'maint-sign', 'maint-decline'].indexOf(action) < 0) return reply(400, headers, { ok: false, error: 'Bad request' });
  const ip = ipOf(event);
  if (limited(ip)) { await sleep(MIN_FAIL_MS); return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' }); }
  const token = s(hdr(event, 'x-portal-token')), sess = s(hdr(event, 'x-portal-session'));
  if (!TOKEN_RE.test(token) && !sess) { noteBad(ip); return notActive(headers, t0); }
  let row = null; try { row = TOKEN_RE.test(token) ? await tokenRow(token) : await sessionLinkRow(sess, s(body.projectId)); } catch (e) {}
  if (!row || row.revoked === true) { noteBad(ip); return notActive(headers, t0); }
  let A = null, p = null;
  try { A = await readAll(); p = findProject(A.data, row.project_id); } catch (e) { return reply(503, headers, { ok: false, error: 'We could not load this just now. Please try again in a minute, or call GrayCo ' + OFFICE_PHONE + '.' }); }
  if (!p) return notActive(headers, t0);
  if (action === 'view') return reply(200, headers, await view(A, p));
  if (body.preview === true) return reply(403, headers, { ok: false, error: 'Preview — only the customer can do this.' });
  if (tooManyWrites(row.token || sess)) return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' });
  try {
    const fn = { heard: heard, 'maint-request': request, 'maint-sign': sign, 'maint-decline': decline }[action];
    const r = await fn(event, row, body, A, p);
    return reply(r.status, headers, r.out);
  } catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong — please call GrayCo ' + OFFICE_PHONE + '.' }); }
};
exports._x9 = { view: view, heard: heard, request: request, sign: sign, decline: decline, staffAct: staffAct, maintInvoiceSend: maintInvoiceSend, readAll: readAll, planPdf: planPdf, _reset: function(){ hits.clear(); writes.clear(); } };
exports.maintInvoiceSend = maintInvoiceSend;
