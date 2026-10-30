/* ============================================================================
   GrayCo — THE REFERRAL PROGRAM: STACKING CREDIT + ONE-TIME GIFT CODES, the CRM's side.   netlify/functions/referral.js   (patch REF)
   The rules and the store: netlify/functions/_lib/referral.js. The website joins through website-intake.js
   (type "referral"); the customer portal through portal.js (action "referral").

   SCHEDULED (netlify.toml, every hour at :37): referrals → the referred person's job → its first payment (or a signed
   contract, Admin setting) → $100–$500 of credit PROPOSED on the approvals list for the member (suggested by the job's
   contract). Never adds or sends anything by itself: an admin approves (owner rule). Credits stack and never expire.

   STAFF (CRM sign-in, gc_staff):
     POST ?act=apply  { memberId, amount, pid, invoiceId }  use all or part of a member's credit on a job (atomic)
     POST ?act=check  { code }                              is a gift code good (does not use it) — rate-limited
     POST ?act=redeem { code, pid, invoiceId }              use a gift code on that job (and invoice; none = its next invoice)
     GET  ?pending=1                                        credit / used codes not on an invoice yet (the CRM puts them there)
     POST ?act=claim  { id }  /  ?act=applied { id, invoiceId }   one computer puts it on the invoice
     POST ?act=member { name, email, phone, how }           add a member
     POST ?act=refer  { memberId, name, phone, email, address, note }   a referral → a Lead Inbox lead
   ADMINS / OFFICE:
     GET  ?list=1                                           members, referrals, cards (never a code), waiting cards, totals
     GET  ?lookup=<last 4>
   ADMINS:
     POST ?act=credit { memberId, amount, note, referralId } credit by hand (still approved on the list)
     POST ?act=gift   { memberId, amount, note }            a gift code from a member's balance (approved on the list)
     POST ?act=amount { approvalId, amount }                change a waiting credit ($100–$500) / gift code's amount
     POST ?act=void   { id, reason }                        cancel an unused gift code (its amount goes back to the balance)
     GET/POST ?settings=1                                   tiers, trigger, website address, the ad copy
     POST ?act=sweep                                        run the hourly check now
   GET ?ping=1 → alive.
   ENV: nothing new (SUPABASE_*, RESEND_API_KEY are set). REFERRAL_OFF=1 stops the hourly proposals.
   ========================================================================== */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const R = require('./_lib/referral.js');

function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function L(){ return require('./bid-inbox.js')._lib; }
function staffAuth(event){ return require('./bid-inbox.js')._test.staffAuth(event); }
const ORIGINS = ['https://crm.grayco-cs.com', 'https://graycocrm1.netlify.app'];
function J(event, code, body){
  const o = s((event && event.headers && (event.headers.origin || event.headers.Origin)) || '');
  const allow = (env('SITE_ORIGIN') ? env('SITE_ORIGIN').split(',').map(function(x){ return s(x).replace(/\/$/, ''); }) : []).concat(ORIGINS);
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': allow.indexOf(o) >= 0 ? o : ORIGINS[0], Vary: 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }, body: JSON.stringify(body) };
}

