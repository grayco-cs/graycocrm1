/* netlify/functions/_lib/offfeat.js — patch OFFFEAT (owner 10/30): four office features, the server side.
   EVERYTHING here goes through ✅ Approvals (gc_approval_queue, portal.js queueApproval): nothing is ever sent to a
   customer, a sub or a GC from this file. The office approves (officeOk — and on the APOFFICE4 build these kinds are
   the office's own); Wesley / Nick may too. ⏸ Data-entry mode: the daily run does nothing; a person's button still
   puts the item on Approvals (it cannot go out while the mode is on — pause.js stops every send).

   (2) COLLECTIONS — remind(): "Send payment reminder" on a row of the Collections board → the existing kind
       payment_reminder (the same item and letter as the 7 / 15 / 30-day automatic reminders, _lib/auto-ar.js), with the
       invoice PDF. ONE open reminder per invoice (an automatic one waiting counts too, and auto-ar adds none while this
       one waits). Refused: no balance, not a customer invoice, ⏰ Payment reminders off for the job, no customer e-mail.
   (3) SUB PAPERWORK — queueSubDoc(): a request to the sub for a new COI and / or the W-9 → kind sub_doc_request (to the
       sub's own e-mail; never to a customer, and a customer never sees it). ONE open request per sub. Used by the daily
       COI run (care11.js coiRun: 30 / 7 / 0 days before the COI on file runs out — it used to e-mail the sub directly),
       the daily W-9 pass below (a sub working for us with no W-9, asked once), and the Sub Compliance board's
       "Request docs" button (subDoc()).
   (4) LIENS — lienCustomer(): a lien waiver from GrayCo for a customer payment (kind lien_waiver, conditional or
       unconditional), the wording from the editable store (wording()); the sub side uses _lib/lien.js (kind
       sub_lien_request, viaApproval). daily(): the To-Do reminders before each lien deadline of a job whose
       "Track lien deadlines" is on (_lib/lien-deadlines.js — planning estimates, "confirm with your lawyer").
   (7) CHANGE ORDERS — cos() lists every change order sent and not signed (the customer's ✍️ signature requests of kind
       change_order whose e-mail went out, and the GC portal's change orders sent to the GC), days waiting, the open /
       last nudge. nudge() → kind sign_co_nudge (customer; the portal link) or gcp_co_nudge (the GC; the GC portal link).
       ONE open nudge per change order. daily(): a change order waiting 7+ days with no nudge → one office To-Do.
   Stores: gc_kv "gc_lien_wording" (the waiver wording, admins + office edit it), service-only "gc_offfeat_state"
   (what the daily run already did). Tests: tools/tests/test_OFFFEAT_fn.js (_D swaps the stores and the clock). */
'use strict';
const A = require('./auto-common.js');
const LD = require('./lien-deadlines.js');
const { s, low, num, r2, usd, arr, ymd, esc, clip, pidOf, okEmail, daysBetween } = A;

const K = { REM: 'payment_reminder', NUDGE: 'sign_co_nudge', GCNUDGE: 'gcp_co_nudge', SUBDOC: 'sub_doc_request', CWAIVER: 'lien_waiver' };
const WORDING_KEY = 'gc_lien_wording', STATE_KEY = 'gc_offfeat_state', SIGN_KEY = 'gc_sign_requests', GCP_JOBS = 'gc_gcp_jobs';
const CO_TODO_DAYS = 7, W9_PER_RUN = 10, W9_ACTIVE_DAYS = 180;
const DRAFT = 'DRAFT wording — GrayCo’s lawyer is reviewing it.';
const DEFAULT_WORDING = {
  sub_conditional: 'Conditional Waiver and Release on Progress Payment\n\nUpon receipt by the undersigned of a payment from GrayCo Construction Services in the amount of {{AMOUNT}} for labor, services, equipment or materials furnished to the job of {{JOB}} through {{THROUGH}}{{INVOICE}}, this document becomes effective to release any mechanic’s lien, notice, stop notice or payment bond right the undersigned has on that job, to the extent of that payment only.\n\nIt does not cover retention, extras or work after that date, or amounts not yet paid. This release is conditional: it has no effect unless and until that payment is actually received.',
  sub_final: 'Conditional Waiver and Release on Final Payment\n\nUpon receipt by the undersigned of a payment from GrayCo Construction Services in the amount of {{AMOUNT}}, this document becomes effective to release any mechanic’s lien, notice, stop notice or payment bond right the undersigned has on the job of {{JOB}}, for all labor, services, equipment and materials furnished to that job.\n\nThis release is conditional: it has no effect unless and until that payment is actually received.',
  cust_conditional: 'Conditional Waiver and Release on Payment\n\nUpon receipt by GrayCo Construction Services of a payment from {{PAYER}} in the amount of {{AMOUNT}} for labor, services, equipment or materials furnished to the job of {{JOB}} through {{THROUGH}}{{INVOICE}}, GrayCo Construction Services releases any mechanic’s or materialman’s lien right it has on that job, to the extent of that payment only.\n\nThis release is conditional: it has no effect unless and until that payment is actually received and clears. It does not cover retainage, change orders or work after that date, or amounts not yet paid.\n\nGrayCo Construction Services — {{DATE}}',
  cust_unconditional: 'Unconditional Waiver and Release on Payment\n\nGrayCo Construction Services has received a payment from {{PAYER}} in the amount of {{AMOUNT}} for labor, services, equipment or materials furnished to the job of {{JOB}} through {{THROUGH}}{{INVOICE}}, and releases any mechanic’s or materialman’s lien right it has on that job, to the extent of that payment.\n\nThis release does not cover retainage, change orders or work after that date, or amounts not yet paid.\n\nGrayCo Construction Services — {{DATE}}'
};
const WORDING_KEYS = Object.keys(DEFAULT_WORDING);
const PLACEHOLDERS = ['AMOUNT', 'JOB', 'THROUGH', 'INVOICE', 'PAYER', 'CLAIMANT', 'DATE'];

