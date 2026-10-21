/* GrayCo — one clear subject on every e-mail the CRM sends to GrayCo people (owner, 10/21):
   "[GrayCo CRM · Bids] Bid due TODAY: … — PO … · job · address", so the office, admins and PMs see at a glance
   what each automatic e-mail is about. Only for mail whose recipients are ALL @grayco-cs.com; customer and sub
   mail keeps its own subject. Never added twice. */
'use strict';
const AREAS = [
  ['Approvals', /approv|escalat|sign[- ]off|waiting on you/i],
  ['Bids', /\bbid|lead inbox|planroom|plans requested|addend|itb|rfq|rfp/i],
  ['Leads', /\blead|website|roofscout|inquir/i],
  ['Billing', /invoice|bill|payment|paid|receipt|a\/r|overdue|collect|draw|deposit/i],
  ['Insurance', /claim|adjuster|carrier|xactimate|supplement|mitigation|depreciation/i],
  ['Subs', /\bsub\b|subcontract|coi|w-9|w9|scope/i],
  ['Portal', /portal|customer (picked|signed|message)|selection|signed/i],
  ['Hiring', /application|applicant|hiring/i],
  ['Marketing', /marketing|newsletter|campaign|door hanger|social|review/i],
  ['Reports', /report|summary|scorecard|brief/i],
  ['Schedule', /schedule|appointment|inspection|due today|tomorrow/i]
];
function internalOnly(to){
  const list = (Array.isArray(to) ? to : String(to || '').split(',')).map(x => String(x || '').trim().toLowerCase()).filter(Boolean);
  return list.length > 0 && list.every(x => /@grayco-cs\.com>?$/.test(x));
}
function areaOf(subject, hint){
  const t = String(hint || '') + ' ' + String(subject || '');
  for (const [name, re] of AREAS) if (re.test(t)) return name;
  return 'CRM';
}
function tag(subject, to, hint){
  subject = String(subject || '').trim();
  if (!internalOnly(to) || /^\[GrayCo CRM/.test(subject)) return subject;
  return ('[GrayCo CRM · ' + areaOf(subject, hint) + '] ' + subject).slice(0, 250);
}
module.exports = { tag, internalOnly, areaOf };
