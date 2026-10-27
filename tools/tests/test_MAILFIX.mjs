/* patch MAILFIX tests: node tools/tests/test_MAILFIX.mjs — made-up sub, job and mail only.
   The whole road an invoice forwarded from office@ takes in production: Resend's email.received webhook (metadata
   only) → bid-inbox's slow half (backgroundHandler) → readMail (Resend's receiving API + its attachments API, the
   PDF from the signed download_url) → processEvent → money-mail → gc_kv gc_mail_money, with Supabase, storage and
   Resend all mocked at fetch(). MAILFIX_FN=<dir>/netlify/functions runs it against another build (r8 fails the root-cause case). */
import { createRequire } from 'module';
import assert from 'assert';
import zlib from 'zlib';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = process.env.MAILFIX_FN || path.join(ROOT, 'netlify/functions');

let passed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); process.exitCode = 1; } }

function pdf(lines){
  const content = 'BT /F1 11 Tf 50 750 Td ' + lines.map((l, i) => (i ? '0 -16 Td ' : '') + '(' + l.replace(/([()\\])/g, '\\$1') + ') Tj').join(' ') + ' ET';
  const comp = zlib.deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + comp.length + '/Filter/FlateDecode>>\nstream\n', 'latin1'), comp, Buffer.from('\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'latin1')]);
}

/* ── made-up CRM data: a job at "600 West Church Street" (the invoice says "600 W. Church St.") ── */
const DATA = {
  projects: [
    { id: 'P600', name: 'Church St Flooring', address: '600 West Church Street, Collierville, TN 38017', autoPO: 'A600', pm: 'Pat Mason', client: 'Test Owner', status: 'Active' },
    { id: 'P601', name: 'Other Job', address: '4410 Oakview Ln, Memphis TN', autoPO: 'A601', status: 'Active' }
  ],
  subs: [{ id: 'S9', name: 'Bestway Floor and Tile Test', email: 'billing@bestwayfloor.test', trade: 'Flooring' }],
  vendors: [], invs: [], invoices: [], gc_deleted_projects: []
};
const PDF = pdf(['BESTWAY FLOOR AND TILE TEST', 'INVOICE', 'Invoice #: INV55001', 'Invoice Date: 10/27/2026', 'Bill To: GrayCo Construction Services',
  'Job Site: 600 W. Church St., Collierville TN', 'LVP install 900 sf   $3,150.00', 'Total Due: $3,150.00', 'Terms: Net 15']);
const FILE_NAME = 'Invoice_INV55001_1700000000000.pdf';

