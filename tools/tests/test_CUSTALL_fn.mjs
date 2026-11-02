// test_CUSTALL_fn.mjs — patch CUSTALL, the rule (netlify/functions/_lib/custall.js) in Node, on the records the server
// functions make: a website form / missed call / text lead (website-intake fileLead), a CompanyCam job (companycam-sync)
// and lead, a QuickBooks lead, a bid from the Lead Inbox (PlanHub / public), a careers form, a MONEY / QuickBooks invoice copy.
// The server functions do not write the Customers list themselves (the CRM page would save over it): the page adds the
// customer when the record syncs in, with an id made from the e-mail / phone, so two computers make the same record.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const CA = require('../../netlify/functions/_lib/custall.js');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
const at = '2026-10-30T12:00:00.000Z';
const base = () => [{ id: 'CU1', name: 'Hannah Brooks', phone: '901-555-0111', email: 'hannah@example.com', address: '100 Oak St, Bartlett TN' }];
const ctx = CA.ctxOf({ users: [{ name: 'Sarah Biffle', email: 'sbiffle@grayco-cs.com' }], subs: [{ name: 'Ace Drywall LLC', phone: '901-555-0300' }],
  projects: [{ id: 'PRJcc_9', client: 'Gina Camm', clientPhone: '901-555-0909', address: '9 Fern Rd' }, { id: 'P2', client: 'Rita New', clientEmail: 'rita@example.com', address: '1 Maple Ave' }] });

/* website form (fileLead's record after the Lead Inbox makes it a CRM lead) */
const web = { id: 'LW', title: 'Kitchen remodel — Wendy Web', websiteLead: true, inboxId: 'website|1', source: 'Website (grayco-cs.com)', contact: { name: 'Wendy Web', email: 'WENDY@example.com', phone: '(901) 555-0222' }, address: '12 Vine St', leadExtra: { websiteLead: true, contactName: 'Wendy Web' } };
let u = CA.upsert(base(), 'lead', web, ctx, { at });
ok(u.action === 'new' && u.cust.name === 'Wendy Web' && u.cust.email === 'wendy@example.com' && u.id === CA.idFor({ email: 'wendy@example.com' }), 'website lead → a new customer with the hashed e-mail id', u);
const textLead = { id: 'LT', websiteLead: true, inboxId: 'website|2', source: 'Text message', contactName: 'Wendy W', phone: '9015550222' };
const u2 = CA.upsert(u.list, 'lead', textLead, ctx, { at });
ok(u2.action === 'linked' && u2.id === u.id && u2.list.length === 2, 'a text from the same phone links to her (no second customer)', u2.action);
const missed = { id: 'LM', websiteLead: true, source: 'Missed call', contactName: 'Caller', phone: '901-555-0444' };
ok(CA.upsert(base(), 'lead', missed, ctx, { at }).action === 'skip', 'a missed call with no name is skipped (no junk names)');
const careers = { id: 'LC', websiteLead: true, websiteForm: 'Careers', contact: { name: 'Joe Worker', email: 'joe@example.com' }, leadExtra: { websiteType: 'careers' } };
ok(CA.upsert(base(), 'lead', careers, ctx, { at }).action === 'skip', 'a job application is not a customer');

/* CompanyCam: the job's client; the CompanyCam lead is named after the project (a title), so its customer is the job's */
const ccJob = { id: 'PRJcc_9', name: '9 Fern Rd', client: 'Gina Camm', clientPhone: '901-555-0909', address: '9 Fern Rd', status: 'bidding', source: 'companycam' };
u = CA.upsert(base(), 'job', ccJob, ctx, { at });
ok(u.action === 'new' && u.cust.name === 'Gina Camm', 'CompanyCam job → its customer', u.action);
const ccLead = { id: 'LCC_9', name: 'Fern Rd Roof Damage', company: 'Fern Rd Roof Damage', source: 'CompanyCam', ccamId: '9', fromProjectId: 'PRJcc_9', contact: '' };
const u3 = CA.upsert(u.list, 'lead', ccLead, ctx, { at });
ok(u3.action === 'linked' && u3.cust.name === 'Gina Camm', 'the CompanyCam lead links to the job’s customer, not to its title', u3);
const ccLead2 = { id: 'LCC_8', name: 'Zoo Boardwalk', company: 'Zoo Boardwalk', source: 'CompanyCam', ccamId: '8', fromProjectId: 'PRJx', contact: '' };
ok(CA.upsert(base(), 'lead', ccLead2, ctx, { at }).action === 'skip', 'a CompanyCam lead with no person is skipped (a title is not a customer)');

/* QuickBooks lead, bids, subs, staff, tests */
ok(CA.upsert(base(), 'lead', { id: 'QB_1', name: 'Betty Martin', phone: '901-555-0500', source: 'QuickBooks' }, ctx, { at }).action === 'new', 'a QuickBooks lead adds its customer');
const bids = [{ id: 'B1', name: 'Hangar', source: 'PlanHub', contactName: 'Pat Est', company: 'Flintco LLC' },
  { id: 'B2', name: 'RFB', source: 'Lakeland Schools', leadKind: 'Government', contactName: 'Buyer' },
  { id: 'B3', name: 'Office TI', inboxId: 'x', bidRole: 'sub', gc: 'Turner', contactName: 'Turner PM', dueToCompany: 'Turner Construction', bidDue: '2026-12-01' }];
