// netlify/functions/field-auto.js — patch AUTO7: the field and insurance automations that run on a clock
// (netlify.toml: every 15 minutes; each part keeps its own once-a-day / once-ever marks in gc_kv "gc_field_auto").
//
//   • 7 AM DISPATCH (workdays, 7:00 Central): each superintendent (gc_staff profile "super", or a user whose role is
//     Superintendent) gets ONE e-mail (+ a phone push when set up) with today's jobs — address + Google Maps link,
//     the scheduled tasks, the customer's name and phone (never money), materials arriving today (supplier orders and
//     Site Book deliveries) and open punch items. Nobody with nothing scheduled gets mail.
//   • FINAL INSURANCE CLOSEOUT FOLLOW-UPS (9 AM Central): once the depreciation packet / the supplement request has gone
//     out (it went through the claim's approvals — the first send always needs approval), a polite follow-up goes to
//     the adjuster every 7 days until the claim says received / approved / denied (claim.closeout, the CRM). Each
//     follow-up is logged in gc_kv "gc_ins_closeout" (the CRM shows "follow-up 2 sent Oct 30").
//   • MORTGAGE CHECKS (9 AM Central): a check that has sat at one step 5 days or more → the job's PM gets one e-mail
//     listing them (then again every 5 days while it stays put).
//   • WARRANTY TICKETS: a ticket nobody answered in 48 hours → the admins, once.
//   • THE ONE-YEAR NOTE (10 AM Central): a job completed a year ago gets a friendly note from news@ (maintenance tip
//     for its type — editable, gc_kv "gc_anniv_tips" —, review link, "contact your PM about our referral program",
//     unsubscribe). patch AUTOC 4: at 6 AND 12 months, "How's your new roof holding up?" + the maintenance-plan offer —
//     ALWAYS drafted on ✅ Approvals (kind "anniversary"), never sent by itself. Never to an unsubscribed customer.
//   • REVIEW REQUESTS (patch AUTOC 3, _lib/reviewreq.js): 2 days after a job is finished a text + e-mail with the review
//     link, one reminder 5 days later without a click; never disputes / flagged jobs; once per customer per year.
// Netlify does not let anyone call a scheduled function by its URL in production; any other call must be an admin
// ({ run: 'dispatch' | 'closeout' | 'mortgage' | 'tickets' | 'anniversary', force: true }).
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const portal = require('./portal.js');
const FA = require('./_lib/fa-core.js');
const C = portal._core;
const STATE = 'gc_field_auto', FOLLOW = 'gc_ins_closeout', TIPS = 'gc_anniv_tips', TICKETS = 'gc_warranty_tickets';
const TZ = 'America/Chicago';
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return FA.arr(v); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
function central(d){
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const o = {}; parts.forEach(function(p){ o[p.type] = p.value; });
  return { wd: o.weekday, hour: parseInt(o.hour, 10) % 24, ymd: o.year + '-' + o.month + '-' + o.day };
}
function site(){ return (process.env.CRM_URL || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function okEmail(e){ return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(e)); }
function owners(data){ return Array.from(new Set((process.env.OWNER_EMAILS || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(okEmail).concat(C.adminEmails(data || {})))); }

/* the deps a test can swap */
const D = {
  now: function(){ return Date.now(); },
  mail: async function(o){
    const key = s(process.env.RESEND_API_KEY); if (!key) return { ok: false, why: 'RESEND_API_KEY is not set' };
    try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(o) }); return { ok: r.ok, status: r.status }; }
    catch (e) { return { ok: false, why: 'no answer' }; }
  },
  push: function(emails, p){ return C.pushTo(emails, p).catch(function(){ return { sent: 0 }; }); },
  staff: async function(){
    try { const r = await fetch(C.sbUrl() + '/rest/v1/gc_staff?select=email,name,role,profile,active', { headers: C.keyHeaders(C.svcKey()) }); return r.ok ? arr(await r.json()) : []; } catch (e) { return []; }
  },
  news: function(o){ return require('./_lib/news.js').sendNews(o); }
};
function frame(head, body){
  return '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">' + esc(head) + '</div><div style="padding:6px 18px 18px">' + body + '</div></div>';
}
async function stateUpdate(fn){
  return C.kvListUpdate(STATE, function(l){
    const st = l.find(function(x){ return x.id === 'state'; }) || { id: 'state' };
    const before = JSON.stringify(st); const r = fn(st);
    if (r === false || JSON.stringify(st) === before) return null;
    st.updatedAt = new Date().toISOString();
    return { list: l.filter(function(x){ return x.id !== 'state'; }).concat([st]), check: function(a){ return a.some(function(x){ return x.id === 'state' && x.updatedAt === st.updatedAt; }); } };
  });
}
async function stateGet(){ const r = await C.kvListRead(STATE); return (r && r.list.find(function(x){ return x.id === 'state'; })) || { id: 'state' }; }
/* once per key: claims it first (two runs at once never both send) */
async function claimOnce(k){
  let mine = false; const cut = new Date(Date.now() - 90 * 864e5).toISOString();
  const r = await stateUpdate(function(st){ st.done = st.done || {}; if (st.done[k]) return false; Object.keys(st.done).forEach(function(x){ if (s(st.done[x]) < cut) delete st.done[x]; }); st.done[k] = new Date().toISOString(); mine = true; });
  return mine && r.ok;
}
async function unclaim(k){ await stateUpdate(function(st){ if (!st.done || !st.done[k]) return false; delete st.done[k]; }); }

