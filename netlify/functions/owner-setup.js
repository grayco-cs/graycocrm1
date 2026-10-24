/* GrayCo — 🔧 OWNER SETUP STATUS (patch OWNERTODO).
   The admins' To-Do lists the setup steps only the owner can do (Netlify keys, Google, Supabase SQL files, Twilio…).
   This answers, for an admin only, which of them the CRM can see are done. It returns yes / no / unknown per step and
   NEVER a value: no key, no token, no address leaves here.
   GET (admin) → { ok, checks: { <step id>: true | false | null }, at } */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const L = require('./bid-inbox.js')._lib;
function hdr(e, k){ const h = (e && e.headers) || {}; return String(h[k] || h[k.toLowerCase()] || ''); }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
}
function has(k){ return String(process.env[k] == null ? '' : process.env[k]).trim() !== ''; }
const D = { fetch: function(u, o){ return fetch(u, o); }, sb: function(p, o){ return L.sb(p, o); }, kvGet: function(k){ return L.kvGet(k); } };
/* which class the database gives a key: the SQL files each add one */
async function klass(key){
  try { const r = await D.sb('rpc/gc_kv_class', { method: 'POST', body: JSON.stringify({ k: key }) }); if (!r.ok) return null; const v = await r.json(); return typeof v === 'string' ? v : null; } catch (e) { return null; }
}
async function rpcExists(name){
  try { const r = await D.sb('rpc/' + name, { method: 'POST', body: '{}' }); if (r.status === 404) return false; return r.ok ? true : null; } catch (e) { return null; }
}
async function companyCam(){
  if (!has('COMPANYCAM_TOKEN') || !(has('SUPABASE_SERVICE_KEY') || has('SUPABASE_SERVICE_ROLE_KEY'))) return false;
  try { const r = await D.fetch('https://api.companycam.com/v2/company', { headers: { Authorization: 'Bearer ' + String(process.env.COMPANYCAM_TOKEN).trim(), Accept: 'application/json' } }); return r.status === 200 ? true : (r.status === 401 || r.status === 403 ? false : null); } catch (e) { return null; }
}
async function inbound(){
  if (!has('RESEND_INBOUND_SECRET')) return false;
  let v = null; try { v = await D.kvGet('gc_lead_inbox_alerts'); } catch (e) {}
  let t = ''; try { t = require('./_lib/health13.js').newest(v); } catch (e) {}
  return t ? (Date.now() - Date.parse(t) < 14 * 864e5) : null;   /* mail reached the CRM lately = the receiving domain is verified */
}
async function moneyMail(){ let v = null; try { v = await D.kvGet('gc_mail_money'); } catch (e) {} if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return Array.isArray(v) && v.length ? true : null; }
async function checks(){
  const c = {};
  const [pay, mail, tok, mkt, store, cc, inb, mm] = await Promise.all([klass('payrollStubs_2026'), klass('gc_mail_x'), klass('gcal_token_x'), rpcExists('gc_is_marketing'), rpcExists('gc_storage_usage'), companyCam(), inbound(), moneyMail()]);
  c.sql_payroll = pay == null ? null : pay === 'payroll';
  c.sql_emailall = mail == null ? null : mail === 'admin';
  c.sql_gtok = tok == null ? null : tok === 'server';
  c.sql_marketing = mkt;
  c.sql_storage = store;
  c.companycam = cc;
  c.resend_inbound = inb;
  c.money_mail = mm;
  c.twilio = has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && has('TWILIO_FROM');
  c.google_sa = has('GOOGLE_SA_EMAIL') && has('GOOGLE_SA_KEY');
  c.vapid = has('VAPID_PUBLIC_KEY') && has('VAPID_PRIVATE_KEY');
  c.anthropic = has('ANTHROPIC_API_KEY');
  return c;
}
exports.handler = async function(event){
  event = event || {};
  const headers = Object.assign(cors(event), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  const who = await require('./bid-inbox.js')._test.staffAuth(event);
  if (!who.ok) return { statusCode: who.code || 401, headers, body: JSON.stringify({ ok: false, error: who.error }) };
  if (!who.admin) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Only an owner or admin can see the setup list.' }) };
  try { return { statusCode: 200, headers, body: JSON.stringify({ ok: true, checks: await checks(), at: new Date().toISOString() }) }; }
  catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Could not check the setup (' + String(e && e.message || e).slice(0, 100) + ').' }) }; }
};
exports._test = { checks, D };
