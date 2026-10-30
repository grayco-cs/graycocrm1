// netlify/functions/comms.js — patch X9: the job's 💬 Communication timeline (staff only).
// Owner 10/21: "E-mail history and chat history so office, PM and anyone else in the company can see what we told them."
//   GET  ?job=<job id>   → every e-mail with the customer / adjuster / sub / GC (the Google routing copies, _lib/comms.js),
//                          the CRM's own e-mails about the job (✉️ sends — gc_email_log; approved e-mails — the approval
//                          queue), text messages, portal posts and what the customer signed in the portal. Newest first.
//   GET  ?status=1       → is the routing rule on, the last e-mail filed, how many were kept / thrown away per day
//   POST ?settings=1     → { routingConfirmed: true|false } (admins) — while it is off, the CRM's ✉️ / Gmail buttons BCC
//                          mail@in.grayco-cs.com themselves
// Signed-in GrayCo staff (gc_staff) only. The customer portal and the sub portal never read it.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const CM = require('./_lib/comms.js');
const SET = 'gc_comms_settings';
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function L(){ return require('./bid-inbox.js')._lib; }
function T(){ return require('./bid-inbox.js')._test; }
function core(){ return require('./portal.js')._core; }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const h = (event && event.headers) || {}, k = Object.keys(h).find(function(x){ return x.toLowerCase() === 'origin'; }), origin = s(k ? h[k] : '').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function text(html){ return s(String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n')).slice(0, 8000); }

async function timeline(pid){
  const own = await CM.read(pid);
  let d = {}; try { d = await core().kvRead(['gc_email_log', 'gc_approval_queue', 'gc_portal_auto_posts', 'selectionResponses']); } catch (e) {}
  const out = own.slice();
  arr(d.gc_email_log).forEach(function(x){ if (s(x.pid) !== s(pid)) return;
    out.push({ id: 'log_' + s(x.id), kind: 'email', dir: 'out', via: 'crm', at: s(x.at), from: { name: s(x.by), email: s(x.from) }, to: arr(x.to).length ? x.to : [], cc: x.cc || [], subject: s(x.subject), text: s(x.text), files: (x.attachments || []).map(function(n){ return { name: s(n) }; }) }); });
  arr(d.gc_approval_queue).forEach(function(x){ if (s(x.jobId) !== s(pid) || !/^(sent|posted|done)$/.test(s(x.status))) return;
    out.push({ id: 'aq_' + s(x.id), kind: x.channel === 'sms' ? 'text' : (x.channel === 'portal' ? 'portal' : 'email'), dir: 'out', via: 'crm', at: s(x.sentAt || x.updatedAt || x.createdAt), from: { name: 'GrayCo (approved by ' + (arr(x.approvals).map(function(a){ return s(a.by || a.name); }).filter(Boolean).join(', ') || 'the team') + ')', email: '' },
      to: s(x.to) ? [s(x.to)] : [], subject: s(x.subject) || s(x.title), text: s(x.text) || text(x.html), files: (x.attachments || []).map(function(a){ return { name: s(a.name || a.filename || a.kind) }; }) }); });
  arr(d.gc_portal_auto_posts).forEach(function(x){ if (s(x.pid || x.projectId || x.jobId) !== s(pid)) return;
    out.push({ id: 'pp_' + s(x.id), kind: 'portal', dir: 'out', via: 'portal', at: s(x.at || x.postedAt || x.createdAt), from: { name: s(x.by || 'GrayCo'), email: '' }, subject: s(x.title || 'Portal update'), text: s(x.text) || text(x.html) }); });
  const sig = {}; arr(d.selectionResponses).forEach(function(x){ if (s(x.pid) !== s(pid)) return; const k = s(x.sigId || x.id); if (sig[k]) { sig[k].text += '\n' + s(x.title) + ': ' + s(x.label); return; }
    sig[k] = { id: 'sel_' + k, kind: 'portal', dir: 'in', via: 'portal', at: s(x.at), from: { name: s(x.name), email: '' }, subject: x.kind === 'sign' ? 'Signed their selections in the portal' : 'Picked their selections in the portal', text: s(x.title) + ': ' + s(x.label) }; });
  Object.keys(sig).forEach(function(k){ out.push(sig[k]); });
  return out.filter(function(x){ return x && x.id; }).sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; });
}

exports.handler = async function(event){
  event = event || {};
  const C = cors(event), qs = event.queryStringParameters || {};
  if (event.httpMethod === 'OPTIONS') return J(200, {}, C);
  const who = await T().staffAuth(event); if (!who.ok) return J(who.code || 401, { ok: false, error: who.error }, C);
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return J(500, { ok: false, error: 'SUPABASE_SERVICE_KEY is not set on Netlify.' }, C);
  try {
    if (event.httpMethod === 'GET' && qs.job) {
      const pid = s(qs.job); if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(pid)) return J(400, { ok: false, error: 'Bad job id.' }, C);
      return J(200, { ok: true, job: pid, items: await timeline(pid) }, C);
    }
    if (event.httpMethod === 'GET' && qs.status) {
      const st = (await L().kvGet(CM.STATUS)) || {}, set = (await L().kvGet(SET)) || {};
      const days = Object.keys(st.days || {}).sort().slice(-14).map(function(k){ return { day: k, kept: st.days[k].m || 0, thrownAway: st.days[k].d || 0 }; });
      return J(200, { ok: true, address: CM.journalAddrs()[0], routingConfirmed: !!set.routingConfirmed, confirmedBy: s(set.by), confirmedAt: s(set.at), lastAt: s(st.lastAt), lastJob: s(st.lastJob), lastHow: s(st.lastHow), kept: st.matched || 0, thrownAway: st.discarded || 0, days: days, admin: !!who.admin }, C);
    }
    if (event.httpMethod === 'POST' && qs.settings) {
      if (!(who.admin || who.office)) return J(403, { ok: false, error: 'Only an admin or the office can change this.' }, C);   /* patch OFFICEFULL */
      let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
      const v = { routingConfirmed: b.routingConfirmed === true, by: who.email, at: new Date().toISOString() };
      await L().kvCas(SET, function(){ return v; });
      return J(200, Object.assign({ ok: true }, v), C);
    }
    return J(400, { ok: false, error: 'Bad request.' }, C);
  } catch (e) { return J(503, { ok: false, error: 'The e-mail history is busy — try again (' + s(e && e.message) + ').' }, C); }
};
exports._timeline = timeline;
