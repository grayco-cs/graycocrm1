/* ── GrayCo — LOST-LEAD WIN-BACK (patch AUTO6) ──────────────────────────────────────────────────────────────
   Owner (10/21): "yes 9" — a lead we lost gets a friendly seasonal check-in from news@ at 6 and at 12 months.

   Who: a lead marked Lost (stage / status "Lost", or lost:true) with an e-mail, lost 6 months ago (182–211 days) or
   12 months ago (365–394 days). Never: a do-not-contact / do-not-e-mail lead, a commercial / government bid (a GC
   bid we lost is not a homeowner to check in on), someone who has since become a customer (same e-mail on a job
   or a customer record), anyone unsubscribed from GrayCo News (sendNews skips them), anyone already sent that
   check-in.
   How (owner rule: nothing goes to a customer without approval): each daily run puts ONE item per batch on the
   approvals list — "💌 Win-back check-in: N lost leads (6 months)" — with the e-mail as it will go out
   ({{FIRST_NAME}} is filled in per person). An admin can edit the subject / text, approve or not; approved → each
   person gets their own e-mail from news@ (reply-to replies@) with the unsubscribe footer and List-Unsubscribe
   headers (lib/news.js). Not approved → nobody in that batch gets it, and they are not asked about again.
   State (service-only, gc_lead_inbox_kv "gc_winback_state"): { done: { "<leadId>|6m": { at, how } } }.

   patch MKTFEAT (owner 10/30, "lost-lead win-back"): a lead lost 30–90 days ago gets ONE follow-up draft of its own
   (kind winback, batch "30d", approval id appr_winback30_<leadId>) — e-mail only (texts wait for A2P). The Marketing
   Manager (setting "approves at stage 2") or the office may approve it; it never names the customer in the title, and
   {{FIRST_NAME}} is filled in only when it goes out. Never twice for a lead (the id and "<leadId>|30d" in the state),
   never a lead who opted out (do-not-contact / unsubscribed) or said they are not interested, never while ⏸ data-entry
   mode is on, at most 10 new drafts a day. The 30-day window counts only from a real "lost" date (lostAt / lostDate /
   stageChangedAt / closedAt), never from a save time.
   ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
'use strict';
const KS = 'gc_winback_state';
const WINDOWS = { '6m': [182, 212], '12m': [365, 395] };

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function L(){ return require('../bid-inbox.js')._lib; }

function isLost(l){ return l.lost === true || [l.stage, l.status, l.pipelineStage].some(function(v){ return /^lost\b/i.test(s(v)); }); }
function lostAt(l){ return s(l.lostAt || l.lostDate || l.stageChangedAt || l.closedAt || l.updatedAt || l.savedAt || l.createdAt || l.date); }
function emailOf(l){ return low(l.email || l.contactEmail || l.clientEmail || l.customerEmail || (l.contact && l.contact.email)); }
function nameOf(l){ return s(l.contactName || (l.contact && l.contact.name) || l.client || l.customer || l.name); }
function noContact(l){ return !!(l.doNotContact || l.dnc || l.doNotEmail || l.noEmail || l.unsubscribed || l.optOut || /do\s*not\s*(contact|e-?mail)/i.test(s(l.tags) + ' ' + s(l.notes).slice(0, 400))); }
function isBidLead(l){ return /commercial|government|gov\b/i.test(s(l.leadKind || l.type || l.kind)) || !!(l.inboxId && (l.bidDue || l.estimator || l.dueToCompany)) || !!l.bidStatus; }
function firstName(n){ n = s(n).replace(/^(mr|mrs|ms|dr)\.?\s+/i, ''); const w = n.split(/[\s,&]+/)[0] || ''; return /^[A-Za-z][A-Za-z'-]{1,20}$/.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''; }

/* the leads due a check-in today: [{ leadId, email, name, first, batch, lostAt, title }] */
function due(data, state, t){
  t = t || Date.now(); state = state || { done: {} };
  const customers = {};
  arr(data.customers).forEach(function(c){ if (c.deleted !== true) { const e = low(c.email || c.contactEmail); if (e) customers[e] = 1; } });
  const dead = {}; (Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(function(x){ dead[s(x)] = 1; });
  arr(data.projects).forEach(function(p){ if (p.deleted === true || dead[s(p.id)]) return; if (/^(lost|dead|cancell?ed|bidding|quoted|proposal|estimate)$/i.test(s(p.status))) return; const e = low(p.clientEmail || p.customerEmail || p.email); if (e) customers[e] = 1; });
  const seen = {}, out = [];
  arr(data.leads).forEach(function(l){
    if (!l.id || l.deleted || l._deleted || !isLost(l) || noContact(l) || notInterested(l) || isBidLead(l)) return;   /* patch MKTFEAT: + said not interested */
    const e = emailOf(l); if (!okEmail(e) || customers[e] || seen[e]) return;
    const at = Date.parse(lostAt(l)); if (!isFinite(at)) return;
    const days = (t - at) / 86400000;
    Object.keys(WINDOWS).forEach(function(b){
      const w = WINDOWS[b]; if (days < w[0] || days >= w[1]) return;
      if (state.done && state.done[s(l.id) + '|' + b]) return;
      seen[e] = 1;
      out.push({ leadId: s(l.id), email: e, name: nameOf(l), first: firstName(nameOf(l)), batch: b, lostAt: new Date(at).toISOString(), title: s(l.name || l.title) });
    });
  });
  return out;
}

/* the season in Memphis for a date */
function season(t){
  const m = Number(new Date(t || Date.now()).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'numeric' }));
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'fall' : 'winter';
}
const TIPS = {
  spring: { subj: 'Spring check-in from GrayCo', line: 'Spring storms are rolling through the Mid-South — it’s a good time to have someone look over the roof, gutters and siding before the summer heat.' },
  summer: { subj: 'A summer check-in from GrayCo', line: 'Summer is a great time to get exterior and remodeling projects done while the weather cooperates — and to catch any storm damage from the spring.' },
  fall: { subj: 'A fall check-in from GrayCo', line: 'Before winter sets in is the best time to take care of the roof, windows and anything that lets the weather in.' },
  winter: { subj: 'A quick winter check-in from GrayCo', line: 'Winter is when we plan spring projects — booking early gets you the best spot on the schedule.' }
};
/* the e-mail as it goes out ({{FIRST_NAME}} is filled in per person) */
function message(batch, t){
  const sz = season(t), tip = TIPS[sz];
  const when = batch === '12m' ? 'About a year ago' : 'A few months ago';
  const subject = tip.subj + ' — still thinking about your project?';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.55">'
    + '<p>Hi {{FIRST_NAME}},</p>'
    + '<p>' + when + ' we talked with you about a project at your home. We just wanted to check in and say hello from GrayCo Construction Services.</p>'
    + '<p>' + esc(tip.line) + '</p>'
    + '<p>If that project is still on your list — or something new came up — just reply to this e-mail or call us at <b>(901) 585-0944</b>. We’re happy to take a fresh look, no pressure at all.</p>'
    + '<p>Thank you,<br>The GrayCo team<br>GrayCo Construction Services</p></div>';
  return { subject, html, season: sz };
}
function fill(html, first){ return String(html || '').split('{{FIRST_NAME}}').join(esc(first || 'there')); }

