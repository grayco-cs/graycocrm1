/* patch MONEY tests: node tools/tests/test_MONEYMAIL.mjs — made-up subs, suppliers and jobs only.
   Owner 10/30: "make sure invoices to clients and from subs go directly into invoices from email/crm when they send them to my emails".
   · a sub invoice e-mail with the CRM PO → the right sub and the PO's job (even when its text also names another job's address)
   · no PO, the job-site address matches → that job
   · no PO, no address, the sub has exactly ONE open job → that job
   · an unknown sender with nothing to place it → "match" (the office's 📥 Needs a job list), never lost
   · a duplicate (same sub + invoice #, already in ▥ Invoices / came in before) → "dup"; the same e-mail twice is kept once
   · a supplier bill → payee "supplier" (an Expense on the job, not a sub invoice), and a supplier duplicate in Expenses is caught
   · a receipt with a PO → read and placed (payee supplier, route book)
   · QuickBooks' copy of GrayCo's OWN invoice → a client invoice, never a bill; an invoice # already in the CRM → "dup"
   · the mailbox reader: office@ takes invoices / receipts / orders; any other GrayCo mailbox (owners, PMs) invoices only
   · bid-inbox ?moneymail=1: the office reads the list and marks one done; a PM is refused */
import { createRequire } from 'module';
import assert from 'assert';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
const SI = require(FN + '/_lib/subinv.js');
const MM = require(FN + '/_lib/money-mail.js');
const MB = require(FN + '/_lib/money-box.js');

let passed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); process.exitCode = 1; } }

function pdf(lines){
  const content = 'BT /F1 11 Tf 50 750 Td ' + lines.map((l, i) => (i ? '0 -16 Td ' : '') + '(' + l.replace(/([()\\])/g, '\\$1') + ') Tj').join(' ') + ' ET';
  const comp = zlib.deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + comp.length + '/Filter/FlateDecode>>\nstream\n', 'latin1'), comp, Buffer.from('\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'latin1')]);
}
const DATA = () => ({
  projects: [
    { id: 'P1', name: 'Hollis Reroof', address: '8382 Laurett Cove, Cordova, TN 38016', autoPO: 'A101', pm: 'Pat Mason', client: 'Dana Hollis', status: 'Active' },
    { id: 'P2', name: 'Brent Kitchen', address: '123 Senatobia Dr, Hernando, MS', autoPO: 'T724', pm: '', client: 'Lou Brent', status: 'Active' },
    { id: 'P3', name: 'Oakview Siding', address: '4410 Oakview Ln, Memphis TN', autoPO: 'C333', pm: 'Pat Mason', client: 'R. Gale', status: 'Active',
      subs: [{ id: 'PSB1', name: 'Delta Gutter Co', status: 'Awarded' }] },
    { id: 'P4', name: 'Old Deck', address: '77 Finished Rd, Memphis TN', autoPO: 'D404', pm: 'Pat Mason', client: 'X', status: 'completed', subs: [{ name: 'Delta Gutter Co' }] }
  ],
  subs: [
    { id: 'S1', name: 'Ridgeline Roofing', email: 'casey@ridgelineroof.test', isSub: true },
    { id: 'S2', name: 'Delta Gutter Co', email: 'office@deltagutter.test', isSub: true },
    { id: 'V1', name: 'Tom Eubanks Lumber', email: 'ar@eubankslumber.test', isSub: false, cat: 'Lumber' }
  ],
  vendors: [], invs: [], invoices: [], expenses: [], gc_deleted_projects: [],
  ccw_suppliers: [{ id: 'SUP1', n: 'Memphis Brick Yard', e: 'billing@brickyard.test', p: '', t: 'Masonry' }]
});
function store(data){
  const kv = { gc_mail_money: [] }, files = {};
  return { kv, files, data, deps(extra){ return Object.assign({
    storeFile: async (buf, type, name) => { const h = SI.fileHash(buf); files[h] = { type, name }; return { stored: true, ref: 'sb:crm-files/' + h + '.pdf', hash: h }; },
    kvListRead: async k => ({ list: JSON.parse(JSON.stringify(kv[k] || [])), at: 'x' }),
    kvListUpdate: async (k, fn) => { const m = fn(JSON.parse(JSON.stringify(kv[k] || []))); if (!m || !m.list) return { ok: true, unchanged: true }; kv[k] = m.list; return { ok: true }; },
    crmData: async () => JSON.parse(JSON.stringify(data)),
    ai: { ready: () => false }, now: Date.parse('2026-10-27T15:00:00Z')
  }, extra || {}); } };
}
let n = 0;
const mail = o => Object.assign({ id: 'm' + (++n), messageId: '<mm' + n + '@test>', from: { email: 'casey@ridgelineroof.test', name: 'Casey Ortiz' }, subject: '', text: '', html: '', date: '2026-10-27T15:00:00Z', files: [], headers: {} }, o);
const file = (name, lines) => { const b = pdf(lines); return { name, type: 'application/pdf', size: b.length, buf: b }; };

