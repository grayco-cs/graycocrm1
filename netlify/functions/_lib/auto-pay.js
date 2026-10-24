/* netlify/functions/_lib/auto-pay.js — patch AUTO-PAY, the server's half. The payroll draft itself is made on
   Thursday from 6 AM by the CRM (index.html, gc-patch-auto-pay), with the CRM's own payroll engine. At 10 AM Thursday
   this checks that the draft for tomorrow's payday is there; when it is not (no admin / office computer had the CRM
   open), the office gets a to-do and the admins and office a phone push and an e-mail. Staff only, never a payment.
   Paydays: EVERY Friday — payroll is weekly (owner 10/24, patch AUTO-PAYWEEK); there is no anchor any more, so the
   old PAYROLL_ANCHOR setting is not read. The CRM's own running draft (status draft, auto) is not a draft on
   Approvals, so it does not count. */
'use strict';
const A = require('./auto-common.js');
const { s, arr, ymd, addDays } = A;
function isPayday(day){ return new Date(ymd(day) + 'T12:00:00Z').getUTCDay() === 5; }
function live(r){ return r && r.auto === true && s(r.status) === 'draft' && s(r.id).indexOf('PRauto_') !== 0; }
async function run(opts){
  opts = opts || {};
  const C = A.core(), now = opts.now != null ? opts.now : Date.now(), c = A.central(now);
  const payday = addDays(c.ymd, 1);
  if (c.wd !== 'Thu') return { ok: true, skipped: 'not Thursday' };
  if (!isPayday(payday)) return { ok: true, skipped: payday + ' is not a payday', payday: payday };
  const raw = await C.kvRead(['payrollRuns']);
  const runs = arr(raw.payrollRuns);
  const have = runs.filter(function(r){ return r && !live(r) && !/denied|void|deleted|cancel/i.test(s(r.status)) && ymd(r.payDate || r.payday || r.date) === payday; });
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
module.exports = { run, isPayday };