/* swappable for tests: the service-only store, the gc_kv writer, the pause switch, the clock */
function L(){ return require('../bid-inbox.js')._lib; }
const _D = {
  kvGet: async function(k){ return L().kvGet(k); },
  kvCas: async function(k, f){ return L().kvCas(k, f); },
  kvPut: async function(key, value){
    const url = (process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), k = s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
    const H = Object.assign(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' });
    const r = await fetch(url + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H, body: JSON.stringify({ key: key, value: JSON.stringify(value), updated_at: new Date().toISOString() }) });
    return r.ok;
  },
  paused: function(){ return A.paused(); },
  now: function(){ return Date.now(); }
};
function C(){ return A.core(); }
function today(){ return A.central(_D.now()).ymd; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function open(x){ return !!x && (x.status === 'waiting' || x.status === 'sending'); }
function stamp(){ return _D.now().toString(36); }
function safeId(v){ return s(v).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 90); }
function R(status, out){ return { status: status, out: out }; }
function firstName(n){ n = s(n).replace(/^(mr|mrs|ms|dr)\.?\s+/i, ''); const w = n.split(/[\s,&]+/)[0] || ''; return /^[A-Za-z][A-Za-z'-]{1,20}$/.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''; }
function niceDay(d){ try { return new Date(s(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return s(d); } }
async function aqList(){ const cur = await C().kvListRead(C().AQ_KEY); return cur ? cur.list : null; }
/* the job's customer e-mail (the same rule as the automatic reminders: the job, then the customer record) */
function custEmail(data, p){
  const e = s(p.clientEmail || p.customerEmail || p.email); if (okEmail(e)) return low(e);
  const nm = low(p.client || p.customer || p.clientName);
  const c = arr(data.customers).find(function(x){ return nm && low(x.name || x.company) === nm; });
  return c && okEmail(c.email) ? low(c.email) : '';
}
/* a to-do on the shared Office To-Do (gc_office_tasks), once per id; extra fields ride along (they tick it off later) */
async function todoAdd(id, label, o){
  o = o || {}; const now = new Date(_D.now()).toISOString();
  const item = Object.assign({ id: s(id), label: s(label), note: s(o.note), addedBy: 'CRM (office features)', addedAt: now, updatedAt: now, done: false, prio: o.prio || 'normal' }, o.extra || {});
  if (o.due) item.due = o.due; if (o.pid) item.go = { pid: s(o.pid) };
  const has = function(l){ return l.some(function(t){ return t && s(t.id) === item.id; }); };
  const r = await C().kvListUpdate('gc_office_tasks', function(l){ return has(l) ? null : { list: l.concat([item]), check: has }; });
  return !!(r && r.ok && !r.unchanged);
}
async function todoTick(test, why){
  const at = new Date(_D.now()).toISOString(); let n = 0;
  try {
    await C().kvListUpdate('gc_office_tasks', function(l){
      n = 0; l.forEach(function(t){ if (t && !t.done && test(t)) { t.done = true; t.doneAt = at; t.autoDone = true; t.doneNote = why || ''; t.updatedAt = at; n++; } });
      return n ? { list: l, check: function(l2){ return !l2.some(function(t){ return t && !t.done && test(t); }); } } : null;
    });
  } catch (e) {}
  return n;
}

/* ═══════════ (2) COLLECTIONS: one payment reminder, through Approvals ═══════════ */
async function remind(body, who){
  const invId = s(body && body.invoiceId); if (!invId) return R(400, { ok: false, error: 'Which invoice?' });
  const c = C(), data = await c.crmData(true);
  const r = c.listOf(data, ['invs', 'invoices']).find(function(x){ return s(x.id) === invId; });
  if (!r) return R(404, { ok: false, retry: true, error: 'That invoice is not in the cloud yet — try again in a minute.' });
  if (!c.isCustomerInvoice(r)) return R(400, { ok: false, error: 'Only customer invoices get payment reminders.' });
  const bal = c.invBalance(r); if (!(bal > 0)) return R(200, { ok: false, paid: true, error: 'This invoice has nothing left to pay.' });
  const list = await aqList(); if (!list) return R(502, { ok: false, error: 'Could not read ✅ Approvals — try again.' });
  const waiting = list.find(function(x){ return x && x.kind === K.REM && open(x) && s((x.meta || {}).invoiceId) === invId; });
  if (waiting) return R(200, { ok: true, already: true, id: s(waiting.id), status: waiting.status, error: 'A reminder for this invoice is already waiting on ✅ Approvals.' });
  const p = pidOf(r) ? c.findProject(data, pidOf(r)) : null;
  if (!p) return R(404, { ok: false, error: 'The job for this invoice is not in the cloud.' });
  if (p.portalRemindersPaused === true) return R(200, { ok: false, off: 'paused', error: 'Customer e-mails are paused on this job (Customer portal → More). Call the customer instead.' });
  if (c.jaAllows && !c.jaAllows(data, p, 'paymentReminders')) return R(200, { ok: false, off: 'paymentReminders', error: '⏰ Payment reminders are turned off for this job (⚙ Automations).' });
  const to = custEmail(data, p);
  if (!to) return R(200, { ok: false, noEmail: true, error: 'No customer e-mail on this job — add it on the job, or call the customer.' });
  const AR = require('./auto-ar.js');
  const t = today(), due = ymd(r.dueDate || r.due) || ymd(r.date) || t, days = daysBetween(due, t);
  const stage = days >= 30 ? 30 : days >= 15 ? 15 : 7;
  const number = c.invNumber(r), amt = c.invAmount(r), pm = c.pmOf(data, p), client = s(p.client || p.customer || p.clientName);
  let html = AR.letter(stage, { number: number, job: s(p.name) || 'your project', due: due, days: Math.max(days, 0), balance: bal, paid: Math.max(0, amt - bal), client: client, pm: pm && pm.name });
  if (days < 1) html = html.replace(' was due on ', ' is due on ');   /* not late yet: a courtesy note */
  const qid = 'appr_arrem_' + safeId(invId) + '_m' + (list.filter(function(x){ return x && x.kind === K.REM && s((x.meta || {}).invoiceId) === invId; }).length + 1) + '_' + stamp();
  const ok = await c.queueApproval({ id: qid, kind: K.REM, pid: s(p.id), jobName: p.name, pm: null, officeOk: true, to: to,
    title: '⏰ Payment reminder' + (days > 0 ? ' (' + days + ' days late)' : ' (not due yet)') + ' — invoice #' + number + ' ' + usd(bal) + ' to ' + (client || to),
    subject: (days >= 30 ? 'Past due: ' : days >= 15 ? 'Second reminder: ' : days > 0 ? 'Friendly reminder: ' : 'Coming due: ') + 'GrayCo invoice #' + number + ' — ' + usd(bal),
    html: html, attachments: [{ name: 'GrayCo Invoice ' + number + '.pdf', kind: 'pdf', invoiceId: invId }],
    meta: { invoiceId: invId, invoiceNumber: number, stage: stage, daysLate: days, balance: bal, pmName: pm ? pm.name : '', by: s(who && who.email) || 'office', manual: true, from: 'collections' } });
  return ok ? R(200, { ok: true, queued: true, id: qid }) : R(502, { ok: false, error: 'Could not put it on ✅ Approvals — try again.' });
}

/* ═══════════ (7) CHANGE ORDERS: sent, not signed ═══════════ */
function gcCoTitle(co){ return 'Change order #' + s(co.number) + (s(co.title) ? ' — ' + s(co.title) : ''); }
async function cos(opts){
  opts = opts || {};
  const c = C(), t = today(), pidF = s(opts.pid);
  const sr = await c.kvListRead(SIGN_KEY), aq = (await aqList()) || [];
  const out = [];
  function nudges(ref){ return aq.filter(function(x){ return x && (x.kind === K.NUDGE || x.kind === K.GCNUDGE) && s((x.meta || {}).coRef) === ref; }); }
  function deco(o){
    const n = nudges(o.ref), w = n.find(open);
    const sent = n.filter(function(x){ return x.status === 'sent'; }).map(function(x){ return s(x.sentAt || x.updatedAt); }).sort();
    o.days = o.sentAt ? Math.max(0, daysBetween(o.sentAt.slice(0, 10), t)) : null;
    o.openNudge = w ? { id: s(w.id), status: w.status, at: s(w.createdAt) } : null;
    o.lastNudge = sent.length ? sent[sent.length - 1] : '';
    o.nudges = sent.length;
    return o;
  }
  (sr ? sr.list : []).forEach(function(r){
    if (!r || r.kind !== 'change_order' || r.status !== 'pending') return;
    if (pidF && s(r.pid) !== pidF) return;
    const a = aq.find(function(x){ return x && s(x.id) === 'appr_sign_' + s(r.id); });
    const sentAt = a && a.status === 'sent' ? s(a.sentAt || a.updatedAt) : '';
    out.push(deco({ ref: 'sr:' + s(r.id), src: 'customer', pid: s(r.pid), title: s(r.title), amount: r.amount == null ? null : num(r.amount), sentAt: sentAt,
      emailStatus: a ? s(a.status) : 'none', createdAt: s(r.createdAt) }));
  });
  let jobs = {}; try { jobs = obj(await _D.kvGet(GCP_JOBS)); } catch (e) { jobs = {}; }
  Object.keys(jobs).forEach(function(pid){
    if (pidF && pid !== pidF) return;
    arr(obj(jobs[pid]).cos).forEach(function(co){
      if (!co || co.status !== 'sent' || co.signedAt) return;
      out.push(deco({ ref: 'gc:' + pid + ':' + s(co.id), src: 'gc', pid: pid, title: gcCoTitle(co), amount: co.amount == null ? null : num(co.amount), sentAt: s(co.sentAt), emailStatus: 'sent', createdAt: s(co.requestedAt) }));
    });
  });
  out.sort(function(a, b){ return (b.days == null ? -1 : b.days) - (a.days == null ? -1 : a.days); });
  return out;
}
function nudgeHtml(p, co, pmName){
  const amt = co.amount != null ? '<p style="font-size:15px"><b>Change to your contract: ' + esc(usd(co.amount)) + '</b></p>' : '';
  return '<p>Hi ' + esc(firstName(p.client || p.customer) || 'there') + ',</p>' +
    '<p>A friendly reminder: the change order <b>' + esc(co.title) + '</b> for <b>' + esc(s(p.name) || 'your project') + '</b> is still waiting for your signature' + (co.days ? ' (sent ' + co.days + ' day' + (co.days === 1 ? '' : 's') + ' ago)' : '') + '.</p>' + amt +
    '<p>You can review and sign it in your GrayCo Portal in a minute, on your phone or computer. If something in it needs a second look, just reply and ' + esc(pmName || 'your Project Manager') + ' will help.</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + (C().LINK_PH || C().LINK_PH_) + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">Review and sign</a></p>' +
    '<p style="font-size:13px;color:#55626F">Questions? Call the office at 901-585-0944.</p>';
}
function gcNudgeHtml(p, co){
  return '<p>Hello,</p><p>A friendly reminder: <b>' + esc(co.title) + '</b>' + (co.amount != null ? ' (' + esc(usd(co.amount)) + ')' : '') + ' for <b>' + esc(s(p.name) || 'the project') + '</b> is still waiting for your signature' + (co.days ? ' (sent ' + co.days + ' day' + (co.days === 1 ? '' : 's') + ' ago)' : '') + '.</p>' +
    '<p>It is on your GrayCo project page: <a href="{{GC_PORTAL_LINK}}">open the project page</a>. Reply to this e-mail with any questions.</p><p>Thank you,<br>GrayCo Construction Services</p>';
}
async function nudge(body, who){
  const ref = s(body && body.ref); if (!ref) return R(400, { ok: false, error: 'Which change order?' });
  const list = await cos({});
  const co = list.find(function(x){ return x.ref === ref; });
  if (!co) return R(404, { ok: false, error: 'That change order is signed, voided or not found any more.' });
  if (co.openNudge) return R(200, { ok: true, already: true, id: co.openNudge.id, error: 'A reminder for this change order is already waiting on ✅ Approvals.' });
  if (!co.sentAt) return R(200, { ok: false, notSent: true, error: 'Its first e-mail has not gone out yet — it is waiting on ✅ Approvals.' });
  const c = C(), data = await c.crmData(true), p = c.findProject(data, co.pid);
  if (!p) return R(404, { ok: false, error: 'The job is not in the cloud (deleted?).' });
  const qid = 'appr_conudge_' + safeId(ref.replace(/:/g, '_')) + '_' + stamp(), pm = c.pmOf(data, p);
  const meta = { coRef: ref, pid: s(p.id), daysWaiting: co.days, by: s(who && who.email) || 'office', from: 'unsigned-cos' };
  let ok;
  if (co.src === 'gc') {
    const coId = ref.split(':')[2];
    const first = ((await aqList()) || []).filter(function(x){ return x && s(x.id).indexOf('appr_gcp_co_' + coId + '_') === 0 && okEmail(x.to); }).sort(function(a, b){ return s(a.createdAt) < s(b.createdAt) ? 1 : -1; })[0];
    if (!first) return R(200, { ok: false, noEmail: true, error: 'No GC contact found for this change order — add the GC contacts on the job.' });
    ok = await c.queueApproval({ id: qid, kind: K.GCNUDGE, pid: s(p.id), jobName: p.name, pm: pm, officeOk: true, to: low(first.to), channel: 'email',
      title: '✍️ Reminder to sign — ' + co.title + ' (waiting ' + co.days + ' days) → ' + low(first.to), subject: 'Reminder: ' + co.title + ' to sign — ' + (s(p.name) || 'your project'),
      html: gcNudgeHtml(p, co), meta: Object.assign(meta, { gcp: 'nudge', coId: coId }) });
  } else {
    const to = custEmail(data, p);
    if (!to) return R(200, { ok: false, noEmail: true, error: 'No customer e-mail on this job — call the customer instead.' });
    ok = await c.queueApproval({ id: qid, kind: K.NUDGE, pid: s(p.id), jobName: p.name, pm: pm, officeOk: true, to: to,
      title: '✍️ Reminder to sign — ' + co.title + ' (waiting ' + co.days + ' days)', subject: 'Reminder: please review and sign — ' + co.title,
      html: nudgeHtml(p, co, pm && pm.name), attachments: [{ name: 'Change order (in the customer portal)', kind: 'portal' }], meta: Object.assign(meta, { fromPm: true, signRequestId: ref.slice(3) }) });
  }
  return ok ? R(200, { ok: true, queued: true, id: qid }) : R(502, { ok: false, error: 'Could not put it on ✅ Approvals — try again.' });
}

/* ═══════════ (3) SUB PAPERWORK: COI / W-9 requests, through Approvals ═══════════ */
function isSub(v){ return !!(v && (v.isSub === true || /^sub/i.test(s(v.cat)) || /subcontract/i.test(s(v.cat) + ' ' + s(v.type)))); }
function inactive(v){ return !!(v && (v.deleted === true || v.archived === true || v.active === false || v.inactive === true)); }
function coiExpOf(v){ return ymd(v && (v.coiExp || v.insExp || v.insuranceExp || v.coiExpiration)); }
function hasW9(v){ if (!v) return false; if (s(v.tin || v.taxId || v.ein)) return true; const w = v.w9; if (w === true) return true; const t = low(w); return !!t && !/^(no|false|expired|missing|0|none)$/.test(t) && w !== false; }
function subEmail(v){ const e = s(v && (v.email || v.contactEmail || v.billingEmail)); return okEmail(e) ? low(e) : ''; }
function subName(v){ return s(v && (v.company || v.name || v.contact)) || 'your company'; }
function portalBase(){ const v = s(process.env.PORTAL_BASE_URL).replace(/\/$/, ''); return /^https:\/\//.test(v) ? v : 'https://portal.grayco-cs.com'; }
function subDocHtml(o){
  if (o.need.length === 1 && o.need[0] === 'coi' && o.exp) { try { return require('./care11.js').coiMail({ name: o.name, exp: o.exp, days: o.days, lang: o.lang }).html; } catch (e) {} }
  const es = o.lang === 'es';
  const items = o.need.map(function(n){ return n === 'coi' ? (es ? 'su certificado de seguro (COI) vigente' + (o.exp ? ' (el actual vence el ' + niceDay(o.exp) + ')' : '') : 'your current certificate of insurance (COI)' + (o.exp ? ' (the one on file runs out ' + niceDay(o.exp) + ')' : ''))
    : n === 'wc' ? (es ? 'su certificado de compensación laboral vigente (o su exención)' : 'your current workers’ compensation certificate (or your exemption)')
    : (es ? 'su formulario W-9 firmado' : 'your signed W-9 form'); });
  const body = es ? 'Hola ' + esc(o.name) + ', para seguir trabajando con GrayCo y recibir sus pagos a tiempo, necesitamos: ' + esc(items.join(es ? ' y ' : ' and ')) + '. Súbalo en su Portal GrayCo (Papeles), o respóndanos con el documento adjunto.'
    : 'Hi ' + esc(o.name) + ', to keep working with GrayCo and getting paid on time, we need ' + esc(items.join(' and ')) + '. Please upload it in your GrayCo Portal (Papers), or reply to this e-mail with it attached.';
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E">' +
    '<div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center;font-size:18px;font-weight:bold">' + (es ? 'Documentos que necesitamos' : 'Papers we need from you') + '</div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px"><p style="font-size:15px;line-height:1.5">' + body + '</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + esc(portalBase() + '/') + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">' + (es ? 'Subir mis documentos' : 'Upload my papers') + '</a></p>' +
    '<p style="font-size:13px;color:#55626F">' + (es ? '¿Preguntas? Llame a GrayCo al 901-585-0944.' : 'Questions? Call GrayCo at 901-585-0944.') + '</p></div></div>';
}
/* o: { subId, name, email, lang, need:['coi'|'w9'], exp, days, stage, auto, by } → { ok, queued | already, id } */
async function queueSubDoc(o){
  const need = arr2(o.need).filter(function(n){ return n === 'coi' || n === 'w9' || n === 'wc'; });
  if (!need.length) return { ok: false, error: 'Nothing to ask for.' };
  if (!okEmail(o.email)) return { ok: false, noEmail: true, error: 'No e-mail on file for ' + (s(o.name) || 'this sub') + ' — add it on the sub (Subs tab).' };
  const list = await aqList(); if (!list) return { ok: false, error: 'Could not read ✅ Approvals.' };
  const w = list.find(function(x){ return x && x.kind === K.SUBDOC && open(x) && s((x.meta || {}).subId) === s(o.subId); });
  if (w) return { ok: true, already: true, id: s(w.id) };
  const what = need.map(function(n){ return n === 'coi' ? 'COI' : n === 'wc' ? 'workers’ comp' : 'W-9'; }).join(' + ');
  const id = 'appr_subdoc_' + safeId(o.subId) + '_' + need.join('-') + '_' + (o.exp || 'x') + (o.stage ? '_' + o.stage : '') + (o.auto ? '' : '_m' + stamp());
  if (list.some(function(x){ return x && s(x.id) === id; })) return { ok: true, already: true, id: id, done: true };
  const subj = need.indexOf('coi') >= 0 && o.exp ? (o.days < 0 ? 'Your insurance certificate ran out — please send the new one' : 'Your insurance certificate runs out ' + (o.days === 0 ? 'today' : 'in ' + o.days + ' day' + (o.days === 1 ? '' : 's')) + ' — please send the new one')
    : 'GrayCo needs your ' + what;
  const ok = await C().queueApproval({ id: id, kind: K.SUBDOC, pid: '', jobName: '', pm: null, officeOk: true, to: low(o.email), channel: 'email',
    title: '🛡 ' + what + ' request → ' + clip(o.name, 60) + (o.exp ? ' (COI ' + (o.days < 0 ? 'expired ' : 'runs out ') + o.exp + ')' : ''),
    subject: subj, html: subDocHtml({ name: s(o.name), exp: o.exp, days: o.days, lang: o.lang, need: need }),
    meta: { subId: s(o.subId), sub: s(o.name), need: need, exp: o.exp || '', stage: o.stage || '', auto: !!o.auto, by: s(o.by) || 'office' } });
  return ok ? { ok: true, queued: true, id: id } : { ok: false, error: 'Could not put it on ✅ Approvals.' };
}
function arr2(v){ return Array.isArray(v) ? v.map(s) : (s(v) ? [s(v)] : []); }
async function subRecords(){ const v = await C().kvRead(['vendors', 'subs']); const seen = {}; return arr(v.vendors).concat(arr(v.subs)).filter(function(x){ const k = s(x.id) || low(x.name); if (!k || seen[k]) return false; seen[k] = 1; return true; }); }
/* the Sub Compliance board's "Request docs" button */
async function subDoc(body, who){
  const subId = s(body && body.subId), nm = low(body && body.name);
  const v = (await subRecords()).find(function(x){ return (subId && s(x.id) === subId) || (!subId && nm && low(x.name || x.company) === nm); });
  if (!v) return R(404, { ok: false, error: 'That sub is not in the cloud yet.' });
  let need = arr2(body.need).filter(function(n){ return n === 'coi' || n === 'w9' || n === 'wc'; });
  const exp = coiExpOf(v), days = exp ? daysBetween(today(), exp) : null;
  if (!need.length) { if (!exp || days <= 30) need.push('coi'); if (!hasW9(v)) need.push('w9'); }
  if (!need.length) return R(200, { ok: false, nothing: true, error: 'Nothing is missing or running out for this sub.' });
  const q = await queueSubDoc({ subId: s(v.id) || subId, name: subName(v), email: subEmail(v), lang: v.lang === 'es' ? 'es' : 'en', need: need, exp: need.indexOf('coi') >= 0 ? exp : '', days: days, auto: false, by: s(who && who.email) });
  return R(q.ok ? 200 : (q.noEmail ? 200 : 502), Object.assign({ need: need }, q));
}

/* ═══════════ (4) LIENS: the waiver wording, GrayCo's waiver for a customer payment ═══════════ */
async function wording(){
  let v = {}; try { v = obj((await C().kvRead([WORDING_KEY]))[WORDING_KEY]); } catch (e) { v = {}; }
  const out = { texts: {}, custom: {}, by: s(v.by), at: s(v.at), draftNote: DRAFT, placeholders: PLACEHOLDERS };
  WORDING_KEYS.forEach(function(k){ const t = s(v[k]); out.custom[k] = !!t; out.texts[k] = t || DEFAULT_WORDING[k]; });
  return out;
}
async function wordingSet(texts, who){
  const cur = await wording(), next = { by: s(who && (who.name || who.email)), at: new Date(_D.now()).toISOString() };
  WORDING_KEYS.forEach(function(k){
    const t = texts && typeof texts[k] === 'string' ? String(texts[k]).replace(/\r/g, '').trim().slice(0, 6000) : (cur.custom[k] ? cur.texts[k] : '');
    if (t && t !== DEFAULT_WORDING[k]) next[k] = t;   /* the built-in text is not stored: a later fix to it reaches everyone */
  });
  return (await _D.kvPut(WORDING_KEY, next)) ? wording() : null;
}
/* the wording as HTML: paragraphs (blank lines), the first one bold (the title); placeholders filled and escaped */
function fill(tpl, vals){
  const paras = String(tpl || '').replace(/\r/g, '').split(/\n\s*\n/).map(function(x){ return x.trim(); }).filter(Boolean);
  return paras.map(function(p, i){
    let h = esc(p).replace(/\{\{([A-Z]+)\}\}/g, function(m, k){ return Object.prototype.hasOwnProperty.call(vals, k) ? esc(vals[k]) : ''; }).replace(/\n/g, '<br>');
    return i === 0 ? '<p><b>' + h + '</b></p>' : '<p>' + h + '</p>';
  }).join('');
}
async function lienCustomer(body, who){
  const invId = s(body && body.invoiceId), kind = s(body && body.kind) === 'unconditional' ? 'unconditional' : 'conditional';
  const c = C(), data = await c.crmData(true);
  const r = c.listOf(data, ['invs', 'invoices']).find(function(x){ return s(x.id) === invId; });
  if (!r) return R(404, { ok: false, error: 'That invoice is not in the cloud yet.' });
  if (!c.isCustomerInvoice(r)) return R(400, { ok: false, error: 'Only customer invoices.' });
  const p = pidOf(r) ? c.findProject(data, pidOf(r)) : null; if (!p) return R(404, { ok: false, error: 'The job is not in the cloud.' });
  if (c.jaAllows && !c.jaAllows(data, p, 'lienWaivers')) return R(200, { ok: false, off: 'lienWaivers', error: '📑 Lien waivers are turned off for this job (⚙ Automations).' });
  const amt = c.invAmount(r), bal = c.invBalance(r), got = r2(Math.max(0, amt - bal));
  if (kind === 'unconditional' && !(got > 0)) return R(200, { ok: false, error: 'No payment is recorded on this invoice yet — send a conditional waiver, or record the payment first.' });
  const list = await aqList(); if (!list) return R(502, { ok: false, error: 'Could not read ✅ Approvals.' });
  const w = list.find(function(x){ return x && x.kind === K.CWAIVER && open(x) && s((x.meta || {}).invoiceId) === invId && s((x.meta || {}).waiver) === kind; });
  if (w) return R(200, { ok: true, already: true, id: s(w.id), error: 'This waiver is already waiting on ✅ Approvals.' });
  const to = s(body.to) && okEmail(body.to) ? low(body.to) : custEmail(data, p);
  if (!to) return R(200, { ok: false, noEmail: true, error: 'No customer e-mail on this job.' });
  const W = await wording(), number = c.invNumber(r), payer = s(p.client || p.customer || p.clientName) || 'the owner';
  const vals = { AMOUNT: usd(kind === 'unconditional' ? got : (bal > 0 ? bal : amt)), JOB: s(p.name) + (s(p.address) ? ', ' + s(p.address) : ''), THROUGH: niceDay(ymd(r.date || r.invDate) || today()),
    INVOICE: ' (invoice ' + number + ')', PAYER: payer, CLAIMANT: 'GrayCo Construction Services', DATE: niceDay(today()) };
  const html = '<p>Hi ' + esc(firstName(payer) || 'there') + ',</p><p>Attached below is GrayCo’s ' + kind + ' lien waiver for invoice #' + esc(number) + ' on ' + esc(s(p.name) || 'your project') + '.</p>' +
    '<div style="border:1px solid #E2DCCD;border-radius:10px;padding:12px 14px;background:#FBFAF6">' + fill(W.texts['cust_' + kind], vals) + '</div>';
  const qid = 'appr_lienw_' + safeId(invId) + '_' + kind + '_' + stamp();
  const ok = await c.queueApproval({ id: qid, kind: K.CWAIVER, pid: s(p.id), jobName: p.name, pm: c.pmOf(data, p), officeOk: true, to: to,
    title: '📜 ' + (kind === 'unconditional' ? 'Unconditional' : 'Conditional') + ' lien waiver — invoice #' + number + ' ' + vals.AMOUNT + ' → ' + payer, subject: 'Lien waiver — ' + (s(p.name) || 'your project') + ' (invoice #' + number + ')',
    html: html, meta: { invoiceId: invId, waiver: kind, amount: kind === 'unconditional' ? got : (bal > 0 ? bal : amt), by: s(who && who.email), custom: !!W.custom['cust_' + kind], from: 'liens' } });
  return ok ? R(200, { ok: true, queued: true, id: qid }) : R(502, { ok: false, error: 'Could not put it on ✅ Approvals.' });
}

/* ═══════════ the daily office run (care11-scheduled.js calls it) ═══════════ */
async function daily(opts){
  opts = opts || {};
  const rep = { ok: true, lienTodos: 0, lienTicked: 0, coTodos: 0, w9Queued: 0 };
  if (await _D.paused()) return Object.assign(rep, { dataEntryMode: true });
  const c = C(), t = today(), data = await c.crmData(true);
  const P = {}; arr(data.projects).forEach(function(p){ if (p && p.id) P[s(p.id)] = p; });
  /* liens: one to-do per job, rule and date, from 21 days before the aim date */
  for (const p of arr(data.projects)) {
    if (!LD.on(p) || p.deleted === true) continue;
    for (const x of LD.reminders(p, t)) {
      const id = 'OFFLIEN_' + safeId(p.id) + '_' + safeId(x.key) + '_' + x.due;
      if (await todoAdd(id, '⚖️ Lien deadline (' + x.state + '): ' + x.title + ' — ' + (s(p.name) || 'job') + ' · last day ' + x.due,
        { pid: p.id, due: x.aim, prio: x.urgent ? 'high' : 'normal', extra: { kind: 'lien_deadline', offLien: { pid: s(p.id), key: x.key, due: x.due } },
          note: 'Aim to have it done by ' + x.aim + ' (last day ' + x.due + '). ' + x.cite + '. A planning estimate — confirm with your lawyer. Open the job → 🧰 Job tools → ⚖️ Liens & waivers to mark it done.' })) rep.lienTodos++;
    }
  }
  rep.lienTicked = await todoTick(function(tk){
    const o = tk.offLien; if (!o || !o.pid) return false;
    const p = P[s(o.pid)]; if (!p || !LD.on(p)) return true;
    const d = ((p.lienTrack || {}).done || {})[o.key]; return !!d;
  }, 'Marked done on the job, or lien tracking turned off.');
  /* change orders waiting 7+ days with no reminder waiting → one office to-do each */
  try {
    for (const co of await cos({})) {
      if (co.days == null || co.days < CO_TODO_DAYS || co.openNudge) continue;
      const p = P[co.pid]; if (!p) continue;
      if (await todoAdd('OFFCO_' + safeId(co.ref.replace(/:/g, '_')), '✍️ Change order not signed (' + co.days + ' days): ' + co.title + ' — ' + (s(p.name) || 'job'),
        { pid: co.pid, due: t, prio: co.days >= 14 ? 'high' : 'normal', extra: { kind: 'co_unsigned', offCo: { ref: co.ref } },
          note: 'Sent ' + co.sentAt.slice(0, 10) + ' and not signed yet. Open the job → 🧰 Job tools → ✍️ Unsigned COs → Nudge (it waits on ✅ Approvals), or call them.' })) rep.coTodos++;
    }
  } catch (e) { rep.coError = clip(e && e.message || e, 120); }
  /* W-9: a sub working for us (on an open job, or paid in the last 180 days) with no W-9 → asked once */
  try {
    const st = obj(await _D.kvGet(STATE_KEY)), asked = obj(st.w9), newly = {};
    const subs = (await subRecords()).filter(function(v){ return isSub(v) && !inactive(v) && !hasW9(v) && subEmail(v) && !asked[s(v.id)]; });
    const working = {}, since = A.addDays(t, -W9_ACTIVE_DAYS);
    arr(data.projects).forEach(function(p){ if (!p || /lost|dead|cancel|closed|complete/i.test(s(p.status))) return; arr(p.subs).concat(arr(p.subAgreements)).forEach(function(x){ if (x) { if (s(x.subId)) working['id:' + s(x.subId)] = 1; const nm = low(x.name || x.sub || x.vendor || x.subName); if (nm) working['n:' + nm] = 1; } }); });
    c.listOf(data, ['invs', 'invoices']).forEach(function(r){ if (!/sub/.test(low(r.type)) || (ymd(r.date || r.recvDate) || '') < since) return; if (s(r.subId)) working['id:' + s(r.subId)] = 1; const nm = low(r.sub || r.vendor); if (nm) working['n:' + nm] = 1; });
    for (const v of subs) {
      if (rep.w9Queued >= W9_PER_RUN) break;
      if (!working['id:' + s(v.id)] && !working['n:' + low(v.name)] && !working['n:' + low(v.company)]) continue;
      const q = await queueSubDoc({ subId: s(v.id), name: subName(v), email: subEmail(v), lang: v.lang === 'es' ? 'es' : 'en', need: ['w9'], auto: true, by: 'CRM (W-9 missing)' });
      if (q.ok && q.queued) { rep.w9Queued++; newly[s(v.id)] = { at: new Date(_D.now()).toISOString(), id: q.id }; }
    }
    if (Object.keys(newly).length) await _D.kvCas(STATE_KEY, function(v){ const y = obj(v); y.w9 = Object.assign(obj(y.w9), newly); y.last = new Date(_D.now()).toISOString(); return y; });
  } catch (e) { rep.w9Error = clip(e && e.message || e, 120); }
  return rep;
}

module.exports = { K, remind, cos, nudge, queueSubDoc, subDoc, wording, wordingSet, fill, lienCustomer, daily, custEmail, hasW9, coiExpOf, isSub,
  DEFAULT_WORDING, WORDING_KEYS, WORDING_KEY, STATE_KEY, PLACEHOLDERS, _D };