/* Netlify's scheduler: no HTTP method (older runtimes), or a POST with { next_run } and no Authorization header */
function isScheduledCall(event){
  if (!event.httpMethod) return true;
  if (event.httpMethod !== 'POST') return false;
  const h = event.headers || {}; if (s(h.authorization || h.Authorization)) return false;
  try { const b = JSON.parse(event.body || '{}'); return !!(b && b.next_run); } catch (e) { return false; }
}
exports.handler = async function(event){
  event = event || {};
  const m = event.httpMethod, qs = event.queryStringParameters || {};
  /* the hourly run. patch AUTOFIX-REF: Netlify calls a scheduled function as a POST whose body is { "next_run": … } (no
     sign-in), not with "no HTTP method" — before, the hourly run fell through to the sign-in check (401) and never swept */
  if (isScheduledCall(event)) {
    if (env('REFERRAL_OFF') === '1' || !L().dbReady()) return { statusCode: 200, body: JSON.stringify({ ok: true, off: true }) };
    try { const r = await R.sweep({}); return { statusCode: 200, body: JSON.stringify(Object.assign({ ok: true }, r)) }; }
    catch (e) { console.error('[referral] sweep failed: ' + (e && e.message)); return { statusCode: 500, body: JSON.stringify({ ok: false }) }; }
  }
  if (m === 'OPTIONS') return J(event, 204, {});
  if (m === 'GET' && qs.ping === '1') return J(event, 200, { ok: true, service: 'GrayCo referral program', database: L().dbReady() });
  if (!L().dbReady()) return J(event, 503, { ok: false, error: 'The CRM database is not configured.' });
  let who = await staffAuth(event);
  if (!who.ok && who.code === 403) { const mm = await require('./_lib/mm.js').auth(event); if (mm.ok) who = mm; }   /* patch MM: the Marketing Manager — read-only, redacted */
  if (!who.ok) return J(event, who.code || 401, { ok: false, error: who.error });
  if (who.marketing) {
    if (m === 'GET' && qs.list === '1') return J(event, 200, require('./_lib/mm.js').redact(Object.assign({ ok: true, admin: false, readOnly: true }, await R.overview())));
    if (m === 'GET' && qs.settings === '1') return J(event, 200, { ok: true, settings: await R.settings(), min: R.MIN, max: R.MAX });
    return J(event, 403, { ok: false, error: 'The Marketing Manager profile sees the referral program read-only.' });
  }
  const office = who.admin || who.office === true || /office/.test(low(who.role));   /* patch OFFICEFULL: who.office */
  const by = who.name || who.email;
  let b = {};
  if (m === 'POST') { try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(event, 400, { ok: false, error: 'Body must be JSON.' }); } }
  try {
    if (m === 'GET' && qs.list === '1') { if (!office) return J(event, 403, { ok: false, error: 'Admins and the office only.' }); return J(event, 200, Object.assign({ ok: true, admin: who.admin }, await R.overview())); }
    if (m === 'GET' && qs.lookup) { if (!office) return J(event, 403, { ok: false, error: 'Admins and the office only.' }); return J(event, 200, { ok: true, cards: await R.lookup(qs.lookup) }); }
    if (m === 'GET' && qs.pending === '1') return J(event, 200, { ok: true, cards: await R.pending() });
    if (qs.settings === '1') {
      if (m === 'GET') return J(event, 200, { ok: true, settings: await R.settings(), min: R.MIN, max: R.MAX });
      if (!office) return J(event, 403, { ok: false, error: 'Only an owner, an admin or the office can change the referral program.' });   /* patch OFFICEFULL */
      return J(event, 200, { ok: true, settings: await R.saveSettings(b, by) });
    }
    if (m !== 'POST') return J(event, 405, { ok: false, error: 'Method not allowed' });
    const act = s(qs.act);
    if (act === 'check') { const r = await R.check(b.code, 'staff:' + low(who.email)); return J(event, r.code, r.body); }
    if (act === 'redeem') { const r = await R.redeem({ code: b.code, pid: s(b.pid), invoiceId: s(b.invoiceId), by, via: 'crm', who: 'staff:' + low(who.email) }); return J(event, r.code, r.body); }
    if (act === 'apply') { const r = await R.applyCredit({ memberId: s(b.memberId), amount: b.amount, pid: s(b.pid), invoiceId: s(b.invoiceId), by, note: b.note, key: s(b.nonce) ? 'crm|' + low(who.email) + '|' + s(b.nonce).slice(0, 40) : '' }); return J(event, r.code, r.body); }
    if (act === 'claim') return J(event, 200, Object.assign({ ok: true }, await R.claimApply(s(b.id), low(who.email))));
    if (act === 'applied') { const c = await R.markApplied(s(b.id), s(b.invoiceId), by); return J(event, c ? 200 : 409, c ? { ok: true, item: c } : { ok: false, error: 'That is not waiting to go on an invoice.' }); }
    if (act === 'member') { const j = await R.join({ name: b.name, email: b.email, phone: b.phone, how: b.how, source: 'crm', by }); return J(event, 200, { ok: true, member: j.member, created: j.created }); }
    if (act === 'refer') {
      const mem = await R.memberById(b.memberId);
      if (!mem) return J(event, 404, { ok: false, error: 'Pick the member who referred them.' });
      const r = await R.refer(mem, b, { via: 'crm', by, how: 'entered in the CRM (referral program)' });
      return J(event, 200, Object.assign({ ok: true }, r));
    }
    if (!office) return J(event, 403, { ok: false, error: 'Only an owner, an admin or the office can do that.' });   /* patch OFFICEFULL */
    if (act === 'credit') {   /* credit by hand — still approved on the list */
      const mem = await R.memberById(b.memberId);
      if (!mem) return J(event, 404, { ok: false, error: 'Pick a member.' });
      const amt = Math.round(Number(b.amount));
      if (!(amt >= R.MIN && amt <= R.MAX)) return J(event, 400, { ok: false, error: 'The amount must be between $' + R.MIN + ' and $' + R.MAX + '.', field: 'amount' });
      const ref = s(b.referralId) ? (await R.referrals()).find(function(x){ return x.id === s(b.referralId); }) : null;
      if (ref && (ref.ledgerId || ref.approvalId)) return J(event, 409, { ok: false, error: 'That referral already has its credit (or it is waiting for approval).' });
      const pr = await R.propose({ member: mem, referral: ref || null, amount: amt, note: b.note, by, id: ref ? '' : 'appr_refcredit_m_' + Date.now().toString(36) });
      if (ref && pr.ok) await R.patchReferral(ref.id, function(x){ x.approvalId = pr.id; x.proposedAt = new Date().toISOString(); if (x.status === 'referred' || x.status === 'job') x.status = 'paid'; });
      return J(event, pr.ok ? 200 : 502, pr.ok ? { ok: true, approvalId: pr.id, amount: pr.amount } : { ok: false, error: 'Could not put it on the approvals list.' });
    }
    if (act === 'gift') {   /* a gift code from a member's balance, made for them — approved on the list */
      const mem = await R.memberById(b.memberId);
      if (!mem) return J(event, 404, { ok: false, error: 'Pick a member.' });
      const amt = Math.round(Number(b.amount) * 100) / 100, bal = await R.balance(mem.id);
      if (!(amt >= R.GIFT_MIN)) return J(event, 400, { ok: false, error: 'A gift code is at least $' + R.GIFT_MIN + '.', field: 'amount' });
      if (amt > bal) return J(event, 409, { ok: false, error: mem.name + ' has $' + bal + ' of credit — less than that.', field: 'amount' });
      const pr = await R.proposeGift({ member: mem, amount: amt, note: b.note, by });
      return J(event, pr.ok ? 200 : 502, pr.ok ? { ok: true, approvalId: pr.id, amount: pr.amount } : { ok: false, error: 'Could not put it on the approvals list.' });
    }
    if (act === 'amount') {
      const amt = Number(b.amount), kind = /^appr_refgift_/.test(s(b.approvalId)) ? 'gift' : 'credit';
      if (kind === 'credit' && !(Math.round(amt) >= R.MIN && Math.round(amt) <= R.MAX)) return J(event, 400, { ok: false, error: 'The amount must be between $' + R.MIN + ' and $' + R.MAX + '.', field: 'amount' });
      if (kind === 'gift' && !(amt >= R.GIFT_MIN)) return J(event, 400, { ok: false, error: 'A gift code is at least $' + R.GIFT_MIN + '.', field: 'amount' });
      const r = await R.setAmount(s(b.approvalId), amt, by); return J(event, r.ok ? 200 : 409, r);
    }
    if (act === 'void') { const r = await R.voidCard(s(b.id), by, b.reason); return J(event, r.ok ? 200 : 409, r); }
    if (act === 'sweep') return J(event, 200, Object.assign({ ok: true }, await R.sweep({ force: true })));
    return J(event, 400, { ok: false, error: 'Unknown request.' });
  } catch (e) {
    if (e && e.plain) return J(event, 400, { ok: false, error: e.plain });
    console.error('[referral] ' + (e && e.message));
    return J(event, 503, { ok: false, error: 'The referral program could not do that right now — try again.' });
  }
};
exports._t = { isScheduledCall: isScheduledCall };
