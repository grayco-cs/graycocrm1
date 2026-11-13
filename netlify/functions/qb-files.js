/* ── GrayCo staff check (security build) ──────────────────────────────────────
   A call from the CRM must carry the signed-in person's Supabase token:
       Authorization: Bearer <access token>
   The token is checked with Supabase (/auth/v1/user) and the email must be on
   the staff list: table gc_staff (read with the service key) once it exists —
   it is then the ONLY list, so removing someone there blocks them here at
   once — and the STAFF_EMAILS variable only before that table exists.
   No token / bad token → 401.  Signed in but not staff → 403.
   (Kept inline in every function on purpose: each function is bundled alone.) */
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first (this file only reads QuickBooks) */
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

/* qb-files.js — patch QBCSV (owner 11/13: "the PDFs are in QuickBooks, so can it read PDFs from QuickBooks?").
   READ-ONLY QuickBooks Online helper for the 💎 Import QuickBooks CSV and 🔗 Match QuickBooks records to jobs screens.
   Admins and the office only (gc_staff + the office rule). Every call to QuickBooks is a GET — this file has no
   other way to reach QuickBooks (qbGet below), so it can never create, change or delete anything there.
   The QuickBooks sign-in is the one the CRM already uses (qb-proxy / qb-callback): the browser holds the tokens and
   sends them as x-qb-token / x-qb-realm / x-qb-sandbox (the same headers qb-proxy takes). Nothing is stored here.

   POST { op: 'status' }                       → { ok, connected, company } · { ok:false, notConnected:true, reason }
   POST { op: 'lookup', items: [ {             (at most 8 a call; the CRM paces the calls)
          key, kind ('invoice'|'bill'|'expense'|'check'|'payment'|'deposit'|'salesreceipt'|'creditmemo'|'vendorcredit'|…),
          id?, num?, date?, amount?, name?,    (no id → found by DocNumber (+ date + amount), or by date + amount + name)
          files?: true,                         download the attachments into crm-files (sb:crm-files/<sha256>.<ext>)
          text?: true } ] }                     + the text of attached PDFs (for matching a job by its address / PO)
     → { ok, results: [ { key, ok, entity, id, docNumber, date, total, party, memo, lines:[{desc, customer, cls, amount}],
                          files:[{ ref, name, type, size, hash, qbAttachId }], text, error } ] }
   A QuickBooks 401 → { ok:false, notConnected:true, reason:'expired' } (the CRM shows its Connect button). */
const crypto = require('crypto');
const QB_PROD_BASE = 'https://quickbooks.api.intuit.com';
const QB_SAND_BASE = 'https://sandbox-quickbooks.api.intuit.com';
const MAX_ITEMS = 8, MAX_FILES = 5, MAX_BYTES = 15 * 1048576, PACE_MS = 120;
const ENTITY = { invoice: 'Invoice', salesreceipt: 'SalesReceipt', payment: 'Payment', deposit: 'Deposit', creditmemo: 'CreditMemo', refund: 'RefundReceipt',
  bill: 'Bill', billpayment: 'BillPayment', expense: 'Purchase', check: 'Purchase', vendorcredit: 'VendorCredit', journal: 'JournalEntry', estimate: 'Estimate', purchaseorder: 'PurchaseOrder' };
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'image/tiff': 'tif',
  'text/csv': 'csv', 'text/plain': 'txt', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' };
