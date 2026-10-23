/* GrayCo — lost-lead win-back, the daily run (patch AUTO6; the rules are in _lib/winback.js).
   Scheduled in netlify.toml (about 10:20 AM Central). Puts at most one approval item per batch (6 / 12 months) on
   the approvals list; nothing is sent until an admin approves it. GET ?ping=1 → alive. A scheduled function has no
   public URL in production; anything that is not Netlify's scheduled call (body { next_run }) is refused. */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
function isScheduled(event){
  try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; }
}
exports.handler = async function(event){
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const qs = event.queryStringParameters || {};
  if (qs.ping === '1') return { statusCode: 200, headers, body: JSON.stringify({ ok: true, service: 'GrayCo lost-lead win-back', off: process.env.WINBACK_OFF === '1' }) };
  if (!isScheduled(event)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Scheduled only.' }) };
  try {
    const out = await require('./_lib/winback.js').run(require('./portal.js')._core);
    try { console.log('[winback]', JSON.stringify(out)); } catch (e) {}
    return { statusCode: 200, headers, body: JSON.stringify(Object.assign({ ok: true }, out)) };
  } catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) }; }
};
