/* netlify/functions/_lib/calllead.js — patch MKTOFFICE: "📞 Log a phone call lead" for the Marketing Manager.
   The office and the admins save the lead straight into the CRM's Leads list (the page). The Marketing Manager cannot write the
   CRM's lists (he is not on the staff rules), so his form posts here (soc.js op mm_call_lead): the call is filed in the Lead
   Inbox (gc_kv gc_lead_inbox) as a NEW item, and the next office / admin CRM that opens imports it as a lead (LEADIN-<id>) with
   the same fields the page writes: source "Phone call", sourceChannel 'phone', howHeard (the caller's answer) and the marketing
   channel it counts under (mkChannel). Nothing is sent to the caller (no text, no e-mail) and no alert goes out from here.
   Pure parts: rec(b, who, now) → the inbox item. */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function clip(v, n){ v = s(v).replace(/\s+/g, ' '); return v.length > n ? v.slice(0, Math.max(0, n - 1)) + '…' : v; }
function d10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = d10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
const COS = { construction: 1, mitigation: 1, environmental: 1 };
/* the "How did you hear about us?" answers (the page's list) */
const HEARD = ['Google search', 'Google LSA', 'Google Maps / Business Profile', 'Facebook / Instagram', 'Website', 'Referral', 'Repeat customer', 'Yard sign / truck', 'Angi', 'HomeAdvisor', 'Nextdoor', 'Yelp', 'BBB', 'Thumbtack', 'Other site', 'Other', ''];
function heardOf(b){
  const h = s(b.howHeard), d = clip(b.howHeardDetail, 60);
  if (h === 'Other' || h === 'Other site') return { howHeard: d || h, detail: d };
  if (HEARD.indexOf(h) >= 0) return { howHeard: h, detail: d };
  return { howHeard: clip(h, 60), detail: d };
}
const _D = { now: function(){ return Date.now(); }, kvCas: function(k, f){ return require('../bid-inbox.js')._lib.kvCas(k, f); } };
function rec(b, who, t){
  b = b || {}; const at = new Date(t).toISOString();
  const name = clip(b.name, 80), ph = d10(b.phone), need = clip(b.need, 600), addr = clip(b.address, 160), co = COS[s(b.companyId)] ? s(b.companyId) : 'construction';
  const H = heardOf(b), ch = clip(b.mkChannel, 60);
  const id = 'LI-CALL' + t.toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const by = s(who && who.name) || s(who && who.email);
  const em = b.emergency === true;
  const leadExtra = { leadSource: 'Phone call', sourceChannel: 'phone', howHeard: H.howHeard, howHeardDetail: H.detail, howHeardVia: 'phone call', mkChannel: ch,
    referredBy: s(b.howHeard) === 'Referral' ? clip(b.howHeardDetail, 60) : '', service: clip(b.service, 80), callLoggedBy: by, callLoggedAt: at, receivedAt: at, contactName: name, phoneCall: true,
    emergency: em, urgency: em ? 'Emergency' : '', grayCoLead: true, owner: 'GrayCo', commissionSource: 'grayco', unassigned: true };
  Object.keys(leadExtra).forEach(function(k){ if (leadExtra[k] === '' || leadExtra[k] === false) delete leadExtra[k]; });
  return { id: id, title: clip((name || tidy(ph) || 'Phone caller') + (b.service ? ' — ' + s(b.service) : ''), 200), source: 'Phone call', sourceKind: 'phone', origin: 'phone', type: clip(b.type, 40) || 'Residential Reno',
    companyId: co, address: addr, scope: need, contact: { name: name, email: '', phone: tidy(ph) }, notes: ['[' + at.slice(5, 10).replace('-', '/') + ' ' + by + '] 📞 Phone call logged' + (H.howHeard ? ' — heard about us: ' + H.howHeard + (H.detail && H.detail !== H.howHeard ? ' (' + H.detail + ')' : '') : ' — "how did you hear" not asked')],
    files: [], emails: [], emailIds: [], plansLinks: [], leadExtra: leadExtra, emergency: em, needsReview: false, dueUnknown: false,
    status: 'new', rev: 1, receivedAt: at, updatedAt: at, sources: [{ name: 'Phone call', at: at, ref: '' }] };
}
async function add(b, who){
  b = b || {};
  if (!s(b.name) && d10(b.phone).length !== 10) return { ok: false, error: 'A name or a 10-digit phone number, please.' };
  if (!('howHeard' in b)) return { ok: false, error: 'Pick "How did you hear about us?" (or "Did not ask").' };
  const r = rec(b, who, _D.now());
  await _D.kvCas('gc_lead_inbox', function(v){ const l = arr(v); if (l.some(function(x){ return x.id === r.id; })) return undefined; l.push(r); return l; });
  return { ok: true, id: r.id, leadId: 'LEADIN-' + r.id.replace(/^LI-/, '') };
}
module.exports = { HEARD, rec, add, _D };
