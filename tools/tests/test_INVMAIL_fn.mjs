/* patch INVMAIL tests (server): node tools/tests/test_INVMAIL_fn.mjs — made-up subs, suppliers, jobs and e-mails only; Supabase, storage,
   Resend and Gmail are all mocked at fetch() (nothing leaves the computer).
   Owner 11/13: "all emails for invoices — make sure to read Nick, Wesley and office, and don't miss: if someone were to send me and Nick
   an invoice and not invoices@ or office@ then it shouldn't miss the invoice."
     · the detector: invoice / statement / receipt / newsletter / GrayCo's own / CRM-sent / bid / uncertain
     · an invoice to wjohnson@ ONLY (the routing copy to invoicecopy@in) → the invoices@ intake (sub invoice, its file, the job)
     · ONE invoice to wjohnson@ + nthomas@ + invoices@ — the invoices@ delivery, the routing copy, the history copy, and the Gmail sync
       of both mailboxes (Message-ID written two ways) → ONE record that notes every mailbox it came to
     · the same invoice (vendor + invoice # + amount) sent separately to office@ (another Message-ID) and invoices@ → ONE record
     · GrayCo's own outgoing invoice / a CRM-sent invoice / a newsletter → nothing kept, not even logged
     · a supplier's statement with a PDF → caught;  a receipt → the receipts flow (kind receipt)
     · uncertain → 📥 Possible invoices (GET ?invmail=1); ✓ It's an invoice → the intake with its stored file; the sender is remembered
       (the next one goes straight in); ✕ Not an invoice → remembered (the next one is ignored); a PM is refused
     · the history copy (mail@in) of an invoice to nthomas@ → still job history AND the invoice
     · 📭: the mailboxes are "not seen" until mail from them arrives; the Gmail sync marks them seen too */
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { W, kv, money, mailLog, resend, deliver, call, gmail, sync, pdf, file, DATA, INV, STMT, OWN, UNSURE, UNSURE2, RCPT, BIDDOC, BI, IM, MB, MM, COPY, FN } from './invmail_world.mjs';

let passed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); process.exitCode = 1; } }

console.log('INVMAIL');
const ctx = { data: DATA, senders: {}, threads: {} };
const D = o => IM.detect(Object.assign({ from: { email: 'x@y.test', name: '' }, subject: '', text: '', html: '', files: [], headers: {} }, o), ctx);

await t('detector: an invoice / a statement / a receipt / maybe; never GrayCo\'s own, the CRM\'s, a newsletter or a bid', () => {
  assert.strictEqual(D({ from: { email: 'casey@ridgelineroof.test', name: 'Casey' }, subject: 'Invoice RR-4001 - 8382 Laurett Cove', files: [file('RR-4001.pdf', INV)] }).verdict, 'invoice');
  assert.strictEqual(D({ from: { email: 'billing@brickyard.test' }, subject: 'Monthly statement - October', files: [file('Statement_Oct.pdf', STMT)] }).verdict, 'invoice');
  assert.strictEqual(D({ from: { email: 'billing@brickyard.test' }, subject: 'Your receipt from Memphis Brick Yard #55312', files: [file('receipt-55312.pdf', RCPT)] }).verdict, 'receipt');
  assert.strictEqual(D({ from: { email: 'jo@newcrew.test' }, subject: 'Hollis job paperwork', files: [file('Hollis-0412.pdf', UNSURE)] }).verdict, 'maybe');
  const own = D({ from: { email: 'wjohnson@grayco-cs.com', name: 'Wesley' }, subject: 'Invoice 1043 - GrayCo Construction', files: [file('Invoice_1043.pdf', OWN)] });
  assert.strictEqual(own.verdict, 'ignore'); assert.match(own.why, /own e-mail/);
  assert.match(D({ from: { email: 'billing@grayco-cs.com' }, subject: 'Invoice 1044 from GrayCo', headers: { 'x-grayco-crm': '1' }, files: [file('Invoice_1044.pdf', OWN)] }).why, /CRM/);
  const nl = D({ from: { email: 'news@roofsupplyco.test', name: 'Roof Supply Co' }, subject: 'Fall savings — lower your bill, past due specials inside', text: 'Shop now. $19.99 shingles. Unsubscribe', headers: { 'list-unsubscribe': '<mailto:u@roofsupplyco.test>' } });
  assert.strictEqual(nl.verdict, 'ignore'); assert.match(nl.why, /newsletter/);
  assert.match(D({ from: { email: 'invites@buildingconnected.test' }, subject: 'Invitation to Bid: Oakview Elementary Reroof', files: [file('ITB.pdf', BIDDOC)] }).why, /bid/);
  assert.strictEqual(D({ from: { email: 'mom@family.test' }, subject: 'Dinner Sunday?', text: 'bring the kids' }).verdict, 'ignore');
  /* a forwarded sub invoice from a GrayCo person counts (the sub is the forwarded From:) */
  assert.strictEqual(D({ from: { email: 'nthomas@grayco-cs.com', name: 'Nick' }, subject: 'Fwd: Invoice RR-4001', text: 'pls pay\n---------- Forwarded message ---------\nFrom: Casey <casey@ridgelineroof.test>\nSubject: Invoice RR-4001\n', files: [file('RR-4001.pdf', INV)] }).verdict, 'invoice');
});

