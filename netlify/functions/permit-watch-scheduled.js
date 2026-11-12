// netlify/functions/permit-watch-scheduled.js — patch PERMITS: the daily 🏗️ Permitted jobs scan (netlify.toml, early morning Central).
// The CRM's own calls (list, Run now, ⚙ Filters, Make it a lead) go to permit-watch.js, which has no schedule (a scheduled function
// cannot be called by its URL in production). Nothing here answers the web. PERMITS_OFF=1 stops it.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE */
exports.handler = async function(){
  if (String(process.env.PERMITS_OFF || '').trim() === '1') return { statusCode: 200, body: JSON.stringify({ ok: true, off: true }) };
  const out = await require('./permit-watch.js').run({ by: 'schedule', budgetMs: 24000 });
  try { console.log('[permit-watch]', JSON.stringify({ ok: out.ok, found: out.found, added: out.added, error: out.error, nashville: out.status && out.status.nashville && { read: out.status.nashville.read, matched: out.status.nashville.matched, error: out.status.nashville.error }, shovels: out.status && out.status.shovels && { active: out.status.shovels.active, read: out.status.shovels.read, matched: out.status.shovels.matched, error: out.status.shovels.error } })); } catch (e) {}
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: !!out.ok, found: out.found, added: out.added, error: out.error || '' }) };
};
