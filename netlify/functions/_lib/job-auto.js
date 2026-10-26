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
  ['gcPortalLink', 'portal', { commercial: true, other: false }], ['gcPortalInvite', 'portal', { commercial: true, other: false }],   /* patch COMMCO: the GC portal (commercial) */
  ['welcome', 'email', true], ['scheduleUpdates', 'email', true], ['apptAuto', 'email', false], ['progressPosts', 'email', true], ['docsNotice', 'email', true],
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
  lien_waiver: 'lienWaivers', w9: 'w9', change_order: 'coSign'
};

function s(v){ return v == null ? '' : String(v).trim(); }
/* patch AUTOCOM (owner 10/26): commercial jobs and jobs from bids (GCs, BuildingConnected / PlanHub, public bid sites,
   bid leads) start with what a GC wants — no customer portal, no welcome / marketing / review mail, no invoice e-mails
   (pay apps go through the GC). Residential, insurance, roof, program and every other type keep the old all-on table.
   The CRM page (patch JA + AUTOCOM) carries the same code; test_AUTOCOM checks the two agree. */
const AUTOCOM_V = 2;
const COMM = { gdoc: false, portalLink: false, portalInvite: false, showCarrier: false, portalSelections: false,
  welcome: false, scheduleUpdates: false, apptAuto: false, progressPosts: false, docsNotice: false, invoiceEmail: false,
  paymentReminders: false, finalReminders: false, thankYou: false, reviewRequest: false, yearlyCheckup: false,
  contractSign: false, faqPacket: false, newsletter: false };
/* a bid board / GC / public-bid source (patch HOT2's list, without the words that are also people's names) */
const BID_SRC = /\bbids?\b|bidding|\bitb\b|\brfp\b|\brfq\b|solicit|invitation to bid|county|city of|state of|\bmscs\b|mscaa|mlgw|bid ?board|buildingconnected|building connected|planhub|plan hub|plan ?room|sam\.gov|isqft|construct ?connect|procurement|tn stream|arbuy|ion ?wave|opengov|central bidding|bidnet|bonfire|periscope|public works|general contractor|\bgc\b/i;
const CO_RX = /\b(LLC|L\.L\.C|Inc|Incorporated|Corp|Corporation|Company|Co|Ltd|LP|LLP|PLLC|Construction|Constructors|Contracting|Contractors?|Builders|General Contractors?|Development|Developers|Properties|Holdings|Management|Partners|Group|Enterprises|Hospitality|Church|School|University|District|County|City of|Authority|Bank|Hotels?)\b/i;
/* the job came from a bid: Bids → Won, a bid lead (Lead Inbox / public-bid watcher / BuildingConnected / PlanHub), a bid date or number */
function isBidJob(p, h){
  p = p || {};
  if (p.fromBid === true || p.bidJob === true || s(p.bidId) || s(p.bidNumber) || s(p.bidDue) || s(p.preBid)) return true;
  if (h && h.bidLead) return true;
  if (/^(email|watch|api|partner-bid)$/.test(s(p.leadOrigin))) return true;
  return BID_SRC.test([p.leadSource, p.source, p.subSource, p.leadOrigin].map(s).join(' '));
}
/* the customer is a GC / a company (the customer record's type when the page knows it, the job's company, the name) */
function isCompany(p, h){
  if (h && /\b(gc|general|commercial|business|company|government|gov)\b/i.test(s(h.custType))) return true;
  if (s(p.company) && !/^(n\/a|none|-+)$/i.test(s(p.company))) return true;
  return CO_RX.test(s(p.client)) || CO_RX.test(s(p.gc));
}
function groupOf(p, h){
  p = p || {};
  const t = s(p.type) + ' ' + s(p.jobType);
  if (p.isInsurance === true || (p.isInsurance !== false && /insurance|claim|fire damage|water damage|storm|restoration|mitigation/i.test(t))) return 'insurance';
  if (/program/i.test(t)) return 'program';
  const t2 = t + ' ' + [p.category, p.projectType, p.leadType, p.leadKind].map(s).join(' ');
  if (/commercial|\bTI\b|tenant|church|school|government|municipal/i.test(t2)) return 'commercial';
  if (isBidJob(p, h)) return 'commercial';                                   /* a bid is commercial work, whatever its type says */
  if (/resid|home|house|kitchen|bath|addition|roof|deck|fence/i.test(t2)) return 'residential';   /* a homeowner's kind of job stays residential */
  if (isCompany(p, h)) return 'commercial';                                  /* New Construction / Other / no type, for a GC or a company */
  return 'residential';
}
/* legacy === true: a job made before AUTOCOM with no choices of its own keeps doing what it did (the old table) */
function builtin(group, legacy){
  const out = {};
  OPTS.forEach(function(o){
    const d = o[2];
    out[o[0]] = (d && typeof d === 'object') ? (group in d ? !!d[group] : !!d.other) : !!d;
  });
  if (group === 'commercial' && legacy !== true) Object.keys(COMM).forEach(function(k){ out[k] = COMM[k]; });
  return out;
}
/* the admin's saved map for a type. A commercial map saved before AUTOCOM (no commercialV) is what the old commercial
   jobs do, not what a new one starts with; once saved after AUTOCOM the earlier one is kept as commercialPre. */
function adminFor(group, admin, legacy){
  if (!admin || typeof admin !== 'object') return null;
  if (group !== 'commercial') return admin[group];
  if (+admin.commercialV >= AUTOCOM_V) return legacy === true ? admin.commercialPre : admin.commercial;
  return legacy === true ? admin.commercial : null;
}
/* the company defaults for one job type: the built-in ones, then what the admin set */
function defaultsFor(group, admin, legacy){
  const out = builtin(group, legacy);
  const a = adminFor(group, admin, legacy);
  if (a && typeof a === 'object') KEYS.forEach(function(k){ if (!LOCKED[k] && typeof a[k] === 'boolean') out[k] = a[k]; });
  return out;
}
/* what this job does: its own choices, else the defaults for its type */
function effective(p, admin){
  const out = defaultsFor(groupOf(p), admin, !(p && p.auto && typeof p.auto === 'object'));
  const own = p && p.auto && typeof p.auto === 'object' ? p.auto : null;
  if (own) KEYS.forEach(function(k){ if (!LOCKED[k] && typeof own[k] === 'boolean') out[k] = own[k]; });
  if (p && (p.importedHistory === true || p.noSend === true || p.historyOnly === true)) OPTS.forEach(function(o){ if (!LOCKED[o[0]] && /^(email|docs|portal)$/.test(o[1])) out[o[0]] = false; });   /* patch LCLEAN-H: a job imported / back-entered as history sends nothing */
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
  defaultsFor: defaultsFor, effective: effective, allows: allows, blockedKind: blockedKind, parseAdmin: parseAdmin, KV_KEY: 'jobAutoDefaults',
  isBidJob: isBidJob, isCompany: isCompany, COMM: COMM, AUTOCOM_V: AUTOCOM_V };
