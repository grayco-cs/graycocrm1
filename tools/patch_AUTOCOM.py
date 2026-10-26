#!/usr/bin/env python3
"""Idempotent patch AUTOCOM: commercial / bid jobs start with commercial automation defaults (patch JA's box).

Owner 10/26: the "⚙ Automations — <job>" box defaults everything ON. For COMMERCIAL jobs and jobs that came from BIDS
(GCs, BuildingConnected / PlanHub, public bid sites, bid leads) start with what a GC wants: no customer portal, no
welcome / schedule / progress / invoice / reminder / thank-you / review / checkup / newsletter mail, no contract or
FAQ packet; photos, calendar, walkthrough checklist and sub scopes stay on, and the Google Doc + proposal is off.
Residential, insurance, roof, program and every other type keep the old all-on table.

Bug: a bid-derived job ("Hyatt Studios", found on a city public bid site) was labelled "Residential job". The job
type rule now also reads: the job / lead type / category, where the job came from (Bids -> Won, a bid lead in the
Lead Inbox / public-bid watcher / BuildingConnected / PlanHub, a bid date or number, a bid-board / GC source) and the
customer (the customer record says GC / commercial, the job has a company, or the name is a company's). A job whose
type says residential / home / kitchen / bath / addition / roof stays residential unless it came from a bid;
insurance and program work are decided first, as before.

Saved Admin defaults: the residential / insurance / program maps apply as before. A commercial map saved before this
patch (no commercialV) keeps applying to the old commercial jobs that have no choices of their own, not to new ones;
saving the commercial defaults after this patch stamps commercialV = 2 and keeps the earlier map as commercialPre.
A job made before this patch with no choices of its own keeps doing what it did (legacy table).

The server copy is netlify/functions/_lib/job-auto.js (same rule and table).
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch AUTOCOM v1 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

# ---- 1. the job type rule, the commercial table, the hints the page knows ----------------------------------------
OLD_GROUP = r"""function groupOf(p){
  p = p || {};
  var t = s(p.type) + ' ' + s(p.jobType);
  if (p.isInsurance === true || (p.isInsurance !== false && /insurance|claim|fire damage|water damage|storm|restoration|mitigation/i.test(t))) return 'insurance';
  if (/program/i.test(t)) return 'program';
  if (/commercial|\bTI\b|tenant|church|school/i.test(t)) return 'commercial';
  return 'residential';
}
function builtin(g){
  var out = {};
  OPTS.forEach(function(o){ var d = o[4]; out[o[0]] = (d && typeof d === 'object') ? (g in d ? !!d[g] : !!d.other) : !!d; });
  return out;
}
"""
NEW_GROUP = MARK + r"""
/* patch AUTOCOM (owner 10/26): commercial jobs and jobs from bids start with what a GC wants (no portal, no welcome /
   marketing / review mail, no invoice e-mails); every other type keeps the all-on table. Same code as
   netlify/functions/_lib/job-auto.js. */
var AUTOCOM_V = 2;
var COMM = { gdoc: false, portalLink: false, portalInvite: false, showCarrier: false, portalSelections: false,
  welcome: false, scheduleUpdates: false, apptAuto: false, progressPosts: false, docsNotice: false, invoiceEmail: false,
  paymentReminders: false, finalReminders: false, thankYou: false, reviewRequest: false, yearlyCheckup: false,
  contractSign: false, faqPacket: false, newsletter: false };
