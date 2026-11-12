/* sub-match.js — patch SUBSYNC: ONE matcher for "is this sub already in the CRM?" (owner 11/12: "Some subs will sign into the bid portal
   and we already have them in the CRM — make sure we don't duplicate if they use the same phone number, name, email etc. — make it merge";
   the same for the sub portal). Used by the CRM page (index.html loads /sub-match.js → window._gcSubMatch) and by the server
   (netlify/functions/bid-hub.js and portal-access.js require('../../sub-match.js')).

   match(x, list, opts) — x: a sign-up / bid-site / sub-portal sub { email, phone, company, dba, name|contact, city, state, portalUserId,
   crmId, altEmails, altPhones }; list: the CRM's Subs / Vendors records. In order:
     1. the link: x.crmId = a record id, a record's bidPortalUserId = x.portalUserId, or x's SBP id in a record's portalAliases → strong
     2. e-mail (any of the record's e-mail fields, case-insensitive), phone (digits, last 10), the company name normalized
        (lowercase, & = and, no punctuation, no LLC / Inc / Co / Corp / Company / Construction / Contracting / Services …) — one record → strong;
        two or more different records → ambiguous (weak, never merged on its own)
     3. weak: a similar company name (most words the same, or one inside the other), or the same contact name in the same city / state
   opts.decisions: { '<x key>|<record id>': 'same' | 'different' } — an owner's answer to "🔗 Same sub?" (never asked again).
   → { kind: 'strong' | 'weak' | 'none', rec, why, cands: [{ rec, why }] }
   merge(rec, x) → fills ONLY empty fields (phone, e-mail, address, trades, license, contact, company), links it (bidPortalUserId,
   portalAliases, "On bid portal" tag), keeps a different e-mail / phone as an extra contact (altEmails / altPhones / contacts[]);
   never overwrites what staff entered. Returns the number of changes. */
