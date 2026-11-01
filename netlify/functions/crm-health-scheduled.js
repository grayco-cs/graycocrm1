// netlify/functions/crm-health-scheduled.js — patch OFFICEFIX: the daily run of 🩺 CRM health (netlify.toml): the
// mitigation equipment reminder, and the health e-mail to the admins on the 1st. The CRM's own calls (the GrayCo
// Systems ping, the ⚙ Admin health card) go to crm-health.js, which has no schedule (a scheduled function cannot be
// called by its URL in production). Nothing here answers the web.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
exports.handler = async function(){
  const out = await require('./crm-health.js')._test.daily();
  try { console.log('[crm-health]', JSON.stringify(out)); } catch (e) {}
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ ok: true }, out)) };
};
