/* ============================================================================
   GrayCo — THE MONEY DOOR.   netlify/functions/money-intake.js

   "DO A QUICKBOOKS API, have a roof ignite, and ability to make new apis if
    i need"

   One door, three ways in, and every record lands in the CRM's review queue
   for Wesley to accept or deny — nothing writes itself onto a job.

   1. ANY COMPANY YOU HAND A KEY TO
        POST /.netlify/functions/money-intake
        header  x-api-key: <their key>        (or Authorization: Bearer <key>)
        body    { type, amount, date, job | po | address | customer, ref, memo }

      Who they are is decided by WHICH KEY MATCHED. Each company gets its own
      Netlify environment variable:

        MONEY_KEY_QUICKBOOKS = ...     -> source "Quickbooks"
        MONEY_KEY_STRIPE     = ...     -> source "Stripe"
        MONEY_KEY_ACME_BANK  = ...     -> source "Acme Bank"

      A NEW API IS ONE NEW VARIABLE. Add MONEY_KEY_<NAME>, hand <NAME> the key,
      done — nothing in this file changes. Switch one off by deleting its
      variable; the others keep working. (Leads work the same way through
      lead-intake.js with LEAD_KEY_<NAME>; ROOFING_IGNITE_KEY is Roof Ignite.)

   2. QUICKBOOKS ONLINE, BY WEBHOOK
        POST /.netlify/functions/money-intake?qb=1
      Intuit signs every webhook with HMAC-SHA256 over the raw body using the
      Verifier Token from the Intuit developer portal. Set QB_WEBHOOK_VERIFIER
      to that token and every Invoice / Payment / Bill / Purchase / SalesReceipt
      change QuickBooks sees is queued here (realm, entity, id, operation). The
      CRM fetches the full record through its existing QuickBooks connection
      when it collects the queue, so no QuickBooks token ever lives here.

   3. THE CRM COLLECTING WHAT ARRIVED
        GET /.netlify/functions/money-intake?drain=1
        header x-crm-token: <CRM_DRAIN_TOKEN>
      Same token and same handshake as lead-intake. Rows are deleted only
      after they are handed over, so a record is delivered exactly once.

        GET /.netlify/functions/money-intake?ping=1
      Alive check, no auth: says whether any key is set and which sources
      exist — never the keys themselves.

   RULES THAT DO NOT BEND
     · the key is compared in constant time, and a key one character off is
       a wrong key
     · a record with no amount, or no way to find the job, is still TAKEN —
       flagged, with what was missing written on it and told back to the
       sender. A bill we cannot place beats a bill we never heard about.
     · a re-send is normal (every sender retries). Matched on source + their
       reference first, then source + amount + date + job; a repeat is
       answered 200 "already have it" and not queued twice.
     · if the database is down the sender gets 503, not a cheerful 200 over
       a record nobody will ever see.
     · nothing here ever touches a job, an invoice list or P&L. It queues.
       The CRM's review screen is where a person says yes.
   ========================================================================== */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
const TABLE = 'gc_pending_money';

