// test_QBFACT_fn.mjs [index.html] — patch QBFACT logic in node (vm), MADE-UP records only.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const H = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(H, '..', '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const m = /<script id="gc-patch-qbfact">([\s\S]*?)<\/script>/.exec(html);
let pass = 0, fail = 0; const ok = (c, msg, info) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ FAIL ' + msg + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
ok(!!m, 'the QBFACT script is in the page');
ok(html.includes("W._gcQbFactDrop(r, qbCtx)") && html.includes('/* patch QBFACT */'), 'the To-Do build calls the QBFACT filter');
const store = {}; const LS = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const saved = [];
const INV = [
  { id: 'A1', type: 'client', source: 'quickbooks', qbKey: 'QB:invoice:1001:x', invNum: '1001', client: 'Pat Example', amt: 2160, date: '2026-02-20', dueDate: '2026-03-22', status: 'overdue', pid: 'P1' },
  { id: 'A2', type: 'client', source: 'quickbooks', qbKey: 'QB:invoice:1130:y', invNum: '1130', client: 'Sample Co', amt: 5000, date: '2026-10-12', dueDate: '2026-10-20', status: 'partial', pid: 'P2' },
  { id: 'A3', type: 'client', source: 'quickbooks', qbKey: 'QB:invoice:1001b:x', invNum: '1002', client: 'Pat Example', amt: 900, date: '2026-03-01', status: 'sent', qbOpen: true, pid: 'P1' },
  { id: 'A4', type: 'client', invNum: '1108', client: 'Real Customer', amt: 6500, date: '2026-09-01', dueDate: '2026-09-30', status: 'sent', pid: 'P3' },
  { id: 'B1', type: 'sub', source: 'quickbooks', by: 'QuickBooks import', qbKey: 'QB:bill:2026-09-09:398:westley', sub: 'Westley', amt: 3.98, date: '2026-09-09', dueDate: '2026-10-09', status: 'received', pid: '', invNum: '' },
  { id: 'B2', type: 'sub', source: 'quickbooks', by: 'QuickBooks import', qbKey: 'QB:bill:2026-09-09:316:westley', sub: 'Westley', amt: 3.16, date: '2026-09-09', dueDate: '2026-10-09', status: 'received', pid: '', invNum: '' },
  { id: 'B3', type: 'sub', source: 'quickbooks', qbKey: 'QB:bill:2026-10-07:75000:best', sub: 'Best Gutter', amt: 750, date: '2026-10-07', status: 'received', pid: '', invNum: '' },
  { id: 'B4', type: 'sub', source: 'quickbooks', qbKey: 'QB:bill:85378:altus', invNum: '85378', sub: 'Altus', amt: 5000, date: '2026-10-20', status: 'received', pid: '' }];
const W = { _crm: { invs: JSON.parse(JSON.stringify(INV)), expenses: [{ id: 'E1', source: 'quickbooks', amt: 40, date: '2026-05-01' }, { id: 'E2', amt: 10 }], users: [{ name: 'Tess Owner', role: 'Admin', payType: 'owner' }], vendors: [{ name: 'QB Only Supply', source: 'QuickBooks' }, { name: 'Real Sub LLC', isSub: true }, { name: 'Both Co', source: 'QuickBooks' }], subs: [{ name: 'Both Co', isSub: true }] },
  localStorage: LS, setTimeout: () => 0, setInterval: () => 0, console: { log(){} },
  document: { getElementById: () => null, createElement: () => ({ style: {}, addEventListener(){}, remove(){} }), body: { appendChild(){} } } };
