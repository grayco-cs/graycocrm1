/* GrayCo — LOST LEADS STAY ON GRAYCO NEWS (patch LOSTNEWS). ONE copy: the server (_lib/news.js everyone(),
   _lib/mkt-content.js contacts() → every campaign audience) and the CRM page (tools/patch_LOSTNEWS.py pastes this file
   into the lead panel's tail as window.__gcLostNews). Pure functions: no network, no DOM.

   Owner 10/29: "when leads are lost i still want to email them until they say stop emails".
   A lead marked Lost with an e-mail is in the GrayCo News / marketing e-mail audience (newsletters, seasonal campaigns,
   the 6 / 12-month win-back check-ins) and keeps getting them until they unsubscribe. Campaigns still go through
   ✅ Approvals as today; every send is news@ with the one-click unsubscribe (List-Unsubscribe) and the gc_news_suppress
   list is checked before each send (_lib/news.js) — nothing here changes that.
   NOT on the list (why() says which):
     · lost as spam / not a real lead / wrong number / vendor or sales pitch / not construction / test / duplicate;
     · a bid-board / plan-room GC contact (a commercial / government bid invite) — unless someone ticked newsOptIn on it;
     · anyone who asked not to be contacted (doNotContact, dnc, doNotEmail, noEmail, unsubscribed, optOut, "do not
       contact / e-mail" in the tags) or texted STOP to our number (opts.optout: the SMS state's opt-out map);
     · a lead someone took off with the panel's switch (newsOff: true). */
(function(root, factory){
  var M = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = M;
  if (root && typeof root === 'object') root.__gcLostNews = M;
})(typeof self !== 'undefined' ? self : this, function(){
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function phone10(v){ var d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
var JUNK = /spam|scam|not\s*a\s*real|fake|junk|bogus|wrong\s*(number|no\.?|person)|vendor|supplier|solicit|sales\s*(call|pitch|person|rep)?\b|selling|marketing\s*(call|agency|offer)|robo|not\s*construction|test\s*lead|^test\b|duplicate|dup\b|prank/i;
var BIDSRC = /bid\s*board|plan\s*room|planhub|buildingconnected|building\s*connected|isqft|dodge|construct\s*connect|bidclerk|bids@|bid\s*invite|itb\b/i;
function isLost(l){ return !!l && (l.lost === true || [l.stage, l.status, l.pipelineStage].some(function(v){ return /^lost\b/i.test(s(v)); })); }
function emailOf(l){ return low(l.email || l.contactEmail || l.clientEmail || l.customerEmail || (l.contact && l.contact.email)); }
function nameOf(l){ return s(l.contactName || (l.contact && l.contact.name) || l.client || l.customer || l.name); }
function phoneOf(l){ return phone10(l.phone || l.clientPhone || (l.contact && l.contact.phone) || (l.leadExtra && l.leadExtra.smsFrom)); }
function isBid(l){
  if (/commercial|government|gov\b/i.test(s(l.leadKind || l.type || l.kind))) return true;
  if (l.bidStatus || (l.inboxId && (l.bidDue || l.estimator || l.dueToCompany))) return true;
  return BIDSRC.test([l.source, l.leadSource, l.sourceKind, l.origin, l.leadExtra && l.leadExtra.leadSource].map(s).join(' '));
}
function noContact(l){ return !!(l.doNotContact || l.dnc || l.doNotEmail || l.noEmail || l.unsubscribed || l.optOut || /do\s*not\s*(contact|e-?mail|call)/i.test(s(Array.isArray(l.tags) ? l.tags.join(' ') : l.tags))); }
/* '' = on the list; otherwise why not. opts = { optout: { <10 digits>: at } } */
function why(l, opts){
  opts = opts || {};
  if (!l || l.deleted === true || l._deleted === true) return 'deleted';
  if (!isLost(l)) return 'not lost';
  if (!okEmail(emailOf(l))) return 'no e-mail';
  if (l.newsOff === true) return 'taken off GrayCo News on the lead';
  if (noContact(l)) return 'asked not to be contacted';
  var ph = phoneOf(l); if (ph && opts.optout && opts.optout[ph]) return 'texted STOP';
  if (JUNK.test(s(l.lostReason || l.lossReason)) || /spam|junk|vendor/i.test(s(Array.isArray(l.tags) ? l.tags.join(' ') : l.tags))) return 'lost as spam / not a real lead / wrong number / vendor';
  if (isBid(l) && l.newsOptIn !== true) return 'a bid-board / plan-room GC contact (not opted in)';
  return '';
}
function on(l, opts){ return why(l, opts) === ''; }
/* the lost leads on the list: [{ email, name, leadId, from: 'lost lead' }] (one per e-mail) */
function members(leads, opts){
  var by = {};
  arr(leads).forEach(function(l){ if (!on(l, opts)) return; var e = emailOf(l); if (!by[e]) by[e] = { email: e, name: nameOf(l), leadId: s(l.id), from: 'lost lead' }; });
  return Object.keys(by).map(function(k){ return by[k]; });
}
/* the e-mails of leads that must NOT get news (asked not to be contacted / STOP / taken off) — a customer record with the
   same e-mail does not put them back */
function blocked(leads, opts){
  var out = {};
  arr(leads).forEach(function(l){ var e = emailOf(l); if (!okEmail(e)) return; var w = why(l, opts); if (/asked not|STOP|taken off/.test(w)) out[e] = w; });
  return out;
}
var LABEL = '📰 On GrayCo News (until they unsubscribe)';
return { isLost: isLost, emailOf: emailOf, isBid: isBid, noContact: noContact, why: why, on: on, members: members, blocked: blocked, LABEL: LABEL, JUNK: JUNK };
});