(function(root){
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
var STOP = { llc: 1, inc: 1, incorporated: 1, co: 1, corp: 1, corporation: 1, company: 1, companies: 1, construction: 1, constructions: 1, contracting: 1, contractor: 1, contractors: 1,
  services: 1, service: 1, ltd: 1, limited: 1, the: 1, pllc: 1, llp: 1, lp: 1, group: 1, enterprises: 1, enterprise: 1 };
function normCo(v){
  var t = low(v).replace(/&/g, ' and ').replace(/\bl\.?\s?l\.?\s?c\b\.?/g, ' llc ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function(w){ return w && !STOP[w]; });
  return t.join(' ');
}
function phone10(v){ var d = s(v).replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length >= 10 ? d.slice(-10) : ''; }
function okEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function sbpId(email){ return 'SBP' + low(email).replace(/[^a-z0-9]+/g, '').slice(0, 24); }
function emailsOf(r){
  if (!r) return [];
  var out = [r.email, r.repEmail, r.billingEmail, r.officeEmail, r.apEmail, r.altEmail, r.email2, r.contactEmail, r.accountingEmail].concat(arr(r.emails), arr(r.altEmails), arr(r.contacts).map(function(c){ return c && c.email; }));
  return out.map(low).filter(okEmail).filter(function(e, i, a){ return a.indexOf(e) === i; });
}
function phonesOf(r){
  if (!r) return [];
  var out = [r.phone, r.mobile, r.cell, r.officePhone, r.altPhone, r.phone2, r.contactPhone, r.businessPhone].concat(arr(r.phones), arr(r.altPhones), arr(r.contacts).map(function(c){ return c && c.phone; }));
  return out.map(phone10).filter(Boolean).filter(function(p, i, a){ return a.indexOf(p) === i; });
}
function cosOf(r){ return r ? [r.name, r.company, r.dba, r.dbaName].map(normCo).filter(function(n){ return n.length >= 3; }).filter(function(n, i, a){ return a.indexOf(n) === i; }) : []; }
function personOf(r){ return low(r && (r.contact || r.contactName || r.name)).replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function keyOf(x){ return s(x && x.portalUserId) || low(x && x.email); }
function similarCo(a, b){
  if (!a || !b || a === b) return false;
  if (a.replace(/ /g, '') === b.replace(/ /g, '')) return true;   /* "Earth Works" / "Earthworks" */
  if (a.length >= 4 && b.length >= 4 && (a.indexOf(b) > -1 || b.indexOf(a) > -1)) return true;
  var A = a.split(' '), B = b.split(' '), n = A.filter(function(w){ return B.indexOf(w) > -1; }).length;
  return n >= 2 && n / Math.max(A.length, B.length) > 0.6;   /* most of the words: "Acme Roofing Pros" ~ "Acme Roofing"; not "Demo Tile" ~ "Demo Paving" */
}
function match(x, list, opts){
  x = x || {}; opts = opts || {}; var ids = {}; list = arr(list).filter(function(r){ if (!r || !s(r.id) || ids[s(r.id)]) return false; ids[s(r.id)] = 1; return true; });   /* one copy per record (the CRM keeps some in two lists) */
  var dec = opts.decisions || {}, k = keyOf(x), alias = okEmail(low(x.email)) ? sbpId(x.email) : '';
  var told = function(r){ var d = dec[k + '|' + s(r.id)]; return d && (d.d || d); };
  var pool = list.filter(function(r){ return told(r) !== 'different'; });
  var same = pool.filter(function(r){ return told(r) === 'same'; })[0];
  if (same) return { kind: 'strong', rec: same, why: 'you said it is the same sub', cands: [{ rec: same, why: 'same' }] };
  /* 1. the link */
  var link = pool.filter(function(r){ return (s(x.crmId) && s(r.id) === s(x.crmId)) || (s(x.portalUserId) && s(r.bidPortalUserId) === s(x.portalUserId)) || (alias && (s(r.id) === alias || arr(r.portalAliases).indexOf(alias) > -1)); })[0];
  if (link) return { kind: 'strong', rec: link, why: 'linked', cands: [{ rec: link, why: 'linked' }] };
  /* 2. e-mail / phone / company name */
  var xe = emailsOf({ email: x.email, altEmails: x.altEmails }), xp = phonesOf({ phone: x.phone, altPhones: x.altPhones }), xc = cosOf({ name: x.company, dba: x.dba });
  var hits = [];
  pool.forEach(function(r){
    var why = [];
    if (xe.length && emailsOf(r).some(function(e){ return xe.indexOf(e) > -1; })) why.push('e-mail');
    if (xp.length && phonesOf(r).some(function(p){ return xp.indexOf(p) > -1; })) why.push('phone');
    if (xc.length && cosOf(r).some(function(c){ return xc.indexOf(c) > -1; })) why.push('company name');
    if (why.length) hits.push({ rec: r, why: why.join(' + ') });
  });
  if (hits.length === 1) return { kind: 'strong', rec: hits[0].rec, why: hits[0].why, cands: hits };
  if (hits.length > 1) return { kind: 'weak', rec: null, why: 'more than one CRM sub matches', cands: hits.slice(0, 5) };
  /* 3. weak: a similar company name, or the same person in the same city / state */
  var xn = personOf({ contact: x.contact || x.name }), xcity = low(x.city), xst = low(x.state), weak = [];
  pool.forEach(function(r){
    var why = '';
    if (xc.length && cosOf(r).some(function(c){ return xc.some(function(y){ return similarCo(c, y); }); })) why = 'similar company name';
    else if (xn && xn.indexOf(' ') > 0 && personOf(r) === xn && ((xcity && low(r.city || r.address).indexOf(xcity) > -1) || (xst && (low(r.state) === xst || new RegExp('\\b' + xst + '\\b').test(low(r.address)))))) why = 'same contact name and city / state';
    if (why) weak.push({ rec: r, why: why });
  });
  if (weak.length) return { kind: 'weak', rec: null, why: weak[0].why, cands: weak.slice(0, 5) };
  return { kind: 'none', rec: null, why: '', cands: [] };
}
/* fill only what is empty; a different e-mail / phone goes on as an extra contact; link it to the portal account */
function merge(rec, x, at){
  var n = 0, put = function(k, v){ v = s(v); if (v && !s(rec[k])) { rec[k] = v; n++; } };
  at = at || new Date().toISOString();
  var hadPhones = phonesOf(rec), hadEmails = emailsOf(rec);   /* what the record knew before this merge */
  put('company', x.company); put('contact', x.contact || x.name); put('license', x.license || x.licenses); put('city', x.city); put('state', x.state); put('zip', x.zip);
  var t = arr(x.trades).map(s).filter(Boolean); if (!t.length && s(x.trade)) t = s(x.trade).split(/\s*,\s*/).filter(Boolean);
  if (t.length && !s(rec.trade)) { rec.trade = t.join(', '); if (!arr(rec.trades).length) rec.trades = t; n++; }
  var addr = [s(x.address), s(x.city), [s(x.state), s(x.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (addr && !s(rec.address)) { rec.address = addr; n++; }
  var e = low(x.email);
  if (okEmail(e)) {
    if (!s(rec.email)) { rec.email = e; n++; }
    else if (hadEmails.indexOf(e) < 0) { rec.altEmails = arr(rec.altEmails).concat([e]); if (!s(rec.altEmail)) rec.altEmail = e; rec.contacts = arr(rec.contacts).concat([{ name: s(x.contact || x.name), email: e, phone: s(x.phone), source: s(x.source) || 'bid portal', at: at }]); n++; }
  }
  var p = s(x.phone);
  if (phone10(p)) {
    if (!s(rec.phone)) { rec.phone = p; n++; }
    else if (hadPhones.indexOf(phone10(p)) < 0) { rec.altPhones = arr(rec.altPhones).concat([p]); if (!s(rec.altPhone)) rec.altPhone = p; if (!arr(rec.contacts).some(function(c){ return c && low(c.email) === e && e; })) rec.contacts = arr(rec.contacts).concat([{ name: s(x.contact || x.name), email: '', phone: p, source: s(x.source) || 'bid portal', at: at }]); n++; }
  }
  if (s(x.portalUserId) && !s(rec.bidPortalUserId)) { rec.bidPortalUserId = s(x.portalUserId); n++; }
  if (okEmail(e)) { var a = sbpId(e); if (s(rec.id) !== a && arr(rec.portalAliases).indexOf(a) < 0) { rec.portalAliases = arr(rec.portalAliases).concat([a]); n++; } }
  if (!rec.onBidSite && x.onBidSite !== false) { rec.onBidSite = true; n++; }
  if (arr(rec.tags).indexOf('On bid portal') < 0) { rec.tags = arr(rec.tags).concat(['On bid portal']); n++; }
  if (n && !s(rec.bidPortalLinkedAt)) rec.bidPortalLinkedAt = at;
  return n;
}
var API = { match: match, merge: merge, normCo: normCo, phone10: phone10, emailsOf: emailsOf, phonesOf: phonesOf, keyOf: keyOf, sbpId: sbpId, similarCo: similarCo };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (root) root._gcSubMatch = API;
})(typeof window !== 'undefined' ? window : null);
