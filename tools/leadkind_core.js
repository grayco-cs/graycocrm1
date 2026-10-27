/* patch LEADKIND (owner 10/27): a LEAD's type follows the same rule as a job's (AUTOCOM). A lead from a bid site / public
   bid / BuildingConnected / PlanHub / a GC's invitation, or for a government / public owner (county, city, state, federal,
   municipal, fire station, park, school, church …) is COMMERCIAL; PROGRAM work is INSURANCE; anything else stays as it is
   (a homeowner's estimate may well be residential). Never turns a commercial / government / insurance lead into anything
   else. h = what only the page knows: { estGc, estClient, estName, estType, jobGroup } from the lead's estimate and job.
   Returns null (no automatic answer) or { kind: 'Commercial' | 'Insurance', why }. Same code on the page and the server. */
var LK_PUB_STRONG = /\b(county|counties|city of|town of|village of|state of|parish of|commonwealth of|fire (station|stations|dept|department|district|hall|house|rescue)|police|sheriff|public works|public schools?|schools?|school district|board of education|elementary|high school|middle school|universit(y|ies)|community college|municipal|municipality|federal|government|gov't|govt|courthouse|housing authority|airport authority|utility district|water district|parks? (and|&) rec\w*|(state|national|city|county|memorial|regional|community|public|farms) parks?|parks? (district|operations?|commission|conservancy|authority|board|maintenance|pavilion|restrooms?|shelter)|army corps|national guard|mscs|mscaa|mlgw)\b/i;
var LK_PUB_SOFT = /\b(church|baptist|methodist|presbyterian|lutheran|catholic|ministr(y|ies)|parish|cathedral|synagogue|mosque|temple|college|academy|library|recreation center|community center)\b/i;
var LK_PROG = /\bprogram\b/i, LK_NOT_PROG = /referr|loyalty|reward|ambassador|partner program|newsletter|giveaway|maintenance program|care program|warranty/i;
var LK_BID_SRC = /\bbids?\b|bidding|\bitb\b|\brfp\b|\brfq\b|solicit|invitation to bid|county|city of|state of|\bmscs\b|mscaa|mlgw|bid ?board|buildingconnected|building connected|planhub|plan hub|plan ?room|sam\.gov|isqft|construct ?connect|procurement|tn stream|arbuy|ion ?wave|opengov|central bidding|bidnet|bonfire|periscope|public works|general contractor|\bgc\b/i;
function lkS(v){ return v == null ? '' : (typeof v === 'object' ? '' : String(v).trim()); }
var LK_AFTER_STREET = /^(line\s+|club\s+)?(rd|road|st|street|ave|avenue|dr|drive|ln|lane|blvd|boulevard|way|ct|court|cv|cove|pl|place|pkwy|parkway|cir|circle|hwy|highway|trl|trail|loop|xing|pike)\b/i;
function lkHit(rx, v, soft){
  var g = new RegExp(rx.source, 'gi'), m;
  while ((m = g.exec(v))) {
    var after = v.slice(m.index + m[0].length).trim();
    if (LK_AFTER_STREET.test(after)) continue;                         /* "County Line Rd", "School St", "Church Ave": a street, not an owner */
    if (soft) {                                                         /* a soft word (church, college …) only in an organisation's name */
      var words = v.split(/\s+/).filter(Boolean);
      if (words.length < 3 || /^\d/.test(v)) continue;                 /* "Jim Church", "12 Church …" */
    }
    return m[0];
  }
  return '';
}
function lkPublic(v){ v = lkS(v); if (!v) return ''; return lkHit(LK_PUB_STRONG, v, false) || lkHit(LK_PUB_SOFT, v, true); }
function leadKindOf(l, h){
  if (!l || typeof l !== 'object') return null;
  h = h || {};
  var cur = (lkS(l.leadKind) + ' ' + lkS(l.type)).toLowerCase();
  if (l.isInsurance === true || lkS(l.claimId) || lkS(l.claimNumber) || /insur|claim|mitig|restor|water|fire dam|storm|program/.test(cur)) return null;   /* already insurance / program */
  var work = [l.projectType, l.jobType, l.category, l.leadType].map(lkS).join(' ');
  if (LK_PROG.test(work + ' ' + cur) && !LK_NOT_PROG.test(work + ' ' + cur)) return { kind: 'Insurance', why: 'program work' };
  var src = [l.source, l.leadSource, l.subSource, l.sourceDetail].map(lkS).join(' ');
  if (LK_PROG.test(src) && !LK_NOT_PROG.test(src) && !/commerc|gov/.test(cur)) return { kind: 'Insurance', why: 'program work (' + src.trim().slice(0, 40) + ')' };
  if (h.jobGroup === 'insurance' || h.jobGroup === 'program') { if (!/commerc|gov/.test(cur)) return { kind: 'Insurance', why: 'its job is ' + h.jobGroup }; }
  if (/commerc|gov|public|municipal|federal/.test(cur)) return null;   /* already commercial / government */
  if (/commercial|\bTI\b|tenant|church|school|government|municipal/i.test(work)) return { kind: 'Commercial', why: 'job type "' + work.trim().slice(0, 40) + '"' };
  var web = l.websiteLead === true || l.origin === 'website' || !!(l.leadExtra && l.leadExtra.websiteLead);
  if (!web && LK_BID_SRC.test(src)) return { kind: 'Commercial', why: 'from a bid source (' + src.trim().slice(0, 40) + ')' };
  if (lkS(l.gc) || lkS(l.dueToCompany) || lkS(l.bidNumber)) return { kind: 'Commercial', why: 'a GC / public bid (' + (lkS(l.gc) || lkS(l.dueToCompany) || 'bid #' + lkS(l.bidNumber)).slice(0, 40) + ')' };
  var names = [l.name, l.title, l.company, l.client, l.owner, l.ownerName, h.estClient, h.estName];
  for (var i = 0; i < names.length; i++) { var w = lkPublic(names[i]); if (w) return { kind: 'Commercial', why: 'public owner ("' + w + '")' }; }
  if (lkS(h.estGc)) return { kind: 'Commercial', why: 'its estimate is for a GC (' + lkS(h.estGc).slice(0, 40) + ')' };
  if (/commercial|\bTI\b|tenant|government|municipal/i.test(lkS(h.estType))) return { kind: 'Commercial', why: 'its estimate type "' + lkS(h.estType).slice(0, 30) + '"' };
  if (h.jobGroup === 'commercial') return { kind: 'Commercial', why: 'its job is commercial' };
  return null;
}
