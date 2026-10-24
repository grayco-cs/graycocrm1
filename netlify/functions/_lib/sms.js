/* ============================================================================
   GrayCo — 💬 TEXT US: customers text the GrayCo Twilio number (patch TXT, owner 10/23: "can customers text the
   number for advice — texts go to our e-mails, or replies etc. I would like to offer that, and basic answers for
   different questions").   netlify/functions/_lib/sms.js

   Used by missed-call.js (the Twilio "A message comes in" webhook, already signature-checked there) and texts.js
   (staff replies + Admin → 💬 Text auto-answers). A text in:
     · is matched to who sent it — a job's customer (their most recent OPEN job; else their latest job), a customer
       record, a lead, a sub — by the 10-digit phone;
     · goes on the CRM's Job Messages (gc_job_messages) for that job, or "📥 Unsorted" when there is no job (subs,
       unknown numbers), and on the job's 💬 Communication timeline;
     · an unknown number becomes a Lead (source "Text message"), routed by the lead roles (water / fire / storm →
       Senior Insurance PM …);
     · is e-mailed to the staff relay list (Admin; staff @grayco-cs.com addresses only) + the job's PM;
     · may get ONE automatic answer from the approved list below (never prices, coverage promises or legal advice).
   Settings (service-only gc_lead_inbox_kv "gc_sms_settings"), edited in Admin → 💬 Text auto-answers.
   ========================================================================== */
'use strict';
const crypto = require('crypto');

