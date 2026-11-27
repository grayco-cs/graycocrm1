'use strict';
/* GrayCo — patch PORTALSEE (owner 11/27, a COMMERCIAL client's portal Home showing "GrayCo Care — Protect your home … 🛠 Your
   maintenance plans": "want to be able to edit what they see on their portal when we make the job, this is a commercial client
   and this is talking about homes … i dont want to show plans unless i want to … all the maintenance plans is too much unless
   its a residential client").

   What the customer's portal shows, per section:
     • the company switch (⚙ Admin → the portal row, gc_portal_settings.plans, default OFF, admins only):
       "🛠 Show GrayCo Care maintenance plans on customer portals"
     • the job's own switches (job.portalShow = { <key>: 'auto' | 'on' | 'off' }, set in the job's ✏️ Edit portal):
         plans    🛠 Maintenance plans        auto = the company switch is ON and the job is residential (not commercial, not a GC job)
         heard    🙋 How did you hear about us auto = shown (residential and commercial), never on a GC job
         review   ⭐ Review / testimonial ask  auto = as before (never on a GC job)
         referral 🎁 Referral program / Refer a friend   auto = as before (never on a GC job)
         project  🏗 Request a new project    auto = as before (never on a GC job)
         myhome   🏠 My home / My property    auto = as before (never on a GC job)
         super    👷 Your Superintendent card (owner 11/27: "for commercial jobs should also have superintendent here")
                                              auto = commercial / GC jobs only; only when the job has a superintendent
         pay      Payments tab                auto = shown
         photos   Photos tab                  auto = shown
         docs     Documents tab               auto = shown
       'on' = always shown, 'off' = never shown, whatever the job type or the company switch.
   The servers (portal.js view, portal-plus.js, portal-home.js) send nothing of a hidden section. */
const KEYS = ['plans', 'heard', 'review', 'referral', 'project', 'myhome', 'super', 'pay', 'photos', 'docs'];
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
/* the job's own picks: only 'on' / 'off' are kept ('auto' and anything else = automatic) */
function norm(v){
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = {};
  KEYS.forEach(function(k){ const m = low(o[k]); if (m === 'on' || m === 'off') out[k] = m; });
  return out;
}
/* residential vs commercial: the job's own Residential pick wins; else patch TEAMCO's commercial(p, c) or the job type */
function commercial(p, cust){
  if (!p) return false;
  if (/^res/i.test(s(p.jobType)) && p.gcJob !== true) return false;
  try { if (require('./portalteam.js').commercial(p, cust || {})) return true; } catch (e) {}
  try { return require('./job-auto.js').groupOf(p) === 'commercial'; } catch (e) { return /commercial|\bti\b|tenant|church|school/i.test(s(p.type) + ' ' + s(p.jobType)); }
}
/* o: { commercial, gc, plansOn } → { plans, heard, …, commercial, gc, plansOn, mode: { key: 'auto'|'on'|'off' } } */
function resolve(p, o){
  o = o || {};
  const ps = norm(p && p.portalShow), gc = !!o.gc, com = !!o.commercial || gc;
  const auto = { plans: o.plansOn === true && !com && !(p && p.maintOffer === false), heard: !gc, review: !gc, referral: !gc, project: !gc, myhome: !gc, super: com, pay: true, photos: true, docs: true };
  const out = { commercial: com, gc: gc, plansOn: o.plansOn === true, mode: {} };
  KEYS.forEach(function(k){ out.mode[k] = ps[k] || 'auto'; out[k] = ps[k] === 'on' ? true : ps[k] === 'off' ? false : auto[k]; });
  return out;
}
/* what the page gets (no reasons, no company switch): { key: true|false, commercial } */
/* the job's superintendent for the customer: name, work phone, work e-mail ONLY (the staff record, matched by name like the PM) */
function superOf(p, users){
  const nm = s(p && p.superintendent); if (!nm) return null;
  const u = (Array.isArray(users) ? users : []).find(function(x){ return x && low(x.name) === low(nm) && x.active !== false; }) || {};
  const clip = function(v, n){ return s(v).slice(0, n); };
  const em = clip(u.email, 120);
  return { name: clip(nm, 60), phone: clip(u.phone || u.cell || u.mobile || '', 40), email: /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(em) ? em : '' };
}
function forPage(r){ const out = { commercial: !!r.commercial }; KEYS.forEach(function(k){ out[k] = r[k] !== false; }); return out; }
module.exports = { KEYS: KEYS, norm: norm, commercial: commercial, resolve: resolve, forPage: forPage, superOf: superOf };