/* ── 7 AM dispatch ── */
async function supers(data){
  const out = {}, add = function(name, email){ name = s(name); email = low(email); if (!name || !okEmail(email)) return; out[email] = { name: name, email: email }; };
  (await D.staff()).forEach(function(r){ if (r && r.active !== false && low(r.profile) === 'super') add(r.name || r.email.split('@')[0], r.email); });
  arr(data.users).forEach(function(u){ if (u && u.active !== false && /superintendent|^super$/i.test(s(u.role))) add(u.name, u.email); });
  return Object.keys(out).map(function(k){ return out[k]; });
}
function dispatchHtml(who, jobs, today){
  const d = new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  return frame('GrayCo — your jobs today, ' + d, '<p>Good morning ' + esc(s(who.name).split(/\s+/)[0]) + ' — ' + jobs.length + ' job' + (jobs.length > 1 ? 's' : '') + ' today.</p>' + jobs.map(function(j){
    return '<div style="border:1px solid #e4e6ee;border-radius:8px;padding:10px 12px;margin:10px 0"><b style="font-size:15px">' + esc(j.job) + '</b>' + (j.po ? ' <span style="color:#777">PO ' + esc(j.po) + '</span>' : '') +
      '<div>' + esc(j.address) + (j.maps ? ' · <a href="' + esc(j.maps) + '">🧭 Directions</a>' : '') + '</div>' +
      '<div style="margin-top:6px"><b>Today:</b><ul style="margin:4px 0">' + j.tasks.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      (j.notes.length ? '<div><b>Notes:</b> ' + j.notes.map(esc).join(' · ') + '</div>' : '') +
      (j.materials.length ? '<div>🚚 <b>Materials arriving:</b> ' + j.materials.map(esc).join(' · ') + '</div>' : '') +
      (j.punch.length ? '<div>📋 <b>Open punch:</b> ' + j.punch.map(esc).join(' · ') + '</div>' : '') +
      '<div style="color:#555;margin-top:4px">Customer: ' + esc(j.customer.name || '—') + (j.customer.phone ? ' · <a href="tel:' + esc(j.customer.phone.replace(/[^0-9+]/g, '')) + '">' + esc(j.customer.phone) + '</a>' : '') + (j.pm ? ' · PM ' + esc(j.pm) : '') + '</div></div>';
  }).join('') + '<p><a href="' + site() + '/#sitebook" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open the Site Book</a></p>');
}
async function runDispatch(o){
  o = o || {}; const now = D.now(), c = central(new Date(now));
  if (!o.force && (/Sat|Sun/.test(c.wd) || c.hour !== 7)) return { notNow: true };
  const data = await C.crmData(true);
  const more = await C.kvRead(['schedule', 'gc_sitebook', 'gc_orders']);
  const sb = {}; arr(more.gc_sitebook).forEach(function(r){ if (r && r.id) sb[s(r.id)] = r; });
  const all = Object.assign({}, data, { schedule: more.schedule });
  const rep = { sent: 0, people: [] };
  for (const who of await supers(data)) {
    const jobs = FA.dispatchFor(who.name, all, c.ymd, { orders: arr(more.gc_orders), sitebook: sb });
    if (!jobs.length) continue;
    const k = 'dispatch|' + who.email + '|' + c.ymd;
    if (!o.force && !(await claimOnce(k))) continue;
    const subject = require('./_lib/mailtag.js').tag('🏗️ Today: ' + jobs.map(function(j){ return j.job; }).join(' · ').slice(0, 150), [who.email], 'area:Schedule');
    const r = await D.mail({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: [who.email], subject: subject, html: dispatchHtml(who, jobs, c.ymd), headers: { 'X-GrayCo-CRM': 'dispatch' } });
    if (!r.ok) { if (!o.force) await unclaim(k); continue; }
    await D.push([who.email], { title: '🏗️ ' + jobs.length + ' job' + (jobs.length > 1 ? 's' : '') + ' today', body: jobs.map(function(j){ return j.job; }).join(' · ').slice(0, 160), tag: 'dispatch-' + c.ymd });
    rep.sent++; rep.people.push({ email: who.email, jobs: jobs.length });
  }
  return rep;
}

