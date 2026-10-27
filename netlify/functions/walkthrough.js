// netlify/functions/walkthrough.js
// GrayCo — the FINAL WALKTHROUGH, signed by the customer in the portal (patch AUTO8).
//
// Owner 10/21: "Customer signs the final walkthrough. The punch list is signed in the portal, and that signature
// automatically queues the final invoice for approval."
//
// The CRM keeps the walkthrough on the job: project.walkthrough = { id, items: [{ id, text, done }], note, sentAt,
// sentBy, updatedAt }. A changed list after it was sent gets a new id (it needs a new signature).
// What the CUSTOMER does is kept apart, in gc_kv "walkthroughResponses" — written ONLY here, read by the CRM, which
// then makes the final invoice (draft) and puts it on ✅ Approvals (patch AUTO8 in index.html).
//
// PUBLIC (the customer's portal link code in x-portal-token, or a portal session — exactly like selections.js):
//   POST {action:'view'}                                 → this ONE job's walkthrough (when it was sent) + signed copies
//   POST {action:'sign', wtId, name, strokes?, agree:true} → the customer accepts the finished work
//   The typed name, the time and the address (IP) are recorded; a signed copy (PDF) goes to the private file storage
//   and to the customer by e-mail at once (a signed copy is never held for approval); the PM gets a note and the office
//   a to-do.
// STAFF (signed in to the CRM + on gc_staff):
//   POST {action:'request-sign', projectId}  → the e-mail asking the customer to sign waits on ✅ Approvals
//                                             (kind walkthrough_sign — the job's PM approves it)
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');
const SEL = require('./selections.js')._sel;
const RESP_KEY = 'walkthroughResponses';
const ID_RE = /^[A-Za-z0-9_.:-]{1,90}$/;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function okEmail(v){ return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(v)); }
function firstName(v){ return s(v).split(/\s+/)[0] || ''; }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function portalCore(){ return require('./portal.js')._core; }

/* the walkthrough the customer may see: only once it was sent, never a removed or empty one */
function wtOf(p){
  const w = p && p.walkthrough;
  if (!w || typeof w !== 'object' || !s(w.id) || !s(w.sentAt) || w.removed === true) return null;
  const items = arr(w.items).filter(function(x){ return s(x.text); }).slice(0, 80);
  return { id: s(w.id), items: items, note: s(w.note), sentAt: s(w.sentAt) };
}
async function loadJob(pid){
  const data = await SEL.kvRead(['projects', 'gc_deleted_projects', 'users', RESP_KEY]);
  const p = SEL.findProject(data, pid);
  return p ? { data: data, p: p, wt: wtOf(p), resps: arr(data[RESP_KEY]).filter(function(r){ return s(r.pid) === s(pid); }) } : null;
}
function signedFor(J){ return J.wt ? J.resps.filter(function(r){ return s(r.wtId) === J.wt.id; }).sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; })[0] || null : null; }
async function view(J){
  const words = SEL.carrierWords(J.p), T = function(v){ return SEL.scrubText(v, words); };
  const refs = J.resps.map(function(r){ return r.docRef; });
  const signed = await SEL.signRefs(refs);
  const out = { ok: true, job: { name: T(J.p.name) }, walkthrough: null, docs: [] };
  if (J.wt) {
    const r = signedFor(J);
    out.walkthrough = { id: J.wt.id, note: T(clip(J.wt.note, 600)), items: J.wt.items.map(function(x){ return { text: T(clip(x.text, 300)), done: x.done !== false }; }),
      status: r ? 'signed' : 'needs-sign', signed: r ? { name: clip(r.name, 80), at: s(r.at) } : null };
  }
  const seen = {};
  J.resps.slice().sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; }).forEach(function(r){ const u = signed[r.docRef]; if (u && !seen[r.docRef]) { seen[r.docRef] = 1; out.docs.push({ title: clip(r.docName || 'Signed final walkthrough', 90), at: s(r.at), url: u }); } });
  return out;
}
function signedCopy(o){
  const b = [{ t: 'title', text: 'GrayCo Construction Services' }, { t: 'p', text: 'Final walkthrough — accepted', bold: true, size: 12 }, { t: 'gap', h: 4 },
    { t: 'p', text: 'Job: ' + o.job }, o.address ? { t: 'p', text: 'Address: ' + o.address } : null, { t: 'p', text: 'Customer: ' + o.customer }, { t: 'gap', h: 6 }, { t: 'h', text: 'Punch list / walkthrough items' }];
  o.items.forEach(function(x){ b.push({ t: 'row', left: x.text, right: x.done ? 'Complete' : 'To finish (agreed)' }); });
  if (o.note) b.push({ t: 'gap', h: 4 }, { t: 'p', text: 'Notes: ' + o.note });
  b.push({ t: 'gap', h: 10 });
  b.push({ t: 'p', text: 'I walked through the finished work with GrayCo. The items above are complete, or will be finished as listed. I accept the work as complete, subject to the GrayCo warranty, and I understand the final invoice for the balance is next.' });
  b.push({ t: 'gap', h: 6 }, { t: 'h', text: 'Signature' }, { t: 'sig', strokes: o.strokes, name: o.name });
  b.push({ t: 'p', text: 'Signed by: ' + o.name + (o.strokes && o.strokes.length ? ' (typed name and drawn signature)' : ' (typed name — accepted electronically)') });
  b.push({ t: 'p', text: 'Date and time: ' + SEL.central(o.at) }, { t: 'p', text: 'Signed in the GrayCo customer portal from address ' + o.ip + ' · reference ' + o.ref, size: 9, muted: true });
  b.push({ t: 'gap', h: 10 }, { t: 'p', text: 'GrayCo Construction Services · ' + SEL.OFFICE_PHONE + ' · portal.grayco-cs.com', size: 9, muted: true });
  return SEL.buildPdf(b.filter(Boolean));
}
function pmOfJob(J){
  const pmName = s(J.p.pm || J.p.projectManager || J.p.pmName);
  const pmUser = arr(J.data.users).find(function(u){ return pmName && low(u.name) === low(pmName); });
  return { name: pmName, email: low((pmUser && pmUser.email) || J.p.pmEmail) };
}
function jobTag(J, jobName){ return [s(J.p.autoPO || J.p.po) ? 'PO ' + s(J.p.autoPO || J.p.po) : '', jobName, s(J.p.address || J.p.jobAddress)].filter(Boolean).join(' · '); }

