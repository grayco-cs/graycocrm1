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

/* patch AUTOFIX-GATE: the portal-gate scan reads the whole CRM (projects, every estimate with its lines — megabytes —,
   documents, invoices, leads …) and ran every 15 minutes = 96 full reads a day, nearly always finding nothing new. Now a
   tiny read of the "last changed" times of those keys comes first; nothing changed since the last full scan → no scan.
   A full scan still runs at least every 2 hours (so nothing can be missed for long), and after any scan that failed. */
const GATE_SIG_KEYS = ['projects', 'invs', 'invoices', 'cos', 'changeOrders', 'estimates', 'projectDocs', 'users', 'customers', 'leads', 'punch',
  'projectPayments', 'gc_deleted_projects', 'gc_claims', 'jobAutoDefaults', 'gc_portal_auto_posts', 'gc_senior_pm', 'gc_team_settings', 'gc_portal_gate'];
const GATE_FULL_MS = 2 * 3600e3, GATE_STATE = 'gc_gate_scan_sig';
const GD = { now: function(){ return Date.now(); }, lib: function(){ return require('./bid-inbox.js')._lib; } };   /* tests swap these */
async function gateSig(){
  const C = portal._core, want = [];
  GATE_SIG_KEYS.forEach(function(k){ want.push(k, k + '__manifest'); });
  const r = await fetch(C.sbUrl() + '/rest/v1/gc_kv?select=key,updated_at&key=in.(' + want.map(function(k){ return '"' + k + '"'; }).join(',') + ')', { headers: C.keyHeaders(C.svcKey()) });
  if (!r || !r.ok) return '';
  const rows = await r.json();
  if (!Array.isArray(rows)) return '';
  return rows.map(function(x){ return String(x && x.key) + '=' + String(x && x.updated_at); }).sort().join('|');
}
async function gateScanIfChanged(){
  const L = GD.lib(), now = GD.now();
  let sig = ''; try { sig = await gateSig(); } catch (e) { sig = ''; }
  let last = null; try { last = await L.kvGet(GATE_STATE); } catch (e) { last = null; }
  if (sig && last && last.sig === sig && last.ok && now - Date.parse(last.at || 0) < GATE_FULL_MS) return { ok: true, unchanged: true, since: last.at };
  const out = await portal._core.gateScan({});
  try { await L.kvPut(GATE_STATE, { sig: sig, at: new Date(now).toISOString(), ok: !!(out && out.ok), queued: (out && out.queued) || 0 }); } catch (e) {}
  return out;
}
exports._gate = { gateScanIfChanged: gateScanIfChanged, gateSig: gateSig, GD: GD, GATE_SIG_KEYS: GATE_SIG_KEYS };

exports.handler = async function (event) {
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (!isScheduled(event) && !(await isAdmin(event))) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  try {
    const out = await portal._core.escalateDue({});
    try { out.portalGate = await gateScanIfChanged(); } catch (e) { out.portalGate = { ok: false, error: String(e && e.message || e).slice(0, 120) }; }   /* patch PORTALGATE: new portal things → ✅ Approvals (patch AUTOFIX-GATE: only when something changed) */
    try { out.textLeads = await require('./_lib/textlead.js').syncConverted(); } catch (e) { out.textLeads = { error: String(e && e.message || e).slice(0, 120) }; }   /* patch TEXTLEAD: a texted lead that became a job → its conversation + notes on the job */
    try { console.log('[approval-escalate]', JSON.stringify({ escalated: out.escalated || 0 })); } catch (e) {}
    return { statusCode: out.ok ? 200 : 502, headers, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Could not check the approvals: ' + (e && e.message || e) }) };
  }
};
