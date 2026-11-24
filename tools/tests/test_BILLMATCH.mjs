// test_BILLMATCH.mjs [build-dir] — BILLMATCH (owner 11/24: "bills or invoices need po or address or customer name to match expense",
// "abc bills have address or pos to match invoices and expenses per job"; supplier statements place a bill by the statement's PO or
// address; "office uses those roles she will do it all"). MADE-UP names and data only.
//   A. the rule itself (netlify/functions/_lib/billmatch.js = index.html's <script id="gc-patch-billmatch">): PO / street address /
//      customer name yes; job-name words, a city only, the vendor's name, a PO a finder copied from the job no; another street → no.
//   B. the server (_lib/subinv.js via money-mail): the sub's only open job / a job-name match is a suggestion (🧾 Match this invoice);
//      the customer named on the bill places it; the PO and the street address still do.
//   C. the page's finders in node (index.html's own code): the sub-invoice router, FINDJOB, INVLINK (sure → likely), QBCSV (money
//      out only; money in unchanged), 🧾 Supplier statement (memo / remembered memo → a suggestion; PO / ship-to / customer → placed;
//      a bill a person placed keeps its job), the accounting scan, GC_AUTO, the 💰 Money inbox, 📧 Check Gmail.
//   D. the Office role is an accounting role (by role, never by name).
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import zlib from 'zlib'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const FN = path.join(BUILD, 'netlify/functions');
const BM = require(FN + '/_lib/billmatch.js'), MM = require(FN + '/_lib/money-mail.js'), SI = require(FN + '/_lib/subinv.js');
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');

/* ── the made-up CRM ── */
const KITCHEN = { id: 'P_KIT', name: 'Zedd Kitchen Remodel', address: '123 Demo St, Memphis, TN 38117', autoPO: 'T501', client: 'Zedd Quinlan', contract: 20000, status: 'active', subs: [{ id: 'PSB1', name: 'Q&Z Demo Plumbing LLC' }] };
const CITY = { id: 'P_CITY', name: 'Demo Armory Course', address: 'Demoville TN', autoPO: 'X901', client: 'A & Z Demo Builders, Inc.', status: 'active' };
const PLAZA = { id: 'P_PLAZA', name: 'Harborview Plaza Repaint', address: '77 Harbor Plaza Dr, Demoville, TN', autoPO: 'K512', client: 'Velquist Holdings', status: 'active' };
const PLAZA2 = { id: 'P_PLAZA2', name: 'Velquist Office Roof', address: '9 Orchard Ln, Demoville, TN', autoPO: 'K513', client: 'Velquist Holdings', status: 'active' };
const OFFICE = { id: 'P_OFF', name: 'New Office', address: '6382 Demo Stage Rd', autoPO: 'O046', client: 'Office', status: 'active' };
const J = [KITCHEN, CITY, PLAZA, OFFICE];

