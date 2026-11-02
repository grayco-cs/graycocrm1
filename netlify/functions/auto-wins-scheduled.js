// netlify/functions/auto-wins-scheduled.js — patch OFFICEFIX: the hourly schedule of the automation quick wins
// (netlify.toml). The work is in auto-wins.js, which has no schedule, so the CRM page can call it (a scheduled function
// cannot be called by its URL in production: Netlify answered the 📋 Approvals stamp 403). Nothing here answers the web.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const W = require('./auto-wins.js');
exports.handler = async function(){
  const headers = { 'Content-Type': 'application/json' };
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  const out = await W._run({});
  try { console.log('[auto-wins]', JSON.stringify(out).slice(0, 600)); } catch (e) {}
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report: out }) };
};
