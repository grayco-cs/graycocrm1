// netlify/functions/office-board.js — patch OFFFEAT (owner 10/30): the office's Collections board, sub paperwork,
// lien waivers / deadlines and unsigned change orders (the rules are in _lib/offfeat.js and _lib/lien-deadlines.js).
// Every action that would reach a customer, a sub or a GC only puts ONE item on ✅ Approvals — nothing is sent here.
//   GET  ?ping=1                                      → alive
//   Signed in to the CRM (gc_staff):
//   POST { action:'remind', invoiceId }               → "Send payment reminder" (kind payment_reminder; one open per invoice)
//   POST { action:'cos', pid? }                       → change orders sent and not signed (days waiting, open / last nudge)
//   POST { action:'nudge', ref }                      → "Nudge" (kind sign_co_nudge / gcp_co_nudge; one open per change order)
//   POST { action:'subdoc', subId, need? }            → "Request docs" (kind sub_doc_request; one open per sub)
//   POST { action:'lienw', invoiceId, kind }          → GrayCo's conditional / unconditional lien waiver for a customer payment (kind lien_waiver)
//   POST { action:'wording' }                         → the lien-waiver wording (built-in DRAFT text unless edited)
//   POST { action:'wording', set:{ <key>: text } }    → (admins + the office) save the wording; empty = back to the built-in text
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const OFF = require('./_lib/offfeat.js');
const A = require('./_lib/auto-common.js');
const JH = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
function J(code, body){ return { statusCode: code, headers: JH, body: JSON.stringify(body) }; }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
async function officeOrAdmin(who){
  if (require('./_lib/staff-role.js').isAdmin(who) || /office/.test(low(who.role))) return true;   /* patch AUTHFIX (r17b): the one admin rule */
  try { return !!(await A.core().isOffice(who)); } catch (e) { return false; }
}
exports.handler = async function(event){
  event = event || {};
  const qs = event.queryStringParameters || {};
  if ((event.httpMethod || 'GET') === 'GET') return qs.ping === '1' ? J(200, { ok: true, service: 'GrayCo office board' }) : J(405, { ok: false, error: 'POST only.' });
  if (event.httpMethod !== 'POST') return J(405, { ok: false, error: 'POST only.' });
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Bad request.' }); }
  const who = await A.core().gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode || 401, { ok: false, error: who.error || 'Sign in to the CRM.' });
  const act = s(b.action);
  try {
    if (act === 'remind') { const r = await OFF.remind(b, who); return J(r.status, r.out); }
    if (act === 'cos') return J(200, { ok: true, cos: await OFF.cos({ pid: s(b.pid) }) });
    if (act === 'nudge') { const r = await OFF.nudge(b, who); return J(r.status, r.out); }
    if (act === 'subdoc') { const r = await OFF.subDoc(b, who); return J(r.status, r.out); }
    if (act === 'lienw') { const r = await OFF.lienCustomer(b, who); return J(r.status, r.out); }
    if (act === 'wording') {
      if (b.set && typeof b.set === 'object') {
        if (!(await officeOrAdmin(who))) return J(403, { ok: false, error: 'Only the office or an admin can change the waiver wording.' });
        const w = await OFF.wordingSet(b.set, who);
        return w ? J(200, Object.assign({ ok: true }, w)) : J(502, { ok: false, error: 'Not saved — try again.' });
      }
      return J(200, Object.assign({ ok: true }, await OFF.wording()));
    }
  } catch (e) { return J(500, { ok: false, error: 'The office board hit a problem: ' + s(e && e.message || e).slice(0, 140) }); }
  return J(400, { ok: false, error: 'Bad request.' });
};
