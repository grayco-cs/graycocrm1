// test_INVJOB.mjs [build-dir] — INVJOB (owner 11/23: "it read the wrong job — the address on the bill is
// another job's"). A MADE-UP copy of the case: a sub's QuickBooks bill whose memo names "418 Maplecrest rd Demoville tn 38999"
// was put on a job whose address is a city only ("Demoville TN", PO X901, the sub's only open job). Made-up names and data only.
//   A. the server (_lib/subinv.js — e-mailed sub invoices, SHIPTO, MONEYMAIL): the full street address beats the sub's only open job,
//      a bare PO-looking token, a city-only job; a contradicting street takes the job down → route "match" (🧾 Match this invoice);
//      an explicit "PO #" still wins (patch MONEY).
//   B. the page's matchers in node (vm, index.html's own code): INVLINK (match / matchPayable — QuickBooks history import, 🔗 Bills),
//      QBCSV (_gcQbMatch — the QuickBooks CSV import), FINDJOB (_gcJobForInvoice — the 60 s finder), the sub-invoice router
//      (_gcMatchSubInvoice): the same rule; a bill that names no street is matched as before.
//   C. ✅ Approvals shows "R&D …", never "R&amp;D …" (the card escaped QuickBooks' own entity again).
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import zlib from 'zlib'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const FN = path.join(BUILD, 'netlify/functions');
const SI = require(FN + '/_lib/subinv.js'), MM = require(FN + '/_lib/money-mail.js');

/* ── the made-up CRM ── */
const ARMORY = { id: 'P_ARMORY', name: 'Demo Armory Course', address: 'Demoville TN', autoPO: 'X901', client: 'A & Z Demo Builders, Inc.', status: 'active', pm: 'Demo PM',
  subs: [{ id: 'PSB1', name: 'R&D Demo Builders LLC', status: 'Awarded' }] };
const CAMPUS = { id: 'P_CAMPUS', name: 'Demo Campus Maplecrest', address: '418 Maplecrest Rd, Demoville, TN 38999', autoPO: 'K512', client: 'Demo University', status: 'active', pm: 'Demo PM' };
const OTHER = { id: 'P_OTHER', name: 'Demo Main Street', address: '500 Main St, Demoville, TN 38999', autoPO: 'X902', client: 'Demo Owner', status: 'active' };
const MEMO = '418 Maplecrest rd Demoville tn 38999 .Grid install . Tile lay in . Grid repairs';
const DATA = (projects) => ({ projects: JSON.parse(JSON.stringify(projects)), subs: [{ id: 'S_QA', name: 'R&D Demo Builders LLC', email: 'billing@qa-demo.test', isSub: true }],
  vendors: [], invs: [], invoices: [], expenses: [], gc_deleted_projects: [], ccw_suppliers: [] });

/* ════ A. the server ════ */
function pdf(lines){
  const content = 'BT /F1 11 Tf 50 750 Td ' + lines.map((l, i) => (i ? '0 -16 Td ' : '') + '(' + l.replace(/([()\\])/g, '\\$1') + ') Tj').join(' ') + ' ET';
  const comp = zlib.deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + comp.length + '/Filter/FlateDecode>>\nstream\n', 'latin1'), comp, Buffer.from('\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'latin1')]);
}
function store(data){
  const kv = { gc_mail_money: [] };
  return { kv, deps(){ return { storeFile: async (buf) => { const h = SI.fileHash(buf); return { stored: true, ref: 'sb:crm-files/' + h + '.pdf', hash: h }; },
    kvListRead: async k => ({ list: JSON.parse(JSON.stringify(kv[k] || [])), at: 'x' }),
    kvListUpdate: async (k, fn) => { const m = fn(JSON.parse(JSON.stringify(kv[k] || []))); if (!m || !m.list) return { ok: true, unchanged: true }; kv[k] = m.list; return { ok: true }; },
    crmData: async () => JSON.parse(JSON.stringify(data)), ai: { ready: () => false }, now: Date.parse('2026-10-27T15:00:00Z') }; } };
}
let n = 0;
const bill = (lines, subject) => { const b = pdf(lines); return { id: 'm' + (++n), messageId: '<ij' + n + '@test>', from: { email: 'billing@qa-demo.test', name: 'R&D Demo Builders LLC' }, subject: subject || 'Invoice ' + (1529 + n),
  text: '', html: '', date: '2026-10-27T15:00:00Z', headers: {}, files: [{ name: 'bill' + n + '.pdf', type: 'application/pdf', size: b.length, buf: b }] }; };
