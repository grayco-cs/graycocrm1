/* netlify/functions/_lib/auto-pay.js — patch AUTO-PAY, the server's half. The payroll draft itself is made on
   Thursday from 6 AM by the CRM (index.html, gc-patch-auto-pay), with the CRM's own payroll engine. At 10 AM Thursday
   this checks that the draft for tomorrow's payday is there; when it is not (no admin / office computer had the CRM
   open), the office gets a to-do and the admins and office a phone push and an e-mail. Staff only, never a payment.
   Paydays: every two weeks from the CRM's anchor Friday (2026-08-21, the same default as _gcPayPeriodFor; Netlify
   PAYROLL_ANCHOR overrides). */
'use strict';
const A = require('./auto-common.js');
const { s, low, arr, ymd, addDays, daysBetween } = A;
function anchor(){ const v = ymd(process.env.PAYROLL_ANCHOR); return v || '2026-08-21'; }
function isPayday(day){ const d = daysBetween(anchor(), day); return d % 14 === 0; }
async function run(opts){
  opts = opts || {};
  const C = A.core(), now = opts.now != null ? opts.now : Date.now(), c = A.central(now);
  const payday = addDays(c.ymd, 1);
  if (c.wd !== 'Thu') return { ok: true, skipped: 'not Thursday' };
  if (!isPayday(payday)) return { ok: true, skipped: payday + ' is not a payday', payday: payday };
  const raw = await C.kvRead(['payrollRuns']);
  const runs = arr(raw.payrollRuns);
  const have = runs.filter(function(r){ return r && !/denied|void|deleted|cancel/i.test(s(r.status)) && ymd(r.payDate || r.payday || r.date) === payday; });
  if (have.length) return { ok: true, payday: payday, draft: have.map(function(r){ return { id: s(r.id), status: s(r.status), auto: r.auto === true }; }) };
  const data = await C.crmData(true);
  const admins = C.adminEmails(data), office = C.officeEmails(data);
  const label = '💵 Payroll for Friday ' + payday + ' is not drafted yet';
  const note = 'Open the CRM on an office or admin computer: it calculates the draft by itself (or press 💵 Payroll → Calculate payroll). Then an admin approves each check.';
  await A.todo('autopay_missing_' + payday, label, { note: note, due: c.ymd, by: 'CRM (Thursday payroll)' });
  let pushed = 0; try { const p = await C.pushTo(admins.concat(office), { title: label, body: note, tag: 'gc-autopay-' + payday }); pushed = p.sent || 0; } catch (e) {}
  const mail = await A.staffMail(admins.concat(office), label, A.shell(label, '<p>' + A.esc(note) + '</p><p><a href="' + A.crmBase() + '/#payroll">Open the CRM</a></p>'));
  return { ok: true, payday: payday, missing: true, pushed: pushed, mailed: !!mail.ok };
}
module.exports = { run, isPayday, anchor };
