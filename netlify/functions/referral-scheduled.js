// netlify/functions/referral-scheduled.js — patch OFFICEFIX: the referral program's hourly sweep (netlify.toml, :37).
// The CRM's own calls go to referral.js, which has no schedule (a scheduled function cannot be called by its URL in
// production: Netlify answered the 🎁 Referral program screen 403). Nothing here answers the web.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
exports.handler = async function(){
  /* patch JOBSETUP: a job switched on for itself in its "Job setup" still gets its referral credit proposed while the ⚡ switch is off (and the reverse) */
  const AUTO = require('./_lib/automations.js');
  let pjs = []; try { pjs = (await require('./portal.js')._core.crmData(false)).projects || []; } catch (e) {}
  const h = await AUTO.gateJobs('referral_credits', pjs); if (h) return { statusCode: 200, body: JSON.stringify(h) };
  let globalOn = true; try { globalOn = await AUTO.isOn('referral_credits'); } catch (e) {}
  return require('./referral.js')._hourly({ globalOn: globalOn });
};   /* patch AUTOPANEL */
