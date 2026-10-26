// netlify/functions/paystubs.js — patch PAY: weekly pay stubs, saved for good; each employee reads only their own.
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
/* ── GrayCo staff check (security build) ──────────────────────────────────────
   A call from the CRM must carry the signed-in person's Supabase token:
       Authorization: Bearer <access token>
   The token is checked with Supabase (/auth/v1/user) and the email must be on
   the staff list: table gc_staff (read with the service key) once it exists —
   it is then the ONLY list, so removing someone there blocks them here at
   once — and the STAFF_EMAILS variable only before that table exists.
   No token / bad token → 401.  Signed in but not staff → 403.
   (Kept inline in every function on purpose: each function is bundled alone.) */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret) */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* CORS: only the CRM's own site may call from a browser (SITE_ORIGIN, comma list). */
function gcCors(event, methods, extraHeaders){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',')
    .map(function(s){ return s.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event, 'origin').replace(/\/$/, '');
  return {
    'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization' + (extraHeaders ? ', ' + extraHeaders : ''),
    'Access-Control-Allow-Methods': methods || 'POST, OPTIONS'
  };
}
async function gcStaffAuth(event){
  const m = /^Bearer\s+(\S+)$/i.exec(gcHeader(event, 'authorization').trim());
  if (!m) return { ok: false, statusCode: 401, error: 'Sign in to the GrayCo CRM first (no sign-in token was sent).' };
  const token = m[1];
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  let user = null;
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (r.ok) user = await r.json();
  } catch (e) {
    return { ok: false, statusCode: 503, error: 'Could not reach the sign-in service. Try again.' };
  }
  const email = String((user && user.email) || '').trim().toLowerCase();
  if (!email) return { ok: false, statusCode: 401, error: 'Your sign-in has expired. Sign in again.' };
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let role = null, listed = false, name = '';
  if (svc) {
    try {
      const r = await fetch(url + '/rest/v1/gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(email),
        { headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
      if (r.ok) {
        listed = true;
        const rows = await r.json();
        const row = Array.isArray(rows) && rows[0];
        if (row && row.active !== false) { role = String(row.role || 'staff').toLowerCase(); name = row.name || ''; }
      }
    } catch (e) {}
  }
  if (!listed) {
    const env = (process.env.STAFF_EMAILS || '').split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
    if (env.indexOf(email) > -1) role = 'staff';
  }
  if (!role) return { ok: false, statusCode: 403, error: 'This account (' + email + ') is not on the GrayCo staff list.' };
  return { ok: true, email: email, role: role, name: name, userId: user.id || '' };
}
/* ── end GrayCo staff check ────────────────────────────────────────────────── */

function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function svcHeaders(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
function parse(v){ if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } } return v; }
async function kvGet(key){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: svcHeaders() });
  if (!r.ok) throw new Error('gc_kv read answered ' + r.status);
  const rows = await r.json(); return rows && rows[0] ? parse(rows[0].value) : null;
}
async function kvPut(key, value){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST',
    headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error('gc_kv write answered ' + r.status);
}

/* ── patch PAY: weekly pay stubs ────────────────────────────────────────────────────────────────────────────────
   Every approved payroll run issues one pay stub per employee, saved for good in gc_kv "payrollStubs_<year>"
   (payroll class: admins + gc_staff.payroll people only — see docs/payroll-stubs.sql). Employees never read
   that key; they read THEIR OWN stubs through this function, which matches the signed-in e-mail.
     GET  ?year=2026[&emp=<name or e-mail>][&from=YYYY-MM-DD&to=YYYY-MM-DD]
          → { stubs:[…], all:true|false }   (all = the caller may see everyone's)
     POST { op:'issue',  stubs:[…] }        payroll/admin: save new stubs; an existing stub is never changed
     POST { op:'adjust', originalId, stub } payroll/admin: a correction — a NEW "Adjusted" stub that points at the original
     POST { op:'email',  id, year }         the stub's own employee, or payroll/admin: e-mail it to that employee
   A stub carries the last 4 of the SSN only; any longer number sent in is dropped. */
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function n2(v){ const x = parseFloat(v); return isFinite(x) ? x : 0; }
function r2(v){ return Math.round(n2(v) * 100) / 100; }
function keyFor(year){ return 'payrollStubs_' + String(year).replace(/[^0-9]/g, '').slice(0, 4); }
function stubId(st){ return ('PS_' + low(st.empKey || st.email || st.name) + '_' + s(st.periodFrom) + '_' + s(st.periodTo) + '_' + s(st.payDate)).replace(/[^a-z0-9_@.\-]/g, '_'); }