await t('an invoice e-mailed to wjohnson@ ONLY (Google\'s copy to invoicecopy@in) → the invoices@ intake: the sub invoice, its PDF, the job', async () => {
  const r = await deliver(resend({ envelope: COPY, from: 'Casey Ortiz <casey@ridgelineroof.test>', toHdr: ['wjohnson@grayco-cs.com'], subject: 'Invoice RR-4001 - 8382 Laurett Cove', mid: '<rr4001@ridgeline.test>',
    text: 'Wesley, invoice attached. Thanks', files: [file('RR-4001.pdf', INV)] }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.inbox, 'mailbox-copy'); assert.strictEqual(r.body.invmail, 'invoice', JSON.stringify(r.body));
  const l = money(); assert.strictEqual(l.length, 1);
  const rec = l[0];
  assert.strictEqual(rec.kind, 'sub_invoice'); assert.strictEqual(rec.via, 'wjohnson@grayco-cs.com (mailbox copy)'); assert.deepStrictEqual(rec.cameTo, ['wjohnson@grayco-cs.com']);
  assert.strictEqual(rec.files.length, 1); assert.ok(rec.files[0].ref); assert.strictEqual(rec.si.route, 'book', rec.si.why); assert.strictEqual(rec.si.job.pid, 'P1'); assert.strictEqual(rec.si.sub.id, 'S1'); assert.strictEqual(rec.si.read.total, 8400);
  assert.ok(mailLog().some(x => /invoice \(Wesley/.test(x.what)), 'the Email Center notes it');
  const s1 = kv(IM.KV_SEEN, 'gc_lead_inbox_kv'); assert.ok(s1['wjohnson@grayco-cs.com'] && s1['wjohnson@grayco-cs.com'].copy, JSON.stringify(s1));
});

await t('ONE invoice to wjohnson@ + nthomas@ + invoices@ (invoices@ delivery, routing copy, history copy, Gmail sync of both mailboxes) → ONE record', async () => {
  const base = { from: 'Delta Demo <casey@ridgelineroof.test>', toHdr: ['wjohnson@grayco-cs.com', 'nthomas@grayco-cs.com', 'invoices@grayco-cs.com'], subject: 'Invoice RR-4002 - 123 Senatobia Dr', mid: '<rr4002@ridgeline.test>',
    text: 'Invoice attached.', files: [file('Invoice RR-4002.pdf', pdf(['RIDGELINE ROOFING', 'Invoice #: RR-4002', 'Job: 123 Senatobia Dr, Hernando MS', 'Total Due: $2,100.00']))] };
  const before = money().length;
  let r = await deliver(resend(Object.assign({}, base, { envelope: COPY })));
  assert.strictEqual(r.body.invmail, 'invoice', JSON.stringify(r.body));
  r = await deliver(resend(Object.assign({}, base, { envelope: ['invoices@in.grayco-cs.com'], headers: { 'list-id': '<invoices.grayco-cs.com>' }, midResend: 'rr4002@ridgeline.test' })));   /* Resend wrote the Message-ID without < > */
  assert.strictEqual(r.body.inbox, 'sub-invoices'); assert.strictEqual(r.body.already, true, JSON.stringify(r.body));
  r = await deliver(resend(Object.assign({}, base, { envelope: ['mail@in.grayco-cs.com'], headers: { 'x-grayco-journal': '1' } })));
  assert.ok(r.body.inbox === 'sub-invoices' || r.body.inbox === 'history', JSON.stringify(r.body));
  const w = await sync('wjohnson@grayco-cs.com', [gmail('wjohnson@grayco-cs.com', 'gw1', base)]);
  const n2 = await sync('nthomas@grayco-cs.com', [gmail('nthomas@grayco-cs.com', 'gn1', base)]);
  assert.strictEqual(w.n, 1); assert.strictEqual(n2.n, 1);
  const l = money(); assert.strictEqual(l.length, before + 1, JSON.stringify(l.map(x => [x.id, x.via, x.subject])));
  const rec = l.find(x => /RR-4002/.test(x.subject));
  ['wjohnson@grayco-cs.com', 'nthomas@grayco-cs.com', 'invoices@grayco-cs.com'].forEach(e => assert.ok(rec.cameTo.includes(e), e + ' in ' + JSON.stringify(rec.cameTo)));
  assert.ok(rec.vias.includes('invoices@') && rec.vias.includes('wjohnson@grayco-cs.com mailbox') && rec.vias.includes('nthomas@grayco-cs.com mailbox'), JSON.stringify(rec.vias));
  const q = kv(MB.QKEY); assert.ok(q.every(x => x.done), JSON.stringify(q));
  const seen = kv(IM.KV_SEEN, 'gc_lead_inbox_kv'); assert.ok(seen['nthomas@grayco-cs.com'].gmail && seen['wjohnson@grayco-cs.com'].gmail);
});

await t('the same invoice (vendor + invoice # + amount) sent separately to office@ and to invoices@ (two Message-IDs) → ONE record', async () => {
  const before = money().length;
  const mk = mid => ({ from: 'Tom Eubanks Lumber <ar@eubankslumber.test>', subject: 'Invoice 4471 - PO A101', mid, text: 'Invoice attached',
    files: [file('4471.pdf', pdf(['TOM EUBANKS LUMBER', 'Invoice #: 4471', 'Invoice Date: 11/11/2026', 'PO A101', '2x6 treated   $412.50', 'Total Due: $412.50']))] });
  await sync('office@grayco-cs.com', [gmail('office@grayco-cs.com', 'go1', Object.assign(mk('<eub-a@lumber.test>'), { toHdr: ['office@grayco-cs.com'] }))]);
  const r = await deliver(resend(Object.assign(mk('<eub-b@lumber.test>'), { envelope: ['invoices@in.grayco-cs.com'], toHdr: ['invoices@grayco-cs.com'], files: [file('4471-copy.pdf', pdf(['TOM EUBANKS LUMBER', 'Invoice #: 4471', 'Invoice Date: 11/11/2026', 'PO A101', 'Total Due: $412.50', 'reprint']))] })));
  assert.strictEqual(r.body.already, true, JSON.stringify(r.body)); assert.ok(r.body.sameInvoiceAs || r.body.sameAs);
  const l = money(); assert.strictEqual(l.length, before + 1);
  const rec = l.find(x => /4471/.test(x.subject)); assert.ok(rec.cameTo.includes('office@grayco-cs.com') && rec.cameTo.includes('invoices@grayco-cs.com'), JSON.stringify(rec.cameTo));
  assert.strictEqual(rec.si.payee, 'supplier');
});

await t('GrayCo\'s own outgoing invoice, a CRM-sent invoice and a newsletter → nothing kept, nothing logged', async () => {
  const before = money().length, logN = mailLog().length, maybeN = (kv(IM.KV_MAYBE, 'gc_lead_inbox_kv') || []).length;
  let r = await deliver(resend({ envelope: COPY, from: 'Wesley Demo <wjohnson@grayco-cs.com>', toHdr: ['lou@brent.test'], cc: ['nthomas@grayco-cs.com'], subject: 'Invoice 1043 - GrayCo Construction', mid: '<own1043@grayco-cs.com>', files: [file('Invoice_1043.pdf', OWN)] }));
  assert.strictEqual(r.body.invmail, 'ignore'); assert.match(r.body.ignored, /own e-mail/);
  r = await deliver(resend({ envelope: COPY, from: 'GrayCo Billing <billing@grayco-cs.com>', toHdr: ['office@grayco-cs.com'], subject: 'Invoice 1044 from GrayCo Construction', mid: '<crm1044@grayco-cs.com>', headers: { 'x-grayco-crm': '1' }, files: [file('Invoice_1044.pdf', OWN)] }));
  assert.match(r.body.ignored, /CRM/);
  r = await deliver(resend({ envelope: COPY, from: 'Roof Supply Co <news@roofsupplyco.test>', toHdr: ['nthomas@grayco-cs.com'], subject: 'Fall savings — lower your bill, past due specials inside', mid: '<nl1@roofsupplyco.test>', text: 'Shop now. $19.99 shingles.', headers: { 'list-unsubscribe': '<mailto:u@roofsupplyco.test>', precedence: 'bulk' } }));
  assert.match(r.body.ignored, /newsletter/);
  /* the Gmail sync never even fetches GrayCo's own mail */
  const g = await sync('nthomas@grayco-cs.com', [gmail('nthomas@grayco-cs.com', 'gown', { from: 'Wesley Demo <wjohnson@grayco-cs.com>', toHdr: ['lou@brent.test'], cc: ['nthomas@grayco-cs.com'], subject: 'Invoice 1043 - GrayCo Construction', mid: '<own1043@grayco-cs.com>', files: [file('Invoice_1043.pdf', OWN)] })]);
  assert.strictEqual(g.n, 0);
  assert.strictEqual(money().length, before); assert.strictEqual(mailLog().length, logN, 'not logged (X9 rule: other mail is thrown away unseen)');
  assert.strictEqual((kv(IM.KV_MAYBE, 'gc_lead_inbox_kv') || []).length, maybeN);
});

await t('a supplier\'s statement with a PDF (to office@) → caught; a receipt (to wjohnson@) → the receipts flow; a bid invitation → left alone', async () => {
  let r = await deliver(resend({ envelope: COPY, from: 'Memphis Brick Yard <billing@brickyard.test>', toHdr: ['office@grayco-cs.com'], subject: 'Monthly statement - October', mid: '<stmt-oct@brickyard.test>', text: 'Your statement is attached.', files: [file('Statement_Oct.pdf', STMT)] }));
  assert.strictEqual(r.body.invmail, 'invoice', JSON.stringify(r.body));
  const st = money().find(x => /statement/i.test(x.subject)); assert.ok(st && st.kind === 'sub_invoice' && st.files.length === 1); assert.ok(st.cameTo.includes('office@grayco-cs.com'));
  r = await deliver(resend({ envelope: COPY, from: 'Memphis Brick Yard <billing@brickyard.test>', toHdr: ['wjohnson@grayco-cs.com'], subject: 'Your receipt from Memphis Brick Yard #55312', mid: '<rcpt55312@brickyard.test>', files: [file('receipt-55312.pdf', RCPT)] }));
  assert.strictEqual(r.body.invmail, 'receipt', JSON.stringify(r.body));
  const rc = money().find(x => /55312/.test(x.subject)); assert.strictEqual(rc.kind, 'receipt'); assert.strictEqual(rc.via, 'wjohnson@grayco-cs.com (mailbox copy)');
  const leadsBefore = JSON.stringify(kv('gc_lead_inbox', 'gc_lead_inbox_kv'));
  r = await deliver(resend({ envelope: COPY, from: 'BuildingConnected <invites@buildingconnected.test>', toHdr: ['wjohnson@grayco-cs.com'], subject: 'Invitation to Bid: Oakview Elementary Reroof', mid: '<itb1@bc.test>', files: [file('ITB.pdf', BIDDOC)] }));
  assert.match(r.body.ignored, /bid/); assert.strictEqual(JSON.stringify(kv('gc_lead_inbox', 'gc_lead_inbox_kv')), leadsBefore, 'the copy never makes a lead (bids@ / leads@ do)');
});

await t('uncertain → 📥 Possible invoices; ✓ It\'s an invoice → the intake with the stored file, sender remembered; ✕ Not → remembered; a PM is refused', async () => {
  const before = money().length;
  let r = await deliver(resend({ envelope: COPY, from: 'Jo New <jo@newcrew.test>', toHdr: ['wjohnson@grayco-cs.com', 'nthomas@grayco-cs.com'], subject: 'Hollis job paperwork', mid: '<jo1@newcrew.test>', text: 'Here is what we discussed.', files: [file('Hollis-0412.pdf', UNSURE)] }));
  assert.strictEqual(r.body.invmail, 'maybe', JSON.stringify(r.body));
  r = await deliver(resend({ envelope: COPY, from: 'Sam Other <sam@othercrew.test>', toHdr: ['office@grayco-cs.com'], subject: 'Paperwork for 123 Senatobia', mid: '<sam1@othercrew.test>', text: 'see attached', files: [file('senatobia.pdf', UNSURE2)] }));
  assert.strictEqual(r.body.invmail, 'maybe');
  assert.strictEqual(money().length, before, 'nothing in the intake yet');
  assert.strictEqual((await call('tok-pm', 'GET')).status, 403);
  let g = await call('tok-office', 'GET');
  assert.strictEqual(g.status, 200, JSON.stringify(g.body));
  const jo = g.body.items.find(x => x.from === 'jo@newcrew.test'), sam = g.body.items.find(x => x.from === 'sam@othercrew.test');
  assert.ok(jo && sam && jo.status === 'open' && jo.files.length === 1 && jo.cameTo.length === 2, JSON.stringify(g.body.items));
  assert.ok(g.body.boxes.map(b => b.label).join() === 'Wesley,Nick,office@'); assert.strictEqual(g.body.gmailReading, false);
  assert.ok(g.body.caught.some(x => /RR-4002/.test(x.subject) && x.cameTo.includes('nthomas@grayco-cs.com')), 'the invoices caught from those mailboxes are listed');
  /* ✓ It's an invoice */
  let p = await call('tok-office', 'POST', { op: 'yes', id: jo.id });
  assert.strictEqual(p.status, 200, JSON.stringify(p.body)); assert.ok(p.body.mmId);
  const rec = money().find(x => x.id === p.body.mmId); assert.ok(rec && rec.kind === 'sub_invoice' && rec.files.length === 1 && rec.si.read.total === 450, JSON.stringify(rec && rec.si && rec.si.read));
  assert.ok(rec.cameTo.includes('wjohnson@grayco-cs.com') && rec.cameTo.includes('nthomas@grayco-cs.com'));
  assert.strictEqual(kv(IM.KV_SENDERS, 'gc_lead_inbox_kv')['jo@newcrew.test'].a, 'invoice');
  /* ✕ Not an invoice */
  p = await call('tok-office', 'POST', { op: 'no', id: sam.id }); assert.strictEqual(p.status, 200);
  assert.strictEqual(kv(IM.KV_SENDERS, 'gc_lead_inbox_kv')['sam@othercrew.test'].a, 'not');
  g = await call('tok-office', 'GET'); assert.ok(!g.body.items.some(x => x.status === 'open'), 'nothing open');
  /* the next ones from the same senders: Jo → straight into the intake, Sam → ignored */
  r = await deliver(resend({ envelope: COPY, from: 'Jo New <jo@newcrew.test>', toHdr: ['nthomas@grayco-cs.com'], subject: 'Hollis job paperwork wk 2', mid: '<jo2@newcrew.test>', text: 'week 2', files: [file('Hollis-0419.pdf', UNSURE2)] }));
  assert.strictEqual(r.body.invmail, 'invoice', JSON.stringify(r.body));
  r = await deliver(resend({ envelope: COPY, from: 'Sam Other <sam@othercrew.test>', toHdr: ['office@grayco-cs.com'], subject: 'More paperwork', mid: '<sam2@othercrew.test>', text: 'see attached', files: [file('senatobia2.pdf', UNSURE)] }));
  assert.strictEqual(r.body.invmail, 'ignore'); assert.match(r.body.ignored, /does not send invoices/);
  /* a PM cannot answer */
  assert.strictEqual((await call('tok-pm', 'POST', { op: 'yes', id: sam.id })).status, 403);
});

await t('the history copy (mail@in) of an invoice to nthomas@ only → the job history keeps it AND it is in the invoice intake', async () => {
  const before = money().length;
  const r = await deliver(resend({ envelope: ['mail@in.grayco-cs.com'], headers: { 'x-grayco-journal': '1' }, from: 'Casey Ortiz <casey@ridgelineroof.test>', toHdr: ['nthomas@grayco-cs.com'], subject: 'Invoice RR-4003 - 8382 Laurett Cove', mid: '<rr4003@ridgeline.test>',
    text: 'Nick, invoice attached.', files: [file('RR-4003.pdf', pdf(['RIDGELINE ROOFING', 'Invoice #: RR-4003', 'Job Site: 8382 Laurett Cove', 'Total Due: $640.00']))] }));
  assert.strictEqual(r.body.inbox, 'history', JSON.stringify(r.body)); assert.strictEqual(r.body.invmail.invmail, 'invoice', JSON.stringify(r.body.invmail));
  const l = money(); assert.strictEqual(l.length, before + 1); const rec = l.find(x => /RR-4003/.test(x.subject)); assert.strictEqual(rec.via, 'nthomas@grayco-cs.com (e-mail history copy)');
});

await t('📭 not connected: a fresh install has seen none of the mailboxes; the ping says where they are read (yes / no only)', async () => {
  const keep = W.tables.gc_lead_inbox_kv[IM.KV_SEEN]; delete W.tables.gc_lead_inbox_kv[IM.KV_SEEN];
  const g = await call('tok-owner', 'GET'); assert.strictEqual(g.status, 200); assert.deepStrictEqual(g.body.seen, {});
  W.tables.gc_lead_inbox_kv[IM.KV_SEEN] = keep;
  BI._test.resetKvTable();
  const p = await BI.handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { ping: '1' } }); const b = JSON.parse(p.body);
  assert.deepStrictEqual(b.invoiceMailboxes, ['wjohnson@grayco-cs.com', 'nthomas@grayco-cs.com', 'office@grayco-cs.com']); assert.strictEqual(b.gmailReading, false); assert.deepStrictEqual(b.invoiceCopyTo, COPY);
  assert.ok(!/secret|re_test|sb_secret/.test(p.body));
});

