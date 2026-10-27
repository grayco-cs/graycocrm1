// netlify/functions/mkt-report.js — GrayCo monthly marketing report (patch AGY). Scheduled (netlify.toml): the 1st of
// every month at 13:05 and 14:05 UTC; only the run that is 8 AM in Memphis sends (daylight saving or not), and a month
// is sent once. To: the admins (gc_staff + OWNER_EMAILS), the agency people, the agency portal's report list and
// MKT_REPORT_TO. What is in it: _lib/agency.js report(). Preview / send by hand: the agency portal → 🗓 Monthly report.
'use strict';
const A = require('./_lib/agency.js');
function centralHour(d){ return +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(d) % 24; }
function centralDay(d){ return +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', day: 'numeric' }).format(d); }
exports.handler = async function(){
  const now = new Date();
  if (centralDay(now) !== 1 || centralHour(now) !== 8) return { statusCode: 200, body: 'not 8 AM on the 1st in Memphis' };
  const v = await A.read();
  const d = new Date(now.getTime() - 3 * 864e5), month = d.toISOString().slice(0, 7);   /* last month */
  if (v.lastReport && v.lastReport.month === month && v.lastReport.ok) return { statusCode: 200, body: 'already sent ' + month };
  const r = await A.sendReport({ month: month });
  return { statusCode: r.ok ? 200 : 502, body: JSON.stringify(r) };
};
exports._test = { centralHour, centralDay };
