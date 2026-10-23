// netlify/functions/approval-escalate.js — patch AP4 (owner, 21 Oct 2026):
// "If Nick and Wesley do not approve by 24 hours, then it goes to the office to approve."
// Every 15 minutes (netlify.toml): an approval item waiting at the ADMIN step for 24 hours is escalated to the
// office (portal.js escalateDue: the office may approve it from then on; the admins still can). The admins and the
// office are told once (office to-do, CRM notice, phone push). PM-step items are never escalated.
// Netlify does not let anyone call a scheduled function by its URL in production; as a second lock any call that
// is not the scheduler must come from a signed-in admin.
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const portal = require('./portal.js');

const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
function hdr(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* the same staff check as every function, admins only */
async function isAdmin(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim());
  if (!m) return false;
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) return false;
    const u = await r.json();
    const email = String((u && u.email) || '').trim().toLowerCase();
    if (!email || !svc) return false;
    const s = await fetch(url + '/rest/v1/gc_staff?select=role,active&email=eq.' + encodeURIComponent(email), { headers: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(svc) ? { apikey: svc, Authorization: 'Bearer ' + svc } : { apikey: svc } });
    if (!s.ok) return false;
    const rows = await s.json();
    return !!(rows && rows[0] && rows[0].active !== false && String(rows[0].role || '').toLowerCase() === 'admin');
  } catch (e) { return false; }
}
function isScheduled(event){
  try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; }
}

exports.handler = async function (event) {
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (!isScheduled(event) && !(await isAdmin(event))) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  try {
    const out = await portal._core.escalateDue({});
    try { console.log('[approval-escalate]', JSON.stringify({ escalated: out.escalated || 0 })); } catch (e) {}
    return { statusCode: out.ok ? 200 : 502, headers, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Could not check the approvals: ' + (e && e.message || e) }) };
  }
};
