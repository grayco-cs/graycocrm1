/* netlify/functions/_lib/lien.js — patch AUTO-LIEN: sub lien waivers, OPTIONAL (owner 10/24: "most subs do not have to
   sign lien waivers"). Default OFF for every sub and every job.
     • Turned ON for a sub (always ask this sub) or for a job (every sub on this job): when that sub's invoice is
       approved, a CONDITIONAL waiver (on progress payment, for that invoice's amount) is requested; when the job
       reaches closeout, a FINAL waiver (for everything approved on the job). Only then do the Friday pay list and the
       closeout checklist show a missing waiver.
     • Anyone in the office can press "📝 Request lien waiver" on a sub's check (the Friday pay list) or at closeout,
       whatever the setting.
     • The sub gets a private link: they read it and sign online (typed name + "I agree"), or upload their own signed
       PDF. No sign-in. The link opens only that one waiver.
     • First contact rule: the FIRST request to a sub (by e-mail address) waits on the approvals list (office or an
       admin approves); later requests to the same sub go out by themselves. ⏸ Data-entry mode: nothing is sent.
     • The sub portal is never mentioned to a customer; nothing here goes to a customer at all.
   Data (gc_kv): "gc_lien_waivers" (list; the link's token is kept only as a SHA-256 hash), "gc_lien_settings"
   ({ subs: { <subKey>: true }, jobs: { <pid>: true } }), changed only through kvListUpdate / this file.
   The waiver wording is a plain conditional / final release — have GrayCo's lawyer check it (owner checklist).
   patch AUTOMONEY (owner 10/29: "lien waivers on portal for sub to sign, default for residential to not have lien waivers
   but can make them have them, default on commercial to have lien waivers and can change to no"):
     • REQUIRED BY JOB TYPE: the job's "📝 Sub lien waivers required" switch (⚡ Automations, key subLien; default ON for
       commercial jobs, OFF for residential / insurance / program — ⚙ Admin → Automation defaults), plus the old
       per-sub "always ask this sub" and per-job switches (requiredFor below).
     • PAY HOLD: when required, a sub's check is held on the Friday pay list until the waiver is signed (money-core payHold).
     • THE SUB SIGNS IN THE SUB PORTAL (portal-access p-home / p-lien-sign — typed name + drawn signature + E-SIGN
       consent) or on the e-mailed link; the CRM makes the PDF (pdf below, ./lien-pdf.js). Reminders every 3 days (portal +
       e-mail, at most 6) until signed. The office / an admin can mark one "received on paper" with the scan (paper below). */
