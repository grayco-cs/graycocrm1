/* GrayCo — the nightly data check (patch AUTO6; the rules are in _lib/datacheck.js).
   Scheduled in netlify.toml (07:05 UTC = 2:05 AM Central in summer, 1:05 AM in winter). Finds duplicate customers,
   jobs missing a PM / address / contract amount / signed contract, and leads missing a due date / assignee, and
   keeps ONE grouped item on the shared Office To-Do. Never deletes or merges anything.
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
  try {
    const out = await require('./_lib/datacheck.js').run(require('./portal.js')._core);
    try { console.log('[data-check]', JSON.stringify(out)); } catch (e) {}
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) }; }
};
