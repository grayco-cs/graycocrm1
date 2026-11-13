/* patch INVMAIL: the made-up world shared by test_INVMAIL_fn.mjs and test_INVMAIL_ui.mjs — Supabase (gc_kv, the inbox's own table,
   gc_staff, sign-in), crm-files storage, Resend's receiving API and Gmail, all mocked at fetch(). Made-up data only. */
import { createRequire } from 'module';
import assert from 'assert';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = process.env.INVMAIL_FN || path.join(ROOT, 'netlify/functions');

function pdf(lines){
  const content = 'BT /F1 11 Tf 50 750 Td ' + lines.map((l, i) => (i ? '0 -16 Td ' : '') + '(' + l.replace(/([()\\])/g, '\\$1') + ') Tj').join(' ') + ' ET';
  const comp = zlib.deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + comp.length + '/Filter/FlateDecode>>\nstream\n', 'latin1'), comp, Buffer.from('\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'latin1')]);
}

/* ── the made-up CRM ── */
const DATA = {
  projects: [
    { id: 'P1', name: 'Hollis Reroof', address: '8382 Laurett Cove, Cordova, TN 38016', autoPO: 'A101', pm: 'Pat Mason', client: 'Dana Hollis', status: 'Active' },
    { id: 'P2', name: 'Brent Kitchen', address: '123 Senatobia Dr, Hernando, MS', autoPO: 'T724', pm: '', client: 'Lou Brent', status: 'Active' }
  ],
  subs: [{ id: 'S1', name: 'Ridgeline Roofing', email: 'casey@ridgelineroof.test', isSub: true }],
  vendors: [{ id: 'V1', name: 'Tom Eubanks Lumber', email: 'ar@eubankslumber.test', isSub: false, cat: 'Lumber' }],
  ccw_suppliers: [{ id: 'SUP1', n: 'Memphis Brick Yard', e: 'billing@brickyard.test', p: '', t: 'Masonry' }],
  invs: [], invoices: [], expenses: [], gc_deleted_projects: [], customers: [], gc_claims: [],
  users: [{ name: 'Brittany Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { name: 'Pat Mason', email: 'pat@grayco-cs.com', role: 'Project Manager', active: true }]
};
const INV = pdf(['RIDGELINE ROOFING LLC', 'INVOICE', 'Invoice #: RR-4001', 'Invoice Date: 11/10/2026', 'Bill To: GrayCo Construction Services', 'Job Site: 8382 Laurett Cove, Cordova TN', 'Tear off and reroof   $8,400.00', 'Total Due: $8,400.00']);
const STMT = pdf(['MEMPHIS BRICK YARD', 'STATEMENT OF ACCOUNT', 'Statement Date: 11/01/2026', 'PO A101  Inv 55120  $1,234.00', 'Amount Due: $1,234.00', 'Please remit to PO Box 1, Memphis TN']);
const OWN = pdf(['GrayCo Construction Services', 'INVOICE', 'Invoice #: 1043', 'Bill To: Lou Brent', 'Total Due: $4,800.00']);
const UNSURE = pdf(['Hollis job', 'Labor 12 hrs', 'Amount due: $450.00']);
const UNSURE2 = pdf(['Hollis job - week 2', 'Labor 8 hrs', 'Amount due: $300.00']);
const RCPT = pdf(['MEMPHIS BRICK YARD', 'RECEIPT #55312', 'PO C333', 'Mortar 10 bags', 'TOTAL $108.25', 'PAID - VISA 4421']);
const BIDDOC = pdf(['INVITATION TO BID', 'Oakview Elementary Reroof', 'Bids due 12/01/2026 2:00 PM']);

/* ── the fake world behind fetch(): Supabase (gc_kv, the inbox's own table, gc_staff, sign-in), crm-files storage, Resend ── */
const W = { tables: { gc_kv: {}, gc_lead_inbox_kv: {} }, store: new Map(), emails: {}, calls: [] };
const put = (T, k, v) => { W.tables[T][k] = { key: k, value: v, updated_at: new Date(Date.now() + Math.random()).toISOString() }; };
Object.keys(DATA).forEach(k => put('gc_kv', k, JSON.stringify(DATA[k])));
const USERS = { 'tok-office': { email: 'office@grayco-cs.com', name: 'Brittany Demo', role: 'office' }, 'tok-owner': { email: 'wjohnson@grayco-cs.com', name: 'Wesley Demo', role: 'admin' }, 'tok-pm': { email: 'pat@grayco-cs.com', name: 'Pat Mason', role: 'staff' } };
const res = (status, body, ct) => ({ ok: status >= 200 && status < 300, status, headers: { get: h => /content-type/i.test(h) ? (ct || 'application/json') : null },
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => (typeof body === 'string' ? body : Buffer.isBuffer(body) ? body.toString('latin1') : JSON.stringify(body)),
  arrayBuffer: async () => { const b = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } });
async function fakeFetch(u, o){
  o = o || {}; const m = (o.method || 'GET').toUpperCase(); u = String(u); W.calls.push(m + ' ' + u);
  let x;
  if ((x = /api\.resend\.com\/emails\/receiving\/([^/]+)\/attachments\/([^/?]+)$/.exec(u))) { const e = W.emails[x[1]]; const a = e && e.att[x[2]]; return a ? res(200, { id: x[2], filename: a.name, content_type: a.type, size: a.buf.length, download_url: 'https://inbound-cdn.resend.app/' + x[1] + '/' + x[2] }) : res(404, {}); }
  if ((x = /api\.resend\.com\/emails\/receiving\/([^/]+)\/attachments$/.exec(u))) { const e = W.emails[x[1]]; return res(200, { object: 'list', data: e ? Object.keys(e.att).map(id => ({ id, filename: e.att[id].name, content_type: e.att[id].type, size: e.att[id].buf.length, download_url: 'https://inbound-cdn.resend.app/' + x[1] + '/' + id })) : [] }); }
  if ((x = /api\.resend\.com\/emails\/receiving\/([^/?]+)$/.exec(u))) { const e = W.emails[x[1]]; return e ? res(200, e.full) : res(404, {}); }
  if ((x = /inbound-cdn\.resend\.app\/([^/]+)\/([^/?]+)/.exec(u))) { const e = W.emails[x[1]]; return res(200, e.att[x[2]].buf, e.att[x[2]].type); }
  if ((x = /\/storage\/v1\/object\/crm-files\/([^?]+)$/.exec(u))) {
    if (m === 'POST') { if (W.store.has(x[1])) return res(409, 'Duplicate'); W.store.set(x[1], Buffer.from(o.body)); return res(200, { Key: x[1] }); }
    return W.store.has(x[1]) ? res(200, W.store.get(x[1]), 'application/octet-stream') : res(404, 'not found');
  }
  if (/\/storage\/v1\//.test(u)) return res(200, {});
  if (/\/auth\/v1\/user$/.test(u)) { const tok = /Bearer\s+(\S+)/.exec((o.headers || {}).Authorization || '') || []; return tok[1] && USERS[tok[1]] ? res(200, { email: USERS[tok[1]].email }) : res(401, {}); }
  if (/\/rest\/v1\/gc_staff\?/.test(u)) { const e = decodeURIComponent((/email=eq\.([^&]+)/.exec(u) || [])[1] || ''); const y = Object.values(USERS).find(z => z.email === e); return res(200, y ? [{ email: y.email, name: y.name, role: y.role, active: true }] : []); }
  const mm = /\/rest\/v1\/([a-z_]+)\?(.*)$/.exec(u) || /\/rest\/v1\/([a-z_]+)$/.exec(u);
  if (mm) {
    const T = mm[1], q = new URLSearchParams(mm[2] || '');
    if (!W.tables[T]) return res(404, { code: 'PGRST205', message: 'relation does not exist' });
    if (m === 'GET') {
      const k = q.get('key') || '';
      if (/^eq\./.test(k)) { const r = W.tables[T][decodeURIComponent(k.slice(3))]; return res(200, r ? [r] : []); }
      if (/^in\./.test(k)) { const ks = decodeURIComponent(k).slice(4, -1).split(',').map(y => y.replace(/^"|"$/g, '')); return res(200, ks.map(y => W.tables[T][y]).filter(Boolean)); }
      return res(200, Object.values(W.tables[T]).slice(0, 1));
    }
    if (m === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(r => put(T, r.key, r.value)); return res(201, ''); }
    if (m === 'PATCH') { const k = decodeURIComponent((q.get('key') || '').slice(3)), at = decodeURIComponent((q.get('updated_at') || '').slice(3)); const r = W.tables[T][k]; if (!r || r.updated_at !== at) return res(200, []); const b = JSON.parse(o.body); put(T, k, b.value); return res(200, [W.tables[T][k]]); }
  }
  return res(404, 'no route ' + u);
}
const kv = (k, T) => { const r = W.tables[T || 'gc_kv'][k]; if (!r) return null; return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; };
const money = () => kv('gc_mail_money') || [];

process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test'; process.env.RESEND_API_KEY = 're_test'; process.env.BID_INBOUND_SECRET = 'handoff-test-secret';
delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_SA_EMAIL; delete process.env.GOOGLE_SA_KEY; delete process.env.INVMAIL_BOXES; delete process.env.INVMAIL_COPY_TO;
globalThis.fetch = fakeFetch;
const BI = require(FN + '/bid-inbox.js');
const IM = require(FN + '/_lib/invmail.js');
const MB = require(FN + '/_lib/money-box.js');
const MM = require(FN + '/_lib/money-mail.js');

/* one e-mail as Resend delivers it to the webhook (envelope `to`), its full body and attachments behind the receiving API */
let N = 0;
function resend(o){
  const id = 'e' + (++N) + '-0000-4000-8000-000000000000';
  const att = {}; (o.files || []).forEach((f, i) => { att['att_' + i] = f; });
  const hdr = Object.assign({ 'message-id': o.mid, from: o.from, to: (o.toHdr || []).join(', '), cc: (o.cc || []).join(', ') }, o.headers || {});
  W.emails[id] = { att, full: { object: 'email', id, created_at: '2026-11-12T15:00:00.000Z', from: o.from, to: o.toHdr || [], cc: o.cc || [], subject: o.subject, message_id: o.midResend || o.mid,
    text: o.text || '', html: '', headers: hdr, attachments: Object.keys(att).map(k => ({ id: k, filename: att[k].name, content_type: att[k].type, size: att[k].buf.length })) } };
  return { type: 'email.received', data: { email_id: id, created_at: '2026-11-12T15:00:00.000Z', from: o.from, to: o.envelope, cc: [], subject: o.subject, message_id: o.mid, attachments: [] } };
}
async function deliver(evt){
  const logs = []; const ol = console.log, oe = console.error; console.log = (...a) => logs.push(a.join(' ')); console.error = (...a) => logs.push(a.join(' '));
  let r; try { BI._test.resetKvTable(); r = await BI._test.processEvent(evt, { inline: true }); } finally { console.log = ol; console.error = oe; }
  return Object.assign({ logs }, r);
}
async function call(tok, method, body){
  BI._test.resetKvTable();
  const r = await BI.handler({ httpMethod: method, headers: { authorization: 'Bearer ' + tok, origin: 'https://crm.grayco-cs.com' }, queryStringParameters: { invmail: '1' }, body: body ? JSON.stringify(body) : '' });
  return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
}
const COPY = ['invoicecopy@in.grayco-cs.com'];
const file = (name, buf, type) => ({ name, type: type || 'application/pdf', buf });
const mailLog = () => kv('gc_mail_log', 'gc_lead_inbox_kv') || [];

/* a Gmail message (format=full) for the 🌐 All GrayCo e-mail sync (money-box) */
const GM = {};
function gmail(box, id, o){
  const parts = [{ mimeType: 'text/plain', body: { data: Buffer.from(o.text || '').toString('base64url') } }];
  (o.files || []).forEach((f, i) => parts.push({ filename: f.name, mimeType: f.type, body: { attachmentId: 'A' + i, size: f.buf.length } }));
  GM[box + '/' + id] = { msg: { id, threadId: 'th' + id, internalDate: String(Date.now()), labelIds: ['INBOX'], payload: { mimeType: 'multipart/mixed', parts,
    headers: [{ name: 'From', value: o.from }, { name: 'To', value: (o.toHdr || []).join(', ') }, { name: 'Cc', value: (o.cc || []).join(', ') }, { name: 'Subject', value: o.subject }, { name: 'Message-ID', value: o.mid }].concat(Object.keys(o.headers || {}).map(k => ({ name: k, value: o.headers[k] }))) } }, files: o.files || [] };
  const em = (/<([^>]+)>/.exec(o.from) || [])[1] || o.from;
  return { id, thread: 'th' + id, mid: o.mid, mailbox: box, at: new Date().toISOString(), from: em.toLowerCase(), to: o.toHdr || [], cc: o.cc || [], subject: o.subject, snippet: (o.text || '').slice(0, 120), labels: ['INBOX'], att: !!(o.files || []).length, dir: 'in', src: 'gmail' };
}
const G = { configured: () => true, bodyOf: require(FN + '/_lib/gmail.js').bodyOf,
  api: async (box, p) => { const m = /\/messages\/([^/]+)(\/attachments\/A(\d+))?/.exec(p); const g = GM[box + '/' + decodeURIComponent(m[1])]; if (!g) throw new Error('404 not found'); return m[2] ? { data: g.files[+m[3]].buf.toString('base64url') } : g.msg; } };
async function sync(box, rows){
  const ol = console.log; console.log = () => {};
  try { BI._test.resetKvTable(); const n = await MB.queue(box, rows); const out = await MB.drain({ gmail: G, storeFile: BI._lib.storeFile }); return { n, out }; } finally { console.log = ol; }
}


export { W, kv, money, mailLog, resend, deliver, call, gmail, G, sync, pdf, file, DATA, INV, STMT, OWN, UNSURE, UNSURE2, RCPT, BIDDOC, BI, IM, MB, MM, COPY, FN, put, fakeFetch };