const SETTINGS_KEY = 'gc_sms_settings';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function digits(v){ return s(v).replace(/\D/g, ''); }
function phone10(v){ const d = digits(v); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function clip(v, n){ v = s(v); return v.length > n ? v.slice(0, n - 1) + '…' : v; }

const OFFICE_PHONE = '(901) 585-0944';
const FALLBACK = 'Thanks for texting GrayCo Construction Services! Someone from our team will text you back shortly. For an emergency call ' + OFFICE_PHONE + ' — 24/7.';
const HELP_TEXT = 'GrayCo Construction Services: text your question here or call ' + OFFICE_PHONE + '. Msg & data rates may apply. Reply STOP to opt out.';
const HELP = /^\s*(help|info)\s*[.!?]*\s*$/i;

/* the approved answers — admins edit the wording, keywords and on/off in Admin → 💬 Text auto-answers.
   Order is priority: the first rule whose keywords match answers. {office_phone} {address} {billing_email} {portal}
   {first} {job} {pm} {next_visit} are filled in. */
const DEFAULT_RULES = [
  { id: 'emergency', label: '🚨 Emergency (water / fire / storm)', on: true, alert: true, lead: true,
    keywords: 'emergency, flood, flooding, flooded, burst, pipe broke, pipe burst, water coming, water everywhere, water in, leaking, leak, sewage, backup, fire, smoke, tree fell, tree on, caved, collapsed, storm damage',
    answer: 'If this is an emergency, call us now at {office_phone} — we answer 24/7. If water is coming in and it is safe, shut off the main water valve. Someone from GrayCo is being alerted right now.' },
  { id: 'status', label: '📅 Where is my project / when are you coming (customers on a job)', on: true, needsJob: true,
    keywords: 'when are, when is, when will, where is my, where\'s my, status, schedule, coming today, coming tomorrow, on the way, on your way, update, start date, what day',
    answer: '{next_visit}' },
  { id: 'payment', label: '💳 Payments / invoices', on: true,
    keywords: 'pay, payment, invoice, bill, balance, owe, receipt, check, card',
    answer: 'For invoices and payments, e-mail {billing_email} or call {office_phone}. Your GrayCo portal also shows your invoices and lets you pay online.' },
  { id: 'insurance', label: '🛡 Insurance claim help', on: true,
    keywords: 'insurance, claim, adjuster, deductible, covered, coverage, policy',
    answer: 'We help homeowners through insurance claims every day: we document the damage with photos and moisture readings, write the estimate and meet your adjuster. Your policy and your insurance company decide what is covered — we can\'t promise coverage, but we\'ll walk you through every step. Want us to come look? Reply with the property address.' },
  { id: 'estimate', label: '📝 Free estimate / inspection request', on: true, lead: true,
    keywords: 'estimate, quote, inspection, inspect, come out, come look, look at, price, how much, cost, bid, appointment',
    answer: 'We\'d be glad to come take a look — estimates are free. Please reply with the property address and a good day and time, and we\'ll confirm with you.' },
  { id: 'services', label: '🏠 What we do', on: true,
    keywords: 'services, what do you do, do you do, do you fix, do you repair, do you handle, remodel, remodeling, roof, roofing, commercial, restoration, mold',
    answer: 'GrayCo handles water, fire and storm damage restoration, roofing, remodels and commercial construction — one licensed general contractor (unlimited) from mitigation to the full rebuild. Want a free inspection? Reply with your address and a good time.' },
  { id: 'hours', label: '🕘 Office hours', on: true,
    keywords: 'hours, open, close, closed, closing, what time',
    answer: 'Our office is open Monday–Friday, 8 AM–5 PM. For water, fire or storm emergencies call {office_phone} any time — 24/7.' },
  { id: 'address', label: '📍 Office address', on: true,
    keywords: 'address, where are you, location, located, directions, office at',
    answer: 'GrayCo Construction Services is at {address}. Call {office_phone} before you stop by so we can be there.' }
];
const DEFAULTS = {
  autoOn: true,              /* send automatic answers at all */
  when: 'always',            /* 'always' | 'after_hours' | 'business_hours' — emergencies and HELP always answer */
  aiClassify: true,          /* with ANTHROPIC_API_KEY: a small model only PICKS one of the approved answers */
  fallbackOn: true,          /* no answer fits → "Someone will text you back shortly" (once per 12 h per number) */
  maxPerDay: 4,              /* automatic answers to one number in 24 h */
  relayTo: ['office@grayco-cs.com'],
  relayAdmins: true,         /* also the admins (the same list the lead alerts use) */
  rules: DEFAULT_RULES
};

function cleanRule(r, base){
  r = r || {}; base = base || {};
  return { id: s(r.id || base.id).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || ('r' + crypto.randomBytes(3).toString('hex')),
    label: clip(r.label != null ? r.label : base.label, 80), on: r.on == null ? base.on !== false : !!r.on,
    keywords: clip(r.keywords != null ? r.keywords : base.keywords, 600), answer: clip(r.answer != null ? r.answer : base.answer, 480),
    alert: r.alert == null ? !!base.alert : !!r.alert, lead: r.lead == null ? !!base.lead : !!r.lead, needsJob: r.needsJob == null ? !!base.needsJob : !!r.needsJob };
}
/* settings from storage merged over the defaults; a built-in rule an admin never touched keeps the newest wording */
function settings(v){
  let o = v; if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { o = null; } }
  o = o && typeof o === 'object' ? o : {};
  const out = {};
  if (s(o.by)) out.by = low(o.by).slice(0, 120);
  if (s(o.at)) out.at = s(o.at).slice(0, 40);
  out.autoOn = o.autoOn == null ? DEFAULTS.autoOn : !!o.autoOn;
  out.aiClassify = o.aiClassify == null ? DEFAULTS.aiClassify : !!o.aiClassify;
  out.fallbackOn = o.fallbackOn == null ? DEFAULTS.fallbackOn : !!o.fallbackOn;
  out.relayAdmins = o.relayAdmins == null ? DEFAULTS.relayAdmins : !!o.relayAdmins;
  out.when = /^(always|after_hours|business_hours)$/.test(s(o.when)) ? s(o.when) : 'always';
  out.maxPerDay = Math.max(1, Math.min(10, parseInt(o.maxPerDay, 10) || DEFAULTS.maxPerDay));
  out.relayTo = staffOnly(Array.isArray(o.relayTo) ? o.relayTo : DEFAULTS.relayTo);
  /* patch SMSROUTE: our numbers (each with a purpose) and the leads & marketing person */
  out.numbers = require('./smsroute.js').cleanNumbers(o.numbers);
  out.leadsPerson = staffOnly([o.leadsPerson])[0] || '';
  const saved = arr(o.rules), byId = {};
  saved.forEach(r => { if (s(r.id)) byId[s(r.id)] = r; });
  const rules = DEFAULT_RULES.map(d => cleanRule(byId[d.id] || {}, d));
  saved.forEach(r => { if (!DEFAULT_RULES.some(d => d.id === s(r.id))) rules.push(cleanRule(r, {})); });
  out.rules = rules;
  return out;
}
/* the relay goes to GrayCo staff only (so data-entry mode still lets it through) */
function staffOnly(list){
  return Array.from(new Set(arr([]).concat((Array.isArray(list) ? list : String(list || '').split(/[\s,;]+/)).map(low))
    .filter(e => /^[a-z0-9._%+-]+@(in\.)?grayco-cs\.com$/.test(e)))).slice(0, 12);
}

