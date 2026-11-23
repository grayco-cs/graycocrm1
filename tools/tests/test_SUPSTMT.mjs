// test_SUPSTMT.mjs [build-dir] [shot-dir] — patch SUPSTMT (owner 11/23: "theres no way to track paying the main invoices from
// suppliers when they send us a large one day payment statement, we need to pay the statement at once but it also has the jobs we are
// paying … it needs to read the memo address po etc and match to correct jobs, it needs to mark off when we pay a statement what jobs
// are paid if they are on the right project if they havnt been paid etc").
// Offline. The CRM side = index.html's OWN scripts (patch QBCSV's matcher core, STMTPDF's PDF reader, LUMPSUM, PAYDETAIL and SUPSTMT)
// in a page with small stubs for the CRM's lists (_crm, _setInvoices, _setExpenses, the register, the file store) and an in-memory
// gc_kv. Made-up data only (tools/tests/supstmt/make_fixtures.py draws the statements).
//   A. the block is in, the two small hooks (BULKDROP aiAsk, LUMPSUM accounting roles), the mark only in a comment.
//   B. parsing: the PDF (columns, a two-line entry, page 2 header, totals / aging / remit lines left out), the typed text, the CSV,
//      a photo / scanned PDF through the reader (stubbed), the statement's own date / # / total.
//   C. matching: invoice # (2345678-00 = 2345678), amount + date, another supplier's bill never; job by PO / address / memo; statuses
//      ✅ / ⚠ already paid (check #) / ⚠ wrong project / ❓ / ➕ / credit / finance / payment; closed job noted.
//   D. a person's pick survives a re-match, a newer job list, and an older copy from another computer; a newer pick wins.
//   E. pay guards: unresolved lines, payment ≠ ticked lines, no check #.
//   F. partial pay (a disputed line unticked, a line paid in part): each bill paid with the check #, the wrong-project bill moved, a
//      job-less bill put on its job with a cost row, new bills (+ cost rows) for ➕ lines, the credit on its job, the lump-sum record,
//      "Paid on … statement" on each bill + cost row; the statement partly paid, the rest open. Then the rest → paid, archived.
//   G. the same statement again (PDF, typed with its #) opens the one in the CRM; next month's statement knows the paid invoice.
//   H. the job's Invoices / Expenses lines show "Paid on <Supplier> statement <#/date>, check <#>".
//   I. who: office / admin / a Bookkeeper role allowed; crew and "viewing as" refused (button, screen, read, pay).
//   J. the panel: enter → read → table, 📍 Job picker search + pick, ⚡ oldest first, Pay disabled until it balances; phone layout.
//   K. speed: 480 jobs, 2,400 bills, a 150-line statement — no long task over 300 ms while reading / matching.
import fs from 'fs'; import path from 'path'; import os from 'os'; import { execFileSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 1500) : '')); };
const NM = process.env.NODE_PATH || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules';
const PDFJS = process.env.GC_PDFJS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/leadtxt/cdnfix/cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const block = (re) => { const i = html.search(re); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const S_QB = block(/__GC_PATCH_QBCSV__ — /), S_STMT = block(/__GC_PATCH_STMTPDF__ — /), S_LUMP = block(/__GC_PATCH_LUMPSUM__ \(owner 11\/13/), S_PD = block(/__GC_PATCH_PAYDETAIL__ \(owner/), S_SS = block(/__GC_PATCH_SUPSTMT__ \(owner/);
ok('A1 index.html has patch SUPSTMT (its own block, last) and the blocks it builds on', S_SS.length > 30000 && S_QB && S_STMT && S_LUMP && S_PD && html.lastIndexOf('__GC_PATCH_SUPSTMT__') > html.lastIndexOf('__GC_PATCH_SCHEDFREEZE__'), [S_SS.length]);
ok('A2 the mark is only in the opening JS comment; BULKDROP exposes aiAsk; LUMPSUM lets accounting roles in', (html.match(/__GC_PATCH_SUPSTMT__/g) || []).length === 1 && /W\._gcBulkDrop = \{ aiAsk: aiAsk,/.test(html) && /W\._gcAcctRole\(\)\) return true; \} catch \(e\) \{\}   \/\* patch SUPSTMT/.test(html) && !/SUPSTMT/.test(S_SS.replace(/^\/\*__GC_PATCH_SUPSTMT__/, '').replace(/\/\*[\s\S]*?\*\//g, '')));

const FX = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'supstmt-'));
execFileSync('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'supstmt', 'make_fixtures.py'), FX], { stdio: 'ignore' });
const EXP = JSON.parse(fs.readFileSync(FX + '/expect.json', 'utf8'));

/* ═════ the made-up CRM ═════ */
const P = [
  { id: 'P1', name: 'Demo Kitchen Remodel', client: 'Pat Demo', address: '1234 Oak Ridge Dr, Memphis, TN', autoPO: 'T601', status: 'Active' },
  { id: 'P2', name: 'Demo Bath', client: 'Lee Sample', address: '88 Maple Cv, Cordova, TN', autoPO: 'T602', status: 'Active' },
  { id: 'P3', name: 'Demo Reroof Harlan', client: 'Harlan Example', address: '4500 Poplar Ave, Memphis, TN', autoPO: 'T603', status: 'Active' },
  { id: 'P4', name: 'Demo Deck Brooks', client: 'Brooks Placeholder', address: '17 Cedar Ln, Germantown, TN', autoPO: 'T604', status: 'completed' },
  { id: 'P5', name: 'Demo Siding Quinn', client: 'Quinn Testcase', address: '902 Walnut Grove Rd, Memphis, TN', autoPO: 'T605', status: 'Active' },
  { id: 'P6', name: 'Demo Garage', client: 'Rory Mock', address: '3301 Elm St, Bartlett, TN', autoPO: 'T606', status: 'Active' }];
const SUP = 'ABC Supply Co., Inc.';
const bill = (id, pid, n, amt, d, extra) => Object.assign({ id, type: 'sub', payeeType: 'supplier', pid, sub: SUP, subId: 'V1', invNum: n, amt, recvDate: d, date: d, status: 'received', po: (P.find(p => p.id === pid) || {}).autoPO || '', desc: 'Materials ' + n }, extra || {});
const INV0 = [
  bill('B1', 'P1', '2345678', 1250, '2026-10-02'),
  bill('B2', 'P2', '2345701', 842.17, '2026-10-06', { status: 'paid', paid: true, paidDate: '2026-10-20', checkNo: '4410', payMethod: 'Check' }),
  bill('B3', 'P3', '2345733-00', 2210.40, '2026-10-09', { status: 'approved' }),
  bill('B4', '', '', 615, '2026-10-12'),
  bill('B5', 'P2', '2345799', 389.55, '2026-10-15', { sub: 'Other Lumber Co', subId: 'V2' }),
  { id: 'C1', type: 'client', pid: 'P1', client: 'Pat Demo', invNum: '1001', amt: 5000, date: '2026-10-01', status: 'sent' }];
const EXP0 = INV0.filter(x => x.type === 'sub' && x.pid).map(x => ({ id: 'E_' + x.id, pid: x.pid, subInvId: x.id, type: 'expense', vendor: x.sub, amt: x.amt, category: 'Materials', status: x.status === 'paid' ? 'paid' : 'approved', date: x.date }));
const USERS = [{ id: 'u1', name: 'Wes Demo', email: 'owner@grayco-cs.test', role: 'Admin' }, { id: 'u2', name: 'Brit Demo', email: 'office@grayco-cs.test', role: 'Office Manager' },
  { id: 'u3', name: 'Carl Crew', email: 'crew@grayco-cs.test', role: 'Crew Lead' }, { id: 'u4', name: 'Bea Books', email: 'books@grayco-cs.test', role: 'Bookkeeper' }];
const VENDORS = [{ id: 'V1', name: SUP, isSub: false, cat: 'Supplier' }, { id: 'V2', name: 'Other Lumber Co', isSub: false, cat: 'Supplier' }, { id: 'V3', name: 'Demo Plumbing Sub LLC', isSub: true }];

const { chromium } = require(path.join(NM, 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const KV = {};
async function page(o){
  o = o || {};
  const C = await browser.newContext(Object.assign({ viewport: o.viewport || { width: 1366, height: 860 }, serviceWorkers: 'block' }, o.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}));
  await C.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host === 'crm.test') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><main id="app"></main></body></html>' });
    if (u.host === 'sb.test' && u.pathname === '/rest/v1/gc_kv') {
      if (rq.method() === 'POST') { const b = JSON.parse(rq.postData()); KV[b.key] = b.value; return r.fulfill({ status: 201, body: '' }); }
      const k = (u.searchParams.get('key') || '').replace(/^eq\./, '');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(KV[k] !== undefined ? [{ key: k, value: KV[k] }] : []) });
    }
    if (/pdf(\.worker)?\.min\.js$/.test(u.pathname)) return r.fulfill({ path: PDFJS + '/' + (/worker/.test(u.pathname) ? 'pdf.worker.min.js' : 'pdf.min.js'), contentType: 'text/javascript' });
    return r.fulfill({ status: 404, body: '' });
  });
  const pg = await C.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  pg.on('dialog', d => { errs.push('dialog: ' + d.message().slice(0, 80)); d.dismiss(); });
  if (o.longtasks) await pg.addInitScript(() => { window.__LT = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__LT.push({ t: e.startTime, ms: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {} });
  await pg.goto('https://crm.test/');
  await pg.evaluate(([inv, exp, projects, users, vendors, who]) => {
    localStorage.setItem('grayco_sb_url', 'https://sb.test'); localStorage.setItem('grayco_sb_key', 'anon-test');
    window.__WHO = who || 'office'; window.__VAS = false;
    window.__GC_AUTH__ = { email: () => window.__WHO + '@grayco-cs.test', isAdmin: () => window.__WHO === 'owner' };
    window.__gcAuthIsAdmin = () => window.__WHO === 'owner';
    window._gcFullAccess = () => window.__WHO === 'owner' || window.__WHO === 'office';
    window._gcVAS = { active: () => window.__VAS };
    window._crm = { invoices: inv, projects, expenses: exp, users, vendors, subs: vendors };
    window._setInvoices = fn => { window._crm = Object.assign({}, window._crm, { invoices: fn(window._crm.invoices) }); };
    window._setExpenses = fn => { window._crm = Object.assign({}, window._crm, { expenses: fn(window._crm.expenses) }); };
    window.REG = [];
    window._gcAddToRegister = row => { const i = window.REG.findIndex(x => x.srcInvId === row.srcInvId); if (i >= 0) window.REG[i] = Object.assign({}, window.REG[i], row); else window.REG.push(Object.assign({ _id: 'R' + window.REG.length }, row)); return Promise.resolve(); };
    window._gcRemoveFromRegister = id => { window.REG = window.REG.filter(x => x.srcInvId !== id); return Promise.resolve(); };
    window.FILES = [];
    window._gcStoreFile = (f, meta) => { const ref = 'sha-' + f.name.length + '-' + f.size + '-' + f.name.replace(/\W/g, ''); window.FILES.push({ ref, name: f.name, meta }); return Promise.resolve({ ref, name: f.name, type: f.type, size: f.size }); };
    window._gcOpenRef = (ref) => { window.OPENED = ref; };
  }, [o.inv || JSON.parse(JSON.stringify(INV0)), o.exp || JSON.parse(JSON.stringify(EXP0)), o.projects || P, USERS, VENDORS, o.who]);
  /* patch QBCSV's matcher core only (its CRM side needs the whole app): run with a window that has no document */
  await pg.evaluate(src => { const fw = {}; new Function('window', 'globalThis', src)(fw, fw); window._gcQbMatch = fw._gcQbMatch; }, S_QB);
  for (const s of [S_STMT, S_LUMP, S_PD, S_SS]) await pg.addScriptTag({ content: s });
  return { C, pg, errs };
}
const b64 = n => fs.readFileSync(path.join(FX, n)).toString('base64');
const fileIn = (pg, name, type, varName) => pg.evaluate(([d, name, type, v]) => { const bin = atob(d), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window[v] = new File([u], name, { type }); }, [b64(name), name, type, varName || 'FILE']);

/* ═════ B. parsing ═════ */
const A = await page();
const pg = A.pg;
await fileIn(pg, 'abc_stmt.pdf', 'application/pdf');
const PB = await pg.evaluate(async () => { const C = window._gcSupStmtCore; const doc = await window._gcStmt.readPdf(await window.FILE.arrayBuffer()); return C.parse(doc, {}); });
ok('B1 the PDF: 11 statement lines (10 invoices / credits / charges + 1 payment), page 2 header and the totals / aging / remit lines left out', PB.lines.length === 11, PB.lines.map(l => l.invNo + ' ' + l.amount));
const cmp = (L, i) => { const e = EXP.lines[i], l = L[i] || {}; return l.invNo === e.invNo && l.kind === e.kind && Math.abs(l.amount - e.amount) < 0.005 && (!e.po || l.po === e.po) && (!e.ship || String(l.shipTo).toLowerCase().indexOf(e.ship.toLowerCase()) === 0); };
ok('B2 each PDF line: invoice #, kind (invoice / credit negative / finance / payment), PO, ship-to, amount', EXP.lines.every((e, i) => cmp(PB.lines, i)), PB.lines.map(l => [l.invNo, l.kind, l.po, l.shipTo, l.memo, l.amount].join('|')));
ok('B3 the PDF\'s own details: statement # ST-1115-0457, date 2026-11-15, Total Due 7,628.55 = the lines (no warning); dates with the year', PB.head.stmtNo === 'ST-1115-0457' && PB.head.stmtDate === '2026-11-15' && PB.head.total === 7628.55 && Math.abs(PB.sum - 7628.55) < 0.005 && !PB.warn && PB.lines[0].date === '2026-10-02', PB.head);
ok('B4 a two-line entry: the ship-to on the next line joins its invoice (T606, 3301 ELM ST)', PB.lines[10].po === 'T606' && /^3301 ELM ST/i.test(PB.lines[10].shipTo) && /SHINGLES/.test(PB.lines[10].memo), PB.lines[10]);
const PT = await pg.evaluate(t => { const C = window._gcSupStmtCore; return C.parse(C.textPages(t, false), { stmtDate: '2026-11-15', knownPO: w => /^T60\d$/.test(w) }); }, fs.readFileSync(FX + '/abc_stmt.txt', 'utf8'));
ok('B5 typed / pasted lines (no header): the same 11 lines, invoice #, PO, ship-to, amounts', PT.lines.length === 11 && EXP.lines.every((e, i) => cmp(PT.lines, i)), PT.lines.map(l => [l.invNo, l.kind, l.po, l.shipTo, l.memo, l.amount].join('|')));
const PC = await pg.evaluate(t => { const C = window._gcSupStmtCore; return C.parse(C.textPages(t, true), {}); }, fs.readFileSync(FX + '/abc_stmt.csv', 'utf8'));
ok('B6 the CSV (header row): the same 11 lines', PC.lines.length === 11 && EXP.lines.every((e, i) => cmp(PC.lines, i)), PC.lines.map(l => [l.invNo, l.kind, l.po, l.shipTo, l.amount].join('|')));
const PR = await pg.evaluate(() => { const C = window._gcSupStmtCore; const t = 'Date  Invoice  Amount  Balance\n10/01/26  5001  100.00  100.00\n10/02/26  5002  50.00  150.00\n10/03/26  5003  25.00  175.00\n10/04/26  5004  10.00  185.00'; const p = C.parse(C.textPages(t, false), {}); return { amts: p.lines.map(l => l.amount), running: p.running }; });
ok('B7 a running "Balance" column is not taken as the line amounts', PR.running && PR.amts.join() === '100,50,25,10', PR);
/* a photo / scanned PDF: the bulk-drop reader (stubbed here) */
await fileIn(pg, 'scan.pdf', 'application/pdf', 'SCAN');
const PS = await pg.evaluate(async () => {
  window._gcBulkDrop = { aiAsk: (content, max) => { window.AIASK = { parts: content.map(c => c.type), max }; return Promise.resolve({ status: 200, d: { content: [{ type: 'text', text: JSON.stringify({ supplier: 'ABC SUPPLY CO., INC.', statementDate: '2026-11-15', statementNo: 'ST-PHOTO-1', totalDue: 1125, lines: [{ date: '2026-10-02', invoiceNo: '2345678-00', type: 'invoice', po: 'T601', shipTo: '1234 Oak Ridge Dr', memo: 'PAT DEMO KITCHEN', amount: 1250 }, { date: '2026-10-24', invoiceNo: '2345702-00', type: 'credit', po: 'T602', memo: 'RETURN', amount: 125 }] }) }] } }); } };
  const r = await window._gcSupStmt.read({ file: window.SCAN }); return { err: r.error, n: r.rec && r.rec.lines.length, sup: r.rec && r.rec.supplier, no: r.rec && r.rec.stmtNo, kinds: r.rec && r.rec.lines.map(l => l.f.kind + ' ' + l.f.amount), via: r.rec && r.rec.via, ai: window.AIASK, file: r.rec && r.rec.file };
});
ok('B8 a scanned (picture-only) PDF goes to the reader: lines, credit negative, supplier named by the statement, the file kept', !PS.err && PS.n === 2 && PS.sup === SUP && PS.no === 'ST-PHOTO-1' && PS.kinds.join() === 'invoice 1250,credit -125' && /scan/.test(PS.via) && PS.ai && PS.ai.parts[0] === 'document' && PS.ai.max >= 4000 && PS.file && /^sha-/.test(PS.file.ref), PS);
const PN = await pg.evaluate(async () => { const keep = window._gcBulkDrop; window._gcBulkDrop = null; const f = new File([new Uint8Array([1, 2, 3])], 'stmt.jpg', { type: 'image/jpeg' }); const r = await window._gcSupStmt.read({ supplier: 'ABC Supply Co., Inc.', file: f }); window._gcBulkDrop = keep; return r.error || ''; });
ok('B9 no photo reader on the screen → a plain "type or paste the lines" message (nothing saved)', /type or paste/i.test(PN), PN);

/* ═════ C. read + match (as the office) ═════ */
await pg.evaluate(() => { window._gcSupStmt._t.setList([]); });
const RD = await pg.evaluate(async () => { const r = await window._gcSupStmt.read({ file: window.FILE }); window.SID = r.rec && r.rec.id; return { err: r.error, dup: r.dup, id: r.rec && r.rec.id, sup: r.rec && r.rec.supplier, no: r.rec && r.rec.stmtNo, total: r.rec && r.rec.total, file: r.rec && r.rec.file }; });
ok('C1 read the PDF with no supplier picked: the supplier comes from the statement (ABC SUPPLY CO., INC. = ' + SUP + '), its #, total and file kept', !RD.err && RD.sup === SUP && RD.no === 'ST-1115-0457' && RD.total === 7628.55 && RD.file && RD.file.ref, RD);
const V = async () => pg.evaluate(() => { const S = window._gcSupStmt.view(window.SID); return { state: S.state, need: S.need, inc: S.inc, V: S.V.map(v => ({ id: v.id, st: v.st, pid: v.pid, how: v.how, inv: v.invId, include: v.include, pay: v.pay, closed: v.jobClosed, paidRef: v.paidInfo && v.paidInfo.ref, paidDate: v.paidInfo && v.paidInfo.date, kind: v.kind, wrong: v.wrong, stmtNo: v.paidInfo && v.paidInfo.stmt && v.paidInfo.stmt.no })) }; });
let v0 = await V();
const want = EXP.lines.map((e, i) => ({ i, e, g: v0.V[i] }));
ok('C2 every line\'s status: ✅ / ⚠ already paid / ⚠ wrong project / ✅ (amount) / ➕ / ➕ / ❓ / 💸 / 🧮 / ⓘ / ➕', want.every(x => x.g && x.g.st === x.e.st), v0.V.map(v => v.id + ':' + v.st));
ok('C3 every line\'s job (PO first, then address, memo / job name): P1 po · P5 po (statement) · P6 address · P4 po · P3 memo · P2 po (credit) · P6 po', want.every(x => !x.e.pid || (x.g.pid === x.e.pid && (!x.e.how || x.g.how === x.e.how))), v0.V.map(v => v.id + ':' + v.pid + '/' + v.how));
ok('C4 the CRM bills: L1 = B1 by invoice # (2345678-00 = 2345678), L3 = B3, L4 = B4 (no # in the CRM: amount + date + supplier), L2 = B2', v0.V[0].inv === 'B1' && v0.V[1].inv === 'B2' && v0.V[2].inv === 'B3' && v0.V[3].inv === 'B4', v0.V.map(v => v.id + ':' + v.inv));
ok('C5 another supplier\'s bill with the same # (Other Lumber Co 2345799) is never taken for ABC\'s line L5 (→ ➕ new)', v0.V[4].inv === '' && v0.V[4].st === 'new');
ok('C6 already paid: when + check # shown, left out by default (nothing paid twice)', v0.V[1].paidRef === '4410' && v0.V[1].paidDate === '2026-10-20' && !v0.V[1].include, v0.V[1]);
ok('C7 the closed job (P4 completed) is noted; the finance charge and the payment line are not ticked', v0.V[4].closed === true && !v0.V[8].include && !v0.V[9].include);
ok('C8 two lines need a person (wrong project, no job) — the totals say so', v0.need === 2, v0);

/* ═════ D. a person's pick is permanent ═════ */
const D1 = await pg.evaluate(async () => {
  const S = window._gcSupStmt, id = window.SID;
  S.pick(id, 'L7', 'pid', 'P1'); S.pick(id, 'L3', 'pid', 'P5');
  const before = JSON.parse(JSON.stringify(S.get(id)));
  await S.match(id);
  /* the job list changes: a new job whose name is in L7's memo — the person's pick still wins */
  window._crm = Object.assign({}, window._crm, { projects: window._crm.projects.concat([{ id: 'P9', name: 'Will Call Demo Job', client: 'Will Call', address: '1 Demo Way', autoPO: 'T609', status: 'Active' }]) });
  await S.match(id);
  const v = S.view(id).V;
  /* another computer's older copy (no picks) merged in */
  const old = JSON.parse(JSON.stringify(before)); old.lines.forEach(l => { l.h = {}; l.a = { pid: 'P2', how: 'po' }; }); old.updatedAt = new Date(Date.now() + 60000).toISOString();
  const m = S._t.mergeRec(S.get(id), old);
  /* a newer person's pick on another computer replaces it */
  const nw = JSON.parse(JSON.stringify(S.get(id))); nw.lines.find(l => l.id === 'L7').h.pid = { v: 'P6', by: 'Other Person', at: new Date(Date.now() + 120000).toISOString() };
  const m2 = S._t.mergeRec(S.get(id), nw);
  window._crm = Object.assign({}, window._crm, { projects: window._crm.projects.filter(p => p.id !== 'P9') }); await S.match(id);
  return { l7: v[6].pid, l7how: v[6].how, l7st: v[6].st, l3: v[2].pid, l3st: v[2].st, mergedL7: m.lines.find(l => l.id === 'L7').h.pid.v, mergedL3: m.lines.find(l => l.id === 'L3').h.pid.v, newer: m2.lines.find(l => l.id === 'L7').h.pid.v, log: S.get(id).log.length };
});
ok('D1 picks: L7 → P1 (was ❓, now ➕ on P1), L3 → P5 (the statement\'s job, was ⚠ wrong project, now ✅) — marked as the person\'s', D1.l7 === 'P1' && D1.l7how === 'person' && D1.l7st === 'new' && D1.l3 === 'P5' && D1.l3st === 'ok', D1);
ok('D2 the picks survive a re-match, a new job that matches the memo, and an older copy from another computer', D1.mergedL7 === 'P1' && D1.mergedL3 === 'P5', D1);
ok('D3 a newer person\'s pick (another computer) replaces the older one; every pick is in the history', D1.newer === 'P6' && D1.log >= 3, D1);

/* ═════ E. pay guards ═════ */
const E1 = await pg.evaluate(async () => {
  const S = window._gcSupStmt, id = window.SID;
  const a = await S.pay(id, { date: '2026-11-20', method: 'check', checkNo: '5012', amount: 100 });
  const b = await S.pay(id, { date: '2026-11-20', method: 'check', checkNo: '', amount: S.view(id).inc.total });
  S.pick(id, 'L3', 'inc', true);
  /* L7 without the person's pick (and without what the CRM remembers of it) is ❓ again */
  const tmp = JSON.parse(JSON.stringify(S.get(id).lines.find(l => l.id === 'L7').h)); delete S.get(id).lines.find(l => l.id === 'L7').h.pid;
  S._t.forgetJobs(); await S.match(id);
  const c = await S.pay(id, { date: '2026-11-20', method: 'check', checkNo: '5012', amount: S.view(id).inc.total });
  S.get(id).lines.find(l => l.id === 'L7').h = tmp; S._t.forgetJobs(); await S.match(id);
  return { a: a.error, b: b.error, c: c.error, paid: window._crm.invoices.filter(x => x.status === 'paid').length };
});
ok('E1 refused: the payment ≠ the ticked lines (says short by …), no check #, a line still with no job — nothing paid', /short by/.test(E1.a) && /check #/i.test(E1.b) && /Pick the job for 1 line/.test(E1.c) && E1.paid === 1, E1);

/* ═════ F. partial pay, then the rest ═════ */
const F1 = await pg.evaluate(async () => {
  const S = window._gcSupStmt, id = window.SID;
  S.pick(id, 'L7', 'inc', false);          /* disputed */
  S.pick(id, 'L11', 'pay', 1000);          /* part of it */
  const tot = S.view(id).inc.total;
  const r = await S.pay(id, { date: '2026-11-20', method: 'check', checkNo: '5012', paidFrom: 'Operating checking', amount: tot, note: 'November statement' });
  const I = window._crm.invoices, E = window._crm.expenses, by = id2 => I.find(x => x.id === id2) || {};
  const nb = I.filter(x => /^SSB-/.test(x.id));
  const sv = S.view(id);
  return { tot, ok: r.ok, err: r.error, st: r.state, newBills: r.newBills, moved: r.moved,
    B1: { st: by('B1').status, chk: by('B1').checkNo, lump: (by('B1').payments || []).slice(-1)[0], ss: by('B1').supStmt },
    B3: { st: by('B3').status, pid: by('B3').pid, manual: by('B3').pidManual, cost: E.find(e => e.subInvId === 'B3') },
    B4: { st: by('B4').status, pid: by('B4').pid, cost: E.find(e => e.subInvId === 'B4') },
    B2: by('B2').status, B5: by('B5').status,
    nb: nb.map(b => ({ id: b.id, pid: b.pid, amt: b.amt, st: b.status, open: b.openBalance, inv: b.invNum, cost: (E.find(e => e.subInvId === b.id) || {}).status, costPid: (E.find(e => e.subInvId === b.id) || {}).pid })),
    credit: E.filter(e => /^SSC-/.test(e.id)).map(e => ({ pid: e.pid, amt: e.amt, type: e.type, st: e.status, ss: !!e.supStmt })),
    fin: E.filter(e => /^SSF-/.test(e.id)).length,
    reg: window.REG.filter(x => x.srcInvId === 'B1').map(x => x.status + ' ' + x.desc),
    lines: sv.V.map(v => v.id + ':' + v.st + (v.st === 'ok' ? '/' + v.max : '')), state: sv.state, paid: sv.paid, open: sv.open, archived: sv.archived };
});
const KVL = JSON.parse(KV.gc_lump_payments || '[]'), KVS = JSON.parse(KV.gc_sup_statements || '[]');
ok('F1 💵 Pay statement with a line left out and a line paid in part: ok, $6,415.20 = 1,250 + 2,210.40 + 615 + 389.55 + 1,075.25 − 125 + 1,000', F1.ok && Math.abs(F1.tot - 6415.20) < 0.005, F1);
ok('F2 the matched bill B1: paid, check # 5012 on it, its payments[] row names the one lump-sum payment', F1.B1.st === 'paid' && F1.B1.chk === '5012' && F1.B1.lump && F1.B1.lump.lumpId && F1.B1.lump.checkNo === '5012', F1.B1);
ok('F3 the wrong-project bill B3 moved to the job the person picked (P5) with its cost row, and paid', F1.B3.st === 'paid' && F1.B3.pid === 'P5' && F1.B3.manual === true && F1.B3.cost && F1.B3.cost.pid === 'P5' && F1.B3.cost.status === 'paid', F1.B3);
ok('F4 the bill with no job (B4) went on P6 (the address) with a new cost row, paid', F1.B4.st === 'paid' && F1.B4.pid === 'P6' && F1.B4.cost && F1.B4.cost.pid === 'P6' && F1.B4.cost.status === 'paid', F1.B4);
ok('F5 ➕ lines became bills on their jobs (L5 P4, L6 P3, L11 P6) with cost rows; L11 partly paid ($980 open), the others paid', F1.newBills === 3 && F1.nb.length === 3 && F1.nb.some(b => b.pid === 'P4' && b.st === 'paid' && b.inv === '2345799-00' && b.cost === 'paid') && F1.nb.some(b => b.pid === 'P3' && b.st === 'paid') && F1.nb.some(b => b.pid === 'P6' && b.st === 'partial' && Math.abs(b.open - 980) < 0.005 && b.costPid === 'P6'), F1.nb);
ok('F6 the credit is a −$125 cost on its job (P2); the unticked finance charge not booked; the paid B2 and the other supplier\'s B5 untouched', F1.credit.length === 1 && F1.credit[0].pid === 'P2' && F1.credit[0].amt === -125 && F1.credit[0].st === 'paid' && F1.fin === 0 && F1.B2 === 'paid' && F1.B5 === 'received', F1);
ok('F7 "Paid on <Supplier> statement" on the bill (statement #, date, check #) and the register\'s Sub Paid row', F1.B1.ss && F1.B1.ss.no === 'ST-1115-0457' && F1.B1.ss.checkNo === '5012' && F1.B1.ss.date === '2026-11-15' && F1.reg.some(x => /^paid Sub Paid/.test(x) && /#5012/.test(x)), F1);
ok('F8 the statement is PARTLY paid: the left-out line and the rest of L11 stay open; the lump-sum record lists the 6 bills', F1.state === 'partial' && F1.lines.includes('L7:new') && F1.lines.includes('L11:ok/980') && F1.lines.includes('L1:paid') && F1.lines.includes('L8:paid') && !F1.archived && KVL.length === 1 && KVL[0].applied.length === 6 && KVL[0].checkNo === '5012', { lines: F1.lines, st: F1.state, kv: KVL.map(x => x.applied.length) });
ok('F9 the statement record is saved (gc_kv gc_sup_statements): the payment, its lines, who / when', KVS.length >= 1 && KVS.some(r => r.id === RD.id && r.payments.length === 1 && r.payments[0].checkNo === '5012' && r.payments[0].by === 'Brit Demo' && r.payments[0].lines.length === 7), KVS.map(r => [r.id, (r.payments || []).length]));
const F2 = await pg.evaluate(async () => {
  const S = window._gcSupStmt, id = window.SID;
  S.pick(id, 'L7', 'inc', true); S.pick(id, 'L9', 'inc', true);
  const tot = S.view(id).inc.total;
  const r = await S.pay(id, { date: '2026-11-27', method: 'ach', checkNo: '', ref: 'ACH-77', amount: tot });
  const I = window._crm.invoices, sv = S.view(id), fin = window._crm.expenses.filter(e => /^SSF-/.test(e.id));
  return { tot, ok: r.ok, err: r.error, state: sv.state, archived: sv.archived, l11: (I.find(x => /-L11$/.test(x.id)) || {}).status, l7: I.find(x => /-L7$/.test(x.id)), lines: sv.V.map(v => v.id + ':' + v.st), pays: S.get(id).payments.length, fin: fin.map(e => ({ pid: e.pid, oh: e.overhead, amt: e.amt, cat: e.category })) };
});
ok('F10 the rest (L7 $214.60 + L11\'s $980 + the $18.75 finance charge, by ACH) → the statement is PAID and archived; L7 a bill on P1 (the person\'s pick); the charge is overhead', F2.ok && Math.abs(F2.tot - 1213.35) < 0.005 && F2.state === 'paid' && F2.archived && F2.l11 === 'paid' && F2.l7 && F2.l7.pid === 'P1' && F2.l7.status === 'paid' && F2.pays === 2 && F2.fin.length === 1 && F2.fin[0].oh === true && !F2.fin[0].pid && F2.fin[0].amt === 18.75, F2);
const F3 = await pg.evaluate(async () => { const S = window._gcSupStmt, id = window.SID; const r = await S.pay(id, { date: '2026-11-27', method: 'check', checkNo: '1', amount: 10 }); return r.error; });
ok('F11 paying again: nothing left to pay (no line ticked)', /Tick at least one line/.test(F3), F3);

/* ═════ G. the same statement again · next month ═════ */
const G1 = await pg.evaluate(async () => {
  const S = window._gcSupStmt, n0 = S.list().length;
  const a = await S.read({ file: window.FILE });
  const b = await S.read({ supplier: 'ABC Supply Co., Inc.', stmtNo: 'ST-1115-0457', text: '10/02/26  2345678-00  INV  T601  1,250.00' });
  return { a: a.dup && a.rec.id, b: b.dup && b.rec.id, n: S.list().length - n0 };
});
ok('G1 the same PDF again, and the same supplier + statement # typed in → "already in the CRM", the existing statement opens, none added', G1.a === RD.id && G1.b === RD.id && G1.n === 0, G1);
await fileIn(pg, 'abc_next.pdf', 'application/pdf', 'NEXT');
const G2 = await pg.evaluate(async () => { const S = window._gcSupStmt; const r = await S.read({ file: window.NEXT }); const v = S.view(r.rec.id).V; return { dup: r.dup, v: v.map(x => ({ st: x.st, inv: x.invId, pid: x.pid, ref: x.paidInfo && x.paidInfo.ref, stmt: x.paidInfo && x.paidInfo.stmt && x.paidInfo.stmt.no })) }; });
ok('G2 next month\'s statement: the invoice paid on the November statement is ⚠ already paid (check 5012, statement ST-1115-0457); the new one ➕ on P3 (PO T603)', !G2.dup && G2.v[0].st === 'already' && G2.v[0].ref === '5012' && G2.v[0].stmt === 'ST-1115-0457' && G2.v[1].st === 'new' && G2.v[1].pid === 'P3', G2);

/* ═════ H. the job's lines ═════ */
const H1 = await pg.evaluate(async () => {
  const d = document.createElement('table'); d.innerHTML = '<tbody><tr><td><span data-apxd-line="inv|B1"></span></td></tr><tr><td><span data-apxd-line="exp|E_B1"></span></td></tr><tr><td><span data-apxd-line="inv|B2"></span></td></tr></tbody>'; document.body.appendChild(d);
  window._gcSupStmt.paint(); return [...d.querySelectorAll('td')].map(td => (td.querySelector('.gc-ss-chip') || {}).textContent || '');
});
ok('H1 the job\'s Invoices and Expenses lines say "Paid on ABC Supply Co., Inc. statement #ST-1115-0457 (2026-11-15), check 5012"; other bills say nothing', /Paid on ABC Supply Co\., Inc\. statement #ST-1115-0457 \(2026-11-15\), check 5012/.test(H1[0]) && /check 5012/.test(H1[1]) && H1[2] === '', H1);
ok('H2 no page errors / popups (data flows)', !A.errs.length, A.errs);
if (SHOTS) { await pg.evaluate(() => window._gcSupStmt.open({ id: window.SID })); await new Promise(r => setTimeout(r, 300)); await pg.screenshot({ path: path.join(SHOTS, 'supstmt_paid_desk.png'), fullPage: true }); }

/* ═════ I. who may ═════ */
const I1 = await pg.evaluate(async () => {
  const S = window._gcSupStmt, out = {};
  const root = document.createElement('div'); root.id = 'gck-root'; root.innerHTML = '<div class="gck-top"><div class="gck-tools"><span id="gc-money-acct"><button>💳</button></span></div></div><div class="gck-body"></div>'; document.body.prepend(root);
  S.close();
  for (const who of ['office', 'owner', 'books', 'crew']) {
    window.__WHO = who; S.paint();
    const btn = document.getElementById('gc-ss-acct');
    out[who] = { can: S.canUse(), lump: window._gcLumpSum.canUse(), btn: !!btn, next: !!(btn && btn.previousElementSibling && btn.previousElementSibling.id === 'gc-money-acct') };
  }
  window.__WHO = 'crew';
  out.crewOpen = (S.open({}) || {}).refused === true && !!document.querySelector('#gc-ss [data-ss="refused"]');
  out.crewRead = (await S.read({ supplier: 'ABC Supply Co., Inc.', text: '10/02/26 9999 100.00' })).error || '';
  out.crewPay = (await S.pay(window.SID, { amount: 1 })).error || '';
  S.close();
  window.__WHO = 'owner'; window.__VAS = true; out.vas = S.canUse(); window.__VAS = false;
  window.__WHO = 'office'; S.paint();
  return out;
});
ok('I1 the office, an admin and a Bookkeeper (accounting role) get 🧾 Supplier statement on Accounting\'s tool row next to the 💳 / 🏦 imports', I1.office.can && I1.office.btn && I1.office.next && I1.owner.can && I1.owner.btn && I1.books.can && I1.books.btn && I1.books.lump, I1);
ok('I2 crew: no button, the screen says it is for admins / office / accounting, read and pay refused; an admin "viewing as" someone: refused', !I1.crew.can && !I1.crew.btn && I1.crewOpen && /admins, the office and accounting/.test(I1.crewRead) && /admins, the office and accounting/.test(I1.crewPay) && I1.vas === false, I1);

/* ═════ J. the panel (desk) ═════ */
fs.writeFileSync(path.join(FX, 'ui.csv'), 'Invoice Date,Invoice #,Type,PO #,Ship To,Description,Amount\n11/01/26,2347001-00,INV,T601,,KITCHEN TRIM,410.00\n11/03/26,2347002-00,INV,,4500 Poplar Ave,REROOF NAILS,95.50\n11/04/26,2347003-00,INV,,,COUNTER SALE,60.00\n11/06/26,2347004-00,CM,T602,,RETURN,-20.00\n');
const J1 = await pg.evaluate(async () => {
  const S = window._gcSupStmt; S.open({});
  const el = document.getElementById('gc-ss'), out = {};
  out.inline = !!el && el.parentElement && el.parentElement.id === 'gck-root' && !el.classList.contains('float') && getComputedStyle(el).position !== 'fixed';
  el.querySelector('[data-ss="new"]').click();
  const set = (k, v) => { const i = el.querySelector('[data-ss-f="' + k + '"]'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
  set('supplier', 'ABC Supply Co., Inc.'); set('stmtNo', 'ST-UI-1'); set('stmtDate', '2026-11-15');
  return out;
});
await pg.setInputFiles('#gc-ss [data-ss-f="file"]', path.join(FX, 'ui.csv'));
await pg.click('#gc-ss [data-ss="read"]');
await pg.waitForSelector('#gc-ss tr[data-ss-line="L4"]', { timeout: 15000 }).catch(() => {});
const J2 = await pg.evaluate(() => { const el = document.getElementById('gc-ss'); return { rows: el.querySelectorAll('tr[data-ss-line]').length, st: [...el.querySelectorAll('tr[data-ss-line]')].map(r => r.getAttribute('data-st')), chips: el.querySelector('.cnts') && el.querySelector('.cnts').textContent, pay: el.querySelector('[data-ss="pay"]').disabled, msg: (el.querySelector('[data-ss="msg"]') || {}).textContent }; });
ok('J1 the panel is inline on Accounting (no cover); enter → CSV file → 📖 Read → 4 rows: ➕ P1 (PO) · ➕ P3 (address) · ❓ · 💸', J1.inline && J2.rows === 4 && J2.st.join() === 'new,new,nojob,credit' && /Read 4 lines/.test(J2.msg) && J2.pay === true, { J1, J2 });
await pg.click('#gc-ss tr[data-ss-line="L3"] [data-ss="pk"]');
await pg.fill('#gc-ss [data-ss="pq"]', 'garage');
const J3 = await pg.evaluate(() => [...document.querySelectorAll('#gc-ss [data-ss-pk] [data-ss="setjob"][data-pid]')].map(b => b.getAttribute('data-pid')));
await pg.click('#gc-ss [data-ss-pk] [data-ss="setjob"][data-pid="P6"]');
const J4 = await pg.evaluate(() => { const S = window._gcSupStmt, st = S._t.state(), r = S.get(st.id), l = r.lines.find(x => x.id === 'L3'); return { h: l.h.pid, v: S.view(st.id).V.find(x => x.id === 'L3') }; });
ok('J2 📍 Job → search "garage" → Demo Garage → the line is on P6, as the person\'s pick', J3.includes('P6') && J4.h && J4.h.v === 'P6' && J4.h.by === 'Brit Demo' && J4.v.how === 'person', { J3, h: J4.h });
const J5 = await pg.evaluate(async () => {
  const el = document.getElementById('gc-ss'), S = window._gcSupStmt, id = S._t.state().id, out = {};
  /* this statement's still-open lines: L3 (→ P5 already paid on the other statement?) — tick what is open, and pay less than the total */
  const amt = el.querySelector('[data-ss-p="amount"]'); out.total = S.view(id).inc.total;
  amt.value = '500'; amt.dispatchEvent(new Event('input', { bubbles: true }));
  out.disabledShort = el.querySelector('[data-ss="pay"]').disabled; out.diff = el.querySelector('[data-ss="paydiff"]').textContent; out.need = S.view(id).need; out.amtNow = el.querySelector('[data-ss-p="amount"]').value; out.btn = el.querySelector('[data-ss="pay"]').outerHTML.slice(0, 80);
  const ob = el.querySelector('[data-ss="oldest"]'); out.hasOldest = !!ob; if (ob) ob.click();
  await new Promise(r => setTimeout(r, 50));
  out.after = S.view(id).inc.total; out.disabledAfter = el.querySelector('[data-ss="pay"]').disabled;
  return out;
});
ok('J3 $500 against $545.50 ticked: "short by $45.50", 💵 Pay disabled; ⚡ Apply oldest first (credit first, then oldest bills) → it balances → Pay enabled', Math.abs(J5.total - 545.5) < 0.005 && J5.disabledShort && /short by \$45\.50/.test(J5.diff) && J5.hasOldest && Math.abs(J5.after - 500) < 0.005 && J5.disabledAfter === false, J5);
if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'supstmt_desk.png'), fullPage: true });
const J6 = await pg.evaluate(() => { const el = document.getElementById('gc-ss'); el.querySelector('[data-ss="list"]').click(); return { groups: el.querySelectorAll('[data-ss-sup]').length, rows: [...el.querySelectorAll('tr[data-ss-row]')].map(r => r.textContent.replace(/\s+/g, ' ')), }; });
ok('J4 🗂 Statements: grouped per supplier with total / paid / open, each statement with its status (Paid / Open)', J6.groups === 1 && J6.rows.length >= 3 && J6.rows.some(t => /ST-1215-0457/.test(t) && /Open/.test(t) && /\$3,120\.00/.test(t)) && J6.rows.some(t => /ST-1115-0457/.test(t) && /Paid/.test(t)) && J6.rows.some(t => /ST-UI-1/.test(t) && /(Open|Partly)/.test(t)), J6);
ok('J5 no page errors / popups (panel)', !A.errs.length, A.errs);

/* ═════ J6. phone ═════ */
const M = await page({ viewport: { width: 390, height: 844 }, mobile: true, who: 'office' });
await M.pg.evaluate(list => { window._gcSupStmt._t.setList(list); }, KVS.length ? JSON.parse(KV.gc_sup_statements) : []);
const M1 = await M.pg.evaluate(async (sid) => {
  const S = window._gcSupStmt; const root = document.createElement('div'); root.id = 'gck-root'; root.innerHTML = '<div class="gck-top"><div class="gck-tools"></div></div><div class="gck-body"></div>'; document.body.prepend(root);
  S.open({ id: sid }); await new Promise(r => setTimeout(r, 200));
  const el = document.getElementById('gc-ss'), tr = el.querySelector('tr[data-ss-line="L2"]'), pay = tr.querySelector('button'), pb = pay.getBoundingClientRect();
  return { docW: document.documentElement.scrollWidth, vw: innerWidth, elW: el.scrollWidth, elC: el.clientWidth, trDisp: tr && getComputedStyle(tr).display, payH: Math.round(pb.height), payW: Math.round(pb.width), cells: tr && [...tr.querySelectorAll('td[data-l]')].length };
}, RD.id);
ok('J6 phone (390 wide): no sideways scroll, each line is a card, buttons tall enough to tap', M1.docW <= M1.vw + 1 && M1.elW <= M1.elC + 1 && M1.trDisp === 'block' && M1.payH >= 36 && M1.cells >= 8, M1);
if (SHOTS) await M.pg.screenshot({ path: path.join(SHOTS, 'supstmt_phone.png'), fullPage: true });
ok('J7 no page errors (phone)', !M.errs.length, M.errs);

/* ═════ K. speed: company-sized made-up data ═════ */
const PJ = [], IV = [];
for (let i = 0; i < 480; i++) PJ.push({ id: 'Q' + i, name: 'Demo Job ' + i + ' ' + ['Kitchen', 'Bath', 'Roof', 'Deck', 'Siding', 'Garage'][i % 6], client: 'Demo Client ' + i, address: (100 + i) + ' ' + ['Oak', 'Maple', 'Cedar', 'Elm', 'Pine', 'Birch'][i % 6] + ' St, Memphis, TN', autoPO: 'K' + (1000 + i), status: i % 3 ? 'Active' : 'completed' });
for (let i = 0; i < 2400; i++) IV.push({ id: 'IV' + i, type: 'sub', pid: 'Q' + (i % 480), sub: i % 4 ? 'Demo Supplier ' + (i % 30) : SUP, invNum: String(800000 + i), amt: 100 + (i % 500), date: '2026-10-' + String(1 + (i % 28)).padStart(2, '0'), status: i % 2 ? 'paid' : 'received' });
let txt = 'Inv Date\tInvoice #\tType\tCustomer PO\tShip To\tJob Name\tAmount\n';
for (let k = 0; k < 150; k++) { const i = k * 16; const p = PJ[i % 480]; txt += ['10/' + String(1 + (i % 28)).padStart(2, '0') + '/26', String(800000 + i) + '-00', 'INV', k % 3 === 0 ? p.autoPO : '', k % 3 === 1 ? p.address.split(',')[0] : '', k % 3 === 2 ? p.name : 'MATERIALS', (100 + (i % 500)).toFixed(2)].join('\t') + '\n'; }
const K = await page({ projects: PJ, inv: IV, exp: [], longtasks: true });
const K1 = await K.pg.evaluate(async (t) => {
  await new Promise(r => setTimeout(r, 300)); window.__LT = []; const t0 = performance.now();
  const r = await window._gcSupStmt.read({ supplier: 'ABC Supply Co., Inc.', stmtNo: 'PERF-1', text: t });
  const t1 = performance.now(); window._gcSupStmt.open({ id: r.rec.id }); const t2 = performance.now();
  await new Promise(res => setTimeout(res, 400));
  const v = window._gcSupStmt.view(r.rec.id).V;
  return { err: r.error, n: v.length, matched: v.filter(x => x.invId).length, jobs: v.filter(x => x.pid).length, readMs: Math.round(t1 - t0), drawMs: Math.round(t2 - t1), worst: Math.max(0, ...window.__LT.map(x => x.ms)), lts: window.__LT.length, matchMs: r.rec.matchMs };
}, txt);
ok('K1 480 jobs · 2,400 bills · a 150-line statement: all 150 read, matched to their bills and jobs', !K1.err && K1.n === 150 && K1.matched === 150 && K1.jobs === 150, K1);
ok('K2 no long task over 300 ms while reading, matching and drawing (worst ' + K1.worst + ' ms; read ' + K1.readMs + ' ms, draw ' + K1.drawMs + ' ms)', K1.worst < 300 && K1.drawMs < 300, K1);
ok('K3 no page errors (speed run)', !K.errs.length, K.errs);

await browser.close();
const n = R.filter(Boolean).length; console.log(`SUPSTMT ${n}/${R.length}`); process.exit(n === R.length ? 0 : 1);