ok(bids.every(b => CA.upsert(base(), 'lead', b, ctx, { at }).action === 'skip'), 'bid leads (plan rooms, public bids, prime / sub) are skipped');
ok(CA.upsert(base(), 'job', { id: 'X1', client: 'Ace Drywall LLC' }, ctx, { at }).action === 'skip', 'a sub is not a customer');
ok(CA.upsert(base(), 'job', { id: 'X2', client: 'Sarah Biffle' }, ctx, { at }).action === 'skip', 'staff are not customers');
ok(['Thomas Family Construction LLC (Sample Customer)', 'Test', 'Cordova TN 38016,', '', 'PRJabc12345', 'Customer'].every(n => CA.upsert(base(), 'job', { id: 'X', client: n }, ctx, { at }).action === 'skip'), 'test, address, id, generic and blank names are skipped');

/* invoices: a sub's bill is skipped; a client invoice (MONEY / QuickBooks copy) goes to its job's customer */
ok(CA.upsert(base(), 'invoice', { id: 'I1', type: 'sub', sub: 'Ace Drywall LLC', client: 'Ace Drywall LLC' }, ctx, { at }).action === 'skip', 'a sub’s bill is skipped');
const ctx2 = Object.assign({}, ctx, { jobCust: { P2: 'CUSA_r' } });
u = CA.upsert(base().concat([{ id: 'CUSA_r', name: 'Rita New', email: 'rita@example.com' }]), 'invoice', { id: 'I2', pid: 'P2', type: 'client', client: 'Rita New', source: 'QuickBooks' }, ctx2, { at });
ok(/linked|filled/.test(u.action) && u.id === 'CUSA_r' && u.list.length === 2, 'a client invoice copy goes to its job’s customer (its empty address filled from the job)', u.action);

/* the match: e-mail / phone → same customer, new property; name + street; name only → check; new owner → new */
u = CA.upsert(base(), 'job', { id: 'J1', client: 'Hannah B.', clientEmail: 'Hannah@Example.com', address: '200 Lake Rd, Cordova TN' }, ctx, { at });
ok(u.action === 'filled' && u.cust.address === '100 Oak St, Bartlett TN' && u.cust.properties.length === 1 && u.cust.name === 'Hannah Brooks', 'same e-mail at a new address → same customer, a second property, nothing overwritten', u.cust);
ok(CA.upsert(u.list, 'job', { id: 'J2', client: 'Hannah Brooks', address: '200 Lake Rd' }, ctx, { at }).action === 'linked', 'same name + one of her properties → her');
ok(CA.upsert(base(), 'job', { id: 'J3', client: 'Hannah Brooks', address: '7 Other St' }, ctx, { at }).action === 'check', 'same name only → "check", not linked');
u = CA.upsert(base(), 'job', { id: 'J4', client: 'Greg Newowner', address: '100 Oak St, Bartlett TN' }, ctx, { at });
ok(u.action === 'new' && u.id !== 'CU1', 'a new owner at her old address → a new customer');
u = CA.upsert([{ id: 'C9', name: 'Dana Fox', phone: '(901) 555-0177', email: '' }], 'job', { id: 'J5', client: 'Dana Fox', clientPhone: '901.555.0177', clientEmail: 'dana@example.com' }, ctx, { at });
ok(u.action === 'filled' && u.cust.email === 'dana@example.com' && u.cust.phone === '(901) 555-0177', 'only empty fields are filled; the typed phone stays');

/* two computers at the same time: the same id, so the lists merge into one record */
const a = CA.upsert(base(), 'lead', web, ctx, { at }), b = CA.upsert(base(), 'lead', Object.assign({}, web, { id: 'LW2' }), ctx, { at: '2026-10-30T12:00:05.000Z' });
const merged = {}; a.list.concat(b.list).forEach(c => { merged[c.id] = c; });
ok(a.id === b.id && Object.keys(merged).length === 2, 'two computers adding the same person make one record (same hashed id)');
ok(CA.upsert(a.list, 'lead', web, ctx, { at }).action === 'linked', 'running it again is a no-op (idempotent)');

/* the backfill plan */
const P = CA.plan({ customers: base(), projects: [ccJob, { id: 'J3', client: 'Hannah Brooks', address: '7 Other St' }, { id: 'J0', client: 'Hannah Brooks', customerId: 'CU1' }], leads: [web, textLead, bids[0]], invs: [], users: [], subs: [] });
ok(P.tally.newCustomers === 2 && P.tally.checkCustomers === 1 && P.tally.onList === 1 && P.rows.find(r => r.name === 'Wendy Web').from.length === 2, 'the dry run: 2 new, 1 to check, 1 already linked; one row per customer with every record it came from', P.tally);
console.log(`CUSTALL_fn ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
