/* ============================================================================
   GrayCo — THE CUSTOMER'S "YOUR CREW" CARD (patch SUBCONTACT).        netlify/functions/_lib/subcontact.js

   Owner: "all customer portals can have subcontractors' information for communication if requested and approved
   by the PM." The hard rule stays: the customer never learns that subs have a portal of their own, and never sees a
   sub's price, invoice or any internal note.

   • The customer taps "Request your trade contacts" on the job's portal page → a request on ✅ Approvals
     (kind sub_contact) for the job's PM; nobody answered in 24 h → it goes to the office (portal.js escalateDue);
     a job with no PM → the admins (then the office after 24 h, the usual rule).
   • The PM (or the office / an admin) approves it with the per-sub picker — which subs, which fields (company name
     always; contact person, phone, e-mail; default company name + phone) — or turns a sub on from the job page
     ("Share contact with customer", default OFF) without a request.
   • The portal then shows "Your crew": ONLY the shared subs' company name, trade and the shared fields. Revoked →
     gone at once. Who shared / revoked and when is logged on the job's record.
   Data: gc_kv "gc_sub_share" — one record per job { id, pid, subs: { <subKey>: { on, fields, name, by, email, at } },
   request: { at, status, qid, by }, log: [...] }. The sub's own record (gc_kv "subs") is only read, never changed.
   ========================================================================== */
'use strict';

