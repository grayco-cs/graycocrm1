// netlify/functions/money-rules.js — patch AUTOMONEY: the owner's money rules (10/29), signed-in staff only.
//   POST { action:'state' }                                → settings, deposit overrides, profit alerts (for the job pages)
//   POST { action:'override', pid, reason, what }          → (the job's PM or an admin) "Schedule anyway — reason"
//   POST { action:'profit', pid, actual, budget, noEstimate } → a job's costs crossed a level: alert once (PM + admins)
//   POST { action:'settings', warnPct, overPct }           → (admin) the profit alert levels
// The work is in _lib/money-rules.js; the rules in _lib/money-core.js. Nothing here goes to a customer or a sub.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const A = require('./_lib/auto-common.js');
const M = require('./_lib/money-rules.js');
const JH = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
function J(code, body){ return { statusCode: code, headers: JH, body: JSON.stringify(body) }; }
exports.handler = async function(event){
  event = event || {};
  if (!A.s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return J(500, { ok: false, error: 'SUPABASE_SERVICE_KEY not set.' });
  if (event.httpMethod !== 'POST') return J(405, { ok: false, error: 'POST only.' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { ok: false, error: 'Bad request.' }); }
  const who = await A.core().gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode || 401, { ok: false, error: who.error });
  const act = A.s(b.action);
  try {
    if (act === 'state') return J(200, await M.state());
    if (act === 'override') { const r = await M.override(b, who); return J(r.status || 200, r); }
    if (act === 'profit') { const r = await M.profit(b, who); return J(r.status || 200, r); }
    if (act === 'settings') {
      if (A.low(who.role) !== 'admin') return J(403, { ok: false, error: 'Only an admin can change the alert levels.' });
      const r = await M.saveSettings(b, who); return J(r.ok ? 200 : 400, r);
    }
  } catch (e) { return J(500, { ok: false, error: 'Something went wrong — try again.' }); }
  return J(400, { ok: false, error: 'Bad request.' });
};
