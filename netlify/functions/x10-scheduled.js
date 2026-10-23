// netlify/functions/x10-scheduled.js — patch X10, every 2 minutes (netlify.toml):
//   · 📟 on-call pages nobody accepted in time → the next person on the rotation → every admin
//   · once a day (7 AM Central): 🚚 vehicle reminders (oil / service, registration, insurance) → the driver + the
//     office To-Do; 🔐 access codes of jobs that closed are wiped
//   · the 1st of the month (8 AM Central): 💵 a statement for every customer with an open balance → ✅ Approvals
//     (PM, then an admin; it goes from billing@ once approved), balances over 60 days → an Office To-Do to call;
//     📊 each person's own "My data" statement by e-mail
// X10_OFF=1 stops all of it.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const X = require('./_lib/x10.js');
const OC = require('./_lib/oncall.js');
function L(){ return require('./bid-inbox.js')._lib; }
function C(){ return require('./portal.js')._core; }
const MARKS = 'gc_x10_marks';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : (v && Array.isArray(v.list) ? v.list : []); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function usd(n){ return '$' + X.r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function now(){ return typeof exports._now === 'function' ? exports._now() : Date.now(); }
function nowIso(){ return new Date(now()).toISOString(); }

/* run a task at most once per key (a day, a month) — claimed first, so two runs never both do it */
async function once(key, fn){
  let mine = false;
  await L().kvCas(MARKS, function(v){ v = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; if (v[key]) return undefined; v[key] = nowIso();
    Object.keys(v).forEach(function(k){ if (Date.parse(v[k]) < now() - 400 * 864e5) delete v[k]; }); mine = true; return v; });
  if (!mine) return { skipped: true };
  return fn();
}
async function mail(to, subject, html, hint){
  const key = s(process.env.RESEND_API_KEY); if (!key || !to.length) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: to, subject: require('./_lib/mailtag.js').tag(subject, to, hint), html: html, headers: { 'X-GrayCo-CRM': 'x10' } }) });
    return r.ok;
  } catch (e) { return false; }
}
function box(title, body){ return '<div style="font:14px Arial;color:#1b1640;max-width:620px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700">' + esc(title) + '</div><div style="padding:8px 18px">' + body + '</div></div>'; }

