/* ============================================================================
   GrayCo — MAINTENANCE PLANS (patch X9), the shared pieces.   netlify/functions/_lib/maint.js

   Owner 10/21: "Yes, always do maintenance contracts and try to sell those. Offer in portal for roofs and other
   residential items." Prices are set later, per home (owner, earlier): a plan's price stays "[PRICE]" until the PM
   quotes it for that house.

   The plans (gc_kv "gc_maint_plans", admin-editable in ⚙ Admin → 🛠 Maintenance plans; DEFAULT_PLANS until saved):
     { plans: [{ id, name, includes, visits, on, kinds }], offerOn: ['residential', 'insurance'], updatedAt, by }
   The contracts (gc_kv "gc_maint", JSON text like the office to-dos — portal.js kvListUpdate keeps every save):
     { id, pid, planId, planName, status, requestedAt, requestedBy, note,
       price, quotedAt, quotedBy,                        ← the PM's price for this home (per year)
       signedAt, signName, signIp, drawn, docRef,         ← the customer's signature in the portal
       nextVisit, visits: [{ at, by, note }], invoices: [{ year, amount, approvalId, at, status }],
       history: [{ at, by, what }], updatedAt }
     status: requested → quoted → signed (→ cancelled | declined)
   Other patches can ask: offerLine(p) — one line for a closeout / anniversary e-mail ("" when the job is not one we
   offer plans on, or it already has a plan); eligible(p, settings).
   ========================================================================== */
'use strict';

const PLANS_KEY = 'gc_maint_plans', LIST_KEY = 'gc_maint', HEARD_KEY = 'gc_portal_heard';
const DEFAULT_PLANS = [
  { id: 'roof', name: 'Roof Care Plan', visits: 1, on: true, kinds: ['roof'],
    includes: 'A yearly roof check-up by GrayCo: inspect shingles, flashing, vents and pipe boots; clear debris from valleys and gutters; reseal small gaps; a photo report of what we found. Price: [PRICE] per year.' },
  { id: 'gutter', name: 'Gutter & Drainage Plan', visits: 2, on: true, kinds: ['roof', 'gutter', 'siding'],
    includes: 'Gutters and downspouts cleaned and checked twice a year (spring and fall), loose hangers re-set, splash blocks checked. Price: [PRICE] per year.' },
  { id: 'home', name: 'Home Exterior Check-up', visits: 1, on: true, kinds: ['any'],
    includes: 'A yearly walk-around of the work we did and the outside of the home: caulking, siding, trim, windows and doors, decks — small touch-ups on the spot, a list of anything bigger. Price: [PRICE] per year.' }
];
const HEARD_OPTS = ['Google', 'Facebook', 'A friend or neighbor (referral)', 'Yard sign', 'Our truck', 'Repeat customer', 'Insurance company', 'Other'];

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }

function groupOf(p){ try { return require('./job-auto.js').groupOf(p); } catch (e) { return /commercial|church|school/i.test(s(p && p.type)) ? 'commercial' : 'residential'; } }
function settingsOf(v){
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const plans = arr(o.plans).length ? arr(o.plans).map(function(x, i){
    return { id: s(x.id) || 'plan' + i, name: s(x.name).slice(0, 80) || 'Maintenance plan', includes: s(x.includes).slice(0, 1200), visits: Math.max(1, Math.min(12, parseInt(x.visits, 10) || 1)),
      on: x.on !== false, kinds: (function(k){ return k.length ? k : ['any']; })(Array.isArray(x.kinds) ? x.kinds.map(low).filter(Boolean).slice(0, 8) : []) };
  }) : DEFAULT_PLANS.map(function(x){ return Object.assign({}, x); });
  const offerOn = Array.isArray(o.offerOn) && o.offerOn.length ? o.offerOn.map(low).filter(Boolean) : ['residential', 'insurance'];
  return { plans: plans, offerOn: offerOn, updatedAt: s(o.updatedAt), by: s(o.by), saved: !!(o && o.plans) };
}
/* the work on the job, for which plans fit (a roof job → roof + gutter + home) */
function workOf(p){
  const t = low([p && p.type, p && p.jobType, p && p.name, p && p.scope, p && p.trade, p && p.workType].map(s).join(' '));
  const out = [];
  if (/roof|shingle|reroof|re-roof|tpo|metal roof/.test(t)) out.push('roof');
  if (/gutter/.test(t)) out.push('gutter');
  if (/siding|exterior|trim|paint/.test(t)) out.push('siding');
  return out;
}
function plansFor(p, settings){
  const st = settings && settings.plans ? settings : settingsOf(settings);
  const w = workOf(p);
  return st.plans.filter(function(x){ return x.on && (x.kinds.indexOf('any') >= 0 || x.kinds.some(function(k){ return w.indexOf(low(k)) >= 0; })); });
}
function eligible(p, settings){
  if (!p || p.deleted === true) return false;
  const st = settings && settings.plans ? settings : settingsOf(settings);
  if (st.offerOn.indexOf(groupOf(p)) < 0) return false;
  if (p.maintOffer === false) return false;   /* a PM turned the offer off on this job */
  return plansFor(p, st).length > 0;
}
function contractsFor(list, pid){ return arr(list).filter(function(c){ return s(c.pid) === s(pid) && !/^(cancelled|declined)$/.test(s(c.status)); }); }
/* one line for wAUTO5's closeout pack / wAUTO7's anniversary note (plain text) */
function offerLine(p, list, settings){
  if (!eligible(p, settings)) return '';
  if (list && contractsFor(list, p.id).some(function(c){ return c.status === 'signed'; })) return '';
  const w = workOf(p);
  return w.indexOf('roof') >= 0
    ? 'Keep your new roof in top shape: ask about our yearly Roof Care Plan — open your GrayCo portal and tap “Maintenance plans”, or ask your Project Manager.'
    : 'Keep everything we built looking new: ask about our yearly maintenance plans — open your GrayCo portal and tap “Maintenance plans”, or ask your Project Manager.';
}
function heardNorm(v){
  const t = low(v); if (!t) return '';
  const hit = HEARD_OPTS.find(function(o){ return low(o) === t; }); if (hit) return hit;
  if (/google|search/.test(t)) return 'Google'; if (/facebook|instagram|\bfb\b/.test(t)) return 'Facebook';
  if (/referr|friend|neighbo|family|word of mouth/.test(t)) return 'A friend or neighbor (referral)';
  if (/yard|sign/.test(t)) return 'Yard sign'; if (/truck|van|vehicle/.test(t)) return 'Our truck';
  if (/repeat|again|before|past customer/.test(t)) return 'Repeat customer'; if (/insur|adjuster|carrier/.test(t)) return 'Insurance company';
  return 'Other';
}
/* the Marketing channel an answer counts as (patch MKT's normSource reads p.howHeard) */
function heardChannel(v){
  const h = heardNorm(v);
  return ({ 'Google': 'Google organic', 'Facebook': 'Facebook/Instagram Ads', 'A friend or neighbor (referral)': 'Referral', 'Yard sign': 'Yard sign', 'Our truck': 'Yard sign', 'Repeat customer': 'Repeat customer' })[h] || 'Other';
}
function nextYear(iso, months){ const d = new Date(iso || Date.now()); if (isNaN(d)) return ''; d.setUTCMonth(d.getUTCMonth() + (months || 12)); return d.toISOString().slice(0, 10); }

module.exports = { PLANS_KEY, LIST_KEY, HEARD_KEY, DEFAULT_PLANS, HEARD_OPTS, settingsOf, plansFor, eligible, workOf, groupOf, contractsFor, offerLine, heardNorm, heardChannel, nextYear, num };