/* ── the fake world behind fetch(): Supabase (gc_kv + the inbox's own table), storage, Resend ── */
function world(opt){
  opt = opt || {};
  const tables = { gc_kv: {}, gc_lead_inbox_kv: {} };
  const put = (t, k, v) => { tables[t][k] = { key: k, value: v, updated_at: new Date(Date.now() + Math.random()).toISOString() }; };
  Object.keys(DATA).forEach(k => put('gc_kv', k, JSON.stringify(DATA[k])));
  const calls = [], W0 = { users: { 'tok-office': { email: 'office.person@grayco-cs.com', name: 'Office Person', role: 'office' }, 'tok-field': { email: 'field@grayco-cs.com', name: 'Field', role: 'field' } } };
  const res = (status, body, ct) => ({ ok: status >= 200 && status < 300, status, headers: { get: h => /content-type/i.test(h) ? (ct || 'application/json') : null },
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    arrayBuffer: async () => { const b = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } });
  const EMAIL_ID = opt.emailId || 'e5b1c0de-0000-4000-8000-000000000001';
  const full = {
    object: 'email', id: EMAIL_ID, created_at: '2026-10-27T21:05:24.000Z',
    from: 'GrayCo Office <office@grayco-cs.com>', to: ['invoices@in.grayco-cs.com'], cc: [], bcc: [], reply_to: [],
    subject: "Fwd: Bestway Floor and Tile Test: Invoice INV55001 - 600 W. Church St.",
    message_id: opt.messageId || '<CAFwd0001@mail.gmail.com>',
    text: 'Please pay.\n\n---------- Forwarded message ---------\nFrom: Bestway Floor and Tile Test <billing@bestwayfloor.test>\nDate: Mon, Oct 27, 2026 at 3:10 PM\nSubject: Bestway Floor and Tile Test: Invoice INV55001 - 600 W. Church St.\nTo: <office@grayco-cs.com>\n\n\nDear GrayCo, your invoice INV55001 is attached.\n',
    html: '<div dir="ltr">Please pay.<br><div class="gmail_quote"><div class="gmail_attr">---------- Forwarded message ---------<br>From: <b class="gmail_sendername">Bestway Floor and Tile Test</b> &lt;billing@bestwayfloor.test&gt;</div></div></div>',
    headers: Object.assign({ 'message-id': opt.messageId || '<CAFwd0001@mail.gmail.com>', 'list-id': '<invoices.grayco-cs.com>', 'mailing-list': 'list invoices@grayco-cs.com; contact invoices+owners@grayco-cs.com',
      precedence: 'list', 'x-original-sender': 'office@grayco-cs.com', 'x-google-group-id': '123456789', to: 'invoices@grayco-cs.com', from: 'GrayCo Office <office@grayco-cs.com>' }, opt.headers || {}),
    attachments: [{ id: 'att_1', filename: FILE_NAME, content_type: 'application/pdf', content_disposition: 'attachment', size: PDF.length }]
  };
  const fetchImpl = async (u, o) => {
    o = o || {}; const m = (o.method || 'GET').toUpperCase(); u = String(u); calls.push(m + ' ' + u);
    if (/api\.resend\.com\/emails\/receiving\/[^/]+\/attachments\/att_1$/.test(u)) return res(200, { object: 'attachment', id: 'att_1', filename: FILE_NAME, content_type: 'application/pdf', size: PDF.length, download_url: 'https://inbound-cdn.resend.app/att_1?sig=y' });
    if (/api\.resend\.com\/emails\/receiving\/[^/]+\/attachments/.test(u)) return opt.noAttApi ? res(404, { message: 'not found' }) : res(200, { object: 'list', has_more: false, data: [{ id: 'att_1', filename: FILE_NAME, size: PDF.length, content_type: 'application/pdf', content_disposition: 'attachment', download_url: 'https://inbound-cdn.resend.app/att_1?sig=x', expires_at: '2026-10-28T21:05:24Z' }] });
    if (/api\.resend\.com\/emails\/receiving\//.test(u)) return opt.noFull ? res(401, { message: 'restricted key' }) : res(200, full);
    if (/inbound-cdn\.resend\.app/.test(u)) return res(200, PDF, 'application/pdf');
    if (/\/storage\/v1\/object\//.test(u)) return res(200, { Key: 'x' });
    if (/\/auth\/v1\/user$/.test(u)) { const tok = /Bearer\s+(\S+)/.exec((o.headers || {}).Authorization || '') || []; return tok[1] && W0.users[tok[1]] ? res(200, { email: W0.users[tok[1]].email }) : res(401, {}); }
    if (/\/rest\/v1\/gc_staff\?/.test(u)) { const e = decodeURIComponent((/email=eq\.([^&]+)/.exec(u) || [])[1] || ''); const x = Object.values(W0.users).find(y => y.email === e); return res(200, x ? [{ email: x.email, name: x.name, role: x.role, active: true }] : []); }
    const mm = /\/rest\/v1\/([a-z_]+)\?(.*)$/.exec(u) || /\/rest\/v1\/([a-z_]+)$/.exec(u);
    if (mm) {
      const T = mm[1], q = new URLSearchParams(mm[2] || '');
      if (!tables[T]) return res(404, { code: 'PGRST205', message: 'relation does not exist' });
      if (m === 'GET') {
        const k = q.get('key') || '';
        if (/^eq\./.test(k)) { const r = tables[T][decodeURIComponent(k.slice(3))]; return res(200, r ? [r] : []); }
        if (/^in\./.test(k)) { const ks = k.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return res(200, ks.map(x => tables[T][x]).filter(Boolean)); }
        return res(200, Object.values(tables[T]).slice(0, 1));
      }
      if (m === 'POST') { const b = JSON.parse(o.body); put(T, b.key, b.value); return res(201, ''); }
      if (m === 'PATCH') { const k = decodeURIComponent((q.get('key') || '').slice(3)), at = decodeURIComponent((q.get('updated_at') || '').slice(3)); const r = tables[T][k]; if (!r || r.updated_at !== at) return res(200, []); const b = JSON.parse(o.body); put(T, k, b.value); return res(200, [tables[T][k]]); }
    }
    return res(404, 'no route ' + u);
  };
  if (opt.attachments) full.attachments = opt.attachments;
  return { tables, calls, fetchImpl, EMAIL_ID, full,
    kv: (k, T) => { const r = tables[T || 'gc_kv'][k]; if (!r) return null; return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } };
}

/* the webhook's metadata (Resend email.received) → the signed hand-off body the slow half gets */
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test'; process.env.RESEND_API_KEY = 're_test';
process.env.BID_INBOUND_SECRET = 'handoff-test-secret';
delete process.env.ANTHROPIC_API_KEY;
const BI = require(FN + '/bid-inbox.js');
function hook(W){
  return { type: 'email.received', created_at: '2026-10-27T21:05:25.000Z', data: { email_id: W.EMAIL_ID, created_at: '2026-10-27T21:05:24.000Z', from: 'GrayCo Office <office@grayco-cs.com>',
    to: ['invoices@in.grayco-cs.com'], cc: [], bcc: [], message_id: W.full.message_id, subject: W.full.subject,
    attachments: [{ id: 'att_1', filename: FILE_NAME, content_type: 'application/pdf', content_disposition: 'attachment' }] } };
}
async function background(W, evt){
  const raw = JSON.stringify(evt), ts = String(Date.now());
  const of = globalThis.fetch; globalThis.fetch = W.fetchImpl;
  const logs = []; const ol = console.log, oe = console.error, ow = console.warn;
  console.log = (...a) => logs.push(a.join(' ')); console.error = (...a) => logs.push(a.join(' ')); console.warn = (...a) => logs.push(a.join(' '));
  let r;
  try { BI._test.resetKvTable(); r = await BI.backgroundHandler({ httpMethod: 'POST', headers: { 'x-bid-ts': ts, 'x-bid-handoff': BI._test.handoffSig(ts, raw) }, body: raw }); }
  finally { globalThis.fetch = of; console.log = ol; console.error = oe; console.warn = ow; }
  return { status: r.statusCode, body: JSON.parse(r.body || '{}'), logs };
}

async function handler(W, event){
  const of = globalThis.fetch; globalThis.fetch = W.fetchImpl;
  const logs = []; const ol = console.log, oe = console.error; console.log = (...a) => logs.push(a.join(' ')); console.error = (...a) => logs.push(a.join(' '));
  let r; try { BI._test.resetKvTable(); r = await BI.handler(Object.assign({ httpMethod: 'GET', headers: {}, queryStringParameters: {} }, event)); }
  finally { globalThis.fetch = of; console.log = ol; console.error = oe; }
  return { status: r.statusCode, body: JSON.parse(r.body || '{}'), logs };
}
const SI = require(FN + '/_lib/subinv.js');
const JOURNAL = { 'x-grayco-journal': '1' };   /* production: Google's routing rule stamps the whole message, the group's copy too */

console.log('MAILFIX');
await t('"600 W. Church St." = "600 West Church Street" (W./West, St./Street) and the job match is certain', () => {
  const a = SI.addrParts('600 W. Church St.'), b = SI.addrParts('600 West Church Street, Collierville, TN 38017');
  assert.ok(a && b); assert.strictEqual(a.key, b.key); assert.strictEqual(a.key, '600 church st');
  assert.strictEqual(SI.findAddress('', "Bestway Floor and Tile Test: Invoice INV55001 - 600 W. Church St."), '600 W. Church St');
  const m = SI.matchJob(DATA.projects, { jobAddress: '600 W. Church St.', hay: '' }, []);
  assert.strictEqual(m.best.pid, 'P600'); assert.ok(m.certain, JSON.stringify(m));
});
await t('ROOT CAUSE: the forwarded invoice with the routing rule\'s X-GrayCo-Journal header is a sub invoice, not a history copy', async () => {
  const W = world({ headers: JOURNAL });
  const r = await background(W, hook(W));
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.inbox, 'sub-invoices', JSON.stringify(r.body));
  const mm = W.kv('gc_mail_money'); assert.strictEqual(mm.length, 1);
  const rec = mm[0];
  assert.strictEqual(rec.kind, 'sub_invoice'); assert.strictEqual(rec.forwardedBy, 'office@grayco-cs.com'); assert.strictEqual(rec.from, 'billing@bestwayfloor.test');
  assert.strictEqual(rec.files.length, 1); assert.strictEqual(rec.files[0].name, FILE_NAME);
  assert.strictEqual(rec.si.route, 'book', rec.si.why); assert.strictEqual(rec.si.job.pid, 'P600'); assert.strictEqual(rec.si.sub.id, 'S9'); assert.strictEqual(rec.si.read.total, 3150);
  /* ONE log line, with the outcome */
  assert.strictEqual(r.logs.length, 1, JSON.stringify(r.logs)); const L = JSON.parse(r.logs[0].replace(/^\[bid-inbox\] /, ''));
  assert.strictEqual(L.inbox, 'invoices'); assert.strictEqual(L.stored, true); assert.match(L.outcome, /saved: sub invoice on job Church St Flooring/);
  /* 📬 Mail received (the inbox's private table, not gc_kv) */
  const recv = W.kv(BI._test.KV_RECV, 'gc_lead_inbox_kv'); assert.strictEqual(recv.length, 1); assert.strictEqual(recv[0].inbox, 'invoices'); assert.strictEqual(recv[0].stored, true);
  assert.strictEqual(W.kv(BI._test.KV_RECV), null, 'never in gc_kv (the anon key reads that)');
});
await t('a real history copy (delivered to mail@in) is still the history, never an invoice', async () => {
  const W = world({ headers: JOURNAL, messageId: '<hist1@mail.gmail.com>' });
  const evt = hook(W); evt.data.to = ['mail@in.grayco-cs.com']; W.full.to = ['mail@in.grayco-cs.com']; W.full.headers.to = 'billing@bestwayfloor.test'; delete W.full.headers['list-id']; delete W.full.headers['mailing-list']; W.full.subject = evt.data.subject = 'Re: schedule';
  const r = await background(W, evt);
  assert.strictEqual(r.body.inbox, 'history', JSON.stringify(r.body)); assert.strictEqual(W.kv('gc_mail_money'), null);
  const C = require(FN + '/_lib/comms.js');
  assert.strictEqual(C.isJournal({ headers: JOURNAL }, { to: ['leads@in.grayco-cs.com'] }, ['leads@in.grayco-cs.com']), false, 'a group copy to leads@in is the lead inbox\'s');
  assert.strictEqual(C.isJournal({ headers: JOURNAL }, { to: ['mail@in.grayco-cs.com'] }, ['mail@in.grayco-cs.com']), true);
  assert.strictEqual(C.isJournal({ headers: JOURNAL }, {}, ['someone@x.test']), true, 'no envelope: the header still counts');
});
await t('the routing rule\'s mail@in copy of the SAME invoice e-mail is kept once (Message-ID)', async () => {
  const W = world({ headers: JOURNAL });
  await background(W, hook(W));
  const evt = hook(W); evt.data.email_id = 'e5b1c0de-0000-4000-8000-0000000000aa'; evt.data.to = ['mail@in.grayco-cs.com'];
  const r = await background(W, evt);
  assert.strictEqual(r.body.already, true, JSON.stringify(r.body)); assert.strictEqual(W.kv('gc_mail_money').length, 1);
});
await t('Resend\'s attachment list fails → each attachment is fetched by its id (the PDF is not lost)', async () => {
  const W = world({ noAttApi: true, headers: JOURNAL });
  const r = await background(W, hook(W));
  assert.strictEqual(r.body.files, 1, JSON.stringify(r.body)); assert.ok(W.calls.some(c => /attachments\/att_1$/.test(c)));
});
await t('an ignored e-mail still logs ONE line saying why, and 📬 lists it with ↻ run again', async () => {
  const W = world({ attachments: [] , messageId: '<noatt@mail.gmail.com>' });
  W.full.text = 'see you tomorrow'; W.full.html = '';
  const evt = hook(W); evt.data.attachments = [];
  const of = W.fetchImpl; W.fetchImpl = async (u, o) => /attachments/.test(String(u)) ? { ok: true, status: 200, json: async () => ({ data: [] }) } : of(u, o);
  const r = await background(W, evt);
  assert.strictEqual(r.logs.length, 1); assert.match(r.logs[0], /"stored":false/); assert.match(r.logs[0], /ignored: no invoice attached/);
  const row = W.kv(BI._test.KV_RECV, 'gc_lead_inbox_kv')[0]; assert.strictEqual(row.retry, true); assert.match(row.what, /^ignored: /);
});
await t('re-forward of the same PDF: blocked as "same file" only while the first copy is live; a set-aside one never blocks', async () => {
  const W = world({ headers: JOURNAL });
  await background(W, hook(W));
  const W2id = 'e5b1c0de-0000-4000-8000-000000000002';
  const again = async () => { const of = W.fetchImpl; const evt = hook(W); evt.data.email_id = W2id; evt.data.message_id = '<CAFwd0002@mail.gmail.com>'; W.full.message_id = '<CAFwd0002@mail.gmail.com>'; W.full.headers['message-id'] = '<CAFwd0002@mail.gmail.com>'; return background(W, evt); };
  let r = await again();
  assert.strictEqual(r.body.already, true); assert.ok(r.body.sameFileAs); assert.strictEqual(W.kv('gc_mail_money').length, 1);
  W.tables.gc_kv.gc_mail_money_done = { key: 'gc_mail_money_done', value: { [r.body.sameFileAs]: { done: true, skip: true, at: '2026-10-27T21:30:00Z' } }, updated_at: 'x' };
  r = await again();
  assert.ok(!r.body.already, JSON.stringify(r.body)); assert.strictEqual(W.kv('gc_mail_money').length, 2); assert.strictEqual(r.body.route, 'book', r.body.why);
});
await t('↻ Run again (?mailrecv=1): office only; a dropped invoice is read again from Resend and stored', async () => {
  const W = world({ headers: JOURNAL });
  /* the production drop, as the 📬 list would show it */
  W.tables.gc_lead_inbox_kv[BI._test.KV_RECV] = { key: BI._test.KV_RECV, value: [{ id: W.EMAIL_ID, eid: W.EMAIL_ID, at: '2026-10-27T21:05:24.000Z', inbox: 'invoices', from: 'office@grayco-cs.com', to: ['invoices@in.grayco-cs.com'], subject: W.full.subject, what: 'ignored: taken for an e-mail-history copy and thrown away (newsletter)', stored: false, retry: true }], updated_at: 'a' };
  delete process.env.URL;
  let r = await handler(W, { queryStringParameters: { mailrecv: '1' }, headers: { authorization: 'Bearer tok-field' } });
  assert.strictEqual(r.status, 403);
  r = await handler(W, { queryStringParameters: { mailrecv: '1' }, headers: { authorization: 'Bearer tok-office' } });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.rows.length, 1);
  r = await handler(W, { httpMethod: 'POST', queryStringParameters: { mailrecv: '1' }, headers: { authorization: 'Bearer tok-office' }, body: JSON.stringify({ op: 'rerun', id: W.EMAIL_ID }) });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.outcome, /saved: sub invoice on job Church St Flooring/);
  assert.strictEqual(W.kv('gc_mail_money').length, 1);
  const row = W.kv(BI._test.KV_RECV, 'gc_lead_inbox_kv').find(x => x.id === W.EMAIL_ID); assert.strictEqual(row.stored, true); assert.strictEqual(row.reruns, 1);
  assert.strictEqual(r.logs.length, 1);
});
await t('📬 keeps the newest 50 only', async () => {
  const W = world({ headers: JOURNAL });
  W.tables.gc_lead_inbox_kv[BI._test.KV_RECV] = { key: BI._test.KV_RECV, value: Array.from({ length: 50 }, (_, i) => ({ id: 'old' + i, at: '2026-10-01T00:00:00Z' })), updated_at: 'a' };
  await background(W, hook(W));
  const l = W.kv(BI._test.KV_RECV, 'gc_lead_inbox_kv'); assert.strictEqual(l.length, 50); assert.strictEqual(l[49].id, W.EMAIL_ID); assert.strictEqual(l[0].id, 'old1');
});

console.log(passed + ' passed');
