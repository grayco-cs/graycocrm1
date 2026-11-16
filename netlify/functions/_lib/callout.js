/* netlify/functions/_lib/callout.js — patch AWAY / CALLOUT (owner 11/16): who hears about a CALL-OUT (someone who can't make it,
   is sick or running late):
     • a SUB calling out on a job → that job's PM only (never the admins); on a COMMERCIAL job the superintendent instead of the
       PM (the PM does not get it); no PM / superintendent on the job → the office;
     • an hourly / office EMPLOYEE calling out (🤒 sick, ⏰ running late — index.html patch TIMEOFF) → the admins, AND the PM of
       each job they were scheduled on that day (the superintendent instead on a commercial job);
     • a call-out is urgent: it goes through the 9 PM – 7 AM quiet hours (_lib/staffquiet.js: the "📣 Call-out" title).
   Pure: commercial(p), leadsFor(p, users) → [{ name, email }], route({ who: 'sub' | 'employee', jobs, users, admins, office, self }). */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
/* the same rule as _lib/jobdata.js kindOf */
function commercial(p){
  if (!p) return false;
  const t = [p.type, p.jobType, p.jobTypeLabel, p.category].map(low).join(' ');
  return p.isCommercial === true || /commercial|tenant|\bti\b|government|municipal|industrial|retail|office build/.test(t);
}
function namesIn(v){ const out = []; (Array.isArray(v) ? v : [v]).forEach(function(x){ const n = s(x && typeof x === 'object' ? (x.email || x.name) : x); if (n) n.split(/\s*[,;&\/]\s*|\s+and\s+/i).forEach(function(q){ if (s(q)) out.push(s(q)); }); }); return out; }
function userOf(users, key){ const P = require('./people.js'); const u = P.findUser(users, key); return u && P.isActive(u) && okEmail(u.email) ? u : null; }
/* who hears about a call-out on this job: the superintendent on a commercial job (when one is set), else the PM */
function leadsFor(p, users){
  if (!p) return [];
  const supers = namesIn(p.superintendent || p.super || p.superintendentName).map(function(n){ return userOf(users, n); }).filter(Boolean);
  const pick = commercial(p) && supers.length ? supers : namesIn(p.pm || p.projectManager || p.pmName).map(function(n){ return userOf(users, n); }).filter(Boolean);
  return pick.map(function(u){ return { name: s(u.name), email: low(u.email) }; });
}
function route(o){
  o = o || {};
  const users = arr(o.users), self = low(o.self), out = [], add = function(e){ e = low(e); if (okEmail(e) && e !== self && out.indexOf(e) < 0) out.push(e); };
  arr(o.jobs).forEach(function(p){ leadsFor(p, users).forEach(function(x){ add(x.email); }); });
  if (o.who === 'employee') (o.admins || []).forEach(add);
  else if (!out.length) (o.office || []).forEach(add);   /* a sub on a job with nobody set: the office (never the admins) */
  return out;
}
module.exports = { commercial, leadsFor, route };
