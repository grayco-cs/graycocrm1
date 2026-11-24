/* ============================================================================
   lead-watch.js: EVERY CUSTOMER LEAD GETS A PM AND A CALL (patch LEADWATCH)

   Owner (11/19): "I need to make sure all my leads don't get ignored, get sent to PM etc."
   ONE rule, used by the server (bid-alerts.js speed to lead, smsalert.js lead texts, bid-inbox.js the 5 PM default assign)
   and by the CRM page (the "🚨 Leads at risk" card on the owners' Leads page and Field home — the page carries this file
   word for word as window._gcLeadWatchCore).
   1. WHAT A LEAD IS (kindOf): a CUSTOMER lead — Google LSA, the website / instant price / partner API, a phone lead (missed
      call, text, call), a referral, a lead source (Roof Ignite, Contractor Connection, HomeAdvisor …) or any other lead a
      person or a channel made — or NOT one: a bid invite (plan rooms, bid boards, city / county / school bid postings, a GC's
      invitation: the estimator's), a permit (the 🏗 Permits tab: no alerts, owner 11/12), a RoofScout prospect, a job copied
      onto the list (GrayCo Photos / QuickBooks), a soft lead (a guide download). How it came in wins over its type: a website
      lead for a commercial roof is still a customer lead (it never goes to the estimator as a bid).
   2. THE CLOCK (risk): an open customer lead
        no PM 4 hours after it came in            → 'nopm'   (the owners are texted to assign it; the 5 PM default assign follows)
        no PM 24 hours after it came in           → 'nopm24' (the owners again)
        a PM, not contacted 24 h after assignment → 'pm24'   (the PM's reminder)
        a PM, not contacted 48 h after assignment → 'pm48'   (the card only: the owners' 48 h text is OFF for good — QUIETSAT, owner 11/22)
      "Contacted" = the stage moved past New Lead, ✅ Contacted (contactedAt), a call / follow-up / comment a person logged, or
      on a Google LSA lead the PM's own 👍 GOOD / 👎 BAD (an owner's GOOD when assigning is not the PM's call).
   3. The card lists the open customer leads past those times from the last CARD_DAYS days.
   4. patch LEADRISK (owner 11/23, "be able to clear this"): an owner's ✕ Clear on the card (l.lwClear = { at, by, byEmail, sig },
      every clear kept in l.lwClearLog) takes the lead off the clock for good — the card, the To-Do, the speed-to-lead texts and the
      PM-reply ladder — UNLESS something new happens on the lead (clearSig changes: a new PM / assignment, the stage or status moved,
      it came in again, a call / follow-up / comment was logged). The lead itself is never deleted or closed.
   Pure: no I/O, no names, no e-mails. Nothing here contacts anyone.
   ========================================================================== */
