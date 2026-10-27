/* ============================================================================
   bid-role.js: PRIME or SUB on a bid (patch PRIMESUB)

   Owner: "on leads i want jobs as a subcontractor and prime opportunities to be shown so cities schools etc
   from city government school website bids etc are prime, building connected planhub a and b and other plan
   rooms are typically as a sub"

     🏛 PRIME  we bid straight to the owner: a city, county, state, school district, university, MLGW / MSCAA-type
               public agency, SAM.gov / federal, a public procurement site, an owner who invites us directly
     🔧 SUB    we bid to a general contractor: BuildingConnected, PlanHub, A&B Planroom, RKA Planroom,
               iSqFt / ConstructConnect, Dodge, any other plan room, a GC's own invitation
     ''        not a bid (residential, insurance, website homeowner), or not sure. No badge: never a guess.

   ONE rule for the server (bid-inbox upsert stamps item.bidRole; lead-intake) and the CRM page (patch PRIMESUB
   inlines THIS FILE, word for word, as window._gcBidRoleCore). Works on a Lead Inbox item or a CRM lead.

   Order, first answer wins:
     0. a person's choice on the lead (bidRoleManual + bidRole 'prime' | 'sub' | 'none')
     1. not a bid: residential / insurance / restoration type, a website homeowner, a claim         → ''
     2. the source is a plan room or a GC (BuildingConnected, PlanHub, A&B, RKA, iSqFt, Dodge, "GC direct"),
        or the BuildingConnected API                                                                   → sub
     3. the source is public (Government, SAM.gov, a city / county / state / school / MLGW / MSCAA board),
        the public bid watcher, or a public-bid notice                                                 → prime
     4. who sent it: a plan room's address → sub; a .gov / .edu / .k12 / .us / public agency address → prime
     5. who the bid goes to: a GC named on it, or a contractor as the "due to" company → sub;
        a public body as the "due to" company (or as the owner with no GC) → prime
     6. a GC's e-mail: the sender is a construction company and the subject is an invitation to bid → sub
     7. the plans links: only plan rooms → sub; only public boards → prime
     8. the lead's kind is Government (and nothing above said sub)                                     → prime
     9. nothing sure                                                                                   → ''
   ============================================================================ */