/* ── insurance closeout follow-ups + mortgage reminders ── */
function adjusterTo(c){ const L = c.links || {}, d = c.deskAdjuster || {}, a = c.adjuster || {}; return s(d.email) || s(a.email) || s((L.email || {}).to) || s((L.dash || {}).email); }
/* when the packet / the supplement request went out: the claim's outbox (patch BB) says so */
function sentAt(outbox, claimId, test){ return arr(outbox).filter(function(x){ return s(x.claimId) === s(claimId) && x.status === 'sent' && test(x); }).map(function(x){ return s(x.sentAt); }).filter(Boolean).sort()[0] || ''; }
async function followRec(id){ const r = await C.kvListRead(FOLLOW); return (r && r.list.find(function(x){ return s(x.id) === s(id); })) || { id: id, dep: [], supp: [], mtg: {} }; }
async function followPut(id, fn){
  return C.kvListUpdate(FOLLOW, function(l){
    let r = l.find(function(x){ return s(x.id) === s(id); }); if (!r) { r = { id: id, dep: [], supp: [], mtg: {} }; l.push(r); }
    fn(r); r.updatedAt = new Date().toISOString();
    const at = r.updatedAt; return { list: l, check: function(a){ return a.some(function(x){ return s(x.id) === s(id) && x.updatedAt === at; }); } };
  });
}
function followHtml(c, p, kind, n, pmName){
  const m = c.closeout || {}, what = kind === 'dep' ? 'the release of the recoverable depreciation' : 'the supplement request';
  return '<p>Hello,</p><p>Following up on ' + what + ' for claim #' + esc(c.claimNumber || '—') + ' — ' + esc(c.insured || p.client || '') + ', ' + esc(c.address || p.address || '') + '. ' +
    (kind === 'dep' ? 'The work is complete; the certificate of completion and the final invoice were sent with our request.' : 'The supplement request (' + esc(FA.money0((m.supp || {}).requested)) + ') was sent with the supporting items and photos.') +
    '</p><p>Could you let us know the status, or anything else you need from us? Thank you.</p><p>' + esc(pmName || 'GrayCo Construction Services') + '<br>GrayCo Construction Services · 901-585-0944 · TN #85034 BCB · AR #0486990627 · MS #27769</p>' +
    (n > 1 ? '<p style="color:#777;font-size:12px">Follow-up ' + n + '.</p>' : '');
}
async function runCloseout(o){
  o = o || {}; const now = D.now(), c0 = central(new Date(now));
  if (!o.force && c0.hour !== 9) return { notNow: true };
  const data = await C.crmData(true), more = await C.kvRead(['gc_integration_outbox']);
  const outbox = arr(more.gc_integration_outbox), rep = { dep: 0, supp: 0, skipped: [] };
  for (const c of arr(data.gc_claims)) {
    if (!c || c.deleted) continue;
    const p = C.findProject(data, c.projectId) || {}, co = c.closeout || {};
    if (c.importedHistory === true || c.noSend === true || c.historyOnly === true || p.importedHistory === true || p.noSend === true) { rep.skipped.push({ claim: c.id, why: 'history (back-entered) — never followed up' }); continue; }   /* patch LCLEAN */
    const depSent = sentAt(outbox, c.id, function(x){ return x.kind === 'final'; }) || s((co.dep || {}).sentAt);
    const suppSent = sentAt(outbox, c.id, function(x){ return x.kind === 'supplement'; }) || s((co.supp || {}).sentAt);
    const st = FA.closeoutState(Object.assign({}, c, { closeout: Object.assign({}, co, { dep: Object.assign({}, co.dep || {}, { sentAt: depSent }), supp: Object.assign({}, co.supp || {}, { sentAt: suppSent }) }) }), p,
      { now: now, follow: await followRec(c.id) });
    const to = adjusterTo(c), pmU = C.pmOf(data, p);
    for (const kind of ['supp', 'dep']) {
      const f = kind === 'dep' ? st.followDep : st.followSupp;
      if (!f || !f.next || f.next > c0.ymd) continue;
      if (!okEmail(to)) { rep.skipped.push({ claim: c.id, why: 'no adjuster e-mail' }); continue; }
      const k = 'follow|' + kind + '|' + c.id + '|' + f.next;
      if (!(await claimOnce(k))) continue;
      const n = f.count + 1;
      const subject = 'Claim #' + s(c.claimNumber || '—') + ' — ' + (kind === 'dep' ? 'depreciation release' : 'supplement request') + ' follow-up' + (n > 1 ? ' (' + n + ')' : '') + ' — ' + clip(c.address || p.address || c.insured, 80);
      let html = followHtml(c, p, kind, n, pmU && pmU.name);
      try { html = await require('./_lib/brand.js').shellFor(html, { email: pmU && pmU.email, name: pmU && pmU.name }); } catch (e) {}
      const r = await D.mail({ from: require('./_lib/brand.js').billingFrom(), reply_to: C.replyToFor(pmU && pmU.email, 'claim'), to: [to], subject: subject, html: html, headers: { 'X-GrayCo-CRM': 'ins-followup' } });
      if (!r.ok) { await unclaim(k); continue; }
      await followPut(c.id, function(x){ x[kind] = arr(x[kind]).concat([{ at: new Date(now).toISOString(), to: to, n: n }]); });
      rep[kind]++;
    }
  }
  return rep;
}
async function runMortgage(o){
  o = o || {}; const now = D.now(), c0 = central(new Date(now));
  if (!o.force && c0.hour !== 9) return { notNow: true };
  const data = await C.crmData(true), byPm = {}, rep = { sent: 0 };
  for (const c of arr(data.gc_claims)) {
    if (!c || c.deleted) continue;
    const p = C.findProject(data, c.projectId) || {}, f = await followRec(c.id);
    FA.mtgChecks(c, now).forEach(function(k){
      if (!k.stuck) return;
      const last = s((f.mtg || {})[k.id]); if (last && FA.days(last, c0.ymd) < FA.MTG_REMIND_DAYS) return;
      const pmU = C.pmOf(data, p), to = pmU && okEmail(pmU.email) ? pmU.email : owners(data)[0];
      (byPm[to] = byPm[to] || []).push({ c: c, p: p, k: k });
    });
  }
  for (const to of Object.keys(byPm)) {
    const l = byPm[to], key = 'mtg|' + to + '|' + c0.ymd;
    if (!(await claimOnce(key))) continue;
    const subject = require('./_lib/mailtag.js').tag('🏦 Mortgage checks stuck: ' + l.map(function(x){ return s(x.p.name || x.c.insured); }).join(' · ').slice(0, 140), [to], 'area:Insurance');
    const html = frame('GrayCo — insurance checks waiting on the mortgage company', '<p>These checks have not moved for ' + FA.MTG_REMIND_DAYS + ' days or more. Call the mortgage company (loss draft department), then move each one on the claim (🛡 Insurance → the claim → 🏁 Closeout).</p><ul>' +
      l.map(function(x){ return '<li><b>' + esc(x.p.name || x.c.insured) + '</b> — ' + esc(FA.money0(x.k.amount)) + (x.k.checkNo ? ' (check ' + esc(x.k.checkNo) + ')' : '') + ': <b>' + esc(x.k.stageName) + '</b> for ' + x.k.daysStill + ' days' + (x.c.mortgageCo ? ' · ' + esc(x.c.mortgageCo) + (x.c.loanNumber ? ' loan ' + esc(x.c.loanNumber) : '') : '') + '</li>'; }).join('') + '</ul>' +
      '<p><a href="' + site() + '/#insurance" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open Insurance</a></p>');
    const r = await D.mail({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: [to], subject: subject, html: html, headers: { 'X-GrayCo-CRM': 'mortgage' } });
    if (!r.ok) { await unclaim(key); continue; }
    for (const x of l) await followPut(x.c.id, function(f){ f.mtg = f.mtg || {}; f.mtg[x.k.id] = c0.ymd; });
    rep.sent++;
  }
  return rep;
}