async function stateGet(){ const v = await L().kvGet(KS); return Object.assign({ done: {} }, v && typeof v === 'object' ? v : {}); }
async function mark(keys, how){
  const at = new Date().toISOString();
  return L().kvCas(KS, function(v){ const st = Object.assign({ done: {} }, v && typeof v === 'object' ? v : {}); if (!st.done || typeof st.done !== 'object') st.done = {};
    keys.forEach(function(k){ st.done[k] = { at, how }; }); return st; });
}

/* the daily run: one approval item per batch (core = portal.js _core) */
async function run(core, t){
  t = t || Date.now();
  if (String(process.env.WINBACK_OFF || '') === '1') return { off: true };
  const data = await core.kvRead(['leads', 'customers', 'projects', 'gc_deleted_projects']);
  const st = await stateGet();
  const list = due(data, st, t);
  const out = { due: list.length, queued: [] };
  const day = new Date(t).toISOString().slice(0, 10);
  for (const b of Object.keys(WINDOWS)) {
    const people = list.filter(function(x){ return x.batch === b; });
    if (!people.length) continue;
    const msg = message(b, t), id = 'appr_winback_' + b + '_' + day;
    const label = b === '12m' ? '12 months' : '6 months';
    const ok = await core.queueApproval({ id, kind: 'winback', title: '💌 Win-back check-in: ' + people.length + ' lost lead' + (people.length === 1 ? '' : 's') + ' (' + label + ', from news@)',
      pid: '', jobName: '', pm: null, to: people[0].email, channel: 'email', subject: msg.subject, html: msg.html,
      meta: { batch: b, season: msg.season, recipients: people.map(function(x){ return { leadId: x.leadId, email: x.email, first: x.first, name: x.name }; }),
        note: 'Goes to ' + people.length + ' people, one e-mail each, from news@ with the unsubscribe link. {{FIRST_NAME}} becomes each person’s first name. Not approved = nobody in this batch gets it.' } });
    if (ok) { await mark(people.map(function(x){ return x.leadId + '|' + b; }), 'queued ' + id); out.queued.push({ id, n: people.length }); }
  }
  try { out.followUp30 = await run30(core, data, t); } catch (e) { out.followUp30 = { error: String(e && e.message || e).slice(0, 160) }; }   /* patch MKTFEAT */
  return out;
}

