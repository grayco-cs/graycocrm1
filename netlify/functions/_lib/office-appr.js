// netlify/functions/_lib/office-appr.js — patch OFFICEAPPR (owner, 10/27): the office manager "can approve everything
// except payroll." The office (a CRM user whose role starts with "Office", e.g. "Office Admin", or the gc_staff role
// office) may approve every approval an admin may, at any step — the PM's step counts as done, the same as when an
// admin approves it. Payroll (payroll runs, pay stubs, anything payroll) stays Wesley / Nick (admins) only.
// Office still gets no admin-only areas (payroll screens, staff / security settings, API keys): only approvals.
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
/* anything payroll: a payroll run, a pay week sign-off, a pay stub, a paycheck */
const PAYROLL_KIND = /payroll|pay_?stub|paystub|paycheck|pay_?run|pay_?week|wage_run/i;
function isPayrollKind(kind){ return PAYROLL_KIND.test(s(kind)); }
function isPayrollItem(x){ x = x || {}; const m = x.meta || {}; return isPayrollKind(x.kind) || isPayrollKind(m.kind) || m.payroll === true || x.payroll === true; }
function isOfficeRole(role){ return /^office/i.test(s(role)); }
/* who = the signed-in staff row ({ email, role }); users = the CRM's users list */
function isOfficeUser(users, who){
  if (!who) return false;
  if (isOfficeRole(who.role) || /(^|\s)office$/i.test(s(who.role))) return true;
  const e = low(who.email); if (!e) return false;
  const u = (Array.isArray(users) ? users : []).find(function(x){ return x && low(x.email) === e; });
  return !!(u && u.active !== false && isOfficeRole(u.role));
}
module.exports = { PAYROLL_KIND, isPayrollKind, isPayrollItem, isOfficeRole, isOfficeUser };
