/* ── GrayCo — COMMERCIAL JOBS: change orders always signed, the job on hold until they are, the GC superintendent
   initials the materials before work starts; the GC portal carries change orders, materials approval, submittals and
   approval requests (patch COMMCO) ─────────────────────────────────────────────────────────────────────────────────

   Owner (10/26): "Commercial: we get change orders signed for any new work no matter what; the job cannot continue
   until the change order is signed. We also need to initial all materials we are using in commercial on site for
   their supers — before we start we have supers initial a checklist of materials we are using."
   Then: "all change orders, links, submittals, approvals for commercial go through GC portal and email."

   Which job is commercial: the ONE rule of patch AUTOCOM (job-auto.js groupOf — type, from a bid, a GC / company
   customer). Residential / insurance / program jobs keep the old rules ($2,500 signature line, no hold, no checklist).

   THE RULES (the CRM page carries this same block, between the RULES markers, copied by tools/patch_COMMCO.py):
     • every change order on a commercial job needs the GC's signature, whatever the amount;
     • while one made on / after 10/26 is not signed (sent, approved without a signature, or a draft with work in it)
       the job is ON HOLD: "⛔ Work stopped — waiting on signed Change Order #N from <GC>";
     • the materials checklist: each line is initialed by the GC's superintendent (a line changed after it was
       initialed needs new initials); the job may start once every line is initialed and the checklist signed.

   SERVER (the GC portal's store, gc_gcp_jobs[pid] — service-only, see gcp.js):
     mats  { lines:[{id, product, spec, qty, where, src, init:{initials,name,at,via,sig}}], signoffs:[], sent:[], super, signedAt }
     subm  [{id, number, rev, spec, item, desc, files, due, status, reviewer, comments, markup, submittedAt, returnedAt, superseded}]
     apprs [{id, number, subject, question, files, due, status, answer, answeredBy, answeredAt}]
   Every item the GC signs / answers goes through their portal link AND by e-mail (link + PDF) with office@ copied.
   ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
'use strict';
const JA = require('./job-auto.js');

/* RULES-BEGIN (the same code runs on the CRM page) */
var CC_BOOT = '2026-10-26';
function ccS(v){ return v == null ? '' : String(v).trim(); }
function ccLow(v){ return ccS(v).toLowerCase(); }
function ccNum(v){ var n = typeof v === 'number' ? v : parseFloat(ccS(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function ccArr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function coAmt(co){ return ccNum(co && (co.amt != null && co.amt !== '' ? co.amt : co.amount)); }
function coPid(co){ return ccS(co && (co.pid || co.projectId)); }
function coDead(co){ return !co || co.deleted === true || co._deleted === true || /^(void|voided|denied|declined|rejected|deleted|cancell?ed|withdrawn|superseded)$/i.test(ccS(co.status)); }
function coSigned(co){ return !!(co && (ccS(co.signedAt) || co.customerSigned === true || co.gcSigned === true)); }
function coNew(co){ var d = ccS(co && (co.createdAt || co.created || co.date)).slice(0, 10); return !!co && (co.commco === true || (!!d && d >= CC_BOOT)); }
function coWork(co){ return !!(ccS(co.desc || co.title || co.description) || coAmt(co)); }
/* this change order holds a commercial job: not signed, not voided / denied, made since COMMCO (a draft only with work in it) */
function coHolds(co){ return !coDead(co) && !coSigned(co) && coNew(co) && (ccLow(co.status) !== 'draft' || coWork(co)); }
/* the signature line: commercial — every one; everything else — over $2,500 (unchanged) */
function coSignLimit(commercial){ return commercial ? 0 : 2500; }
function coNeedsSign(commercial, co){ return commercial ? true : Math.abs(coAmt(co)) > 2500; }
/* the change order's number on its job: its own, else its place among the job's change orders (oldest = 1) */
function coNo(co, all){
  if (ccS(co.number || co.coNumber)) return ccS(co.number || co.coNumber);
  var mine = ccArr(all).filter(function(c){ return coPid(c) === coPid(co) && c.deleted !== true && !/^gcco_/.test(ccS(c.id)); })
    .sort(function(a, b){ var x = ccS(a.createdAt || a.created || a.date) + ccS(a.id), y = ccS(b.createdAt || b.created || b.date) + ccS(b.id); return x < y ? -1 : x > y ? 1 : 0; });
  var i = mine.findIndex(function(c){ return ccS(c.id) === ccS(co.id); });
  return String(i >= 0 ? i + 1 : mine.length + 1);
}
/* the hold: the job's own change orders (+ the GC portal's ones that are not on the job yet: requested / pricing / sent) */
function holdOf(commercial, pid, cos, remote){
  var out = { on: false, cos: [] };
  if (!commercial) return out;
  var mine = ccArr(cos).filter(function(c){ return coPid(c) === ccS(pid); });
  mine.filter(coHolds).forEach(function(c){ out.cos.push({ id: ccS(c.id), number: coNo(c, mine), title: ccS(c.desc || c.title || c.description).slice(0, 120), status: ccS(c.status) || 'pending' }); });
  ccArr(remote).forEach(function(r){ if (!out.cos.some(function(x){ return x.number === ccS(r.number) && x.title === ccS(r.title); })) out.cos.push({ id: ccS(r.id), number: ccS(r.number), title: ccS(r.title).slice(0, 120), status: ccS(r.status), remote: true }); });
  out.on = out.cos.length > 0;
  return out;
}
function holdText(h, gc){
  if (!h || !h.on) return '';
  var n = h.cos.map(function(c){ return '#' + c.number; });
  return '⛔ Work stopped — waiting on signed Change Order' + (n.length > 1 ? 's ' : ' ') + n.join(', ') + (ccS(gc) ? ' from ' + ccS(gc) : '');
}
/* the sub's words: never the price */
function holdSubText(h){ return h && h.on ? 'Stop: do not start the added work — job on hold until the change order is signed (' + h.cos.map(function(c){ return 'CO #' + c.number; }).join(', ') + ').' : ''; }
/* the materials checklist */
function lineSig(l){ return [l.product, l.spec, l.qty, l.where].map(ccLow).join('|'); }
function lineOk(l){ return !!(l && l.init && ccS(l.init.initials) && l.init.sig === lineSig(l)); }
function matsLive(m){ return ccArr(m && m.lines).filter(function(l){ return !l.removed; }); }
function matsPending(m){ return matsLive(m).filter(function(l){ return !lineOk(l); }); }
function matsSigned(m){ return !!(m && ccS(m.signedAt)); }
/* the start gate: a commercial job starts once every material is initialed and the checklist signed */
function startGate(commercial, m){
  if (!commercial) return { ok: true, pending: 0 };
  var live = matsLive(m), pend = matsPending(m);
  if (!live.length) return { ok: false, why: 'none', pending: 0, text: 'Materials approval not done — the GC superintendent initials the materials checklist before work starts.' };
  if (pend.length) return { ok: false, why: 'pending', pending: pend.length, text: pend.length + ' material' + (pend.length === 1 ? '' : 's') + ' awaiting super initials — the job cannot start until every material is initialed.' };
  if (!matsSigned(m)) return { ok: false, why: 'unsigned', pending: 0, text: 'The materials checklist is initialed but not signed by the GC superintendent yet.' };
  return { ok: true, pending: 0 };
}
/* GC-facing words never carry GrayCo's prices / costs */
function noMoney(t){ return ccS(t).replace(/\$\s?[\d,]+(?:\.\d+)?(?:\s*\/\s*[A-Za-z0-9 ]{1,14})?/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([·,;])/g, '$1').trim(); }
/* RULES-END */

const RULES = { CC_BOOT, coAmt, coPid, coDead, coSigned, coNew, coWork, coHolds, coSignLimit, coNeedsSign, coNo, holdOf, holdText, holdSubText, lineSig, lineOk, matsLive, matsPending, matsSigned, startGate, noMoney };

/* ── server side ───────────────────────────────────────────────────────────────────────────────────────────── */
let G = null, CORE = null, LIB = null;
function gcp(){ if (!G) G = require('./gcp.js'); return G; }
function core(){ if (!CORE) CORE = require('../portal.js')._core; return CORE; }
function L(){ if (!LIB) LIB = require('../bid-inbox.js')._lib; return LIB; }
const crypto = require('crypto');
function s(v){ return ccS(v); }
function low(v){ return ccLow(v); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x != null && x !== ''; }) : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function nowMs(){ const T = gcp().T; return T && T.now ? T.now() : Date.now(); }
function nowIso(){ return new Date(nowMs()).toISOString(); }
function ymd(v){ const t = s(v); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''; }
function uid(p){ return p + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }
function officeEmail(){ const v = low(process.env.OFFICE_EMAIL); return okEmail(v) ? v : 'office@grayco-cs.com'; }
const REF_RE = /^sb:crm-files\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/;

/* commercial — the AUTOCOM rule, with what the server knows of the customer (its type) */
function hintsOf(data, p){
  const n = low(p && (p.client || p.customer));
  const c = arr(data && data.customers).find(function(x){ return x && n && low(x.name || x.company) === n; });
  const h = {}; if (c && s(c.type)) h.custType = s(c.type);
  const ld = arr(data && data.leads).find(function(x){ return x && s(x.id) && s(x.id) === s(p.leadId || p.fromLeadId); });
  if (ld && (ld.bidDue || ld.bidNumber || /bid/i.test(s(ld.kind) + ' ' + s(ld.type) + ' ' + s(ld.source)))) h.bidLead = true;
  return h;
}
function isCommercial(data, p){ return !!p && JA.groupOf(p, hintsOf(data, p)) === 'commercial'; }
function crmCos(data){
  const seen = {}, out = [];
  ['cos', 'changeOrders'].forEach(function(k){ arr(data && data[k]).forEach(function(c){ const id = s(c.id); if (id && seen[id]) return; if (id) seen[id] = 1; out.push(c); }); });
  return out;
}
/* the GC portal's own change orders that are not on the job yet (asked / being priced / sent and not linked) */
function remoteHolds(st){
  return arr(st && st.cos).filter(function(c){ return !s(c.crmId) && !c.importedAt && /^(requested|pricing|sent)$/.test(s(c.status)); })
    .map(function(c){ return { id: s(c.id), number: s(c.number), title: s(c.title), status: s(c.status) }; });
}
/* a job change order the GC signed in the portal counts as signed here at once (the CRM takes it in a minute later) */
function withPortalSigns(cos, st){
  const signed = {}; arr(st && st.cos).forEach(function(c){ if (s(c.crmId) && c.status === 'signed') signed[s(c.crmId)] = c; });
  return cos.map(function(c){ const g = signed[s(c.id)]; return g && !coSigned(c) ? Object.assign({}, c, { signedAt: g.signedAt, gcSigned: true, signedBy: g.signedBy }) : c; });
}
function holdFor(data, p, st){
  return holdOf(isCommercial(data, p), p.id, withPortalSigns(crmCos(data), st), remoteHolds(st));
}

/* ── the store ── */
function blankMats(){ return { lines: [], signoffs: [], sent: [] }; }
function prep(st){
  st.mats = Object.assign(blankMats(), st.mats || {});
  st.subm = arr(st.subm); st.apprs = arr(st.apprs);
  st.seq = Object.assign({ pa: 0, co: 0, rfi: 0, sub: 0, appr: 0 }, st.seq || {});
  return st;
}
async function state(pid){ return prep(await gcp().jobState(pid)); }
function mutate(pid, fn){ return gcp().mutateJob(pid, function(st){ prep(st); return fn(st); }); }

/* ── views ── */
function lineOut(l){ return { id: s(l.id), product: clip(noMoney(l.product), 160), spec: clip(noMoney(l.spec), 200), qty: clip(noMoney(l.qty), 40), where: clip(noMoney(l.where), 120), src: clip(noMoney(l.src), 60), ok: lineOk(l),
  init: lineOk(l) ? { initials: s(l.init.initials), name: clip(l.init.name, 80), at: s(l.init.at) } : null, coId: s(l.coId) }; }
function matsOut(m){
  const live = matsLive(m);
  return { lines: live.map(lineOut), pending: matsPending(m).length, signedAt: s(m.signedAt), super: m.super ? { name: clip(m.super.name, 80), email: low(m.super.email) } : null,
    signoffs: arr(m.signoffs).map(function(x){ return { id: s(x.id), at: s(x.at), name: clip(x.name, 80), title: clip(x.title, 60), company: clip(x.company, 80), via: s(x.via), lines: arr(x.lines).length, hasPdf: !!x.pdfRef }; }) };
}
function fileOut(f){ return { id: s(f.id), name: clip(f.name, 120), kind: s(f.kind) }; }
function submOut(x){ return { id: s(x.id), number: s(x.number), rev: x.rev || 1, spec: clip(x.spec, 60), item: clip(noMoney(x.item), 160), desc: clip(noMoney(x.desc), 2000), due: ymd(x.due), status: s(x.status),
  reviewer: clip(x.reviewer, 80), comments: clip(x.comments, 3000), submittedAt: s(x.submittedAt), returnedAt: s(x.returnedAt), superseded: !!x.superseded,
  files: arr(x.files).map(fileOut), markup: x.markup ? fileOut(x.markup) : null }; }
function apprOut(x){ return { id: s(x.id), number: s(x.number), subject: clip(x.subject, 140), question: clip(noMoney(x.question), 3000), due: ymd(x.due), status: s(x.status), askedAt: s(x.askedAt), askedBy: clip(x.askedBy, 80),
  answer: clip(x.answer, 3000), answeredBy: clip(x.answeredBy, 80), answeredAt: s(x.answeredAt), files: arr(x.files).map(fileOut) }; }
const SUB_LABEL = { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', approved_as_noted: 'Approved as noted', revise: 'Revise & resubmit', rejected: 'Rejected' };
/* what the GC portal adds to the GC's view (gcp.gcView) */
async function viewExtra(data, p, st){
  prep(st);
  const commercial = isCommercial(data, p), h = holdFor(data, p, st), company = gcp().gcCompany(data, p);
  const signed = [];
  arr(st.mats.signoffs).forEach(function(x){ if (x.pdfRef) signed.push({ id: s(x.id), title: 'Materials approval — signed by ' + clip(x.name, 60), at: s(x.at) }); });
  arr(st.cos).forEach(function(c){ if (c.status === 'signed') signed.push({ id: '', title: 'Change order #' + s(c.number) + ' — signed by ' + clip(c.signedBy, 60), at: s(c.signedAt) }); });
  return { commercial: commercial,
    hold: { on: h.on, text: holdText(h, company), cos: h.cos.map(function(c){ return { number: c.number, title: c.title }; }) },
    mats: commercial || matsLive(st.mats).length ? matsOut(st.mats) : null,
    subm: st.subm.filter(function(x){ return x.status !== 'draft'; }).map(submOut),
    apprs: st.apprs.filter(function(x){ return x.status !== 'void'; }).map(apprOut),
    signedDocs: signed.sort(function(a, b){ return a.at < b.at ? 1 : -1; }).slice(0, 60) };
}
/* a file that belongs to this job's GC portal (nothing else can be opened from a GC link) */
function fileOf(st, id){
  prep(st); id = s(id); if (!id) return null;
  const so = st.mats.signoffs.find(function(x){ return s(x.id) === id && x.pdfRef; });
  if (so) return { ref: so.pdfRef, name: 'Materials approval ' + ymd(so.at) + '.pdf' };
  for (const x of st.subm) { for (const f of arr(x.files).concat(x.markup ? [x.markup] : [])) if (s(f.id) === id && REF_RE.test(s(f.ref))) return { ref: f.ref, name: f.name }; }
  for (const x of st.apprs) { for (const f of arr(x.files)) if (s(f.id) === id && REF_RE.test(s(f.ref))) return { ref: f.ref, name: f.name }; }
  return null;
}

/* ── e-mail: the GC contacts (+ office@ copied), from the PM's name ── */
async function mailGc(data, p, o){
  const Gp = gcp(), C = core(), pm = C.pmOf(data, p);
  const to = Array.from(new Set(arr(o.to).map(low).filter(okEmail))).slice(0, 6);
  if (!to.length) return { ok: false, error: 'No GC contact e-mail on this job — add the GC contacts (🏗 GC portal).' };
  const cc = Array.from(new Set(arr(o.cc).concat([officeEmail()]).map(low).filter(function(e){ return okEmail(e) && to.indexOf(e) < 0; }))).slice(0, 6);
  const replyTo = pm && okEmail(pm.email) ? pm.email : 'replies@grayco-cs.com';
  let html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.55">' + o.html + '</div>';
  try { html = await require('./brand.js').shellFor(html, { email: pm && pm.email, name: pm && pm.name }); } catch (e) {}
  const atts = [];
  for (const a of arr(o.attachments)) {
    try { if (a.content) atts.push({ filename: clip(a.name, 120), content: a.content }); else if (REF_RE.test(s(a.ref))) { const f = await fileAtt(a.ref, a.name); if (f) atts.push(f); } } catch (e) {}
  }
  let subject = o.subject; try { subject = C.withJob(o.subject, p); } catch (e) {}
  const payload = { from: (pm && pm.name ? clip(pm.name, 60) + ' — GrayCo Construction Services' : 'GrayCo Construction Services') + ' <portal@grayco-cs.com>', reply_to: replyTo, to: to, subject: subject, html: html };
  if (cc.length) payload.cc = cc;
  if (atts.length) payload.attachments = atts.slice(0, 6);
  const r = await resendSend(payload);
  return Object.assign({ to: to, cc: cc }, r);
}
async function resendSend(payload){
  const key = s(process.env.RESEND_API_KEY);
  if (!key || process.env.PORTAL_MAIL_OFF === '1' || process.env.PORTAL_MAIL_OFF === 'true') return { ok: false, skipped: true, error: 'E-mail is not set up (RESEND_API_KEY) or switched off.' };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { ok: r.ok, status: r.status, error: r.ok ? '' : 'The e-mail did not go out (' + r.status + ').' };
  } catch (e) { return { ok: false, error: 'The e-mail did not go out (no answer).' }; }
}
async function fileAtt(ref, name){
  const m = /^sb:crm-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/.exec(s(ref)); if (!m) return null;
  const r = await fetch(L().sbUrl() + '/storage/v1/object/crm-files/' + m[1], { headers: L().svcH() });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 12 * 1024 * 1024) return null;
  return { filename: clip(name || ('GrayCo ' + m[1].slice(-12)), 120), content: buf.toString('base64') };
}
async function upload(buf, ext){
  const hash = crypto.createHash('sha256').update(buf).digest('hex'), path = hash + '.' + ext;
  try {
    const r = await fetch(L().sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: Object.assign({}, L().svcH(), { 'Content-Type': ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg', 'x-upsert': 'true' }), body: buf });
    if (r.ok || r.status === 409) return 'sb:crm-files/' + path;
  } catch (e) {}
  return '';
}
/* the staff to tell (the job's PM + office@) */
async function tellTeam(data, p, subject, html){
  const C = core(), pm = C.pmOf(data, p);
  const to = [officeEmail()]; if (pm && okEmail(pm.email)) to.unshift(low(pm.email));
  let crm = 'https://crm.grayco-cs.com'; try { const v = s(process.env.CRM_URL || (process.env.SITE_ORIGIN || '').split(',')[0]).replace(/\/$/, ''); if (/^https:\/\//.test(v)) crm = v; } catch (e) {}
  let subj = subject; try { subj = require('./mailtag.js').tag(subject, to, 'gc portal'); } catch (e) {}
  return resendSend({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: Array.from(new Set(to)), subject: subj,
    html: '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.55">' + html + '<p><a href="' + esc(crm) + '/#job=' + encodeURIComponent(p.id) + '">Open the job in the CRM</a></p></div>', headers: { 'X-GrayCo-CRM': 'gc-portal' } });
}
function gcTo(data, p, kind){
  const list = gcp().contactsOf(data, p);
  const field = list.filter(function(x){ return x.role !== 'billing'; });
  if (kind === 'super') { const sp = field.filter(function(x){ return x.role === 'super'; }); if (sp.length) return sp.map(function(x){ return x.email; }); }
  return (field.length ? field : list).map(function(x){ return x.email; });
}
function btn(href, text){ return '<p style="margin:18px 0"><a href="' + esc(href) + '" style="background:#D4A017;color:#14202E;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">' + esc(text) + '</a></p>'; }
function para(t){ return '<p style="margin:0 0 12px">' + t + '</p>'; }

/* ── the PDF (centered logo header — the selections signed-copy writer) ── */
function matsPdf(p, company, so, title){
  const sel = require('../selections.js')._sel;
  const b = [{ t: 'title', text: 'GrayCo Construction Services' }, { t: 'p', text: title || 'Materials approval — initialed by the GC superintendent', bold: true }, { t: 'gap', h: 4 },
    { t: 'p', text: 'Project: ' + s(p.name) + (s(p.autoPO || p.po) ? '   ·   PO ' + s(p.autoPO || p.po) : '') }, s(p.address) ? { t: 'p', text: 'Address: ' + s(p.address) } : null,
    company ? { t: 'p', text: 'General contractor: ' + company } : null, { t: 'gap', h: 6 }, { t: 'h', text: 'Materials' }].filter(Boolean);
  arr(so.lines).forEach(function(l, i){
    b.push({ t: 'row', left: (i + 1) + '. ' + noMoney(l.product) + (s(l.spec) ? ' — ' + noMoney(l.spec) : ''), right: [s(l.qty) ? 'Qty ' + noMoney(l.qty) : '', s(l.where) ? noMoney(l.where) : '', l.initials ? 'Initials: ' + s(l.initials) : 'Initials: ______'].filter(Boolean).join(' · ') });
  });
  b.push({ t: 'gap', h: 10 });
  if (so.name) {
    b.push({ t: 'p', text: 'I reviewed the materials listed above for this project and initialed each one. GrayCo Construction Services may install them as listed. Materials added or changed later are reviewed and initialed before they are installed.' });
    b.push({ t: 'sig', strokes: arr(so.strokes), name: s(so.name) });
    b.push({ t: 'p', text: 'Signed: ' + s(so.name) + (s(so.title) ? ', ' + s(so.title) : '') + (s(so.company) ? ' — ' + s(so.company) : ''), bold: true });
    b.push({ t: 'p', text: 'Date / time: ' + central(so.at) + (so.via === 'onsite' ? ' — on site, on GrayCo\'s device' : ' — through the GC project page') + (so.photoRef ? ' · photo of the material labels kept with the job record' : ''), size: 9, muted: true });
  } else b.push({ t: 'p', text: 'For the GC superintendent\'s initials and signature before installation.', size: 9, muted: true });
  return sel.buildPdf(b);
}
function central(iso){ try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' (Central)'; } catch (e) { return s(iso); } }
function wallHour(t){ try { return +new Date(t).toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }) % 24; } catch (e) { return 12; } }

/* ── STAFF: the materials checklist ── */
function cleanLine(x, old){
  const l = { id: s(x.id) && /^[A-Za-z0-9_.:-]{1,60}$/.test(s(x.id)) ? s(x.id) : uid('ML'), product: clip(noMoney(x.product), 160), spec: clip(noMoney(x.spec), 200), qty: clip(noMoney(x.qty), 40), where: clip(noMoney(x.where), 120),
    src: clip(noMoney(x.src), 60), coId: clip(x.coId, 80), addedAt: (old && old.addedAt) || nowIso(), addedBy: (old && old.addedBy) || clip(x.addedBy, 80) };
  if (old && old.init) l.init = old.init;   /* initials stay with the line; a changed line shows as needing new ones (sig) */
  return l;
}
async function matsSave(data, p, b, who){
  const lines = arr(b.lines).slice(0, 400);
  if (!lines.every(function(x){ return s(x.product); })) return { code: 400, out: { ok: false, error: 'Every material needs a product.' } };
  const m = await mutate(p.id, function(st){
    const old = {}; st.mats.lines.forEach(function(l){ old[s(l.id)] = l; });
    const next = lines.map(function(x){ return cleanLine(x, old[s(x.id)]); });
    const keep = {}; next.forEach(function(l){ keep[l.id] = 1; });
    st.mats.lines.forEach(function(l){ if (!keep[s(l.id)] && l.init) next.push(Object.assign({}, l, { removed: true, removedAt: nowIso() })); });   /* an initialed line stays on record */
    st.mats.lines = next; st.mats.updatedAt = nowIso(); st.mats.updatedBy = who.email;
    st.log = arr(st.log).concat([{ at: nowIso(), who: who.email, what: 'Materials checklist saved (' + matsLive(st.mats).length + ' lines)' }]);
    return Object.assign({}, st.mats);
  });
  return { code: 200, out: { ok: true, mats: matsOut(m), raw: m } };
}
/* add lines (a change order or an approved submittal brings new materials) — no initials yet */
async function matsAdd(pid, lines, by){
  return mutate(pid, function(st){
    const have = {}; st.mats.lines.forEach(function(l){ have[lineSig(l)] = 1; });
    let n = 0;
    arr(lines).forEach(function(x){ const l = cleanLine(x, null); l.addedBy = clip(by, 80); if (!l.product || have[lineSig(l)]) return; have[lineSig(l)] = 1; st.mats.lines.push(l); n++; });
    if (!n) return undefined;
    st.mats.updatedAt = nowIso(); return n;
  });
}
async function matsSend(data, p, b, who){
  const sup = { name: clip(b.name, 80), email: low(b.email) };
  let to = okEmail(sup.email) ? [sup.email] : gcTo(data, p, 'super');
  if (!to.length) return { code: 400, out: { ok: false, error: 'Enter the superintendent\'s e-mail (or add the GC contacts).' } };
  const st = await state(p.id);
  if (!matsLive(st.mats).length) return { code: 400, out: { ok: false, error: 'Add the materials first.' } };
  const Gp = gcp(), tok = await Gp.createLink(p.id, 'materials checklist'), company = Gp.gcCompany(data, p);
  const pend = matsPending(st.mats);
  const pdf = matsPdf(p, company, { lines: matsLive(st.mats).map(function(l){ return Object.assign({}, l, { initials: lineOk(l) ? l.init.initials : '' }); }) }, 'Materials for approval — to be initialed by the GC superintendent');
  const html = para('Hello' + (sup.name ? ' ' + esc(sup.name.split(' ')[0]) : '') + ',')
    + para('Before we install materials on <b>' + esc(p.name) + '</b>, please review and initial each material on our checklist (' + pend.length + ' waiting for your initials), then sign at the bottom. It takes a minute on your phone.')
    + btn(Gp.gcLink(tok, 'mats=1'), 'Review & initial the materials') + para('The checklist is attached as a PDF too. Questions? Just reply to this e-mail.');
  const r = await mailGc(data, p, { to: to, subject: 'Materials approval — please initial before installation', html: html, attachments: [{ name: 'Materials for approval - ' + clip(s(p.name).replace(/[^A-Za-z0-9 .,&-]/g, ''), 50) + '.pdf', content: pdf.toString('base64') }] });
  await mutate(p.id, function(st2){ if (okEmail(sup.email)) st2.mats.super = sup; st2.mats.sent.push({ at: nowIso(), to: r.to || to, by: who.email, ok: !!r.ok }); st2.mats.sent = st2.mats.sent.slice(-30); return true; });
  return { code: 200, out: { ok: true, mailed: !!r.ok, to: r.to || to, cc: r.cc || [], mailError: r.ok ? '' : r.error, url: Gp.gcLink(tok, 'mats=1') } };
}
function cleanInit(v){ return s(v).replace(/[^A-Za-z.\-]/g, '').toUpperCase().slice(0, 5); }
function cleanStrokes(v){
  return (Array.isArray(v) ? v : []).slice(0, 40).map(function(st){
    return (Array.isArray(st) ? st : []).slice(0, 600).map(function(pt){ const x = Number(Array.isArray(pt) ? pt[0] : NaN), y = Number(Array.isArray(pt) ? pt[1] : NaN);
      return isFinite(x) && isFinite(y) ? [Math.round(Math.max(0, Math.min(600, x)) * 10) / 10, Math.round(Math.max(0, Math.min(200, y)) * 10) / 10] : null; }).filter(Boolean);
  }).filter(function(st){ return st.length; });
}
/* the super initials + signs (on site on GrayCo's device: via 'onsite'; through the link: via 'link') */
async function matsSign(data, p, b, via, by, ip){
  const name = clip(s(b.name).replace(/[<>]/g, ''), 80), strokes = cleanStrokes(b.strokes);
  if (name.length < 2) return { code: 400, out: { ok: false, error: 'Type the superintendent\'s name.' } };
  if (!strokes.length) return { code: 400, out: { ok: false, error: 'Sign in the box at the bottom.' } };
  const ini = b.initials && typeof b.initials === 'object' ? b.initials : {};
  const photoRef = REF_RE.test(s(b.photoRef)) ? s(b.photoRef) : '';
  let so = null, missing = [];
  await mutate(p.id, function(st){
    const pend = matsPending(st.mats); if (!matsLive(st.mats).length) { missing = ['(no materials)']; return undefined; }
    missing = pend.filter(function(l){ return cleanInit(ini[l.id]).length < 2; }).map(function(l){ return l.product; });
    if (missing.length) return undefined;
    const at = nowIso(), done = [];
    pend.forEach(function(l){ l.init = { initials: cleanInit(ini[l.id]), name: name, at: at, via: via, sig: lineSig(l) }; done.push({ id: l.id, product: l.product, spec: l.spec, qty: l.qty, where: l.where, initials: l.init.initials }); });
    if (!done.length && matsSigned(st.mats)) { missing = []; so = { already: true }; return undefined; }
    so = { id: uid('MSO'), at: at, name: name, title: clip(b.title, 60), company: clip(b.company, 80), email: okEmail(b.email) ? low(b.email) : '', via: via, by: clip(by, 120), ip: clip(ip, 60),
      lines: done.length ? done : matsLive(st.mats).map(function(l){ return { id: l.id, product: l.product, spec: l.spec, qty: l.qty, where: l.where, initials: l.init.initials }; }), strokes: strokes, photoRef: photoRef };
    st.mats.signoffs.push(so); st.mats.signoffs = st.mats.signoffs.slice(-60);
    if (!st.mats.signedAt) st.mats.signedAt = at; st.mats.lastSignedAt = at;
    if (so.email && !st.mats.super) st.mats.super = { name: name, email: so.email };
    st.log = arr(st.log).concat([{ at: at, who: name + ' (GC super, ' + via + ')', what: 'Initialed ' + so.lines.length + ' material' + (so.lines.length === 1 ? '' : 's') + ' and signed' }]);
    return true;
  });
  if (missing.length) return { code: 400, out: { ok: false, error: 'Initial every material first: ' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? ' …' : ''), missing: missing } };
  if (so && so.already) return { code: 200, out: { ok: true, already: true } };
  const Gp = gcp(), company = clip(b.company, 80) || Gp.gcCompany(data, p);
  const pdf = matsPdf(p, company, so);
  const ref = await upload(pdf, 'pdf');
  await mutate(p.id, function(st){ const x = st.mats.signoffs.find(function(y){ return y.id === so.id; }); if (x) x.pdfRef = ref; return true; });
  so.pdfRef = ref;
  const sup = so.email || (b.email && okEmail(b.email) ? low(b.email) : '');
  const fname = 'Materials approval - ' + clip(s(p.name).replace(/[^A-Za-z0-9 .,&-]/g, ''), 50) + ' - ' + so.at.slice(0, 10) + '.pdf';
  const mail = sup ? await mailGc(data, p, { to: [sup], subject: 'Signed: materials approval', html: para('Hello ' + esc(name.split(' ')[0]) + ',') + para('Thank you — here is your copy of the materials checklist you initialed and signed for <b>' + esc(p.name) + '</b> (' + so.lines.length + ' material' + (so.lines.length === 1 ? '' : 's') + ').') + para('Materials added or changed later come back to you for initials before they are installed.'), attachments: [{ name: fname, content: pdf.toString('base64') }] })
    : await resendSend({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: [officeEmail()], subject: 'Signed: materials approval — ' + s(p.name), html: para(esc(name) + ' initialed and signed the materials checklist for <b>' + esc(p.name) + '</b> (no superintendent e-mail on file — the copy is attached; send it to them).'), attachments: [{ filename: fname, content: pdf.toString('base64') }] });
  try { await tellTeam(data, p, '✅ Materials approved by ' + name + ' — ' + s(p.name), para('<b>' + esc(name) + '</b>' + (so.title ? ' (' + esc(so.title) + ')' : '') + ' initialed ' + so.lines.length + ' material' + (so.lines.length === 1 ? '' : 's') + ' and signed the checklist for <b>' + esc(p.name) + '</b> ' + (via === 'onsite' ? 'on site' : 'through the GC project page') + '. The signed PDF is on the job\'s documents.')); } catch (e) {}
  const st = await state(p.id);
  return { code: 200, out: { ok: true, signoff: { id: so.id, at: so.at, name: so.name, lines: so.lines.length, pdfRef: ref, fileName: fname }, mats: matsOut(st.mats), raw: st.mats, mailed: !!mail.ok, mailTo: mail.to || [], mailCc: mail.cc || [] } };
}

/* ── submittals ── */
const DECISIONS = { approved: 1, approved_as_noted: 1, revise: 1, rejected: 1 };
function cleanFiles(v){ return arr(v).slice(0, 12).filter(function(f){ return REF_RE.test(s(f.ref)); }).map(function(f){ return { id: s(f.id) || uid('F'), ref: s(f.ref), name: clip(f.name, 120) || 'file', kind: /^(product|shop|sample|other)$/.test(s(f.kind)) ? s(f.kind) : 'other' }; }); }
async function submSave(data, p, b, who){
  const item = clip(b.item, 160); if (!item) return { code: 400, out: { ok: false, error: 'What is the submittal for? (item / description)' } };
  const x = await mutate(p.id, function(st){
    let r = s(b.id) ? st.subm.find(function(y){ return y.id === s(b.id); }) : null;
    if (r && r.status !== 'draft') throw new Error('Submittal #' + r.number + ' was already submitted — use Resubmit for a new revision.');
    if (!r) { st.seq.sub = (st.seq.sub || 0) + 1; r = { id: uid('SUB'), number: String(st.seq.sub).padStart(3, '0'), rev: 1, status: 'draft', createdAt: nowIso(), createdBy: who.email, history: [] }; st.subm.push(r); }
    Object.assign(r, { spec: clip(b.spec, 60), item: item, desc: clip(b.desc, 3000), due: ymd(b.due), files: cleanFiles(b.files), updatedAt: nowIso() });
    st.log = arr(st.log).concat([{ at: nowIso(), who: who.email, what: 'Submittal #' + r.number + ' rev ' + r.rev + ' saved (draft)' }]);
    return Object.assign({}, r);
  });
  if (b.submit === true) return submSubmit(data, p, { id: x.id }, who);
  return { code: 200, out: { ok: true, submittal: x } };
}
async function submSubmit(data, p, b, who){
  const x = await mutate(p.id, function(st){
    const r = st.subm.find(function(y){ return y.id === s(b.id); }); if (!r) return null;
    if (r.status !== 'draft') throw new Error('Submittal #' + r.number + ' is already ' + (SUB_LABEL[r.status] || r.status).toLowerCase() + '.');
    r.status = 'submitted'; r.submittedAt = nowIso(); r.submittedBy = who.email; r.history = arr(r.history).concat([{ at: r.submittedAt, what: 'submitted', by: who.email }]);
    st.log = arr(st.log).concat([{ at: nowIso(), who: who.email, what: 'Submittal #' + r.number + ' rev ' + r.rev + ' submitted to the GC' }]);
    return Object.assign({}, r);
  });
  if (!x) return { code: 404, out: { ok: false, error: 'No such submittal.' } };
  const Gp = gcp(), tok = await Gp.createLink(p.id, 'submittal ' + x.number);
  const html = para('Hello,') + para('GrayCo Construction Services submits <b>submittal #' + esc(x.number) + (x.rev ? ' rev ' + x.rev : '') + '</b> for <b>' + esc(p.name) + '</b> for your review:')
    + '<div style="border-left:4px solid #D4A017;padding:8px 14px;margin:8px 0 14px;background:#FBF9F4"><b>' + esc(x.item) + '</b>' + (x.spec ? '<br>Spec section: ' + esc(x.spec) : '') + (x.desc ? '<br>' + esc(noMoney(x.desc)).replace(/\n/g, '<br>') : '') + (x.due ? '<br><b>Review needed by:</b> ' + esc(x.due) : '') + '</div>'
    + para('Approve, approve as noted, return for revision or reject on your project page (you can upload a marked-up copy there):') + btn(Gp.gcLink(tok, 'sub=' + x.id), 'Review submittal #' + x.number) + para('The files are attached. Questions? Just reply to this e-mail.');
  const r = await mailGc(data, p, { to: gcTo(data, p), subject: 'Submittal #' + x.number + (x.rev ? ' rev ' + x.rev : '') + ' for review — ' + x.item, html: html, attachments: arr(x.files).slice(0, 5).map(function(f){ return { ref: f.ref, name: f.name }; }) });
  return { code: 200, out: { ok: true, submittal: x, mailed: !!r.ok, mailTo: r.to || [], mailCc: r.cc || [], mailError: r.ok ? '' : r.error } };
}
async function submResubmit(data, p, b, who){
  const x = await mutate(p.id, function(st){
    const r = st.subm.find(function(y){ return y.id === s(b.id); }); if (!r) return null;
    if (!/^(revise|rejected)$/.test(r.status)) throw new Error('Only a submittal returned for revision (or rejected) is resubmitted.');
    if (r.superseded) throw new Error('Rev ' + r.rev + ' was already resubmitted.');
    r.superseded = true;
    const n = { id: uid('SUB'), number: r.number, rev: (r.rev || 1) + 1, status: 'draft', spec: r.spec, item: clip(b.item, 160) || r.item, desc: clip(b.desc != null ? b.desc : r.desc, 3000), due: ymd(b.due) || r.due,
      files: arr(b.files).length ? cleanFiles(b.files) : arr(r.files), prevId: r.id, createdAt: nowIso(), createdBy: who.email, history: [] };
    st.subm.push(n);
    st.log = arr(st.log).concat([{ at: nowIso(), who: who.email, what: 'Submittal #' + r.number + ' rev ' + n.rev + ' made (resubmittal)' }]);
    return n;
  });
  if (!x) return { code: 404, out: { ok: false, error: 'No such submittal.' } };
  if (b.submit !== false) return submSubmit(data, p, { id: x.id }, who);
  return { code: 200, out: { ok: true, submittal: x } };
}
async function storePublicFile(f){
  if (!f || typeof f !== 'object' || !s(f.data)) return null;
  const type = low(f.type), ext = /pdf/.test(type) ? 'pdf' : /png/.test(type) ? 'png' : /jpe?g/.test(type) ? 'jpg' : '';
  if (!ext) throw new Error('Upload a PDF, JPG or PNG.');
  const buf = Buffer.from(s(f.data).replace(/^data:[^,]*,/, ''), 'base64');
  if (!buf.length || buf.length > 4.5 * 1024 * 1024) throw new Error('The file is too big (4.5 MB at most here — e-mail a bigger one).');
  const ref = await upload(buf, ext); if (!ref) throw new Error('The file could not be stored — please try again.');
  return { id: uid('F'), ref: ref, name: clip(s(f.name).replace(/[<>]/g, ''), 120) || 'markup.' + ext, kind: 'markup' };
}
async function gcSubmReview(data, p, b, ip){
  const name = clip(s(b.name).replace(/[<>]/g, ''), 80), dec = s(b.decision), comment = clip(b.comment, 3000);
  if (name.length < 2) return { code: 400, out: { ok: false, error: 'Type your name.' } };
  if (!DECISIONS[dec]) return { code: 400, out: { ok: false, error: 'Pick a decision.' } };
  if (dec !== 'approved' && !comment) return { code: 400, out: { ok: false, error: 'Add your comments (what to note or change).' } };
  let markup = null; try { markup = await storePublicFile(b.file); } catch (e) { return { code: 400, out: { ok: false, error: e.message } }; }
  const x = await mutate(p.id, function(st){
    const r = st.subm.find(function(y){ return y.id === s(b.id); }); if (!r || r.status !== 'submitted') return null;
    r.status = dec; r.reviewer = name; r.comments = comment; r.returnedAt = nowIso(); r.reviewIp = clip(ip, 60); if (markup) r.markup = markup;
    r.history = arr(r.history).concat([{ at: r.returnedAt, what: dec, by: name + ' (GC)' }]);
    st.log = arr(st.log).concat([{ at: r.returnedAt, who: name + ' (GC)', what: 'Submittal #' + r.number + ' rev ' + r.rev + ': ' + SUB_LABEL[dec] }]);
    return Object.assign({}, r);
  });
  if (!x) return { code: 409, out: { ok: false, error: 'That submittal is not waiting for a review.' } };
  /* approved / approved as noted: the material goes onto the materials checklist (the super still initials it) */
  let fed = 0;
  if ((dec === 'approved' || dec === 'approved_as_noted') && isCommercial(data, p)) {
    try { fed = (await matsAdd(p.id, [{ product: x.item, spec: [x.spec ? 'Spec ' + x.spec : '', dec === 'approved_as_noted' ? 'as noted: ' + comment : ''].filter(Boolean).join(' · '), src: 'Submittal #' + x.number + (x.rev ? ' rev ' + x.rev : '') }], 'submittal')) || 0; } catch (e) {}
  }
  try { await tellTeam(data, p, (dec === 'approved' || dec === 'approved_as_noted' ? '✅ ' : '↩️ ') + 'Submittal #' + x.number + (x.rev ? ' rev ' + x.rev : '') + ': ' + SUB_LABEL[dec] + ' — ' + s(p.name),
    para('<b>' + esc(name) + '</b> reviewed submittal <b>#' + esc(x.number) + (x.rev ? ' rev ' + x.rev : '') + ' — ' + esc(x.item) + '</b>: <b>' + SUB_LABEL[dec] + '</b>.') + (comment ? para('Comments: ' + esc(comment).replace(/\n/g, '<br>')) : '') + (markup ? para('A marked-up copy was uploaded (on the job → 🏗 GC portal → Submittals).') : '') + (dec === 'revise' || dec === 'rejected' ? para('Resubmit it from the job (🏗 GC portal → Submittals → Resubmit) — it becomes rev ' + ((x.rev || 1) + 1) + '.') : '') + (fed ? para('The material was added to the materials checklist for the superintendent\'s initials.') : '')); } catch (e) {}
  return { code: 200, out: { ok: true, submittal: submOut(x), fedMaterials: fed } };
}

/* ── approval requests (RFI-style question / approval with an attachment) ── */
async function apprNew(data, p, b, who){
  const subject = clip(b.subject, 140), question = clip(b.question, 4000);
  if (!subject || !question) return { code: 400, out: { ok: false, error: 'An approval request needs a subject and the question.' } };
  const x = await mutate(p.id, function(st){
    st.seq.appr = (st.seq.appr || 0) + 1;
    const r = { id: uid('APR'), number: String(st.seq.appr).padStart(3, '0'), subject: subject, question: question, due: ymd(b.due), files: cleanFiles(b.files), status: 'open', askedAt: nowIso(), askedBy: who.name || who.email, askedByEmail: who.email };
    st.apprs.push(r); st.log = arr(st.log).concat([{ at: nowIso(), who: who.email, what: 'Approval request #' + r.number + ' sent: ' + subject }]);
    return r;
  });
  const Gp = gcp(), tok = await Gp.createLink(p.id, 'approval ' + x.number);
  const html = para('Hello,') + para('GrayCo Construction Services needs your approval on <b>' + esc(p.name) + '</b>:')
    + '<div style="border-left:4px solid #D4A017;padding:8px 14px;margin:8px 0 14px;background:#FBF9F4"><b>Approval request #' + esc(x.number) + ' — ' + esc(subject) + '</b><br>' + esc(noMoney(question)).replace(/\n/g, '<br>') + (x.due ? '<br><br><b>Needed by:</b> ' + esc(x.due) : '') + '</div>'
    + para('Approve, decline or answer on your project page:') + btn(Gp.gcLink(tok, 'ap=' + x.id), 'Answer approval request #' + x.number) + para('Or just reply to this e-mail.');
  const r = await mailGc(data, p, { to: gcTo(data, p), subject: 'Approval request #' + x.number + ' — ' + subject, html: html, attachments: arr(x.files).slice(0, 5).map(function(f){ return { ref: f.ref, name: f.name }; }) });
  return { code: 200, out: { ok: true, approval: x, mailed: !!r.ok, mailTo: r.to || [], mailCc: r.cc || [], mailError: r.ok ? '' : r.error } };
}
async function apprAnswer(data, p, b, by, via){
  const dec = /^(approved|declined|answered)$/.test(s(b.decision)) ? s(b.decision) : 'answered', answer = clip(b.answer, 4000);
  if (s(by).length < 2) return { code: 400, out: { ok: false, error: 'Type your name.' } };
  if (dec !== 'approved' && !answer) return { code: 400, out: { ok: false, error: 'Type your answer.' } };
  const x = await mutate(p.id, function(st){ const r = st.apprs.find(function(y){ return y.id === s(b.id); }); if (!r || r.status !== 'open') return null;
    r.status = dec; r.answer = answer; r.answeredBy = clip(by, 80); r.answeredAt = nowIso(); r.answeredVia = via; st.log = arr(st.log).concat([{ at: r.answeredAt, who: clip(by, 80), what: 'Approval request #' + r.number + ': ' + dec }]); return Object.assign({}, r); });
  if (!x) return { code: 409, out: { ok: false, error: 'That request is not open.' } };
  try { await tellTeam(data, p, (dec === 'declined' ? '↩️ ' : '✅ ') + 'Approval request #' + x.number + ' ' + dec + ' — ' + s(p.name), para('<b>' + esc(x.answeredBy) + '</b> ' + dec + ' approval request <b>#' + esc(x.number) + ' — ' + esc(x.subject) + '</b>' + (answer ? ':' : '.')) + (answer ? para(esc(answer).replace(/\n/g, '<br>')) : '')); } catch (e) {}
  return { code: 200, out: { ok: true, approval: apprOut(x) } };
}

/* ── change orders: a commercial job's change order goes to the GC portal (priced → ✅ Approvals → the GC signs) ── */
async function coPush(data, p, b, who){
  const crmId = s(b.crmId); if (!/^[A-Za-z0-9_.:-]{1,90}$/.test(crmId)) return { code: 400, out: { ok: false, error: 'Bad change order.' } };
  const st = await state(p.id), have = arr(st.cos).find(function(c){ return s(c.crmId) === crmId; });
  if (have && /^(signed|void)$/.test(s(have.status))) return { code: 200, out: { ok: true, already: true, co: have } };
  if (have && have.status !== 'pricing' && have.status !== 'sent' && have.status !== 'requested') return { code: 200, out: { ok: true, already: true, co: have } };
  if (have && have.status === 'sent' && Math.round(coAmt(have) * 100) === Math.round(ccNum(b.amount) * 100) && s(have.title) === clip(b.title, 120)) return { code: 200, out: { ok: true, already: true, co: have } };
  return gcp().coPrice(data, p, Object.assign({}, b, { id: have ? have.id : '', crmId: crmId, allowZero: true }), who);
}
/* the GC signed a change order: the PM + office@ hear whether the job can continue */
async function onCoSigned(data, p, co){
  if (!isCommercial(data, p)) return null;
  const st = await state(p.id), h = holdFor(data, p, st);
  const others = h.cos.filter(function(c){ return !(s(c.id) === s(co.crmId) || (c.remote && s(c.id) === s(co.id))); });
  const subj = others.length ? 'CO #' + co.number + ' signed — still on hold for CO ' + others.map(function(c){ return '#' + c.number; }).join(', ') : 'CO #' + co.number + ' signed — job can continue';
  return tellTeam(data, p, '✍️ ' + subj + ' — ' + s(p.name), para('<b>' + esc(co.signedBy) + '</b> signed change order <b>#' + esc(co.number) + '</b> “' + esc(co.title) + '” on <b>' + esc(p.name) + '</b> through the GC portal.') + para(others.length ? 'The job stays on hold until change order ' + others.map(function(c){ return '#' + c.number; }).join(', ') + ' is signed too.' : 'Nothing else is waiting: <b>the job can continue</b> (the hold is lifted on the job, the crew and sub views).'));
}

/* ── the CRM's minute pull: materials snapshots, signed checklist PDFs to file, the GC portal's own open change orders ── */
async function pull(data, pids){
  const jobs = (await L().kvGet(gcp().K_JOBS)) || {}, out = {};
  const want = arr(pids).length ? pids.map(String) : Object.keys(jobs);
  want.slice(0, 400).forEach(function(pid){
    const st0 = jobs[pid]; if (!st0) return; const st = prep(Object.assign({}, st0));
    const p = core().findProject(data, pid); if (!p) return;
    const rec = {};
    if (st.mats.lines.length || st.mats.signoffs.length) rec.mats = st.mats;
    const rh = remoteHolds(st); if (rh.length) rec.remote = rh;
    rec.subm = { open: st.subm.filter(function(x){ return x.status === 'submitted'; }).length, back: st.subm.filter(function(x){ return /^(revise|rejected)$/.test(x.status) && !x.superseded; }).length };
    rec.apprs = { open: st.apprs.filter(function(x){ return x.status === 'open'; }).length };
    rec.files = st.mats.signoffs.filter(function(x){ return x.pdfRef && !x.filedAt; }).map(function(x){ return { id: x.id, ref: x.pdfRef, at: x.at, name: x.name, photoRef: x.photoRef || '' }; });
    out[pid] = rec;
  });
  return out;
}
async function filed(pid, ids){
  ids = Array.isArray(ids) ? ids.map(s) : [];
  return mutate(pid, function(st){ let n = 0; st.mats.signoffs.forEach(function(x){ if (ids.indexOf(s(x.id)) >= 0 && !x.filedAt) { x.filedAt = nowIso(); n++; } }); return n ? n : undefined; });
}

/* ── hourly: unsigned commercial change orders (24 h, then daily) and overdue submittals → the GC ── */
async function reminders(opts){
  opts = opts || {};
  const t = nowMs(), hour = wallHour(t);
  if (!opts.force && (hour < 8 || hour >= 18)) return { skipped: 'outside 8 AM – 6 PM Central' };
  let data = {}; try { data = await core().crmData(true); } catch (e) { return { error: 'crm data' }; }
  const jobs = (await L().kvGet(gcp().K_JOBS)) || {}, Gp = gcp(), today = new Date(t).toISOString().slice(0, 10);
  const due = [];
  Object.keys(jobs).forEach(function(pid){
    const st = prep(Object.assign({}, jobs[pid])), p = core().findProject(data, pid);
    if (!p || /lost|dead|cancel|closed|complete/i.test(s(p.status)) || !isCommercial(data, p)) return;
    arr(st.cos).forEach(function(c){ if (c.status !== 'sent' || !c.sentAt) return; const last = Date.parse(c.remindedAt || c.sentAt) || 0; if (t - last >= 24 * 3600e3 - 5 * 60e3) due.push({ pid: pid, p: p, kind: 'co', x: c }); });
    st.subm.forEach(function(x){ if (x.status !== 'submitted' || !x.due || x.due >= today) return; const last = Date.parse(x.remindedAt || 0) || 0; if (t - last >= 24 * 3600e3 - 5 * 60e3) due.push({ pid: pid, p: p, kind: 'sub', x: x }); });
  });
  let sent = 0;
  for (const d of due.slice(0, 40)) {
    const tok = await Gp.createLink(d.pid, 'reminder');
    let r;
    if (d.kind === 'co') {
      r = await mailGc(data, d.p, { to: s(d.x.sentTo) ? [d.x.sentTo] : gcTo(data, d.p), cc: gcTo(data, d.p), subject: 'Reminder: change order #' + d.x.number + ' waiting for your signature',
        html: para('Hello,') + para('A reminder: GrayCo Construction Services\' change order <b>#' + esc(d.x.number) + '</b> “' + esc(d.x.title) + '” on <b>' + esc(d.p.name) + '</b> is waiting for your signature. Work on the added scope is stopped until it is signed.') + btn(Gp.gcLink(tok, 'co=' + d.x.id), 'Review & sign change order #' + d.x.number) + para('Questions? Just reply to this e-mail.') });
    } else {
      r = await mailGc(data, d.p, { to: gcTo(data, d.p), subject: 'Reminder: submittal #' + d.x.number + (d.x.rev ? ' rev ' + d.x.rev : '') + ' review was due ' + d.x.due,
        html: para('Hello,') + para('A reminder: submittal <b>#' + esc(d.x.number) + (d.x.rev ? ' rev ' + d.x.rev : '') + ' — ' + esc(d.x.item) + '</b> on <b>' + esc(d.p.name) + '</b> was due back on ' + esc(d.x.due) + '.') + btn(Gp.gcLink(tok, 'sub=' + d.x.id), 'Review submittal #' + d.x.number) });
    }
    if (r && r.ok) sent++;
    await mutate(d.pid, function(st){ const list = d.kind === 'co' ? st.cos : st.subm; const x = list.find(function(y){ return y.id === d.x.id; }); if (!x) return undefined; x.remindedAt = nowIso(); x.reminders = (x.reminders || 0) + 1; return true; });
  }
  return { due: due.length, sent: sent };
}

module.exports = Object.assign({}, RULES, { RULES, isCommercial, hintsOf, crmCos, remoteHolds, withPortalSigns, holdFor, state, mutate, prep, matsOut, submOut, apprOut, viewExtra, fileOf,
  matsSave, matsAdd, matsSend, matsSign, matsPdf, submSave, submSubmit, submResubmit, gcSubmReview, apprNew, apprAnswer, coPush, onCoSigned, pull, filed, reminders, officeEmail, mailGc, SUB_LABEL });
