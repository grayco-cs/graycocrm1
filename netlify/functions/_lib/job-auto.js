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
  ['welcome', 'email', true], ['scheduleUpdates', 'email', true], ['apptAuto', 'email', false], ['progressPosts', 'email', true], ['weeklyUpdates', 'email', true], ['docsNotice', 'email', true],   /* patch ESTPDF: weeklyUpdates */
  ['invoiceEmail', 'email', true], ['paymentReminders', 'email', true], ['finalReminders', 'email', true],
  ['thankYou', 'email', { commercial: false, other: true }], ['reviewRequest', 'email', { commercial: false, other: true }],
  ['yearlyCheckup', 'email', { commercial: false, other: true }],
  ['contractSign', 'docs', true], ['faqPacket', 'docs', true], ['warrantyCert', 'docs', true], ['lienWaivers', 'docs', true],
  ['w9', 'docs', { commercial: true, program: true, other: false }], ['coSign', 'docs', true],
  ['signedCopies', 'docs', true, true], ['receipts', 'docs', true, true],
  ['teamAlert', 'internal', false], ['pmPush', 'internal', true], ['newsletter', 'internal', true],
  ['equipment', 'internal', false]   /* patch AUTO8: the dumpster & equipment tracker on this job */
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
  lien_waiver: 'lienWaivers', w9: 'w9', change_order: 'coSign', weekly_update: 'weeklyUpdates'   /* patch ESTPDF */
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
  if (p && (p.importedHistory === true || p.noSend === true || p.historyOnly === true)) OPTS.forEach(function(o){ if (!LOCKED[o[0]] && /^(email|docs|portal)$/.test(o[1])) out[o[0]] = false; });   /* patch LCLEAN-H: a job imported / back-entered as history sends nothing */
  return out;
}
/* patch COTRAIN (owner 11/12: "marketing we have nothing yet … don't make anything active until I activate marketing"; "I will have
   different ad accounts"): a GrayCo Mitigation / Environmental job never gets a marketing message (review request, newsletter list,
   yearly check-up) until an admin turns that company's marketing on (🏢 company settings → marketing.active, read through
   parseAdmin(v, gc_companies)). GrayCo Construction is unchanged. The 5 jobs MULTICO reads as Construction stay Construction. */
const MKT_KEYS = { reviewRequest: 1, newsletter: 1, yearlyCheckup: 1 };
const MISFILED = { QB_1787683804675_rorl3: 1, QB_1787683804675_n8toc: 1, QB_1787770954125_mynon: 1, PRJMVPFN7MBC7: 1, PRJMVPH916YOG: 1 };
function companyOf(p){
  const c = s(p && p.companyId);
  if (c !== 'mitigation' && c !== 'environmental') return 'construction';
  if (MISFILED[s(p.id)] && c === 'mitigation' && !p.companyIdBy && !p.parentJobId) return 'construction';
  return c;
}
function otherCo(p){ return companyOf(p) !== 'construction'; }
function coMarketingOn(p, admin){ const c = companyOf(p); if (c === 'construction') return true; const m = admin && admin._coMkt && admin._coMkt[c]; return !!(m && m.active === true); }
function allows(p, key, admin){
  if (MKT_KEYS[key] && !coMarketingOn(p, admin)) return false;   /* patch COTRAIN */
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
function parseAdmin(v, companies){
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  v = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  /* patch COTRAIN: each company's marketing switch + its own review link (gc_kv gc_companies) */
  if (typeof companies === 'string') { try { companies = JSON.parse(companies); } catch (e) { companies = null; } }
  const list = companies && Array.isArray(companies.list) ? companies.list : [];
  const mk = {};
  list.forEach(function(c){ if (c && (c.id === 'mitigation' || c.id === 'environmental') && c.marketing && typeof c.marketing === 'object') mk[c.id] = { active: c.marketing.active === true, reviewLink: s(c.marketing.accounts && c.marketing.accounts.reviewLink) }; });
  if (!Object.keys(mk).length) return v;
  return Object.assign({}, v || {}, { _coMkt: mk });
}
/* patch COTRAIN: the review link a job's customer may be shown — Construction's own, a Mitigation / Environmental job only its company's (when on) */
function reviewLinkFor(p, admin, constructionUrl){ const c = companyOf(p); if (c === 'construction') return constructionUrl; if (!coMarketingOn(p, admin)) return ''; const m = admin._coMkt[c]; return /^https:\/\//.test(m.reviewLink) ? m.reviewLink : ''; }

module.exports = { OPTS: OPTS, KEYS: KEYS, LOCKED: LOCKED, GROUPS: GROUPS, KIND_KEY: KIND_KEY, groupOf: groupOf, builtin: builtin,
  defaultsFor: defaultsFor, effective: effective, allows: allows, blockedKind: blockedKind, parseAdmin: parseAdmin, KV_KEY: 'jobAutoDefaults',
  companyOf: companyOf, otherCo: otherCo, coMarketingOn: coMarketingOn, reviewLinkFor: reviewLinkFor, MKT_KEYS: MKT_KEYS };
