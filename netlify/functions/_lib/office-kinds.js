// netlify/functions/_lib/office-kinds.js — patch APOFFICE4 (owner Wesley, 10/30): "i want office to have all auto text
// thank yous portal texts just anything needed for approval for that stuff i want her to approve and so can admin but if
// she approves that is good all auto text emails invoices whatever we need approved i want office to approve".
//
// Which approvals on the shared list (gc_approval_queue) the OFFICE (gc_staff role office / a CRM user whose role says
// Office, e.g. office@grayco-cs.com) may take as a FULL approver, from the moment the item is made:
//   * OFFICE kinds — everything that goes to a customer or someone outside (automatic texts and e-mails, portal
//     publishes / posts / texts, invoices and their e-mails / reminders, proposals / estimates / papers to sign, sub and
//     GC e-mails, campaigns and newsletters): at ANY step (PM or admin), her approval is final (no admin after her), it is
//     in her "Waiting on me" list at once (no 👷 button, no 24-hour wait). Admins may still approve; first action wins.
//   * ADMIN-ONLY kinds — owner money and permission decisions (payroll, bank / cash, owner draws, deleting / merging
//     records, staff access, pay changes and offer letters, contract overrides, referral credits and
//     gift codes, ad spend, partner payouts, experiments, CRM feature requests): the office is refused at every step and
//     they are never escalated to her after 24 hours.
//   * anything else (not listed — e.g. a staff announcement, a supplier purchase order): exactly as before (the office
//     may take a PM step from "👷 PM approvals"; an admin step reaches her only after 24 hours).
// index.html (patch APOFFICE4, window._gcApOfficeKind) carries the same two lists; tools/tests/test_APOFFICE4.mjs checks
// that they are identical.
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }

const OFFICE_KINDS = [
  /* customer portal */
  'portal_publish', 'portal_link', 'portal_docs', 'portal_post', 'weekly_update', 'sub_contact', 'gcp_link',
  /* invoices, statements, payment reminders */
  'invoice', 'final_invoice', 'final_reminder', 'payment_reminder', 'invoice_statement', 'maint_invoice', 'pay_app', 'gcp_payapp_invoice',
  /* proposals, estimates, papers to sign */
  'proposal_send', 'sign_contract', 'contract', 'estimate_followup', 'maint_quote', 'selection_sign', 'walkthrough_sign', 'gcp_co_contract', 'document',
  /* automatic customer texts and e-mails */
  'thank_you', 'review_request', 'lead_first_contact', 'welcome', 'next_steps', 'appt_confirm', 'appt_reminder', 'closeout', 'checkup',
  'progress_update', 'anniversary', 'warranty_check', 'cneeds_remind', 'winback', 'mail_followup', 'brain_email', 'maintenance', 'applicant_reply',
  /* sub / GC e-mails */
  'lien_waiver', 'sub_lien_request', 'bp_notice', 'gcp_coi', 'gcp_inspect',
  /* campaigns and newsletters */
  'mkt_campaign', 'newsletter', 'social_post', 'soc_week', 'mkt_neighbor', 'mkt_event', 'mkt_giveaway', 'mkt_outreach', 'mkt_page',
  /* lead assignment (patch OFFFIX1, owner 10/30: the office has the whole CRM but staff access, security and the destructive
     tools — assigning a lead is office work; access / role / permission / staff stay admin-only below) */
  'lead_assign', 'assign_estimator', 'assign_pm',
  /* OFFFEAT (r17b): a COI / W-9 request to a sub, and the reminders about an unsigned change order to the GC and to the customer */
  'sub_doc_request', 'gcp_co_nudge', 'sign_co_nudge'
];
const OFFICE_PREFIX = /^sign_[a-z0-9_]+$/;   /* portal-sign.js: 'sign_' + the paper's kind (a change order, a warranty paper …) to the customer */
const ADMIN_ONLY_KINDS = [
  'offer_letter', 'refcredit', 'refgift', 'mkt_payout', 'mkt_ad', 'mkt_addraft', 'mkt_experiment', 'mkt_feature'
];
const ADMIN_ONLY_RE = /payroll|pay_?run|pay_?stub|paycheck|pay_?week|pay_?change|pay_?rate|raise|wage|bank|cash|owner_?draw|^draw|delete|merge|staff|access|permission|role|override/;
const OK = {}; OFFICE_KINDS.forEach(function(k){ OK[k] = 1; });
const AO = {}; ADMIN_ONLY_KINDS.forEach(function(k){ AO[k] = 1; });

function kindOf(x){ return low(x && typeof x === 'object' ? x.kind : x); }
/* an item marked payroll (meta.payroll) is payroll whatever its kind says */
function isAdminOnly(x){
  const k = kindOf(x), m = (x && typeof x === 'object' && x.meta) || {};
  return !!(AO[k] || ADMIN_ONLY_RE.test(k) || m.payroll === true || m.adminOnly === true || (x && typeof x === 'object' && x.adminOnly === true));
}
function isOfficeKind(x){
  if (isAdminOnly(x)) return false;
  const k = kindOf(x); return !!(OK[k] || OFFICE_PREFIX.test(k));
}
module.exports = { OFFICE_KINDS: OFFICE_KINDS, ADMIN_ONLY_KINDS: ADMIN_ONLY_KINDS, ADMIN_ONLY_RE: ADMIN_ONLY_RE, OFFICE_PREFIX: OFFICE_PREFIX, isOfficeKind: isOfficeKind, isAdminOnly: isAdminOnly };
