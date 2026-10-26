/* ============================================================================
   GrayCo — TEXT-MESSAGE CONSENT (patch SMSCONSENT, A2P 10DLC).   netlify/functions/_lib/smsconsent.js

   A customer's consent is one record { status: 'yes'|'no', at: ISO, via: 'contract'|'intake'|'text'|'staff', phone }.
   It lives on the customer and the job (the CRM's own records) and, for a customer who texted us first or signed in the
   portal, in the SMS state ("consent", by 10-digit phone) so the functions can enforce it at once.
     · 'no'              → no customer text goes out (staff reply, automatic answer, crew text, welcome text).
     · '' (not recorded) → legacy customers: job / transactional texts still go out.
     · marketing / promotional texts need 'yes'.
     · STOP (the SMS state's "optout") always wins over everything — it is checked before this.
   When several records match one phone the newest wins; on a tie 'no' wins.
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }

const CONSENT_TEXT = "I agree to receive text messages from GrayCo Construction Services about my job (scheduling, updates, estimates, invoices) and occasional service offers. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase.";
const NOTICE = "GrayCo Construction Services: you're subscribed to job texts. Msg freq varies. Msg&data rates may apply. Reply HELP for help, STOP to opt out.";
const DECLINED = 'This customer declined texts on their contract.';
const NEEDS_YES = "Marketing texts need the customer's text consent (Texts: Yes) — it is not recorded for this number.";

function phonesOf(r){ return [r.clientPhone, r.phone, r.customerPhone, r.contactPhone, r.cell, r.mobile, r.homePhone, r.ownerPhone, r.contact && r.contact.phone, r.smsConsent && r.smsConsent.phone].map(phone10).filter(x => x.length === 10); }
function clean(c){
  if (!c || typeof c !== 'object') return null;
  const st = low(c.status); if (st !== 'yes' && st !== 'no') return null;
  return { status: st, at: s(c.at), via: s(c.via), phone: phone10(c.phone) };
}
/* the newest record wins; same time → 'no' */
function newest(list){
  let best = null;
  list.map(clean).filter(Boolean).forEach(c => { if (!best || c.at > best.at || (c.at === best.at && c.status === 'no')) best = c; });
  return best;
}
/* data = { customers, projects, leads } as portal.js kvRead returns them; reg = the SMS state's "consent" map (by 10 digits) */
function recordFor(data, ph, reg){
  const d = phone10(ph); if (d.length !== 10) return null;
  data = data || {};
  const list = [];
  arr(data.customers).concat(arr(data.projects), arr(data.leads)).forEach(r => { if (r.smsConsent && r.deleted !== true && phonesOf(r).indexOf(d) >= 0) list.push(r.smsConsent); });
  if (reg && typeof reg === 'object' && reg[d]) list.push(reg[d]);
  return newest(list);
}
function statusFor(data, ph, reg){ const r = recordFor(data, ph, reg); return r ? r.status : ''; }
/* the message for staff when one outbound customer text must not go: '' = fine */
function refusal(status, marketing){
  if (status === 'no') return DECLINED;
  if (marketing && status !== 'yes') return NEEDS_YES;
  return '';
}
/* the SMS state's consent map (a customer who texted us first / signed in the portal) */
async function registry(){ try { const st = await require('../missed-call.js')._test.stateGet(); return st && st.consent && typeof st.consent === 'object' ? st.consent : {}; } catch (e) { return {}; } }
/* a status for callers that hold nothing but a phone: reads the CRM's customers / jobs / leads and the registry. Unreadable → '' */
async function live(ph){
  try {
    const core = require('../portal.js')._core; let D = {};
    try { D = await core.kvRead(['customers', 'projects', 'leads']); } catch (e) {}
    return statusFor(D, ph, await registry());
  } catch (e) { return ''; }
}
async function record(rec, extraPhones){
  const MCt = require('../missed-call.js')._test, c = clean(rec); if (!c) return false;
  const phones = new Set(); if (c.phone) phones.add(c.phone);
  if (c.status === 'no') (extraPhones || []).map(phone10).filter(x => x.length === 10).forEach(x => phones.add(x));
  if (!phones.size) return false;
  await MCt.stateCas(st => { st.consent = st.consent && typeof st.consent === 'object' ? st.consent : {}; phones.forEach(d => { st.consent[d] = Object.assign({}, c, { phone: d }); }); return true; });
  return true;
}

module.exports = { CONSENT_TEXT, NOTICE, DECLINED, NEEDS_YES, clean, newest, recordFor, statusFor, refusal, registry, live, record, phone10 };
