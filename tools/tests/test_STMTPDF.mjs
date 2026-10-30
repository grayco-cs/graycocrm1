// test_STMTPDF.mjs <build-dir> — patch STMTPDF in the browser, made-up statements only (offline harness, nothing leaves the computer).
//   Fixtures: tools/tests/stmtpdf/make_fixtures.py draws 16 text PDFs the way each bank lays out its statement (Chase with a
//   Dec→Jan year, a 3-page Amex with two-line merchants, Capital One month-name dates, Citi, Bank of America with reference
//   numbers, Wells Fargo Credits | Charges columns, Discover's category column, US Bank "CR", and First Horizon, Regions,
//   Renasant, Simmons, Trustmark, Truist, Independent Bank, Orion FCU checking statements), one whose lines do not add up,
//   one picture-only PDF, and QuickBooks Online CSV exports (header block, totals rows, 1,234.56 / (3,200.00) / -61.50).
//   OFFICE: every PDF → exactly the expected lines (count, dates, amounts, money in / out, kind, check #), the statement's
//   own balance check passes (and warns on the bad one); To-Do → 💳 Import card statement → the Chase PDF → the review
//   table with jobs (PO / address) and categories → Import → the costs are on the jobs; the same PDF again → every line
//   "already in", nothing added; a Capital One CSV then the PDF of the same statement → caught; 🏦 Import bank statement
//   → First Horizon PDF → checks / withdrawals as expenses with check #, deposits and the card payment left out, the bank
//   check says "Ask Wesley to finish the database setup"; 💎 Bank Accounts → the same message; the picture PDF → the plain
//   message; Credit Card Entry and Expenses → 📊 CC Statement → 📁 Upload Statement take a PDF straight into the import.
//   OWNER: QuickBooks Invoice List / Bill List / Customer + Vendor lists / Transaction Detail by Account / Transaction
//   List by Date import as history: right kinds, totals, open balances, nothing e-mailed; the Monthly Bank Check runs on a
//   PDF's lines. No page errors.
// Harness: GC_HARNESS (default the session scratchpad's wN/harness_N.mjs).
import { pathToFileURL } from 'url';
import fs from 'fs'; import path from 'path'; import os from 'os'; import { execFileSync } from 'child_process';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
const PDFJS = process.env.GC_PDFJS || SPD + '/wSG/tb_sg/vendor/pdfjs';
const { computer, sleep, waitFor, cset, cget, signIn, cloud } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_STMTPDF.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

