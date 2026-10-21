/* ============================================================================
   GrayCo — SUPPLIER ORDERS INTO THE CRM (patch AUTO7, item 5).   netlify/functions/_lib/fa-orders.js

   Owner (10/21): "Those companies probably can't send to our CRM; they'll go to office. Can we still put into CRM and
   portal?" Yes: supplier mail keeps going to office@, and a Google Workspace routing rule ALSO delivers a copy to
   orders@in.grayco-cs.com (docs/ORDERS-SETUP.md) — the same Resend receiving domain and webhook as bids@, handled by
   bid-inbox.js. Anyone can also forward a confirmation to orders@in.grayco-cs.com by hand.

   One e-mail → one record in gc_kv "gc_orders" { id, supplier, orderNo, poRef, deliveryDate, items[], summary, pid,
   matchedBy (PO / address / name), status matched | unmatched | assigned, subject, from, at }.
   Matched to a job (its PO, then its street address, then its name):
     · the Site Book (gc_kv "gc_sitebook", patch RP) gets the delivery (id ORD-…) → "Deliveries today", the 7 AM dispatch;
     · the CRM puts it on the job's schedule (patch AUTO7 in index.html: "🚚 Delivery — <supplier>") and the job's
       🚚 Materials & orders list;
     · the customer portal shows "Materials arriving <day>" (portal-extra.js — never prices, never the supplier's papers).
   Not matched → Office To-Do "Unmatched supplier orders" (patch AUTO7) to pick the job.
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const FA = require('./fa-core.js');
const KEY = 'gc_orders', SB_KEY = 'gc_sitebook';
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function P(){ return require('../portal.js')._core; }

const ORDER_WORDS = /\b(order|confirmation|delivery|delivered|shipping|shipment|ship date|pick ?up|ready for pickup|sales order|packing slip|will call)\b/i;
function looksLikeOrder(mail){
  const from = s(mail.from && mail.from.email), t = s(mail.subject) + ' ' + s(mail.text).slice(0, 3000);
  return FA.SUPPLIERS.some(function(x){ return x[0].test(from); }) || ORDER_WORDS.test(s(mail.subject)) || (ORDER_WORDS.test(t) && /\b(qty|quantity|sq|bundles?|ea)\b/i.test(t));
}
function orderId(mail){ return 'ORD-' + crypto.createHash('sha256').update(s(mail.messageId) || (s(mail.subject) + '|' + s(mail.date) + '|' + s(mail.from && mail.from.email))).digest('hex').slice(0, 16); }

/* the Site Book delivery for a matched order with a date (merged by id like every Site Book list) */
async function sitebookDelivery(rec, deps){
  const C = deps || P();
  if (!rec.pid || !rec.deliveryDate) return false;
  const item = { id: rec.id, date: rec.deliveryDate, item: (rec.summary || 'Materials').slice(0, 160) + (rec.orderNo ? ' (order ' + rec.orderNo + ')' : ''), supplier: rec.supplier, status: 'Expected', at: rec.at, by: 'orders@ (automatic)', updatedAt: rec.at, deleted: false, fromOrder: true };
  /* the Site Book reads the value as a list or as JSON text, so the shared careful list write works here too */
  const has = function(l){ const r = l.find(function(x){ return s(x.id) === rec.pid; }); return !!r && arr(r.deliveries).some(function(d){ return s(d.id) === rec.id; }); };
  const w = await C.kvListUpdate(SB_KEY, function(l){
    if (has(l)) return null;
    let r = l.find(function(x){ return s(x.id) === rec.pid; });
    if (!r) { r = { id: rec.pid }; l.push(r); }
    r.deliveries = arr(r.deliveries).concat([item]); r.updatedAt = new Date().toISOString(); r.updatedBy = 'orders@';
    return { list: l, check: has };
  });
  return !!w.ok;
}

/* bid-inbox.js hands over an e-mail for orders@ (or one that is plainly a supplier's order confirmation) */
async function fromEmail(mail, deps){
  const C = deps || P();
  if (!looksLikeOrder(mail)) return { ok: true, ignored: 'not an order confirmation' };
  const o = FA.parseOrder(mail.subject, mail.text, mail.from && mail.from.email);
  const data = await C.crmData(true);
  const m = FA.matchOrder(o, data.projects, s(mail.subject) + '\n' + s(mail.text).slice(0, 6000));
  const now = new Date().toISOString();
  const rec = Object.assign({ id: orderId(mail), at: now, subject: s(mail.subject).slice(0, 200), from: s(mail.from && mail.from.email).slice(0, 120), pid: m.pid, matchedBy: m.by,
    status: m.pid ? 'matched' : 'unmatched', text: s(mail.text).slice(0, 4000) }, o);
  const has = function(l){ return l.some(function(x){ return s(x.id) === rec.id; }); };
  const w = await C.kvListUpdate(KEY, function(l){ return has(l) ? null : { list: l.concat([rec]).slice(-1500), check: has }; });
  if (!w.ok) throw new Error('could not save the order (' + (w.error || 'busy') + ')');
  if (w.unchanged) return { ok: true, already: true, order: rec.id };
  let sb = false; try { sb = await sitebookDelivery(rec, C); } catch (e) {}
  return { ok: true, order: rec.id, pid: rec.pid, matchedBy: rec.matchedBy, deliveryDate: rec.deliveryDate, sitebook: sb };
}
/* the CRM assigns an unmatched order to a job (the office picks it) — through the CRM's own write; this is the server
   half for the delivery on the Site Book */
module.exports = { fromEmail, looksLikeOrder, sitebookDelivery, orderId, KEY, ORDER_WORDS };