(function(root){
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }

var SUB_SRC = /buildingconnected|building\s*connected|plan\s*hub|a\s*&\s*b\s*plan|aandb|\brka\b|plan\s*-?rooms?|isqft|construct\s*connect|constructconnect|\bdodge\b|bidclerk|smart\s*bid\s*net|smartbidnet|pipeline\s*suite|pipelinesuite|procore|bid\s*platform|gc\s*direct|general\s*contractor|\bgc\b/i;
var PRIME_SRC = /^government$|^gov$|sam\.gov|\bfederal\b|\bcounty\b|\bcity\s+of\b|\btown\s+of\b|\bstate\s+of\b|\bschools?\b|\bmscs\b|\bmscaa\b|\bmlgw\b|\bairport\b|housing\s+authority|universit|\bcollege\b|municipal|public\s+works|procurement|\bpublic\b|\bstream\b|\b(tn|ar|ms)\s*\((cpo|stream|building|bureau)/i;
/* a public body's name */
var PUB = /\b(city|town|village|county|parish|state|commonwealth)\s+of\b|\bcounty\b|\bschools?\b|\bschool\s+(district|system|board)\b|board\s+of\s+education|\bisd\b|universit(y|ies)\b|\bcollege\b|\bmlgw\b|\bmscaa\b|\bmscs\b|\b(airport|housing|port|transit|water|utility|park|parks)\s+(authority|district|commission)\b|utility\s+district|public\s+(works|utilit\w*|library|schools)|\bmunicipal\b|\bfederal\b|\bdepartment\s+of\b|\bdept\.?\s+of\b|\bu\.?\s?s\.?\s+(army|navy|air\s+force|department)\b|corps\s+of\s+engineers|general\s+services\s+administration|\bgsa\b|veterans\s+affairs|\bsam\.gov\b|\bgovernment\b|\bprocurement\b|purchasing\s+(dept|department|division|office)/i;
/* a company's name (a contractor) */
var CO = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|company|ltd|construction|constructors?|builders?|building\s+(group|company|co)|contracting|contractors?|general\s+contractors?|\bgc\b|enterprises|group|partners|associates|roofing|restoration|developers?|development)\b\.?/i;
var SUB_DOM = /(^|\.)(buildingconnected|planhub|aandbplanroom|rkaplanroom|isqft|constructconnect|bidclerk|cmdgroup|dodge|construction|smartbidnet|pipelinesuite|procore|bidmail|bidplanroom)\.(com|net)$/;
var PUB_DOM = /\.(gov|mil|edu)$|\.k12\.|\.us$|(^|\.)(mlgw|scsk12|flymemphis|memphistn|shelbycountytn|shelbycountybids|desotocountyms|southaven|olivebranchms|cityofsouthaven|hernandoms|ionwave|bidnetdirect|centralbidding|demandstar|bonfirehub|opengov|periscopeholdings|bidsync|questcdn)\.(com|org|net|gov|us)$/;
var OWN_DOM = /(^|\.)grayco-cs\.com$/;
var INVITE = /invitation\s+to\s+(bid|quote|propose)|\binvite\s+to\s+bid\b|\bbid\s+invit\w*|\bitb\b|\brfq\b|\brfp\b|request\s+for\s+(bids?|quotes?|proposals?|pricing)|\bbid\s+request|\bpricing\s+request|\bbidding\s+(opportunity|invitation)|\bplease\s+bid\b/i;
var NOT_BID_TYPE = /resid|home|house|kitchen|bath|insur|claim|storm|mitig|restor|water|fire|mold|careers|partner/;

function out(role, why){ return { role: role, why: why }; }
function pub(name){ name = s(name); return !!name && PUB.test(name) && !CO.test(name.replace(PUB, ' ')); }
function company(name){ name = s(name); return !!name && !pub(name) && CO.test(name); }
function domOf(addr){ var m = /@([a-z0-9.-]+)/i.exec(s(addr)); return m ? low(m[1]).replace(/\.$/, '') : ''; }
function hostOf(u){ var m = /^https?:\/\/([^/?#:]+)/i.exec(s(u)); return m ? low(m[1]) : ''; }
function srcText(x){ return [x.source, x.leadSource, x.subSource].map(s).filter(Boolean).join(' | '); }
function srcName(x){ return s(x.source || x.leadSource) || 'its source'; }

function roleOf(x){
  if (!x || typeof x !== 'object') return out('', 'nothing to read');
  /* 0. a person's choice */
  var set = low(x.bidRole);
  if (x.bidRoleManual && (set === 'prime' || set === 'sub')) return out(set, 'set by ' + (s(x.bidRoleBy) || 'a person'));
  if (x.bidRoleManual && set === 'none') return out('', 'no badge (set by ' + (s(x.bidRoleBy) || 'a person') + ')');
  /* 1. not a bid */
  var typ = low(x.leadKind || x.type), ex = x.leadExtra || {};
  var web = !!(x.websiteLead || ex.websiteLead || low(x.origin) === 'website');
  if (web && !/commerc|gov/.test(typ)) return out('', 'a website lead, not a bid');
  if (x.isInsurance || x.claimId || x.claimNumber) return out('', 'an insurance claim, not a bid');
  if (NOT_BID_TYPE.test(typ) && !/commerc|gov/.test(typ)) return out('', 'a ' + typ + ' lead, not a bid');
  /* 2. / 3. the source */
  var st = srcText(x), org = low(x.origin), kind = low(x.sourceKind);
  if (SUB_SRC.test(st)) return out('sub', 'came from ' + srcName(x) + ' (a plan room / GC)');
  if (org === 'api') return out('sub', 'came from the BuildingConnected bid board');
  if (PRIME_SRC.test(st)) return out('prime', 'came from ' + srcName(x) + ' (a public owner)');
  if (org === 'watch') return out('prime', 'found by the public bid watcher on ' + srcName(x));
  if (kind === 'public_bid') return out('prime', 'a public bid notice');
  if (kind === 'planroom_notice') return out('sub', 'a plan room notice');
  /* 4. who sent it */
  var mails = arr(x.emails), subD = '', pubD = '';
  mails.forEach(function(m){ if (!m) return; var d = domOf(m.from); if (!d || OWN_DOM.test(d)) return; if (SUB_DOM.test(d)) subD = subD || d; else if (PUB_DOM.test(d)) pubD = pubD || d; });
  [x.email, x.contact && x.contact.email, x.dueToEmail].forEach(function(a){ var d = domOf(a); if (d && !OWN_DOM.test(d) && PUB_DOM.test(d)) pubD = pubD || d; });
  if (subD && !pubD) return out('sub', 'sent from ' + subD + ' (a plan room)');
  if (pubD && !subD) return out('prime', 'from a public agency (' + pubD + ')');
  /* 5. who the bid goes to */
  var gc = s(x.gc), due = s(x.dueToCompany), owner = s(x.owner);
  if (gc && !pub(gc)) return out('sub', 'the GC is ' + gc);
  if (due && company(due) && low(due) !== low(owner)) return out('sub', 'the bid goes to ' + due + ' (a contractor)');
  if (due && pub(due)) return out('prime', 'the bid goes to ' + due + ' (the owner)');
  if (owner && pub(owner) && !gc && (!due || low(due) === low(owner))) return out('prime', 'the owner is ' + owner + ', no GC');
  /* 6. a GC's own e-mail */
  for (var i = 0; i < mails.length; i++) {
    var m = mails[i] || {}, who = s(m.fromName), subj = s(m.subject), d = domOf(m.from);
    if (/buildingconnected|planhub|plan\s*room|planroom|isqft|constructconnect/i.test(who + ' ' + subj)) return out('sub', 'a plan room e-mail');
    if (INVITE.test(subj) && d && !OWN_DOM.test(d) && (CO.test(who) || /construct|build|contract|gc\b/i.test(d.split('.')[0]))) return out('sub', 'an invitation to bid from ' + (who || d) + ' (a GC)');
  }
  /* 7. the plans links */
  var bs = {}, ln = arr(x.plansLinks);
  ln.forEach(function(l){ if (!l) return; var b = s(l.board), h = low(l.host) || hostOf(l.url); if (SUB_SRC.test(b) || SUB_DOM.test(h)) bs.sub = 1; else if (/^government$/i.test(b) || PUB_DOM.test(h)) bs.prime = 1; });
  if (bs.sub && !bs.prime) return out('sub', 'the plans are on a plan room');
  if (bs.prime && !bs.sub) return out('prime', 'the plans are on a public bid site');
  /* 8. a government lead */
  if (/gov|public|municipal|federal/.test(typ)) return out('prime', 'a government bid');
  return out('', 'not sure: no plan room, GC or public owner found');
}
function role(x){ return roleOf(x).role; }
var API = { roleOf: roleOf, role: role, isPublic: pub, isCompany: company, V: 1 };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root._gcBidRoleCore = API;
})(this);