async function canPayroll(who){
  if (who.role === 'admin') return true;
  if (!svcKey()) return false;
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=payroll,active&email=eq.' + encodeURIComponent(who.email), { headers: svcHeaders() });
    if (!r.ok) return false;
    const rows = await r.json(); const row = Array.isArray(rows) && rows[0];
    return !!(row && row.active !== false && row.payroll === true);
  } catch (e) { return false; }
}

const LINE_KEYS = ['earnings', 'taxes', 'deductions'];
function cleanLines(list){
  return (Array.isArray(list) ? list : []).filter(Boolean).slice(0, 40).map(function(x){
    return { label: s(x.label).slice(0, 80) || 'Item', amount: r2(x.amount), hours: x.hours != null ? r2(x.hours) : undefined, rate: x.rate != null ? r2(x.rate) : undefined, pretax: x.pretax ? true : undefined };
  });
}
/* everything a stub may hold — anything else sent in is dropped (a full SSN can never ride along) */
function cleanStub(st, who){
  const ssn4 = s(st.ssn4).replace(/[^0-9]/g, '').slice(-4);
  const o = {
    empKey: s(st.empKey || st.email || st.name).slice(0, 120), name: s(st.name).slice(0, 120), email: low(st.email).slice(0, 160),
    ssn4: ssn4.length === 4 ? ssn4 : '',
    payType: s(st.payType).slice(0, 40), periodFrom: s(st.periodFrom).slice(0, 10), periodTo: s(st.periodTo).slice(0, 10),
    payDate: s(st.payDate).slice(0, 10), checkNo: s(st.checkNo).slice(0, 30), runId: s(st.runId).slice(0, 80),
    hours: r2(st.hours), otHours: r2(st.otHours), rate: r2(st.rate), filing: s(st.filing).slice(0, 12),
    earnings: cleanLines(st.earnings), taxes: cleanLines(st.taxes), deductions: cleanLines(st.deductions),
    gross: r2(st.gross), net: r2(st.net), reimbursement: r2(st.reimbursement), dedShort: r2(st.dedShort),
    withholdState: s(st.withholdState).toUpperCase().slice(0, 2), stateTaxVerified: st.stateTaxVerified === true,   /* patch PAY2 */
    company: { name: s(st.company && st.company.name).slice(0, 120), address: s(st.company && st.company.address).slice(0, 200),
               phone: s(st.company && st.company.phone).slice(0, 40), ein: s(st.company && st.company.ein).slice(0, 20) },
    issuedAt: new Date().toISOString(), issuedBy: who.email
  };
  return o;
}
/* YTD for each line = this stub + every earlier stub of the same person in the year (adjusted stubs replace their original) */
function withYtd(stub, all){
  const mine = all.filter(function(x){ return x.empKey === stub.empKey && x.id !== stub.id && s(x.payDate) <= s(stub.payDate) && !(x.payDate === stub.payDate && s(x.issuedAt) > s(stub.issuedAt)); });
  const replaced = {}; mine.forEach(function(x){ if (x.adjusts) replaced[x.adjusts] = true; });
  if (stub.adjusts) replaced[stub.adjusts] = true;
  const live = mine.filter(function(x){ return !replaced[x.id]; });
  const ytd = { gross: r2(stub.gross), net: r2(stub.net) };
  live.forEach(function(x){ ytd.gross = r2(ytd.gross + n2(x.gross)); ytd.net = r2(ytd.net + n2(x.net)); });
  LINE_KEYS.forEach(function(k){
    stub[k] = stub[k].map(function(L){
      let y = n2(L.amount);
      live.forEach(function(x){ (x[k] || []).forEach(function(M){ if (M.label === L.label) y += n2(M.amount); }); });
      return Object.assign({}, L, { ytd: r2(y) });
    });
  });
  stub.ytd = ytd;
  return stub;
}