'use strict';
const crypto = require('crypto');
const A = require('./auto-common.js');
const { s, low, num, usd, arr, ymd, esc, clip, pidOf, okEmail } = A;
const MC = require('./money-core.js');   /* patch AUTOMONEY */
const KEY = 'gc_lien_waivers', SKEY = 'gc_lien_settings', KIND = 'sub_lien_request';
const SINCE = '2026-10-24';   /* only invoices approved / jobs closed from the day this went in — never the old ones */
const OFFICE_FROM = 'GrayCo Construction Services <office@grayco-cs.com>';
function hash(t){ return crypto.createHash('sha256').update(String(t)).digest('hex'); }
function newToken(){ return crypto.randomBytes(24).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function signLink(token){ return A.crmBase() + '/.netlify/functions/lien?t=' + encodeURIComponent(token); }
function subKey(subId, name){ return s(subId) ? 'id:' + s(subId) : 'n:' + low(name).replace(/\s+/g, ' '); }
function isSubInv(r){ return /sub/.test(low(r.type)) || (!s(r.type) && !!(r.sub || r.subId)); }
function approvedAt(r, appr){
  if (!r || r.deleted === true || r._pmDenied === true || /denied|void|deleted|cancel|declin/.test(low(r.status))) return '';
  const a = appr && /approved|paid|scheduled|written/.test(low(appr.status)) ? appr : null;
  if (!(a || r._pmApproved === true || /approved|paid|scheduled|written/.test(low(r.status)))) return '';
  return ymd((a && (a.pmDecidedAt || a.decidedAt || a.approvedAt)) || r._pmDecidedAt || r.approvedAt || r.paidDate || r.date || r.created || r.createdAt);
}
function closedAt(p){
  if (!p || p.importedHistory === true || p.noSend === true || p.historyOnly === true) return '';
  const done = num(p.pct) >= 100 || s(p.jobStage) === 'complete' || /^(complete|completed|closed|done)$/i.test(s(p.status));
  return done ? ymd(p.completedAt || p.completionDate || p.closeoutAt || p.substantialAt || p.updatedAt) : '';
}
async function settings(){
  const C = A.core(); let v = null;
  try { v = (await C.kvRead([SKEY]))[SKEY]; } catch (e) {}
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return { subs: (v && v.subs && typeof v.subs === 'object') ? v.subs : {}, jobs: (v && v.jobs && typeof v.jobs === 'object') ? v.jobs : {} };
}
function sbUrl(){ return (process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function svc(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function H(extra){ const k = svc(); return Object.assign(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }, { 'Content-Type': 'application/json' }, extra || {}); }
async function writeSettings(next){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: SKEY, value: JSON.stringify(next), updated_at: new Date().toISOString() }) });
  return r.ok;
}
async function toggle(kind, key, on, who){
  const cur = await settings();
  const next = { subs: Object.assign({}, cur.subs), jobs: Object.assign({}, cur.jobs), by: s(who && (who.name || who.email)), at: new Date().toISOString() };
  const m = kind === 'job' ? next.jobs : next.subs;
  if (on) m[key] = { on: true, by: next.by, at: next.at }; else delete m[key];
  return (await writeSettings(next)) ? next : null;
}
function onFor(st, subId, subName, pid){ return !!(st.jobs[s(pid)] || st.subs[subKey(subId, subName)] || (subName && st.subs[subKey('', subName)])); }
/* patch AUTOMONEY: is a waiver required for this sub on this job? (the job's own switch, else its type's default; or the sub is "always") */
function requiredFor(st, subId, subName, p, jaAdmin){
  let typeDefault = false, own;
  try { const JA = require('./job-auto.js'); typeDefault = JA.defaultsFor(JA.groupOf(p || {}), JA.parseAdmin(jaAdmin)).subLien === true; } catch (e) {}
  if (p && p.auto && typeof p.auto === 'object' && typeof p.auto.subLien === 'boolean') own = p.auto.subLien;
  return MC.lienRequired({ own: own, typeDefault: typeDefault, legacyJob: !!st.jobs[s(p && p.id)], legacySub: !!(st.subs[subKey(subId, subName)] || (subName && st.subs[subKey('', subName)])) });
}
async function list(){ const C = A.core(); const cur = await C.kvListRead(KEY); return cur ? cur.list : null; }
/* the sub's contact, from the CRM's subs / vendors lists */
function subContact(data, subId, name){
  const all = arr(data.subs).concat(arr(data.vendors));
  const nm = low(name);
  const r = all.find(function(x){ return subId && s(x.id) === s(subId); }) || all.find(function(x){ return nm && (low(x.name) === nm || low(x.company) === nm); });
  const e = r && s(r.email || r.contactEmail || r.billingEmail);
  return { id: s(r && r.id) || s(subId), name: s((r && (r.company || r.name)) || name), email: okEmail(e) ? low(e) : '' };
}
/* patch AUTOMONEY: the wording as paragraphs (the page, the portal and the PDF all use these). Generic Tennessee-style
   conditional / unconditional releases (Tenn. Code Ann. Title 66, Chapter 11) — DRAFT for GrayCo's lawyer (owner checklist). */
