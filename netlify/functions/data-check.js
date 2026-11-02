/* GrayCo — the nightly data check (patch AUTO6; the rules are in _lib/datacheck.js).
   Scheduled in netlify.toml (07:05 UTC = 2:05 AM Central in summer, 1:05 AM in winter). Finds duplicate customers,
   jobs missing a PM / address / contract amount / signed contract, and leads missing a due date / assignee, and
   keeps ONE grouped item on the shared Office To-Do. Never deletes or merges anything.
   patch DATAFULL: it also keeps the per-job data checklist (_lib/jobdata.js) for the CRM's 🧾 Missing job data board, and
   the runs at 12:05 / 13:05 UTC send the MORNING ALERT — whichever of them is 7–9 AM Central (daylight saving or not):
   one e-mail + phone push to the admins and the office, "🧾 Job data check: N jobs need info" (_lib/datacheck.js morning).
   GET ?ping=1 → alive. Anything that is not Netlify's scheduled call (body { next_run }) is refused. */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
function isScheduled(event){
  try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; }
}
exports.handler = async function(event){
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const qs = event.queryStringParameters || {};
  if (qs.ping === '1') return { statusCode: 200, headers, body: JSON.stringify({ ok: true, service: 'GrayCo nightly data check', off: process.env.DATACHECK_OFF === '1' }) };
  if (!isScheduled(event)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Scheduled only.' }) };
  { const h = await require('./_lib/automations.js').gate('data_check'); if (h) return { statusCode: 200, headers, body: JSON.stringify(h) }; }   /* patch AUTOPANEL */
  try {
    const DC = require('./_lib/datacheck.js'), core = require('./portal.js')._core;
    const h = require('./_lib/auto-common.js').central(Date.now()).hour;
    const out = h >= 7 && h < 10 ? { morning: await DC.morning(core) } : await DC.run(core);   /* patch DATAFULL: the 7 AM run alerts; the night run checks */
    try { console.log('[data-check]', JSON.stringify(out)); } catch (e) {}
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) }; }
};
