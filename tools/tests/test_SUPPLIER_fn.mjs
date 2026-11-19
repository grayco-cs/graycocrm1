// test_SUPPLIER_fn.mjs <build-dir> — patch SUPPLIER on the REAL subportal.js (qaa_world's in-memory Supabase; made-up data only; offline).
//   Owner (11/19): "Vendors, not subs, should also be able to have a portal and see these jobs for bid and their own jobs too."
//   · sign-up as a supplier (role 'supplier', waiting for approval, the office e-mail says supplier); a sub sign-up is unchanged
//   · before approval: no jobs; approved: ONLY jobs an admin opened for material quotes (suppliersCanQuote) — public or invited, not drafts,
//     not closed — with the material list, plans (no invitation to bid), never trade scopes / bid form / anyone's bids or quotes
//   · a material quote: line items → totals on the server; refused on a job not open for quotes; a labour bid from a supplier refused;
//     a sub cannot send a material quote; the supplier sees only their own quotes; admin sees all and accepts one; a decided quote is locked
//   · admin "users" save keeps a supplier a supplier (approve → the approval e-mail path); crm-vendors (staff only) lists vendors with tax last-4
//   · my-work: not linked → linked:false; linked (crmVendorId) → their SENT POs (gc_supplier_pos, never drafts, no GrayCo cost) and
//     supplier bills (invs type supplier) only — another vendor's never; a sub's my-work unchanged
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, TOK, ACC, putRow, rowData, rowsOf } = W;
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
W.install();
const F = W.fns(BUILD);
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud(); W.H.cset('leads', []); W.H.cset('schedule', []);
W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin' }]);
W.H.cset('projects', [{ id: 'P1', name: 'Demo School HVAC', address: '1 Demo Rd', autoPO: 'Q501', status: 'active' }, { id: 'P2', name: 'Demo Clinic', address: '2 Demo Rd', autoPO: 'Q502', status: 'active' }]);
W.H.cset('vendors', [{ id: 'V1', name: 'Demo Supply Co', email: 'sales@supply.test', taxId: '12-3456789', cat: 'HVAC equipment' }, { id: 'V2', name: 'Other Lumber', email: 'x@lumber.test' }, { id: 'S9', name: 'Demo Sub LLC', isSub: true, email: 'sub@demo.test' }]);
W.H.cset('gc_supplier_pos', [
  { id: 'PO_a', pid: 'P1', poNo: 'Q501-1', supplier: 'Demo Supply Co', vendorId: 'V1', items: [{ desc: 'RTU 10 ton', qty: 4, unit: 'ea', cost: 9000 }], cost: 36000, status: 'sent', sentAt: now },
  { id: 'PO_b', pid: 'P2', poNo: 'Q502-1', supplier: 'Demo Supply Co', vendorId: 'V1', items: [{ desc: 'Curb', qty: 2, unit: 'ea', cost: 500 }], cost: 1000, status: 'waiting' },
  { id: 'PO_c', pid: 'P2', poNo: 'Q502-2', supplier: 'Other Lumber', vendorId: 'V2', items: [{ desc: '2x4', qty: 100, unit: 'ea', cost: 4 }], status: 'sent' }]);
W.H.cset('invs', [
  { id: 'B1', type: 'supplier', supplier: 'Demo Supply Co', vendorId: 'V1', pid: 'P1', invNum: 'INV-77', amt: 36000, billDate: DAY(-10), dueDate: DAY(20), status: 'open' },
  { id: 'B2', type: 'supplier', supplier: 'Demo Supply Co', pid: 'P2', invNum: 'INV-78', amt: 1000, billDate: DAY(-40), status: 'paid', paid: true, paidDate: DAY(-5), checkNo: '1042' },
  { id: 'B3', type: 'supplier', supplier: 'Other Lumber', pid: 'P2', invNum: 'L-1', amt: 400, status: 'open' },
  { id: 'B4', type: 'sub', sub: 'Demo Supply Co', pid: 'P1', invNum: 'S-1', amt: 9, status: 'received' }]);
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true });
putRow('users', 'st_owner', { id: 'st_owner', email: 'owner@grayco-cs.com', name: 'Demo Owner', phone: '901-555-0100', role: 'admin', approved: true }, { user_id: 'st_owner', email: 'owner@grayco-cs.com' });
putRow('users', 'u_sub', { id: 'u_sub', role: 'sub', approved: true, email: 'sub@demo.test', name: 'Demo Sub', company: 'Demo Sub LLC', trades: ['HVAC'], authUserId: 'auth-sub', crmSubId: 'S9' }, { user_id: 'u_sub', email: 'sub@demo.test' });
const job = (id, x) => putRow('jobs', id, Object.assign({ id, status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(20), pmId: 'st_owner', estimatorId: 'st_owner', grayCoRole: 'gc', tradesSought: 'HVAC', createdAt: now }, x), { job_id: id });
job('J_MAT', { title: 'School HVAC (materials)', suppliersCanQuote: true, materialList: '4 RTUs 10-ton\n4 curbs', tradeScopes: [{ id: 't1', trade: 'HVAC', scope: 'LABOUR SCOPE SECRET' }],
  plans: [{ name: 'Invitation to Bid.pdf' }, { name: 'M-101 Plan.pdf' }] });
