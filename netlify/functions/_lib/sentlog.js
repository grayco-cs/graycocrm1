/* netlify/functions/_lib/sentlog.js — patch SENTLOG: "📤 Sent by the CRM" and "📬 Waiting on a reply".
   Owner (10/24): "I want to be able to see my auto and resend e-mails — I sent one to Alec about a COI, I like that — I
   would like office and admin to see those e-mails so they can follow up on them if someone ignores, say, an insurance
   request".

   Built on the MAILALL index (_lib/mailidx.js — every e-mail / text the CRM sends is logged by the pause guard):
   • each CRM e-mail gets a TYPE (COI request, W-9 request, insurance document request, customer document request, lien
     waiver request, signature request, bid results request, invoice, reminder, portal link, bid, estimate, schedule,
     warranty, news, internal, text, other) and its rendered BODY is kept (we wrote it) — server-side store only;
   • an e-mail that ASKS FOR SOMETHING (the tracked types) is "⏳ Waiting on reply" until
       – a reply arrives (in.grayco-cs.com via bid-inbox.js, or a GrayCo mailbox via mail-all-sync), or
       – the thing shows up in the CRM (the sub's COI / W-9 uploaded in the sub portal, a newer COI date on the sub,
         the customer answered every "We need from you" item), or
       – someone marks it resolved;
   • no answer after N work days (default 3, per type) → "📬 No reply — follow up" on the shared Office To-Do; the
     office can resend a reminder (the same rules as the original: customer / insurance mail waits on ✅ Approvals),
     call, or mark it resolved; after 2 reminders with no answer it escalates to the admins (🟠 Soon, 🔴 ASAP for
     insurance).
   Never: a follow-up for a paused (⏸ Data-entry mode), failed or record-only e-mail; anything shown to a customer.
   Store (service key only — gc_lead_inbox_kv, gc_kv until lead-inbox.sql has run; email-all.sql makes gc_mail_* admin-only):
     gc_mail_followups                 [{ id, type, … status: waiting|answered|resolved, n, due, esc, hist[] }] newest 3000
     gc_mail_followup_settings         { track: { type: bool }, days: { type: n } }
     gc_mail_body__crm__<YYYY-MM-DD>   { <row id>: { html, text, from, replyTo, to, cc, subject } } newest 800 a day */
'use strict';
const X = require('./mailidx.js');

const FU_KEY = 'gc_mail_followups', SET_KEY = 'gc_mail_followup_settings', BODY_PREFIX = 'gc_mail_body__crm__';
const MAX_FU = 3000, MAX_BODY_DAY = 800, HTML_MAX = 80000, TEXT_MAX = 20000;
const TYPES = {
  coi_request:           { label: 'COI request', track: true, days: 3, appr: false },
  w9_request:            { label: 'W-9 request', track: true, days: 3, appr: false },
  insurance_doc_request: { label: 'Insurance request', track: true, days: 2, appr: true, asap: true },
  customer_doc_request:  { label: 'Customer document request', track: true, days: 3, appr: true },
  lien_waiver_request:   { label: 'Lien waiver request', track: true, days: 3, appr: false },
  signature_request:     { label: 'Signature request', track: true, days: 3, appr: true },
  bid_results_request:   { label: 'Bid results request', track: true, days: 5, appr: false },
  invoice:     { label: 'Invoice / billing' },
  reminder:    { label: 'Reminder' },
  portal_link: { label: 'Portal link' },
  bid:         { label: 'Bid' },
  proposal:    { label: 'Estimate / proposal' },
  schedule:    { label: 'Schedule / dispatch' },
  warranty:    { label: 'Warranty' },
  news:        { label: 'News / marketing' },
  followup:    { label: 'Follow-up reminder' },
  internal:    { label: 'Internal (staff)' },
  text:        { label: 'Text message' },
  other:       { label: 'Other' }
};
/* the X-GrayCo-CRM header the CRM's own senders put on their mail → its type */
const VIA = {
  'coi-request': 'coi_request', 'customer-needs': 'customer_doc_request', 'customer-needs-reminder': 'customer_doc_request',
  'ins-followup': 'insurance_doc_request', 'mortgage': 'insurance_doc_request', 'claims': 'insurance_doc_request',
  'bid-results': 'bid_results_request', 'bid-send': 'bid', 'maint-invoice': 'invoice', 'warranty-ticket': 'warranty', 'warranty-48h': 'warranty',
  'referral': 'news', 'followup': 'followup', 'dispatch': 'internal', 'daily-plan': 'internal', 'lead-alert': 'internal', 'crm-health': 'internal',
  'oncall-page': 'internal', 'sms-relay': 'internal', 'bid-reply-alert': 'internal', 'est-price-watch': 'internal'
};
/* a reminder the sender already repeats by itself (care11): followed up later, not on top of it */
const VIA_DAYS = { 'customer-needs': 8, 'coi-request': 5 };

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
let NOW = null;
function now(){ return NOW ? NOW() : Date.now(); }
function nowIso(){ return new Date(now()).toISOString(); }
function staff(e){ return /@(in\.)?grayco-cs\.com$/i.test(s(e)); }
function stripHtml(h){ return s(h).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim(); }
function hdrOf(m, k){ const h = (m && m.headers) || {}; const key = Object.keys(h).find(x => x.toLowerCase() === k.toLowerCase()); return key ? s(h[key]) : ''; }