const run = async (projects, lines, subject) => { const S = store(DATA(projects)); const r = await MM.fromEmail(bill(lines, subject), 'sub_invoice', S.deps()); return { r, si: S.kv.gc_mail_money[0] && S.kv.gc_mail_money[0].si }; };
const L1 = ['R&D DEMO BUILDERS LLC', 'Invoice #: 1530', MEMO, 'Total Due: $8,500.00'];

ok('A0 addrVs: same / other / none (a city only) / no street on the bill', typeof SI.addrVs === 'function' && SI.addrVs('418 Maplecrest rd', CAMPUS) === 'same' && SI.addrVs('418 Maplecrest rd', OTHER) === 'other' && SI.addrVs('418 Maplecrest rd', ARMORY) === 'none' && SI.addrVs('Demoville TN', ARMORY) === '');
let x = await run([ARMORY, CAMPUS, OTHER], L1);
ok('A1 the bill names 418 Maplecrest Rd: the job AT that address, not the sub\'s only open job (city-only "Demoville TN")', x.r.route === 'book' && x.r.jobId === 'P_CAMPUS' && x.si.certain, { route: x.r.route, job: x.r.jobId, why: x.r.why, top: x.si && x.si.top });
x = await run([ARMORY, OTHER], L1);
ok('A2 the Maplecrest job is not in the CRM: the sub\'s only open job (a city only) is a suggestion, never placed → 🧾 Match this invoice', x.r.route === 'match' && !x.si.certain && x.si.top.some(t => t.pid === 'P_ARMORY' && t.conf <= 60), { route: x.r.route, why: x.r.why, top: x.si && x.si.top });
x = await run([ARMORY, CAMPUS, OTHER], ['R&D DEMO BUILDERS LLC', 'Invoice #: 1531', 'Ref X901', MEMO, 'Total Due: $2,000.00']);
ok('A3 a bare "X901" in the text + the street address of another job → the address wins', x.r.route === 'book' && x.r.jobId === 'P_CAMPUS', { route: x.r.route, job: x.r.jobId, why: x.r.why });
const contra = Object.assign({}, ARMORY, { address: '900 Cedar Ln, Demoville, TN', subs: [] });
x = await run([contra, OTHER], ['R&D DEMO BUILDERS LLC', 'Invoice #: 1532', 'Ref X901', MEMO, 'Total Due: $2,000.00']);
ok('A4 contradicting evidence: a bare "X901" but the bill\'s street is not that job\'s → its confidence drops, → 🧾 Match this invoice', x.r.route === 'match' && !(x.si.top || []).some(t => t.pid === 'P_ARMORY' && t.conf > 60), { route: x.r.route, why: x.r.why, top: x.si && x.si.top });
x = await run([contra, CAMPUS], ['R&D DEMO BUILDERS LLC', 'Invoice #: 1533', 'PO #: X901', MEMO, 'Total Due: $900.00']);
ok('A5 an explicit "PO #: X901" still wins (patch MONEY: the PO the sub wrote decides)', x.r.route === 'book' && x.r.jobId === 'P_ARMORY' && x.si.jobBy === 'po', { route: x.r.route, job: x.r.jobId, why: x.r.why });
x = await run([ARMORY], ['R&D DEMO BUILDERS LLC', 'Invoice #: 1534', 'Grid repairs', 'Total Due: $400.00']);
/* BILLMATCH (owner 11/24): "the sub's only open job" alone no longer places a bill — no PO / street address / customer name → a person picks */
ok('A6 no street on the bill: the sub\'s only open job is a suggestion (BILLMATCH: no PO, address or customer name) → 🧾 Match this invoice', x.r.route === 'match' && !x.si.certain && (x.si.top || []).some(t => t.pid === 'P_ARMORY'), { route: x.r.route, why: x.r.why });

