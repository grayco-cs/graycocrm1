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
   patch SMSC2 (Twilio 30913): marketing consent is a SEPARATE record, smsMarketing { status, at, via, phone } (same shape, same
   newest-wins rule; in the SMS state: "marketing" by 10-digit phone). smsConsent stays JOB-text consent.
     · job / transactional texts: exactly as before (only an explicit job 'no' blocks them);
     · a marketing / promotional text needs smsMarketing = 'yes' — job-text 'yes' is NOT enough;
     · texting us first records JOB consent only, never marketing; STOP still wins over everything.
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }

const CONSENT_TEXT = "I agree to receive text messages from GrayCo Construction Services about my job (appointment and crew scheduling, job updates, estimates and invoices). Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase.";
const MARKETING_TEXT = "I also agree to receive occasional promotional text messages from GrayCo Construction Services (seasonal service offers, up to 4 per month). Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase.";
const NOTICE = "GrayCo Construction Services: you're subscribed to job texts. Msg freq varies. Msg&data rates may apply. Reply HELP for help, STOP to opt out.";
const DECLINED = 'This customer declined texts on their contract.';
const DECLINED_MKT = 'This customer declined promotional texts (Offers: No).';
const NEEDS_YES = "Promotional texts need the customer's separate Offers consent (Offers: Yes) — job-text consent is not enough, and it is not recorded for this number.";

function phonesOf(r){ return [r.clientPhone, r.phone, r.customerPhone, r.contactPhone, r.cell, r.mobile, r.homePhone, r.ownerPhone, r.contact && r.contact.phone, r.smsConsent && r.smsConsent.phone, r.smsMarketing && r.smsMarketing.phone].map(phone10).filter(x => x.length === 10); }
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
function recordFor(data, ph, reg, field){
  const d = phone10(ph); if (d.length !== 10) return null;
  data = data || {};
  const f = field || 'smsConsent', list = [];
  arr(data.customers).concat(arr(data.projects), arr(data.leads)).forEach(r => { if (r[f] && r.deleted !== true && phonesOf(r).indexOf(d) >= 0) list.push(r[f]); });
  if (reg && typeof reg === 'object' && reg[d]) list.push(reg[d]);
  return newest(list);
}
function statusFor(data, ph, reg){ const r = recordFor(data, ph, reg); return r ? r.status : ''; }
/* patch SMSC2: the separate marketing record (smsMarketing on the customer / job / lead; reg = the SMS state's "marketing" map) */
function marketingRecordFor(data, ph, reg){ return recordFor(data, ph, reg, 'smsMarketing'); }
function marketingStatusFor(data, ph, reg){ const r = marketingRecordFor(data, ph, reg); return r ? r.status : ''; }
/* the message for staff when one outbound customer text must not go: '' = fine */
/* status = JOB-text consent, mktStatus = marketing consent. A marketing send looks ONLY at mktStatus (yes → goes); a job text only at status. */
function refusal(status, marketing, mktStatus){
  if (marketing) return mktStatus === 'yes' ? '' : mktStatus === 'no' ? DECLINED_MKT : NEEDS_YES;
  if (status === 'no') return DECLINED;
  return '';
}
/* the SMS state's consent map (a customer who texted us first / signed in the portal) */
async function registry(){ try { const st = await require('../missed-call.js')._test.stateGet(); return st && st.consent && typeof st.consent === 'object' ? st.consent : {}; } catch (e) { return {}; } }
async function registryMarketing(){ try { const st = await require('../missed-call.js')._test.stateGet(); return st && st.marketing && typeof st.marketing === 'object' ? st.marketing : {}; } catch (e) { return {}; } }
/* a status for callers that hold nothing but a phone: reads the CRM's customers / jobs / leads and the registry. Unreadable → '' */
async function live(ph){
  try {
    const core = require('../portal.js')._core; let D = {};
    try { D = await core.kvRead(['customers', 'projects', 'leads']); } catch (e) {}
    return statusFor(D, ph, await registry());
  } catch (e) { return ''; }
}
async function liveMarketing(ph){
  try {
    const core = require('../portal.js')._core; let D = {};
    try { D = await core.kvRead(['customers', 'projects', 'leads']); } catch (e) {}
    return marketingStatusFor(D, ph, await registryMarketing());
  } catch (e) { return ''; }
}
/* kind 'marketing' writes the separate marketing record (SMS state "marketing"); default is the job-text record */
async function record(rec, extraPhones, kind){
  const key = kind === 'marketing' ? 'marketing' : 'consent';
  const MCt = require('../missed-call.js')._test, c = clean(rec); if (!c) return false;
  const phones = new Set(); if (c.phone) phones.add(c.phone);
  if (c.status === 'no') (extraPhones || []).map(phone10).filter(x => x.length === 10).forEach(x => phones.add(x));
  if (!phones.size) return false;
  await MCt.stateCas(st => { st[key] = st[key] && typeof st[key] === 'object' ? st[key] : {}; phones.forEach(d => { st[key][d] = Object.assign({}, c, { phone: d }); }); return true; });
  return true;
}

module.exports = { CONSENT_TEXT, MARKETING_TEXT, NOTICE, DECLINED, DECLINED_MKT, NEEDS_YES, clean, newest, recordFor, statusFor, marketingRecordFor, marketingStatusFor, refusal, registry, registryMarketing, live, liveMarketing, record, phone10 };
