/* ============================================================================
   GrayCo — TEXT ROUTING (patch SMSROUTE).   netlify/functions/_lib/smsroute.js

   Owner 10/24: "can I have more than 1 twilio number … leads or marketing … when I text subs or when I have different
   subjects, subs, invoices etc, all texts go to the correct employees' messages/inboxes in the crm".

   · Our numbers — one Twilio account, one or more numbers, each with a purpose (owner 10/24: separate numbers):
       subs · customers · leads (marketing & leads) · billing · insurance · other
     The numbers come from Netlify (TWILIO_FROM = the default number; TWILIO_FROM_SUBS / _CUSTOMERS / _LEADS / _BILLING /
     _INSURANCE optional) and/or Admin → 💬 Text auto-answers → 📱 Our numbers (phone numbers are not secrets; the SID
     and token stay in Netlify). One number works on its own: then routing goes only by WHO texted and WHAT about.
   · Inbound routing — first the number it came in on (subs line → the sub's job PM / office; customers line → the
     customer's PM; leads line → the lead's owner / a new lead; billing line → the office; insurance line → the Senior
     Insurance PM), then the employee who texted this number last (14 days), then by the sender:
       sub → the PM of the job the sub is on today / next on the schedule, else their latest job
       customer on a job → that job's PM · lead → its owner, else the leads person · staff → no routing
       unknown → the office (on the leads number: a new lead)
     + topics on top: billing words → the office too · insurance words → the Senior Insurance PM too ·
       emergency words → 🔴 ASAP to the on-call person and the PM.
     Nobody found → the office. Nothing is dropped.
   · Outbound: the number that fits the purpose; the employee's first name is signed ("— Mike, GrayCo").
   Pure functions — missed-call.js and texts.js do the reading, writing and sending.
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function digits(v){ return s(v).replace(/\D/g, ''); }
function phone10(v){ const d = digits(v); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }

const PURPOSES = ['subs', 'customers', 'leads', 'billing', 'insurance', 'other'];
const PURPOSE_LABEL = { subs: 'Subs', customers: 'Customers', leads: 'Marketing / leads', billing: 'Billing', insurance: 'Insurance', other: 'Other', main: 'Main (default)' };
const ENV_OF = { main: 'TWILIO_FROM', subs: 'TWILIO_FROM_SUBS', customers: 'TWILIO_FROM_CUSTOMERS', leads: 'TWILIO_FROM_LEADS', billing: 'TWILIO_FROM_BILLING', insurance: 'TWILIO_FROM_INSURANCE' };
function normPurpose(v){ v = low(v); if (v === 'main') return 'main'; if (v === 'marketing' || v === 'lead') return 'leads'; if (v === 'sub') return 'subs'; if (v === 'customer') return 'customers'; return PURPOSES.indexOf(v) >= 0 ? v : 'other'; }
const LAST_DAYS = 14;

const BILLING = /\b(invoice|invoices|bill|billed|billing|payment|payments|pay|paid|check|deposit|balance|receipt|owe|owed)\b/i;
const INSURANCE = /\b(claim|claims|adjuster|adjustor|insurance|insurer|deductible|carrier|xactimate)\b/i;
const EMERGENCY = /\b(emergency|emergencies|urgent|leak|leaking|leaks|flood|flooding|flooded|fire|smoke|burst|sewage|gas smell|water everywhere)\b/i;

/* our numbers: Netlify first (one per purpose), then the admin list; each number once */
function numbers(set, env){
  env = env || function(){ return ''; };
  const out = [], seen = {};
  function add(n, purpose, label, from){
    const d = phone10(n); if (d.length !== 10 || seen[d]) return;
    const p = normPurpose(purpose);
    seen[d] = 1; out.push({ number: d, purpose: p, label: s(label) || PURPOSE_LABEL[p], from: from });
  }
  Object.keys(ENV_OF).filter(p => p !== 'main').forEach(p => add(env(ENV_OF[p]), p, '', 'netlify'));
  arr(set && set.numbers).forEach(x => add(x.number, x.purpose, x.label, 'settings'));
  add(env(ENV_OF.main), 'main', '', 'netlify');   /* the default number: whatever purpose has no number of its own */
  return out;
}
function cleanNumbers(list){
  const seen = {};
  return arr(list).map(x => ({ number: phone10(x.number), purpose: normPurpose(x.purpose), label: s(x.label).slice(0, 60) }))
    .filter(x => x.number.length === 10 && !seen[x.number] && (seen[x.number] = 1)).slice(0, 8);
}
/* the purpose of the number a text came in on ('main' = the default number: no line-based routing) */
function purposeOf(to, set, env){ const d = phone10(to); const n = numbers(set, env).find(x => x.number === d); return n ? n.purpose : 'main'; }
/* the number to send from: the purpose's own number, else the default (TWILIO_FROM), else the customers number, else any */
function fromFor(purpose, set, env){
  const all = numbers(set, env), p = normPurpose(purpose);
  const n = all.find(x => x.purpose === p) || all.find(x => x.purpose === 'main') || all.find(x => x.purpose === 'customers') || all[0];
  return n ? '+1' + n.number : '';
}
/* who a staff text goes to → which line it goes out on: a sub → subs, a lead with no job → leads, else customers */
function purposeFor(data, ph){
  const d = phone10(ph); if (d.length !== 10) return 'customers';
  const has = r => [r.clientPhone, r.phone, r.customerPhone, r.contactPhone, r.cell, r.mobile, r.homePhone, r.ownerPhone, r.contact && r.contact.phone].map(phone10).indexOf(d) >= 0;
  if (arr(data && data.subs).concat(arr(data && data.vendors)).some(has)) return 'subs';
  if (arr(data && data.projects).some(has) || arr(data && data.customers).some(has)) return 'customers';
  if (arr(data && data.leads).some(has)) return 'leads';
  return 'customers';
}
function isOurs(num, set, env){ const d = phone10(num); return numbers(set, env).some(x => x.number === d); }

