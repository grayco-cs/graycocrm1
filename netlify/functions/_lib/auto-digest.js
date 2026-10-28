/* netlify/functions/_lib/auto-digest.js — patch AUTO-DIGEST: the 7 AM approvals digest (owner: "automate it as much as
   possible with only approvals"). Every morning except Sunday, each person who has approvals waiting gets ONE e-mail and
   one phone push listing them. Each line is a link that opens that exact item in the CRM (#appr=<id>) — the CRM asks for
   the usual sign-in, and the approval is given there, never from the e-mail. Who gets what is the approvals list's
   own rule (and in its order: 🔴 ASAP, 🟠 Soon, ⚪ Routine, newest first — _lib/appr-order.js): the job's PM for a PM step; Wesley and Nick for an admin step (and the office too when the item lets the
   office approve, or it waited 24 hours); PM-step items and job costs not yet hers are one
   "N waiting on PMs — optional" line for the office (patch APOFFICE2); JOB COSTS (sub invoices, job expenses) to the job's PM, then the office after 24 h
   (or at once with no PM) — an admin only as that job's PM (patch SUBINV); payroll runs waiting on an admin.
   Staff only (every address @grayco-cs.com), so data-entry mode lets it through. */
'use strict';
const A = require('./auto-common.js');
const { s, low, arr, usd, esc, clip, staffEmail } = A;
const MAX = 40;
let AO = null; try { AO = require('./appr-order.js'); } catch (e) {}   /* patch APPRORDER: the same order as the CRM (ASAP, Soon, Routine; newest first) */
function order(list, now){
  if (!AO) return list;
  return AO.sort(list.map(function(it){ return Object.assign({}, it.raw || {}, { __it: it }); }), now).map(function(x){ const it = x.__it; it.tier = AO.tierOf(x, now).label; return it; });
}
function line(it){ return '<li style="margin:4px 0">' + (it.tier ? '<span style="font-size:12px">' + esc(it.tier) + '</span> ' : '') + '<a href="' + esc(it.link) + '" style="color:#0F1D2F;font-weight:bold">' + esc(clip(it.title, 140)) + '</a>' + (it.sub ? ' <span style="color:#55626F">— ' + esc(it.sub) + '</span>' : '') + '</li>'; }
async function run(opts){
  opts = opts || {};
  const C = A.core(), now = opts.now != null ? opts.now : Date.now(), c = A.central(now);
  if (c.wd === 'Sun') return { ok: true, skipped: 'Sunday' };
  const data = await C.crmData(true);
  const cur = await C.kvListRead(C.AQ_KEY);
  const extra = await C.kvRead(['gc_sub_approvals', 'gc_expense_approvals', 'payrollRuns']);
  const admins = C.adminEmails(data).filter(staffEmail), office = C.officeEmails(data).filter(staffEmail);
  const users = arr(data.users), byName = {};
  users.forEach(function(u){ if (u && u.name && staffEmail(u.email)) byName[low(u.name)] = low(u.email); });
  const nameOf = {}; users.forEach(function(u){ if (u && staffEmail(u.email)) nameOf[low(u.email)] = s(u.name); });
  const box = {}, opt = {};   /* patch APOFFICE2: per office person, how many wait on a PM (optional for the office) */
  const optional = function(){ office.forEach(function(e){ opt[e] = (opt[e] || 0) + 1; }); };
  const add = function(email, it){ email = low(email); if (!staffEmail(email)) return; const l = (box[email] = box[email] || []); if (l.indexOf(it) < 0) l.push(it); };   /* patch APOFFICE: once per person */
  const base = A.crmBase();
  (cur ? cur.list : []).forEach(function(x){
    if (!x || x.status !== 'waiting') return;
    const it = { title: s(x.title) || s(x.kind), sub: s(x.jobName), link: base + '/#appr=' + encodeURIComponent(s(x.id)), raw: x };
    if (x.step === 'pm') { if (staffEmail(x.pmEmail)) add(x.pmEmail, it); else admins.forEach(function(e){ add(e, it); }); optional(); return; }   /* patch APOFFICE2: the office may take the PM step at once — one count line, not in her list */
    admins.forEach(function(e){ add(e, it); });
    const esc24 = x.escalated || (Date.parse(x.adminSince || x.createdAt || 0) && now - Date.parse(x.adminSince || x.createdAt) >= 24 * 3600e3);
    if (x.officeOk === true || esc24) office.forEach(function(e){ add(e, it); });
  });
  /* patch SUBINV (owner 10/27): JOB COSTS (sub invoices, job expenses / receipts) go to the job's PM; after 24 hours without
     the PM — or at once when the job has no PM — to the OFFICE. An admin gets one only as that job's PM — never as the extra / default approver. */
  const jobCost = function(pmName, since, it){
    const e = byName[low(pmName)], late = since && now - since >= 24 * 3600e3;
    if (e) add(e, it);
    if (!e || late) office.forEach(function(x){ add(x, it); }); else optional();   /* patch APOFFICE2: sooner = optional for the office (a count line) */
  };
  arr(extra.gc_sub_approvals).forEach(function(a){
    if (!a || a.status !== 'pending_pm') return;
    const it = { title: '👷 Sub invoice ' + usd(a.amt) + ' from ' + (s(a.sub) || 'a sub'), sub: s(a.jobName || a.pmName), link: base + '/#todo', raw: { kind: 'sub_invoice', urgency: a.urgency, createdAt: a.createdAt } };
    jobCost(a.pmName, +a.createdAt || Date.parse(a.createdAt) || 0, it);
  });
  arr(extra.gc_expense_approvals).forEach(function(a){
    if (!a || (a.status !== 'pending_pm' && a.status !== 'escalated')) return;
    const it = { title: '🧾 Job expense ' + usd(a.amount) + (a.payee ? ' — ' + s(a.payee) : ''), sub: s(a.desc || a.pm), link: base + '/#todo', raw: { kind: 'expense', createdAt: a.enteredAt } };
    jobCost(a.status === 'escalated' ? '' : a.pm, Date.parse(a.enteredAt) || 0, it);
  });
  arr(extra.payrollRuns).forEach(function(r){
    if (!r || r.status !== 'pending') return;
    const n = arr(r.lines).filter(function(L){ return L && L.status !== 'denied'; }).length;
    const it = { title: '💵 Payroll for ' + s(r.payDate) + ' — ' + n + ' check' + (n === 1 ? '' : 's') + ', net ' + usd(r.totals && r.totals.net), sub: r.auto ? 'made by itself on Thursday' : '', link: base + '/#todo', raw: { kind: 'payroll_run', meta: { urgency: 'soon' }, createdAt: r.submittedAt || r.createdAt } };
    admins.forEach(function(e){ add(e, it); });
  });
  const rep = { ok: true, people: 0, mailed: 0, pushed: 0, items: 0 };
  for (const email of Object.keys(box)) {
    const list = order(box[email], now); rep.people++; rep.items += list.length;
    const optLine = opt[email] ? '<p style="font-size:13px;color:#55626F">👷 ' + opt[email] + ' waiting on PMs — optional for you (✅ Approvals → <b>👷 PM approvals</b>).</p>' : '';   /* patch APOFFICE2 */
    const subject = '✅ ' + list.length + ' approval' + (list.length === 1 ? '' : 's') + ' waiting on you — GrayCo CRM';
    const html = A.shell('Good morning' + (nameOf[email] ? ', ' + nameOf[email].split(' ')[0] : '') + ' — ' + list.length + ' waiting on you',
      '<p>Tap one to open it in the CRM (you may be asked to sign in). Nothing is approved from this e-mail.</p><ul style="padding-left:18px">' + list.slice(0, MAX).map(line).join('') + '</ul>' + optLine +
      (list.length > MAX ? '<p>+' + (list.length - MAX) + ' more in the CRM.</p>' : '') +
      '<p style="font-size:13px;color:#55626F">Routine ones (payment reminders, appointment reminders, waiver requests to known subs) can be approved together in the CRM: ✅ Approvals → <b>Approve all routine</b>.</p>' +
      '<p><a href="' + esc(base + '/#todo') + '">Open my approvals</a></p>');
    const m = await A.staffMail(email, subject, html); if (m.ok) rep.mailed++;
    try { const p = await C.pushTo([email], { title: subject.replace(' — GrayCo CRM', ''), body: list.slice(0, 3).map(function(x){ return clip(x.title, 60); }).join(' · '), tag: 'gc-digest' }); rep.pushed += p.sent || 0; } catch (e) {}
    try { const c = await require('./smsalert.js').approvals(email, list.length); rep.texted = (rep.texted || 0) + (c.sent || 0); } catch (e) {}   /* patch SMSALERT: one text a day at most */
  }
  return rep;
}
module.exports = { run };