/* ── which rule answers ── */
function kwList(r){ return s(r.keywords).split(',').map(low).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean); }
function hits(text, r){
  const t = ' ' + low(text).replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  /* a word or phrase, also with a plain ending ("gutter" finds "gutters", "leak" finds "leaking") */
  return kwList(r).some(k => {
    const kk = k.replace(/[^a-z0-9' ]+/g, ' ').trim(); if (!kk) return false;
    return new RegExp(' ' + kk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(s|es|ed|ing|y|'s)? ").test(t);
  });
}
function pickRule(text, st, ctx){
  ctx = ctx || {};
  for (const r of st.rules) {
    if (!r.on) continue;
    if (r.needsJob && !ctx.pid) continue;
    if (hits(text, r)) return r;
  }
  return null;
}
/* optional: a small Claude model only CHOOSES one of the approved rule ids (or none) — never writes the answer */
async function aiPick(text, st, ctx, ai){
  if (!st.aiClassify || !ai || !ai.ready()) return null;
  const rules = st.rules.filter(r => r.on && (!r.needsJob || ctx.pid));
  if (!rules.length) return null;
  const tool = { name: 'pick_answer', description: 'Pick which approved answer fits the customer text, or none.',
    input_schema: { type: 'object', properties: { id: { type: 'string', enum: rules.map(r => r.id).concat(['none']) }, confidence: { type: 'number' } }, required: ['id', 'confidence'] } };
  try {
    const r = await ai.ask({ model: process.env.SMS_AI_MODEL || 'claude-haiku-5-5', maxTokens: 200, effort: false, timeoutMs: 8000, tool,
      content: [{ type: 'text', text: 'A customer texted a construction / restoration company. Pick the ONE approved answer that fits, or "none" when nothing fits well. Call pick_answer.\n\nApproved answers:\n'
        + rules.map(x => '- ' + x.id + ': ' + x.label).join('\n') + '\n\nCustomer text:\n"""' + clip(text, 600) + '"""' }] });
    const o = r && r.ok ? r.out : null;
    if (!o || !o.id || o.id === 'none' || !(Number(o.confidence) >= 0.7)) return null;
    return rules.find(x => x.id === o.id) || null;
  } catch (e) { return null; }
}

/* business hours: Mon–Fri 8–17 Central */
function centralParts(ms){
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hour12: false });
    const p = {}; f.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
    return { wd: p.weekday, h: parseInt(p.hour, 10) % 24 };
  } catch (e) { const d = new Date(ms - 5 * 3600e3); return { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()], h: d.getUTCHours() }; }
}
function businessHours(ms){ const c = centralParts(ms); return !/Sat|Sun/.test(c.wd) && c.h >= 8 && c.h < 17; }
function whenAllows(st, ms, rule){
  if (rule && (rule.id === 'emergency' || rule.alert)) return true;
  if (st.when === 'after_hours') return !businessHours(ms);
  if (st.when === 'business_hours') return businessHours(ms);
  return true;
}

