/* ============================================================================
   envwords.js — the ☢️ abatement / mold words every automatic lead scanner looks for (patch LEADBOTH).
   Owner 11/12: "in the automatic leads I want to see asbestos and mold leads" · "scan for those words."
   One list for the server side: the bid e-mail intake (bid-inbox.js), the public-bid construction gate
   (_lib/bid-filter.js) and the permit scan (_lib/permits.js). A text with one of these is kept as a lead
   (never dropped as "not construction" / "not a bid"), and tagged envScope so the CRM lists it on the
   Environmental Leads page (a GC / public bid one also stays on Construction — the CRM's _gcCo.leadCos).
   The Sales & spam guard (_lib/salesguard.js SG_ENV) carries the same words inside its verbatim rules block.
   ========================================================================== */
'use strict';
/* the words, for screens and notes */
const WORDS = ['asbestos', 'ACM (asbestos-containing material)', 'abatement', 'lead paint', 'lead-based paint', 'LBP', 'lead abatement', 'RRP',
  'mold', 'mold remediation', 'microbial', 'hazmat', 'hazardous materials survey', 'environmental remediation', 'demolition with abatement'];
/* abatement that is not ours (mosquitoes, weeds, taxes …) never counts */
const NEUTRAL = /\b(mosquito|pest|weed|noise|tax|nuisance|odou?r|dust|rodent|vector|graffiti|fly|flies)\s+abatement\b|\b(injection|plastic|blow|die|casting|concrete|cake|candle|silicone|rubber)\s+mou?lds?\b|\bmou?lds?\s+(injection|making|maker|base|release|press)\b/gi;
const RX = [
  ['asbestos', /\basbestos\b/i],
  ['ACM', /\bACMs?\b|\basbestos[\s-]+containing\b/],
  ['lead-based paint', /\blead[\s-]*(based\s+)?paint\b|\bLBP\b/i],
  ['lead abatement', /\blead\s+(abatement|hazard|remediation|inspection|risk\s+assessment|testing|removal|safe)\b/i],
  ['RRP', /\bRRP\b/],
  ['mold', /\bmou?ld\s+(remediation|abatement|removal|assessment|testing|inspection|survey)\b|\bmou?ld\b/i],
  ['microbial', /\bmicrobial\b/i],
  ['hazmat', /\bhaz[\s-]?mat\b|\bhazardous\s+(materials?|building\s+materials?)\b/i],
  ['environmental remediation', /\benvironmental\s+(remediation|abatement|survey|services\s+-\s+abatement)\b/i],
  ['demolition with abatement', /\bdemolition\s+(with|and|&)\s+abatement\b|\babatement\s+(and|&)\s+demolition\b/i],
  ['abatement', /\babatement\b/i]
];
function s(v){ return v == null ? '' : String(v); }
/* → the words found (short names), [] when none */
function hits(text){ const t = s(text).replace(NEUTRAL, ' '); const out = []; RX.forEach(r => { if (r[1].test(t) && out.indexOf(r[0]) < 0) out.push(r[0]); }); return out; }
function test(text){ return hits(text).length > 0; }
const TAG = '☢️ Abatement / mold';
/* stamp a lead / inbox record: envScope + envWords + the ☢️ tag (only when a word is found; never removes a tag) */
function tag(rec, text){
  if (!rec) return rec; const h = hits(text); if (!h.length) return rec;
  rec.envScope = true; rec.envWords = h.slice(0, 8);
  const t = Array.isArray(rec.tags) ? rec.tags.slice() : []; if (t.indexOf(TAG) < 0) t.push(TAG); rec.tags = t;
  return rec;
}
module.exports = { WORDS, RX, NEUTRAL, TAG, hits, test, tag };
