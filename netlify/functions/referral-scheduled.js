// netlify/functions/referral-scheduled.js — patch OFFICEFIX: the referral program's hourly sweep (netlify.toml, :37).
// The CRM's own calls go to referral.js, which has no schedule (a scheduled function cannot be called by its URL in
// production: Netlify answered the 🎁 Referral program screen 403). Nothing here answers the web.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
exports.handler = async function(){ const h = await require('./_lib/automations.js').gate('referral_credits'); if (h) return { statusCode: 200, body: JSON.stringify(h) }; return require('./referral.js')._hourly(); };   /* patch AUTOPANEL */