const KEY = 'gc_sub_share';
const FIELDS = ['company', 'contact', 'phone', 'email'];
const DEFAULT_FIELDS = ['company', 'phone'];
const LOG_MAX = 200;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
  return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : [];
}
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function norm(v){ return low(v).replace(/[^a-z0-9]/g, ''); }
function nowIso(){ return new Date().toISOString(); }
function okEmail(e){ return /^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function okPhone(p){ const d = s(p).replace(/[^0-9]/g, ''); return d.length >= 7 && d.length <= 15; }

/* the subs ASSIGNED to this job (the job's own list) — key = the sub record's id, else its name */
function keyOf(subId, name){ return s(subId) ? 'id:' + s(subId) : (norm(name) ? 'n:' + norm(name) : ''); }
function subRec(subs, subId, name){
  const list = arr(subs);
  return (s(subId) && list.find(function(x){ return s(x.id) === s(subId); })) ||
    (norm(name) && list.find(function(x){ return norm(x.name) === norm(name) || norm(x.company) === norm(name); })) || null;
}
function firstTrade(r){ if (!r) return ''; if (s(r.trade)) return s(r.trade); const t = Array.isArray(r.trades) ? r.trades.map(s).filter(Boolean) : []; return t[0] || ''; }
function jobSubs(p, subs){
  const out = [], seen = {};
  function add(subId, name, trade){
    const r = subRec(subs, subId, name), id = s(subId) || s(r && r.id), nm = s(name) || s(r && (r.company || r.name));
    const k = keyOf(id, nm); if (!k || seen[k]) return; seen[k] = 1;
    out.push({ key: k, subId: id, name: clip(s(r && (r.company || r.name)) || nm, 90), trade: clip(s(trade) || firstTrade(r), 40), rec: r });
  }
  arr(p && p.subs).forEach(function(x){ if (x.deleted === true || /^(removed|declined|cancel)/i.test(s(x.status))) return; add(x.subId, x.name || x.sub || x.vendor, x.trade); });
  arr(p && p.subAgreements).forEach(function(a){ if (a.deleted === true || /void|cancel/i.test(s(a.status))) return; add(a.subId, a.sub || a.subName, a.trade); });
  return out;
}
function cleanFields(f){
  const want = Array.isArray(f) ? f.map(low) : DEFAULT_FIELDS;
  const out = FIELDS.filter(function(k){ return want.indexOf(k) >= 0; });
  if (out.indexOf('company') < 0) out.unshift('company');   /* the company name always shows (who it is) */
  return out;
}
function recOf(list, pid){ return arr(list).find(function(x){ return s(x.pid) === s(pid); }) || null; }
function blank(pid){ return { id: 'ss_' + s(pid), pid: s(pid), subs: {}, request: null, log: [] }; }

/* what the CUSTOMER gets: only the shared subs still on the job, only these strings. Nothing else. */
function crewFor(p, subs, rec){
  if (!p || !rec || !rec.subs) return [];
  const out = [];
  jobSubs(p, subs).forEach(function(j){
    const sh = rec.subs[j.key]; if (!sh || sh.on !== true) return;
    const f = cleanFields(sh.fields), r = j.rec || {};
    const c = { company: j.name, trade: j.trade };
    if (f.indexOf('contact') >= 0) { const v = clip(r.contact || r.contactName || r.contactPerson || r.owner, 60); if (v) c.contact = v; }
    if (f.indexOf('phone') >= 0) { const v = s(r.phone || r.cell || r.mobile || r.contactPhone); if (okPhone(v)) c.phone = clip(v, 30); }
    if (f.indexOf('email') >= 0) { const v = s(r.email || r.contactEmail); if (okEmail(v)) c.email = clip(v, 120); }
    out.push(c);
  });
  return out;
}
/* the staff view of one job: every assigned sub, its share state, the log, the request */
function staffView(p, subs, rec){
  rec = rec || blank(p && p.id);
  return {
    subs: jobSubs(p, subs).map(function(j){
      const sh = (rec.subs || {})[j.key] || null, r = j.rec || {};
      return { key: j.key, subId: j.subId, name: j.name, trade: j.trade, on: !!(sh && sh.on === true), fields: sh && sh.on ? cleanFields(sh.fields) : DEFAULT_FIELDS.slice(),
        has: { contact: !!s(r.contact || r.contactName || r.contactPerson || r.owner), phone: okPhone(r.phone || r.cell || r.mobile || r.contactPhone), email: okEmail(r.email || r.contactEmail) },
        by: sh ? s(sh.by) : '', at: sh ? s(sh.at) : '' };
    }),
    request: rec.request || null,
    log: arr(rec.log).slice(-30).reverse()
  };
}
/* apply a selection [{ key, on, fields }] to the record (in place); returns the log lines it added */
function applyShare(rec, p, subs, sel, me, via){
  const js = jobSubs(p, subs), byKey = {}; js.forEach(function(j){ byKey[j.key] = j; });
  const at = me.at || nowIso(), lines = [];
  rec.subs = rec.subs || {};
  arr(sel).forEach(function(x){
    const k = s(x.key), j = byKey[k]; if (!j) return;   /* only a sub that is on this job */
    const on = x.on === true, f = cleanFields(x.fields), cur = rec.subs[k];
    if (!on && !(cur && cur.on)) return;
    if (on && cur && cur.on && JSON.stringify(cleanFields(cur.fields)) === JSON.stringify(f)) return;
    rec.subs[k] = on ? { on: true, fields: f, name: j.name, by: me.by, email: me.email, role: me.role, at: at } : { on: false, fields: cleanFields(cur && cur.fields), name: j.name, by: me.by, email: me.email, role: me.role, at: at };
    lines.push({ at: at, op: on ? (cur && cur.on ? 'change' : 'share') : 'revoke', key: k, name: j.name, trade: j.trade, fields: on ? f : [], by: me.by, email: me.email, role: me.role, via: via || '' });
  });
  rec.log = arr(rec.log).concat(lines).slice(-LOG_MAX);
  return lines;
}
function sanitizeSel(v){
  return arr(v).slice(0, 60).map(function(x){ return { key: clip(x.key, 120), on: x.on === true, fields: Array.isArray(x.fields) ? x.fields.slice(0, 8).map(function(f){ return clip(f, 20); }) : undefined }; }).filter(function(x){ return x.key; });
}

/* ── the server parts (portal.js hands in its core) ───────────────────────── */
async function readAll(C){
  const kv = await C.kvRead(['subs', KEY]);
  return { subs: arr(kv.subs), list: arr(kv[KEY]) };
}
async function writeRec(C, pid, mutate){
  return C.kvListUpdate(KEY, function(l){
    let rec = l.find(function(x){ return s(x.pid) === s(pid); });
    if (!rec) { rec = blank(pid); l.push(rec); }
    const res = mutate(rec);
    if (res === false) return null;
    const snap = JSON.stringify(rec);
    return { list: l, result: rec, check: function(l2){ const z = l2.find(function(x){ return s(x.pid) === s(pid); }); return !!z && JSON.stringify(z) === snap; } };
  });
}
/* the customer's portal: GET the card / ask for the contacts */
async function portal(C, data, p, body, opts){
  opts = opts || {};
  const op = s(body.op) || 'state';
  const all = await readAll(C);
  const rec = recOf(all.list, p.id);
  const crew = crewFor(p, all.subs, rec);
  const req = rec && rec.request;
  const asked = req && req.status === 'waiting' ? { at: s(req.at) } : null;
  const said = req && req.status === 'declined' && Date.now() - Date.parse(req.at2 || req.at || 0) < 14 * 864e5;   /* not approved: no new ask for 14 days */
  const state = { ok: true, crew: crew, asked: asked, canAsk: !crew.length && !asked && !said && jobSubs(p, all.subs).length > 0 };
  if (op === 'state') return { code: 200, body: state };
  if (op !== 'request') return { code: 400, body: { ok: false, error: 'Bad request' } };
  if (body.preview === true) return { code: 200, body: Object.assign({}, state, { ok: false, error: 'Preview — nothing is sent.' }) };
  if (asked) return { code: 200, body: Object.assign({}, state, { done: 'You already asked — your Project Manager will add your crew’s contacts here.' }) };
  if (said || !state.canAsk) return { code: 200, body: Object.assign({}, state, { done: 'Your Project Manager is your contact for this job — call or text them any time.' }) };
  const at = nowIso(), qid = 'appr_subc_' + s(p.id) + '_' + Date.now().toString(36);
  const pm = C.pmOf(data, p);
  const cust = clip(p.client || p.customer || p.clientName, 80) || 'The customer';
  const job = s(p.name) || s(p.address) || 'their job';
  const title = '👷 Customer ' + cust + ' asked for the contact info of the trades on ' + job;
  const subsNow = jobSubs(p, all.subs).map(function(j){ return { key: j.key, name: j.name, trade: j.trade }; });
  const html = '<p>' + C.esc(cust) + ' asked, in the customer portal, for the contact info of the trades on <b>' + C.esc(job) + '</b>.</p>' +
    '<p>Approve to choose which trades and which details (company name, contact person, phone, e-mail) show on the customer’s “Your crew” card. ' +
    'Never a price, an invoice or a note — only what you tick. You can turn it off any time on the job.</p>';
  const ok = await C.queueApproval({ id: qid, kind: 'sub_contact', title: title, pid: s(p.id), jobName: p.name, pm: pm, channel: 'portal', to: 'the customer’s portal',
    subject: title, html: html, pmEsc: true, priority: 'normal', meta: { pid: s(p.id), customer: cust, subs: subsNow, askedAt: at } });
  if (!ok) return { code: 502, body: { ok: false, error: 'That did not go through — please try again, or call GrayCo ' + C.OFFICE_PHONE + '.' } };
  await writeRec(C, p.id, function(r){ r.request = { at: at, status: 'waiting', qid: qid }; r.log = arr(r.log).concat([{ at: at, op: 'request', by: cust, role: 'customer', via: 'portal' }]).slice(-LOG_MAX); });
  try { if (pm && pm.email) await C.pushTo([pm.email], { title: '👷 Customer asked for the trades’ contacts', body: clip(cust + ' — ' + job, 120), tag: 'subc-' + s(p.id) }); } catch (e) {}
  return { code: 200, body: { ok: true, crew: crew, asked: { at: at }, canAsk: false, done: 'Sent — your Project Manager will add your crew’s contacts here once approved.' } };
}
/* may this person change it? an admin, the office, or the job's PM */
async function mayEdit(C, data, p, who){
  if (low(who.role) === 'admin') return 'admin';
  if (await C.isOffice(who)) return 'office';
  const pm = C.pmOf(data, p);
  const u = arr(data.users).find(function(x){ return low(x.email) === low(who.email); });
  if (pm && ((pm.email && low(pm.email) === low(who.email)) || (u && low(u.name) === low(pm.name)))) return 'pm';
  if (low(p.pmEmail) && low(p.pmEmail) === low(who.email)) return 'pm';
  return '';
}
/* the CRM's job page: op get | set */
async function staff(C, body, who){
  const pid = s(body.projectId);
  const data = await C.crmData(true), p = pid && C.findProject(data, pid);
  if (!p) return { status: 404, out: { ok: false, retry: true, error: 'The job is not in the cloud yet.' } };
  const role = await mayEdit(C, data, p, who);
  const all = await readAll(C);
  const op = s(body.op) || 'get';
  if (op === 'get') return { status: 200, out: Object.assign({ ok: true, canEdit: !!role }, staffView(p, all.subs, recOf(all.list, pid))) };
  if (op !== 'set') return { status: 400, out: { ok: false, error: 'Bad request' } };
  if (!role) return { status: 403, out: { ok: false, error: 'Only the job’s PM, the office or an admin can share a trade’s contact with the customer.' } };
  const me = { by: s(who.name) || s((arr(data.users).find(function(x){ return low(x.email) === low(who.email); }) || {}).name) || who.email, email: low(who.email), role: role, at: nowIso() };
  const sel = sanitizeSel(body.share);
  let lines = [];
  const r = await writeRec(C, pid, function(rec){ lines = applyShare(rec, p, all.subs, sel, me, 'job page'); if (!lines.length) return false;
    if (rec.request && rec.request.status === 'waiting' && Object.keys(rec.subs).some(function(k){ return rec.subs[k].on; })) rec.request = Object.assign({}, rec.request, { status: 'approved', by: me.by, at2: me.at }); });
  if (!r.ok) return { status: 502, out: { ok: false, error: 'Could not save it — try again.' } };
  /* a customer request still waiting on ✅ Approvals is answered by this */
  if (lines.some(function(l){ return l.op !== 'revoke'; })) { try { await closeRequests(C, pid, me); } catch (e) {} }
  const fresh = await readAll(C);
  return { status: 200, out: Object.assign({ ok: true, canEdit: true, changed: lines.length }, staffView(p, fresh.subs, recOf(fresh.list, pid))) };
}
async function closeRequests(C, pid, me){
  return C.kvListUpdate(C.AQ_KEY, function(l){
    const open = l.filter(function(x){ return x && x.kind === 'sub_contact' && s(x.jobId) === s(pid) && x.status === 'waiting'; });
    if (!open.length) return null;
    open.forEach(function(x){ x.status = 'sent'; x.sentAt = me.at; x.sentBy = me.by; x.updatedAt = me.at; x.approvals = (x.approvals || []).concat([{ step: x.step, by: me.by, email: me.email, role: me.role, at: me.at, via: 'job page' }]); });
    const ids = open.map(function(x){ return x.id; });
    return { list: l, check: function(l2){ return ids.every(function(id){ const z = l2.find(function(y){ return y.id === id; }); return z && z.status === 'sent'; }); } };
  });
}
/* ✅ Approvals: approving needs the picker's selection */
function selectionProblem(sel){ return Array.isArray(sel) ? '' : 'Choose which trades (and which details) the customer sees — open the request and pick them.'; }
async function onApproved(C, item, now){
  const m = item.meta || {}, pid = s(item.jobId || m.pid);
  const data = await C.crmData(true), p = pid && C.findProject(data, pid);
  if (!p) return { ok: false, error: 'The job is not in the cloud yet.' };
  const ap = (item.approvals || []).slice(-1)[0] || {};
  const me = { by: s(ap.by) || 'GrayCo', email: low(ap.email), role: s(ap.role) || 'pm', at: now || nowIso() };
  const all = await readAll(C);
  const r = await writeRec(C, pid, function(rec){
    applyShare(rec, p, all.subs, sanitizeSel(m.share), me, 'approval');
    rec.request = Object.assign({}, rec.request || {}, { status: 'approved', qid: s(item.id), by: me.by, at2: me.at });
    rec.log = arr(rec.log).concat([{ at: me.at, op: 'approve', by: me.by, email: me.email, role: me.role, via: 'approval', n: sanitizeSel(m.share).filter(function(x){ return x.on; }).length }]).slice(-LOG_MAX);
  });
  return r.ok ? { ok: true, shared: true } : { ok: false, error: 'Could not save the selection — try again.' };
}
async function onRejected(C, item, me){
  const pid = s(item.jobId || (item.meta || {}).pid); if (!pid) return;
  await writeRec(C, pid, function(rec){
    rec.request = Object.assign({}, rec.request || {}, { status: 'declined', qid: s(item.id), by: me.by, at2: me.at });
    rec.log = arr(rec.log).concat([{ at: me.at, op: 'decline', by: me.by, email: me.email, role: me.role, via: 'approval' }]).slice(-LOG_MAX);
  });
}

module.exports = { KEY: KEY, FIELDS: FIELDS, DEFAULT_FIELDS: DEFAULT_FIELDS, jobSubs: jobSubs, crewFor: crewFor, staffView: staffView, applyShare: applyShare, cleanFields: cleanFields,
  sanitizeSel: sanitizeSel, recOf: recOf, readAll: readAll, portal: portal, staff: staff, selectionProblem: selectionProblem, onApproved: onApproved, onRejected: onRejected, mayEdit: mayEdit };