function waiverParas(w){
  const amt = usd(w.amount), job = s(w.jobName) + (w.jobAddress ? ', ' + s(w.jobAddress) : '');
  const who = 'GrayCo Construction Services, LLC';
  if (w.kind === 'final') return { title: 'Conditional Waiver and Release on Final Payment', paras: [
    'Upon receipt by the undersigned of a payment from ' + who + ' in the amount of ' + amt + ', this document becomes effective to release any mechanic’s or materialman’s lien, notice of lien, stop notice or payment bond right the undersigned has on the job of ' + job + ', for all labor, services, equipment and materials furnished to that job.',
    'This release is conditional: it has no effect unless and until that payment is actually received by the undersigned (and, if by check, the check has cleared).',
    'The undersigned states that it has paid, or will pay from this payment, everyone who furnished labor, services, equipment or materials to it for this job.'] };
  if (w.kind === 'unconditional') return { title: 'Unconditional Waiver and Release on Progress Payment', paras: [
    'The undersigned has been paid ' + amt + ' by ' + who + ' for labor, services, equipment or materials furnished to the job of ' + job + ' through ' + s(w.through) + (w.invNum ? ' (invoice ' + s(w.invNum) + ')' : '') + ', and releases any mechanic’s or materialman’s lien, notice of lien, stop notice or payment bond right it has on that job to the extent of that payment.',
    'This release covers that payment only. It does not cover retention, extras, disputed claims or work after that date.',
    'NOTICE: this document waives rights unconditionally and says the undersigned HAS BEEN PAID. Do not sign it until you have received payment.'] };
  return { title: 'Conditional Waiver and Release on Progress Payment', paras: [
    'Upon receipt by the undersigned of a payment from ' + who + ' in the amount of ' + amt + ' for labor, services, equipment or materials furnished to the job of ' + job + ' through ' + s(w.through) + (w.invNum ? ' (invoice ' + s(w.invNum) + ')' : '') + ', this document becomes effective to release any mechanic’s or materialman’s lien, notice of lien, stop notice or payment bond right the undersigned has on that job, to the extent of that payment only.',
    'It does not cover retention, extras, disputed claims or work after that date, or amounts not yet paid.',
    'This release is conditional: it has no effect unless and until that payment is actually received by the undersigned (and, if by check, the check has cleared).'] };
}
function waiverText(w){
  const t = waiverParas(w);
  return '<p><b>' + esc(t.title) + '</b></p>' + t.paras.map(function(x){ return '<p>' + esc(x) + '</p>'; }).join('');
}
function requestHtml(w, link){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.5">' +
    '<p>Hello ' + esc(w.sub || '') + ',</p>' +
    '<p>GrayCo Construction Services asks for a <b>' + (w.kind === 'final' ? 'final' : 'conditional') + ' lien waiver</b> for <b>' + esc(w.jobName) + '</b>' + (w.jobAddress ? ' (' + esc(w.jobAddress) + ')' : '') + ', amount <b>' + usd(w.amount) + '</b>' + (w.invNum ? ', your invoice ' + esc(w.invNum) : '') + '. It only takes effect once you have been paid.</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + esc(link) + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block">Review and sign</a></p>' +
    '<p>You can sign it online, or upload your own signed waiver on the same page. Questions? Reply to this e-mail or call the office at 901-585-0944.</p>' +
    '<p style="font-size:13px;color:#55626F">Send all invoices and pay requests to <b>invoices@grayco-cs.com</b> (include the job name/PO).</p></div>';
}
async function contacted(email){
  const l = await list() || [];
  if (l.some(function(w){ return low(w.subEmail) === low(email) && /^(sent|signed|uploaded)$/.test(s(w.status)); })) return true;
  const C = A.core(), q = await C.kvListRead(C.AQ_KEY);
  return !!(q && q.list.some(function(x){ return x && x.kind === KIND && x.status === 'sent' && low(x.to) === low(email); }));
}
async function sendNow(w, html){
  if (await A.paused()) return { ok: false, error: 'Data-entry mode is on — nothing is sent to subs.' };
  const key = s(process.env.RESEND_API_KEY); if (!key || s(process.env.PORTAL_MAIL_OFF) === '1') return { ok: false, error: 'E-mail is not set up (RESEND_API_KEY).' };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: OFFICE_FROM, reply_to: 'office@grayco-cs.com', to: [w.subEmail], subject: clip('Lien waiver to sign — ' + (w.jobName || 'GrayCo job') + ' (' + usd(w.amount) + ')', 200), html: require('./brand.js').shell(html, { sender: false }) }) });   /* patch LOGO: the logo header */
    return r.ok ? { ok: true } : { ok: false, error: 'The e-mail did not go out (' + r.status + ').' };
  } catch (e) { return { ok: false, error: 'The e-mail did not go out (no answer).' }; }
}
async function patchWaiver(id, fn){
  const C = A.core();
  let out = null;
  const r = await C.kvListUpdate(KEY, function(l){
    const x = l.find(function(y){ return y && s(y.id) === id; }); if (!x) return null;
    if (fn(x) === false) return null; x.updatedAt = new Date().toISOString(); out = x; const stamp = x.updatedAt;
    return { list: l, check: function(l2){ const z = l2.find(function(y){ return y && s(y.id) === id; }); return !!(z && z.updatedAt === stamp); }, result: x };
  });
  return r && r.ok ? (out || r.result) : null;
}
/* create (once) and send / queue one waiver request. o: { kind, invId?, pid, sub, subId, amount, through, invNum, by } */
async function request(o, data){
  const C = A.core();
  data = data || await C.crmData(true);
  const p = o.pid ? C.findProject(data, o.pid) : null;
  const sc = subContact(Object.assign({ subs: [], vendors: [] }, data), o.subId, o.sub);
  const id = o.kind === 'final' ? 'LWf_' + s(o.pid) + '_' + subKey(sc.id, sc.name).replace(/[^A-Za-z0-9_.:-]/g, '_') : 'LWc_' + s(o.invId);
  const cur = await list(); if (!cur) return { ok: false, error: 'The waiver list could not be read.' };
  const had = cur.find(function(w){ return s(w.id) === id; });
  if (had && had.status !== 'no_email' && !o.again) return { ok: true, already: true, waiver: strip(had) };
  if (!sc.email) {
    await A.todo('lien_noemail_' + id, '📝 Lien waiver for ' + (sc.name || 'a sub') + ' — no e-mail on file', { pid: o.pid, by: 'CRM (lien waivers)', note: 'Add the sub’s e-mail (Subs tab), then press Request lien waiver again.' });
    if (!had) await C.kvListUpdate(KEY, function(l){ return l.some(function(w){ return s(w.id) === id; }) ? null : { list: l.concat([{ id: id, kind: o.kind, status: 'no_email', pid: s(o.pid), sub: sc.name, subId: sc.id, createdAt: new Date().toISOString() }]), check: function(l2){ return l2.some(function(w){ return s(w.id) === id; }); } }; });
    return { ok: false, noEmail: true, error: 'No e-mail on file for ' + (sc.name || 'this sub') + '.' };
  }
  const token = newToken(), now = new Date().toISOString();
  const w = { id: id, kind: o.kind === 'final' ? 'final' : 'conditional', invId: s(o.invId), invNum: s(o.invNum), pid: s(o.pid), jobName: s(p && p.name), jobAddress: s(p && (p.address || p.jobAddress)),
    sub: sc.name, subId: sc.id, subEmail: sc.email, amount: Math.round(num(o.amount) * 100) / 100, through: ymd(o.through) || now.slice(0, 10), tokenHash: hash(token),
    status: 'new', requestedBy: s(o.by) || 'CRM (automatic)', createdAt: now, updatedAt: now };
  const put = await C.kvListUpdate(KEY, function(l){ const rest = l.filter(function(x){ return s(x.id) !== id; }); return { list: rest.concat([w]), check: function(l2){ const z = l2.find(function(x){ return s(x.id) === id; }); return !!(z && z.tokenHash === w.tokenHash); } }; });
  if (!put.ok) return { ok: false, error: 'Could not save the waiver.' };
  const html = requestHtml(w, signLink(token));
  if (await contacted(sc.email)) {
    const sent = await sendNow(w, html);
    await patchWaiver(id, function(x){ if (sent.ok) { x.status = 'sent'; x.sentAt = new Date().toISOString(); } else x.lastError = sent.error; });
    return { ok: sent.ok, sent: sent.ok, error: sent.error, waiver: strip(Object.assign(w, { status: sent.ok ? 'sent' : 'new' })) };
  }
  if (await A.paused()) return { ok: false, error: 'Data-entry mode is on — nothing is sent to subs.', waiver: strip(w) };
  /* a first request to this sub is already waiting on approvals: hold this one; it goes out once that one is approved */
  const Cq = await C.kvListRead(C.AQ_KEY);
  if (Cq && Cq.list.some(function(x){ return x && x.kind === KIND && (x.status === 'waiting' || x.status === 'sending') && low(x.to) === sc.email; }))
    return { ok: true, held: true, waiver: strip(w) };
  const qok = await C.queueApproval({ id: 'appr_lien_' + id, kind: KIND, pid: s(o.pid), jobName: w.jobName, pm: null, officeOk: true, to: sc.email,
    title: '📝 Lien waiver request (first one to ' + sc.name + ') — ' + (w.jobName || 'job') + ' ' + usd(w.amount),
    subject: 'Lien waiver to sign — ' + (w.jobName || 'GrayCo job') + ' (' + usd(w.amount) + ')', html: html, attachments: [], meta: { waiverId: id, sub: sc.name, by: s(o.by) || 'auto-lien' } });
  if (qok) await patchWaiver(id, function(x){ x.status = 'waiting_approval'; });
  return { ok: !!qok, queued: !!qok, waiver: strip(Object.assign(w, { status: 'waiting_approval' })) };
}
/* the approvals list approved the first request: send it now */
async function onApproved(item){
  const id = s((item.meta || {}).waiverId);
  const l = await list() || []; const w = l.find(function(x){ return s(x.id) === id; });
  if (!w) return { ok: false, error: 'That waiver is no longer in the list.' };
  if (/^(signed|uploaded|paper)$/.test(s(w.status))) return { ok: true, skipped: 'already signed' };
  const sent = await sendNow(Object.assign({}, w, { subEmail: s(item.to) || w.subEmail }), s(item.html));
  if (!sent.ok) return sent;
  await patchWaiver(id, function(x){ x.status = 'sent'; x.sentAt = new Date().toISOString(); x.subEmail = low(item.to) || x.subEmail; });
  return { ok: true };
}
function strip(w){ const o = Object.assign({}, w); delete o.tokenHash; delete o.file; delete o.strokes; return o; }
/* the hourly pass (only for subs / jobs with waivers ON) */
async function run(opts){
  opts = opts || {};
  const C = A.core(), rep = { ok: true, requested: 0, queued: 0, sent: 0, noEmail: 0 };
  if (await A.paused()) return Object.assign(rep, { dataEntryMode: true });
  const tally = async function(res){ if (res.queued) rep.queued++; else if (res.held) rep.held = (rep.held || 0) + 1; else if (res.sent) rep.sent++; else if (res.noEmail) rep.noEmail++; if (!res.already) rep.requested++; };
  /* held requests: once that sub has been contacted, send them (each with a fresh link) */
  for (const w of (await list() || [])) {
    if (s(w.status) !== 'new' || !okEmail(w.subEmail)) continue;
    if (!(await contacted(w.subEmail))) {   /* made while paused, never queued: the first request goes to approvals now */
      const q0 = await C.kvListRead(C.AQ_KEY);
      if (q0 && q0.list.some(function(x){ return x && x.kind === KIND && (x.status === 'waiting' || x.status === 'sending') && low(x.to) === low(w.subEmail); })) continue;
      const tk = newToken(), y0 = await patchWaiver(w.id, function(y){ if (s(y.status) !== 'new') return false; y.tokenHash = hash(tk); });
      if (!y0) continue;
      const qok = await C.queueApproval({ id: 'appr_lien_' + w.id + '_' + Date.now().toString(36), kind: KIND, pid: s(w.pid), jobName: w.jobName, pm: null, officeOk: true, to: w.subEmail,
        title: '📝 Lien waiver request (first one to ' + w.sub + ') — ' + (w.jobName || 'job') + ' ' + usd(w.amount), subject: 'Lien waiver to sign — ' + (w.jobName || 'GrayCo job') + ' (' + usd(w.amount) + ')',
        html: requestHtml(y0, signLink(tk)), attachments: [], meta: { waiverId: w.id, sub: w.sub, by: 'auto-lien' } });
      if (qok) { await patchWaiver(w.id, function(y){ y.status = 'waiting_approval'; }); rep.queued++; }
      continue;
    }
    const token = newToken();
    const x = await patchWaiver(w.id, function(y){ if (s(y.status) !== 'new') return false; y.tokenHash = hash(token); });
    if (!x) continue;
    const sent = await sendNow(x, requestHtml(x, signLink(token)));
    await patchWaiver(w.id, function(y){ if (sent.ok) { y.status = 'sent'; y.sentAt = new Date().toISOString(); y.lastError = ''; } else y.lastError = sent.error; });
    if (sent.ok) rep.sent++;
  }
  const st = await settings();
  /* patch AUTOMONEY: no early "all off" return any more — commercial jobs need waivers by default */
  try { const rm = await remind(opts); rep.reminded = rm.sent; } catch (e) {}
  const data = await C.crmData(true);
  const projOf = {}; arr(data.projects).forEach(function(p){ if (p && p.id) projOf[s(p.id)] = p; });
  const need = function(subId, sub, pid){ return requiredFor(st, subId, sub, projOf[s(pid)] || { id: pid }, data.jobAutoDefaults); };
  const extra = await C.kvRead(['subs', 'vendors', 'gc_sub_approvals']);
  Object.assign(data, { subs: extra.subs, vendors: extra.vendors });
  const appr = {}; arr(extra.gc_sub_approvals).forEach(function(a){ if (a && a.invId) appr[s(a.invId)] = a; });
  const have = {}; (await list() || []).forEach(function(w){ have[s(w.id)] = 1; });
  const invs = C.listOf(data, ['invs', 'invoices']).filter(isSubInv);
  for (const r of invs) {
    const at = approvedAt(r, appr[s(r.id)]); if (!at || at < SINCE || r.importedHistory === true) continue;
    if (!need(r.subId, r.sub, pidOf(r)) || have['LWc_' + s(r.id)]) continue;
    await tally(await request({ kind: 'conditional', invId: s(r.id), invNum: s(r.invNum || r.num || r.number), pid: pidOf(r), sub: s(r.sub || r.vendor), subId: s(r.subId), amount: num(r.amt != null ? r.amt : r.amount), through: r.date || r.invDate || at }, data));
    have['LWc_' + s(r.id)] = 1;
  }
  for (const p of arr(data.projects)) {
    const ca = closedAt(p); if (!ca || ca < SINCE) continue;
    const bySub = {};
    invs.forEach(function(r){ if (pidOf(r) !== s(p.id) || !approvedAt(r, appr[s(r.id)])) return; const k = subKey(r.subId, r.sub); (bySub[k] = bySub[k] || { sub: s(r.sub || r.vendor), subId: s(r.subId), amount: 0 }).amount += num(r.amt != null ? r.amt : r.amount); });
    for (const k of Object.keys(bySub)) {
      const b = bySub[k]; if (!need(b.subId, b.sub, p.id)) continue;
      const fid = 'LWf_' + s(p.id) + '_' + k.replace(/[^A-Za-z0-9_.:-]/g, '_');
      if (have[fid]) continue;
      await tally(await request({ kind: 'final', pid: s(p.id), sub: b.sub, subId: b.subId, amount: b.amount, through: ca }, data));
      have[fid] = 1;
    }
  }
  return rep;
}
/* the sub's side (no sign-in: the token) */
async function byToken(t){ const h = hash(s(t)); const l = await list() || []; return l.find(function(w){ return w && w.tokenHash && w.tokenHash === h; }) || null; }
async function sign(t, name, title, ip, agent){
  const w = await byToken(t); if (!w) return { ok: false, status: 404, error: 'This link is not valid any more. Ask GrayCo for a new one.' };
  if (/^(signed|uploaded|paper)$/.test(s(w.status))) return { ok: true, already: true, waiver: strip(w) };
  if (s(name).length < 3) return { ok: false, status: 400, error: 'Type your full name to sign.' };
  const x = await patchWaiver(w.id, function(y){ if (/^(signed|uploaded|paper)$/.test(s(y.status))) return false; y.status = 'signed'; y.signedAt = new Date().toISOString(); y.signerName = clip(name, 80); y.signerTitle = clip(title, 80); y.ip = clip(ip, 60); y.agent = clip(agent, 160); y.textHash = hash(waiverText(y)); });
  return x ? { ok: true, waiver: strip(x) } : { ok: false, status: 409, error: 'Could not save it — try again.' };
}
async function upload(t, b64, fileName, ip){
  const w = await byToken(t); if (!w) return { ok: false, status: 404, error: 'This link is not valid any more. Ask GrayCo for a new one.' };
  let buf; try { buf = Buffer.from(s(b64).replace(/^data:[^,]*,/, ''), 'base64'); } catch (e) { buf = null; }
  if (!buf || buf.length < 100 || buf.length > 8 * 1024 * 1024) return { ok: false, status: 400, error: 'Upload a PDF or photo under 8 MB.' };
  const pdf = buf.slice(0, 4).toString() === '%PDF', img = buf[0] === 0xFF && buf[1] === 0xD8 || buf.slice(1, 4).toString() === 'PNG';
  if (!pdf && !img) return { ok: false, status: 400, error: 'Upload a PDF, JPG or PNG.' };
  const path = 'lien/' + w.id.replace(/[^A-Za-z0-9_.-]/g, '_') + '-' + Date.now().toString(36) + (pdf ? '.pdf' : img && buf[0] === 0xFF ? '.jpg' : '.png');
  const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: Object.assign(H(), { 'Content-Type': pdf ? 'application/pdf' : 'image/' + (buf[0] === 0xFF ? 'jpeg' : 'png'), 'x-upsert': 'true' }), body: buf });
  if (!r.ok) return { ok: false, status: 502, error: 'The upload did not go through — try again.' };
  const x = await patchWaiver(w.id, function(y){ y.status = 'uploaded'; y.uploadedAt = new Date().toISOString(); y.file = { ref: 'sb:crm-files/' + path, name: clip(fileName || 'waiver', 100) }; y.ip = clip(ip, 60); });
  return x ? { ok: true, waiver: strip(x) } : { ok: false, status: 409, error: 'Could not save it — try again.' };
}
/* what the CRM's office screens see */
async function forCrm(){
  const st = await settings();
  const l = (await list() || []).map(function(w){ const o = strip(w); if (w.file) o.hasFile = true; return o; });
  return { ok: true, waivers: l, settings: st, since: SINCE };
}
async function override(pid, who, reason){
  const id = 'LWo_' + s(pid), now = new Date().toISOString();
  const r = await A.core().kvListUpdate(KEY, function(l){ const rest = l.filter(function(x){ return s(x.id) !== id; }); return { list: rest.concat([{ id: id, kind: 'override', pid: s(pid), status: 'override', by: s(who && (who.name || who.email)), at: now, reason: clip(reason, 300) }]), check: function(l2){ return l2.some(function(x){ return s(x.id) === id && x.at === now; }); } }; });
  return r.ok;
}
/* ── patch AUTOMONEY ─────────────────────────────────────────────────────────────────────────────── */
/* reminders: a waiver sent and not signed — every 3 days, at most 6, a fresh link by e-mail (the portal shows it too) */
const REMIND_MS = 3 * 864e5, REMIND_MAX = 6;
async function remind(opts){
  const now = (opts && opts.now) || Date.now(), out = { sent: 0 };
  if (await A.paused()) return out;
  for (const w of (await list() || [])) {
    if (s(w.status) !== 'sent' || !okEmail(w.subEmail) || (w.reminders || 0) >= REMIND_MAX) continue;
    const last = Date.parse(w.remindedAt || w.sentAt || w.updatedAt || 0); if (!last || now - last < REMIND_MS) continue;
    const token = newToken();
    const x = await patchWaiver(w.id, function(y){ if (s(y.status) !== 'sent' || (y.remindedAt && y.remindedAt !== w.remindedAt)) return false; y.tokenHash = hash(token); y.remindedAt = new Date(now).toISOString(); y.reminders = (y.reminders || 0) + 1; });
    if (!x) continue;
    const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.5"><p><b>Reminder:</b> this lien waiver is still waiting for your signature. Your payment for this job is released once it is signed.</p></div>' + requestHtml(x, signLink(token)) +
      '<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#55626F;text-align:center">You can also sign it in the GrayCo Portal (portal.grayco-cs.com) → Home → Needs you.</p>';
    const r = await sendNow(Object.assign({}, x, { jobName: 'Reminder: ' + (x.jobName || 'GrayCo job') }), html);
    if (r.ok) out.sent++;
  }
  return out;
}
/* the office / an admin: "received on paper" — the signed paper's scan or photo, filed on the waiver (one is made when none was asked) */
async function paper(o, who, data){
  const C = A.core();
  let buf; try { buf = Buffer.from(s(o.file).replace(/^data:[^,]*,/, ''), 'base64'); } catch (e) { buf = null; }
  if (!buf || buf.length < 100 || buf.length > 8 * 1024 * 1024) return { ok: false, status: 400, error: 'Add the scan or photo of the signed paper (PDF, JPG or PNG, under 8 MB).' };
  const pdf = buf.slice(0, 4).toString() === '%PDF', jpg = buf[0] === 0xFF && buf[1] === 0xD8, png = buf.slice(1, 4).toString() === 'PNG';
  if (!pdf && !jpg && !png) return { ok: false, status: 400, error: 'Upload a PDF, JPG or PNG.' };
  let id = s(o.id);
  if (!id) {
    data = data || await C.crmData(true);
    if (s(o.invId)) {
      const r = C.listOf(data, ['invs', 'invoices']).find(function(x){ return s(x.id) === s(o.invId); });
      if (!r) return { ok: false, status: 404, error: 'That invoice is not in the cloud yet.' };
      id = 'LWc_' + s(r.id);
      const p = C.findProject(data, pidOf(r));
      const now0 = new Date().toISOString();
      await C.kvListUpdate(KEY, function(l){ return l.some(function(x){ return s(x.id) === id; }) ? null : { list: l.concat([{ id: id, kind: 'conditional', invId: s(r.id), invNum: s(r.invNum || r.num || r.number), pid: pidOf(r), jobName: s(p && p.name), jobAddress: s(p && (p.address || p.jobAddress)), sub: s(r.sub || r.vendor), subId: s(r.subId), amount: Math.round(num(r.amt != null ? r.amt : r.amount) * 100) / 100, through: ymd(r.date || r.invDate) || now0.slice(0, 10), status: 'new', requestedBy: s(who && (who.name || who.email)), createdAt: now0, updatedAt: now0 }]), check: function(l2){ return l2.some(function(x){ return s(x.id) === id; }); } }; });
    } else return { ok: false, status: 400, error: 'Which waiver?' };
  }
  const path = 'lien/' + id.replace(/[^A-Za-z0-9_.-]/g, '_') + '-paper-' + Date.now().toString(36) + (pdf ? '.pdf' : jpg ? '.jpg' : '.png');
  const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: Object.assign(H(), { 'Content-Type': pdf ? 'application/pdf' : jpg ? 'image/jpeg' : 'image/png', 'x-upsert': 'true' }), body: buf });
  if (!r.ok) return { ok: false, status: 502, error: 'The upload did not go through — try again.' };
  const x = await patchWaiver(id, function(y){ if (/^(signed|uploaded)$/.test(s(y.status))) return false; y.status = 'paper'; y.paperAt = new Date().toISOString(); y.paperBy = s(who && (who.name || who.email)); y.file = { ref: 'sb:crm-files/' + path, name: clip(o.name || 'signed waiver', 100) }; });
  return x ? { ok: true, waiver: strip(x) } : { ok: false, status: 409, error: 'That waiver is already signed, or was not found.' };
}
/* the Sub Portal: this sub's own waivers (sent / signed) — the same job name, address and amount the e-mail shows, nothing more */
function mineFor(w, sub){ return !!(w && sub && ((s(w.subId) && s(w.subId) === s(sub.id)) || (!s(w.subId) && low(w.sub) && (low(w.sub) === low(sub.name) || low(w.sub) === low(sub.company))) || (okEmail(sub.email) && low(w.subEmail) === low(sub.email)))); }
async function forSub(sub){
  return (await list() || []).filter(function(w){ return mineFor(w, sub) && /^(sent|signed|uploaded|paper)$/.test(s(w.status)) && w.kind !== 'override'; }).map(function(w){
    const t = waiverParas(w);
    return { id: s(w.id), kind: s(w.kind), job: s(w.jobName), address: s(w.jobAddress), amount: num(w.amount), through: s(w.through), invNum: s(w.invNum), status: s(w.status),
      signedAt: s(w.signedAt || w.uploadedAt || w.paperAt).slice(0, 10), signerName: s(w.signerName), title: t.title, paras: t.paras };
  }).sort(function(a, b){ return (a.status === 'sent' ? 0 : 1) - (b.status === 'sent' ? 0 : 1) || b.through.localeCompare(a.through); });
}
async function signForSub(id, sub, o){
  const w = (await list() || []).find(function(x){ return s(x.id) === s(id); });
  if (!w || !mineFor(w, sub) || !/^(sent|signed|uploaded|paper)$/.test(s(w.status))) return { ok: false, status: 404, error: 'That waiver is not available.' };
  if (MC.lienDone(w)) return { ok: true, already: true };
  const nm = clip(String(o.name == null ? '' : o.name).replace(/\s+/g, ' '), 80);
  if (nm.length < 3) return { ok: false, status: 400, error: 'Type your full name to sign.' };
  if (o.agree !== true) return { ok: false, status: 400, error: 'Tick the box to agree, then sign.' };
  if (!o.esign || o.esign.agree !== true) return { ok: false, status: 400, error: 'Tick the box to agree to do business electronically, then sign.' };
  const x = await patchWaiver(w.id, function(y){ if (MC.lienDone(y)) return false; y.status = 'signed'; y.signedAt = new Date().toISOString(); y.signerName = nm; y.signerTitle = clip(o.title, 80); y.ip = clip(o.ip, 60); y.agent = clip(o.ua, 160); y.via = 'sub portal';
    y.esign = { agree: true, at: y.signedAt, version: clip(o.esign.version, 20) }; y.strokes = Array.isArray(o.strokes) ? o.strokes.slice(0, 40) : []; y.textHash = hash(waiverText(y)); });
  return x ? { ok: true, waiver: strip(x) } : { ok: false, status: 409, error: 'Could not save it — try again.' };
}
/* the waiver as a PDF (the CRM makes it from the job, the amount and the period; signed ones carry the signature block) */
function pdf(w){ return require('./lien-pdf.js').build(Object.assign({}, w, waiverParas(w))); }
module.exports = { requiredFor, remind, paper, forSub, signForSub, pdf, waiverParas, mineFor, requestHtml, run, request, onApproved, sign, upload, byToken, forCrm, override, toggle, settings, waiverText, subKey, onFor, approvedAt, closedAt, KEY, SKEY, KIND, SINCE, hash, strip };
