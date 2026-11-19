// netlify/functions/job-notify.js — patch JOBMSG: a team message on a job's 💬 Job Messages → a real notification (phone push +
// a text to the cell from the GrayCo alerts number) for each person @tagged, or the job's PM when nobody is (never the sender).
// The rules (quiet hours, Away, the 5-minute throttle, @Office) live in _lib/jobmsgnotify.js.
//   POST { pid, msgId, text, tags: [user ids / names] }  (staff sign-in; the page adds it)
//   → { ok, why: 'mention' | 'pm' | 'owner', to: [{ name, why, pushed, texted, held, throttled, noPhone }], quiet, pushWhy }
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first (staff texts / pushes pass) */
const portal = require('./portal.js');
function s(v){ return v == null ? '' : String(v).trim(); }
exports.handler = async function(event){
  event = event || {};
  const C = portal._core, cors = C.gcCors(event, 'POST, OPTIONS');
  const headers = Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors);
  const J = function(code, o){ return { statusCode: code, headers: headers, body: JSON.stringify(o) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return J(405, { ok: false, error: 'POST only' });
  const who = await C.gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode || 401, { ok: false, error: who.error });
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Bad request' }); }
  try {
    const r = await require('./_lib/jobmsgnotify.js').run({ email: who.email, name: who.name }, b);
    if (!r.ok) return J(r.code || 400, { ok: false, error: r.error });
    /* names only back to the page (never a phone number) */
    return J(200, { ok: true, why: r.why, quiet: !!r.quiet, pushWhy: s(r.pushWhy), textWhy: s(r.textWhy), notStaff: r.skipped.notStaff,
      to: r.to.map(function(x){ return { name: x.name, why: x.why, pushed: !!x.pushed, texted: !!x.texted, held: !!x.held, throttled: !!x.throttled, noPhone: !!x.noPhone }; }) });
  } catch (e) { return J(502, { ok: false, error: 'Something went wrong: ' + s(e && e.message).slice(0, 120) }); }
};
