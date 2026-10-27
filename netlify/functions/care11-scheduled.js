/* GrayCo — patch AUTO11, the daily run (the rules are in _lib/care11.js): COI renewal requests to subs, the warranty
   check-up offer (one approval item per day at most), and the "We need from you" reminders.
   Scheduled in netlify.toml (about 9:35 AM Central). GET ?ping=1 → alive. Anything that is not Netlify's scheduled call
   (body { next_run }) is refused. COI_REQUESTS_OFF=1 / WARRANTY_CHECK_OFF=1 / CUST_NEEDS_REMIND_OFF=1 switch a part off. */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
function isScheduled(event){
  try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; }
}
exports.handler = async function(event){
 try { await require('./_lib/brand.js').addressReady(); } catch (e) {}   /* patch ADDRALL: the saved company address before anything is made */
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const qs = event.queryStringParameters || {};
  if (qs.ping === '1') return { statusCode: 200, headers, body: JSON.stringify({ ok: true, service: 'GrayCo COI requests, warranty check-ups, customer requests' }) };
  if (!isScheduled(event)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Scheduled only.' }) };
  const CARE = require('./_lib/care11.js'), out = {};
  for (const [k, f] of [['coi', CARE.coiRun], ['warranty', CARE.warrRun], ['needs', CARE.needsRun]]) {
    try { out[k] = await f(); } catch (e) { out[k] = { error: String(e && e.message || e).slice(0, 200) }; }
  }
  try { console.log('[care11]', JSON.stringify(out)); } catch (e) {}
  return { statusCode: 200, headers, body: JSON.stringify(Object.assign({ ok: true }, out)) };
};
