// netlify/functions/_lib/office-access.js — patch OFFICEFULL: who is "the office" on the server.
// Owner 10/30: the office sees and works every part of the CRM ("Everything, money too"), except staff access
// (staff-admin), the security / lock-down settings, data-entry mode (automation-pause) and the destructive admin tools
// (backups, fresh start, wipe, restore, storage clean-up) — those keep their admin-only checks.
//
// Data decides, never a name (the same rule as the CRM page, window._gcIsOfficeFull):
//   1. the gc_staff row: active, role is not 'admin', not the Marketing Manager; profile 'office' or role 'office' → office;
//      another profile set by an admin (pm, estimator, …) → not the office;
//   2. no profile set: the person's role on the people list (gc_kv "users": Office / Office Admin / Office Manager).
//      Admins set that role; the database keeps a non-admin's own role edits out (docs/security-data.sql).
// An admin is never "the office" here — admins already pass every check.
//
//   isOfficeRow(row, users, email) → true / false (pure; tests)
//   isOffice(email, { row, users }) → Promise<boolean> (reads gc_staff / gc_kv "users" with the service key when not given)
//   withOffice(who, opts) → Promise<who> (who.office = true / false added; who.ok false is passed through)
'use strict';
const SB_DEFAULT = 'https://ieeonhpfahmwwecizdut.supabase.co';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function sbUrl(){ return (process.env.SUPABASE_URL || SB_DEFAULT).replace(/\/$/, ''); }
function svc(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function H(){ const k = svc(); return { apikey: k, Authorization: 'Bearer ' + k }; }
function parse(v){ if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { return JSON.parse(v); } catch (e) {} } return v; }

function isOfficeRow(row, users, email){
  if (!row || typeof row !== 'object') return false;
  if (row.active === false) return false;
  const r = low(row.role), pf = low(row.profile), e = low(email || row.email);
  if (r === 'admin' || r === 'marketing' || pf === 'marketing' || row.mkt_active === true) return false;
  if (r === 'office' || pf === 'office') return true;
  if (pf) return false;
  if (!e) return false;
  return arr(users).some(function(u){ return !!u && u.active !== false && low(u.email) === e && /^office/i.test(s(u.role)); });
}

async function staffRow(email){
  if (!svc()) return null;
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=*&email=eq.' + encodeURIComponent(low(email)), { headers: H() });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (e) { return null; }
}
let PEOPLE = { at: 0, v: null };
async function people(){
  if (PEOPLE.v && Date.now() - PEOPLE.at < 60000) return PEOPLE.v;
  if (!svc()) return [];
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.users', { headers: H() });
    if (!r.ok) return [];
    const rows = await r.json();
    const v = parse(Array.isArray(rows) && rows[0] ? rows[0].value : null);
    PEOPLE = { at: Date.now(), v: arr(v) };
    return PEOPLE.v;
  } catch (e) { return []; }
}
async function isOffice(email, opts){
  opts = opts || {};
  const e = low(email); if (!e) return false;
  const row = opts.row !== undefined ? opts.row : await staffRow(e);
  if (!row) return false;
  const r = low(row.role), pf = low(row.profile);
  if (r === 'admin' || pf) return isOfficeRow(row, [], e);          /* decided by the row alone: no people-list read */
  const users = opts.users !== undefined ? arr(opts.users) : await people();
  return isOfficeRow(row, users, e);
}
async function withOffice(who, opts){
  if (!who || who.ok === false) return who;
  if (who.admin === true || low(who.role) === 'admin') { who.office = false; return who; }
  try { who.office = await isOffice(who.email, opts); } catch (e) { who.office = false; }
  return who;
}
function _reset(){ PEOPLE = { at: 0, v: null }; }

module.exports = { isOfficeRow, isOffice, withOffice, staffRow, people, _reset };
