/* ============================================================================
   GrayCo — WHICH PROJECT IS THIS TEXT ABOUT? (patch TEXTROUTE).   netlify/functions/_lib/textroute.js

   Owner 11/26: "when a customer text our grayco text make sure they name the address so the message goes to the right
   project — if they are talking about their project — or if its a new project so it can create a lead instantly".

   A text to the GrayCo Customers / default number that cannot be matched to exactly one job:
     · a number not on file, · a number on SEVERAL open jobs, · a customer on file with no job,
   is read for a job address first (the portal sign-up's address match, _lib/portalsignup.js addrMatch: house number + a
   street word, or house number + ZIP):
     one job      → the text is filed on that job (Job Messages + 💬 timeline), its PM / super hear as today
     NEW / new work ("estimate", "quote", "new roof" …) → a lead at once (the normal text-lead path, website-intake fileLead)
     nothing      → ONE automatic question (the same reply limits, auto-answer switch, data-entry mode and 7 PM – 7 AM hold):
                    ASK below. Their answer is read the same way: an address → that job (the first text moves there too),
                    NEW → a lead, still nothing → an office To-Do with both texts.
   A number on exactly one active job (or one an employee texted about a job in the last 14 days) is untouched: no question.
   Subs, staff, leads (their texts go on the lead), emergencies and the subs / billing / insurance / leads lines: untouched.
   One reply per step, never a second question for the same text; an address the texter named is remembered for 30 days
   (their next texts go to that job without asking) — and never makes them "the customer on file": the menu's job details,
   portal link and balance stay for the phone on the job only.
   Pure functions — missed-call.js does the reading, writing and sending.
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }

const ASK = "Is this about a project we're working on? Reply with the job address — or NEW if it's a new project.";
/* the same words whether or not the address was found (a stranger learns nothing about whose house is a GrayCo job) */
const GOT = "Thanks — your message is with our team now. Someone will get back to you soon.";
const GOT_NEW = "Thanks — we've started a new project request for you. Someone from GrayCo will reach out soon.";
const LINES = ['customers', 'main'];
const PENDING_H = 48, STICKY_D = 30, OFFICE_D = 7;
const CLOSED = /^(closed|complete|completed|cancel+ed|lost|archived|dead|void|warranty)$/;
const NEW_WORD = /^\s*(?:it'?s\s+)?(?:a\s+)?new\b(?:\s+(?:project|job|one|work|lead|house|property|request))?\s*[.!]*\s*$/i;
/* clearly NEW work, from anyone (also a customer on file: "another project", "need a quote for …") */
const NEW_WORK = /\b(?:new (?:project|job|request)|another (?:project|job|house|property)|(?:need|want|get|like|wanting|looking for)\s+(?:a|an|some)\s+(?:free\s+)?(?:estimate|quote|bid|inspection)s?|looking for a (?:contractor|roofer|builder))\b/i;
/* a stranger asking about work (the approved "estimate" / "services" words) — not used for a customer on file, whose "estimate" may be their job's */
const NEW_ASK = /\b(?:estimate|quote|bid|inspection|how much (?:would|does|will|to|for)|do you (?:do|install|build|repair|fix|replace))\b/i;

function addrsOfJob(p){ const out = []; [p.address, p.jobAddress, p.street, p.siteAddress, p.propertyAddress].map(s).filter(Boolean).forEach(a => { if (out.indexOf(a) < 0) out.push(a); }); return out; }
function alive(p, dead){ return !!(p && s(p.id) && p.deleted !== true && !p.archived && !(dead && dead[s(p.id)])); }
function isOpen(p){ return !CLOSED.test(low(p.status)); }
function deadSet(list){ const d = {}; (Array.isArray(list) ? list : []).forEach(x => { const k = typeof x === 'string' ? x : s(x && x.id); if (k) d[k] = 1; }); return d; }
/* the pieces of the text that could be an address: from each house number to the end of its line */
function addrPieces(body){
  const t = s(body).replace(/\s+/g, ' '), out = [], rx = /(^|[^\d#$.:\/-])(\d{1,6}[a-z]?)\s+(?=[a-z])/gi; let m;
  while ((m = rx.exec(t))) { const from = m.index + m[1].length; out.push(t.slice(from, from + 90)); if (out.length >= 6) break; }
  return out;
}
/* the jobs whose address the text names (prefer `mine`, then open jobs, then any) */
function jobsByAddress(body, projects, o){
  o = o || {}; const PS = require('./portalsignup.js'), dead = o.dead || {};
  const pieces = addrPieces(body); if (!pieces.length) return [];
  const hit = arr(projects).filter(p => alive(p, dead) && addrsOfJob(p).some(a => pieces.some(pc => { try { return PS.addrMatch(pc, '', a); } catch (e) { return false; } })));
  if (!hit.length) return [];
  const mine = (o.mine || []).map(s), pref = [hit.filter(p => mine.indexOf(s(p.id)) >= 0 && isOpen(p)), hit.filter(p => mine.indexOf(s(p.id)) >= 0), hit.filter(isOpen), hit];
  const set = pref.find(l => l.length) || [];
  /* several jobs at one house (roof + kitchen): the newest open one — the same pick the phone match makes */
  const keys = {}; set.forEach(p => { keys[low(addrsOfJob(p)[0]).replace(/[^a-z0-9]/g, '')] = 1; });
  if (Object.keys(keys).length > 1) return set;   /* two different places named: not one job */
  return set.slice().sort((a, b) => s(b.updatedAt || b.created || b.startDate).localeCompare(s(a.updatedAt || a.created || a.startDate))).slice(0, 1);
}
function saysNew(body, o){
  o = o || {}; const t = s(body);
  if (NEW_WORD.test(t) || NEW_WORK.test(t)) return true;
  if (!o.unknown) return false;
  return NEW_ASK.test(t) || !!(o.rule && o.rule.lead && o.rule.id !== 'emergency');   /* a stranger asking for an estimate (the approved "estimate" answer) */
}
/* their jobs (open first) when the phone is on several */
function theirJobs(who, projects, ph, dead){
  if (!who || who.kind !== 'customer') return [];
  const S = require('./sms.js');
  return arr(projects).filter(p => alive(p, dead) && [p.clientPhone, p.phone, p.customerPhone, p.contactPhone, p.cell, p.mobile, p.homePhone, p.ownerPhone, p.contact && p.contact.phone].map(S.phone10).indexOf(ph) >= 0).map(p => s(p.id));
}
/* is this sender one we may ask?  → { ambiguous, kind } */
function ambiguity(ctx){
  const who = ctx.who, own = ctx.own || {};
  if (LINES.indexOf(ctx.purpose || 'main') < 0) return { ambiguous: false, why: 'not the customers line' };
  if (who && (who.kind === 'staff' || who.kind === 'sub' || who.kind === 'lead')) return { ambiguous: false, why: who.kind };
  if (own.lead || own.todo) return { ambiguous: false, why: own.lead ? 'their texts go on their lead' : 'their texts go on their To-Do' };
  if (own.pid && who && who.kind === 'customer' && s(who.pid) === s(own.pid) && !who.openJobs) return { ambiguous: false, why: 'their job (remembered)' };
  if (ctx.lastPid) return { ambiguous: false, why: 'an employee texted them about a job' };
  if (!who) return { ambiguous: true, kind: 'unknown' };
  if (who.kind === 'customer' && !s(who.pid)) return { ambiguous: true, kind: 'customer_no_job' };
  if (who.kind === 'customer' && ((+who.openJobs || 0) > 1 || (!(+who.openJobs) && (+who.jobs || 0) > 1))) return { ambiguous: true, kind: 'several_jobs' };
  return { ambiguous: false, why: 'one job' };
}
/* the decision.  ctx: { who, own, tr (the saved step for this number), body, purpose, rule, emergency, lastPid, projects, deleted,
   ph, now, canAsk }  →  { action: 'today' | 'job' | 'lead' | 'todo' | 'ask', pid, job, reply, step, mine, pending, why } */
function decide(ctx){
  const t = +ctx.now || Date.now(), tr = ctx.tr && typeof ctx.tr === 'object' ? ctx.tr : null, dead = deadSet(ctx.deleted);
  const am = ambiguity(ctx); if (!am.ambiguous) return { action: 'today', why: am.why };
  if (ctx.emergency) return { action: 'today', why: 'emergency (the emergency path answers at once)' };
  const mine = theirJobs(ctx.who, ctx.projects, s(ctx.ph), dead);
  const pending = tr && tr.step === 'asked' && t - Date.parse(tr.at || 0) < PENDING_H * 3600e3 ? tr : null;
  const findJob = id => arr(ctx.projects).find(p => s(p.id) === s(id) && alive(p, dead)) || null;
  /* 1) an address in this text → that job */
  const hits = jobsByAddress(ctx.body, ctx.projects, { mine, dead });
  if (hits.length === 1) return { action: 'job', pid: s(hits[0].id), job: hits[0], mine: mine.indexOf(s(hits[0].id)) >= 0, reply: pending ? GOT : '', step: pending ? 'answer' : '', pending, why: 'they named the address' + (pending ? ' (answer to the question)' : '') };
  /* 2) NEW / new work → a lead now */
  if (saysNew(ctx.body, { unknown: am.kind === 'unknown', rule: ctx.rule })) return { action: 'lead', reply: pending ? GOT_NEW : '', step: pending ? 'answer' : '', pending, why: 'a new project' + (pending ? ' (answer to the question)' : '') };
  /* 3) an address they named before (30 days) → that job, no question */
  if (tr && tr.step === 'filed' && tr.pid && t - Date.parse(tr.at || 0) < STICKY_D * 864e5) { const j = findJob(tr.pid); if (j) return { action: 'job', pid: s(j.id), job: j, mine: mine.indexOf(s(j.id)) >= 0, reply: '', step: '', why: 'the address they named earlier' }; }
  /* 3b) the office already has their earlier texts (7 days) → this one is added to that To-Do, no new question */
  if (tr && tr.step === 'office' && t - Date.parse(tr.at || 0) < OFFICE_D * 864e5) return { action: 'todo', reply: '', step: '', why: 'the office already has their earlier text' };
  /* 4) they were asked and this is not an address we know → the office */
  if (pending) return { action: 'todo', reply: GOT, step: 'answer', pending, why: hits.length > 1 ? 'the answer names more than one job' : 'no job matches their answer' };
  /* 5) ask (only when the question can go out — otherwise exactly as today) */
  if (!ctx.canAsk) return { action: 'today', why: 'cannot ask now (' + (ctx.cantWhy || 'automatic answers are off') + ')' };
  return { action: 'ask', reply: ASK, step: 'ask', why: am.kind === 'unknown' ? 'a number not on file' : am.kind === 'several_jobs' ? 'a number on several jobs' : 'a customer with no job' };
}
/* the saved steps per number (gc_sms_state.troute): kept 30 days */
function prune(map, now){
  const t = +now || Date.now(), out = {};
  Object.keys(map && typeof map === 'object' ? map : {}).forEach(k => { const v = map[k]; if (v && t - Date.parse(v.at || 0) < STICKY_D * 864e5) out[k] = v; });
  return out;
}
module.exports = { ASK, GOT, GOT_NEW, LINES, PENDING_H, STICKY_D, addrPieces, jobsByAddress, saysNew, ambiguity, decide, prune, theirJobs };
