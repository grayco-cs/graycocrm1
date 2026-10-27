/* ============================================================================
   GrayCo — WHICH INBOX MEANS WHAT.   netlify/functions/_lib/subbids.js   (patch EST4)

   Owner (10/22): "Bids should also be leads — all bids go to the leads e-mail, that group. bids@ will just be
   when a sub sends a bid in, and it should go to the estimator."

   leads@  → bid invitations (ITB / RFP / RFQ / BuildingConnected / PlanHub / planroom / agency notices, plan
             links, a bid date) take the BID path (Lead Inbox bid, due date, Senior Estimator, alerts, private
             bid-portal draft); everything else (homeowners, website forms, people writing in) the customer-lead
             path (website-intake.js fromEmail).                                       → isBidInvite(mail)
   bids@   → (patch BIDSEND, owner 10/22: our bids now go out FROM bids@ and replies come back to it — bids@ is a Google
             Group: the estimator, the admins, the office and bids@in.grayco-cs.com) THREE kinds, sorted in this order:
             (a) a GC's REPLY to one of OUR bids — In-Reply-To names the bid we sent, the sender is a contact on a lead's
                 "Bidding to" list, or "Re: <the project / the GC's bid #>" from someone who is not a sub → filed on that
                 lead's GC row
                 (_lib/bid-replies.js: urgency, the estimator alerted);
             (b) a SUBCONTRACTOR's bid (a SUB BID) — a sub we know (invited on the sub portal / on the subs list) or
                 "our price / our bid is attached" wording → the sub-bid path below;
             (c) an INVITATION to bid still sent to bids@ → the bid path (isInviteForBids);
             anything else waits in "Unsorted bids@ mail" for the estimator to say what it is.
   bids@ (b) → a SUBCONTRACTOR's bid / proposal / quote for one of our bid jobs. It is matched to the bid-portal
             job, its files are kept, the job's estimator (else the Senior Estimator, else the admins) is told
             "Sub bid received: <sub> — <project>". Unmatched ones wait in "Unmatched sub bids". Never a customer
             lead. An old-style bid INVITATION still sent to bids@ (sign-ups made before the switch) is
             recognised and handled on the bid path, so nothing is lost.                → isInviteForBids(mail)
   ========================================================================== */
'use strict';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }

/* strong signs of a bid invitation / solicitation */
const INVITE = /\b(invitations? to bid|invited to bid|you(?:'ve| have) been invited|request for (?:proposals?|qualifications?|quotes?|bids?)|itb|ifb|rfp|rfq|rfqs|solicitation|sealed bids?|bids? (?:are )?due|bid (?:due|date|opening|invitation|package|documents?|form|bond|results)|pre-?bid|addend(?:um|a)|plan ?room|plans and spec(?:ification)?s|bidding documents|bid board|project invitation|new projects? (?:in|near) your)\b/i;
const PLATFORM = /buildingconnected|planhub|isqft|constructconnect|bidclerk|dodge|smartbid|pipelinesuite|bidnet|centralbidding|ionwave|opengov|bonfire|demandstar|questcdn|periscope|bidsync|aandbplanroom|rkaplanroom|procore/i;
/* a homeowner / customer writing in */
const HOMEOWNER = /\b(my (?:house|home|roof|basement|kitchen|bathroom|ceiling|garage|deck|yard)|our (?:house|home|roof)|free (?:estimate|inspection|quote)|squarespace|form submission|new (?:form|contact) (?:entry|submission)|homeowner|leak(?:s|ing)? (?:in|into|from)|water in my|storm damaged my|need (?:a|my) (?:roof|estimate))\b/i;

function hay(mail){ return s(mail && mail.subject) + '\n' + s(mail && mail.text).slice(0, 5000); }
function fwdDomains(mail){ const out = []; const m = s(mail && mail.text).match(/(?:^|\n)\s*(?:from|de)\s*:\s*[^\n<]*<?[a-z0-9._%+-]+@([a-z0-9.-]+)>?/gi) || []; m.forEach(l => { const x = l.match(/@([a-z0-9.-]+)/i); if (x) out.push(low(x[1])); }); return out; }

/* mail to leads@: is it a bid invitation (bid path) or a customer (lead path)? boardOf(host) → board name or '' */
function isBidInvite(mail, boardOf){
  const bo = typeof boardOf === 'function' ? boardOf : () => '';
  const from = mail && mail.from || {}, dom = low(from.domain || s(from.email).split('@')[1]);
  if (bo(dom) || PLATFORM.test(dom)) return { bid: true, why: 'from a bid board / agency (' + dom + ')' };
  if (fwdDomains(mail).some(d => bo(d) || PLATFORM.test(d))) return { bid: true, why: 'forwarded from a bid board' };
  const subj = s(mail && mail.subject), body = s(mail && mail.text).slice(0, 5000), h = subj + '\n' + body;
  const home = HOMEOWNER.test(subj + '\n' + body.slice(0, 2000));
  if (INVITE.test(subj)) return { bid: true, why: 'the subject reads like a bid invitation' };
  if (PLATFORM.test(h)) return { bid: !home, why: home ? 'a homeowner mentions a bid site' : 'mentions a bid platform' };
  if (INVITE.test(body) && !home) return { bid: true, why: 'the e-mail reads like a bid invitation' };
  /* a bid due date with commercial words and no homeowner words */
  if (!home && /\bbids?\b/i.test(h) && /\b(due|deadline|no later than)\b/i.test(h) && /\b(general contractor|subcontractor|gc|owner|agency|county|city of|school|project no\.?|project number|drawings|specs?)\b/i.test(h))
    return { bid: true, why: 'a bid deadline on a commercial project' };
  return { bid: false, why: home ? 'a homeowner / customer' : 'no bid-invitation signs' };
}

/* mail to bids@: an old-style invitation (bid path) rather than a sub's bid? Narrower than isBidInvite — a sub
   writing "our bid for the church reroof is attached" is a sub bid. */
const STRICT_INVITE = /\b(invitations? to bid|invited to bid|you(?:'ve| have) been invited|request for (?:proposals?|qualifications?)|itb|ifb|rfp|rfq|solicitation|sealed bids?|pre-?bid (?:meeting|conference)|addend(?:um|a)\b|plan ?room|bidding documents|project invitation|new projects? (?:in|near) your)\b/i;
function isInviteForBids(mail, boardOf){
  const bo = typeof boardOf === 'function' ? boardOf : () => '';
  const from = mail && mail.from || {}, dom = low(from.domain || s(from.email).split('@')[1]);
  if (bo(dom) || PLATFORM.test(dom)) return true;
  if (fwdDomains(mail).some(d => bo(d) || PLATFORM.test(d))) return true;
  const h = s(mail && mail.subject) + '\n' + s(mail && mail.text).slice(0, 1500);
  if (SUB_BID.test(h)) return false;   /* "our bid / proposal / quote is attached" → a sub's bid */
  return STRICT_INVITE.test(h) || ASKS_US.test(h);
}
/* a sub sending its own number */
const SUB_BID = /\b(?:(?:our|my) (?:bid|proposal|quote|quotation|price|pricing|number|estimate)\b|attached (?:is|are) (?:our|my)|please find (?:our|my|the) (?:attached|bid|proposal|quote)|(?:proposal|quote|bid) (?:is )?attached)/i;
/* someone asking GrayCo to bid (a GC, an adjuster, an owner writing to the old address) */
const ASKS_US = /\b(?:please (?:bid|quote|price)|request(?:ing)? (?:a |your )?(?:bid|quote|pricing|proposal)|bids? (?:are )?due|bid due|invite you|would you (?:like to )?(?:bid|quote)|looking for (?:bids|pricing|a bid)|(?:can|could|would) you (?:look at|price|bid|quote|give us (?:a )?(?:price|number|bid)))\b/i;

/* ── matching a sub's bid to a bid-portal job ──────────────────────────────────
   jobs: [{ id, title, po, address, estimatorEmail, invited: [emails] }] */
const STOP = { the: 1, and: 1, for: 1, with: 1, from: 1, project: 1, bid: 1, bids: 1, proposal: 1, quote: 1, job: 1, new: 1, phase: 1, building: 1, construction: 1, re: 1, fw: 1, fwd: 1, inc: 1, llc: 1, our: 1, your: 1, this: 1, that: 1 };
function words(t){ return low(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP[w]); }
function streetKey(a){ const m = /^\s*(\d+)\s+([A-Za-z]+)/.exec(s(a)); return m ? (m[1] + ' ' + m[2]).toLowerCase() : ''; }
function matchJob(mail, jobs){
  const h = low(hay(mail)), from = low(mail && mail.from && mail.from.email);
  const hw = {}; words(h).forEach(w => { hw[w] = 1; });
  let best = null, second = 0;
  arr(jobs).forEach(j => {
    if (!j || !j.id) return;
    let sc = 0; const why = [];
    const po = low(j.po); if (po && po.length >= 3 && new RegExp('\\b' + po.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(h)) { sc += 10; why.push('PO'); }
    const sk = streetKey(j.address); if (sk && h.indexOf(sk) >= 0) { sc += 4; why.push('address'); }
    if (from && arr(j.invited).map(low).indexOf(from) >= 0) { sc += 4; why.push('invited'); }
    const tw = words(j.title).filter((w, i, a) => a.indexOf(w) === i);
    if (tw.length) { const hit = tw.filter(w => hw[w]).length; const f = hit / tw.length; if (hit >= 2) { sc += Math.min(8, hit * 2) + (f >= 0.6 ? 1 : 0); why.push('title'); } else if (tw.length === 1 && hit === 1) { sc += 2; why.push('title'); } }
    if (!best || sc > best.score) { second = best ? best.score : 0; best = { job: j, score: sc, why }; } else if (sc > second) second = sc;
  });
  if (!best || best.score < 4 || best.score === second) return null;   /* too weak or a tie: the estimator decides */
  return best;
}
function subName(mail){
  const f = mail && mail.from || {};
  const sig = s(mail && mail.text).match(/\n\s*(?:thanks|thank you|regards|sincerely|best)[,!.]?\s*\n+\s*([^\n]{2,60})\n+\s*([^\n]{2,80})/i);
  const company = sig && /\b(llc|inc|co\.?|company|roofing|construction|contracting|services|electric|plumbing|mechanical|drywall|painting|flooring)\b/i.test(sig[2]) ? s(sig[2]) : '';
  return { name: s(f.name) || s(f.email), company, email: low(f.email) };
}

/* patch BIDSEND: a sub sending its own number ("our price is attached") */
function isSubBid(mail){ return SUB_BID.test(s(mail && mail.subject) + '\n' + s(mail && mail.text).slice(0, 1500)); }
module.exports = { isBidInvite, isInviteForBids, isSubBid, matchJob, subName, words, streetKey, INVITE, HOMEOWNER };