const TYPE = {}; Object.keys(EXT).forEach(function(t){ if (!TYPE[EXT[t]]) TYPE[EXT[t]] = t; }); TYPE.jpeg = 'image/jpeg'; TYPE.tiff = 'image/tiff';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function nk(v){ return low(v).replace(/[^a-z0-9]+/g, ' ').trim(); }
function cents(v){ return Math.round(Math.abs(Number(v) || 0) * 100); }
function q(v){ return s(v).replace(/\\/g, '').replace(/'/g, "\\'"); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svc(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }

/* the ONLY door to QuickBooks: GET, never anything else */
function qbClient(tok){
  const base = tok.sandbox ? QB_SAND_BASE : QB_PROD_BASE;
  let calls = 0;
  async function qbGet(path){
    if (calls++) await sleep(PACE_MS);
    const r = await fetch(base + '/v3/company/' + encodeURIComponent(tok.realm) + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'minorversion=65',
      { method: 'GET', headers: { Authorization: 'Bearer ' + tok.token, Accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('QuickBooks sign-in expired'), { notConnected: true, status: r.status });
    if (r.status === 429) throw Object.assign(new Error('QuickBooks is busy (too many requests) — try again in a minute'), { busy: true, status: 429 });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { const f = j && j.Fault && j.Fault.Error && j.Fault.Error[0]; throw Object.assign(new Error('QuickBooks answered ' + r.status + (f ? ': ' + s(f.Message) : '')), { status: r.status }); }
    return j || {};
  }
  function query(sql){ return qbGet('/query?query=' + encodeURIComponent(sql)).then(function(j){ return (j && j.QueryResponse) || {}; }); }
  return { qbGet, query };
}

function lineInfo(l){
  const d = l || {}, det = d.AccountBasedExpenseLineDetail || d.ItemBasedExpenseLineDetail || d.SalesItemLineDetail || d.DepositLineDetail || d.JournalEntryLineDetail || {};
  const cust = det.CustomerRef || det.Entity && det.Entity.EntityRef || {};
  return { desc: s(d.Description), customer: s(cust.name), cls: s((det.ClassRef || {}).name), account: s((det.AccountRef || {}).name), amount: Number(d.Amount) || 0 };
}
function txnInfo(entity, t){
  const party = t.VendorRef || t.CustomerRef || t.EntityRef || {};
  const lines = (Array.isArray(t.Line) ? t.Line : []).filter(function(l){ return l && l.DetailType !== 'SubTotalLineDetail'; }).map(lineInfo).filter(function(l){ return l.desc || l.customer || l.amount; });
  return { entity: entity, id: s(t.Id), docNumber: s(t.DocNumber), date: s(t.TxnDate), total: Number(t.TotalAmt) || 0, party: s(party.name),
    memo: s(t.PrivateNote) || s(t.CustomerMemo && t.CustomerMemo.value) || s(t.Memo), cls: s((t.ClassRef || {}).name), dept: s((t.DepartmentRef || {}).name), lines: lines };
}
/* the QuickBooks transaction a CSV row / CRM record is: by Id, else DocNumber (+ amount, date, name), else date + amount (+ name) */
async function findTxn(Q, it){
  const entity = ENTITY[low(it.kind)] || s(it.entity);
  if (!/^[A-Za-z]+$/.test(entity)) return { error: 'QuickBooks has no place to look up a "' + s(it.kind) + '"' };
  let list = [];
  if (s(it.id)) { const r = await Q.qbGet('/' + entity.toLowerCase() + '/' + encodeURIComponent(s(it.id))); const t = r && r[entity]; if (t) list = [t]; }
  else if (s(it.num)) list = (await Q.query("select * from " + entity + " where DocNumber = '" + q(it.num) + "'"))[entity] || [];
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s(it.date))) list = (await Q.query("select * from " + entity + " where TxnDate = '" + s(it.date) + "'"))[entity] || [];
  else return { error: 'no QuickBooks number or date to look it up by' };
  const want = it.amount != null && it.amount !== '' ? cents(it.amount) : null, nm = nk(it.name).split(' ')[0];
  let hit = list;
  if (hit.length > 1 && want != null) { const a = hit.filter(function(t){ return cents(t.TotalAmt) === want; }); if (a.length) hit = a; }
  if (hit.length > 1 && s(it.date)) { const b = hit.filter(function(t){ return s(t.TxnDate) === s(it.date); }); if (b.length) hit = b; }
  if (hit.length > 1 && nm) { const c = hit.filter(function(t){ const p = t.VendorRef || t.CustomerRef || t.EntityRef || {}; return nk(p.name).split(' ')[0] === nm; }); if (c.length) hit = c; }
  if (!s(it.num) && !s(it.id) && want != null) hit = hit.filter(function(t){ return cents(t.TotalAmt) === want; });
  if (hit.length !== 1) return { error: hit.length ? hit.length + ' QuickBooks ' + entity + 's fit — not sure which' : 'not found in QuickBooks' };
  return txnInfo(entity, hit[0]);
}

/* a PDF's text layer — the CRM's own reader (the e-mailed sub invoice reader) */
function pdfText(buf){ try { return require('./_lib/subinv.js').pdfText(buf); } catch (e) { return ''; } }
async function store(buf, ext){
  const name = crypto.createHash('sha256').update(buf).digest('hex') + '.' + ext;
  const k = svc(); if (!k) throw new Error('file storage is not set up (no service key)');
  const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + name, { method: 'POST', headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': TYPE[ext] || 'application/octet-stream', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' }, body: buf });
  if (r.ok || r.status === 409) return name;
  let t = ''; try { t = await r.text(); } catch (e) {}
  if (r.status === 400 && /exist|duplicate|409/i.test(t)) return name;
  throw new Error('file storage answered ' + r.status);
}
async function attachments(Q, info, wantText){
  const sql = "select * from Attachable where AttachableRef.EntityRef.Type = '" + info.entity + "' and AttachableRef.EntityRef.Value = '" + q(info.id) + "'";
  const atts = ((await Q.query(sql)).Attachable || []).filter(function(a){ return a && s(a.TempDownloadUri) && s(a.FileName); }).slice(0, MAX_FILES);
  const files = [], texts = [];
  for (const a of atts) {
    const nameExt = (/\.([a-z0-9]{1,5})$/i.exec(s(a.FileName)) || [])[1];
    let ext = EXT[low(a.ContentType)] || low(nameExt); if (ext === 'jpeg') ext = 'jpg'; if (ext === 'tiff') ext = 'tif';
    if (!TYPE[ext]) { files.push({ name: s(a.FileName), skipped: 'this kind of file is not kept' }); continue; }
    if (Number(a.Size) > MAX_BYTES) { files.push({ name: s(a.FileName), skipped: 'bigger than 15 MB' }); continue; }
    const r = await fetch(s(a.TempDownloadUri), { method: 'GET' });   /* a signed download link: no QuickBooks token sent */
    if (!r.ok) { files.push({ name: s(a.FileName), skipped: 'download answered ' + r.status }); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) { files.push({ name: s(a.FileName), skipped: 'bigger than 15 MB' }); continue; }
    const fn = await store(buf, ext), hash = fn.split('.')[0];
    files.push({ ref: 'sb:crm-files/' + fn, name: s(a.FileName), type: TYPE[ext], size: buf.length, hash: hash, qbAttachId: s(a.Id) });
    if (wantText && ext === 'pdf') { const t = pdfText(buf); if (t) texts.push(t.slice(0, 20000)); }
  }
  return { files: files, text: texts.join('\n').slice(0, 40000) };
}

