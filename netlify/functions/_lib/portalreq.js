/* ── GrayCo — "➕ Request a change" and "🏗 Request a new project" from the outside portals (patch PORTALREQ) ──────────
   Owner: "for customer portal / GC / property manager portal etc. have where they can request change orders or new projects."

   Where: the customer portal (portal.grayco-cs.com/#t=… or a signed-in customer — a property manager signs in the same
   way and gets every building of their 🏢 portfolio to pick from) and the GC's project page (#g=…). The sub portal never.

   1. ➕ REQUEST A CHANGE on a job they can open: what to change, where in the home / building, urgency (normal / soon /
      emergency), how to reach them, up to 4 photos / PDFs (the portal's upload limits: 4 MB each, as "We need from you").
      → a "Change order request" on that job (gc_kv gc_portal_requests) + a ✅ Approvals / To-Do card for the job's PM (the
      office too — an office kind, patch APOFFICE4) with "Make a change order" (the CRM's change order builder, prefilled;
      a GC job: its 🏗 GC portal change order, already filled in), "Reply" and "Decline with note".
      What they see: Received → Being priced → Change order sent (it is then in Papers to sign / the GC's change orders,
      like any change order) — or Not possible (with our note).
   2. 🏗 REQUEST A NEW PROJECT: one of THEIR properties (their jobs' addresses, their customer record's properties, a
      property manager's portfolio), the type of work (restoration / mitigation, roofing, commercial build-out, commercial
      maintenance, other — never HVAC or pressure washing), what they need, photos, urgency.
      → a LEAD linked to that customer (customerId — patch CUSTALL's rule: id / e-mail / phone, never a name alone), source
      "Portal request", through website-intake.js fileLead: the Lead Inbox and its routing, the one new-lead alert (an
      emergency takes the emergency path as it is). No sales / spam filter: they are a known, signed-in customer.
      The customer's PM gets a card too (Reply / Decline with note) so a reply reaches "My requests".
   3. MY REQUESTS: every request of theirs with its status and our replies.
   Our replies and a decline note are ✅ Approvals items (kinds preq_reply / preq_decline, the PM; the office) that show in
   the portal only once approved — the person writing one approves it at once when they may, so customer quiet hours
   (CUSTQUIET, 7 PM–7 AM) hold it until 7:00 AM exactly as every other approval. Nothing we send promises a price or a time:
   "Someone from our team will be with you shortly."
   Security: only the signed-in person's own jobs and properties; 10 requests a day; never a sub, an internal note, a cost
   or an insurance carrier in anything the portal gets back.
   ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
'use strict';
const crypto = require('crypto');

const KEY = 'gc_portal_requests';
const MAX_FILE = 4 * 1024 * 1024, MAX_FILES = 4, DAY_LIMIT = 10, ATTACH_MS = 2 * 3600e3;
const OFFICE_PHONE = '901-585-0944';
const SHORTLY = 'Someone from our team will be with you shortly.';
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };
const URGENCY = { normal: 'Normal', soon: 'Soon', emergency: 'Emergency' };
const CONTACT = { call: 'Call me', text: 'Text me', email: 'E-mail me', portal: 'Message me in the portal' };
/* the work GrayCo offers from here — HVAC and pressure washing are never offered */
const WORK = {
  restoration: { label: 'Restoration / mitigation', kind: 'insurance' },
  roofing: { label: 'Roofing', kind: 'residential' },
  buildout: { label: 'Commercial build-out', kind: 'commercial' },
  commaint: { label: 'Commercial maintenance', kind: 'commercial' },
  other: { label: 'Other', kind: 'residential' }
};
const NOT_OFFERED = /\b(hvac|heating\s*(and|&)\s*(air|cooling)|a\/?c\s+(unit|repair|install)|furnace|pressure[\s-]*wash(ing)?|power[\s-]*wash(ing)?)\b/i;
const STATUS = {
  change: { received: 'Received', pricing: 'Being priced', co_sent: 'Change order sent', declined: 'Not possible' },
  project: { received: 'Received', reviewing: 'With our team', declined: 'Not possible' }
};
const SOURCE = 'Portal request';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowIso(){ return new Date(Date.now()).toISOString(); }
function hex(n){ return crypto.randomBytes(n).toString('hex'); }
function sha(v){ return crypto.createHash('sha256').update(s(v)).digest('hex'); }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function phone10(v){ let d = s(v).replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? d : ''; }
function firstName(n){ const w = s(n).replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(/[\s,&]+/)[0] || ''; return /^[A-Za-z][A-Za-z'-]{0,20}$/.test(w) ? w[0].toUpperCase() + w.slice(1) : ''; }
function cleanText(v, n){ return clip(s(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n'), n); }
function cleanName(v){ return clip(s(v).replace(/[<>"\\\u0000-\u001F]/g, '').replace(/\s+/g, ' '), 80); }
function streetKey(a){ try { const k = require('./custall.js').street(a); if (k) return k; } catch (e) {} return low(a).split(',')[0].replace(/[^a-z0-9]+/g, ' ').trim(); }   /* CUSTALL's street rule: "Road" = "Rd" */
/* the Central calendar day (the 10-a-day limit) */
function centralDay(ms){
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
  catch (e) { return new Date(ms - 6 * 3600e3).toISOString().slice(0, 10); }
}
let CORE = null, GCP = null;
function core(){ if (!CORE) CORE = require('../portal.js')._core; return CORE; }
function G(){ if (!GCP) GCP = require('./gcp.js'); return GCP; }

/* ── the store ────────────────────────────────────────────────────────────────────────────────────────────── */
async function readAll(){ const cur = await core().kvListRead(KEY); return cur ? cur.list : null; }
async function change(id, fn){
  let out = null;
  const r = await core().kvListUpdate(KEY, function(l){
    const x = l.find(function(y){ return y && s(y.id) === s(id); }); if (!x) return null;
    const before = JSON.stringify(x);
    out = fn(x); if (out === false || JSON.stringify(x) === before) return null;
    x.updatedAt = nowIso();
    const stamp = x.updatedAt;
    return { list: l, check: function(l2){ return l2.some(function(y){ return y && s(y.id) === s(id) && y.updatedAt === stamp; }); }, result: x };
  });
  return { ok: !!(r && r.ok), req: r && r.result ? r.result : null, out: out };
}

/* ── who is asking (the portal's own doors) ──────────────────────────────────────────────────────────────── */
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
/* a signed-in customer: every job whose link is still on (sessionRow in portal.js gives one; here all of them) */
async function sessionPids(sessTok){
  const C = core();
  const r = await fetch(C.sbUrl() + '/rest/v1/gc_portal_session?select=kind,links,expires_at,revoked&id=eq.' + sha(sessTok), { headers: C.H() });
  if (!r.ok) return [];
  const ses = ((await r.json()) || [])[0];
  if (!ses || ses.kind !== 'customer' || ses.revoked === true || Date.parse(ses.expires_at) < Date.now()) return [];
  const links = (Array.isArray(ses.links) ? ses.links : []).map(String).filter(function(t){ return C.TOKEN_RE.test(t); });
  if (!links.length) return [];
  const q = await fetch(C.sbUrl() + '/rest/v1/gc_portal?select=token,project_id,revoked&revoked=eq.false&token=in.(' + links.map(function(t){ return '"' + t + '"'; }).join(',') + ')', { headers: C.H() });
  if (!q.ok) return [];
  return ((await q.json()) || []).filter(function(x){ return x && x.revoked !== true; }).map(function(x){ return s(x.project_id); }).filter(function(v, i, a){ return v && a.indexOf(v) === i; });
}
/* → { portal: 'customer' | 'gc', pids, gcPid } or null */
async function whoOf(event, body){
  const C = core();
  const g = s(hdr(event, 'x-gc-token') || body.g);
  if (g) { const row = await G().linkByToken(g); return row ? { portal: 'gc', pids: [s(row.pid)], gcPid: s(row.pid) } : null; }
  const token = s(hdr(event, 'x-portal-token') || body.t), sess = s(hdr(event, 'x-portal-session'));
  if (C.TOKEN_RE.test(token)) { const row = await C.tokenRow(token); return row && row.revoked !== true ? { portal: 'customer', pids: [s(row.project_id)] } : null; }
  if (C.TOKEN_RE.test(sess)) { const pids = await sessionPids(sess); return pids.length ? { portal: 'customer', pids: pids, signedIn: true } : null; }
  return null;
}

/* ── their properties ─────────────────────────────────────────────────────────────────────────────────────── */
function custRec(data, p){
  const list = arr(data.customers).filter(function(c){ return c && c.deleted !== true; });
  if (s(p.customerId)) { const c = list.find(function(x){ return s(x.id) === s(p.customerId); }); if (c) return c; }
  /* patch CUSTALL's rule: the same e-mail or phone — never a name alone */
  try {
    const CA = require('./custall.js'), r = CA.from.job(p, {}); if (!r.cand) return null;
    const m = CA.match(list, r.cand); return m && (m.by === 'email' || m.by === 'phone' || m.by === 'id') ? m.c : null;
  } catch (e) { return null; }
}
function customerIdOf(data, p){
  const c = custRec(data, p); if (c) return s(c.id);
  if (s(p.customerId)) return s(p.customerId);
  try { const CA = require('./custall.js'), r = CA.from.job(p, {}); if (r.cand && (r.cand.email || r.cand.phone)) return CA.idFor(r.cand); } catch (e) {}
  return '';
}
function jobEmails(data, p){ const c = custRec(data, p) || {}; return [p.clientEmail, p.email, p.customerEmail, c.email].map(low).filter(okEmail); }
/* a property manager: a 🏢 portfolio (patch MAINTTAB) whose manager e-mail is the customer on one of their jobs */
function portfolioOf(data, jobs, portfolios){
  return arr(portfolios).find(function(pf){
    const e = low(pf && pf.email); if (!okEmail(e)) return false;
    const pids = arr(pf.pids).map(String);
    return jobs.some(function(p){ return pids.indexOf(s(p.id)) >= 0 && jobEmails(data, p).indexOf(e) >= 0; });
  }) || null;
}
async function context(who){
  const C = core();
  const data = await C.crmData(false);
  let extra = {}; try { extra = await C.kvRead(['subs', 'gc_maint_portfolios']); } catch (e) { extra = {}; }
  const jobs = who.pids.map(function(pid){ return C.findProject(data, pid); }).filter(Boolean);
  const pf = who.portal === 'customer' ? portfolioOf(data, jobs, extra.gc_maint_portfolios) : null;
  return { data: data, subs: arr(extra.subs), jobs: jobs, portfolio: pf, kind: who.portal === 'gc' ? 'gc' : pf ? 'pm' : 'customer' };
}
function properties(ctx){
  const C = core(), out = [], seen = {};
  function add(id, label, address, pid){
    const k = streetKey(address || label); if (!k || seen[k]) return; seen[k] = 1;
    out.push({ id: id, label: clip(label, 140), address: clip(address, 200), pid: s(pid) });
  }
  ctx.jobs.forEach(function(p){ add('j:' + s(p.id), s(p.address) || s(p.name), s(p.address) || s(p.name), p.id); });
  if (ctx.portfolio) arr(ctx.portfolio.pids).forEach(function(pid){ const q = C.findProject(ctx.data, pid); if (q && s(q.address)) add('pf:' + s(ctx.portfolio.id) + ':' + s(q.id), s(q.address), s(q.address), q.id); });
  ctx.jobs.forEach(function(p){
    const c = custRec(ctx.data, p); if (!c) return;
    [c.address].concat(arr(c.properties).map(function(x){ return x && typeof x === 'object' ? x.address : x; })).forEach(function(a, i){ if (s(a)) add('c:' + s(c.id) + ':' + i, s(a), s(a), ''); });
  });
  return out;
}

/* ── never in a portal answer: insurance carriers, subs, costs, internal notes ─────────────────────────────── */
function rx(w){ return w instanceof RegExp ? new RegExp(w.source, 'gi') : new RegExp(s(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); }
function carrierRes(data, jobs){
  const C = core(), out = [];
  jobs.forEach(function(p){
    try { C.insWords(data, p).forEach(function(w){ out.push(rx(w)); }); } catch (e) {}
    ['insCarrier', 'carrier', 'insurer', 'insuranceCompany', 'insuranceCarrier', 'insCompany', 'insuranceCo', 'carrierName', 'adjusterCompany', 'adjustingCompany', 'tpa'].forEach(function(k){ if (s(p[k]).length >= 3) out.push(rx(p[k])); });
    arr(data.gc_claims).forEach(function(c){ if (c && s(c.projectId) === s(p.id) && s(c.carrier).length >= 3) out.push(rx(c.carrier)); });
  });
  if (C.COMMON_CARRIERS) out.push(rx(C.COMMON_CARRIERS));
  return out;
}
function subRes(ctx, jobs){
  const names = [];
  const push = function(v){ v = s(v); if (v.length >= 3 && !/^(our|the|a|an)\b/i.test(v)) names.push(v); };
  jobs.forEach(function(p){
    arr(p.subs).forEach(function(x){ if (x && typeof x === 'object') { push(x.name); push(x.company); push(x.contact); const r = ctx.subs.find(function(y){ return y && s(y.id) && s(y.id) === s(x.subId); }); if (r) { push(r.name); push(r.company); push(r.contact); } } });
    arr(p.subAgreements).forEach(function(x){ if (x) { push(x.sub); push(x.subName); } });
    [p.sub, p.subName, p.subcontractor].forEach(push);
  });
  return names.filter(function(v, i, a){ return a.indexOf(v) === i; }).sort(function(a, b){ return b.length - a.length; }).map(rx);
}
function cleaner(ctx, jobs){
  const car = carrierRes(ctx.data, jobs), sub = subRes(ctx, jobs);
  return function(t){ t = s(t); car.forEach(function(re){ re.lastIndex = 0; t = t.replace(re, 'your insurance company'); }); sub.forEach(function(re){ re.lastIndex = 0; t = t.replace(re, 'our crew'); }); return t; };
}

/* ── the status the portal shows ──────────────────────────────────────────────────────────────────────────── */
async function statusCtx(list){
  const C = core(), out = { sign: [], aq: [], gcp: {}, cos: [] };
  const chg = list.filter(function(r){ return r.kind === 'change' && (r.coId || r.gcpCoId) && r.status !== 'declined'; });
  if (!chg.length) return out;
  try { const a = await C.kvListRead('gc_sign_requests'); out.sign = a ? a.list : []; } catch (e) {}
  try { const b = await C.kvListRead(C.AQ_KEY); out.aq = b ? b.list : []; } catch (e) {}
  try { const d = await C.crmData(false); out.cos = C.listOf(d, ['cos', 'changeOrders']); } catch (e) {}
  for (const r of chg) if (r.gcpCoId && !out.gcp[r.pid]) { try { out.gcp[r.pid] = await G().jobState(r.pid); } catch (e) {} }
  return out;
}
function signVisible(r, aq){ try { return require('../portal-sign.js')._ps.visible(r, aq); } catch (e) { return r && r.status !== 'void' && !r.auto; } }
function statusOf(req, sc){
  if (req.status === 'declined') return 'declined';
  if (req.kind === 'project') return req.status === 'reviewing' || arr(req.replies).some(function(x){ return x.state === 'shown'; }) ? 'reviewing' : 'received';
  if (req.gcpCoId && sc.gcp[req.pid]) {
    const c = arr(sc.gcp[req.pid].cos).find(function(x){ return x && s(x.id) === s(req.gcpCoId); });
    if (c && /^(sent|signed)$/.test(s(c.status))) return 'co_sent';
    if (c && c.status === 'pricing') return 'pricing';
  }
  if (req.coId) {
    if (sc.sign.some(function(x){ return x && x.kind === 'change_order' && s(x.refId) === s(req.coId) && s(x.pid || x.projectId) === s(req.pid) && signVisible(x, sc.aq); })) return 'co_sent';
    if (sc.cos.some(function(c){ return c && s(c.id) === s(req.coId) && /approv|sign|accept/.test(low(c.status)) && c.deleted !== true; })) return 'co_sent';
    return 'pricing';
  }
  return req.status === 'pricing' ? 'pricing' : 'received';
}
const NEXT = {
  received: SHORTLY,
  pricing: 'We are working out the change order. ' + SHORTLY,
  co_sent: 'Your change order is ready — look it over and sign it in your portal.',
  reviewing: 'Our team has your request.',
  declined: ''
};
/* what the portal gets: a strict whitelist */
function custOut(req, sc, clean, gc){
  const st = statusOf(req, sc), labels = STATUS[req.kind] || STATUS.change;
  const replies = arr(req.replies).filter(function(x){ return x && x.state === 'shown'; }).map(function(x){ return { at: s(x.shownAt || x.at), by: (firstName(x.by) ? firstName(x.by) + ' · ' : '') + 'GrayCo', text: clean(x.text) }; });
  return { id: s(req.id), kind: req.kind, at: s(req.createdAt), title: clean(req.kind === 'project' ? (WORK[req.workType] || WORK.other).label + ' — ' + s(req.property && req.property.label) : clip(s(req.text).split('\n')[0], 90)),
    text: clean(req.text), where: clean(req.where), urgency: req.urgency, urgencyLabel: URGENCY[req.urgency] || 'Normal', contact: CONTACT[req.contact] || '', job: req.kind === 'change' ? clean(req.jobName) : '',
    workTypeId: req.kind === 'project' ? (WORK[req.workType] ? req.workType : 'other') : '', property: req.kind === 'project' ? clean(s(req.property && req.property.label)) : '', newAddress: !!(req.kind === 'project' && req.property && req.property.isNew), workType: req.kind === 'project' ? (WORK[req.workType] || WORK.other).label : '',
    files: arr(req.files).length, status: st, statusLabel: labels[st] || labels.received,
    next: st === 'co_sent' && gc ? 'Your change order is ready — sign it under 📝 Change orders on this page.' : NEXT[st] || '',
    note: st === 'declined' && req.decline && req.decline.state === 'shown' ? clean(req.decline.note) : '', replies: replies };
}
function inScope(req, who){
  if (!req || req.deleted) return false;
  if (who.portal === 'gc') return req.portal === 'gc' && s(req.fromPid) === s(who.gcPid);
  return req.portal !== 'gc' && (who.pids.indexOf(s(req.fromPid)) >= 0 || who.pids.indexOf(s(req.pid)) >= 0);
}
function rkOf(portal, p){ return (portal === 'gc' ? 'gc:' : 'c:') + (s(p.customerId) || low(p.clientEmail || p.customerEmail || p.email) || 'job:' + s(p.id)); }

/* ── files (images / PDF, the portal's limits) ────────────────────────────────────────────────────────────── */
async function storeFile(f){
  const C = core();
  const d = f && typeof f === 'object' ? s(f.data) : s(f), name = f && typeof f === 'object' ? clip(s(f.name).replace(/[<>"\\/]/g, ''), 120) : '';
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(d);
  if (!m || !TYPES[m[1]]) return { error: 'Send a photo (JPG, PNG, HEIC) or a PDF.' };
  const buf = Buffer.from(m[2], 'base64'); if (!buf.length) return { error: 'That file is empty.' };
  if (buf.length > MAX_FILE) return { error: 'That file is over 4 MB — send a smaller one.' };
  if (m[1] === 'application/pdf' && buf.slice(0, 4).toString('latin1') !== '%PDF') return { error: 'That PDF could not be read.' };
  const path = 'portalreq/' + crypto.createHash('sha256').update(buf).digest('hex') + '.' + TYPES[m[1]];
  try {
    const r = await fetch(C.sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: Object.assign(C.keyHeaders(C.svcKey()), { 'Content-Type': m[1], 'x-upsert': 'true' }), body: buf });
    if (r.ok || r.status === 409) return { file: { ref: 'sb:crm-files/' + path, type: m[1], size: buf.length, name: name || ('file.' + TYPES[m[1]]) } };
  } catch (e) {}
  return { error: 'We could not save that file just now — try again.' };
}
async function signRefs(refs){
  const C = core(), paths = refs.map(function(r){ return s(r).replace(/^sb:crm-files\//, ''); }).filter(Boolean); if (!paths.length) return {};
  try {
    const r = await fetch(C.sbUrl() + '/storage/v1/object/sign/crm-files', { method: 'POST', headers: C.H(), body: JSON.stringify({ expiresIn: 3600, paths: paths }) });
    const out = {}; if (!r.ok) return out;
    (await r.json() || []).forEach(function(x){ if (x && x.signedURL) out['sb:crm-files/' + x.path] = C.sbUrl() + '/storage/v1' + x.signedURL; });
    return out;
  } catch (e) { return {}; }
}

/* ── the staff card ───────────────────────────────────────────────────────────────────────────────────────── */
function cardHtml(req, p){
  const rows = [['Job', s(p.name) + (p.address ? ' · ' + s(p.address) : '')], ['From', s(req.by) + ' (' + (req.portal === 'gc' ? 'GC project page' : req.portal === 'pm' ? 'property manager, customer portal' : 'customer portal') + ')'],
    req.kind === 'project' ? ['Property', s(req.property && req.property.label) + (req.property && req.property.isNew ? ' (NEW ADDRESS FROM THE PORTAL — not on file; confirm it with them)' : '')] : null, req.kind === 'project' ? ['Work', (WORK[req.workType] || WORK.other).label] : null,
    ['What', s(req.text)], req.where ? ['Where', s(req.where)] : null, ['Urgency', URGENCY[req.urgency]], ['Reach them', (CONTACT[req.contact] || '') + (req.contactNote ? ' — ' + s(req.contactNote) : '')]].filter(Boolean);
  return rows.map(function(r){ return '<p><b>' + esc(r[0]) + ':</b> ' + esc(r[1]).replace(/\n/g, '<br>') + '</p>'; }).join('')
    + (req.kind === 'project' ? '<p>It is on 📥 Lead Inbox as a lead (source “Portal request”).</p>' : '<p>Make a change order, reply, or decline with a note. Nothing goes to them until it is approved.</p>');
}
async function queueCard(req, p, data){
  const C = core(), pm = C.pmOf(data, p), em = req.urgency === 'emergency';
  const title = (em ? '🚨 ' : '') + (req.kind === 'project' ? '🏗 New project request — ' + clip(req.by, 50) + ' — ' + (WORK[req.workType] || WORK.other).label : '➕ Change requested — ' + clip(p.name, 70));
  const ok = await C.queueApproval({ id: 'appr_preq_' + req.id, kind: req.kind === 'project' ? 'preq_project' : 'preq_change', title: title, pid: s(p.id), jobName: s(p.name), pm: pm, to: '', channel: 'portal',
    subject: (req.kind === 'project' ? 'New project request: ' : 'Change request: ') + clip(req.text, 100), html: cardHtml(req, p), attachments: [], pmEsc: true,
    priority: em ? 'urgent' : req.urgency === 'soon' ? 'high' : 'normal', meta: { preq: req.id, kind: req.kind, urgency: req.urgency, portal: req.portal, leadId: s(req.leadId) || undefined } });
  /* a phone push to the PM and the office (best effort; e-mail is not needed — it is on their To-Do) */
  try {
    const to = [pm && pm.email].concat(C.officeEmails(data)).filter(okEmail);
    if (to.length) await C.pushTo(to.filter(function(v, i, a){ return a.indexOf(v) === i; }), { title: title, body: clip(req.text, 120), tag: 'preq-' + req.id });
  } catch (e) {}
  return ok;
}
async function closeCard(reqId, me, note){
  const C = core(), id = 'appr_preq_' + reqId, now = nowIso();
  try {
    await C.kvListUpdate(C.AQ_KEY, function(l){
      const it = l.find(function(y){ return y && s(y.id) === id && (y.status === 'waiting' || y.status === 'sending'); }); if (!it) return null;
      it.status = 'sent'; it.sentAt = now; it.sentBy = clip(me, 80) || 'GrayCo'; it.note = clip(note, 120); it.updatedAt = now;
      return { list: l, check: function(l2){ return l2.some(function(y){ return y && s(y.id) === id && y.status === 'sent'; }); } };
    });
  } catch (e) {}
}

/* ── PUBLIC ───────────────────────────────────────────────────────────────────────────────────────────────── */
function out(code, body){ return { code: code, body: body }; }
async function mine(who, body){
  const ctx = await context(who);
  const list = (await readAll()) || [];
  const scoped = list.filter(function(r){ return inScope(r, who); }).sort(function(a, b){ return s(a.createdAt) < s(b.createdAt) ? 1 : -1; }).slice(0, 40);
  const sc = await statusCtx(scoped);
  const rjobs = scoped.map(function(r){ return core().findProject(ctx.data, r.pid || r.fromPid); }).filter(Boolean);
  const clean = cleaner(ctx, ctx.jobs.concat(rjobs));
  const p0 = ctx.jobs[0];
  const day = centralDay(Date.now()), rk = p0 ? rkOf(who.portal, p0) : '';
  const used = list.filter(function(r){ return r && r.rk === rk && centralDay(Date.parse(r.createdAt)) === day; }).length;
  return out(200, { ok: true, portal: ctx.kind, requests: scoped.map(function(r){ return custOut(r, sc, clean, who.portal === 'gc'); }),
    properties: properties(ctx).map(function(x){ return { id: x.id, label: clean(x.label) }; }), workTypes: Object.keys(WORK).map(function(k){ return { id: k, label: WORK[k].label }; }),
    urgencies: Object.keys(URGENCY).map(function(k){ return { id: k, label: URGENCY[k] }; }), contacts: Object.keys(CONTACT).map(function(k){ return { id: k, label: CONTACT[k] }; }),
    left: Math.max(0, DAY_LIMIT - used), limits: { files: MAX_FILES, mb: 4 }, office: OFFICE_PHONE });
}
function pickJob(who, ctx, body){
  const want = s(body.projectId) || (who.portal === 'gc' ? who.gcPid : '') || (ctx.jobs.length === 1 ? s(ctx.jobs[0].id) : '');
  if (!want || who.pids.indexOf(want) < 0) return null;
  return ctx.jobs.find(function(p){ return s(p.id) === want; }) || null;
}
/* add one request (the 10-a-day limit checked in the same write) */
async function add(req){
  const day = centralDay(Date.now());
  let limited = false;
  const r = await core().kvListUpdate(KEY, function(l){
    const used = l.filter(function(x){ return x && x.rk === req.rk && centralDay(Date.parse(x.createdAt)) === day; }).length;
    if (used >= DAY_LIMIT) { limited = true; return null; }
    return { list: l.concat([req]).slice(-5000), check: function(l2){ return l2.some(function(x){ return x && x.id === req.id; }); } };
  });
  return limited ? 'limit' : r && r.ok ? 'ok' : 'error';
}
const LIMIT_MSG = 'You have sent us ' + DAY_LIMIT + ' requests today — that is the most for one day. ' + SHORTLY + ' Urgent? Call ' + OFFICE_PHONE + '.';
function common(body){
  const text = cleanText(body.text, 3000);
  return { text: text, where: cleanText(body.where, 160), urgency: URGENCY[s(body.urgency)] ? s(body.urgency) : 'normal', contact: CONTACT[s(body.contact)] ? s(body.contact) : 'call', contactNote: cleanText(body.contactNote, 120) };
}
async function requestChange(who, body){
  const ctx = await context(who);
  const p = pickJob(who, ctx, body); if (!p) return out(404, { ok: false, error: 'That job is not in your portal.' });
  const f = common(body); if (f.text.length < 5) return out(400, { ok: false, field: 'text', error: 'Tell us what you would like changed (a few words is fine).' });
  const now = nowIso(), by = cleanName(body.name) || s(p.client) || (who.portal === 'gc' ? 'The GC' : 'Customer');
  const req = Object.assign({ id: 'PRQ-' + hex(6), kind: 'change', portal: ctx.kind, pid: s(p.id), fromPid: s(p.id), rk: rkOf(who.portal, p), jobName: clip(p.name, 120), by: by,
    files: [], status: 'received', replies: [], createdAt: now, updatedAt: now, history: [{ at: now, by: by, what: 'asked for a change' }] }, f);
  const w = await add(req);
  if (w === 'limit') return out(429, { ok: false, error: LIMIT_MSG });
  if (w !== 'ok') return out(503, { ok: false, error: 'We could not save it just now — please try again, or call ' + OFFICE_PHONE + '.' });
  /* a GC job asked from the GC's page: its 🏗 GC portal change order waits there, already filled in (the PM prices it) */
  if (who.portal === 'gc' && G().isGcJob(ctx.data, p)) {
    try {
      const c = await G().mutateJob(p.id, function(st){
        st.seq.co = (st.seq.co || 0) + 1;
        const x = { id: 'GCO_' + Date.now().toString(36) + hex(4), number: String(st.seq.co), title: clip(req.text.split('\n')[0], 120), description: clip(req.text + (req.where ? '\nWhere: ' + req.where : ''), 3000),
          requestedBy: by + ' (GC)', requestedAt: now, status: 'requested', preqId: req.id };
        st.cos.push(x); st.log = arr(st.log).concat([{ at: now, who: clip(by + ' (GC)', 120), what: clip('Change requested (portal request ' + req.id + '): ' + x.title, 300) }]); return x;
      });
      if (c) { const ch = await change(req.id, function(x){ x.gcpCoId = c.id; x.gcpCoNum = c.number; }); if (ch.req) Object.assign(req, ch.req); }
    } catch (e) {}
  }
  await queueCard(req, p, ctx.data);
  const clean = cleaner(ctx, [p]);
  return out(200, { ok: true, request: custOut(req, { sign: [], aq: [], gcp: {}, cos: [] }, clean, who.portal === 'gc'), say: 'Thank you — we have your request. ' + SHORTLY });
}
async function requestProject(who, body){
  const ctx = await context(who);
  const props = properties(ctx);
  let prop = props.find(function(x){ return x.id === s(body.property); });
  /* a property not on file (owner: "customers often have other properties"): THEIR new address, typed — the lead is linked to
     them only (their customerId); it is never matched to, linked to or changes any other customer's job or address */
  if (!prop && s(body.property) === 'new') {
    const a = cleanText(body.newAddress, 200).replace(/\s+/g, ' ');
    if (a.length < 8 || !/\d/.test(a) || !/[a-z]{2}/i.test(a)) return out(400, { ok: false, field: 'newAddress', error: 'Type the full address (number, street, city).' });
    const known = props.find(function(x){ return streetKey(x.address) === streetKey(a); });
    prop = known || { id: 'new', label: a, address: a, pid: '', isNew: true };
  }
  if (!prop) return out(400, { ok: false, field: 'property', error: 'Pick one of your properties.' });
  const wt = s(body.workType); if (!WORK[wt]) return out(400, { ok: false, field: 'workType', error: 'Pick the type of work.' });
  const f = common(body); if (f.text.length < 5) return out(400, { ok: false, field: 'text', error: 'Tell us what you need (a few words is fine).' });
  /* the customer behind it: the property's own job, else the job they asked from */
  const from = pickJob(who, ctx, body) || ctx.jobs[0]; if (!from) return out(404, { ok: false, error: 'That job is not in your portal.' });
  const base = (prop.pid && core().findProject(ctx.data, prop.pid)) || from;
  const now = nowIso(), by = cleanName(body.name) || s(base.client) || (who.portal === 'gc' ? 'The GC' : 'Customer');
  const req = Object.assign({ id: 'PRQ-' + hex(6), kind: 'project', portal: ctx.kind, pid: s(prop.pid), fromPid: s(from.id), rk: rkOf(who.portal, from), jobName: clip(base.name, 120), by: by,
    property: { id: prop.id, label: prop.label, address: prop.address, isNew: prop.isNew === true }, workType: wt, files: [], status: 'received', replies: [], createdAt: now, updatedAt: now,
    history: [{ at: now, by: by, what: 'asked for a new project' }] }, f);
  const w = await add(req);
  if (w === 'limit') return out(429, { ok: false, error: LIMIT_MSG });
  if (w !== 'ok') return out(503, { ok: false, error: 'We could not save it just now — please try again, or call ' + OFFICE_PHONE + '.' });
  /* the lead: the Lead Inbox and its routing, the new-lead alert (an emergency: the emergency path) */
  const C = core(), pm = C.pmOf(ctx.data, base), c = custRec(ctx.data, base) || {};
  const company = ctx.kind === 'gc' ? G().gcCompany(ctx.data, base) : ctx.portfolio ? s(ctx.portfolio.name) : s(c.company);
  let lead = null;
  try {
    lead = await require('../website-intake.js').fromPortalRequest({ reqId: req.id, portal: ctx.kind, name: s(base.client) || by, requester: by, company: company,
      email: (jobEmails(ctx.data, base)[0]) || (ctx.portfolio ? low(ctx.portfolio.email) : ''), phone: s(base.clientPhone || base.phone || c.phone) || (ctx.portfolio ? s(ctx.portfolio.phone) : ''),
      address: prop.address, workType: wt, workLabel: WORK[wt].label, leadKind: wt === 'roofing' || wt === 'other' ? (ctx.kind === 'customer' ? 'residential' : 'commercial') : WORK[wt].kind,
      text: req.text, urgency: req.urgency, contact: CONTACT[req.contact], contactNote: req.contactNote, customerId: customerIdOf(ctx.data, base),
      customerPid: s(base.id), customerJob: s(base.name), pm: pm, newAddress: prop.isNew === true, portfolio: ctx.portfolio ? { id: s(ctx.portfolio.id), name: s(ctx.portfolio.name) } : null });
  } catch (e) { try { console.log('[portalreq] lead failed: ' + (e && e.message || e)); } catch (x) {} }
  if (lead && lead.id) { const ch = await change(req.id, function(x){ x.leadId = lead.id; }); if (ch.req) Object.assign(req, ch.req); }
  await queueCard(req, base, ctx.data);
  const clean = cleaner(ctx, [base]);
  return out(200, { ok: true, request: custOut(req, { sign: [], aq: [], gcp: {}, cos: [] }, clean, who.portal === 'gc'), say: 'Thank you — we have your request. ' + SHORTLY });
}
async function attach(who, body){
  const list = (await readAll()) || [], req = list.find(function(r){ return r && s(r.id) === s(body.id); });
  if (!req || !inScope(req, who)) return out(404, { ok: false, error: 'That request is not in your portal.' });
  if (Date.now() - Date.parse(req.createdAt) > ATTACH_MS) return out(409, { ok: false, error: 'Add photos to a new request, or send them in Messages.' });
  if (arr(req.files).length >= MAX_FILES) return out(409, { ok: false, error: 'At most ' + MAX_FILES + ' photos or files on one request.' });
  const st = await storeFile(body.file); if (!st.file) return out(400, { ok: false, error: st.error });
  const ch = await change(req.id, function(x){ if (arr(x.files).length >= MAX_FILES || arr(x.files).some(function(y){ return y.ref === st.file.ref; })) return false; x.files = arr(x.files).concat([Object.assign({ at: nowIso() }, st.file)]); });
  return out(200, { ok: true, files: arr((ch.req || req).files).length });
}
/* the portal's Spanish (the page sends lang 'es' when its EN / ES button says so): every message a customer can get here */
const ES = {
  'Send a photo (JPG, PNG, HEIC) or a PDF.': 'Envíe una foto (JPG, PNG, HEIC) o un PDF.', 'That file is empty.': 'Ese archivo está vacío.',
  'That file is over 4 MB — send a smaller one.': 'Ese archivo pesa más de 4 MB — envíe uno más pequeño.', 'That PDF could not be read.': 'No se pudo leer ese PDF.',
  'We could not save that file just now — try again.': 'No pudimos guardar ese archivo ahora — intente otra vez.', 'That job is not in your portal.': 'Ese trabajo no está en su portal.',
  'Tell us what you would like changed (a few words is fine).': 'Díganos qué le gustaría cambiar (unas palabras están bien).', 'Tell us what you need (a few words is fine).': 'Díganos qué necesita (unas palabras están bien).',
  'Type the full address (number, street, city).': 'Escriba la dirección completa (número, calle, ciudad).', 'Pick one of your properties.': 'Escoja una de sus propiedades.', 'Pick the type of work.': 'Escoja el tipo de trabajo.',
  'That request is not in your portal.': 'Esa solicitud no está en su portal.', 'Add photos to a new request, or send them in Messages.': 'Agregue fotos a una solicitud nueva, o envíelas en Mensajes.',
  'Preview — only the customer can send a request.': 'Vista previa — solo el cliente puede enviar una solicitud.', 'Bad request': 'Solicitud no válida'
};
function esOf(t){
  t = s(t); if (!t) return t;
  if (ES[t]) return ES[t];
  if (t === LIMIT_MSG) return 'Ya nos envió ' + DAY_LIMIT + ' solicitudes hoy — es el máximo para un día. Alguien de nuestro equipo se comunicará con usted en breve. ¿Es urgente? Llame al ' + OFFICE_PHONE + '.';
  if (/^We could not save it just now/.test(t)) return 'No pudimos guardarla ahora — intente otra vez, o llame al ' + OFFICE_PHONE + '.';
  if (/^Too many tries/.test(t)) return 'Demasiados intentos. Por favor llame a GrayCo al ' + OFFICE_PHONE + '.';
  if (/^At most \d+ photos/.test(t)) return 'Máximo ' + MAX_FILES + ' fotos o archivos por solicitud.';
  if (/^Thank you — we have your request\./.test(t)) return 'Gracias — recibimos su solicitud. Alguien de nuestro equipo se comunicará con usted en breve.';
  if (/^This link is not active/.test(t)) return 'Este enlace no está activo — llame a GrayCo ' + OFFICE_PHONE;
  return t;
}
async function portal(event, body){
  const r = await portalEn(event, body);
  if (s(body.lang) === 'es' && r && r.body) { if (r.body.error) r.body.error = esOf(r.body.error); if (r.body.say) r.body.say = esOf(r.body.say); }
  return r;
}
async function portalEn(event, body){
  const C = core(), ip = C.ipOf(event), action = s(body.action || 'mine');
  if (C.limited(ip)) return out(429, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' });
  let who = null; try { who = await whoOf(event, body); } catch (e) { who = null; }
  if (!who) { C.noteBad(ip); return out(404, { ok: false, error: C.NOT_ACTIVE }); }
  if (action === 'mine') return mine(who, body);
  if (body.preview === true) return out(403, { ok: false, error: 'Preview — only the customer can send a request.' });
  if (action === 'change') return requestChange(who, body);
  if (action === 'project') return requestProject(who, body);
  if (action === 'attach') return attach(who, body);
  return out(400, { ok: false, error: 'Bad request' });
}

/* ── STAFF (the CRM; CRM sign-in + gc_staff) ──────────────────────────────────────────────────────────────── */
function staffOut(r){ return Object.assign({}, r, { files: arr(r.files).map(function(f){ return { name: f.name, type: f.type, size: f.size, ref: f.ref }; }) }); }
async function staff(body, who){
  const C = core(), action = s(body.action), me = s(who.name) || s(who.email);
  if (action === 'staff-list') {
    const list = (await readAll()) || [];
    return out(200, { ok: true, requests: list.filter(function(r){ return r && (!s(body.pid) || s(r.pid) === s(body.pid) || s(r.fromPid) === s(body.pid)); }).slice(-200).reverse().map(staffOut) });
  }
  const list = (await readAll()) || [], req = list.find(function(r){ return r && s(r.id) === s(body.id); });
  if (!req) return out(404, { ok: false, error: 'That request is not in the cloud.' });
  const data = await C.crmData(true), p = C.findProject(data, req.pid || req.fromPid) || { id: req.pid || req.fromPid, name: req.jobName };
  if (action === 'staff-get') {
    const signed = await signRefs(arr(req.files).map(function(f){ return f.ref; }));
    const sc = await statusCtx([req]);
    return out(200, { ok: true, request: Object.assign(staffOut(req), { files: arr(req.files).map(function(f){ return { name: f.name, type: f.type, size: f.size, url: signed[f.ref] || '' }; }) }),
      status: statusOf(req, sc), statusLabel: (STATUS[req.kind] || STATUS.change)[statusOf(req, sc)], job: { id: s(p.id), name: s(p.name), po: s(p.autoPO || p.po), client: s(p.client), pm: s(p.pm), address: s(p.address), gc: G().isGcJob(data, p) } });
  }
  if (action === 'staff-pricing') {
    const ch = await change(req.id, function(x){ if (x.status === 'declined') return false; if (x.status === 'received') x.status = 'pricing'; x.pricingAt = x.pricingAt || nowIso(); x.pricingBy = x.pricingBy || me; });
    return out(200, { ok: true, request: staffOut(ch.req || req) });
  }
  if (action === 'staff-link-co') {
    const coId = s(body.coId); if (!/^[A-Za-z0-9_.:-]{1,90}$/.test(coId)) return out(400, { ok: false, error: 'Which change order?' });
    const ch = await change(req.id, function(x){ x.coId = coId; x.coNum = clip(body.coNum, 30); if (x.status !== 'declined') x.status = 'pricing'; x.history = arr(x.history).concat([{ at: nowIso(), by: me, what: 'change order ' + (s(body.coNum) || coId) + ' made' }]).slice(-40); });
    await closeCard(req.id, me, 'Change order ' + (s(body.coNum) || 'made'));
    return out(200, { ok: true, request: staffOut(ch.req || req) });
  }
  if (action === 'staff-close') { await closeCard(req.id, me, 'Handled'); return out(200, { ok: true }); }
  if (action === 'staff-reply' || action === 'staff-decline') {
    const decline = action === 'staff-decline', text = cleanText(body.text || body.note, 2000);
    if (text.length < 2) return out(400, { ok: false, error: decline ? 'Say why it is not possible — they see this note.' : 'Type the reply.' });
    if (decline && req.status === 'declined') return out(409, { ok: false, error: 'Already declined.' });
    const rid = 'R-' + hex(5), now = nowIso(), aqId = (decline ? 'appr_preqd_' : 'appr_preqr_') + rid;
    const ch = await change(req.id, function(x){
      if (decline) x.decline = { id: rid, note: text, by: me, byEmail: low(who.email), at: now, state: 'waiting', aq: aqId };
      else x.replies = arr(x.replies).concat([{ id: rid, text: text, by: me, byEmail: low(who.email), at: now, state: 'waiting', aq: aqId }]).slice(-40);
      x.history = arr(x.history).concat([{ at: now, by: me, what: decline ? 'declined (note waits on approval)' : 'replied (waits on approval)' }]).slice(-40);
    });
    if (!ch.ok) return out(503, { ok: false, error: 'Could not save — try again.' });
    const who0 = s(req.by) || 'the customer';
    const q = await C.queueApproval({ id: aqId, kind: decline ? 'preq_decline' : 'preq_reply', title: (decline ? '✖ Not possible — note to ' : '💬 Reply to ') + clip(who0, 50) + ' (portal request)', pid: s(p.id), jobName: s(p.name), pm: C.pmOf(data, p),
      to: '', channel: 'portal', subject: (decline ? 'Not possible: ' : 'Reply: ') + clip(req.text, 90), html: '<p>' + esc(text).replace(/\n/g, '<br>') + '</p>', attachments: [], meta: { preq: req.id, reply: rid, decline: decline } });
    if (!q) return out(503, { ok: false, error: 'Could not put it on ✅ Approvals — try again.' });
    if (decline || req.kind === 'project') await closeCard(req.id, me, decline ? 'Declined with a note' : 'Replied');
    /* the writer approves it now when they may (the PM, the office, an admin): quiet hours hold it to 7:00 AM like any approval */
    let a = null; try { a = await C.approvalAction({ op: 'approve', id: aqId }, who); } catch (e) { a = null; }
    const o = a && a.out ? a.out : {};
    if (o.ok && o.scheduled) await change(req.id, function(x){ const r = decline ? x.decline : arr(x.replies).find(function(y){ return y.id === rid; }); if (r && r.state === 'waiting') { r.state = 'scheduled'; r.releaseAt = s(o.releaseAt); } });
    const say = o.ok && o.sent ? '✅ In their portal now.' : o.ok && o.scheduled ? (o.say || '⏰ Scheduled for 7:00 AM — customers don\'t get posts or texts 7 PM–7 AM') : '⏳ On ✅ Approvals — it shows in their portal once approved.';
    return out(200, { ok: true, sent: !!o.sent, scheduled: !!o.scheduled, waiting: !(o.ok && (o.sent || o.scheduled)), say: say, approvalId: aqId });
  }
  return out(400, { ok: false, error: 'Bad request' });
}

/* ── ✅ Approvals (portal.js aqSend / approvalAction hand preq_* here) ──────────────────────────────────────── */
async function onApproved(item, now){
  const m = item.meta || {}, kind = s(item.kind);
  if (kind === 'preq_change' || kind === 'preq_project') return { ok: true, posted: false };   /* the request card itself: approving it = handled */
  let paused = false; try { paused = await require('./pause').isPaused(); } catch (e) { paused = false; }
  if (paused) return { ok: false, error: 'Data-entry mode is on: nothing goes to customers, so it was not put in the portal. Use “Approve as record-only”, or approve again after ▶ Resume sending.' };
  const text = cleanText(s(item.text), 2000), at = now || nowIso();
  const ch = await change(m.preq, function(x){
    if (kind === 'preq_decline') {
      if (!x.decline || s(x.decline.id) !== s(m.reply)) return false;
      if (text) x.decline.note = text; x.decline.state = 'shown'; x.decline.shownAt = at; x.status = 'declined';
    } else {
      const r = arr(x.replies).find(function(y){ return s(y.id) === s(m.reply); }); if (!r) return false;
      if (text) r.text = text; r.state = 'shown'; r.shownAt = at; if (x.kind === 'project' && x.status === 'received') x.status = 'reviewing';
    }
  });
  if (!ch.ok) return { ok: false, error: 'Could not save it just now — try again.' };
  return { ok: true, posted: true };
}
async function onRejected(item){
  const m = item.meta || {}, kind = s(item.kind);
  if (kind !== 'preq_reply' && kind !== 'preq_decline') return;
  await change(m.preq, function(x){
    const r = kind === 'preq_decline' ? x.decline : arr(x.replies).find(function(y){ return s(y.id) === s(m.reply); });
    if (!r || s(r.id) !== s(m.reply)) return false; r.state = 'rejected';
  });
}

module.exports = { ES, esOf, KEY, DAY_LIMIT, MAX_FILE, MAX_FILES, WORK, URGENCY, CONTACT, STATUS, SHORTLY, NOT_OFFERED, portal, staff, onApproved, onRejected, whoOf, properties, context, statusOf, custOut, inScope, storeFile, centralDay };
