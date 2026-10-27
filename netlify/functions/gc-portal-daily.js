/* GrayCo — GC portal daily run (patch GCP; the rules are in _lib/gcp.js).
   Scheduled in netlify.toml (about 8:40 AM Central):
     • company documents (COI, W-9, licenses …) that run out within 30 days / 7 days / have run out → one e-mail to the
       admins and one Office To-Do (each step once per document);
     • from March 15 and from September 15: the spring / fall free roof inspection offer — ONE approval item for the
       admins with every past customer it would go to (nothing is sent until it is approved).
   GET ?ping=1 → alive. Anything that is not Netlify's scheduled call (body { next_run }) is refused. */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
function isScheduled(event){ try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; } }
exports.handler = async function(event){
 try { await require('./_lib/brand.js').addressReady(); } catch (e) {}   /* patch ADDRALL: the saved company address before anything is made */
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const qs = event.queryStringParameters || {};
  if (qs.ping === '1') return { statusCode: 200, headers, body: JSON.stringify({ ok: true, service: 'GrayCo GC portal daily' }) };
  if (!isScheduled(event)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Scheduled only.' }) };
  const G = require('./_lib/gcp.js'), C = require('./portal.js')._core, out = {};
  try {
    const data = await C.crmData(true);
    try { out.docs = await G.complianceRun(data); } catch (e) { out.docs = { error: String(e && e.message || e) }; }
    try { out.inspect = await G.inspectRun(data); } catch (e) { out.inspect = { error: String(e && e.message || e) }; }
    try { console.log('[gc-portal-daily]', JSON.stringify(out)); } catch (e) {}
    return { statusCode: 200, headers, body: JSON.stringify(Object.assign({ ok: true }, out)) };
  } catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) }; }
};