const J = function(headers, code, body){ return { statusCode: code, headers: headers, body: JSON.stringify(body) }; };
exports.handler = async function(event){
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS', 'x-qb-token, x-qb-realm, x-qb-sandbox'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return J(headers, 405, { ok: false, error: 'POST only' });
  const who = await gcStaffAuth(event);
  if (!who.ok) return J(headers, who.statusCode, { ok: false, error: who.error });
  let allowed = false; try { allowed = await require('./_lib/office-access.js').officeOrAdmin(who); } catch (e) { allowed = false; }
  if (!allowed) return J(headers, 403, { ok: false, error: 'QuickBooks files are for admins and the office.' });
  let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(headers, 400, { ok: false, error: 'bad request' }); }
  const tok = { token: gcHeader(event, 'x-qb-token'), realm: gcHeader(event, 'x-qb-realm'), sandbox: gcHeader(event, 'x-qb-sandbox') === 'true' };
  if (!tok.token || !/^\d{1,30}$/.test(tok.realm)) return J(headers, 200, { ok: false, notConnected: true, reason: 'not-connected', error: 'QuickBooks is not connected on this computer.' });
  const Q = qbClient(tok);
  try {
    if (body.op === 'status') {
      const r = await Q.qbGet('/companyinfo/' + encodeURIComponent(tok.realm));
      return J(headers, 200, { ok: true, connected: true, company: s(r && r.CompanyInfo && r.CompanyInfo.CompanyName) });
    }
    if (body.op === 'lookup') {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX_ITEMS), out = [];
      for (const it of items) {
        const res = { key: s(it && it.key) };
        try {
          const t = await findTxn(Q, it || {});
          if (t.error) { res.ok = false; res.error = t.error; }
          else {
            Object.assign(res, t, { ok: true });
            if (it.files || it.text) { const a = await attachments(Q, t, !!it.text); res.files = a.files; if (it.text) res.text = a.text; }
          }
        } catch (e) { if (e.notConnected || e.busy) throw e; res.ok = false; res.error = s(e.message).slice(0, 200); }
        out.push(res);
      }
      return J(headers, 200, { ok: true, results: out });
    }
    return J(headers, 400, { ok: false, error: 'unknown op' });
  } catch (e) {
    if (e.notConnected) return J(headers, 200, { ok: false, notConnected: true, reason: 'expired', error: 'The QuickBooks sign-in on this computer has expired — connect again.' });
    if (e.busy) return J(headers, 200, { ok: false, busy: true, error: s(e.message) });
    return J(headers, 502, { ok: false, error: s(e.message).slice(0, 200) });
  }
};
module.exports._test = { findTxn: findTxn, txnInfo: txnInfo, ENTITY: ENTITY };