console.log('MONEYMAIL');
await t('sub invoice with the CRM PO → that sub and the PO\'s job, even when another job\'s address is in the text', async () => {
  const S = store(DATA());
  const r = await MM.fromEmail(mail({ subject: 'Invoice RR-3001', files: [file('RR-3001.pdf', ['RIDGELINE ROOFING LLC', 'Invoice #: RR-3001', 'PO #: T724', 'Ship to yard: 4410 Oakview Ln', 'Tear off and reroof   $8,000.00', 'Total Due: $8,000.00'])] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'book', r.why); assert.strictEqual(r.jobId, 'P2');
  const si = S.kv.gc_mail_money[0].si;
  assert.strictEqual(si.sub.id, 'S1'); assert.strictEqual(si.jobBy, 'po'); assert.strictEqual(si.payee, 'sub'); assert.match(si.job.why, /PO T724/);
  assert.ok(S.kv.gc_mail_money[0].files[0].ref, 'the PDF is kept'); assert.strictEqual(si.read.total, 8000);
});
await t('"PO A101" only in the e-mail body still places it', async () => {
  const S = store(DATA());
  const r = await MM.fromEmail(mail({ subject: 'Invoice 88', text: 'Attached is our invoice for PO# A101. Thanks', files: [file('inv88.pdf', ['RIDGELINE ROOFING', 'Invoice No: 88', 'Total Due: $1,200.00'])] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'book', r.why); assert.strictEqual(r.jobId, 'P1');
});
await t('no PO, the job-site address matches → that job', async () => {
  const S = store(DATA());
  const r = await MM.fromEmail(mail({ subject: 'Invoice', files: [file('invoice.pdf', ['RIDGELINE ROOFING', 'Invoice #: RR-3002', 'Job: 8382 Laurett Cv, Cordova', 'Total Due: $2,500.00'])] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'book', r.why); assert.strictEqual(r.jobId, 'P1');
  assert.strictEqual(S.kv.gc_mail_money[0].si.jobBy, 'match');
});
await t('no PO, no address: the sub\'s only OPEN job (its sub list) → that job; a finished job does not count', async () => {
  const S = store(DATA());
  const r = await MM.fromEmail(mail({ from: { email: 'office@deltagutter.test', name: 'Delta Gutter Co' }, subject: 'Invoice 5531', files: [file('5531.pdf', ['DELTA GUTTER CO', 'Invoice No: 5531', 'Seamless gutters   $2,480.00', 'Total Due: $2,480.00'])] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'book', r.why); assert.strictEqual(r.jobId, 'P3'); assert.strictEqual(S.kv.gc_mail_money[0].si.jobBy, 'sub');
});
await t('an unknown sender with nothing to place it → "match" (📥 Needs a job), kept with its file — never lost', async () => {
  const S = store(DATA());
  const r = await MM.fromEmail(mail({ from: { email: 'billing@stranger.test', name: 'Stranger Services' }, subject: 'Invoice 9', files: [file('9.pdf', ['STRANGER SERVICES', 'Invoice #: 9', 'Total Due: $640.00'])] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'match'); assert.match(r.why, /no job matched/);
  assert.strictEqual(S.kv.gc_mail_money.length, 1); assert.ok(S.kv.gc_mail_money[0].files.length);
  /* a known PO from an unknown sender is placed, but the sub is unknown → still waits for the office */
  const r2 = await MM.fromEmail(mail({ from: { email: 'billing@stranger.test', name: 'Stranger Services' }, subject: 'Invoice 10 PO A101', files: [file('10.pdf', ['STRANGER SERVICES', 'Invoice #: 10', 'Total Due: $700.00'])] }), 'sub_invoice', S.deps());
  assert.strictEqual(r2.route, 'match'); assert.match(r2.why, /not on the CRM's sub list/); assert.strictEqual(r2.jobId, 'P1');
});
await t('a duplicate is caught: same sub + invoice # already in ▥ Invoices; the same e-mail twice is kept once', async () => {
  const d = DATA(); d.invs = [{ id: 'I1', type: 'sub', sub: 'Ridgeline Roofing', subId: 'S1', invNum: 'RR-3003', amt: 900, pid: 'P1', status: 'received', recvDate: '2026-10-20' }];
  const S = store(d);
  const m = mail({ subject: 'Invoice RR-3003', files: [file('RR-3003.pdf', ['RIDGELINE ROOFING', 'Invoice #: RR-3003', 'PO: A101', 'Total Due: $900.00'])] });
  const r = await MM.fromEmail(m, 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'dup'); assert.match(r.why, /invoice # RR-3003/);
  const again = await MM.fromEmail(m, 'sub_invoice', S.deps());
  assert.strictEqual(again.already, true); assert.strictEqual(S.kv.gc_mail_money.length, 1);
});
await t('a supplier bill → payee "supplier" (an Expense, not a sub invoice), placed by PO; a supplier duplicate in Expenses is caught', async () => {
  const d = DATA(); const S = store(d);
  const r = await MM.fromEmail(mail({ from: { email: 'ar@eubankslumber.test', name: 'Tom Eubanks Lumber' }, subject: 'Invoice 4471 - PO A101', files: [file('4471.pdf', ['TOM EUBANKS LUMBER', 'Invoice #: 4471', 'Invoice Date: 10/26/2026', '2x6 treated   $412.50', 'Total Due: $412.50'])] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'book', r.why); assert.strictEqual(r.jobId, 'P1'); assert.strictEqual(S.kv.gc_mail_money[0].si.payee, 'supplier');
  /* the CRM supplier directory (ccw_suppliers) and a name like "… Supply" are suppliers too */
  assert.strictEqual(SI.payeeKind(null, 'Acme Roofing Supply'), 'supplier'); assert.strictEqual(SI.payeeKind(null, 'Ridgeline Roofing'), 'sub');
  const d2 = DATA(); d2.expenses = [{ id: 'E1', vendor: 'Tom Eubanks Lumber', amt: 412.5, date: '2026-10-26', pid: 'P1', status: 'pending' }];
  const S2 = store(d2);
  const r2 = await MM.fromEmail(mail({ from: { email: 'ar@eubankslumber.test', name: 'Tom Eubanks Lumber' }, subject: 'Invoice 4471 - PO A101', files: [file('4471b.pdf', ['TOM EUBANKS LUMBER', 'Invoice #: 4471', 'Invoice Date: 10/26/2026', 'Total Due: $412.50'])] }), 'sub_invoice', S2.deps());
  assert.strictEqual(r2.route, 'dup'); assert.match(r2.why, /already in Expenses/);
});
await t('a receipt with the PO in the subject → read and placed (payee supplier, route book)', async () => {
  const S = store(DATA());
  const r = await MM.fromEmail(mail({ from: { email: 'sbiffle@grayco-cs.com', name: 'Steven Biffle' }, subject: 'Home Depot receipt PO C333', files: [file('receipt.pdf', ['THE HOME DEPOT', 'RECEIPT', 'SUBTOTAL 100.00', 'TOTAL $108.25'])] }), 'receipt', S.deps());
  assert.strictEqual(r.kind, 'receipt'); assert.strictEqual(r.route, 'book', r.why); assert.strictEqual(r.jobId, 'P3');
  assert.strictEqual(S.kv.gc_mail_money[0].si.payee, 'supplier');
});
await t('QuickBooks\' copy of GrayCo\'s own invoice → a client invoice (never a bill); an invoice # the CRM has → "dup"', async () => {
  const d = DATA(); const S = store(d);
  const qb = o => mail(Object.assign({ from: { email: 'quickbooks@notification.intuit.com', name: 'GrayCo Construction Services' }, subject: 'Invoice 1043 from GrayCo Construction Services LLC' }, o));
  const r = await MM.fromEmail(qb({ files: [file('Invoice_1043.pdf', ['GrayCo Construction Services', 'INVOICE', 'Invoice #: 1043', 'Bill to: Lou Brent', 'Job: 123 Senatobia Dr, Hernando MS', 'Total Due: $4,800.00'])] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.kind, 'client_invoice'); assert.strictEqual(r.route, 'book', r.why); assert.strictEqual(r.jobId, 'P2');
  assert.strictEqual(S.kv.gc_mail_money[0].si.payee, 'client');
  const d2 = DATA(); d2.invs = [{ id: 'C1', type: 'client', invNum: '1044', amt: 100, pid: 'P2' }]; const S2 = store(d2);
  const r2 = await MM.fromEmail(qb({ subject: 'Invoice 1044 from GrayCo Construction Services LLC', files: [file('Invoice_1044.pdf', ['GrayCo Construction Services', 'Invoice #: 1044', 'Total Due: $100.00'])] }), 'sub_invoice', S2.deps());
  assert.strictEqual(r2.route, 'dup');
  /* a SUB's QuickBooks invoice to GrayCo stays a sub invoice */
  assert.strictEqual(SI.ownInvoice({ from: { email: 'quickbooks@notification.intuit.com', name: 'Ridgeline Roofing' }, subject: 'Invoice 55 from Ridgeline Roofing' }), false);
});
await t('mailbox reader: office@ takes invoices, receipts and orders; the owners\' / PMs\' mailboxes take invoices only', async () => {
  const added = [];
  const core = { kvListUpdate: async (k, fn) => { const m = fn([]); if (m && m.list) added.push(...m.list); return { ok: true }; } };
  const now = new Date().toISOString();
  const rows = [
    { id: 'g1', dir: 'in', from: 'casey@ridgelineroof.test', subject: 'Invoice RR-1 PO A101', att: true, at: now },
    { id: 'g2', dir: 'in', from: 'orders@homedepot.test', subject: 'Your order confirmation', att: false, at: now },
    { id: 'g3', dir: 'in', from: 'receipts@store.test', subject: 'Your receipt', att: true, at: now },
    { id: 'g4', dir: 'in', from: 'casey@ridgelineroof.test', subject: 'Invoice with no file', att: false, at: now }
  ];
  assert.strictEqual(await MB.queue('office@grayco-cs.com', rows, { core }), 4);   /* office@ also reads an invoice typed in the e-mail */
  added.length = 0;
  assert.strictEqual(await MB.queue('wjohnson@grayco-cs.com', rows, { core }), 1);
  assert.strictEqual(added[0].id, 'g1'); assert.strictEqual(added[0].invOnly, true);
  process.env.MONEY_INVOICE_ALL = '0'; added.length = 0;
  assert.strictEqual(await MB.queue('wjohnson@grayco-cs.com', rows, { core }), 0);
  delete process.env.MONEY_INVOICE_ALL;
});
await t('bid-inbox ?moneymail=1: the office reads the list and marks one done; a PM is refused', async () => {
  process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  const kv = { gc_mail_money: { value: JSON.stringify([{ id: 'MM-abcdef0123456789', kind: 'sub_invoice' }]), updated_at: '2026-10-30T01:00:00.000Z' }, gc_mail_money_done: { value: {}, updated_at: '2026-10-30T01:00:00.000Z' },
    users: { value: [{ name: 'Brittany', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { name: 'Pat', email: 'pat@grayco-cs.com', role: 'Project Manager' }], updated_at: 'x' } };
  const staff = { 'office@grayco-cs.com': 'staff', 'pat@grayco-cs.com': 'staff' };
  global.fetch = async (url, o) => {
    o = o || {}; const u = new URL(url); const m = o.method || 'GET';
    const J = (b, st) => ({ ok: (st || 200) < 300, status: st || 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => 'application/json' } });
    if (u.pathname === '/auth/v1/user') return J({ email: (o.headers.Authorization || '').replace('Bearer tok-', '') });
    if (u.pathname === '/rest/v1/gc_staff') { const e = decodeURIComponent(u.searchParams.get('email') || '').replace('eq.', ''); return J(staff[e] ? [{ email: e, role: staff[e], active: true, name: '' }] : []); }
    if (u.pathname === '/rest/v1/gc_kv') {
      const q = u.searchParams.get('key') || ''; const ks = q.startsWith('eq.') ? [q.slice(3)] : q.startsWith('in.') ? q.slice(3).replace(/[()"]/g, '').split(',') : [];
      if (m === 'GET') return J(ks.filter(k => kv[k]).map(k => ({ key: k, value: kv[k].value, updated_at: kv[k].updated_at })));
      if (m === 'PATCH') { const k = ks[0], at = (u.searchParams.get('updated_at') || '').slice(3); if (!kv[k] || kv[k].updated_at !== at) return J([]); const b = JSON.parse(o.body); kv[k] = { value: b.value, updated_at: b.updated_at }; return J([{ key: k }]); }
      return J([], 201);
    }
    return J({}, 404);
  };
  const H = require(FN + '/bid-inbox.js').handler;
  const ev = (who, method, body) => ({ httpMethod: method, queryStringParameters: { moneymail: '1' }, headers: { authorization: 'Bearer tok-' + who, origin: 'https://crm.grayco-cs.com' }, body: body ? JSON.stringify(body) : '' });
  const g = await H(ev('office@grayco-cs.com', 'GET')); assert.strictEqual(g.statusCode, 200, g.body); assert.strictEqual(JSON.parse(g.body).list.length, 1);
  const p = await H(ev('office@grayco-cs.com', 'POST', { op: 'done', id: 'MM-abcdef0123456789', val: { done: true, invId: 'INVM-x', at: '2026-10-30T02:00:00.000Z', by: 'Brittany' } }));
  assert.strictEqual(p.statusCode, 200, p.body); assert.strictEqual(kv.gc_mail_money_done.value['MM-abcdef0123456789'].invId, 'INVM-x');
  const pm = await H(ev('pat@grayco-cs.com', 'GET')); assert.strictEqual(pm.statusCode, 403);
});
console.log(passed + ' passed');
