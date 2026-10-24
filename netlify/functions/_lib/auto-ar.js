/* netlify/functions/_lib/auto-ar.js — patch AUTO-AR: past-due reminders for deposit, draw and change-order invoices.
   Every morning (auto-wins.js, the first run after 7 AM Central) each client invoice that is NOT the final invoice
   (the final invoice has its own reminders, portal-reminders.js) and is 7, 15 or 30 days past its due date gets ONE
   polite reminder drafted on the approvals list — from billing@, with the invoice PDF (made fresh, so it shows the
   balance still open) and the customer's portal link. EVERY reminder waits there: nothing is ever sent by itself.
   The office (or Wesley / Nick) approves. At 45 days past due the job's PM gets a to-do to call the customer.
   Never for: a paid invoice (a partly paid one is reminded for what is still open), an invoice imported or entered as
   history, a QuickBooks copy, a draft / in-review invoice, a job whose customer e-mails are paused (Customer portal →
   More → Pause automatic e-mails), a history job, a job whose ⏰ Payment reminders switch is off (⚙ Automations), or
   while ⏸ Data-entry mode is on. One item per invoice per step (7 / 15 / 30); while one waits, the next is not added. */
'use strict';
const A = require('./auto-common.js');
const { s, low, num, usd, arr, ymd, esc, clip, pidOf, okEmail, daysBetween } = A;
const STAGES = [7, 15, 30], CALL_DAYS = 45;
const KIND = 'payment_reminder';
function isFinal(r){ return r.isFinal === true || r.final === true || /^final/i.test(s(r.drawType)) || /^final/i.test(s(r.draw)); }
function historyJob(p){ return p.importedHistory === true || p.noSend === true || p.historyOnly === true; }
function qbCopy(r){ return /quickbooks|^qb/i.test(s(r.source)) || !!r.qbId || !!r.qbKey; }
function custEmail(data, p){
  const e = s(p.clientEmail || p.customerEmail || p.email); if (okEmail(e)) return low(e);
  const nm = low(p.client || p.customer || p.clientName);
  const c = arr(data.customers).find(function(x){ return nm && low(x.name || x.company) === nm; });
  return c && okEmail(c.email) ? low(c.email) : '';
}
function first(name){ const t = s(name).split(/\s+/)[0]; return t && !/^(the|mr|mrs|ms|dr)\.?$/i.test(t) ? t : ''; }
function stageFor(days){ let st = 0; STAGES.forEach(function(x){ if (days >= x) st = x; }); return st; }
function letter(stage, o){
  const lines = {
    7: 'This is a friendly reminder that invoice #' + esc(o.number) + ' for ' + esc(o.job) + ' was due on ' + esc(o.due) + '. If you have already sent payment, thank you, and please disregard this note.',
    15: 'Our records show invoice #' + esc(o.number) + ' for ' + esc(o.job) + ' is now ' + o.days + ' days past due (due ' + esc(o.due) + '). Please arrange payment this week. If something on the invoice needs a second look, reply and we will sort it out right away.',
    30: 'Invoice #' + esc(o.number) + ' for ' + esc(o.job) + ' is now ' + o.days + ' days past due (due ' + esc(o.due) + '). Please send payment, or call us so we can work out a plan together.'
  };
  return '<p style="font-size:15px">Hi ' + esc(first(o.client) || 'there') + ',</p>' +
    '<p style="font-size:15px;line-height:1.5">' + lines[stage] + '</p>' +
    '<p style="font-size:15px;line-height:1.5"><b>Balance due: ' + usd(o.balance) + '</b>' + (o.paid > 0 ? ' (thank you for the ' + usd(o.paid) + ' already paid)' : '') + '</p>' +
    '<p style="font-size:15px;line-height:1.5">How to pay: a <b>check</b> made out to GrayCo Construction Services, or <b>cash</b>, handed to ' + esc(o.pm || 'your Project Manager') + '. The invoice is attached and is always in your portal.</p>' +
    '<p style="text-align:center;margin:20px 0"><a href="{{PORTAL_LINK}}" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block">See my invoices</a></p>' +
    '<p style="font-size:13px;color:#55626F">Questions? Call us at 901-585-0944.</p>';
}
/* opts: { now } (tests). Returns a report. */
async function run(opts){
  opts = opts || {};
  const C = A.core(), now = opts.now != null ? opts.now : Date.now();
  const today = A.central(now).ymd;
  const rep = { ok: true, day: today, queued: 0, calls: 0, noEmail: 0, skipped: 0, paused: 0, off: 0 };
  if (await A.paused()) return Object.assign(rep, { dataEntryMode: true });
  const data = await C.crmData(true);
  const cur = await C.kvListRead(C.AQ_KEY);
  if (!cur) return { ok: false, error: 'approvals list unreadable' };
  const ids = {}, waitingFor = {};
  cur.list.forEach(function(x){ ids[s(x.id)] = 1; if (x.kind === KIND && (x.status === 'waiting' || x.status === 'sending')) waitingFor[s((x.meta || {}).invoiceId)] = 1; });
  const invs = C.listOf(data, ['invs', 'invoices']);
  for (const r of invs) {
    const invId = s(r.id); if (!invId) continue;
    if (!C.isCustomerInvoice(r) || isFinal(r) || C.isHistoryInvoice(r) || r.recordOnly === true || qbCopy(r)) continue;
    if (/pending|ready_for_review/.test(low(r.status))) continue;
    const bal = C.invBalance(r); if (!(bal > 0)) continue;
    const due = ymd(r.dueDate || r.due); if (!due) continue;
    const days = daysBetween(due, today); if (days < STAGES[0]) continue;
    const p = pidOf(r) ? C.findProject(data, pidOf(r)) : null; if (!p) { rep.skipped++; continue; }
    if (/lost|dead|cancel/.test(low(p.status))) continue;
    if (p.portalRemindersPaused === true || historyJob(p)) { rep.paused++; continue; }
    if (!C.jaAllows(data, p, 'paymentReminders')) { rep.off++; continue; }
    const number = C.invNumber(r), amt = C.invAmount(r), pm = C.pmOf(data, p), client = s(p.client || p.customer || p.clientName);
    /* 45 days: the PM calls (once per invoice) */
    if (days >= CALL_DAYS) {
      const made = await A.todo('arcall_' + invId, '📞 Call ' + (client || 'the customer') + ' about invoice #' + number + ' — ' + days + ' days past due, ' + usd(bal) + ' open',
        { email: pm && pm.email, name: pm && pm.name, pid: p.id, due: today, by: 'CRM (past-due invoices)',
          note: (p.name ? s(p.name) + ' · ' : '') + 'Reminders went out at 7, 15 and 30 days. A call usually settles it.' });
      if (made) rep.calls++;
    }
    const stage = A.num(stageFor(days)); if (!stage) continue;
    const qid = 'appr_arrem_' + invId + '_' + stage;
    if (ids[qid] || waitingFor[invId]) { rep.skipped++; continue; }
    const to = custEmail(data, p);
    if (!to) {
      if (await A.todo('arrem_noemail_' + invId, '⏰ Invoice #' + number + ' is ' + days + ' days past due — no customer e-mail on file', { pid: p.id, by: 'CRM (past-due invoices)',
        note: (p.name || '') + ' · ' + usd(bal) + ' open. Add the customer e-mail on the job, or remind them by phone.' })) rep.noEmail++;
      continue;
    }
    const o = { number: number, job: s(p.name) || 'your project', due: due, days: days, balance: bal, paid: Math.max(0, amt - bal), client: client, pm: pm && pm.name };
    const ok = await C.queueApproval({ id: qid, kind: KIND, pid: s(p.id), jobName: p.name, pm: null, officeOk: true, to: to,
      title: '⏰ Payment reminder (' + days + ' days late) — invoice #' + number + ' ' + usd(bal) + ' to ' + (client || to),
      subject: (stage >= 30 ? 'Past due: ' : stage >= 15 ? 'Second reminder: ' : 'Friendly reminder: ') + 'GrayCo invoice #' + number + ' — ' + usd(bal),
      html: letter(stage, o), attachments: [{ name: 'GrayCo Invoice ' + number + '.pdf', kind: 'pdf', invoiceId: invId }],
      meta: { invoiceId: invId, invoiceNumber: number, stage: stage, daysLate: days, balance: bal, pmName: pm ? pm.name : '', by: 'auto-ar' } });
    if (ok) { rep.queued++; ids[qid] = 1; waitingFor[invId] = 1; }
  }
  return rep;
}
module.exports = { run, stageFor, letter, STAGES, CALL_DAYS, KIND };
