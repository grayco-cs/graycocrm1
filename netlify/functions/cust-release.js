// netlify/functions/cust-release.js — patch CUSTQUIET, the 7:00 AM release (netlify.toml: every 10 minutes).
//   Owner: "never post to portal or send texts anything after 7pm -7am". Everything a customer or a sub would have got
//   7 PM–7 AM Central was held (_lib/custquiet.js): texts and customer e-mails in the queue (gc_lead_inbox_kv
//   "gc_cust_quiet"), approvals as status "scheduled" (portal.js). The first run at / after 7:00 AM Central sends them,
//   oldest first, each exactly once (claimed before sending — a second run, or two at once, find nothing left), then the
//   portal's new-papers notices that waited. Inside the window (and on every run with nothing due) it does nothing.
//   A scheduled function cannot be called by its URL in production; an admin can run it from cust-quiet.js (op release).
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
function s(v){ return v == null ? '' : String(v).trim(); }
function core(){ return require('./portal.js')._core; }
function isScheduled(event){ try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; } }

/* a released text's Job Messages line loses its "⏰ Scheduled 7:00 AM" label */
async function jobMsgReleased(item, how){
  const mid = s(item && item.meta && item.meta.jobMsgId); if (!mid) return;
  const at = new Date().toISOString();
  await core().kvListUpdate('gc_job_messages', function(l){
    const m = l.find(function(x){ return x && s(x.id) === mid; }); if (!m || !m.heldUntil) return null;
    m.authorName = s(m.authorName).replace(/ · ⏰ Scheduled 7:00 AM$/, ''); delete m.heldUntil; m.releasedAt = at; if (how === 'override') m.sentNow = true;
    return { list: l, check: function(l2){ const z = l2.find(function(x){ return x && s(x.id) === mid; }); return !!(z && !z.heldUntil); } };
  });
}
async function runRelease(opts){
  opts = opts || {};
  const CQ = require('./_lib/custquiet.js');
  CQ.setAfterSend(jobMsgReleased);
  const t = Date.now();
  if (CQ.quiet(t)) return { ok: true, quiet: true, releaseAt: new Date(CQ.nextRelease(t)).toISOString() };
  const out = { ok: true };
  try { out.queue = await CQ.release({}); } catch (e) { out.queue = { error: s(e && e.message || e) }; }
  try { out.approvals = await core().releaseScheduled({}); } catch (e) { out.approvals = { error: s(e && e.message || e) }; }
  if (out.queue && out.queue.notices) { try { out.notices = await core().notifyAll({}); } catch (e) { out.notices = { error: s(e && e.message || e) }; } }
  return out;
}
exports.handler = async function(event){
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const qs = (event && event.queryStringParameters) || {};
  if (qs.ping === '1') return { statusCode: 200, headers, body: JSON.stringify({ ok: true, service: 'GrayCo customer quiet-hours release' }) };
  if (!isScheduled(event)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Scheduled only.' }) };
  if (!s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  let report = {};
  try { report = await runRelease({}); } catch (e) { report = { ok: false, error: s(e && e.message || e) }; }
  try { if (!report.quiet) console.log('[cust-release]', JSON.stringify(report).slice(0, 600)); } catch (e) {}
  return { statusCode: 200, headers, body: JSON.stringify(report) };
};
exports._t = { runRelease, jobMsgReleased };
