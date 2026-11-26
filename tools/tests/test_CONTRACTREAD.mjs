// test_CONTRACTREAD.mjs <build-dir> — patch CONTRACTREAD (owner 11/26, Clarendon - CSI: "I entered a contract, it should have read the
// contract and took the info out of it for the contract price").
//   · a contract PDF with "Contract Sum … ($123,456.00)" + line items, an insurance limit, a phone number → the empty job's contract is
//     set to 123,456 (a person edit: _fe.contract), contractFrom names the file; the import result says "💲 Contract price read";
//   · a schedule of values .xlsx with a Total row → an empty job is set to the total;
//   · a job already at $100,000 with an agreement saying $112,500 → NOT overwritten; its page shows "📄 … says $112,500.00 — the job
//     shows $100,000.00 · ✅ Use · Keep"; Keep leaves it; on another job ✅ Use sets it;
//   · a subcontract agreement's sum is never used; a file with no labelled amount sets nothing; a needs-a-job contract sets the job it
//     is placed on; no page errors, no dialogs.
// Usage: node test_CONTRACTREAD.mjs <dir with index.html>  (GC_HARNESS, GC_JSZIP, GC_XLSX as in test_ZIPSCHED.mjs)
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const SP = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const JSZIP_FILE = process.env.GC_JSZIP || SP + '/jsz/package/dist/jszip.min.js';
const XLSX_FILE = process.env.GC_XLSX || SP + '/xlsxp/package/dist/xlsx.full.min.js';
const H = await import(pathToFileURL(HARNESS).href);
const JSZip = require(JSZIP_FILE), XLSX = require(XLSX_FILE);
const build = process.argv[2];
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const NICK = Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].name === 'Nick Gray');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
H.resetCloud();
H.cset('users', [{ id: 'u1', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true }]);
const P = (id, name, address, po, contract) => ({ id, name, client: 'Sample Client ' + id, address, po, contract, pm: 'Nick Gray', status: 'Active', updatedAt: ago(1) });
H.cset('projects', [
  P('P1', 'Clarendon - CSI', '123 Demo St, Memphis, TN', 'P714', ''),
  P('P2', 'Roof - Sample', '202 Demo Ave, Memphis, TN', 'K791', 100000),
  P('P3', 'Office TI - Sample', '789 Walnut Dr, Memphis, TN', 'H303', 0),
  P('P4', 'Clinic - Sample', '44 Birch Rd, Memphis, TN', 'H404', '50000'),
  P('P5', 'Deck - Sample', '55 Maple Ln, Memphis, TN', 'H505', ''),
  P('P6', 'Store - Sample', '66 Cedar Ct, Memphis, TN', 'H606', '')]);
H.cset('projectDocs', []); H.cset('schedule', []); H.cset('leads', []);

function pdfLines(lines){
  const st = 'BT /F1 10 Tf 14 TL 72 740 Td ' + lines.map(l => '(' + l.replace(/[()]/g, m => '\\' + m) + ') Tj 0 -14 Td').join(' ') + ' ET';
  return Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + st.length + '>>\nstream\n' + st + '\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
}
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Schedule of Values'], ['Item', 'Description', 'Scheduled Value'], [1, 'General conditions', 12000], [2, 'Framing', 48500], ['', 'Total', 60500]]), 'SOV');
const z = new JSZip();
z.file('123 Demo St/Contracts/Prime Contract.pdf', pdfLines(['STANDARD FORM OF AGREEMENT BETWEEN OWNER AND CONTRACTOR', 'Owner phone (901) 555-1234   Date 11/02/2026',
  'ARTICLE 4 CONTRACT SUM', 'The Owner shall pay the Contractor the Contract Sum of One Hundred Twenty-Three Thousand Four Hundred Fifty-Six Dollars ($123,456.00), subject to additions and deductions.',
  'Unit prices: drywall patch $4.50 per SF', 'Line item 1 Demolition $12,000.00', 'Line item 2 Framing $48,500.00',
  'Insurance: general liability limit $1,000,000 per occurrence, $2,000,000 aggregate', 'Liquidated damages $500.00 per day']));
