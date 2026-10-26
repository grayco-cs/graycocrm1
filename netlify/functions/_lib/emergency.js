/* ============================================================================
   GrayCo — EMERGENCY LEAD ROUTING (patch SMSROUTE · EMERG).   netlify/functions/_lib/emergency.js

   Owner 10/24: an emergency lead (flooding, water, leak, tree on the house / roof, fire, smoke, storm damage) goes to the
   ON-CALL PM (💧 Mitigation → 📟 On call) + the admins + the office, every time, from every source (texts, missed calls,
   the website, leads@ e-mails, the "Text us" page): a phone push, a 🔴 ASAP to-do and an e-mail. Nobody on call this week →
   the Senior Insurance PM + the admins + the office. This replaces the earlier "Senior Insurance PM only" emergency
   routing; the lead roles (SPAMROLE) still decide everything that is not an emergency.
   Pure: bid-alerts.js (the one new-lead alert every source goes through) and missed-call.js use it.
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
const X = require('./x10.js');
/* on top of the on-call list's words (x10.EMERG): storm damage, a tree on the house / roof, a leak, smoke, water coming in */
const MORE = /(storm\s*damage|hail\s*damage|wind\s*damage|tree\s*(fell|fallen|down|hit|came\s*down|went)?\s*(on|onto|through|into)\s*(my|the|our|a)?\s*(roof|house|home)|\bleak(s|ing|ed)?\b|\bsmoke\b|water\s*(is\s*)?(coming|pouring|everywhere|in\s*(my|the|our))|\bflood(ed|ing)?\b)/i;
const NOT = /fire\s*station|fire\s*dept|fire\s*department|firehouse|fire\s*alarm\s*(system|contract)|fire\s*sprinkler\s*(system|contract)|leak\s*test/i;
function textOf(it){
  const c = it && it.contact && typeof it.contact === 'object' ? it.contact : {};
  return [it.type, it.leadKind, it.title, it.detail, it.websiteForm, it.form, it.service, it.message, it.scope, it.notes, it.urgency, c.message].map(s).join(' ');
}
function isEmergency(it){
  if (!it) return false;
  if (it.emergency === true || /^emergency$/i.test(s(it.urgency))) return true;
  if (/commercial|government|bid/i.test(s(it.type || it.leadKind)) && !/emergenc/i.test(s(it.title) + ' ' + s(it.detail))) return false;   /* a bid that mentions a roof leak is not an emergency */
  const t = textOf(it);
  if (NOT.test(t) && !/emergenc|house\s*fire|fire\s*damage|smoke\s*damage|water\s*damage/i.test(t)) return false;
  return X.isEmergency(it) || MORE.test(t);
}
/* patch OWNER4 (owner 10/26) — which emergencies are MITIGATION emergencies.
   Mitigation = water, flood, leak, burst pipe, sewage, mold, fire / smoke / soot, and storm-damage dry-out (water that got in).
   A fallen tree or storm / hail / wind damage ON ITS OWN is a GENERAL emergency; it becomes mitigation only when the text also
   says water came in (a leak, water coming in, a wet ceiling, a dry-out ...). Anything else that is an emergency is general. */
const MIT_WATER = /(water\s*damage|water\s*(is\s*)?(coming|pouring|everywhere|running|leaking|intrusion|inside|in\s*(my|the|our))|\bflood(ed|ing|s)?\b|\bburst\b|broken\s*pipe|pipe\s*(burst|broke|leak)|\bsewage\b|sewer\s*(back|overflow)|standing\s*water|\bleak(s|ing|ed|y)?\b|dry[\s-]*out|\bmou?ld\b|\bmitigation\b|ceiling\s*(is\s*)?(leak|drip|collaps|fall|sagg|wet)|wet\s*(carpet|drywall|insulation|floor|ceiling|attic)|\bwater\b.*\b(roof|ceiling|attic|wall|floor|house|home|basement)\b|\b(roof|ceiling|attic|wall|floor|basement)\b.*\bwater\b|\bplumbing\s*(leak|burst|break))/i;
const MIT_FIRE = /(\bfire\b|\bsmoke\b|\bsoot\b|house\s*fire|burn(ed|t)\s*(down|out)?)/i;
function isMitigation(it){
  if (!it || !isEmergency(it)) return false;
  const t = textOf(it) + ' ' + s(it.jobType) + ' ' + s(it.causeOfLoss);
  if (/^(water|fire|mold|mitigation)$/i.test(s(it.jobType))) return true;
  const fireOk = MIT_FIRE.test(t) && !(NOT.test(t) && !/house\s*fire|fire\s*damage|smoke\s*damage/i.test(t));
  return MIT_WATER.test(t) || fireOk;
}
/* who hears (patch OWNER4): the on-call PM (else the Senior Insurance PM) + the office (the "Lead & bid alert e-mails go to:" setting);
   a MITIGATION emergency also goes to the "Mitigation emergencies also go to:" setting (default Nick + Wesley) and the mitigation
   manager(s). NOT every admin / OWNER_EMAILS. The CRM lead itself is the Lead Inbox record (already created). */
function people(o){
  o = o || {};
  const lead = o.oncall && o.oncall.email ? { name: s(o.oncall.name), email: low(o.oncall.email), why: 'on call' }
    : o.insurance && o.insurance.email ? { name: s(o.insurance.name), email: low(o.insurance.email), why: 'Senior Insurance PM (nobody on call)' } : null;
  const office = (o.office || []).map(low).filter(Boolean);
  const mit = o.mitigation ? (o.mitigation || []).map(low).filter(Boolean) : [];
  const ok = e => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e || '');
  const to = Array.from(new Set([lead && lead.email].concat(office.length ? office : ['office@grayco-cs.com'], mit).filter(ok)));
  return { lead, to, mitigation: !!o.mitigation };
}
const MIT_DEFAULT = ['nthomas@grayco-cs.com', 'wjohnson@grayco-cs.com'];
/* the mitigation manager from the user list: an active person whose role / title / profile says mitigation + manager / lead */
function mitigationMgrs(users){
  return (Array.isArray(users) ? users : []).filter(u => u && u.email && u.active !== false && !/disabled|inactive|offboard/i.test(s(u.status))
    && /mitig/i.test([u.role, u.title, u.profile, u.position].map(s).join(' ')) && /manag|lead|supervis|director|chief/i.test([u.role, u.title, u.profile, u.position].map(s).join(' '))).map(u => low(u.email));
}
function officeOf(users){
  return (Array.isArray(users) ? users : []).filter(u => u && u.email && /office/i.test(s(u.role)) && !/^admin$/i.test(s(u.role)) && u.active !== false && !/disabled|inactive|offboard/i.test(s(u.status))).map(u => low(u.email));
}
module.exports = { isEmergency, isMitigation, people, officeOf, mitigationMgrs, MIT_DEFAULT, MORE };