job('J_LAB', { title: 'Labour only job' });
job('J_PRIV', { title: 'Private materials job', suppliersCanQuote: true, visibility: 'private' });
job('J_DRAFT', { title: 'Draft materials job', suppliersCanQuote: true, draft: true, status: 'draft' });
job('J_CLOSED', { title: 'Closed materials job', suppliersCanQuote: true, status: 'closed' });
putRow('plans', 'J_MAT', { items: [{ name: 'Invitation to Bid.pdf', fileRef: 'staff/x/itb.pdf' }, { name: 'M-101 Plan.pdf', fileRef: 'staff/x/m.pdf' }] }, { job_id: 'J_MAT' });
putRow('bids', 'b1', { id: 'b1', jobId: 'J_MAT', userId: 'u_sub', amount: 50000, userCompany: 'Demo Sub LLC' }, { job_id: 'J_MAT', user_id: 'u_sub' });
TOK['tk-owner'] = 'owner@grayco-cs.com'; TOK['tk-sub'] = 'sub@demo.test'; TOK['tk-sup'] = 'sales@supply.test';
ACC['owner@grayco-cs.com'] = { pw: 'x', id: 'auth-owner' }; ACC['sub@demo.test'] = { pw: 'x', id: 'auth-sub' };
const call = async (tok, body) => { const r = await F.sp.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test', authorization: tok ? 'Bearer ' + tok : '', 'x-nf-client-connection-ip': '10.9.' + Math.floor(Math.random() * 200) + '.1' }, body: JSON.stringify(body) }); return { code: r.statusCode, b: JSON.parse(r.body) }; };

/* ═══ sign-up ═══ */
let r = await call('', { action: 'register', email: 'sales@supply.test', password: 'Supply-Pass-1', profile: { name: 'Sam Supply', company: 'Demo Supply Co', phone: '901-555-0199', businessCity: 'Memphis', businessState: 'TN', trades: ['HVAC equipment'], einLast4: '6789', acctType: 'supplier' } });
const supRow = rowsOf('users').find(x => x.email === 'sales@supply.test');
ok('1 sign-up as a supplier → role supplier, waiting for approval (not a sub)', r.code === 200 && supRow && supRow.data.role === 'supplier' && supRow.data.approved === false, { r, d: supRow && supRow.data });
ACC['sales@supply.test'].id = supRow.data.authUserId;
const SID = supRow.data.id;
r = await call('tk-sup', { action: 'me' });
ok('2 "me": role supplier', r.code === 200 && r.b.role === 'supplier' && r.b.user.role === 'supplier', r);
r = await call('tk-sup', { action: 'load', keys: ['jobs', 'mquotes'] });
ok('3 before approval: no jobs', r.code === 200 && r.b.data.jobs.length === 0, r.b);
/* the admin approves it (the bid site's Pending) — it stays a supplier */
r = await call('tk-owner', { action: 'load', keys: ['users'] });
const su = r.b.data.users.find(u => u.id === SID);
r = await call('tk-owner', { action: 'save', key: 'users', upsert: [Object.assign({}, su, { approved: true })] });
ok('4 admin approves → approved, still role supplier', r.code === 200 && rowData('users/' + SID).approved === true && rowData('users/' + SID).role === 'supplier', rowData('users/' + SID));

/* ═══ what the supplier sees ═══ */
r = await call('tk-sup', { action: 'load', keys: ['jobs', 'bids', 'mquotes', 'plans:J_MAT', 'plans:J_LAB', 'users'] });
const SJ = r.b.data.jobs;
ok('5 only the public, open job open for material quotes (no labour-only, private, draft or closed job)', SJ.map(j => j.id).join() === 'J_MAT', SJ.map(j => j.id));
const mj = SJ[0] || {};
ok('6 the job: material list, quotable; never the trades\' labour scopes', mj.materialList === '4 RTUs 10-ton\n4 curbs' && mj.quotable === true && !('tradeScopes' in mj) && JSON.stringify(r.b).indexOf('LABOUR SCOPE SECRET') < 0, mj);
ok('7 plans: no invitation to bid (BIDVIS); the plan; not the labour-only job\'s', r.b.data['plans:J_MAT'].map(p => p.name).join() === 'M-101 Plan.pdf' && (r.b.data['plans:J_LAB'] || []).length === 0);
ok('8 no bids (anyone\'s), no quotes yet; the PM\'s contact', r.b.data.bids.length === 0 && r.b.data.mquotes.length === 0 && r.b.data.users.some(u => u.id === 'st_owner' && u.phone));

/* ═══ a material quote ═══ */
r = await call('tk-sup', { action: 'save', key: 'mquotes', upsert: [{ id: 'mq1', jobId: 'J_MAT', lines: [{ id: 'l1', desc: 'RTU 10 ton', qty: 4, unit: 'ea', unitPrice: 9500 }, { id: 'l2', desc: 'Curb', qty: 4, unit: 'ea', unitPrice: 450.5 }, { id: 'l3', desc: '' }], tax: 100, freight: 250, leadTime: '3 weeks', validUntil: DAY(30), total: 1 }] });
const q = rowData('mquotes/mq1') || {};
ok('9 the quote is saved: 2 lines, totals from the server (38,000 + 1,802 + 100 + 250 = 40,152), submitted', r.code === 200 && q.lines.length === 2 && q.subtotal === 39802 && q.total === 40152 && q.status === 'submitted' && q.userId === SID && q.userCompany === 'Demo Supply Co', q);
r = await call('tk-sup', { action: 'save', key: 'mquotes', upsert: [{ id: 'mq2', jobId: 'J_LAB', lines: [{ desc: 'x', qty: 1, unitPrice: 1 }] }] });
ok('10 a quote on a job not open for material quotes → 403', r.code === 403 && !rowData('mquotes/mq2'), r);
r = await call('tk-sup', { action: 'save', key: 'mquotes', upsert: [{ id: 'mq3', jobId: 'J_PRIV', lines: [{ desc: 'x', qty: 1, unitPrice: 1 }] }] });
ok('11 … a private job they were not invited to → 403', r.code === 403, r);
r = await call('tk-sup', { action: 'save', key: 'bids', upsert: [{ id: 'bx', jobId: 'J_MAT', amount: 5 }] });
ok('12 a labour bid from a supplier → 403', r.code === 403 && !rowData('bids/bx'), r);
r = await call('tk-sub', { action: 'save', key: 'mquotes', upsert: [{ id: 'mq4', jobId: 'J_MAT', lines: [{ desc: 'x', qty: 1, unitPrice: 1 }] }] });
ok('13 a sub cannot send a material quote → 403', r.code === 403 && !rowData('mquotes/mq4'), r);
r = await call('tk-sub', { action: 'load', keys: ['mquotes', 'jobs'] });
ok('14 a sub sees no material quotes; the sub still sees the jobs (labour-only too)', r.b.data.mquotes.length === 0 && r.b.data.jobs.some(j => j.id === 'J_LAB') && r.b.data.jobs.some(j => j.id === 'J_MAT'));
/* another supplier's quote on the same job is never seen */
putRow('mquotes', 'mqX', { id: 'mqX', jobId: 'J_MAT', userId: 'u_other', userCompany: 'Rival Supply', total: 1 }, { job_id: 'J_MAT', user_id: 'u_other' });
r = await call('tk-sup', { action: 'load', keys: ['mquotes'] });
ok('15 the supplier sees only their own quote', r.b.data.mquotes.map(x => x.id).join() === 'mq1', r.b.data.mquotes);
r = await call('tk-owner', { action: 'load', keys: ['mquotes'] });
ok('16 the admin sees every quote', r.b.data.mquotes.length === 2);
r = await call('tk-owner', { action: 'save', key: 'mquotes', upsert: [Object.assign({}, rowData('mquotes/mq1'), { status: 'accepted', gcNote: 'PO coming', total: 1, lines: [] })] });
const qa = rowData('mquotes/mq1');
ok('17 the admin accepts it (note kept); the supplier\'s lines / total stay as sent', r.code === 200 && qa.status === 'accepted' && qa.gcNote === 'PO coming' && qa.total === 40152 && qa.lines.length === 2 && qa.decidedBy === 'owner@grayco-cs.com', qa);
r = await call('tk-sup', { action: 'save', key: 'mquotes', upsert: [{ id: 'mq1', jobId: 'J_MAT', lines: [{ desc: 'cheaper', qty: 1, unitPrice: 1 }] }] });
ok('18 a decided quote is locked for the supplier → 409', r.code === 409 && rowData('mquotes/mq1').lines.length === 2, r);

/* ═══ CRM vendor link + my-work ═══ */
r = await call('tk-sub', { action: 'crm-vendors' });
ok('19 crm-vendors: staff only', r.code === 403);
r = await call('tk-owner', { action: 'crm-vendors' });
const v1 = (r.b.vendors || []).find(v => v.id === 'V1');
ok('20 crm-vendors: the CRM vendors (not subs) with tax ID last 4 for the likely match', r.code === 200 && v1 && v1.taxLast4 === '6789' && v1.email === 'sales@supply.test' && !r.b.vendors.some(v => v.id === 'S9'), r.b);
r = await call('tk-sup', { action: 'my-work' });
ok('21 my-work before GrayCo links the vendor: linked false (an e-mail match alone opens nothing)', r.code === 200 && r.b.linked === false && r.b.supplier === true, r.b);
r = await call('tk-owner', { action: 'save', key: 'users', upsert: [Object.assign({}, rowData('users/' + SID), { crmVendorId: 'V1' })] });
r = await call('tk-sup', { action: 'my-work' });
const w = r.b;
ok('22 linked: the SENT PO Q501-1 only (not the draft, not another vendor\'s), items without GrayCo\'s cost', w.linked && w.pos.map(p => p.poNo).join() === 'Q501-1' && w.pos[0].job === 'Demo School HVAC' && JSON.stringify(w.pos).indexOf('9000') < 0 && JSON.stringify(w).indexOf('36000') > -1, w.pos);
ok('23 their supplier bills (open INV-77, paid INV-78 check 1042), not the lumber yard\'s, not a sub invoice; totals; jobs', w.bills.map(b => b.number).sort().join() === 'INV-77,INV-78' && w.bills.find(b => b.number === 'INV-78').checkNo === '1042' && w.totals.open === 36000 && w.jobs.join() === 'Demo Clinic,Demo School HVAC', w);
r = await call('tk-owner', { action: 'my-work', userId: SID });
ok('24 the admin sees the same for the supplier (Suppliers → POs & bills)', r.code === 200 && r.b.linked && r.b.pos.length === 1);
r = await call('tk-sub', { action: 'my-work' });
ok('25 a sub\'s my-work is unchanged (the CRM sub link)', r.code === 200 && r.b.linked === true && !r.b.supplier && Array.isArray(r.b.invoices), r.b);
/* the code keeps the sub-only parts apart */
const SP = fs.readFileSync(path.join(BUILD, 'netlify/functions/subportal.js'), 'utf8');
ok('26 bid-hub / CRM sub lists read role "sub" only — a supplier is never offered labour bids or merged into Subs', /us\.filter\(u => u\.role === 'sub' && u\.approved/.test(fs.readFileSync(path.join(BUILD, 'netlify/functions/bid-hub.js'), 'utf8')) && /role: p\.acctType === 'supplier' \? 'supplier' : 'sub'/.test(SP));
const fails = R.filter(x => !x).length;
console.log(fails ? 'FAILED ' + fails + ' of ' + R.length : 'ALL ' + R.length + ' PASS');
process.exit(fails ? 1 : 0);
