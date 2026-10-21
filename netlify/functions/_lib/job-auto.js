// netlify/functions/_lib/job-auto.js
// GrayCo — the job's AUTOMATIONS (patch JA). Owner 10/21: "Anytime I create a project … shouldn't there be more
// things I have options to click and unclick, like if e-mails are on, what documents are sending auto, etc.?"
//
// Every job may carry project.auto = { <option>: true|false, …, updatedAt, by } — chosen in the box shown wherever a
// job is made (Launch Job, Projects → New project, field ＋ New project, a lead / estimate / bid made into a job) and
// changed later on the job (⚙ Automations). A job without p.auto (every job made before this) follows the company
// defaults: gc_kv "jobAutoDefaults" = { residential:{…}, commercial:{…}, insurance:{…}, program:{…}, updatedAt, by }
// (⚙ Admin → Automation defaults), and where that says nothing, the built-in defaults below, which are what the CRM
// did before this patch. The CRM page carries the same table (tail_JA.js); test_fn_JA.mjs checks the two agree.
//
// Every automatic send asks allows(p, key) / blockedKind(p, kind) before it queues anything. Turning an option off
// never sends anything and never queues an approval; the approval rules for what is on stay as they were.
'use strict';

/* key → [section, built-in default (or per job type), locked] — the order is the order on screen */
const OPTS = [
  ['project', 'create', true, true],
  ['photos', 'create', true], ['gdoc', 'create', true], ['calendar', 'create', true], ['checklist', 'create', true],
  ['subScopes', 'create', true], ['claimFile', 'create', { insurance: true, other: false }],
  ['portalLink', 'portal', true], ['portalInvite', 'portal', true], ['showCarrier', 'portal', false], ['portalSelections', 'portal', true],
  ['welcome', 'email', true], ['scheduleUpdates', 'email', true], ['apptAuto', 'email', false], ['progressPosts', 'email', true], ['docsNotice', 'email', true],
  ['invoiceEmail', 'email', true], ['paymentReminders', 'email', true], ['finalReminders', 'email', true],
  ['thankYou', 'email', { commercial: false, other: true }], ['reviewRequest', 'email', { commercial: false, other: true }],
  ['yearlyCheckup', 'email', { commercial: false, other: true }],
  ['contractSign', 'docs', true], ['faqPacket', 'docs', true], ['warrantyCert', 'docs', true], ['lienWaivers', 'docs', true],
  ['w9', 'docs', { commercial: true, program: true, other: false }], ['coSign', 'docs', true],
  ['signedCopies', 'docs', true, true], ['receipts', 'docs', true, true],
  ['teamAlert', 'internal', false], ['pmPush', 'internal', true], ['newsletter', 'internal', true]
];
const KEYS = OPTS.map(function(o){ return o[0]; });
const LOCKED = {}; OPTS.forEach(function(o){ if (o[3]) LOCKED[o[0]] = true; });
const GROUPS = ['residential', 'commercial', 'insurance', 'program'];

/* an approval item's kind → the option that has to be on for it to be queued (or sent) */
const KIND_KEY = {
  invoice: 'invoiceEmail', thank_you: 'thankYou', portal_link: 'portalInvite', portal_docs: 'docsNotice',
  final_invoice: 'finalReminders', final_reminder: 'finalReminders', payment_reminder: 'paymentReminders',
  welcome: 'welcome', schedule_update: 'scheduleUpdates', progress_post: 'progressPosts', review_request: 'reviewRequest',
  next_steps: 'scheduleUpdates', appt_confirm: 'scheduleUpdates', appt_reminder: 'scheduleUpdates', closeout: 'warrantyCert', progress_update: 'progressPosts',   /* patch AUT2's kinds */
  checkup: 'yearlyCheckup', contract: 'contractSign', faq_packet: 'faqPacket', warranty: 'warrantyCert',
  lien_waiver: 'lienWaivers', w9: 'w9', change_order: 'coSign'
};

function s(v){ return v == null ? '' : String(v).trim(); }
function groupOf(p){
  p = p || {};
  const t = s(p.type) + ' ' + s(p.jobType);
  if (p.isInsurance === true || (p.isInsurance !== false && /insurance|claim|fire damage|water damage|storm|restoration|mitigation/i.test(t))) return 'insurance';
  if (/program/i.test(t)) return 'program';
  if (/commercial|\bTI\b|tenant|church|school/i.test(t)) return 'commercial';
  return 'residential';
}
function builtin(group){
  const out = {};
  OPTS.forEach(function(o){
    const d = o[2];
    out[o[0]] = (d && typeof d === 'object') ? (group in d ? !!d[group] : !!d.other) : !!d;
  });
  return out;
}
/* the company defaults for one job type: the built-in ones, then what the admin set */
function defaultsFor(group, admin){
  const out = builtin(group);
  const a = admin && typeof admin === 'object' ? admin[group] : null;
  if (a && typeof a === 'object') KEYS.forEach(function(k){ if (!LOCKED[k] && typeof a[k] === 'boolean') out[k] = a[k]; });
  return out;
}
/* what this job does: its own choices, else the defaults for its type */
function effective(p, admin){
  const out = defaultsFor(groupOf(p), admin);
  const own = p && p.auto && typeof p.auto === 'object' ? p.auto : null;
  if (own) KEYS.forEach(function(k){ if (!LOCKED[k] && typeof own[k] === 'boolean') out[k] = own[k]; });
  return out;
}
function allows(p, key, admin){
  if (LOCKED[key]) return true;
  if (KEYS.indexOf(key) < 0) return true;     /* not an automation: nothing to block */
  return effective(p, admin)[key] !== false;
}
/* '' when the job allows this kind of message, else the option that is off */
function blockedKind(p, kind, admin){
  const k = KIND_KEY[s(kind)];
  if (!k || !p) return '';
  return allows(p, k, admin) ? '' : k;
}
/* the admin defaults as stored in gc_kv (JSON text or object) */
function parseAdmin(v){
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } }
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

module.exports = { OPTS: OPTS, KEYS: KEYS, LOCKED: LOCKED, GROUPS: GROUPS, KIND_KEY: KIND_KEY, groupOf: groupOf, builtin: builtin,
  defaultsFor: defaultsFor, effective: effective, allows: allows, blockedKind: blockedKind, parseAdmin: parseAdmin, KV_KEY: 'jobAutoDefaults' };
