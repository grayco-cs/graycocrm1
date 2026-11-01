/* ============================================================================
   custall.js: every customer on the Customers list (patch CUSTALL)

   Owner: "If any customer goes into our system in any way they get entered into our customer database".
   Owner: "Some customers have multiple jobs or multiple addresses — make sure that doesn't combine, it just goes
   under that customer's jobs etc."

   ONE rule for the CRM page (patch CUSTALL inlines THIS FILE, word for word, as window._gcCustAllCore) and for
   Node (tests, any server function that wants it). Pure: no DOM, no storage, no clock unless one is passed in.

   Who a record's customer is (cand):
     job      p.client (+ clientPhone / clientEmail / address)
     lead     contactName / contact.name / client / customer, else the lead's name (CompanyCam / QuickBooks /
              manual leads are named after the customer; Lead Inbox bids are not, and are skipped)
     invoice  a client invoice's client / customer (a sub's bill is skipped), with its job's contact info
     estimate client / fields.client (a GC's bid estimate is skipped)
   Not customers (skipped): subs / suppliers / vendors, staff, GCs and owners on bid leads (prime or sub bids from
   the Lead Inbox, plan rooms, public boards), job applicants, test names ("(Sample Customer)", "Test", "Demo"),
   blank / junk names and record ids.

   Match, first answer wins (the customer profile's own rules):
     1. the record's customerId                     → that customer
     2. the same e-mail (the customer's or a contact's)
     3. the same phone (10 digits, the customer's or a contact's)
     4. the same name AND the same street (the customer's address or one of its properties)
     A name alone is NOT a match: it is never linked automatically ("check": a person decides).
     A different person at a known address (a new owner) with no phone / e-mail match is a NEW customer.
   A match only fills EMPTY fields (phone, e-mail, address, company, city / state / zip). A new address for a
   known customer is added to its properties; the customer's own address, name and anything typed stay.
   One customer keeps all its jobs: jobs are linked (customerId), never merged.
   A new customer's id is a hash of the normalized e-mail, phone, or name + street, so two computers adding the
   same person at the same time make the same record (no duplicate).
   ============================================================================ */