/* ── warranty tickets: 48 hours with no answer → the admins, once ── */
async function runTickets(){
  const now = D.now(), t = await C.kvListRead(TICKETS); if (!t) return { sent: 0 };
  const late = t.list.filter(function(x){ return !x.deleted && FA.ticketState(x, now).late; });
  if (!late.length) return { sent: 0 };
  const data = await C.crmData(false), to = owners(data); let sent = 0;
  for (const x of late) {
    const k = 'ticket48|' + x.id; if (!(await claimOnce(k))) continue;
    const p = C.findProject(data, x.pid) || { name: x.job, address: x.address, autoPO: x.po };
    const subject = require('./_lib/mailtag.js').tag(C.withJob('⏰ Warranty ticket not answered in 48 hours' + (x.pm ? ' (PM ' + x.pm + ')' : ''), p), to, 'area:Warranty');
    const html = frame('GrayCo — a customer has waited 48 hours', '<p><b>' + esc(x.job) + '</b>' + (x.address ? ' · ' + esc(x.address) : '') + '</p><p style="white-space:pre-wrap">' + esc(x.text) + '</p><p>Reported ' + esc(new Date(x.createdAt).toLocaleString('en-US', { timeZone: TZ })) + ' through the customer portal. ' + (x.pm ? 'PM: ' + esc(x.pm) + '. ' : 'No PM on the job. ') + (x.inWarranty === false ? 'Out of warranty.' : 'In warranty.') + '</p>' +
      '<p><a href="' + site() + '/#todo" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open To-Do</a></p>');
    const r = await D.mail({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: to, subject: subject, html: html, headers: { 'X-GrayCo-CRM': 'warranty-48h' } });
    if (!r.ok) { await unclaim(k); continue; }
    await D.push(to, { title: '⏰ Warranty ticket waiting 48 h', body: clip(x.job + ' — ' + x.text, 160), tag: 'wt-' + x.id });
    sent++;
  }
  return { sent: sent };
}