/* ════ A. the rule ════ */
let b = BM.basis({ desc: 'Plumbing rough-in', po: 'T501' }, KITCHEN);
ok('A1 the PO the bill carries (its PO field) → PO', b.ok && b.by.includes('po'), b);
b = BM.basis({ desc: 'Supplies — PO #: T501' }, KITCHEN);
ok('A2 "PO #: T501" in the text → PO', b.ok && b.by.includes('po'), b);
b = BM.basis({ desc: 'Shower valve install 123 Demo Street' }, KITCHEN);
ok('A3 the job\'s house # + street ("123 Demo Street") → address', b.ok && b.by.join() === 'address', b);
b = BM.basis({ desc: 'Drywall for Zedd Quinlan' }, KITCHEN);
ok('A4 the job\'s customer named on the bill → customer', b.ok && b.by.join() === 'customer', b);
b = BM.basis({ desc: 'Zedd Kitchen Remodel — rough-in' }, KITCHEN);
ok('A5 the job\'s NAME alone (no PO / address / customer) → no', !b.ok && b.by.length === 0, b);
b = BM.basis({ desc: 'Grid repairs, Demoville TN' }, CITY);
ok('A6 a city only ("Demoville TN") is not a street address → no', !b.ok, b);
b = BM.basis({ desc: 'Paint for Velquist Holdings at 9 Orchard Ln' }, PLAZA);
ok('A7 the customer is named but the bill names ANOTHER street of that customer → not this job', !b.ok && b.vs === 'other', b);
b = BM.basis({ desc: 'Paint for Velquist Holdings at 9 Orchard Ln' }, PLAZA2);
ok('A8 …and the job at that street matches (address + customer)', b.ok && b.by.includes('address') && b.by.includes('customer'), b);
b = BM.basis({ desc: 'QuickBooks bill #1229', po: 'T501', source: 'quickbooks', qbKey: 'QB:bill:1229:q' }, KITCHEN);
ok('A9 a QuickBooks bill\'s "po" (copied from the job by a finder) is not the bill\'s own PO → no', !b.ok, b);
b = BM.basis({ desc: 'Plumbing', po: 'T501', autoLinked: true }, KITCHEN);
ok('A10 a PO a job finder copied (autoLinked) does not count', !b.ok, b);
b = BM.basis({ desc: 'Materials', sub: 'Zedd Quinlan Supply', vendor: 'Zedd Quinlan Supply' }, KITCHEN);
ok('A11 the payee\'s own name never counts as the customer', !b.ok, b);
ok('A12 GrayCo\'s overhead customer ("Office") is never a customer match', !BM.ok({ desc: 'Office chairs' }, OFFICE));
b = BM.basis({ desc: '123 Demo St — rough-in', po: 'X901' }, CITY);
ok('A13 a PO the bill carries still wins over a street address (patch MONEY)', b.ok && b.by.includes('po'), b);
ok('A14 placedByPerson: pidManual / a person\'s confirm / re-check yes; an automatic link no', BM.placedByPerson({ pid: 'P', pidManual: true }) && BM.placedByPerson({ pid: 'P', _matchConfirmed: true }) && BM.placedByPerson({ pid: 'P', linkedBy: 'Brit (invoice re-check)' }) && !BM.placedByPerson({ pid: 'P', autoLinked: true, autoLinkWhy: 'job name' }) && !BM.placedByPerson({ pid: '' }));
ok('A15 the page block is this same file (one rule, two homes)', html.includes(fs.readFileSync(FN + '/_lib/billmatch.js', 'utf8').trim()) && /<script id="gc-patch-billmatch">/.test(html));

/* ════ B. the server ════ */
function pdf(lines){
  const content = 'BT /F1 11 Tf 50 750 Td ' + lines.map((l, i) => (i ? '0 -16 Td ' : '') + '(' + l.replace(/([()\\])/g, '\\$1') + ') Tj').join(' ') + ' ET';
  const comp = zlib.deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + comp.length + '/Filter/FlateDecode>>\nstream\n', 'latin1'), comp, Buffer.from('\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'latin1')]);
}
const DATA = (projects) => ({ projects: JSON.parse(JSON.stringify(projects)), subs: [{ id: 'S_QZ', name: 'Q&Z Demo Plumbing LLC', email: 'billing@qz-demo.test', isSub: true }],
  vendors: [], invs: [], invoices: [], expenses: [], gc_deleted_projects: [], ccw_suppliers: [] });
function store(data){
  const kv = { gc_mail_money: [] };
  return { kv, deps(){ return { storeFile: async (buf) => { const h = SI.fileHash(buf); return { stored: true, ref: 'sb:crm-files/' + h + '.pdf', hash: h }; },
    kvListRead: async k => ({ list: JSON.parse(JSON.stringify(kv[k] || [])), at: 'x' }),
    kvListUpdate: async (k, fn) => { const m = fn(JSON.parse(JSON.stringify(kv[k] || []))); if (!m || !m.list) return { ok: true, unchanged: true }; kv[k] = m.list; return { ok: true }; },
    crmData: async () => JSON.parse(JSON.stringify(data)), ai: { ready: () => false }, now: Date.parse('2026-11-24T15:00:00Z') }; } };
}
let n = 0;
const mail = (lines) => { const buf = pdf(lines); return { id: 'm' + (++n), messageId: '<bm' + n + '@test>', from: { email: 'billing@qz-demo.test', name: 'Q&Z Demo Plumbing LLC' }, subject: 'Invoice ' + (700 + n),
  text: '', html: '', date: '2026-11-24T15:00:00Z', headers: {}, files: [{ name: 'bill' + n + '.pdf', type: 'application/pdf', size: buf.length, buf }] }; };
