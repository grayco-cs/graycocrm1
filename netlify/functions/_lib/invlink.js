/* netlify/functions/_lib/invlink.js — patch INVLINK (owner 11/19: "Make all invoices for past projects match the QuickBooks
   invoices only. Don't create any other draw invoices etc, only match").
   A past job = finished / closed, or made / started before OLDER_BEFORE (the same day as patch PAPERS' "older job").
   On a past job the customer's invoices are the QuickBooks invoices only: a CRM-made invoice there (an automatic progress
   draw, a milestone draw, a draw a person typed before go-live) is not money owed — no statement, no reminder, no A/R.
   Records the office archived (🔗 Check invoice ↔ job links → Apply QuickBooks-only cleanup: type 'archived', _archived,
   _dupOf) are never counted either. Current / new jobs are not touched. */
'use strict';
const OLDER_BEFORE = '2026-11-19';
function s(v){ return v == null ? '' : String(v).trim(); }
function day(v){ const t = s(v); return /^\d{4}-\d\d-\d\d/.test(t) ? t.slice(0, 10) : ''; }
const DONE = /^(completed?|closed|done|paid|finished|archived|lost|cancell?ed|dead|declined)$/i;
function isPastJob(p, cut){
  if (!p) return false; cut = cut || OLDER_BEFORE;
  if (p.importedHistory || p.dataEntry || s(p.createdVia) === 'invoice-entry') return true;
  if (DONE.test(s(p.status)) || p.paidInFull === true || p.archived === true) return true;
  const m = day(p.created) || day(p.createdAt) || day(p.addedDate), st = day(p.startDate);
  return !!((m && m < cut) || (st && st < cut));
}
function fromQB(r){
  if (!r) return false;
  if (/^QB:invoice:/i.test(s(r.qbKey)) || s(r.qbNum)) return true;
  if (Array.isArray(r.qbKeys) && r.qbKeys.some(function(k){ return /^QB:invoice:/i.test(s(k)); })) return true;
  return /quickbooks/i.test(s(r.source)) || r.importedHistory === true;
}
function archived(r){ return !!r && (s(r.type).toLowerCase() === 'archived' || !!r._archived || !!r._dupOf); }
/* true → this customer invoice is not money owed (skip it in statements, reminders, A/R) */
function notCounted(r, p, cut){
  if (archived(r)) return true;
  if (!p || fromQB(r)) return false;
  const made = day(r.created) || day(r.createdAt) || day(r.date) || day(r.recvDate);
  return isPastJob(p, cut) && !(made && made >= (cut || OLDER_BEFORE));
}
module.exports = { OLDER_BEFORE, isPastJob, fromQB, archived, notCounted };
