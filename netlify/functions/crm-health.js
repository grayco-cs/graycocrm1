/* GrayCo — 🩺 CRM health (patch AUTO13; the rules are in _lib/health13.js).
   Scheduled daily in netlify.toml: the mitigation equipment reminder every day, the health e-mail to the admins on
   the 1st of the month (Central time, once per month).
   GET (admin)                → the report as JSON (nothing is sent)
   POST {act:'send'} (admin)  → send the health e-mail to the admins now
   GET ?ping=1                → alive.   CRM_HEALTH_OFF=1 stops the e-mail; EQUIP_REMIND_OFF=1 stops the reminder. */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const L = require('./bid-inbox.js')._lib;
const H = require('./_lib/health13.js');
const KEY = 'gc_health13_state';
function LL(){ return H._D.lib || L; }   /* tests swap the store */
function hdr(e, k){ const h = (e && e.headers) || {}; return String(h[k] || h[k.toLowerCase()] || ''); }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function reply(code, headers, o){ return { statusCode: code, headers, body: JSON.stringify(o) }; }
function isScheduled(event){ try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; } }
function off(k){ return String(process.env[k] || '').trim() === '1'; }
function centralDay(){ return new Date().toLocaleString('en-CA', { timeZone: 'America/Chicago' }).slice(0, 10); }
async function daily(){
  const out = {};
  if (!off('EQUIP_REMIND_OFF')) { try { out.equipment = await H.equipRun(); } catch (e) { out.equipment = { error: String(e && e.message || e).slice(0, 160) }; } }
  const day = centralDay(), month = day.slice(0, 7);
  let st = {}; try { st = (await LL().kvGet(KEY)) || {}; } catch (e) {}
  if (!off('CRM_HEALTH_OFF') && day.slice(8, 10) === '01' && st.month !== month) {
    try { const r = await H.send(); out.health = r; if (r.ok) st.month = month; } catch (e) { out.health = { error: String(e && e.message || e).slice(0, 160) }; }
  }
  st.lastRun = new Date().toISOString(); st.last = out; if (out.health && out.health.error) st.error = out.health.error; else delete st.error;
  try { await LL().kvPut(KEY, st); } catch (e) {}
  return out;
}
exports.handler = async function(event){
  event = event || {};
  const headers = Object.assign(cors(event), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const q = event.queryStringParameters || {};
  try {
    if (q.ping === '1') return reply(200, headers, { ok: true, service: 'GrayCo CRM health' });
    if (isScheduled(event)) { const out = await daily(); try { console.log('[crm-health]', JSON.stringify(out)); } catch (e) {} return reply(200, headers, Object.assign({ ok: true }, out)); }
    const who = await require('./bid-inbox.js')._test.staffAuth(event);
    if (!who.ok) return reply(who.code || 401, headers, { ok: false, error: who.error });
    if (!who.admin && !/^owner$/i.test(String(who.role || ''))) return reply(403, headers, { ok: false, error: 'Only an owner or admin can see the CRM health (signed in as ' + (who.email || '?') + ', role ' + (who.role || '?') + ').' });
    if (event.httpMethod === 'POST') {
      let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
      if (b.act !== 'send') return reply(400, headers, { ok: false, error: 'Unknown request.' });
      const r = await H.send(); return reply(r.ok ? 200 : 502, headers, r);
    }
    if (event.httpMethod !== 'GET') return reply(405, headers, { ok: false, error: 'Method not allowed' });
    return reply(200, headers, Object.assign({ ok: true }, await H.report()));
  } catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong: ' + String(e && e.message || e).slice(0, 120) }); }
};
exports._test = { daily: daily, centralDay: centralDay };