/* ── the one-year note → patch AUTOC 4: the 6- and 12-month CHECK-UPS (owner 10/29 "17 yes for approval only") ──
   At 6 and 12 months after completion: "How's your new roof / kitchen holding up?" + the maintenance tip for its type +
   the maintenance-plan offer (patch X9) + review / referral lines. ALWAYS drafted onto ✅ Approvals (kind "anniversary";
   approved → sent from news@ with the unsubscribe footer by portal.js aqSend). NEVER sent by itself — the earlier
   "after the first approval they go by themselves" rule is gone. */
function annivHtml(p, tip, pmU, cust, months, what){
  months = months === 6 ? 6 : 12; what = what || 'project';
  return '<p style="margin:0 0 4px;font-size:12px;font-weight:bold;letter-spacing:.06em;color:#D4A017">' + (months === 6 ? 'SIX MONTHS' : 'ONE YEAR') + ' WITH YOUR GRAYCO PROJECT</p>' +
    '<p>Hi ' + esc(s(cust).split(/\s+/)[0] || 'there') + ',</p>' +
    '<p><b>How\'s your new ' + esc(what) + ' holding up?</b> It has been ' + (months === 6 ? 'six months' : 'a year') + ' since we finished <b>' + esc(p.name) + '</b>' + (p.address ? ' at ' + esc(s(p.address).split(',')[0]) : '') + ' — thank you again for choosing GrayCo. If anything doesn\'t look or work right, just reply to this e-mail and we\'ll take care of it.</p>' +
    '<p><b>A quick maintenance tip:</b> ' + esc(tip) + '</p>' +
    '<p><b>Want us to keep an eye on it for you?</b> Our GrayCo maintenance plan includes a yearly check-up visit, priority scheduling and a photo report of what we found. Reply "maintenance plan" or ask ' + (pmU && pmU.name ? esc(pmU.name) : 'your Project Manager') + ' and we\'ll send the details.</p>' +
    '<p>Happy with the work? A short review helps a small Memphis business more than you know: <a href="' + esc(C.REVIEW_URL) + '">leave a Google review</a>.</p>' +
    '<p>Know someone who needs work done? <b>Contact your PM about our referral program</b>' + (pmU && pmU.name ? ' — ' + esc(pmU.name) + (pmU.phone ? ', ' + esc(pmU.phone) : '') : '') + '.</p>';
}
async function runAnniversary(o){
  o = o || {}; const now = D.now(), c0 = central(new Date(now));
  if (!o.force && c0.hour !== 10) return { notNow: true };
  if (process.env.ANNIV_CHECKUPS_OFF === '1') return { off: true };
  const data = await C.crmData(true), more = await C.kvRead([TIPS]);
  const tips = more[TIPS] && typeof more[TIPS] === 'object' ? more[TIPS] : {};
  const due = FA.annivDue(arr(data.projects).filter(function(p){ return !(p && (p.importedHistory === true || p.noSend === true || p.historyOnly === true)); }), c0.ymd);   /* patch LCLEAN-H: no one-year note for history */
  if (!due.length) return { due: 0 };
  const q = await C.kvListRead(C.AQ_KEY);
  const rep = { due: due.length, queued: 0, sent: 0, skipped: [] };
  for (const d of due) {
    const p = C.findProject(data, d.pid); if (!p) continue;
    /* patch AUTOFIX-ANNIV: the one-year note is a homeowner automation — it follows the job's ⚙ Automations
       "yearlyCheckup" switch (off by default on commercial jobs, off for history jobs), like the other customer e-mails */
    if (C.jaAllows && !C.jaAllows(data, p, 'yearlyCheckup')) { rep.skipped.push({ pid: d.pid, why: 'one-year note is off for this job (⚙ Automations; commercial jobs are off by default)' }); continue; }
    const cust = arr(data.customers).find(function(x){ return low(x.name || x.company) === low(p.client); }) || {};
    const email = low(p.clientEmail || p.customerEmail || cust.email);
    if (!okEmail(email)) { rep.skipped.push({ pid: d.pid, why: 'no customer e-mail' }); continue; }
    const six = d.months === 6;
    const k = 'anniv|' + d.pid + '|' + d.due;
    const qid = (six ? 'appr_anniv6_' : 'appr_anniv_') + s(d.pid).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) + '_' + (six ? d.due : d.due.slice(0, 4));
    if (arr(q && q.list).some(function(x){ return s(x.id) === qid; })) continue;
    if (!(await claimOnce(k))) continue;
    const users = arr(data.users), pmName = s(p.pm), pu = users.find(function(u){ return low(u.name) === low(pmName); }) || {};
    const pmU = pmName ? { name: pmName, email: low(pu.email || p.pmEmail), phone: s(pu.phone || pu.cell || pu.mobile) } : null;
    const claim = C.insClaim(data, p.id), what = FA.checkupWhat(p, claim);
    const html = annivHtml(p, FA.annivTip(p, tips, claim), pmU, p.client || cust.name, d.months, what);
    const subject = 'How\'s your new ' + what + ' holding up? — ' + clip(p.name, 80);
    const ok = await C.queueApproval({ id: qid, kind: 'anniversary', pid: s(p.id), jobName: p.name, pm: pmU && okEmail(pmU.email) ? { name: pmU.name, email: pmU.email } : null, to: email, channel: 'email',
      title: (six ? '🩺 6-month check-up — ' : '🎉 One-year check-up — ') + s(p.name), subject: subject, html: html,
      meta: { due: d.due, months: d.months, note: 'Owner rule (10/29): the 6- and 12-month check-ups are drafted here and only go out when approved — never by themselves. Approved → sent from news@ with the unsubscribe line.' } });
    if (ok) rep.queued++; else await unclaim(k);
  }
  return rep;
}