await t('Message-ID however it is written → one id (and the old "<x@y>" ids stay the same)', () => {
  assert.strictEqual(MM.mailId({ messageId: '<a@b>' }), MM.mailId({ messageId: 'a@b' }));
  assert.strictEqual(MM.mailId({ messageId: ' <a@b> ' }), MM.mailId({ messageId: '<a@b>' }));
  const crypto = require('crypto'); assert.strictEqual(MM.mailId({ messageId: '<a@b>' }), 'MM-' + crypto.createHash('sha256').update('<a@b>').digest('hex').slice(0, 16));
});


/* ── patch SHIPTO (owner 11/13: "match invoices from companies for job address like on ABC") ── */
const SH = require(FN + '/_lib/shipto.js');
const SIx = require(FN + '/_lib/subinv.js');
const ABC = pdf(['ABC SUPPLY CO., INC.', '1234 Industrial Dr', 'Memphis TN 38118', 'INVOICE', 'Invoice #: 7781234', 'Invoice Date: 11/10/2026', 'BILL TO', 'SHIP TO', 'GRAYCO CONSTRUCTION SERVICES', '5796 Ferguson Rd', 'Bartlett TN 38134',
  'HOLLIS RESIDENCE', '8382 Laurett Cove', 'Cordova TN 38016', 'Customer PO: HOLLIS', 'Shingles 30 sq   $3,450.00', 'Total Due: $3,450.00', 'REMIT TO: PO Box 642, Beloit WI 53512']);
