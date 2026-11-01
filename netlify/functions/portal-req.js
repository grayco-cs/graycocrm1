// netlify/functions/portal-req.js
// GrayCo — "➕ Request a change" / "🏗 Request a new project" / "My requests" in the customer portal (property managers
// included) and on the GC's project page (patch PORTALREQ). The rules and the store are in _lib/portalreq.js.
//
// PUBLIC (the customer's link code in x-portal-token or a signed-in session in x-portal-session — exactly like portal.js;
// a GC's link code in x-gc-token — exactly like gc-portal.js). Unknown / turned-off codes get the portal's one answer.
//   POST {action:'mine', projectId?}                            → their requests (status, our replies), their properties,
//                                                                 the work types, how many requests are left today
//   POST {action:'change', projectId?, text, where?, urgency, contact, contactNote?, name?}   → a change request on that job
//   POST {action:'project', projectId?, property, workType, text, urgency, contact, contactNote?, name?} → a new-project lead
//   POST {action:'attach', id, file:{data, name}}               → one photo / PDF on a request just sent (4 × 4 MB at most)
// STAFF (CRM sign-in + gc_staff):
//   staff-list {pid?} · staff-get {id} (signed file links) · staff-pricing {id} · staff-link-co {id, coId, coNum}
//   staff-reply {id, text} · staff-decline {id, note} · staff-close {id}
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const PR = require('./_lib/portalreq.js');
let CORE = null;
function core(){ if (!CORE) CORE = require('./portal.js')._core; return CORE; }
function reply(code, headers, obj){ return { statusCode: code, headers: headers, body: JSON.stringify(obj) }; }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

exports.handler = async function(event){
  event = event || {};
  const C = core(), t0 = Date.now();
  const headers = Object.assign(C.gcCors(event, 'POST, OPTIONS', 'x-gc-token, x-portal-token, x-portal-session'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  if (String(event.body || '').length > 6 * 1024 * 1024) return reply(413, headers, { ok: false, error: 'That file is too big — send a smaller photo, or one at a time.' });
  let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  if (!C.svcKey()) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
  const action = String(body.action || 'mine');
  try {
    if (/^staff-/.test(action)) {
      const who = await C.gcStaffAuth(event);
      if (!who.ok) return reply(who.statusCode || 401, headers, { ok: false, error: who.error });
      const r = await PR.staff(body, who);
      return reply(r.code, headers, r.body);
    }
    const r = await PR.portal(event, body);
    if (r.code === 404) { const wait = 250 - (Date.now() - t0); if (wait > 0) await sleep(wait); }   /* a wrong code answers no faster than a right one */
    return reply(r.code, headers, r.body);
  } catch (e) {
    return reply(500, headers, { ok: false, error: 'Something went wrong — please call GrayCo 901-585-0944.' });
  }
};
exports._PR = PR;
