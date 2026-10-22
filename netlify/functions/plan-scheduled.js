// netlify/functions/plan-scheduled.js — patch PLAN, the schedule (netlify.toml: 07:00, 08:00, 11:00, 12:00 UTC):
//   the run that lands on 2 AM Central writes everyone's "📅 Today's plan" into the To-Do; the one that lands on 6 AM
//   Central sends the optional plan e-mail to the people who turned it on. Every other run does nothing.
//   The work is in plan-nightly.js (which also answers the Admin "Run now" / preview calls). PLAN_OFF=1 turns it off.
'use strict';
const N = require('./plan-nightly.js');
function s(v){ return v == null ? '' : String(v).trim(); }
exports.handler = async function(){
  const headers = { 'Content-Type': 'application/json' };
  if (!s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  const out = {};
  try { out.plan = await N._run.plan({}); } catch (e) { out.plan = { error: s(e && e.message || e) }; }
  try { out.mail = await N._run.mail({}); } catch (e) { out.mail = { error: s(e && e.message || e) }; }
  try { console.log('[plan-scheduled]', JSON.stringify(out).slice(0, 400)); } catch (e) {}
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report: out }) };
};
