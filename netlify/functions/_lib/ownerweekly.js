/* ============================================================================
   GrayCo — THE WEEKLY OWNER REPORT (patch AUTOC 6).   netlify/functions/_lib/ownerweekly.js

   Owner 10/29 ("20 yes"): every Monday 7:00 AM Central an e-mail to the admins (Wesley, Nick) with LAST WEEK
   (Monday–Sunday, Central): leads by source, close rate, jobs started / finished, money in / out, open approvals,
   overdue items per PM ("which PMs are behind"), emergencies and response times, website leads + calls.
   Clean HTML that reads on a phone (one column, big numbers, tables that wrap). The same report opens in the CRM
   (Admin → 📊 Weekly owner report; scheduled-reports.js ?view=1). Nothing here is sent to anyone outside GrayCo.

   build(src, nowMs) is PURE (the tests drive it): src = { projects, leads, invs, invoices, expenses, gcAcctRegister,
   projectPayments, estimates, users, tasks, approvals, inbox, calls, emerg }. Every figure is counted from those
   records; what cannot be counted is said so ("no calls recorded"), never guessed.
   ========================================================================== */
'use strict';
const TZ = 'America/Chicago', DAY = 864e5;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } if (v && !Array.isArray(v) && Array.isArray(v.list)) v = v.list; return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function esc(v){ return s(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(n){ n = Math.round(num(n)); return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US'); }
function pct(a, b){ return b ? Math.round(a / b * 100) + '%' : '—'; }
function dead(x){ return !x || x.deleted === true || x._deleted === true || x.__deleted === true; }
/* a record's date as a Central calendar day ('' = none) */
function dayOf(v){
  const t = s(v); if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const ms = Date.parse(t); if (!isFinite(ms)) return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '';
  return centralDay(ms);
}
function centralDay(ms){ const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; }); return o.year + '-' + o.month + '-' + o.day; }
function addDays(d, n){ const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function wd(d){ return new Date(d + 'T12:00:00Z').getUTCDay(); }
function nice(d){ return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
/* last week: the Monday–Sunday before the week that contains nowMs (Central) */
function lastWeek(nowMs){
  const today = centralDay(nowMs), back = (wd(today) + 6) % 7;   /* days since this Monday */
  const mon = addDays(today, -back - 7);
  return { from: mon, to: addDays(mon, 6), today, label: nice(mon) + ' – ' + nice(addDays(mon, 6)) + ', ' + addDays(mon, 6).slice(0, 4) };
}
function inWeek(d, w){ return !!d && d >= w.from && d <= w.to; }
function mk(){ return require('./mkcalc.js'); }
function srcLabel(v){ const raw = s(v); let n = ''; try { n = mk().normSource(raw); } catch (e) {} return n && n !== 'Other' ? n : (raw ? raw.replace(/\s*[—-]\s*.*$/, '').slice(0, 40) : '(not set)'); }
function isPMRole(u){ return /pm|project manager|estimat|super/i.test(s(u.role) + ' ' + s(u.title) + ' ' + s(u.profile)); }
const CLOSED_LEAD = /won|lost|dead|declin|closed|converted|archived|no.?bid|cancel/i;
const ACTIVE_JOB = /^(active|approved|in[ _-]?progress|scheduled|signed|sold|contract)/i;
const DONE_JOB = /^(complete|completed|closed|done|finished)/i;

function build(src, nowMs){
  src = src || {}; const w = lastWeek(nowMs), today = w.today;
  const projects = arr(src.projects).filter(p => !dead(p) && p.id);
  const leads = arr(src.leads).filter(l => !dead(l) && l.id);
  const inbox = arr(src.inbox).filter(x => !dead(x) && x.id);
  const users = arr(src.users);
  const out = { week: w, generatedAt: new Date(nowMs).toISOString() };

  /* 1. new leads by source (the Lead Inbox — website, texts, calls, e-mail, bids — and CRM leads typed in by hand) */
  const bySrc = {}; let leadCount = 0;
  const add = (label, kind) => { const k = label || '(not set)'; bySrc[k] = bySrc[k] || { source: k, n: 0 }; bySrc[k].n++; leadCount++; };
  const inboxIds = {};
  inbox.forEach(x => { const d = dayOf(x.receivedAt || (x.leadExtra && x.leadExtra.receivedAt) || x.createdAt || x.firstSeen); inboxIds[s(x.id)] = 1; if (inWeek(d, w)) add(srcLabel((x.leadExtra && (x.leadExtra.mkSource || x.leadExtra.leadSource)) || x.source)); });
  leads.forEach(l => { if (l.inboxId && inboxIds[s(l.inboxId)]) return; if (l.fromInbox || l.inboxKey) return; const d = dayOf(l.createdAt || l.created || l.date); if (inWeek(d, w)) add(srcLabel(l.mkSource || l.howHeard || l.source || l.leadSource)); });
  out.leads = { total: leadCount, bySource: Object.keys(bySrc).map(k => bySrc[k]).sort((a, b) => b.n - a.n || a.source.localeCompare(b.source)) };

  /* 2. close rate: won ÷ decided (won + lost), leads that came in during the last 90 days; and jobs won last week */
  let opps = [];
  try { opps = mk().build({ leads, projects, invs: arr(src.invs).concat(arr(src.invoices)), expenses: arr(src.expenses), estimates: arr(src.estimates), now: today, monthsBack: 4 }).opps || []; } catch (e) { opps = []; }
  const since90 = addDays(today, -90), recent = opps.filter(o => o.created && o.created >= since90);
  const won90 = recent.filter(o => o.won).length, lost90 = recent.filter(o => o.lost).length;
  const wonWeek = opps.filter(o => o.won && inWeek(o.wonDate, w));
  out.close = { won90, lost90, rate: pct(won90, won90 + lost90), wonWeek: wonWeek.length, wonWeekValue: wonWeek.reduce((t, o) => t + num(o.revenue), 0), wonList: wonWeek.slice(0, 8).map(o => ({ label: o.label, value: o.revenue, source: o.source || '(not set)' })) };

  /* 3. jobs started / finished */
  const started = projects.filter(p => inWeek(dayOf(p.actualStart || p.startedAt || p.startDate), w) && !/lost|cancel|dead|bid|lead|estimate|proposal/i.test(s(p.status)));
  const finished = projects.filter(p => inWeek(dayOf(p.completionDate || p.completedAt || (p.walkthrough && p.walkthrough.signed && p.walkthrough.signed.at)), w));
  out.jobs = { started: started.map(p => ({ name: s(p.name), pm: s(p.pm) })), finished: finished.map(p => ({ name: s(p.name), pm: s(p.pm) })), active: projects.filter(p => ACTIVE_JOB.test(s(p.status))).length };

  /* 4. money in (customer payments dated last week) / out (expenses + bills paid last week) */
  let mIn = 0, mOut = 0; const seenPay = {};
  arr(src.invs).concat(arr(src.invoices)).forEach(iv => {
    if (dead(iv)) return; let cust = true; try { cust = mk().isClientInvoice ? mk().isClientInvoice(iv) : !/sub|vendor|bill|expense|cost/i.test(s(iv.type)); } catch (e) {}
    if (/sub|vendor|bill|expense|cost/i.test(s(iv.type))) cust = false;
    arr(iv.payments).forEach((pmt, i) => { const d = dayOf(pmt.date || pmt.at || pmt.paidAt); if (!inWeek(d, w)) return; const k = s(iv.id) + '|' + (s(pmt.id) || i); if (seenPay[k]) return; seenPay[k] = 1; if (cust) mIn += num(pmt.amount); else mOut += num(pmt.amount); });
    if (!arr(iv.payments).length && /paid/i.test(s(iv.status)) && !/unpaid|partial/i.test(s(iv.status)) && inWeek(dayOf(iv.paidDate || iv.paidAt), w)) { const a = num(iv.amt != null ? iv.amt : (iv.amount != null ? iv.amount : iv.total)); if (cust) mIn += a; else mOut += a; }
  });
  arr(src.projectPayments).forEach(x => { if (dead(x)) return; const k = 'pp|' + s(x.id); if (seenPay[k]) return; seenPay[k] = 1; if (inWeek(dayOf(x.date || x.at), w) && !x.invoiceId) mIn += num(x.amount || x.amt); });
  const exSeen = {};
  arr(src.expenses).concat(arr(src.gcAcctRegister)).forEach(x => {
    if (dead(x)) return; const id = s(x.id); if (id && exSeen[id]) return; if (id) exSeen[id] = 1;
    if (/payment|refund|transfer|deposit|income/i.test(s(x.type))) return;
    if (inWeek(dayOf(x.date), w)) mOut += Math.abs(num(x.amt != null ? x.amt : x.amount));
  });
  out.money = { in: mIn, out: mOut, net: mIn - mOut };

  /* 5. open approvals */
  const aq = arr(src.approvals).filter(x => x.status === 'waiting' || x.status === 'sending');
  const oldest = aq.map(x => Date.parse(x.createdAt)).filter(isFinite).sort((a, b) => a - b)[0];
  const byStep = {}; aq.forEach(x => { const k = x.step === 'admin' ? 'admins' : x.step === 'pm' ? (s(x.pm) || 'a PM') : s(x.step) || 'other'; byStep[k] = (byStep[k] || 0) + 1; });
  out.approvals = { open: aq.length, oldestDays: oldest ? Math.floor((nowMs - oldest) / DAY) : 0, byStep: Object.keys(byStep).map(k => ({ who: k, n: byStep[k] })).sort((a, b) => b.n - a.n) };

  /* 6. overdue per PM: open To-Dos past due, active jobs past their end date, open leads past their due date */
  const people = {};
  const nameOfEmail = e => { const u = users.find(x => low(x.email) === low(e)); return u ? s(u.name) : s(e); };
  const bump = (name, k, label) => { name = s(name); if (!name) return; const p = people[low(name)] = people[low(name)] || { name, todos: 0, jobs: 0, leads: 0, items: [] }; p[k]++; if (p.items.length < 4) p.items.push(label); };
  arr(src.tasks).forEach(t => {
    if (dead(t) || t.done === true || t.kind === 'daily_plan' || t.personal) return;
    const due = dayOf(t.due || t.dueDate || t.forDate); if (!due || due >= today) return;
    arr((t.assignees || []).map(e => ({ e }))).forEach(a => bump(nameOfEmail(a.e), 'todos', '☐ ' + s(t.label || t.title).slice(0, 60)));
  });
  projects.forEach(p => { const end = dayOf(p.endDate || p.targetEnd || p.endDateSch); if (ACTIVE_JOB.test(s(p.status)) && !DONE_JOB.test(s(p.status)) && end && end < today) bump(p.pm, 'jobs', '🏗 ' + s(p.name).slice(0, 50) + ' (end ' + nice(end) + ')'); });
  leads.forEach(l => { const due = dayOf(l.dueDate || l.bidDue || l.followUpDate); if (!due || due >= today || CLOSED_LEAD.test(s(l.status) + ' ' + s(l.stage))) return; bump(l.pm || l.assignee || l.assignedTo || l.estimator, 'leads', '📋 ' + s(l.name || l.title).slice(0, 50) + ' (due ' + nice(due) + ')'); });
  const pmNames = {}; users.filter(isPMRole).forEach(u => { pmNames[low(u.name)] = 1; });
  out.overdue = Object.keys(people).map(k => Object.assign(people[k], { total: people[k].todos + people[k].jobs + people[k].leads, pm: !!pmNames[k] }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  out.behind = out.overdue.filter(p => p.total >= 3).map(p => p.name);

  /* 7. emergencies and response times (gc_emerg_calls: registered → acknowledged / accepted) */
  const em = arr(src.emerg).filter(r => inWeek(dayOf(r.createdAt), w));
  const mins = em.map(r => { const a = [r.ackAt, r.acceptedAt].map(Date.parse).filter(isFinite).sort((x, y) => x - y)[0]; return a ? Math.max(0, Math.round((a - Date.parse(r.createdAt)) / 60000)) : null; });
  const answered = mins.filter(x => x != null).sort((a, b) => a - b);
  let inboxEm = 0; try { const E = require('./emergency.js'); inboxEm = inbox.filter(x => inWeek(dayOf(x.receivedAt || x.createdAt), w) && E.isEmergency(x)).length; } catch (e) {}
  out.emergencies = { count: Math.max(em.length, inboxEm), tracked: em.length, answered: answered.length, unanswered: em.length - answered.length,
    medianMin: answered.length ? answered[Math.floor((answered.length - 1) / 2)] : null, worstMin: answered.length ? answered[answered.length - 1] : null,
    list: em.slice(0, 8).map((r, i) => ({ what: s(r.what || r.kind || r.title || 'Emergency').slice(0, 60), at: s(r.createdAt), min: mins[i], by: s(r.acceptedBy || r.ackWhy) })) };

  /* 8. website leads + calls */
  const web = inbox.filter(x => inWeek(dayOf(x.receivedAt || (x.leadExtra && x.leadExtra.receivedAt) || x.createdAt), w) && (x.origin === 'website' || x.sourceKind === 'website' || /website|leads@/i.test(s(x.source))) && !/missed call|text message/i.test(s(x.websiteForm)));
  const calls = arr(src.calls).filter(c => inWeek(dayOf(c.at), w));
  out.web = { leads: web.length, calls: calls.length, answered: calls.filter(c => c.answered === true).length, missed: calls.filter(c => c.answered === false).length, firstTime: calls.filter(c => c.firstCall === true).length, callsKnown: arr(src.calls).length > 0 };
  return out;
}

/* ── the HTML (e-mail safe: inline styles, tables, one column on a phone) ── */
const NAVY = '#0F1D2F', GOLD = '#D4A017', INK = '#14202E', MUTED = '#5B6675', LINE = '#E5E7EB';
function tile(label, value, sub){ return '<td style="padding:6px;width:50%;vertical-align:top"><div style="border:1px solid ' + LINE + ';border-radius:12px;padding:12px 14px;background:#fff"><div style="font-size:12px;color:' + MUTED + ';text-transform:uppercase;letter-spacing:.04em">' + esc(label) + '</div><div style="font-size:24px;font-weight:700;color:' + INK + ';margin-top:2px">' + esc(value) + '</div>' + (sub ? '<div style="font-size:12px;color:' + MUTED + ';margin-top:2px">' + esc(sub) + '</div>' : '') + '</div></td>'; }
function tiles(list){ let h = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">'; for (let i = 0; i < list.length; i += 2) h += '<tr>' + list[i] + (list[i + 1] || '<td style="width:50%"></td>') + '</tr>'; return h + '</table>'; }
function h2(t){ return '<h2 style="font-size:16px;color:' + NAVY + ';margin:22px 0 8px;border-bottom:2px solid ' + GOLD + ';padding-bottom:4px">' + esc(t) + '</h2>'; }
function rows(head, list){
  if (!list.length) return '<p style="color:' + MUTED + ';font-size:14px;margin:4px 0">None last week.</p>';
  return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px">' +
    '<tr>' + head.map((x, i) => '<th style="text-align:' + (i ? 'right' : 'left') + ';padding:6px 4px;color:' + MUTED + ';font-weight:600;border-bottom:1px solid ' + LINE + '">' + esc(x) + '</th>').join('') + '</tr>' +
    list.map(r => '<tr>' + r.map((x, i) => '<td style="padding:6px 4px;border-bottom:1px solid ' + LINE + ';text-align:' + (i ? 'right' : 'left') + ';vertical-align:top;word-break:break-word">' + x + '</td>').join('') + '</tr>').join('') + '</table>';
}
function html(m, o){
  o = o || {}; const site = s(o.site) || 'https://crm.grayco-cs.com';
  const e = m.emergencies, wb = m.web;
  let b = '';
  b += tiles([tile('New leads', String(m.leads.total)), tile('Close rate (90 days)', m.close.rate, m.close.won90 + ' won · ' + m.close.lost90 + ' lost'),
    tile('Money in', money(m.money.in), 'customer payments'), tile('Money out', money(m.money.out), 'expenses & bills paid'),
    tile('Jobs started', String(m.jobs.started.length), m.jobs.active + ' active now'), tile('Jobs finished', String(m.jobs.finished.length)),
    tile('Open approvals', String(m.approvals.open), m.approvals.open ? 'oldest ' + m.approvals.oldestDays + ' day' + (m.approvals.oldestDays === 1 ? '' : 's') : ''), tile('Emergencies', String(e.count), e.medianMin != null ? 'median response ' + e.medianMin + ' min' : (e.count ? 'no response recorded' : ''))]);
  if (m.behind.length) b += '<div style="margin:14px 6px 0;padding:10px 12px;border-radius:10px;background:#FEF3C7;color:#78350F;font-size:14px"><b>Behind:</b> ' + esc(m.behind.join(', ')) + ' (3 or more overdue items).</div>';
  b += h2('Leads by source') + rows(['Source', 'Leads'], m.leads.bySource.map(x => [esc(x.source), String(x.n)]));
  b += h2('Jobs won last week') + (m.close.wonWeek ? '<p style="font-size:14px;margin:4px 0">' + m.close.wonWeek + ' won · ' + esc(money(m.close.wonWeekValue)) + '</p>' + rows(['Job', 'Value'], m.close.wonList.map(x => [esc(x.label) + '<div style="font-size:12px;color:' + MUTED + '">' + esc(x.source) + '</div>', esc(x.value ? money(x.value) : '—')])) : rows([], []));
  b += h2('Jobs started') + rows(['Job', 'PM'], m.jobs.started.map(x => [esc(x.name), esc(x.pm || '—')]));
  b += h2('Jobs finished') + rows(['Job', 'PM'], m.jobs.finished.map(x => [esc(x.name), esc(x.pm || '—')]));
  b += h2('Money') + rows(['', 'Last week'], [['Money in', esc(money(m.money.in))], ['Money out', esc(money(m.money.out))], ['<b>Net</b>', '<b>' + esc(money(m.money.net)) + '</b>']]);
  b += h2('Open approvals') + (m.approvals.open ? rows(['Waiting on', 'Items'], m.approvals.byStep.map(x => [esc(x.who), String(x.n)])) : '<p style="color:' + MUTED + ';font-size:14px;margin:4px 0">Nothing waiting.</p>');
  b += h2('Overdue by person (which PMs are behind)') + (m.overdue.length ? rows(['Person', 'To-Dos', 'Jobs', 'Leads'], m.overdue.slice(0, 12).map(x => [esc(x.name) + (x.total >= 3 ? ' <span style="color:#B45309;font-weight:700">· behind</span>' : '') + '<div style="font-size:12px;color:' + MUTED + '">' + x.items.map(esc).join('<br>') + '</div>', String(x.todos), String(x.jobs), String(x.leads)])) : '<p style="color:' + MUTED + ';font-size:14px;margin:4px 0">Nobody has overdue items.</p>');
  b += h2('Emergencies & response times') + (e.count ? '<p style="font-size:14px;margin:4px 0">' + e.count + ' emergenc' + (e.count === 1 ? 'y' : 'ies') + (e.tracked ? ' · answered ' + e.answered + ' of ' + e.tracked + (e.medianMin != null ? ' · median ' + e.medianMin + ' min · slowest ' + e.worstMin + ' min' : '') : '') + (e.unanswered ? ' · <b style="color:#B91C1C">' + e.unanswered + ' never acknowledged</b>' : '') + '</p>' + rows(['Emergency', 'Response'], e.list.map(x => [esc(x.what) + '<div style="font-size:12px;color:' + MUTED + '">' + esc(x.at ? new Date(x.at).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '') + (x.by ? ' · ' + esc(x.by) : '') + '</div>', x.min != null ? x.min + ' min' : '<b style="color:#B91C1C">none</b>'])) : '<p style="color:' + MUTED + ';font-size:14px;margin:4px 0">No emergencies last week.</p>');
  b += h2('Website leads & calls') + rows(['', 'Last week'], [['Website / leads@ leads', String(wb.leads)], ['Calls', wb.callsKnown ? String(wb.calls) : 'no calls recorded'], ['Answered', wb.callsKnown ? String(wb.answered) : '—'], ['Missed', wb.callsKnown ? String(wb.missed) : '—'], ['First-time callers', wb.callsKnown ? String(wb.firstTime) : '—']]);
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GrayCo weekly report</title></head>' +
    '<body style="margin:0;padding:0;background:#F3F4F6"><div style="max-width:640px;margin:0 auto;padding:12px;font-family:Arial,Helvetica,sans-serif;color:' + INK + '">' +
    '<div style="background:' + NAVY + ';color:#fff;border-radius:14px 14px 0 0;padding:18px 18px 14px"><div style="font-size:12px;letter-spacing:.08em;color:' + GOLD + ';font-weight:700">GRAYCO CONSTRUCTION SERVICES</div>' +
    '<div style="font-size:20px;font-weight:700;margin-top:4px">Weekly owner report</div><div style="font-size:14px;opacity:.85;margin-top:2px">' + esc(m.week.label) + '</div></div>' +
    '<div style="background:#F9FAFB;border:1px solid ' + LINE + ';border-top:none;border-radius:0 0 14px 14px;padding:10px 12px 18px">' + b +
    '<p style="text-align:center;margin:24px 0 6px"><a href="' + esc(site) + '/#admin" style="background:' + GOLD + ';color:' + NAVY + ';font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block">Open the CRM</a></p>' +
    '<p style="font-size:11px;color:' + MUTED + ';text-align:center;margin:8px 0 0">Last week = Monday–Sunday, Central time. Close rate = won ÷ (won + lost) for leads from the last 90 days. Sent every Monday at 7 AM to the admins.</p>' +
    '</div></div></body></html>';
}

/* ── reading the CRM (server) ── */
function core(){ return require('../portal.js')._core; }
function L(){ return require('../bid-inbox.js')._lib; }
async function load(){
  const C = core(), d = await C.crmData(true);
  let more = {}; try { more = await C.kvRead(['expenses', 'gcAcctRegister', 'gc_office_tasks', 'gc_approval_queue']); } catch (e) {}
  let inbox = [], calls = [], emerg = [];
  try { inbox = arr(await L().kvGet(L().KV)); } catch (e) {}
  try { calls = arr(await L().kvGet('gc_mkt_calls')); } catch (e) {}
  try { const v = await L().kvGet('gc_emerg_calls'); emerg = arr(v && v.list ? v.list : v); } catch (e) {}
  return { projects: d.projects, leads: d.leads, invs: d.invs, invoices: d.invoices, estimates: d.estimates, projectPayments: d.projectPayments, users: d.users,
    expenses: more.expenses, gcAcctRegister: more.gcAcctRegister, tasks: more.gc_office_tasks, approvals: more.gc_approval_queue, inbox, calls, emerg };
}
function recipients(){
  const own = (s(process.env.OWNER_EMAILS) || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low);
  const more = s(process.env.WEEKLY_REPORT_TO).split(',').map(low);
  return Array.from(new Set(own.concat(more).filter(e => /^[^@\s]+@(in\.)?grayco-cs\.com$/.test(e))));
}
async function send(m, page, D){
  D = D || {};
  const key = s(process.env.RESEND_API_KEY); if (!key) return { ok: false, why: 'RESEND_API_KEY is not set' };
  const to = recipients(); if (!to.length) return { ok: false, why: 'nobody to send to' };
  const subject = '📊 GrayCo weekly report — ' + m.week.label + ' · ' + m.leads.total + ' leads · ' + money(m.money.in) + ' in';
  const f = D.fetch || fetch;
  try {
    const r = await f('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo CRM <office@grayco-cs.com>', to, subject: (() => { try { return require('./mailtag.js').tag(subject, to, 'report'); } catch (e) { return subject; } })(), html: page, headers: { 'X-GrayCo-CRM': 'owner-weekly', 'X-GC-No-Followup': '1' } }) });
    return { ok: r.ok, status: r.status, to };
  } catch (e) { return { ok: false, why: 'Resend unreachable' }; }
}

module.exports = { build, html, load, send, lastWeek, recipients, centralDay, dayOf };