/* ── fixtures ── */
const FX = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'stmtpdf-'));
execFileSync('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'stmtpdf', 'make_fixtures.py'), FX], { stdio: 'inherit' });
const NAMES = JSON.parse(fs.readFileSync(FX + '/index.json', 'utf8'));
const EXP = Object.fromEntries(NAMES.map(n => [n, JSON.parse(fs.readFileSync(FX + '/' + n + '.json', 'utf8'))]));

/* ── made-up world ── */
const pad = n => String(n).padStart(2, '0');
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
cloud.clear();
const iso = new Date().toISOString();
cset('users', [{ id: 'U1', name: 'Demo Office', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { id: 'U2', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [
  { id: 'P1', name: 'Demo Hollis Reroof', address: '8382 Laurett Cove, Cordova, TN', autoPO: 'A101', pm: 'Demo Owner', client: 'Demo Hollis', status: 'Active', contract: 20000, type: 'Residential', created: day(-90), savedAt: iso, updatedAt: iso },
  { id: 'P2', name: 'Demo Brent Kitchen', address: '123 Senatobia Dr, Hernando, MS', autoPO: 'T724', pm: 'Demo Owner', client: 'Demo Brent', status: 'Active', contract: 30000, type: 'Residential', created: day(-90), savedAt: iso, updatedAt: iso },
  { id: 'P3', name: 'Demo Qbo Client A Roof', address: '100 Demo St, Memphis, TN', autoPO: 'Q500', pm: 'Demo Owner', client: 'Demo Qbo Client A', status: 'Active', contract: 25000, type: 'Residential', created: '2024-12-01', savedAt: iso, updatedAt: iso }
]);
cset('invs', []);
cset('expenses', [{ id: 'E1', pid: 'P2', type: 'purchase', vendor: 'HOME DEPOT 6620', desc: 'screws', amt: 40, category: 'Materials', status: 'approved', approved: true, date: day(-8), payMethod: 'Credit Card', savedAt: iso, updatedAt: iso }]);
const old = new Date(Date.now() - 3600e3).toISOString(); for (const [k, r] of cloud) cloud.set(k, Object.assign({}, r, { updated_at: old }));

async function machine(name){
  const C = await computer(name, { build });
  C.fn = [];
  await C.ctx.route(u => new URL(u).pathname.startsWith('/.netlify/functions/'), r => { C.fn.push({ t: Date.now(), url: r.request().url(), method: r.request().method() }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await C.ctx.route(u => /pdf(\.worker)?\.min\.js$/.test(new URL(u).pathname), r => r.fulfill({ path: PDFJS + '/' + (/worker/.test(r.request().url()) ? 'pdf.worker.min.js' : 'pdf.min.js'), contentType: 'text/javascript' }));
  return C;
}
const pdfB64 = n => fs.readFileSync(FX + '/' + n + '.pdf').toString('base64');
async function parseIn(C, n, mode){
  return C.page().evaluate(async ([b64, mode]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return JSON.parse(JSON.stringify(await window._gcStmt.parsePdf(u.buffer, mode))); }, [pdfB64(n), mode]);
}
const key = r => r.date + ' ' + r.dir + ' ' + Number(r.amount != null ? r.amount : r.amt).toFixed(2) + ' ' + r.kind + (r.checkNo || r.check ? ' #' + (r.checkNo || r.check) : '');
const closeX = async p => { await p.evaluate(() => { const x = document.querySelector('.gc-money-imp [data-c="x"]'); if (x) x.click(); }); };
async function openTodo(p){ await p.evaluate(() => { const b = [...document.querySelectorAll('aside nav button, nav button')].find(y => y.offsetParent && /To-Do/.test(y.textContent)); if (b) b.click(); }); }
async function loadFile(C, file){
  const p = C.page();
  await p.setInputFiles('.gc-money-imp [data-c="file"]', file);
  return waitFor(C, () => document.querySelectorAll('.gc-money-imp tr[data-r], .gc-money-imp tr[data-x]').length > 0 || !!document.querySelector('.gc-money-imp [data-c="image"]') || /No transactions|could not|password/i.test((document.querySelector('.gc-money-imp [data-c="msg"]') || {}).textContent || ''), null, 45000);
}
const table = p => p.evaluate(() => ({
  r: [...document.querySelectorAll('.gc-money-imp tr[data-r]')].map(tr => ({ d: tr.children[2].textContent, amt: tr.children[3].textContent, cat: tr.querySelector('[data-c="cat"]').value, job: tr.querySelector('[data-c="job"]').value, why: tr.children[6].textContent, on: tr.querySelector('[data-c="on"]').checked, dup: !!tr.querySelector('[data-c="dup"]') })),
  x: [...document.querySelectorAll('.gc-money-imp tr[data-x]')].map(tr => tr.textContent),
  totals: (document.querySelector('.gc-money-imp [data-c="totals"]') || {}).textContent || '',
  okTxt: !!document.querySelector('.gc-money-imp [data-c="stmtok"]'), warn: !!document.querySelector('.gc-money-imp [data-c="stmtwarn"]'),
  msg: (document.querySelector('.gc-money-imp [data-c="msg"]') || {}).textContent || '',
  card: (document.querySelector('.gc-money-imp [data-c="card"]') || {}).value, newcard: (document.querySelector('.gc-money-imp [data-c="newcard"]') || {}).value, acct: (document.querySelector('.gc-money-imp [data-c="acct"]') || {}).value }));
const expCount = p => p.evaluate(() => (window._crm.expenses || []).filter(e => !e.deleted).length);

/* ════════════════ OFFICE ════════════════ */
console.log('— the office (Brittany\'s sign-in) —');
const A = await machine('office');
const p = A.page(); await p.setViewportSize({ width: 1400, height: 900 });
await signIn(A, 'office@grayco-cs.com', 1500);
ok(await waitFor(A, () => !!(window._gcStmt && window._gcMoney && window._crm && (window._crm.projects || []).length === 3 && window._gcAddCardCharge && window._setExpenses), null, 90000), 'the CRM loaded with the statement reader');
await p.evaluate(() => { for (const b of [...document.querySelectorAll('button')]) if (b.offsetParent && /^(Later|Got it!?|Not now|×|✕)$/.test(b.textContent.trim())) b.click(); }).catch(() => {});

/* 1. every layout → exactly the expected lines */
for (const n of NAMES) {
  const e = EXP[n], r = await parseIn(A, n, e.kind);
  const got = (r.rows || []).map(key).sort(), want = e.rows.map(key).sort();
  const sum = rs => Math.round(rs.reduce((a, x) => a + (x.dir === 'out' ? 1 : -1) * Number(x.amount != null ? x.amount : x.amt), 0) * 100) / 100;
  const same = JSON.stringify(got) === JSON.stringify(want);
  ok(same && sum(r.rows || []) === sum(e.rows), `${n}: ${want.length} lines, net ${sum(e.rows)} (dates, amounts, in/out, kind${e.kind === 'bank' ? ', check #' : ''})`, same ? { sum: sum(r.rows || []) } : { missing: want.filter(x => !got.includes(x)), extra: got.filter(x => !want.includes(x)) });
  if (e.mismatch) ok(r.check && r.check.ok === false && Math.abs(r.check.diff) === 75, `${n}: the lines do not add up to the statement → flagged (off by $75)`, r.check);
  else ok(r.check && r.check.ok === true, `${n}: the statement's own balance check matches`, r.check);
  ok((r.info || {}).last4 === e.last4, `${n}: ${e.kind} ••${e.last4} found`, r.info);
  if (n === 'amex_card') ok(r.pages === 3 && r.rows.filter(x => /MEMPHIS TN$|HERNANDO MS$|OLIVE BRANCH MS$/.test(x.desc)).length >= 20, 'Amex: 3 pages, the city line joined to its merchant', r.rows.slice(0, 3).map(x => x.desc));
  if (n === 'chase_card') ok(r.rows.some(x => x.date === '2025-12-16') && r.rows.some(x => x.date === '2026-01-09'), 'Chase 12/14/25–01/13/26: December is 2025, January 2026');
  if (n === 'orion_bank') ok(r.rows.some(x => x.date === '2025-12-18') && r.rows.some(x => x.date === '2026-01-06'), 'Orion 12/15/2025–01/14/2026: Dec→Jan years');
}
const scan = await parseIn(A, 'scan', 'card');
ok(scan.error === 'image' && /picture, not text/.test(scan.message) && !(scan.rows || []).length, 'a picture-only PDF → "This PDF is a picture, not text…", nothing read', scan);

/* 2. To-Do → 💳 Import card statement → the Chase PDF → review → Import */
await openTodo(p);
ok(await waitFor(A, () => !!document.querySelector('#gc-money-needs [data-mn="import"]') && !!document.querySelector('#gc-money-needs [data-mn="bank"]'), null, 40000), 'the To-Do shows 💳 Import card statement and 🏦 Import bank statement');
await p.click('#gc-money-needs [data-mn="import"]');
await waitFor(A, () => !!document.querySelector('.gc-money-imp [data-c="file"]'), null, 10000);
ok(/\.pdf/.test(await p.getAttribute('.gc-money-imp [data-c="file"]', 'accept')), 'the file button takes a PDF');
const n0 = await expCount(p);
ok(await loadFile(A, FX + '/chase_card.pdf'), 'the Chase PDF is read');
let T = await table(p);
ok(T.r.length === 7 && T.x.length === 1 && /Payment Thank You/.test(T.x[0]), 'review table: 7 lines to import (5 charges, the refund, the interest), the payment listed but left out', T);
const R = re => T.r.find(x => re.test(x.d)) || {};
ok(R(/LOWE/).job === 'P1' && /PO A101/.test(R(/LOWE/).why), 'job suggestion: "PO A101" in the memo → the PO\'s job', R(/LOWE/));
ok(R(/ABC SUPPLY 8382 LAURETT COVE/).job === 'P1' && /8382 Laurett/.test(R(/ABC SUPPLY/).why), 'job suggestion: the two-line merchant\'s address → the open job there', R(/ABC SUPPLY/));
ok(R(/FACEBK/).cat === 'Advertising/Marketing' && R(/HOME DEPOT #6620 MEMPHIS/).cat === 'Materials', 'categories: FACEBK → Advertising/Marketing, Home Depot → Materials', [R(/FACEBK/), R(/HOME DEPOT #6620 MEMPHIS/)]);
ok(/−\$45\.10/.test(R(/RETURN/).amt) && R(/INTEREST/).cat === 'Interest', 'the refund shows as −$45.10; the interest charge is Interest', [R(/RETURN/), R(/INTEREST/)]);
ok(T.okTxt && !T.warn && /2,000\.00/.test(T.totals) && /2,674\.24/.test(T.totals), 'totals with the statement\'s own previous → new balance: ✓ matches', T.totals);
ok(T.newcard === 'Chase 4421', 'the card ••4421 read off the statement (a new card)', T.newcard);
await p.click('.gc-money-imp [data-c="go"]');
ok(await waitFor(A, () => /6 charges added · 1 refunds/.test((document.querySelector('.gc-money-imp [data-c="done"]') || {}).textContent || ''), null, 30000), 'Import → "✓ 6 charges added · 1 refunds / credits"', await p.evaluate(() => (document.querySelector('.gc-money-imp [data-c="prev"]') || {}).textContent));
await sleep(800);
const ex1 = await p.evaluate(() => { const ex = window._crm.expenses; const f = re => ex.find(e => re.test(e.vendor || e.desc || '')) || {}; return { n: ex.filter(e => !e.deleted).length, lowes: f(/LOWE/).pid, abc: f(/ABC SUPPLY/).pid, refund: ex.filter(e => e.amt < 0).map(e => [e.amt, e.cardId ? 'card' : '']), cardIds: [...new Set(ex.filter(e => e.cardId).map(e => e.cardId))].length }; });
ok(ex1.n === n0 + 7 && ex1.lowes === 'P1' && ex1.abc === 'P1' && ex1.refund.length === 1 && ex1.refund[0][0] === -45.1, '7 expenses added on their jobs (the refund −$45.10)', ex1);
await closeX(p);

/* 3. the same PDF again → every line already in */
await p.click('#gc-money-needs [data-mn="import"]');
await waitFor(A, () => [...document.querySelectorAll('.gc-money-imp [data-c="card"] option')].some(o => /4421/.test(o.textContent)), null, 15000);
await loadFile(A, FX + '/chase_card.pdf');
T = await table(p);
ok(T.r.length === 7 && T.r.every(x => x.dup && !x.on) && /4421/.test(await p.evaluate(() => document.querySelector('.gc-money-imp [data-c="card"]').selectedOptions[0].textContent)) && !T.newcard, 'the same PDF twice: the card is picked by its last 4 and all 7 lines are "already in", none ticked', T.r.map(x => [x.d.slice(0, 20), x.dup, x.on]));
ok(/Every line is already in the CRM/.test(T.totals), '"Every line is already in the CRM — this statement was imported before"', T.totals);
await p.click('.gc-money-imp [data-c="go"]');
ok(await waitFor(A, () => /0 charges added · 7 were already in/.test((document.querySelector('.gc-money-imp [data-c="done"]') || {}).textContent || ''), null, 20000), 'Import → "0 charges added · 7 were already in"');
ok(await expCount(p) === ex1.n, 'nothing doubled', { before: ex1.n, after: await expCount(p) });
await closeX(p);

/* 4. the Capital One CSV, then the PDF of the same statement */
const capCsv = ['Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit']
  .concat(EXP.capone_card.rows.map(r => `${r.date},${r.date},9902,"${r.desc}",Other,${r.dir === 'out' ? r.amt.toFixed(2) : ''},${r.dir === 'in' ? r.amt.toFixed(2) : ''}`)).join('\n');
fs.writeFileSync(FX + '/capone.csv', capCsv);
await p.click('#gc-money-needs [data-mn="import"]');
await waitFor(A, () => !!document.querySelector('.gc-money-imp [data-c="file"]'), null, 10000);
await p.fill('.gc-money-imp [data-c="newcard"]', 'Capital One 9902');
await loadFile(A, FX + '/capone.csv');
T = await table(p);
ok(T.r.length === 6 && T.x.length === 1, 'Capital One CSV: 4 charges + the late fee + the refund to import, the autopay left out', T);
await p.click('.gc-money-imp [data-c="go"]');
await waitFor(A, () => !!document.querySelector('.gc-money-imp [data-c="done"]'), null, 20000);
const csvDone = await p.evaluate(() => (document.querySelector('.gc-money-imp [data-c="done"]') || {}).textContent || '');
ok(/^✓ 5 charges added · 1 refunds/.test(csvDone), 'the CSV imported: 5 charges, 1 refund', csvDone);
await sleep(800);
const n2 = await expCount(p);
await closeX(p);
await p.click('#gc-money-needs [data-mn="import"]');
await waitFor(A, () => [...document.querySelectorAll('.gc-money-imp [data-c="card"] option')].some(o => /9902/.test(o.textContent)), null, 15000);
await loadFile(A, FX + '/capone_card.pdf');
T = await table(p);
ok(T.r.length === 6 && T.r.every(x => x.dup && !x.on) && T.okTxt, 'then the PDF of that statement: all 6 lines caught as "already in" (same card, date, amount); the totals still match', T.r.map(x => [x.d.slice(0, 24), x.dup]));
await p.click('.gc-money-imp [data-c="go"]'); await sleep(1500);
ok(await expCount(p) === n2, 'CSV + PDF of one statement: not double-counted', { n2, after: await expCount(p) });
await closeX(p);

/* 5. 🏦 Import bank statement (the office, before docs/office-full-access.sql) */
await p.click('#gc-money-needs [data-mn="bank"]');
await waitFor(A, () => document.querySelector('.gc-money-imp') && document.querySelector('.gc-money-imp').getAttribute('data-mode') === 'bank', null, 10000);
const n3 = await expCount(p);
ok(await loadFile(A, FX + '/firsthorizon_bank.pdf'), 'the First Horizon PDF is read');
T = await table(p);
ok(T.r.length === 6 && T.x.length === 3 && T.x.some(x => /TRANSFER TO CHASE CARD/.test(x)) && T.x.filter(x => /Deposit/.test(x)).length === 2, 'bank review: 3 checks + 3 withdrawals to import; 2 deposits and the card payment listed, left out', T);
ok(T.r.filter(x => /check #12\d\d/.test(x.d)).length === 3 && /−\$1,850\.00/.test((T.r.find(x => /1201/.test(x.d)) || {}).amt), 'checks with their numbers, money out shown as −', T.r.map(x => x.d + ' ' + x.amt));
ok(T.okTxt && /5,000\.00/.test(T.totals) && /11,057\.10/.test(T.totals), 'bank totals: beginning → ending balance ✓ matches', T.totals);
ok(/First Horizon ••8832/.test(T.acct), 'the account read off the statement', T.acct);
ok((T.r.find(x => /HOME DEPOT/.test(x.d)) || {}).cat === 'Materials', 'categories on bank lines too');
await p.click('.gc-money-imp [data-c="recon"]');
ok(await waitFor(A, () => /Ask Wesley to finish the database setup/.test((document.querySelector('.gc-money-imp [data-c="needsql"]') || {}).textContent || ''), null, 5000), 'the bank check, office without the cash records → "Ask Wesley to finish the database setup"');
await p.click('.gc-money-imp [data-c="go"]');
ok(await waitFor(A, () => /6 costs added from the bank statement/.test((document.querySelector('.gc-money-imp [data-c="done"]') || {}).textContent || ''), null, 20000), 'Import → "6 costs added from the bank statement"');
await sleep(600);
const bx = await p.evaluate(() => window._crm.expenses.filter(e => e.source === 'bank-statement').map(e => ({ ref: e.ref, amt: e.amt, pm: e.payMethod, st: e.status, acct: e.bankAcct })));
ok(bx.length === 6 && bx.filter(e => e.pm === 'Check' && /^12\d\d$/.test(e.ref)).length === 3 && bx.every(e => e.st === 'paid' && /8832/.test(e.acct)), 'paid expenses with check # and the account', bx);
await closeX(p);
await p.click('#gc-money-needs [data-mn="bank"]');
await waitFor(A, () => !!document.querySelector('.gc-money-imp [data-c="file"]'), null, 10000);
await loadFile(A, FX + '/firsthorizon_bank.pdf');
T = await table(p);
ok(T.r.length === 6 && T.r.every(x => x.dup && !x.on), 'the same bank PDF again: every line "already in"', T.r.map(x => [x.d.slice(0, 20), x.dup]));
await closeX(p);
ok(await expCount(p) === n3 + 6, 'bank lines not doubled', { n3, after: await expCount(p) });

/* 6. 💎 Bank Accounts as the office → the bank import with the plain message */
const door = await p.evaluate(() => { const r = window._gcStmtBankDoor('accounts'); const n = document.querySelector('.gc-money-imp [data-c="note"]'); return { r, note: n ? n.textContent : '', mode: (document.querySelector('.gc-money-imp') || {}).getAttribute && document.querySelector('.gc-money-imp').getAttribute('data-mode') }; });
ok(door.r === true && door.mode === 'bank' && /Ask Wesley to finish the database setup/.test(door.note), '💎 Bank Accounts (office) → 🏦 Import bank statement with "Ask Wesley to finish the database setup"', door);

/* 7. the picture PDF in the window */
await loadFile(A, FX + '/scan.pdf');
ok(await p.evaluate(() => /This PDF is a picture, not text — download the CSV from the bank website, or paste the lines\./.test((document.querySelector('.gc-money-imp [data-c="image"]') || {}).textContent || '') && !document.querySelector('.gc-money-imp tr[data-r]')), 'a scanned PDF → the plain message, nothing to import');
await closeX(p);

/* 8. the other doors take a PDF */
await p.evaluate(() => window._gcOpenCCManager());
ok(await waitFor(A, () => !!document.querySelector('#_ccPaste') && !!document.querySelector('.gc-stmt-door [data-door-file="card"]'), null, 5000), 'Credit Card Entry says what it is and has a PDF / CSV button pointing to 💳 Import card statement');
await p.setInputFiles('.gc-stmt-door [data-door-file="card"]', FX + '/citi_card.pdf');
ok(await waitFor(A, () => document.querySelectorAll('.gc-money-imp tr[data-r]').length === 4, null, 30000), 'Credit Card Entry → a PDF → the import window with its 4 lines to import (3 charges, 1 refund)');
await closeX(p);
await p.evaluate(() => { document.querySelectorAll('div').forEach(d => { if (d.querySelector && d.querySelector(':scope > div #_ccPaste') && getComputedStyle(d).position === 'fixed') d.remove(); }); const x = document.getElementById('_ccClose'); if (x) x.click(); });
await p.evaluate(() => { const b = [...document.querySelectorAll('aside nav button, nav button')].find(y => y.offsetParent && /Expenses/.test(y.textContent)); if (b) b.click(); });
await waitFor(A, () => [...document.querySelectorAll('button')].some(b => b.offsetParent && /CC Statement/.test(b.textContent)), null, 20000);
await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.offsetParent && /📊 CC Statement/.test(b.textContent)); if (b) b.click(); });
await sleep(500);
const hasUp = await p.evaluate(() => !!document.querySelector('input[type=file][accept=".pdf,.csv,.jpg,.jpeg,.png,.xlsx,.xls"]'));
if (hasUp) {
  await p.setInputFiles('input[type=file][accept=".pdf,.csv,.jpg,.jpeg,.png,.xlsx,.xls"]', FX + '/discover_card.pdf');
  ok(await waitFor(A, () => document.querySelectorAll('.gc-money-imp tr[data-r]').length === 3, null, 30000), 'Expenses → 📊 CC Statement → 📁 Upload Statement → a PDF → the import window (3 charges), not the AI reader');
  ok(A.fn.filter(x => /claude-proxy/.test(x.url)).length === 0, 'the PDF was read in the browser (no AI call)');
  await closeX(p);
} else ok(false, 'Expenses → 📊 CC Statement upload found');
ok(A.errs.length === 0, 'office: no page errors', A.errs.slice(0, 5));

/* ════════════════ OWNER ════════════════ */
console.log('— the owner —');
await A.b.close();
const B = await machine('owner');
const q = B.page(); await q.setViewportSize({ width: 1400, height: 900 });
B.acceptConfirm = true;
await signIn(B, 'wjohnson@grayco-cs.com', 1500);
ok(await waitFor(B, () => !!(window._gcStmt && window._gcQbCsvPlan && window._crm && (window._crm.projects || []).length === 3), null, 90000), 'the owner\'s CRM loaded');
await q.evaluate(() => { for (const b of [...document.querySelectorAll('button')]) if (b.offsetParent && /^(Later|Got it!?|Not now|×|✕)$/.test(b.textContent.trim())) b.click(); }).catch(() => {});
const qb = n => fs.readFileSync(FX + '/' + n, 'utf8');
const plans = {};
for (const f of ['qbo_invoice_list.csv', 'qbo_bill_list.csv', 'qbo_customer_contact_list.csv', 'qbo_vendor_contact_list.csv', 'qbo_transaction_detail_by_account.csv', 'qbo_transaction_list_by_date.csv']) {
  plans[f] = await q.evaluate(async t => { const pl = await window._gcQbCsvPlan(t); return { kind: pl.kind, label: pl.label, history: pl.history, error: pl.error, rows: (pl.rows || []).map(r => ({ a: r.action, k: r.rec.kind, num: r.rec.num, name: r.rec.name, amt: r.rec.amount, open: r.rec.open, date: r.rec.date, acct: r.rec.account, phone: r.rec.phone })) }; }, qb(f));
}
const PL = plans;
ok(PL['qbo_invoice_list.csv'].kind === 'invoicelist' && PL['qbo_invoice_list.csv'].rows.length === 3 && PL['qbo_invoice_list.csv'].rows.map(r => r.amt + '/' + r.open).join(' ') === '25000/0 4250/4250 9875.5/2000' && PL['qbo_invoice_list.csv'].history === true,
  'Invoice List: header block and TOTAL row skipped; 25,000.00 / open balances read; dated before today → history', PL['qbo_invoice_list.csv']);
ok(PL['qbo_bill_list.csv'].kind === 'billlist' && PL['qbo_bill_list.csv'].rows.every(r => r.k === 'bill') && PL['qbo_bill_list.csv'].rows.map(r => r.amt).join(' ') === '6410 1120.75', 'Bill List: bills (not client invoices), 6,410.00 / 1,120.75', PL['qbo_bill_list.csv']);
ok(PL['qbo_customer_contact_list.csv'].kind === 'customers' && PL['qbo_customer_contact_list.csv'].rows.length === 3 && PL['qbo_customer_contact_list.csv'].rows[0].phone === '(901) 555-0101', 'Customer Contact List: 3 customers, "Phone: " dropped', PL['qbo_customer_contact_list.csv']);
ok(PL['qbo_vendor_contact_list.csv'].kind === 'vendors' && PL['qbo_vendor_contact_list.csv'].rows.length === 2, 'Vendor Contact List: 2 vendors', PL['qbo_vendor_contact_list.csv']);
const TD = PL['qbo_transaction_detail_by_account.csv'];
const inv5001 = TD.rows.filter(r => r.k === 'invoice' && r.num === '5001');
ok(TD.kind === 'transactions' && inv5001.length === 1 && inv5001[0].amt === 25000 && inv5001[0].open === null && TD.rows.find(r => r.k === 'check').amt === 3200 && TD.rows.find(r => r.k === 'expense').acct === 'Business Checking (8832)',
  'Transaction Detail by Account: invoice 5001 once at its 25,000.00 total (not a 18,000 income line), the running Balance is not an open balance, (3,200.00) check, account headings are accounts', TD.rows);
const TL = PL['qbo_transaction_list_by_date.csv'];
ok(TL.kind === 'transactions' && TL.rows.length === 7 && TL.rows.find(r => r.num === 'B-77').k === 'bill' && TL.rows.find(r => r.k === 'expense' && r.amt === 61.5), 'Transaction List by Date: 7 rows, bill / check / credit card expense kinds, -61.50 → 61.50', TL.rows);
/* import as history, the way the office does it (the window, "Import as history" ticked) — nothing may be e-mailed */
const fn0 = B.fn.length, t0 = Date.now();
for (const f of ['qbo_customer_contact_list.csv', 'qbo_vendor_contact_list.csv', 'qbo_invoice_list.csv', 'qbo_bill_list.csv', 'qbo_transaction_detail_by_account.csv']) {
  await q.evaluate(([t, n]) => { window.__qbDone = null; window._gcQbCsvOpen(t, n).then(r => { window.__qbDone = r; }); }, [qb(f), f]);
  await waitFor(B, () => !!document.querySelector('#_jQbOk'), null, 10000);
  const hist = await q.evaluate(() => document.querySelector('#_jQbHist') && document.querySelector('#_jQbHist').checked);
  if (f === 'qbo_invoice_list.csv') ok(hist === true, '"Import as history (no sending)" is ticked by itself for 2025 rows');
  await q.click('#_jQbOk');
  await waitFor(B, () => !!window.__qbDone, null, 20000);
}
await sleep(3000);
const qi = await q.evaluate(() => { const I = window._crm.invoices || window._crm.invs || []; const f = n => I.filter(i => (i.qbNum || i.invNum) === n); return { i5001: f('5001').map(i => ({ amt: i.amt, st: i.status, hist: i.importedHistory, noSend: i.noSend, pid: i.pid })), i5002: f('5002').map(i => ({ st: i.status, hist: i.importedHistory, noSend: i.noSend })), i5003: f('5003').map(i => ({ st: i.status, paid: i.amountPaid })), b77: I.filter(i => i.invNum === 'B-77').map(i => ({ type: i.type, st: i.status })), cust: (window._crm.customers || []).filter(c => /Demo Qbo/.test(c.name)).length, vend: (window._crm.vendors || []).filter(v => /Demo Qbo/.test(v.name)).length }; });
ok(qi.i5001.length === 1 && qi.i5001[0].amt === 25000 && qi.i5001[0].st === 'paid' && qi.i5001[0].hist === true && qi.i5001[0].noSend === true && qi.i5001[0].pid === 'P3', 'invoice 5001: once (Invoice List + Transaction Detail), 25,000, paid, history, never sent, on the customer\'s only job', qi.i5001);
ok(qi.i5002.length === 1 && qi.i5002[0].hist === true && qi.i5002[0].noSend === true && qi.i5003.length === 1 && /^(partial|overdue)$/.test(qi.i5003[0].st) && qi.i5003[0].paid === 7875.5, 'invoice 5002 (open) recorded as history, not sent; 5003 partial: 7,875.50 paid', [qi.i5002, qi.i5003]);
ok(qi.b77.length === 1 && qi.b77[0].type === 'sub' && qi.b77[0].st === 'paid', 'bill B-77 is a vendor bill, paid (open balance 0) — no check drafted for it', qi.b77);
ok(qi.cust === 3 && qi.vend === 2, 'customers and vendors from the contact lists', qi);
const mailCalls = B.fn.slice(fn0).filter(x => x.method !== 'GET' && /send|mail|email|sms|text|resend|notify|remind/i.test(new URL(x.url).pathname + new URL(x.url).search));
const mailKeys = B.posts(t0).filter(x => /mail|email|outbox|sms|notify/i.test(String(x.key1 || (x.keys || []).join(','))));
ok(mailCalls.length === 0 && mailKeys.length === 0, 'QuickBooks history import: no e-mail / text sent, nothing queued', { mailCalls: mailCalls.map(x => x.url).slice(0, 5), mailKeys: mailKeys.map(x => x.key1 || x.keys).slice(0, 5) });
/* the owner's Monthly Bank Check: the old screen points to the bank import; a PDF's lines are checked */
await q.evaluate(() => window._gcOpenBankReconcile());
ok(await waitFor(B, () => !!document.querySelector('#_rcImport') && !!document.querySelector('.gc-stmt-door [data-door="bank"]'), null, 5000), 'Monthly Bank Check says what it does and points to 🏦 Import bank statement');
await q.evaluate(() => document.querySelector('.gc-stmt-door [data-door="bank"]').click());
await waitFor(B, () => !!document.querySelector('.gc-money-imp[data-mode="bank"] [data-c="file"]'), null, 10000);
await loadFile(B, FX + '/regions_bank.pdf');
const T2 = await table(q);
ok(T2.r.length === 4 && T2.x.length === 1 && T2.okTxt, 'Regions PDF: 4 costs (card buy, Zelle to a sub, check, fee) + 1 deposit; totals match', T2);
ok((T2.r.find(x => /T724/.test(x.d)) || {}).job === 'P2', 'a bank line with "PO T724" → that job');
await q.click('.gc-money-imp [data-c="recon"]');
ok(await waitFor(B, () => /Checked 5 bank lines/.test((document.querySelector('.gc-money-imp [data-c="recondone"]') || {}).textContent || ''), null, 5000), 'owner: 🧾 the Monthly Bank Check runs on the PDF\'s lines');
await closeX(q);
ok(B.errs.length === 0, 'owner: no page errors', B.errs.slice(0, 5));
console.log(`\n${pass} passed, ${fail} failed`);
await B.b.close();
try { fs.rmSync(FX, { recursive: true, force: true }); } catch (e) {}
process.exit(fail ? 1 : 0);
