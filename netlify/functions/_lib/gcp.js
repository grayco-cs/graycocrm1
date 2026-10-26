/* ── GrayCo — GC / OWNER PORTAL, company documents, customer-portal extras (patch GCP) ──────────────────────────
   Owner (10/21): "For GCs: yes 1, 2, 3, 4 — but they probably won't do portal stuff, so all of that can also be
   from auto e-mail too, for jobs we are required to do payments like that, or anything from any GC we work for.
   No 5. Yes 6: have all that current on the GC portal where they can download my documents."
   Plus: the customer portal like an app on the phone; the warranty registry; a mid-job check-in; the spring / fall
   roof inspection offer; the PM workload panel (the page's part).

   A GC JOB = a job GrayCo is hired on by a GC / company: project.gcJob === true, or its customer is a GC account
   (customers[].type === 'gc'). Its contacts: project.gcContacts [{ name, email, role: billing|pm|super|other }]
   (kept on the job in the CRM) + the GC account's accounts-payable contact (gcInfo.billingEmail / billingContact)
   + the job's GC e-mail (gcEmail / gcContact).

   Everything works BOTH in the GC's portal link (portal.grayco-cs.com/#g=<code>) AND by e-mail:
     1. the link: schedule, updates (the same approved posts the customer portal shows), curated photos, the documents
     2. pay apps: the PM adds the pay app (number, period, amount, retainage, the PDF) → ✅ Approvals (PM, then an
        admin: it is money) → e-mailed to the GC's billing contact with the PDF and a link straight to "Approve"
        → sent / approved (by whom) / paid. A pay app made by the CRM's own pay-app builder can be sent the same way.
     3. change orders: the GC asks (portal) or GrayCo writes one; GrayCo prices it → ✅ Approvals (PM + admin) →
        the GC signs in the portal (typed name + "I agree"; name, time and address recorded). The CRM picks a
        signed one up into the job's change orders (approved, the GC's signature on it) — so it is in the next
        pay app like any approved change order.
     4. RFIs: numbered per job; e-mailed from the PM's name (reply-to the PM, the job in the subject); the answer
        comes from the portal, or the PM types in the reply that came by e-mail.
     5. company documents (Admin → 📄 Company documents): COI, W-9, licenses, safety program / records, lien
        info — always the current one, downloadable in every GC link; a renewed COI → ONE approval that e-mails
        it to every active GC contact; 30 / 7 days before one expires (and when it has) the admins are reminded.
     Never in a GC's view: GrayCo's costs, sub pricing, internal notes, or that subs have a portal.

   Stores (service-only, the Lead Inbox's table gc_lead_inbox_kv — never synced to a browser):
     gc_gcp_links      [{ token, pid, by, at, revoked, revokedAt, lastViewed }]   one active link per job
     gc_gcp_jobs       { <pid>: { payapps:[], cos:[], rfis:[], seq:{pa,co,rfi}, log:[] } }
     gc_company_docs   [{ id, kind, title, ref, name, type, expires, at, by, current, replacedBy, removed }]
     gc_compdocs_state { reminded: { '<docId>|30d': at }, coiSent: { '<docId>': at } }
     gc_checkins       [{ id, pid, mood, note, at }]                           (customer portal, mid-job)
     gc_inspect        { seasons: { '2026-fall': { at, id, n } }, offers: { <code>: { pid, email, name, pm, season, at, acceptedAt, leadId } } }
   ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
'use strict';
const crypto = require('crypto');

const K_LINKS = 'gc_gcp_links', K_JOBS = 'gc_gcp_jobs', K_DOCS = 'gc_company_docs', K_DOCST = 'gc_compdocs_state', K_CHECK = 'gc_checkins', K_INSP = 'gc_inspect';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const DOC_KINDS = { coi: 'Certificate of insurance (COI)', w9: 'W-9', license: 'License', safety: 'Safety program / records', lien: 'Lien information', other: 'Other' };
const OFFICE_PHONE = '901-585-0944';

let CORE = null, LIB = null;
function core(){ if (!CORE) CORE = require('../portal.js')._core; return CORE; }
function L(){ if (!LIB) LIB = require('../bid-inbox.js')._lib; return LIB; }
const T = { now: null };   /* tests set T.now */
function now(){ return T.now ? T.now() : Date.now(); }
function nowIso(){ return new Date(now()).toISOString(); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function money(n){ return Math.round(num(n) * 100) / 100; }
function ymd(v){ const t = s(v); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function usd(n){ return '$' + money(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function uid(p){ return p + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }
function newToken(){ return crypto.randomBytes(32).toString('base64url'); }
function pidOf(r){ return s(r && (r.pid || r.projectId || r.jobId || r.project_id)); }
function env(k){ return s(process.env[k]); }
function firstName(n){ n = s(n).replace(/^(mr|mrs|ms|dr)\.?\s+/i, ''); const w = n.split(/[\s,&]+/)[0] || ''; return /^[A-Za-z][A-Za-z'-]{1,20}$/.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''; }
function portalBase(){ const v = env('PORTAL_BASE_URL').replace(/\/$/, ''); return /^https:\/\//.test(v) ? v : 'https://portal.grayco-cs.com'; }
function crmBase(){ const v = (env('CRM_URL') || env('SITE_ORIGIN').split(',')[0] || 'https://crm.grayco-cs.com').replace(/\/$/, ''); return /^https:\/\//.test(v) ? v : 'https://crm.grayco-cs.com'; }
function gcLink(token, extra){ const b = portalBase(); return b + (/^https:\/\/portal\./.test(b) ? '/#g=' : '/portal.html#g=') + token + (extra ? '&' + extra : ''); }

/* ── the stores ─────────────────────────────────────────────────────────────── */
async function get(key, dflt){ const v = await L().kvGet(key); return v == null ? dflt : v; }
function cas(key, change){ return L().kvCas(key, change); }

/* ── which jobs, which people ───────────────────────────────────────────────── */
function custOf(data, p){
  const name = low(p.client || p.customer || p.clientName);
  return arr(data.customers).find(function(c){ return c && c.deleted !== true && (s(c.id) && s(c.id) === s(p.customerId) || (name && low(c.name || c.company) === name)); }) || null;
}
function isGcJob(data, p){
  if (!p) return false;
  if (p.gcJob === true || low(p.hiredBy) === 'gc') return true;
  if (p.gcJob === false) return false;
  const c = custOf(data, p); return !!(c && low(c.type) === 'gc');
}
function contactsOf(data, p){
  const out = [], seen = {};
  function add(name, email, role){ email = low(email); if (!okEmail(email) || seen[email]) return; seen[email] = 1; out.push({ name: clip(name, 80), email: email, role: role || 'other' }); }
  arr(p.gcContacts).forEach(function(c){ if (c && c.active !== false) add(c.name, c.email, low(c.role) || 'other'); });
  const c = custOf(data, p), g = (c && c.gcInfo) || {};
  if (g.billingEmail) add(g.billingContact || (c && (c.name || c.company)), g.billingEmail, 'billing');
  if (p.gcEmail) add(p.gcContact || p.gc, p.gcEmail, 'pm');
  if (c && low(c.type) === 'gc' && c.email) add(c.contact || c.name, c.email, 'other');
  return out;
}
function billingOf(list){ return list.find(function(x){ return x.role === 'billing'; }) || list[0] || null; }
function gcCompany(data, p){ const c = custOf(data, p); return clip((c && (c.company || c.name)) || p.gc || p.gcCompany || p.client || '', 80); }
function activeUser(data, name){ const n = low(name); return n ? arr(data.users).find(function(u){ return u && u.active !== false && low(u.name) === n; }) || null : null; }

/* ── the GC links ───────────────────────────────────────────────────────────── */
async function linkFor(pid){ return arr(await get(K_LINKS, [])).find(function(x){ return x.pid === s(pid) && !x.revoked; }) || null; }
async function linkByToken(token){
  if (!TOKEN_RE.test(s(token))) return null;
  const row = arr(await get(K_LINKS, [])).find(function(x){ return x && typeof x.token === 'string' && x.token.length === token.length && crypto.timingSafeEqual(Buffer.from(x.token), Buffer.from(token)); });
  return row && !row.revoked ? row : null;
}
async function createLink(pid, by){
  let tok = '';
  await cas(K_LINKS, function(v){
    const l = arr(v); const have = l.find(function(x){ return x.pid === s(pid) && !x.revoked; });
    if (have) { tok = have.token; return undefined; }
    tok = newToken(); l.push({ token: tok, pid: s(pid), by: clip(by, 120), at: nowIso(), revoked: false }); return l.slice(-3000);
  });
  return tok;
}
async function revokeLink(pid, by){
  await cas(K_LINKS, function(v){ const l = arr(v); let n = 0; l.forEach(function(x){ if (x.pid === s(pid) && !x.revoked) { x.revoked = true; x.revokedAt = nowIso(); x.revokedBy = clip(by, 120); n++; } }); return n ? l : undefined; });
}
async function touchLink(token){
  try { await cas(K_LINKS, function(v){ const l = arr(v); const x = l.find(function(y){ return y.token === token; }); if (!x) return undefined; const last = Date.parse(x.lastViewed || 0) || 0; if (now() - last < 10 * 60e3) return undefined; x.lastViewed = nowIso(); return l; }); } catch (e) {}
}

/* ── one job's GC state ─────────────────────────────────────────────────────── */
function blank(){ return { payapps: [], cos: [], rfis: [], seq: { pa: 0, co: 0, rfi: 0 }, log: [] }; }
async function jobState(pid){ const all = obj(await get(K_JOBS, {})); return Object.assign(blank(), obj(all[s(pid)])); }
/* change one job's state: fn(state) returns a result (or throws); the state is written back */
async function mutateJob(pid, fn){
  let out;
  await cas(K_JOBS, function(v){
    const all = obj(v), st = Object.assign(blank(), obj(all[s(pid)]));
    st.seq = Object.assign({ pa: 0, co: 0, rfi: 0 }, st.seq || {});
    out = fn(st);
    if (out === undefined) return undefined;
    st.log = arr(st.log).slice(-200);
    all[s(pid)] = st; return all;
  });
  return out;
}
function logLine(st, who, what){ st.log = arr(st.log).concat([{ at: nowIso(), who: clip(who, 120), what: clip(what, 300) }]); }

/* ── company documents ──────────────────────────────────────────────────────── */
function docLive(d){ return d && !d.removed && d.current !== false; }
function docExpired(d, t){ return !!(d.expires && ymd(d.expires) < new Date(t || now()).toISOString().slice(0, 10)); }
async function companyDocs(all){ const l = arr(await get(K_DOCS, [])); return all ? l : l.filter(docLive); }
function docOut(d){ return { id: s(d.id), kind: s(d.kind), kindLabel: DOC_KINDS[d.kind] || 'Document', title: clip(d.title || DOC_KINDS[d.kind] || 'Document', 120), expires: ymd(d.expires), expired: docExpired(d), at: s(d.at) }; }

/* ── the GC's view: a strict whitelist ──────────────────────────────────────── */
function payOut(x){ return { id: s(x.id), number: s(x.number), period: clip(x.period, 60), amount: money(x.amount), retainage: money(x.retainage), retainagePct: num(x.retainagePct), status: s(x.status), sentAt: s(x.sentAt), approvedAt: s(x.approvedAt), approvedBy: clip(x.approvedBy, 80), paidAt: s(x.paidAt), hasPdf: !!x.ref, note: clip(x.gcNote, 400) }; }
function coOut(x){ return { id: s(x.id), number: s(x.number), title: clip(x.title, 120), description: clip(x.description, 2000), amount: x.status === 'requested' ? null : money(x.amount), status: s(x.status), requestedBy: clip(x.requestedBy, 80), requestedAt: s(x.requestedAt), pricedAt: s(x.pricedAt), signedBy: clip(x.signedBy, 80), signedAt: s(x.signedAt) }; }
function rfiOut(x){ return { id: s(x.id), number: s(x.number), subject: clip(x.subject, 140), question: clip(x.question, 3000), askedAt: s(x.askedAt), askedBy: clip(x.askedBy, 80), due: ymd(x.due), answer: clip(x.answer, 3000), answeredAt: s(x.answeredAt), answeredBy: clip(x.answeredBy, 80), status: s(x.status) }; }
async function scheduleOf(pid){
  let rows = [];
  try { rows = arr((await core().kvRead(['schedule'])).schedule); } catch (e) {}
  return rows.filter(function(x){ return x && pidOf(x) === s(pid) && x.deleted !== true && x.internal !== true && x.private !== true; })
    .map(function(x){ return { title: clip(x.title || x.name || x.task, 90), date: ymd(x.date || x.start), end: ymd(x.endDate || x.end) }; })
    .filter(function(x){ return x.title && x.date; }).sort(function(a, b){ return a.date < b.date ? -1 : 1; }).slice(0, 80);
}
async function gcView(data, p, opts){
  opts = opts || {};
  const C = core();
  const v = await C.buildView(data, p);
  const st = await jobState(p.id);
  const docs = (await companyDocs()).filter(function(d){ return !docExpired(d) || d.kind !== 'coi'; }).map(docOut);
  const out = {
    ok: true, kind: 'gc', office: { phone: OFFICE_PHONE },
    company: gcCompany(data, p),
    job: { name: v.job.name, po: v.job.po, address: v.job.address, stage: v.job.stage, stageName: v.job.stageName, steps: v.job.steps },
    pm: v.pm,
    schedule: await scheduleOf(p.id),
    updates: arr(v.posts).map(function(x){ return { at: x.at, by: x.by, text: x.text, photos: x.photos }; }),
    payapps: arr(st.payapps).filter(function(x){ return x.status !== 'void' && x.status !== 'draft' && x.status !== 'waiting'; }).map(payOut),
    cos: arr(st.cos).filter(function(x){ return x.status !== 'void' && x.status !== 'pricing'; }).map(coOut),
    rfis: arr(st.rfis).filter(function(x){ return x.status !== 'void' && x.status !== 'draft'; }).map(rfiOut),
    docs: docs
  };
  if (opts.staff) { out.staff = true; out.state = st; out.contacts = contactsOf(data, p); }
  return out;
}

/* ── e-mail ─────────────────────────────────────────────────────────────────── */
async function resend(payload){
  const key = env('RESEND_API_KEY');
  if (!key || env('PORTAL_MAIL_OFF') === '1' || env('PORTAL_MAIL_OFF') === 'true') return { ok: false, skipped: true, error: 'E-mail is not set up (RESEND_API_KEY) or switched off.' };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { ok: r.ok, status: r.status, error: r.ok ? '' : 'The e-mail did not go out (' + r.status + ').' };
  } catch (e) { return { ok: false, error: 'The e-mail did not go out (no answer).' }; }
}
async function shell(html, sender){ try { return await require('./brand.js').shellFor(html, sender || {}); } catch (e) { return html; } }
function btn(href, text){ return '<p style="margin:18px 0"><a href="' + esc(href) + '" style="background:#D4A017;color:#14202E;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">' + esc(text) + '</a></p>'; }
function para(t){ return '<p style="margin:0 0 12px">' + t + '</p>'; }
function wrapBody(inner){ return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.55">' + inner + '</div>'; }
/* the staff: admins (+ office), by role — never a named person */
async function staffEmails(data, who){
  const C = core(); const users = arr(data.users).filter(function(u){ return u && u.active !== false && okEmail(u.email); });
  const admins = users.filter(function(u){ return /^admin$/i.test(s(u.role)) || low(u.payType) === 'owner'; }).map(function(u){ return low(u.email); });
  let more = []; try { more = await L().alertsApi().recipients(); } catch (e) {}
  const office = users.filter(function(u){ return /office/i.test(s(u.role)); }).map(function(u){ return low(u.email); });
  const out = (who === 'office' ? office : []).concat(admins, who === 'admins' ? more : []).filter(okEmail);
  return Array.from(new Set(out));
}
async function mailStaff(to, subject, html, hint){
  to = Array.from(new Set(arr(to).map(low).filter(okEmail))); if (!to.length) return { ok: false, error: 'nobody to tell' };
  let subj = subject; try { subj = require('./mailtag.js').tag(subject, to, hint || 'gc portal'); } catch (e) {}
  return resend({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: to, subject: subj, html: wrapBody(html), headers: { 'X-GrayCo-CRM': 'gc-portal' } });
}
/* a to-do on the shared list (the job's PM, or the office) */
async function todo(item){
  const C = core(), id = s(item.id), at = nowIso();
  const it = Object.assign({ addedBy: 'GrayCo CRM', addedAt: at, updatedAt: at, done: false }, item);
  const has = function(l){ return l.some(function(t){ return t && s(t.id) === id; }); };
  try { const r = await C.kvListUpdate('gc_office_tasks', function(l){ return has(l) ? null : { list: l.concat([it]), check: has }; }); return !!r.ok; } catch (e) { return false; }
}

/* ── STAFF: pay apps ────────────────────────────────────────────────────────── */
function payMail(p, pa, company, link){
  const lines = '<table style="border-collapse:collapse;font-size:14px;margin:10px 0">'
    + [['Pay application', '#' + esc(pa.number) + (pa.period ? ' — ' + esc(pa.period) : '')], ['Amount this period', usd(pa.amount)], pa.retainage ? ['Retainage held', usd(pa.retainage) + (pa.retainagePct ? ' (' + esc(pa.retainagePct) + '%)' : '')] : null]
      .filter(Boolean).map(function(r){ return '<tr><td style="padding:4px 14px 4px 0;color:#55626F">' + r[0] + '</td><td style="padding:4px 0;font-weight:bold">' + r[1] + '</td></tr>'; }).join('') + '</table>';
  return wrapBody(para('Hello' + (company ? ' ' + esc(company) : '') + ',')
    + para('Attached is GrayCo Construction Services’ pay application <b>#' + esc(pa.number) + '</b> for <b>' + esc(p.name) + '</b>.')
    + lines + (pa.note ? para(esc(pa.note)) : '')
    + para('You can approve it with one click on your project page (it also has the schedule, photos, change orders, RFIs and our current certificate of insurance and W-9):')
    + btn(link, 'Review & approve pay app #' + pa.number)
    + para('Or just reply to this e-mail with any questions.'));
}
async function payappAdd(data, p, b, who){
  const C = core(), pm = C.pmOf(data, p), list = contactsOf(data, p), bill = billingOf(list);
  const amount = money(b.amount), ret = money(b.retainage), pct = num(b.retainagePct);
  if (!(amount > 0)) return { code: 400, out: { ok: false, error: 'Enter the amount this period.' } };
  const pa = await mutateJob(p.id, function(st){
    const n = s(b.number) || String((st.seq.pa || 0) + 1);
    st.seq.pa = Math.max(st.seq.pa || 0, parseInt(n, 10) || 0);
    const x = { id: s(b.id) || uid('PA'), number: clip(n, 12), period: clip(b.period, 60), amount: amount, retainage: ret, retainagePct: pct, ref: s(b.ref), fileName: clip(b.fileName, 120),
      note: clip(b.note, 600), source: clip(b.source, 40) || 'manual', status: 'waiting', by: who.email, at: nowIso() };
    if (x.ref && !/^sb:crm-files\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/.test(x.ref)) x.ref = '';
    const i = st.payapps.findIndex(function(y){ return y.id === x.id; });
    if (i >= 0) { if (/approved|paid/.test(st.payapps[i].status)) throw new Error('That pay app is already approved by the GC.'); st.payapps[i] = Object.assign(st.payapps[i], x); } else st.payapps.push(x);
    logLine(st, who.email, 'Pay app #' + x.number + ' ' + usd(amount) + ' added — waiting on approval to send');
    return x;
  });
  if (!bill) return { code: 200, out: { ok: true, payapp: pa, queued: false, warning: 'There is no GC billing e-mail on this job yet — add the GC contacts, then press Send again.' } };
  const tok = await createLink(p.id, 'pay app ' + pa.number);
  const ok = await C.queueApproval({ id: 'appr_gcp_pa_' + pa.id, kind: 'gcp_payapp_invoice', title: '🏗 Pay app #' + pa.number + ' ' + usd(amount) + ' → ' + (gcCompany(data, p) || 'the GC'),
    pid: p.id, jobName: p.name, pm: pm, to: bill.email, channel: 'email', subject: 'Pay application #' + pa.number + ' — ' + (p.name || 'your project'),
    html: payMail(p, pa, gcCompany(data, p), gcLink(tok, 'pa=' + pa.id)), attachments: pa.ref ? [{ kind: 'file', ref: pa.ref, name: pa.fileName || ('Pay app ' + pa.number + '.pdf') }] : [],
    meta: { gcp: 'payapp', pid: p.id, payappId: pa.id, cc: list.filter(function(x){ return x.email !== bill.email && x.role === 'billing'; }).map(function(x){ return x.email; }).slice(0, 4) } });
  return { code: 200, out: { ok: true, payapp: pa, queued: !!ok } };
}
async function payappStatus(p, b, who){
  const id = s(b.id), stt = low(b.status);
  if (['paid', 'void', 'approved'].indexOf(stt) < 0) return { code: 400, out: { ok: false, error: 'Bad status.' } };
  const x = await mutateJob(p.id, function(st){
    const pa = st.payapps.find(function(y){ return y.id === id; }); if (!pa) return null;
    pa.status = stt; if (stt === 'paid') { pa.paidAt = nowIso(); pa.paidAmount = money(b.amount) || pa.amount; } if (stt === 'approved' && !pa.approvedAt) { pa.approvedAt = nowIso(); pa.approvedBy = 'GrayCo (' + who.email + ')'; }
    logLine(st, who.email, 'Pay app #' + pa.number + ' marked ' + stt); return pa;
  });
  return x ? { code: 200, out: { ok: true, payapp: x } } : { code: 404, out: { ok: false, error: 'No such pay app.' } };
}

/* ── STAFF: change orders ───────────────────────────────────────────────────── */
function coMail(p, co, company, link){
  return wrapBody(para('Hello' + (company ? ' ' + esc(company) : '') + ',')
    + para('Here is GrayCo Construction Services’ change order <b>#' + esc(co.number) + '</b> for <b>' + esc(p.name) + '</b>:')
    + '<div style="border:1px solid #E2DCCD;border-radius:10px;padding:12px 14px;margin:8px 0 14px;background:#FBF9F4"><b>' + esc(co.title) + '</b><br>' + esc(co.description).replace(/\n/g, '<br>')
    + '<div style="margin-top:8px;font-size:17px"><b>' + usd(co.amount) + '</b></div></div>'
    + para('Please review and sign it on your project page — it takes a minute (type your name and tap Sign):')
    + btn(link, 'Review & sign change order #' + co.number)
    + para('Questions? Just reply to this e-mail.'));
}
async function coPrice(data, p, b, who){
  const C = core(), pm = C.pmOf(data, p), list = contactsOf(data, p);
  const amount = money(b.amount), title = clip(b.title, 120), desc = clip(b.description, 3000);
  if (!title) return { code: 400, out: { ok: false, error: 'Give the change order a title.' } };
  if (!amount) return { code: 400, out: { ok: false, error: 'Enter the price.' } };
  const co = await mutateJob(p.id, function(st){
    let x = s(b.id) ? st.cos.find(function(y){ return y.id === s(b.id); }) : null;
    if (x && /signed/.test(x.status)) throw new Error('That change order is already signed.');
    if (!x) { st.seq.co = (st.seq.co || 0) + 1; x = { id: uid('GCO'), number: String(st.seq.co), requestedBy: 'GrayCo (' + (who.name || who.email) + ')', requestedAt: nowIso(), status: 'pricing' }; st.cos.push(x); }
    Object.assign(x, { title: title, description: desc, amount: amount, pricedBy: who.email, pricedAt: nowIso(), status: 'pricing' });
    logLine(st, who.email, 'CO #' + x.number + ' priced ' + usd(amount) + ' — waiting on approval to send');
    return Object.assign({}, x);
  });
  const to = (list.find(function(x){ return x.role === 'pm'; }) || billingOf(list) || {}).email;
  if (!to) return { code: 200, out: { ok: true, co: co, queued: false, warning: 'Add the GC contacts on this job, then press Send again.' } };
  const tok = await createLink(p.id, 'change order ' + co.number);
  const ok = await C.queueApproval({ id: 'appr_gcp_co_' + co.id + '_' + Date.parse(co.pricedAt), kind: 'gcp_co_contract', title: '🏗 Change order #' + co.number + ' ' + usd(amount) + ' → ' + (gcCompany(data, p) || 'the GC') + ' to sign',
    pid: p.id, jobName: p.name, pm: pm, to: to, channel: 'email', subject: 'Change order #' + co.number + ' to sign — ' + (p.name || 'your project'),
    html: coMail(p, co, gcCompany(data, p), gcLink(tok, 'co=' + co.id)), meta: { gcp: 'co', pid: p.id, coId: co.id } });
  return { code: 200, out: { ok: true, co: co, queued: !!ok } };
}
async function coVoid(p, b, who){
  const x = await mutateJob(p.id, function(st){ const co = st.cos.find(function(y){ return y.id === s(b.id); }); if (!co) return null; if (/signed/.test(co.status)) throw new Error('A signed change order cannot be voided here.'); co.status = 'void'; co.voidedBy = who.email; co.voidedAt = nowIso(); logLine(st, who.email, 'CO #' + co.number + ' voided'); return co; });
  return x ? { code: 200, out: { ok: true, co: x } } : { code: 404, out: { ok: false, error: 'No such change order.' } };
}
async function coImported(p, b, who){
  const ids = arr(b.ids).map(s);
  const n = await mutateJob(p.id, function(st){ let k = 0; st.cos.forEach(function(c){ if (ids.indexOf(c.id) >= 0 && c.status === 'signed' && !c.importedAt) { c.importedAt = nowIso(); c.importedAs = s((b.map || {})[c.id]); k++; } }); return k ? k : undefined; });
  return { code: 200, out: { ok: true, marked: n || 0 } };
}

/* ── STAFF: RFIs ────────────────────────────────────────────────────────────── */
async function rfiNew(data, p, b, who){
  const C = core(), pm = C.pmOf(data, p), list = contactsOf(data, p);
  const subject = clip(b.subject, 140), question = clip(b.question, 4000);
  if (!subject || !question) return { code: 400, out: { ok: false, error: 'An RFI needs a subject and the question.' } };
  const to = arr(b.to).map(low).filter(okEmail);
  const rcpt = to.length ? to : list.filter(function(x){ return x.role !== 'billing'; }).map(function(x){ return x.email; }).concat(list.length && !list.some(function(x){ return x.role !== 'billing'; }) ? [list[0].email] : []);
  const rfi = await mutateJob(p.id, function(st){
    st.seq.rfi = (st.seq.rfi || 0) + 1;
    const x = { id: uid('RFI'), number: String(st.seq.rfi).padStart(3, '0'), subject: subject, question: question, due: ymd(b.due), askedBy: who.name || who.email, askedByEmail: who.email, askedAt: nowIso(), to: rcpt.slice(0, 6), status: 'open' };
    st.rfis.push(x); logLine(st, who.email, 'RFI #' + x.number + ' sent: ' + subject); return x;
  });
  let mailed = { ok: false, error: 'No GC contact e-mail on this job — the RFI is in the GC portal only.' };
  if (rcpt.length) {
    const tok = await createLink(p.id, 'RFI ' + rfi.number);
    const replyTo = okEmail(pm && pm.email) ? pm.email : (okEmail(who.email) ? who.email : 'replies@grayco-cs.com');
    const html = await shell(wrapBody(para('Hello,') + para('GrayCo Construction Services has a question on <b>' + esc(p.name) + '</b>:')
      + '<div style="border-left:4px solid #D4A017;padding:8px 14px;margin:8px 0 14px;background:#FBF9F4"><b>RFI #' + esc(rfi.number) + ' — ' + esc(subject) + '</b><br>' + esc(question).replace(/\n/g, '<br>') + (rfi.due ? '<br><br><b>Answer needed by:</b> ' + esc(rfi.due) : '') + '</div>'
      + para('Reply to this e-mail with the answer, or answer it on your project page:') + btn(gcLink(tok, 'rfi=' + rfi.id), 'Answer RFI #' + rfi.number)), { email: pm && pm.email, name: pm && pm.name });
    mailed = await resend({ from: (pm && pm.name ? clip(pm.name, 60) + ' — GrayCo Construction Services' : 'GrayCo Construction Services') + ' <portal@grayco-cs.com>', reply_to: replyTo, to: rcpt.slice(0, 6),
      subject: C.withJob('RFI #' + rfi.number + ' — ' + subject, p), html: html });
  }
  return { code: 200, out: { ok: true, rfi: rfi, mailed: !!mailed.ok, mailError: mailed.ok ? '' : mailed.error } };
}
async function rfiAnswer(p, b, by, via){
  const answer = clip(b.answer, 4000); if (!answer) return { code: 400, out: { ok: false, error: 'Type the answer.' } };
  const x = await mutateJob(p.id, function(st){ const r = st.rfis.find(function(y){ return y.id === s(b.id); }); if (!r || r.status === 'void') return null; r.answer = answer; r.answeredAt = nowIso(); r.answeredBy = clip(by, 80); r.answeredVia = via; r.status = 'answered'; logLine(st, by, 'RFI #' + r.number + ' answered (' + via + ')'); return Object.assign({}, r); });
  return x ? { code: 200, out: { ok: true, rfi: rfiOut(x) } } : { code: 404, out: { ok: false, error: 'No such RFI.' } };
}

/* ── PUBLIC (a GC link) ─────────────────────────────────────────────────────── */
function cleanName(v){ return clip(s(v).replace(/[<>]/g, ''), 80); }
async function tellPm(data, p, subject, html){
  const C = core(), pm = C.pmOf(data, p);
  const to = (pm && okEmail(pm.email) && activeUser(data, pm.name)) ? [pm.email] : await staffEmails(data, 'admins');
  return mailStaff(to, subject, html + para('<a href="' + esc(crmBase()) + '/#job=' + encodeURIComponent(p.id) + '">Open the job in the CRM</a>'), 'gc portal');
}
async function gcApprovePay(data, p, b, ip){
  const name = cleanName(b.name); if (name.length < 2) return { code: 400, out: { ok: false, error: 'Type your name to approve.' } };
  const x = await mutateJob(p.id, function(st){ const pa = st.payapps.find(function(y){ return y.id === s(b.id); }); if (!pa || !/sent/.test(pa.status)) return null; pa.status = 'approved'; pa.approvedAt = nowIso(); pa.approvedBy = name; pa.approvedIp = clip(ip, 60); pa.gcNote = clip(b.note, 400); logLine(st, name + ' (GC)', 'Pay app #' + pa.number + ' approved'); return Object.assign({}, pa); });
  if (!x) return { code: 409, out: { ok: false, error: 'That pay app is not waiting for approval.' } };
  await tellPm(data, p, '✅ GC approved pay app #' + x.number + ' (' + usd(x.amount) + ') — ' + (p.name || ''), para('<b>' + esc(name) + '</b> approved pay application <b>#' + esc(x.number) + '</b> for ' + usd(x.amount) + ' on ' + esc(p.name) + ' through the GC portal.' + (x.gcNote ? '<br>Their note: ' + esc(x.gcNote) : '')));
  return { code: 200, out: { ok: true, payapp: payOut(x) } };
}
async function gcRequestCo(data, p, b){
  const name = cleanName(b.name), title = clip(b.title, 120), desc = clip(b.description, 3000);
  if (name.length < 2 || !title) return { code: 400, out: { ok: false, error: 'Add a title and your name.' } };
  const x = await mutateJob(p.id, function(st){
    if (st.cos.filter(function(c){ return c.status === 'requested'; }).length >= 25) throw new Error('Too many open requests — please call GrayCo.');
    st.seq.co = (st.seq.co || 0) + 1; const c = { id: uid('GCO'), number: String(st.seq.co), title: title, description: desc, requestedBy: name + ' (GC)', requestedAt: nowIso(), status: 'requested' };
    st.cos.push(c); logLine(st, name + ' (GC)', 'Change requested: ' + title); return c;
  });
  const C = core(), pm = C.pmOf(data, p);
  await todo({ id: 'GCP_CO_' + x.id, label: '🏗 Price the GC’s change request #' + x.number + ': ' + title, note: (p.name || '') + ' — asked by ' + name + '. Price it on the job (🏗 GC portal → Change orders).', pid: s(p.id), assignees: pm && pm.name && activeUser(data, pm.name) ? [pm.name] : [], prio: 'high', kind: 'gcp_co_request' });
  await tellPm(data, p, '🏗 The GC asked for a change: ' + title + ' — ' + (p.name || ''), para('<b>' + esc(name) + '</b> asked for change #' + esc(x.number) + ' on ' + esc(p.name) + ':') + para('<b>' + esc(title) + '</b><br>' + esc(desc).replace(/\n/g, '<br>')) + para('Price it on the job (🏗 GC portal → Change orders); it goes out for their signature after approval.'));
  return { code: 200, out: { ok: true, co: coOut(x) } };
}
async function gcSignCo(data, p, b, ip){
  const name = cleanName(b.name); if (name.length < 2 || b.agree !== true) return { code: 400, out: { ok: false, error: 'Type your name and tick “I agree” to sign.' } };
  const x = await mutateJob(p.id, function(st){ const c = st.cos.find(function(y){ return y.id === s(b.id); }); if (!c || c.status !== 'sent') return null; c.status = 'signed'; c.signedBy = name; c.signedAt = nowIso(); c.signedIp = clip(ip, 60); c.signedTitle = clip(b.title, 60); logLine(st, name + ' (GC)', 'CO #' + c.number + ' signed ' + usd(c.amount)); return Object.assign({}, c); });
  if (!x) return { code: 409, out: { ok: false, error: 'That change order is not waiting for a signature.' } };
  await tellPm(data, p, '✍️ GC signed change order #' + x.number + ' (' + usd(x.amount) + ') — ' + (p.name || ''), para('<b>' + esc(name) + '</b> signed change order <b>#' + esc(x.number) + '</b> “' + esc(x.title) + '” for ' + usd(x.amount) + ' on ' + esc(p.name) + '.') + para('It is added to the job’s change orders (approved) the next time the CRM is open, so it goes into the next pay app.'));
  return { code: 200, out: { ok: true, co: coOut(x) } };
}

/* ── approved → out (portal.js aqSend hands gcp_* here) ─────────────────────── */
async function fileAttachment(ref, name){
  const m = /^sb:crm-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/.exec(s(ref)); if (!m) return null;
  const r = await fetch(L().sbUrl() + '/storage/v1/object/crm-files/' + m[1], { headers: L().svcH() });
  if (!r.ok) throw new Error('the file is not in the file storage yet (' + r.status + ')');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 15 * 1024 * 1024) throw new Error('the file is too big to attach');
  return { filename: clip(name || ('GrayCo ' + m[1].slice(-12)), 120), content: buf.toString('base64') };
}
async function onApproved(item){
  const m = item.meta || {}, C = core();
  let data = {}; try { data = await C.crmData(true); } catch (e) {}
  const p = m.pid ? C.findProject(data, m.pid) : null;
  const pm = C.pmOf(data, p || {});
  const replyTo = okEmail(item.pmEmail) && /@grayco-cs\.com$/i.test(item.pmEmail) ? item.pmEmail : 'replies@grayco-cs.com';
  if (item.kind === 'gcp_coi' || item.kind === 'gcp_inspect') {
    if (item.kind === 'gcp_inspect') return inspectSend(item, data);
    const people = arr(m.recipients); if (!people.length) return { ok: false, error: 'Nobody to send it to.' };
    let att = null; try { att = await fileAttachment(m.ref, m.fileName || 'GrayCo certificate of insurance.pdf'); } catch (e) { return { ok: false, error: 'Could not attach the COI: ' + e.message }; }
    let sent = 0, failed = 0;
    const html = await shell(item.html, {});
    for (const x of people) {
      const r = await resend({ from: 'GrayCo Construction Services <portal@grayco-cs.com>', reply_to: 'replies@grayco-cs.com', to: [x.email], subject: item.subject, html: html.split('{{NAME}}').join(esc(firstName(x.name) || 'there')), attachments: att ? [att] : undefined });
      if (r.ok) sent++; else failed++;
    }
    try { await cas(K_DOCST, function(v){ const st = obj(v); st.coiSent = obj(st.coiSent); st.coiSent[s(m.docId)] = { at: nowIso(), sent: sent, failed: failed }; return st; }); } catch (e) {}
    return failed && !sent ? { ok: false, error: 'The e-mails did not go out.' } : { ok: true, sent: sent, failed: failed };
  }
  if (!p) return { ok: false, error: 'The job is not in the cloud (deleted?) — not sent.' };
  /* the approver may have edited To / CC / subject / text: those are used */
  let html = s(item.html);
  const tokNeeded = /#g=|portal\.html#g=/.test(html) || html.indexOf('{{GC_PORTAL_LINK}}') >= 0;
  if (tokNeeded) { const tok = await createLink(p.id, 'approved ' + item.kind); html = html.split('{{GC_PORTAL_LINK}}').join(esc(gcLink(tok))); }
  html = await shell(html, { email: pm && pm.email, name: pm && pm.name });
  const payload = { from: item.kind === 'gcp_payapp_invoice' ? require('./brand.js').billingFrom() : 'GrayCo Construction Services <portal@grayco-cs.com>',   /* patch BILL */
    reply_to: item.kind === 'gcp_payapp_invoice' ? require('./brand.js').billingEmail() : replyTo, to: [s(item.to)], subject: C.withJob(item.subject, p), html: html };
  const cc = arr(item.cc).concat(arr(m.cc)).map(low).filter(function(e, i, a){ return okEmail(e) && e !== low(item.to) && a.indexOf(e) === i; }).slice(0, 5);
  if (cc.length) payload.cc = cc;
  try {
    const atts = [];
    for (const a of arr(item.attachments)) { if (a && a.kind === 'file' && a.ref) { const f = await fileAttachment(a.ref, a.name); if (f) atts.push(f); } }
    if (atts.length) payload.attachments = atts;
  } catch (e) { return { ok: false, error: 'Could not attach the PDF: ' + e.message + '. Open the job on the computer that added it, then approve again.' }; }
  const r = await resend(payload);
  if (!r.ok) return { ok: false, error: r.error || 'The e-mail did not go out.' };
  const at = nowIso();
  if (m.gcp === 'payapp') await mutateJob(p.id, function(st){ const pa = st.payapps.find(function(y){ return y.id === m.payappId; }); if (!pa) return undefined; if (!/approved|paid/.test(pa.status)) pa.status = 'sent'; pa.sentAt = at; pa.sentTo = s(item.to); logLine(st, item.sentBy || 'approved', 'Pay app #' + pa.number + ' e-mailed to ' + s(item.to)); return pa; });
  if (m.gcp === 'co') await mutateJob(p.id, function(st){ const c = st.cos.find(function(y){ return y.id === m.coId; }); if (!c) return undefined; if (c.status !== 'signed') c.status = 'sent'; c.sentAt = at; c.ownerApproved = true; logLine(st, 'approved', 'CO #' + c.number + ' sent to ' + s(item.to) + ' to sign'); return c; });
  return { ok: true };
}

/* ── company documents (admins) ─────────────────────────────────────────────── */
async function docAdd(data, b, who){
  const kind = DOC_KINDS[low(b.kind)] ? low(b.kind) : 'other';
  const ref = s(b.ref); if (!/^sb:crm-files\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/.test(ref)) return { code: 400, out: { ok: false, error: 'Upload the file first.' } };
  const rec = { id: uid('CDOC'), kind: kind, title: clip(b.title, 120) || DOC_KINDS[kind], ref: ref, name: clip(b.name, 120), type: clip(b.type, 60), expires: ymd(b.expires), at: nowIso(), by: who.email, current: true };
  let replaced = [];
  await cas(K_DOCS, function(v){
    const l = arr(v);
    if (b.replaces !== false && kind !== 'other' && kind !== 'license') l.forEach(function(d){ if (docLive(d) && d.kind === kind) { d.current = false; d.replacedBy = rec.id; d.replacedAt = rec.at; replaced.push(d.id); } });
    if (b.replaces && typeof b.replaces === 'string') l.forEach(function(d){ if (d.id === b.replaces && docLive(d)) { d.current = false; d.replacedBy = rec.id; d.replacedAt = rec.at; replaced.push(d.id); } });
    l.push(rec); return l.slice(-500);
  });
  let queued = 0;
  if (kind === 'coi' && b.sendToGcs !== false) queued = await queueCoi(data, rec);
  return { code: 200, out: { ok: true, doc: docOut(rec), replaced: replaced, coiQueued: queued } };
}
/* every active GC contact (jobs not closed / lost, hired by a GC) */
function activeGcContacts(data){
  const dead = {}; arr(data.gc_deleted_projects).forEach(function(x){ dead[s(x)] = 1; });
  const out = [], seen = {};
  arr(data.projects).forEach(function(p){
    if (!p || dead[s(p.id)] || p.deleted === true || /lost|dead|cancel|closed|archiv/i.test(s(p.status))) return;
    if (!isGcJob(data, p)) return;
    contactsOf(data, p).forEach(function(c){ if (!seen[c.email]) { seen[c.email] = 1; out.push({ email: c.email, name: c.name, company: gcCompany(data, p), job: s(p.name) }); } });
  });
  return out;
}
async function queueCoi(data, rec){
  const people = activeGcContacts(data); if (!people.length) return 0;
  const html = wrapBody(para('Hi {{NAME}},') + para('GrayCo Construction Services’ certificate of insurance has been renewed. The current certificate is attached' + (rec.expires ? ' (valid through ' + esc(rec.expires) + ')' : '') + '.')
    + para('It is also always available on your GrayCo project page. Please reply to this e-mail if you need anything else for your records.') + para('Thank you,<br>GrayCo Construction Services'));
  const ok = await core().queueApproval({ id: 'appr_gcp_coi_' + rec.id, kind: 'gcp_coi', title: '📄 New COI → ' + people.length + ' GC contact' + (people.length === 1 ? '' : 's'), pid: '', jobName: '', pm: null,
    to: people[0].email, channel: 'email', subject: 'Updated certificate of insurance — GrayCo Construction Services', html: html,
    meta: { gcp: 'coi', docId: rec.id, ref: rec.ref, fileName: rec.name || 'GrayCo certificate of insurance.pdf', recipients: people, note: 'Goes to ' + people.length + ' GC contacts on active jobs, one e-mail each, with the COI attached: ' + people.map(function(x){ return x.email; }).join(', ') } });
  return ok ? people.length : 0;
}
async function docRemove(b, who){
  let hit = null;
  await cas(K_DOCS, function(v){ const l = arr(v); const d = l.find(function(x){ return x.id === s(b.id); }); if (!d || d.removed) return undefined; d.removed = true; d.removedAt = nowIso(); d.removedBy = who.email; hit = d; return l; });
  return hit ? { code: 200, out: { ok: true } } : { code: 404, out: { ok: false, error: 'No such document.' } };
}
async function docSigned(ref){
  const C = core(); const m = await C.signRefs([ref]); return m[ref] || '';
}

/* ── daily: company documents about to run out ───────────────────────────────── */
async function complianceRun(data){
  const t = now(), today = new Date(t).toISOString().slice(0, 10);
  const docs = (await companyDocs()).filter(function(d){ return d.expires; });
  const st = obj(await get(K_DOCST, {})); const rem = obj(st.reminded);
  const due = [];
  docs.forEach(function(d){
    const days = Math.round((Date.parse(ymd(d.expires) + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 864e5);
    const step = days < 0 ? 'expired' : days <= 7 ? '7d' : days <= 30 ? '30d' : '';
    if (!step || rem[d.id + '|' + step]) return;
    due.push({ d: d, step: step, days: days });
  });
  if (!due.length) return { reminded: 0 };
  const to = await staffEmails(data, 'admins');
  const rows = due.map(function(x){ return '<li><b>' + esc(x.d.title) + '</b> (' + esc(DOC_KINDS[x.d.kind] || 'document') + ') — ' + (x.days < 0 ? '<b style="color:#b91c1c">expired ' + esc(x.d.expires) + '</b>' : 'runs out <b>' + esc(x.d.expires) + '</b> (' + x.days + ' day' + (x.days === 1 ? '' : 's') + ')') + '</li>'; }).join('');
  const r = await mailStaff(to, '📄 Company document' + (due.length === 1 ? '' : 's') + ' to renew: ' + due.map(function(x){ return x.d.title; }).join(', '),
    para('These company documents are about to run out (or have). GCs see them on their project pages, so upload the renewed one in the CRM: <b>Admin → 📄 Company documents</b>. A renewed COI is then sent to every active GC contact (after your approval).') + '<ul>' + rows + '</ul>', 'compliance');
  await todo({ id: 'GCP_DOCS_' + today, label: '📄 Renew company document' + (due.length === 1 ? '' : 's') + ': ' + due.map(function(x){ return x.d.title; }).join(', '), note: due.map(function(x){ return x.d.title + ' — ' + (x.days < 0 ? 'expired ' : 'runs out ') + x.d.expires; }).join('\n') + '\nUpload the new one: Admin → 📄 Company documents.', prio: x0(due) ? 'high' : 'normal', kind: 'gcp_docs' });
  if (r.ok || !to.length) await cas(K_DOCST, function(v){ const s2 = obj(v); s2.reminded = obj(s2.reminded); due.forEach(function(x){ s2.reminded[x.d.id + '|' + x.step] = nowIso(); }); return s2; });
  return { reminded: due.length, mailed: !!r.ok };
}
function x0(due){ return due.some(function(x){ return x.days <= 7; }); }

/* ── customer portal extras: the mid-job check-in and the warranty registry ─── */
function midJob(p, sched, view){
  const today = new Date(now()).toISOString().slice(0, 10);
  const dates = arr(sched).map(function(x){ return x.date; }).concat(arr(sched).map(function(x){ return x.end; })).filter(Boolean).sort();
  const start = ymd(p.startDate) || dates[0] || '', end = ymd(p.endDate) || dates[dates.length - 1] || '';
  const stage = view.job.stage;
  if (stage < 4 || stage >= 7) return false;
  if (start && end && end > start) {
    const mid = new Date((Date.parse(start + 'T12:00:00Z') + Date.parse(end + 'T12:00:00Z')) / 2).toISOString().slice(0, 10);
    return today >= mid && today <= new Date(Date.parse(end + 'T12:00:00Z') + 10 * 864e5).toISOString().slice(0, 10);
  }
  return stage === 5 || stage === 6;   /* in progress / punch list, dates unknown */
}
function mfrOf(p){ const w = obj(p.mfrWarranty); return w.mfr ? { name: clip(w.mfr, 60), product: clip(w.product, 80), number: clip(w.number, 60), status: low(w.status) === 'registered' ? 'registered' : 'pending', years: clip(w.years, 20) } : null; }
async function custExtras(data, p){
  const C = core(), view = await C.buildView(data, p), sched = await scheduleOf(p.id);
  const mine = arr(await get(K_CHECK, [])).filter(function(x){ return x.pid === s(p.id); });
  const closed = view.job.stage >= 7 || !!(p.closeout && (p.closeout.done || p.closeout.doneAt)) || p.closedOut === true;
  const w = view.warranty || {};
  return { ok: true,
    checkin: { show: !mine.length && midJob(p, sched, view), done: mine.length ? mine[mine.length - 1].mood : '' },
    registry: closed ? { show: true, title: w.title, years: w.years, start: w.start, end: w.end, mfr: mfrOf(p) } : { show: false } };
}
async function custCheckin(data, p, b, ip){
  const mood = { happy: 1, ok: 1, unhappy: 1 }[low(b.mood)] ? low(b.mood) : '';
  if (!mood) return { code: 400, out: { ok: false, error: 'Pick one.' } };
  let dup = false; const rec = { id: uid('CHK'), pid: s(p.id), mood: mood, note: clip(b.note, 1000), at: nowIso(), ip: clip(ip, 60) };
  await cas(K_CHECK, function(v){ const l = arr(v); if (l.some(function(x){ return x.pid === rec.pid && Date.parse(x.at) > now() - 864e5; })) { dup = true; return undefined; } l.push(rec); return l.slice(-3000); });
  if (dup) return { code: 200, out: { ok: true, already: true } };
  /* owner: a 😟 — or a 😐 with a comment — goes to the job's PM, the admins AND the office (e-mail + phone push), and
     ALWAYS makes one structured item on the shared Office To-Do ("Check in with <customer> — <job>": the comment, a
     Call button, Open job). It stays until someone marks it "Checked in" with what was done (logged on the job). */
  if (mood === 'unhappy' || (mood === 'ok' && rec.note)) {
    const C = core(), pm = C.pmOf(data, p), cust = s(p.client || p.customer) || 'The customer';
    const pmOn = pm && okEmail(pm.email) && activeUser(data, pm.name);
    const to = Array.from(new Set((pmOn ? [pm.email] : []).concat(await staffEmails(data, 'admins'), await staffEmails(data, 'office'))));
    const face = mood === 'unhappy' ? '😟' : '😐', tag = jobTagOf(p), phone = s(p.clientPhone || p.customerPhone || p.phone);
    await mailStaff(to, face + ' Check in with ' + cust + ' — ' + tag,
      para('<b>' + esc(cust) + '</b> answered the mid-job check-in in their portal on <b>' + esc(p.name) + '</b> with ' + face + (mood === 'unhappy' ? ' (not happy)' : ' (so-so)') + '.') + (rec.note ? para('What they wrote: “' + esc(rec.note) + '”') : '')
      + para('Please reach out today and see what we can do to help' + (pmOn ? ' (PM: ' + esc(pm.name) + ')' : '') + '. It is on the Office To-Do until someone marks it <b>Checked in</b> with what was done.')
      + (phone ? para('Call: <a href="tel:' + esc(phone.replace(/[^0-9+]/g, '')) + '">' + esc(phone) + '</a>') : '') + para('<a href="' + esc(crmBase()) + '/#job=' + encodeURIComponent(p.id) + '">Open the job</a>'), 'check-in');
    try { await C.pushTo(to, { title: face + ' Check in with ' + clip(cust, 40), body: clip((rec.note ? '“' + rec.note + '” — ' : '') + tag, 170), tag: 'gcp-chk-' + rec.id }); } catch (e) {}
    await todo({ id: 'GCP_CHK_' + rec.id, label: face + ' Check in with ' + cust + ' — ' + tag, note: (rec.note ? 'They wrote: “' + rec.note + '”\n' : '') + 'Mid-job check-in from the customer portal (' + (mood === 'unhappy' ? 'not happy' : 'so-so') + '). Reach out and see what we can do to help, then mark it Checked in with what was done.',
      pid: s(p.id), phone: phone, assignees: [], vis: 'company', prio: 'high', due: rec.at.slice(0, 10), kind: 'gcp_checkin', mood: mood, comment: rec.note, customer: cust, jobTag: tag, needsNote: true });
  }
  return { code: 200, out: { ok: true } };
}
function jobTagOf(p){ const po = s(p.autoPO || p.po), name = s(p.name), addr = s(p.address || p.jobAddress); return [po ? 'PO ' + po : '', name, addr && low(addr) !== low(name) ? addr : ''].filter(Boolean).join(' · '); }

/* ── the warranty registry PDF (a small PDF writer: Helvetica, Letter) ──────── */
function pdfText(t){ return '(' + String(t == null ? '' : t).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')'; }
function wrapLine(t, max){ const out = []; let cur = ''; String(t || '').split(/\s+/).forEach(function(w){ if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); if (cur) out.push(cur); return out.length ? out : ['']; }
function simplePdf(lines){
  /* lines: [{ t, size, bold, gap }] → one or more Letter pages */
  const pages = []; let ops = [], y = 640;   /* patch LOGO2: page 1 starts below the centered logo header */
  lines.forEach(function(l){
    const size = l.size || 11, max = Math.floor(470 / (size * 0.5));
    wrapLine(l.t, max).forEach(function(row){
      if (y < 60) { pages.push(ops); ops = []; y = 740; }
      ops.push('BT /' + (l.bold ? 'F2' : 'F1') + ' ' + size + ' Tf 64 ' + y + ' Td ' + pdfText(row) + ' Tj ET');
      y -= size + 5;
    });
    y -= l.gap == null ? 4 : l.gap;
  });
  pages.push(ops);
  const objs = []; const add = function(o){ objs.push(o); return objs.length; };
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pagesId = objs.length + 1; objs.push(null);
  const kids = [];
  /* patch LOGO: the colour logo at the left (50 pt = 0.7 in), name / address · phone / licenses beside it, a rule under it; pages 2+ carry the company name at the foot */
  const LG = require('./logo-wide.js'), logoBin = Buffer.from(LG.b64, 'base64').toString('latin1'), BRd = require('./brand.js').BRAND;
  const logoObj = add('<< /Type /XObject /Subtype /Image /Width ' + LG.w + ' /Height ' + LG.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + logoBin.length + ' >>\nstream\n' + logoBin + '\nendstream');
  /* patch LOGO2: centered (the 10/22 rule): the logo at the top centre, the name, address . phone . web and the licenses centered under it */
  const WD = require('./invoice-pdf.js').width, ctr = function(t, size, bold, yy, col){ return 'BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + col + ' rg ' + ((612 - WD(t, size, bold)) / 2).toFixed(1) + ' ' + yy + ' Td ' + pdfText(t) + ' Tj ET'; };
  const head1 = ['q 83 0 0 50 264.5 718 cm /Im1 Do Q',
    ctr(BRd.name, 15, true, 702, '0.06 0.14 0.25'),
    ctr(BRd.address + '  ·  ' + BRd.phone + '  ·  grayco-cs.com', 8.5, false, 690, '0.33 0.38 0.44'),
    ctr(BRd.licenses, 8, false, 679, '0.42 0.46 0.52'),
    '0.14 0.10 0.41 RG 1.5 w 64 670 m 548 670 l S', '0 0 0 rg'];
  pages.forEach(function(o, pi){
    const foot = pi === 0 ? [] : ['0.83 0.63 0.09 rg 0 784 612 8 re f', 'BT /F1 7.5 Tf 0.42 0.46 0.52 rg 170 24 Td ' + pdfText(BRd.name + '  ·  ' + BRd.phone + '  ·  page ' + (pi + 1) + ' of ' + pages.length) + ' Tj ET'];
    const stream = (pi === 0 ? head1 : ['0 0 0 rg']).concat(o, foot).join('\n');
    const c = add('<< /Length ' + Buffer.byteLength(stream, 'latin1') + ' >>\nstream\n' + stream + '\nendstream');
    kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >>' + (pi === 0 ? ' /XObject << /Im1 ' + logoObj + ' 0 R >>' : '') + ' >> /Contents ' + c + ' 0 R >>'));
  });
  objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map(function(k){ return k + ' 0 R'; }).join(' ') + '] /Count ' + kids.length + ' >>';
  const cat = add('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach(function(o, i){ offs.push(Buffer.byteLength(out, 'latin1')); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(function(o){ return String(o).padStart(10, '0') + ' 00000 n \n'; }).join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + cat + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(out, 'latin1');
}
async function registryPdf(data, p){
  const C = core(), view = await C.buildView(data, p), w = view.warranty || {}, mfr = mfrOf(p), BR = require('./brand.js').BRAND;
  const L2 = [{ t: 'WARRANTY REGISTRY', size: 18, bold: true, gap: 14 },
    { t: 'Customer: ' + (view.customer.name || ''), bold: true }, { t: 'Property: ' + (view.job.address || view.customer.address || '') }, { t: 'Project: ' + (view.job.name || '') + (view.job.po ? '   ·   PO ' + view.job.po : ''), gap: 12 },
    { t: 'GrayCo workmanship warranty', size: 13, bold: true }, { t: (w.title || '') + '.' }, { t: 'Starts: ' + (w.start || 'on completion') + '     Ends: ' + (w.end || '—'), gap: 6 },
    { t: 'GrayCo warrants its workmanship on this project for the period above: 5 years on all roofing and on insurance / restoration work, 1 year on all other work. If something we did is not right, call us at ' + BR.phone + ' or use "Report an issue" in your GrayCo portal.', size: 10, gap: 12 }];
  if (mfr) L2.push({ t: 'Manufacturer warranty', size: 13, bold: true }, { t: 'Manufacturer: ' + mfr.name + (mfr.product ? ' — ' + mfr.product : '') }, { t: 'Registration: ' + (mfr.status === 'registered' ? 'registered' + (mfr.number ? ' #' + mfr.number : '') : 'being registered by GrayCo') + (mfr.years ? '   ·   Term: ' + mfr.years : ''), gap: 12 });
  L2.push({ t: 'Keep this page with your home records. A future buyer of the home: call GrayCo to transfer what can be transferred.', size: 9, gap: 4 }, { t: 'Issued ' + new Date(now()).toISOString().slice(0, 10), size: 8 });
  return simplePdf(L2);
}

/* ── the spring / fall roof inspection offer ─────────────────────────────────── */
function seasonKey(t){
  const d = new Date(t), y = Number(d.toLocaleString('en-US', { timeZone: 'America/Chicago', year: 'numeric' })), mo = Number(d.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'numeric' })), day = Number(d.toLocaleString('en-US', { timeZone: 'America/Chicago', day: 'numeric' }));
  if ((mo === 3 && day >= 15) || mo === 4) return y + '-spring';
  if ((mo === 9 && day >= 15) || mo === 10) return y + '-fall';
  return '';
}
const OFFICE_LL = [35.2045, -89.8740];   /* Bartlett, TN */
function miles(a, b){ const R = 3958.8, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r; const h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(h)); }
function llOf(p){ const la = num(p.lat || p.latitude || (p.geo && p.geo.lat)), lo = num(p.lng || p.lon || p.longitude || (p.geo && (p.geo.lng || p.geo.lon))); return la && lo ? [la, lo] : null; }
/* past residential customers with an e-mail: finished more than 6 months ago, in the service area (≈35 miles) and —
   when the map knows them — within about 10 miles of another one (so a day of inspections is one route) */
function inspectList(data, t){
  const dead = {}; arr(data.gc_deleted_projects).forEach(function(x){ dead[s(x)] = 1; });
  const cut = new Date((t || now()) - 182 * 864e5).toISOString().slice(0, 10), radius = num(env('INSPECT_RADIUS_MILES')) || 35;
  const seen = {}, cand = [];
  arr(data.projects).slice().sort(function(a, b){ return s(b.completionDate || b.endDate) < s(a.completionDate || a.endDate) ? -1 : 1; }).forEach(function(p){
    if (!p || dead[s(p.id)] || p.deleted === true) return;
    if (!/complete|closed|done|paid/i.test(s(p.status)) && p.paidInFull !== true) return;
    if (/commercial|government|tenant|\bti\b|new construction/i.test(s(p.type)) || p.gcJob === true) return;
    const email = low(p.clientEmail || p.customerEmail || p.email); if (!okEmail(email) || seen[email]) return;
    if (p.doNotContact || p.dnc || p.doNotEmail) return;
    const done = ymd(p.completionDate || p.completedAt || p.endDate); if (done && done > cut) return;
    const ll = llOf(p); if (ll && miles(OFFICE_LL, ll) > radius) return;
    seen[email] = 1;
    cand.push({ pid: s(p.id), email: email, name: s(p.client || p.customer), first: firstName(p.client || p.customer), pm: s(p.pm), address: s(p.address), ll: ll, roof: /roof|shingle/i.test(s(p.type) + ' ' + s(p.name)) });
  });
  const withLL = cand.filter(function(c){ return c.ll; });
  return cand.filter(function(c){ return !c.ll || withLL.length < 2 || withLL.some(function(o){ return o !== c && miles(c.ll, o.ll) <= 10; }); });
}
async function inspectRun(data, t){
  t = t || now();
  if (env('INSPECT_OFF') === '1') return { off: true };
  const key = seasonKey(t); if (!key) return { season: '' };
  const st = obj(await get(K_INSP, {})); if (obj(st.seasons)[key]) return { season: key, already: true };
  const people = inspectList(data, t);
  const spring = /spring/.test(key);
  const subject = (spring ? 'Spring' : 'Fall') + ' roof check — a free inspection from GrayCo';
  const html = wrapBody(para('Hi {{FIRST_NAME}},')
    + para(spring ? 'Spring storms are here in the Mid-South. Because you’re a GrayCo customer, we’d like to look over your roof and gutters — <b>free</b> — and let you know if anything needs attention before summer.'
      : 'Before winter weather sets in, we’d like to give your roof a <b>free</b> once-over — shingles, flashing, gutters and vents — so small things don’t turn into leaks.')
    + para('Just tap the button and your Project Manager will call to set a time that works for you.') + btn('{{INSPECT_LINK}}', 'Yes — schedule my free inspection')
    + para('Ask us about a yearly maintenance plan too: we keep an eye on it every year so you don’t have to.') + para('Thank you for being a GrayCo customer!'));
  const id = 'appr_gcp_inspect_' + key;
  if (people.length) {
    const ok = await core().queueApproval({ id: id, kind: 'gcp_inspect', title: (spring ? '🌷' : '🍂') + ' Free roof inspection offer (' + key.replace('-', ' ') + '): ' + people.length + ' past customer' + (people.length === 1 ? '' : 's') + ', from news@',
      pid: '', jobName: '', pm: null, to: people[0].email, channel: 'email', subject: subject, html: html,
      meta: { gcp: 'inspect', season: key, recipients: people.map(function(x){ return { pid: x.pid, email: x.email, first: x.first, name: x.name, pm: x.pm }; }),
        note: 'Goes to ' + people.length + ' past customers, one e-mail each, from news@ with the unsubscribe link. A “yes” becomes a lead for their original PM. Not approved = nobody gets it this season.' } });
    if (!ok) return { season: key, queued: false };
  }
  await cas(K_INSP, function(v){ const x = obj(v); x.seasons = obj(x.seasons); if (x.seasons[key]) return undefined; x.seasons[key] = { at: nowIso(), id: id, n: people.length }; return x; });
  return { season: key, queued: people.length };
}
async function inspectSend(item, data){
  const N = require('./news.js'), m = item.meta || {};
  const people = arr(m.recipients); if (!people.length) return { ok: false, error: 'Nobody in this batch.' };
  const st = obj(await get(K_INSP, {})); const offers = obj(st.offers);
  let sent = 0, skipped = 0, failed = 0; const made = {};
  for (const x of people) {
    const already = Object.keys(offers).some(function(k){ return offers[k].email === x.email && offers[k].season === m.season && offers[k].sent; });
    if (already) { skipped++; continue; }
    const code = newToken();
    const link = crmBase() + '/.netlify/functions/gc-portal?inspect=' + code;
    const r = await N.sendNews({ to: x.email, subject: s(item.subject), html: s(item.html).split('{{FIRST_NAME}}').join(esc(x.first || 'there')).split('{{INSPECT_LINK}}').join(esc(link)) });
    if (r.ok && !r.skipped) { sent++; made[code] = { pid: x.pid, email: x.email, name: x.name, pm: x.pm, season: m.season, at: nowIso(), sent: true }; }
    else if (r.ok) skipped++; else failed++;
  }
  if (Object.keys(made).length) await cas(K_INSP, function(v){ const y = obj(v); y.offers = Object.assign(obj(y.offers), made); return y; });
  return failed && !sent ? { ok: false, error: 'The e-mails did not go out.' } : { ok: true, sent: sent, skipped: skipped, failed: failed };
}
async function inspectAccept(code, b){
  if (!TOKEN_RE.test(s(code))) return { ok: false, error: 'This link is not active.' };
  const st = obj(await get(K_INSP, {})); const o = obj(st.offers)[code];
  if (!o) return { ok: false, error: 'This link is not active.' };
  if (o.acceptedAt) return { ok: true, already: true, first: firstName(o.name) };
  const C = core(); let data = {}; try { data = await C.crmData(true); } catch (e) {}
  const pmUser = activeUser(data, o.pm);
  const p = C.findProject(data, o.pid) || {};
  const at = nowIso(), id = L().itemId('inspect|' + code);
  const rec = { id: id, title: ('Free roof inspection — ' + (o.name || o.email) + (p.address ? ' — ' + s(p.address).split(',')[0] : '')).slice(0, 200), source: 'Seasonal inspection offer', sourceKind: 'inspection', sourceRef: o.season,
    type: 'residential', address: s(p.address), city: '', state: '', zip: '', bidDue: '', scope: clip('Past customer accepted the ' + o.season.replace('-', ' ') + ' free roof inspection offer. Previous job: ' + s(p.name) + (b && b.note ? '\nThey wrote: ' + s(b.note) : ''), 600),
    gc: '', owner: '', bidNumber: '', contact: { name: s(o.name), email: o.email, phone: s(p.clientPhone || p.customerPhone || p.phone) }, plansLinks: [], files: [], emails: [], emailIds: [],
    notes: ['Accepted the free inspection offer ' + at.slice(0, 16).replace('T', ' ') + ' UTC.', pmUser ? 'Assigned to the original PM: ' + pmUser.name : 'The original PM is no longer active — assign a PM.'],
    origin: 'website', websiteLead: true, pm: pmUser ? s(pmUser.name) : '', assignedBy: pmUser ? 'Inspection offer (original PM)' : '', assignedAt: pmUser ? at : '',
    leadExtra: { websiteLead: true, inspectionOffer: true, season: o.season, existingCustomer: true, customerPid: s(o.pid), leadSource: 'Seasonal inspection offer', owner: 'GrayCo', grayCoLead: true, contactName: s(o.name), receivedAt: at, unassigned: !pmUser, pm: pmUser ? s(pmUser.name) : '' },
    needsReview: false, dueUnknown: false };
  let action = '';
  await L().kvCas(L().KV, function(v){ const r = L().upsert(arr(v), rec); action = r.action; return r.items; });
  await cas(K_INSP, function(v){ const y = obj(v); y.offers = obj(y.offers); if (!y.offers[code]) return undefined; y.offers[code].acceptedAt = at; y.offers[code].leadId = id; return y; });
  if (action === 'added') {
    try { await L().alertsApi().notifyNew([Object.assign({}, rec, { pmEmail: pmUser ? low(pmUser.email) : '', detail: ['Free inspection — past customer', rec.contact.phone, rec.contact.email].filter(Boolean).join(' · ') })], { source: 'Seasonal inspection offer' }); } catch (e) {}
  }
  return { ok: true, first: firstName(o.name) };
}

module.exports = { T, K_LINKS, K_JOBS, K_DOCS, K_DOCST, K_CHECK, K_INSP, DOC_KINDS, TOKEN_RE,
  isGcJob, contactsOf, billingOf, gcCompany, linkFor, linkByToken, createLink, revokeLink, touchLink, gcLink, jobState, mutateJob,
  companyDocs, docOut, docAdd, docRemove, docSigned, docExpired, gcView, payappAdd, payappStatus, coPrice, coVoid, coImported, rfiNew, rfiAnswer,
  gcApprovePay, gcRequestCo, gcSignCo, onApproved, complianceRun, activeGcContacts, custExtras, custCheckin, registryPdf, simplePdf, midJob,
  seasonKey, inspectList, inspectRun, inspectSend, inspectAccept, payOut, coOut, rfiOut, scheduleOf, staffEmails };
