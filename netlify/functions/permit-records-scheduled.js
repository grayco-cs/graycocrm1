// netlify/functions/permit-records-scheduled.js — patch PERMITS2 (netlify.toml, daily ~8:41 AM Central in winter / 9:41 in summer):
//   · Mondays: the weekly 🏢 Office To-Do "Download new Shelby County permits from Develop 901 … import them" (once a week);
//   · the 1st–10th: the MSCCE public-records request for last month's permit list — only when it is switched on and has an
//     address (Owner setup → MSCCE permit list request; OFF by default). Once a month.
// Nothing here answers the web. PERMITS_OFF=1 stops it. (_lib/permit-records.js)
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode holds the MSCCE e-mail */
exports.handler = async function(){
  if (String(process.env.PERMITS_OFF || '').trim() === '1') return { statusCode: 200, body: JSON.stringify({ ok: true, off: true }) };
  const R = require('./_lib/permit-records.js'), out = {};
  try { out.weekly = await R.weeklyTask(); } catch (e) { out.weekly = { error: String(e && e.message || e).slice(0, 120) }; }
  try { out.mscce = await R.monthly(); } catch (e) { out.mscce = { error: String(e && e.message || e).slice(0, 120) }; }
  try { console.log('[permit-records]', JSON.stringify(out)); } catch (e) {}
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ ok: true }, out)) };
};