W.window = W;
W._supaUpsertNow = (k, l) => saved.push([k, l.length]);
W._setInvoices = l => { W._crm.invs = l; };
W._todoCompute = () => ({ overdue: [{ key: 'ovd:A1' }, { key: 'ovd:A2' }, { key: 'ovd:A3' }, { key: 'ovd:A4' }, { key: 'ovd:B1' }], confirm: [{ key: 'confinv:A1' }, { key: 'confexp:E1' }, { key: 'confexp:E2' }], contract: [] });
W._gcOfficeBuildTasks = () => [{ id: 'coll_A1' }, { id: 'coll_A4' }, { id: 'qbconfirm_A2' }, { id: 'costreview_E1' }, { id: 'comp_x' }];
W._gcInvIsPaid = () => false;
W.buildTodoItems = () => [{ tag: 'Invoice', text: 'Overdue invoice: $2,160 — x', pid: 'P1' }, { tag: 'Invoice', text: 'Overdue invoice: $6,500 — y', pid: 'P3' }, { tag: 'Billing', text: 'x' }];
LS.setItem('grayco_user', JSON.stringify({ name: 'Tess Owner' }));
vm.createContext(W); vm.runInContext(m[1], W);
const Q = W._gcQbFact;
const st = id => Q.state(W._crm.invs.find(r => r.id === id));
ok(Q.cfg().qbFactPaidBefore === '2026-10-05' && Q.cfg().qbFactCutoff === '2026-11-04', 'default cutoffs', Q.cfg());
ok(st('A1') === 'paid', 'QB invoice before 2026-10-05 counts as paid', st('A1'));
ok(st('A2') === 'review', 'QB invoice from the last month waits for the owner', st('A2'));
ok(st('A3') === 'open', 'QuickBooks says open (qbOpen) → a normal open invoice', st('A3'));
ok(st('A4') === '', 'a CRM invoice is not QuickBooks', st('A4'));
ok(st('B3') === 'fact' && !Q.paid(W._crm.invs.find(r => r.id === 'B3')) && Q.silent(W._crm.invs.find(r => r.id === 'B3')), 'a recent QB bill is final (no to-dos), not forced paid');
W._crm.payrollSettings = { qbFactPaidBefore: '2026-10-15' };
ok(st('A2') === 'paid', 'the setting qbFactPaidBefore moves the line', st('A2'));
delete W._crm.payrollSettings;
const tc = W._todoCompute();
ok(tc.overdue.map(x => x.key).join() === 'ovd:A3,ovd:A4' && tc.confirm.map(x => x.key).join() === 'confexp:E2', 'To-Do tab: no overdue / confirm lines for QuickBooks records', tc);
ok(W._gcOfficeBuildTasks().map(t => t.id).join() === 'coll_A4,comp_x', 'office list: no collections / confirm / check-cost for QuickBooks');
ok(W.buildTodoItems().map(t => t.text).join('|') === 'Overdue invoice: $6,500 — y|x', 'office page: the QB overdue line is gone, the real one stays');
ok(W._gcInvIsPaid(W._crm.invs[0]) === true && W._gcInvIsPaid(W._crm.invs[3]) === false, 'paid check: old QB invoice paid, CRM invoice unchanged');
const D = W._gcQbFactDrop, own = { owner: true };
ok(D({ thing: 'ar|A1' }, own) && D({ thing: 'ar|A2' }, own) && !D({ thing: 'ar|A3' }, own) && !D({ thing: 'ar|A4' }, own), 'To-Do: collections lines dropped only for QuickBooks fact / unconfirmed');
ok(D({ src: 'st', rec: { kind: 'qb_home' } }, own) && !D({ src: 'st', rec: { kind: 'qb_home' } }, { owner: false }), '"needs a home" stays for the office, off the owner\'s To-Do');
ok(D({ src: 'otd', key: 'otd:alert_151 subs to match to a job', title: '151 subs to match to a job' }, own) && !D({ src: 'otd', key: 'otd:alert_151 subs to match to a job', title: '151 subs to match to a job' }, { owner: false }), 'sub matching line: office only');
ok(D({ thing: 'sub|qb only supply', subName: 'QB Only Supply' }, own) && !D({ thing: 'sub|real sub llc', subName: 'Real Sub LLC' }, own) && !D({ thing: 'sub|both co', subName: 'Both Co' }, own), 'papers chase: not for a QuickBooks-only vendor; still for a CRM sub');
const ext = W._gcTodoExt.map(f => f()).flat();
ok(ext.length === 2 && ext[0].cat === 'appr' && /confirm Paid \/ Still owed \(1\)/.test(ext[0].title) && /Remove 2 bad imported invoices/.test(ext[1].title), 'ONE grouped approval + the cleanup card', ext.map(e => e.title));
ok(Q.junk().map(r => r.id).join() === 'B1,B2', 'junk = the numberless, jobless lines of one receipt (not the single numberless bill)', Q.junk().map(r => r.id));
const amtBefore = W._crm.invs.reduce((a, r) => a + r.amt, 0);
ok(Q.trashJunk() === 2 && Q.junk().length === 0 && W._crm.invs.length === 8 && W._crm.invs.find(r => r.id === 'B1').status === 'void' && W._crm.invs.find(r => r.id === 'B1').qbJunk.was.amt === 3.98, 'remove: void, $0, original kept, nothing deleted');
ok(Q.undoJunk() === 2 && W._crm.invs.reduce((a, r) => a + r.amt, 0) === amtBefore && !W._crm.invs.find(r => r.id === 'B1').qbJunk && W._crm.invs.find(r => r.id === 'B1').status === 'received', 'undo puts them back exactly');
ok(Q.setPaid(['A2']) === 1 && st('A2') === 'paid' && W._crm.invs.find(r => r.id === 'A2').status === 'paid', 'Paid → marked paid');
W._crm.invs.find(r => r.id === 'A2').qbConfirmed = undefined; W._crm.invs.find(r => r.id === 'A2').status = 'partial'; W._crm.invs.find(r => r.id === 'A2').paid = false;
ok(Q.setOwed(['A2']) === 1 && st('A2') === 'open' && !Q.silent(W._crm.invs.find(r => r.id === 'A2')) && !D({ thing: 'ar|A2' }, own), 'Still owed → a normal open invoice (collections line allowed)');
ok(saved.length >= 4 && saved.every(s => s[0] === 'invs' && s[1] === 8), 'saves go to invs with every record', saved);
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