async function sign(event, body, J){
  if (!J.wt) return { status: 404, out: { ok: false, error: 'There is no walkthrough to sign on this job yet.' } };
  if (s(body.wtId) !== J.wt.id) return { status: 409, out: { ok: false, error: 'The walkthrough list changed — reload the page to see the newest one.' } };
  if (signedFor(J)) return { status: 409, out: { ok: false, error: 'You already signed this walkthrough.' } };
  const name = SEL.cleanName(body.name);
  if (!name) return { status: 400, out: { ok: false, error: 'Please type your full name (letters only) to sign.' } };
  if (body.agree !== true) return { status: 400, out: { ok: false, error: 'Please tick the box to agree.' } };
  const cs = SEL.cleanStrokes(body.strokes); if (!cs.ok) return { status: 400, out: { ok: false, error: 'The drawn signature could not be read — clear it and sign again.' } };
  const ip = SEL.ipOf(event), at = new Date().toISOString(), ref = 'wt_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const words = SEL.carrierWords(J.p), T = function(v){ return SEL.scrubText(v, words); };
  const jobName = T(J.p.name) || 'the job';
  const items = J.wt.items.map(function(x){ return { text: T(clip(x.text, 300)), done: x.done !== false }; });
  const customer = s(J.p.client || J.p.clientName || J.p.customer);
  const pdf = signedCopy({ job: jobName, address: s(J.p.address), customer: customer || name, items: items, note: T(clip(J.wt.note, 600)), name: name, strokes: cs.strokes, at: at, ip: ip, ref: ref });
  const docRef = await SEL.uploadPdf(pdf);
  const docName = 'Signed final walkthrough — ' + at.slice(0, 10) + '.pdf';
  const rec = { id: ref, pid: s(J.p.id), wtId: J.wt.id, name: name, at: at, ip: clip(ip, 60), ua: clip(SEL.gcHeader(event, 'user-agent'), 160), docRef: docRef, docName: docName,
    open: items.filter(function(x){ return !x.done; }).length, drawn: cs.strokes.length > 0, strokes: cs.strokes.length ? cs.strokes : undefined };
  const core = portalCore();
  const has = function(l){ return l.some(function(x){ return s(x.id) === rec.id; }); };
  const res = await core.kvListUpdate(RESP_KEY, function(l){
    if (l.some(function(x){ return s(x.pid) === rec.pid && s(x.wtId) === rec.wtId; })) return { list: null, result: 'conflict' };
    return { list: l.concat([rec]).slice(-3000), check: has, result: 'ok' };
  });
  if (!res.ok) return { status: 503, out: { ok: false, error: 'We could not save it just now. Please try again in a minute, or call GrayCo ' + SEL.OFFICE_PHONE + '.' } };
  if (res.result === 'conflict') return { status: 409, out: { ok: false, error: 'This was already signed — reload the page.' } };
  const pm = pmOfJob(J);
  try { await core.officeTodo('portal_wt_' + ref, '🏁 ' + name + ' signed the final walkthrough — ' + jobName,
    'Signed in the customer portal ' + SEL.central(at) + (pm.name ? '. PM: ' + pm.name : '') + '. The final invoice is drafted and waits on ✅ Approvals (the CRM makes it). The signed copy is in the job\'s documents.'); } catch (e) {}
  let pmMail = { ok: false }, custMail = { ok: false };
  if (okEmail(pm.email)) pmMail = await SEL.resend({ to: pm.email, from: 'GrayCo CRM <office@grayco-cs.com>', subject: 'Final walkthrough signed — ' + jobTag(J, jobName),
    html: SEL.mailShell(jobName, '<p>' + esc(name) + ' signed the final walkthrough in the customer portal (' + esc(SEL.central(at)) + ').</p>' + (rec.open ? '<p><b>' + rec.open + ' item(s) still to finish</b> — as listed on the walkthrough.</p>' : '') + '<p>The final invoice is drafted in the CRM and waits on ✅ Approvals.</p>') });
  const to = s(J.p.clientEmail || J.p.customerEmail || J.p.email);
  if (okEmail(to)) custMail = await SEL.resend({ to: to, replyTo: /@grayco-cs\.com$/i.test(pm.email || '') ? pm.email : '', subject: 'Your signed final walkthrough — ' + jobTag(J, jobName),
    html: SEL.mailShell(jobName, '<p>Hi ' + esc(firstName(customer || name) || 'there') + ',</p><p>Thank you! You signed the final walkthrough for your job in your GrayCo Portal. Your copy is attached and is always in your portal.</p><p>Questions? Call ' + esc(pm.name || 'us') + ' or the office at ' + SEL.OFFICE_PHONE + '.</p>'),
    attachments: [{ filename: docName.replace(/[^\w .()-]+/g, '-'), content: pdf.toString('base64') }] });
  return { status: 200, out: { ok: true, ref: ref, copy: !!docRef, emailed: !!custMail.ok, pmTold: !!pmMail.ok } };
}