/* ── 🚚 vehicles ── */
async function fleetDaily(data){
  const v = arr(await L().kvGet('gc_x10_fleet')), today = X.wall(now()).day;
  let n = 0;
  for (const x of v) {
    const due = X.vehicleDue(x, today); if (!due.length) continue;
    const label = due.map(function(d){ return d.label; }).join(' · ');
    try { await C().officeTodo('x10_fleet_' + x.id + '_' + due.map(function(d){ return d.k; }).join('') + '_' + today.slice(0, 7), '🚚 ' + (x.name || 'Vehicle') + ': ' + label, 'Driver: ' + (x.driverName || x.driver || 'not assigned') + '. Mark it done in Admin → 🚚 Vehicles & gas.'); } catch (e) {}
    if (X.okEmail(x.driver) && due.some(function(d){ return d.over || d.k !== 'oil'; })) await mail([low(x.driver)], '🚚 ' + (x.name || 'Your vehicle') + ': ' + label, box('Your company vehicle', '<p><b>' + esc(x.name) + '</b>' + (x.plate ? ' · ' + esc(x.plate) : '') + '</p><p>' + esc(label) + '</p><p>Log it in the CRM (My Profile → 📊 My data → 🚚) once it is done.</p>'), 'area:Fleet');
    n++;
  }
  return n;
}
/* ── 🔐 codes of closed jobs are wiped ── */
async function codesWipe(data){
  let wiped = 0;
  await L().kvCas('gc_x10_codes', function(v){ const l = Array.isArray(v) ? v : []; const keep = l.filter(function(r){ const p = C().findProject(data, r.pid); const gone = !p || X.jobClosed(p); if (gone) wiped++; return !gone; }); return wiped ? keep : undefined; });
  return wiped;
}
/* ── 💵 monthly statements ── */
function statementHtml(g, today){
  const rows = g.lines.map(function(l){ return '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">' + esc(l.date) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee">' + esc(l.number) + (l.job ? '<br><span style="color:#666;font-size:12px">' + esc(l.job) + '</span>' : '') + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + usd(l.amount) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + usd(l.paid) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:700">' + usd(l.balance) + '</td></tr>'; }).join('');
  return '<p>Hi ' + esc(s(g.name).split(/\s+/)[0] || 'there') + ',</p><p>Here is your GrayCo statement as of ' + esc(today) + '. Thank you for choosing GrayCo!</p>' +
    '<table style="width:100%;border-collapse:collapse;font:14px Arial"><tr style="background:#f4f1e8"><th style="text-align:left;padding:6px 8px">Date</th><th style="text-align:left;padding:6px 8px">Invoice</th><th style="text-align:right;padding:6px 8px">Amount</th><th style="text-align:right;padding:6px 8px">Paid</th><th style="text-align:right;padding:6px 8px">Balance</th></tr>' + rows +
    '<tr><td colspan="4" style="padding:8px;text-align:right;font-weight:700">Balance due</td><td style="padding:8px;text-align:right;font-weight:800">' + usd(g.balance) + '</td></tr></table>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + C().LINK_PH + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">See my invoices &amp; pay</a></p>' +
    '<p style="font-size:13px;color:#55626F">Already paid? Thank you — payments can take a few days to show. Questions? Call GrayCo at 901-585-0944.</p>';
}
async function statementsMonthly(data){
  const today = X.wall(now()).day, invs = arr(data.invs).concat(arr(data.invoices)).filter(C().isCustomerInvoice);
  const seen = {}, rows = [];
  invs.forEach(function(r){ const id = s(r.id); if (id && seen[id]) return; if (id) seen[id] = 1;
    const pid = s(r.pid || r.projectId || r.jobId || r.project_id), p = C().findProject(data, pid); if (!p || p.deleted === true) return;
    const bal = C().invBalance(r); if (!(bal > 0.01)) return;
    let jn = s(p.name); try { jn = C().scrub({ n: jn }, C().insWords(data, p)).n.replace(/your insurance company\s*claim/i, '').trim().replace(/\s*[\u2014\-\u2013]\s*(claim)?\s*$/i, '').trim(); } catch (e) {}   /* never the carrier */
    rows.push({ pid: pid, job: jn, email: s(p.clientEmail || p.customerEmail || p.email), name: s(p.client || p.clientName || p.customer), number: C().invNumber(r), date: s(r.date || r.sentDate || r.created).slice(0, 10) || today, amount: C().invAmount(r), paid: C().invAmount(r) - bal, balance: bal }); });
  const groups = X.statements(rows, today);
  let queued = 0, calls = 0;
  for (const g of groups) {
    const p = C().findProject(data, g.lastPid), pm = C().pmOf(data, p);
    if (g.email) {
      const ok = await C().queueApproval({ id: 'appr_stmt_' + today.slice(0, 7) + '_' + g.key.replace(/[^a-z0-9@._-]/gi, '').slice(0, 60), kind: 'invoice_statement', title: 'Monthly statement ' + usd(g.balance) + ' to ' + (g.name || g.email), pid: g.lastPid, jobName: s(p && p.name), pm: pm, to: g.email,
        subject: 'Your GrayCo statement — ' + today.slice(0, 7), html: statementHtml(g, today), meta: { statement: true, balance: g.balance, over60: g.over60, lines: g.lines.length } });
      if (ok) queued++;
    }
    if (g.over60 > 0.01 || !g.email) {
      try { await C().officeTodo('x10_call_' + today.slice(0, 7) + '_' + g.key.slice(0, 60), '📞 Call ' + (g.name || 'the customer') + ' — ' + usd(g.over60 || g.balance) + (g.over60 ? ' over 60 days' : ' open (no e-mail on file)'),
        g.lines.map(function(l){ return l.number + ' ' + l.date + ' ' + usd(l.balance) + ' (' + l.age + ' days)'; }).join(' · ') + (pm ? ' · PM ' + pm.name : '')); calls++; } catch (e) {}
    }
  }
  return { customers: groups.length, queued: queued, calls: calls };
}
/* ── 📊 each person's own monthly statement ── */
async function myDataMonthly(data){
  const last = new Date(now() - 5 * 864e5).toISOString().slice(0, 7);   /* the month that just ended */
  const snaps = (await L().kvGet('gc_x10_mydata')) || {};
  const people = arr(data.users).filter(function(u){ return u && u.active !== false && X.okEmail(u.email) && /pm|project|apm|assistant|super|estimat|field/i.test(s(u.role) + ' ' + s(u.profile) + ' ' + s(u.title)); });
  let sent = 0;
  for (const u of people) {
    const n = X.personNumbers(u.email, u.name, data, last, { invoices: function(d){ return arr(d.invs).concat(arr(d.invoices)).filter(C().isCustomerInvoice); }, invAmount: C().invAmount, invBalance: C().invBalance });
    const sn = snaps[low(u.email)];
    const html = box('Your GrayCo numbers — ' + last, '<p>Hi ' + esc(s(u.name).split(/\s+/)[0]) + ', here are your own numbers (only you and the admins see these).</p><table style="font:14px Arial">' +
      [['Open jobs', n.openJobs], ['Billed in ' + last, usd(n.billedMonth)], ['Collected in ' + last, usd(n.collectedMonth)], ['Billed, all your jobs', usd(n.billed)], ['Collected, all your jobs', usd(n.collected)], ['Leads', n.leads], ['Close rate', n.closeRate == null ? '—' : n.closeRate + '%']]
        .map(function(r){ return '<tr><td style="padding:3px 12px 3px 0;color:#555">' + esc(r[0]) + '</td><td style="font-weight:700">' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>' +
      (sn ? '<p><b>Commission</b> (as of ' + esc(s(sn.at).slice(0, 10)) + '): earned ' + usd(sn.expected) + ' · paid ' + usd(sn.paid) + ' · pending ' + usd(sn.pending) + '</p>' : '') +
      '<p><a href="' + esc((process.env.CRM_URL || 'https://crm.grayco-cs.com').replace(/\/$/, '')) + '/#myprofile">Open 📊 My data in the CRM</a> for every job.</p>');
    if (await mail([low(u.email)], '📊 Your GrayCo numbers — ' + last, html, 'area:Reports')) sent++;
  }
  return sent;
}

async function run(){
  if (s(process.env.X10_OFF) === '1') return { off: true };
  const out = {};
  let data = null; const getData = async function(){ if (!data) data = await C().crmData(true); return data; };
  try {
    const pages = await OC.make({ env: function(k){ return s(process.env[k]); }, kvGet: L().kvGet, kvCas: L().kvCas, now: exports._now }).pages();
    if (pages.some(function(p){ return !p.acceptedAt && !p.adminsAt; })) {
      const d = await getData();
      out.oncall = await OC.make({ env: function(k){ return s(process.env[k]); }, kvGet: L().kvGet, kvCas: L().kvCas, now: exports._now, push: function(to, p){ return C().pushTo(to, p); } }).escalate(C().adminEmails(d));
    }
  } catch (e) { out.oncallError = s(e && e.message); }
  const w = X.wall(now());
  if (w.hm >= '07:00') {
    try { out.daily = await once('daily:' + w.day, async function(){ const d = await getData(); return { fleet: await fleetDaily(d), codesWiped: await codesWipe(d) }; }); } catch (e) { out.dailyError = s(e && e.message); }
  }
  if (w.day.slice(8) === '01' && w.hm >= '08:00') {
    try { out.monthly = await once('monthly:' + w.day.slice(0, 7), async function(){ const d = await getData(); return { statements: await statementsMonthly(d), mydata: await myDataMonthly(d) }; }); } catch (e) { out.monthlyError = s(e && e.message); }
  }
  return out;
}
exports.handler = async function(){ const r = await run(); return { statusCode: 200, body: JSON.stringify(r) }; };
exports._test = { run: run, statementsMonthly: statementsMonthly, fleetDaily: fleetDaily, codesWipe: codesWipe, myDataMonthly: myDataMonthly, statementHtml: statementHtml };