const run = async (projects, lines) => { const S = store(DATA(projects)); const r = await MM.fromEmail(mail(lines), 'sub_invoice', S.deps()); return { r, si: S.kv.gc_mail_money[0] && S.kv.gc_mail_money[0].si }; };
let x = await run([KITCHEN, PLAZA], ['Q&Z DEMO PLUMBING LLC', 'Invoice #: 701', 'Rough-in plumbing, 2 baths', 'Total Due: $3,200.00']);
ok('B1 the sub\'s only open job, nothing of it on the bill → a suggestion, 🧾 Match this invoice (not booked by itself)', x.r.route === 'match' && !x.si.certain && (x.si.top || []).some(t => t.pid === 'P_KIT'), { route: x.r.route, why: x.r.why });
x = await run([KITCHEN, PLAZA], ['Q&Z DEMO PLUMBING LLC', 'Invoice #: 702', 'Rough-in plumbing for Zedd Quinlan', 'Total Due: $3,200.00']);
ok('B2 the sub\'s only open job AND the customer named on the bill → booked on it', x.r.route === 'book' && x.r.jobId === 'P_KIT', { route: x.r.route, why: x.r.why });
x = await run([KITCHEN, PLAZA], ['Q&Z DEMO PLUMBING LLC', 'Invoice #: 703', 'Job: 123 Demo St, Memphis TN 38117', 'Total Due: $1,000.00']);
ok('B3 the street address → booked (as before)', x.r.route === 'book' && x.r.jobId === 'P_KIT', { route: x.r.route, why: x.r.why });
x = await run([KITCHEN, PLAZA], ['Q&Z DEMO PLUMBING LLC', 'Invoice #: 704', 'PO #: K512', 'Total Due: $900.00']);
ok('B4 the PO → booked (as before)', x.r.route === 'book' && x.r.jobId === 'P_PLAZA' && x.si.jobBy === 'po', { route: x.r.route, why: x.r.why });
let jm = SI.matchJob([KITCHEN, PLAZA, OFFICE], { jobAddress: '', po: '', customer: '', hay: 'Harborview Plaza Repaint touch-up work' });
ok('B5 matchJob: the job name alone is never "certain"', !jm.certain, jm.best);
jm = SI.matchJob([KITCHEN, PLAZA, OFFICE], { jobAddress: '77 Harbor Plaza Dr', po: '', customer: '', hay: '77 Harbor Plaza Dr' });
ok('B6 matchJob: the street address is certain, with its basis', jm.certain && jm.best.pid === 'P_PLAZA' && jm.best.basis.includes('address'), jm.best);

