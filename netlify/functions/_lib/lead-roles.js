/* ═════════════════════════════════════════════════════════════════════════════
   GrayCo — LEAD ROLES: a new lead goes, by its TYPE, to the person holding that lead role.   (patch HOT2, owner 10/22)
   netlify/functions/_lib/lead-roles.js

   The roles are data, never names in code — Admin → Admin settings → 👥 Team roles & Senior PM, kept in
   gc_kv "gc_team_settings".leadRoles:
     • Senior Estimator    — commercial / government / bid invitations (EST4: _lib/estimator.js; not stored here)
     • Senior Insurance PM — insurance claims and restoration (water, fire, mold, storm damage, mitigation)  { insurancePm: { email, name } }
     • Senior Roofing PM   — roofing leads (residential, re-roof, roof repair). A COMMERCIAL roofing bid stays the
                             Senior Estimator's (the owner of the lead); the Senior Roofing PM is added as a second
                             person on it (lead.coAssignees) and gets its alerts and due reminders too.   { roofingMgr: { email, name } }
     • everything else (remodel, general residential, a website "other") — nobody: an admin assigns it
       (patch HOT1's "👤 Assign this lead" approval).
   A role that is not set, or whose person is turned off, routes nothing: the lead stays unassigned for an admin.
   Soft leads (a guide download, the giveaway), careers and partner sign-ups are never routed.

   The CRM page carries the same rules (window._gcLeadRoles, index.html) — keep the two in step.
   ═════════════════════════════════════════════════════════════════════════════ */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }

const ROLES = {
  insurance: { key: 'insurancePm', label: 'Senior Insurance PM' },
  roofing: { key: 'roofingMgr', label: 'Senior Roofing PM' }
};
const SOFT = /giveaway|guide download|lead magnet|free guide/i;
const INS_TYPE = /insur|claim|mitig|restor|water|fire|mold|storm/;
/* restoration = water, fire and storm (owner 10/22): fire, smoke, soot · water, flood, leak, mitigation, mold ·
   storm, hail, wind, tree · insurance, claim */
const INS_TEXT = /\b(fire|smoke|soot|water|flood(s|ed|ing)?|leak(s|ed|ing|y)?|mitigation|mold|mould|storm|hail|wind|tree|insurance|insured|claims?|adjuster|restoration|xactimate)\b/i;
const ROOF_TEXT = /\broof|re-?roof|shingle/i;
/* an explicit "this is not insurance" on the lead (a form's insurance question answered no) */
function notInsurance(l){ return l.isInsurance === false || l.insuranceClaim === false || /^(no|false|none)$/i.test(s(l.insurance)) || /^(no|false|none)$/i.test(s(l.leadExtra && l.leadExtra.insurance)); }

function textOf(l){
  const x = l.leadExtra || {};
  return [l.leadKind, l.type, l.title, l.name, l.scope, l.service, l.form, l.subject, l.message, x.form, x.type, x.message].concat(arr(l.trades)).concat(arr(l.notes).slice(0, 3)).map(s).join(' | ');
}
/* 'bid' | 'insurance' | 'roofing' | '' (nobody: an admin assigns it) */
function classify(l, isBid){
  if (!l) return '';
  if (l.softLead || (l.leadExtra && l.leadExtra.softLead) || SOFT.test(s(l.source)) || /^(careers|partner)$/i.test(s(l.type))) return '';
  if (typeof isBid === 'function' && isBid(l)) return 'bid';
  const typ = low(l.leadKind || l.type);
  if (/commerc|gov/.test(typ)) return 'bid';
  if (l.isInsurance || l.claimId || l.claimNumber) return 'insurance';
  const tx = textOf(l), roof = /roof|shingle/.test(typ) || ROOF_TEXT.test(tx);
  if (INS_TYPE.test(typ) || INS_TEXT.test(tx)) return roof && notInsurance(l) ? 'roofing' : 'insurance';   /* storm + roof: the lead's own insurance answer decides; none → insurance (the Senior Roofing PM is told too: coRole) */
  if (roof) return 'roofing';
  return '';
}
/* the second person a lead also goes to: the Senior Roofing PM on a commercial roofing bid, and on a restoration lead
   that is about a roof (storm / water + roof) — they get its alerts and reminders too */
/* patch SPAMROLE (owner 10/23: "he shouldn't get any of those unless they are roofing"): only a commercial ROOFING bid
   adds the Senior Roofing PM; an insurance / restoration lead stays the Senior Insurance PM's alone */
function coRole(l, kind){ return kind === 'bid' && roofBid(l) ? 'roofing' : ''; }
/* a bid that IS roofing work: its type says roofing, its title / subject names a roof job (not rooftop units, roof
   drains, hatches…), or every trade / bid package it asks for is roofing. "Roof" somewhere in a whole-building
   invite does not make it a roofing bid. */