/* STAFF: ask the customer to sign (the e-mail waits on ✅ Approvals for the PM) */
async function requestSign(pid, who){
  const J = await loadJob(pid);
  if (!J) return { status: 404, out: { ok: false, retry: true, error: 'The job is not in the cloud yet.' } };
  if (!J.wt) return { status: 400, out: { ok: false, retry: true, error: 'Save the walkthrough list first (the cloud does not have it yet).' } };
  if (signedFor(J)) return { status: 200, out: { ok: true, already: true } };
  const words = SEL.carrierWords(J.p), jobName = SEL.scrubText(J.p.name, words) || 'your job';
  const to = s(J.p.clientEmail || J.p.customerEmail || J.p.email);
  const core = portalCore();
  const pm = pmOfJob(J);
  if (!okEmail(to)) {
    await core.officeTodo('portal_wtsign_' + pid + '_' + J.wt.id, 'Ask ' + (s(J.p.client) || 'the customer') + ' to sign the final walkthrough — ' + jobName,
      'No customer e-mail on file. The walkthrough waits for the customer\'s signature in their portal (Home → Final walkthrough). Call or text them the portal link.');
    return { status: 200, out: { ok: true, todo: true, noEmail: true } };
  }
  const list = J.wt.items.slice(0, 30).map(function(x){ return '<li>' + esc(SEL.scrubText(clip(x.text, 200), words)) + (x.done === false ? ' <i>(to finish)</i>' : '') + '</li>'; }).join('');
  const html = SEL.mailShell(jobName, '<p>Hi ' + esc(firstName(J.p.client) || 'there') + ',</p><p>Your job is finished! Please look over the final walkthrough' + (pm.name ? ' you did with ' + esc(pm.name) : '') + ' and sign it in your GrayCo Portal:</p><ul>' + list + '</ul>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + core.LINK_PH + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">Review and sign</a></p>' +
    '<p style="font-size:13px;color:#55626F">Questions? Call ' + esc(pm.name || 'us') + ' or the office at ' + SEL.OFFICE_PHONE + '.</p>');
  const id = 'appr_wt_' + pid + '_' + J.wt.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const q = await core.queueApproval({ id: id, kind: 'walkthrough_sign', title: '🏁 Final walkthrough for signature — ' + clip(jobName, 80), pid: pid, jobName: jobName, pm: pm.name ? pm : null, to: to,
    subject: 'Please sign your final walkthrough — ' + jobName, html: html, attachments: [{ name: 'Final walkthrough (in the customer portal)', kind: 'portal' }], meta: { by: who.email, wtId: J.wt.id } });
  return { status: q ? 200 : 502, out: { ok: !!q, queued: !!q, id: id } };
}

