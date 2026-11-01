// netlify/functions/_lib/staff-role.js — patch AUTHFIX: ONE rule for "is this signed-in staff member an admin".
// Owner 10/30: "the owner should never be refused anything". Before, every function wrote its own check
// (role === 'admin', low(role) !== 'admin', /admin|owner|office/ …), so an owner whose gc_staff role was written any
// other way, or an admin listed only in LEAD_ADMINS, passed one door and was refused at the next.
//
// The rule (data first, never a name typed into code):
//   · the gc_staff role is admin or owner ('admin', 'Admin', 'owner', 'Owner/Admin', 'administrator' …) — an owner
//     counts as an admin. 'Office Admin' is NOT an admin (it starts with office: the office rules decide);
//   · or the e-mail is in the server setting OWNER_EMAILS (only when it is set on Netlify — no built-in names here);
//   · or the e-mail is in an extra list the caller passes (bid-inbox's LEAD_ADMINS, as before).
// Never an admin: the Marketing Manager profile, or someone who is not active staff — this helper is only asked
// AFTER the staff check passed (who.ok), so it never lets a non-staff account in.
//
//   isAdminRole(role)            → true / false (pure)
//   isAdmin(who, extraEmails)    → true / false — who = { role, email, admin?, marketing? } (a staff check's answer
//                                  or a gc_staff row)
//   isOfficeOrAdmin(who)         → true / false — patch OFFICEFIX: THE check for "the office or an admin may do this".
//                                  An admin (above), or active staff that the office rule marked who.office = true
//                                  (_lib/office-access.js withOffice / officeOrAdmin fill it in from the data), or whose
//                                  gc_staff role / profile is office. Never the Marketing Manager, never someone inactive,
//                                  never a refused sign-in (who.ok false).
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function list(v){ return (Array.isArray(v) ? v : s(v).split(',')).map(low).filter(Boolean); }

const ADMIN_ROLE = /^(admin|administrator|owner)(\b|$)/;
function isAdminRole(role){ return ADMIN_ROLE.test(low(role)); }
function ownerEmails(){ return list(process.env.OWNER_EMAILS); }

function isAdmin(who, extraEmails){
  if (!who || typeof who !== 'object' || who.ok === false) return false;
  if (who.marketing === true || low(who.profile) === 'marketing' || low(who.role) === 'marketing') return false;
  if (who.active === false) return false;
  if (who.admin === true || isAdminRole(who.role)) return true;
  const e = low(who.email);
  if (!e) return false;
  return ownerEmails().indexOf(e) > -1 || list(extraEmails).indexOf(e) > -1;
}

function isOfficeOrAdmin(who){
  if (!who || typeof who !== 'object' || who.ok === false) return false;
  if (who.marketing === true || low(who.profile) === 'marketing' || low(who.role) === 'marketing' || who.mkt_active === true) return false;
  if (who.active === false) return false;
  if (isAdmin(who)) return true;
  return who.office === true || /^office/.test(low(who.role)) || low(who.profile) === 'office';
}

module.exports = { isAdminRole, isAdmin, isOfficeOrAdmin, ownerEmails };
