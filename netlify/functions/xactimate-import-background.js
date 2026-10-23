/* ── GrayCo staff check (security build) ──────────────────────────────────────
   A call from the CRM must carry the signed-in person's Supabase token:
       Authorization: Bearer <access token>
   The token is checked with Supabase (/auth/v1/user) and the email must be on
   the staff list: table gc_staff (read with the service key) once it exists —
   it is then the ONLY list, so removing someone there blocks them here at
   once — and the STAFF_EMAILS variable only before that table exists.
   No token / bad token → 401.  Signed in but not staff → 403.
   (Kept inline in every function on purpose: each function is bundled alone.) */
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
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

// netlify/functions/xactimate-import-background.js
// GrayCo — READ AN XACTIMATE ESTIMATE PDF WITH CLAUDE (patch BB, Insurance restoration).
//
// A Netlify BACKGROUND function (the "-background" name: it answers 202 at once and may run up to
// 15 minutes — reading a 40-page estimate takes Claude about a minute). Signed-in GrayCo staff only.
//
//   POST { jobId, ref: "sb:crm-files/<sha256>.pdf", name, claimId }   (or pdf: <base64> for a tiny file)
//   → the PDF is read from the private bucket with the service key, sent to Claude as a document
//     (model claude-sonnet-5-5, ANTHROPIC_API_KEY, JSON-schema structured output, streamed), and the
//     result is written to gc_kv "gc_xact_imports": { [jobId]: { status: 'done', estimate } |
//     { status: 'error', error } }. The CRM reads it there and keeps it as a new estimate version.
//
// Env: ANTHROPIC_API_KEY (already set for claude-proxy), SUPABASE_URL, SUPABASE_SERVICE_KEY.
// Optional: XACT_MODEL (default claude-sonnet-5-5), XACT_NO_FALLBACK=1 (turn the refusal fallback off).

const API = 'https://api.anthropic.com/v1/messages';
const MODEL_DEFAULT = 'claude-sonnet-5-5';
function s(v){ return v == null ? '' : String(v).trim(); }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function SH(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }

const NUM = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const STR = { type: 'string' };
function obj(props){ return { type: 'object', additionalProperties: false, properties: props, required: Object.keys(props) }; }
const SCHEMA = obj({
  header: obj({ estimate_name: STR, carrier: STR, claim_number: STR, policy_number: STR, insured: STR, date_of_loss: STR, type_of_loss: STR, price_list: STR, deductible: NUM, estimator: STR, company: STR, loss_address: STR, adjuster_name: STR, adjuster_email: STR, adjuster_phone: STR }),
  line_items: { type: 'array', items: obj({ line_number: STR, room: STR, category: STR, selector: STR, description: STR, quantity: NUM, unit: STR, unit_price: NUM, tax: NUM, o_and_p: NUM, rcv: NUM, depreciation: NUM, non_recoverable: { type: 'boolean' }, acv: NUM }) },
  totals: obj({ line_item_total: NUM, material_sales_tax: NUM, overhead: NUM, profit: NUM, o_and_p: NUM, rcv: NUM, recoverable_depreciation: NUM, non_recoverable_depreciation: NUM, depreciation: NUM, acv: NUM, deductible: NUM, net_claim: NUM }),
  notes: { type: 'array', items: STR }
});
const PROMPT = [
  'This PDF is an Xactimate insurance estimate (US property claim). Read it into the JSON schema exactly as printed.',
  '',
  'Line items: every priced line, in order, with the room/area heading it sits under (e.g. "Kitchen", "Roof", "Exterior"). Copy the line number, category and selector codes when printed (e.g. "DRY", "1/2"), the description, quantity and unit (SF, LF, SQ, EA, HR …), unit price, tax, O&P, RCV, depreciation and ACV for that line. If a column is not printed use null — never compute or guess. Depreciation shown in angle brackets <> or marked non-recoverable: set non_recoverable true.',
  'Totals: from the summary / recap page — Line Item Total, Material Sales Tax, Overhead, Profit (or one combined O&P), Replacement Cost Value, Less Recoverable Depreciation, Less Non-recoverable Depreciation, total depreciation, Actual Cash Value, Less Deductible, Net Claim. If the estimate has several coverages, use the summary that covers the whole estimate. Numbers only (no $ or commas); null for anything not printed.',
  'Header: estimate name, insurance carrier, claim #, policy #, insured, date of loss (YYYY-MM-DD), type of loss, price list, deductible, the estimator (the person who wrote it, as printed), the company the estimate is written by (the letterhead / "Estimate by" company, which may be the insurance carrier or a contractor), the loss / property address, and the adjuster name, e-mail and phone when printed. Empty string when not printed.',
  'notes: anything that made reading uncertain (unreadable pages, totals that do not match, cut-off tables). Empty list when none.'
].join('\n');