function reply(statusCode, headers, obj){ return { statusCode: statusCode, headers: headers, body: JSON.stringify(obj) }; }
async function notActive(headers, t0){ const wait = SEL.MIN_FAIL_MS + Math.floor(Math.random() * 60) - (Date.now() - t0); if (wait > 0) await sleep(wait); return reply(404, headers, { ok: false, error: SEL.NOT_ACTIVE }); }

exports.handler = async function(event){
  event = event || {};
  const t0 = Date.now();
  const headers = Object.assign(SEL.gcCors(event, 'POST, OPTIONS', 'x-portal-token, x-portal-session'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  if (String(event.body || '').length > 200000) return reply(413, headers, { ok: false, error: 'Too big' });
  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  if (typeof body !== 'object' || Array.isArray(body)) return reply(400, headers, { ok: false, error: 'Bad request' });
  const action = s(body.action || 'view');

  if (action === 'request-sign') {
    const who = await SEL.gcStaffAuth(event);
    if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
    if (!SEL.svcKey()) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
    const pid = s(body.projectId);
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(pid)) return reply(400, headers, { ok: false, error: 'Open a job first.' });
    try { const r = await requestSign(pid, who); return reply(r.status, headers, r.out); }
    catch (e) { return reply(500, headers, { ok: false, error: 'Could not queue it: ' + clip(e && e.message || e, 120) }); }
  }

  if (['view', 'sign'].indexOf(action) < 0) return reply(400, headers, { ok: false, error: 'Bad request' });
  if (action === 'sign' && body.wtId != null && !ID_RE.test(s(body.wtId))) return reply(400, headers, { ok: false, error: 'Bad request' });
  const ip = SEL.ipOf(event);
  if (SEL.limited(ip)) { await sleep(SEL.MIN_FAIL_MS); return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + SEL.OFFICE_PHONE + '.' }); }
  const token = s(SEL.gcHeader(event, 'x-portal-token')), sess = s(SEL.gcHeader(event, 'x-portal-session'));
  if ((!SEL.TOKEN_RE.test(token) && !sess) || !SEL.svcKey()) { SEL.noteBad(ip); return notActive(headers, t0); }
  let row = null;
  try { row = SEL.TOKEN_RE.test(token) ? await SEL.tokenRow(token) : await SEL.sessionLinkRow(sess, s(body.projectId)); } catch (e) {}
  if (!row || row.revoked === true) { SEL.noteBad(ip); return notActive(headers, t0); }
  let J = null;
  try { J = await loadJob(s(row.project_id)); } catch (e) { return reply(503, headers, { ok: false, error: 'We could not load your walkthrough just now. Please try again in a minute, or call GrayCo ' + SEL.OFFICE_PHONE + '.' }); }
  if (!J) return notActive(headers, t0);
  if (action === 'view') return reply(200, headers, await view(J));
  if (body.preview === true) return reply(403, headers, { ok: false, error: 'Preview — only the customer can sign.' });
  if (SEL.tooManyWrites(row.token)) return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + SEL.OFFICE_PHONE + '.' });
  try { const r = await sign(event, body, J); return reply(r.status, headers, r.out); }
  catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong — please call GrayCo ' + SEL.OFFICE_PHONE + '.' }); }
};
exports._wt = { wtOf: wtOf, signedFor: signedFor, view: view, sign: sign, requestSign: requestSign, loadJob: loadJob, RESP_KEY: RESP_KEY };
