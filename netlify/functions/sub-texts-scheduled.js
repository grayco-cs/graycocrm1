// netlify/functions/sub-texts-scheduled.js — patch SUBTXT, the clock (netlify.toml: every 15 minutes).
//   6 PM Central the evening before a sub's first scheduled day, about an hour before the start time each scheduled
//   day, and the "hasn't confirmed" alert to the PM at the start time. Only subs whose 📱 Schedule texts switch is on.
//   The work is in sub-texts.js (_lib.run); the rules are in _lib/subtxt.js. SUB_TEXTS_OFF=1 turns it off.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
function s(v){ return v == null ? '' : String(v).trim(); }
exports.handler = async function(){
  const headers = { 'Content-Type': 'application/json' };
  if (s(process.env.SUB_TEXTS_OFF) === '1') return { statusCode: 200, headers, body: JSON.stringify({ ok: true, off: true }) };
  if (!s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  let report = {};
  try { report = await require('./sub-texts.js')._lib.run({}); } catch (e) { report = { error: s(e && e.message || e) }; }
  try { report.firstDay = await require('./sub-texts.js')._lib.firstDayRun({}); } catch (e) { report.firstDay = { error: s(e && e.message || e) }; }   /* patch SUBPHOTOS: the first-day portal text */
  try { console.log('[sub-texts-scheduled]', JSON.stringify(report).slice(0, 400)); } catch (e) {}
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report }) };
};