async function pdfBase64(body){
  if (s(body.pdf)) return s(body.pdf);
  const m = /^sb:crm-files\/([0-9a-f]{64}\.pdf)$/.exec(s(body.ref));
  if (!m) throw new Error('No PDF reference was sent.');
  if (!svcKey()) throw new Error('SUPABASE_SERVICE_KEY is not set on Netlify.');
  let r = null;
  for (let i = 0; i < 6; i++) {   /* the CRM uploads in the background: give it up to ~30 s to land */
    r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + m[1], { headers: SH() });
    if (r.ok || r.status !== 404 && r.status !== 400) break;
    await new Promise(function(res){ setTimeout(res, Number(process.env.XACT_WAIT_MS || 5000)); });
  }
  if (!r.ok) throw new Error('The PDF could not be read from the job files (HTTP ' + r.status + ').');
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length > 30 * 1024 * 1024) throw new Error('The PDF is over 30 MB.');
  return b.toString('base64');
}
function request(b64){
  const req = { model: s(process.env.XACT_MODEL) || MODEL_DEFAULT, max_tokens: 64000, stream: true,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }, { type: 'text', text: PROMPT }] }] };
  const headers = { 'Content-Type': 'application/json', 'x-api-key': s(process.env.ANTHROPIC_API_KEY), 'anthropic-version': '2023-06-01' };
  if (process.env.XACT_NO_FALLBACK !== '1') { req.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
  return { body: req, headers: headers };
}
/* the streamed answer (server-sent events) → the JSON text and why it stopped */
async function readStream(resp){
  const text = await resp.text();
  let out = '', stop = '', err = '';
  text.split(/\r?\n/).forEach(function(line){
    if (!/^data:/.test(line)) return;
    let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch (e) { return; }
    if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') out += ev.delta.text;
    else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason;
    else if (ev.type === 'error') err = s(ev.error && ev.error.message) || 'stream error';
  });
  return { text: out, stop: stop, error: err };
}
function nn(v){ return v === null || v === undefined || v === '' ? undefined : Number(v); }
/* Claude's JSON → the CRM's estimate shape (the CRM normalizes and checks it again) */
function toEstimate(j){
  const H = j.header || {}, T = j.totals || {};
  const lines = (Array.isArray(j.line_items) ? j.line_items : []).map(function(x, i){
    const o = { line: s(x.line_number) || String(i + 1), room: s(x.room) || 'General', cat: s(x.category), sel: s(x.selector), desc: s(x.description), unit: s(x.unit),
      qty: nn(x.quantity), unitPrice: nn(x.unit_price), tax: nn(x.tax), op: nn(x.o_and_p), rcv: nn(x.rcv), dep: nn(x.depreciation), acv: nn(x.acv), recoverable: x.non_recoverable !== true };
    Object.keys(o).forEach(function(k){ if (o[k] === undefined) delete o[k]; });
    return o;
  }).filter(function(l){ return l.desc; });
  const totals = { lineItems: nn(T.line_item_total), tax: nn(T.material_sales_tax), overhead: nn(T.overhead), profit: nn(T.profit), rcv: nn(T.rcv), recDep: nn(T.recoverable_depreciation), nonRecDep: nn(T.non_recoverable_depreciation), acv: nn(T.acv), deductible: nn(T.deductible), net: nn(T.net_claim) };
  const op = nn(T.o_and_p); if (op !== undefined) totals.op = op; else if (totals.overhead !== undefined || totals.profit !== undefined) totals.op = (totals.overhead || 0) + (totals.profit || 0);
  const dep = nn(T.depreciation); if (dep !== undefined) totals.dep = dep; else if (totals.recDep !== undefined || totals.nonRecDep !== undefined) totals.dep = (totals.recDep || 0) + (totals.nonRecDep || 0);
  if (totals.recDep === undefined && totals.dep !== undefined && totals.nonRecDep !== undefined) totals.recDep = totals.dep - totals.nonRecDep;
  if (totals.nonRecDep === undefined && totals.recDep !== undefined && totals.dep !== undefined) totals.nonRecDep = totals.dep - totals.recDep;
  Object.keys(totals).forEach(function(k){ if (totals[k] === undefined || !isFinite(totals[k])) delete totals[k]; });
  return { source: 'pdf', header: { estimateName: s(H.estimate_name), carrier: s(H.carrier), claimNumber: s(H.claim_number), policyNumber: s(H.policy_number), insured: s(H.insured), dateOfLoss: s(H.date_of_loss), typeOfLoss: s(H.type_of_loss), priceList: s(H.price_list), deductible: nn(H.deductible) || 0, estimator: s(H.estimator), company: s(H.company), lossAddress: s(H.loss_address), adjusterName: s(H.adjuster_name), adjusterEmail: s(H.adjuster_email), adjusterPhone: s(H.adjuster_phone) },
    lines: lines, totals: totals, warnings: (Array.isArray(j.notes) ? j.notes : []).map(s).filter(Boolean).slice(0, 12) };
}
async function extract(b64){
  if (!s(process.env.ANTHROPIC_API_KEY)) throw new Error('ANTHROPIC_API_KEY is not set on Netlify.');
  const rq = request(b64);
  const resp = await fetch(API, { method: 'POST', headers: rq.headers, body: JSON.stringify(rq.body) });
  if (!resp.ok) { let m = ''; try { const j = await resp.json(); m = s(j && j.error && j.error.message); } catch (e) {} throw new Error('Claude: ' + (m || 'HTTP ' + resp.status)); }
  const st = await readStream(resp);
  if (st.error) throw new Error('Claude: ' + st.error);
  if (st.stop === 'refusal') throw new Error('Claude declined to read this file.');
  if (st.stop === 'max_tokens') throw new Error('The estimate is too long to read in one pass — split the PDF (e.g. by coverage) and import each part.');
  let j; try { j = JSON.parse(st.text); } catch (e) { throw new Error('Claude’s answer was not readable JSON.'); }
  return toEstimate(j);
}
async function saveResult(jobId, rec){
  if (!svcKey()) return;
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.gc_xact_imports', { headers: SH() });
  let m = {}; try { const rows = await r.json(); const v = rows && rows[0] && rows[0].value; if (v && typeof v === 'object' && !Array.isArray(v)) m = v; } catch (e) {}
  m[jobId] = Object.assign({ at: new Date().toISOString() }, rec);
  const keys = Object.keys(m).sort(function(a, b){ return s(m[a].at) < s(m[b].at) ? 1 : -1; });
  keys.slice(10).forEach(function(k){ delete m[k]; });
  await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: SH({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: 'gc_xact_imports', value: m, updated_at: new Date().toISOString() }) });
}

exports.handler = async function(event){
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  const who = await gcStaffAuth(event);
  if (!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ error: who.error }) };
  let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const jobId = s(body.jobId);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(jobId)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad jobId' }) };
  await saveResult(jobId, { status: 'running', by: who.email, name: s(body.name).slice(0, 200) });
  try {
    const est = await extract(await pdfBase64(body));
    await saveResult(jobId, { status: 'done', by: who.email, name: s(body.name).slice(0, 200), estimate: est });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, lines: est.lines.length }) };
  } catch (e) {
    await saveResult(jobId, { status: 'error', by: who.email, error: s(e && e.message || e) });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: s(e && e.message || e) }) };
  }
};
exports._core = { SCHEMA: SCHEMA, PROMPT: PROMPT, request: request, readStream: readStream, toEstimate: toEstimate, extract: extract };
