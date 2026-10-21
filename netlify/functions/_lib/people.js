/* ============================================================================
   GrayCo — WHO GETS IT: the job's PM (and APM), the Senior PM, the PMs, the admins.   netlify/functions/_lib/people.js
   (patch PMG)

   Owner (10/21): notifications go to "a PM", never to one named person — "if I fire [someone] I still need to be
   able to plug and play or add". The current lead PM is the company's Senior PM, a setting, not code: "I still want
   [him] to be my first and Senior PM right now, but I want to be able to not have him and replace him and my CRM
   still works … then we hire PMs and APMs and supers."

   No person is named in code. Who is who is data:
     • the CRM's people list (gc_kv "users": name, e-mail, role, active / departed);
     • the Senior PM (gc_kv "gc_senior_pm": { email, id, name } — Admin → Employees → Senior PM);
     • on a job: pm, apm (Assistant PM), superintendent.
   Routing, in order (route()):
     1. the job's / lead's own PM, when that person is still active — plus the job's active APM(s);
     2. the Senior PM, when one is set and still active;
     3. every active person whose role is a PM;
     4. the admins (the caller's own list — gc_staff admins / OWNER_EMAILS).
   ========================================================================== */
'use strict';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
  if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v;
  return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : [];
}
function norm(v){ return low(v).replace(/[^a-z0-9]/g, ''); }
function okEmail(e){ return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(e)); }

/* still works here: not turned off, not offboarded (the CRM's offboarding sets active:false + departed:true) */
function isActive(u){
  return !!u && u.active !== false && u.departed !== true && u.fired !== true && u.deleted !== true && u._deleted !== true && u.tombstoned !== true
    && !/^(terminated|inactive|former|departed|fired)$/i.test(s(u.status));
}
function roleText(u){ return [u && u.role, u && u.profile, u && u.title, u && u.jobTitle, u && u.position].map(low).join(' | '); }
/* an APM (Assistant PM / Assistant Project Manager / profile "apm") */
function isApm(u){ const t = roleText(u); return /assistant\s*(project\s*manager|pm)/.test(t) || /(^|[^a-z])apm([^a-z]|$)/.test(t); }
/* a PM by role / profile / title (Project Manager, PM, the RP profile "pm") — not an APM */
function isPm(u){ if (!u || isApm(u)) return false; const t = roleText(u); return /project\s*manager/.test(t) || /(^|[^a-z])pm([^a-z]|$)/.test(t); }
/* a Superintendent (the RP profile "superintendent", Field Supervisor, Super) */
function isSuper(u){ const t = roleText(u); return /superintendent|field\s*supervisor|(^|[^a-z])super([^a-z]|$)/.test(t); }
function findUser(users, key){
  const k = low(key), n = norm(key); if (!k) return null;
  return arr(users).find(function(u){ return s(u.id) === s(key) || low(u.email) === k || (n && norm(u.name) === n); }) || null;
}
function seniorSetting(v){
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = { email: v }; } }
  return v && typeof v === 'object' ? { email: low(v.email), id: s(v.id), name: s(v.name) } : { email: '', id: '', name: '' };
}
/* the Senior PM's people record, when one is set and the person is still active; else null */
function seniorPm(users, setting){
  const h = seniorSetting(setting);
  const u = (h.id && findUser(users, h.id)) || (h.email && findUser(users, h.email)) || null;
  return u && isActive(u) ? u : null;
}
/* for Admin's warning: not set / set to someone no longer here */
function seniorState(users, setting){
  const h = seniorSetting(setting);
  if (!h.email && !h.id) return { ok: false, why: 'unset' };
  const u = (h.id && findUser(users, h.id)) || (h.email && findUser(users, h.email));
  if (!u) return { ok: false, why: 'missing', name: h.name };
  if (!isActive(u)) return { ok: false, why: 'inactive', name: s(u.name) };
  return { ok: true, name: s(u.name), email: low(u.email) };
}
function pmsOf(users){ return arr(users).filter(function(u){ return isActive(u) && isPm(u) && okEmail(u.email); }); }
function apmsOf(users){ return arr(users).filter(function(u){ return isActive(u) && isApm(u) && okEmail(u.email); }); }
function person(u){ return { name: s(u.name), email: low(u.email) }; }
function namesOf(v){ return (Array.isArray(v) ? v : s(v).split(/\s*[,;&]\s*/)).map(s).filter(Boolean); }
/* the job's active APMs: the job's own "apm" field(s), plus any APM whose people record says they assist this PM */
function apmsFor(users, job, pmUser){
  const out = [], seen = {};
  function add(u){ if (u && isActive(u) && okEmail(u.email) && !seen[low(u.email)]) { seen[low(u.email)] = 1; out.push(person(u)); } }
  namesOf(job && (job.apm || job.apms || job.assistantPm)).forEach(function(n){ add(findUser(users, n)); });
  if (pmUser) apmsOf(users).forEach(function(a){ if (namesOf(a.assistsPm || a.apmFor || a.reportsTo).some(function(n){ const u = findUser(users, n); return u && low(u.email) === low(pmUser.email); })) add(a); });
  return out;
}

/* o: { pm: name / e-mail of the job's PM, job (for its APM), users, senior: the gc_senior_pm value, admins: [e-mails] }
   → { to: [{ name, email }], why: 'pm' | 'senior' | 'pms' | 'admins' | 'none' } */
function route(o){
  o = o || {};
  const users = arr(o.users);
  if (s(o.pm)) {
    const u = findUser(users, o.pm);
    if (u && isActive(u) && okEmail(u.email)) return { to: [person(u)].concat(apmsFor(users, o.job, u).filter(function(a){ return a.email !== low(u.email); })), why: 'pm' };
  }
  const h = seniorPm(users, o.senior); if (h && okEmail(h.email)) return { to: [person(h)], why: 'senior' };
  const ps = pmsOf(users); if (ps.length) return { to: ps.map(person), why: 'pms' };
  const ad = (o.admins || []).map(low).filter(okEmail);
  return ad.length ? { to: ad.map(function(e){ return { name: '', email: e }; }), why: 'admins' } : { to: [], why: 'none' };
}
/* a job's PM. No PM on the job → null (the caller's no-PM path, as before). A PM who is no longer active → the
   Senior PM (when set and active), else null. A name with no people record is kept as it was (name only). */
function activePmFor(users, pmName, senior){
  if (!s(pmName)) return null;
  const u = findUser(users, pmName);
  if (!u) return { name: s(pmName), email: '' };
  if (isActive(u)) return person(u);
  const h = seniorPm(users, senior); return h ? person(h) : null;
}

module.exports = { isActive, isPm, isApm, isSuper, findUser, seniorSetting, seniorPm, seniorState, pmsOf, apmsOf, apmsFor, route, activePmFor, SENIOR_KEY: 'gc_senior_pm' };
