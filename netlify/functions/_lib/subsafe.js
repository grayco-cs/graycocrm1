/* netlify/functions/_lib/subsafe.js — patch SUBPORTAL3: job text a SUB sees never carries the insurance carrier or a claim number.
   Real job names look like "Everett Stephens Roof Damage-Grange Insurance claim #ZHM003927535" or
   "Alex Thomas — Water Damage (…) Claim #10000833553"; a sub sees "Everett Stephens Roof Damage" / "Alex Thomas — Water Damage (…)".
   Used by portal-access.js (the sub portal) and sub-photos.js. Over-removing a word of a job name is fine; leaking a carrier is not. */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
const OWN = ['insCarrier', 'carrier', 'insurer', 'insuranceCompany', 'insuranceCarrier', 'insCompany', 'claimNumber', 'claimNo', 'claim', 'policyNumber', 'policyNo', 'adjuster', 'adjusterName'];
/* carriers named on their own; a word that is also an ordinary word or a street (Farmers, Travelers, Hartford, Nationwide …) only
   with "Insurance" / "Mutual" after it (GENERIC) */
const CARRIERS = /\b(state\s*farm|allstate|usaa|liberty\s*mutual|geico|chubb|safeco|auto[\s-]*owners|homesite|metlife|amica|kemper|foremost|assurant|stillwater|grange|farm\s+bureau|american\s+family|universal\s+property|citizens\s+property|american\s+strategic|swyfft)(\s+(insurance|ins\.?|mutual|casualty|indemnity|group|company|co\.?|exchange))*/gi;
const GENERIC = /\b[A-Z][a-zA-Z&.']+\s+(?:Insurance|Mutual|Assurance|Indemnity|Casualty)(?:\s+(?:Company|Co\.?|Group|Exchange))?\b/g;
const CLAIM = /\b(?:ins(?:urance)?\.?\s+)?(?:claim|policy)\s*(?:#|no\.?|num(?:ber)?\.?)?\s*:?\s*#?\s*(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,}/gi;
const EMPTY = /\b(?:ins(?:urance)?\.?\s+)?(?:claim|policy)\s*(?:#|no\.?|num(?:ber)?\.?)\s*:?\s*(?=$|[\s,)\u2014\u2013-])/gi;   /* "claim #" whose number was the job's own claimNumber */
const BARE = /#\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{7,}\b/g;   /* "… #ZHM003927535" left after a carrier word */
function clean(text, p, addr){
  let t = s(text); if (!t) return '';
  if (p && typeof p === 'object') OWN.forEach(function(k){ const w = s(p[k]); if (w.length >= 3) t = t.split(w).join(' '); });
  if (!addr) t = t.replace(CARRIERS, ' ').replace(GENERIC, ' ');   /* an address keeps its street names */
  t = t.replace(CLAIM, ' ').replace(BARE, ' ').replace(EMPTY, ' ').replace(/(^|\s)#(?=\s|$)/g, ' ');
  t = t.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(/\s*([—–-]\s*)+$/g, '').replace(/^\s*[—–-]+\s*/, '').replace(/\s+([,)])/g, '$1').trim();
  return t;
}
/* a job as the sub portal reads it: the same object with a clean name and address (never written back) */
function job(p){ if (!p || typeof p !== 'object') return p; const o = Object.assign({}, p); o.name = clean(p.name, p) || 'Job'; if (p.address) o.address = clean(p.address, p, true); if (p.jobAddress) o.jobAddress = clean(p.jobAddress, p, true); return o; }
module.exports = { clean, job };
