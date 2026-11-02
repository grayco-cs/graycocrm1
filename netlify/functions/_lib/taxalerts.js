/* netlify/functions/_lib/taxalerts.js — patch TAXALERTS: the tax-deadline alerts, run by auto-wins.js (part 'tax': every day,
   the first hourly run at / after 8 AM Central — 8:19). The rules (due dates, weekend / holiday shift, stages) are in
   _lib/taxcal.js, the same file the CRM page uses.

   For every switched-on item with an unpaid due date:
     7 days before (or the item's own lead)  → "🧾 Due in 7 days: Form 941 Q4 — Jan 31"     once
     the due day                             → "🧾 Due today: …"                             once
     every day after                         → "🧾 OVERDUE 3 days: … — was due Jan 31"       once a day, until ✓ Paid
   To: the item's people — company items: the admins and the office (or admins / office only); an owner's quarterly
   estimated tax: that owner (or both admins) — NEVER the office. Each person gets ONE e-mail (staff only, @grayco-cs.com)
   and ONE phone push listing their alerts, and a text only when they turned on "Approvals waiting for me" texts (quiet
   hours and business hours apply, so never at night; data-entry mode skips texts). The CRM's To-Do shows the same lines
   (computed on each admin / office computer, with ✓ Paid). Exactly once: a marker per item / due date / stage (per day
   when overdue) is claimed in gc_autowins_log before anything is sent; an owner item's marker is a hash (no names there).
   Company list: gc_kv gc_tax_calendar + gc_tax_paid. Owner list: gc_admin_kv gc_tax_owner (admins only). On the first run
   each list gets its start day (no alerts for dates before it). Nothing is sent to a customer, sub or GC. */
'use strict';
const crypto = require('crypto');
const A = require('./auto-common.js');
const T = require('./taxcal.js');
const { s, low, arr, esc, clip, staffEmail } = A;

