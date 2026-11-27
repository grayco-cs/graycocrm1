/* netlify/functions/_lib/apmail.js — patch APEMAILS: who gets the money mail of a customer account.

   Owner (11/27): "make sure i can put client emails and on the account for a customer i can also put accounts [payable]
   sometimes its more than 1 so when i submit for invoice on my system i also email their accounts payable our invoices etc"

   A customer (data.customers) carries two lists, edited on the customer (CRM → Customers → Edit Customer):
     gcInfo.apEmails : [{ email, name }]   accounts payable — invoices, statements and past-due reminders go TO these
     clientEmails    : [{ email, name }]   the client's own people — copied (CC) on money mail, the only ones on everyday mail
   The old single fields stay the first item: gcInfo.billingEmail = apEmails[0], email = clientEmails[0]. A record with only
   the old fields reads as a one-item list. gcInfo.removedEmails (lower case) remembers what someone took off the lists:
   such an address is never used again for this account, even when an older job or invoice still carries it.
   A job adds its own client e-mail (clientEmail) and, optionally, moreClientEmails ("a@x.com, b@y.com").

   billTo(data, job, given) → { to:[], cc:[], ap:true|false, custom:true|false, blocked:true|false, why }
     · given (the address a screen or a sweep was about to use) is not one this account knows → left alone (custom);
     · the account has accounts payable → TO every AP address, CC the client e-mails (the account's + the job's);
     · no AP → TO the client e-mails (as before);
     · a removed or malformed address is never in either list; addresses are de-duplicated (case-insensitive).
   The CRM (index.html, window._gcAcctMail) uses the same rule — tools/tests/test_APEMAILS.mjs checks both agree. */