await t('SHIPTO: every address with its label — GrayCo\'s own is never the job, the vendor\'s letterhead / remit-to rank last', () => {
  const c = SH.candidates(SIx.pdfText(ABC));
  const by = k => c.list.find(x => x.key === k) || {};
  assert.strictEqual(by('8382 laurett cv').label, 'ship to', JSON.stringify(c.list)); assert.strictEqual(by('8382 laurett cv').zip, '38016');
  assert.strictEqual(by('5796 ferguson rd').kind, 'ours'); assert.strictEqual(by('1234 industrial dr').kind, 'letterhead');
  const c2 = SH.candidates('Farrell-Calhoun Paint\nJob Name: Brent Kitchen\nDeliver To: 123 Senatobia Dr, Hernando MS 38632\nBill To: GrayCo, 5796 Ferguson Rd');
  assert.strictEqual(c2.list[0].label, 'deliver to'); assert.strictEqual(c2.jobName, 'Brent Kitchen');
  /* before: the reader took the FIRST address (the vendor's) */
  assert.strictEqual(SIx.parseText(SIx.pdfText(ABC), {}).jobAddress, '1234 Industrial Dr');
});
await t('SHIPTO: an ABC Supply invoice e-mailed to wjohnson@ → the job by its SHIP TO address, booked by itself ("matched by the ship to address")', async () => {
  const r = await deliver(resend({ envelope: COPY, from: 'ABC Supply AR <ar@abcsupply.test>', toHdr: ['wjohnson@grayco-cs.com'], subject: 'ABC Supply Invoice 7781234', mid: '<abc7781234@abcsupply.test>', text: 'Your invoice is attached.', files: [file('INV_7781234.pdf', ABC)] }));
  assert.strictEqual(r.body.invmail, 'invoice', JSON.stringify(r.body));
  const rec = money().find(x => /7781234/.test(x.subject));
  assert.strictEqual(rec.si.job.pid, 'P1', JSON.stringify(rec.si.job)); assert.strictEqual(rec.si.route, 'book', rec.si.why); assert.strictEqual(rec.si.payee, 'supplier');
  assert.match(rec.si.job.why, /matched by the ship to address 8382 Laurett Cove/); assert.strictEqual(rec.si.shipTo.label, 'ship to');
  assert.ok(rec.si.read.addrs.some(a => a.label === 'ship to') && !rec.si.read.addrs.some(a => /Ferguson/.test(a.address)));
});
await t('SHIPTO: the same house number + street in ANOTHER ZIP is only a suggestion (🧾 Match this invoice, one click), never booked', () => {
  const m = SIx.matchJob(DATA.projects, { jobAddress: '8382 Laurett Cove', zip: '38117', hay: '' }, []);
  assert.ok(!m.certain && m.best && m.best.pid === 'P1', JSON.stringify(m));
  assert.ok(SIx.matchJob(DATA.projects, { jobAddress: '8382 Laurett Cove', zip: '38016', hay: '' }, []).certain);
});
await t('SHIPTO: the vendor\'s usual spot is learned from its invoices already booked (a person\'s pick counts) and wins next time', async () => {
  const two = n => pdf(['DELTA PAINT SUPPLY', 'Invoice #: DP-' + n, 'SHIP TO: 8382 Laurett Cove, Cordova TN 38016', 'JOB: 123 Senatobia Dr, Hernando MS', 'Total Due: $' + (100 + n) + '.00']);
  const data = JSON.parse(JSON.stringify(DATA));
  const mk = n => ({ id: 'dp' + n, messageId: '<dp' + n + '@delta.test>', from: { email: 'billing@deltapaint.test', name: 'Delta Paint Supply' }, subject: 'Invoice DP-' + n, text: '', html: '', date: '2026-11-12T15:00:00Z', headers: {}, files: [file('DP-' + n + '.pdf', two(n))] });
  const kvs = { gc_mail_money: [] };
  const deps = { storeFile: async (b) => ({ stored: true, ref: 'sb:crm-files/' + SIx.fileHash(b) + '.pdf', hash: SIx.fileHash(b) }), kvListRead: async k => ({ list: JSON.parse(JSON.stringify(kvs[k] || [])) }),
    kvListUpdate: async (k, fn) => { const m = fn(JSON.parse(JSON.stringify(kvs[k] || []))); if (!m || !m.list) return { ok: true, unchanged: true }; kvs[k] = m.list; return { ok: true }; }, crmData: async () => data, ai: { ready: () => false } };
  const r1 = await MM.fromEmail(mk(1), 'sub_invoice', deps);
  const rec1 = kvs.gc_mail_money.find(x => x.id === r1.id);
  assert.strictEqual(rec1.si.route, 'match', 'first time: two labelled addresses = two jobs, nothing learned → a person picks'); assert.deepStrictEqual(rec1.si.top.map(x => x.pid).sort(), ['P1', 'P2']);
  /* the office booked it on Brent Kitchen (P2) instead — 🧾 Match this invoice → that job */
  data.invs = [{ id: 'INVM-1', mailId: rec1.id, type: 'supplier', pid: 'P2', amt: 101 }];
  const r2 = await MM.fromEmail(mk(2), 'sub_invoice', deps);
  const rec2 = kvs.gc_mail_money.find(x => x.id === r2.id);
  assert.strictEqual(rec2.si.job.pid, 'P2', JSON.stringify(rec2.si.job)); assert.strictEqual(rec2.si.shipTo.label, 'job'); assert.ok(rec2.si.shipTo.tpl); assert.deepStrictEqual([rec2.si.tpl.label, rec2.si.tpl.votes], ['job', 1]);
  assert.match(rec2.si.job.why, /where Delta Paint Supply prints the job/);
});
await t('SHIPTO: a dropped invoice (📥 Drop invoices) is placed by the ship-to line of its stored file', async () => {
  const ref = 'sb:crm-files/' + SIx.fileHash(ABC) + '.pdf';
  const kvs = { gc_mail_money: [] };
  const r = await MM.fromDrop([{ id: 'd1', name: 'abc.pdf', type: 'application/pdf', size: ABC.length, ref, sha: SIx.fileHash(ABC), kind: 'supplier_invoice', read: { vendor: 'ABC Supply', invoiceNumber: '7781299', total: 3450 } }],
    { kvListRead: async k => ({ list: kvs[k] || [] }), kvListUpdate: async (k, fn) => { const m = fn(kvs[k] || []); if (m && m.list) kvs[k] = m.list; return { ok: true }; }, crmData: async () => DATA, loadRef: async x => (x === ref ? ABC : null), now: Date.parse('2026-11-12T15:00:00Z') });
  const si = r.results[0].rec.si; assert.strictEqual(si.job.pid, 'P1', JSON.stringify(si.job)); assert.strictEqual(si.route, 'book', si.why); assert.strictEqual(si.shipTo.label, 'ship to');
});

console.log(passed + ' passed');
