/* GrayCo — the customer's OWN insurance company (patch BIDSITE3 G, owner 11/20).
   Owner: the customer's own carrier name may be shown everywhere the customer sees their own claim — invoices, statements, papers to
   sign, selections / walkthrough copies, maintenance plans (portal / e-mail / PDF). Still hidden: another carrier's name (the
   common-carrier list), a TPA / program / adjusting company, sub names, internal notes and prices; PUBLIC marketing / social posts never
   name a carrier (they do not use this).
   own(p, claims)          → the job's own carrier names (its carrier fields + its claims' carriers)
   exceptOwn(re, ownList)  → the common-carrier RegExp that skips the customer's own carrier ("State Farm" stays when it is theirs) */
'use strict';
const FIELDS = ['insCarrier', 'carrier', 'insurer', 'insuranceCompany', 'insuranceCarrier', 'insCompany', 'insuranceCo', 'carrierName'];
function s(v){ return v == null ? '' : String(v).trim(); }
function own(p, claims){
  const out = [];
  FIELDS.forEach(function(k){ const v = s(p && p[k]); if (v.length >= 3 && out.indexOf(v) < 0) out.push(v); });
  (Array.isArray(claims) ? claims : []).forEach(function(c){ if (c && c.deleted !== true && s(c.projectId) === s(p && p.id) && s(c.carrier).length >= 3 && out.indexOf(s(c.carrier)) < 0) out.push(s(c.carrier)); });
  return out;
}
function exceptOwn(re, ownList){
  const alts = (ownList || []).map(s).filter(function(x){ return x.length >= 3; })
    .map(function(x){ return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'); });
  const flags = (re.flags || 'gi').indexOf('g') < 0 ? re.flags + 'g' : re.flags;
  if (!alts.length) return new RegExp(re.source, flags);
  const src = re.source.indexOf('\\b') === 0 ? '\\b(?!(?:' + alts.join('|') + ')\\b)' + re.source.slice(2) : '(?!(?:' + alts.join('|') + ')\\b)' + re.source;
  return new RegExp(src, flags);
}
module.exports = { FIELDS, own, exceptOwn };