/* approved → one e-mail each (portal.js aqSend hands it here) */
async function onApproved(item){
  const N = require('./news.js');
  const people = arr(item && item.meta && item.meta.recipients);
  if (!people.length) return { ok: false, error: 'Nobody in this batch.' };
  const st = await stateGet();
  let sent = 0, skipped = 0, failed = 0; const doneKeys = [];
  for (const x of people) {
    const k = x.leadId + '|' + s(item.meta.batch) + '|sent';
    if (st.done[k]) { skipped++; continue; }
    const r = await N.sendNews({ to: x.email, subject: s(item.subject).split('{{FIRST_NAME}}').join(x.first || 'there'), html: fill(item.html, x.first) });
    if (r.ok) { if (r.skipped) skipped++; else sent++; doneKeys.push(k); } else failed++;
  }
  if (doneKeys.length) await mark(doneKeys, 'sent').catch(function(){});
  if (failed) return { ok: false, error: sent + ' sent, ' + failed + ' did not go out — approve it again to retry the rest (nobody gets it twice).' };
  return { ok: true, sent, skipped, failed };
}

/* ── patch MKTFEAT: the 30–90 day follow-up, one draft per lead ── */
const W30 = [30, 91], MAX30 = 10;
function lostAtStrict(l){ return s(l.lostAt || l.lostDate || l.stageChangedAt || l.closedAt); }
function notInterested(l){
  const t = [l.lostReason, l.lossReason, l.lostNote, l.reason, Array.isArray(l.tags) ? l.tags.join(' ') : l.tags, s(l.notes).slice(0, 600)].map(s).join(' ');
  return /not\s+interested|no\s+longer\s+interested|\bno\s+interest\b|do\s*n[o']?t\s+(call|contact|e-?mail|text|reach)|stop\s+(calling|contacting|e-?mailing|texting)|remove\s+me|unsubscrib|opt(ed)?[\s-]*out|leave\s+(me|us)\s+alone/i.test(t);
}
function serviceWords(l){
  const t = low([l.type, l.jobType, l.projectType, l.service, l.title].map(s).join(' '));
  return /water|flood|leak|mitigat|mold/.test(t) ? 'water damage' : /fire|smoke/.test(t) ? 'fire damage' : /storm|hail|wind/.test(t) ? 'storm damage' : /roof|shingle/.test(t) ? 'roofing' : /remodel|kitchen|bath|renovat/.test(t) ? 'remodel' : 'home';
}
function cityWord(l){ const c = s(l.city) || s(s(l.address).split(',')[1]).replace(/\b(TN|MS|AR)\b.*$/i, '').trim(); return c && !/\d/.test(c) && c.length < 40 ? c : 'the Memphis area'; }
function due30(data, state, t){
  t = t || Date.now(); state = state || { done: {} };
  const customers = {};
  arr(data.customers).forEach(function(c){ if (c.deleted !== true) { const e = low(c.email || c.contactEmail); if (e) customers[e] = 1; } });
  const dead = {}; (Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(function(x){ dead[s(x)] = 1; });
  arr(data.projects).forEach(function(p){ if (p.deleted === true || dead[s(p.id)]) return; if (/^(lost|dead|cancell?ed|bidding|quoted|proposal|estimate)$/i.test(s(p.status))) return; const e = low(p.clientEmail || p.customerEmail || p.email); if (e) customers[e] = 1; });
  const seen = {}, out = [];
  arr(data.leads).forEach(function(l){
    if (!l.id || l.deleted || l._deleted || !isLost(l) || noContact(l) || notInterested(l) || isBidLead(l)) return;
    const d = state.done || {}; if (d[s(l.id) + '|30d'] || d[s(l.id) + '|30d|sent']) return;
    const e = emailOf(l); if (!okEmail(e) || customers[e] || seen[e]) return;
    const at = Date.parse(lostAtStrict(l)); if (!isFinite(at)) return;
    const days = (t - at) / 86400000; if (days < W30[0] || days >= W30[1]) return;
    seen[e] = 1;
    out.push({ leadId: s(l.id), email: e, name: nameOf(l), first: firstName(nameOf(l)), batch: '30d', days: Math.floor(days), service: serviceWords(l), city: cityWord(l) });
  });
  return out.sort(function(a, b){ return a.days - b.days; });
}
function message30(){
  const subject = 'Still thinking about your project? — GrayCo';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.55">'
    + '<p>Hi {{FIRST_NAME}},</p>'
    + '<p>A few weeks ago we talked with you about a project at your home, and we wanted to follow up once in case anything has changed.</p>'
    + '<p>If the timing or the budget was not right then, we are happy to take a fresh look — a different scope, a phased plan, or simply a second opinion. No pressure at all.</p>'
    + '<p>Just reply to this e-mail or call us at <b>(901) 585-0944</b>.</p>'
    + '<p>Thank you,<br>The GrayCo team<br>GrayCo Construction Services</p></div>';
  return { subject, html };
}
async function run30(core, data, t){
  if (String(process.env.WINBACK30_OFF || '') === '1') return { off: true };
  let paused = true; try { paused = await require('./pause.js').isPaused(); } catch (e) { paused = true; }
  if (paused) return { dataEntryMode: true };
  const st = await stateGet(), list = due30(data, st, t), out = { due: list.length, queued: [] };
  let mmOk = false; try { mmOk = (await require('./mm.js').settings()).approvesStage2 === true; } catch (e) {}
  const msg = message30();
  for (const x of list.slice(0, MAX30)) {
    const id = 'appr_winback30_' + x.leadId;
    const ok = await core.queueApproval({ id, kind: 'winback', title: '💌 Win-back follow-up: a lost ' + x.service + ' lead in ' + x.city + ' (lost ' + x.days + ' days ago, from news@)',
      pid: '', jobName: '', pm: null, to: x.email, channel: 'email', subject: msg.subject, html: msg.html, officeOk: true, mmOk: mmOk,
      meta: { batch: '30d', days: x.days, service: x.service, city: x.city, recipients: [{ leadId: x.leadId, email: x.email, first: x.first, name: x.name }],
        note: 'One follow-up e-mail to this lead, from news@ with the unsubscribe link. {{FIRST_NAME}} becomes their first name. E-mail only (texts wait for A2P). Not approved = they never get it, and they are not asked about again.' } });
    if (ok) { await mark([x.leadId + '|30d'], 'queued ' + id); out.queued.push(id); }
  }
  return out;
}

module.exports = { KS, WINDOWS, due, message, season, fill, firstName, run, onApproved, isLost, lostAt, due30, message30, run30, notInterested, W30 };
