/* patch SUBINV tests: node tools/tests/test_SUBINV.mjs — made-up subs and jobs only.
   A .docx and a PDF invoice placed by address → a received sub invoice on the job + a PENDING job cost + ✅ Approvals,
   pay date by the sub pay rule (or the invoice's later terms); low confidence → "Match this invoice"; duplicates flagged;
   a forwarded invoice; a Google link; an invoice typed in the e-mail; the office@ mailbox reader; job-cost approval routing. */
import { createRequire } from 'module';
import assert from 'assert';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
const SI = require(FN + '/_lib/subinv.js');
const MM = require(FN + '/_lib/money-mail.js');

let passed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); process.exitCode = 1; } }

/* ── fixtures: a tiny ZIP writer (for .docx / .xlsx) and a PDF with a text layer ── */
function crc32(buf){ let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function zip(entries){
  const locals = [], centrals = []; let off = 0;
  for (const [name, text] of entries) {
    const data = Buffer.from(text, 'utf8'), comp = zlib.deflateRawSync(data), nm = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, comp); centrals.push(ch, nm); off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(centrals), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat(locals.concat([cd, e]));
}
function esc(x){ return x.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function docx(paras){
  const body = paras.map(p => Array.isArray(p) ? '<w:tbl><w:tr>' + p.map(c => '<w:tc><w:p><w:r><w:t>' + esc(c) + '</w:t></w:r></w:p></w:tc>').join('') + '</w:tr></w:tbl>' : '<w:p><w:r><w:t xml:space="preserve">' + esc(p) + '</w:t></w:r></w:p>').join('');
  return zip([['[Content_Types].xml', '<?xml version="1.0"?><Types/>'], ['word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="x"><w:body>' + body + '</w:body></w:document>']]);
}
function xlsx(rows){
  const ss = [], idx = t => { let i = ss.indexOf(t); if (i < 0) { ss.push(t); i = ss.length - 1; } return i; };
  const sheet = rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((c, ci) => typeof c === 'number' ? '<c r="' + String.fromCharCode(65 + ci) + (ri + 1) + '"><v>' + c + '</v></c>' : '<c r="' + String.fromCharCode(65 + ci) + (ri + 1) + '" t="s"><v>' + idx(c) + '</v></c>').join('') + '</row>').join('');
  return zip([['xl/sharedStrings.xml', '<sst>' + ss.map(x => '<si><t>' + esc(x) + '</t></si>').join('') + '</sst>'], ['xl/worksheets/sheet1.xml', '<worksheet><sheetData>' + sheet + '</sheetData></worksheet>']]);
}
function pdf(lines){
  const content = 'BT /F1 11 Tf 50 750 Td ' + lines.map((l, i) => (i ? '0 -16 Td ' : '') + '(' + l.replace(/([()\\])/g, '\\$1') + ') Tj').join(' ') + ' ET';
  const comp = zlib.deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + comp.length + '/Filter/FlateDecode>>\nstream\n', 'latin1'), comp, Buffer.from('\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'latin1')]);
}

/* made-up CRM data */
const DATA = {
  projects: [
    { id: 'P1', name: 'Hollis Reroof', address: '8382 Laurett Cove, Cordova, TN 38016', autoPO: 'A101', pm: 'Pat Mason', client: 'Dana Hollis', status: 'Active', contract: 24000,
      subAgreements: [{ sub: 'Ridgeline Roofing', subId: 'S1', status: 'signed', retainagePct: 10, amount: 12000 }] },
    { id: 'P2', name: 'Brent Kitchen', address: '123 Senatobia Dr, Hernando, MS', autoPO: 'A102', pm: '', client: 'Lou Brent', status: 'Active' },
    { id: 'P3', name: 'Oakview Siding', address: '4410 Oakview Ln, Memphis TN', autoPO: 'A103', pm: 'Pat Mason', client: 'R. Gale', status: 'Active' },
    { id: 'P4', name: 'Oakview Gutters', address: '4418 Oakview Ln, Memphis TN', autoPO: 'A104', pm: 'Pat Mason', client: 'T. Gale', status: 'Active' }
  ],
  subs: [
    { id: 'S1', name: 'Ridgeline Roofing', contact: 'Casey Ortiz', email: 'casey@ridgelineroof.test', trade: 'Roofing' },
    { id: 'S2', name: 'Delta Gutter Co', email: 'office@deltagutter.test', trade: 'Gutters' }
  ],
  vendors: [], invs: [], invoices: [], gc_deleted_projects: []
};
function store(){
  const kv = { gc_mail_money: [] }, files = {};
  return {
    kv, files,
    deps(extra){ return Object.assign({
      storeFile: async (buf, type, name) => { const h = SI.fileHash(buf); files[h] = { type, name }; return { stored: true, ref: 'sb:crm-files/' + h + '.bin', hash: h }; },
      kvListRead: async k => ({ list: JSON.parse(JSON.stringify(kv[k] || [])), at: 'x' }),
      kvListUpdate: async (k, fn) => { const m = fn(JSON.parse(JSON.stringify(kv[k] || []))); if (!m || !m.list) return { ok: true, unchanged: true }; kv[k] = m.list; return { ok: true }; },
      crmData: async () => JSON.parse(JSON.stringify(DATA)),
      ai: { ready: () => false }, now: Date.parse('2026-10-27T15:00:00Z')
    }, extra || {}); }
  };
}
const mail = (o) => Object.assign({ id: 'm' + Math.random(), messageId: '<' + Math.random() + '@sub.test>', from: { email: 'casey@ridgelineroof.test', name: 'Casey Ortiz' }, subject: '', text: '', html: '', date: '2026-10-27T15:00:00Z', files: [], headers: {} }, o);

const DOCX = docx(['RIDGELINE ROOFING LLC', '55 Industrial Pkwy, Memphis TN', 'INVOICE', 'Invoice #: RR-2041', 'Invoice Date: 10/26/2026', 'Bill To: GrayCo Construction Services',
  'Job Site: 8382 Laurett Cove, Cordova TN', ['Tear off and replace 32 sq architectural shingles', '$9,600.00'], ['Drip edge and flashing', '$1,150.00'], 'Subtotal: $10,750.00', 'Total Due: $10,750.00', 'Terms: Net 15']);

console.log('SUBINV');
await t('reads text out of a .docx, an .xlsx and a PDF text layer', () => {
  const d = SI.docxText(DOCX); assert.match(d, /Invoice #: RR-2041/); assert.match(d, /8382 Laurett Cove/); assert.match(d, /Tear off.*\t\$9,600\.00/);
  const x = SI.xlsxText(xlsx([['Invoice', 'D-77'], ['Job', '123 Senatobia Dr'], ['Total Due', 1840.5]])); assert.match(x, /123 Senatobia Dr/); assert.match(x, /Total Due\t1840\.5/);
  const p = SI.pdfText(pdf(['DELTA GUTTER CO', 'Invoice No: 5531', 'Total Due: $2,480.00'])); assert.match(p, /Invoice No: 5531/); assert.match(p, /Total Due: \$2,480\.00/);
});
await t('parses the fields; normalizes "8382 Laurett Cove" / "Cv"', () => {
  const f = SI.parseText(SI.docxText(DOCX), { subject: '8382 Laurett Cove Invoice' });
  assert.strictEqual(f.invoiceNumber, 'RR-2041'); assert.strictEqual(f.invoiceDate, '2026-10-26'); assert.strictEqual(f.total, 10750); assert.strictEqual(f.terms.toLowerCase(), 'net 15');
  assert.strictEqual(SI.addrParts('8382 Laurett Cove').key, SI.addrParts('8382 LAURETT CV., Cordova').key);
  assert.strictEqual(f.lines.length, 2);
});
await t('pay rule: in by Wednesday → Friday of the following week; Thursday → the Friday after; later invoice terms win', () => {
  assert.strictEqual(SI.payRule('2026-10-27').payDate, '2026-11-06');   /* Tue */
  assert.strictEqual(SI.payRule('2026-10-28').payDate, '2026-11-06');   /* Wed */
  assert.strictEqual(SI.payRule('2026-10-29').payDate, '2026-11-13');   /* Thu */
  assert.strictEqual(SI.payRule('2026-11-01').payDate, '2026-11-13');   /* Sun */
  assert.strictEqual(SI.payDateFor('2026-10-27', { dueDate: '2026-11-30' }).payDate, '2026-11-30');
  assert.strictEqual(SI.payDateFor('2026-10-27', { dueDate: '2026-10-30' }).payDate, '2026-11-06');   /* earlier terms: the rule */
  assert.strictEqual(SI.payDateFor('2026-10-27', { invoiceDate: '2026-10-26', terms: 'Net 45' }).payDate, '2026-12-10');
});

const S = store();
await t('.docx invoice by address → route book, job P1, sub S1, pay date, retainage from the subcontract', async () => {
  const r = await MM.fromEmail(mail({ subject: '8382 Laurett Cove Invoice', files: [{ name: 'Ridgeline Roofing 8382 Laurett.docx', type: 'application/octet-stream', size: DOCX.length, buf: DOCX }] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'book', r.why);
  const rec = S.kv.gc_mail_money[0];
  assert.strictEqual(rec.si.job.pid, 'P1'); assert.strictEqual(rec.si.sub.id, 'S1'); assert.strictEqual(rec.si.read.total, 10750); assert.strictEqual(rec.si.read.invoiceNumber, 'RR-2041');
  assert.strictEqual(rec.si.payDate, '2026-11-10');   /* Net 15 from 10/26 is later than the rule's 11/06 */
  assert.strictEqual(rec.si.ruleDate, '2026-11-06');
  assert.strictEqual(rec.si.retainagePct, 10); assert.strictEqual(rec.si.retainage, 1075); assert.strictEqual(rec.si.net, 9675);
  assert.ok(rec.files[0].sha && /wordprocessingml/.test(rec.files[0].type));
});
const PDF2 = pdf(['DELTA GUTTER CO', 'Invoice No: 5531', 'Date: 10/27/2026', 'Project: 123 Senatobia Dr, Hernando MS', 'Seamless gutters 140 lf   $2,480.00', 'Total Due: $2,480.00']);
await t('PDF invoice by address (text layer) → book on P2; the AI reader is used when it is on', async () => {
  const r = await MM.fromEmail(mail({ from: { email: 'office@deltagutter.test', name: 'Delta Gutter' }, subject: '123 Senatobia Dr Invoice', files: [{ name: 'inv5531.pdf', type: 'application/pdf', size: PDF2.length, buf: PDF2 }] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'book', r.why);
  const rec = S.kv.gc_mail_money.find(x => x.si && x.si.read.invoiceNumber === '5531'); assert.strictEqual(rec.si.job.pid, 'P2'); assert.strictEqual(rec.si.sub.id, 'S2'); assert.strictEqual(rec.si.payDate, '2026-11-06');
  /* the same PDF through the AI path (mocked): a PDF document block is sent */
  let sent = null;
  const ai = { ready: () => true, ask: async o => { sent = o; return { ok: true, out: { isInvoice: true, weOwe: true, vendor: 'Delta Gutter Co', invoiceNumber: '5532', invoiceDate: '2026-10-27', jobAddress: '123 Senatobia Drive, Hernando MS', total: 990 } }; } };
  const S2 = store();
  const r2 = await MM.fromEmail(mail({ from: { email: 'office@deltagutter.test', name: 'Delta Gutter' }, subject: 'Invoice', files: [{ name: 'scan.pdf', type: 'application/pdf', size: 10, buf: Buffer.from('%PDF-1.4 scanned') }] }), 'sub_invoice', S2.deps({ ai }));
  assert.strictEqual(sent.content[0].type, 'document'); assert.strictEqual(r2.route, 'book', r2.why); assert.strictEqual(S2.kv.gc_mail_money[0].si.read.total, 990);
});
await t('duplicate: the same sub + invoice # again → dup (never booked twice); the same file again → already', async () => {
  const D2 = docx(['RIDGELINE ROOFING', 'Invoice #: RR-2041', 'Job Site: 8382 Laurett Cove', 'Total Due: $10,750.00']);
  const r = await MM.fromEmail(mail({ subject: 'resend: 8382 Laurett Cove Invoice', files: [{ name: 'copy.docx', type: '', size: D2.length, buf: D2 }] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'dup'); assert.match(r.why, /invoice # RR-2041/);
  const again = await MM.fromEmail(mail({ subject: 'fw', files: [{ name: 'Ridgeline.docx', type: '', size: DOCX.length, buf: DOCX }] }), 'sub_invoice', S.deps());
  assert.strictEqual(again.already, true); assert.ok(again.sameFileAs);
  /* a CRM invoice with the same amount on the same job within 30 days */
  const S3 = store(); const save = DATA.invs; DATA.invs = [{ id: 'INV9', type: 'sub', pid: 'P2', sub: 'Delta Gutter Co', amt: 2480, recvDate: '2026-10-20', status: 'received' }];
  const r3 = await MM.fromEmail(mail({ from: { email: 'office@deltagutter.test', name: 'Delta' }, subject: '123 Senatobia Dr Invoice', files: [{ name: 'i.pdf', type: 'application/pdf', size: PDF2.length, buf: PDF2 }] }), 'sub_invoice', S3.deps());
  DATA.invs = save; assert.strictEqual(r3.route, 'dup'); assert.strictEqual(S3.kv.gc_mail_money[0].si.dup.invId, 'INV9');
});
await t('low confidence (two Oakview Ln jobs, no house number) → match with the top 3; unknown sub → match', async () => {
  const D3 = docx(['Gale Remodel invoice', 'Invoice # 77', 'Work at Oakview Ln', 'Total: $500.00']);
  const r = await MM.fromEmail(mail({ subject: 'Invoice', files: [{ name: 'a.docx', type: '', size: D3.length, buf: D3 }] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'match');
  const rec = S.kv.gc_mail_money.find(x => x.si && x.si.read.invoiceNumber === '77');
  assert.ok(rec.si.top.length >= 2 && rec.si.top.length <= 3); assert.ok(rec.si.top.every(j => /Oakview/.test(j.address)));
  const D4 = docx(['Fresh Paint LLC', 'Invoice # FP-1', 'Job: 4410 Oakview Ln', 'Amount Due: $1,200.00']);
  const r4 = await MM.fromEmail(mail({ from: { email: 'bill@freshpaint.test', name: 'Fresh Paint' }, subject: 'Invoice', files: [{ name: 'fp.docx', type: '', size: D4.length, buf: D4 }] }), 'sub_invoice', S.deps());
  assert.strictEqual(r4.route, 'match'); assert.match(r4.why, /sub is not on/); assert.strictEqual(S.kv.gc_mail_money.find(x => x.si && x.si.read.invoiceNumber === 'FP-1').si.job.pid, 'P3');
});
await t('forwarded by a GrayCo person → the sub is the forwarded From:', async () => {
  const D5 = docx(['Invoice #: RR-2050', 'Job Site: 8382 Laurett Cove', 'Total Due: $640.00']);
  const r = await MM.fromEmail(mail({ from: { email: 'wjohnson@grayco-cs.com', name: 'W Johnson' }, subject: 'Fwd: 8382 Laurett Cove Invoice',
    text: 'see below\n\n---------- Forwarded message ---------\nFrom: Casey Ortiz <casey@ridgelineroof.test>\nDate: Mon, Oct 26, 2026\nSubject: 8382 Laurett Cove Invoice\nTo: office@grayco-cs.com\n',
    files: [{ name: 'Ridgeline RR-2050.docx', type: '', size: D5.length, buf: D5 }] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'book', r.why);
  const rec = S.kv.gc_mail_money.find(x => x.si && x.si.read.invoiceNumber === 'RR-2050');
  assert.strictEqual(rec.forwardedBy, 'wjohnson@grayco-cs.com'); assert.strictEqual(rec.from, 'casey@ridgelineroof.test'); assert.strictEqual(rec.si.sub.id, 'S1');
});
await t('a Google Docs link (public export) and an invoice typed in the e-mail body; an unreadable link → link', async () => {
  const f0 = async url => ({ ok: /1AAAAAAAAAAAAAAAAAAAAAAAA/.test(url), headers: { get: () => 'text/plain' }, arrayBuffer: async () => Buffer.from('Delta Gutter Co\nInvoice # 6001\n123 Senatobia Dr\nTotal Due: $300.00') });
  const r = await MM.fromEmail(mail({ from: { email: 'office@deltagutter.test', name: 'Delta' }, subject: 'Invoice', text: 'Here it is https://docs.google.com/document/d/1AAAAAAAAAAAAAAAAAAAAAAAA/edit?usp=sharing' }), 'sub_invoice', S.deps({ fetch: f0 }));
  assert.strictEqual(r.route, 'book', r.why); assert.strictEqual(S.kv.gc_mail_money.find(x => x.si && x.si.read.invoiceNumber === '6001').si.read.total, 300);
  const r2 = await MM.fromEmail(mail({ from: { email: 'office@deltagutter.test', name: 'Delta' }, subject: 'Invoice', text: 'Invoice https://docs.google.com/spreadsheets/d/1BBBBBBBBBBBBBBBBBBBBBBBBB/edit' }), 'sub_invoice', S.deps({ fetch: f0 }));
  assert.strictEqual(r2.route, 'link');
  const r3 = await MM.fromEmail(mail({ from: { email: 'office@deltagutter.test', name: 'Delta' }, subject: 'Invoice 7002 — 123 Senatobia Dr', text: 'Invoice # 7002\nGutter repair at 123 Senatobia Dr\nAmount due: $185.00\nThanks' }), 'sub_invoice', S.deps());
  assert.strictEqual(r3.route, 'book', r3.why);
});
await t('Excel invoice → read', async () => {
  const X = xlsx([['Delta Gutter Co'], ['Invoice #', 'X-9'], ['Job', '123 Senatobia Dr'], ['Total Due', '$410.00']]);
  const r = await MM.fromEmail(mail({ from: { email: 'office@deltagutter.test', name: 'Delta' }, subject: 'Invoice', files: [{ name: 'x9.xlsx', type: '', size: X.length, buf: X }] }), 'sub_invoice', S.deps());
  assert.strictEqual(r.route, 'book', r.why);
});

/* ── the office@ mailbox reader (mocked Gmail) ── */
await t('office@ mailbox: an invoice is queued, read with its attachment, filed once (no duplicate with invoices@)', async () => {
  const MB = require(FN + '/_lib/money-box.js');
  const S4 = store(); const kvq = S4.kv;
  const core = { kvListUpdate: S4.deps().kvListUpdate, kvListRead: S4.deps().kvListRead };
  const now = new Date().toISOString();
  assert.strictEqual(MB.candidate({ id: 'g1', dir: 'in', from: 'casey@ridgelineroof.test', subject: '8382 Laurett Cove Invoice', att: true, at: now }), true);
  assert.strictEqual(MB.candidate({ id: 'g2', dir: 'in', from: 'pat@grayco-cs.com', subject: 'Invoice question', att: true, at: now }), false);
  assert.strictEqual(MB.candidate({ id: 'g3', dir: 'in', from: 'x@y.test', subject: 'Lunch?', att: false, at: now }), false);
  const n = await MB.queue('office@grayco-cs.com', [{ id: 'g1', dir: 'in', from: 'casey@ridgelineroof.test', subject: '8382 Laurett Cove Invoice', att: true, at: now }, { id: 'g9', dir: 'in', from: 'casey@ridgelineroof.test', subject: 'old Invoice', att: true, at: '2026-01-01T00:00:00Z' }], { core });
  assert.strictEqual(n, 1);
  const msg = { id: 'g1', internalDate: String(Date.parse('2026-10-27T15:00:00Z')), payload: { headers: [{ name: 'From', value: 'Casey Ortiz <casey@ridgelineroof.test>' }, { name: 'Subject', value: '8382 Laurett Cove Invoice' }, { name: 'Message-ID', value: '<same-1@ridgeline>' }],
    mimeType: 'multipart/mixed', parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('Invoice attached').toString('base64url') } }, { filename: 'Central.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: { attachmentId: 'A1', size: DOCX.length } }] } };
  const G = { configured: () => true, bodyOf: require(FN + '/_lib/gmail.js').bodyOf, api: async (box, p) => /attachments/.test(p) ? { data: DOCX.toString('base64url') } : msg };
  /* money-mail is reached through moneyDeps → swap the core it reads */
  const portalPath = require.resolve(FN + '/portal.js');
  require.cache[portalPath] = { id: portalPath, filename: portalPath, loaded: true, exports: { _core: Object.assign({}, core, { kvRead: async () => JSON.parse(JSON.stringify(DATA)) }) } };
  const out = await MB.drain({ gmail: G, core, storeFile: S4.deps().storeFile });
  assert.strictEqual(out.read, 1); assert.strictEqual(out.filed[0].route, 'book', JSON.stringify(out));
  assert.strictEqual(kvq.gc_mail_money.length, 1); assert.strictEqual(kvq.gc_mail_money[0].via, 'office@grayco-cs.com mailbox');
  /* the same e-mail also reached invoices@in → already */
  const r = await MM.fromEmail(mail({ messageId: '<same-1@ridgeline>', subject: '8382 Laurett Cove Invoice', files: [{ name: 'Central.docx', type: '', size: DOCX.length, buf: DOCX }] }), 'sub_invoice', S4.deps());
  assert.strictEqual(r.already, true); assert.strictEqual(kvq.gc_mail_money.length, 1);
  assert.ok(kvq.gc_mail_money_q.every(x => x.done));
  delete require.cache[portalPath];
});

/* ── job-cost approval routing in the 7 AM digest: PM, then office after 24 h, never the admins ── */
await t('digest: sub invoice → PM + office at once (patch APOFFICE); no PM → office; an admin only when he is the PM', async () => {
  const portalPath = require.resolve(FN + '/portal.js');
  const now = Date.parse('2026-10-27T13:00:00Z');   /* a Tuesday, 8 AM Central */
  const kv = { gc_sub_approvals: [
      { invId: 'i1', status: 'pending_pm', pmName: 'Pat Mason', amt: 100, sub: 'Ridgeline', createdAt: now - 3600e3 },
      { invId: 'i2', status: 'pending_pm', pmName: 'Pat Mason', amt: 200, sub: 'Ridgeline', createdAt: now - 30 * 3600e3 },
      { invId: 'i3', status: 'pending_pm', pmName: '', amt: 300, sub: 'Delta', createdAt: now - 3600e3 },
      { invId: 'i4', status: 'pending_pm', pmName: 'Wes', amt: 400, sub: 'Delta', createdAt: now - 3600e3 }],
    gc_expense_approvals: [{ expId: 'e1', status: 'pending_pm', pm: 'Pat Mason', amount: 50, enteredAt: new Date(now - 3600e3).toISOString() }], payrollRuns: [] };
  const users = [{ name: 'Pat Mason', email: 'pat@grayco-cs.com', role: 'Project Manager' }, { name: 'Olive Office', email: 'olive@grayco-cs.com', role: 'Office' }, { name: 'Wes', email: 'wjohnson@grayco-cs.com', role: 'Admin' }];
  require.cache[portalPath] = { id: portalPath, filename: portalPath, loaded: true, exports: { _core: {
    crmData: async () => ({ users }), kvListRead: async () => ({ list: [] }), kvRead: async () => kv,
    adminEmails: () => ['wjohnson@grayco-cs.com'], officeEmails: () => ['olive@grayco-cs.com'], pushTo: async () => ({ sent: 0 }) } } };
  const mails = []; process.env.RESEND_API_KEY = 'k';
  const of = globalThis.fetch; globalThis.fetch = async (u, o) => { mails.push(JSON.parse(o.body)); return { ok: true, status: 200 }; };
  const D = require(FN + '/_lib/auto-digest.js');
  const rep = await D.run({ now });
  globalThis.fetch = of; delete require.cache[portalPath]; delete process.env.RESEND_API_KEY;
  const to = e => mails.filter(m => m.to.includes(e)).map(m => m.html).join('');
  assert.ok(rep.ok); assert.doesNotMatch(to('wjohnson@grayco-cs.com'), /\$(100|200|300|50)\.00/); assert.match(to('wjohnson@grayco-cs.com'), /\$400\.00/);   /* the admin only as that job's PM */
  assert.match(to('pat@grayco-cs.com'), /\$100\.00/); assert.match(to('pat@grayco-cs.com'), /\$200\.00/); assert.match(to('pat@grayco-cs.com'), /\$50\.00/);
  assert.match(to('olive@grayco-cs.com'), /\$200\.00/); assert.match(to('olive@grayco-cs.com'), /\$300\.00/); assert.match(to('olive@grayco-cs.com'), /\$100\.00/); assert.match(to('olive@grayco-cs.com'), /\$50\.00/);   /* patch APOFFICE: the office at once */
});

/* ── the CRM page half (index.html, patch SUBINV): run its script in a bare window ── */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = /<script id="gc-patch-subinv">([\s\S]*?)<\/script>/.exec(html);
await t('index.html carries patch SUBINV once, before patch OWNERTODO', () => {
  assert.ok(m, 'gc-patch-subinv missing');
  assert.strictEqual(html.split('id="gc-patch-subinv"').length, 2);
  assert.ok(html.indexOf('id="gc-patch-subinv"') < html.indexOf('id="gc-patch-ownertodo"'));
  assert.match(html, /W\._gcSubInv && W\._gcSubInv\.take/);
});
if (m) {
  const recs = S.kv.gc_mail_money;
  function page(me, extra){
    const inv = [], exp = [];
    const W = { _crm: { projects: DATA.projects, subs: DATA.subs, users: [{ name: 'Pat Mason', email: 'pat@grayco-cs.com', role: 'Project Manager' }, { name: 'Olive Office', email: 'olive@grayco-cs.com', role: 'Office' }, { name: 'Wes', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'Owner' }], invoices: inv, expenses: exp },
      _gcMeUser: () => me, setTimeout: (f) => 0, setInterval: () => 0, console, localStorage: { _m: {}, getItem(k){ return this._m[k] || null; }, setItem(k, v){ this._m[k] = String(v); } },
      _setInvoices: f => { const n = f(inv.slice()); inv.length = 0; n.forEach(x => inv.push(x)); }, _setExpenses: f => { const n = f(exp.slice()); exp.length = 0; n.forEach(x => exp.push(x)); },
      _gcCostRowFor: () => null, _gcOT_kv: { get: () => undefined, put: () => true } };
    Object.assign(W, extra || {});
    W.window = W; W.document = { hidden: false, getElementById: () => null, createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){}, querySelector(){ return null; } }), body: { appendChild(){} } };
    vm.runInNewContext(m[1], Object.assign(W, { window: W, document: W.document, localStorage: W.localStorage, Date, JSON, Math, Promise, String, Object, Array, isFinite, parseFloat, parseInt, RegExp }));
    return { W, inv, exp };
  }
  const book = recs.find(x => x.si && x.si.read.invoiceNumber === 'RR-2041');
  await t('page: a "book" e-mail → received sub invoice on P1 + ONE pending cost row; the pay date and retainage on it', () => {
    const { W, inv, exp } = page({ name: 'Olive Office', role: 'Office' });
    const r = W._gcSubInv.take(book, { invoices: [], expenses: [] });
    assert.ok(r.inv); const iv = r.inv;
    assert.strictEqual(iv.type, 'sub'); assert.strictEqual(iv.status, 'received'); assert.strictEqual(iv.pid, 'P1'); assert.strictEqual(iv.subId, 'S1'); assert.strictEqual(iv.amt, 10750);
    assert.strictEqual(iv.invNum, 'RR-2041'); assert.strictEqual(iv._jobCertain, true); assert.strictEqual(iv.payDate, '2026-11-10'); assert.strictEqual(iv.payDateOverride, '2026-11-10');
    assert.strictEqual(iv.retainagePct, 10); assert.strictEqual(iv.netPayable, 9675); assert.strictEqual(iv.fileData, book.files[0].ref);
    W._gcSubInv.post([iv]);
    assert.strictEqual(exp.length, 1); assert.strictEqual(exp[0].subInvId, iv.id); assert.strictEqual(exp[0].status, 'pending'); assert.strictEqual(exp[0]._fromSub, true); assert.strictEqual(exp[0].amt, 10750);
    W._gcSubInv.post([iv]); assert.strictEqual(exp.length, 1, 'never double-posted');
    assert.strictEqual(W._gcSubInv.take(book, { invoices: [iv], expenses: exp }).skip, 'already');
  });
  await t('page: "match" / "dup" / "link" e-mails are held for ✅ Approvals, not booked; picking a job books it', () => {
    const { W, inv } = page({ name: 'Olive Office', role: 'Office' });
    const held = recs.filter(x => x.si && x.si.route !== 'book');
    held.forEach(x => assert.strictEqual(W._gcSubInv.take(x, { invoices: [], expenses: [] }).hold, true));
    W._gcSubInv.load(recs, {});
    const items = W._gcSubInv.items();
    assert.ok(items.some(i => /Match this invoice/.test(i.title)) && items.some(i => /duplicate/i.test(i.title)) && items.some(i => /invoice link/i.test(i.title)));
    const mt = recs.find(x => x.si && x.si.read.invoiceNumber === 'FP-1');
    const made = W._gcSubInv.place(mt.id, { pid: 'P3', sub: 'Fresh Paint LLC' });
    assert.ok(made && made.pid === 'P3' && made._matchConfirmed === true && made.status === 'received'); assert.strictEqual(inv.length, 1);
  });
  await t('page: job-cost approvals — the PM and the office at once (patch APOFFICE), admins not asked', () => {
    const now = Date.now();
    const q = [{ invId: 'a', status: 'pending_pm', pmName: 'Pat Mason', createdAt: now - 3600e3 }, { invId: 'b', status: 'pending_pm', pmName: 'Pat Mason', createdAt: now - 30 * 3600e3 }, { invId: 'c', status: 'pending_pm', pmName: '', createdAt: now }];
    const base = () => ({ total: 3, groups: { email: [], subinv: [{ id: 'sub:' }, { id: 'sub:' }, { id: 'sub:' }], invsign: [], expense: [{ id: 'exp:x' }], other: [] }, tip: '' });
    const mk = me => { const p = page(me, { _gcApprovalSet: base }); p.W.localStorage.setItem('gc_sub_approvals', JSON.stringify(q)); p.W.localStorage.setItem('gc_expense_approvals', JSON.stringify([{ expId: 'x', status: 'pending_pm', pm: 'Pat Mason', enteredAt: new Date(now).toISOString() }, { expId: 'EXPM-INVM-1', status: 'pending_pm', pm: 'Pat Mason', enteredAt: new Date(now).toISOString() }])); p.W._crm.expenses.push({ id: 'EXPM-INVM-1', subInvId: 'INVM-1', _fromSub: true }); p.W._gcSubInv.route(); return p.W; };
    const pm = mk({ name: 'Pat Mason', role: 'Project Manager' })._gcApprovalSet(); assert.deepStrictEqual(pm.groups.subinv.map(x => x.id), ['sub:a', 'sub:b']); assert.strictEqual(pm.groups.expense.length, 1);
    const of = mk({ name: 'Olive Office', role: 'Office' })._gcApprovalSet(); assert.deepStrictEqual(of.groups.subinv.map(x => x.id).sort(), ['sub:a', 'sub:b', 'sub:c']); assert.strictEqual(of.groups.expense.length, 1);
    const ad = mk({ name: 'Wes', role: 'Admin', payType: 'Owner' })._gcApprovalSet(); assert.strictEqual(ad.groups.subinv.length, 0); assert.strictEqual(ad.groups.expense.length, 0);
    /* owner 10/27: "some job costs are definitely me or Nick because we will be the PM" — an admin who IS the job's PM is asked like any PM */
    q.push({ invId: 'w', status: 'pending_pm', pmName: 'Wes', createdAt: now - 3600e3 });
    const adPm = mk({ name: 'Wes', role: 'Admin', payType: 'Owner' })._gcApprovalSet(); assert.deepStrictEqual(adPm.groups.subinv.map(x => x.id), ['sub:w']);
  });
}
console.log(passed + ' passed' + (process.exitCode ? ' — FAILURES' : ''));