async function readYear(year){ const v = await kvGet(keyFor(year)); return Array.isArray(v) ? v : []; }

/* patch PAYSSN: the SSN last 4 lives on the employee record (users_private, { <user id>: { ssn4 } }), which the person
   issuing payroll (the office) may not be allowed to read. A stub sent without it gets it filled here — last 4 only. */
function last4(v){ const d = s(v).replace(/[^0-9]/g, ''); return d.length >= 4 ? d.slice(-4) : ''; }
async function fillSsn4(stubs){
  if (!stubs.some(function(x){ return !x.ssn4; })) return;
  let users = [], priv = {};
  try { const u = await kvGet('users'); if (Array.isArray(u)) users = u; } catch (e) {}
  try { const p = await kvGet('users_private'); if (p && typeof p === 'object' && !Array.isArray(p)) priv = p; } catch (e) {}
  stubs.forEach(function(st){
    if (st.ssn4) return;
    const k = low(st.empKey), em = low(st.email), nm = low(st.name);
    const u = users.find(function(x){ return x && (low(x.id) === k || (em && low(x.email) === em) || (nm && low(x.name) === nm)); });
    const rec = (u && priv[u.id]) || priv[st.empKey] || null;
    const v = last4(rec && (rec.ssn4 || rec.ssnLast4)) || last4(u && u.ssn4);
    if (v) st.ssn4 = v;
  });
}

