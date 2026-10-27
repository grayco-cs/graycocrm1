/* GrayCo — patch SENTLOG, the hourly run (the rules are in _lib/sentlog.js): an e-mail that asked for something and is
   still waiting → answered by the CRM itself (the sub uploaded the COI / W-9, a newer COI on file, the customer answered
   every "We need from you" item)? Else, past its days → "📬 No reply — follow up" on the shared Office To-Do; after 2
   reminders with no answer → the admins too (🟠 Soon, 🔴 ASAP for insurance). Sends nothing.
   Scheduled in netlify.toml. GET ?ping=1 → alive. Anything that is not Netlify's scheduled call is refused.
   MAIL_FOLLOWUP_OFF=1 switches it off. */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
function isScheduled(event){
  try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; }
}
exports.handler = async function(event){
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const qs = event.queryStringParameters || {};
  if (qs.ping === '1') return { statusCode: 200, headers, body: JSON.stringify({ ok: true, service: 'GrayCo e-mail follow-ups' }) };
  if (!isScheduled(event)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Scheduled only.' }) };
  if (String(process.env.MAIL_FOLLOWUP_OFF || '') === '1') return { statusCode: 200, headers, body: JSON.stringify({ ok: true, off: true }) };
  let out;
  try { out = await require('./_lib/sentlog.js').run(); } catch (e) { out = { ok: false, error: String(e && e.message || e).slice(0, 200) }; }
  try { console.log('[mail-followup]', JSON.stringify(out)); } catch (e) {}
  return { statusCode: 200, headers, body: JSON.stringify(out) };
};