/* ════ B. the page's matchers (index.html's own code, in node) ════ */
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const blockAt = needle => { const i = html.indexOf(needle); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const W = { _crm: { projects: [], subs: [], invoices: [] } }; W.window = W;
const noop = () => 0;
const ctx = vm.createContext({ window: W, globalThis: W, console: { log(){}, warn(){} }, JSON, Math, Date, String, Array, Object, RegExp, Promise, parseFloat, parseInt, isFinite, Number, Boolean, Error, setTimeout: noop, setInterval: noop, clearInterval: noop,
  document: { hidden: true, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null }, localStorage: { getItem: () => null, setItem: noop } });
vm.runInContext(blockAt('__GC_PATCH_INVLINK__ — ').replace("(typeof window !== 'undefined' ? window : globalThis)", '(window)'), ctx);
const IL = W._gcInvLink;
ok('B0 INVLINK loads in node; the street helpers are there', !!IL && typeof IL.streetsStrict === 'function' && typeof W._gcInvJobStreets === 'function');
ok('B0 a full street needs a suffix ("418 Maplecrest rd" yes; "2 coats", a ZIP, "Demoville tn" no)', typeof IL.streetsStrict === 'function' && JSON.stringify(IL.streetsStrict('418 Maplecrest rd Demoville tn 38999')) === '[{"n":"418","st":"maplecrest"}]' && IL.streetsStrict('2 coats of paint, 38999').length === 0);
const qbBill = (desc, extra) => Object.assign({ id: 'INV_demo1', type: 'sub', sub: 'R&amp;D Demo Builders LLC', desc: 'QuickBooks bill #1530 — ' + desc, amt: 8500, invNum: '1530', source: 'quickbooks', qbKey: 'QB:bill:1530:q', recvDate: '2026-10-26' }, extra || {});
let m = IL.matchPayable(qbBill(MEMO), [ARMORY, CAMPUS, OTHER]);
ok('B1 INVLINK: the QuickBooks bill → the job at 418 Maplecrest Rd (sure), not the job where the sub works ("Demoville TN")', m.level === 'sure' && m.pid === 'P_CAMPUS', { level: m.level, pid: m.pid, list: (m.list || []).map(x => [x.pid, x.score, x.why]) });
m = IL.matchPayable(qbBill(MEMO), [ARMORY, OTHER]);
ok('B2 INVLINK: without the Maplecrest job → never "sure" (no job placed by itself)', m.level !== 'sure' && !m.pid, { level: m.level, pid: m.pid });
m = IL.match(qbBill('X901 ' + MEMO), [Object.assign({}, contra), OTHER]);
ok('B3 INVLINK: a bare X901 in the memo but another street on that job → not sure, the evidence says so', m.level !== 'sure' && /another street/.test(JSON.stringify(m.list)), { level: m.level, list: (m.list || []).map(x => [x.pid, x.score, x.why]) });
m = IL.match(qbBill('PO# X901 ' + MEMO), [contra, OTHER]);
ok('B4 INVLINK: a PO the bill LABELS ("PO# X901") stays sure', m.level === 'sure' && m.pid === 'P_ARMORY', { level: m.level, pid: m.pid });
m = IL.match(qbBill('X901 grid repairs'), [ARMORY, OTHER]);
ok('B5 INVLINK: no street on the bill → the PO token still places it (as before)', m.level === 'sure' && m.pid === 'P_ARMORY', { level: m.level, pid: m.pid });

vm.runInContext(blockAt('__GC_PATCH_QBCSV__ — '), ctx);
const Q = W._gcQbMatch;
let q = Q.matchJob({ memo: MEMO, name: 'R&D Demo Builders LLC', side: 'cost', kind: 'bill' }, { projects: [ARMORY, CAMPUS, OTHER] });
ok('B6 QBCSV: the memo\'s address → the Maplecrest job', q.pid === 'P_CAMPUS', q);
q = Q.matchJob({ memo: MEMO, name: 'R&D Demo Builders LLC', side: 'cost', kind: 'bill' }, { projects: [ARMORY, OTHER] });
ok('B7 QBCSV: no Maplecrest job → no job (the city "Demoville" alone is nothing)', !q.pid, q);
q = Q.matchJob({ memo: 'X901 · ' + MEMO, side: 'cost', kind: 'bill' }, { projects: [contra, OTHER] });
ok('B8 QBCSV: a X901 token but the memo\'s street is another → not placed, "another street"', !q.pid && /another street/.test(JSON.stringify(q.cands)), q);
q = Q.matchJob({ memo: 'X901 grid repairs', side: 'cost', kind: 'bill' }, { projects: [ARMORY, OTHER] });
ok('B9 QBCSV: no street in the memo → the PO still places it (as before)', q.pid === 'P_ARMORY', q);

vm.runInContext(blockAt('FIND THE JOB, AND NEVER LEAVE A PO WITHOUT ONE'), ctx);
const fj = (inv, list) => W._gcJobForInvoice(inv, list);
ok('B10 FINDJOB: never the city-only job; the Maplecrest job by its address', !fj(qbBill(MEMO, { pid: '' }), [ARMORY, OTHER]) && (fj(qbBill(MEMO), [ARMORY, CAMPUS, OTHER]) || {}).id === 'P_CAMPUS');
const named = { id: 'P_NAMED', name: 'Lakeside Grid Ceilings', address: '900 Cedar Ln, Demoville, TN', client: 'Demo Owner', status: 'active' };
ok('B11 FINDJOB: a job named in the memo but at another street → not linked by the name', !fj(qbBill('Lakeside Grid Ceilings — ' + MEMO), [named, OTHER]) && (fj(qbBill('Lakeside Grid Ceilings — grid repairs'), [named, OTHER]) || {}).id === 'P_NAMED');

vm.runInContext(blockAt('GrayCo Sub Invoice Matching — route to right job + right sub'), ctx);
W._crm = { projects: [ARMORY, OTHER], subs: [{ id: 'S_QA', name: 'R&D Demo Builders LLC' }], invoices: [] };
let sr = W._gcMatchSubInvoice(qbBill(MEMO));
ok('B12 the sub-invoice router: the city "Demoville TN" is not a match when the bill names its own street → no job, no guess', !sr.pid && !sr.jobGuess, sr);
W._crm.projects = [named, OTHER];
sr = W._gcMatchSubInvoice(qbBill('Lakeside Grid Ceilings — ' + MEMO));
ok('B13 the sub-invoice router: the job\'s full name in the memo but another street → not certain', !sr.pid, sr);
sr = W._gcMatchSubInvoice(qbBill('Lakeside Grid Ceilings — grid repairs'));
ok('B14 the sub-invoice router: no street on the bill → the job name places it (as before)', sr.pid === 'P_NAMED', sr);
W._crm.projects = [ARMORY, OTHER];
sr = W._gcMatchSubInvoice(qbBill('grid repairs', { address: '418 Maplecrest rd Demoville tn 38999' }));
ok('B15 the sub-invoice router: a bill ADDRESS "418 Maplecrest rd Demoville tn" no longer "exactly matches" a job whose address is "Demoville TN"', !sr.pid && !sr.jobCertain, sr);
sr = W._gcMatchSubInvoice(qbBill('grid repairs', { address: 'Demoville TN' }));
ok('B16 the sub-invoice router: the city alone ("Demoville TN" = "Demoville TN") is never certain', !sr.pid, sr);
W._crm.projects = [CAMPUS, OTHER];
sr = W._gcMatchSubInvoice(qbBill('grid repairs', { address: '418 Maplecrest Rd, Demoville, TN 38999' }));
ok('B17 the sub-invoice router: a real street address still places it (as before)', sr.pid === 'P_CAMPUS', sr);

/* ════ C. ✅ Approvals: the name as QuickBooks wrote it, shown once ════ */
const AP = blockAt("function rowSub(a, mine, now){");
ok('C1 the ✅ Approvals sub-invoice card decodes QuickBooks\' entities before it is escaped ("R&amp;D" → "R&D")', /function unEnt\(v\)/.test(AP) && /'Sub invoice — ' \+ \(unEnt\(a\.sub/.test(AP));
let unEnt = () => null; if (/function unEnt\(v\)/.test(AP)) unEnt = new Function('s', AP.slice(AP.indexOf('function unEnt(v)'), AP.indexOf('\n', AP.indexOf('function unEnt(v)'))) + '; return unEnt;')(v => v == null ? '' : String(v).trim());
ok('C2 unEnt("R&amp;D Demo Builders LLC") = "R&D Demo Builders LLC"; plain text untouched', unEnt('R&amp;D Demo Builders LLC') === 'R&D Demo Builders LLC' && unEnt('A & B') === 'A & B' && unEnt('5 &lt; 6') === '5 < 6');

const k = R.filter(Boolean).length; console.log('INVJOB ' + k + '/' + R.length); process.exit(k === R.length ? 0 : 1);