const ROOF_EXCL = /\broof\s?-?top\s+(units?|equipment|hvac|mechanical|chillers?)|\brtus?\b|\broof\s+(drains?|hatch(es)?|access|ladders?|curbs?|penetrations?|screens?)/ig;
const ROOF_TRADE = /roof|shingle|gutter/i;
function roofBid(l){
  if (!l) return false;
  if (/roof|shingle/.test(low(l.leadKind || l.type))) return true;
  const direct = s(l.origin) === 'website' || !!l.websiteLead || !!(l.leadExtra && l.leadExtra.websiteLead) || /^(referral|partner|phone|walk-?in)$/i.test(s(l.origin));   /* a customer's own request (the website's commercial form): their words count */
  const head = [l.title, l.name, l.subject, l.service].concat(direct ? [l.message, l.scope, l.leadExtra && l.leadExtra.message] : []).map(s).join(' | ').replace(ROOF_EXCL, ' ');
  if (ROOF_TEXT.test(head)) return true;
  const tr = arr(l.trades).map(s).filter(Boolean);
  return tr.length > 0 && tr.every(t => ROOF_TRADE.test(t));
}
/* the lead's second people as the alerts / scope see them: an automatic Senior Roofing PM entry counts only while the
   lead is a roofing bid (older leads got one for any "roof" in the text, or for a storm / water lead) */
function insLead(l){ return !!l && (s(l.leadRole) === 'insurance' || !!l.isInsurance || !!l.claimId || !!l.claimNumber || INS_TYPE.test(low(l.leadKind || l.type))); }
function coList(l){ return arr(l && l.coAssignees).filter(c => c && (c.role !== 'roofing' || (roofBid(l) && !insLead(l)))); }
/* roofing work, whatever the type (a commercial roofing bid too) */
function isRoofing(l){ return !!l && (/roof|shingle/.test(low(l.leadKind || l.type)) || ROOF_TEXT.test(textOf(l))); }
function isActive(u){
  return !!u && u.active !== false && u.departed !== true && u.fired !== true && u.deleted !== true && u._deleted !== true && u.tombstoned !== true
    && !/^(terminated|inactive|former|departed|fired)$/i.test(s(u.status));
}
function roleSetting(team, kind){
  const r = ROLES[kind]; if (!r) return null;
  let t = team; if (typeof t === 'string') { try { t = JSON.parse(t); } catch (e) { t = null; } }
  const h = t && t.leadRoles && t.leadRoles[r.key];
  return h && (s(h.email) || s(h.name)) ? { email: low(h.email), name: s(h.name) } : null;
}
/* the person who gets a lead of this kind: { name, email, label } — null when the role is unset or that person is off */
function holder(kind, team, users){
  const r = ROLES[kind], h = roleSetting(team, kind); if (!r || !h) return null;
  const u = arr(users).find(x => x && ((h.email && low(x.email) === h.email) || (!h.email && low(x.name) === low(h.name))));
  if (!u || !isActive(u)) return null;
  return { name: s(u.name), email: low(u.email), label: r.label };
}
/* what Admin shows: { insurance: { set, ok, name, why }, roofing: … } — "unset" is an info line, not an error */
function state(team, users){
  const out = {};
  Object.keys(ROLES).forEach(k => {
    const h = roleSetting(team, k);
    if (!h) { out[k] = { set: false, ok: false, why: 'unset', label: ROLES[k].label }; return; }
    const u = arr(users).find(x => x && ((h.email && low(x.email) === h.email) || (!h.email && low(x.name) === low(h.name))));
    out[k] = { set: true, ok: !!u && isActive(u), why: !u ? 'missing' : !isActive(u) ? 'inactive' : '', name: s(u ? u.name : h.name), label: ROLES[k].label };
  });
  return out;
}
/* patch LROLEVIEW (owner 10/23): which leads a person works — by profile / role and the lead roles, never by name:
   admin, office → all · estimator → bids (commercial / government / bid invitations) · insurance / mitigation profile or the
   Senior Insurance PM → insurance & restoration · a roofing profile or the Senior Roofing PM → roofing (storm roofs too) ·
   anyone else → only the leads assigned to them. A lead assigned or co-assigned to the person is always theirs. */
function scopeFor(person, team, users){
  const p = person || {}, x = low([p.profile, p.role, p.title].map(s).join(' ')), me = low(p.email), nm = low(p.name);
  const roles = p.roles || {};
  if (roles.admin || /\badmin|owner/.test(x)) return 'all';
  if (roles.office || /office/.test(x)) return 'all';
  if (roles.estimator || /estimat/.test(x)) return 'bids';
  if (roles.insurance || roles.mitigation || /insur|mitig/.test(x)) return 'insurance';
  if (/roof/.test(x)) return 'roofing';
  const is = h => !!h && ((me && low(h.email) === me) || (nm && low(h.name) === nm));
  if (is(holder('insurance', team, users))) return 'insurance';
  if (is(holder('roofing', team, users))) return 'roofing';
  return 'mine';
}
function assignedTo(l, p){
  const me = low(p && p.email), nm = low(p && p.name); if (!me && !nm) return false;
  const hit = v => { v = low(v); return !!v && (v === me || v === nm); };
  return [l.pm, l.estimator, l.apm, l.assignee, l.assignedTo, l.pmEmail, l.estimatorEmail].some(hit) || coList(l).some(c => c && (hit(c.name) || hit(c.email)));   /* patch SPAMROLE */
}
function inScope(l, scope, person, isBid){
  if (!l) return false;
  if (scope === 'all') return true;
  if (person && assignedTo(l, person)) return true;
  const k = classify(l, isBid);
  if (scope === 'bids') return k === 'bid';
  if (scope === 'insurance') return k === 'insurance';
  if (scope === 'roofing') return k === 'roofing' || (k === 'bid' ? roofBid(l) : isRoofing(l));   /* patch SPAMROLE: a bid only when it is a roofing bid */
  return false;
}
module.exports = { ROLES, classify, coRole, isRoofing, roofBid, coList, holder, state, roleSetting, scopeFor, inScope, assignedTo, TEAM_KEY: 'gc_team_settings' };