function stubHtml(st){
  const m = function(v){ return '$' + n2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const e = function(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  const rows = function(list, neg){ return (list || []).map(function(L){ return '<tr><td style="padding:4px 8px">' + e(L.label) + '</td><td style="padding:4px 8px;text-align:right">' + (neg ? '-' : '') + m(L.amount) + '</td><td style="padding:4px 8px;text-align:right;color:#666">' + m(L.ytd) + '</td></tr>'; }).join(''); };
  return '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">'
    + '<div style="text-align:center;border-bottom:3px solid #0f2440;padding-bottom:8px;margin-bottom:12px"><b style="font-size:18px">' + e(st.company.name || 'GrayCo Construction Services') + '</b><br>'
    + '<span style="font-size:12px;color:#555">' + e(st.company.address) + (st.company.phone ? ' · ' + e(st.company.phone) : '') + '</span></div>'
    + '<p><b>Pay stub — ' + e(st.name) + '</b>' + ' · SSN ' + (st.ssn4 ? '***-**-' + e(st.ssn4) : '—') + '<br>Pay period ' + e(st.periodFrom) + ' → ' + e(st.periodTo) + ' · Paid ' + e(st.payDate) + (st.checkNo ? ' · Check #' + e(st.checkNo) : '') + (st.adjusts ? '<br><b>ADJUSTED</b> — replaces stub ' + e(st.adjusts) : '') + '</p>'
    + (st.withholdState === 'MS' && !st.stateTaxVerified ? '<p style="background:#fef3c7;padding:8px;border-radius:6px"><b>Mississippi withholding rates not yet verified by our CPA.</b></p>' : '')
    + '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr><th style="text-align:left">Earnings</th><th style="text-align:right">This check</th><th style="text-align:right">YTD</th></tr>' + rows(st.earnings)
    + '<tr><th style="text-align:left">Taxes</th><th></th><th></th></tr>' + rows(st.taxes, true)
    + ((st.deductions || []).length ? '<tr><th style="text-align:left">Deductions</th><th></th><th></th></tr>' + rows(st.deductions, true) : '')
    + '</table><p style="font-size:16px"><b>Net pay ' + m(st.net) + '</b> (YTD ' + m(st.ytd && st.ytd.net) + ')</p></div>';
}

exports.handler = async function(event){
  const headers = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  const J = function(code, body){ return { statusCode: code, headers, body: JSON.stringify(body) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const who = await gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode, { error: who.error });
  if (!svcKey()) return J(500, { error: 'SUPABASE_SERVICE_KEY is not set on Netlify.' });
  const all = await canPayroll(who);

  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    const year = s(q.year) || String(new Date().getFullYear());
    let list; try { list = await readYear(year); } catch (e) { return J(502, { error: 'Could not read pay stubs: ' + String(e && e.message || e) }); }
    if (!all) list = list.filter(function(x){ return low(x.email) && low(x.email) === who.email; });
    else if (q.emp) { const k = low(q.emp); list = list.filter(function(x){ return low(x.email) === k || low(x.name) === k || low(x.empKey) === k; }); }
    if (q.from) list = list.filter(function(x){ return s(x.payDate) >= s(q.from); });
    if (q.to) list = list.filter(function(x){ return s(x.payDate) <= s(q.to); });
    list.sort(function(a, b){ return s(b.payDate).localeCompare(s(a.payDate)) || s(b.issuedAt).localeCompare(s(a.issuedAt)); });
    return J(200, { stubs: list, all: all, year: year });
  }
  if (event.httpMethod !== 'POST') return J(405, { error: 'Method not allowed' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'Invalid JSON' }); }
  const op = s(body.op);

  if (op === 'issue' || op === 'adjust') {
    if (!all) return J(403, { error: 'Only payroll (or an admin) can issue pay stubs.' });
    const incoming = op === 'issue' ? (Array.isArray(body.stubs) ? body.stubs : []) : [body.stub];
    if (!incoming.length || incoming.length > 200) return J(400, { error: 'Send 1–200 stubs.' });
    const byYear = {};
    incoming.forEach(function(raw){ if (raw && s(raw.payDate)) (byYear[s(raw.payDate).slice(0, 4)] = byYear[s(raw.payDate).slice(0, 4)] || []).push(raw); });
    const result = { issued: [], skipped: [] };
    try {
      for (const y of Object.keys(byYear)) {
        const list = await readYear(y), have = {};
        list.forEach(function(x){ have[x.id] = x; });
        for (const raw of byYear[y]) {
          const st = cleanStub(raw, who);
          if (!st.empKey || !st.periodFrom || !st.periodTo || !st.payDate) { result.skipped.push({ name: st.name, why: 'missing person or period' }); continue; }
          if (op === 'adjust') {
            const orig = have[s(body.originalId)];
            if (!orig) return J(404, { error: 'The stub to adjust was not found.' });
            let n = 1; while (have[orig.id + '-ADJ' + n]) n++;
            st.id = orig.id + '-ADJ' + n; st.adjusts = orig.id; st.kind = 'adjusted'; st.note = s(body.note).slice(0, 300);
          } else {
            st.id = stubId(st); st.kind = 'issued';
            if (have[st.id]) { result.skipped.push({ id: st.id, why: 'already issued (stubs never change — use Adjust)' }); continue; }
          }
          await fillSsn4([st]);   /* patch PAYSSN */
          withYtd(st, list);
          list.push(st); have[st.id] = st; result.issued.push(st.id);
        }
        if (result.issued.length) await kvPut(keyFor(y), list);
      }
    } catch (e) { return J(502, { error: 'Could not save pay stubs: ' + String(e && e.message || e) }); }
    return J(200, Object.assign({ ok: true }, result));
  }

  if (op === 'email') {
    const year = s(body.year) || s(body.id).replace(/.*_(\d{4})-\d\d-\d\d$/, '$1');
    let list; try { list = await readYear(year); } catch (e) { return J(502, { error: 'Could not read pay stubs.' }); }
    const st = list.find(function(x){ return x.id === s(body.id); });
    if (!st) return J(404, { error: 'Stub not found.' });
    if (!all && low(st.email) !== who.email) return J(403, { error: 'That is not your pay stub.' });
    if (!st.email) return J(400, { error: 'No e-mail on file for this employee.' });
    const key = process.env.RESEND_API_KEY;
    if (!key) return J(500, { error: 'E-mail is not set up (RESEND_API_KEY).' });
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo Payroll <noreply@grayco-cs.com>', to: [st.email], subject: 'Your pay stub — ' + st.payDate, html: require('./_lib/brand.js').shell(stubHtml(st), { sender: false, legal: false }) }) });   /* patch LOGO: the logo header */
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) return J(502, { error: 'E-mail did not send (' + r.status + ').' });
    return J(200, { ok: true, paused: !!j.paused });
  }
  return J(400, { error: 'Unknown op' });
};
exports._t = { cleanStub, withYtd, stubId, keyFor, stubHtml };