z.file('123 Demo St/Subcontract Agreement - Sample Drywall.pdf', pdfLines(['SUBCONTRACT AGREEMENT', 'Contract Sum: $9,999,999.00']));
z.file('PO K791/Agreement.pdf', pdfLines(['AGREEMENT', 'Contract Price: $112,500.00']));
z.file('789 Walnut Dr/Schedule of Values.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
z.file('44 Birch Rd/Award Letter - contract.pdf', pdfLines(['NOTICE OF AWARD', 'Award Amount: $75,000.00']));
z.file('55 Maple Ln/Contract notes.pdf', pdfLines(['Contract notes from the walk', 'Item 1 roof patch $5,000.00', 'Item 2 gutters $1,200.00']));
z.file('misc/Contract - signed.pdf', pdfLines(['CONSTRUCTION CONTRACT', 'Total Contract Amount: $45,000.00']));
const ZIPBUF = await z.generateAsync({ type: 'nodebuffer' });

const OPEN = [];
try {
  const a = await H.computer('nick', { build }); OPEN.push(a);
  const ACAO = { 'access-control-allow-origin': '*' };
  await a.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/3\.10\.1\/jszip\.min\.js/, r => r.fulfill({ path: JSZIP_FILE, contentType: 'application/javascript', headers: ACAO }));
  await a.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/0\.18\.5\/xlsx\.full\.min\.js/, r => r.fulfill({ path: XLSX_FILE, contentType: 'application/javascript', headers: ACAO }));
  await H.signIn(a, NICK, 9000);
  await H.waitFor(a, () => (window._crm && window._crm.projects || []).length >= 6 && !!window._gcZipImport && typeof window._gcxPatchJob === 'function', null, 45000);
  await sleep(1500);
  const job = id => a.ev(id => { const p = (window._crm.projects || []).find(x => x.id === id) || {}; return { contract: p.contract, from: p.contractFrom, fe: p._fe && p._fe.contract }; }, id);

  /* unit: the reader */
  const u = await a.ev(() => {
    const Z = window._gcZipImport;
    return { phoneOnly: Z.contractFromText('Call (901) 555-1234 on 11/02/2026 about 12345 Main'), limits: Z.contractFromText('Insurance limit Contract Sum $1,000,000 per occurrence'),
      next: Z.contractFromText('Grand Total\n$ 250,000.00'), largest: Z.contractFromText('Total Base Bid: $90,000.00\nGrand Total: $97,500.00'),
      rows: Z.contractFromRows([['Item', 'Value'], ['Roof', 1000], ['Grand Total', '$7,500.00']], false) };
  });
  ok(u.phoneOnly === null && u.limits === null, 'phone numbers, dates and insurance limits are never a contract price', u);
  ok(u.next && u.next.amount === 250000 && u.largest.amount === 97500 && u.rows && u.rows.amount === 7500, 'amount on the next line; the largest labelled total; a sheet row', u);

  await a.ev(() => window._gcZipImport.open());
  await a.page().setInputFiles('#gczi-ov [data-zi-in="files"]', { name: 'Clarendon.zip', mimeType: 'application/zip', buffer: ZIPBUF });
  await H.waitFor(a, () => { const s = window._gcZipImport.state(); return s && s.rows.length && !document.querySelector('#gczi-ov [data-zi="msg"]').textContent ? s : null; }, null, 30000);
  const e0 = a.errs.length;
  await a.ev(() => document.querySelector('#gczi-ov [data-zi="go"]').click());
  const sum = await H.waitFor(a, () => window._gcZipImport.state().done ? document.querySelector('#gczi-ov .sum').innerText : null, null, 60000);
  console.log('    ' + String(sum).replace(/\n/g, ' | '));
  ok(/💲 Contract price read: Clarendon - CSI \$123,456\.00 \(from Prime Contract\.pdf\)/.test(sum), 'result: "💲 Contract price read: Clarendon - CSI $123,456.00 (from Prime Contract.pdf)"', sum);
  const j1 = await job('P1');
  ok(+j1.contract === 123456 && j1.from && j1.from.file === 'Prime Contract.pdf' && j1.fe && +j1.fe.v === 123456, 'P1 (empty): contract 123,456 — a person edit (SYNC-A _fe.contract), contractFrom = the file (not the sub agreement, not a line item)', j1);
  const j3 = await job('P3');
  ok(+j3.contract === 60500 && j3.from && j3.from.file === 'Schedule of Values.xlsx', 'P3 ($0): the schedule of values Total, 60,500', j3);
  const j2 = await job('P2'), j4 = await job('P4'), j5 = await job('P5');
  ok(+j2.contract === 100000 && +j4.contract === 50000, 'P2 ($100,000) and P4 ($50,000): never overwritten', { j2, j4 });
  ok(/Roof - Sample: Agreement\.pdf says \$112,500\.00 — the job shows \$100,000\.00/.test(sum), 'result: the job that already has a contract → "says $112,500.00 — the job shows $100,000.00"', sum);
  ok(j5.contract === '' && !j5.from, 'P5: a file with no labelled amount → nothing', j5);
  await sleep(3000);
  const LOG = (H.cget('gc_zip_import') || [])[0] || {};
  ok(LOG.counts && LOG.counts.contractsSet === 2 && LOG.counts.contractsToCheck === 2 && (LOG.contractReads || []).length === 4, 'the log: 2 set, 2 to check', { c: LOG.counts, r: (LOG.contractReads || []).map(x => [x.job, x.amount, x.state]) });
  ok(await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 40000) { const p = (H.cget('projects') || []).find(x => x.id === 'P1'); if (p && +p.contract === 123456) return true; await sleep(500); } return false; })(), 'the contract reached the cloud job list');

  /* the job page of P2: the inline note → Keep */
  await a.ev(() => { document.getElementById('gczi-ov').remove(); });
  const go = async id => { for (let k = 0; k < 5; k++) { await a.ev(id => { window._gcOpenProject = { id }; window._setView('projects'); window._navToJob(id); }, id); if (await H.waitFor(a, id => window._gcOpenProject && window._gcOpenProject.id === id && localStorage.getItem('grayco_view') === 'projects' && /← All Projects/.test((document.querySelector('main') || {}).innerText || ''), id, 4000)) return; } };
  await go('P2');
  const note = await H.waitFor(a, () => { const el = document.getElementById('gc-zipct'); return el && el.getClientRects().length ? { t: el.innerText, prev: (el.previousElementSibling && el.previousElementSibling.innerText || '').slice(0, 200) } : null; }, null, 15000);
  console.log('    note: ' + JSON.stringify(note));
  ok(note && /Agreement\.pdf says \$112,500\.00 — the job shows \$100,000\.00/.test(note.t) && /✅ Use \$112,500\.00/.test(note.t) && /Keep/.test(note.t), 'P2 page: "📄 Agreement.pdf says $112,500.00 — the job shows $100,000.00 · ✅ Use · Keep"', note);
  await a.ev(() => document.querySelector('#gc-zipct [data-ct-keep]').click());
  await H.waitFor(a, () => !document.querySelector('#gc-zipct [data-ct-keep]'), null, 8000);
  ok(+(await job('P2')).contract === 100000 && !(await a.ev(() => !!document.querySelector('#gc-zipct [data-ct-use]'))), 'Keep: the note goes, the contract stays $100,000');
  /* P4: ✅ Use */
  await go('P4');
  await H.waitFor(a, () => !!document.querySelector('#gc-zipct [data-ct-use]') && /Award Letter/.test(document.getElementById('gc-zipct').innerText), null, 15000);
  await a.ev(() => document.querySelector('#gc-zipct [data-ct-use]').click());
  await H.waitFor(a, () => !document.querySelector('#gc-zipct [data-ct-use]'), null, 8000);
  const j4b = await job('P4');
  ok(+j4b.contract === 75000 && j4b.fe && +j4b.fe.v === 75000, 'P4: ✅ Use sets $75,000 (a person edit)', j4b);
  const after = await a.ev(() => (document.getElementById('gc-zipct') || {}).innerText || '');
  ok(/Contract \$75,000\.00 read from Award Letter/.test(after), 'the job keeps a line saying where its contract came from', after);

  /* the needs-a-job contract → placed on P6 → P6 is set */
  await a.ev(() => window._gcZipImport.openPlace(window._gcZipImport.items()[0].b.id));
  const pr = await H.waitFor(a, () => { const r = [...document.querySelectorAll('#gczi-place [data-zp]')].find(x => /Contract - signed/.test(x.textContent)); return r ? r.getAttribute('data-zp') : null; }, null, 8000);
  await a.page().selectOption('#gczi-place [data-zp-job="' + pr + '"]', 'P6');
  await a.ev(id => document.querySelector('#gczi-place [data-zp-go="' + id + '"]').click(), pr);
  await H.waitFor(a, () => !document.querySelector('#gczi-place [data-zp]'), null, 8000);
  await sleep(500);
  const j6 = await job('P6');
  ok(+j6.contract === 45000 && j6.from && j6.from.file === 'Contract - signed.pdf', 'needs-a-job contract placed on P6 → P6 set to $45,000', j6);
  ok(a.errs.length === e0 && a.errs.length === 0, 'no page errors', a.errs.slice(0, 3));
  ok(a.dialogs.length === 0, 'no alert / confirm / prompt', a.dialogs);
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const x of OPEN) await x.close().catch(() => {});
console.log(`CONTRACTREAD ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
