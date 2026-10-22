/* ============================================================================
   GrayCo — WHO IS "THE ESTIMATOR".   netlify/functions/_lib/estimator.js   (patch EST4)

   Owner (10/22): "When I say go to Glenn I mean go to estimator. I don't want Glenn in the code for the CRM;
   I want it to be estimator and default to the 1 estimator we have."

   The default estimator is worked out from DATA, never a name in the code:
     1. the active people whose role or profile says Estimator (gc_staff role / profile, and the CRM's own
        people list gc_kv "users" role) — exactly one of them → that person;
     2. several → the Leads ⚙ "Default estimator" setting (gc_lead_inbox_settings.estimator, an e-mail kept as
        data) when it is one of them; otherwise it is ambiguous (Admin warns "Pick a default estimator");
     3. none with the role → the setting, when it names an active person (so a saved choice keeps working while
        that person's role is not set yet); otherwise nobody → the admins get it (Admin warns).
   A deactivated person never counts. Adding or removing an estimator needs no code change.

   const E = require('./_lib/estimator.js');
   await E.resolve({ sb, settings })  → { name, email, found, source: 'role'|'setting'|'admins', ambiguous, none,
                                          candidates: [{name,email}], warning }
   E.decide(people, setting)          → the same, from a list you already have (tests, the browser copy)
   ========================================================================== */
'use strict';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v : []; }
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const isEst = p => /estimat/i.test(s(p && p.role)) || /estimat/i.test(s(p && p.profile));
const isAdmin = p => /^admin$/i.test(s(p && p.role)) || /owner/i.test(s(p && p.role));

/* people: [{ name, email, role, profile, active }] (any source, duplicates fine). setting: { name, email } */
function decide(people, setting){
  const by = {};
  arr(people).forEach(p => {
    const e = low(p && p.email); if (!EMAIL.test(e)) return;
    const cur = by[e] || { email: e, name: '', role: '', profile: '', active: true };
    if (p.active === false || /^(inactive|deactivated|disabled)$/i.test(s(p.status))) cur.active = false;
    if (!cur.name && s(p.name)) cur.name = s(p.name);
    if (s(p.role) && !isEst(cur)) cur.role = s(p.role);
    if (s(p.profile) && !/estimat/i.test(cur.profile)) cur.profile = s(p.profile);
    by[e] = cur;
  });
  const live = Object.keys(by).map(k => by[k]).filter(p => p.active);
  const ests = live.filter(isEst);
  const admins = live.filter(isAdmin).map(p => p.email);
  const setEmail = low(setting && setting.email);
  /* the setting is an admin's choice (data): honoured when that person is active, or not on any list yet
     (e.g. not added to gc_staff); never when that person is deactivated */
  let setPerson = setEmail ? live.filter(p => p.email === setEmail)[0] : null;
  if (!setPerson && EMAIL.test(setEmail) && !by[setEmail]) setPerson = { email: setEmail, name: s(setting.name), role: '', profile: '', active: true, unlisted: true };
  const pick = (p, source) => ({ name: p.name || (setting && s(setting.name)) || p.email, email: p.email, found: true, source, ambiguous: false, none: false,
    candidates: ests.map(x => ({ name: x.name, email: x.email })), admins, warning: '' });
  if (ests.length === 1) return pick(ests[0], 'role');
  if (ests.length > 1) {
    if (setPerson && isEst(setPerson)) return pick(setPerson, 'setting');
    return { name: '', email: '', found: false, source: 'admins', ambiguous: true, none: false, candidates: ests.map(x => ({ name: x.name, email: x.email })), admins,
      warning: 'Pick a default estimator: ' + ests.length + ' people have the Estimator role (Leads ⚙ Default estimator).' };
  }
  if (setPerson) { const r = pick(setPerson, 'setting'); r.found = !setPerson.unlisted; r.warning = (setPerson.name || setPerson.email) + (setPerson.unlisted ? ' gets commercial bids but is not on the staff list.' : ' gets commercial bids but does not have the Estimator role.'); return r; }
  return { name: '', email: '', found: false, source: 'admins', ambiguous: false, none: true, candidates: [], admins,
    warning: 'Pick a default estimator: nobody has the Estimator role, so commercial bids go to the admins.' };
}

/* sb(path, opts) → fetch Response against Supabase REST with the service key (bid-inbox.js / subportal.js helpers) */
let CACHE = { at: 0, key: '', val: null };
async function resolve(o){
  o = o || {};
  const sb = o.sb, setting = (o.settings && o.settings.estimator) || o.setting || null;
  const ck = low(setting && setting.email);
  if (o.cache && CACHE.val && CACHE.key === ck && Date.now() - CACHE.at < 30000) return CACHE.val;   /* only when a caller asks (a loop over many items) */
  let people = arr(o.people);
  if (!o.people && typeof sb === 'function') {
    try { const r = await sb('gc_staff?select=email,name,role,profile,active'); if (r.ok) people = people.concat(arr(await r.json())); }
    catch (e) {}
    /* without a profile column (an older database) the plain list still works */
    if (!people.length) { try { const r = await sb('gc_staff?select=email,name,role,active'); if (r.ok) people = people.concat(arr(await r.json())); } catch (e) {} }
    try { const r = await sb('gc_kv?select=value&key=eq.users'); if (r.ok) people = people.concat(arr((arr(await r.json())[0] || {}).value)); } catch (e) {}
    /* the saved choice looked up by e-mail too (a staff list that could not be read whole) */
    if (EMAIL.test(ck) && !people.some(p => low(p && p.email) === ck)) {
      try { const r = await sb('gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(ck)); if (r.ok) people = people.concat(arr(await r.json())); } catch (e) {}
    }
  }
  const val = decide(people, setting);
  CACHE = { at: Date.now(), key: ck, val };
  return val;
}
function _reset(){ CACHE = { at: 0, key: '', val: null }; }

module.exports = { decide, resolve, isEst, _reset };