async function isAdmin(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim()); if (!m) return false;
  try {
    const r = await fetch(C.sbUrl() + '/auth/v1/user', { headers: { apikey: process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON, Authorization: 'Bearer ' + m[1] } }); if (!r.ok) return false;
    const email = low((await r.json()).email); if (!email) return false;
    const q = await fetch(C.sbUrl() + '/rest/v1/gc_staff?select=role,active&email=eq.' + encodeURIComponent(email), { headers: C.keyHeaders(C.svcKey()) });
    const row = q.ok ? ((await q.json()) || [])[0] : null;
    return !!(row && row.active !== false && low(row.role) === 'admin');
  } catch (e) { return false; }
}
/* patch AUTOC 3: the review request 2 days after a job is finished (+ one reminder 5 days later) — _lib/reviewreq.js */
async function runReviews(o){ return require('./_lib/reviewreq.js').run({ force: !!(o && o.force) }); }
const RUNS = { dispatch: runDispatch, closeout: runCloseout, mortgage: runMortgage, tickets: runTickets, anniversary: runAnniversary, reviews: runReviews };
async function runAll(o){
  const out = {};
  for (const k of Object.keys(RUNS)) { if (o.run && o.run !== k) continue; try { out[k] = await RUNS[k](o); } catch (e) { out[k] = { error: s(e && e.message || e) }; } }
  return out;
}
exports.handler = async function(event){
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) {}
  const sched = !!b.next_run;
  if (!sched && !(await isAdmin(event))) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
  if (!C.svcKey()) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  const rep = await runAll(sched ? {} : { run: s(b.run), force: b.force === true });
  try { console.log('[field-auto]', JSON.stringify(rep).slice(0, 600)); } catch (e) {}
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report: rep }) };
};
exports._test = { D: D, central: central, runDispatch: runDispatch, runCloseout: runCloseout, runMortgage: runMortgage, runTickets: runTickets, runAnniversary: runAnniversary, runAll: runAll, supers: supers, dispatchHtml: dispatchHtml, annivHtml: annivHtml, stateGet: stateGet, adjusterTo: adjusterTo };
