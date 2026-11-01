// netlify/functions/cust-quiet.js — patch CUSTQUIET: what is waiting for 7:00 AM, for the CRM (staff sign-in).
//   GET                         → { quiet, releaseAt, say, admin, items: texts / e-mails held for 7 AM (newest 200) }
//   POST { op:'sendnow', id }   → ADMINS ONLY: "Send now (emergency)" for ONE held text / e-mail (an approval uses the
//                                 portal function's approval op "sendnow"). Never the default; nobody else can.
//   POST { op:'release' }       → ADMINS ONLY: run the 7 AM release now (does nothing 7 PM–7 AM).
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
function s(v){ return v == null ? '' : String(v).trim(); }
function env(k){ return s(process.env[k]); }
function T(){ return require('./bid-inbox.js')._test; }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
function cors(event){
  const allowed = (env('SITE_ORIGIN') || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const h = (event && event.headers) || {}, k = Object.keys(h).find(x => x.toLowerCase() === 'origin'), origin = s(k ? h[k] : '').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function view(x){ return { id: x.id, kind: x.kind, to: x.to, text: x.kind === 'sms' ? s(x.body).slice(0, 300) : s(x.payload && (Array.isArray(x.payload) ? x.payload[0] && x.payload[0].subject : x.payload.subject)).slice(0, 200), heldAt: x.heldAt, releaseAt: x.releaseAt, status: x.status, by: s(x.meta && x.meta.by) }; }
exports.handler = async function(event){
  event = event || {};
  const C = cors(event), m = s(event.httpMethod).toUpperCase();
  if (m === 'OPTIONS') return J(200, {}, C);
  const who = await T().staffAuth(event); if (!who.ok) return J(who.code || 401, { ok: false, error: who.error }, C);
  const CQ = require('./_lib/custquiet.js'), t = Date.now();
  try {
    if (m === 'GET') {
      let items = []; try { items = (await CQ.list()).filter(x => x.status === 'held' || x.status === 'sending').slice(-200).map(view); } catch (e) {}
      return J(200, { ok: true, quiet: CQ.quiet(t), releaseAt: new Date(CQ.nextRelease(t)).toISOString(), say: CQ.SAY, admin: !!who.admin, items }, C);
    }
    if (m === 'POST') {
      let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
      if (!who.admin) return J(403, { ok: false, adminOnly: true, error: 'Only Wesley or Nick (an admin) can send before 7 AM.' }, C);
      if (b.op === 'sendnow') { CQ.setAfterSend(require('./cust-release.js')._t.jobMsgReleased); const r = await CQ.sendNow(s(b.id)); return J(r.ok ? 200 : 409, r, C); }
      if (b.op === 'release') return J(200, await require('./cust-release.js')._t.runRelease({}), C);
    }
    return J(400, { ok: false, error: 'Bad request.' }, C);
  } catch (e) { return J(503, { ok: false, error: 'Busy — try again (' + s(e && e.message) + ').' }, C); }
};
