/* OWNERROLE (owner 11/19: "when I say [their names], code it as owner 1 / owner 2"): who Owner 1 and Owner 2 are — by role, never by
   name or e-mail in the code.
     · Admin → Admin settings → 👥 Team roles → "Owner 1 / Owner 2" saves { owner1, owner2 } (user ids) in the server kv KEY.
     · Not saved (or the saved person is no longer an active admin) → the earliest-created active admin is Owner 1, the next one Owner 2
       (created = createdAt / created / addedAt / startDate / hireDate, else the order of the people list).
   An admin = an active staff user whose role is Admin (or pay type owner), or whose gc_staff role is admin.
   Pure: resolve(users, staff, saved) → [{ slot: 1, id, email, name }, { slot: 2, … }] (fewer when there are fewer admins). */
'use strict';
const KEY = 'gc_owner_roles';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function staffEmail(e){ return /^[a-z0-9._%+-]+@(in\.)?grayco-cs\.com$/.test(low(e)); }
function active(u){ try { return require('./people.js').isActive(u); } catch (e) { return u.active !== false && !u.departed; } }
function bornOf(u, i){ for (const k of ['createdAt', 'created', 'addedAt', 'startDate', 'hireDate']) { const t = Date.parse(s(u[k])); if (isFinite(t)) return t; } return Infinity; }
/* the active admins, oldest first */
function admins(users, staff){
  const role = {}, off = {}; arr(staff).forEach(r => { const e = low(r.email); if (!e) return; if (r.active === false) off[e] = 1; if (low(r.role) === 'admin') role[e] = 1; });
  const out = [];
  arr(users).forEach((u, i) => {
    const e = low(u.email); if (!staffEmail(e) || !active(u) || off[e]) return;
    if (!(/^admin$/i.test(s(u.role)) || low(u.payType) === 'owner' || role[e])) return;
    if (out.some(x => x.email === e)) return;
    out.push({ id: s(u.id) || e, email: e, name: s(u.name) || e, born: bornOf(u, i), i });
  });
  return out.sort((a, b) => (a.born - b.born) || (a.i - b.i)).map(x => ({ id: x.id, email: x.email, name: x.name }));
}
function pick(list, v){ v = low(v); if (!v) return null; return list.find(x => low(x.id) === v || x.email === v) || null; }
function resolve(users, staff, saved){
  const list = admins(users, staff), sv = obj(saved), out = [];
  const o1 = pick(list, sv.owner1), o2 = pick(list, sv.owner2);
  const rest = list.filter(x => x !== o1 && x !== o2);
  const a = o1 || rest.shift() || null, b = (o2 && o2 !== a) ? o2 : rest.filter(x => x !== a).shift() || null;
  if (a) out.push(Object.assign({ slot: 1, saved: !!o1 }, a));
  if (b) out.push(Object.assign({ slot: 2, saved: !!(o2 && o2 === b) }, b));
  return out;
}
function clean(v, list){ const o = obj(v), out = {}; ['owner1', 'owner2'].forEach(k => { const p = pick(list, o[k]); out[k] = p ? p.id : ''; }); if (out.owner1 && out.owner1 === out.owner2) out.owner2 = ''; return out; }
module.exports = { KEY, admins, resolve, clean };