function sbUrl(){ return (s(process.env.SUPABASE_URL) || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function svc(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function hdr(extra){ const k = svc(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
function parse(v){ if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } } return v; }
/* a single gc_kv / gc_admin_kv value (service key) */
async function rowGet(table, key){
  const r = await fetch(sbUrl() + '/rest/v1/' + table + '?select=value&key=eq.' + encodeURIComponent(key), { headers: hdr() });
  if (!r || !r.ok) throw new Error(table + ' read ' + (r && r.status));
  const rows = await r.json(); return rows && rows[0] ? parse(rows[0].value) : null;
}
async function rowPut(table, key, value){
  const r = await fetch(sbUrl() + '/rest/v1/' + table + '?on_conflict=key', { method: 'POST', headers: hdr({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: key, value: table === 'gc_kv' ? JSON.stringify(value) : value, updated_at: new Date().toISOString() }) });
  return !!(r && r.ok);
}
function hash(v){ return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 16); }
function marker(a, today){ const k = a.occ.key + '|' + a.stage + (a.stage === 'over' ? '|' + today : ''); return 'tax:' + (a.item.personal ? hash('own|' + k) : k); }

/* both lists, merged with the defaults; a list's first run stamps its start day */
async function load(today, C){
  const kv = await C.kvRead(['gc_tax_calendar', 'gc_tax_paid', 'payrollRuns']);
  const company = T.merge(kv.gc_tax_calendar, 'company');
  company.paid = arr(kv.gc_tax_paid);
  if (!company.startedAt) { company.startedAt = today; const sv = Object.assign({}, parse(kv.gc_tax_calendar) || {}, { startedAt: today, v: 1 }); try { await rowPut('gc_kv', 'gc_tax_calendar', sv); } catch (e) {} }
  let ownRaw = null, ownOk = true;
  try { ownRaw = await rowGet('gc_admin_kv', 'gc_tax_owner'); } catch (e) { ownOk = false; }
  const owner = T.merge(ownRaw, 'owner');
  if (ownOk && !owner.startedAt) { owner.startedAt = today; const sv = Object.assign({}, ownRaw || {}, { startedAt: today, v: 1 }); try { await rowPut('gc_admin_kv', 'gc_tax_owner', sv); } catch (e) {} }
  return { company, owner: ownOk ? owner : null, runs: arr(kv.payrollRuns) };
}

function line(a, base){
  const amt = a.amount != null ? '<br><span style="color:#55626F">' + (a.item.personal ? 'Amount: ' : 'Estimated from Payroll: ') + esc(T.money(a.amount)) + '</span>' : (a.item.pay ? '<br><span style="color:#55626F">Amount: enter it when you mark it paid</span>' : '');
  return '<li style="margin:8px 0"><b style="color:' + (a.stage === 'over' ? '#B42318' : '#0F1D2F') + '">' + esc(a.title.replace(/^🧾\s*/, '')) + '</b>' +
    '<br><span style="color:#55626F">' + esc(a.item.name) + ' · due ' + esc(T.longDate(a.occ.due)) + (a.occ.due !== a.occ.nominal ? ' (moved from ' + esc(T.short(a.occ.nominal)) + ' — weekend / holiday)' : '') + '</span>' + amt +
    (a.item.link ? '<br><a href="' + esc(a.item.link) + '" style="color:#0F1D2F">Pay / file: ' + esc(a.item.link.replace(/^https:\/\//, '').replace(/\/$/, '')) + '</a>' : '') + '</li>';
}

async function run(opts){
  opts = opts || {};
  const C = opts.core || A.core(), now = opts.now != null ? opts.now : Date.now(), c = A.central(now), today = c.ymd;
  if (String(process.env.TAXALERTS_OFF || '') === '1') return { ok: true, off: true };
  const L = await load(today, C);
  const data = await C.crmData(true);
  const people = { admins: C.adminEmails(data).filter(staffEmail), office: C.officeEmails(data).filter(staffEmail) };
  const list = T.alertsFor(L.company, today, L.company.paid).concat(L.owner ? T.alertsFor(L.owner, today, L.owner.paid) : []);
  const rep = { ok: true, today, alerts: list.length, sent: 0, mailed: 0, pushed: 0, texted: 0, skipped: 0, to: {} };
  const box = {};
  for (const a of list) {
    const to = T.recipients(a.item, people).filter(staffEmail);
    if (!to.length) { rep.skipped++; continue; }
    if (!(await (opts.once || A.once)(marker(a, today)))) { rep.skipped++; continue; }   /* this stage of this due date was sent already */
    a.amount = T.estimate(a.item, a.occ, L.runs);
    rep.sent++;
    to.forEach(function(e){ (box[e] = box[e] || []).push(a); });
  }
  const base = A.crmBase(), nameOf = {};
  arr(data.users).forEach(function(u){ if (u && staffEmail(u.email)) nameOf[low(u.email)] = s(u.name); });
  for (const email of Object.keys(box)) {
    const l = box[email]; rep.to[email] = l.map(function(a){ return a.title; });
    const over = l.filter(function(a){ return a.stage === 'over'; }).length;
    const subject = l.length === 1 ? l[0].title : '🧾 ' + l.length + ' tax deadlines' + (over ? ' (' + over + ' overdue)' : '') + ' — GrayCo CRM';
    const html = A.shell('🧾 Taxes to pay' + (nameOf[email] ? ' — ' + nameOf[email].split(' ')[0] : ''),
      '<ul style="padding-left:18px">' + l.map(function(a){ return line(a, base); }).join('') + '</ul>' +
      '<p>When it is paid, open the CRM and tap <b>✓ Paid</b> on the To-Do (or the 🧾 Taxes card) — date, amount, confirmation # and the receipt. ' + (over ? 'An overdue one is sent again every morning until then.' : '') + '</p>' +
      '<p><a href="' + esc(base + '/#taxes') + '" style="color:#0F1D2F;font-weight:bold">Open the tax calendar</a></p>' +
      '<p style="font-size:12px;color:#55626F">' + esc(T.CPA_NOTE) + '</p>');
    const m = await A.staffMail(email, subject, html); if (m && m.ok) rep.mailed++;
    try { const p = await C.pushTo([email], { title: clip(subject.replace(' — GrayCo CRM', ''), 110), body: l.slice(0, 3).map(function(a){ return clip(a.title.replace(/^🧾\s*/, ''), 70); }).join(' · '), tag: 'gc-tax' }); rep.pushed += (p && p.sent) || 0; } catch (e) {}
    try {   /* a text only for people with "Approvals waiting for me" texts on — quiet / business hours apply (never at night); data-entry mode: none */
      const t = await require('./smsalert.js').notify({ type: 'approvals', text: l.length === 1 ? l[0].title.replace(/^🧾\s*/, '') : l.length + ' tax deadlines need you' + (over ? ' (' + over + ' overdue)' : '') + '.', link: base + '/#taxes', thread: 'tax', mine: [email], daily: true });
      rep.texted += (t && t.sent) || 0;
    } catch (e) {}
  }
  return rep;
}
module.exports = { run, load, marker };