'use strict';
const RE = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i;
const MAX = 10;
/* the customer money papers that go to accounts payable (an approval item's kind) */
const MONEY_KINDS = { invoice: 1, final_invoice: 1, final_reminder: 1, payment_reminder: 1, invoice_statement: 1, customer_statement: 1, pay_app: 1 };
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function ok(e){ return RE.test(s(e)); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function isMoneyKind(k){ return !!MONEY_KINDS[s(k)]; }
/* "a@x.com, b@y.com" / ['a@x.com'] / [{email}] → ['a@x.com', 'b@y.com'] (as typed, not checked) */
function split(v){
  const l = Array.isArray(v) ? v : s(v).split(/[,;]+/);
  return l.map(function(x){ return s(x && typeof x === 'object' ? x.email : x); }).filter(Boolean);
}
function rowsOf(v){ return arr(v).map(function(x){ return x && typeof x === 'object' ? { email: s(x.email), name: s(x.name) } : { email: s(x), name: '' }; }); }
/* the list with the old single field as its first item: the single field wins when the two differ (it was changed somewhere
   that only knows the one field; emptied there = that address is off the list), and an empty list reads as [single] */
function merged(single, list){
  const L = rowsOf(list), one = s(single);
  if (!one) return L.length && s(L[0].email) ? L.slice(1) : L;   /* the single field was emptied: its address is off the list */
  if (!L.length) return [{ email: one, name: '' }];
  if (low(L[0].email) === low(one)) return L;
  return [{ email: one, name: L[0].name }].concat(L.slice(1).filter(function(x){ return low(x.email) !== low(one); }));
}
function gi(c){ return (c && c.gcInfo && typeof c.gcInfo === 'object') ? c.gcInfo : {}; }
function removedOf(c){ const o = {}; arr(gi(c).removedEmails).concat(arr(c && c.removedEmails)).forEach(function(e){ if (s(e)) o[low(e)] = 1; }); return o; }
function clean(rows, gone, seen){
  const out = [];
  rows.forEach(function(x){ const e = low(x.email); if (!ok(e) || gone[e] || seen[e]) return; seen[e] = 1; out.push({ email: e, name: s(x.name) }); });
  return out;
}
function apRows(c){ return c ? merged(gi(c).billingEmail, gi(c).apEmails) : []; }
function clientRows(c){ return c ? merged(c.email, (c.clientEmails != null ? c.clientEmails : gi(c).clientEmails)) : []; }
function jobRows(p){
  if (!p) return [];
  return [{ email: s(p.clientEmail || p.customerEmail), name: '' }].concat(split(p.moreClientEmails).map(function(e){ return { email: e, name: '' }; }));
}
/* the account (customer record) of a job: its customerId, else the customer with the job's client name */
function custOf(data, p, name){
  const L = arr(data && data.customers).filter(function(x){ return x && typeof x === 'object' && x.deleted !== true; });
  const id = s(p && p.customerId);
  if (id) { const c = L.find(function(x){ return s(x.id) === id; }); if (c) return c; }
  const nm = low(name || (p && (p.client || p.customer || p.clientName)));
  if (!nm) return null;
  return L.find(function(x){ return low(x.name) === nm; }) || L.find(function(x){ return low(x.company) === nm; }) || null;
}
/* { ap:[{email,name}], client:[{email,name}], removed:{} } for a job (or a customer when there is no job) */
function lists(data, p, cust){
  const c = cust || custOf(data, p), gone = removedOf(c), seen = {};
  const ap = clean(apRows(c), gone, seen).slice(0, MAX);
  const client = clean(clientRows(c).concat(jobRows(p)), gone, seen).slice(0, MAX);
  return { cust: c, ap: ap, client: client, removed: gone };
}
function billTo(data, p, given, cust){
  const L = lists(data, p, cust), g = low(split(given)[0]);
  const known = {}; L.ap.concat(L.client).forEach(function(x){ known[x.email] = 1; });
  const out = { to: [], cc: [], ap: false, custom: false, blocked: false, why: '', account: L.cust ? s(L.cust.name || L.cust.company) : '' };
  if (g && ok(g) && !known[g] && !L.removed[g]) {
    /* an address this account does not know: someone typed it on purpose — it is used as it is, nothing added */
    if (L.ap.length || L.client.length) { out.to = [g]; out.custom = true; out.why = 'an address typed for this paper (not on the account)'; return out; }
    out.to = [g]; out.why = 'the only address on file'; return out;
  }
  if (L.ap.length) {
    out.to = L.ap.map(function(x){ return x.email; });
    out.cc = L.client.map(function(x){ return x.email; }).filter(function(e){ return out.to.indexOf(e) < 0; });
    out.ap = true; out.why = 'accounts payable on file' + (out.cc.length ? ', the client copied' : '');
    return out;
  }
  out.to = L.client.map(function(x){ return x.email; });
  out.why = out.to.length ? 'no accounts payable on file — the client' : '';
  if (!out.to.length && g && L.removed[g]) { out.blocked = true; out.why = g + ' was removed from ' + (out.account || 'the customer'); }
  return out;
}
/* the first address an invoice would go to (for the "no e-mail on file" checks) */
function firstTo(data, p, given){ const b = billTo(data, p, given); return b.to[0] || ''; }

/* ── an approval item ── */
/* at queue time: o.to / o.cc → TO every AP address, the client in CC (o is copied, never changed) */
function addressItem(data, p, o, cust){
  if (!o || !isMoneyKind(o.kind) || o.channel === 'sms' || o.channel === 'portal') return o;
  const b = billTo(data, p, o.to, cust);
  if (b.custom || (!b.to.length && !b.blocked)) return o;
  const cc = uniq(split(o.cc).concat(b.cc)).filter(function(e){ return ok(e) && b.to.indexOf(low(e)) < 0 && !lists(data, p, cust).removed[low(e)]; }).slice(0, MAX);
  return Object.assign({}, o, { to: b.to[0] || '', toMore: b.to.slice(1), cc: cc, apAuto: { to: b.to.slice(), cc: b.cc.slice(), why: b.why, at: new Date().toISOString() } });
}
function uniq(l){ const seen = {}; return l.map(low).filter(function(e){ if (!e || seen[e]) return false; seen[e] = 1; return true; }); }
/* at send time (approved now, or an approved reminder going again): the account as it is NOW.
   · a removed address (or one taken off the account since this was queued) never goes;
   · nobody edited To → the AP list as it is now (a new AP address is included);
   · an approver typed the To → kept, only removed addresses dropped.
   Returns { to:[], cc:[] }. */
function atSend(data, p, item, cust){
  const L = lists(data, p, cust), now = billTo(data, p, item.to, cust);
  const onAcct = {}; L.ap.concat(L.client).forEach(function(x){ onAcct[x.email] = 1; });
  const auto = {}; if (item.apAuto) split(item.apAuto.to).concat(split(item.apAuto.cc)).forEach(function(e){ auto[low(e)] = 1; });
  const keep = function(e){ e = low(e); return ok(e) && !L.removed[e] && !(auto[e] && !onAcct[e]); };
  const editedTo = (item.edits || []).some(function(x){ return (x.fields || []).indexOf('to') >= 0; });
  let to = [s(item.to)].concat(split(item.toMore)).map(low).filter(keep);
  if (!editedTo && item.apAuto && !now.custom && now.to.length) to = now.to.slice();
  to = uniq(to);
  let cc = split(item.cc).map(low).filter(keep);
  if (!editedTo && item.apAuto && now.ap && !now.custom) cc = cc.concat(now.cc);
  cc = uniq(cc).filter(function(e){ return to.indexOf(e) < 0; });
  return { to: to.slice(0, MAX), cc: cc.slice(0, MAX) };
}
module.exports = { ok, split, lists, billTo, firstTo, custOf, addressItem, atSend, isMoneyKind, MONEY_KINDS, merged, removedOf };
