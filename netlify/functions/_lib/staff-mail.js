// netlify/functions/_lib/staff-mail.js — patch OFFICEFIX: who is "staff" for the CRM's own staff-only e-mail.
// Owner 11/01: Malcolm, the Marketing Manager, is staff with a PERSONAL e-mail (not @grayco-cs.com). Before, every
// staff-only check looked at the domain alone, so his marketing reports, digests and alerts were dropped, or held as
// "customer mail" in data-entry mode.
//
// The rule (data, never a name typed into code): an address is staff when
//   · it is @grayco-cs.com (or a subdomain such as in.grayco-cs.com), as before; or
//   · it is the e-mail of an ACTIVE gc_staff row; or the gc_staff row of the active Marketing Manager (profile
//     'marketing' with mkt_active on — that row is kept "not active" on purpose so the database gives him marketing only).
// This decides only where staff-only mail may go. Who is an admin or the office is unchanged (_lib/staff-role.js,
// _lib/office-access.js): the Marketing Manager stays marketing-only.
//
// The gc_staff e-mails are read ONCE per function instance and kept 5 minutes (one GET, never one per message). When the
// list cannot be read, only @grayco-cs.com counts (fail closed: an outside address is never treated as staff on a guess).
//
//   load({ fresh })   → Promise<Set> (the gc_staff staff e-mails; call it once before the sync checks below)
//   isStaffEmail(e)   → true / false (sync: the domain, or the list loaded last)
//   isStaffRow(row)   → true / false (pure)
'use strict';
const DOMAIN = /@([a-z0-9-]+\.)*grayco-cs\.com$/i;
const TTL = 5 * 60 * 1000;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
let C = { at: 0, set: new Set(), ok: false, busy: null };

function isStaffRow(row){
  if (!row || typeof row !== 'object' || !okEmail(row.email)) return false;
  if (row.active !== false) return true;
  return low(row.profile) === 'marketing' && row.mkt_active === true;
}
async function read(){
  const key = s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) return null;
  const url = s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, '');
  try {
    /* a GET to Supabase is never a "send": the data-entry guard (pause.js) lets it straight through */
    const r = await globalThis.fetch(url + '/rest/v1/gc_staff?select=*', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    if (!r || !r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    return new Set(rows.filter(isStaffRow).map(function(x){ return low(x.email); }));
  } catch (e) { return null; }
}
async function load(opts){
  if (!(opts && opts.fresh) && C.at && Date.now() - C.at < TTL) return C.set;
  if (C.busy) return C.busy;
  C.busy = read().then(function(set){
    C = { at: Date.now(), set: set || (C.ok ? C.set : new Set()), ok: !!set || C.ok, busy: null };
    if (!set) C.at = Date.now() - TTL + 30000;   /* could not read: try again in 30 s, keep what we had */
    return C.set;
  }, function(){ C.busy = null; return C.set; });
  return C.busy;
}
function isStaffEmail(e){
  const a = low(e);
  if (!okEmail(a)) return false;
  return DOMAIN.test(a) || C.set.has(a);
}
function _reset(){ C = { at: 0, set: new Set(), ok: false, busy: null }; }

module.exports = { load, isStaffEmail, isStaffRow, DOMAIN, _reset };