var BID_SRC = /\bbids?\b|bidding|\bitb\b|\brfp\b|\brfq\b|solicit|invitation to bid|county|city of|state of|\bmscs\b|mscaa|mlgw|bid ?board|buildingconnected|building connected|planhub|plan hub|plan ?room|sam\.gov|isqft|construct ?connect|procurement|tn stream|arbuy|ion ?wave|opengov|central bidding|bidnet|bonfire|periscope|public works|general contractor|\bgc\b/i;
var CO_RX = /\b(LLC|L\.L\.C|Inc|Incorporated|Corp|Corporation|Company|Co|Ltd|LP|LLP|PLLC|Construction|Constructors|Contracting|Contractors?|Builders|General Contractors?|Development|Developers|Properties|Holdings|Management|Partners|Group|Enterprises|Hospitality|Church|School|University|District|County|City of|Authority|Bank|Hotels?)\b/i;
function isBidJob(p, h){
  p = p || {};
  if (p.fromBid === true || p.bidJob === true || s(p.bidId) || s(p.bidNumber) || s(p.bidDue) || s(p.preBid)) return true;
  if (h && h.bidLead) return true;
  if (/^(email|watch|api|partner-bid)$/.test(s(p.leadOrigin))) return true;
  return BID_SRC.test([p.leadSource, p.source, p.subSource, p.leadOrigin].map(s).join(' '));
}
function isCompany(p, h){
  if (h && /\b(gc|general|commercial|business|company|government|gov)\b/i.test(s(h.custType))) return true;
  if (s(p.company) && !/^(n\/a|none|-+)$/i.test(s(p.company))) return true;
  return CO_RX.test(s(p.client)) || CO_RX.test(s(p.gc));
}
function groupCore(p, h){
  p = p || {};
  var t = s(p.type) + ' ' + s(p.jobType);
  if (p.isInsurance === true || (p.isInsurance !== false && /insurance|claim|fire damage|water damage|storm|restoration|mitigation/i.test(t))) return 'insurance';
  if (/program/i.test(t)) return 'program';
  var t2 = t + ' ' + [p.category, p.projectType, p.leadType, p.leadKind].map(s).join(' ');
  if (/commercial|\bTI\b|tenant|church|school|government|municipal/i.test(t2)) return 'commercial';
  if (isBidJob(p, h)) return 'commercial';
  if (/resid|home|house|kitchen|bath|addition|roof|deck|fence/i.test(t2)) return 'residential';
  if (isCompany(p, h)) return 'commercial';
  return 'residential';
}
/* what only the page knows: the customer record's type, and whether the job's lead is a bid (patch HOT2's rule) */
var HM = {}, HMAt = 0;
function hintsFor(p){
  if (!p || (!p.client && !p.leadId)) return null;
  var n = Date.now(); if (n - HMAt > 15000) { HM = {}; HMAt = n; }
  var key = s(p.id) + '|' + low(p.client) + '|' + s(p.leadId);
  if (Object.prototype.hasOwnProperty.call(HM, key)) return HM[key];
  var h = null;
  try {
    var c = low(p.client);
    if (c) { var cu = arr(W._crm && W._crm.customers).filter(function(x){ return x && low(x.name) === c; })[0]; if (cu && s(cu.type)) h = { custType: s(cu.type) }; }
    if (p.leadId && typeof W._gcIsBidLead === 'function') {
      var ls = arr(W._crm && W._crm.leads); try { if (typeof W._gcLaLeads === 'function') ls = ls.concat(arr(W._gcLaLeads())); } catch (e) {}
      var l = ls.filter(function(x){ return x && String(x.id) === String(p.leadId); })[0];
      if (l && W._gcIsBidLead(l)) (h = h || {}).bidLead = true;
    }
  } catch (e) {}
  HM[key] = h; return h;
}
function groupOf(p){ return groupCore(p, hintsFor(p)); }
/* legacy === true: a job made before AUTOCOM with no choices of its own keeps doing what it did */
function builtin(g, legacy){
  var out = {};
  OPTS.forEach(function(o){ var d = o[4]; out[o[0]] = (d && typeof d === 'object') ? (g in d ? !!d[g] : !!d.other) : !!d; });
  if (g === 'commercial' && legacy !== true) Object.keys(COMM).forEach(function(k){ out[k] = COMM[k]; });
  return out;
}
"""
src = once(src, OLD_GROUP, NEW_GROUP)

# ---- 2. the admin map per type (an old commercial map stays with the old commercial jobs) -------------------------
OLD_DEF = """function defaultsFor(g){
  var out = builtin(g), a = ADMIN && ADMIN[g];
  if (a && typeof a === 'object') KEYS.forEach(function(k){ if (!LOCKED[k] && typeof a[k] === 'boolean') out[k] = a[k]; });
  return out;
}
function setDefaults(g, map){
  var next = Object.assign({}, ADMIN || {});
"""
NEW_DEF = """function adminFor(g, legacy){   /* patch AUTOCOM */
  var A = ADMIN; if (!A || typeof A !== 'object') return null;
  if (g !== 'commercial') return A[g];
  if (+A.commercialV >= AUTOCOM_V) return legacy === true ? A.commercialPre : A.commercial;
  return legacy === true ? A.commercial : null;   /* saved before AUTOCOM: what the old commercial jobs do, not what a new one starts with */
}
function defaultsFor(g, legacy){
  var out = builtin(g, legacy), a = adminFor(g, legacy);
  if (a && typeof a === 'object') KEYS.forEach(function(k){ if (!LOCKED[k] && typeof a[k] === 'boolean') out[k] = a[k]; });
  return out;
}
function setDefaults(g, map){
  var next = Object.assign({}, ADMIN || {});
  var comm = (g && typeof g === 'object') ? !!g.commercial : g === 'commercial';   /* patch AUTOCOM */
  if (comm && !(+next.commercialV >= AUTOCOM_V)) { if (next.commercial) next.commercialPre = next.commercial; else delete next.commercialPre; next.commercialV = AUTOCOM_V; }
"""
src = once(src, OLD_DEF, NEW_DEF)

# ---- 3. a job with no choices of its own made before AUTOCOM keeps the old table ------------------------------------
OLD_EFF = """  if (p && typeof p !== 'object') p = proj(p);
  var out = defaultsFor(groupOf(p || {}));
"""
NEW_EFF = """  if (p && typeof p !== 'object') p = proj(p);
  var out = defaultsFor(groupOf(p || {}), !(p && p.auto && typeof p.auto === 'object'));   /* patch AUTOCOM */
"""
src = once(src, OLD_EFF, NEW_EFF)

# ---- 4. Bids -> Won: the job remembers it came from a bid ----------------------------------------------------------
OLD_STAMP = """  if (p.auto && typeof p.auto === 'object' && p.auto.updatedAt) return p;
  var g = groupOf(p), dr = DR[ctx], hadBox = !!(dr && dr.seen);
"""
NEW_STAMP = """  if (p.auto && typeof p.auto === 'object' && p.auto.updatedAt) return p;
  if (ctx === 'bid' && p.fromBid !== true) p.fromBid = true;   /* patch AUTOCOM: a bid is commercial work */
  var g = groupOf(p), dr = DR[ctx], hadBox = !!(dr && dr.seen);
"""
src = once(src, OLD_STAMP, NEW_STAMP)

# ---- 5. the label: "Commercial job · from a bid" -----------------------------------------------------------------
OLD_SUB = """mode: 'job', title: '⚡ What this job does by itself', sub: GNAME[g] + ' job', onChange"""
NEW_SUB = """mode: 'job', title: '⚡ What this job does by itself', sub: GNAME[g] + ' job' + (g === 'commercial' && isBidJob(p, hintsFor(p)) ? ' · from a bid' : ''), onChange"""
src = once(src, OLD_SUB, NEW_SUB)

# ---- 6. console / tests ------------------------------------------------------------------------------------------
OLD_PUB = """  groupOf: groupOf, defaultsFor: defaultsFor, builtin: builtin, set: setJobAuto, renderBox: renderBox,"""
NEW_PUB = """  groupOf: groupOf, defaultsFor: defaultsFor, builtin: builtin, set: setJobAuto, renderBox: renderBox,
  isBidJob: function(p){ return isBidJob(p, hintsFor(p)); }, COMM: COMM, AUTOCOM_V: AUTOCOM_V,   /* patch AUTOCOM */"""
src = once(src, OLD_PUB, NEW_PUB)

open(path, 'w', encoding='utf-8').write(src)
print('patched AUTOCOM')