/* ── who sent it ── */
const CLOSED = /^(closed|complete|completed|cancel+ed|lost|archived|dead|void|warranty)$/;
function phonesOf(r){ return [r.clientPhone, r.phone, r.customerPhone, r.contactPhone, r.cell, r.mobile, r.homePhone, r.ownerPhone, r.contact && r.contact.phone].map(phone10).filter(x => x.length === 10); }
function match(data, ph){
  data = data || {};
  const dead = {}; arr(data.gc_deleted_projects).forEach(x => { dead[s(x.id || x)] = 1; });
  (Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(x => { if (typeof x === 'string') dead[x] = 1; });
  const jobs = arr(data.projects).filter(p => p.id && !dead[s(p.id)] && p.deleted !== true && phonesOf(p).indexOf(ph) >= 0);
  if (jobs.length) {
    const open = jobs.filter(p => !CLOSED.test(low(p.status)));
    const pick = (open.length ? open : jobs).slice().sort((a, b) => s(b.updatedAt || b.created || b.startDate).localeCompare(s(a.updatedAt || a.created || a.startDate)))[0];
    return { kind: 'customer', pid: s(pick.id), name: s(pick.client || pick.customer || pick.clientName), job: pick, jobs: jobs.length, openJobs: open.length };
  }
  const c = arr(data.customers).find(x => phonesOf(x).indexOf(ph) >= 0);
  if (c) return { kind: 'customer', pid: '', name: s(c.name || c.company), customerId: s(c.id) };
  const sub = arr(data.subs).concat(arr(data.vendors)).find(x => phonesOf(x).indexOf(ph) >= 0);
  if (sub) return { kind: 'sub', pid: '', name: s(sub.company || sub.name), subId: s(sub.id) };
  const lead = arr(data.leads).find(x => phonesOf(x).indexOf(ph) >= 0);
  if (lead) return { kind: 'lead', pid: '', name: s(lead.name || (lead.contact && lead.contact.name) || lead.title), leadId: s(lead.id) };
  return null;
}
function firstName(n){ const w = s(n).split(/\s+/)[0]; return /^[A-Za-z][a-z'-]+$/.test(w) && !/^(the|llc|inc)$/i.test(w) ? w : ''; }
function dayWords(iso){
  const d = s(iso).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; }
}
/* the next thing on the CRM schedule for this job (today or later) */
function nextVisit(data, pid, todayIso){
  const today = s(todayIso).slice(0, 10);
  const items = arr(data.schedule).filter(x => s(x.pid || x.projectId || x.jobId) === s(pid) && x.deleted !== true && !/cancel/i.test(s(x.status)))
    .filter(x => s(x.date || x.start || x.startDate).slice(0, 10) >= today)
    .sort((a, b) => s(a.date || a.start || a.startDate).localeCompare(s(b.date || b.start || b.startDate)));
  return items[0] || null;
}

/* fill an approved answer */
function fill(text, ctx){
  ctx = ctx || {};
  return s(text).replace(/\{(\w+)\}/g, (m, k) => {
    if (k === 'office_phone') return OFFICE_PHONE;
    if (k === 'address') return s(ctx.address);
    if (k === 'billing_email') return s(ctx.billing) || 'billing@grayco-cs.com';
    if (k === 'portal') return s(ctx.portal) || 'https://portal.grayco-cs.com';
    if (k === 'first') return s(ctx.first);
    if (k === 'job') return s(ctx.job);
    if (k === 'pm') return s(ctx.pm) || 'your project manager';
    if (k === 'next_visit') return s(ctx.nextVisit);
    return '';
  }).replace(/\s+([.,!?])/g, '$1').trim();
}
function nextVisitText(ctx){
  const hi = ctx.first ? 'Hi ' + ctx.first + '! ' : 'Hi! ';
  if (ctx.visit) {
    const t = clip(ctx.visit.title || ctx.visit.type || 'work', 60), d = dayWords(ctx.visit.date || ctx.visit.start || ctx.visit.startDate);
    return hi + 'The next thing on the schedule' + (ctx.job ? ' for ' + ctx.job : '') + ' is ' + t + (d ? ' on ' + d : '') + '. ' + (ctx.pm ? ctx.pm + ', your project manager,' : 'Your project manager') + ' will confirm the time — or call ' + OFFICE_PHONE + '.';
  }
  return hi + 'Thanks for checking in' + (ctx.job ? ' on ' + ctx.job : '') + '. ' + (ctx.pm ? ctx.pm + ', your project manager,' : 'Your project manager') + ' will text or call you back shortly. You can also call our office at ' + OFFICE_PHONE + '.';
}
/* nothing a customer reads may name a sub portal or a sub's details */
function safe(text){ return s(text).replace(/sub(contractor)?\s*portal/gi, 'our team').slice(0, 600); }

module.exports = { SETTINGS_KEY, DEFAULTS, DEFAULT_RULES, FALLBACK, HELP_TEXT, HELP, OFFICE_PHONE, settings, staffOnly, pickRule, aiPick, hits, businessHours, whenAllows,
  match, nextVisit, nextVisitText, fill, firstName, safe, phone10, tidy, clip };