/* ════ C. the page ════ */
const blockAt = needle => { const i = html.indexOf(needle); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const W = { _crm: { projects: [], subs: [], invoices: [] } }; W.window = W;
const noop = () => 0;
const ctx = vm.createContext({ window: W, globalThis: W, console: { log(){}, warn(){} }, JSON, Math, Date, String, Array, Object, RegExp, Promise, parseFloat, parseInt, isFinite, Number, Boolean, Error, setTimeout: noop, setInterval: noop, clearInterval: noop,
  document: { hidden: true, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null }, localStorage: { getItem: () => null, setItem: noop } });
vm.runInContext(blockAt('patch BILLMATCH (owner 11/24'), ctx);
ok('C0 window._gcBillMatch is on the page, before every finder (right after the first patch)', typeof W._gcBillMatch === 'object' && typeof W._gcBillMatch.ok === 'function' && html.indexOf('<script id="gc-patch-billmatch">') < html.indexOf('<script id="gc-patch-quiet">'));
const bill = (desc, extra) => Object.assign({ id: 'INV_bm1', type: 'sub', sub: 'Q&Z Demo Plumbing LLC', desc, amt: 1200, recvDate: '2026-11-20' }, extra || {});

/* the sub-invoice router */
vm.runInContext(blockAt('GrayCo Sub Invoice Matching — route to right job + right sub'), ctx);
W._crm = { projects: [KITCHEN, PLAZA], subs: [{ id: 'S_QZ', name: 'Q&Z Demo Plumbing LLC' }], invoices: [] };
let sr = W._gcMatchSubInvoice(bill('Zedd Kitchen Remodel — rough-in'));
ok('C1 router: the distinctive job name alone → a guess for the office, not placed', !sr.pid && sr.jobGuess === 'P_KIT' && sr.jobNoBasis, sr);
sr = W._gcMatchSubInvoice(bill('rough-in', { address: '123 Demo St, Memphis, TN 38117' }));
ok('C2 router: the street address → placed (as before)', sr.pid === 'P_KIT', sr);
sr = W._gcMatchSubInvoice(bill('rough-in', { po: 'T501' }));
ok('C3 router: the PO → placed (as before)', sr.pid === 'P_KIT', sr);

/* FINDJOB */
vm.runInContext(blockAt('FIND THE JOB, AND NEVER LEAVE A PO WITHOUT ONE'), ctx);
const fj = (inv, list) => W._gcJobForInvoice(inv, list);
ok('C4 FINDJOB: a bill naming only the job\'s name → no job (the office picks)', !fj(bill('Harborview Plaza Repaint — touch up'), [KITCHEN, PLAZA]));
ok('C5 FINDJOB: by the address → the job (as before)', (fj(bill('touch up at 77 Harbor Plaza Dr'), [KITCHEN, PLAZA]) || {}).id === 'P_PLAZA');
ok('C6 FINDJOB: a CUSTOMER invoice keeps its matcher (the rule is for bills)', (fj({ id: 'C1', type: 'client', desc: 'Harborview Plaza Repaint — draw 1' }, [KITCHEN, PLAZA]) || {}).id === 'P_PLAZA');

/* INVLINK */
vm.runInContext(blockAt('__GC_PATCH_INVLINK__ — ').replace("(typeof window !== 'undefined' ? window : globalThis)", '(window)'), ctx);
const IL = W._gcInvLink;
const qb = (extra) => Object.assign({ id: 'INV_q1', type: 'sub', sub: 'Q&Z Demo Plumbing LLC', desc: 'QuickBooks bill #881 — rough-in', amt: 800, invNum: '881', source: 'quickbooks', qbKey: 'QB:bill:881:q', recvDate: '2026-11-20' }, extra || {});
const OTHERCUST = Object.assign({}, KITCHEN, { client: 'Someone Else Entirely', address: '' });
let m = IL.matchPayable(qb({ qbCust: 'Zedd Quinlan:Zedd Kitchen Remodel' }), [OTHERCUST, PLAZA]);
ok('C7 INVLINK: a QuickBooks project tag naming the job, but no PO / address / customer of it → "likely" (a person accepts), not "sure"', m.level !== 'sure' && !m.pid && m.top && m.top.pid === 'P_KIT', { level: m.level, why: m.top && m.top.why });
m = IL.matchPayable(qb({ qbCust: 'Zedd Quinlan:Zedd Kitchen Remodel' }), [KITCHEN, PLAZA]);
ok('C8 INVLINK: the same tag on the customer\'s own job (the customer named) → sure', m.level === 'sure' && m.pid === 'P_KIT', { level: m.level, why: m.top && m.top.why });
m = IL.matchPayable(qb({ desc: 'QuickBooks bill #882 — 77 Harbor Plaza Dr touch up' }), [KITCHEN, PLAZA]);
ok('C9 INVLINK: the street address → sure (as before)', m.level === 'sure' && m.pid === 'P_PLAZA', { level: m.level });
const ci = IL.match({ id: 'CI', type: 'client', client: 'Zedd Quinlan', qbCust: 'Zedd Quinlan:Zedd Kitchen Remodel', desc: 'Invoice', source: 'quickbooks', qbKey: 'QB:invoice:1:z', amt: 100 }, [OTHERCUST, PLAZA]);
ok('C10 INVLINK: a customer invoice keeps its matcher', ci.level === 'sure', { level: ci.level });

/* QBCSV */
vm.runInContext(blockAt('__GC_PATCH_QBCSV__ — '), ctx);
const Q = W._gcQbMatch;
let q = Q.matchJob({ memo: 'Harborview Plaza Repaint', name: 'Q&Z Demo Plumbing LLC', side: 'cost', kind: 'bill' }, { projects: [KITCHEN, PLAZA] });
ok('C11 QBCSV money out: the job name in the memo → no job, the guess is a candidate (a person picks)', !q.pid && q.noBasis && q.cands.some(c => c.pid === 'P_PLAZA'), q);
q = Q.matchJob({ memo: 'Harborview Plaza Repaint', name: 'Velquist Holdings', side: 'income', kind: 'invoice' }, { projects: [KITCHEN, PLAZA] });
ok('C12 QBCSV money in (a customer invoice): unchanged', q.pid === 'P_PLAZA', q);
q = Q.matchJob({ memo: 'touch up 77 Harbor Plaza Dr', side: 'cost', kind: 'bill' }, { projects: [KITCHEN, PLAZA] });
ok('C13 QBCSV money out: the memo\'s street address → the job', q.pid === 'P_PLAZA', q);
q = Q.matchJob({ memo: 'Rough-in — Zedd Quinlan', side: 'cost', kind: 'bill' }, { projects: [KITCHEN, PLAZA] });
ok('C14 QBCSV money out: the customer\'s name → the job', q.pid === 'P_KIT', q);
q = Q.matchJob({ memo: 'paint touch up', side: 'cost', kind: 'bill' }, { projects: [KITCHEN, PLAZA], memoMap: { 'paint touch up': { pid: 'P_PLAZA' } } });
ok('C15 QBCSV money out: a memo remembered from another bill, nothing of the job in it → a suggestion only', !q.pid && q.how === 'remembered' && q.cands[0].pid === 'P_PLAZA', q);

/* 🧾 Supplier statement */
vm.runInContext(blockAt('__GC_PATCH_SUPSTMT__'), ctx);
const SC = W._gcSupStmtCore;
const X = SC.jobCtx([KITCHEN, PLAZA, PLAZA2, CITY], Q);
const line = (f) => Object.assign({ date: '2026-11-10', invNo: '', po: '', shipTo: '', memo: '', amount: 500, kind: 'invoice' }, f);
let jf = SC.jobFor(line({ memo: 'Harborview Plaza Repaint' }), X, null);
ok('C16 statement: a memo / job name only → no job (❓ No job found), the job is a suggestion', !jf.pid && jf.cands.some(c => c.pid === 'P_PLAZA'), jf);
jf = SC.jobFor(line({ po: 'K513' }), X, null);
ok('C17 statement: the PO → the job (owner: "place each ABC bill on a job using the statement\'s PO or address" — YES)', jf.pid === 'P_PLAZA2' && jf.how === 'po', jf);
jf = SC.jobFor(line({ shipTo: '77 Harbor Plaza Dr Demoville TN' }), X, null);
ok('C18 statement: the ship-to address → the job', jf.pid === 'P_PLAZA' && jf.how === 'address', jf);
jf = SC.jobFor(line({ memo: 'ZEDD QUINLAN' }), X, null);
ok('C19 statement: the customer\'s name → the job', jf.pid === 'P_KIT', jf);
X.mem['memo:' + SC.nk('kitchen stuff')] = { pid: 'P_KIT', stmt: '1001' };
jf = SC.jobFor(line({ memo: 'kitchen stuff' }), X, null);
ok('C20 statement: a memo a person put on a job on an earlier statement → a suggestion (memo-only never places)', !jf.pid && jf.cands.some(c => c.pid === 'P_KIT'), jf);
X.mem['ship:' + SC.nk('lot 4 back gate')] = { pid: 'P_KIT', stmt: '1001' };
jf = SC.jobFor(line({ shipTo: 'lot 4 back gate' }), X, null);
ok('C21 statement: a ship-to a person put on a job before → that job', jf.pid === 'P_KIT' && jf.how === 'remembered', jf);
jf = SC.jobFor(line({ memo: 'Harborview Plaza Repaint' }), X, { id: 'B1', pid: 'P_KIT' });
ok('C22 statement: no evidence on the line → the bill\'s own job in the CRM (nothing moves)', jf.pid === 'P_KIT' && jf.how === 'invoice', jf);
const SS = blockAt('__GC_PATCH_SUPSTMT__');
ok('C23 statement pay: a bill a PERSON placed keeps its job (the statement\'s PO / address only shows "⚠ Wrong project?")', /placedByPerson\(bill\)\) \{ v\.pid = s\(bill\.pid\); v\.keptPerson = true; \}/.test(SS) && SS === fs.readFileSync(path.join(BUILD, 'tools/supstmt_tail.js'), 'utf8').replace(/\n$/, '') + '\n' || SS.trim() === fs.readFileSync(path.join(BUILD, 'tools/supstmt_tail.js'), 'utf8').trim());
ok('C24 finance charges unchanged: unpaid unless ticked (not included by default), booked as overhead when paid', SC.includeDefault('finance') === false && /overhead: v\.kind === 'finance' \|\| !v\.pid/.test(SS));