function topics(body){ const t = s(body); let em = EMERGENCY.test(t); if (!em) { try { em = require('./emergency.js').isEmergency({ title: t }); } catch (e) {} } return { billing: BILLING.test(t), insurance: INSURANCE.test(t), emergency: em }; }   /* patch EMERG: the same words as every other lead source */
function firstName(n){ const w = s(n).split(/\s+/)[0]; return /^[A-Za-z][A-Za-z'-]*$/.test(w) ? w[0].toUpperCase() + w.slice(1) : ''; }
/* "— Mike, GrayCo" once at the end (not when the text already ends with a signature) */
function sign(text, name){
  const f = firstName(name), t = s(text);
  if (!f || /—\s*[A-Za-z' -]+,\s*GrayCo\s*$/i.test(t) || /GrayCo\s*$/i.test(t)) return t;
  return t + '\n— ' + f + ', GrayCo';
}

function userBy(users, key){
  const k = low(key); if (!k) return null;
  return arr(users).find(u => low(u.email) === k || low(u.name) === k || low(u.id) === k) || null;
}
function person(users, nameOrEmail, fallbackEmail){
  const u = userBy(users, nameOrEmail);
  if (u) return { name: s(u.name), email: low(u.email), id: s(u.id) };
  const v = s(nameOrEmail);
  if (/@/.test(v)) return { name: '', email: low(v), id: '' };
  if (v) return { name: v, email: low(fallbackEmail), id: '' };
  return null;
}
/* the job a sub works on: today / the next one on the schedule, else the latest one */
function subJob(data, sub){
  const name = low(sub && (sub.company || sub.name)), id = s(sub && (sub.id || sub.subId));
  if (!name && !id) return '';
  const today = new Date().toISOString().slice(0, 10);
  const mine = arr(data && data.schedule).filter(x => x.deleted !== true && !/cancel/i.test(s(x.status)) && s(x.pid || x.projectId || x.jobId) &&
    ((id && (s(x.subId) === id || s(x.vendorId) === id)) || (name && (low(x.vendor) === name || low(x.sub) === name || low(x.subName) === name))));
  const next = mine.filter(x => s(x.date) >= today).sort((a, b) => s(a.date).localeCompare(s(b.date)))[0];
  if (next) return s(next.pid || next.projectId || next.jobId);
  const lastOne = mine.slice().sort((a, b) => s(b.date).localeCompare(s(a.date)))[0];
  if (lastOne) return s(lastOne.pid || lastOne.projectId || lastOne.jobId);
  const p = arr(data && data.projects).filter(pr => arr(pr.subs).concat(arr(pr.vendors)).some(v => (id && s(v.id || v.subId) === id) || (name && low(v.company || v.name) === name)))
    .sort((a, b) => s(b.updatedAt || b.startDate).localeCompare(s(a.updatedAt || a.startDate)))[0];
  return p ? s(p.id) : '';
}
function leadOwner(lead){ return s(lead && (lead.assignedTo || lead.assignee || lead.owner || lead.pm || lead.ownerEmail || lead.assignedEmail)); }

/* the routing decision.  ctx: { data, who, purpose, body, last, pmOf(job)->{name,email}, office:[emails], insurance:{name,email},
   oncall:{name,email}, leadsPerson:{name,email}, staffEmail } → { to:[{name,email,id,why}], urgent, why, pid, job, wantLead, office } */
function route(ctx){
  const data = ctx.data || {}, who = ctx.who || null, t = topics(ctx.body), users = data.users;
  const to = [], why = [];
  function addP(p, reason){ if (!p || !(p.email || p.name)) return; const k = low(p.email || p.name); if (to.some(x => low(x.email || x.name) === k)) return; to.push(Object.assign({}, p, { why: reason })); }
  let pid = s(who && who.pid), job = who && who.job ? who.job : null, office = false, wantLead = false;
  if (who && who.kind === 'sub' && !pid) {
    pid = subJob(data, who.sub || { company: who.name, id: who.subId });
    if (pid) job = arr(data.projects).find(p => s(p.id) === pid) || null;
  }
  /* 1) the employee who texted this number last (the reply comes back to them) */
  const last = ctx.last;
  if (last && last.email && Date.now() - Date.parse(last.at || 0) < LAST_DAYS * 86400000) {
    addP(person(users, last.email) || { name: s(last.name), email: low(last.email) }, 'texted them last');
    if (!pid && last.pid) { pid = s(last.pid); job = arr(data.projects).find(p => s(p.id) === pid) || job; }
  }
  /* 2) by who sent it */
  if (who && who.kind === 'staff') { why.push('a GrayCo employee'); return { to: [], urgent: false, why: why.join(' · '), pid: '', job: null, wantLead: false, office: false, staff: true }; }
  const line = ctx.purpose || 'main';
  if (line !== 'main') why.push((PURPOSE_LABEL[line] || line) + ' line');
  /* 2) the line it came in on, then who sent it */
  if (line === 'billing') office = true;
  if (line === 'insurance' && ctx.insurance) addP(ctx.insurance, 'insurance line');
  if (job) { const pm = ctx.pmOf ? ctx.pmOf(job) : null; if (pm) addP(pm, who && who.kind === 'sub' ? 'PM of the job this sub is on' : 'PM of their job'); }
  else if (who && who.kind === 'lead') {
    const lead = arr(data.leads).find(l => s(l.id) === s(who.leadId));
    const o = leadOwner(lead);
    if (o) addP(person(users, o), 'owns the lead'); else if (ctx.leadsPerson) addP(ctx.leadsPerson, 'leads & marketing');
  } else if (!who) {
    if (line === 'leads') { wantLead = true; why.push('new number on the leads line'); }
    else if (line === 'subs') { office = true; why.push('a number not on file texted the subs line'); }
    else why.push('unknown number');
  }
  /* 3) topics on top */
  if (t.billing) { office = true; why.push('billing'); }
  if (t.insurance && ctx.insurance) addP(ctx.insurance, 'insurance');
  const urgent = t.emergency || !!ctx.ruleAlert;
  /* patch EMERG: on call, else the Senior Insurance PM; + the admins and the office (missed-call.js adds the admins) */
  if (urgent) { if (ctx.oncall) addP(ctx.oncall, 'on call (emergency)'); else if (ctx.insurance) addP(ctx.insurance, 'Senior Insurance PM (nobody on call)'); office = true; why.push('emergency'); }
  /* 4) nobody → the office */
  if (!to.length && !wantLead) office = true;
  if (!to.length && wantLead && ctx.leadsPerson) addP(ctx.leadsPerson, 'leads & marketing');
  return { to, urgent, why: why.concat(to.map(x => (x.name || x.email) + ': ' + x.why)).join(' · '), pid, job, wantLead, office };
}
/* the ids the CRM's Job Messages uses to badge a message for a person (myId = id || email || name) */
function tagsFor(people, users){
  const out = [];
  (people || []).forEach(p => {
    const u = userBy(users, p.email) || userBy(users, p.name);
    [u && u.id, u && u.email, u && u.name, p.id, p.email, p.name].forEach(v => { v = s(v); if (v && out.indexOf(v) < 0) out.push(v); });
  });
  return out;
}
/* quiet hours for automatic texts: 8 PM – 7 AM Central */
function centralHour(ms){
  try { return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date(ms)), 10) % 24; }
  catch (e) { return new Date(ms).getUTCHours() - 5; }
}
function quiet(ms){ const h = centralHour(ms); return h >= 20 || h < 7; }

/* the list other parts of the CRM read (gc_kv "gc_sms_numbers", window._gcSmsNumbers()): [{ number, purpose }] with
   purpose subs | customers | marketing | billing | insurance | other — the default number counts as customers when no
   customers number of its own exists */
function publicList(set, env){
  const all = numbers(set, env), hasCust = all.some(x => x.purpose === 'customers');
  return all.map(x => ({ number: x.number, purpose: x.purpose === 'leads' ? 'marketing' : x.purpose === 'main' ? (hasCust ? 'other' : 'customers') : x.purpose }));
}
module.exports = { publicList, PURPOSES, PURPOSE_LABEL, ENV_OF, normPurpose, purposeFor, numbers, cleanNumbers, purposeOf, fromFor, isOurs, topics, sign, firstName, subJob, route, tagsFor, quiet, phone10, LAST_DAYS };