(function(root){
'use strict';
var NOPM_H = 4, NOPM2_H = 24, PM_H = 24, OWNER_H = 48, CARD_DAYS = 30, H = 3600000;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

var BID_BOARDS = /buildingconnected|planhub|isqft|smartbid|bidclerk|constructconnect|procore|pantera|bluebook|dodge|bid ?board|plan ?room|bid postings|bidnet|demandstar|sam\.gov/i;
var LEAD_SOURCES = /referr|roof\s*ignite|contractor\s*connection|alacrity|sedgwick|leads@|homeadvisor|angi|thumbtack|google\s*(lsa|local)|facebook\s*lead|nextdoor|yelp|porch|networx|modernize|bark/i;
var JOB_SRC = /^(companycam|quickbooks|estimate builder|qb|crm import)$/i;
var CLOSED = /^(won|lost|dead|deleted|converted|declined|not\s*bidding|no\s*bid|pass(ed)?|archived|cancell?ed|closed|dismissed|merged|submitted|spam|sales|blocked|duplicate)$/i;

function srcText(l){ var ex = obj(l.leadExtra); return [l.source, l.leadSource, ex.leadSource, l.subSource, ex.mkSource, ex.websiteForm, l.websiteForm, l.origin, l.createdVia].map(s).join(' '); }
function isLsa(l){ var ex = obj(l && l.leadExtra); return !!l && (/^(pending|good|bad|pm_good|pm_bad|no_answer)$/.test(s(l.lsaCheck || ex.lsaCheck)) || /google\s*lsa|local\s*services/i.test([l.source, l.leadSource, ex.leadSource, ex.mkSource === 'Google LSA' ? 'google lsa' : ''].map(s).join(' '))); }
function isWebsite(l){ var ex = obj(l.leadExtra); return !!(s(l.origin) === 'website' || s(l.origin) === 'partner' || l.websiteLead || ex.websiteLead || l.partnerLead || ex.partnerLead || /^website\b|grayco-cs\.com|web ?form|instant roof|roof ?price/i.test(s(l.source))); }
function isPhone(l){ var ex = obj(l.leadExtra); return !!(ex.missedCall || l.missedCall || ex.textMessage || l.textMessage || ex.smsFrom || l.smsFrom || ex.lsaCall || /^(phone|missed-call|sms|voice)$/i.test(s(l.origin)) || /missed call|text message|phone|\bcall\b|voicemail|call ?rail/i.test(s(l.source) + ' ' + s(l.leadSource))); }
function isBidSignals(l){
  var ty = low(l.type || l.leadKind) + ' ' + low(l.leadKind);
  if (/^(sub|prime)$/.test(low(l.bidRole || obj(l.leadExtra).bidRole))) return true;
  if (s(l.origin) === 'watch' || s(l.origin) === 'email' && (s(l.gc) || s(l.bidDue) || /commercial|government/.test(ty))) return true;
  if (/bid|commercial|government|\bgov\b/.test(ty)) return true;
  if (s(l.bidDue) || s(l.gc) || s(l.dueToCompany) || s(l.bidNumber)) return true;
  return BID_BOARDS.test([l.source].concat(arr(l.sources).map(function(y){ return s(y && y.name || y); })).join(' '));
}
/* patch SUBSEEK (owner 11/19 on a drafting sub's website "Commercial bid inquiry": "he is a sub trying to find work, we like that …
   That message can go in somewhere else"): a sub / supplier looking for work is NO customer lead, whatever way it came in (website
   form, Google LSA, a text, a call, e-mail, a lead source) and however old it is — never on the clock, never assigned, never texted.
   The words are _lib/salesguard.js classify (the CRM page: window._gcSalesBlock.classify, the same rules); a lead already moved to
   🤝 Subs & suppliers (sgKind 'sub') stays out. An owner's "Actually a customer lead" (notSpam) lets it back. A real bid invitation
   (a bid board / plan room, a GC, a bid role, a due date, the bid watch) is never a sub's pitch. → '' or why it is a sub / supplier. */
var SUBC = {}, SUBN = 0;
function sgApi(){
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') { try { return require('./salesguard.js'); } catch (e) { return {}; } }
  return obj(root && root._gcSalesBlock);
}
function ownText(l){ var ex = obj(l.leadExtra), c = obj(l.contact), a = [obj(l.said).message, obj(ex.said).message, l.textBody, ex.textBody, l.callerSaid, ex.callerSaid, l.spokenReason, ex.spokenReason, l.scope, l.message, c.message, l.body].map(s).filter(Boolean);
  return a.filter(function(x, i){ return a.indexOf(x) === i; }).join('\n'); }
function subWhy(l){
  if (!l) return '';
  var ex = obj(l.leadExtra), t, r, SB, hit;
  if (l.notSpam === true || ex.notSpam === true) return '';
  if ([l.sgKind, ex.sgKind].some(function(v){ return /^subs?$/i.test(s(v)); })) return 'moved to 🤝 Subs & suppliers';
  if (l.fromBidBoard || s(l.gc) || s(l.bidRole || ex.bidRole) || s(l.bidDue) || s(l.origin) === 'watch' || BID_BOARDS.test([l.source].concat(arr(l.sources).map(function(y){ return s(y && y.name || y); })).join(' '))) return '';
  t = ownText(l); if (!t) return '';
  if (Object.prototype.hasOwnProperty.call(SUBC, t)) return SUBC[t];
  SB = sgApi(); r = {};
  try { if (typeof SB.classify === 'function') r = obj(SB.classify(t, { email: low(obj(l.contact).email || l.email), company: s(l.company || obj(l.said).company || obj(ex.said).company) })); } catch (e) { r = {}; }
  hit = r.kind === 'sub' ? s(r.why) || 'a sub / supplier looking for work' : '';
  if (typeof SB.classify === 'function') { if (++SUBN > 2000) { SUBC = {}; SUBN = 0; } SUBC[t] = hit; }
  return hit;
}
/* 'lsa' | 'website' | 'phone' | 'referral' | 'source' | 'other' (customer leads) · 'bid' | 'permit' | 'roofscout' | 'job' | 'soft' | 'sub' (not) */
function kindOf(l){
  if (!l) return 'job';
  var ex = obj(l.leadExtra), src = srcText(l);
  if (l.softLead || ex.softLead) return 'soft';
  if (subWhy(l)) return 'sub';   /* patch SUBSEEK */
  if (isLsa(l)) return 'lsa';
  if (isWebsite(l)) return 'website';
  if (l.rsLeadId || /^LEAD_RS_/.test(s(l.id)) || /roof ?scout/i.test(src)) return 'roofscout';
  if (l.permitId || l.fromPermit || /permit/i.test(s(l.source) + ' ' + s(l.createdVia))) return 'permit';
  if (isPhone(l)) return 'phone';
  if (l.fromBidBoard || s(l.gc) || s(l.bidRole)) return 'bid';   /* a GC's invitation / an old Bid Board item, even when its source says "Referral" */
  if (/referr/i.test(src)) return 'referral';
  if (LEAD_SOURCES.test(src)) return 'source';
  if (isBidSignals(l)) return 'bid';
  if ((l.fromProjectId || l.ccamId || JOB_SRC.test(s(l.source))) && !s(l.stage) && !l.inboxId) return 'job';
  if (JOB_SRC.test(s(l.source)) && !l.inboxId && !l.leadExtra) return 'job';
  return 'other';
}
var CUSTOMER = { lsa: 1, website: 1, phone: 1, referral: 1, source: 1, other: 1 };
function isCustomer(l){ return !!CUSTOMER[kindOf(l)]; }
function isBid(l){ return kindOf(l) === 'bid'; }
var LABEL = { lsa: 'Google LSA', website: 'Website', phone: 'Phone', referral: 'Referral', source: 'Lead source', other: 'Other', bid: 'Bid invite', permit: 'Permit', roofscout: 'RoofScout', job: 'Job copy', soft: 'Soft lead', sub: 'Sub / supplier' };

function closed(l){
  if (!l) return true;
  var ex = obj(l.leadExtra);
  if (l.deleted || l._deleted || l.converted || l.notBidding || l.noBid || l.archived || l.dismissed || l.stub || s(l.mergedInto)) return true;
  if (low(l.lsaCheck || ex.lsaCheck) === 'bad') return true;
  return [l.stage, l.status, l.inboxState, l.bidStatus].some(function(v){ return CLOSED.test(s(v)); });
}
function assignee(l){ return s(l && (l.pm || l.estimator || l.apm)); }
function ms(v){ if (v == null || v === '') return NaN; if (typeof v === 'number') return v; var t = Date.parse(/^\d{4}-\d\d-\d\d$/.test(s(v)) ? s(v) + 'T12:00:00Z' : s(v)); return isFinite(t) ? t : NaN; }
function bornAt(l){ var ex = obj(l.leadExtra); var f = ['createdAt', 'receivedAt', 'inboxAt', 'created', 'dateAdded']; for (var i = 0; i < f.length; i++) { var x = ms(l[f[i]]); if (isFinite(x)) return x; } var r = ms(ex.receivedAt); return isFinite(r) ? r : ms(l.date); }
/* when it was assigned: the earliest stamp we have (an import can re-stamp assignedAt; the 5 PM release and the "lead assigned" text keep the first) */
function asgAt(l){
  var c = [ms(l.assignedAt), ms(l.autoAssignedAt), ms(obj(l.hold).state && obj(l.hold).state !== 'held' ? obj(l.hold).doneAt : '')];
  arr(l.activity).forEach(function(a){ if (a && /lead assigned|assigned to/i.test(s(a.text))) c.push(ms(a.at)); });
  c = c.filter(function(x){ return isFinite(x); });
  return c.length ? Math.min.apply(null, c) : NaN;
}
var SYS_BY = /lead inbox|system|website|server|crm|auto|grayco text/i, SYS_KIND = /creat|assign|import|added|system|auto/i;
function pmOwn(l){   /* a Google LSA verdict the lead's PM gave himself (an owner's GOOD while assigning is not the PM's call) */
  var ex = obj(l.leadExtra), c = low(l.lsaCheck || ex.lsaCheck), by = low(s(l.lsaDecidedBy).replace(/\s*\((by )?text[^)]*\)\s*$/i, ''));
  if (c === 'pm_good' || c === 'pm_bad' || c === 'bad') return true;
  if (c === 'good' && (s(l.lsaPmOkAt) || (by && low(l.pm) && by === low(l.pm)))) return true;
  return false;
}
function contacted(l){
  var st = low(l.stage);
  if (st && !/^(new|new lead|lead|unassigned)$/.test(st)) return true;
  var f = ['contactedAt', 'lastContact', 'lastContacted', 'lastContactAt', 'followUpDone', 'firstContactAt'];
  for (var i = 0; i < f.length; i++) if (s(l[f[i]])) return true;
  if (isLsa(l) && pmOwn(l)) return true;
  var g = ['calls', 'followUps', 'activity', 'activities', 'log', 'comments', 'history', 'contactLog'];
  for (var j = 0; j < g.length; j++) {
    if (arr(l[g[j]]).some(function(c){ return c && typeof c === 'object' && !SYS_BY.test(s(c.by || c.who || c.author)) && !SYS_KIND.test(s(c.type || c.kind || c.action)) && !/texted|e-?mailed|📱|📧/.test(s(c.text)); })) return true;
  }
  return false;
}
/* the lead's place on the clock at `now`: null (fine / not a customer lead / closed) or { k, h, since, label } */
function risk(l, now, o){
  o = o || {};
  if (!l || closed(l) || !isCustomer(l)) return null;
  if (!o.withCleared && cleared(l)) return null;   /* patch LEADRISK */
  var t = typeof now === 'number' ? now : Date.now(), born = bornAt(l);
  if (!isFinite(born)) return null;
  if (o.maxDays && t - born > o.maxDays * 864e5) return null;
  if (contacted(l)) return null;
  if (!assignee(l)) {
    var a = (t - born) / H;
    if (a >= NOPM2_H) return { k: 'nopm24', h: Math.floor(a), since: born, label: 'no PM for ' + ago(a) };
    if (a >= NOPM_H) return { k: 'nopm', h: Math.floor(a), since: born, label: 'no PM for ' + ago(a) };
    return null;
  }
  var from = isFinite(asgAt(l)) ? asgAt(l) : born, b = (t - from) / H;
  if (b >= OWNER_H) return { k: 'pm48', h: Math.floor(b), since: from, label: assignee(l) + ' has not contacted them — assigned ' + ago(b) + ' ago' };
  if (b >= PM_H) return { k: 'pm24', h: Math.floor(b), since: from, label: assignee(l) + ' has not contacted them — assigned ' + ago(b) + ' ago' };
  return null;
}
/* patch LEADRISK: what "something new on the lead" is — the fingerprint kept with an owner's ✕ Clear (never the clear itself, never
   updatedAt or the CRM's own activity lines) */
function clearSig(l){
  l = l || {}; var ex = obj(l.leadExtra), a = asgAt(l), b = bornAt(l);
  return [low(assignee(l)), isFinite(a) ? a : '', low(l.stage), low(l.status), low(l.inboxState), isFinite(b) ? b : '', s(l.reopenedAt || ex.reopenedAt), s(l.lastInboundAt || ex.lastInboundAt),
    arr(l.calls).length, arr(l.followUps).length, arr(l.comments).length, arr(l.contactLog).length, l.archived ? 1 : 0, l.deleted ? 1 : 0].join('|');
}
/* an owner cleared it and nothing new happened since */
function cleared(l){ var c = obj(l && l.lwClear); return !!(s(c.at) && s(c.sig) && c.sig === clearSig(l)); }
function ago(h){ h = Math.floor(h); return h >= 48 ? Math.floor(h / 24) + ' days' : h + ' h'; }
/* the CRM leads + the Lead Inbox items not on the CRM list yet → the leads at risk, worst first */
function atRisk(leads, items, now, o){
  o = Object.assign({ maxDays: CARD_DAYS }, o || {});
  var t = typeof now === 'number' ? now : Date.now(), have = {}, out = [];
  arr(leads).forEach(function(l){ if (l && l.id) { have[s(l.id)] = 1; if (l.inboxId) have[s(l.inboxId)] = 1; } });
  arr(leads).forEach(function(l){ var r = l && risk(l, t, o); if (r) out.push({ l: l, r: r }); });
  arr(items).forEach(function(it){
    if (!it || !it.id || have[s(it.id)] || have['LEADIN-' + s(it.id).replace(/^LI-/, '')] || !/^(new|imported|)$/.test(s(it.status))) return;
    var l = Object.assign({}, it, obj(it.leadExtra), { id: 'LEADIN-' + s(it.id).replace(/^LI-/, ''), inboxId: it.id, name: s(it.title), stage: '', status: '' });
    var r = risk(l, t, o); if (r) out.push({ l: l, r: r });
  });
  var W = { pm48: 0, nopm24: 1, pm24: 2, nopm: 3 };
  return out.sort(function(a, b){ return (W[a.r.k] - W[b.r.k]) || (a.r.since - b.r.since); });
}
/* the 5 PM default assign (bid-inbox.js, every 10 minutes): Lead Inbox items that are customer leads, still without anybody at
   their 5 PM (holdUntil of when they came in), not held, not an emergency, not closed, and whose CRM copy nobody assigned / handled */
function defaultDue(items, crmLeads, now, holdUntil){
  var t = typeof now === 'number' ? now : Date.now(), byInbox = {};
  arr(crmLeads).forEach(function(l){ if (l && l.inboxId) byInbox[s(l.inboxId)] = l; });
  return arr(items).filter(function(it){
    if (!it || !it.id || it.stub || !/^(new|imported)$/.test(s(it.status) || 'new')) return false;
    var l = Object.assign({}, obj(it.leadExtra), it);
    var heldLsa = !!(it.hold && it.hold.state === 'held' && isLsa(l));   /* a Google lead held for its suggested PM: the 5 PM rule (lead-hold.js) skips Google leads */
    if (assignee(it) || (it.hold && it.hold.state === 'held' && !heldLsa) || it.emergency || obj(it.leadExtra).emergency) return false;
    if (closed(l) || !isCustomer(l)) return false;
    var born = bornAt(l); if (!isFinite(born) || t - born > 7 * 864e5) return false;
    var c = byInbox[s(it.id)]; if (c && (assignee(c) || closed(c) || contacted(c) || (c.hold && c.hold.state && c.hold.state !== 'held'))) return false;
    var due = heldLsa ? Date.parse(it.hold.until) : typeof holdUntil === 'function' ? Date.parse(holdUntil(born)) : born + NOPM2_H * H;
    return isFinite(due) && due <= t;
  });
}

var API = { V: 1, NOPM_H: NOPM_H, NOPM2_H: NOPM2_H, PM_H: PM_H, OWNER_H: OWNER_H, CARD_DAYS: CARD_DAYS, LABEL: LABEL,
  kindOf: kindOf, subWhy: subWhy, isCustomer: isCustomer, isBid: isBid, isLsa: isLsa, closed: closed, assignee: assignee, bornAt: bornAt, asgAt: asgAt,
  contacted: contacted, risk: risk, clearSig: clearSig, cleared: cleared, atRisk: atRisk, defaultDue: defaultDue, ago: ago };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root._gcLeadWatchCore = API;
})(typeof window !== 'undefined' ? window : this);