/* ── the type of one sent e-mail ── */
function classify(row, m){
  row = row || {}; m = m || {};
  if (row.src === 'sms') return 'text';
  const via = low(row.via || hdrOf(m, 'X-GrayCo-CRM'));
  if (VIA[via]) return VIA[via];
  const kind = low(row.kind);
  if (VIA[kind]) return VIA[kind];
  if (TYPES[kind]) return kind;
  const ext = arr(row.to).concat(arr(row.cc)).filter(e => !staff(e));
  if (!ext.length && arr(row.to).length) return 'internal';
  const t = (s(row.subject) + ' \n ' + (s(m.text) || stripHtml(m.html) || s(row.snippet)).slice(0, 3000));
  const ask = /\b(please|kindly|need|needed|send|provide|upload|forward|request(ed)?|missing|required|reply|get us|at your earliest)\b/i.test(t);
  if (/certificate of (liability )?insurance|\bCOI\b|proof of insurance|insurance certificate|\bACORD\b/i.test(t) && ask) return 'coi_request';
  if (/\bW-?9\b/.test(t) && ask) return 'w9_request';
  if (/lien (waiver|release)/i.test(t) && ask) return 'lien_waiver_request';
  if (/bid results|results (of|for) (the|our|your) bid|(who|which contractor) (was|got) (awarded|the job)|award(ed)? (status|decision)/i.test(t)) return 'bid_results_request';
  if (/(please|ready to|needs? (your|to))\s+(e-?)?sign|signature (request|needed|required)|sign (the|your|our) (contract|estimate|proposal|change order|work authori[sz]ation|agreement)|\be-?sign/i.test(t)) return 'signature_request';
  if (/\b(adjuster|claim (number|#|no\.?)|policy (number|#)|declarations? page|depreciation|supplement|mortgage (company|check)|endorse|carrier|xactimate|proof of loss)\b/i.test(t) && ask) return 'insurance_doc_request';
  if (/we need from you|documents? (needed|requested)|please (send|upload|provide)|could you (send|provide)/i.test(t)) return 'customer_doc_request';
  if (/\bfollowing up\b/i.test(s(row.subject))) return 'followup';
  if (/\binvoice|payment|balance due|amount due|receipt\b/i.test(t)) return 'invoice';
  if (/\breminder\b/i.test(t)) return 'reminder';
  if (/\bportal\b/i.test(t)) return 'portal_link';
  if (/\b(estimate|proposal|quote)\b/i.test(t)) return 'proposal';
  if (/\bschedul(e|ed)\b/i.test(t)) return 'schedule';
  if (/\bwarranty\b/i.test(t)) return 'warranty';
  return 'other';
}

/* ── settings (admins) ── */
async function settings(){
  const v = obj(await X.get(SET_KEY));
  const track = {}, days = {};
  Object.keys(TYPES).filter(k => TYPES[k].track).forEach(k => {
    track[k] = obj(v.track)[k] === false ? false : true;
    const d = parseInt(obj(v.days)[k], 10); days[k] = d >= 1 && d <= 30 ? d : TYPES[k].days;
  });
  return { track, days };
}
async function saveSettings(b, who){
  const cur = await settings(), track = {}, days = {};
  Object.keys(cur.track).forEach(k => {
    track[k] = b && b.track && typeof b.track[k] === 'boolean' ? b.track[k] : cur.track[k];
    const d = parseInt(b && b.days && b.days[k], 10); days[k] = d >= 1 && d <= 30 ? d : cur.days[k];
  });
  const v = { track, days, by: low(who), at: nowIso() };
  await X.cas(SET_KEY, () => v);
  return v;
}

/* ── work days (Central time; Saturday and Sunday are skipped) ── */
function addWorkDays(iso, n){
  let t = Date.parse(iso) || now(); let left = Math.max(0, n | 0);
  while (left > 0) {
    t += 864e5;
    const wd = new Date(t - 6 * 3600e3).getUTCDay();   /* Central (close enough for whole days) */
    if (wd !== 0 && wd !== 6) left--;
  }
  return new Date(t).toISOString();
}

/* ── bodies ── */
function bodyKey(iso){ return BODY_PREFIX + s(iso || nowIso()).slice(0, 10); }
async function storeBodies(entries){
  entries = entries.filter(e => e && e.id);
  if (!entries.length) return;
  const byDay = {};
  entries.forEach(e => { const k = bodyKey(e.at); (byDay[k] = byDay[k] || []).push(e); });
  for (const k of Object.keys(byDay)) {
    await X.cas(k, v => {
      const m = obj(v);
      byDay[k].forEach(e => { m[e.id] = { html: s(e.html).slice(0, HTML_MAX), text: s(e.text).slice(0, TEXT_MAX), from: s(e.from).slice(0, 200), replyTo: s(e.replyTo).slice(0, 200), to: arr(e.to).slice(0, 20), cc: arr(e.cc).slice(0, 20), subject: s(e.subject).slice(0, 250), at: e.at }; });
      const ids = Object.keys(m);
      if (ids.length > MAX_BODY_DAY) ids.sort((a, b) => s(m[a].at).localeCompare(s(m[b].at))).slice(0, ids.length - MAX_BODY_DAY).forEach(i => { delete m[i]; });
      return m;
    });
  }
}
async function bodyOf(id, at){
  const m = obj(await X.get(bodyKey(at)));
  return m[id] || null;
}

/* ── the follow-up list ── */
async function followups(){ return arr(await X.get(FU_KEY)); }
function trimFu(l){
  const cut = new Date(now() - 120 * 864e5).toISOString();
  return l.filter(f => f && f.id && (f.status === 'waiting' || s(f.doneAt || f.at) >= cut)).sort((a, b) => s(b.at).localeCompare(s(a.at))).slice(0, MAX_FU);
}
async function fuUpdate(fn){
  let out;
  await X.cas(FU_KEY, v => { const l = arr(v); const r = fn(l); if (r === undefined) return undefined; out = r; return trimFu(r); });
  return out;
}

/* called by the pause guard for every CRM send: classify, keep the body, start the follow-up */
function decorate(rows, payloads){
  rows.forEach((r, i) => { const m = (payloads && payloads[i]) || {}; r.via = low(hdrOf(m, 'X-GrayCo-CRM')).slice(0, 40); r.type = classify(r, m); });
  return rows;
}
async function onSent(rows, payloads){
  rows = arr(rows); payloads = arr(payloads);
  const bodies = [], starts = [], parents = [];
  rows.forEach((r, i) => {
    if (!r || r.src === 'sms') return;
    const m = payloads[i] || {};
    bodies.push({ id: r.id, at: r.at, html: m.html, text: s(m.text) || stripHtml(m.html), from: m.from, replyTo: m.reply_to || m.replyTo, to: r.to, cc: r.cc, subject: m.subject || r.subject });
    const parent = hdrOf(m, 'X-GC-Followup-Of');
    if (parent) { parents.push({ parent, row: r }); return; }
    if (r.status !== 'sent' || !TYPES[r.type] || !TYPES[r.type].track) return;
    if (/reminder$/.test(s(r.via)) || hdrOf(m, 'X-GC-No-Followup') || hdrOf(m, 'X-GC-History')) return;
    const ext = arr(r.to).filter(e => !staff(e));
    if (!ext.length) return;
    starts.push({ r, m, ext });
  });
  try { if (bodies.length) await storeBodies(bodies); } catch (e) {}
  if (!starts.length && !parents.length) return { ok: true, started: 0 };
  let set = null; try { set = await settings(); } catch (e) { set = { track: {}, days: {} }; }
  const at = nowIso();
  await fuUpdate(l => {
    let changed = false;
    starts.forEach(({ r, m, ext }) => {
      if (set.track[r.type] === false) return;
      if (l.some(f => f.id === r.id)) return;
      const days = VIA_DAYS[r.via] && VIA_DAYS[r.via] > (set.days[r.type] || 0) ? VIA_DAYS[r.via] : (set.days[r.type] || TYPES[r.type].days);
      l.unshift({ id: r.id, type: r.type, label: TYPES[r.type].label, to: ext, cc: arr(r.cc), subject: s(r.subject), from: s(r.from), fromName: s(r.fromName), via: s(r.via),
        replyTo: s(m.reply_to || m.replyTo), pid: s(r.pid), at: r.at || at, due: addWorkDays(r.at || at, days), days, status: 'waiting', n: 0, esc: '', hist: [{ at: r.at || at, what: 'sent' }] });
      changed = true;
    });
    parents.forEach(({ parent, row }) => {
      const f = l.find(x => x.id === parent); if (!f) return;
      f.hist = arr(f.hist).concat([{ at, what: row.status === 'sent' ? 'reminder sent' : 'reminder ' + row.status, id: row.id }]).slice(-20);
      changed = true;
    });
    return changed ? l : undefined;
  });
  return { ok: true, started: starts.length };
}

/* ── answers ── */
function normSubj(v){ return low(v).replace(/^\s*((re|fw|fwd|aw)\s*:\s*|\[[^\]]*\]\s*|following up:\s*)+/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
const AUTO_REPLY = /out of (the )?office|automatic reply|auto-?reply|autoreply|vacation|undeliverable|delivery status|mail delivery (failed|subsystem)|returned mail/i;
async function onInbound(msgs){
  msgs = arr(msgs).map(x => ({ from: X.emails(x && x.from)[0] || '', subject: s(x && x.subject), at: s(x && x.at) || nowIso(), snippet: s(x && (x.snippet || x.text)).slice(0, 200) }))
    .filter(x => x.from && !staff(x.from) && !AUTO_REPLY.test(x.subject));
  if (!msgs.length) return { ok: true, answered: 0 };
  let cur = []; try { cur = await followups(); } catch (e) { return { ok: false }; }
  const waiting = cur.filter(f => f.status === 'waiting');
  if (!waiting.length) return { ok: true, answered: 0 };
  const hits = {};
  msgs.forEach(m => {
    const cands = waiting.filter(f => arr(f.to).indexOf(m.from) >= 0 && s(m.at) > s(f.at));
    if (!cands.length) return;
    const ns = normSubj(m.subject);
    let pick = cands.filter(f => { const fs = normSubj(f.subject); return ns && fs && (ns.indexOf(fs) >= 0 || fs.indexOf(ns) >= 0); });
    if (!pick.length) pick = [cands.sort((a, b) => s(b.at).localeCompare(s(a.at)))[0]];
    pick.forEach(f => { hits[f.id] = m; });
  });
  const ids = Object.keys(hits);
  if (!ids.length) return { ok: true, answered: 0 };
  await fuUpdate(l => {
    let n = 0;
    l.forEach(f => { const m = hits[f.id]; if (!m || f.status !== 'waiting') return;
      f.status = 'answered'; f.doneAt = nowIso(); f.how = 'reply'; f.answer = { from: m.from, subject: m.subject.slice(0, 200), at: m.at, snippet: m.snippet };
      f.hist = arr(f.hist).concat([{ at: f.doneAt, what: 'reply from ' + m.from }]).slice(-20); n++; });
    return n ? l : undefined;
  });
  await todoDone(ids);
  return { ok: true, answered: ids.length };
}
/* a Resend inbound event (bid-inbox.js) → its sender and subject */
async function onInboundEvent(evt){
  try {
    const d = (evt && (evt.data || evt)) || {};
    if (evt && evt.type && evt.type !== 'email.received') return { ok: true, ignored: true };
    return await onInbound([{ from: d.from && typeof d.from === 'object' ? d.from.email || d.from.address : d.from, subject: d.subject, at: d.created_at || d.date || nowIso(), text: d.text }]);
  } catch (e) { return { ok: false }; }
}

/* ── the shared Office To-Do (portal.js kvListUpdate on gc_office_tasks) ── */
let TODO = null;   /* tests swap it */
function todoApi(){
  if (TODO) return TODO;
  const core = () => require('../portal.js')._core;
  return {
    upsert: async item => {
      const at = nowIso();
      const r = await core().kvListUpdate('gc_office_tasks', l => {
        const i = l.findIndex(t => t && s(t.id) === item.id);
        if (i >= 0) { const t = l[i]; if (!t.done && t.label === item.label && JSON.stringify(t.assignees || []) === JSON.stringify(item.assignees || [])) return null; l[i] = Object.assign({}, t, item, { done: false, updatedAt: at }); }
        else l.push(Object.assign({ addedBy: 'GrayCo CRM', addedAt: at, updatedAt: at, done: false }, item));
        return { list: l, check: l2 => l2.some(t => t && s(t.id) === item.id && !t.done) };
      });
      return !!(r && r.ok);
    },
    done: async prefixes => {
      const at = nowIso(), hit = id => prefixes.some(p => s(id) === p || s(id).indexOf(p + '_') === 0);
      const r = await core().kvListUpdate('gc_office_tasks', l => {
        let n = 0; l.forEach(t => { if (t && !t.done && hit(t.id)) { t.done = true; t.doneAt = at; t.autoDone = true; t.doneNote = 'Answered / resolved'; t.updatedAt = at; n++; } });
        return n ? { list: l, check: l2 => !l2.some(t => t && !t.done && hit(t.id)) } : null;
      });
      return !!(r && r.ok);
    }
  };
}
function todoId(id){ return 'MAILFU_' + s(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60); }
async function todoDone(ids){ try { await todoApi().done(arr(ids).map(todoId)); } catch (e) {} }

/* ── the CRM data that answers a request by itself ── */
let DATA = null;   /* tests swap it */
async function crmFacts(){
  if (DATA) return DATA();
  const d = await X.crmData(['vendors', 'users', 'projects', 'customers', 'leads']);
  let needs = []; try { needs = arr(await X.get('gc_cust_needs')); } catch (e) {}
  let papers = [];
  try {
    const k = s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY), u = s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, '');
    if (k) { const since = new Date(now() - 90 * 864e5).toISOString();
      const r = await globalThis.fetch(u + '/rest/v1/gc_sub_event?select=sub_id,data,created_at&kind=eq.paper&created_at=gte.' + encodeURIComponent(since) + '&limit=2000', { headers: { apikey: k, Authorization: 'Bearer ' + k } });
      if (r.ok) papers = arr(await r.json()); }
  } catch (e) {}
  return Object.assign(d, { needs, papers });
}
function subsByEmail(vendors){
  const m = {};
  arr(vendors).forEach(v => { if (!v || !v.id) return; X.emails([v.email, v.contactEmail, v.billingEmail].concat(arr(v.emails))).forEach(e => { if (!m[e]) m[e] = v; }); });
  return m;
}
function coiExpOf(v){ return s(v.coiExp || v.insExp || v.insuranceExp || v.coiExpiration).slice(0, 10); }
function w9Of(v){ return s(v.w9Date || v.w9At || v.w9UploadedAt || (v.w9 && (v.w9.at || v.w9.date)) || '').slice(0, 25); }
function crmAnswer(f, facts, subs){
  const sub = arr(f.to).map(e => subs[e]).find(Boolean);
  if ((f.type === 'coi_request' || f.type === 'w9_request') && sub) {
    const paper = f.type === 'coi_request' ? 'coi' : 'w9';
    const p = arr(facts.papers).find(x => x && s(x.sub_id) === s(sub.id) && obj(x.data).paper === paper && s(x.created_at) > s(f.at));
    if (p) return (paper === 'coi' ? 'The COI was uploaded in the sub portal' : 'The W-9 was uploaded in the sub portal') + ' (' + s(p.created_at).slice(0, 10) + ').';
    if (paper === 'coi' && f.coiExp && coiExpOf(sub) && coiExpOf(sub) > f.coiExp) return 'A newer COI is on file (good through ' + coiExpOf(sub) + ').';
    if (paper === 'w9' && w9Of(sub) && w9Of(sub) > s(f.at)) return 'A W-9 is on file now.';
  }
  if (f.type === 'customer_doc_request' && f.pid) {
    const mine = arr(facts.needs).filter(n => n && s(n.pid) === f.pid && s(n.createdAt) <= new Date(Date.parse(f.at) + 3600e3).toISOString());
    if (mine.length && mine.every(n => n.status !== 'open')) return 'The customer answered everything that was asked for.';
  }
  return '';
}
function phoneOf(f, facts, subs){
  const sub = arr(f.to).map(e => subs[e]).find(Boolean);
  if (sub) return s(sub.phone || sub.mobile || sub.cell);
  const em = arr(f.to)[0];
  const c = arr(facts.customers).find(x => x && X.emails([x.email].concat(arr(x.emails))).indexOf(em) >= 0); if (c) return s(c.phone || c.mobile);
  const p = arr(facts.projects).find(x => x && X.emails([x.email, x.customerEmail, x.clientEmail, x.adjusterEmail, x.gcEmail]).indexOf(em) >= 0);
  if (p) return s(em === low(p.adjusterEmail) ? p.adjusterPhone : p.phone || p.customerPhone || p.clientPhone);
  return '';
}
function whoName(f, facts, subs){
  const sub = arr(f.to).map(e => subs[e]).find(Boolean); if (sub) return s(sub.name || sub.company);
  const em = arr(f.to)[0];
  const c = arr(facts.customers).find(x => x && X.emails([x.email].concat(arr(x.emails))).indexOf(em) >= 0); if (c) return s(c.name);
  return em;
}
function admins(facts){
  const own = s(process.env.OWNER_EMAILS || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(Boolean);
  return Array.from(new Set(arr(facts.users).filter(u => u && u.active !== false && /^admin$/i.test(s(u.role)) && /@/.test(s(u.email))).map(u => low(u.email)).concat(own)));
}

/* ── the scheduled run (mail-followup-scheduled.js, hourly): answered by the CRM? overdue → To-Do, escalate ── */
async function run(){
  let l = []; try { l = await followups(); } catch (e) { return { ok: false, error: 'store unreadable' }; }
  const waiting = l.filter(f => f.status === 'waiting');
  if (!waiting.length) return { ok: true, waiting: 0 };
  let facts = {}; try { facts = await crmFacts(); } catch (e) { facts = {}; }
  const subs = subsByEmail(facts.vendors), t = nowIso(), out = { waiting: waiting.length, resolved: 0, todos: 0, escalated: 0 };
  const resolved = {}, todos = [], meta = {};
  waiting.forEach(f => {
    const why = crmAnswer(f, facts, subs);
    if (why) { resolved[f.id] = why; return; }
    meta[f.id] = { phone: phoneOf(f, facts, subs), who: whoName(f, facts, subs) };
    const overdue = s(f.due) && s(f.due) <= t;
    if (!overdue && !f.bounced) return;
    const esc = arr(f.hist).filter(h => /reminder sent|reminder queued/.test(h.what)).length >= 2 || f.n >= 2 ? (TYPES[f.type] && TYPES[f.type].asap ? 'asap' : 'soon') : '';
    const who = meta[f.id].who;
    const label = (esc === 'asap' ? '🔴 ' : esc === 'soon' ? '🟠 ' : '') + '📬 ' + (f.bounced ? 'E-mail bounced' : esc ? 'No reply after ' + (f.n || 2) + ' follow-ups' : 'No reply — follow up') + ': ' + (TYPES[f.type] ? TYPES[f.type].label : 'request') + ' to ' + who;
    const note = '“' + f.subject + '” — sent ' + s(f.at).slice(0, 10) + (f.fromName ? ' by ' + f.fromName : '') + ' to ' + arr(f.to).join(', ') + (meta[f.id].phone ? '. Phone: ' + meta[f.id].phone : '') + '. Open 📬 Waiting on a reply to resend a reminder, call or mark it resolved.';
    const assignees = ['office@grayco-cs.com'].concat(esc ? admins(facts) : []);
    todos.push({ f, esc, item: { id: todoId(f.id), kind: 'mail_followup', fu: f.id, label, note, prio: esc === 'asap' ? 'high' : esc ? 'high' : 'normal', urgency: esc || (f.bounced ? 'soon' : 'routine'),
      assignees, assignee: esc ? 'the office and the admins' : 'the office', shared: true, personal: false, pid: f.pid || '', source: 'mail-followup' } });
  });
  for (const x of todos) { try { if (await todoApi().upsert(x.item)) out.todos++; } catch (e) {} if (x.esc) out.escalated++; }
  await fuUpdate(list => {
    let n = 0;
    list.forEach(f => {
      if (f.status !== 'waiting') return;
      if (resolved[f.id]) { f.status = 'resolved'; f.how = 'crm'; f.doneAt = t; f.why = resolved[f.id]; f.hist = arr(f.hist).concat([{ at: t, what: resolved[f.id] }]).slice(-20); n++; return; }
      const m = meta[f.id]; if (m && (m.phone !== s(f.phone) || m.who !== s(f.who))) { f.phone = m.phone; f.who = m.who; n++; }
      const td = todos.find(x => x.f.id === f.id); if (td) { if (!f.overdueAt) { f.overdueAt = t; n++; } if (td.esc && f.esc !== td.esc) { f.esc = td.esc; n++; } }
    });
    return n ? list : undefined;
  });
  out.resolved = Object.keys(resolved).length;
  if (out.resolved) await todoDone(Object.keys(resolved));
  return Object.assign({ ok: true }, out);
}

/* ── the office's actions ── */
async function resolve(id, who, note){
  const t = nowIso(); let ok = false;
  await fuUpdate(l => { const f = l.find(x => x.id === id); if (!f || f.status !== 'waiting') return undefined; f.status = 'resolved'; f.how = 'manual'; f.doneAt = t; f.by = low(who); f.why = s(note).slice(0, 300) || 'Marked resolved';
    f.hist = arr(f.hist).concat([{ at: t, what: 'marked resolved by ' + low(who) + (note ? ': ' + s(note).slice(0, 120) : '') }]).slice(-20); ok = true; return l; });
  if (ok) await todoDone([id]);
  return { ok };
}
function reminderHtml(f, body){
  const when = s(f.at).slice(0, 10);
  const orig = body && (s(body.html) || '<pre style="white-space:pre-wrap;font:inherit">' + s(body.text).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</pre>');
  return '<div style="font-family:Arial,sans-serif;font-size:14px;color:#14202e"><p>Hello,</p><p>Following up on our e-mail from ' + when + ' (below) — could you reply when you get a chance? Thank you.</p>'
    + '<p>GrayCo Construction Services<br>(901) 585-0944</p><hr style="border:none;border-top:1px solid #d6dbe1;margin:16px 0">' + (orig || '<p>' + s(f.subject) + '</p>') + '</div>';
}
let SEND = null, QUEUE = null;   /* tests swap them */
async function resend(id, who){
  const l = await followups(); const f = l.find(x => x.id === id);
  if (!f) return { ok: false, error: 'That e-mail is not on the follow-up list.' };
  if (f.status !== 'waiting') return { ok: false, error: 'It was already answered or resolved.' };
  const body = await bodyOf(f.id, f.at);
  const subj = /^following up:/i.test(f.subject) ? f.subject : 'Following up: ' + f.subject.replace(/^\s*\[[^\]]*\]\s*/, '');
  const html = reminderHtml(f, body), t = nowIso();
  let facts = {}; try { facts = await crmFacts(); } catch (e) {}
  const custEmails = {}; arr(facts.customers).forEach(c => X.emails([c && c.email].concat(arr(c && c.emails))).forEach(e => { custEmails[e] = 1; }));
  const needsApproval = (TYPES[f.type] && TYPES[f.type].appr) || arr(f.to).some(e => custEmails[e]);
  let res;
  if (needsApproval) {
    const q = QUEUE || (o => require('../portal.js')._core.queueApproval(o));
    const proj = arr(facts.projects).find(p => p && s(p.id) === f.pid);
    const ok = await q({ id: 'mfu_' + s(f.id).slice(0, 40) + '_' + ((f.n | 0) + 1), kind: 'mail_followup', title: '📨 Follow-up: ' + f.subject.slice(0, 120), pid: f.pid, jobName: proj ? s(proj.name) : '',
      to: arr(f.to).join(','), subject: subj, html, meta: { followupOf: f.id, by: low(who) } });
    res = { ok: !!ok, queued: true };
  } else {
    const send = SEND || (async payload => {
      const key = s(process.env.RESEND_API_KEY); if (!key) return { ok: false, error: 'RESEND_API_KEY is not set on Netlify.' };
      const r = await globalThis.fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, paused: !!(j && j.paused) || /^paused/.test(s(j && j.id)), error: r.ok ? '' : s(j && j.message) || 'Send failed (' + r.status + ')' };
    });
    const replyTo = staff(f.replyTo) ? f.replyTo : staff(f.from) ? f.from : 'office@grayco-cs.com';
    res = await send({ from: 'GrayCo Construction Services <office@grayco-cs.com>', reply_to: replyTo, to: arr(f.to), cc: arr(f.cc).filter(e => staff(e)), subject: subj, html,
      headers: { 'X-GrayCo-CRM': 'followup', 'X-GC-Followup-Of': f.id } });
  }
  if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'Could not send the reminder.' };
  if (res.paused) return { ok: true, paused: true, note: '⏸ Data-entry mode is on — the reminder was not sent.' };
  let set = null; try { set = await settings(); } catch (e) { set = { days: {} }; }
  await fuUpdate(list => { const x = list.find(y => y.id === id); if (!x) return undefined;
    x.n = (x.n | 0) + 1; x.last = t; x.due = addWorkDays(t, set.days[x.type] || x.days || 3);
    x.hist = arr(x.hist).concat([{ at: t, what: res.queued ? 'reminder queued for approval by ' + low(who) : 'reminder sent by ' + low(who) }]).slice(-20); return list; });
  await todoDone([id]);
  return { ok: true, queued: !!res.queued, sent: !res.queued };
}

/* ── delivery events (mail-events.js: Resend webhook) ── */
const DLV = { 'email.delivered': 'delivered', 'email.bounced': 'bounced', 'email.complained': 'complained', 'email.delivery_delayed': 'delayed', 'email.sent': 'accepted' };
async function onDelivery(evt){
  const k = DLV[s(evt && evt.type)]; if (!k) return { ok: true, ignored: s(evt && evt.type) };
  const d = (evt && evt.data) || {}, rid = s(d.email_id || d.id); if (!rid) return { ok: true, ignored: 'no id' };
  const id = 'crm_' + rid, at = s(evt.created_at || d.created_at) || nowIso();
  const keys = [X.crmKey(), X.crmKey(new Date(Date.UTC(new Date(now()).getUTCFullYear(), new Date(now()).getUTCMonth() - 1, 1)).toISOString())];
  let hit = false;
  for (const key of keys) {
    if (hit) break;
    await X.cas(key, v => { const l = arr(v); const r = l.find(x => x && x.id === id); if (!r) return undefined;
      if (k === 'accepted' && r.dlv) return undefined;
      if (r.dlv === 'bounced' && k === 'delivered') return undefined;
      r.dlv = k; r.dlvAt = at; hit = true; return l; });
  }
  if (k === 'bounced' || k === 'complained') {
    await fuUpdate(l => { const f = l.find(x => x.id === id); if (!f || f.status !== 'waiting' || f.bounced) return undefined; f.bounced = k; f.hist = arr(f.hist).concat([{ at, what: 'e-mail ' + k }]).slice(-20); return l; });
  }
  return { ok: true, found: hit, status: k };
}

module.exports = { TYPES, VIA, FU_KEY, SET_KEY, BODY_PREFIX, nowIso, classify, decorate, onSent, onInbound, onInboundEvent, run, resolve, resend, onDelivery,
  settings, saveSettings, followups, bodyOf, bodyKey, addWorkDays, normSubj, todoId,
  _t: { setNow: f => { NOW = f; }, setTodo: t => { TODO = t; }, setData: d => { DATA = d; }, setSend: f => { SEND = f; }, setQueue: f => { QUEUE = f; }, crmAnswer, subsByEmail } };
