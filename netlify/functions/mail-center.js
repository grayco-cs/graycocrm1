// netlify/functions/mail-center.js — patch MAILC: the 📧 Email Center (the CRM's Gmail tab), staff only.
// Owner 10/23: "I don't think any of this works, but I'd like this to work for all emails and aliases that I have, so I
// can see all emails in here."
//   GET  ?settings=1       → the company's addresses (aliases / groups, which mailbox receives each, copy to the CRM?)
//                            + whether the Google routing rule (mail@in history) is confirmed
//   POST ?settings=1       → admins: save the addresses
//   GET  ?log=1&addr=&q=   → "📥 All company mail": the e-mails the CRM's receiving domain got (who, to, subject, what
//                            the CRM did — metadata only), newest first. Only mail that reaches the CRM is here.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const MC = require('./_lib/mailcenter.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function env(k){ return s(process.env[k]); }
function L(){ return require('./bid-inbox.js')._lib; }
function T(){ return require('./bid-inbox.js')._test; }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
function cors(event){
  const allowed = (env('SITE_ORIGIN') || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const h = (event && event.headers) || {}, k = Object.keys(h).find(x => x.toLowerCase() === 'origin'), origin = s(k ? h[k] : '').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}

exports.handler = async function(event){
  event = event || {};
  const C = cors(event), qs = event.queryStringParameters || {}, m = s(event.httpMethod).toUpperCase();
  if (m === 'OPTIONS') return J(200, {}, C);
  const who = await T().staffAuth(event); if (!who.ok) return J(who.code || 401, { ok: false, error: who.error }, C);
  try {
    if (qs.settings && m === 'GET') {
      const set = MC.settings(await L().kvGet(MC.SET_KEY));
      let routing = false; try { const c = (await L().kvGet('gc_comms_settings')) || {}; routing = !!c.routingConfirmed; } catch (e) {}
      return J(200, { ok: true, settings: set, defaults: MC.DEFAULT_ALIASES, routingConfirmed: routing, me: low(who.email), admin: !!who.admin }, C);
    }
    if (qs.settings && m === 'POST') {
      if (!who.admin) return J(403, { ok: false, error: 'Only an admin can change the company addresses.' }, C);
      let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
      const v = MC.settings(b.settings || b); v.by = low(who.email); v.at = new Date().toISOString();
      await L().kvCas(MC.SET_KEY, () => v);
      return J(200, { ok: true, settings: v }, C);
    }
    if (qs.log && m === 'GET') {
      const all = (await L().kvGet(MC.LOG_KEY)) || [];
      const rows = MC.query(all, { addr: qs.addr, q: qs.q, limit: qs.limit });
      const counts = {};
      (Array.isArray(all) ? all : []).forEach(x => (x && Array.isArray(x.to) ? x.to : []).forEach(t => { const k = low(t).replace('@in.grayco-cs.com', '@grayco-cs.com'); counts[k] = (counts[k] || 0) + 1; }));
      return J(200, { ok: true, total: Array.isArray(all) ? all.length : 0, rows, counts }, C);
    }
    return J(400, { ok: false, error: 'Bad request.' }, C);
  } catch (e) { return J(503, { ok: false, error: 'The Email Center is busy — try again (' + s(e && e.message) + ').' }, C); }
};