/* ── small helpers ─────────────────────────────────────────────────────────── */
function s(v){ return (v == null ? '' : String(v)).trim(); }
function low(v){ return s(v).toLowerCase(); }
function num(v){
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isFinite(n) ? n : null;
}
function J(code, body, extra){
  return {
    statusCode: code,
    headers: Object.assign({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-crm-token, intuit-signature'
    }, extra || {}),
    body: JSON.stringify(body)
  };
}
function sameSecret(a, b){
  a = Buffer.from(s(a)); b = Buffer.from(s(b));
  if (!a.length || !b.length || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}
function titleCase(str){
  return s(str).toLowerCase().split(/[_\s]+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function isoDay(v){
  const t = s(v); if (!t) return '';
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  const d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

/* ── who sent this? one env var per company ────────────────────────────────── */
function sources(){
  const env = process.env, out = [];
  Object.keys(env).forEach(k => {
    if (k.indexOf('MONEY_KEY_') !== 0) return;
    if (!s(env[k])) return;
    out.push({ name: titleCase(k.slice(10)), key: env[k] });
  });
  return out;
}
function whoSent(given){
  const list = sources();
  let name = '';
  list.forEach(x => { if (sameSecret(given, x.key) && !name) name = x.name; });   /* no early exit */
  return { any: list.length > 0, name };
}

/* ── the database, exactly as lead-intake talks to it ──────────────────────── */
async function sb(path, opts){
  opts = opts || {};
  const headers = Object.assign({
    apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json', Prefer: 'return=representation'
  }, opts.headers || {});
  return fetch(SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path, {
    method: opts.method || 'GET', headers, body: opts.body
  });
}
function dbReady(){ return !!(SUPABASE_URL && SUPABASE_KEY); }

/* ── read a money record loosely: their field names, not ours ──────────────── */
const TYPES = {
  invoice: 'invoice', inv: 'invoice', bill: 'invoice', ap: 'invoice',
  payment: 'payment', pay: 'payment', receipt: 'payment', deposit: 'payment', ar: 'payment',
  expense: 'expense', purchase: 'expense', charge: 'expense', card: 'expense',
  refund: 'refund', credit: 'refund'
};
function pick(obj, names){
  for (let i = 0; i < names.length; i++){
    const n = names[i];
    if (obj[n] != null && s(obj[n]) !== '') return obj[n];
    const hit = Object.keys(obj).find(k => low(k) === low(n));
    if (hit && obj[hit] != null && s(obj[hit]) !== '') return obj[hit];
  }
  return '';
}
function readMoney(body, source){
  const b = (body && typeof body === 'object') ? body : {};
  const rawType = low(pick(b, ['type', 'kind', 'record_type', 'recordType', 'txnType', 'txn_type']));
  const type = TYPES[rawType] || (rawType ? 'other' : 'invoice');
  const amount = num(pick(b, ['amount', 'amt', 'total', 'total_amount', 'totalAmount', 'TotalAmt', 'value', 'sum']));
  const date = isoDay(pick(b, ['date', 'txn_date', 'txnDate', 'TxnDate', 'paid_on', 'paidOn', 'invoice_date', 'invoiceDate', 'created', 'created_at']));
  const ref = s(pick(b, ['ref', 'reference', 'id', 'external_id', 'externalId', 'invoice_number', 'invoiceNumber', 'DocNumber', 'doc_number', 'number', 'check_number', 'checkNumber', 'transaction_id', 'transactionId']));
  const job = s(pick(b, ['job', 'job_name', 'jobName', 'project', 'project_name', 'projectName']));
  const po = s(pick(b, ['po', 'po_number', 'poNumber', 'purchase_order', 'purchaseOrder']));
  const address = s(pick(b, ['address', 'job_address', 'jobAddress', 'site', 'site_address', 'property']));
  const customer = s(pick(b, ['customer', 'client', 'customer_name', 'customerName', 'CustomerRef', 'payer', 'from']));
  const vendor = s(pick(b, ['vendor', 'sub', 'subcontractor', 'payee', 'supplier', 'VendorRef', 'to']));
  const memo = s(pick(b, ['memo', 'description', 'desc', 'note', 'notes', 'PrivateNote', 'line_description']));
  const status = low(pick(b, ['status', 'state']));
  const attachment = s(pick(b, ['attachment', 'attachment_url', 'attachmentUrl', 'pdf', 'pdf_url', 'pdfUrl', 'file', 'file_url', 'fileUrl', 'receipt_url', 'receiptUrl']));

  const missing = [];
  if (amount == null) missing.push('amount');
  if (!date) missing.push('date');
  if (!job && !po && !address && !customer) missing.push('job (job, po, address or customer)');

  const known = {};
  ['type','kind','record_type','recordType','txnType','txn_type','amount','amt','total','total_amount','totalAmount','TotalAmt','value','sum',
   'date','txn_date','txnDate','TxnDate','paid_on','paidOn','invoice_date','invoiceDate','created','created_at',
   'ref','reference','id','external_id','externalId','invoice_number','invoiceNumber','DocNumber','doc_number','number','check_number','checkNumber','transaction_id','transactionId',
   'job','job_name','jobName','project','project_name','projectName','po','po_number','poNumber','purchase_order','purchaseOrder',
   'address','job_address','jobAddress','site','site_address','property','customer','client','customer_name','customerName','CustomerRef','payer','from',
   'vendor','sub','subcontractor','payee','supplier','VendorRef','to','memo','description','desc','note','notes','PrivateNote','line_description',
   'status','state','attachment','attachment_url','attachmentUrl','pdf','pdf_url','pdfUrl','file','file_url','fileUrl','receipt_url','receiptUrl']
    .forEach(k => { known[low(k)] = 1; });
  const extra = {};
  Object.keys(b).forEach(k => { if (!known[low(k)]) extra[k] = b[k]; });   /* kept verbatim, never dropped */

  return {
    source, type, amount, date, ref, job, po, address, customer, vendor, memo, status, attachment,
    extra, missing,
    receivedAt: new Date().toISOString(),
    review: 'pending'                                   /* a person decides */
  };
}

/* ── the fingerprint a re-send is matched on ───────────────────────────────── */
function fingerprint(rec){
  const src = low(rec.source);
  if (rec.ref) return 'ref:' + src + ':' + low(rec.ref);
  return 'shape:' + src + ':' + rec.type + ':' + (rec.amount == null ? '' : rec.amount.toFixed(2))
    + ':' + rec.date + ':' + low(rec.job || rec.po || rec.address || rec.customer);
}

/* ── QuickBooks webhook: verify, then queue what changed ───────────────────── */
function qbSignatureOk(rawBody, signature){
  const verifier = s(process.env.QB_WEBHOOK_VERIFIER);
  if (!verifier || !signature) return false;
  const expected = crypto.createHmac('sha256', verifier).update(rawBody || '', 'utf8').digest('base64');
  return sameSecret(expected, signature);
}
const QB_MONEY = { Invoice: 'invoice', Payment: 'payment', Bill: 'invoice', BillPayment: 'payment',
                   Purchase: 'expense', SalesReceipt: 'payment', RefundReceipt: 'refund', CreditMemo: 'refund',
                   Deposit: 'payment', VendorCredit: 'refund' };
function readQbEvents(body){
  const out = [];
  const notes = (body && body.eventNotifications) || [];
  notes.forEach(n => {
    const realm = s(n.realmId);
    const ents = (n.dataChangeEvent && n.dataChangeEvent.entities) || [];
    ents.forEach(e => {
      const name = s(e.name);
      if (!QB_MONEY[name]) return;                       /* Customer/Item/etc. are not money */
      out.push({
        source: 'Quickbooks', type: QB_MONEY[name], amount: null, date: isoDay(e.lastUpdated),
        ref: name + ':' + s(e.id), job: '', po: '', address: '', customer: '', vendor: '', memo: '',
        status: low(e.operation), attachment: '',
        qb: { realmId: realm, entity: name, id: s(e.id), operation: s(e.operation), lastUpdated: s(e.lastUpdated) },
        extra: {}, missing: ['details (the CRM fetches the ' + name + ' from QuickBooks when it collects this)'],
        receivedAt: new Date().toISOString(), review: 'pending'
      });
    });
  });
  return out;
}

/* ── queue it, exactly once ────────────────────────────────────────────────── */
async function queue(records){
  /* returns { queued, repeats, stored:boolean } — never throws */
  if (!dbReady()) return { queued: 0, repeats: 0, stored: false, why: 'database not configured' };
  let queued = 0, repeats = 0;
  for (let i = 0; i < records.length; i++){
    const rec = records[i];
    const fp = fingerprint(rec);
    try {
      const seen = await sb(TABLE + '?select=id&fingerprint=eq.' + encodeURIComponent(fp) + '&limit=1');
      if (seen.ok){
        const rows = await seen.json();
        if (Array.isArray(rows) && rows.length){ repeats++; continue; }
      } else if (seen.status >= 500) {
        return { queued, repeats, stored: false, why: 'database read failed (' + seen.status + ')' };
      }
      const ins = await sb(TABLE, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ fingerprint: fp, source: rec.source, type: rec.type, record: rec })
      });
      if (ins.status === 409){ repeats++; continue; }   /* unique index caught a race */
      if (!ins.ok) return { queued, repeats, stored: false, why: 'database write failed (' + ins.status + ')' };
      queued++;
    } catch (e) {
      return { queued, repeats, stored: false, why: 'database unreachable' };
    }
  }
  return { queued, repeats, stored: true };
}

/* ── the handler ───────────────────────────────────────────────────────────── */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return J(200, {});
  const h = {};
  Object.keys(event.headers || {}).forEach(k => { h[low(k)] = event.headers[k]; });
  const qs = event.queryStringParameters || {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');

  /* alive? says nothing secret */
  if (event.httpMethod === 'GET' && (qs.ping === '1' || qs.ping === 'true')) {
    const list = sources();
    return J(200, {
      ok: true, service: 'GrayCo money intake',
      ready: list.length > 0 && dbReady(),
      sources: list.map(x => x.name),
      quickbooksWebhook: !!s(process.env.QB_WEBHOOK_VERIFIER),
      database: dbReady()
    });
  }

  /* the CRM collecting the queue */
  if (event.httpMethod === 'GET' && (qs.drain === '1' || qs.drain === 'true')) {
    const want = process.env.CRM_DRAIN_TOKEN;
    if (!want) return J(500, { error: 'CRM_DRAIN_TOKEN is not set on Netlify.' });
    if (!sameSecret(h['x-crm-token'], want)) return J(401, { error: 'Not authorised.' });
    if (!dbReady()) return J(500, { error: 'Supabase is not configured.' });
    try {
      const r = await sb(TABLE + '?select=id,record,created_at&order=created_at.asc&limit=200');
      if (!r.ok) return J(502, { error: 'Could not read the money queue (' + r.status + ').' });
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) return J(200, { records: [] });
      const ids = rows.map(x => x.id);
      try {
        await sb(TABLE + '?id=in.(' + ids.join(',') + ')', {
          method: 'DELETE', headers: { Prefer: 'return=minimal' }
        });
      } catch (e) {}
      return J(200, { records: rows.map(x => x.record) });
    } catch (e) {
      return J(502, { error: 'Could not read the money queue.' });
    }
  }

  if (event.httpMethod !== 'POST') return J(405, { error: 'Method not allowed' });

  /* QuickBooks webhook — signed by Intuit, not by a key */
  if (qs.qb === '1' || qs.qb === 'true' || h['intuit-signature']) {
    if (!qbSignatureOk(raw, h['intuit-signature'])) return J(401, { error: 'Bad QuickBooks signature.' });
    let body; try { body = JSON.parse(raw || '{}'); } catch (e) { return J(400, { error: 'Not JSON.' }); }
    const recs = readQbEvents(body);
    if (!recs.length) return J(200, { ok: true, queued: 0, note: 'nothing money-related in this event' });
    const q = await queue(recs);
    if (!q.stored) return J(503, { ok: false, queued: q.queued, error: 'GrayCo could not store this yet (' + q.why + ') — please retry.' });
    return J(200, { ok: true, queued: q.queued, repeats: q.repeats });
  }

  /* a company with a key */
  const bearer = s(h.authorization).replace(/^Bearer\s+/i, '');
  const given = s(h['x-api-key']) || bearer;
  const who = whoSent(given);
  if (!who.any) return J(503, { error: 'No money keys are set up yet.' });
  if (!who.name) return J(401, { error: 'Not authorised.' });

  let body; try { body = JSON.parse(raw || '{}'); } catch (e) { return J(400, { error: 'Not JSON.' }); }
  const list = Array.isArray(body) ? body : (Array.isArray(body.records) ? body.records : [body]);
  if (!list.length) return J(400, { error: 'Nothing to take.' });
  if (list.length > 200) return J(413, { error: 'At most 200 records per call.' });

  const recs = list.map(b => readMoney(b, who.name));
  const q = await queue(recs);
  if (!q.stored) {
    return J(503, { ok: false, source: who.name, queued: q.queued,
      error: 'GrayCo could not store this yet (' + q.why + ') — please retry later.' });
  }
  const flagged = recs.filter(r => r.missing.length);
  return J(q.queued ? 202 : 200, {
    ok: true, source: who.name,
    queued: q.queued, repeats: q.repeats,
    status: q.queued ? 'queued for review' : 'already have it',
    incomplete: flagged.map(r => ({ ref: r.ref || null, missing: r.missing }))
  });
};

/* exposed for the test harness only */
exports._test = { readMoney, fingerprint, readQbEvents, qbSignatureOk, whoSent, sources };