(function(root){
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function norm(v){ return low(v).replace(/&/g, ' and ').replace(/[’'`.,]/g, '').replace(/[^a-z0-9@]+/g, ' ').trim(); }
function phone10(v){ var d = s(v).replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? d : ''; }
function email(v){ var e = low(v); return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) ? e : ''; }
function street(v){ return norm(s(v).split(',')[0]).replace(/\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|cove|cv|court|ct|boulevard|blvd|place|pl|circle|cir|parkway|pkwy|highway|hwy|trail|trl|way)\b/g, '').replace(/\s+/g, ' ').trim(); }
function hash(str){   /* two FNV-1a 32-bit passes → 12 hex: the same everywhere */
  var h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 ^= c; h1 = Math.imul(h1, 16777619) >>> 0; h2 ^= c; h2 = Math.imul(h2, 2246822519) >>> 0; h2 ^= h2 >>> 13; }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + (h2 >>> 0).toString(16)).slice(-4);
}

/* ── who is not a customer ─────────────────────────────────────────────────── */
var TEST = /\(\s*sample|\bsample\s+(customer|client|homeowner|job)\b|\btest(ing)?\b|\bdemo\b|\bdummy\b|\bfake\b|\basdf|\bqwerty\b|^x+$|lorem ipsum/i;
var GENERIC = /^(customer|client|homeowner|home owner|owner|unknown|n\/?a|na|none|tbd|tba|no name|new customer|new lead|lead|companycam lead|quickbooks customer|website lead|text message|missed call|caller|walk ?in|cash|misc|various|grayco|grayco construction( services)?|gray ?co cs|self|personal|reminder|-+|\?+)$/i;
var ADDR = /\b(tn|ms|ar|al|ky|mo|ga)\s*\d{5}\b|\b\d{5}(-\d{4})?\s*,?\s*$|^\d+\s+[a-z0-9 .]+\b(st|street|rd|road|ave|avenue|dr|drive|ln|lane|cv|cove|blvd|ct|court|pkwy|hwy|way|pl|cir)\b\.?\s*(,|$)/i;
function looksId(v){ v = s(v); return !!v && !/\s/.test(v) && (/^(LCC|LQB|LCCR|LGN|LDUP|LEAD|L|QB|CUS|CUSA|PRJ|P|INV|EST)_/i.test(v) || /^PRJ[a-z0-9]{6,}$/i.test(v) || /^cust_?[0-9a-z]{6,}$/i.test(v) || /^[0-9a-f-]{16,}$/i.test(v)); }
function junkName(n){
  n = s(n);
  if (!n || n.length < 2 || !/[a-z]/i.test(n)) return 'blank';
  if (looksId(n)) return 'an id, not a name';
  if (GENERIC.test(n.replace(/[.:!]+$/, ''))) return 'not a name';
  if (TEST.test(n)) return 'a test / sample name';
  if (ADDR.test(n)) return 'an address, not a name';
  return '';
}
var BID_SRC = /buildingconnected|building\s*connected|plan\s*hub|a\s*&\s*b\s*plan|aandb|\brka\b|plan\s*-?rooms?|isqft|construct\s*connect|\bdodge\b|bidclerk|smart\s*bid|pipeline\s*suite|bid\s*platform|^government$|sam\.gov|\bschools?\b|\bcounty\b|\bcity\s+of\b|\bstate\s+of\b|\bmscaa\b|\bmlgw\b|\bairport\b|housing\s+authority|universit|procurement|bureau\s+of\s+building/i;
function bidLead(l){
  if (!l || typeof l !== 'object') return '';
  var role = low(l.bidRole);
  if (role === 'prime' || role === 'sub') return 'a ' + role + ' bid (the company is a GC / owner, not a homeowner)';
  if (/^government$/i.test(s(l.leadKind))) return 'a public bid';
  if (s(l.bidDue) || s(l.dueToCompany) || s(l.bidNumber) || l.preBid === true || s(l.bidPortalJob) || s(l.bidStatus) || (arr(l.plansLinks).length && !l.websiteLead)) return 'a bid lead';
  if (BID_SRC.test(s(l.source) + ' ' + s(l.leadSource))) return 'a bid lead (' + s(l.source || l.leadSource) + ')';
  if (s(l.inboxId) && !l.websiteLead && !(l.leadExtra && l.leadExtra.websiteLead) && /commercial|government/i.test(s(l.leadKind))) return 'a Lead Inbox bid';
  try {
    var C = root && root._gcBidRoleCore ? root._gcBidRoleCore : (typeof require === 'function' ? require('./bid-role.js') : null);
    if (C && s(l.inboxId)) { var r = C.role(l); if (r) return 'a ' + r + ' bid'; }
  } catch (e) {}
  return '';
}
function applicant(l){
  var x = (l && l.leadExtra) || {};
  return /career|job applica|employment|apply/i.test([l && l.websiteForm, l && l.sourceRef, x.websiteForm, x.websiteType, l && l.type].map(s).join(' ')) ? 'a job applicant' : '';
}
/* ctx: who is staff / a sub (names, phones, e-mails) and the jobs by id */
function ctxOf(data){
  data = data || {};
  var names = {}, phones = {}, emails = {}, staff = {}, byId = {};
  arr(data.subs).concat(arr(data.vendors)).forEach(function(x){
    if (!x) return; [x.name, x.company, x.contact, x.dba].forEach(function(n){ n = norm(n); if (n) names[n] = 1; });
    var p = phone10(x.phone); if (p) phones[p] = 1; var e = email(x.email); if (e) emails[e] = 1;
  });
  arr(data.users).forEach(function(u){ if (!u) return; var n = norm(u.name); if (n && n.indexOf(' ') > 0) staff[n] = 1; var e = email(u.email); if (e) staff[e] = 1; var p = phone10(u.phone); if (p) staff[p] = 1; });
  arr(data.projects).forEach(function(p){ if (p && p.id != null) byId[s(p.id)] = p; });
  return { subNames: names, subPhones: phones, subEmails: emails, staff: staff, jobs: byId, jobCust: {} };   /* jobCust: job id → its customer, as they are linked */
}
function notCustomer(c, ctx){
  var j = junkName(c.name); if (j) return j;
  ctx = ctx || {};
  var n = norm(c.name), co = norm(c.company);
  if ((ctx.subNames || {})[n] || (co && (ctx.subNames || {})[co] && !c.phone && !c.email)) return 'a sub / supplier';
  if ((c.phone && (ctx.subPhones || {})[c.phone]) || (c.email && (ctx.subEmails || {})[c.email])) return 'a sub / supplier';
  var st = ctx.staff || {};
  if (st[n] || (c.email && st[c.email]) || (c.phone && st[c.phone])) return 'staff';
  return '';
}

/* ── the customer on a record ──────────────────────────────────────────────── */
function cand(o, kind, rec){
  var c = { name: s(o.name).replace(/\s+/g, ' '), phone: phone10(o.phone), phoneRaw: s(o.phone), email: email(o.email), address: s(o.address),
    city: s(o.city), state: s(o.state), zip: s(o.zip), company: s(o.company), customerId: s(o.customerId), source: s(o.source),
    kind: kind, ref: s(rec && rec.id), label: s(o.label) };
  return c;
}
function fromJob(p, ctx){
  if (!p || p.deleted || p._deleted) return { skip: 'deleted' };
  var c = cand({ name: p.client || p.customer, phone: p.clientPhone || p.customerPhone || p.phone, email: p.clientEmail || p.customerEmail,
    address: p.address, city: p.city, state: p.state, zip: p.zip, company: p.company, customerId: p.customerId || p.custId, source: 'Job', label: p.name || p.po || p.id }, 'job', p);
  var why = notCustomer(c, ctx); return why ? { skip: why, cand: c } : { cand: c };
}
function fromLead(l, ctx){
  if (!l || l.deleted || l._deleted || l.mergedInto) return { skip: 'deleted / merged' };
  var why = bidLead(l) || applicant(l); if (why) return { skip: why };
  var ct = l.contact && typeof l.contact === 'object' ? l.contact : {};
  var person = s(l.contactName) || s(ct.name) || (typeof l.contact === 'string' ? s(l.contact) : '') || s(l.client) || s(l.customer);
  /* a CompanyCam lead is named after the CompanyCam project (a title), a website / inbox lead after the request: only a person counts */
  var cc = !!(s(l.ccamId) || s(l.fromProjectId) || /companycam/i.test(s(l.source))), pj = ((ctx || {}).jobs || {})[s(l.fromProjectId)] || null;
  var nm = person || (cc ? s(pj && pj.client) : (l.websiteLead || s(l.inboxId)) ? '' : s(l.name));
  var fromJob = !person && pj && nm;   /* the CompanyCam job's customer: its phone / e-mail / address and its link too */
  var c = cand({ name: nm, phone: l.phone || ct.phone || (fromJob ? pj.clientPhone || pj.customerPhone : ''), email: l.email || ct.email || (fromJob ? pj.clientEmail || pj.customerEmail : ''),
    address: l.address || (fromJob ? pj.address : ''), city: l.city, state: l.state, zip: l.zip,
    company: s(l.company) && low(l.company) !== low(nm) && !cc ? l.company : '', customerId: l.customerId || (fromJob ? s(pj.customerId) || s(((ctx || {}).jobCust || {})[s(pj.id)]) : ''), source: 'Lead' + (s(l.source) ? ' — ' + s(l.source) : ''), label: l.title || l.name || l.id }, 'lead', l);
  why = notCustomer(c, ctx); return why ? { skip: why, cand: c } : { cand: c };
}
function fromInvoice(i, ctx){
  if (!i || i.deleted || i._deleted) return { skip: 'deleted' };
  if (/^sub/i.test(s(i.type)) || s(i.sub) || s(i.subId)) return { skip: 'a sub’s bill' };
  var p = ((ctx || {}).jobs || {})[s(i.pid)] || null, nm = s(i.client || i.customer || i.customerName) || s(p && p.client);
  var same = p && norm(p.client) === norm(nm);
  var c = cand({ name: nm, phone: i.clientPhone || (same ? p.clientPhone || p.customerPhone || p.phone : ''), email: i.clientEmail || i.email || (same ? p.clientEmail || p.customerEmail : ''),
    address: i.billingAddress || i.address || (same ? p.address : ''), customerId: i.customerId || (same ? s(p.customerId) || s(((ctx || {}).jobCust || {})[s(p.id)]) : ''), source: 'Invoice', label: (i.invNum || i.po || i.id) + (p ? ' — ' + s(p.name) : '') }, 'invoice', i);
  var why = notCustomer(c, ctx); return why ? { skip: why, cand: c } : { cand: c };
}
function fromEstimate(e, ctx){
  if (!e || e.deleted || e._deleted || e._isDraft) return { skip: 'deleted / draft' };
  var f = e.fields || {};
  if (s(e.gc) && !s(e.client || f.client)) return { skip: 'a GC’s bid estimate' };
  var p = ((ctx || {}).jobs || {})[s(e.pid)] || null, nm = s(e.client || e.customer || e.clientName || f.client || f.name) || s(p && p.client);
  var same = p && norm(p.client) === norm(nm);
  var c = cand({ name: nm, phone: e.clientPhone || f.phone || (same ? p.clientPhone : ''), email: e.clientEmail || e.email || f.email || (same ? p.clientEmail : ''),
    address: e.address || f.address || (same ? p.address : ''), customerId: e.customerId || (same ? s(p.customerId) || s(((ctx || {}).jobCust || {})[s(p.id)]) : ''), source: 'Estimate', label: e.name || e.num || e.id }, 'estimate', e);
  var why = notCustomer(c, ctx); return why ? { skip: why, cand: c } : { cand: c };
}
var FROM = { job: fromJob, lead: fromLead, invoice: fromInvoice, estimate: fromEstimate };

/* ── match / fill / new ────────────────────────────────────────────────────── */
function keysOf(c){
  var cs = arr(c.contacts);
  return {
    names: [c.name, c.company].concat(cs.map(function(x){ return x && x.name; })).map(norm).filter(Boolean),
    emails: [c.email].concat(cs.map(function(x){ return x && x.email; })).map(email).filter(Boolean),
    phones: [c.phone].concat(cs.map(function(x){ return x && x.phone; })).map(phone10).filter(Boolean),
    streets: [c.address].concat(arr(c.properties).map(function(x){ return x && typeof x === 'object' ? x.address : x; })).map(street).filter(Boolean)
  };
}
function match(list, c){
  list = arr(list);
  var by = function(test, how){ for (var i = 0; i < list.length; i++) { var x = list[i]; if (x && !x.deleted && test(x, keysOf(x))) return { c: x, by: how }; } return null; };
  var st = street(c.address), n = norm(c.name);
  return (c.customerId && by(function(x){ return s(x.id) === c.customerId; }, 'id')) ||
    (c.email && by(function(x, k){ return k.emails.indexOf(c.email) >= 0; }, 'email')) ||
    (c.phone && by(function(x, k){ return k.phones.indexOf(c.phone) >= 0; }, 'phone')) ||
    (n && st && by(function(x, k){ return k.names.indexOf(n) >= 0 && k.streets.indexOf(st) >= 0; }, 'name + address')) ||
    (n && by(function(x, k){ return k.names.indexOf(n) >= 0; }, 'name only')) || null;
}
function fill(x, c, at){   /* → the filled copy, or null when nothing was empty */
  var next = Object.assign({}, x), ch = [];
  var put = function(k, v){ if (v && !s(next[k])) { next[k] = v; ch.push(k); } };
  put('phone', c.phoneRaw || c.phone); put('email', c.email); put('company', c.company);
  if (c.address) {
    if (!s(next.address)) { next.address = c.address; ch.push('address'); put('city', c.city); put('state', c.state); put('zip', c.zip); }
    else if (keysOf(next).streets.indexOf(street(c.address)) < 0) {
      next.properties = arr(next.properties).concat([{ address: c.address, from: c.kind + ':' + c.ref, addedAt: at || '' }]); ch.push('properties');
    }
  }
  if (!ch.length) return null;
  next.updatedAt = at || next.updatedAt; next.savedAt = at || next.savedAt;
  return { c: next, changed: ch };
}
function idFor(c){
  var k = c.email ? 'e:' + c.email : c.phone ? 'p:' + c.phone : 'n:' + norm(c.name) + '|' + street(c.address);
  return 'CUSA_' + hash(k);
}
function make(c, at, by){
  var day = s(at).slice(0, 10);
  var x = { id: idFor(c), name: c.name, email: c.email, phone: c.phoneRaw || c.phone, address: c.address, company: c.company,
    city: c.city, state: c.state, zip: c.zip, source: c.source || 'CRM', type: 'homeowner', addedDate: day, created: day, savedAt: at, updatedAt: at,
    by: by || 'auto (patch CUSTALL)', autoAdded: true, autoFrom: c.kind + ':' + c.ref };
  Object.keys(x).forEach(function(k){ if (x[k] === '') delete x[k]; });
  if (!x.name) x.name = c.name;
  return x;
}
/* one record into the list. → { list, action: 'linked' | 'filled' | 'new' | 'check' | 'skip', id, by, cust, why } */
function upsert(list, kind, rec, ctx, opt){
  opt = opt || {}; list = arr(list);
  var r = FROM[kind] ? FROM[kind](rec, ctx) : { skip: 'unknown kind' };
  if (r.skip) return { list: list, action: 'skip', why: r.skip, cand: r.cand };
  var c = r.cand, m = match(list, c), at = opt.at || '';
  if (m && m.by === 'name only') return { list: list, action: 'check', id: s(m.c.id), by: m.by, cust: m.c, cand: c, why: 'same name as ' + s(m.c.name) + ' but no phone / e-mail / address match' };
  if (m) {
    var f = fill(m.c, c, at);
    if (!f) return { list: list, action: 'linked', id: s(m.c.id), by: m.by, cust: m.c, cand: c };
    var out = list.map(function(x){ return x === m.c ? f.c : x; });
    return { list: out, action: 'filled', id: s(m.c.id), by: m.by, cust: f.c, cand: c, changed: f.changed };
  }
  var n = make(c, at, opt.by);
  var same = list.filter(function(x){ return x && s(x.id) === n.id; })[0];   /* another computer already made it */
  if (same) return { list: list, action: 'linked', id: n.id, by: 'id', cust: same, cand: c };
  return { list: list.concat([n]), action: 'new', id: n.id, cust: n, cand: c };
}
/* the backfill: every job, lead, client invoice and estimate, in that order, on a copy of the list. Nothing is written. */
function plan(data, opt){
  data = data || {}; opt = opt || {};
  var ctx = ctxOf(data), list = arr(data.customers).slice(), rows = {}, order = [], links = [], counts = { job: 0, lead: 0, invoice: 0, estimate: 0 };
  var tally = { records: 0, onList: 0, matched: 0, filled: 0, created: 0, check: 0, skipped: 0, newCustomers: 0, matchedCustomers: 0, checkCustomers: 0 };
  var srcs = [['job', data.projects], ['lead', data.leads], ['invoice', data.invoices || data.invs], ['estimate', data.estimates]];
  srcs.forEach(function(sx){
    arr(sx[1]).forEach(function(rec){
      if (!rec) return;
      var before = list, u = upsert(list, sx[0], rec, ctx, opt);
      if (u.action === 'skip') { tally.skipped++; return; }
      tally.records++;
      var onList = u.action !== 'check' && u.action !== 'new' && before.some(function(x){ return x && s(x.id) === u.id && !x.__planNew; });
      if (u.action === 'linked' && u.by === 'id' && onList && s(rec.customerId || rec.custId) === u.id) { tally.onList++; return; }   /* already linked by its own customerId */
      list = u.list;
      if (u.action === 'new') u.cust.__planNew = 1;
      var isNew = u.action === 'new' || (u.cust && u.cust.__planNew);
      var key = u.action === 'check' ? 'check:' + u.id + ':' + norm(u.cand.name) : u.id;
      if (!rows[key]) { rows[key] = { key: key, id: u.id, name: u.action === 'check' ? u.cand.name : s(u.cust.name), status: u.action === 'check' ? 'check' : isNew ? 'new' : 'matched',
        by: u.by || '', matchName: u.cust && !isNew ? s(u.cust.name) : '', from: [], fills: [], cand: u.action === 'check' ? u.cand : null }; order.push(key); }
      var row = rows[key];
      row.from.push({ kind: sx[0], id: s(rec.id), label: u.cand.label });
      if (u.changed) row.fills = row.fills.concat(u.changed.filter(function(k){ return row.fills.indexOf(k) < 0; }));
      counts[sx[0]]++;
      if (u.action === 'check') tally.check++; else if (isNew) tally.created++; else if (u.action === 'filled') tally.filled++; else tally.matched++;
      if (u.action !== 'check') { links.push({ kind: sx[0], id: s(rec.id), customerId: u.id }); if (sx[0] === 'job') ctx.jobCust[s(rec.id)] = u.id; }
    });
  });
  var out = order.map(function(k){ return rows[k]; });
  tally.newCustomers = out.filter(function(r){ return r.status === 'new'; }).length;
  tally.matchedCustomers = out.filter(function(r){ return r.status === 'matched'; }).length;
  tally.checkCustomers = out.filter(function(r){ return r.status === 'check'; }).length;
  var clean = list.map(function(x){ if (x && x.__planNew) { var y = Object.assign({}, x); delete y.__planNew; return y; } return x; });
  return { rows: out, counts: counts, tally: tally, customers: clean, links: links };
}

var API = { upsert: upsert, plan: plan, match: match, fill: fill, make: make, idFor: idFor, ctxOf: ctxOf, from: FROM, bidLead: bidLead, junkName: junkName,
  notCustomer: notCustomer, phone10: phone10, email: email, norm: norm, street: street, keysOf: keysOf, hash: hash, V: 1 };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root._gcCustAllCore = API;
})(this);