/* the other finders: their gate is in place */
ok('C25 the accounting scan (expense → job): the gate after its matcher', /var jid = matchJob\(descText\);\n\s+if\(jid && window\._gcBillMatch\)/.test(html));
ok('C26 GC_AUTO (card / QuickBooks CSV queue): the job name alone is no job', /if\(hit && window\._gcBillMatch && !window\._gcBillMatch\.ok\(String\(text\|\|""\), hit\)\) hit=null;/.test(html));
ok('C27 💰 Money inbox: preselected only by PO / street address / customer', /var m=matchJob\(rec\);\n\s+if\(m\.pid && window\._gcBillMatch\)/.test(html));
ok('C28 📧 Check Gmail: "the sub is on that job" no longer places a bill (the PO still does)', !html.includes('if(!Te){for(const Pt of Wt)if(Pt.subs&&Pt.subs.some(jt=>Ne.includes(jt.name.toLowerCase()))){Te=Pt.id,J=Pt.autoPO||"";break}}') && html.includes('for(const Pt of j)if(kt.includes(Pt.po)){Te=Pt.pid,J=Pt.po;break}'));
/* the GC_AUTO matcher, run */
{
  const src = blockAt('function _gcMatchJob(text){'); const i = src.indexOf('function _gcMatchJob(text){'), e = src.indexOf('\n    }\n', i);
  const fnSrc = src.slice(i, e + 6);
  W._crm = { projects: [KITCHEN, PLAZA] };
  const f = vm.runInContext('(function(){ ' + fnSrc + ' return _gcMatchJob; })()', ctx);
  ok('C29 GC_AUTO run: "Zedd Kitchen Remodel" (the name) → no job; "PO T501" → the job', f('HOME DEPOT zedd kitchen remodel') === '' && f('HOME DEPOT PO T501') === 'P_KIT', [f('HOME DEPOT zedd kitchen remodel'), f('HOME DEPOT PO T501')]);
}

/* ════ D. the Office role ════ */
ok('D1 the Office role (Office / Office Manager / Office Admin) is an accounting role — by role', /var OFFICE_ROLE = \/\^\\s\*office/.test(SS) && /ACCT_ROLE\.test\(s\(u\.role\)\) \|\| OFFICE_ROLE\.test\(s\(u\.role\)\)/.test(SS));
const OR = /^\s*office(\s*(manager|admin(istrator)?|mgr))?\s*$/i;
ok('D2 "Office", "office manager", "Office Admin" yes; "Marketing Manager", "PM", "Field" no', ['Office', 'office manager', 'Office Admin'].every(r => OR.test(r)) && !['Marketing Manager', 'PM', 'Field', 'Back office crew'].some(r => OR.test(r)));
ok('D3 no person\'s name in the rule', !/brittany|nick thomas/i.test(SS.slice(SS.indexOf('OFFICE_ROLE') - 400, SS.indexOf('OFFICE_ROLE') + 400)));

const p = R.filter(Boolean).length;
console.log('BILLMATCH ' + p + '/' + R.length);
process.exit(p === R.length ? 0 : 1);
